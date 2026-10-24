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
   what the ids are worth here, not what the stored n says, minus what was spent. A negative
   balance is allowed after a merge and only stops the next purchase; nothing is taken back.
   Feeding is a purchase in one act: the caller writes spent["feed:<day>:<item>:<device>:<k>"]
   and bumps care[day].feed[item]; the free daily pellet is a free feed (gift[day] = 1 says
   today's was taken, no spend). There is no snack bag to derive, so two devices that feed on
   the same day can over-count the care counters, which only reaches growth, never money.

   The ledgers are never pruned by time: a balance is exact or it is nothing. Pruning earns and
   spends on different terms once let the balance drift (earns aged out while the spends they
   paid for stayed), which could lock a learner at a negative balance for good. Honest spends
   are bounded by what can be earned, so the ledgers get counts only: junk ids (earnAmount 0)
   never survive, at most REVIEW_CAP_IDS review ids per day are kept (exactly the ones the
   balance counts, so the cap moves no balance), the other earns stop at EARNED_MAX and the
   spends at SPENT_MAX. Care and gift keep the newest 400 days. Every map has a key count cap.
   Each cap looks at the keys alone, in one fixed order with the known keys first, so pruning
   after a union gives what pruning each side first and then merging would, which is what keeps
   the merge laws (mergePet in src/sync/merge.ts). There are no rollups.

   Pure: time comes in as an argument; no window, no DOM, no storage. */

import type { ActivityStore, DayKey, PetStore, Timestamp } from "../types/state.ts";
import { mergeCareDay, mergeWear, PET, WEAR_AT_MAX, wearOf } from "../sync/merge.ts";
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

/** The stamp for a record written now. A device whose clock ran ahead would otherwise win every
    merge until that date and freeze the need (heartsOf already reads a future `at` as now), so
    a new stamp is at least one past the old one when that is valid. Kept inside the sync bound. */
export function laterStamp(old: unknown, now: Timestamp): Timestamp {
  const w = wearOf(old);
  return w ? Math.min(WEAR_AT_MAX, Math.max(now, (w as any).at + 1)) : now;
}

/** the record after a care act: hearts as they stand now plus `delta` */
export function touch(rec: unknown, need: Need, now: Timestamp, delta: number): { n: number; at: Timestamp } {
  return { n: clamp(0, HEARTS_MAX, heartsOf(need, rec, now) + Math.floor(num(delta))), at: laterStamp(rec, now) };
}

/* ---------------------------------------------------------------- facets -- */

export const REVIEW_CAP_IDS = 5;
export const SPEND_MAX = 1000;
/** key-count bounds of the ledgers and maps (see the header) */
export const EARNED_MAX = 20000, SPENT_MAX = 20000, OWNED_MAX = 500, GREW_MAX = 16, NEEDS_MAX = 16;
export const CARE_DAY_MAX = 32, FEED_MAX = 32, PET_KEYS_MAX = 32, DECOR_MAX = 16, WEAR_EXTRA_MAX = 8;
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
  const p = obj(pet), spent = obj(at(p, "spent"));
  let out = earnedTotal(at(p, "earned"));
  keysOf(spent, {}).forEach((id) => { out -= clamp(0, SPEND_MAX, num(at(spent, id))); });
  return out;
}

/** a purchase is allowed only when the balance covers it and is not negative */
export function canBuy(pet: unknown, price: number): boolean {
  const b = balance(pet);
  return b >= 0 && b >= price;
}

/** whether today's free feed (the daily pellet) was taken: gift[day] is set */
export function giftTaken(pet: unknown, day: DayKey): boolean {
  return !!at(obj(obj(pet).gift), day);
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

export const PRUNE_CARE_DAYS = 400;

/** at most `max` keys of a record: the keys in `first` (those it holds, in that order), then
    the rest by id order ascending. A cut looks at the keys alone, so the known fields are never
    the ones lost and two devices cut alike. */
export function capKeys(rec: unknown, max: number, first: string[]): any {
  const all = keysOf(rec, {}), out: any = {};
  const hold = new Set(all), firstSet = new Set(first);
  const order = first.filter((k) => hold.has(k)).concat(all.filter((k) => !firstSet.has(k)));
  order.slice(0, max).forEach((k) => { out[k] = at(rec, k); });
  return out;
}

/** a wear record held to a size: head, back and tail only as strings, decor only as an array of
    at most DECOR_MAX strings, at as it is, other fields at most WEAR_EXTRA_MAX of them */
export function normWear(w: any): any {
  const KNOWN = ["head", "back", "tail", "decor", "at"], rest: any = {};
  keysOf(w, {}).forEach((k) => { if (KNOWN.indexOf(k) < 0) rest[k] = at(w, k); });
  const out = capKeys(rest, WEAR_EXTRA_MAX, []);
  ["head", "back", "tail"].forEach((k) => { if (typeof at(w, k) === "string") out[k] = at(w, k); });
  const decor = at(w, "decor");
  if (Array.isArray(decor)) out.decor = decor.filter((x) => typeof x === "string").slice(0, DECOR_MAX);
  out.at = at(w, "at");
  return out;
}

const dayKey = (k: string) => (DAY_RE.test(k) ? k : null);
function newestDays(rec: unknown, keep: number, valueOk: (v: unknown) => boolean) {
  const out: any = {}, r = obj(rec);
  keysOf(r, {}).filter((k) => dayKey(k) && valueOk(at(r, k))).sort().slice(-keep).forEach((k) => { out[k] = at(r, k); });
  return out;
}
function liveCounts(rec: unknown) {
  const out: any = {}, r = obj(rec);
  keysOf(r, {}).forEach((k) => { const n = num(at(r, k)); if (n > 0) out[k] = n; });
  return out;
}

/** a bounded copy; for the fields it touches (earned, spent, owned, needs, care, grew, wear,
    gift, v and the record's own keys) prunePet(x) equals mergePet(x, {}). Earns that are worth
    nothing, and counts not above 0, are dropped; review earns stop at REVIEW_CAP_IDS a day,
    the other earns at EARNED_MAX, the spends at SPENT_MAX (the newest days, then the last ids);
    care and gift keep the newest 400 days, a key with no valid day dropped. Idempotent. */
export function prunePet(pet: unknown): PetStore {
  const p = obj(pet), out: any = {};
  keysOf(p, {}).forEach((k) => { out[k] = at(p, k); });
  const earned = liveCounts(at(p, "earned")), review: Record<string, number> = {};
  const earnedOut: any = {}, others: string[] = [];
  Object.keys(earned).sort().forEach((id) => {
    if (!earnAmount(id)) return;
    if (id.startsWith("review:")) {
      const d = dayOfId(id) as string;
      review[d] = (review[d] || 0) + 1;
      if (review[d] <= REVIEW_CAP_IDS) earnedOut[id] = earned[id];
    } else others.push(id);
  });
  others.slice(0, EARNED_MAX).forEach((id) => { earnedOut[id] = earned[id]; });
  out.earned = earnedOut;
  const spent = liveCounts(at(p, "spent")), spentOut: any = {};
  /* the cut is by day first, then id, so a newer buy never goes before an older feed: every
     feed: id would otherwise sort above every buy: id */
  const byDay = (id: string) => (dayOfId(id) || "") + "\u0000" + id;
  Object.keys(spent).sort((x, y) => (byDay(x) < byDay(y) ? -1 : byDay(x) > byDay(y) ? 1 : 0)).slice(-SPENT_MAX).forEach((id) => { spentOut[id] = spent[id]; });
  out.spent = spentOut;
  const owned: any = {}, o = obj(at(p, "owned"));
  keysOf(o, {}).forEach((k) => { if (typeof at(o, k) === "string") owned[k] = at(o, k); });
  out.owned = capKeys(owned, OWNED_MAX, []);
  const needs: any = {}, nd = obj(at(p, "needs"));
  keysOf(nd, {}).forEach((k) => { needs[k] = (NEEDS as readonly string[]).indexOf(k) >= 0 ? mergeWear(at(nd, k), undefined) : at(nd, k); });
  out.needs = capKeys(needs, NEEDS_MAX, NEEDS as unknown as string[]);
  const care: any = {}, cd = obj(at(p, "care"));
  Object.keys(newestDays(cd, PRUNE_CARE_DAYS, () => true)).forEach((d) => {
    const day = mergeCareDay(at(cd, d), undefined);
    if (plain(day)) {
      const capped = capKeys(day, CARE_DAY_MAX, ["feed", "play", "clean", "spark"]);
      if (plain(capped.feed)) capped.feed = capKeys(capped.feed, FEED_MAX, []);
      care[d] = capped;
    } else care[d] = day;
  });
  out.care = care;
  const grew: any = {}, gr = obj(at(p, "grew"));
  keysOf(gr, {}).forEach((k) => { const t = num(at(gr, k)); if (t > 0) grew[k] = t; });
  out.grew = capKeys(grew, GREW_MAX, STAGES as unknown as string[]);
  out.gift = Object.keys(newestDays(at(p, "gift"), PRUNE_CARE_DAYS, (v) => !!v)).reduce((g: any, d) => { g[d] = 1; return g; }, {});
  const w = wearOf(at(p, "wear"));
  if (w) out.wear = normWear(w); else delete out.wear;
  const v = num(at(p, "v"));
  if (v > 0) out.v = v; else delete out.v;
  return capKeys(out, PET_KEYS_MAX, PET);
}
