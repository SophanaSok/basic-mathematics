/* The contents page's view control: List or Map. Two radios in a radiogroup under the
   Continue button, filling [data-hub-mode] (index.html; empty without JS).

     - The mode is the existing preference (assets/game.js map3dOn): Map is the course
       world, List is the same course as a list. Choosing writes it with setPref("map",
       "3d" | "list"); assets/map3d.js already boots or tears the world down on the prefs
       event, so nothing else switches the view.
     - Where the device cannot draw the map (no WebGL 2, Save-Data, ?3d=off) or the world
       gave up (its chunks failed, an error), Map is aria-disabled with the reason in
       plain words and List reads checked for the visit; the preference is not written.
     - The control is read again on the bus events (prefs, reset, sync), on the window's
       load and once 2 s after it mounts (the world's chunks arrive late).
     - A one-time note says what the two are. Dismissing it is kept in bm.run.v1.seen.hubHint
       (device-local, as seen.companion is), through BMGame.updateRun.

   Mounted once the page's scripts have run (as src/ui/next.ts does).
   window.BMHubMode is a test handle. */

export type Mode = "list" | "map";

const NOTE = "Map is the course world: pick a chapter and the camera travels there. List is the same course as a list.";
const CANNOT = "This device cannot draw the map.";
const FAILED = "The map could not start here.";
/* why() values that mean the device cannot draw the world at all */
const DEVICE = ["no-webgl", "save-data", "off"];

let group: HTMLElement | null = null;
let radios: Record<Mode, HTMLButtonElement> | null = null;
let noteEl: HTMLElement | null = null;
let listening = false;
let current: Mode = "list";
let reason = "";

function w(): any { return window as any; }

function prefMap(): boolean {
  try { const G = w().BMGame; return !!G.map3dOn(G.prefs()); } catch { return false; }
}

/** why the map cannot be shown here and now, "" when it can */
function unable(): string {
  let why = "";
  try { why = String(w().BMMap3D.why() || ""); } catch { why = ""; }
  if (!why) return "";
  if (DEVICE.indexOf(why) > -1) return CANNOT;
  /* the world gave up while the preference says Map */
  if (why !== "list" && why !== "query" && prefMap()) return FAILED;
  return "";
}

function paint(): void {
  if (!group || !radios) return;
  reason = unable();
  current = prefMap() && !reason ? "map" : "list";
  (Object.keys(radios) as Mode[]).forEach((m) => {
    const b = radios![m];
    const on = m === current;
    b.setAttribute("aria-checked", on ? "true" : "false");
    b.tabIndex = on ? 0 : -1;
    if (m === "map" && reason) {
      b.setAttribute("aria-disabled", "true");
      b.title = reason;
    } else {
      b.removeAttribute("aria-disabled");
      b.removeAttribute("title");
    }
  });
}

function set(m: Mode): void {
  if (!radios) return;
  if (m === "map" && reason) return;
  if (m !== current) {
    try { w().BMGame.setPref("map", m === "map" ? "3d" : "list"); } catch { /* the page does without */ }
  }
  paint();
}

function choose(m: Mode, focus: boolean): void {
  set(m);
  if (focus && radios) radios[m].focus();
}

function button(label: string, m: Mode): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "hub-mode-opt";
  b.setAttribute("role", "radio");
  b.setAttribute("data-mode", m);
  b.textContent = label;
  b.addEventListener("click", () => choose(m, false));
  b.addEventListener("keydown", (e) => {
    const k = e.key;
    if (k === " " || k === "Enter") { e.preventDefault(); choose(m, false); return; }
    const step = k === "ArrowRight" || k === "ArrowDown" ? 1 : k === "ArrowLeft" || k === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const order: Mode[] = ["list", "map"];
    let i = order.indexOf(m);
    for (let n = 0; n < order.length; n++) {
      i = (i + step + order.length) % order.length;
      const to = order[i];
      if (to === "map" && reason) continue;
      if (to !== m) choose(to, true);
      return;
    }
  });
  return b;
}

function seenNote(): boolean {
  try { return !!w().BMGame.run().seen.hubHint; } catch { return true; }
}

function dismiss(): void {
  try { w().BMGame.updateRun((r: any) => { r.seen.hubHint = 1; }); } catch { /* a note */ }
  if (noteEl && noteEl.parentNode) noteEl.parentNode.removeChild(noteEl);
  noteEl = null;
  if (radios) radios[current].focus();
}

function note(host: HTMLElement): void {
  if (seenNote()) return;
  noteEl = document.createElement("p");
  noteEl.className = "hub-mode-note";
  noteEl.setAttribute("data-hub-note", "");
  noteEl.appendChild(document.createTextNode(NOTE + " "));
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn ghost small";
  b.textContent = "Dismiss";
  b.addEventListener("click", dismiss);
  noteEl.appendChild(b);
  host.appendChild(noteEl);
}

function mount(): void {
  const host = document.querySelector<HTMLElement>("[data-hub-mode]");
  if (!host || !w().BMGame || !w().BMStore || group) return;
  group = document.createElement("div");
  group.className = "hub-mode-group";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", "Show the course as");
  radios = { list: button("List", "list"), map: button("Map", "map") };
  group.appendChild(radios.list);
  group.appendChild(radios.map);
  host.appendChild(group);
  paint();
  note(host);
  if (!listening) {
    listening = true;
    w().BMStore.on((c: { type?: string }) => {
      if (c && (c.type === "prefs" || c.type === "reset" || c.type === "sync")) paint();
    });
    window.addEventListener("load", paint);
    window.setTimeout(paint, 2000);
  }
}

export const api = {
  mode: (): Mode => current,
  set: (m: Mode): void => set(m),
  state: () => ({ mounted: !!group, mode: current, disabled: !!reason, reason, note: !!noteEl })
};

if (typeof window !== "undefined" && typeof document !== "undefined") {
  (window as any).BMHubMode = api;
  let done = false;
  const go = () => { if (!done) { done = true; try { mount(); } catch { /* the page does without */ } } };
  if (document.readyState === "complete") setTimeout(go, 0);
  else {
    document.addEventListener("DOMContentLoaded", go);
    window.addEventListener("load", go);
  }
}
