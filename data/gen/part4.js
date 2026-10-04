/* data/gen/part4.js — Arena generators for Part IV: Chapters 12–16.
   Complex numbers are typed a+bi; permutations as the list of images of 1, 2, 3, …;
   determinants are written with vertical bars, as in Chapter 16. */
(function () {
  "use strict";
  var G = window.BMGen;
  if (!G) return;
  var u = G.u, par = u.par, poly = u.poly, shift = u.shift;

  function signed(n) { return n < 0 ? "- " + -n : "+ " + n; }

  /* ------------------------------------------------------ Chapter 12 ---- */

  G.add({
    id: "poly-eval", section: "ch12#definition-fn", par: 40, timed: true,
    make: function (r) {
      var a = r.nonzero(-4, 4), b = r.int(-8, 8), c = r.int(-9, 9), x = r.nonzero(-5, 5);
      var value = a * x * x + b * x + c;
      return {
        q: "If $f(x) = " + poly([[a, "x^2"], [b, "x"], [c, ""]]) + "$, what is $f(" + x + ")$?",
        type: "number", answer: String(value),
        hint: "Replace every x by the number, in brackets, and square before multiplying.",
        steps: [
          "$f(" + x + ") = " + a + " \\cdot " + par(x) + "^2 " + signed(b) + " \\cdot " + par(x) + " " + signed(c) + "$.",
          "$= " + a + " \\cdot " + x * x + " " + signed(b * x) + " " + signed(c) + " = " + value + "$."
        ],
        verify: function () { return (a * x + b) * x + c === value; }
      };
    }
  });

  G.add({
    id: "remainder", section: "ch12#polynomials", par: 50, timed: true,
    make: function (r) {
      var p = r.int(-6, 6), q = r.int(-6, 6), s = r.int(-9, 9), x = r.nonzero(-3, 3);
      var value = x * x * x + p * x * x + q * x + s;
      return {
        q: "What is the remainder when $f(x) = " + poly([[1, "x^3"], [p, "x^2"], [q, "x"], [s, ""]]) + "$ is divided by $" + shift("x", -x) + "$?",
        type: "number", answer: String(value),
        hint: "You do not need to divide: dividing by x − r leaves a constant, and putting x = r shows what it is.",
        steps: [
          "Dividing by $" + shift("x", -x) + "$ gives $f(x) = (" + shift("x", -x) + ")q(x) + c$; putting $x = " + x + "$ shows $c = f(" + x + ")$.",
          "$f(" + x + ") = " + par(x) + "^3 " + signed(p) + " \\cdot " + par(x) + "^2 " + signed(q) + " \\cdot " + par(x) + " " + signed(s) + " = " +
            x * x * x + " " + signed(p * x * x) + " " + signed(q * x) + " " + signed(s) + " = " + value + "$."
        ],
        verify: function () {
          /* synthetic division: the last number left is the remainder */
          var coeffs = [1, p, q, s], carry = 0;
          coeffs.forEach(function (c0) { carry = carry * x + c0; });
          return carry === value;
        }
      };
    }
  });

  var LOG_BASES = { 2: 10, 3: 6, 5: 4, 10: 4 };
  function powTex(b, k) { return k >= 0 ? String(Math.pow(b, k)) : "\\tfrac{1}{" + Math.pow(b, -k) + "}"; }

  G.add({
    id: "log-int", section: "ch12#log", par: 35, timed: true,
    make: function (r) {
      var b = r.pick([2, 3, 5, 10]), top = LOG_BASES[b], kind = r.pick(["one", "one", "sum", "diff"]);
      if (kind === "one") {
        var k = r.int(-3, top);
        if (k === 1) k = 2;
        return {
          q: "What is $\\log_{" + b + "} " + powTex(b, k) + "$?",
          type: "number", answer: String(k),
          hint: "A logarithm is an exponent: ask what power of the base gives this number.",
          steps: [
            k < 0 ? "$" + powTex(b, k) + " = \\frac{1}{" + b + "^{" + -k + "}} = " + b + "^{" + k + "}$." : "$" + powTex(b, k) + " = " + b + "^{" + k + "}$.",
            "So $\\log_{" + b + "} " + powTex(b, k) + " = " + k + "$."
          ],
          verify: function () { return Math.abs(Math.log(k >= 0 ? Math.pow(b, k) : 1 / Math.pow(b, -k)) / Math.log(b) - k) < 1e-9; }
        };
      }
      var m = r.int(1, top - 1), n = r.int(1, top - m), plus = kind === "sum";
      if (!plus && m === n) m = n + 1;
      if (!plus && m < n) { var t = m; m = n; n = t; }
      var val = plus ? m + n : m - n;
      return {
        q: "Compute $\\log_{" + b + "} " + Math.pow(b, m) + (plus ? " + " : " - ") + "\\log_{" + b + "} " + Math.pow(b, n) + "$.",
        type: "number", answer: String(val),
        hint: "Work out each logarithm as an exponent, or combine them first into one logarithm.",
        steps: [
          "$" + Math.pow(b, m) + " = " + b + "^{" + m + "}$ and $" + Math.pow(b, n) + " = " + b + "^{" + n + "}$, so the logarithms are $" + m + "$ and $" + n + "$.",
          "$" + m + (plus ? " + " : " - ") + n + " = " + val + "$."
        ],
        verify: function () {
          var other = plus ? Math.log(Math.pow(b, m) * Math.pow(b, n)) / Math.log(b) : Math.log(Math.pow(b, m) / Math.pow(b, n)) / Math.log(b);
          return Math.abs(other - val) < 1e-9;
        }
      };
    }
  });

  G.add({
    id: "exp-solve", section: "ch12#exponential", par: 45, timed: true,
    make: function (r) {
      var b = r.pick([2, 3, 5]), x = r.int(1, b === 2 ? 7 : b === 3 ? 5 : 4), c = r.int(2, 9);
      var d = c * Math.pow(b, x);
      return {
        q: "Solve $" + c + " \\cdot " + b + "^{x} = " + d + "$.",
        type: "number", answer: String(x),
        hint: "Isolate the power first; then ask which power of the base it is.",
        steps: [
          "Divide both sides by $" + c + "$: $" + b + "^{x} = " + Math.pow(b, x) + "$.",
          "$" + Math.pow(b, x) + " = " + b + "^{" + x + "}$, and $" + b + "^{x}$ takes each value only once, so $x = " + x + "$."
        ],
        verify: function () { return c * Math.pow(b, x) === d && Math.abs(Math.log(d / c) / Math.log(b) - x) < 1e-9; }
      };
    }
  });

  /* ------------------------------------------------------ Chapter 13 ---- */

  /* a permutation of 1..n as an array p with p[i - 1] the image of i */
  function perm(r, n) {
    var p, guard = 0, base = [];
    for (var i = 1; i <= n; i++) base.push(i);
    do { p = r.shuffle(base); } while (p.every(function (v, j) { return v === j + 1; }) && guard++ < 20);
    return p;
  }
  function arrows(p) { return p.map(function (v, j) { return (j + 1) + "\\to " + v; }).join(",\\ "); }

  G.add({
    id: "perm-compose", section: "ch13#permutations", par: 75, timed: true,
    make: function (r) {
      var n = r.chance(0.5) ? 3 : 4, s = perm(r, n), t = perm(r, n), guard = 0;
      while (s.join() === t.join() && guard++ < 20) t = perm(r, n);
      var tauFirst = r.chance(0.5);
      var first = tauFirst ? t : s, second = tauFirst ? s : t;
      var out = first.map(function (v) { return second[v - 1]; });
      var name = tauFirst ? "\\sigma\\circ\\tau" : "\\tau\\circ\\sigma";
      var f1 = tauFirst ? "\\tau" : "\\sigma", f2 = tauFirst ? "\\sigma" : "\\tau";
      var list = [];
      for (var i = 1; i <= n; i++) list.push(i);
      return {
        q: "On $\\{" + list.join(",") + "\\}$, let $\\sigma$ send $" + arrows(s) + "$ and let $\\tau$ send $" + arrows(t) + "$. Write $" + name +
          "$ (apply $" + f1 + "$ first) as the images of $" + list.join(", ") + "$ in order, separated by commas.",
        type: "exact", answer: out.join(",") + "|(" + out.join(",") + ")",
        placeholder: n === 3 ? "e.g. 2,3,1" : "e.g. 2,1,4,3",
        hint: "Track one element at a time: through the permutation applied first, then through the other.",
        steps: list.map(function (i) {
          return "$" + i + " \\xrightarrow{" + f1 + "} " + first[i - 1] + " \\xrightarrow{" + f2 + "} " + out[i - 1] + "$.";
        }).concat(["So $" + name + "$ sends " + list.map(function (i) { return "$" + i + "\\to " + out[i - 1] + "$"; }).join(", ") + ": the list is $" + out.join(", ") + "$."]),
        verify: function () {
          /* undo it: applying the inverses in the reverse order must bring every element home */
          return list.every(function (i) {
            var back = second.indexOf(out[i - 1]) + 1;
            return first.indexOf(back) + 1 === i;
          });
        }
      };
    }
  });

  G.add({
    id: "compose-fn", section: "ch13#formalism", par: 45, timed: true,
    make: function (r) {
      var a = r.nonzero(-4, 4), b = r.int(-6, 6), c = r.int(-9, 9), x = r.int(-4, 4);
      if (a === 1 && b === 0) b = 2;
      var gFirst = r.chance(0.5);
      function f(v) { return a * v + b; }
      function g(v) { return v * v + c; }
      var mid = gFirst ? g(x) : f(x), out = gFirst ? f(mid) : g(mid);
      var name = gFirst ? "f \\circ g" : "g \\circ f";
      return {
        q: "Let $f(x) = " + poly([[a, "x"], [b, ""]]) + "$ and $g(x) = " + poly([[1, "x^2"], [c, ""]]) + "$. What is $(" + name + ")(" + x + ")$?",
        type: "number", answer: String(out),
        hint: "Work from the inside out: the mapping written on the right acts first.",
        steps: [
          "$(" + name + ")(" + x + ") = " + (gFirst ? "f(g(" + x + "))" : "g(f(" + x + "))") + "$.",
          gFirst ? "$g(" + x + ") = " + par(x) + "^2 " + signed(c) + " = " + mid + "$." : "$f(" + x + ") = " + a + " \\cdot " + par(x) + " " + signed(b) + " = " + mid + "$.",
          gFirst ? "$f(" + mid + ") = " + a + " \\cdot " + par(mid) + " " + signed(b) + " = " + out + "$." : "$g(" + mid + ") = " + par(mid) + "^2 " + signed(c) + " = " + out + "$."
        ],
        verify: function () {
          /* expand the composite as one formula and evaluate that instead */
          var direct = gFirst ? a * (x * x + c) + b : (a * x + b) * (a * x + b) + c;
          return direct === out;
        }
      };
    }
  });

  /* ------------------------------------------------------ Chapter 14 ---- */

  G.add({
    id: "cx-mult", section: "ch14#complex-arith", par: 60, timed: true,
    make: function (r) {
      var a = r.int(-6, 6), b = r.nonzero(-6, 6), c = r.int(-6, 6), d = r.nonzero(-6, 6);
      var re = a * c - b * d, im = a * d + b * c;
      return {
        q: "Compute $(" + u.cxTex(a, b) + ")(" + u.cxTex(c, d) + ")$.",
        type: "expr", answer: u.cxAns(re, im),
        placeholder: "e.g. 3+4i",
        hint: "Multiply out as with any two brackets, then replace i² by −1.",
        steps: [
          "Expand: $" + par(a) + " \\cdot " + par(c) + " + " + par(a) + " \\cdot " + par(d) + "i + " + par(b) + " \\cdot " + par(c) + "i + " + par(b) + " \\cdot " + par(d) + "i^2$.",
          "$= " + a * c + " " + signed(a * d) + "i " + signed(b * c) + "i " + signed(b * d) + "i^2$, and $i^2 = -1$.",
          "Collect: $(" + a * c + " - " + par(b * d) + ") + (" + a * d + " + " + par(b * c) + ")i = " + u.cxTex(re, im) + "$."
        ],
        verify: function () {
          /* |zw|² = |z|²|w|², and the real part is ac − bd */
          return (a * a + b * b) * (c * c + d * d) === re * re + im * im && re === a * c - b * d;
        }
      };
    }
  });

  G.add({
    id: "cx-divide", section: "ch14#complex-arith", par: 75, timed: true,
    make: function (r) {
      var p = r.int(-5, 5), q = r.nonzero(-5, 5), c = r.int(-4, 4), d = r.nonzero(-4, 4);
      /* numerator = (p + qi)(c + di), so the quotient comes out whole */
      var nr = p * c - q * d, ni = p * d + q * c, den = c * c + d * d;
      var tr = nr * c + ni * d, ti = ni * c - nr * d;
      return {
        q: "Compute $\\dfrac{" + u.cxTex(nr, ni) + "}{" + u.cxTex(c, d) + "}$.",
        type: "expr", answer: u.cxAns(p, q),
        placeholder: "e.g. 3-2i",
        hint: "Multiply the top and the bottom by the conjugate of the bottom.",
        steps: [
          "The conjugate of $" + u.cxTex(c, d) + "$ is $" + u.cxTex(c, -d) + "$; the bottom becomes $" + par(c) + "^2 + " + par(d) + "^2 = " + den + "$.",
          "The top becomes $(" + u.cxTex(nr, ni) + ")(" + u.cxTex(c, -d) + ") = " + u.cxTex(tr, ti) + "$.",
          "Divide both parts by $" + den + "$: $" + u.cxTex(p, q) + "$."
        ],
        verify: function () {
          /* multiply back: (p + qi)(c + di) must give the numerator */
          return p * c - q * d === nr && p * d + q * c === ni && tr === p * den && ti === q * den;
        }
      };
    }
  });

  G.add({
    id: "i-power", section: "ch14#complex-arith", par: 30, timed: false,
    make: function (r) {
      var n = r.int(5, 60), m = n % 4;
      var keys = ["1", "i|1i", "-1", "-i|-1i"], tex = ["1", "i", "-1", "-i"];
      return {
        q: "What is $i^{" + n + "}$?",
        type: "exact", answer: keys[m],
        placeholder: "e.g. -1",
        hint: "Powers of i repeat in a cycle; find where this exponent falls in it.",
        steps: [
          "$i^1 = i$, $i^2 = -1$, $i^3 = -i$, $i^4 = 1$, and then the cycle repeats every $4$.",
          "$" + n + " = 4 \\cdot " + Math.floor(n / 4) + " + " + m + "$, so $i^{" + n + "} = (i^4)^{" + Math.floor(n / 4) + "} \\cdot i^{" + m + "} = " + tex[m] + "$."
        ],
        verify: function () {
          var re = 1, im = 0;
          for (var k = 0; k < n; k++) { var t = -im; im = re; re = t; }
          var want = [[1, 0], [0, 1], [-1, 0], [0, -1]][m];
          return re === want[0] && im === want[1];
        }
      };
    }
  });

  G.add({
    id: "cx-abs", section: "ch14#complex-plane", par: 40, timed: true,
    make: function (r) {
      var t = r.pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [6, 8, 10], [7, 24, 25], [9, 12, 15]]);
      var a = t[0], b = t[1];
      if (r.chance(0.5)) { var s = a; a = b; b = s; }
      if (r.chance(0.5)) a = -a;
      if (r.chance(0.5)) b = -b;
      if (r.chance(0.5)) {
        return {
          q: "What is $|" + u.cxTex(a, b) + "|$?",
          type: "number", answer: String(t[2]),
          hint: "The absolute value is the distance from the origin to the point.",
          steps: ["$|a + bi| = \\sqrt{a^2 + b^2}$.", "$\\sqrt{" + par(a) + "^2 + " + par(b) + "^2} = \\sqrt{" + (a * a + b * b) + "} = " + t[2] + "$."],
          verify: function () { return Math.abs(Math.sqrt(a * a + b * b) - t[2]) < 1e-9; }
        };
      }
      var w = [r.int(-5, 5), r.int(-5, 5)], z = [w[0] + a, w[1] + b];
      return {
        q: "What is $|(" + u.cxTex(z[0], z[1]) + ") - (" + u.cxTex(w[0], w[1]) + ")|$?",
        type: "number", answer: String(t[2]),
        hint: "Subtract first; the absolute value of a difference is the distance between the two points.",
        steps: [
          "$(" + u.cxTex(z[0], z[1]) + ") - (" + u.cxTex(w[0], w[1]) + ") = " + u.cxTex(a, b) + "$.",
          "$|" + u.cxTex(a, b) + "| = \\sqrt{" + par(a) + "^2 + " + par(b) + "^2} = \\sqrt{" + (a * a + b * b) + "} = " + t[2] + "$."
        ],
        verify: function () { return Math.abs(Math.sqrt(Math.pow(z[0] - w[0], 2) + Math.pow(z[1] - w[1], 2)) - t[2]) < 1e-9; }
      };
    }
  });

  /* ------------------------------------------------------ Chapter 15 ---- */

  G.add({
    id: "sum-range", section: "ch15#summations", par: 50, timed: true,
    make: function (r) {
      var kind = r.pick(["plain", "range", "linear", "squares"]), total = 0, k;
      if (kind === "plain") {
        var n = r.int(10, 200);
        for (k = 1; k <= n; k++) total += k;
        return {
          q: "Compute $1 + 2 + 3 + \\dots + " + n + "$.",
          type: "number", answer: String(total),
          hint: "Use the closed form for the sum of the first n whole numbers.",
          steps: ["$1 + 2 + \\dots + n = \\dfrac{n(n+1)}{2}$.", "With $n = " + n + "$: $\\dfrac{" + n + " \\cdot " + (n + 1) + "}{2} = " + n * (n + 1) / 2 + "$."],
          verify: function () { return n * (n + 1) / 2 === total; }
        };
      }
      if (kind === "range") {
        var lo = r.int(3, 30), hi = lo + r.int(5, 40);
        for (k = lo; k <= hi; k++) total += k;
        return {
          q: "Compute $\\displaystyle\\sum_{k=" + lo + "}^{" + hi + "} k$.",
          type: "number", answer: String(total),
          hint: "Sum from 1 to the top, then take away the part you do not want.",
          steps: [
            "$\\displaystyle\\sum_{k=" + lo + "}^{" + hi + "} k = \\sum_{k=1}^{" + hi + "} k - \\sum_{k=1}^{" + (lo - 1) + "} k$.",
            "$= \\dfrac{" + hi + " \\cdot " + (hi + 1) + "}{2} - \\dfrac{" + (lo - 1) + " \\cdot " + lo + "}{2} = " + hi * (hi + 1) / 2 + " - " + (lo - 1) * lo / 2 + " = " + total + "$."
          ],
          verify: function () { return hi * (hi + 1) / 2 - (lo - 1) * lo / 2 === total; }
        };
      }
      if (kind === "linear") {
        var m = r.int(5, 20), a = r.nonzero(-3, 4), b = r.int(-5, 5);
        if (a === 1 && b === 0) b = -1;
        for (k = 1; k <= m; k++) total += a * k + b;
        return {
          q: "Compute $\\displaystyle\\sum_{k=1}^{" + m + "} (" + poly([[a, "k"], [b, ""]]) + ")$.",
          type: "number", answer: String(total),
          hint: "Split the sum into two, pull out the constant factor, and remember what a constant sums to.",
          steps: [
            "$\\displaystyle\\sum_{k=1}^{" + m + "} (" + poly([[a, "k"], [b, ""]]) + ") = " + a + "\\sum_{k=1}^{" + m + "} k " + signed(b) + " \\cdot " + m + "$.",
            "$= " + a + " \\cdot " + m * (m + 1) / 2 + " " + signed(b * m) + " = " + total + "$."
          ],
          verify: function () { return a * m * (m + 1) / 2 + b * m === total; }
        };
      }
      var s = r.int(4, 24);
      for (k = 1; k <= s; k++) total += k * k;
      return {
        q: "Compute $\\displaystyle\\sum_{k=1}^{" + s + "} k^{2}$.",
        type: "number", answer: String(total),
        hint: "Use the closed form for the sum of the first n squares.",
        steps: ["$\\displaystyle\\sum_{k=1}^{n} k^2 = \\dfrac{n(n+1)(2n+1)}{6}$.", "With $n = " + s + "$: $\\dfrac{" + s + " \\cdot " + (s + 1) + " \\cdot " + (2 * s + 1) + "}{6} = " + s * (s + 1) * (2 * s + 1) / 6 + "$."],
        verify: function () { return s * (s + 1) * (2 * s + 1) / 6 === total; }
      };
    }
  });

  G.add({
    id: "geo-finite", section: "ch15#geometric", par: 60, timed: true,
    make: function (r) {
      var a = r.pick([1, 1, 2, 3, 5]), q = r.pick([2, 3, -2, 4]), n = r.int(3, q === 4 ? 4 : 6), terms = [], k, total = 0;
      for (k = 0; k <= n; k++) { terms.push(a * Math.pow(q, k)); total += a * Math.pow(q, k); }
      var shown = terms.map(function (v, i) { return i === 0 ? String(v) : (v < 0 ? "- " + -v : "+ " + v); }).join(" ");
      var inner = (1 - Math.pow(q, n + 1)) / (1 - q);
      return {
        q: "Compute $" + shown + "$.",
        type: "number", answer: String(total),
        hint: "Each term is the previous one times a fixed ratio; use the closed form for a geometric sum (or add carefully).",
        steps: [
          "This is " + (a === 1 ? "" : "$" + a + "$ times ") + "$1 + r + \\dots + r^{" + n + "}$ with $r = " + q + "$.",
          "$1 + r + \\dots + r^{n} = \\dfrac{1 - r^{n+1}}{1 - r} = \\dfrac{1 - " + par(q) + "^{" + (n + 1) + "}}{1 - " + par(q) + "} = \\dfrac{" + (1 - Math.pow(q, n + 1)) + "}{" + (1 - q) + "} = " + inner + "$.",
          a === 1 ? "So the sum is $" + total + "$." : "Times $" + a + "$: $" + total + "$."
        ],
        verify: function () { return a * inner === total; }
      };
    }
  });

  G.add({
    id: "geo-infinite", section: "ch15#geometric", par: 45, timed: true,
    make: function (r) {
      var m = r.pick([2, 3, 4, 5, 10]), a = r.pick([1, 1, 2, 3, 4, 6]), neg = r.chance(0.25);
      var sgn = neg ? -1 : 1;
      var terms = [String(a)];
      for (var k = 1; k <= 3; k++) {
        var f = u.reduce(a, Math.pow(m, k));
        var body = f.d === 1 ? String(f.n) : "\\tfrac{" + f.n + "}{" + f.d + "}";
        terms.push((neg && k % 2 ? "- " : "+ ") + body);
      }
      /* a / (1 - r) with r = ±1/m */
      var num = a * m, den = m - sgn;
      return {
        q: "What is $" + terms.join(" ") + " + \\dots$?",
        type: "fraction", answer: u.fracAns(num, den),
        placeholder: "e.g. 3/2",
        hint: "Find the ratio between consecutive terms, check that it is less than 1 in size, and use the infinite geometric sum.",
        steps: [
          "Each term is the previous one times $r = " + (neg ? "-" : "") + "\\frac{1}{" + m + "}$, and $|r| < 1$.",
          "$" + (a === 1 ? "" : a) + (a === 1 ? "" : "\\cdot ") + "\\dfrac{1}{1 - r} = " + (a === 1 ? "" : a + " \\cdot ") + "\\dfrac{1}{1 " + (neg ? "+" : "-") + " \\frac{1}{" + m + "}} = " + (a === 1 ? "" : a + " \\cdot ") + "\\dfrac{" + m + "}{" + den + "} = " + u.fracTex(num, den) + "$."
        ],
        verify: function () {
          var s = 0, t = a;
          for (var j = 0; j < 80; j++) { s += t; t *= sgn / m; }
          return Math.abs(s - num / den) < 1e-9;
        }
      };
    }
  });

  /* ------------------------------------------------------ Chapter 16 ---- */

  function vm2(a, b, c, d) { return "\\begin{vmatrix} " + a + " & " + b + " \\\\ " + c + " & " + d + " \\end{vmatrix}"; }

  G.add({
    id: "det2", section: "ch16#det2", par: 30, timed: true,
    make: function (r) {
      var a = r.int(-9, 9), b = r.int(-9, 9), c = r.int(-9, 9), d = r.int(-9, 9), v = a * d - b * c;
      return {
        q: "Compute $" + vm2(a, b, c, d) + "$.",
        type: "number", answer: String(v),
        hint: "Main diagonal product minus the other diagonal product.",
        steps: ["$ad - bc = " + par(a) + " \\cdot " + par(d) + " - " + par(b) + " \\cdot " + par(c) + "$.", "$= " + a * d + " - " + par(b * c) + " = " + v + "$."],
        verify: function () { return -(c * b - d * a) === v; }
      };
    }
  });

  G.add({
    id: "det3", section: "ch16#det3", par: 90, timed: true,
    make: function (r) {
      var m, i, a, b, c, m1, m2, m3, v, tries = 0;
      /* a few zeros make it humane; a zero determinant every time would teach nothing */
      do {
        m = [];
        for (i = 0; i < 9; i++) m.push(r.chance(0.25) ? 0 : r.int(-3, 5));
        a = m.slice(0, 3); b = m.slice(3, 6); c = m.slice(6, 9);
        m1 = b[1] * c[2] - b[2] * c[1]; m2 = b[0] * c[2] - b[2] * c[0]; m3 = b[0] * c[1] - b[1] * c[0];
        v = a[0] * m1 - a[1] * m2 + a[2] * m3;
      } while (v === 0 && tries++ < 8);
      var tex = "\\begin{vmatrix} " + a.join(" & ") + " \\\\ " + b.join(" & ") + " \\\\ " + c.join(" & ") + " \\end{vmatrix}";
      return {
        q: "Compute $" + tex + "$.",
        type: "number", answer: String(v),
        hint: "Expand along the first row: each entry times the 2 × 2 determinant left when its row and column are deleted, with signs plus, minus, plus.",
        steps: [
          "First term: $" + par(a[0]) + " \\cdot " + vm2(b[1], b[2], c[1], c[2]) + " = " + par(a[0]) + " \\cdot " + par(m1) + " = " + a[0] * m1 + "$.",
          "Second term, with a minus: $-" + par(a[1]) + " \\cdot " + vm2(b[0], b[2], c[0], c[2]) + " = -" + par(a[1]) + " \\cdot " + par(m2) + " = " + -a[1] * m2 + "$.",
          "Third term: $+" + par(a[2]) + " \\cdot " + vm2(b[0], b[1], c[0], c[1]) + " = " + par(a[2]) + " \\cdot " + par(m3) + " = " + a[2] * m3 + "$.",
          "Total: $" + a[0] * m1 + " " + signed(-a[1] * m2) + " " + signed(a[2] * m3) + " = " + v + "$."
        ],
        verify: function () {
          /* the rule of Sarrus: three diagonals down minus three diagonals up */
          var s = a[0] * b[1] * c[2] + a[1] * b[2] * c[0] + a[2] * b[0] * c[1] - a[2] * b[1] * c[0] - a[0] * b[2] * c[1] - a[1] * b[0] * c[2];
          return s === v;
        }
      };
    }
  });

  G.add({
    id: "det-rule", section: "ch16#det-props", par: 30, timed: true,
    make: function (r) {
      var d = r.nonzero(-9, 9), kind = r.pick(["swap", "scale", "add", "transpose", "product"]);
      var k = r.pick([-3, -2, 2, 3, 4, 5]), e = r.nonzero(-5, 5), out, what, why;
      if (kind === "swap") { out = -d; what = "swapping its first two rows"; why = "Swapping two rows flips the sign"; }
      else if (kind === "scale") { out = k * d; what = "multiplying its second row by $" + k + "$"; why = "Multiplying one row by $c$ multiplies the determinant by $c$"; }
      else if (kind === "add") { out = d; what = "adding $" + k + "$ times its first row to its third row"; why = "Adding a multiple of one row to another leaves the determinant unchanged"; }
      else if (kind === "transpose") { out = d; what = "exchanging its rows and columns (taking the transpose)"; why = "$\\det(A^t) = \\det A$"; }
      else { out = d * e; what = ""; why = "$\\det(AB) = \\det A \\cdot \\det B$"; }
      var q = kind === "product"
        ? "If $\\det A = " + d + "$ and $\\det B = " + e + "$ for two $3\\times3$ matrices, what is $\\det(AB)$?"
        : "A $3\\times3$ matrix $A$ has $\\det A = " + d + "$. What is the determinant of the matrix obtained by " + what + "?";
      return {
        q: q,
        type: "number", answer: String(out),
        hint: "No expansion is needed: one of the properties of determinants says exactly what this does.",
        steps: [why + ".", "So the new determinant is $" + out + "$."],
        verify: function () {
          /* check each rule on a concrete 2×2 example: rows (2, 1) and (1, 3), determinant 5 */
          var base = 2 * 3 - 1 * 1, alt;
          if (kind === "swap") alt = 1 * 1 - 3 * 2;
          else if (kind === "scale") alt = 2 * (3 * k) - 1 * (1 * k);
          else if (kind === "add") alt = 2 * (3 + k * 1) - 1 * (1 + k * 2);
          else if (kind === "transpose") alt = 2 * 3 - 1 * 1;
          else return out === d * e;
          return out * base === d * alt;
        }
      };
    }
  });

  G.add({
    id: "cramer2", section: "ch16#cramer", par: 90, timed: true,
    make: function (r) {
      var a, b, c, d, det, guard = 0;
      do { a = r.nonzero(-5, 5); b = r.nonzero(-5, 5); c = r.nonzero(-5, 5); d = r.nonzero(-5, 5); det = a * d - b * c; } while (det === 0 && guard++ < 40);
      if (det === 0) { d++; det = a * d - b * c; }
      var x = r.int(-6, 6), y = r.int(-6, 6), e = a * x + b * y, f = c * x + d * y;
      var dx = e * d - b * f, dy = a * f - e * c;
      return {
        q: "Solve $" + poly([[a, "x"], [b, "y"]]) + " = " + e + "$, $\\;" + poly([[c, "x"], [d, "y"]]) + " = " + f + "$. Give the point $(x, y)$.",
        type: "exact", answer: u.ptAns(x, y),
        placeholder: "e.g. (2,1)",
        hint: "Find the determinant of the coefficients, then replace one column at a time by the right-hand sides (Cramer's rule).",
        steps: [
          "$\\det A = " + vm2(a, b, c, d) + " = " + par(a) + " \\cdot " + par(d) + " - " + par(b) + " \\cdot " + par(c) + " = " + det + "$, which is not zero.",
          "Replace the first column by $(" + e + ", " + f + ")$: $" + vm2(e, b, f, d) + " = " + dx + "$, so $x = \\dfrac{" + dx + "}{" + det + "} = " + x + "$.",
          "Replace the second column: $" + vm2(a, e, c, f) + " = " + dy + "$, so $y = \\dfrac{" + dy + "}{" + det + "} = " + y + "$.",
          "Check: $" + par(a) + " \\cdot " + par(x) + " + " + par(b) + " \\cdot " + par(y) + " = " + e + "$ ✓ and $" + par(c) + " \\cdot " + par(x) + " + " + par(d) + " \\cdot " + par(y) + " = " + f + "$ ✓."
        ],
        verify: function () { return dx === det * x && dy === det * y && a * x + b * y === e && c * x + d * y === f; }
      };
    }
  });
})();
