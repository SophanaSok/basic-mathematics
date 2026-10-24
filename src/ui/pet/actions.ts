/* The pool's care row (X-6, X-7): Feed, Play and Clean on the pet record, and a click on Mochi that is
   a pet and writes nothing. Part of the lazy `pet` chunk; the pure rules are in src/learn/pet.ts.

   An act reads bm.pet.v1 through BMStore, applyAct()s it, writes it back and emits
   { type: "pet", what: "gift" (feed) | "care" (play, clean), id: "<act>:<day>" }. After a `stale`
   bus event (another tab chose another learner) nothing more is written, here or in the shop (isStale());
   the flag is per page load, and its one bus listener is added once. Play needs a toy: without one the
   button is aria-disabled (it stays focusable and a click says why) and snacks are fed from the shop only.
   Under reduced motion no clip plays; the line still changes. */
import { canAct, applyAct } from "../../learn/pet.ts";
import type { Act } from "../../learn/pet.ts";
import type { MochiStage } from "../../mochi/index.ts";
import { LINES, lineFor } from "./lines.ts";

/** the clip each act plays on the stage; B-2 swaps in eat / play / splash / nuzzle */
export const ACT_CLIP = { feed: "happy", play: "excited", clean: "surprised", pet: "happy" } as const;

export interface ActionsCtx {
  /** the live stage, or null while there is none (the still sheet is the picture) */
  stage(): MochiStage | null;
  alive(): boolean;
  reduced(): boolean;
  /** repaint the hearts from this record */
  repaint(pet: any, now: number): void;
}

export interface ActionsHandle { dispose(): void; refresh(pet: any, now: number): void }

const LABEL: Record<Act, string> = { feed: "Feed", play: "Play", clean: "Clean" };
const ORDER: Act[] = ["feed", "play", "clean"];
const PET_GAP_MS = 2000;
const CLIP_MS = 2400;

function w(): any { return window as any; }
export function readPet(): any { try { return w().BMStore.read(w().BMStore.keys.pet, {}) || {}; } catch { return {}; } }
/* one `stale` listener for the page: another tab chose another learner, so nothing more is written */
let stale = false, listening = false;
export function isStale(): boolean {
  if (!listening) {
    listening = true;
    try { w().BMStore.on((c: any) => { if (c && c.type === "stale") stale = true; }); } catch { /* no bus */ }
  }
  return stale;
}
export function today(): string { try { return String(w().BMSite.dayKey(new Date())); } catch { return new Date().toISOString().slice(0, 10); } }

/** adds the row under the hearts; returns its dispose and a refresh for the buttons */
export function mountActions(shell: HTMLElement, ctx: ActionsCtx): ActionsHandle {
  const row = document.createElement("div");
  row.className = "pet-actions";
  const btns: Record<string, HTMLButtonElement> = {};
  ORDER.forEach((a) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn"; b.setAttribute("data-act", a); b.textContent = LABEL[a];
    btns[a] = b; row.appendChild(b);
  });
  const needs = shell.querySelector(".pet-needs");
  if (needs && needs.parentNode) needs.parentNode.insertBefore(row, needs.nextSibling); else shell.appendChild(row);
  const lineEl = shell.querySelector(".pet-line") as HTMLElement;

  const porthole = shell.querySelector(".pet-porthole") as HTMLElement | null;
  let lastPet = 0, timer = 0, done = false;
  isStale();

  function setLine(text: string, arena?: boolean): void {
    lineEl.textContent = text;
    if (arena) {
      /* the cap line ends in a link to the Arena, built by DOM */
      const at = text.indexOf("The Arena");
      if (at >= 0) {
        lineEl.textContent = text.slice(0, at);
        const a = document.createElement("a");
        a.href = (w().BMSite && w().BMSite.rootPrefix ? w().BMSite.rootPrefix() : "") + "arena.html";
        a.textContent = "The Arena";
        lineEl.appendChild(a);
        lineEl.appendChild(document.createTextNode(text.slice(at + "The Arena".length)));
      }
    }
  }
  function clip(name: string): void {
    const s = ctx.stage();
    if (!s || ctx.reduced()) return;
    try { s.setMood(name); } catch { return; }
    if (porthole) porthole.setAttribute("data-clip", name);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (porthole) porthole.removeAttribute("data-clip");
      const t = ctx.stage();
      if (!done && t) { try { t.setMood("idle"); } catch { /* gone */ } }
    }, CLIP_MS);
  }
  function refresh(pet: any, now: number, day: string): void {
    const feed = canAct(pet, "feed", day, now), play = canAct(pet, "play", day, now), clean = canAct(pet, "clean", day, now);
    btns.feed.disabled = !feed.ok;
    btns.play.disabled = play.why === "play-cap";
    if (play.why === "no-toy") btns.play.setAttribute("aria-disabled", "true"); else btns.play.removeAttribute("aria-disabled");
    btns.clean.hidden = clean.why === "clean-full";
  }
  ORDER.forEach((a) => btns[a].addEventListener("click", () => {
    if (done || !ctx.alive() || isStale()) return;
    const day = today(), now = Date.now(), pet = readPet();
    const can = canAct(pet, a, day, now);
    if (!can.ok) {
      if (can.why === "gift-taken") setLine(LINES.giftTaken);
      else if (can.why === "play-cap") setLine(LINES.playCap, true);
      else if (can.why === "no-toy") setLine(LINES.noToy);
      refresh(pet, now, day);
      return;
    }
    const next = applyAct(pet, a, day, now);
    try { w().BMStore.write(w().BMStore.keys.pet, next); } catch { return; }
    try { w().BMStore.emit({ type: "pet", what: a === "feed" ? "gift" : "care", id: a + ":" + day }); } catch { /* no bus */ }
    ctx.repaint(next, now);
    refresh(next, now, day);
    clip(ACT_CLIP[a]);
    if (a === "feed") setLine(LINES.fed);
    else if (a === "play") { if (canAct(next, "play", day, now).ok) setLine(LINES.played); else setLine(LINES.playCap, true); }
    else setLine(LINES.cleaned);
    /* a button that just went away would drop focus to the dialog body: the line takes it */
    if (btns[a].disabled || btns[a].hidden) { try { lineEl.focus({ preventScroll: true }); } catch { lineEl.focus(); } }
  }));

  const onPet = (): void => {
    if (done || !ctx.alive()) return;
    const t = Date.now();
    if (t - lastPet < PET_GAP_MS) return;
    lastPet = t;
    clip(ACT_CLIP.pet);
    setLine(LINES.petted);
  };
  /* petting is a button for the keyboard too: Enter and Space do what a click does */
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onPet();
  };
  if (porthole) {
    porthole.setAttribute("role", "button");
    porthole.setAttribute("tabindex", "0");
    porthole.setAttribute("aria-label", "Pet Mochi");
    porthole.addEventListener("click", onPet);
    porthole.addEventListener("keydown", onKey);
  }

  const now0 = Date.now();
  const pet0 = readPet();
  refresh(pet0, now0, today());
  lineEl.textContent = lineFor(pet0, now0);

  return {
    refresh: (pet, now) => refresh(pet, now, today()),
    dispose: () => {
      done = true; window.clearTimeout(timer);
      if (porthole) { porthole.removeEventListener("click", onPet); porthole.removeEventListener("keydown", onKey); porthole.removeAttribute("data-clip"); }
    }
  };
}
