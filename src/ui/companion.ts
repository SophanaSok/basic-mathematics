/* The companion: the learner's form stands by in the chapter page's sidebar as a 2D sprite
   and answers what happens, through the mood model (src/learn/mood.ts).

   Mounted once the page's scripts have run (as src/ui/next.ts does), only on a page with
   body[data-chapter] and a sidebar, with window.BMGame up, the kill switch (config
   companion) and the preference (prefs.companion) not "off"/false; an absent field is on.
   Study mode (html[data-calm] or prefs.calm) hides it. The sprite is the form's pose sheet,
   models/forms/form-<n>-poses.webp (six stills in the order of POSES), drawn as a CSS
   background: a missing sheet fails silently and no model code is loaded.

     - On mount: arrival() from the page's state, then the bus events are mapped to Recent
       and handed to react(). Every other event is ignored.
     - A caption shows only when the throttle allows it and clears after 6 s. A line that
       cannot be said now is dropped, except due, back, form, chapter and regroup, which wait
       for the next chance (one slot, the latest wins). A shown line is announced politely
       (low priority). The first time ever, the intro line is shown (run.seen.companion).
     - A new form adds is-evolving for 900 ms; the flourish is CSS, under the motion rules.
     - On a phone-sized screen the sprite steps aside while an exercise field has focus.
   Never writes anything but run.seen.companion. window.BMCompanion is a test handle. */

import { arrival, react, introLine, POSES, canSay, said, noteVerdict, EMPTY_MEMORY, EMPTY_THROTTLE } from "../learn/mood.ts";
import type { Mood, Pose, MoodInput, MoodMemory, Throttle, Reaction, Recent } from "../learn/mood.ts";
import { dueSplit } from "../learn/review.ts";
import { ARENA_SECTIONS } from "../data/arena-sections.ts";
import { FORMS } from "../data/forms.ts";
import { worn, highest } from "../core/forms.ts";

const SHOW_MS = 6000, EVOLVE_MS = 900;
const WAITS = ["due", "back", "form", "chapter", "regroup"];

let fig: HTMLElement | null = null;
let pic: HTMLElement | null = null;
let lineEl: HTMLElement | null = null;
let nameEl: HTMLElement | null = null;
let memory: MoodMemory = EMPTY_MEMORY;
let throttle: Throttle = EMPTY_THROTTLE;
let mood: Mood = "content";
let pose: Pose = "rest";
let current: Reaction | null = null;
let pending: Reaction | null = null;
let clearTimer = 0, evolveTimer = 0, pendingTimer = 0, introTimer = 0;
let listening = false;
let stage = 0;
let shownLine = "";

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

function input(): MoodInput {
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
  try {
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

function sheetUrl(n: number): string {
  let root = "";
  try { root = String(w().BMSite.rootPrefix()); } catch { /* no helper */ }
  return root + "models/forms/form-" + n + "-poses.webp";
}

function drawSprite(): void {
  if (!fig || !pic) return;
  const n = stageNo();
  if (n !== stage) {
    stage = n;
    pic.style.backgroundImage = 'url("' + sheetUrl(n) + '")';
  }
  if (nameEl) nameEl.textContent = formName();
  pic.style.backgroundPosition = POSES.indexOf(pose) * 20 + "% 0";
  pic.setAttribute("aria-label", formName() + ", your form, " + mood);
  fig.setAttribute("data-mood", mood);
  fig.setAttribute("data-pose", pose);
  shownFrom = formName();
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
  setLine("", null);
  /* back to the mood's silent state; the pose stays */
}

function show(r: Reaction, now: number): void {
  mood = r.mood; pose = r.pose; current = r;
  drawSprite();
  if (r.line) {
    setLine(r.line, r.href);
    throttle = said(throttle, now);
    window.clearTimeout(clearTimer);
    clearTimer = window.setTimeout(clearLine, SHOW_MS);
    try { w().BMGame.announce(r.line, { priority: "low", key: "companion:" + (r.key || "line") }); } catch { /* a note */ }
  }
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

/** a reaction arrives: the mood and pose change at once; the line is said, waits, or is dropped */
function apply(r: Reaction): void {
  if (!fig) return;
  const now = Date.now();
  if (r.line && r.key) {
    if (canSay(throttle, now)) { show(r, now); return; }
    const silent: Reaction = { mood: r.mood, pose: r.pose, line: null, key: null, href: null };
    show(silent, now);
    if (WAITS.indexOf(r.key) > -1) { pending = r; schedulePending(); }
    return;
  }
  show(r, now);
}

function toRecent(c: any): Recent | null {
  if (!c || typeof c !== "object") return null;
  switch (c.type) {
    case "attempt": return { type: "attempt", key: String(c.key), correct: !!c.correct, tryNo: Number(c.tryNo) || 1 };
    case "solved": return { type: "solved", fresh: !!c.fresh };
    case "opened": return { type: "opened" };
    case "ladder": return { type: "ladder" };
    case "twin": return { type: "twin" };
    case "xp": return { type: "xp", goalMet: !!c.goalMet };
    case "combo": return { type: "combo", pips: Number(c.pips) || 0, why: String(c.why || "") };
    case "encounter": return { type: "encounter", cue: typeof c.cue === "string" ? c.cue : "", hearts: Number(c.hearts) || 0, fresh: !!c.fresh };
    case "chapterDone": return { type: "chapterDone", fresh: !!c.fresh };
    case "level": return { type: "level", level: Number(c.level) || 1 };
    case "achievement": return { type: "achievement", title: String(c.title || "") };
    case "form": {
      if (!Array.isArray(c.fresh) || !c.fresh.length) return null;
      let to = formName();
      try { const G = w().BMGame; const hi = highest(G.game().form, G.info().xp); if (FORMS[hi - 1]) to = FORMS[hi - 1].name; } catch { /* keep */ }
      return { type: "form", from: shownFrom, to };
    }
  }
  return null;
}

let shownFrom = "";

function onChange(c: any): void {
  if (!c || typeof c.type !== "string") return;
  if (c.type === "prefs" || c.type === "reset" || c.type === "sync") { evaluate(); return; }
  if (!fig) return;
  if (c.type === "attempt") throttle = noteVerdict(throttle, Date.now());
  /* built before the sprite is redrawn: a new stage's "from" is the name shown until now */
  const rc = toRecent(c);
  if (c.type === "form") drawSprite();
  if (!rc) return;
  const input_ = input();
  if (input_.calm) return;
  const out = react(memory, rc, input_);
  memory = out.memory;
  if (out.reaction) {
    if (c.type === "form") evolve();
    apply(out.reaction);
  }
}

function sidebar(): HTMLElement | null {
  return document.querySelector<HTMLElement>("aside[data-sidebar]");
}

function build(): void {
  const side = sidebar();
  if (!side || fig) return;
  fig = document.createElement("figure");
  fig.className = "companion";
  fig.setAttribute("data-companion", "");
  fig.setAttribute("data-mood", "content");
  fig.setAttribute("data-pose", "rest");
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
  mood = "content"; pose = "rest"; stage = 0;
  shownFrom = formName();
  drawSprite();
}

function unbuild(): void {
  window.clearTimeout(clearTimer); window.clearTimeout(evolveTimer);
  window.clearTimeout(pendingTimer); window.clearTimeout(introTimer);
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
  const r: Reaction = { mood: "content", pose: "rest", line, key: "intro", href: null };
  show(r, Date.now());
  try { G.updateRun((run: any) => { run.seen.companion = 1; }); } catch { /* a note */ }
}

function arrive(): void {
  const inp = input();
  const r = arrival(inp);
  memory = EMPTY_MEMORY;
  throttle = EMPTY_THROTTLE;
  let first = false;
  try { first = !w().BMGame.run().seen.companion; } catch { first = false; }
  if (first) {
    mood = r.mood; pose = r.pose; drawSprite();
    intro();
    if (r.line && r.key && WAITS.indexOf(r.key) > -1) { pending = r; schedulePending(); }
    return;
  }
  if (r.line) apply(r);
  else { mood = r.mood; pose = r.pose; drawSprite(); }
}

function evaluate(): void {
  const should = !!(document.body && document.body.hasAttribute("data-chapter")) && !!w().BMGame && allowed() && !calm();
  if (!should) { if (fig) unbuild(); return; }
  if (fig) { drawSprite(); return; }
  build();
  if (fig) arrive();
}

function fieldFocus(): void {
  if (!fig) return;
  const a = document.activeElement as Element | null;
  const field = !!(a && a.matches && a.matches(".ex-form input, .ex-form textarea"));
  const small = !!(window.matchMedia && window.matchMedia("(max-width: 999px)").matches);
  if (field && small) fig.setAttribute("data-hidden", ""); else fig.removeAttribute("data-hidden");
}

function mount(): void {
  if (!document.body || !document.body.hasAttribute("data-chapter")) return;
  if (!w().BMGame || !w().BMStore || !sidebar()) return;
  if (!listening) {
    listening = true;
    w().BMStore.on(onChange);
    document.addEventListener("focusin", fieldFocus);
    document.addEventListener("focusout", () => window.setTimeout(fieldFocus, 0));
  }
  evaluate();
}

export const api = {
  mood: (): Mood => mood,
  say: (line: string): void => { if (fig) apply({ mood: "delighted", pose: "delighted", line, key: "test", href: null }); },
  state: () => ({
    mounted: !!fig, mood, pose, line: shownLine, key: current ? current.key : null,
    pending: pending ? pending.key : null, stage
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
