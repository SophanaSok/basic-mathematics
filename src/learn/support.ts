/* How much help to offer in a section, from the learner's own mastery bands (expertise reversal).

   The level only ever changes an offer (a line of text, a link); it never opens a rung and no
   reward reads it (R2 design §3.12). "No data" is never "novice": a section with no evidence of
   its own is judged by its prerequisites, and with none of those either it stays standard.

   Pure: no window, no document, no storage of any kind (tools/check-static.js `pure-core`). */

import type { Band } from "./bands.ts";

export type Support = "guided" | "standard" | "light";

export interface SupportResult {
  level: Support;
  /** what decided it: the section's own evidence, its prerequisites, or nothing (no evidence anywhere) */
  from: "own" | "requires" | "none";
  /** the prerequisite refs whose band is "weak", in `requires` order ([] unless from === "requires" and level === "guided") */
  weak: string[];
}

/** Own evidence first (weak guided, building standard, strong light); otherwise the evidenced
 *  prerequisites: any weak guides, all of them evidenced and strong lightens, else standard.
 *  `band` is called at most once per ref; duplicate prerequisites count once, and the section itself is never its own prerequisite. */
export function supportFor(sec: string, requires: readonly string[], band: (sec: string) => Band): SupportResult {
  const own = band(sec);
  if (own !== "none") return { level: own === "weak" ? "guided" : own === "strong" ? "light" : "standard", from: "own", weak: [] };
  const refs = Array.from(new Set(requires)).filter(r => r !== sec);
  const bands = refs.map(r => band(r));
  const evidenced = bands.filter(b => b !== "none");
  if (!evidenced.length) return { level: "standard", from: "none", weak: [] };
  const weak = refs.filter((_, i) => bands[i] === "weak");
  if (weak.length) return { level: "guided", from: "requires", weak };
  if (evidenced.length === refs.length && evidenced.every(b => b === "strong")) return { level: "light", from: "requires", weak: [] };
  return { level: "standard", from: "requires", weak: [] };
}
