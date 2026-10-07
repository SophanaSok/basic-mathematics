# 0004: US English and skills

## Decision

**US1 (a). No locale switch.** Every UI string ships in US English: the Arena, Insights, the account page, the About page and the top bar. Dates follow the browser locale: the Arena's hand-built "Thursday 8 October" becomes `toLocaleDateString`, as the progress page already does, so a US browser shows "Thursday, October 8" and a UK browser keeps its own order. This refines 0001's line "the locale toggle covers UI strings only": there is no toggle for now. Revisit if UK readers ask. A toggle is its own design (a preference in the settings sheet, a shell change, a string table) and touches no chapter file.

**US2 (yes). Wording changes too, not only spelling.** Brackets are parentheses, towards is toward, pavement is sidewalk, cinema is movie theater, a stall is a stand, "costs marks" is "costs points", tick is check. Shipped in U1 to U7 (PRs #28 to #41). The six wording hits left (about.html, arena.js, flipbook.js) go in with U8 and U9. The code name in `src/core/answer/read.ts` stays.

**US3 (yes). The US English plan owns the pound-to-dollar rewrite.** U1 (PR #28) rewrote page 02 and the Part I generator in dollars; no pound sign is left in the chapters or generators. It replaces L7 of the grader design.

**SW1 (a). The final cross-Part wording sweep is approved in full,** in one card with one progress base update. Counted on this worktree (main at 4f2d801) over parts/, assets/, data/ and the root pages:

| Item | Becomes | Count |
|---|---|---|
| "If one will not come" | "If one doesn't come to you, its solution says where to look." | 16 chapter pages, plus the same idiom on the About page |
| non-zero | nonzero | 18 reader-facing; one code comment in `assets/scenes/det3.js` and "exits non-zero" in tools stay |
| right-angled | right triangle phrasing | 10 |
| disc | disk | 34 whole-word hits, 20 of them prose (14 on chapter 7's page, 4 in its generator, 2 in curriculum summaries); the section id `disc`, its anchors and `data-section`, the generator ids `disc-area` and `quad-disc`, and the widgets.js variable stay |
| Pythagoras, meaning the theorem | the Pythagorean theorem | 28 hits, every one meaning the theorem; 26 reader-facing (two are code comments); the notes limit the change to hint and solution text |
| reflection in, reflected in (a line) | reflection across | 21 "reflection in" plus 3 "reflected in", 24 in all; one more, in `assets/scenes/flipbook.js`, is a code comment; the verb forms "reflect in" and "reflecting in" have 8 more hits for the card to treat the same way |
| mid-line | midline | 2, both in widgets.js |

Six exercise questions change wording (interlude e10, 05 e5, 07 w1, 06 k1, e1 and e6, the last a verb form the item table counts under "reflect in"), so the sweep moves the progress base once. Section ids never change.

**SK1 (a). A fifth course value, `beyond`, labeled "Beyond Algebra 2".** It holds the 9 advanced sections (chapter 16's matrices and determinants, the complex plane and polar form, the trig addition formulas, permutations, induction) and 3 generator overrides (`trig-exact`, `compose-fn`, `cx-divide`). No learner is ever placed into it: the placement check draws no item from it, and the plan lists it only under "Going further". This extends 0001's four course bands, for the scope page only.

**SK2 (a). Reasoning sections store no Common Core code.** The four Interlude reasoning sections and chapter 15's summations have `ccss: null`, shown as "Reasoning: no Common Core content standard", and add nothing to standards reports. Mathematical Practice codes (MP1 to MP8) are not stored.

**SK3 (a). A section's course follows what its exercises and generators test, and the lower grade wins a tie.** So seven sections whose lessons go further stay Pre-algebra: ch02#two-unknowns, ch02#word-problems, ch09#subtraction, ch10#rays, ch10#line-equation, ch11#rotations and ch16#cramer. Cramer's rule counts as Pre-algebra because its exercises only solve two equations in two unknowns, which is grade 8 work.

## Why

US1: about 10 UI strings differ (practise, seven times; "Last practised"; "cancelled"; "Tick") plus the date order. A switch needs its own design and would hold U8 and U9, the last two US English cards.

US2: 0001 says the text is rewritten for US readers, and a US reader expects "parentheses" and "toward"; "brackets" means square brackets to them. Undoing it would mean reverting PRs #28 to #41.

US3: L7's check counted pound signs, which misses pence and the word "pounds" (6 lines), had no rule for writing a dollar sign in prose (`$` is the KaTeX delimiter), and did not plan the progress base update. One card owns page 02's money lines.

SW1: these are British phrasings the spelling lock cannot catch, collected card by card in the review notes. US textbooks say "nonzero", "right triangle", "disk", "the Pythagorean theorem" and "reflection across". One pass finishes the job, and a progress base update costs the same whether 3 or 5 questions change.

SK1: Common Core marks this content (+), which no Traditional-pathway course holds. Folding it into Algebra 2 would pull exact trig values into the placement check.

SK2: practice codes are not content codes and fail the stored code form; mixing them with content codes would muddle the standards reports.

SK3: every consumer of a course reads evidence: the placement check places from generator items, seeding writes per-section boxes, exam modes draw generators. The other tie-break would also move ch02#one-unknown and the grade-8 sections in chapters 6, 8 and 9.

## What this changes

- U8 (Arena and Insights wording, the date format) and U9 (account page, About page, closing the spelling lock with an empty allow file) can proceed. The plan is `~/.claude/plans/us-english-plan.md`.
- The sweep card (U9 or a follow-up) can proceed, with "non-zero", "right-angled", "disc", "Pythagoras", "reflection in" and "mid-line" added to the wording report in `tools/us-english.js`.
- The grader design's L7 (line 694) and its Money row (line 92) should point to U1: a two-line edit to `~/.claude/plans/grade-equivalence-design.md`, not yet made.
- `src/data/skills.ts`: the head comment and the `// Owner Q1`, `Q2` and `Q3` markers say "default taken". The next skills PR should say decided (this note). Not edited here.
- The placement check's band type excludes `beyond` (0003).

## Status

Decided by the owner, 2026-10-07, on the decisions page: the recommended option on all seven questions, with no notes. US2, US3 and SK1 to SK3 record what already shipped (PRs #28 to #41 and PR #23).
