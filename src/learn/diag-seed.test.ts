/* What a placement take seeds into the review boxes, and the prior it gives item 15
   (diag-seed.ts), against the real curriculum (src/data/skills.ts) and the real merge. */
import { describe, expect, it } from "vitest";
import { mergeGame } from "../sync/merge.ts";
import { CONTAINERS, SKILLS, skillOf } from "../data/skills.ts";
import type { DiagKind, DiagTake, Placeable, SectionRef } from "../types/state.ts";
import { BLUEPRINT } from "./constants.ts";
import { FORMS, L } from "./diagnostic.ts";
import { isFirst, latestTake, perOf, priorOf, seedOf, seedPatch, takesOf } from "./diag-seed.ts";
import { addDays } from "./recall.ts";

const LONG = 60_000;
const D = "2026-10-06";
const REFS = Object.keys(SKILLS) as SectionRef[];
const never = () => false;

type Kinds = Partial<Record<Placeable, DiagKind | DiagKind[]>>;

/** A take that asked the given courses (in the given order), each as FORMS asks it, with every
    item of a course the given kind (or the kinds in order). `pass` says which blocks cleared. */
function take(pass: Placeable[], asked: Placeable[] = pass, kinds: Kinds = {}, extra: Partial<DiagTake> = {}): DiagTake {
  return {
    v: 1, day: D, from: "unsure", start: asked[0] ?? "pre-algebra", band: "algebra-2", blueprint: BLUEPRINT, grader: 1,
    seed: 7, seeded: true,
    blocks: asked.map((course) => ({
      course, pass: pass.includes(course),
      items: FORMS[course].map((f, i) => {
        const k = kinds[course] ?? "right";
        return { g: f.g, s: i + 1, sec: f.sec, k: Array.isArray(k) ? k[i] ?? "right" : k };
      })
    })),
    ...extra
  };
}

const askedSecs = (t: DiagTake) => new Set(t.blocks.flatMap((b) => b.items.map((i) => i.sec as string)));
const seed = (t: DiagTake, ref: SectionRef, current?: unknown, worked = false) => seedOf(t, ref, current, worked, skillOf);
const inCourse = (c: string) => REFS.filter((r) => SKILLS[r].course === c);

/* a small seeded generator, so a failing case can be replayed */
function rng(seed0: number) {
  let a = seed0 >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("seedOf", () => {
  it("asked in a cleared course and every item right: box 1, the day before", () => {
    const t = take(["pre-algebra"]);
    expect(seed(t, "ch01#rationals")).toEqual({ box: 1, last: "2026-10-05" });
  });

  it("asked with any form, wrong or skip: box 0", () => {
    (["form", "wrong", "skip"] as DiagKind[]).forEach((k) => {
      const t = take(["pre-algebra"], ["pre-algebra"], { "pre-algebra": [k] });
      expect(seed(t, FORMS["pre-algebra"][0].sec)).toEqual({ box: 0, last: "2026-10-05" });
      expect(seed(t, FORMS["pre-algebra"][1].sec)).toEqual({ box: 1, last: "2026-10-05" });
    });
  });

  it("a section asked twice is box 1 only if both are right", () => {
    const sec = "ch09#addition-points";
    expect(FORMS.geometry.filter((f) => f.sec === sec)).toHaveLength(2);
    const idx = FORMS.geometry.map((f, i) => (f.sec === sec ? i : -1)).filter((i) => i >= 0);
    const miss = Array<DiagKind>(6).fill("right");
    miss[idx[1]] = "wrong";
    const t = take(["geometry"], ["geometry"], { geometry: miss });
    expect(seed(t, sec)?.box).toBe(0);
    expect(seed(take(["geometry"]), sec)?.box).toBe(1);
  });

  it("not asked, in an asked and cleared course: box 1", () => {
    const t = take(["pre-algebra", "algebra-1", "algebra-2"]);
    const un = ["pre-algebra", "algebra-1", "algebra-2"].flatMap((c) => inCourse(c)).filter((r) => !askedSecs(t).has(r));
    expect(un.length).toBeGreaterThan(0);
    un.forEach((r) => expect(seed(t, r)).toEqual({ box: 1, last: "2026-10-05" }));
  });

  it("Geometry's unasked sections get box 0, not box 1", () => {
    const t = take(["geometry"]);
    const un = inCourse("geometry").filter((r) => !askedSecs(t).has(r));
    // the design says 3; SKILLS has four (logic, quantifiers, isometries, symmetry)
    expect(un.sort()).toEqual(["interlude#logic", "interlude#quantifiers", "ch06#isometries", "ch06#symmetry"].sort());
    un.forEach((r) => expect(seed(t, r)).toEqual({ box: 0, last: "2026-10-05" }));
    inCourse("geometry").filter((r) => askedSecs(t).has(r)).forEach((r) => expect(seed(t, r)?.box).toBe(1));
  });

  it("an implied course is box 0, asked or not; a sibling is never implied", () => {
    const t = take(["algebra-2"]); // start a2 and clear: algebra-1 and pre-algebra implied, geometry not
    inCourse("pre-algebra").forEach((r) => expect(seed(t, r)).toEqual({ box: 0, last: "2026-10-05" }));
    inCourse("algebra-1").forEach((r) => expect(seed(t, r)).toEqual({ box: 0, last: "2026-10-05" }));
    inCourse("geometry").forEach((r) => expect(seed(t, r)).toBeNull());
    inCourse("algebra-2").forEach((r) => expect(seed(t, r)).not.toBeNull());
  });

  it("nothing for a course not cleared, not reached, beyond, or a container", () => {
    const t = take(["pre-algebra"], ["pre-algebra", "algebra-1"]); // algebra-1 asked, not cleared
    inCourse("algebra-1").forEach((r) => expect(seed(t, r)).toBeNull());
    inCourse("geometry").forEach((r) => expect(seed(t, r)).toBeNull());
    inCourse("algebra-2").forEach((r) => expect(seed(t, r)).toBeNull());
    const all = take([...L]);
    inCourse("beyond").forEach((r) => expect(seed(all, r)).toBeNull());
    expect(inCourse("beyond").length).toBeGreaterThan(0);
    CONTAINERS.forEach((r) => expect(seed(all, r)).toBeNull());
    expect(seed(all, "ch99#nope" as SectionRef)).toBeNull();
  });

  it("a block asked and failed does not clear, even above one cleared", () => {
    const t = take(["algebra-1"], ["algebra-1", "pre-algebra"]); // pre-algebra asked and failed
    inCourse("pre-algebra").forEach((r) => expect(seed(t, r)).toBeNull());
  });

  it("perOf reads no take as empty, and never takes __proto__ as a section", () => {
    expect([perOf(null as never), perOf(undefined as never), perOf({ blocks: {} } as never)]).toEqual([{}, {}, {}]);
    const per = perOf({ day: "2026-10-07", band: "algebra-1", blocks: [{ course: "algebra-1", pass: true, items: [{ sec: "__proto__", k: "right" }, { sec: "ch01#addition", k: "right" }] }] } as never);
    expect(Object.getPrototypeOf(per)).toBe(Object.prototype);
    expect(per).toEqual({ "ch01#addition": { n: 1, o: 1 } });
  });

  it("nothing for a rushed take, or one that says it was not seeded", () => {
    const t = take([...L], [...L], {}, { rushed: true, seeded: false });
    REFS.forEach((r) => expect(seed(t, r)).toBeNull());
    const u = take([...L], [...L], {}, { seeded: false });
    REFS.forEach((r) => expect(seed(u, r)).toBeNull());
    const w = take([...L], [...L], {}, { rushed: true });
    REFS.forEach((r) => expect(seed(w, r)).toBeNull());
  });

  it("nothing for a take with no readable day", () => {
    expect(seed(take(["pre-algebra"], ["pre-algebra"], {}, { day: "yesterday" }), "ch01#rationals")).toBeNull();
  });

  it("never touches a placed section", () => {
    const t = take([...L]);
    REFS.forEach((r) => {
      expect(seed(t, r, { n: 3, ok: 2, box: 2, last: "2026-09-01" })).toBeNull();
      expect(seed(t, r, { box: 0, last: D })).toBeNull();
    });
  });

  it("a section worked on its page but never placed is not seeded", () => {
    const t = take([...L]);
    const ref: SectionRef = "ch01#rationals";
    expect(seed(t, ref, { n: 0, ok: 0, box: 0 }, false)).not.toBeNull();
    expect(seed(t, ref, { n: 0, ok: 0, box: 0 }, true)).toBeNull();
    expect(seed(t, ref, undefined, true)).toBeNull();
  });

  it("box is at most 1 and last is the day before, whatever the take", () => {
    const r = rng(11);
    for (let n = 0; n < 200; n++) {
      const t = randomTake(r);
      REFS.forEach((ref) => {
        const s = seed(t, ref);
        if (s) {
          expect(s.box).toBeLessThanOrEqual(1);
          expect(s.last).toBe(addDays(t.day, -1));
        }
      });
    }
  });
});

function randomTake(r: () => number): DiagTake {
  const asked = L.filter(() => r() < 0.7);
  if (!asked.length) asked.push("pre-algebra");
  const kinds: Kinds = {};
  asked.forEach((c) => { kinds[c] = FORMS[c].map(() => (["right", "right", "wrong", "form", "skip"] as DiagKind[])[Math.floor(r() * 5)]); });
  return take(asked.filter(() => r() < 0.6), asked, kinds, { day: addDays("2026-01-01", Math.floor(r() * 300))! });
}

describe("seedPatch", () => {
  it("lays box and last over the record and keeps n, ok, fix and unknown fields", () => {
    const t = take(["pre-algebra"]);
    const sec = { "ch01#rationals": { n: 0, ok: 0, fix: 5, note: "x" } };
    const p = seedPatch(t, ["ch01#rationals"], sec, never, skillOf);
    expect(p["ch01#rationals"]).toEqual({ n: 0, ok: 0, fix: 5, note: "x", box: 1, last: "2026-10-05" });
    expect(Object.keys(p)).toEqual(["ch01#rationals"]);
  });

  it("writes only box and last on a section with no record", () => {
    const p = seedPatch(take(["pre-algebra"]), ["ch01#rationals"], undefined, never, skillOf);
    expect(p["ch01#rationals"]).toEqual({ box: 1, last: "2026-10-05" });
  });

  it("leaves out placed and worked sections", () => {
    const t = take([...L]);
    const sec = { "ch01#rationals": { n: 1, ok: 1, box: 1, last: "2026-09-30" } };
    const p = seedPatch(t, ["ch01#rationals", "ch01#inverses"], sec, (r) => r === "ch01#inverses", skillOf);
    expect(p).toEqual({});
  });

  it("applying twice equals once", () => {
    const r = rng(5);
    for (let n = 0; n < 100; n++) {
      const t = randomTake(r);
      const worked = new Set(REFS.filter(() => r() < 0.2));
      const sec: Record<string, unknown> = {};
      REFS.forEach((ref) => { if (r() < 0.2) sec[ref] = r() < 0.5 ? { n: 2, ok: 1, box: 2, last: "2026-09-01" } : { n: 1, ok: 0, box: 0 }; });
      const once = { ...sec, ...seedPatch(t, REFS, sec, (x) => worked.has(x), skillOf) };
      const twice = { ...once, ...seedPatch(t, REFS, once, (x) => worked.has(x), skillOf) };
      expect(twice).toEqual(once);
      expect(seedPatch(t, REFS, once, (x) => worked.has(x), skillOf)).toEqual({});
    }
  });
});

describe("a seed never erases a real miss from the same day", () => {
  it("mergeGame keeps box 0 and last D", () => {
    const t = take([...L]);
    const ref: SectionRef = "ch01#rationals";
    const seeded = { sec: { ...seedPatch(t, [ref], {}, never, skillOf) } };
    expect(seeded.sec[ref].box).toBe(1);
    const miss = { sec: { [ref]: { n: 1, ok: 0, box: 0, last: D } } };
    [mergeGame(seeded, miss), mergeGame(miss, seeded)].forEach((m) => {
      expect(m.sec[ref].box).toBe(0);
      expect(m.sec[ref].last).toBe(D);
      expect(m.sec[ref].n).toBe(1);
    });
  });

  it("property: random takes and random sec maps", () => {
    const r = rng(2026);
    for (let n = 0; n < 300; n++) {
      const t = randomTake(r);
      const sec: Record<string, unknown> = {};
      REFS.forEach((ref) => { if (r() < 0.15) sec[ref] = { n: 1, ok: 0, box: Math.floor(r() * 3) }; });
      const patch = seedPatch(t, REFS, sec, () => false, skillOf);
      const seeded = { sec: { ...sec, ...patch } };
      // a real miss on the take's own day, on every section, from another device
      const miss = { sec: Object.fromEntries(REFS.map((x) => [x, { n: 1, ok: 0, box: 0, last: t.day }])) };
      const m = mergeGame(seeded, miss);
      REFS.forEach((ref) => {
        expect(m.sec[ref].box).toBe(0);
        expect(m.sec[ref].last).toBe(t.day);
      });
    }
  }, LONG);
});

describe("perOf", () => {
  it("counts every recorded kind in n and only right in o, summing a section asked twice", () => {
    const t = take(["geometry"], ["geometry"], { geometry: ["right", "wrong", "form", "skip", "right", "right"] });
    const per = perOf(t);
    const dupe = FORMS.geometry.map((f, i) => [f.sec, i] as const).filter(([s]) => s === "ch09#addition-points").map(([, i]) => i);
    expect(per["ch09#addition-points"]).toEqual({ n: 2, o: dupe.map((i) => ["right", "wrong", "form", "skip", "right", "right"][i]).filter((k) => k === "right").length });
    expect(Object.values(per).reduce((a, p) => a + p.n, 0)).toBe(6);
    expect(Object.values(per).reduce((a, p) => a + p.o, 0)).toBe(3);
  });

  it("is empty for a take with no items, and ignores damaged items", () => {
    expect(perOf(take([], []))).toEqual({});
    const t = take(["pre-algebra"]);
    (t.blocks[0].items as unknown[]).push(null, 4, { k: "right" });
    expect(Object.values(perOf(t)).reduce((a, p) => a + p.n, 0)).toBe(8);
  });
});

describe("priorOf", () => {
  const store = (...ts: DiagTake[]) => ({ takes: Object.fromEntries(ts.map((t, i) => ["t" + i, t])) });

  it("equals seedOf with no record and no work, plus perOf", () => {
    const t = take(["pre-algebra", "algebra-1"], ["pre-algebra", "algebra-1"], { "pre-algebra": ["wrong"] });
    REFS.forEach((ref) => {
      const s = seed(t, ref), p = priorOf(store(t), ref, skillOf);
      if (!s) { expect(p).toBeNull(); return; }
      const per = perOf(t)[ref] ?? { n: 0, o: 0 };
      expect(p).toEqual({ b: s.box, l: s.last, n: per.n, o: per.o });
    });
  });

  it("is unchanged after the take's own seed is applied to sec, and after page work", () => {
    const r = rng(77);
    for (let n = 0; n < 100; n++) {
      const t = randomTake(r), d = store(t);
      const before = REFS.map((ref) => priorOf(d, ref, skillOf));
      const sec = seedPatch(t, REFS, {}, never, skillOf);
      REFS.forEach((ref) => expect(seedOf(t, ref, sec[ref], false, skillOf)).toBeNull());
      const after = REFS.map((ref) => priorOf(d, ref, skillOf));
      expect(after).toEqual(before);
    }
  });

  it("a membership-only seed has n = 0 and o = 0, so m0 = 0.5 and c0 = 0", () => {
    const t = take(["pre-algebra"]);
    const un = inCourse("pre-algebra").find((r) => !askedSecs(t).has(r))!;
    const p = priorOf(store(t), un, skillOf)!;
    expect(p).toEqual({ b: 1, l: "2026-10-05", n: 0, o: 0 });
    expect((1 + p.o) / (2 + p.n)).toBe(0.5);
    expect(Math.min(p.n, 3)).toBe(0);
  });

  it("m0 and c0 follow r2's formula from perOf", () => {
    const t = take(["pre-algebra"], ["pre-algebra"], { "pre-algebra": ["wrong", "right", "right", "right", "right", "right", "right", "right"] });
    const p = priorOf(store(t), FORMS["pre-algebra"][1].sec, skillOf)!;
    expect(p).toMatchObject({ n: 1, o: 1 });
    expect((1 + p.o) / (2 + p.n)).toBeCloseTo(2 / 3, 12);
    expect(Math.min(p.n, 3)).toBe(1);
  });

  it("reads the latest take whose seed is not null, not a sum", () => {
    const old = take(["pre-algebra"], ["pre-algebra"], {}, { day: "2026-09-01" });
    const rushed = take(["pre-algebra"], ["pre-algebra"], {}, { day: "2026-10-06", rushed: true, seeded: false });
    const ref = FORMS["pre-algebra"][0].sec;
    expect(priorOf(store(old, rushed), ref, skillOf)).toEqual({ b: 1, l: "2026-08-31", n: 1, o: 1 });
    expect(priorOf(store(rushed), ref, skillOf)).toBeNull();
    expect(priorOf({}, ref, skillOf)).toBeNull();
    expect(priorOf(null, ref, skillOf)).toBeNull();
  });
});

describe("takesOf, isFirst, latestTake", () => {
  const a = take(["pre-algebra"], ["pre-algebra"], {}, { day: "2026-09-01" });
  const b = take(["pre-algebra"], ["pre-algebra"], {}, { day: "2026-10-06" });

  it("count plain-object takes only", () => {
    const d = { takes: { a, b, n: null, s: "x", l: [a], num: 4 }, other: 1 };
    expect(takesOf(d).sort()).toEqual(["a", "b"]);
    expect(isFirst(d)).toBe(false);
  });

  it("an empty or damaged store is first", () => {
    [undefined, null, 4, "x", [], {}, { takes: null }, { takes: [a] }, { takes: "x" }, { takes: { x: null } }].forEach((d) => {
      expect(takesOf(d)).toEqual([]);
      expect(isFirst(d)).toBe(true);
      expect(latestTake(d)).toBeNull();
    });
  });

  it("latestTake is the latest day; a tie goes to the greater id", () => {
    expect(latestTake({ takes: { a, b } })).toBe(b);
    expect(latestTake({ takes: { b, a } })).toBe(b);
    const c = { ...b, seed: 99 };
    expect(latestTake({ takes: { x: b, y: c } })).toBe(c);
    expect(latestTake({ takes: { y: c, x: b } })).toBe(c);
  });

  it("a beyond band, a bad day or no blocks is skipped as the result but still counts", () => {
    const beyond = { ...b, day: "2026-11-01", band: "beyond" } as unknown as DiagTake;
    const noDay = { ...b, day: 5 } as unknown as DiagTake;
    const future = { v: 2, shape: "later" };
    const d = { takes: { beyond, noDay, future, a } };
    expect(takesOf(d)).toHaveLength(4);
    expect(isFirst(d)).toBe(false);
    expect(latestTake(d)).toBe(a);
    expect(latestTake({ takes: { beyond } })).toBeNull();
    expect(isFirst({ takes: { beyond } })).toBe(false);
  });

  it("an __proto__ id is an ordinary id and pollutes nothing", () => {
    const d = JSON.parse('{"takes":{"__proto__":' + JSON.stringify(b) + ',"a":' + JSON.stringify(a) + "}}");
    expect(takesOf(d).sort()).toEqual(["__proto__", "a"]);
    expect(isFirst(d)).toBe(false);
    expect(latestTake(d)?.day).toBe("2026-10-06");
    expect(({} as Record<string, unknown>).day).toBeUndefined();
    expect(isFirst(JSON.parse('{"takes":{"__proto__":null}}'))).toBe(true);
  });
});
