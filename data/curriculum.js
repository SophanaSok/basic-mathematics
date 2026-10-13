/* Single source of truth for the whole course.
   The first import of every page's entry (src/entries/*.js): it sets window.BM_CURRICULUM
   before any other script runs, and nothing is fetched for it.
   Adding a chapter = one entry here + one HTML file. Navigation builds itself. */
window.BM_CURRICULUM = {
  title: "Basic Mathematics",
  subtitle: "A course from the ground up, following the syllabus of Serge Lang's book",
  parts: [
    {
      id: "algebra",
      num: "I",
      name: "Algebra",
      dir: "1-algebra",
      blurb:
        "Numbers and the rules they obey — not handed down, but argued for. Then equations, the real line, and quadratics.",
      chapters: [
        {
          id: "ch01",
          label: "1",
          title: "Numbers",
          file: "01-numbers.html",
          status: "full",
          blurb:
            "Where the rules of arithmetic come from: counting numbers, negatives, why a negative times a negative is positive, even and odd, fractions, and inverses.",
          sections: [
            { id: "integers", title: "The integers", summary: "Counting, zero, and negatives as a single number line." },
            { id: "addition", title: "Rules for addition", summary: "Associativity, commutativity, zero, and opposites — and what they let you do." },
            { id: "multiplication", title: "Rules for multiplication", summary: "The distributive law, and why it forces the rules of signs." },
            { id: "even-odd", title: "Even and odd integers", summary: "A first taste of proof: statements about all integers at once." },
            { id: "rationals", title: "Rational numbers", summary: "Fractions as a single number, equality, addition, multiplication." },
            { id: "inverses", title: "Multiplicative inverses", summary: "Division as multiplication by an inverse, and why you cannot divide by zero." }
          ]
        },
        {
          id: "ch02",
          label: "2",
          title: "Linear Equations",
          file: "02-linear-equations.html",
          status: "full",
          blurb:
            "Solving systems by elimination, and reading off from the arithmetic whether there is one solution, none, or infinitely many.",
          sections: [
            { id: "one-unknown", title: "One unknown", summary: "What solving means, and the two moves that preserve a solution set." },
            { id: "two-unknowns", title: "Equations in two unknowns", summary: "Elimination, and the three possible outcomes." },
            { id: "three-unknowns", title: "Equations in three unknowns", summary: "The same method, organized so it cannot run away from you." },
            { id: "word-problems", title: "Turning words into equations", summary: "Naming unknowns and extracting one equation per fact." }
          ]
        },
        {
          id: "ch03",
          label: "3",
          title: "Real Numbers",
          file: "03-real-numbers.html",
          status: "full",
          blurb:
            "Filling the gaps between fractions: positivity, ordering, absolute value, powers and roots, and how to work with inequalities.",
          sections: [
            { id: "why-more", title: "Why the fractions are not enough", summary: "The square root of 2 is not a fraction — a proof you can hold in your head." },
            { id: "axioms", title: "Addition, multiplication, and positivity", summary: "The short list of properties the whole real line runs on." },
            { id: "order", title: "Order and inequalities", summary: "What you may do to both sides, and the one move that flips the sign." },
            { id: "absolute", title: "Absolute value and distance", summary: "Reading |x − a| < r as a statement about distance." },
            { id: "powers", title: "Powers and roots", summary: "Integer, negative, and fractional exponents, and the laws that survive." }
          ]
        },
        {
          id: "ch04",
          label: "4",
          title: "Quadratic Equations",
          file: "04-quadratic-equations.html",
          status: "full",
          blurb:
            "Completing the square once, in general — which is all the quadratic formula is — and what the discriminant tells you before you solve.",
          sections: [
            { id: "square-roots", title: "Equations you can already solve", summary: "x² = c, and factored equations via the zero-product property." },
            { id: "completing", title: "Completing the square", summary: "The one algebraic trick behind everything in this chapter." },
            { id: "formula", title: "The quadratic formula", summary: "Completing the square on ax² + bx + c = 0 in general." },
            { id: "discriminant", title: "The discriminant", summary: "Two roots, one, or none — decided by b² − 4ac." },
            { id: "graph", title: "Vertex, symmetry, and the graph", summary: "Why every parabola is symmetric about x = −b/2a." }
          ]
        },
        {
          id: "interlude",
          label: "Interlude",
          title: "On Logic and Mathematical Expressions",
          file: "interlude-logic.html",
          status: "full",
          blurb:
            "A pause to look at the language itself: how to read a mathematics book, implication and its converse, sets, and quantifiers.",
          sections: [
            { id: "reading", title: "On reading mathematics", summary: "Why reading with a pencil is the only reading that works." },
            { id: "logic", title: "Implication, converse, contrapositive", summary: "The single most common source of wrong proofs." },
            { id: "quantifiers", title: "For all, there exists, and counterexamples", summary: "How to disprove a statement, and how not to." },
            { id: "sets", title: "Sets and elements", summary: "Membership, subsets, union, intersection, complement." },
            { id: "notation", title: "Notation as a tool", summary: "Choosing names and symbols that keep the argument readable." },
            { id: "review", title: "Mixed review", summary: "Problems drawn back across Chapters 1–4, to test what stuck." }
          ]
        }
      ]
    },
    {
      id: "geometry",
      num: "II",
      name: "Intuitive Geometry",
      dir: "2-geometry",
      blurb:
        "Geometry before coordinates: distance, angle, the Pythagorean theorem, motions of the plane, and area.",
      chapters: [
        {
          id: "ch05",
          label: "5",
          title: "Distance and Angles",
          file: "05-distance-and-angles.html",
          status: "full",
          blurb: "Points, lines, distance, angle measure, parallels, and the Pythagorean theorem with a proof you can see.",
          sections: [
            { id: "distance", title: "Distance", summary: "Distance as a number attached to a pair of points, and its basic properties." },
            { id: "angles", title: "Angles", summary: "Measuring turn: degrees, right angles, supplementary and vertical angles." },
            { id: "parallels", title: "Parallel lines and transversals", summary: "Corresponding and alternate angles, and the angle sum of a triangle." },
            { id: "pythagoras", title: "The Pythagorean theorem", summary: "A dissection proof, then the converse and the distance it will later give us." }
          ]
        },
        {
          id: "ch06",
          label: "6",
          title: "Isometries",
          file: "06-isometries.html",
          status: "full",
          blurb: "The motions that preserve distance — translations, rotations, reflections — and symmetry as invariance under them.",
          sections: [
            { id: "mappings-plane", title: "Some standard mappings of the plane", summary: "Translation, rotation about a point, reflection across a line, dilation." },
            { id: "isometries", title: "Isometries", summary: "Distance-preserving maps, composition, and why congruence is an isometry statement." },
            { id: "symmetry", title: "Symmetry", summary: "The symmetries of a figure form a group under composition." }
          ]
        },
        {
          id: "ch07",
          label: "7",
          title: "Area and Applications",
          file: "07-area.html",
          status: "full",
          blurb: "Area of rectangles, triangles, and disks; circumference; and the scaling law that ties them together.",
          sections: [
            { id: "polygons", title: "Area of rectangles and triangles", summary: "From the rectangle to the triangle by cutting and rearranging." },
            { id: "scaling", title: "Scaling", summary: "Scale lengths by r and area scales by r² — with the consequences." },
            { id: "disc", title: "Area of a disk", summary: "Inscribed polygons approaching πr², and what π is." },
            { id: "circumference", title: "Circumference of a circle", summary: "Why the same π appears in 2πr and πr²." },
            { id: "review", title: "Mixed review", summary: "Problems drawn back across Chapters 5–7, to test what stuck." }
          ]
        }
      ]
    },
    {
      id: "coordinates",
      num: "III",
      name: "Coordinate Geometry",
      dir: "3-coordinates",
      blurb:
        "Numbers and pictures joined: points as pairs, algebra on points, lines and circles as equations, and trigonometry.",
      chapters: [
        {
          id: "ch08",
          label: "8",
          title: "Coordinates and Geometry",
          file: "08-coordinates.html",
          status: "full",
          blurb: "The coordinate plane, the distance formula from the Pythagorean theorem, and the equation of a circle.",
          sections: [
            { id: "coord-systems", title: "Coordinate systems", summary: "Axes, ordered pairs, quadrants." },
            { id: "distance-formula", title: "Distance between points", summary: "The distance formula as the Pythagorean theorem in coordinates." },
            { id: "circle", title: "Equation of a circle", summary: "Center and radius read off from the equation, and completing the square again." },
            { id: "rational-points", title: "Rational points on a circle", summary: "Parametrizing the solutions of x² + y² = 1 in fractions." }
          ]
        },
        {
          id: "ch09",
          label: "9",
          title: "Operations on Points",
          file: "09-operations-on-points.html",
          status: "full",
          blurb: "Adding points, scaling them, and reflecting them — geometry done by arithmetic on coordinates.",
          sections: [
            { id: "dilations", title: "Dilations and reflections", summary: "Multiplying a point by a number; reflecting across the axes and through the origin." },
            { id: "addition-points", title: "Addition and the parallelogram law", summary: "Coordinatewise addition and the picture that explains it." },
            { id: "subtraction", title: "Subtraction and located vectors", summary: "Q − P as the arrow from P to Q." }
          ]
        },
        {
          id: "ch10",
          label: "10",
          title: "Segments, Rays, and Lines",
          file: "10-segments-rays-lines.html",
          status: "full",
          blurb: "Parametric descriptions of segments, rays, and lines, and how they relate to y = mx + b.",
          sections: [
            { id: "segments", title: "Segments", summary: "P + t(Q − P) for 0 ≤ t ≤ 1, and the midpoint." },
            { id: "rays", title: "Rays", summary: "Letting t run to infinity, and direction vectors." },
            { id: "lines", title: "Lines", summary: "Parametric form, slope, and parallel and perpendicular conditions." },
            { id: "line-equation", title: "The ordinary equation of a line", summary: "From parameters to ax + by = c and back." }
          ]
        },
        {
          id: "ch11",
          label: "11",
          title: "Trigonometry",
          file: "11-trigonometry.html",
          status: "full",
          blurb: "Sine and cosine from the unit circle, radian measure, graphs, the tangent, addition formulas, and rotations.",
          sections: [
            { id: "radians", title: "Radian measure", summary: "Angle as arc length on the unit circle." },
            { id: "sine-cosine", title: "Sine and cosine", summary: "Coordinates of a point on the unit circle; the Pythagorean identity." },
            { id: "graphs-trig", title: "The graphs", summary: "Period, amplitude, and shifts." },
            { id: "tangent", title: "The tangent", summary: "Slope of a ray, and where it fails to exist." },
            { id: "addition-formulas", title: "Addition formulas", summary: "cos(x + y) and sin(x + y), and the consequences." },
            { id: "rotations", title: "Rotations", summary: "Rotating a point by an angle, written as a pair of formulas." },
            { id: "review", title: "Mixed review", summary: "Problems drawn back across Chapters 8–11, to test what stuck." }
          ]
        }
      ]
    },
    {
      id: "topics",
      num: "IV",
      name: "Miscellaneous",
      dir: "4-topics",
      blurb:
        "Ideas that reach past this course: functions and mappings, complex numbers, induction, and determinants.",
      chapters: [
        {
          id: "ch12",
          label: "12",
          title: "Functions",
          file: "12-functions.html",
          status: "full",
          blurb: "What a function is, how to read a graph, and the exponential and logarithm.",
          sections: [
            { id: "definition-fn", title: "Definition of a function", summary: "A rule with a domain: one output per input." },
            { id: "polynomials", title: "Polynomial functions", summary: "Degree, roots, and factoring." },
            { id: "graphs-fn", title: "Graphs of functions", summary: "Reading and sketching; shifts, stretches, reflections." },
            { id: "exponential", title: "The exponential function", summary: "Extending aˣ to all real x, and its growth." },
            { id: "log", title: "Logarithms", summary: "The inverse of the exponential, and why it turns products into sums." }
          ]
        },
        {
          id: "ch13",
          label: "13",
          title: "Mappings",
          file: "13-mappings.html",
          status: "full",
          blurb: "Functions between arbitrary sets: composition, injectivity, surjectivity, inverses, and permutations.",
          sections: [
            { id: "definition-map", title: "Definition of a mapping", summary: "Domain, codomain, image." },
            { id: "formalism", title: "Composition and inverses", summary: "When a mapping can be undone." },
            { id: "permutations", title: "Permutations", summary: "Rearrangements of a finite set, composed and counted." }
          ]
        },
        {
          id: "ch14",
          label: "14",
          title: "Complex Numbers",
          file: "14-complex-numbers.html",
          status: "full",
          blurb: "Arithmetic with i, the complex plane, absolute value, and polar form where multiplication becomes rotation.",
          sections: [
            { id: "complex-arith", title: "Arithmetic of complex numbers", summary: "Adding and multiplying; the conjugate and the inverse." },
            { id: "complex-plane", title: "The complex plane", summary: "Complex numbers as points; absolute value as distance." },
            { id: "polar", title: "Polar form", summary: "r(cos θ + i sin θ), multiplication as rotate-and-scale, and roots of unity." }
          ]
        },
        {
          id: "ch15",
          label: "15",
          title: "Induction and Summations",
          file: "15-induction-and-summations.html",
          status: "full",
          blurb: "Proving infinitely many statements at once, sigma notation, and the geometric series.",
          sections: [
            { id: "induction", title: "Induction", summary: "Base case, inductive step, and the honest use of the hypothesis." },
            { id: "summations", title: "Summations", summary: "Sigma notation and the standard sums." },
            { id: "geometric", title: "Geometric series", summary: "The closed form for finite sums and what happens as n grows." }
          ]
        },
        {
          id: "ch16",
          label: "16",
          title: "Determinants",
          file: "16-determinants.html",
          status: "full",
          blurb: "Matrices, determinants of order 2 and 3, their properties, and Cramer's rule for linear systems.",
          sections: [
            { id: "matrices", title: "Matrices", summary: "Arrays of numbers, and the systems they encode." },
            { id: "det2", title: "Determinants of order 2", summary: "ad − bc as a signed area, and when it vanishes." },
            { id: "det3", title: "Determinants of order 3", summary: "Expansion along a row, with signs." },
            { id: "det-props", title: "Properties of determinants", summary: "Row operations, transposes, products." },
            { id: "cramer", title: "Cramer's rule", summary: "Solving a system by determinants, and the link back to Chapter 2." },
            { id: "review", title: "Mixed review", summary: "Problems drawn back across Chapters 12–16, to test what stuck." }
          ]
        }
      ]
    },
    {
      id: "packs",
      num: "V",
      name: "Skill packs",
      dir: "5-packs",
      beside: true,
      blurb:
        "Short units on what the gate tests ask and Lang's book leaves out: percent, data, chance, units, linear models, word problems. Use any of them, in any order, alongside the course.",
      chapters: [
        {
          id: "pk-percent",
          label: "A",
          title: "Ratios, Rates and Percent",
          file: "pk-percent.html",
          status: "full",
          course: "pre-algebra",
          blurb:
            "Comparing quantities by ratio and by rate, unit prices and speeds, proportions, percent and percent change, and repeated change: the arithmetic behind a large share of every gate exam.",
          sections: [
            { id: "ratios", title: "Ratios and rates", summary: "A ratio compares two quantities; a rate divides one by the other, and a unit rate settles which is the better buy." },
            { id: "proportions", title: "Proportions", summary: "Two equal ratios, solved by multiplying both sides by the denominators." },
            { id: "percent", title: "Percent of and percent change", summary: "A percent is a ratio per hundred; the part, the whole and the percent, and a change measured against the original, with its multiplier." },
            { id: "repeated", title: "Repeated change", summary: "The same percent applied again and again multiplies the multipliers: growth, decay, percents of percents and successive discounts." }
          ]
        },
        {
          id: "pk-data",
          label: "B",
          title: "Data and Statistics",
          file: "pk-data.html",
          status: "full",
          course: "pre-algebra",
          blurb:
            "Summarizing a list of numbers by its center and its spread, reading dot plots, histograms, box plots, two-way tables and scatterplots, using a line of fit, and judging what a sample and a claim can show.",
          sections: [
            { id: "center", title: "Center and spread", summary: "Mean, median and mode say where a list is centered; range, quartiles and the interquartile range say how far it spreads, and one extreme value moves the mean much further than the median." },
            { id: "displays", title: "Reading displays", summary: "A dot plot, a histogram, a box plot and a two-way table each show a list or a survey in a different way, and each answers some questions easily and others not at all." },
            { id: "scatter", title: "Scatterplots and lines of fit", summary: "A scatterplot shows two measurements for each individual; a given line of fit predicts one from the other, its slope is the change per one more x, a residual is actual minus predicted, and beyond the data the line is a guess." },
            { id: "samples", title: "Samples and claims", summary: "A random sample gives every member an equal chance and a convenience sample is biased; a sample proportion estimates a population count, larger samples vary less, and a sample cannot speak for another group or prove a cause." }
          ]
        },
        {
          id: "pk-chance",
          label: "C",
          title: "Chance and Counting",
          file: "pk-chance.html",
          status: "full",
          course: "pre-algebra",
          blurb:
            "Probability as a fraction of equally likely outcomes, the complement, experimental against theoretical probability and expected counts, compound events by a list, a table or a tree, two-way tables and conditional probability, and counting arrangements.",
          sections: [
            { id: "outcomes", title: "Probability as a fraction of outcomes", summary: "With equally likely outcomes, the probability of an event is the favorable outcomes over all outcomes, a number from 0 to 1; the complement is 1 minus it, trials estimate it, and the expected count is the probability times the number of trials." },
            { id: "compound", title: "Compound events", summary: "A two-step sample space is listed in order, in a table or in a tree; independent events multiply, an or adds and takes away the overlap once, and a draw without replacement changes the second fraction." },
            { id: "twoway", title: "Two-way tables and conditional probability", summary: "A probability read from a whole two-way table divides by the grand total, one read from a single row or column divides by that group's total and is conditional, P(A given B) is not P(B given A), and independence means the conditional equals the unconditional." },
            { id: "counting", title: "Counting arrangements", summary: "Choices multiply, n distinct items can be arranged in n! orders, k items chosen in order from n take the product of k falling factors, codes with and without repeats differ in what is used up, a probability is one over the arrangements, and counting groups where order does not matter divides out the orders." }
          ]
        },
        {
          id: "pk-units",
          label: "D",
          title: "Units and Measurement",
          file: "pk-units.html",
          status: "full",
          course: "pre-algebra",
          blurb:
            "Measurements as numbers with units, conversion factors that equal one, rates with their own units, area and volume units, and scale: converting inches to miles and hours to seconds, unit rates, distance, rate and time, converting a rate, square and cubic units, the cost of carpet, and scale drawings and maps.",
          sections: [
            { id: "convert", title: "Converting units", summary: "A measurement is a number with a unit; a conversion factor is a fraction equal to one with the unit you are leaving on the bottom, so it cancels; chains of factors join units with no direct fact, and a smaller unit needs a larger number." },
            { id: "rates", title: "Rates with units", summary: "A rate is a quotient of two measurements with a unit of its own; the unit rate is the rate per one; distance is rate times time with the units aligned, a rate converts by its top and bottom separately, and the units of an answer catch an upside-down setup." },
            { id: "area", title: "Area and volume units", summary: "A square foot holds 12 times 12 square inches, so the factor for an area is the length factor squared and for a volume cubed; a milliliter is a cubic centimeter, and a price per square foot times the area gives the cost." },
            { id: "scale", title: "Scale", summary: "A scale such as 1 inch = 50 miles is a conversion factor between the drawing and the world, a ratio such as 1 : 200 multiplies a drawn length by 200 in any unit, and a scale factor k multiplies lengths by k and areas by k squared." }
          ]
        },
        {
          id: "pk-linear",
          label: "E",
          title: "Linear Models and Inequalities",
          file: "pk-linear.html",
          status: "full",
          course: "algebra-1",
          blurb:
            "Slope as a rate of change, writing a linear model from a story, two points or a table, inequalities in one and in two unknowns, and systems of inequalities: reading what the slope and the starting value mean, predicting, and answering when a quantity reaches a target.",
          sections: [
            { id: "slope", title: "Slope as a rate of change", summary: "The slope of a line is the change in y over the change in x and the same between any two points; it means how much y changes for one more x, with units, its sign says rising, falling or flat, and in y = mx + b the slope is the rate and b the starting value." },
            { id: "model", title: "Writing a linear model", summary: "A starting value and a constant rate make y = mx + b; write it from a story, from two points (the slope first, then b from one point) or from a table, check it at a point not used, predict with it, solve mx + b = T for when, and say where the model stops making sense." },
            { id: "ineq1", title: "Inequalities in one unknown", summary: "An inequality describes a set of numbers, and dividing by a negative number turns the sign around, so solve ax + b ≤ c, write the solution as x ≥ k, and find the least or greatest whole number that works." },
            { id: "ineq2", title: "Inequalities in two unknowns and systems", summary: "The line y = mx + b is the boundary and one side of it is the solution set of y > mx + b; a test point such as (0, 0) settles the side, the boundary belongs to the set for ≤ and ≥ and not for < and >, and a system is the overlap, with its corner found by solving the two boundary equations." }
          ]
        },
        {
          id: "pk-words",
          label: "F",
          title: "Word Problems",
          file: "pk-words.html",
          status: "full",
          course: "algebra-1",
          blurb:
            "Turning a story into an equation: naming the unknown, writing every other quantity in terms of it, one equation for each fact, and then distance, rate and time, where d = rt gives one row per mover. Later sections take up work, mixtures and checking.",
          sections: [
            { id: "name", title: "Naming the unknown", summary: "Name one unknown with its unit, write every other quantity in terms of it, write one equation for each fact, solve, and answer the question asked with its units; phrases such as 5 less than twice a number, ages and consecutive integers become expressions." },
            { id: "drt", title: "Distance, rate and time", summary: "Distance is rate times time, so each mover gets a row of rate, time and distance and one sentence ties the rows: toward each other the distances add to the gap, in a catch-up they are equal, on a round trip they are equal and the times add; an average speed is total distance over total time." }
          ]
        }
      ]
    }
  ]
};

/* Flat chapter list in reading order, with part back-references and relative paths. */
(function () {
  var c = window.BM_CURRICULUM;
  var flat = [];
  c.parts.forEach(function (part) {
    part.chapters.forEach(function (ch) {
      ch.part = part;
      ch.path = "parts/" + part.dir + "/" + ch.file;
      flat.push(ch);
    });
  });
  c.chapters = flat;
  /* the course's own reading order: a Part marked beside (the skill packs) sits next to
     the course, so "next chapter" and "the whole course" never walk into it */
  c.courseChapters = flat.filter(function (ch) { return !ch.part.beside; });
  c.chapterById = function (id) {
    return flat.filter(function (ch) { return ch.id === id; })[0] || null;
  };
})();
