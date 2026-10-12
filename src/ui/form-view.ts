/* The 3D view of a form on the progress page (src/ui/forms.ts is the panel around it).

   One WebGLRenderer, made as the course map's is (assets/map3d.js): alpha, so the panel
   shows through, low power, no colour conversion, and its tier from src/world/tiers.ts. The
   canvas lives in the view box (or, while the "View larger" dialog is open, in the dialog's
   box) and is sized by it. Nothing is fetched until the box nears the screen; then
   Three.js (BM3D.load()) and the scene (src/world/form-scene.ts, in the world chunk).

   Frames are drawn on demand: one after a change, and for AMBIENT_MS after the box scrolls
   into view or the pointer enters it, the form's idle motion, then one at rest. Never while
   the box is offscreen or the tab hidden, and under reduced motion or Study mode (BMFx.still)
   only single frames. A lost context, no WebGL, the list tier or a failed import leaves the
   box in its "flat" state: the fallback card forms.ts put there is what shows.

   The box's data-state: "loading" (the fallback card), "3d" (the canvas), "flat" (the
   fallback card, for good). */

import { detectTier, readProbe, pixelRatio, TIERS, AMBIENT_MS, type Quality } from "../world/tiers.ts";
import type { FormScene } from "../world/form-scene.ts";
import type { WebGLRenderer } from "three";

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
  /** the canvas goes into another box (the dialog); the box it came from keeps its fallback */
  moveTo(parent: HTMLElement): void;
  dispose(): void;
}

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

export function createFormView(box: HTMLElement, probe: Element, onState?: (s: "3d" | "flat") => void): FormView {
  let host: HTMLElement = box;
  let state: "loading" | "3d" | "flat" = "loading";
  let renderer: WebGLRenderer | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let scene: FormScene | null = null;
  let tier: Quality = "medium";
  let want: { stage: number; part: string } | null = null;
  let shown: { stage: number; part: string } | null = null;
  let onscreen = false;
  let started = false;
  let dead = false;
  let dirty = false;
  let raf = 0;
  let until = 0;
  let amb = { t: 0, last: 0 };
  let ro: ResizeObserver | null = null;
  let io: IntersectionObserver | null = null;
  let settle: (ok: boolean) => void = () => {};
  const ready = new Promise<boolean>((res) => { settle = res; });

  const setState = (s: "loading" | "3d" | "flat"): void => {
    state = s;
    box.setAttribute("data-state", s);
    host.setAttribute("data-state", s);
  };
  setState("loading");

  function flat(): void {
    if (state === "flat") return;
    cancel();
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    setState("flat");
    teardown();
    if (onState) onState("flat");
    settle(false);
  }

  function teardown(): void {
    if (scene) { try { scene.dispose(); } catch { /* gone */ } scene = null; }
    if (renderer) { try { renderer.dispose(); } catch { /* gone */ } renderer = null; }
    canvas = null;
    shown = null;
  }

  function cancel(): void {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    amb = { t: 0, last: 0 };
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
    renderer.render(scene.scene, scene.camera);
  }

  function ambient(): boolean { return TIERS[tier].ambient && until > now() && !still(); }

  function loop(t: number): void {
    raf = 0;
    if (!canDraw()) return;
    if (ambient()) {
      if (amb.last) amb.t += Math.min(t - amb.last, 100);
      amb.last = t;
      scene!.idle(amb.t, true);
      draw();
      raf = window.requestAnimationFrame(loop);
      return;
    }
    /* the motion is over (or was never on): one frame at rest */
    if (amb.last) { amb = { t: 0, last: 0 }; until = 0; scene!.idle(0, false); dirty = true; }
    if (dirty) draw();
  }

  function request(): void {
    dirty = true;
    if (!raf && canDraw()) raf = window.requestAnimationFrame(loop);
  }

  function wake(): void {
    if (state !== "3d") return;
    if (TIERS[tier].ambient && !still()) until = now() + AMBIENT_MS;
    request();
  }

  function apply(): void {
    if (!scene || !want) return;
    if (shown && shown.stage === want.stage && shown.part === want.part) return;
    scene.show(want.stage, want.part);
    shown = { stage: want.stage, part: want.part };
    size();
    request();
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
      T.ColorManagement.enabled = false;
      renderer = new T.WebGLRenderer({ antialias: TIERS[tier].antialias, alpha: true, powerPreference: "low-power" }) as WebGLRenderer;
      renderer.outputColorSpace = T.LinearSRGBColorSpace;
      renderer.setClearColor(0x000000, 0);
      canvas = renderer.domElement;
      canvas.className = "form-canvas";
      canvas.setAttribute("aria-hidden", "true");
      canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); flat(); }, false);
      scene = mod.createFormScene(T, probe);
      host.appendChild(canvas);
      setState("3d");
      if (ro) ro.observe(host);
      apply();
      size();
      draw();
      if (onState) onState("3d");
      settle(true);
      wake();
    } catch {
      flat();
    }
  }

  function snapshot(stage: number, part: string, px: number): string | null {
    if (state !== "3d" || !renderer || !scene || !canvas) return null;
    try {
      const r = renderer, s = scene;
      const ratio = r.getPixelRatio();
      const prev = shown;
      s.show(stage, part);
      s.idle(0, false);
      r.setPixelRatio(1);
      r.setSize(px, px, false);
      s.frame(px, px);
      r.render(s.scene, s.camera);
      const url = canvas.toDataURL();
      /* back to what was shown, at the box's size */
      r.setPixelRatio(ratio);
      shown = null;
      if (prev) { s.show(prev.stage, prev.part); shown = prev; } else if (want) { apply(); }
      size();
      draw();
      return url;
    } catch {
      return null;
    }
  }

  function moveTo(parent: HTMLElement): void {
    if (ro) ro.unobserve(host);
    if (host !== box) host.removeEventListener("pointerenter", onEnter);
    const old = host;
    host = parent;
    if (canvas) host.appendChild(canvas);
    host.setAttribute("data-state", state);
    if (old !== box) old.removeAttribute("data-state");
    if (ro) ro.observe(host);
    host.addEventListener("pointerenter", onEnter);
    size();
    request();
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
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
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
    moveTo, dispose
  };
}
