/* Facts about each chapter, interlude and pack, for the contents list's cards.

   Written by tools/gen-chapter-meta.js from the pages and data/curriculum.js, never by hand.
   src/data/chapter-meta.test.ts fails when this file is not what the generator would
   write; the fix is `npm run gen:chapter-meta`. */

export interface ChapterMeta {
  sections: number;
  scored: number;
  inline: number;
  words: number;
  minutes: number;
  goal: string;
}

export const CHAPTER_META: Record<string, ChapterMeta> = {
  "ch01": {
    "sections": 6,
    "scored": 10,
    "inline": 11,
    "words": 2592,
    "minutes": 45,
    "goal": "state the laws of addition and multiplication, explain from those laws why $(-1)(-1) = 1$, prove simple statements about all even and odd integers, add and multiply fractions and say why the rules are what they are, and explain precisely why division by zero is impossible."
  },
  "ch02": {
    "sections": 4,
    "scored": 10,
    "inline": 11,
    "words": 2056,
    "minutes": 40,
    "goal": "solve a linear equation in one unknown and justify each step, solve systems in two and three unknowns by elimination, recognize from the arithmetic alone whether a system has one solution, none, or infinitely many, and turn a word problem into equations."
  },
  "ch03": {
    "sections": 5,
    "scored": 10,
    "inline": 11,
    "words": 2027,
    "minutes": 40,
    "goal": "prove that $\\sqrt{2}$ is irrational, state the positivity rules and derive the rules for inequalities from them (including the one that flips), read $|x - a|$ as a distance and solve inequalities involving it, and compute confidently with integer, negative, and fractional exponents."
  },
  "ch04": {
    "sections": 5,
    "scored": 10,
    "inline": 10,
    "words": 1625,
    "minutes": 40,
    "goal": "solve $x^2 = c$ and factored equations, complete the square on any quadratic, derive the quadratic formula rather than recall it, use the discriminant to predict the number of real roots before solving, and locate the vertex and axis of symmetry of a parabola."
  },
  "ch05": {
    "sections": 4,
    "scored": 10,
    "inline": 12,
    "words": 2296,
    "minutes": 45,
    "goal": "state the three properties distance obeys and use the triangle inequality, work with supplementary, vertical, corresponding and alternate angles, prove that the angles of a triangle add to $180°$, and prove the Pythagorean theorem by dissection — as well as use its converse to test for a right angle."
  },
  "ch06": {
    "sections": 3,
    "scored": 10,
    "inline": 11,
    "words": 2091,
    "minutes": 40,
    "goal": "describe translations, rotations, reflections, and dilations as mappings of the plane; test whether a mapping is an isometry; compose two isometries and identify the result; explain congruence as the existence of an isometry; and list the symmetries of a figure and see that they compose like a system of arithmetic in their own right."
  },
  "ch07": {
    "sections": 5,
    "scored": 16,
    "inline": 10,
    "words": 2070,
    "minutes": 50,
    "goal": "derive the triangle formula from the rectangle rather than recall it, apply the scaling law (lengths $\\times r$, areas $\\times r^2$) to real questions, explain why the area of a disk is $\\pi r^2$ by way of inscribed polygons, and say precisely what $\\pi$ is and why the same $\\pi$ appears in both $2\\pi r$ and $\\pi r^2$."
  },
  "ch08": {
    "sections": 4,
    "scored": 11,
    "inline": 12,
    "words": 2223,
    "minutes": 45,
    "goal": "locate points by coordinates and name the quadrants, derive and use the distance formula, recognize and manipulate the equation of a circle in both center–radius and expanded form, recover a circle's center and radius by completing the square, and generate all the rational points on the unit circle from a single parameter."
  },
  "ch09": {
    "sections": 3,
    "scored": 10,
    "inline": 9,
    "words": 1315,
    "minutes": 35,
    "goal": "compute $tP$, $P + Q$ and $Q - P$ in coordinates and say what each does geometrically, use the parallelogram law, recognize reflections and dilations as special cases of $tP$, distinguish a point from the located vector that joins two points, and recognize when two arrows represent the same displacement."
  },
  "ch10": {
    "sections": 4,
    "scored": 10,
    "inline": 10,
    "words": 1473,
    "minutes": 35,
    "goal": "write the parametric form of a segment, ray, or line through two given points; find points dividing a segment in a given ratio; convert between parametric form, $y = mx + b$, and $ax + by = c$; compute slope and use it to test for parallel and perpendicular lines; and handle the vertical line that $y = mx + b$ cannot express."
  },
  "ch11": {
    "sections": 7,
    "scored": 19,
    "inline": 12,
    "words": 2121,
    "minutes": 60,
    "goal": "convert between degrees and radians and explain why radians are the natural unit; give $\\cos\\theta$ and $\\sin\\theta$ for any angle from the unit circle; use $\\cos^2\\theta + \\sin^2\\theta = 1$; read period, amplitude, and shift off a graph or a formula; say where $\\tan$ is undefined and why; and apply the addition formulas, including as a rotation of the plane."
  },
  "ch12": {
    "sections": 5,
    "scored": 10,
    "inline": 11,
    "words": 1907,
    "minutes": 40,
    "goal": "state what a function is and why the domain is part of it, apply the vertical line test, describe a polynomial by degree and roots, predict how shifts and stretches move a graph, work with $a^x$ for any real $x$, and use logarithms to turn products into sums and solve equations with the unknown in the exponent."
  },
  "ch13": {
    "sections": 3,
    "scored": 10,
    "inline": 10,
    "words": 1307,
    "minutes": 35,
    "goal": "state what a mapping between two sets is and distinguish codomain from image, compose mappings and respect the order, decide whether a mapping is injective, surjective, or bijective, know that invertible means bijective and why, and count and compose permutations of a finite set."
  },
  "ch14": {
    "sections": 3,
    "scored": 10,
    "inline": 10,
    "words": 1304,
    "minutes": 35,
    "goal": "add, multiply, and divide complex numbers; use the conjugate to rationalize a denominator and to compute $|z|$; plot complex numbers and read $|z-w|$ as a distance; convert to polar form; explain why multiplying multiplies lengths and adds angles; and find the $n$th roots of a complex number."
  },
  "ch15": {
    "sections": 3,
    "scored": 10,
    "inline": 10,
    "words": 1572,
    "minutes": 40,
    "goal": "write and check a proof by induction, identify where the inductive hypothesis is used, read and manipulate sigma notation, derive and apply the standard sums, and sum a geometric series both for finite $n$ and — when $|r| < 1$ — in the limit."
  },
  "ch16": {
    "sections": 6,
    "scored": 22,
    "inline": 12,
    "words": 1982,
    "minutes": 65,
    "goal": "write a linear system as a matrix, compute $2\\times2$ and $3\\times3$ determinants, read the determinant as a signed area or volume, predict from it whether a system has a unique solution, use the main properties to compute determinants cheaply, and apply Cramer's rule."
  },
  "interlude": {
    "sections": 6,
    "scored": 18,
    "inline": 10,
    "words": 1540,
    "minutes": 55,
    "goal": "distinguish a statement from its converse and its contrapositive, disprove a claim with a single counterexample, negate a \"for all\" or \"there exists\" statement correctly, use the basic vocabulary of sets, and choose notation that keeps an argument readable."
  },
  "pk-chance": {
    "sections": 4,
    "scored": 27,
    "inline": 14,
    "words": 3356,
    "minutes": 85,
    "goal": "find the probability of an event as the number of favorable outcomes over the number of equally likely outcomes, find the probability that it does not happen, tell an experimental probability from a theoretical one, predict how many times an event should occur in a number of trials, list the outcomes of two steps, and find the probability that two events both happen, that one or the other happens, or that two draws without replacement both go a given way, read a probability from a two-way table and tell a conditional probability from a probability over the whole table, compare groups by their relative frequencies, count outcomes by multiplying choices, and count the arrangements of some or all of a set of items."
  },
  "pk-data": {
    "sections": 4,
    "scored": 29,
    "inline": 13,
    "words": 3813,
    "minutes": 90,
    "goal": "find the mean, median and mode of a list and say which of them an extreme value moves, find the range, the quartiles and the interquartile range by the course's rule, tell which of two lists is more spread out without computing anything, and read a dot plot, a histogram, a box plot and a two-way table, saying what each one shows and what it hides, then use a line of fit to predict and to find a residual, tell a random sample from a convenience sample, estimate a population from a sample proportion, and say what a claim from a sample can and cannot show."
  },
  "pk-growth": {
    "sections": 4,
    "scored": 28,
    "inline": 15,
    "words": 3625,
    "minutes": 90,
    "goal": "tell an arithmetic sequence from a geometric one by taking differences and then ratios, write the rule both ways (from step to step, and as a formula for the $n$th term), and use the formula to find a far term, to find which position holds a value, to fill in a missing middle term and to add a short arithmetic list by pairing its ends. You can tell linear change from exponential change, turn a percent increase or decrease into a multiplier, read the starting value and the multiplier from a model or a table and the percent per period from the multiplier, write a growth or decay model from a story, say why an exponential quantity overtakes a linear one however the two begin, and count the periods until a value is reached by listing. You can find a balance under compound interest and set it against simple interest, apply a yearly rate compounded more often than yearly, read the principal and the rate from a formula, estimate a doubling time, evaluate a logarithm as an exponent, and solve $a \\cdot b^t = c$ exactly or with a calculator, choosing the expression that gives $t$."
  },
  "pk-linear": {
    "sections": 4,
    "scored": 28,
    "inline": 15,
    "words": 3467,
    "minutes": 90,
    "goal": "find the slope of a line from two points or from a table, even when the table's steps are uneven, say what a slope means in a sentence with its units, tell from its sign whether a quantity rises, falls or stays flat, read the rate and the starting value from $y = mx + b$, write the model from a story, from two points or from a table and check it at a point you did not use, predict a value with it, solve $mx + b = T$ to find when a quantity reaches a target, and say where a model stops making sense. You can also solve an inequality in one unknown, turn the sign around when you multiply or divide by a negative number, test the answer on both sides of the boundary, and find the least or greatest whole number that works. In two unknowns you can tell which side of a line an inequality describes, settle it with a test point, and find the corner and the whole-number points of a system."
  },
  "pk-percent": {
    "sections": 4,
    "scored": 29,
    "inline": 15,
    "words": 3084,
    "minutes": 90,
    "goal": "write a ratio in lowest terms and tell a part-to-part ratio from a part-to-whole one, find and compare unit rates, solve a proportion and say why cross-multiplying works, find a percent of a quantity, the whole from a part, or the percent itself, work out a percent change and undo it, combine repeated changes by multiplying their multipliers, and spot the number in a word problem that does not belong to the question."
  },
  "pk-rational": {
    "sections": 4,
    "scored": 28,
    "inline": 15,
    "words": 3217,
    "minutes": 85,
    "goal": "factor a trinomial $x^2 + bx + c$ by finding two numbers with product $c$ and sum $b$, take a common factor out first, factor $ax^2 + bx + c$ by splitting the middle term, factor a difference of squares and a perfect square, and check any factoring by expanding back. You can name the values of $x$ that a rational expression excludes, simplify it by factoring top and bottom completely and dividing out common factors, handle an opposite factor, and check a simplified form by evaluating both forms at an allowed value. You can multiply and divide rational expressions by factoring first, add and subtract them over a least common denominator, and solve a rational equation by clearing the fractions, rejecting any extraneous solution."
  },
  "pk-units": {
    "sections": 4,
    "scored": 28,
    "inline": 15,
    "words": 3373,
    "minutes": 90,
    "goal": "write a measurement with its unit, build a conversion factor from a known fact and put it the right way up so the unit you are leaving cancels, convert one-step and two-step measurements in the US customary and metric systems, check an answer by asking whether a smaller unit should give a bigger number, find a unit rate, use distance equals rate times time with the units lined up, convert a rate by converting its top and its bottom, compare offers given in different units, read the units of an answer to catch a setup that is upside down, convert square and cubic units with the length factor squared or cubed, find the cost of covering an area, and use a scale to move between a drawing and the real thing, remembering that areas change by the square of the scale factor."
  },
  "pk-words": {
    "sections": 4,
    "scored": 28,
    "inline": 15,
    "words": 3907,
    "minutes": 90,
    "goal": "name an unknown with its unit, write every other quantity in terms of it, write one equation for each fact of a story, solve it and answer the question that was asked, with units, checking against the story and not only against the equation. You can turn phrases such as “5 less than twice a number” into expressions, write consecutive integers and consecutive even or odd integers, and solve age and perimeter problems. For motion you can fill a row of rate, time and distance for each mover, tie the rows with the right sentence (the distances add to the gap, are equal, or the times add), change minutes to hours before multiplying, and find an average speed as total distance over total time. You can add the rates of two workers (and subtract a drain), add or take away a current from a boat's still-water speed, follow the pure amount through a mixture, and check an answer against every fact of the story, its units and kind, the question asked and an estimate."
  }
};
