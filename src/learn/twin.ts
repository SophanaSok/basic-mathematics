/* The near-transfer twin's rules, with no DOM in them: what the first right twin check
   pays, when it is paid, and which generated problem a card gets. The panel (src/ui/twin.ts)
   does the rest.

   A twin is offered while the solution or the faded view is open. It pays the difference
   between the solved rate and the rate the help already took (3 after the solution, 2 after
   the faded view; inline 2 and 1), once per exercise, and the `twin` field on the attempt
   record says it was paid. So original + twin never out-earns miss-then-solve
   (tools/game/rules.test.js, action `t`). A twin never touches the combo, hearts, medal,
   boxes, progress or the event log. */
import { XP, fadedOf } from "../core/rules.ts";

export const TWIN_SEED_PREFIX = "twin:";
/** how many generated problems are tried before the card says none is available */
export const TWIN_MAX_SKIPS = 5;

/** Paid once the field is there, whatever it holds: a damaged `twin: null` that a merge
    carries still counts as paid (the lower-paying direction). */
export function twinPaid(rec: unknown): boolean {
  return !!rec && typeof rec === "object" && Object.prototype.hasOwnProperty.call(rec, "twin");
}

/** What the first right twin check pays on this record: 0 with no help taken, or once paid. */
export function twinXp(rec: unknown, inline: boolean): number {
  const r = rec as any;
  if (!r || typeof r !== "object" || twinPaid(r)) return 0;
  const opened = !!r.opened;
  if (!opened && !fadedOf(r)) return 0;
  const solved = inline ? XP.inline : XP.solved;
  const assisted = opened ? (inline ? XP.inlineOpened : XP.opened) : (inline ? XP.inlineFaded : XP.faded);
  return Math.max(0, solved - assisted);
}

/** The seed's text for the n-th twin of one exercise; the page hashes it (BMGen.hash), so a
    reload gives the same first twin. */
export function seedFor(chapter: string, key: string, n: number): string {
  return TWIN_SEED_PREFIX + chapter + "/" + key + ":" + n;
}

export interface TwinSource { kind: "template" | "generator" | "none"; section?: string }

/** candidates[seed % length] first, then the next ones in order, at most TWIN_MAX_SKIPS
    tries; null when none verifies (or there are none). */
export function pickProblem<P>(candidates: readonly P[], seed: number, verify: (p: P) => boolean): P | null {
  const n = candidates ? candidates.length : 0;
  if (!n) return null;
  const start = ((Math.floor(Number(seed)) % n) + n) % n || 0;
  for (let i = 0; i < Math.min(n, TWIN_MAX_SKIPS); i++) {
    const p = candidates[(start + i) % n];
    let ok = false;
    try { ok = !!verify(p); } catch { ok = false; }
    if (ok) return p;
  }
  return null;
}
