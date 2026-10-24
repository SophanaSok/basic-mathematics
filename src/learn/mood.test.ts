import { describe, expect, it } from "vitest";
import {
  EMPTY_MEMORY, EMPTY_THROTTLE, FAST_MS, HOLD_MS, LONG_HOLD_MS, MOODS, QUIET_AFTER_VERDICT_MS, REST, SAD_MS, SAY_GAP_MS,
  SHORT_MS, SLEEPY_AFTER_MS, SLEEP_AFTER_MS, SURPRISE_MS, THINK_AFTER_MS,
  arrival, canSay, daysBetween, idleMood, introLine, lowArrival, LOW_LINES, nextIdleAt, noteVerdict, react, said, wake,
  type Mood, type MoodInput, type MoodMemory, type Recent
} from "./mood.ts";

const base: MoodInput = { day: "2026-10-19", lastActiveDay: "2026-10-19", todayXp: 0, goal: 50, due: null, comboMax: 5, calm: false };
const inp = (x?: Partial<MoodInput>): MoodInput => Object.assign({}, base, x || {});
const go = (r: Recent, x?: Partial<MoodInput>, m: MoodMemory = EMPTY_MEMORY) => react(m, r, inp(x));
const rx = (r: Recent, x?: Partial<MoodInput>) => go(r, x).reaction;
/* a reaction as steps [mood, ms] pairs */
const R = (steps: [Mood, number][], line: string | null, key: string | null) =>
  ({ steps: steps.map(([mood, ms]) => ({ mood, ms })), line, key, href: null });
const att = (key: string, correct: boolean, tryNo = 1, elapsedMs: number | null = null): Recent => ({ type: "attempt", key, correct, tryNo, elapsedMs });
const enc = (cue: string, hearts: number, fresh = true, set = "s1", state = "idle"): Recent => ({ type: "encounter", cue, hearts, fresh, set, state });
const mem = (x: Partial<MoodMemory> = {}): MoodMemory => ({ misses: {}, nudged: {}, run: 0, bosses: {}, ...x });
const RESTR = R([["idle", 0]], null, null);

describe("arrival", () => {
  it("calm is rest with no line, even when a review is due", () => {
    const due = { ref: "ch01#a", title: "Addition", href: "x.html" };
    expect(arrival(inp({ calm: true, due }))).toEqual(RESTR);
  });
  it("a due review waits, thinking, with the link", () => {
    const due = { ref: "ch01#a", title: "Addition", href: "x.html#a" };
    expect(arrival(inp({ due }))).toEqual({ steps: [{ mood: "thinking", ms: LONG_HOLD_MS }], line: "I'd like to look at Addition again.", key: "due", href: "x.html#a" });
  });
  it("sleepy at exactly 3 days, not at 2", () => {
    expect(arrival(inp({ lastActiveDay: "2026-10-16" }))).toEqual(R([["sleepy", LONG_HOLD_MS]], "Good to see you.", "back"));
    expect(arrival(inp({ lastActiveDay: "2026-10-17" }))).toEqual(RESTR);
  });
  it("a due review wins over sleepy", () => {
    const due = { ref: "r", title: "T", href: "h" };
    expect(arrival(inp({ due, lastActiveDay: "2026-09-01" })).key).toBe("due");
  });
  it("a new learner is at rest with no line", () => {
    expect(arrival(inp({ lastActiveDay: null }))).toEqual(RESTR);
  });
  it("a malformed lastActiveDay gives no line", () => {
    for (const d of ["", "garbage", "2026-13-45x"]) expect(arrival(inp({ lastActiveDay: d })).line).toBeNull();
  });
  it("otherwise rest", () => {
    expect(arrival(inp())).toEqual(RESTR);
    expect(REST).toEqual([{ mood: "idle", ms: 0 }]);
  });
});

describe("react", () => {
  it("first try, slow or unknown time: happy", () => {
    expect(rx(att("k", true, 1))).toEqual(R([["happy", HOLD_MS]], "First try.", "first-try"));
    expect(rx(att("k", true, 1, FAST_MS))).toEqual(R([["happy", HOLD_MS]], "First try.", "first-try"));
  });
  it("first try under FAST_MS: surprised, then happy, same line", () => {
    expect(rx(att("k", true, 1, FAST_MS - 1))).toEqual(R([["surprised", SURPRISE_MS], ["happy", HOLD_MS - SURPRISE_MS]], "First try.", "first-try"));
    expect(rx(att("k", true, 1, 0))?.line).toBe("First try.");
  });
  it("later correct is happy with no line", () => {
    expect(rx(att("k", true, 2))).toEqual(R([["happy", HOLD_MS]], null, null));
  });
  it("the third correct in a row is excited; the line rules hold", () => {
    let m = EMPTY_MEMORY;
    const seen: (string | null)[] = [];
    for (let i = 0; i < 3; i++) {
      const out = go(att("k" + i, true, 1), {}, m);
      m = out.memory;
      seen.push(out.reaction!.steps[0].mood);
      expect(out.reaction!.line).toBe("First try.");
    }
    expect(seen).toEqual(["happy", "happy", "excited"]);
    expect(m.run).toBe(3);
    expect(go(att("k", true, 2), {}, m).reaction).toEqual(R([["excited", HOLD_MS]], null, null));
    const fast = go(att("z", true, 1, 100), {}, mem({ run: 2 })).reaction!;
    expect(fast.steps.map((s) => s.mood)).toEqual(["surprised", "excited"]);
  });
  it("a miss resets the run; solved leaves it", () => {
    expect(go(att("k", false), {}, mem({ run: 5 })).memory.run).toBe(0);
    expect(go(att("k", true), {}, mem({ run: 1 })).memory.run).toBe(2);
    expect(go({ type: "solved", fresh: true }, {}, mem({ run: 4 })).memory.run).toBe(4);
  });
  it("wrong: thinking, the line and a sad beat on the second miss only, keys count apart", () => {
    const a = go(att("k", false));
    expect(a.reaction).toEqual(R([["thinking", HOLD_MS]], null, null));
    const b = go(att("k", false), {}, a.memory);
    expect(b.reaction).toEqual(R([["sad", SAD_MS], ["thinking", HOLD_MS]], "Let's look again.", "again"));
    const c = go(att("k", false), {}, b.memory);
    expect(c.reaction).toEqual(R([["thinking", HOLD_MS]], null, null));
    const d = go(att("other", false), {}, c.memory);
    expect(d.reaction?.line).toBeNull();
    expect(d.memory.misses).toEqual({ k: 3, other: 1 });
  });
  it("does not mutate the memory", () => {
    const m: MoodMemory = Object.freeze({ misses: Object.freeze({ k: 1 }), nudged: Object.freeze({}), run: 0, bosses: Object.freeze({}) });
    const out = go(att("k", false, 2), {}, m);
    expect(m.misses).toEqual({ k: 1 });
    expect(out.memory).not.toBe(m);
    expect(out.memory.misses).toEqual({ k: 2 });
    expect(EMPTY_MEMORY.misses).toEqual({});
    expect(EMPTY_MEMORY.run).toBe(0);
    expect(EMPTY_MEMORY.bosses).toEqual({});
  });
  describe("stuck", () => {
    const stuck = (key: string, signal: string, offer = "clue") => ({ type: "stuck", key, signal, offer }) as Recent;
    it("says what is below, by offer, once per exercise key", () => {
      const a = go(stuck("k", "idle", "clue"));
      expect(a.reaction).toEqual(R([["thinking", LONG_HOLD_MS]], "There's a clue below.", "stuck"));
      expect(a.memory.nudged).toEqual({ k: true });
      expect(go(stuck("k", "idle"), {}, a.memory).reaction).toBeNull();
      expect(go(stuck("other", "idle", "steps"), {}, a.memory).reaction?.line).toBe("The worked steps are below.");
    });
    it("makes no nudge for a solution or no offer", () => {
      for (const offer of ["solution", "none"]) {
        const r = go(stuck("k", "idle", offer));
        expect(r.reaction).toBeNull();
        expect(r.memory).toBe(EMPTY_MEMORY);
      }
    });
    it("ignores rapid, repeat and misses, and Study mode", () => {
      for (const s of ["rapid", "repeat", "misses"]) expect(go(stuck("k", s)).reaction).toBeNull();
      expect(go(stuck("k", "idle"), { calm: true }).reaction).toBeNull();
    });
    it("stays quiet after the again line", () => {
      const again = go(att("k", false, 2), {}, mem({ misses: { k: 1 } }));
      expect(again.reaction?.line).toBe("Let's look again.");
      expect(go(stuck("k", "idle"), {}, again.memory).reaction).toBeNull();
    });
    it("does not mutate the memory and keeps the misses, run and bosses", () => {
      const m: MoodMemory = Object.freeze({ misses: Object.freeze({ k: 1 }), nudged: Object.freeze({}), run: 2, bosses: Object.freeze({ s: true as const }) });
      const out = go(stuck("k", "idle"), {}, m);
      expect(m.nudged).toEqual({});
      expect(out.memory.misses).toEqual({ k: 1 });
      expect([out.memory.run, out.memory.bosses]).toEqual([2, { s: true }]);
      expect(EMPTY_MEMORY.nudged).toEqual({});
    });
    it("works for keys like __proto__", () => {
      const out = go(stuck("__proto__", "idle"));
      expect(Object.hasOwn(out.memory.nudged, "__proto__")).toBe(true);
    });
  });
  it("keys like constructor and __proto__ count like any other", () => {
    for (const key of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const a = go(att(key, false));
      expect(a.reaction?.line).toBeNull();
      expect(Object.hasOwn(a.memory.misses, key)).toBe(true);
      expect(a.memory.misses[key]).toBe(1);
      const b = go(att(key, false), {}, a.memory);
      expect(b.reaction).toEqual(R([["sad", SAD_MS], ["thinking", HOLD_MS]], "Let's look again.", "again"));
      expect(b.memory.misses[key]).toBe(2);
    }
  });
  it("an empty-string key counts like any other", () => {
    const a = go(att("", false));
    const b = go(att("", false), {}, a.memory);
    expect(b.reaction?.key).toBe("again");
  });
  it("tryNo 0 or missing is not a first try", () => {
    expect(rx(att("k", true, 0))).toEqual(R([["happy", HOLD_MS]], null, null));
    expect(rx({ type: "attempt", key: "k", correct: true } as unknown as Recent)).toEqual(R([["happy", HOLD_MS]], null, null));
  });
  it("a varied comboMax moves the pip threshold", () => {
    expect(rx({ type: "combo", pips: 3, why: "hit" }, { comboMax: 3 })).toEqual(R([["excited", SHORT_MS]], null, null));
    expect(rx({ type: "combo", pips: 5, why: "hit" }, { comboMax: 8 })).toBeNull();
  });
  it("an unfresh ward is quiet", () => {
    expect(rx(enc("ward", 3, false))).toBeNull();
  });
  it("calm silences combo and encounter", () => {
    expect(rx({ type: "combo", pips: 5, why: "max" }, { calm: true })).toBeNull();
    expect(rx(enc("down", 3), { calm: true })).toBeNull();
  });
  it("every step's mood is in MOODS", () => {
    const all: Recent[] = [
      att("k", true, 1), att("k", true, 1, 10), att("k", true, 2), att("k", false),
      { type: "solved", fresh: true },
      { type: "opened" }, { type: "ladder" }, { type: "twin" }, { type: "xp", goalMet: true },
      { type: "combo", pips: 5, why: "max" }, enc("down", 1), enc("ward", 1), enc("heart", 1), enc("x", 0),
      enc("", 2, true, "s9", "active"), { type: "chapterDone", fresh: true },
      { type: "level", level: 2 }, { type: "achievement", title: "t" },
      { type: "arena", phase: "start" }, { type: "arena", phase: "end" }, { type: "arena", phase: "answer", correct: true }
    ];
    const due = { ref: "r", title: "T", href: "h" };
    const reactions = [
      ...all.map((r) => rx(r)), go(att("k", false), {}, mem({ misses: { k: 1 } })).reaction,
      arrival(inp()), arrival(inp({ due })), arrival(inp({ lastActiveDay: "2026-01-01" })), wake("sleeping")
    ];
    for (const r of reactions) {
      if (!r) continue;
      expect(r.steps.length).toBeGreaterThan(0);
      for (const s of r.steps) { expect(MOODS).toContain(s.mood); expect(s.ms).toBeGreaterThanOrEqual(0); }
    }
  });
  it("a keyed line holds at least as long as the old waits table said", () => {
    const hold = (r: Recent) => rx(r)!.steps.reduce((n, s) => n + s.ms, 0);
    expect(hold({ type: "chapterDone", fresh: true })).toBe(LONG_HOLD_MS);
    expect(hold({ type: "level", level: 2 })).toBe(LONG_HOLD_MS);
    expect(hold(att("k", true, 1))).toBe(HOLD_MS);
  });
  it("solved says nothing, so it cannot cut the attempt's reaction short", () => {
    expect(rx({ type: "solved", fresh: true })).toBeNull();
    expect(rx({ type: "solved", fresh: false })).toBeNull();
  });
  it("opened, ladder, twin are a short think", () => {
    for (const t of ["opened", "ladder", "twin"] as const) expect(rx({ type: t })).toEqual(R([["thinking", SHORT_MS]], null, null));
  });
  it("xp", () => {
    expect(rx({ type: "xp", goalMet: true })).toEqual(R([["happy", LONG_HOLD_MS]], "That's today's goal.", "goal"));
    expect(rx({ type: "xp", goalMet: false })).toBeNull();
  });
  it("combo", () => {
    expect(rx({ type: "combo", pips: 1, why: "max" })).toEqual(R([["excited", SHORT_MS]], null, null));
    expect(rx({ type: "combo", pips: 5, why: "hit" })).toEqual(R([["excited", SHORT_MS]], null, null));
    expect(rx({ type: "combo", pips: 4, why: "hit" })).toBeNull();
  });
  it("encounter cues", () => {
    expect(rx(enc("down", 3, false))).toBeNull();
    expect(rx(enc("down", 3))).toEqual(R([["excited", LONG_HOLD_MS]], "Boss down.", "boss"));
    expect(rx(enc("ward", 3))).toEqual(R([["happy", SHORT_MS]], null, null));
    expect(rx(enc("heart", 0))).toEqual(R([["angry", SAD_MS]], null, null));
    expect(rx(enc("other", 0))).toEqual(R([["thinking", LONG_HOLD_MS]], "Take a breath. The section is just above.", "regroup"));
    expect(rx(enc("other", 2))).toBeNull();
  });
  it("a boss start: angry once per set, never for an idle or won set, none for an unfresh event", () => {
    const a = go(enc("", 3, true, "s1", "active"));
    expect(a.reaction).toEqual(R([["angry", SURPRISE_MS]], null, null));
    expect(a.memory.bosses).toEqual({ s1: true });
    expect(go(enc("", 3, true, "s1", "active"), {}, a.memory).reaction).toBeNull();
    const b = go(enc("", 3, true, "s2", "active"), {}, a.memory);
    expect(b.reaction?.steps[0].mood).toBe("angry");
    expect(b.memory.bosses).toEqual({ s1: true, s2: true });
    expect(rx(enc("", 3, true, "s1", "idle"))).toBeNull();
    expect(rx(enc("", 3, true, "s1", "won"))).toBeNull();
    expect(rx(enc("", 3, false, "s1", "active"))).toBeNull();
    expect(EMPTY_MEMORY.bosses).toEqual({});
  });
  it("a lost heart is angry, not the learner's fault: no line", () => {
    expect(rx(enc("heart", 2))?.line).toBeNull();
  });
  it("chapterDone", () => {
    expect(rx({ type: "chapterDone", fresh: true })).toEqual(R([["excited", LONG_HOLD_MS]], "Chapter done!", "chapter"));
    expect(rx({ type: "chapterDone", fresh: false })).toBeNull();
  });
  it("level, achievement", () => {
    expect(rx({ type: "level", level: 7 })).toEqual(R([["excited", LONG_HOLD_MS]], "Level 7.", "level"));
    expect(rx({ type: "achievement", title: "Big" })).toEqual(R([["happy", SHORT_MS]], null, null));
  });
  it("calm is always null and keeps the memory", () => {
    const m = mem({ misses: { k: 1 } });
    const out = go(att("k", false), { calm: true }, m);
    expect(out.reaction).toBeNull();
    expect(out.memory).toBe(m);
    expect(rx({ type: "level", level: 2 }, { calm: true })).toBeNull();
  });
  it("no caption mentions the streak", () => {
    const due = { ref: "r", title: "T", href: "h" };
    const lines: (string | null)[] = [
      arrival(inp({ due })).line, arrival(inp({ lastActiveDay: "2026-01-01" })).line, introLine(),
      rx(att("k", true, 1))?.line ?? null,
      rx({ type: "xp", goalMet: true })?.line ?? null,
      rx(enc("down", 1))?.line ?? null,
      rx(enc("x", 0))?.line ?? null,
      rx({ type: "chapterDone", fresh: true })?.line ?? null,
      rx({ type: "level", level: 3 })?.line ?? null,
      go(att("k", false), {}, mem({ misses: { k: 1 } })).reaction?.line ?? null
    ];
    for (const l of lines) if (l) expect(l.toLowerCase()).not.toContain("streak");
  });
});

describe("idle", () => {
  it("idleMood by threshold", () => {
    expect(idleMood(0, false)).toBe("idle");
    expect(idleMood(THINK_AFTER_MS, false)).toBe("idle");
    expect(idleMood(THINK_AFTER_MS - 1, true)).toBe("idle");
    expect(idleMood(THINK_AFTER_MS, true)).toBe("thinking");
    expect(idleMood(SLEEPY_AFTER_MS - 1, true)).toBe("thinking");
    expect(idleMood(SLEEPY_AFTER_MS, false)).toBe("sleepy");
    expect(idleMood(SLEEPY_AFTER_MS, true)).toBe("sleepy");
    expect(idleMood(SLEEP_AFTER_MS - 1, false)).toBe("sleepy");
    expect(idleMood(SLEEP_AFTER_MS, false)).toBe("sleeping");
    expect(idleMood(SLEEP_AFTER_MS * 10, true)).toBe("sleeping");
  });
  it("nextIdleAt is the ms to the next change, then null", () => {
    expect(nextIdleAt(0, false)).toBe(SLEEPY_AFTER_MS);
    expect(nextIdleAt(1000, false)).toBe(SLEEPY_AFTER_MS - 1000);
    expect(nextIdleAt(0, true)).toBe(THINK_AFTER_MS);
    expect(nextIdleAt(THINK_AFTER_MS, true)).toBe(SLEEPY_AFTER_MS - THINK_AFTER_MS);
    expect(nextIdleAt(SLEEPY_AFTER_MS, true)).toBe(SLEEP_AFTER_MS - SLEEPY_AFTER_MS);
    expect(nextIdleAt(SLEEP_AFTER_MS, false)).toBeNull();
    expect(nextIdleAt(SLEEP_AFTER_MS + 5, true)).toBeNull();
  });
  it("the answer changes exactly when nextIdleAt says", () => {
    for (const focused of [false, true]) {
      let t = 0;
      for (let n = nextIdleAt(t, focused); n !== null; n = nextIdleAt(t, focused)) {
        expect(idleMood(t + n - 1, focused)).toBe(idleMood(t, focused));
        expect(idleMood(t + n, focused)).not.toBe(idleMood(t, focused));
        t += n;
      }
    }
  });
  it("wake: surprised after a nap, nothing otherwise", () => {
    expect(wake("sleepy")).toEqual(R([["surprised", SURPRISE_MS]], null, null));
    expect(wake("sleeping")).toEqual(R([["surprised", SURPRISE_MS]], null, null));
    for (const m of MOODS) if (m !== "sleepy" && m !== "sleeping") expect(wake(m)).toBeNull();
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
  it("MOODS are nine distinct, in the sheet's order", () => {
    expect([...MOODS]).toEqual(["idle", "happy", "excited", "sad", "angry", "surprised", "thinking", "sleepy", "sleeping"]);
    expect(new Set(MOODS).size).toBe(9);
  });
  it("introLine names Mochi", () => {
    expect(introLine()).toBe("This is Mochi, your companion. It keeps you company while you work.");
  });
});

describe("arena", () => {
  it("a start is a short think, no line", () => {
    expect(rx({ type: "arena", phase: "start" })).toEqual(R([["thinking", SHORT_MS]], null, null));
  });
  it("a correct answer is happy, no line, and counts toward the run", () => {
    expect(rx({ type: "arena", phase: "answer", correct: true })).toEqual(R([["happy", SHORT_MS]], null, null));
    const third = go({ type: "arena", phase: "answer", correct: true }, {}, mem({ run: 2 }));
    expect(third.reaction?.steps[0].mood).toBe("excited");
    expect(third.memory.run).toBe(3);
  });
  it("a wrong answer, a pass and a timeout are a short think and end the run", () => {
    const w = [{ correct: false }, { correct: false, pass: true }, { correct: false, timeout: true }];
    for (const x of w) {
      const out = go({ type: "arena", phase: "answer", ...x }, {}, mem({ run: 2 }));
      expect(out.reaction).toEqual(R([["thinking", SHORT_MS]], null, null));
      expect(out.memory.run).toBe(0);
    }
  });
  it("the end is happy with 'Run done.'", () => {
    expect(rx({ type: "arena", phase: "end" })).toEqual(R([["happy", LONG_HOLD_MS]], "Run done.", "arena-end"));
  });
  it("start and end leave the memory alone and say nothing in Study mode", () => {
    for (const phase of ["start", "end"] as const) expect(go({ type: "arena", phase }).memory).toBe(EMPTY_MEMORY);
    for (const phase of ["start", "answer", "end"] as const) expect(rx({ type: "arena", phase, correct: true }, { calm: true })).toBeNull();
  });
});

describe("pet changes and low hearts", () => {
  const pet = (what: string): Recent => ({ type: "pet", what, id: "x" });
  it("earn, care and gift are a short happy with no line; grew is a long excited with no line", () => {
    for (const w of ["earn", "care", "gift"]) expect(rx(pet(w))).toEqual(R([["happy", SHORT_MS]], null, null));
    expect(rx(pet("grew"))).toEqual(R([["excited", LONG_HOLD_MS]], null, null));
  });
  it("any other pet change, and Study mode, are none", () => {
    for (const w of ["buy", "wear", "", "other"]) expect(rx(pet(w))).toBeNull();
    expect(rx(pet("earn"), { calm: true })).toBeNull();
  });
  it("idleMood shows a low need only when it would be idle; the sleep thresholds win", () => {
    expect(idleMood(0, false, "tummy")).toBe("sleepy");
    expect(idleMood(0, false, "spark")).toBe("thinking");
    expect(idleMood(0, false, null)).toBe("idle");
    expect(idleMood(0, false)).toBe("idle");
    expect(idleMood(THINK_AFTER_MS, true, "tummy")).toBe("thinking");
    expect(idleMood(SLEEPY_AFTER_MS, false, "spark")).toBe("sleepy");
    expect(idleMood(SLEEP_AFTER_MS, false, "tummy")).toBe("sleeping");
    expect(nextIdleAt(0, false)).toBe(SLEEPY_AFTER_MS);
  });
  it("the low captions are pinned, said once a day per need, and never in Study mode", () => {
    expect(LOW_LINES.tummy).toBe("Mochi could use a snack.");
    expect(LOW_LINES.spark).toBe("Mochi could use a review.");
    expect(lowArrival("tummy", "2026-10-24", {}, false)).toEqual({ steps: [{ mood: "sleepy", ms: LONG_HOLD_MS }], line: "Mochi could use a snack.", key: "low", href: null });
    expect(lowArrival("spark", "2026-10-24", {}, false)).toEqual({ steps: [{ mood: "thinking", ms: LONG_HOLD_MS }], line: "Mochi could use a review.", key: "low", href: null });
    expect(lowArrival("tummy", "2026-10-24", { tummy: "2026-10-24" }, false)).toBeNull();
    expect(lowArrival("tummy", "2026-10-25", { tummy: "2026-10-24" }, false)).not.toBeNull();
    expect(lowArrival("spark", "2026-10-24", { tummy: "2026-10-24" }, false)).not.toBeNull();
    expect(lowArrival(null, "2026-10-24", {}, false)).toBeNull();
    expect(lowArrival("tummy", "2026-10-24", {}, true)).toBeNull();
    for (const l of Object.values(LOW_LINES)) expect(l).not.toMatch(/missed|day/i);
  });
});
