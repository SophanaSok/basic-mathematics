"use strict";
/* A small, tolerant HTML parser — enough for this site's hand-written pages.
   Handles attributes (quoted, unquoted, bare), void elements, comments, doctype,
   raw-text elements (script/style), inline <svg> with self-closing tags, and the
   usual implied-close rules for p/li. It is not a browser; it is just regular enough
   for pages that are themselves regular. Every node records the 1-based line it
   starts on, so checks can point at a place in the file. */

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr"]);
const RAW = new Set(["script", "style", "textarea", "title"]);
/* an open <p> is closed by any of these */
const CLOSES_P = new Set(["address", "article", "aside", "blockquote", "details", "div", "dl", "fieldset",
  "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "main",
  "nav", "ol", "p", "pre", "section", "table", "ul"]);

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ldquo: "“", rdquo: "”",
  lsquo: "‘", rsquo: "’", mdash: "—", ndash: "–", hellip: "…", times: "×",
  minus: "−", deg: "°", middot: "·", copy: "©", le: "≤", ge: "≥", ne: "≠",
  pi: "π", radic: "√", infin: "∞", plusmn: "±", rarr: "→", larr: "←"
};

function decode(s) {
  if (s.indexOf("&") === -1) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES.hasOwnProperty(body) ? ENTITIES[body] : m;
  });
}

class Node {
  constructor(type, name, line) {
    this.type = type;          // "element" | "text" | "comment" | "document"
    this.name = name || "";    // lower-case tag name for elements
    this.attrs = {};
    this.children = [];
    this.parent = null;
    this.text = "";            // for text / comment nodes
    this.line = line || 0;
  }
  get id() { return this.attrs.id || ""; }
  getAttribute(n) { return this.attrs.hasOwnProperty(n) ? this.attrs[n] : null; }
  hasAttribute(n) { return this.attrs.hasOwnProperty(n); }
  get classList() { return (this.attrs.class || "").split(/\s+/).filter(Boolean); }
  hasClass(c) { return this.classList.indexOf(c) !== -1; }
  /* document-order walk over element descendants */
  *elements() {
    for (const c of this.children) {
      if (c.type === "element") { yield c; yield* c.elements(); }
    }
  }
  /* a very small selector: "tag", ".class", "tag.class", "[attr]", "tag[attr]" and
     comma lists of those; descendant combinators are not supported */
  queryAll(sel) {
    const alts = sel.split(",").map(s => s.trim()).filter(Boolean).map(parseSimple);
    const out = [];
    for (const el of this.elements()) if (alts.some(a => a(el))) out.push(el);
    return out;
  }
  query(sel) { return this.queryAll(sel)[0] || null; }
  get textContent() {
    if (this.type === "text") return this.text;
    if (this.type === "comment") return "";
    let s = "";
    for (const c of this.children) s += c.textContent;
    return s;
  }
  get children_elements() { return this.children.filter(c => c.type === "element"); }
}

function parseSimple(s) {
  const m = /^([a-zA-Z0-9-]*)((?:[.#][\w-]+|\[[^\]]+\])*)$/.exec(s);
  if (!m) throw new Error("unsupported selector: " + s);
  const tag = m[1].toLowerCase();
  const tests = [];
  const re = /([.#])([\w-]+)|\[([^\]=]+)(?:=("[^"]*"|'[^']*'|[^\]]*))?\]/g;
  let mm;
  while ((mm = re.exec(m[2]))) {
    if (mm[1] === ".") { const c = mm[2]; tests.push(el => el.hasClass(c)); }
    else if (mm[1] === "#") { const i = mm[2]; tests.push(el => el.id === i); }
    else {
      const a = mm[3];
      if (mm[4] === undefined) tests.push(el => el.hasAttribute(a));
      else { const v = mm[4].replace(/^["']|["']$/g, ""); tests.push(el => el.getAttribute(a) === v); }
    }
  }
  return el => (!tag || el.name === tag) && tests.every(t => t(el));
}

function parse(src) {
  const doc = new Node("document", "#document", 1);
  const stack = [doc];
  let i = 0, line = 1;
  const n = src.length;

  function top() { return stack[stack.length - 1]; }
  function countLines(from, to) { for (let k = from; k < to; k++) if (src.charCodeAt(k) === 10) line++; }
  function addText(t, atLine) {
    if (!t) return;
    const node = new Node("text", "#text", atLine);
    node.text = decode(t);
    node.parent = top();
    top().children.push(node);
  }
  function openTag(name, attrs, selfClosing, atLine) {
    if (name === "p" || CLOSES_P.has(name)) {
      /* implied </p> */
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === "p") { stack.length = k; break; }
        if (stack[k].name !== "p" && !isInline(stack[k].name)) break;
      }
    }
    if (name === "li" || name === "dt" || name === "dd" || name === "option" || name === "tr" || name === "td" || name === "th") {
      /* implied close of the previous sibling of the same kind */
      for (let k = stack.length - 1; k > 0; k--) {
        const nm = stack[k].name;
        if (nm === name) { stack.length = k; break; }
        if (nm === "ul" || nm === "ol" || nm === "dl" || nm === "table" || nm === "tbody" || nm === "thead" || nm === "tr" && name !== "tr") break;
      }
    }
    const el = new Node("element", name, atLine);
    el.attrs = attrs;
    el.parent = top();
    top().children.push(el);
    if (!selfClosing && !VOID.has(name)) stack.push(el);
  }
  function closeTag(name) {
    for (let k = stack.length - 1; k > 0; k--) {
      if (stack[k].name === name) { stack.length = k; return; }
    }
    /* stray close tag: ignore */
  }

  while (i < n) {
    const lt = src.indexOf("<", i);
    if (lt === -1) { addText(src.slice(i), line); countLines(i, n); break; }
    if (lt > i) { addText(src.slice(i, lt), line); countLines(i, lt); }
    i = lt;
    const startLine = line;
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      const stop = end === -1 ? n : end + 3;
      const c = new Node("comment", "#comment", startLine);
      c.text = src.slice(i + 4, end === -1 ? n : end);
      c.parent = top(); top().children.push(c);
      countLines(i, stop); i = stop; continue;
    }
    if (src.startsWith("<!", i) || src.startsWith("<?", i)) {
      const end = src.indexOf(">", i);
      const stop = end === -1 ? n : end + 1;
      countLines(i, stop); i = stop; continue;
    }
    if (src[i + 1] === "/") {
      const m = /^<\/([a-zA-Z][^\s>\/]*)\s*>/.exec(src.slice(i, i + 200));
      if (!m) { addText("<", line); i++; continue; }
      closeTag(m[1].toLowerCase());
      countLines(i, i + m[0].length); i += m[0].length; continue;
    }
    const tm = /^<([a-zA-Z][^\s>\/]*)/.exec(src.slice(i, i + 200));
    if (!tm) { addText("<", line); i++; continue; }
    const name = tm[1].toLowerCase();
    let j = i + tm[0].length;
    const attrs = {};
    let selfClosing = false;
    /* attributes */
    for (;;) {
      while (j < n && /\s/.test(src[j])) j++;
      if (j >= n) break;
      if (src[j] === ">") { j++; break; }
      if (src[j] === "/" ) { selfClosing = true; j++; continue; }
      const am = /^([^\s"'>\/=]+)/.exec(src.slice(j, j + 300));
      if (!am) { j++; continue; }
      const aname = am[1].toLowerCase();
      j += am[0].length;
      let k = j;
      while (k < n && /\s/.test(src[k])) k++;
      if (src[k] === "=") {
        k++;
        while (k < n && /\s/.test(src[k])) k++;
        const q = src[k];
        if (q === '"' || q === "'") {
          const end = src.indexOf(q, k + 1);
          const val = src.slice(k + 1, end === -1 ? n : end);
          attrs[aname] = decode(val);
          j = end === -1 ? n : end + 1;
        } else {
          const vm = /^[^\s>]+/.exec(src.slice(k));
          attrs[aname] = decode(vm ? vm[0] : "");
          j = k + (vm ? vm[0].length : 0);
        }
      } else {
        attrs[aname] = "";
      }
    }
    countLines(i, j);
    i = j;
    openTag(name, attrs, selfClosing, startLine);
    if (RAW.has(name) && !selfClosing) {
      const close = new RegExp("</" + name + "\\s*>", "i");
      const rest = src.slice(i);
      const m = close.exec(rest);
      const end = m ? i + m.index : n;
      const t = new Node("text", "#text", line);
      t.text = src.slice(i, end);        /* raw: no entity decoding */
      t.parent = top(); top().children.push(t);
      countLines(i, m ? end + m[0].length : n);
      i = m ? end + m[0].length : n;
      stack.pop();
    }
  }
  return doc;
}

const INLINE = new Set(["a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "dfn", "em", "i", "kbd",
  "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr", "label", "button", "input"]);
function isInline(name) { return INLINE.has(name); }

/* whitespace-normalised text, as a browser's textContent.trim().replace(/\s+/g," ") would give */
function normText(s) { return String(s).replace(/\s+/g, " ").trim(); }

/* FNV-1a over UTF-16 code units; the same function is shipped into the browser */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return ("0000000" + h.toString(16)).slice(-8);
}

module.exports = { parse, Node, decode, normText, hash, VOID };
