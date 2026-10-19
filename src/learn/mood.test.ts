import { describe, expect, it } from "vitest";
import {
  EMPTY_MEMORY, EMPTY_THROTTLE, POSES, QUIET_AFTER_VERDICT_MS, SAY_GAP_MS,
  arrival, canSay, daysBetween, introLine, noteVerdict, react, said,
  type MoodInput, type MoodMemory, type Recent
} from "./mood.ts";

const base: MoodInput = { day: "2026-10-19", lastActiveDay: "2026-10-19", todayXp: 0, goal: 50, due: null, comboMax: 5, formName: "Pip", calm: false };
const inp = (x?: Partial<MoodInput>): MoodInput => Object.assign({}, base, x || {});
const go = (r: Recent, x?: Partial<MoodInput>, m: MoodMemory = EMPTY_MEMORY) => react(m, r, inp(x));
const rx = (r: Recent, x?: Partial<MoodInput>) => go(r, x).reaction;
const R = (mood: string, pose: string, line: string | null, key: string | null) => ({ mood, pose, line, key, href: null });

describe("arrival", () => {
  it("calm is content with no line, even when a review is due", () => {
    const due = { ref: "ch01#a", title: "Addition", href: "x.html" };
    expect(arrival(inp({ calm: true, due }))).toEqual(R("content", "rest", null, null));
  });
  it("a due review waits, with the link", () => {
    const due = { ref: "ch01#a", title: "Addition", href: "x.html#a" };
    expect(arrival(inp({ due }))).toEqual({ mood: "waiting", pose: "waiting", line: "I'd like to look at Addition again.", key: "due", href: "x.html#a" });
  });
  it("sleepy at exactly 3 days, not at 2", () => {
    expect(arrival(inp({ lastActiveDay: "2026-10-16" }))).toEqual(R("sleepy", "sleepy", "Good to see you.", "back"));
    expect(arrival(inp({ lastActiveDay: "2026-10-17" }))).toEqual(R("content", "rest", null, null));
  });
  it("a due review wins over sleepy", () => {
    const due = { ref: "r", title: "T", href: "h" };
    expect(arrival(inp({ due, lastActiveDay: "2026-09-01" })).key).toBe("due");
  });
  it("a new learner is content with no line", () => {
    expect(arrival(inp({ lastActiveDay: null }))).toEqual(R("content", "rest", null, null));
  });
  it("a malformed lastActiveDay gives no line", () => {
    for (const d of ["", "garbage", "2026-13-45x"]) expect(arrival(inp({ lastActiveDay: d })).line).toBeNull();
  });
  it("otherwise content", () => {
    expect(arrival(inp())).toEqual(R("content", "rest", null, null));
  });
});

describe("react", () => {
  it("first-try correct", () => {
    expect(rx({ type: "attempt", key: "k", correct: true, tryNo: 1 })).toEqual(R("delighted", "delighted", "First try.", "first-try"));
  });
  it("later correct is quiet", () => {
    expect(rx({ type: "attempt", key: "k", correct: true, tryNo: 2 })).toEqual(R("content", "rest", null, null));
  });
  it("wrong: the line comes on the second miss only, keys count apart", () => {
    const wrong = (key: string): Recent => ({ type: "attempt", key, correct: false, tryNo: 1 });
    const a = go(wrong("k"));
    expect(a.reaction).toEqual(R("curious", "curious", null, null));
    const b = go(wrong("k"), {}, a.memory);
    expect(b.reaction).toEqual(R("curious", "curious", "Let's look again.", "again"));
    const c = go(wrong("k"), {}, b.memory);
    expect(c.reaction).toEqual(R("curious", "curious", null, null));
    const d = go(wrong("other"), {}, c.memory);
    expect(d.reaction?.line).toBeNull();
    expect(d.memory.misses).toEqual({ k: 3, other: 1 });
  });
  it("does not mutate the memory", () => {
    const m: MoodMemory = Object.freeze({ misses: Object.freeze({ k: 1 }) });
    const out = go({ type: "attempt", key: "k", correct: false, tryNo: 2 }, {}, m);
    expect(m.misses).toEqual({ k: 1 });
    expect(out.memory).not.toBe(m);
    expect(out.memory.misses).toEqual({ k: 2 });
    expect(EMPTY_MEMORY.misses).toEqual({});
  });
  it("keys like constructor and __proto__ count like any other", () => {
    for (const key of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const wrong: Recent = { type: "attempt", key, correct: false, tryNo: 1 };
      const a = go(wrong);
      expect(a.reaction?.line).toBeNull();
      expect(Object.hasOwn(a.memory.misses, key)).toBe(true);
      expect(a.memory.misses[key]).toBe(1);
      const b = go(wrong, {}, a.memory);
      expect(b.reaction).toEqual(R("curious", "curious", "Let's look again.", "again"));
      expect(b.memory.misses[key]).toBe(2);
    }
  });
  it("an empty-string key counts like any other", () => {
    const wrong: Recent = { type: "attempt", key: "", correct: false, tryNo: 1 };
    const a = go(wrong);
    const b = go(wrong, {}, a.memory);
    expect(b.reaction?.key).toBe("again");
  });
  it("tryNo 0 or missing is not a first try", () => {
    expect(rx({ type: "attempt", key: "k", correct: true, tryNo: 0 })).toEqual(R("content", "rest", null, null));
    expect(rx({ type: "attempt", key: "k", correct: true } as unknown as Recent)).toEqual(R("content", "rest", null, null));
  });
  it("a varied comboMax moves the pip threshold", () => {
    expect(rx({ type: "combo", pips: 3, why: "hit" }, { comboMax: 3 })).toEqual(R("delighted", "delighted", null, null));
    expect(rx({ type: "combo", pips: 5, why: "hit" }, { comboMax: 8 })).toBeNull();
  });
  it("an unfresh ward is quiet", () => {
    expect(rx({ type: "encounter", cue: "ward", hearts: 3, fresh: false })).toBeNull();
  });
  it("calm silences combo and encounter", () => {
    expect(rx({ type: "combo", pips: 5, why: "max" }, { calm: true })).toBeNull();
    expect(rx({ type: "encounter", cue: "down", hearts: 3, fresh: true }, { calm: true })).toBeNull();
  });
  it("every reaction's pose is in POSES", () => {
    const all: Recent[] = [
      { type: "attempt", key: "k", correct: true, tryNo: 1 }, { type: "attempt", key: "k", correct: true, tryNo: 2 },
      { type: "attempt", key: "k", correct: false, tryNo: 1 }, { type: "solved", fresh: true },
      { type: "opened" }, { type: "ladder" }, { type: "twin" }, { type: "xp", goalMet: true },
      { type: "combo", pips: 5, why: "max" }, { type: "encounter", cue: "down", hearts: 1, fresh: true },
      { type: "encounter", cue: "ward", hearts: 1, fresh: true }, { type: "encounter", cue: "heart", hearts: 1, fresh: true },
      { type: "encounter", cue: "x", hearts: 0, fresh: true }, { type: "chapterDone", fresh: true },
      { type: "level", level: 2 }, { type: "achievement", title: "t" }, { type: "form", from: "A", to: "B" }
    ];
    for (const r of all) expect(POSES).toContain(rx(r)?.pose);
    const due = { ref: "r", title: "T", href: "h" };
    for (const a of [arrival(inp()), arrival(inp({ due })), arrival(inp({ lastActiveDay: "2026-01-01" }))]) expect(POSES).toContain(a.pose);
  });
  it("solved", () => {
    expect(rx({ type: "solved", fresh: true })).toEqual(R("content", "rest", null, null));
    expect(rx({ type: "solved", fresh: false })).toBeNull();
  });
  it("opened, ladder, twin are curious", () => {
    for (const t of ["opened", "ladder", "twin"] as const) expect(rx({ type: t })).toEqual(R("curious", "curious", null, null));
  });
  it("xp", () => {
    expect(rx({ type: "xp", goalMet: true })).toEqual(R("delighted", "delighted", "That's today's goal.", "goal"));
    expect(rx({ type: "xp", goalMet: false })).toBeNull();
  });
  it("combo", () => {
    expect(rx({ type: "combo", pips: 1, why: "max" })).toEqual(R("delighted", "delighted", null, null));
    expect(rx({ type: "combo", pips: 5, why: "hit" })).toEqual(R("delighted", "delighted", null, null));
    expect(rx({ type: "combo", pips: 4, why: "hit" })).toBeNull();
  });
  it("encounter", () => {
    const e = (cue: string, hearts: number, fresh = true): Recent => ({ type: "encounter", cue, hearts, fresh });
    expect(rx(e("down", 3, false))).toBeNull();
    expect(rx(e("down", 3))).toEqual(R("delighted", "delighted", "Boss down.", "boss"));
    expect(rx(e("ward", 3))).toEqual(R("delighted", "delighted", null, null));
    expect(rx(e("heart", 0))).toEqual(R("steady", "steady", null, null));
    expect(rx(e("other", 0))).toEqual(R("steady", "steady", "Take a breath. The section is just above.", "regroup"));
    expect(rx(e("other", 2))).toBeNull();
  });
  it("chapterDone", () => {
    expect(rx({ type: "chapterDone", fresh: true })).toEqual(R("delighted", "delighted", "Chapter done!", "chapter"));
    expect(rx({ type: "chapterDone", fresh: false })).toBeNull();
  });
  it("level, achievement, form", () => {
    expect(rx({ type: "level", level: 7 })).toEqual(R("delighted", "delighted", "Level 7.", "level"));
    expect(rx({ type: "achievement", title: "Big" })).toEqual(R("delighted", "delighted", null, null));
    expect(rx({ type: "form", from: "Pip", to: "Sprig" })).toEqual(R("delighted", "delighted", "Pip became Sprig!", "form"));
  });
  it("calm is always null and keeps the memory", () => {
    const m: MoodMemory = { misses: { k: 1 } };
    const out = go({ type: "attempt", key: "k", correct: false, tryNo: 1 }, { calm: true }, m);
    expect(out.reaction).toBeNull();
    expect(out.memory).toBe(m);
    expect(rx({ type: "level", level: 2 }, { calm: true })).toBeNull();
  });
  it("no caption mentions the streak", () => {
    const due = { ref: "r", title: "T", href: "h" };
    const lines: (string | null)[] = [
      arrival(inp({ due })).line, arrival(inp({ lastActiveDay: "2026-01-01" })).line, introLine("Pip"),
      rx({ type: "attempt", key: "k", correct: true, tryNo: 1 })?.line ?? null,
      rx({ type: "xp", goalMet: true })?.line ?? null,
      rx({ type: "encounter", cue: "down", hearts: 1, fresh: true })?.line ?? null,
      rx({ type: "encounter", cue: "x", hearts: 0, fresh: true })?.line ?? null,
      rx({ type: "chapterDone", fresh: true })?.line ?? null,
      rx({ type: "level", level: 3 })?.line ?? null,
      rx({ type: "form", from: "A", to: "B" })?.line ?? null,
      go({ type: "attempt", key: "k", correct: false, tryNo: 1 }, {}, { misses: { k: 1 } }).reaction?.line ?? null
    ];
    for (const l of lines) if (l) expect(l.toLowerCase()).not.toContain("streak");
  });
});

describe("daysBetween", () => {
  it("counts whole days", () => {
    expect(daysBetween("2026-10-16", "2026-10-19")).toBe(3);
    expect(daysBetween("2026-01-30", "2026-02-02")).toBe(3);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetween("2026-10-19", "2026-10-19")).toBe(0);
  });
});

describe("throttle", () => {
  it("allows the first caption", () => {
    expect(canSay(EMPTY_THROTTLE, 1000)).toBe(true);
  });
  it("holds the gap between captions", () => {
    const t = said(EMPTY_THROTTLE, 10000);
    expect(canSay(t, 10000 + SAY_GAP_MS - 1)).toBe(false);
    expect(canSay(t, 10000 + SAY_GAP_MS)).toBe(true);
    expect(EMPTY_THROTTLE.lastSaid).toBe(0);
  });
  it("a clock that went backwards is allowed", () => {
    expect(canSay(said(EMPTY_THROTTLE, 10000), 5000)).toBe(true);
    expect(canSay(noteVerdict(EMPTY_THROTTLE, 10000), 5000)).toBe(true);
  });
  it("is quiet after a verdict", () => {
    const t = noteVerdict(EMPTY_THROTTLE, 10000);
    expect(canSay(t, 10000 + QUIET_AFTER_VERDICT_MS - 1)).toBe(false);
    expect(canSay(t, 10000 + QUIET_AFTER_VERDICT_MS)).toBe(true);
    expect(t).toEqual({ lastSaid: 0, lastVerdict: 10000 });
    expect(said(t, 20000)).toEqual({ lastSaid: 20000, lastVerdict: 10000 });
  });
});

describe("constants and intro", () => {
  it("POSES are six distinct, in order", () => {
    expect([...POSES]).toEqual(["rest", "curious", "delighted", "steady", "sleepy", "waiting"]);
    expect(new Set(POSES).size).toBe(6);
  });
  it("introLine", () => {
    expect(introLine("Pip")).toBe("This is Pip, your form. It keeps you company while you work.");
  });
});
