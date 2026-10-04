/* ===========================================================================
   Basic Mathematics — scenes "det3" and "rowops" (Chapter 16, §16.3 and §16.4)
   det3: the three rows of a 3×3 matrix drawn as arrows from the origin, and
   the solid they span. Its volume is |det|; swapping two rows keeps the solid
   and flips the sign; det = 0 is the solid gone flat.
   rowops: the same solid under the three row moves. A shear (add a multiple of
   one row to another) keeps the volume, a swap flips the sign, doubling a row
   doubles it.
   =========================================================================== */
(function () {
  "use strict";
  if (!window.BM3D || !window.BM3D.define) return;
  var V = window.BM3D.V;
  var TONES = ["curve", "curve2", "curve3"];

  function det(m) {
    return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  }
  function copy(m) { return m.map(function (r) { return r.slice(); }); }
  function neg(v) { return v < 0 ? "(−" + Math.abs(v) + ")" : String(v); }
  function sgn(v) { return v < 0 ? "−" + Math.abs(v) : String(v); }
  function row(r) { return "(" + r.map(sgn).join(", ") + ")"; }
  function zeroRow(r) { return !r[0] && !r[1] && !r[2]; }
  function parallel(a, b) { var c = V.cross(a, b); return !c[0] && !c[1] && !c[2]; }
  function degenerate(m) {
    return zeroRow(m[0]) || zeroRow(m[1]) || zeroRow(m[2]) ||
      parallel(m[0], m[1]) || parallel(m[0], m[2]) || parallel(m[1], m[2]);
  }
  /* a rectangular box: three non-zero rows at right angles to one another */
  function rectangular(m) {
    return !zeroRow(m[0]) && !zeroRow(m[1]) && !zeroRow(m[2]) &&
      !V.dot(m[0], m[1]) && !V.dot(m[0], m[2]) && !V.dot(m[1], m[2]);
  }
  function diagonal(m) {
    return !m[0][1] && !m[0][2] && !m[1][0] && !m[1][2] && !m[2][0] && !m[2][1];
  }
  /* first-row expansion with the numbers in */
  function expansion(m) {
    var a = m[0], b = m[1], c = m[2];
    return neg(a[0]) + "·(" + neg(b[1]) + "·" + neg(c[2]) + " − " + neg(b[2]) + "·" + neg(c[1]) + ") − " +
      neg(a[1]) + "·(" + neg(b[0]) + "·" + neg(c[2]) + " − " + neg(b[2]) + "·" + neg(c[0]) + ") + " +
      neg(a[2]) + "·(" + neg(b[0]) + "·" + neg(c[1]) + " − " + neg(b[1]) + "·" + neg(c[0]) + ")";
  }
  /* the sign in the words §16.3 has: swapping two rows keeps the solid and flips only the sign */
  function signText(d) {
    return d > 0 ? "The sign is +: swap any two rows and the solid stays the same while the sign turns −."
      : d < 0 ? "The sign is −: swap any two rows and the solid stays the same while the sign turns +."
        : "Zero: the three rows lie in one plane, and the solid is flat.";
  }

  /* the box the solid and a little of each axis occupy: the camera frames it, the axes span it */
  function extent(m) {
    var lo = [-1, -1, -1], hi = [1.5, 1.5, 1.5];
    for (var c = 0; c < 8; c++) {
      var p = [0, 0, 0];
      if (c & 1) p = V.add(p, m[0]);
      if (c & 2) p = V.add(p, m[1]);
      if (c & 4) p = V.add(p, m[2]);
      for (var i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
    }
    return { lo: lo, hi: hi };
  }
  function fitTo(m) {
    var e = extent(m), d = V.sub(e.hi, e.lo);
    return { center: V.scale(V.add(e.lo, e.hi), 0.5), radius: Math.max(0.37 * V.len(d), 2.1) };
  }

  /* the picture both scenes share: axes, the solid, and the three row arrows */
  function drawSolid(g, m, opts) {
    var O = [0, 0, 0], d = det(m), e = extent(m);
    g.grid({ min: [Math.floor(e.lo[0]), Math.floor(e.lo[1])], max: [Math.ceil(e.hi[0]), Math.ceil(e.hi[1])], step: 1 });
    g.axes({ min: V.sub(e.lo, [0.5, 0.5, 0.5]), max: V.add(e.hi, [0.9, 0.9, 0.9]) });
    g.para(O, m[0], m[1], m[2], {
      tone: d > 0 ? "faceA" : "faceB", alpha: 0.6, edges: "muted", w: 1.25, flat: "muted"
    });
    m.forEach(function (r, i) {
      if (zeroRow(r)) return;
      g.arrow(O, r, { tone: TONES[i], w: 3.5, head: 13 });
      if (opts.names) g.label(r, opts.names[i], { tone: TONES[i], dy: -14, weight: 700 });
      else g.label(r, row(r), { tone: TONES[i], dy: -15, weight: 650, minor: true });
    });
    if (opts.volume) {
      var mid = V.scale(V.add(V.add(m[0], m[1]), m[2]), 0.5);
      g.label(mid, d ? "volume " + Math.abs(d) : "flat: volume 0", { tone: "ink", dy: 4, minor: true });
    }
  }

  /* ================================================================ det3 == */
  window.BM3D.define("det3", {
    label: "Three arrows from the origin, the rows of a 3 by 3 matrix, and the slanted box they span",
    sibling: "det2",
    note: "Type entries into the rows, or drag the tip of an arrow along its guide lines; drag anywhere else to turn " +
      "the view. From the keyboard: Tab to the picture, move the selected tip with the arrow keys (Page Up and Page " +
      "Down for y), press Space for the next tip and then for turning the view; Home resets it.",
    view: {
      az: -62, el: 24, center: [0.5, 1, 0.25], radius: 2.6,
      fit: function (s) { return fitTo(s.m); },
      presets: [["3D", -62, 24], ["from above", -90, 90], ["from the front", -90, 0]]
    },
    state: { m: [[2, 0, 0], [0, 3, 0], [0, 0, 1]], lock: [] },

    controls: function (api, s) {
      var lock = (s.lock || []).slice();
      api.matrix("m", -3, 3, { lock: lock, tones: TONES, label: "Rows" });
      [0, 1, 2].forEach(function (i) {
        if (lock.indexOf(i) >= 0) return;
        api.handle({
          name: "the tip of row " + (i + 1),
          tone: TONES[i],
          at: function (s) { return s.m[i].slice(); },
          axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
          move: function (s, p) {
            s.m[i] = p.map(function (v) { return Math.max(-3, Math.min(3, Math.round(v))); });
          }
        });
      });
    },

    draw: function (g, s, api) {
      drawSolid(g, s.m, { volume: !api.quiz() });
    },

    say: function (s, quiz) {
      var m = s.m;
      if (quiz) return "Rows: " + row(m[0]) + ", " + row(m[1]) + ", " + row(m[2]) + ".";
      var d = det(m);
      return "<b>det = " + expansion(m) + " = " + sgn(d) + "</b><br>" +
        "Volume of the solid = |det| = " + Math.abs(d) + ". " + signText(d);
    },

    answer: function (s, ask) {
      var m = s.m;
      if (ask === "slant") return rectangular(m) ? "box" : det(m);
      if (ask === "flat") return degenerate(m) ? "degenerate" : det(m);
      return det(m);
    },

    missions: [
      { text: "Slant the solid but keep its determinant 6.", test: function (s) { return det(s.m) === 6 && !rectangular(s.m); } },
      { text: "Flatten it, with no row zero and no two rows parallel.", test: function (s) {
          return det(s.m) === 0 && !degenerate(s.m);
        } },
      { text: "Make the determinant −6.", test: function (s) { return det(s.m) === -6; } }
    ],

    cases: [
      { set: { m: [[2, 0, 0], [0, 3, 0], [1, 1, 2]] }, ask: "slant", answer: "12|-12" },
      { set: { m: [[2, 0, 0], [0, 3, 0], [-1, 2, -2]] }, ask: "slant", answer: "12|-12" },
      { set: { m: [[2, 0, 0], [0, 3, 0], [0, 0, 2]] }, ask: "slant", not: "12|-12" },
      { set: { m: [[1, 1, 0], [-1, 1, 0], [0, 0, 3]] }, ask: "slant", answer: "box" },
      { set: { m: [[2, 0, 0], [0, 3, 0], [1, 1, 0]] }, ask: "flat", answer: "0" },
      { set: { m: [[2, 0, 0], [0, 3, 0], [2, 0, 0]] }, ask: "flat", not: "0" },
      { set: { m: [[2, 0, 0], [0, 3, 0], [0, 0, 0]] }, ask: "flat", not: "0" },
      { set: { m: [[2, -1, 3], [0, 3, 1], [1, 0, 2]] }, answer: String(det([[2, -1, 3], [0, 3, 1], [1, 0, 2]])) }
    ]
  });

  /* ============================================================== rowops == */
  var KIND = { shear: 1, swap: -1, double: 2 };
  function moveText(mv) {
    if (mv.t === "shear") return "R" + (mv.i + 1) + " += " + sgn(mv.k) + " × R" + (mv.j + 1);
    if (mv.t === "swap") return "swap R" + (mv.i + 1) + ", R" + (mv.j + 1);
    return "double R" + (mv.i + 1);
  }
  function result(m, mv) {
    var n = copy(m);
    if (mv.t === "shear") n[mv.i] = V.add(n[mv.i], V.scale(n[mv.j], mv.k));
    else if (mv.t === "swap") { n[mv.i] = m[mv.j].slice(); n[mv.j] = m[mv.i].slice(); }
    else n[mv.i] = V.scale(n[mv.i], 2);
    return n;
  }
  function tooBig(m) {
    return m.some(function (r) { return r.some(function (v) { return Math.abs(v) > 9; }); });
  }
  /* commit a move: remember the old matrix for Undo, log the move */
  function apply(s, mv) {
    s.hist.push(copy(s.m));
    s.moves.push(mv);
    s.m = result(s.m, mv);
  }
  function kinds(s) {
    var seen = {};
    s.moves.forEach(function (mv) { seen[mv.t] = 1; });
    var list = Object.keys(seen).sort();
    return list.length ? list.join("+") : "none";
  }

  window.BM3D.define("rowops", {
    label: "A slanted solid spanned by the three rows of a matrix, changed by row moves",
    note: "Pick rows i and j and a multiple k, then press a move. Drag the picture to turn it, or Tab to it and use " +
      "the arrow keys; Home resets the view.",
    view: {
      az: -62, el: 24, center: [1, 1, 1], radius: 3,
      fit: function (s) { return fitTo(s.show || s.m); },
      presets: [["3D", -62, 24], ["from above", -90, 90], ["from the front", -90, 0]]
    },
    state: { m: [[2, 0, 0], [2, 2, 0], [2, 2, 3]], moves: [], hist: [], i: 1, j: 0, k: 1, show: null },

    controls: function (api, s) {
      var start = copy(s.m);
      var rows = [{ label: "R1", value: 0 }, { label: "R2", value: 1 }, { label: "R3", value: 2 }];
      api.chips(rows, "i", "Row i");
      api.chips(rows, "j", "Row j");
      api.chips([{ label: "−2", value: -2 }, { label: "−1", value: -1 }, { label: "1", value: 1 }, { label: "2", value: 2 }], "k", "k");
      function busy(s) { return !!s.show; }
      /* animate row i from where it was to where the move puts it */
      function play(mv) {
        var from = copy(s.m);
        apply(s, mv);
        var to = copy(s.m);
        if (mv.t === "swap") return;
        s.show = from;
        api.animate(650, function (u) {
          s.show = copy(from);
          s.show[mv.i] = V.lerp(from[mv.i], to[mv.i], u);
        }, function () { s.show = null; });
      }
      api.button(function (s) { return "R" + (s.i + 1) + " += " + sgn(s.k) + " × R" + (s.j + 1); }, function (s) {
        play({ t: "shear", i: s.i, j: s.j, k: s.k });
      }, { disabled: function (s) { return busy(s) || s.i === s.j || tooBig(result(s.m, { t: "shear", i: s.i, j: s.j, k: s.k })); } });
      api.button(function (s) { return "swap R" + (s.i + 1) + ", R" + (s.j + 1); }, function (s) {
        play({ t: "swap", i: s.i, j: s.j });
      }, { disabled: function (s) { return busy(s) || s.i === s.j; } });
      api.button(function (s) { return "double R" + (s.i + 1); }, function (s) {
        play({ t: "double", i: s.i });
      }, { disabled: function (s) { return busy(s) || tooBig(result(s.m, { t: "double", i: s.i })); } });
      api.button("undo", function (s) {
        if (!s.hist.length) return;
        s.m = s.hist.pop();
        s.moves.pop();
      }, { disabled: function (s) { return busy(s) || !s.moves.length; } });
      api.button("start again", function (s) {
        s.m = copy(start);
        s.moves = [];
        s.hist = [];
      }, { disabled: busy });
    },

    draw: function (g, s, api) {
      drawSolid(g, s.show || s.m, { volume: !api.quiz() && !s.show, names: ["R1", "R2", "R3"] });
    },

    say: function (s, quiz) {
      var m = s.m, d = det(m);
      var list = s.moves.map(function (mv, n) { return n + 1 + ". " + moveText(mv); });
      if (quiz) {
        return "Rows: " + row(m[0]) + ", " + row(m[1]) + ", " + row(m[2]) + ".<br>Moves: " +
          (list.length ? list.join("; ") : "none yet") + ".";
      }
      var run = det(s.hist.length ? s.hist[0] : m), lines = ["Start: det " + sgn(run) + "."];
      s.moves.forEach(function (mv, n) {
        run *= KIND[mv.t];
        lines.push(n + 1 + ". " + moveText(mv) + ": det × " + sgn(KIND[mv.t]) + " → " + sgn(run));
      });
      return "<b>det = " + sgn(d) + ", volume " + Math.abs(d) + "</b><br>" + lines.join("<br>");
    },

    answer: function (s, ask) {
      var d = det(s.m);
      if (ask === "shape") return kinds(s) + ":" + (diagonal(s.m) ? "box" : "slant");
      if (ask === "det-moves") return d + ":" + s.moves.length;
      return d;
    },

    missions: [
      { text: "Straighten it into an upright box using only shears.", test: function (s) {
          return kinds(s) === "shear" && diagonal(s.m);
        } },
      { text: "Make the determinant −12.", test: function (s) { return det(s.m) === -12; } },
      { text: "Make the volume 24 in a single move.", test: function (s) {
          return s.moves.length === 1 && Math.abs(det(s.m)) === 24;
        } }
    ],

    cases: [
      { set: function (s) {
          apply(s, { t: "shear", i: 1, j: 0, k: -1 });
          apply(s, { t: "shear", i: 2, j: 0, k: -1 });
          apply(s, { t: "shear", i: 2, j: 1, k: -1 });
        }, ask: "shape", answer: "shear:box" },
      { set: function (s) {
          apply(s, { t: "shear", i: 1, j: 0, k: -1 });
          apply(s, { t: "shear", i: 2, j: 0, k: -1 });
        }, ask: "shape", not: "shear:box" },
      { set: function (s) {
          apply(s, { t: "swap", i: 0, j: 1 });
          apply(s, { t: "double", i: 0 });
        }, ask: "det-moves", answer: "-24:2" },
      { set: function (s) {
          apply(s, { t: "double", i: 2 });
          apply(s, { t: "swap", i: 0, j: 2 });
        }, ask: "det-moves", answer: "-24:2" },
      { set: function (s) {
          apply(s, { t: "double", i: 2 });
          apply(s, { t: "shear", i: 0, j: 2, k: 1 });
        }, ask: "det-moves", not: "-24:2" },
      { set: {}, ask: "shape", not: "shear:box" }
    ]
  });
})();
