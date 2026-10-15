"use strict";
/* The whitelist an icon SVG must meet to become path data in src/data/icons.json, shared by
   tools/gen-icons.js (on Phosphor's files) and check-static `icons` (on the committed output).
   Nothing but path data gets through: one <svg> of viewBox 0 0 256 256 whose children are
   <path d fill> elements and, dropped, Phosphor's bounding <rect width="256" height="256" fill="none"/>. */
const VIEWBOX = "0 0 256 256";
const D_CHARS = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\-\s]+$/;
const XMLNS = "http://www.w3.org/2000/svg";
const MAX_BYTES = 32 * 1024;

/* attributes of a tag's text after its name: [{ name, value }], or throws on anything not name="value".
   Scanned left to right with indexOf and char tests: no regex backtracking on a long run of spaces. */
function attrsOf(text, what) {
  const out = [];
  const n = text.length;
  const isWs = (c) => c === " " || c === "\t" || c === "\n" || c === "\r";
  const isName = (c) => (c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || c === ":" || c === "-";
  let i = 0;
  const near = () => text.slice(i, i + 30).trim();
  while (i < n) {
    while (i < n && isWs(text[i])) i++;
    if (i >= n) break;
    const s0 = i;
    while (i < n && isName(text[i])) i++;
    if (i === s0 || text[i] !== "=" || text[i + 1] !== '"') { i = s0; throw new Error(what + ": malformed attribute near `" + near() + "`"); }
    const name = text.slice(s0, i);
    const vs = i + 2, ve = text.indexOf('"', vs);
    const value = ve < 0 ? "" : text.slice(vs, ve);
    if (ve < 0 || /[<>&]/.test(value)) { i = s0; throw new Error(what + ": malformed attribute near `" + near() + "`"); }
    out.push({ name, value });
    i = ve + 1;
  }
  const seen = new Set();
  out.forEach(a => { if (seen.has(a.name)) throw new Error(what + ": attribute " + a.name + " given twice"); seen.add(a.name); });
  return out;
}

function only(attrs, allowed, what) {
  attrs.forEach(a => { if (!allowed.includes(a.name)) throw new Error(what + ": attribute `" + a.name + "` is not allowed (allowed: " + allowed.join(", ") + ")"); });
}

function checkD(d, what) {
  if (!D_CHARS.test(d)) throw new Error(what + ": path data holds characters beyond digits, path commands, and . , - whitespace e");
}

/* the path data strings of an SVG's text, or throws an Error naming the problem */
function parseSvg(text, label) {
  const what = label || "svg";
  if (String(text).length > MAX_BYTES) throw new Error(what + ": larger than " + MAX_BYTES + " bytes");
  const src = String(text).trim();
  if (/<!|<\?|&|url\(|javascript:/i.test(src)) throw new Error(what + ": comment, doctype, processing instruction, entity, url( or javascript: found");
  const openEnd = src.indexOf(">");
  if (!/^<svg(?=[\s>])/.test(src) || openEnd < 0 || src.indexOf("<", 1) < openEnd) throw new Error(what + ": does not start with an <svg> element");
  const open = [src.slice(0, openEnd + 1), src.slice(4, openEnd)];
  if (!/<\/svg>$/.test(src)) throw new Error(what + ": does not end with </svg>");
  const attrs = attrsOf(open[1], what + " <svg>");
  only(attrs, ["xmlns", "viewBox", "fill"], what + " <svg>");
  const get = (n) => { const a = attrs.find(x => x.name === n); return a ? a.value : undefined; };
  if (get("viewBox") !== VIEWBOX) throw new Error(what + ": viewBox is " + JSON.stringify(get("viewBox")) + ", want " + JSON.stringify(VIEWBOX));
  if (get("xmlns") !== undefined && get("xmlns") !== XMLNS) throw new Error(what + ": xmlns is not " + XMLNS);
  if (get("fill") !== undefined && get("fill") !== "currentColor") throw new Error(what + ": <svg> fill must be currentColor");
  const inner = src.slice(open[0].length, src.length - "</svg>".length);
  const paths = [];
  let rest = inner.trim();
  while (rest) {
    if (rest.charAt(0) !== "<") throw new Error(what + ": text content inside <svg> (`" + rest.slice(0, 20) + "`)");
    const end = rest.indexOf(">");
    const t = /^<\/?(\w+)/.exec(rest.slice(0, 40));
    const next = rest.indexOf("<", 1);
    if (!t || rest.charAt(1) === "/" || end < 1 || rest.charAt(end - 1) !== "/" || (next >= 0 && next < end)) {
      throw new Error(what + ": element <" + (t ? t[1] : "?") + "> is not allowed, or is not self-closed (only <path/> and the bounding <rect/>)");
    }
    const m = [rest.slice(0, end + 1), t[1], rest.slice(1 + t[1].length, end - 1)];
    m[0] += rest.slice(end + 1).match(/^\s*/)[0];
    const tag = m[1], a = attrsOf(m[2], what + " <" + tag + ">");
    if (tag === "path") {
      only(a, ["d", "fill"], what + " <path>");
      const d = a.find(x => x.name === "d");
      if (!d) throw new Error(what + ": <path> has no d");
      checkD(d.value, what + " <path>");
      const f = a.find(x => x.name === "fill");
      if (f && f.value !== "currentColor") throw new Error(what + ": <path> fill must be currentColor (or absent)");
      paths.push(d.value);
    } else if (tag === "rect") {
      only(a, ["width", "height", "fill"], what + " <rect>");
      const ok = a.length === 3 && a.every(x => (x.name === "fill" ? x.value === "none" : x.value === "256"));
      if (!ok) throw new Error(what + ": the only <rect> allowed is the bounding rect width=\"256\" height=\"256\" fill=\"none\"");
    } else {
      throw new Error(what + ": element <" + tag + "> is not allowed (only <path/> and the bounding <rect/>)");
    }
    rest = rest.slice(m[0].length);
  }
  if (!paths.length) throw new Error(what + ": no <path> found");
  return paths;
}

/* problems with a parsed src/data/icons.json (the committed file alone), as strings */
function dataProblems(data) {
  const out = [];
  const keys = (o) => Object.keys(o).sort().join(",");
  if (!data || typeof data !== "object") return ["icons.json is not an object"];
  if (keys(data) !== "_,icons,source,viewBox") out.push("icons.json top-level keys are " + keys(data) + ", want _,icons,source,viewBox");
  if (data.viewBox !== VIEWBOX) out.push("viewBox is " + JSON.stringify(data.viewBox) + ", want " + JSON.stringify(VIEWBOX));
  const icons = data.icons && typeof data.icons === "object" ? data.icons : {};
  Object.keys(icons).forEach(n => {
    const e = icons[n];
    if (!e || typeof e !== "object" || keys(e) !== "from,paths") { out.push(n + ": keys are not exactly from, paths"); return; }
    if (!/^(bold|fill)\/[a-z0-9-]+$/.test(e.from)) out.push(n + ": from `" + e.from + "` is not <weight>/<name>");
    if (!Array.isArray(e.paths) || !e.paths.length) { out.push(n + ": paths is not a non-empty array"); return; }
    e.paths.forEach((d, i) => { if (typeof d !== "string" || !D_CHARS.test(d)) out.push(n + ": path " + i + " holds characters beyond path data"); });
  });
  return out;
}

module.exports = { VIEWBOX, D_CHARS, parseSvg, dataProblems };
