/* data/gen/part2.js — Arena generators for Part II: Chapters 5–7.
   Angles are in degrees, as in the chapters; areas involving a circle are asked
   "in terms of π" and typed like 9pi (the grader reads π as pi). */
(function () {
  "use strict";
  var G = window.BMGen;
  if (!G) return;
  var u = G.u, fracAns = u.fracAns, fracTex = u.fracTex;

  /* primitive Pythagorean triples, legs first */
  var TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29], [9, 40, 41]];
  function triple(r, maxC) {
    var t, k, guard = 0;
    do { t = r.pick(TRIPLES); k = r.int(1, 6); } while (t[2] * k > maxC && guard++ < 40);
    if (t[2] * k > maxC) { t = TRIPLES[0]; k = 1; }
    return [t[0] * k, t[1] * k, t[2] * k];
  }

  /* ------------------------------------------------------- Chapter 5 ---- */

  G.add({
    id: "angle-pair", section: "ch05#angles", par: 30, timed: true,
    make: function (r) {
      var t = r.int(2, 34) * 5, kind = r.pick(["supplement", "next", "rest"]);
      if (t === 90) t = 95;
      if (kind === "supplement") {
        return {
          q: "An angle measures $" + t + "°$. What is its supplement, in degrees?",
          type: "number", answer: String(180 - t),
          hint: "Supplementary angles together make a straight line.",
          steps: ["Supplementary angles add to $180°$.", "$180° - " + t + "° = " + (180 - t) + "°$."],
          verify: function () { return t + (180 - t) === 180; }
        };
      }
      if (kind === "next") {
        return {
          q: "Two lines cross. One of the four angles is $" + t + "°$. How large, in degrees, is the angle next to it?",
          type: "number", answer: String(180 - t),
          hint: "Two neighbouring angles at a crossing lie along one of the lines.",
          steps: [
            "The angle next to it shares a side with it, and together they make a straight line.",
            "So it measures $180° - " + t + "° = " + (180 - t) + "°$."
          ],
          verify: function () { return 2 * t + 2 * (180 - t) === 360; }
        };
      }
      return {
        q: "Two lines cross. One of the four angles is $" + t + "°$. What is the sum, in degrees, of the other three?",
        type: "number", answer: String(360 - t),
        hint: "Find each of the other three from the one you know: neighbours make a straight line, opposite angles are equal.",
        steps: [
          "The two neighbours each measure $180° - " + t + "° = " + (180 - t) + "°$, and the opposite angle is vertical to it, so it is $" + t + "°$.",
          "The sum is $" + (180 - t) + "° + " + (180 - t) + "° + " + t + "° = " + (360 - t) + "°$."
        ],
        verify: function () { return 2 * (180 - t) + t === 360 - t; }
      };
    }
  });

  G.add({
    id: "tri-angle", section: "ch05#parallels", par: 30, timed: true,
    make: function (r) {
      var kind = r.pick(["two", "two", "apex", "base"]);
      if (kind === "two") {
        var a = r.int(15, 100), b = r.int(15, 160 - a), c = 180 - a - b;
        return {
          q: "Two angles of a triangle are $" + a + "°$ and $" + b + "°$. What is the third, in degrees?",
          type: "number", answer: String(c),
          hint: "Use the angle sum of a triangle.",
          steps: ["The three angles of a triangle add to $180°$.", "$180° - " + a + "° - " + b + "° = " + c + "°$."],
          verify: function () { return a + b + c === 180 && c > 0; }
        };
      }
      if (kind === "apex") {
        var apex = r.int(10, 80) * 2, each = (180 - apex) / 2;
        return {
          q: "An isosceles triangle has the angle between its two equal sides equal to $" + apex + "°$. How large is each of the other two angles?",
          type: "number", answer: String(each),
          hint: "The two angles opposite the equal sides are equal; then use the angle sum.",
          steps: [
            "The other two angles are equal; call each $x$. The angle sum gives $" + apex + "° + 2x = 180°$.",
            "So $2x = " + (180 - apex) + "°$ and $x = " + each + "°$."
          ],
          verify: function () { return apex + 2 * each === 180; }
        };
      }
      var base = r.int(20, 85), top = 180 - 2 * base;
      return {
        q: "An isosceles triangle has two equal angles of $" + base + "°$ each. How large is its third angle?",
        type: "number", answer: String(top),
        hint: "Use the angle sum of a triangle.",
        steps: ["The angles add to $180°$, and two of them are $" + base + "°$.", "$180° - 2 \\cdot " + base + "° = " + top + "°$."],
        verify: function () { return 2 * base + top === 180 && top > 0; }
      };
    }
  });

  G.add({
    id: "pyth-side", section: "ch05#pythagoras", par: 50, timed: true,
    make: function (r) {
      var t = triple(r, 85), a = t[0], b = t[1], c = t[2], kind = r.pick(["hyp", "hyp", "leg", "rect"]);
      if (r.chance(0.5)) { var s = a; a = b; b = s; }
      if (kind === "hyp") {
        return {
          q: "A right triangle has legs $" + a + "$ and $" + b + "$. How long is the hypotenuse?",
          type: "number", answer: String(c),
          hint: "The square on the hypotenuse is the sum of the squares on the legs.",
          steps: ["$c^2 = " + a + "^2 + " + b + "^2 = " + a * a + " + " + b * b + " = " + c * c + "$.", "$c = \\sqrt{" + c * c + "} = " + c + "$."],
          verify: function () { return a * a + b * b === c * c; }
        };
      }
      if (kind === "leg") {
        return {
          q: "A right triangle has hypotenuse $" + c + "$ and one leg $" + a + "$. How long is the other leg?",
          type: "number", answer: String(b),
          hint: "Write Pythagoras with the unknown leg, then subtract.",
          steps: ["$" + a + "^2 + b^2 = " + c + "^2$, so $b^2 = " + c * c + " - " + a * a + " = " + b * b + "$.", "$b = \\sqrt{" + b * b + "} = " + b + "$."],
          verify: function () { return a * a + b * b === c * c; }
        };
      }
      return {
        q: "A rectangle is $" + a + "$ wide and has a diagonal of length $" + c + "$. How tall is it?",
        type: "number", answer: String(b),
        hint: "The diagonal cuts the rectangle into two right triangles.",
        steps: [
          "The width, the height and the diagonal form a right triangle with the diagonal as hypotenuse.",
          "$h^2 = " + c + "^2 - " + a + "^2 = " + c * c + " - " + a * a + " = " + b * b + "$, so $h = " + b + "$."
        ],
        verify: function () { return a * a + b * b === c * c; }
      };
    }
  });

  G.add({
    id: "third-side", section: "ch05#distance", par: 40, timed: true,
    make: function (r) {
      var a = r.int(2, 12), b = r.int(a + 1, a + 14), small = r.chance(0.6);
      var lo = b - a + 1, hi = a + b - 1;
      return {
        q: "Two sides of a triangle are $" + a + "$ and $" + b + "$, and its three vertices are not on one line. What is the " +
          (small ? "smallest" : "largest") + " whole number the third side can be?",
        type: "number", answer: String(small ? lo : hi),
        hint: "Apply the triangle inequality to each side in turn: no side can be as long as the other two together.",
        steps: [
          "With the vertices not on a line, each side is strictly shorter than the other two together.",
          "So the third side $c$ needs $" + b + " < " + a + " + c$, that is $c > " + (b - a) + "$, and $c < " + a + " + " + b + " = " + (a + b) + "$.",
          "The " + (small ? "smallest" : "largest") + " whole number allowed is $" + (small ? lo : hi) + "$."
        ],
        verify: function () {
          function ok(c) { return c < a + b && a < b + c && b < a + c; }
          return small ? ok(lo) && !ok(lo - 1) : ok(hi) && !ok(hi + 1);
        }
      };
    }
  });

  /* ------------------------------------------------------- Chapter 6 ---- */

  /* the standard mappings of §6.1, as formula text and as functions */
  function motion(r) {
    var kind = r.pick(["trans", "xaxis", "yaxis", "diag", "half"]);
    if (kind === "trans") {
      var a = r.nonzero(-6, 6), b = r.nonzero(-6, 6);
      return {
        name: "the translation $(x,y) \\mapsto (" + u.shift("x", a) + ",\\; " + u.shift("y", b) + ")$",
        rule: "(" + u.shift("x", a) + ",\\; " + u.shift("y", b) + ")", kind: kind, a: a, b: b,
        f: function (p) { return [p[0] + a, p[1] + b]; }
      };
    }
    return {
      xaxis: { name: "reflection in the $x$-axis", rule: "(x, -y)", kind: kind, f: function (p) { return [p[0], -p[1]]; } },
      yaxis: { name: "reflection in the $y$-axis", rule: "(-x, y)", kind: kind, f: function (p) { return [-p[0], p[1]]; } },
      diag: { name: "reflection in the line $y = x$", rule: "(y, x)", kind: kind, f: function (p) { return [p[1], p[0]]; } },
      half: { name: "rotation by $180°$ about the origin", rule: "(-x, -y)", kind: kind, f: function (p) { return [-p[0], -p[1]]; } }
    }[kind];
  }

  G.add({
    id: "map-point", section: "ch06#mappings-plane", par: 40, timed: true,
    make: function (r) {
      var m = motion(r), p = [r.nonzero(-9, 9), r.nonzero(-9, 9)], q = m.f(p);
      return {
        q: "Where does " + m.name + " send the point $" + u.ptTex(p[0], p[1]) + "$?",
        type: "exact", answer: u.ptAns(q[0], q[1]),
        placeholder: "e.g. (3,-2)",
        hint: "Write down the mapping's formula, then put the point's coordinates into it.",
        steps: [
          "In coordinates this mapping is $(x,y) \\mapsto " + m.rule + "$.",
          "With $x = " + p[0] + "$ and $y = " + p[1] + "$ the image is $" + u.ptTex(q[0], q[1]) + "$."
        ],
        verify: function () {
          /* straight from the formulas of §6.1 */
          var x = p[0], y = p[1], want = {
            trans: [x + m.a, y + m.b], xaxis: [x, -y], yaxis: [-x, y], diag: [y, x], half: [-x, -y]
          }[m.kind];
          return want[0] === q[0] && want[1] === q[1];
        }
      };
    }
  });

  G.add({
    id: "compose-motions", section: "ch06#isometries", par: 60, timed: true,
    make: function (r) {
      var F = motion(r), Gm = motion(r), guard = 0;
      while (Gm.kind === F.kind && guard++ < 20) Gm = motion(r);
      var p = [r.nonzero(-7, 7), r.nonzero(-7, 7)], mid = F.f(p), end = Gm.f(mid);
      return {
        q: "Let $F(x,y) = " + F.rule + "$ and $G(x,y) = " + Gm.rule + "$. Compute $(G \\circ F)" + u.ptTex(p[0], p[1]) + "$, that is, apply $F$ first and then $G$.",
        type: "exact", answer: u.ptAns(end[0], end[1]),
        placeholder: "e.g. (3,-2)",
        hint: "Do the motions one at a time, in the order given, keeping both coordinates.",
        steps: [
          "$G \\circ F$ means: do $F$, then $G$.",
          "$F" + u.ptTex(p[0], p[1]) + " = " + u.ptTex(mid[0], mid[1]) + "$.",
          "$G" + u.ptTex(mid[0], mid[1]) + " = " + u.ptTex(end[0], end[1]) + "$."
        ],
        verify: function () {
          /* the composite is an isometry: distances from the image of the origin agree */
          var o = Gm.f(F.f([0, 0]));
          var d1 = p[0] * p[0] + p[1] * p[1], d2 = Math.pow(end[0] - o[0], 2) + Math.pow(end[1] - o[1], 2);
          return d1 === d2 && end[0] === Gm.f(F.f(p))[0] && end[1] === Gm.f(F.f(p))[1];
        }
      };
    }
  });

  /* ------------------------------------------------------- Chapter 7 ---- */

  G.add({
    id: "area-scale", section: "ch07#scaling", par: 40, timed: true,
    make: function (r) {
      var kind = r.pick(["factor", "new", "back"]);
      if (kind === "factor") {
        var f = r.pick([[2, 1], [3, 1], [4, 1], [5, 1], [1, 2], [1, 3], [3, 2], [2, 3], [5, 2]]);
        return {
          q: "Every length of a figure is multiplied by $" + fracTex(f[0], f[1]) + "$. By what factor is its area multiplied?",
          type: "fraction", answer: fracAns(f[0] * f[0], f[1] * f[1]),
          hint: "Area scales by the square of the length factor.",
          steps: ["Scaling lengths by $r$ scales areas by $r^2$.", "$\\left(" + fracTex(f[0], f[1]) + "\\right)^2 = " + fracTex(f[0] * f[0], f[1] * f[1]) + "$."],
          verify: function () { return Math.abs(Math.pow(f[0] / f[1], 2) - (f[0] * f[0]) / (f[1] * f[1])) < 1e-12; }
        };
      }
      if (kind === "new") {
        var A = r.int(2, 30), k = r.int(2, 5);
        return {
          q: "A figure has area $" + A + "$. Every length in it is multiplied by $" + k + "$. What is the area of the new figure?",
          type: "number", answer: String(A * k * k),
          hint: "Lengths and areas do not scale by the same factor.",
          steps: ["Lengths times $" + k + "$ means area times $" + k + "^2 = " + k * k + "$.", "$" + A + " \\cdot " + k * k + " = " + A * k * k + "$."],
          verify: function () { return A * k * k / A === k * k; }
        };
      }
      var A0 = r.int(2, 12), m = r.int(2, 7);
      return {
        q: "A figure of area $" + A0 + "$ is scaled to a figure of area $" + A0 * m * m + "$. By what factor was every length multiplied?",
        type: "number", answer: String(m),
        hint: "Compare the two areas first; the length factor is related to that ratio by a square.",
        steps: [
          "The area grew by the factor $\\frac{" + A0 * m * m + "}{" + A0 + "} = " + m * m + "$.",
          "Area scales by $r^2$, so $r^2 = " + m * m + "$ and $r = " + m + "$."
        ],
        verify: function () { return m * m * A0 === A0 * m * m && m > 0; }
      };
    }
  });

  G.add({
    id: "flat-area", section: "ch07#polygons", par: 40, timed: true,
    make: function (r) {
      var kind = r.pick(["tri", "tri", "trap", "right"]);
      if (kind === "tri") {
        var b = r.int(3, 20), h = r.int(2, 16);
        if ((b * h) % 2) b++;
        return {
          q: "A triangle has base $" + b + "$ and height $" + h + "$. What is its area?",
          type: "number", answer: String(b * h / 2),
          hint: "A triangle is half of a rectangle with the same base and height.",
          steps: ["Area $= \\tfrac12 \\cdot \\text{base} \\cdot \\text{height}$.", "$\\tfrac12 \\cdot " + b + " \\cdot " + h + " = " + b * h / 2 + "$."],
          verify: function () { return 2 * (b * h / 2) === b * h; }
        };
      }
      if (kind === "trap") {
        var p = r.int(3, 14), q = r.int(p + 1, p + 10), t = r.int(2, 10);
        if (((p + q) * t) % 2) t++;
        return {
          q: "A trapezium has parallel sides $" + p + "$ and $" + q + "$, and the perpendicular distance between them is $" + t + "$. What is its area?",
          type: "number", answer: String((p + q) * t / 2),
          hint: "Cut it along a diagonal into two triangles that share the same height.",
          steps: [
            "A diagonal splits it into triangles with bases $" + p + "$ and $" + q + "$, both of height $" + t + "$.",
            "Area $= \\tfrac12 \\cdot " + p + " \\cdot " + t + " + \\tfrac12 \\cdot " + q + " \\cdot " + t + " = \\tfrac12 (" + p + " + " + q + ") \\cdot " + t + " = " + (p + q) * t / 2 + "$."
          ],
          verify: function () { return p * t / 2 + q * t / 2 === (p + q) * t / 2; }
        };
      }
      var legs = triple(r, 60);
      return {
        q: "A right triangle has sides $" + legs[0] + "$, $" + legs[1] + "$ and $" + legs[2] + "$. What is its area?",
        type: "number", answer: String(legs[0] * legs[1] / 2),
        hint: "Decide which two sides meet at the right angle; one of them can serve as the base and the other as the height.",
        steps: [
          "$" + legs[0] + "^2 + " + legs[1] + "^2 = " + legs[2] + "^2$, so the right angle is between the sides $" + legs[0] + "$ and $" + legs[1] + "$.",
          "Area $= \\tfrac12 \\cdot " + legs[0] + " \\cdot " + legs[1] + " = " + legs[0] * legs[1] / 2 + "$."
        ],
        verify: function () { return legs[0] * legs[0] + legs[1] * legs[1] === legs[2] * legs[2] && (legs[0] * legs[1]) % 2 === 0; }
      };
    }
  });

  G.add({
    id: "disc-area", section: "ch07#disc", par: 45, timed: true,
    make: function (r) {
      var kind = r.pick(["radius", "diameter", "ring"]);
      if (kind === "ring") {
        var r1 = r.int(1, 8), r2 = r1 + r.int(1, 6), k = r2 * r2 - r1 * r1;
        return {
          q: "A ring lies between two circles with the same centre, of radii $" + r1 + "$ and $" + r2 + "$. What is its area? Give the exact value in terms of $\\pi$.",
          type: "expr", answer: u.piAns(k, 1),
          placeholder: "e.g. 9pi",
          hint: "The ring is the larger disc with the smaller disc taken out.",
          steps: ["Area $= \\pi \\cdot " + r2 + "^2 - \\pi \\cdot " + r1 + "^2 = \\pi(" + r2 * r2 + " - " + r1 * r1 + ")$.", "$= " + u.piTex(k, 1) + "$."],
          verify: function () { return Math.abs(Math.PI * r2 * r2 - Math.PI * r1 * r1 - k * Math.PI) < 1e-9; }
        };
      }
      var rad = r.int(2, 12), dia = kind === "diameter";
      return {
        q: "A circle has " + (dia ? "diameter $" + 2 * rad : "radius $" + rad) + "$. What is the area of the disc it bounds? Give the exact value in terms of $\\pi$.",
        type: "expr", answer: u.piAns(rad * rad, 1),
        placeholder: "e.g. 9pi",
        hint: dia ? "The area formula uses the radius, which is half the diameter." : "Area of a disc is π times the square of the radius.",
        steps: (dia ? ["The radius is half the diameter: $" + rad + "$."] : []).concat([
          "Area $= \\pi r^2 = \\pi \\cdot " + rad + "^2 = " + u.piTex(rad * rad, 1) + "$."
        ]),
        verify: function () { return Math.abs(Math.PI * Math.pow((dia ? 2 * rad : rad) / (dia ? 2 : 1), 2) - rad * rad * Math.PI) < 1e-9; }
      };
    }
  });

  G.add({
    id: "circumference", section: "ch07#circumference", par: 40, timed: true,
    make: function (r) {
      var kind = r.pick(["radius", "diameter", "back"]);
      if (kind === "back") {
        var rr = r.int(2, 15), askD = r.chance(0.5);
        return {
          q: "A circle has circumference $" + u.piTex(2 * rr, 1) + "$. What is its " + (askD ? "diameter" : "radius") + "?",
          type: "number", answer: String(askD ? 2 * rr : rr),
          hint: "Circumference is π times the diameter; undo that.",
          steps: [
            "$C = \\pi d$, so $" + u.piTex(2 * rr, 1) + " = \\pi d$ and $d = " + 2 * rr + "$.",
            askD ? "The diameter is $" + 2 * rr + "$." : "The radius is half of that: $" + rr + "$."
          ],
          verify: function () { return Math.abs(2 * Math.PI * rr - Math.PI * 2 * rr) < 1e-9; }
        };
      }
      var rad = r.int(2, 15), dia = kind === "diameter", k = 2 * rad;
      return {
        q: "A circle has " + (dia ? "diameter $" + k : "radius $" + rad) + "$. What is its circumference? Give the exact value in terms of $\\pi$.",
        type: "expr", answer: u.piAns(k, 1),
        placeholder: "e.g. 6pi",
        hint: "π is the ratio of circumference to diameter.",
        steps: dia
          ? ["$C = \\pi d = \\pi \\cdot " + k + " = " + u.piTex(k, 1) + "$."]
          : ["The diameter is $2 \\cdot " + rad + " = " + k + "$.", "$C = \\pi d = " + u.piTex(k, 1) + "$."],
        verify: function () { return Math.abs(2 * Math.PI * rad - k * Math.PI) < 1e-9; }
      };
    }
  });
})();
