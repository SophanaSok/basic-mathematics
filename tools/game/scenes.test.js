#!/usr/bin/env node
/* Headless Chromium checks of the 3D scene stages (assets/scenes3d.js), over file:// URLs.
     BM_PLAYWRIGHT_FROM=~/dev/json-data-drift-analyzer/ node tools/game/scenes.test.js
   Every network request is aborted, so the stages run on the SVG painter; input and
   colours are the same for both painters (the GL one draws the same primitives).

   1. the Reset view button inside a stage works from the keyboard: Enter and Space press
      it rather than cycling the stage's selection; modified arrows are left to the browser
   2. a vertical swipe that starts on a stage scrolls the page and leaves the view as it
      was; a sideways swipe still turns it; a turn the browser cancels is undone
   3. the arrow keys move a handle the way they point on the screen, under any view, for
      every handle of every scene (and the stage's label names the rails they use); a held
      key keeps going the same way, even along a rail that turns with its handle (spheretri)
   4. colours, read from getComputedStyle in both themes, in every instance of a scene
      (exercise copies too): the seams between faces stand 3:1 off every face they edge,
      and boxcount's off the stage too; a ball's outline 3:1 off the stage; every line,
      label and dot 3:1 off the stage, a see-through line taken as it blends there */
"use strict";
const path = require("path");
const { createRequire } = require("module");

const ROOT = path.resolve(__dirname, "../..");
const FROM = process.env.BM_PLAYWRIGHT_FROM || path.join(process.env.HOME || "", "dev/json-data-drift-analyzer/");
const { chromium } = createRequire(FROM.endsWith("/") ? FROM : FROM + "/")("playwright");

const SCENES = {
  boxcount: "parts/1-algebra/01-numbers.html",
  planes3: "parts/1-algebra/02-linear-equations.html",
  spheretri: "parts/2-geometry/05-distance-and-angles.html",
  flipbook: "parts/2-geometry/06-isometries.html",
  scale3: "parts/2-geometry/07-area.html",
  dist3: "parts/3-coordinates/08-coordinates.html",
  sphereslice: "parts/3-coordinates/08-coordinates.html",
  helix: "parts/3-coordinates/11-trigonometry.html",
  sumsquares: "parts/4-topics/15-induction-and-summations.html",
  det3: "parts/4-topics/16-determinants.html",
  rowops: "parts/4-topics/16-determinants.html"
};

const url = (p) => "file://" + path.join(ROOT, p);
let fails = 0, passes = 0;
function check(cond, what) {
  if (cond) passes++;
  else { fails++; console.error("FAIL " + what); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(browser, opts) {
  opts = opts || {};
  const context = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 }, opts.context || {}));
  await context.route(/^(https?|wss?):/, (r) => r.abort());
  await context.addInitScript((theme) => {
    try {
      localStorage.setItem("bm.lesson.v1", '{"mode":"page"}');
      if (theme) localStorage.setItem("bm.theme", JSON.stringify(theme));
    } catch (e) { /* fine */ }
  }, opts.theme || null);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page, errors };
}
async function scene(page, name) {
  await page.goto(url(SCENES[name]));
  await page.waitForFunction((n) => { const h = document.querySelector('[data-widget="' + n + '"]'); return h && h.__scene; }, name);
}
const H = (n) => '[data-widget="' + n + '"]';
const view = (page, name) => page.evaluate((n) => { const c = document.querySelector('[data-widget="' + n + '"]').__scene.cam; return { az: c.az, el: c.el }; }, name);
const label = (page, name) => page.evaluate((n) => document.querySelector('[data-widget="' + n + '"] .s3d-stage').getAttribute("aria-label"), name);

/* ------------------------------------------------- 1. the Reset view button -- */
async function resetButton(browser) {
  const { context, page, errors } = await open(browser, { context: { reducedMotion: "reduce" } });
  await scene(page, "dist3");
  const stage = page.locator(H("dist3") + " .s3d-stage").first();
  await stage.scrollIntoViewIfNeeded();
  await stage.focus();
  const home = await view(page, "dist3");
  await page.keyboard.press("Space");
  const viewLabel = await label(page, "dist3");
  check(/^.*Turning the view/.test(viewLabel), "Space on the stage selects the view (" + viewLabel + ")");
  for (const key of ["Enter", "Space"]) {
    await stage.focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    const turned = await view(page, "dist3");
    check(Math.abs(turned.az - home.az - 10) < 1e-6, "two ArrowLeft turn the view 10° (" + JSON.stringify([home, turned]) + ")");
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement.className);
    check(/s3d-reset/.test(focused), "Tab from the stage reaches the Reset view button (" + focused + ")");
    await page.keyboard.press(key);
    await wait(100);
    const after = await view(page, "dist3");
    check(Math.abs(after.az - home.az) < 1e-6 && Math.abs(after.el - home.el) < 1e-6,
      key + " on the Reset view button resets the view (" + JSON.stringify([home, after]) + ")");
    const now = await label(page, "dist3");
    check(now === viewLabel, key + " on the Reset view button leaves the stage's selection alone (" + now + ")");
  }
  /* arrows pressed on the button are not the stage's either */
  await page.keyboard.press("ArrowLeft");
  check(JSON.stringify(await view(page, "dist3")) === JSON.stringify(home), "ArrowLeft on the Reset view button does not turn the view");
  /* browser shortcuts pass through the stage */
  await stage.focus();
  for (const key of ["Alt+ArrowLeft", "Control+ArrowRight", "Meta+ArrowUp"]) {
    const before = await view(page, "dist3");
    const prevented = await page.evaluate((k) => {
      const st = document.querySelector('[data-widget="dist3"] .s3d-stage');
      const ev = new KeyboardEvent("keydown", { key: k.split("+")[1], altKey: /Alt/.test(k), ctrlKey: /Control/.test(k), metaKey: /Meta/.test(k), bubbles: true, cancelable: true });
      st.dispatchEvent(ev);
      return ev.defaultPrevented;
    }, key);
    check(!prevented && JSON.stringify(await view(page, "dist3")) === JSON.stringify(before), key + " on the stage is left to the browser");
  }
  check(!errors.length, "no page errors in the reset-button check (" + errors.join("; ") + ")");
  await context.close();
}

/* ------------------------------------------------------- 2. touch swipes -- */
/* an empty point of the stage, well away from every handle and the tools, in client px */
const EMPTY = "(" + function (n) {
  var host = document.querySelector('[data-widget="' + n + '"]'), sc = host.__scene, st = sc.stage.el;
  var r = st.getBoundingClientRect(), k = Math.min(r.width / 660, r.height / 420);
  var spots = sc.handles.map(function (hd) { return sc.cam.project(hd.at(sc.state)); });
  for (var fy = 0.3; fy < 0.95; fy += 0.05) {
    for (var fx = 0.08; fx < 0.6; fx += 0.04) {
      var x = r.left + r.width * fx, y = r.top + r.height * fy;
      var lx = (x - r.left - (r.width - 660 * k) / 2) / k, ly = (y - r.top - (r.height - 420 * k) / 2) / k;
      var near = spots.some(function (q) { return Math.sqrt((q[0] - lx) * (q[0] - lx) + (q[1] - ly) * (q[1] - ly)) < 60; });
      var hit = document.elementFromPoint(x, y);
      if (!near && hit && st.contains(hit) && !hit.closest(".s3d-tools")) return { x: x, y: y };
    }
  }
  return null;
} + ")";
async function swipes(browser) {
  const { context, page, errors } = await open(browser, { context: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } });
  const cdp = await context.newCDPSession(page);
  async function swipe(pt, ddx, ddy) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pt.x, y: pt.y }] });
    for (let i = 1; i <= 40; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: pt.x + ddx * i, y: pt.y + ddy * i }] });
      await wait(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await wait(400);
  }
  for (const name of ["dist3", "sumsquares"]) {
    await scene(page, name);
    await page.evaluate((n) => document.querySelector('[data-widget="' + n + '"] .s3d-stage').scrollIntoView({ block: "center", behavior: "instant" }), name);
    await wait(300);
    for (let n = 1; n <= 3; n++) {
      await page.evaluate((n) => document.querySelector('[data-widget="' + n + '"] .s3d-stage').scrollIntoView({ block: "center", behavior: "instant" }), name);
      await wait(200);
      const pt = await page.evaluate(EMPTY + "(" + JSON.stringify(name) + ")");
      check(!!pt, name + ": an empty point on the stage to swipe from");
      if (!pt) break;
      const before = await view(page, name), y0 = await page.evaluate(() => window.scrollY);
      await swipe(pt, 0, -3);
      const after = await view(page, name), y1 = await page.evaluate(() => window.scrollY);
      check(y1 > y0 + 40, name + ": vertical swipe " + n + " scrolls the page (" + y0 + " → " + y1 + ")");
      check(JSON.stringify(after) === JSON.stringify(before), name + ": vertical swipe " + n + " leaves the view as it was (" + JSON.stringify([before, after]) + ")");
    }
    await page.evaluate((n) => document.querySelector('[data-widget="' + n + '"] .s3d-stage').scrollIntoView({ block: "center", behavior: "instant" }), name);
    await wait(200);
    const pt = await page.evaluate(EMPTY + "(" + JSON.stringify(name) + ")");
    const before = await view(page, name);
    await swipe(pt, 3, 0);
    const after = await view(page, name);
    check(Math.abs(after.az - before.az) > 20, name + ": a sideways swipe still turns the view (" + JSON.stringify([before, after]) + ")");
    check(!(await page.locator(H(name) + " .s3d-stage").first().getAttribute("data-drag")), name + ": no drag left behind after the swipes");
  }
  /* a turn under way when the browser cancels the pointer is put back */
  const undone = await page.evaluate(() => {
    var st = document.querySelector('[data-widget="sumsquares"] .s3d-stage'), cam = document.querySelector('[data-widget="sumsquares"]').__scene.cam;
    var r = st.getBoundingClientRect(), x = r.left + 20, y = r.top + r.height - 20, a0 = cam.az, e0 = cam.el;
    function ev(t, dx, dy) { st.dispatchEvent(new PointerEvent(t, { clientX: x + dx, clientY: y + dy, pointerId: 7, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true })); }
    ev("pointerdown", 0, 0); ev("pointermove", 30, -4); ev("pointermove", 60, -6);
    var mid = cam.az;
    ev("pointercancel", 60, -6);
    return { turned: mid !== a0, back: cam.az === a0 && cam.el === e0, drag: st.getAttribute("data-drag") };
  });
  check(undone.turned && undone.back && !undone.drag, "a cancelled touch turn is undone (" + JSON.stringify(undone) + ")");
  /* a small vertical wobble before the browser decides is not a turn either */
  const wobble = await page.evaluate(() => {
    var st = document.querySelector('[data-widget="sumsquares"] .s3d-stage'), cam = document.querySelector('[data-widget="sumsquares"]').__scene.cam;
    var r = st.getBoundingClientRect(), x = r.left + 20, y = r.top + r.height - 20, a0 = cam.az, e0 = cam.el, seen = [];
    function ev(t, dx, dy) { st.dispatchEvent(new PointerEvent(t, { clientX: x + dx, clientY: y + dy, pointerId: 8, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true })); }
    ev("pointerdown", 0, 0);
    [[1, -3], [2, -6], [2, -9], [3, -14], [3, -20]].forEach(function (d) { ev("pointermove", d[0], d[1]); seen.push(cam.el); });
    ev("pointerup", 3, -20);
    return { still: cam.az === a0 && cam.el === e0 && seen.every(function (v) { return v === e0; }) };
  });
  check(wobble.still, "a mostly vertical touch drag never tilts the view, even before the browser takes it");
  /* a mouse still turns the view straight away, vertically too */
  const mouse = await page.evaluate(() => {
    var st = document.querySelector('[data-widget="sumsquares"] .s3d-stage'), cam = document.querySelector('[data-widget="sumsquares"]').__scene.cam;
    var r = st.getBoundingClientRect(), x = r.left + 20, y = r.top + r.height - 20, e0 = cam.el;
    function ev(t, dx, dy) { st.dispatchEvent(new PointerEvent(t, { clientX: x + dx, clientY: y + dy, pointerId: 9, pointerType: "mouse", button: 0, isPrimary: true, bubbles: true, cancelable: true })); }
    ev("pointerdown", 0, 0); ev("pointermove", 0, 6); ev("pointerup", 0, 6);
    return cam.el !== e0;
  });
  check(mouse, "a mouse drag still tilts the view at once");
  check(!errors.length, "no page errors in the swipe check (" + errors.join("; ") + ")");
  await context.close();
}

/* ------------------------------------------------------ 3. arrow keys -- */
const KEYS = "(" + function (n, views) {
  var host = document.querySelector('[data-widget="' + n + '"]'), sc = host.__scene, st = sc.stage.el, cam = sc.cam;
  var out = { moved: 0, wrong: [], labels: [] };
  function key(k) { st.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); }
  function live() { return sc.handles.filter(function (hd) { return hd.enabled(sc.state); }); }
  var DIR = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  var BACK = { ArrowRight: "ArrowLeft", ArrowLeft: "ArrowRight", ArrowUp: "ArrowDown", ArrowDown: "ArrowUp" };
  var count = live().length;
  for (var i = 0; i < count; i++) {
    views.forEach(function (v) {
      sc.api.view(v[0], v[1], false);
      var hd = live()[i];
      if (!hd) return;
      out.labels.push(st.getAttribute("aria-label"));
      Object.keys(DIR).forEach(function (k) {
        /* the move along the handle's rails, seen on the screen: free of any re-framing
           (view.fit) and of a curve the handle follows off its rail (helix) */
        var axes = hd.axes.map(function (a) { var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); return [a[0] / l, a[1] / l, a[2] / l]; });
        var p0 = hd.at(sc.state).slice();
        key(k);
        var p1 = hd.at(sc.state), dp = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], w = [0, 0, 0];
        axes.forEach(function (a) {
          var t = dp[0] * a[0] + dp[1] * a[1] + dp[2] * a[2];
          w = [w[0] + a[0] * t, w[1] + a[1] * t, w[2] + a[2] * t];
        });
        var m = [w[0] * cam.right[0] + w[1] * cam.right[1] + w[2] * cam.right[2], -(w[0] * cam.up[0] + w[1] * cam.up[1] + w[2] * cam.up[2])];
        var L = Math.sqrt(m[0] * m[0] + m[1] * m[1]);
        if (L > 0.01) {
          out.moved++;
          var d = DIR[k], along = m[0] * d[0] + m[1] * d[1], across = Math.abs(d[0] ? m[0] : m[1]);
          /* the key's direction, unless the rail is nearly square to it */
          if (!(along > 0 || across < 0.27 * L)) out.wrong.push(hd.name + " " + k + " at az " + v[0] + " el " + v[1] + ": moved " + m.map(function (c) { return c.toFixed(2); }));
          key(BACK[k]);
        }
      });
    });
    key(" ");
  }
  return out;
} + ")";
async function arrows(browser) {
  const { context, page, errors } = await open(browser, { context: { reducedMotion: "reduce" } });
  const views = [[-150, 10], [-100, 40], [-62, 24], [-20, 70], [30, 18], [75, 5], [120, 35], [170, 55]];
  let moved = 0;
  for (const name of Object.keys(SCENES)) {
    await scene(page, name);
    const r = await page.evaluate(KEYS + "(" + JSON.stringify(name) + "," + JSON.stringify(views) + ")");
    moved += r.moved;
    check(!r.wrong.length, name + ": every arrow key moves the handle the way it points (" + r.wrong.slice(0, 4).join("; ") + ")");
  }
  check(moved > 150, "the arrow-key sweep moved handles often enough to mean something (" + moved + ")");

  /* the finding's own cases: planes3 at its home view, det3 turned to az 150 */
  await scene(page, "planes3");
  const planes = await page.evaluate(() => {
    var host = document.querySelector('[data-widget="planes3"]'), sc = host.__scene, st = sc.stage.el;
    var hd = sc.handles.filter(function (h) { return h.enabled(sc.state); })[0];
    var p0 = hd.at(sc.state).slice(), d0 = JSON.stringify(sc.state), up = sc.cam.up;
    st.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    var p1 = hd.at(sc.state);
    /* screen y grows downward */
    return { dy: -((p1[0] - p0[0]) * up[0] + (p1[1] - p0[1]) * up[1] + (p1[2] - p0[2]) * up[2]), changed: d0 !== JSON.stringify(sc.state) };
  });
  check(planes.changed && planes.dy < 0, "planes3 at home: ArrowUp moves plane 3's handle up the screen (" + JSON.stringify(planes) + ")");
  await scene(page, "det3");
  const det = await page.evaluate(() => {
    var host = document.querySelector('[data-widget="det3"]'), sc = host.__scene, st = sc.stage.el;
    sc.api.view(150, 24, false);
    var hd = sc.handles.filter(function (h) { return h.enabled(sc.state); })[0];
    var p0 = hd.at(sc.state).slice(), rt = sc.cam.right;
    st.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    var at = hd.at(sc.state);
    return { dx: (at[0] - p0[0]) * rt[0] + (at[1] - p0[1]) * rt[1] + (at[2] - p0[2]) * rt[2], whole: at.every(function (v) { return Math.abs(v - Math.round(v)) < 1e-9; }), label: st.getAttribute("aria-label") };
  });
  check(det.dx > 0 && det.whole, "det3 turned to az 150: ArrowRight moves the tip right, still on whole numbers (" + JSON.stringify(det) + ")");
  check(/Left and right arrows move it along y, up and down along z, Page Up and Page Down along x/.test(det.label),
    "det3 turned to az 150: the label names the rails the keys now use (" + det.label + ")");
  await scene(page, "dist3");
  const home = await label(page, "dist3");
  check(/Left and right arrows move it along x, up and down along z, Page Up and Page Down along y/.test(home),
    "dist3 at home: ←→ along x, ↑↓ along z, Page Up/Down along y, as before (" + home + ")");

  /* spheretri's B runs on the tangent at B, which turns as B moves. Held at the home view,
     → used to carry B to 120° and then bounce it between 105° and 120°, because each press
     re-read the turned tangent on the screen; the map is now held while the view stands. */
  await scene(page, "spheretri");
  const stage = page.locator(H("spheretri") + " .s3d-stage").first();
  await stage.scrollIntoViewIfNeeded();
  await stage.focus();
  const ang = () => page.evaluate(() => document.querySelector('[data-widget="spheretri"]').__scene.state.ang);
  const held = [await ang()];
  for (let i = 0; i < 10; i++) { await page.keyboard.press("ArrowRight"); held.push(await ang()); }
  check(held[held.length - 1] === 165 && held.every((v, i) => !i || v >= held[i - 1]),
    "spheretri at home: → held from 45° carries B steadily to 165° (" + held.join(" ") + ")");
  const back = [held[held.length - 1]];
  for (let i = 0; i < 10; i++) { await page.keyboard.press("ArrowLeft"); back.push(await ang()); }
  check(back[back.length - 1] === 15 && back.every((v, i) => !i || v <= back[i - 1]),
    "spheretri at home: ← held then brings it steadily back to 15° (" + back.join(" ") + ")");
  /* and under every view: a held key never turns round, reaches an end, and its opposite
     key retraces the same steps */
  const sweep = await page.evaluate((views) => {
    var sc = document.querySelector('[data-widget="spheretri"]').__scene, st = sc.stage.el, bad = [];
    function key(k) { st.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); }
    var BACK = { ArrowRight: "ArrowLeft", ArrowLeft: "ArrowRight", ArrowUp: "ArrowDown", ArrowDown: "ArrowUp" };
    views.concat([[22.5, 26], [-90, 90], [22.5, 12], [67.5, 12]]).forEach(function (v) {
      Object.keys(BACK).forEach(function (k) {
        sc.api.view(v[0], v[1], false);
        sc.state.ang = 90; sc.api.update();
        var seq = [90], i;
        for (i = 0; i < 6; i++) { key(k); seq.push(sc.state.ang); }
        for (i = 0; i < 6; i++) { key(BACK[k]); seq.push(sc.state.ang); }
        /* out: 90 then five steps to an end (one press to spare); back: five steps to 90 */
        var out = seq.slice(0, 7), dir = out[6] > 90 ? 1 : -1, ok = out[6] === 90 + dir * 75;
        for (i = 1; i < 6; i++) ok = ok && out[i] === 90 + dir * 15 * i;
        for (i = 1; i <= 6; i++) ok = ok && seq[6 + i] === out[6] - dir * 15 * i;
        if (!ok) bad.push(k + " at az " + v[0] + " el " + v[1] + ": " + seq.join(" "));
      });
    });
    return bad;
  }, views);
  check(!sweep.length, "spheretri under every view: a held key goes one way to an end and its opposite retraces it (" + sweep.slice(0, 4).join("; ") + ")");
  check(!errors.length, "no page errors in the arrow-key check (" + errors.join("; ") + ")");
  await context.close();
}

/* ------------------------------------------------------------- 4. colours -- */
const COLOURS = "(" + function (n) {
  function lum(c) {
    return c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
      .reduce(function (a, v, i) { return a + v * [0.2126, 0.7152, 0.0722][i]; }, 0);
  }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function rgbOf(s) { var m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(s); return m ? [+m[1], +m[2], +m[3]] : null; }
  /* every instance of the scene on the page: the exercise copies draw their own state */
  return Array.prototype.map.call(document.querySelectorAll('[data-widget="' + n + '"]'), function (host) {
    var st = host.__scene.stage, bg = rgbOf(getComputedStyle(st.el).backgroundColor), pal = st.pal, names = {};
    Object.keys(pal).forEach(function (k) { if (pal[k].rgb && !names[pal[k].rgb.join()]) names[pal[k].rgb.join()] = k; });
    function over(c, a) { return c.map(function (v, i) { return v * a + bg[i] * (1 - a); }); }
    var out = { ex: !!host.closest(".ex"), seams: 0, seamFace: 99, seamBg: 99, ball: 0, ring: 99, ringCount: 0, low: [] };
    var balls = st.prims.filter(function (p) { return p.t === "ball"; });
    /* a line with both ends on a ball's rim, as drawn on the screen */
    function onRim(p) {
      return balls.some(function (b) {
        return [p.a, p.b].every(function (q) { return Math.abs(Math.sqrt((q[0] - b.c[0]) * (q[0] - b.c[0]) + (q[1] - b.c[1]) * (q[1] - b.c[1])) - b.R) < 0.5; });
      });
    }
    out.ball = balls.length;
    st.prims.forEach(function (p) {
      if (p.t === "poly" && p.stroke && p.stroke.rgb && p.rgb) {
        /* the seam against the face as it shows: shaded, and over the stage if see-through */
        out.seams++;
        out.seamFace = Math.min(out.seamFace, ratio(p.stroke.rgb, over(p.rgb, Math.min(1, p.a2))));
        out.seamBg = Math.min(out.seamBg, ratio(p.stroke.rgb, bg));
      }
      if ((p.t === "line" || p.t === "tri") && p.rgb) {
        var nm = names[p.rgb.join()] || p.rgb.join(), r = ratio(over(p.rgb, Math.min(1, p.a2)), bg);
        if (p.t === "line" && onRim(p)) { out.ring = Math.min(out.ring, r); out.ringCount++; }
        /* the floor grid is a faint backdrop on purpose, as in the flat figures */
        if (nm !== "grid" && r < 3) out.low.push(p.t + " " + nm + (p.a2 < 1 ? " at alpha " + p.a2 : "") + " " + r.toFixed(2));
      }
    });
    Array.prototype.forEach.call(st.el.querySelectorAll(".s3d-over text, .s3d-over circle.s3d-h, .s3d-over circle:not([class])"), function (t) {
      var c = rgbOf(getComputedStyle(t).fill);
      if (c && ratio(c, bg) < 3) out.low.push(t.localName + " " + (t.textContent || "") + " " + ratio(c, bg).toFixed(2));
    });
    out.low = out.low.filter(function (v, i, a) { return a.indexOf(v) === i; });
    return out;
  });
} + ")";
async function colours(browser) {
  const report = [];
  let seamed = 0;
  for (const theme of ["light", "dark"]) {
    const { context, page, errors } = await open(browser, { theme });
    for (const name of Object.keys(SCENES)) {
      await scene(page, name);
      const all = await page.evaluate(COLOURS + "(" + JSON.stringify(name) + ")");
      all.forEach((got, i) => {
        const who = theme + " " + name + "#" + i + (got.ex ? " (exercise)" : "");
        check(!got.low.length, who + ": every line, label and dot stands 3:1 off the stage (" + got.low.slice(0, 6).join("; ") + ")");
        if (got.seams) {
          seamed++;
          report.push(who + " seams: " + got.seamFace.toFixed(2) + ":1 off the faces");
          check(got.seamFace >= 3, who + ": the seams between faces stand 3:1 off every face they edge (" + got.seamFace.toFixed(2) + ")");
        }
        if (name === "boxcount") {
          check(got.seamBg >= 3, who + ": the seams between cubes stand 3:1 off the stage too (" + got.seamBg.toFixed(2) + ")");
        }
        if (name === "sphereslice" || name === "spheretri") {
          report.push(who + " ball outline: " + got.ring.toFixed(2) + ":1 off the stage");
          check(got.ball === 1 && got.ringCount >= 24 && got.ring >= 3, who + ": the ball has an outline 3:1 off the stage (" + JSON.stringify({ ball: got.ball, n: got.ringCount, r: got.ring }) + ")");
        }
      });
      check(all.length >= 1, theme + " " + name + ": the scene is on its page");
    }
    check(!errors.length, theme + ": no page errors in the colour check (" + errors.join("; ") + ")");
    await context.close();
  }
  /* boxcount, scale3, sumsquares and sphereslice, each in the text and in an exercise */
  check(seamed >= 16, "the seam check reached every scene with seams, exercise copies too (" + seamed + ")");
  if (process.env.VERBOSE) report.forEach((l) => console.log("  " + l));
}

async function run() {
  const browser = await chromium.launch();
  try {
    await resetButton(browser);
    await swipes(browser);
    await arrows(browser);
    await colours(browser);
  } finally {
    await browser.close();
  }
}

run().then(() => {
  console.log((fails ? "FAILED" : "ok") + " scenes: " + passes + " checks passed" + (fails ? ", " + fails + " failed" : ""));
  process.exit(fails ? 1 : 0);
}, (e) => { console.error(e); process.exit(2); });
