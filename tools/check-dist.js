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
const vendor = require("./lib/vendor");
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
/* the TypeScript modules under src/ that an entry may import as well (src/ui/: the
   settings sheet), their tests and type declarations aside */
function typedModules() {
  const out = [];
  site.walk(path.join(ROOT, "src"), p => /\.ts$/.test(p) && !/\.(test|d)\.ts$/.test(p), out);
  return out.map(site.rel);
}
/* and the HUD's modules, plain .js under src/hud/ (the HUD script inlines two of them;
   every entry imports all three) */
function hudModules() {
  const out = [];
  site.walk(path.join(ROOT, "src", "hud"), p => /\.js$/.test(p), out);
  return out.map(site.rel);
}
/* The paths the release before the module entries copied the scripts to, so a page
   cached from before that deploy still found them: every source script at its own path
   and the boot script where it was. That release is over, and nothing may be there. */
function formerCopies() {
  return sourceScripts().concat(["assets/boot.js"]);
}
const IN_NODE_MODULES = /(^|\/)node_modules\//;

/* Where the bundle goes and how it is named (vite.config.ts, output and bundleNames):
   a page's entry chunk at bundle/pages/<page>.js, every other chunk and stylesheet at
   bundle/<name>.js or .css where <name> is the page kinds that load what is in it
   ("all" for every kind, else the kinds joined with "-" in PAGE_KINDS order), the chunks
   fetched on demand under their modules' own names (ON_DEMAND), rolldown's runtime
   under its own name. */
const BUNDLE = "bundle/";
const ENTRY_OF = (page) => BUNDLE + "pages/" + page.replace(/\.html$/i, ".js");
const RUNTIME = BUNDLE + "rolldown-runtime.js";
/* The chunks a dynamic import makes, each under its module's name: the WebGL painter,
   which scenes3d.js imports when a scene nears the screen; Three.js, which
   three-loader.js imports when a scene or the course map does, through
   src/vendor/three.js; and supabase-js, which account.js imports when it first wants a
   client (on the account page, or where a session is stored), through
   src/vendor/supabase.js. `by` is the importer: a page whose entry imports it must reach
   the chunk through the import(), and no page's HTML may name the chunk, since only that
   import() is to fetch it (a signed-out reader on an ordinary page never downloads
   supabase-js, and a page with no 3D never downloads Three.js; tools/game/account.test.js
   and the pages suite of check-browser.js watch the requests). */
const ON_DEMAND = [
  { chunk: BUNDLE + "scenes3d-gl.js", module: "assets/scenes3d-gl.js", by: "assets/scenes3d.js" },
  { chunk: BUNDLE + "three.js", module: vendor.DIR + "/three.js", by: "assets/three-loader.js" },
  { chunk: BUNDLE + "supabase.js", module: vendor.DIR + "/supabase.js", by: "assets/account.js" }
];
const onDemand = (f) => ON_DEMAND.some(d => d.chunk === f);
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
   it (the vendor stylesheets every page links, then PAGE_KINDS styles), and a file from
   node_modules/ by the vendor module that brings it in (lib/vendor.js). What
   vite.config.ts bundleNames reads to name the chunks. */
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
    [entry].concat(entryImports(entry), shell.VENDOR_STYLES, styles).forEach(f => { (by[f] = by[f] || []).push(kind); });
  });
  /* throws, with the reason, for a node_modules file no vendor module brings in */
  return (f) => IN_NODE_MODULES.test(f) ? by[vendor.vendorOf(f).file] : by[f];
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
   in dist but what the site is made of: a page, a file of public/, a file a built page
   links (its module script and what it preloads, its stylesheets, the icon), a chunk the
   module graph reaches from a page's script (the GL painter and supabase-js are fetched
   by dynamic imports), a file a built stylesheet names (the fonts), the licence notice
   the build writes beside the bundle (lib/vendor.js NOTICE; `licences` holds its text),
   and the source map beside any of those. Anything more was put there by mistake, and
   everything in dist is published. */
function checkPages(ctx, r) {
  const built = new Set(ctx.dist.pages);
  ctx.src.pages.forEach(p => {
    r.count++;
    if (!built.has(p)) r.fail(p + " is in the source tree but not in dist");
  });
  if (!ctx.files.includes(".nojekyll")) r.fail("dist/.nojekyll is missing (public/.nojekyll should have been copied)");

  const known = new Set(ctx.src.pages);
  known.add(vendor.NOTICE);
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

/* every url() and @import of a piece of CSS: [{ ref, v }] with ref the text matched */
function cssRefs(css) {
  return Array.from(css.replace(NO_COMMENTS, "").matchAll(/(?:url\(\s*|@import\s+(?:url\(\s*)?)["']?([^"')\s;]+)/g)).map(m => ({ ref: m[0], v: m[1] }));
}

/* (b) every relative href/src resolves to a file inside dist, and its anchor to an id;
   and so does every url() in a built stylesheet (a font file the fonts' and KaTeX's
   rules name, relative to the stylesheet, so that it resolves from a page at any depth).
   A url() that is not a path (data:, another server) is `offline`'s. */
function checkLinks(ctx, r) {
  const files = new Set(ctx.files);
  links.checkLinks({ pages: ctx.dist.pages, docs: ctx.dist.docs, exists: (rel) => files.has(rel) }, r);
  ctx.files.filter(f => /\.css$/.test(f)).forEach(f => {
    cssRefs(fs.readFileSync(path.join(DIST, f), "utf8")).forEach(({ ref, v }) => {
      if (links.EXTERNAL.test(v)) return;
      r.count++;
      const t = links.targetOf(f, v);
      if (/^\//.test(v)) r.fail(f + ": " + JSON.stringify(ref) + " is a root-absolute path");
      else if (!t || !files.has(t)) r.fail(f + ": " + JSON.stringify(ref) + " -> " + t + " does not exist in dist");
    });
  });
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
   script), the attributes of <body>, the top bar, the footer. The head
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
   wrote it), one <script type="module"> whose src is the page's own entry chunk,
   bundle/pages/<page>.js, and after the top bar the HUD script inline (src/hud/, as the
   shell wrote it); nothing else, and in particular no classic <script src>, of
   the site's own or anyone's. The module tag's src is the one tag the build rewrites, so
   it is held apart: its attributes but for src are what Vite writes for every module
   script.
   The bundle behind that tag: following the imports from the chunk the tag names, the
   files of the tree the chunks were built from (their source maps) are the scripts the
   kind's entry imports (src/entries/<kind>.js, read here), every one and no other, and
   every file from node_modules/ among them is brought in by a vendor module the entry
   imports (lib/vendor.js: KaTeX by src/vendor/katex.js). Where the importer of a module
   fetched on demand is among them, a dynamic import reaches that module's chunk
   (ON_DEMAND: the WebGL painter, Three.js, supabase-js). The order they run in is not in the
   chunks (rolldown wraps and calls them in the entry's order under strictExecutionOrder,
   vite.config.ts); the browser checks prove it, by what the pages build.
   The names: every chunk reached is bundle/<kinds>.js, and every file in it is loaded
   by exactly the kinds its name says (so the name changes only when what loads the file
   changes, never because the file was edited: a page a browser cached before a deploy
   finds its scripts after it), or one of ON_DEMAND, or rolldown's runtime; nothing
   carries a hash.
   Each on-demand chunk, once: built from its module and, for a vendor module, the files
   of its packages, and nothing else; and named by no page's HTML, since only the import()
   is to fetch it.
   No page names a source script by its own path, and the copies the release of the module
   entries made at those paths are gone: nothing is at assets/<script>.js, data/…, or
   assets/boot.js (OPERATIONS.md, "Scripts"). */
function checkScripts(ctx, r) {
  const sources = new Set(sourceScripts().concat(typedModules(), hudModules()));
  const ofTree = (s) => sources.has(s) || s.startsWith(vendor.DIR + "/");    /* what an entry can import */
  const boot = "<script>" + normText(shell.bootScript());
  const hudTag = "<script>" + normText(shell.hudScript());
  const loadedBy = kindsLoading();
  const named = {};     /* chunk -> its name was checked, once */
  ctx.src.pages.forEach(p => {
    if (!ctx.dist.docs[p]) return;
    r.count++;
    const info = shell.pageInfo(fs.readFileSync(path.join(ROOT, p), "utf8"), p);
    const entry = shell.PAGE_KINDS[info.kind].entry;
    const tags = scriptTagsOf(ctx.dist.docs[p]);
    if (tags[0] !== boot) { r.fail(p + ": script tag 1 should be the boot script inline, is " + (tags[0] === undefined ? "missing" : tags[0].slice(0, 120))); return; }
    const mod = moduleEntryOf(p, ctx.dist.docs[p]);
    if (!mod.file) { r.fail(p + ": " + mod.why); return; }
    const modAttrs = Object.keys(mod.el.attrs).filter(k => k !== "src").map(k => k + (mod.el.attrs[k] === "" ? "" : "=" + mod.el.attrs[k])).join(" ");
    if (modAttrs !== "type=module crossorigin") r.fail(p + ": the module script carries " + JSON.stringify(modAttrs) + ", not type=module crossorigin");
    if (tags.length !== 3) r.fail(p + ": " + tags.length + " script tags, not 3 (the boot script, one module, the HUD script): " + tags.slice(1).map(t => t.slice(0, 80)).join(" | "));
    else if (tags[2] !== hudTag) r.fail(p + ": script tag 3 should be the HUD script inline (tools/lib/shell.js hudScript), is " + tags[2].slice(0, 120));
    if (mod.file !== ENTRY_OF(p)) r.fail(p + ": its module script is " + mod.file + ", not " + ENTRY_OF(p) + " (a page's entry chunk is named after the page, with no hash)");
    /* the bundle, and that it is the entry's */
    const chunks = ctx.graph.reach(mod.file);
    const staticOnly = chunks.filter(f => !onDemand(f));
    const built = new Set(), foreign = [];
    staticOnly.forEach(f => ctx.graph.sourcesOf(f).forEach(s => { if (ofTree(s)) built.add(s); else if (IN_NODE_MODULES.test(s)) foreign.push(s); }));
    const wanted = entryImports(entry);
    const missing = wanted.filter(s => !built.has(s)), extra = Array.from(built).filter(s => !wanted.includes(s));
    if (missing.length || extra.length) r.fail(p + ": the bundle behind " + mod.file + " is not " + entry + "'s" + (missing.length ? "; not in it: " + missing.join(", ") : "") + (extra.length ? "; in it but not imported: " + extra.join(", ") : ""));
    const strangers = [];
    foreign.forEach(s => {
      let by;
      try { by = vendor.vendorOf(s).file; } catch (e) { strangers.push(e.message); return; }
      if (!wanted.includes(by)) strangers.push(s + " (" + by + " brings it in, and the entry does not import that)");
    });
    if (strangers.length) r.fail(p + ": the bundle behind " + mod.file + " holds files from node_modules/ that " + entry + " does not account for: " + strangers.join("; "));
    ON_DEMAND.filter(d => wanted.includes(d.by)).forEach(d => {
      const where = chunks.filter(f => ctx.graph.sourcesOf(f).includes(d.module));
      if (!where.length) r.fail(p + ": no chunk reached from " + mod.file + " is built from " + d.module + ", which " + d.by + " imports on demand");
      else if (where.join() !== d.chunk) r.fail(p + ": " + d.module + " is built into " + where.join(", ") + ", not " + d.chunk + " on its own");
    });
    /* the names, each chunk once: what is in it is loaded by the kinds it is named for */
    chunks.filter(f => f !== mod.file && f !== RUNTIME && !onDemand(f) && !named[f]).forEach(f => {
      named[f] = true;
      r.count++;
      const kinds = kindsNamed(f);
      if (!kinds || path.posix.dirname(f) !== BUNDLE.slice(0, -1)) { r.fail(f + " is reached from " + p + " but is not named for the page kinds that load it (bundle/all.js, bundle/" + Object.keys(shell.PAGE_KINDS).join("-") + ".js or a subset in that order)"); return; }
      const inside = ctx.graph.sourcesOf(f);
      if (!inside.length) { r.fail(f + " was built from no file of the tree (its source map names none), so nothing says which kinds load it"); return; }
      inside.forEach(s => {
        let by;
        try { by = loadedBy(s) || []; } catch (e) { r.fail(f + " holds " + s + ": " + e.message); return; }
        if (by.join("-") !== kinds.join("-")) r.fail(f + " holds " + s + ", which " + (by.length ? "the " + by.join(", ") + " kind" + (by.length === 1 ? " loads" : "s load") : "no kind loads") + "; the chunk's name says " + kinds.join(", "));
      });
    });
    const refs = links.refsOf(ctx.dist.docs[p]).map(ref => links.targetOf(p, ref.v)).filter(Boolean);
    refs.filter(f => sources.has(f) || f === "assets/boot.js").forEach(f => r.fail(p + " loads " + f + ", a source script by its own path; a page loads its module entry and nothing else of assets/ or data/"));
    refs.filter(onDemand).forEach(f => r.fail(p + " names " + f + ", which only the import() of " + ON_DEMAND.find(d => d.chunk === f).by + " is to fetch; a signed-out reader on an ordinary page must not download it"));
  });
  /* the on-demand chunks, once each */
  ON_DEMAND.forEach(d => {
    r.count++;
    if (!ctx.files.includes(d.chunk)) { r.fail(d.chunk + " is not in dist; " + d.by + " imports " + d.module + " on demand, so the build makes it a chunk under that name"); return; }
    const inside = ctx.graph.sourcesOf(d.chunk);
    if (!inside.includes(d.module)) r.fail(d.chunk + " is not built from " + d.module + " (its source map names " + inside.join(", ") + ")");
    const strays = inside.filter(s => {
      if (s === d.module) return false;
      if (!IN_NODE_MODULES.test(s) || !d.module.startsWith(vendor.DIR + "/")) return true;
      try { return vendor.vendorOf(s).file !== d.module; } catch (e) { return true; }
    });
    if (strays.length) r.fail(d.chunk + " holds more than " + d.module + (d.module.startsWith(vendor.DIR + "/") ? " and the files of its packages" : "") + ": " + strays.join(", "));
  });
  /* the copies are gone */
  formerCopies().forEach(f => {
    r.count++;
    if (ctx.files.includes(f)) r.fail("dist has " + f + ", a copy of a source script at its own path; the release that kept the copies for cached pages is over (OPERATIONS.md, \"Scripts\"), and the built pages name only bundle/");
  });
}

/* (e) nothing a page needs comes from another server. Every <script src>, every <link
   href> (stylesheets, module preloads, the icon; a preconnect or dns-prefetch names
   another server by definition) and every url() or @import in a built stylesheet (the
   fonts) names a file of dist, which `links` then resolves; a data: URL fails too, since
   every font is a file (vite.config.ts assetsInlineLimit). Links in the content
   (<a href>) to other sites are the author's and are not touched. What a script fetches
   is not a tag on the page: Three.js is the bundle's own chunk (ON_DEMAND), and the
   browser checks fail a page on any request to another server (lib/browser.js). */
function checkOffline(ctx, r) {
  ctx.dist.pages.forEach(page => {
    const doc = ctx.dist.docs[page];
    doc.queryAll("script").forEach(s => {
      r.count++;
      const src = s.getAttribute("src");
      if (src !== null && links.EXTERNAL.test(src)) r.fail(page + ":" + s.line + ": <script src=" + JSON.stringify(src) + "> comes from another server");
    });
    doc.queryAll("link").forEach(l => {
      r.count++;
      const rel = (l.getAttribute("rel") || "").toLowerCase(), href = l.getAttribute("href") || "";
      if (/(^|\s)(preconnect|dns-prefetch)(\s|$)/.test(rel)) r.fail(page + ":" + l.line + ": <link rel=" + JSON.stringify(rel) + " href=" + JSON.stringify(href) + "> names another server");
      else if (links.EXTERNAL.test(href)) r.fail(page + ":" + l.line + ": <link rel=" + JSON.stringify(rel) + " href=" + JSON.stringify(href) + "> comes from another server");
    });
  });
  ctx.files.filter(f => /\.css$/.test(f)).forEach(f => {
    const css = fs.readFileSync(path.join(DIST, f), "utf8");
    cssRefs(css).forEach(({ ref, v }) => {
      r.count++;
      if (links.EXTERNAL.test(v) && !/^data:/i.test(v)) r.fail(f + ": " + JSON.stringify(ref) + " comes from another server");
    });
    /* a font as a data: URL would be downloaded by every page inside the stylesheet; the
       site's own data: URLs (the tick and cross marks in src/styles/tokens.css) are not fonts */
    for (const face of css.replace(NO_COMMENTS, "").matchAll(/@font-face\s*\{[^}]*\}/g)) {
      cssRefs(face[0]).forEach(({ ref, v }) => {
        r.count++;
        if (/^data:/i.test(v)) r.fail(f + ": " + JSON.stringify(ref.slice(0, 60) + "…") + " is a font inlined into the stylesheet; every font is a file of dist (vite.config.ts assetsInlineLimit)");
      });
    }
  });
}

/* (h) nothing that looks like a server-side secret is in any built file. The Supabase
   anon key in assets/config.js is public by design and matches none of these.
   Each pattern is the shape of a key, a prefix and the body that follows it, not the
   prefix alone: supabase-js, now in the bundle, names the prefixes of its own keys
   (`sb_secret_`, in the code that refuses one) and says "service_role" in its doc
   comments, which the source map carries; a key is a prefix with a body after it. The
   service-role key is named in any case, because the usual name of that key is
   upper-case (SUPABASE_SERVICE_ROLE_KEY), and only where something key-like is assigned
   to it. And a legacy Supabase key is a JWT, which carries its role base64-encoded where
   no pattern sees it: every JWT-shaped token is decoded, and it fails unless its role is
   the public one, "anon" (or it claims no role at all). */
const SECRETS = [
  /service_role\w*["'`]?\s*[=:]\s*["'`]?[A-Za-z0-9._-]{16,}/i,
  /sb_secret_[A-Za-z0-9_-]{16,}/,
  /whsec_[A-Za-z0-9]{16,}/,
  /sk-ant-[A-Za-z0-9_-]{16,}/,
  /(sk|rk)_(live|test)_[A-Za-z0-9]{10,}/
];
const JWT = /eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]*/g;
/* why the payload of a JWT must not be published, or null */
function jwtProblem(payload) {
  const text = Buffer.from(payload, "base64url").toString("utf8");
  let role;
  try { role = JSON.parse(text).role; } catch (e) { /* not JSON: judged as text */ }
  if (typeof role === "string" && role !== "anon") return "a JWT with the role " + JSON.stringify(role);
  return /service_role/i.test(text) ? "a JWT that names service_role" : null;
}
/* every secret-shaped thing in a text, as messages (checks.test.js holds the patterns
   to a real key of each kind, and to supabase-js's own text) */
function secretsIn(text) {
  const out = [];
  SECRETS.forEach(re => {
    const m = re.exec(text);
    if (m) out.push("contains " + JSON.stringify(m[0].slice(0, 12) + (m[0].length > 12 ? "…" : "")) + " (matches " + re + ") at byte " + m.index);
  });
  for (const m of text.matchAll(JWT)) {
    const why = jwtProblem(m[1]);
    if (why) out.push("contains " + why + " (" + JSON.stringify(m[0].slice(0, 12) + "…") + ") at byte " + m.index);
  }
  return out;
}
function checkSecrets(ctx, r) {
  ctx.files.forEach(f => {
    r.count++;
    secretsIn(fs.readFileSync(path.join(DIST, f), "latin1")).forEach(m => r.fail(f + ": " + m));
  });
}

/* (f) how the build split the CSS: the number of distinct stylesheets the pages link,
   and every chapter page linking the same ones (a chapter with its own file would be
   fetched again on every chapter, and is a sign the split went wrong).
   Also the cascade: a page's built stylesheets must carry the rules of its source
   stylesheets in the order the source page links them. Read off the class names only
   one source file uses: in the built CSS, all of one file's must come before all of
   the next file's.
   And the text: each of the site's stylesheets a source page links must be, unchanged,
   inside one of the built stylesheets the built page links. The build does not minify
   CSS for now (vite.config.ts says why), and this is what notices if it starts to.
   The vendor stylesheets (lib/shell.js VENDOR_STYLES, src/vendor/*.css) are @import
   rules of package stylesheets, which the build inlines, and rules of their own that
   name package files (fonts.css: the @font-face rules tools/gen-fonts.js writes, whose
   url()s the build points at the copies beside the bundle): each imported stylesheet's
   text, and then the file's own, must be in the built one unchanged but for where its
   fonts are (every url() reduced to the file's name on both sides), in that order, and
   all of it before the site's own stylesheets, so that site.css's rules on .katex come
   after KaTeX's and win as they did when KaTeX's stylesheet was a CDN link.
   And the link itself: rel and href, as the source writes it. Vite adds `crossorigin`,
   which vite.config.ts takes off again, so the link in dist is the source's but for
   the file it names. */
const URL_NAMES = (css) => css.replace(/url\(\s*["']?([^"')\s]*)["']?\s*\)/g, (m, u) => "url(" + u.split("/").pop() + ")");
/* the parts of a vendor stylesheet, each with the text the built stylesheet must hold
   and what to call it: its @import rules, each the imported package file's text, in
   order, then its own rules if it has any (what is left when the @import lines are
   taken out, comments and all, so they must come after the imports, as CSS has them) */
const IMPORT_LINE = /^[ \t]*@import\s+["']([^"']+)["']\s*;[ \t]*\n?/gm;
function vendorParts(file) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  const parts = Array.from(text.matchAll(IMPORT_LINE)).map(m => {
    const at = path.join(ROOT, "node_modules", m[1]);
    if (!fs.existsSync(at)) throw new Error(file + " imports " + JSON.stringify(m[1]) + ", which is not at node_modules/" + m[1] + "; run `npm ci`");
    return { what: m[1] + " (which " + file + " imports)", text: URL_NAMES(fs.readFileSync(at, "utf8").trim()) };
  });
  const own = text.replace(IMPORT_LINE, "").trim();
  if (own.replace(NO_COMMENTS, "").trim()) parts.push({ what: "the own rules of " + file, text: URL_NAMES(own) });
  return parts;
}
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

  const isVendor = (f) => shell.VENDOR_STYLES.includes(f);
  const srcFiles = new Set();
  ctx.src.pages.forEach(p => stylesheetsOf(p, ctx.src.docs[p]).forEach(f => { if (!isVendor(f)) srcFiles.add(f); }));
  const classesOf = {}, users = {}, srcText = {};
  srcFiles.forEach(f => {
    srcText[f] = fs.readFileSync(path.join(ROOT, f), "utf8");
    const css = srcText[f].replace(NO_COMMENTS, "");
    classesOf[f] = new Set(css.match(/\.[A-Za-z_][\w-]*/g) || []);
    classesOf[f].forEach(c => { users[c] = (users[c] || 0) + 1; });
  });
  const own = {}, rewritten = {};
  srcFiles.forEach(f => { own[f] = new Set(Array.from(classesOf[f]).filter(c => users[c] === 1)); });
  const parts = {};
  shell.VENDOR_STYLES.forEach(f => { try { parts[f] = vendorParts(f); } catch (e) { r.fail(e.message); parts[f] = []; } });
  /* a built stylesheet holds a vendor stylesheet when it holds every part of it */
  const holdsVendor = (text, f) => parts[f].length > 0 && parts[f].every(i => URL_NAMES(text).includes(i.text));
  ctx.src.pages.forEach(p => {
    if (!per[p]) return;
    r.count++;
    const builtText = per[p].map(f => { try { return fs.readFileSync(path.join(DIST, f), "utf8"); } catch (e) { return ""; } });
    const joined = builtText.join("\n");
    /* the vendor stylesheets: each part's text there, in order, and all before the
       site's own */
    const named = URL_NAMES(joined);
    const siteAt = Math.min.apply(null, stylesheetsOf(p, ctx.src.docs[p]).filter(f => !isVendor(f)).map(f => { const i = joined.indexOf(srcText[f]); return i === -1 ? Infinity : i; }));
    let after = -1, vendorEnd = -1;
    stylesheetsOf(p, ctx.src.docs[p]).filter(isVendor).forEach(f => parts[f].forEach(i => {
      r.count++;
      const at = named.indexOf(i.text);
      if (at === -1) { r.fail(p + ": the text of " + i.what + " is not in the built stylesheets [" + per[p].join(", ") + "] (changed by the build, or the import dropped?)"); return; }
      if (at < after) r.fail(p + ": " + i.what + " comes before what " + f + " has ahead of it in the built stylesheets");
      after = Math.max(after, at);
      vendorEnd = Math.max(vendorEnd, at + i.text.length);
    }));
    /* URL_NAMES shortens the vendor text only, so an index into `named` past it is an
       index into `joined` moved left by what was cut; the site's text starts at the same
       character in both when all the vendor text is before it, which is what is asked */
    if (vendorEnd !== -1 && siteAt !== Infinity && URL_NAMES(joined.slice(0, siteAt)).length < vendorEnd) r.fail(p + ": a vendor stylesheet (" + shell.VENDOR_STYLES.join(", ") + ") comes after one of the site's own in the built stylesheets [" + per[p].join(", ") + "]; site.css's rules on .katex must come after KaTeX's");
    /* the site's own stylesheets: comments out of both sides (a class name in a comment
       is not a rule), and the scan starts where the site's text does, past the vendor
       rules, whose .katex is site.css's class too */
    const css = (siteAt === Infinity ? joined : joined.slice(siteAt)).replace(NO_COMMENTS, "");
    let last = { file: null, end: -1 };
    for (const f of stylesheetsOf(p, ctx.src.docs[p])) {
      if (isVendor(f)) continue;
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
     stylesheet in it (a vendor one by its imports' text) is linked by exactly those
     kinds (VENDOR_STYLES, PAGE_KINDS), as for the chunks */
  const linkedBy = kindsLoading();
  Array.from(all).sort().forEach(f => {
    r.count++;
    const kinds = kindsNamed(f);
    if (!kinds || path.posix.dirname(f) !== BUNDLE.slice(0, -1)) { r.fail(f + " is not named for the page kinds that link it (bundle/all.css, or the kinds joined with \"-\" in PAGE_KINDS order)"); return; }
    let css;
    try { css = fs.readFileSync(path.join(DIST, f), "utf8"); } catch (e) { return; }      /* reported by `links` */
    const inside = Array.from(srcFiles).filter(s => css.includes(srcText[s])).concat(shell.VENDOR_STYLES.filter(v => holdsVendor(css, v)));
    if (!inside.length) { r.fail(f + " holds no source stylesheet as it is written, so nothing says which kinds link it"); return; }
    inside.forEach(s => {
      const by = linkedBy(s) || [];
      if (by.join("-") !== kinds.join("-")) r.fail(f + " holds " + s + ", which the " + by.join(", ") + " kind" + (by.length === 1 ? " links" : "s link") + "; the file's name says " + kinds.join(", "));
    });
  });
}

/* (i) the licences. Everything under dist/bundle/ that is not the site's own comes from
   an npm package, and goes out under that package's licence: the font licence (SIL OFL
   1.1, every typeface and KaTeX's fonts) asks that a copy of the fonts carry the
   copyright notice and the licence text, and the fontsource files carry neither in
   their name tables; the code's (MIT) asks that its notice go with the code. So
   bundle/LICENSES.txt (lib/vendor.js NOTICE) must be in dist, and be the notice
   licenseNotice() writes from the packages installed now, one section per package the
   vendor modules bring in with their dependencies (vite.config.ts licenses() writes it
   at build time); and the notice must cover what is there: every font file in dist is,
   byte for byte, a file of one of those packages, and every node_modules source of
   every chunk is from one of them. A package that ships no licence file is a warning,
   so that it is seen: the notice names its package.json licence and nothing more. */
const FONT_FILE = /\.(woff2?|ttf|otf)$/i;
function checkLicences(ctx, r) {
  r.count++;
  const want = vendor.licenseNotice();
  let have = null;
  try { have = fs.readFileSync(path.join(DIST, vendor.NOTICE), "utf8"); } catch (e) { /* reported below */ }
  if (have === null) { r.fail(vendor.NOTICE + " is not in dist; the build writes it (vite.config.ts licenses())"); return; }
  if (have !== want) r.fail(vendor.NOTICE + " is not the notice lib/vendor.js writes from the installed packages (built before `npm ci`?); " + firstDifference(want, have));
  const packages = vendor.packages();
  const names = new Set(packages.map(p => p.name));
  /* every font file every package in the notice ships, by file name */
  const shipped = {};
  packages.forEach(p => site.walk(path.join(ROOT, "node_modules", p.name), f => FONT_FILE.test(f)).forEach(f => { (shipped[path.basename(f)] = shipped[path.basename(f)] || []).push({ pkg: p.name, abs: f }); }));
  ctx.files.filter(f => FONT_FILE.test(f)).forEach(f => {
    r.count++;
    const bytes = fs.readFileSync(path.join(DIST, f));
    const from = (shipped[path.posix.basename(f)] || []).find(s => bytes.equals(fs.readFileSync(s.abs)));
    if (!from) r.fail(f + " is not, byte for byte, a file of any package " + vendor.NOTICE + " has a section for (" + Array.from(names).join(", ") + ")");
  });
  ctx.files.filter(f => /\.js$/.test(f)).forEach(f => {
    ctx.graph.sourcesOf(f).filter(s => IN_NODE_MODULES.test(s)).forEach(s => {
      r.count++;
      const pkg = vendor.packageOf(s);
      if (!names.has(pkg)) r.fail(f + " is built from " + s + ", of the package " + pkg + ", which " + vendor.NOTICE + " has no section for");
    });
  });
  packages.filter(p => !p.text).forEach(p => r.warn(p.name + " " + p.version + " ships no licence file; " + vendor.NOTICE + " names its package.json licence (" + p.license + ") and nothing more"));
  r.note(packages.length + " package(s) in " + vendor.NOTICE + ": " + packages.map(p => p.name + " " + p.version + " (" + p.license + ")").join(", "));
}

/* ------------------------------------------------------------- runner ---- */

const CHECKS = [
  { name: "pages", run: checkPages, what: "every source page is in dist at the same path, and no file the site is not made of" },
  { name: "links", run: checkLinks, what: "relative hrefs/srcs in dist resolve inside dist, anchors to ids" },
  { name: "root-absolute", run: checkRootAbsolute, what: "no attribute value, and no url() in the CSS, is a root-absolute path" },
  { name: "main", run: checkMain, what: "<main> of every page is the source's, by fingerprint" },
  { name: "shell", run: checkShell, what: "and so is the page around it, but for its stylesheet, icon and module links" },
  { name: "scripts", run: checkScripts, what: "boot inline, one module entry whose bundle is its kind's imports (node_modules files by their vendor module), the HUD script inline after the top bar, each chunk named for the kinds that load it; the on-demand chunks on their own, named by no page; no copy of a source script" },
  { name: "offline", run: checkOffline, what: "no script, link or stylesheet url() of any page comes from another server; no font is inlined" },
  { name: "secrets", run: checkSecrets, what: "no server-side key in any built file, as text or inside a JWT" },
  { name: "stylesheets", run: checkStylesheets, what: "chapter pages share their stylesheets; vendor CSS inlined before the site's, source CSS unchanged, cascade in source order, each file named for the kinds that link it" },
  { name: "licences", run: checkLicences, what: "bundle/LICENSES.txt is the notice written from the installed packages, and every font file and node_modules source in dist is one of theirs" }
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
module.exports = { CHECKS, secretsIn };
