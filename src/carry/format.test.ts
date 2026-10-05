/* Progress carried from the old address: what the legacy site's pages write
   (src/carry/send.js, run here as the pages run it, from its own text) and what the new
   address makes of it (format.ts), with the site's own merge (BMAccount.merge, from
   assets/account.js run in a vm as tools/game/merge.test.js runs it). The browser half,
   two origins and the question on the page, is tools/game/carry.test.js. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { allowedHost, asked, check, decode, describe as describeIt, fingerprint, fromFile, legacyCarryUrl, MAX_FRAGMENT, plan, readHash, remember, summary, type Stores } from "./format.ts";
import { LEGACY, ORIGIN } from "./origins.ts";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

type Send = {
  collect(storage: unknown): { stores: Stores; count: number };
  encode(stores: Stores): Promise<string>;
  carried(key: string): boolean;
};
const send: Send = new Function(fs.readFileSync(path.join(ROOT, "src/carry/send.js"), "utf8") + "\nreturn BMCarrySend;")();

/* account.js as merge.test.js loads it: no page, no server, just the merge */
function loadMerge(): (a: Record<string, unknown>, b: Record<string, unknown>) => Record<string, unknown> {
  const noop = () => {};
  const win: Record<string, unknown> = {
    console, BM_CONFIG: {}, location: { hash: "", search: "", href: "file:///x/index.html" }, addEventListener: noop,
    localStorage: { getItem: () => null, setItem: noop },
    document: { querySelector: () => null, addEventListener: noop, visibilityState: "visible" },
    BMStore: {
      keys: { progress: "bm.progress.v1", play: "bm.play.v1", last: "bm.last", attempts: "bm.attempts.v1", activity: "bm.activity.v1", lesson: "bm.lesson.v1", game: "bm.game.v1", run: "bm.run.v1", prefs: "bm.prefs.v1" },
      read: (_k: string, f: unknown) => f, write: noop, on: noop, emit: noop
    },
    BMSite: { rootPrefix: () => "", escapeHtml: (s: unknown) => String(s) }
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "assets/account.js"), "utf8"), win, { filename: "account.js" });
  return (win.BMAccount as { merge: never }).merge;
}
const merge = loadMerge();

/* a Storage over a plain map, in insertion order */
function storage(entries: Record<string, string>) {
  const keys = Object.keys(entries);
  return { get length() { return keys.length; }, key: (i: number) => keys[i] ?? null, getItem: (k: string) => (k in entries ? entries[k] : null) };
}
function stored(state: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  Object.keys(state).forEach((k) => { out[k] = JSON.stringify(state[k]); });
  return out;
}
const value = (fragmentValue: string) => fragmentValue;
/* JSON with keys sorted, for comparing merges, which build records in their own key order */
function canon(x: unknown): string {
  if (Array.isArray(x)) return "[" + x.map(canon).join(",") + "]";
  if (x && typeof x === "object") return "{" + Object.keys(x).sort().map((k) => JSON.stringify(k) + ":" + canon((x as Record<string, unknown>)[k])).join(",") + "}";
  return JSON.stringify(x);
}

/* the saved-state fixture the upgrade suite seeds: a learner three chapters in */
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/state-v1.json"), "utf8")).storage as Record<string, unknown>;

/* A learner who has done everything: every exercise of the course tried and solved, with
   clues opened, every store as full as the site lets it get, a year of daily XP, every
   section placed in the review, and the device's own stores too. */
function everything(): Record<string, unknown> {
  const progress: Record<string, unknown> = {}, attempts: Record<string, unknown> = {}, play: Record<string, unknown> = {}, reached: Record<string, number> = {};
  const cmp: Record<string, unknown> = {}, enc: Record<string, unknown> = {}, sec: Record<string, unknown> = {}, sets: Record<string, unknown> = {};
  let t = Date.UTC(2026, 0, 1, 12);
  const files = fs.readdirSync(path.join(ROOT, "parts")).flatMap((d) => fs.readdirSync(path.join(ROOT, "parts", d)).map((f) => path.join(ROOT, "parts", d, f)));
  files.forEach((file) => {
    const html = fs.readFileSync(file, "utf8");
    const ch = /data-chapter="([^"]+)"/.exec(html)![1];
    const solved: Record<string, true> = {}, recs: Record<string, unknown> = {}, cmps: Record<string, 1> = {};
    const scored: string[] = [], inline: string[] = [];
    for (const m of html.matchAll(/<div class="ex"([^>]*)>/g)) {
      const id = /\bid="([^"]+)"/.exec(m[1])![1], isInline = /data-inline/.test(m[1]);
      const section = (/data-section="([^"]+)"/.exec(m[1]) || [])[1] || "practice";
      (isInline ? inline : scored).push(id);
      if (!isInline) { solved[id] = true; cmps[id] = 1; }
      recs[id] = { tries: 3, hints: 2, rung: 3, opened: 1, section, solved: (t += 61000), first: 0, ...(isInline ? { inline: 1 } : {}) };
      sec[ch + "#" + section] = { n: 40, ok: 31, box: 4, last: "2026-09-30", fix: t };
    }
    progress[ch] = { solved, total: scored.length };
    attempts[ch] = recs;
    cmp[ch] = cmps;
    const done: Record<string, true> = {};
    for (let i = 0; i < 12; i++) done["figure-" + i + ":" + (i % 3)] = true;
    play[ch] = { done, total: 12, guess: 2 };
    reached[ch] = 14;
    enc[ch + "/practice"] = { medal: 3, day: "2026-05-01" };
    enc[ch + "/review"] = { medal: 2, day: "2026-05-02" };
    sets[ch] = { practice: scored, inline };
  });
  const days: Record<string, number> = {}, daily: Record<string, 1> = {};
  for (let d = 0; d < 365; d++) days[new Date(Date.UTC(2025, 9, 6 + d)).toISOString().slice(0, 10)] = 30 + (d % 90);
  Object.keys(days).slice(-60).forEach((d) => { daily[d] = 1; });
  const ach: Record<string, number> = {};
  for (let i = 0; i < 40; i++) ach["achievement-" + i] = t + i;
  const best: Record<string, unknown> = {};
  ["standard", "daily", "boss", "repair", "review"].forEach((m, i) => { best[m] = { score: 1200 + i, hearts: 3, day: "2026-09-0" + (i + 1) }; });
  return {
    "bm.theme": "dark",
    "bm.progress.v1": progress, "bm.play.v1": play, "bm.attempts.v1": attempts,
    "bm.activity.v1": { days, goal: 60 }, "bm.lesson.v1": { reached, mode: "page" },
    "bm.last": { id: "ch16", section: "practice" },
    "bm.game.v1": { ach, cmp, sec, best, enc, daily, maxed: 212 },
    "bm.run.v1": { combo: { pips: 3, shield: true }, seen: { level: 30, ach: 1 }, sets, arena: null, paid: Array.from({ length: 30 }, (_, i) => "run-" + i), arenaDay: { day: "2026-10-05", sec: {}, finishes: 2 } },
    "bm.prefs.v1": { sound: true, calm: false, tempo: "extended", panel: "dark", volume: 40, motion: "reduce", gfx: "mid" }
  };
}

describe("what the old address sends", () => {
  it("takes every bm. key but the account binding and its own record, never a session or anything else", () => {
    const got = send.collect(storage({
      "bm.progress.v1": '{"ch01":{"solved":{"e1":true},"total":10}}',
      "bm.theme": '"dark"',
      "bm.sync.v1": '{"user":"u-1","resetAt":5}',
      "bm.carry.v1": '{"seen":{}}',
      "bm.sync.pending.v1": '{"u-1":{"email":"a@b.c","state":{}}}',
      "sb-jfidvrzonyzfstnykzly-auth-token": '{"access_token":"secret"}',
      "bm.x-auth-token": '"secret"',
      "other.app": '"hello"',
      "bm.prefs.v1": "{not json",
      "bm.future.v9": '{"kept":true}'
    }));
    expect(Object.keys(got.stores).sort()).toEqual(["bm.future.v9", "bm.progress.v1", "bm.sync.pending.v1", "bm.theme"]);
    expect(got.count).toBe(4);
    expect(JSON.stringify(got.stores)).not.toMatch(/secret|auth-token|"user"/);
  });

  it("carries Unicode and odd stored values through, compressed and not", async () => {
    const odd = {
      "bm.progress.v1": { "ch01": { solved: { "e1": true, "ünïcødé-é": true, "😀": true }, total: 2, note: "</script><b>x</b>    \u0000" } },
      "bm.last": null,
      "bm.lesson.v1": { reached: { ch01: 3 }, mode: "page", extra: [1, "two", null, { three: 3 }] },
      "bm.theme": "light"
    };
    const v = await send.encode(odd);
    expect(v).toMatch(/^1[zj][A-Za-z0-9_-]+$/);
    const out = await decode(value(v));
    expect(out).toEqual({ ok: true, stores: odd, ignored: [] });
    /* without CompressionStream the page sends it as it is, and that reads back too */
    const saved = (globalThis as Record<string, unknown>).CompressionStream;
    (globalThis as Record<string, unknown>).CompressionStream = undefined;
    try {
      const j = await send.encode(odd);
      expect(j.slice(0, 2)).toBe("1j");
      expect(await decode(j)).toEqual({ ok: true, stores: odd, ignored: [] });
    } finally { (globalThis as Record<string, unknown>).CompressionStream = saved; }
  });

  it("fits in an address for a learner three chapters in, and for one who has done everything", async () => {
    const small = await send.encode(send.collect(storage(stored(fixture))).stores);
    const big = await send.encode(send.collect(storage(stored(everything()))).stores);
    const rawBig = JSON.stringify(everything()).length;
    console.log("carried sizes: state-v1.json " + small.length + " characters (" + JSON.stringify(fixture).length + " bytes of JSON); everything tried " + big.length + " characters (" + rawBig + " bytes of JSON); limit " + MAX_FRAGMENT);
    expect(small.length).toBeLessThan(2000);
    expect(big.length).toBeLessThan(12000);
    expect(big.length).toBeLessThan(MAX_FRAGMENT);
    const back = await decode(big);
    expect(back.ok && summary(back.stores)).toMatchObject({ chapters: 17, solved: 206 });
  });

  it("is too long for an address when the stores are larger than any the site writes", async () => {
    const noise: Record<string, string> = {};
    let s = 7;
    for (let i = 0; i < 3000; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; noise["k" + i] = s.toString(36) + (s * 7).toString(36); }
    const v = await send.encode({ "bm.progress.v1": { ch01: { solved: noise, total: 1 } } });
    expect(v.length).toBeGreaterThan(MAX_FRAGMENT);
    expect(await decode(v)).toEqual({ ok: false, why: "size" });
  });
});

describe("what the new address reads", () => {
  const pack = (payload: unknown) => "1j" + Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  async function deflate(text: string) {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return "1z" + Buffer.from(await new Response(stream).arrayBuffer()).toString("base64url");
  }

  it("refuses another format, by its first character or by v", async () => {
    expect(await decode("2zAAAA")).toEqual({ ok: false, why: "version" });
    expect(await decode(pack({ v: 2, s: {} }))).toEqual({ ok: false, why: "version" });
    expect(await decode(pack({ v: "1", s: {} }))).toEqual({ ok: false, why: "malformed" });
  });

  it("refuses what is not one, and never throws", async () => {
    for (const bad of ["", "x", "1", "1q" + "abcd", "1j***", "1jA", "1j" + Buffer.from("not json").toString("base64url"), "1z" + "abcd", pack([1, 2]), pack({ v: 1 }), pack({ v: 1, s: [] })]) {
      const out = await decode(bad);
      expect(out.ok, bad).toBe(false);
    }
  });

  it("refuses the whole payload when it holds a key that is not the site's", async () => {
    for (const k of ["sb-abc-auth-token", "other", "bm.x-auth-token", "BM.progress.v1"]) {
      expect(await decode(pack({ v: 1, s: { "bm.progress.v1": {}, [k]: "x" } })), k).toEqual({ ok: false, why: "keys" });
    }
  });

  it("refuses a small fragment that inflates into a large one, and nesting past the cap", async () => {
    const bomb = JSON.stringify({ v: 1, s: { "bm.progress.v1": { ch01: { solved: {}, total: 0, pad: "0".repeat(3000000) } } } });
    const v = await deflate(bomb);
    expect(v.length).toBeLessThan(MAX_FRAGMENT);
    expect(await decode(v)).toEqual({ ok: false, why: "size" });
    let deep: unknown = 1;
    for (let i = 0; i < 40; i++) deep = { d: deep };
    expect(await decode(pack({ v: 1, s: { "bm.progress.v1": { ch01: deep } } }))).toEqual({ ok: false, why: "size" });
  });

  it("leaves out a store of the wrong shape and a key it does not take, and says so", () => {
    const out = check({ "bm.progress.v1": [1, 2], "bm.last": "ch01", "bm.theme": "purple", "bm.prefs.v1": { sound: true }, "bm.future.v9": {}, "bm.sync.v1": { user: "u" }, "bm.lesson.v1": { reached: {} } });
    expect(out).toEqual({ ok: true, stores: { "bm.prefs.v1": { sound: true }, "bm.lesson.v1": { reached: {} } }, ignored: ["bm.future.v9", "bm.last", "bm.progress.v1", "bm.sync.v1", "bm.theme"] });
  });

  it("takes __proto__ out at every level", async () => {
    const out = await decode("1j" + Buffer.from('{"v":1,"s":{"bm.progress.v1":{"__proto__":{"x":1},"ch01":{"solved":{"__proto__":true,"e1":true},"total":1}}}}').toString("base64url"));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const p = out.stores["bm.progress.v1"] as Record<string, Record<string, unknown>>;
    expect(Object.keys(p)).toEqual(["ch01"]);
    expect(Object.keys(p.ch01.solved as object)).toEqual(["e1"]);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it("reads the fragment and the old page's own anchor", () => {
    expect(readHash("#bm-carry=1zAbC&bm-at=" + encodeURIComponent("integers é"))).toEqual({ value: "1zAbC", at: "integers é" });
    expect(readHash("#bm-carry=1jAA")).toEqual({ value: "1jAA", at: "" });
    expect(readHash("#integers")).toBeNull();
    expect(readHash("")).toBeNull();
  });

  it("is read only at the new address, a local server and the project's pages.dev addresses", () => {
    expect(allowedHost(new URL(ORIGIN).hostname)).toBe(true);
    ["localhost", "127.0.0.1", "groupupmath.pages.dev", "abc123.groupupmath.pages.dev", "move-to-cloudflare.groupupmath.pages.dev"].forEach((h) => expect(allowedHost(h), h).toBe(true));
    [new URL(LEGACY).hostname, "evil.example", "pages.dev.evil.example", "learn.groupupmath.org.evil.example", ""].forEach((h) => expect(allowedHost(h), h).toBe(false));
    expect(legacyCarryUrl("/progress")).toBe(LEGACY + "carry/?to=%2Fprogress");
  });

  it("says what it holds", () => {
    expect(describeIt(summary(fixture))).toMatch(/^3 chapters, 23 exercises solved and \d+ XP and your settings\.$|^3 chapters, 23 exercises solved, \d+ XP and your settings\.$/);
    expect(describeIt(summary({ "bm.theme": "dark" }))).toBe("Your settings.");
    expect(describeIt(summary({}))).toBe("Nothing that changes your progress.");
  });
});

describe("the merge into this browser", () => {
  const here: Record<string, unknown> = {
    "bm.progress.v1": { ch01: { solved: { e1: true, e2: true }, total: 10 }, ch09: { solved: { e4: true }, total: 8 } },
    "bm.attempts.v1": { ch01: { e1: { tries: 1, first: 1, solved: 100 } } },
    "bm.activity.v1": { days: { "2026-10-01": 50 }, goal: 40 },
    "bm.last": { id: "ch09", section: null },
    "bm.lesson.v1": { reached: { ch09: 2 }, mode: "steps" },
    "bm.prefs.v1": { sound: false, calm: true },
    "bm.sync.pending.v1": { "u-1": { email: "a@b.c", via: ["github"], resetAt: 3, state: { progress: { ch02: { solved: { e9: true }, total: 10 } } }, at: 10 } }
  };
  const read = (state: Record<string, unknown>) => (k: string) => (k in state ? JSON.parse(JSON.stringify(state[k])) : undefined);

  it("never loses either side, keeps this browser's choices, and fills only absent device stores", () => {
    const carried = JSON.parse(JSON.stringify(fixture)) as Stores;
    carried["bm.sync.pending.v1"] = { "u-1": { email: "", via: ["google"], resetAt: 7, state: { progress: { ch03: { solved: { e1: true }, total: 9 } } }, at: 20 }, "u-2": { email: "x@y.z", state: {} } };
    const writes = plan(read(here), carried, merge);
    const p = writes["bm.progress.v1"] as Record<string, { solved: Record<string, true>; total: number }>;
    const fp = fixture["bm.progress.v1"] as Record<string, { solved: Record<string, true> }>;
    /* everything on each side is there */
    Object.keys(fp).forEach((ch) => Object.keys(fp[ch].solved).forEach((k) => expect(p[ch].solved[k], ch + " " + k).toBe(true)));
    expect(p.ch01.solved.e2).toBe(true);
    expect(p.ch09.solved.e4).toBe(true);
    const a = writes["bm.attempts.v1"] as Record<string, Record<string, Record<string, unknown>>>;
    expect(a.ch01.e1.solved).toBe(100);
    /* where the two simply disagree, this browser keeps its own */
    expect(writes["bm.last"]).toEqual({ id: "ch09", section: null });
    expect((writes["bm.activity.v1"] as Record<string, unknown>).goal).toBe(40);
    expect((writes["bm.lesson.v1"] as Record<string, unknown>).mode).toBe("steps");
    expect((writes["bm.activity.v1"] as { days: Record<string, number> }).days["2026-10-01"]).toBe(50);
    /* device stores: this browser's settings stay, the theme it lacked arrives */
    expect("bm.prefs.v1" in writes).toBe(false);
    expect(writes["bm.theme"]).toBe(fixture["bm.theme"]);
    /* set-aside progress, per reader */
    const pend = writes["bm.sync.pending.v1"] as Record<string, Record<string, unknown>>;
    expect(pend["u-1"]).toMatchObject({ email: "a@b.c", via: ["github", "google"], resetAt: 7, at: 20 });
    const pstate = pend["u-1"].state as { progress: Record<string, unknown> };
    expect(Object.keys(pstate.progress).sort()).toEqual(["ch02", "ch03"]);
    expect(pend["u-2"]).toEqual({ email: "x@y.z", state: {} });
    /* and carrying the same again changes nothing more (the first time may fill in a
       record's known fields, as any merge does) */
    const after = { ...here, ...writes };
    const twice = { ...after, ...plan(read(after), carried, merge) };
    const again = plan(read(twice), carried, merge);
    Object.keys(again).forEach((k) => expect(canon(again[k]), k).toBe(canon(twice[k])));
    ["bm.progress.v1", "bm.attempts.v1", "bm.play.v1", "bm.game.v1"].forEach((k) => expect(canon(twice[k]), k).toBe(canon(after[k])));
  });

  it("writes only the stores that were carried", () => {
    expect(Object.keys(plan(read(here), { "bm.theme": "dark" }, merge))).toEqual(["bm.theme"]);
    expect(Object.keys(plan(read({}), { "bm.prefs.v1": { sound: true } }, merge))).toEqual(["bm.prefs.v1"]);
    expect(plan(read(here), { "bm.prefs.v1": { sound: true } }, merge)).toEqual({});
  });
});

describe("a file of progress", () => {
  it("reads what Download my data writes, passing over the account's details", () => {
    const exported = { progress: fixture["bm.progress.v1"], play: fixture["bm.play.v1"], attempts: {}, activity: { days: {} }, lesson: { reached: {} }, last: null, game: {}, exported: "2026-10-05T12:00:00.000Z", account: "a@b.c", signInWith: ["github"], profile: { name: "A" } };
    const out = fromFile(JSON.stringify(exported, null, 2));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(Object.keys(out.stores).sort()).toEqual(["bm.activity.v1", "bm.attempts.v1", "bm.game.v1", "bm.last", "bm.lesson.v1", "bm.play.v1", "bm.progress.v1"]);
    expect(JSON.stringify(out.stores)).not.toMatch(/a@b\.c|github/);
  });

  it("reads what the old address's carry page offers, with the device's stores", () => {
    const file = { format: "basic-mathematics-progress", v: 1, progress: fixture["bm.progress.v1"], device: { "bm.theme": "dark", "bm.prefs.v1": { sound: true } } };
    const out = fromFile(JSON.stringify(file));
    expect(out.ok && Object.keys(out.stores).sort()).toEqual(["bm.prefs.v1", "bm.progress.v1", "bm.theme"]);
  });

  it("refuses anything else", () => {
    expect(fromFile("not json")).toEqual({ ok: false, why: "malformed" });
    expect(fromFile("[]")).toEqual({ ok: false, why: "malformed" });
    expect(fromFile("{}")).toEqual({ ok: false, why: "malformed" });
    expect(fromFile(JSON.stringify({ format: "something-else", progress: {} }))).toEqual({ ok: false, why: "malformed" });
    expect(fromFile(JSON.stringify({ format: "basic-mathematics-progress", v: 2, progress: {} }))).toEqual({ ok: false, why: "version" });
    expect(fromFile(JSON.stringify({ progress: {}, device: { "sb-x-auth-token": "t" } }))).toEqual({ ok: false, why: "keys" });
    expect(fromFile(JSON.stringify({ progress: {}, device: { "bm.progress.v1": {} } }))).toEqual({ ok: false, why: "keys" });
  });
});

describe("the record of what was asked", () => {
  it("remembers a payload once answered, the newest twenty", () => {
    let flag: unknown = null;
    for (let i = 0; i < 25; i++) flag = remember(flag, fingerprint("payload " + i), i % 2 === 0, 1000 + i);
    expect(asked(flag, fingerprint("payload 24"))).toBe(true);
    expect(asked(flag, fingerprint("payload 4"))).toBe(false);
    expect(Object.keys((flag as { seen: object }).seen)).toHaveLength(20);
    expect(asked(null, "x")).toBe(false);
    expect(asked({ seen: "garbage" }, "x")).toBe(false);
    expect(fingerprint("a")).not.toBe(fingerprint("b"));
  });
});
