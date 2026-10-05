"use strict";
/* CSS as far as the harness needs it: a rule list with media context, the custom
   properties of the theme blocks, colour parsing and WCAG 2.x contrast. */

function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " ")); }

/* flatten a stylesheet into [{ selector, decls: {prop: value}, media: [..], line }] */
function rules(css) {
  const src = stripComments(css);
  const out = [];
  const media = [];
  let i = 0, line = 1;
  const n = src.length;
  function lines(from, to) { for (let k = from; k < to; k++) if (src.charCodeAt(k) === 10) line++; }
  const stackKinds = []; /* "media" | "other-at" | "rule" */
  while (i < n) {
    const ch = src[i];
    if (/\s/.test(ch)) { if (ch === "\n") line++; i++; continue; }
    if (ch === "}") {
      const k = stackKinds.pop();
      if (k === "media") media.pop();
      i++; continue;
    }
    /* read a prelude up to { or ; */
    let j = i, depth = 0, inStr = null;
    while (j < n) {
      const c = src[j];
      if (inStr) { if (c === inStr && src[j - 1] !== "\\") inStr = null; }
      else if (c === '"' || c === "'") inStr = c;
      else if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (depth === 0 && (c === "{" || c === ";")) break;
      j++;
    }
    const prelude = src.slice(i, j).trim();
    const startLine = line;
    lines(i, j);
    if (j >= n) break;
    if (src[j] === ";") { i = j + 1; continue; } /* @import, @charset */
    if (prelude[0] === "@") {
      const name = /^@([a-zA-Z-]+)/.exec(prelude)[1];
      if (name === "media" || name === "supports" || name === "layer" || name === "container") {
        media.push(prelude);
        stackKinds.push("media");
        i = j + 1; continue;
      }
      /* @keyframes, @font-face: swallow the block */
      let d = 0, k = j;
      while (k < n) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (d === 0) break; } k++; }
      lines(j, k + 1); i = k + 1; continue;
    }
    /* declaration block */
    let k = j + 1, d = 1, inS = null;
    while (k < n && d > 0) {
      const c = src[k];
      if (inS) { if (c === inS && src[k - 1] !== "\\") inS = null; }
      else if (c === '"' || c === "'") inS = c;
      else if (c === "{") d++;
      else if (c === "}") d--;
      k++;
    }
    const body = src.slice(j + 1, k - 1);
    const decls = {};
    splitDecls(body).forEach(dcl => {
      const colon = dcl.indexOf(":");
      if (colon === -1) return;
      decls[dcl.slice(0, colon).trim()] = dcl.slice(colon + 1).trim().replace(/\s*!important$/, "");
    });
    prelude.split(",").map(s => s.trim()).filter(Boolean).forEach(selector => {
      out.push({ selector, decls, media: media.slice(), line: startLine });
    });
    lines(j, k); i = k;
  }
  return out;
}

function splitDecls(body) {
  const out = [];
  let cur = "", depth = 0, inS = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inS) { cur += c; if (c === inS && body[i - 1] !== "\\") inS = null; continue; }
    if (c === '"' || c === "'") { inS = c; cur += c; continue; }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === ";" && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function isDarkMedia(r) { return r.media.some(m => /prefers-color-scheme\s*:\s*dark/.test(m)); }
/* @supports blocks describe what the browsers the site is for do, so their tokens are
   the ones those readers see; every other at-rule context (print, prefers-contrast,
   prefers-reduced-transparency, forced colours) restates tokens on purpose and is not
   the screen palette */
function measuredMedia(r) { return r.media.every(m => /^@supports\b/.test(m) || /prefers-color-scheme\s*:\s*dark/.test(m)); }
function customProps(decls) {
  const o = {};
  Object.keys(decls).forEach(k => { if (k.startsWith("--")) o[k] = decls[k]; });
  return o;
}
function normSel(s) { return s.replace(/\s+/g, " ").replace(/\s*([>+~])\s*/g, "$1").replace(/'/g, '"').trim(); }

/* The selector shapes of a token block: the root (`:root` or `html`), with conditions
   on it, optionally followed by a Part:
     :root   :root[data-theme="dark"]   :root[data-panel="dark"]   [data-part="id"]
     :root[data-theme="dark"] [data-part="id"]   :root[data-panel="dark"] [data-part="id"]
     :root:not([data-theme="light"])   (inside @media (prefers-color-scheme: dark))
   data-theme shades the frame and data-panel chooses the reading panel's paper
   (src/styles/tokens.css). Returns { part, theme, panel, spec } (theme and panel null
   when the block does not depend on them), or null for any other selector. */
const ROOT_SHAPE = /^(?:(:root|html)((?:\[data-(?:theme|panel)="(?:light|dark)"\]|:not\(\[data-theme="light"\]\))*)\s?)?(?:\[data-part="([^"]+)"\])?$/;
function shapeOf(sel, darkMedia) {
  const m = ROOT_SHAPE.exec(sel);
  if (!m || (!m[1] && !m[3])) return null;
  const conds = m[2] || "";
  let theme = darkMedia ? "dark" : null, panel = null;
  const t = /\[data-theme="(light|dark)"\]/.exec(conds);
  if (t) theme = t[1];
  if (/:not\(\[data-theme="light"\]\)/.test(conds)) theme = "dark";
  const p = /\[data-panel="(light|dark)"\]/.exec(conds);
  if (p) panel = p[1];
  /* specificity as one number: (attributes and pseudo-classes) * 100 + elements */
  const spec = ((sel.match(/\[/g) || []).length + (m[1] === ":root" ? 1 : 0)) * 100 + (m[1] === "html" ? 1 : 0);
  return { part: m[3] || null, theme, panel, spec };
}

/* The theme × panel combinations the site can be in: the light/dark theme (the frame),
   and the reading panel, light by default in both themes and dark when the reader
   chooses it. The first two are the defaults. */
const SCOPES = [
  { label: "light", theme: "light", panel: "light" },
  { label: "dark", theme: "dark", panel: "light" },
  { label: "light, dark panel", theme: "light", panel: "dark" },
  { label: "dark, dark panel", theme: "dark", panel: "dark" }
];

/* The token tables. Every block of a shape above (outside print and the other media
   that restate tokens on purpose) is an entry; a scope's table is the entries whose
   conditions hold in it, applied in cascade order (specificity, then source order), and
   a Part's table is the scope's root table with the Part's entries applied over it (a
   [data-part] element inherits from the root and overrides it).
     scopes[]           { label, theme, panel, table, parts: { id: table } }
     light, dark        the default light and dark tables (light panel in both)
     parts[id][theme]   those two for each Part
     drift              names a dark colour-scheme media block and the data-theme
                        toggle set differently
     overlap            names both the theme and the panel blocks set (they must not:
                        which wins would hang on source order alone) */
function tokens(css) {
  const rs = rules(css);
  const entries = [];
  rs.forEach((r, order) => {
    if (r.media.length && !measuredMedia(r)) return;
    const props = customProps(r.decls);
    if (!Object.keys(props).length) return;
    const shape = shapeOf(normSel(r.selector), isDarkMedia(r));
    if (!shape) return;
    entries.push(Object.assign({ props, order, media: isDarkMedia(r) }, shape));
  });
  const holds = (e, sc) => (!e.theme || e.theme === sc.theme) && (!e.panel || e.panel === sc.panel);
  const apply = (list, into) => list.slice().sort((a, b) => a.spec - b.spec || a.order - b.order).forEach(e => Object.assign(into, e.props));
  const partIds = Array.from(new Set(entries.filter(e => e.part).map(e => e.part)));
  const scopes = SCOPES.map(sc => {
    const table = {};
    apply(entries.filter(e => !e.part && holds(e, sc)), table);
    const parts = {};
    partIds.forEach(id => { parts[id] = Object.assign({}, table); apply(entries.filter(e => e.part === id && holds(e, sc)), parts[id]); });
    return Object.assign({}, sc, { table, parts });
  });
  const drift = [], overlap = [];
  const rootOf = (f) => { const o = {}; entries.filter(e => !e.part && f(e)).forEach(e => Object.assign(o, e.props)); return o; };
  const toggle = rootOf(e => e.theme === "dark" && !e.media), media = rootOf(e => e.theme === "dark" && e.media);
  Object.keys(toggle).forEach(k => { if (media.hasOwnProperty(k) && media[k] !== toggle[k]) drift.push(k + ": toggle=" + toggle[k] + " media=" + media[k]); });
  const themed = new Set(), panelled = new Set();
  entries.forEach(e => Object.keys(e.props).forEach(k => {
    const key = (e.part || ":root") + " " + k;
    if (e.theme && !e.panel) themed.add(key);
    if (e.panel && !e.theme) panelled.add(key);
  }));
  themed.forEach(k => { if (panelled.has(k)) overlap.push(k); });
  const legacyParts = {};
  partIds.forEach(id => { legacyParts[id] = { light: scopes[0].parts[id], dark: scopes[1].parts[id] }; });
  return {
    scopes, light: scopes[0].table, dark: scopes[1].table, parts: legacyParts, drift, overlap,
    hasDark: entries.some(e => e.theme === "dark" || e.panel === "dark")
  };
}

/* ---------------------------------------------------------------- colour -- */

const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0], red: [255, 0, 0, 1],
  currentcolor: null };

/* resolve var() indirection inside a token table; returns the final string or null */
function resolveVar(value, table, seen) {
  seen = seen || new Set();
  let v = String(value).trim();
  for (let guard = 0; guard < 20 && /var\(/.test(v); guard++) {
    v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (m, name, fb) => {
      if (seen.has(name)) return "";
      if (table.hasOwnProperty(name)) { seen.add(name); return table[name]; }
      return fb !== undefined ? fb : "\u0000missing:" + name;
    });
  }
  return v;
}

/* split on the commas that are not inside parentheses */
function topLevelCommas(s) {
  const out = [];
  let depth = 0, cur = "";
  for (const c of s) {
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/* color-mix(in srgb, A p%, B q%) as CSS Color 5 computes it: the percentages normalised
   to sum to 100 (a missing one is the rest, both missing 50/50), the channels mixed
   premultiplied by alpha, so mixing with `transparent` makes a colour see-through
   rather than darker. Only the srgb space; anything else is null. */
function colorMix(s) {
  const m = /^color-mix\(([\s\S]*)\)$/.exec(s);
  if (!m) return null;
  const args = topLevelCommas(m[1]);
  if (args.length !== 3 || !/^in\s+srgb$/.test(args[0])) return null;
  const part = (a) => {
    const pm = /^([\s\S]*?)\s+(-?[\d.]+)%$/.exec(a) || /^(-?[\d.]+)%\s+([\s\S]*)$/.exec(a);
    if (!pm) return { c: parseColor(a), p: null };
    return /%$/.test(a) ? { c: parseColor(pm[1]), p: parseFloat(pm[2]) } : { c: parseColor(pm[2]), p: parseFloat(pm[1]) };
  };
  const x = part(args[1]), y = part(args[2]);
  if (!x.c || !y.c) return null;
  let p1 = x.p, p2 = y.p;
  if (p1 === null && p2 === null) { p1 = 50; p2 = 50; }
  else if (p1 === null) p1 = 100 - p2;
  else if (p2 === null) p2 = 100 - p1;
  const sum = p1 + p2;
  if (!(sum > 0)) return null;
  const w1 = p1 / sum, w2 = p2 / sum;
  const a = x.c[3] * w1 + y.c[3] * w2;
  if (a === 0) return [0, 0, 0, 0];
  const ch = [0, 1, 2].map(i => (x.c[i] * x.c[3] * w1 + y.c[i] * y.c[3] * w2) / a);
  return [ch[0], ch[1], ch[2], Math.min(1, a)];
}

/* a see-through colour laid over an opaque one */
function over(top, under) {
  const a = top[3];
  return [0, 1, 2].map(i => top[i] * a + under[i] * (1 - a)).concat([1]);
}

/* "#abc", "#aabbcc", "#aabbccdd", "rgb(1,2,3)", "rgba(1,2,3,.5)", "rgb(1 2 3 / 50%)",
   "color-mix(in srgb, … p%, …)" -> [r,g,b,a] */
function parseColor(s) {
  if (s === null || s === undefined) return null;
  s = String(s).trim().toLowerCase();
  if (NAMED.hasOwnProperty(s)) return NAMED[s];
  if (/^color-mix\(/.test(s)) return colorMix(s);
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 4) {
      const c = h.split("").map(x => parseInt(x + x, 16));
      return [c[0], c[1], c[2], h.length === 4 ? c[3] / 255 : 1];
    }
    if (h.length === 6 || h.length === 8) {
      const c = [0, 2, 4, 6].map(k => h.length > k ? parseInt(h.slice(k, k + 2), 16) : null);
      return [c[0], c[1], c[2], c[3] === null ? 1 : c[3] / 255];
    }
    return null;
  }
  m = /^rgba?\(\s*([^)]*)\)$/.exec(s);
  if (m) {
    const parts = m[1].replace("/", " ").split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const ch = parts.slice(0, 3).map(p => p.endsWith("%") ? Math.round(parseFloat(p) * 2.55) : parseFloat(p));
    let a = 1;
    if (parts[3] !== undefined) a = parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    if (ch.some(x => !isFinite(x)) || !isFinite(a)) return null;
    return [ch[0], ch[1], ch[2], a];
  }
  return null;
}

function luminance(c) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
function contrast(fg, bg) {
  const a = luminance(fg), b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/* animation declarations, with the line they sit on */
function animations(css) {
  return rules(css).filter(r => r.decls.animation || r.decls["animation-iteration-count"] || r.decls["animation-name"])
    .map(r => ({ selector: r.selector, value: r.decls.animation || "", count: r.decls["animation-iteration-count"] || "",
      duration: r.decls["animation-duration"] || "", name: r.decls["animation-name"] || "", line: r.line, media: r.media }));
}

/* the words of a value, split on the spaces outside parentheses */
function words(v) {
  const out = [];
  let depth = 0, cur = "";
  for (const c of String(v)) {
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (/\s/.test(c) && depth === 0) { if (cur) out.push(cur); cur = ""; continue; }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}
const ANIM_KEYWORDS = new Set(["linear", "ease", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end", "none",
  "forwards", "backwards", "both", "normal", "reverse", "alternate", "alternate-reverse", "running", "paused", "infinite",
  "initial", "inherit", "unset", "revert", "auto"]);
function timeMs(w) {
  const m = /^(-?[\d.]+)(ms|s)$/.exec(w);
  return m ? parseFloat(m[1]) * (m[2] === "s" ? 1000 : 1) : null;
}
/* a word var() could not resolve: resolveVar() leaves a marker, or the var() itself */
const UNREAD = /\u0000missing:|var\(/;
/* One animation declaration (the shorthand and/or its longhands, var() already resolved)
   as the animations it runs: [{ name, ms, iterations }], `iterations` Infinity for
   `infinite`, `ms` null when no duration can be read, and `unread: true` when a word of
   the shorthand is a var() that did not resolve (it may be the count, or anything else,
   so nothing about the animation can be trusted). `animation: none` runs nothing. */
function parseAnimation(a) {
  const out = [];
  topLevelCommas(a.value || "").forEach(item => {
    let ms = null, name = null, iterations = 1, times = 0, unread = false;
    words(item).forEach(w => {
      if (UNREAD.test(w)) { unread = true; return; }
      const t = timeMs(w);
      if (t !== null) { if (times++ === 0) ms = t; return; }
      if (w === "infinite") { iterations = Infinity; return; }
      if (/^[\d.]+$/.test(w)) { iterations = parseFloat(w); return; }
      if (/\(/.test(w)) return;            /* cubic-bezier(), steps() */
      if (!ANIM_KEYWORDS.has(w) && name === null) name = w;
    });
    if (name === null && !unread && /(^|\s)none(\s|$)/.test(item)) return;
    out.push(unread ? { name: name || "?", ms, iterations, unread } : { name: name || "?", ms, iterations });
  });
  if (a.name || a.duration || a.count) {
    const names = a.name ? topLevelCommas(a.name) : out.map(o => o.name);
    const durs = a.duration ? topLevelCommas(a.duration).map(timeMs) : null;
    const counts = a.count ? topLevelCommas(a.count).map(c => c.trim() === "infinite" ? Infinity : /^\s*[\d.]+\s*$/.test(c) ? parseFloat(c) : NaN) : null;
    const n = Math.max(names.length, out.length, 1);
    for (let i = 0; i < n; i++) {
      const o = out[i] || (out[i] = { name: names[i % names.length] || "?", ms: null, iterations: 1 });
      if (a.name && names[i % names.length] === "none") { out[i] = null; continue; }
      if (durs) o.ms = durs[i % durs.length];
      if (counts) o.iterations = counts[i % counts.length];
    }
  }
  return out.filter(Boolean);
}

/* The @keyframes of a stylesheet (rules() swallows them): { name: [{ at: [0..1], decls }] },
   the frames in the order written; `from` is 0 and `to` is 1. */
function keyframes(css) {
  const src = stripComments(css);
  const out = {};
  const head = /@(?:-webkit-)?keyframes\s+([\w-]+)\s*\{/g;
  let h;
  while ((h = head.exec(src))) {
    let d = 1, k = head.lastIndex;
    while (k < src.length && d > 0) { if (src[k] === "{") d++; else if (src[k] === "}") d--; k++; }
    const body = src.slice(head.lastIndex, k - 1);
    const frames = [];
    const frame = /([^{}]+)\{([^{}]*)\}/g;
    let f;
    while ((f = frame.exec(body))) {
      const decls = {};
      splitDecls(f[2]).forEach(dcl => {
        const colon = dcl.indexOf(":");
        if (colon !== -1) decls[dcl.slice(0, colon).trim()] = dcl.slice(colon + 1).trim();
      });
      const at = f[1].split(",").map(x => x.trim()).map(x => x === "from" ? 0 : x === "to" ? 1 : /^[\d.]+%$/.test(x) ? parseFloat(x) / 100 : null).filter(x => x !== null);
      frames.push({ at, decls });
    }
    out[h[1]] = frames;
    head.lastIndex = k;
  }
  return out;
}

/* What can flash in a keyframe: its opacity, visibility, and the colours and filter it
   paints with. A flash (WCAG 2.3.1) is a pair of opposing changes, so a cycle's flashes
   are half the stretches over which a property keeps changing one way: for opacity a
   stretch runs while it keeps rising or keeps falling, for the others every change of
   value is one. Frames the keyframes leave out take the element's own value, which is
   not known here, so they are not counted (the count can only be low by one). */
const FLASH_PROPS = ["opacity", "visibility", "color", "background-color", "background", "fill", "stroke", "filter",
  "outline-color", "border-color", "box-shadow"];
function flashesPerCycle(frames) {
  let most = 0;
  FLASH_PROPS.forEach(prop => {
    const seq = [];
    (frames || []).forEach(fr => { if (fr.decls[prop] !== undefined) fr.at.forEach(at => seq.push({ at, v: fr.decls[prop].replace(/\s+/g, " ").trim() })); });
    seq.sort((a, b) => a.at - b.at);
    let stretches = 0;
    if (prop === "opacity") {
      let dir = 0;
      for (let i = 1; i < seq.length; i++) {
        const dv = parseFloat(seq[i].v) - parseFloat(seq[i - 1].v);
        const s = dv > 0 ? 1 : dv < 0 ? -1 : 0;
        if (s && s !== dir) { stretches++; dir = s; }
      }
    } else {
      for (let i = 1; i < seq.length; i++) if (seq[i].v !== seq[i - 1].v) stretches++;
    }
    most = Math.max(most, Math.floor(stretches / 2));
  });
  return most;
}

module.exports = { rules, tokens, SCOPES, resolveVar, parseColor, colorMix, over, contrast, luminance, animations, parseAnimation, keyframes, flashesPerCycle, words, topLevelCommas };
