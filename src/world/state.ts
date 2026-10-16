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
  /** null when done or when calm; a chapter whose page was never opened has no total yet and still has its boss, whole; hollow = pct */
  boss: { solid: Solid; hollow: number } | null;
  /** this chapter's due section refs, most overdue first (input order) */
  due: { arena: string[]; page: string[] };
  mastery: { strong: number; building: number; weak: number; none: number };
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const chapterOf = (ref: string): string => ref.split("#")[0];

/* The memo keeps one entry per island set (the map's islands and the list's chapters are two sets),
   so the two callers on one page never evict each other. Its key: every field the result depends on, in a fixed order, as JSON
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

const memo = new Map<string, { key: string; out: IsleState[] }>();

export function hubState(input: HubInput): IsleState[] {
  const key = keyOf(input);
  const setKey = input.isles.map((s) => s.id).join();
  const hit = memo.get(setKey);
  if (hit && hit.key === key) return hit.out;
  const out = input.isles.map((isle) => {
    /* these three rules moved here from assets/map3d.js refresh() */
    const c = input.counts[isle.id] || { solved: 0, total: 0 };
    const total = c.total || 0, solved = Math.min(c.solved || 0, total);
    const done = total > 0 && solved >= total;
    const pct = clamp(total ? solved / total : 0, 0, 1);
    const stars = clamp(input.medals[isle.id] || 1, 1, 3);
    const solid = input.solids[isle.part];
    const boss = !done && !input.calm && solid ? Object.freeze({ solid, hollow: pct }) : null;
    const mastery = { strong: 0, building: 0, weak: 0, none: 0 };
    for (const ref of isle.sections) mastery[input.bands[ref] || "none"]++;
    return Object.freeze({
      pct, done, stars, boss,
      due: Object.freeze({
        arena: Object.freeze(input.due.arena.map((d) => d.id).filter((r) => chapterOf(r) === isle.id)) as string[],
        page: Object.freeze(input.due.page.map((d) => d.id).filter((r) => chapterOf(r) === isle.id)) as string[]
      }),
      mastery: Object.freeze(mastery)
    });
  });
  Object.freeze(out);
  if (!hit && memo.size >= 8) memo.clear();
  memo.set(setKey, { key, out });
  return out;
}
