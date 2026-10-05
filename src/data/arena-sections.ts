/* The sections the Arena can generate problems for, in reading order.

   The generators themselves (data/gen/*.js, about 100 KB) load on the Arena page only, but
   the home page and the chapter pages need to know which due sections the Arena can ask
   about (the "next best step" card links those to a due review, the rest to their page).
   So the list is written out here, and src/data/arena-sections.test.ts fails when it and
   the generators disagree: add a generator for a new section and that test names the line
   to add. */

export const ARENA_SECTIONS: readonly string[] = [
  "ch01#addition", "ch01#multiplication", "ch01#rationals", "ch01#inverses",
  "ch02#one-unknown", "ch02#two-unknowns", "ch02#word-problems",
  "ch03#order", "ch03#absolute", "ch03#powers",
  "ch04#square-roots", "ch04#completing", "ch04#formula", "ch04#discriminant", "ch04#graph",
  "interlude#sets",
  "ch05#distance", "ch05#angles", "ch05#parallels", "ch05#pythagoras",
  "ch06#mappings-plane", "ch06#isometries",
  "ch07#polygons", "ch07#scaling", "ch07#disc", "ch07#circumference",
  "ch08#coord-systems", "ch08#distance-formula", "ch08#circle",
  "ch09#dilations", "ch09#addition-points", "ch09#subtraction",
  "ch10#segments", "ch10#lines", "ch10#line-equation",
  "ch11#radians", "ch11#sine-cosine", "ch11#rotations",
  "ch12#definition-fn", "ch12#polynomials", "ch12#exponential", "ch12#log",
  "ch13#formalism", "ch13#permutations",
  "ch14#complex-arith", "ch14#complex-plane",
  "ch15#summations", "ch15#geometric",
  "ch16#det2", "ch16#det3", "ch16#det-props", "ch16#cramer"
];
