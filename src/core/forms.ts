/* Which form the learner's avatar has reached and which it wears: the pure logic over
   src/data/forms.ts and the level curve. The game script and the progress page read it.
   The `form` argument is the raw form value of the game store, which may be missing or
   damaged, so nothing here trusts its shape and nothing throws. Pure: no page globals, no
   storage. A stage once recorded is never lost, even if the thresholds move later. */

import { FORMS, LAST_FORM } from "../data/forms.ts";
import type { FormStage } from "../data/forms.ts";
import { level, threshold } from "../hud/levels.js";

function num(v: unknown): number {
  const n = Number(v);
  return typeof v === "number" || typeof v === "string" ? (isFinite(n) ? n : 0) : 0;
}

/** the highest stage whose level is at most L; 1 for anything below, damaged or non-finite */
export function stageForLevel(L: number): number {
  if (typeof L !== "number" || !isFinite(L)) return 1;
  let n = 1;
  for (const f of FORMS) if (f.level <= L) n = f.n;
  return n;
}

/** the FORMS entry for a stage number, clamped to 1..LAST_FORM; non-numbers give stage 1 */
export function stageOf(n: unknown): FormStage {
  const v = typeof n === "number" && isFinite(n) ? Math.floor(n) : 1;
  return FORMS[Math.min(LAST_FORM, Math.max(1, v)) - 1];
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** form.got as {stageKey: positive finite ms}, only the keys "1".."5"; a damaged form is {} */
export function gotOf(form: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(form) || !Object.prototype.hasOwnProperty.call(form, "got")) return out;
  const got = form.got;
  if (!isObj(got)) return out;
  for (let n = 1; n <= LAST_FORM; n++) {
    const k = String(n);
    if (!Object.prototype.hasOwnProperty.call(got, k)) continue;
    const t = got[k];
    if (typeof t === "number" && isFinite(t) && t > 0) out[k] = t;
  }
  return out;
}

/** the highest stage reached: the level's stage, or a recorded one if that is higher */
export function highest(form: unknown, xp: unknown): number {
  let h = stageForLevel(level(xp));
  for (const k of Object.keys(gotOf(form))) h = Math.max(h, Number(k));
  return Math.min(LAST_FORM, Math.max(1, h));
}

/** the stage worn: form.wear.n if a finite number, held within 1..highest; else the highest */
export function worn(form: unknown, xp: unknown): number {
  const hi = highest(form, xp);
  if (isObj(form) && Object.prototype.hasOwnProperty.call(form, "wear") && isObj(form.wear)) {
    const n = form.wear.n;
    if (typeof n === "number" && isFinite(n)) return Math.min(hi, Math.max(1, Math.floor(n)));
  }
  return hi;
}

/** ascending stages 1..highest that the form has no record of: what a device records now */
export function fresh(form: unknown, xp: unknown): number[] {
  const got = gotOf(form);
  const out: number[] = [];
  for (let n = 1, hi = highest(form, xp); n <= hi; n++) if (!(String(n) in got)) out.push(n);
  return out;
}

export interface NextInfo {
  /** the highest unlocked stage */
  stage: FormStage;
  /** the stage after it, null at the last */
  next: FormStage | null;
  level: number;
  xp: number;
  /** threshold(next.level), or threshold(stage.level) at the last */
  need: number;
  /** max(0, need - xp), 0 at the last */
  toGo: number;
  /** 0..100 progress from threshold(stage.level) to need; 100 at the last */
  pct: number;
  final: boolean;
}

export function nextInfo(form: unknown, xp: unknown): NextInfo {
  const stage = stageOf(highest(form, xp));
  const next = stage.n >= LAST_FORM ? null : stageOf(stage.n + 1);
  const x = Math.max(0, num(xp));
  const from = threshold(stage.level);
  const need = next ? threshold(next.level) : from;
  const final = stage.n === LAST_FORM;
  const toGo = final ? 0 : Math.max(0, need - x);
  const pct = final || need <= from ? 100 : Math.min(100, Math.max(0, ((x - from) / (need - from)) * 100));
  return { stage, next, level: level(xp), xp: x, need, toGo, pct, final };
}
