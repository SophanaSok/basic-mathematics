/* "Your form", the panel at the top of the progress page: the avatar in 3D, its name and
   what unlocks the next, the path of five forms with an Equip button on each one reached,
   and a larger view in a dialog.

     - assets/insights.js keeps one empty <div data-form> and puts it once above the dashboard
       (it is never moved); this file fills it once and updates its text in place, so the
       canvas (src/ui/form-view.ts) is never made again.
     - Which stage is reached and which is worn come from src/core/forms.ts, over the game
       store's `form` and the XP. Equip writes form.wear = { n, at } and nothing else of the
       store; `at` is always later than the one it replaces, so a choice made here wins the
       sync merge. It never writes `got` (src/ui/form-unlock.ts does).
     - The evolution moment: when the highest stage is past run.seen.evolved, the panel plays
       one sequence (anticipate 700 ms, flash 500, reveal 700, then a caption with Done), its
       step in data-form-seq on the panel. Skip, or Escape in the first three steps, goes to
       the caption; under BMFx.still() it is a cut. Nothing is modal. The caption step sets
       run.seen.evolved, so a reload plays nothing.
     - Without 3D (no WebGL, the list tier, a failed fetch, a lost context) the box shows a
       card with the stage number, and the page is whole. The box keeps its 4:5 shape in
       every state, so nothing moves.

   window.BMForms is a console and test handle. */

import { FORMS, LAST_FORM } from "../data/forms.ts";
import { highest, nextInfo, stageOf, worn } from "../core/forms.ts";
import { XP } from "../core/rules.ts";
import { createFormView, type FormView } from "./form-view.ts";
import { mountEmotes } from "./form-emotes.ts";
import { modelFor } from "../data/form-models.ts";

const WATCH = ["sync", "reset", "level", "xp", "form", "theme", "prefs"];
/* 2100-01-01 in ms: the latest `at` of a stored wear that is believed */
const MAX_AT = 4102444800000;

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
let emoteRow: HTMLElement | null = null;
let dialog: HTMLDialogElement | null = null;
let opener: HTMLElement | null = null;
let themeKey = "";
let timer = 0;

interface Seq { from: number; hi: number; swapped: boolean; step: string; timers: number[]; multi: number[] }
let seq: Seq | null = null;
/* the stage whose evolution this page played, kept here as well as in run.seen.evolved, so
   a storage that cannot be written (a full quota) does not replay it after Done */
let played = 0;

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

/* the strip's picture of a stage: the rendered thumbnail the manifest names, under the site's root */
function thumbSrc(n: number): string {
  const m = modelFor(n);
  let root = "";
  try { root = String(window.BMSite.rootPrefix()); } catch { /* a page without the site helper */ }
  return root + (m ? m.thumb : "models/forms/form-" + n + ".png");
}

function build(): HTMLElement {
  const C = window.BM_CURRICULUM;
  const probes = ((C && C.parts) || []).map((p: any) => '<i data-part="' + esc(String(p.id)) + '"></i>').join("");
  const tiles = FORMS.map((f) =>
    '<li class="form-tile" data-stage="' + f.n + '" data-state="locked">' +
      '<span class="form-pic"><img alt="" src="' + esc(thumbSrc(f.n)) + '" width="120" height="150" loading="lazy" decoding="async">' +
        '<b class="form-pip" aria-hidden="true" hidden>' + f.n + "</b></span>" +
      '<b class="form-tile-name">' + esc(f.name) + "</b>" +
      '<span class="form-tile-level"></span>' +
      '<span class="form-tile-tag"></span>' +
      '<button type="button" class="btn ghost small form-equip" data-equip="' + f.n + '" aria-pressed="false" hidden>Equip</button>' +
    "</li>").join("");
  const el = document.createElement("section");
  el.className = "panel form-panel";
  el.id = "form";
  el.setAttribute("aria-labelledby", "form-h");
  el.innerHTML =
    '<div class="panel-head"><h2 id="form-h">Your form</h2><span class="muted" data-f="stage"></span></div>' +
    '<div class="form-body">' +
      '<div class="form-left"><div class="form-view" data-form-view>' + fallbackHtml() + "</div>" +
        '<div data-form-emotes></div></div>' +
      '<div class="form-info">' +
        '<p class="form-name"><b data-f="name"></b> <span class="muted" data-f="tag"></span></p>' +
        '<p data-f="blurb"></p>' +
        '<p class="form-next" data-f="next"></p>' +
        '<div class="form-seq" data-form-seq-box></div>' +
        '<span class="meter form-meter" data-tone="part" role="progressbar" aria-label="Progress to the next form" ' +
          'aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span style="width:0%"></span></span>' +
        '<details class="form-counts"><summary>What counts</summary>' + xpRules() + "</details>" +
        '<p><button type="button" class="btn ghost small" data-form-large>View larger</button></p>' +
      "</div>" +
    "</div>" +
    '<ol class="form-path" aria-label="The path of five forms">' + tiles + "</ol>" +
    '<span class="form-probe" aria-hidden="true">' + probes + "</span>";
  /* an image that fails (a missing file) gives its tile back the numbered pip; error does not bubble, so capture */
  el.addEventListener("error", (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.closest(".form-pic")) return;
    const pip = img.parentElement && img.parentElement.querySelector<HTMLElement>(".form-pip");
    img.hidden = true;
    if (pip) pip.hidden = false;
  }, true);
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
  maybeEvolve(hi, wo);
  /* until the flash swaps it, the view keeps the form shown before the evolution; from the
     swap to Done it shows the new form, whatever is worn, so the caption and the figure agree */
  const shownN = seq ? (seq.swapped ? seq.hi : seq.from) : wo;
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
    if (b.closest("#form, .form-dialog") && b.textContent !== String(shownN)) b.textContent = String(shownN);
  });
  if (dialog) {
    dialog.setAttribute("data-part", part);
    const h = dialog.querySelector(".form-dialog-title");
    if (h && h.textContent !== cur.name) h.textContent = cur.name;
  }
  FORMS.forEach((f) => {
    const li = q('.form-tile[data-stage="' + f.n + '"]');
    if (!li) return;
    const open = f.n <= hi;
    const state = f.n === wo ? "equipped" : open ? "unlocked" : "locked";
    li.setAttribute("data-state", state);
    if (open) li.removeAttribute("data-locked"); else li.setAttribute("data-locked", "");
    if (f.n === hi) li.setAttribute("data-highest", ""); else li.removeAttribute("data-highest");
    li.setAttribute("aria-label", f.name + ", level " + f.level + ", " + (state === "equipped" ? "equipped" : open ? "unlocked" : "locked"));
    const lv = li.querySelector(".form-tile-level") as HTMLElement;
    if (open) lv.textContent = "Level " + f.level;
    else lv.innerHTML = LOCK + " Unlocks at level " + f.level;
    const tag = li.querySelector(".form-tile-tag") as HTMLElement;
    const tagText = f.n === wo && f.n === hi ? "Equipped \u00b7 Highest" : f.n === wo ? "Equipped" : f.n === hi ? "Highest" : "";
    if (tag.textContent !== tagText) tag.textContent = tagText;
    const btn = li.querySelector("button") as HTMLButtonElement;
    btn.hidden = !open;
    btn.setAttribute("aria-pressed", String(f.n === wo));
    const label = f.n === wo ? "Equipped" : "Equip";
    if (btn.textContent !== label) btn.textContent = label;
    const aria = (f.n === wo ? "Equipped: " : "Equip ") + f.name;
    if (btn.getAttribute("aria-label") !== aria) btn.setAttribute("aria-label", aria);
  });
  if (view) {
    view.label(cur.name + ", your form, stage " + wo + " of " + LAST_FORM + ". Use the arrow keys to turn it.");
    view.show(shownN, part);
    const tk = [document.documentElement.getAttribute("data-theme"), document.documentElement.getAttribute("data-panel"),
      window.getComputedStyle(panel).getPropertyValue("--accent")].join("|");
    if (tk !== themeKey) { themeKey = tk; view.repaint(); }
  }
}


/* ------------------------------------------------------------ evolution moment --- */

const T_ANTICIPATE = 700, T_FLASH = 500, T_REVEAL = 700;

function num(v: unknown): number { return typeof v === "number" && isFinite(v) ? v : 0; }
function stillNow(): boolean {
  try { return !!(window.BMFx && window.BMFx.still && window.BMFx.still()); } catch { return false; }
}
function evolvedNow(): unknown {
  try { return window.BMGame.run().seen.evolved; } catch { return undefined; }
}
function box(): HTMLElement | null { return panel ? q(".form-view") : null; }
/* the step on the panel, and a log of the steps passed, so a test can read the whole path
   rather than sample it */
function setStep(step: string): void {
  if (!panel) return;
  panel.setAttribute("data-form-seq", step);
  panel.setAttribute("data-form-seq-log", ((panel.getAttribute("data-form-seq-log") || "") + " " + step).trim());
}
function seqHost(): HTMLElement | null { return panel ? q("[data-form-seq-box]") : null; }

function maybeEvolve(hi: number, wo: number): void {
  if (!panel || seq) return;
  const ev = evolvedNow();
  if (typeof ev !== "number" || hi <= Math.max(ev, played)) return;
  const from = Math.max(1, Math.min(wo, ev));
  /* every stage past the last one played: "Stage 3", or "Stages 2 and 3", "Stages 2 to 4" */
  const multi: number[] = [];
  for (let n = ev + 1; n <= hi; n++) multi.push(n);
  seq = { from, hi, swapped: false, step: "anticipate", timers: [], multi };
  if (stillNow()) { caption(); return; }
  setStep("anticipate");
  const b = box();
  if (b) b.classList.add("is-anticipating");
  if (view) { view.wake(); view.preload(seq.hi); }
  const host = seqHost();
  if (host) host.innerHTML = '<button type="button" class="btn ghost small" data-form-skip>Skip</button>';
  document.addEventListener("keydown", onKey);
  seq.timers.push(window.setTimeout(flash, T_ANTICIPATE));
}

function swap(): void {
  if (!seq || seq.swapped) return;
  seq.swapped = true;
  if (view) view.show(seq.hi, partId());
  document.querySelectorAll<HTMLElement>(".form-fallback [data-f=pip]").forEach((b) => {
    if (b.closest("#form, .form-dialog")) b.textContent = String(seq!.hi);
  });
}

function flash(): void {
  if (!seq || !panel) return;
  seq.step = "flash";
  setStep("flash");
  const b = box();
  if (b) {
    b.classList.remove("is-anticipating");
    const f = document.createElement("span");
    f.className = "form-flash";
    f.setAttribute("aria-hidden", "true");
    b.appendChild(f);
  }
  seq.timers.push(window.setTimeout(swap, T_FLASH / 2));
  seq.timers.push(window.setTimeout(reveal, T_FLASH));
}

function reveal(): void {
  if (!seq || !panel) return;
  swap();
  seq.step = "reveal";
  setStep("reveal");
  const b = box();
  if (b) {
    b.querySelectorAll(".form-flash").forEach((e) => e.remove());
    b.classList.add("is-revealing");
    try { window.BMFx.burst(b); } catch { /* the sequence goes on without it */ }
  }
  try { if (window.BMSfx && window.BMSfx.enabled()) window.BMSfx.play("level-up"); } catch { /* no sound */ }
  seq.timers.push(window.setTimeout(caption, T_REVEAL));
}

function stagesText(s: Seq): string {
  const name = stageOf(s.hi).name;
  const st = s.multi;
  if (st.length < 2) return "Evolved: " + name + ". Stage " + s.hi + " of " + LAST_FORM + " unlocked.";
  const list = st.length === 2 ? st[0] + " and " + st[1] : st[0] + " to " + st[st.length - 1];
  return "Evolved: " + name + ". Stages " + list + " unlocked.";
}

function caption(): void {
  if (!seq || !panel) return;
  const s = seq;
  s.timers.forEach((t) => window.clearTimeout(t));
  s.timers = [];
  document.removeEventListener("keydown", onKey);
  const b = box();
  if (b) {
    b.classList.remove("is-anticipating", "is-revealing");
    b.querySelectorAll(".form-flash").forEach((e) => e.remove());
  }
  swap();
  s.step = "done";
  setStep("done");
  played = Math.max(played, s.hi);
  const host = seqHost();
  if (host) {
    host.innerHTML = '<p class="form-caption" role="status"></p>' +
      '<button type="button" class="btn small" data-form-done>Done</button>';
    (host.querySelector(".form-caption") as HTMLElement).textContent = stagesText(s);
  }
  try {
    window.BMGame.updateRun((r: { seen: Record<string, unknown> }) => { r.seen.evolved = Math.max(num(r.seen.evolved), s.hi); });
  } catch { /* the sequence just plays again next time */ }
  refresh();
}

/* the sequence taken down without a word: timers, the key listener, the classes, the step */
function clear(): void {
  if (!seq || !panel) return;
  seq.timers.forEach((t) => window.clearTimeout(t));
  document.removeEventListener("keydown", onKey);
  seq = null;
  panel.removeAttribute("data-form-seq");
  panel.removeAttribute("data-form-seq-log");
  const b = box();
  if (b) { b.classList.remove("is-anticipating", "is-revealing"); b.querySelectorAll(".form-flash").forEach((e) => e.remove()); }
  const host = seqHost();
  if (host) host.innerHTML = "";
}
function dismiss(): void {
  if (!seq || !panel) return;
  clear();
  refresh();
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== "Escape" || !seq || seq.step === "done") return;
  /* an open dialog (the larger view, the palette, the settings sheet) owns Escape */
  if (e.defaultPrevented || document.querySelector("dialog[open]")) return;
  caption();
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
  const wo = worn(form, xp);
  const key = S.keys.game;
  const raw = S.read(key, {});
  const game: Record<string, unknown> = isObj(raw) ? raw : {};
  const old: Record<string, unknown> = isObj(game.form) ? game.form : {};
  if (n1 === wo) return true;
  /* The old `at` comes from storage (or a sync), so it is read as a number and bounded:
     a value past the year 2100 is damaged or hostile and counts as 0, else one such
     value would make every later choice on this account sit beyond reach of the clock. */
  const rawAt = isObj(old.wear) ? Number(old.wear.at) : 0;
  const oldAt = isFinite(rawAt) && rawAt > 0 ? Math.min(rawAt, MAX_AT) : 0;
  const at = Math.max(Date.now(), oldAt + 1);
  game.form = { ...old, wear: { n: n1, at } };
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
      if (box) view.moveTo(box as HTMLElement, { zoom: false });
      /* the one row of emote buttons goes home with the view */
      const home = q("[data-form-emotes]");
      if (home && emoteRow) home.appendChild(emoteRow);
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
  if (view) {
    view.moveTo(box, { zoom: true });
    if (emoteRow) box.insertAdjacentElement("afterend", emoteRow);
    view.wake();
  }
  const h = dialog.querySelector(".form-dialog-title") as HTMLElement;
  if (h) h.focus({ preventScroll: true });
}

/* ------------------------------------------------------------------- mount --- */

let mounted = false;
function mount(): void {
  if (mounted) return;
  mounted = true;
  slot = document.querySelector<HTMLElement>("[data-form]");
  if (!slot || !window.BMGame || !window.BMStore) return;
  panel = build();
  slot.appendChild(panel);
  const box = q(".form-view") as HTMLElement, probe = q(".form-probe") as HTMLElement;
  const host = q("[data-form-emotes]") as HTMLElement;
  const row = mountEmotes(host, (e) => { if (view) view.play(e); });
  emoteRow = host.querySelector<HTMLElement>(".form-emotes");
  try {
    view = createFormView(box, probe, (s) => {
      if (s === "3d") later();
      else {
        const dbox = dialog && dialog.querySelector(".form-dialog-box");
        if (dbox) dbox.setAttribute("data-state", "flat");
      }
    }, { set: row.set, enable: row.enable, show: (on) => { if (emoteRow) emoteRow.hidden = !on; } });
  } catch { view = null; box.setAttribute("data-state", "flat"); }
  panel.addEventListener("click", (e) => {
    const t = e.target as Element | null;
    const eq = t && t.closest ? (t.closest("[data-equip]") as HTMLElement | null) : null;
    if (eq) { equip(Number(eq.getAttribute("data-equip"))); return; }
    if (t && t.closest && t.closest("[data-form-skip]")) { caption(); return; }
    if (t && t.closest && t.closest("[data-form-done]")) { dismiss(); return; }
    if (t && t.closest && t.closest("[data-form-large]")) openView();
  });
  window.BMStore.on((c: { type?: string }) => {
    if (!c || !c.type) return;
    /* a reset mid-sequence: the progress it celebrated is gone, so it goes without a word */
    if (c.type === "reset" && seq) clear();
    if (WATCH.indexOf(c.type) !== -1) later();
  });
  /* leaving mid-sequence leaves it owed: nothing is written, and a page restored from the
     back/forward cache (pageshow) refreshes and plays it again from the start */
  window.addEventListener("pagehide", () => {
    if (seq && seq.step !== "done") clear();
    if (timer) window.clearTimeout(timer);
  });
  window.addEventListener("pageshow", (e) => { if (e.persisted) later(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) later(); });
  refresh();
}

/** what the view reports, for tests and the console (null without a view) */
export function info(): (ReturnType<FormView["info"]> & { strip: Array<{ n: number; src: string; locked: boolean }> }) | null {
  if (!view) return null;
  const strip = FORMS.map((f) => {
    const li = q('.form-tile[data-stage="' + f.n + '"]');
    const img = li && (li.querySelector("img") as HTMLImageElement | null);
    return { n: f.n, src: img ? img.getAttribute("src") || "" : "", locked: !!li && li.hasAttribute("data-locked") };
  });
  return Object.assign({}, view.info(), { strip });
}

export const api = { refresh, equip, view: openView, info };

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.BMForms = api;
  /* at once: the slot is drawn synchronously by assets/insights.js, which the entry
     imports earlier, so the panel is there with the first paint and moves nothing */
  mount();
}
