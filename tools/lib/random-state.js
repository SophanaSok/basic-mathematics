"use strict";
/* Random synced states for the merge laws: what assets/account.js's merge (now
   src/sync/merge.ts) is handed, as the site writes it, with what a later version of the
   site might add. Shared by tools/check-static.js (`merge`) and src/sync/merge.test.ts.

   randomState(R, { sectionConflicts }) builds one state from the seeded generator R
   (rng(seed)). sectionConflicts (default true) lets two devices disagree about an
   attempt record's `section`; false gives exactly the states the generator gave before
   that option existed, seed for seed, which the differential test against the merge as
   it was in assets/account.js needs, since that merge took either side's section. */

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
  return st;
}

module.exports = { rng, randomState, CHAPTERS, KEYS, DAYS, UNKNOWN_KEYS, UNKNOWN_VALUES, RUNG_VALUES, SECTIONS, OTHER_SECTIONS, SECTION_DAMAGED };
