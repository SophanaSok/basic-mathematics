/* What the connector's three exercise tools answer (decision 0016), given the exercise index
   (tools/lib/exercise-index.js) and a ref. The grading is the page's: the same judge, the
   same spec, the same detectors (assets/site.js initExercises), so a check here and a check
   on the page agree. Nothing is recorded: the page records a right answer.

   Every function is total: any input gives a result, never a throw. The key, the items of an
   order exercise and the blanks' answers never leave here.

   Pure: no `window`, no DOM, no storage. */

import { alternatives, judge, matches, specOf } from "../core/grade.ts";
import { OWNER } from "../core/answer/check.ts";
import { formMessage, unreadMessage } from "../core/answer/messages.ts";
import type { Verdict } from "../core/answer/types.ts";
import { detect } from "../learn/detectors.ts";
import { stripTags } from "../learn/leak.ts";
import type { CheckResult, ClueResult, ExerciseEntry, ExerciseIndex, GetExerciseResult } from "./types.ts";

export const MAX_GIVEN = 200;
export const MAX_BLANKS = 8;

function find(index: ExerciseIndex, ref: unknown): ExerciseEntry | null {
  if (typeof ref !== "string") return null;
  for (const e of index) if (e.ref === ref) return e;
  return null;
}

const onPageOnly = (e: ExerciseEntry): boolean => e.kind === "order" || e.kind === "figure";

export function getExercise(index: ExerciseIndex, ref: unknown): GetExerciseResult {
  const e = find(index, ref);
  if (!e) return { error: "unknown" };
  const base = { ref: e.ref, chapter: e.chapter, section: e.section, kind: e.kind, question: e.question };
  if (onPageOnly(e) || e.visual) return { ...base, visual: true, onPage: true, clues: e.clues.length };
  const out: GetExerciseResult = { ...base, clues: e.clues.length, visual: false, onPage: false };
  if (e.kind === "choice" || e.kind === "multi") out.choices = e.choices.slice();
  if (e.kind === "blank") out.blanks = e.blanks.length;
  return out;
}

export function getClue(index: ExerciseIndex, ref: unknown, rung: unknown): ClueResult {
  const e = find(index, ref);
  if (!e) return { error: "unknown" };
  const n = e.clues.length;
  if (typeof rung !== "number" || !Number.isInteger(rung) || rung < 1 || rung > n) return { error: "no-clue", clues: n };
  return { ref: e.ref, rung, clues: n, clue: stripTags(e.clues[rung - 1]) };
}

const tooLong = (s: unknown): boolean => typeof s !== "string" || s.length > MAX_GIVEN;

/* the browser's compare type for a one-box exercise */
function compareOf(e: ExerciseEntry): string {
  return e.kind === "choice" ? "number" : e.kind === "multi" ? "set" : e.type;
}

function messageOf(v: Verdict): string | null {
  // the browser reads Q4 from the owner's answers (BMCore.owner), as OWNER here
  if (v.kind === "unread") return unreadMessage(v.reason, OWNER.q4);
  if (v.kind === "form") return formMessage(v.reason, v.read);
  return null;
}

/* a question about a wrong answer, graded by the key's own type and tolerance (site.js question()) */
function askText(given: string, type: string, keys: string[], tol: number, kind: "text" | "multi"): string | null {
  const grade = (c: string): boolean => keys.some((a) => matches(c, a, type, tol));
  const d = detect({ given, kind, type: kind === "multi" ? "multi" : type, answers: keys, grade });
  return d ? d.question : null;
}

function checkBlanks(e: ExerciseEntry, given: readonly string[]): CheckResult {
  const vs = e.blanks.map((b, j) => judge(given[j] ?? "", specOf({ answer: b.answer, type: b.type, tol: e.tol })));
  for (let u = 0; u < vs.length; u++) {
    const v = vs[u];
    if (v.kind === "unread") return { ref: e.ref, verdict: "unread", message: messageOf(v), blank: u };
  }
  let card: { v: Verdict; j: number } | null = null;
  vs.forEach((v, j) => {
    if (v.kind === "wrong" && (!card || card.v.kind !== "wrong")) card = { v, j };
    else if (v.kind === "form" && !card) card = { v, j };
  });
  if (!card) return { ref: e.ref, verdict: "right", message: null };
  const { v, j } = card as { v: Verdict; j: number };
  const out: CheckResult = { ref: e.ref, verdict: v.kind as "form" | "wrong", message: messageOf(v), blank: j };
  if (v.kind === "wrong") {
    // the first blank that is wrong, not form, which a detector can explain
    for (let k = 0; k < vs.length; k++) {
      if (vs[k].kind !== "wrong") continue;
      const b = e.blanks[k];
      const q = askText(given[k] ?? "", b.type, alternatives(b.answer), e.tol, "text");
      if (q) { out.question = q; break; }
    }
  }
  return out;
}

export function checkAnswer(index: ExerciseIndex, ref: unknown, given: unknown): CheckResult {
  try {
    const e = find(index, ref);
    if (!e) return { error: "unknown" };
    if (onPageOnly(e)) return { ref: e.ref, onPage: true };
    if (e.kind === "blank") {
      if (!Array.isArray(given) || given.length > MAX_BLANKS || given.some(tooLong)) return { error: "bad-answer" };
      return checkBlanks(e, given as string[]);
    }
    if (tooLong(given)) return { error: "bad-answer" };
    const text = given as string;
    const v = judge(text, specOf({ answer: e.answer, type: compareOf(e), tol: e.tol }));
    const out: CheckResult = { ref: e.ref, verdict: v.kind, message: messageOf(v) };
    if (v.kind === "wrong" && (e.kind === "text" || e.kind === "multi")) {
      const q = askText(text, e.kind === "multi" ? "set" : e.type, alternatives(e.answer), e.tol, e.kind);
      if (q) out.question = q;
    }
    return out;
  } catch {
    return { error: "bad-answer" };
  }
}
