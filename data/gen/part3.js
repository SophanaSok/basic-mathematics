/* data/gen/part3.js — Arena generators for Part III: Chapters 8–11.
   Points are typed as (x,y), as in the practice sets; radians as multiples of pi;
   exact trigonometric values with sqrt, e.g. sqrt(3)/2. */
(function () {
  "use strict";
  var G = window.BMGen;
  if (!G) return;
  var u = G.u, par = u.par, poly = u.poly, shift = u.shift, pt = u.ptTex, ptAns = u.ptAns;

  var TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]];

  /* ------------------------------------------------------- Chapter 8 ---- */

  G.add({
    id: "dist-points", section: "ch08#distance-formula", par: 60, timed: true,
    make: function (r) {
      var t = r.pick(TRIPLES), k = t[2] === 5 ? r.int(1, 4) : 1, dx = t[0] * k, dy = t[1] * k, d = t[2] * k;
      if (r.chance(0.5)) { var s = dx; dx = dy; dy = s; }
      if (r.chance(0.5)) dx = -dx;
      if (r.chance(0.5)) dy = -dy;
      var P = [r.int(-8, 8), r.int(-8, 8)], Q = [P[0] + dx, P[1] + dy];
      return {
        q: "What is the distance between $" + pt(P[0], P[1]) + "$ and $" + pt(Q[0], Q[1]) + "$?",
        type: "number", answer: String(d),
        hint: "The horizontal and vertical differences are the legs of a right triangle.",
        steps: [
          "$\\Delta x = " + Q[0] + " - " + par(P[0]) + " = " + dx + "$ and $\\Delta y = " + Q[1] + " - " + par(P[1]) + " = " + dy + "$.",
          "$d = \\sqrt{" + par(dx) + "^2 + " + par(dy) + "^2} = \\sqrt{" + dx * dx + " + " + dy * dy + "} = \\sqrt{" + d * d + "} = " + d + "$."
        ],
        verify: function () { return Math.abs(Math.sqrt(Math.pow(Q[0] - P[0], 2) + Math.pow(Q[1] - P[1], 2)) - d) < 1e-9; }
      };
    }
  });

  G.add({
    id: "circle-read", section: "ch08#circle", par: 75, timed: true,
    make: function (r) {
      var h = r.int(-6, 6), k = r.int(-6, 6), rad = r.int(1, 9);
      if (h === 0 && k === 0) h = r.nonzero(-6, 6);
      var D = -2 * h, E = -2 * k, F = h * h + k * k - rad * rad, askR = r.chance(0.6);
      var eq = poly([[1, "x^2"], [1, "y^2"], [D, "x"], [E, "y"], [F, ""]]) + " = 0";
      var steps = [
        "Group the $x$ terms and the $y$ terms: $(" + poly([[1, "x^2"], [D, "x"]]) + ") + (" + poly([[1, "y^2"], [E, "y"]]) + ") = " + -F + "$.",
        "Complete each square: $(" + shift("x", -h) + ")^2 - " + h * h + " + (" + shift("y", -k) + ")^2 - " + k * k + " = " + -F + "$.",
        "So $(" + shift("x", -h) + ")^2 + (" + shift("y", -k) + ")^2 = " + rad * rad + "$: center $" + pt(h, k) + "$, radius $\\sqrt{" + rad * rad + "} = " + rad + "$."
      ];
      return {
        q: "The equation $" + eq + "$ describes a circle. What is its " + (askR ? "radius" : "center") + "?",
        type: askR ? "number" : "exact", answer: askR ? String(rad) : ptAns(h, k),
        placeholder: askR ? "" : "e.g. (3,-2)",
        hint: "Complete the square in x and in y separately, then compare with the center–radius form.",
        steps: steps,
        verify: function () {
          /* the point one radius to the right of the centre lies on the circle, and so does the one above it */
          function on(x, y) { return x * x + y * y + D * x + E * y + F === 0; }
          return on(h + rad, k) && on(h, k + rad) && !on(h, k);
        }
      };
    }
  });

  G.add({
    id: "quadrant", section: "ch08#coord-systems", par: 30, timed: false,
    make: function (r) {
      var x = r.nonzero(-9, 9), y = r.nonzero(-9, 9);
      var n = x > 0 ? (y > 0 ? 1 : 4) : (y > 0 ? 2 : 3);
      var roman = ["", "i", "ii", "iii", "iv"][n];
      var words = ["", "first", "second", "third", "fourth"][n];
      return {
        q: "In which quadrant does the point $" + pt(x, y) + "$ lie? Answer $1$, $2$, $3$ or $4$.",
        type: "exact", answer: n + "|" + roman,
        placeholder: "1, 2, 3 or 4",
        hint: "Look at the sign of each coordinate; the quadrants are numbered counterclockwise from the one where both are positive.",
        steps: [
          "$x = " + x + "$ is " + (x > 0 ? "positive (right of the $y$-axis)" : "negative (left of the $y$-axis)") + " and $y = " + y + "$ is " + (y > 0 ? "positive (above the $x$-axis)" : "negative (below the $x$-axis)") + ".",
          "That is the " + words + " quadrant: $" + n + "$."
        ],
        verify: function () {
          var angle = Math.atan2(y, x);
          if (angle < 0) angle += 2 * Math.PI;
          return Math.floor(angle / (Math.PI / 2)) + 1 === n;
        }
      };
    }
  });

  /* ------------------------------------------------------- Chapter 9 ---- */

  G.add({
    id: "point-scale", section: "ch09#dilations", par: 35, timed: true,
    make: function (r) {
      var P = [r.nonzero(-9, 9), r.nonzero(-9, 9)], c = r.pick([-3, -2, -1, 2, 3, 4]);
      var Q = [c * P[0], c * P[1]];
      var name = c === -1 ? "-P" : c + "P";
      return {
        q: "With $P = " + pt(P[0], P[1]) + "$, compute $" + name + "$.",
        type: "exact", answer: ptAns(Q[0], Q[1]),
        placeholder: "e.g. (3,-2)",
        hint: "Multiplying a point by a number multiplies each coordinate.",
        steps: [
          "$" + name + " = (" + c + " \\cdot " + par(P[0]) + ",\\; " + c + " \\cdot " + par(P[1]) + ")$.",
          "$= " + pt(Q[0], Q[1]) + "$" + (c === -1 ? ", the reflection of $P$ through the origin." : ".")
        ],
        verify: function () { return Q[0] / c === P[0] && Q[1] / c === P[1]; }
      };
    }
  });

  G.add({
    id: "point-sum", section: "ch09#addition-points", par: 45, timed: true,
    make: function (r) {
      var kind = r.pick(["sum", "mid", "end"]);
      var P = [r.int(-8, 8), r.int(-8, 8)], Q = [r.int(-8, 8), r.int(-8, 8)];
      if (kind === "sum") {
        var S = [P[0] + Q[0], P[1] + Q[1]];
        return {
          q: "Compute $" + pt(P[0], P[1]) + " + " + pt(Q[0], Q[1]) + "$.",
          type: "exact", answer: ptAns(S[0], S[1]),
          placeholder: "e.g. (3,-2)",
          hint: "Points add coordinate by coordinate.",
          steps: ["Add the first coordinates and the second coordinates: $(" + P[0] + " + " + par(Q[0]) + ",\\; " + P[1] + " + " + par(Q[1]) + ")$.", "$= " + pt(S[0], S[1]) + "$."],
          verify: function () { return S[0] - Q[0] === P[0] && S[1] - Q[1] === P[1]; }
        };
      }
      /* make the midpoint whole: both coordinate sums even */
      if ((P[0] + Q[0]) % 2) Q[0]++;
      if ((P[1] + Q[1]) % 2) Q[1]++;
      /* a segment needs two distinct points (§10.1); moving by 2 keeps the sum even */
      if (Q[0] === P[0] && Q[1] === P[1]) Q[0] += 2;
      var M = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2];
      if (kind === "mid") {
        return {
          q: "What is the midpoint of the segment from $" + pt(P[0], P[1]) + "$ to $" + pt(Q[0], Q[1]) + "$?",
          type: "exact", answer: ptAns(M[0], M[1]),
          placeholder: "e.g. (3,-2)",
          hint: "The midpoint is half of the sum of the two endpoints.",
          steps: ["$M = \\tfrac12 (P + Q) = \\tfrac12 " + pt(P[0] + Q[0], P[1] + Q[1]) + "$.", "$= " + pt(M[0], M[1]) + "$."],
          verify: function () { return 2 * M[0] - P[0] === Q[0] && 2 * M[1] - P[1] === Q[1]; }
        };
      }
      return {
        q: "The midpoint of the segment from $P = " + pt(P[0], P[1]) + "$ to $Q$ is $" + pt(M[0], M[1]) + "$. What is $Q$?",
        type: "exact", answer: ptAns(Q[0], Q[1]),
        placeholder: "e.g. (3,-2)",
        hint: "Write the midpoint as half of P + Q, then solve for Q.",
        steps: [
          "$M = \\tfrac12 (P + Q)$, so $Q = 2M - P$.",
          "$2M = " + pt(2 * M[0], 2 * M[1]) + "$, and $Q = (" + 2 * M[0] + " - " + par(P[0]) + ",\\; " + 2 * M[1] + " - " + par(P[1]) + ") = " + pt(Q[0], Q[1]) + "$."
        ],
        verify: function () { return (P[0] + Q[0]) / 2 === M[0] && (P[1] + Q[1]) / 2 === M[1]; }
      };
    }
  });

  G.add({
    id: "point-diff", section: "ch09#subtraction", par: 40, timed: true,
    make: function (r) {
      var P = [r.int(-8, 8), r.int(-8, 8)], Q = [r.int(-8, 8), r.int(-8, 8)];
      if (P[0] === Q[0] && P[1] === Q[1]) Q[0] += 3;
      var V = [Q[0] - P[0], Q[1] - P[1]];
      if (r.chance(0.5)) {
        return {
          q: "With $P = " + pt(P[0], P[1]) + "$ and $Q = " + pt(Q[0], Q[1]) + "$, compute $Q - P$.",
          type: "exact", answer: ptAns(V[0], V[1]),
          placeholder: "e.g. (3,-2)",
          hint: "Subtract P's coordinates from Q's, one coordinate at a time.",
          steps: ["$Q - P = (" + Q[0] + " - " + par(P[0]) + ",\\; " + Q[1] + " - " + par(P[1]) + ")$.", "$= " + pt(V[0], V[1]) + "$."],
          verify: function () { return P[0] + V[0] === Q[0] && P[1] + V[1] === Q[1]; }
        };
      }
      var R = [r.int(-6, 6), r.int(-6, 6)], E = [R[0] + V[0], R[1] + V[1]];
      return {
        q: "The located vector from $P = " + pt(P[0], P[1]) + "$ to $Q = " + pt(Q[0], Q[1]) + "$ is moved, without turning, so that it starts at $" + pt(R[0], R[1]) + "$. Where does it end?",
        type: "exact", answer: ptAns(E[0], E[1]),
        placeholder: "e.g. (3,-2)",
        hint: "An equivalent located vector has the same displacement Q − P.",
        steps: [
          "The displacement is $Q - P = " + pt(V[0], V[1]) + "$.",
          "Start at $" + pt(R[0], R[1]) + "$ and add it: $" + pt(R[0], R[1]) + " + " + pt(V[0], V[1]) + " = " + pt(E[0], E[1]) + "$."
        ],
        verify: function () { return E[0] - R[0] === Q[0] - P[0] && E[1] - R[1] === Q[1] - P[1]; }
      };
    }
  });

  /* ------------------------------------------------------ Chapter 10 ---- */

  G.add({
    id: "slope-two", section: "ch10#line-equation", par: 40, timed: true,
    make: function (r) {
      var P = [r.int(-7, 7), r.int(-7, 7)], dx = r.nonzero(-6, 6), dy = r.int(-9, 9);
      var Q = [P[0] + dx, P[1] + dy];
      return {
        q: "What is the slope of the line through $" + pt(P[0], P[1]) + "$ and $" + pt(Q[0], Q[1]) + "$?",
        type: "fraction", answer: u.fracAns(dy, dx),
        placeholder: "e.g. 3/2",
        hint: "Slope is the change in y divided by the change in x, taken in the same order.",
        steps: [
          "$m = \\dfrac{y_2 - y_1}{x_2 - x_1} = \\dfrac{" + Q[1] + " - " + par(P[1]) + "}{" + Q[0] + " - " + par(P[0]) + "} = \\dfrac{" + dy + "}{" + dx + "}$.",
          "$m = " + u.fracTex(dy, dx) + "$."
        ],
        verify: function () { return Math.abs((P[1] - Q[1]) / (P[0] - Q[0]) - dy / dx) < 1e-12; }
      };
    }
  });

  G.add({
    id: "perp-slope", section: "ch10#lines", par: 35, timed: true,
    make: function (r) {
      var m = r.pick([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [1, 2], [1, 3], [2, 3], [3, 4], [3, 2], [4, 3], [5, 2]]);
      var sign = r.chance(0.5) ? -1 : 1, mn = sign * m[0], md = m[1];
      return {
        q: "A line has slope $" + u.fracTex(mn, md) + "$. What is the slope of every line perpendicular to it?",
        type: "fraction", answer: u.fracAns(-md, mn),
        placeholder: "e.g. -1/2",
        hint: "Perpendicular slopes multiply to −1.",
        steps: [
          "If $m m' = -1$ then $m' = -\\dfrac{1}{m}$.",
          "$m' = -\\dfrac{1}{" + u.fracTex(mn, md) + "} = " + u.fracTex(-md, mn) + "$."
        ],
        verify: function () { return Math.abs((mn / md) * (-md / mn) + 1) < 1e-12; }
      };
    }
  });

  /* "y=3x-5", with "y=-5+3x", "3x-5" and the literal "y=1x+0" also accepted, as in the practice set */
  var lineAns = u.lineAns;

  G.add({
    id: "line-through", section: "ch10#line-equation", par: 60, timed: true,
    make: function (r) {
      var m = r.nonzero(-4, 4), b = r.int(-9, 9), x1 = r.int(-5, 5), x2 = r.int(-5, 5);
      if (x2 === x1) x2 = x1 + r.pick([1, 2, 3]);
      var y1 = m * x1 + b, y2 = m * x2 + b;
      return {
        q: "Find the equation of the line through $" + pt(x1, y1) + "$ and $" + pt(x2, y2) + "$, in the form $y = mx + b$.",
        type: "exact", answer: lineAns(m, b),
        placeholder: "e.g. y=2x+1",
        hint: "Find the slope first; then make the line pass through one of the points.",
        steps: [
          "$m = \\dfrac{" + y2 + " - " + par(y1) + "}{" + x2 + " - " + par(x1) + "} = \\dfrac{" + (y2 - y1) + "}{" + (x2 - x1) + "} = " + m + "$.",
          "Put $" + pt(x1, y1) + "$ into $y = " + poly([[m, "x"]]) + " + b$: $" + y1 + " = " + m * x1 + " + b$, so $b = " + b + "$.",
          "The line is $y = " + poly([[m, "x"], [b, ""]]) + "$. Check with the other point: $" + m + " \\cdot " + par(x2) + " " + (b < 0 ? "- " + -b : "+ " + b) + " = " + y2 + "$ ✓."
        ],
        verify: function () { return m * x1 + b === y1 && m * x2 + b === y2 && (y2 - y1) / (x2 - x1) === m; }
      };
    }
  });

  G.add({
    id: "seg-point", section: "ch10#segments", par: 50, timed: true,
    make: function (r) {
      var t = r.pick([[1, 2], [1, 3], [2, 3], [1, 4], [3, 4]]), n = t[0], d = t[1];
      var P = [r.int(-6, 6), r.int(-6, 6)], uu = r.int(-4, 4), vv = r.int(-4, 4);
      if (uu === 0 && vv === 0) uu = 2;
      var V = [uu * d, vv * d], Q = [P[0] + V[0], P[1] + V[1]], X = [P[0] + uu * n, P[1] + vv * n];
      var word = { "1/2": "halfway", "1/3": "one third of the way", "2/3": "two thirds of the way", "1/4": "one quarter of the way", "3/4": "three quarters of the way" }[n + "/" + d];
      return {
        q: "Which point is " + word + " from $P = " + pt(P[0], P[1]) + "$ to $Q = " + pt(Q[0], Q[1]) + "$?",
        type: "exact", answer: ptAns(X[0], X[1]),
        placeholder: "e.g. (3,-2)",
        hint: "Turn the fraction of the way into a value of t in P + t(Q − P).",
        steps: [
          "The point is $P + t(Q - P)$ with $t = \\tfrac{" + n + "}{" + d + "}$.",
          "$Q - P = " + pt(V[0], V[1]) + "$, and $\\tfrac{" + n + "}{" + d + "}" + pt(V[0], V[1]) + " = " + pt(uu * n, vv * n) + "$.",
          "$P + " + pt(uu * n, vv * n) + " = " + pt(X[0], X[1]) + "$."
        ],
        verify: function () {
          /* (1 - t)P + tQ, the other way of writing the same point */
          return Math.abs((1 - n / d) * P[0] + (n / d) * Q[0] - X[0]) < 1e-9 && Math.abs((1 - n / d) * P[1] + (n / d) * Q[1] - X[1]) < 1e-9;
        }
      };
    }
  });

  /* ------------------------------------------------------ Chapter 11 ---- */

  G.add({
    id: "deg-rad", section: "ch11#radians", par: 40, timed: true,
    make: function (r) {
      var deg = r.pick([30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330, 360, 15, 75]);
      /* π itself would make either hint say the answer */
      if (deg === 180) deg = 135;
      if (r.chance(0.5)) {
        return {
          q: "Convert $" + deg + "°$ to radians. Give the exact value as a multiple of $\\pi$.",
          type: "expr", answer: u.piAns(deg, 180),
          placeholder: "e.g. pi/6",
          hint: "A half turn is 180° and also π radians; scale from there.",
          steps: ["Multiply by $\\dfrac{\\pi}{180}$: $" + deg + " \\cdot \\dfrac{\\pi}{180} = \\dfrac{" + deg + "}{180}\\pi$.", "In lowest terms: $" + u.piTex(deg, 180) + "$."],
          verify: function () { var f = u.reduce(deg, 180); return Math.abs(deg * Math.PI / 180 - f.n * Math.PI / f.d) < 1e-12; }
        };
      }
      return {
        q: "Convert $" + u.piTex(deg, 180) + "$ radians to degrees.",
        type: "number", answer: String(deg),
        hint: "π radians is a half turn; multiply by 180/π.",
        steps: ["Multiply by $\\dfrac{180}{\\pi}$: $" + u.piTex(deg, 180) + " \\cdot \\dfrac{180}{\\pi}$.", "$= " + deg + "°$."],
        verify: function () { var f = u.reduce(deg, 180); return Math.abs((f.n * Math.PI / f.d) * 180 / Math.PI - deg) < 1e-9; }
      };
    }
  });

  /* the table of §11.2 */
  var ROOT3 = u.halfRootAns(3);
  var ROOT2 = u.halfRootAns(2);
  var TRIG = [
    { k: 0, d: 1, deg: 0, cos: ["1", "number", 1], sin: ["0", "number", 0], why: "The angle $0$ leaves the point at $(1, 0)$." },
    { k: 1, d: 6, deg: 30, cos: [ROOT3, "expr", Math.sqrt(3) / 2, "\\frac{\\sqrt3}{2}"], sin: ["1/2", "number", 0.5, "\\frac12"], why: "Half an equilateral triangle with hypotenuse $1$ has legs $\\frac12$ (opposite $30°$) and $\\frac{\\sqrt3}{2}$." },
    { k: 1, d: 4, deg: 45, cos: [ROOT2, "expr", Math.sqrt(2) / 2, "\\frac{\\sqrt2}{2}"], sin: [ROOT2, "expr", Math.sqrt(2) / 2, "\\frac{\\sqrt2}{2}"], why: "Half a square with hypotenuse $1$ has two equal legs $\\frac{1}{\\sqrt2} = \\frac{\\sqrt2}{2}$." },
    { k: 1, d: 3, deg: 60, cos: ["1/2", "number", 0.5, "\\frac12"], sin: [ROOT3, "expr", Math.sqrt(3) / 2, "\\frac{\\sqrt3}{2}"], why: "Half an equilateral triangle with hypotenuse $1$ has legs $\\frac12$ (next to $60°$) and $\\frac{\\sqrt3}{2}$." },
    { k: 1, d: 2, deg: 90, cos: ["0", "number", 0], sin: ["1", "number", 1], why: "A quarter turn from $(1, 0)$ lands on $(0, 1)$." },
    { k: 1, d: 1, deg: 180, cos: ["-1", "number", -1], sin: ["0", "number", 0], why: "A half turn from $(1, 0)$ lands on $(-1, 0)$." },
    { k: 3, d: 2, deg: 270, cos: ["0", "number", 0], sin: ["-1", "number", -1], why: "Three quarter turns from $(1, 0)$ land on $(0, -1)$." }
  ];

  G.add({
    id: "trig-exact", section: "ch11#sine-cosine", par: 45, timed: false,
    make: function (r) {
      /* the three triangle angles come up twice as often as the axis points */
      var row = TRIG[r.pick([1, 1, 2, 2, 3, 3, 0, 4, 5, 6])], fn = r.chance(0.5) ? "cos" : "sin", v = row[fn];
      var inDeg = r.chance(0.4), angle = inDeg ? row.deg + "°" : u.piTex(row.k, row.d);
      var shown = v[3] || v[0];
      return {
        q: "What is the exact value of $\\" + fn + " " + angle + "$?",
        type: v[1], answer: v[0],
        placeholder: "exact, e.g. sqrt(5)/3",
        hint: "Place the angle on the unit circle: cosine is the horizontal coordinate, sine the vertical one.",
        steps: [
          row.why,
          "So the point on the unit circle is $(\\cos\\theta, \\sin\\theta) = \\left(" + (row.cos[3] || row.cos[0]) + ", " + (row.sin[3] || row.sin[0]) + "\\right)$, and $\\" + fn + " " + angle + " = " + shown + "$."
        ],
        verify: function () {
          var theta = row.deg * Math.PI / 180, exact = fn === "cos" ? Math.cos(theta) : Math.sin(theta);
          return Math.abs(exact - v[2]) < 1e-9 && Math.abs(row.k * Math.PI / row.d - theta) < 1e-12;
        }
      };
    }
  });

  G.add({
    id: "rotate-point", section: "ch11#rotations", par: 50, timed: true,
    make: function (r) {
      var P = [r.nonzero(-8, 8), r.nonzero(-8, 8)], deg = r.pick([90, 180, 270]);
      var c = { 90: 0, 180: -1, 270: 0 }[deg], s = { 90: 1, 180: 0, 270: -1 }[deg];
      var X = [P[0] * c - P[1] * s, P[0] * s + P[1] * c];
      return {
        q: "Rotate the point $" + pt(P[0], P[1]) + "$ counterclockwise by $" + deg + "°$ about the origin. Where does it land?",
        type: "exact", answer: ptAns(X[0], X[1]),
        placeholder: "e.g. (3,-2)",
        hint: "Use the rotation formula with the cosine and sine of the angle.",
        steps: [
          "The rotation by $\\theta$ sends $(x, y)$ to $(x\\cos\\theta - y\\sin\\theta,\\; x\\sin\\theta + y\\cos\\theta)$; here $\\cos " + deg + "° = " + c + "$ and $\\sin " + deg + "° = " + s + "$.",
          "$(" + P[0] + " \\cdot " + par(c) + " - " + par(P[1]) + " \\cdot " + par(s) + ",\\; " + P[0] + " \\cdot " + par(s) + " + " + par(P[1]) + " \\cdot " + par(c) + ") = " + pt(X[0], X[1]) + "$."
        ],
        verify: function () {
          var t = deg * Math.PI / 180;
          return Math.abs(P[0] * Math.cos(t) - P[1] * Math.sin(t) - X[0]) < 1e-9 && Math.abs(P[0] * Math.sin(t) + P[1] * Math.cos(t) - X[1]) < 1e-9;
        }
      };
    }
  });
})();
