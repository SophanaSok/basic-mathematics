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
     - CSS (lib/css.js and the stylesheet checks): the token tables per theme × panel,
       color-mix and see-through backgrounds, the flash-and-loop rule, colour literals,
       and what counts as the reading column and as motion or decoration in it
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
  /* the brand and the page links of a top bar (not the HUD's, the account chip or the sheet's) */
  const pageLinks = (html) => {
    const bar = parse(html).query("header.topbar");
    return [bar.query("a.brand")].concat(bar.query("nav").children_elements.filter(el => el.name === "a" && !el.hasAttribute("class")));
  };

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
  eq(sheets(out), ["src/vendor/fonts.css", "src/vendor/katex.css", "src/styles/tokens.css", "assets/site.css", "assets/game.css"], "a page links the fonts' and KaTeX's stylesheets, then the tokens, site.css and game.css");
  eq(scripts(out), ["src/entries/page.js"], "… and loads the one module entry of its kind, and no other script by URL");
  check(!/https?:\/\//.test(parse(out).query("head").children_elements.map(el => Object.values(el.attrs).join(" ")).join(" ")), "nothing in <head> names another server");
  const outDoc = parse(out), all = outDoc.queryAll("script");
  eq(all.map(s => (s.hasAttribute("src") ? "" : "inline ") + (s.getAttribute("type") || "") + (s.hasAttribute("defer") ? " defer" : "")), ["inline ", "module", "inline "], "the boot script is inline, the entry is a module, the HUD script is inline, and there is no classic script");
  eq(all[0].textContent.trim(), fs.readFileSync(path.join(site.ROOT, "src/boot.js"), "utf8").trim(), "the first inline script is src/boot.js, whole");
  const barEl = outDoc.query("header.topbar");
  check(all[2].textContent.trim() === shell.hudScript() && barEl.parent.children_elements[barEl.parent.children_elements.indexOf(barEl) + 1] === all[2], "the HUD script comes straight after the top bar, and is hudScript()");
  const hudText = shell.hudScript();
  check(/^\(function \(\) \{\n"use strict";\n/.test(hudText) && /window\.BMHud = \{ threshold: threshold, /.test(hudText) && /prefill\(document, window\);/.test(hudText) && !/^\s*(export|import)\b|\/\*/m.test(hudText),
    "the HUD script is src/hud/'s modules in one function, without their exports, imports and comments, handing window.BMHud over and then filling the HUD");
  check(!/prefill\(document, window\)/.test(shell.hudLibrary()) && /window\.BMHud = /.test(shell.hudLibrary()), "hudLibrary() is the same without the call, for a test with no page");
  const withSource = (files, fn) => { shell.useSource(rel => files[rel] !== undefined ? files[rel] : fs.readFileSync(path.join(site.ROOT, rel), "utf8")); try { return fn(); } finally { shell.useSource(rel => fs.readFileSync(path.join(site.ROOT, rel), "utf8")); } };
  check(/an export the HUD script cannot take/.test(refusal(() => withSource({ "src/hud/levels.js": "export default 1;\n" }, () => shell.hudScript())) || ""), "a module with an export the shell cannot take off is refused");
  check(/imports levelInfo, which src\/hud\/levels.js does not export/.test(refusal(() => withSource({ "src/hud/levels.js": "export function threshold() {}\n" }, () => shell.hudScript())) || ""), "an import of a name the earlier module does not export is refused");
  check(/does not parse/.test(refusal(() => withSource({ "src/hud/levels.js": "export function levelInfo() {}\nexport function threshold( {\n" }, () => shell.hudScript())) || ""), "a HUD script that would not parse is refused");
  check(/would end the inline tag/.test(refusal(() => withSource({ "src/hud/levels.js": 'export function levelInfo() {}\nexport const Y = "</script>";\n' }, () => shell.hudScript())) || ""), "a closing script tag in a HUD module is refused");
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
  eq(pageLinks(out).map(a => a.getAttribute("href")), ["index.html", "index.html", "about.html"], "the usual top bar: brand, Contents, How to use this");

  /* the HUD and the sheet are in the markup: every slot labelled in a sentence, the game
     slots only where a page of the kind uses them, and every input of the sheet naming
     its preference */
  const hudOf = (html) => {
    const bar = parse(html).query("header.topbar");
    const hudEl = bar.query("nav").query("div.hud");
    return {
      slots: hudEl.children_elements.map(el => el.getAttribute("class") + (el.hasAttribute("data-slot") ? "[slot]" : "") + (el.hasAttribute("hidden") ? "[hidden]" : "")),
      labels: hudEl.children_elements.map(el => el.getAttribute("aria-label")),
      after: bar.query("nav").children_elements.slice(bar.query("nav").children_elements.indexOf(hudEl) + 1).map(el => el.getAttribute("class")),
      strip: !!bar.query(".hud-strip"),
      sheet: bar.query("dialog#hud-sheet"),
      links: bar.query("ul.hud-links").queryAll("a").length,
      prefs: bar.query("dialog#hud-sheet").queryAll("input").map(i => i.getAttribute("data-pref") + (i.getAttribute("type") === "radio" ? "=" + i.getAttribute("value") : ""))
    };
  };
  let h = hudOf(out);
  eq(h.slots, ["hud-level", "hud-streak", "hud-combo[hidden]"], "a page of no game has the level, the streak and the combo (empty until it has pips)");
  check(h.labels.every(l => (l || "").split(" ").length >= 5), "every slot of the HUD has a sentence for a label: " + JSON.stringify(h.labels));
  eq([h.after, h.strip], [["acct", "icon-btn hud-sound", "icon-btn hud-menu"], false], "then the account chip, the sound and the menu buttons; no second row");
  eq(h.prefs, ["calm", "sound", "volume", "motion", "transparency", "theme=light", "theme=dark", "theme=system", "panel=light", "panel=dark", "gfx=auto", "gfx=low", "gfx=mid", "gfx=high", "map3d"],
    "the sheet: Study mode first, then sound and volume, motion, transparency, theme, reading panel, graphics quality, the 3D map");
  check(/Keeps hints, reviews and progress\. Removes hearts, combo, bosses, motion and sound\./.test(h.sheet.textContent) && h.links === 5, "Study mode says what it keeps and what it removes, and the sheet keeps the menu's links");
  eq(hudOf(render('data-depth="2" data-chapter="ch99" data-part="algebra"', "parts/p/c.html")).slots, ["hud-level", "hud-streak", "hud-combo[hidden]", "hud-hearts[slot][hidden]"], "a chapter keeps a place for the boss's hearts");
  h = hudOf(render('data-depth="0" data-page="arena"'));
  eq([h.slots, h.strip], [["hud-level", "hud-streak", "hud-combo[hidden]", "hud-hearts[slot][hidden]", "hud-timer[slot][hidden]"], true], "the Arena keeps a place for hearts and the clock, and has the second row for a narrow screen");

  /* the other kinds and top bars */
  eq(scripts(render('data-depth="0" data-page="dashboard"')).slice(-1), ["src/entries/dashboard.js"], "a dashboard loads the dashboard entry");
  out = render('data-depth="0" data-page="arena"');
  eq([sheets(out).slice(-1)[0], scripts(out).slice(-1)], ["assets/arena.css", ["src/entries/arena.js"]], "the arena has its stylesheet and its entry");
  out = render('data-depth="0" data-page="home" data-nav="home"');
  eq([sheets(out).slice(-2), scripts(out).slice(-1)], [["assets/scenes3d.css", "assets/map3d.css"], ["src/entries/home.js"]], "the home page has the map's stylesheet last and the home entry");
  Object.keys(shell.PAGE_KINDS).forEach(k => check(fs.existsSync(path.join(site.ROOT, shell.PAGE_KINDS[k].entry)), "the entry of kind " + k + " exists: " + shell.PAGE_KINDS[k].entry));
  eq(pageLinks(out).map(a => a.getAttribute("href")), ["index.html", "about.html"], "data-nav=\"home\": no Contents link on the contents page");
  eq(pageLinks(render('data-depth="0" data-page="page" data-nav="about"')).map(a => a.textContent).slice(1), ["Contents", "Progress"], "data-nav=\"about\": Contents and Progress");
  check(/<meta charset="utf-8">\n<meta name="robots" content="noindex">\n<meta name="viewport"/.test(render('data-depth="0" data-page="dashboard"', "x.html", HEAD + '\n<meta name="robots" content="noindex">')), "a robots tag goes right after the charset");

  /* chapters */
  out = render('data-depth="2" data-chapter="ch99" data-part="algebra"', "parts/p/c.html");
  check(/<body data-depth="2" data-chapter="ch99" data-part="algebra">/.test(out), "a chapter keeps data-chapter and data-part");
  const sc = scripts(out);
  eq([sc, sheets(out)[0], sheets(out).slice(-1)], [["../../src/entries/chapter.js"], "../../src/vendor/fonts.css", ["../../assets/scenes3d.css"]], "it loads the chapter entry and the vendor stylesheets by its depth, and the scenes' stylesheet is every chapter's");
  eq(pageLinks(out).map(a => a.getAttribute("href")), ["../../index.html", "../../index.html", "../../about.html"], "the top bar's links climb by data-depth");
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
  eq([base.body, base.topbar.slice(0, 11)], ["<body data-depth='2' data-chapter='ch99' data-part='algebra'>",
    ["Skip to content -> #main", "∑ Basic Mathematics -> ../../index.html", "Contents -> ../../index.html", "How to use this -> ../../about.html",
      "Level 1, Counter. 0 of 25 XP to level 2. Open your progress. -> ../../progress.html", "Sign in -> ../../account.html", "button: Sound", "button: Menu and settings",
      "button: Close menu and settings", "Contents -> ../../index.html", "How to use this -> ../../about.html"]],
    "the record of a page: its body tag without what only the shell reads, and the top bar's links and buttons by their labels, the sheet's among them");
  check(/^<script>#[0-9a-f]+<\/script>$/.test(base.topbar[base.topbar.length - 1]) && base.topbar.length === 15, "… and last, the HUD script after the top bar as a fingerprint of its text");
  const hudChanged = render('data-depth="2" data-chapter="ch99" data-part="algebra"', "parts/p/c.html").replace('"use strict";\nfunction threshold', '"use strict";\nvar edited = 1;\nfunction threshold');
  const hudEdited = shellDiff(facts(hudChanged), base);
  check(hudEdited.length === 1 && /^topbar entry 15 is now `<script>#[0-9a-f]+<\/script>`, accepted `<script>#[0-9a-f]+<\/script>`$/.test(hudEdited[0]), "an edit to the HUD script shows as a new fingerprint: " + hudEdited[0]);
  check(/^the body's one script is not the HUD script/.test(scriptsProblems("parts/p/c.html", parse(hudChanged), "chapter")[0] || ""), "… and a HUD script that is not hudScript() fails, whatever the record says");
  const bootLine = base.head.find(l => /^<script>#[0-9a-f]+<\/script>$/.test(l));
  check(bootLine && base.head.includes("<script type='module' src='../../src/entries/chapter.js'>") && base.head[2] === "<title>A title</title>", "… and every tag of its head, attributes and all, the inline boot script as a fingerprint of its text");
  eq(shellDiff(base, base), [], "the same shell is no difference");
  const expanded = render('data-depth="2" data-chapter="ch99" data-part="algebra"', "parts/p/c.html");
  const fontsLink = '<link rel="stylesheet" href="../../src/vendor/fonts.css">', katexLink = '<link rel="stylesheet" href="../../src/vendor/katex.css">';
  check(expanded.includes(fontsLink + "\n" + katexLink + '\n<link rel="stylesheet" href="../../src/styles/tokens.css">\n<link rel="stylesheet" href="../../assets/site.css">'), "the vendor stylesheets are linked in order, before the site's own, the tokens first of those");
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

/* -------------------------------------------------------------------- CSS -- */
/* lib/css.js and the stylesheet checks, on stylesheets written here: the token tables
   by theme and panel, color-mix and see-through backgrounds, the flash-and-loop rule,
   colour literals, and the reading column */
{
  const css = require("./lib/css");
  const T = css.tokens([
    ":root { --bg: #ffffff; --text: #111111; --frame-bg: #222233; }",
    ":root[data-theme=\"dark\"] { --frame-bg: #000000; }",
    ":root[data-panel=\"dark\"] { --bg: #101010; --text: #eeeeee; }",
    ":root, [data-part=\"a\"] { --part: #aa0000; --region-sky: #ffeeee; }",
    "[data-part=\"b\"] { --part: #0000aa; --region-sky: #eeeeff; }",
    ":root[data-panel=\"dark\"] [data-part=\"b\"] { --part: #8888ff; }",
    ":root[data-theme=\"dark\"] [data-part=\"b\"] { --region-sky: #000022; }",
    "@media print { :root { --bg: #fafafa; } }",
    "@supports (color: color-mix(in srgb, red 50%, blue)) { :root { --glass: color-mix(in srgb, var(--frame-bg) 80%, transparent); } }",
    ".switch { --sw: #123456; }"
  ].join("\n"));
  const at = (label) => T.scopes.find(s => s.label === label);
  eq(T.scopes.map(s => s.label), ["light", "dark", "light, dark panel", "dark, dark panel"], "css tokens(): one table per theme × panel, the defaults first");
  eq([at("dark").table["--bg"], at("dark").table["--frame-bg"]], ["#ffffff", "#000000"], "… the dark theme shades the frame and leaves the light panel alone");
  eq([at("light, dark panel").table["--bg"], at("light, dark panel").table["--frame-bg"]], ["#101010", "#222233"], "… the dark panel changes the paper and leaves the frame alone");
  eq([at("dark, dark panel").parts.b["--part"], at("dark, dark panel").parts.b["--region-sky"], at("dark").parts.b["--part"]], ["#8888ff", "#000022", "#0000aa"],
    "… a Part takes its own light value in the dark theme unless a block for that theme or panel overrides it");
  eq([at("light").table["--bg"], at("light").table.hasOwnProperty("--sw")], ["#ffffff", false], "… print blocks and a component's own properties are not the palette");
  check(at("light").table["--glass"] && /^color-mix/.test(at("light").table["--glass"]), "… an @supports block is, for the browsers it describes");
  eq(css.tokens(":root[data-theme=\"dark\"] { --x: #000000; }\n:root[data-panel=\"dark\"] { --x: #111111; }").overlap, [":root --x"], "… a name both a theme block and a panel block set is reported");

  eq(css.colorMix("color-mix(in srgb, #000000 50%, #ffffff)").map(Math.round), [128, 128, 128, 1], "css colorMix: half black, half white is grey");
  eq(css.colorMix("color-mix(in srgb, #1a1f33 88%, transparent)").map(v => +v.toFixed(2)), [26, 31, 51, 0.88], "… mixing with transparent keeps the colour and makes it see-through");
  eq(css.over(css.parseColor("color-mix(in srgb, #000000 50%, transparent)"), [255, 255, 255, 1]).map(Math.round), [128, 128, 128, 1], "css over(): half-black glass over white is grey");
  eq(css.parseColor(css.resolveVar("var(--glass)", at("light").table)).map(v => +v.toFixed(2)), [34, 34, 51, 0.8], "… and var() inside color-mix resolves first");

  const P = (value, more) => css.parseAnimation(Object.assign({ value }, more || {}));
  eq(P("pop 320ms cubic-bezier(.34, 1.56, .64, 1)"), [{ name: "pop", ms: 320, iterations: 1 }], "css parseAnimation: name, duration, one iteration by default");
  eq(P("tick-draw 400ms 100ms ease-out forwards, here .7s ease-in-out 3"), [{ name: "tick-draw", ms: 400, iterations: 1 }, { name: "here", ms: 700, iterations: 3 }], "… two animations, the second time a delay, seconds read as ms");
  eq(P("none"), [], "… `none` runs nothing");
  eq(P("spin 1s linear infinite")[0].iterations, Infinity, "… infinite is infinite");
  eq(P("", { name: "glow", duration: "250ms", count: "4" }), [{ name: "glow", ms: 250, iterations: 4 }], "… the longhands on their own");

  const { animationFaults, colourLiterals, columnPatterns, inColumn, quietKinds } = require("./check-static");
  const faults = (text) => animationFaults(text, { "--t-3": "240ms" }).filter(Boolean).map(f => f.selector + ": " + f.problem.split(" ")[0]);
  eq(faults(".a { animation: pop 320ms ease; } .b { animation: here 700ms ease 3; } .c { animation: x var(--t-3); }"), [], "animations: one pop, three slow repeats and a token duration pass");
  eq(faults(".c { animation: x var(--t-3) 2; }"), [".c: repeats"], "… a token duration is read: two cycles of 240ms are more than three a second");
  eq(faults(".a { animation: spin 2s linear infinite; }"), [".a: animates"], "… forever fails");
  eq(faults(".a { animation: blink 200ms 2; }"), [".a: repeats"], "… two cycles of 200ms (5 a second) fail");
  eq(faults(".a { animation: nod 800ms 4; }"), [".a: repeats"], "… four slow cycles fail: a loop in all but name");
  eq(faults(".a { animation: x var(--unknown) 1; }"), [".a: the"], "… a duration that cannot be read fails");
  eq(faults(".a { animation-name: x; animation-duration: 100ms; animation-iteration-count: infinite; }"), [".a: animates"], "… the longhands are read too");
  eq(faults(".a { --n: infinite; animation: pulse 1s var(--n); }"), [".a: the"], "… a count (or any word) that is a var() tokens.css does not define fails, not taken for one iteration");
  eq(faults(".a { animation-name: pulse; animation-duration: 1s; animation-iteration-count: var(--n); }"), [".a: the"], "… and so does such a count in the longhand");
  const strobe = "@keyframes strobe { 0%, 50%, 100% { opacity: 1; } 25%, 75% { opacity: 0; } }\n";
  eq(faults(strobe + ".a { animation: strobe 300ms; }"), [".a: flashes"], "… a strobe inside one cycle fails: two flashes in 300ms");
  eq(faults(strobe + ".a { animation: strobe 1.2s; }"), [], "… the same keyframes slowed to two flashes in 1.2s pass");
  eq(faults("@keyframes blink { 50% { color: var(--x); } }\n.a { animation: blink 250ms 2; }"), [".a: repeats"], "… a colour turned back and forth repeats too");
  eq(faults("@keyframes dim { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }\n.a { animation: dim 900ms 3; }"), [], "… one slow dip a cycle, three cycles, passes (the site's handle-dim)");
  eq(faults(".a { animation: strobe 300ms; }"), [], "… keyframes are read from the whole site: none here");
  eq(animationFaults(".a { animation: strobe 300ms; }", {}, css.keyframes(strobe)).filter(Boolean).map(f => f.problem.split(" ")[0]), ["flashes"], "… and given, they are");
  eq(css.flashesPerCycle(css.keyframes("@keyframes f { from { opacity: 0; } to { opacity: 1; } }").f), 0, "css flashesPerCycle: a fade in is no flash");
  eq(css.flashesPerCycle(css.keyframes(strobe).strobe), 2, "… a strobe of four turns is two");

  eq(colourLiterals("#main .x { color: var(--text); }\n.a { color: #fff; background: rgb(1 2 3); }\n.b { mask: url(\"data:image/svg+xml,%23ff0000\"); border-color: hsl(0 0% 0%); }\n/* #abc */\n.c { background: color-mix(in srgb, var(--a) 5%, var(--ink-shadow)); }")
    .map(c => c.literal + "@" + c.line), ["#fff@2", "rgb(@2", "hsl(@3"], "colours: literals in declarations, by line; an id selector, a data: URI, a comment and color-mix of tokens pass");
  eq(colourLiterals(".x { color: RGB(1,2,3); }\n.y { background: Hsla(0 0% 0% / .5); border-color: #ABCDEF; }").map(c => c.literal + "@" + c.line), ["RGB(@1", "Hsla(@2", "#ABCDEF@2"],
    "… in any letter case: CSS function names are case-insensitive");
  eq(colourLiterals(".x { color: red; box-shadow: 0 3px 0 color-mix(in srgb, var(--a) 50%, black); }\n.y { white-space: nowrap; border: 1px solid currentColor; background: transparent; outline-color: CanvasText; }\n.z { content: \"white\"; -webkit-mask: radial-gradient(circle, transparent 45%, black 48%); animation: red-out 1s; }")
    .map(c => c.literal + "@" + c.line), ["red@1", "black@1"], "… named colours too, but not white-space, currentColor, transparent, a system colour, a string, a mask's alpha or a name that only starts like one");

  const pats = columnPatterns(["ex", "ex-*", "widget"]);
  eq([".ex .tick path", "html:not([data-calm]) .ex-form", ".widget[data-inview] svg", "main > h2::before", ".hud-xpbar i", ".topbar .ex-link-like"].map(s => inColumn(s, pats, ["main"])),
    [true, true, true, true, false, true], "reading-column: a selector is in the column when it names a column class or element");
  eq([
    quietKinds({ animation: "pop 320ms ease" }, { light: {} }),
    quietKinds({ transition: "border-color .15s, transform var(--t-1)" }, { light: { "--t-1": "80ms" } }),
    quietKinds({ transition: "background-color .15s" }, { light: {} }),
    quietKinds({ background: "linear-gradient(red, blue)" }, { light: {} }),
    quietKinds({ "box-shadow": "0 4px 0 var(--edge)" }, { light: {} }),
    quietKinds({ "box-shadow": "0 0 12px var(--glow)" }, { light: {} }),
    quietKinds({ "-webkit-mask-image": "var(--motif)" }, { light: {} }),
    quietKinds({ "-webkit-mask": "var(--icon-tick) center / contain no-repeat" }, { light: {} }),
    quietKinds({ animation: "none" }, { light: {} })
  ], [["animation"], ["transition"], [], ["decoration"], [], ["decoration"], ["decoration"], [], []],
    "… what counts: an animation, a transition that moves, a gradient, a soft shadow, a motif; not a colour fade, a hard tile edge, an icon mask or `none`");
  const toks = { light: { "--grid-motif": "linear-gradient(black 1px, transparent 1px)", "--surface": "#ffffff", "--sheen": "linear-gradient(#fff, #eee)", "--paper-tex": "url(paper.png)",
    "--mark-ok": "url(\"data:image/svg+xml,x\")", "--icon-tick": "url(\"data:image/svg+xml,y\")" } };
  eq([
    quietKinds({ "background-image": "var(--grid-motif)" }, toks),
    quietKinds({ "-webkit-mask-image": "var(--grid-motif)", "mask-image": "var(--grid-motif)" }, toks),
    quietKinds({ background: "var(--surface) var(--grid-motif)" }, toks),
    quietKinds({ "background-image": "var(--motif)" }, toks),
    quietKinds({ background: "var(--sheen)" }, toks),
    quietKinds({ "background-image": "var(--paper-tex)" }, toks),
    quietKinds({ "mask-image": "var(--sheen)" }, toks),
    quietKinds({ background: "var(--surface)" }, toks),
    quietKinds({ "background-image": "var(--mark-ok)" }, toks),
    quietKinds({ "-webkit-mask": "var(--icon-tick) center / contain no-repeat" }, toks)
  ], [["decoration"], ["decoration"], ["decoration"], ["decoration"], ["decoration"], ["decoration"], ["decoration"], [], [], []],
    "… read through the tokens: the graph paper (--grid-motif) as a background or a mask, any motif token, a gradient or picture behind a token; not a plain colour, an answer mark or an icon");

  const { printGaps } = require("./check-static");
  const printed = (css) => printGaps(css).filter(g => g.problem).map(g => g.problem.split(" ")[0]);
  eq(printed(":root { --on-accent: #fff; }\n:root[data-panel=\"dark\"] { --on-accent: #000; --xp-ink: #ff0; }\n@media print { :root, :root[data-panel=\"dark\"] { --on-accent: #fff; } }"), ["--xp-ink"],
    "print: a token the dark panel sets and print does not restate is reported");
  eq(printed(":root[data-panel=\"dark\"] [data-part=\"b\"] { --part: #fff; }\n@media print { :root[data-panel=\"dark\"] [data-part=\"b\"] { --part: #000; } }"), [], "… a Part's dark-panel block restated in print passes");
  eq(printed("@media print { :root[data-panel=\"dark\"] { --ok: #14713a; --mark-ok: url(\"data:image/svg+xml,stroke='%236fdc98'\"); } }"), ["print's"], "… a print answer mark drawn in another colour than print's --ok is reported");
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
