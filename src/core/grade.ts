/* How a typed answer is graded against its key: the one copy, for assets/site.js (which
   reaches it through window.BMCore, src/ui/core.ts), the tools that grade (check-static's
   placeholder check, check-gen, smoke-scenes) and the tests.

   Moved from assets/site.js as it was; tools/fixtures/grade-golden.json is what the
   grader said before the move, and src/core/grade.test.ts holds grade() to it case by
   case. Pure: no `window`, no DOM. */

/** How a key is compared: "number" and "fraction" by value, "set" as a list of numbers in
    any order, "expr" as an expression with its cosmetic differences removed, anything
    else ("exact", or none) as forgiving text. */
export type KnownAnswerType = "number" | "fraction" | "set" | "expr" | "exact";
/** A known type, or any other string a page carries (graded as "exact"); `string & {}`
    keeps the known names from collapsing into plain `string`, so editors still offer them. */
export type AnswerType = KnownAnswerType | (string & {});

/* strip the noise readers add without changing meaning */
export function basicClean(s: unknown): string {
  return String(s)
    .trim()
    .replace(/\s+/g, "")
    .replace(/[−–—]/g, "-")   /* unicode minus / dashes */
    .replace(/[×⋅]/g, "*")          /* × · */
    .replace(/√/g, "sqrt")               /* √ */
    .replace(/π/g, "pi")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/≠/g, "!=")
    .toLowerCase();
}

/* a number, a fraction a/b, or a simple signed decimal -> JS number */
export function toNumber(s: unknown): number | null {
  var t = basicClean(s).replace(/\$/g, "").replace(/^\+/, "");
  if (t === "") return null;
  var frac = /^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(t);
  if (frac) {
    var den = parseFloat(frac[2]);
    if (den === 0) return null;
    return parseFloat(frac[1]) / den;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return parseFloat(t);
  if (/^-?\.\d+$/.test(t)) return parseFloat(t);
  return null;
}

/* tol, when given on the exercise as data-tol, is an absolute tolerance —
   used where the expected answer is itself a rounded decimal. */
export function sameNumber(a: number | null, b: number | null, tol?: number): boolean {
  if (a === null || b === null) return false;
  if (tol) return Math.abs(a - b) <= tol + 1e-12;
  var scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= 1e-9 * scale;
}

/* algebraic expression: compare after removing cosmetic differences */
export function normExpr(s: unknown): string {
  var t = basicClean(s)
    .replace(/\$/g, "")
    .replace(/\\left|\\right|\\,|\\!|\\;/g, "")
    .replace(/\\cdot|\\times/g, "*")
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^{}]*)\}/g, "sqrt($1)")
    .replace(/\\sqrt/g, "sqrt")
    .replace(/\{|\}/g, "")
    .replace(/\*/g, "")
    .replace(/^\((.*)\)$/, "$1");
  /* a plain sum may be written in any order: ac+bd and bd+ac are the same answer.
     Only safe when there are no brackets left to split through. */
  if (t.indexOf("+") > 0 && t.indexOf("(") === -1 && t.indexOf(")") === -1) {
    t = t.split("+").sort().join("+");
  }
  return t;
}

/* "2,-3" -> [-3, 2]; order never matters in a list of answers */
export function numberList(s: unknown): number[] | null {
  var parts = basicClean(s).replace(/[{}]/g, "").split(/[,;]/).filter(function (x) { return x !== ""; });
  var nums = parts.map(toNumber);
  if (!nums.length || nums.some(function (n) { return n === null; })) return null;
  return (nums as number[]).sort(function (a, b) { return a - b; });
}

export function matches(given: unknown, answer: unknown, type?: AnswerType | null, tol?: number): boolean {
  if (type === "number" || type === "fraction") {
    return sameNumber(toNumber(given), toNumber(answer), tol);
  }
  if (type === "set") {
    var ng = numberList(given), na = numberList(answer);
    if (!ng || !na || ng.length !== na.length) return false;
    return ng.every(function (v, i) { return sameNumber(v, na![i], tol); });
  }
  if (type === "expr") return normExpr(given) === normExpr(answer);
  /* "exact" / default: forgiving text compare */
  return basicClean(given).replace(/\.$/, "") === basicClean(answer).replace(/\.$/, "");
}

/* "|" separates alternative accepted answers — but an answer may itself contain
   a bar (|x|), so the unsplit string is always a candidate too. */
export function alternatives(raw: string | null | undefined): string[] {
  raw = (raw || "").trim();
  return [raw].concat(raw.split("|"))
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s !== ""; });
}

/* grade one answer against a key with `|` alternatives, exactly as the exercises do */
export function grade(given: unknown, answer: string | null | undefined, type?: AnswerType | null, tol?: number): boolean {
  return alternatives(answer).some(function (a) { return matches(given, a, type || "exact", tol || 0); });
}
