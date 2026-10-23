/* The top bar explains itself (card U-7). Two things, both built at run time so the
   bar's markup (tools/lib/shell.js, locked by tools/shell.json) is untouched:

   - a tooltip chip on every part of the HUD (level, XP bar, streak, combo, hearts, clock):
     one aria-hidden element appended to the top bar, shown 250 ms after the pointer rests
     on a part, or at once on keyboard focus of the level badge (the only focusable part),
     hidden on leave, blur and Escape. The words are the ones window.BMHud already wrote
     into the parts' aria-labels, made longer where the label is short. It is positioned
     absolutely inside the (sticky) bar, so it takes no room and moves nothing;
   - a small non-modal popover on the level badge: a plain click (or Enter, or Space)
     opens it instead of going to progress.html; it holds level and rank, XP into the
     level with a bar, the streak, the last 30 days' consistency, and a full-width "Your
     progress" button (the old destination, one tap away). A modified
     click (ctrl, cmd, shift, alt, or the middle button) is the browser's: the link stays a
     link. Escape closes it and gives the focus back to the badge, so does a click
     outside, or Tab out of it.
   The popover is built under the badge in the HUD (so Tab reaches it next) when it opens
   and removed when it closes: nothing of it is in the bar otherwise. */

const PARTS = ".topbar .hud-level, .topbar .hud-xp, .topbar .hud-streak, .topbar .hud-combo, .topbar .hud-hearts, .topbar .hud-timer";
const DELAY = 250;

function read(key: string): unknown {
  try { return JSON.parse(String(window.localStorage.getItem(key))); } catch { return null; }
}
function plural(n: number, one: string, many: string): string {
  return n + " " + (n === 1 ? one : many);
}

/* the reader's HUD view, from the stores as stored (the same input the HUD script reads) */
function view() {
  const doc = document;
  if (!window.BMHud || typeof window.BMHud.hudView !== "function") return null;
  return window.BMHud.hudView({
    activity: read("bm.activity.v1"), run: read("bm.run.v1"), prefs: read("bm.prefs.v1"),
    calm: doc.documentElement.hasAttribute("data-calm"),
    chapter: !!(doc.body && doc.body.getAttribute("data-chapter"))
  });
}

/** the chip's words for a part, or null when the part is not showing */
function tipText(part: HTMLElement): string | null {
  if (part.hidden || part.closest("[hidden]")) return null;
  const v = view();
  if (!v) return null;
  const levelText = "Level " + v.level + " · " + v.rank + ". " + v.into + " of " + v.span + " XP to level " + (v.level + 1) + ".";
  if (part.classList.contains("hud-level") || part.classList.contains("hud-xp")) return levelText;
  if (part.classList.contains("hud-streak")) return "Streak: " + plural(v.streak, "day", "days") + ". Today: " + v.today + " of " + v.goal + " XP.";
  if (part.classList.contains("hud-combo")) return "Combo " + v.combo.pips + " of 5: first-try answers in a row";
  const label = part.getAttribute("aria-label") || "";
  const arena = !!document.querySelector(".topbar .hud-timer");
  if (part.classList.contains("hud-hearts")) {
    const m = /(\d+) of (\d+)/.exec(label);
    return m ? "Hearts " + m[1] + " of " + m[2] + (arena ? " in this run" : " in this practice set") : label || null;
  }
  if (part.classList.contains("hud-timer")) {
    const t = part.textContent ? part.textContent.trim() : "";
    return "Time to par" + (t ? ": " + t : "");
  }
  return null;
}

/** the number of the last 30 days (today and 29 back) with any XP */
export function activeDays(activity: unknown, now: Date = new Date()): number {
  const days = activity && typeof activity === "object" ? (activity as { days?: unknown }).days : null;
  if (!days || typeof days !== "object") return 0;
  const two = (n: number) => (n < 10 ? "0" : "") + n;
  const d = new Date(now.getTime());
  let n = 0;
  for (let i = 0; i < 30; i++) {
    const key = d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
    if (Number((days as Record<string, unknown>)[key]) > 0) n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

let tip: HTMLElement | null = null;
let timer = 0;
let live = 0;
let current: HTMLElement | null = null;
let pop: HTMLElement | null = null;
let quiet = false;

function place(box: HTMLElement, anchor: HTMLElement, bar: HTMLElement): void {
  const a = anchor.getBoundingClientRect(), b = bar.getBoundingClientRect();
  const w = box.offsetWidth, vw = document.documentElement.clientWidth;
  const left = Math.max(8, Math.min(a.left, vw - w - 8));
  box.style.left = Math.round(left - b.left) + "px";
  box.style.top = Math.round(a.bottom - b.top + 4) + "px";
}

function hideTip(): void {
  window.clearTimeout(timer);
  window.clearInterval(live);
  live = 0;
  current = null;
  if (tip) { tip.removeAttribute("data-show"); tip.hidden = true; }
}

function showTip(part: HTMLElement): void {
  const bar = part.closest<HTMLElement>(".topbar");
  const text = tipText(part);
  if (!bar || !text || pop) return;
  if (!tip || tip.parentNode !== bar) {
    tip = el("div", "hud-tip");
    tip.setAttribute("aria-hidden", "true");
    tip.hidden = true;
    bar.appendChild(tip);
  }
  current = part;
  tip.textContent = text;
  tip.hidden = false;
  place(tip, part, bar);
  void tip.offsetWidth;
  tip.setAttribute("data-show", "true");
  /* the clock chip follows the clock; every other chip, and the popover, stay snapshots */
  if (part.classList.contains("hud-timer")) {
    live = window.setInterval(() => {
      const t = tipText(part);
      if (!t || !tip || current !== part) { hideTip(); return; }
      tip.textContent = t;
    }, 500);
  }
}

function closePop(refocus: boolean): void {
  if (!pop) return;
  const badge = document.querySelector<HTMLElement>(".topbar .hud-level");
  pop.remove();
  pop = null;
  if (badge) { badge.removeAttribute("aria-expanded"); badge.removeAttribute("aria-controls"); }
  if (refocus && badge) { quiet = true; badge.focus(); quiet = false; }
}

function openPop(badge: HTMLAnchorElement): void {
  const bar = badge.closest<HTMLElement>(".topbar");
  if (!bar) return;
  hideTip();
  const v = view();
  if (!v) return;
  const activity = read("bm.activity.v1");
  const href = badge.getAttribute("href") || "progress.html";

  const box = el("div", "hud-pop");
  box.id = "hud-pop";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-labelledby", "hud-pop-title");
  const title = el("p", "pop-title", "Level " + v.level + " · " + v.rank);
  title.id = "hud-pop-title";
  const bars = el("span", "pop-bar");
  const fill = el("i");
  fill.style.width = v.pct + "%";
  bars.appendChild(fill);
  box.append(
    title,
    el("p", "pop-line", v.into + " of " + v.span + " XP · " + (v.span - v.into) + " XP to level " + (v.level + 1)),
    bars,
    el("p", "pop-line", "Streak: " + plural(v.streak, "day", "days") + ". Today: " + v.today + " of " + v.goal + " XP."),
    el("p", "pop-line", "Active " + activeDays(activity) + " of the last 30 days")
  );
  const more = el("a", "btn pop-link", "Your progress →");
  more.setAttribute("href", href);
  box.appendChild(more);

  badge.after(box);
  pop = box;
  badge.setAttribute("aria-expanded", "true");
  badge.setAttribute("aria-haspopup", "dialog");
  badge.setAttribute("aria-controls", "hud-pop");
  place(box, badge, bar);
}

function plain(e: MouseEvent): boolean {
  return e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
}

export function mountHudPop(doc: Document = document): void {
  doc.addEventListener("mouseover", (e) => {
    const part = e.target instanceof Element ? e.target.closest<HTMLElement>(PARTS) : null;
    if (!part || part === current) return;
    hideTip();
    current = part;
    timer = window.setTimeout(() => showTip(part), DELAY);
  });
  doc.addEventListener("mouseout", (e) => {
    if (!current) return;
    const to = e.relatedTarget instanceof Node ? e.relatedTarget : null;
    if (to && current.contains(to)) return;
    hideTip();
  });
  doc.addEventListener("focusin", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (pop && t && !pop.contains(t) && !t.closest(".hud-level")) closePop(false);
    if (quiet || !t) return;
    const badge = t.closest<HTMLElement>(".topbar .hud-level");
    if (badge && !pop && badge.matches(":focus-visible")) { hideTip(); showTip(badge); }
  });
  doc.addEventListener("focusout", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (t && t.closest(".topbar .hud-level")) hideTip();
  });
  doc.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (pop) { e.preventDefault(); closePop(true); }
      hideTip();
      return;
    }
    const t = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>(".topbar .hud-level") : null;
    if (t && e.key === " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (pop) closePop(true); else openPop(t);
    }
  });
  doc.addEventListener("click", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const badge = t.closest<HTMLAnchorElement>(".topbar .hud-level");
    if (badge && plain(e)) {
      e.preventDefault();
      if (pop) closePop(false); else openPop(badge);
      return;
    }
    if (pop && !pop.contains(t) && !badge) closePop(false);
  });
}

if (typeof document !== "undefined") mountHudPop();
