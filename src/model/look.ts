/* A model's look: the loaded figure made ready to stand in the progress page's scene. It
   tints the `accent` material to the learner's colour (from the file's own neutral gray,
   each time, never on top of the last tint), casts shadows, and plays the clips the file
   has through one mixer: the idle loop while awake, and the four emotes once each, the
   way src/ui/form-emotes.ts commands (play a clip, cross-fading from the one before).

   A file may lack some or all of its clips (the art arrives in steps): playing a clip it
   has not got returns false and changes nothing. With `still` on (reduced motion) the idle
   loop never starts, though an emote that is asked for still plays. active() says whether
   a frame needs drawing (a clip running, a fade pending, or the idle loop on), so a page
   at rest can stop.

   Who owns what: the asset (the scene and its geometries) belongs to the loader's cache, and
   the look borrows it. look.dispose() removes the group from its parent, stops the mixer
   and frees the mixer's caches, the materials and their maps; the geometry and the
   skeleton stay for kit.evict() to free. The look only reports: when an emote finishes it
   calls onFinished, and the caller runs idle again if it wants the loop back. */
import type { Group, AnimationAction, AnimationMixer, Color, Material, Mesh, MeshStandardMaterial, Texture } from "three";

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
  const accents: { mat: MeshStandardMaterial; base: Color }[] = [];
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
      if (s.name !== "accent" || !s.color) return;
      /* the file's own colour, kept once on the material, so a second look on the same
         asset tints from it and not from the first look's tint */
      if (!s.userData.baseColor) s.userData.baseColor = s.color.clone();
      accents.push({ mat: s, base: s.userData.baseColor as Color });
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

  /* what is really running: an emote the mixer still runs (one a second emote faded out is
     disabled without a "finished"), a fade pending by time, or the idle loop */
  function active(): boolean {
    for (const name of playing) {
      const a = actions.get(name);
      if (a && a.isRunning() && a.enabled && !a.paused) return true;
    }
    return clock < fadeUntil || (idleOn && !still && actions.has("idle"));
  }

  return {
    kind: "model",
    group,
    stage: asset.stage,
    height,
    triangles: asset.triangles,
    tint(color) { accents.forEach((a) => a.mat.color.copy(a.base).multiply(color)); },
    run(cmd) {
      const to = actions.get(cmd.clip);
      if (!to) return false;
      to.paused = false;
      to.reset();
      to.play();
      if (cmd.clip !== "idle") playing.add(cmd.clip);
      if (cmd.from) {
        const f = actions.get(cmd.from);
        if (f && f !== to) {
          to.crossFadeFrom(f, cmd.ms / 1000, true);
          fadeUntil = Math.max(fadeUntil, clock + cmd.ms);
          if (cmd.from !== "idle") playing.delete(cmd.from);
        }
      }
      return true;
    },
    setIdle(on) {
      if (on && still) return;
      if (on === idleOn) return;
      idleOn = on;
      const a = actions.get("idle");
      if (on) {
        if (a) { a.paused = false; a.reset(); a.play(); }
        return;
      }
      /* park on idle frame 0: no emote left enabled to blend into the pose */
      mixer.stopAllAction();
      playing.clear();
      fadeUntil = 0;
      if (a) { a.reset(); a.play(); }
      mixer.setTime(0);
      if (a) a.paused = true;
    },
    tick(dtMs) {
      if (!active()) return;
      clock += dtMs;
      mixer.update(dtMs / 1000);
    },
    active,
    onFinished(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    dispose() {
      mixer.removeEventListener("finished", onDone as never);
      mixer.stopAllAction();
      mixer.uncacheRoot(group);
      listeners.clear();
      playing.clear();
      group.removeFromParent();
      /* the materials and their maps; the geometries and the skeleton are the asset's */
      const seenMats = new Set<Material>();
      group.traverse((o) => {
        const m = o as Mesh;
        if (!(m as { isMesh?: boolean }).isMesh) return;
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => {
          if (!mat || seenMats.has(mat)) return;
          seenMats.add(mat);
          Object.values(mat).forEach((v) => { if (v && (v as Texture).isTexture) (v as Texture).dispose(); });
          mat.dispose();
        });
      });
    },
  };
}
