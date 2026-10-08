/* The sync merge: how two copies of a reader's progress, this browser's and the account's
   (or another browser's set aside), become one. Sync is a merge, never an overwrite:
   solved exercises and finished missions are unions, XP is the larger number for each
   day, lesson position is the furthest reached, and the game record merges field by
   field (mergeGame). Merging the same two states in either order, grouped either way or
   twice gives the same result, but for the few fields that are this device's own
   choice (merge). The one copy, for assets/account.js (through window.BMMerge,
   src/ui/core.ts) and the tests.

   Moved from assets/account.js as it was; tools/check-static.js (`merge`),
   tools/game/merge.test.js and src/sync/merge.test.ts hold it to the laws. Pure: no
   `window`, no DOM, no storage. */

export function obj(x: any): any { return x && typeof x === "object" && !Array.isArray(x) ? x : {}; }
/* The keys of both, each once. A key is data, whatever it is called: one named like
   something every object inherits ("constructor", "toString") is listed like any other,
   and at() reads only what the object itself holds, so the inherited thing is never
   mistaken for a value. The one exception is "__proto__", which cannot be written back
   as an ordinary field and is left out of every record built here. */
export function keysOf(a: any, b: any) {
  var seen = Object.create(null), out: string[] = [];
  Object.keys(obj(a)).concat(Object.keys(obj(b))).forEach(function (k) {
    if (k !== "__proto__" && !seen[k]) { seen[k] = true; out.push(k); }
  });
  return out.sort();
}
export function at(o: any, k: any) { return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; }
export function plain(x: any) { return !!x && typeof x === "object" && !Array.isArray(x); }

/* JSON with object keys sorted at every level: jsonb hands keys back in its own order */
export function canon(x: any): string {
  if (Array.isArray(x)) return "[" + x.map(canon).join(",") + "]";
  if (x && typeof x === "object") {
    return "{" + Object.keys(x).sort().filter(function (k) { return x[k] !== undefined; })
      .map(function (k) { return JSON.stringify(k) + ":" + canon(x[k]); }).join(",") + "}";
  }
  return JSON.stringify(x === undefined ? null : x);
}

/* ------------------------------------------------------------- merging -- */

/* What this version has no rule for is not its to drop: a later version of the site may
   have put it there. One rule covers every such value. Held by one side only, it is
   kept; held by both, the one whose canonical JSON (canon) is the later string is kept.
   That is a maximum, so order, grouping and repetition matter no more than they do for
   the fields with rules of their own. Each such field is merged by itself, not along
   with whichever record wins on the known fields. */
export function later(p: any, q: any) {
  if (p === undefined) return q;
  if (q === undefined) return p;
  return canon(p) >= canon(q) ? p : q;
}
/* adds to a freshly built record every field of x and y that is not in `known` */
export function carryOver(out: any, x: any, y: any, known: any) {
  keysOf(x, y).forEach(function (k) {
    if (known.indexOf(k) < 0) out[k] = later(at(x, k), at(y, k));
  });
  return out;
}
/* Where a store is keyed by chapter, exercise, section or the like, every key is merged
   as a record of that kind, whether this version knows the key or not: a chapter added
   next year must still merge as a chapter. So an object under a key this version does
   not know comes out with that kind's known fields filled in, and merged field by field
   when both sides hold one. A value that is a record on neither side has no fields to
   merge, and goes through whole; that includes a damaged value under a known key,
   which is no longer turned into an empty record here (site.js writes over it). */
export function opaque(p: any, q: any) { return !plain(p) && !plain(q); }

export function mergeProgress(a: any, b: any) {
  var out: any = {};
  keysOf(a, b).forEach(function (ch) {
    var p = at(obj(a), ch), q = at(obj(b), ch);
    if (opaque(p, q)) { out[ch] = later(p, q); return; }
    var x = obj(p), y = obj(q), solved: any = {};
    keysOf(x.solved, y.solved).forEach(function (k) { solved[k] = true; });
    out[ch] = carryOver({ solved: solved, total: Math.max(x.total || 0, y.total || 0) }, x, y, ["solved", "total"]);
  });
  return out;
}

export function mergePlay(a: any, b: any) {
  var out: any = {};
  keysOf(a, b).forEach(function (ch) {
    var p = at(obj(a), ch), q = at(obj(b), ch);
    if (opaque(p, q)) { out[ch] = later(p, q); return; }
    var x = obj(p), y = obj(q), done: any = {};
    keysOf(x.done, y.done).forEach(function (k) { done[k] = true; });
    var rec: any = { done: done, total: Math.max(x.total || 0, y.total || 0) };
    var guess = x.guess !== undefined && x.guess !== null ? x.guess : y.guess;
    if (guess !== undefined && guess !== null) rec.guess = guess;
    out[ch] = carryOver(rec, x, y, ["done", "total", "guess"]);
  });
  return out;
}

/* The help ladder's position (`rung`, the highest clue opened while unsolved): the
   larger number. A value that is not a number (damaged, or written by a version that
   meant something else by it) loses to any number, and two such values fall back to
   the rule for unknown fields, so the result is still a maximum over one total order
   (numbers above everything else) and the merge laws hold. Present on neither side,
   absent; 0 is kept as it was written. */
export function isNum(v: any) { return typeof v === "number" && isFinite(v); }
export function maxRung(p: any, q: any) {
  if (p === undefined) return q;
  if (q === undefined) return p;
  if (isNum(p) && isNum(q)) return Math.max(p, q);
  if (isNum(p)) return p;
  if (isNum(q)) return q;
  return later(p, q);
}

/* An attempt record's `section`: the section of the page its exercise was asked in. Two
   devices can disagree about it (the page's markup moved the exercise between them, or a
   record was damaged), so it has a rule of its own that keeps the merge laws. A non-empty
   string beats absent or empty, and between two strings the greater by UTF-16 code units
   wins (JavaScript's own `>` on strings, not the order of code points). A value that is
   not a string but is truthy (damaged, or written by a version that meant something
   else by it) loses to any non-empty string, and two such values fall back to the rule
   for unknown fields (later), so the result is still a maximum over one total order.
   Empty, absent or another falsy value on both sides: absent, as before. */
export function maxSection(p: any, q: any) {
  var sp = typeof p === "string" && p !== "", sq = typeof q === "string" && q !== "";
  if (sp && sq) return p >= q ? p : q;
  if (sp) return p;
  if (sq) return q;
  return later(p || undefined, q || undefined);
}

/* one exercise's record seen from two devices */
export const ATTEMPT = ["tries", "hints", "rung", "opened", "inline", "section", "solved", "first", "skipped"];
export function mergeAttempt(x: any, y: any) {
  if (!plain(x) || !plain(y)) return plain(x) ? x : plain(y) ? y : later(x, y);
  var out: any = {};
  var tries = Math.max(x.tries || 0, y.tries || 0);
  var hints = Math.max(x.hints || 0, y.hints || 0);
  var rung = maxRung(at(x, "rung"), at(y, "rung"));
  if (tries) out.tries = tries;
  if (hints) out.hints = hints;
  if (rung !== undefined) out.rung = rung;
  if (x.opened || y.opened) out.opened = 1;
  if (x.inline || y.inline) out.inline = 1;
  var section = maxSection(at(x, "section"), at(y, "section"));
  if (section !== undefined) out.section = section;
  if (x.solved || y.solved) {
    out.solved = Math.min(x.solved || Infinity, y.solved || Infinity);
    /* "right first time" only if every device that solved it says so */
    out.first = (!x.solved || x.first) && (!y.solved || y.first) ? 1 : 0;
  } else if (x.skipped || y.skipped) {
    out.skipped = 1;
  }
  return carryOver(out, x, y, ATTEMPT);
}

export function mergeAttempts(a: any, b: any) {
  var out: any = {};
  keysOf(a, b).forEach(function (ch) {
    var p = at(obj(a), ch), q = at(obj(b), ch);
    if (opaque(p, q)) { out[ch] = later(p, q); return; }
    var x = obj(p), y = obj(q);
    out[ch] = {};
    keysOf(x, y).forEach(function (k) { out[ch][k] = mergeAttempt(at(x, k), at(y, k)); });
  });
  return out;
}

export function mergeActivity(a: any, b: any) {
  a = obj(a); b = obj(b);
  var days: any = {};
  keysOf(a.days, b.days).forEach(function (d) {
    days[d] = Math.max(at(obj(a.days), d) || 0, at(obj(b.days), d) || 0);
  });
  var out: any = { days: days };
  var goal = a.goal || b.goal;
  if (goal) out.goal = goal;
  return carryOver(out, a, b, ["days", "goal"]);
}

export function mergeLesson(a: any, b: any) {
  a = obj(a); b = obj(b);
  var reached: any = {};
  keysOf(a.reached, b.reached).forEach(function (ch) {
    reached[ch] = Math.max(at(obj(a.reached), ch) || 0, at(obj(b.reached), ch) || 0);
  });
  var out: any = { reached: reached };
  var mode = a.mode || b.mode;
  if (mode) out.mode = mode;
  return carryOver(out, a, b, ["reached", "mode"]);
}

/* The game layer's record (bm.game.v1). Every field merges so that order, grouping
   and repetition never matter:
     ach    union, keeping the earliest unlock time
     cmp    union of compared solutions
     sec    per section: n, ok and fix by max (ok never above n); the pair
            (last, box) taken whole from whichever is later, then higher
     best   per mode: highest score, then most hearts, then the earlier day
     enc    per set: the higher rematch medal, then the earlier day
     daily  union, keeping the latest 60 days
     maxed  max
     v      max: the shape of the whole synced state (SCHEMA below); left out until a
            version of the site sets it
   Anything else in the record, or in one of its sec, best or enc entries, is carried
   (later). */
export function num(x: any) { x = Number(x); return isFinite(x) ? x : 0; }
export function str(x: any) { return typeof x === "string" ? x : ""; }
export const GAME = ["ach", "cmp", "sec", "best", "enc", "daily", "maxed", "v"];
export function mergeGame(a: any, b: any) {
  a = obj(a); b = obj(b);
  var out: any = { ach: {}, cmp: {}, sec: {}, best: {}, enc: {}, daily: {}, maxed: Math.max(num(a.maxed), num(b.maxed)) };
  var v = Math.max(num(a.v), num(b.v));
  if (v > 0) out.v = v;
  var ach = [obj(a.ach), obj(b.ach)];
  keysOf(ach[0], ach[1]).forEach(function (id) {
    var t = [num(at(ach[0], id)), num(at(ach[1], id))].filter(function (x) { return x > 0; });
    if (t.length) out.ach[id] = Math.min.apply(null, t);
  });
  var cmp = [obj(a.cmp), obj(b.cmp)];
  keysOf(cmp[0], cmp[1]).forEach(function (ch) {
    var x = obj(at(cmp[0], ch)), y = obj(at(cmp[1], ch)), rec: any = {};
    keysOf(x, y).forEach(function (k) { if (at(x, k) || at(y, k)) rec[k] = 1; });
    out.cmp[ch] = rec;
  });
  var sec = [obj(a.sec), obj(b.sec)];
  keysOf(sec[0], sec[1]).forEach(function (id) {
    var p = at(sec[0], id), q = at(sec[1], id);
    if (opaque(p, q)) { out.sec[id] = later(p, q); return; }
    var x = obj(p), y = obj(q);
    var n = Math.max(num(x.n), num(y.n));
    /* each side's ok is held to its own n first, which keeps the merge associative */
    var rec: any = { n: n, ok: Math.max(Math.min(num(x.ok), num(x.n)), Math.min(num(y.ok), num(y.n))) };
    var lx = str(x.last), ly = str(y.last);
    var pick = lx > ly || (lx === ly && num(x.box) >= num(y.box)) ? x : y;
    rec.box = num(pick.box);
    if (str(pick.last)) rec.last = str(pick.last);
    var fix = Math.max(num(x.fix), num(y.fix));
    if (fix) rec.fix = fix;
    out.sec[id] = carryOver(rec, x, y, ["n", "ok", "box", "last", "fix"]);
  });
  var best = [obj(a.best), obj(b.best)];
  keysOf(best[0], best[1]).forEach(function (mode) {
    var p = at(best[0], mode), q = at(best[1], mode);
    if (opaque(p, q)) { out.best[mode] = later(p, q); return; }
    var list = [p, q].filter(plain)
      .map(function (r) { return { score: num(r.score), hearts: num(r.hearts), day: str(r.day) }; });
    list.sort(function (r, s) {
      return (s.score - r.score) || (s.hearts - r.hearts) || (r.day < s.day ? -1 : r.day > s.day ? 1 : 0);
    });
    out.best[mode] = carryOver(list[0], obj(p), obj(q), ["score", "hearts", "day"]);
  });
  var enc = [obj(a.enc), obj(b.enc)];
  keysOf(enc[0], enc[1]).forEach(function (id) {
    var p = at(enc[0], id), q = at(enc[1], id);
    if (opaque(p, q)) { out.enc[id] = later(p, q); return; }
    var list = [p, q].filter(plain)
      .map(function (r) { return { medal: num(r.medal), day: str(r.day) }; });
    list.sort(function (r, s) { return (s.medal - r.medal) || (r.day < s.day ? -1 : r.day > s.day ? 1 : 0); });
    out.enc[id] = carryOver(list[0], obj(p), obj(q), ["medal", "day"]);
  });
  var daily = [obj(a.daily), obj(b.daily)];
  keysOf(daily[0], daily[1]).filter(function (d) { return at(daily[0], d) || at(daily[1], d); })
    .reverse().slice(0, 60).sort().forEach(function (d) { out.daily[d] = 1; });
  return carryOver(out, a, b, GAME);
}

/* The placement check's record (bm.diag.v1): `{ takes: { <id>: take } }`, and whatever a
   later version adds beside `takes`. A take is written once and never changed, so it is
   merged whole, never field by field: field by field could pair one device's answers
   with another's band. The takes are a union by id; an id both sides hold with different
   content is the one whose canonical JSON is the later string (later), so each device
   keeps one copy of every take whatever order they meet in. That is a maximum over one
   total order, so the three laws hold, and nothing here is ever dropped. Opaque on
   purpose: an unknown field inside a take travels with whichever copy wins (the `merge`
   check in tools/check-static.js stops at diag.takes.<id> for that reason). A `diag` or
   a `takes` that is not an object (damaged) reads as empty, as `sec` does in mergeGame;
   a take that is damaged (a string, an array, null) is an ordinary value under later.
   "__proto__" as a take id is left out by keysOf, like every other record built here. */
export function mergeDiag(a: any, b: any) {
  var A = obj(a), B = obj(b), TA = obj(at(A, "takes")), TB = obj(at(B, "takes")), takes: any = {};
  keysOf(TA, TB).forEach(function (id) { takes[id] = later(at(TA, id), at(TB, id)); });
  return carryOver({ takes: takes }, A, B, ["takes"]);
}

/* local first: where two devices simply disagree (the reading mode, the daily goal,
   the place to continue from), this device keeps its own */
export function merge(local: any, remote: any) {
  local = obj(local); remote = obj(remote);
  return {
    progress: mergeProgress(local.progress, remote.progress),
    play: mergePlay(local.play, remote.play),
    attempts: mergeAttempts(local.attempts, remote.attempts),
    activity: mergeActivity(local.activity, remote.activity),
    lesson: mergeLesson(local.lesson, remote.lesson),
    last: local.last || remote.last || null,
    game: mergeGame(local.game, remote.game),
    diag: mergeDiag(local.diag, remote.diag)
  };
}

/* The newest shape of the synced data this version understands. A later version of the
   site that changes what a known field means, so that the merge above would damage
   it, marks the data by saving a larger number as `v` in the game record (mergeGame
   keeps the largest). It travels inside the data so that no SQL has to run before a
   site that reads it is deployed, and in the game record because that is the one
   synced store whose top level is a fixed set of named fields, each with its own
   rule: the others are keyed by chapter, or hold this device's own choices. No `v`
   means 1, and this version never writes one, so what is stored today stays as it is.

   Data marked newer than SCHEMA is still merged into this browser, so the reader keeps
   working with everything they have, but assets/account.js then writes nothing to the
   account, neither the row nor the attempt log (`ahead`), and the account page asks for
   a reload, which fetches the newer site. */
export const SCHEMA = 1;
export function versionOf(state: any) { return num(obj(obj(state).game).v); }
