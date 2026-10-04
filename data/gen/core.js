/* ===========================================================================
   Basic Mathematics — problem generators for the Arena
   window.BMGen holds a list of generators, each tied to one section of the
   course. A generator turns a seed into a problem: question, answer key, hint,
   worked steps, and a verify() that recomputes the answer another way.
   The same seed always gives the same problem, so a run can be saved as
   (generator, seed) pairs and rebuilt exactly after a reload.

     BMGen.add({ id, section: "ch02#one-unknown", par: 45, timed: true,
                 make: function (r) { return { q, type, answer, hint, steps, verify }; } })
     BMGen.make(id, seed)   the problem, plus id, section, par, timed, seed
     BMGen.forSection(id)   the generators for one section
     BMGen.list()           every generator, in the order they were added

   Questions, hints and steps are plain text with $…$ for KaTeX; the Arena sets
   them with textContent, so they never need HTML escaping. Answers follow the
   grader in site.js ("|" separates accepted alternatives).
   =========================================================================== */
(function () {
  "use strict";

  var specs = [], byId = {};

  /* mulberry32: small, fast, and the same on every engine */
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* a string to a 32-bit seed (FNV-1a), so "daily:2026-10-04" seeds everyone alike */
  function hash(text) {
    var h = 2166136261;
    text = String(text);
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /* the helper handed to make(r) */
  function rng(seed) {
    var next = mulberry(seed);
    var r = {
      next: next,
      int: function (a, b) { return a + Math.floor(next() * (b - a + 1)); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      nonzero: function (a, b) {
        var n = 0, guard = 0;
        while (n === 0 && guard++ < 50) n = r.int(a, b);
        return n === 0 ? (b > 0 ? b : a) : n;
      },
      shuffle: function (arr) {
        var out = arr.slice();
        for (var i = out.length - 1; i > 0; i--) {
          var j = Math.floor(next() * (i + 1)), t = out[i];
          out[i] = out[j]; out[j] = t;
        }
        return out;
      },
      chance: function (p) { return next() < p; }
    };
    return r;
  }

  /* ------------------------------------------------- formatting helpers -- */

  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = b; b = a % b; a = t; } return a; }
  function lcm(a, b) { return Math.abs(a * b) / gcd(a, b); }

  /* n/d in lowest terms with the sign on top: { n, d } */
  function reduce(n, d) {
    if (d < 0) { n = -n; d = -d; }
    var g = gcd(n, d) || 1;
    return { n: n / g, d: d / g };
  }
  /* "3/4", "-3/4" or "5": the answer-key form of a fraction */
  function fracAns(n, d) {
    var f = reduce(n, d);
    return f.d === 1 ? String(f.n) : f.n + "/" + f.d;
  }
  /* TeX for a fraction: \frac{3}{4}, -\frac{3}{4}, or 5 */
  function fracTex(n, d) {
    var f = reduce(n, d);
    if (f.d === 1) return String(f.n);
    return (f.n < 0 ? "-" : "") + "\\frac{" + Math.abs(f.n) + "}{" + f.d + "}";
  }
  /* a factor in a product or after an operator: negatives get brackets */
  function par(n) { return n < 0 ? "(" + n + ")" : String(n); }

  /* a sum of terms, written the way the course writes it: 3x - 5, -x + 2, x^2 - 4x.
     terms = [[coefficient, "x^2"], [coefficient, "x"], [constant, ""]] */
  function poly(terms) {
    var out = "";
    terms.forEach(function (t) {
      var c = t[0], v = t[1] || "";
      if (c === 0) return;
      var mag = Math.abs(c);
      var body = v ? (mag === 1 ? v : mag + v) : String(mag);
      if (out === "") out = (c < 0 ? "-" : "") + body;
      else out += (c < 0 ? " - " : " + ") + body;
    });
    return out === "" ? "0" : out;
  }
  /* x + 3, x - 3, or x: the inside of a bracket (x - h) */
  function shift(v, h) { return h === 0 ? v : v + (h < 0 ? " - " + (-h) : " + " + h); }

  /* a point: the key accepts "(3,-2)" and "3,-2" */
  function ptAns(x, y) { return "(" + x + "," + y + ")|" + x + "," + y; }
  function ptTex(x, y) { return "(" + x + ", " + y + ")"; }

  /* What the grader (site.js) already treats as equal, so the keys below need not
     list it: spaces, case, π for pi, √ for sqrt, × and ⋅ (U+22C5) and * for "times"
     (all three are then dropped), one bracket pair around the whole answer, and the
     order of the pieces of a plain sum a+b with no brackets. It does not reorder a
     product (pi9 is not 9pi), does not read the middle dot · (U+00B7) as "times",
     and does not reorder a difference (22i-26 is not -26+22i). Each key spells
     those out instead. tools/check-gen.js evaluates every spelling, so a new one
     that is not the same number fails the build. */

  /* k·π/d in the course's typed form: "5pi/6", "pi/3", "2pi" — with the other
     spellings a reader might type: pi first (π·9, the order the formulas are
     written in), a middle dot, a bracketed coefficient (3/4)π. */
  function piAns(k, d) {
    var f = reduce(k, d), n = f.n, m = f.d;
    if (n === 0) return "0";
    var sgn = n < 0 ? "-" : "", a = Math.abs(n), list;
    var head = a === 1 ? "pi" : a + "pi";
    if (m === 1) {
      list = [sgn + head];
      if (a === 1) list.push(sgn + "1pi");
      else list.push(sgn + "pi" + a, sgn + a + "·pi", sgn + "pi·" + a, sgn + "pi(" + a + ")", sgn + "(" + a + ")pi");
      return list.join("|");
    }
    var c = a + "/" + m;
    list = [sgn + head + "/" + m, sgn + "(" + head + ")/" + m, sgn + c + "pi", sgn + "(" + c + ")pi", sgn + c + "·pi", sgn + "(" + c + ")·pi"];
    if (a > 1) list.push(sgn + a + "·pi/" + m, sgn + "(" + a + "·pi)/" + m);
    return list.join("|");
  }

  /* √n/2 (n = 2 or 3, the table of §11.2), with 1/√2 for n = 2 */
  function halfRootAns(n) {
    var list = [];
    ["sqrt(" + n + ")", "sqrt" + n].forEach(function (rt) {
      list.push(rt + "/2", "(" + rt + ")/2", "1/2" + rt, "(1/2)" + rt, "1/2·" + rt, "(1/2)·" + rt);
    });
    if (n === 2) list.push("1/sqrt(2)", "1/sqrt2", "1/(sqrt2)", "1/(sqrt(2))");
    return list.join("|");
  }

  /* y = mx + b: the course's form first, then the constant first (y = 7 + x), the
     form filled in literally (y = 1x + 7, y = 3x + 0, y = 3x + -5), each with and
     without "y =" */
  function lineAns(m, b) {
    var mts = [poly([[m, "x"]])], rhs = [], seen = {}, list = [];
    if (Math.abs(m) === 1) mts.push(m + "x");
    var tails = b > 0 ? ["+" + b] : b < 0 ? [String(b), "+" + b] : ["", "+0"];
    mts.forEach(function (mt) {
      tails.forEach(function (tl) { rhs.push(mt + tl); });
      if (b !== 0) rhs.push(b + (mt.charAt(0) === "-" ? "" : "+") + mt);
    });
    rhs.map(function (t) { return "y=" + t; }).concat(rhs).forEach(function (t) {
      if (!seen[t]) { seen[t] = 1; list.push(t); }
    });
    return list.join("|");
  }

  /* "x<3", its mirror "3>x", and the interval §3.3 writes, (-∞, 3) — with inf or
     infinity for a keyboard without ∞ */
  function relAns(rel, x0) {
    var mirror = { ">": "<", "<": ">", ">=": "<=", "<=": ">=" }[rel];
    var list = ["x" + rel + x0, x0 + mirror + "x"];
    ["∞", "inf", "infinity"].forEach(function (inf) {
      if (rel === ">") list.push("(" + x0 + "," + inf + ")", "(" + x0 + ",+" + inf + ")");
      else if (rel === ">=") list.push("[" + x0 + "," + inf + ")", "[" + x0 + ",+" + inf + ")");
      else list.push("(-" + inf + "," + x0 + (rel === "<" ? ")" : "]"));
    });
    return list.join("|");
  }
  function piTex(k, d) {
    var f = reduce(k, d), n = f.n, m = f.d;
    if (n === 0) return "0";
    var sgn = n < 0 ? "-" : "", a = Math.abs(n);
    var head = a === 1 ? "\\pi" : a + "\\pi";
    return m === 1 ? sgn + head : sgn + "\\frac{" + head + "}{" + m + "}";
  }

  /* a + bi in the typed form, with the spellings the grader does not already
     treat as equal (it sorts the pieces of a plain sum, but not a difference):
     either part first and either sign spelling, so -26+22i, 22i-26, -8-6i, -6i-8,
     -8+-6i; i or 1i when |b| = 1 */
  function cxAns(a, b) {
    var list = [];
    if (b === 0) return a + "|" + a + "+0i";
    var ims = [b === 1 ? "i" : b === -1 ? "-i" : b + "i"];
    if (Math.abs(b) === 1) ims.push(b + "i");
    ims.forEach(function (t) {
      var mag = t.charAt(0) === "-" ? t.slice(1) : t;
      if (a === 0) { list.push(t, "0" + (b < 0 ? "-" : "+") + mag); return; }
      list.push(a + (b < 0 ? "-" : "+") + mag);         /* -26+22i, -8-6i */
      list.push(t + (a < 0 ? "-" + (-a) : "+" + a));    /* 22i-26, -6i-8, 24i+10 */
      if (b < 0) list.push(a + "+" + t);                /* -8+-6i, and -6i+-8 by the sort */
    });
    return list.join("|");
  }
  function cxTex(a, b) {
    if (b === 0) return String(a);
    var im = Math.abs(b) === 1 ? "i" : Math.abs(b) + "i";
    if (a === 0) return (b < 0 ? "-" : "") + im;
    return a + (b < 0 ? " - " : " + ") + im;
  }

  /* -------------------------------------------------------------- the list -- */

  function add(spec) {
    if (!spec || !spec.id || typeof spec.make !== "function" || byId[spec.id]) return;
    spec.par = spec.par || 45;
    spec.timed = spec.timed !== false;
    specs.push(spec);
    byId[spec.id] = spec;
  }

  function make(id, seed) {
    var spec = byId[id];
    if (!spec) return null;
    /* mixing the id into the seed keeps two generators drawn with one seed unrelated */
    var p = spec.make(rng((hash(id) ^ (seed >>> 0)) >>> 0));
    p.id = spec.id;
    p.section = spec.section;
    p.par = spec.par;
    p.timed = spec.timed;
    p.seed = seed >>> 0;
    p.type = p.type || "exact";
    p.tol = p.tol || 0;
    p.steps = p.steps || [];
    return p;
  }

  window.BMGen = {
    add: add,
    make: make,
    list: function () { return specs.slice(); },
    get: function (id) { return byId[id] || null; },
    forSection: function (section) { return specs.filter(function (s) { return s.section === section; }); },
    sections: function () {
      var seen = {}, out = [];
      specs.forEach(function (s) { if (!seen[s.section]) { seen[s.section] = 1; out.push(s.section); } });
      return out;
    },
    rng: rng,
    hash: hash,
    u: {
      gcd: gcd, lcm: lcm, reduce: reduce, fracAns: fracAns, fracTex: fracTex, par: par,
      poly: poly, shift: shift, ptAns: ptAns, ptTex: ptTex, piAns: piAns, piTex: piTex,
      cxAns: cxAns, cxTex: cxTex, halfRootAns: halfRootAns, lineAns: lineAns, relAns: relAns
    }
  };
})();
