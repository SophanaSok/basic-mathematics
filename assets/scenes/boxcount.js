/* ===========================================================================
   Basic Mathematics — scene "boxcount" (Chapter 1, §1.3 "Rules for multiplication")
   Associativity of multiplication, for counting numbers, as one box of unit
   cubes counted two ways. A box a by b by c sliced across its third side is c
   layers of a · b cubes, (ab)c in all; sliced across its first side it is a
   slabs of b · c cubes, a(bc) in all. Same box, same cubes, same number.
   Sides with the sliders, the slicing with the chips, "Pull apart" separates
   the pieces. Chapter 1 has no coordinates yet, so there are no handles and no
   axes: the sides are called a, b, c, as in the rule.
   =========================================================================== */
(function () {
  "use strict";
  if (!window.BM3D || !window.BM3D.define) return;
  var GAP = 0.7;                       /* world units between pieces when pulled apart */
  var SIDE = ["a", "b", "c"];
  var LAYER_TONES = ["faceA", "faceB"];

  function sides(s) { return [s.a, s.b, s.c]; }
  function total(s) { return s.a * s.b * s.c; }
  /* sliced across side k: that side counts the pieces, the other two make one piece */
  function layers(s, k) { return sides(s)[k === undefined ? s.dir : k]; }
  function others(k) { return k === 0 ? [1, 2] : k === 1 ? [0, 2] : [0, 1]; }
  function perLayer(s, k) {
    if (k === undefined) k = s.dir;
    var n = sides(s), o = others(k);
    return n[o[0]] * n[o[1]];
  }
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
  /* across the third side the pieces lie flat (layers); across the others they stand up (slabs) */
  function pieceWord(k) { return k === 2 ? "layer" : "slab"; }
  /* the bracketing each slicing reads: (a · b) · c, a · (b · c), (a · c) · b */
  function grouping(s, k) {
    var n = sides(s), o = others(k), inner = "(" + n[o[0]] + " · " + n[o[1]] + ")";
    return k === 0 ? n[0] + " · " + inner : inner + " · " + n[k];
  }
  function sentence(s, k, cubes) {
    var n = sides(s), o = others(k);
    return plural(n[k], pieceWord(k)) + " of " + n[o[0]] + " · " + n[o[1]] + " = " + perLayer(s, k) +
      (cubes ? (perLayer(s, k) === 1 ? " cube" : " cubes") : "") + ": " + grouping(s, k) + " = " + total(s);
  }

  /* how far the box reaches along each direction, pieces spread by sep (0 together, 1 apart) */
  function extent(s) {
    var n = sides(s), e = n.slice();
    e[s.dir] = n[s.dir] + (n[s.dir] - 1) * GAP * s.sep;
    return e;
  }
  /* Frame the box as the default view sees it: its outline spans about 0.83x + 0.56y across
     and 0.91z + 0.23x + 0.34y up the screen (az −56°, el 24°), plus room for the labels.
     The stage shows 2.2·radius up and 3.46·radius across. */
  function fitTo(s) {
    var e = extent(s);
    var tall = 0.91 * e[2] + 0.23 * e[0] + 0.34 * e[1] + 1.1, wide = 0.83 * e[0] + 0.56 * e[1] + 2.6;
    return { center: [e[0] / 2, e[1] / 2, e[2] / 2 - 0.2], radius: Math.max(1.9, tall / 2.2, wide / 3.46) };
  }
  /* a change of side is a new box: the slicings tried so far start again from this one */
  function setSide(i) {
    return {
      get: function (s) { return sides(s)[i]; },
      set: function (s, v) {
        if (s[SIDE[i]] === v) return;
        s[SIDE[i]] = v;
        s.used = [s.dir];
      }
    };
  }

  /* views that depend on the slicing: face one piece square-on, or stand beside the row of pieces */
  function alongAz(s) { return s.dir === 0 ? 0 : s.dir === 1 ? 90 : -90; }
  function alongEl(s) { return s.dir === 2 ? 90 : 0; }
  function acrossAz(s) { return s.dir === 1 ? 0 : -90; }

  window.BM3D.define("boxcount", {
    label: "A box built from unit cubes, sliced into equal pieces, flat layers or upright slabs, so that the cubes can be counted piece by piece",
    note: "Set the three sides with the sliders and choose which side to slice across; Pull apart separates the " +
      "pieces. Drag the picture to turn the box, or Tab to it and use the arrow keys; Home resets the view.",
    view: {
      az: -56, el: 24, center: [1, 1.5, 2], radius: 3.4,
      fit: fitTo,
      presets: [["3D", -56, 24], ["face one piece", alongAz, alongEl], ["the pieces side by side", acrossAz, 0]]
    },
    state: { a: 2, b: 3, c: 4, dir: 2, apart: false, sep: 0, used: [2] },

    controls: function (api, s) {
      api.slider("side a", 1, 5, 1, setSide(0));
      api.slider("side b", 1, 5, 1, setSide(1));
      api.slider("side c", 1, 5, 1, setSide(2));
      api.chips([{ label: "side a", value: 0 }, { label: "side b", value: 1 }, { label: "side c", value: 2 }], {
        get: function (s) { return s.dir; },
        set: function (s, v) {
          s.dir = v;
          if (s.used.indexOf(v) < 0) s.used.push(v);
        }
      }, "Slice across");
      /* a toggle: the label stays, aria-pressed carries the state */
      var btn = null;
      btn = api.button(function (s) {
        if (btn) btn.setAttribute("aria-pressed", s.apart ? "true" : "false");
        return "Pull apart";
      }, function (s, api) {
        var from = s.sep, to = s.apart ? 0 : 1;
        s.apart = !s.apart;
        api.animate(450, function (u) { s.sep = from + (to - from) * u; }, function () { s.sep = to; });
      });
      btn.setAttribute("aria-pressed", s.apart ? "true" : "false");
    },

    draw: function (g, s, api) {
      var quiz = api.quiz(), cam = api.cam, n = sides(s), k = s.dir, d = GAP * s.sep;
      var e = extent(s), cells = [];
      for (var x = 0; x < n[0]; x++) {
        for (var y = 0; y < n[1]; y++) {
          for (var z = 0; z < n[2]; z++) {
            var p = [x, y, z], i = p[k];
            p[k] += i * d;
            cells.push({ at: p, tone: LAYER_TONES[i % 2] });
          }
        }
      }
      /* the floor, drawn a hair below z = 0 so that its lines through 0 are kept */
      g.grid({ min: [-1, -1], max: [Math.ceil(e[0]) + 1, Math.ceil(e[1]) + 1], step: 1, z: -0.01 });
      /* the seams between cubes are what the reader counts: drawn in ink, they stand 3:1 or
         more off every shade of both layer colours, in both themes (--plot-bg seams did not
         on the dark faces) */
      g.cubes(cells, { w: 1.2, stroke: "ink" });

      /* side labels on the silhouette: the two bottom edges nearer the viewer, and the
         upright edge furthest left on the screen */
      var yNear = cam.e[1] < 0 ? 0 : e[1], xNear = cam.e[0] > 0 ? e[0] : 0;
      var out = function (v, far) { return v === 0 ? -0.55 : far + 0.55; };
      function sideLabel(i, at, o) {
        o.tone = i === k ? "ink" : "muted";
        o.weight = i === k ? 750 : 600;
        g.label(at, SIDE[i] + " = " + n[i], o);
      }
      sideLabel(0, [e[0] / 2, out(yNear, e[1]), 0], { dy: 14 });
      sideLabel(1, [out(xNear, e[0]), e[1] / 2, 0], { dy: 14 });
      var corners = [[0, 0], [e[0], 0], [0, e[1]], [e[0], e[1]]].map(function (c) {
        return { c: c, sx: cam.project([c[0], c[1], 0])[0] };
      });
      corners.sort(function (p, q) { return p.sx - q.sx; });
      var left = corners[0].c, right = corners[3].c;
      sideLabel(2, [left[0], left[1], e[2] / 2], { dx: -12, anchor: "end" });

      /* outside an exercise: how many cubes each piece holds */
      if (quiz) return;
      var per = perLayer(s), o = others(k);
      for (var j = 0; j < n[k]; j++) {
        var mid = j * (1 + d) + 0.5, at;
        if (k === 2) {
          at = [right[0], right[1], mid];
          g.label(at, String(per), { dx: 12, anchor: "start", tone: "ink", weight: 700, minor: n[k] > 3 && !d });
        } else {
          /* standing pieces: above each, on the far top edge */
          var h = o[0] === 2 ? o[1] : o[0];
          at = [0, 0, e[2]];
          at[k] = mid;
          at[h] = (h === 0 ? cam.e[0] > 0 : cam.e[1] > 0) ? 0 : e[h];
          g.label(at, String(per), { dy: -10, tone: "ink", weight: 700, minor: true });
        }
      }
    },

    say: function (s, quiz) {
      var k = s.dir;
      if (quiz) {
        return "Sides a = " + s.a + ", b = " + s.b + ", c = " + s.c + ". Sliced across side " + SIDE[k] +
          (s.apart ? ", pulled apart." : ".");
      }
      var first = "<b>" + sentence(s, k, true) + ".</b>";
      if (k === 1) {
        return first + "<br>Across side a: " + sentence(s, 0) + ". Across side c: " + sentence(s, 2) + ".";
      }
      return first + "<br>Sliced the other way: " + sentence(s, k === 2 ? 0 : 2) + ".";
    },

    answer: function (s) { return layers(s) + "," + perLayer(s); },

    missions: [
      { text: "Slice the 2 × 3 × 4 box into pieces of 12.", test: function (s) {
          return sides(s).slice().sort().join(",") === "2,3,4" && perLayer(s) === 12;
        } },
      { text: "Build a box of 36 cubes and slice it into pieces of 9.", test: function (s) {
          return total(s) === 36 && perLayer(s) === 9;
        } },
      { text: "Slice one box all three ways, without changing its sides.", test: function (s) {
          return s.used.indexOf(0) >= 0 && s.used.indexOf(1) >= 0 && s.used.indexOf(2) >= 0;
        } }
    ],

    cases: [
      { set: { a: 2, b: 5, c: 3, dir: 0 }, answer: "2,15", compare: "set" },
      { set: { a: 5, b: 3, c: 2, dir: 2 }, answer: "2,15", compare: "set" },
      { set: { a: 3, b: 2, c: 5, dir: 1 }, answer: "2,15", compare: "set" },
      { set: { a: 3, b: 5, c: 2, dir: 2, apart: true, sep: 1 }, answer: "2,15", compare: "set" },
      { set: { a: 2, b: 5, c: 3, dir: 2 }, not: "2,15", compare: "set" },
      { set: { a: 5, b: 3, c: 2, dir: 0 }, not: "2,15", compare: "set" },
      { set: {}, answer: "4,6", compare: "set" },
      { set: {}, not: "2,15", compare: "set" }
    ],

    /* once solved, pull the pieces apart: the count reads off the picture */
    reveal: function (api) {
      var s = api.state;
      if (s.apart) return;
      s.apart = true;
      api.animate(450, function (u) { s.sep = u; }, function () { s.sep = 1; });
    }
  });
})();
