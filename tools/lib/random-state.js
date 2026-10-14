"use strict";
/* Random synced states for the merge laws: what assets/account.js's merge (now
   src/sync/merge.ts) is handed, as the site writes it, with what a later version of the
   site might add. Shared by tools/check-static.js (`merge`) and src/sync/merge.test.ts.

   randomState(R, { sectionConflicts }) builds one state from the seeded generator R
   (rng(seed)). sectionConflicts (default true) lets two devices disagree about an
   attempt record's `section`; false gives exactly the states the generator gave before
   that option existed, seed for seed, which the differential test against the merge as
   it was in assets/account.js needs, since that merge took either side's section.
   diag (default true) adds the placement check's record (bm.diag.v1) as the last thing
   drawn, so every other field of a state is the same as before it existed; but each state
   after the first in one stream (a, b, c from one generator) now follows a longer draw,
   so false gives exactly the earlier stream, and the differential test against the old
   merge, which has no diag, passes it.
   events (default true) adds one device's event log (bm.events.v1, src/sync/events.ts) as
   the very last thing drawn, after diag, the same way: every other field of a state is
   unchanged and false gives exactly the stream before. The entries come from a module-level
   pool (built once from a seed, so two devices often hold the same entry) plus a few fresh
   ones that are this device's own, and now and then an invalid one (a wrong hash, a time
   out of range, a count past its bound, a checkpoint from a device, a payload that is not
   an array, an id of the wrong shape), a damaged store or `ev`, a `v` of 2 or junk, and one
   id (EVENT_COLLISION) that may hold either of two valid payloads. */

/* a small seeded PRNG so a failing case can be reproduced by seed */
function rng(seed) {
  let s = seed >>> 0 || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  next.int = (n) => Math.floor(next() * n);
  next.pick = (arr) => arr[next.int(arr.length)];
  next.maybe = (p) => next() < (p === undefined ? 0.5 : p);
  return next;
}

const CHAPTERS = ["ch01", "ch02", "ch05", "interlude"];
const KEYS = ["e1", "e2", "e3", "k1", "k2", "t1", "p4"];
const DAYS = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"];
/* What a later version of the site might store that this one has never heard of
   (account.js `later`): few keys and few values, so two devices often hold the same key
   and disagree about it. The two objects differ only in the order of their keys. One key
   is named like something every object inherits, and is data all the same. */
const UNKNOWN_KEYS = ["zz", "~later", "faded", "constructor"];
/* what an attempt record's `rung` (the help ladder) may hold: the clue numbers the site
   writes, and what a damaged or differently-minded record might, so the rule for it
   (account.js maxRung: numbers above everything else) is held to over all of them */
const RUNG_VALUES = [1, 2, 3, 3, 0, 5, -1, "2", "x", true, null, [1], { a: 1 }];
/* the sections the page markup gives an attempt record, by its chapter and key, and the
   others a record may hold all the same (sectionConflicts): an upper-case letter, which
   comes before every lower-case one, and two characters whose order by UTF-16 code units
   (U+FF5E before the surrogate pair of U+1F600) is the reverse of their order by code
   points */
const SECTIONS = ["one-unknown", "ch02#one-unknown", "warmup"];
const OTHER_SECTIONS = SECTIONS.concat("Warmup", "practice", "ch05#angles", "\uff5e", "\ud83d\ude00");
/* what a damaged or differently-minded record may hold as its section instead of a string
   (sectionConflicts only), so maxSection's rule for values that are not strings (they
   lose to any non-empty string, and two of them fall back to `later`) is held to as well.
   Only truthy ones: a lone record's falsy section (0, false, '', null) is kept as it is
   by the merge and dropped when that result is merged with itself, an older gap that
   moved over with the merge and is not this rule's */
const SECTION_DAMAGED = [5, true, [1], { a: 1 }];
const UNKNOWN_VALUES = [0, 7, -1, "x", "", true, null, [1, 2], [2, 1], { a: 1, b: [1] }, { b: [1], a: 1 }, { a: { c: 2 } }];
/* The placement check's takes (src/types/state.ts DiagTake), few ids and few bodies so two
   devices often hold the same id: now identical, now different. An id may be one of
   UNKNOWN_KEYS, and "constructor" is data all the same. A take body never holds one of
   UNKNOWN_KEYS: a take is merged whole (mergeDiag), so the `merge` check does not look
   inside it. Damaged takes are values the merge keeps like any other. */
const TAKE_IDS = ["d1", "d2", "d3", "zz", "~later", "constructor"];
const TAKE_BODIES = [
  { v: 1, day: "2026-09-30", from: "a1", start: "algebra-1", band: "geometry", blueprint: 1, grader: 1, seed: 7, blocks: [], seeded: true },
  { v: 1, day: "2026-10-01", from: "none", start: "pre-algebra", band: "pre-algebra", blueprint: 1, grader: 1, seed: 9, blocks: [{ course: "pre-algebra", pass: false, items: [{ g: "x", s: 1, sec: "ch01#integers", k: "wrong" }] }], seeded: false, rushed: true },
  { v: 1, day: "2026-10-01", from: "a2", start: "algebra-2", band: "algebra-2", all: true, blueprint: 1, grader: 1, seed: 4294967295, blocks: [], seeded: true },
  { v: 2, day: "2026-10-01", band: "beyond", extra: [2, 1] }
];
const TAKE_DAMAGED = ["x", "", 7, null, true, [1], [], {}];
function randomDiag(R) {
  const unknown = (into) => {
    pickSomeOf(UNKNOWN_KEYS, 0.2, R).forEach(k => { into[k] = JSON.parse(JSON.stringify(R.pick(UNKNOWN_VALUES))); });
    return into;
  };
  /* once in thirty a diag that is not an object, and once in twenty a `takes` that is not */
  if (R.maybe(1 / 30)) return JSON.parse(JSON.stringify(R.pick(TAKE_DAMAGED)));
  const d = {};
  if (R.maybe(0.95)) {
    if (R.maybe(1 / 20)) d.takes = JSON.parse(JSON.stringify(R.pick(TAKE_DAMAGED)));
    else {
      d.takes = {};
      pickSomeOf(TAKE_IDS, 0.4, R).forEach(id => {
        d.takes[id] = R.maybe(0.1) ? JSON.parse(JSON.stringify(R.pick(TAKE_DAMAGED))) : JSON.parse(JSON.stringify(R.pick(TAKE_BODIES)));
      });
    }
  }
  return unknown(d);
}
const ev = require("../../src/sync/events.ts");
const D0 = Math.round(Date.UTC(2026, 9, 1) / 86400000) * 1440;
const EVENT_SECTIONS = ["ch02#one-unknown", "ch05#angles", "pk-percent#find", ""];
const EVENT_REFS = ["ch02/e3", "ch02/e4", "ch05/k1", "g:pk-pct-find", ""];
const ALNUM = "0123456789abcdefghijklmnopqrstuvwxyz";
const chars = (X, n) => { let o = ""; for (let i = 0; i < n; i++) o += ALNUM[X.int(36)]; return o; };
const clone = (x) => JSON.parse(JSON.stringify(x));
const pageEntry = (X) => {
  const t = D0 + X.int(60 * 1440), P = [t, Math.floor(t / 1440), X.pick(["ex", "in", "tw"]), X.pick(EVENT_SECTIONS), X.pick(EVENT_REFS),
    X.pick(["c", "o", "h", "s", "q"]), X.int(2), 1 + X.int(4), X.int(5), X.pick([0, 1, 2, 16])];
  if (X.maybe(0.2)) P.push(clone(X.pick(UNKNOWN_VALUES.filter(v => v && typeof v === "object" && !Array.isArray(v)).concat([{}, { zz: [1, 2] }]))));
  return P;
};
const arenaEntry = (X) => {
  const d = D0 / 1440 + X.int(40), ok = X.int(2);
  return [d * 1440, d, "ar", X.pick(EVENT_SECTIONS.slice(0, 3)), X.pick(["g:pk-pct-find", ""]), "a", ok, ok ? 1 : X.pick([0, 2]), 0, X.pick([0, 16]), ];
};
const POOL_P = [], POOL_S = [], POOL_Z = [];
/* two valid page payloads under one id: equal hashOf, so one id, found once by seeded
   brute force (variations of ok, n, r, t, f). The ref is one no other entry uses, so the pair
   is alone in its page group and never changes what prune drops: two payloads under one
   id resolve by the greater canon, which is lawful, but a lesser one that one side's prune
   counted and another's did not would break associativity (events.ts header), and the laws
   are held to on every state. */
const EVENT_COLLISION = (() => {
  const a = [29873695, 20745, "ex", "", "ch09/coll", "c", 0, 2, 1, 2];
  const b = [29923690, 20780, "ex", "", "ch09/coll", "c", 1, 2, 0, 0];
  const id = ev.eventId("devcoll1", a, "coll0001");
  if (ev.hashOf(a) !== ev.hashOf(b) || JSON.stringify(a) === JSON.stringify(b) || !ev.isValid(id, a) || !ev.isValid(id, b)) throw new Error("tools/lib/random-state.js: EVENT_COLLISION is not a pair of valid payloads under one id");
  return { id, a, b };
})();
(() => {
  const X = rng(20261014), mk = (P) => ({ id: ev.eventId("dev" + chars(X, 5), P, chars(X, 8)), P });
  for (let i = 0; i < 60; i++) POOL_P.push(mk(pageEntry(X)));
  for (let i = 0; i < 60; i++) POOL_S.push(mk(arenaEntry(X)));
  const sections = EVENT_SECTIONS.filter(s => s), per = [3, 3, 2], seenZ = {};
  sections.forEach((sec, si) => {
    const s0 = D0 / 1440 + 10 + si;
    for (let j = 0; j < per[si]; j++) {
      /* the first two share an s and differ in l, b, n, o when j is 1 */
      const s = j === 1 && X.maybe(0.6) ? s0 : s0 + j * 3, l = s - 2 - X.int(5), n = 1 + X.int(40), o = X.int(n + 1), b = X.int(5);
      const d = s - 1, P = [d * 1440, d, "cp", sec, "", "z", 0, 0, 0, 0, { b, l, s, n, o }];
      if (seenZ[ev.hashOf(P)]) { j--; continue; }
      seenZ[ev.hashOf(P)] = true;
      POOL_Z.push({ id: ev.checkpointId(P), P });
    }
  });
  POOL_P.concat(POOL_S, POOL_Z).forEach(e => { if (!ev.isValid(e.id, e.P)) throw new Error("tools/lib/random-state.js: a pool entry is not valid: " + e.id + " " + JSON.stringify(e.P)); });
})();
/* one device's bm.events.v1 */
function randomEvents(R) {
  const unknown = (into) => {
    pickSomeOf(UNKNOWN_KEYS, 0.2, R).forEach(k => { into[k] = clone(R.pick(UNKNOWN_VALUES)); });
    return into;
  };
  if (R.maybe(1 / 30)) return clone(R.pick(TAKE_DAMAGED));
  const st = { v: 1 };
  if (R.maybe(1 / 15)) st.v = 2;
  if (R.maybe(1 / 40)) st.v = R.pick(["x", null, 1.5]);
  if (R.maybe(1 / 20)) st.ev = clone(R.pick(TAKE_DAMAGED));
  else {
    const e = st.ev = {}, put = (id, P) => { e[id] = clone(P); };
    POOL_P.concat(POOL_S, POOL_Z).forEach(p => { if (R.maybe(0.3)) put(p.id, p.P); });
    const live = (P) => put(ev.eventId("dev" + chars(R, 5), P, chars(R, 8)), P);
    for (let i = R.int(5); i > 0; i--) live(pageEntry(R));
    for (let i = R.int(4); i > 0; i--) live(arenaEntry(R));
    /* the invalid ones, each now and then */
    if (R.maybe()) { const p = R.pick(POOL_P), q = R.pick(POOL_P.filter(x => ev.hashOf(x.P) !== ev.hashOf(p.P))); put(p.id.slice(0, -7) + ev.hashOf(q.P), p.P); }
    if (R.maybe()) { const P = pageEntry(R); P[0] = 1e12; P[1] = Math.floor(P[0] / 1440); live(P); }
    if (R.maybe()) { const P = pageEntry(R); P[7] = 1000; live(P); }
    if (R.maybe()) { const P = pageEntry(R); P[5] = "c"; put(ev.eventId(ev.CHECKPOINT_DEV, P, chars(R, 8)), P); }
    if (R.maybe()) { const z = R.pick(POOL_Z); put("dev00001" + z.id.slice(8), z.P); }
    if (R.maybe()) { const P = pageEntry(R); e[ev.eventId("dev" + chars(R, 5), P, chars(R, 8))] = clone(R.pick(["x", null, [1, 2, 3, 4, 5, 6, 7, 8, 9]])); }
    if (R.maybe()) put("short", pageEntry(R));
    if (R.maybe(0.3)) put(EVENT_COLLISION.id, R.maybe() ? EVENT_COLLISION.a : EVENT_COLLISION.b);
  }
  return unknown(st);
}
const pickSomeOf = (arr, p, R) => arr.filter(() => R.maybe(p));
function randomState(R, opts) {
  const conflicts = !opts || opts.sectionConflicts !== false;
  const st = {};
  const pickSome = (arr, p) => arr.filter(() => R.maybe(p === undefined ? 0.5 : p));
  const unknown = (into, values) => {
    pickSome(UNKNOWN_KEYS, 0.2).forEach(k => { into[k] = JSON.parse(JSON.stringify(R.pick(values))); });
    return into;
  };
  /* an unknown field of a record can hold anything */
  const fields = (rec) => unknown(rec, UNKNOWN_VALUES);
  /* an unknown key of a store keyed by chapter, exercise, section and so on is passed
     through only when it holds no record: a record there is merged as one of that kind,
     the same path as the known keys take */
  const entries = (map) => unknown(map, UNKNOWN_VALUES.filter(v => !v || typeof v !== "object" || Array.isArray(v)));
  st.progress = {};
  pickSome(CHAPTERS).forEach(ch => {
    const solved = {}; pickSome(KEYS).forEach(k => { solved[k] = true; });
    st.progress[ch] = fields({ solved, total: R.int(12) });
  });
  entries(st.progress);
  st.play = {};
  pickSome(CHAPTERS).forEach(ch => {
    const done = {}; pickSome(["pythagoras:0", "pythagoras:1", "linsys:0"]).forEach(k => { done[k] = true; });
    const rec = { done, total: R.int(6) };
    if (R.maybe(0.6)) rec.guess = R.int(4);
    st.play[ch] = fields(rec);
  });
  entries(st.play);
  /* attempt records as site.js writes them (initExercises check()/reveal(), the ladder's
     persist, lesson.js advance()): `tries` >= 1 when present, `hints` only 1 or 2, `rung`
     a clue number (and now and then something else: RUNG_VALUES), `first` only alongside
     `solved`, `skipped` never alongside `solved`, and `section`/`inline` fixed by the
     page markup — so two devices can never disagree about them for the same key. But
     with `sectionConflicts` (the default), one section in ten is another non-empty one
     (OTHER_SECTIONS), as a page whose markup moved an exercise, or a damaged record,
     would leave it, so two devices often disagree about it, and one in twenty is not a
     string at all (SECTION_DAMAGED) */
  st.attempts = {};
  pickSome(CHAPTERS).forEach(ch => {
    st.attempts[ch] = {};
    pickSome(KEYS).forEach((k, idx) => {
      const a = {};
      const inlineKey = /^[kt]/.test(k);
      if (R.maybe(0.8)) a.tries = 1 + R.int(4);
      else a.opened = 1;                      /* solution opened before any check */
      if (a.tries && R.maybe(0.4)) a.hints = 1 + R.int(2);
      if (R.maybe(0.35)) a.rung = R.maybe(0.8) ? 1 + R.int(3) : JSON.parse(JSON.stringify(R.pick(RUNG_VALUES)));
      if (R.maybe(0.3)) a.opened = 1;
      if (inlineKey) a.inline = 1;
      if (R.maybe(0.85)) {
        a.section = SECTIONS[(ch.length + k.charCodeAt(1)) % 3];
        if (conflicts && R.maybe(0.1)) a.section = R.pick(OTHER_SECTIONS.filter(s => s !== a.section));
        if (conflicts && R.maybe(0.05)) a.section = JSON.parse(JSON.stringify(R.pick(SECTION_DAMAGED)));
      }
      if (a.tries && R.maybe(0.5)) { a.solved = 1700000000000 + R.int(1e9); a.first = a.tries === 1 && !a.opened ? 1 : 0; }
      else if (inlineKey && R.maybe(0.3)) a.skipped = 1;
      st.attempts[ch][k] = fields(a);
    });
    entries(st.attempts[ch]);
  });
  entries(st.attempts);
  const days = {}; pickSome(DAYS).forEach(d => { days[d] = 1 + R.int(80); });
  st.activity = fields({ days });
  if (R.maybe(0.5)) st.activity.goal = R.pick([20, 30, 50]);
  const reached = {}; pickSome(CHAPTERS).forEach(ch => { reached[ch] = 1 + R.int(30); });
  st.lesson = fields({ reached });
  if (R.maybe(0.5)) st.lesson.mode = R.pick(["steps", "page"]);
  st.last = R.maybe(0.6) ? { id: R.pick(CHAPTERS), section: R.maybe() ? "one-unknown" : null } : null;
  /* the game layer that is about to land; mergeGame does not exist yet */
  const ach = {}; pickSome(["first-solve", "ten-day", "chapter-1"]).forEach(k => { ach[k] = 1700000000000 + R.int(1e9); });
  const cmp = {}; pickSome(CHAPTERS, 0.4).forEach(ch => { cmp[ch] = {}; pickSome(KEYS, 0.4).forEach(k => { cmp[ch][k] = 1; }); });
  const sec = {}; pickSome(["ch02#one-unknown", "ch05#angles"]).forEach(s => {
    sec[s] = fields({ n: R.int(10), ok: R.int(10), box: R.int(5), last: R.pick(DAYS), fix: 1700000000000 + R.int(1e9) });
  });
  const best = {}; pickSome(["sprint", "survival"]).forEach(m => { best[m] = fields({ score: R.int(500), hearts: R.int(4), day: R.pick(DAYS) }); });
  const enc = {}; pickSome(["ch02/practice", "ch05/practice"]).forEach(e => { enc[e] = fields({ medal: R.pick(["bronze", "silver", "gold"]), day: R.pick(DAYS) }); });
  const daily = {}; pickSome(DAYS).forEach(d => { daily[d] = 1; });
  st.game = fields({ ach, cmp, sec: entries(sec), best: entries(best), enc: entries(enc), daily, maxed: R.int(5) });
  /* the shape marker a later version may set (account.js SCHEMA): absent on most devices */
  if (R.maybe(0.3)) st.game.v = R.pick([1, 2, 9, 10]);   /* 9 and 10: the larger number is not the later string */
  /* last, so that every draw above is the same with or without it */
  if (!opts || opts.diag !== false) st.diag = randomDiag(R);
  /* and after that, so the same holds for diag */
  if (!opts || opts.events !== false) st.events = randomEvents(R);
  return st;
}

module.exports = { rng, randomState, randomDiag, randomEvents, EVENT_SECTIONS, EVENT_REFS, EVENT_COLLISION, POOL_P, POOL_S, POOL_Z, TAKE_IDS, TAKE_BODIES, TAKE_DAMAGED, CHAPTERS, KEYS, DAYS, UNKNOWN_KEYS, UNKNOWN_VALUES, RUNG_VALUES, SECTIONS, OTHER_SECTIONS, SECTION_DAMAGED };
