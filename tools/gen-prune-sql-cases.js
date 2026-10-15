#!/usr/bin/env node
"use strict";
/* Writes supabase/tests/prune_cases.sql: the cases that hold the SQL side of the event log
   (private.events_prune and private.events_valid, supabase/migrations/*_events.sql) to the
   browser side (prune and isValid in src/sync/events.ts).

   Usage: node tools/gen-prune-sql-cases.js [--check]
   --check  write nothing; exit 1 when the file on disk is not what this would write
            (tools/check-static.js `migrations` runs the same comparison)

   60 prune cases: each a set of valid entries (10 to 120, over 1 to 3 sections and 1 to 6
   refs, with dense Arena days, competing checkpoints and equal times), the ids prune() keeps.
   400 validity cases: 200 valid entries and 200 drawn by mutating valid ones, each with the
   answer isValid() gives. The SQL does not recompute the hash inside an id, so a mutated
   entry gets the id its mutated payload hashes to; the answer is then isValid()'s, except
   that a checkpoint whose s is past today + 2 is refused (T14, which only the server knows).
   Both are drawn from the seeded generator rng(20261014), so the file is the same every run.
   The suite (supabase/tests/events.test.sql) reads the tables this file fills. */

const fs = require("fs");
const path = require("path");
const ev = require("../src/sync/events.ts");
const { rng } = require("./lib/random-state");

const FILE = path.join(__dirname, "..", "supabase", "tests", "prune_cases.sql");
const TODAY = 20800;
const ALNUM = "0123456789abcdefghijklmnopqrstuvwxyz";
const SECS = ["ch02#one-unknown", "ch05#angles", "pk-percent#find"];
const REFS = ["ch02/e3", "ch02/e4", "ch05/k1", "g:pk-pct-find", "pk/e1", "ch09/e7"];

function make(seed) {
  const R = rng(seed);
  const chars = (n) => { let o = ""; for (let i = 0; i < n; i++) o += ALNUM[R.int(36)]; return o; };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const smallX = () => R.pick([{ a: 1 }, { b: [1, 2, 3] }, { c: { d: "ok", e: null } }, { z: true, n: -5 }, {}, { w: [[1], [2]] }]);

  const page = (day, sec, ref) => {
    const t = day * 1440 + (R.maybe(0.3) ? R.int(3) : R.int(1440));
    const P = [t, day + (R.maybe(0.1) ? R.pick([-1, 1]) : 0), R.pick(["ex", "in", "tw"]), sec, ref,
      R.pick(["c", "c", "o", "h", "s", "q"]), R.int(2), R.int(5), R.int(4), R.pick([0, 1, 2, 16])];
    if (R.maybe(0.25)) P.push(smallX());
    return P;
  };
  const answer = (day, sec, ok) => {
    const t = day * 1440 + (R.maybe(0.3) ? R.int(3) : R.int(1440));
    return [t, day, "ar", sec, R.pick(["g:pk-pct-find", ""]), "a", ok, ok ? 1 : R.pick([0, 2]), 0, R.pick([0, 16])];
  };
  const checkpoint = (sec, s, l) => {
    const d = s - 1, n = 1 + R.int(40), o = R.int(n + 1);
    return [d * 1440, d, "cp", sec, "", "z", 0, 0, 0, 0, { b: R.int(5), l, s, n, o }];
  };

  function pruneCase() {
    const secs = SECS.slice(0, 1 + R.int(3)), refs = REFS.slice(0, 1 + R.int(6)), total = 10 + R.int(111);
    const base = 20700 + R.int(40), list = [];
    secs.forEach((sec) => {
      const cps = R.int(4), first = base + 3 + R.int(8);
      for (let j = 0; j < cps; j++) {
        const s = R.maybe(0.4) ? first : base + 3 + R.int(8), l = s - 2 - (R.maybe(0.5) ? 0 : R.int(5));
        const P = checkpoint(sec, s, l);
        list.push({ id: ev.checkpointId(P), P });
      }
    });
    for (let dense = R.int(3); dense > 0; dense--) {
      const sec = R.pick(secs), day = base + R.int(14);
      for (let i = 5 + R.int(11); i > 0; i--) { const ok = R.maybe(0.7) ? 1 : 0; const P = answer(day, sec, ok); list.push({ id: ev.eventId("dev" + chars(5), P, chars(8)), P }); }
    }
    while (list.length < total) {
      const P = R.maybe(0.55) ? page(base + R.int(14), R.maybe(0.2) ? "" : R.pick(secs), R.pick(refs)) : answer(base + R.int(14), R.pick(secs), R.int(2));
      list.push({ id: ev.eventId("dev" + chars(5), P, chars(8)), P });
    }
    const V = {};
    list.forEach((e) => { if (V[e.id]) return; if (!ev.isValid(e.id, e.P)) throw new Error("gen-prune-sql-cases: not valid: " + e.id + " " + JSON.stringify(e.P)); V[e.id] = e.P; });
    return { V, expected: Object.keys(ev.prune(V)).sort() };
  }

  /* an entry as { dev, rand, P }; the id is rebuilt from the payload after every mutation */
  const idOf = (c) => c.dev + "-" + (c.P && c.P[5] === "z" && c.dev === ev.CHECKPOINT_DEV ? ev.checkpointRand(c.P) : c.rand) + "-" + ev.hashOf(c.P);
  function validBase() {
    const day = TODAY - 15 + R.int(16);
    const kind = R.int(3);
    if (kind === 0) { const P = page(day, R.maybe(0.2) ? "" : R.pick(SECS), R.pick(REFS)); return { dev: "dev" + chars(5), rand: chars(8), P }; }
    if (kind === 1) { const P = answer(day, R.pick(SECS), R.int(2)); if (R.maybe(0.3)) P.push(smallX()); return { dev: "dev" + chars(5), rand: chars(8), P }; }
    const s = TODAY - 12 + R.int(15), P = checkpoint(R.pick(SECS), s, s - 2 - R.int(5));
    return { dev: ev.CHECKPOINT_DEV, rand: "", P };
  }
  const BAD_NUM = [-1, 1e300, 1.5, "7", null, true, [1], { a: 1 }, 1000, 100000, 1e13, -1e13, 2147483648];
  const BAD_STR = ["", "ABC", "a b", "é", 5, null, "a".repeat(91), "x".repeat(4), "a\\b", "a\"b", "A", [], { a: "b" }, "a\n"];
  const mutators = [
    ...[0, 1, 6, 7, 8, 9].flatMap((i) => [(c) => { c.P[i] = R.pick(BAD_NUM); }, (c) => { c.P[i] = R.pick([-1, 0, 1, 2, 9, 10, 999, 1000, 65535, 65536]); }]),
    (c) => { c.P[0] = R.pick([26999999, 27000000, 60000000, 60000001]); },
    (c) => { c.P[1] = R.pick([17999, 18000, 42000, 42001]); },
    (c) => { c.P[1] = Math.floor(c.P[0] / 1440) + R.pick([-2, -1, 1, 2]); },
    ...[2, 3, 4, 5].map((i) => (c) => { c.P[i] = R.pick(BAD_STR); }),
    (c) => { c.P[3] = "a".repeat(R.pick([90, 91])); },
    (c) => { c.P[2] = R.pick(["a", "abc", "abcd", "zz", "q"]); },
    (c) => { c.P[5] = R.pick(["a", "c", "z", "x", "ab"]); },
    (c) => { c.P.pop(); },
    (c) => { c.P.pop(); c.P.pop(); },
    (c) => { c.P.push(smallX()); c.P.push(1); },
    (c) => { c.P[10] = R.pick([[], [1], "x", 5, null, true, { a: 1.5 }, { a: 1e300 }, { a: "\\" }, { a: "\"" }, { a: "é" }, { "k\\": 1 }, { a: 1e12 }, { a: 1e12 + 1 }, { a: -1e12 - 1 }]); },
    (c) => { c.P[10] = R.pick([{ a: { b: { c: 1 } } }, { a: { b: { c: {} } } }, { a: { b: { c: { d: 1 } } } }, { a: [[[1]]] }, { a: [[[[]]]] }, { a: [[[[1]]]] }]); },
    (c) => { c.P[10] = { s: "x".repeat(R.pick([100, 450])) }; },
    (c) => { c.P[10] = { b: R.pick([0, 4, 5, -1]), l: R.pick([18000, 17999]), s: 20790, n: R.pick([0, 5, 1000000, 1000001]), o: R.pick([0, 5, 6]) }; },
    (c) => { c.dev = R.pick(["00000000", "dev00001", "devAAAAA", "dev"]); },
    (c) => { c.rand = R.pick(["", "ABCDEFGH", "abc", "abcdefghi"]); },
    (c) => { c.P[0] += 1440 * R.pick([1, 2]); },
  ];
  const zMutators = [
    (c) => { const x = c.P[10]; x.l = R.pick([x.s, x.s + 1, 17999, 42001, "x", 1.5]); },
    (c) => { const x = c.P[10]; x.n = R.pick([0, x.o - 1, 1000001, -1, null]); },
    (c) => { const x = c.P[10]; x.o = R.pick([x.n + 1, -1, "1", 1.5]); },
    (c) => { const x = c.P[10]; x.b = R.pick([5, -1, "2", 2.5, null]); },
    (c) => { delete c.P[10][R.pick(["b", "l", "s", "n", "o"])]; },
    (c) => { c.P[10].s = R.pick([TODAY + 2, TODAY + 3, TODAY + 10]); const s = c.P[10].s; c.P[10].l = s - 3; c.P[1] = s - 1; c.P[0] = (s - 1) * 1440; },
    (c) => { c.P[1] -= R.pick([1, 2]); },
    (c) => { c.P[0] += R.pick([1, 60]); },
    (c) => { c.P[2] = R.pick(["ex", "cps", "c"]); },
    (c) => { c.P[3] = ""; },
    (c) => { c.dev = "dev" + chars(5); },
  ];
  const structural = [
    ["[1,2,3]"], ['"x"'], ["null"], ["5"], ["{}"], ['{"p":[]}'], ['{"id":"short","p":[]}'], ['{"id":5,"p":5}'], ['{"p":null}'],
  ];

  const prune = [];
  for (let i = 0; i < 60; i++) prune.push(pruneCase());

  const valid = [];
  /* isValid()'s answer plus T14, which only the server knows */
  const isOk = (c) => {
    const z = c.P && c.P[5] === "z" && c.P[10] && typeof c.P[10] === "object" && !Array.isArray(c.P[10]) ? c.P[10] : null;
    return ev.isValid(idOf(c), c.P) && !(z && Number.isInteger(z.s) && z.s > TODAY + 2);
  };
  const record = (c) => valid.push({ e: JSON.stringify({ id: idOf(c), p: c.P }), expected: isOk(c) });
  for (let i = 0; i < 200; i++) {
    const c = validBase();
    if (!ev.isValid(idOf(c), c.P)) throw new Error("gen-prune-sql-cases: base not valid " + JSON.stringify(c));
    record(c);
  }
  /* 188 mutated ones, each redrawn until the mutation breaks a rule (a harmless one, such as
     a checkpoint's n staying at o, is kept only if it never does in 30 draws) */
  for (let i = 0; i < 188; i++) {
    for (let tries = 0; tries < 30; tries++) {
      const c = validBase();
      const pool = c.P[5] === "z" && R.maybe(0.5) ? zMutators : mutators;
      c.P = clone(c.P);
      R.pick(pool)(c);
      if (tries === 29 || !isOk(c)) { record(c); break; }
    }
  }
  structural.forEach((s) => valid.push({ e: s[0], expected: false }));
  /* a few whole-element mutations: no id, no p, id of the wrong type */
  const c0 = validBase(), id0 = idOf(c0);
  valid.push({ e: JSON.stringify({ p: c0.P }), expected: false });
  valid.push({ e: JSON.stringify({ id: id0 }), expected: false });
  valid.push({ e: JSON.stringify({ id: id0, p: Object.assign({}, c0.P) }), expected: false });
  return { prune, valid };
}

/* the SQL after the header line */
function body() {
  const { prune, valid } = make(20261014);
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const out = [];
  out.push("-- 60 prune cases and " + valid.length + " validity cases for supabase/tests/events.test.sql; see tools/gen-prune-sql-cases.js");
  out.push("create schema if not exists private;");
  out.push("create table if not exists private.prune_cases (case_no int, id text, p jsonb);");
  out.push("create table if not exists private.prune_expected (case_no int, ids text[]);");
  out.push("create table if not exists private.valid_cases (case_no int, e jsonb, today int, expected boolean);");
  out.push("truncate private.prune_cases, private.prune_expected, private.valid_cases;");
  prune.forEach((c, i) => {
    const rows = Object.keys(c.V).sort().map((id) => "(" + (i + 1) + ", " + q(id) + ", " + q(JSON.stringify(c.V[id])) + "::jsonb)");
    out.push("insert into private.prune_cases (case_no, id, p) values\n" + rows.join(",\n") + ";");
    out.push("insert into private.prune_expected (case_no, ids) values (" + (i + 1) + ", array[" + c.expected.map(q).join(", ") + "]::text[]);");
  });
  const vrows = valid.map((v, i) => "(" + (i + 1) + ", " + q(v.e) + "::jsonb, " + TODAY + ", " + v.expected + ")");
  out.push("insert into private.valid_cases (case_no, e, today, expected) values\n" + vrows.join(",\n") + ";");
  return out.join("\n") + "\n";
}
function header(b) { return "-- generated by tools/gen-prune-sql-cases.js from src/sync/events.ts; hash " + ev.fnv1a32(b).toString(16).padStart(8, "0") + "; do not edit\n"; }
function whole() { const b = body(); return header(b) + b; }

module.exports = { body, header, whole, FILE };

if (require.main === module) {
  const w = whole();
  if (process.argv.includes("--check")) {
    const have = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : null;
    if (have !== w) { console.error("supabase/tests/prune_cases.sql is stale: run node tools/gen-prune-sql-cases.js"); process.exit(1); }
    console.log("prune_cases.sql is current");
  } else {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, w);
    console.log("wrote " + path.relative(process.cwd(), FILE));
  }
}
