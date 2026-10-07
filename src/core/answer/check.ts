/* The typed grader's verdicts (decision 0002, docs/decisions/0002-typed-grader.md): judge()
   gives a typed answer one of four verdicts against its key, right, form, wrong or unread,
   and grade() and matches() stay the booleans the pages and tools call (true only for a
   right).

   For now judge() runs over the old grader, legacy.ts, and changes no verdict: an empty box
   is unread ("empty"), as the pages already treat it before they grade, and every other
   answer is right exactly when legacy.ts's grade() says so. The rules that read numbers,
   sets, points and expressions come later, each with its id and a switch; GRADER counts
   those revisions, and tools/gen-grade-ledger.js lists every case each one changes
   (tools/fixtures/grade-ledger.json) against the frozen baseline,
   tools/fixtures/grade-golden.json.

   judgeOff() is judge() with some rules switched off, each doing what the old grader did;
   it is for the ledger tool and the tests, and never reaches the pages. Over legacy.ts
   there is no rule to switch, so it is judge().

   Nothing the site loads imports this yet. Pure: no `window`, no DOM. */

import { alternatives, matches as legacyMatches, type AnswerType } from "./legacy.ts";
import type { AnswerSpec, RuleId, Verdict } from "./types.ts";

export { alternatives };
export { readNumber } from "./read.ts";

/** The grader's revision: tools/fixtures/grade-ledger.json's `revision`, stored beside a
    diagnostic's verdicts. A change that adds ledger entries moves it on. */
export const GRADER = 1;

const NONE: ReadonlySet<RuleId> = new Set();

/** An exercise's spec from what the page or a generator holds: the key as a string, the
    type as given (none is null; grade() takes it as "exact"), and the tol read as the pages
    read data-tol (a number or its text; anything that is not a number is 0) */
export function specOf(src: { answer?: unknown; type?: unknown; tol?: unknown; grid?: unknown }): AnswerSpec {
  const spec: AnswerSpec = {
    answer: src.answer == null ? "" : String(src.answer),
    type: src.type == null || src.type === "" ? null : String(src.type),
    tol: parseFloat(String(src.tol ?? "")) || 0
  };
  if (src.grid === true) spec.grid = true;
  return spec;
}

/** judge() with the rules in `off` doing what the old grader did (tools and tests only) */
export function judgeOff(given: unknown, spec: AnswerSpec, off: ReadonlySet<RuleId>): Verdict {
  /* no rule yet, so nothing in `off` to switch */
  const text = String(given);
  if (text.trim() === "") return { kind: "unread", reason: "empty", at: 0 };
  const type = spec.type || "exact", tol = spec.tol || 0;
  const alt = alternatives(spec.answer).findIndex((a) => legacyMatches(given, a, type, tol));
  return alt < 0 ? { kind: "wrong", read: null } : { kind: "right", alt, read: text.trim(), notes: [] };
}

/** A typed answer's verdict against its key */
export function judge(given: unknown, spec: AnswerSpec): Verdict {
  return judgeOff(given, spec, NONE);
}

/** One answer against a key with `|` alternatives: true only for a right verdict */
export function grade(given: unknown, answer: string | null | undefined, type?: AnswerType | null, tol?: number): boolean {
  return judge(given, { answer: answer || "", type, tol }).kind === "right";
}

/** One answer against one alternative of a key, as the detectors ask */
export function matches(given: unknown, answer: unknown, type?: AnswerType | null, tol?: number): boolean {
  return legacyMatches(given, answer, type, tol);
}
