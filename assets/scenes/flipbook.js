/* ===========================================================================
   Basic Mathematics — scene "flipbook" (Chapter 6, §6.3 Symmetry)
   The book from the chapter's opening puzzle, lying on a table. Turn gives it a
   quarter turn clockwise, seen from above; Flip turns it over left to right, a
   half turn through space about the line down the middle of the table. Seen
   from above the flip is the reflection in that line: a reflection of the plane
   is a half turn of the page through space. Turn-then-flip and flip-then-turn
   end differently, and Start again leaves the last run's position as a ghost so
   the two can be compared.

   Position: the 2×2 integer matrix m = [[a, b], [c, d]] sending (x, y) to
   (ax + by, cx + dy), seen from above with the origin at the book's centre; its
   columns are the images of the page's x axis (to the right) and y axis
   (towards the book's top edge). turn = [[0, 1], [−1, 0]], (x, y) ↦ (y, −x);
   flip = [[−1, 0], [0, 1]], (x, y) ↦ (−x, y); each move multiplies on the left.
   The front cover is up when ad − bc = 1, the back cover when it is −1, and the
   top edge of the book points along the second column (b, d).
   =========================================================================== */
(function () {
  "use strict";
  if (!window.BM3D || !window.BM3D.define) return;
  var V = window.BM3D.V;

  /* the book: half width W, half height H, half thickness D; covers in CELL squares */
  var W = 1.2, H = 1.5, D = 0.18, CELL = 0.3, COLS = 8, ROWS = 10;
  var GX = 4.7;          /* the ghost of the last run sits this far to the right */
  var MAX = 12;          /* moves per run */
  var MOVE = { t: [[0, 1], [-1, 0]], f: [[-1, 0], [0, 1]] };
  var NAME = { t: "turn", f: "flip" };

  function mul(p, q) {
    return [[p[0][0] * q[0][0] + p[0][1] * q[1][0], p[0][0] * q[0][1] + p[0][1] * q[1][1]],
      [p[1][0] * q[0][0] + p[1][1] * q[1][0], p[1][0] * q[0][1] + p[1][1] * q[1][1]]];
  }
  /* the position after a list of moves, "t" and "f", made in order */
  function matOf(moves) {
    var m = [[1, 0], [0, 1]];
    moves.forEach(function (k) { m = mul(MOVE[k], m); });
    return m;
  }
  function det(m) { return m[0][0] * m[1][1] - m[0][1] * m[1][0]; }
  function key(m) { return [m[0][0], m[0][1], m[1][0], m[1][1]].join(","); }
  function isStart(m) { return key(m) === "1,0,0,1"; }
  function has(moves, k) { return moves.indexOf(k) >= 0; }

  /* the position in words: which cover is up, then where the top edge (b, d) points */
  function words(m) {
    var front = det(m) > 0, b = m[0][1], d = m[1][1];
    var cover = front ? "front cover up" : "back cover up";
    if (d === 1) return cover + (front ? ", as at the start" : ", the right way up");
    if (d === -1) return cover + ", upside down";
    return cover + ", turned a quarter turn " + (b === 1 ? "clockwise" : "counterclockwise");
  }
  /* the same position as a map of the table, in the chapter's notation */
  function image(m) {
    function term(r) {
      return r[0] ? (r[0] > 0 ? "x" : "−x") : (r[1] > 0 ? "y" : "−y");
    }
    return "(" + term(m[0]) + ", " + term(m[1]) + ")";
  }
  function listOf(moves) { return moves.map(function (k) { return NAME[k]; }).join(", "); }

  /* ------------------------------------------------------- the book in space -- */

  function rot3(m) { return [[m[0][0], m[0][1], 0], [m[1][0], m[1][1], 0], [0, 0, det(m)]]; }
  function mul3(p, q) {
    var out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 3; j++) out[i][j] = p[i][0] * q[0][j] + p[i][1] * q[1][j] + p[i][2] * q[2][j];
    }
    return out;
  }
  function act(R, v) {
    return [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2],
      R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]];
  }
  /* a turn is a rotation about the upright z axis; a flip one about the y axis */
  function rotZ(t) { var c = Math.cos(t), s = Math.sin(t); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; }
  function rotY(t) { var c = Math.cos(t), s = Math.sin(t); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; }

  /* where the book is: at rest, or part of the way through a move (s.anim) */
  function pose(s) {
    var a = s.anim;
    if (!a) return { R: rot3(matOf(s.moves)), c: [0, 0, D] };
    var R0 = rot3(a.from), u = a.u;
    if (a.k === "t") return { R: mul3(rotZ(-Math.PI / 2 * a.dir * u), R0), c: [0, 0, D] };
    return { R: mul3(rotY(Math.PI * a.dir * u), R0), c: [0, 0, D + lift(s)] };
  }
  /* a flip lifts the book while it turns over, so no edge goes through the table: by its
     half width along x, which is how far that edge drops at the halfway point */
  function lift(s) {
    var a = s.anim;
    if (!a || a.k !== "f") return 0;
    var hx = Math.abs(a.from[0][0]) * W + Math.abs(a.from[0][1]) * H;
    return hx * Math.sin(Math.PI * a.u);
  }

  /* the cover marks, cell (i, j) counted from the cover's lower left corner as it is seen */
  function inF(i, j) {
    return (i >= 2 && i <= 3 && j >= 1 && j <= 8) || (j >= 7 && j <= 8 && i >= 2 && i <= 6) ||
      (j >= 4 && j <= 5 && i >= 2 && i <= 5);
  }
  /* an arrow towards the top edge; symmetric, so seeing the back cover mirrored changes nothing */
  function inArrow(i, j) {
    return (i >= 3 && i <= 4 && j >= 1 && j <= 5) || (j === 6 && i >= 1 && i <= 6) ||
      (j === 7 && i >= 2 && i <= 5) || (j === 8 && i >= 3 && i <= 4);
  }

  /* The book as small coplanar tiles. Small tiles keep the SVG painter's depth sort honest
     (no tile is far from the face it might cover), and the marks are tiles of another tone,
     so nothing lies on top of anything. Inner tile edges overlap by SEAM, so the flat picture
     shows no hairlines between them. At rest the face on the table is left out; while a move
     plays, faces turned away from the camera are. The ghost is only its top: a see-through
     cover, the outline of its mark, and the edges. */
  var SEAM = 0.012;
  function drawBook(g, p, o) {
    var R = p.R, c = p.c;
    function at(l) { return V.add(c, act(R, l)); }
    function lit(nl) {
      var n = act(R, nl);
      if (n[2] < -0.99 && !o.moving) return false;
      return !(o.moving && o.e && V.dot(n, o.e) < -1e-6);
    }
    /* the rectangle [u0, u1] × [v0, v1] of a face, spread over the shared inner edges */
    function tile(pt, u0, u1, v0, v1, inner, opts) {
      var a = u0 - (inner[0] ? SEAM : 0), b = u1 + (inner[1] ? SEAM : 0);
      var d = v0 - (inner[2] ? SEAM : 0), e = v1 + (inner[3] ? SEAM : 0);
      g.face([at(pt(a, d)), at(pt(b, d)), at(pt(b, e)), at(pt(a, e))], opts);
    }
    function cover(z, mark, base, ink, mirror) {
      if (!lit([0, 0, z > 0 ? 1 : -1])) return;
      function on(i, j) {
        return i >= 0 && i < COLS && j >= 0 && j < ROWS && mark(mirror ? COLS - 1 - i : i, j);
      }
      function pt(x, y) { return [x, y, z]; }
      var i, j;
      if (o.ghost) {
        tile(pt, -W, W, -H, H, [0, 0, 0, 0], { tone: base, alpha: 0.35 });
        for (i = 0; i < COLS; i++) {
          for (j = 0; j < ROWS; j++) {
            if (!on(i, j)) continue;
            var x0 = -W + i * CELL, y0 = -H + j * CELL, x1 = x0 + CELL, y1 = y0 + CELL, t = { tone: ink, w: 2 };
            if (!on(i - 1, j)) g.seg(at([x0, y0, z]), at([x0, y1, z]), t);
            if (!on(i + 1, j)) g.seg(at([x1, y0, z]), at([x1, y1, z]), t);
            if (!on(i, j - 1)) g.seg(at([x0, y0, z]), at([x1, y0, z]), t);
            if (!on(i, j + 1)) g.seg(at([x0, y1, z]), at([x1, y1, z]), t);
          }
        }
        return;
      }
      /* overlap only into a neighbour of the same tone: where the mark meets the cover the
         tiles meet exactly, so 3D shows a clean edge there */
      for (i = 0; i < COLS; i++) {
        for (j = 0; j < ROWS; j++) {
          var me = on(i, j);
          tile(pt, -W + i * CELL, -W + (i + 1) * CELL, -H + j * CELL, -H + (j + 1) * CELL,
            [i > 0 && on(i - 1, j) === me, i < COLS - 1 && on(i + 1, j) === me,
              j > 0 && on(i, j - 1) === me, j < ROWS - 1 && on(i, j + 1) === me], { tone: me ? ink : base });
        }
      }
    }
    function side(nl, tone) {
      if (o.ghost || !lit(nl)) return;
      var half = nl[0] ? H : W, fix = nl[0] ? nl[0] * W : nl[1] * H;
      function pt(t, h) { return nl[0] ? [fix, t, h] : [t, fix, h]; }
      for (var t = -half; t < half - 1e-9; t += CELL) {
        tile(pt, t, t + CELL, -D, D, [t > -half + 1e-9, t + CELL < half - 1e-9, 0, 0], { tone: tone });
      }
    }
    cover(D, inF, "faceA", "curve", false);
    /* the back cover is seen from below: its left is the page's right */
    cover(-D, inArrow, "faceB", "curve2", true);
    side([-1, 0, 0], "part");          /* the spine, on the left at the start */
    side([1, 0, 0], "grid");
    side([0, 1, 0], "grid");
    side([0, -1, 0], "grid");
    /* the twelve edges; one whose faces both look away comes out dashed (and hidden in 3D) */
    var N = { x0: act(R, [-1, 0, 0]), x1: act(R, [1, 0, 0]), y0: act(R, [0, -1, 0]), y1: act(R, [0, 1, 0]),
      z0: act(R, [0, 0, -1]), z1: act(R, [0, 0, 1]) };
    var edgeTone = o.ghost ? "muted" : "axis";
    [-1, 1].forEach(function (sx) {
      [-1, 1].forEach(function (sy) {
        var nx = sx < 0 ? N.x0 : N.x1, ny = sy < 0 ? N.y0 : N.y1;
        g.seg(at([sx * W, sy * H, -D]), at([sx * W, sy * H, D]), { tone: edgeTone, w: 1.25, back: [nx, ny] });
      });
      [-1, 1].forEach(function (sz) {
        var nz = sz < 0 ? N.z0 : N.z1;
        g.seg(at([sx * W, -H, sz * D]), at([sx * W, H, sz * D]), { tone: edgeTone, w: 1.25, back: [sx < 0 ? N.x0 : N.x1, nz] });
        g.seg(at([-W, sx * H, sz * D]), at([W, sx * H, sz * D]), { tone: edgeTone, w: 1.25, back: [sx < 0 ? N.y0 : N.y1, nz] });
      });
    });
  }

  /* how far the resting book reaches along y, for the guides on the table */
  function reachY(R) { return Math.abs(R[1][0]) * W + Math.abs(R[1][1]) * H + Math.abs(R[1][2]) * D; }

  /* the table: the line the flip turns about, and the way a turn goes */
  function drawGuides(g, p) {
    var fy = reachY(p.R) + 0.15, end = H + 0.8, z = 0.004;
    if (fy < end - 0.1) {
      g.seg([0, fy, z], [0, end, z], { tone: "axis", w: 1.5, dash: [6, 5] });
      g.seg([0, -fy, z], [0, -end, z], { tone: "axis", w: 1.5, dash: [6, 5] });
    }
    g.label([0, -end, 0], "flip axis", { tone: "muted", dy: 16, size: 0.9, weight: 550, minor: true });
    /* a clockwise arc on the left of the book, rising from about 210° to 150° */
    var r = Math.sqrt(W * W + H * H) + 0.4, pts = [];
    for (var a = 212; a >= 154; a -= 4) pts.push([r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180), z]);
    g.path(pts, { tone: "axis", w: 1.5 });
    g.arrow(pts[pts.length - 1], [r * Math.cos(146 * Math.PI / 180), r * Math.sin(146 * Math.PI / 180), z], { tone: "axis", w: 1.5, head: 9 });
    g.label([-r, 0, 0], "turn", { tone: "muted", dx: -10, dy: 4, anchor: "end", size: 0.9, weight: 550, minor: true });
  }

  window.BM3D.define("flipbook", {
    label: "A book lying on a table, its front cover marked with an F and its back cover with an arrow, " +
      "moved by quarter turns and flips",
    sibling: "symmetries",
    note: "Press Turn for a quarter turn clockwise, seen from above, and Flip to turn the book over left to right. " +
      "Undo takes back the last move; Start again puts the book back and leaves where it was as a ghost on the right. " +
      "Drag the picture to turn the view, or Tab to it and use the arrow keys; Home resets it.",
    view: {
      az: -104, el: 50, center: [-0.55, 0, 0.3], radius: 2.45,
      /* room for the ghost once there is one; a little more height while a flip lifts the book */
      fit: function (s) {
        var up = 0.25 * lift(s);
        return { center: [s.ghost ? 1.8 : -0.55, 0, 0.3 + 1.7 * up], radius: (s.ghost ? 2.75 : 2.45) + up };
      },
      presets: [["3D", -104, 50], ["from above", -90, 90]]
    },
    state: { moves: [], ghost: null, anim: null },

    controls: function (api, s) {
      function busy(s) { return !!s.anim; }
      /* play one move: forwards (dir 1) from the old position, or backwards for Undo */
      function play(s, k, dir, from) {
        s.anim = { k: k, dir: dir, from: from, u: 0 };
        api.animate(k === "t" ? 520 : 820, function (u) { if (s.anim) s.anim.u = u; }, function () { s.anim = null; });
      }
      function move(k) {
        return function (s) {
          var from = matOf(s.moves);
          s.moves.push(k);
          play(s, k, 1, from);
        };
      }
      function full(s) { return busy(s) || s.moves.length >= MAX; }
      api.button("Turn", move("t"), { disabled: full });
      api.button("Flip", move("f"), { disabled: full });
      api.button("Undo", function (s) {
        if (!s.moves.length) return;
        var from = matOf(s.moves);
        play(s, s.moves.pop(), -1, from);
      }, { disabled: function (s) { return busy(s) || !s.moves.length; } });
      api.button("Start again", function (s) {
        if (!s.moves.length) return;
        s.ghost = { moves: s.moves.slice() };
        s.moves = [];
      }, { disabled: function (s) { return busy(s) || !s.moves.length; } });
    },

    draw: function (g, s, api) {
      var p = pose(s), m = matOf(s.moves), lab = H + 0.8;
      drawGuides(g, p);
      drawBook(g, p, { moving: !!s.anim, e: api.cam.e });
      if (!s.ghost) return;
      var gm = matOf(s.ghost.moves);
      drawBook(g, { R: rot3(gm), c: [GX, 0, D] }, { ghost: true });
      g.label([GX, -reachY(rot3(gm)) - 0.3, 0], "last run", { tone: "muted", dy: 16, weight: 650 });
      /* only once the exercise is solved (or in the free figure) does the picture compare */
      var match = !api.quiz() && !s.anim && s.moves.length && key(m) === key(gm);
      g.label([0, lab, 0], match ? "this run: the same position" : "this run", { tone: match ? "ink" : "muted", dy: -10, weight: 650 });
    },

    say: function (s, quiz) {
      var txt = "Moves" + (s.moves.length ? " (" + s.moves.length + "): " + listOf(s.moves) : ": none yet") + ".";
      if (s.ghost) txt += " Last run: " + listOf(s.ghost.moves) + ".";
      if (quiz) return txt;
      var m = matOf(s.moves);
      return txt + "<br><b>" + words(m).charAt(0).toUpperCase() + words(m).slice(1) + ".</b> Seen from above, the moves " +
        "so far send (x, y) to " + image(m) + "." +
        (s.ghost && s.moves.length && key(m) === key(matOf(s.ghost.moves)) ? " The same position as the last run." : "");
    },

    /* "a,b,c,d/first move/number of moves" */
    answer: function (s) {
      return key(matOf(s.moves)) + "/" + (s.moves[0] || "") + "/" + s.moves.length;
    },

    missions: [
      { text: "Do “turn, then flip”, press Start again, then do “flip, then turn”, so both runs are on the table.",
        test: function (s) {
          var a = s.ghost ? s.ghost.moves.join("") : "", b = s.moves.join("");
          return (a === "tf" && b === "ft") || (a === "ft" && b === "tf");
        } },
      { text: "Show the back cover upside down: back cover up, with the book’s top edge pointing toward you.",
        test: function (s) {
          var m = matOf(s.moves);
          return det(m) < 0 && m[0][1] === 0 && m[1][1] === -1;
        } },
      { text: "Bring the book back to the start position in exactly four moves, using both buttons.",
        test: function (s) {
          return s.moves.length === 4 && has(s.moves, "t") && has(s.moves, "f") && isStart(matOf(s.moves));
        } }
    ],

    cases: [
      { set: { moves: ["f", "t", "t", "t"], ghost: { moves: ["t", "f"] } }, ask: "route", answer: "0,-1,-1,0/f/4" },
      { set: { moves: ["f", "f", "t", "f"] }, ask: "route", answer: "0,-1,-1,0/f/4" },
      { set: { moves: ["t", "f"] }, ask: "route", not: "0,-1,-1,0/f/4" },
      { set: { moves: ["f", "t"] }, ask: "route", not: "0,-1,-1,0/f/4" },
      { set: { moves: ["f", "t", "t", "t", "f", "f"] }, ask: "route", not: "0,-1,-1,0/f/4" },
      { set: { moves: ["f", "t", "f", "t"] }, ask: "route", answer: "1,0,0,1/f/4", not: "0,-1,-1,0/f/4" },
      { set: {}, ask: "route", answer: "1,0,0,1//0", not: "0,-1,-1,0/f/4" }
    ]
  });
})();
