/* How many exercises each section's page offers, in reading order: the scored exercises that
   name the section in data-section, plus the inline "Your turn" checks under its heading.

   The study plan (src/learn/plan.ts) calls a section done when every one of these is solved
   (`row.solved >= SECTION_WORK[ref] > 0`), with or without an Arena generator. A section
   missing here has none: a reading section, or a mixed review whose problems are credited to
   the sections they come from. Counted as the app reads the pages (assets/site.js
   sectionOf), so tools/check-static.js `section-work` fails when a page and this table
   disagree and names the line to change: add an exercise to a page and that rule says which
   count to raise. */

import type { SectionRef } from "../types/state.ts";

export const SECTION_WORK: Readonly<Partial<Record<SectionRef, number>>> = {
  "ch01#addition": 4,
  "ch01#multiplication": 7,
  "ch01#even-odd": 3,
  "ch01#rationals": 5,
  "ch01#inverses": 4,
  "ch02#one-unknown": 7,
  "ch02#two-unknowns": 6,
  "ch02#three-unknowns": 3,
  "ch02#word-problems": 4,
  "ch03#why-more": 1,
  "ch03#axioms": 1,
  "ch03#order": 5,
  "ch03#absolute": 7,
  "ch03#powers": 6,
  "ch04#square-roots": 1,
  "ch04#completing": 3,
  "ch04#formula": 6,
  "ch04#discriminant": 6,
  "ch04#graph": 3,
  "interlude#logic": 7,
  "interlude#quantifiers": 5,
  "interlude#sets": 4,
  "interlude#notation": 1,
  "ch05#distance": 3,
  "ch05#angles": 5,
  "ch05#parallels": 7,
  "ch05#pythagoras": 7,
  "ch06#mappings-plane": 7,
  "ch06#isometries": 8,
  "ch06#symmetry": 7,
  "ch07#polygons": 8,
  "ch07#scaling": 5,
  "ch07#disc": 2,
  "ch07#circumference": 2,
  "ch08#coord-systems": 2,
  "ch08#distance-formula": 8,
  "ch08#circle": 11,
  "ch08#rational-points": 2,
  "ch09#dilations": 2,
  "ch09#addition-points": 8,
  "ch09#subtraction": 7,
  "ch10#segments": 5,
  "ch10#rays": 2,
  "ch10#lines": 3,
  "ch10#line-equation": 10,
  "ch11#radians": 3,
  "ch11#sine-cosine": 6,
  "ch11#graphs-trig": 5,
  "ch11#tangent": 1,
  "ch11#addition-formulas": 3,
  "ch11#rotations": 2,
  "ch12#definition-fn": 4,
  "ch12#polynomials": 2,
  "ch12#graphs-fn": 4,
  "ch12#exponential": 3,
  "ch12#log": 8,
  "ch13#definition-map": 6,
  "ch13#formalism": 7,
  "ch13#permutations": 6,
  "ch14#complex-arith": 11,
  "ch14#complex-plane": 5,
  "ch14#polar": 4,
  "ch15#induction": 4,
  "ch15#summations": 7,
  "ch15#geometric": 8,
  "ch16#det2": 6,
  "ch16#det3": 4,
  "ch16#det-props": 7,
  "ch16#cramer": 4
};
