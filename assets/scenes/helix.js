/* ===========================================================================
   Basic Mathematics — scene "helix" (Chapter 11, §11.3 "The graphs")
   The point (θ, cos θ, sin θ), with θ laid out in radians along the first
   axis, traces one curve: a helix of two turns. Seen end-on it is the unit
   circle; its shadow on the back wall (the side view) is the graph of sine,
   its shadow on the floor (the view from above) the graph of cosine. Move θ
   with the slider or by dragging the point; mark angles to leave dots behind.
   =========================================================================== */
(function () {
  "use strict";
  if (!window.BM3D || !window.BM3D.define) return;
  var V = window.BM3D.V;
  var RAD = Math.PI / 180;
  var MAX = 720, STEP = 15;
  var L = MAX * RAD;          /* length of the θ axis: two turns, 4π */
  var WALL = 1.6;             /* the back wall is the plane y = WALL */
  var FLOOR = -1.6;           /* the floor is the plane z = FLOOR */
  var EXT = 1.3;              /* half the height of the wall and half the width of the floor */
  /* the box the camera keeps in view, whatever the angle */
  var BOX = [[-0.15, -WALL, FLOOR], [L + 0.75, WALL, 1.6]];
  var HOME = [-72, 18];

  function at(deg) { return [deg * RAD, Math.cos(deg * RAD), Math.sin(deg * RAD)]; }
  function onWall(p) { return [p[0], WALL, p[2]]; }
  function onFloor(p) { return [p[0], p[1], FLOOR]; }
  function snap(deg) { return Math.max(0, Math.min(MAX, Math.round(deg / STEP) * STEP)); }

  function minus(t) { return t.charAt(0) === "-" ? "−" + t.slice(1) : t; }
  function round3(v) {
    var r = Math.round(v * 1000) / 1000;
    return minus(String(r === 0 ? 0 : r));
  }
  /* sin of a multiple of 15°: exact from the table of §11.2 when the reference angle is
     0°, 30°, 45°, 60° or 90°, else a decimal */
  var TABLE = { 0: "0", 30: "1/2", 45: "√2/2", 60: "√3/2", 90: "1" };
  function sinText(deg) {
    var a = ((deg % 360) + 360) % 360;
    var ref = a <= 90 ? a : a <= 180 ? 180 - a : a <= 270 ? a - 180 : 360 - a;
    var v = Math.sin(deg * RAD);
    if (TABLE[ref] === undefined) return "≈ " + round3(v);
    var t = TABLE[ref];
    if (t === "0") return "0";
    var s = (a > 180 ? "−" : "") + t;
    return t.indexOf("√") >= 0 ? s + " ≈ " + round3(v) : s;
  }
  function cosText(deg) { return sinText(deg + 90); }
  /* "√3/2 ≈ 0.866" → "√3/2"; "≈ 0.259" → "0.259" (inside coordinates) */
  function short(t) { return t.indexOf("≈") === 0 ? t.slice(2) : t.split(" ≈")[0]; }
  /* "= √3/2 ≈ 0.866", "≈ 0.259" (after a name) */
  function eq(t) { return t.indexOf("≈") === 0 ? t : "= " + t; }
  /* 60 → "π/3", 450 → "5π/2" */
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  function radText(deg) {
    if (!deg) return "0";
    var g = gcd(deg, 180), n = deg / g, d = 180 / g;
    return (n === 1 ? "" : n) + "π" + (d === 1 ? "" : "/" + d);
  }
  function marksOf(s) { return (s.marks || []).slice().sort(function (a, b) { return a - b; }); }
  function marksText(s) {
    var m = marksOf(s);
    return m.length ? m.map(function (d) { return d + "°"; }).join(", ") : "none yet";
  }
  /* add or remove a mark at the current θ (the "mark" button, and the smoke-test cases) */
  function toggle(s) {
    var m = marksOf(s), i = m.indexOf(s.t);
    if (i >= 0) m.splice(i, 1); else m.push(s.t);
    s.marks = m.sort(function (a, b) { return a - b; });
  }

  /* Which of the three telling views the camera is in: "end" (down the θ axis), "side"
     (along the cos axis: the wall face-on) or "above" (along the sin axis: the floor
     face-on), within about 5°; "" for any other angle. */
  function lookOf(cam) {
    var e = cam.e;
    if (Math.abs(e[0]) > 0.996) return "end";
    if (Math.abs(e[1]) > 0.996) return "side";
    if (Math.abs(e[2]) > 0.996) return "above";
    return "";
  }
  /* the axes that point at the viewer: their labels would all land on one spot */
  function edgeOn(cam) {
    return [Math.abs(cam.e[0]) > 0.95, Math.abs(cam.e[1]) > 0.95, Math.abs(cam.e[2]) > 0.95];
  }
  /* centre and radius that fit BOX in the 660 × 420 stage for the camera's current angle */
  function frameFor(cam) {
    var lo = [1e9, 1e9], hi = [-1e9, -1e9], mid = V.scale(V.add(BOX[0], BOX[1]), 0.5);
    for (var c = 0; c < 8; c++) {
      var p = [BOX[c & 1 ? 1 : 0][0], BOX[c & 2 ? 1 : 0][1], BOX[c & 4 ? 1 : 0][2]];
      var d = V.sub(p, mid), x = V.dot(d, cam.right), y = V.dot(d, cam.up);
      lo[0] = Math.min(lo[0], x); hi[0] = Math.max(hi[0], x);
      lo[1] = Math.min(lo[1], y); hi[1] = Math.max(hi[1], y);
    }
    /* the stage shows 2.2·radius vertically and 660/420 times that across */
    var r = Math.max((hi[1] - lo[1]) / (2.2 * 0.76), (hi[0] - lo[0]) / (2.2 * 0.95 * 660 / 420));
    return { center: mid, radius: r };
  }

  /* The stage's label would name the point by its world coordinates: θ in radians and,
     in quiz mode, the very cos θ and sin θ the readout hides. So it is worded here:
     θ in degrees, as on the slider, and the two shadows only outside quiz mode. */
  var NAME = "the point";
  function pointText(s, quiz) {
    var t = NAME + " at θ = " + s.t + "°";
    return quiz ? t : t + ", cos θ " + eq(cosText(s.t)) + ", sin θ " + eq(sinText(s.t));
  }
  window.BM3D.define("helix", {
    label: "The helix traced by the point theta, cos theta, sin theta, with its shadows on a back wall and on the floor",
    sibling: "unitcircle",
    note: "Slide θ, or drag the point along its guide line; drag anywhere else to turn the picture, or pick a view. " +
      "From the keyboard: Tab to the picture and move the point with the arrow keys; Space switches to turning " +
      "the view, and Home resets it.",
    view: {
      az: HOME[0], el: HOME[1], center: [L / 2, 0, 0], radius: 4.6,
      bounds: BOX,
      presets: [["3D", HOME[0], HOME[1]], ["end-on", 0, 0], ["from the side", -90, 0], ["from above", -90, 90]]
    },
    state: { t: 60, marks: [], look: "" },

    controls: function (api, s) {
      var cam = api.cam, set0 = cam.set, key = "";
      /* Keep the helix filling the stage from every angle, and note which view the camera
         is in, so the missions, the labels and the readout can follow it. The framework
         redraws only on state changes, so the camera's own moves are caught here. */
      function viewKey() { return s.look + ":" + edgeOn(cam).join(","); }
      function follow() {
        var f = frameFor(cam);
        cam.frame(f.center, f.radius);
        s.look = lookOf(cam);
        var k = viewKey();
        if (k === key) return;
        var first = !key;
        key = k;
        if (first) return;
        api.update();
        var host = api.controls.parentNode;
        if (host && host.__missions) host.__missions.check();
      }
      cam.set = function (az, el) {
        set0.call(cam, az, el);
        follow();
      };
      follow();

      api.slider("θ", 0, MAX, STEP, "t", function (v) { return v + "°"; });
      api.handle({
        name: NAME,
        tone: "curve",
        at: function (s) { return at(s.t); },
        say: pointText,
        axis: [1, 0, 0],
        step: STEP * RAD,
        move: function (s, p) { s.t = snap(p[0] / RAD); }
      });
      api.button(function (s) {
        return (marksOf(s).indexOf(s.t) >= 0 ? "unmark " : "mark ") + s.t + "°";
      }, function (s) { toggle(s); });
      api.button("clear marks", function (s) { s.marks = []; }, {
        disabled: function (s) { return !(s.marks && s.marks.length); }
      });
    },

    draw: function (g, s, api) {
      var quiz = api.quiz(), cam = api.cam, hide = edgeOn(cam), look = s.look;
      var P = at(s.t), Pw = onWall(P), Pf = onFloor(P), deg, k;

      /* the back wall and the floor, with lines at ±1 and every quarter turn */
      g.face([[0, WALL, -EXT], [L, WALL, -EXT], [L, WALL, EXT], [0, WALL, EXT]], { tone: "faceB", alpha: 0.32 });
      g.face([[0, -EXT, FLOOR], [L, -EXT, FLOOR], [L, EXT, FLOOR], [0, EXT, FLOOR]], { tone: "faceC", alpha: 0.32 });
      [-1, 0, 1].forEach(function (v) {
        g.seg([0, WALL, v], [L, WALL, v], { tone: "grid", w: 1 });
        g.seg([0, v, FLOOR], [L, v, FLOOR], { tone: "grid", w: 1 });
      });
      for (deg = 90; deg <= MAX; deg += 90) {
        g.seg([deg * RAD, WALL, -EXT], [deg * RAD, WALL, EXT], { tone: "grid", w: 1 });
        g.seg([deg * RAD, -EXT, FLOOR], [deg * RAD, EXT, FLOOR], { tone: "grid", w: 1 });
      }

      g.axes({ min: [0, -1.4, -1.4], max: [L + 0.75, 1.4, 1.4],
        labels: [hide[0] ? "" : "θ", hide[1] ? "" : "cos θ", hide[2] ? "" : "sin θ"] });
      /* the quarter turns, in degrees, along the front edge of the floor */
      if (!hide[0]) {
        for (deg = 90; deg <= MAX; deg += 90) {
          g.label([deg * RAD, -EXT, FLOOR], deg + "°", { tone: "muted", size: 0.85, weight: 500, dy: 16,
            minor: deg % 180 !== 0 });
        }
      }

      /* the unit circle at θ = 0, where the helix starts */
      var ring = [];
      for (k = 0; k <= 72; k++) ring.push([0, Math.cos(k * 5 * RAD), Math.sin(k * 5 * RAD)]);
      g.path(ring, { tone: "axis", w: 1.25, dash: [4, 4] });

      /* the two shadows, then the helix: the part already travelled thick, the rest thin and
         dashed. The rest is where the point is going, so it keeps its full colour (a see-
         through one fell under 3:1 against the stage). */
      function curve(map, tone, wDone, wLeft) {
        var pts = [], d;
        for (d = 0; d <= MAX; d += 5) pts.push(map(at(d)));
        for (d = 0; d < MAX / 5; d++) {
          var done = (d + 1) * 5 <= s.t;
          g.seg(pts[d], pts[d + 1], done ? { tone: tone, w: wDone } : { tone: tone, w: wLeft, dash: [3, 3] });
        }
      }
      curve(onWall, "curve2", 2.5, 1.75);
      curve(onFloor, "curve3", 2.5, 1.75);
      curve(function (p) { return p; }, "curve", 3.5, 2);

      /* the point's distance 1 from the axis, and the two lines of light to its shadows */
      g.seg([P[0], 0, 0], P, { tone: "ink", w: 1.5 });
      g.seg(P, Pw, { tone: "curve2", w: 1.5, dash: [5, 4] });
      g.seg(P, Pf, { tone: "curve3", w: 1.5, dash: [5, 4] });
      g.dot([P[0], 0, 0], { r: 3, tone: "ink" });

      /* the marks, each with its two shadows */
      marksOf(s).forEach(function (d) {
        var M = at(d);
        g.dot(onWall(M), { r: 3.5, tone: "curve2" });
        g.dot(onFloor(M), { r: 3.5, tone: "curve3" });
        g.dot(M, { r: 4.5, tone: "ink" });
      });

      g.dot(Pw, { r: 5, tone: "curve2" });
      g.dot(Pf, { r: 5, tone: "curve3" });

      /* Labels. From the side the wall shadow lies on the point and the floor is edge-on, so
         only the wall shadow is labelled; from above, likewise the floor shadow. In the
         slanted views the three sit close together, so on a phone-width stage they give way
         to the axis names (θ is on the slider). */
      var sn = sinText(s.t), cs = cosText(s.t);
      var sinL = quiz ? "sin θ" : "sin θ " + (sn.indexOf("≈") === 0 ? sn : "= " + short(sn));
      var cosL = quiz ? "cos θ" : "cos θ " + (cs.indexOf("≈") === 0 ? cs : "= " + short(cs));
      if (look === "end") {
        /* outside the circle, away from the radius and the two lines of light */
        var c = Math.cos(s.t * RAD), n = Math.sin(s.t * RAD);
        g.label(P, "θ = " + s.t + "°", { dx: 14 * c, dy: -16 * n + (n < 0 ? 14 : 0), weight: 650,
          anchor: c > 0.3 ? "start" : c < -0.3 ? "end" : "middle" });
        g.label(Pw, sinL, { tone: "curve2", dx: 10, dy: 5, anchor: "start", weight: 650 });
        g.label(Pf, cosL, { tone: "curve3", dy: 22, weight: 650 });
      } else {
        /* beside the point, on the side away from the nearer end of the stage */
        var side = s.t <= 600 ? 1 : -1, anchor = side > 0 ? "start" : "end";
        if (look === "side") {
          g.label(Pw, sinL, { tone: "curve2", dx: 12 * side, dy: -12, anchor: anchor, weight: 650 });
        } else if (look === "above") {
          g.label(Pf, cosL, { tone: "curve3", dx: 12 * side, dy: -12, anchor: anchor, weight: 650 });
        } else {
          g.label(P, "θ = " + s.t + "°", side > 0 ? { dx: -14, dy: -8, anchor: "end", weight: 650, minor: true }
            : { dx: -16, dy: 8, anchor: "end", weight: 650, minor: true });
          g.label(Pw, sinL, { tone: "curve2", dx: 10 * side, dy: side > 0 ? -8 : -12, anchor: anchor, weight: 650, minor: true });
          g.label(Pf, cosL, { tone: "curve3", dx: 10 * side, dy: -6, anchor: anchor, weight: 650, minor: true });
        }
      }
    },

    say: function (s, quiz) {
      if (quiz) return "θ = " + s.t + "°. Marked: " + marksText(s) + ".";
      var c = cosText(s.t), n = sinText(s.t);
      var view = s.look === "end" ? "End-on, both turns lie on top of each other: the unit circle."
        : s.look === "side" ? "From the side, the helix and its wall shadow are one curve: the graph of sin θ."
          : s.look === "above" ? "From above, the helix and its floor shadow are one curve: the graph of cos θ."
            : "";
      return "<b>θ = " + s.t + "°</b>, which is " + radText(s.t) + " along the axis. The point (θ, cos θ, sin θ) = (" +
        radText(s.t) + ", " + short(c) + ", " + short(n) + ").<br>" +
        "Wall shadow: sin " + s.t + "° " + eq(n) + ". Floor shadow: cos " + s.t + "° " + eq(c) +
        ", the same as sin " + (s.t + 90) + "°: the floor shadow is the wall shadow a quarter turn on.<br>" +
        (view ? view + " " : "") + "Marked: " + marksText(s) + ".";
    },

    answer: function (s, ask) {
      if (ask === "marks") return marksOf(s).join(",");
      return s.t;
    },

    missions: [
      { text: "Look along the axis: find the end-on view.", test: function (s) { return s.look === "end"; } },
      { text: "Find the view that shows the cosine graph.", test: function (s) { return s.look === "above"; } },
      { text: "Move to where the wall shadow peaks for the second time.", test: function (s) { return s.t === 450; } }
    ],

    cases: [
      { set: { t: 450 }, answer: "450" },
      { set: { t: 60 }, answer: "60", not: "450" },
      { set: function (s) { s.t = 225; toggle(s); s.t = 45; toggle(s); }, ask: "marks", answer: "45,225", compare: "set" },
      { set: function (s) { s.t = 45; toggle(s); }, ask: "marks", not: "45,225", compare: "set" },
      { set: function (s) { s.t = 45; toggle(s); s.t = 225; toggle(s); s.t = 405; toggle(s); }, ask: "marks", not: "45,225", compare: "set" },
      { set: function (s) { s.t = 45; toggle(s); s.t = 135; toggle(s); s.t = 135; toggle(s); s.t = 225; toggle(s); },
        ask: "marks", answer: "45,225", compare: "set" },
      { set: function (s) { s.t = 90; toggle(s); s.t = 450; toggle(s); }, ask: "marks", answer: "90,450", compare: "set" },
      { set: function (s) { s.t = 90; toggle(s); s.t = 270; toggle(s); }, ask: "marks", not: "90,450", compare: "set" },
      { set: {}, ask: "marks", not: "90,450", compare: "set" }
    ],

    /* once solved, turn to the view that shows the answer: end-on, the two equal-shadow
       marks sit on the diagonal of the circle; from the side, the peaks are the crests */
    reveal: function (api) {
      var m = marksOf(api.state);
      if (m.indexOf(45) >= 0 || m.indexOf(225) >= 0) api.view(0, 0, true);
      else api.view(-90, 0, true);
    }
  });
})();
