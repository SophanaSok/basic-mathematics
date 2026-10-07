/* What the learner is told about a typed answer that is not simply right or wrong: one
   US-English sentence or two per reason (types.ts UnreadReason, FormReason), plus the
   "We read that as ..." line and the lowest-terms note beside a right unreduced fraction.
   None of it names the key: an unread message depends on the reason alone, and a form
   message or note is built from what the learner typed (its `read`, read.ts).

   One message depends on the owner's answer to Q4 (types.ts Owner): under Q4(b) a mixed
   number is refused everywhere, so "2 and 1/3" is told to use a fraction only.

   Pure: no `window`, no DOM. */

import type { FormReason, Owner, UnreadReason } from "./types.ts";

const UNREAD: Record<Exclude<UnreadReason, "ambiguous-mixed">, string> = {
  "empty": "Type an answer, then press Check.",
  "too-long": "That is too long to read. Type a shorter answer.",
  "named": "Type just the number.",
  "words": "Type the number with digits, as a decimal or a fraction.",
  "expression": "Type a single number, as a decimal or a fraction.",
  "spaces": "Take out the spaces inside the number.",
  "list": "This box takes one number. Type just one.",
  "decimal-comma": "Use a decimal point, like 0.5. This box takes one number.",
  "list-comma": "Type each number without commas. In this box a comma goes between values.",
  "mixed-in-set": "Put a comma between values. Type a mixed number as a fraction, like 7/3.",
  "brackets": "Type just the values, with a comma between them.",
  "percent": "Type it as a fraction, like 3/4.",
  "units": "Type the number without units.",
  "symbol": "Type just the number, with no other symbols.",
  "plus-minus": "This box takes one number. Type just one.",
  "scientific": "Type it as a fraction, like 3/4.",
  "ratio": "Type it as a fraction, like 3/4.",
  "grid-chars": "Use only digits, a decimal point, a fraction bar (/) and a minus sign at the front.",
  "grid-length": "Use at most 5 characters, or 6 with a minus sign.",
  "grid-zeros": "Leave out the zeros in front, like the 0 in 07. A single 0 before the decimal point is fine.",
  "mixed": "Type it as a fraction, like 3/2, or as a decimal, like 1.5."
};

/** Why the answer could not be read, and what to type instead */
export function unreadMessage(reason: UnreadReason, q4: Owner["q4"]): string {
  if (reason === "ambiguous-mixed") {
    return q4 === "b" ? "Type it as a fraction, like 7/3."
      : "Type a mixed number with a space, like 2 1/3, or as a fraction, like 7/3.";
  }
  return UNREAD[reason];
}

/** Why the right value still does not count. `read` is the typed answer as the reader read
    it, which the notation message shows in the form a point takes: "(6, -2)". */
export function formMessage(reason: FormReason, read: string): string {
  switch (reason) {
    case "rounded": return "That is rounded. Give the exact value.";
    case "notation": return "Right values. Write it as " + read + ".";
    case "repeated": return "Right values. List each one once.";
    case "grid-width": return "Use every space: give more decimal places.";
    case "unreduced": return "Simplify the fraction.";
  }
}

/** The line shown when the reading changed the spelling in a way that matters (a mixed
    number, a ½-style character, a labeled point) */
export function readMessage(read: string): string {
  return "We read that as " + read + ".";
}

/** The note beside a right unreduced fraction: `read` as typed (6/4), `lowest` the same
    value in lowest terms (3/2) */
export function lowestMessage(read: string, lowest: string): string {
  return read + " is " + lowest + " in lowest terms.";
}
