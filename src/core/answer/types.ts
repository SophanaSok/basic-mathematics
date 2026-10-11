/* The typed grader's shapes (decision 0002, docs/decisions/0002-typed-grader.md): what an
   exercise asks for, and the four verdicts a typed answer can get. Type-only, so it erases
   to nothing.

   The reader (read.ts), the messages (messages.ts) and judge() in check.ts use it; the
   site reaches them through src/core/grade.ts and window.BMCore (src/ui/core.ts). */

import type { KnownAnswerType as OldKnownAnswerType } from "./legacy.ts";

/** The old grader's types, and the percent and ratio boxes of decision 0005, which it never
    had (any other string a page carries is graded as "exact") */
export type KnownAnswerType = OldKnownAnswerType | "percent" | "ratio";
export type AnswerType = KnownAnswerType | (string & {});

/** An exercise's key as the grader sees it: the `|`-separated key, its data-type, its
    data-tol (absolute), and grid mode, which only exam items set (SAT student-produced
    response, where the grid's own rules replace the reader's). */
export interface AnswerSpec { answer: string; type?: AnswerType | null; tol?: number; grid?: boolean }

/** Said beside a `right`: the answer was unreduced (6/4), a mixed number (1 1/2), or had
    thousands commas (5,050). */
export type Note = "unreduced" | "mixed" | "thousands";

/** The right value in a form the exercise does not take. "unreduced" is used only under
    Q3(b) or Q3(c), "grid-width" only in grid mode; "notation" is a point in [...], <...>
    or labels, a decimal in a percent box (0.35), or one number in a ratio box (3/4). */
export type FormReason = "rounded" | "notation" | "repeated" | "grid-width" | "unreduced";

/** Why a typed answer has no single reading, so the learner retypes it. Decided from the
    typed text and the type alone, never from the key. "mixed" is used only under Q4(b),
    "ratio-terms" only in a ratio box. */
export type UnreadReason = "empty" | "too-long" | "named" | "words" | "expression" | "spaces" | "ambiguous-mixed"
  | "list" | "decimal-comma" | "list-comma" | "mixed-in-set" | "brackets" | "percent" | "units" | "symbol"
  | "plus-minus" | "scientific" | "ratio" | "grid-chars" | "grid-length" | "grid-zeros"
  | "mixed" | "ratio-terms";

/** A rule's id ("N-dot", "L-sep", "E-pow", ...). Each rule is a switch: in a set of rules
    switched off, its step does what the grader before it did. */
export type RuleId = string;

/** `alt` indexes alternatives(answer); `read` is built from the typed answer alone and
    never holds the key; `at` is which value of the answer could not be read (read.ts). */
export type Verdict =
  | { kind: "right"; alt: number; read: string; notes: Note[] }
  | { kind: "form"; alt: number; read: string; reason: FormReason }
  | { kind: "wrong"; read: string | null }
  | { kind: "unread"; reason: UnreadReason; at: number };

/** The owner's answers to decision 0002's questions that change a verdict, given to the
    grader rather than assumed by it. Answered on 2026-10-07 with the recommended options,
    Q3(a), Q4(a) and Q5(a), which check.ts OWNER records.
      q3  an unreduced fraction (6/4 for 3/2): (a) right, with a note; (b) form/unreduced;
          (c) as (a), but a fraction for a whole-number key is form/unreduced
      q4  a mixed number (1 1/2): (a) read as 3/2 in number, fraction and point boxes and
          refused in a set box; (b) refused everywhere (unread/mixed)
      q5  a rounded decimal for an exact key with no tol (0.667 for 2/3): (a) form/rounded;
          (b) wrong; (c) right */
export interface Owner { q3: "a" | "b" | "c"; q4: "a" | "b"; q5: "a" | "b" | "c" }
