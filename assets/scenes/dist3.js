/* ===========================================================================
   Basic Mathematics — scene "dist3" (Chapter 8, §8.2 "One more dimension")
   Distance in space is Pythagoras twice: once on the floor, from O to the
   point R = (x, y, 0) under Q, and once standing up, from OR and the height z
   to OQ. Move Q = (x, y, z) with the sliders or its handle.
   =========================================================================== */
(function () {
  "use strict";
  if (!window.BM3D || !window.BM3D.define) return;
  var V = window.BM3D.V;

  function sq(s) { return s.x * s.x + s.y * s.y + s.z * s.z; }
  function root(n) {
    var r = Math.sqrt(n);
    return Math.abs(r - Math.round(r)) < 1e-9 ? String(Math.round(r)) : null;
  }
  function round3(v) { return String(Math.round(v * 1000) / 1000); }
  /* how far the axes reach: a little past the largest coordinate, so the box fills the stage */
  function reach(s) { return Math.max(s.x, s.y, s.z, 3) + 1.2; }
  /* the azimuth that looks square-on at the upright triangle O, R, Q, on the side
     nearer the current view */
  function faceAz(s, cam) {
    if (!s.x && !s.y) return cam ? cam.az : -62;
    var a1 = Math.atan2(-s.x, s.y) * 180 / Math.PI, a2 = a1 + 180;
    var cur = cam ? cam.az : -62;
    function gap(a) { return Math.abs(((a - cur) % 360 + 540) % 360 - 180); }
    return gap(a1) <= gap(a2) ? a1 : a2;
  }

  window.BM3D.define("dist3", {
    label: "A point Q in space, the box from the origin to it, and the two right triangles that give its distance",
    sibling: "distance",
    view: {
      az: -62, el: 24, center: [2.2, 2.3, 2.4], radius: 3.6,
      bounds: [[0, 0, 0], [8.5, 8.5, 8.5]],
      fit: function (s) {
        var A = reach(s);
        return { center: [0.42 * A, 0.45 * A, 0.46 * A], radius: 0.7 * A };
      },
      presets: [["3D", -62, 24], ["from above", -90, 90], ["face the upright triangle", faceAz, 0]]
    },
    state: { x: 4, y: 3, z: 2 },

    controls: function (api, s) {
      var lo = api.quiz() ? 1 : 0;
      api.slider("x", lo, 8, 1, "x");
      api.slider("y", lo, 8, 1, "y");
      api.slider("z", lo, 8, 1, "z");
      api.handle({
        name: "Q",
        at: function (s) { return [s.x, s.y, s.z]; },
        axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        move: function (s, p) {
          s.x = Math.max(lo, Math.min(8, Math.round(p[0])));
          s.y = Math.max(lo, Math.min(8, Math.round(p[1])));
          s.z = Math.max(lo, Math.min(8, Math.round(p[2])));
        }
      });
    },

    draw: function (g, s, api) {
      var O = [0, 0, 0], A = [s.x, 0, 0], R = [s.x, s.y, 0], Q = [s.x, s.y, s.z];
      var quiz = api.quiz();
      var far = reach(s), G = Math.ceil(far - 0.7);
      g.grid({ min: [0, 0], max: [G, G], step: 1 });
      g.axes({ max: [far + 0.4, far + 0.4, far], ticks: far > 7 ? 2 : 1 });
      /* the box from O to Q, edges only; the far ones dashed */
      if (s.x && s.y && s.z) g.box(O, Q, { alpha: 0, edges: "axis", w: 1.25 });
      /* the floor triangle O, A, R and the upright triangle O, R, Q */
      g.face([O, A, R], { tone: "faceC", alpha: 0.8 });
      g.face([O, R, Q], { tone: "faceA", alpha: 0.8 });
      if (s.x && s.y) {
        g.right(A, V.sub(O, A), V.sub(R, A), { size: 0.45 });
      }
      if ((s.x || s.y) && s.z) g.right(R, V.sub(O, R), [0, 0, 1], { size: 0.45 });
      g.seg(O, A, { tone: "curve3", w: 3 });
      g.seg(A, R, { tone: "curve3", w: 3 });
      g.seg(O, R, { tone: "curve2", w: 3 });
      g.seg(R, Q, { tone: "curve4", w: 3 });
      g.seg(O, Q, { tone: "curve", w: 3.5 });
      g.dot(O, { r: 4 });
      g.label(O, "O", { dx: -12, dy: 4, tone: "ink" });
      if (s.x) g.label(V.lerp(O, A, 0.5), "x = " + s.x, { tone: "curve3", dy: 18 });
      if (s.y) g.label(V.lerp(A, R, 0.5), "y = " + s.y, { tone: "curve3", dy: 18 });
      if (s.z) g.label(V.lerp(R, Q, 0.5), "z = " + s.z, { tone: "curve4", dx: 10, anchor: "start" });
      g.label(Q, "Q (" + s.x + ", " + s.y + ", " + s.z + ")", { dy: -16, weight: 650 });
      if (!quiz) {
        var f = s.x * s.x + s.y * s.y, n = sq(s);
        if (s.x || s.y) g.label(V.lerp(O, R, 0.6), "OR² = " + f, { tone: "curve2", dy: 4, dx: 12, anchor: "start", minor: true });
        g.label(V.lerp(O, Q, 0.5), "OQ = " + (root(n) || "√" + n), { tone: "curve", dx: -10, dy: -8, anchor: "end", minor: true });
      }
    },

    say: function (s, quiz) {
      if (quiz) return "Q = (" + s.x + ", " + s.y + ", " + s.z + ").";
      var f = s.x * s.x + s.y * s.y, n = f + s.z * s.z, r = root(n);
      return "On the floor OR² = " + s.x + "² + " + s.y + "² = " + f + ". Standing up OQ² = " + f + " + " + s.z +
        "² = " + n + ", so <b>OQ = √" + n + (r ? " = " + r : " ≈ " + round3(Math.sqrt(n))) + "</b>.";
    },

    answer: function (s) { return Math.sqrt(sq(s)); },

    missions: [
      { text: "Make OQ exactly 7, with no coordinate 0.", test: function (s) { return s.x && s.y && s.z && sq(s) === 49; } },
      { text: "Make a cube’s diagonal: all three coordinates equal.", test: function (s) { return s.x && s.x === s.y && s.y === s.z; } },
      { text: "Make a distance that needs the Pythagorean theorem only once.", test: function (s) {
          var zeros = (s.x === 0) + (s.y === 0) + (s.z === 0);
          return zeros === 1;
        } }
    ],

    cases: [
      { set: { x: 2, y: 3, z: 6 }, answer: "7" },
      { set: { x: 6, y: 2, z: 3 }, answer: "7" },
      { set: { x: 3, y: 6, z: 2 }, answer: "7" },
      { set: { x: 4, y: 3, z: 2 }, not: "7" },
      { set: { x: 4, y: 4, z: 7 }, answer: "9", not: "7" }
    ],

    /* once solved, turn to face the upright triangle: the second right angle shows true */
    reveal: function (api) {
      api.view(faceAz(api.state, api.cam), 0, true);
    }
  });
})();
