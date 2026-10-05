/* A line of plain text for a formula, read off the MathML that KaTeX writes beside its
   drawing: (7, 5), x ≤ −3, −1/2, √3/2, cos θ, x² + 1.

   Why: an accessible name is plain text, worked out from an element's content, and
   neither Chromium nor axe-core takes any text from a <math> element when it does so.
   So a button, a choice's label or a table header whose content is a formula has an
   empty name (a guess chip of "$(7,5)$" is announced as "button" and nothing more), and
   one that mixes words and a formula loses the formula (" — five times as much").
   src/ui/math-names.ts puts this line, visually hidden, in place of the formula's
   MathML in exactly those places; everywhere else the MathML stays as KaTeX wrote it.

   The text says what the drawing shows and nothing more: it is the same symbols in a
   line, never a value worked out, so a name can give away nothing a sighted reader
   cannot see (the opening puzzle's guesses are buttons named this way).

   No DOM and no `window` here: the input is anything shaped like a DOM node, so Vitest
   tests it in Node on KaTeX's own output. */

/** the parts of a DOM node this reads: an Element or Text node passes as it is */
export interface MathNode {
  readonly nodeType: number;
  readonly nodeName: string;
  readonly nodeValue: string | null;
  readonly childNodes: ArrayLike<MathNode>;
  getAttribute?(name: string): string | null;
}

const TEXT = 3;
const ELEMENT = 1;

/** operators written with a space on each side (a prefix + or − is not: "−3") */
const SPACED = new Set([
  "=", "<", ">", "≤", "≥", "≠", "≈", "≡", "≅", "∼", "≃", "∝",
  "+", "−", "-", "±", "∓", "×", "·", "⋅", "÷", "∘",
  "→", "←", "↔", "↦", "⇒", "⇐", "⇔", "⟹", "⟸", "⟺", "⟶", "⟼",
  "∈", "∉", "∋", "⊂", "⊆", "⊃", "⊇", "⊊", "∪", "∩", "∖", "∧", "∨", "¬",
  "∀", "∃", ":", "≔"
]);
/** a + or − here is a sign, not an operation */
const PREFIX_AFTER = new Set(["(", "[", "{", "⟨", ","]);
const SIGNS = new Set(["+", "−", "-", "±", "∓"]);
const OPEN = "([{⟨";

/** what a character of the drawing is called in the line, where its own name misleads:
    U+2223 (KaTeX's |) is read "divides"; U+2061 (function application, between sin and
    its argument) and the other invisible operators are not read at all */
const CHAR: Readonly<Record<string, string>> = {
  "∣": "|", "\u2061": " ", "\u2062": "", "\u2063": "", "\u2064": "", "\u00a0": " "
};

const SUP: Readonly<Record<string, string>> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "−": "⁻", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", "n": "ⁿ", "i": "ⁱ"
};
const SUB: Readonly<Record<string, string>> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "−": "₋", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  "a": "ₐ", "e": "ₑ", "h": "ₕ", "i": "ᵢ", "j": "ⱼ", "k": "ₖ", "l": "ₗ", "m": "ₘ", "n": "ₙ",
  "o": "ₒ", "p": "ₚ", "r": "ᵣ", "s": "ₛ", "t": "ₜ", "u": "ᵤ", "v": "ᵥ", "x": "ₓ"
};
/** a superscript that is a mark on its base rather than a power */
const SUP_MARK: Readonly<Record<string, string>> = { "∘": "°", "°": "°", "′": "′", "″": "″", "‴": "‴", "∗": "*", "*": "*" };
/** accents over a base, by the character KaTeX puts in the <mo> */
const ACCENT: Readonly<Record<string, (base: string) => string>> = {
  "⃗": b => "vector " + b, "→": b => "vector " + b, "⟶": b => "vector " + b, "⇀": b => "vector " + b,
  "‾": b => b + " bar", "¯": b => b + " bar", "ˉ": b => b + " bar", "_": b => b + " bar",
  "^": b => b + " hat", "ˆ": b => b + " hat",
  "~": b => b + " tilde", "˜": b => b + " tilde",
  "˙": b => b + " dot", "¨": b => b + " double dot"
};
const BIG = new Set(["∑", "∏", "∫", "∮", "⋃", "⋂", "lim", "max", "min", "sup", "inf"]);

function nameOf(n: MathNode): string {
  return n.nodeName.toLowerCase().replace(/^m:/, "");
}

function kids(n: MathNode): MathNode[] {
  const out: MathNode[] = [];
  for (let i = 0; i < n.childNodes.length; i++) {
    const c = n.childNodes[i];
    if (c.nodeType === ELEMENT || (c.nodeType === TEXT && (c.nodeValue || "").trim() !== "")) out.push(c);
  }
  return out;
}

function chars(s: string): string {
  return Array.from(s, ch => (ch in CHAR ? CHAR[ch] : ch)).join("");
}

/** every text node under n, in order */
function textOf(n: MathNode): string {
  if (n.nodeType === TEXT) return n.nodeValue || "";
  let s = "";
  for (let i = 0; i < n.childNodes.length; i++) s += textOf(n.childNodes[i]);
  return s;
}

function tidy(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** one number or one letter (a root of one, or one carrying primes or scripts) */
const ATOM = /^√?(\p{N}+(\.\p{N}+)?|\p{L})[′″‴°⁰¹²³⁴⁵⁶⁷⁸⁹ⁿⁱ⁺⁻₀₁₂₃₄₅₆₇₈₉ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ₊₋]*$/u;

/** wrapped in brackets unless it is one atom, or bracketed already: b/(2a), not b/2a */
function group(s: string): string {
  const t = tidy(s);
  if (ATOM.test(t)) return t;
  if (t.length > 1 && OPEN.includes(t[0]) && closes(t)) return t;
  return "(" + t + ")";
}

/** t opens with a bracket that closes only at its very end */
function closes(t: string): boolean {
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (OPEN.includes(t[i])) depth++;
    else if (")]}⟩".includes(t[i])) { depth--; if (depth === 0 && i < t.length - 1) return false; }
  }
  return depth === 0;
}

function script(s: string, table: Readonly<Record<string, string>>): string | null {
  const t = s.replace(/\s+/g, "");
  if (!t) return null;
  let out = "";
  for (const ch of t) {
    if (!(ch in table)) return null;
    out += table[ch];
  }
  return out;
}

interface Part { text: string; op: string | null; frac: boolean; name: boolean }

/** n is a fraction, perhaps inside an mstyle or mrow of its own (\tfrac, \dfrac) */
function isFrac(n: MathNode): boolean {
  if (n.nodeType !== ELEMENT) return false;
  const name = nameOf(n);
  if (name === "mfrac") return !(n.getAttribute && /^0/.test(n.getAttribute("linethickness") || ""));
  if (name === "mstyle" || name === "mrow" || name === "mpadded") { const c = kids(n); return c.length === 1 && isFrac(c[0]); }
  return false;
}

/** a row: its parts side by side, operators spaced, a leading sign kept tight, a
    function's name set apart from what comes before it (r cos α, not rcos α), and a
    fraction that touches its neighbour bracketed ((1/2)(P + Q), not 1/2(P + Q)) */
function row(nodes: MathNode[]): string {
  const parts: Part[] = nodes.map(n => {
    const op = nameOf(n) === "mo" ? tidy(chars(textOf(n))) : null;
    const text = lin(n);
    return { text, op, frac: isFrac(n), name: nameOf(n) === "mi" && /^\p{L}{2,}$/u.test(tidy(text)) };
  });
  const bare = (p: Part | undefined) => !!p && p.op === null;
  let out = "";
  let prev: Part | null = null;
  parts.forEach((p, i) => {
    if (p.op !== null && p.op !== "" && SPACED.has(p.op)) {
      const sign = SIGNS.has(p.op) && (prev === null || (prev.op !== null && (SPACED.has(prev.op) || PREFIX_AFTER.has(prev.op) || OPEN.includes(prev.op))));
      out += sign ? " " + p.op : " " + p.op + " ";
    } else if (p.op === ",") {
      out += ", ";
    } else if (p.frac && (bare(parts[i - 1]) || bare(parts[i + 1]) || parts[i + 1]?.op === "(")) {
      out += "(" + tidy(p.text) + ")";
    } else {
      out += (p.name && /[\p{L}\p{N})]$/u.test(out) ? " " : "") + p.text;
    }
    if (p.op !== "") prev = p;
  });
  return out;
}

function lin(n: MathNode): string {
  if (n.nodeType === TEXT) return chars(n.nodeValue || "");
  if (n.nodeType !== ELEMENT) return "";
  const name = nameOf(n);
  const c = kids(n);
  switch (name) {
    case "annotation": case "annotation-xml": case "mphantom": case "mprescripts": case "none":
      return "";
    case "semantics":
      return c.length ? lin(c[0]) : "";
    case "mi": case "mn": case "mo": case "mtext": case "ms":
      return chars(textOf(n));
    case "mspace":
      return " ";
    case "mfrac": {
      const [num, den] = [c[0] ? lin(c[0]) : "", c[1] ? lin(c[1]) : ""];
      const thick = n.getAttribute ? n.getAttribute("linethickness") : null;
      if (thick !== null && /^0(\.0*)?([a-z]+)?$/.test(thick)) return tidy(num) + " choose " + tidy(den);
      return group(num) + "/" + group(den);
    }
    case "msqrt":
      return "√" + group(row(c));
    case "mroot": {
      const base = c[0] ? lin(c[0]) : "", index = tidy(c[1] ? lin(c[1]) : "");
      if (index === "3") return "∛" + group(base);
      if (index === "4") return "∜" + group(base);
      return "root " + index + " of " + group(base);
    }
    case "msup": case "msub": case "msubsup": case "munder": case "mover": case "munderover":
      return scripts(name, c, n);
    case "mtable":
      return "[" + c.map(r => lin(r)).join("; ") + "]";
    case "mtr": case "mlabeledtr":
      return c.map(d => tidy(lin(d))).join(", ");
    default:
      /* math, mrow, mstyle, mpadded, menclose, mtd, merror and anything newer: a row */
      return row(c);
  }
}

function scripts(name: string, c: MathNode[], n: MathNode): string {
  const baseNode = c[0];
  const base = baseNode ? tidy(lin(baseNode)) : "";
  const big = BIG.has(base);
  const one = c[1] ? lin(c[1]) : "";
  const two = c[2] ? lin(c[2]) : "";
  if (name === "mover" || name === "munder") {
    const mark = tidy(chars(textOf(c[1] || baseNode)));
    const accent = (n.getAttribute && (n.getAttribute("accent") === "true" || n.getAttribute("accentunder") === "true")) || mark in ACCENT;
    /* a name under one accent stays whole: AB bar is the segment AB */
    if (name === "mover" && accent && ACCENT[mark]) return ACCENT[mark](/^[\p{L}\p{N}′]+$/u.test(base) ? base : group(base));
    if (big) return base + (name === "munder" ? (base === "lim" ? " as " : " over ") : " to ") + tidy(one) + " ";
    return name === "munder" ? base + "_" + group(one) : base + "^" + group(one);
  }
  if (name === "munderover" || (big && name === "msubsup")) return base + " from " + tidy(one) + " to " + tidy(two) + " ";
  if (big && name === "msub") return base + (base === "lim" ? " as " : " over ") + tidy(one) + " ";
  const sub = name === "msub" || name === "msubsup" ? one : null;
  const sup = name === "msup" ? one : name === "msubsup" ? two : null;
  let out = base;
  if (sub !== null) out += script(sub, SUB) ?? "_" + group(sub);
  if (sup !== null) {
    const mark = tidy(sup);
    out += SUP_MARK[mark] ?? script(sup, SUP) ?? "^" + group(sup);
  }
  return out;
}

/** The line for one formula: `math` is KaTeX's <math> element (or anything under it). */
export function mathText(math: MathNode): string {
  return tidy(lin(math)).replace(/([([{⟨])\s+/g, "$1").replace(/\s+([)\]}⟩])/g, "$1");
}

/** The TeX a <math> element was typeset from, from its annotation, or "" */
export function texOf(math: MathNode): string {
  let found = "";
  (function walk(n: MathNode) {
    if (found) return;
    if (n.nodeType === ELEMENT && nameOf(n) === "annotation") { found = textOf(n).trim(); return; }
    for (let i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]);
  })(math);
  return found;
}
