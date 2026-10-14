/* The pure half of src/ui/form-orbit.ts: the pose a drag, a key, the wheel and a flick
   leave. The DOM binder is not tested here (Node, no DOM). */
import { describe, expect, it } from "vitest";
import { DEFAULT_PITCH, KEY_STEP, Orbit, PITCH_PER_PX, YAW_PER_PX, type OrbitOptions } from "./form-orbit.ts";

const base: OrbitOptions = { pitch: [-0.2, 0.8], inertia: true, zoom: false, zoomRange: [0.5, 2] };
const mk = (o: Partial<OrbitOptions> = {}) => new Orbit({ ...base, ...o });

describe("drag", () => {
  it("turns yaw by dx and pitch by -dy only with pitchToo", () => {
    const a = mk();
    a.press(0, 0, 0);
    a.move(50, 20, 16, true);
    expect(a.pose().yaw).toBeCloseTo(50 * YAW_PER_PX);
    expect(a.pose().pitch).toBeCloseTo(DEFAULT_PITCH - 20 * PITCH_PER_PX);
    const b = mk();
    b.press(0, 0, 0);
    b.move(50, 20, 16, false);
    expect(b.pose().pitch).toBe(DEFAULT_PITCH);
  });
  it("clamps pitch to the options", () => {
    const a = mk();
    a.press(0, 0, 0);
    a.move(0, -5000, 16, true);
    expect(a.pose().pitch).toBe(0.8);
    a.move(0, 5000, 32, true);
    expect(a.pose().pitch).toBe(-0.2);
  });
});

describe("inertia", () => {
  it("coasts after a fast release, then stops", () => {
    const a = mk();
    a.press(0, 0, 0);
    a.move(30, 0, 16, false);
    a.release(16);
    let t = 16;
    let last = a.pose().yaw;
    expect(a.step((t += 16))).toBe(true);
    expect(a.pose().yaw).toBeGreaterThan(last);
    let n = 0;
    while (a.step((t += 16)) && n++ < 3000 / 16) { /* coast */ }
    expect(n).toBeLessThan(3000 / 16);
    last = a.pose().yaw;
    expect(a.step((t += 16))).toBe(false);
    expect(a.pose().yaw).toBe(last);
  });
  it("does not coast with inertia off", () => {
    const a = mk({ inertia: false });
    a.press(0, 0, 0);
    a.move(30, 0, 16, false);
    a.release(16);
    expect(a.step(32)).toBe(false);
  });
  it("steps false while dragging: a move bumps the version instead, a still press costs nothing", () => {
    const a = mk();
    a.press(0, 0, 0);
    const v0 = a.version;
    expect(a.step(16)).toBe(false);
    expect(a.version).toBe(v0);
    a.move(10, 0, 16, false);
    expect(a.version).toBe(v0 + 1);
    a.move(10, 0, 32, false);
    expect(a.version).toBe(v0 + 1);
  });

  it("a cancelled pointer never coasts", () => {
    const a = mk();
    a.press(0, 0, 0);
    a.move(30, 0, 16, false);
    a.cancel();
    expect(a.step(32)).toBe(false);
    const y = a.pose().yaw;
    a.step(48);
    expect(a.pose().yaw).toBe(y);
  });

  it("inertia can be switched off at run time, which stops a coast at once", () => {
    const a = mk();
    a.press(0, 0, 0);
    a.move(30, 0, 16, false);
    a.release(16);
    expect(a.step(32)).toBe(true);
    a.setInertia(false);
    expect(a.step(48)).toBe(false);
    a.setInertia(true);
    a.press(0, 0, 100);
    a.move(30, 0, 116, false);
    a.release(116);
    expect(a.step(132)).toBe(true);
  });

  it("a long gap between steps is capped, so a stalled frame does not fling the figure", () => {
    const a = mk();
    a.press(0, 0, 0);
    a.move(30, 0, 16, false);
    a.release(16);
    a.step(17);
    const before = a.pose().yaw;
    a.step(5000);
    expect(a.pose().yaw - before).toBeLessThan(0.019 * 64 + 1e-9);
  });

  it("the version counts keys, pinches and resets", () => {
    const a = new Orbit({ pitch: [0, 1], inertia: true, zoom: true, zoomRange: [0.5, 2] });
    const v0 = a.version;
    a.key("ArrowLeft");
    a.pinch(1.5);
    a.reset();
    expect(a.version).toBe(v0 + 3);
    a.key("Enter");
    a.pinch(NaN);
    expect(a.version).toBe(v0 + 3);
  });
});

describe("keys", () => {
  it("turns by KEY_STEP and ignores other keys", () => {
    const a = mk();
    expect(a.key("ArrowLeft")).toBe(true);
    expect(a.pose().yaw).toBeCloseTo(-KEY_STEP);
    expect(a.key("ArrowRight")).toBe(true);
    expect(a.pose().yaw).toBeCloseTo(0);
    expect(a.key("ArrowUp")).toBe(true);
    expect(a.pose().pitch).toBeCloseTo(DEFAULT_PITCH + KEY_STEP);
    for (let i = 0; i < 20; i++) a.key("ArrowDown");
    expect(a.pose().pitch).toBe(-0.2);
    expect(a.key("Enter")).toBe(false);
  });
});

describe("zoom", () => {
  it("ignores the wheel and pinch with zoom off", () => {
    const a = mk();
    expect(a.wheel(-100)).toBe(false);
    a.pinch(2);
    expect(a.pose().zoom).toBe(1);
  });
  it("clamps the wheel and pinch with zoom on", () => {
    const a = mk({ zoom: true });
    expect(a.wheel(-100)).toBe(true);
    expect(a.pose().zoom).toBeGreaterThan(1);
    for (let i = 0; i < 100; i++) a.wheel(-500);
    expect(a.pose().zoom).toBe(2);
    a.pinch(0.001);
    expect(a.pose().zoom).toBe(0.5);
  });
});

describe("pose and reset", () => {
  it("returns a fresh object, and reset restores the defaults", () => {
    const a = mk({ zoom: true });
    expect(a.pose()).not.toBe(a.pose());
    a.key("ArrowRight");
    a.key("ArrowUp");
    a.pinch(1.5);
    a.reset();
    expect(a.pose()).toEqual({ yaw: 0, pitch: DEFAULT_PITCH, zoom: 1 });
  });
});
