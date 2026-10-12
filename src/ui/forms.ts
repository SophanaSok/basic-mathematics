/* "Your form", the panel at the top of the progress page: the avatar in 3D, its name and
   what unlocks the next, the path of five forms with an Equip button on each one reached,
   and a larger view in a dialog.

     - assets/insights.js keeps one empty <div data-form> and puts it first on the page
       after every redraw; this file fills it once and updates its text in place, so the
       canvas (src/ui/form-view.ts) is never made again.
     - Which stage is reached and which is worn come from src/core/forms.ts, over the game
       store's `form` and the XP. Equip writes form.wear = { n, at } and nothing else of the
       store; `at` is always later than the one it replaces, so a choice made here wins the
       sync merge. It never writes `got` (the evolution moment, card F-6, does).
     - Without 3D (no WebGL, the list tier, a failed fetch, a lost context) the box shows a
       card with the stage number, and the page is whole. The box keeps its 4:5 shape in
       every state, so nothing moves.

   window.BMForms is a console and test handle. */

import { FORMS, LAST_FORM } from "../data/forms.ts";
import { highest, nextInfo, stageOf, worn } from "../core/forms.ts";
import { XP } from "../core/rules.ts";
import { createFormView, type FormView } from "./form-view.ts";

const WATCH = ["sync", "reset", "level", "xp", "form", "theme", "prefs"];
const SNAP_PX = 120;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}
const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");

let slot: HTMLElement | null = null;
let panel: HTMLElement | null = null;
let view: FormView | null = null;
let dialog: HTMLDialogElement | null = null;
let opener: HTMLElement | null = null;
const snaps: Record<number, string> = {};
let snapKey = "";
let themeKey = "";
let timer = 0;

function gameForm(): unknown {
  try { return window.BMGame.game().form; } catch { return undefined; }
}
function xpNow(): number {
  try {
    const x = Number(window.BMGame.info().xp);
    return isFinite(x) ? x : 0;
  } catch { return 0; }
}

/** the Part of the chapter last opened, else the first Part: the cloak's hue */
function partId(): string {
  const C = window.BM_CURRICULUM, S = window.BMStore;
  const parts: any[] = (C && C.parts) || [];
  try {
    const last = S.read(S.keys.last, null);
    const ch = last && last.id && C.chapterById ? C.chapterById(last.id) : null;
    if (ch && ch.part && ch.part.id) return String(ch.part.id);
  } catch { /* the first Part */ }
  return parts.length ? String(parts[0].id) : "";
}

function fallbackHtml(): string {
  return '<div class="form-fallback" aria-hidden="true"><b data-f="pip">1</b></div>';
}

function xpRules(): string {
  const X = (window.BMCore && window.BMCore.rules && window.BMCore.rules.XP) || XP;
  return "<ul>" +
    "<li>An answer right on the first try: " + X.first + " XP</li>" +
    "<li>Solved after a miss: " + X.solved + " XP</li>" +
    "<li>Solved with the solution open: " + X.opened + " XP</li>" +
    "<li>A Your turn check: " + X.inlineFirst + ", " + X.inline + " or " + X.inlineOpened + " XP, by the same three steps</li>" +
    "<li>A figure mission: " + X.mission + " XP</li>" +
    "<li>Arena answers: the same XP, less as the day goes on</li>" +
    "</ul>";
}

const LOCK = '<svg class="form-lock" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
  '<rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/>' +
  '<path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

function build(): HTMLElement {
  const C = window.BM_CURRICULUM;
  const probes = ((C && C.parts) || []).map((p: any) => '<i data-part="' + esc(String(p.id)) + '"></i>').join("");
  const tiles = FORMS.map((f) =>
    '<li class="form-tile" data-stage="' + f.n + '" data-state="locked">' +
      '<span class="form-pic"><img alt="" hidden><b class="form-pip" aria-hidden="true">' + f.n + "</b></span>" +
      '<b class="form-tile-name">' + esc(f.name) + "</b>" +
      '<span class="form-tile-level"></span>' +
      '<button type="button" class="btn ghost small form-equip" data-equip="' + f.n + '" aria-pressed="false" hidden>Equip</button>' +
    "</li>").join("");
  const el = document.createElement("section");
  el.className = "panel form-panel";
  el.id = "form";
  el.setAttribute("aria-labelledby", "form-h");
  el.innerHTML =
    '<div class="panel-head"><h2 id="form-h">Your form</h2><span class="muted" data-f="stage"></span></div>' +
    '<div class="form-body">' +
      '<div class="form-view">' + fallbackHtml() + "</div>" +
      '<div class="form-info">' +
        '<p class="form-name"><b data-f="name"></b> <span class="muted" data-f="tag"></span></p>' +
        '<p data-f="blurb"></p>' +
        '<p class="form-next" data-f="next"></p>' +
        '<span class="meter form-meter" data-tone="part" role="progressbar" aria-label="Progress to the next form" ' +
          'aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span style="width:0%"></span></span>' +
        '<details class="form-counts"><summary>What counts</summary>' + xpRules() + "</details>" +
        '<p><button type="button" class="btn ghost small" data-form-large>View larger</button></p>' +
      "</div>" +
    "</div>" +
    '<ol class="form-path" aria-label="The path of five forms">' + tiles + "</ol>" +
    '<span class="form-probe" aria-hidden="true">' + probes + "</span>";
  return el;
}

function q<T extends Element = HTMLElement>(sel: string, root: ParentNode = panel as HTMLElement): T | null {
  return root.querySelector<T>(sel);
}
function setText(sel: string, text: string): void {
  const el = q(sel);
  if (el && el.textContent !== text) el.textContent = text;
}

/* ------------------------------------------------------------------ update --- */

interface Now { form: unknown; xp: number; hi: number; wo: number; part: string }

function now(): Now {
  const form = gameForm(), xp = xpNow();
  return { form, xp, hi: highest(form, xp), wo: worn(form, xp), part: partId() };
}

export function refresh(): void {
  if (!panel) return;
  const { form, xp, hi, wo, part } = now();
  const nx = nextInfo(form, xp);
  const cur = stageOf(wo);
  panel.setAttribute("data-part", part);
  setText('[data-f="stage"]', "Stage " + hi + " of " + LAST_FORM);
  setText('[data-f="name"]', cur.name);
  setText('[data-f="tag"]', wo === hi ? "Equipped" : "Wearing stage " + wo);
  setText('[data-f="blurb"]', cur.blurb);
  setText('[data-f="next"]', nx.next
    ? "Next: " + nx.next.name + " at level " + nx.next.level + ", " + fmt(nx.toGo) + " XP to go"
    : "Fully evolved. Level " + nx.level + ", " + fmt(nx.xp) + " XP.");
  const meter = q('[role="progressbar"]');
  if (meter) {
    const pct = Math.round(nx.pct);
    meter.setAttribute("aria-valuenow", String(pct));
    meter.setAttribute("aria-valuetext", nx.next ? pct + "% of the way to " + nx.next.name : "Fully evolved");
    const bar = meter.firstElementChild as HTMLElement | null;
    if (bar) bar.style.width = pct + "%";
  }
  /* the fallback card (the page's and the dialog's) */
  document.querySelectorAll<HTMLElement>(".form-fallback [data-f=pip]").forEach((b) => {
    if (b.closest("#form, .form-dialog") && b.textContent !== String(wo)) b.textContent = String(wo);
  });
  if (dialog) {
    const h = dialog.querySelector(".form-dialog-title");
    if (h && h.textContent !== cur.name) h.textContent = cur.name;
  }
  FORMS.forEach((f) => {
    const li = q('.form-tile[data-stage="' + f.n + '"]');
    if (!li) return;
    const open = f.n <= hi;
    const state = f.n === wo ? "equipped" : open ? "unlocked" : "locked";
    li.setAttribute("data-state", state);
    if (f.n === hi) li.setAttribute("data-highest", ""); else li.removeAttribute("data-highest");
    li.setAttribute("aria-label", f.name + ", level " + f.level + ", " + (state === "equipped" ? "equipped" : open ? "unlocked" : "locked"));
    const lv = li.querySelector(".form-tile-level") as HTMLElement;
    if (open) lv.textContent = "Level " + f.level;
    else lv.innerHTML = LOCK + " Unlocks at level " + f.level;
    const btn = li.querySelector("button") as HTMLButtonElement;
    btn.hidden = !open;
    btn.setAttribute("aria-pressed", String(f.n === wo));
    const label = f.n === wo ? "Equipped" : "Equip";
    if (btn.textContent !== label) btn.textContent = label;
  });
  if (view) {
    view.show(wo, part);
    const tk = [document.documentElement.getAttribute("data-theme"), document.documentElement.getAttribute("data-panel"),
      window.getComputedStyle(panel).getPropertyValue("--accent")].join("|");
    if (tk !== themeKey) { themeKey = tk; view.repaint(); }
    takeSnapshots(hi, part, tk);
  }
}

/* the path's pictures: each stage reached, drawn once, again when the Part or the theme changes */
function takeSnapshots(hi: number, part: string, tk: string): void {
  if (!view || view.state !== "3d") return;
  const key = part + "|" + hi + "|" + tk;
  if (key === snapKey) return;
  snapKey = key;
  for (let n = 1; n <= LAST_FORM; n++) {
    const li = q('.form-tile[data-stage="' + n + '"]');
    const img = li && (li.querySelector("img") as HTMLImageElement | null);
    const pip = li && (li.querySelector(".form-pip") as HTMLElement | null);
    if (!img || !pip) continue;
    const url = n <= hi ? view.snapshot(n, part, SNAP_PX) : null;
    if (url) { snaps[n] = url; img.src = url; img.hidden = false; pip.hidden = true; }
    else { delete snaps[n]; img.removeAttribute("src"); img.hidden = true; pip.hidden = false; }
  }
}

function later(): void {
  if (timer) return;
  timer = window.setTimeout(() => { timer = 0; refresh(); }, 0);
}

/* ------------------------------------------------------------------- equip --- */

/** wear stage n (reached ones only): writes form.wear and nothing else, tells the bus */
export function equip(n: number): boolean {
  const S = window.BMStore;
  if (!S) return false;
  const { form, xp } = now();
  const hi = highest(form, xp);
  if (typeof n !== "number" || !isFinite(n) || n < 1 || n > hi) return false;
  const n1 = Math.floor(n);
  const key = S.keys.game;
  const raw = S.read(key, {});
  const game: Record<string, unknown> = isObj(raw) ? raw : {};
  const old: Record<string, unknown> = isObj(game.form) ? game.form : {};
  const oldAt = isObj(old.wear) && typeof old.wear.at === "number" ? old.wear.at : 0;
  game.form = { ...old, wear: { n: n1, at: Math.max(Date.now(), oldAt + 1) } };
  S.write(key, game);
  S.emit({ type: "form", highest: hi, worn: n1, fresh: [] });
  refresh();
  try { window.BMGame.announce("Equipped " + stageOf(n1).name + ".", { key: "form" }); } catch { /* a note, not needed */ }
  return true;
}

/* ------------------------------------------------------------------ dialog --- */

function buildDialog(): HTMLDialogElement {
  const d = document.createElement("dialog");
  d.className = "form-dialog";
  d.setAttribute("aria-labelledby", "form-dialog-title");
  d.innerHTML =
    '<h2 id="form-dialog-title" class="form-dialog-title" tabindex="-1"></h2>' +
    '<div class="form-dialog-box" data-state="loading">' + fallbackHtml() + "</div>" +
    '<button type="button" class="btn ghost" data-form-close>Close</button>';
  (d.querySelector("[data-form-close]") as HTMLElement).addEventListener("click", () => d.close());
  d.addEventListener("close", () => {
    if (view && panel) {
      const box = q(".form-view");
      if (box) view.moveTo(box as HTMLElement);
    }
    const back = opener;
    opener = null;
    if (back && back.isConnected) { try { back.focus({ preventScroll: true }); } catch { back.focus(); } }
  });
  document.body.appendChild(d);
  return d;
}

export function openView(): void {
  if (!panel) return;
  if (!dialog) dialog = buildDialog();
  if (dialog.open) return;
  opener = (document.activeElement as HTMLElement) || (q("[data-form-large]") as HTMLElement);
  refresh();
  dialog.showModal();
  const box = dialog.querySelector(".form-dialog-box") as HTMLElement;
  if (view) { view.moveTo(box); view.wake(); }
  const h = dialog.querySelector(".form-dialog-title") as HTMLElement;
  if (h) h.focus({ preventScroll: true });
}

/* ------------------------------------------------------------------- mount --- */

function mount(): void {
  slot = document.querySelector<HTMLElement>("[data-form]");
  if (!slot || !window.BMGame || !window.BMStore) return;
  panel = build();
  slot.appendChild(panel);
  const box = q(".form-view") as HTMLElement, probe = q(".form-probe") as HTMLElement;
  try {
    view = createFormView(box, probe, (s) => {
      if (s === "3d") later();
      else {
        const dbox = dialog && dialog.querySelector(".form-dialog-box");
        if (dbox) dbox.setAttribute("data-state", "flat");
      }
    });
  } catch { view = null; box.setAttribute("data-state", "flat"); }
  panel.addEventListener("click", (e) => {
    const t = e.target as Element | null;
    const eq = t && t.closest ? (t.closest("[data-equip]") as HTMLElement | null) : null;
    if (eq) { equip(Number(eq.getAttribute("data-equip"))); return; }
    if (t && t.closest && t.closest("[data-form-large]")) openView();
  });
  window.BMStore.on((c: { type?: string }) => { if (c && c.type && WATCH.indexOf(c.type) !== -1) later(); });
  refresh();
}

export const api = { refresh, equip, view: openView };

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.BMForms = api;
  /* after the rest of the page's modules (site.js, game.js, insights.js) have run */
  if (document.readyState === "complete") setTimeout(mount, 0);
  else window.addEventListener("load", mount);
}
