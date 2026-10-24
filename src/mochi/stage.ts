/* Mochi's stage: the renderer, camera, frame loop and observers around an avatar
   (src/mochi/avatar.ts). It draws a transparent canvas appended to a
   host element, drawn only while the host is on screen (an IntersectionObserver with a
   120 px margin), the page is visible and the stage is not disposed; dt capped at 100 ms;
   a lost graphics context disposes the stage (the caller then shows its still image).

   Frames: every frame while a crossfade or an idle variation runs, otherwise at most every
   33 ms. Under reduced motion (opts.still()) the loop runs only through a crossfade and then
   holds the frame; wake() or the next setMood starts it again. The Three.js core comes in as
   `T`; the tier's pixel ratio comes in as a function, because this chunk imports nothing
   else from src/ (src/world/tiers.ts would drag it onto another chunk).

   Who calls it: src/mochi/index.ts (createMochiStage); the companion (a later card) holds
   the MochiStage it returns. While motion is allowed the avatar group bobs and rolls a hair
   (sway) and opts.tick(t) is called after each drawn frame; under still() it rests and no tick.
   Nothing is written to the console. */
import type { WebGLRenderer, Scene, PerspectiveCamera } from "three";
import type { Avatar } from "./avatar.ts";
import { drawDue } from "./avatar.ts";
import type { MochiInfo, MochiStage, MochiStageOptions, MochiState } from "./index.ts";

/* three's SRGBColorSpace is the string "srgb"; spelled here so no vendor name is needed */
const SRGB = "srgb" as WebGLRenderer["outputColorSpace"];
const FRAME_GAP_MS = 33;
const DT_CAP_MS = 100;
/* scene units: Mochi is about 1.4 tall, so 0.045 is about 3 % of its height (2 px at 8rem); periods are 2*pi*ms (about 5.7 s and 8.8 s) */
const BOB_AMP = 0.045, BOB_DIV_MS = 900, ROLL_AMP = 0.02, ROLL_DIV_MS = 1400;

/** the swim bob (y, scene units) and roll (rz, radians) at time t; both zero at 0 */
export function sway(tMs: number): { y: number; rz: number } {
  return { y: BOB_AMP * Math.sin(tMs / BOB_DIV_MS), rz: ROLL_AMP * Math.sin(tMs / ROLL_DIV_MS) };
}

export function createStage(T: any, host: HTMLElement, avatar: Avatar, opts: MochiStageOptions): MochiStage {
  const renderer = new T.WebGLRenderer({ antialias: opts.budget.antialias, alpha: true, powerPreference: "low-power" }) as WebGLRenderer;
  renderer.outputColorSpace = SRGB;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = "companion-canvas";
  canvas.setAttribute("aria-hidden", "true");

  const scene = new T.Scene() as Scene;
  scene.add(avatar.object);
  const restY = avatar.object.position.y, restRz = avatar.object.rotation.z;
  const camera = new T.PerspectiveCamera(32, 1, 0.1, 50) as PerspectiveCamera;
  camera.position.set(-0.3, 1.1, 3.9);
  camera.lookAt(0, 0.72, 0);

  let disposed = false, onscreen = true, pageHidden = false, lost = false;
  let raf = 0, last = 0, lastDraw = 0, pending = 0, frames = 0;
  let swayed = false;   /* the last drawn frame carried the bob, so a stop under still() draws the rest pose first */
  let ro: ResizeObserver | null = null, io: IntersectionObserver | null = null;

  const paused = (): boolean => document.hidden || pageHidden;
  const canDraw = (): boolean => !disposed && onscreen && !paused();
  const still = (): boolean => { try { return !!opts.still(); } catch { return false; } };

  function size(): void {
    if (disposed) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(opts.pixelRatio(w, h));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function draw(): void {
    if (disposed) return;
    frames++;
    renderer.render(scene, camera);
  }

  function cancel(): void {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  }

  function loop(t: number): void {
    raf = 0;
    if (!canDraw()) { last = 0; return; }
    pending += last ? Math.min(t - last, DT_CAP_MS) : 0;
    last = t;
    const busy = avatar.busy();
    if (drawDue(busy, t - lastDraw, FRAME_GAP_MS)) {
      avatar.update(pending / 1000);
      pending = 0;
      lastDraw = t;
      /* still() holds the rest pose, so a held frame never sits mid-bob */
      const moving = !still();
      pose(moving ? sway(t) : null);
      draw();
      if (moving && !disposed && typeof opts.tick === "function") { try { opts.tick(t); } catch { /* the caller's */ } }
    }
    /* under reduced motion only a crossfade, or a variation already under way, keeps the loop going; the frame is then held */
    if (still() ? avatar.busy() : true) { raf = window.requestAnimationFrame(loop); return; }
    /* a stop between throttled frames (the switch flipped since the last draw) would hold a frame mid-bob */
    if (swayed) { pose(null); draw(); }
    last = 0;
    pending = 0;
  }

  /* the group at rest plus the bob (s), or at rest alone */
  function pose(s: { y: number; rz: number } | null): void {
    avatar.object.position.y = restY + (s ? s.y : 0);
    avatar.object.rotation.z = restRz + (s ? s.rz : 0);
    swayed = !!s;
  }

  function request(): void {
    if (!raf && canDraw()) raf = window.requestAnimationFrame(loop);
  }

  function setState(s: MochiState, why?: string): void {
    if (opts.onState) { try { opts.onState(s, why); } catch { /* the caller's */ } }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    cancel();
    if (ro) ro.disconnect();
    if (io) io.disconnect();
    ro = io = null;
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("pagehide", onHide);
    window.removeEventListener("pageshow", onShow);
    canvas.removeEventListener("webglcontextlost", onLost, false);
    avatar.dispose();
    try { scene.clear(); } catch { /* gone */ }
    /* a context the browser already took is not lost again (Chrome would log it) */
    try { renderer.dispose(); if (!lost) renderer.forceContextLoss(); } catch { /* gone */ }
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    setState("disposed");
  }

  function onLost(e: Event): void {
    e.preventDefault();
    lost = true;
    setState("lost");
    dispose();
  }
  function onVisible(): void {
    if (document.hidden) cancel(); else { last = 0; request(); }
  }
  function onHide(e: PageTransitionEvent): void {
    if (e.persisted) { pageHidden = true; cancel(); } else dispose();
  }
  function onShow(e: PageTransitionEvent): void {
    if (e.persisted) { pageHidden = false; last = 0; request(); }
  }

  /* a throw from here on (a shader that fails on the first frame, say) leaves nothing behind:
     the listeners, observers, renderer and canvas go with dispose() before the caller hears */
  try {
    canvas.addEventListener("webglcontextlost", onLost, false);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    host.appendChild(canvas);
    if (window.ResizeObserver) {
      ro = new ResizeObserver(() => { size(); if (canDraw()) draw(); request(); });
      ro.observe(host);
    }
    if (window.IntersectionObserver) {
      io = new IntersectionObserver((entries) => {
        onscreen = entries[entries.length - 1].isIntersecting;
        if (onscreen) request(); else cancel();
      }, { rootMargin: "120px" });
      io.observe(host);
    }
    size();
    avatar.update(0);
    draw();
  } catch (e) {
    dispose();
    throw e;
  }

  return {
    canvas,
    setMood(name, fadeS) {
      const ok = avatar.setMood(name, fadeS);
      if (ok) request();
      return ok;
    },
    setMorph(name, weight) { avatar.setMorph(name, weight); if (!raf && canDraw()) draw(); },
    setGrowth(look) { avatar.setGrowth(look); if (!raf && canDraw()) draw(); },
    playIdleVariation(name) {
      const ok = avatar.playIdleVariation(name);
      if (ok) request();
      return ok;
    },
    moods: () => avatar.moods(),
    info(): MochiInfo {
      return { state: disposed ? "disposed" : "ready", frames, paused: paused() || !onscreen, ...avatar.stats() };
    },
    wake() { request(); },
    dispose,
  };
}
