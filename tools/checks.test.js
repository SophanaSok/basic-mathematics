#!/usr/bin/env node
/* The checks checked: the rules in check-static.js that guard saved progress, and
   assign-ids.js, tried on small pages written here where each rule's answer is known.
     - progress-keys: a scored or an inline exercise that is changed, dropped or replaced
       under a kept id fails; ids written onto exercises that were keyed by position pass;
       an id that is also a property of every object (`constructor`) is only a name
     - ids: such an id used once passes and does not stop the pages after it; used twice it
       is reported like any other
     - lesson-steps: an added step and a cut that moves while the count stays the same both
       show; text added inside a step does not; tools/lesson-steps.json holds lists
     - assign-ids: "write" is printed for a page only when it was written, and one page
       that cannot be converted leaves every page alone
     - shell (lib/shell.js and the check): each kind of page gets its stylesheets in
       order, the boot script inline, KaTeX's two tags, its one module entry, its top bar
       and its path prefix, and nothing of the content moves; a page written any other
       way is refused with a reason; a node's line is its line in the source file; a
       dropped defer, a reordered script, a changed boot script, a changed body
       attribute or top-bar link all show; a second module, a classic script of the
       site's own or another kind's entry fail whatever the record says;
       tools/shell.json records every page
     - apply-shell: whole pages are found again as the kind they were written from; a
       page no kind expands to, or one whose content differs from the base by a byte,
       fails and leaves every page alone
     - serve (lib/serve.js): a build is served as it is, a page in it that still carries
       a shell marker is refused, a fixture goes out as it is
   Usage: node tools/checks.test.js */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const site = require("./lib/site");
const serve = require("./lib/serve");
const shell = require("./lib/shell");
const vendor = require("./lib/vendor");
const { parse } = require("./lib/html");
const { exercisesOf } = require("./lib/keys");
const { CHECKS, result, pageKeys, lessonSteps, stepsDiff, shellOf, shellDiff, scriptsProblems } = require("./check-static");
const assignIds = require("./assign-ids");
const applyShell = require("./apply-shell");

let fails = 0, passes = 0;
function check(cond, what) {
  if (cond) passes++;
  else { fails++; console.error("FAIL " + what); }
}
function eq(a, b, what) { check(JSON.stringify(a) === JSON.stringify(b), what + " — got " + JSON.stringify(a) + ", want " + JSON.stringify(b)); }

/* an exercise as the chapters write one; `attrs` is everything after class="ex" */
function ex(attrs, question) {
  return '<div class="ex"' + (attrs ? " " + attrs : "") + '>\n  <div class="ex-q"><p>' + question + "</p></div>\n</div>";
}
function chapter(blocks) {
  return '<!doctype html>\n<html><body data-chapter="ch99" data-depth="2">\n<main id="main">\n' + blocks.join("\n") + "\n</main>\n</body></html>\n";
}

/* ---------------------------------------------------------- progress-keys -- */
{
  const keys = (now, base) => {
    const r = result();
    const n = pageKeys("page.html", exercisesOf(chapter(now)), base ? exercisesOf(chapter(base)) : null, r);
    return { n, fails: r.fails, warns: r.warns };
  };
  const base = [
    ex('data-inline id="t1" data-answer="1"', "One plus zero?"),
    ex('data-inline id="t2" data-answer="2"', "One plus one?"),
    ex('id="e1" data-answer="4"', "Two plus two?"),
    ex('id="e2" data-answer="6"', "Three plus three?")
  ];
  let k = keys(base, base);
  eq([k.fails, k.n], [[], { scored: 2, inline: 2, skipped: 0, newScored: 0 }], "an unchanged page passes, inline checks compared too");

  /* the migration itself: exercises keyed by position at the base carry that key as an id now */
  k = keys(base, [base[0], base[1], ex('data-answer="4"', "Two plus two?"), ex('data-answer="6"', "Three plus three?")]);
  eq([k.fails, k.n.scored], [[], 2], "ids equal to the positional keys of the base pass");

  /* moved and wrapped: the key is the id, not the place */
  k = keys([base[3], "<section>" + base[2] + "</section>", base[1], base[0]], base);
  eq(k.fails, [], "reordered and wrapped exercises keep their keys");

  k = keys([base[0], ex('data-inline id="t2" data-answer="3"', "One plus one?"), base[2], base[3]], base);
  eq(k.fails.length, 1, "an inline check whose answer changed under the same id fails");
  check(/inline key `t2` now has a different question\/answer/.test(k.fails[0] || ""), "… and the failure names the inline key: " + k.fails[0]);

  k = keys([base[0], ex('data-inline id="t2" data-answer="2"', "Two times one?"), base[2], base[3]], base);
  eq(k.fails.length, 1, "an inline check whose question changed under the same id fails");

  k = keys([base[0], base[2], base[3]], base);
  eq(k.fails.length, 1, "a dropped inline check fails while the base still has it");
  check(/inline key `t2`.*missing/.test(k.fails[0] || ""), "… as missing: " + k.fails[0]);

  /* a retired id handed to a new exercise, of either kind */
  k = keys([base[0], base[1], base[2], ex('id="e2" data-answer="9"', "Three times three?")], base);
  eq(k.fails.length, 1, "a scored id reused for another question fails");
  k = keys([base[0], base[2], base[3], ex('id="t2" data-answer="2"', "One plus one?")], base);
  eq(k.fails.length, 1, "an inline check turned into a scored exercise is no longer the inline key");

  k = keys(base.concat([ex('data-inline id="t3" data-answer="5"', "New check?"), ex('id="e3" data-answer="8"', "New exercise?")]), base);
  eq([k.fails, k.n.newScored], [[], 1], "new exercises with new ids pass");

  k = keys(base.concat([ex('data-answer="8"', "No id?")]), base);
  check(k.fails.some(m => /scored exercise without an id/.test(m)), "a scored exercise without an id fails: " + JSON.stringify(k.fails));
  k = keys(base.concat([ex('data-inline data-answer="8"', "No id?")]), base);
  check(k.fails.some(m => /inline exercise without an id/.test(m)), "an inline exercise without an id fails: " + JSON.stringify(k.fails));
  k = keys(base.concat([base[2]]), base);
  eq(k.fails.length, 1, "the same scored id twice fails");

  /* ids every object already answers to */
  const odd = ["constructor", "toString", "hasOwnProperty", "__proto__", "valueOf"];
  const named = odd.map((id, i) => ex('id="' + id + '" data-answer="' + i + '"', "Question " + i + "?"))
    .concat(odd.map((id, i) => ex('data-inline id="i-' + id + '" data-answer="' + i + '"', "Check " + i + "?")));
  k = keys(named, named);
  eq([k.fails, k.n.scored, k.n.inline], [[], 5, 5], "exercises named constructor, __proto__ and the like are neither duplicates nor missing");
  k = keys(named, null);
  eq(k.fails, [], "… nor on a page the base does not have");
  k = keys(named.slice(1), named);
  eq(k.fails.length, 1, "… and `constructor` is missed when it goes");

  /* an inline check the base keyed by counting has nothing to be held to */
  k = keys(base, [ex('data-inline data-answer="1"', "Counted?")].concat(base));
  eq([k.fails, k.n.skipped, k.n.inline], [[], 1, 2], "an id-less inline check at the base is counted as skipped, not failed");
}

/* -------------------------------------------------------------------- ids -- */
{
  const ids = CHECKS.filter(c => c.name === "ids")[0].run;
  const run = (pages) => {
    const r = result();
    const ctx = { pages: Object.keys(pages), docs: {} };
    ctx.pages.forEach(p => { ctx.docs[p] = parse(pages[p]); });
    let threw = null;
    try { ids(ctx, r); } catch (e) { threw = e; }
    return { fails: r.fails, count: r.count, threw: threw && threw.message };
  };
  let k = run({
    "a.html": '<main><p id="constructor">x</p><p id="toString">x</p><p id="__proto__">x</p><p id="hasOwnProperty">x</p><p id="valueOf">x</p></main>',
    "b.html": '<main><h2 id="one">x</h2><p id="two">x</p></main>'
  });
  eq(k, { fails: [], count: 7, threw: null }, "ids named after Object.prototype members pass, and the next page is still examined");
  k = run({ "a.html": '<main>\n<p id="constructor">x</p>\n<h2 id="constructor">x</h2>\n<p id="ok">x</p></main>' });
  eq([k.fails.length, k.threw], [1, null], "`constructor` on two elements is one failure");
  check(/a\.html:3: id "constructor" is on 2 elements/.test(k.fails[0] || ""), "… pointing at the second: " + k.fails[0]);
  k = run({ "a.html": '<main><div class="ex" id="e1"></div><div class="ex" id="e1"></div><p id="e1">x</p></main>' });
  eq(k.fails.length, 1, "an id on three elements is reported once");
}

/* ----------------------------------------------------------- lesson-steps -- */
{
  const page = (blocks) => lessonSteps(parse(chapter(blocks)));
  const blocks = [
    '<header class="region-banner"><h1>Title</h1></header>',
    '<div class="puzzle" id="puzzle">p</div>',
    '<h2 id="first">1</h2>', "<p>a</p>", ex('data-inline id="t1" data-answer="1"', "?"),
    "<p>b</p>", '<details class="reveal"><summary>s</summary>r</details>',
    '<h2 id="second">2</h2>', "<p>c</p>", '<figure><div class="widget" data-widget="w"></div></figure>',
    "<p>d</p>", '<details class="reveal"><summary>s</summary>r</details>',
    '<section class="practice" id="practice">' + ex('id="e1" data-answer="1"', "?") + "</section>",
    '<div class="recap">r</div>'
  ];
  const accepted = page(blocks);
  eq(accepted, ["header.region-banner to div#puzzle", "h2#first to div#t1", "p to details.reveal", "h2#second to figure",
    "p to details.reveal", "section#practice", "div.recap"], "the cuts of lesson.js, each step as its first and last element");
  eq(stepsDiff(accepted, accepted), null, "the same steps are no difference");

  /* text inside a step moves nothing */
  const more = blocks.slice(); more.splice(4, 0, "<p>more</p>", "<ul><li>and more</li></ul>");
  eq(stepsDiff(page(more), accepted), null, "a paragraph added inside a step is no difference");

  /* one more step */
  const added = blocks.slice(); added.splice(2, 0, "<h2>Extra</h2>", "<p>x</p>");
  eq([page(added).length, stepsDiff(page(added), accepted)], [8, "step 2 is now `h2 to p`, accepted `h2#first to div#t1`"], "an added step shows, with the place");

  /* one more early and one fewer late (the figure loses its widget): the count is the same
     and every step between the two has moved by one */
  const shifted = added.slice(); shifted[11] = '<figure><img alt=""></figure>';
  eq(page(shifted).length, accepted.length, "(the shifted page has as many steps as before)");
  check(stepsDiff(page(shifted), accepted) !== null, "a cut that moves while the count stays the same is a difference");

  /* a block that ends a step, wrapped in something that does not */
  const wrapped = blocks.slice(); wrapped[4] = "<div>" + blocks[4] + "</div>";
  check(stepsDiff(page(wrapped), accepted) !== null, "an inline check wrapped in a plain div no longer cuts, and shows");

  eq(stepsDiff(accepted.slice(0, 6), accepted), "accepted step 7 `div.recap` is gone", "a step lost from the end is named");
  eq(stepsDiff(accepted.concat(["p"]), accepted), "step 8 `p` is new", "a step added at the end is named");

  const file = JSON.parse(fs.readFileSync(path.join(__dirname, "lesson-steps.json"), "utf8"));
  const chapters = Object.keys(file);
  check(chapters.length > 0 && chapters.every(ch => Array.isArray(file[ch]) && file[ch].length >= 3 && file[ch].every(s => typeof s === "string")),
    "tools/lesson-steps.json is chapter id -> list of steps");
}

/* ------------------------------------------------------------- assign-ids -- */
{
  /* pages held in memory: what was read, what was written, what was said */
  const world = (files) => {
    const w = { files: Object.assign({}, files), written: [], lines: [] };
    w.io = {
      pages: Object.keys(files),
      read: p => w.files[p],
      write: (p, src) => { w.written.push(p); w.files[p] = src; },
      log: line => w.lines.push(line)
    };
    return w;
  };
  const good = chapter([ex('data-answer="1"', "First?"), ex('data-inline id="t1" data-answer="2"', "Check?"), ex('data-answer="3"', "Second?")]);
  /* its one id-less exercise would be keyed e1, which another element already has */
  const bad = chapter([ex('id="e1" data-answer="1"', "Named?"), ex('data-answer="2"', "Counted?")]);
  const done = chapter([ex('id="e1" data-answer="1"', "First?")]);
  const notChapter = "<!doctype html><html><body><main id=\"main\">" + ex('data-answer="1"', "Elsewhere?") + "</main></body></html>";

  let w = world({ "parts/a/bad.html": bad, "parts/a/good.html": good });
  eq(assignIds.run({ write: true }, w.io), 1, "--write with a page that cannot be converted exits 1");
  eq([w.written, w.files["parts/a/good.html"] === good], [[], true], "… and writes nothing");
  eq(w.lines.filter(l => /^write /.test(l)), [], "… and claims no write");
  check(/^FAIL {2}parts\/a\/bad\.html: .*already exists/.test(w.lines[0] || "") && /nothing written$/.test(w.lines[w.lines.length - 1] || ""),
    "… and says which page and that nothing was written: " + JSON.stringify(w.lines));

  w = world({ "parts/a/bad.html": bad, "parts/a/good.html": good });
  eq(assignIds.run({ check: true }, w.io), 1, "--check with a page that cannot be converted exits 1");
  eq([w.written, w.lines.filter(l => /^would /.test(l))], [[], ["would parts/a/good.html: 2 id(s), e1 … e2"]], "… still saying what it would do to the others");

  w = world({ "index.html": notChapter, "parts/a/done.html": done, "parts/a/good.html": good });
  eq(assignIds.run({ check: true }, w.io), 1, "--check with something to assign exits 1");
  eq([w.written, w.lines], [[], ["would parts/a/good.html: 2 id(s), e1 … e2", "would assign 2 id(s) on 1 of 2 chapter pages"]], "… and only says so");

  eq(assignIds.run({ write: true }, w.io), 0, "--write exits 0");
  eq([w.written, w.lines.slice(2)], [["parts/a/good.html"], ["write parts/a/good.html: 2 id(s), e1 … e2", "assigned 2 id(s) on 1 of 2 chapter pages"]], "… and reports the page it wrote");
  eq(exercisesOf(w.files["parts/a/good.html"]).map(e => e.id), ["e1", "t1", "e2"], "… with each id on the exercise it keyed");
  eq(w.files["index.html"], notChapter, "… leaving a page that is not a chapter alone");

  w.lines.length = 0; w.written.length = 0;
  eq([assignIds.run({ check: true }, w.io), w.written, w.lines], [0, [], ["nothing to do: every scored exercise on 2 chapter pages has an id"]], "--check afterwards has nothing to do");
}

/* ------------------------------------------------------------------ shell -- */
/* a page as the source tree writes one: the two markers, its own head, and content */
const HEAD = '<title>A title</title>\n<meta name="description" content="What it is.">';
function marked(bodyAttrs, head) {
  return '<!doctype html>\n<html lang="en">\n<head>\n<!--bm:head-->\n' + (head === undefined ? HEAD : head) + "\n</head>\n<body " + bodyAttrs + ">\n<!--bm:topbar-->\n\n" +
    '<div class="wrap">\n  <main id="main">\n    <h1 id="first">Heading</h1>\n    <p>Text.</p>\n  </main>\n</div>\n</body>\n</html>\n';
}
function refusal(fn) { try { fn(); return null; } catch (e) { return e.message; } }
{
  const render = (attrs, rel, head) => shell.renderShell(marked(attrs, head), rel || "x.html");
  const tags = (html, name, attr) => parse(html).queryAll(name).filter(el => el.hasAttribute(attr)).map(el => el.getAttribute(attr));
  const scripts = (html) => tags(html, "script", "src"), sheets = (html) => tags(html, "link", "href").filter(h => /\.css/.test(h));

  /* what is and is not a page */
  const whole = '<!doctype html><html><head><title>t</title></head><body data-depth="0"><main id="main"><p>x</p></main></body></html>';
  check(/^index\.html: has <main id="main"> but no <!--bm:head-->/.test(refusal(() => shell.renderShell(whole, "index.html")) || ""), "a page with <main id=\"main\"> and no head marker is refused, by name");
  const fixture = "<!doctype html><html><head><title>t</title></head><body><main><p>x</p></main></body></html>";
  eq(shell.renderShell(fixture, "tools/fixtures/f.html"), fixture, "a file with no marker and no <main id=\"main\"> comes back as it is");
  eq([shell.isMarked(whole), shell.isMarked(marked('data-depth="0" data-page="page"'))], [false, true], "isMarked tells the two apart");

  /* a plain page */
  let out = render('data-depth="0" data-page="page"');
  check(!/<!--bm:/.test(out), "no marker is left in the document");
  check(/<body data-depth="0">\n<a class="skip-link" href="#main">Skip to content<\/a>\n\n<header class="topbar">/.test(out), "the top bar follows a <body> that no longer carries data-page");
  const src = marked('data-depth="0" data-page="page"');
  check(out.endsWith(src.slice(src.indexOf("\n\n<div class=\"wrap\">"))), "everything after the top-bar marker is the source's, byte for byte");
  eq(parse(out).query("head").children_elements.slice(0, 4).map(el => el.name + ":" + (el.getAttribute("charset") || el.getAttribute("name") || el.textContent)),
    ["meta:utf-8", "meta:viewport", "title:A title", "meta:description"], "the head opens with charset, viewport, then the page's own title and description");
  eq(sheets(out), ["src/vendor/fonts.css", "src/vendor/katex.css", "assets/site.css", "assets/game.css"], "a page links the fonts' and KaTeX's stylesheets, then site.css and game.css");
  eq(scripts(out), ["src/entries/page.js"], "… and loads the one module entry of its kind, and no other script by URL");
  check(!/https?:\/\//.test(parse(out).query("head").children_elements.map(el => Object.values(el.attrs).join(" ")).join(" ")), "nothing in <head> names another server");
  const all = parse(out).queryAll("script");
  eq(all.map(s => (s.hasAttribute("src") ? "" : "inline ") + (s.getAttribute("type") || "") + (s.hasAttribute("defer") ? " defer" : "")), ["inline ", "module"], "the boot script is inline, the entry is a module, and there is no classic script");
  eq(all[0].textContent.trim(), fs.readFileSync(path.join(site.ROOT, "src/boot.js"), "utf8").trim(), "the inline script is src/boot.js, whole");
  const headOrder = parse(out).query("head").children_elements.map(el => el.name + (el.getAttribute("rel") || "") + (el.getAttribute("type") || ""));
  check(headOrder.indexOf("script") < headOrder.indexOf("linkstylesheet") && headOrder.indexOf("scriptmodule") === headOrder.length - 1, "the boot script comes before every stylesheet, and the module entry last: " + headOrder.join(","));
  shell.VENDOR_STYLES.forEach(f => check(fs.existsSync(path.join(site.ROOT, f)) && /^\s*@import\s+["'][^"'./]|url\(["']?@?[a-z]/m.test(fs.readFileSync(path.join(site.ROOT, f), "utf8")), "the vendor stylesheet " + f + " exists and imports a package's CSS or names a package's files"));
  const vendorModules = vendor.vendorModules();
  eq(vendorModules.map(v => v.file), ["src/vendor/fonts.css", "src/vendor/katex.css", "src/vendor/katex.js", "src/vendor/supabase.js", "src/vendor/three.js"], "the vendor modules are the fonts' and KaTeX's stylesheets, KaTeX's script, supabase-js and Three.js");
  eq(vendorModules.map(v => v.packages.join(",")), ["@fontsource-variable/bricolage-grotesque,@fontsource-variable/inter,@fontsource/newsreader,@fontsource-variable/newsreader", "katex", "katex", "@supabase/supabase-js", "three"], "… each bringing in the packages it is named for (fonts.css by the files its url()s name)");
  check(vendorModules.find(v => v.file === "src/vendor/supabase.js").all.includes("@supabase/auth-js"), "a package's dependencies come with it (supabase.js brings in @supabase/auth-js)");
  eq([vendor.vendorOf("node_modules/katex/dist/katex.mjs").file, vendor.vendorOf("node_modules/katex/dist/katex.min.css").file, vendor.vendorOf("node_modules/tslib/tslib.es6.mjs").file, vendor.vendorOf("node_modules/three/build/three.core.js").file], ["src/vendor/katex.js", "src/vendor/katex.css", "src/vendor/supabase.js", "src/vendor/three.js"], "a node_modules file is placed by its kind and its package: katex's script with katex.js, its stylesheet with katex.css, a dependency of supabase-js with supabase.js, three's core with three.js");
  check(/no script under src\/vendor\/ imports/.test(refusal(() => vendor.vendorOf("node_modules/left-pad/index.js")) || ""), "a package no vendor module imports is refused, with the reason");
  const deps = JSON.parse(fs.readFileSync(path.join(site.ROOT, "package.json"), "utf8"));
  eq(deps.dependencies.katex, "0.16.11", "package.json pins katex at exactly 0.16.11, the version the CDN tags loaded");
  check(/^\^0\.\d+\.\d+$/.test(deps.dependencies.three || "") && (deps.devDependencies["@types/three"] || "").split(".")[1] === deps.dependencies.three.split(".")[1], "package.json holds three to a minor (a caret on 0.x is that), and @types/three is of the same minor: " + deps.dependencies.three + ", " + deps.devDependencies["@types/three"]);

  /* Three.js is re-exported by name, and the names are exactly what the scripts use,
     so the lazy chunk is what the map and the GL painter need and nothing more: every
     T.<Name> in map3d.js and THREE.<Name> in scenes3d-gl.js (the two readers of
     BM3D.THREE), and every name src/vendor/three.js exports, must be the same set */
  const threeVendor = fs.readFileSync(path.join(site.ROOT, "src/vendor/three.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const exported = threeVendor.match(/^export \{[^}]*\} from "three";$/gm).flatMap(line => line.replace(/^export \{|\} from "three";$/g, "").split(",").map(s => s.trim()).filter(Boolean));
  const used = new Set();
  ["assets/map3d.js", "assets/scenes3d-gl.js"].forEach(f => {
    for (const m of fs.readFileSync(path.join(site.ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\b(?:T|THREE|M\.T)\.([A-Z]\w*)/g)) used.add(m[1]);
  });
  eq(exported.slice().sort(), Array.from(used).sort(), "src/vendor/three.js exports, by name, exactly the Three.js names assets/map3d.js and assets/scenes3d-gl.js use");
  eq(exported.length, new Set(exported).size, "… each once");
  check(!["assets/map3d.js", "assets/scenes3d.js", "assets/scenes3d-gl.js", "assets/three-loader.js"].some(f => /window\.THREE\b/.test(fs.readFileSync(path.join(site.ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, ""))), "nothing reads or writes window.THREE: the namespace is BM3D.THREE");

  /* the fonts: src/vendor/fonts.css is what gen-fonts.js writes, and what it writes
     is the Google Fonts link's faces, one rule per single weight */
  const genFonts = require("./gen-fonts");
  eq(genFonts.FACES.map(f => f.family + " " + f.style + " " + f.weights.join(",")), ["Bricolage Grotesque normal 700,800", "Inter normal 400,500,600,700", "Newsreader italic 400", "Newsreader normal 400,600"], "gen-fonts.js declares the faces the Google Fonts link asked for, and no other");
  eq(genFonts.problem(), "", "src/vendor/fonts.css is what tools/gen-fonts.js writes (run it after a fontsource update)");
  const faces = Array.from(fs.readFileSync(path.join(site.ROOT, genFonts.FILE), "utf8").matchAll(/@font-face\s*\{([^}]*)\}/g)).map(m => m[1]);
  const decl = (block, name) => (new RegExp(name + ":\\s*([^;]+)").exec(block) || [])[1];
  check(faces.length > 0 && faces.every(b => /^\d+$/.test(decl(b, "font-weight"))), "every @font-face names one weight, never a range, so the site's font-weight: 650 takes the 700 face as it did with Google's rules");
  check(faces.every(b => ["'Bricolage Grotesque'", "'Inter'", "'Newsreader'"].includes(decl(b, "font-family")) && decl(b, "font-display") === "swap" && decl(b, "unicode-range")), "every @font-face is one of the three families the tokens name, with font-display: swap and a unicode-range");
  const urls = faces.flatMap(b => Array.from(b.matchAll(/url\(([^)]+)\)/g)).map(m => m[1]));
  check(urls.length > 0 && urls.every(u => /^@fontsource(-variable)?\//.test(u) && fs.existsSync(path.join(site.ROOT, "node_modules", u))), "every url() names a file of an installed fontsource package");
  check(faces.filter(b => decl(b, "font-style") === "normal").every(b => /wght-normal\.woff2\) format\('woff2-variations'\)/.test(decl(b, "src"))) && faces.filter(b => decl(b, "font-style") === "italic").every(b => /400-italic\.woff2\)/.test(decl(b, "src"))), "the upright faces are the packages' variable files, the italic a static instance: what Google served");

  /* the licences: a section for every package the vendor modules bring in, with its
     licence file, and the font licence's text, since fonts go out */
  const pk = vendor.packages();
  eq(pk.map(p => p.name).sort(), Array.from(new Set(vendorModules.flatMap(v => v.all))).sort(), "packages() is every package of every vendor module, with their dependencies, each once");
  check(pk.every(p => p.text.length > 100 && p.file), "every package installed today ships a licence file, and packages() reads it: " + pk.filter(p => !p.text).map(p => p.name).join(", "));
  const notice = vendor.licenseNotice();
  check(pk.every(p => notice.includes("\n" + p.name + " " + p.version + " — " + p.license + " — ") && notice.includes(p.text)), "licenseNotice() has a section per package, naming it with its version and licence, and holding its licence file's text");
  check(/SIL OPEN FONT LICENSE Version 1\.1/.test(notice) && /Reserved Font Name KaTeX_/.test(notice), "the notice carries the Open Font License's text, and the KaTeX fonts' own notice");
  eq(vendor.NOTICE, "bundle/LICENSES.txt", "the notice goes beside the bundle");
  Object.keys(shell.PAGE_KINDS).forEach(k => check(/^import "\.\.\/vendor\/katex\.js";/m.test(fs.readFileSync(path.join(site.ROOT, shell.PAGE_KINDS[k].entry), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").trim()), "the " + k + " entry imports src/vendor/katex.js first, so renderMathInElement is there when site.js runs"));
  eq(parse(out).query("header.topbar").queryAll("a").map(a => a.getAttribute("href")), ["index.html", "index.html", "about.html"], "the usual top bar: brand, Contents, How to use this");

  /* the other kinds and top bars */
  eq(scripts(render('data-depth="0" data-page="dashboard"')).slice(-1), ["src/entries/dashboard.js"], "a dashboard loads the dashboard entry");
  out = render('data-depth="0" data-page="arena"');
  eq([sheets(out).slice(-1)[0], scripts(out).slice(-1)], ["assets/arena.css", ["src/entries/arena.js"]], "the arena has its stylesheet and its entry");
  out = render('data-depth="0" data-page="home" data-nav="home"');
  eq([sheets(out).slice(-2), scripts(out).slice(-1)], [["assets/scenes3d.css", "assets/map3d.css"], ["src/entries/home.js"]], "the home page has the map's stylesheet last and the home entry");
  Object.keys(shell.PAGE_KINDS).forEach(k => check(fs.existsSync(path.join(site.ROOT, shell.PAGE_KINDS[k].entry)), "the entry of kind " + k + " exists: " + shell.PAGE_KINDS[k].entry));
  eq(parse(out).query("header.topbar").queryAll("a").map(a => a.getAttribute("href")), ["index.html", "about.html"], "data-nav=\"home\": no Contents link on the contents page");
  eq(parse(render('data-depth="0" data-page="page" data-nav="about"')).query("header.topbar").queryAll("a").map(a => a.textContent).slice(1), ["Contents", "Progress"], "data-nav=\"about\": Contents and Progress");
  check(/<meta charset="utf-8">\n<meta name="robots" content="noindex">\n<meta name="viewport"/.test(render('data-depth="0" data-page="dashboard"', "x.html", HEAD + '\n<meta name="robots" content="noindex">')), "a robots tag goes right after the charset");

  /* chapters */
  out = render('data-depth="2" data-chapter="ch99" data-part="algebra"', "parts/p/c.html");
  check(/<body data-depth="2" data-chapter="ch99" data-part="algebra">/.test(out), "a chapter keeps data-chapter and data-part");
  const sc = scripts(out);
  eq([sc, sheets(out)[0], sheets(out).slice(-2)], [["../../src/entries/chapter.js"], "../../src/vendor/fonts.css", ["../../assets/scenes3d.css", "../../assets/ladder.css"]],
    "it loads the chapter entry and the vendor stylesheets by its depth, and the scenes' and the help ladder's stylesheets are every chapter's, the ladder's last");
  eq(parse(out).query("header.topbar").queryAll("a").map(a => a.getAttribute("href")), ["../../index.html", "../../index.html", "../../about.html"], "the top bar's links climb by data-depth");
  const chapterEntry = fs.readFileSync(path.join(site.ROOT, "src/entries/chapter.js"), "utf8");
  const sceneFiles = fs.readdirSync(path.join(site.ROOT, "assets/scenes")).filter(f => /\.js$/.test(f));
  eq(sceneFiles.filter(f => !chapterEntry.includes("assets/scenes/" + f)), [], "the chapter entry imports every scene file under assets/scenes/");
  check(chapterEntry.indexOf("scenes3d.js") < chapterEntry.indexOf("assets/scenes/") && chapterEntry.lastIndexOf("assets/scenes/") < chapterEntry.indexOf("assets/site.js"), "… after the scene framework and before site.js");

  /* pages the shell refuses, each with a reason */
  const no = (attrs, rel, head) => refusal(() => render(attrs, rel, head)) || "(accepted)";
  check(/more than a title, a description and robots/.test(no('data-depth="0" data-page="page"', "x.html", HEAD + '\n<script src="extra.js"></script>')), "a tag of its own in <head> is refused: " + no('data-depth="0" data-page="page"', "x.html", HEAD + '\n<script src="extra.js"></script>'));
  check(/no <title>/.test(no('data-depth="0" data-page="page"', "x.html", '<meta name="description" content="d">')), "no title is refused");
  check(/data-page naming one of home, page, dashboard, arena/.test(no('data-depth="0" data-page="chapter"')), "data-page=\"chapter\" is refused: a chapter says data-chapter");
  check(/data-page naming one of/.test(no('data-depth="0"')), "neither data-chapter nor data-page is refused");
  check(/data-chapter and data-page/.test(no('data-depth="0" data-chapter="ch1" data-page="page"')), "both are refused");
  check(/but the file is 2 deep/.test(no('data-depth="0" data-page="page"', "parts/p/c.html")), "a data-depth that is not the file's depth is refused");
  check(/data-scenes, which is no longer read/.test(no('data-depth="2" data-chapter="c" data-scenes="one"', "parts/p/c.html")), "data-scenes is refused: every chapter loads every scene");
  check(/data-nav is "elsewhere"/.test(no('data-depth="0" data-page="page" data-nav="elsewhere"')), "an unknown data-nav is refused");
  check(/no <!--bm:topbar-->/.test(refusal(() => shell.renderShell(marked('data-depth="0" data-page="page"').replace("<!--bm:topbar-->", ""), "x.html")) || ""), "a head marker without the top-bar marker is refused");
  check(/must be the first thing inside <body>/.test(refusal(() => shell.renderShell(marked('data-depth="0" data-page="page"').replace("<!--bm:topbar-->\n\n", "<p>before</p>\n<!--bm:topbar-->\n\n"), "x.html")) || ""), "a top-bar marker that is not first in <body> is refused");

  /* a message about the content points at the source file's line, not the document's */
  const page = site.page(src, "x.html");
  eq([page.doc.query("#first").line, src.split("\n").findIndex(l => /id="first"/.test(l)) + 1, page.text.split("\n").findIndex(l => /id="first"/.test(l)) + 1 > 30],
    [13, 13, true], "a node's line is its line in the source file, though the document is some thirty lines longer");
  eq([page.doc.query("script").line, page.doc.query("header.topbar").line], [4, 9], "a tag the shell wrote has the line of its marker");

  /* the shell check: what it records, and what it notices */
  const facts = (html) => shellOf(parse(html));
  const base = facts(render('data-depth="2" data-chapter="ch99" data-part="algebra"', "parts/p/c.html"));
  eq([base.body, base.topbar], ["<body data-depth='2' data-chapter='ch99' data-part='algebra'>",
    ["Skip to content -> #main", "∑ Basic Mathematics -> ../../index.html", "Contents -> ../../index.html", "How to use this -> ../../about.html", "button: Switch between light and dark"]],
    "the record of a page: its body tag without what only the shell reads, and the top bar's links");
  const bootLine = base.head.find(l => /^<script>#[0-9a-f]+<\/script>$/.test(l));
  check(bootLine && base.head.includes("<script type='module' src='../../src/entries/chapter.js'>") && base.head[2] === "<title>A title</title>", "… and every tag of its head, attributes and all, the inline boot script as a fingerprint of its text");
  eq(shellDiff(base, base), [], "the same shell is no difference");
  const expanded = render('data-depth="2" data-chapter="ch99" data-part="algebra"', "parts/p/c.html");
  const fontsLink = '<link rel="stylesheet" href="../../src/vendor/fonts.css">', katexLink = '<link rel="stylesheet" href="../../src/vendor/katex.css">';
  check(expanded.includes(fontsLink + "\n" + katexLink + '\n<link rel="stylesheet" href="../../assets/site.css">'), "the vendor stylesheets are linked in order, before the site's own");
  check(/^head entry \d+ is now `<link rel='stylesheet' href='..\/..\/src\/vendor\/fonts.css' media='print'>`, accepted `<link rel='stylesheet' href='..\/..\/src\/vendor\/fonts.css'>`/.test(shellDiff(facts(expanded.replace(fontsLink, fontsLink.replace(">", ' media="print">'))), base)[0] || ""), "an attribute added to a link shows");
  const swapped = expanded.replace(fontsLink + "\n" + katexLink, katexLink + "\n" + fontsLink);
  check(swapped !== expanded && /^head entry \d+ is now `<link rel='stylesheet' href='..\/..\/src\/vendor\/katex.css'>`/.test(shellDiff(facts(swapped), base)[0] || ""), "two stylesheets in the other order show");
  const cdn = '<script defer src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/katex.min.js"></script>';
  check(/^head entry \d+ is now `<script defer src='https:[^`]*katex.min.js'>`/.test(shellDiff(facts(expanded.replace(katexLink, katexLink + "\n" + cdn)), base)[0] || ""), "a CDN script put back shows");
  const edited = shellDiff(facts(expanded.replace('root.setAttribute("data-theme", theme);', 'root.setAttribute("data-theme", theme); /* edited */')), base);
  check(edited.length === 1 && /^head entry \d+ is now `<script>#[0-9a-f]+<\/script>`, accepted `<script>#[0-9a-f]+<\/script>`$/.test(edited[0]), "an edit to the boot script shows as a new fingerprint: " + edited[0]);
  /* what the scripts must be, record or no record */
  const problems = (html, kind) => scriptsProblems("parts/p/c.html", parse(html), kind || "chapter");
  eq(problems(expanded), [], "the scripts of a chapter are the boot script and the chapter entry: no problem");
  check(/^the module script is "..\/..\/src\/entries\/chapter.js", not the entry of a home page/.test(problems(expanded, "home")[0] || ""), "a chapter's entry on a page of another kind fails");
  check(/^2 module scripts, not one/.test(problems(expanded.replace('<script type="module" src="../../src/entries/chapter.js"></script>', '<script type="module" src="../../src/entries/chapter.js"></script>\n<script type="module" src="../../src/entries/home.js"></script>'))[0] || ""), "a second module script fails");
  check(/^a page has no classic <script src>/.test(problems(expanded.replace(katexLink, katexLink + '\n<script defer src="../../assets/site.js"></script>'))[0] || ""), "a classic script of the site's own fails");
  check(/^a page has no classic <script src>.*cdnjs/.test(problems(expanded.replace(katexLink, katexLink + "\n" + cdn))[0] || ""), "a classic script from a CDN fails, whatever the record says");
  check(/^the first script of <head> is not the boot script/.test(problems(expanded.replace('root.setAttribute("data-theme", theme);', ""))[0] || ""), "a boot script that is not src/boot.js fails");
  eq(shellDiff(facts(render('data-depth="2" data-chapter="ch99" data-part="geometry"', "parts/p/c.html")), base),
    ["the body tag is now `<body data-depth='2' data-chapter='ch99' data-part='geometry'>`, accepted `<body data-depth='2' data-chapter='ch99' data-part='algebra'>`"], "a changed body attribute shows");
  check(/^topbar entry 3 is now `Progress -> /.test(shellDiff(facts(expanded.replace(">Contents</a>", ">Progress</a>")), base)[0] || ""), "a top-bar link with another text shows");

  /* the types vite.config.ts reads are written by hand beside the script */
  const declared = fs.readFileSync(path.join(__dirname, "lib", "shell.d.ts"), "utf8").match(/^export (?:const|function) \w+/gm).map(d => d.split(" ")[2]);
  eq(declared.sort(), Object.keys(shell).sort(), "lib/shell.d.ts declares what lib/shell.js exports, no more and no less");
  const declaredVendor = fs.readFileSync(path.join(__dirname, "lib", "vendor.d.ts"), "utf8").match(/^export (?:const|function) \w+/gm).map(d => d.split(" ")[2]);
  eq(declaredVendor.sort(), Object.keys(vendor).sort(), "lib/vendor.d.ts declares what lib/vendor.js exports, no more and no less");

  /* the secrets check of check-dist: the shape of a key, not a word the library uses */
  const { secretsIn } = require("./check-dist");
  eq(secretsIn("key.startsWith(`sb_publishable_`)||key.startsWith(`sb_secret_`); /* Never expose your `service_role` key in the browser. */"), [], "supabase-js's own text, which names the prefixes of its keys and says service_role, is no secret");
  check(/sb_secret_/.test(secretsIn("const k = 'sb_secret_Ab12Cd34Ef56Gh78Ij90Kl12Mn34'")[0] || ""), "a new-format secret key fails");
  check(/service_role/.test(secretsIn("SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiJ9.e30.abc")[0] || ""), "a service-role key assigned to its usual name fails");
  check(/role "service_role"/.test(secretsIn("eyJhbGciOiJIUzI1NiJ9." + Buffer.from('{"role":"service_role"}').toString("base64url") + ".sig")[0] || ""), "a JWT whose role is service_role fails");
  eq(secretsIn("eyJhbGciOiJIUzI1NiJ9." + Buffer.from('{"role":"anon"}').toString("base64url") + ".sig"), [], "the anon key's JWT passes");
  check(/whsec_/.test(secretsIn("whsec_1234567890abcdef1234567890")[0] || "") && /sk-ant-/.test(secretsIn("sk-ant-api03-1234567890abcdefghij")[0] || ""), "a webhook secret and an Anthropic key fail");

  const file = JSON.parse(fs.readFileSync(path.join(__dirname, "shell.json"), "utf8"));
  eq(Object.keys(file).sort(), site.htmlPages(site.ROOT).slice().sort(), "tools/shell.json records every page of the site and no other");
  check(Object.keys(file).every(p => Array.isArray(file[p].head) && file[p].head.length > 10 && typeof file[p].body === "string" && Array.isArray(file[p].topbar)), "… each as head, body and topbar");
  check(Object.keys(file).every(p => !file[p].head.some(l => /https?:\/\//.test(l))), "… and no page's head names another server");
}

/* ------------------------------------------------------------ apply-shell -- */
{
  const world = (files, atBase) => {
    const w = { files: Object.assign({}, files), written: [], lines: [] };
    w.io = {
      pages: Object.keys(files),
      read: p => w.files[p],
      write: (p, src) => { w.written.push(p); w.files[p] = src; },
      atBase: p => (atBase && atBase.hasOwnProperty(p) ? atBase[p] : null),
      log: line => w.lines.push(line)
    };
    return w;
  };
  /* whole pages, as the site had them: the expansion of a marked one */
  const want = {
    "index.html": marked('data-depth="0" data-page="home" data-nav="home"'),
    "about.html": marked('data-depth="0" data-page="page" data-nav="about"'),
    "insights.html": marked('data-depth="0" data-page="dashboard"', HEAD + '\n<meta name="robots" content="noindex">'),
    "parts/p/c.html": marked('data-depth="2" data-chapter="ch99" data-part="algebra"'),
    "parts/p/d.html": marked('data-depth="2" data-chapter="ch98" data-part="algebra"')
  };
  const was = {};
  Object.keys(want).forEach(p => { was[p] = shell.renderShell(want[p], p); });

  let w = world(was);
  eq(applyShell.run({ check: true }, w.io), 1, "apply-shell --check with whole pages exits 1");
  eq([w.written, w.lines[0], w.lines[w.lines.length - 1]], [[], 'would mark index.html: data-page="home" data-nav="home"', "would mark 5 of 5 pages; expanded, each is the document it was, byte for byte"], "… saying what each page would say, and writing nothing");
  eq(applyShell.run({ write: true }, w.io), 0, "apply-shell --write exits 0");
  eq([w.written.length, Object.keys(want).filter(p => w.files[p] !== want[p])], [5, []], "… and each page is found again as the kind and top bar it was written from");

  w.lines.length = 0; w.written.length = 0;
  eq([applyShell.run({ check: true }, w.io), w.written, w.lines], [0, [], ["nothing to do: all 5 pages carry the markers"]], "--check afterwards has nothing to do");
  w = world(want, was);
  eq([applyShell.run({ check: true, base: "then" }, w.io), w.lines], [0, ["nothing to do: all 5 pages carry the markers; expanded, 5 of them are the document they were at then, byte for byte, and from the content wrapper on not a byte differs"]], "--check --base holds the marked pages to the whole ones");

  /* a page whose content differs from the base by a byte, and one whose head does */
  w = world(Object.assign({}, want, { "about.html": want["about.html"].replace("<p>Text.</p>", "<p>Text. </p>") }), was);
  eq(applyShell.run({ check: true, base: "then" }, w.io), 1, "--check --base fails a page whose content gained a space");
  check(/^FAIL {2}about\.html: the bytes from the content wrapper to the end of the file changed/.test(w.lines[0] || ""), "… saying so: " + w.lines[0]);
  w = world(Object.assign({}, want, { "about.html": want["about.html"].replace(' data-nav="about"', "") }), was);
  eq([applyShell.run({ check: true, base: "then" }, w.io), /^FAIL {2}about\.html: expanded, it is not the original document/.test(w.lines[0] || "")], [1, true], "… and a page that now has another top bar");

  /* a whole page no kind expands to: one script more than any list has */
  const odd = Object.assign({}, was, { "about.html": was["about.html"].replace("</head>", '<script defer src="assets/extra.js"></script>\n</head>') });
  w = world(odd);
  eq(applyShell.run({ write: true }, w.io), 1, "--write with a page no kind expands to exits 1");
  eq([w.written, w.files["index.html"] === was["index.html"], w.lines.filter(l => /^write /.test(l))], [[], true, []], "… writes nothing and claims no write");
  check(/^FAIL {2}about\.html: no kind of page in lib\/shell\.js expands to this document/.test(w.lines[0] || "") && /nothing written$/.test(w.lines[w.lines.length - 1] || ""), "… and names the page: " + JSON.stringify(w.lines));
}

/* ------------------------------------------------------------------ serve -- */
/* what lib/serve.js hands out from a tree written here: a build is served as it is,
   and a page that still carries a shell marker (a source page put where a build should
   be) is refused rather than served half-written */
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bm-serve-"));
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), text); };
  const whole = '<!doctype html><html><head><title>t</title></head><body data-depth="0"><main id="main"><p>x</p></main></body></html>';
  const fixture = '<!doctype html><html><head><title>f</title></head><body><main id="main"><p>fixture</p></main></body></html>';
  put("dist/index.html", whole);
  put("dist/parts/p/c.html", whole.replace('data-depth="0"', 'data-depth="2"'));
  put("dist/marked.html", marked('data-depth="0" data-page="home" data-nav="home"'));
  put("dist/assets/x.js", "window.x = 1;");
  put("fixtures/states.html", fixture);
  const get = async (server, rel) => { const r = await fetch(server.url + rel); return { status: r.status, text: await r.text(), type: r.headers.get("content-type") }; };
  try {
    const dist = await serve.start(path.join(tmp, "dist"), "HEAD", { extraRoots: { "/tools/fixtures/": path.join(tmp, "fixtures") } });
    try {
      eq((await get(dist, "index.html")).text, whole, "serve: a build is served as it is");
      eq((await get(dist, "parts/p/c.html")).status, 200, "serve: a chapter page too");
      eq((await get(dist, "assets/x.js")).type, "text/javascript; charset=utf-8", "serve: a script goes out as JavaScript");
      const stray = await get(dist, "marked.html");
      eq([stray.status, /^refused: marked\.html carries a shell marker: it is a source page, not a built one/.test(stray.text)], [500, true], "serve: a page that still carries a marker is refused, not served with its markers — got " + JSON.stringify(stray.text.slice(0, 80)));
      eq((await get(dist, "tools/fixtures/states.html")).text, fixture, "serve: a fixture comes from its own directory, as it is");
      eq((await get(dist, "missing.html")).status, 404, "serve: a file that is not there is a 404");
    } finally { await dist.close(); }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

  console.log((fails ? "FAILED" : "ok") + " checks: " + passes + " checks passed" + (fails ? ", " + fails + " failed" : ""));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("FAIL serve: " + (e.stack || e)); process.exit(1); });
