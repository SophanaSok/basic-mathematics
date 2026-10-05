// @ts-check
/* The level curve and the ranks: the one copy, used by the HUD before first paint and by
   the game after it. This file is a plain ES module with no imports of its own and no
   effect when it is loaded, but it is not bundled: tools/lib/shell.js puts its text into
   every page inline, inside the HUD script that runs straight after the top bar
   (hudScript()), and that script hands these functions to the page as window.BMHud,
   where assets/game.js finds them. So it is written to run as it stands in a browser:
   no TypeScript syntax (the types are JSDoc, checked by `npm run typecheck`), no
   `export` but `export function` and `export const` (the shell takes the word off), no
   closing script tag. */

/** threshold(L) = 5(L − 1)(L + 3): 0, 25, 60, 105, 160 … the XP at which level L starts,
    so each level asks a little more than the last.
    @param {number} L */
export function threshold(L) {
  L = Math.max(1, Math.floor(L));
  return 5 * (L - 1) * (L + 3);
}

/** The level of a total XP. Inverting threshold gives the closed form; the loops mop up
    rounding.
    @param {unknown} xp */
export function level(xp) {
  let n = Number(xp);
  n = Math.max(0, Math.floor(isFinite(n) ? n : 0));
  let L = Math.max(1, Math.floor(Math.sqrt(n / 5 + 4)) - 1);
  while (threshold(L + 1) <= n) L++;
  while (L > 1 && threshold(L) > n) L--;
  return L;
}

/** the rank a level carries, highest first */
export const RANKS = [[30, "Mathematician"], [25, "Prover"], [20, "Analyst"], [15, "Cartographer"],
  [10, "Geometer"], [6, "Solver"], [3, "Reckoner"], [1, "Counter"]];

/** @param {number} L */
export function rank(L) {
  for (let i = 0; i < RANKS.length; i++) if (L >= /** @type {number} */ (RANKS[i][0])) return /** @type {string} */ (RANKS[i][1]);
  return "Counter";
}

/** Everything the HUD and the progress page say about a total XP.
    @param {number} xp
    @returns {{ xp: number, level: number, rank: string, floor: number, next: number, into: number, span: number, pct: number }} */
export function levelInfo(xp) {
  const L = level(xp), floor = threshold(L), next = threshold(L + 1);
  return {
    xp: xp, level: L, rank: rank(L), floor: floor, next: next,
    into: xp - floor, span: next - floor,
    pct: Math.max(0, Math.min(100, Math.round(((xp - floor) / (next - floor)) * 100)))
  };
}
