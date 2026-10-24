import { describe, expect, it } from "vitest";
import { mergePet, WEAR_AT_MAX } from "../sync/merge.ts";
import { DECOR_SIZE, itemOf, PET_ITEMS, priceOf } from "../data/pet-items.ts";
import {
  applyAct, balance, buy, canAct, feedSnack, ownsToy, placeDecor, placedDecor, spendId, DECOR_MAX, canBuy, capKeys, careOf, carePoints, DRIFT, earnAmount, EARNED_MAX, giftTaken, growthPoints, heartsOf, laterStamp,
  newlyGrown, growPet, GROWTH_MORPHS, STAGE_LOOK, STAGES, PLAY_PER_DAY, prunePet, PRUNE_CARE_DAYS, REVIEW_CAP_IDS, SPENT_MAX, stageOf, START_HEARTS, touch
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

describe("acts", () => {
  const day = "2025-03-04", now = Date.UTC(2025, 2, 4, 12);
  const toy = { "toy:ball": "2025-01-01" };
  it("feed adds a tummy heart, bumps the pellet and sets the gift; play adds a play heart", () => {
    const a = applyAct({ needs: { tummy: { n: 3, at: now } } }, "feed", day, now) as any;
    expect(heartsOf("tummy", a.needs.tummy, now)).toBe(4);
    expect(a.care[day].feed.pellet).toBe(1);
    expect(a.gift[day]).toBe(1);
    expect(a.v).toBe(1);
    const b = applyAct({ owned: toy, needs: { play: { n: 2, at: now } } }, "play", day, now) as any;
    expect(heartsOf("play", b.needs.play, now)).toBe(3);
    expect(b.care[day].play).toBe(1);
  });
  it("clean fills to five; hearts never pass five", () => {
    const c = applyAct({ needs: { clean: { n: 2, at: now } } }, "clean", day, now) as any;
    expect(heartsOf("clean", c.needs.clean, now)).toBe(5);
    expect(c.care[day].clean).toBe(1);
    const f = applyAct({ needs: { tummy: { n: 5, at: now } } }, "feed", day, now) as any;
    expect(heartsOf("tummy", f.needs.tummy, now)).toBe(5);
  });
  it("a second feed on the same day is refused as gift-taken, with the same record back", () => {
    const a = applyAct({}, "feed", day, now);
    expect(canAct(a, "feed", day, now)).toEqual({ ok: false, why: "gift-taken" });
    expect(applyAct(a, "feed", day, now)).toBe(a);
    expect(canAct(a, "feed", "2025-03-05", now).ok).toBe(true);
  });
  it("four plays give three", () => {
    let p: any = { owned: toy };
    for (let i = 0; i < 4; i++) p = applyAct(p, "play", day, now);
    expect(p.care[day].play).toBe(PLAY_PER_DAY);
    expect(canAct(p, "play", day, now)).toEqual({ ok: false, why: "play-cap" });
  });
  it("clean at five hearts is refused", () => {
    const p = { needs: { clean: { n: 5, at: now } } };
    expect(canAct(p, "clean", day, now)).toEqual({ ok: false, why: "clean-full" });
    expect(applyAct(p, "clean", day, now)).toBe(p);
  });
  it("a damaged record still yields a valid record", () => {
    const out = applyAct({ needs: "x", care: [1], gift: 5 }, "feed", day, now) as any;
    expect(out.care[day].feed.pellet).toBe(1);
    expect(heartsOf("tummy", out.needs.tummy, now)).toBe(4);
    expect(out.gift[day]).toBe(1);
    expect(applyAct({ owned: toy, care: 7 }, "play", day, now).care?.[day]).toEqual({ play: 1 });
  });
  it("is pure: the input is untouched", () => {
    const p = { needs: { tummy: { n: 3, at: now } }, care: { [day]: { play: 1 } } };
    const before = JSON.stringify(p);
    applyAct(p, "play", day, now);
    applyAct(p, "feed", day, now);
    expect(JSON.stringify(p)).toBe(before);
  });
  it("two devices that each feed once the same day merge to pellet 1", () => {
    const a = applyAct({}, "feed", day, now), b = applyAct({}, "feed", day, now + 5);
    const m = mergePet(a, b) as any;
    expect(m.care[day].feed.pellet).toBe(1);
    expect(m.gift[day]).toBe(1);
    const x = applyAct({ owned: toy }, "play", day, now), y = applyAct(applyAct({ owned: toy }, "play", day, now), "play", day, now);
    expect((mergePet(x, y) as any).care[day].play).toBe(2);
  });
});

describe("the shop", () => {
  const day = "2025-03-04", now = Date.UTC(2025, 2, 4, 12);
  const rich = (n = 5) => ({ earned: Object.fromEntries(Array.from({ length: n }, (_, i) => ["strong:s" + i, 1])) });   // 20 each
  const ball = itemOf("toy:ball")!, castle = itemOf("decor:castle")!, berry = itemOf("snack:berry-bite")!, kelp = itemOf("snack:kelp-chip")!;
  it("the catalogue: eleven items, namespaced ids, fixed prices, decor cells and bottom-band spots that never overlap", () => {
    expect(PET_ITEMS.map((i) => i.id + "=" + i.price)).toEqual([
      "snack:kelp-chip=5", "snack:shrimp-puff=8", "snack:berry-bite=12", "toy:ball=25", "toy:ring=40", "toy:boat=60",
      "decor:plant=30", "decor:rock=20", "decor:shell=35", "decor:chest=80", "decor:castle=120"
    ]);
    PET_ITEMS.forEach((i) => expect(i.id.startsWith(i.kind + ":")).toBe(true));
    expect(PET_ITEMS.filter((i) => i.kind === "snack").map((i) => i.hearts)).toEqual([1, 2, 3]);
    const d = PET_ITEMS.filter((i) => i.kind === "decor");
    expect(d.map((i) => i.cell)).toEqual([0, 1, 2, 3, 4]);
    const xs = d.map((i) => i.pos!.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(DECOR_SIZE);
    expect(xs[xs.length - 1] + DECOR_SIZE).toBeLessThanOrEqual(100);
    expect(priceOf("toy:ball")).toBe(25);
    expect(priceOf("toy:nope")).toBe(0);
    expect(priceOf(5)).toBe(0);
    expect(itemOf("__proto__")).toBeUndefined();
  });
  it("spendId: k counts the ids of the same prefix, day, item and device", () => {
    expect(spendId("buy", day, "toy:ball", "dev00001", {})).toBe("buy:2025-03-04:toy:ball:dev00001:1");
    const spent = { "buy:2025-03-04:toy:ball:dev00001:1": 25 };
    expect(spendId("buy", day, "toy:ball", "dev00001", spent)).toBe("buy:2025-03-04:toy:ball:dev00001:2");
    expect(spendId("buy", day, "toy:ball", "dev00002", spent)).toBe("buy:2025-03-04:toy:ball:dev00002:1");
    expect(spendId("buy", "2025-03-05", "toy:ball", "dev00001", spent)).toBe("buy:2025-03-05:toy:ball:dev00001:1");
    expect(spendId("feed", day, "toy:ball", "dev00001", spent)).toBe("feed:2025-03-04:toy:ball:dev00001:1");
    expect(spendId("buy", day, "toy:ball", "dev00001", "junk")).toBe("buy:2025-03-04:toy:ball:dev00001:1");
  });
  it("buy writes the spend at the item's price and owns a toy from that day; the balance falls by the price", () => {
    const p = rich();
    const out = buy(p, ball, day, "dev00001") as any;
    expect(out.spent).toEqual({ "buy:2025-03-04:toy:ball:dev00001:1": 25 });
    expect(out.owned).toEqual({ "toy:ball": day });
    expect(balance(out)).toBe(75);
    expect(ownsToy(out)).toBe(true);
    expect(ownsToy(p)).toBe(false);
  });
  it("a one-time item is not bought twice on one device", () => {
    const once = buy(rich(), ball, day, "dev00001");
    expect(buy(once, ball, day, "dev00001")).toBeNull();
    expect(buy(once, ball, "2025-03-09", "dev00001")).toBeNull();
  });
  it("buy refuses a snack, an unsellable item and a price the record does not cover", () => {
    expect(buy(rich(), berry, day, "dev00001")).toBeNull();
    expect(buy(rich(), { id: "toy:x", kind: "toy", name: "X", price: 0 }, day, "dev00001")).toBeNull();
    expect(buy(rich(), { id: "toy:x", kind: "toy", name: "X", price: -5 }, day, "dev00001")).toBeNull();
    expect(buy(rich(), { id: "decor:x", kind: "toy", name: "X", price: 5 }, day, "dev00001")).toBeNull();
    expect(buy(rich(), { id: "toy:x", kind: "bad" as any, name: "X", price: 5 }, day, "dev00001")).toBeNull();
    expect(buy(rich(1), itemOf("toy:ring")!, day, "dev00001")).toBeNull();
    expect(buy({}, ball, day, "dev00001")).toBeNull();
  });
  it("canBuy is false at a negative balance even for a price of 5", () => {
    const p = { earned: { "strong:a": 1 }, spent: { "buy:2025-03-04:toy:ball:dev00001:1": 50 } };
    expect(balance(p)).toBe(-30);
    expect(canBuy(p, 5)).toBe(false);
    expect(buy(p, ball, day, "dev00002")).toBeNull();
    expect(feedSnack(p, kelp, day, "dev00002", now)).toBeNull();
  });
  it("two devices buying the same toy merge to one owned (the earlier day), two spends and a balance down by both", () => {
    const base = rich();
    const a = buy(base, ball, day, "dev00001")!, b = buy(base, ball, "2025-03-03", "dev00002")!;
    const m = mergePet(a, b) as any;
    expect(m.owned).toEqual({ "toy:ball": "2025-03-03" });
    expect(Object.keys(m.spent).sort()).toEqual(["buy:2025-03-03:toy:ball:dev00002:1", "buy:2025-03-04:toy:ball:dev00001:1"]);
    expect(balance(m)).toBe(100 - 50);
    expect(mergePet(b, a)).toEqual(m);
  });
  it("both devices spending offline can leave the balance negative: nothing is revoked and buying waits for earns", () => {
    const base = { earned: { "strong:a": 1 } };   // 20
    const a = buy(base, itemOf("toy:ring")!, day, "dev00001");
    expect(a).toBeNull();
    const x = buy(base, itemOf("decor:rock")!, day, "dev00001")!, y = buy(base, itemOf("decor:rock")!, day, "dev00002")!;
    const m = mergePet(x, y) as any;
    expect(balance(m)).toBe(-20);
    expect(m.owned["decor:rock"]).toBe(day);
    expect(canBuy(m, 5)).toBe(false);
    const earned = { ...m, earned: { ...m.earned, "strong:b": 1, "strong:c": 1 } };
    expect(balance(earned)).toBe(20);
    expect(canBuy(earned, 20)).toBe(true);
  });
  it("feedSnack spends, counts the snack and lifts Tummy; a full Tummy returns null; the pellet stays free", () => {
    const p = { ...rich(), needs: { tummy: { n: 2, at: now } } };
    const out = feedSnack(p, berry, day, "dev00001", now) as any;
    expect(out.spent).toEqual({ "feed:2025-03-04:snack:berry-bite:dev00001:1": 12 });
    expect(out.care[day].feed["snack:berry-bite"]).toBe(1);
    expect(heartsOf("tummy", out.needs.tummy, now)).toBe(5);
    expect(balance(out)).toBe(88);
    expect(out.owned || {}).toEqual({});
    expect(feedSnack(out, berry, day, "dev00001", now)).toBeNull();
    const two = feedSnack({ ...p, needs: { tummy: { n: 1, at: now } } }, kelp, day, "dev00001", now) as any;
    const again = feedSnack(two, kelp, day, "dev00001", now) as any;
    expect(Object.keys(again.spent)).toEqual(["feed:2025-03-04:snack:kelp-chip:dev00001:1", "feed:2025-03-04:snack:kelp-chip:dev00001:2"]);
    expect(again.care[day].feed["snack:kelp-chip"]).toBe(2);
    expect(feedSnack(rich(), ball, day, "dev00001", now)).toBeNull();
    expect(applyAct({}, "feed", day, now).gift?.[day]).toBe(1);
  });
  it("placeDecor places and removes owned decor only, stamps the wear later, and caps at DECOR_MAX", () => {
    const owned = buy(rich(7), castle, day, "dev00001")!;
    expect(placeDecor(owned, "decor:rock", true, now)).toBe(owned);
    expect(placeDecor(owned, "toy:ball", true, now)).toBe(owned);
    expect(placeDecor(owned, 5 as any, true, now)).toBe(owned);
    const on = placeDecor(owned, "decor:castle", true, now) as any;
    expect(on.wear.decor).toEqual(["decor:castle"]);
    expect(on.wear.at).toBe(now);
    expect(placeDecor(on, "decor:castle", true, now + 1)).toBe(on);
    const off = placeDecor(on, "decor:castle", false, now + 5) as any;
    expect(off.wear.decor).toEqual([]);
    expect(off.wear.at).toBe(now + 5);
    expect(placedDecor(on)).toEqual(["decor:castle"]);
    const crowded = { ...owned, wear: { decor: Array.from({ length: DECOR_MAX }, (_, i) => "decor:x" + i), at: now } };
    const placedNow = placeDecor(crowded, "decor:castle", true, now + 1) as any;
    expect(placedNow.wear.decor).toEqual(["decor:castle"]);   // forged, unowned ids are dropped
    const ahead = placeDecor({ ...owned, wear: { decor: [], at: now + 9000 } }, "decor:castle", true, now) as any;
    expect(ahead.wear.at).toBe(now + 9001);
  });
  it("play needs a toy", () => {
    expect(canAct({}, "play", day, now)).toEqual({ ok: false, why: "no-toy" });
    expect(applyAct({}, "play", day, now)).toEqual({});
    const p = buy(rich(), ball, day, "dev00001")!;
    expect(canAct(p, "play", day, now)).toEqual({ ok: true, why: "" });
    expect(ownsToy({ owned: { "decor:rock": day } })).toBe(false);
    expect(ownsToy({ owned: { "toy:ring": 5 } })).toBe(false);
  });
  it("play needs no toy when the shop is off (opts.toy false); the default still refuses", () => {
    expect(canAct({}, "play", day, now, { toy: false })).toEqual({ ok: true, why: "" });
    expect(canAct({}, "play", day, now, {})).toEqual({ ok: false, why: "no-toy" });
    expect((applyAct({}, "play", day, now, { toy: false }) as any).care[day].play).toBe(1);
    expect(applyAct({}, "play", day, now)).toEqual({});
  });
  it("placeDecor at DECOR_MAX owned decor returns the same record, and drops placed ids that are not owned", () => {
    const owned: Record<string, string> = {};
    const ids = Array.from({ length: DECOR_MAX }, (_, i) => "decor:x" + i);
    ids.forEach((i) => { owned[i] = day; });
    owned["decor:castle"] = day;
    const full = { owned, wear: { decor: ids, at: now } };
    expect(placeDecor(full, "decor:castle", true, now + 1)).toBe(full);
    const junk = { owned: { "decor:castle": day }, wear: { decor: ids, at: now } };
    const out = placeDecor(junk, "decor:castle", true, now + 1) as any;
    expect(out.wear.decor).toEqual(["decor:castle"]);
  });
  it("every helper is pure: the input is untouched", () => {
    const p = { ...rich(7), needs: { tummy: { n: 2, at: now } }, owned: { "decor:castle": day }, wear: { decor: [] as string[], at: 5 } };
    const before = JSON.stringify(p);
    buy(p, ball, day, "dev00001");
    feedSnack(p, berry, day, "dev00001", now);
    placeDecor(p, "decor:castle", true, now);
    spendId("buy", day, "toy:ball", "dev00001", p.earned);
    expect(JSON.stringify(p)).toBe(before);
  });
  it("what was written survives prunePet and a merge with nothing", () => {
    let p: any = rich(10);
    p = buy(p, ball, day, "dev00001");
    p = buy(p, castle, day, "dev00001");
    p = placeDecor(p, "decor:castle", true, now);
    p = feedSnack({ ...p, needs: { tummy: { n: 1, at: now } } }, kelp, day, "dev00001", now);
    expect(prunePet(p)).toEqual(p);
    expect(mergePet(p, {})).toEqual(prunePet(p));
    expect(balance(p)).toBe(200 - 25 - 120 - 5);
  });
  it("prices are never read from the record: a huge spend is clamped, a forged owned only grants a cosmetic", () => {
    expect(balance({ earned: { "strong:a": 1 }, spent: { "buy:2025-03-04:toy:ball:dev00001:1": 1e9 } })).toBe(20 - 1000);
    expect(balance({ earned: { "strong:a": 1 }, spent: { "buy:2025-03-04:toy:ball:dev00001:1": -500 } })).toBe(20);
    expect(balance({ earned: { "strong:a": 1 }, owned: { "decor:castle": day } })).toBe(20);
  });
});

describe("growth: the look and growPet", () => {
  const care8 = { "2026-10-01": { feed: { pellet: 1 }, play: 1, clean: 1, spark: 1 }, "2026-10-02": { feed: { pellet: 1 }, play: 1, clean: 1, spark: 1 } };
  const xp8 = { days: { "2026-10-01": 10, "2026-10-02": 10 } };

  it("the look table has every stage, scales rise and every morph weight is in [0, 1]", () => {
    expect(Object.keys(STAGE_LOOK)).toEqual([...STAGES]);
    let prev = 0;
    STAGES.forEach((s) => {
      expect(STAGE_LOOK[s].scale).toBeGreaterThan(prev);
      prev = STAGE_LOOK[s].scale;
      Object.entries(STAGE_LOOK[s].morphs).forEach(([name, wt]) => {
        expect(GROWTH_MORPHS as readonly string[]).toContain(name);
        expect(wt).toBeGreaterThanOrEqual(0);
        expect(wt).toBeLessThanOrEqual(1);
      });
    });
    expect(STAGE_LOOK.hatchling.scale).toBe(0.8);
    expect(STAGE_LOOK.elder.scale).toBe(1.1);
  });
  it("stamps fry at 8 points and never stamps it again", () => {
    const pet = { v: 1, care: care8 };
    const a = growPet(pet, xp8, 1000);
    expect(a.grown).toEqual(["fry"]);
    expect(a.pet.grew!.fry).toBe(1000);
    const b = growPet(a.pet, xp8, 5000);
    expect(b.grown).toEqual([]);
    expect(b.pet).toBe(a.pet);
    expect(b.pet.grew!.fry).toBe(1000);
  });
  it("writes nothing below the first stage", () => {
    const pet = { v: 1, care: { "2026-10-01": care8["2026-10-01"] } };
    const r = growPet(pet, xp8, 1000);
    expect(r.grown).toEqual([]);
    expect(r.pet).toBe(pet);
  });
  it("a stamped stage survives when the care window later prunes", () => {
    const a = growPet({ v: 1, care: care8 }, xp8, 1000);
    const later = prunePet({ ...a.pet, care: {} });
    expect(growthPoints(later, xp8)).toBe(0);
    expect(stageOf(growthPoints(later, xp8), later.grew)).toBe("fry");
    expect(growPet(later, xp8, 9000).grown).toEqual([]);
  });
  it("T7: a day with care but no XP adds no point and no stage", () => {
    const r = growPet({ v: 1, care: care8 }, { days: { "2026-10-01": 0 } }, 1000);
    expect(r.grown).toEqual([]);
    expect(stageOf(growthPoints({ care: care8 }, { days: {} }), r.pet.grew)).toBe("hatchling");
  });
  it("stamps several stages at once, in order, without hatchling", () => {
    const care: any = {}, days: any = {};
    for (let i = 0; i < 8; i++) { const d = dayAt(i); care[d] = care8["2026-10-01"]; days[d] = 5; }
    expect(growPet({ v: 1, care }, { days }, 7).grown).toEqual(["fry", "juvenile"]);
  });
  it("is pure: the input is untouched and a second call gives an equal result", () => {
    const pet = { v: 1, care: care8, grew: {} };
    const snap = JSON.stringify(pet);
    const a = growPet(pet, xp8, 1000), b = growPet(pet, xp8, 1000);
    expect(JSON.stringify(pet)).toBe(snap);
    expect(a.pet).not.toBe(pet);
    expect(a).toEqual(b);
  });
  it("mergePet keeps the earliest stamp of two devices", () => {
    const a = growPet({ v: 1, care: care8 }, xp8, 900).pet, b = growPet({ v: 1, care: care8 }, xp8, 400).pet;
    expect(mergePet(a, b).grew.fry).toBe(400);
    expect(mergePet(b, a).grew.fry).toBe(400);
  });
});
