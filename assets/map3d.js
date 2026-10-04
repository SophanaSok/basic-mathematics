/* ===========================================================================
   Basic Mathematics — the 3D course map (index.html only)
   An enhancement beside the chapter list, never a replacement for it. The list
   (ol.path inside [data-course-index]) stays the accessible, focusable structure;
   the canvas is aria-hidden and only mirrors it:
     list → map   focusing or hovering a chapter link flies the camera to its island
     map → list   a mouse click on an island opens the same link; a tap selects the
                  link first and opens it on a second tap
   Four real buttons fly to a Part. Everything is built from Three.js primitives
   (no textures, no model files), coloured from the CSS tokens at run time, and
   drawn on demand: frames run only for a camera flight and for one short bob of the
   "you are here" marker after the map appears or the camera settles, neither under
   reduced motion or calm mode; offscreen or in a hidden tab nothing is drawn.

   The container stays hidden, and the list looks exactly as it did, when the
   person chose the list map, 3D is unsupported or the device is low-end, Three.js
   cannot be fetched, the WebGL context is lost, or frames are too slow.
   =========================================================================== */
(function () {
  "use strict";

  var C = window.BM_CURRICULUM;
  var BM3D = window.BM3D;
  var box = document.querySelector("[data-map3d]");
  var host = document.querySelector("[data-course-index]");
  if (!C || !C.parts || !BM3D || !BM3D.load || !box || !host) return;

  /* region names until data/quest.js supplies them */
  var REGIONS = {
    algebra: "The Foundry", geometry: "The Fields", coordinates: "The Grid", topics: "The Observatory"
  };

  /* the snake: Part p is row p, set back and up; chapters alternate direction per row */
  var ROW_Z = 7, ROW_Y = 1.5, STEP_X = 3.2;
  var DECK = 0.36;          /* height of an island's walking surface above its anchor */
  var STONES = 70;
  var FLIGHT_MS = 700;
  var BOB_MS = 2400;        /* one rise and fall of the marker, then it rests */
  var FOV = 34;

  var M = null;             /* the live map, or null while the list stands alone */
  var failed = "";          /* why 3D gave up for this visit (lost context, too slow); sticky */
  var starting = false;

  /* -------------------------------------------------------------- helpers -- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function closest(el, sel) {
    while (el && el.nodeType === 1) {
      if (el.matches ? el.matches(sel) : el.msMatchesSelector && el.msMatchesSelector(sel)) return el;
      el = el.parentNode;
    }
    return null;
  }
  function now() { return window.performance && performance.now ? performance.now() : Date.now(); }

  function prefs() {
    try {
      if (window.BMGame && typeof window.BMGame.prefs === "function") return window.BMGame.prefs() || {};
    } catch (e) { /* fall through to the stored copy */ }
    var S = window.BMStore;
    var p = S && S.read ? S.read((S.keys && S.keys.prefs) || "bm.prefs.v1", {}) : null;
    if (!S) {
      try { p = JSON.parse(window.localStorage.getItem("bm.prefs.v1")); } catch (e2) { p = null; }
    }
    return p && typeof p === "object" ? p : {};
  }

  /* should 3D be tried at all right now? */
  function wanted() {
    if (failed) return false;
    var p = prefs();
    if (p.map === "list") return false;
    if (!BM3D.supported()) return false;
    /* a low-end device gets the list unless the person switched the map on themselves */
    if (p.map !== "3d" && BM3D.lowEnd && BM3D.lowEnd()) return false;
    return true;
  }

  var reduceQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function still() {
    if (window.BMFx && typeof window.BMFx.still === "function") {
      try { return !!window.BMFx.still(); } catch (e) { /* fall back below */ }
    }
    return !!(reduceQuery && reduceQuery.matches) || document.documentElement.hasAttribute("data-calm");
  }

  function regionName(part) {
    var Q = window.BM_QUEST;
    var r = Q && Q.regions && Q.regions[part.id];
    return (r && r.name) || REGIONS[part.id] || part.name;
  }
  function chapterName(ch) {
    if (window.BMSite && window.BMSite.chapterName) return window.BMSite.chapterName(ch);
    return ch.label === "Interlude" ? "Interlude" : "Chapter " + ch.label;
  }

  /* -------------------------------------------------------- course layout -- */

  /* one island per chapter, in reading order, with its place on the snake */
  var ISLES = [];
  var REVIEW = {};          /* part id → index of the island whose chapter carries #review */
  C.parts.forEach(function (part, p) {
    var n = part.chapters.length, dir = p % 2 === 0 ? 1 : -1;
    part.chapters.forEach(function (ch, j) {
      ISLES.push({
        id: ch.id, ch: ch, part: part, p: p, j: j, n: n,
        x: (j - (n - 1) / 2) * STEP_X * dir, y: ROW_Y * p, z: -ROW_Z * p
      });
      var hasReview = (ch.sections || []).some(function (s) { return s.id === "review"; });
      if (hasReview) REVIEW[part.id] = ISLES.length - 1;
    });
    if (REVIEW[part.id] === undefined && n) REVIEW[part.id] = ISLES.length - 1;
  });
  function isleIndex(id) {
    for (var i = 0; i < ISLES.length; i++) if (ISLES[i].id === id) return i;
    return -1;
  }

  /* -------------------------------------------------------- DOM lookups ---- */

  function linkFor(i) {
    var li = host.querySelector('li.stop[data-chapter="' + ISLES[i].id + '"]');
    return li ? li.querySelector(".stop-link") : null;
  }
  function currentId() {
    var li = host.querySelector('li.stop[data-state="current"]');
    return li ? li.getAttribute("data-chapter") : null;
  }
  function sideBySide() {
    var a = box.getBoundingClientRect(), b = host.getBoundingClientRect();
    return a.width > 0 && a.right <= b.left + 1;
  }

  /* --------------------------------------------------------------- colours -- */

  /* the tokens are read from probes inside the map, so the per-Part blocks and the
     dark palette in site.css apply exactly as they do to the list */
  function readPalette(T) {
    var probe = box.querySelector(".map3d-probe");
    function tok(el, name) {
      var v = window.getComputedStyle(el).getPropertyValue(name).trim();
      var c = new T.Color(0.5, 0.5, 0.5);
      if (/^#[0-9a-f]{3,8}$/i.test(v) || /^rgb/i.test(v)) {
        if (/^#[0-9a-f]{8}$/i.test(v)) v = v.slice(0, 7);
        c.setStyle(v);
      }
      return c;
    }
    var pal = {
      ink: tok(probe, "--plot-ink"), ground: tok(probe, "--plot-ground"), paper: tok(probe, "--surface"),
      under: tok(probe, "--surface-2"), stone: tok(probe, "--border-strong"), ok: tok(probe, "--ok"),
      hot: tok(probe, "--plot-hot"), accent: tok(probe, "--accent"), parts: {}
    };
    Array.prototype.forEach.call(probe.querySelectorAll("[data-part]"), function (el) {
      var part = tok(el, "--part");
      pal.parts[el.getAttribute("data-part")] = {
        part: part, soft: tok(el, "--part-soft"), deep: tok(el, "--part-deep"),
        /* "ahead" is only a colour: the cap fades toward the ground, nothing is locked */
        ahead: part.clone().lerp(pal.ground, 0.62)
      };
    });
    return pal;
  }

  /* --------------------------------------------------------------- build ---- */

  function build() {
    var T = window.THREE;
    T.ColorManagement.enabled = false;

    var renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    renderer.outputColorSpace = T.LinearSRGBColorSpace;
    renderer.setClearColor(new T.Color(0, 0, 0), 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    var parts = "";
    C.parts.forEach(function (part, p) {
      parts += '<button type="button" class="map3d-part" data-part="' + esc(part.id) + '" data-p="' + p + '">' +
        "<b>Part " + esc(part.num) + '</b><span class="map3d-sep"> · </span><span>' + esc(regionName(part)) + "</span></button>";
    });
    var probes = "";
    C.parts.forEach(function (part) { probes += '<i data-part="' + esc(part.id) + '"></i>'; });
    box.innerHTML =
      '<div class="map3d-parts" role="group" aria-label="Show a Part on the course map">' + parts + "</div>" +
      '<div class="map3d-stage" data-state="loading">' +
        '<p class="map3d-wait" aria-hidden="true">Loading the map…</p>' +
        '<div class="map3d-labels" aria-hidden="true"></div>' +
      "</div>" +
      '<div class="map3d-probe" aria-hidden="true">' + probes + "</div>";

    var stage = box.querySelector(".map3d-stage");
    var canvas = renderer.domElement;
    canvas.className = "map3d-canvas";
    canvas.setAttribute("aria-hidden", "true");
    stage.insertBefore(canvas, stage.firstChild);

    M = {
      T: T, renderer: renderer, canvas: canvas, stage: stage,
      labels: box.querySelector(".map3d-labels"),
      scene: new T.Scene(), camera: new T.PerspectiveCamera(FOV, 16 / 9, 0.5, 200),
      geo: {}, mat: {}, pick: [], arches: [], disposables: [],
      view: { t: new T.Vector3(), d: 18 }, viewKind: null, u: 0,
      flight: null, raf: 0, dirty: true, lastFrame: 0, samples: [], bob: null, bobbing: false,
      onscreen: true, hot: -1, hotHow: "", hover: -1, cur: -1, press: null, drag: false,
      observers: [], firstRender: false
    };

    makeMaterials();
    makeLights();
    makeIslands();
    makePath();
    makeArches();
    makeMarkers();
    applyPalette();
    refresh(true);

    canvas.addEventListener("webglcontextlost", onLost, false);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("auxclick", onAux);
    /* the canvas is not focusable: keep focus where a tap put it (on the list link), and no text selection while dragging */
    canvas.addEventListener("mousedown", function (e) { e.preventDefault(); });
    box.querySelector(".map3d-parts").addEventListener("click", onPartButton);

    /* reveal only now that 3D is certain, so fallback users never see a box come and go */
    box.hidden = false;
    host.setAttribute("data-map", "3d");
    size();
    firstView();

    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { if (M) { size(); reframe(); request(); } });
      ro.observe(stage);
      M.observers.push(ro);
    } else {
      window.addEventListener("resize", onWindowResize);
    }
    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(function (entries) {
        if (!M) return;
        M.onscreen = entries[entries.length - 1].isIntersecting;
        if (M.onscreen) wake();
      });
      io.observe(box);
      M.observers.push(io);
    }
    render();
    wake();
  }

  function track(x) { M.disposables.push(x); return x; }

  function makeMaterials() {
    var T = M.T, mat = M.mat;
    function lambert() { return track(new T.MeshLambertMaterial({ flatShading: true })); }
    mat.paper = lambert();
    mat.under = lambert();
    mat.stone = lambert();
    mat.ok = lambert();
    mat.hot = lambert();
    mat.accent = lambert();
    mat.pennant = track(new T.MeshLambertMaterial({ flatShading: true, side: T.DoubleSide }));
    mat.inkFill = track(new T.MeshBasicMaterial());
    mat.ink = track(new T.LineBasicMaterial({ transparent: true, opacity: 0.72 }));
    mat.track = track(new T.LineBasicMaterial({ transparent: true, opacity: 0.9 }));
    mat.cap = {}; mat.capAhead = {}; mat.deep = {};
    C.parts.forEach(function (part) {
      mat.cap[part.id] = lambert();
      mat.capAhead[part.id] = lambert();
      mat.deep[part.id] = lambert();
    });
  }

  function applyPalette() {
    var pal = readPalette(M.T), mat = M.mat;
    mat.paper.color.copy(pal.paper);
    mat.under.color.copy(pal.under);
    mat.stone.color.copy(pal.stone);
    mat.ok.color.copy(pal.ok);
    mat.pennant.color.copy(pal.ok);
    mat.hot.color.copy(pal.hot);
    mat.accent.color.copy(pal.accent);
    mat.inkFill.color.copy(pal.ink);
    mat.ink.color.copy(pal.ink);
    mat.track.color.copy(pal.stone);
    C.parts.forEach(function (part) {
      var c = pal.parts[part.id];
      if (!c) return;
      mat.cap[part.id].color.copy(c.part);
      mat.capAhead[part.id].color.copy(c.ahead);
      mat.deep[part.id].color.copy(c.deep);
    });
  }

  /* one soft sky and one sun, tuned so a flat top face shows its token colour */
  function makeLights() {
    var T = M.T;
    var sky = new T.HemisphereLight(new T.Color(1, 1, 1), new T.Color(0.72, 0.72, 0.76), 2.05);
    var sun = new T.DirectionalLight(new T.Color(1, 1, 1), 1.25);
    sun.position.set(-4, 10, 6);
    M.scene.add(sky, sun);
  }

  function withEdges(geo, material, parent, pos, rot) {
    var T = M.T;
    var mesh = new T.Mesh(geo, material);
    var key = geo.uuid;
    if (!M.geo["edges-" + key]) M.geo["edges-" + key] = track(new T.EdgesGeometry(geo, 25));
    mesh.add(new T.LineSegments(M.geo["edges-" + key], M.mat.ink));
    if (pos) mesh.position.copy(pos);
    if (rot) mesh.rotation.copy(rot);
    parent.add(mesh);
    return mesh;
  }

  function makeIslands() {
    var T = M.T, g = M.geo;
    g.body = track(new T.CylinderGeometry(1.25, 0.8, 0.7, 7));
    g.cap = track(new T.CylinderGeometry(1.28, 1.28, 0.1, 7));
    g.cone = track(new T.ConeGeometry(0.8, 1.1, 7));
    var trackPts = [];
    for (var k = 0; k <= 28; k++) {
      var a = (k / 28) * Math.PI * 2;
      trackPts.push(new T.Vector3(Math.cos(a) * 1.45, 0, Math.sin(a) * 1.45));
    }
    g.track = track(new T.BufferGeometry().setFromPoints(trackPts));

    ISLES.forEach(function (isle, i) {
      var grp = new T.Group();
      grp.position.set(isle.x, isle.y, isle.z);
      /* turn the heptagon a little per island so the row does not look stamped */
      grp.rotation.y = (i * 0.9) % (Math.PI * 2 / 7);
      var body = withEdges(g.body, M.mat.paper, grp);
      var cap = withEdges(g.cap, M.mat.cap[isle.part.id], grp, new T.Vector3(0, 0.4, 0));
      withEdges(g.cone, M.mat.under, grp, new T.Vector3(0, -0.9, 0), new T.Euler(Math.PI, 0, 0));
      var ring = new T.LineLoop(g.track, M.mat.track);
      ring.position.y = DECK + 0.1;
      grp.add(ring);
      body.userData.isle = i;
      cap.userData.isle = i;
      M.pick.push(body, cap);
      isle.grp = grp;
      isle.cap = cap;
      isle.dyn = new T.Group();
      isle.dyn.position.set(isle.x, isle.y, isle.z);
      M.scene.add(grp, isle.dyn);
    });
  }

  /* a curve through every island, with a bend between rows, and stepping stones on it */
  function makePath() {
    var T = M.T;
    var pts = [];
    C.parts.forEach(function (part, p) {
      var row = ISLES.filter(function (s) { return s.p === p; });
      row.forEach(function (s) { pts.push(new T.Vector3(s.x, s.y, s.z)); });
      var last = row[row.length - 1], dir = p % 2 === 0 ? 1 : -1;
      if (!last) return;
      var next = ISLES.filter(function (s) { return s.p === p + 1; })[0];
      var bend = next
        ? new T.Vector3((last.x + next.x) / 2 + dir * 2.2, last.y + ROW_Y / 2, last.z - ROW_Z / 2)
        : new T.Vector3(last.x + dir * 3.1, last.y, last.z);
      pts.push(bend);
      part.bend = bend;
      part.bendAlong = next ? new T.Vector3(0, 0, -1) : new T.Vector3(dir, 0, 0);
    });
    var curve = M.curve = new T.CatmullRomCurve3(pts, false, "centripetal");

    /* stones only where the path is in the open, spaced so about STONES of them fit */
    var N = 900, sp = curve.getSpacedPoints(N), open = [], openLen = 0;
    for (var k = 0; k <= N; k++) {
      var q = sp[k], free = true;
      for (var i = 0; i < ISLES.length && free; i++) {
        var s = ISLES[i], dx = q.x - s.x, dy = q.y - s.y, dz = q.z - s.z;
        if (dx * dx + dy * dy * 4 + dz * dz < 1.36 * 1.36) free = false;
      }
      open.push(free);
      if (k && free && open[k - 1]) openLen += q.distanceTo(sp[k - 1]);
    }
    var gap = openLen / STONES, acc = gap / 2, placed = [];
    for (k = 1; k <= N; k++) {
      if (!(open[k] && open[k - 1])) continue;
      acc += sp[k].distanceTo(sp[k - 1]);
      if (acc >= gap) { acc -= gap; placed.push(k); }
    }
    M.geo.stone = track(new T.BoxGeometry(0.34, 0.1, 0.26));
    var stones = new T.InstancedMesh(M.geo.stone, M.mat.stone, placed.length);
    var o = new T.Object3D();
    placed.forEach(function (k, n) {
      var a = sp[Math.max(0, k - 1)], b = sp[Math.min(N, k + 1)];
      o.position.set(sp[k].x, sp[k].y + DECK - 0.06, sp[k].z);
      o.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z) + (n % 2 ? 0.12 : -0.08), 0);
      o.updateMatrix();
      stones.setMatrixAt(n, o.matrix);
    });
    M.scene.add(stones);
    M.stoneCount = placed.length;
  }

  /* a half-torus arch after each Part's last island, linking to that Part's review set */
  function makeArches() {
    var T = M.T;
    M.geo.arch = track(new T.TorusGeometry(0.95, 0.11, 6, 12, Math.PI));
    M.geo.archHit = track(new T.BoxGeometry(2.2, 1.2, 0.6));
    C.parts.forEach(function (part) {
      if (!part.bend || REVIEW[part.id] === undefined) return;
      var grp = new T.Group();
      grp.position.set(part.bend.x, part.bend.y + DECK - 0.04, part.bend.z);
      grp.lookAt(grp.position.clone().add(part.bendAlong));
      var arch = withEdges(M.geo.arch, M.mat.stone, grp);
      var hit = new T.Mesh(M.geo.archHit, M.mat.stone);
      hit.visible = false;
      hit.position.y = 0.5;
      hit.userData.isle = REVIEW[part.id];
      hit.userData.review = true;
      grp.add(hit);
      M.pick.push(hit);
      M.scene.add(grp);
      M.arches.push({ part: part, isle: REVIEW[part.id], mesh: arch });
    });
  }

  function makeMarkers() {
    var T = M.T, g = M.geo;
    g.boss = track(new T.IcosahedronGeometry(0.42, 0));
    g.star = track(new T.OctahedronGeometry(0.26, 0));
    g.marker = track(new T.OctahedronGeometry(0.3, 0));
    g.pole = track(new T.CylinderGeometry(0.04, 0.04, 1.5, 5));
    var shape = new T.Shape();
    shape.moveTo(0, 0); shape.lineTo(0.78, -0.22); shape.lineTo(0, -0.46); shape.lineTo(0, 0);
    g.pennant = track(new T.ShapeGeometry(shape));
    g.select = track(new T.TorusGeometry(1.66, 0.03, 4, 28));
    g.ring = {};

    M.marker = withEdges(g.marker, M.mat.accent, M.scene);
    M.marker.scale.set(1, 1.45, 1);
    M.select = new T.Mesh(g.select, M.mat.inkFill);
    M.select.rotation.x = -Math.PI / 2;
    M.select.visible = false;
    M.scene.add(M.select);
  }

  /* ---------------------------------------------- progress (the dynamic bits) -- */

  function medalFor(id) {
    try {
      if (window.BMGame && typeof window.BMGame.medal === "function") return window.BMGame.medal(id, "practice") || 0;
    } catch (e) { /* no medal data: one star for complete */ }
    return 0;
  }

  function refresh(quiet) {
    if (!M) return;
    var T = M.T, g = M.geo, mat = M.mat;
    var P = window.BMProgress;
    var curId = currentId();
    M.cur = curId ? isleIndex(curId) : -1;
    M.done = {};
    ISLES.forEach(function (isle, i) {
      var c = P && P.count ? P.count(isle.id) : { solved: 0, total: 0 };
      var total = c.total || 0, solved = Math.min(c.solved || 0, total);
      var done = total > 0 && solved >= total;
      var pct = total ? solved / total : 0;
      M.done[isle.id] = done;
      var ahead = !done && i !== M.cur && !solved;
      isle.cap.material = ahead ? mat.capAhead[isle.part.id] : mat.cap[isle.part.id];

      /* clear last time's ring, boss, flag and stars */
      var dyn = isle.dyn;
      while (dyn.children.length) dyn.remove(dyn.children[0]);

      if (pct > 0) {
        var segs = Math.max(2, Math.ceil(24 * pct));
        var key = segs + ":" + pct.toFixed(3);
        if (!g.ring[key]) g.ring[key] = track(new T.TorusGeometry(1.45, 0.05, 6, segs, Math.PI * 2 * pct));
        var ring = new T.Mesh(g.ring[key], mat.ok);
        ring.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
        ring.position.y = DECK + 0.1;
        ring.userData.kind = "ring";
        dyn.add(ring);
      }
      if (done) {
        var pole = new T.Mesh(g.pole, mat.inkFill);
        pole.position.set(-0.5, DECK + 0.8, -0.4);
        var flag = withEdges(g.pennant, mat.pennant, dyn, new T.Vector3(-0.47, DECK + 1.52, -0.4));
        flag.rotation.y = -0.35;
        flag.userData.kind = "flag";
        dyn.add(pole);
        var stars = clamp(medalFor(isle.id) || 1, 1, 3);
        for (var s = 0; s < stars; s++) {
          var star = withEdges(g.star, mat.hot, dyn, new T.Vector3(0.2 + (s - (stars - 1) / 2) * 0.58, DECK + 0.72, 0.3));
          star.rotation.y = 0.4;
          star.userData.kind = "star";
        }
      } else {
        /* the boss is the unsolved part of the set: it shrinks as problems fall */
        var left = total ? (total - solved) / total : 1;
        var boss = withEdges(g.boss, mat.deep[isle.part.id], dyn, new T.Vector3(0, DECK + 1.05, 0));
        boss.scale.setScalar(Math.max(0.28, left));
        boss.rotation.set(0.4, i * 0.7, 0.2);
        boss.userData.kind = "boss";
      }
    });

    M.arches.forEach(function (a) {
      a.mesh.material = M.done[ISLES[a.isle].id] ? mat.hot : mat.stone;
    });

    if (M.cur > -1) {
      M.marker.visible = true;
      markerAt(0);
    } else {
      M.marker.visible = false;
    }
    markList();
    if (!quiet) request();
  }

  /* b: how far through the bob, 0 (at rest) to 1; the quarter turn ends where it began,
     as the octahedron looks the same turned by a quarter */
  function markerAt(b) {
    var isle = ISLES[M.cur];
    if (!isle) return;
    var lift = M.done[isle.id] ? 1.75 : 2.05;
    M.marker.position.set(isle.x, isle.y + DECK + lift + Math.sin(b * Math.PI * 2) * 0.12, isle.z);
    M.marker.rotation.y = 0.4 + (1 - Math.cos(b * Math.PI)) / 2 * Math.PI / 2;
  }

  /* the list item that matches the selected island carries a quiet highlight */
  function markList() {
    Array.prototype.forEach.call(host.querySelectorAll("li.stop[data-map-hot]"), function (li) {
      li.removeAttribute("data-map-hot");
    });
    if (M && M.hot > -1) {
      var li = host.querySelector('li.stop[data-chapter="' + ISLES[M.hot].id + '"]');
      if (li) li.setAttribute("data-map-hot", "true");
    }
  }

  /* ---------------------------------------------------------------- camera -- */

  var DIR = [0.1, 0.68, 0.73];

  function fitDist(width) {
    var tanv = Math.tan((FOV / 2) * Math.PI / 180);
    return width / (2 * tanv * M.camera.aspect);
  }
  function partView(p) {
    var row = ISLES.filter(function (s) { return s.p === p; });
    /* every Part is framed at the scale of the longest row, so flying between them does not zoom */
    var span = Math.max(4, row.length - 1) * STEP_X + 3.6;
    return {
      t: new M.T.Vector3(0, ROW_Y * p + 1, -ROW_Z * p - 2.8),
      d: clamp(fitDist(span) * 1.25, 12, 30), kind: "part", p: p
    };
  }
  function isleView(i) {
    var s = ISLES[i];
    return {
      t: new M.T.Vector3(s.x, s.y + 1.3, s.z - 1.6),
      d: clamp(fitDist(M.camera.aspect < 1 ? 9 : 13), 9, 22), kind: "isle", i: i
    };
  }
  function place() {
    var v = M.view, c = M.camera;
    c.position.set(v.t.x + DIR[0] * v.d, v.t.y + DIR[1] * v.d, v.t.z + DIR[2] * v.d);
    c.lookAt(v.t);
    c.updateMatrixWorld();
  }
  function firstView() {
    var v = M.cur > -1
      ? (M.camera.aspect < 1 ? isleView(M.cur) : partView(ISLES[M.cur].p))
      : partView(0);
    jump(v);
  }
  function jump(v) {
    M.flight = null;
    M.view.t.copy(v.t);
    M.view.d = v.d;
    M.viewKind = v;
    place();
    settle();
    request();
  }
  function flyTo(v) {
    M.viewKind = v;
    if (still() || !M.onscreen || document.hidden) { jump(v); return; }
    M.flight = { t0: M.view.t.clone(), d0: M.view.d, v: v, start: 0 };
    wake();
  }
  /* after a resize, the same view framed for the new shape */
  function reframe() {
    var k = M.viewKind;
    if (!k || M.flight || M.drag) { place(); return; }
    var v = k.kind === "part" ? partView(k.p) : k.kind === "isle" ? isleView(k.i) : null;
    if (v) { M.view.t.copy(v.t); M.view.d = v.d; }
    place();
  }
  /* where on the path the view now sits, so a drag continues from here */
  function settle() {
    var best = 0, bd = Infinity, N = 240;
    for (var k = 0; k <= N; k++) {
      var q = M.curve.getPointAt(k / N);
      var dd = (q.x - M.view.t.x) * (q.x - M.view.t.x) + (q.z - 1.6 - M.view.t.z) * (q.z - 1.6 - M.view.t.z) +
        (q.y + 1.3 - M.view.t.y) * (q.y + 1.3 - M.view.t.y);
      if (dd < bd) { bd = dd; best = k / N; }
    }
    M.u = best;
    if (!still()) M.bob = { start: 0 };
    var p = Math.round(clamp(-M.view.t.z / ROW_Z, 0, C.parts.length - 1));
    Array.prototype.forEach.call(box.querySelectorAll(".map3d-part"), function (b) {
      if (+b.getAttribute("data-p") === p) b.setAttribute("data-on", "true");
      else b.removeAttribute("data-on");
    });
  }

  /* ------------------------------------------------------------ rendering -- */

  function size() {
    var w = M.stage.clientWidth, h = M.stage.clientHeight;
    if (!w || !h) return;
    M.renderer.setSize(w, h, false);
    M.camera.aspect = w / h;
    M.camera.updateProjectionMatrix();
    M.dirty = true;
  }
  function onWindowResize() { if (M) { size(); reframe(); request(); } }

  function render() {
    if (!M) return;
    M.dirty = false;
    M.renderer.render(M.scene, M.camera);
    placeLabels();
    if (!M.firstRender) {
      M.firstRender = true;
      M.stage.setAttribute("data-state", "ready");
    }
  }

  function canAnimate() { return M && M.onscreen && !document.hidden; }
  function wantsBob() { return M && M.bob && M.marker.visible && !still() && !M.flight && !M.drag; }

  /* draw once soon (render on demand) */
  function request() {
    if (!M) return;
    M.dirty = true;
    wake();
  }
  function wake() {
    if (!M || M.raf || !canAnimate()) return;
    if (!M.dirty && !M.flight && !wantsBob()) return;
    M.raf = window.requestAnimationFrame(frame);
  }

  function frame(t) {
    if (!M) return;
    M.raf = 0;
    var more = false;
    if (M.flight) {
      var f = M.flight;
      if (!f.start) f.start = t;
      var k = clamp((t - f.start) / FLIGHT_MS, 0, 1);
      var e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      M.view.t.copy(f.t0).lerp(f.v.t, e);
      M.view.d = f.d0 + (f.v.d - f.d0) * e;
      place();
      if (k >= 1) { M.flight = null; settle(); } else more = true;
    }
    if (wantsBob()) {
      if (!M.bob.start) M.bob.start = t;
      var b = (t - M.bob.start) / BOB_MS;
      if (b < 1) {
        markerAt(b);
        M.bobbing = true;
        more = true;
      } else {
        M.bob = null;
        M.bobbing = false;
        markerAt(0);
      }
    } else if (M.bobbing) {
      M.bob = null;
      M.bobbing = false;
      markerAt(0);
    }
    render();
    if (more) watchdog(t);
    else M.lastFrame = 0;
    if (M && (more || M.dirty) && canAnimate()) M.raf = window.requestAnimationFrame(frame);
    else if (M) M.lastFrame = 0;
  }

  /* too slow to be pleasant: first drop to one device pixel, then give the list back */
  function watchdog(t) {
    /* a gap of over a second is a pause (a held frame, a long task), not a slow frame */
    if (M.lastFrame && t - M.lastFrame < 1000) {
      M.samples.push(t - M.lastFrame);
      if (M.samples.length >= 60) {
        var sum = 0;
        M.samples.forEach(function (d) { sum += d; });
        M.samples = [];
        if (sum / 60 > 50) {
          if (M.renderer.getPixelRatio() > 1) {
            M.renderer.setPixelRatio(1);
            size();
          } else {
            failed = "slow";
            teardown();
            return;
          }
        }
      }
    }
    M.lastFrame = t;
  }

  /* labels: only the selected or hovered island and the current one, as HTML plates */
  function placeLabels() {
    var want = [];
    if (M.cur > -1) want.push({ i: M.cur, kind: "current" });
    var sel = M.hover > -1 ? M.hover : M.hot;
    if (sel > -1 && sel !== M.cur) want.push({ i: sel, kind: "hot", review: M.hover > -1 ? M.hoverReview : false });
    var html = "";
    want.forEach(function (w) {
      var ch = ISLES[w.i].ch;
      var text = w.review ? "Mixed review · " + regionName(ISLES[w.i].part) : chapterName(ch) + " · " + ch.title;
      html += '<span class="map3d-label" data-kind="' + w.kind + '" data-part="' + esc(ISLES[w.i].part.id) +
        '" data-i="' + w.i + '">' + esc(text) + "</span>";
    });
    if (M.labels.getAttribute("data-key") !== html) {
      M.labels.innerHTML = html;
      M.labels.setAttribute("data-key", html);
    }
    var w = M.stage.clientWidth, h = M.stage.clientHeight;
    Array.prototype.forEach.call(M.labels.children, function (el) {
      var s = ISLES[+el.getAttribute("data-i")];
      var lift = el.getAttribute("data-kind") === "current" ? (M.done[s.id] ? 2.35 : 2.65) : (M.done[s.id] ? 1.85 : 1.85);
      var v = new M.T.Vector3(s.x, s.y + DECK + lift, s.z).project(M.camera);
      var x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
      var off = v.z > 1 || x < -40 || x > w + 40 || y < 0 || y > h + 20;
      el.style.visibility = off ? "hidden" : "visible";
      el.style.transform = "translate(" + Math.round(clamp(x, 8, w - 8)) + "px," + Math.round(y) + "px) translate(-50%,-100%)";
    });
  }

  /* -------------------------------------------------------- selection ------ */

  function highlight(i) {
    var s = ISLES[i];
    if (!s) { M.select.visible = false; return; }
    M.select.visible = true;
    M.select.position.set(s.x, s.y + DECK + 0.1, s.z);
  }
  function select(i, how) {
    if (!M || i < 0) return;
    var same = M.hot === i;
    M.hot = i;
    M.hotHow = how;
    highlight(M.hover > -1 ? M.hover : i);
    markList();
    if (!same || !M.viewKind || M.viewKind.i !== i) flyTo(isleView(i));
    request();
  }
  function unselect() {
    if (!M) return;
    M.hot = -1;
    highlight(M.hover);
    markList();
    request();
  }

  /* list → map */
  var hoverTimer = 0;
  host.addEventListener("focusin", function (e) {
    if (!M) return;
    var a = closest(e.target, ".stop-link");
    var li = a && closest(a, "li.stop");
    if (li) select(isleIndex(li.getAttribute("data-chapter")), "focus");
  });
  host.addEventListener("focusout", function (e) {
    if (!M) return;
    if (!closest(e.relatedTarget, ".stop-link") && M.hotHow === "focus") unselect();
  });
  host.addEventListener("mouseover", function (e) {
    if (!M) return;
    var a = closest(e.target, ".stop-link");
    var li = a && closest(a, "li.stop");
    if (!li) return;
    var i = isleIndex(li.getAttribute("data-chapter"));
    if (i === M.hot) return;
    clearTimeout(hoverTimer);
    /* a short pause, so sweeping the pointer down the list does not whip the camera about */
    hoverTimer = setTimeout(function () { select(i, "hover"); }, 140);
  });
  host.addEventListener("mouseleave", function () {
    clearTimeout(hoverTimer);
    if (M && M.hotHow === "hover") unselect();
  });

  /* map → list */
  function pickAt(clientX, clientY) {
    var r = M.canvas.getBoundingClientRect();
    var ndc = new M.T.Vector2((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    var ray = new M.T.Raycaster();
    ray.setFromCamera(ndc, M.camera);
    var hits = ray.intersectObjects(M.pick, false);
    return hits.length ? hits[0].object.userData : null;
  }
  function hrefFor(hit) {
    var a = linkFor(hit.isle);
    if (!a) return null;
    return hit.review ? a.href.replace(/#.*$/, "") + "#review" : a.href;
  }

  function onDown(e) {
    if (!M || (e.button !== undefined && e.button !== 0)) return;
    M.press = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, type: e.pointerType, moved: false, far: false,
      hit: pickAt(e.clientX, e.clientY) };
  }
  function onMove(e) {
    if (!M) return;
    var pr = M.press;
    if (pr && pr.id === e.pointerId) {
      var dx = e.clientX - pr.x, dy = e.clientY - pr.y;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) pr.far = true;
      if (!pr.moved && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
        pr.moved = true;
        M.drag = true;
        M.flight = null;
        M.viewKind = { kind: "free" };
        try { M.canvas.setPointerCapture(e.pointerId); } catch (err) { /* not captured: still works */ }
        box.setAttribute("data-drag", "true");
      }
      if (pr.moved) {
        pan(e.clientX - pr.lx);
        pr.lx = e.clientX;
      }
      return;
    }
    if (e.pointerType === "mouse") {
      var hit = pickAt(e.clientX, e.clientY);
      var i = hit ? hit.isle : -1;
      var review = !!(hit && hit.review);
      if (i !== M.hover || review !== M.hoverReview) {
        M.hover = i;
        M.hoverReview = review;
        M.canvas.style.cursor = i > -1 ? "pointer" : "";
        highlight(i > -1 ? i : M.hot);
        request();
      }
    }
  }
  function onUp(e) {
    if (!M) return;
    var pr = M.press;
    M.press = null;
    if (!pr || pr.id !== e.pointerId) return;
    if (pr.moved) {
      M.drag = false;
      box.removeAttribute("data-drag");
      settle();
      wake();
      return;
    }
    /* like a link: only a press and release on the same island, without travelling, is a click */
    var hit = pr.far ? null : pickAt(e.clientX, e.clientY);
    if (!hit || !sameHit(hit, pr.hit)) return;
    var href = hrefFor(hit);
    if (pr.type === "mouse" || pr.type === "pen") {
      if (href) go(href, e);
      return;
    }
    /* touch: the first tap selects the list link, a second tap on the same island opens it */
    if (M.hot === hit.isle && M.tapReview === !!hit.review && M.hotHow === "tap") {
      if (href) window.location.href = href;
      return;
    }
    M.tapReview = !!hit.review;
    var a = linkFor(hit.isle);
    select(hit.isle, "tap");
    M.hotHow = "tap";
    if (a) {
      try { a.focus({ preventScroll: true }); } catch (err) { a.focus(); }
      M.hotHow = "tap";
      if (sideBySide() && a.scrollIntoView) a.scrollIntoView({ block: "nearest" });
    }
  }
  function sameHit(a, b) { return !!b && a.isle === b.isle && !!a.review === !!b.review; }
  /* a modified click opens a new tab, as it would on the list link */
  function go(href, e) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) window.open(href, "_blank");
    else window.location.href = href;
  }
  function onAux(e) {
    if (!M || e.button !== 1) return;
    var hit = pickAt(e.clientX, e.clientY), href = hit && hrefFor(hit);
    if (!href) return;
    e.preventDefault();
    go(href, e);
  }
  function onCancel() {
    if (!M) return;
    M.press = null;
    if (M.drag) { M.drag = false; box.removeAttribute("data-drag"); settle(); wake(); }
  }
  function onLeave(e) {
    if (!M || e.pointerType !== "mouse" || M.hover < 0) return;
    M.hover = -1;
    M.canvas.style.cursor = "";
    highlight(M.hot);
    request();
  }

  /* a horizontal drag slides the view along the path, the content following the pointer */
  function pan(dx) {
    if (!dx) return;
    var c = M.curve, u = M.u, eps = 0.004;
    var a = c.getPointAt(clamp(u - eps, 0, 1)).project(M.camera);
    var b = c.getPointAt(clamp(u + eps, 0, 1)).project(M.camera);
    var pxPerU = ((b.x - a.x) / 2) * M.stage.clientWidth / (2 * eps);
    var floor = M.stage.clientWidth * 1.2;
    if (Math.abs(pxPerU) < floor) pxPerU = (pxPerU < 0 || (pxPerU === 0 && M.panSign < 0) ? -1 : 1) * floor;
    M.panSign = pxPerU < 0 ? -1 : 1;
    M.u = clamp(u - dx / pxPerU, 0, 1);
    var q = c.getPointAt(M.u);
    M.view.t.set(q.x, q.y + 1.3, q.z - 1.6);
    place();
    request();
  }

  function onPartButton(e) {
    if (!M) return;
    var b = closest(e.target, ".map3d-part");
    if (!b) return;
    var p = +b.getAttribute("data-p");
    flyTo(partView(p));
    Array.prototype.forEach.call(box.querySelectorAll(".map3d-part"), function (x) {
      if (x === b) x.setAttribute("data-on", "true"); else x.removeAttribute("data-on");
    });
    /* beside the list, bring that Part's heading up too; stacked, the map is what you are looking at */
    var h = document.getElementById("part-" + C.parts[p].id);
    if (h && sideBySide()) h.scrollIntoView({ block: "start", behavior: still() ? "auto" : "smooth" });
  }

  /* -------------------------------------------------------- lifecycle ------ */

  function onLost() {
    failed = "context-lost";
    teardown();
  }

  function teardown() {
    clearTimeout(hoverTimer);
    if (M) {
      var m = M;
      M = null;
      if (m.raf) window.cancelAnimationFrame(m.raf);
      m.observers.forEach(function (o) { o.disconnect(); });
      window.removeEventListener("resize", onWindowResize);
      m.canvas.removeEventListener("webglcontextlost", onLost, false);
      m.disposables.forEach(function (x) { if (x && x.dispose) x.dispose(); });
      try { m.renderer.dispose(); } catch (e) { /* already gone */ }
      Array.prototype.forEach.call(host.querySelectorAll("li.stop[data-map-hot]"), function (li) {
        li.removeAttribute("data-map-hot");
      });
    }
    box.hidden = true;
    box.innerHTML = "";
    box.removeAttribute("data-drag");
    host.removeAttribute("data-map");
  }

  function boot() {
    if (M || starting || !wanted()) return;
    starting = true;
    BM3D.load().then(function (ok) {
      starting = false;
      if (!ok || M || !wanted()) return;
      try {
        build();
      } catch (e) {
        failed = "error";
        if (window.console) console.warn("[BM] course map unavailable, showing the list", e);
        teardown();
      }
    });
  }

  /* state changes: rebuild the dynamic bits, never the renderer */
  var refreshTimer = 0;
  function later() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () { refresh(); }, 0);
  }
  if (window.BMStore && window.BMStore.on) {
    window.BMStore.on(function (c) {
      if (!c) return;
      if (c.type === "prefs") {
        if (M && !wanted()) teardown();
        else if (!M) boot();
        return;
      }
      if (!M) return;
      var K = window.BMStore.keys || {};
      if (c.type === "home" || c.type === "sync" || c.type === "reset" ||
          (c.type === "state" && (c.key === K.progress || c.key === K.last || c.key === K.game))) later();
    });
  }

  /* theme and calm mode live on <html>; reduced motion on the media query */
  if (window.MutationObserver) {
    new MutationObserver(function (list) {
      if (!M) return;
      var theme = list.some(function (m) { return m.attributeName === "data-theme"; });
      if (theme) applyPalette();
      if (still()) M.bob = null;
      if (M.bobbing && !wantsBob()) { M.bobbing = false; markerAt(0); }
      if (M.flight && still()) jump(M.flight.v);
      request();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-calm"] });
  }
  if (reduceQuery) {
    var onReduce = function () {
      if (!M) return;
      if (still()) M.bob = null;
      if (M.flight && still()) jump(M.flight.v);
      markerAt(0);
      request();
    };
    if (reduceQuery.addEventListener) reduceQuery.addEventListener("change", onReduce);
    else if (reduceQuery.addListener) reduceQuery.addListener(onReduce);
  }
  document.addEventListener("visibilitychange", function () {
    if (!M) return;
    /* the time spent hidden is not frame time */
    M.lastFrame = 0;
    M.samples = [];
    if (!document.hidden) wake();
  });

  /* a small handle for the checks in tools/ and for curious readers of the console */
  window.BMMap3D = {
    on: function () { return !!M; },
    why: function () { return M ? "" : failed || BM3D.why || (prefs().map === "list" ? "list" : ""); },
    info: function () {
      if (!M) return null;
      var tris = 0;
      M.scene.traverse(function (o) {
        if (!o.isMesh || !o.visible || !o.geometry) return;
        var g = o.geometry, n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
        tris += n * (o.isInstancedMesh ? o.count : 1);
      });
      return { triangles: Math.round(tris), stones: M.stoneCount, current: M.cur > -1 ? ISLES[M.cur].id : null,
        hot: M.hot > -1 ? ISLES[M.hot].id : null, flying: !!M.flight, bobbing: !!M.bobbing,
        pixelRatio: M.renderer.getPixelRatio(), isles: kinds() };
    },
    /* where an island sits on screen, in client pixels */
    where: function (id) {
      var i = isleIndex(id);
      if (!M || i < 0) return null;
      var s = ISLES[i], r = M.canvas.getBoundingClientRect();
      var v = new M.T.Vector3(s.x, s.y + DECK, s.z).project(M.camera);
      return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
    }
  };
  function kinds() {
    var out = {};
    ISLES.forEach(function (s) {
      out[s.id] = s.dyn.children.map(function (o) { return o.userData.kind || ""; }).filter(Boolean).join(",");
    });
    return out;
  }

  boot();
})();
