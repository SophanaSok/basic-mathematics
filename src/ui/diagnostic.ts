/* The placement check, taken in the browser (diagnostic.html): the intro, the questions, a
   run in progress, and the finish. The pure rules are src/learn/diagnostic.ts (the walk, the
   run's shell, the take) and src/learn/diag-seed.ts (what the take seeds); this file is the
   page: it reads and writes storage, makes the questions with the Arena's generators
   (window.BMGen), grades with the page's grader (window.BMCore.judge) and draws the screens.
   The result screen and the return view are D-10; the gate that decides which screen opens
   first (reading takes, the signed-in wait, ?again) is D-9c and fills gate() below.

   What this file holds to (the D-9 threat model, ~/.claude/plans/d9-threat-model.md):
   - Nothing is written to the page as HTML: createElement and textContent only, and only the
     question node goes to renderMath (C1, C2).
   - The stored run is read only through readRun, and every deal and make is guarded (B1, B2).
   - A typed answer and the grader's reading of it live in this module's memory only, never
     in storage and never logged, and no `attempt` event is emitted (F1).
   - The take is written once by id, and the review boxes are seeded and the run cleared only
     after that write returned true (A1 to A3). */

import { GRADER } from "../core/answer/check.ts";
import { DIAG_Q4, DIAG_UNREAD_HINT } from "../learn/constants.ts";
import {
  deal, finish, finished, formatOf, newRun, nextItem, outcomeOf, readRun, runOf, step, stripDegrees, takeId, withTake,
  START_OF, type DiagFrom, type DiagRun, type DiagTake, type Make
} from "../learn/diagnostic.ts";
import { seedPatch } from "../learn/diag-seed.ts";
import { SKILLS, skillOf } from "../data/skills.ts";
import type { UnreadReason } from "../core/answer/types.ts";
import type { SectionRef } from "../types/state.ts";

type Screen = "intro" | "resume" | "question" | "done" | "gone";

const EMPTY_LINE = "Type an answer, then press Submit. If you haven't learned this yet, press I haven't learned this yet.";
const RETRY = " Try again, or press I haven't learned this yet.";
const STUCK = " If you're stuck, press I haven't learned this yet.";
const SAVED = "Your place is saved. You can stop any time.";
const UNSAVED = "This browser isn't saving right now, so finish in one sitting.";
const TAKE_UNSAVED = "This browser isn't saving right now, so this result won't be here next time. You may want to write down your starting point.";
const NO_GEN = "The problem generators did not load, so the check cannot start. Reload the page to try again.";
const NO_MAKE = "The check could not make a question. Reload the page to try again.";

/* ------------------------------------------------------------------ memory -- */

let run: DiagRun | null = null;
let screen: Screen = "intro";
/* a run write failed: the saved line says so for the rest of the run (E2) */
let unsaved = false;
/* when the open question was drawn, in performance.now() time (G1); memory only */
let shownAt = 0;
/* what was typed on each answered question and how the grader read it (F1): memory only,
   never stored or logged, emptied on start over and whenever a run ends */
let kept: { g: string; s: number; text: string; read: unknown }[] = [];
/* the par of each generator the page has made, for the take's rush count (G1) */
const pars = new Map<string, number>();

/* ------------------------------------------------------------------- page -- */

const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;
const text = (id: string, value: string): void => { const el = $(id); if (el) el.textContent = value; };

const SECTIONS: readonly Screen[] = ["intro", "resume", "question", "done", "gone"];
function show(next: Screen): void {
  screen = next;
  SECTIONS.forEach((name) => { const el = $("diag-" + (name === "gone" ? "gone" : name)); if (el) el.hidden = name !== next; });
}
function notice(line: string): void { text("diag-notice", line); }
function focusOn(id: string): void { const el = $(id); if (el) el.focus(); }

/* a page that has not the globals it needs (B2): a note, never a blank page */
function gone(line: string): void {
  run = null;
  text("diag-gone-line", line);
  show("gone");
}

/* ----------------------------------------------------------------- storage -- */

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function haveGlobals(): boolean {
  const w = window;
  return !!(w.BMStore && w.BMSite && w.BMCore && w.BMGen && typeof w.BMGen.make === "function" && typeof w.BMGen.get === "function");
}

/** The stored run, or null: read only through readRun (B1), with the generator registry as
    the test of a known generator. `damaged` says a value was there that was not a run. */
function storedRun(): { run: DiagRun | null; damaged: boolean } {
  const all = window.BMStore.read(window.BMStore.keys.run, {});
  const raw = isObj(all) && Object.hasOwn(all, "diag") ? all.diag : undefined;
  if (raw === undefined || raw === null) return { run: null, damaged: false };
  const r = readRun(raw, (g) => !!window.BMGen?.get(g));
  return { run: r, damaged: r === null };
}

/** Writes the run (undefined clears it) over a fresh read of bm.run.v1, so the Arena's and
    the game's fields stay (B4, E2). A failed write is remembered for the run's rest. */
function persist(next: DiagRun | undefined): boolean {
  const S = window.BMStore;
  const ok = !!S.write(S.keys.run, runOf(S.read(S.keys.run, {}), next), true);
  if (!ok && next !== undefined) unsaved = true;
  return ok;
}

/* --------------------------------------------------------------- questions -- */

interface Prob { q: string; par: number; type?: string; answer?: unknown; tol?: unknown; placeholder?: string }

/** A made problem, or null when the generator is missing or fails (B2). */
function made(g: string, s: number): Prob | null {
  try {
    const p = window.BMGen?.make(g, s);
    if (!p || typeof p.q !== "string" || typeof p.par !== "number") return null;
    pars.set(g, p.par);
    return p as Prob;
  } catch {
    return null;
  }
}
const make: Make = (g, s) => { const p = made(g, s); return p ? { q: p.q, par: p.par } : null; };

/** The run with its next block dealt, or null when the generators cannot make it (B2): deal
    throws on a form's generator that makes nothing, and that is caught here. */
function dealt(r: DiagRun): DiagRun | null {
  try {
    return deal(r, make, window.BMGen.hash, window.BMGen.rng);
  } catch {
    return null;
  }
}

const answered = (r: DiagRun): number => r.blocks.reduce((n, b) => n + b.items.filter((i) => i.k !== undefined).length, 0);

function paintSaved(): void { text("diag-saved", unsaved ? UNSAVED : SAVED); }

/** Draws the open question of `r`. `moveFocus` is for a change the learner made, not for a
    page that has just loaded or a run another tab moved. */
function showQuestion(r: DiagRun, moveFocus: boolean): void {
  const at = nextItem(r);
  const prob = at ? made(at.item.g, at.item.s) : null;
  if (!at || !prob) { gone(NO_MAKE); return; }
  run = r;
  text("diag-q-head", "Question " + String(answered(r) + 1));
  const prompt = $("diag-prompt");
  if (prompt) {
    prompt.textContent = prob.q;
    window.BMSite.renderMath(prompt);
  }
  const input = $<HTMLInputElement>("diag-input");
  if (input) {
    input.value = "";
    input.placeholder = typeof prob.placeholder === "string" ? prob.placeholder : "your answer";
  }
  text("diag-format", formatOf(at.item.g, prob.type) || "");
  text("diag-unread", "");
  paintSaved();
  show("question");
  shownAt = performance.now();
  if (moveFocus) focusOn("diag-q-head");
}

/** Moves a run on to its question, dealing the next block when none is open, or finishes it
    when the walk is over. */
function proceed(r: DiagRun, moveFocus: boolean): void {
  if (finished(r)) { finishRun(r); return; }
  const next = dealt(r);
  if (!next) { gone(NO_MAKE); return; }
  if (next !== r && !persist(next)) paintSaved();
  if (finished(next) || !nextItem(next)) { gone(NO_MAKE); return; }
  showQuestion(next, moveFocus);
}

/** What the learner did with the open question: Submit (`skip` false) or the skip button. */
function answer(skip: boolean): void {
  if (!run || screen !== "question") return;
  const at = nextItem(run);
  if (!at) return;
  const input = $<HTMLInputElement>("diag-input");
  const given = input ? input.value : "";
  if (!skip && given.trim() === "") { text("diag-unread", EMPTY_LINE); return; }
  const prob = made(at.item.g, at.item.s);
  if (!prob) { gone(NO_MAKE); return; }

  let outcome: ReturnType<typeof outcomeOf> = { kind: "skip" };
  let read: unknown = null;
  if (!skip) {
    let v;
    try {
      v = window.BMCore.judge(stripDegrees(given, prob.type), window.BMCore.specOf(prob));
    } catch {
      v = { kind: "wrong" as const, read: null };
    }
    outcome = outcomeOf(v);
    read = (v as { read?: unknown }).read ?? null;
  }

  const secs = (performance.now() - shownAt) / 1000;
  const before = run;
  const after = step(before, outcome, skip ? NaN : secs);
  if (after === before) return;
  persist(after);
  run = after;

  if (outcome.kind === "unread") {
    /* decided from the typed text alone: nothing is used up, and the box keeps its text */
    const reason = outcome.reason;
    const base = reason && reason !== "empty"
      ? window.BMCore.messages.unreadMessage(reason as UnreadReason, DIAG_Q4)
      : EMPTY_LINE;
    text("diag-unread", base + RETRY + (after.pending.u >= DIAG_UNREAD_HINT ? STUCK : ""));
    paintSaved();
    return;
  }

  kept.push({ g: at.item.g, s: at.item.s, text: given, read });
  const before_n = before.blocks.length;
  if (finished(after)) { finishRun(after); return; }
  const next = dealt(after);
  if (!next) { gone(NO_MAKE); return; }
  if (next !== after) persist(next);
  showQuestion(next, true);
  notice(next.blocks.length > before_n ? "New set of questions." : "");
}

/* ------------------------------------------------------------------ finish -- */

/** Lays a finished take's seeds over the review boxes (A3: the caller catches). */
function seed(take: DiagTake): void {
  const Game = window.BMGame;
  if (!Game || typeof Game.seedRecall !== "function") return;
  const worked = new Set<string>();
  try { (window.BMInsights?.sections() || []).forEach((row: { id: string }) => worked.add(row.id)); } catch { /* none worked */ }
  const g = typeof Game.game === "function" ? Game.game() : null;
  const sec = g && isObj(g.sec) ? g.sec : undefined;
  const patch = seedPatch(take, Object.keys(SKILLS) as SectionRef[], sec, (ref) => worked.has(ref), skillOf);
  if (Object.keys(patch).length) Game.seedRecall(patch);
}

/** The finish (A1 to A3): the take is built, added to a fresh read of bm.diag.v1 by run id,
    and only if that write returned true are the boxes seeded and the run cleared. A take
    already under this id is shown and nothing is written or seeded. A failed take write
    keeps the run, so the next load finishes it again. */
function finishRun(r: DiagRun): void {
  const S = window.BMStore;
  let take: DiagTake;
  try {
    r.blocks.forEach((b) => b.items.forEach((i) => { if (i.secs !== undefined) made(i.g, i.s); }));
    take = finish(r, window.BMSite.dayKey(), GRADER, (g) => pars.get(g) ?? 0);
  } catch {
    gone(NO_MAKE);
    return;
  }
  const store = withTake(S.read(S.keys.diag, {}), take, r.id);
  let saved = true;
  if (store === null) {
    persist(undefined);
  } else if (S.write(S.keys.diag, store)) {
    try { seed(take); } catch { /* a seed that fails blocks neither the result nor the clear */ }
    persist(undefined);
  } else {
    saved = false;
  }
  kept = [];
  run = saved ? null : r;
  text("diag-done-line", saved
    ? "You answered all the questions. Your answers are saved in this browser."
    : TAKE_UNSAVED);
  show("done");
  notice("");
  focusOn("diag-done-head");
}

/* ------------------------------------------------------------- the screens -- */

/** Which screen a visit with no run in progress opens on. D-9c fills this: reading the takes
    to show a return view, the signed-in wait, `?again`. */
function gate(): "intro" {
  return "intro";
}

function showIntro(): void {
  run = null;
  text("diag-intro-status", "");
  show("intro");
}

function showResume(r: DiagRun): void {
  run = r;
  const n = answered(r);
  text("diag-resume-line", "You've answered " + String(n) + (n === 1 ? " question." : " questions."));
  show("resume");
}

/** Start: the self-report chosen, a new run dealt and written. */
function start(): void {
  const picked = document.querySelector<HTMLInputElement>('#diag-from input[name="from"]:checked');
  const from = picked ? picked.value : "";
  if (!Object.hasOwn(START_OF, from)) {
    text("diag-intro-status", "Choose one answer to start.");
    const first = document.querySelector<HTMLInputElement>('#diag-from input[name="from"]');
    if (first) first.focus();
    return;
  }
  text("diag-intro-status", "");
  const seedWord = words(1)[0];
  let fresh: DiagRun;
  try {
    fresh = newRun(from as DiagFrom, seedWord, takeId(words(4)), window.BMSite.dayKey());
  } catch {
    gone(NO_MAKE);
    return;
  }
  kept = [];
  unsaved = false;
  notice("");
  const next = dealt(fresh);
  if (!next) { gone(NO_MAKE); return; }
  persist(next);
  showQuestion(next, true);
}

function words(n: number): Uint32Array {
  const out = new Uint32Array(n);
  if (window.crypto && typeof window.crypto.getRandomValues === "function") window.crypto.getRandomValues(out);
  else for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 4294967296);
  return out;
}

/** Start over: the run is dropped, along with the memory of what was typed, and the learner
    picks a self-report again. */
function startOver(): void {
  kept = [];
  unsaved = false;
  persist(undefined);
  notice("");
  showIntro();
  focusOn("diag-from");
}

/* ------------------------------------------------------------ other tabs (E1) -- */

function parse(raw: string | null): Record<string, unknown> {
  if (raw === null) return {};
  try {
    const x: unknown = JSON.parse(raw);
    return isObj(x) ? x : {};
  } catch {
    return {};
  }
}

/** A `storage` event: only a change to bm.run.v1 (or a clear) that changes `diag` matters;
    the Arena's and the game's writes to the same key do not. Then the stored run is adopted
    through readRun, never the memory copy. Events on bm.diag.v1 are ignored (D3), and a
    take that goes missing is not rewritten (A6). */
function onStorage(e: StorageEvent): void {
  const S = window.BMStore;
  if (e.key !== null && e.key !== S.keys.run) return;
  if (screen === "done" || screen === "gone") return;
  const was = e.key === null ? run : parse(e.oldValue).diag;
  const now = e.key === null ? undefined : parse(e.newValue).diag;
  const canon = window.BMMerge.canon;
  if (canon(was ?? null) === canon(now ?? null)) return;
  const { run: stored, damaged } = storedRun();
  if (stored) {
    notice("This check continued in another tab.");
    if (finished(stored)) { finishRun(stored); return; }
    if (screen === "question") proceed(stored, false);
    else showResume(stored);
    return;
  }
  if (damaged) persist(undefined);
  const had = run !== null;
  kept = [];
  showIntro();
  notice(had ? "This check continued in another tab." : "");
}

/* -------------------------------------------------------------------- boot -- */

function load(): void {
  if (!haveGlobals()) { gone(NO_GEN); return; }
  const { run: stored, damaged } = storedRun();
  if (damaged) persist(undefined);
  if (!stored) { gate(); showIntro(); return; }
  /* a stored run that is already finished is finished again; a take under its id absorbs it */
  if (finished(stored)) { finishRun(stored); return; }
  showResume(stored);
}

function bind(): void {
  $("diag-start")?.addEventListener("submit", (e) => { e.preventDefault(); start(); });
  $("diag-answer")?.addEventListener("submit", (e) => { e.preventDefault(); answer(false); });
  $("diag-skip")?.addEventListener("click", () => answer(true));
  $("diag-keep")?.addEventListener("click", () => { if (run) { notice(""); proceed(run, true); } });
  $("diag-over")?.addEventListener("click", startOver);
  window.addEventListener("storage", onStorage);
}

export const api = { gate, screen: (): Screen => screen };

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.BMDiag = api;
  if ($("diag-intro")) {
    bind();
    load();
  }
}
