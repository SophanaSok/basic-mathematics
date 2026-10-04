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
function customProps(decls) {
  const o = {};
  Object.keys(decls).forEach(k => { if (k.startsWith("--")) o[k] = decls[k]; });
  return o;
}
function normSel(s) { return s.replace(/\s+/g, " ").replace(/\s*([>+~])\s*/g, "$1").replace(/'/g, '"').trim(); }

/* The token tables. light: bare :root (not in a dark media). dark: :root[data-theme="dark"]
   and/or :root:not([data-theme="light"]) inside @media (prefers-color-scheme: dark),
   layered over light. parts[id][theme]: the overrides on [data-part="id"] selectors. */
function tokens(css) {
  const rs = rules(css);
  const light = {}, darkToggle = {}, darkMedia = {};
  const parts = {};
  rs.forEach(r => {
    /* print, high-contrast and forced-colours blocks restate tokens on purpose; only the
       screen palette (no media, or a dark colour-scheme media) is the one to measure */
    if (r.media.length && !isDarkMedia(r)) return;
    const sel = normSel(r.selector);
    const props = customProps(r.decls);
    if (!Object.keys(props).length) return;
    const pm = /\[data-part="([^"]+)"\]/.exec(sel);
    if (pm) {
      const id = pm[1];
      parts[id] = parts[id] || { light: {}, dark: {} };
      const dark = isDarkMedia(r) || /\[data-theme="dark"\]/.test(sel);
      if (/\[data-theme="light"\]/.test(sel) && !isDarkMedia(r)) Object.assign(parts[id].light, props);
      else Object.assign(parts[id][dark ? "dark" : "light"], props);
      return;
    }
    if (sel === ":root" && !isDarkMedia(r)) Object.assign(light, props);
    else if (sel === ':root[data-theme="dark"]' || sel === 'html[data-theme="dark"]') Object.assign(darkToggle, props);
    else if (isDarkMedia(r) && /^(:root|html)(:not\(\[data-theme="light"\]\))?$/.test(sel)) Object.assign(darkMedia, props);
  });
  /* where both dark layouts exist they should agree; report drift */
  const drift = [];
  Object.keys(darkToggle).forEach(k => {
    if (darkMedia.hasOwnProperty(k) && darkMedia[k] !== darkToggle[k]) drift.push(k + ": toggle=" + darkToggle[k] + " media=" + darkMedia[k]);
  });
  const dark = Object.assign({}, light, darkMedia, darkToggle);
  return { light, dark, parts, drift, hasDark: !!(Object.keys(darkToggle).length || Object.keys(darkMedia).length) };
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

/* "#abc", "#aabbcc", "#aabbccdd", "rgb(1,2,3)", "rgba(1,2,3,.5)", "rgb(1 2 3 / 50%)" -> [r,g,b,a] */
function parseColor(s) {
  if (s === null || s === undefined) return null;
  s = String(s).trim().toLowerCase();
  if (NAMED.hasOwnProperty(s)) return NAMED[s];
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
  return rules(css).filter(r => r.decls.animation || r.decls["animation-iteration-count"])
    .map(r => ({ selector: r.selector, value: r.decls.animation || "", count: r.decls["animation-iteration-count"] || "", line: r.line, media: r.media }));
}

module.exports = { rules, tokens, resolveVar, parseColor, contrast, luminance, animations };
