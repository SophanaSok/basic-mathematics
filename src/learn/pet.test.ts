import { describe, expect, it } from "vitest";
import { mergePet, WEAR_AT_MAX } from "../sync/merge.ts";
import {
  balance, bag, canBuy, careOf, carePoints, DRIFT, earnAmount, growthPoints, heartsOf, newlyGrown, prunePet,
  PRUNE_CARE_DAYS, PRUNE_LEDGER_DAYS, REVIEW_CAP_IDS, stageOf, START_HEARTS, touch
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

describe("touch", () => {
  it("adds the delta to the hearts as they stand now and stamps now", () => {
    expect(touch({ n: 5, at: 0 }, "tummy", 12 * H, 1)).toEqual({ n: 5, at: 12 * H });
    expect(touch(undefined, "play", 9, 1)).toEqual({ n: 4, at: 9 });
    expect(touch(undefined, "play", 9, -10)).toEqual({ n: 0, at: 9 });
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

describe("bag", () => {
  const snack = (i: string) => i === "fish" || i === "pellet";
  it("a buy on one device and a feed on the other give the right bag after mergePet", () => {
    const A = { spent: { "buy:2026-10-01:fish:a:1": 8, "buy:2026-10-01:fish:a:2": 8, "buy:2026-10-01:hat:a:3": 30 } };
    const B = { care: { "2026-10-02": { feed: { fish: 1 } } } };
    expect(bag(mergePet(A, B), snack)).toEqual({ fish: 1 });
    expect(bag(mergePet(B, A), snack)).toEqual({ fish: 1 });
  });
  it("counts the gift pellet and never goes below 0", () => {
    expect(bag({ gift: { "2026-10-01": 1, "2026-10-02": 1 } }, snack)).toEqual({ pellet: 2 });
    expect(bag({ gift: { "2026-10-01": 1 }, care: { "2026-10-01": { feed: { pellet: 4, fish: 2 } } } }, snack)).toEqual({});
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
    const care: any = {}, gift: any = {}, spent: any = {}, earned: any = { "strong:ch01#a": 20 };
    for (let i = 0; i < 450; i++) { care[dayAt(i)] = { play: 1 }; gift[dayAt(i)] = 1; }
    for (let i = 0; i < 450; i++) spent["buy:" + dayAt(i) + ":fish:a:1"] = 5;
    for (let i = 0; i < 120; i++) earned["review:" + dayAt(i) + ":ch01#a"] = 5;
    care["bad"] = { play: 1 }; gift["2026-1-1"] = 1; spent["junk"] = 1; earned["review:zz:ch01#a"] = 5;
    return { v: 1, care, gift, spent, earned };
  };
  it("comes out at the bounds and drops a damaged day key", () => {
    const r: any = prunePet(year());
    expect(Object.keys(r.care).length).toBe(PRUNE_CARE_DAYS);
    expect(Object.keys(r.gift).length).toBe(PRUNE_CARE_DAYS);
    expect(Object.keys(r.spent).length).toBe(PRUNE_CARE_DAYS);
    expect(Object.keys(r.earned).length).toBe(PRUNE_LEDGER_DAYS + 1);
    expect(r.earned["review:" + dayAt(30) + ":ch01#a"]).toBe(5);
    expect(r.earned["review:" + dayAt(29) + ":ch01#a"]).toBeUndefined();
    expect(r.care.bad).toBeUndefined();
    expect(r.care[dayAt(449)]).toBeDefined();
    expect(r.care[dayAt(49)]).toBeUndefined();
    expect(r.care[dayAt(50)]).toBeDefined();
    /* buys keep the care window, so a feed logged 100 days ago still has its buy to count against */
    expect(r.spent["buy:" + dayAt(50) + ":fish:a:1"]).toBe(5);
    expect(r.spent["buy:" + dayAt(49) + ":fish:a:1"]).toBeUndefined();
  });
  it("is idempotent and does not touch its input", () => {
    const y = year(), before = JSON.stringify(y);
    const once = prunePet(y);
    expect(JSON.stringify(prunePet(once))).toBe(JSON.stringify(once));
    expect(JSON.stringify(y)).toBe(before);
  });
});
