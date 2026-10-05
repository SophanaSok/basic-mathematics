// @ts-check
/* What the HUD shows, from what is stored, and the one function that writes it into the
   top bar. The top bar's markup is static (tools/lib/shell.js topbar()), so the page is
   laid out with every slot in place before any script runs; this fills the slots.

   It runs twice on every page, and the two must agree to the pixel, or the top bar
   shifts when the bundle arrives (the `hud` suite of check-browser.js measures it):
     - before first paint, in the inline HUD script straight after the top bar
       (prefill() below, with the text of levels.js and this file put inline by the shell);
     - after, every time the game layer redraws the HUD (assets/game.js updateHud), with
       the same functions, which the inline script handed it as window.BMHud.
   So nothing here reads the bundle's globals, and the stores are read the way the site
   reads them: a missing or damaged value is a default, never an error.

   Like levels.js, this is a plain ES module that runs as it stands in a browser (JSDoc
   types, `export function` and `export const` only, one `import { … } from "./levels.js"`
   which the shell takes out, no closing script tag). It does not touch window or document at
   load; prefill() is what the inline script calls. */
import { levelInfo } from "./levels.js";

/* the keys this reads; site.js Store.keys has the same */
export const KEYS = { activity: "bm.activity.v1", run: "bm.run.v1", prefs: "bm.prefs.v1" };
/* the daily goal when the reader has not set one (site.js Activity.goal) */
export const DEFAULT_GOAL = 30;

/** @param {unknown} x @returns {Record<string, any>} */
function rec(x) { return x && typeof x === "object" && !Array.isArray(x) ? /** @type {Record<string, any>} */ (x) : {}; }
/** @param {unknown} x */
function num(x) { const n = Number(x); return isFinite(n) ? n : 0; }

/** A local calendar day as YYYY-MM-DD: the key of bm.activity.v1 days (site.js dayKey
    writes them, and view.test.ts holds the two to the same text).
    @param {Date} [d] */
export function dayKey(d) {
  d = d || new Date();
  const two = (/** @type {number} */ n) => (n < 10 ? "0" : "") + n;
  return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
}

/** every XP ever earned: the sum of the days, each day a number or nothing
    @param {unknown} activity the stored bm.activity.v1 */
export function totalXp(activity) {
  const days = rec(rec(activity).days);
  let sum = 0;
  Object.keys(days).forEach((k) => { sum += num(days[k]); });
  return sum;
}

/** today's XP
    @param {unknown} activity @param {Date} [now] */
export function todayXp(activity, now) {
  return num(rec(rec(activity).days)[dayKey(now)]);
}

/** the daily goal: the reader's, or DEFAULT_GOAL
    @param {unknown} activity */
export function goalOf(activity) {
  const g = parseInt(rec(activity).goal, 10);
  return g > 0 ? g : DEFAULT_GOAL;
}

/** Consecutive active days ending today, or yesterday, so a streak is not shown as
    broken before today's work has had a chance to happen.
    @param {unknown} activity @param {Date} [now] */
export function streakOf(activity, now) {
  const days = rec(rec(activity).days), d = now ? new Date(now.getTime()) : new Date();
  let n = 0;
  if (!(num(days[dayKey(d)]) > 0)) d.setDate(d.getDate() - 1);
  while (num(days[dayKey(d)]) > 0) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/** the combo's XP multiplier for a number of pips, 1 to 2
    @param {number} pips */
export function multOf(pips) { return Math.round((1 + 0.2 * pips) * 10) / 10; }

/** the combo meter as bm.run.v1 keeps it: 0 to 5 pips and a shield
    @param {unknown} run */
export function comboOf(run) {
  const c = rec(rec(run).combo);
  return { pips: Math.max(0, Math.min(5, Math.round(num(c.pips)))), shield: !!c.shield };
}

/**
 * @typedef {{ activity?: unknown, run?: unknown, prefs?: unknown, calm?: boolean, chapter?: boolean, now?: Date }} HudInput
 *   the stores as stored; `calm` is whether Study mode is on as the page shows it
 *   (html[data-calm]), `chapter` whether this is a chapter page
 * @typedef {{ level: number, rank: string, into: number, span: number, pct: number,
 *   streak: number, today: number, goal: number, ring: number,
 *   combo: { shown: boolean, pips: number, shield: boolean, mult: number },
 *   sound: boolean,
 *   labels: { level: string, streak: string, combo: string } }} HudView
 */

/** What the HUD shows. Pure: the same stores give the same view.
    @param {HudInput} input @returns {HudView} */
export function hudView(input) {
  const now = input.now || new Date();
  const inf = levelInfo(totalXp(input.activity));
  const streak = streakOf(input.activity, now), today = todayXp(input.activity, now), goal = goalOf(input.activity);
  const c = comboOf(input.run), calm = !!input.calm;
  const sound = rec(input.prefs).sound === true && !calm;
  return {
    level: inf.level, rank: inf.rank, into: inf.into, span: inf.span, pct: inf.pct,
    streak: streak, today: today, goal: goal, ring: Math.min(100, Math.round((today / goal) * 100)),
    combo: { shown: !calm && (c.pips > 0 || (!!input.chapter && c.shield)), pips: c.pips, shield: c.shield, mult: multOf(c.pips) },
    sound: sound,
    labels: {
      level: "Level " + inf.level + ", " + inf.rank + ". " + inf.into + " of " + inf.span + " XP to level " + (inf.level + 1) + ". Open your progress.",
      streak: streak + "-day streak. " + today + " of " + goal + " XP today.",
      combo: "Combo " + c.pips + " of 5, XP times " + multOf(c.pips) + (c.shield ? ", shield ready" : "")
    }
  };
}

/* writes only what differs, so a redraw that changes nothing touches nothing */
/** @param {Element | null} el @param {string} name @param {string | null} value */
function attr(el, name, value) {
  if (!el) return;
  if (value === null) { if (el.hasAttribute(name)) el.removeAttribute(name); }
  else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
/** @param {Element | null} el @param {string} t */
function text(el, t) { if (el && el.textContent !== t) el.textContent = t; }
/** @param {HTMLElement | null} el @param {string} name @param {string} value */
function prop(el, name, value) { if (el && el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value); }

/** Write a view into the top bar's HUD. The slots are the shell's; a page without them
    (a test fixture) is left alone.
    @param {ParentNode} doc @param {HudView} v @returns {boolean} whether there was a HUD */
export function paint(doc, v) {
  const hud = doc.querySelector(".topbar .hud");
  if (!hud) return false;
  const q = (/** @type {string} */ s) => /** @type {HTMLElement | null} */ (hud.querySelector(s));

  attr(q(".hud-level"), "aria-label", v.labels.level);
  text(q(".hud-badge b"), String(v.level));
  prop(q(".hud-xpbar i"), "width", v.pct + "%");
  text(q(".hud-xptext b"), String(v.into));
  text(q(".hud-xptext .hud-span"), String(v.span));

  const streak = q(".hud-streak");
  attr(streak, "aria-label", v.labels.streak);
  attr(streak, "data-on", v.streak > 0 ? "true" : null);
  const ring = q(".goal-ring");
  prop(ring, "--pct", String(v.ring));
  attr(ring, "data-full", v.ring >= 100 ? "true" : null);
  text(q(".hud-streak > b"), String(v.streak));

  const combo = q(".hud-combo");
  if (combo) {
    if (combo.hidden !== !v.combo.shown) combo.hidden = !v.combo.shown;
    attr(combo, "data-pips", String(v.combo.pips));
    attr(combo, "data-shield", v.combo.shield ? "true" : null);
    attr(combo, "aria-label", v.labels.combo);
    Array.prototype.forEach.call(combo.children, (/** @type {Element} */ pip, /** @type {number} */ i) => attr(pip, "data-on", i < v.combo.pips ? "" : null));
  }

  const bar = hud.closest(".topbar");
  attr(bar && bar.querySelector(".hud-sound"), "aria-pressed", v.sound ? "true" : "false");
  return true;
}

/** The inline HUD script's one job: read the stores and paint, before first paint. A
    storage that throws is an empty one.
    @param {Document} doc @param {{ localStorage: Storage }} win */
export function prefill(doc, win) {
  /** @param {string} key */
  const read = (key) => { try { return JSON.parse(String(win.localStorage.getItem(key))); } catch (e) { return null; } };
  return paint(doc, hudView({
    activity: read(KEYS.activity), run: read(KEYS.run), prefs: read(KEYS.prefs),
    calm: doc.documentElement.hasAttribute("data-calm"),
    chapter: !!(doc.body && doc.body.getAttribute("data-chapter")),
    now: new Date()
  }));
}
