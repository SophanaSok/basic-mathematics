/* The expr string rules of the typed grader (decision 0002, docs/decisions/0002-typed-grader.md):
   an algebra answer and its key are each turned into one string by the steps below, in this
   order, and are the same answer when the strings are equal. check.ts sends expr's text
   compare here, and exact's (any type that is not number, fraction or set), which takes
   E-mixed only.

     1  E-mixed    a digit run, whitespace, then int/int (1 1/6, 1 1 / 6) keeps a mark, so a
                   mixed number never equals a key; runs before basicClean, and in exact too
                   (off: the space is deleted, so 1 1/2 is 11/2)
     2  -          basicClean (legacy.ts)
     3  E-star (a) · (U+00B7) is * (off: kept)
     4  -          normExpr's LaTeX steps ($, \left, \cdot, \frac, \sqrt, braces)
     5  E-pow (a)  ** is ^, before step 8 drops a * (off: kept, so step 8 makes x**2 x*2)
     6  E-dot      one trailing . is dropped (off: kept)
     7  E-abs      |e| is abs(e) (off: kept)
     8  E-star (b) a * is dropped unless a digit, ., + or - follows, so 6*4 is not 64 (off:
                   every * dropped)
     9  E-pow (b)  ^(n) is ^n for an integer n, unless a digit or . follows the ) (x^(2)3 is
                   not x^23) (off: kept)
    10  E-plusneg  +(-t) is -t for one term t (letters, digits, ., ^), unless ^, a digit or .
                   follows the ) (x+(-2)3 is x-6, not x-23); +- is - (off: kept)
    11  E-paren    an outer (...) is stripped while its two brackets match each other (off: one
                   outer ( and ) are stripped, matched or not, so (1/2)sqrt(2) lost both)
    12  E-terms    the signed terms of a sum, split on + and - at depth 0 but not after ^ ( / *
                   or a sign, are sorted at every depth, and left alone when the text has a
                   relation (< > = !), a comma or unbalanced brackets (off: a sum with no brackets at all is split
                   on + and sorted, across a relation or a comma too)

   Every rule is a switch: a rule in `off` does what the old grader did, so with every E- rule
   off norm() is legacy.ts normExpr() and exactText() is the old exact compare's cleaning
   (expr.test.ts holds both on every golden key and answer).

   Pure: no `window`, no DOM, no state. */

import { basicClean } from "./legacy.ts";
import type { RuleId } from "./types.ts";

const NONE: ReadonlySet<RuleId> = new Set();

/** What E-mixed puts between a mixed number's whole part and its fraction: not whitespace,
    so basicClean keeps it, and no key holds it */
export const MIXED_MARK = "␣";

/* step 1: 1 1/2 keeps a mark where its space was */
const markMixed = (s: string, off: ReadonlySet<RuleId>) =>
  (off.has("E-mixed") ? s : s.replace(/(\d)\s+(?=\d+\s*\/\s*\d)/g, "$1" + MIXED_MARK));

/* the index of the ) that closes the ( at i, or -1 */
function closing(s: string, i: number): number {
  for (let j = i, depth = 0; j < s.length; j++) {
    if (s[j] === "(") depth++;
    else if (s[j] === ")" && --depth === 0) return j;
  }
  return -1;
}

/* whether every ( closes and no ) comes before its ( */
function balanced(s: string): boolean {
  let depth = 0;
  for (const c of s) if ((depth += c === "(" ? 1 : c === ")" ? -1 : 0) < 0) return false;
  return depth === 0;
}

/* step 12: the signed terms of a sum sorted, inside every bracket too. A + or - starts a
   term unless it leads the text or follows ^ ( / * or a sign; an unclosed ( keeps the rest
   as it is */
function sortTerms(s: string): string {
  const terms: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(") {
      const j = closing(s, i);
      if (j < 0) { cur += s.slice(i); break; }
      cur += "(" + sortTerms(s.slice(i + 1, j)) + ")";
      i = j;
    } else if ((c === "+" || c === "-") && cur !== "" && !/[\^(\/*+-]$/.test(cur)) {
      terms.push(cur);
      cur = c;
    } else cur += c;
  }
  terms.push(cur);
  return terms.map((t) => (t[0] === "+" || t[0] === "-" ? t : "+" + t)).sort().join("").replace(/^\+/, "");
}

/** An algebra answer as one string, with the rules in `off` doing what the old grader did:
    two answers are the same when their strings are equal */
export function norm(s: unknown, off: ReadonlySet<RuleId> = NONE): string {
  let t = basicClean(markMixed(String(s), off));
  if (!off.has("E-star")) t = t.replace(/·/g, "*");
  t = t
    .replace(/\$/g, "")
    .replace(/\\left|\\right|\\,|\\!|\\;/g, "")
    .replace(/\\cdot|\\times/g, "*")
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^{}]*)\}/g, "sqrt($1)")
    .replace(/\\sqrt/g, "sqrt")
    .replace(/\{|\}/g, "");
  if (!off.has("E-pow")) t = t.replace(/\*\*/g, "^");
  if (!off.has("E-dot")) t = t.replace(/\.$/, "");
  if (!off.has("E-abs")) t = t.replace(/\|([^|]+)\|/g, "abs($1)");
  t = t.replace(off.has("E-star") ? /\*/g : /\*(?![\d.+-])/g, "");
  if (!off.has("E-pow")) t = t.replace(/\^\((-?\d+)\)(?![\d.])/g, "^$1");
  if (!off.has("E-plusneg")) t = t.replace(/\+\(-([a-z\d.^]+)\)(?![\^\d.])/g, "-$1").replace(/\+-/g, "-");
  if (off.has("E-paren")) t = t.replace(/^\((.*)\)$/, "$1");
  else while (t[0] === "(" && closing(t, 0) === t.length - 1) t = t.slice(1, -1);
  if (off.has("E-terms")) {
    /* a plain sum may be written in any order, when there are no brackets to split through */
    if (t.indexOf("+") > 0 && t.indexOf("(") === -1 && t.indexOf(")") === -1) t = t.split("+").sort().join("+");
  } else if (!/[<>=!,]/.test(t) && balanced(t)) t = sortTerms(t);
  return t;
}

/** An exact answer as the forgiving text compare reads it: basicClean, one trailing . dropped,
    and a mixed number marked (E-mixed) */
export function exactText(s: unknown, off: ReadonlySet<RuleId> = NONE): string {
  return basicClean(markMixed(String(s), off)).replace(/\.$/, "");
}

/** Whether `given` and one key alternative are the same text answer: by norm() for expr, by
    exactText() for exact and any other type */
export function sameText(given: unknown, key: unknown, type: string, off: ReadonlySet<RuleId> = NONE): boolean {
  return type === "expr" ? norm(given, off) === norm(key, off) : exactText(given, off) === exactText(key, off);
}
