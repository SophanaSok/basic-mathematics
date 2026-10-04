#!/usr/bin/env node
/* tools/check-gen.js — checks every Arena generator in data/gen/*.js.

   For each generator and 500 seeds: make() does not throw; no string in the
   problem contains NaN, undefined, Infinity or "[object"; the same seed gives
   the same problem; every alternative of the answer key is accepted by the
   site's own grader (BMSite.grade, loaded from assets/site.js) with the
   problem's type; verify() returns true; the hint does not give the answer away
   (π and √ answers included).
   For spelled-out keys (expr, exact) a small evaluator reads what each spelling
   means: every alternative must mean the same; near-misses (a number off by one,
   the sign flipped, the conjugate, the other bracket of an interval, …) must not
   be graded correct; and the forms a learner may type (π first, (1/2)√3, 22i-26,
   y = 1x + 7, [7, ∞)) must be. A fixed table does the same for the key helpers in
   data/gen/core.js, and a few generators have checks on their text (CONTENT).
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

/* ---- what an answer means, worked out independently of the grader ----
   meaning(s) is a signature string: two answers mean the same thing exactly when
   their signatures are equal. It reads numbers, fractions, pi, sqrt, i (as complex
   numbers), lines y = … in x (sampled at a few x), points and lists (a, b, …), and
   one-sided inequalities written as x >= 7, 7 <= x or [7, ∞), and, when roman is
   set (a quadrant key such as "2|ii"), the numerals i to iv. Anything else is
   null: not understood, so not compared. */
function cleanAns(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, "").replace(/[−–—]/g, "-")
    .replace(/[×⋅·*]/g, "*").replace(/π/g, "pi").replace(/√/g, "sqrt")
    .replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/\.$/, "");
}
function evalExpr(src, xv) {
  var toks = [], m, re = /\d+(?:\.\d+)?|pi|sqrt|i|x|[()+\-*\/]/g, at = 0;
  while ((m = re.exec(src))) {
    if (m.index !== at) return null;
    toks.push(m[0]); at = re.lastIndex;
  }
  if (at !== src.length || !toks.length) return null;
  var k = 0;
  function C(r, i) { return { r: r, i: i }; }
  function mul(a, b) { return C(a.r * b.r - a.i * b.i, a.r * b.i + a.i * b.r); }
  function div(a, b) { var d = b.r * b.r + b.i * b.i; return d === 0 ? null : C((a.r * b.r + a.i * b.i) / d, (a.i * b.r - a.r * b.i) / d); }
  function starts(t) { return t !== undefined && /^(\d|pi|sqrt|i|x|\()/.test(t); }
  function factor() {
    var t = toks[k++];
    if (t === undefined) return null;
    if (/^\d/.test(t)) return C(parseFloat(t), 0);
    if (t === "pi") return C(Math.PI, 0);
    if (t === "i") return C(0, 1);
    if (t === "x") return xv === undefined ? null : C(xv, 0);
    if (t === "sqrt") { var a = factor(); return a && a.i === 0 && a.r >= 0 ? C(Math.sqrt(a.r), 0) : null; }
    if (t === "(") { var e = sum(); return e && toks[k++] === ")" ? e : null; }
    return null;
  }
  function unary() {
    if (toks[k] === "-") { k++; var u = unary(); return u && C(-u.r, -u.i); }
    if (toks[k] === "+") { k++; return unary(); }
    return factor();
  }
  function term() {
    var v = unary();
    while (v) {
      var t = toks[k];
      if (t === "*" || t === "/") { k++; var w = unary(); if (!w) return null; v = t === "*" ? mul(v, w) : div(v, w); }
      else if (starts(t)) { var w2 = factor(); if (!w2) return null; v = mul(v, w2); }
      else break;
    }
    return v;
  }
  function sum() {
    var v = term();
    while (v && (toks[k] === "+" || toks[k] === "-")) {
      var op = toks[k++], w = term();
      if (!w) return null;
      v = op === "+" ? C(v.r + w.r, v.i + w.i) : C(v.r - w.r, v.i - w.i);
    }
    return v;
  }
  var out = sum();
  return out && k === toks.length ? out : null;
}
function num(v) { return (Math.round(v * 1e9) / 1e9 + 0).toString(); }
function sig(v) { return v ? num(v.r) + (v.i ? "," + num(v.i) + "i" : "") : null; }
var INF = /^\+?(∞|inf|infinity)$/, NINF = /^-(∞|inf|infinity)$/;
var ROMAN = { i: 1, ii: 2, iii: 3, iv: 4 };
function meaning(s, roman) {
  var t = cleanAns(s), m, v, lo, hi;
  if (!t) return null;
  if (roman && ROMAN[t]) return "val:" + ROMAN[t];
  /* x >= 7, 7 <= x */
  var rel = null, other;
  if ((m = /^x(<=|>=|<|>)(.+)$/.exec(t))) { rel = m[1]; other = m[2]; }
  else if ((m = /^(.+?)(<=|>=|<|>)x$/.exec(t))) { rel = { "<": ">", ">": "<", "<=": ">=", ">=": "<=" }[m[2]]; other = m[1]; }
  if (rel) {
    v = evalExpr(other);
    if (!v || v.i) return null;
    return rel.charAt(0) === ">" ? "set:" + num(v.r) + (rel === ">=" ? "]" : ")") + ":+inf" : "set:-inf:" + (rel === "<=" ? "[" : "(") + num(v.r);
  }
  /* [7, ∞), (-∞, 3] */
  if ((m = /^([\[(])([^,]+),([^,]+)([\])])$/.exec(t)) && (INF.test(m[3]) || NINF.test(m[2]))) {
    if (NINF.test(m[2]) && m[1] === "[" || INF.test(m[3]) && m[4] === "]") return "set:bad";
    lo = NINF.test(m[2]) ? "-inf" : (v = evalExpr(m[2])) && !v.i ? num(v.r) + (m[1] === "[" ? "]" : ")") : null;
    hi = INF.test(m[3]) ? "+inf" : (v = evalExpr(m[3])) && !v.i ? (m[4] === "]" ? "[" : "(") + num(v.r) : null;
    return lo && hi ? "set:" + lo + ":" + hi : null;
  }
  /* y = 3x - 5, or just 3x - 5 */
  if (/x/.test(t)) {
    var rhs = t.replace(/^y=/, ""), vals = [];
    if (/[=<>,]/.test(rhs)) return null;
    for (var xv = -2; xv <= 2; xv++) { v = evalExpr(rhs, xv); if (!v) return null; vals.push(sig(v)); }
    return "fn:" + vals.join(";");
  }
  /* (3, -2), 2,1,3,4 */
  if (t.indexOf(",") > -1) {
    var parts = t.replace(/^\((.*)\)$/, "$1").split(","), sigs = [];
    for (var j = 0; j < parts.length; j++) { v = evalExpr(parts[j]); if (!v) return null; sigs.push(sig(v)); }
    return "list:" + sigs.join(";");
  }
  v = evalExpr(t);
  return v ? "val:" + sig(v) : null;
}

/* wrong answers a little way from the right one, built from what the key means:
   the same helpers that build keys, fed a nearby wrong value, plus generic slips
   (one number off by one, the sign flipped, a bracket of an interval flipped) */
var U = Gen.u;
function nearMisses(key, type) {
  var alts = key.split("|").map(function (a) { return a.trim(); }).filter(Boolean), out = [];
  var first = cleanAns(alts[0]), m, v;
  alts.forEach(function (a) {
    var re = /\d+/g, mm;
    while ((mm = re.exec(a))) out.push(a.slice(0, mm.index) + (parseInt(mm[0], 10) + 1) + a.slice(mm.index + mm[0].length));
    out.push(a.charAt(0) === "-" ? a.slice(1) : "-" + a);
    if (/^[\[(].*,.*[\])]$/.test(a)) {
      var flip = { "[": "(", "(": "[", "]": ")", ")": "]" };
      out.push(flip[a.charAt(0)] + a.slice(1), a.slice(0, -1) + flip[a.charAt(a.length - 1)]);
    }
  });
  if ((m = /^x(<=|>=|<|>)(-?\d+)$/.exec(first))) {
    var x0 = parseInt(m[2], 10);
    ["<", ">", "<=", ">="].forEach(function (r) { [x0 - 1, x0, x0 + 1].forEach(function (x) { if (r !== m[1] || x !== x0) out.push(U.relAns(r, x)); }); });
  } else if (/^y=/.test(first)) {
    var b0 = evalExpr(first.slice(2), 0), m0 = evalExpr(first.slice(2), 1);
    if (b0 && m0) {
      var bb = b0.r, mm2 = m0.r - b0.r;
      [[mm2, -bb], [-mm2, bb], [bb, mm2], [mm2 + 1, bb], [mm2, bb + 1], [mm2, bb - 1], [mm2 - 1, bb]].forEach(function (p) {
        if (p[0] !== 0 && (p[0] !== mm2 || p[1] !== bb)) out.push(U.lineAns(p[0], p[1]));
      });
    }
  } else if (type === "expr" && /pi/.test(first) && (v = evalExpr(first))) {
    var q = v.r / Math.PI;
    for (var d = 1; d <= 360 && Math.abs(q * d - Math.round(q * d)) > 1e-9; d++);
    var kk = Math.round(q * d);
    [[-kk, d], [kk + 1, d], [kk - 1, d], [2 * kk, d], [kk, 2 * d], [d, kk]].forEach(function (p) {
      if (p[0] * d !== kk * p[1]) out.push(U.piAns(p[0], p[1]));
    });
    out.push(String(kk / d), U.fracAns(kk, d));
  } else if (type === "expr" && /sqrt/.test(first)) {
    out.push(U.halfRootAns(first.indexOf("3") > -1 ? 2 : 3), "sqrt2", "sqrt3", "1/2", "2/sqrt2", "2/sqrt3", "1/sqrt3", "sqrt3/3");
  } else if (type === "expr" && (v = evalExpr(first)) && (v.i || /i/.test(first))) {
    var a0 = v.r, c0 = v.i;
    [[a0, -c0], [-a0, c0], [-a0, -c0], [c0, a0], [a0 + 1, c0], [a0, c0 + 1]].forEach(function (p) {
      if (p[0] !== a0 || p[1] !== c0) out.push(U.cxAns(p[0], p[1]));
    });
  } else if ((m = /^\((-?\d+),(-?\d+)\)$/.exec(first))) {
    var px = +m[1], py = +m[2];
    [[py, px], [-px, py], [px, -py], [px + 1, py]].forEach(function (p) { if (p[0] !== px || p[1] !== py) out.push(U.ptAns(p[0], p[1])); });
  }
  /* a near-miss key lists several spellings; each is a candidate */
  var seen = {}, flat = [];
  out.join("|").split("|").forEach(function (c) { c = c.trim(); if (c && !seen[c]) { seen[c] = 1; flat.push(c); } });
  return flat;
}

/* forms a learner may type for a key, built from what it means (not from the
   helpers that build keys): the interval §3.3 writes, y = mx + b filled in
   literally, π first, a bracketed coefficient, the imaginary part first */
function requiredForms(want, first, type) {
  var out = [], m, v;
  if ((m = /^set:(-?[\d.]+)([\])]):\+inf$/.exec(want))) out.push((m[2] === "]" ? "[" : "(") + m[1] + ", ∞)", (m[2] === "]" ? "[" : "(") + m[1] + ",inf)");
  else if ((m = /^set:-inf:([\[(])(-?[\d.]+)$/.exec(want))) out.push("(-∞, " + m[2] + (m[1] === "[" ? "]" : ")"), "(-inf," + m[2] + (m[1] === "[" ? "]" : ")"));
  else if (/^fn:/.test(want) && /^y=/.test(first)) {
    var b0 = evalExpr(first.slice(2), 0).r, m1 = evalExpr(first.slice(2), 1).r - b0;
    out.push("y = " + m1 + "x " + (b0 < 0 ? "- " + -b0 : "+ " + b0), "y=" + m1 + "x+" + b0);
  } else if (type === "expr" && /pi/.test(first) && (v = evalExpr(first))) {
    var q = v.r / Math.PI, d = 1;
    while (d < 360 && Math.abs(q * d - Math.round(q * d)) > 1e-9) d++;
    var k = Math.round(q * d);
    if (d === 1) out.push("π·" + k, "pi*" + k, k + "·π", "π" + k);
    else out.push("(" + k + "/" + d + ")π", (k === 1 ? "" : k) + "π/" + d);
  } else if (type === "expr" && (m = /sqrt\(?(\d)\)?\/2$/.exec(first))) {
    out.push("(1/2)√" + m[1], "1/2*√" + m[1], "√" + m[1] + "/2");
  } else if (type === "expr" && (v = evalExpr(first)) && v.i && v.r) {
    var im = v.i === 1 ? "i" : v.i === -1 ? "-i" : v.i + "i";
    out.push(im + (v.r < 0 ? " - " + -v.r : " + " + v.r), v.r + (v.i < 0 ? " - " : " + ") + Math.abs(v.i) + "i");
  }
  return out;
}

/* the hint may not contain any spelling of the answer, π answers included */
function hintLeaks(hint, key) {
  var h = " " + String(hint).toLowerCase().replace(/π/g, "pi").replace(/√/g, "sqrt") + " ";
  return key.split("|").some(function (a) {
    a = cleanAns(a);
    if (!/pi|sqrt/.test(a)) return false;
    var esc = a.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
    return new RegExp("[^a-z0-9/^.]" + esc + "[^a-z0-9/^.(]").test(h);
  });
}

/* Fixed keys from the answer helpers, with forms a learner types: every "ok" form
   must be graded correct, every "no" form wrong. */
var FIXED = [
  [U.piAns(9, 1), "expr", ["9pi", "9π", "9 π", "π9", "pi*9", "π*9", "π·9", "9·π", "9·pi", "π 9", "π×9", "9×π", "pi(9)", "(9)π"],
    ["9", "3pi", "18pi", "pi/9", "81pi", "-9pi", "9pi/2", "9/pi", "π+9", "9+π"]],
  [U.piAns(135, 180), "expr", ["3pi/4", "3π/4", "(3π)/4", "3/4π", "(3/4)π", "(3/4)pi", "3·π/4", "3/4·π", "(3/4)·π"],
    ["4π/3", "(4/3)π", "3/4", "3π", "π/4", "3/4π/4", "-3π/4", "3π/2"]],
  [U.piAns(30, 180), "expr", ["pi/6", "π/6", "1/6π", "(1/6)π", "(π)/6"], ["6π", "π6", "π/3", "1/6", "6/π"]],
  [U.cxAns(-26, 22), "expr", ["-26+22i", "22i-26", "22i - 26", "22i+-26", "-26 + 22i", "−26 + 22i"],
    ["22i+26", "-26-22i", "26+22i", "-22i-26", "22-26i", "-26+22", "26-22i", "-26i+22"]],
  [U.cxAns(-8, -6), "expr", ["-8-6i", "-6i-8", "-8+-6i", "-6i+-8"], ["-8+6i", "6i-8", "8-6i", "-6i+8", "-6-8i"]],
  [U.cxAns(-13, 1), "expr", ["-13+i", "i-13", "1i-13", "-13+1i"], ["-13-i", "13+i", "-i-13", "i+13"]],
  [U.cxAns(-1, -1), "expr", ["-1-i", "-i-1", "-1i-1", "-1-1i", "-1+-i"], ["-1+i", "1-i", "i-1", "-i+1", "1+i"]],
  [U.cxAns(10, 24), "expr", ["10+24i", "24i+10"], ["10-24i", "24i-10", "24+10i"]],
  [U.cxAns(0, -3), "expr", ["-3i", "0-3i"], ["3i", "-3", "0+3i"]],
  [U.cxAns(5, 0), "expr", ["5", "5+0i"], ["5i", "-5"]],
  [U.lineAns(3, 0), "exact", ["y=3x", "y = 3x + 0", "3x", "y=3x+0"], ["y=3x+1", "y=-3x", "y=x+3", "y=3", "y=3x-1"]],
  [U.lineAns(1, 7), "exact", ["y=x+7", "y=1x+7", "y=7+x", "x+7", "y = 1x + 7"], ["y=x-7", "y=7x+1", "y=-x+7", "y=1x-7"]],
  [U.lineAns(-1, 1), "exact", ["y=-x+1", "y=-1x+1", "y=1-x", "y = −x + 1"], ["y=x+1", "y=1x+1", "y=-x-1", "y=1+x"]],
  [U.lineAns(3, -5), "exact", ["y=3x-5", "y=3x+-5", "y=-5+3x", "3x-5"], ["y=3x+5", "y=-3x-5", "y=5+3x", "y=-5x+3"]],
  [U.relAns(">=", 7), "exact", ["x>=7", "x ≥ 7", "7<=x", "7 ≤ x", "[7,∞)", "[7, inf)", "[7,infinity)", "[7,+∞)", "[7, ∞)"],
    ["(7,∞)", "[7,∞]", "(-∞,7]", "x>7", "x<=7", "7>=x", "[8,∞)", "[-7,∞)"]],
  [U.relAns("<", -3), "exact", ["x<-3", "-3>x", "(-∞,-3)", "(-inf,-3)", "(−∞, −3)"],
    ["(-∞,-3]", "x<=-3", "(-3,∞)", "-3<x", "x>-3", "(-∞,3)"]],
  [U.halfRootAns(3), "expr", ["√3/2", "(1/2)√3", "(1/2)sqrt(3)", "1/2*√3", "1/2·√3", "sqrt(3)/2", "(√3)/2"],
    ["√2/2", "1/2", "√3", "2/√3", "1/√3", "(1/2)√2", "√3/3", "3/2"]],
  [U.halfRootAns(2), "expr", ["1/√2", "1/(√2)", "(1/2)√2", "√2/2", "1/2√2"], ["√3/2", "1/2", "√2", "2/√2", "1/√3", "1/2√3"]]
];
FIXED.forEach(function (f) {
  f[2].forEach(function (g) { if (!Site.grade(g, f[0], f[1], 0)) fail("answer forms", null, JSON.stringify(g) + " is graded wrong against " + f[0]); });
  f[3].forEach(function (g) { if (Site.grade(g, f[0], f[1], 0)) fail("answer forms", null, JSON.stringify(g) + " is graded correct against " + f[0]); });
  f[0].split("|").forEach(function (a) { if (meaning(a) !== meaning(f[0].split("|")[0])) fail("answer forms", null, a + " does not mean the same as the rest of " + f[0]); });
});

/* content a generator must get right beyond its answer key */
var CONTENT = {
  /* the worked subtraction is the real one: when the y coefficients already match,
     nothing is scaled, so the step reads (a - c)x = e - f */
  "sys-elim": function (p) {
    var m = /aligned\} (.*?) &= (-?\d+) \\\\ (.*?) &= (-?\d+) \\end/.exec(p.q);
    if (!m) return "cannot read the system";
    function co(t, v) {
      var mm = new RegExp("(^|[+-])(\\d*)" + v).exec(t.replace(/ /g, ""));
      return mm ? (mm[1] === "-" ? -1 : 1) * (mm[2] === "" ? 1 : parseInt(mm[2], 10)) : 0;
    }
    var a = co(m[1], "x"), b = co(m[1], "y"), c = co(m[3], "x"), d = co(m[3], "y"), e = +m[2], f = +m[4];
    var det = a * d - b * c, want = b === d ? U.poly([[a - c, "x"]]) + " = " + (e - f) : U.poly([[det, "x"]]) + " = " + (e * d - b * f);
    return p.steps.join(" ").indexOf("eliminate $y$: $" + want + "$") > -1 ? "" : "the elimination step should read " + want;
  },
  /* §5.3 gives the angle sum, not the isosceles base-angle theorem */
  "tri-angle": function (p) {
    return /isosceles|equal sides|equal legs|opposite the equal/i.test(p.q + " " + p.hint + " " + p.steps.join(" ")) ? "relies on equal sides facing equal angles, which the course never proves" : "";
  },
  /* a segment has two distinct endpoints (§10.1) */
  "point-sum": function (p) {
    var pts = [], re = /\((-?\d+), (-?\d+)\)/g, m;
    while ((m = re.exec(p.q))) pts.push(m[1] + "," + m[2]);
    if (/midpoint of the segment from \$\(/.test(p.q) && pts[0] === pts[1]) return "segment from a point to itself";
    if (/to \$Q\$ is/.test(p.q) && pts[0] === pts[1]) return "Q equals P, so the segment has no length";
    return "";
  }
};

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
    /* every alternative is graded correct against the whole key */
    var alts = p.answer.split("|").map(function (a) { return a.trim(); }).filter(Boolean);
    alts.forEach(function (alt) {
      if (!Site.grade(alt, p.answer, p.type, p.tol)) fail(spec.id, seed, "alternative " + alt + " is graded wrong");
    });
    /* spelled-out keys (expr, exact): every alternative means the same thing, and a
       near-miss the grader accepts must mean it too */
    if (p.type === "expr" || p.type === "exact") {
      var roman = /^[1-4]\|(i|ii|iii|iv)$/i.test(p.answer);
      var want = meaning(alts[0], roman);
      if (p.type === "expr" && !want) fail(spec.id, seed, "cannot read the key " + alts[0]);
      alts.forEach(function (alt) {
        var mean = meaning(alt, roman);
        if ((mean || p.type === "expr") && mean !== want) fail(spec.id, seed, "alternative " + alt + " does not mean " + alts[0] + " (" + mean + " vs " + want + ")");
      });
      if (want) nearMisses(p.answer, p.type).forEach(function (c) {
        if (Site.grade(c, p.answer, p.type, p.tol) && meaning(c, roman) !== want) fail(spec.id, seed, "near-miss " + c + " is graded correct for " + alts[0]);
      });
      if (want) requiredForms(want, cleanAns(alts[0]), p.type).forEach(function (c) {
        if (meaning(c) !== want) fail(spec.id, seed, "check-gen built " + c + " for " + alts[0] + " but it means something else");
        else if (!Site.grade(c, p.answer, p.type, p.tol)) fail(spec.id, seed, "the correct form " + c + " is graded wrong (key " + p.answer + ")");
      });
    }
    if (hintLeaks(p.hint, p.answer)) fail(spec.id, seed, "hint contains the answer " + first);
    if (CONTENT[spec.id]) { var wrongText = CONTENT[spec.id](p); if (wrongText) fail(spec.id, seed, wrongText + ": " + p.q); }
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
