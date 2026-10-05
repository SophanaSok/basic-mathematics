#!/usr/bin/env node
"use strict";
/* Checks on the built site: dist/ must be the source tree's site, page for page, each
   source page taken with its shell written (lib/shell.js), as the build takes it.
   Node built-ins only, no browser. Run after `npm run build`.

   Usage: node tools/check-dist.js [--dist=<dir>] [--only=<check,check>]

   --dist   the build to check (default: dist/ in this repo)
   --only   run just the named checks (the names printed in the first column)

   Same shape as check-static.js: each check is a function (ctx, r) in CHECKS below, one
   line of output per check, exit code 1 on any failure. */

const fs = require("fs");
const path = require("path");

const site = require("./lib/site");
const shell = require("./lib/shell");
const { parse, normText, hash } = require("./lib/html");
const links = require("./lib/links");

const ROOT = site.ROOT;
const opts = site.parseArgs(process.argv.slice(2));
const DIST = path.resolve(ROOT, typeof opts.dist === "string" ? opts.dist : "dist");

/* the scripts of the source tree that a page's bundle is made of, as tree paths */
const SOURCE_DIRS = ["assets", "data"];
function sourceScripts() {
  const out = [];
  SOURCE_DIRS.forEach(d => site.walk(path.join(ROOT, d), p => /\.js$/.test(p), out));
  return out.map(site.rel);
}
/* The copies the build makes for one release (vite.config.ts legacyCopies, the same
   list): every source script at its own path, and the boot script where it was before
   it moved to src/. `at` is the path in dist, `from` the source file it must equal. */
function copies() {
  return sourceScripts().map(rel => ({ at: rel, from: rel })).concat([{ at: "assets/boot.js", from: "src/boot.js" }]);
}

/* Where the bundle goes and how it is named (vite.config.ts, output and bundleNames):
   a page's entry chunk at bundle/pages/<page>.js, every other chunk and stylesheet at
   bundle/<name>.js or .css where <name> is the page kinds that load what is in it
   ("all" for every kind, else the kinds joined with "-" in PAGE_KINDS order), the
   painter at bundle/scenes3d-gl.js, rolldown's runtime under its own name. */
const BUNDLE = "bundle/";
const ENTRY_OF = (page) => BUNDLE + "pages/" + page.replace(/\.html$/i, ".js");
const RUNTIME = BUNDLE + "rolldown-runtime.js";
/* the kinds a chunk or stylesheet bundle/<name>.<ext> says load it, or null for a
   name that is not a set of kinds */
function kindsNamed(file) {
  const name = path.posix.basename(file).replace(/\.(js|css)$/, "");
  const kinds = Object.keys(shell.PAGE_KINDS);
  if (name === "all") return kinds;
  const parts = name.split("-");
  return parts.every(k => kinds.includes(k)) && kinds.filter(k => parts.includes(k)).join("-") === name ? parts : null;
}
/* the page kinds that load each source file, in PAGE_KINDS order: a script by the
   entries that import it (the entry itself counts), a stylesheet by the kinds that link
   it (PAGE_KINDS styles). What vite.config.ts bundleNames reads to name the chunks. */
const ENTRY_IMPORT = /^\s*import\s+["']([^"']+)["']\s*;?\s*$/;
function entryImports(entry) {
  const dir = path.posix.dirname(entry);
  return fs.readFileSync(path.join(ROOT, entry), "utf8").split("\n").map(l => ENTRY_IMPORT.exec(l)).filter(Boolean)
    .map(m => path.posix.normalize(path.posix.join(dir, m[1])));
}
function kindsLoading() {
  const by = {};
  Object.keys(shell.PAGE_KINDS).forEach(kind => {
    const { entry, styles } = shell.PAGE_KINDS[kind];
    [entry].concat(entryImports(entry), styles).forEach(f => { (by[f] = by[f] || []).push(kind); });
  });
  return by;
}

/* The module graph of the built site, read from the chunks themselves: every string
   that names a .js file relative to the chunk ("./x.js", "../y.js") and resolves to a
   file in dist is an edge, whether it is in an `import` statement, an `import()` or
   the list Vite keeps for preloading a dynamic import's dependencies. `sources` of a
   chunk is what its source map says it was built from, as tree paths. */
function moduleGraph(ctx) {
  const files = new Set(ctx.files);
  const edges = {}, sources = {};
  const of = (f) => {
    if (edges[f]) return;
    const text = fs.readFileSync(path.join(DIST, f), "utf8");
    const dir = path.posix.dirname(f);
    edges[f] = [];
    for (const m of text.matchAll(/["'](\.\.?\/[^"'\s]+\.js)["']/g)) {
      const t = path.posix.normalize(path.posix.join(dir, m[1]));
      if (files.has(t) && !edges[f].includes(t)) edges[f].push(t);
    }
    sources[f] = [];
    if (files.has(f + ".map")) {
      const map = JSON.parse(fs.readFileSync(path.join(DIST, f + ".map"), "utf8"));
      /* A source is written relative to the map file and climbs out of the build's
         output directory to the tree ("../../assets/site.js" from bundle/all.js.map).
         Taken relative to the root of dist, what is left after the climb is the tree
         path, wherever this copy of the build sits (--dist may name a directory that is
         not <repo>/dist), so the climb is dropped rather than resolved on disk. */
      (map.sources || []).forEach(s => {
        if (/^\0|^[a-z]+:/.test(s)) return;    /* a virtual module of the bundler */
        const rel = path.posix.normalize(path.posix.join(dir, s)).replace(/^(\.\.\/)+/, "");
        sources[f].push(rel);
      });
    }
    edges[f].forEach(of);
  };
  const reach = (from) => {
    const seen = new Set(), todo = [from];
    while (todo.length) {
      const f = todo.pop();
      if (seen.has(f)) continue;
      seen.add(f);
      of(f);
      edges[f].forEach(t => todo.push(t));
    }
    return Array.from(seen);
  };
  return { reach, sourcesOf: (f) => { of(f); return sources[f]; } };
}

function result() {
  const r = { fails: [], warns: [], notes: [], count: 0 };
  r.fail = (m) => { r.fails.push(m); };
  r.warn = (m) => { r.warns.push(m); };
  r.note = (m) => { r.notes.push(m); };
  return r;
}

/* every file under a directory, as paths relative to it */
function filesUnder(dir) {
  return site.walk(dir, () => true).map(p => path.relative(dir, p).split(path.sep).join("/"));
}

/* "The source" of a page, here and in every message below, is the source page with its
   shell written (lib/shell.js): the whole document the build is handed, which is what
   dist/ has to be. That the shell itself is the one readers have is the `shell` check
   of check-static.js; the two together hold dist/ to the site as it was. */
function buildContext() {
  const ctx = { src: { pages: site.htmlPages(ROOT), docs: {}, text: {} }, dist: { pages: [], docs: {}, text: {} }, chapters: [] };
  ctx.src.pages.forEach(p => {
    const page = site.readPage(ROOT, p);
    ctx.src.text[p] = page.text;
    ctx.src.docs[p] = page.doc;
    if (site.chapterIdOf(ctx.src.docs[p])) ctx.chapters.push(p);
  });
  ctx.dist.pages = site.htmlPages(DIST);
  ctx.dist.pages.forEach(p => {
    ctx.dist.text[p] = fs.readFileSync(path.join(DIST, p), "utf8");
    ctx.dist.docs[p] = parse(ctx.dist.text[p]);
  });
  ctx.files = filesUnder(DIST);
  ctx.graph = moduleGraph(ctx);
  return ctx;
}

/* the one module script of a built page: its tree-relative file, or null and why */
function moduleEntryOf(page, doc) {
  const mods = doc.queryAll("script").filter(s => (s.getAttribute("type") || "").toLowerCase() === "module");
  if (mods.length !== 1) return { file: null, why: mods.length + " module scripts, not one" };
  const file = links.targetOf(page, mods[0].getAttribute("src"));
  return file ? { file, el: mods[0] } : { file: null, why: "the module script's src " + JSON.stringify(mods[0].getAttribute("src")) + " is not a file of the site" };
}

/* the local stylesheets a page links, as tree-relative paths, in order */
function stylesheetsOf(page, doc) {
  return doc.queryAll("link").filter(l => /(^|\s)stylesheet(\s|$)/i.test(l.getAttribute("rel") || ""))
    .map(l => links.targetOf(page, l.getAttribute("href"))).filter(Boolean);
}
/* every <script> of a page, in order, as written: its attributes and, for an inline
   one, its text */
function scriptTagsOf(doc) {
  return doc.queryAll("script").map(s => "<script" + Object.keys(s.attrs).map(k => " " + k + (s.attrs[k] === "" ? "" : "=" + JSON.stringify(s.attrs[k]))).join("") + ">" + normText(s.textContent));
}
const NO_COMMENTS = /\/\*[\s\S]*?\*\//g;
/* url(/…) or @import "/…" in a piece of CSS: a root-absolute reference (not //host/…) */
const CSS_ROOT_ABSOLUTE = /(?:url\(\s*|@import\s+)["']?\/(?!\/)[^"')\s;]*/;
/* where two texts first part, for a message */
function firstDifference(s, d) {
  let i = 0;
  while (i < s.length && s[i] === d[i]) i++;
  return "first difference at character " + i + ": source " + JSON.stringify(s.slice(Math.max(0, i - 30), i + 50)) + ", dist " + JSON.stringify(d.slice(Math.max(0, i - 30), i + 50));
}

/* ------------------------------------------------------------- checks ---- */

/* (a) the same pages at the same paths; .nojekyll for a branch deploy; and nothing else
   in dist but what the site is made of: a page, a copy of a script of assets/ or data/
   or of the boot script (for one release: vite.config.ts legacyScripts), a file of
   public/, a file a built page links (its module script and what it preloads, its
   stylesheets, the icon), a chunk the module graph reaches from a page's script (the GL
   painter is fetched by a dynamic import), a file a built stylesheet names, and the
   source map beside any of those. Anything more was put there by mistake, and
   everything in dist is published. */
function checkPages(ctx, r) {
  const built = new Set(ctx.dist.pages);
  ctx.src.pages.forEach(p => {
    r.count++;
    if (!built.has(p)) r.fail(p + " is in the source tree but not in dist");
  });
  if (!ctx.files.includes(".nojekyll")) r.fail("dist/.nojekyll is missing (public/.nojekyll should have been copied)");

  const known = new Set(ctx.src.pages);
  copies().forEach(c => known.add(c.at));
  const pub = path.join(ROOT, "public");
  site.walk(pub, () => true).forEach(p => known.add(path.relative(pub, p).split(path.sep).join("/")));
  ctx.dist.pages.forEach(page => links.refsOf(ctx.dist.docs[page]).forEach(ref => {
    const f = links.targetOf(page, ref.v);
    if (f) known.add(f);
  }));
  ctx.dist.pages.forEach(page => {
    const entry = moduleEntryOf(page, ctx.dist.docs[page]);
    if (entry.file) ctx.graph.reach(entry.file).forEach(f => known.add(f));
  });
  ctx.files.filter(f => /\.css$/.test(f) && known.has(f)).forEach(f => {
    const css = fs.readFileSync(path.join(DIST, f), "utf8").replace(NO_COMMENTS, "");
    for (const m of css.matchAll(/url\(\s*["']?([^"')\s]+)/g)) {
      const t = links.targetOf(f, m[1]);
      if (t) known.add(t);
    }
  });
  ctx.files.forEach(f => {
    r.count++;
    if (known.has(f) || (/\.map$/.test(f) && known.has(f.slice(0, -4)))) return;
    r.fail("dist has " + f + (/\.html$/i.test(f) ? ", which is not a page of the source tree" : ", which no page of the site is made of"));
  });
}

/* (b) every relative href/src resolves to a file inside dist, and its anchor to an id */
function checkLinks(ctx, r) {
  const files = new Set(ctx.files);
  links.checkLinks({ pages: ctx.dist.pages, docs: ctx.dist.docs, exists: (rel) => files.has(rel) }, r);
}

/* (c) nothing points at the server's root: the site is deployed under a sub-path.
   On the attributes that hold URLs any value starting with one "/" fails; on any other
   attribute, a value that names something in dist's top level ("/assets/…") does. */
const URL_ATTRS = new Set(["href", "src", "srcset", "poster", "action", "formaction", "data", "xlink:href"]);
function checkRootAbsolute(ctx, r) {
  const top = new Set(ctx.files.map(f => f.split("/")[0]));
  const inCss = (css, where) => {
    r.count++;
    const m = CSS_ROOT_ABSOLUTE.exec(css.replace(NO_COMMENTS, ""));
    if (m) r.fail(where + ": " + JSON.stringify(m[0]) + " is a root-absolute path");
  };
  ctx.files.filter(f => /\.css$/.test(f)).forEach(f => inCss(fs.readFileSync(path.join(DIST, f), "utf8"), f));
  ctx.dist.pages.forEach(page => {
    for (const el of ctx.dist.docs[page].elements()) {
      if (el.name === "style") inCss(el.textContent, page + ":" + el.line + ": <style>");
      if (el.hasAttribute("style")) inCss(el.getAttribute("style"), page + ":" + el.line + ": <" + el.name + " style>");
      Object.keys(el.attrs).forEach(name => {
        const values = name === "srcset" ? el.attrs[name].split(",").map(s => s.trim()) : [el.attrs[name]];
        values.forEach(v => {
          r.count++;
          if (!/^\/(?!\/)/.test(v)) return;
          const first = /^\/([^\/?#\s]*)/.exec(v)[1];
          if (URL_ATTRS.has(name) || top.has(first)) {
            r.fail(page + ":" + el.line + ": <" + el.name + " " + name + "=" + JSON.stringify(v) + "> is a root-absolute path");
          }
        });
      });
    }
  });
}

/* (d) the build may rewrite a page's <head>; what is inside <main> must come through
   untouched (lesson.js and the exercise keys depend on it). Compared as the text from
   "<main" to "</main>", whitespace-normalised and hashed. */
function mainOf(text) {
  const a = text.indexOf("<main"), b = text.lastIndexOf("</main>");
  return a === -1 || b === -1 ? null : normText(text.slice(a, b));
}
function checkMain(ctx, r) {
  ctx.src.pages.forEach(p => {
    if (!ctx.dist.text[p]) return;       /* reported by `pages` */
    r.count++;
    const s = mainOf(ctx.src.text[p]), d = mainOf(ctx.dist.text[p]);
    if (s === null) { r.fail(p + ": no <main> in the source page"); return; }
    if (d === null) { r.fail(p + ": no <main> in the built page"); return; }
    if (hash(s) !== hash(d) || s.length !== d.length) {
      r.fail(p + ": <main> differs from the source (fingerprint " + hash(d) + " vs " + hash(s) + "); " + firstDifference(s, d));
    }
  });
}

/* and so must everything around <main>: the head (viewport, title, the inline boot
   script, the CDN tags), the attributes of <body>, the top bar, the footer. The head
   and the top bar are not in the source file: lib/shell.js writes them before Vite
   reads the page (vite.config.ts), and the source side here is that same expansion. So
   this fails a build that expands a page differently from the checks (a marker left
   in, an attribute the shell reads left on <body>, a tag Vite moved or dropped), as it
   failed a build that rewrote the page. What the build does rewrite is the links to the
   site's own stylesheets and icon, and the page's one module script, which comes back
   as a built chunk with the preload links of what it imports; `links`, `stylesheets`
   and `scripts` hold those to account, so they are taken out of both sides and the rest
   is compared like <main>. */
function shellOf(text) {
  const a = text.indexOf("<main"), b = text.lastIndexOf("</main>");
  if (a === -1 || b === -1) return null;
  const own = (tag) => {
    const el = parse(tag).query("link");
    return el && /(^|\s)(stylesheet|icon|modulepreload)(\s|$)/i.test(el.getAttribute("rel") || "") && !links.EXTERNAL.test(el.getAttribute("href") || "");
  };
  const mod = (tag) => {
    const el = parse(tag).query("script");
    return el && /^module$/i.test(el.getAttribute("type") || "") && !links.EXTERNAL.test(el.getAttribute("src") || "");
  };
  return normText((text.slice(0, a) + "<main></main>" + text.slice(b + "</main>".length))
    .replace(/<link\b[^>]*>/gi, tag => own(tag) ? "" : tag)
    .replace(/<script\b[^>]*><\/script>/gi, tag => mod(tag) ? "" : tag));
}
function checkShell(ctx, r) {
  ctx.src.pages.forEach(p => {
    if (!ctx.dist.text[p]) return;
    const s = shellOf(ctx.src.text[p]), d = shellOf(ctx.dist.text[p]);
    if (s === null || d === null) return;     /* reported by `main` */
    r.count++;
    if (s !== d) r.fail(p + ": the page around <main> differs from the source (fingerprint " + hash(d) + " vs " + hash(s) + "); " + firstDifference(s, d));
  });
}

/* What a built page runs, and that it is what the source page's shell says.
   The script tags, in order: the boot script inline (its text src/boot.js, as the shell
   wrote it), KaTeX's two deferred CDN tags, and one <script type="module"> whose src is
   the page's own entry chunk, bundle/pages/<page>.js; nothing else, and in particular
   no classic <script src> of the site's own. The module tag's src is the one tag the
   build rewrites, so it is held apart: its attributes but for src are what Vite writes
   for every module script.
   The bundle behind that tag: following the imports from the chunk the tag names, the
   files the chunks were built from (their source maps) are the scripts the kind's entry
   imports (src/entries/<kind>.js, read here), every one and no other; and where the
   scene framework is among them, a dynamic import reaches the WebGL painter. The order
   they run in is not in the chunks (rolldown wraps and calls them in the entry's order
   under strictExecutionOrder, vite.config.ts); the browser checks prove it, by what the
   pages build.
   The names: every chunk reached is bundle/<kinds>.js, and every source file in it is
   imported by exactly the kinds its name says (so the name changes only when what loads
   the file changes, never because the file was edited: a page a browser cached before a
   deploy finds its scripts after it), or the painter's bundle/scenes3d-gl.js, or
   rolldown's runtime; nothing carries a hash.
   No page loads a copy of a source script: nothing a page's tag names and nothing its
   bundle imports is at the path of a file under assets/ or data/. The copies are only
   for pages cached from before the module entries (vite.config.ts legacyScripts), and
   while they are made they are the source byte for byte. */
function checkScripts(ctx, r) {
  const made = copies();
  const isCopy = new Set(made.map(c => c.at));
  const boot = "<script>" + normText(shell.bootScript());
  const katex = shell.KATEX_SCRIPTS.map(s => "<script defer src=" + JSON.stringify(s) + ">");
  const loadedBy = kindsLoading();
  const named = {};     /* chunk -> its name was checked, once */
  ctx.src.pages.forEach(p => {
    if (!ctx.dist.docs[p]) return;
    r.count++;
    const info = shell.pageInfo(fs.readFileSync(path.join(ROOT, p), "utf8"), p);
    const entry = shell.PAGE_KINDS[info.kind].entry;
    const tags = scriptTagsOf(ctx.dist.docs[p]);
    const want = [boot].concat(katex);
    for (let i = 0; i < want.length; i++) {
      if (tags[i] === want[i]) continue;
      r.fail(p + ": script tag " + (i + 1) + " should be " + (i === 0 ? "the boot script inline" : "KaTeX's " + want[i].slice(0, 80)) + ", is " + (tags[i] === undefined ? "missing" : tags[i].slice(0, 120)));
      return;
    }
    const mod = moduleEntryOf(p, ctx.dist.docs[p]);
    if (!mod.file) { r.fail(p + ": " + mod.why); return; }
    const modAttrs = Object.keys(mod.el.attrs).filter(k => k !== "src").map(k => k + (mod.el.attrs[k] === "" ? "" : "=" + mod.el.attrs[k])).join(" ");
    if (modAttrs !== "type=module crossorigin") r.fail(p + ": the module script carries " + JSON.stringify(modAttrs) + ", not type=module crossorigin");
    if (tags.length !== want.length + 1) r.fail(p + ": " + tags.length + " script tags, not " + (want.length + 1) + " (the boot script, KaTeX's two, one module): " + tags.slice(want.length).map(t => t.slice(0, 80)).join(" | "));
    if (mod.file !== ENTRY_OF(p)) r.fail(p + ": its module script is " + mod.file + ", not " + ENTRY_OF(p) + " (a page's entry chunk is named after the page, with no hash)");
    /* the bundle, and that it is the entry's */
    const chunks = ctx.graph.reach(mod.file);
    const staticOnly = chunks.filter(f => f !== BUNDLE + "scenes3d-gl.js");   /* the painter is the one dynamic import */
    const built = new Set();
    staticOnly.forEach(f => ctx.graph.sourcesOf(f).forEach(s => { if (isCopy.has(s)) built.add(s); }));
    const wanted = entryImports(entry);
    const missing = wanted.filter(s => !built.has(s)), extra = Array.from(built).filter(s => !wanted.includes(s));
    if (missing.length || extra.length) r.fail(p + ": the bundle behind " + mod.file + " is not " + entry + "'s" + (missing.length ? "; not in it: " + missing.join(", ") : "") + (extra.length ? "; in it but not imported: " + extra.join(", ") : ""));
    if (wanted.includes("assets/scenes3d.js")) {
      const painter = chunks.filter(f => ctx.graph.sourcesOf(f).includes("assets/scenes3d-gl.js"));
      if (!painter.length) r.fail(p + ": no chunk reached from " + mod.file + " is built from assets/scenes3d-gl.js, which scenes3d.js imports on demand");
      else if (painter.join() !== BUNDLE + "scenes3d-gl.js") r.fail(p + ": the painter, assets/scenes3d-gl.js, is built into " + painter.join(", ") + ", not " + BUNDLE + "scenes3d-gl.js on its own");
    }
    /* the names, each chunk once: what is in it is loaded by the kinds it is named for */
    chunks.filter(f => f !== mod.file && f !== RUNTIME && f !== BUNDLE + "scenes3d-gl.js" && !named[f]).forEach(f => {
      named[f] = true;
      r.count++;
      const kinds = kindsNamed(f);
      if (!kinds || path.posix.dirname(f) !== BUNDLE.slice(0, -1)) { r.fail(f + " is reached from " + p + " but is not named for the page kinds that load it (bundle/all.js, bundle/" + Object.keys(shell.PAGE_KINDS).join("-") + ".js or a subset in that order)"); return; }
      const inside = ctx.graph.sourcesOf(f);
      if (!inside.length) { r.fail(f + " was built from no file of the tree (its source map names none), so nothing says which kinds load it"); return; }
      inside.forEach(s => {
        const by = loadedBy[s] || [];
        if (by.join("-") !== kinds.join("-")) r.fail(f + " holds " + s + ", which " + (by.length ? "the " + by.join(", ") + " kind" + (by.length === 1 ? " loads" : "s load") : "no kind loads") + "; the chunk's name says " + kinds.join(", "));
      });
    });
    const loaded = chunks.concat(links.refsOf(ctx.dist.docs[p]).map(ref => links.targetOf(p, ref.v)).filter(Boolean));
    loaded.filter(f => isCopy.has(f)).forEach(f => r.fail(p + " loads " + f + ", a copy of a source script; a page loads its module entry and nothing else of assets/ or data/"));
  });
  made.forEach(c => {
    r.count++;
    const built = path.join(DIST, c.at);
    if (!fs.existsSync(built)) { r.fail(c.at + " is not in dist (the copies stay one release; vite.config.ts legacyScripts)"); return; }
    if (!fs.readFileSync(path.join(ROOT, c.from)).equals(fs.readFileSync(built))) r.fail(c.at + " in dist is not " + c.from + " byte for byte");
  });
}

/* (e) nothing that looks like a server-side secret is in any built file. The Supabase
   anon key in assets/config.js is public by design and matches none of these.
   service_role in any case, because the usual name of that key is upper-case
   (SUPABASE_SERVICE_ROLE_KEY). And a legacy Supabase key is a JWT, which carries its
   role base64-encoded where no pattern sees it: every JWT-shaped token is decoded, and
   it fails unless its role is the public one, "anon" (or it claims no role at all). */
const SECRETS = [/service_role/i, /sb_secret_/, /whsec_/, /sk-ant-/, /(sk|rk)_(live|test)_[A-Za-z0-9]{10,}/];
const JWT = /eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]*/g;
/* why the payload of a JWT must not be published, or null */
function jwtProblem(payload) {
  const text = Buffer.from(payload, "base64url").toString("utf8");
  let role;
  try { role = JSON.parse(text).role; } catch (e) { /* not JSON: judged as text */ }
  if (typeof role === "string" && role !== "anon") return "a JWT with the role " + JSON.stringify(role);
  return /service_role/i.test(text) ? "a JWT that names service_role" : null;
}
function checkSecrets(ctx, r) {
  ctx.files.forEach(f => {
    r.count++;
    const text = fs.readFileSync(path.join(DIST, f), "latin1");
    SECRETS.forEach(re => {
      const m = re.exec(text);
      if (m) r.fail(f + ": contains " + JSON.stringify(m[0].slice(0, 12) + (m[0].length > 12 ? "…" : "")) + " (matches " + re + ") at byte " + m.index);
    });
    for (const m of text.matchAll(JWT)) {
      const why = jwtProblem(m[1]);
      if (why) r.fail(f + ": contains " + why + " (" + JSON.stringify(m[0].slice(0, 12) + "…") + ") at byte " + m.index);
    }
  });
}

/* (f) how the build split the CSS: the number of distinct stylesheets the pages link,
   and every chapter page linking the same ones (a chapter with its own file would be
   fetched again on every chapter, and is a sign the split went wrong).
   Also the cascade: a page's built stylesheets must carry the rules of its source
   stylesheets in the order the source page links them. Read off the class names only
   one source file uses: in the built CSS, all of one file's must come before all of
   the next file's.
   And the text: each stylesheet a source page links must be, unchanged, inside one of
   the built stylesheets the built page links. The build does not minify CSS for now
   (vite.config.ts says why), and this is what notices if it starts to.
   And the link itself: rel and href, as the source writes it. Vite adds `crossorigin`,
   which vite.config.ts takes off again, so the link in dist is the source's but for
   the file it names. */
function checkStylesheets(ctx, r) {
  const all = new Set();
  const per = {};
  ctx.dist.pages.forEach(p => { per[p] = stylesheetsOf(p, ctx.dist.docs[p]); per[p].forEach(f => all.add(f)); });
  ctx.dist.pages.forEach(p => ctx.dist.docs[p].queryAll("link").forEach(l => {
    if (!/(^|\s)stylesheet(\s|$)/i.test(l.getAttribute("rel") || "") || !links.targetOf(p, l.getAttribute("href"))) return;
    r.count++;
    const more = Object.keys(l.attrs).filter(a => a !== "rel" && a !== "href");
    if (more.length) r.fail(p + ":" + l.line + ": the link to " + l.getAttribute("href") + " carries " + more.join(", ") + "; the source's links are rel and href only");
  }));
  r.note(all.size + " distinct stylesheet(s) linked across " + ctx.dist.pages.length + " pages: " + Array.from(all).sort().join(", "));
  const chapters = ctx.chapters.filter(p => per[p]);
  chapters.forEach(p => {
    r.count++;
    if (per[p].join("\n") !== per[chapters[0]].join("\n")) {
      r.fail(p + " links [" + per[p].join(", ") + "] but " + chapters[0] + " links [" + per[chapters[0]].join(", ") + "]");
    }
  });

  const srcFiles = new Set();
  ctx.src.pages.forEach(p => stylesheetsOf(p, ctx.src.docs[p]).forEach(f => srcFiles.add(f)));
  const classesOf = {}, users = {}, srcText = {};
  srcFiles.forEach(f => {
    srcText[f] = fs.readFileSync(path.join(ROOT, f), "utf8");
    const css = srcText[f].replace(NO_COMMENTS, "");
    classesOf[f] = new Set(css.match(/\.[A-Za-z_][\w-]*/g) || []);
    classesOf[f].forEach(c => { users[c] = (users[c] || 0) + 1; });
  });
  const own = {}, rewritten = {};
  srcFiles.forEach(f => { own[f] = new Set(Array.from(classesOf[f]).filter(c => users[c] === 1)); });
  ctx.src.pages.forEach(p => {
    if (!per[p]) return;
    r.count++;
    const builtText = per[p].map(f => { try { return fs.readFileSync(path.join(DIST, f), "utf8"); } catch (e) { return ""; } });
    /* comments out of both sides: a class name in a comment is not a rule */
    const css = builtText.join("\n").replace(NO_COMMENTS, "");
    let last = { file: null, end: -1 };
    for (const f of stylesheetsOf(p, ctx.src.docs[p])) {
      r.count++;
      if (!builtText.some(t => t.includes(srcText[f]))) (rewritten[f] = rewritten[f] || []).push(p);
      let first = Infinity, end = -1, seen = 0;
      own[f].forEach(c => {
        const re = new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w-])", "g");
        let m;
        while ((m = re.exec(css))) { seen++; if (m.index < first) first = m.index; if (m.index > end) end = m.index; }
      });
      if (!own[f].size) { r.note(p + ": " + f + " has no class name of its own, so its place in the cascade is not checked"); continue; }
      if (!seen) { r.fail(p + ": none of the rules of " + f + " are in the built stylesheets [" + per[p].join(", ") + "]"); continue; }
      if (first < last.end) r.fail(p + ": rules of " + f + " come before rules of " + last.file + " in the built stylesheets [" + per[p].join(", ") + "], after them in the source");
      last = { file: f, end };
    }
  });
  Object.keys(rewritten).sort().forEach(f => {
    const pages = rewritten[f];
    r.fail(f + " is not in the built stylesheets as it is in the source (minified or rewritten by the build?): " + pages.length + " page(s), the first " + pages[0] + " [" + per[pages[0]].join(", ") + "]");
  });

  /* and the names: a built stylesheet is bundle/<kinds>.css, and every source
     stylesheet in it is linked by exactly those kinds (PAGE_KINDS), as for the chunks */
  const linkedBy = kindsLoading();
  Array.from(all).sort().forEach(f => {
    r.count++;
    const kinds = kindsNamed(f);
    if (!kinds || path.posix.dirname(f) !== BUNDLE.slice(0, -1)) { r.fail(f + " is not named for the page kinds that link it (bundle/all.css, or the kinds joined with \"-\" in PAGE_KINDS order)"); return; }
    let css;
    try { css = fs.readFileSync(path.join(DIST, f), "utf8"); } catch (e) { return; }      /* reported by `links` */
    const inside = Array.from(srcFiles).filter(s => css.includes(srcText[s]));
    if (!inside.length) { r.fail(f + " holds no source stylesheet as it is written, so nothing says which kinds link it"); return; }
    inside.forEach(s => {
      const by = linkedBy[s] || [];
      if (by.join("-") !== kinds.join("-")) r.fail(f + " holds " + s + ", which the " + by.join(", ") + " kind" + (by.length === 1 ? " links" : "s link") + "; the file's name says " + kinds.join(", "));
    });
  });
}

/* ------------------------------------------------------------- runner ---- */

const CHECKS = [
  { name: "pages", run: checkPages, what: "every source page is in dist at the same path, and no file the site is not made of" },
  { name: "links", run: checkLinks, what: "relative hrefs/srcs in dist resolve inside dist, anchors to ids" },
  { name: "root-absolute", run: checkRootAbsolute, what: "no attribute value, and no url() in the CSS, is a root-absolute path" },
  { name: "main", run: checkMain, what: "<main> of every page is the source's, by fingerprint" },
  { name: "shell", run: checkShell, what: "and so is the page around it, but for its stylesheet, icon and module links" },
  { name: "scripts", run: checkScripts, what: "boot inline, KaTeX, one module entry whose bundle is its kind's imports, each chunk named for the kinds that load it; no copy loaded; copies byte for byte" },
  { name: "secrets", run: checkSecrets, what: "no server-side key in any built file, as text or inside a JWT" },
  { name: "stylesheets", run: checkStylesheets, what: "chapter pages share their stylesheets; source CSS unchanged, cascade in source order, each file named for the kinds that link it" }
];

function main() {
  const t0 = Date.now();
  if (!fs.existsSync(path.join(DIST, "index.html"))) { console.error("FAIL  setup: no build in " + DIST + " — run `npm run build` first"); process.exit(1); }
  let ctx;
  try { ctx = buildContext(); }
  catch (e) { console.error("FAIL  setup: " + e.message); process.exit(1); }
  const only = opts.only ? String(opts.only).split(",") : null;
  const list = CHECKS.filter(c => !only || only.includes(c.name));
  if (!list.length) { console.error("no such check; available: " + CHECKS.map(c => c.name).join(", ")); process.exit(2); }
  let anyFail = false, anyWarn = false;
  list.forEach(c => {
    const r = result();
    try { c.run(ctx, r); } catch (e) { r.fail("check crashed: " + (e.stack || e.message)); }
    const status = r.fails.length ? "FAIL" : r.warns.length ? "WARN" : "PASS";
    if (status === "FAIL") anyFail = true;
    if (r.warns.length) anyWarn = true;
    console.log(status.padEnd(5) + " " + c.name.padEnd(14) + " " + String(r.count).padStart(5) + "  " + c.what);
    r.notes.forEach(n => console.log("        · " + n));
    r.fails.forEach(m => console.log("        ✗ " + m));
    r.warns.forEach(m => console.log("        ! " + m));
  });
  const where = site.rel(DIST);
  console.log((anyFail ? "FAILED" : anyWarn ? "passed with warnings" : "all passed") + " in " + ((Date.now() - t0) / 1000).toFixed(1) + "s (" + (where && !where.startsWith("..") ? where : DIST) + "/, " + ctx.files.length + " files)");
  process.exit(anyFail ? 1 : 0);
}

if (require.main === module) main();
module.exports = { CHECKS };
