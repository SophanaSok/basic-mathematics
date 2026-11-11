/* The connector's exercise tools against the real index (every exercise on the pages) and a
   small hand-written one (each verdict and error). */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { alternatives, judge, matches, specOf } from "../core/grade.ts";
import { OWNER } from "../core/answer/check.ts";
import { formMessage, unreadMessage } from "../core/answer/messages.ts";
import { detect } from "../learn/detectors.ts";
import { leaks, type LeakExercise, type Matches } from "../learn/leak.ts";
import { buildPlaces, checkAnswer, getClue, getExercise, listExercises } from "./tools.ts";
import { handle, needs, type Context } from "./protocol.ts";
import type { Curriculum } from "../core/curriculum.ts";
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

/* The page's own grading, transcribed line by line from assets/site.js read(), judge(),
   question() and the verdict's wording (lines 1305-1393), so a regression in tools.ts that
   still passes the key itself shows up on the variants below. Kept literal on purpose. */
function page(e: ExerciseEntry, given: string | string[]): Record<string, unknown> {
  const kind = e.kind, type = e.type, tol = e.tol, answers = alternatives(e.answer);
  const blanks = e.blanks.map((b) => ({ a: b.answer || "", t: b.type, ok: "", form: false }));
  const on = (keys: string[], cmp: string) => (c: string) => keys.some((a) => matches(c, a, cmp, tol));
  // read(): what is empty is said before anything is judged
  if (kind === "blank") { if ((given as string[]).some((v, j) => j < blanks.length && String(v).trim() === "") || (given as string[]).length < blanks.length) return { verdict: "unread", message: "Fill in every blank, then press Check." }; }
  else if (String(given).trim() === "") return { verdict: "unread", message: kind === "multi" ? "Choose every option that applies first." : kind === "choice" ? "Choose one of the options first." : "Type an answer, then press Check." };
  let v: Record<string, unknown>;
  if (kind === "blank") {
    const g = given as string[];
    const vs = blanks.map((b, j) => judge(g[j], specOf({ answer: b.a, type: b.t, tol })));
    let card: Record<string, unknown> = { kind: "right" };
    for (let u = 0; u < vs.length; u++) if (vs[u].kind === "unread") { card = { ...vs[u], blank: u }; break; }
    if (card.kind === "right") blanks.forEach((b, j) => {
      const x = vs[j]; b.ok = x.kind === "right" ? "true" : "false"; b.form = x.kind === "form";
      if ((x.kind === "wrong" && card.kind !== "wrong") || (x.kind === "form" && card.kind === "right")) card = { ...x, blank: j };
    });
    v = card;
  } else {
    const cmp = kind === "choice" ? "number" : kind === "multi" ? "set" : type;
    v = { ...judge(given, specOf({ answer: e.answer, type: cmp, tol })) };
  }
  const out: Record<string, unknown> = { verdict: v.kind, message: v.kind === "unread" ? unreadMessage(v.reason as never, OWNER.q4) : v.kind === "form" ? formMessage(v.reason as never, v.read as string) : null };
  if (kind === "blank" && v.kind !== "right") out.blank = v.blank;
  if (v.kind === "wrong") {
    let q = null;
    if (kind === "text") q = detect({ given: given as string, kind: "text", type, answers, grade: on(answers, type) });
    else if (kind === "multi") q = detect({ given: given as string, kind: "multi", type: "multi", answers, grade: on(answers, "set") });
    else if (kind === "blank") for (let j = 0; j < blanks.length && !q; j++) {
      if (blanks[j].ok !== "false" || blanks[j].form) continue;
      const keys = alternatives(blanks[j].a), bt = blanks[j].t;
      q = detect({ given: (given as string[])[j], kind: "text", type: bt, answers: keys, grade: on(keys, bt) });
    }
    if (q) out.question = q.question;
  }
  return out;
}

/* answers near a key: its alternatives, each padded, signed, doubled, rounded, reversed, and some fixed junk */
function variants(key: string): string[] {
  const s = new Set<string>(["", " ", "zzz", "0", "1", "-1", "2", "1/2", "0.5", "x", "1,2", "3,1", "2,1"]);
  for (const a of alternatives(key)) {
    s.add(a); s.add(" " + a + " "); s.add("0" + a); s.add("-" + a); s.add(a.replace(/^[-−]/, "")); s.add(a + "0"); s.add(a + ".0");
    s.add(a.split(",").reverse().join(",")); s.add(a.split("/").reverse().join("/")); s.add(a.replace(/(\d)/, "$1$1"));
    const n = Number(a.replace("−", "-"));
    if (isFinite(n)) { s.add(String(n * 2)); s.add(String(n / 10)); s.add(n.toFixed(3)); s.add(String(-n)); }
    if (/^\d+\/\d+$/.test(a)) { const [p, q] = a.split("/"); s.add(+p * 2 + "/" + +q * 2); s.add((+p / +q).toFixed(2)); }
  }
  return [...s].filter((x) => x.length <= 200);
}
/* the inputs tried on one entry: for blanks, 40 mixed combinations and the last alternatives */
function inputs(e: ExerciseEntry): (string | string[])[] {
  if (e.kind !== "blank") return variants(e.answer);
  const per = e.blanks.map((b) => variants(b.answer).slice(0, 12));
  const out: string[][] = [];
  for (let i = 0; i < 40; i++) out.push(per.map((vs, j) => vs[(i * (j + 3) + j) % vs.length]));
  out.push(e.blanks.map((b) => alternatives(b.answer).slice(-1)[0]));
  return out;
}
const strip = (r: unknown): Record<string, unknown> => { const { ref: _ref, ...rest } = r as { ref?: string }; return rest; };

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
      const l = leaks(JSON.stringify(strip(r)), leakEx(e), lint);
      if (l.length) bad.push(e.ref + " leaks " + JSON.stringify(l));
    });
    expect(bad).toEqual([]);
  });
  it("grades every variant answer exactly as the page does, and no wrong or right result holds an accepted answer", () => {
    const diffs: string[] = [], leaked: string[] = [];
    let n = 0;
    gradable.forEach((e) => {
      const ex = leakEx(e);
      inputs(e).forEach((g) => {
        n++;
        const got = strip(checkAnswer(INDEX, e.ref, g)), want = page(e, g);
        if (JSON.stringify(got) !== JSON.stringify(want)) diffs.push(e.ref + " " + JSON.stringify(g) + " tool=" + JSON.stringify(got) + " page=" + JSON.stringify(want));
        // form and unread wording is the page's fixed text (form names the accepted form of a value the learner
        // already gave; unread gives examples like 0.5); wrong and right results are the ones whose content varies
        if ((got.verdict === "wrong" || got.verdict === "right") && leaks(JSON.stringify(got), ex, lint).length) leaked.push(e.ref + " " + JSON.stringify(g) + " " + JSON.stringify(got));
      });
    });
    expect(n).toBeGreaterThan(15000);
    expect(diffs).toEqual([]);
    expect(leaked).toEqual([]);
  }, 60000);
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
  entry({ ref: "chX/b2", kind: "blank", type: "blank", answer: "", question: " ___ then ___ ", blanks: [{ answer: "2/3", type: "number" }, { answer: "5", type: "number" }] }),
  entry({ ref: "chX/bt", kind: "blank", type: "blank", answer: "", question: " ___ ", tol: 0.01, blanks: [{ answer: "3.14", type: "number" }] }),
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
    // an empty blank, or one not given, is the page's "fill in every blank", said before any judging and with no blank number
    expect(checkAnswer(MINI, "chX/b", ["5"])).toEqual({ ref: "chX/b", verdict: "unread", message: "Fill in every blank, then press Check." });
    expect(checkAnswer(MINI, "chX/b", ["two", " "])).toEqual({ ref: "chX/b", verdict: "unread", message: "Fill in every blank, then press Check." });
    // a wrong blank is the card though a form blank follows it
    expect(checkAnswer(MINI, "chX/b", ["0.5", "0.667"])).toMatchObject({ verdict: "wrong", blank: 0 });
    // and a wrong blank outranks a form blank before it
    const r = checkAnswer(MINI, "chX/b2", ["0.667", "4"]) as { verdict: string; blank?: number; question?: string };
    expect(r).toMatchObject({ verdict: "wrong", blank: 1 });
    // a form blank is right in value, so no detector is asked about it (an unreduced 4/6 is right with a note under the owner's Q3(a))
    expect(checkAnswer(MINI, "chX/b", ["5", "0.667"])).toEqual({ ref: "chX/b", verdict: "form", blank: 1, message: formMessage("rounded", "0.667") });
    expect(checkAnswer(MINI, "chX/b", ["5", "4/6"])).toEqual({ ref: "chX/b", verdict: "right", message: null });
    // a blank exercise's tolerance applies to each blank
    expect(checkAnswer(MINI, "chX/bt", ["3.141"])).toMatchObject({ verdict: "right" });
    expect(checkAnswer(MINI, "chX/bt", ["3.2"])).toMatchObject({ verdict: "wrong", blank: 0 });
  });
  it("says what the page says when nothing is given", () => {
    expect(checkAnswer(MINI, "chX/c", " ")).toEqual({ ref: "chX/c", verdict: "unread", message: "Choose one of the options first." });
    expect(checkAnswer(MINI, "chX/m", "")).toEqual({ ref: "chX/m", verdict: "unread", message: "Choose every option that applies first." });
  });
  it("never throws on odd input", () => {
    [null, {}, [], [[]], NaN, Symbol("x"), () => 1].forEach((g) => {
      MINI.forEach((e) => expect(() => checkAnswer(MINI, e.ref, g)).not.toThrow());
    });
    expect(() => checkAnswer(MINI, Symbol("r"), "1")).not.toThrow();
  });
});

/* list_exercises and the course map, over the real index and the plain curriculum (tools/build-mcp.js plain()) */
const CURRICULUM: Curriculum = JSON.parse(JSON.stringify(req("../../tools/lib/site.js").curriculum(), (k, v) => (k === "part" ? undefined : v)));
const PLACES = buildPlaces(CURRICULUM);
const CTX: Context = { course: { index: INDEX, curriculum: CURRICULUM }, today: "2026-11-09", progress: null, progressError: null };
const callTool = (name: string, args?: Record<string, unknown>): any =>
  (handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, ...(args ? { arguments: args } : {}) } }, CTX) as any).result;
const bytes = (v: unknown): number => new TextEncoder().encode(JSON.stringify(v)).length;

describe("list_exercises", () => {
  const map = callTool("get_course_map").structuredContent;
  const chapterIds: string[] = map.parts.flatMap((p: any) => p.chapters.map((c: any) => c.id));
  const sectionIds: string[] = map.parts.flatMap((p: any) => p.chapters.flatMap((c: any) => c.sections.map((s: any) => s.id)));

  it("reachability: the chapter ids of the map reach every ref in the index, and every map id is accepted", () => {
    const seen = new Set<string>();
    for (const id of chapterIds) {
      const r = callTool("list_exercises", { place: id });
      expect(r.isError).toBeUndefined();
      for (const x of r.structuredContent.exercises) seen.add(x.ref);
    }
    expect([...seen].sort()).toEqual(INDEX.map((e) => e.ref).sort());
    for (const id of sectionIds) {
      const r = callTool("list_exercises", { place: id });
      expect(r.isError, id).toBeUndefined();
      for (const x of r.structuredContent.exercises) expect(getExercise(INDEX, x.ref)).not.toHaveProperty("error");
    }
    for (const x of INDEX) expect(getExercise(INDEX, x.ref)).not.toHaveProperty("error");
  });

  it("the map holds only ids and titles for sections", () => {
    for (const p of map.parts) for (const c of p.chapters) for (const x of c.sections) expect(Object.keys(x).sort()).toEqual(["id", "title"]);
  });

  it("size budget: the map, every list and every exercise stay small", () => {
    expect(bytes(map)).toBeLessThanOrEqual(16384);
    for (const id of [...chapterIds, ...sectionIds]) expect(bytes(callTool("list_exercises", { place: id }).structuredContent), id).toBeLessThanOrEqual(8192);
    for (const e of INDEX) expect(bytes(getExercise(INDEX, e.ref)), e.ref).toBeLessThanOrEqual(8192);
  });

  it("a section lists its own entries and the entries crediting it by full ref, with full section refs", () => {
    const r = listExercises(INDEX, PLACES, "ch01#addition") as any;
    expect(r.title).toBe(CURRICULUM.parts[0].chapters[0].sections.find((s: any) => s.id === "addition")!.title);
    expect(r.exercises.length).toBeGreaterThan(0);
    for (const x of r.exercises) expect(x.section).toBe("ch01#addition");
    const credited = INDEX.filter((e) => e.section.includes("#"));
    expect(credited.length).toBeGreaterThan(0);
    const c = credited[0];
    expect((listExercises(INDEX, PLACES, c.section) as any).exercises.map((x: any) => x.ref)).toContain(c.ref);
    const w = INDEX.find((e) => e.section === "warmup")!;
    expect((listExercises(INDEX, PLACES, w.chapter) as any).exercises.find((x: any) => x.ref === w.ref).section).toBe("warmup");
  });

  it("reports onPage as get_exercise does, and never a question, answer or clue text", () => {
    for (const e of INDEX) {
      const x = (listExercises(INDEX, PLACES, e.chapter) as any).exercises.find((y: any) => y.ref === e.ref);
      expect(x.onPage).toBe((getExercise(INDEX, e.ref) as any).onPage);
      expect(x.clues).toBe(e.clues.length);
      expect(Object.keys(x).sort()).toEqual(["clues", "kind", "onPage", "ref", "section"]);
    }
  });

  it("a section place carries its summary and requires, a chapter place its blurb and sections", () => {
    const ch = CURRICULUM.parts.flatMap((p: any) => p.chapters).find((c: any) => c.blurb && c.sections.some((x: any) => x.summary && x.requires && x.requires.length))!;
    const sec = ch.sections.find((x: any) => x.summary && x.requires && x.requires.length)!;
    const s = callTool("list_exercises", { place: ch.id + "#" + sec.id }).structuredContent;
    expect(s.summary).toBe(sec.summary);
    expect(s.requires).toEqual(sec.requires);
    expect(s).not.toHaveProperty("blurb");
    const c = callTool("list_exercises", { place: ch.id }).structuredContent;
    expect(c.blurb).toBe(ch.blurb);
    expect(c.sections).toEqual(ch.sections.map((x: any) => ({ id: ch.id + "#" + x.id, title: x.title })));
    expect(c).not.toHaveProperty("summary");
  });

  it("nothing was lost from the map: every section's summary and requires come back from list_exercises", () => {
    for (const ch of CURRICULUM.parts.flatMap((p: any) => p.chapters)) {
      for (const sec of ch.sections || []) {
        const r = callTool("list_exercises", { place: ch.id + "#" + sec.id }).structuredContent;
        expect(r.summary, ch.id + "#" + sec.id).toBe(sec.summary || undefined);
        expect(r.requires, ch.id + "#" + sec.id).toEqual(sec.requires && sec.requires.length ? sec.requires : undefined);
      }
    }
  });

  it("refuses an unknown or non-string place with one fixed sentence that echoes nothing", () => {
    for (const bad of ["ch99", "CH01", "ch01#", "ch01#nope", "<script>EVIL</script>", "__proto__", "constructor", "", 5, null, ["ch01"], {}, undefined]) {
      const r = callTool("list_exercises", { place: bad });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).not.toContain("EVIL");
      expect(r.content[0].text).toBe(callTool("list_exercises", { place: "zz" }).content[0].text);
    }
    expect(callTool("list_exercises").isError).toBe(true);
  });

  it("needs a metered call, not the progress log", () => {
    expect(needs({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_exercises" } })).toBe(false);
  });
});
