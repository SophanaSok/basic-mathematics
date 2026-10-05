/* Generic questions for a wrong answer, from the shape of the answer itself.

   Each detector turns the learner's wrong answer into one or more candidates by a common
   slip run backwards (the sign flipped, the fraction upside down, a factor of two, the
   decimal point moved, a member of a set left out, a fraction not reduced where the key
   wants it reduced) and asks the site's own grading whether a candidate is right. A
   detector fires only when one is: then the slip is a likely story, and the card asks
   about it. Grading is not reimplemented here; the caller passes it in (`grade`, which
   assets/site.js builds from the exercise's own key, type and tolerance), so a detector
   can never disagree with the Check button.

   What the learner sees is the question only: always a question, never a statement, and
   never the answer or anything that grades as it (the questions carry no digits; the
   Vitest test grades every run of their words against every key in the course). The
   candidates stay in this function. Matching happens in the browser, like all grading,
   so a typed answer never leaves the device.

   No DOM and no `window` here: Node and Vitest load this file as it is. */

export type DetectorId = "unreduced" | "missing" | "missing-option" | "sign" | "reciprocal" | "double" | "decimal";

export const QUESTIONS: Readonly<Record<DetectorId, string>> = {
  unreduced: "Can that fraction be simplified any further?",
  missing: "Is that every value that works, or could one be missing?",
  "missing-option": "Does another option apply as well?",
  sign: "Check the sign of your last step?",
  reciprocal: "Could the fraction be upside down, with top and bottom swapped?",
  double: "Did a factor of two slip in or out along the way?",
  decimal: "Is the decimal point in the right place?"
};

/** The order detectors are tried in: the first that fires is the one asked about. The
    narrow ones (a fraction not reduced, a member left out) come before the broad ones. */
export const ORDER: readonly DetectorId[] = ["unreduced", "missing", "missing-option", "sign", "reciprocal", "double", "decimal"];

export interface DetectInput {
  /** what was typed into the box (or one blank), or the ticked options as "1,3" */
  given: string;
  /** "text" for a typed answer or one blank; "multi" for tick-every-option */
  kind: "text" | "multi";
  /** the exercise's data-type (number, fraction, set, expr, exact), or a blank's own */
  type: string;
  /** the accepted answers: data-answer split on "|" (assets/site.js alternatives()) */
  answers: readonly string[];
  /** the site's own grading of a candidate against this exercise's key */
  grade: (candidate: string) => boolean;
}

export interface Detection {
  id: DetectorId;
  question: string;
}

/* ------------------------------------------------------------ numbers ---- */

const DASHES = /[−–—]/g;
function tidy(s: string): string {
  return String(s).replace(DASHES, "-").trim();
}

/** a plain decimal or a fraction a/b, as a number; null for anything else */
function numberOf(raw: string): number | null {
  const t = tidy(raw).replace(/\s+/g, "").replace(/^\+/, "");
  const frac = /^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(t);
  if (frac) {
    const den = parseFloat(frac[2]);
    return den === 0 ? null : parseFloat(frac[1]) / den;
  }
  return /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(t) ? parseFloat(t) : null;
}

/** a number written back as text without float noise: 0.30000000000000004 -> "0.3" */
function write(x: number): string {
  if (!isFinite(x)) return "";
  if (Number.isInteger(x)) return String(x);
  return String(parseFloat(x.toPrecision(12)));
}

function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = b; b = a % b; a = t; }
  return a;
}

/** Every number written in `s`, with the sign written before it (if any) and where it
    sits, so a candidate can change one of them and leave the rest of the text alone. */
interface Token { start: number; end: number; sign: string; digits: string }
function tokens(s: string): Token[] {
  const out: Token[] = [];
  const re = /([+-]?)(\d+(?:\.\d+)?|\.\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push({ start: m.index, end: m.index + m[0].length, sign: m[1], digits: m[2] });
  return out;
}
function splice(s: string, t: Token, text: string): string {
  return s.slice(0, t.start) + text + s.slice(t.end);
}
/** a token's number rewritten as `x`, keeping a "+" operator in front of it a "+" */
function rewrite(t: Token, x: number): string {
  const body = write(x);
  if (!body) return "";
  if (t.sign === "+" && x >= 0) return "+" + body;
  return body;
}

/* --------------------------------------------------------- candidates ---- */

/** The answers each detector would call right if the slip it looks for were undone.
    Exported for the tests; the page only needs detect(). */
export function candidates(id: DetectorId, input: DetectInput): string[] {
  const given = tidy(input.given);
  if (!given) return [];
  if (input.kind === "multi") return id === "missing-option" ? completions(given, input.answers) : [];
  if (id === "missing-option") return [];
  const toks = tokens(given);
  const whole = numberOf(given);
  const out: string[] = [];
  const each = (fn: (t: Token, v: number) => number[]) => {
    toks.forEach((t) => {
      const v = parseFloat(t.sign === "-" ? "-" + t.digits : t.digits);
      fn(t, v).forEach((x) => { const r = rewrite(t, x); if (r) out.push(splice(given, t, r)); });
    });
  };
  switch (id) {
    case "unreduced": {
      const re = /(-?\d+)\/(-?\d+)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(given))) {
        const a = parseInt(m[1], 10), b = parseInt(m[2], 10), g = gcd(a, b);
        if (b === 0 || g <= 1) continue;
        const low = b / g === 1 ? String(a / g) : (a / g) + "/" + (b / g);
        out.push(given.slice(0, m.index) + low + given.slice(m.index + m[0].length));
      }
      break;
    }
    case "missing":
      if (input.type === "set") out.push(...completions(given, input.answers));
      break;
    case "sign":
      toks.forEach((t) => {
        const flipped = t.sign === "-" ? (t.start === 0 || /[(,;{\s=]/.test(given[t.start - 1]) ? "" : "+") : "-";
        out.push(splice(given, t, flipped + t.digits));
      });
      break;
    case "reciprocal": {
      const re = /(-?)(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(given))) out.push(given.slice(0, m.index) + m[1] + m[3] + "/" + m[2] + given.slice(m.index + m[0].length));
      if (whole !== null && whole !== 0) out.push(write(1 / whole));
      break;
    }
    case "double":
      if (whole !== null) out.push(write(whole * 2), write(whole / 2));
      each((_t, v) => [v * 2, v / 2]);
      break;
    case "decimal": {
      const shifts = [10, 100, 1000, 0.1, 0.01, 0.001];
      if (whole !== null) shifts.forEach((k) => out.push(write(whole * k)));
      each((_t, v) => shifts.map((k) => v * k));
      break;
    }
  }
  return unique(out.filter((c) => c && c !== given));
}

function unique(list: string[]): string[] {
  return list.filter((c, i) => list.indexOf(c) === i);
}

/** members of a list answer: "2, -1/2" -> ["2", "-1/2"] */
function members(s: string): string[] {
  return tidy(s).replace(/[{}\s]/g, "").split(/[,;]/).filter((x) => x !== "");
}
function sameMember(a: string, b: string): boolean {
  const x = numberOf(a), y = numberOf(b);
  if (x !== null && y !== null) return Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
  return a.toLowerCase() === b.toLowerCase();
}
/** Each accepted answer of which the given list is a strict part, every member given
    matched to a different member of the key: the given list completed. */
function completions(given: string, answers: readonly string[]): string[] {
  const got = members(given);
  if (!got.length) return [];
  const out: string[] = [];
  answers.forEach((ans) => {
    const want = members(ans);
    if (want.length <= got.length) return;
    const left = want.slice();
    const all = got.every((g) => {
      const i = left.findIndex((w) => sameMember(g, w));
      if (i < 0) return false;
      left.splice(i, 1);
      return true;
    });
    if (all) out.push(ans);
  });
  return out;
}

/* ------------------------------------------------------------- detect ---- */

/** The question for this wrong answer, or null when no detector's candidate grades
    right. A grading function that throws counts as "not right". */
export function detect(input: DetectInput): Detection | null {
  if (!input || typeof input.grade !== "function") return null;
  if (input.kind !== "text" && input.kind !== "multi") return null;
  for (const id of ORDER) {
    const hit = candidates(id, input).some((c) => {
      try { return !!input.grade(c); } catch { return false; }
    });
    if (hit) return { id, question: QUESTIONS[id] };
  }
  return null;
}
