/* Mochi's pool (docs/decisions/0015-mochi-pool.md), the lazy `pet` chunk (bundle/pet.js).
   Only src/ui/companion.ts's openPool() imports this module, with import(), and nothing
   fetches the chunk until then. This card (X-5b) is the shell: a porthole with the 3D stage, the four
   needs as hearts, the facets line and Close. The care row is X-6; the shop (X-7, ./shop.ts) is a second tab
   (absent when config shop is "off") and Growth (X-8b, ./growth.ts) a third; ./tabs.ts owns the strip.

   mountPool(host, { mode }) returns { close, dispose }.
     "dialog"  a <dialog class="pet-dialog"> on host: showModal(), focus on the title, Escape and Close shut it,
               focus goes back to the opener, the element is removed on close (onClose is then called once).
     "inline"  the same shell in the host, no dialog (the progress page, X-9).
   The host carries data-pet while the pool is mounted. The stage is made only where the companion would make
   one (WebGL, a tier above "list", not Study mode, no forced colors); otherwise, or when it fails, the pose
   sheet's still is the picture. Reads bm.pet.v1 and prefs; the care row (./actions.ts) and the shop (./shop.ts) are the only writers.
   Decor Mochi has out (wear.decor, owned decor only) is drawn as span.companion-decor[data-decor] layers under
   the stage in the window, their image set from JS (a url() in CSS would be rewritten by the build). */
import { createMochiStage } from "../../mochi/index.ts";
import type { MochiStage } from "../../mochi/index.ts";
import { NEEDS, HEARTS_MAX, heartsOf, balance, placedDecor, growPet, growthPoints, stageOf, STAGE_LOOK } from "../../learn/pet.ts";
import type { Need, Stage } from "../../learn/pet.ts";
import { mountActions, isStale } from "./actions.ts";
import { grewLine, lineFor } from "./lines.ts";
import { mountShop } from "./shop.ts";
import { mountGrowth } from "./growth.ts";
import { mountTabs } from "./tabs.ts";
import { DECOR_SIZE, itemOf } from "../../data/pet-items.ts";
import { MOODS } from "../../learn/mood.ts";
import { detectTier, readProbe, pixelRatio, TIERS } from "../../world/tiers.ts";

export interface PoolHandle { close(): void; dispose(): void }
export interface PoolOptions { mode: "dialog" | "inline"; onClose?: () => void; /** where focus returns on close (else the element focused at open, else .companion-pic) */ opener?: HTMLElement | null }

const NAMES: Record<Need, string> = { tummy: "Tummy", play: "Play", clean: "Clean", spark: "Spark" };
const LINE = "Mochi is glad to see you.";

function w(): any { return window as any; }
function root(): string { try { return String(w().BMSite.rootPrefix()); } catch { return ""; } }
function prefs(): any { try { return w().BMGame.prefs() || {}; } catch { return {}; } }
function calm(): boolean { return document.documentElement.hasAttribute("data-calm") || prefs().calm === true; }
function reducedMotion(): boolean {
  try { if (w().BMFx && typeof w().BMFx.still === "function") return !!w().BMFx.still(); } catch { /* fall back */ }
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}
function petStore(): unknown {
  try { return w().BMStore.read(w().BMStore.keys.pet, {}) || {}; } catch { return {}; }
}

function activityStore(): unknown {
  try { return w().BMStore.read(w().BMStore.keys.activity, {}) || {}; } catch { return {}; }
}

/** the growth moments this device has already shown (bm.run.v1.seen.grew) */
function seenGrew(): Record<string, unknown> {
  try { const g = w().BMGame.run().seen.grew; return g && typeof g === "object" ? g : {}; } catch { return {}; }
}
function markSeen(stages: Stage[]): void {
  try { w().BMGame.updateRun((r: any) => { const g: Record<string, 1> = { ...(r.seen.grew || {}) }; stages.forEach((s) => { g[s] = 1; }); r.seen.grew = g; }); } catch { /* a note */ }
}
function announce(text: string): void {
  try { w().BMGame.announce(text, { key: "pet-grew" }); } catch { /* no live region */ }
}

/** Growth, stamped: any stage the care points now reach and `grew` lacks is written (one write, one bus
    event per stage) unless another tab chose another learner. Returns the record to paint and the stages
    this call stamped; a refused write stamps nothing. */
function grow(pet: unknown): { pet: any; fresh: Stage[] } {
  const g = growPet(pet, activityStore(), Date.now());
  if (!g.grown.length || isStale()) return { pet, fresh: [] };
  try { if (w().BMStore.write(w().BMStore.keys.pet, g.pet) === false) return { pet, fresh: [] }; } catch { return { pet, fresh: [] }; }
  g.grown.forEach((s) => { try { w().BMStore.emit({ type: "pet", what: "grew", id: s }); } catch { /* no bus */ } });
  return { pet: g.pet, fresh: g.grown };
}

let uid = 0;
/* one bus listener for the page; it repaints every pool that is open (the dialog may stand over the inline one) */
const hooks = new Set<() => void>();
let listening = false;
function listen(): void {
  if (listening) return;
  listening = true;
  try { w().BMStore.on((c: any) => { if (c && (c.type === "pet" || c.type === "sync") && hooks.size) Array.from(hooks).forEach((f) => { try { f(); } catch { /* one pool's */ } }); }); } catch { /* no bus */ }
}

function heartMarks(h: number): string {
  let marks = "";
  for (let i = 0; i < HEARTS_MAX; i++) marks += "<i" + (i < h ? " data-on" : "") + "></i>";
  return marks;
}

/** the hearts and the facets line again, from this record */
function paintHearts(shell: HTMLElement, pet: any, now: number): void {
  const needs = (pet && typeof pet.needs === "object" && pet.needs) || {};
  NEEDS.forEach((n) => {
    const li = shell.querySelector('li[data-need="' + n + '"]');
    if (!li) return;
    const h = heartsOf(n, needs[n], now);
    li.setAttribute("aria-label", NAMES[n] + ": " + h + " of " + HEARTS_MAX + " hearts");
    li.innerHTML = '<span class="pet-need-name">' + NAMES[n] + "</span>" + heartMarks(h);
  });
}

function shopWanted(): boolean {
  try {
    const cfg = w().BMCore?.config?.readConfig(w().BM_CONFIG);
    if (cfg && cfg.shop === "off") return false;
  } catch { /* an absent field is on */ }
  return true;
}

function facetsText(pet: any): string {
  const n = Math.max(0, Math.floor(balance(pet)));
  return "You have " + n + " facet" + (n === 1 ? "" : "s") + ".";
}
/** every facets line (the pool's and the shop's) again, from this record */
function paintFacets(shell: HTMLElement, pet: any): void {
  shell.querySelectorAll(".pet-facets").forEach((el) => { el.textContent = facetsText(pet); });
}

/** the decor Mochi has out: one layer per placed id that is owned decor in the catalogue, left to right as
    placed; each is under the still and the stage, sized and set from the catalogue, never from the record */
function paintDecor(shell: HTMLElement, pet: any): void {
  const win = shell.querySelector(".pet-window") as HTMLElement | null;
  if (!win) return;
  /* rebuilt only when the placed list (as drawn) changed */
  const owned0 = (pet && typeof pet.owned === "object" && pet.owned) || {};
  const sig = placedDecor(pet).filter((id) => { const it = itemOf(id); return !!it && it.kind === "decor" && typeof owned0[id] === "string"; }).join(",");
  if (win.getAttribute("data-decor-sig") === sig) return;
  win.setAttribute("data-decor-sig", sig);
  win.querySelectorAll(".companion-decor").forEach((el) => el.remove());
  const owned = (pet && typeof pet.owned === "object" && pet.owned) || {};
  const before = win.querySelector(".companion-still");
  placedDecor(pet).forEach((id) => {
    const item = itemOf(id);
    if (!item || item.kind !== "decor" || typeof owned[id] !== "string" || item.cell === undefined || !item.pos) return;
    const span = document.createElement("span");
    span.className = "companion-decor";
    span.setAttribute("data-decor", id);
    span.style.backgroundImage = 'url("' + root() + "models/mochi/decor.png" + '")';
    span.style.backgroundPosition = (item.cell * 100 / 7) + "% 0";
    span.style.width = span.style.height = DECOR_SIZE + "%";
    span.style.left = item.pos.x + "%";
    span.style.bottom = item.pos.y + "%";
    win.insertBefore(span, before);
  });
}

/** the shell's markup: title, tabs, the pool panel (porthole, line, hearts, facets) and the shop panel */
function buildShell(titleId: string, pet: any): HTMLElement {
  const now = Date.now();
  const needs = (pet && typeof pet.needs === "object" && pet.needs) || {};
  const items = NEEDS.map((n) => {
    const h = heartsOf(n, needs[n], now);
    const marks = heartMarks(h);
    return '<li data-need="' + n + '" aria-label="' + NAMES[n] + ": " + h + " of " + HEARTS_MAX + ' hearts"><span class="pet-need-name">' + NAMES[n] + "</span>" + marks + "</li>";
  }).join("");
  const box = document.createElement("div");
  box.className = "pet-pool";
  box.innerHTML =
    '<h2 id="' + titleId + '" class="pet-title" tabindex="-1">Mochi\'s pool</h2>' +
    '<div class="pet-porthole" data-pet-stage><div class="pet-window"><span class="companion-still"></span></div></div>' +
    '<p class="pet-line" tabindex="-1">' + LINE + "</p>" +
    '<ul class="pet-needs">' + items + "</ul>" +
    '<p class="pet-facets">' + facetsText(pet) + "</p>";
  /* the pool panel holds all of it; the tab strip and the shop panel come with the shop */
  const panel = document.createElement("div");
  panel.className = "pet-panel";
  panel.setAttribute("data-panel", "pool");
  while (box.childNodes.length > 1) panel.appendChild(box.childNodes[1]);
  box.appendChild(panel);
  paintDecor(box, pet);
  return box;
}

/** the stage in the porthole's window, with the still sheet under it and as the fail-over */
function startStage(shell: HTMLElement, alive: () => boolean, hold: (s: MochiStage | null) => void): void {
  const porthole = shell.querySelector(".pet-porthole") as HTMLElement;
  const win = shell.querySelector(".pet-window") as HTMLElement;
  const still = shell.querySelector(".companion-still") as HTMLElement;
  const v = prefs().mochi === "lilac" ? "lilac" : "pink";
  win.style.backgroundImage = 'url("' + root() + "models/mochi/water.png" + '")';
  still.style.backgroundImage = 'url("' + root() + "models/mochi/mochi-" + v + '-poses.webp")';
  still.style.backgroundSize = "900% 100%";
  still.style.backgroundPosition = (MOODS.indexOf("idle") * 100 / 8) + "% 0";
  let frame = 0;
  const B = w().BM3D;
  try {
    if (!B || typeof B.supported !== "function" || !B.supported()) return;
    if (calm() || (window.matchMedia && window.matchMedia("(forced-colors: active)").matches)) return;
    const p = prefs();
    const tier = detectTier(readProbe(B), p.map ? p : { ...p, map: "3d" }).tier;
    if (tier === "list") return;
    const budget = TIERS[tier];
    let gone = false, held: MochiStage | null = null;
    /* the fail-over, also for a stage lost after it was up: the stage is disposed here, not only dropped */
    const fail = (): void => {
      if (gone) return;
      gone = true;
      if (held) { try { held.dispose(); } catch { /* gone */ } held = null; }
      porthole.removeAttribute("data-3d");
      still.style.backgroundImage = 'url("' + root() + "models/mochi/mochi-" + v + '-poses.webp")';
      win.style.backgroundPosition = "0% 0";
      hold(null);
    };
    createMochiStage(win, {
      url: root() + "models/mochi/mochi-" + v + ".glb", budget,
      pixelRatio: (cw, ch) => pixelRatio(budget, window.devicePixelRatio || 1, cw, ch),
      still: reducedMotion,
      tick: (t) => {
        const i = Math.floor(t / 300) % 8;
        if (i === frame) return;
        frame = i; win.style.backgroundPosition = (i * 100 / 7) + "% 0";
      },
      onState: (state) => { if (alive() && (state === "failed" || state === "lost")) fail(); }
    }).then((st) => {
      if (!alive() || gone) { try { st.dispose(); } catch { /* gone */ } return; }
      held = st;
      hold(st);
      try { st.setMood("idle"); } catch { /* the still stays */ }
      porthole.setAttribute("data-3d", "");
      window.setTimeout(() => { if (alive() && !gone) still.style.backgroundImage = "none"; }, 450);
    }, () => { if (alive()) fail(); });
  } catch { /* the still stays */ }
}

export function mountPool(host: Element, opts: PoolOptions): PoolHandle {
  const id = "pet-title-" + (++uid);
  const g0 = grow(petStore());
  const pet0 = g0.pet;
  const shell = buildShell(id, pet0);
  let stage: MochiStage | null = null;
  let live = true;
  let dialog: HTMLDialogElement | null = null;
  let opener: HTMLElement | null = null;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "btn ghost";
  closeBtn.setAttribute("data-pet-close", "");
  closeBtn.textContent = "Close";

  host.setAttribute("data-pet", "");
  let actions: ReturnType<typeof mountActions> | null = null;
  const porthole = shell.querySelector(".pet-porthole") as HTMLElement;
  /* the stage's look follows the stage Mochi is at: the attribute always, the figure once it is up */
  let shownStage: Stage | null = null, lastPet: any = pet0, momentStage: Stage | null = null;
  const applyLook = (pet: any, force?: boolean): void => {
    const st = stageOf(growthPoints(pet, activityStore()), pet && pet.grew);
    if (!force && st === shownStage) return;
    shownStage = st;
    porthole.setAttribute("data-pet-stage", st);
    if (stage) {
      try { stage.setGrowth(STAGE_LOOK[st]); porthole.setAttribute("data-pet-scale", String(stage.info().growth.scale)); } catch { /* gone */ }
    } else porthole.removeAttribute("data-pet-scale");
  };
  /* the one-time moment: only for a stage stamped just now that this device has not shown */
  const onGrown = (fresh: Stage[]): void => {
    const seen = seenGrew(), unseen = fresh.filter((s) => seen[s] !== 1);
    if (!unseen.length || !actions) return;
    const top = unseen[unseen.length - 1];
    markSeen(unseen);
    momentStage = stage ? null : top;
    actions.moment(top);
    announce(grewLine(top));
  };
  /* one repaint for every writer: hearts, facets, decor and the buttons that depend on them */
  const repaint = (pet: any, now: number): void => {
    const g = grow(pet);
    pet = g.pet;
    lastPet = pet;
    applyLook(pet);
    paintHearts(shell, pet, now);
    paintFacets(shell, pet);
    paintDecor(shell, pet);
    if (actions) actions.refresh(pet, now);
    if (g.fresh.length) onGrown(g.fresh);
  };
  actions = mountActions(shell, { stage: () => stage, alive: () => live, reduced: reducedMotion, shop: shopWanted, repaint });
  applyLook(pet0, true);
  /* the tabs: Pool first (its first show sets the idle line), the shop when wanted, then Growth */
  const tabs = mountTabs(shell, id);
  tabs.add("pool", "Pool", shell.querySelector('.pet-panel[data-panel="pool"]') as HTMLElement, () => {
    const l = shell.querySelector('.pet-panel[data-panel="pool"] .pet-line');
    if (l) l.textContent = lineFor(petStore(), Date.now());
    repaint(petStore(), Date.now());
  });
  const shop = shopWanted() ? mountShop(shell, { alive: () => live, repaint }, tabs) : null;
  const growth = mountGrowth(shell, { alive: () => live, repaint }, tabs);
  /* a sync or a write from another tab can change the balance under an open dialog; assigned once every
     handle it touches exists, and cleared only if it is still this pool's */
  const mine = (): void => { if (!live) return; const pet = petStore(), now = Date.now(); repaint(pet, now); if (shop) shop.refresh(pet, now); growth.refresh(pet, now); };
  hooks.add(mine);
  listen();
  /* after the tabs' mount, which sets the pool tab's idle line */
  onGrown(g0.fresh);

  /* the one way out: idempotent; the dialog's close event, Close, close() and dispose() all end here */
  function finish(): void {
    if (!live) return;
    live = false;
    hooks.delete(mine);
    if (actions) actions.dispose();
    if (shop) shop.dispose();
    growth.dispose();
    if (stage) { try { stage.dispose(); } catch { /* gone */ } stage = null; }
    host.removeAttribute("data-pet");
    const d = dialog;
    dialog = null;
    if (d) {
      if (d.open) d.close();
      if (d.parentNode) d.parentNode.removeChild(d);
    } else if (shell.parentNode) shell.parentNode.removeChild(shell);
    /* focus goes back to the opener; when that is gone (the figure was rebuilt), to the live pic; an inline pool never took focus */
    if (d) {
      const back = opener && opener.isConnected ? opener : (document.querySelector(".companion-pic") as HTMLElement | null);
      opener = null;
      if (back && back.isConnected) { try { back.focus({ preventScroll: true }); } catch { back.focus(); } }
    }
    if (opts.onClose) { try { opts.onClose(); } catch { /* the caller's */ } }
  }
  const dispose = finish;

  if (opts.mode === "dialog") {
    const d = document.createElement("dialog");
    d.className = "pet-dialog";
    d.setAttribute("aria-labelledby", id);
    shell.appendChild(closeBtn);
    d.appendChild(shell);
    closeBtn.addEventListener("click", finish);
    d.addEventListener("close", finish);
    dialog = d;
    /* Safari and Firefox on macOS do not focus a clicked button, so the caller names the opener */
    opener = opts.opener || (document.activeElement as HTMLElement) || null;
    document.body.appendChild(d);
    try {
      d.showModal();
    } catch {
      finish();   /* no dialog support, or a modal already open: nothing is left behind */
      return { close: finish, dispose };
    }
    (shell.querySelector(".pet-title") as HTMLElement).focus({ preventScroll: true });
  } else {
    host.appendChild(shell);
  }

  startStage(shell, () => live, (s) => {
    if (s && !live) { try { s.dispose(); } catch { /* gone */ } return; }
    stage = s;
    if (s) {
      applyLook(lastPet, true);
      /* the stage came up after the moment began: the clip plays now, the line is already set */
      if (momentStage && actions) { actions.moment(momentStage, true); }
      momentStage = null;
    } else applyLook(lastPet, true);
  });
  return { close: finish, dispose };
}
