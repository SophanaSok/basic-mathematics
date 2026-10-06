/* Progress carried from the old address: what the legacy site's pages write
   (src/carry/send.js, run here as the pages run it, from its own text) and what the new
   address makes of it (format.ts), with the site's own merge (BMAccount.merge, from
   assets/account.js run in a vm as tools/game/merge.test.js runs it). The browser half,
   two origins and the question on the page, is tools/game/carry.test.js. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { allowedHost, asked, check, decode, describe as describeIt, fingerprint, fromFile, legacyCarryUrl, MAX_FRAGMENT, plan, readHash, remember, safeAt, summary, type Owner, type Stores } from "./format.ts";
import { LEGACY, ORIGIN } from "./origins.ts";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

type Send = {
  collect(storage: unknown): { stores: Stores; count: number; owner: Owner | null };
  encode(stores: Stores, owner?: Owner | null): Promise<string>;
  carried(key: string): boolean;
  anchor(hash: string): string;
};
const send: Send = new Function(fs.readFileSync(path.join(ROOT, "src/carry/send.js"), "utf8") + "\nreturn BMCarrySend;")();
/* the legacy carry page (src/carry/page.js), as it is inlined after send.js */
const page: { pathFrom(search: string, origin: string): string; file(stores: Stores, from: string, owner: Owner | null): unknown } =
  new Function(fs.readFileSync(path.join(ROOT, "src/carry/page.js"), "utf8") + "\nreturn BMCarryPage;")();

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

/* a progress or play store as it arrives: every chapter's total is not taken */
function noTotals(store: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(store as Record<string, Record<string, unknown>>).forEach(([ch, r]) => { const { total: _, ...rest } = r; out[ch] = rest; });
  return out;
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
    /* the account the progress belongs to goes beside it, its id and reset alone */
    expect(got.owner).toEqual({ user: "u-1", resetAt: 5 });
    expect(send.collect(storage({ "bm.theme": '"dark"' })).owner).toBeNull();
    expect(send.collect(storage({ "bm.theme": '"dark"', "bm.sync.v1": '{"user":"<b>x</b>"}' })).owner).toBeNull();
  });

  it("leaves out what the new address never keeps: the Arena answer being typed, and set-aside emails", () => {
    const got = send.collect(storage(stored({
      "bm.run.v1": { arena: { cur: { given: "TYPED-BY-READER 42" } }, combo: { pips: 2 } },
      "bm.sync.pending.v1": { "u-9": { email: "someone@example.com", via: ["github"], resetAt: 0, state: { progress: { ch03: { solved: { e2: true } } } }, at: 5 } }
    })));
    expect(JSON.stringify(got.stores)).not.toMatch(/TYPED-BY-READER|someone@example\.com|"arena"|"email"/);
    expect(got.stores["bm.run.v1"]).toEqual({ combo: { pips: 2 } });
    expect(got.stores["bm.sync.pending.v1"]).toEqual({ "u-9": { via: ["github"], resetAt: 0, state: { progress: { ch03: { solved: { e2: true } } } }, at: 5 } });
    /* and the file the carry page offers is made from the same */
    expect(JSON.stringify(page.file(got.stores, "x", null))).not.toMatch(/TYPED-BY-READER|someone@example\.com/);
  });

  it("sends the carry page's reader to a single path at the new address and nowhere else", () => {
    const o = "https://learn.example";
    expect(page.pathFrom("?to=%2Fprogress%3Fx%3D1", o)).toBe("/progress?x=1");
    ["?to=//evil.example/", "?to=/%5Cevil.example/", "?to=https://evil.example/", "?to=javascript:alert(1)",
      "?to=/%09/evil.example", "?to=/%0a/evil.example", "?to=/%0d/evil.example", "?to=%09//evil.example", "?to=/%7F/x", "?to=%E0%A4%A"]
      .forEach((q) => expect(page.pathFrom(q, o), q).toBe("/"));
  });

  it("never sends on an old fragment that is itself a payload", () => {
    expect(send.anchor("#integers")).toBe("integers");
    expect(send.anchor("#bm-carry=1jAAAA")).toBe("");
    expect(send.anchor("#x&bm-at=bm-carry%3D1j")).toBe("");
    expect(send.anchor("#" + "a".repeat(300))).toBe("");
  });

  it("carries Unicode and odd stored values through, compressed and not, and only what the site writes", async () => {
    const odd = {
      "bm.progress.v1": { "ch01": { solved: { "e1": true, "ünïcødé-é": true, "😀": true }, total: 2, note: "</script><b>x</b>    \u0000" } },
      "bm.last": null,
      "bm.lesson.v1": { reached: { "chäpter-😀": 3 }, mode: "page", extra: [1, "two", null, { three: 3 }] },
      "bm.theme": "light"
    };
    /* what arrives: every value the site writes, Unicode keys and all, but a chapter's
       total (never taken); the two fields no version of the site writes (note, extra)
       are left out and counted */
    const kept = {
      "bm.progress.v1": { "ch01": { solved: { "e1": true, "ünïcødé-é": true, "😀": true } } },
      "bm.last": null,
      "bm.lesson.v1": { reached: { "chäpter-😀": 3 }, mode: "page" },
      "bm.theme": "light"
    };
    const v = await send.encode(odd);
    expect(v).toMatch(/^1[zj][A-Za-z0-9_-]+$/);
    const out = await decode(value(v));
    expect(out).toEqual({ ok: true, stores: kept, ignored: [], dropped: 2 });
    /* without CompressionStream the page sends it as it is, and that reads back too */
    const saved = (globalThis as Record<string, unknown>).CompressionStream;
    (globalThis as Record<string, unknown>).CompressionStream = undefined;
    try {
      const j = await send.encode(odd);
      expect(j.slice(0, 2)).toBe("1j");
      expect(await decode(j)).toEqual({ ok: true, stores: kept, ignored: [], dropped: 2 });
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
    expect(out).toEqual({ ok: true, stores: { "bm.prefs.v1": { sound: true }, "bm.lesson.v1": { reached: {} } }, ignored: ["bm.future.v9", "bm.last", "bm.progress.v1", "bm.sync.v1", "bm.theme"], dropped: 0 });
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

  it("reads the fragment, the old page's own anchor, and whether the reader asked", () => {
    expect(readHash("#bm-carry=1zAbC&bm-at=" + encodeURIComponent("integers é"))).toEqual({ value: "1zAbC", at: "integers é", ask: false });
    expect(readHash("#bm-carry=1jAA")).toEqual({ value: "1jAA", at: "", ask: false });
    expect(readHash("#bm-carry=1jAA&bm-at=x&bm-ask=1")).toEqual({ value: "1jAA", at: "x", ask: true });
    expect(readHash("#integers")).toBeNull();
    expect(readHash("")).toBeNull();
  });

  it("never puts back an old anchor that is itself a payload", () => {
    const crafted = "bm-carry=1j" + Buffer.from('{"v":1,"s":{"bm.theme":"dark"}}').toString("base64url");
    expect(readHash("#bm-carry=1jAA&bm-at=" + encodeURIComponent(crafted))).toEqual({ value: "1jAA", at: "", ask: false });
    expect(safeAt(crafted)).toBe("");
    expect(safeAt("#" + crafted)).toBe("");
    expect(safeAt("x&bm-carry=1j")).toBe("");
    expect(safeAt("integers")).toBe("integers");
    expect(safeAt("a".repeat(201))).toBe("");
  });

  it("is read only at the new address, a local server and the project's pages.dev addresses", () => {
    expect(allowedHost(new URL(ORIGIN).hostname)).toBe(true);
    ["localhost", "127.0.0.1", "groundupmath.pages.dev", "abc123.groundupmath.pages.dev", "move-to-cloudflare.groundupmath.pages.dev"].forEach((h) => expect(allowedHost(h), h).toBe(true));
    [new URL(LEGACY).hostname, "evil.example", "pages.dev.evil.example", "learn.groundupmath.org.evil.example", ""].forEach((h) => expect(allowedHost(h), h).toBe(false));
    expect(legacyCarryUrl("/progress")).toBe(LEGACY + "carry/?to=%2Fprogress");
    expect(legacyCarryUrl("/progress", true)).toBe(LEGACY + "carry/?to=%2Fprogress&file=1");
  });

  it("says what it holds, every kind of thing it would write", () => {
    expect(describeIt(summary(fixture))).toBe("3 chapters, 23 exercises solved, 519 XP, 3 achievements, 1 medal, your Arena and review record and your settings.");
    expect(describeIt(summary({ "bm.theme": "dark" }))).toBe("Your settings.");
    expect(describeIt(summary({ "bm.game.v1": { ach: { "first-light": 1789214400000 }, enc: { "ch01/practice": { medal: 3, day: "2026-09-12" } } } }))).toBe("1 achievement and 1 medal.");
    expect(describeIt(summary({ "bm.game.v1": { daily: { "2026-09-20": 1 } } }))).toBe("Your Arena and review record.");
    expect(describeIt(summary({ "bm.sync.pending.v1": { "u-9": { email: "a@b.c", via: ["github"], state: { progress: { ch03: { solved: { e2: true }, total: 9 } } } } } })))
      .toBe("Progress of an account that was signed in at the old address (1 chapter, 1 exercise solved), kept in this browser out of view and saved to that account when it signs in here.");
    expect(describeIt(summary({}))).toBe("");
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
    /* the record this browser set aside itself keeps its own email, services and reset
       time, and takes in the carried progress (the link cannot raise its reset, which
       account.js applies to the account, or name a service on it) */
    expect(pend["u-1"]).toEqual({ email: "a@b.c", via: ["github"], resetAt: 3, at: 20, state: pend["u-1"].state });
    const pstate = pend["u-1"].state as { progress: Record<string, unknown> };
    expect(Object.keys(pstate.progress).sort()).toEqual(["ch02", "ch03"]);
    expect(pend["u-2"]).toEqual({ email: "x@y.z", state: {}, carried: 1 });
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

describe("a crafted payload the reader says yes to", () => {
  const NOW = Date.UTC(2026, 9, 5, 12);
  const pack = (payload: unknown) => "1j" + Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const here = JSON.parse(JSON.stringify(fixture)) as Stores;
  const read = (state: Stores) => (k: string) => (k in state ? JSON.parse(JSON.stringify(state[k])) : undefined);
  /* what this browser holds after yes, starting from the fixture */
  async function yes(payload: unknown, base: Stores = here) {
    const out = await decode(pack(payload), NOW);
    return { out, state: out.ok ? { ...base, ...plan(read(base), out.stores, merge, out.owner, NOW) } : base };
  }
  /* nothing the fixture holds is lost or changed: every solved exercise and mission,
     every attempt record (a carried record may add to one, never change what it has),
     every day of XP and of the Daily, every achievement, medal and review placement */
  function keepsHere(state: Stores, base: Stores = here) {
    const was = base as Record<string, Record<string, Record<string, unknown>>>, now = state as typeof was;
    Object.keys(was["bm.progress.v1"]).forEach((ch) => Object.keys(was["bm.progress.v1"][ch].solved as object).forEach((k) =>
      expect((now["bm.progress.v1"][ch].solved as Record<string, unknown>)[k], ch + " " + k).toBe(true)));
    Object.keys(was["bm.attempts.v1"]).forEach((ch) => Object.keys(was["bm.attempts.v1"][ch]).forEach((k) =>
      expect(now["bm.attempts.v1"][ch][k], ch + " " + k).toEqual(was["bm.attempts.v1"][ch][k])));
    const days = (was["bm.activity.v1"] as unknown as { days: Record<string, number> }).days;
    Object.keys(days).forEach((d) => expect((now["bm.activity.v1"] as unknown as { days: Record<string, number> }).days[d], d).toBeGreaterThanOrEqual(days[d]));
    const g = was["bm.game.v1"] as unknown as Record<string, Record<string, unknown>>, h = now["bm.game.v1"] as unknown as Record<string, Record<string, unknown>>;
    Object.keys(g.daily).forEach((d) => expect(h.daily[d], "daily " + d).toBe(1));
    Object.keys(g.ach).forEach((k) => expect(h.ach[k], "ach " + k).toBe(g.ach[k]));
    Object.keys(g.enc).forEach((k) => expect(h.enc[k], "enc " + k).toEqual(g.enc[k]));
    expect(h.v).toBeUndefined();
  }

  it("cannot damage an attempt or push out the Daily with values that are not the site's", async () => {
    /* review case C: 60 Daily days far in the future, and an attempt record of strings */
    const daily: Record<string, unknown> = {};
    for (let i = 0; i < 60; i++) daily[(9999 - i) + "-01-01"] = 1;
    const crafted = { "bm.game.v1": { daily }, "bm.attempts.v1": { ch01: { t1: { solved: "x", tries: "y", first: "no", hints: -1, rung: 1e308 } } } };
    /* nothing of it is anything the site writes, so there is nothing to ask about */
    expect(await decode(pack({ v: 1, s: crafted }), NOW)).toEqual({ ok: false, why: "empty" });
    /* beside one real exercise, it is asked about as that alone, and changes nothing here */
    const { out, state } = await yes({ v: 1, s: { ...crafted, "bm.progress.v1": { ch03: { solved: { e1: true }, total: 10 } } } });
    expect(out.ok && describeIt(summary(out.stores))).toBe("1 chapter and 1 exercise solved.");
    /* 60 days, five fields, and the record they leave empty */
    expect(out.ok && out.dropped).toBe(66);
    keepsHere(state);
    expect((state["bm.attempts.v1"] as Record<string, Record<string, unknown>>).ch01.t1).toEqual({ tries: 1, section: "addition", inline: 1, solved: 1789214400000, first: 1 });
    expect((state["bm.progress.v1"] as Record<string, { solved: Record<string, true> }>).ch03.solved.e1).toBe(true);
  });

  it("drops every value of the wrong type, range or day, at every level", async () => {
    const out = check({
      "bm.progress.v1": { ch01: { solved: { e1: true, e2: 1, e3: "true" }, total: -3 }, ch02: "x" },
      "bm.play.v1": { ch01: { done: { "a:0": true, "a:1": false }, total: 1e9, guess: 1.5 } },
      "bm.attempts.v1": { ch01: { e1: { tries: 2, hints: "1", solved: 5, first: 2, section: 7, opened: 1 } } },
      "bm.activity.v1": { days: { "2026-10-01": 40, "2026-13-01": 5, "2026-10-09": 5, "2023-12-31": 5, "2026-10-02": -1, "2026-10-03": Number.MAX_VALUE }, goal: 9000 },
      "bm.lesson.v1": { reached: { ch01: 4, ch02: "9" }, mode: "scroll" },
      "bm.last": { id: "ch01", section: 3 },
      "bm.game.v1": {
        ach: { a: 1789214400000, b: "now", c: 1 }, cmp: { ch01: { e1: 1, e2: "y" } },
        sec: { "ch01#x": { n: 3, ok: 2, box: 9, last: "2099-01-01", fix: -1 } },
        best: { standard: { score: 10, hearts: 3, day: "2026-09-01" }, cheat: { score: 1 } },
        enc: { "ch01/practice": { medal: 4, day: "2026-09-01" } }, maxed: "lots", v: 0
      },
      "bm.prefs.v1": { sound: "yes", tempo: "warp", volume: 40, gfx: "mid" },
      "bm.theme": "dark"
    }, { now: NOW });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.stores).toEqual({
      "bm.progress.v1": { ch01: { solved: { e1: true } } },
      "bm.play.v1": { ch01: { done: { "a:0": true } } },
      "bm.attempts.v1": { ch01: { e1: { tries: 2, opened: 1 } } },
      "bm.activity.v1": { days: { "2026-10-01": 40 } },
      "bm.lesson.v1": { reached: { ch01: 4 } },
      "bm.last": { id: "ch01" },
      "bm.game.v1": { ach: { a: 1789214400000 }, cmp: { ch01: { e1: 1 } }, sec: { "ch01#x": { n: 3, ok: 2 } }, best: { standard: { score: 10, hearts: 3, day: "2026-09-01" } }, enc: { "ch01/practice": { day: "2026-09-01" } } },
      "bm.prefs.v1": { volume: 40, gfx: "mid" },
      "bm.theme": "dark"
    });
    expect(out.ignored).toEqual([]);
  });

  it("keeps every Daily this browser had when 60 later days of it arrive", async () => {
    /* this browser played two Dailies in July; the link brings the 60 days before today */
    const base = { ...here, "bm.game.v1": { ...(here["bm.game.v1"] as object), daily: { "2026-07-01": 1, "2026-07-02": 1 } } };
    const daily: Record<string, 1> = {};
    for (let i = 0; i < 60; i++) daily[new Date(NOW - i * 86400000).toISOString().slice(0, 10)] = 1;
    /* the site's own merge would keep only the latest 60, pushing out both of this browser's */
    expect(Object.keys((merge({ game: base["bm.game.v1"] }, { game: { daily } }).game as { daily: object }).daily)).not.toContain("2026-07-01");
    const { out, state } = await yes({ v: 1, s: { "bm.game.v1": { daily }, "bm.progress.v1": { ch03: { solved: { e1: true } } } } }, base);
    expect(out.ok).toBe(true);
    keepsHere(state, base);
    const got = Object.keys((state["bm.game.v1"] as { daily: object }).daily);
    expect(got).toHaveLength(60);
    expect(got).toContain("2026-07-01");
    expect(got).toContain(Object.keys(daily).sort().pop());
  });

  it("refuses a game record that says it is newer than this site (review case A)", async () => {
    expect(await decode(pack({ v: 1, s: { "bm.game.v1": { v: 2 } } }), NOW)).toEqual({ ok: false, why: "version" });
    expect(await decode(pack({ v: 1, s: { "bm.game.v1": { v: 2 }, "bm.progress.v1": { ch01: { solved: { e1: true } } } } }), NOW)).toEqual({ ok: false, why: "version" });
    expect(await decode(pack({ v: 1, s: { "bm.sync.pending.v1": { u1: { state: { game: { v: 3 }, progress: { ch01: { solved: { e1: true } } } } } } } }), NOW)).toEqual({ ok: false, why: "version" });
    expect(fromFile(JSON.stringify({ progress: { ch01: { solved: { e1: true } } }, game: { v: 2 } }), NOW)).toEqual({ ok: false, why: "version" });
    /* v 1 is today's shape and kept; a v that is not a number is not one, and left out */
    const one = check({ "bm.game.v1": { v: 1, ach: { a: 1789214400000 } }, "bm.theme": "dark" }, { now: NOW });
    expect(one.ok && one.stores["bm.game.v1"]).toEqual({ v: 1, ach: { a: 1789214400000 } });
    const odd = check({ "bm.game.v1": { v: "2", ach: { a: 1789214400000 } } }, { now: NOW });
    expect(odd.ok && odd.stores["bm.game.v1"]).toEqual({ ach: { a: 1789214400000 } });
    const { state } = await yes({ v: 1, s: { "bm.game.v1": { v: 1 }, "bm.progress.v1": { ch03: { solved: { e1: true } } } } });
    expect((state["bm.game.v1"] as { v?: number }).v).toBe(1);
  });

  it("cannot lower a chapter's progress here with a larger total", async () => {
    /* a finished chapter (the fixture's ch01 is 10 / 10) must stay finished */
    const payload = { v: 1, s: { "bm.theme": "dark", "bm.progress.v1": { ch01: { solved: {}, total: 200 }, ch05: { solved: {}, total: 200 } }, "bm.play.v1": { ch01: { done: {}, total: 200 } } } };
    const { out, state } = await yes(payload, Object.fromEntries(Object.entries(here).filter(([k]) => k !== "bm.theme")));
    expect(out.ok && describeIt(summary(out.stores))).toBe("Your settings.");
    keepsHere(state);
    const totals = (k: string) => Object.fromEntries(Object.entries(state[k] as Record<string, { total?: number }>).map(([ch, r]) => [ch, r.total]));
    const was = (k: string) => Object.fromEntries(Object.entries(here[k] as Record<string, { total?: number }>).map(([ch, r]) => [ch, r.total]));
    expect(totals("bm.progress.v1")).toEqual(was("bm.progress.v1"));
    expect(totals("bm.play.v1")).toEqual(was("bm.play.v1"));
    /* a chapter record that held nothing but a total is no record */
    expect(out.ok && out.stores["bm.progress.v1"]).toEqual({ ch01: { solved: {} }, ch05: { solved: {} } });
    expect((await decode(pack({ v: 1, s: { "bm.theme": "dark", "bm.play.v1": { ch01: { total: 200 } } } }), NOW) as { stores: Stores }).stores["bm.play.v1"]).toEqual({});
  });

  it("never carries a reset time later than now", async () => {
    const aside = (resetAt: number) => ({ "bm.sync.pending.v1": { u1: { resetAt, state: { progress: { ch09: { solved: { e1: true } } } } } } });
    for (const resetAt of [NOW + 3600000, 1e300]) {
      const owned = await decode(pack({ v: 1, a: { user: "u1", resetAt }, s: { "bm.progress.v1": { ch09: { solved: { e1: true } } } } }), NOW);
      expect(owned.ok && owned.owner).toEqual({ user: "u1", resetAt: NOW });
      const set = await decode(pack({ v: 1, s: aside(resetAt) }), NOW);
      expect(set.ok && (set.stores["bm.sync.pending.v1"] as Record<string, { resetAt: number }>).u1.resetAt).toBe(NOW);
    }
    const file = fromFile(JSON.stringify({ format: "basic-mathematics-progress", v: 1, progress: { ch09: { solved: { e1: true } } }, owner: { user: "u1", resetAt: 1e300 } }), NOW);
    expect(file.ok && file.owner).toEqual({ user: "u1", resetAt: NOW });
    /* an earlier one is kept as it came: it decides what of the progress the account keeps */
    const early = await decode(pack({ v: 1, s: aside(5) }), NOW);
    expect(early.ok && (early.stores["bm.sync.pending.v1"] as Record<string, { resetAt: number }>).u1.resetAt).toBe(5);
  });

  it("never raises the reset time of progress this browser set aside itself", async () => {
    /* this browser set u1's progress aside at a sign-out, with the reset it knew (3) */
    const base = { ...here, "bm.sync.pending.v1": { u1: { email: "a@b.c", via: ["github"], resetAt: 3, state: { progress: { ch02: { solved: { e9: true } } } }, at: 10 } } };
    for (const payload of [
      { v: 1, a: { user: "u1", resetAt: NOW }, s: { "bm.progress.v1": { ch09: { solved: { e1: true } } } } },
      { v: 1, s: { "bm.sync.pending.v1": { u1: { email: "x@y.z", via: ["google"], resetAt: NOW, state: { progress: { ch09: { solved: { e1: true } } } } } } } }
    ]) {
      const { out, state } = await yes(payload, base);
      expect(out.ok).toBe(true);
      const r = (state["bm.sync.pending.v1"] as Record<string, Record<string, unknown>>).u1;
      expect({ email: r.email, via: r.via, resetAt: r.resetAt, carried: r.carried }).toEqual({ email: "a@b.c", via: ["github"], resetAt: 3, carried: undefined });
      expect(Object.keys((r.state as { progress: object }).progress).sort()).toEqual(["ch02", "ch09"]);
    }
  });

  it("says what set-aside progress it would plant, and refuses one with nothing in it (review case B)", async () => {
    const aside = { email: "support@groundupmath.org", via: ["google", "myspace"], resetAt: 0, state: { progress: { ch01: { solved: { e1: true } } } }, at: 1789214400000 };
    const out = await decode(pack({ v: 1, s: { "bm.sync.pending.v1": { "00000000-0000-0000-0000-000000000000": aside, "<b>": aside } } }), NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(describeIt(summary(out.stores))).toMatch(/^Progress of an account that was signed in at the old address \(1 chapter, 1 exercise solved\)/);
    /* an unknown service and an id that is not one are left out */
    expect(Object.keys(out.stores["bm.sync.pending.v1"] as object)).toEqual(["00000000-0000-0000-0000-000000000000"]);
    expect(((out.stores["bm.sync.pending.v1"] as Record<string, Record<string, unknown>>)["00000000-0000-0000-0000-000000000000"]).via).toBeUndefined();
    expect(await decode(pack({ v: 1, s: { "bm.sync.pending.v1": { u1: { email: "x@y.z", via: ["google"], state: {} } } } }), NOW)).toEqual({ ok: false, why: "empty" });
    expect(await decode(pack({ v: 1, s: { "bm.sync.pending.v1": { u1: { email: "x@y.z", state: { progress: { ch01: { solved: { e1: "yes" } } } } } } } }), NOW)).toEqual({ ok: false, why: "empty" });
  });
});

describe("progress of an account that was signed in at the old address", () => {
  const NOW = Date.UTC(2026, 9, 5, 12);
  const read = (state: Stores) => (k: string) => (k in state ? JSON.parse(JSON.stringify(state[k])) : undefined);
  const here: Stores = { "bm.progress.v1": { ch09: { solved: { e4: true }, total: 8 } }, "bm.prefs.v1": { sound: true } };

  it("is set aside for that account, never merged into this browser's (review case G)", async () => {
    const got = send.collect(storage(stored({ ...fixture, "bm.sync.v1": { user: "u-1", resetAt: 5 } })));
    const v = await send.encode(got.stores, got.owner);
    const out = await decode(v, NOW);
    expect(out.ok && out.owner).toEqual({ user: "u-1", resetAt: 5 });
    if (!out.ok) return;
    /* the run store goes with the account's progress, and stays behind */
    expect(out.ignored).toEqual(["bm.run.v1"]);
    expect(describeIt(summary(out.stores, out.owner))).toBe("Your settings. Progress of an account that was signed in at the old address (3 chapters, 23 exercises solved), kept in this browser out of view and saved to that account when it signs in here.");
    const writes = plan(read(here), out.stores, merge, out.owner, NOW);
    expect(Object.keys(writes).sort()).toEqual(["bm.sync.pending.v1", "bm.theme"]);
    const aside = (writes["bm.sync.pending.v1"] as Record<string, Record<string, unknown>>)["u-1"];
    expect(aside).toMatchObject({ email: "", via: [], resetAt: 5, at: NOW, carried: 1 });
    expect(Object.keys(aside.state as object).sort()).toEqual(["activity", "attempts", "game", "last", "lesson", "play", "progress"]);
    expect(canon((aside.state as Record<string, unknown>).progress)).toBe(canon(noTotals(fixture["bm.progress.v1"])));
    /* this browser's own progress is untouched, and so is everything set aside for others */
    const twice = plan(read({ ...here, ...writes, "bm.sync.pending.v1": { "u-2": { email: "b@c.d", state: { progress: {} } }, ...(writes["bm.sync.pending.v1"] as object) } }), out.stores, merge, out.owner, NOW + 1);
    expect(Object.keys(twice["bm.sync.pending.v1"] as object).sort()).toEqual(["u-1", "u-2"]);
    /* (the merge fills in a total it has none for as 0, which the site reads as unknown) */
    expect(canon(noTotals(((twice["bm.sync.pending.v1"] as Record<string, Record<string, unknown>>)["u-1"].state as Record<string, unknown>).progress))).toBe(canon(noTotals(fixture["bm.progress.v1"])));
  });

  it("refuses an owner that is not an account id", async () => {
    const pack = (payload: unknown) => "1j" + Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    for (const a of ["u-1", { user: "<b>x</b>" }, { user: "u-1", resetAt: "5" }, { user: "" }]) {
      expect(await decode(pack({ v: 1, s: { "bm.theme": "dark" }, a }), NOW), JSON.stringify(a)).toEqual({ ok: false, why: "malformed" });
    }
  });

  it("travels in the carry page's file too", () => {
    const file = { format: "basic-mathematics-progress", v: 1, progress: fixture["bm.progress.v1"], owner: { user: "u-1", resetAt: 0 } };
    const out = fromFile(JSON.stringify(file), NOW);
    expect(out.ok && out.owner).toEqual({ user: "u-1", resetAt: 0 });
    /* "Download my data" has no owner, whatever it holds: the reader chose that file */
    const mine = fromFile(JSON.stringify({ progress: fixture["bm.progress.v1"], owner: { user: "u-1" } }), NOW);
    expect(mine.ok && mine.owner).toBeUndefined();
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
