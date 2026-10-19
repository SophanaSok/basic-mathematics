import { afterEach, describe, expect, it } from "vitest";
import { decorate, decorateSections, hubInput, masteryLine, sectionInput } from "./hub-list.ts";
import { sectionStates } from "../learn/status.ts";
import { hubState } from "../world/state.ts";
import { ARENA_SECTIONS } from "../data/arena-sections.ts";

/* a just-enough DOM: elements with children, text, attributes, and the two selectors decorate uses */
class El {
  innerHTML = ""; open = false;
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

describe("decorateSections", () => {
  /* ch01#integers requires ch01#addition; ch02#one requires ch01#integers (so it builds on two when neither is done) */
  const CS = {
    parts: [{ id: "algebra", chapters: [
      { id: "ch01", label: "1", path: "parts/1/01.html", sections: [
        { id: "addition", title: "Rules for addition" }, { id: "integers", title: "Integers", requires: ["ch01#addition"] }] },
      { id: "ch02", label: "2", path: "parts/1/02.html", sections: [
        { id: "one", title: "One unknown", requires: ["ch01#addition", "ch01#integers"] }] }
    ] }],
    chapterById(id: string) { return this.parts[0].chapters.find((c) => c.id === id); }
  };
  function wire(over: Record<string, unknown> = {}) {
    (globalThis as any).window = {
      BM_CURRICULUM: CS, BMSite: { rootPrefix: () => "" },
      BMIcon: { svg: (n: string) => '<svg class="icon icon-' + n + '"></svg>' }, ...over
    };
  }
  const rowsOf = (root: El, id: string) => root.querySelectorAll("li.stop[data-chapter=\"" + id + "\"] .stop-row");
  const stat = (r: El) => r.all().find((e) => e.className === "stop-state")!;

  it("draws the states, glyphs and links without a game layer", () => {
    wire();
    const root = list(["ch01", "ch02"]);
    decorateSections(root as any, sectionStates(sectionInput()), ["ch01", "ch02"]);
    const d = root.querySelectorAll(".stop-sections");
    expect(d.length).toBe(2);
    expect(d[0].kids[0].tag).toBe("summary");
    expect(d[0].kids[0].textContent).toBe("2 sections \u00B7 0 done");
    const r1 = root.find(".stop-row");
    expect(r1.map((r) => stat(r).words)).toEqual(["Ready", "Builds on Rules for addition".replace("Rules", "\u00A71.1 Rules"), "Builds on \u00A71.1 Rules for addition, \u00A71.2 Integers"]);
    expect(r1[0].all().find((e) => e.className === "stop-glyph")!.innerHTML).toContain("icon-next");
    expect(r1[1].all().find((e) => e.className === "stop-glyph")!.innerHTML).toContain("icon-chevron");
    expect(r1[0].all().find((e) => e.className === "stop-title")!.attrs.href).toBe("parts/1/01.html#addition");
    expect(stat(r1[2]).all().filter((e) => e.tag === "a").map((e) => e.attrs.href)).toEqual(["parts/1/01.html#addition", "parts/1/01.html#integers"]);
    expect(r1[0].all().find((e) => e.className === "stop-glyph")!.attrs["aria-hidden"]).toBe("true");
  });

  it("words done and in progress, and counts the done sections", () => {
    wire({
      BMGame: { sectionStatus: (r: string) => (r === "ch01#addition" ? "solid" : "new") },
      BMInsights: { sections: () => [{ id: "ch01#integers", n: 3, solved: 1 }] }
    });
    const root = list(["ch01"]);
    decorateSections(root as any, sectionStates(sectionInput()), ["ch01"]);
    expect(root.querySelector(".stop-sections")!.kids[0].textContent).toBe("2 sections \u00B7 1 done");
    const rows = root.find(".stop-row");
    expect(rows.map((r) => stat(r).words)).toEqual(["Done", "In progress"]);
    expect(rows[0].all().find((e) => e.className === "stop-glyph")!.innerHTML).toContain("icon-tick");
    expect(rows[1].all().find((e) => e.className === "stop-glyph")!.innerHTML).toContain("icon-reset");
  });

  it("sits after the hub line, never inside the card's link, and a redraw keeps it open", () => {
    wire();
    const root = list(["ch01"]);
    const s = sectionStates(sectionInput());
    decorate(root as any, states({ bands: { "ch01#addition": "weak" } }), ["ch01"]);
    decorateSections(root as any, s, ["ch01"]);
    const li = root.all().find((e) => e.tag === "li" && e.attrs["data-chapter"] === "ch01")!;
    expect(li.kids.map((k) => k.className)).toEqual(["stop-link", "stop-hub", "stop-sections"]);
    expect(root.querySelectorAll(".stop-link")[0].all().filter((e) => e.tag === "a" || e.className === "stop-sections").length).toBe(0);
    root.querySelector(".stop-sections")!.open = true;
    decorateSections(root as any, s, ["ch01"]);
    expect(root.querySelectorAll(".stop-sections").length).toBe(1);
    expect(root.querySelector(".stop-sections")!.open).toBe(true);
    root.querySelector(".stop-sections")!.open = false;
    decorateSections(root as any, s, ["ch01"]);
    expect(root.querySelector(".stop-sections")!.open).toBe(false);
  });

  it("no row is disabled", () => {
    wire();
    const root = list(["ch01", "ch02"]);
    decorateSections(root as any, sectionStates(sectionInput()), ["ch01", "ch02"]);
    expect(root.all().filter((e) => "disabled" in e.attrs || "aria-disabled" in e.attrs).length).toBe(0);
    expect(rowsOf(root, "ch02").length).toBe(1);
  });
});
