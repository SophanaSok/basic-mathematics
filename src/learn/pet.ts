/* Mochi's pool: the pet's model (decision 0015). Four needs, each 0 to 5 hearts, drift down
   slowly with real time to a floor and never below it: nothing gets sick, nothing dies, and
   no line blames the learner. A need is stored as { n, at } (hearts as of the time `at`), and
   what the learner sees is read from it with the clock (heartsOf), so nothing has to run in
   the background. A pet with no record for a need reads as START_HEARTS, which gives a new
   pet something to do and nothing to fear. A time in the future reads as now, and one past
   the sync bound (WEAR_AT_MAX) reads as no record, so a wrong clock or a damaged value
   cannot freeze the hearts or beat every honest value for good.

   Growth comes from good days. A day scores one care point per need touched (at most 4), and
   only when the learner earned XP that day, so Mochi cannot grow without learning. The stages
   run on the running total of those points. A stage once reached is stamped in `grew` and
   never lost, even when the care window is pruned and the total falls.

   Facets, the currency, are never stored as a number. `earned` holds one id per cause (a first
   strong section, a medal level, a due review, a comparison, a mission), so the same cause on
   two devices is one id, and `spent` holds one id per purchase. The balance is the sum of
   what the ids are worth here, not what the stored n says, minus what was spent. The snack bag
   is derived the same way (buys and gifts minus feeds), so a buy on one device and a feed on
   another both survive a merge. A negative balance is allowed after a merge and only stops
   the next purchase; nothing is taken back.

   The record is bounded by prunePet, which looks at the keys alone: care, gift and spent keep
   the newest 400 days (the three terms of the bag share one window, or feeds older than the
   buys that remain would eat into new buys), the review earns the newest 90 days. Because the
   choice depends on the set of keys and nothing else, pruning after a union gives what pruning each side
   first and then merging would, which is what keeps the merge laws (mergePet in
   src/sync/merge.ts). There are no rollups: a pruned entry is gone, never summed into another.

   Pure: time comes in as an argument; no window, no DOM, no storage. */

import type { ActivityStore, DayKey, PetStore, Timestamp } from "../types/state.ts";
import { WEAR_AT_MAX } from "../sync/merge.ts";
import { at, keysOf, num, obj, plain } from "../sync/json.ts";

export const NEEDS = ["tummy", "play", "clean", "spark"] as const;
export type Need = (typeof NEEDS)[number];
export const HEARTS_MAX = 5;
export const START_HEARTS = 3;

const HOUR = 3_600_000;
/** one heart per `ms`, never below `floor` */
export const DRIFT: Record<Need, { ms: number; floor: number }> = {
  tummy: { ms: 12 * HOUR, floor: 1 },
  play: { ms: 24 * HOUR, floor: 1 },
  clean: { ms: 24 * HOUR, floor: 0 },
  spark: { ms: 48 * HOUR, floor: 1 }
};

function clamp(lo: number, hi: number, x: number) { return Math.min(hi, Math.max(lo, x)); }

/** hearts of a need now: `rec` is { n, at } or anything (damaged reads as START_HEARTS) */
export function heartsOf(need: Need, rec: unknown, now: Timestamp): number {
  const d = DRIFT[need];
  if (!plain(rec)) return START_HEARTS;
  const r = rec as { n?: unknown; at?: unknown };
  if (typeof r.at !== "number" || !isFinite(r.at) || r.at < 0 || r.at > WEAR_AT_MAX) return START_HEARTS;
  const from = Math.min(r.at, num(now));
  const steps = Math.floor((num(now) - from) / d.ms);
  return clamp(d.floor, HEARTS_MAX, Math.floor(num(r.n)) - steps);
}

/** the record after a care act: hearts as they stand now plus `delta`, stamped now */
export function touch(rec: unknown, need: Need, now: Timestamp, delta: number): { n: number; at: Timestamp } {
  return { n: clamp(0, HEARTS_MAX, heartsOf(need, rec, now) + Math.floor(num(delta))), at: now };
}

/* ---------------------------------------------------------------- facets -- */

export const REVIEW_CAP_IDS = 5;
export const SPEND_MAX = 1000;
/** facets by the prefix of the earn id; the stored n is never trusted */
export const EARN = { strong: 20, medal: 10, review: 5, compare: 5, mission: 10 } as const;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** the day inside an id like "buy:<day>:..." or "review:<day>:...", or null */
export function dayOfId(id: string): DayKey | null {
  const d = String(id).split(":")[1];
  return d !== undefined && DAY_RE.test(d) ? d : null;
}

/** what one earn id is worth: the table amount for a known shape, 0 for anything else */
export function earnAmount(id: string): number {
  const s = String(id);
  if (/^strong:.+/.test(s)) return EARN.strong;
  if (/^medal:.+:[123]$/.test(s)) return EARN.medal;
  if (/^review:\d{4}-\d{2}-\d{2}:.+/.test(s)) return EARN.review;
  if (/^compare:.+\/.+/.test(s)) return EARN.compare;
  if (/^mission:.+\/.+/.test(s)) return EARN.mission;
  return 0;
}

/** the facets in the earned ids, with at most REVIEW_CAP_IDS review ids counted per day: the
    first five of that day by id order, the same on every device since it reads the set */
function earnedTotal(earned: unknown): number {
  const e = obj(earned);
  let sum = 0;
  const byDay: Record<string, string[]> = Object.create(null);
  keysOf(e, {}).forEach((id) => {
    if (!(num(at(e, id)) > 0)) return;
    const amount = earnAmount(id);
    if (!amount) return;
    if (id.startsWith("review:")) { (byDay[dayOfId(id) as string] = byDay[dayOfId(id) as string] || []).push(id); return; }
    sum += amount;
  });
  Object.keys(byDay).forEach((d) => { sum += Math.min(REVIEW_CAP_IDS, byDay[d].length) * EARN.review; });
  return sum;
}

/** facets in hand: earned minus spent, derived, never stored; it may be negative */
export function balance(pet: unknown): number {
  const p = obj(pet), spent = obj(p.spent);
  let out = earnedTotal(p.earned);
  keysOf(spent, {}).forEach((id) => { out -= clamp(0, SPEND_MAX, num(at(spent, id))); });
  return out;
}

/** a purchase is allowed only when the balance covers it and is not negative */
export function canBuy(pet: unknown, price: number): boolean {
  const b = balance(pet);
  return b >= 0 && b >= price;
}

/* --------------------------------------------------------------- the bag -- */

/** snacks in hand by item: buys (one id, one snack) plus one pellet per gift day, minus
    what was fed on any day, never below 0; only items above 0 are listed */
export function bag(pet: unknown, isSnack: (item: string) => boolean): Record<string, number> {
  const p = obj(pet), have: Record<string, number> = Object.create(null);
  keysOf(obj(p.spent), {}).forEach((id) => {
    const parts = id.split(":");
    if (parts.length < 5 || parts[0] !== "buy") return;
    if (!(num(at(obj(p.spent), id)) > 0)) return;
    const item = parts.slice(2, -2).join(":");
    if (item && isSnack(item)) have[item] = (have[item] || 0) + 1;
  });
  const gift = obj(p.gift);
  const gifts = keysOf(gift, {}).filter((d) => at(gift, d)).length;
  if (gifts) have.pellet = (have.pellet || 0) + gifts;
  keysOf(obj(p.care), {}).forEach((day) => {
    const feed = careOf(p, day).feed;
    Object.keys(feed).forEach((item) => { if (item in have) have[item] -= feed[item]; });
  });
  const out: Record<string, number> = {};
  Object.keys(have).forEach((item) => { if (have[item] > 0) out[item] = have[item]; });
  return out;
}

/* ------------------------------------------------------------- care days -- */

export interface Care { feed: Record<string, number>; play: number; clean: number; spark: number }
function count(x: unknown): number { const n = Math.floor(num(x)); return n > 0 ? n : 0; }

/** one day's care, normalised: damage reads as 0 and only positive integers are kept */
export function careOf(pet: unknown, day: DayKey): Care {
  const rec = obj(at(obj(obj(pet).care), day)), feed: Record<string, number> = {};
  const raw = obj(rec.feed);
  keysOf(raw, {}).forEach((item) => { const n = count(at(raw, item)); if (n) feed[item] = n; });
  return { feed, play: count(rec.play), clean: count(rec.clean), spark: count(rec.spark) };
}

/** 0 to 4: the needs touched on a day, and 0 on a day without XP however much care was logged */
export function carePoints(pet: unknown, day: DayKey, xp: unknown): number {
  if (typeof xp !== "number" || !isFinite(xp) || !(xp > 0)) return 0;
  const c = careOf(pet, day);
  return (Object.keys(c.feed).length ? 1 : 0) + (c.play ? 1 : 0) + (c.clean ? 1 : 0) + (c.spark ? 1 : 0);
}

/** the running total of care points over the days kept in `care` */
export function growthPoints(pet: unknown, activity: ActivityStore | unknown): number {
  const days = obj(obj(activity).days);
  let sum = 0;
  keysOf(obj(obj(pet).care), {}).forEach((day) => { sum += carePoints(pet, day, at(days, day)); });
  return sum;
}

/* ---------------------------------------------------------------- stages -- */

export const STAGES = ["hatchling", "fry", "juvenile", "adult", "elder"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_AT = [0, 8, 24, 56, 120];

function stageReached(points: unknown): number {
  let i = 0;
  STAGE_AT.forEach((t, k) => { if (num(points) >= t) i = k; });
  return i;
}
/** the later of the stage the points reach and the highest stage stamped in `grew` */
export function stageIndex(points: unknown, grew: unknown): number {
  let i = stageReached(points);
  const g = obj(grew);
  STAGES.forEach((s, k) => { if (num(at(g, s)) > 0 && k > i) i = k; });
  return i;
}
export function stageOf(points: unknown, grew: unknown): Stage { return STAGES[stageIndex(points, grew)]; }

/** `grew` with every stage the points reach and it lacks stamped `now`; the caller writes it
    and the merge keeps the earliest time of each */
export function newlyGrown(pet: unknown, points: unknown, now: Timestamp): Record<string, Timestamp> {
  const g = obj(obj(pet).grew), out: Record<string, Timestamp> = {};
  keysOf(g, {}).forEach((k) => { if (num(at(g, k)) > 0) out[k] = num(at(g, k)); });
  const top = stageReached(points);
  STAGES.forEach((s, k) => { if (k <= top && !(s in out)) out[s] = now; });
  return out;
}

/* ---------------------------------------------------------------- prunes -- */

/** care, gift and spent: the bag's three terms, one window */
export const PRUNE_CARE_DAYS = 400;
/** the review earns, which are the one earn kind without a content bound */
export const PRUNE_LEDGER_DAYS = 90;

/** the newest `days` distinct days among the keys, by `dayOf`; a key without a valid day is
    dropped. Chosen by a sort of the keys, so two devices choose alike. */
function newest(rec: any, keep: number, dayOf: (k: string) => string | null, always?: (k: string) => boolean) {
  const out: any = {}, days: string[] = [];
  const dayed = keysOf(rec, {}).map((k) => ({ k, d: always && always(k) ? "" : dayOf(k) }));
  dayed.forEach((x) => { if (x.d && days.indexOf(x.d) < 0) days.push(x.d); });
  const kept = days.sort().reverse().slice(0, keep);
  dayed.forEach((x) => { if (x.d === "" || (x.d && kept.indexOf(x.d) >= 0)) out[x.k] = at(rec, x.k); });
  return out;
}
const dayKey = (k: string) => (DAY_RE.test(k) ? k : null);

/** a bounded copy: care, gift and spent to the newest 400 days, the review earns to the
    newest 90 (by the day inside the id), a key with no valid day dropped. Idempotent. */
export function prunePet(pet: unknown): PetStore {
  const p = obj(pet), out: any = {};
  keysOf(p, {}).forEach((k) => { out[k] = at(p, k); });
  if (plain(p.care)) out.care = newest(p.care, PRUNE_CARE_DAYS, dayKey);
  else delete out.care;
  if (plain(p.gift)) out.gift = newest(p.gift, PRUNE_CARE_DAYS, dayKey);
  else delete out.gift;
  if (plain(p.spent)) out.spent = newest(p.spent, PRUNE_CARE_DAYS, dayOfId);
  else delete out.spent;
  if (plain(p.earned)) out.earned = newest(p.earned, PRUNE_LEDGER_DAYS, dayOfId, (k) => !k.startsWith("review:"));
  else delete out.earned;
  return out;
}
