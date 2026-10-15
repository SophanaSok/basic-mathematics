/* Authored notes for wrong answers (`<ul class="ex-miss" hidden><li data-given="-4">…</li></ul>`),
   matched against what the learner typed. Pure: the caller hands in the exercise's own
   comparator (BMSite.matches) and reads the note's markup itself. Nothing is stored. */

export interface MissItem { given: string; blank?: number | null }
export type Matches = (given: string, answer: string, type: string, tol: number) => boolean;
export interface MissInput {
  given: string | readonly string[];
  kind: string;
  type: string;
  blanks?: readonly { type: string | null }[];
}

export const MAX_MISSES = 4;

/** The usable notes of an exercise, in order: a damaged one (no string `given`) is dropped,
    and only the first four are kept. */
export function parseMisses(items: readonly { given?: unknown; blank?: unknown }[]): MissItem[] {
  const out: MissItem[] = [];
  if (!items || typeof (items as any).length !== "number") return out;
  for (let i = 0; i < items.length && out.length < MAX_MISSES; i++) {
    const it = items[i];
    if (!it || typeof it.given !== "string" || it.given.trim() === "") continue;
    const b = Number(it.blank);
    out.push({ given: it.given, blank: it.blank != null && it.blank !== "" && Number.isInteger(b) && b >= 1 ? b : null });
  }
  return out;
}

function numberSet(s: string): string[] | null {
  const parts = s.split(",").map((x) => x.trim());
  if (parts.some((x) => x === "")) return null;
  return Array.from(new Set(parts)).sort();
}

/** The index of the first note that answers `input`, or null. Never throws. */
export function matchMiss(input: MissInput, items: readonly MissItem[], matches: Matches): number | null {
  try {
    if (!input || !items) return null;
    const kind = String(input.kind);
    if (kind === "order" || kind === "figure") return null;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it || typeof it.given !== "string") continue;
      let hit = false;
      if (kind === "blank") {
        const k = Number(it.blank);
        if (!Array.isArray(input.given) || !Number.isInteger(k) || k < 1) continue;
        const got = input.given[k - 1];
        /* an untyped blank (null) is "exact", as check.ts judge() takes a spec with no type */
        const bt = (input.blanks && input.blanks[k - 1] ? input.blanks[k - 1].type : input.type) || "exact";
        hit = typeof got === "string" && got.trim() !== "" && matches(got, it.given, String(bt), 0);
      } else if (kind === "choice") {
        hit = typeof input.given === "string" && input.given.trim() === it.given.trim();
      } else if (kind === "multi") {
        const a = typeof input.given === "string" ? numberSet(input.given) : null;
        const b = numberSet(it.given);
        hit = !!a && !!b && a.join(",") === b.join(",");
      } else {
        hit = typeof input.given === "string" && input.given.trim() !== "" && matches(input.given, it.given, String(input.type), 0);
      }
      if (hit) return i;
    }
  } catch (e) { /* damaged input: no note */ }
  return null;
}
