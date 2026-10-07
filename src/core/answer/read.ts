/* The typed grader's reader: what a number, fraction, set or point box's text means, as an
   exact rational (rational.ts), or why it has no single reading (an UnreadReason, so the
   learner retypes). It sees the typed text and the box only, never the key, so a refusal
   cannot give the answer away; keys are read by the same functions.

     cleanNumber  ½ ¼ ¾ ⅓ ⅔ as " n/d ", the dashes and full-width digits as ASCII, ÷ as /,
                  whitespace collapsed to one space, lower case
     readNumber   one number in a number or fraction box: a trailing full stop peeled, the
                  refusals checked in a fixed order, then the grammar (an integer, a decimal,
                  thousands commas, a fraction with at most one sign on each side, a mixed
                  number, brackets, a leading $)
     readList     a set box: members split on , ; " or " " and ", empty ones ignored, ±7 as
                  7 and -7, each member read as a number without thousands commas
     readTuple    a point: k >= 2 coordinates in an optional (...), [...] or <...>, or labeled
                  x=, y= (z=); null when the text is not a point

   Every rule is a switch. A rule id in `off` makes its step do what the grader before it
   did (src/core/answer/legacy.ts), so a tool can switch one rule off and see which change
   it made:
     N-unicode  ½-style fractions, ‐ ‒ ﹣ －, full-width digits (off: left as typed)
     N-divide   ÷ as / (off: left as typed)
     N-dot      the trailing full stop (off: kept)
     N-named    "x = 3" refused as named (off: read on, as an expression)
     N-refuse   every other refusal, Q4(b)'s "mixed" among them (off: none; text the grammar
                cannot read has no reading, $ is dropped wherever it stands, then a
                leading +)
     N-space    a space inside a number refused (off: every space deleted, then read)
     N-mixed    "1 1/2" read as 3/2 (off: the space deleted, so 11/2)
     N-comma    thousands commas in a number or fraction box (off: not read)
     N-bracket  "(7)", "(3)/(2)" (off: not read)
     L-sep      " or " and " and " between set members (off: only , and ;)
     L-pm       ±7 as two members (off: refused as plus-minus)
     L-zero     a member led by 0 and a digit ("000", "-05") refused (off: read)
     L-mixed    "2 1/3", "2 and 1/3" refused in a set (off: read as a mixed number, or
                split on " and ")
     T-zero     a coordinate led by 0 and a digit makes the text no point (off: read); a
                guard for tests, never a ledger rule
   A leading $ and ignoring empty set members are what the old grader did, and have no id.

   Each reading carries its exact value and a float built from its own parts (parseFloat of
   each part with its commas removed, a mixed number as (w*b+a)/b, one division), which is
   what N-exact's off position compares, as the old sameNumber did. It also carries `read`,
   the text "We read that as ..." shows (types.ts Verdict), and whether that line is worth
   showing: only for a mixed number, a ½-style character or a labeled point.

   Q4, how a mixed number reads, is the owner's to answer, so it is an option every call
   names: "a" reads 1 1/2 as 3/2 (refused in a set either way), "b" refuses it as "mixed".

   Pure: no `window`, no DOM, no float in any decision. */

import type { Note, Owner, RuleId, UnreadReason } from "./types.ts";
import { make, type Q } from "./rational.ts";

export interface ReadOptions {
  /** the owner's answer to Q4 (types.ts Owner) */
  q4: Owner["q4"];
  /** rule ids whose step does what the old grader did */
  off?: ReadonlySet<RuleId>;
}

export type Shape = "integer" | "decimal" | "fraction" | "mixed";

export interface NumberReading {
  ok: true;
  value: Q;
  /** the reading's float from its own parts: what N-exact's off position compares */
  float: number;
  shape: Shape;
  /** a decimal's digits after the point (N-round compares at that many); 0 for the rest */
  places: number;
  /** what was seen: a mixed number, thousands commas, a fraction whose whole-number parts
      share a factor (6/4, and 1 100/200) */
  notes: Note[];
  read: string;
  /** whether "We read that as ..." is worth showing: a mixed number or a ½-style character */
  show: boolean;
}

export interface ListReading { ok: true; members: NumberReading[]; read: string; show: boolean }

export interface TupleReading {
  values: NumberReading[];
  /** written in [...] or <...>, or labeled: a point key has none of these */
  notation: boolean;
  labeled: boolean;
  read: string;
  show: boolean;
}

/** No reading. `reason` is the refusal, or null when nothing refused the text and it still
    does not read (only with N-refuse off, where it grades wrong as the old grader's did).
    `at` is the value of the answer the refusal is about, counting from 0: the member of a
    set in typed order, empty members skipped; 0 for a one-number box and for a refusal of a
    set's whole text. */
export interface Refusal { ok: false; reason: UnreadReason | null; at: number }

/** The rule ids this module switches, for the tests that turn each one off */
export const READ_RULES: readonly RuleId[] = ["N-unicode", "N-divide", "N-dot", "N-named", "N-refuse", "N-space",
  "N-mixed", "N-comma", "N-bracket", "L-sep", "L-pm", "L-zero", "L-mixed", "T-zero"];

/** Words that make a number an expression, not a number with units: "2 pi", "25pi" */
export const MATH_WORDS: readonly string[] = ["pi", "sqrt", "root", "abs", "sin", "cos", "tan", "log", "ln", "exp"];

const NONE: ReadonlySet<RuleId> = new Set();
const VULGAR: Record<string, string> = { "½": " 1/2 ", "¼": " 1/4 ", "¾": " 3/4 ", "⅓": " 1/3 ", "⅔": " 2/3 " };

/** The cleaning every number, set and point reading starts with (the trailing full stop is
    the reader's, not this) */
export function cleanNumber(text: unknown, off: ReadonlySet<RuleId> = NONE): string {
  let t = String(text);
  if (!off.has("N-unicode")) {
    t = t.replace(/[½¼¾⅓⅔]/g, (c) => VULGAR[c])
      .replace(/[‐‒﹣－]/g, "-")
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 48));
  }
  t = t.replace(/[−–—]/g, "-");
  if (!off.has("N-divide")) t = t.replace(/÷/g, "/");
  return t.trim().replace(/\s+/g, " ").toLowerCase();
}

/* ------------------------------------------------------------- grammar -- */

const INT = "\\d+";
const THOUSANDS = "[1-9]\\d{0,2}(?:,\\d{3})+";
const atomOf = (commas: boolean) => "(?:(?:" + (commas ? THOUSANDS + "|" : "") + INT + ")(?:\\.\\d+)?|\\.\\d+)";
const ATOM = { plain: new RegExp("^" + atomOf(false) + "$"), commas: new RegExp("^" + atomOf(true) + "$") };
/* a / b, each side an atom or (when N-bracket is on) a bracketed signed atom, an optional
   sign before the denominator */
const ratioOf = (commas: boolean, brackets: boolean) => {
  const a = atomOf(commas), part = brackets ? "(\\( ?[+-]? ?" + a + " ?\\)|" + a + ")" : "(" + a + ")";
  return new RegExp("^" + part + " ?/ ?([+-]?) ?" + part + "$");
};
const RATIO = {
  plain: ratioOf(false, true), commas: ratioOf(true, true),
  plainNoBracket: ratioOf(false, false), commasNoBracket: ratioOf(true, false)
};
const MIXED = /^(\d+) (\d+)\/(\d+)$/;
const THOUSANDS_ONLY = new RegExp("^" + THOUSANDS + "$");

/* what the grammar makes of a value, before the signs in front of it */
interface Parsed {
  value: Q; float: number; shape: Shape; places: number; notes: Note[];
  /** the reading's text without its sign, and whether that sign is minus */
  body: string; neg: boolean;
  /** signs on the numerator side inside brackets: (-4) counts one */
  signs: number;
}
/* the grammar's other outcomes: no reading, a zero denominator, Q4(b)'s refusal */
type NotParsed = null | "zero" | "mixed";

interface Ctx { commas: boolean; off: ReadonlySet<RuleId>; q4: Owner["q4"] }

const gcd = (a: bigint, b: bigint): bigint => { while (b) { const r = a % b; a = b; b = r; } return a; };
const noZeros = (atom: string) => atom.replace(/^0+(?=\d)/, "");
const isParsed = (p: Parsed | NotParsed): p is Parsed => p !== null && typeof p === "object";

/* an atom: digits with an optional point and thousands commas, as an exact decimal */
function atom(s: string): { value: Q; float: number; whole: bigint | null; places: number; commas: boolean } {
  const plain = s.replace(/,/g, ""), dot = plain.indexOf(".");
  const frac = dot < 0 ? "" : plain.slice(dot + 1);
  const value = make(BigInt((dot < 0 ? plain : plain.slice(0, dot) || "0") + frac), 10n ** BigInt(frac.length));
  return { value, float: parseFloat(plain), whole: dot < 0 ? BigInt(plain) : null, places: frac.length, commas: s.includes(",") };
}

/* one side of a fraction: an atom, or a bracketed signed atom */
function fractionPart(s: string) {
  let sign = 0, neg = false;
  if (s.startsWith("(")) {
    s = s.slice(1, -1).replace(/ /g, "");
    if (/^[+-]/.test(s)) { sign = 1; neg = s[0] === "-"; s = s.slice(1); }
  }
  return { ...atom(s), sign, neg, body: noZeros(s) };
}

function parseValue(t: string, c: Ctx): Parsed | NotParsed {
  let m = MIXED.exec(t);
  if (m) {
    /* N-mixed off: the old grader deleted the space, so 1 1/2 was 11/2 */
    if (c.off.has("N-mixed")) return parseValue(m[1] + m[2] + "/" + m[3], c);
    const w = BigInt(m[1]), a = BigInt(m[2]), b = BigInt(m[3]);
    if (a === 0n || b === 0n || a >= b) return null;
    if (c.q4 === "b") return c.off.has("N-refuse") ? parseValue(m[1] + m[2] + "/" + m[3], c) : "mixed";
    const notes: Note[] = gcd(a, b) !== 1n ? ["mixed", "unreduced"] : ["mixed"];
    return { value: make(w * b + a, b), float: Number(w * b + a) / Number(b), shape: "mixed", places: 0, notes,
      body: (w * b + a) + "/" + b, neg: false, signs: 0 };
  }
  const brackets = !c.off.has("N-bracket"), commas = c.commas && !c.off.has("N-comma");
  m = (brackets ? (commas ? RATIO.commas : RATIO.plain) : (commas ? RATIO.commasNoBracket : RATIO.plainNoBracket)).exec(t);
  if (m) {
    const a = fractionPart(m[1]), b = fractionPart(m[3]);
    if (b.value.n === 0n) return "zero";
    const signsD = b.sign + (m[2] ? 1 : 0);
    if (signsD > 1) return null;
    const neg = a.neg !== (b.neg !== (m[2] === "-"));
    const notes: Note[] = [];
    if (a.commas || b.commas) notes.push("thousands");
    if (a.whole !== null && b.whole !== null && gcd(a.whole, b.whole) !== 1n) notes.push("unreduced");
    const value = make(a.value.n * b.value.d, a.value.d * b.value.n);
    return { value: neg ? make(-value.n, value.d) : value, float: (neg ? -1 : 1) * a.float / b.float, shape: "fraction",
      places: 0, notes, body: a.body + "/" + b.body, neg, signs: a.sign };
  }
  if ((commas ? ATOM.commas : ATOM.plain).test(t)) {
    const x = atom(t);
    return { value: x.value, float: x.float, shape: t.includes(".") ? "decimal" : "integer", places: x.places,
      notes: x.commas ? ["thousands"] : [], body: noZeros(t), neg: false, signs: 0 };
  }
  if (brackets && (m = /^\( ?([+-]?) ?(.*?) ?\)$/.exec(t))) {
    const r = parseValue(m[2], c);
    if (!isParsed(r)) return r;
    const neg = r.neg !== (m[1] === "-");
    return { ...r, value: m[1] === "-" ? make(-r.value.n, r.value.d) : r.value, float: m[1] === "-" ? -r.float : r.float,
      neg, signs: r.signs + (m[1] ? 1 : 0) };
  }
  return null;
}

/* answer := [sign] [$] [sign] value, with at most one sign before the value in all */
function parseSigned(t: string, c: Ctx): Parsed | NotParsed {
  let signs = 0, neg = false, m = /^([+-]) ?(.*)$/.exec(t);
  if (m) { signs++; neg = m[1] === "-"; t = m[2]; }
  if ((m = /^\$ ?(.*)$/.exec(t))) {
    t = m[1];
    if ((m = /^([+-]) ?(.*)$/.exec(t))) { signs++; neg = neg !== (m[1] === "-"); t = m[2]; }
  }
  const r = parseValue(t, c);
  if (!isParsed(r)) return r;
  if (signs + r.signs > 1) return null;
  return neg ? { ...r, value: make(-r.value.n, r.value.d), float: -r.float, neg: !r.neg } : r;
}

/* ------------------------------------------------------------ refusals -- */

const NAMED = /^[a-z] ?= ?[^a-z=]*$|^[^a-z=]* ?= ?[a-z]$/;
const SCIENTIFIC = /\d ?(e[+-]?\d|[x*×] ?10 ?\^)/;
/* a digit, a letter, a space, √, π, or one of . , / ( ) + - $ * ^ [ ] { } = < > | ! */
const SYMBOL = /[^0-9a-z .,\/()+\-$*^[\]{}=<>|!√π]/;
const MINUS_MIXED = /^\d+ ?- ?\d+ ?\/ ?\d+$/;
const AND_MIXED = /^[+-]? ?\d+ and \d+ ?\/ ?\d+$/;
const UNITS = /^[^a-z]*\d\)?( ?)([a-z]{2,})( [a-z]+)*$/;
const SPACED = /\d [+-]?\d|\d \.|\. \d/;

const no = (reason: UnreadReason | null, at = 0): Refusal => ({ ok: false, reason, at });

/* a number or fraction box (commas: thousands, and the list and decimal-comma refusals) or
   one member of a set or point (no commas: the text was split on them), already cleaned */
function readOne(t: string, c: Ctx): NumberReading | Refusal {
  const off = c.off, refuse = !off.has("N-refuse");
  if (!off.has("N-dot") && t !== "." && / ?\.$/.test(t)) t = t.replace(/ ?\.$/, "");
  if (t === "") return no("empty");
  if (refuse && (t.length > 200 || /\d{41}/.test(t))) return no("too-long");
  if (!off.has("N-named") && NAMED.test(t)) return no("named");
  if (refuse) {
    if (/[°º˚]/.test(t)) return no("units");
    if (t.includes("%")) return no("percent");
    if (/±|\+-|\+\/-/.test(t)) return no("plus-minus");
    if (SCIENTIFIC.test(t)) return no("scientific");
    if (/\d ?: ?\d/.test(t)) return no("ratio");
    if (SYMBOL.test(t) || t.replace(/^[+-]? ?\$/, "").includes("$")) return no("symbol");
    if (MINUS_MIXED.test(t) || AND_MIXED.test(t)) return no("ambiguous-mixed");
    if (c.commas) {
      const runs = t.match(/[\d,]+/g) || [];
      const notThousands = (run: string) => run.includes(",") && !THOUSANDS_ONLY.test(run);
      if (/, ?[+-]|, /.test(t) || runs.some((run) => (run.match(/,/g) || []).length > 1 && notThousands(run))
        || /\d\)? (or|and) [+-]? ?[\d.(]/.test(t)) return no("list");
      if (runs.some(notThousands)) return no("decimal-comma");
    }
    if (/[a-z]/.test(t)) {
      if (/^[a-z ]+$/.test(t)) return no("words");
      const u = UNITS.exec(t);
      if (u && !MATH_WORDS.includes(u[2]) && (u[1] === " " || u[2].length >= 3)) return no("units");
      return no("expression");
    }
  } else {
    /* the old toNumber dropped every $, then a leading + (so +-7 was -7) */
    t = t.replace(/\$/g, "").replace(/^\+ ?/, "");
  }
  let r = parseSigned(t, c);
  if (r === "mixed") return no("mixed");
  if (r === "zero") return no(refuse ? "expression" : null);
  if (r === null && t.includes(" ")) {
    if (!off.has("N-space")) { if (SPACED.test(t)) return no("spaces"); }
    else r = parseSigned(t.replace(/ /g, ""), c);
    if (r === "mixed" || r === "zero") r = null;
  }
  if (!isParsed(r)) return no(refuse ? "expression" : null);
  const read = (r.neg ? "-" : "") + r.body;
  return { ok: true, value: r.value, float: r.float, shape: r.shape, places: r.places, notes: r.notes, read, show: r.shape === "mixed" };
}

const vulgar = (text: unknown, off: ReadonlySet<RuleId>) => !off.has("N-unicode") && /[½¼¾⅓⅔]/.test(String(text));

/** One number in a number or fraction box, or a key of those types */
export function readNumber(text: unknown, o: ReadOptions): NumberReading | Refusal {
  const off = o.off || NONE, r = readOne(cleanNumber(text, off), { commas: true, off, q4: o.q4 });
  return r.ok && !r.show && vulgar(text, off) ? { ...r, show: true } : r;
}

/* "[sign] int and int/int", a member on its own: one mixed number or two members */
const AND_MIXED_MEMBER = /(^|[,;] ?| or )[+-]? ?\d+ and \d+ ?\/ ?\d+( ?[,;]| or | and |$)/;
const SPACE_MIXED = /^[+-]? ?\d+ \d+ ?\/ ?\d+$/;

/** A set box, or a key of that type: its members in typed order */
export function readList(text: unknown, o: ReadOptions): ListReading | Refusal {
  const off = o.off || NONE, refuse = !off.has("N-refuse"), c: Ctx = { commas: false, off, q4: o.q4 };
  let t = cleanNumber(text, off);
  if (t === "") return no("empty");
  if (refuse && t.length > 200) return no("too-long");
  if (!off.has("N-dot") && t !== "." && / ?\.$/.test(t)) t = t.replace(/ ?\.$/, "");
  if (/^\{.*\}$/.test(t)) t = t.slice(1, -1).trim();
  else if (refuse && /^[([].*[)\]]$/.test(t) && /[,;]| or | and /.test(t)) return no("brackets");
  const sep = off.has("L-sep") ? / ?[,;] ?/ : / ?[,;] ?| or | and /;
  const membersIn = (s: string) => s.split(sep).filter((x) => x.trim() !== "").length;
  const spoken = off.has("L-mixed") ? null : AND_MIXED_MEMBER.exec(t);
  if (spoken) return no("mixed-in-set", membersIn(t.slice(0, spoken.index + spoken[1].length)));
  const parts = t.split(sep).map((x) => x.trim()).filter((x) => x !== "");
  const members: NumberReading[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i], pm = off.has("L-pm") ? null : /^(?:±|\+-|\+\/-) ?(.*)$/.exec(p);
    if (!pm && !off.has("L-zero") && /^[+-]? ?0\d/.test(p)) return no("list-comma", i);
    if (!pm && !off.has("L-mixed") && SPACE_MIXED.test(p)) return no("mixed-in-set", i);
    const r = readOne(pm ? pm[1] : p, c);
    if (!r.ok) return no(r.reason, i);
    members.push(r);
    if (pm) members.push({ ...r, value: make(-r.value.n, r.value.d), float: -r.float, read: r.read.startsWith("-") ? r.read.slice(1) : "-" + r.read });
  }
  if (!members.length) return no("empty");
  return { ok: true, members, read: members.map((x) => x.read).join(", "), show: members.some((x) => x.show) || vulgar(text, off) };
}

/** A point, or null when the text is not one: k >= 2 coordinates that each read as a
    number with no thousands commas, none led by 0 and a digit ((1,000) is not (1,0)), in an
    optional (...), [...] or <...>, labeled all or none with x, y (and z), each label once;
    at most 200 characters. The same rule says whether a key is a point. */
export function readTuple(text: unknown, o: ReadOptions): TupleReading | null {
  const off = o.off || NONE, c: Ctx = { commas: false, off, q4: o.q4 };
  let t = cleanNumber(text, off), notation = false;
  if (t.length > 200) return null;
  /* not N-dot's: the old exact compare, which a point key's text compare still is, already
     dropped a trailing full stop */
  t = t.replace(/ ?\.$/, "");
  if (/^\(.*\)$/.test(t)) t = t.slice(1, -1).trim();
  else if (/^\[.*\]$|^<.*>$/.test(t)) { t = t.slice(1, -1).trim(); notation = true; }
  const parts = t.split(/ ?, ?/);
  if (parts.length < 2) return null;
  const names = parts.length === 2 ? ["x", "y"] : parts.length === 3 ? ["x", "y", "z"] : [];
  const labels: string[] = [], values: NumberReading[] = [];
  for (let p of parts) {
    const m = /^([a-z]) ?= ?(.*)$/.exec(p);
    if (m) { labels.push(m[1]); p = m[2]; }
    if (!off.has("T-zero") && /^[+-]? ?0\d/.test(p)) return null;
    const r = readOne(p, c);
    if (!r.ok) return null;
    values.push(r);
  }
  const labeled = labels.length > 0;
  if (labeled && (labels.length !== parts.length || new Set(labels).size !== labels.length || labels.some((l) => !names.includes(l)))) return null;
  const ordered = labeled ? names.slice(0, parts.length).map((n) => values[labels.indexOf(n)]) : values;
  return { values: ordered, notation: notation || labeled, labeled, read: "(" + ordered.map((x) => x.read).join(", ") + ")",
    show: labeled || ordered.some((x) => x.show) || vulgar(text, off) };
}
