# 0002: Typed grader with equivalence

## Decision

Decided by the owner on 2026-10-07: the six questions below were answered on the decisions page, the recommended option in every case, with no notes. This note records the answers, the defaults that need no answer, and the baseline the first PR laid down. The design is `~/.claude/plans/grade-equivalence-design.md` (revision 6, patch 1).

Grading stays in the browser and stays pure. Numbers, fractions, sets and points are read into exact rationals and compared by value; algebra keeps a string comparison with eight fixed rules. A new `judge()` returns one of four verdicts, each with a reason:

- `right`;
- `form`: the right value, in a form the exercise does not accept;
- `wrong`;
- `unread`: the input has no single reading, so the learner retypes. It is decided from the typed text and the box's type only, never from the key, so it cannot leak the answer.

`grade()` and `matches()` keep their signatures and stay boolean, true only for `right`. Tier 1 is 8 PRs (T1 to T8). It edits no page content and adds no `data-form` tag.

Proof is a ledger. The golden file is frozen at T1, graded by `src/core/answer/legacy.ts`, a byte copy of today's `src/core/grade.ts`. From T3 a tool lists every case whose verdict changes, names the rule that changed it and checks each new acceptance with an independent value check, and a Vitest test fails on any change the ledger does not list.

## Owner questions

Each answer changes what gets built. None was needed by T1, which records today's grader only. Answered by the owner on 2026-10-07, on the decisions page: the recommended option on all six.

| # | Question | Options | Recommended | Needed by | Answer |
|---|---|---|---|---|---|
| Q1 | What does a `form` verdict cost on pages and in the Arena? (`[6,-2]` for a point, `0.667` for 2/3) | (a) nothing anywhere; (b) a miss everywhere; (c) nothing on pages, a miss in the Arena | (c): in the Arena, with hearts and a clock, a free `form` would be a closeness probe | T5 | (c): a right value in the wrong form costs nothing on a page and counts as a miss in the Arena, and the reason is shown either way |
| Q2 | What does an `unread` verdict cost? (`1-1/2`, `1,5`, `4 adults`, `x = 3`, `140°` on a page) | (a) nothing, like an empty box; (b) an attempt | (a), on pages and in the Arena: it says what to type and leaks nothing | T5 | (a): a retype request costs nothing, on pages and in the Arena; the learner just types it again |
| Q3 | Unreduced fractions: `6/4` for 3/2, `8/2` for 4 | (a) right, with a note; (b) `form/unreduced` everywhere; (c) as (a), but a fraction typed for a whole-number key is `form` | (a): no exercise prompt asks for lowest terms | T6 | (a): an unreduced fraction is right, with a note about the simpler form |
| Q4 | Mixed numbers: `1 1/2` | (a) read as 3/2 in number, fraction and point boxes, refused in set boxes; (b) refused everywhere with "type 3/2 or 1.5" | (a): today `1 1/2` is read as 11/2 | T6 (T2 builds either) | (a): `1 1/2` reads as 3/2, except in a list (set) box, which asks for a retype |
| Q5 | A rounded decimal for an exact key with no `data-tol`: `0.667` for 2/3 | (a) `form/rounded`; (b) wrong, as today; (c) right | (a); the 1e-9 calculator band stays right, and it never applies when a tol is set | T6 | (a): a rounded decimal for an exact key is "right value, wrong form", not a plain miss; its cost follows Q1 |
| Q6 | In exam mode and the diagnostic, when is a `form` reason shown? | (a) during the test; (b) after submission | (b): `form` scores as not correct and is explained on review; `unread` is shown at once | exam mode, diagnostic | (b): in exam mode and the placement check, the form reason is shown after submission, on the review screen; a retype request is still shown at once |

**What the answers unblock.** T5 (pages and the Arena show the new verdicts) has Q1 and Q2. T6 (the new grading of numbers, fractions, sets and points goes live) has Q3 to Q5. Exam mode and the placement check's review screen have Q6; the placement check records the same rule as its own DG2 (0003). T1 to T4 are merged: PRs #26 (the baseline), #27 (the reader and messages), #30 (the ledger harness) and #33 (`judge`, `specOf` and the messages on `window.BMCore`).

## Decided defaults

The owner can override any of these; none needs an answer to start. The design's "Decided defaults" table gives the reason for each.

- A single letter named before a number (`x = 3`, `3 = x`, `y=2`, set members such as `x = 2 or x = -7`) is `unread/named`, until a later `data-var` lets an exercise accept its own letter.
- Two values in a number box (`4,-4`, `4, -4`, `1,2,3`, `4 or -4`) are `unread/list`.
- `2 and 1/3` is `unread/ambiguous-mixed` in a number or fraction box and `unread/mixed-in-set` in a set box; `2 and -1/3` and `1/2 and 1/3` are still two set members. Its message depends on Q4. Under Q4(b), `1 1/2` is `unread/mixed`.
- A decimal comma (`0,5`, `3,14`, `0,500`, and `-4,4`, which could mean -4.4) is `unread/decimal-comma`, with "Use a decimal point, like 0.5. This box takes one number."
- A number followed by a word that is not a maths word is `unread/units` (`4 adults`, `140 deg`, `140deg`); other letters are `unread/expression` (`2pi`, `25pi`, `3 i`, `4xy`, `11 m`).
- Points compare by exact value, in order, with no band and no tol; `[6,-2]`, `<6,-2>` and `x=6, y=-2` are `form/notation`. Labels place each value (`y=-2, x=6` is (6,-2)) and must all be present, distinct, and `x,y` or `x,y,z`.
- When a key alternative is a point key and the given reads as a tuple of the same arity, the value compare is final. A coordinate led by `0` and another digit means that side, given or key, is not a tuple, so `(1,000)` is not (1,0) and the exact key `1,000` is not a point.
- Sets pair members after sorting both lists. Exactly equal repeats (`2,2,-7`) are `form/repeated`. Empty members are ignored, as today. Rounded members are wrong, as today. `±7` in a set is 7 and -7; in a number box it is `unread/plus-minus`.
- Thousands commas are read in number and fraction boxes only, in groups of three with a first group of 1-3 digits not starting with 0 (`5,050`).
- `$` is read only at the front, beside the sign. `12.50$`, `1$2.50` and `£12.50` are `unread/symbol`; `12.50 USD` is `unread/units`.
- On pages, `°`, `º`, `˚` and unit words are `unread/units`. In the Arena, `clean()` stays as today and strips a trailing `°` or degree word, a known false positive on the unit, never on the value, until units are declared.
- Percent, scientific notation and ratios are `unread`; arithmetic in a number box (`4-(-3)`, `2^2`, `sqrt(16)`) is `unread/expression`; `1-1/2` is `unread/ambiguous-mixed`.
- A trailing full stop is read on every type. A sign on a denominator reads (`1/-1`). `½ ¼ ¾ ⅓ ⅔` read in number, fraction, set and point boxes.
- The calculator band (`|a-b|·10⁹ ≤ max(1,|a|,|b|)`) and `data-tol` (absolute, inclusive, read exactly from `String(tol)` including exponent notation) are computed exactly.
- "We read that as 3/2" shows on `wrong` and `form` only for a mixed number, a `½`-style character or labels.
- Grid-in (SAT student-produced response) accepts unreduced fractions that fit, refuses leading zeros that pad the width, and ignores tol.
- The diagnostic stores `{kind, reason, grader: GRADER}`; a retake under another grader revision is labeled, never re-graded.
- A key with an empty `|` piece (`|x|`) is one answer, so `x` is wrong for it. Typing the whole key `(6,-2)|6,-2` stays right.
- Length limits: number, fraction and set over 200 characters or a digit run over 40 are `unread/too-long`; expr and exact over 1,000 characters.
- Expr whitespace is deleted, as today, except around a mixed number; expr and exact return `unread` only when empty or too long.
- The build treats a module of `src/core/answer/` as part of `src/core/grade.ts` (`vite.config.ts` `bundleNames`, `tools/check-dist.js`).
- The heavy tests run under a 60 s budget, as `src/sync/merge.test.ts` does; no test asserts a time per call.
- Tier 1 changes no `data-answer`, no question text and no `data-type`, and adds no `data-form`.

## The baseline (T1)

- `src/core/answer/legacy.ts` is a byte copy of `src/core/grade.ts`. Nothing in the bundle imports it; it is the ledger's "before".
- `tools/gen-grade-golden.js` grades with `legacy.ts`, never with the live grader, and `--check` exits 1 if the file on disk differs from a fresh run.
- A blank with no `data-type` is recorded as a number, as `site.js` grades it on the live page; before, the writer recorded it as exact. That moves 41 blank keys, 356 cases to 520. Under their old spec the frozen grader still gives every one of the 356 its old verdict.
- `LEARNER_CASES` holds every example row of the design's tables in sections 3.1 to 3.4: 70 keys, one entry per key, type and tolerance, given their rows through `givensOf()` as the detector fixtures are, 1,410 cases. Grid-in and Arena-only rows are tested elsewhere, because a golden group has no grid or Arena field.
- The file has 2,499 groups and 65,185 cases. Every case of the file before it, outside the 41 blank keys, is kept with its verdict.

## Status

Proposed, 2026-10-07, with T1. Decided by the owner the same day, on the decisions page: the recommended option on all six questions, with no notes. T1 to T4 are merged (PRs #26, #27, #30, #33); T5 (Q1, Q2) and T6 (Q3, Q4, Q5) can start, and exam mode and the placement check build on Q6.
