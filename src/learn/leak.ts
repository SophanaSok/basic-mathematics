/* Answer-leak lint: does a help string (a clue, a miss note, a faded step) hand the learner
   the answer to the exercise it belongs to? The grader decides equivalence: every candidate
   a string offers is passed through `matches`, so "8/2" leaks 4 and "{-3, 2}" leaks "2,-3".
   What the question already says is not a leak (an exponent 2 in "x^2", a coefficient that
   is in the problem), so a candidate that also stands in the question's own text is dropped.

   Pure: no window, no document, no storage of any kind (tools/check-static.js `pure-core`).
   Never throws on odd input (empty strings, an unbalanced $). */

export interface LeakExercise {
  /** the key and its accepted alternatives, as strings */
  answers: readonly string[];
  /** data-type (exact by default) */
  type: string;
  kind: "text" | "choice" | "multi" | "order" | "blank" | "figure";
  tol: number | null;
  /** the text of the correct option(s), for choice and multi */
  options?: readonly string[];
  /** the question's text content, tags stripped */
  question: string;
}

export type Matches = (given: string, answer: string, type: string, tol: number | null) => boolean;

/** at is an index into the stripped text */
export interface Leak { token: string; at: number }

const MAX_WORDS = 12;

/** The text of a markup string: tags dropped (a tag's own text goes too), a few entities read. */
export function stripTags(html: string): string {
  return String(html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** The $...$ pieces of a text, without the dollars; `at` is where the inside starts. An
    unpaired $ at the end is ignored. */
export function mathSegments(text: string): { text: string; at: number }[] {
  const out: { text: string; at: number }[] = [];
  const s = String(text ?? "");
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf("$", i);
    if (open < 0) break;
    const close = s.indexOf("$", open + 1);
    if (close < 0) break;
    out.push({ text: s.slice(open + 1, close), at: open + 1 });
    i = close + 1;
  }
  return out;
}

/** The way normExpr (src/core/answer/legacy.ts) reads a formula, so \frac{8}{2} and 8/2 meet */
function norm(s: string): string {
  return String(s)
    .replace(/\\dfrac|\\tfrac/g, "\\frac")
    .replace(/\\left|\\right|\\,|\\!|\;/g, "")
    .replace(/\\cdot|\\times/g, "*")
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^{}]*)\}/g, "sqrt($1)")
    .replace(/\\sqrt/g, "sqrt")
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** a plain a/b or number out of a normalised piece, when the brackets only wrap numbers */
function plain(s: string): string {
  return s.replace(/^\((-?[\d.]+)\)\/\((-?[\d.]+)\)$/, "$1/$2").replace(/\s+/g, "");
}

function textKey(s: string): string {
  return norm(s.replace(/\$/g, "")).toLowerCase();
}

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/** does `needle` stand in `hay` as a whole word or number (not inside a longer one) */
function standsIn(needle: string, hay: string): boolean {
  const n = textKey(needle), h = textKey(hay);
  if (!n) return false;
  return new RegExp("(?<![\\w.])" + escapeRe(n) + "(?!\\w|\\.\\d)").test(h);
}

/* a minus may be the Unicode one (−) in prose; norm() reads it as - */
const NUMBER = "[-−–]?\\d+(?:\\.\\d+)?";
const FRAC_LATEX = "\\\\[dt]?frac\\{[^{}]*\\}\\{[^{}]*\\}";

function pushAll(out: { token: string; at: number }[], text: string, re: RegExp, base = 0): void {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[0] === "") { re.lastIndex++; continue; }
    out.push({ token: m[0], at: base + m.index });
  }
}

/** Every piece of a text that could be an answer: number and fraction literals, each whole
    math segment, each side of = \Rightarrow \to inside a segment, braced and comma lists,
    and (for exact types) the runs of words as long as an answer. */
export function candidates(text: string, ex: LeakExercise): { token: string; at: number }[] {
  const s = String(text ?? "");
  const out: { token: string; at: number }[] = [];
  pushAll(out, s, new RegExp(FRAC_LATEX, "g"));
  pushAll(out, s, new RegExp(NUMBER + "\\s*/\\s*" + NUMBER, "g"));
  pushAll(out, s, new RegExp(NUMBER, "g"));
  pushAll(out, s, new RegExp("\\\\?\\{[^{}]*\\\\?\\}", "g"));
  pushAll(out, s, new RegExp(NUMBER + "(?:\\s*[,;]\\s*" + NUMBER + ")+", "g"));
  mathSegments(s).forEach(seg => {
    const inner = seg.text.trim();
    if (inner) out.push({ token: inner, at: seg.at + seg.text.indexOf(inner) });
    const re = /\\Rightarrow|\\to\b|=/g;
    let from = 0, m: RegExpExecArray | null;
    const sides: { a: number; b: number }[] = [];
    while ((m = re.exec(seg.text))) { sides.push({ a: from, b: m.index }); from = m.index + m[0].length; }
    if (sides.length) sides.push({ a: from, b: seg.text.length });
    sides.forEach(p => {
      const piece = seg.text.slice(p.a, p.b), t = piece.trim();
      if (t) out.push({ token: t, at: seg.at + p.a + piece.indexOf(t) });
    });
  });
  if (ex.type === "exact" || ex.type === "" || !ex.type) {
    const words: { w: string; at: number }[] = [];
    const wre = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = wre.exec(s))) {
      const raw = m[0], lead = raw.length - raw.replace(/^[^\w$\\{(-]+/, "").length;
      const w = raw.replace(/^[^\w$\\{(-]+/, "").replace(/[^\w$})]+$/, "");
      if (w) words.push({ w, at: m.index + lead });
    }
    const sizes = new Set<number>();
    ex.answers.forEach(a => {
      const k = String(a).trim().split(/\s+/).filter(Boolean).length;
      if (k >= 1 && k <= MAX_WORDS) sizes.add(k);
    });
    sizes.forEach(k => {
      for (let i = 0; i + k <= words.length; i++) {
        out.push({ token: words.slice(i, i + k).map(x => x.w).join(" "), at: words[i].at });
      }
    });
  }
  return out;
}

/** What a help string gives away. A choice or multi exercise leaks when the text of a correct
    option stands in the string; any other when a candidate is judged right against an
    accepted answer by `matches` and is not already in the question. */
export function leaks(html: string, ex: LeakExercise, matches: Matches): Leak[] {
  const out: Leak[] = [];
  try {
    const text = stripTags(html);
    if (ex.kind === "choice" || ex.kind === "multi") {
      const lower = text.toLowerCase();
      (ex.options || []).forEach(o => {
        const t = String(o ?? "").trim();
        if (t && standsIn(t, text)) out.push({ token: t, at: Math.max(0, lower.indexOf(textKey(t))) });
      });
      return out;
    }
    const seen = new Set<string>();
    candidates(text, ex).forEach(c => {
      const id = c.at + "\u0000" + c.token;
      if (seen.has(id)) return;
      seen.add(id);
      if (standsIn(c.token, ex.question)) return;
      const forms = [c.token, plain(norm(c.token))];
      const hit = ex.answers.some(a => forms.some(f => {
        try { return f !== "" && matches(f, String(a), ex.type || "exact", ex.tol); } catch { return false; }
      }));
      if (hit) out.push({ token: c.token, at: c.at });
    });
  } catch {
    return out;
  }
  return out;
}
