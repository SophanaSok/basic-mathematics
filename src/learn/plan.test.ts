/* The study plan (plan.ts): each band, reading order, what counts as done, the start course
   moving up, and the whole real curriculum worked through with no Arena play. */
import { describe, expect, it } from "vitest";
import { course } from "../world/course.test-helper.ts";
import { SECTION_WORK } from "../data/section-work.ts";
import { ARENA_SECTIONS } from "../data/arena-sections.ts";
import { CONTAINERS, skillOf } from "../data/skills.ts";
import type { DiagKind, DiagTake, Placeable, SectionRef } from "../types/state.ts";
import { BLUEPRINT, PLAN_REVIEW_ITEMS, PLAN_START_ITEMS } from "./constants.ts";
import { FORMS, L } from "./diagnostic.ts";
import { planOf, TAG_TEXT, type Plan, type PlanInput, type PlanPack } from "./plan.ts";

const DAY = "2026-10-08";
const REFS: SectionRef[] = course().parts.flatMap((p) => p.chapters.flatMap((c) => (c.sections ?? []).map((s) => `${c.id}#${s.id}` as SectionRef)));

type Kinds = Partial<Record<Placeable, DiagKind>>;

/** A take that asked `asked` (as FORMS asks it), clearing those in `pass`; `kinds` makes every
    item of a course that kind (default right if it cleared, else wrong). */
function take(band: Placeable, pass: Placeable[], asked: Placeable[] = pass, from: DiagTake["from"] = "unsure", kinds: Kinds = {}): DiagTake {
  return {
    v: 1, day: DAY, from, start: asked[0] ?? "pre-algebra", band, blueprint: BLUEPRINT, grader: 1, seed: 7, seeded: true,
    blocks: asked.map((c) => ({
      course: c, pass: pass.includes(c),
      items: FORMS[c].map((f, i) => ({ g: f.g, s: i + 1, sec: f.sec, k: kinds[c] ?? (pass.includes(c) ? "right" : "wrong") }))
    }))
  };
}

interface World { solved: Record<string, number>; solid: Set<string>; gen: Set<string> }
const world = (): World => ({ solved: {}, solid: new Set(), gen: new Set(ARENA_SECTIONS) });

function input(t: DiagTake | null, w: World = world(), extra: Partial<PlanInput> = {}): PlanInput {
  return {
    take: t, today: DAY, refs: REFS,
    status: (r) => (w.solid.has(r) ? "solid" : "new"),
    /* a solid section has been worked on its page, so it has a row */
    row: (r) => (Object.hasOwn(w.solved, r) ? { solved: w.solved[r] } : w.solid.has(r) ? { solved: 2 } : null),
    hasGenerator: (r) => w.gen.has(r),
    packs: [], ...extra
  };
}
const plan = (t: DiagTake | null, w?: World, extra?: Partial<PlanInput>): Plan => planOf(input(t, w, extra))!;
const refsOf = (items: { ref: SectionRef }[]) => items.map((i) => i.ref);
const courseSecs = (c: string) => REFS.filter((r) => skillOf(r)?.course === c);
const places = (p: Plan) => p.startHere.filter((i) => !i.read);

describe("planOf bands", () => {
  const cases: [Placeable, Placeable[], Placeable[]][] = [
    ["pre-algebra", [], ["pre-algebra"]],
    ["algebra-1", ["pre-algebra"], ["pre-algebra", "algebra-1"]],
    ["geometry", ["algebra-1"], ["algebra-1", "geometry"]],
    ["algebra-2", ["algebra-1", "geometry", "algebra-2"], ["algebra-1", "geometry", "algebra-2"]]
  ];
  cases.forEach(([band, pass, asked]) => {
    it(`starts in ${band}, first PLAN_START_ITEMS sections in reading order`, () => {
      const p = plan(take(band, pass, asked));
      expect(p.start).toBe(band);
      expect(p.moved).toBe(false);
      expect(p.movedNote).toBeNull();
      const want = courseSecs(band).filter((r) => !isReading(r)).slice(0, PLAN_START_ITEMS);
      expect(refsOf(places(p))).toEqual(want);
      expect(p.startHere.find((i) => !i.read)?.highlight).toBe(true);
      expect(p.startHere.filter((i) => i.highlight)).toHaveLength(1);
      expect(p.inHand.map((h) => h.course)).toEqual(L.slice(0, L.indexOf(band)));
      expect(p.comingUp.map((g) => g.course)).toEqual(L.slice(L.indexOf(band) + 1));
    });
  });

  it("returns null without a take", () => {
    expect(planOf(input(null))).toBeNull();
  });

  it("tags a missed section in the check and leaves others plain", () => {
    const t = take("pre-algebra", [], ["pre-algebra"]);
    const [a, b] = refsOf(places(plan(t)));
    t.blocks[0].items[0].sec = a;
    t.blocks[0].items.slice(1).forEach((i) => { i.sec = "ch01#rationals"; i.k = "right"; });
    const p = plan(t);
    expect(p.startHere.find((i) => i.ref === a)!.tag).toBe("missed");
    expect(p.startHere.find((i) => i.ref === b)!.tag).toBeNull();
    expect(TAG_TEXT.missed).toBe("missed in the check");
  });
});

function isReading(r: SectionRef): boolean {
  return !ARENA_SECTIONS.includes(r) && !(SECTION_WORK[r] ?? 0);
}

describe("done for the plan", () => {
  const t = take("pre-algebra", [], ["pre-algebra"]);
  const firstTwo = () => refsOf(places(plan(t))).slice(0, 2);

  it("drops a solid section and brings up the next", () => {
    const before = refsOf(places(plan(t)));
    const w = world(); w.solid.add(before[0]);
    const after = refsOf(places(plan(t, w)));
    expect(after).not.toContain(before[0]);
    expect(after).toHaveLength(PLAN_START_ITEMS);
    expect(after.slice(0, 2)).toEqual(before.slice(1, 3));
  });

  it("drops a section whose every exercise is solved, with a generator", () => {
    const [a] = firstTwo();
    expect(ARENA_SECTIONS).toContain(a);
    const w = world(); w.solved[a] = SECTION_WORK[a]! - 1;
    expect(refsOf(places(plan(t, w)))).toContain(a);
    w.solved[a] = SECTION_WORK[a]!;
    expect(refsOf(places(plan(t, w)))).not.toContain(a);
  });

  it("drops a section with no generator once every exercise is solved", () => {
    const [a] = firstTwo();
    const w = world(); w.gen.delete(a); w.solved[a] = SECTION_WORK[a]!;
    expect(refsOf(places(plan(t, w)))).not.toContain(a);
  });

  it("does not drop a section with work not all solved, nor a section with no work", () => {
    const [a] = firstTwo();
    const w = world(); w.solved[a] = 1;
    expect(SECTION_WORK[a]).toBeGreaterThan(1);
    expect(refsOf(places(plan(t, w)))).toContain(a);
    const none = plan(t, world(), { work: {} });
    expect(refsOf(places(none))).toContain(a);
  });

  it("ch04#square-roots, one inline check solved and no Arena play, is done", () => {
    const t = take("algebra-1", ["pre-algebra"], ["pre-algebra", "algebra-1"]);
    expect(SECTION_WORK["ch04#square-roots"]).toBe(1);
    expect(ARENA_SECTIONS).toContain("ch04#square-roots");
    const w = world(); /* the Algebra 1 sections before it are done, so it is up next */
    courseSecs("algebra-1").filter((r) => REFS.indexOf(r) < REFS.indexOf("ch04#square-roots")).forEach((r) => w.solid.add(r));
    expect(refsOf(plan(t, w).startHere)).toContain("ch04#square-roots");
    w.solved["ch04#square-roots"] = 1;
    const p = plan(t, w);
    expect(refsOf(p.startHere)).not.toContain("ch04#square-roots");
    expect(places(p)).toHaveLength(PLAN_START_ITEMS);
  });
});

describe("reading sections", () => {
  const t = take("pre-algebra", [], ["pre-algebra"]);

  it("shows ch01#integers as Read, outside the places, until a later section has a row", () => {
    expect(isReading("ch01#integers")).toBe(true);
    const p = plan(t);
    expect(p.startHere[0]).toMatchObject({ ref: "ch01#integers", read: true });
    expect(p.startHere[0].highlight).toBeUndefined();
    expect(places(p)).toHaveLength(PLAN_START_ITEMS);
    expect(p.startHere).toHaveLength(PLAN_START_ITEMS + 1);
    expect(p.startHere[1].highlight).toBe(true);
    const w = world(); w.solved["ch01#addition"] = 1;
    expect(refsOf(plan(t, w).startHere)).not.toContain("ch01#integers");
  });
});

describe("the start course moves up", () => {
  it("moves up one when every section of the band is done, and says so", () => {
    const t = take("pre-algebra", [], ["pre-algebra"]);
    const w = world();
    courseSecs("pre-algebra").forEach((r) => { w.solid.add(r); });
    const p = plan(t, w);
    expect(p.start).toBe("algebra-1");
    expect(p.moved).toBe(true);
    expect(p.band).toBe("pre-algebra");
    expect(p.movedNote).toBe("Your plan now starts in Algebra 1");
    expect(p.inHand.map((h) => h.course)).toEqual(["pre-algebra"]);
    expect(p.inHand[0].kind).toBe("done");
  });

  it("completes Pre-algebra through Algebra 2 on the real curriculum and SECTION_WORK with no Arena play", () => {
    const t = take("pre-algebra", [], ["pre-algebra"]);
    const w = world(); /* nothing is solid: no Arena play */
    let p = plan(t, w);
    expect(p.start).toBe("pre-algebra");
    /* course by course, each in reading order: finishing a course moves the start up one */
    L.forEach((c, n) => {
      expect(p.start).toBe(c);
      courseSecs(c).forEach((ref) => { if (SECTION_WORK[ref]) w.solved[ref] = SECTION_WORK[ref]!; });
      /* a course's reading section is cleared by a later attempt, not by solving it */
      p = plan(t, w);
      if (n < L.length - 1) { expect(p.start).toBe(L[n + 1]); expect(p.finished).toBe(false); }
    });
    expect(p.start).toBe("algebra-2");
    expect(p.finished).toBe(true);
    expect(p.startHere).toEqual([]);
    expect(p.inHand.map((h) => h.course)).toEqual(["pre-algebra", "algebra-1", "geometry"]);
  });

  it("moves no further than the work done, solving every exercise in reading order", () => {
    const t = take("pre-algebra", [], ["pre-algebra"]);
    const w = world();
    const seen: Placeable[] = ["pre-algebra"];
    let p = plan(t, w);
    for (const ref of REFS) {
      if (!SECTION_WORK[ref]) continue;
      w.solved[ref] = SECTION_WORK[ref]!;
      p = plan(t, w);
      if (p.start !== seen[seen.length - 1]) seen.push(p.start);
      if (ref === "ch04#square-roots") expect(refsOf(p.startHere)).not.toContain(ref);
    }
    expect(seen[0]).toBe("pre-algebra");
    expect(seen[seen.length - 1]).toBe("algebra-2");
    expect(p.finished).toBe(true);
    expect(p.startHere).toEqual([]);
  });

  it("stays unfinished while any section of the course is open", () => {
    const t = take("pre-algebra", [], ["pre-algebra"]);
    const w = world();
    const secs = courseSecs("pre-algebra");
    secs.slice(0, -1).forEach((r) => w.solid.add(r));
    w.solved["ch02#one-unknown"] = 1; /* a row after the reading section, for ch01#integers */
    expect(plan(t, w).start).toBe("pre-algebra");
  });
});

describe("Geometry hold", () => {
  const GEO_ASKED = FORMS.geometry.map((f) => f.sec);

  it("puts the Geometry sections the check did not ask first", () => {
    const t = take("geometry", ["algebra-1", "geometry"], ["algebra-1", "geometry"], "a1");
    const p = plan(t);
    expect(p.start).toBe("geometry");
    const refs = refsOf(places(p));
    expect(refs).toHaveLength(PLAN_START_ITEMS);
    refs.forEach((r) => expect(GEO_ASKED).not.toContain(r));
    expect(places(p).every((i) => i.tag === "not-asked")).toBe(true);
    /* without the hold the first Geometry sections in reading order come first, asked or not */
    const free = plan(take("geometry", ["algebra-1"], ["algebra-1", "geometry"], "geo"));
    expect(refsOf(places(free))).toEqual(courseSecs("geometry").filter((r) => !isReading(r)).slice(0, PLAN_START_ITEMS));
  });

  it("lists a cleared, unheld Geometry's unasked sections as worth working through", () => {
    const t = take("algebra-2", ["algebra-1", "geometry", "algebra-2"], undefined, "geo");
    const p = plan(t);
    const geo = p.inHand.find((h) => h.course === "geometry")!;
    const worth = geo.items.filter((i) => i.tag === "not-asked-work").map((i) => i.ref).sort();
    expect(worth).toEqual(["ch06#isometries", "ch06#symmetry", "interlude#logic", "interlude#quantifiers"]);
    expect(geo.heading).toBe("You can skim these.");
  });
});

describe("Already in hand and Coming up", () => {
  it("heads an implied course Not asked: skim and tags every section", () => {
    const t = take("geometry", ["algebra-2"], ["algebra-2"]);
    const p = plan(t);
    const pre = p.inHand.find((h) => h.course === "pre-algebra")!;
    expect(pre.kind).toBe("implied");
    expect(pre.heading).toBe("Not asked: skim");
    expect(pre.items.length).toBe(courseSecs("pre-algebra").length);
    expect(pre.items.every((i) => i.tag === "not-asked-skim")).toBe(true);
  });

  it("tags only generator-less sections of a cleared course", () => {
    const t = take("geometry", ["pre-algebra", "algebra-1"]);
    const a1 = plan(t).inHand.find((h) => h.course === "algebra-1")!;
    expect(a1.kind).toBe("clear");
    a1.items.forEach((i) => expect(i.tag).toBe(ARENA_SECTIONS.includes(i.ref) ? null : "not-asked-skim"));
  });

  it("marks asked sections of a course cleared above the band as skim, and lists the rest plainly", () => {
    const t = take("geometry", ["algebra-1", "algebra-2"], ["algebra-1", "geometry", "algebra-2"]);
    t.blocks.find((b) => b.course === "geometry")!.pass = false;
    const a2 = plan(t).comingUp.find((g) => g.course === "algebra-2")!;
    const askedRefs = FORMS["algebra-2"].map((f) => f.sec);
    expect(a2.items.some((i) => i.tag === "skim-shown")).toBe(true);
    a2.items.forEach((i) => expect(i.tag).toBe(askedRefs.includes(i.ref) ? "skim-shown" : null));
    expect(a2.count).toBe(a2.items.length);
    const geo = plan(t).comingUp;
    expect(geo.map((g) => g.course)).toEqual(["algebra-2"]);
  });

  it("puts beyond sections only in Going further", () => {
    const p = plan(take("pre-algebra", [], ["pre-algebra"]));
    expect(refsOf(p.goingFurther)).toEqual(REFS.filter((r) => skillOf(r)?.course === "beyond"));
    expect(p.goingFurther.length).toBeGreaterThan(0);
    const elsewhere = [...p.startHere, ...p.reviewFirst, ...p.comingUp.flatMap((g) => g.items), ...p.inHand.flatMap((h) => h.items)];
    expect(refsOf(elsewhere).filter((r) => refsOf(p.goingFurther).includes(r))).toEqual([]);
    expect(p.comingUp.map((g) => g.course)).not.toContain("beyond");
  });

  it("never lists a container", () => {
    const p = plan(take("pre-algebra", [], ["pre-algebra"]), world(), { refs: [...REFS, ...CONTAINERS] });
    const all = [...p.startHere, ...p.reviewFirst, ...p.goingFurther, ...p.comingUp.flatMap((g) => g.items), ...p.inHand.flatMap((h) => h.items)];
    CONTAINERS.forEach((c) => expect(refsOf(all)).not.toContain(c));
    const w = plan(take("algebra-2", ["algebra-1", "geometry", "algebra-2"]), world(), { refs: [...REFS, ...CONTAINERS] });
    CONTAINERS.forEach((c) => expect(refsOf(w.inHand.flatMap((h) => h.items))).not.toContain(c));
  });
});

describe("robustness", () => {
  it("calls status and row at most once per ref on the real curriculum", () => {
    const calls = { status: new Map<string, number>(), row: new Map<string, number>() };
    const count = (m: Map<string, number>, r: string) => m.set(r, (m.get(r) ?? 0) + 1);
    const w = world();
    const t = take("pre-algebra", [], ["pre-algebra"]);
    planOf(input(t, w, {
      status: (r) => { count(calls.status, r); return "new"; },
      row: (r) => { count(calls.row, r); return null; }
    }));
    expect(calls.status.size).toBeGreaterThan(0);
    [...calls.status.values(), ...calls.row.values()].forEach((n) => expect(n).toBeLessThanOrEqual(1));
    const solid = new Map<string, number>();
    planOf(input(take("algebra-2", ["algebra-1", "geometry", "algebra-2"]), w, {
      status: (r) => { count(solid, r); return "new"; }
    }));
    [...solid.values()].forEach((n) => expect(n).toBeLessThanOrEqual(1));
  });

  it("does not walk to Algebra 2 or finish when the outline is empty", () => {
    const p = plan(take("pre-algebra", [], ["pre-algebra"]), world(), { refs: [] });
    expect(p.start).toBe("pre-algebra");
    expect(p.finished).toBe(false);
    expect(p.startHere).toEqual([]);
  });
});

describe("the hold set", () => {
  const geoPlan = (from: DiagTake["from"]) =>
    plan(take("geometry", ["algebra-1", "geometry"], ["algebra-1", "geometry"], from));
  const GEO = FORMS.geometry.map((f) => f.sec);

  (["none", "pre", "a1"] as const).forEach((from) => it(`holds ${from}`, () => {
    const refs = refsOf(places(geoPlan(from)));
    refs.forEach((r) => expect(GEO).not.toContain(r));
  }));
  (["unsure", "geo", "a2"] as const).forEach((from) => it(`does not hold ${from}`, () => {
    const p = geoPlan(from);
    expect(refsOf(places(p))).toEqual(courseSecs("geometry").filter((r) => !isReading(r)).slice(0, PLAN_START_ITEMS));
    expect(p.startHere.some((i) => i.tag === "not-asked")).toBe(false);
  }));

  it("tags an asked Geometry section the check missed, under the hold", () => {
    const t = take("geometry", ["algebra-1", "geometry"], ["algebra-1", "geometry"], "a1");
    const geo = t.blocks.find((b) => b.course === "geometry")!;
    const asked = geo.items[1].sec;
    expect(GEO).toContain(asked);
    geo.items.forEach((i) => { if (i.sec === asked) i.k = "wrong"; });
    const w = world(); /* everything else in Geometry is done, so the missed asked section is up */
    courseSecs("geometry").filter((r) => r !== asked && !isReading(r)).forEach((r) => w.solid.add(r));
    const p = plan(t, w);
    expect(p.start).toBe("geometry");
    expect(p.startHere.find((i) => i.ref === asked)?.tag).toBe("missed");
  });

  it("lists the four unasked Geometry sections as worth working through once a held Geometry is done", () => {
    const t = take("geometry", ["algebra-1", "geometry"], ["algebra-1", "geometry"], "a1");
    const w = world();
    courseSecs("geometry").forEach((r) => w.solid.add(r));
    const p = plan(t, w);
    expect(p.start).toBe("algebra-2");
    const geo = p.inHand.find((h) => h.course === "geometry")!;
    expect(geo.items.filter((i) => i.tag === "not-asked-work").map((i) => i.ref).sort())
      .toEqual(["ch06#isometries", "ch06#symmetry", "interlude#logic", "interlude#quantifiers"]);
  });
});

describe("Review first", () => {
  it("lists missed sections of cleared courses in reading order, at most PLAN_REVIEW_ITEMS, until done", () => {
    const t = take("geometry", ["pre-algebra", "algebra-1"]);
    t.blocks.forEach((b) => b.items.forEach((i, n) => { if (n < 7) i.k = "wrong"; }));
    const p = plan(t);
    expect(p.reviewFirst.length).toBeLessThanOrEqual(PLAN_REVIEW_ITEMS);
    expect(p.reviewFirst.length).toBeGreaterThan(0);
    const order = p.reviewFirst.map((i) => REFS.indexOf(i.ref));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    p.reviewFirst.forEach((i) => expect(i.tag).toBe("missed"));
    const w = world(); w.solid.add(p.reviewFirst[0].ref);
    expect(refsOf(plan(t, w).reviewFirst)).not.toContain(p.reviewFirst[0].ref);
  });

  it("is empty for a band with nothing cleared", () => {
    expect(plan(take("pre-algebra", [], ["pre-algebra"])).reviewFirst).toEqual([]);
  });
});

describe("Skill packs", () => {
  const packs: PlanPack[] = [
    { id: "b", course: "algebra-1", title: "B", href: "b.html" },
    { id: "a", course: "pre-algebra", title: "A", href: "a.html" },
    { id: "c", course: "algebra-2", title: "C", href: "c.html" }
  ];

  it("draws nothing when there are no packs", () => {
    expect(plan(take("pre-algebra", [], ["pre-algebra"])).packs).toEqual([]);
  });

  it("lists a pre-algebra band's packs at or below the start course, pre-algebra first", () => {
    const p = plan(take("pre-algebra", [], ["pre-algebra"]), world(), { packs });
    expect(p.packs.map((x) => x.id)).toEqual(["a"]);
    const w = world(); courseSecs("pre-algebra").forEach((r) => w.solid.add(r));
    expect(plan(take("pre-algebra", [], ["pre-algebra"]), w, { packs }).packs.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("is drawn for a higher band only when Review first holds pre-algebra sections", () => {
    expect(plan(take("algebra-1", ["pre-algebra"], ["pre-algebra", "algebra-1"]), world(), { packs }).packs).toEqual([]);
    const t = take("algebra-1", ["pre-algebra"], ["pre-algebra", "algebra-1"]);
    t.blocks[0].items[0].k = "wrong";
    expect(plan(t, world(), { packs }).packs.map((x) => x.id)).toEqual(["a", "b"]);
  });
});
