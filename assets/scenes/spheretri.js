/* ===========================================================================
   Basic Mathematics — scene "spheretri" (Chapter 5, §5.3, after Example 2)
   A picture of a surface where the parallel property fails. On a sphere the
   "straight lines" are great circles: the equator, and the meridians through
   the poles. The triangle has its corners at the north pole N and at two
   points A, B of the equator. Both meridians cross the equator at right
   angles, which on a flat page would make them parallel; here they meet at N.
   So the angles are 90°, 90° and whatever the angle at N is, and the sum is
   180° plus that angle. Change the angle at N with the slider, or drag B
   along the equator.
   =========================================================================== */
(function () {
  "use strict";
  if (!window.BM3D || !window.BM3D.define) return;
  var V = window.BM3D.V;
  var DEG = Math.PI / 180;
  var R = 3;                 /* the sphere's radius */
  var LO = 15, HI = 165, STEP = 15;
  /* The triangle's sides and marks stand a little off the surface and its coloured patch a
     little less, so the flat painter, which sorts by depth, keeps the sides on top. The
     rest of the equator lies on the surface itself: the GL painter's ball is a mesh just
     inside the true sphere, and a lifted ring would float off its outline. */
  var LINE_R = R * 1.02, FACE_R = R * 1.01, EQ_R = R;

  /* the point at longitude lon and latitude lat (degrees), at distance r from the centre */
  function at(lon, lat, r) {
    var a = lon * DEG, b = lat * DEG;
    return [r * Math.cos(b) * Math.cos(a), r * Math.cos(b) * Math.sin(a), r * Math.sin(b)];
  }
  function snap(v) { return Math.max(LO, Math.min(HI, Math.round(v / STEP) * STEP)); }
  function sum(s) { return 180 + s.ang; }

  /* B's rail is the tangent to the equator at B. A move hands back a point on the tangent
     at the angle where the drag (or key press) began; find which of the allowed angles that
     was, and read the distance along it as an arc of the equator, so one drag can carry B
     all the way round instead of stalling as the tangent runs away from the circle. */
  function tangent(ang) { return [-Math.sin(ang * DEG), Math.cos(ang * DEG), 0]; }
  function angleOf(s, p) {
    var best = null, gap = Infinity;
    for (var a0 = LO; a0 <= HI; a0 += STEP) {
      var radial = at(a0, 0, 1);
      if (Math.abs(V.dot(p, radial) - R) > 1e-6 * R) continue;
      var a = a0 + V.dot(p, tangent(a0)) / R / DEG;
      if (Math.abs(a - s.ang) < gap) { gap = Math.abs(a - s.ang); best = a; }
    }
    return best === null ? Math.atan2(p[1], p[0]) / DEG : best;
  }

  /* a great-circle arc (or any run of surface points) as short segments; a piece on the far
     side of the sphere comes out dashed, whichever way the view is turned */
  function surfacePath(g, pts, opts) {
    for (var i = 0; i + 1 < pts.length; i++) {
      var n = V.norm(V.add(pts[i], pts[i + 1]));
      g.seg(pts[i], pts[i + 1], { tone: opts.tone, w: opts.w, back: [n, n] });
    }
  }
  function meridian(lon) {
    var pts = [];
    for (var lat = 90; lat >= -1e-9; lat -= 3.75) pts.push(at(lon, lat, LINE_R));
    return pts;
  }
  function equatorArc(from, to, step, r) {
    var pts = [], n = Math.max(1, Math.ceil(Math.abs(to - from) / step));
    for (var i = 0; i <= n; i++) pts.push(at(from + (to - from) * i / n, 0, r));
    return pts;
  }

  window.BM3D.define("spheretri", {
    label: "A sphere with its equator, and a triangle whose corners are the north pole N and two points A and B on the equator, its sides arcs of great circles",
    sibling: "anglesum",
    note: "Change the angle at N with the slider, or drag B along the equator; drag anywhere else to turn the sphere. " +
      "From the keyboard: Tab to the picture, move B with the left and right arrow keys; Space switches to turning " +
      "the view; Home resets it.",
    view: {
      az: 22.5, el: 26, center: [0, 0, 0.1], radius: 3.35,
      presets: [
        ["3D", 22.5, 26],
        ["above the pole", -90, 90],
        ["face the triangle", function (s) { return s.ang / 2; }, 12]
      ]
    },
    state: { ang: 45 },

    controls: function (api, s) {
      api.slider("angle at N", LO, HI, STEP, "ang", function (v) { return v + "°"; });
      var hd = api.handle({
        name: "B",
        tone: "curve2",
        at: function (s) { return at(s.ang, 0, R); },
        axis: [0, 1, 0],
        /* one key press is one 15° step along the equator */
        step: R * STEP * DEG,
        move: function (s, p) { s.ang = snap(angleOf(s, p)); }
      });
      /* the rail turns with B: always the tangent to the equator where B now is */
      Object.defineProperty(hd, "axes", { get: function () { return [tangent(s.ang)]; } });
    },

    draw: function (g, s, api) {
      var quiz = api.quiz(), ang = s.ang;
      var N = at(0, 90, LINE_R), A = at(0, 0, LINE_R), B = at(ang, 0, LINE_R);
      var lat, lon, i;
      g.sphere([0, 0, 0], R, { tone: "faceA", alpha: 0.5 });

      /* the triangle's surface, in small pieces that follow the curve */
      var nLon = Math.max(2, Math.round(ang / 7.5)), dLon = ang / nLon;
      for (lat = 0; lat < 90 - 1e-9; lat += 7.5) {
        for (i = 0; i < nLon; i++) {
          lon = i * dLon;
          if (lat + 7.5 >= 90 - 1e-9) {
            g.face([at(lon, lat, FACE_R), at(lon + dLon, lat, FACE_R), at(0, 90, FACE_R)], { tone: "faceB" });
          } else {
            g.face([at(lon, lat, FACE_R), at(lon + dLon, lat, FACE_R), at(lon + dLon, lat + 7.5, FACE_R),
              at(lon, lat + 7.5, FACE_R)], { tone: "faceB" });
          }
        }
      }

      /* the rest of the equator, thin; then the three sides */
      surfacePath(g, equatorArc(ang, 360, 5, EQ_R), { tone: "muted", w: 1.75 });
      surfacePath(g, meridian(0), { tone: "curve2", w: 3 });
      surfacePath(g, meridian(ang), { tone: "curve2", w: 3 });
      surfacePath(g, equatorArc(0, ang, 3.75, LINE_R), { tone: "curve2", w: 3 });

      /* the angle at N, measured just below the pole */
      var arc = [], m = Math.max(4, Math.round(ang / 7.5));
      for (i = 0; i <= m; i++) arc.push(at(ang * i / m, 76, LINE_R * 1.003));
      surfacePath(g, arc, { tone: "curve", w: 2.5 });
      g.label(at(ang / 2, 61, LINE_R), ang + "°", { tone: "curve", weight: 700, dy: 5 });

      /* right-angle marks at A and B, drawn on the surface */
      var d = Math.min(7.5, ang / 3);
      surfacePath(g, [at(0, d, LINE_R), at(d, d, LINE_R), at(d, 0, LINE_R)], { tone: "ink", w: 1.5 });
      surfacePath(g, [at(ang, d, LINE_R), at(ang - d, d, LINE_R), at(ang - d, 0, LINE_R)], { tone: "ink", w: 1.5 });

      g.dot(N, { r: 4 });
      g.dot(A, { r: 4 });
      g.label(V.scale(N, 1.06), "N", { dx: -9, dy: -8, anchor: "end", weight: 700 });
      g.label(at(0, -3, R * 1.13), "A", { dy: 8, weight: 700 });
      g.label(at(ang, -3, R * 1.13), "B", { dy: 8, weight: 700 });
      if (!quiz) {
        g.label(at(ang / 2, 30, R * 1.02), "sum " + sum(s) + "°", { tone: "ink", weight: 650, minor: true });
      }
    },

    say: function (s, quiz) {
      var angles = "Angles: at N <b>" + s.ang + "°</b>, at A 90°, at B 90°.";
      if (quiz) return angles;
      return angles + "<br>Sum: " + s.ang + "° + 90° + 90° = <b>" + sum(s) + "°</b>, which is " + s.ang +
        "° more than the 180° of a flat triangle.";
    },

    answer: function (s) { return sum(s); },

    missions: [
      { text: "Make a triangle with three right angles.", test: function (s) { return s.ang === 90; } },
      { text: "Make the angles add up to 300°.", test: function (s) { return sum(s) === 300; } }
    ],

    cases: [
      { set: { ang: 90 }, answer: "270" },
      { set: { ang: 45 }, not: "270" },
      { set: { ang: 105 }, not: "270" },
      { set: { ang: 120 }, answer: "300", not: "270" },
      { set: { ang: 15 }, answer: "195" },
      { set: { ang: 165 }, answer: "345" }
    ],

    /* once solved, look straight down on the pole: the angle there shows at its true size */
    reveal: function (api) {
      api.view(-90, 90, true);
    }
  });
})();
