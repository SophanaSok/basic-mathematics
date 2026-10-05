"use strict";
/* The shell of a page: its <head> and its top bar, which every page shares and no page
   writes out. A page in the source tree holds two markers and says which page it is:

     <head>
     <!--bm:head-->
     <title>…</title>
     <meta name="description" content="…">
     </head>
     <body data-depth="0" data-page="page">
     <!--bm:topbar-->

   and renderShell() writes the whole document from that. The build does it
   (vite.config.ts), the checks do it before they read a page (lib/site.js), and so does
   the server the browser checks load the source tree from (lib/serve.js). So the source
   tree on its own is not a site any more: a page opened as it is written has no
   stylesheet, no script and no top bar.

   What a page says, all of it on <body>:
     data-depth    how many directories deep the file is; the prefix of every local path
     data-chapter  the page is a chapter (kind "chapter"); otherwise
     data-page     names its kind: one of PAGE_KINDS but "chapter"
     data-scenes   chapters only: the 3D scenes it mounts, as the names of their files in
                   assets/scenes/ without ".js", separated by spaces
     data-nav      which links the top bar shows: "home", "about", or absent for the rest
   data-page, data-scenes and data-nav are read here and not written into the document:
   the page a reader gets has the attributes it always had.

   Pure functions of strings: nothing here reads a file, and nothing is required, so the
   build can import it as it is. */

const HEAD_MARK = "<!--bm:head-->";
const TOPBAR_MARK = "<!--bm:topbar-->";
/* read from <body> and left out of the document */
const BODY_INPUTS = ["data-page", "data-scenes", "data-nav"];

const FONTS = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Inter:wght@400;500;600;700&family=Newsreader:ital,wght@0,400;0,600;1,400&display=swap";
const KATEX = "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/";

/* the one script that is not deferred: theme and play settings before first paint */
const BOOT = { src: "assets/boot.js", defer: false };
/* where a chapter's scenes go: assets/scenes3d.js and then one file per name in
   data-scenes, or nothing at all for a chapter that names none */
const SCENES = { scenes: true };

/* What each kind of page loads, in the order it loads it. `styles` are the site's own
   stylesheets (the fonts and KaTeX's come before them on every page, see head());
   `scripts` is every script: a path from the site root or a whole URL, deferred unless
   it says otherwise. The order is the order the scripts run in and the stylesheets
   cascade in, so it is part of the site: tools/shell.json records what every page ends
   up with, and check-static.js fails a list that changed without being accepted. */
const PAGE_KINDS = {
  /* index.html: the contents page, with the course map */
  home: {
    styles: ["assets/site.css", "assets/game.css", "assets/scenes3d.css", "assets/map3d.css"],
    scripts: [BOOT, KATEX + "katex.min.js", KATEX + "contrib/auto-render.min.js", "data/curriculum.js", "data/quest.js",
      "assets/widgets.js", "assets/three-loader.js", "assets/site.js", "assets/sfx.js", "assets/game.js",
      "assets/config.js", "assets/account.js", "assets/map3d.js"]
  },
  /* about.html, account.html: prose and a form */
  page: {
    styles: ["assets/site.css", "assets/game.css"],
    scripts: [BOOT, KATEX + "katex.min.js", KATEX + "contrib/auto-render.min.js", "data/curriculum.js", "data/quest.js",
      "assets/widgets.js", "assets/site.js", "assets/sfx.js", "assets/game.js",
      "assets/config.js", "assets/account.js"]
  },
  /* progress.html, insights.html: a page, and assets/insights.js to fill it */
  dashboard: {
    styles: ["assets/site.css", "assets/game.css"],
    scripts: [BOOT, KATEX + "katex.min.js", KATEX + "contrib/auto-render.min.js", "data/curriculum.js", "data/quest.js",
      "assets/widgets.js", "assets/site.js", "assets/sfx.js", "assets/game.js",
      "assets/config.js", "assets/account.js", "assets/insights.js"]
  },
  /* arena.html: no figures, the problem generators instead */
  arena: {
    styles: ["assets/site.css", "assets/game.css", "assets/arena.css"],
    scripts: [BOOT, KATEX + "katex.min.js", KATEX + "contrib/auto-render.min.js", "data/curriculum.js", "data/quest.js",
      "assets/site.js", "assets/sfx.js", "assets/game.js",
      "data/gen/core.js", "data/gen/part1.js", "data/gen/part2.js", "data/gen/part3.js", "data/gen/part4.js", "assets/arena.js",
      "assets/config.js", "assets/account.js"]
  },
  /* parts/<part>/<chapter>.html: site.js mounts every figure as it runs, so the scenes
     come before it */
  chapter: {
    styles: ["assets/site.css", "assets/game.css", "assets/scenes3d.css"],
    scripts: [BOOT, KATEX + "katex.min.js", KATEX + "contrib/auto-render.min.js", "data/curriculum.js", "data/quest.js",
      "assets/widgets.js", "assets/three-loader.js", SCENES, "assets/site.js", "assets/sfx.js", "assets/game.js",
      "assets/encounter.js", "assets/lesson.js", "assets/config.js", "assets/account.js"]
  }
};

/* the top bar's links after the brand, by data-nav: [file at the site root, text] */
const NAVS = {
  home: [["about.html", "How to use this"]],
  about: [["index.html", "Contents"], ["progress.html", "Progress"]],
  "": [["index.html", "Contents"], ["about.html", "How to use this"]]
};

function fail(relPath, why) { throw new Error(relPath + ": " + why); }

/* the attributes of one open tag, as written: { name: value } with "" for a bare one */
function attrsOf(tag) {
  const attrs = {};
  const re = /\s([^\s"'=<>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(tag))) attrs[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] || "";
  return attrs;
}

/* true for a page written with the markers (either of them: half a pair is an error
   renderShell reports, not a page to pass by) */
function isMarked(src) {
  return src.indexOf(HEAD_MARK) !== -1 || src.indexOf(TOPBAR_MARK) !== -1;
}

/* What a marked page says about itself.
   @returns {{ depth: number, prefix: string, kind: string, chapter: string|null, scenes: string[], nav: string }} */
function pageInfo(src, relPath) {
  const tag = /<body\b[^>]*>/i.exec(src);
  if (!tag) fail(relPath, "no <body> tag");
  const a = attrsOf(tag[0]);
  if (!/^\d+$/.test(a["data-depth"] || "")) fail(relPath, "<body> needs data-depth, the number of directories the file is deep (got " + JSON.stringify(a["data-depth"]) + ")");
  const depth = +a["data-depth"];
  const real = relPath.replace(/\\/g, "/").replace(/^(\.?\/)+/, "").split("/").length - 1;
  if (depth !== real) fail(relPath, 'data-depth="' + depth + '" but the file is ' + real + " deep, so every path the shell writes would miss");
  const chapter = a.hasOwnProperty("data-chapter") ? a["data-chapter"] : null;
  const kinds = Object.keys(PAGE_KINDS).filter(k => k !== "chapter");
  let kind = "chapter";
  if (chapter !== null) {
    if (a.hasOwnProperty("data-page")) fail(relPath, "<body> has data-chapter and data-page; a chapter is kind \"chapter\" and takes no data-page");
  } else {
    kind = a["data-page"];
    if (!kinds.includes(kind)) fail(relPath, "<body> needs data-chapter, or data-page naming one of " + kinds.join(", ") + " (got " + JSON.stringify(kind) + ")");
  }
  let scenes = [];
  if (a.hasOwnProperty("data-scenes")) {
    if (kind !== "chapter") fail(relPath, "data-scenes is for chapter pages; this one is kind \"" + kind + "\"");
    scenes = a["data-scenes"].split(/\s+/).filter(Boolean);
    const bad = scenes.filter(s => !/^[A-Za-z0-9_-]+$/.test(s));
    if (bad.length) fail(relPath, "data-scenes names files of assets/scenes/ without \".js\"; " + JSON.stringify(bad[0]) + " is not such a name");
    if (new Set(scenes).size !== scenes.length) fail(relPath, "data-scenes names a scene twice: " + a["data-scenes"]);
  }
  const nav = a["data-nav"] || "";
  if (!NAVS.hasOwnProperty(nav)) fail(relPath, "data-nav is " + JSON.stringify(nav) + "; the top bars are " + Object.keys(NAVS).filter(Boolean).map(n => '"' + n + '"').join(", ") + ", or no data-nav for the usual one");
  return { depth, prefix: "../".repeat(depth), kind, chapter, scenes, nav };
}

/* the scripts of a page in order, SCENES filled in: [{ src, defer }] with src as listed */
function scriptsOf(info) {
  const out = [];
  PAGE_KINDS[info.kind].scripts.forEach(s => {
    if (s === SCENES) {
      if (!info.scenes.length) return;
      out.push({ src: "assets/scenes3d.js", defer: true });
      info.scenes.forEach(name => out.push({ src: "assets/scenes/" + name + ".js", defer: true }));
    } else if (typeof s === "string") out.push({ src: s, defer: true });
    else out.push({ src: s.src, defer: s.defer !== false });
  });
  return out;
}

/* the lines of <head>; `own` holds the page's own tags as it wrote them */
function head(info, own) {
  const at = (p) => /^https?:\/\//.test(p) ? p : info.prefix + p;
  return ['<meta charset="utf-8">']
    .concat(own.robots ? [own.robots] : [])
    .concat([
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      own.title,
      own.description,
      '<link rel="preconnect" href="https://fonts.googleapis.com">',
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
      '<link rel="stylesheet" href="' + FONTS + '">',
      '<link rel="stylesheet" href="' + KATEX + 'katex.min.css">',
      '<link rel="icon" href="' + at("assets/favicon.svg") + '" type="image/svg+xml">'
    ])
    .concat(PAGE_KINDS[info.kind].styles.map(s => '<link rel="stylesheet" href="' + at(s) + '">'))
    .concat(scriptsOf(info).map(s => "<script" + (s.defer ? " defer" : "") + ' src="' + at(s.src) + '"></script>'));
}

function topbar(info) {
  const p = info.prefix;
  return ['<a class="skip-link" href="#main">Skip to content</a>',
    "",
    '<header class="topbar">',
    '  <a class="brand" href="' + p + 'index.html"><span class="glyph">∑</span> Basic Mathematics</a>',
    '  <nav aria-label="Site">']
    .concat(NAVS[info.nav].map(l => '    <a href="' + p + l[0] + '">' + l[1] + "</a>"))
    .concat([
      '    <button class="icon-btn" type="button" data-theme-toggle aria-label="Switch between light and dark">☾</button>',
      "  </nav>",
      "</header>"
    ]).join("\n");
}

function newlines(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
}

/* Expand a source page.
   @param src      the page as it is in the source tree
   @param relPath  its path from the site root ("parts/1-algebra/01-numbers.html"), for
                   the depth and for messages
   @returns {{ html: string, lineOf(line): number }} the document, and for a line of it
            the line of `src` it came from: a line the shell wrote counts as the line of
            its marker. A text with neither marker and no <main id="main"> (a fixture, a
            report) comes back as it is.
   @throws when the page is not written the way the top of this file says; the message
           starts with relPath */
function expand(src, relPath) {
  if (!isMarked(src)) {
    if (/<main\b[^>]*\sid=["']?main\b/i.test(src)) fail(relPath, "has <main id=\"main\"> but no " + HEAD_MARK + " in its <head>: a page of the site is written with the two markers (README, \"Adding a chapter\")");
    return { html: src, lineOf: (line) => line };
  }
  const one = (mark) => {
    const at = src.indexOf(mark);
    if (at === -1) fail(relPath, "no " + mark + "; a page has both markers or neither");
    if (src.indexOf(mark, at + 1) !== -1) fail(relPath, mark + " is there more than once");
    return at;
  };
  const headMark = one(HEAD_MARK), barMark = one(TOPBAR_MARK);
  const headOpen = /<head\b[^>]*>/i.exec(src), headClose = src.search(/<\/head\s*>/i);
  if (!headOpen || headClose === -1) fail(relPath, "no <head> … </head>");
  const headStart = headOpen.index + headOpen[0].length;
  if (headMark < headStart || headMark > headClose || src.slice(headStart, headMark).trim()) fail(relPath, HEAD_MARK + " must be the first thing inside <head>");

  /* the page's own head: a title, a description, perhaps robots, and nothing else */
  let rest = src.slice(headMark + HEAD_MARK.length, headClose);
  const take = (re, what, needed) => {
    const found = rest.match(re) || [];
    if (found.length > 1) fail(relPath, "more than one " + what + " in <head>");
    if (!found.length && needed) fail(relPath, "no " + what + " in <head>");
    rest = rest.replace(re, "");
    return found[0] || "";
  };
  const own = {
    title: take(/<title>[\s\S]*?<\/title>/gi, "<title>", true),
    description: take(/<meta\s+name="description"\s[^>]*>/gi, '<meta name="description">', true),
    robots: take(/<meta\s+name="robots"\s[^>]*>/gi, '<meta name="robots">', false)
  };
  if (rest.trim()) fail(relPath, "<head> holds more than a title, a description and robots: " + JSON.stringify(rest.trim().slice(0, 80)) + ". What every page of a kind loads is listed in PAGE_KINDS (tools/lib/shell.js)");

  const body = /<body\b[^>]*>/i.exec(src);
  if (!body || body.index < headClose) fail(relPath, "no <body> tag after </head>");
  const bodyEnd = body.index + body[0].length;
  if (barMark < bodyEnd || src.slice(bodyEnd, barMark).trim()) fail(relPath, TOPBAR_MARK + " must be the first thing inside <body>");
  const info = pageInfo(src, relPath);

  /* three pieces of the source are replaced; everything else is kept byte for byte */
  const edits = [
    { start: headMark, end: headClose, text: head(info, own).join("\n") + "\n" },
    { start: body.index, end: bodyEnd, text: body[0].replace(new RegExp("\\s+(?:" + BODY_INPUTS.join("|") + ")(?![\\w-])(?:\\s*=\\s*(?:\"[^\"]*\"|'[^']*'|[^\\s\"'>]+))?", "gi"), "") },
    { start: barMark, end: barMark + TOPBAR_MARK.length, text: topbar(info) }
  ];
  let html = "", at = 0, srcLine = 1, outLine = 1;
  const spans = edits.map(e => {
    const kept = src.slice(at, e.start);
    html += kept + e.text;
    srcLine += newlines(kept);
    outLine += newlines(kept);
    const span = { out: outLine, outEnd: outLine + newlines(e.text), src: srcLine, srcEnd: srcLine + newlines(src.slice(e.start, e.end)) };
    srcLine = span.srcEnd;
    outLine = span.outEnd;
    at = e.end;
    return span;
  });
  html += src.slice(at);
  /* inside what the shell wrote: the line its marker is on; after it: moved by the
     lines the shell added */
  const lineOf = (n) => {
    let shift = 0;
    for (const s of spans) {
      if (n < s.out) break;
      if (n < s.outEnd) return s.src;
      shift = s.srcEnd - s.outEnd;
    }
    return n + shift;
  };
  return { html, lineOf };
}

/* The document a reader gets for a source page. See expand(). */
function renderShell(src, relPath) {
  return expand(src, relPath).html;
}

module.exports = { renderShell, expand, isMarked, pageInfo, PAGE_KINDS, NAVS, HEAD_MARK, TOPBAR_MARK, BODY_INPUTS };
