#!/usr/bin/env node
"use strict";
/* Writes tools/fixtures/grade-golden.json: what the site's grader (BMSite.grade, loaded
   from assets/site.js as tools/check-static.js loads it) says about a fixed set of
   answers, so a change to how answers are graded shows up as a diff of that file, and
   src/core/grade.test.ts holds the grader to it case by case.

   The keys, each graded under its own type and tolerance:
     - every answer key on the course's pages: every typed answer, every blank's own key,
       every option list and tick-every-option list (as site.js judge() grades them:
       one option as a number, several as a set), every figure's (data-compare)
     - the hand cases of src/learn/detectors.test.ts (the detector fixtures)
     - 2,000 problems of the Arena's generators (data/gen/), drawn with seeded seeds
   The answers given against each key: the whole key, and for each of its "|"
   alternatives the alternative itself, its sign flipped (in front, and everywhere), its
   reciprocal, its first number times 10 and divided by 10, its unicode spellings (−, –,
   ×, √, π, ≤, ≥, ≠, upper case) and its whitespace variants (padded, spaced out, a
   trailing full stop).

   The output depends only on the tree: pages in lib/site.js htmlPages order, exercises
   in document order, generators in the order data/gen/ adds them, seeds from a fixed
   mulberry32 stream. Run it again after a change that is meant to change grading, and
   read the diff.

   Usage: node tools/gen-grade-golden.js */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const site = require("./lib/site");
const { exercisesOf } = require("./lib/keys");
const { loadGrade } = require("./check-static");

const ROOT = site.ROOT;
const OUT = "tools/fixtures/grade-golden.json";
const GEN_PROBLEMS = 2000;
const GEN_SEED = 20261006;

/* ------------------------------------------------------------- the keys -- */

function courseKeys() {
  const out = [];
  site.htmlPages(ROOT).forEach(page => {
    const { doc } = site.readPage(ROOT, page);
    exercisesOf(doc).forEach(e => {
      const tol = parseFloat(e.el.getAttribute("data-tol") || "") || 0;
      const from = page + "#" + e.key;
      if (e.kind === "blank") {
        e.el.queryAll(".blank").forEach((b, j) => {
          out.push({ from: from + " blank " + (j + 1), answer: b.getAttribute("data-answer") || "", type: b.getAttribute("data-type") || "exact", tol });
        });
      } else if (e.kind === "order") {
        /* judged by the order of its items, never by the grader */
      } else if (e.kind === "choice") out.push({ from, answer: e.answer, type: "number", tol });
      else if (e.kind === "multi") out.push({ from, answer: e.answer, type: "set", tol });
      else if (e.kind === "figure") out.push({ from, answer: e.answer, type: e.el.getAttribute("data-compare") || "exact", tol });
      else out.push({ from, answer: e.answer, type: e.type, tol });
    });
  });
  return out;
}

/* the (given, key, type) triples src/learn/detectors.test.ts asks about by hand */
const DETECTOR_CASES = [
  ["-7", "7", "number"], ["1/6", "-1/6", "number"], ["3x+6", "3x-6|-6+3x", "expr"], ["(6,2)", "(6,-2)|6,-2", "exact"], ["2,7", "2,-7", "set"],
  ["3/4", "4/3", "number"], ["4", "0.25", "number"],
  ["12", "24", "number"], ["65", "130", "number"],
  ["785", "78.5", "number"], ["0.0096", "0.96", "number"],
  ["1", "1,-1", "set"], ["2", "2,-1/2", "set"], ["1,2", "1,2,4", "set"], ["1,3", "1,2,4", "set"],
  ["2/6", "1/3", "exact"], ["x=6/2", "x=3", "exact"],
  ["987654321", "7", "number"], ["notananswer987", "(6,-2)", "exact"], ["5", "7", "number"],
  ["-20", "10", "number"], ["4/8", "1/2", "exact"], ["1/4", "1/2", "exact"]
];

function detectorKeys() {
  const byKey = new Map();
  DETECTOR_CASES.forEach(([given, answer, type]) => {
    const id = type + " " + answer;
    if (!byKey.has(id)) byKey.set(id, { from: "detectors " + JSON.stringify(answer) + " " + type, answer, type, tol: 0, extra: [] });
    byKey.get(id).extra.push(given);
  });
  return Array.from(byKey.values());
}

/* mulberry32, as data/gen/core.js has it */
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genKeys() {
  const win = { console, Math };
  win.window = win;
  vm.createContext(win);
  const dir = path.join(ROOT, "data/gen");
  const files = fs.readdirSync(dir).filter(f => /\.js$/.test(f)).sort((a, b) => (a === "core.js" ? -1 : b === "core.js" ? 1 : a < b ? -1 : a > b ? 1 : 0));
  files.forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), win, { filename: "data/gen/" + f }));
  const Gen = win.BMGen, list = Gen.list(), rand = mulberry(GEN_SEED), out = [];
  for (let i = 0; i < GEN_PROBLEMS; i++) {
    const spec = list[i % list.length];
    const seed = Math.floor(rand() * 4294967296) >>> 0;
    const p = Gen.make(spec.id, seed);
    out.push({ from: "gen " + spec.id + " seed " + seed, answer: p.answer, type: p.type, tol: p.tol || 0 });
  }
  return out;
}

/* ------------------------------------------------------ the answers given -- */

/* a run of digits moved k places: "78.5" by 1 is "785", by -1 "7.85"; exact, no float */
function shiftDigits(d, k) {
  const cut = d.indexOf(".");
  const whole = cut < 0 ? d : d.slice(0, cut), frac = cut < 0 ? "" : d.slice(cut + 1);
  const digits = whole + frac;
  const point = whole.length + k;
  let s;
  if (point <= 0) s = "0." + "0".repeat(-point) + digits;
  else if (point >= digits.length) s = digits + "0".repeat(point - digits.length);
  else s = digits.slice(0, point) + "." + digits.slice(point);
  if (s.indexOf(".") > -1) s = s.replace(/0+$/, "").replace(/\.$/, "");
  s = s.replace(/^0+(?=\d)/, "");
  return s;
}
function scaleFirst(s, k) {
  return s.replace(/\d+(?:\.\d+)?/, d => shiftDigits(d, k));
}

function variantsOf(alt) {
  const out = [alt];
  const flipped = alt.charAt(0) === "-" ? alt.slice(1) : "-" + alt;
  out.push(flipped, flipped.replace(/-/g, "−"));
  if (/[+\-]/.test(alt.slice(1))) out.push(alt.replace(/[+\-]/g, c => (c === "+" ? "-" : "+")));
  const frac = /^(-?)(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(alt);
  if (frac) out.push(frac[1] + frac[3] + "/" + frac[2]);
  else if (/^-?\d+(?:\.\d+)?$/.test(alt)) out.push("1/" + alt);
  else out.push("1/(" + alt + ")");
  if (/\d/.test(alt)) { out.push(scaleFirst(alt, 1)); out.push(scaleFirst(alt, -1)); }
  out.push(alt.replace(/-/g, "−"));
  out.push(alt.replace(/-/g, "–"));
  out.push(alt.replace(/\*/g, "×").replace(/sqrt/g, "√").replace(/pi/g, "π").replace(/<=/g, "≤").replace(/>=/g, "≥").replace(/!=/g, "≠"));
  out.push(alt.toUpperCase());
  out.push("  " + alt + " ");
  out.push(alt.split("").join(" "));
  out.push(alt + ".");
  return out;
}

/* "|" alternatives, read here without the grader, so a key's own pieces are always tried */
function pieces(answer) {
  const raw = (answer || "").trim();
  return [raw].concat(raw.split("|")).map(s => s.trim()).filter(s => s !== "");
}

function givensOf(key) {
  const seen = new Set(), out = [];
  const add = (g) => { if (g !== "" && !seen.has(g)) { seen.add(g); out.push(g); } };
  (key.extra || []).forEach(add);
  add(key.answer);
  pieces(key.answer).forEach(alt => variantsOf(alt).forEach(add));
  return out;
}

/* ------------------------------------------------------------------ main -- */

function build() {
  const grade = loadGrade();
  const keys = courseKeys().concat(detectorKeys(), genKeys());
  let cases = 0;
  const groups = keys.map(k => {
    const right = [], wrong = [];
    givensOf(k).forEach(g => { (grade(g, k.answer, k.type, k.tol) ? right : wrong).push(g); cases++; });
    return { from: k.from, answer: k.answer, type: k.type, tol: k.tol, right, wrong };
  });
  return { groups, cases };
}

/* one group per line, so a change to grading is a readable diff */
function serialise(groups, cases) {
  return "{\n" +
    '  "about": ' + JSON.stringify("Written by tools/gen-grade-golden.js from assets/site.js's grader; src/core/grade.test.ts holds grade() to it. Each group: a key, its type and tolerance, and the answers graded right and wrong against it.") + ",\n" +
    '  "cases": ' + cases + ",\n" +
    '  "groups": [\n' + groups.map(g => "    " + JSON.stringify(g)).join(",\n") + "\n  ]\n}\n";
}

if (require.main === module) {
  const { groups, cases } = build();
  fs.writeFileSync(path.join(ROOT, OUT), serialise(groups, cases));
  console.log("wrote " + OUT + ": " + groups.length + " keys, " + cases + " cases");
}

module.exports = { build, serialise, OUT };
