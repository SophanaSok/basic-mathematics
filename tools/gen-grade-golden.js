#!/usr/bin/env node
"use strict";
/* Writes tools/fixtures/grade-golden.json: what the grader says about a fixed set of
   answers, so a change to how answers are graded shows up as a diff of that file, and
   src/core/grade.test.ts holds the grader to it case by case. It grades with
   src/core/answer/legacy.ts, a byte copy of src/core/grade.ts frozen as the baseline the
   typed grader's ledger is measured from, never with the live grader: once grade.ts
   changes, this still writes the same file, and --check still finds it current.

   The keys, each graded under its own type and tolerance:
     - every answer key on the course's pages: every typed answer, every blank's own key
       (a blank with no data-type is a number, as site.js sets it on the live page), every
       option list and tick-every-option list (as site.js judge() grades them: one option
       as a number, several as a set), every figure's (data-compare)
     - the hand cases of src/learn/detectors.test.ts (the detector fixtures)
     - the learner cases (LEARNER_CASES): the typed-grader design's example rows
     - 2,000 problems of the Arena's generators (data/gen/), drawn with seeded seeds
     - the first key of each type again with no type (null), as grade() takes it
   The answers given against each key: the whole key, and for each of its "|"
   alternatives the alternative itself, its sign flipped (in front, and everywhere), its
   reciprocal, its first number times 10 and divided by 10, its unicode spellings (−, –,
   ×, √, π, ≤, ≥, ≠, upper case) and its whitespace variants (padded, spaced out, a
   trailing full stop); then (nearOf) the em dash, the near misses either side of a
   tolerance and of the relative band, a set's other spellings and an expr's explicit
   products; then (moreOf) the size of the slack past a tolerance, the absolute floor
   under the relative band (keys near 0), a set's empty parts, and an expr's terms
   reordered and its outer brackets. So sameNumber()'s numeric edges (the slack, the
   tolerance, the relative band and its floor) have a case on each side, and numberList()
   and normExpr() are sent each spelling they forgive. Not every rule has a case: no given
   holds TeX (\frac, \sqrt, \cdot, \left), a "$" or a number written ".5", so those
   rewrites of normExpr() and toNumber() are held only by the hand cases in
   src/core/grade.test.ts (\frac, "$", ".5"), or by nothing.

   The output depends only on the tree: pages in lib/site.js htmlPages order, exercises
   in document order, generators in the order data/gen/ adds them, seeds from a fixed
   mulberry32 stream. The grader it uses is frozen, so only a change to the keys or to
   this file changes the output; run it again after one, and read the diff.

   Usage: node tools/gen-grade-golden.js [--check]
     --check   write nothing; exit 1 if the file on disk differs from a fresh run. It reads
               the live pages, so a content change that adds or edits a key fails it too */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const site = require("./lib/site");
const { exercisesOf } = require("./lib/keys");
const { grade } = require("../src/core/answer/legacy.ts");

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
          out.push({ from: from + " blank " + (j + 1), answer: b.getAttribute("data-answer") || "", type: b.getAttribute("data-type") || "number", tol });
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

/* The example rows of the typed-grader design (docs/decisions/0002-typed-grader.md names
   it; the tables of its sections 3.1 to 3.4), recorded here on the unchanged grader so the ledger
   that later PRs keep against this file names every row whose verdict they change. One
   entry per key, type and tolerance: [answer, type, tol, the answers given]. Each goes
   through givensOf() as a detector fixture does, so the key itself, its pieces and their
   variants are graded too. A few rows the tables do not show stay as well ((a)+(b), -x^2,
   the sums across a relation). The design's grid-mode rows (section 3.6) and Arena-only
   rows have no place here: a group has no grid or Arena field. A row added to one of
   those tables is added here in the same change. */
const LEARNER_CASES = [
  /* 3.1 number and fraction */
  ["3/2", "number", 0, ["3/2", "1.5", "1.50", "(3)/(2)", "3÷2", "3/2.", "1.5.", "1 1/2", "1½", "1 ½", "6/4", "1 100/200", "x = 3/2", "3/2 = x", "31/2", "1.49", "1+1/2", "sqrt(9)/2", "1-1/2", "1 and 1/2", "1,5", "1 1 / 2", "1 . 5", "1 1/2 cups", "½2", "1½0"]],
  ["11/2", "number", 0, ["1 1/2"]],
  ["32/21", "number", 0, ["1 11/21", "3 2/21"]],
  ["7/4", "number", 0, ["1 3/4", "-1 3/4"]],
  ["-1/2", "number", 0, ["-1 1/2"]],
  ["7/3", "number", 0, ["2 and 1/3"]],
  ["2/3", "number", 0, ["0.6666666667", "0.667", ".6667", "0.66", "0.6"]],
  ["1", "number", 0, ["1.000000001", "0.999999999"]],
  ["2.807", "number", 0.005, ["2.81", "2.80", "2.808", "2.812", "2.8120000000005", "2.8019999999995"]],
  ["1", "number", 1e-7, ["1.0000001", "1.0000002"]],
  ["5050", "number", 0, ["5,050", "$5,050", "5 050", "50 50"]],
  ["500", "number", 0, ["0,500"]],
  ["7", "number", 0, ["7.", "(7)", "+7", "07", "7.00", "7 = x", "x=7", "７"]],
  ["2", "number", 0, ["y = 2", "x = 2"]],
  ["4", "number", 0, ["8/2", "-(-4)", "four", "4 adults", "11 m", "4xy", "±4", "4e0", "3:4"]],
  ["-1", "number", 0, ["1/-1", "(-1)", "-(1)"]],
  ["-4", "number", 0, ["−4", "‐4", "- 4", "-$4", "$-4"]],
  ["140", "number", 0, ["140°", "140 º", "140º", "140 ˚", "140 degrees", "140deg"]],
  ["3.1416", "number", 0.001, ["3.142°"]],
  ["12.50", "number", 0, ["1$2.50", "12.50$", "£12.50", "$12.50"]],
  ["0.5", "number", 0, ["50%"]],
  ["4|-4", "number", 0, ["4,-4", "4, -4", "4 or -4", "±4", "-4,4"]],
  ["6.2832", "number", 0.001, ["2pi", "2 pi", "2π", "pi"]],
  ["78.5", "number", 0.1, ["25pi", "3 i", "4xy"]],
  /* 3.2 set */
  ["2,-7", "set", 0, ["-7, 2", "{2;-7}", "x=2, x=-7", "x = 2 or x = -7", "2 and -7", "2,-7.", "2,-7,", "2,,-7", "2,2,-7", "2 -7", "(2,-7)"]],
  ["3,-3", "set", 0, ["z = 3, z = -3", "3 or -3"]],
  ["7,-7", "set", 0, ["±7", "+-7"]],
  ["2,1/3", "set", 0, ["2 1/3", "2 and 1/3"]],
  ["7/3", "set", 0, ["2 1/3", "2 and 1/3"]],
  ["2,-1/3", "set", 0, ["2 and -1/3"]],
  ["1/2,1/3", "set", 0, ["1/2 and 1/3"]],
  ["1,2", "set", 0, ["1.000000001,2"]],
  ["1,0", "set", 0, ["1,000"]],
  ["1.00,1.02", "set", 0.01, ["1.01, 1.00"]],
  /* 3.3 points (exact keys) */
  ["(6,-2)|6,-2", "exact", 0, ["(6.0,-2)", "(+6, −2)", "( 6 , - 2 )", "(12/2,-2)", "[6,-2]", "<6,-2>", "x=6, y=-2", "y=-2, x=6", "(-2,6)", "x=6, x=-2", "(6.0000000001,-2)"]],
  ["(1000000001,1)|1000000001,1", "exact", 0, ["(1000000000,1)"]],
  ["(-2,6)|-2,6", "exact", 0, ["y=-2, x=6"]],
  ["(1,0)|1,0", "exact", 0, ["(1,000)", "1,000", "(1, 000)"]],
  ["(1,5)|1,5", "exact", 0, ["(1,05)"]],
  ["1,000", "exact", 0, ["(1,0)", "1,0"]],
  ["(11/2,3)|11/2,3", "exact", 0, ["(1 1/2, 3)", "(1 1/2,3)"]],
  ["3,2,1|(3,2,1)", "exact", 0, ["[3,2,1]"]],
  /* 3.4 expr, and exact text */
  ["x^2+1", "expr", 0, ["x^2+1."]],
  ["|x|", "expr", 0, ["abs(x)", "|x|."]],
  ["x^2", "expr", 0, ["x^(2)", "x**2"]],
  ["(2k+1)^-1", "expr", 0, ["(2k+1)^(-1)"]],
  ["3x-6", "expr", 0, ["3x+(-6)"]],
  ["22i-26", "expr", 0, ["22i+-26"]],
  ["x-2y", "expr", 0, ["x+(-2)y"]],
  ["(1/2)sqrt(2)", "expr", 0, ["((1/2)sqrt(2))"]],
  ["x^2-28x+196", "expr", 0, ["-28x+x^2+196"]],
  ["2-7i", "expr", 0, ["-7i+2"]],
  ["1/(2k+1)", "expr", 0, ["1/(1+2k)"]],
  ["x-23", "expr", 0, ["x+(-2)3"]],
  ["5-1.5", "expr", 0, ["5+(-1).5"]],
  ["3-x2", "expr", 0, ["3+(-x)2"]],
  ["x^23", "expr", 0, ["x^(2)3"]],
  ["x-2^2", "expr", 0, ["x+(-2)^2"]],
  ["(11/6)pi", "expr", 0, ["(1 1/6)pi", "1 1/6pi"]],
  ["11/2", "exact", 0, ["1 1/2"]],
  ["64pi", "expr", 0, ["6*4pi"]],
  ["23", "expr", 0, ["2*3"]],
  ["3x-2", "expr", 0, ["3x*-2"]],
  ["-x^2", "expr", 0, ["x^2*-1"]],
  ["y=3x+5", "expr", 0, ["y=3x-(-5)", "5+y=3x"]],
  ["(1,y+x)", "expr", 0, ["(x+1,y)"]],
  ["(a)+(b)", "expr", 0, ["a+b"]],
  ["x+5<=7", "expr", 0, ["5+x<=7"]],
  ["x-2<5", "expr", 0, ["-2<5+x"]],
  ["y=2x+3", "expr", 0, ["2x+3=y"]]
];

function learnerKeys() {
  return LEARNER_CASES.map(([answer, type, tol, extra]) => ({ from: "learner " + JSON.stringify(answer) + " " + type + (tol ? " tol " + tol : ""), answer, type, tol, extra }));
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

/* The near misses a rule decides and the spellings the variants above never send, added
   after them so the lists of the first fixture keep their order: "-" written as an em
   dash; a key with a tolerance moved by ± 0.5, 1 and 1.2 of it (inside, on the edge,
   outside); a number, fraction or set key without one scaled by 1 ± 1e-10 (inside the
   relative band) and 1 ± 1e-7 (outside it); a set joined by ";", in braces and
   reversed; an expr with its products written with "*", and "*" written "⋅" (U+22C5,
   the dot operator basicClean() reads). Numbers are read here without the grader; a
   value JavaScript prints with an exponent is left out. */
const NUMBER_TYPES = ["number", "fraction", "set"];

/* the numbers of a key piece ("3/4", "0.38,2.62", "{1;2}"), or null */
function valuesOf(alt) {
  const vals = alt.replace(/[{}]/g, "").split(/[,;]/).map(p => {
    const m = /^(-?\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/.exec(p.trim());
    const den = m && m[2] !== undefined ? parseFloat(m[2]) : 1;
    return m && den !== 0 ? parseFloat(m[1]) / den : null;
  });
  return vals.every(v => v !== null) ? vals : null;
}
function written(vals) {
  const s = vals.map(String);
  return s.some(x => /e/.test(x)) ? null : s.join(",");
}

function nearOf(alt, key) {
  const out = [], vals = valuesOf(alt);
  const push = (s) => { if (s !== null) out.push(s); };
  if (alt.indexOf("-") > -1) out.push(alt.replace(/-/g, "—"));
  if (vals && key.tol > 0) {
    [0.5, 1, 1.2].forEach(k => [1, -1].forEach(sign => push(written(vals.map(v => +(v + sign * k * key.tol).toPrecision(12))))));
  } else if (vals && NUMBER_TYPES.includes(key.type)) {
    [1e-10, 1e-7].forEach(e => [1, -1].forEach(sign => push(written(vals.map(v => v * (1 + sign * e))))));
  }
  if (key.type === "set" && /[,;]/.test(alt)) {
    const items = alt.replace(/[{}]/g, "").split(/[,;]/);
    out.push(items.join(";"), "{" + items.join(",") + "}", items.slice().reverse().join(","));
  }
  const starred = key.type === "expr" ? alt.replace(/(\d)(?=[a-z(])/gi, "$1*") : alt;
  if (starred !== alt) out.push(starred);
  if (starred.indexOf("*") > -1) out.push(starred.replace(/\*/g, "⋅"));
  return out;
}

/* The edges nearOf() left unpinned, added after everything above so the lists of the
   fixture before them keep their order too, each written out in decimal:
     - a toleranced key moved by its tolerance plus 1e-10 and plus 1e-11 (just past the
       1e-12 slack sameNumber() allows) and by 1.05 of it, either way;
     - any other number, fraction or set key whose numbers include one under 1 in size
       (0 among them, which no scaling moves) with those numbers moved by 5e-10 and 8e-10
       (inside the absolute floor of the relative band) and by 1e-7 (outside it), either way;
     - a set with a separator at its end, at its start and doubled (the empty parts the
       grader drops);
     - an expr with the terms of a sum with no brackets in reverse order, and the whole
       expr in one more pair of brackets.
   The last two only for a single alternative, not the unsplit key that holds a "|". */
function fixed(x) {
  return x.toFixed(13).replace(/0+$/, "").replace(/\.$/, "").replace(/^-0$/, "0");
}
function moreOf(alt, key) {
  const out = [], vals = valuesOf(alt);
  if (vals && key.tol > 0) {
    [key.tol + 1e-10, key.tol + 1e-11, 1.05 * key.tol].forEach(d => [1, -1].forEach(sign => out.push(vals.map(v => fixed(v + sign * d)).join(","))));
  } else if (vals && NUMBER_TYPES.includes(key.type) && vals.some(v => Math.abs(v) < 1)) {
    [5e-10, 8e-10, 1e-7].forEach(d => [1, -1].forEach(sign => out.push(vals.map(v => (Math.abs(v) < 1 ? fixed(v + sign * d) : String(v))).join(","))));
  }
  if (alt.indexOf("|") > -1) return out;
  if (key.type === "set") {
    const sep = (/[,;]/.exec(alt) || [","])[0];
    out.push(alt + sep, sep + alt);
    if (/[,;]/.test(alt)) out.push(alt.replace(/[,;]/, s => s + s));
  }
  if (key.type === "expr") {
    if (alt.indexOf("+") > 0 && !/[()]/.test(alt)) out.push(alt.split("+").reverse().join("+"));
    out.push("(" + alt + ")");
  }
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
  pieces(key.answer).forEach(alt => nearOf(alt, key).forEach(add));
  pieces(key.answer).forEach(alt => moreOf(alt, key).forEach(add));
  return out;
}

/* ------------------------------------------------------------------ main -- */

/* the first key of each type once more with no type, graded as grade() grades a key that
   names none */
function untypedKeys(keys) {
  const seen = new Set();
  return keys.filter(k => !seen.has(k.type) && seen.add(k.type)).map(k => Object.assign({}, k, { from: "type null: " + k.from, type: null }));
}

function build() {
  let keys = courseKeys().concat(detectorKeys(), learnerKeys(), genKeys());
  keys = keys.concat(untypedKeys(keys));
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
    '  "about": ' + JSON.stringify("Written by tools/gen-grade-golden.js with src/core/answer/legacy.ts, the frozen copy of the grader; src/core/grade.test.ts holds grade() to it. Each group: a key, its type and tolerance, and the answers graded right and wrong against it.") + ",\n" +
    '  "cases": ' + cases + ",\n" +
    '  "groups": [\n' + groups.map(g => "    " + JSON.stringify(g)).join(",\n") + "\n  ]\n}\n";
}

if (require.main === module) {
  const { groups, cases } = build();
  const text = serialise(groups, cases);
  const file = path.join(ROOT, OUT);
  if (process.argv.includes("--check")) {
    const ok = fs.existsSync(file) && fs.readFileSync(file, "utf8") === text;
    console.log(OUT + (ok ? " is current: " + groups.length + " keys, " + cases + " cases" : " differs from a fresh run; write it with node tools/gen-grade-golden.js and read the diff"));
    process.exit(ok ? 0 : 1);
  }
  fs.writeFileSync(file, text);
  console.log("wrote " + OUT + ": " + groups.length + " keys, " + cases + " cases");
}

module.exports = { build, serialise, OUT, courseKeys };
