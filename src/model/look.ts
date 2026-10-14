/* A model's look: the loaded figure made ready to stand in the progress page's scene. It
   tints the `accent` material to the learner's colour (from the file's own neutral gray,
   each time, never on top of the last tint), casts shadows, and plays the clips the file
   has through one mixer: the idle loop while awake, and the four emotes once each, the
   way src/ui/form-emotes.ts commands (play a clip, cross-fading from the one before).

   A file may lack some or all of its clips (the art arrives in steps): playing a clip it
   has not got returns false and changes nothing. With `still` on (reduced motion) the idle
   loop never starts, though an emote that is asked for still plays. active() says whether
   a frame needs drawing (a clip running, a fade pending, or the idle loop on), so a page
   at rest can stop. dispose() frees everything the figure held. */
import type { Group, AnimationAction, AnimationMixer, Color, Material, Mesh, MeshStandardMaterial } from "three";
import { disposeTree } from "./loader.ts";
import type { ModelAsset } from "./index.ts";
import type { ThreeModel } from "./three.ts";

export interface PlayCommand { type: "play"; clip: string; from: string | null; ms: number }

export interface ModelLook {
  kind: "model";
  group: Group;
  stage: number;
  height: number;
  triangles: number;
  tint(color: Color): void;
  run(cmd: PlayCommand): boolean;
  setIdle(on: boolean): void;
  tick(dtMs: number): void;
  active(): boolean;
  onFinished(fn: (clip: string) => void): () => void;
  dispose(): void;
}

export function makeLook(M: ThreeModel, asset: ModelAsset, still: boolean): ModelLook {
  const group = asset.scene;
  const accents: { mat: MeshStandardMaterial; color: Color }[] = [];
  const seen = new Set<Material>();
  group.traverse((o) => {
    const m = o as Mesh;
    if (!(m as { isMesh?: boolean }).isMesh) return;
    m.castShadow = true;
    m.receiveShadow = false;
    (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => {
      if (!mat || seen.has(mat)) return;
      seen.add(mat);
      const s = mat as MeshStandardMaterial;
      if (s.name === "accent" && s.color) accents.push({ mat: s, color: s.color.clone() });
    });
  });

  let height = 0;
  const box = new M.Box3().setFromObject(group);
  if (!box.isEmpty()) height = box.max.y - box.min.y;
  if (!(height > 0) || !isFinite(height)) height = 1;

  const mixer: AnimationMixer = new M.AnimationMixer(group);
  const actions = new Map<string, AnimationAction>();
  asset.clips.forEach((clip) => {
    const a = mixer.clipAction(clip);
    if (clip.name === "idle") a.setLoop(M.LoopRepeat, Infinity);
    else { a.setLoop(M.LoopOnce, 1); a.clampWhenFinished = true; }
    actions.set(clip.name, a);
  });

  const playing = new Set<string>();
  const listeners = new Set<(clip: string) => void>();
  let clock = 0, fadeUntil = 0, idleOn = false;

  const onDone = (e: { action?: AnimationAction }) => {
    const name = e.action ? e.action.getClip().name : "";
    playing.delete(name);
    listeners.forEach((fn) => fn(name));
  };
  mixer.addEventListener("finished", onDone as never);

  return {
    kind: "model",
    group,
    stage: asset.stage,
    height,
    triangles: asset.triangles,
    tint(color) { accents.forEach((a) => a.mat.color.copy(a.color).multiply(color)); },
    run(cmd) {
      const to = actions.get(cmd.clip);
      if (!to) return false;
      to.paused = false;
      to.reset();
      to.play();
      if (cmd.clip !== "idle") playing.add(cmd.clip);
      if (cmd.from) {
        const f = actions.get(cmd.from);
        if (f && f !== to) { to.crossFadeFrom(f, cmd.ms / 1000, true); fadeUntil = Math.max(fadeUntil, clock + cmd.ms); }
      }
      return true;
    },
    setIdle(on) {
      const a = actions.get("idle");
      if (on && still) return;
      if (on === idleOn) return;
      idleOn = on;
      if (!a) return;
      if (on) { a.paused = false; a.reset(); a.play(); }
      else { a.reset(); a.play(); mixer.setTime(0); a.paused = true; }
    },
    tick(dtMs) {
      if (!this.active()) return;
      clock += dtMs;
      mixer.update(dtMs / 1000);
    },
    active() {
      return playing.size > 0 || clock < fadeUntil || (idleOn && !still && actions.has("idle"));
    },
    onFinished(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    dispose() {
      mixer.removeEventListener("finished", onDone as never);
      mixer.stopAllAction();
      mixer.uncacheRoot(group);
      listeners.clear();
      playing.clear();
      group.removeFromParent();
      disposeTree(group);
    },
  };
}
