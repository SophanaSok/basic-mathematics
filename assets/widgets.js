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


  /* ---------------------------------------------------------------------------
     Figures for Parts II–IV. Same conventions as above: build the frame once,
     redraw a single <g> on every change, and let the readout say in words what
     the picture is claiming.
     --------------------------------------------------------------------------- */

  /* drag whichever of several points is nearest the pointer, in data coordinates */
  function dragPoints(P, pts, onMove, opts) {
    opts = opts || {};
    var active = -1;
    P.svg.style.touchAction = "none";
    function pick(e) {
      var l = P.local(e), arr = pts(), best = -1, bd = 1e9;
      arr.forEach(function (p, i) {
        var d = Math.sqrt(Math.pow(P.sx(p.x) - l.x, 2) + Math.pow(P.sy(p.y) - l.y, 2));
        if (d < bd) { bd = d; best = i; }
      });
      return bd <= (opts.radius || 30) ? best : -1;
    }
    function send(e) {
      var l = P.local(e);
      onMove(active, P.ix(l.x), P.iy(l.y));
    }
    P.svg.addEventListener("pointerdown", function (e) {
      active = pick(e);
      if (active < 0) return;
      e.preventDefault();
      if (P.svg.setPointerCapture) P.svg.setPointerCapture(e.pointerId);
      send(e);
    });
    P.svg.addEventListener("pointermove", function (e) {
      if (active < 0) return;
      e.preventDefault();
      send(e);
    });
    function end() { active = -1; }
    P.svg.addEventListener("pointerup", end);
    P.svg.addEventListener("pointercancel", end);
  }

  /* polygon from an array of [px, py] pairs already in screen coordinates */
  function poly(points, style) {
    return el("polygon", {
      points: points.map(function (p) { return p[0] + "," + p[1]; }).join(" "),
      style: style
    });
  }

  /* an arrow drawn in data coordinates */
  function arrowTo(P, x1, y1, x2, y2, color, width) {
    var g = el("g");
    var p1 = { x: P.sx(x1), y: P.sy(y1) }, p2 = { x: P.sx(x2), y: P.sy(y2) };
    var dx = p2.x - p1.x, dy = p2.y - p1.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / L, uy = dy / L, head = Math.min(12, L * 0.45);
    g.appendChild(el("line", {
      x1: p1.x, y1: p1.y, x2: p2.x - ux * head * 0.6, y2: p2.y - uy * head * 0.6,
      style: "stroke:" + color + ";stroke-width:" + (width || 2.5) + ";stroke-linecap:round"
    }));
    g.appendChild(el("path", {
      d: "M" + p2.x + " " + p2.y +
        " L" + (p2.x - ux * head + uy * head * 0.42) + " " + (p2.y - uy * head - ux * head * 0.42) +
        " L" + (p2.x - ux * head - uy * head * 0.42) + " " + (p2.y - uy * head + ux * head * 0.42) + " Z",
      style: "fill:" + color + ";stroke:none"
    }));
    return g;
  }

  /* an arc from one bearing to another (degrees, counterclockwise from east) */
  function arcAt(P, cx, cy, from, to, rpx, style) {
    var c = { x: P.sx(cx), y: P.sy(cy) };
    var a0 = -from * Math.PI / 180, a1 = -to * Math.PI / 180;
    var large = Math.abs(to - from) > 180 ? 1 : 0;
    var sweep = to > from ? 0 : 1;
    return el("path", {
      d: "M" + (c.x + rpx * Math.cos(a0)) + " " + (c.y + rpx * Math.sin(a0)) +
        " A" + rpx + " " + rpx + " 0 " + large + " " + sweep + " " +
        (c.x + rpx * Math.cos(a1)) + " " + (c.y + rpx * Math.sin(a1)),
      style: style || "stroke:var(--plot-curve-2);stroke-width:2;fill:none"
    });
  }

  function label(P, x, y, text, dx, dy, style) {
    return el("text", {
      x: P.sx(x) + (dx || 0), y: P.sy(y) + (dy || 0),
      "text-anchor": "middle", style: style || S.labelStrong
    }, text);
  }

  /* ============================= 9. parallels cut by a transversal ==========
     Eight angles, only two different numbers, and which pairs are forced. */
  W.transversal = function (host) {
    var th = 55, show = "corr";
    var P = Plot({
      w: 660, h: 360, pad: { l: 16, r: 16, t: 16, b: 16 },
      xmin: -6, xmax: 6, ymin: -3.6, ymax: 3.6,
      label: "Two parallel lines cut by a transversal, with all eight angles marked"
    });
    host.appendChild(P.svg);
    var g = P.layer();
    var out = readout(host);

    function draw() {
      g.textContent = "";
      var m = Math.tan(th * Math.PI / 180);
      var yTop = 1.5, yBot = -1.5;
      [yTop, yBot].forEach(function (y) {
        g.appendChild(el("line", { x1: P.sx(-6), y1: P.sy(y), x2: P.sx(6), y2: P.sy(y), style: S.curve }));
      });
      var xAt = function (y) { return Math.abs(m) < 1e-9 ? 0 : y / m; };
      var far = 3.4;
      g.appendChild(el("line", {
        x1: P.sx(xAt(far)), y1: P.sy(far), x2: P.sx(xAt(-far)), y2: P.sy(-far), style: S.curve2
      }));
      var A = { x: xAt(yTop), y: yTop }, B = { x: xAt(yBot), y: yBot };
      var other = 180 - th;
      var slots = [
        { from: 0, to: th, val: th, key: "a" },
        { from: th, to: 180, val: other, key: "b" },
        { from: 180, to: 180 + th, val: th, key: "c" },
        { from: 180 + th, to: 360, val: other, key: "d" }
      ];
      var highlight = {
        corr: { A: ["c"], B: ["c"] },
        alt: { A: ["c"], B: ["a"] },
        vert: { A: ["a", "c"], B: [] },
        none: { A: [], B: [] }
      }[show];
      [[A, "A"], [B, "B"]].forEach(function (pair) {
        var pt = pair[0], name = pair[1];
        slots.forEach(function (s) {
          var on = highlight[name].indexOf(s.key) >= 0;
          var mid = ((s.from + s.to) / 2) * Math.PI / 180;
          g.appendChild(arcAt(P, pt.x, pt.y, s.from, s.to, on ? 30 : 24,
            on ? "stroke:var(--plot-curve-2);stroke-width:9;fill:none;opacity:.35"
               : "stroke:var(--plot-axis);stroke-width:1.5;fill:none"));
          g.appendChild(el("text", {
            x: P.sx(pt.x) + 46 * Math.cos(mid),
            y: P.sy(pt.y) - 46 * Math.sin(mid) + 4,
            "text-anchor": "middle", style: on ? S.labelStrong : S.tick
          }, fmt(s.val) + "°"));
        });
        g.appendChild(el("circle", { cx: P.sx(pt.x), cy: P.sy(pt.y), r: 5, style: S.pt }));
      });
      out.innerHTML = {
        corr: "<b>Corresponding angles.</b> Same position at each crossing — both " + fmt(th) +
          "°. The transversal meets the two lines at the same tilt, so it cannot make different angles with them.",
        alt: "<b>Alternate interior angles.</b> Opposite sides of the transversal, inside the strip — both " +
          fmt(th) + "°. A corresponding pair followed by a vertical pair.",
        vert: "<b>Vertical angles.</b> Opposite angles at one crossing are equal: both " + fmt(th) +
          "°. Each of them plus the same neighbour of " + fmt(other) + "° makes a straight 180°.",
        none: "Eight angles, two numbers. Every angle here is either " + fmt(th) + "° or " + fmt(other) + "°."
      }[show] + "<br>At each crossing " + fmt(th) + "° + " + fmt(other) + "° = 180°.";
    }

    var c = controls(host);
    c.appendChild(slider("angle", 20, 160, 5, th, function (v) { th = v; draw(); },
      function (v) { return v + "°"; }).wrap);
    c.appendChild(chips([
      { html: "corresponding", value: "corr" }, { html: "alternate", value: "alt" },
      { html: "vertical", value: "vert" }, { html: "all eight", value: "none" }
    ], 0, function (v) { show = v; draw(); }));
    draw();
  };

  /* ============================ 10. Pythagoras by dissection ================
     One square, two ways of filling it, with the same four triangles. */
  W.pythagoras = function (host) {
    var a = 3, b = 4;
    var P = Plot({
      w: 660, h: 330, pad: { l: 8, r: 8, t: 8, b: 8 },
      xmin: 0, xmax: 22, ymin: 0, ymax: 11,
      label: "Two dissections of the same square, showing a squared plus b squared equals c squared"
    });
    host.appendChild(P.svg);
    var g = P.layer();
    var out = readout(host);
    var TRI = "fill:var(--plot-fill);stroke:var(--plot-curve);stroke-width:1.5";
    var SQC = "fill:var(--accent-soft);stroke:var(--plot-curve-2);stroke-width:2";
    var SQAB = "fill:var(--accent-2-soft);stroke:var(--plot-curve-2);stroke-width:2";

    function draw() {
      g.textContent = "";
      var s = a + b, k = 8.6 / s;
      function frame(x0, y0) {
        return function (u, v) { return [P.sx(x0 + u * k), P.sy(y0 + v * k)]; };
      }
      [[1.6, "left"], [12.2, "right"]].forEach(function (pair) {
        var f = frame(pair[0], 1.2), side = pair[1];
        g.appendChild(poly([f(0, 0), f(s, 0), f(s, s), f(0, s)],
          "fill:none;stroke:var(--plot-axis);stroke-width:2"));
        if (side === "left") {
          g.appendChild(poly([f(a, 0), f(s, a), f(b, s), f(0, b)], SQC));
          [[[0, 0], [a, 0], [0, b]], [[a, 0], [s, 0], [s, a]],
           [[s, a], [s, s], [b, s]], [[b, s], [0, s], [0, b]]].forEach(function (T) {
            g.appendChild(poly(T.map(function (p) { return f(p[0], p[1]); }), TRI));
          });
          var cm = f(s / 2, s / 2);
          g.appendChild(el("text", { x: cm[0], y: cm[1] + 6, "text-anchor": "middle", style: S.labelStrong }, "c²"));
        } else {
          g.appendChild(poly([f(0, b), f(a, b), f(a, s), f(0, s)], SQAB));
          g.appendChild(poly([f(a, 0), f(s, 0), f(s, b), f(a, b)], SQAB));
          [[[0, 0], [a, 0], [a, b]], [[0, 0], [a, b], [0, b]],
           [[a, b], [s, b], [s, s]], [[a, b], [s, s], [a, s]]].forEach(function (T) {
            g.appendChild(poly(T.map(function (p) { return f(p[0], p[1]); }), TRI));
          });
          var ca = f(a / 2, (b + s) / 2), cb = f((a + s) / 2, b / 2);
          g.appendChild(el("text", { x: ca[0], y: ca[1] + 6, "text-anchor": "middle", style: S.labelStrong }, "a²"));
          g.appendChild(el("text", { x: cb[0], y: cb[1] + 6, "text-anchor": "middle", style: S.labelStrong }, "b²"));
        }
      });
      var c2 = a * a + b * b;
      out.innerHTML = "<b>a = " + a + ", b = " + b + ", c = √" + c2 + " ≈ " + fmt(Math.sqrt(c2), 3) + "</b><br>" +
        "Both outer squares have side a + b = " + s + ", hence area " + s * s +
        ", and both hold the same four triangles. So the leftovers agree: " +
        "c² = a² + b², here " + c2 + " = " + a * a + " + " + b * b + ".";
    }

    var c = controls(host);
    c.appendChild(slider("a", 1, 6, 1, a, function (v) { a = v; draw(); }).wrap);
    c.appendChild(slider("b", 1, 6, 1, b, function (v) { b = v; draw(); }).wrap);
    note(host, "The four pale triangles are identical in both pictures — only their arrangement changes.");
    draw();
  };

  /* ================================ 11. motions of the plane ================ */
  W.isometry = function (host) {
    var kind = "trans", dx = 3, dy = 1, ang = 60, axis = "x";
    var P = Plot({
      w: 660, h: 420, xmin: -7, xmax: 7, ymin: -4.5, ymax: 4.5,
      label: "A figure and its image under a motion of the plane"
    });
    host.appendChild(P.svg);
    grid(P, 1, 1, { tickStep: 2, yTickStep: 2 });
    var g = P.layer();
    var out = readout(host);
    /* a deliberately lopsided F, so that a reflection is unmistakable */
    var F = [[0, 0], [0, 3], [2, 3], [2, 2.3], [0.8, 2.3], [0.8, 1.7], [1.7, 1.7], [1.7, 1], [0.8, 1], [0.8, 0]];

    function map(p) {
      var x = p[0], y = p[1];
      if (kind === "trans") return [x + dx, y + dy];
      if (kind === "rot") {
        var t = ang * Math.PI / 180;
        return [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];
      }
      if (kind === "refl") {
        if (axis === "x") return [x, -y];
        if (axis === "y") return [-x, y];
        return [y, x];
      }
      return [1.6 * x, 1.6 * y];
    }
    function px(pts) { return pts.map(function (p) { return [P.sx(p[0]), P.sy(p[1])]; }); }
    function dist(p, q) { return Math.sqrt(Math.pow(p[0] - q[0], 2) + Math.pow(p[1] - q[1], 2)); }

    function draw() {
      g.textContent = "";
      if (kind === "refl") {
        var L = axis === "x" ? [[-7, 0], [7, 0]] : axis === "y" ? [[0, -4.5], [0, 4.5]] : [[-4.5, -4.5], [4.5, 4.5]];
        g.appendChild(el("line", {
          x1: P.sx(L[0][0]), y1: P.sy(L[0][1]), x2: P.sx(L[1][0]), y2: P.sy(L[1][1]),
          style: "stroke:var(--accent-2);stroke-width:2.5;stroke-dasharray:7 5"
        }));
      }
      g.appendChild(poly(px(F), "fill:none;stroke:var(--plot-axis);stroke-width:2;stroke-dasharray:5 4"));
      var img = F.map(map);
      g.appendChild(poly(px(img), "fill:var(--plot-fill);stroke:var(--plot-curve);stroke-width:2.5"));
      if (kind === "rot") g.appendChild(el("circle", { cx: P.sx(0), cy: P.sy(0), r: 5, style: S.ptB }));
      [F[0], F[2]].forEach(function (q) {
        g.appendChild(el("circle", { cx: P.sx(q[0]), cy: P.sy(q[1]), r: 4, style: S.pt }));
      });
      [img[0], img[2]].forEach(function (q) {
        g.appendChild(el("circle", { cx: P.sx(q[0]), cy: P.sy(q[1]), r: 4.5, style: S.ptA }));
      });
      var d0 = dist(F[0], F[2]), d1 = dist(img[0], img[2]);
      var name = {
        trans: "Translation by (" + dx + ", " + dy + ")",
        rot: "Rotation by " + ang + "° about the origin",
        refl: "Reflection in " + (axis === "x" ? "the x-axis" : axis === "y" ? "the y-axis" : "the line y = x"),
        dil: "Dilation by 1.6 about the origin"
      }[kind];
      var formula = {
        trans: "(x, y) ↦ (x + " + dx + ", y + " + dy + ")",
        rot: "(x, y) ↦ (x cos θ − y sin θ, x sin θ + y cos θ)",
        refl: axis === "x" ? "(x, y) ↦ (x, −y)" : axis === "y" ? "(x, y) ↦ (−x, y)" : "(x, y) ↦ (y, x)",
        dil: "(x, y) ↦ (1.6x, 1.6y)"
      }[kind];
      out.innerHTML = "<b>" + name + "</b> &nbsp; " + formula + "<br>" +
        "The two marked points were " + fmt(d0, 3) + " apart; their images are " + fmt(d1, 3) + " apart. " +
        (kind === "dil"
          ? "Every distance is multiplied by 1.6, so this is <em>not</em> an isometry: the shape survives, the size does not."
          : "Distance unchanged — the figure has moved, not changed.");
    }

    var c = controls(host);
    c.appendChild(chips([
      { html: "translation", value: "trans" }, { html: "rotation", value: "rot" },
      { html: "reflection", value: "refl" }, { html: "dilation", value: "dil" }
    ], 0, function (v) { kind = v; draw(); }));
    c.appendChild(slider("dx", -4, 4, 1, dx, function (v) { dx = v; kind = "trans"; draw(); }).wrap);
    c.appendChild(slider("dy", -3, 3, 1, dy, function (v) { dy = v; kind = "trans"; draw(); }).wrap);
    c.appendChild(slider("θ", 0, 360, 15, ang, function (v) { ang = v; kind = "rot"; draw(); },
      function (v) { return v + "°"; }).wrap);
    c.appendChild(chips([
      { html: "in x-axis", value: "x" }, { html: "in y-axis", value: "y" }, { html: "in y = x", value: "d" }
    ], 0, function (v) { axis = v; kind = "refl"; draw(); }));
    note(host, "Pick a motion, then move its sliders; the dashed F is the original.");
    draw();
  };

  /* ========================== 12. scaling: lengths by r, areas by r² ======== */
  W.scaling = function (host) {
    var r = 1.5, shape = "tri";
    var P = Plot({
      w: 660, h: 380, xmin: -1, xmax: 11, ymin: -1, ymax: 6,
      label: "A figure and a scaled copy of it"
    });
    host.appendChild(P.svg);
    grid(P, 1, 1, { tickStep: 2, yTickStep: 2 });
    var g = P.layer();
    var out = readout(host);
    var base = {
      tri: { pts: [[0, 0], [3, 0], [1, 2]], area: 3, per: 3 + Math.sqrt(5) + Math.sqrt(4 + 4), name: "triangle" },
      rect: { pts: [[0, 0], [3, 0], [3, 2], [0, 2]], area: 6, per: 10, name: "rectangle" }
    };

    function draw() {
      g.textContent = "";
      var B = base[shape];
      var scaled = B.pts.map(function (p) { return [p[0] * r, p[1] * r]; });
      function px(pts) { return pts.map(function (p) { return [P.sx(p[0]), P.sy(p[1])]; }); }
      g.appendChild(poly(px(scaled), "fill:var(--plot-fill);stroke:var(--plot-curve);stroke-width:2.5"));
      g.appendChild(poly(px(B.pts), "fill:var(--accent-soft);stroke:var(--plot-curve-2);stroke-width:2"));
      out.innerHTML = "<b>Scale factor r = " + fmt(r, 2) + "</b><br>" +
        "Perimeter " + fmt(B.per, 2) + " → " + fmt(B.per * r, 2) + " (×" + fmt(r, 2) + ") &nbsp;·&nbsp; " +
        "Area " + fmt(B.area, 2) + " → " + fmt(B.area * r * r, 2) + " (×" + fmt(r * r, 2) + ")<br>" +
        "Every length is multiplied by r, and area is a product of two lengths — so area is multiplied by r².";
    }

    var c = controls(host);
    c.appendChild(slider("r", 0.5, 3, 0.1, r, function (v) { r = v; draw(); },
      function (v) { return fmt(v, 2); }).wrap);
    c.appendChild(chips([{ html: "triangle", value: "tri" }, { html: "rectangle", value: "rect" }],
      0, function (v) { shape = v; draw(); }));
    draw();
  };

  /* ================== 13. a disc as the limit of inscribed polygons ========= */
  W.discpoly = function (host) {
    var n = 6;
    var P = Plot({
      w: 660, h: 380, pad: { l: 20, r: 20, t: 16, b: 16 },
      xmin: -1.5, xmax: 1.5, ymin: -0.86, ymax: 0.86,
      label: "A regular polygon inscribed in a circle"
    });
    host.appendChild(P.svg);
    var g = P.layer();
    var out = readout(host);

    function draw() {
      g.textContent = "";
      g.appendChild(el("circle", {
        cx: P.sx(0), cy: P.sy(0), r: P.sx(1) - P.sx(0),
        style: "fill:none;stroke:var(--plot-axis);stroke-width:2;stroke-dasharray:5 4"
      }));
      var pts = [], i;
      for (i = 0; i < n; i++) {
        var t = (2 * Math.PI * i) / n - Math.PI / 2;
        pts.push([P.sx(Math.cos(t)), P.sy(Math.sin(t))]);
      }
      g.appendChild(poly(pts, "fill:var(--plot-fill);stroke:var(--plot-curve);stroke-width:2.5"));
      /* the n triangles the polygon is cut into */
      for (i = 0; i < n; i++) {
        g.appendChild(el("line", {
          x1: P.sx(0), y1: P.sy(0), x2: pts[i][0], y2: pts[i][1],
          style: "stroke:var(--plot-grid);stroke-width:1"
        }));
      }
      g.appendChild(el("circle", { cx: P.sx(0), cy: P.sy(0), r: 4, style: S.pt }));
      var area = (n / 2) * Math.sin((2 * Math.PI) / n);
      var per = 2 * n * Math.sin(Math.PI / n);
      out.innerHTML = "<b>n = " + n + " sides, radius 1</b><br>" +
        "Polygon area = (n/2)·sin(2π/n) = " + fmt(area, 5) +
        " &nbsp;→&nbsp; π ≈ " + fmt(Math.PI, 5) + "<br>" +
        "Polygon perimeter = 2n·sin(π/n) = " + fmt(per, 5) +
        " &nbsp;→&nbsp; 2π ≈ " + fmt(2 * Math.PI, 5) + "<br>" +
        "Missing from the circle: " + fmt(Math.PI - area, 5) + " of area. " +
        (n >= 40 ? "At this many sides the polygon and the circle are hard to tell apart."
                 : "Push n higher and watch the gap close.");
    }

    var c = controls(host);
    c.appendChild(slider("n", 3, 60, 1, n, function (v) { n = v; draw(); }).wrap);
    draw();
  };

  /* ================= 14. the distance formula as a right triangle =========== */
  W.distance = function (host) {
    var A = { x: -3, y: -1 }, B = { x: 2, y: 3 };
    var P = Plot({
      w: 660, h: 420, xmin: -6, xmax: 6, ymin: -4, ymax: 4.5,
      label: "Two points, the right triangle between them, and their distance"
    });
    host.appendChild(P.svg);
    grid(P, 1, 1, { tickStep: 2, yTickStep: 2 });
    var g = P.layer();
    var out = readout(host);

    function draw() {
      g.textContent = "";
      var C = { x: B.x, y: A.y };
      g.appendChild(el("line", { x1: P.sx(A.x), y1: P.sy(A.y), x2: P.sx(C.x), y2: P.sy(C.y), style: S.dash }));
      g.appendChild(el("line", { x1: P.sx(C.x), y1: P.sy(C.y), x2: P.sx(B.x), y2: P.sy(B.y), style: S.dash }));
      g.appendChild(el("line", {
        x1: P.sx(A.x), y1: P.sy(A.y), x2: P.sx(B.x), y2: P.sy(B.y), style: S.curve
      }));
      /* the right angle at C */
      if (A.x !== B.x && A.y !== B.y) {
        var sgx = B.x > A.x ? -1 : 1, sgy = B.y > A.y ? 1 : -1, u = 11;
        g.appendChild(el("path", {
          d: "M" + (P.sx(C.x) + sgx * u) + " " + P.sy(C.y) +
             " L" + (P.sx(C.x) + sgx * u) + " " + (P.sy(C.y) - sgy * u) +
             " L" + P.sx(C.x) + " " + (P.sy(C.y) - sgy * u),
          style: "fill:none;stroke:var(--plot-axis);stroke-width:1.5"
        }));
      }
      var dx = Math.abs(B.x - A.x), dy = Math.abs(B.y - A.y);
      g.appendChild(label(P, (A.x + C.x) / 2, A.y, "|Δx| = " + fmt(dx), 0, B.y > A.y ? 20 : -12, S.label));
      g.appendChild(label(P, C.x, (A.y + B.y) / 2, "|Δy| = " + fmt(dy), B.x > A.x ? 34 : -34, 4, S.label));
      [[A, "A", S.ptA], [B, "B", S.ptB]].forEach(function (t) {
        g.appendChild(el("circle", { cx: P.sx(t[0].x), cy: P.sy(t[0].y), r: 7, style: t[2] }));
        g.appendChild(label(P, t[0].x, t[0].y, t[1] + " (" + fmt(t[0].x) + ", " + fmt(t[0].y) + ")", 0, -16));
      });
      var d2 = dx * dx + dy * dy;
      out.innerHTML = "<b>AB = √(" + fmt(dx) + "² + " + fmt(dy) + "²) = √" + fmt(d2) + " = " + fmt(Math.sqrt(d2), 4) + "</b><br>" +
        "The dashed legs are horizontal and vertical, so the angle between them is right and Pythagoras applies. " +
        "That is the whole content of the distance formula.";
    }

    dragPoints(P, function () { return [A, B]; }, function (i, x, y) {
      var p = i === 0 ? A : B;
      p.x = Math.max(-6, Math.min(6, Math.round(x)));
      p.y = Math.max(-4, Math.min(4, Math.round(y)));
      draw();
    });
    note(host, "Drag either point. Coordinates snap to whole numbers.");
    draw();
  };

  /* ===================== 15. the circle as an equation ====================== */
  W.circleeq = function (host) {
    var h0 = 1, k0 = -1, r = 3;
    var P = Plot({
      w: 660, h: 420, xmin: -7, xmax: 7, ymin: -5, ymax: 5,
      label: "A circle with adjustable centre and radius"
    });
    host.appendChild(P.svg);
    grid(P, 1, 1, { tickStep: 2, yTickStep: 2 });
    var g = P.layer();
    var out = readout(host);

    function draw() {
      g.textContent = "";
      g.appendChild(el("circle", {
        cx: P.sx(h0), cy: P.sy(k0), r: Math.abs(P.sx(r) - P.sx(0)),
        style: "fill:var(--plot-fill);stroke:var(--plot-curve);stroke-width:2.5"
      }));
      g.appendChild(arrowTo(P, h0, k0, h0 + r, k0, "var(--plot-curve-2)", 2));
      g.appendChild(el("circle", { cx: P.sx(h0), cy: P.sy(k0), r: 5, style: S.ptB }));
      g.appendChild(label(P, h0, k0, "(" + h0 + ", " + k0 + ")", 0, -14));
      g.appendChild(label(P, h0 + r / 2, k0, "r = " + r, 0, -10, S.label));
      function term(v, name) {
        return v === 0 ? name : "(" + name + (v > 0 ? " − " : " + ") + Math.abs(v) + ")";
      }
      var D = -2 * h0, E = -2 * k0, F = h0 * h0 + k0 * k0 - r * r;
      function sgn(v, name) { return v === 0 ? "" : (v > 0 ? " + " + v + name : " − " + Math.abs(v) + name); }
      out.innerHTML = "<b>" + term(h0, "x") + "² + " + term(k0, "y") + "² = " + r * r + "</b><br>" +
        "Expanded: x² + y²" + sgn(D, "x") + sgn(E, "y") + sgn(F, "") + " = 0<br>" +
        "Going the other way — from the expanded form back to the centre and radius — is completing the square, " +
        "once in x and once in y.";
    }

    var c = controls(host);
    c.appendChild(slider("centre x", -4, 4, 1, h0, function (v) { h0 = v; draw(); }).wrap);
    c.appendChild(slider("centre y", -3, 3, 1, k0, function (v) { k0 = v; draw(); }).wrap);
    c.appendChild(slider("r", 1, 4, 1, r, function (v) { r = v; draw(); }).wrap);
    draw();
  };

  /* =============== 16. arithmetic on points: sum, difference, multiple ====== */
  W.pointops = function (host) {
    var A = { x: 3, y: 1 }, B = { x: 1, y: 3 }, t = 1.6, op = "sum";
    var P = Plot({
      w: 660, h: 430, xmin: -6, xmax: 6, ymin: -4, ymax: 4.6,
      label: "Adding, subtracting and scaling points of the plane"
    });
    host.appendChild(P.svg);
    grid(P, 1, 1, { tickStep: 2, yTickStep: 2 });
    var g = P.layer();
    var out = readout(host);
    var C1 = "var(--plot-curve)", C2 = "var(--plot-curve-2)", C3 = "var(--accent-2)";

    function draw() {
      g.textContent = "";
      g.appendChild(arrowTo(P, 0, 0, A.x, A.y, C1));
      g.appendChild(label(P, A.x, A.y, "A (" + fmt(A.x) + ", " + fmt(A.y) + ")", 0, -14));
      var R, txt;
      if (op === "mult") {
        R = { x: t * A.x, y: t * A.y };
        g.appendChild(el("line", {
          x1: P.sx(-6 * A.x), y1: P.sy(-6 * A.y), x2: P.sx(6 * A.x), y2: P.sy(6 * A.y),
          style: "stroke:var(--plot-grid);stroke-width:1.5;stroke-dasharray:4 4"
        }));
        g.appendChild(arrowTo(P, 0, 0, R.x, R.y, C3, 3));
        txt = "<b>tA = (" + fmt(t * A.x, 2) + ", " + fmt(t * A.y, 2) + ")</b> with t = " + fmt(t, 2) + "<br>" +
          "Multiplying both coordinates by t keeps the point on the line through 0 and A: it stretches by |t|, " +
          "and flips to the far side of the origin when t < 0.";
      } else {
        g.appendChild(arrowTo(P, 0, 0, B.x, B.y, C2));
        g.appendChild(label(P, B.x, B.y, "B (" + fmt(B.x) + ", " + fmt(B.y) + ")", 0, -14));
        if (op === "sum") {
          R = { x: A.x + B.x, y: A.y + B.y };
          g.appendChild(poly([[P.sx(0), P.sy(0)], [P.sx(A.x), P.sy(A.y)], [P.sx(R.x), P.sy(R.y)], [P.sx(B.x), P.sy(B.y)]],
            "fill:var(--plot-fill);stroke:var(--plot-grid);stroke-width:1.5;stroke-dasharray:4 4"));
          g.appendChild(arrowTo(P, 0, 0, R.x, R.y, C3, 3));
          txt = "<b>A + B = (" + fmt(R.x) + ", " + fmt(R.y) + ")</b><br>" +
            "Add coordinate by coordinate, and the answer is the fourth corner of the parallelogram with sides 0A and 0B. " +
            "Arithmetic and picture agree.";
        } else {
          R = { x: B.x - A.x, y: B.y - A.y };
          g.appendChild(arrowTo(P, A.x, A.y, B.x, B.y, C3, 3));
          g.appendChild(arrowTo(P, 0, 0, R.x, R.y, C3, 2));
          g.appendChild(label(P, R.x, R.y, "B − A", 0, -14));
          txt = "<b>B − A = (" + fmt(R.x) + ", " + fmt(R.y) + ")</b><br>" +
            "The same arrow appears twice: once from A to B, once from the origin. " +
            "B − A records a displacement, not a place — which is why the two arrows are parallel and equally long.";
        }
      }
      if (op !== "diff") {
        g.appendChild(el("circle", { cx: P.sx(R.x), cy: P.sy(R.y), r: 6, style: S.pt }));
      }
      out.innerHTML = txt;
    }

    dragPoints(P, function () { return [A, B]; }, function (i, x, y) {
      var p = i === 0 ? A : B;
      p.x = Math.max(-5, Math.min(5, Math.round(x)));
      p.y = Math.max(-4, Math.min(4, Math.round(y)));
      draw();
    });
    var c = controls(host);
    c.appendChild(chips([
      { html: "A + B", value: "sum" }, { html: "B − A", value: "diff" }, { html: "tA", value: "mult" }
    ], 0, function (v) { op = v; draw(); }));
    c.appendChild(slider("t", -2, 2.5, 0.1, t, function (v) { t = v; op = "mult"; draw(); },
      function (v) { return fmt(v, 2); }).wrap);
    note(host, "Drag A or B; coordinates snap to whole numbers.");
    draw();
  };

  /* ============ 17. P + t(Q − P): segment, ray, and line in one picture ===== */
  W.paramline = function (host) {
    var A = { x: -3, y: -1 }, B = { x: 2, y: 2 }, t = 0.4;
    var P = Plot({
      w: 660, h: 420, xmin: -7, xmax: 7, ymin: -4.5, ymax: 4.5,
      label: "The point P plus t times the direction from P to Q, as t varies"
    });
    host.appendChild(P.svg);
    grid(P, 1, 1, { tickStep: 2, yTickStep: 2 });
    var g = P.layer();
    var out = readout(host);

    function draw() {
      g.textContent = "";
      var dx = B.x - A.x, dy = B.y - A.y;
      var big = 40;
      g.appendChild(el("line", {
        x1: P.sx(A.x - big * dx), y1: P.sy(A.y - big * dy),
        x2: P.sx(A.x + big * dx), y2: P.sy(A.y + big * dy),
        style: "stroke:var(--plot-grid);stroke-width:1.5;stroke-dasharray:5 4"
      }));
      g.appendChild(el("line", {
        x1: P.sx(A.x), y1: P.sy(A.y), x2: P.sx(B.x), y2: P.sy(B.y),
        style: "stroke:var(--plot-curve);stroke-width:4;stroke-linecap:round"
      }));
      var X = { x: A.x + t * dx, y: A.y + t * dy };
      var M = { x: A.x + 0.5 * dx, y: A.y + 0.5 * dy };
      g.appendChild(el("circle", { cx: P.sx(M.x), cy: P.sy(M.y), r: 4, style: S.pt }));
      g.appendChild(el("circle", { cx: P.sx(A.x), cy: P.sy(A.y), r: 6.5, style: S.ptA }));
      g.appendChild(el("circle", { cx: P.sx(B.x), cy: P.sy(B.y), r: 6.5, style: S.ptB }));
      g.appendChild(el("circle", { cx: P.sx(X.x), cy: P.sy(X.y), r: 7, style: "fill:var(--accent-2);stroke:var(--surface);stroke-width:2.5" }));
      g.appendChild(label(P, A.x, A.y, "P", 0, -14));
      g.appendChild(label(P, B.x, B.y, "Q", 0, -14));
      g.appendChild(label(P, X.x, X.y, "t = " + fmt(t, 2), 0, 24, S.label));
      var where = t < 0 ? "behind P — on the line, but off both the segment and the ray from P through Q"
        : t > 1 ? "beyond Q — on the ray and the line, but off the segment"
          : "on the segment PQ";
      var slope = dx === 0 ? "undefined (a vertical line)" : fmt(dy / dx, 3);
      out.innerHTML = "<b>X = P + t(Q − P) = (" + fmt(X.x, 2) + ", " + fmt(X.y, 2) + ")</b>, " + where + ".<br>" +
        "Q − P = (" + fmt(dx) + ", " + fmt(dy) + "), the direction. Slope = Δy/Δx = " + slope +
        ". Midpoint (t = ½) is (" + fmt(M.x, 2) + ", " + fmt(M.y, 2) + ").<br>" +
        "0 ≤ t ≤ 1 draws the segment, t ≥ 0 the ray, and every real t the whole line.";
    }

    dragPoints(P, function () { return [A, B]; }, function (i, x, y) {
      var p = i === 0 ? A : B;
      p.x = Math.max(-6, Math.min(6, Math.round(x)));
      p.y = Math.max(-4, Math.min(4, Math.round(y)));
      if (A.x === B.x && A.y === B.y) p.x += 1;
      draw();
    });
    var c = controls(host);
    c.appendChild(slider("t", -1.5, 2.5, 0.05, t, function (v) { t = v; draw(); },
      function (v) { return fmt(v, 2); }).wrap);
    note(host, "Drag P or Q, then sweep t.");
    draw();
  };

  /* ===================== 18. sine and cosine on the unit circle ============= */
  W.unitcircle = function (host) {
    var deg = 50;
    var P = Plot({
      w: 660, h: 400, pad: { l: 30, r: 20, t: 20, b: 30 },
      xmin: -1.45, xmax: 1.45, ymin: -1.25, ymax: 1.25,
      label: "A point on the unit circle, with its cosine and sine as coordinates"
    });
    host.appendChild(P.svg);
    grid(P, 0.5, 0.5, { tickStep: 1, yTickStep: 1 });
    var g = P.layer();
    var out = readout(host);
    var R = Math.abs(P.sx(1) - P.sx(0));

    function draw() {
      g.textContent = "";
      var t = deg * Math.PI / 180, cx = Math.cos(t), sy = Math.sin(t);
      g.appendChild(el("circle", { cx: P.sx(0), cy: P.sy(0), r: R, style: "fill:none;stroke:var(--plot-axis);stroke-width:2" }));
      /* the arc, whose length is the angle in radians */
      g.appendChild(el("path", {
        d: "M" + P.sx(1) + " " + P.sy(0) + " A" + R + " " + R + " 0 " + (deg > 180 ? 1 : 0) + " 0 " +
           P.sx(cx) + " " + P.sy(sy),
        style: "stroke:var(--plot-curve-2);stroke-width:5;fill:none;opacity:.8"
      }));
      g.appendChild(el("line", { x1: P.sx(0), y1: P.sy(0), x2: P.sx(cx), y2: P.sy(sy), style: S.curve }));
      g.appendChild(el("line", { x1: P.sx(cx), y1: P.sy(0), x2: P.sx(cx), y2: P.sy(sy), style: S.dash }));
      g.appendChild(el("line", { x1: P.sx(0), y1: P.sy(sy), x2: P.sx(cx), y2: P.sy(sy), style: S.dash }));
      g.appendChild(el("circle", { cx: P.sx(cx), cy: P.sy(sy), r: 7, style: S.ptA }));
      g.appendChild(label(P, cx / 2, 0, "cos θ", 0, sy > 0 ? 18 : -8, S.label));
      g.appendChild(label(P, cx, sy / 2, "sin θ", cx > 0 ? 28 : -28, 4, S.label));
      var rad = t;
      out.innerHTML = "<b>θ = " + deg + "° = " + fmt(rad, 4) + " radians</b><br>" +
        "cos θ = " + fmt(cx, 4) + " &nbsp;·&nbsp; sin θ = " + fmt(sy, 4) + "<br>" +
        "Check: cos²θ + sin²θ = " + fmt(cx * cx + sy * sy, 6) +
        " — Pythagoras on the dashed triangle, whose hypotenuse is the radius 1.<br>" +
        "The thick arc has length " + fmt(rad, 4) + ": that is what radian measure means.";
    }

    var c = controls(host);
    c.appendChild(slider("θ", 0, 360, 1, deg, function (v) { deg = v; draw(); },
      function (v) { return v + "°"; }).wrap);
    c.appendChild(chips([
      { html: "30°", value: 30 }, { html: "45°", value: 45 }, { html: "60°", value: 60 },
      { html: "90°", value: 90 }, { html: "180°", value: 180 }
    ], -1, function (v) { deg = v; draw(); }));
    draw();
  };

  /* ================== 19. graphs of A·sin(Bx + C) and friends =============== */
  W.sinewave = function (host) {
    var A = 1, B = 1, C = 0, fn = "sin";
    var P = Plot({
      w: 660, h: 380, pad: { l: 34, r: 18, t: 18, b: 34 },
      xmin: -6.5, xmax: 6.5, ymin: -3.2, ymax: 3.2,
      label: "The graph of a sine or cosine with adjustable amplitude, frequency and shift"
    });
    host.appendChild(P.svg);
    grid(P, Math.PI / 2, 1, { tickStep: 100, yTickStep: 1 });
    var g = P.layer();
    var out = readout(host);
    /* π-labelled ticks, since the natural scale here is not the integers */
    var base = P.layer();
    [-2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2].forEach(function (m) {
      var x = m * Math.PI;
      if (x < P.xmin || x > P.xmax) return;
      var txt = (m === 1 ? "π" : m === -1 ? "−π" : (m === 0.5 ? "π/2" : m === -0.5 ? "−π/2" : fmt(m) + "π"));
      base.appendChild(el("text", { x: P.sx(x), y: P.sy(0) + 16, "text-anchor": "middle", style: S.tick }, txt));
    });

    function f(x) {
      var u = B * x + C;
      if (fn === "sin") return A * Math.sin(u);
      if (fn === "cos") return A * Math.cos(u);
      return A * Math.tan(u);
    }
    function draw() {
      g.textContent = "";
      g.appendChild(curvePath(P, f, S.curve, 1400));
      if (fn !== "tan") {
        [A, -A].forEach(function (y) {
          g.appendChild(el("line", { x1: P.sx(P.xmin), y1: P.sy(y), x2: P.sx(P.xmax), y2: P.sy(y), style: S.dash }));
        });
      }
      var period = fn === "tan" ? Math.PI / Math.abs(B) : 2 * Math.PI / Math.abs(B);
      out.innerHTML = "<b>y = " + fmt(A, 2) + " " + fn + "(" + fmt(B, 2) + "x" +
        (C === 0 ? "" : (C > 0 ? " + " : " − ") + fmt(Math.abs(C), 2)) + ")</b><br>" +
        (fn === "tan"
          ? "Tangent has period π and no amplitude: it runs off to ±∞ wherever cos = 0, which is why the graph breaks."
          : "Amplitude |A| = " + fmt(Math.abs(A), 2) + " — the dashed lines the curve just touches. ") +
        "Period = " + (fn === "tan" ? "π" : "2π") + "/|B| = " + fmt(period, 4) +
        ". Shift = −C/B = " + (B === 0 ? "—" : fmt(-C / B, 3)) +
        " (to the " + (-C / B >= 0 ? "right" : "left") + ").";
    }

    var c = controls(host);
    c.appendChild(chips([{ html: "sin", value: "sin" }, { html: "cos", value: "cos" }, { html: "tan", value: "tan" }],
      0, function (v) { fn = v; draw(); }));
    c.appendChild(slider("A", -3, 3, 0.25, A, function (v) { A = v; draw(); }, function (v) { return fmt(v, 2); }).wrap);
    c.appendChild(slider("B", 0.25, 4, 0.25, B, function (v) { B = v; draw(); }, function (v) { return fmt(v, 2); }).wrap);
    c.appendChild(slider("C", -3.2, 3.2, 0.1, C, function (v) { C = v; draw(); }, function (v) { return fmt(v, 2); }).wrap);
    draw();
  };

  /* ============ 20. y = a·f(x − h) + k for a handful of base functions ====== */
  W.transform = function (host) {
    var a = 1, hsh = 0, k = 0, base = "sq";
    var P = Plot({
      w: 660, h: 420, xmin: -7, xmax: 7, ymin: -5, ymax: 7,
      label: "A base function and a shifted, stretched copy of it"
    });
    host.appendChild(P.svg);
    grid(P, 1, 1, { tickStep: 2, yTickStep: 2 });
    var g = P.layer();
    var out = readout(host);
    var B = {
      sq: { f: function (x) { return x * x; }, name: "x²" },
      abs: { f: function (x) { return Math.abs(x); }, name: "|x|" },
      sqrt: { f: function (x) { return x < 0 ? NaN : Math.sqrt(x); }, name: "√x" },
      recip: { f: function (x) { return x === 0 ? NaN : 1 / x; }, name: "1/x" }
    };

    function draw() {
      g.textContent = "";
      var f = B[base].f;
      g.appendChild(curvePath(P, f, "stroke:var(--plot-axis);stroke-width:1.75;fill:none;stroke-dasharray:5 4", 900));
      g.appendChild(curvePath(P, function (x) { return a * f(x - hsh) + k; }, S.curve, 900));
      function sgn(v, pre) { return v === 0 ? "" : (v > 0 ? " + " + fmt(v, 2) : " − " + fmt(Math.abs(v), 2)); }
      var inner = hsh === 0 ? "x" : "(x" + (hsh > 0 ? " − " : " + ") + fmt(Math.abs(hsh), 2) + ")";
      var name = B[base].name.replace("x", inner);
      out.innerHTML = "<b>y = " + (a === 1 ? "" : a === -1 ? "−" : fmt(a, 2) + "·") + name + sgn(k) + "</b><br>" +
        "h = " + fmt(hsh, 2) + " moves the graph " + (hsh >= 0 ? "right" : "left") +
        " — note that <em>subtracting</em> inside shifts to the right. " +
        "k = " + fmt(k, 2) + " moves it " + (k >= 0 ? "up" : "down") + ". " +
        "a = " + fmt(a, 2) + " stretches vertically by |a|" + (a < 0 ? " and flips it over the x-axis" : "") + ".<br>" +
        "Dashed: the untouched y = " + B[base].name + ".";
    }

    var c = controls(host);
    c.appendChild(chips([
      { html: "x²", value: "sq" }, { html: "|x|", value: "abs" },
      { html: "√x", value: "sqrt" }, { html: "1/x", value: "recip" }
    ], 0, function (v) { base = v; draw(); }));
    c.appendChild(slider("a", -3, 3, 0.25, a, function (v) { a = v; draw(); }, function (v) { return fmt(v, 2); }).wrap);
    c.appendChild(slider("h", -5, 5, 0.5, hsh, function (v) { hsh = v; draw(); }, function (v) { return fmt(v, 2); }).wrap);
    c.appendChild(slider("k", -4, 4, 0.5, k, function (v) { k = v; draw(); }, function (v) { return fmt(v, 2); }).wrap);
    draw();
  };

  /* ================= 21. exponential and logarithm as mirror images ======== */
  W.explog = function (host) {
    var a = 2, showLog = true;
    var P = Plot({
      w: 660, h: 420, xmin: -5, xmax: 5, ymin: -5, ymax: 5,
      label: "The graph of a to the x and its reflection, the logarithm"
    });
    host.appendChild(P.svg);
    grid(P, 1, 1, { tickStep: 2, yTickStep: 2 });
    var g = P.layer();
    var out = readout(host);

    function draw() {
      g.textContent = "";
      g.appendChild(el("line", {
        x1: P.sx(-5), y1: P.sy(-5), x2: P.sx(5), y2: P.sy(5),
        style: "stroke:var(--plot-grid);stroke-width:1.5;stroke-dasharray:4 4"
      }));
      g.appendChild(curvePath(P, function (x) { return Math.pow(a, x); }, S.curve, 900));
      if (showLog) {
        g.appendChild(curvePath(P, function (x) {
          return x <= 0 ? NaN : Math.log(x) / Math.log(a);
        }, S.curve2, 1400));
      }
      [0, 1, 2].forEach(function (x) {
        var y = Math.pow(a, x);
        if (y > P.ymax) return;
        g.appendChild(el("circle", { cx: P.sx(x), cy: P.sy(y), r: 4, style: S.ptA }));
        if (showLog) g.appendChild(el("circle", { cx: P.sx(y), cy: P.sy(x), r: 4, style: S.ptB }));
      });
      out.innerHTML = "<b>y = " + fmt(a, 2) + "ˣ</b>" + (showLog ? " and <b>y = log<sub>" + fmt(a, 2) + "</sub> x</b>" : "") + "<br>" +
        fmt(a, 2) + "⁰ = 1, " + fmt(a, 2) + "¹ = " + fmt(a, 2) + ", " + fmt(a, 2) + "² = " + fmt(a * a, 3) +
        ", " + fmt(a, 2) + "⁻¹ = " + fmt(1 / a, 4) + ".<br>" +
        "The exponential is positive for every x and never reaches 0. " +
        (showLog
          ? "The logarithm is its mirror image in the dashed line y = x: it swaps every pair (x, y) for (y, x), " +
            "so it is defined exactly where the exponential had values — the positive numbers."
          : "Switch the logarithm on to see the same curve reflected in y = x.");
    }

    var c = controls(host);
    c.appendChild(slider("base a", 1.2, 4, 0.1, a, function (v) { a = v; draw(); }, function (v) { return fmt(v, 2); }).wrap);
    c.appendChild(chips([{ html: "both", value: true }, { html: "exponential only", value: false }],
      0, function (v) { showLog = v; draw(); }));
    draw();
  };

  /* ================ 22. a mapping as an arrow diagram ====================== */
  W.mapdiagram = function (host) {
    var dom = ["1", "2", "3", "4"], cod = ["a", "b", "c", "d"];
    var f = [0, 1, 2, 3];                 /* f[i] = index in cod of the image of dom[i] */
    var wrap = h("div", { class: "tbl-wrap" });
    var W0 = 520, H0 = 300;
    var svg = el("svg", { viewBox: "0 0 " + W0 + " " + H0, role: "img", "aria-label": "An arrow diagram of a mapping between two four-element sets" });
    svg.style.maxWidth = "520px";
    svg.style.margin = "0 auto";
    svg.style.display = "block";
    wrap.appendChild(svg);
    host.appendChild(wrap);
    var g = el("g"); svg.appendChild(g);
    var out = readout(host);
    var xL = 150, xR = 370, y0 = 60, dy = 60;

    function draw() {
      g.textContent = "";
      g.appendChild(el("text", { x: xL, y: 28, "text-anchor": "middle", style: S.labelStrong }, "domain S"));
      g.appendChild(el("text", { x: xR, y: 28, "text-anchor": "middle", style: S.labelStrong }, "codomain T"));
      var hit = {};
      f.forEach(function (j) { hit[j] = (hit[j] || 0) + 1; });
      dom.forEach(function (s, i) {
        var y1 = y0 + i * dy, y2 = y0 + f[i] * dy;
        g.appendChild(el("line", {
          x1: xL + 18, y1: y1, x2: xR - 24, y2: y2,
          style: "stroke:var(--plot-curve);stroke-width:2"
        }));
        g.appendChild(el("path", {
          d: "M" + (xR - 18) + " " + y2 + " L" + (xR - 30) + " " + (y2 - 5) + " L" + (xR - 30) + " " + (y2 + 5) + " Z",
          style: "fill:var(--plot-curve);stroke:none"
        }));
      });
      dom.forEach(function (s, i) {
        var y = y0 + i * dy;
        g.appendChild(el("circle", { cx: xL, cy: y, r: 16, style: "fill:var(--surface-2);stroke:var(--plot-curve);stroke-width:2;cursor:pointer" }));
        g.appendChild(el("text", { x: xL, y: y + 5, "text-anchor": "middle", style: S.labelStrong }, s));
      });
      cod.forEach(function (t, j) {
        var y = y0 + j * dy, n = hit[j] || 0;
        g.appendChild(el("circle", {
          cx: xR, cy: y, r: 16,
          style: "fill:" + (n ? "var(--accent-soft)" : "var(--surface-2)") +
            ";stroke:var(--plot-curve-2);stroke-width:2"
        }));
        g.appendChild(el("text", { x: xR, y: y + 5, "text-anchor": "middle", style: S.labelStrong }, t));
      });
      var img = {}; f.forEach(function (j) { img[j] = true; });
      var nImg = Object.keys(img).length;
      var inj = nImg === dom.length;
      var sur = nImg === cod.length;
      out.innerHTML = "<b>f: S → T</b> &nbsp; " +
        dom.map(function (s, i) { return "f(" + s + ") = " + cod[f[i]]; }).join(", ") + "<br>" +
        "Image = { " + Object.keys(img).sort().map(function (j) { return cod[j]; }).join(", ") + " }, " +
        nImg + " of " + cod.length + " elements.<br>" +
        "<b>" + (inj ? "Injective" : "Not injective") + "</b> — " +
        (inj ? "no two inputs share an output." : "two arrows land on the same element, so different inputs give the same output.") +
        " &nbsp; <b>" + (sur ? "Surjective" : "Not surjective") + "</b> — " +
        (sur ? "every element of T is hit." : "some element of T is hit by no arrow.") +
        (inj && sur ? " Both at once: a <b>bijection</b>, and it can be undone." : "");
    }

    svg.addEventListener("click", function (e) {
      var r = svg.getBoundingClientRect();
      var x = ((e.clientX - r.left) / r.width) * W0, y = ((e.clientY - r.top) / r.height) * H0;
      if (Math.abs(x - xL) > 26) return;
      var i = Math.round((y - y0) / dy);
      if (i < 0 || i >= dom.length) return;
      f[i] = (f[i] + 1) % cod.length;
      draw();
    });

    var c = controls(host);
    c.appendChild(chips([
      { html: "bijection", value: [0, 1, 2, 3] },
      { html: "not injective", value: [0, 0, 2, 3] },
      { html: "not surjective", value: [0, 1, 1, 3] },
      { html: "constant", value: [2, 2, 2, 2] }
    ], 0, function (v) { f = v.slice(); draw(); }));
    note(host, "Click an element on the left to send it somewhere else.");
    draw();
  };

  /* ============== 23. multiplication of complex numbers as a turn ========== */
  W.complexmul = function (host) {
    var z = { x: 2, y: 1 }, w = { x: 1, y: 1 };
    var P = Plot({
      w: 660, h: 430, xmin: -5, xmax: 5, ymin: -3.4, ymax: 3.4,
      label: "Two complex numbers and their product in the plane"
    });
    host.appendChild(P.svg);
    grid(P, 1, 1, { tickStep: 1, yTickStep: 1, xLabel: "real", yLabel: "imaginary" });
    var g = P.layer();
    var out = readout(host);

    function draw() {
      g.textContent = "";
      var pr = { x: z.x * w.x - z.y * w.y, y: z.x * w.y + z.y * w.x };
      var rz = Math.sqrt(z.x * z.x + z.y * z.y), rw = Math.sqrt(w.x * w.x + w.y * w.y);
      var az = Math.atan2(z.y, z.x) * 180 / Math.PI, aw = Math.atan2(w.y, w.x) * 180 / Math.PI;
      g.appendChild(el("circle", {
        cx: P.sx(0), cy: P.sy(0), r: Math.abs(P.sx(rz * rw) - P.sx(0)),
        style: "fill:none;stroke:var(--plot-grid);stroke-width:1.5;stroke-dasharray:4 4"
      }));
      g.appendChild(arcAt(P, 0, 0, 0, az, 30, "stroke:var(--plot-curve);stroke-width:2;fill:none"));
      g.appendChild(arcAt(P, 0, 0, az, az + aw, 40, "stroke:var(--accent-2);stroke-width:2.5;fill:none"));
      g.appendChild(arrowTo(P, 0, 0, z.x, z.y, "var(--plot-curve)"));
      g.appendChild(arrowTo(P, 0, 0, w.x, w.y, "var(--plot-curve-2)"));
      if (Math.abs(pr.x) <= 5 && Math.abs(pr.y) <= 3.4) {
        g.appendChild(arrowTo(P, 0, 0, pr.x, pr.y, "var(--accent-2)", 3));
        g.appendChild(label(P, pr.x, pr.y, "zw", 0, -14));
      }
      g.appendChild(label(P, z.x, z.y, "z", 0, -14));
      g.appendChild(label(P, w.x, w.y, "w", 0, -14));
      function str(p) {
        return fmt(p.x) + (p.y < 0 ? " − " : " + ") + fmt(Math.abs(p.y)) + "i";
      }
      out.innerHTML = "<b>(" + str(z) + ")(" + str(w) + ") = " + str(pr) + "</b><br>" +
        "|z| = " + fmt(rz, 3) + ", |w| = " + fmt(rw, 3) + ", |zw| = " + fmt(rz * rw, 3) +
        " — the absolute values multiply.<br>" +
        "arg z = " + fmt(az, 1) + "°, arg w = " + fmt(aw, 1) + "°, arg zw = " +
        fmt(((az + aw + 540) % 360) - 180, 1) + "° — the angles add.<br>" +
        "So multiplying by w rotates z by arg w and stretches it by |w|." +
        (Math.abs(pr.x) > 5 || Math.abs(pr.y) > 3.4 ? " (The product is off the visible part of the plane.)" : "");
    }

    dragPoints(P, function () { return [z, w]; }, function (i, x, y) {
      var p = i === 0 ? z : w;
      p.x = Math.max(-4, Math.min(4, Math.round(x)));
      p.y = Math.max(-3, Math.min(3, Math.round(y)));
      draw();
    });
    note(host, "Drag z or w. Watch the dashed circle of radius |z||w| — the product always lands on it.");
    draw();
  };

  /* ===================== 24. partial sums of a geometric series ============ */
  W.geoseries = function (host) {
    var r = 0.5, n = 6;
    var P = Plot({
      w: 660, h: 360, pad: { l: 40, r: 18, t: 20, b: 34 },
      xmin: 0, xmax: 13, ymin: -1.5, ymax: 3.2,
      label: "Partial sums of a geometric series approaching their limit"
    });
    host.appendChild(P.svg);
    var g = P.layer();
    var out = readout(host);

    function draw() {
      g.textContent = "";
      var limit = Math.abs(r) < 1 ? 1 / (1 - r) : null;
      g.appendChild(el("line", { x1: P.sx(0), y1: P.sy(0), x2: P.sx(13), y2: P.sy(0), style: S.axis }));
      g.appendChild(el("line", { x1: P.sx(0), y1: P.sy(P.ymin), x2: P.sx(0), y2: P.sy(P.ymax), style: S.axis }));
      [-1, 0, 1, 2, 3].forEach(function (y) {
        g.appendChild(el("text", { x: P.sx(0) - 8, y: P.sy(y) + 4, "text-anchor": "end", style: S.tick }, String(y)));
      });
      if (limit !== null && limit <= P.ymax && limit >= P.ymin) {
        g.appendChild(el("line", { x1: P.sx(0), y1: P.sy(limit), x2: P.sx(13), y2: P.sy(limit), style: S.dash }));
        g.appendChild(el("text", { x: P.sx(12.6), y: P.sy(limit) - 8, "text-anchor": "end", style: S.labelStrong },
          "1/(1 − r) = " + fmt(limit, 4)));
      }
      var s = 0, pts = [];
      for (var k = 0; k <= n; k++) {
        s += Math.pow(r, k);
        pts.push([k + 1, s]);
        var yTop = Math.max(P.ymin, Math.min(P.ymax, s));
        g.appendChild(el("rect", {
          x: P.sx(k + 0.72), y: P.sy(Math.max(0, yTop)),
          width: Math.abs(P.sx(0.56) - P.sx(0)),
          height: Math.abs(P.sy(yTop) - P.sy(0)),
          style: "fill:var(--plot-fill);stroke:var(--plot-curve);stroke-width:1.5"
        }));
        g.appendChild(el("text", { x: P.sx(k + 1), y: P.sy(0) + 16, "text-anchor": "middle", style: S.tick }, String(k + 1)));
      }
      pts.forEach(function (p) {
        if (p[1] < P.ymin || p[1] > P.ymax) return;
        g.appendChild(el("circle", { cx: P.sx(p[0]), cy: P.sy(p[1]), r: 4, style: S.ptB }));
      });
      var closed = r === 1 ? n + 1 : (1 - Math.pow(r, n + 1)) / (1 - r);
      out.innerHTML = "<b>S = 1 + r + r² + … + r<sup>" + n + "</sup> with r = " + fmt(r, 2) + "</b><br>" +
        "Closed form (1 − r<sup>" + (n + 1) + "</sup>)/(1 − r) = " + fmt(closed, 6) +
        ", and adding the terms one at a time gives " + fmt(s, 6) + " ✓<br>" +
        (limit === null
          ? "|r| ≥ 1, so the terms do not shrink and the sums run away — there is no limit."
          : "As n grows, r<sup>n+1</sup> → 0 and the sums close in on 1/(1 − r) = " + fmt(limit, 6) + ".");
    }

    var c = controls(host);
    c.appendChild(slider("r", -1.2, 1.2, 0.05, r, function (v) { r = v; draw(); }, function (v) { return fmt(v, 2); }).wrap);
    c.appendChild(slider("n", 0, 12, 1, n, function (v) { n = v; draw(); }).wrap);
    draw();
  };

  /* ============= 25. the 2×2 determinant as a signed area ================== */
  W.det2 = function (host) {
    var A = { x: 3, y: 1 }, B = { x: 1, y: 2 };
    var P = Plot({
      w: 660, h: 420, xmin: -5, xmax: 5, ymin: -3.4, ymax: 3.4,
      label: "The parallelogram spanned by two vectors, whose area is the determinant"
    });
    host.appendChild(P.svg);
    grid(P, 1, 1, { tickStep: 1, yTickStep: 1 });
    var g = P.layer();
    var out = readout(host);

    function draw() {
      g.textContent = "";
      var det = A.x * B.y - A.y * B.x;
      g.appendChild(poly([
        [P.sx(0), P.sy(0)], [P.sx(A.x), P.sy(A.y)],
        [P.sx(A.x + B.x), P.sy(A.y + B.y)], [P.sx(B.x), P.sy(B.y)]
      ], "fill:" + (det >= 0 ? "var(--plot-fill)" : "var(--accent-2-soft)") +
        ";stroke:var(--plot-grid);stroke-width:1.5"));
      g.appendChild(arrowTo(P, 0, 0, A.x, A.y, "var(--plot-curve)", 3));
      g.appendChild(arrowTo(P, 0, 0, B.x, B.y, "var(--plot-curve-2)", 3));
      g.appendChild(label(P, A.x, A.y, "(a, b) = (" + fmt(A.x) + ", " + fmt(A.y) + ")", 0, -14));
      g.appendChild(label(P, B.x, B.y, "(c, d) = (" + fmt(B.x) + ", " + fmt(B.y) + ")", 0, -14));
      out.innerHTML = "<b>det = ad − bc = (" + fmt(A.x) + ")(" + fmt(B.y) + ") − (" + fmt(A.y) + ")(" +
        fmt(B.x) + ") = " + fmt(det) + "</b><br>" +
        "Area of the parallelogram = |det| = " + fmt(Math.abs(det)) + ". " +
        (det === 0
          ? "It is zero: the two vectors lie on one line, the parallelogram has collapsed, and the corresponding system has no single solution."
          : "The sign records orientation — " + (det > 0 ? "the second vector lies counterclockwise from the first" :
            "the second vector lies clockwise from the first") + ". Swap the two and the sign flips.");
    }

    dragPoints(P, function () { return [A, B]; }, function (i, x, y) {
      var p = i === 0 ? A : B;
      p.x = Math.max(-4, Math.min(4, Math.round(x)));
      p.y = Math.max(-3, Math.min(3, Math.round(y)));
      draw();
    });
    note(host, "Drag either arrow. Try lining them up to make the determinant zero.");
    draw();
  };
  window.BMWidgets = W;
  window.BMPlot = { Plot: Plot, grid: grid, curvePath: curvePath, el: el, S: S, slider: slider, chips: chips, controls: controls, readout: readout, note: note, dragX: dragX, fmt: fmt };
})();
