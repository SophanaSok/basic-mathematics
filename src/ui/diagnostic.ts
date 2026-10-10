/* The placement check, taken in the browser (diagnostic.html): the intro, the questions, a
   run in progress, and the finish. The pure rules are src/learn/diagnostic.ts (the walk, the
   run's shell, the take) and src/learn/diag-seed.ts (what the take seeds); this file is the
   page: it reads and writes storage, makes the questions with the Arena's generators
   (window.BMGen), grades with the page's grader (window.BMCore.judge) and draws the screens.
   The result and the return view are drawn by src/ui/diag-result.ts; the gate that decides
   which screen opens first (reading takes, the signed-in wait, ?again) is gate().

   What this file holds to (the D-9 threat model, ~/.claude/plans/d9-threat-model.md):
   - Nothing is written to the page as HTML: createElement and textContent only, and only the
     question node goes to renderMath (C1, C2).
   - The stored run is read only through readRun, and every deal and make is guarded (B1, B2).
   - A typed answer and the grader's reading of it live in this module's memory only, never
     in storage and never logged, and no `attempt` event is emitted (F1).
   - The take is written once by id, and the review boxes are seeded and the run cleared only
     after that write returned true (A1 to A3). */

import { GRADER } from "../core/answer/check.ts";
import { DIAG_Q4, DIAG_SYNC_WAIT_MS, DIAG_UNREAD_HINT } from "../learn/constants.ts";
import {
  deal, finish, finished, formatOf, newRun, nextItem, outcomeOf, readRun, runOf, step, stripDegrees, takeId, withTake,
  START_OF, type DiagFrom, type DiagRun, type DiagTake, type Make
} from "../learn/diagnostic.ts";
import { isFirst, seedPatch, takesOf } from "../learn/diag-seed.ts";
import { renderResult, renderReturn, type LiveAnswer } from "./diag-result.ts";
import { SKILLS, skillOf } from "../data/skills.ts";
import type { UnreadReason } from "../core/answer/types.ts";
import type { SectionRef } from "../types/state.ts";

type Screen = "intro" | "resume" | "question" | "done" | "return" | "gone";

const EMPTY_LINE = "Type an answer, then press Submit. If you haven't learned this yet, press I haven't learned this yet.";
const RETRY = " Try again, or press I haven't learned this yet.";
const STUCK = " If you're stuck, press I haven't learned this yet.";
const SAVED = "Your place is saved. You can stop any time.";
const UNSAVED = "This browser isn't saving right now, so finish in one sitting.";
const SAVED_TAKE = "Saved in this browser.";
const SAVED_TAKE_ACCOUNT = "Saved in this browser and in your account.";
const TAKE_UNSAVED = "This browser isn't saving right now, so this result may not be kept.";
const MOVED = "This check continued in another tab.";
const CHANGED_TAB = "The saved check changed in another tab.";
const CHANGED = "The saved check changed.";
const NO_GEN = "The problem generators did not load, so the check cannot start. Reload the page to try again.";
const CHECKING = "Checking your saved results…";
const NO_ACCOUNT = "We couldn't reach your account just now, so this uses what this browser has saved.";
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
/* the gate has not answered yet: the Start form stays hidden (§2.6) */
let pending = false;
/* the canonical form of the stored run as this page last wrote or read it: a sync, a reset
   or a clear() that leaves it as it was changes nothing here (E1, §5.1) */
let seen = "null";
/* bumped on every change to the unread line, so a line set a frame late never lands on a
   newer one (see unreadLine) */
let unreadSeq = 0;
/* the par of each generator the page has made, for the take's rush count (G1) */
const pars = new Map<string, number>();
/* the page was opened with ?again (presence only: its value is never read, shown or kept, C2) */
let again = false;
/* the id of the take the result screen shows, when its write returned true: a sign-out or a
   sync that drops it from bm.diag.v1 takes the result off the page (F1) */
let shownTake: string | null = null;
/* the canonical form of bm.diag.v1 the return view was last drawn from: a sync that leaves it
   as it was does not redraw it (and so does not drop the keyboard focus) */
let drawn: string | null = null;

/* ------------------------------------------------------------------- page -- */

const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;
const text = (id: string, value: string): void => { const el = $(id); if (el) el.textContent = value; };

const SECTION_OF: Readonly<Record<Screen, string>> = {
  intro: "diag-intro", resume: "diag-resume", question: "diag-question", done: "diag-done", return: "diag-return", gone: "diag-gone"
};
function show(next: Screen): void {
  /* leaving the result: what was typed goes with it, from memory and from the page (F1) */
  if (screen === "done" && next !== "done") {
    kept = [];
    shownTake = null;
    $("diag-result")?.replaceChildren();
  }
  /* leaving the return view: a hidden section never holds a band a sign-out has taken away */
  if (screen === "return" && next !== "return") {
    drawn = null;
    $("diag-return-view")?.replaceChildren();
  }
  screen = next;
  (Object.keys(SECTION_OF) as Screen[]).forEach((name) => {
    const el = $(SECTION_OF[name]);
    if (el) el.hidden = SECTION_OF[name] !== SECTION_OF[next];
  });
}
function notice(line: string): void { text("diag-notice", line); }
function focusOn(id: string): void { const el = $(id); if (el) el.focus(); }
function focusFirstChoice(): void {
  const first = document.querySelector<HTMLInputElement>('#diag-from input[name="from"]');
  if (first) first.focus();
}

/** The line under the answer box. It is a live region: it is emptied now and filled on the
    next frame, so the same line said twice is announced twice. */
function unreadLine(line: string): void {
  const el = $("diag-unread");
  const seq = ++unreadSeq;
  if (!el) return;
  el.textContent = "";
  if (!line) return;
  const put = (): void => { if (seq === unreadSeq) el.textContent = line; };
  if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(put);
  else put();
}

/* a page that has not the globals it needs (B2): a note, never a blank page */
function gone(line: string): void {
  run = null;
  kept = [];
  text("diag-gone-line", line);
  show("gone");
}

/* ----------------------------------------------------------------- storage -- */

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function haveGlobals(): boolean {
  const w = window;
  return !!(w.BMStore && w.BMSite && w.BMCore && w.BMGen && typeof w.BMGen.make === "function" && typeof w.BMGen.get === "function");
}

/** bm.run.v1's `diag` as stored, unchecked: for comparing only, never for use. */
function rawDiag(): unknown {
  const all = window.BMStore.read(window.BMStore.keys.run, {});
  return isObj(all) && Object.hasOwn(all, "diag") ? all.diag : undefined;
}

/** The stored run, or null: read only through readRun (B1), with the generator registry as
    the test of a known generator. `damaged` says a value was there that was not a run. */
function storedRun(): { run: DiagRun | null; damaged: boolean } {
  const raw = rawDiag();
  seen = window.BMMerge.canon(raw ?? null);
  if (raw === undefined || raw === null) return { run: null, damaged: false };
  const r = readRun(raw, (g) => !!window.BMGen?.get(g));
  return { run: r, damaged: r === null };
}

/** Writes the run (undefined clears it) over a fresh read of bm.run.v1, so the Arena's and
    the game's fields stay (B4, E2). A failed write is remembered for the run's rest. */
function persist(next: DiagRun | undefined): boolean {
  const S = window.BMStore;
  const ok = !!S.write(S.keys.run, runOf(S.read(S.keys.run, {}), next), true);
  if (ok) seen = window.BMMerge.canon(next ?? null);
  else if (next !== undefined) unsaved = true;
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
  unreadLine("");
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
  if (!skip && given.trim() === "") { unreadLine(EMPTY_LINE); return; }
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
    /* a box the grader read as empty (all of it stripped, a lone °) is the empty box: the
       same line, and nothing counted or written */
    if (outcome.kind === "unread" && (!outcome.reason || outcome.reason === "empty")) { unreadLine(EMPTY_LINE); return; }
  }

  const secs = (performance.now() - shownAt) / 1000;
  const before = run;
  const after = step(before, outcome, skip ? NaN : secs);
  if (after === before) return;
  persist(after);
  run = after;

  if (outcome.kind === "unread") {
    /* decided from the typed text alone: nothing is used up, and the box keeps its text */
    const base = window.BMCore.messages.unreadMessage(outcome.reason as UnreadReason, DIAG_Q4);
    unreadLine(base + RETRY + (after.pending.u >= DIAG_UNREAD_HINT ? STUCK : ""));
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
    keeps the run, so the next load finishes it again, and offers Start over so that is not a
    dead end. `keepNotice` is for a finish another tab caused: its notice stays. */
function finishRun(r: DiagRun, keepNotice = false): void {
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
  /* the answers are drawn from the run's own items, with what was typed and how it was read
     from memory; both go when the learner leaves the result (F1) */
  const live: LiveAnswer[] = [];
  r.blocks.forEach((b) => b.items.forEach((i) => {
    if (i.k === undefined) return;
    const m = kept.find((x) => x.g === i.g && x.s === i.s);
    live.push({ g: i.g, s: i.s, k: i.k, ...(i.r !== undefined ? { r: i.r } : {}), ...(i.u !== undefined ? { u: i.u } : {}),
      ...(m ? { typed: m.text, read: m.read } : {}) });
  }));
  run = saved ? null : r;
  const box = $("diag-result");
  if (box) renderResult(box, take, live, { headId: "diag-done-head" });
  text("diag-done-line", saved ? (signedIn() ? SAVED_TAKE_ACCOUNT : SAVED_TAKE) : TAKE_UNSAVED);
  const over = $("diag-done-over");
  if (over) over.hidden = saved;
  show("done");
  shownTake = saved ? r.id : null;
  if (!keepNotice) notice("");
  focusOn("diag-done-head");
}

/* ------------------------------------------------------------- the screens -- */

/** Whether the take can be said to be in the account too, for the line under the result:
    someone is signed in and the account is not off or failing. */
function signedIn(): boolean {
  try {
    const A = window.BMAccount;
    if (!A?.user?.()) return false;
    const state: unknown = A.status?.()?.state;
    return typeof state === "string" && state !== "error" && state !== "off";
  } catch {
    return false;
  }
}

/** Waits, for at most DIAG_SYNC_WAIT_MS, until the account has pulled its takes into this
    browser. True when it did (or there is nothing to wait for), false on a timeout, an error
    or a rejection (D2). It resolves at once when the status already says it is settled. */
function accountSettled(A: any): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let over = false;
    let ready = false;
    const end = (ok: boolean): void => { if (over) return; over = true; clearTimeout(timer); resolve(ok); };
    const timer = setTimeout(() => end(false), DIAG_SYNC_WAIT_MS);
    const look = (): void => {
      if (over || !ready) return;
      try {
        const state = A.status().state;
        /* "off" is the state before a signed-in page has started its first pull, so it
           settles only when there is no one signed in */
        if (state === "error") end(false);
        else if (state === "synced" || state === "reload") end(true);
        /* no one signed in: nothing to wait for, unless a session is kept whose token could not
           be renewed (offline), when the account's takes cannot be had */
        else if (state === "off" && !A.user()) end(!A.hasSession());
      } catch {
        end(false);
      }
    };
    try {
      A.onChange(look);
      window.BMStore.on((c: unknown) => { if (isObj(c) && c.type === "sync") look(); });
      Promise.resolve(A.ready()).then(() => { ready = true; look(); }, () => end(false));
    } catch {
      end(false);
    }
  });
}

/** Which screen a visit with no run in progress opens on (§7.2): the return view when a take
    exists and the page was not opened with ?again, else the intro. Signed out, the takes are
    this browser's, read at once. With a stored session the account's takes are waited for,
    never longer than DIAG_SYNC_WAIT_MS, and a wait that fails reads this browser's with the
    §2.6 notice. Takes are counted only through isFirst. */
async function gate(): Promise<"intro" | "return"> {
  let line = "";
  try {
    const A = window.BMAccount;
    /* ?again goes to the intro whatever the takes are, so there is nothing to wait for */
    if (!again && A && A.configured && A.hasSession()) {
      notice(CHECKING);
      if (!(await accountSettled(A))) line = NO_ACCOUNT;
    }
  } catch {
    line = NO_ACCOUNT;
  }
  notice(line);
  if (again) return "intro";
  const S = window.BMStore;
  return isFirst(S.read(S.keys.diag, {})) ? "intro" : "return";
}

/** The return view: the latest take, the earlier ones and "Take it again". With no take to
    show it is the intro, and a take that cannot be read as a result still gets the link. */
function showReturn(): void {
  run = null;
  kept = [];
  const S = window.BMStore;
  const diag = S.read(S.keys.diag, {});
  if (isFirst(diag)) { showIntro(); return; }
  const box = $("diag-return-view");
  if (box) renderReturn(box, diag, { headId: "diag-return-head" });
  show("return");
  drawn = window.BMMerge.canon(diag);
}

/** The return screen after another tab or a sync changed the takes (a sign-out clears them):
    the gate's answer again, from this browser's copy, which is what the account's takes were
    merged into. Takes as they were drawn are not drawn again. */
function regate(): void {
  if (again) return;
  const S = window.BMStore;
  if (window.BMMerge.canon(S.read(S.keys.diag, {})) === drawn) return;
  showReturn();
}

/** The result screen after another tab or a sync changed the takes: when the take it shows was
    saved and is no longer stored (a sign-out, or a sync that dropped it), the result and what
    was typed leave the page for the return view, or the intro when no take is left. Nothing is
    written (A6). */
function takeCheck(): void {
  if (shownTake === null) return;
  const S = window.BMStore;
  if (takesOf(S.read(S.keys.diag, {})).includes(shownTake)) return;
  showReturn();
}

/** Takes the query off the address once a run is on screen (§7.3): the path and the hash
    stay, so a reload resumes the run and does not open another intro. */
function stripAgain(): void {
  if (!again) return;
  again = false;
  try {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.hash);
  } catch { /* the address keeps its query; nothing else depends on it */ }
}

function showIntro(): void {
  run = null;
  text("diag-intro-status", "");
  const form = $("diag-start");
  if (form) form.hidden = pending;
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
    focusFirstChoice();
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
  stripAgain();
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
  focusFirstChoice();
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

/** The stored run changed under this page: adopted through readRun, never the memory copy,
    or, when it is gone, the intro with `goneLine`. */
function elsewhere(goneLine: string): void {
  const { run: stored, damaged } = storedRun();
  if (stored) {
    if (!run || run.id !== stored.id) kept = [];
    notice(MOVED);
    if (finished(stored)) { finishRun(stored, true); return; }
    if (screen === "question") proceed(stored, false);
    else showResume(stored);
    return;
  }
  if (damaged) persist(undefined);
  const had = run !== null;
  const goneId = run ? run.id : null;
  kept = [];
  /* the run is gone because another tab finished it: its take is here now, under its id. A
     run gone any other way (another tab's Start over, a reset) is the intro, whatever takes
     there are */
  const S = window.BMStore;
  if (!again && goneId !== null && takesOf(S.read(S.keys.diag, {})).includes(goneId)) { notice(""); showReturn(); return; }
  showIntro();
  notice(had ? goneLine : "");
}

/** Whether `diag` as stored now is what this page last wrote or read, or what it holds. */
function unchanged(): boolean {
  const canon = window.BMMerge.canon;
  const now = canon(rawDiag() ?? null);
  return now === seen || now === canon(run ?? null);
}

/** A `storage` event: only a change to bm.run.v1 in localStorage (or a clear) that changes
    `diag` matters; the Arena's and the game's writes to the same key do not. Events on
    bm.diag.v1 are ignored mid-run (D3); on the result, the return view and the intro with no
    run they re-read the takes. A take that goes missing is not rewritten (A6). */
function onStorage(e: StorageEvent): void {
  const S = window.BMStore;
  if (e.storageArea !== window.localStorage) return;
  const takesMoved = e.key === null || e.key === S.keys.diag;
  if (screen === "return" && takesMoved) { regate(); return; }
  if (screen === "done" && takesMoved) { takeCheck(); return; }
  /* another tab brought a take (it finished a check, or pulled the account's): the return view */
  if (takesMoved && screen === "intro" && run === null && !pending && !again && !isFirst(S.read(S.keys.diag, {}))) {
    notice("");
    showReturn();
    return;
  }
  if (e.key !== null && e.key !== S.keys.run) return;
  if (screen === "done" || screen === "return" || screen === "gone") return;
  if (e.key === null) {
    if (unchanged()) return;
  } else {
    const canon = window.BMMerge.canon;
    if (canon(parse(e.oldValue).diag ?? null) === canon(parse(e.newValue).diag ?? null)) return;
  }
  elsewhere(CHANGED_TAB);
}

/** A sync or a reset in this tab (§5.1): account.js's writeLocal can empty bm.run.v1 with no
    storage event, and the next write must not put the dropped run back. */
function onChange(c: unknown): void {
  if (!isObj(c) || (c.type !== "sync" && c.type !== "reset")) return;
  if (screen === "return") { regate(); return; }
  if (screen === "done") { takeCheck(); return; }
  if (screen === "gone") return;
  if (!unchanged()) { elsewhere(CHANGED); return; }
  /* a pull that came after the wait gave up: the takes it brought are read, and the notice
     that the account could not be reached goes with it */
  if (c.type === "sync" && screen === "intro" && run === null && !pending && !again) {
    const S = window.BMStore;
    if (!isFirst(S.read(S.keys.diag, {}))) { notice(""); showReturn(); }
    else if ($("diag-notice")?.textContent === NO_ACCOUNT) notice("");
  }
}

/* -------------------------------------------------------------------- boot -- */

function load(): void {
  if (!haveGlobals()) { gone(NO_GEN); return; }
  try { again = new URLSearchParams(window.location.search).has("again"); } catch { again = false; }
  const { run: stored, damaged } = storedRun();
  if (damaged) persist(undefined);
  if (stored) {
    /* a run in progress is resumed always, ?again or not (D1) */
    stripAgain();
    /* a stored run that is already finished is finished again; a take under its id absorbs it */
    if (finished(stored)) { finishRun(stored); return; }
    showResume(stored);
    return;
  }
  /* the Start form stays hidden until the gate has answered */
  pending = true;
  show("intro");
  void gate().then((next) => {
    pending = false;
    /* another tab moved the page while the gate waited: that screen stands */
    if (run !== null || screen !== "intro") return;
    if (next === "return") showReturn();
    else showIntro();
  }).catch(() => {
    pending = false;
    if (run === null && screen === "intro") showIntro();
  });
}

function bind(): void {
  $("diag-start")?.addEventListener("submit", (e) => { e.preventDefault(); start(); });
  $("diag-answer")?.addEventListener("submit", (e) => { e.preventDefault(); answer(false); });
  $("diag-skip")?.addEventListener("click", () => answer(true));
  $("diag-keep")?.addEventListener("click", () => { if (run) { notice(""); proceed(run, true); } });
  $("diag-over")?.addEventListener("click", startOver);
  $("diag-done-over")?.addEventListener("click", startOver);
  window.addEventListener("storage", onStorage);
  if (window.BMStore && typeof window.BMStore.on === "function") window.BMStore.on(onChange);
}

export const api = { gate, screen: (): Screen => screen };

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.BMDiag = api;
  if ($("diag-intro")) {
    bind();
    load();
  }
}
