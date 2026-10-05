#!/usr/bin/env node
/* Regression checks for the content fixes in ch08 and ch16 (review 2, findings 22–28).
     1. the det3 scene: its first mission needs a genuinely slanted solid (a permuted or
        turned upright box does not count), and its readout speaks of the sign only in the
        words §16.3 has (swapping two rows), never of handedness
     2. s3d-rows-vol asks for a determinant the rowops figure can never print: the figure
        starts at 12 and its moves only multiply by 1, −1 or 2
     3. every "Section check" is the last exercise of its section, with no h3 after it
     4. s3d-det-flat names row 3 with the chapter's own c_1, c_2, c_3
     5. in the browser, s3d-room accepts its answer with or without the unit (and as 11.00
        or +11, which the old number compare took), and still
        refuses a wrong length with a unit
   Checks 1 to 4 read the source files; 5 loads the page from the built site as
   lib/target.js serves it (dist/, which must be current), with every request off that
   server aborted and the one for bundle/three.js with it, so the page's 3D stages stay
   on the SVG painter on every machine: this script is part of the deploy gate (ci.yml,
   test:browser:core), which is not retried, and it tests the exercises, not the painter.
   Usage: node tools/game/content.test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const site = require("../lib/site");
const target = require("../lib/target");

const ROOT = site.ROOT;
const CH08 = "parts/3-coordinates/08-coordinates.html";
const CH16 = "parts/4-topics/16-determinants.html";
let fails = 0, passes = 0;
function check(cond, what) {
  if (cond) passes++;
  else { fails++; console.error("FAIL " + what); }
}
function eq(a, b, what) { check(JSON.stringify(a) === JSON.stringify(b), what + " — got " + JSON.stringify(a) + ", want " + JSON.stringify(b)); }
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/* the scene definitions, with the vector helpers they borrow from BM3D */
function scenes() {
  const defs = {};
  const V = {
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    add: (a, b) => a.map((x, i) => x + b[i]), sub: (a, b) => a.map((x, i) => x - b[i]),
    scale: (a, k) => a.map((x) => x * k), len: (a) => Math.hypot(a[0], a[1], a[2]),
    lerp: (a, b, u) => a.map((x, i) => x + (b[i] - x) * u)
  };
  const ctx = { window: { BM3D: { V, define: (n, d) => { defs[n] = d; } } } };
  vm.createContext(ctx);
  vm.runInContext(read("assets/scenes/det3.js"), ctx);
  return defs;
}
function det(m) {
  return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}

/* the block of one exercise, by id */
function exercise(src, id) {
  const at = src.indexOf('id="' + id + '"');
  if (at < 0) return "";
  const start = src.lastIndexOf("<div", at);
  const next = src.indexOf('<div class="ex"', at);
  const h = src.slice(at).search(/<h[23] /);
  const end = Math.min(next < 0 ? src.length : next, h < 0 ? src.length : at + h);
  return src.slice(start, end);
}

/* ------------------------------------------------------------- 1. det3 */
{
  const d = scenes().det3;
  const slant = d.missions[0];
  check(/slant/i.test(slant.text), "the first det3 mission is the slant one");
  check(!slant.test({ m: [[2, 0, 0], [0, 3, 0], [0, 0, 1]] }), "slant mission: false on the starting box");
  check(!slant.test({ m: [[0, 3, 0], [0, 0, 1], [2, 0, 0]] }), "slant mission: false on the starting box with its rows reordered");
  check(!slant.test({ m: [[1, 1, 0], [-1, 1, 0], [0, 0, 3]] }), "slant mission: false on a turned rectangular box of volume 6");
  check(slant.test({ m: [[2, 0, 0], [0, 3, 0], [1, 1, 1]] }), "slant mission: true on a slid top face, det 6");
  check(!slant.test({ m: [[2, 0, 0], [0, 3, 0], [1, 1, -1]] }), "slant mission: false on a slant of det −6");
  [[[2, 0, 0], [0, 3, 0], [1, 1, 2]], [[0, 3, 0], [2, 0, 0], [1, 1, 2]], [[2, 0, 0], [0, 3, 0], [1, 1, 0]]].forEach((m) => {
    const say = d.say({ m: m, lock: [] }, false);
    check(!/handed/i.test(say), "det3 readout does not speak of handedness — " + say);
    if (det(m)) check(/swap any two rows/.test(say), "det3 readout ties the sign to swapping rows — " + say);
  });
  check(!/handed/i.test(read("assets/scenes/det3.js")), "det3.js never says handed");
}

/* ------------------------------------------------------ 2. s3d-rows-vol */
{
  const src = read(CH16);
  const block = exercise(src, "s3d-rows-vol");
  const ans = Number((/data-answer="([^"]+)"/.exec(block) || [])[1]);
  check(isFinite(ans) && ans !== 0, "s3d-rows-vol has a numeric answer");
  /* every determinant the rowops figure can show: its start times a product of 1, −1 and 2 */
  const r = scenes().rowops;
  const start = det(r.state.m);
  eq(start, 12, "rowops starts at determinant 12");
  let shown = false;
  for (let n = 0; n < 12; n++) if (Math.abs(ans) === Math.abs(start) * Math.pow(2, n)) shown = true;
  check(!shown, "the follow-up's answer " + ans + " is never on the rowops readout");
  check(!/Start: det/.test(block) && !/\b12\b/.test((/<div class="ex-q">([\s\S]*?)<\/div>/.exec(block) || [])[1] || ""),
    "the follow-up question does not quote the figure's number");
  /* the arithmetic the solution claims: a diagonal box, its determinant, one swap */
  const rows = [[3, 0, 0], [0, 1, 0], [0, 0, 5]];
  check(block.indexOf("(3,0,0)") > -1 && block.indexOf("(0,1,0)") > -1 && block.indexOf("(0,0,5)") > -1, "the follow-up gives the box's rows");
  eq(-det(rows), ans, "shears keep the determinant and one swap flips it");
  check(!/handed/i.test(src), "ch16 never says handed");
}

/* -------------------------------------------- 3. Section check closes */
{
  const files = ["parts/1-algebra", "parts/2-geometry", "parts/3-coordinates", "parts/4-topics"]
    .reduce((all, dir) => all.concat(fs.readdirSync(path.join(ROOT, dir)).filter((f) => /\.html$/.test(f)).map((f) => dir + "/" + f)), []);
  let sections = 0;
  files.forEach((f) => {
    const body = read(f).split(/<section class="practice"/)[0];
    body.split(/(?=<h2 id=")/).slice(1).forEach((part) => {
      const sid = (/<h2 id="([^"]+)"/.exec(part) || [])[1];
      const at = part.indexOf('data-label="Section check"');
      if (at < 0) return;
      sections++;
      const after = part.slice(at + 1);
      check(after.indexOf('<div class="ex"') < 0, f + " §" + sid + ": no exercise after the Section check");
      check(!/<h3 /.test(after), f + " §" + sid + ": no subsection after the Section check");
    });
  });
  check(sections >= 30, "found the chapters' Section checks (" + sections + ")");
  const ch08 = read(CH08);
  check(ch08.indexOf('id="s3d-dist"') < ch08.indexOf('id="k1"') && ch08.indexOf('id="k1"') < ch08.indexOf('<h2 id="circle"'),
    "ch08: k1 closes §8.2, after One more dimension");
  check(ch08.indexOf('id="s3d-slice"') < ch08.indexOf('id="k2"') && ch08.indexOf('id="k2"') < ch08.indexOf('<h2 id="rational-points"'),
    "ch08: k2 closes §8.3, after Slicing a sphere");
}

/* ------------------------------------------------- 4. s3d-det-flat */
{
  const block = exercise(read(CH16), "s3d-det-flat");
  check(/\(c_1, c_2, 0\)/.test(block), "s3d-det-flat's answer names row 3 (c_1, c_2, 0)");
  check(!/\$\(a, b, 0\)\$|\$\(a, 0, 0\)\$|\$\(0, b, 0\)\$/.test(block), "s3d-det-flat no longer calls row 3's entries a and b");
  check(/c_3/.test(block), "s3d-det-flat keeps c_3 in the derivation");
}

/* ------------------------------------------------- 5. s3d-room, live */
async function browserPart() {
  const { chromium } = require("../lib/pw").playwright();
  const server = await target.start(site.parseArgs(process.argv.slice(2)));
  console.log("content: " + server.where);
  const THREE_CHUNK = /\/bundle\/three\.js(?:[?#]|$)/;
  const offline = (r) => server.owns(r.request().url()) && !THREE_CHUNK.test(r.request().url()) ? r.continue() : r.abort();
  const browser = await chromium.launch();
  try {
    const cases = [["11", true], ["11 m", true], ["11m", true], ["11 metres", true], ["11 meters", true], ["11.", true],
      ["11.00", true], ["+11", true],
      ["12 m", false], ["121", false], ["11 cm", false]];
    for (const [given, right] of cases) {
      const context = await browser.newContext();
      await context.route(/^(https?|wss?):/, offline);
      await context.addInitScript(() => { try { localStorage.setItem("bm.lesson.v1", '{"mode":"page"}'); } catch (e) { /* fine */ } });
      const page = await context.newPage();
      await page.goto(server.url + CH08);
      await page.waitForFunction(() => document.readyState === "complete");
      const ex = page.locator("#s3d-room");
      const input = ex.locator(".ex-form input[type=text]").first();
      await input.fill(given);
      await input.press("Enter");
      const st = await ex.getAttribute("data-state");
      eq(st, right ? "correct" : "wrong", "s3d-room graded " + JSON.stringify(given));
      if (given === "11") eq(await input.getAttribute("placeholder"), "in metres", "s3d-room keeps its placeholder");
      await context.close();
    }
    /* every way of writing 11 (bare, as the old number compare took it, or with the unit
       spelt either way) grades right; a wrong length or unit never does */
    const context = await browser.newContext();
    await context.route(/^(https?|wss?):/, offline);
    const page = await context.newPage();
    await page.goto(server.url + CH08);
    await page.waitForFunction(() => window.BMSite && document.readyState === "complete");
    const forms = ["11", "11.0", "11.00", "+11", "11.", "11 M", "11 m.", "11 m", "11m", "11.0 m", "11.00 m", "+11 m",
      "11 metre", "11 metres", "11 meter", "11 meters", "11 Metres"];
    const wrong = ["12", "12 m", "121", "11 cm", "11 m²", "-11", "10.99", "11 km"];
    const got = await page.evaluate((all) => {
      const ex = document.getElementById("s3d-room");
      const key = ex.getAttribute("data-answer"), type = ex.getAttribute("data-type") || "exact";
      return all.map((g) => window.BMSite.grade(g, key, type, 0));
    }, forms.concat(wrong));
    forms.concat(wrong).forEach((g, i) => eq(got[i], i < forms.length, "s3d-room grade(" + JSON.stringify(g) + ")"));
    await context.close();
  } finally {
    await browser.close();
    await server.close();
  }
}

browserPart().catch((e) => { fails++; console.error("FAIL browser part: " + (e && e.stack || e)); }).then(() => {
  console.log((fails ? "FAILED" : "ok") + " — " + passes + " passed, " + fails + " failed");
  process.exit(fails ? 1 : 0);
});
