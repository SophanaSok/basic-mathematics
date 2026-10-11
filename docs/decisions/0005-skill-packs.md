# 0005: Skill packs

## Decision

The eight gate-skill packs that 0001 makes free are short units beside Lang's sixteen chapters. They fill what the gate exams test and the book does not: `src/data/skills.ts` gives no section to any SAT Problem-Solving and Data Analysis tag (about 15% of the SAT), to Accuplacer QAS ratio or statistics, or to ALEKS rational expressions, and one section to ACT Statistics and Probability (12 to 15% of the 2025 ACT). The design is `~/.claude/plans/packs-design.md`.

A pack is a chapter page in a fifth Part, `packs` ("Skill packs"), marked `beside: true` in `data/curriculum.js`. Chapter ids are `pk-<slug>` and labels are letters A to H. Exercises, clues, progress, review boxes, the Arena, the skills check and the progress base treat a pack like a chapter. The flag keeps packs out of the course's reading order and its "whole course" milestones: no chapter or encounter "Next" leads from chapter 16 into a pack, and the ground-up achievement does not wait on them. A second keyspace for packs was considered and rejected: page discovery, the progress table, check-gen, the skills check and the progress base all read the curriculum, so a pack outside it would lose learners' work in about ten places.

The owner answered the design's six questions on 2026-10-10, choosing the recommended option on each. Each answer is now a rule:

- **PQ1 (a). The eight packs, in this order:** A Ratios, Rates and Percent; B Data and Statistics; C Chance and Counting; D Units and Measurement; E Linear Models and Inequalities; F Word Problems; G Growth, Decay and Sequences; H Factoring and Rational Expressions. The order is by gate value, pre-algebra first.
- **PQ2 (a). A percent box takes the percent.** A new answer type, `percent`, keyed in percent units (`data-answer="35"`): `35`, `35%` and `35 %` are right. `0.35` is the right value in the wrong form, "Write it as a percent, like 35%.": it costs nothing on pages, and in exam mode it scores as not correct and is explained on review (0002 Q1 and Q6).
- **PQ3 (a). A ratio box takes a ratio.** A new answer type, `ratio` (`data-answer="3:4"`): `3:4`, `3 : 4` and `3 to 4` are right, and so is `6:8`, with the unreduced note, as for fractions (0002 Q3). `3/4` and `0.75` are the right value in the wrong form, "Write it as a ratio, like 3:4.". `4:3`, or a different number of terms, is wrong.
- **PQ4 (a). The owner reads pack A before it merges.** Later packs go through the two reviewers, a reviewer check that recomputes every worked number and answer key, and owner spot-checks.
- **PQ5 (a). No terrace in the 3D world for now.** The world and the map skip beside Parts. Packs show on the home page, the progress page, the study plan and in the Arena.
- **PQ6 (a). The placement check stays as launched.** Its forms and `BLUEPRINT` do not change, and it never seeds a pack section's review box, because it asked nothing about one.

## Why

Exam mode cannot build an honest SAT or ACT form while whole domains have no items, so packs come before it. Pre-algebra packs come first because homeschool families lead (0001) and the same skills carry ACT Integrating Essential Skills, about a fifth of that test.

0002 (line 48) leaves `35%` and `3:4` unread because no box type read them. PQ2 and PQ3 add two box types; they change no existing box. Every number, fraction, set and point box grades exactly as before, and the change is proved by a ledger that shows no changed verdict. Treating `0.35` and `3/4` as the wrong form, not wrong, follows 0002's rule that a right value in another notation is explained rather than marked wrong.

Reading the pilot pack is the one check no test runs. It sets the voice for the seven that follow.

## What this changes

- The design's cards can start, in order: K-1 (the `beside` plumbing), K-2 (the `percent` and `ratio` types, grader work, with the golden file's generator list pinned to the five files it was frozen with), K-3 (charts as a widget), K-4 and K-5 (pack A, each card a page part with its generators), K-6 (the study plan lists packs at or below the start course, linked). Then a measured pause before packs B to H, two cards each, and K-21 (every exam tag carried by at least two sections).
- None of the cards is risky in AGENTS.md's sense. K-2 stays with Opus because it is grader logic.
- Every pack PR moves the progress base (`DEFAULT_BASE`) to its content commit.

## What it requires that did not exist before

- A fifth Part, `parts/5-packs/`, and a pack generator file, `data/gen/packs.js`.
- Two answer types, `percent` and `ratio`, and a `chart` widget whose source is an authored data table.
- The owner's read of pack A (PQ4).

## Status

Decided by the owner, 2026-10-10: the recommended option on all six questions, with no notes.
