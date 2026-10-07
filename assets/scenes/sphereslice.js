/* ===========================================================================
   Basic Mathematics — scene "sphereslice" (Chapter 8, §8.3 "Slicing a sphere")
   The circle sentence one dimension up. The sphere x² + y² + z² = 25, cut by
   the horizontal plane z = c, leaves the circle x² + y² = 25 − c², of radius
   √(25 − c²). A right triangle from the centre shows why: hypotenuse R = 5 to
   a point of the circle, one leg c up the z-axis, the other leg the slice's
   radius across the plane. Move the plane with the slider or its handle.
   =========================================================================== */
(function () {
  "use strict";
  if (!window.BM3D || !window.BM3D.define) return;
  var V = window.BM3D.V;

  var R = 5;          /* the sphere's radius */
  var L = 5.4;        /* half the side of the square drawn for the plane */
  var AZ = -60, EL = 18;
  /* screen-right in the default view; the triangle stands in the vertical plane through
     the z-axis that faces that view, reaching to the left (where no axis is labelled), so
     its right angle shows true and its horizontal leg runs straight across the stage */
  var RIGHT = [Math.sin(-AZ * Math.PI / 180), Math.cos(-AZ * Math.PI / 180), 0];
  var U = [-RIGHT[0], -RIGHT[1], 0];
  /* toward the viewer, along the floor: the back of the circle is C − r·NEAR */
  var NEAR = [Math.cos(AZ * Math.PI / 180), Math.sin(AZ * Math.PI / 180), 0];
  /* where the handle sits: the right-hand edge of the square, straight out along RIGHT */
  var EDGE = V.scale(RIGHT, L / RIGHT[0]);

  function sgn(v) { return v < 0 ? "−" + Math.abs(v) : String(v); }
  function sqTerm(v) { return v < 0 ? "(−" + Math.abs(v) + ")²" : v + "²"; }
  function left(c) { return R * R - c * c; }
  function root(n) {
    var r = Math.sqrt(n);
    return Math.abs(r - Math.round(r)) < 1e-9 ? String(Math.round(r)) : null;
  }
  function round3(v) { return String(Math.round(v * 1000) / 1000); }
  function radiusText(n) {
    var r = root(n);
    return r ? "√" + n + " = " + r : "√" + n + " ≈ " + round3(Math.sqrt(n));
  }
  function circle(c, r, n) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var t = (i / n) * Math.PI * 2;
      pts.push([r * Math.cos(t), r * Math.sin(t), c]);
    }
    return pts;
  }

  window.BM3D.define("sphereslice", {
    label: "A sphere of radius 5 cut by a horizontal plane, the circle where they meet, and the right triangle from the center to that circle",
    sibling: "circleeq",
    view: {
      az: AZ, el: EL, center: [0, 0, 0], radius: 7,
      presets: [["3D", AZ, EL], ["from the side", AZ, 0], ["from above", -90, 90]]
    },
    state: { c: 1 },

    controls: function (api) {
      api.slider("height c", -R, R, 1, "c", sgn);
      api.handle({
        name: "the plane",
        tone: "curve",
        at: function (s) { return [EDGE[0], EDGE[1], s.c]; },
        axis: [0, 0, 1],
        move: function (s, p) { s.c = Math.max(-R, Math.min(R, Math.round(p[2]))); }
      });
    },

    draw: function (g, s, api) {
      var quiz = api.quiz(), c = s.c, n = left(c), r = Math.sqrt(n);
      var O = [0, 0, 0], C = [0, 0, c], P = V.add(C, V.scale(U, r));
      var up = c >= 0, flat = r > 1e-9;

      /* the axes run through the centre of the sphere */
      g.arrow([-6.2, 0, 0], [6.6, 0, 0], { tone: "axis", w: 1.5, head: 9 });
      g.arrow([0, -6.2, 0], [0, 6.6, 0], { tone: "axis", w: 1.5, head: 9 });
      g.arrow([0, 0, -6.4], [0, 0, 6.9], { tone: "axis", w: 1.5, head: 9 });
      g.label([6.6, 0, 0], "x", { tone: "muted", dy: 18, weight: 650 });
      g.label([0, 6.6, 0], "y", { tone: "muted", dy: 18, weight: 650 });
      g.label([0, 0, 6.9], "z", { tone: "muted", dx: 12, dy: 4, weight: 650 });

      /* the sphere, see-through, and the cutting plane as a square of side 2L */
      g.sphere(O, R, { tone: "faceA", alpha: 0.32 });
      g.face([[-L, -L, c], [L, -L, c], [L, L, c], [-L, L, c]], { tone: "faceC", alpha: 0.42, stroke: "muted", w: 1 });
      g.label([-L, -L, c], "z = " + sgn(c), { tone: "muted", dx: -8, dy: 5, anchor: "end", weight: 650 });

      /* the right triangle: up the z-axis to C, across the plane to P on the circle */
      if (c && flat) {
        g.face([O, C, P], { tone: "faceB", alpha: 0.8 });
        g.right(C, V.sub(O, C), U, { size: 0.45 });
      }
      if (c) g.seg(O, C, { tone: "curve4", w: 3 });
      if (c && flat) g.seg(C, P, { tone: "curve2", w: 3 });
      g.seg(O, P, { tone: c ? "ink" : "curve2", w: c ? 2.5 : 3 });

      /* the circle of intersection; at the top or bottom it has shrunk to a point */
      if (flat) {
        g.path(circle(c, r, 72), { tone: "curve", w: 3.5, closed: true });
        g.dot(P, { r: 4.5, tone: "curve" });
      } else {
        g.dot(C, { r: 6, tone: "curve" });
      }
      g.dot(O, { r: 4 });

      /* labels, each on the side of its segment away from the triangle */
      g.label(O, "O", up ? { dx: 10, dy: 17, anchor: "start", minor: true } : { dx: -10, dy: -8, anchor: "end", minor: true });
      if (c) g.label(V.lerp(O, C, 0.5), "c = " + sgn(c), { tone: "curve4", dx: 10, dy: 5, anchor: "start" });
      if (c && flat) {
        g.label(V.lerp(O, P, 0.5), "R = " + R, { tone: "ink", dx: -6, dy: up ? 18 : -10, anchor: "end" });
        g.label(V.lerp(C, P, 0.5), quiz ? "r" : "r = " + (root(n) || "√" + n), { tone: "curve2", dy: up ? -10 : 21 });
      } else if (flat) {
        g.label(V.lerp(O, P, 0.5), quiz ? "r = R" : "r = R = " + R, { tone: "curve2", dy: -10 });
      } else {
        g.label(V.lerp(O, C, 0.5), "R = " + R, { tone: "ink", dx: -10, dy: 5, anchor: "end" });
      }
      if (!quiz) {
        /* the slice's own equation, right of the z-axis on the side of the circle away
           from O: behind it when the plane is above O, in front of it when below */
        if (flat) {
          g.label(V.add(C, V.scale(NEAR, up ? -r : r)), "x² + y² = " + n,
            { tone: "curve", dx: 8, dy: up ? -8 : 20, anchor: "start", weight: 650, minor: true });
        } else {
          g.label(C, "the point (0, 0, " + sgn(c) + ")", { tone: "curve", dx: -12, dy: up ? -10 : 22, anchor: "end", weight: 650 });
        }
      }
    },

    say: function (s, quiz) {
      var c = s.c, n = left(c);
      if (quiz) return "The plane is at height c = " + sgn(c) + ".";
      var head = "At height " + sgn(c) + " the slice is <b>x² + y² = 25 − " + sqTerm(c) + " = " + n + "</b>, ";
      if (!n) return head + "so only x = y = 0 is left: <b>a single point</b>, (0, 0, " + sgn(c) + ").";
      return head + "a circle of radius " + radiusText(n) + (c ? "." : ", the widest slice.");
    },

    answer: function (s) { return s.c; },

    missions: [
      { text: "Cut a slice of radius 4.", test: function (s) { return left(s.c) === 16; } },
      { text: "Cut a slice of radius 3.", test: function (s) { return left(s.c) === 9; } },
      { text: "Make the slice a single point.", test: function (s) { return left(s.c) === 0; } }
    ],

    cases: [
      { set: { c: 4 }, answer: "4|-4" },
      { set: { c: -4 }, answer: "4|-4" },
      { set: { c: 3 }, not: "4|-4" },
      { set: { c: 1 }, not: "4|-4" },
      { set: { c: -5 }, answer: "-5", not: "4|-4" }
    ]
  });
})();
