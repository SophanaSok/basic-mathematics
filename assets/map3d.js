/* ===========================================================================
   Basic Mathematics — the course world (index.html only)
   The contents page opens on a lit 3D world of the course: four regions, one per
   Part, each a terrace of its own with the Part's chapters standing on it as islands
   along one path. It is an enhancement above the chapter list, never a replacement
   for it. The list (ol.path inside [data-course-index]) stays the accessible,
   focusable structure; the canvas is aria-hidden and only mirrors it:
     list → map   focusing a chapter link selects its island and brings the camera to
                  it (a flight while the stage and the link are both in view, else a
                  cut, so the world is there when the learner scrolls back up);
                  hovering one flies there while the stage is in view
     map → list   a mouse click on an island opens the same link; a tap selects the
                  link first and opens it on a second tap
   Four real buttons fly to a Part.

   This file is the camera, the pointer, the labels, the list and the render loop.
   What is drawn is src/world/ (index.ts and the modules it imports: the terraces and
   their props, the islands, the progress marks, the light, the sky and fog, the
   colours, all from Three.js primitives and the CSS tokens), a chunk of its own,
   bundle/world.js, imported only once the device is to get 3D. Which tier of quality
   it gets, and when that is the list, is src/world/tiers.ts.

   Drawn on demand: frames run for a camera flight and, on the medium and high tiers,
   for AMBIENT_MS of idle motion after an input (the marker's bob, the Foundry's smoke,
   the Observatory's telescope), never under reduced motion or Study mode; offscreen or
   in a hidden tab nothing is drawn, and an idle page asks for no frames at all.

   On the high tier and the dark theme, and only there, the map is drawn through the bloom
   (src/world/post.ts, fetched as two chunks once the world is up): the due beacons and the
   regions' glow props glow softly. The light theme has none (owner O16: its glow tokens are
   dark, so the boost would turn them neon) and never fetches the chunks; a live theme flip
   builds or drops it. The watchdog turns it off before it steps the tier down.

   The box stays hidden, and the list looks exactly as it did, when the tier is the
   list (the 3D map switch off, no WebGL 2, Save-Data, or a watchdog that gave up),
   Three.js (bundle/three.js, fetched by assets/three-loader.js) or the world chunk
   cannot be fetched, or the WebGL context is lost. Its place is kept from the first
   paint where src/boot.js expects 3D (html[data-world], assets/map3d.css), so the hero
   below does not drop when this script arrives; whenever the box goes, so does that.
   =========================================================================== */
import { worn } from "../src/core/forms.ts";
import { detectTier, readProbe, stepDown, lower, pixelRatio, TIERS, AMBIENT_MS, FrameWatch } from "../src/world/tiers.ts";

(function () {
  "use strict";

  var C = window.BM_CURRICULUM;
  var BM3D = window.BM3D;
  var box = document.querySelector("[data-map3d]");
  var host = document.querySelector("[data-course-index]");
  if (!C || !C.parts || !BM3D || !BM3D.load || !box || !host) return;
  /* the Parts the map draws: a beside Part (the skill packs) has no island on it */
  var MAP_PARTS = C.parts.filter(function (part) { return !part.beside; });

  /* region names until data/quest.js supplies them */
  var REGIONS = {
    algebra: "The Foundry", geometry: "The Fields", coordinates: "The Grid", topics: "The Observatory"
  };

  var FLIGHT_MS = 700;
  var BOB_MS = 2400;        /* one rise and fall of the marker */
  var FOV = 34;

  var M = null;             /* the live world, or null while the list stands alone */
  var W = null;             /* the world chunk's exports, once imported */
  var ISLES = [];           /* one per chapter, in reading order (the world's layout, with the chapter and Part) */
  var failed = "";          /* why 3D gave up for this visit (lost context, an error); sticky */
  var slowCap = null;       /* the tier the watchdog stepped down to on this visit, if it did */
  var bloomWhy = "";       /* why it is off when bloomOff is: "watchdog" or "unsupported" */
  var bloomOff = false;     /* the watchdog (or a renderer that cannot) turned the bloom off for this visit */
  var starting = false;
  var choice = null;        /* the last detectTier() answer */
  var probe = null;

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

  /* which tier, and why: src/world/tiers.ts, held to what the watchdog allowed on this visit */
  function decide() {
    if (failed) return { tier: "list", why: failed, chosen: false };
    if (!probe) probe = readProbe(BM3D);
    var c = detectTier(probe, prefs());
    if (slowCap && c.tier !== "list" && lower(c.tier, slowCap) === slowCap && slowCap !== c.tier) {
      c = { tier: slowCap, why: slowCap === "list" ? "slow" : "settled", chosen: c.chosen };
    }
    choice = c;
    return c;
  }

  var reduceQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function still() {
    if (window.BMFx && typeof window.BMFx.still === "function") {
      try { return !!window.BMFx.still(); } catch (e) { /* fall back below */ }
    }
    var root = document.documentElement;
    return !!(reduceQuery && reduceQuery.matches) || root.hasAttribute("data-calm") || root.getAttribute("data-motion") === "reduce";
  }

  function regionName(part) {
    var Q = window.BM_QUEST;
    var r = Q && Q.regions && Q.regions[part.id];
    return (r && r.name) || REGIONS[part.id] || part.name;
  }
  function motif(part) {
    var Q = window.BM_QUEST;
    var r = Q && Q.regions && Q.regions[part.id];
    return r && r.motif;
  }
  function chapterName(ch) {
    if (window.BMSite && window.BMSite.chapterName) return window.BMSite.chapterName(ch);
    if (ch.label === "Interlude") return "Interlude";
    return (ch.part && ch.part.beside ? "Pack " : "Chapter ") + ch.label;
  }

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
    /* a pack has no island: "you are here" is the current stop that has one, else the
       first unfinished island of the course */
    var lis = host.querySelectorAll("li.stop"), first = null, k, id;
    for (k = 0; k < lis.length; k++) {
      id = lis[k].getAttribute("data-chapter");
      if (isleIndex(id) < 0) continue;
      if (lis[k].getAttribute("data-state") === "current") return id;
      if (first === null && lis[k].getAttribute("data-state") !== "done") first = id;
    }
    return first;
  }

  /* ------------------------------------------------------------ the box ---- */

  /* the buttons, the stage with its "Loading" panel, and the token probes: shown as soon
     as the device is to get 3D, so the world's place is kept while it loads and the page
     does not jump when it arrives (only if loading fails does the box go again). The
     buttons stay disabled, out of the tab order, until build() gives them something to do */
  function skeleton() {
    if (box.querySelector(".map3d-stage")) return;
    var parts = "";
    MAP_PARTS.forEach(function (part, p) {
      parts += '<button type="button" class="map3d-part" data-part="' + esc(part.id) + '" data-p="' + p + '" disabled>' +
        "<b>Part " + esc(part.num) + '</b><span class="map3d-sep"> · </span><span>' + esc(regionName(part)) + "</span></button>";
    });
    var probes = "";
    MAP_PARTS.forEach(function (part) { probes += '<i data-part="' + esc(part.id) + '"></i>'; });
    /* the same four marks for a screen reader, once, ahead of the Part buttons */
    var sr = '<p class="map3d-legend-sr visually-hidden">Marks on the course map. Ring: practice solved. ' +
      '<span data-mark="boss">Solid: the boss, unsolved problems. </span>' +
      "Beacon: sections due for a check. Flag: chapter finished, stars for the medal.</p>";
    box.innerHTML = sr +
      '<div class="map3d-parts" role="group" aria-label="Show a Part on the course map">' + parts + "</div>" +
      '<div class="map3d-stage" data-state="loading">' +
        '<p class="map3d-wait" aria-hidden="true">Loading the map…</p>' +
        '<div class="map3d-labels" aria-hidden="true"></div>' +
        '<ul class="map3d-legend" aria-hidden="true">' +
          '<li data-mark="ring"><i></i>Ring: practice solved</li>' +
          '<li data-mark="boss"><i></i>Solid: the boss, unsolved problems</li>' +
          '<li data-mark="beacon"><i></i>Beacon: sections due for a check</li>' +
          '<li data-mark="flag"><i></i>Flag: chapter finished, stars for the medal</li>' +
        "</ul>" +
      "</div>" +
      '<div class="map3d-probe" aria-hidden="true">' + probes + "</div>";
    box.hidden = false;
    document.documentElement.setAttribute("data-world", "3d");
  }

  /* the goal as plain text for a plate: $…$ spans lose their dollar signs, the line is
     clipped at a word boundary */
  function plainGoal(text, max) {
    var t = String(text || "").replace(/\$((?:\\.|[^$\\])*)\$/g, "$1").replace(/\s+/g, " ").trim();
    if (!t) return "";
    t = t.charAt(0).toUpperCase() + t.slice(1);
    if (t.length <= max) return t;
    var cut = t.slice(0, max + 1), sp = cut.lastIndexOf(" ");
    return cut.slice(0, sp > max * 0.5 ? sp : max).replace(/[\s,;:.]+$/, "") + "…";
  }

  /* --------------------------------------------------------------- build ---- */

  function build(c) {
    /* the Three.js namespace the loader fetched (src/vendor/three.js exports what is
       used here and in src/world/, by name); window.THREE is nothing */
    var T = BM3D.THREE;
    /* token colours go in and come out unchanged: no conversion to a working colour
       space, and the renderer writes them as they are (as the scenes do) */
    T.ColorManagement.enabled = false;
    var budget = TIERS[c.tier];

    var renderer = new T.WebGLRenderer({ antialias: budget.antialias, alpha: false, powerPreference: "low-power" });
    renderer.outputColorSpace = T.LinearSRGBColorSpace;

    skeleton();
    var stage = box.querySelector(".map3d-stage");
    var canvas = renderer.domElement;
    canvas.className = "map3d-canvas";
    canvas.setAttribute("aria-hidden", "true");
    stage.insertBefore(canvas, stage.firstChild);

    var world = W.createWorld(T, {
      course: C, motifs: MAP_PARTS.map(motif), probe: box.querySelector(".map3d-probe"), detail: budget.detail
    });
    ISLES = world.layout.isles.map(function (s) {
      var part = MAP_PARTS[s.p];
      return { id: s.id, ch: part.chapters[s.j], part: part, p: s.p, j: s.j, x: s.x, y: s.y, z: s.z };
    });

    M = {
      T: T, renderer: renderer, canvas: canvas, stage: stage, world: world,
      labels: box.querySelector(".map3d-labels"),
      scene: world.scene, camera: new T.PerspectiveCamera(FOV, 16 / 9, 0.5, 200),
      tier: c.tier, chosen: c.chosen, budget: budget,
      view: { t: new T.Vector3(), d: 18 }, viewKind: null, u: 0,
      flight: null, raf: 0, dirty: true, watch: new FrameWatch(),
      ambientUntil: 0, amb: { t: 0, last: 0, end: 0 }, bobbing: false, frames: 0,
      onscreen: true, hot: -1, hotHow: "", hover: -1, cur: -1, press: null, aux: null, drag: false,
      observers: [], firstRender: false, done: {}, noFog: false,
      bloom: null, bloomLoading: false, sceneCalls: null
    };
    world.showIdle(budget.ambient);
    refresh(true);

    canvas.addEventListener("webglcontextlost", onLost, false);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("auxclick", onAux);
    /* the canvas is not focusable: keep focus where a tap put it (on the list link), and no text selection while dragging;
       a middle press is noted here (pointerdown misses one made while another button is held) for onAux */
    canvas.addEventListener("mousedown", function (e) {
      e.preventDefault();
      if (M && e.button === 1) M.aux = { x: e.clientX, y: e.clientY, hit: pickAt(e.clientX, e.clientY) };
    });
    box.querySelector(".map3d-parts").addEventListener("click", onPartButton);
    Array.prototype.forEach.call(box.querySelectorAll(".map3d-part"), function (b) { b.disabled = false; });

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
    stir();
    syncBloom();
  }

  /* another tier on a live world: the props rebuilt for its detail, its pixel ratio, its idle motion */
  function applyTier(c) {
    if (!M || c.tier === M.tier) { if (M) M.chosen = c.chosen; return; }
    M.tier = c.tier;
    M.chosen = c.chosen;
    M.budget = TIERS[c.tier];
    M.world.setDetail(M.budget.detail);
    M.world.showIdle(M.budget.ambient);
    if (!M.budget.ambient) rest();
    M.watch.reset();
    syncBloom();
    size();
    request();
  }

  /* ------------------------------------------------------------- the bloom -- */

  function themeNow() { return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
  /* the high tier's on the dark theme alone (owner O16: in the light theme the glow tokens are dark, so the
     boost would turn the glow props neon), until the watchdog turns it off; Study mode keeps it (it is light,
     not motion). The light theme never fetches the chunks. */
  function wantBloom() { return !!(M && M.budget.bloom && !bloomOff && themeNow() === "dark"); }
  /* why the bloom is not on: "tier", "light", "watchdog", "unsupported", or "" when it is wanted */
  function bloomReason() {
    if (!M) return "";
    if (!M.budget.bloom) return "tier";
    if (themeNow() !== "dark") return "light";
    return bloomOff ? (bloomWhy || "unsupported") : "";
  }

  /* bring the bloom in line with the tier: its two chunks are fetched only when it is wanted, and
     it is built once they are here and the world is up (a tier that does not want it never asks) */
  function syncBloom() {
    if (!M) return;
    if (!wantBloom()) { dropBloom(); return; }
    if (M.bloom || M.bloomLoading) return;
    var m = M;
    m.bloomLoading = true;
    loadBloom().then(function (r) {
      m.bloomLoading = false;
      if (M !== m || !wantBloom() || m.bloom) return;
      var b = null;
      try {
        var attrs = m.renderer.getContext().getContextAttributes();
        b = r[0].makeBloom(m.T, r[1], m.renderer, m.scene, m.camera, {
          theme: themeNow(), antialias: !!(attrs && attrs.antialias),
          width: m.stage.clientWidth, height: m.stage.clientHeight, dpr: m.renderer.getPixelRatio()
        });
      } catch (e) { b = null; }
      if (!b) { bloomOff = true; bloomWhy = "unsupported"; return; }
      m.bloom = b;
      /* the scene's own draw calls, counted as its pass finishes (the later passes reset the renderer's count) */
      m.scene.onAfterRender = function (renderer) { m.sceneCalls = renderer.info.render.calls; };
      m.world.setBloom(true);
      size();
      request();
    }, function () { m.bloomLoading = false; bloomOff = true; bloomWhy = "unsupported"; });
  }
  function dropBloom() {
    if (!M) return;
    var had = !!M.bloom;
    if (M.bloom) { try { M.bloom.dispose(); } catch (e) { /* already gone */ } M.bloom = null; }
    M.scene.onAfterRender = function () {};
    M.sceneCalls = null;
    M.world.setBloom(false);
    if (had) request();
  }

  /* ---------------------------------------------- progress (the dynamic bits) -- */

  /* what hubState reads, gathered once per refresh (deck() is a full read: never per island). The
     one builder is src/ui/hub-list.ts, which the list reads too; `beside: false` is these islands. */
  function hubInput() {
    return window.BMHubList.hubInput({ beside: false });
  }

  function refresh(quiet) {
    /* the hub's builder and pure state are src/ui/hub-list.ts's (home.js imports it, and src/world/state.ts
       it reads, into the page's own bundle: the world chunk must not import them, or it would pull the
       contents page's bundle onto every page that fetches it); a page without them draws no progress */
    if (!M || !window.BMHubList) return;
    var curId = currentId();
    M.cur = curId ? isleIndex(curId) : -1;
    M.done = {};
    var input = hubInput();
    var states = window.BMHubList.hubState(input), ahead = [];
    ISLES.forEach(function (isle, i) {
      var st = states[i];
      M.done[isle.id] = st.done;
      /* "ahead" is only a colour: the cap fades toward the ground, nothing is locked */
      ahead.push(!st.done && i !== M.cur && !input.counts[isle.id].solved);
    });
    var gates = M.world.layout.gates.map(function (g) { return !!M.done[ISLES[g.isle].id]; });
    /* hubState returns the same array for the same state: an event that changed nothing the hub
       shows (most of them) rebuilds no marks */
    var same = states === M.states && ahead.join() === M.ahead && gates.join() === M.gates;
    M.states = states; M.ahead = ahead.join(); M.gates = gates.join();
    if (!same) M.world.setProgress(states, ahead, gates);

    if (M.cur > -1) {
      /* the marker is the learner's form, in the hue of the Part they are in */
      var G = window.BMGame, game = G && G.game ? G.game() : {}, xp = G && G.info ? G.info().xp : 0;
      var stage = worn(game.form, xp), part = ISLES[M.cur].part;
      if (M.formKey !== stage + "/" + part) { M.formKey = stage + "/" + part; M.world.setForm(stage, part); }
      M.world.marker.visible = true;
      markerAt(0);
    } else {
      M.world.marker.visible = false;
    }
    markList();
    if (!quiet) request();
  }

  /* b: how far through the hop, 0 (at rest) to 1. The marker is the learner's form and
     stands at the front of the island, a little right of the middle: clear of the boss at
     the centre, the flag at the back-left and the stars across the front half (z 0.3, out
     to x 0.78), and inside the cap (radius 1.28) with the last form's base (0.3) and body;
     it faces the camera side (+z), and in the idle window it hops a little */
  function markerAt(b) {
    var isle = ISLES[M.cur];
    if (!isle) return;
    M.world.marker.position.set(isle.x + 0.2, isle.y + W.DECK + Math.max(0, Math.sin(b * Math.PI * 2)) * 0.06, isle.z + 0.9);
    M.world.marker.rotation.y = 0;
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
  var PART_BACK = 1.4;      /* a Part's view looks this far behind its row */

  function fitDist(width) {
    var tanv = Math.tan((FOV / 2) * Math.PI / 180);
    return width / (2 * tanv * M.camera.aspect);
  }
  function partView(p) {
    var row = ISLES.filter(function (s) { return s.p === p; });
    /* every Part is framed at the scale of the longest row, so flying between them does not zoom */
    var span = Math.max(4, row.length - 1) * W.STEP_X + 3.6;
    /* the whole terrace in view, with the next one rising behind it */
    return {
      t: new M.T.Vector3(0, W.ROW_Y * p + 0.6, -W.ROW_Z * p - PART_BACK),
      d: clamp(fitDist(span) * 1.45, 14, 34), kind: "part", p: p
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
    /* the sky and fog of the region below the camera's target, mixed between two (the
       fog switched off only by BMMap3D.fog(false), for the check that it shows) */
    M.world.atmosphere(v.t.z + PART_BACK, v.d, !M.noFog);
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
  /* where on the path the view now sits, so a drag continues from here; and the idle
     motion starts again, as after any input */
  function settle() {
    var best = 0, bd = Infinity, N = 240, curve = M.world.curve();
    for (var k = 0; k <= N; k++) {
      var q = curve.getPointAt(k / N);
      var dd = (q.x - M.view.t.x) * (q.x - M.view.t.x) + (q.z - 1.6 - M.view.t.z) * (q.z - 1.6 - M.view.t.z) +
        (q.y + 1.3 - M.view.t.y) * (q.y + 1.3 - M.view.t.y);
      if (dd < bd) { bd = dd; best = k / N; }
    }
    M.u = best;
    stir();
    var p = Math.round(clamp(-(M.view.t.z + PART_BACK) / W.ROW_Z, 0, MAP_PARTS.length - 1));
    Array.prototype.forEach.call(box.querySelectorAll(".map3d-part"), function (b) {
      if (+b.getAttribute("data-p") === p) b.setAttribute("data-on", "true");
      else b.removeAttribute("data-on");
    });
  }

  /* ------------------------------------------------------------ rendering -- */

  function size() {
    var w = M.stage.clientWidth, h = M.stage.clientHeight;
    if (!w || !h) return;
    M.renderer.setPixelRatio(pixelRatio(M.budget, window.devicePixelRatio || 1, w, h));
    M.renderer.setSize(w, h, false);
    if (M.bloom) M.bloom.setSize(w, h, M.renderer.getPixelRatio());
    M.camera.aspect = w / h;
    M.camera.updateProjectionMatrix();
    M.dirty = true;
  }
  function onWindowResize() { if (M) { size(); reframe(); request(); } }

  function render() {
    if (!M) return;
    M.dirty = false;
    if (M.bloom) M.bloom.render();
    else M.renderer.render(M.scene, M.camera);
    M.frames++;
    placeLabels();
    if (!M.firstRender) {
      M.firstRender = true;
      M.stage.setAttribute("data-state", "ready");
    }
  }

  function canAnimate() { return M && M.onscreen && !document.hidden; }

  /* Idle motion: on a tier that has it, for AMBIENT_MS after the last input (stir), then
     to the end of the marker's bob, so it comes to rest where it began; never while the
     camera flies or is dragged, and never under reduced motion or in Study mode. */
  function stir() {
    if (!M || !M.budget.ambient || still()) return;
    M.ambientUntil = now() + AMBIENT_MS;
    M.amb.end = 0;
    wake();
  }
  function ambient() { return M && M.ambientUntil > 0 && M.budget.ambient && !still() && !M.flight && !M.drag; }
  /* at rest: the marker where it began, the props as they stand */
  function rest() {
    if (!M) return;
    M.ambientUntil = 0;
    M.amb.last = 0;
    M.amb.end = 0;
    if (M.bobbing) { M.bobbing = false; markerAt(0); }
  }

  /* draw once soon (render on demand) */
  function request() {
    if (!M) return;
    M.dirty = true;
    wake();
  }
  function wake() {
    if (!M || M.raf || !canAnimate()) return;
    if (!M.dirty && !M.flight && !ambient()) return;
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
    if (ambient()) {
      var a = M.amb;
      if (a.last) a.t += Math.min(t - a.last, 100);
      a.last = t;
      var end = false;
      if (now() >= M.ambientUntil) {
        if (!a.end) a.end = Math.ceil(a.t / BOB_MS) * BOB_MS;
        if (a.t >= a.end) { a.t = a.end; end = true; }
      }
      M.world.idle(a.t, true);
      if (end) {
        M.bobbing = true;
        rest();
      } else {
        if (M.world.marker.visible) markerAt((a.t % BOB_MS) / BOB_MS);
        M.bobbing = true;
        more = true;
      }
    } else if (M.bobbing) {
      rest();
    }
    render();
    if (!M) return;
    if (more) {
      if (M.watch.push(t)) { degrade(); return; }
    } else if (!M.raf) {
      M.watch.stop();
    }
    /* one loop only: a flight that lands calls settle(), whose stir() may already have
       asked for the next frame (wake); asking again would run two loops side by side,
       drawing twice per display frame and handing the watchdog each timestamp twice */
    if (!M || M.raf) return;
    if ((more || M.dirty) && canAnimate()) M.raf = window.requestAnimationFrame(frame);
    else M.watch.stop();
  }

  /* Too slow to be pleasant: one tier down (src/world/tiers.ts), the list after low.
     When the tier was the device's (not the learner's choice), the tier it settles on is
     kept in bm.prefs.v1 gfxAuto, this device's alone, so the next visit starts there. A
     chosen quality is stepped down for the visit only, but the list is kept whatever the
     choice: a device too slow for the low tier would otherwise fetch Three.js and the
     world's chunk again on every visit, to give them up again (a new choice clears it). */
  function degrade() {
    /* the bloom goes first: one step is the bloom off, the next the tier down */
    if (M.bloom || (wantBloom() && M.bloomLoading)) {
      bloomOff = true;
      bloomWhy = "watchdog";
      dropBloom();
      M.watch.reset();
      request();
      return;
    }
    var next = stepDown(M.tier);
    slowCap = next;
    if ((!M.chosen || next === "list") && window.BMGame && typeof window.BMGame.setPref === "function") {
      try { window.BMGame.setPref("gfxAuto", next); } catch (e) { /* kept for the visit only */ }
    }
    if (!M) return;
    if (next === "list") {
      failed = "slow";
      teardown();
      return;
    }
    applyTier({ tier: next, why: "slow", chosen: M.chosen });
  }

  /* labels: only the selected or hovered island and the current one, as HTML plates */
  function placeLabels() {
    var want = [];
    if (M.cur > -1) want.push({ i: M.cur, kind: "current" });
    var sel = M.hover > -1 ? M.hover : M.hot;
    if (sel > -1 && sel !== M.cur) want.push({ i: sel, kind: "hot", review: M.hover > -1 ? M.hoverReview : false });
    /* the current plate stays one line, unless it is the island being looked at */
    if (sel > -1 && sel === M.cur) want[0].facts = true;
    var html = "";
    want.forEach(function (w) {
      var ch = ISLES[w.i].ch;
      var text = w.review ? "Mixed review · " + regionName(ISLES[w.i].part) : chapterName(ch) + " · " + ch.title;
      var more = "";
      var fm = (w.kind === "hot" || w.facts) && !w.review && window.BMHubList && window.BMHubList.meta && window.BMHubList.meta[ch.id];
      if (fm) {
        more = '<span class="map3d-label-meta">' + fm.scored + (fm.scored === 1 ? " exercise" : " exercises") +
          " · about " + fm.minutes + " min</span>";
        if ((M.hotHow === "focus" || M.hotHow === "tap") && M.hover < 0 && fm.goal) {
          more += '<span class="map3d-label-goal">' + esc(plainGoal(fm.goal, 90)) + "</span>";
        }
      }
      html += '<span class="map3d-label" data-kind="' + w.kind + '" data-part="' + esc(ISLES[w.i].part.id) +
        '" data-i="' + w.i + '"><span class="map3d-label-name">' + esc(text) + "</span>" + more + "</span>";
    });
    if (M.labels.getAttribute("data-key") !== html) {
      M.labels.innerHTML = html;
      M.labels.setAttribute("data-key", html);
    }
    var w = M.stage.clientWidth, h = M.stage.clientHeight;
    /* measured before anything is moved: a plate sits centred above its island, so half
       its width and all of its height have to fit inside the stage */
    var sizes = Array.prototype.map.call(M.labels.children, function (el) { return { half: el.offsetWidth / 2, tall: el.offsetHeight }; });
    Array.prototype.forEach.call(M.labels.children, function (el, n) {
      var s = ISLES[+el.getAttribute("data-i")];
      var lift = el.getAttribute("data-kind") === "current" ? (M.done[s.id] ? 2.35 : 2.65) : 1.85;
      var v = new M.T.Vector3(s.x, s.y + W.DECK + lift, s.z).project(M.camera);
      var x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
      var off = v.z > 1 || x < -40 || x > w + 40 || y < 0 || y > h + 20;
      el.style.visibility = off ? "hidden" : "visible";
      var room = sizes[n].half + 8, top = sizes[n].tall + 8;
      el.style.transform = "translate(" + Math.round(2 * room < w ? clamp(x, room, w - room) : w / 2) + "px," +
        Math.round(top < h ? clamp(y, top, h + 4) : y) + "px) translate(-50%,-100%)";
    });
  }

  /* -------------------------------------------------------- selection ------ */

  function highlight(i) {
    var s = ISLES[i], sel = M.world.select;
    if (!s) { sel.visible = false; return; }
    sel.visible = true;
    sel.position.set(s.x, s.y + W.DECK + 0.1, s.z);
    M.world.selectIn(s.part.id);
  }
  /* cut: put the camera there at once (nobody is watching it fly) */
  function select(i, how, cut) {
    if (!M || i < 0) return;
    var same = M.hot === i;
    M.hot = i;
    M.hotHow = how;
    highlight(M.hover > -1 ? M.hover : i);
    markList();
    if (!same || !M.viewKind || M.viewKind.i !== i) {
      if (cut) jump(isleView(i)); else flyTo(isleView(i));
    }
    request();
  }
  function unselect() {
    if (!M) return;
    M.hot = -1;
    highlight(M.hover);
    markList();
    request();
  }

  /* list → map. The world stands above the hero and the list below it, so at most sizes
     the two are not on screen together. A chapter focused in the list is always selected
     (its island ringed and labelled, the list item marked) and the camera brought to it:
     a flight when at least half the stage and the link are in view, else a cut, so a
     keyboard learner who tabs down the list and scrolls back up finds the world on the
     chapter they were on. (The focus event comes before the browser scrolls the link into
     view, so a link below the fold reads as out of view here and gets the cut.) A hover
     moves the world only while the stage is in view: sweeping the pointer down the list
     is not choosing a chapter, and a mouse user can see where the world is. */
  function stageInView() {
    if (!M) return false;
    var r = M.stage.getBoundingClientRect(), vh = window.innerHeight || document.documentElement.clientHeight;
    return r.height > 0 && Math.min(r.bottom, vh) - Math.max(r.top, 0) >= r.height / 2;
  }
  function linkInView(a) {
    var r = a.getBoundingClientRect(), vh = window.innerHeight || document.documentElement.clientHeight;
    return r.top >= 0 && r.bottom <= vh;
  }
  var hoverTimer = 0;
  host.addEventListener("focusin", function (e) {
    if (!M) return;
    var a = closest(e.target, ".stop-link");
    var li = a && closest(a, "li.stop");
    if (!li) return;
    var fi = isleIndex(li.getAttribute("data-chapter"));
    /* a pack has no island: clear what an earlier focus ringed rather than leave it */
    if (fi < 0) { if (M.hotHow === "focus" || M.hotHow === "hover") unselect(); return; }
    select(fi, "focus", !(linkInView(a) && stageInView()));
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
    if (i < 0 || i === M.hot) return;
    clearTimeout(hoverTimer);
    /* a short pause, so sweeping the pointer down the list does not whip the camera about */
    hoverTimer = setTimeout(function () { if (stageInView()) select(i, "hover"); }, 140);
  });
  host.addEventListener("mouseleave", function () {
    clearTimeout(hoverTimer);
    if (M && M.hotHow === "hover") unselect();
  });

  /* map → list: the pointer is tested against invisible stand-ins for the islands and the
     gates (src/world/regions.ts), since everything drawn is one merged mesh */
  function pickAt(clientX, clientY) {
    var r = M.canvas.getBoundingClientRect();
    var ndc = new M.T.Vector2((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    var ray = new M.T.Raycaster();
    ray.setFromCamera(ndc, M.camera);
    var hits = ray.intersectObjects(M.world.pick(), false);
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
    stir();
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
      stir();
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
    }
  }
  function sameHit(a, b) { return !!b && a.isle === b.isle && !!a.review === !!b.review; }
  /* a modified click opens a new tab, as it would on the list link */
  function go(href, e) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) window.open(href, "_blank");
    else window.location.href = href;
  }
  /* auxclick fires for any middle press and release on the canvas: as with the primary button,
     only one that starts and ends on the same island without travelling counts */
  function onAux(e) {
    if (!M || e.button !== 1) return;
    var pr = M.aux;
    M.aux = null;
    if (!pr || Math.abs(e.clientX - pr.x) > 6 || Math.abs(e.clientY - pr.y) > 6) return;
    var hit = pickAt(e.clientX, e.clientY), href = hit && sameHit(hit, pr.hit) && hrefFor(hit);
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
    var c = M.world.curve(), u = M.u, eps = 0.004;
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

  /* a Part's button flies to its region; the world is above the list, so the page stays where it is */
  function onPartButton(e) {
    if (!M) return;
    var b = closest(e.target, ".map3d-part");
    if (!b) return;
    var p = +b.getAttribute("data-p");
    flyTo(partView(p));
    Array.prototype.forEach.call(box.querySelectorAll(".map3d-part"), function (x) {
      if (x === b) x.setAttribute("data-on", "true"); else x.removeAttribute("data-on");
    });
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
      if (m.bloom) { try { m.bloom.dispose(); } catch (e) { /* already gone */ } m.bloom = null; }
      try { m.world.dispose(); } catch (e) { /* already gone */ }
      try { m.renderer.dispose(); } catch (e) { /* already gone */ }
      Array.prototype.forEach.call(host.querySelectorAll("li.stop[data-map-hot]"), function (li) {
        li.removeAttribute("data-map-hot");
      });
    }
    /* a Part button that had the focus goes with the box: the focus moves to the list
       (the current chapter, or the first), not to <body>, and the page stays where it is */
    var had = box.contains(document.activeElement);
    box.hidden = true;
    box.innerHTML = "";
    document.documentElement.removeAttribute("data-world");
    box.removeAttribute("data-drag");
    host.removeAttribute("data-map");
    if (had) {
      var to = host.querySelector('li.stop[data-state="current"] .stop-link') || host.querySelector(".stop-link");
      if (to) { try { to.focus({ preventScroll: true }); } catch (e) { to.focus(); } }
    }
  }

  /* the world's chunk, imported once (a second call shares the first) */
  var importing = null;
  function loadWorld() {
    if (!importing) {
      importing = import("../src/world/index.ts").then(function (ns) { W = ns; return true; }, function () { return false; });
    }
    return importing;
  }

  /* The bloom's two chunks (src/world/post.ts, src/vendor/three-post.js), imported only when
     the bloom is wanted (syncBloom: the high tier, dark theme), once; check-dist holds them to
     15 KB gzipped together. A failed import sets bloomOff, so it is not tried again until the
     quality preference changes (which clears it). */
  var bloomImports = null;
  function loadBloom() {
    if (!bloomImports) {
      bloomImports = Promise.all([import("../src/world/post.ts"), import("../src/vendor/three-post.js")]);
      bloomImports.catch(function () { bloomImports = null; });
    }
    return bloomImports;
  }

  function boot() {
    if (M || starting) return;
    var c = decide();
    /* the boot script's guess kept the box's place; the tier says otherwise */
    if (c.tier === "list") { document.documentElement.removeAttribute("data-world"); return; }
    starting = true;
    skeleton();
    /* Three.js and the world's own chunk are fetched side by side */
    Promise.all([BM3D.load(), loadWorld()]).then(function (r) {
      starting = false;
      var ok = r[0], world = r[1];
      if (M) return;
      var now2 = decide();
      if (!ok || !world || now2.tier === "list") {
        if (ok && !world) failed = "cdn";
        teardown();
        return;
      }
      try {
        build(now2);
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
  /* the gfx and map settings last seen, so a choice the learner makes lifts the watchdog's cap */
  function asked() { var p = prefs(); return String(p.gfx || "") + "/" + String(p.map || ""); }
  var lastAsked = asked();
  if (window.BMStore && window.BMStore.on) {
    window.BMStore.on(function (c) {
      if (!c) return;
      if (c.type === "prefs") {
        var seen = asked();
        if (seen !== lastAsked) { slowCap = null; bloomOff = false; bloomWhy = ""; }
        lastAsked = seen;
        var next = decide();
        if (next.tier === "list") { if (M || starting) teardown(); return; }
        if (M) applyTier(next);
        else boot();
        return;
      }
      if (!M) return;
      var K = window.BMStore.keys || {};
      if (c.type === "home" || c.type === "form" || c.type === "event" || c.type === "sync" || c.type === "reset" ||
          (c.type === "state" && (c.key === K.progress || c.key === K.last || c.key === K.game))) later();
    });
  }

  /* theme, the reading panel, calm mode and the sheet's Reduce motion live on <html>; the
     device's reduced motion on the media query. The world reads its colours from the
     panel's tokens (the islands) and the theme's (the regions), so its palette is read
     again when either changes */
  if (window.MutationObserver) {
    new MutationObserver(function (list) {
      if (!M) return;
      var theme = list.some(function (m) { return m.attributeName === "data-theme" || m.attributeName === "data-panel"; });
      /* bloom first: a flip to light drops it (and its lifted glow colours) before the repaint reads the palette */
      if (theme) { syncBloom(); M.world.repaint(); place(); if (M.bloom) M.bloom.setTheme(themeNow()); }
      /* Study mode hides the bosses: the marks are built again */
      if (list.some(function (m) { return m.attributeName === "data-calm"; })) later();
      if (still()) rest();
      if (M.flight && still()) jump(M.flight.v);
      request();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-panel", "data-calm", "data-motion"] });
  }
  if (reduceQuery) {
    var onReduce = function () {
      if (!M) return;
      if (still()) rest();
      if (M.flight && still()) jump(M.flight.v);
      request();
    };
    if (reduceQuery.addEventListener) reduceQuery.addEventListener("change", onReduce);
    else if (reduceQuery.addListener) reduceQuery.addListener(onReduce);
  }
  document.addEventListener("visibilitychange", function () {
    if (!M) return;
    /* the time spent hidden is not frame time */
    M.watch.reset();
    M.amb.last = 0;
    if (!document.hidden) wake();
  });

  /* a small handle for the checks in tools/ and for curious readers of the console */
  window.BMMap3D = {
    on: function () { return !!M; },
    why: function () {
      if (M) return "";
      var c = choice || decide();
      return failed || BM3D.why || (c.tier === "list" ? c.why : "");
    },
    info: function () {
      if (!M) return null;
      var tris = 0;
      M.scene.traverse(function (o) {
        if (!o.isMesh || !o.visible || !o.geometry) return;
        var g = o.geometry, n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
        tris += n * (o.isInstancedMesh ? o.count : 1);
      });
      /* calls: the draw calls of the last frame, as the renderer counted them; frames: frames drawn since the world was built */
      var ri = M.renderer.info && M.renderer.info.render;
      var pz = M.bloom ? M.bloom.size() : null;
      return { triangles: Math.round(tris), stones: M.world.stones(), current: M.cur > -1 ? ISLES[M.cur].id : null,
        hot: M.hot > -1 ? ISLES[M.hot].id : null, flying: !!M.flight, bobbing: !!M.bobbing,
        pixelRatio: M.renderer.getPixelRatio(), calls: M.bloom ? M.sceneCalls : ri ? ri.calls : null,
        post: { on: !!M.bloom, passes: M.bloom ? M.bloom.passes.length : 0, pixels: pz ? pz.width * pz.height : 0, strength: M.bloom ? +M.bloom.strength().toFixed(3) : 0, off: bloomOff, why: M.bloom ? "" : bloomReason() }, isles: M.world.kinds(),
        tier: M.tier, reason: choice ? choice.why : "", ambient: !!M.budget.ambient, budget: M.budget, frames: M.frames,
        ring: "#" + M.world.select.material.color.getHexString(),
        fog: M.scene.fog ? [+M.scene.fog.near.toFixed(2), +M.scene.fog.far.toFixed(2)] : null };
    },
    /* for the check that the fog shows (tools/game/map.test.js): the same view drawn at
       once, without the fog (false) or with it (true), so the canvas can be read in the
       same task; nothing else switches it */
    fog: function (on) {
      if (!M) return false;
      M.noFog = !on;
      place();
      render();
      return true;
    },
    /* for the check that the bloom leaves the non-glow pixels alone (tools/game/map.test.js): the same
       view drawn once through the bloom (true) or straight to the canvas (false), so it can be read in
       the same task; false when there is no bloom to compare */
    draw: function (viaBloom) {
      if (!M || !M.bloom) return false;
      if (viaBloom) M.bloom.render(); else M.renderer.render(M.scene, M.camera);
      /* a later frame draws the map as it should look again (an idle map asks for none itself) */
      request();
      return true;
    },
    /* where an island sits on screen, in client pixels */
    where: function (id) {
      var i = isleIndex(id);
      if (!M || i < 0) return null;
      var s = ISLES[i], r = M.canvas.getBoundingClientRect();
      var v = new M.T.Vector3(s.x, s.y + W.DECK, s.z).project(M.camera);
      return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
    }
  };

  boot();
})();
