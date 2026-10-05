/* ===========================================================================
   Basic Mathematics — playable 3D scenes
   window.BM3D: define, V, Cam, SvgPainter, palette (three-loader.js adds load,
   why, supported, lowEnd). One scene file per figure lives in assets/scenes/.

   A scene never touches THREE. It keeps a plain state object and, on every
   change, describes its picture to a display list. Two painters draw that list:
   an SVG projector (the first paint, the fallback, print, the Node smoke test)
   and a Three.js painter (assets/scenes3d-gl.js), fetched only when the stage
   comes within 400px of the viewport. If 3D never arrives the SVG picture is
   already fully interactive, so every exercise stays answerable offline and
   without WebGL.

   ---------------------------------------------------------------- defining
   BM3D.define("name", {
     label:    "Sentence that names the picture",   first words of the stage's aria-label
     sibling:  "distance",           optional: data-widget of the related flat figure;
                                     when it is on the page the note points back to it
     note:     "…",                  optional: replaces the generic how-to-drag note
     view: {   az: 32, el: 24,       camera, in degrees (az from +x toward +y; el above the floor)
               center: [x, y, z],    the point at the middle of the stage
               radius: 7,            world units that fit in the stage height (scale S = 420/(2.2·radius))
               bounds: [[x0, y0, z0], [x1, y1, z1]],   optional clipping box for plane()/line3();
                                     default: center ± radius
               presets: [["3D", 32, 24], ["from above", -90, 90], …],
                                     view buttons; az/el may be function (s, cam) → degrees
               fit: function (s) → { center, radius } },
                                     optional: re-frame as the state changes so the picture keeps
                                     filling the stage (held during a handle drag, eased after)
     state:    { … },                plain JSON; cloned per mount, then patched by data-start
     controls: function (api, s) { … },   build sliders, chips, buttons, handles (once)
     draw:     function (g, s, api) { … }, describe the picture (every change)
     say:      function (s, quiz) → html,  the readout. With quiz true, quantities only:
                                     never a verdict and never the asked-for value
     answer:   function (s, ask) → value,  what Check compares (host.__answer)
     missions: [{ text, test: function (s) → bool }],   each false at mount
     cases:    [{ set, ask, answer, not, compare }],     read only by tools/smoke-scenes.js:
                                     set is merged into state or is function (s, api);
                                     String(__answer()) must match answer (and not match not)
                                     under compare (default "number" when answer is numeric,
                                     else "exact")
     reveal:   function (api) { … }  optional, played once the exercise is solved
   });

   Each define makes window.BMWidgets[name] a synchronous factory, so
   <div class="widget" data-widget="name"> and data-type="figure" exercises mount
   it like any flat figure. Authoring attributes, read from the host or its .ex:
     data-ask="slant"                which quantity answer(s, ask) reports
     data-start='{"x": 1, "lock": [0, 1]}'   JSON merged into the initial state; scenes
                                     may define option keys of their own (det3 reads lock: the
                                     listed rows are read-only and have no handle)
   Quiz mode is a figure inside an exercise (data-no-missions) whose .ex is not yet
   correct. api.quiz() is then true: draw leaves out solution annotations, say
   reports quantities only, nothing turns green. Solving the exercise ends quiz
   mode, redraws, and plays spec.reveal.

   ---------------------------------------------------------------------- api
   api.slider(label, min, max, step, key, fmt)   key: a state key, or {get(s), set(s, v)}
   api.chips([{label, value}], key, groupLabel)  pressed state follows s[key]
   api.button(label, fn(s, api), {disabled(s)})  label may be function (s) → text
   api.matrix(key, min, max, {lock, tones, label})   3×3 number grid styled as a
                                     determinant, bound to s[key] (rows of numbers);
                                     lock: row indices (or function (s)) shown read-only
   api.views(presets)                view buttons (added automatically from view.presets)
   api.handle({ name, at(s) → [x, y, z], axis: [dx, dy, dz] (a rail, 1 DOF) |
                axes: [[1,0,0],[0,1,0],[0,0,1]] (a gizmo of rails),
                move(s, p) (write the proposed world point p into state: snap, clamp),
                step (keyboard step, default 1), tone, enabled(s),
                say(s, quiz) → words for the stage's label in place of "name at (x, y, z)"
                  (use it when the coordinates are what a quiz asks for, or are not yet taught),
                keys: words in place of the default arrow-key instructions })
   api.animate(ms, step(u), done)   eases u from 0 to 1, redrawing each frame; jumps to
                                     the end under reduced motion or calm mode; then
                                     re-checks the missions
   api.view(az, el, animated)       move the camera
   api.update()   redraw after changing state yourself (controls and handles already do)
   api.quiz()  api.ask()  api.opt(name)  api.state  api.cam  api.controls (the div)  api.h  api.el
   Closures made inside controls() belong to one mount (spec functions are shared by every
   mount on the page), so per-mount settings such as quiz-only slider ranges live there.

   ------------------------------------------------------------- display list
   draw(g, s, api) calls, all coordinates world [x, y, z] with z up:
     g.seg(a, b, o)        g.path([p…], o)  (o.closed)   g.arrow(from, to, o)  (o.head px)
     g.face([p…], o)       convex polygon; o.tone, o.alpha, o.stroke (tone), o.w
     g.box(min, max, o)    g.para(origin, u, v, w, o)   solids: o.tone, o.alpha (0 = no faces),
                           o.edges (tone, default "axis"; false = none), o.flat (tone of the
                           outline when the solid has no volume); hidden edges come out dashed
     g.cubes(cells, o)     unit cells [{at: [x, y, z], tone}] (or [x, y, z, tone]) filling
                           [x, x+1]×…; only exposed faces are drawn; o.stroke (default "surface")
     g.plane(n, d, o)      the plane n·p = d clipped to view.bounds     g.line3(p, dir, o) likewise
     g.sphere(c, r, o)     o.tone, o.alpha; o.edge: tone of its outline (default "axis",
                           false = none), o.w its width
     g.dot(p, o)  (o.r px)     g.label(p, text, o)  (o.dx, o.dy, o.anchor,
                           o.size scale, o.weight; o.minor: dropped on phone-width stages)
     g.grid(o)             floor lines: o.z, o.min [x, y], o.max [x, y], o.step (lines through 0
                           on the floor are left to the axes)
     g.axes(o)             o.min, o.max [x, y, z], o.labels ["x", "y", "z"], o.ticks (step)
     g.right(corner, u, v, o)   right-angle mark between directions u and v (o.size world)
   Shared options: o.tone (palette name), o.w (stroke width, viewBox px), o.dash (true or
   [on, off]), o.alpha. Tones: curve curve2 curve3 curve4 ok bad axis grid fill point ink
   muted accent part surface faceA faceB faceC ground hot, resolved from the CSS tokens.
   Labels, dots and handles go to the overlay (svg.s3d-over) for both painters.
   BM3D.V: add sub scale dot cross len norm lerp.

   ------------------------------------------------------------------ input
   Press within 30 viewBox units of a handle to drag it (a gizmo picks the rail that
   best matches the drag); press elsewhere to orbit (0.4° per px). A finger turns the view
   only once its swipe is clearly sideways: a vertical swipe scrolls the page and leaves
   the view as it was. Keyboard: Tab to the stage; arrows move the selected handle the way
   they point on the screen (a gizmo gives ←→ and ↑↓ the rails that best match them and
   Page Up/Down the third; the stage's label names them); Space or Enter selects the next
   handle and finally the view (arrows turn it 5°, Shift 15°); Home resets the view. Keys
   pressed on the Reset view button inside the stage are the button's own.
   =========================================================================== */
(function () {
  "use strict";
  var BM3D = window.BM3D = window.BM3D || {};
  var NS = "http://www.w3.org/2000/svg";
  var VW = 660, VH = 420, CX = 330, CY = 210;
  var DEG = Math.PI / 180;
  var STATUS = "Showing the flat picture: 3D is not available here.";

  /* ------------------------------------------------------------- vectors -- */

  var V = {
    add: function (a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; },
    sub: function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; },
    scale: function (a, k) { return [a[0] * k, a[1] * k, a[2] * k]; },
    dot: function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
    cross: function (a, b) {
      return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    },
    len: function (a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); },
    norm: function (a) {
      var l = V.len(a);
      return l < 1e-12 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
    },
    lerp: function (a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  };
  /* the one light both painters shade by: tone × (0.62 + 0.38·|n·L|) */
  var LIGHT = V.norm([0.32, 0.55, 0.77]);
  function shadeOf(n) { return 0.62 + 0.38 * Math.abs(V.dot(n, LIGHT)); }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function num(v) { return Math.round(v * 10) / 10; }
  function fmt(v) {
    var f = window.BMPlot ? window.BMPlot.fmt(v) : String(Math.round(v * 100) / 100);
    return f.replace("-", "−");
  }

  /* -------------------------------------------------------------- camera -- */

  /* Orthographic, z up: parallel edges stay parallel and equal lengths look equal.
     screen x = 330 + S·(p − c)·right, y = 210 − S·(p − c)·up, depth = (p − c)·e
     (larger is nearer the viewer). */
  function Cam(view) {
    this.center = (view.center || [0, 0, 0]).slice();
    this.radius = view.radius || 5;
    this.S = VH / (2.2 * this.radius);
    this.set(view.az === undefined ? 30 : view.az, view.el === undefined ? 25 : view.el);
  }
  /* re-aim and re-scale: the scene's view.fit uses this to keep its picture filling the stage */
  Cam.prototype.frame = function (center, radius) {
    this.center = center.slice();
    this.radius = radius;
    this.S = VH / (2.2 * radius);
  };
  Cam.prototype.set = function (az, el) {
    az = ((az + 180) % 360 + 360) % 360 - 180;
    this.az = az;
    this.el = clamp(el, -10, 90);
    var a = this.az * DEG, e = this.el * DEG;
    var ca = Math.cos(a), sa = Math.sin(a), ce = Math.cos(e), se = Math.sin(e);
    this.e = [ce * ca, ce * sa, se];
    this.right = [-sa, ca, 0];
    this.up = [-se * ca, -se * sa, ce];
  };
  Cam.prototype.project = function (p) {
    var d = V.sub(p, this.center);
    return [CX + this.S * V.dot(d, this.right), CY - this.S * V.dot(d, this.up), V.dot(d, this.e)];
  };
  Cam.prototype.unproject = function (x, y, depth) {
    var p = V.add(this.center, V.scale(this.right, (x - CX) / this.S));
    p = V.add(p, V.scale(this.up, (CY - y) / this.S));
    return V.add(p, V.scale(this.e, depth || 0));
  };
  /* screen displacement per world unit along direction a */
  Cam.prototype.rail = function (a) {
    return [this.S * V.dot(a, this.right), -this.S * V.dot(a, this.up)];
  };
  /* how far along a a screen drag (dx, dy) goes: Δt = (Δx·ax + Δy·ay)/(ax² + ay²) */
  Cam.prototype.along = function (a, dx, dy) {
    var r = this.rail(a), q = r[0] * r[0] + r[1] * r[1];
    return q < 36 ? 0 : (dx * r[0] + dy * r[1]) / q;
  };

  /* ------------------------------------------------------------- palette -- */

  var TONES = {
    curve: "--plot-curve", curve2: "--plot-curve-2", curve3: "--plot-curve-3", curve4: "--plot-curve-4",
    ok: "--ok", bad: "--bad", axis: "--plot-axis", grid: "--plot-grid", fill: "--plot-fill",
    point: "--plot-point", ink: "--plot-ink", muted: "--muted", accent: "--accent", part: "--part",
    surface: "--plot-bg", faceA: "--plot-face-a", faceB: "--plot-face-b", faceC: "--plot-face-c",
    ground: "--plot-ground", hot: "--plot-hot"
  };
  function parseColor(str) {
    str = String(str || "").trim();
    var m = /^#([0-9a-f]{6})$/i.exec(str);
    if (m) {
      var n = parseInt(m[1], 16);
      return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], a: 1 };
    }
    m = /^#([0-9a-f]{3})$/i.exec(str);
    if (m) {
      var t = m[1];
      return { rgb: [parseInt(t[0] + t[0], 16), parseInt(t[1] + t[1], 16), parseInt(t[2] + t[2], 16)], a: 1 };
    }
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(str);
    if (m) {
      var a = m[4] === undefined ? 1 : m[4].indexOf("%") > 0 ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      return { rgb: [+m[1], +m[2], +m[3]], a: a };
    }
    return null;
  }
  /* Tones resolved against the host (so --part follows <body data-part>). A token that
     cannot be read falls back to its var() for strokes and goes unshaded. */
  function palette(host) {
    var cs = null;
    try { cs = window.getComputedStyle ? window.getComputedStyle(host || document.documentElement) : null; } catch (e) { cs = null; }
    var out = {};
    Object.keys(TONES).forEach(function (k) {
      var c = cs && cs.getPropertyValue ? parseColor(cs.getPropertyValue(TONES[k])) : null;
      out[k] = { css: "var(" + TONES[k] + ")", rgb: c ? c.rgb : null, a: c ? c.a : 1 };
    });
    return out;
  }

  /* --------------------------------------------------------- display list -- */

  function List(bounds) {
    this.items = [];
    this.bounds = bounds;
  }
  function o(opts) { return opts || {}; }
  function dashOf(d) { return d === true ? [6, 5] : d && d.length ? d : null; }
  List.prototype.seg = function (a, b, opts) {
    opts = o(opts);
    this.items.push({ k: "seg", a: a, b: b, tone: opts.tone || "ink", w: opts.w || 2,
      dash: dashOf(opts.dash), alpha: opts.alpha === undefined ? 1 : opts.alpha, back: opts.back || null });
  };
  List.prototype.path = function (pts, opts) {
    for (var i = 0; i + 1 < pts.length; i++) this.seg(pts[i], pts[i + 1], opts);
    if (opts && opts.closed && pts.length > 2) this.seg(pts[pts.length - 1], pts[0], opts);
  };
  List.prototype.arrow = function (a, b, opts) {
    opts = o(opts);
    this.items.push({ k: "arrow", a: a, b: b, tone: opts.tone || "ink", w: opts.w || 2.5,
      head: opts.head || 12, alpha: opts.alpha === undefined ? 1 : opts.alpha });
  };
  /* Newell normal: robust for any planar polygon; zero for a degenerate one */
  function normalOf(pts) {
    var n = [0, 0, 0];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]);
      n[1] += (a[2] - b[2]) * (a[0] + b[0]);
      n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return n;
  }
  List.prototype.face = function (pts, opts) {
    opts = o(opts);
    var n = normalOf(pts);
    if (V.len(n) < 1e-9) return;
    this.items.push({ k: "face", pts: pts, n: V.norm(n), tone: opts.tone || "fill",
      alpha: opts.alpha === undefined ? 1 : opts.alpha, stroke: opts.stroke || null, sw: opts.w || 1 });
  };
  /* a convex solid from vertices and faces (vertex index lists); edges whose two faces
     both look away from the viewer are drawn dashed */
  List.prototype.solid = function (verts, faces, opts) {
    opts = o(opts);
    var self = this, mid = [0, 0, 0], edges = {};
    verts.forEach(function (v) { mid = V.add(mid, V.scale(v, 1 / verts.length)); });
    faces.forEach(function (f) {
      var pts = f.map(function (i) { return verts[i]; });
      var n = V.norm(normalOf(pts)), c = [0, 0, 0];
      pts.forEach(function (p) { c = V.add(c, V.scale(p, 1 / pts.length)); });
      if (V.dot(n, V.sub(c, mid)) < 0) n = V.scale(n, -1);
      if (opts.alpha !== 0) self.face(pts, { tone: opts.tone, alpha: opts.alpha, stroke: opts.stroke, w: opts.sw });
      f.forEach(function (i, j) {
        var k = f[(j + 1) % f.length], key = Math.min(i, k) + "-" + Math.max(i, k);
        (edges[key] = edges[key] || { a: verts[i], b: verts[k], n: [] }).n.push(n);
      });
    });
    if (opts.edges === false) return;
    Object.keys(edges).forEach(function (key) {
      var ed = edges[key];
      self.seg(ed.a, ed.b, { tone: opts.edges || "axis", w: opts.w || 1.25, back: ed.n });
    });
  };
  var PARA_FACES = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  List.prototype.para = function (org, u, v, w, opts) {
    opts = o(opts);
    var verts = [];
    for (var i = 0; i < 8; i++) {
      var p = org;
      if (i & 1) p = V.add(p, u);
      if (i & 2) p = V.add(p, v);
      if (i & 4) p = V.add(p, w);
      verts.push(p);
    }
    var vol = V.dot(u, V.cross(v, w));
    if (Math.abs(vol) < 1e-9) {
      /* no volume: an outline of the flattened solid, no faces */
      var self = this, seen = {};
      PARA_FACES.forEach(function (f) {
        f.forEach(function (a, j) {
          var b = f[(j + 1) % 4], key = Math.min(a, b) + "-" + Math.max(a, b);
          if (seen[key] || V.len(V.sub(verts[a], verts[b])) < 1e-9) return;
          seen[key] = 1;
          self.seg(verts[a], verts[b], { tone: opts.flat || opts.edges || "axis", w: opts.w || 1.5 });
        });
      });
      return;
    }
    this.solid(verts, PARA_FACES, opts);
  };
  List.prototype.box = function (min, max, opts) {
    this.para(min, [max[0] - min[0], 0, 0], [0, max[1] - min[1], 0], [0, 0, max[2] - min[2]], opts);
  };
  var DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  List.prototype.cubes = function (cells, opts) {
    opts = o(opts);
    var self = this, have = {};
    var list = cells.map(function (c) {
      return c.length ? { at: [c[0], c[1], c[2]], tone: c[3] } : c;
    });
    list.forEach(function (c) { have[c.at.join(",")] = 1; });
    list.forEach(function (c) {
      var x = c.at[0], y = c.at[1], z = c.at[2];
      DIRS.forEach(function (d) {
        if (have[(x + d[0]) + "," + (y + d[1]) + "," + (z + d[2])]) return;
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
        self.face(pts, { tone: c.tone || opts.tone || "faceA", alpha: opts.alpha === undefined ? 1 : opts.alpha,
          stroke: opts.stroke === undefined ? "surface" : opts.stroke, w: opts.w || 1 });
      });
    });
  };
  function boxCorners(b) {
    var out = [];
    for (var i = 0; i < 8; i++) out.push([b[i & 1 ? 1 : 0][0], b[i & 2 ? 1 : 0][1], b[i & 4 ? 1 : 0][2]]);
    return out;
  }
  var BOX_EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  List.prototype.plane = function (n, d, opts) {
    var c = boxCorners(this.bounds), pts = [];
    BOX_EDGES.forEach(function (e) {
      var a = c[e[0]], b = c[e[1]];
      var fa = V.dot(n, a) - d, fb = V.dot(n, b) - d;
      if (Math.abs(fa) < 1e-12) pts.push(a);
      if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) pts.push(V.lerp(a, b, fa / (fa - fb)));
    });
    if (pts.length < 3) return;
    var mid = [0, 0, 0];
    pts.forEach(function (p) { mid = V.add(mid, V.scale(p, 1 / pts.length)); });
    var nn = V.norm(n), u = V.norm(V.sub(pts[0], mid)), w = V.cross(nn, u);
    var uniq = [];
    pts.forEach(function (p) {
      if (!uniq.some(function (q) { return V.len(V.sub(p, q)) < 1e-9; })) uniq.push(p);
    });
    uniq.sort(function (p, q) {
      var dp = V.sub(p, mid), dq = V.sub(q, mid);
      return Math.atan2(V.dot(dp, w), V.dot(dp, u)) - Math.atan2(V.dot(dq, w), V.dot(dq, u));
    });
    this.face(uniq, opts);
  };
  List.prototype.line3 = function (p, dir, opts) {
    var b = this.bounds, t0 = -1e9, t1 = 1e9;
    for (var i = 0; i < 3; i++) {
      if (Math.abs(dir[i]) < 1e-12) {
        if (p[i] < b[0][i] || p[i] > b[1][i]) return;
      } else {
        var ta = (b[0][i] - p[i]) / dir[i], tb = (b[1][i] - p[i]) / dir[i];
        t0 = Math.max(t0, Math.min(ta, tb));
        t1 = Math.min(t1, Math.max(ta, tb));
      }
    }
    if (t1 <= t0) return;
    this.seg(V.add(p, V.scale(dir, t0)), V.add(p, V.scale(dir, t1)), opts);
  };
  List.prototype.sphere = function (c, r, opts) {
    opts = o(opts);
    this.items.push({ k: "ball", c: c, r: r, tone: opts.tone || "faceA", alpha: opts.alpha === undefined ? 1 : opts.alpha,
      edge: opts.edge === undefined ? "axis" : opts.edge, ew: opts.w || 1.5 });
  };
  List.prototype.dot = function (p, opts) {
    opts = o(opts);
    this.items.push({ k: "dot", p: p, r: opts.r || 5, tone: opts.tone || "point" });
  };
  List.prototype.label = function (p, text, opts) {
    opts = o(opts);
    this.items.push({ k: "text", p: p, text: String(text), tone: opts.tone || "ink", dx: opts.dx || 0,
      dy: opts.dy || 0, anchor: opts.anchor || "middle", size: opts.size || 1, weight: opts.weight || 600,
      minor: !!opts.minor });
  };
  List.prototype.grid = function (opts) {
    opts = o(opts);
    var z = opts.z || 0, step = opts.step || 1;
    var min = opts.min || [this.bounds[0][0], this.bounds[0][1]], max = opts.max || [this.bounds[1][0], this.bounds[1][1]];
    var t = { tone: opts.tone || "grid", w: opts.w || 1 }, v;
    /* the lines through 0 are left to the axes, as in the flat figures */
    for (v = Math.ceil(min[0] / step) * step; v <= max[0] + 1e-9; v += step) {
      if (Math.abs(v) > 1e-9 || z) this.seg([v, min[1], z], [v, max[1], z], t);
    }
    for (v = Math.ceil(min[1] / step) * step; v <= max[1] + 1e-9; v += step) {
      if (Math.abs(v) > 1e-9 || z) this.seg([min[0], v, z], [max[0], v, z], t);
    }
  };
  List.prototype.axes = function (opts) {
    opts = o(opts);
    var min = opts.min || [0, 0, 0], max = opts.max || this.bounds[1];
    var names = opts.labels === false ? null : opts.labels || ["x", "y", "z"];
    var tone = opts.tone || "axis", self = this;
    [0, 1, 2].forEach(function (i) {
      var a = [0, 0, 0], b = [0, 0, 0];
      a[i] = min[i]; b[i] = max[i];
      self.arrow(a, b, { tone: tone, w: 1.5, head: 9 });
      if (names) self.label(b, names[i], { tone: "muted", dy: i === 2 ? -10 : 18, weight: 650 });
      if (opts.ticks) {
        for (var t = opts.ticks; t < max[i] - 0.3; t += opts.ticks) {
          var p = [0, 0, 0];
          p[i] = t;
          self.label(p, fmt(t), { tone: "muted", size: 0.85, weight: 500, dx: i === 2 ? -12 : 0, dy: i === 2 ? 4 : 15, minor: true });
        }
      }
    });
  };
  List.prototype.right = function (corner, u, v, opts) {
    opts = o(opts);
    var s = opts.size || 0.4;
    u = V.scale(V.norm(u), s); v = V.scale(V.norm(v), s);
    if (V.len(u) < 1e-9 || V.len(v) < 1e-9) return;
    this.path([V.add(corner, u), V.add(V.add(corner, u), v), V.add(corner, v)], { tone: opts.tone || "axis", w: opts.w || 1.5 });
  };

  /* -------------------------------------------- display list → screen prims -- */

  /* Screen primitives shared by both painters: points are [x, y, depth] in viewBox
     units (depth in world units, larger is nearer). Colours arrive resolved:
     rgb (0..255, already shaded) when the token could be read, else css. */
  var nonFinite = 0;
  function finite(arr) {
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i];
      if (!isFinite(p[0]) || !isFinite(p[1]) || !isFinite(p[2])) { nonFinite++; return false; }
    }
    return true;
  }
  function compile(items, cam, pal, k) {
    /* lines sit a little in front of the faces they edge, thicker ones further, so an arrow
       along an axis is drawn over it rather than fighting it (zb: the GL painter's offset) */
    var prims = [], over = [], unit = cam.radius * 0.004;
    function tone(name) { return pal[name] || pal.ink; }
    function width(w) { return w >= 2 ? Math.max(w, 2 / k) : Math.max(w, 1 / k); }
    /* Lines are cut into pieces of at most 36px that sort by their nearer end: an edge then
       draws after the faces it borders, and a long axis still passes behind what is in front
       of it. off carries the dash pattern across the cuts. */
    function line(a, b, t, w, dash, alpha) {
      if (!finite([a, b])) return;
      var zb = unit * (1 + w), dx = b[0] - a[0], dy = b[1] - a[1];
      var len = Math.sqrt(dx * dx + dy * dy), n = alpha < 1 ? 1 : Math.max(1, Math.ceil(len / 36));
      for (var i = 0; i < n; i++) {
        var p = [a[0] + dx * i / n, a[1] + dy * i / n, a[2] + (b[2] - a[2]) * i / n];
        var q = [a[0] + dx * (i + 1) / n, a[1] + dy * (i + 1) / n, a[2] + (b[2] - a[2]) * (i + 1) / n];
        prims.push({ t: "line", a: p, b: q, rgb: t.rgb, css: t.css, a2: alpha * t.a, w: width(w), dash: dash,
          off: dash ? (len * i / n) % (dash[0] + dash[1]) : 0, z: Math.max(p[2], q[2]) + zb, zb: zb });
      }
    }
    items.forEach(function (it) {
      var t, pa, pb;
      if (it.k === "seg") {
        pa = cam.project(it.a); pb = cam.project(it.b);
        /* an edge of a solid is hidden when neither of its faces looks toward the viewer */
        if (it.back && it.back.length === 2 && !(V.dot(it.back[0], cam.e) > 1e-6 || V.dot(it.back[1], cam.e) > 1e-6)) {
          line(pa, pb, tone("axis"), 1.25, [5, 4], it.alpha);
        } else {
          line(pa, pb, tone(it.tone), it.w, it.dash, it.alpha);
        }
      } else if (it.k === "arrow") {
        t = tone(it.tone);
        pa = cam.project(it.a); pb = cam.project(it.b);
        if (!finite([pa, pb])) return;
        var dx = pb[0] - pa[0], dy = pb[1] - pa[1], L = Math.sqrt(dx * dx + dy * dy);
        if (L < 2) return;
        var h = Math.min(it.head, L * 0.6), ux = dx / L, uy = dy / L;
        var f = 1 - h / L, bz = pa[2] + (pb[2] - pa[2]) * f;
        var bx = pa[0] + dx * f, by = pa[1] + dy * f, hw = h * 0.42;
        line(pa, [bx + ux, by + uy, bz], t, it.w, null, it.alpha);
        prims.push({ t: "tri", p: [pb, [bx - uy * hw, by + ux * hw, bz], [bx + uy * hw, by - ux * hw, bz]],
          rgb: t.rgb, css: t.css, a2: it.alpha * t.a, z: pb[2] + unit * (1 + it.w), zb: unit * (1 + it.w) });
      } else if (it.k === "face") {
        t = tone(it.tone);
        var pts = it.pts.map(function (p) { return cam.project(p); });
        if (!finite(pts)) return;
        var f2 = shadeOf(it.n), z = 0;
        pts.forEach(function (p) { z += p[2] / pts.length; });
        var st = it.stroke ? tone(it.stroke) : null;
        prims.push({ t: "poly", p: pts, z: z, css: t.css, a2: it.alpha * t.a,
          rgb: t.rgb ? t.rgb.map(function (c) { return Math.round(c * f2); }) : null,
          stroke: st ? { rgb: st.rgb, css: st.css, w: width(it.sw) } : null });
      } else if (it.k === "ball") {
        t = tone(it.tone);
        pa = cam.project(it.c);
        if (!finite([pa])) return;
        prims.push({ t: "ball", c: pa, R: it.r * cam.S, rw: it.r, rgb: t.rgb, css: t.css, a2: it.alpha * t.a, z: pa[2] });
        if (it.edge) {
          /* the outline: the great circle square to the line of sight, at the centre's depth.
             A pale or see-through ball can sit close to the stage colour (dark theme), so its
             outline is what shows where the ball ends. */
          var et = tone(it.edge), R2 = it.r * cam.S, nb = Math.max(24, Math.min(96, Math.round(R2 / 2)));
          for (var bi = 0; bi < nb; bi++) {
            var b0 = (bi / nb) * Math.PI * 2, b1 = ((bi + 1) / nb) * Math.PI * 2;
            line([pa[0] + R2 * Math.cos(b0), pa[1] + R2 * Math.sin(b0), pa[2]],
              [pa[0] + R2 * Math.cos(b1), pa[1] + R2 * Math.sin(b1), pa[2]], et, it.ew, null, 1);
          }
        }
      } else if (it.k === "dot") {
        pa = cam.project(it.p);
        if (!finite([pa])) return;
        over.push({ t: "dot", x: pa[0], y: pa[1], r: it.r, css: tone(it.tone).css });
      } else if (it.k === "text") {
        if (it.minor && k < 0.55) return;
        pa = cam.project(it.p);
        if (!finite([pa])) return;
        over.push({ t: "text", x: pa[0] + it.dx, y: pa[1] + it.dy, text: it.text, css: tone(it.tone).css,
          anchor: it.anchor, size: it.size, weight: it.weight });
      }
    });
    return { prims: prims, over: over };
  }

  /* ---------------------------------------------------------- SVG painter -- */

  function el(tag, attrs, text) {
    var n = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (key) {
      if (attrs[key] !== null && attrs[key] !== undefined) n.setAttribute(key, attrs[key]);
    });
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function h(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (key) {
      if (key === "class") n.className = attrs[key];
      else n.setAttribute(key, attrs[key]);
    });
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function colour(rgb, css, f) {
    if (!rgb) return css;
    f = f === undefined ? 1 : f;
    return "rgb(" + Math.round(clamp(rgb[0] * f, 0, 255)) + "," + Math.round(clamp(rgb[1] * f, 0, 255)) + "," +
      Math.round(clamp(rgb[2] * f, 0, 255)) + ")";
  }
  function ptsAttr(p) { return p.map(function (q) { return num(q[0]) + "," + num(q[1]); }).join(" "); }

  /* Projects, depth-sorts (far first) and emits the primitives into one <g>. */
  function SvgPainter(svg) {
    this.svg = svg;
    this.g = el("g");
    svg.appendChild(this.g);
  }
  SvgPainter.prototype.paint = function (prims) {
    var g = this.g;
    g.textContent = "";
    prims.slice().sort(function (a, b) { return a.z - b.z; }).forEach(function (p) {
      var op = p.a2 < 1 ? ";fill-opacity:" + num(p.a2 * 100) / 100 : "";
      if (p.t === "poly") {
        var st = p.stroke ? ";stroke:" + colour(p.stroke.rgb, p.stroke.css) + ";stroke-width:" + num(p.stroke.w) + ";stroke-linejoin:round"
          : p.a2 >= 1 ? ";stroke:" + colour(p.rgb, p.css) + ";stroke-width:0.6;stroke-linejoin:round" : ";stroke:none";
        g.appendChild(el("polygon", { points: ptsAttr(p.p), style: "fill:" + colour(p.rgb, p.css) + op + st }));
      } else if (p.t === "tri") {
        g.appendChild(el("polygon", { points: ptsAttr(p.p), style: "fill:" + colour(p.rgb, p.css) + op + ";stroke:none" }));
      } else if (p.t === "line") {
        g.appendChild(el("line", {
          x1: num(p.a[0]), y1: num(p.a[1]), x2: num(p.b[0]), y2: num(p.b[1]),
          style: "stroke:" + colour(p.rgb, p.css) + ";stroke-width:" + num(p.w) + ";stroke-linecap:round;fill:none" +
            (p.dash ? ";stroke-dasharray:" + p.dash.join(" ") + (p.off ? ";stroke-dashoffset:" + num(p.off) : "") : "") + (p.a2 < 1 ? ";stroke-opacity:" + num(p.a2 * 100) / 100 : "")
        }));
      } else if (p.t === "ball") {
        g.appendChild(el("circle", { cx: num(p.c[0]), cy: num(p.c[1]), r: num(p.R),
          style: "fill:" + colour(p.rgb, p.css, 0.74) + op + ";stroke:" + colour(p.rgb, p.css, 0.62) + ";stroke-width:1" }));
        if (p.rgb) g.appendChild(el("circle", { cx: num(p.c[0] - 0.28 * p.R), cy: num(p.c[1] - 0.3 * p.R), r: num(0.58 * p.R),
          style: "fill:" + colour(p.rgb, p.css, 0.98) + ";fill-opacity:" + num(0.75 * p.a2 * 100) / 100 + ";stroke:none" }));
      }
    });
  };

  /* ---------------------------------------------------------- the GL side -- */

  var stages = [];
  var gl = { promise: null, mgr: null };

  function still() {
    if (window.BMFx && typeof window.BMFx.still === "function") return !!window.BMFx.still();
    var root = document.documentElement;
    return !!((window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) ||
      (root && root.hasAttribute && root.hasAttribute("data-calm")));
  }
  /* The GL painter (scenes3d-gl.js) is fetched by a dynamic import, which finds the
     file from this one's own URL whether this file runs inside the chapter bundle (the
     build turns the import into a chunk of its own) or as the script it used to be. It
     used to be a <script> tag built from document.currentScript, which a module does
     not have. Same contract: a promise of true (BM3D.initGL is there) or false, never
     a rejection, and false after eight seconds. */
  function fetchPainter() {
    return new Promise(function (resolve) {
      var done = false;
      function finish(ok) { if (done) return; done = true; clearTimeout(timer); resolve(ok); }
      var timer = setTimeout(function () { finish(false); }, 8000);
      var loading;
      try { loading = import("./scenes3d-gl.js"); } catch (e) { finish(false); return; }
      loading.then(function () { finish(true); }, function () { finish(false); });
    });
  }
  var hooks = {
    lost: function () {
      stages.forEach(function (st) { if (st.painter === "gl") st.toSvg("lost"); });
    },
    restored: function () {
      stages.forEach(function (st) { if (st.wasGL && !st.pinned) st.toGL(); });
    }
  };
  function getGL() {
    if (gl.promise) return gl.promise;
    if (!window.Promise || !BM3D.load) {
      gl.promise = { then: function (fn) { return fn(null); } };
      return gl.promise;
    }
    gl.promise = BM3D.load().then(function (ok) {
      if (!ok) return null;
      return (BM3D.initGL ? Promise.resolve(true) : fetchPainter()).then(function (loaded) {
        if (!loaded || typeof BM3D.initGL !== "function") return null;
        try { gl.mgr = BM3D.initGL(window.THREE, hooks) || null; } catch (e) { gl.mgr = null; }
        BM3D.gl = gl.mgr;
        return gl.mgr;
      });
    }).then(null, function () { return null; });
    return gl.promise;
  }

  /* one observer for the theme and the Part colour: re-resolve and repaint every stage */
  var themeWatch = false;
  function watchTheme() {
    if (themeWatch || !window.MutationObserver) return;
    themeWatch = true;
    var mo = new MutationObserver(function () {
      stages.forEach(function (st) { st.pal = palette(st.host); st.paint(); });
    });
    var opts = { attributes: true, attributeFilter: ["data-theme", "data-part"] };
    mo.observe(document.documentElement, opts);
    if (document.body) mo.observe(document.body, opts);
    window.addEventListener("beforeprint", function () {
      stages.forEach(function (st) { if (st.svgDirty) st.paintSvg(); });
    });
  }

  /* ---------------------------------------------------------------- stage -- */

  function closestEx(node) {
    for (var n = node; n && n.nodeType === 1; n = n.parentNode) {
      if (n.classList && n.classList.contains("ex")) return n;
    }
    return null;
  }

  var uid = 0;
  function mount(host, name, spec) {
    if (!window.BMPlot) throw new Error("scenes3d.js needs widgets.js first");
    var P = window.BMPlot;
    uid++;
    var ex = closestEx(host);
    var noMissions = host.hasAttribute("data-no-missions");
    var quiz = noMissions && !(ex && ex.getAttribute("data-state") === "correct");
    function opt(nm) {
      var v = host.getAttribute("data-" + nm);
      if ((v === null || v === "") && ex) v = ex.getAttribute("data-" + nm);
      return v === null ? "" : v;
    }
    var s = clone(spec.state || {});
    var start = opt("start");
    if (start) {
      try {
        var patch = JSON.parse(start);
        Object.keys(patch).forEach(function (key) { s[key] = clone(patch[key]); });
      } catch (e) { if (window.console) console.error("[BM] bad data-start on " + name, e); }
    }
    var ask = opt("ask");
    var view = spec.view || {};
    var cam = new Cam(view);
    var home = { az: cam.az, el: cam.el };
    var bounds = view.bounds || [V.sub(cam.center, [cam.radius, cam.radius, cam.radius]), V.add(cam.center, [cam.radius, cam.radius, cam.radius])];

    host.classList.add("scene3d");
    host.setAttribute("data-painter", "svg");
    host.setAttribute("data-state", "ready");
    var stageEl = h("div", { class: "s3d-stage", tabindex: "0", role: "application" });
    var pic = el("svg", { class: "s3d-pic", viewBox: "0 0 " + VW + " " + VH, "aria-hidden": "true", focusable: "false" });
    var canvas = h("canvas", { class: "s3d-canvas", "aria-hidden": "true" });
    var over = el("svg", { class: "s3d-over", viewBox: "0 0 " + VW + " " + VH, "aria-hidden": "true", focusable: "false" });
    var tools = h("div", { class: "s3d-tools" });
    var resetBtn = h("button", { type: "button", class: "icon-btn s3d-reset", "aria-label": "Reset view", title: "Reset view" }, "↺");
    var status = h("p", { class: "s3d-status" });
    status.hidden = true;
    tools.appendChild(resetBtn);
    stageEl.appendChild(pic); stageEl.appendChild(canvas); stageEl.appendChild(over);
    stageEl.appendChild(tools); stageEl.appendChild(status);
    host.appendChild(stageEl);
    var overG = el("g");
    over.appendChild(overG);

    var st = {
      host: host, el: stageEl, canvas: canvas, cam: cam, painter: "svg", pinned: false, wasGL: false,
      svgDirty: false, k: 1, cssW: 0, cssH: 0, backW: 0, backH: 0,
      frame: { left: 0, right: VW, top: 0, bottom: VH }, prims: [], light: LIGHT,
      pal: palette(host), items: [], svg: new SvgPainter(pic)
    };
    var syncs = [], handles = [], viewsBuilt = false, sel = 0, dragging = null;
    var ctrls = h("div", { class: "controls" });

    /* ------------------------------------------------------------ the api -- */
    function bind(key) {
      if (typeof key === "string") return { get: function () { return s[key]; }, set: function (v) { s[key] = v; } };
      return { get: function () { return key.get(s); }, set: function (v) { key.set(s, v); } };
    }
    var api = {
      state: s, controls: ctrls, h: h, el: el, cam: cam,
      quiz: function () { return quiz; },
      ask: function () { return ask; },
      opt: opt,
      update: update,
      slider: function (label, min, max, step, key, fmtOut) {
        var b = bind(key);
        var sl = P.slider(label, min, max, step, b.get(), function (v) { b.set(v); update(); }, fmtOut);
        syncs.push(function () {
          var v = b.get();
          if (parseFloat(sl.input.value) !== v) sl.input.value = v;
          sl.output.textContent = fmtOut ? fmtOut(v) : String(v);
        });
        ctrls.appendChild(sl.wrap);
        return sl;
      },
      chips: function (items, key, groupLabel) {
        var b = bind(key), cur = b.get(), first = -1;
        items.forEach(function (it, i) { if (it.value === cur && first < 0) first = i; });
        var wrap = P.chips(items.map(function (it) { return { html: it.html || it.label, value: it.value }; }), first,
          function (v) { b.set(v); update(); });
        if (groupLabel) wrap.setAttribute("aria-label", groupLabel);
        syncs.push(function () {
          var v = b.get();
          Array.prototype.forEach.call(wrap.children, function (btn, i) {
            btn.setAttribute("aria-pressed", items[i] && items[i].value === v ? "true" : "false");
          });
        });
        var box = wrap;
        if (groupLabel) {
          box = h("div", { class: "ctrl s3d-group" });
          box.appendChild(h("span", { class: "s3d-group-label" }, groupLabel));
          box.appendChild(wrap);
        }
        ctrls.appendChild(box);
        return wrap;
      },
      button: function (label, fn, bopts) {
        bopts = bopts || {};
        var btn = h("button", { type: "button", class: "chip s3d-btn" });
        btn.addEventListener("click", function () {
          if (btn.disabled) return;
          fn(s, api);
          update();
        });
        syncs.push(function () {
          btn.textContent = typeof label === "function" ? label(s) : label;
          if (bopts.disabled) btn.disabled = !!bopts.disabled(s);
        });
        ctrls.appendChild(btn);
        return btn;
      },
      matrix: function (key, min, max, mopts) {
        mopts = mopts || {};
        var wrap = h("div", { class: "ctrl s3d-matrix-ctrl" });
        var lab = h("span", { class: "s3d-group-label" }, mopts.label || "Rows");
        var grid = h("div", { class: "s3d-matrix", role: "group", "aria-label": mopts.label || "Rows of the matrix" });
        var inputs = [];
        function locked(i) {
          var l = typeof mopts.lock === "function" ? mopts.lock(s) : mopts.lock || [];
          return l.indexOf(i) >= 0;
        }
        for (var i = 0; i < 3; i++) {
          var key2 = h("span", { class: "s3d-row-key", "aria-hidden": "true" });
          if (mopts.tones && mopts.tones[i]) key2.setAttribute("style", "background:" + st.pal[mopts.tones[i]].css);
          grid.appendChild(key2);
          inputs.push([]);
          for (var j = 0; j < 3; j++) {
            (function (i, j) {
              var inp = h("input", { type: "number", min: min, max: max, step: 1, inputmode: "numeric",
                "aria-label": "Row " + (i + 1) + ", column " + (j + 1) });
              inp.value = s[key][i][j];
              inp.addEventListener("input", function () {
                if (locked(i)) return;
                var v = parseInt(inp.value, 10);
                if (isNaN(v)) return;
                s[key][i][j] = clamp(v, min, max);
                update();
              });
              inp.addEventListener("change", function () { inp.value = s[key][i][j]; });
              inputs[i].push(inp);
              grid.appendChild(inp);
            })(i, j);
          }
        }
        syncs.push(function () {
          inputs.forEach(function (row, i) {
            var lk = locked(i);
            row.forEach(function (inp, j) {
              if (lk) inp.setAttribute("readonly", ""); else inp.removeAttribute("readonly");
              if (document.activeElement !== inp && String(inp.value) !== String(s[key][i][j])) inp.value = s[key][i][j];
            });
          });
        });
        wrap.appendChild(lab);
        wrap.appendChild(grid);
        ctrls.appendChild(wrap);
        return { wrap: wrap, inputs: inputs };
      },
      views: function (presets) {
        viewsBuilt = true;
        var wrap = h("div", { class: "chips s3d-views", role: "group", "aria-label": "Views" });
        presets.forEach(function (pr) {
          var btn = h("button", { type: "button", class: "chip" }, pr[0]);
          btn.addEventListener("click", function () {
            var az = typeof pr[1] === "function" ? pr[1](s, cam) : pr[1];
            var elv = typeof pr[2] === "function" ? pr[2](s, cam) : pr[2];
            api.view(az, elv, true);
          });
          wrap.appendChild(btn);
        });
        ctrls.appendChild(wrap);
        return wrap;
      },
      handle: function (hopts) {
        var hd = {
          name: hopts.name || "Point " + (handles.length + 1), at: hopts.at, move: hopts.move,
          axes: hopts.axes || [hopts.axis || [1, 0, 0]], step: hopts.step || 1,
          tone: hopts.tone || "curve", enabled: hopts.enabled || function () { return true; },
          say: hopts.say, keys: hopts.keys
        };
        handles.push(hd);
        return hd;
      },
      animate: function (ms, step, done) {
        function finish() {
          if (done) done();
          update();
          if (host.__missions) host.__missions.check();
        }
        if (still()) { step(1); finish(); return; }
        P.animate(ms, function (u) { step(u); update(); }, finish);
      },
      view: function (az, elv, animated) {
        if (!animated || still()) { cam.set(az, elv); paint(); describe(); return; }
        var a0 = cam.az, e0 = cam.el;
        var da = ((az - a0) % 360 + 540) % 360 - 180;
        P.animate(600, function (u) { cam.set(a0 + da * u, e0 + (elv - e0) * u); paint(); }, function () { describe(); });
      }
    };

    /* --------------------------------------------------------- painting -- */
    function live() {
      return handles.filter(function (hd) { return hd.enabled(s); });
    }
    function paintSvg() {
      st.svg.paint(st.prims);
      st.svgDirty = false;
    }
    function paint() {
      var c = compile(st.items, cam, st.pal, st.k);
      st.prims = c.prims;
      if (st.painter === "svg") paintSvg();
      else { st.svgDirty = true; st.invalidate(); }
      paintOver(c.over);
    }
    function paintOver(list) {
      overG.textContent = "";
      list.forEach(function (p) {
        if (p.t === "dot") {
          overG.appendChild(el("circle", { cx: num(p.x), cy: num(p.y), r: p.r, style: "fill:" + p.css + ";stroke:var(--plot-bg);stroke-width:2" }));
        } else if (p.t === "text") {
          overG.appendChild(el("text", {
            x: num(p.x), y: num(p.y), "text-anchor": p.anchor, class: "s3d-label",
            style: "fill:" + p.css + ";font-weight:" + p.weight + (p.size !== 1 ? ";font-size:calc(var(--s3d-fs, 13px) * " + p.size + ")" : "")
          }, p.text));
        }
      });
      var hs = live();
      var active = dragging && dragging.hd ? dragging.hd : hs[sel] || (hs.length === 1 ? hs[0] : null);
      /* one handle shows its guide lines all the time; with several, only the one being
         dragged or selected from the keyboard does */
      var railCls = hs.length > 1 && !(dragging && dragging.hd) ? "s3d-rail s3d-rail-key" : "s3d-rail";
      hs.forEach(function (hd) {
        var p = hd.at(s), q = cam.project(p);
        if (!finite([q])) return;
        if (hd === active) {
          hd.axes.forEach(function (a) {
            var r = cam.rail(a), L = Math.sqrt(r[0] * r[0] + r[1] * r[1]);
            if (L < 6) return;
            var ext = Math.min(1, 46 / L), ux = r[0] / L, uy = r[1] / L;
            var x1 = q[0] - r[0] * ext, y1 = q[1] - r[1] * ext, x2 = q[0] + r[0] * ext, y2 = q[1] + r[1] * ext;
            overG.appendChild(el("line", { x1: num(x1), y1: num(y1), x2: num(x2), y2: num(y2), class: railCls,
              style: "stroke:var(--muted);stroke-width:1.5;stroke-dasharray:3 3" }));
            [[x2, y2, 1], [x1, y1, -1]].forEach(function (t) {
              var dx = ux * t[2], dy = uy * t[2];
              overG.appendChild(el("polygon", { class: railCls,
                points: num(t[0] + dx * 7) + "," + num(t[1] + dy * 7) + " " + num(t[0] - dy * 4) + "," + num(t[1] + dx * 4) + " " +
                  num(t[0] + dy * 4) + "," + num(t[1] - dx * 4),
                style: "fill:var(--muted)" }));
            });
          });
        }
        if (hd === hs[sel]) {
          overG.appendChild(el("circle", { cx: num(q[0]), cy: num(q[1]), r: 14, class: "s3d-selring",
            style: "fill:none;stroke:var(--focus);stroke-width:2.5" }));
        }
        overG.appendChild(el("circle", { cx: num(q[0]), cy: num(q[1]), r: 9, class: "s3d-h", "data-handle": hd.name,
          style: "fill:" + (st.pal[hd.tone] || st.pal.curve).css + ";stroke:var(--plot-bg);stroke-width:2.5" }));
      });
    }
    /* view.fit(s) → {center, radius}: follow the picture as it grows and shrinks; held
       still while a handle is dragged (the rail maths needs a fixed scale), eased after */
    var fitting = false;
    function fit(animated) {
      if (!view.fit || fitting) return;
      var f = view.fit(s);
      if (!f) return;
      if (!animated || still()) { cam.frame(f.center, f.radius); return; }
      var c0 = cam.center.slice(), r0 = cam.radius;
      fitting = true;
      P.animate(260, function (u) {
        cam.frame(V.lerp(c0, f.center, u), r0 + (f.radius - r0) * u);
        paint();
      }, function () { fitting = false; });
    }
    function update() {
      latch = null;
      syncs.forEach(function (f) { f(); });
      if (!(dragging && dragging.hd)) fit(false);
      var g = new List(bounds);
      spec.draw(g, s, api);
      st.items = g.items;
      paint();
      if (readout) readout.innerHTML = spec.say ? spec.say(s, quiz) : "";
      describe();
    }
    /* The arrow keys follow the screen under the current camera. Up moves a handle along
       whichever of its rails, and whichever way along it, runs most nearly up the stage;
       Right, most nearly to the right. A gizmo gives the arrows the pair of rails that best
       matches them (on a tie, ←→ the first, ↑↓ the last) and Page Up/Down the third. A rail
       nearly square to its key takes the other key's sense, and one seen end-on keeps +axis.
       A key press is still exactly one step along one rail, so the scene's snapping holds.
       Once a key has moved a handle, the map is held until the view turns, the selection
       changes or something else moves the figure: a rail that turns with its handle
       (spheretri's B) would otherwise flip a held key's sense where it passes the edge of
       the picture, and B would bounce between two places. Held, a key keeps going the same
       way round, and its opposite key undoes it. */
    var AXIS_NAMES = ["x", "y", "z"], latch = null;
    function keysFor(hd) {
      if (latch && latch.hd === hd && latch.az === cam.az && latch.el === cam.el) return latch.km;
      return keyMap(hd);
    }
    function keyMap(hd) {
      var axes = hd.axes, n = axes.length, h = 0, v = n - 1, best = -1, i, j;
      var dirs = axes.map(function (a) {
        var r = cam.rail(V.norm(a));
        return [r[0] / cam.S, r[1] / cam.S];
      });
      for (i = 0; i < n; i++) {
        for (j = 0; j < n; j++) {
          if (i === j && n > 1) continue;
          var score = Math.abs(dirs[i][0]) + Math.abs(dirs[j][1]) + (i === 0 && j === n - 1 ? 0.05 : 0);
          if (score > best) { best = score; h = i; v = j; }
        }
      }
      function entry(k, screen) {
        var d = dirs[k], L = Math.sqrt(d[0] * d[0] + d[1] * d[1]), sg = 1;
        if (L >= 0.1) {
          if (Math.abs(d[screen]) < 0.26 * L) screen = 1 - screen;
          sg = (screen === 0 ? d[0] : -d[1]) >= 0 ? 1 : -1;
        }
        var a = axes[k], nz = [0, 1, 2].filter(function (c) { return Math.abs(a[c]) > 1e-9; });
        return { k: k, sg: sg, name: nz.length === 1 ? AXIS_NAMES[nz[0]] : "guide line " + (k + 1) };
      }
      return { h: entry(h, 0), v: entry(v, 1), m: n === 3 ? entry(3 - h - v, 1) : null };
    }
    function describe() {
      var hs = live(), parts = [spec.label || "A three-dimensional figure"];
      if (sel < hs.length) {
        var hd = hs[sel];
        /* a scene may word its handle itself, so the label never says more than the readout */
        parts.push(hd.say ? hd.say(s, quiz) : hd.name + " at (" + hd.at(s).map(fmt).join(", ") + ")");
        var km = keysFor(hd);
        parts.push(hd.keys || (hd.axes.length > 1 ? "Left and right arrows move it along " + km.h.name + ", up and down along " +
          km.v.name + (km.m ? ", Page Up and Page Down along " + km.m.name : "") : "Arrow keys move it along its line"));
      } else {
        parts.push("Turning the view: azimuth " + Math.round(cam.az) + "°, elevation " + Math.round(cam.el) + "°");
        parts.push("Arrow keys turn it, Home resets it");
      }
      if (hs.length) parts.push("Space selects the next item");
      stageEl.setAttribute("aria-label", parts.join(". ") + ".");
    }
    st.paint = paint;
    st.paintSvg = paintSvg;
    st.invalidate = function () {
      if (st.painter !== "gl" || st.queued || !gl.mgr) return;
      st.queued = true;
      var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
      raf(function () {
        st.queued = false;
        if (st.painter !== "gl") return;
        try { gl.mgr.render(st); } catch (e) {
          if (window.console) console.error("[BM] 3D painter failed; staying flat", e);
          st.pinned = true;
          st.toSvg("fallback");
        }
      });
    };
    st.toSvg = function (why) {
      st.wasGL = st.painter === "gl" || st.wasGL;
      st.painter = "svg";
      host.setAttribute("data-painter", "svg");
      host.setAttribute("data-state", why || "fallback");
      if (why !== "lost") { status.innerHTML = "<span>" + STATUS + "</span>"; status.hidden = false; }
      if (gl.mgr && gl.mgr.drop) gl.mgr.drop(st);
      paintSvg();
    };
    st.toGL = function () {
      if (st.pinned || !gl.mgr || gl.mgr.lost) return;
      st.painter = "gl";
      st.wasGL = true;
      host.setAttribute("data-painter", "gl");
      host.setAttribute("data-state", "ready");
      status.hidden = true;
      st.svgDirty = true;
      st.invalidate();
    };

    /* ------------------------------------------------------- build it all -- */
    if (spec.controls) spec.controls(api, s);
    if (view.presets && !viewsBuilt) api.views(view.presets);
    var readout = P.readout(host);
    readout.id = "s3d-r-" + uid;
    stageEl.setAttribute("aria-describedby", readout.id);
    if (ctrls.children.length) host.appendChild(ctrls);
    P.note(host, noteText());
    host.__answer = function () { return spec.answer ? spec.answer(s, ask) : ""; };
    if (!noMissions && spec.missions) {
      P.missions(host, name, spec.missions.map(function (m) {
        return { text: m.text, test: function () { return m.test(s); } };
      }));
    }
    host.__scene = { state: s, api: api, spec: spec, stage: st, cam: cam, handles: handles };
    update();

    function noteText() {
      if (spec.note) return spec.note;
      var hs = handles.map(function (hd) { return hd.name; });
      var t = hs.length
        ? "Drag " + hs.join(" or ") + " along a guide line, or drag anywhere else to turn the view. " +
          "From the keyboard: Tab to the picture, move " + (hs.length > 1 ? "the selected point" : hs[0]) +
          " with the arrow keys, which move it the way they point" +
          (handles.some(function (hd) { return hd.axes.length === 3; }) ? " (Page Up and Page Down for the third direction)" : "") +
          "; Space " + (hs.length > 1 ? "switches points, then " : "") + "switches to turning the view; Home resets it."
        : "Drag the picture to turn it, or Tab to it and use the arrow keys; Home resets the view.";
      if (spec.sibling && document.querySelector && document.querySelector('[data-widget="' + spec.sibling + '"]')) {
        t += " It is the flat figure from earlier in the chapter, with one more dimension.";
      }
      return t;
    }

    /* ---------------------------------------------------------- input -- */
    function local(evt) {
      var r = stageEl.getBoundingClientRect();
      var k = Math.min(r.width / VW, r.height / VH) || 1;
      return { x: (evt.clientX - r.left - (r.width - VW * k) / 2) / k, y: (evt.clientY - r.top - (r.height - VH * k) / 2) / k };
    }
    function pick(l) {
      var best = null, bd = 30;
      live().forEach(function (hd) {
        var q = cam.project(hd.at(s));
        var d = Math.sqrt((q[0] - l.x) * (q[0] - l.x) + (q[1] - l.y) * (q[1] - l.y));
        if (d <= bd) { bd = d; best = hd; }
      });
      return best;
    }
    stageEl.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button > 0) return;
      if (e.target && e.target.closest && e.target.closest(".s3d-tools")) return;
      var l = local(e), hd = pick(l);
      if (hd) {
        var hs = live();
        sel = hs.indexOf(hd);
        dragging = { hd: hd, x: l.x, y: l.y, start: hd.at(s).slice(), axis: hd.axes.length === 1 ? hd.axes[0] : null };
        stageEl.setAttribute("data-drag", "handle");
        e.preventDefault();
      } else {
        dragging = { orbit: true, x: l.x, y: l.y, az: cam.az, el: cam.el, cx: e.clientX, cy: e.clientY,
          wait: e.pointerType === "touch" || e.pointerType === "pen" };
        stageEl.setAttribute("data-drag", "view");
        if (e.pointerType === "mouse") e.preventDefault();
      }
      if (stageEl.setPointerCapture && e.pointerId !== undefined) {
        try { stageEl.setPointerCapture(e.pointerId); } catch (err) { /* already released */ }
      }
      if (hd) paint();
    });
    stageEl.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var l = local(e), dx = l.x - dragging.x, dy = l.y - dragging.y;
      if (dragging.orbit) {
        if (dragging.wait) {
          /* a finger may be starting a page scroll (touch-action: pan-y): turn nothing until
             it has gone 10px, then only if it went clearly sideways; a vertical swipe is the
             page's, so let it go untouched */
          var mx = e.clientX - dragging.cx, my = e.clientY - dragging.cy;
          if (mx * mx + my * my < 100) return;
          if (Math.abs(mx) < 1.2 * Math.abs(my)) {
            dragging = null;
            stageEl.removeAttribute("data-drag");
            return;
          }
          dragging.wait = false;
          dragging.x = l.x; dragging.y = l.y;
          dx = 0; dy = 0;
        }
        cam.set(dragging.az - dx * 0.4, dragging.el + dy * 0.4);
        paint();
        return;
      }
      e.preventDefault();
      if (!dragging.axis) {
        if (dx * dx + dy * dy < 16) return;
        var best = null, bc = -1;
        dragging.hd.axes.forEach(function (a) {
          var r = cam.rail(a), L = Math.sqrt(r[0] * r[0] + r[1] * r[1]);
          if (L < 6) return;
          var c = Math.abs(dx * r[0] + dy * r[1]) / (L * Math.sqrt(dx * dx + dy * dy));
          if (c > bc) { bc = c; best = a; }
        });
        if (!best) return;
        dragging.axis = best;
      }
      var t = cam.along(dragging.axis, dx, dy);
      dragging.hd.move(s, V.add(dragging.start, V.scale(dragging.axis, t)));
      update();
    });
    function end() {
      if (!dragging) return;
      var was = dragging;
      dragging = null;
      stageEl.removeAttribute("data-drag");
      if (was.hd && view.fit) fit(true);
      paint();
      describe();
    }
    stageEl.addEventListener("pointerup", end);
    stageEl.addEventListener("pointercancel", function () {
      /* the browser took the swipe for a page scroll: undo any turn its first pixels made */
      if (dragging && dragging.orbit) cam.set(dragging.az, dragging.el);
      end();
    });
    /* vertical swipes scroll the page, except when they start on a handle */
    stageEl.addEventListener("touchstart", function (e) {
      var t = e.touches && e.touches[0];
      if (t && pick(local(t))) e.preventDefault();
    }, { passive: false });
    stageEl.addEventListener("keydown", function (e) {
      /* only keys pressed on the stage itself: the Reset view button inside it keeps its own
         Enter and Space, and browser shortcuts (Alt+Left, Ctrl+Home) pass through */
      if (e.target !== stageEl || e.altKey || e.ctrlKey || e.metaKey) return;
      var hs = live(), key = e.key;
      if (key === " " || key === "Spacebar" || key === "Enter") {
        sel = (sel + 1) % (hs.length + 1);
        e.preventDefault();
        paint();
        describe();
        return;
      }
      if (key === "Home") {
        e.preventDefault();
        api.view(home.az, home.el, false);
        return;
      }
      if (sel < hs.length) {
        var hd = hs[sel], km = keysFor(hd), en = null, sg = 0;
        if (key === "ArrowLeft" || key === "ArrowRight") { en = km.h; sg = key === "ArrowRight" ? 1 : -1; }
        else if (key === "ArrowUp" || key === "ArrowDown") { en = km.v; sg = key === "ArrowUp" ? 1 : -1; }
        else if (key === "PageUp" || key === "PageDown") { en = km.m; sg = key === "PageUp" ? 1 : -1; }
        if (!en) return;
        e.preventDefault();
        /* the rail as it is now (one that turns with the handle), in the sense the map chose */
        hd.move(s, V.add(hd.at(s), V.scale(hd.axes[en.k], en.sg * sg * hd.step)));
        update();
        latch = { hd: hd, az: cam.az, el: cam.el, km: km };
        return;
      }
      var stp = e.shiftKey ? 15 : 5;
      if (key === "ArrowLeft") cam.set(cam.az + stp, cam.el);
      else if (key === "ArrowRight") cam.set(cam.az - stp, cam.el);
      else if (key === "ArrowUp") cam.set(cam.az, cam.el + stp);
      else if (key === "ArrowDown") cam.set(cam.az, cam.el - stp);
      else return;
      e.preventDefault();
      paint();
      describe();
    });
    resetBtn.addEventListener("click", function () { api.view(home.az, home.el, true); });

    /* leave quiz mode the moment this exercise is solved */
    if (quiz && ex && window.BMStore && window.BMStore.on) {
      window.BMStore.on(function (c) {
        if (!quiz || c.type !== "solved" || c.key !== ex.getAttribute("data-key")) return;
        quiz = false;
        update();
        if (spec.reveal) spec.reveal(api);
      });
    }

    /* ------------------------------------------------------- observers -- */
    stages.push(st);
    watchTheme();
    if (window.ResizeObserver) {
      new ResizeObserver(function (entries) {
        var r = entries[0] && entries[0].contentRect;
        if (!r || !r.width || !r.height) return;
        var w = r.width, ht = r.height, k = Math.min(w / VW, ht / VH);
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        st.cssW = w; st.cssH = ht; st.k = k;
        st.backW = Math.round(w * dpr); st.backH = Math.round(ht * dpr);
        st.frame = { left: CX - w / k / 2, right: CX + w / k / 2, top: CY - ht / k / 2, bottom: CY + ht / k / 2 };
        if (canvas.width !== st.backW) canvas.width = st.backW;
        if (canvas.height !== st.backH) canvas.height = st.backH;
        stageEl.style.setProperty("--s3d-fs", num(Math.max(13, 11.5 / k)) + "px");
        paint();
      }).observe(stageEl);
    }
    if (window.IntersectionObserver && window.Promise) {
      var io = new IntersectionObserver(function (entries) {
        if (!entries.some(function (en) { return en.isIntersecting; })) return;
        io.disconnect();
        want3D(st);
      }, { rootMargin: "400px 0px" });
      io.observe(stageEl);
    }
  }

  function want3D(st) {
    if (st.pinned) return;
    if (BM3D.lowEnd && BM3D.lowEnd()) { st.pinned = true; st.toSvg("fallback"); return; }
    st.host.setAttribute("data-state", "loading");
    getGL().then(function (mgr) {
      if (!mgr) { st.pinned = true; st.toSvg("fallback"); return; }
      st.toGL();
      if (st.painter !== "gl" && !mgr.lost) st.toSvg("fallback");
    });
  }

  /* ------------------------------------------------------------- exports -- */

  BM3D.V = V;
  BM3D.Cam = Cam;
  BM3D.List = List;
  BM3D.SvgPainter = SvgPainter;
  BM3D.palette = palette;
  BM3D.compile = compile;
  BM3D.shade = shadeOf;
  BM3D.LIGHT = LIGHT;
  BM3D.stages = stages;
  BM3D.specs = BM3D.specs || {};
  BM3D.nonFinite = function () { return nonFinite; };
  BM3D.define = function (name, spec) {
    BM3D.specs[name] = spec;
    window.BMWidgets = window.BMWidgets || {};
    window.BMWidgets[name] = function (host) { return mount(host, name, spec); };
  };
})();
