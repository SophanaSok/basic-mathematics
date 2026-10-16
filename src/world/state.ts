/* What each hub island shows of the learner's state, as one pure function (no window, DOM,
   storage or Three.js). The map and the list read it; nothing here writes anything. */

export type Solid = "cube" | "tetra" | "octa" | "icosa";
export type Band = "none" | "weak" | "building" | "strong";

export interface HubInput {
  /** islands in layout order: chapter id and its Part id */
  isles: ReadonlyArray<{ id: string; part: string; sections: readonly string[] /* full refs "chNN#sec" */ }>;
  /** BMProgress.count per chapter */
  counts: Readonly<Record<string, { solved: number; total: number }>>;
  /** BMGame.medal(id, "practice"), 0..3 */
  medals: Readonly<Record<string, number>>;
  /** review.ts dueSplit output */
  due: { arena: ReadonlyArray<{ id: string }>; page: ReadonlyArray<{ id: string }> };
  /** BMEvents.bands() */
  bands: Readonly<Record<string, Band>>;
  /** BM_QUEST.regions[part].solid */
  solids: Readonly<Record<string, Solid>>;
  calm: boolean;
}

/** what the marks draw of an island: the part of the state that was there before the hub */
export interface IsleMark {
  /** solved fraction of the chapter's practice, 0..1 */
  pct: number;
  done: boolean;
  /** stars for a finished chapter, 1..3 */
  stars: number;
}

export interface IsleState extends IsleMark {
  /** null when done, when calm, or when the chapter has no problems; hollow = pct */
  boss: { solid: Solid; hollow: number } | null;
  /** this chapter's due section refs, most overdue first (input order) */
  due: { arena: string[]; page: string[] };
  mastery: { strong: number; building: number; weak: number; none: number };
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const chapterOf = (ref: string): string => ref.split("#")[0];

/* The one-entry memo's key: every field the result depends on, in a fixed order, as JSON
   (isles: id, part, sections; counts, medals and bands and solids: only the isles' own
   entries; due: the ids in order; calm). Equal key, same array back. */
function keyOf(inp: HubInput): string {
  return JSON.stringify([
    inp.isles.map((s) => {
      const c = inp.counts[s.id];
      return [s.id, s.part, s.sections, c ? [c.solved, c.total] : 0, inp.medals[s.id] || 0, inp.solids[s.part] || 0,
        s.sections.map((r) => inp.bands[r] || "none")];
    }),
    inp.due.arena.map((d) => d.id), inp.due.page.map((d) => d.id), inp.calm
  ]);
}

let lastKey = "";
let lastOut: IsleState[] | null = null;

export function hubState(input: HubInput): IsleState[] {
  const key = keyOf(input);
  if (lastOut && key === lastKey) return lastOut;
  const out = input.isles.map((isle) => {
    /* these three rules moved here from assets/map3d.js refresh() */
    const c = input.counts[isle.id] || { solved: 0, total: 0 };
    const total = c.total || 0, solved = Math.min(c.solved || 0, total);
    const done = total > 0 && solved >= total;
    const pct = clamp(total ? solved / total : 0, 0, 1);
    const stars = clamp(input.medals[isle.id] || 1, 1, 3);
    const solid = input.solids[isle.part];
    const boss = !done && !input.calm && total > 0 && solid ? { solid, hollow: pct } : null;
    const mastery = { strong: 0, building: 0, weak: 0, none: 0 };
    for (const ref of isle.sections) mastery[input.bands[ref] || "none"]++;
    return {
      pct, done, stars, boss,
      due: {
        arena: input.due.arena.map((d) => d.id).filter((r) => chapterOf(r) === isle.id),
        page: input.due.page.map((d) => d.id).filter((r) => chapterOf(r) === isle.id)
      },
      mastery
    };
  });
  lastKey = key; lastOut = out;
  return out;
}
