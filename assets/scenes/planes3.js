/* ===========================================================================
   Basic Mathematics — scene "planes3" (Chapter 2, §2.3 "Equations in three unknowns")
   Three equations in x, y, z are three planes in space, and a solution is a
   point on all three. Planes 1 and 2 are fixed (Example 3's first two
   equations); the learner edits equation 3, ax + by + cz = d. The system has
   one point, a whole line, or nothing: plane 3 parallel to one of the others,
   or, with no counterpart in two unknowns, three planes of which no two are
   parallel that still share no point (each pair meets in a line, and the
   three lines run side by side).
   Everything is decided with exact integer arithmetic.
   =========================================================================== */
(function () {
  "use strict";
  if (!window.BM3D || !window.BM3D.define) return;
  var V = window.BM3D.V;

  var N1 = [1, 1, 1], D1 = 6, N2 = [2, -1, 1], D2 = 3;
  var FACES = ["faceA", "faceB", "faceC"], EDGES = ["curve", "curve2", "curve3"];
  /* the box the planes are cut to: this one always, grown to take in the common point
     and the handle on plane 3, never past LIMIT */
  var BASE = [[-1, -1, -1], [5, 5, 5]], CENTER = [2, 2, 2], LIMIT = [-13, 17];
  /* the direction of the line where planes 1 and 2 meet, N1 × N2 = (2, 1, −3); looking
     along it turns that line into a point */
  var ALONG_AZ = Math.atan2(-1, -2) * 180 / Math.PI, ALONG_EL = Math.asin(3 / Math.sqrt(14)) * 180 / Math.PI;

  /* -------------------------------------------------------- exact arithmetic -- */

  function det(r0, r1, r2) {
    return r0[0] * (r1[1] * r2[2] - r1[2] * r2[1]) -
      r0[1] * (r1[0] * r2[2] - r1[2] * r2[0]) +
      r0[2] * (r1[0] * r2[1] - r1[1] * r2[0]);
  }
  function n3(s) { return [s.a, s.b, s.c]; }
  function isZero(v) { return !v[0] && !v[1] && !v[2]; }
  function parallel(u, v) { return isZero(V.cross(u, v)); }
  /* the coefficient determinant and the three with the right sides put in place of a column */
  function minors(s) {
    var n = n3(s), d = [D1, D2, s.d];
    function col(i) {
      return [N1, N2, n].map(function (r, k) { var q = r.slice(); q[i] = d[k]; return q; });
    }
    var cx = col(0), cy = col(1), cz = col(2);
    return { D: det(N1, N2, n), x: det(cx[0], cx[1], cx[2]), y: det(cy[0], cy[1], cy[2]), z: det(cz[0], cz[1], cz[2]) };
  }
  /* "point" | "line" | "parallel" | "prism" | "none" */
  function kind(s) {
    var n = n3(s);
    if (isZero(n)) return s.d === 0 ? "line" : "none";
    var m = minors(s);
    if (m.D) return "point";
    if (!m.x && !m.y && !m.z) return "line";
    if (parallel(n, N1) || parallel(n, N2)) return "parallel";
    return "prism";
  }

  /* ------------------------------------------------------------ the words -- */

  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = b; b = a % b; a = t; } return a || 1; }
  function minus(v) { return String(v).replace("-", "−"); }
  function frac(p, q) {
    if (q < 0) { p = -p; q = -q; }
    var g = gcd(p, q);
    p /= g; q /= g;
    return q === 1 ? minus(p) : minus(p) + "/" + q;
  }
  function eqText(a, b, c, d) {
    var out = "";
    [[a, "x"], [b, "y"], [c, "z"]].forEach(function (t) {
      var k = t[0];
      if (!k) return;
      var m = Math.abs(k), body = (m === 1 ? "" : m) + t[1];
      out += out ? (k < 0 ? " − " : " + ") + body : (k < 0 ? "−" : "") + body;
    });
    return (out || "0") + " = " + minus(d);
  }
  /* λ × equation 1 + μ × equation 2, with λ = p1/2 and μ = p2/2 */
  function comb(p1, p2) {
    var out = "";
    [[p1, "equation 1"], [p2, "equation 2"]].forEach(function (t) {
      if (!t[0]) return;
      var g = gcd(t[0], 2), p = Math.abs(t[0]) / g, q = 2 / g;
      var body = (p === 1 && q === 1 ? "" : (q === 1 ? p : p + "/" + q) + " × ") + t[1];
      out += out ? (t[0] < 0 ? " − " : " + ") + body : (t[0] < 0 ? "−" : "") + body;
    });
    return out;
  }
  function equations(s) {
    return "Equation 1: " + eqText(1, 1, 1, D1) + "<br>Equation 2: " + eqText(2, -1, 1, D2) +
      "<br>Equation 3: " + eqText(s.a, s.b, s.c, s.d);
  }

  /* ------------------------------------------------------------- geometry -- */

  /* the point where the three planes meet (only when D ≠ 0) */
  function meet(s) {
    var m = minors(s);
    return m.D ? [m.x / m.D, m.y / m.D, m.z / m.D] : null;
  }
  /* the point of plane 3 nearest the middle of the base box: where its handle sits */
  function foot(s) {
    var n = n3(s), q = V.dot(n, n);
    return q ? V.add(CENTER, V.scale(n, (s.d - V.dot(n, CENTER)) / q)) : null;
  }
  function inside(p, b) {
    return p[0] >= b[0][0] - 1e-9 && p[0] <= b[1][0] + 1e-9 && p[1] >= b[0][1] - 1e-9 && p[1] <= b[1][1] + 1e-9 &&
      p[2] >= b[0][2] - 1e-9 && p[2] <= b[1][2] + 1e-9;
  }
  function box(s) {
    var lo = BASE[0].slice(), hi = BASE[1].slice(), take = [foot(s)];
    if (kind(s) === "point") take.push(meet(s));
    take.forEach(function (p) {
      if (!p) return;
      for (var i = 0; i < 3; i++) {
        lo[i] = Math.max(LIMIT[0], Math.min(lo[i], Math.floor(p[i] - 0.8)));
        hi[i] = Math.min(LIMIT[1], Math.max(hi[i], Math.ceil(p[i] + 0.8)));
      }
    });
    return [lo, hi];
  }
  /* the plane n·p = d cut to the box: a convex polygon in order, or null */
  var CORNER_EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  function cut(n, d, b) {
    var c = [], pts = [];
    for (var i = 0; i < 8; i++) c.push([b[i & 1 ? 1 : 0][0], b[i & 2 ? 1 : 0][1], b[i & 4 ? 1 : 0][2]]);
    CORNER_EDGES.forEach(function (e) {
      var p = c[e[0]], q = c[e[1]], fp = V.dot(n, p) - d, fq = V.dot(n, q) - d;
      if (Math.abs(fp) < 1e-12) pts.push(p);
      if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) pts.push(V.lerp(p, q, fp / (fp - fq)));
    });
    var uniq = [];
    pts.forEach(function (p) {
      if (!uniq.some(function (q) { return V.len(V.sub(p, q)) < 1e-9; })) uniq.push(p);
    });
    if (uniq.length < 3) return null;
    var mid = [0, 0, 0];
    uniq.forEach(function (p) { mid = V.add(mid, V.scale(p, 1 / uniq.length)); });
    var u = V.norm(V.sub(uniq[0], mid)), w = V.cross(V.norm(n), u);
    uniq.sort(function (p, q) {
      var dp = V.sub(p, mid), dq = V.sub(q, mid);
      return Math.atan2(V.dot(dp, w), V.dot(dp, u)) - Math.atan2(V.dot(dq, w), V.dot(dq, u));
    });
    return uniq;
  }
  /* split a convex polygon by the plane n·p = d into the parts on either side, so the
     painters' depth sort sees pieces that do not pass through one another */
  function split(poly, n, d) {
    var f = poly.map(function (p) { return V.dot(n, p) - d; });
    var sc = Math.max(1, V.len(n));
    if (!f.some(function (v) { return v > 1e-9 * sc; }) || !f.some(function (v) { return v < -1e-9 * sc; })) return [poly];
    var A = [], B = [];
    poly.forEach(function (p, i) {
      var j = (i + 1) % poly.length, q = poly[j], fp = f[i], fq = f[j];
      if (fp >= 0) A.push(p);
      if (fp <= 0) B.push(p);
      if ((fp > 0 && fq < 0) || (fp < 0 && fq > 0)) {
        var x = V.lerp(p, q, fp / (fp - fq));
        A.push(x); B.push(x);
      }
    });
    return [A, B].filter(function (P) { return P.length >= 3; });
  }
  /* the line where two planes meet, cut to the box: [p, q] or null */
  function crossing(na, da, nb, db, b) {
    var dir = V.cross(na, nb);
    if (isZero(dir)) return null;
    var D = det(na, nb, dir), r = [da, db, V.dot(dir, CENTER)];
    var p = [0, 1, 2].map(function (i) {
      var rows = [na.slice(), nb.slice(), dir.slice()];
      rows.forEach(function (row, k) { row[i] = r[k]; });
      return det(rows[0], rows[1], rows[2]) / D;
    });
    var t0 = -1e9, t1 = 1e9;
    for (var i = 0; i < 3; i++) {
      if (!dir[i]) {
        if (p[i] < b[0][i] || p[i] > b[1][i]) return null;
      } else {
        var ta = (b[0][i] - p[i]) / dir[i], tb = (b[1][i] - p[i]) / dir[i];
        t0 = Math.max(t0, Math.min(ta, tb));
        t1 = Math.min(t1, Math.max(ta, tb));
      }
    }
    return t1 > t0 ? [V.add(p, V.scale(dir, t0)), V.add(p, V.scale(dir, t1))] : null;
  }
  function planes(s) {
    return [[N1, D1], [N2, D2], [n3(s), s.d]];
  }
  function showsPlane3(s) {
    return !isZero(n3(s)) && !!cut(n3(s), s.d, box(s));
  }

  window.BM3D.define("planes3", {
    label: "Three planes in space, one for each equation of a system in x, y and z, and the lines where they meet",
    sibling: "linsys",
    note: "Move the sliders to change equation 3, ax + by + cz = d. Drag the round handle on plane 3 to slide it " +
      "without tilting it (only d changes); drag anywhere else to turn the view. From the keyboard: Tab to the " +
      "picture, slide plane 3 with the arrow keys, press Space to switch to turning the view; Home resets it.",
    view: {
      az: 30, el: 18, center: CENTER, radius: 4.5,
      fit: function (s) {
        var b = box(s), d = V.sub(b[1], b[0]);
        return { center: V.scale(V.add(b[0], b[1]), 0.5), radius: Math.max(4.5, 0.43 * V.len(d)) };
      },
      presets: [["3D", 30, 18], ["along the line of planes 1 and 2", ALONG_AZ, ALONG_EL], ["from above", -90, 90]]
    },
    state: { a: 1, b: 2, c: -1, d: 2 },

    controls: function (api) {
      api.slider("a", -3, 3, 1, "a", minus);
      api.slider("b", -3, 3, 1, "b", minus);
      api.slider("c", -3, 3, 1, "c", minus);
      api.slider("d", -12, 12, 1, "d", minus);
      /* the rail is the normal of plane 3, scaled so one step along it changes d by exactly 1;
         at() keeps both up to date as the sliders tilt the plane */
      var rail = [1, 0, 0], hd = null;
      hd = api.handle({
        name: "plane 3",
        tone: "curve3",
        axis: rail,
        at: function (s) {
          var n = n3(s), q = V.dot(n, n);
          if (q) { rail[0] = n[0]; rail[1] = n[1]; rail[2] = n[2]; hd.step = 1 / q; }
          return foot(s) || CENTER.slice();
        },
        move: function (s, p) {
          s.d = Math.max(-12, Math.min(12, Math.round(V.dot(n3(s), p))));
        },
        enabled: function (s) { return !isZero(n3(s)); }
      });
    },

    draw: function (g, s, api) {
      var quiz = api.quiz(), cam = api.cam, b = box(s), k = kind(s), list = planes(s);
      var span = Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]);
      g.axes({ min: [Math.min(0, b[0][0]), Math.min(0, b[0][1]), Math.min(0, b[0][2])],
        max: [b[1][0] + 1, b[1][1] + 1, b[1][2] + 0.8], ticks: span > 10 ? 5 : 0 });
      var polys = list.map(function (P) { return isZero(P[0]) ? null : cut(P[0], P[1], b); });
      /* each plane cut along the other two, then its outline */
      polys.forEach(function (poly, i) {
        if (!poly) return;
        var pieces = [poly];
        list.forEach(function (Q, j) {
          if (j === i || isZero(Q[0])) return;
          var next = [];
          pieces.forEach(function (pc) { next = next.concat(split(pc, Q[0], Q[1])); });
          pieces = next;
        });
        pieces.forEach(function (pc) { g.face(pc, { tone: FACES[i], alpha: 0.5 }); });
        g.path(poly, { tone: EDGES[i], w: 1.75, closed: true });
      });
      /* the lines where each pair of planes meets */
      var c0 = cam.project(V.scale(V.add(b[0], b[1]), 0.5));
      [[0, 1], [0, 2], [1, 2]].forEach(function (pr) {
        var A = list[pr[0]], B = list[pr[1]];
        if (isZero(A[0]) || isZero(B[0])) return;
        var seg = crossing(A[0], A[1], B[0], B[1], b);
        if (seg) g.seg(seg[0], seg[1], { tone: !quiz && k === "line" ? "point" : "ink", w: !quiz && k === "line" ? 3.5 : 2.25 });
      });
      /* each plane's name near the edge of its polygon, pushed apart: 1 left, 2 right, 3 low */
      var pulls = [[-1, -0.35], [1, -0.35], [0.2, 1]];
      polys.forEach(function (poly, i) {
        if (!poly) return;
        var best = null, bs = -1e9;
        poly.forEach(function (p) {
          var q = cam.project(p), sc = (q[0] - c0[0]) * pulls[i][0] + (q[1] - c0[1]) * pulls[i][1];
          if (sc > bs) { bs = sc; best = p; }
        });
        var mid = [0, 0, 0];
        poly.forEach(function (p) { mid = V.add(mid, V.scale(p, 1 / poly.length)); });
        g.label(V.lerp(best, mid, 0.18), "plane " + (i + 1), { tone: EDGES[i], weight: 700, dy: i === 2 ? 14 : -6 });
      });
      if (!quiz && k === "point") {
        var p = meet(s), m = minors(s);
        if (inside(p, b)) {
          g.dot(p, { r: 5.5 });
          g.label(p, "(" + frac(m.x, m.D) + ", " + frac(m.y, m.D) + ", " + frac(m.z, m.D) + ")", { dy: -14, weight: 700, minor: true });
        }
      }
    },

    say: function (s, quiz) {
      var out = equations(s), k = kind(s);
      if (!isZero(n3(s)) && !showsPlane3(s)) out += "<br>Plane 3 lies outside the box drawn.";
      if (quiz) return out;
      var m = minors(s), p1 = s.b + s.c, p2 = s.c - s.b;
      if (k === "point") {
        return out + "<br><b>One solution: (" + frac(m.x, m.D) + ", " + frac(m.y, m.D) + ", " + frac(m.z, m.D) + ").</b> " +
          "Elimination leaves one value for each unknown: the three planes cross at a single point.";
      }
      if (isZero(n3(s))) {
        return out + (s.d === 0
          ? "<br><b>Infinitely many solutions.</b> Equation 3 says 0 = 0, true everywhere: it adds nothing, " +
            "so the solutions are the whole line where planes 1 and 2 meet."
          : "<br><b>No solution.</b> Equation 3 says 0 = " + minus(s.d) + ", false for every point.");
      }
      if (k === "line") {
        var again = !p2 ? " Plane 3 is plane 1 again." : !p1 ? " Plane 3 is plane 2 again." : "";
        return out + "<br><b>Infinitely many solutions: a whole line.</b> Equation 3 is " + comb(p1, p2) +
          ", right side included, so it adds no information." + again +
          " Every point on the line where planes 1 and 2 meet is on plane 3 too.";
      }
      if (k === "parallel") {
        var one = parallel(n3(s), N1), mult = one ? s.a : s.c, j = one ? 1 : 2;
        return out + "<br><b>No solution.</b> The left side of equation 3 is " + (mult === 1 ? "" : minus(mult) + " × ") +
          "the left side of equation " + j + ", but its right side is " + minus(s.d) + ", not " +
          minus(mult * (one ? D1 : D2)) + ": planes 3 and " + j + " are parallel and never meet.";
      }
      return out + "<br><b>No solution.</b> The left side of equation 3 is the left side of (" + comb(p1, p2) +
        "), whose right side is " + frac(3 * s.b + 9 * s.c, 2) + ", not " + minus(s.d) + ": subtracting leaves 0 = " +
        frac(2 * s.d - 3 * s.b - 9 * s.c, 2) + ". No two planes are parallel, so each pair meets in a line, " +
        "but the three lines run side by side and never meet.";
    },

    answer: function (s) { return kind(s); },

    missions: [
      { text: "Make all three planes meet at (3, 3, 0).", test: function (s) {
          return kind(s) === "point" && 3 * s.a + 3 * s.b === s.d;
        } },
      { text: "Make a system with no solution in which no two planes are parallel.", test: function (s) {
          return kind(s) === "prism";
        } },
      { text: "Make all three planes pass through one line, with plane 3 different from planes 1 and 2.", test: function (s) {
          return kind(s) === "line" && !isZero(n3(s)) && !parallel(n3(s), N1) && !parallel(n3(s), N2);
        } }
    ],

    cases: [
      { set: { a: 3, b: 0, c: 2, d: 4 }, answer: "prism" },
      { set: { a: -1, b: 2, c: 0, d: 0 }, answer: "prism" },
      { set: { a: 0, b: 3, c: 1, d: -3 }, answer: "prism" },
      { set: { a: 3, b: 0, c: 2, d: 9 }, answer: "line", not: "prism" },
      { set: { a: 0, b: 3, c: 1, d: 9 }, answer: "line" },
      { set: { a: -1, b: 2, c: 0, d: 3 }, answer: "line" },
      { set: { a: 2, b: 2, c: 2, d: 12 }, answer: "line" },
      { set: { a: 0, b: 0, c: 0, d: 0 }, answer: "line" },
      { set: { a: 2, b: 2, c: 2, d: 5 }, answer: "parallel", not: "prism" },
      { set: { a: 2, b: -1, c: 1, d: 7 }, answer: "parallel" },
      { set: { a: 0, b: 0, c: 0, d: 4 }, answer: "none" },
      { set: { a: 1, b: 0, c: 0, d: 3 }, answer: "point" },
      { set: {}, answer: "point", not: "line" }
    ],

    /* once solved, look along the line of planes 1 and 2: three planes through one line
       show as three lines through a point, the side-by-side case as a triangle */
    reveal: function (api) {
      api.view(ALONG_AZ, ALONG_EL, true);
    }
  });
})();
