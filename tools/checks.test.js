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
   Usage: node tools/checks.test.js */
"use strict";
const fs = require("fs");
const path = require("path");

const { parse } = require("./lib/html");
const { exercisesOf } = require("./lib/keys");
const { CHECKS, result, pageKeys, lessonSteps, stepsDiff } = require("./check-static");
const assignIds = require("./assign-ids");

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

console.log((fails ? "FAILED" : "ok") + " checks: " + passes + " checks passed" + (fails ? ", " + fails + " failed" : ""));
process.exit(fails ? 1 : 0);
