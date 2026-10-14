/* The turning of a form's 3D view (src/ui/form-view.ts draws it; this decides the pose).

   Not Three's OrbitControls: that sets touch-action: none on its element, which stops the
   page scrolling under a finger over the inline view, pans on the arrow keys, and wants
   update() every frame with no sign of being settled for the on-demand loop to end on.

   Two halves. Orbit is plain numbers and no DOM: a yaw, a pitch, a zoom, the drag that
   moves them, the inertia after a flick, and step(t), which says whether it is still
   moving so the view can ask for another frame or stop. bindOrbit wires one element to an
   Orbit: pointer drag with capture, the arrow keys, the wheel and a two-finger pinch (the
   last two only where zoom is on, the dialog). A touch drag turns the form sideways only;
   its vertical part is left to the browser (CSS touch-action: pan-y) so the page scrolls.
   No requestAnimationFrame here: the view's loop calls step(t). */

export interface Pose { yaw: number; pitch: number; zoom: number }
export interface OrbitOptions { pitch: [number, number]; inertia: boolean; zoom: boolean; zoomRange: [number, number] }

/** radians above level, the viewer's default (PITCH in src/world/form-scene.ts) */
export const DEFAULT_PITCH = 0.3;
export const YAW_PER_PX = 0.01;
export const PITCH_PER_PX = 0.006;
export const KEY_STEP = 0.15;
/** the yaw velocity falls by e per 1/DECAY_PER_MS ms: a flick coasts about a second */
export const DECAY_PER_MS = 0.005;
/** rad/ms below which the coast is over */
export const STOP_BELOW = 1e-4;
const WHEEL_ZOOM = 0.001;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class Orbit {
  private yaw0: number;
  private pitch0: number;
  private yaw: number;
  private pitch: number;
  private zoom = 1;
  private vel = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private lastT = 0;
  private lastStep = -1;

  private readonly opts: OrbitOptions;

  constructor(opts: OrbitOptions, yaw = 0, pitch = DEFAULT_PITCH) {
    this.opts = opts;
    this.yaw0 = yaw;
    this.pitch0 = pitch;
    this.yaw = yaw;
    this.pitch = clamp(pitch, opts.pitch[0], opts.pitch[1]);
  }

  press(x: number, y: number, t: number): void {
    this.dragging = true;
    this.vel = 0;
    this.lastX = x;
    this.lastY = y;
    this.lastT = t;
  }

  move(x: number, y: number, t: number, pitchToo: boolean): void {
    if (!this.dragging) return;
    const dx = x - this.lastX;
    const dy = y - this.lastY;
    const dt = t - this.lastT;
    this.yaw += dx * YAW_PER_PX;
    if (pitchToo) this.pitch = clamp(this.pitch - dy * PITCH_PER_PX, this.opts.pitch[0], this.opts.pitch[1]);
    if (dt > 0) this.vel = (dx * YAW_PER_PX) / dt;
    this.lastX = x;
    this.lastY = y;
    this.lastT = t;
  }

  release(t: number): void {
    if (!this.dragging) return;
    this.dragging = false;
    /* a finger held still before it lifted does not coast */
    if (!this.opts.inertia || t - this.lastT > 100) this.vel = 0;
    this.lastStep = t;
  }

  key(code: string): boolean {
    const [lo, hi] = this.opts.pitch;
    switch (code) {
      case "ArrowLeft": this.yaw -= KEY_STEP; break;
      case "ArrowRight": this.yaw += KEY_STEP; break;
      case "ArrowUp": this.pitch = clamp(this.pitch + KEY_STEP, lo, hi); break;
      case "ArrowDown": this.pitch = clamp(this.pitch - KEY_STEP, lo, hi); break;
      default: return false;
    }
    this.vel = 0;
    return true;
  }

  wheel(deltaY: number): boolean {
    if (!this.opts.zoom) return false;
    this.pinch(Math.exp(-deltaY * WHEEL_ZOOM));
    return true;
  }

  pinch(scale: number): void {
    if (!this.opts.zoom || !(scale > 0)) return;
    this.zoom = clamp(this.zoom * scale, this.opts.zoomRange[0], this.opts.zoomRange[1]);
  }

  step(t: number): boolean {
    if (this.dragging) { this.lastStep = t; return true; }
    if (Math.abs(this.vel) < STOP_BELOW) { this.vel = 0; this.lastStep = t; return false; }
    const dt = this.lastStep < 0 ? 0 : Math.max(0, t - this.lastStep);
    this.lastStep = t;
    this.yaw += this.vel * dt;
    this.vel *= Math.exp(-DECAY_PER_MS * dt);
    if (Math.abs(this.vel) < STOP_BELOW) { this.vel = 0; return false; }
    return true;
  }

  /** whether wheel and pinch are on (the dialog) */
  get hasZoom(): boolean { return this.opts.zoom; }

  pose(): Pose {
    return { yaw: this.yaw, pitch: this.pitch, zoom: this.zoom };
  }

  reset(): void {
    this.yaw = this.yaw0;
    this.pitch = clamp(this.pitch0, this.opts.pitch[0], this.opts.pitch[1]);
    this.zoom = 1;
    this.vel = 0;
    this.dragging = false;
    this.lastStep = -1;
  }
}

/** Wire an element to an Orbit; returns the function that unwires it. onChange follows every
    input, so the view can ask for a frame. */
export function bindOrbit(el: HTMLElement, orbit: Orbit, onChange: () => void): () => void {
  const zoomOn = orbit.hasZoom;
  const pts = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;

  const dist = () => {
    const [a, b] = [...pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const down = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    try { el.setPointerCapture(e.pointerId); } catch { /* a pointer already gone */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && zoomOn) { pinchDist = dist(); orbit.release(e.timeStamp); delete el.dataset.drag; }
    else if (pts.size === 1) { orbit.press(e.clientX, e.clientY, e.timeStamp); el.dataset.drag = ""; }
    onChange();
  };
  const moved = (e: PointerEvent) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pts.size === 2 && zoomOn) {
      const d = dist();
      if (pinchDist > 0 && d > 0) orbit.pinch(d / pinchDist);
      pinchDist = d;
    } else if (pts.size === 1) {
      orbit.move(e.clientX, e.clientY, e.timeStamp, e.pointerType === "mouse");
    }
    onChange();
  };
  const up = (e: PointerEvent) => {
    if (!pts.delete(e.pointerId)) return;
    if (pts.size === 0) { orbit.release(e.timeStamp); delete el.dataset.drag; }
    else if (pts.size === 1) {
      const [r] = [...pts.values()];
      orbit.press(r.x, r.y, e.timeStamp);
      el.dataset.drag = "";
    }
    onChange();
  };
  const keyed = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (orbit.key(e.code)) { e.preventDefault(); onChange(); }
  };
  const wheeled = (e: WheelEvent) => {
    if (orbit.wheel(e.deltaY)) { e.preventDefault(); onChange(); }
  };

  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", moved);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("keydown", keyed);
  if (zoomOn) el.addEventListener("wheel", wheeled, { passive: false });
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", moved);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    el.removeEventListener("keydown", keyed);
    el.removeEventListener("wheel", wheeled);
    delete el.dataset.drag;
    pts.clear();
  };
}
