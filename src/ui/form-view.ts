/* The 3D view of a form on the progress page (src/ui/forms.ts is the panel around it).

   One WebGLRenderer, made as the course map's is (assets/map3d.js): alpha, so the panel
   shows through, low power, and its tier from src/world/tiers.ts; colour management on
   (this page has no map) and sRGB output. The canvas lives in a turnable stage element
   (role img, arrow keys) this file makes, in the view box (or, while the "View larger"
   dialog is open, in the dialog's box), and is sized by the box. Nothing is fetched until
   the box nears the screen; then Three.js (BM3D.load()), the scene (src/world/form-scene.ts,
   in the world chunk) and, once the drawn form is up, the model chunk (src/model/index.ts):
   the stage's GLB replaces the drawn form when it arrives. A load that fails leaves the
   drawn form for good; one that is only slow (LOAD_TIMEOUT_MS) shows it and the model
   swaps in later, so the view only improves.

   Frames are drawn on demand: one after a change (a turn of the form, a resize), and while
   anything moves: the idle motion for AMBIENT_MS after the box scrolls into view or the
   pointer enters it, the coast of a flick, an emote and the fade after it. Then one at
   rest, and no more. Never while the box is offscreen or the tab hidden. Under reduced
   motion or Study mode (BMFx.still) there is no idle loop and no coast, but a pressed emote
   still plays. A lost context, no WebGL, the list tier or a failed import leaves the box
   in its "flat" state: the fallback card forms.ts put there is what shows.

   The box's data-state: "loading" (the fallback card), "3d" (the canvas), "flat" (the
   fallback card, for good). Beside it data-model: "loading" (the model is on its way, or
   not asked for yet), "model" (shown) or "fallback" (the drawn form stays). */

import { detectTier, readProbe, pixelRatio, TIERS, AMBIENT_MS, type Quality } from "../world/tiers.ts";
import type { FormScene } from "../world/form-scene.ts";
import type { WebGLRenderer } from "three";
import type { ModelKit, ModelEnv, ModelAsset, LoadState } from "../model/index.ts";
import { modelFor, type Emote } from "../data/form-models.ts";
import { Orbit, bindOrbit, DEFAULT_PITCH } from "./form-orbit.ts";
import { press, finished, REST, FADE_MS, type Cmd, type EmoteState } from "./form-emotes.ts";

export interface FormView {
  /** resolves true once the canvas is up, false when the view is flat for good; never rejects */
  readonly ready: Promise<boolean>;
  readonly state: "loading" | "3d" | "flat";
  /** show a stage in the hue of a Part (remembered until the scene is up) */
  show(stage: number, part: string): void;
  /** a stage drawn once at px × px into the same renderer: a data URL, or null when 3D is off */
  snapshot(stage: number, part: string, px: number): string | null;
  /** frames for AMBIENT_MS (the idle motion), then one at rest */
  wake(): void;
  /** the palette read again (a theme or panel change) and a frame drawn */
  repaint(): void;
  /** the stage (the canvas) goes into another box (the dialog), turning with or without
      zoom; the box it came from keeps its fallback */
  moveTo(parent: HTMLElement, opts?: { zoom: boolean }): void;
  /** the stage's accessible name */
  label(text: string): void;
  /** start an emote on the model (nothing for the drawn form) */
  play(emote: Emote): void;
  /** start fetching a stage's model in the background */
  preload(stage: number): void;
  /** what a test can read */
  info(): ViewInfo;
  dispose(): void;
}

export interface ViewInfo {
  state: string;
  model: string | undefined;
  stage: number | null;
  yaw: number;
  frames: number;
  memory: { geometries: number; textures: number } | null;
  /** a model's clip weights now (empty for the drawn form) */
  clips: Record<string, number>;
}

/** the row of emote buttons forms.ts mounts: what the view tells it */
export interface EmoteRow { set(playing: Emote | null): void; enable(on: boolean): void; show(on: boolean): void }

/* three's SRGBColorSpace is the string "srgb"; spelled here so the world's Three.js
   needs no new name for it */
const SRGB = "srgb" as WebGLRenderer["outputColorSpace"];

const now = (): number => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

function prefs(): Record<string, string> {
  try {
    const g = window.BMGame;
    if (g && typeof g.prefs === "function") return g.prefs() || {};
  } catch { /* fall through */ }
  try {
    const p = window.BMStore.read(window.BMStore.keys.prefs, {});
    return p && typeof p === "object" ? p : {};
  } catch { return {}; }
}

function still(): boolean {
  try {
    if (window.BMFx && typeof window.BMFx.still === "function") return !!window.BMFx.still();
  } catch { /* fall back below */ }
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

export function createFormView(box: HTMLElement, probe: Element, onState?: (s: "3d" | "flat") => void, emotes?: EmoteRow): FormView {
  let host: HTMLElement = box;
  let state: "loading" | "3d" | "flat" = "loading";
  let renderer: WebGLRenderer | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let stageEl: HTMLElement | null = null;
  let loadEl: HTMLElement | null = null;
  let loadBar: HTMLElement | null = null;
  let labelText = "";
  let scene: FormScene | null = null;
  let kit: ModelKit | null = null;
  let env: ModelEnv | null = null;
  let restore: (() => void) | null = null;
  let timeoutMs = 10000;
  let tier: Quality = "medium";
  let want: { stage: number; part: string } | null = null;
  let shown: { stage: number; part: string; model: boolean } | null = null;
  const assets = new Map<number, ModelAsset>();
  const failed = new Set<number>();
  const loading = new Set<number>();
  const fired = new Set<number>();   /* loads whose timeout has passed */
  let preloaded: number | null = null;
  let modelAttr: "loading" | "model" | "fallback" = "loading";
  let lookStill = false;
  let onscreen = false;
  let started = false;
  let dead = false;
  let dirty = false;
  let raf = 0;
  let until = 0;
  /* the loop's clock (ms, capped steps), the frame before, the emote machine, and when the
     fade after an emote ends */
  let tm = 0, last = 0, parkAt = 0, parking = false, idleFlag = false;
  let es: EmoteState = REST;
  let frames = 0;
  let orbit = new Orbit(orbitOptions(false));
  let unbind: (() => void) | null = null;
  let zoomOn = false;
  let poseVer = -1;
  let ro: ResizeObserver | null = null;
  let io: IntersectionObserver | null = null;
  let settle: (ok: boolean) => void = () => {};
  const ready = new Promise<boolean>((res) => { settle = res; });

  function orbitOptions(zoom: boolean) {
    return { pitch: [-0.2, 1.0] as [number, number], inertia: !still(), zoom, zoomRange: [0.6, 2] as [number, number] };
  }

  const setState = (s: "loading" | "3d" | "flat"): void => {
    state = s;
    box.setAttribute("data-state", s);
    host.setAttribute("data-state", s);
  };
  const setModel = (m: "loading" | "model" | "fallback"): void => {
    modelAttr = m;
    box.setAttribute("data-model", m);
    host.setAttribute("data-model", m);
    if (loadEl && m !== "loading") loadEl.hidden = true;
    /* the buttons have nothing to do when the drawn form stays */
    if (emotes) emotes.show(m !== "fallback");
  };
  setState("loading");
  setModel("loading");

  function flat(): void {
    if (state === "flat") return;
    cancel();
    setState("flat");
    setModel("fallback");
    teardown();
    if (onState) onState("flat");
    settle(false);
  }

  /* in the order things depend on each other: the figure, the environment, the renderer's
     settings, the kit (which frees the assets), then the renderer itself */
  function teardown(): void {
    if (unbind) { unbind(); unbind = null; }
    if (stageEl && stageEl.parentNode) stageEl.parentNode.removeChild(stageEl);
    stageEl = loadEl = loadBar = null;
    if (scene) { try { scene.dispose(); } catch { /* gone */ } scene = null; }
    if (env) { try { env.dispose(); } catch { /* gone */ } env = null; }
    /* the renderer is disposed just below, so this puts back settings nothing will read; kept for a renderer that outlives the view */
    if (restore) { try { restore(); } catch { /* gone */ } restore = null; }
    if (kit) { try { kit.dispose(); } catch { /* gone */ } kit = null; }
    if (renderer) { try { renderer.dispose(); } catch { /* gone */ } renderer = null; }
    canvas = null;
    shown = null;
    assets.clear();
    if (emotes) emotes.enable(false);
  }

  function cancel(): void {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  }

  const canDraw = (): boolean => !!(scene && renderer && (onscreen || host !== box) && !document.hidden);

  function size(): void {
    if (!renderer || !scene) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(pixelRatio(TIERS[tier], window.devicePixelRatio || 1, w, h));
    renderer.setSize(w, h, false);
    scene.frame(w, h);
    dirty = true;
  }

  function draw(): void {
    if (!renderer || !scene) return;
    dirty = false;
    if (orbit.version !== poseVer) { poseVer = orbit.version; scene.pose(orbit.pose()); }
    frames++;
    renderer.render(scene.scene, scene.camera);
  }

  function ambient(): boolean { return TIERS[tier].ambient && until > now() && !still(); }

  /* an emote on, or the fade after one */
  const emoting = (): boolean => es.playing !== null || tm < parkAt;

  function loop(t: number): void {
    raf = 0;
    if (!canDraw()) { last = 0; return; }
    tm += last ? Math.min(t - last, 100) : 0;
    last = t;
    const amb = ambient();
    const busy = emoting();
    /* an emote is never cut by the end of the ambient window */
    const on = amb || (busy && idleFlag);
    idleFlag = on;
    if (!on && !busy && parking) { scene!.idle(tm, true); parking = false; }
    scene!.idle(tm, on);
    const moving = orbit.step(t);
    draw();
    if (amb || busy || moving || scene!.active()) { raf = window.requestAnimationFrame(loop); return; }
    last = 0;
  }

  function request(): void {
    dirty = true;
    if (!raf && canDraw()) raf = window.requestAnimationFrame(loop);
  }

  function wake(): void {
    if (state !== "3d") return;
    if (TIERS[tier].ambient && !still()) until = now() + AMBIENT_MS;
    /* Study mode or reduced motion changed since the model was made: make it again */
    if (shown && shown.model && lookStill !== still()) { shown = null; apply(); }
    request();
  }

  function root(): string {
    try { return String(window.BMSite.rootPrefix() || ""); } catch { return ""; }
  }

  function keep(): void {
    if (!kit) return;
    const k = [shown ? shown.stage : 0];
    if (preloaded !== null) k.push(preloaded);
    kit.evict(k);
    for (const n of [...assets.keys()]) if (!k.includes(n)) assets.delete(n);
  }

  function showToon(w: { stage: number; part: string }): void {
    if (!scene) return;
    if (env) env.detach();
    scene.show(w.stage, w.part);
    shown = { stage: w.stage, part: w.part, model: false };
    es = REST;
    parkAt = 0;
    parking = false;
    idleFlag = false;
    if (emotes) { emotes.set(null); emotes.enable(false); }
  }

  function runCmds(cmds: Cmd[]): void {
    const look = scene && scene.look;
    const missing: string[] = [];
    for (const c of cmds) {
      if (c.type === "play") {
        const ok = !!look && "run" in look && look.run({ type: "play", clip: c.clip, from: c.from, ms: c.ms });
        if (!ok) missing.push(c.clip);
      } else if (emotes) emotes.set(c.emote);
    }
    /* a clip the file lacks never finishes: the machine hears that it did, so it rests */
    for (const clip of missing) {
      const [next, more] = finished(es, clip);
      es = next;
      if (more.length) runCmds(more);
    }
  }

  function adopt(asset: ModelAsset, w: { stage: number; part: string }): void {
    if (!scene || !kit || !env) return;
    const look = kit.makeLook(asset, still());
    lookStill = still();
    env.attach(scene.scene);
    scene.adopt(look, w.part, (modelFor(w.stage) || { height: 1 }).height);
    shown = { stage: w.stage, part: w.part, model: true };
    es = REST;
    parkAt = 0;
    parking = false;
    idleFlag = false;
    look.onFinished((clip) => {
      const [next, cmds] = finished(es, clip);
      es = next;
      runCmds(cmds);
      if (cmds.some((c) => c.type === "play")) {
        parkAt = tm + FADE_MS;
        parking = true;
        request();
      }
    });
    const m = modelFor(w.stage);
    if (emotes) { emotes.set(null); emotes.enable(!!m && m.clips.length > 0); }
    setModel("model");
    keep();
    size();
    request();
  }

  function onProgress(s: LoadState): void {
    if (!want || s.stage !== want.stage || !loadBar || !loadEl) return;
    loadEl.hidden = !(s.total > 0) || modelAttr !== "loading";
    loadBar.style.width = s.total > 0 ? Math.min(100, Math.round((s.loaded / s.total) * 100)) + "%" : "0%";
  }

  /* fetch a stage's model; whenever it arrives, and the stage is still the one wanted,
     it replaces the drawn form */
  function fetchModel(stage: number): void {
    if (!kit) return;
    /* shown again while its load is pending and its timer already fired: no new timer */
    if (loading.has(stage)) { if (fired.has(stage)) setModel("fallback"); return; }
    loading.add(stage);
    const timer = window.setTimeout(() => {
      fired.add(stage);
      if (!dead && want && want.stage === stage && shown && !shown.model) setModel("fallback");
    }, timeoutMs);
    kit.load(stage, root(), onProgress).then((asset) => {
      window.clearTimeout(timer);
      loading.delete(stage);
      fired.delete(stage);
      assets.set(stage, asset);
      if (dead || !scene || !want || want.stage !== stage) return;
      if (shown && shown.model && shown.stage === stage && shown.part === want.part) return;
      adopt(asset, want);
    }, () => {
      window.clearTimeout(timer);
      loading.delete(stage);
      fired.delete(stage);
      failed.add(stage);
      if (want && want.stage === stage) setModel("fallback");
    });
  }

  function apply(): void {
    if (!scene || !want) return;
    if (shown && shown.stage === want.stage && shown.part === want.part) return;
    const w = { stage: want.stage, part: want.part };
    const asset = assets.get(w.stage);
    if (kit && env && asset) {
      adopt(asset, w);
      return;
    }
    showToon(w);
    if (!kit) setModel("loading");
    else if (failed.has(w.stage)) setModel("fallback");
    else {
      setModel("loading");
      if (loadEl) { loadEl.hidden = true; if (loadBar) loadBar.style.width = "0%"; }
      fetchModel(w.stage);
    }
    size();
    request();
  }

  /* the model chunk, once the drawn form is up: the kit, the renderer's settings for models,
     the environment; any failure leaves the drawn form */
  async function bring(): Promise<void> {
    try {
      const m = await import("../model/index.ts");
      timeoutMs = m.LOAD_TIMEOUT_MS;
      const k = await m.createModelKit();
      if (dead || !renderer || !scene) { k.dispose(); return; }
      kit = k;
      restore = k.setupRenderer(renderer);
      env = k.makeEnv(renderer, tier);
      if (preloaded !== null) k.preload(preloaded, root());
      shown = null;
      apply();
    } catch {
      if (!dead) setModel("fallback");
    }
  }

  function makeStage(): void {
    const el = document.createElement("div");
    el.className = "form-stage";
    el.tabIndex = 0;
    el.setAttribute("role", "group");   /* a role that takes a name and a role description */
    el.setAttribute("aria-roledescription", "3D viewer");
    if (labelText) el.setAttribute("aria-label", labelText);
    loadEl = document.createElement("span");
    loadEl.className = "form-load";
    loadEl.setAttribute("aria-hidden", "true");
    loadEl.hidden = true;
    loadBar = document.createElement("span");
    loadEl.appendChild(loadBar);
    el.appendChild(canvas!);
    el.appendChild(loadEl);
    stageEl = el;
    host.appendChild(el);
    bindStage();
  }

  /* one Orbit per stage element; the dialog's has zoom, and keeps the turn the inline one had */
  function bindStage(): void {
    if (unbind) { unbind(); unbind = null; }
    if (!stageEl) return;
    const p = orbit.pose();
    orbit = new Orbit(orbitOptions(zoomOn), p.yaw, p.pitch);
    poseVer = -1;
    unbind = bindOrbit(stageEl, orbit, () => { orbit.setInertia(!still()); request(); });
  }

  async function start(): Promise<void> {
    if (started || dead) return;
    started = true;
    try {
      const B = window.BM3D;
      if (!B || typeof B.load !== "function" || !B.supported()) { flat(); return; }
      const choice = detectTier(readProbe(B), prefs());
      if (choice.tier === "list") { flat(); return; }
      tier = choice.tier;
      if (!(await B.load()) || !B.THREE) { flat(); return; }
      const mod = await import("../world/form-scene.ts");
      if (dead || state === "flat") return;
      const T = B.THREE;
      /* this page has no map to share the setting with; set before the scene reads its palette */
      T.ColorManagement.enabled = true;
      renderer = new T.WebGLRenderer({ antialias: TIERS[tier].antialias, alpha: true, powerPreference: "low-power" }) as WebGLRenderer;
      renderer.outputColorSpace = SRGB;
      renderer.setClearColor(0x000000, 0);
      canvas = renderer.domElement;
      canvas.className = "form-canvas";
      canvas.setAttribute("aria-hidden", "true");
      canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); flat(); }, false);
      scene = mod.createFormScene(T, probe);
      makeStage();
      setState("3d");
      if (ro) ro.observe(host);
      apply();
      size();
      draw();
      if (onState) onState("3d");
      settle(true);
      wake();
      void bring();
    } catch {
      flat();
    }
  }

  function snapshot(stage: number, part: string, px: number): string | null {
    if (state !== "3d" || !renderer || !scene || !canvas || document.hidden) return null;
    try {
      const r = renderer, s = scene;
      const ratio = r.getPixelRatio();
      /* the strip's pictures are the drawn form in the default pose (card V-9 changes this) */
      showToon({ stage, part });
      s.idle(0, false);
      s.pose({ yaw: 0, pitch: DEFAULT_PITCH, zoom: 1 });
      r.setPixelRatio(1);
      r.setSize(px, px, false);
      s.frame(px, px);
      r.render(s.scene, s.camera);
      const url = canvas.toDataURL();
      /* back to what was shown, at the box's size */
      r.setPixelRatio(ratio);
      shown = null;
      poseVer = -1;
      apply();
      size();
      draw();
      return url;
    } catch {
      return null;
    }
  }

  function moveTo(parent: HTMLElement, opts?: { zoom: boolean }): void {
    if (ro) ro.unobserve(host);
    if (host !== box) host.removeEventListener("pointerenter", onEnter);
    const old = host;
    host = parent;
    if (stageEl) host.appendChild(stageEl);
    host.setAttribute("data-state", state);
    host.setAttribute("data-model", modelAttr);
    if (old !== box) { old.removeAttribute("data-state"); old.removeAttribute("data-model"); }
    if (ro) ro.observe(host);
    host.addEventListener("pointerenter", onEnter);
    zoomOn = !!(opts && opts.zoom);
    bindStage();
    size();
    request();
  }

  function play(emote: Emote): void {
    if (state !== "3d" || !scene || !shown || !shown.model) return;
    const [next, cmds] = press(es, emote);
    es = next;
    parkAt = 0;
    parking = false;
    /* the wake first, and the idle running before the cross-fade starts from it: an idle
       that the next frame had to start would cut the fade and play over the emote */
    if (TIERS[tier].ambient && !still()) until = now() + AMBIENT_MS;
    idleFlag = ambient();
    scene.idle(tm, idleFlag);
    runCmds(cmds);
    wake();
  }

  const onVisible = (): void => { if (!document.hidden) request(); else cancel(); };
  const onEnter = (): void => wake();
  const onHide = (e: PageTransitionEvent): void => { if (e.persisted) cancel(); else dispose(); };

  function dispose(): void {
    if (dead) return;
    dead = true;
    cancel();
    if (ro) ro.disconnect();
    if (io) io.disconnect();
    ro = io = null;
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("pagehide", onHide);
    box.removeEventListener("pointerenter", onEnter);
    teardown();
    settle(false);
  }

  if (window.ResizeObserver) {
    ro = new ResizeObserver(() => { size(); request(); });
    ro.observe(host);
  }
  if (window.IntersectionObserver) {
    io = new IntersectionObserver((entries) => {
      onscreen = entries[entries.length - 1].isIntersecting;
      if (onscreen) { void start(); wake(); }
    }, { rootMargin: "120px" });
    io.observe(box);
  } else {
    onscreen = true;
    void start();
  }
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pagehide", onHide);
  box.addEventListener("pointerenter", onEnter);

  return {
    ready,
    get state() { return state; },
    show(stage, part) { want = { stage, part }; apply(); },
    snapshot, wake,
    repaint() { if (scene) { scene.repaint(); request(); } },
    moveTo,
    label(text) {
      labelText = text;
      if (stageEl && stageEl.getAttribute("aria-label") !== text) stageEl.setAttribute("aria-label", text);
    },
    play,
    preload(stage) {
      preloaded = stage;
      if (kit) kit.preload(stage, root());
    },
    info() {
      const m = renderer ? renderer.info.memory : null;
      return {
        state, model: box.dataset.model, stage: shown ? shown.stage : null, yaw: orbit.pose().yaw, frames,
        memory: m ? { geometries: m.geometries, textures: m.textures } : null,
        clips: scene && scene.look && "weights" in scene.look ? scene.look.weights() : {}
      };
    },
    dispose
  };
}
