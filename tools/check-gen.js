#!/usr/bin/env node
/* tools/check-gen.js — checks every Arena generator in data/gen/*.js.

   For each generator and 500 seeds: make() does not throw; no string in the
   problem contains NaN, undefined, Infinity or "[object"; the same seed gives
   the same problem; the first alternative of the answer key is accepted by the
   site's own grader (BMSite.grade, loaded from assets/site.js) with the
   problem's type; verify() returns true; the hint does not give the answer away.
   Then: every generator names a real curriculum section, there are at least 24,
   and every chapter has at least one.

     node tools/check-gen.js            run the checks; exit 1 on any failure
     node tools/check-gen.js --show     also print one sample problem per generator
     node tools/check-gen.js --seeds=N  use N seeds instead of 500
*/
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.resolve(__dirname, "..");
var args = process.argv.slice(2);
var SHOW = args.indexOf("--show") > -1;
var SEEDS = 500;
args.forEach(function (a) { var m = /^--seeds=(\d+)$/.exec(a); if (m) SEEDS = parseInt(m[1], 10); });

/* the smallest browser the site's scripts will run in: no DOM to speak of,
   storage that forgets, and a document that is already parsed */
function makeContext() {
  var store = {};
  var el = {
    getAttribute: function () { return null; }, setAttribute: function () {}, removeAttribute: function () {},
    hasAttribute: function () { return false; }, appendChild: function () {}, insertBefore: function () {},
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    addEventListener: function () {}, classList: { add: function () {}, remove: function () {} }, style: {}
  };
  var document = {
    readyState: "complete", body: el, documentElement: el,
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    getElementById: function () { return null; }, createElement: function () { return el; },
    addEventListener: function () {}
  };
  var window = {
    document: document,
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; }
    },
    matchMedia: function () { return { matches: false, addEventListener: function () {} }; },
    addEventListener: function () {},
    console: console
  };
  window.window = window;
  window.self = window;
  var ctx = vm.createContext(window);
  ctx.Math = Math;
  return ctx;
}

function load(ctx, rel) {
  var file = path.join(ROOT, rel);
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: rel });
}

var ctx = makeContext();
load(ctx, "data/curriculum.js");
load(ctx, "assets/site.js");
var genDir = path.join(ROOT, "data/gen");
var genFiles = fs.readdirSync(genDir).filter(function (f) { return /\.js$/.test(f); }).sort(function (a, b) {
  /* core.js defines BMGen, so it goes first */
  return (a === "core.js" ? -1 : b === "core.js" ? 1 : a < b ? -1 : a > b ? 1 : 0);
});
genFiles.forEach(function (f) { load(ctx, "data/gen/" + f); });

var C = ctx.BM_CURRICULUM, Site = ctx.BMSite, Gen = ctx.BMGen;
var failures = [];
function fail(id, seed, msg) { failures.push(id + (seed === null ? "" : " seed " + seed) + ": " + msg); }

if (!Site || typeof Site.grade !== "function") { console.error("assets/site.js did not export BMSite.grade"); process.exit(1); }
if (!Gen) { console.error("data/gen/core.js did not define BMGen"); process.exit(1); }

var TYPES = { number: 1, exact: 1, set: 1, expr: 1, fraction: 1 };
var BAD = /NaN|undefined|Infinity|\[object/;

/* every string reachable from the problem, except functions */
function strings(p) {
  var out = [p.q, p.answer, p.hint, p.placeholder || ""];
  (p.steps || []).forEach(function (s) { out.push(s); });
  return out;
}
function snapshot(p) {
  return JSON.stringify({ q: p.q, a: p.answer, t: p.type, h: p.hint, s: p.steps, ph: p.placeholder || "", tol: p.tol });
}

var list = Gen.list();
var sectionsOk = {};
C.chapters.forEach(function (ch) { ch.sections.forEach(function (s) { sectionsOk[ch.id + "#" + s.id] = true; }); });

list.forEach(function (spec) {
  if (!sectionsOk[spec.section]) fail(spec.id, null, "section " + spec.section + " is not in curriculum.js");
  if (!(spec.par >= 20 && spec.par <= 120)) fail(spec.id, null, "par " + spec.par + " is outside 20–120 s");
  var firstQ = null, sameQ = 0;
  for (var seed = 1; seed <= SEEDS; seed++) {
    var p, again;
    try { p = Gen.make(spec.id, seed); } catch (e) { fail(spec.id, seed, "make threw " + e.message); continue; }
    try { again = Gen.make(spec.id, seed); } catch (e2) { fail(spec.id, seed, "second make threw " + e2.message); continue; }
    if (!p || typeof p.q !== "string" || typeof p.answer !== "string" || typeof p.hint !== "string") {
      fail(spec.id, seed, "q, answer and hint must be strings"); continue;
    }
    if (!TYPES[p.type]) fail(spec.id, seed, "unknown type " + p.type);
    if (!p.steps.length) fail(spec.id, seed, "no worked steps");
    if (!p.hint.trim()) fail(spec.id, seed, "empty hint");
    strings(p).forEach(function (s) {
      if (typeof s !== "string") fail(spec.id, seed, "a non-string step");
      else if (BAD.test(s)) fail(spec.id, seed, "bad text: " + s);
    });
    if (snapshot(p) !== snapshot(again)) fail(spec.id, seed, "not deterministic");
    var first = p.answer.split("|")[0].trim();
    if (!first) fail(spec.id, seed, "empty answer");
    else if (!Site.grade(first, p.answer, p.type, p.tol)) fail(spec.id, seed, "grader rejects its own key " + first + " (" + p.type + ")");
    /* every alternative must at least be accepted on its own */
    p.answer.split("|").forEach(function (alt) {
      if (alt.trim() && !Site.matches(alt.trim(), alt.trim(), p.type, p.tol)) fail(spec.id, seed, "alternative " + alt + " does not match itself");
    });
    /* a number-like key must parse as a number */
    if ((p.type === "number" || p.type === "fraction") && !Site.grade(first, first, "number", 0)) fail(spec.id, seed, "key " + first + " is not a number");
    var ok;
    try { ok = typeof p.verify === "function" && p.verify() === true; } catch (e3) { ok = false; }
    if (!ok) fail(spec.id, seed, "verify() is not true for " + p.q + " = " + first);
    if (/\d/.test(first) && first.length >= 2 && p.hint.indexOf(first) > -1) fail(spec.id, seed, "hint contains the answer " + first);
    if (seed === 1) firstQ = p.q; else if (p.q === firstQ) sameQ++;
  }
  if (sameQ > SEEDS / 2) fail(spec.id, null, "most seeds give the same question");
  if (SHOW) {
    var s = Gen.make(spec.id, 7);
    console.log("\n[" + spec.id + "] " + spec.section + " · par " + spec.par + " s · " + (spec.timed ? "timed" : "untimed"));
    console.log("  Q: " + s.q);
    console.log("  A: " + s.answer + "  (" + s.type + ")");
    console.log("  H: " + s.hint);
    s.steps.forEach(function (st, i) { console.log("  " + (i + 1) + ". " + st); });
  }
});

if (list.length < 24) fail("all", null, "only " + list.length + " generators; at least 24 wanted");
C.chapters.forEach(function (ch) {
  if (!list.some(function (s) { return s.section.split("#")[0] === ch.id; })) fail(ch.id, null, "no generator for this chapter");
});

var chapters = {};
list.forEach(function (s) { chapters[s.section.split("#")[0]] = 1; });
if (failures.length) {
  console.error(failures.slice(0, 60).join("\n"));
  if (failures.length > 60) console.error("… and " + (failures.length - 60) + " more");
  console.error("\ncheck-gen: " + failures.length + " failure(s)");
  process.exit(1);
}
console.log("check-gen: " + list.length + " generators across " + Object.keys(chapters).length + " chapters and " +
  Gen.sections().length + " sections, " + SEEDS + " seeds each: all good.");
