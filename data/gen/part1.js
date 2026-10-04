/* data/gen/part1.js — Arena generators for Part I: Chapters 1–4 and the Interlude.
   Each problem uses only what its section has established by then. Hints name the
   next idea, never the numbers; steps are the worked solution; verify() recomputes
   the answer by a different route (usually substituting it back). */
(function () {
  "use strict";
  var G = window.BMGen;
  if (!G) return;
  var u = G.u, par = u.par, poly = u.poly, shift = u.shift, fracAns = u.fracAns, fracTex = u.fracTex;

  /* ------------------------------------------------------- Chapter 1 ---- */

  G.add({
    id: "int-subtract", section: "ch01#addition", par: 30, timed: true,
    make: function (r) {
      var a = r.nonzero(-20, 20), b = -r.int(2, 15), c = r.nonzero(-12, 12);
      var plus = r.chance(0.5);
      var t2 = -b, t3 = plus ? c : -c, mid = a + t2, value = mid + t3;
      return {
        q: "Compute $" + a + " - " + par(b) + " " + (plus ? "+" : "-") + " " + par(c) + "$.",
        type: "number", answer: String(value),
        hint: "Subtracting a number is adding its opposite. Rewrite every subtraction as an addition first.",
        steps: [
          "Rewrite each subtraction as adding the opposite: $" + a + " + " + par(t2) + " + " + par(t3) + "$.",
          "Add from left to right: $" + a + " + " + par(t2) + " = " + mid + "$, then $" + mid + " + " + par(t3) + " = " + value + "$.",
          "So the value is $" + value + "$."
        ],
        verify: function () { return a - b + (plus ? c : -c) === value; }
      };
    }
  });

  G.add({
    id: "int-product", section: "ch01#multiplication", par: 30, timed: true,
    make: function (r) {
      var n = r.int(3, 4), f = [], i, negs = 0, size = 1;
      for (i = 0; i < n; i++) {
        var v = r.nonzero(-6, 6);
        if (v === 1) v = -1;
        f.push(v);
      }
      if (f.every(function (v) { return v > 0; })) f[r.int(0, n - 1)] *= -1;
      f.forEach(function (v) { if (v < 0) negs++; size *= Math.abs(v); });
      var value = negs % 2 ? -size : size;
      return {
        q: "Compute $" + f.map(function (v) { return "(" + v + ")"; }).join("") + "$.",
        type: "number", answer: String(value),
        hint: "Settle the sign first by counting the minus signs; then multiply the sizes.",
        steps: [
          "There " + (negs === 1 ? "is $1$ negative factor" : "are $" + negs + "$ negative factors") + ". Each one flips the sign, so the product is " + (negs % 2 ? "negative" : "positive") + ".",
          "Multiply the sizes: $" + f.map(function (v) { return Math.abs(v); }).join(" \\cdot ") + " = " + size + "$.",
          "So the product is $" + value + "$."
        ],
        verify: function () { return f.reduce(function (p, v) { return p * v; }, 1) === value; }
      };
    }
  });

  G.add({
    id: "frac-sum", section: "ch01#rationals", par: 60, timed: true,
    make: function (r) {
      var dens = [2, 3, 4, 5, 6, 8, 9, 10, 12], b, d, L, guard = 0;
      do { b = r.pick(dens); d = r.pick(dens); L = u.lcm(b, d); } while ((b === d || L > 36) && guard++ < 40);
      var a = r.int(1, 2 * b - 1), c = r.int(1, 2 * d - 1), plus = r.chance(0.6);
      if (u.gcd(a, b) !== 1) a = 1;
      if (u.gcd(c, d) !== 1) c = 1;
      var top = a * (L / b) + (plus ? 1 : -1) * c * (L / d);
      if (top === 0) { plus = true; top = a * (L / b) + c * (L / d); }
      var red = u.reduce(top, L);
      return {
        q: "Compute $\\dfrac{" + a + "}{" + b + "} " + (plus ? "+" : "-") + " \\dfrac{" + c + "}{" + d + "}$ and give the answer in lowest terms.",
        type: "fraction", answer: fracAns(top, L),
        placeholder: "e.g. 7/12",
        hint: "Rewrite both fractions over a common denominator before adding or subtracting anything.",
        steps: [
          "The smallest common denominator of $" + b + "$ and $" + d + "$ is $" + L + "$.",
          "$\\dfrac{" + a + "}{" + b + "} = \\dfrac{" + a * (L / b) + "}{" + L + "}$ and $\\dfrac{" + c + "}{" + d + "} = \\dfrac{" + c * (L / d) + "}{" + L + "}$.",
          "Combine the numerators: $\\dfrac{" + a * (L / b) + " " + (plus ? "+" : "-") + " " + c * (L / d) + "}{" + L + "} = \\dfrac{" + top + "}{" + L + "}$.",
          red.d === L ? "This is already in lowest terms." : "Divide top and bottom by $" + u.gcd(top, L) + "$: the answer is $" + fracTex(top, L) + "$."
        ],
        verify: function () {
          /* cross-multiply: answer = (ad ± cb) / bd */
          return red.n * b * d === red.d * (a * d + (plus ? 1 : -1) * c * b) && u.gcd(red.n, red.d) === 1;
        }
      };
    }
  });

  G.add({
    id: "frac-divide", section: "ch01#inverses", par: 45, timed: true,
    make: function (r) {
      var a, b, c, d, guard = 0;
      do { a = r.int(1, 9); b = r.int(2, 9); } while (u.gcd(a, b) !== 1 && guard++ < 30);
      guard = 0;
      do { c = r.int(1, 9); d = r.int(2, 9); } while ((u.gcd(c, d) !== 1 || (c === a && d === b)) && guard++ < 30);
      var neg = r.chance(0.3) ? -1 : 1;
      var top = neg * a * d, bottom = b * c;
      return {
        q: "Compute $" + (neg < 0 ? "-" : "") + "\\dfrac{" + a + "}{" + b + "} \\div \\dfrac{" + c + "}{" + d + "}$. Give the answer in lowest terms.",
        type: "fraction", answer: fracAns(top, bottom),
        placeholder: "e.g. 5/6",
        hint: "Dividing by a number is multiplying by its inverse.",
        steps: [
          "The inverse of $\\dfrac{" + c + "}{" + d + "}$ is $\\dfrac{" + d + "}{" + c + "}$, so the quotient is $" + (neg < 0 ? "-" : "") + "\\dfrac{" + a + "}{" + b + "} \\cdot \\dfrac{" + d + "}{" + c + "}$.",
          "Multiply tops and bottoms: $" + (neg < 0 ? "-" : "") + "\\dfrac{" + a * d + "}{" + bottom + "}$.",
          "In lowest terms: $" + fracTex(top, bottom) + "$."
        ],
        verify: function () {
          /* multiply back: answer · c/d should be ±a/b */
          var f = u.reduce(top, bottom);
          return f.n * c * b === neg * a * f.d * d;
        }
      };
    }
  });

  /* ------------------------------------------------------- Chapter 2 ---- */

  /* "+ 5" or "- 5": a constant written after another term */
  function signed(n) { return n < 0 ? "- " + -n : "+ " + n; }

  /* "Subtract 3x from both sides" or "Add 3x to both sides", whichever is honest */
  function move(coef, v) {
    var t = poly([[Math.abs(coef), v]]);
    return coef > 0 ? "Subtract $" + t + "$ from both sides" : "Add $" + t + "$ to both sides";
  }

  G.add({
    id: "lin-collect", section: "ch02#one-unknown", par: 45, timed: true,
    make: function (r) {
      var x = r.int(-9, 9), a = r.nonzero(-9, 9), c = r.nonzero(-9, 9), b = r.int(-15, 15), guard = 0;
      while (c === a && guard++ < 20) c = r.nonzero(-9, 9);
      if (c === a) c = a + 1 || 2;
      var d = a * x + b - c * x, k = a - c;
      var steps = [
        move(c, "x") + ": $" + poly([[k, "x"], [b, ""]]) + " = " + d + "$."
      ];
      if (b !== 0) steps.push(move(b, "") + ": $" + poly([[k, "x"]]) + " = " + (d - b) + "$.");
      if (k !== 1) steps.push("Divide both sides by $" + k + "$: $x = " + x + "$.");
      steps.push("Check: the left side is $" + (a * x + b) + "$ and the right side is $" + (c * x + d) + "$ ✓.");
      return {
        q: "Solve $" + poly([[a, "x"], [b, ""]]) + " = " + poly([[c, "x"], [d, ""]]) + "$ for $x$.",
        type: "number", answer: String(x),
        hint: "Collect the terms in x on one side and the constants on the other.",
        steps: steps,
        verify: function () { return a * x + b === c * x + d && (d - b) / k === x; }
      };
    }
  });

  G.add({
    id: "lin-brackets", section: "ch02#one-unknown", par: 60, timed: true,
    make: function (r) {
      var p = r.int(2, 6), q = r.nonzero(-6, 6), s = r.nonzero(-6, 6), x = r.int(-8, 8), guard = 0;
      while (s === p && guard++ < 20) s = r.nonzero(-6, 6);
      if (s === p) s = -p;
      var t = p * (x + q) - s * x, k = p - s, rhs = t - p * q;
      var steps = [
        "Multiply out the bracket: $" + poly([[p, "x"], [p * q, ""]]) + " = " + poly([[s, "x"], [t, ""]]) + "$.",
        move(s, "x") + ": $" + poly([[k, "x"], [p * q, ""]]) + " = " + t + "$.",
        move(p * q, "") + ": $" + poly([[k, "x"]]) + " = " + rhs + "$."
      ];
      if (k !== 1) steps.push("Divide by $" + k + "$: $x = " + x + "$.");
      steps.push("Check: $" + p + "(" + x + " " + signed(q) + ") = " + p * (x + q) + "$ and $" + s + " \\cdot " + par(x) + " " + signed(t) + " = " + (s * x + t) + "$ ✓.");
      return {
        q: "Solve $" + p + "(" + shift("x", q) + ") = " + poly([[s, "x"], [t, ""]]) + "$ for $x$.",
        type: "number", answer: String(x),
        hint: "Multiply out the bracket first, then collect the x terms on one side.",
        steps: steps,
        verify: function () { return p * (x + q) === s * x + t && rhs === k * x; }
      };
    }
  });

  G.add({
    id: "sys-elim", section: "ch02#two-unknowns", par: 75, timed: true,
    make: function (r) {
      var a, b, c, d, det, guard = 0;
      do {
        a = r.nonzero(-5, 5); b = r.nonzero(-5, 5); c = r.nonzero(-5, 5); d = r.nonzero(-5, 5);
        det = a * d - b * c;
      } while ((det === 0 || Math.abs(det) > 30) && guard++ < 50);
      if (det === 0) { d = d + 1 || 1; det = a * d - b * c; }
      var x = r.int(-6, 6), y = r.int(-6, 6), e = a * x + b * y, f = c * x + d * y;
      var ask = r.chance(0.5) ? "x" : "y";
      var sys = "\\begin{aligned} " + poly([[a, "x"], [b, "y"]]) + " &= " + e + " \\\\ " + poly([[c, "x"], [d, "y"]]) + " &= " + f + " \\end{aligned}";
      var steps = [];
      if (b === d) steps.push("The $y$ terms already match, so subtract the second equation from the first.");
      else {
        var scale = d === 1 ? "Multiply the second equation by $" + b + "$"
          : b === 1 ? "Multiply the first equation by $" + d + "$"
            : "Multiply the first equation by $" + d + "$ and the second by $" + b + "$";
        steps.push(scale + ", so that $y$ has the same coefficient $" + b * d + "$ in both: $" +
          poly([[a * d, "x"], [b * d, "y"]]) + " = " + e * d + "$ and $" + poly([[b * c, "x"], [b * d, "y"]]) + " = " + b * f + "$.");
      }
      steps.push("Subtract to eliminate $y$: $" + poly([[det, "x"]]) + " = " + (e * d - b * f) + "$, so $x = " + x + "$.");
      steps.push("Put $x = " + x + "$ into the first equation: $" + poly([[b, "y"]]) + " = " + e + " - " + par(a * x) + " = " + (e - a * x) + "$, so $y = " + y + "$.");
      steps.push("Check in the second equation: $" + par(c) + " \\cdot " + par(x) + " + " + par(d) + " \\cdot " + par(y) + " = " + f + "$ ✓. The question asks for $" + ask + " = " + (ask === "x" ? x : y) + "$.");
      return {
        q: "Solve $\\;" + sys + "$ and give the value of $" + ask + "$.",
        type: "number", answer: String(ask === "x" ? x : y),
        hint: "Scale the equations so that one unknown has the same coefficient in both, then subtract to eliminate it.",
        steps: steps,
        verify: function () { return a * x + b * y === e && c * x + d * y === f && e * d - b * f === det * x; }
      };
    }
  });

  G.add({
    id: "word-two", section: "ch02#word-problems", par: 75, timed: true,
    make: function (r) {
      if (r.chance(0.4)) {
        var small = r.int(2, 30), big = small + r.int(2, 24), wantBig = r.chance(0.6);
        var s = big + small, df = big - small;
        return {
          q: "The sum of two numbers is $" + s + "$ and their difference is $" + df + "$. What is the " + (wantBig ? "larger" : "smaller") + " number?",
          type: "number", answer: String(wantBig ? big : small),
          hint: "Name the two numbers and write one equation for each sentence.",
          steps: [
            "Let the numbers be $x$ (larger) and $y$. Then $x + y = " + s + "$ and $x - y = " + df + "$.",
            "Add the equations: $2x = " + (s + df) + "$, so $x = " + big + "$.",
            "Then $y = " + s + " - " + big + " = " + small + "$.",
            "Check: $" + big + " - " + small + " = " + df + "$ ✓. The " + (wantBig ? "larger" : "smaller") + " number is $" + (wantBig ? big : small) + "$."
          ],
          verify: function () { return big + small === s && big - small === df; }
        };
      }
      var p = r.int(3, 6), q = r.int(2, p - 1), cn = r.int(6, 40), tn = r.int(6, 40);
      var n = cn + tn, total = p * cn + q * tn, wantC = r.chance(0.6);
      return {
        q: "A stall sells coffee at £" + p + " and tea at £" + q + ". It sold $" + n + "$ drinks and took £" + total + ". How many " + (wantC ? "coffees" : "teas") + " were sold?",
        type: "number", answer: String(wantC ? cn : tn),
        hint: "Name the two counts, then write one equation for the number of drinks and one for the money.",
        steps: [
          "Let $c$ coffees and $t$ teas be sold. Then $c + t = " + n + "$ and $" + p + "c + " + q + "t = " + total + "$.",
          "Multiply the first equation by $" + q + "$: $" + q + "c + " + q + "t = " + q * n + "$. Subtract it from the second: $" + poly([[p - q, "c"]]) + " = " + (total - q * n) + "$, so $c = " + cn + "$.",
          "Then $t = " + n + " - " + cn + " = " + tn + "$.",
          "Check: $" + p + " \\cdot " + cn + " + " + q + " \\cdot " + tn + " = " + total + "$ ✓."
        ],
        verify: function () { return cn + tn === n && p * cn + q * tn === total && (total - q * n) / (p - q) === cn; }
      };
    }
  });

  /* ------------------------------------------------------- Chapter 3 ---- */

  var REL = {
    ">": { tex: ">", flip: "<", key: ">", strict: true },
    "<": { tex: "<", flip: ">", key: "<", strict: true },
    ">=": { tex: "\\ge", flip: "<=", key: ">=", strict: false },
    "<=": { tex: "\\le", flip: ">=", key: "<=", strict: false }
  };
  function holds(rel, l, rgt) {
    return rel === ">" ? l > rgt : rel === "<" ? l < rgt : rel === ">=" ? l >= rgt : l <= rgt;
  }
  /* "x<3" with its mirror "3>x" */
  function relAns(rel, x0) {
    var mirror = { ">": "<", "<": ">", ">=": "<=", "<=": ">=" }[rel];
    return "x" + rel + x0 + "|" + x0 + mirror + "x";
  }

  G.add({
    id: "ineq-flip", section: "ch03#order", par: 45, timed: true,
    make: function (r) {
      var a = r.chance(0.75) ? -r.int(2, 6) : r.int(2, 6), x0 = r.int(-8, 8), b = r.nonzero(-10, 10);
      var rel = r.pick([">", "<", ">=", "<="]), c = a * x0 + b;
      var out = a < 0 ? REL[rel].flip : rel;
      var xt = x0 + (out.charAt(0) === ">" ? 1 : -1);
      return {
        q: "Solve $" + poly([[a, "x"], [b, ""]]) + " " + REL[rel].tex + " " + c + "$.",
        type: "exact", answer: relAns(out, x0),
        placeholder: "e.g. x<5",
        hint: "Isolate the x term, and watch the direction of the inequality when you divide.",
        steps: [
          move(b, "") + ": $" + poly([[a, "x"]]) + " " + REL[rel].tex + " " + (c - b) + "$.",
          a < 0
            ? "Divide both sides by $" + a + "$. Dividing by a negative number reverses the inequality: $x " + REL[out].tex + " " + x0 + "$."
            : "Divide both sides by $" + a + "$, which is positive, so the direction stays: $x " + REL[out].tex + " " + x0 + "$.",
          "Check with a value inside that range, say $x = " + xt + "$: $" + a + " \\cdot " + par(xt) + " " + signed(b) + " = " +
            (a * xt + b) + "$, and $" + (a * xt + b) + " " + REL[rel].tex + " " + c + "$ ✓."
        ],
        verify: function () {
          var inside = x0 + (out.charAt(0) === ">" ? 1 : -1), outside = x0 - (out.charAt(0) === ">" ? 1 : -1);
          return holds(rel, a * inside + b, c) && !holds(rel, a * outside + b, c) && holds(rel, a * x0 + b, c) === !REL[rel].strict;
        }
      };
    }
  });

  G.add({
    id: "abs-solve", section: "ch03#absolute", par: 40, timed: true,
    make: function (r) {
      var a = r.int(-9, 9), d = r.int(1, 9), lo = a - d, hi = a + d;
      return {
        q: "Solve $|" + shift("x", -a) + "| = " + d + "$. List all solutions, separated by a comma.",
        type: "set", answer: lo + "," + hi,
        placeholder: "e.g. -1,7",
        hint: "Read the left side as a distance on the number line: distance from x to which number?",
        steps: [
          a === 0 ? "$|x|$ is the distance from $x$ to $0$." : "$|" + shift("x", -a) + "|$ is the distance from $x$ to $" + a + "$.",
          "The points at distance $" + d + "$ from $" + a + "$ lie one on each side: $" + a + " - " + d + " = " + lo + "$ and $" + a + " + " + d + " = " + hi + "$.",
          "So $x = " + lo + "$ or $x = " + hi + "$."
        ],
        verify: function () { return Math.abs(lo - a) === d && Math.abs(hi - a) === d && lo !== hi; }
      };
    }
  });

  var POW_RANGE = { 2: [-4, 6], 3: [-3, 4], 5: [-2, 3], 10: [-3, 3] };

  function powValue(b, e) { return e >= 0 ? Math.pow(b, e) : 1 / Math.pow(b, -e); }
  function powAns(b, e) { return e >= 0 ? String(Math.pow(b, e)) : "1/" + Math.pow(b, -e); }
  function powTex(b, e) { return e >= 0 ? String(Math.pow(b, e)) : "\\frac{1}{" + Math.pow(b, -e) + "}"; }

  G.add({
    id: "pow-laws", section: "ch03#powers", par: 45, timed: true,
    make: function (r) {
      var b = r.pick([2, 3, 5, 10]), range = POW_RANGE[b], e = r.int(range[0], range[1]);
      var m, n, k, guard = 0;
      do { m = r.int(-3, 7); n = r.int(-4, 6); k = m + n - e; } while ((k === 0 || k === 1 || m === 0 || n === 0 || k < -4 || k > 9) && guard++ < 40);
      if (k === 0 || m === 0 || n === 0) { m = 3; n = 2; k = 5 - e; }
      var steps = [
        "Every factor has base $" + b + "$, so multiplying adds exponents and dividing subtracts them: $" + m + " + " + par(n) + " - " + par(k) + " = " + e + "$.",
        "The expression is $" + b + "^{" + e + "}$."
      ];
      if (e < 0) steps.push("A negative exponent means a reciprocal: $" + b + "^{" + e + "} = \\frac{1}{" + b + "^{" + -e + "}} = " + powTex(b, e) + "$.");
      else if (e === 0) steps.push("Any non-zero number to the power $0$ is $1$.");
      else steps.push("$" + b + "^{" + e + "} = " + powTex(b, e) + "$.");
      return {
        q: "Write $\\dfrac{" + b + "^{" + m + "} \\cdot " + b + "^{" + n + "}}{" + b + "^{" + k + "}}$ as a single number.",
        type: "number", answer: powAns(b, e),
        hint: "With one base throughout, combine the exponents first and only then work out the number.",
        steps: steps,
        verify: function () { return Math.abs(powValue(b, m) * powValue(b, n) / powValue(b, k) - powValue(b, e)) < 1e-9 * Math.max(1, powValue(b, e)); }
      };
    }
  });

  G.add({
    id: "pow-frac", section: "ch03#powers", par: 50, timed: true,
    make: function (r) {
      var choices = [[2, 2], [2, 3], [2, 4], [3, 2], [3, 3], [3, 4], [4, 2], [4, 3], [5, 2], [5, 3]];
      var bq = r.pick(choices), base = bq[0], q = bq[1], c = Math.pow(base, q), p, guard = 0;
      do { p = r.pick([-3, -2, -1, 1, 2, 3]); } while ((u.gcd(Math.abs(p), q) !== 1 || Math.pow(base, Math.abs(p)) > 125) && guard++ < 30);
      if (u.gcd(Math.abs(p), q) !== 1 || Math.pow(base, Math.abs(p)) > 125) p = 1;
      var steps = ["$" + c + " = " + base + "^{" + q + "}$, so $" + c + "^{1/" + q + "} = " + base + "$."];
      if (Math.abs(p) > 1) steps.push("Raise to the power $" + Math.abs(p) + "$: $" + base + "^{" + Math.abs(p) + "} = " + Math.pow(base, Math.abs(p)) + "$.");
      if (p < 0) steps.push("The minus sign in the exponent takes the reciprocal: $" + c + "^{" + p + "/" + q + "} = \\frac{1}{" + Math.pow(base, -p) + "}$.");
      return {
        q: "Compute $" + c + "^{" + p + "/" + q + "}$.",
        type: "number", answer: powAns(base, p),
        hint: "The denominator of the exponent names a root and the numerator a power; a minus sign means a reciprocal.",
        steps: steps,
        verify: function () { return Math.abs(Math.pow(c, p / q) - powValue(base, p)) < 1e-9; }
      };
    }
  });

  /* ------------------------------------------------------- Chapter 4 ---- */

  G.add({
    id: "quad-square", section: "ch04#square-roots", par: 40, timed: true,
    make: function (r) {
      var s = r.int(2, 12), h = r.chance(0.4) ? 0 : r.nonzero(-7, 7), lo = h - s, hi = h + s;
      var left = h === 0 ? "x^2" : "(" + shift("x", -h) + ")^2";
      var steps = ["Both $" + s + "$ and $-" + s + "$ square to $" + s * s + "$, so $" + (h === 0 ? "x" : shift("x", -h)) + " = " + s + "$ or $" + (h === 0 ? "x" : shift("x", -h)) + " = -" + s + "$."];
      if (h !== 0) steps.push((h > 0 ? "Add $" + h + "$" : "Subtract $" + -h + "$") + ": $x = " + hi + "$ or $x = " + lo + "$.");
      return {
        q: "Solve $" + left + " = " + s * s + "$. List both solutions, separated by a comma.",
        type: "set", answer: lo + "," + hi,
        placeholder: "e.g. 3,-3",
        hint: "Two different numbers have this square, one positive and one negative.",
        steps: steps.concat([
          h === 0
            ? "Check: $" + par(hi) + "^2 = " + s * s + "$ and $" + par(lo) + "^2 = " + s * s + "$ ✓."
            : "Check: $(" + hi + " " + signed(-h) + ")^2 = " + s * s + "$ and $(" + lo + " " + signed(-h) + ")^2 = " + s * s + "$ ✓."
        ]),
        verify: function () { return (hi - h) * (hi - h) === s * s && (lo - h) * (lo - h) === s * s; }
      };
    }
  });

  G.add({
    id: "quad-roots", section: "ch04#formula", par: 75, timed: true,
    make: function (r) {
      var r1, r2, guard = 0;
      do { r1 = r.int(-9, 9); r2 = r.int(-9, 9); } while ((r1 === r2 || r1 + r2 === 0) && guard++ < 40);
      if (r1 === r2 || r1 + r2 === 0) { r1 = 2; r2 = -7; }
      var k = r.pick([1, 1, 1, 2, 3]), b = -(r1 + r2), c = r1 * r2;
      var moved = c !== 0 && r.chance(0.4);
      var eq = moved ? poly([[k, "x^2"], [k * b, "x"]]) + " = " + (-k * c) : poly([[k, "x^2"], [k * b, "x"], [k * c, ""]]) + " = 0";
      var steps = [];
      if (moved) steps.push("Bring everything to one side: $" + poly([[k, "x^2"], [k * b, "x"], [k * c, ""]]) + " = 0$.");
      if (k > 1) steps.push("Divide by $" + k + "$: $" + poly([[1, "x^2"], [b, "x"], [c, ""]]) + " = 0$.");
      steps.push(c === 0
        ? "Take out the common factor $x$: $x(" + shift("x", b) + ") = 0$."
        : "Look for two numbers with product $" + c + "$ and sum $" + b + "$: they are $" + -r1 + "$ and $" + -r2 + "$. So $(" + shift("x", -r1) + ")(" + shift("x", -r2) + ") = 0$.");
      steps.push("A product is zero only when a factor is zero: $x = " + r1 + "$ or $x = " + r2 + "$.");
      return {
        q: "Solve $" + eq + "$. List both solutions, separated by a comma.",
        type: "set", answer: r1 + "," + r2,
        placeholder: "e.g. 2,-7",
        hint: "Get zero on one side, then factor (or use the formula) and apply the zero-product property.",
        steps: steps,
        verify: function () {
          return k * r1 * r1 + k * b * r1 + k * c === 0 && k * r2 * r2 + k * b * r2 + k * c === 0 && r1 !== r2;
        }
      };
    }
  });

  G.add({
    id: "quad-disc", section: "ch04#discriminant", par: 40, timed: true,
    make: function (r) {
      var a = r.nonzero(-4, 5), b = r.int(-9, 9), c = r.nonzero(-9, 9), D = b * b - 4 * a * c;
      return {
        q: "Compute the discriminant of $" + poly([[a, "x^2"], [b, "x"], [c, ""]]) + " = 0$.",
        type: "number", answer: String(D),
        hint: "Read off a, b and c with their signs, then form b² − 4ac.",
        steps: [
          "Here $a = " + a + "$, $b = " + b + "$, $c = " + c + "$.",
          "$\\Delta = b^2 - 4ac = " + par(b) + "^2 - 4 \\cdot " + par(a) + " \\cdot " + par(c) + " = " + b * b + " - " + par(4 * a * c) + " = " + D + "$."
        ],
        verify: function () { return D === Math.pow(b, 2) - 4 * a * c; }
      };
    }
  });

  G.add({
    id: "quad-count", section: "ch04#discriminant", par: 40, timed: false,
    make: function (r) {
      var kind = r.pick([0, 1, 2]), a = r.nonzero(-3, 3), h = r.int(-5, 5), b, c, guard = 0;
      if (kind === 1) { b = -2 * a * h; c = a * h * h; }
      else if (kind === 2) {
        var p, q;
        do { p = r.int(-6, 6); q = r.int(-6, 6); } while (p === q && guard++ < 20);
        if (p === q) q = p + 1;
        b = -a * (p + q); c = a * p * q;
      } else { var m = r.int(1, 6) * (a > 0 ? 1 : -1); b = -2 * a * h; c = a * h * h + m; }
      var D = b * b - 4 * a * c;
      return {
        q: "How many real roots does $" + poly([[a, "x^2"], [b, "x"], [c, ""]]) + " = 0$ have?",
        type: "number", answer: String(kind),
        placeholder: "0, 1 or 2",
        hint: "You do not need the roots themselves. Compute b² − 4ac and look at its sign.",
        steps: [
          "$\\Delta = " + par(b) + "^2 - 4 \\cdot " + par(a) + " \\cdot " + par(c) + " = " + D + "$.",
          D > 0 ? "The discriminant is positive, so there are two distinct real roots."
            : D === 0 ? "The discriminant is zero, so there is exactly one (double) root."
              : "The discriminant is negative, so there is no real root.",
          "Answer: $" + kind + "$."
        ],
        verify: function () { return (D > 0 ? 2 : D === 0 ? 1 : 0) === kind; }
      };
    }
  });

  G.add({
    id: "complete-sq", section: "ch04#completing", par: 45, timed: true,
    make: function (r) {
      var h = r.nonzero(-7, 7), c = r.int(-12, 12), k = c - h * h;
      return {
        q: "Complete the square: $" + poly([[1, "x^2"], [2 * h, "x"], [c, ""]]) + " = (" + shift("x", h) + ")^2 + k$. What is $k$?",
        type: "number", answer: String(k),
        hint: "Halve the coefficient of x and square it; k is what is left over from the constant.",
        steps: [
          "Half the coefficient of $x$ is $" + h + "$, and $(" + shift("x", h) + ")^2 = " + poly([[1, "x^2"], [2 * h, "x"], [h * h, ""]]) + "$.",
          "So $" + poly([[1, "x^2"], [2 * h, "x"], [c, ""]]) + " = (" + shift("x", h) + ")^2 - " + h * h + " " + (c < 0 ? "- " + -c : "+ " + c) + "$.",
          "Hence $k = " + c + " - " + h * h + " = " + k + "$."
        ],
        verify: function () {
          for (var x = -3; x <= 3; x++) if (x * x + 2 * h * x + c !== (x + h) * (x + h) + k) return false;
          return true;
        }
      };
    }
  });

  G.add({
    id: "vertex-x", section: "ch04#graph", par: 45, timed: true,
    make: function (r) {
      var a = r.pick([-3, -2, -1, 1, 2, 3]), h = r.nonzero(-6, 6), c = r.int(-9, 9), b = -2 * a * h;
      var word = a < 0 ? "largest" : "smallest";
      function y(x) { return a * x * x + b * x + c; }
      return {
        q: "At which $x$ does $y = " + poly([[a, "x^2"], [b, "x"], [c, ""]]) + "$ take its " + word + " value?",
        type: "number", answer: String(h),
        hint: "The parabola is symmetric about its vertex, and the vertex sits at x = −b/(2a).",
        steps: [
          "The vertex of $y = ax^2 + bx + c$ is at $x = -\\dfrac{b}{2a}$.",
          "Here $a = " + a + "$ and $b = " + b + "$, so $x = -\\dfrac{" + b + "}{" + 2 * a + "} = " + h + "$.",
          a < 0 ? "Since $a < 0$ the parabola opens downward, so the vertex is its highest point." : "Since $a > 0$ the parabola opens upward, so the vertex is its lowest point."
        ],
        verify: function () { return y(h - 1) === y(h + 1) && (a < 0 ? y(h) > y(h + 1) : y(h) < y(h + 1)); }
      };
    }
  });

  /* ------------------------------------------------------- Interlude ---- */

  G.add({
    id: "set-ops", section: "interlude#sets", par: 40, timed: true,
    make: function (r) {
      var pool = r.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      var shared = r.int(1, 2), onlyA = r.int(1, 3), onlyB = r.int(1, 3);
      var A = pool.slice(0, shared + onlyA), B = pool.slice(0, shared).concat(pool.slice(shared + onlyA, shared + onlyA + onlyB));
      function sorted(s) { return s.slice().sort(function (x, y) { return x - y; }); }
      function show(s) { return "\\{" + sorted(s).join(", ") + "\\}"; }
      var op = r.pick(["cup", "cap", "setminus"]), out;
      function inB(x) { return B.indexOf(x) > -1; }
      if (op === "cup") out = A.concat(B.filter(function (x) { return A.indexOf(x) < 0; }));
      else if (op === "cap") out = A.filter(inB);
      else out = A.filter(function (x) { return !inB(x); });
      out = sorted(out);
      var words = {
        cup: ["Collect every element that lies in at least one of the two sets, listing each only once.", "The union contains everything in $A$ or in $B$ (or both)."],
        cap: ["Keep only the elements that lie in both sets at once.", "The intersection contains what $A$ and $B$ have in common."],
        setminus: ["Start from A and strike out everything that also lies in B.", "$A \\setminus B$ keeps the elements of $A$ that are not in $B$."]
      }[op];
      return {
        q: "Let $A = " + show(A) + "$ and $B = " + show(B) + "$. List the elements of $A \\" + op + " B$, separated by commas.",
        type: "set", answer: out.join(","),
        placeholder: "e.g. 1,4,6",
        hint: words[0],
        steps: [words[1], "So $A \\" + op + " B = " + show(out) + "$."],
        verify: function () {
          var ma = 0, mb = 0, mo = 0;
          A.forEach(function (x) { ma |= 1 << x; });
          B.forEach(function (x) { mb |= 1 << x; });
          out.forEach(function (x) { mo |= 1 << x; });
          var want = op === "cup" ? ma | mb : op === "cap" ? ma & mb : ma & ~mb;
          return want === mo && out.length > 0;
        }
      };
    }
  });
})();
