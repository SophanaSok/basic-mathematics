/* Mochi, the 3D axolotl companion: the door to the chunk (bundle/mochi.js, named by the
   src/mochi/ rule in vite.config.ts). createMochiStage() loads the Three.js core
   (window.BM3D.load()), the model addons (src/vendor/three-model.js) and the GLB
   (models/mochi/mochi-<variant>.glb, textures beside it, KHR_materials_unlit, so there is
   no lighting to set up), builds the figure (avatar.ts) and the stage (stage.ts), appends
   the canvas to the host, draws the first frame and resolves. Any failure (no BM3D, a
   404, a parse error, the timeout, no WebGL) rejects with the reason, leaves nothing in the
   host and frees what was made; a timeout that fires after the file arrives leaves no stage
   alive either.

   This chunk imports nothing else from src/ at run time: the caller passes the tier's
   budget and a pixelRatio(w, h) function in. Who calls it: src/ui/companion.ts (a later
   card), through import("../mochi/index.ts"). Nothing is written to the console. */
import { createAvatar } from "./avatar.ts";
import type { Avatar } from "./avatar.ts";
import { createStage } from "./stage.ts";

export const MOCHI_LOAD_TIMEOUT_MS = 10000;

export type MochiState = "loading" | "ready" | "failed" | "lost" | "disposed";

export interface MochiStageOptions {
  /** the GLB's URL */
  url: string;
  /** the tier's budget (src/world/tiers.ts TIERS[tier]) */
  budget: { dpr: number; antialias: boolean };
  /** the caller binds src/world/tiers.ts pixelRatio to the budget */
  pixelRatio(w: number, h: number): number;
  /** reduced motion now (the caller reads window.BMFx.still()) */
  still(): boolean;
  /** called after each drawn frame while motion is allowed (never under still()); the companion steps the water backdrop on it */
  tick?(tMs: number): void;
  fadeS?: number;
  fadeStillS?: number;
  idleIntervalS?: [number, number];
  timeoutMs?: number;
  onState?(state: MochiState, why?: string): void;
}

export interface MochiInfo {
  state: MochiState; mood: string | null; frames: number; fade: number; reduced: boolean; paused: boolean;
  variations: number; lastVariation: string | null; weights: Record<string, number>; triangles: number; morphs: number;
  /** the live influence of each growth morph (Grow*) on the first mesh */
  morphWeights: Record<string, number>;
  growth: { scale: number; morphs: Record<string, number> };
  /** socket name to the URL of the accessory on it, only while attached */
  worn: Record<string, string>;
  /** the world-space box of each attachment (by socket) and of the figure's own meshes, for the tests */
  wornBox: Record<string, { min: number[]; max: number[] }>;
  bodyBox: { min: number[]; max: number[] } | null;
}

export interface MochiStage {
  readonly canvas: HTMLCanvasElement;
  /** false on an unknown name; "neutral" is idle */
  setMood(name: string, fadeS?: number): boolean;
  setMorph(name: string, weight: number): void;
  /** the stage's look (scale and growth morph weights), kept across clips */
  setGrowth(look: { scale: number; morphs: Record<string, number> }): void;
  /** hang an accessory GLB on a socket (socket_head, socket_back, socket_tail); null takes it off. Resolves
      true when done, false for an unknown socket, a failed load (the socket stays as it was) or a call a
      later one for the same socket replaced */
  attach(socket: string, url: string | null): Promise<boolean>;
  /** only while idle and not still() */
  playIdleVariation(name?: string): boolean;
  /** the nine mood clip names in the file */
  moods(): string[];
  info(): MochiInfo;
  /** ask for frames again */
  wake(): void;
  dispose(): void;
}

const why = (e: unknown): string => (e && typeof (e as Error).message === "string" ? (e as Error).message : String(e));

export async function createMochiStage(host: HTMLElement, opts: MochiStageOptions): Promise<MochiStage> {
  const notify = (s: MochiState, w?: string): void => { if (opts.onState) { try { opts.onState(s, w); } catch { /* the caller's */ } } };
  let canceled = false, live = false;
  let avatar: Avatar | null = null;
  let stage: MochiStage | null = null;
  let timer = 0;
  /* the stage's own states reach the caller only once it has resolved; before that a failure is the one state heard */
  const stageOpts: MochiStageOptions = { ...opts, onState: (s, w) => { if (live) notify(s, w); } };
  notify("loading");

  function cleanup(): void {
    if (stage) stage.dispose();
    else if (avatar) avatar.dispose();
    if (stage && stage.canvas.parentNode) stage.canvas.parentNode.removeChild(stage.canvas);
    stage = null;
    avatar = null;
  }

  const build = async (): Promise<MochiStage> => {
    const B = (window as unknown as { BM3D?: { load?: () => Promise<unknown>; supported?: () => boolean; THREE?: any } }).BM3D;
    if (!B || typeof B.load !== "function") throw new Error("Three.js loader missing");
    if (typeof B.supported === "function" && !B.supported()) throw new Error("WebGL not supported");
    if (!(await B.load()) || !B.THREE) throw new Error("Three.js did not load");
    const M = await import("../vendor/three-model.js");
    if (canceled) throw new Error("canceled");
    const gltf = await new M.GLTFLoader().loadAsync(opts.url);
    avatar = createAvatar(M, gltf, {
      fadeS: opts.fadeS ?? 0.35,
      fadeStillS: opts.fadeStillS ?? 0.9,
      idleIntervalS: opts.idleIntervalS ?? [5, 10],
      still: opts.still,
    });
    /* a timeout that fired while the file was coming leaves nothing alive */
    if (canceled) { cleanup(); throw new Error("canceled"); }
    stage = createStage(B.THREE, host, avatar, stageOpts);
    if (canceled) { cleanup(); throw new Error("canceled"); }
    return stage;
  };

  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => { canceled = true; reject(new Error("timed out")); }, opts.timeoutMs ?? MOCHI_LOAD_TIMEOUT_MS);
    });
    const s = await Promise.race([build(), timeout]);
    window.clearTimeout(timer);
    live = true;
    notify("ready");
    return s;
  } catch (e) {
    canceled = true;
    window.clearTimeout(timer);
    cleanup();
    const reason = why(e);
    notify("failed", reason);
    throw new Error(reason);
  }
}
