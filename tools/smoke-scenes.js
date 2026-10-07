#!/usr/bin/env node
/* Smoke test for the 3D scenes: zero dependencies, a small DOM shim, the SVG painter.
     node tools/smoke-scenes.js
   Loads assets/widgets.js, assets/scenes3d.js and every assets/scenes/*.js, then for
   every scene defined, in figure mode and in quiz mode (inside an unsolved .ex):
   mounts it; checks __answer is a function and every mission is false at mount;
   drives every slider to both ends, every chip, button and matrix cell, keys and
   drags on the stage; fails on NaN/Infinity in any emitted attribute; then applies
   each `cases` entry and grades String(__answer()) with the site's own matcher
   (src/core/grade.ts, the grader the pages use). Exits non-zero on any failure. */
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.resolve(__dirname, "..");
var VERBOSE = process.argv.indexOf("-v") > 0;
var failures = [];
function fail(msg) { failures.push(msg); }

/* ------------------------------------------------------------ the shim -- */

var badAttr = [];
function Node(tag, ns) {
  this.tagName = tag.toUpperCase();
  this.localName = tag;
  this.namespaceURI = ns || "http://www.w3.org/1999/xhtml";
  this.nodeType = 1;
  this.attributes = {};
  this.children = [];
  this.parentNode = null;
  this.listeners = {};
  this._text = "";
  this._html = "";
  var self = this;
  this.style = {
    setProperty: function (k, v) { self.style[k] = v; check(self, "style " + k, v); },
    removeProperty: function (k) { delete self.style[k]; }
  };
  this.classList = {
    add: function (c) { var l = self.className ? self.className.split(/\s+/) : []; if (l.indexOf(c) < 0) l.push(c); self.className = l.join(" "); },
    remove: function (c) { self.className = (self.className || "").split(/\s+/).filter(function (x) { return x && x !== c; }).join(" "); },
    contains: function (c) { return (self.className || "").split(/\s+/).indexOf(c) >= 0; },
    toggle: function (c, on) { if (on === undefined) on = !this.contains(c); if (on) this.add(c); else this.remove(c); }
  };
  this.value = "";
  this.disabled = false;
  this.hidden = false;
  this.width = 300; this.height = 150;
}
function check(node, name, v) {
  if (/NaN|Infinity|undefined/.test(String(v))) badAttr.push(node.localName + "[" + name + "]=" + v);
}
Object.defineProperty(Node.prototype, "className", {
  get: function () { return this.attributes["class"] || ""; },
  set: function (v) { this.attributes["class"] = String(v); }
});
Object.defineProperty(Node.prototype, "id", {
  get: function () { return this.attributes.id || ""; },
  set: function (v) { this.attributes.id = String(v); }
});
Object.defineProperty(Node.prototype, "firstChild", { get: function () { return this.children[0] || null; } });
Object.defineProperty(Node.prototype, "lastChild", { get: function () { return this.children[this.children.length - 1] || null; } });
Object.defineProperty(Node.prototype, "childNodes", { get: function () { return this.children; } });
Object.defineProperty(Node.prototype, "nextSibling", { get: function () {
  if (!this.parentNode) return null;
  var l = this.parentNode.children; return l[l.indexOf(this) + 1] || null;
} });
Object.defineProperty(Node.prototype, "textContent", {
  get: function () { return this._text + this.children.map(function (c) { return c.textContent; }).join(""); },
  set: function (v) { this.children.forEach(function (c) { c.parentNode = null; }); this.children = []; this._text = String(v); }
});
Object.defineProperty(Node.prototype, "innerHTML", {
  get: function () { return this._html; },
  set: function (v) { this.children = []; this._html = String(v); this._text = String(v).replace(/<[^>]*>/g, ""); check(this, "innerHTML", v); }
});
Node.prototype.setAttribute = function (k, v) {
  check(this, k, v);
  if (k === "class") this.className = v;
  else this.attributes[k] = String(v);
};
Node.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; };
Node.prototype.hasAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attributes, k); };
Node.prototype.removeAttribute = function (k) { delete this.attributes[k]; };
Node.prototype.appendChild = function (c) {
  if (c.parentNode) c.parentNode.removeChild(c);
  c.parentNode = this; this.children.push(c); return c;
};
Node.prototype.insertBefore = function (c, ref) {
  if (c.parentNode) c.parentNode.removeChild(c);
  var i = ref ? this.children.indexOf(ref) : -1;
  c.parentNode = this;
  if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
  return c;
};
Node.prototype.removeChild = function (c) {
  var i = this.children.indexOf(c);
  if (i >= 0) this.children.splice(i, 1);
  c.parentNode = null; return c;
};
Node.prototype.addEventListener = function (t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); };
Node.prototype.removeEventListener = function (t, fn) {
  var l = this.listeners[t] || []; var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1);
};
Node.prototype.dispatchEvent = function (ev) {
  ev.target = ev.target || this;
  for (var n = this; n; n = n.parentNode) {
    ev.currentTarget = n;
    (n.listeners[ev.type] || []).slice().forEach(function (fn) { fn.call(n, ev); });
    if (ev._stop) break;
  }
  return !ev.defaultPrevented;
};
Node.prototype.matches = function (sel) {
  if (sel[0] === ".") return this.classList.contains(sel.slice(1));
  if (sel[0] === "[") return this.hasAttribute(sel.slice(1, -1).split("=")[0]);
  return this.localName === sel.toLowerCase();
};
Node.prototype.closest = function (sel) {
  for (var n = this; n; n = n.parentNode) if (n.matches && n.matches(sel)) return n;
  return null;
};
Node.prototype.querySelectorAll = function (sel) {
  var out = [];
  (function walk(n) { n.children.forEach(function (c) { if (c.matches(sel)) out.push(c); walk(c); }); })(this);
  return out;
};
Node.prototype.querySelector = function (sel) { return this.querySelectorAll(sel)[0] || null; };
Node.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 660, height: 420, right: 660, bottom: 420 }; };
Node.prototype.setPointerCapture = function () {};
Node.prototype.focus = function () { doc.activeElement = this; };
Node.prototype.getContext = function () { return null; };

function Event(type, init) {
  var e = { type: type, defaultPrevented: false, _stop: false, bubbles: true };
  Object.keys(init || {}).forEach(function (k) { e[k] = init[k]; });
  e.preventDefault = function () { e.defaultPrevented = true; };
  e.stopPropagation = function () { e._stop = true; };
  return e;
}

var doc = {
  documentElement: new Node("html"),
  body: null,
  head: new Node("head"),
  currentScript: null,
  activeElement: null,
  readyState: "complete",
  createElement: function (t) { return new Node(t); },
  createElementNS: function (ns, t) { return new Node(t, ns); },
  querySelector: function (sel) { return doc.documentElement.querySelector(sel); },
  querySelectorAll: function (sel) { return doc.documentElement.querySelectorAll(sel); },
  getElementById: function () { return null; },
  addEventListener: function () {}
};
doc.body = doc.documentElement.appendChild(new Node("body"));
doc.body.setAttribute("data-chapter", "smoke");

/* the token values, read from src/styles/tokens.css (the light theme and panel, under
   the first Part) so palette() resolves and the shaded draw paths run. A token file
   that yields none would quietly skip those paths, so that stops the run. */
var cssLib = require("./lib/css");
var T = cssLib.tokens(fs.readFileSync(path.join(ROOT, "src/styles/tokens.css"), "utf8"));
var tokens = Object.assign({}, T.light, (T.scopes[0] && T.scopes[0].parts.algebra) || {});
Object.keys(tokens).forEach(function (k) { tokens[k] = String(cssLib.resolveVar(tokens[k], tokens)).trim(); });
if (!/^#[0-9a-fA-F]{6}$/.test(tokens["--plot-curve"] || "")) {
  console.error("smoke-scenes: no --plot-curve read from src/styles/tokens.css (" + Object.keys(tokens).length + " tokens); the scenes would draw without their palette");
  process.exit(2);
}

var listeners = [];
var win = {
  document: doc,
  console: console,
  Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number, parseFloat: parseFloat,
  parseInt: parseInt, isNaN: isNaN, isFinite: isFinite, Error: Error, Date: Date, RegExp: RegExp,
  setTimeout: function (fn) { pending.push(fn); return pending.length; },
  clearTimeout: function () {},
  matchMedia: function () { return { matches: false, addEventListener: function () {} }; },
  getComputedStyle: function () { return { getPropertyValue: function (k) { return tokens[k] || ""; } }; },
  addEventListener: function () {},
  location: { search: "" },
  navigator: {},
  devicePixelRatio: 1,
  BMStore: { on: function (fn) { listeners.push(fn); }, emit: function (c) { listeners.forEach(function (fn) { fn(c); }); } }
};
var pending = [];
function flush() { var n = 0; while (pending.length && n++ < 1000) pending.shift()(); }
win.window = win;
var ctx = vm.createContext(win);
function load(rel) {
  var file = path.join(ROOT, rel);
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: rel });
}

/* ------------------------------------------------------ the site's grader -- */
/* src/core/grade.ts, the grader the pages use, read by Node itself */
var gradeOf = require(path.join(ROOT, "src/core/grade.ts")).grade;
var grader = function (given, answer, type) { return gradeOf(given, answer, type, 0); };

/* ------------------------------------------------------------- running -- */
load("assets/widgets.js");
load("assets/three-loader.js");
load("assets/scenes3d.js");
var sceneDir = path.join(ROOT, "assets/scenes");
var files = fs.existsSync(sceneDir) ? fs.readdirSync(sceneDir).filter(function (f) { return /\.js$/.test(f); }).sort() : [];
files.forEach(function (f) { load("assets/scenes/" + f); });
var BM3D = win.BM3D;
var names = Object.keys(BM3D.specs || {});
if (!names.length) fail("no scenes defined");

/* a probe scene, never shipped, that touches every display-list primitive, so the engine
   is covered even where no real scene uses a primitive yet */
BM3D.define("__probe", {
  label: "Probe",
  view: { az: 30, el: 25, center: [1, 1, 1], radius: 4, bounds: [[-2, -2, -2], [4, 4, 4]],
    presets: [["side", function (s) { return s.t * 10; }, 0]],
    fit: function (s) { return { center: [1, 1, 1], radius: 3 + s.t / 4 }; } },
  state: { t: 1, on: 0, p: [1, 1, 1] },
  controls: function (api) {
    api.slider("t", -3, 3, 1, { get: function (s) { return s.t; }, set: function (s, v) { s.t = v; } });
    api.chips([{ label: "off", value: 0 }, { label: "on", value: 1 }], "on", "Toggle");
    api.button(function (s) { return "t is " + s.t; }, function (s) { s.t = 0; }, { disabled: function (s) { return s.t === 0; } });
    api.matrix("m", -2, 2, { lock: [1] });
    api.handle({ name: "P", at: function (s) { return s.p; }, axis: [1, 1, 0], move: function (s, p) { s.p = p.map(Math.round); } });
    api.handle({ name: "R", at: function () { return [0, 0, 2]; }, axes: [[1, 0, 0], [0, 0, 1]], move: function () {}, enabled: function (s) { return !!s.on; } });
  },
  draw: function (g, s) {
    g.grid({ min: [-2, -2], max: [4, 4] });
    g.axes({ min: [-2, -2, -2], max: [4, 4, 4], ticks: 1 });
    g.seg([0, 0, 0], [1, 2, 3], { dash: true });
    g.path([[0, 0, 0], [1, 0, 0], [1, 1, 0]], { closed: true, tone: "curve2" });
    g.arrow([0, 0, 0], [0, 0, 0], {});                       /* zero length */
    g.arrow([0, 0, 0], s.p, { tone: "curve" });
    g.face([[0, 0, 0], [1, 0, 0], [2, 0, 0]], {});           /* degenerate */
    g.face([[0, 0, 0], [2, 0, 0], [2, 2, 0]], { tone: "faceC", alpha: 0.5, stroke: "ink" });
    g.box([0, 0, 0], [1, 1, s.t], { tone: "faceA", alpha: 0.6 });
    g.para([0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 0, 1], {});  /* flat */
    g.cubes([[2, 2, 0, "faceB"], [3, 2, 0], { at: [2, 2, 1], tone: "hot" }], { tone: "faceA" });
    g.plane([s.t, 1, 1], 2, { tone: "fill", alpha: 0.4 });
    g.plane([0, 0, 1], 99, {});                             /* misses the bounds */
    g.line3([0, 0, 1], [1, s.t, 0], { tone: "bad" });
    g.line3([9, 9, 9], [0, 0, 1], {});                      /* misses */
    g.sphere([2, 0, 2], 0.6, { tone: "faceB" });
    g.right([0, 0, 0], [1, 0, 0], [0, 1, 0], {});
    g.right([0, 0, 0], [0, 0, 0], [0, 1, 0], {});           /* degenerate */
    g.dot([1, 1, 1], { r: 4 });
    g.label([1, 1, 1], "P", { minor: true });
  },
  say: function (s, quiz) { return quiz ? "t" : "t = " + s.t; },
  answer: function (s, ask) { return ask === "p" ? s.p.join(",") : s.t; },
  missions: [{ text: "t is 3", test: function (s) { return s.t === 3; } }],
  cases: [{ set: { t: 2 }, answer: "2" }, { set: { p: [2, 2, 1] }, ask: "p", answer: "2,2,1", compare: "exact" },
    { set: function (s) { s.t = -1; }, answer: "-1", not: "1" }]
});
BM3D.specs.__probe.state.m = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
names.push("__probe");

function walk(n, fn) { fn(n); n.children.forEach(function (c) { walk(c, fn); }); }
function all(host, pred) { var out = []; walk(host, function (n) { if (pred(n)) out.push(n); }); return out; }

function mountIn(name, quiz, extra) {
  doc.body.children = [];
  var holder = new Node("div");
  doc.body.appendChild(holder);
  var host = new Node("div");
  host.className = "widget";
  host.setAttribute("data-widget", name);
  var ex = null;
  if (quiz) {
    ex = new Node("div");
    ex.className = "ex";
    ex.setAttribute("data-key", "smoke-" + name);
    ex.setAttribute("data-inline", "");
    holder.appendChild(ex);
    host.setAttribute("data-no-missions", "");
    ex.appendChild(host);
  } else {
    holder.appendChild(host);
  }
  Object.keys(extra || {}).forEach(function (k) { host.setAttribute(k, extra[k]); });
  win.BMWidgets[name](host);
  return { host: host, ex: ex };
}

function exercise(name, quiz) {
  var tag = name + (quiz ? " (quiz)" : "");
  var m;
  try { m = mountIn(name, quiz); } catch (e) { fail(tag + ": mount threw " + (e && e.stack || e)); return; }
  var host = m.host, sc = host.__scene;
  if (typeof host.__answer !== "function") fail(tag + ": __answer is not a function");
  if (!sc) { fail(tag + ": no __scene"); return; }
  var spec = sc.spec;
  (spec.missions || []).forEach(function (mi, i) {
    var v;
    try { v = mi.test(sc.state); } catch (e) { fail(tag + ": mission " + i + " threw " + e); }
    if (v) fail(tag + ": mission " + i + " is already true at mount (" + mi.text + ")");
  });
  if (!quiz && spec.missions && !host.__missions) fail(tag + ": missions not built");
  if (quiz && host.__missions) fail(tag + ": missions built inside an exercise");
  var stage = sc.stage.el;
  if (stage.getAttribute("role") !== "application") fail(tag + ": stage role");
  if (!stage.getAttribute("aria-describedby")) fail(tag + ": stage has no aria-describedby");
  /* DOM order: stage, readout, controls, note, missions */
  var order = host.children.map(function (n) { return n.className.split(" ")[0]; });
  var want = ["s3d-stage", "readout"];
  if (order[0] !== want[0] || order[1] !== want[1]) fail(tag + ": DOM order " + order.join(","));
  if (order.indexOf("hint-drag") < order.indexOf("controls") && order.indexOf("controls") >= 0) fail(tag + ": note before controls");

  function safely(what, fn) {
    try { fn(); flush(); } catch (e) { fail(tag + ": " + what + " threw " + (e && e.stack || e)); }
  }
  /* sliders to both ends */
  all(host, function (n) { return n.localName === "input" && n.getAttribute("type") === "range"; }).forEach(function (inp) {
    [inp.getAttribute("min"), inp.getAttribute("max"), inp.getAttribute("min")].forEach(function (v) {
      safely("slider " + v, function () { inp.value = v; inp.dispatchEvent(Event("input")); });
    });
  });
  /* matrix cells */
  all(host, function (n) { return n.localName === "input" && n.getAttribute("type") === "number"; }).forEach(function (inp, i) {
    var keep = inp.value;
    [inp.getAttribute("min"), inp.getAttribute("max"), "", "-", keep].forEach(function (v) {
      safely("matrix cell " + i + "=" + v, function () { inp.value = v; inp.dispatchEvent(Event("input")); inp.dispatchEvent(Event("change")); });
    });
  });
  /* every chip and button, twice, so undo and toggles see both states */
  for (var pass = 0; pass < 2; pass++) {
    all(host, function (n) { return n.localName === "button"; }).forEach(function (btn) {
      safely("button " + btn.textContent, function () { btn.dispatchEvent(Event("click")); });
    });
  }
  /* keys: every handle, then the view */
  ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", " ", "ArrowRight", "ArrowUp", "Enter",
    "ArrowLeft", "ArrowDown", " ", "ArrowUp", "Home", " ", " ", " "].forEach(function (k) {
    safely("key " + k, function () {
      stage.dispatchEvent(Event("keydown", { key: k }));
      stage.dispatchEvent(Event("keydown", { key: k, shiftKey: true }));
    });
  });
  /* drags: on each handle along every direction, then an orbit from an empty corner */
  var spots = all(host, function (n) { return n.localName === "circle" && n.hasAttribute("data-handle"); }).map(function (c) {
    return [parseFloat(c.getAttribute("cx")), parseFloat(c.getAttribute("cy"))];
  });
  spots.concat([[8, 8]]).forEach(function (p) {
    [[60, 0], [0, -60], [-90, 40], [400, 400], [-400, -400]].forEach(function (d) {
      safely("drag from " + p + " by " + d, function () {
        stage.dispatchEvent(Event("pointerdown", { clientX: p[0], clientY: p[1], pointerId: 1, button: 0, pointerType: "mouse" }));
        stage.dispatchEvent(Event("pointermove", { clientX: p[0] + d[0] / 2, clientY: p[1] + d[1] / 2, pointerId: 1 }));
        stage.dispatchEvent(Event("pointermove", { clientX: p[0] + d[0], clientY: p[1] + d[1], pointerId: 1 }));
        stage.dispatchEvent(Event("pointerup", { clientX: p[0] + d[0], clientY: p[1] + d[1], pointerId: 1 }));
      });
    });
  });
  safely("touchstart", function () { stage.dispatchEvent(Event("touchstart", { touches: [{ clientX: 5, clientY: 5 }] })); });
  if (quiz) {
    /* solving the exercise ends quiz mode and plays the reveal */
    safely("solved event", function () { win.BMStore.emit({ type: "solved", chapter: "smoke", key: "smoke-" + name, inline: true }); });
    if (sc.api.quiz()) fail(tag + ": still in quiz mode after the solved event");
  }
  if (!stage.getAttribute("aria-label")) fail(tag + ": stage has no aria-label");
  if (VERBOSE) console.log("  " + tag + " nonFinite so far " + BM3D.nonFinite());
  var drawn = all(stage, function (n) { return /^(polygon|line|circle|text)$/.test(n.localName); }).length;
  if (!drawn) fail(tag + ": nothing drawn");
  if (VERBOSE) {
    console.log("  " + tag + ": " + spots.length + " handle(s), " +
      all(host, function (n) { return n.localName === "input"; }).length + " input(s), " +
      all(host, function (n) { return n.localName === "button"; }).length + " button(s), " + drawn + " svg nodes; " +
      "answer " + JSON.stringify(String(host.__answer())) + "; readout: " + host.children[1].textContent.slice(0, 90));
  }
  var ans;
  try { ans = String(host.__answer()); } catch (e) { fail(tag + ": __answer threw " + e); }
  if (/NaN|undefined/.test(ans)) fail(tag + ": __answer gave " + ans);
}

function cases(name) {
  var spec = BM3D.specs[name];
  (spec.cases || []).forEach(function (c, i) {
    var tag = name + " case " + i;
    var m;
    try { m = mountIn(name, true, c.ask ? { "data-ask": c.ask } : {}); } catch (e) { fail(tag + ": mount threw " + e); return; }
    var sc = m.host.__scene, s = sc.state;
    try {
      if (typeof c.set === "function") c.set(s, sc.api);
      else Object.keys(c.set || {}).forEach(function (k) { s[k] = JSON.parse(JSON.stringify(c.set[k])); });
      sc.api.update();
      flush();
    } catch (e) { fail(tag + ": set threw " + e); return; }
    var given = String(m.host.__answer());
    function cmp(ans) {
      return c.compare || (ans.split("|").every(function (x) { return /^\s*-?\d+(\.\d+)?\s*$/.test(x); }) ? "number" : "exact");
    }
    if (c.answer !== undefined && !grader(given, c.answer, cmp(c.answer))) {
      fail(tag + ": __answer() = " + JSON.stringify(given) + " is not accepted for " + JSON.stringify(c.answer));
    }
    if (c.not !== undefined && grader(given, c.not, cmp(c.not))) {
      fail(tag + ": __answer() = " + JSON.stringify(given) + " should not be accepted for " + JSON.stringify(c.not));
    }
  });
}

names.forEach(function (name) {
  exercise(name, false);
  exercise(name, true);
  cases(name);
});
flush();
if (badAttr.length) fail("non-finite values emitted: " + badAttr.slice(0, 8).join("; ") + (badAttr.length > 8 ? " …" : ""));
if (BM3D.nonFinite && BM3D.nonFinite()) fail(BM3D.nonFinite() + " primitives had non-finite coordinates");

if (failures.length) {
  console.error("smoke-scenes: " + failures.length + " failure(s)");
  failures.forEach(function (f) { console.error("  ✗ " + f); });
  process.exit(1);
}
console.log("smoke-scenes: " + (names.length - 1) + " scene(s) and the probe ok (" + names.join(", ") + "), " +
  names.reduce(function (n, k) { return n + (BM3D.specs[k].cases || []).length; }, 0) + " cases");
