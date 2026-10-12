/* A form is unlocked: recorded once, said once.

   Installed on every page (the entries import it after assets/game.js; it does nothing
   without window.BMGame and window.BMStore). When the XP reaches a stage past the first
   that the form store has no record of, `settleForms` writes form.got["<n>"] = now (never over an earlier time,
   every other field of the store kept) and tells the bus {type: "form", highest, worn,
   fresh}. Then the announce-once, as game.js does for a level, over run.seen.form:
     - the first load, a sync and a reset take in what is already true quietly;
     - a stage reached while the page is open gives one toast naming the highest stage
       (when several came at once, still one) and one polite-high announcement. The progress
       page has no toast: the evolution moment there (src/ui/forms.ts, run.seen.evolved) is
       the announcement.
   window.BMFormUnlock is a test handle. */

import { fresh, highest, worn, stageOf } from "../core/forms.ts";

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

/** `quiet`: take everything in without a toast (and, past the first load, count the
    evolution moment as played); `first`: the install call, which leaves a played-count that
    is already a number alone, so a pending evolution is still there for the progress page */
export function settleForms(quiet?: boolean, first?: boolean): void {
  const G = window.BMGame, S = window.BMStore;
  if (!G || !S) return;
  let form: unknown, xp = 0;
  try { form = G.game().form; xp = Number(G.info().xp) || 0; } catch { return; }
  const hi = highest(form, xp);
  /* stage 1 is the start and needs no record: nothing is written until a stage is reached,
     so a first visit leaves the game store as it found it */
  const fr = fresh(form, xp).filter((n) => n > 1);
  if (fr.length) {
    const raw = S.read(S.keys.game, {});
    const game: Record<string, unknown> = isObj(raw) ? raw : {};
    const old: Record<string, unknown> = isObj(game.form) ? game.form : {};
    const got: Record<string, unknown> = isObj(old.got) ? { ...old.got } : {};
    const t = Date.now();
    for (const n of fr) {
      const k = String(n);
      if (!(typeof got[k] === "number" && isFinite(got[k] as number) && (got[k] as number) > 0)) got[k] = t;
    }
    game.form = { ...old, got };
    S.write(S.keys.game, game);
    S.emit({ type: "form", highest: hi, worn: worn(game.form, xp), fresh: fr, quiet: !!quiet });
  }
  const seen = G.run().seen as { form?: unknown; evolved?: unknown };
  const behind = typeof seen.form === "number" && hi < seen.form;
  if (typeof seen.form !== "number" || quiet || behind) {
    const setEvolved = typeof seen.evolved !== "number" || (quiet && !first);
    if (seen.form !== hi || setEvolved) {
      G.updateRun((r: { seen: Record<string, unknown> }) => {
        r.seen.form = hi;
        if (setEvolved) r.seen.evolved = hi;
      });
    }
    return;
  }
  if (hi > (seen.form as number)) {
    G.updateRun((r: { seen: Record<string, unknown> }) => { r.seen.form = hi; });
    if (document.querySelector("[data-form]")) return;
    const name = stageOf(hi).name;
    if (typeof window.BMToast === "function") {
      window.BMToast('<span class="toast-kicker">New form</span> <b>' + esc(name) +
        '</b> <span class="toast-text">See it on your progress page.</span>', "form");
    }
    try { G.announce("New form unlocked: " + name + ". See it on your progress page.", { priority: "high" }); } catch { /* a note */ }
  }
}

let pending = 0;
function later(): void {
  if (pending) return;
  pending = window.setTimeout(() => { pending = 0; settleForms(false); }, 0);
}

if (typeof window !== "undefined" && typeof document !== "undefined" && window.BMGame && window.BMStore) {
  window.BMFormUnlock = { settle: settleForms };
  settleForms(true, true);
  window.BMStore.on((c: { type?: string }) => {
    if (!c) return;
    if (c.type === "xp" || c.type === "level") later();
    else if (c.type === "sync" || c.type === "reset") settleForms(true);
  });
}
