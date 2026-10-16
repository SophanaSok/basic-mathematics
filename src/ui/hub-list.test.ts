import { afterEach, describe, expect, it } from "vitest";
import { decorate, hubInput, masteryLine } from "./hub-list.ts";
import { hubState } from "../world/state.ts";

/* a just-enough DOM: elements with children, text, attributes, and the two selectors decorate uses */
class El {
  tag: string; className = ""; textContent = ""; attrs: Record<string, string> = {}; kids: El[] = []; parent: El | null = null; text = false;
  ownerDocument: any;
  get parentNode() { return this.parent; }
  constructor(tag: string, doc: any) { this.tag = tag; this.ownerDocument = doc; }
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  appendChild(c: El) { c.parent = this; this.kids.push(c); return c; }
  remove() { if (this.parent) this.parent.kids = this.parent.kids.filter((k) => k !== this); this.parent = null; }
  get nextSibling() { const s = this.parent!.kids; return s[s.indexOf(this) + 1] || null; }
  insertBefore(c: El, ref: El | null) { c.parent = this; this.kids.splice(ref ? this.kids.indexOf(ref) : this.kids.length, 0, c); return c; }
  all(): El[] { return this.kids.flatMap((k) => [k, ...k.all()]); }
  querySelectorAll(sel: string) { return this.find(sel); }
  querySelector(sel: string) { return this.find(sel)[0] || null; }
  find(sel: string): El[] {
    const m = /^(?:li\.stop\[data-chapter="(.+?)"\] )?\.(\S+)$/.exec(sel)!;
    const scope = m[1] ? this.all().filter((e) => e.tag === "li" && e.attrs["data-chapter"] === m[1]).flatMap((e) => e.all()) : this.all();
    return scope.filter((e) => e.className === m[2]);
  }
  get words(): string { return this.text || this.textContent ? this.textContent : this.kids.map((k) => k.words).join(""); }
}
const doc: any = {
  createElement: (t: string) => new El(t, doc),
  createTextNode: (s: string) => { const e = new El("#text", doc); e.text = true; e.textContent = s; return e; }
};
function list(ids: string[]) {
  const root = new El("div", doc);
  ids.forEach((id) => {
    const li = root.appendChild(new El("li", doc)); li.attrs["data-chapter"] = id;
    const link = li.appendChild(new El("a", doc)); link.className = "stop-link";
    link.appendChild(new El("span", doc)).className = "stop-card";
  });
  return root;
}
const C = {
  parts: [{ id: "algebra", chapters: [
    { id: "ch01", label: "1", path: "parts/1/01.html", part: { beside: false }, sections: [{ id: "addition", title: "Rules for addition" }, { id: "integers", title: "Integers" }] },
    { id: "ch02", label: "2", path: "parts/1/02.html", part: { beside: false }, sections: [{ id: "one", title: "One unknown" }] }
  ] }],
  chapterById(id: string) { return this.parts[0].chapters.find((c) => c.id === id); }
};
const isles = [
  { id: "ch01", part: "algebra", sections: ["ch01#addition", "ch01#integers"] },
  { id: "ch02", part: "algebra", sections: ["ch02#one"] }
];
const base = { isles, counts: {}, medals: {}, due: { arena: [], page: [] }, bands: {}, solids: {}, calm: false };
function states(over: Record<string, unknown>) { return hubState({ ...base, ...over } as any); }
afterEach(() => { delete (globalThis as any).window; });

describe("hub list", () => {
  it("words the mastery counts and leaves zero parts out", () => {
    expect(masteryLine({ strong: 2, building: 1, weak: 1, none: 0 })).toBe("2 strong · 1 building · 1 weak");
    expect(masteryLine({ strong: 0, building: 0, weak: 2, none: 1 })).toBe("2 weak");
    expect(masteryLine({ strong: 0, building: 0, weak: 0, none: 3 })).toBe("not enough answers yet");
  });

  it("lists due sections as links, the Arena's first, with one review link", () => {
    (globalThis as any).window = { BM_CURRICULUM: C, BMSite: { rootPrefix: () => "" } };
    const root = list(["ch01", "ch02"]);
    decorate(root as any, states({
      due: { arena: [{ id: "ch01#addition" }], page: [{ id: "ch01#integers" }] },
      bands: { "ch01#addition": "strong", "ch01#integers": "weak" }
    }), ["ch01", "ch02"]);
    const hubs = root.querySelectorAll(".stop-hub");
    expect(hubs.length).toBe(2);
    expect(hubs[0].parent!.tag).toBe("li");
    expect(root.querySelectorAll(".stop-link")[0].all().filter((e) => e.className === "stop-hub").length).toBe(0);
    expect(hubs[0].words).toBe("Due for a check: §1.1 Rules for addition, §1.2 Integers · Review in the ArenaMastery: 1 strong · 1 weak");
    const links = hubs[0].all().filter((e) => e.tag === "a").map((e) => e.attrs.href);
    expect(links).toEqual(["parts/1/01.html#addition", "parts/1/01.html#integers", "arena.html?mode=review"]);
    expect(hubs[1].words).toBe("Mastery: not enough answers yet");
  });

  it("a page-only due section gets no Arena link", () => {
    (globalThis as any).window = { BM_CURRICULUM: C, BMSite: { rootPrefix: () => "" } };
    const root = list(["ch01"]);
    decorate(root as any, states({ due: { arena: [], page: [{ id: "ch01#integers" }] } }), ["ch01"]);
    expect(root.querySelector(".stop-hub")!.all().filter((e) => e.tag === "a").map((e) => e.attrs.href)).toEqual(["parts/1/01.html#integers"]);
  });

  it("decorating again replaces the paragraph, never adds one", () => {
    (globalThis as any).window = { BM_CURRICULUM: C, BMSite: { rootPrefix: () => "" } };
    const root = list(["ch01", "ch02"]);
    const s = states({});
    decorate(root as any, s, ["ch01", "ch02"]);
    decorate(root as any, s, ["ch01", "ch02"]);
    expect(root.querySelectorAll(".stop-hub").length).toBe(2);
  });

  it("hubInput waits (null) while the game layer is missing", () => {
    (globalThis as any).window = { BM_CURRICULUM: C };
    expect(hubInput()).toBeNull();
  });
});
