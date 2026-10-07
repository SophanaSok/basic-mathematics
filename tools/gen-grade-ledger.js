#!/usr/bin/env node
"use strict";
/* Writes tools/fixtures/grade-ledger.json: every case of the frozen baseline
   (tools/fixtures/grade-golden.json, which tools/gen-grade-golden.js wrote with
   src/core/answer/legacy.ts) whose verdict the typed grader (src/core/answer/check.ts
   judge()) changes, each with the rule that changed it. src/core/grade.test.ts calls
   check() below, so `npm run check` fails on a change the ledger does not list.

   For every golden case it runs legacy.ts's grade() and judge(), and fails if legacy.ts does
   not say what the golden file says. A case changes when the booleans differ (a flip:
   right is true, anything else false) or when a wrong answer is now form or unread (a
   verdict). An empty box (unread "empty") is no change: legacy.ts grades it wrong and the
   pages never send it. Each change is put down to a rule:
     - a form or unread verdict by its reason (REASON_RULE): rounded is N-round, repeated
       L-repeat, notation T-notation, unreduced N-whole, named N-named, spaces N-space,
       list-comma L-zero, mixed-in-set L-mixed, any other unread N-refuse;
     - any other change by switching rules off with judgeOff(): the first rule in ORDER
       whose switch alone gives back the old boolean, else the first pair that does
       ("A+B"). A change neither finds is refused unless `reviewed` lists it.
   A flip from wrong to right must also pass the value gate, or be listed in `reviewed`.

   The value gate is a second reading of the answer and the key, written here and sharing
   no code with src/core/answer/, so a reader bug that accepts a wrong value is refused:
     - number, fraction, set, and a point given for a point (exact or no type): lower case,
       whitespace collapsed, the dashes as "-", one trailing full stop dropped; a mixed
       number ("-1 1/2" is -3/2) read first, otherwise spaces deleted and a plain decimal or
       a/b (a sign on either part), but never a space between two digits (5 050, 1 1 / 2); a set strips one {...} and splits on , and ; only, a
       point strips one (...) and splits on ,; compared exactly in BigInt, within the tol
       (read from String(tol), exponent notation included) or the band
       |a-b|*1e9 <= max(1,|a|,|b|), a set by sorted pairing, a point equal in order;
     - expr, exact and no type, unless a space stands between two digits (1 1/6pi could be
       a mixed number, which the expr rules never read): lower case, whitespace deleted, ² ³ as ^2 ^3, · ⋅ × as *,
       the dashes as "-", π as pi, √ as sqrt, ** as ^, one trailing full stop dropped; the
       given equal to the whole key or a "|" piece, or both parsed (+ - * / ^, brackets,
       |...| and abs, sqrt, pi, single letters, implicit products, one "=" taken as the
       difference of its sides up to sign) and equal within a relative 1e-9 at 3 seeded
       points, in float64. A test-time check, not a grading decision.
   It reads no thousands comma, $, bracketed number, ½-style character, full-width digit,
   ÷, " or ", " and " or ±, on purpose: it stays simpler than the reader it checks, and
   those flips are read by hand and listed in `reviewed`.

   The file, one entry per line:
     revision  check.ts GRADER
     rules     {id, rule}: each rule that names an entry (both of a pair), and no other
     flips     {from, given, answer, type, tol, was, now, verdict, rule}: every boolean change
     verdicts  {from, given, kind, reason, rule}: every wrong answer now form or unread
     specs     {from, was, now}: every course exercise whose type or tol is not its golden
               group's (matched by `from`; one with no group is not this file's)
     reviewed  {from, given, why}: written by hand, for a change the gate cannot read or no
               rule gives back; carried through as it is
   A missing file is the empty ledger at GRADER. None is written until there is something
   in it (the first change of a verdict writes it).

   The baseline's notes: the golden file records every blank with no data-type as a number,
   as site.js grades it on the live page, so its 41 blank groups were recorded again as
   number when the baseline was frozen (356 cases before, 520 after, 43 verdicts changed);
   that is the baseline, not a ledger entry. Its learner groups are 70 keys and 1,410
   cases.

   Usage: node tools/gen-grade-ledger.js [--check] [--rules A,B [--base REF]] [--summary]
     (none)      write the ledger (`reviewed` kept as it is on disk)
     --check     write nothing; exit 1 if any check fails or the file differs from a fresh run
     --rules     fail on any entry that is new against the ledger at --base (default
                 origin/main; a base with no file is the empty ledger) and whose rule is not
                 in the list: the PR's review aid
     --summary   print rule x direction x count with five samples each, for the PR body */

const fs = require("fs");
const path = require("path");

const site = require("./lib/site");
const git = require("./lib/git");
const { courseKeys } = require("./gen-grade-golden");
const legacy = require("../src/core/answer/legacy.ts");
const check = require("../src/core/answer/check.ts");

const ROOT = site.ROOT;
const OUT = "tools/fixtures/grade-ledger.json";
const GOLDEN = "tools/fixtures/grade-golden.json";

/* ------------------------------------------------------------ the rules -- */

/* every rule of the typed grader, in the order a change is put down to one: A-abs, N-exact,
   the other N-, L- and T- rules, then the E- rules in the order the expr pipeline runs
   them. Two guards switch too (T-zero, the zero-led coordinate, and T-final, the point
   compare that is final) but are tests' only and never name an entry */
const RULES = {
  "A-abs": "A key with an empty \"|\" piece (|x|) is one answer, not split on its bars.",
  "N-exact": "Numbers are compared exactly in BigInt, the 1e-9 band and a tol included, not in floats.",
  "N-unicode": "½ ¼ ¾ ⅓ ⅔, the dashes ‐ ‒ ﹣ － and full-width digits are read.",
  "N-divide": "÷ is read as /.",
  "N-dot": "A trailing full stop is dropped in a number, fraction or set box.",
  "N-named": "A number named with a letter (x = 3) is refused as named.",
  "N-refuse": "Text with no single reading (units, a symbol, words, an expression, two values) is refused with its reason.",
  "N-space": "A space inside a number is refused, not deleted.",
  "N-mixed": "A mixed number (1 1/2) is read by its value, 3/2.",
  "N-comma": "Thousands commas (5,050) are read in a number or fraction box.",
  "N-bracket": "A number in brackets ((7), (3)/(2)) is read.",
  "N-round": "A decimal equal to the key rounded or cut at its own places, with no tol, is form/rounded.",
  "N-whole": "A fraction typed for a whole-number key is form/unreduced (Q3(c) only).",
  "L-sep": "\" or \" and \" and \" separate the members of a set, as , and ; do.",
  "L-pm": "±7 in a set is the two members 7 and -7.",
  "L-zero": "A set member led by 0 and a digit (1,000 for the members 1 and 0) is refused.",
  "L-mixed": "A possible mixed number in a set (2 1/3, 2 and 1/3) is refused.",
  "L-repeat": "A set with exactly equal repeats whose distinct members pair with the key is form/repeated.",
  "T-value": "A point is compared by the exact values of its coordinates, in order.",
  "T-notation": "A point in [...], <...> or with labels is form/notation.",
  "E-mixed": "A mixed number in an expression keeps a mark, so it never equals a key.",
  "E-star": "· is read as *, and a * is kept before a digit, a point, + or -.",
  "E-pow": "** is read as ^, and ^(n) as ^n for an integer n.",
  "E-dot": "A trailing full stop is dropped in an expression.",
  "E-abs": "|e| is read as abs(e).",
  "E-plusneg": "+(-t) is read as -t for one term t, and +- as -.",
  "E-paren": "An outer pair of brackets is stripped only when the two match each other.",
  "E-terms": "The signed terms of a sum are sorted at every depth, never across a relation or a comma.",
  "unattributed": "No rule or pair of rules gives the change back; read by hand (reviewed)."
};
const ORDER = Object.keys(RULES).filter(id => id !== "unattributed");

/* a form or unread verdict's rule, by its reason */
const REASON_RULE = {
  "rounded": "N-round", "repeated": "L-repeat", "notation": "T-notation", "unreduced": "N-whole",
  "named": "N-named", "spaces": "N-space", "list-comma": "L-zero", "mixed-in-set": "L-mixed"
};
const ruleOfReason = (reason) => REASON_RULE[reason] || "N-refuse";

/* ---------------------------------------------------------- the value gate -- */

/* exact rationals, the gate's own: {n, d} in lowest terms, d > 0 */
const absB = (x) => (x < 0n ? -x : x);
function gcd(a, b) { a = absB(a); b = absB(b); while (b) { const r = a % b; a = b; b = r; } return a; }
function rat(n, d) {
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}
const sub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
const cmpQ = (a, b) => { const x = a.n * b.d - b.n * a.d; return x < 0n ? -1 : x > 0n ? 1 : 0; };
const absQ = (a) => ({ n: absB(a.n), d: a.d });

/* "12", "0.005", ".5", "1e-7" (String(tol) for a small one) as a rational, or null */
function decimal(s) {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(s));
  if (!m || (m[2] === "" && !m[3])) return null;
  const frac = m[3] || "", e = m[4] ? Number(m[4]) : 0;
  if (Math.abs(e) > 10000) return null;
  let n = BigInt((m[2] || "0") + frac), d = 10n ** BigInt(frac.length);
  if (e > 0) n *= 10n ** BigInt(e);
  if (e < 0) d *= 10n ** BigInt(-e);
  return rat(m[1] === "-" ? -n : n, d);
}

const DASHES = /[−–—‐‒﹣－]/g;
const cleanNumberSide = (s) => String(s).toLowerCase().trim().replace(/\s+/g, " ").replace(DASHES, "-").replace(/ ?\.$/, "").trim();

/* a cleaned number: a mixed number first, then (spaces deleted) a decimal or a/b */
function gateNumber(t) {
  let m = /^([+-]?) ?(\d+) (\d+)\/(\d+)$/.exec(t);
  if (m) {
    const w = BigInt(m[2]), a = BigInt(m[3]), b = BigInt(m[4]);
    if (b === 0n) return null;
    return rat((m[1] === "-" ? -1n : 1n) * (w * b + a), b);
  }
  if (/\d \d/.test(t)) return null;
  t = t.replace(/ /g, "");
  m = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(?:\/([+-]?(?:\d+(?:\.\d+)?|\.\d+)))?$/.exec(t);
  if (!m) return null;
  const a = decimal(m[1]), b = m[2] === undefined ? rat(1n, 1n) : decimal(m[2]);
  if (!a || !b || b.n === 0n) return null;
  return rat(a.n * b.d, a.d * b.n);
}

function close(a, b, tol) {
  const diff = absQ(sub(a, b));
  if (tol > 0) return cmpQ(diff, decimal(String(tol))) <= 0;
  /* |a-b| * 1e9 <= max(1, |a|, |b|) */
  const big = [rat(1n, 1n), absQ(a), absQ(b)].reduce((x, y) => (cmpQ(x, y) >= 0 ? x : y));
  return cmpQ(rat(diff.n * 1000000000n, diff.d), big) <= 0;
}

function gateSet(text) {
  let t = cleanNumberSide(text);
  if (/^\{.*\}$/.test(t)) t = t.slice(1, -1);
  const vals = t.split(/[,;]/).map(s => s.trim()).filter(s => s !== "").map(gateNumber);
  return vals.length && vals.every(v => v) ? vals.sort(cmpQ) : null;
}

/* a point: one outer (...) stripped, k >= 2 coordinates split on "," */
function gatePoint(text) {
  let t = cleanNumberSide(text);
  if (/^\(.*\)$/.test(t)) t = t.slice(1, -1);
  const parts = t.split(",").map(s => s.trim());
  if (parts.length < 2) return null;
  const vals = parts.map(gateNumber);
  return vals.every(v => v) ? vals : null;
}

/* the expr side's cleaning */
const cleanExprSide = (s) => String(s).toLowerCase().replace(/\s+/g, "").replace(/²/g, "^2").replace(/³/g, "^3")
  .replace(/[·⋅×]/g, "*").replace(DASHES, "-").replace(/π/g, "pi").replace(/√/g, "sqrt").replace(/\*\*/g, "^").replace(/\.$/, "");

/* A cleaned expression as a function of its letters, or null when it does not parse.
   sum := term (("+"|"-") term)*; term := unary (("*"|"/") unary | implicit unary)*;
   unary := ("+"|"-") unary | power; power := primary ("^" unary)?; primary := number,
   a letter, pi, sqrt or abs before a primary, (sum), |sum|. A "|" inside |...| closes it,
   so it never starts an implicit product there. */
function parseExpr(src) {
  let i = 0, bars = 0;
  const letters = new Set();
  const peek = () => src[i];
  const startsPrimary = (c) => c !== undefined && (/[0-9.a-z(]/.test(c) || (c === "|" && bars === 0));
  function sum() {
    let f = term();
    while (peek() === "+" || peek() === "-") {
      const op = src[i++], g = term(), h = f;
      f = op === "+" ? (env) => h(env) + g(env) : (env) => h(env) - g(env);
    }
    return f;
  }
  function term() {
    let f = unary();
    for (;;) {
      const c = peek();
      if (c === "*" || c === "/") {
        i++;
        const g = unary(), h = f;
        f = c === "*" ? (env) => h(env) * g(env) : (env) => h(env) / g(env);
      } else if (startsPrimary(c)) {
        const g = power(), h = f;
        f = (env) => h(env) * g(env);
      } else return f;
    }
  }
  function unary() {
    const c = peek();
    if (c === "+" || c === "-") { i++; const g = unary(); return c === "-" ? (env) => -g(env) : g; }
    return power();
  }
  function power() {
    const f = primary();
    if (peek() === "^") { i++; const g = unary(); return (env) => Math.pow(f(env), g(env)); }
    return f;
  }
  function primary() {
    const c = peek();
    if (c === undefined) throw new Error("end");
    let m = /^(\d+(?:\.\d*)?|\.\d+)/.exec(src.slice(i));
    if (m) { i += m[0].length; const v = parseFloat(m[0]); return () => v; }
    if (c === "(") {
      i++;
      const f = sum();
      if (src[i++] !== ")") throw new Error(")");
      return f;
    }
    if (c === "|") {
      i++; bars++;
      const f = sum();
      if (src[i++] !== "|") throw new Error("|");
      bars--;
      return (env) => Math.abs(f(env));
    }
    if (src.startsWith("sqrt", i)) { i += 4; const f = primary(); return (env) => Math.sqrt(f(env)); }
    if (src.startsWith("abs", i)) { i += 3; const f = primary(); return (env) => Math.abs(f(env)); }
    if (src.startsWith("pi", i)) { i += 2; return () => Math.PI; }
    if (/[a-z]/.test(c)) { i++; letters.add(c); return (env) => env[c]; }
    throw new Error("unexpected " + c);
  }
  try {
    const sides = src.split("=");
    if (sides.length > 2) return null;
    const fns = sides.map(s => { src = s; i = 0; bars = 0; const f = sum(); if (i !== s.length) throw new Error("trailing"); return f; });
    return { f: fns.length === 2 ? (env) => fns[0](env) - fns[1](env) : fns[0], relation: fns.length === 2, letters };
  } catch (e) {
    return null;
  }
}

/* mulberry32, the seeded stream the golden file's generators use too */
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

function sameExpr(given, key) {
  const a = parseExpr(given), b = parseExpr(key);
  if (!a || !b || a.relation !== b.relation) return false;
  const names = [...new Set([...a.letters, ...b.letters])].sort(), rand = mulberry(20261007);
  const signs = b.relation ? [1, -1] : [1];
  return signs.some(sign => {
    let seen = 0;
    for (let p = 0; p < 3; p++) {
      const env = {};
      /* each letter a multiple of 1/7 plus 0.3, about -10 to 10 */
      names.forEach(n => { env[n] = (Math.floor(rand() * 140) - 70) / 7 + 0.3; });
      const x = a.f(env), y = sign * b.f(env);
      if (!Number.isFinite(x) && !Number.isFinite(y)) continue;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      if (Math.abs(x - y) > 1e-9 * Math.max(1, Math.abs(x), Math.abs(y))) return false;
      seen++;
    }
    return seen > 0;
  });
}

const pieces = (answer) => { const raw = String(answer || "").trim(); return [raw].concat(raw.split("|")).map(s => s.trim()).filter(s => s !== ""); };
const NUMBER_TYPES = ["number", "fraction"];

/** Whether the value gate reads `given` as the value of a key alternative */
function gate(given, answer, type, tol) {
  tol = tol || 0;
  const alts = pieces(answer);
  if (NUMBER_TYPES.includes(type)) {
    const g = gateNumber(cleanNumberSide(given));
    return !!g && alts.some(a => { const k = gateNumber(cleanNumberSide(a)); return !!k && close(g, k, tol); });
  }
  if (type === "set") {
    const g = gateSet(given);
    return !!g && alts.some(a => { const k = gateSet(a); return !!k && k.length === g.length && k.every((v, j) => close(g[j], v, tol)); });
  }
  const point = type === "expr" ? null : gatePoint(given), text = cleanExprSide(given);
  if (!point && /\d\s+\d/.test(String(given))) return false;
  return alts.some(a => {
    const k = point && gatePoint(a);
    if (k && k.length === point.length) return k.every((v, j) => cmpQ(v, point[j]) === 0);
    return text === cleanExprSide(a) || sameExpr(text, cleanExprSide(a));
  });
}

/* ------------------------------------------------------------ the ledger -- */

function emptyLedger(revision) {
  return { revision, rules: [], flips: [], verdicts: [], specs: [], reviewed: [] };
}

/** The ledger on disk, or the empty ledger at GRADER when there is no file */
function readLedger(text) {
  if (text === undefined) {
    const file = path.join(ROOT, OUT);
    text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  }
  if (text === null) return emptyLedger(check.GRADER);
  const l = JSON.parse(text);
  return { revision: l.revision, rules: l.rules || [], flips: l.flips || [], verdicts: l.verdicts || [], specs: l.specs || [], reviewed: l.reviewed || [] };
}

const isEmpty = (l) => !l.flips.length && !l.verdicts.length && !l.specs.length && !l.reviewed.length;
const caseId = (from, given) => from + "\u0000" + given;

/* one entry per line, so a change is a readable diff */
function serialise(l) {
  const block = (name, list) => '  "' + name + '": ' + (list.length ? "[\n" + list.map(x => "    " + JSON.stringify(x)).join(",\n") + "\n  ]" : "[]");
  return "{\n" +
    '  "about": ' + JSON.stringify("Written by tools/gen-grade-ledger.js: every case of tools/fixtures/grade-golden.json whose verdict src/core/answer/check.ts changes, and the rule that changed it; reviewed is written by hand. src/core/grade.test.ts holds the grader to it.") + ",\n" +
    '  "revision": ' + JSON.stringify(l.revision) + ",\n" +
    ["rules", "flips", "verdicts", "specs", "reviewed"].map(n => block(n, l[n])).join(",\n") + "\n}\n";
}

/* every course exercise with a golden group whose type or tol is not the group's */
function specDrift(golden, keys) {
  const groups = new Map(golden.groups.map(g => [g.from, g]));
  const out = [];
  keys.forEach(k => {
    const g = groups.get(k.from);
    if (g && (g.type !== k.type || g.tol !== k.tol)) out.push({ from: k.from, was: { type: g.type, tol: g.tol }, now: { type: k.type, tol: k.tol } });
  });
  return out;
}

function readGolden() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, GOLDEN), "utf8"));
}

/* the grader's boolean */
const rightOf = (v) => v.kind === "right";

/** Run the grader over the golden file: { ledger, problems }. The golden file, the judge,
    the `reviewed` block and the course's keys can be handed in (the tests give a judge of
    their own); by default they are the file, check.ts, the block on disk and the pages. */
function build(o = {}) {
  const golden = o.golden || readGolden();
  const judge = o.judge || check.judge, judgeOff = o.judgeOff || check.judgeOff;
  const reviewed = o.reviewed || readLedger().reviewed;
  const keys = o.keys || courseKeys();
  const listed = new Map(reviewed.map(r => [caseId(r.from, r.given), r]));
  const used = new Set(), problems = [], flips = [], verdicts = [];

  golden.groups.forEach(g => {
    const spec = { answer: g.answer, type: g.type, tol: g.tol };
    for (const [list, want] of [[g.right, true], [g.wrong, false]]) {
      for (const given of list) {
        const was = legacy.grade(given, g.answer, g.type, g.tol);
        if (was !== want) { problems.push(g.from + ": legacy.ts says " + JSON.stringify(given) + " is " + (was ? "right" : "wrong") + ", the golden file " + (want ? "right" : "wrong")); continue; }
        const v = judge(given, spec), now = rightOf(v);
        const kindChange = !was && (v.kind === "form" || (v.kind === "unread" && v.reason !== "empty"));
        if (was === now && !kindChange) continue;
        const id = caseId(g.from, given), review = listed.get(id);
        if (review) used.add(id);
        let rule = null;
        if (v.kind === "form" || v.kind === "unread") rule = ruleOfReason(v.reason);
        else {
          const back = (off) => rightOf(judgeOff(given, spec, new Set(off))) === was;
          rule = ORDER.find(r => back([r])) || null;
          for (let a = 0; !rule && a < ORDER.length; a++) {
            for (let b = a + 1; !rule && b < ORDER.length; b++) if (back([ORDER[a], ORDER[b]])) rule = ORDER[a] + "+" + ORDER[b];
          }
        }
        const label = g.from + ": " + JSON.stringify(given) + " against " + JSON.stringify(g.answer) + " (" + g.type + ")";
        if (!rule) {
          if (!review) problems.push(label + ": no rule or pair of rules gives back the old verdict; fix it or list it in reviewed");
          rule = "unattributed";
        }
        if (!was && now && !review && !gate(given, g.answer, g.type, g.tol)) {
          problems.push(label + ": now right (" + rule + "), but the value gate does not read it as the key's value; fix it or list it in reviewed");
        }
        if (was !== now) {
          const verdict = v.kind === "form" || v.kind === "unread" ? v.kind + "/" + v.reason : v.kind;
          flips.push({ from: g.from, given, answer: g.answer, type: g.type, tol: g.tol, was, now, verdict, rule });
        } else verdicts.push({ from: g.from, given, kind: v.kind, reason: v.reason, rule });
      }
    }
  });
  reviewed.forEach(r => { if (!used.has(caseId(r.from, r.given))) problems.push("reviewed: " + r.from + ": " + JSON.stringify(r.given) + " matches no change"); });

  const ids = new Set();
  flips.concat(verdicts).forEach(e => e.rule.split("+").forEach(r => ids.add(r)));
  const rules = Object.keys(RULES).filter(id => ids.has(id)).map(id => ({ id, rule: RULES[id] }));
  return { ledger: { revision: check.GRADER, rules, flips, verdicts, specs: specDrift(golden, keys), reviewed }, problems };
}

/** What --check does: the problems build() finds, and a file on disk that differs from a
    fresh run (`text`: the file's text, null for no file; read from disk by default) */
function checkLedger(o = {}) {
  const text = o.text !== undefined ? o.text : (fs.existsSync(path.join(ROOT, OUT)) ? fs.readFileSync(path.join(ROOT, OUT), "utf8") : null);
  const disk = readLedger(text);
  const { ledger, problems } = build(Object.assign({ reviewed: disk.reviewed }, o));
  if (text === null) {
    if (!isEmpty(ledger)) problems.push(OUT + " is missing, and the grader changes verdicts; write it with node tools/gen-grade-ledger.js and read the diff");
  } else if (serialise(ledger) !== text) {
    problems.push(OUT + " differs from a fresh run; write it with node tools/gen-grade-ledger.js and read the diff");
  }
  return problems;
}

const entries = (l) => l.flips.map(e => ["flips", e]).concat(l.verdicts.map(e => ["verdicts", e]));

/** --rules: the entries new against `base` whose rule is not one of `allowed` */
function newRules(ledger, base, allowed) {
  const old = new Set(entries(base).map(([b, e]) => b + JSON.stringify(e)));
  return entries(ledger).filter(([b, e]) => !old.has(b + JSON.stringify(e)) && !e.rule.split("+").every(r => allowed.includes(r)))
    .map(([b, e]) => b + ": " + e.from + ": " + JSON.stringify(e.given) + " is new, by " + e.rule + ", which is not in --rules");
}

/** --summary: rule x direction x count, with five samples each */
function summary(ledger) {
  const rows = new Map();
  ledger.flips.forEach(e => {
    const k = e.rule + "  " + e.was + "→" + e.now + (e.verdict === "right" || e.verdict === "wrong" ? "" : " (" + e.verdict + ")");
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k).push(e);
  });
  ledger.verdicts.forEach(e => {
    const k = e.rule + "  wrong→" + e.kind + "/" + e.reason;
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k).push(e);
  });
  const lines = [...rows].map(([k, list]) => k + "  " + list.length + "\n" +
    list.slice(0, 5).map(e => "    " + JSON.stringify(e.given) + (e.answer !== undefined ? " for " + JSON.stringify(e.answer) : "") + "  (" + e.from + ")").join("\n"));
  return (lines.length ? lines.join("\n") : "no change") + "\n" + ledger.specs.length + " specs, " + ledger.reviewed.length + " reviewed";
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const arg = (name) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
  let failed = false;
  if (args.includes("--rules")) {
    const allowed = (arg("--rules") || "").split(",").filter(Boolean), base = arg("--base") || "origin/main";
    if (!git.resolveRef(ROOT, base)) { console.error("--base: " + base + " is not a commit"); process.exit(1); }
    const { ledger } = build();
    const bad = newRules(ledger, readLedger(git.showText(ROOT, base, OUT)), allowed);
    bad.forEach(p => console.error(p));
    console.log("--rules " + allowed.join(",") + " against " + base + ": " + (bad.length ? bad.length + " entries by another rule" : "every new entry by a listed rule"));
    failed = bad.length > 0;
  }
  if (args.includes("--summary")) console.log(summary(build().ledger));
  if (args.includes("--check")) {
    const problems = checkLedger();
    problems.forEach(p => console.error(p));
    const l = readLedger();
    console.log(OUT + (problems.length ? ": " + problems.length + " problems" : " is current: revision " + l.revision + ", " + l.flips.length + " flips, " + l.verdicts.length + " verdicts, " + l.specs.length + " specs, " + l.reviewed.length + " reviewed"));
    failed = failed || problems.length > 0;
  } else if (!args.includes("--rules") && !args.includes("--summary")) {
    const { ledger, problems } = build();
    problems.forEach(p => console.error(p));
    const file = path.join(ROOT, OUT);
    if (isEmpty(ledger) && !fs.existsSync(file)) console.log("the ledger is empty: nothing written (a missing " + OUT + " is the empty ledger)");
    else {
      fs.writeFileSync(file, serialise(ledger));
      console.log("wrote " + OUT + ": " + ledger.flips.length + " flips, " + ledger.verdicts.length + " verdicts, " + ledger.specs.length + " specs" + (problems.length ? "; " + problems.length + " problems" : ""));
    }
    failed = problems.length > 0;
  }
  process.exit(failed ? 1 : 0);
}

module.exports = { build, check: checkLedger, gate, readLedger, emptyLedger, serialise, specDrift, newRules, summary, RULES, ORDER, REASON_RULE, OUT };
