import { describe, expect, it } from "vitest";
import { FADE_MS, REST, finished, isEmote, mountEmotes, press, type EmoteState } from "./form-emotes.ts";

describe("the emote machine", () => {
  it("plays a clip from rest, fading from idle, and comes back to idle when it ends", () => {
    const [s1, c1] = press(REST, "wave");
    expect(s1).toEqual({ playing: "wave" });
    expect(c1).toEqual([
      { type: "play", clip: "wave", from: "idle", ms: FADE_MS },
      { type: "playing", emote: "wave" }
    ]);
    const [s2, c2] = finished(s1, "wave");
    expect(s2).toBe(REST);
    expect(c2).toEqual([
      { type: "play", clip: "idle", from: "wave", ms: FADE_MS },
      { type: "playing", emote: null }
    ]);
  });

  it("a second press mid-clip fades to the new clip", () => {
    const [s1] = press(REST, "wave");
    const [s2, c2] = press(s1, "bow");
    expect(s2).toEqual({ playing: "bow" });
    expect(c2[0]).toEqual({ type: "play", clip: "bow", from: "wave", ms: FADE_MS });
    expect(c2[1]).toEqual({ type: "playing", emote: "bow" });
  });

  it("the same emote pressed again restarts it alone, with no fade from itself", () => {
    const [s1] = press(REST, "flex");
    const [s2, c2] = press(s1, "flex");
    expect(s2).toEqual({ playing: "flex" });
    expect(c2[0]).toEqual({ type: "play", clip: "flex", from: null, ms: FADE_MS });
  });

  it("a finish for a clip that is not the one playing is ignored", () => {
    const [s1] = press(REST, "wave");
    const [s2] = press(s1, "bow");
    const [s3, c3] = finished(s2, "wave");
    expect(s3).toBe(s2);
    expect(c3).toEqual([]);
    const [s4, c4] = finished(REST, "wave");
    expect(s4).toBe(REST);
    expect(c4).toEqual([]);
  });

  it("never mutates a state, and REST is frozen", () => {
    const s: EmoteState = { playing: "spin" };
    const copy = { ...s };
    press(s, "wave");
    finished(s, "spin");
    expect(s).toEqual(copy);
    expect(Object.isFrozen(REST)).toBe(true);
    expect(Object.isFrozen(press(REST, "bow")[0])).toBe(true);
  });

  it("isEmote accepts the four and nothing else", () => {
    expect(["wave", "bow", "flex", "spin"].every(isEmote)).toBe(true);
    expect(["idle", "", null, undefined, 3, "Wave"].some(isEmote)).toBe(false);
  });
});

/* a small stand-in for the DOM: enough of Element for mountEmotes (Vitest runs in Node here) */
class FakeEl {
  tag: string;
  attrs: Record<string, string> = {};
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  textContent = "";
  className = "";
  type = "";
  listeners: Record<string, ((ev: { target: FakeEl }) => void)[]> = {};
  constructor(tag: string) { this.tag = tag; }
  get ownerDocument() { return { createElement: (t: string) => new FakeEl(t) }; }
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  getAttribute(k: string) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k: string) { delete this.attrs[k]; }
  appendChild(c: FakeEl) { c.parent = this; this.children.push(c); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  addEventListener(n: string, f: (ev: { target: FakeEl }) => void) { (this.listeners[n] ||= []).push(f); }
  removeEventListener(n: string, f: (ev: { target: FakeEl }) => void) { this.listeners[n] = (this.listeners[n] || []).filter(g => g !== f); }
  closest(sel: string): FakeEl | null {
    const attr = sel.replace(/^\[|\]$/g, "");
    let n: FakeEl | null = this;
    while (n) { if (attr in n.attrs) return n; n = n.parent; }
    return null;
  }
  click() {
    let n: FakeEl | null = this;
    while (n) { for (const f of n.listeners.click || []) f({ target: this }); n = n.parent; }
  }
}

describe("the emote buttons", () => {
  const mount = () => {
    const root = new FakeEl("div");
    const pressed: string[] = [];
    const row = mountEmotes(root as unknown as HTMLElement, e => pressed.push(e));
    const group = root.children[0];
    const btns = group.children.filter(c => c.tag === "button");
    const status = group.children.find(c => c.tag === "span")!;
    return { root, row, group, btns, status, pressed };
  };

  it("renders four plain buttons in a labelled group, disabled until enabled", () => {
    const { group, btns, status, pressed } = mount();
    expect(group.attrs.role).toBe("group");
    expect(group.attrs["aria-label"]).toBe("Emotes");
    expect(btns.map(b => b.textContent)).toEqual(["Wave", "Bow", "Flex", "Spin"]);
    expect(btns.map(b => b.attrs["data-emote"])).toEqual(["wave", "bow", "flex", "spin"]);
    expect(btns.every(b => b.attrs["aria-disabled"] === "true" && !("aria-pressed" in b.attrs))).toBe(true);
    expect(status.attrs["aria-live"]).toBe("polite");
    btns[3].click();
    expect(pressed).toEqual([]);
  });

  it("enabled, a click presses; set marks the one playing and tells the live region", () => {
    const { row, btns, status, pressed } = mount();
    row.enable(true);
    expect(btns.every(b => b.attrs["aria-disabled"] === "false")).toBe(true);
    btns[3].click();
    expect(pressed).toEqual(["spin"]);
    row.set("spin");
    expect(btns.map(b => "data-playing" in b.attrs)).toEqual([false, false, false, true]);
    expect(status.textContent).toBe("Playing: Spin");
    row.set(null);
    expect(btns.some(b => "data-playing" in b.attrs)).toBe(false);
    expect(status.textContent).toBe("");
    row.enable(false);
    btns[0].click();
    expect(pressed).toEqual(["spin"]);
  });

  it("dispose removes the group", () => {
    const { root, row } = mount();
    row.dispose();
    expect(root.children).toEqual([]);
  });
});
