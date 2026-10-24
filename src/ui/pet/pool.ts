/* Mochi's pool (docs/decisions/0015-mochi-pool.md), the lazy `pet` chunk (bundle/pet.js).
   Only src/ui/companion.ts's openPool() imports this module, with import(), and nothing
   fetches the chunk until then. This card (X-5b) is the shell: a porthole with the 3D stage, the four
   needs as hearts, the facets line and Close. The care row is X-6; the shop, wardrobe and growth come with X-7, X-8.

   mountPool(host, { mode }) returns { close, dispose }.
     "dialog"  a <dialog class="pet-dialog"> on host: showModal(), focus on the title, Escape and Close shut it,
               focus goes back to the opener, the element is removed on close (onClose is then called once).
     "inline"  the same shell in the host, no dialog (the progress page, X-9).
   The host carries data-pet while the pool is mounted. The stage is made only where the companion would make
   one (WebGL, a tier above "list", not Study mode, no forced colors); otherwise, or when it fails, the pose
   sheet's still is the picture. Reads bm.pet.v1 and prefs; the care row (./actions.ts, X-6) is the only writer. */
import { createMochiStage } from "../../mochi/index.ts";
import type { MochiStage } from "../../mochi/index.ts";
import { NEEDS, HEARTS_MAX, START_HEARTS, heartsOf, balance } from "../../learn/pet.ts";
import type { Need } from "../../learn/pet.ts";
import { mountActions } from "./actions.ts";
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

let uid = 0;

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

/** the shell's markup: title, porthole, hearts, facets, line */
function buildShell(titleId: string, pet: any): HTMLElement {
  const now = Date.now();
  const needs = (pet && typeof pet.needs === "object" && pet.needs) || {};
  const items = NEEDS.map((n) => {
    const h = heartsOf(n, needs[n], now);
    const marks = heartMarks(h);
    return '<li data-need="' + n + '" aria-label="' + NAMES[n] + ": " + h + " of " + HEARTS_MAX + ' hearts"><span class="pet-need-name">' + NAMES[n] + "</span>" + marks + "</li>";
  }).join("");
  const facets = Math.max(0, Math.floor(balance(pet)));
  const box = document.createElement("div");
  box.className = "pet-pool";
  box.innerHTML =
    '<h2 id="' + titleId + '" class="pet-title" tabindex="-1">Mochi\'s pool</h2>' +
    '<div class="pet-porthole" data-pet-stage><div class="pet-window"><span class="companion-still"></span><span class="companion-decor"></span></div></div>' +
    '<p class="pet-line">' + LINE + "</p>" +
    '<ul class="pet-needs">' + items + "</ul>" +
    '<p class="pet-facets">You have ' + facets + " facet" + (facets === 1 ? "" : "s") + ".</p>";
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
  const shell = buildShell(id, petStore());
  let stage: MochiStage | null = null;
  let live = true;
  let dialog: HTMLDialogElement | null = null;
  let opener: HTMLElement | null = null;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "btn ghost";
  closeBtn.setAttribute("data-pet-close", "");
  closeBtn.textContent = "Close";
  shell.appendChild(closeBtn);

  host.setAttribute("data-pet", "");
  const stopActions = mountActions(shell, { stage: () => stage, alive: () => live, reduced: reducedMotion, repaint: (pet, now) => paintHearts(shell, pet, now) });

  /* the one way out: idempotent; the dialog's close event, Close, close() and dispose() all end here */
  function finish(): void {
    if (!live) return;
    live = false;
    stopActions();
    if (stage) { try { stage.dispose(); } catch { /* gone */ } stage = null; }
    host.removeAttribute("data-pet");
    const d = dialog;
    dialog = null;
    if (d) {
      if (d.open) d.close();
      if (d.parentNode) d.parentNode.removeChild(d);
    } else if (shell.parentNode) shell.parentNode.removeChild(shell);
    /* focus goes back to the opener; when that is gone (the figure was rebuilt), to the live pic */
    const back = opener && opener.isConnected ? opener : (document.querySelector(".companion-pic") as HTMLElement | null);
    opener = null;
    if (back && back.isConnected) { try { back.focus({ preventScroll: true }); } catch { back.focus(); } }
    if (opts.onClose) { try { opts.onClose(); } catch { /* the caller's */ } }
  }
  const dispose = finish;

  if (opts.mode === "dialog") {
    const d = document.createElement("dialog");
    d.className = "pet-dialog";
    d.setAttribute("aria-labelledby", id);
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
    closeBtn.addEventListener("click", finish);
    host.appendChild(shell);
  }

  startStage(shell, () => live, (s) => { if (s && !live) { try { s.dispose(); } catch { /* gone */ } return; } stage = s; });
  return { close: finish, dispose };
}
