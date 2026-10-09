/* The placement check's questions, its walk and its rule: which generator questions a course
   block asks, when a block is settled, which block comes next, and which course the answers
   place the learner in. Decision 0003; the design is ~/.claude/plans/diagnostic-design.md.

   Four blocks, one per course: Pre-algebra and Algebra 1 ask 8 questions and clear at 5 right,
   Geometry and Algebra 2 ask 6 and clear at 4. A block stops the moment its answer is settled
   (clear at `pass` right, not yet when the misses pass `size - pass`), which is the decision
   the whole block would give, only sooner.

   The walk starts at the course the learner names. It goes down a prerequisite when a course
   is not yet and up when one is cleared, and once Algebra 1 is cleared it asks both Geometry
   and Algebra 2, since neither needs the other in this book. Clearing a course counts every
   prerequisite of it as cleared (implied), never a sibling.

   The band is the first course, in the US order pre-algebra, algebra-1, geometry, algebra-2,
   that is not cleared. Geometry's questions are all coordinate work and sets, so a learner
   who says they have not finished Geometry is never placed past it by that block alone (the
   Geometry hold). A right value in the wrong form (`form`) does not count; it can mark the
   result "close". Nothing here is a score: it is a course, and a take is written once.

   An empty box and an `unread` answer record nothing and use up no question. A question's
   seed is a function of (seed, course, form index, retry) alone, so a block is the same on
   any device after any reload.

   Pure: no `window`, no DOM, no storage, no clock, no randomness. The generators' make, hash
   and rng are passed in; the page supplies the take's seed, id and day. */

import { COURSES } from "../data/skills.ts";
import type { FormReason, Verdict } from "../core/answer/types.ts";
import type {
  DiagBlock, DiagFrom, DiagItem, DiagKind, DiagRun, DiagRunItem, DiagStore, DiagTake, Placeable, SectionRef
} from "../types/state.ts";
import {
  BLUEPRINT, DIAG_FORM_RIGHT, DIAG_HOLD_FROM, DIAG_PASS, DIAG_SIZE, RUSH_COUNT, RUSH_FLOOR_S, RUSH_FRACTION
} from "./constants.ts";
import { addDays } from "./recall.ts";

export { BLUEPRINT };
export type { DiagBlock, DiagFrom, DiagItem, DiagKind, DiagRun, DiagRunItem, DiagTake, DiagStore, Placeable } from "../types/state.ts";

/* ----------------------------------------------------------------- courses -- */

/** The US order the band is read in. "beyond" never appears: nothing is asked from it. */
export const L: readonly Placeable[] = COURSES.filter(isPlaceable);

/** The prerequisite of each course, by this book (not by position in L): Algebra 1 needs
    Pre-algebra, and Geometry and Algebra 2 each need Algebra 1. */
export const PRE: Readonly<Record<Placeable, Placeable | null>> = {
  "pre-algebra": null, "algebra-1": "pre-algebra", "geometry": "algebra-1", "algebra-2": "algebra-1"
};

/** The block a self-report starts at. "Not sure" starts at the easiest. */
export const START_OF: Readonly<Record<DiagFrom, Placeable>> = {
  none: "pre-algebra", pre: "algebra-1", a1: "geometry", geo: "algebra-2", a2: "algebra-2", unsure: "pre-algebra"
};

const SHORT: Readonly<Record<Placeable, keyof typeof DIAG_SIZE>> = {
  "pre-algebra": "pre", "algebra-1": "a1", "geometry": "geo", "algebra-2": "a2"
};

/** Whether a value is a course the check can place a learner in. */
export function isPlaceable(x: unknown): x is Placeable {
  return x === "pre-algebra" || x === "algebra-1" || x === "geometry" || x === "algebra-2";
}

/* ------------------------------------------------------------------- forms -- */

/** One question of a form: the generator and the section it tests. The sections are held to
    generatorSkill (src/data/skills.ts) by the tests, which also hold each generator's course
    to its block. */
export interface Form { g: string; sec: SectionRef }

/** Blueprint 1. Only generators whose course is the block's; `quad-count`, `quadrant` and
    `i-power` are left out for low information, and authored exercises never appear. Geometry
    has five generators, so `point-sum` is asked twice, with different numbers. */
export const FORMS: Readonly<Record<Placeable, readonly Form[]>> = {
  "pre-algebra": [
    { g: "tri-angle", sec: "ch05#parallels" },
    { g: "frac-sum", sec: "ch01#rationals" },
    { g: "lin-brackets", sec: "ch02#one-unknown" },
    { g: "flat-area", sec: "ch07#polygons" },
    { g: "frac-divide", sec: "ch01#inverses" },
    { g: "pyth-side", sec: "ch05#pythagoras" },
    { g: "word-two", sec: "ch02#word-problems" },
    { g: "slope-two", sec: "ch10#line-equation" }
  ],
  "algebra-1": [
    { g: "poly-eval", sec: "ch12#definition-fn" },
    { g: "ineq-flip", sec: "ch03#order" },
    { g: "abs-solve", sec: "ch03#absolute" },
    { g: "pow-frac", sec: "ch03#powers" },
    { g: "quad-square", sec: "ch04#square-roots" },
    { g: "vertex-x", sec: "ch04#graph" },
    { g: "exp-solve", sec: "ch12#exponential" },
    { g: "quad-roots", sec: "ch04#formula" }
  ],
  "geometry": [
    { g: "perp-slope", sec: "ch10#lines" },
    { g: "point-sum", sec: "ch09#addition-points" },
    { g: "seg-point", sec: "ch10#segments" },
    { g: "circle-read", sec: "ch08#circle" },
    { g: "set-ops", sec: "interlude#sets" },
    { g: "point-sum", sec: "ch09#addition-points" }
  ],
  "algebra-2": [
    { g: "log-int", sec: "ch12#log" },
    { g: "deg-rad", sec: "ch11#radians" },
    { g: "remainder", sec: "ch12#polynomials" },
    { g: "cx-mult", sec: "ch14#complex-arith" },
    { g: "sum-range", sec: "ch15#summations" },
    { g: "geo-finite", sec: "ch15#geometric" }
  ]
};

/* The line under the box says what shape the answer takes. It follows the generator, not the
   answer type: `ineq-flip` and `point-sum` are both type `exact`. Two generators vary their
   shape inside one id, and for those the line follows the made problem's `type`. */
const WHOLE = "A whole number, like -7.";
const FRACTION = "A whole number or a fraction, like -7 or 3/4.";
const POINT = "A point, like (2, -5).";
const LIST = "All the answers, separated by commas, like 2, -3.";

/** The format line of each generator, or, where the shape varies, of each answer type. */
export const FORMAT: Readonly<Record<string, string | Readonly<Record<string, string>>>> = {
  "tri-angle": WHOLE, "lin-brackets": WHOLE, "flat-area": WHOLE, "pyth-side": WHOLE, "word-two": WHOLE,
  "poly-eval": WHOLE, "vertex-x": WHOLE, "exp-solve": WHOLE, "log-int": WHOLE, "remainder": WHOLE,
  "sum-range": WHOLE, "geo-finite": WHOLE,
  "frac-sum": FRACTION, "frac-divide": FRACTION, "slope-two": FRACTION, "perp-slope": FRACTION, "pow-frac": FRACTION,
  "point-sum": POINT, "seg-point": POINT,
  "abs-solve": LIST, "quad-square": LIST, "quad-roots": LIST, "set-ops": LIST,
  "ineq-flip": "An inequality, like x < 5.",
  "cx-mult": "A complex number, like 3 + 4i.",
  "circle-read": { number: WHOLE, exact: POINT },
  "deg-rad": { number: "A number of degrees, like 210.", expr: "An expression with π (type pi), like 7pi/6." }
};

/** The format line for a made problem, or null for a generator or type the table lacks. */
export function formatOf(g: string, type?: string | null): string | null {
  if (!Object.hasOwn(FORMAT, g)) return null;
  const f = FORMAT[g];
  if (typeof f === "string") return f;
  const t = type || "exact";
  return Object.hasOwn(f, t) ? f[t] : null;
}

/** What each course's questions covered, for the result and the return view, with the FORMS
    sections each line speaks for (the tests hold the two together, so a new generator cannot
    leave a line stale). */
export const COVERAGE: Readonly<Record<Placeable, { line: string; secs: readonly string[] }>> = {
  "pre-algebra": {
    line: "fractions, linear equations, angles, area, the Pythagorean theorem, slope, word problems.",
    secs: ["ch01#rationals", "ch01#inverses", "ch02#one-unknown", "ch05#parallels", "ch07#polygons", "ch05#pythagoras",
      "ch10#line-equation", "ch02#word-problems"]
  },
  "algebra-1": {
    line: "functions, inequalities, absolute value, powers, square roots, quadratics, exponential equations.",
    secs: ["ch12#definition-fn", "ch03#order", "ch03#absolute", "ch03#powers", "ch04#square-roots", "ch04#graph",
      "ch04#formula", "ch12#exponential"]
  },
  "geometry": {
    line: "coordinates, lines, circles and sets. Not proofs, congruence, transformations or solids.",
    secs: ["ch09#addition-points", "ch10#lines", "ch10#segments", "ch08#circle", "interlude#sets"]
  },
  "algebra-2": {
    line: "logarithms, radians, polynomials, complex numbers, sums and sequences. Not trigonometry.",
    secs: ["ch12#log", "ch11#radians", "ch12#polynomials", "ch14#complex-arith", "ch15#summations", "ch15#geometric"]
  }
};

/** Copies the Arena's clean() (assets/arena.js): a trailing degree sign, "deg" or "degrees"
    comes off a number or fraction answer. Anything else is left for the grader to read. */
export function stripDegrees(given: unknown, type?: string | null): string {
  const s = String(given);
  return type === "number" || type === "fraction" ? s.replace(/\s*(°|deg(rees?)?)\s*$/i, "") : s;
}

/* ----------------------------------------------------------------- drawing -- */

/** What drawBlock needs of a made problem (BMGen.make): the question text, to avoid a repeat,
    and the generator's par, to put the quickest question first. */
export interface Made { q: string; par: number }
export type Make = (g: string, s: number) => Made | null;
export type Hash = (text: string) => number;
export type MakeRng = (seed: number) => { shuffle<T>(items: T[]): T[] };

/** Times a repeated question text is redrawn before the repeat is accepted. */
const RETRIES = 20;

/** A block's questions in the order they are asked. Question 1 is the lowest par (a tie goes
    to the earlier form), a confidence builder; the rest are a seeded shuffle, so a block that
    clears early is not always the same easy subset. Depends only on (seed, course): the same
    block on any device. */
export function drawBlock(course: Placeable, seed: number, make: Make, hash: Hash, rng: MakeRng): DiagRunItem[] {
  const seen = new Set<string>();
  const drawn = FORMS[course].map((f, i) => {
    for (let retry = 0; ; retry++) {
      const s = 1 + (hash(seed + ":" + course + ":" + i + ":" + retry) % 2147483646);
      const p = make(f.g, s);
      if (!p) throw new Error("no generator " + f.g);
      if (!seen.has(p.q) || retry >= RETRIES) {
        seen.add(p.q);
        return { item: { g: f.g, s, sec: f.sec } as DiagRunItem, par: p.par };
      }
    }
  });
  let first = 0;
  drawn.forEach((d, i) => { if (d.par < drawn[first].par) first = i; });
  const rest = rng(hash(seed + ":" + course + ":order")).shuffle(drawn.filter((_, i) => i !== first));
  return [drawn[first], ...rest].map((d) => d.item);
}

/* ------------------------------------------------------------------ scoring -- */

export type BlockState = "clear" | "not-yet" | "open";

/** A block's standing from its answers so far, in the order asked. Clear at `pass` right,
    not yet when the not-right count passes `size - pass`; open until then. A `form` answer
    counts as right only if `formRight`. Answers after the decision are ignored. */
export function scoreBlock(
  course: Placeable, kinds: readonly (DiagKind | undefined)[], formRight: boolean = DIAG_FORM_RIGHT
): { state: BlockState; right: number; notRight: number } {
  const key = SHORT[course], pass = DIAG_PASS[key], most = DIAG_SIZE[key] - pass;
  let right = 0, notRight = 0;
  for (const k of kinds) {
    if (k === undefined) break;
    if (k === "right" || (formRight && k === "form")) right++; else notRight++;
    if (right >= pass) return { state: "clear", right, notRight };
    if (notRight > most) return { state: "not-yet", right, notRight };
  }
  return { state: "open", right, notRight };
}

/* ---------------------------------------------------------------- the walk -- */

/** Where each course stands. Absent means unknown. "implied" is cleared without being asked. */
export type Status = Partial<Record<Placeable, "clear" | "not-yet" | "implied" | "open">>;

/** The status of every course from the blocks dealt so far; clearing one implies every
    prerequisite of it that was not asked. */
export function statusOf(blocks: readonly { course: Placeable; items: readonly { k?: DiagKind }[] }[]): Status {
  const status: Status = {};
  blocks.forEach((b) => { status[b.course] = scoreBlock(b.course, b.items.map((i) => i.k)).state; });
  L.forEach((c) => {
    if (status[c] !== "clear") return;
    for (let p = PRE[c]; p; p = PRE[p]) if (status[p] === undefined) status[p] = "implied";
  });
  return status;
}

const cleared = (s: Status, c: Placeable) => s[c] === "clear" || s[c] === "implied";
const NEXT = (c: Placeable) => L.filter((n) => PRE[n] === c);

/** The block to deal next, or null when nothing is to be dealt: a block is still open, or
    the walk is over. 1. a course that is not yet whose prerequisite is unknown sends the
    walk down; 2. a cleared course with an unknown next course sends it up, Geometry before
    Algebra 2; 3. stop. With nothing asked yet it is the start block. */
export function nextBlock(status: Status, start: Placeable): Placeable | null {
  if (L.every((c) => status[c] === undefined)) return start;
  if (L.some((c) => status[c] === "open")) return null;
  for (const c of L) {
    const p = PRE[c];
    if (status[c] === "not-yet" && p && status[p] === undefined) return p;
  }
  for (const c of L) {
    if (!cleared(status, c)) continue;
    const up = NEXT(c).find((n) => status[n] === undefined);
    if (up) return up;
  }
  return null;
}

/** Where the answers place the learner: the first course in L that is not cleared, or that
    is held. Geometry is held when its block was cleared and the learner said they had not
    finished it (DIAG_HOLD_FROM). Every course cleared gives Algebra 2 with `all`. The hold
    changes only the band: the table and the seeds follow the block outcomes. */
export function placeOf(status: Status, from: DiagFrom): { band: Placeable; all?: true } {
  const held = (c: Placeable) => c === "geometry" && status[c] === "clear" && DIAG_HOLD_FROM.includes(from);
  const band = L.find((c) => !cleared(status, c) || held(c));
  return band ? { band } : { band: "algebra-2", all: true };
}

/** How a placed block's near miss shows: "count" (one right short of clearing), "form"
    (it would have cleared with its `form` answers counted; shown in preference), or null.
    Only the band's own block can set it. */
export function closeBy(blocks: readonly DiagBlock[], band: Placeable): "count" | "form" | null {
  const b = blocks.find((x) => x.course === band);
  if (!b) return null;
  const kinds = b.items.map((i) => i.k);
  const strict = scoreBlock(band, kinds);
  if (strict.state !== "not-yet") return null;
  if (scoreBlock(band, kinds, true).state === "clear") return "form";
  return strict.right === DIAG_PASS[SHORT[band]] - 1 ? "count" : null;
}

/** The band, when the result is "close": see closeBy. */
export function closeOf(blocks: readonly DiagBlock[], band: Placeable): Placeable | undefined {
  return closeBy(blocks, band) ? band : undefined;
}

/* ------------------------------------------------------------------ the run -- */

/** What the learner did with the open question. `empty` is Submit with nothing typed (the
    grader is never called); `unread` is a verdict that could not be read; `form` carries
    the grader's reason. */
export type Outcome =
  | { kind: "empty" | "right" | "wrong" | "skip" }
  | { kind: "unread"; reason?: string }
  | { kind: "form"; reason: FormReason };

/** A grader verdict as an outcome. Only `kind` and a `form` or `unread` reason are read. */
export function outcomeOf(v: Verdict): Outcome {
  if (v.kind === "form") return { kind: "form", reason: v.reason };
  return v.kind === "unread" ? { kind: "unread", reason: v.reason } : { kind: v.kind };
}

/** The open question: the first unanswered item of the latest block, while that block is not
    settled. Null when a new block is to be dealt (see nextBlock) or the check is over. */
export function nextItem(run: DiagRun): { block: number; index: number; item: DiagRunItem } | null {
  const block = run.blocks.length - 1;
  if (block < 0) return null;
  const b = run.blocks[block];
  if (scoreBlock(b.course, b.items.map((i) => i.k)).state !== "open") return null;
  const index = b.items.findIndex((i) => i.k === undefined);
  return index < 0 ? null : { block, index, item: b.items[index] };
}

/** Whether every dealt block is settled and the walk has nowhere left to go. */
export function finished(run: DiagRun): boolean {
  const status = statusOf(run.blocks);
  return run.blocks.length > 0 && nextBlock(status, run.start) === null && !L.some((c) => status[c] === "open");
}

/** The run after an outcome on the open question (a new run; the old one is not touched).
    An empty box changes nothing. `unread` only raises the count on the question and keeps
    the question open. Anything else answers it: the kind is recorded, with the `form`
    reason, the `unread` count if any, and the seconds taken (a skip has none). */
export function step(run: DiagRun, outcome: Outcome, secs: number): DiagRun {
  const at = nextItem(run);
  if (!at || outcome.kind === "empty") return run;
  if (outcome.kind === "unread") {
    return { ...run, pending: { u: run.pending.u + 1, ...(outcome.reason ? { r: outcome.reason } : {}) } };
  }
  const item: DiagRunItem = { ...at.item, k: outcome.kind };
  if (outcome.kind === "form") item.r = outcome.reason;
  if (run.pending.u > 0) item.u = run.pending.u;
  if (outcome.kind !== "skip" && Number.isFinite(secs) && secs >= 0) item.secs = secs;
  const blocks = run.blocks.map((b, i) => i !== at.block ? b : { ...b, items: b.items.map((x, j) => j === at.index ? item : x) });
  return { ...run, blocks, pending: { u: 0 } };
}

/** The finished take. Only what was asked is kept, and of each answer only its generator,
    seed, section and kind: never the typed text, the `form` reason, the `unread` count or a
    timing. `parOf` (a generator's par) lets the seconds be read for rushing: RUSH_COUNT
    answers faster than max(RUSH_FLOOR_S, RUSH_FRACTION of par) make the take rushed, and a
    rushed take seeds nothing. Throws if the run is not finished: a take is written once. */
export function finish(run: DiagRun, day: string, grader: number, parOf?: (g: string) => number): DiagTake {
  if (!finished(run)) throw new Error("the check is not finished");
  const status = statusOf(run.blocks);
  const { band, all } = placeOf(status, run.from);
  let fast = 0;
  const blocks: DiagBlock[] = run.blocks.map((b) => {
    const asked = b.items.filter((i): i is DiagRunItem & { k: DiagKind } => i.k !== undefined);
    asked.forEach((i) => {
      if (i.k !== "skip" && i.secs !== undefined && parOf && i.secs < Math.max(RUSH_FLOOR_S, RUSH_FRACTION * parOf(i.g))) fast++;
    });
    return {
      course: b.course,
      pass: scoreBlock(b.course, asked.map((i) => i.k)).state === "clear",
      items: asked.map((i) => ({ g: i.g, s: i.s, sec: i.sec, k: i.k }))
    };
  });
  const rushed = fast >= RUSH_COUNT;
  const close = closeOf(blocks, band);
  return {
    v: 1, day, from: run.from, start: run.start, band, ...(all ? { all } : {}), ...(close ? { close } : {}),
    blueprint: run.blueprint, grader, seed: run.seed, blocks, seeded: !rushed, ...(rushed ? { rushed: true as const } : {})
  };
}

/* ------------------------------------------------------- the run's shell, storage -- */

const KINDS: readonly string[] = ["right", "form", "wrong", "skip"];
const MAX_TEXT = 200;
/* a take id (takeId) or anything like it; never "__proto__", which mergeDiag's keysOf drops */
const ID = /^[0-9a-z]{1,64}$/;
const SEED_MAX = 2147483646; // drawBlock's item seed is 1 + hash % 2147483646 (design 3.5)

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const own = (o: Record<string, unknown>, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined);
const whole = (x: unknown, min: number, max = Number.MAX_SAFE_INTEGER): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;
/** Sets an own property without ever touching the prototype, even for the key "__proto__". */
function put(o: Record<string, unknown>, k: string, v: unknown): void {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
}
function copyOwn(o: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (isObj(o)) for (const k of Object.keys(o)) put(out, k, o[k]);
  return out;
}

function readItem(x: unknown, known: (g: string) => boolean): DiagRunItem | null {
  if (!isObj(x)) return null;
  const g = own(x, "g"), s = own(x, "s"), sec = own(x, "sec"), k = own(x, "k");
  if (typeof g !== "string" || g.length > MAX_TEXT || !known(g)) return null;
  if (!whole(s, 1, SEED_MAX)) return null;
  if (typeof sec !== "string" || sec.length > MAX_TEXT) return null;
  if (k !== undefined && !(typeof k === "string" && KINDS.includes(k))) return null;
  const item: DiagRunItem = { g, s, sec: sec as SectionRef };
  if (k !== undefined) item.k = k as DiagKind;
  const r = own(x, "r"), u = own(x, "u"), secs = own(x, "secs");
  if (typeof r === "string" && r.length <= MAX_TEXT) item.r = r;
  if (whole(u, 1)) item.u = u;
  if (typeof secs === "number" && Number.isFinite(secs) && secs >= 0) item.secs = secs;
  return item;
}

/** Whether a block's items ask exactly its form: the same (generator, section) pairs, as a
    multiset, in any order (drawBlock shuffles them). */
function isForm(course: Placeable, items: readonly DiagRunItem[]): boolean {
  const pairs = (list: readonly { g: string; sec: string }[]) => list.map((x) => JSON.stringify([x.g, x.sec])).sort();
  const want = pairs(FORMS[course]), got = pairs(items);
  return want.length === got.length && want.every((p, i) => p === got[i]);
}

/** A stored `bm.run.v1.diag` as a run, or null when any part of it is not one (threat model
    B1). `known` says whether a generator id exists (the page passes the registry's test).
    The result is built fresh from validated fields only; the input is never returned and no
    prototype key is read. Never throws on JSON-parsed input, and reading its own output
    gives it back unchanged.

    Beyond the fields, the blocks must be ones the walk could have dealt: each block is the
    course nextBlock gives after the blocks before it (so the first is `start`), holds its
    whole form (drawBlock deals all of it), answers its items in order with no gap, and every
    block but the last is settled. So a run it accepts is never stuck: it always has a
    nextItem, or deal adds a block, or it is finished. */
export function readRun(x: unknown, known: (g: string) => boolean): DiagRun | null {
  try {
    if (!isObj(x)) return null;
    const id = own(x, "id"), seed = own(x, "seed"), from = own(x, "from"), start = own(x, "start");
    const began = own(x, "began"), blocks = own(x, "blocks"), pending = own(x, "pending");
    if (typeof id !== "string" || !ID.test(id)) return null;
    if (!whole(seed, 0, 4294967295)) return null;
    if (typeof from !== "string" || !Object.hasOwn(START_OF, from)) return null;
    if (!isPlaceable(start) || start !== START_OF[from as DiagFrom]) return null;
    if (own(x, "blueprint") !== BLUEPRINT) return null;
    if (typeof began !== "string" || addDays(began, 0) !== began) return null;
    if (!Array.isArray(blocks) || blocks.length > L.length) return null;
    const out: DiagRun["blocks"] = [];
    for (const b of blocks) {
      if (!isObj(b)) return null;
      const course = own(b, "course"), items = own(b, "items");
      const last = out[out.length - 1];
      if (last && scoreBlock(last.course, last.items.map((i) => i.k)).state === "open") return null;
      if (!isPlaceable(course) || nextBlock(statusOf(out), start) !== course) return null;
      if (!Array.isArray(items) || items.length !== FORMS[course].length) return null;
      const list: DiagRunItem[] = [];
      for (const it of items) {
        const item = readItem(it, known);
        if (!item) return null;
        if (item.k !== undefined && list.some((i) => i.k === undefined)) return null;
        list.push(item);
      }
      if (!isForm(course, list)) return null;
      out.push({ course, items: list });
    }
    const pend: DiagRun["pending"] = { u: 0 };
    if (isObj(pending) && whole(own(pending, "u"), 0)) {
      pend.u = own(pending, "u") as number;
      const r = own(pending, "r");
      if (typeof r === "string" && r.length <= MAX_TEXT) pend.r = r;
    }
    return { id, seed, from: from as DiagFrom, start, blueprint: BLUEPRINT, began, blocks: out, pending: pend };
  } catch {
    return null;
  }
}

/** A run as it starts: nothing dealt, nothing pending. The page supplies the seed, id and
    day (the id from takeId), since the core has no clock or randomness. */
export function newRun(from: DiagFrom, seed: number, id: string, day: string): DiagRun {
  return { id, seed, from, start: START_OF[from], blueprint: BLUEPRINT, began: day, blocks: [], pending: { u: 0 } };
}

/** The run with its next block dealt, when none is open and the walk is not over; otherwise
    the same run. The block is drawn from (run.seed, course) alone, which is design 3.5's
    per-block rule: the same block on any device after any reload. Throws when `make` returns
    null for a form's generator (drawBlock does), so the page guards the call (B2). */
export function deal(run: DiagRun, make: Make, hash: Hash, rng: MakeRng): DiagRun {
  if (nextItem(run) || finished(run)) return run;
  const course = nextBlock(statusOf(run.blocks), run.start);
  if (!course) return run;
  return { ...run, blocks: [...run.blocks, { course, items: drawBlock(course, run.seed, make, hash, rng) }] };
}

/** `bm.diag.v1` with a take added under `id`, or null when it already holds a take (an object)
    under that id: a take is written once (threat model A1). A damaged entry under the id
    (null, a number, a list) is not a take (takesOf and isFirst count only objects), so the
    take replaces it. Unknown top-level fields are kept (A4), and so is every other entry of
    `takes`, damaged or not, as mergeDiag drops nothing; only a stored "__proto__" entry is
    left out, as mergeDiag's keysOf leaves it out. A `store` or `takes` that is not an object
    counts as empty. An id of "__proto__" becomes an own key, never a prototype. */
export function withTake(store: unknown, take: DiagTake, id: string): DiagStore | null {
  const old = isObj(store) ? own(store, "takes") : undefined;
  if (isObj(old) && isObj(own(old, id))) return null;
  const takes: Record<string, unknown> = {};
  if (isObj(old)) for (const k of Object.keys(old)) if (k !== "__proto__") put(takes, k, old[k]);
  put(takes, id, take);
  const out = copyOwn(store);
  put(out, "takes", takes);
  return out as DiagStore;
}

/** A take id from random words (the page passes crypto.getRandomValues(new Uint32Array(4))):
    10 characters of [0-9a-z]. Throws a RangeError for fewer than 4 words, which would repeat
    one word's bits through the id (A5). */
export function takeId(rand: Uint32Array): string {
  if (rand.length < 4) throw new RangeError("takeId needs at least 4 random words");
  const n = rand.length;
  let id = "";
  for (let i = 0; i < 10; i++) id += ((rand[i % n] >>> (5 * Math.floor(i / n))) % 36).toString(36);
  return id;
}

/** The `bm.run.v1` value to write (B4): the other own keys of `stored` kept, `diag` set to
    `run` or removed when `run` is undefined. A string, array or null `stored` starts from {}. */
export function runOf(stored: unknown, run: DiagRun | undefined): Record<string, unknown> {
  const out = copyOwn(stored);
  delete out.diag;
  if (run !== undefined) put(out, "diag", run);
  return out;
}
