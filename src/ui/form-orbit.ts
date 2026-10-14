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
/** the longest gap one step integrates over, in ms (a stalled frame, a hidden tab) */
export const MAX_STEP_MS = 64;
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
  private _version = 0;

  private opts: OrbitOptions;

  constructor(opts: OrbitOptions, yaw = 0, pitch = DEFAULT_PITCH) {
    this.opts = { ...opts, pitch: [opts.pitch[0], opts.pitch[1]], zoomRange: [opts.zoomRange[0], opts.zoomRange[1]] };
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
    if (dx !== 0 || (pitchToo && dy !== 0)) this._version++;
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

  /** the pointer was taken away (a cancelled touch, a second finger, an unbind): stop, no coast */
  cancel(): void {
    this.dragging = false;
    this.vel = 0;
    this.lastStep = -1;
  }

  /** inertia on or off at run time (reduced motion can change while the page is open) */
  setInertia(on: boolean): void {
    this.opts.inertia = on;
    if (!on) this.vel = 0;
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
    this._version++;
    return true;
  }

  wheel(deltaY: number): boolean {
    if (!this.opts.zoom) return false;
    this.pinch(Math.exp(-deltaY * WHEEL_ZOOM));
    return true;
  }

  pinch(scale: number): void {
    if (!this.opts.zoom || !(scale > 0) || !isFinite(scale)) return;
    this.zoom = clamp(this.zoom * scale, this.opts.zoomRange[0], this.opts.zoomRange[1]);
    this._version++;
  }

  /** the coast after a flick: true while the pose is still changing on its own. A drag
      in progress returns false: its moves bump `version` and the binder asks for a
      frame on each, so a held, still pointer costs no frames. A gap between steps is
      capped at MAX_STEP_MS, so a stalled or hidden tab does not fling the figure. */
  step(t: number): boolean {
    if (this.dragging) { this.lastStep = t; return false; }
    if (Math.abs(this.vel) < STOP_BELOW) { this.vel = 0; this.lastStep = t; return false; }
    const dt = this.lastStep < 0 ? 0 : Math.min(MAX_STEP_MS, Math.max(0, t - this.lastStep));
    this.lastStep = t;
    if (dt > 0) {
      this.yaw += this.vel * dt;
      this.vel *= Math.exp(-DECAY_PER_MS * dt);
      this._version++;
    }
    if (Math.abs(this.vel) < STOP_BELOW) { this.vel = 0; return false; }
    return true;
  }

  /** whether wheel and pinch are on (the dialog) */
  get hasZoom(): boolean { return this.opts.zoom; }

  /** counts up on every change of the pose, so a view draws only when it moved */
  get version(): number { return this._version; }

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
    this._version++;
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
    if (pts.size === 2 && zoomOn) { pinchDist = dist(); orbit.cancel(); delete el.dataset.drag; }
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
      /* a touch turns yaw only where the page may scroll under it (touch-action: pan-y);
         in the dialog, where zoom is on and touch-action is none, it pitches too */
      orbit.move(e.clientX, e.clientY, e.timeStamp, e.pointerType === "mouse" || zoomOn);
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
  const cancelled = (e: PointerEvent) => {
    /* the browser took the pointer (a vertical pan on touch): stop without a coast */
    pts.delete(e.pointerId);
    pinchDist = 0;
    orbit.cancel();
    delete el.dataset.drag;
    onChange();
  };
  const keyed = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (orbit.key(e.code)) { e.preventDefault(); onChange(); }
  };
  const wheeled = (e: WheelEvent) => {
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;   /* lines, pages -> pixels */
    if (orbit.wheel(dy)) { e.preventDefault(); onChange(); }
  };

  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", moved);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", cancelled);
  el.dataset.formOrbit = "";   /* src/ui/keys.ts: the element keeps its arrow keys */
  el.addEventListener("keydown", keyed);
  if (zoomOn) el.addEventListener("wheel", wheeled, { passive: false });
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", moved);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", cancelled);
    el.removeEventListener("keydown", keyed);
    el.removeEventListener("wheel", wheeled);
    delete el.dataset.drag;
    delete el.dataset.formOrbit;
    pts.clear();
    orbit.cancel();
  };
}
