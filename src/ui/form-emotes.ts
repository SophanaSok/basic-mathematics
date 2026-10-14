/* The emotes of a form: four short clips (wave, bow, flex, spin) the visitor starts from a
   row of buttons under the form's view (src/ui/form-view.ts; a later card wires this in).

   Two parts. The machine (EmoteState, press, finished) is pure: no DOM, no Three.js. It
   takes a state and an event and returns the next state and the commands for the view:
   `play` (reset the named clip and play it, fading from `from` over `ms`, or starting it
   alone when `from` is null: a restart of the clip already playing) and `playing` (what
   the row shows). States are frozen objects, never mutated. The view runs `play` against
   its mixer (reset, then play, then crossFadeFrom when there is a `from`), and calls
   finished() from the mixer's own finished event for the clip, never from a timer; a
   finish for a clip that is not the one playing (stale, replaced by a later press) is
   ignored.

   Reduced motion or Study mode (BMFx.still) changes nothing here: a pressed emote is the
   visitor's own act and plays once. What `still` switches off is the view's business, the
   idle loop and the inertia of a drag.

   mountEmotes() is the buttons: a group of plain <button>s (an emote is a moment, not a
   toggle, so no aria-pressed: the one playing carries data-playing for its look, and a
   visually hidden live region says "Playing: Wave"), all aria-disabled until enable(true)
   (the model is not up yet; the procedural fallback has no clips). Mount it once, beside
   the view, and move it with the view into the dialog: one row, one state. */

import { EMOTES, type Emote } from "../data/form-models.ts";

export const FADE_MS = 200;

export interface EmoteState { readonly playing: Emote | null }

export type Cmd =
  | { type: "play"; clip: string; from: string | null; ms: number }
  | { type: "playing"; emote: Emote | null };

export const REST: EmoteState = Object.freeze({ playing: null });

export function isEmote(v: unknown): v is Emote {
  return typeof v === "string" && (EMOTES as readonly string[]).includes(v);
}

/** a press: from rest fade idle to the clip; mid-clip fade to the new one; the same one
    again restarts it alone (no fade from itself) */
export function press(s: EmoteState, e: Emote): [EmoteState, Cmd[]] {
  const from = s.playing === null ? "idle" : s.playing === e ? null : s.playing;
  return [
    Object.freeze({ playing: e }),
    [{ type: "play", clip: e, from, ms: FADE_MS }, { type: "playing", emote: e }]
  ];
}

/** a clip ended: back to idle, unless it is not the one playing */
export function finished(s: EmoteState, clip: string): [EmoteState, Cmd[]] {
  if (s.playing === null || s.playing !== clip) return [s, []];
  return [
    REST,
    [{ type: "play", clip: "idle", from: clip, ms: FADE_MS }, { type: "playing", emote: null }]
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
    b.setAttribute("aria-disabled", "true");
    b.textContent = LABELS[e];
    buttons.set(e, b);
    group.appendChild(b);
  }
  const status = doc.createElement("span");
  status.className = "visually-hidden";
  status.setAttribute("aria-live", "polite");
  group.appendChild(status);
  const onClick = (ev: Event): void => {
    const t = ev.target as HTMLElement | null;
    const b = t && typeof t.closest === "function" ? t.closest("[data-emote]") : null;
    const v = b ? b.getAttribute("data-emote") : null;
    if (isEmote(v) && b && b.getAttribute("aria-disabled") !== "true") onPress(v);
  };
  group.addEventListener("click", onClick);
  root.appendChild(group);
  return {
    set(playing) {
      for (const [e, b] of buttons) {
        if (e === playing) b.setAttribute("data-playing", ""); else b.removeAttribute("data-playing");
      }
      status.textContent = playing ? "Playing: " + LABELS[playing] : "";
    },
    enable(on) { for (const b of buttons.values()) b.setAttribute("aria-disabled", on ? "false" : "true"); },
    dispose() {
      group.removeEventListener("click", onClick);
      group.remove();
      buttons.clear();
    }
  };
}
