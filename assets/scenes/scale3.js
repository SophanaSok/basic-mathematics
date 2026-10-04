/* ===========================================================================
   Basic Mathematics — scene "scale3" (Chapter 7, §7.2 "Scaling")
   The scaling law one dimension up. A unit solid (a cube, or an L-block of
   three cubes) stands beside its copy scaled by r, and the copy is built from
   small copies of the cube: r along an edge, r² on a face, r³ in all, in r
   layers of r² each. One edge and one face of the small solid are marked, with
   their images on the big one. Set r with the slider or drag the corner of the
   marked face; pull the layers apart to count them.
   =========================================================================== */
(function () {
  "use strict";
  if (!window.BM3D || !window.BM3D.define) return;
  var V = window.BM3D.V;
  var DEG = Math.PI / 180;
  var AZ = -60, EL = 22;
  var GAP = 0.55;   /* the space between layers when they are pulled apart */
  var LIFT = 0.03;  /* the marked face sits just in front of the cube faces it covers */
  var EDGE = 0.08;  /* and the marked edge a little further, so the flat picture sorts it on top */

  /* each shape as unit cells [x, y, 0], with its footprint W by D; the marked edge and
     face belong to the cell at the origin, on its front (y = 0) side */
  var SHAPES = {
    cube: { cells: [[0, 0, 0]], W: 1, D: 1 },
    L: { cells: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], W: 2, D: 2 }
  };
  function shapeOf(s) { return SHAPES[s.shape] || SHAPES.cube; }
  /* where the small solid stands: one empty unit to the left of the big one */
  function leftOf(sh) { return -(sh.W + 1); }
  /* the height of layer k's floor, and the top of the big solid */
  function floorOf(s, k) { return k * (1 + s.gap); }
  function topOf(s) { return floorOf(s, s.r - 1) + 1; }

  /* Frame the two solids for the default view: project the box around them onto the
     screen directions and pick the centre and radius that fill the stage, with a margin
     for the labels. */
  function frame(s) {
    var sh = shapeOf(s), a = AZ * DEG, e = EL * DEG;
    var right = [-Math.sin(a), Math.cos(a), 0];
    var up = [-Math.sin(e) * Math.cos(a), -Math.sin(e) * Math.sin(a), Math.cos(e)];
    var lo = [leftOf(sh), 0, 0], hi = [s.r * sh.W, Math.max(s.r, 1) * sh.D, topOf(s)];
    var mid = V.scale(V.add(lo, hi), 0.5);
    var u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (var c = 0; c < 8; c++) {
      var p = [c & 1 ? hi[0] : lo[0], c & 2 ? hi[1] : lo[1], c & 4 ? hi[2] : lo[2]];
      var d = V.sub(p, mid), u = V.dot(d, right), v = V.dot(d, up);
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    var centre = V.add(mid, V.add(V.scale(right, (u0 + u1) / 2), V.scale(up, (v0 + v1) / 2)));
    var radius = Math.max((v1 - v0) / 2 / 1.1, (u1 - u0) / 2 / 1.57) * 1.2;
    return { center: centre, radius: Math.max(radius, 2) };
  }

  /* the cells of the big solid: every cell of the shape becomes an r × r × r block */
  function bigCells(s) {
    var sh = shapeOf(s), r = s.r, out = [];
    sh.cells.forEach(function (c) {
      for (var k = 0; k < r; k++) {
        for (var j = 0; j < r; j++) {
          for (var i = 0; i < r; i++) out.push([c[0] * r + i, c[1] * r + j, floorOf(s, c[2] * r + k)]);
        }
      }
    });
    return out;
  }
  /* one unit square of the marked face, on the plane y = 0 */
  function square(g, x, z) {
    g.face([[x, -LIFT, z], [x + 1, -LIFT, z], [x + 1, -LIFT, z + 1], [x, -LIFT, z + 1]],
      { tone: "faceB", stroke: "curve2", w: 1.25 });
  }
  function layers(r, per) { return r + (r === 1 ? " layer of " : " layers of ") + per; }

  window.BM3D.define("scale3", {
    label: "A small solid beside a copy of it scaled by r, built from small cubes, with one edge and one face marked on both",
    sibling: "scaling",
    view: {
      az: AZ, el: EL, center: [0, 1, 1], radius: 2.6,
      fit: frame,
      presets: [["3D", AZ, EL], ["from the front", -90, 0], ["from above", -90, 90]]
    },
    state: { r: 2, shape: "cube", apart: false, gap: 0 },

    controls: function (api, s) {
      api.slider("r", 1, 4, 1, "r");
      api.chips([{ label: "cube", value: "cube" }, { label: "L-block", value: "L" }], "shape", "Shape");
      var pull = api.button(function (s) {
        if (pull) pull.setAttribute("aria-pressed", s.apart ? "true" : "false");
        return "Pull the layers apart";
      }, function (s, api) {
        s.apart = !s.apart;
        var from = s.gap, to = s.apart ? GAP : 0;
        api.animate(450, function (u) { s.gap = from + (to - from) * u; });
      });
      /* the corner of the marked face on the big solid sits at (r, 0, top): drag it out
         along the diagonal of that face and r follows */
      api.handle({
        name: "the corner of the marked face",
        tone: "curve2",
        at: function (s) { return [s.r, 0, topOf(s)]; },
        axis: V.norm([1, 0, 1]),
        step: Math.SQRT2,
        move: function (s, p) { s.r = Math.max(1, Math.min(4, Math.round(p[0]))); }
      });
    },

    draw: function (g, s, api) {
      var sh = shapeOf(s), r = s.r, quiz = api.quiz(), ox = leftOf(sh), top = topOf(s);
      var n = sh.cells.length, k, i;
      g.grid({ z: -0.01, min: [ox - 1, -1], max: [r * sh.W + 1, r * sh.D + 1], step: 1 });
      /* the small solid and the big one, both in unit cubes */
      g.cubes(sh.cells.map(function (c) { return [ox + c[0], c[1], c[2]]; }), { tone: "faceA", stroke: "axis" });
      g.cubes(bigCells(s), { tone: "faceA", stroke: "axis" });
      /* the marked face: one unit square, and its image of r × r squares */
      square(g, ox, 0);
      for (k = 0; k < r; k++) {
        for (i = 0; i < r; i++) square(g, i, floorOf(s, k));
      }
      /* the marked edge: the bottom of that face, 1 and then r long */
      g.seg([ox, -EDGE, 0], [ox + 1, -EDGE, 0], { tone: "curve", w: 4 });
      g.seg([0, -EDGE, 0], [r, -EDGE, 0], { tone: "curve", w: 4 });
      g.label([ox + 0.5, 0, 0], "1", { tone: "curve", dy: 25, weight: 700 });
      g.label([r / 2, 0, 0], String(r), { tone: "curve", dy: 25, weight: 700 });
      if (!quiz) {
        g.label([ox + 0.5, 0, 0.5], "1", { tone: "curve2", dy: 5, weight: 700, minor: true });
        /* the face count sits on a square of the middle layer, not in a gap between layers */
        g.label([Math.floor(r / 2) + 0.5, 0, floorOf(s, Math.floor((r - 1) / 2)) + 0.5], String(r * r), { tone: "curve2", dy: 5, weight: 700, minor: true });
        g.label([ox + sh.W / 2, sh.D / 2, 1], n + (n === 1 ? " cube" : " cubes"), { tone: "ink", dy: -16, minor: true });
        /* the count goes over the last block, clear of the handle at the front corner */
        var last = sh.cells[n - 1];
        g.label([(last[0] + 0.5) * r, (last[1] + 0.5) * r, top], n * r * r * r + " cubes", { tone: "ink", dy: -16, weight: 650, minor: true });
      }
    },

    say: function (s, quiz) {
      var r = s.r, n = shapeOf(s).cells.length;
      if (quiz) return "r = " + r + ". Edge 1 → " + r + ".";
      return "Edge 1 → " + r + " (×" + r + "). Face 1 → " + r * r + " (×" + r + "²).<br>" +
        "<b>Volume " + n + " → " + n * r * r * r + " (×" + r + "³)</b>: " + layers(r, n * r * r) + ".";
    },

    answer: function (s) { return s.r; },

    missions: [
      { text: "Make the volume 27 times the original.", test: function (s) { return s.r === 3; } },
      { text: "Pull the layers apart.", test: function (s) { return !!s.apart; } },
      { text: "With the L-block, make a solid of 81 cubes.", test: function (s) {
          return s.shape === "L" && 3 * s.r * s.r * s.r === 81;
        } }
    ],

    cases: [
      { set: { r: 3 }, answer: "3" },
      { set: { r: 3, shape: "L", apart: true, gap: GAP }, answer: "3" },
      { set: { r: 2 }, not: "3" },
      { set: { r: 4, shape: "L" }, not: "3" },
      { set: { r: 1 }, answer: "1", not: "3" }
    ],

    /* once solved, pull the layers apart so the r³ count can be read off */
    reveal: function (api) {
      var s = api.state;
      if (s.apart) return;
      s.apart = true;
      api.animate(450, function (u) { s.gap = GAP * u; });
    }
  });
})();
