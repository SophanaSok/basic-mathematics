/* The emotes of a form: four short clips (wave, bow, flex, spin) the visitor starts from a
   row of buttons under the form's view (src/ui/form-view.ts; a later card wires this in).

   Two parts. The machine (EmoteState, press, finished) is pure: no DOM, no Three.js. It
   takes a state and an event and returns the next state and the commands for the view: a
   cross-fade between two clips and what the buttons show as pressed. States are plain
   objects and never mutated. The view runs the commands against its mixer and calls
   finished() when a clip ends; a clip that is not the one playing (stale, replaced by a
   later press) is ignored.

   Reduced motion or Study mode (BMFx.still) changes nothing here: a pressed emote is the
   visitor's own act and plays once. What `still` switches off is the view's business, the
   idle loop and the inertia of a drag.

   mountEmotes() is the buttons: a group of <button>s, all disabled until enable(true)
   (the model is not up yet; the procedural fallback has no clips). */

import { EMOTES, type Emote } from "../data/form-models.ts";

export const FADE_MS = 200;

export interface EmoteState { playing: Emote | null; since: number; fading: boolean }

export type Cmd =
  | { type: "crossFade"; from: string; to: string; ms: number }
  | { type: "pressed"; emote: Emote | null };

export const REST: EmoteState = { playing: null, since: 0, fading: false };

export function isEmote(v: unknown): v is Emote {
  return typeof v === "string" && (EMOTES as readonly string[]).includes(v);
}

/** a press: from rest fade idle to the clip; mid-clip fade to the new one (or restart the same) */
export function press(s: EmoteState, e: Emote, now: number, still: boolean): [EmoteState, Cmd[]] {
  void still;
  const from = s.playing === null ? "idle" : s.playing;
  return [
    { playing: e, since: now, fading: true },
    [{ type: "crossFade", from, to: e, ms: FADE_MS }, { type: "pressed", emote: e }]
  ];
}

/** a clip ended: back to idle, unless it is not the one playing */
export function finished(s: EmoteState, clip: string, now: number): [EmoteState, Cmd[]] {
  if (s.playing === null || s.playing !== clip) return [s, []];
  return [
    { playing: null, since: now, fading: true },
    [{ type: "crossFade", from: clip, to: "idle", ms: FADE_MS }, { type: "pressed", emote: null }]
  ];
}

const LABELS: Record<Emote, string> = { wave: "Wave", bow: "Bow", flex: "Flex", spin: "Spin" };

export function mountEmotes(
  root: HTMLElement,
  onPress: (e: Emote) => void
): { set(playing: Emote | null): void; enable(on: boolean): void; dispose(): void } {
  const doc = root.ownerDocument;
  const group = doc.createElement("div");
  group.className = "form-emotes";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Emotes");
  const buttons = new Map<Emote, HTMLButtonElement>();
  for (const e of EMOTES) {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = "btn ghost small";
    b.setAttribute("data-emote", e);
    b.setAttribute("aria-pressed", "false");
    b.disabled = true;
    b.textContent = LABELS[e];
    buttons.set(e, b);
    group.appendChild(b);
  }
  const onClick = (ev: Event): void => {
    const t = ev.target as HTMLElement | null;
    const b = t && typeof t.closest === "function" ? t.closest("[data-emote]") : null;
    const v = b ? b.getAttribute("data-emote") : null;
    if (isEmote(v) && !(b as HTMLButtonElement).disabled) onPress(v);
  };
  group.addEventListener("click", onClick);
  root.appendChild(group);
  return {
    set(playing) {
      for (const [e, b] of buttons) b.setAttribute("aria-pressed", e === playing ? "true" : "false");
    },
    enable(on) { for (const b of buttons.values()) b.disabled = !on; },
    dispose() {
      group.removeEventListener("click", onClick);
      group.remove();
      buttons.clear();
    }
  };
}
