import { afterEach, describe, expect, it } from "vitest";
import { decorate, hubInput, masteryLine } from "./hub-list.ts";
import { hubState } from "../world/state.ts";
import { ARENA_SECTIONS } from "../data/arena-sections.ts";

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
    expect(masteryLine({ strong: 0, building: 0, weak: 0, none: 3 })).toBe("");
  });

  it("lists due sections as links, the Arena's first, with one review link", () => {
    (globalThis as any).window = { BM_CURRICULUM: C, BMSite: { rootPrefix: () => "" } };
    const root = list(["ch01", "ch02"]);
    decorate(root as any, states({
      due: { arena: [{ id: "ch01#addition" }], page: [{ id: "ch01#integers" }] },
      bands: { "ch01#addition": "strong", "ch01#integers": "weak" }
    }), ["ch01", "ch02"]);
    const hubs = root.querySelectorAll(".stop-hub");
    expect(hubs.length).toBe(1);
    expect(hubs[0].parent!.tag).toBe("li");
    expect(root.querySelectorAll(".stop-link")[0].all().filter((e) => e.className === "stop-hub").length).toBe(0);
    expect(hubs[0].words).toBe("Due for a check: §1.1 Rules for addition, §1.2 Integers · Review in the ArenaMastery: 1 strong · 1 weak");
    const links = hubs[0].all().filter((e) => e.tag === "a").map((e) => e.attrs.href);
    expect(links).toEqual(["parts/1/01.html#addition", "parts/1/01.html#integers", "arena.html?mode=review"]);
    expect(root.querySelectorAll(".stop-mastery").length).toBe(1);
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
    const s2 = states({ bands: { "ch01#addition": "weak", "ch02#one": "strong" } });
    decorate(root as any, s2, ["ch01", "ch02"]);
    decorate(root as any, s2, ["ch01", "ch02"]);
    expect(root.querySelectorAll(".stop-hub").length).toBe(2);
    decorate(root as any, s, ["ch01", "ch02"]);
    expect(root.querySelectorAll(".stop-hub").length).toBe(0);
  });

  it("a title with markup characters is text, never markup", () => {
    const C2 = { parts: [{ id: "algebra", chapters: [
      { id: "ch01", label: "1", path: "parts/1/01.html", sections: [{ id: "x", title: "a < b & <b>c</b>" }] }] }],
      chapterById(id: string) { return this.parts[0].chapters.find((c) => c.id === id); } };
    (globalThis as any).window = { BM_CURRICULUM: C2, BMSite: { rootPrefix: () => "" } };
    const root = list(["ch01"]);
    decorate(root as any, states({ isles: [{ id: "ch01", part: "algebra", sections: ["ch01#x"] }], due: { arena: [], page: [{ id: "ch01#x" }] } }), ["ch01"]);
    const a = root.querySelector(".stop-hub")!.all().filter((e) => e.tag === "a")[0];
    expect(a.textContent).toBe("§1.1 a < b & <b>c</b>");
    expect(a.kids.length).toBe(0);
  });
});

describe("hubInput", () => {
  const CH = {
    parts: [
      { id: "algebra", chapters: [
        { id: "ch01", sections: [{ id: "addition" }, { id: "b" }] },
        { id: "ch02", sections: [{ id: "c" }] }] },
      { id: "packs", beside: true, chapters: [{ id: "pk01", sections: [{ id: "d" }] }] }
    ]
  };
  const dom = { documentElement: { hasAttribute: (n: string) => n === "data-calm" } };
  function wire(over: Record<string, unknown> = {}) {
    (globalThis as any).document = dom;
    (globalThis as any).window = {
      BM_CURRICULUM: CH,
      BM_QUEST: { regions: { algebra: { solid: "cube" }, packs: { solid: "octa" } } },
      BMProgress: { count: (id: string) => (id === "ch01" ? { solved: 2, total: 5 } : { solved: 0, total: 0 }) },
      BMGame: {
        medal: (id: string) => (id === "ch01" ? 2 : 0),
        deck: () => [
          { id: "ch01#b", due: true, box: 1, last: 5, seen: 3 },
          { id: "ch01#addition", due: true, box: 2, last: 6, seen: 4 },
          { id: "pk01#d", due: true, box: 1, last: 7, seen: 1 },
          { id: "zz#none", due: true, box: 1, last: 1, seen: 1 }
        ]
      },
      BMEvents: { bands: () => ({ "ch01#addition": "strong" }) },
      BMSite: { dayKey: () => 100 },
      ...over
    };
  }
  afterEach(() => { delete (globalThis as any).document; });

  it("lists every chapter, packs included, in reading order", () => {
    wire();
    const inp = hubInput();
    expect(inp.isles.map((s) => s.id)).toEqual(["ch01", "ch02", "pk01"]);
    expect(inp.isles[0].sections).toEqual(["ch01#addition", "ch01#b"]);
    expect(inp.counts.ch01).toEqual({ solved: 2, total: 5 });
    expect(inp.medals.ch01).toBe(2);
    expect(inp.solids).toEqual({ algebra: "cube", packs: "octa" });
    expect(inp.bands).toEqual({ "ch01#addition": "strong" });
    expect(inp.calm).toBe(true);
  });

  it("beside: false is the map's islands only", () => {
    wire();
    const inp = hubInput({ beside: false });
    expect(inp.isles.map((s) => s.id)).toEqual(["ch01", "ch02"]);
    expect(inp.solids).toEqual({ algebra: "cube" });
    expect(Object.keys(inp.counts)).toEqual(["ch01", "ch02"]);
  });

  it("splits due rows by the Arena list, most overdue first, and keeps rows outside the order", () => {
    wire();
    const ids = (a: readonly { id: string }[]) => a.map((d) => d.id);
    const inp = hubInput();
    expect(ARENA_SECTIONS).toContain("ch01#addition");
    expect(ids(inp.due.arena)).toEqual(["ch01#addition"]);
    expect(ids(inp.due.page).sort()).toEqual(["ch01#b", "pk01#d", "zz#none"]);
  });

  it("tolerates every missing store", () => {
    (globalThis as any).document = dom;
    (globalThis as any).window = { BM_CURRICULUM: CH };
    const inp = hubInput();
    expect(inp.counts.ch01).toEqual({ solved: 0, total: 0 });
    expect(inp.medals.ch01).toBe(0);
    expect(inp.due).toEqual({ arena: [], page: [] });
    expect(inp.bands).toEqual({});
    expect(inp.isles.length).toBe(3);
    (globalThis as any).window = {};
    expect(hubInput().isles).toEqual([]);
  });

  it("a throwing deck or bands read leaves no beacons and no mastery", () => {
    wire({ BMGame: { medal: () => { throw new Error("x"); }, deck: () => { throw new Error("y"); } } });
    const inp = hubInput();
    expect(inp.due).toEqual({ arena: [], page: [] });
    expect(inp.bands).toEqual({});
    expect(inp.medals.ch01).toBe(0);
  });
});
