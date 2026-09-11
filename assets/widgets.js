/* ===========================================================================
   Basic Mathematics — interactive figures
   Each widget is a factory mounted on <div class="widget" data-widget="name">.
   Plain SVG + pointer/keyboard input. Colours come from CSS custom properties
   (set through style attributes) so every figure follows the theme.
   =========================================================================== */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs, text) {
    var n = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function h(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    if (html !== undefined) n.innerHTML = html;
    return n;
  }

  var S = {
    axis: "stroke:var(--plot-axis);stroke-width:1.25;fill:none",
    grid: "stroke:var(--plot-grid);stroke-width:1;fill:none",
    curve: "stroke:var(--plot-curve);stroke-width:2.5;fill:none;stroke-linejoin:round;stroke-linecap:round",
    curve2: "stroke:var(--plot-curve-2);stroke-width:2.25;fill:none;stroke-linejoin:round",
    dash: "stroke:var(--plot-axis);stroke-width:1.25;fill:none;stroke-dasharray:5 4",
    fill: "fill:var(--plot-fill);stroke:none",
    label: "font:500 13px var(--sans);fill:var(--muted)",
    labelStrong: "font:650 13px var(--sans);fill:var(--text)",
    tick: "font:500 11px var(--sans);fill:var(--muted)",
    pt: "fill:var(--plot-point);stroke:var(--surface);stroke-width:2",
    ptA: "fill:var(--plot-curve);stroke:var(--surface);stroke-width:2",
    ptB: "fill:var(--plot-curve-2);stroke:var(--surface);stroke-width:2",
    handle: "fill:var(--plot-curve);stroke:var(--surface);stroke-width:2.5;cursor:grab"
  };

  function fmt(x, d) {
    if (!isFinite(x)) return "—";
    var r = Math.round(x * 1000) / 1000;
    if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r));
    return r.toFixed(d === undefined ? 2 : d);
  }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = b; b = a % b; a = t; } return a || 1; }

  /* ------------------------------------------------------------ plot core -- */

  function Plot(cfg) {
    var w = cfg.w || 660, ht = cfg.h || 360;
    var pad = cfg.pad || { l: 34, r: 18, t: 18, b: 30 };
    var svg = el("svg", {
      viewBox: "0 0 " + w + " " + ht,
      role: "img",
      "aria-label": cfg.label || "figure"
    });
    var P = {
      svg: svg, w: w, h: ht, pad: pad,
      xmin: cfg.xmin, xmax: cfg.xmax, ymin: cfg.ymin, ymax: cfg.ymax,
      sx: function (x) { return pad.l + ((x - cfg.xmin) / (cfg.xmax - cfg.xmin)) * (w - pad.l - pad.r); },
      sy: function (y) { return ht - pad.b - ((y - cfg.ymin) / (cfg.ymax - cfg.ymin)) * (ht - pad.t - pad.b); },
      ix: function (px) { return cfg.xmin + ((px - pad.l) / (w - pad.l - pad.r)) * (cfg.xmax - cfg.xmin); },
      iy: function (py) { return cfg.ymin + ((ht - pad.b - py) / (ht - pad.t - pad.b)) * (cfg.ymax - cfg.ymin); },
      add: function (node) { svg.appendChild(node); return node; },
      layer: function () { return P.add(el("g")); },
      /* viewBox coordinates of a pointer event */
      local: function (evt) {
        var r = svg.getBoundingClientRect();
        return { x: ((evt.clientX - r.left) / r.width) * w, y: ((evt.clientY - r.top) / r.height) * ht };
      }
    };
    return P;
  }

  function grid(P, xStep, yStep, opts) {
    opts = opts || {};
    var g = P.layer(), i;
    for (i = Math.ceil(P.xmin / xStep) * xStep; i <= P.xmax + 1e-9; i += xStep) {
      if (Math.abs(i) < 1e-9) continue;
      g.appendChild(el("line", { x1: P.sx(i), y1: P.sy(P.ymin), x2: P.sx(i), y2: P.sy(P.ymax), style: S.grid }));
    }
    for (i = Math.ceil(P.ymin / yStep) * yStep; i <= P.ymax + 1e-9; i += yStep) {
      if (Math.abs(i) < 1e-9) continue;
      g.appendChild(el("line", { x1: P.sx(P.xmin), y1: P.sy(i), x2: P.sx(P.xmax), y2: P.sy(i), style: S.grid }));
    }
    /* axes */
    g.appendChild(el("line", { x1: P.sx(P.xmin), y1: P.sy(0), x2: P.sx(P.xmax), y2: P.sy(0), style: S.axis }));
    g.appendChild(el("line", { x1: P.sx(0), y1: P.sy(P.ymin), x2: P.sx(0), y2: P.sy(P.ymax), style: S.axis }));
    var lx = opts.xLabel === undefined ? "x" : opts.xLabel;
    var ly = opts.yLabel === undefined ? "y" : opts.yLabel;
    if (lx) g.appendChild(el("text", { x: P.sx(P.xmax) - 4, y: P.sy(0) - 8, "text-anchor": "end", style: S.label }, lx));
    if (ly) g.appendChild(el("text", { x: P.sx(0) + 8, y: P.sy(P.ymax) + 12, style: S.label }, ly));
    /* numeric ticks on both axes */
    var tick = opts.tickStep || xStep;
    for (i = Math.ceil(P.xmin / tick) * tick; i <= P.xmax + 1e-9; i += tick) {
      if (Math.abs(i) < 1e-9) continue;
      g.appendChild(el("text", { x: P.sx(i), y: P.sy(0) + 15, "text-anchor": "middle", style: S.tick }, fmt(i)));
    }
    var ytick = opts.yTickStep || yStep;
    for (i = Math.ceil(P.ymin / ytick) * ytick; i <= P.ymax + 1e-9; i += ytick) {
      if (Math.abs(i) < 1e-9) continue;
      g.appendChild(el("text", { x: P.sx(0) - 7, y: P.sy(i) + 4, "text-anchor": "end", style: S.tick }, fmt(i)));
    }
    g.appendChild(el("text", { x: P.sx(0) - 7, y: P.sy(0) + 15, "text-anchor": "end", style: S.tick }, "0"));
    return g;
  }

  /* plot y = f(x) as a polyline, breaking at jumps and undefined values */
  function curvePath(P, f, style, samples) {
    var n = samples || 400, d = "", pen = false, i, x, y, px, py;
    for (i = 0; i <= n; i++) {
      x = P.xmin + ((P.xmax - P.xmin) * i) / n;
      y = f(x);
      if (!isFinite(y) || y < P.ymin - (P.ymax - P.ymin) || y > P.ymax + (P.ymax - P.ymin)) { pen = false; continue; }
      px = P.sx(x); py = P.sy(Math.max(P.ymin - 1, Math.min(P.ymax + 1, y)));
      d += (pen ? "L" : "M") + fmt(px, 1) + " " + fmt(py, 1) + " ";
      pen = true;
    }
    return el("path", { d: d, style: style || S.curve });
  }

  /* a slider control; returns {wrap, input, output} */
  function slider(labelHtml, min, max, step, value, onInput, fmtOut) {
    var wrap = h("div", { class: "ctrl" });
    var id = "s" + Math.random().toString(36).slice(2, 8);
    var lab = h("label", { for: id }, labelHtml);
    var input = h("input", { type: "range", id: id, min: min, max: max, step: step });
    input.value = value;
    var out = h("output", {}, fmtOut ? fmtOut(value) : String(value));
    input.addEventListener("input", function () {
      var v = parseFloat(input.value);
      out.textContent = fmtOut ? fmtOut(v) : String(v);
      onInput(v);
    });
    wrap.appendChild(lab); wrap.appendChild(input); wrap.appendChild(out);
    return { wrap: wrap, input: input, output: out, get: function () { return parseFloat(input.value); } };
  }

  function chips(items, initial, onPick) {
    var wrap = h("div", { class: "chips", role: "group" });
    var btns = items.map(function (it, i) {
      var b = h("button", { type: "button", class: "chip" }, it.html);
      b.setAttribute("aria-pressed", i === initial ? "true" : "false");
      b.addEventListener("click", function () {
        btns.forEach(function (o) { o.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        onPick(it.value, i);
      });
      wrap.appendChild(b);
      return b;
    });
    return wrap;
  }

  function controls(host) {
    var c = h("div", { class: "controls" });
    host.appendChild(c);
    return c;
  }
  function readout(host) {
    var r = h("div", { class: "readout" });
    host.appendChild(r);
    return r;
  }
  function note(host, text) {
    host.appendChild(h("p", { class: "hint-drag" }, text));
  }

  /* make an SVG element draggable along x (data coords), with keyboard support */
  function dragX(P, node, get, set, opts) {
    opts = opts || {};
    var step = opts.step || 1, min = opts.min, max = opts.max;
    node.setAttribute("tabindex", "0");
    node.setAttribute("role", "slider");
    if (opts.label) node.setAttribute("aria-label", opts.label);
    function clamp(v) {
      if (opts.snap) v = Math.round(v / step) * step;
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      return v;
    }
    var dragging = false;
    function move(e) {
      if (!dragging) return;
      e.preventDefault();
      set(clamp(P.ix(P.local(e).x)));
    }
    node.addEventListener("pointerdown", function (e) {
      dragging = true;
      node.setPointerCapture && node.setPointerCapture(e.pointerId);
      move(e);
    });
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", function () { dragging = false; });
    node.addEventListener("pointercancel", function () { dragging = false; });
    node.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -step
        : e.key === "ArrowRight" || e.key === "ArrowUp" ? step : 0;
      if (!d) return;
      e.preventDefault();
      set(clamp(get() + d));
    });
  }

  var W = {};

  /* =========================================================== 1. number line
     Integer arithmetic shown as motion along the line. */
  W.numberline = function (host) {
    var a = 3, b = -5, op = "+";
    var P = Plot({ w: 660, h: 210, pad: { l: 20, r: 20, t: 70, b: 56 }, xmin: -12, xmax: 12, ymin: -1, ymax: 1, label: "A number line showing integer addition" });
    host.appendChild(P.svg);
    var g = P.layer();
    var out = readout(host);
    var y0 = P.sy(0);

    /* a hop along the line, drawn from x1 to x2 with an arrowhead at x2 */
    function arrow(x1, x2, y, colorVar) {
      var dir = x2 >= x1 ? 1 : -1;
      var px1 = P.sx(x1), px2 = P.sx(x2);
      var frag = el("g");
      frag.appendChild(el("line", {
        x1: px1, y1: y, x2: px2, y2: y,
        style: "stroke:" + colorVar + ";stroke-width:2.5;stroke-linecap:round"
      }));
      frag.appendChild(el("path", {
        d: "M" + px2 + " " + y + " L" + (px2 - dir * 9) + " " + (y - 5) + " L" + (px2 - dir * 9) + " " + (y + 5) + " Z",
        style: "fill:" + colorVar + ";stroke:none"
      }));
      return frag;
    }

    function draw() {
      g.textContent = "";
      /* the line and its ticks */
      g.appendChild(el("line", { x1: P.sx(-12), y1: y0, x2: P.sx(12), y2: y0, style: S.axis }));
      for (var i = -12; i <= 12; i++) {
        var big = i % 5 === 0;
        g.appendChild(el("line", { x1: P.sx(i), y1: y0 - (big ? 7 : 4), x2: P.sx(i), y2: y0 + (big ? 7 : 4), style: S.axis }));
        if (big) g.appendChild(el("text", { x: P.sx(i), y: y0 + 24, "text-anchor": "middle", style: S.tick }, String(i)));
      }
      var result = op === "+" ? a + b : op === "-" ? a - b : a * b;
      /* first hop: 0 -> a, drawn well clear of the line */
      g.appendChild(arrow(0, a, y0 - 52, "var(--plot-curve)"));
      g.appendChild(el("text", { x: P.sx(a / 2), y: y0 - 60, "text-anchor": "middle", style: S.labelStrong }, "a = " + a));
      if (op !== "*") {
        var shift = op === "+" ? b : -b;
        g.appendChild(arrow(a, a + shift, y0 - 26, "var(--plot-curve-2)"));
        g.appendChild(el("text", { x: P.sx(a + shift / 2), y: y0 - 34, "text-anchor": "middle", style: S.label },
          (op === "+" ? "+ (" : "− (") + b + ")"));
      }
      /* result marker, if it fits on the visible line */
      if (result >= -12 && result <= 12) {
        g.appendChild(el("circle", { cx: P.sx(result), cy: y0, r: 6, style: S.pt }));
        g.appendChild(el("text", { x: P.sx(result), y: y0 + 44, "text-anchor": "middle", style: S.labelStrong }, String(result)));
      }
      var expr = op === "+" ? a + " + (" + b + ")" : op === "-" ? a + " − (" + b + ")" : a + " · (" + b + ")";
      out.innerHTML = "<b>" + expr + " = " + result + "</b><br>" +
        (op === "*"
          ? "Multiplying by a negative number reverses direction: " + a + " · (" + b + ") is " +
            Math.abs(b) + " copies of " + a + (b < 0 ? ", then reflected through 0." : ".")
          : "Adding a negative number moves left; subtracting a negative moves right.");
    }

    var c = controls(host);
    c.appendChild(slider("a", -10, 10, 1, a, function (v) { a = v; draw(); }).wrap);
    c.appendChild(slider("b", -10, 10, 1, b, function (v) { b = v; draw(); }).wrap);
    c.appendChild(chips([
      { html: "a + b", value: "+" }, { html: "a − b", value: "-" }, { html: "a · b", value: "*" }
    ], 0, function (v) { op = v; draw(); }));
    draw();
  };

  /* ======================================================= 2. rational number
     p/q located by cutting the unit into q equal pieces. */
  W.rationals = function (host) {
    var p = 7, q = 4;
    var P = Plot({ w: 660, h: 150, pad: { l: 20, r: 20, t: 26, b: 40 }, xmin: -4, xmax: 4, ymin: -1, ymax: 1, label: "A fraction located on the number line" });
    host.appendChild(P.svg);
    var g = P.layer();
    var out = readout(host);
    var y0 = P.sy(0);

    function draw() {
      g.textContent = "";
      g.appendChild(el("line", { x1: P.sx(-4), y1: y0, x2: P.sx(4), y2: y0, style: S.axis }));
      /* subdivision marks: every multiple of 1/q */
      for (var k = -4 * q; k <= 4 * q; k++) {
        var x = k / q;
        var isInt = k % q === 0;
        g.appendChild(el("line", {
          x1: P.sx(x), y1: y0 - (isInt ? 9 : 4), x2: P.sx(x), y2: y0 + (isInt ? 9 : 4),
          style: isInt ? S.axis : S.grid
        }));
        if (isInt) g.appendChild(el("text", { x: P.sx(x), y: y0 + 26, "text-anchor": "middle", style: S.tick }, String(k / q)));
      }
      var v = p / q;
      if (v >= -4 && v <= 4) {
        g.appendChild(el("line", { x1: P.sx(0), y1: y0 - 16, x2: P.sx(v), y2: y0 - 16, style: S.curve }));
        g.appendChild(el("circle", { cx: P.sx(v), cy: y0, r: 6, style: S.ptA }));
        g.appendChild(el("text", { x: P.sx(v), y: y0 - 24, "text-anchor": "middle", style: S.labelStrong }, p + "/" + q));
      }
      var d = gcd(p, q);
      out.innerHTML = "<b>" + p + "/" + q + " = " + fmt(p / q, 4) + "</b><br>" +
        "Cut each unit into " + q + " equal pieces, then take " + p + " of them" + (p < 0 ? " to the left" : "") + ".<br>" +
        (d > 1
          ? "Lowest terms: " + p / d + "/" + q / d + " — the same point, a different name."
          : "Already in lowest terms (no common factor above 1).");
    }

    var c = controls(host);
    c.appendChild(slider("p", -12, 12, 1, p, function (x) { p = x; draw(); }).wrap);
    c.appendChild(slider("q", 1, 12, 1, q, function (x) { q = x; draw(); }).wrap);
    draw();
  };

  /* ===================================================== 3. linear system 2×2 */
  W.linsys = function (host) {
    var a1 = 1, b1 = 1, c1 = 5, a2 = 2, b2 = -1, c2 = 1;
    var P = Plot({ w: 660, h: 400, xmin: -8, xmax: 8, ymin: -8, ymax: 8, label: "Two lines and their intersection" });
    host.appendChild(P.svg);
    var gg = grid(P, 1, 1, { tickStep: 2, yTickStep: 2 });
    var g = P.layer();
    var out = readout(host);

    function lineOf(a, b, c) {
      /* returns the two endpoints of ax + by = c clipped to the box, or null */
      var pts = [];
      function push(x, y) {
        if (x >= P.xmin - 1e-9 && x <= P.xmax + 1e-9 && y >= P.ymin - 1e-9 && y <= P.ymax + 1e-9) pts.push([x, y]);
      }
      if (b !== 0) { push(P.xmin, (c - a * P.xmin) / b); push(P.xmax, (c - a * P.xmax) / b); }
      if (a !== 0) { push((c - b * P.ymin) / a, P.ymin); push((c - b * P.ymax) / a, P.ymax); }
      if (pts.length < 2) return null;
      return [pts[0], pts[pts.length - 1]];
    }

    function draw() {
      g.textContent = "";
      [[a1, b1, c1, S.curve, "curve"], [a2, b2, c2, S.curve2, "curve2"]].forEach(function (L) {
        var seg = lineOf(L[0], L[1], L[2]);
        if (!seg) return;
        g.appendChild(el("line", {
          x1: P.sx(seg[0][0]), y1: P.sy(seg[0][1]), x2: P.sx(seg[1][0]), y2: P.sy(seg[1][1]), style: L[3]
        }));
      });
      var det = a1 * b2 - a2 * b1;
      var msg;
      if (det !== 0) {
        var x = (c1 * b2 - c2 * b1) / det, y = (a1 * c2 - a2 * c1) / det;
        g.appendChild(el("circle", { cx: P.sx(x), cy: P.sy(y), r: 6, style: S.pt }));
        g.appendChild(el("text", { x: P.sx(x) + 10, y: P.sy(y) - 10, style: S.labelStrong }, "(" + fmt(x) + ", " + fmt(y) + ")"));
        msg = "<b>Exactly one solution:</b> x = " + fmt(x) + ", y = " + fmt(y) +
          "<br>The lines have different slopes, so they cross once.";
      } else {
        var same = (a1 * c2 - a2 * c1) === 0 && (b1 * c2 - b2 * c1) === 0;
        msg = same
          ? "<b>Infinitely many solutions.</b> One equation is a multiple of the other — one line, drawn twice."
          : "<b>No solution.</b> Same slope, different intercepts: parallel lines that never meet.";
      }
      out.innerHTML = "Equation 1: " + a1 + "x + (" + b1 + ")y = " + c1 + "<br>" +
        "Equation 2: " + a2 + "x + (" + b2 + ")y = " + c2 + "<br>" +
        "a₁b₂ − a₂b₁ = " + det + "<br>" + msg;
    }

    var c = controls(host);
    [["a₁", function (v) { a1 = v; }], ["b₁", function (v) { b1 = v; }], ["c₁", function (v) { c1 = v; }]]
      .forEach(function (s, i) {
        c.appendChild(slider(s[0], -6, 6, 1, [a1, b1, c1][i], function (v) { s[1](v); draw(); }).wrap);
      });
    var c2row = controls(host);
    [["a₂", function (v) { a2 = v; }], ["b₂", function (v) { b2 = v; }], ["c₂", function (v) { c2 = v; }]]
      .forEach(function (s, i) {
        c2row.appendChild(slider(s[0], -6, 6, 1, [a2, b2, c2][i], function (v) { s[1](v); draw(); }).wrap);
      });
    draw();
  };

  /* ========================================== 4. absolute value / inequality */
  W.ineq = function (host) {
    var c0 = 2, r = 3, rel = "<";
    var P = Plot({ w: 660, h: 150, pad: { l: 20, r: 20, t: 34, b: 40 }, xmin: -10, xmax: 10, ymin: -1, ymax: 1, label: "Solution set of an absolute value inequality" });
    host.appendChild(P.svg);
    var g = P.layer();
    var out = readout(host);
    var y0 = P.sy(0);

    function band(x1, x2) {
      var a = P.sx(Math.max(x1, P.xmin)), b = P.sx(Math.min(x2, P.xmax));
      if (b <= a) return null;
      return el("rect", { x: a, y: y0 - 9, width: b - a, height: 18, style: S.fill, rx: 3 });
    }
    function dot(x, filled) {
      return el("circle", {
        cx: P.sx(x), cy: y0, r: 5.5,
        style: filled ? S.ptA : "fill:var(--surface);stroke:var(--plot-curve);stroke-width:2.5"
      });
    }

    function draw() {
      g.textContent = "";
      var closed = rel === "<=" || rel === ">=";
      var inside = rel === "<" || rel === "<=";
      var lo = c0 - r, hi = c0 + r;
      if (inside) { var bb = band(lo, hi); if (bb) g.appendChild(bb); }
      else {
        var b1 = band(P.xmin, lo); if (b1) g.appendChild(b1);
        var b2 = band(hi, P.xmax); if (b2) g.appendChild(b2);
      }
      g.appendChild(el("line", { x1: P.sx(-10), y1: y0, x2: P.sx(10), y2: y0, style: S.axis }));
      for (var i = -10; i <= 10; i++) {
        g.appendChild(el("line", { x1: P.sx(i), y1: y0 - 5, x2: P.sx(i), y2: y0 + 5, style: S.axis }));
        if (i % 2 === 0) g.appendChild(el("text", { x: P.sx(i), y: y0 + 22, "text-anchor": "middle", style: S.tick }, String(i)));
      }
      g.appendChild(el("line", { x1: P.sx(c0), y1: y0 - 20, x2: P.sx(c0), y2: y0 + 20, style: S.dash }));
      g.appendChild(el("text", { x: P.sx(c0), y: y0 - 26, "text-anchor": "middle", style: S.labelStrong }, "c = " + c0));
      g.appendChild(dot(lo, closed));
      g.appendChild(dot(hi, closed));
      var sym = rel === "<" ? "<" : rel === "<=" ? "≤" : rel === ">" ? ">" : "≥";
      out.innerHTML = "<b>|x − " + c0 + "| " + sym + " " + r + "</b><br>" +
        "“the distance from x to " + c0 + " is " + (inside ? "less" : "more") + " than " + r +
        (closed ? " or equal to it" : "") + "”<br>" +
        (inside
          ? "Solution: " + fmt(lo) + " " + sym + " x " + sym + " " + fmt(hi) +
            "  →  " + (closed ? "[" : "(") + fmt(lo) + ", " + fmt(hi) + (closed ? "]" : ")")
          : "Solution: x " + sym + " " + fmt(lo) + " or x " + sym + " " + fmt(hi) + "  — two separate pieces");
    }

    var cc = controls(host);
    cc.appendChild(slider("c", -8, 8, 1, c0, function (v) { c0 = v; draw(); }).wrap);
    cc.appendChild(slider("r", 0, 8, 1, r, function (v) { r = v; draw(); }).wrap);
    cc.appendChild(chips([
      { html: "|x−c| &lt; r", value: "<" }, { html: "≤", value: "<=" },
      { html: "&gt;", value: ">" }, { html: "≥", value: ">=" }
    ], 0, function (v) { rel = v; draw(); }));
    draw();
  };

  /* ================================================= 5. powers and roots ==== */
  W.powers = function (host) {
    var n = 2, mode = "int";
    var P = Plot({ w: 660, h: 400, xmin: -3, xmax: 3, ymin: -4, ymax: 8, label: "Graphs of power functions" });
    host.appendChild(P.svg);
    grid(P, 0.5, 1, { tickStep: 1, yTickStep: 2 });
    var g = P.layer();
    var out = readout(host);

    function f(x) {
      if (mode === "sqrt") return x < 0 ? NaN : Math.sqrt(x);
      if (mode === "cbrt") return Math.cbrt(x);
      if (n < 0 && x === 0) return NaN;
      if (n === 0) return 1;
      return Math.pow(x, n);
    }
    function name() {
      if (mode === "sqrt") return "y = √x = x^(1/2)";
      if (mode === "cbrt") return "y = ∛x = x^(1/3)";
      return "y = x^" + n;
    }
    function draw() {
      g.textContent = "";
      g.appendChild(curvePath(P, f, S.curve, 1200));
      [-2, -1, -0.5, 0.5, 1, 2].forEach(function (x) {
        var y = f(x);
        if (!isFinite(y) || y < P.ymin || y > P.ymax) return;
        g.appendChild(el("circle", { cx: P.sx(x), cy: P.sy(y), r: 3.5, style: S.pt }));
      });
      var rows = [-2, -0.5, 0.5, 2, 3].map(function (x) {
        var y = f(x);
        return "f(" + x + ") = " + (isFinite(y) ? fmt(y, 3) : "undefined");
      });
      var remark = mode === "sqrt"
        ? "√x needs x ≥ 0: no real number squares to a negative."
        : mode === "cbrt"
          ? "Odd roots are defined for every real number, negatives included."
          : n < 0
            ? "A negative exponent means a reciprocal: x^" + n + " = 1/x^" + -n + ", undefined at x = 0."
            : n % 2 === 0
              ? "An even power is never negative, and f(−x) = f(x): the graph is symmetric about the y-axis."
              : "An odd power keeps the sign of x, and f(−x) = −f(x): the graph is symmetric through the origin.";
      out.innerHTML = "<b>" + name() + "</b><br>" + rows.join(" · ") + "<br>" + remark;
    }

    var c = controls(host);
    var sl = slider("n", -3, 4, 1, n, function (v) { n = v; mode = "int"; draw(); });
    c.appendChild(sl.wrap);
    c.appendChild(chips([
      { html: "xⁿ", value: "int" }, { html: "√x", value: "sqrt" }, { html: "∛x", value: "cbrt" }
    ], 0, function (v) { mode = v; draw(); }));
    draw();
  };

  /* ======================================================= 6. quadratic ===== */
  W.quadratic = function (host) {
    var a = 1, b = -2, c = -3;
    var P = Plot({ w: 660, h: 420, xmin: -7, xmax: 7, ymin: -8, ymax: 10, label: "A parabola with its vertex, axis of symmetry, and roots" });
    host.appendChild(P.svg);
    grid(P, 1, 1, { tickStep: 2, yTickStep: 2 });
    var g = P.layer();
    var out = readout(host);

    function draw() {
      g.textContent = "";
      if (a === 0) {
        g.appendChild(curvePath(P, function (x) { return b * x + c; }, S.curve2));
        out.innerHTML = "<b>a = 0 — this is not a quadratic.</b> With no x² term the graph is the straight line y = " +
          b + "x + " + c + ". Quadratic means a ≠ 0.";
        return;
      }
      g.appendChild(curvePath(P, function (x) { return a * x * x + b * x + c; }, S.curve, 800));
      var xv = -b / (2 * a), yv = a * xv * xv + b * xv + c, disc = b * b - 4 * a * c;
      g.appendChild(el("line", { x1: P.sx(xv), y1: P.sy(P.ymin), x2: P.sx(xv), y2: P.sy(P.ymax), style: S.dash }));
      g.appendChild(el("circle", { cx: P.sx(xv), cy: P.sy(yv), r: 6, style: S.ptB }));
      g.appendChild(el("text", { x: P.sx(xv) + 10, y: P.sy(yv) + (a > 0 ? 18 : -10), style: S.labelStrong },
        "vertex (" + fmt(xv) + ", " + fmt(yv) + ")"));
      var rootsTxt;
      if (disc > 0) {
        var rts = [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)]
          .sort(function (u, v) { return u - v; });
        rts.forEach(function (r) {
          g.appendChild(el("circle", { cx: P.sx(r), cy: P.sy(0), r: 5.5, style: S.ptA }));
        });
        rootsTxt = "Two roots: x = " + fmt(rts[0], 3) + " and x = " + fmt(rts[1], 3) +
          ". The graph crosses the x-axis twice.";
      } else if (disc === 0) {
        g.appendChild(el("circle", { cx: P.sx(xv), cy: P.sy(0), r: 5.5, style: S.ptA }));
        rootsTxt = "One (double) root: x = " + fmt(xv, 3) + ". The vertex sits on the x-axis.";
      } else {
        rootsTxt = "No real root: the graph stays entirely " + (a > 0 ? "above" : "below") +
          " the x-axis, so no real x makes it zero.";
      }
      /* readable algebra: 1x² and + (−3) are correct but ugly */
      function lead(v, sym) { return v === 1 ? sym : v === -1 ? "−" + sym : v + sym; }
      function tail(v, sym) { return v === 0 ? "" : (v > 0 ? " + " : " − ") + (Math.abs(v) === 1 && sym ? sym : Math.abs(v) + sym); }
      var poly = lead(a, "x²") + tail(b, "x") + tail(c, "");
      var inner = xv === 0 ? "x²" : "(x " + (xv > 0 ? "− " : "+ ") + fmt(Math.abs(xv)) + ")²";
      var square = lead(a, inner) + tail(yv, "");
      out.innerHTML = "<b>y = " + poly + "</b><br>" +
        "Completed square: y = " + square + "<br>" +
        "Discriminant b² − 4ac = " + disc + ". " + rootsTxt;
    }

    var cc = controls(host);
    [["a", function (v) { a = v; }], ["b", function (v) { b = v; }], ["c", function (v) { c = v; }]]
      .forEach(function (s, i) {
        cc.appendChild(slider(s[0], -6, 6, 1, [a, b, c][i], function (v) { s[1](v); draw(); }).wrap);
      });
    draw();
  };

  /* ============================================================ 7. sets ==== */
  W.venn = function (host) {
    var pick = "inter";
    var W_ = 660, H = 300;
    var P = Plot({ w: W_, h: H, pad: { l: 0, r: 0, t: 0, b: 0 }, xmin: 0, xmax: W_, ymin: 0, ymax: H, label: "Venn diagram of two sets" });
    host.appendChild(P.svg);
    var svg = P.svg;
    var out = readout(host);
    var cxA = 265, cxB = 395, cy = 145, rr = 100;

    var defs = el("defs");
    function clipCircle(id, cx) {
      var cp = el("clipPath", { id: id });
      cp.appendChild(el("circle", { cx: cx, cy: cy, r: rr }));
      return cp;
    }
    var uid = Math.random().toString(36).slice(2, 7);
    defs.appendChild(clipCircle("ca" + uid, cxA));
    defs.appendChild(clipCircle("cb" + uid, cxB));
    svg.appendChild(defs);
    var g = P.layer();

    function draw() {
      g.textContent = "";
      /* the universe */
      g.appendChild(el("rect", { x: 30, y: 20, width: W_ - 60, height: H - 50, rx: 8, style: "fill:none;stroke:var(--plot-axis);stroke-width:1.25;stroke-dasharray:4 4" }));
      g.appendChild(el("text", { x: 42, y: 40, style: S.label }, "U"));

      var hi = "fill:var(--plot-curve);opacity:.22;stroke:none";
      if (pick === "union") {
        g.appendChild(el("circle", { cx: cxA, cy: cy, r: rr, style: hi }));
        g.appendChild(el("circle", { cx: cxB, cy: cy, r: rr, style: hi }));
      } else if (pick === "inter") {
        var clip = el("g", { "clip-path": "url(#ca" + uid + ")" });
        clip.appendChild(el("circle", { cx: cxB, cy: cy, r: rr, style: hi }));
        g.appendChild(clip);
      } else if (pick === "diff") {
        var maskId = "m" + uid;
        var mask = el("mask", { id: maskId });
        mask.appendChild(el("rect", { x: 0, y: 0, width: W_, height: H, fill: "white" }));
        mask.appendChild(el("circle", { cx: cxB, cy: cy, r: rr, fill: "black" }));
        g.appendChild(mask);
        g.appendChild(el("circle", { cx: cxA, cy: cy, r: rr, mask: "url(#" + maskId + ")", style: hi }));
      } else if (pick === "comp") {
        var maskId2 = "n" + uid;
        var mask2 = el("mask", { id: maskId2 });
        mask2.appendChild(el("rect", { x: 0, y: 0, width: W_, height: H, fill: "white" }));
        mask2.appendChild(el("circle", { cx: cxA, cy: cy, r: rr, fill: "black" }));
        g.appendChild(mask2);
        g.appendChild(el("rect", { x: 30, y: 20, width: W_ - 60, height: H - 50, rx: 8, mask: "url(#" + maskId2 + ")", style: hi }));
      }
      g.appendChild(el("circle", { cx: cxA, cy: cy, r: rr, style: "fill:none;stroke:var(--plot-curve);stroke-width:2.5" }));
      g.appendChild(el("circle", { cx: cxB, cy: cy, r: rr, style: "fill:none;stroke:var(--plot-curve-2);stroke-width:2.5" }));
      g.appendChild(el("text", { x: cxA - 96, y: cy - 72, style: S.labelStrong }, "A"));
      g.appendChild(el("text", { x: cxB + 88, y: cy - 72, style: S.labelStrong }, "B"));

      var texts = {
        union: ["A ∪ B", "every x that is in A, or in B, or in both. “Or” in mathematics always includes “both”."],
        inter: ["A ∩ B", "every x that is in A and also in B."],
        diff: ["A ∖ B", "every x in A that is not in B."],
        comp: ["Aᶜ (complement of A in U)", "every x in the universe U that is not in A."]
      };
      out.innerHTML = "<b>" + texts[pick][0] + "</b><br>" + texts[pick][1];
    }

    var c = controls(host);
    c.appendChild(chips([
      { html: "A ∩ B", value: "inter" }, { html: "A ∪ B", value: "union" },
      { html: "A ∖ B", value: "diff" }, { html: "Aᶜ", value: "comp" }
    ], 0, function (v) { pick = v; draw(); }));
    draw();
  };

  /* ====================================================== 8. truth table === */
  W.truthtable = function (host) {
    var p = true, q = false;
    var table = h("div", { class: "tbl-wrap" });
    host.appendChild(table);
    var out = readout(host);

    function draw() {
      var rows = [[true, true], [true, false], [false, true], [false, false]];
      var html = "<table><thead><tr><th>P</th><th>Q</th><th>not P</th><th>P and Q</th><th>P or Q</th>" +
        "<th>P ⇒ Q</th><th>Q ⇒ P</th><th>not Q ⇒ not P</th></tr></thead><tbody>";
      rows.forEach(function (r) {
        var on = r[0] === p && r[1] === q;
        var v = [!r[0], r[0] && r[1], r[0] || r[1], !r[0] || r[1], !r[1] || r[0], r[1] || !r[0]];
        html += "<tr" + (on ? ' style="background:var(--accent-soft);font-weight:650"' : "") + ">";
        html += "<td>" + (r[0] ? "T" : "F") + "</td><td>" + (r[1] ? "T" : "F") + "</td>";
        v.forEach(function (x) { html += "<td>" + (x ? "T" : "F") + "</td>"; });
        html += "</tr>";
      });
      html += "</tbody></table>";
      table.innerHTML = html;
      out.innerHTML = "<b>Read the highlighted row.</b> Notice two columns that always agree: " +
        "P ⇒ Q and its contrapositive not Q ⇒ not P. They are the same statement. " +
        "The converse Q ⇒ P is a different column — proving one does not prove the other.";
    }

    var c = controls(host);
    c.appendChild(chips([{ html: "P is true", value: true }, { html: "P is false", value: false }], 0,
      function (v) { p = v; draw(); }));
    c.appendChild(chips([{ html: "Q is true", value: true }, { html: "Q is false", value: false }], 1,
      function (v) { q = v; draw(); }));
    draw();
  };

  window.BMWidgets = W;
  window.BMPlot = { Plot: Plot, grid: grid, curvePath: curvePath, el: el, S: S, slider: slider, chips: chips, controls: controls, readout: readout, note: note, dragX: dragX, fmt: fmt };
})();
