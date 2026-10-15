"use strict";
/* The whitelist an icon SVG must meet to become path data in src/data/icons.json, shared by
   tools/gen-icons.js (on Phosphor's files) and check-static `icons` (on the committed output).
   Nothing but path data gets through: one <svg> of viewBox 0 0 256 256 whose children are
   <path d fill> elements and, dropped, Phosphor's bounding <rect width="256" height="256" fill="none"/>. */
const VIEWBOX = "0 0 256 256";
const D_CHARS = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\-\s]+$/;
const XMLNS = "http://www.w3.org/2000/svg";

/* attributes of a tag's text after its name: [{ name, value }], or throws on anything not name="value" */
function attrsOf(text, what) {
  const out = [];
  let rest = text.trim();
  while (rest) {
    const m = /^([A-Za-z:-]+)="([^"<>&]*)"\s*/.exec(rest);
    if (!m) throw new Error(what + ": malformed attribute near `" + rest.slice(0, 30) + "`");
    out.push({ name: m[1], value: m[2] });
    rest = rest.slice(m[0].length);
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
  const src = String(text).trim();
  if (/<!|<\?|&|url\(|javascript:/i.test(src)) throw new Error(what + ": comment, doctype, processing instruction, entity, url( or javascript: found");
  const open = /^<svg((?:\s+[^<>]*?)?)>/.exec(src);
  if (!open) throw new Error(what + ": does not start with an <svg> element");
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
    const m = /^<(\w+)((?:\s+[^<>]*?)?)\s*\/>\s*/.exec(rest);
    if (!m) {
      if (rest.charAt(0) !== "<") throw new Error(what + ": text content inside <svg> (`" + rest.slice(0, 20) + "`)");
      const t = /^<\/?(\w+)/.exec(rest);
      throw new Error(what + ": element <" + (t ? t[1] : "?") + "> is not allowed, or is not self-closed (only <path/> and the bounding <rect/>)");
    }
    const tag = m[1], a = attrsOf(m[2], what + " <" + tag + ">");
    if (tag === "path") {
      only(a, ["d", "fill"], what + " <path>");
      const d = a.find(x => x.name === "d");
      if (!d) throw new Error(what + ": <path> has no d");
      checkD(d.value, what + " <path>");
      const f = a.find(x => x.name === "fill");
      if (f && f.value !== "none" && f.value !== "currentColor") throw new Error(what + ": <path> fill must be none or currentColor");
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
