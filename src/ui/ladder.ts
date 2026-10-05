/* The help ladder on an exercise card: the "Show a clue" button, the clues it opens, and
   the lines a wrong check adds under the verdict (a detector's question, one offer).

   assets/site.js builds the card and grades it, and calls in here at three points: once
   when the card is built (mount), after every wrong check (afterWrong) and after a right
   one (afterRight). The state is src/learn/ladder.ts's, the questions are
   src/learn/detectors.ts's, the stuck signals src/learn/stuck.ts's; this file is the
   markup and the focus. Its styles are assets/ladder.css (existing tokens only).

   The rules it keeps:
     - The button is there from the start, on every card that has a clue: no gate, no
       timer, never disabled. Its words say which clue it opens and how many there are.
     - A clue opens only when the button is pressed. Focus moves to the clue just opened,
       which is how it is announced, once; the clues are not a live region. Opening one
       is never a reason to move anything else.
     - The rungs opened while the exercise was unsolved are saved (opts.persist) and come
       back open on the next visit, without focus.
     - After a wrong check: the verdict at once (site.js), then at most one question and
       at most one offer line, both in the verdict's live region so they are read with it.
       A stuck signal changes the offer's words, never what happens.
   Calm mode changes none of this: the ladder is learning, not game presentation. */

import { CLUE_RUNGS, STUCK_IDLE_MS, STUCK_MISSES_NO_CLUE, STUCK_RAPID_CHECKS, STUCK_RAPID_WINDOW_MS, STUCK_REPEAT_WRONG } from "../learn/constants.ts";
import { canOpen, cluesOf, nextLabel, offerAfterWrong, open, savedRung, start, toSave, type LadderState, type Offer } from "../learn/ladder.ts";
import { candidates, detect, ORDER, QUESTIONS, type Detection, type DetectInput } from "../learn/detectors.ts";
import { answerHash, StuckWatch, type StuckSignal } from "../learn/stuck.ts";

export interface LadderOptions {
  /** the .ex card */
  ex: HTMLElement;
  /** the .ex-form; the button goes into it, before `before` when that is given */
  form: HTMLElement;
  before?: Element | null;
  /** data-hint, data-hint2, data-hint3 as the markup has them (HTML, with $…$ math) */
  hints: ReadonlyArray<string | null>;
  /** the attempt record's `rung`, as saved */
  saved: unknown;
  /** a unique id for the clue list, so the button can name what it controls */
  id: string;
  /** "Exercise 3" or "Your turn": names the clue list for assistive technology */
  name: string;
  /** whether the exercise counts as solved now (the record, or the card) */
  solved: () => boolean;
  /** save `rung` as the highest opened (site.js writes it only while unsolved) */
  persist: (rung: number) => void;
  /** typeset the math in a freshly written element */
  render: (el: HTMLElement) => void;
  /** the card has a worked solution */
  hasSolution: boolean;
  /** milliseconds, for the stuck signals; Date.now by default */
  now?: () => number;
}

export interface LadderController {
  readonly state: LadderState;
  readonly button: HTMLButtonElement | null;
  /** the lines to put under the verdict after a wrong check, as HTML */
  afterWrong(given: string | readonly string[], detection: Detection | null): string;
  /** a right answer: the idle watch stops */
  afterRight(): void;
  /** the learner asked for the next clue (the button's click) */
  openNext(): void;
}

/* -------------------------------------------------------------- words --- */

const OFFERS: Record<Offer, string> = {
  clue: "A clue is there if you want one.",
  solution: "Work it through once more, or open the solution.",
  retry: "Not yet. Work it through once more."
};
/* what a stuck signal says instead, by what comes next; "retry" keeps its own words */
const STUCK_OFFERS: Record<StuckSignal, { clue: string; solution: string }> = {
  rapid: { clue: "No hurry. A clue is there if you want one.", solution: "No hurry. The worked solution is there whenever you want it." },
  repeat: { clue: "That is the answer you gave last time. A clue might show another way in.", solution: "That is the answer you gave last time. The worked solution shows another way in." },
  misses: { clue: "Asking for a clue costs nothing, and it might be the nudge you need.", solution: "The worked solution is there whenever you want it; reading it closely is a good next step." },
  idle: { clue: "Still on this one? A clue is there whenever you want it.", solution: "Still on this one? The worked solution is there whenever you want it." }
};

export function offerText(offer: Offer, signal: StuckSignal | null): string {
  if (signal && offer !== "retry") return STUCK_OFFERS[signal][offer];
  return OFFERS[offer];
}

export function offerHtml(offer: Offer, signal: StuckSignal | null): string {
  return '<p class="ex-next hint ex-offer" data-offer="' + offer + '"' + (signal ? ' data-signal="' + signal + '"' : "") + ">" +
    escapeHtml(offerText(offer, signal)) + "</p>";
}

export function askHtml(d: Detection): string {
  return '<p class="ex-ask" data-detector="' + d.id + '">' + escapeHtml(d.question) + "</p>";
}

export function buttonHtml(s: LadderState): string {
  const n = nextLabel(s);
  if (!n) return "";
  return (s.open ? "Next clue" : "Show a clue") + ' <span class="ex-clue-of">(' + n.rung + " of " + n.of + ")</span>";
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string);
}

/* ------------------------------------------------------------- mount ---- */

export function mount(opts: LadderOptions): LadderController {
  const now = opts.now || (() => Date.now());
  const texts = cluesOf(opts.hints);
  let state = start(texts.length, opts.saved);
  const watch = new StuckWatch();
  if (state.open > 0) watch.clueOpened();

  let list: HTMLElement | null = null;
  let button: HTMLButtonElement | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let awaitingFocus = false;

  if (texts.length) {
    list = document.createElement("div");
    list.className = "ex-ladder";
    list.id = opts.id;
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", "Clues for " + opts.name);
    list.hidden = true;
    /* above the answer box: read the clue, then answer, and Tab goes on to the box */
    opts.ex.insertBefore(list, opts.form);

    button = document.createElement("button");
    button.type = "button";
    button.className = "btn ghost ex-clue-btn";
    button.setAttribute("aria-controls", opts.id);
    opts.form.insertBefore(button, opts.before && opts.before.parentNode === opts.form ? opts.before : null);
    button.addEventListener("click", () => ctl.openNext());

    for (let r = 1; r <= state.open; r++) addClue(r, false);
    paintButton();
  }

  /* the idle signal: one timer at a time, restarted by any input in the card, and gone
     once it has fired or the exercise is solved; never a repeating loop */
  const touch = () => {
    watch.activity(now());
    arm();
  };
  ["input", "keydown", "pointerdown"].forEach((t) => opts.ex.addEventListener(t, touch));

  function arm(): void {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    const wait = watch.idleIn(now());
    if (wait === null) return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      const focusIn = opts.ex.contains(document.activeElement);
      const sig = watch.idle(now(), focusIn);
      if (sig) showIdle(sig);
      else if (!focusIn && watch.idleIn(now()) !== null) {
        /* focus is elsewhere: wait for it to come back rather than polling */
        if (!awaitingFocus) {
          awaitingFocus = true;
          opts.ex.addEventListener("focusin", () => { awaitingFocus = false; watch.activity(now()); arm(); }, { once: true });
        }
      } else arm();
    }, wait);
  }

  function showIdle(sig: StuckSignal): void {
    if (opts.solved() || opts.ex.getAttribute("data-state") !== "wrong") return;
    const fb = opts.ex.querySelector(".ex-feedback");
    if (!fb) return;
    const offer = offerAfterWrong(state, opts.hasSolution);
    if (offer === "retry") return;
    const old = fb.querySelector(".ex-offer");
    const html = offerHtml(offer, sig);
    if (old) old.outerHTML = html;
    else fb.insertAdjacentHTML("beforeend", html);
  }

  function addClue(rung: number, fresh: boolean): HTMLElement {
    const box = document.createElement("div");
    box.className = "ex-hint ex-clue";
    box.setAttribute("data-level", String(rung));
    box.setAttribute("tabindex", "-1");
    box.innerHTML = '<span class="ex-hint-label">Clue ' + rung + " of " + state.clues + "</span>" +
      '<p class="ex-hint-text hint">' + texts[rung - 1] + "</p>";
    /* data-fresh carries the one fade (assets/ladder.css); a restored clue has none */
    box.setAttribute(fresh ? "data-fresh" : "data-restored", "true");
    list!.querySelectorAll(".ex-clue:not([data-prev])").forEach((c) => c.setAttribute("data-prev", "true"));
    list!.appendChild(box);
    list!.hidden = false;
    opts.render(box);
    return box;
  }

  function paintButton(): void {
    if (!button) return;
    const html = buttonHtml(state);
    if (!html) {
      button.hidden = true;
      return;
    }
    button.innerHTML = html;
  }

  const ctl: LadderController = {
    get state() { return state; },
    get button() { return button; },
    openNext() {
      if (!list || !canOpen(state)) return;
      state = open(state);
      watch.clueOpened();
      const box = addClue(state.open, true);
      paintButton();
      const write = toSave(state, opts.solved(), undefined);
      if (write !== null) opts.persist(write);
      try { box.focus({ preventScroll: false }); } catch { box.focus(); }
    },
    afterWrong(given, detection) {
      const sig = watch.check(now(), false, given);
      arm();
      const offer = offerAfterWrong(state, opts.hasSolution);
      return (detection ? askHtml(detection) : "") + offerHtml(offer, sig);
    },
    afterRight() {
      watch.check(now(), true, "");
      watch.solved();
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
    }
  };
  return ctl;
}

/* What the page reaches through window.BMLearn: site.js (a script that cannot import
   this module) calls mount and detect; the rest is a console and test handle. The
   modules under src/learn/ write nothing to window; the files under src/ui/ are the
   places that do (this one, review.ts and next.ts). */
export const api = {
  mount, detect, offerText,
  ladder: { start, open, canOpen, toSave, offerAfterWrong, nextLabel, savedRung, cluesOf },
  detectors: { candidates, detect, QUESTIONS, ORDER },
  stuck: { StuckWatch, answerHash },
  constants: { CLUE_RUNGS, STUCK_IDLE_MS, STUCK_MISSES_NO_CLUE, STUCK_RAPID_CHECKS, STUCK_RAPID_WINDOW_MS, STUCK_REPEAT_WRONG }
};
export type DetectArgs = DetectInput;

if (typeof window !== "undefined") window.BMLearn = api;
