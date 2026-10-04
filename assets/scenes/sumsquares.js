/* ===========================================================================
   Basic Mathematics — scene "sumsquares" (Chapter 15, §15.2)
   Why 1² + 2² + … + n² = n(n + 1)(2n + 1)/6. A stepped pyramid with layers
   1², 2², …, n² holds the sum in unit cubes. Three copies make a block n wide
   and n + 1 tall with a staircase on one side; three more, turned over, make
   the same block, and the two staircases interlock in one shared layer: the
   n by n + 1 rectangle of the staircase figure in §15.1. So six pyramids fill
   a box n × (n + 1) × (2n + 1) exactly.

   The pieces, as unit cells indexed from 1 (checked to tile the box for
   n = 1..7: disjoint, filling it, each with layers 1, 4, …, n²):
     A = { z ≤ x, z ≤ y; x, y ≤ n }          layers across z
     B = { y ≤ x ≤ n, y < z ≤ n + 1 }        layers across y
     C = { x < y ≤ n + 1, x < z ≤ n + 1 }    layers across x
   and A′, B′, C′, their images under (x, y, z) → (n + 1 − x, 2n + 2 − y, n + 2 − z).
   The drawing mirrors x (x → n + 1 − x) so that A's steps face the viewer.
   =========================================================================== */
(function () {
  "use strict";
  if (!window.BM3D || !window.BM3D.define) return;
  var V = window.BM3D.V;
  /* a pyramid and its turned-over twin share a hue: strong for the first three; pale for the
     rest, outlined in the strong hue so they stand off the stage in both themes */
  var TONES = ["curve", "curve2", "curve3", "faceA", "faceB", "faceC"];
  var EDGES = ["surface", "surface", "surface", "curve", "curve2", "curve3"];
  var HOME = { az: 30, el: 24 };
  var cache = {};

  function sumSq(n) { return n * (n + 1) * (2 * n + 1) / 6; }
  function terms(n) {
    var t = [];
    for (var k = 1; k <= n; k++) t.push(k * k);
    return t.join(" + ");
  }

  /* the six pieces for this n, as lists of [x, y, z] cells (drawing coordinates, from 1) */
  function pieces(n) {
    if (cache[n]) return cache[n];
    var A = [], B = [], C = [], x, y, z;
    for (x = 1; x <= n + 1; x++) {
      for (y = 1; y <= n + 1; y++) {
        for (z = 1; z <= n + 1; z++) {
          if (z <= x && z <= y && x <= n && y <= n) A.push([x, y, z]);
          if (y <= x && x <= n && y < z) B.push([x, y, z]);
          if (x < y && x < z) C.push([x, y, z]);
        }
      }
    }
    function turn(c) { return [n + 1 - c[0], 2 * n + 2 - c[1], n + 2 - c[2]]; }
    function mirror(c) { return [n + 1 - c[0], c[1], c[2]]; }
    var all = [A, B, C, A.map(turn), B.map(turn), C.map(turn)].map(function (p) { return p.map(mirror); });
    cache[n] = all.map(function (cells) {
      var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      cells.forEach(function (c) {
        for (var i = 0; i < 3; i++) {
          lo[i] = Math.min(lo[i], c[i] - 1);
          hi[i] = Math.max(hi[i], c[i]);
        }
      });
      return { cells: cells, lo: lo, hi: hi };
    });
    return cache[n];
  }

  /* how many pyramids are in the picture: all six in quiz mode, where they stay apart */
  function shown(s, quiz) { return quiz ? 6 : s.copies; }
  function fitted(s) { return s.copies > 1 && s.fit && s.u >= 1; }

  /* where each visible piece sits: apart, the pieces stand on the floor in a row along y,
     in their order (a small extra gap between the two blocks of three); together, each is
     in its place in the box. u slides them from one to the other. */
  function layout(s, quiz) {
    var list = pieces(s.n).slice(0, shown(s, quiz)), u = quiz ? 0 : s.u;
    var lo = 1e9, hi = -1e9, at = 0, offs = [];
    list.forEach(function (p, i) {
      lo = Math.min(lo, p.lo[1]);
      hi = Math.max(hi, p.hi[1]);
      if (i === 3) at += 0.8;
      offs.push([0, at - p.lo[1], -p.lo[2]]);
      at += p.hi[1] - p.lo[1] + 1.2;
    });
    /* centre the row on where the pieces end up */
    var shift = (lo + hi) / 2 - (at - 1.2) / 2;
    return list.map(function (p, i) {
      var off = list.length > 1 ? [0, offs[i][1] + shift, offs[i][2]] : [0, 0, 0];
      return { p: p, tone: TONES[i], edge: EDGES[i], off: V.scale(off, 1 - u) };
    });
  }

  var DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  /* the exposed faces of a set of cells, moved by off; have says which cells hide a face */
  function faces(g, cells, tone, edge, off, have) {
    cells.forEach(function (c) {
      var x = c[0] - 1, y = c[1] - 1, z = c[2] - 1;
      DIRS.forEach(function (d) {
        if (have[(c[0] + d[0]) + "," + (c[1] + d[1]) + "," + (c[2] + d[2])]) return;
        var pts;
        if (d[0]) {
          var X = d[0] > 0 ? x + 1 : x;
          pts = [[X, y, z], [X, y + 1, z], [X, y + 1, z + 1], [X, y, z + 1]];
        } else if (d[1]) {
          var Y = d[1] > 0 ? y + 1 : y;
          pts = [[x, Y, z], [x + 1, Y, z], [x + 1, Y, z + 1], [x, Y, z + 1]];
        } else {
          var Z = d[2] > 0 ? z + 1 : z;
          pts = [[x, y, Z], [x + 1, y, Z], [x + 1, y + 1, Z], [x, y + 1, Z]];
        }
        g.face(pts.map(function (q) { return V.add(q, off); }), { tone: tone, stroke: edge, w: 1 });
      });
    });
  }
  function keys(cells, have) {
    have = have || {};
    cells.forEach(function (c) { have[c.join(",")] = 1; });
    return have;
  }

  /* the box that holds everything drawn, for the frame */
  function extent(s, quiz) {
    var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    layout(s, quiz).forEach(function (it) {
      var a = V.add(it.p.lo, it.off), b = V.add(it.p.hi, it.off);
      for (var i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], a[i]); hi[i] = Math.max(hi[i], b[i]); }
    });
    lo[2] = Math.min(lo[2], 0);
    return { lo: lo, hi: hi };
  }

  window.BM3D.define("sumsquares", {
    label: "Stepped pyramids of unit cubes, with layers 1, 4, 9 and so on, that fit together into a box",
    sibling: "staircase",
    view: {
      az: HOME.az, el: HOME.el, center: [1.5, 2, 1.5], radius: 3.4,
      /* frame what is drawn as seen from the current direction, with room for the labels */
      fit: function (s) {
        var cam = s.cam || { right: [-Math.sin(HOME.az * Math.PI / 180), Math.cos(HOME.az * Math.PI / 180), 0], up: [0, 0, 1] };
        var e = extent(s, s.quizNow), r0 = 1e9, r1 = -1e9, u0 = 1e9, u1 = -1e9;
        for (var k = 0; k < 8; k++) {
          var p = [k & 1 ? e.hi[0] : e.lo[0], k & 2 ? e.hi[1] : e.lo[1], k & 4 ? e.hi[2] : e.lo[2]];
          var a = V.dot(p, cam.right), b = V.dot(p, cam.up);
          r0 = Math.min(r0, a); r1 = Math.max(r1, a); u0 = Math.min(u0, b); u1 = Math.max(u1, b);
        }
        var mid = V.scale(V.add(e.lo, e.hi), 0.5);
        var c = V.add(mid, V.add(V.scale(cam.right, (r0 + r1) / 2 - V.dot(mid, cam.right)),
          V.scale(cam.up, (u0 + u1) / 2 - V.dot(mid, cam.up))));
        var radius = Math.max((r1 - r0) / 2 / 1.73, (u1 - u0) / 2 / 1.1) * 1.18 + 0.35;
        return { center: c, radius: Math.max(radius, 2.2) };
      },
      presets: [["3D", HOME.az, HOME.el], ["from the front", 0, 0], ["from the end", 90, 0]]
    },
    state: { n: 3, copies: 1, fit: false, u: 0, busy: false, a: 1, b: 1, c: 1 },

    controls: function (api, s) {
      /* the frame follows the camera this mount owns; kept out of the state's JSON */
      Object.defineProperty(s, "cam", { value: api.cam, enumerable: false });
      Object.defineProperty(s, "quizNow", { get: function () { return api.quiz(); }, enumerable: false });
      /* the exercise asks about n = 6, one step past what the figure above can show, so the
         box has to be worked out rather than read off that figure */
      if (api.quiz()) {
        api.slider("n", 1, 6, 1, "n");
        api.slider("side 1", 1, 13, 1, "a");
        api.slider("side 2", 1, 13, 1, "b");
        api.slider("side 3", 1, 13, 1, "c");
        return;
      }
      api.slider("n", 1, 5, 1, "n");
      /* a new number of copies starts apart, so every fit is seen happening; run tells a
         slide that was overtaken by a change of copies to stop writing u */
      var run = 0;
      api.chips([{ label: "1", value: 1 }, { label: "3", value: 3 }, { label: "6", value: 6 }], {
        get: function (s) { return s.copies; },
        set: function (s, v) {
          if (v === s.copies) return;
          run++;
          s.copies = v;
          s.fit = false;
          s.u = 0;
          s.busy = false;
        }
      }, "Copies");
      api.button(function (s) { return s.fit ? "pull apart" : "fit together"; }, function (s) {
        var from = s.u, to = s.fit ? 0 : 1, mine = ++run;
        s.fit = !s.fit;
        s.busy = true;
        api.animate(800, function (t) { if (mine === run) s.u = from + (to - from) * t; }, function () {
          if (mine !== run) return;
          s.u = to;
          s.busy = false;
        });
      }, { disabled: function (s) { return s.busy || s.copies === 1; } });
    },

    draw: function (g, s, api) {
      var quiz = api.quiz(), n = s.n, list = layout(s, quiz);
      var e = extent(s, quiz);
      g.grid({ min: [Math.floor(e.lo[0]) - 1, Math.floor(e.lo[1]) - 1], max: [Math.ceil(e.hi[0]) + 1, Math.ceil(e.hi[1]) + 1], step: 1, z: -0.01 });
      if (!quiz && fitted(s)) {
        /* together: one solid, so only its outside is drawn */
        var have = {};
        list.forEach(function (it) { keys(it.p.cells, have); });
        list.forEach(function (it) { faces(g, it.p.cells, it.tone, it.edge, [0, 0, 0], have); });
      } else {
        list.forEach(function (it) { faces(g, it.p.cells, it.tone, it.edge, it.off, keys(it.p.cells)); });
      }
      /* the layers of the first pyramid, named while it stands apart. Alone, beside its flat
         back edge (x = 0, y = n); first in a row, where a neighbour stands there, in front of
         the left end of each step (layer k is n + 1 − k wide and starts at y = k − 1) */
      if (quiz || s.copies === 1 || (!s.fit && s.u === 0)) {
        var A = list[0], k;
        for (k = 1; k <= n; k++) {
          if (list.length === 1) {
            g.label([0, n, k - 0.5], (n - k + 1) + "²", { tone: "ink", dx: 10, dy: 5, anchor: "start" });
          } else {
            g.label(V.add([n + 1 - k, k - 1.6, k - 0.5], A.off), (n - k + 1) + "²", { tone: "ink", dx: -4, dy: 5, anchor: "end", size: 0.95, minor: true });
          }
        }
      }
      if (quiz || !fitted(s)) return;
      if (s.copies === 6) {
        var L = 2 * n + 1, H = n + 1;
        g.box([0, 0, 0], [n, L, H], { alpha: 0, edges: "point", w: 1.75 });
        g.label([n, L / 2, 0], "2n + 1 = " + L, { tone: "ink", dy: 32, weight: 700 });
        g.label([n / 2, L, 0], "n = " + n, { tone: "ink", dx: 10, dy: 18, anchor: "start", weight: 700 });
        g.label([n, 0, H / 2], "n + 1 = " + H, { tone: "ink", dx: -12, anchor: "end", weight: 700 });
      } else {
        /* the block of three: its staircase faces the viewer at the right-hand end */
        g.label([n / 2, n, 0], "n = " + n, { tone: "ink", dx: 10, dy: 18, anchor: "start", weight: 700 });
        g.label([n, 0, (n + 1) / 2], "n + 1 = " + (n + 1), { tone: "ink", dx: -12, anchor: "end", weight: 700 });
      }
    },

    say: function (s, quiz) {
      var n = s.n, one = sumSq(n);
      var lay = n === 1 ? "one layer of 1²" : "layers of 1², …, " + n + "²";
      if (quiz) {
        return "n = " + n + ": six pyramids, each with " + lay + ". Your box: " + s.a + " × " + s.b + " × " + s.c + ".";
      }
      var sum = n === 1 ? "1 cube" : terms(n) + " = " + one + " cubes";
      if (s.copies === 1) {
        return "<b>One pyramid: " + sum + "</b>, in " + lay + ". Take three copies, then six.";
      }
      if (!fitted(s)) {
        return s.copies + " pyramids of " + one + (one === 1 ? " cube" : " cubes") + " each, apart. Fit them together.";
      }
      if (s.copies === 3) {
        var tri = n * (n + 1) / 2;
        return "<b>Three pyramids make a block " + n + " wide and " + (n + 1) + " tall</b>: " + (n === 1 ? "1 full layer" : n + " full layers") + " of " +
          n + " × " + (n + 1) + " and a staircase of " + (n === 1 ? "1" : "1 + … + " + n + " = " + tri) + ", so " +
          n * n * (n + 1) + " + " + tri + " = " + 3 * one + " = 3 × " + one + ". Now take six.";
      }
      var vol = n * (n + 1) * (2 * n + 1);
      return "<b>Six pyramids fill " + n + " × " + (n + 1) + " × " + (2 * n + 1) + " = " + vol + ", so one holds " + vol +
        " ÷ 6 = " + one + (n === 1 ? "" : " = " + terms(n)) + ".</b><br>The two blocks of three share one layer: a " +
        n + " × " + (n + 1) + " rectangle made of two staircases, the picture from §15.1.";
    },

    answer: function (s, ask) {
      if (ask === "box") {
        var sides = [s.a, s.b, s.c].sort(function (p, q) { return p - q; });
        return s.n + ":" + sides.join(",");
      }
      return sumSq(s.n);
    },

    missions: [
      { text: "Fit three pyramids together.", test: function (s) { return s.copies === 3 && fitted(s); } },
      { text: "Fit six pyramids into a box.", test: function (s) { return s.copies === 6 && fitted(s); } },
      { text: "Use the box to find 1² + 2² + 3² + 4² + 5².", test: function (s) { return s.n === 5 && s.copies === 6 && fitted(s); } }
    ],

    cases: [
      { set: { n: 6, a: 6, b: 7, c: 13 }, ask: "box", answer: "6:6,7,13" },
      { set: { n: 6, a: 13, b: 6, c: 7 }, ask: "box", answer: "6:6,7,13" },
      { set: { n: 6, a: 7, b: 13, c: 6 }, ask: "box", answer: "6:6,7,13" },
      { set: { n: 5, a: 6, b: 7, c: 13 }, ask: "box", not: "6:6,7,13" },
      { set: { n: 6, a: 6, b: 6, c: 13 }, ask: "box", not: "6:6,7,13" },
      { set: { n: 6, a: 6, b: 7, c: 12 }, ask: "box", not: "6:6,7,13" },
      { set: { n: 4, a: 4, b: 5, c: 9 }, ask: "box", not: "6:6,7,13" },
      { set: {}, ask: "box", not: "6:6,7,13" },
      { set: { n: 5 }, answer: "55" }
    ],

    /* once solved, the six pyramids slide together into the box the learner found */
    reveal: function (api) {
      var s = api.state;
      s.copies = 6;
      s.fit = true;
      s.busy = true;
      api.animate(800, function (t) { s.u = t; }, function () { s.u = 1; s.busy = false; });
    }
  });
})();
