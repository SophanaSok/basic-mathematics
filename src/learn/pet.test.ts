import { describe, expect, it } from "vitest";
import { mergePet, WEAR_AT_MAX } from "../sync/merge.ts";
import {
  balance, canBuy, capKeys, careOf, carePoints, DRIFT, earnAmount, EARNED_MAX, giftTaken, growthPoints, heartsOf, laterStamp,
  newlyGrown, prunePet, PRUNE_CARE_DAYS, REVIEW_CAP_IDS, SPENT_MAX, stageOf, START_HEARTS, touch
} from "./pet.ts";

const H = 3_600_000;
const dayAt = (i: number) => new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);

describe("heartsOf", () => {
  it("reads a missing or damaged record as START_HEARTS", () => {
    for (const rec of [undefined, null, "x", [1], 5, {}, { n: 5 }, { n: 5, at: "9" }, { n: 5, at: NaN }]) expect(heartsOf("tummy", rec, 1000)).toBe(START_HEARTS);
  });
  it("drifts one heart per interval", () => {
    expect(heartsOf("tummy", { n: 5, at: 0 }, 11 * H)).toBe(5);
    expect(heartsOf("tummy", { n: 5, at: 0 }, 12 * H)).toBe(4);
    expect(heartsOf("play", { n: 5, at: 0 }, 49 * H)).toBe(3);
    expect(heartsOf("spark", { n: 5, at: 0 }, 96 * H)).toBe(3);
  });
  it("T6: an at in the future reads as now; 1e308 or a string reads as START_HEARTS", () => {
    expect(heartsOf("tummy", { n: 4, at: 5000 }, 1000)).toBe(4);
    expect(heartsOf("tummy", { n: 5, at: 1e308 }, 1000)).toBe(START_HEARTS);
    expect(heartsOf("tummy", { n: 5, at: WEAR_AT_MAX + 1 }, 1000)).toBe(START_HEARTS);
    expect(heartsOf("tummy", { n: 5, at: "1000" }, 1000)).toBe(START_HEARTS);
  });
  it("T6: every need stops at its floor after a year", () => {
    for (const need of Object.keys(DRIFT) as (keyof typeof DRIFT)[]) {
      expect(heartsOf(need, { n: 5, at: 0 }, 365 * 24 * H)).toBe(DRIFT[need].floor);
    }
  });
  it("floors a fractional or damaged n to an integer", () => {
    expect(heartsOf("play", { n: 3.9, at: 0 }, 0)).toBe(3);
    expect(heartsOf("play", { n: 99, at: 0 }, 0)).toBe(5);
    expect(heartsOf("clean", { n: "x", at: 0 }, 0)).toBe(0);
  });
});

describe("touch and laterStamp", () => {
  it("adds the delta to the hearts as they stand now and stamps now", () => {
    expect(touch({ n: 5, at: 0 }, "tummy", 12 * H, 1)).toEqual({ n: 5, at: 12 * H });
    expect(touch(undefined, "play", 9, 1)).toEqual({ n: 4, at: 9 });
    expect(touch(undefined, "play", 9, -10)).toEqual({ n: 0, at: 9 });
  });
  it("T6: a stamp is one past a valid old one that runs ahead of the clock", () => {
    expect(laterStamp({ n: 3, at: 5000 }, 1000)).toBe(5001);
    expect(laterStamp({ n: 3, at: 500 }, 1000)).toBe(1000);
    expect(laterStamp({ n: 3, at: 1000 }, 1000)).toBe(1001);
    expect(laterStamp(undefined, 1000)).toBe(1000);
    expect(laterStamp({ n: 3, at: 1e308 }, 1000)).toBe(1000);
    expect(laterStamp({ n: 3, at: "9999" }, 1000)).toBe(1000);
    expect(laterStamp({ n: 3, at: WEAR_AT_MAX }, 1000)).toBe(WEAR_AT_MAX);
    expect(touch({ n: 3, at: 5000 }, "play", 1000, 1)).toEqual({ n: 4, at: 5001 });
  });
});

describe("earnAmount", () => {
  it("pays the table amount for a known id and 0 for anything else", () => {
    expect(earnAmount("strong:ch01#a")).toBe(20);
    expect(earnAmount("medal:ch01:practice:3")).toBe(10);
    expect(earnAmount("medal:ch01:practice:4")).toBe(0);
    expect(earnAmount("review:2026-10-01:ch01#a")).toBe(5);
    expect(earnAmount("review:nope:ch01#a")).toBe(0);
    expect(earnAmount("compare:ch01/e1")).toBe(5);
    expect(earnAmount("mission:ch01/m1")).toBe(10);
    expect(earnAmount("twin:ch01/e1")).toBe(0);
    expect(earnAmount("")).toBe(0);
  });
});

describe("balance and canBuy", () => {
  it("counts a gold medal as three ids and 30 facets", () => {
    const earned = { "medal:ch01:practice:1": 10, "medal:ch01:practice:2": 10, "medal:ch01:practice:3": 10 };
    expect(balance({ earned })).toBe(30);
  });
  it("the review cap: six ids on one day count 25, the first five by order", () => {
    const ids = ["a", "b", "c", "d", "e", "f"].map((s) => "review:2026-10-01:ch01#" + s);
    const earned: any = {};
    ids.forEach((id) => { earned[id] = 5; });
    expect(balance({ earned })).toBe(REVIEW_CAP_IDS * 5);
    const rev: any = {};
    ids.slice().reverse().forEach((id) => { rev[id] = 5; });
    expect(balance({ earned: rev })).toBe(25);
    /* the same on both devices: each holds three, the union is six */
    const m = mergePet({ earned: Object.fromEntries(ids.slice(0, 3).map((i) => [i, 5])) }, { earned: Object.fromEntries(ids.slice(3).map((i) => [i, 5])) });
    expect(balance(m)).toBe(25);
    expect(balance(mergePet({ earned: Object.fromEntries(ids.slice(3).map((i) => [i, 5])) }, { earned: Object.fromEntries(ids.slice(0, 3).map((i) => [i, 5])) }))).toBe(25);
  });
  it("does not trust the stored n for the earn, and clamps a spend", () => {
    expect(balance({ earned: { "strong:ch01#a": 99999 } })).toBe(20);
    expect(balance({ earned: { "strong:ch01#a": 20 }, spent: { "buy:2026-10-01:hat:a:1": 1e9 } })).toBe(20 - 1000);
    expect(balance({ spent: { "buy:2026-10-01:hat:a:1": -50 } })).toBe(0);
  });
  it("T3: a negative balance after a merge is allowed, canBuy refuses, nothing is removed", () => {
    const buy = (d: string) => "buy:" + d + ":hat:";
    const A = { earned: { "strong:ch01#a": 20 }, spent: { [buy("2026-10-01") + "a:1"]: 15 } };
    const B = { earned: { "strong:ch01#a": 20 }, spent: { [buy("2026-10-01") + "b:1"]: 15 } };
    const m = mergePet(A, B);
    expect(Object.keys(m.spent).length).toBe(2);
    expect(balance(m)).toBe(-10);
    expect(canBuy(m, 0)).toBe(false);
    expect(canBuy(m, 1)).toBe(false);
    expect(canBuy(A, 5)).toBe(true);
    expect(canBuy(A, 6)).toBe(false);
  });
});

describe("giftTaken", () => {
  it("is true only for a day in gift that is set", () => {
    expect(giftTaken({ gift: { "2026-10-01": 1 } }, "2026-10-01")).toBe(true);
    expect(giftTaken({ gift: { "2026-10-01": 1 } }, "2026-10-02")).toBe(false);
    expect(giftTaken({ gift: { "2026-10-01": 0 } }, "2026-10-01")).toBe(false);
    expect(giftTaken(null, "2026-10-01")).toBe(false);
    expect(giftTaken({ gift: "x" }, "constructor")).toBe(false);
  });
});

describe("capKeys", () => {
  it("keeps the known keys when it cuts, then the rest by id order", () => {
    const rec = { z: 1, b: 2, a: 3, head: 4, tail: 5 };
    expect(Object.keys(capKeys(rec, 3, ["tail", "head", "missing"]))).toEqual(["tail", "head", "a"]);
    expect(capKeys(rec, 99, []).z).toBe(1);
    expect(capKeys("x", 3, ["a"])).toEqual({});
  });
});

describe("careOf and carePoints", () => {
  it("normalises damage to positive integers", () => {
    expect(careOf({ care: { d: { feed: { fish: 2.7, bad: "x", neg: -1 }, play: "3", clean: null, spark: [] } } }, "d")).toEqual({ feed: { fish: 2 }, play: 3, clean: 0, spark: 0 });
    expect(careOf(null, "d")).toEqual({ feed: {}, play: 0, clean: 0, spark: 0 });
  });
  it("T7: 0 on a day with no XP however much care was logged, at most 4 with XP", () => {
    const pet = { care: { d: { feed: { fish: 99 }, play: 99, clean: 99, spark: 99 } } };
    for (const xp of [undefined, 0, -3, "50", NaN, null, Infinity * 0]) expect(carePoints(pet, "d", xp)).toBe(0);
    expect(carePoints(pet, "d", 1)).toBe(4);
    expect(carePoints({ care: { d: { feed: { fish: 2 }, play: 1 } } }, "d", 30)).toBe(2);
  });
});

describe("growthPoints", () => {
  it("sums care points over the days, reading XP per day from the activity store", () => {
    const pet = { care: { "2026-10-01": { play: 1, clean: 1 }, "2026-10-02": { play: 1 }, "2026-10-03": { play: 1, clean: 1 } } };
    const activity = { days: { "2026-10-01": 20, "2026-10-02": 0, "2026-10-03": "9" } };
    expect(growthPoints(pet, activity)).toBe(2);
    expect(growthPoints(pet, null)).toBe(0);
  });
});

describe("stageOf and newlyGrown", () => {
  it("reaches stages by points", () => {
    expect(stageOf(0, {})).toBe("hatchling");
    expect(stageOf(8, {})).toBe("fry");
    expect(stageOf(55, {})).toBe("juvenile");
    expect(stageOf(120, {})).toBe("elder");
  });
  it("is monotonic in grew even when points fall after pruning", () => {
    expect(stageOf(3, { fry: 5, juvenile: 9 })).toBe("juvenile");
    expect(stageOf(3, { fry: "x", juvenile: -1 })).toBe("hatchling");
    const grew = newlyGrown({}, 130, 1);
    for (const pts of [130, 70, 30, 10, 2, 0]) expect(stageOf(pts, grew)).toBe("elder");
    const order = ["hatchling", "fry", "juvenile", "adult", "elder"];
    let prev = 0;
    for (const pts of [0, 7, 8, 23, 24, 55, 56, 119, 120, 500]) {
      const i = order.indexOf(stageOf(pts, {}));
      expect(i).toBeGreaterThanOrEqual(prev);
      prev = i;
    }
    expect(stageOf(0, newlyGrown({}, 130, 1))).toBe("elder");
  });
  it("stamps only the stages the points reach and grew lacks", () => {
    expect(newlyGrown({ grew: { hatchling: 3 } }, 30, 99)).toEqual({ hatchling: 3, fry: 99, juvenile: 99 });
  });
});

describe("prunePet", () => {
  const year = () => {
    const care: any = {}, gift: any = {};
    for (let i = 0; i < 450; i++) { care[dayAt(i)] = { play: 1 }; gift[dayAt(i)] = 1; }
    care["bad"] = { play: 1 }; gift["2026-1-1"] = 1;
    return { v: 1, care, gift };
  };
  it("keeps care and gift to the newest 400 days and drops a damaged day key", () => {
    const r: any = prunePet(year());
    expect(Object.keys(r.care).length).toBe(PRUNE_CARE_DAYS);
    expect(Object.keys(r.gift).length).toBe(PRUNE_CARE_DAYS);
    expect(r.care.bad).toBeUndefined();
    expect(r.care[dayAt(449)]).toBeDefined();
    expect(r.care[dayAt(49)]).toBeUndefined();
    expect(r.care[dayAt(50)]).toBeDefined();
  });
  it("never prunes the ledgers by time, so a balance stays exact", () => {
    const spent: any = {}, earned: any = {};
    for (let i = 0; i < 300; i++) { spent["feed:" + dayAt(i) + ":fish:a:1"] = 25; for (let k = 0; k < 5; k++) earned["review:" + dayAt(i) + ":ch01#s" + k] = 5; }
    const r: any = prunePet({ earned, spent });
    expect(Object.keys(r.spent).length).toBe(300);
    expect(balance(r)).toBe(balance({ earned, spent }));
  });
  it("keeps five review ids a day (the ones counted), drops junk ids and counts not above 0", () => {
    const earned: any = { j17: 5, "bogus:x": 5, "strong:ch01#a": 20, "strong:ch01#b": 0 };
    for (let k = 0; k < 8; k++) earned["review:2026-10-01:ch01#s" + k] = 5;
    const r: any = prunePet({ earned, spent: { "buy:2026-10-01:hat:a:1": -1, "buy:2026-10-01:hat:a:2": 5 } });
    expect(Object.keys(r.earned).sort()).toEqual(["review:2026-10-01:ch01#s0", "review:2026-10-01:ch01#s1", "review:2026-10-01:ch01#s2", "review:2026-10-01:ch01#s3", "review:2026-10-01:ch01#s4", "strong:ch01#a"]);
    expect(balance(r)).toBe(balance({ earned, spent: { "buy:2026-10-01:hat:a:2": 5 } }));
    expect(Object.keys(r.spent)).toEqual(["buy:2026-10-01:hat:a:2"]);
  });
  it("caps the other earns and the spends by count, the newest spends kept", () => {
    const earned: any = {}, spent: any = {};
    for (let i = 0; i < EARNED_MAX + 50; i++) earned["strong:s" + String(i).padStart(6, "0")] = 20;
    for (let i = 0; i < SPENT_MAX + 50; i++) spent["buy:2026-10-01:x:a:" + String(i).padStart(6, "0")] = 1;
    const r: any = prunePet({ earned, spent });
    expect(Object.keys(r.earned).length).toBe(EARNED_MAX);
    expect(Object.keys(r.spent).length).toBe(SPENT_MAX);
    expect(r.spent["buy:2026-10-01:x:a:" + String(SPENT_MAX + 49).padStart(6, "0")]).toBe(1);
  });
  it("cuts the spends by day before id, so a new buy outlives older feeds", () => {
    const spent: any = { "buy:2026-10-02:hat:a:1": 500, "junk": 3 };
    for (let i = 0; i < SPENT_MAX; i++) spent["feed:2026-10-01:fish:a:" + String(i).padStart(6, "0")] = 5;
    const r: any = prunePet({ v: 1, spent });
    expect(Object.keys(r.spent).length).toBe(SPENT_MAX);
    expect(r.spent["buy:2026-10-02:hat:a:1"]).toBe(500);
    expect(r.spent.junk).toBeUndefined();
    expect(r.spent["buy:2026-10-01:x:a:000000"]).toBeUndefined();
  });
  it("holds every other map to a count and the known fields survive", () => {
    const owned: any = {}, grew: any = {}, needs: any = {}, feed: any = {}, day: any = { feed, play: 1, clean: 1, spark: 1 };
    for (let i = 0; i < 600; i++) owned["i" + i] = "2026-10-01";
    for (let i = 0; i < 40; i++) { grew["g" + i] = 5; needs["n" + i] = 1; feed["f" + i] = 1; day["u" + i] = 1; }
    grew.elder = 9; needs.tummy = { n: 3, at: 1 };
    const pet: any = { v: 1, owned, grew, needs, care: { "2026-10-01": day } };
    for (let i = 0; i < 40; i++) pet["x" + i] = 1;
    const r: any = prunePet(pet);
    expect(Object.keys(r.owned).length).toBe(500);
    expect(Object.keys(r.grew).length).toBe(16);
    expect(r.grew.elder).toBe(9);
    expect(Object.keys(r.needs).length).toBe(16);
    expect(r.needs.tummy).toEqual({ n: 3, at: 1 });
    const d = r.care["2026-10-01"];
    expect(Object.keys(d).length).toBe(32);
    expect(d.play).toBe(1); expect(d.spark).toBe(1);
    expect(Object.keys(d.feed).length).toBe(32);
    expect(Object.keys(r).length).toBe(32);
    expect(r.v).toBe(1); expect(r.care).toBeDefined(); expect(r.spent).toBeDefined();
  });
  it("holds a wear to a size and drops one that is damaged", () => {
    const decor = Array.from({ length: 30 }, (_, i) => "d" + i).concat([5 as any]);
    const w: any = prunePet({ wear: { head: 3, back: "cape", decor, at: 5, z1: 1 } }).wear;
    expect(w.head).toBeUndefined(); expect(w.back).toBe("cape"); expect(w.decor.length).toBe(16); expect(w.z1).toBe(1);
    expect("wear" in prunePet({ wear: { at: 1e308 } })).toBe(false);
  });
  it("is idempotent and does not touch its input", () => {
    const y = year(), before = JSON.stringify(y);
    const once = prunePet(y);
    expect(JSON.stringify(prunePet(once))).toBe(JSON.stringify(once));
    expect(JSON.stringify(y)).toBe(before);
  });
  it("takes a hostile record of 60,000 distinct days quickly", () => {
    const care: any = {};
    for (let i = 0; i < 60000; i++) care[dayAt(i)] = { play: 1 };
    const t = Date.now();
    expect(Object.keys((prunePet({ care }) as any).care).length).toBe(PRUNE_CARE_DAYS);
    expect(Date.now() - t).toBeLessThan(1500);
  });
});
