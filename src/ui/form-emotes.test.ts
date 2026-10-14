import { describe, expect, it } from "vitest";
import { FADE_MS, REST, finished, isEmote, mountEmotes, press } from "./form-emotes.ts";

describe("emote machine", () => {
  it("rest -> wave -> idle", () => {
    const [s1, c1] = press(REST, "wave", 10, false);
    expect(s1.playing).toBe("wave");
    expect(c1).toEqual([
      { type: "crossFade", from: "idle", to: "wave", ms: FADE_MS },
      { type: "pressed", emote: "wave" }
    ]);
    const [s2, c2] = finished(s1, "wave", 900);
    expect(s2).toEqual({ playing: null, since: 900, fading: true });
    expect(c2).toEqual([
      { type: "crossFade", from: "wave", to: "idle", ms: FADE_MS },
      { type: "pressed", emote: null }
    ]);
  });
  it("a second press cross-fades wave -> bow", () => {
    const [s1] = press(REST, "wave", 0, false);
    const [s2, c] = press(s1, "bow", 50, false);
    expect(s2.playing).toBe("bow");
    expect(c).toEqual([
      { type: "crossFade", from: "wave", to: "bow", ms: FADE_MS },
      { type: "pressed", emote: "bow" }
    ]);
  });
  it("the same emote restarts", () => {
    const [s1] = press(REST, "flex", 0, false);
    const [s2, c] = press(s1, "flex", 70, false);
    expect(s2.playing).toBe("flex");
    expect(s2.since).toBe(70);
    expect(c).toEqual([
      { type: "crossFade", from: "flex", to: "flex", ms: FADE_MS },
      { type: "pressed", emote: "flex" }
    ]);
  });
  it("a stale finish is ignored", () => {
    const [s1] = press(REST, "bow", 0, false);
    const [s2, c] = finished(s1, "wave", 5);
    expect(s2).toBe(s1);
    expect(c).toEqual([]);
    expect(finished(REST, "wave", 5)).toEqual([REST, []]);
  });
  it("does not mutate states", () => {
    const [s1] = press(REST, "wave", 1, false);
    const before = JSON.stringify(s1);
    press(s1, "spin", 2, false);
    finished(s1, "wave", 3);
    expect(JSON.stringify(s1)).toBe(before);
    expect(REST).toEqual({ playing: null, since: 0, fading: false });
  });
  it("isEmote rejects non-emotes", () => {
    expect(isEmote("wave")).toBe(true);
    for (const v of ["idle", "", null, undefined, 3]) expect(isEmote(v)).toBe(false);
  });
  it("still changes no commands", () => {
    expect(press(REST, "spin", 4, true)).toEqual(press(REST, "spin", 4, false));
  });
});

/* A tiny fake DOM: the unit tests run in Node (vitest.config.ts) and jsdom is not a dependency. */
class FakeEl {
  children: FakeEl[] = [];
  attrs: Record<string, string> = {};
  listeners: Record<string, ((e: unknown) => void)[]> = {};
  parent: FakeEl | null = null;
  className = "";
  type = "";
  disabled = false;
  textContent = "";
  ownerDocument = { createElement: (): FakeEl => new FakeEl() };
  setAttribute(k: string, v: string): void { this.attrs[k] = v; }
  getAttribute(k: string): string | null { return k in this.attrs ? this.attrs[k] : null; }
  appendChild(c: FakeEl): FakeEl { c.parent = this; this.children.push(c); return c; }
  remove(): void { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  addEventListener(t: string, f: (e: unknown) => void): void { (this.listeners[t] ||= []).push(f); }
  removeEventListener(t: string, f: (e: unknown) => void): void { this.listeners[t] = (this.listeners[t] || []).filter((x) => x !== f); }
  closest(sel: string): FakeEl | null {
    const m = /^\[(.+)\]$/.exec(sel);
    return m && m[1] in this.attrs ? this : null;
  }
  click(): void { for (let n: FakeEl | null = this; n; n = n.parent) for (const f of n.listeners.click || []) f({ target: this }); }
}

describe("mountEmotes", () => {
  function setup() {
    const root = new FakeEl();
    const calls: string[] = [];
    const m = mountEmotes(root as unknown as HTMLElement, (e) => calls.push(e));
    const group = root.children[0];
    return { root, calls, m, group, btns: group.children };
  }
  it("renders four disabled buttons in a labelled group", () => {
    const { group, btns } = setup();
    expect(group.className).toBe("form-emotes");
    expect(group.attrs.role).toBe("group");
    expect(group.attrs["aria-label"]).toBe("Emotes");
    expect(btns.map((b) => b.textContent)).toEqual(["Wave", "Bow", "Flex", "Spin"]);
    expect(btns.every((b) => b.disabled && b.type === "button" && b.className === "btn ghost small")).toBe(true);
  });
  it("enable, click, set and clear", () => {
    const { calls, m, btns } = setup();
    m.enable(true);
    expect(btns.some((b) => b.disabled)).toBe(false);
    btns[3].click();
    expect(calls).toEqual(["spin"]);
    m.set("spin");
    expect(btns.map((b) => b.attrs["aria-pressed"])).toEqual(["false", "false", "false", "true"]);
    m.set(null);
    expect(btns.every((b) => b.attrs["aria-pressed"] === "false")).toBe(true);
  });
  it("dispose removes the group and the listener", () => {
    const { root, group, m } = setup();
    m.dispose();
    expect(root.children).toEqual([]);
    expect(group.listeners.click).toEqual([]);
  });
});
