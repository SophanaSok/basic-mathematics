/* The connector's exercise tools against the real index (every exercise on the pages) and a
   small hand-written one (each verdict and error). */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { alternatives, matches } from "../core/grade.ts";
import { leaks, type LeakExercise, type Matches } from "../learn/leak.ts";
import { checkAnswer, getClue, getExercise } from "./tools.ts";
import type { ExerciseEntry, ExerciseIndex } from "./types.ts";

const req = createRequire(import.meta.url);
const INDEX: ExerciseIndex = req("../../tools/lib/exercise-index.js").indexOf();
const ALLOW: { key: string; field: string; token: string; textSha256: string }[] =
  JSON.parse(readFileSync(new URL("../../tools/leak-allow.json", import.meta.url), "utf8"));

const lint: Matches = (g, a, t, tol) => matches(g, a, t, tol ?? undefined);

/* a LeakExercise as tools/check-static.js builds it */
function leakEx(e: ExerciseEntry): LeakExercise {
  let answers = alternatives(e.answer);
  let options: string[] | undefined;
  if (e.kind === "blank") answers = e.blanks.map((b) => b.answer).filter(Boolean);
  if (e.kind === "choice" || e.kind === "multi") {
    const picked = new Set<number>();
    alternatives(e.answer).forEach((alt) => alt.split(/[,;]/).forEach((s) => { if (/^\d+$/.test(s.trim())) picked.add(+s.trim()); }));
    options = e.choices.filter((_, i) => picked.has(i + 1));
  }
  return { answers, type: e.type, kind: e.kind, tol: e.tol > 0 ? e.tol : null, options, question: e.question };
}

const gradable = INDEX.filter((e) => e.kind !== "order" && e.kind !== "figure");
/* alternatives() lists the unsplit key first when it holds "|"; the first real alternative is next */
const first = (key: string): string => alternatives(key).find((a) => !a.includes("|")) ?? alternatives(key)[0];
const firstAnswer = (e: ExerciseEntry): string | string[] =>
  e.kind === "blank" ? e.blanks.map((b) => first(b.answer)) : first(e.answer);
const junk = (e: ExerciseEntry): string | string[] => (e.kind === "blank" ? e.blanks.map(() => "zzz") : "zzz");

/* refs whose first alternative the grader does not call right (none today) */
const PARITY_EXCEPTIONS: string[] = [];

describe("the real index", () => {
  it("has the gradable exercises", () => {
    expect(gradable.length).toBe(704);
  });
  it("is graded right by each key's first alternative", () => {
    const bad = gradable.filter((e) => (checkAnswer(INDEX, e.ref, firstAnswer(e)) as { verdict?: string }).verdict !== "right").map((e) => e.ref);
    expect(bad).toEqual(PARITY_EXCEPTIONS);
  });
  it("does not accept junk, and the result never holds an accepted answer", () => {
    const bad: string[] = [];
    gradable.forEach((e) => {
      const r = checkAnswer(INDEX, e.ref, junk(e));
      if ((r as { verdict?: string }).verdict === "right") bad.push(e.ref + " right");
      // the ref (ch02/t3) is the caller's own input, not help text, so it is left out of the sweep
      const { ref: _ref, ...rest } = r as { ref?: string };
      const l = leaks(JSON.stringify(rest), leakEx(e), lint);
      if (l.length) bad.push(e.ref + " leaks " + JSON.stringify(l));
    });
    expect(bad).toEqual([]);
  });
  it("get_exercise has only the documented keys", () => {
    const allowed = new Set(["ref", "chapter", "section", "kind", "question", "choices", "blanks", "clues", "visual", "onPage"]);
    const bad: string[] = [];
    INDEX.forEach((e) => {
      const r = getExercise(INDEX, e.ref) as unknown as Record<string, unknown>;
      const extra = Object.keys(r).filter((k) => !allowed.has(k));
      if (extra.length) bad.push(e.ref + " " + extra.join());
      if (e.kind === "blank" && r.blanks !== e.blanks.length) bad.push(e.ref + " blanks");
      if (e.kind !== "blank" && "blanks" in r) bad.push(e.ref + " blanks present");
      if ((e.kind === "choice" || e.kind === "multi") && !e.visual && JSON.stringify(r.choices) !== JSON.stringify(e.choices)) bad.push(e.ref + " choices");
    });
    expect(bad).toEqual([]);
  });
  it("no rung-1 clue gives the answer away, bar the allowances", () => {
    const sha = (s: string) => createHash("sha256").update(s).digest("hex");
    const bad: string[] = [];
    INDEX.forEach((e) => {
      if (!e.clues.length) return;
      const raw = e.clues[0];
      const hits = leaks(raw, leakEx(e), lint).filter((l) =>
        !ALLOW.some((a) => a.key === e.key && a.field === "data-hint" && a.token === l.token && a.textSha256 === sha(raw)));
      if (hits.length) bad.push(e.ref + " " + JSON.stringify(hits.map((h) => h.token)));
      const c = getClue(INDEX, e.ref, 1) as { clue?: string };
      if (typeof c.clue !== "string" || /<[^>]*>/.test(c.clue)) bad.push(e.ref + " clue not plain");
    });
    expect(bad).toEqual([]);
  });
});

function entry(p: Partial<ExerciseEntry> & { ref: string }): ExerciseEntry {
  return {
    chapter: "chX", key: p.ref.split("/")[1], section: "s", inline: false, kind: "text", type: "number", question: "Q?",
    choices: [], blanks: [], items: [], answer: "1", compare: null, tol: 0, clues: [], visual: false, line: 1, ...p
  };
}

const MINI: ExerciseIndex = [
  entry({ ref: "chX/t", answer: "−3", question: "Find it.", clues: ["Think <b>sign</b> &amp; size.", "second", "third"] }),
  entry({ ref: "chX/c", kind: "choice", type: "exact", answer: "2", choices: ["a", "b", "c"] }),
  entry({ ref: "chX/m", kind: "multi", type: "multi", answer: "1,3", choices: ["a", "b", "c"] }),
  entry({ ref: "chX/b", kind: "blank", type: "blank", answer: "", question: " ___ and ___ ", blanks: [{ answer: "5", type: "number" }, { answer: "2/3", type: "number" }] }),
  entry({ ref: "chX/o", kind: "order", type: "order", answer: "0,1,2", items: ["x", "y", "z"] }),
  entry({ ref: "chX/f", kind: "figure", type: "figure", answer: "secret", compare: "exact", visual: true }),
  entry({ ref: "chX/v", answer: "7", visual: true, question: "see the picture" })
];

describe("getExercise", () => {
  it("says unknown for an unknown ref and nothing more", () => {
    expect(getExercise(MINI, "nope/x")).toEqual({ error: "unknown" });
    expect(getExercise(MINI, 5)).toEqual({ error: "unknown" });
  });
  it("hands out a typed exercise without its key", () => {
    expect(getExercise(MINI, "chX/t")).toEqual({ ref: "chX/t", chapter: "chX", section: "s", kind: "text", question: "Find it.", clues: 3, visual: false, onPage: false });
  });
  it("lists choices in page order and counts blanks", () => {
    expect(getExercise(MINI, "chX/c")).toMatchObject({ choices: ["a", "b", "c"] });
    expect(getExercise(MINI, "chX/b")).toMatchObject({ blanks: 2 });
  });
  it("sends order, figure and visual exercises to the page", () => {
    ["chX/o", "chX/f", "chX/v"].forEach((r) => {
      const x = getExercise(MINI, r) as unknown as Record<string, unknown>;
      expect(x).toMatchObject({ visual: true, onPage: true, clues: 0 });
      expect(x.question).toBeTypeOf("string");
      expect(JSON.stringify(x)).not.toMatch(/secret|"items"|"answer"/);
    });
  });
});

describe("getClue", () => {
  it("answers each rung as plain text", () => {
    expect(getClue(MINI, "chX/t", 1)).toEqual({ ref: "chX/t", rung: 1, clues: 3, clue: "Think sign & size." });
    expect(getClue(MINI, "chX/t", 3)).toMatchObject({ clue: "third" });
  });
  it("errors", () => {
    expect(getClue(MINI, "zz/zz", 1)).toEqual({ error: "unknown" });
    [0, 4, 1.5, "1", null, NaN].forEach((r) => expect(getClue(MINI, "chX/t", r)).toEqual({ error: "no-clue", clues: 3 }));
    expect(getClue(MINI, "chX/c", 1)).toEqual({ error: "no-clue", clues: 0 });
  });
});

describe("checkAnswer", () => {
  it("errors on an unknown ref and on bad input", () => {
    expect(checkAnswer(MINI, "zz/zz", "1")).toEqual({ error: "unknown" });
    expect(checkAnswer(MINI, "chX/t", "1".repeat(201))).toEqual({ error: "bad-answer" });
    expect(checkAnswer(MINI, "chX/t", 5)).toEqual({ error: "bad-answer" });
    expect(checkAnswer(MINI, "chX/t", ["1"])).toEqual({ error: "bad-answer" });
    expect(checkAnswer(MINI, "chX/b", "5")).toEqual({ error: "bad-answer" });
    expect(checkAnswer(MINI, "chX/b", Array(9).fill("1"))).toEqual({ error: "bad-answer" });
    expect(checkAnswer(MINI, "chX/b", ["5", 2])).toEqual({ error: "bad-answer" });
    expect(checkAnswer(MINI, "chX/b", ["5", "1".repeat(201)])).toEqual({ error: "bad-answer" });
    expect(checkAnswer(MINI, "chX/t", undefined)).toEqual({ error: "bad-answer" });
  });
  it("does not grade order and figure exercises", () => {
    expect(checkAnswer(MINI, "chX/o", "0,1,2")).toEqual({ ref: "chX/o", onPage: true });
    expect(checkAnswer(MINI, "chX/f", "secret")).toEqual({ ref: "chX/f", onPage: true });
  });
  it("grades a choice by its 1-based number", () => {
    expect(checkAnswer(MINI, "chX/c", "2")).toEqual({ ref: "chX/c", verdict: "right", message: null });
    expect(checkAnswer(MINI, "chX/c", "1")).toEqual({ ref: "chX/c", verdict: "wrong", message: null });
  });
  it("grades a multi", () => {
    expect(checkAnswer(MINI, "chX/m", "1,3")).toMatchObject({ verdict: "right" });
    expect(checkAnswer(MINI, "chX/m", "3,1")).toMatchObject({ verdict: "right" });
    expect(checkAnswer(MINI, "chX/m", "1")).toMatchObject({ verdict: "wrong" });
  });
  it("asks the detector's question about a typed wrong answer, and only then", () => {
    const r = checkAnswer(MINI, "chX/t", "3") as { question?: string; verdict: string };
    expect(r.verdict).toBe("wrong");
    expect(r.question).toMatch(/sign/i);
    expect(checkAnswer(MINI, "chX/t", "100")).toEqual({ ref: "chX/t", verdict: "wrong", message: null });
    expect(checkAnswer(MINI, "chX/t", "−3")).toEqual({ ref: "chX/t", verdict: "right", message: null });
  });
  it("tells an unread typed answer how to retype it", () => {
    expect(checkAnswer(MINI, "chX/t", "")).toEqual({ ref: "chX/t", verdict: "unread", message: "Type an answer, then press Check." });
  });
  it("grades blanks as the page does", () => {
    expect(checkAnswer(MINI, "chX/b", ["5", "2/3"])).toEqual({ ref: "chX/b", verdict: "right", message: null });
    expect(checkAnswer(MINI, "chX/b", ["4", "2/3"])).toMatchObject({ verdict: "wrong", blank: 0 });
    expect(checkAnswer(MINI, "chX/b", ["5", "1"])).toMatchObject({ verdict: "wrong", blank: 1 });
    expect(checkAnswer(MINI, "chX/b", ["5", "0.667"])).toMatchObject({ verdict: "form", blank: 1, message: "That is rounded. Give the exact value." });
    expect(checkAnswer(MINI, "chX/b", ["5", "two"])).toMatchObject({ verdict: "unread", blank: 1 });
    expect(checkAnswer(MINI, "chX/b", ["5"])).toMatchObject({ verdict: "unread", blank: 1, message: "Type an answer, then press Check." });
    // a wrong blank outranks a form blank before it
    expect(checkAnswer(MINI, "chX/b", ["0.5", "0.667"])).toMatchObject({ verdict: "wrong", blank: 0 });
  });
  it("never throws on odd input", () => {
    [null, {}, [], [[]], NaN, Symbol("x"), () => 1].forEach((g) => {
      MINI.forEach((e) => expect(() => checkAnswer(MINI, e.ref, g)).not.toThrow());
    });
    expect(() => checkAnswer(MINI, Symbol("r"), "1")).not.toThrow();
  });
});
