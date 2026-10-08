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

   and renderShell() writes the whole document from that. The build and the dev server
   do it (vite.config.ts), and the checks do it before they read a page (lib/site.js).
   So the source tree on its own is not a site: a page opened as it is written has no
   stylesheet, no script and no top bar, and the browser checks load the build
   (lib/target.js).

   What a page says, all of it on <body>:
     data-depth    how many directories deep the file is; the prefix of every local path
     data-chapter  the page is a chapter (kind "chapter"); otherwise
     data-page     names its kind: one of PAGE_KINDS but "chapter"
     data-nav      which links the top bar shows: "home", "about", or absent for the rest
   data-page and data-nav are read here and not written into the document: the page a
   reader gets has the attributes it always had. (data-scenes, which once named a
   chapter's 3D scenes, is refused: every chapter's bundle carries every scene.)

   Functions of strings but for one file: the boot script (src/boot.js) goes into every
   page inline, and readSource() below is how it is read. The build imports this file as
   it is, and a commit's own copy can be run from `git show` with its own boot script
   (lib/site.js shellAt hands it a reader through useSource). */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const HEAD_MARK = "<!--bm:head-->";
const TOPBAR_MARK = "<!--bm:topbar-->";
/* read from <body> and left out of the document */
const BODY_INPUTS = ["data-page", "data-nav"];

/* The one script that runs before first paint: theme and play settings, so the page is
   painted right from the start. Its text goes into <head> inline, first of all and
   before the stylesheets, so it costs no request and waits on nothing. Plain ES5 on
   purpose: it is not bundled, and it runs on every page as written. */
const BOOT = "src/boot.js";

/* The opt-in to cross-document view transitions: the page arriving fades in under a top
   bar that stays put (assets/game.css, "Between pages", has the rest). It is the one rule
   written inline, straight after the boot script, and not in a stylesheet, because the
   browser asks the arriving page whether it opts in before that page's stylesheets are
   sure to have been applied: with the rule in the bundle's CSS, Chromium 153 turned the
   transition down ("ViewTransition opt-in disabled", an uncaught error on the new page)
   in five of six navigations started straight after the old page's load event, and with
   it inline it ran in eight of eight (tools/suites/transitions.js holds it to running).
   Reduced motion on the device never opts in; Study mode
   and Reduce motion are attributes, which no at-rule can read, so the boot script skips
   the transition for them. */
const OPT_IN = "@media (prefers-reduced-motion: no-preference) { @view-transition { navigation: auto; } }";

/* The stylesheets every page links before its own, in this order: the fonts and KaTeX's,
   each a file under src/vendor/ that imports the npm package's CSS (the build inlines it
   and writes the font files beside the bundle). They come first so that the site's rules
   on .katex come after KaTeX's and win, as they did when these were links to Google Fonts
   and the KaTeX CDN. Nothing on a page comes from another server now (check-dist.js
   `offline`). */
const VENDOR_STYLES = ["src/vendor/fonts.css", "src/vendor/katex.css"];

/* What each kind of page loads. `styles` are the site's own stylesheets, in cascade
   order, after VENDOR_STYLES, src/styles/tokens.css (the one file that defines a colour)
   first; `entry` is the one module script, which imports the site's
   scripts in the order they run (src/entries/<kind>.js lists them). The entry's first
   import is src/vendor/katex.js, which brings in the typesetter from npm and sets
   window.renderMathInElement, so it is there when site.js runs. The boot script is every
   page's. All of that is part of the site: tools/shell.json records what every page ends
   up with, and check-static.js fails a change that was not accepted. */
const PAGE_KINDS = {
  /* index.html: the contents page, with the course map; the next-step card's stylesheet last */
  home: { styles: ["src/styles/tokens.css", "assets/site.css", "assets/game.css", "assets/scenes3d.css", "assets/map3d.css", "assets/review.css"], entry: "src/entries/home.js" },
  /* about.html, account.html: prose and a form */
  page: { styles: ["src/styles/tokens.css", "assets/site.css", "assets/game.css"], entry: "src/entries/page.js" },
  /* progress.html, insights.html: a page, and assets/insights.js to fill it */
  dashboard: { styles: ["src/styles/tokens.css", "assets/site.css", "assets/game.css"], entry: "src/entries/dashboard.js" },
  /* arena.html: no figures, the problem generators instead; the due review's stylesheet
     after arena.css, whose cards and chips it builds on */
  arena: { styles: ["src/styles/tokens.css", "assets/site.css", "assets/game.css", "assets/arena.css", "assets/review.css"], entry: "src/entries/arena.js" },
  /* diagnostic.html: the placement check; the Arena's problem generators, and a stylesheet
     of its own after the game's */
  diagnostic: { styles: ["src/styles/tokens.css", "assets/site.css", "assets/game.css", "assets/diagnostic.css"], entry: "src/entries/diagnostic.js" },
  /* parts/<part>/<chapter>.html: the scene framework, every scene, then site.js, which
     mounts the figures as it runs; the help ladder's own stylesheet after the card rules of
     game.css it builds on, and the next-step card's last */
  chapter: { styles: ["src/styles/tokens.css", "assets/site.css", "assets/game.css", "assets/scenes3d.css", "assets/ladder.css", "assets/review.css"], entry: "src/entries/chapter.js" }
};

/* how a source file of the tree is read: the file beside this one by default, and the
   same path at a git ref when this shell was loaded from one (shellAt in lib/site.js) */
let readSource = (rel) => fs.readFileSync(path.join(__dirname, "..", "..", rel), "utf8");
function useSource(fn) { readSource = fn; }
/* the boot script, as it goes into every page: whole and unchanged, so a "</script>" in
   it would end the tag early; the one thing checked */
function bootScript() {
  const text = readSource(BOOT).replace(/\s+$/, "");
  if (/<\/script/i.test(text)) throw new Error(BOOT + ' holds "</script", which would end the inline tag');
  return text;
}

/* The HUD script: the second inline script of every page, straight after the top bar. It
   fills the HUD's level, XP bar, streak and combo from localStorage before first paint,
   so the top bar is drawn once, right, and does not move when the bundle arrives, and
   it hands the functions that did it to the page as window.BMHud, which assets/game.js
   draws the HUD with from then on (src/hud/view.js says why both must be the same).
   Its text is these modules, in this order, inside one function: each is a plain ES
   module with no TypeScript syntax, so all that changes is that `export ` is taken off
   `export function` and `export const`, an `import { … } from "./x.js"` of a module
   earlier in the list goes (its names are already in scope), and the comments go (block
   comments, and lines that are a // comment), which are most of the bytes; so neither
   file puts a comment marker inside a string. Anything else in them that a script could
   not run as it is fails here, with the reason, and the result must parse. */
const HUD_MODULES = ["src/hud/levels.js", "src/hud/view.js"];

/* One module's text for the HUD script, and the names it exports. `earlier` maps each
   module before it to its exports, for the imports it may make. */
function hudModule(rel, earlier) {
  const names = [];
  const src = readSource(rel).replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter(l => l.trim() && !/^\s*\/\//.test(l)).join("\n");
  const lines = src.split("\n").map((line, i) => {
    const where = rel + ": " + JSON.stringify(line.trim().slice(0, 60)) + ": ";
    const imp = /^import \{([\w\s,]+)\} from "\.\/([\w-]+\.js)";\s*$/.exec(line);
    if (imp) {
      const from = path.posix.join(path.posix.dirname(rel), imp[2]);
      if (!earlier[from]) throw new Error(where + "imports " + from + ", which is not a module before it in HUD_MODULES (tools/lib/shell.js)");
      imp[1].split(",").map(s => s.trim()).filter(Boolean).forEach(n => {
        if (!earlier[from].includes(n)) throw new Error(where + "imports " + n + ", which " + from + " does not export");
      });
      return "";
    }
    if (/^\s*import\b/.test(line)) throw new Error(where + "an import the HUD script cannot take: only `import { a, b } from \"./x.js\";` of a module before it");
    const exp = /^export (?:function|const) (\w+)/.exec(line);
    if (exp) { names.push(exp[1]); return line.slice("export ".length); }
    if (/^\s*export\b/.test(line)) throw new Error(where + "an export the HUD script cannot take: only `export function` and `export const`");
    return line;
  });
  return { text: lines.join("\n"), names };
}
/* the HUD script's text: the modules, window.BMHud, and, when `run`, the prefill call */
function hudText(run) {
  const earlier = {}, parts = [], all = [];
  HUD_MODULES.forEach(rel => {
    const m = hudModule(rel, earlier);
    m.names.forEach(n => { if (all.includes(n)) throw new Error(rel + " exports " + n + ", which a module before it exports too"); });
    earlier[rel] = m.names;
    all.push(...m.names);
    parts.push(m.text);
  });
  const text = "(function () {\n\"use strict\";\n" + parts.join("\n") + "\n" +
    "window.BMHud = { " + all.map(n => n + ": " + n).join(", ") + " };\n" +
    (run ? "try { prefill(document, window); } catch (e) { if (window.console) console.error(\"[BM] the HUD could not be filled before first paint\", e); }\n" : "") +
    "})();";
  if (/<\/script/i.test(text)) throw new Error(HUD_MODULES.join(", ") + ' hold "</script", which would end the inline tag');
  try { new vm.Script(text); } catch (e) { throw new Error("the HUD script made from " + HUD_MODULES.join(", ") + " does not parse: " + e.message); }
  return text;
}
/* what goes into every page after the top bar */
function hudScript() { return hudText(true); }
/* the same functions without the call, for a test that wants window.BMHud and no page
   (tools/game/rules.test.js loads it before assets/game.js) */
function hudLibrary() { return hudText(false); }

/* the top bar's links after the brand, by data-nav: [file at the site root, text] */
const NAVS = {
  home: [["about.html", "How to use this"]],
  about: [["index.html", "Contents"], ["progress.html", "Progress"]],
  "": [["index.html", "Contents"], ["about.html", "How to use this"]]
};

/* Where the HUD's game slots are: the hearts on a page with a boss (a chapter's
   encounter) or a run (the Arena), the clock in the Arena alone. A slot is in the markup
   only where it can be used, and there it is laid out from the start, empty and unseen
   until it is filled (game.css, [data-slot]), so filling it moves nothing. */
const HEARTS_ON = ["chapter", "arena"];
const TIMER_ON = ["arena"];

/* the icons of the top bar and the sheet, drawn in currentColor on a 16-unit grid */
const ICONS = {
  flame: '<path d="M8.2 1c.3 2.4 3.6 4 3.6 7.6A3.8 3.8 0 0 1 8 12.5a3.8 3.8 0 0 1-3.8-3.9c0-1.4.6-2.5 1.5-3.3.1 1 .6 1.7 1.3 1.9C6.7 5.1 7.1 2.9 8.2 1z" fill="currentColor"/>',
  "sound-on": '<path d="M2 6h2.6L8.4 3v10L4.6 10H2z" fill="currentColor"/><path d="M10.6 5.6a3.4 3.4 0 0 1 0 4.8M12.4 3.8a6 6 0 0 1 0 8.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  "sound-off": '<path d="M2 6h2.6L8.4 3v10L4.6 10H2z" fill="currentColor"/><path d="M10.5 6l4 4M14.5 6l-4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  menu: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
};
function icon(name) {
  return '<svg class="icon icon-' + name + '" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' + ICONS[name] + "</svg>";
}
/* one choice of a radio group in the sheet */
function choice(group, pref, value, label) {
  return '<label><input type="radio" name="' + group + '" value="' + value + '" data-pref="' + pref + '"><span>' + label + "</span></label>";
}
/* one switch of the sheet: named by its <span> alone and described by its <small>, so a
   screen reader says "Study mode, switch" and reads the line after it as the description,
   not as part of the name */
function toggle(pref, label, note, cls) {
  const id = "pref-" + pref;
  return '<label class="switch' + (cls ? " " + cls : "") + '"><input type="checkbox" role="switch" data-pref="' + pref + '" aria-labelledby="' + id + '-name" aria-describedby="' + id + '-note">' +
    '<span id="' + id + '-name">' + label + '</span><small id="' + id + '-note">' + note + "</small></label>";
}

/* The HUD: the game slots of the page's kind, the combo, then the level badge and XP bar
   and the streak with today's goal as a ring. What it says is the start of a new reader's
   (level 1, nothing today); the HUD script fills in the reader's own before first paint.
   Every slot has a full-sentence label.
   The order is what holds the HUD still from page to page. The bar is right-aligned (the
   page links and the HUD are pushed right, site.css), so a part sits where the widths to
   its right put it. Level, streak, the account chip, Sound and menu are the same width on
   every page; the hearts and the clock are only on some kinds, and the combo shows on a
   chapter alone when the reader has only its shield. So those come first, on the left,
   and whatever a page adds or drops moves nothing a reader keeps an eye on (the
   transitions suite measures every part across each navigation, the hud suite across
   every kind of bar at every width of its sweep). */
function hud(info) {
  const p = info.prefix;
  const lines = ['    <div class="hud" role="group" aria-label="Your progress">'];
  if (HEARTS_ON.includes(info.kind)) lines.push('      <span class="hud-hearts" role="img" aria-label="No hearts in play" data-slot hidden></span>');
  if (TIMER_ON.includes(info.kind)) lines.push('      <span class="hud-timer" role="timer" aria-label="No clock running" data-urgency="ok" data-slot hidden><span class="hud-timer-text"></span></span>');
  lines.push(
    '      <span class="hud-combo" role="img" aria-label="Combo 0 of 5, XP times 1" data-pips="0" hidden><i></i><i></i><i></i><i></i><i></i></span>',
    '      <a class="hud-level" href="' + p + 'progress.html" aria-label="Level 1, Counter. 0 of 25 XP to level 2. Open your progress.">' +
      '<span class="hud-badge" aria-hidden="true"><b>1</b></span>' +
      '<span class="hud-xp" aria-hidden="true"><span class="hud-xpbar"><i></i></span><span class="hud-xptext"><b>0</b> / <span class="hud-span">25</span> XP</span></span></a>',
    '      <span class="hud-streak" role="img" aria-label="0-day streak. 0 of 30 XP today."><span class="goal-ring"></span>' + icon("flame") + "<b>0</b></span>",
    "    </div>");
  return lines;
}

/* The settings sheet the menu button opens: a native <dialog> (src/ui/settings.ts opens
   it beside the rail on a wide screen and as a modal sheet from the bottom on a narrow
   one). Every input names the preference it sets in data-pref, and the sheet keeps the
   links the old menu had. */
function sheet(info) {
  const p = info.prefix;
  return [
    '  <dialog class="hud-sheet" id="hud-sheet" aria-labelledby="hud-sheet-title">',
    '    <div class="sheet-head"><p class="sheet-title" id="hud-sheet-title">Menu and settings</p>' +
      '<button class="icon-btn sheet-close" type="button" data-sheet-close aria-label="Close menu and settings">' + icon("close") + "</button></div>",
    '    <ul class="hud-links">',
    '      <li><a href="' + p + 'index.html">Contents</a></li>',
    '      <li><a href="' + p + 'about.html">How to use this</a></li>',
    '      <li><a href="' + p + 'progress.html">Your progress</a></li>',
    '      <li><a href="' + p + 'arena.html">Arena</a></li>',
    '      <li><a href="' + p + 'account.html">Your account</a></li>',
    "    </ul>",
    "    " + toggle("calm", "Study mode", "Keeps hints, reviews and progress. Removes hearts, combo, bosses, motion and sound.", "sheet-study"),
    '    <fieldset class="sheet-group">',
    "      <legend>Sound</legend>",
    "      " + toggle("sound", "Sound", "Short notes for answers, the combo and bosses. Off in Study mode."),
    '      <label class="sheet-slider"><span>Volume</span><input type="range" min="0" max="100" step="5" value="50" data-pref="volume"></label>',
    "    </fieldset>",
    '    <fieldset class="sheet-group">',
    "      <legend>Comfort</legend>",
    "      " + toggle("motion", "Reduce motion", "No animation and no smooth scrolling. Always on in Study mode and when your device asks for less motion."),
    "      " + toggle("transparency", "Reduce transparency", "Solid surfaces in place of see-through glass. Always on when your device asks for less transparency."),
    "    </fieldset>",
    '    <fieldset class="sheet-group sheet-choice">',
    "      <legend>Theme</legend>",
    '      <div class="sheet-options">' + choice("bm-theme", "theme", "light", "Light") + choice("bm-theme", "theme", "dark", "Dark") + choice("bm-theme", "theme", "system", "Match system") + "</div>",
    "    </fieldset>",
    '    <fieldset class="sheet-group sheet-choice">',
    "      <legend>Reading panel</legend>",
    '      <div class="sheet-options">' + choice("bm-panel", "panel", "light", "Light") + choice("bm-panel", "panel", "dark", "Dark") + "</div>",
    "    </fieldset>",
    '    <fieldset class="sheet-group sheet-choice">',
    "      <legend>Graphics quality</legend>",
    '      <div class="sheet-options">' + choice("bm-gfx", "gfx", "auto", "Auto") + choice("bm-gfx", "gfx", "low", "Low") + choice("bm-gfx", "gfx", "mid", "Medium") + choice("bm-gfx", "gfx", "high", "High") + "</div>",
    "      " + toggle("map3d", "3D course map", "The contents page opens on a world of four regions. Off, the chapter list stands alone."),
    "    </fieldset>",
    "  </dialog>"
  ];
}

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
   @returns {{ depth: number, prefix: string, kind: string, chapter: string|null, nav: string }} */
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
  if (a.hasOwnProperty("data-scenes")) fail(relPath, "<body> has data-scenes, which is no longer read: every chapter loads every scene (src/entries/chapter.js), so take the attribute off");
  const nav = a["data-nav"] || "";
  if (!NAVS.hasOwnProperty(nav)) fail(relPath, "data-nav is " + JSON.stringify(nav) + "; the top bars are " + Object.keys(NAVS).filter(Boolean).map(n => '"' + n + '"').join(", ") + ", or no data-nav for the usual one");
  return { depth, prefix: "../".repeat(depth), kind, chapter, nav };
}

/* the lines of <head>; `own` holds the page's own tags as it wrote them */
function head(info, own) {
  const at = (p) => info.prefix + p;
  return ['<meta charset="utf-8">']
    .concat(own.robots ? [own.robots] : [])
    .concat([
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      own.title,
      own.description,
      "<script>\n" + bootScript() + "\n</script>",
      "<style>" + OPT_IN + "</style>",
      '<link rel="icon" href="' + at("assets/favicon.svg") + '" type="image/svg+xml">'
    ])
    .concat(VENDOR_STYLES.concat(PAGE_KINDS[info.kind].styles).map(s => '<link rel="stylesheet" href="' + at(s) + '">'))
    .concat(['<script type="module" src="' + at(PAGE_KINDS[info.kind].entry) + '"></script>']);
}

/* The top bar, whole: the brand, the page links, the HUD, the account chip, the sound
   and menu buttons, the Arena's second row, the settings sheet; then the HUD script.
   Nothing is added to it later but the lesson's progress line (assets/lesson.js), so its
   layout is the one the first paint has. */
function topbar(info) {
  const p = info.prefix;
  return ['<a class="skip-link" href="#main">Skip to content</a>',
    "",
    '<header class="topbar">',
    '  <a class="brand" href="' + p + 'index.html"><span class="glyph">∑</span> <span class="brand-name">Basic Mathematics</span></a>',
    '  <nav aria-label="Site">']
    .concat(NAVS[info.nav].map(l => '    <a href="' + p + l[0] + '">' + l[1] + "</a>"))
    .concat(hud(info))
    .concat([
      '    <a class="acct" href="' + p + 'account.html">Sign in</a>',
      '    <button class="icon-btn hud-sound" type="button" data-sound-toggle aria-pressed="false" aria-label="Sound">' + icon("sound-on") + icon("sound-off") + "</button>",
      '    <button class="icon-btn hud-menu" type="button" aria-expanded="false" aria-controls="hud-sheet" aria-label="Menu and settings">' + icon("menu") + "</button>",
      "  </nav>"
    ])
    .concat(TIMER_ON.includes(info.kind) ? ['  <div class="hud-strip" aria-hidden="true" hidden><span class="hud-hearts" hidden></span>' +
      '<span class="hud-timer" data-urgency="ok" hidden><span class="hud-timer-text"></span></span></div>'] : [])
    .concat(sheet(info))
    .concat(["</header>", "<script>\n" + hudScript() + "\n</script>"])
    .join("\n");
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
  if (rest.trim()) fail(relPath, "<head> holds more than a title, a description and robots: " + JSON.stringify(rest.trim().slice(0, 80)) + ". What every page of a kind loads is listed in PAGE_KINDS (tools/lib/shell.js) and its entry under src/entries/");

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

module.exports = { renderShell, expand, isMarked, pageInfo, useSource, bootScript, hudScript, hudLibrary, PAGE_KINDS, VENDOR_STYLES, NAVS, HUD_MODULES, BOOT, HEAD_MARK, TOPBAR_MARK, BODY_INPUTS };
