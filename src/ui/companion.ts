/* The companion: Mochi, the axolotl, stands by in the chapter page's sidebar as a 2D sprite
   and answers what happens, through the mood model (src/learn/mood.ts).

   Mounted once the page's scripts have run (as src/ui/next.ts does), only on a page with
   body[data-chapter] and a sidebar, or on the Arena (body[data-mode="arena"], docked at the
   bottom right at every width, at rest on arrival with no intro, reacting to its arena events), with window.BMGame up, the kill switch (config
   companion) and the preference (prefs.companion) not "off"/false; an absent field is on.
   Study mode (html[data-calm] or prefs.calm) hides it. The sprite is Mochi's sheet,
   models/mochi/mochi-<variant>-poses.webp (nine 320 px stills in the order of MOODS; the
   variant is prefs.mochi, "lilac" or else "pink"), drawn as a CSS background: a missing sheet
   fails silently and no model code is loaded.

     - On mount: arrival() from the page's state, then the bus events are mapped to Recent
       and handed to react(). Every other event is ignored.
     - A reaction is steps (a mood, held for ms); they play in order and then Mochi settles to
       idle, and a new reaction interrupts the steps in progress. A caption shows only when the
       throttle allows it and clears when its steps would end (6 s, 12 s for the ones that wait).
       A line that cannot be said now is dropped, except the ones that wait for the next chance
       (one slot, the latest wins). A line said during work is announced politely (low priority);
       the arrival's and the intro's are shown only, so the page's own first words keep the live
       region. The first time ever, the intro line is shown (run.seen.companion).
     - Between reactions the idle mood follows the learner's input (idleMood): thinking over a
       focused field, sleepy and then sleeping after a quiet minute; input wakes it (wake). One
       timer, set from nextIdleAt, no polling. An answer within FAST_MS of the field's focus
       is a surprise (the attempt carries elapsedMs).
     - A new form adds is-evolving for 900 ms; the flourish is CSS, under the motion rules.
     - On a phone-sized screen the sprite steps aside while an exercise field has focus.
   Never writes anything but run.seen.companion. window.BMCompanion is a test handle. */

import { arrival, react, introLine, idleMood, nextIdleAt, wake, MOODS, HOLD_MS, canSay, said, noteVerdict, EMPTY_MEMORY, EMPTY_THROTTLE } from "../learn/mood.ts";
import type { Mood, MoodInput, MoodMemory, Throttle, Reaction, Recent, Step } from "../learn/mood.ts";
import { dueSplit } from "../learn/review.ts";
import { ARENA_SECTIONS } from "../data/arena-sections.ts";
import { FORMS } from "../data/forms.ts";
import { worn } from "../core/forms.ts";

const EVOLVE_MS = 900;
/* lines that wait for a quiet moment rather than being dropped (one slot, the latest wins) */
const WAITS = ["due", "back", "form", "chapter", "regroup", "goal", "level", "boss", "stuck", "arena-end"];
/* said on the page only, never to the live region: at load the region belongs to the page's own
   first words (the exercise count, the chapter's banner), and one message there holds the next
   back for seconds (assets/game.js announce); these are also on the page elsewhere (the Arena says its own result) */
const QUIET = ["intro", "due", "back", "arena-end"];

let fig: HTMLElement | null = null;
let pic: HTMLElement | null = null;
let lineEl: HTMLElement | null = null;
let nameEl: HTMLElement | null = null;
let memory: MoodMemory = EMPTY_MEMORY;
let throttle: Throttle = EMPTY_THROTTLE;
let mood: Mood = "idle";
let variant = "";
let current: Reaction | null = null;
let pending: Reaction | null = null;
let clearTimer = 0, evolveTimer = 0, pendingTimer = 0, introTimer = 0, stepTimer = 0, idleTimer = 0;
let listening = false;
let shownLine = "";
/* the steps in progress, the next to play, and whether any is */
let queue: readonly Step[] = [];
let qi = 0;
let playing = false;
/* events that follow one action arrive in one task (an answer, then combo, xp, opened, achievement): a silent
   mood of the WEAK kinds that comes in the task the playing one began in does not cut it short; the boss's
   (encounter), the Arena's and the rest always show */
let sameTask = false;
const WEAK = ["opened", "ladder", "twin", "combo", "xp", "achievement"];
/* ms of the learner's last input, and of the first focus of the exercise form being answered (0 = none;
   a later field of the same form keeps the first stamp, another form starts a new one) */
let lastInput = 0;
let focusAt = 0;
let focusForm: Element | null = null;

function w(): any { return window as any; }

function formName(): string {
  try {
    const G = w().BMGame;
    const n = worn(G.game().form, G.info().xp);
    return FORMS[n - 1] ? FORMS[n - 1].name : FORMS[0].name;
  } catch { return FORMS[0].name; }
}
function stageNo(): number {
  try { const G = w().BMGame; return worn(G.game().form, G.info().xp); } catch { return 1; }
}

function prefs(): any { try { return w().BMGame.prefs() || {}; } catch { return {}; } }
function calm(): boolean {
  return document.documentElement.hasAttribute("data-calm") || prefs().calm === true;
}
function allowed(): boolean {
  try {
    const cfg = w().BMCore?.config?.readConfig(w().BM_CONFIG);
    if (cfg && cfg.companion === "off") return false;
  } catch { /* an absent field is on */ }
  return prefs().companion !== false;
}

/** the chapter's section as "§2.3 One unknown" and its link, as hub-list.ts words it */
function sectionName(ref: string): { text: string; href: string } | null {
  try {
    const C = w().BM_CURRICULUM;
    const cut = ref.indexOf("#");
    const owner = cut > -1 && C?.chapterById ? C.chapterById(ref.slice(0, cut)) : null;
    if (!owner) return null;
    const sid = ref.slice(cut + 1);
    const idx = owner.sections.findIndex((s: any) => s.id === sid);
    if (idx < 0) return null;
    const num = (owner.part?.beside ? "Pack " : "§") + owner.label + "." + (idx + 1);
    const root = w().BMSite?.rootPrefix ? w().BMSite.rootPrefix() : "";
    return { text: (owner.label === "Interlude" ? "" : num + " ") + owner.sections[idx].title, href: root + owner.path + "#" + sid };
  } catch { return null; }
}

/** the model's input from the page's state; the due review is looked up only for an arrival (a full read of the deck) */
function input(withDue: boolean): MoodInput {
  const S = w().BMStore, Site = w().BMSite, Game = w().BMGame;
  const day = (() => { try { return Site.dayKey() as string; } catch { return ""; } })();
  let activity: any = {};
  try { activity = S.read(S.keys.activity, {}) || {}; } catch { activity = {}; }
  let lastActiveDay: string | null = null;
  try {
    const days = activity.days || {};
    Object.keys(days).forEach((k) => { if (Number(days[k]) > 0 && (lastActiveDay === null || k > lastActiveDay)) lastActiveDay = k; });
  } catch { /* none */ }
  let todayXp = 0, goal = 30;
  try {
    const H = w().BMHud;
    if (H && typeof H.todayXp === "function") todayXp = H.todayXp(activity, new Date());
    if (H && typeof H.goalOf === "function") goal = H.goalOf(activity);
  } catch { /* defaults */ }
  let due: MoodInput["due"] = null;
  if (withDue) try {
    const order: Record<string, number> = {};
    let i = 0;
    ((w().BM_CURRICULUM?.parts) || []).forEach((p: any) => (p.chapters || []).forEach((ch: any) =>
      (ch.sections || []).forEach((s: any) => { order[ch.id + "#" + s.id] = i++; })));
    const arena = new Set<string>(ARENA_SECTIONS);
    const rows = ((Game && typeof Game.deck === "function" && Game.deck({})) || [])
      .map((r: any) => ({ id: r.id, due: !!r.due, box: r.box, last: r.last, seen: r.seen, arena: arena.has(r.id), index: order[r.id] || 0 }));
    const split = dueSplit(rows, day);
    const first = split.arena[0] || split.page[0];
    if (first) {
      const n = sectionName(first.id);
      if (n) due = { ref: first.id, title: n.text, href: n.href };
    }
  } catch { /* no review data */ }
  return { day, lastActiveDay, todayXp, goal, due, comboMax: 5, formName: formName(), calm: calm() };
}

function variantOf(): string { return prefs().mochi === "lilac" ? "lilac" : "pink"; }
function sheetUrl(v: string): string {
  let root = "";
  try { root = String(w().BMSite.rootPrefix()); } catch { /* no helper */ }
  return root + "models/mochi/mochi-" + v + "-poses.webp";
}

function drawSprite(): void {
  if (!fig || !pic) return;
  const v = variantOf();
  if (v !== variant) {
    variant = v;
    pic.style.backgroundImage = 'url("' + sheetUrl(v) + '")';
  }
  /* nine stills side by side: the sheet is nine boxes wide, one high, and the box is square (the CSS height is a later card's) */
  pic.style.backgroundSize = "900% 100%";
  pic.style.backgroundPosition = (MOODS.indexOf(mood) * 100 / 8) + "% 0";
  pic.style.aspectRatio = "1";
  pic.style.height = "auto";
  if (nameEl) nameEl.textContent = "Mochi";
  pic.setAttribute("aria-label", "Mochi, your companion, " + mood);
  fig.setAttribute("data-mood", mood);
}

function setLine(text: string, href: string | null): void {
  if (!lineEl) return;
  shownLine = text;
  lineEl.textContent = "";
  if (text && href) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    lineEl.appendChild(a);
  } else lineEl.textContent = text;
  if (fig) { if (text) fig.setAttribute("data-says", ""); else fig.removeAttribute("data-says"); }
}

function clearLine(): void {
  clearTimer = 0;
  current = null;
  setLine("", null);
}

/** the learner is at a field the companion's idle thinking waits on (the same test fieldFocus hides it by) */
function fieldFocused(): boolean {
  const a = document.activeElement as Element | null;
  return !!(a && a.matches && a.matches("input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select"));
}

/* the idle mood: a state that holds until input; it waits while a reaction plays and is worked out again when that settles */
function applyIdle(): void {
  window.clearTimeout(idleTimer);
  idleTimer = 0;
  if (!fig || playing) return;
  const since = Math.max(0, Date.now() - lastInput), focused = fieldFocused();
  const m = idleMood(since, focused);
  if (m !== mood) { mood = m; drawSprite(); }
  const next = nextIdleAt(since, focused);
  if (next !== null) idleTimer = window.setTimeout(applyIdle, next + 10);
}

function advance(): void {
  stepTimer = 0;
  while (qi < queue.length) {
    const s = queue[qi++];
    mood = s.mood;
    drawSprite();
    if (s.ms > 0) { stepTimer = window.setTimeout(advance, s.ms); return; }
  }
  /* the last step is done: settle to idle */
  playing = false; queue = []; qi = 0;
  applyIdle();
}

/** plays the steps, interrupting any in progress */
function play(steps: readonly Step[]): void {
  if (!fig) return;
  window.clearTimeout(stepTimer);
  window.clearTimeout(idleTimer);
  idleTimer = 0;
  queue = steps; qi = 0; playing = true; sameTask = true;
  window.setTimeout(() => { sameTask = false; }, 0);
  advance();
}

function totalMs(steps: readonly Step[]): number {
  let n = 0;
  steps.forEach((x) => { n += x.ms; });
  return n > 0 ? n : HOLD_MS;
}

function show(r: Reaction, now: number): void {
  if (r.line) {
    current = r;
    setLine(r.line, r.href);
    throttle = said(throttle, now);
    if (QUIET.indexOf(r.key || "") < 0) {
      try { w().BMGame.announce(r.line, { priority: "low", key: "companion:" + (r.key || "line") }); } catch { /* a note */ }
    }
    /* the caption clears when its steps would end, whatever interrupts them */
    window.clearTimeout(clearTimer);
    clearTimer = window.setTimeout(clearLine, totalMs(r.steps));
  }
  /* steps alone: a caption still showing keeps its words and its hold */
  play(r.steps);
}

function evolve(): void {
  if (!fig) return;
  fig.classList.add("is-evolving");
  window.clearTimeout(evolveTimer);
  evolveTimer = window.setTimeout(() => { if (fig) fig.classList.remove("is-evolving"); }, EVOLVE_MS);
}

function flushPending(): void {
  pendingTimer = 0;
  if (!pending || !fig) return;
  const now = Date.now();
  if (canSay(throttle, now)) {
    const r = pending; pending = null;
    show(r, now);
  } else schedulePending();
}
function schedulePending(): void {
  if (pendingTimer) return;
  pendingTimer = window.setTimeout(flushPending, 1000);
}

function together(): boolean { return playing && sameTask; }

/** a reaction arrives: the mood changes at once; the line is said, waits, or is dropped. A weak one
    (WEAK) that arrives in the task a reaction began in leaves that reaction playing. */
function apply(r: Reaction, weak = false): void {
  if (!fig) return;
  const now = Date.now();
  if (r.line && r.key) {
    if (canSay(throttle, now)) { show(r, now); return; }
    /* the mood alone, held no longer than an ordinary reaction while the line waits */
    const cut = r.steps.map((x, i) => (i === r.steps.length - 1 ? { mood: x.mood, ms: Math.min(x.ms, HOLD_MS) } : x));
    const silent: Reaction = { steps: cut, line: null, key: null, href: null };
    if (!(weak && together())) show(silent, now);
    if (WAITS.indexOf(r.key) > -1) { pending = r; schedulePending(); }
    return;
  }
  if (!r.line && weak && together()) return;
  show(r, now);
}

function toRecent(c: any): Recent | null {
  if (!c || typeof c !== "object") return null;
  switch (c.type) {
    case "attempt": {
      /* how long the learner took, from the field's focus; any attempt closes that clock */
      const elapsedMs = focusAt ? Math.max(0, Date.now() - focusAt) : null;
      focusAt = 0; focusForm = null;
      return { type: "attempt", key: String(c.key), correct: !!c.correct, tryNo: Number(c.tryNo) || 1, elapsedMs };
    }
    case "solved": return { type: "solved", fresh: !!c.fresh };
    case "stuck": return { type: "stuck", key: String(c.key), signal: String(c.signal || ""), offer: String(c.offer || "none") };
    case "opened": return { type: "opened" };
    case "ladder": return { type: "ladder" };
    case "twin": return { type: "twin" };
    case "xp": return { type: "xp", goalMet: !!c.goalMet };
    case "combo": return { type: "combo", pips: Number(c.pips) || 0, why: String(c.why || "") };
    case "encounter": return {
      type: "encounter", cue: typeof c.cue === "string" ? c.cue : "", hearts: Number(c.hearts) || 0, fresh: !!c.fresh,
      set: String(c.set || ""), state: String(c.state || "")
    };
    case "chapterDone": return { type: "chapterDone", fresh: !!c.fresh };
    case "level": return { type: "level", level: Number(c.level) || 1 };
    case "achievement": return { type: "achievement", title: String(c.title || "") };
    case "arena": {
      const phase = c.phase;
      if (phase !== "start" && phase !== "answer" && phase !== "end") return null;
      return { type: "arena", phase, correct: !!c.correct, pass: !!c.pass, timeout: !!c.timeout };
    }
    case "form": {
      /* only a stage the learner now wears, reached live: a quiet settle (load, sync, reset)
         or a new stage behind a pinned lower one changes the sprite without a word */
      if (!Array.isArray(c.fresh) || !c.fresh.length || c.quiet) return null;
      const from = shownFrom, to = formName();
      return from === to ? null : { type: "form", from, to };
    }
  }
  return null;
}

let shownFrom = "";

function onChange(c: any): void {
  if (!c || typeof c.type !== "string") return;
  if (c.type === "prefs") { evaluate(); return; }
  /* another state altogether: the mood is derived again from it (the intro stays seen) */
  if (c.type === "reset" || c.type === "sync") { if (fig) unbuild(); evaluate(); return; }
  if (!fig) return;
  /* built before the sprite is redrawn: a new stage's "from" is the name shown until now */
  /* a nudge never arrives after the learner has answered */
  if ((c.type === "solved" || (c.type === "attempt" && c.correct)) && pending && pending.key === "stuck") pending = null;
  const rc = toRecent(c);
  if (c.type === "form") shownFrom = formName();
  if (!rc) return;
  const input_ = input(false);
  if (input_.calm) return;
  const out = react(memory, rc, input_);
  memory = out.memory;
  if (out.reaction) {
    if (c.type === "form") evolve();
    apply(out.reaction, WEAK.indexOf(c.type) > -1);
  }
  /* the verdict's own feedback has the next moments: a line from what follows waits or is dropped;
     the attempt's own line (above) is said at once, the live region keeps its own order */
  if (c.type === "attempt") throttle = noteVerdict(throttle, Date.now());
}

function sidebar(): HTMLElement | null {
  return document.querySelector<HTMLElement>("aside[data-sidebar]");
}

/** the Arena has no sidebar: the figure is docked on the page itself (game.css, body[data-mode="arena"]) */
function onArena(): boolean {
  return !!(document.body && document.body.getAttribute("data-mode") === "arena");
}
function onChapter(): boolean {
  return !!(document.body && document.body.hasAttribute("data-chapter"));
}

function build(): void {
  const side = onArena() ? document.body : sidebar();
  if (!side || fig) return;
  fig = document.createElement("figure");
  fig.className = "companion";
  fig.setAttribute("data-companion", "");
  fig.setAttribute("data-mood", "idle");
  pic = document.createElement("span");
  pic.className = "companion-pic";
  pic.setAttribute("role", "img");
  const cap = document.createElement("figcaption");
  nameEl = document.createElement("b");
  nameEl.className = "companion-name";
  lineEl = document.createElement("span");
  lineEl.className = "companion-line";
  cap.appendChild(nameEl);
  cap.appendChild(lineEl);
  fig.appendChild(pic);
  fig.appendChild(cap);
  side.appendChild(fig);
  mood = "idle"; variant = "";
  lastInput = Date.now(); focusAt = 0; focusForm = null;
  shownFrom = formName();
  drawSprite();
}

function unbuild(): void {
  window.clearTimeout(clearTimer); window.clearTimeout(evolveTimer);
  window.clearTimeout(pendingTimer); window.clearTimeout(introTimer); window.clearTimeout(stepTimer); window.clearTimeout(idleTimer);
  stepTimer = 0; idleTimer = 0; clearTimer = 0; playing = false; queue = []; qi = 0;
  pendingTimer = 0; pending = null;
  if (fig && fig.parentNode) fig.parentNode.removeChild(fig);
  fig = null; pic = null; lineEl = null; nameEl = null; current = null; shownLine = "";
}

function intro(): void {
  const G = w().BMGame;
  let seen: any = null;
  try { seen = G.run().seen; } catch { return; }
  if (!seen || seen.companion) return;
  const line = introLine(formName());
  const r: Reaction = { steps: [{ mood: "idle", ms: HOLD_MS }], line, key: "intro", href: null };
  show(r, Date.now());
  try { G.updateRun((run: any) => { run.seen.companion = 1; }); } catch { /* a note */ }
}

function arrive(): void {
  /* the Arena: at rest, no line; the intro and the due line belong to the chapter pages */
  if (onArena()) {
    memory = EMPTY_MEMORY;
    throttle = EMPTY_THROTTLE;
    mood = "idle"; drawSprite();
    applyIdle();
    return;
  }
  const inp = input(true);
  const r = arrival(inp);
  memory = EMPTY_MEMORY;
  throttle = EMPTY_THROTTLE;
  let first = false;
  try { first = !w().BMGame.run().seen.companion; } catch { first = false; }
  if (first) {
    mood = r.steps[0].mood; drawSprite();
    intro();
    if (r.line && r.key && WAITS.indexOf(r.key) > -1) { pending = r; schedulePending(); }
    return;
  }
  if (r.line) apply(r);
  else { mood = r.steps[0].mood; drawSprite(); applyIdle(); }
}

function evaluate(): void {
  const should = (onChapter() || onArena()) && !!w().BMGame && allowed() && !calm();
  if (!should) { if (fig) unbuild(); return; }
  if (fig) { drawSprite(); return; }
  build();
  if (fig) arrive();
}

function fieldFocus(): void {
  if (!fig) return;
  const field = fieldFocused();
  const small = !!(window.matchMedia && window.matchMedia("(max-width: 999px)").matches);
  if (field && small) fig.setAttribute("data-hidden", ""); else fig.removeAttribute("data-hidden");
}

/** the learner did something: a nap ends in a start, any other idle mood is worked out again */
function onInput(): void {
  lastInput = Date.now();
  if (!fig) return;
  if (!playing && (mood === "sleepy" || mood === "sleeping")) {
    const r = wake(mood);
    if (r) { play(r.steps); return; }
  }
  applyIdle();
}

function mount(): void {
  if (!onChapter() && !onArena()) return;
  if (!w().BMGame || !w().BMStore || (!onArena() && !sidebar())) return;
  if (!listening) {
    listening = true;
    w().BMStore.on(onChange);
    document.addEventListener("focusin", fieldFocus);
    document.addEventListener("focusout", () => window.setTimeout(() => { fieldFocus(); applyIdle(); }, 0));
    document.addEventListener("focusin", (e) => {
      const t = e.target instanceof Element ? e.target.closest(".ex-form") : null;
      if (t && fieldFocused() && t !== focusForm) { focusForm = t; focusAt = Date.now(); }
    });
    ["pointerdown", "keydown", "wheel", "touchstart", "focusin"].forEach((t) => document.addEventListener(t, onInput, { passive: true }));
  }
  evaluate();
}

export const api = {
  /** the model's input from the page's state (the progress page reads it for its own mood line) */
  input: (withDue: boolean): MoodInput => input(withDue),
  mood: (): Mood => mood,
  say: (line: string): void => { if (fig) apply({ steps: [{ mood: "happy", ms: HOLD_MS }], line, key: "test", href: null }); },
  /** a test and QA handle: shows one of the sheet's moods now; false for an unknown name */
  setMood: (name: string): boolean => {
    if (!fig || !(MOODS as readonly string[]).includes(name)) return false;
    window.clearTimeout(stepTimer); stepTimer = 0;
    playing = false; queue = []; qi = 0;
    mood = name as Mood;
    drawSprite();
    return true;
  },
  moods: (): string[] => MOODS.slice(),
  /** mode "2d" here; steps = the steps not yet finished, the one showing included; idleSince in ms */
  info: () => ({
    mode: "2d", mood, steps: playing ? queue.length - qi + 1 : 0, variant, idleSince: lastInput ? Math.max(0, Date.now() - lastInput) : 0
  }),
  state: () => ({
    mounted: !!fig, mood, line: shownLine, key: current && shownLine ? current.key : null,
    pending: pending ? pending.key : null, stage: stageNo()
  })
};

if (typeof window !== "undefined" && typeof document !== "undefined") {
  (window as any).BMCompanion = api;
  let done = false;
  const go = () => { if (!done) { done = true; try { mount(); } catch { /* the page does without */ } } };
  if (document.readyState === "complete") setTimeout(go, 0);
  else {
    document.addEventListener("DOMContentLoaded", go);
    window.addEventListener("load", go);
  }
}
