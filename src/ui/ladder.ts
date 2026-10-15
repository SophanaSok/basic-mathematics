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
import { matchMiss, parseMisses } from "../learn/misses.ts";
import { approachDue, mostMissed } from "../learn/approach.ts";
import { FADED_RUNG } from "../core/rules.ts";
import { supportFor } from "../learn/support.ts";

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
  /** the card's .ex-solution; one whose last step carries data-final adds the faded rung */
  solution?: HTMLElement | null;
  /** the section behind this page's misses, for the change-approach card; null names nothing */
  approach?: () => ApproachInfo | null;
  /** how much help to offer (src/learn/support.ts): changes one line of words and one link, never a rung,
   *  a check, a clue or a reward. Absent means "standard". */
  support?: SupportOption;
  /** milliseconds, for the stuck signals; Date.now by default */
  now?: () => number;
}

export interface ApproachInfo { full: string; label: string; href: string; /** this card's own section, named because no miss on the page points elsewhere */ own?: boolean }

export interface SupportLink { full: string; href: string }
export interface SupportOption {
  level: "guided" | "standard" | "light";
  from: "own" | "requires" | "none";
  /** the weak prerequisites, named and linked */
  weak: SupportLink[];
  /** the section's first worked example on this page, if any */
  worked: HTMLElement | null;
}

export interface LadderController {
  readonly state: LadderState;
  readonly button: HTMLButtonElement | null;
  /** the lines to put under the verdict after a wrong check, as HTML */
  afterWrong(given: string | readonly string[], detection: Detection | null, note?: string | null): string;
  /** a right answer: the idle watch stops */
  afterRight(): void;
  /** the learner asked for the next clue (the button's click) */
  openNext(): void;
  /** the support level, when it is known only after the mount (once; a later call is ignored) */
  setSupport(sup: SupportOption | undefined): void;
}

/* -------------------------------------------------------------- words --- */

const OFFERS: Record<Offer, string> = {
  clue: "A clue is there if you want one.",
  steps: "The worked steps are there, with the last one left for you.",
  solution: "Work it through once more, or open the solution.",
  retry: "Not yet. Work it through once more."
};
/* what a stuck signal says instead, by what comes next; "retry" keeps its own words */
const STUCK_OFFERS: Record<StuckSignal, { clue: string; steps: string; solution: string }> = {
  rapid: { clue: "No hurry. A clue is there if you want one.", steps: "No hurry. The worked steps are there, with the last one left for you.", solution: "No hurry. The worked solution is there whenever you want it." },
  repeat: { clue: "That is the answer you gave last time. A clue might show another way in.", steps: "That is the answer you gave last time. The worked steps show another way in.", solution: "That is the answer you gave last time. The worked solution shows another way in." },
  misses: { clue: "Asking for a clue costs nothing, and it might be the nudge you need.", steps: "The worked steps cost nothing to open, and the last one is yours to finish.", solution: "The worked solution is there whenever you want it; reading it closely is a good next step." },
  idle: { clue: "Still on this one? A clue is there whenever you want it.", steps: "Still on this one? The worked steps are there whenever you want them.", solution: "Still on this one? The worked solution is there whenever you want it." }
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
  if (n.rung > s.clues) return 'Show the worked steps <span class="ex-clue-of">(' + n.rung + " of " + n.of + ")</span>";
  return (s.open ? "Next clue" : "Show a clue") + ' <span class="ex-clue-of">(' + n.rung + " of " + n.of + ")</span>";
}

/** the change-approach card's inner markup; every word from `info` is escaped */
export function approachHtml(info: ApproachInfo | null): string {
  return "<p><b>Try a different way in.</b> Every clue is open and it is still not coming. " +
    (info && info.own
      ? "Rereading <b>" + escapeHtml(info.full) + "</b>, then coming back, usually helps more than another try."
      : info
      ? "Most of the misses on this page trace back to <b>" + escapeHtml(info.full) + "</b>; rereading it, then coming back, usually helps more than another try."
      : "Rereading the section behind this exercise usually helps more than another try.") + "</p>" +
    '<p class="ex-approach-actions">' +
    (info ? '<a class="btn" href="' + escapeHtml(info.href) + '">Reread ' + escapeHtml(info.label) + "</a> " : "") +
    '<button type="button" class="btn ghost" data-keep-going>Keep going</button></p>';
}

/** the line the live region reads when the card appears */
export function approachSpoken(info: ApproachInfo | null): string {
  return "Try a different way in. " + (info ? "Worth rereading " + info.full + "." : "Worth rereading the section behind this exercise.");
}

function joinNames(parts: string[]): string {
  if (parts.length < 2) return parts.join("");
  return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}

/** the guided line (inside .ex-support) as HTML; every word from the curriculum is escaped, and the
 *  button is there only when there is a worked example to scroll to */
export function supportHtml(s: Pick<SupportOption, "from" | "weak">, hasWorked: boolean): string {
  const tail = hasWorked ? " The worked example walks through one like it." : "";
  const text = s.from === "requires" && s.weak.length
    ? "This section builds on " + joinNames(s.weak.map((w) => '<a href="' + escapeHtml(w.href) + '">' + escapeHtml(w.full) + "</a>")) +
      ", which your recent answers mark as shaky." + tail
    : "Your recent answers in this section are shaky." + tail;
  return text + (hasWorked ? ' <button type="button" class="btn ghost" data-worked>See the worked example</button>' : "");
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string);
}

/* ------------------------------------------------------------- mount ---- */

export function mount(opts: LadderOptions): LadderController {
  const now = opts.now || (() => Date.now());
  const texts = cluesOf(opts.hints);
  const fadeable = !!opts.solution && !!opts.solution.querySelector("[data-final]");
  let state = start(texts.length, opts.saved, fadeable);
  const watch = new StuckWatch();
  if (state.open > 0) watch.clueOpened();

  let list: HTMLElement | null = null;
  let button: HTMLButtonElement | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let awaitingFocus = false;
  let missesAfterLadder = 0;
  let approachShown = false;
  let approachCard: HTMLElement | null = null;

  /* The support level (src/learn/support.ts) may arrive after the mount: the event log it is read
     from is put up by a module that runs after site.js builds the cards. */
  let supported = false;
  /* light: the first wrong check on this card has no offer line (the clue button is unchanged) */
  let quietFirst = false;
  function applySupport(sup: SupportOption | undefined): void {
    if (!sup || supported) return;
    supported = true;
    quietFirst = sup.level === "light";
    /* guided: one line before the form on a card not yet solved; not a live region, no focus move */
    if (sup.level !== "guided" || opts.solved()) return;
    const p = document.createElement("p");
    p.className = "ex-support hint";
    p.innerHTML = supportHtml(sup, !!sup.worked);
    opts.ex.insertBefore(p, opts.form);
    const b = p.querySelector("[data-worked]");
    if (b && sup.worked) {
      const target = sup.worked;
      b.addEventListener("click", () => {
        const calm = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const h = target.querySelector<HTMLElement>("h1, h2, h3, h4, h5, h6") || target;
        if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
        try { target.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" }); } catch { /* no scroll */ }
        try { h.focus({ preventScroll: true }); } catch { h.focus(); }
      });
    }
  }
  applySupport(opts.support);

  if (texts.length || fadeable) {
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
    if (state.faded) addFaded(false);
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

  /* The worked solution with its answer line and its last step taken out: a copy, so the
     real solution is untouched. Everything from the data-final node on, in document order,
     goes; no id survives (ids stay unique on the page). */
  function fadedBox(): HTMLElement {
    const box = document.createElement("div");
    box.className = "ex-hint ex-clue ex-faded";
    box.setAttribute("data-level", String(FADED_RUNG));
    box.setAttribute("tabindex", "-1");
    const label = document.createElement("span");
    label.className = "ex-hint-label";
    label.textContent = "Worked steps";
    box.appendChild(label);
    const copy = opts.solution!.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("p.answer").forEach((n) => n.remove());
    const mark = copy.querySelector("[data-final]");
    if (mark) {
      let node: Node | null = mark;
      while (node && node !== copy) {
        const up: Node | null = node.parentNode;
        while (node.nextSibling) node.parentNode!.removeChild(node.nextSibling);
        if (node === mark) (node as Element).remove();
        node = up;
      }
    }
    copy.removeAttribute("id");
    copy.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    copy.removeAttribute("data-show");
    copy.className = "ex-faded-steps";
    box.appendChild(copy);
    const tail = document.createElement("p");
    tail.className = "ex-hint-text hint";
    tail.textContent = "Finish the last step, then check your answer above.";
    box.appendChild(tail);
    return box;
  }

  function addFaded(fresh: boolean): HTMLElement {
    const box = fadedBox();
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

  /* the card, once, after the verdict; focus stays where it is */
  function showApproach(): string {
    const fb = opts.ex.querySelector(".ex-feedback");
    if (!fb) return "";
    let info: ApproachInfo | null = null;
    try { info = opts.approach ? opts.approach() : null; } catch { info = null; }
    const card = document.createElement("div");
    card.className = "ex-approach";
    card.innerHTML = approachHtml(info);
    fb.insertAdjacentElement("afterend", card);
    approachCard = card;
    card.querySelector("[data-keep-going]")!.addEventListener("click", () => {
      card.hidden = true;
      const f = opts.ex.querySelector<HTMLElement>(".ex-form input:not([disabled]):not([type=hidden]), .ex-form button:not([disabled])");
      if (f) try { f.focus(); } catch { /* nothing to focus */ }
    });
    return '<p class="visually-hidden">' + escapeHtml(approachSpoken(info)) + "</p>";
  }

  const ctl: LadderController = {
    get state() { return state; },
    get button() { return button; },
    setSupport(sup) { applySupport(sup); },
    openNext() {
      if (!list || !canOpen(state)) return;
      state = open(state);
      watch.clueOpened();
      const box = state.faded ? addFaded(true) : addClue(state.open, true);
      paintButton();
      const write = toSave(state, opts.solved(), undefined);
      if (write !== null) opts.persist(write);
      try { box.focus({ preventScroll: false }); } catch { box.focus(); }
    },
    afterWrong(given, detection, note) {
      const sig = watch.check(now(), false, given);
      arm();
      const offer = offerAfterWrong(state, opts.hasSolution);
      let spoken = "";
      /* only a card that had a ladder to run out of: a card with no clue keeps the plain offer */
      if ((state.clues > 0 || state.fadeable) && !canOpen(state)) {
        missesAfterLadder++;
        if (opts.approach && !approachShown && !opts.solved() && approachDue(missesAfterLadder)) {
          approachShown = true;
          spoken = showApproach();
        }
      }
      const line = quietFirst ? "" : offerHtml(offer, sig);
      quietFirst = false;
      if (note) return '<p class="ex-miss-note hint">' + note + "</p>" + line + spoken;
      return (detection ? askHtml(detection) : "") + line + spoken;
    },
    afterRight() {
      watch.check(now(), true, "");
      watch.solved();
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
      /* solved: "still not coming" is no longer true */
      if (approachCard) approachCard.hidden = true;
    }
  };
  return ctl;
}

/* What the page reaches through window.BMLearn: site.js (a script that cannot import
   this module) calls mount and detect; the rest is a console and test handle. The
   modules under src/learn/ write nothing to window; the files under src/ui/ are the
   places that do (this one, review.ts and next.ts). */
export const api = {
  mount, detect, offerText, mostMissed, supportFor,
  ladder: { start, open, canOpen, toSave, offerAfterWrong, nextLabel, savedRung, cluesOf },
  misses: { parseMisses, matchMiss },
  FADED_RUNG,
  detectors: { candidates, detect, QUESTIONS, ORDER },
  stuck: { StuckWatch, answerHash },
  constants: { CLUE_RUNGS, STUCK_IDLE_MS, STUCK_MISSES_NO_CLUE, STUCK_RAPID_CHECKS, STUCK_RAPID_WINDOW_MS, STUCK_REPEAT_WRONG }
};
export type DetectArgs = DetectInput;

if (typeof window !== "undefined") window.BMLearn = api;
