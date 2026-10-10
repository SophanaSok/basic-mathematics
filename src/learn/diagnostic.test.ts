/* The placement check's questions, walk and rule (diagnostic.ts), against the real generators
   (data/gen/*.js run in a vm, as the Arena page runs them) and the real grader. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { judge, specOf } from "../core/answer/check.ts";
import type { Verdict } from "../core/answer/types.ts";
import { generatorSkill } from "../data/skills.ts";
import type { DiagBlock, DiagKind, DiagRun, Placeable } from "../types/state.ts";
import { BLUEPRINT, DIAG_FORM_RIGHT, DIAG_HOLD_FROM, DIAG_PASS, DIAG_SIZE } from "./constants.ts";
import {
  COVERAGE, FORMAT, FORMS, L, PRE, START_OF, closeBy, closeOf, drawBlock, finish, finished, formatOf, isPlaceable,
  deal, newRun as freshRun, nextBlock, nextItem, outcomeOf, placeOf, readRun, runOf, scoreBlock, statusOf, step, stripDegrees,
  takeId, withTake,
  type DiagFrom, type Make, type Outcome, type Status
} from "./diagnostic.ts";

const ROOT = join(import.meta.dirname, "..", "..");

function loadGen(): Record<string, any> {
  const win: Record<string, any> = {};
  win.window = win;
  createContext(win);
  ["core", "part1", "part2", "part3", "part4"].forEach((p) => {
    const f = "data/gen/" + p + ".js";
    runInContext(readFileSync(join(ROOT, f), "utf8"), win, { filename: f });
  });
  return win.BMGen;
}
const gen = loadGen();
const make: Make = (g, s) => gen.make(g, s);
const made = (g: string, s: number): any => gen.make(g, s);
const hash = (t: string): number => gen.hash(t);
const rng = (s: number) => gen.rng(s);

const COURSES4: Placeable[] = ["pre-algebra", "algebra-1", "geometry", "algebra-2"];
const FROMS: DiagFrom[] = ["none", "pre", "a1", "geo", "a2", "unsure"];
const size = (c: Placeable) => FORMS[c].length;
const key = (c: Placeable) => ({ "pre-algebra": "pre", "algebra-1": "a1", "geometry": "geo", "algebra-2": "a2" } as const)[c];

/* the 10,000-table monotone property: about 2s here, 6.1s on the CI runner, past vitest's
   5s default, so it gets the budget merge.test.ts gives its long property tests */
const LONG = 60_000;

/* a small seeded generator for the property tests and the simulation (mulberry32) */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Plays the walk with an answer table, as the page would: deal the next block, answer until it
   is settled. Returns what was asked, so a test can read statuses, lengths and the band. */
function play(from: DiagFrom, ans: (c: Placeable, i: number) => DiagKind) {
  const blocks: { course: Placeable; items: { k: DiagKind }[] }[] = [];
  const asked: [Placeable, number][] = [];
  for (let c = nextBlock(statusOf(blocks), START_OF[from]); c; c = nextBlock(statusOf(blocks), START_OF[from])) {
    const b = { course: c, items: [] as { k: DiagKind }[] };
    blocks.push(b);
    for (let i = 0; i < size(c) && scoreBlock(c, b.items.map((x) => x.k)).state === "open"; i++) {
      b.items.push({ k: ans(c, i) });
      asked.push([c, i]);
    }
  }
  const status = statusOf(blocks);
  return { blocks, asked, status, ...placeOf(status, from), length: asked.length };
}

/* a dealt run with real questions, and a driver that answers every open question */
function newRun(from: DiagFrom, seed: number): DiagRun {
  return { id: "abcde12345", seed, from, start: START_OF[from], blueprint: BLUEPRINT, began: "2026-10-07", blocks: [], pending: { u: 0 } };
}
function drive(run: DiagRun, answer: (g: string, course: Placeable) => Outcome, secs = 30): DiagRun {
  for (let guard = 0; guard < 100; guard++) {
    const c = nextBlock(statusOf(run.blocks), run.start);
    if (c) run = { ...run, blocks: [...run.blocks, { course: c, items: drawBlock(c, run.seed, make, hash, rng) }] };
    const at = nextItem(run);
    if (!at) { if (!c) return run; continue; }
    run = step(run, answer(at.item.g, run.blocks[at.block].course), secs);
  }
  throw new Error("the walk did not end");
}

describe("the forms", () => {
  it("name generators of their block's course, in the sections they test", () => {
    COURSES4.forEach((c) => {
      FORMS[c].forEach((f) => {
        const spec = gen.get(f.g);
        expect(spec, f.g).toBeTruthy();
        expect(spec.section, f.g).toBe(f.sec);
        expect(generatorSkill(f.g, f.sec)?.course, f.g).toBe(c);
      });
    });
  });
  it("have the sizes 8, 8, 6, 6 and none of the left-out generators", () => {
    expect(COURSES4.map(size)).toEqual([8, 8, 6, 6]);
    expect(COURSES4.map((c) => DIAG_SIZE[key(c)])).toEqual([8, 8, 6, 6]);
    expect(COURSES4.map((c) => DIAG_PASS[key(c)])).toEqual([5, 5, 4, 4]);
    const all = COURSES4.flatMap((c) => FORMS[c].map((f) => f.g));
    ["quad-count", "quadrant", "i-power"].forEach((g) => expect(all).not.toContain(g));
    expect(all.filter((g) => g === "point-sum")).toHaveLength(2);
  });
  it("keep L to the four placeable courses, in the US order, with Algebra 1 before both siblings", () => {
    expect(L).toEqual(COURSES4);
    expect(PRE).toEqual({ "pre-algebra": null, "algebra-1": "pre-algebra", "geometry": "algebra-1", "algebra-2": "algebra-1" });
    expect(isPlaceable("beyond")).toBe(false);
    expect(isPlaceable("geometry")).toBe(true);
    expect(isPlaceable(undefined)).toBe(false);
  });
  it("start at the course the self-report names", () => {
    expect(FROMS.map((f) => START_OF[f])).toEqual(
      ["pre-algebra", "algebra-1", "geometry", "algebra-2", "algebra-2", "pre-algebra"]);
  });
});

describe("drawBlock", () => {
  it("is deterministic for (seed, course) whatever block came first", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const forward = COURSES4.map((c) => drawBlock(c, seed, make, hash, rng));
      const backward = [...COURSES4].reverse().map((c) => drawBlock(c, seed, make, hash, rng)).reverse();
      expect(backward).toEqual(forward);
      forward.forEach((items, i) => {
        expect(items.map((x) => x.g).sort()).toEqual(FORMS[COURSES4[i]].map((f) => f.g).sort());
        items.forEach((x) => expect(x.s).toBeGreaterThanOrEqual(1));
        items.forEach((x) => expect(x.s).toBeLessThanOrEqual(2147483646));
      });
    }
    expect(drawBlock("geometry", 1, make, hash, rng)).not.toEqual(drawBlock("geometry", 2, make, hash, rng));
  });
  it("puts the lowest par first, a tie going to the earlier form, and shuffles the rest", () => {
    const first = ["tri-angle", "poly-eval", "perp-slope", "log-int"];
    const orders = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      COURSES4.forEach((c, i) => {
        const items = drawBlock(c, seed, make, hash, rng);
        expect(items[0].g).toBe(first[i]);
        if (c === "algebra-1") orders.add(items.map((x) => x.g).join());
      });
    }
    expect(orders.size).toBeGreaterThan(20);
  });
  it("repeats no question text within a take over 1,000 seeds", () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const qs = COURSES4.flatMap((c) => drawBlock(c, seed, make, hash, rng).map((x) => make(x.g, x.s)!.q));
      expect(new Set(qs).size, "seed " + seed).toBe(qs.length);
    }
  });
});

describe("the format line", () => {
  it("exists for every FORMS id and every type it produces over 1,000 seeds", () => {
    const seen: Record<string, Set<string>> = {};
    COURSES4.forEach((c) => FORMS[c].forEach((f) => {
      seen[f.g] = new Set();
      for (let s = 1; s <= 1000; s++) seen[f.g].add(made(f.g, s).type);
      seen[f.g].forEach((t) => expect(formatOf(f.g, t), f.g + " " + t).toBeTruthy());
    }));
    expect([...seen["circle-read"]].sort()).toEqual(["exact", "number"]);
    expect([...seen["deg-rad"]].sort()).toEqual(["expr", "number"]);
    expect(formatOf("ineq-flip", "exact")).toBe("An inequality, like x < 5.");
    expect(formatOf("point-sum", "exact")).toBe("A point, like (2, -5).");
    expect(formatOf("circle-read", "exact")).toBe("A point, like (2, -5).");
    expect(formatOf("circle-read", "number")).toBe("A whole number, like -7.");
    expect(formatOf("deg-rad", "expr")).toContain("pi");
    expect(formatOf("deg-rad", "number")).toContain("degrees");
    expect(formatOf("no-such-generator")).toBeNull();
    expect(formatOf("deg-rad", "tuple")).toBeNull();
    expect(Object.keys(FORMAT).sort()).toEqual([...new Set(COURSES4.flatMap((c) => FORMS[c].map((f) => f.g)))].sort());
  });
  it("is covered by one COVERAGE line per course, naming only sections in FORMS and all of them", () => {
    COURSES4.forEach((c) => {
      expect([...COVERAGE[c].secs].sort()).toEqual([...new Set(FORMS[c].map((f) => f.sec))].sort());
      expect(COVERAGE[c].line.length).toBeGreaterThan(10);
    });
  });
});

describe("stripDegrees", () => {
  it("agrees with the Arena's clean() on a fixed list", () => {
    const src = readFileSync(join(ROOT, "assets", "arena.js"), "utf8");
    const m = /function clean\(given, type\) \{[\s\S]*?\n  \}/.exec(src);
    expect(m).toBeTruthy();
    const clean = new Function("return " + m![0].replace("function clean", "function"))() as (g: string, t: string) => string;
    const givens = ["140°", "140 °", "140deg", "140 degrees", "140 Degrees", "  90 degree ", "7pi/6", "3/4°", "x°", "50", "°", "12 deg."];
    ["number", "fraction", "exact", "expr", "set", "point"].forEach((type) => {
      givens.forEach((g) => expect(stripDegrees(g, type), type + " " + JSON.stringify(g)).toBe(clean(g, type)));
    });
    expect(stripDegrees("140°", "number")).toBe("140");
    expect(stripDegrees("140°", "exact")).toBe("140°");
  });
});

describe("a block", () => {
  it("decides within its size and matches the full-block rule on every answer pattern", () => {
    COURSES4.forEach((c) => {
      const n = size(c), pass = DIAG_PASS[key(c)];
      for (let bits = 0; bits < 1 << n; bits++) {
        const kinds: DiagKind[] = Array.from({ length: n }, (_, i) => (bits >> i) & 1 ? "right" : "wrong");
        const rights = kinds.filter((k) => k === "right").length;
        const r = scoreBlock(c, kinds);
        expect(r.state, c + " " + bits).toBe(rights >= pass ? "clear" : "not-yet");
        // the curtailed prefix: the first point where the block is settled, never later than n
        let at = 0;
        while (scoreBlock(c, kinds.slice(0, at)).state === "open") at++;
        expect(at).toBeLessThanOrEqual(n);
        expect(scoreBlock(c, kinds.slice(0, at)).state).toBe(r.state);
        if (at > 0) expect(scoreBlock(c, kinds.slice(0, at - 1)).state).toBe("open");
      }
    });
  });
  it("stops at the 4th miss in an 8-block and the 3rd in a 6-block, and at 5 or 4 right", () => {
    expect(scoreBlock("pre-algebra", ["wrong", "wrong", "wrong"]).state).toBe("open");
    expect(scoreBlock("pre-algebra", ["wrong", "wrong", "wrong", "wrong"]).state).toBe("not-yet");
    expect(scoreBlock("geometry", ["wrong", "wrong"]).state).toBe("open");
    expect(scoreBlock("geometry", ["wrong", "wrong", "wrong"]).state).toBe("not-yet");
    expect(scoreBlock("algebra-1", Array(5).fill("right")).state).toBe("clear");
    expect(scoreBlock("algebra-2", Array(4).fill("right")).state).toBe("clear");
    expect(scoreBlock("algebra-2", Array(3).fill("right")).state).toBe("open");
  });
  it("counts form and skip as not right (DG2)", () => {
    expect(DIAG_FORM_RIGHT).toBe(false);
    expect(scoreBlock("geometry", ["form", "form", "form"]).state).toBe("not-yet");
    expect(scoreBlock("geometry", ["skip", "skip", "skip"]).state).toBe("not-yet");
    expect(scoreBlock("geometry", ["form", "right", "right", "right", "right"], true).state).toBe("clear");
    expect(scoreBlock("geometry", ["form", "right", "right", "right", "right"]).state).toBe("clear");
    expect(scoreBlock("geometry", ["form", "form", "right", "right", "right"]).state).toBe("open");
  });
});

/* every combination of block outcomes: a clear block is its minimum run of rights, a not-yet
   block its minimum run of misses */
function outcomes(): Record<Placeable, "clear" | "not-yet">[] {
  return Array.from({ length: 16 }, (_, bits) => Object.fromEntries(
    COURSES4.map((c, i) => [c, (bits >> i) & 1 ? "clear" : "not-yet"])) as Record<Placeable, "clear" | "not-yet">);
}
const answerOf = (o: Record<Placeable, "clear" | "not-yet">) => (c: Placeable): DiagKind => (o[c] === "clear" ? "right" : "wrong");

describe("the walk", () => {
  it("gives, for each of 6 starts and every combination of outcomes, a band in L and 4 to 28 questions", () => {
    FROMS.forEach((from) => outcomes().forEach((o) => {
      const r = play(from, answerOf(o));
      expect(L, from).toContain(r.band);
      expect(r.band).not.toBe("beyond");
      expect(r.length).toBeGreaterThanOrEqual(4);
      expect(r.length).toBeLessThanOrEqual(28);
      // a block is asked at most once, and the start is asked first
      expect(new Set(r.blocks.map((b) => b.course)).size).toBe(r.blocks.length);
      expect(r.blocks[0].course).toBe(START_OF[from]);
      // Algebra 1 cleared, asked or implied, always runs both Geometry and Algebra 2
      if (r.status["algebra-1"] === "clear" || r.status["algebra-1"] === "implied") {
        const asked = r.blocks.map((b) => b.course);
        expect(asked, from + JSON.stringify(o)).toContain("geometry");
        expect(asked, from + JSON.stringify(o)).toContain("algebra-2");
      }
      // nothing implies Geometry or Algebra 2
      expect(r.status.geometry).not.toBe("implied");
      expect(r.status["algebra-2"]).not.toBe("implied");
      expect(finished({ ...newRun(from, 1), blocks: r.blocks.map((b) => ({ course: b.course, items: b.items.map((x, i) => ({ g: "g", s: i + 1, sec: "ch01#x" as const, k: x.k })) })) })).toBe(true);
    }));
  });
  it("climbs on a clear and drops on a miss, asking Geometry before Algebra 2", () => {
    const ok = () => "right" as const, no = () => "wrong" as const;
    expect(play("a1", ok).blocks.map((b) => b.course)).toEqual(["geometry", "algebra-2"]);
    expect(play("pre", ok).blocks.map((b) => b.course)).toEqual(["algebra-1", "geometry", "algebra-2"]);
    expect(play("pre", no).blocks.map((b) => b.course)).toEqual(["algebra-1", "pre-algebra"]);
    expect(play("none", no).length).toBe(4);
    expect(play("unsure", no).length).toBe(4);
    expect(play("geo", (c) => (c === "algebra-2" ? "wrong" : "right")).blocks.map((b) => b.course)).toEqual(["algebra-2", "algebra-1", "geometry"]);
  });
  it("start a2, clear: Algebra 1 and Pre-algebra are implied and Geometry is asked, never implied", () => {
    const blocks = [{ course: "algebra-2" as const, items: Array(4).fill({ k: "right" as const }) }];
    const status = statusOf(blocks);
    expect(status).toEqual({ "algebra-2": "clear", "algebra-1": "implied", "pre-algebra": "implied" });
    expect(status.geometry).toBeUndefined();
    expect(nextBlock(status, "algebra-2")).toBe("geometry");
    ["a2", "geo"].forEach((from) => {
      const r = play(from as DiagFrom, () => "right");
      expect(r.blocks.map((b) => b.course)).toEqual(["algebra-2", "geometry"]);
      expect(r.length).toBe(8);
      expect(r.status.geometry).toBe("clear");
      expect(r.status["algebra-1"]).toBe("implied");
      expect(r.status["pre-algebra"]).toBe("implied");
    });
    expect(play("a2", () => "right")).toMatchObject({ band: "algebra-2", all: true });
  });
  it("waits while a block is open and stops when nothing is left to ask", () => {
    expect(nextBlock({}, "geometry")).toBe("geometry");
    expect(nextBlock({ geometry: "open" }, "geometry")).toBeNull();
    const done: Status = { "pre-algebra": "clear", "algebra-1": "not-yet" };
    expect(nextBlock(done, "algebra-1")).toBeNull();
  });
});

describe("placeOf and the Geometry hold", () => {
  it("never places past Geometry on a cleared Geometry block for none, pre and a1", () => {
    expect(DIAG_HOLD_FROM).toEqual(["none", "pre", "a1"]);
    FROMS.forEach((from) => outcomes().forEach((o) => {
      const r = play(from, answerOf(o));
      const held = DIAG_HOLD_FROM.includes(from);
      if (r.status.geometry === "clear" && held) {
        expect(L.indexOf(r.band), from + JSON.stringify(o)).toBeLessThanOrEqual(2);
        expect(r.all).toBeUndefined();
      }
      if (r.status.geometry === "clear" && !held && r.status["algebra-2"] !== "not-yet") {
        expect(r.band, from + JSON.stringify(o)).toBe("algebra-2");
      }
    }));
  });
  it("holds Algebra 1 finishers at Geometry whatever Algebra 2 does, and credits a cleared Algebra 2", () => {
    const r = play("a1", () => "right");
    expect(r.band).toBe("geometry");
    expect(r.all).toBeUndefined();
    expect(r.status).toMatchObject({ geometry: "clear", "algebra-2": "clear" });
    expect(play("a1", (c) => (c === "algebra-2" ? "wrong" : "right")).band).toBe("geometry");
    // not held: "Geometry", "Algebra 2 or higher" and "not sure"
    expect(play("geo", () => "right")).toMatchObject({ band: "algebra-2", all: true });
    expect(play("unsure", () => "right")).toMatchObject({ band: "algebra-2", all: true });
    expect(play("unsure", (c) => (c === "algebra-2" ? "wrong" : "right")).band).toBe("algebra-2");
  });
  it("puts a sibling's result as the first course that is not cleared", () => {
    expect(play("a1", (c) => (c === "geometry" ? "wrong" : "right")).band).toBe("geometry");
    expect(play("geo", (c) => (c === "geometry" ? "wrong" : "right")).band).toBe("geometry");
    expect(play("geo", (c) => (c === "algebra-1" || c === "algebra-2" ? "wrong" : "right")).band).toBe("algebra-1");
  });
  it("is monotone: turning a not-right answer into right never lowers the band", () => {
    const rand = mulberry(20261007);
    const KINDS: DiagKind[] = ["right", "right", "wrong", "form", "skip"];
    for (let t = 0; t < 10_000; t++) {
      const table = Object.fromEntries(COURSES4.map((c) => [c, Array.from({ length: 8 }, () => KINDS[Math.floor(rand() * KINDS.length)])])) as Record<Placeable, DiagKind[]>;
      FROMS.forEach((from) => {
        const base = play(from, (c, i) => table[c][i]);
        const idx = (r: typeof base) => (r.all ? 4 : L.indexOf(r.band));
        base.asked.forEach(([c, i]) => {
          if (table[c][i] === "right") return;
          const flipped = play(from, (c2, j) => (c2 === c && j === i ? "right" : table[c2][j]));
          if (idx(flipped) < idx(base)) throw new Error("band fell: " + from + " " + JSON.stringify(table) + " at " + c + " " + i);
        });
      });
    }
  }, LONG);
});

describe("close", () => {
  const block = (course: Placeable, kinds: DiagKind[]): DiagBlock => ({
    course, pass: scoreBlock(course, kinds).state === "clear",
    items: kinds.map((k, i) => ({ g: "g", s: i + 1, sec: "ch01#x" as const, k }))
  });
  it("is set when the band's block missed by one right, or would have cleared with its form answers", () => {
    const four = block("algebra-1", ["right", "right", "right", "right", "wrong", "wrong", "wrong", "wrong"]);
    expect(closeBy([four], "algebra-1")).toBe("count");
    expect(closeOf([four], "algebra-1")).toBe("algebra-1");
    const form = block("algebra-1", ["right", "right", "right", "form", "form", "wrong", "wrong"]);
    expect(form.pass).toBe(false);
    expect(closeBy([form], "algebra-1")).toBe("form");
    // both: the form reading wins
    const both = block("geometry", ["right", "right", "right", "form", "wrong", "wrong"]);
    expect(closeBy([both], "geometry")).toBe("form");
    const geoCount = block("geometry", ["right", "right", "right", "wrong", "wrong", "wrong"]);
    expect(closeBy([geoCount], "geometry")).toBe("count");
  });
  it("is not set by a clear block, a far miss, a skip or another block", () => {
    expect(closeOf([block("algebra-1", Array(5).fill("right"))], "algebra-1")).toBeUndefined();
    expect(closeOf([block("algebra-1", ["right", "right", "wrong", "wrong", "wrong", "wrong"])], "algebra-1")).toBeUndefined();
    expect(closeOf([block("algebra-1", ["right", "right", "right", "skip", "skip", "skip", "skip"])], "algebra-1")).toBeUndefined();
    const other = block("pre-algebra", ["right", "right", "right", "right", "wrong", "wrong", "wrong", "wrong"]);
    const band = block("algebra-1", ["wrong", "wrong", "wrong", "wrong"]);
    expect(closeOf([other, band], "algebra-1")).toBeUndefined();
    expect(closeOf([other], "algebra-1")).toBeUndefined();
  });
  it("lands on the finished take: the band, with the form flip", () => {
    const run = drive(newRun("pre", 7), (_, c) => (c === "algebra-1" ? { kind: "form", reason: "rounded" } : { kind: "wrong" }));
    expect(run.blocks[0].course).toBe("algebra-1");
    const take = finish(run, "2026-10-07", 3);
    expect(take.band).toBe("pre-algebra");
    expect(take.close).toBeUndefined();
    const mix = drive(newRun("pre", 7), (g, c) => {
      const i = FORMS[c].findIndex((f) => f.g === g);
      if (c !== "algebra-1") return { kind: "right" };
      return i % 2 ? { kind: "form", reason: "notation" } : { kind: "right" };
    });
    const t2 = finish(mix, "2026-10-07", 3);
    expect(t2.blocks[0].pass).toBe(false);
    expect(t2.band).toBe("algebra-1");
    expect(t2.close).toBe("algebra-1");
  });
});

describe("the run", () => {
  const stubJudge = (kinds: Verdict[]) => { let i = 0; return () => kinds[Math.min(i++, kinds.length - 1)]; };
  const unread: Verdict = { kind: "unread", reason: "words", at: 0 };
  const wrong: Verdict = { kind: "wrong", read: null };

  it("keeps the same question through any number of unread answers and records nothing until the final one", () => {
    let run = newRun("none", 99);
    run = { ...run, blocks: [{ course: "pre-algebra", items: drawBlock("pre-algebra", 99, make, hash, rng) }] };
    const first = nextItem(run)!;
    const j = stubJudge([unread, unread, unread, unread, unread, wrong]);
    for (let n = 1; n <= 5; n++) {
      run = step(run, outcomeOf(j()), 12);
      const at = nextItem(run)!;
      expect(at.item.g).toBe(first.item.g);
      expect(at.index).toBe(0);
      expect(run.blocks[0].items.every((x) => x.k === undefined)).toBe(true);
      expect(run.pending).toEqual({ u: n, r: "words" });
    }
    run = step(run, outcomeOf(j()), 12);
    expect(run.blocks[0].items[0]).toMatchObject({ g: first.item.g, k: "wrong", u: 5, secs: 12 });
    expect(run.pending).toEqual({ u: 0 });
    expect(nextItem(run)!.index).toBe(1);
  });
  it("lets an empty box change nothing, not even the unread count", () => {
    let run = newRun("none", 5);
    run = { ...run, blocks: [{ course: "pre-algebra", items: drawBlock("pre-algebra", 5, make, hash, rng) }] };
    expect(step(run, { kind: "empty" }, 3)).toBe(run);
    const after = step(run, { kind: "unread", reason: "words" }, 3);
    expect(step(after, { kind: "empty" }, 3)).toBe(after);
    expect(after.pending.u).toBe(1);
  });
  it("sends a typed answer through the real grader", () => {
    const p = made("frac-sum", 3);
    const v = judge(stripDegrees(p.answer.split("|")[0], p.type), specOf(p));
    expect(outcomeOf(v).kind).toBe("right");
    expect(outcomeOf(judge("", specOf(p))).kind).toBe("unread");
    expect(outcomeOf(judge("0.667", specOf({ answer: "2/3", type: "fraction" })))).toEqual({ kind: "form", reason: "rounded" });
  });
  it("finishes into a take with no r, u or timing on any item, and never a stored unread", () => {
    let k = 0;
    const run = drive(newRun("a1", 4242), (_, c) => {
      k++;
      if (k % 3 === 0) return { kind: "form", reason: "rounded" };
      if (k % 5 === 0) return { kind: "skip" };
      return c === "geometry" ? { kind: "right" } : { kind: "wrong" };
    }, 9);
    const noisy = (r: DiagRun) => r.blocks.some((b) => b.items.some((i) => i.r !== undefined || i.secs !== undefined));
    expect(noisy(run)).toBe(true);
    const take = finish(run, "2026-10-07", 3);
    expect(take).toMatchObject({ v: 1, day: "2026-10-07", from: "a1", start: "geometry", blueprint: BLUEPRINT, grader: 3, seed: 4242, seeded: true });
    take.blocks.forEach((b) => b.items.forEach((i) => {
      expect(Object.keys(i).sort()).toEqual(["g", "k", "s", "sec"]);
      expect(["right", "form", "wrong", "skip"]).toContain(i.k);
    }));
    expect(JSON.stringify(take)).not.toMatch(/"(u|r|secs|read|unread)"/);
    // only what was asked is kept
    take.blocks.forEach((b) => expect(b.items.length).toBeLessThanOrEqual(size(b.course)));
    expect(take.blocks.map((b) => b.course)).toEqual(run.blocks.map((b) => b.course));
    expect(() => finish({ ...run, blocks: [{ course: "geometry", items: run.blocks[0].items.map((i) => ({ g: i.g, s: i.s, sec: i.sec })) }] }, "2026-10-07", 3)).toThrow();
  });
  it("finishes a held, all-right Algebra 1 report as Geometry with both blocks passed", () => {
    const take = finish(drive(newRun("a1", 11), () => ({ kind: "right" })), "2026-10-07", 3);
    expect(take.band).toBe("geometry");
    expect(take.all).toBeUndefined();
    expect(take.blocks.map((b) => [b.course, b.pass, b.items.length])).toEqual([["geometry", true, 4], ["algebra-2", true, 4]]);
  });
  it("finishes an all-right Algebra 2 report as every course cleared", () => {
    const take = finish(drive(newRun("a2", 12), () => ({ kind: "right" })), "2026-10-07", 3);
    expect(take).toMatchObject({ band: "algebra-2", all: true, seeded: true });
    expect(take.blocks.map((b) => b.course)).toEqual(["algebra-2", "geometry"]);
  });
  it("marks four fast answers rushed and unseeded, and skips never count as fast", () => {
    const par = (g: string) => gen.get(g).par as number;
    const fast = drive(newRun("a2", 12), () => ({ kind: "right" }), 0.5);
    expect(finish(fast, "2026-10-07", 3, par)).toMatchObject({ rushed: true, seeded: false });
    expect(finish(fast, "2026-10-07", 3)).toMatchObject({ seeded: true });
    expect(finish(fast, "2026-10-07", 3).rushed).toBeUndefined();
    const slow = drive(newRun("a2", 12), () => ({ kind: "right" }), 30);
    expect(finish(slow, "2026-10-07", 3, par).rushed).toBeUndefined();
    const skips = drive(newRun("none", 12), () => ({ kind: "skip" }), 0);
    expect(finish(skips, "2026-10-07", 3, par)).toMatchObject({ band: "pre-algebra", seeded: true });
  });
});

/* A fixed-seed port of the design's toy simulation (section 3.7). Levels 0 to 4 are how many
   courses the learner has finished, in the US order; success is high on a known course and
   low above it; 20% answer "not sure", the rest report truthfully 70% of the time and one level
   off otherwise. A guard on the rule, not a validity claim: no learner took this. */
function simulate(variant: boolean, n: number) {
  const rand = mulberry(31337);
  const U = (a: number, b: number) => a + (b - a) * rand();
  const reports: DiagFrom[] = ["none", "pre", "a1", "geo", "a2"];
  let exact = 0, within = 0, items = 0, max = 0, told = 0, a1Finishers = 0;
  for (let t = 0; t < n; t++) {
    const level = Math.floor(rand() * 5);
    let from: DiagFrom;
    if (rand() < 0.2) from = "unsure";
    else if (rand() < 0.7) from = reports[level];
    else from = reports[Math.max(0, Math.min(4, level + (rand() < 0.5 ? -1 : 1)))];
    const p = COURSES4.map((c, j) => (j < level ? U(0.75, 0.95) : variant && level === 2 && c === "geometry" ? U(0.5, 0.85) : U(0.05, 0.35)));
    const r = play(from, (c) => (rand() < p[COURSES4.indexOf(c)] ? "right" : "wrong"));
    const truth = Math.min(level, 3), got = L.indexOf(r.band);
    if (got === truth) exact++;
    if (Math.abs(got - truth) <= 1) within++;
    items += r.length;
    max = Math.max(max, r.length);
    if (level === 2) { a1Finishers++; if (r.band === "algebra-2") told++; }
  }
  return { exact: exact / n, within: within / n, mean: items / n, max, told: told / a1Finishers };
}

describe("the rule, regression with the Geometry hold", () => {
  it("meets the base model's bounds", () => {
    const r = simulate(false, 20_000);
    expect(r.exact).toBeGreaterThanOrEqual(0.9);
    expect(r.within).toBeGreaterThanOrEqual(0.98);
    expect(r.mean).toBeLessThanOrEqual(12);
    expect(r.max).toBeLessThanOrEqual(28);
  });
  it("keeps Algebra 1 finishers told Algebra 2 low when Geometry's coordinate questions are easy for them", () => {
    const r = simulate(true, 20_000);
    expect(r.told).toBeLessThanOrEqual(0.25);
    expect(r.max).toBeLessThanOrEqual(28);
  });
});

/* ------------------------------------------------------ the run's shell (D-9a) -- */

const known = (g: string) => g !== "nope" && Object.values(FORMS).some((f) => f.some((x) => x.g === g));
const stub: Make = (g, s) => ({ q: g + s, par: 10 + (s % 7) });
/* a whole block of `course` in form order, the first kinds answered */
const blockOf = (course: Placeable, kinds: DiagKind[]): any => ({
  course, items: FORMS[course].map((f, i) => ({ g: f.g, s: 100 + i, sec: f.sec, ...(i < kinds.length ? { k: kinds[i] } : {}) }))
});
const goodRun = (): any => ({
  id: "abcde12345", seed: 12345, from: "pre", start: "algebra-1", blueprint: BLUEPRINT, began: "2026-10-07",
  blocks: [{ course: "algebra-1", items: [
    { g: "poly-eval", s: 7, sec: "ch12#definition-fn", k: "right", secs: 4.5 },
    { g: "ineq-flip", s: 9, sec: "ch03#order", k: "form", r: "rounded", u: 2 },
    { g: "abs-solve", s: 11, sec: "ch03#absolute" },
    { g: "quad-roots", s: 12, sec: "ch04#formula" },
    { g: "pow-frac", s: 13, sec: "ch03#powers" },
    { g: "exp-solve", s: 14, sec: "ch12#exponential" },
    { g: "quad-square", s: 15, sec: "ch04#square-roots" },
    { g: "vertex-x", s: 16, sec: "ch04#graph" }
  ] }],
  pending: { u: 1, r: "words" }
});
const withRun = (patch: (r: any) => void): unknown => { const r = goodRun(); patch(r); return r; };
const RIGHT5: DiagKind[] = ["right", "right", "right", "right", "right"];

describe("readRun", () => {
  it("reads a valid run back equal to its input, as a new object", () => {
    const x = goodRun();
    const r = readRun(x, known);
    expect(r).toEqual(x);
    expect(r).not.toBe(x);
    expect(r!.blocks[0]).not.toBe(x.blocks[0]);
    const two = withRun((r) => { r.blocks = [blockOf("algebra-1", RIGHT5), blockOf("geometry", ["wrong"])]; });
    expect(readRun(two, known)).toEqual(two);
  });
  it("refuses what is not a run", () => {
    [null, undefined, [], "x", 5, true, {}, [goodRun()]].forEach((x) => expect(readRun(x, known)).toBeNull());
  });
  it("refuses damaged fields", () => {
    const bad: ((r: any) => void)[] = [
      (r) => { r.blocks = Array.from({ length: 50 }, () => r.blocks[0]); },
      (r) => { r.blocks[0].items = Array.from({ length: DIAG_SIZE.a1 + 1 }, () => r.blocks[0].items[0]); },
      (r) => { r.blocks[0].items[0].g = "nope"; },
      (r) => { r.blueprint = 0; },
      (r) => { r.blocks.push({ course: "algebra-1", items: [] }); },
      (r) => { r.blocks[0].course = "beyond"; },
      (r) => { r.seed = -1; },
      (r) => { r.seed = 2 ** 32; },
      (r) => { r.seed = 1.5; },
      (r) => { r.began = "yesterday"; },
      (r) => { r.began = 20261007; },
      (r) => { r.began = "2026-02-31"; },
      (r) => { r.id = ""; },
      (r) => { r.id = "x".repeat(65); },
      (r) => { r.id = "__proto__"; },
      (r) => { r.id = "ABC12"; },
      (r) => { r.id = "a-b"; },
      (r) => { r.from = "toString"; },
      (r) => { r.start = "geometry"; },
      (r) => { r.blocks[0].items[0].s = 0; },
      (r) => { r.blocks[0].items[0].k = "unread"; },
      (r) => { r.blocks[0].items[0].sec = 5; },
      (r) => { r.blocks = {}; },
      // stuck runs: no next item, nothing to deal, not finished
      (r) => { r.blocks[0].items = []; },
      (r) => { r.blocks[0].items = r.blocks[0].items.slice(0, 2); r.blocks[0].items[1].k = "right"; },
      (r) => { r.blocks.push(blockOf("geometry", ["right", "right", "right", "right"])); },
      (r) => { delete r.blocks[0].items[0].k; },
      // not the form: a generator twice, a section moved
      (r) => { Object.assign(r.blocks[0].items[2], { g: "pow-frac", sec: "ch03#powers" }); },
      (r) => { r.blocks[0].items[2].sec = "ch03#order"; },
      // not the block the walk deals
      (r) => { r.blocks = [blockOf("pre-algebra", [])]; },
      (r) => { r.blocks = [blockOf("algebra-1", RIGHT5), blockOf("algebra-2", [])]; },
      (r) => { r.blocks = [blockOf("algebra-1", RIGHT5), blockOf("pre-algebra", [])]; }
    ];
    bad.forEach((p, i) => expect(readRun(withRun(p), known), "fixture " + i).toBeNull());
  });
  it("normalises pending and drops bad optional fields", () => {
    expect(readRun(withRun((r) => { r.pending = null; }), known)!.pending).toEqual({ u: 0 });
    expect(readRun(withRun((r) => { r.pending = { u: -1 }; }), known)!.pending).toEqual({ u: 0 });
    expect(readRun(withRun((r) => { r.pending = { u: 3, r: 5 }; }), known)!.pending).toEqual({ u: 3 });
    const it0 = readRun(withRun((r) => { Object.assign(r.blocks[0].items[0], { r: 3, u: 0, secs: -1, extra: 1 }); }), known)!.blocks[0].items[0];
    expect(it0).toEqual({ g: "poly-eval", s: 7, sec: "ch12#definition-fn", k: "right" });
  });
  it("never leaks an own __proto__ key", () => {
    const evil = JSON.parse('{"__proto__": {"polluted": 1}, "constructor": 1}');
    expect(readRun(evil, known)).toBeNull();
    const x = JSON.parse(JSON.stringify(goodRun()).replace('"id"', '"__proto__":{"polluted":1},"constructor":{"x":1},"id"'));
    x.blocks[0].items[2] = JSON.parse('{"g":"abs-solve","s":11,"sec":"ch03#absolute","__proto__":{"polluted":1}}');
    const r = readRun(x, known)!;
    expect(r).not.toBeNull();
    expect(Object.hasOwn(r, "__proto__")).toBe(false);
    expect(Object.hasOwn(r, "constructor")).toBe(false);
    expect(Object.hasOwn(r.blocks[0].items[2], "__proto__")).toBe(false);
    expect(({} as any).polluted).toBeUndefined();
    expect(readRun(JSON.parse('{"__proto__":{"id":"a"}}'), known)).toBeNull();
  });
  it("never throws on random JSON-ish values; what it accepts reads back unchanged and can go on", () => {
    const rand = mulberry(2026);
    const pick = <T,>(a: readonly T[]): T => a[Math.floor(rand() * a.length)];
    const val = (d: number): any => {
      const t = rand();
      if (d > 3 || t < 0.5) return pick<any>([null, true, 0, 1, -1, 7, 2 ** 32, 1.5, "", "a", "algebra-1", "pre", "2026-10-07", "right", "poly-eval", "__proto__", BLUEPRINT, NaN, []]);
      if (t < 0.7) return Array.from({ length: Math.floor(rand() * 5) }, () => val(d + 1));
      const o: any = {};
      for (let i = Math.floor(rand() * 4); i > 0; i--) Object.defineProperty(o, pick(["id", "g", "s", "k", "sec", "u", "r", "secs", "__proto__", "x"]), { value: val(d + 1), enumerable: true, writable: true, configurable: true });
      return o;
    };
    // a run part way through a real walk, so that the inputs reach every check
    const outs: Outcome[] = [{ kind: "right" }, { kind: "wrong" }, { kind: "skip" }, { kind: "form", reason: "notation" },
      { kind: "unread", reason: "named" }, { kind: "empty" }];
    const base = (): DiagRun => {
      let run = freshRun(pick(FROMS), Math.floor(rand() * 2 ** 32), "abcde12345", "2026-10-07");
      for (let n = Math.floor(rand() * 30); n > 0 && !finished(run); n--) run = step(deal(run, stub, hash, rng), pick(outs), rand() * 40);
      return run;
    };
    // then damage it, lightly or not at all
    const mutate = (x: any, rate: number): any => {
      if (Array.isArray(x)) return x.map((v) => mutate(v, rate));
      if (x && typeof x === "object") {
        const o: any = {};
        Object.keys(x).forEach((k) => { if (rand() >= rate) o[k] = rand() < rate * 1.5 ? val(2) : mutate(x[k], rate); });
        return o;
      }
      return rand() < rate ? val(2) : x;
    };
    let ok = 0, damaged = 0;
    for (let i = 0; i < 20_000; i++) {
      const rate = rand() < 0.3 ? 0 : rand() * 0.05;
      const x = i % 2 ? val(0) : mutate(base(), rate);
      const r = readRun(x, known);
      if (!r) continue;
      ok++;
      if (rate > 0) damaged++;
      expect(readRun(r, known)).toEqual(r);
      // the invariant: an open question, or a block to deal, or the end
      expect(nextItem(r) !== null || deal(r, stub, hash, rng) !== r || finished(r)).toBe(true);
    }
    expect(ok).toBeGreaterThan(1000);
    expect(damaged).toBeGreaterThan(100);
  }, LONG);
});

describe("newRun, deal and the run end to end", () => {
  const back = (r: DiagRun) => readRun(JSON.parse(JSON.stringify(r)), known);
  it("starts empty at the start of the self-report", () => {
    FROMS.forEach((f) => expect(freshRun(f, 5, "id1", "2026-10-07")).toEqual({
      id: "id1", seed: 5, from: f, start: START_OF[f], blueprint: BLUEPRINT, began: "2026-10-07", blocks: [], pending: { u: 0 }
    }));
    expect(readRun(freshRun("none", 5, "id1", "2026-10-07"), known)).not.toBeNull();
  });
  it("deals, steps and finishes into a take, with a stub make", () => {
    let run = freshRun("geo", 4242, "run1", "2026-10-07");
    for (let guard = 0; guard < 100 && !finished(run); guard++) {
      run = deal(run, stub, hash, rng);
      expect(back(run)).toEqual(run);
      expect(deal(run, stub, hash, rng)).toBe(run);
      run = step(run, { kind: "right" }, 20);
    }
    expect(finished(run)).toBe(true);
    expect(deal(run, stub, hash, rng)).toBe(run);
    expect(run.blocks.map((b) => b.course)).toEqual(["algebra-2", "geometry"]);
    const take = finish(run, "2026-10-07", 3);
    expect(take.band).toBe("algebra-2");
    expect(take.all).toBe(true);
  });
  it("reads every step of a mixed run back through JSON as the same run", () => {
    const outs: Outcome[] = [
      { kind: "unread", reason: "words" }, { kind: "form", reason: "rounded" }, { kind: "wrong" }, { kind: "skip" },
      { kind: "right" }, { kind: "empty" }, { kind: "unread", reason: "spaces" }, { kind: "unread" }, { kind: "right" },
      { kind: "right" }, { kind: "form", reason: "unreduced" }, { kind: "right" }
    ];
    let run = freshRun("pre", 4242, "run1", "2026-10-07");
    expect(back(run)).toEqual(run);
    for (let n = 0; n < 200 && !finished(run); n++) {
      run = deal(run, stub, hash, rng);
      expect(back(run)).toEqual(run);
      run = step(run, outs[n % outs.length], 7.25);
      expect(back(run)).toEqual(run);
    }
    expect(finished(run)).toBe(true);
    const items = run.blocks.flatMap((b) => b.items);
    expect(items.some((i) => i.k === "form" && i.r === "rounded" && i.u === 1 && i.secs === 7.25)).toBe(true);
    expect(items.some((i) => i.k === "skip" && i.secs === undefined)).toBe(true);
    expect(items.some((i) => i.u === 2)).toBe(true);
    expect(run.blocks.length).toBeGreaterThan(1);
    expect(() => finish(run, "2026-10-07", 3)).not.toThrow();
  });
  it("draws a block from (seed, course) alone", () => {
    const a = deal(freshRun("none", 77, "a", "2026-10-07"), stub, hash, rng);
    expect(a.blocks).toHaveLength(1);
    expect(a.blocks[0].items).toEqual(drawBlock("pre-algebra", 77, stub, hash, rng));
  });
  it("deals a later block the same whichever route reached it", () => {
    const walk = (from: DiagFrom, kind: "right" | "wrong") => {
      let run = deal(freshRun(from, 31337, "r", "2026-10-07"), make, hash, rng);
      while (nextItem(run)) run = step(run, { kind }, 5);
      return deal(run, make, hash, rng);
    };
    const up = walk("none", "right"), down = walk("a1", "wrong");
    expect(up.blocks.map((b) => b.course)).toEqual(["pre-algebra", "algebra-1"]);
    expect(down.blocks.map((b) => b.course)).toEqual(["geometry", "algebra-1"]);
    expect(up.blocks[1].items).toEqual(down.blocks[1].items);
    expect(up.blocks[1].items).toEqual(drawBlock("algebra-1", 31337, make, hash, rng));
  });
});

describe("withTake", () => {
  const take = finish(drive(newRun("a1", 11), () => ({ kind: "right" })), "2026-10-07", 3);
  it("keeps unknown fields and treats a non-object takes as empty", () => {
    const r = withTake({ takes: 5, extra: 1 }, take, "t1")!;
    expect(r.extra).toBe(1);
    expect(r.takes).toEqual({ t1: take });
  });
  it("adds beside existing takes, keeps every other entry, damaged or not, and the other fields", () => {
    const r = withTake({ takes: { a: take, junk: null, n: 5 }, extra: [1] }, take, "b")!;
    expect(r.takes).toEqual({ a: take, junk: null, n: 5, b: take });
    expect(r.extra).toEqual([1]);
  });
  it("is idempotent by id", () => {
    const once = withTake(undefined, take, "t1")!;
    expect(once.takes).toEqual({ t1: take });
    expect(withTake(once, take, "t1")).toBeNull();
  });
  it("replaces a damaged entry under its id rather than counting it as written", () => {
    [null, 5, "x", [take]].forEach((d) => expect(withTake({ takes: { t1: d, a: take } }, take, "t1")!.takes).toEqual({ t1: take, a: take }));
  });
  it("treats a non-object store as empty", () => {
    [null, "x", [1], 3, undefined].forEach((s) => expect(withTake(s, take, "t")).toEqual({ takes: { t: take } }));
  });
  it("never sets a prototype, and leaves out a stored __proto__ take as mergeDiag does", () => {
    const r = withTake({}, take, "__proto__")!;
    expect(Object.hasOwn(r.takes!, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(r.takes)).toBe(Object.prototype);
    expect(withTake(r, take, "__proto__")).toBeNull();
    const parsed = JSON.parse('{"takes":{"__proto__":{"a":1},"x":{"b":1}},"__proto__":{"b":2}}');
    const w = withTake(parsed, take, "z")!;
    expect(Object.getPrototypeOf(w)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(w.takes)).toBe(Object.prototype);
    expect((w as any).b).toBeUndefined();
    expect(Object.keys(w.takes!).sort()).toEqual(["x", "z"]);
  });
});

describe("takeId", () => {
  it("is 10 characters of [0-9a-z]", () => {
    [new Uint32Array(4), new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff]), new Uint32Array(8)]
      .forEach((w) => expect(takeId(w)).toMatch(/^[0-9a-z]{10}$/));
  });
  it("refuses fewer than 4 random words", () => {
    [0, 1, 2, 3].forEach((n) => expect(() => takeId(new Uint32Array(n))).toThrow(RangeError));
  });
  it("gives distinct ids for 10,000 random inputs", () => {
    const rand = mulberry(99);
    const ids = new Set<string>();
    for (let i = 0; i < 10_000; i++) ids.add(takeId(new Uint32Array(4).map(() => Math.floor(rand() * 2 ** 32))));
    expect(ids.size).toBe(10_000);
  }, LONG);
});

describe("runOf", () => {
  const run = goodRun();
  it("starts from {} for a string, array or null", () => {
    ["x", [1, 2], null, undefined, 4].forEach((s) => expect(runOf(s, run)).toEqual({ diag: run }));
  });
  it("keeps the other keys, sets diag, and removes it on undefined", () => {
    expect(runOf({ combo: 3, diag: "old" }, run)).toEqual({ combo: 3, diag: run });
    expect(runOf({ combo: 3, diag: run }, undefined)).toEqual({ combo: 3 });
    expect(Object.hasOwn(runOf({ diag: run }, undefined), "diag")).toBe(false);
    expect(runOf("x", undefined)).toEqual({});
  });
  it("does not mutate its input or set a prototype from __proto__", () => {
    const stored = JSON.parse('{"combo":1,"__proto__":{"p":1}}');
    const out = runOf(stored, run);
    expect(stored).not.toHaveProperty("diag");
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect((out as any).p).toBeUndefined();
  });
});
