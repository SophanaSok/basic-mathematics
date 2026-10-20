/* Mochi's figure: the loaded GLB made ready to play, a port of the reference avatar.js
   (BLENDER/axolotl) to this repo's conventions. One mixer plays the file's clips: nine
   looping mood clips (idle, happy, excited, sad, angry, surprised, thinking, sleepy,
   sleeping; "neutral" is idle) and three one-shot idle variations (idle_look, idle_stretch,
   idle_wiggle). A mood clip drives the skeleton and the matching mood_* morph targets, so
   one crossfade changes the body and the face. While the mood is idle, a variation is blended
   in every few seconds and the mood comes back when it ends; never under reduced motion.

   The Three.js addons come in as `M` (src/vendor/three-model.js, as src/model/ does); nothing
   is imported from "three" at run time. Nothing is written to the console: an unknown mood
   returns false. Who calls it: src/mochi/index.ts builds it, src/mochi/stage.ts updates and
   draws it, and the companion (a later card) drives it through the stage.

   The pure helpers (clip names, the fade, the next idle interval) are exported for the
   tests; the rest needs a loaded file. dispose() stops the mixer and frees every geometry,
   material, map and bone texture, which the loader's cache does not own here. */
import type { Group, Mesh, Material, Texture, BufferGeometry, SkinnedMesh, AnimationAction, AnimationMixer } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ThreeModel } from "../model/three.ts";

/** An idle variation is a clip named idle_*; every other clip is a looping mood. */
export const isVariation = (clip: string): boolean => clip.startsWith("idle_");

/** "neutral" is the idle clip's alias. */
export const clipOf = (mood: string): string => (mood === "neutral" ? "idle" : mood);

/** The seconds a mood change fades over: the caller's own, else the still fade under reduced motion, else the usual. */
export function pickFade(still: boolean, asked: number | undefined, fadeS: number, fadeStillS: number): number {
  if (typeof asked === "number" && asked >= 0) return asked;
  return still ? fadeStillS : fadeS;
}

/** A seconds value in [lo, hi) from a unit random number. */
export const interval = (range: [number, number], r: number): number => range[0] + r * (range[1] - range[0]);

/** Whether a frame is drawn on every tick (a fade or a variation is running) or at most every `gapMs`. */
export function drawDue(busy: boolean, sinceDrawMs: number, gapMs: number): boolean {
  return busy || sinceDrawMs >= gapMs;
}

export interface AvatarOptions {
  fadeS: number;
  fadeStillS: number;
  idleIntervalS: [number, number];
  still(): boolean;
  random?(): number;
}

export interface Avatar {
  readonly object: Group;
  readonly meshes: Mesh[];
  setMood(name: string, fadeS?: number): boolean;
  setMorph(name: string, weight: number): void;
  playIdleVariation(name?: string): boolean;
  moods(): string[];
  update(dt: number): void;
  /** a crossfade is running */
  fading(): boolean;
  /** a mood is not the idle (so a variation is playing) or a crossfade is running */
  busy(): boolean;
  stats(): { mood: string | null; fade: number; reduced: boolean; variations: number; lastVariation: string | null; weights: Record<string, number>; triangles: number; morphs: number };
  dispose(): void;
}

function freeTree(root: Group): void {
  root.traverse((o) => {
    const m = o as Mesh;
    if ((m as { isMesh?: boolean }).isMesh) {
      (m.geometry as BufferGeometry | undefined)?.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mat: Material | undefined) => {
        if (!mat) return;
        Object.values(mat).forEach((v) => { if (v && (v as Texture).isTexture) (v as Texture).dispose(); });
        mat.dispose();
      });
    }
    const sk = (o as SkinnedMesh).skeleton;
    if (sk) { sk.boneTexture?.dispose(); sk.dispose(); }
  });
}

export function createAvatar(M: ThreeModel, gltf: GLTF, o: AvatarOptions): Avatar {
  const object = gltf.scene;
  const rand = o.random || Math.random;
  const meshes: Mesh[] = [];
  let triangles = 0;
  object.traverse((n) => {
    const m = n as Mesh;
    if (!(m as { isMesh?: boolean }).isMesh) return;
    m.frustumCulled = false;
    meshes.push(m);
    const g = m.geometry;
    if (g) triangles += g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
  });
  triangles = Math.round(triangles);

  const mixer: AnimationMixer = new M.AnimationMixer(object);
  const actions: Record<string, AnimationAction> = {};
  const variations: string[] = [];
  for (const clip of gltf.animations) {
    const a = mixer.clipAction(clip);
    if (isVariation(clip.name)) { a.setLoop(M.LoopOnce, 1); variations.push(clip.name); }
    else a.setLoop(M.LoopRepeat, Infinity);
    actions[clip.name] = a;
  }

  let current: AnimationAction | null = null;   /* the action playing: a mood clip or a variation */
  let mood: AnimationAction | null = null;      /* the mood we are in, and come back to */
  let moodName: string | null = null;
  let nextVariation = interval(o.idleIntervalS, rand());
  let fadeLeft = 0;
  let lastFade = 0, lastReduced = false, started = 0, lastVariation: string | null = null;
  let dead = false;

  function play(next: AnimationAction, duration: number): void {
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if (current && current !== next) current.crossFadeTo(next, duration, false);
    current = next;
    fadeLeft = duration;
  }

  const idleNow = (): boolean => !!actions.idle && mood === actions.idle && current === mood;

  function setMood(name: string, fadeS?: number): boolean {
    const clip = clipOf(name);
    const next = isVariation(clip) ? undefined : actions[clip];
    if (dead || !next) return false;
    if (next === mood && current === mood) return true;
    const still = o.still();
    const d = pickFade(still, fadeS, o.fadeS, o.fadeStillS);
    mood = next;
    moodName = clip;
    lastFade = d;
    lastReduced = still;
    play(next, d);
    nextVariation = interval(o.idleIntervalS, rand());
    return true;
  }

  function playIdleVariation(name?: string): boolean {
    if (dead || o.still() || !variations.length) return false;
    const pick = name ?? variations[Math.floor(rand() * variations.length) % variations.length];
    const v = isVariation(pick) ? actions[pick] : undefined;
    if (!v || !idleNow()) return false;
    play(v, 0.3);
    started++;
    lastVariation = pick;
    return true;
  }

  mixer.addEventListener("finished", (e) => {
    const ev = e as unknown as { action: AnimationAction };
    if (ev.action === current && mood && current !== mood) {
      play(mood, pickFade(o.still(), undefined, o.fadeS, o.fadeStillS));
      nextVariation = interval(o.idleIntervalS, rand());
    }
  });

  function setMorph(name: string, weight: number): void {
    for (const m of meshes) {
      const i = m.morphTargetDictionary?.[name];
      if (i !== undefined && m.morphTargetInfluences) m.morphTargetInfluences[i] = weight;
    }
  }

  function update(dt: number): void {
    if (dead) return;
    mixer.update(dt);
    if (fadeLeft > 0) fadeLeft = Math.max(0, fadeLeft - dt);
    if (o.still()) { nextVariation = interval(o.idleIntervalS, rand()); return; }
    if (variations.length && idleNow()) {
      nextVariation -= dt;
      if (nextVariation <= 0) { playIdleVariation(); nextVariation = interval(o.idleIntervalS, rand()); }
    }
  }

  function dispose(): void {
    if (dead) return;
    dead = true;
    try { mixer.stopAllAction(); mixer.uncacheRoot(object); } catch { /* gone */ }
    if (object.parent) object.parent.remove(object);
    try { freeTree(object); } catch { /* gone */ }
    current = mood = null;
  }

  setMood("idle", 0);

  return {
    object, meshes, setMood, setMorph, playIdleVariation, update, dispose,
    moods: () => Object.keys(actions).filter((n) => !isVariation(n)),
    fading: () => fadeLeft > 0,
    busy: () => fadeLeft > 0 || (!!mood && current !== mood),
    stats: () => ({
      mood: moodName, fade: lastFade, reduced: lastReduced, variations: started, lastVariation,
      weights: Object.fromEntries(Object.entries(actions).map(([n, a]) => [n, a.getEffectiveWeight()])),
      triangles,
      morphs: Object.keys(meshes[0]?.morphTargetDictionary ?? {}).length,
    }),
  };
}
