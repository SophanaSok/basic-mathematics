/* The Growth tab (X-8b, docs/decisions/0015-mochi-pool.md), in the lazy `pet` chunk: the stage Mochi is at, the
   five-step path with the care points each step needs, and a 28-day care calendar. It only reads: bm.pet.v1 and
   bm.activity.v1 through the pure helpers in src/learn/pet.ts (carePoints, growthPoints, stageIndex). A day
   with care but no XP shows 0, as it counts for 0.

   Calendar rules: 28 list items, oldest first, ending today; each day is the local calendar day
   (BMSite.dayKey of the date), data-day is its YYYY-MM-DD key, data-points is 0 to 4, and the item's
   aria-label is "<Month d>: <n> care points" ("1 care point", "no care points"), the month long and in
   English whatever the page language, so the label does not depend on the machine's locale. */
import { carePoints, growthPoints, STAGES, STAGE_AT, stageIndex } from "../../learn/pet.ts";
import { LINES, STAGE_NAMES } from "./lines.ts";
import type { TabsHandle } from "./tabs.ts";

export interface GrowthCtx { alive(): boolean; /** repaint hearts, facets and decor from this record */ repaint(pet: any, now: number): void }
export interface GrowthHandle { dispose(): void; /** repaint the tab from this record (it also reads the activity store) */ refresh(pet: any, now: number): void }

export const CALENDAR_DAYS = 28;

function w(): any { return window as any; }
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function activity(): any {
  try { return w().BMStore.read(w().BMStore.keys.activity, {}) || {}; } catch { return {}; }
}
function dayKey(d: Date): string {
  try { const k = w().BMSite.dayKey(d); if (typeof k === "string") return k; } catch { /* fall back */ }
  const p = (n: number): string => (n < 10 ? "0" : "") + n;
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/** the day's aria-label: "October 3: 2 care points" */
export function dayLabel(d: Date, points: number): string {
  const name = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  return name + ": " + (points <= 0 ? "no care points" : points === 1 ? "1 care point" : points + " care points");
}
/** "a hatchling", "an adult" */
function article(name: string): string { return (/^[aeiou]/.test(name) ? "an " : "a ") + name; }

export function mountGrowth(shell: HTMLElement, ctx: GrowthCtx, tabs: TabsHandle): GrowthHandle {
  const poolPanel = shell.querySelector('.pet-panel[data-panel="pool"]') as HTMLElement;
  const panel = el("div", "pet-panel");
  panel.setAttribute("data-panel", "growth");
  const stageLine = el("p", "pet-growth-stage");
  const nextLine = el("p", "pet-growth-next");
  const path = el("ol", "pet-path");
  const steps = STAGES.map((s, i) => {
    const li = el("li");
    li.setAttribute("data-stage", s);
    li.appendChild(el("span", "pet-path-name", STAGE_NAMES[s]));
    li.appendChild(el("span", "pet-path-at", STAGE_AT[i] + " points"));
    path.appendChild(li);
    return li;
  });
  const days = el("ol", "pet-days");
  days.setAttribute("aria-label", "The last " + CALENDAR_DAYS + " days");
  const cells: HTMLLIElement[] = [];
  for (let i = 0; i < CALENDAR_DAYS; i++) {
    const li = el("li");
    li.appendChild(el("span", "visually-hidden"));
    days.appendChild(li);
    cells.push(li);
  }
  const hint = el("p", "pet-line", LINES.growthHint);
  [stageLine, nextLine, path, days, hint].forEach((n) => panel.appendChild(n));
  const panels = shell.querySelectorAll(".pet-panel");
  const lastPanel = panels[panels.length - 1] || poolPanel;
  lastPanel.parentNode!.insertBefore(panel, lastPanel.nextSibling);

  function paint(pet: any, now: number): void {
    const act = activity();
    const points = growthPoints(pet, act);
    const i = stageIndex(points, pet && pet.grew);
    stageLine.textContent = "Mochi is " + article(STAGE_NAMES[STAGES[i]].toLowerCase()) + ".";
    if (i < STAGES.length - 1) {
      nextLine.hidden = false;
      nextLine.textContent = Math.max(0, STAGE_AT[i + 1] - points) + " more good-day points to " + STAGE_NAMES[STAGES[i + 1]] + ".";
    } else {
      nextLine.hidden = false;
      nextLine.textContent = "Mochi is fully grown.";
    }
    steps.forEach((li, k) => {
      if (k === i) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
      if (k <= i) li.setAttribute("data-reached", ""); else li.removeAttribute("data-reached");
    });
    const xp = act && typeof act.days === "object" && act.days ? act.days : {};
    cells.forEach((li, k) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (CALENDAR_DAYS - 1 - k));
      const key = dayKey(d);
      const n = carePoints(pet, key, Object.prototype.hasOwnProperty.call(xp, key) ? xp[key] : undefined);
      li.setAttribute("data-day", key);
      li.setAttribute("data-points", String(n));
      const label = dayLabel(d, n);
      li.setAttribute("aria-label", label);
      (li.firstChild as HTMLElement).textContent = label;
    });
  }
  let done = false;
  tabs.add("growth", "Growth", panel, () => {
    if (done) return;
    paint(w().BMStore.read(w().BMStore.keys.pet, {}) || {}, Date.now());
  });
  return {
    dispose: () => { done = true; },
    refresh: (pet, now) => { if (!done) paint(pet, now); }
  };
}
