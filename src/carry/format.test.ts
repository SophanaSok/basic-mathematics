/* Progress carried from the old address: what the legacy site's pages write
   (src/carry/send.js, run here as the pages run it, from its own text), where the new
   address takes it from (fromLegacy), and what it makes of it (format.ts: check(), and
   add(), which only ever adds). The browser half, two origins and the question on the
   page, is tools/game/carry.test.js; what an account then does with this browser's
   progress is tools/game/sync.test.js. */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { add, adds, allowedHost, asked, check, DAILY_KEPT, decode, describe as describeIt, fingerprint, freshLoad, fromFile, fromLegacy, legacyCarryUrl, localDay, MAX_FRAGMENT, NONE, readHash, remember, safeAt, stored as fromText, TAKEN, type Added, type Course, type Stores } from "./format.ts";
import { LEGACY, LEGACY_LOCAL, ORIGIN } from "./origins.ts";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const NOW = Date.parse("2026-10-05T12:00:00Z");
const DAY = 86400000;
const TODAY = localDay(NOW), TOMORROW = localDay(NOW + DAY);

type Send = {
  collect(storage: unknown): { stores: Stores; count: number; signedIn: boolean };
  encode(stores: Stores, signedIn?: boolean): Promise<string>;
  anchor(hash: string): string;
  TAKEN: string[];
};
const send: Send = new Function(fs.readFileSync(path.join(ROOT, "src/carry/send.js"), "utf8") + "\nreturn BMCarrySend;")();
/* the legacy carry page (src/carry/page.js), as it is inlined after send.js */
const page: { pathFrom(search: string, origin: string): string; file(stores: Stores, from: string, signedIn: boolean): Record<string, unknown> } =
  new Function(fs.readFileSync(path.join(ROOT, "src/carry/send.js"), "utf8") + fs.readFileSync(path.join(ROOT, "src/carry/page.js"), "utf8") + "\nreturn BMCarryPage;")();

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
const pack = (payload: unknown) => "1j" + Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
/* JSON with keys sorted */
function canon(x: unknown): string {
  if (Array.isArray(x)) return "[" + x.map(canon).join(",") + "]";
  if (x && typeof x === "object") return "{" + Object.keys(x).sort().map((k) => JSON.stringify(k) + ":" + canon((x as Record<string, unknown>)[k])).join(",") + "}";
  return JSON.stringify(x);
}
const plain = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const clone = <T>(x: T): T => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

/* the course, as src/ui/carry.ts course() reads it from data/curriculum.js */
const COURSE: Course = (() => {
  const win: { BM_CURRICULUM?: { chapters: { id: string; sections?: { id: string }[] }[] } } = {};
  new Function("window", fs.readFileSync(path.join(ROOT, "data/curriculum.js"), "utf8"))(win);
  const chapters: string[] = [], sections: string[] = [];
  win.BM_CURRICULUM!.chapters.forEach((ch) => { chapters.push(ch.id); (ch.sections || []).forEach((x) => sections.push(ch.id + "#" + x.id)); });
  return { chapters, sections };
})();

/* the saved-state fixture the upgrade suite seeds: a learner three chapters in */
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/state-v1.json"), "utf8")).storage as Record<string, unknown>;

/* A learner who has done everything: every exercise of the course tried and solved, with
   clues opened, every store as full as the site lets it get, a year of daily XP, every
   section placed in the review, and the device's own stores too. */
function everything(): Record<string, unknown> {
  const progress: Record<string, unknown> = {}, attempts: Record<string, unknown> = {}, play: Record<string, unknown> = {}, reached: Record<string, number> = {};
  const cmp: Record<string, unknown> = {}, enc: Record<string, unknown> = {}, sec: Record<string, unknown> = {};
  let t = Date.UTC(2026, 0, 1, 12);
  const files = fs.readdirSync(path.join(ROOT, "parts")).flatMap((d) => fs.readdirSync(path.join(ROOT, "parts", d)).map((f) => path.join(ROOT, "parts", d, f)));
  files.forEach((file) => {
    const html = fs.readFileSync(file, "utf8");
    const ch = /data-chapter="([^"]+)"/.exec(html)![1];
    const solved: Record<string, true> = {}, recs: Record<string, unknown> = {}, cmps: Record<string, 1> = {};
    for (const m of html.matchAll(/<div class="ex"([^>]*)>/g)) {
      const id = /\bid="([^"]+)"/.exec(m[1])![1], isInline = /data-inline/.test(m[1]);
      const section = (/data-section="([^"]+)"/.exec(m[1]) || [])[1] || "practice";
      if (!isInline) { solved[id] = true; cmps[id] = 1; }
      recs[id] = { tries: 3, hints: 2, rung: 3, opened: 1, section, solved: (t += 61000), first: 0, ...(isInline ? { inline: 1 } : {}) };
      sec[ch + "#" + section] = { n: 40, ok: 31, box: 4, last: "2026-09-30", fix: t };
    }
    progress[ch] = { solved, total: Object.keys(solved).length };
    attempts[ch] = recs;
    cmp[ch] = cmps;
    const done: Record<string, true> = {};
    for (let i = 0; i < 12; i++) done["figure-" + i + ":" + (i % 3)] = true;
    play[ch] = { done, total: 12, guess: 2 };
    reached[ch] = 14;
    enc[ch + "/practice"] = { medal: 3, day: "2026-05-01" };
    enc[ch + "/review"] = { medal: 2, day: "2026-05-02" };
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
    "bm.run.v1": { combo: { pips: 3, shield: true }, paid: Array.from({ length: 30 }, (_, i) => "run-" + i) },
    "bm.prefs.v1": { sound: true, calm: false, tempo: "extended", panel: "dark", volume: 40, motion: "reduce", gfx: "mid" }
  };
}

/* what a browser holds, as the receiver reads it (src/ui/carry.ts read): parsed, or the
   text itself where it is not JSON */
function reader(state: Record<string, unknown>) {
  return (k: string) => (Object.prototype.hasOwnProperty.call(state, k) ? state[k] : undefined);
}
/* the browser after add()'s writes */
function apply(state: Record<string, unknown>, writes: Record<string, unknown>): Record<string, unknown> {
  return Object.assign(clone(state), clone(writes));
}
/* every value of `before` is in `after`, unchanged: a record may only have gained keys,
   anything else is exactly as it was */
function extends_(before: unknown, after: unknown, at = ""): string | null {
  if (plain(before)) {
    if (!plain(after)) return at + ": a record became " + JSON.stringify(after);
    for (const k of Object.keys(before)) {
      if (!Object.prototype.hasOwnProperty.call(after, k)) return at + "/" + k + ": removed";
      const why = extends_(before[k], after[k], at + "/" + k);
      if (why) return why;
    }
    return null;
  }
  return canon(before) === canon(after) ? null : at + ": " + JSON.stringify(before) + " became " + JSON.stringify(after);
}
function unchanged(before: Record<string, unknown>, after: Record<string, unknown>): string | null {
  for (const k of Object.keys(before)) {
    const why = extends_(before[k], after[k], k);
    if (why) return why;
  }
  return null;
}
/* what add() says it adds, counted from the browser before and after, independently */
function counted(before: Record<string, unknown>, after: Record<string, unknown>): Added {
  const out: Added = Object.assign({}, NONE);
  const rec = (s: Record<string, unknown>, k: string) => (plain(s[k]) ? s[k] as Record<string, unknown> : {});
  const fresh = (b: unknown, a: unknown) => (plain(a) ? Object.keys(a).filter((k) => !(plain(b) && Object.prototype.hasOwnProperty.call(b, k))) : []);
  const inner = (key: string, field: string) => {
    const b = rec(before, key), a = rec(after, key);
    return Object.keys(a).reduce((n, ch) => n + fresh(plain(b[ch]) ? (b[ch] as Record<string, unknown>)[field] : undefined, plain(a[ch]) ? (a[ch] as Record<string, unknown>)[field] : undefined).length, 0);
  };
  out.solved = inner("bm.progress.v1", "solved");
  out.missions = inner("bm.play.v1", "done");
  const ab = rec(before, "bm.attempts.v1"), aa = rec(after, "bm.attempts.v1");
  out.records = Object.keys(aa).reduce((n, ch) => n + fresh(ab[ch], aa[ch]).length, 0);
  const days = fresh(rec(before, "bm.activity.v1").days, rec(after, "bm.activity.v1").days);
  out.days = days.length;
  out.xp = days.reduce((n, d) => n + (rec(after, "bm.activity.v1").days as Record<string, number>)[d], 0);
  out.lessons = fresh(rec(before, "bm.lesson.v1").reached, rec(after, "bm.lesson.v1").reached).length;
  const gb = rec(before, "bm.game.v1"), ga = rec(after, "bm.game.v1");
  out.sections = fresh(gb.sec, ga.sec).length;
  out.achievements = fresh(gb.ach, ga.ach).length;
  out.best = fresh(gb.best, ga.best).length;
  out.medals = fresh(gb.enc, ga.enc).length;
  out.dailies = fresh(gb.daily, ga.daily).length;
  out.last = before["bm.last"] === undefined && after["bm.last"] !== undefined ? 1 : 0;
  out.theme = before["bm.theme"] === undefined && after["bm.theme"] !== undefined ? 1 : 0;
  out.prefs = before["bm.prefs.v1"] === undefined && after["bm.prefs.v1"] !== undefined ? 1 : 0;
  return out;
}
/* add() as the receiver runs it on a browser: the writes, the counts, and the checks
   that hold whatever came in */
function carry(here: Record<string, unknown>, carried: Stores, now = NOW) {
  const r = add(reader(here), carried, now);
  const after = apply(here, r.writes);
  return { ...r, after, line: describeIt(r.added) };
}
function holds(here: Record<string, unknown>, carried: Stores, now = NOW) {
  const r = carry(here, carried, now);
  expect(unchanged(here, r.after)).toBeNull();
  expect(Object.keys(r.writes).every((k) => TAKEN.indexOf(k) >= 0)).toBe(true);
  expect(r.added).toEqual(counted(here, r.after));
  /* and again: nothing more to add */
  expect(adds(add(reader(r.after), carried, now).added)).toBe(false);
  return r;
}
async function link(payload: unknown, now = NOW, course?: Course): Promise<Stores> {
  const out = await decode(pack(payload), now, course);
  if (!out.ok) throw new Error("refused: " + out.why);
  return out.stores;
}

describe("what the old address sends", () => {
  it("takes the stores the new address takes and nothing else: no account record, session, run store or other key", () => {
    const got = send.collect(storage({
      "bm.progress.v1": '{"ch01":{"solved":{"e1":true},"total":10}}',
      "bm.theme": '"dark"',
      "bm.carry.v1": '{"seen":{}}',
      "bm.sync.pending.v1": '{"u-1":{"email":"a@b.c","state":{}}}',
      "bm.run.v1": '{"arena":{"cur":{"given":"TYPED"}}}',
      "sb-jfidvrzonyzfstnykzly-auth-token": '{"access_token":"secret"}',
      "bm.x-auth-token": '"secret"',
      "other.app": '"hello"',
      "bm.prefs.v1": "{not json",
      "bm.future.v9": '{"kept":true}'
    }));
    expect(Object.keys(got.stores).sort()).toEqual(["bm.progress.v1", "bm.theme"]);
    expect(got).toMatchObject({ count: 2, signedIn: false });
    expect(JSON.stringify(got.stores)).not.toMatch(/secret|auth-token|a@b\.c|TYPED/);
    expect(send.TAKEN.slice().sort()).toEqual(TAKEN.slice().sort());
  });

  it("signed in there, sends the settings and that the reader was signed in, and nothing of the account or its progress", async () => {
    const got = send.collect(storage(stored(Object.assign({}, fixture, { "bm.sync.v1": { user: "u-1", resetAt: 5 }, "bm.prefs.v1": { sound: false } }))));
    expect(Object.keys(got.stores).sort()).toEqual(["bm.prefs.v1", "bm.theme"]);
    expect(got.signedIn).toBe(true);
    const v = await send.encode(got.stores, got.signedIn);
    const out = await decode(v, NOW);
    expect(out.ok && out.signedIn).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/u-1|resetAt/);
    /* signed in with nothing else saved, it still says so */
    const bare = send.collect(storage({ "bm.sync.v1": '{"user":"u-1"}' }));
    expect(bare).toEqual({ stores: {}, count: 0, signedIn: true });
    expect(send.collect(storage({ "bm.sync.v1": '{"user":""}', "bm.theme": '"dark"' })).signedIn).toBe(false);
  });

  it("sends the carry page's reader to a single path at the new address and nowhere else", () => {
    const o = "https://learn.example";
    expect(page.pathFrom("?to=%2Fprogress%3Fx%3D1", o)).toBe("/progress?x=1");
    ["?to=//evil.example/", "?to=/%5Cevil.example/", "?to=https://evil.example/", "?to=javascript:alert(1)",
      "?to=/%09/evil.example", "?to=/%0a/evil.example", "?to=/%0d/evil.example", "?to=%09//evil.example", "?to=/%7F/x", "?to=%E0%A4%A"]
      .forEach((q) => expect(page.pathFrom(q, o), q).toBe("/"));
  });

  it("puts in the carry page's file the settings under device, and only that the reader was signed in", () => {
    const f = page.file({ "bm.progress.v1": { ch01: { solved: { e1: true } } }, "bm.theme": "dark" }, "x", true);
    expect(f).toMatchObject({ format: "basic-mathematics-progress", v: 1, progress: { ch01: { solved: { e1: true } } }, device: { "bm.theme": "dark" }, signedIn: true });
    expect(Object.keys(f)).not.toContain("owner");
    expect(page.file({ "bm.theme": "dark" }, "x", false).signedIn).toBeUndefined();
  });

  it("never sends on an old fragment that is itself a payload", () => {
    expect(send.anchor("#integers")).toBe("integers");
    expect(send.anchor("#bm-carry=1jAAAA")).toBe("");
    expect(send.anchor("#x&bm-at=bm-carry%3D1j")).toBe("");
    expect(send.anchor("#" + "a".repeat(300))).toBe("");
  });

  it("carries Unicode and odd stored values through, compressed and not, and only what the site writes", async () => {
    const odd = {
      "bm.progress.v1": { "ch01": { solved: { "e1": true, "ünïcødé-é": true, "😀": true }, total: 2, note: "</script><b>x</b>    \u0000" } },
      "bm.last": null,
      "bm.lesson.v1": { reached: { "chäpter-😀": 3 }, mode: "page", extra: [1, "two", null, { three: 3 }] },
      "bm.theme": "light"
    };
    /* a chapter's total and the reading mode are never taken; the two fields no version
       of the site writes (note, extra) are left out and counted */
    const kept = {
      "bm.progress.v1": { "ch01": { solved: { "e1": true, "ünïcødé-é": true, "😀": true } } },
      "bm.last": null,
      "bm.lesson.v1": { reached: { "chäpter-😀": 3 } },
      "bm.theme": "light"
    };
    const v = await send.encode(odd);
    expect(v).toMatch(/^1[zj][A-Za-z0-9_-]+$/);
    expect(await decode(v, NOW)).toEqual({ ok: true, stores: kept, signedIn: false, ignored: [], dropped: 2 });
    const saved = (globalThis as Record<string, unknown>).CompressionStream;
    (globalThis as Record<string, unknown>).CompressionStream = undefined;
    try {
      const j = await send.encode(odd);
      expect(j.slice(0, 2)).toBe("1j");
      expect(await decode(j, NOW)).toEqual({ ok: true, stores: kept, signedIn: false, ignored: [], dropped: 2 });
    } finally { (globalThis as Record<string, unknown>).CompressionStream = saved; }
  });

  it("fits in an address for a learner three chapters in, and for one who has done everything", async () => {
    const small = await send.encode(send.collect(storage(stored(fixture))).stores);
    const big = await send.encode(send.collect(storage(stored(everything()))).stores);
    console.log("carried sizes: state-v1.json " + small.length + " characters; everything tried " + big.length + " characters; limit " + MAX_FRAGMENT);
    expect(small.length).toBeLessThan(2000);
    expect(big.length).toBeLessThan(12000);
    const back = await decode(big, NOW);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    /* every scored exercise of the course solved, every exercise's record */
    const r = holds({}, back.stores);
    expect(r.added.records).toBe(388);
  });

  it("is too long for an address when the stores are larger than any the site writes", async () => {
    const noise: Record<string, boolean> = {};
    let s = 7;
    for (let i = 0; i < 3000; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; noise["k" + s.toString(36) + (s * 7).toString(36)] = true; }
    const v = await send.encode({ "bm.progress.v1": { ch01: { solved: noise } } });
    expect(v.length).toBeGreaterThan(MAX_FRAGMENT);
    expect(await decode(v)).toEqual({ ok: false, why: "size" });
  });
});

describe("where it is taken from", () => {
  const legacy = new URL(LEGACY).origin;
  it("takes it from the old address's origin, whatever the path or trailing slash", () => {
    [legacy, legacy + "/", LEGACY, LEGACY + "parts/1-algebra/01-numbers.html", legacy + "/other-project/"].forEach((r) => {
      expect(fromLegacy(r, ORIGIN), r).toBe(true);
      expect(fromLegacy(r, "https://pr-12.groundupmath.pages.dev"), r).toBe(true);
    });
  });
  it("refuses any other origin, no referrer at all, and the new address itself", () => {
    ["", "null", "about:blank", "not a url", ORIGIN, ORIGIN + "/progress", "https://evil.example/", "http://sophanasok.github.io/",
      "https://sophanasok.github.io.evil.example/", "https://evil.example/sophanasok.github.io/", "https://other.github.io/", "https://github.io/",
      "https://sophanasok.github.io:444/", "https://groundupmath.pages.dev/", "data:text/html,x", "blob:https://sophanasok.github.io/x",
      LEGACY_LOCAL + ":8000/", "http://localhost:8000/"]
      .forEach((r) => expect(fromLegacy(r, ORIGIN), r).toBe(false));
  });
  it("on a local server, takes it from LEGACY_LOCAL's host on any port, and from no other local origin", () => {
    const page = "http://localhost:4173";
    [LEGACY_LOCAL + ":8001/", LEGACY_LOCAL + ":1/x", LEGACY_LOCAL + "/", legacy + "/"].forEach((r) => expect(fromLegacy(r, page), r).toBe(true));
    ["http://localhost:8001/", page + "/", "http://[::1]:8001/", "https://127.0.0.1:8001/", "http://127.0.0.2:8001/", "https://evil.example/", ""]
      .forEach((r) => expect(fromLegacy(r, page), r).toBe(false));
    /* the local legacy host is never the old address of a page served from itself */
    expect(fromLegacy(LEGACY_LOCAL + ":8001/", LEGACY_LOCAL + ":8000")).toBe(false);
    expect(fromLegacy(LEGACY_LOCAL + ":8001/", ORIGIN)).toBe(false);
  });
  it("is read only on the page's own first load: never on a reload, a step back or forward, or when the browser does not say", () => {
    expect(freshLoad([{ type: "navigate" }])).toBe(true);
    [[{ type: "reload" }], [{ type: "back_forward" }], [{ type: "prerender" }], [], null, undefined, "navigate", [null], [{}], [{ type: "Navigate" }], { 0: { type: "navigate" }, length: 1 }]
      .forEach((e) => expect(freshLoad(e), JSON.stringify(e)).toBe(false));
  });
  it("is read only at the new address, a local server and the project's pages.dev addresses", () => {
    expect(allowedHost(new URL(ORIGIN).hostname)).toBe(true);
    ["localhost", "127.0.0.1", "groundupmath.pages.dev", "abc123.groundupmath.pages.dev"].forEach((h) => expect(allowedHost(h), h).toBe(true));
    [new URL(LEGACY).hostname, "evil.example", "pages.dev.evil.example", "learn.groundupmath.org.evil.example", ""].forEach((h) => expect(allowedHost(h), h).toBe(false));
    expect(legacyCarryUrl("/progress")).toBe(LEGACY + "carry/?to=%2Fprogress");
    expect(legacyCarryUrl("/progress", true)).toBe(LEGACY + "carry/?to=%2Fprogress&file=1");
  });
});

describe("what the new address reads", () => {
  async function deflate(text: string) {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return "1z" + Buffer.from(await new Response(stream).arrayBuffer()).toString("base64url");
  }

  it("refuses another format, by its first character or by v", async () => {
    expect(await decode("2zAAAA")).toEqual({ ok: false, why: "version" });
    expect(await decode(pack({ v: 2, s: {} }))).toEqual({ ok: false, why: "version" });
    expect(await decode(pack({ v: "1", s: {} }))).toEqual({ ok: false, why: "malformed" });
    expect(await decode(pack({ v: 1, s: { "bm.game.v1": { v: 2 }, "bm.progress.v1": { ch01: { solved: { e1: true } } } } }))).toEqual({ ok: false, why: "version" });
  });

  it("refuses what is not one, and never throws", async () => {
    for (const bad of ["", "x", "1", "1q" + "abcd", "1j***", "1jA", "1j" + Buffer.from("not json").toString("base64url"), "1z" + "abcd", pack([1, 2]), pack({ v: 1 }), pack({ v: 1, s: [] })]) {
      expect((await decode(bad)).ok, bad).toBe(false);
    }
  });

  it("refuses the whole payload when it holds a key that is not the site's", async () => {
    for (const k of ["sb-abc-auth-token", "other", "bm.x-auth-token", "BM.progress.v1"]) {
      expect(await decode(pack({ v: 1, s: { "bm.progress.v1": {}, [k]: "x" } })), k).toEqual({ ok: false, why: "keys" });
    }
  });

  it("refuses a small fragment that inflates into a large one, and nesting past the cap", async () => {
    const v = await deflate(JSON.stringify({ v: 1, s: { "bm.progress.v1": { ch01: { solved: {}, pad: "0".repeat(3000000) } } } }));
    expect(v.length).toBeLessThan(MAX_FRAGMENT);
    expect(await decode(v)).toEqual({ ok: false, why: "size" });
    let deep: unknown = 1;
    for (let i = 0; i < 40; i++) deep = { d: deep };
    expect(await decode(pack({ v: 1, s: { "bm.progress.v1": { ch01: deep } } }))).toEqual({ ok: false, why: "size" });
  });

  it("never reads an account record, the run store or a key it does not take, and passes over an owner", async () => {
    const out = await decode(pack({ v: 1, a: { user: "u1", resetAt: 1e300 }, s: {
      "bm.sync.pending.v1": { u1: { state: { progress: { ch01: { solved: { e1: true } } } }, carried: 1 } },
      "bm.sync.v1": { user: "u1" }, "bm.run.v1": { daily: {} }, "bm.future.v9": {}, "bm.carry.v1": {}, "bm.theme": "dark"
    } }), NOW);
    expect(out).toEqual({ ok: true, stores: { "bm.theme": "dark" }, signedIn: false, ignored: ["bm.carry.v1", "bm.future.v9", "bm.run.v1", "bm.sync.pending.v1", "bm.sync.v1"], dropped: 0 });
  });

  it("leaves out a store of the wrong shape, and says so", () => {
    const out = check({ "bm.progress.v1": [1, 2], "bm.last": "ch01", "bm.theme": "purple", "bm.prefs.v1": { sound: true }, "bm.lesson.v1": { reached: {} } }, { now: NOW });
    expect(out).toEqual({ ok: true, stores: { "bm.prefs.v1": { sound: true }, "bm.lesson.v1": { reached: {} } }, signedIn: false, ignored: ["bm.last", "bm.progress.v1", "bm.theme"], dropped: 0 });
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
    expect(safeAt("x&bm-carry=1j")).toBe("");
    expect(safeAt("integers")).toBe("integers");
    expect(safeAt("a".repeat(201))).toBe("");
  });

  it("takes a place to continue from only in a chapter the course has, at one of its sections, its warm-up or its practice", async () => {
    const last = async (v: unknown, course: Course | null = COURSE) => (await link({ v: 1, s: { "bm.last": v, "bm.theme": "dark" } }, NOW, course ?? undefined))["bm.last"];
    expect(await last({ id: "ch01", section: "integers" })).toEqual({ id: "ch01", section: "integers" });
    expect(await last({ id: "ch01", section: "practice" })).toEqual({ id: "ch01", section: "practice" });
    expect(await last({ id: "ch01", section: "warmup" })).toEqual({ id: "ch01", section: "warmup" });
    expect(await last({ id: "ch01", section: null })).toEqual({ id: "ch01", section: null });
    expect(await last({ id: "ch01" })).toEqual({ id: "ch01" });
    expect(await last(null)).toBeNull();
    /* review round 4: an id that is a member of every object passed the contents page's
       lookup and left no chapter marked "you are here" */
    for (const bad of [{ id: "constructor" }, { id: "toString", section: null }, { id: "valueOf" }, { id: "hasOwnProperty" }, { id: "__proto__" },
      { id: "ch99", section: null }, { id: "", section: null }, { id: "ch01", section: "constructor" }, { id: "ch01", section: "__proto__" },
      { id: "ch01", section: "rationals-not" }, { id: "ch02", section: "integers" }, { id: "ch01", section: 1 }, { id: 1 }, "ch01", [], {}]) {
      expect(await last(bad), JSON.stringify(bad)).toBeUndefined();
    }
    /* without the course there is nothing to look an id up in: no place is taken */
    expect(await last({ id: "ch01", section: null }, null)).toBeUndefined();
    expect(await last(null, null)).toBeNull();
  });

  it("takes only the chapters, sections and achievements the course has, when the page says", async () => {
    const course: Course = { chapters: ["ch01"], sections: ["ch01#addition"], achievements: ["first-light"] };
    const s = await link({ v: 1, s: {
      "bm.progress.v1": { ch01: { solved: { e1: true } }, zz: { solved: { e1: true } } },
      "bm.attempts.v1": { zz: { e1: { solved: NOW - DAY } } },
      "bm.game.v1": { sec: { "ch01#addition": { n: 1, ok: 1, box: 1, last: TODAY }, "zz#x": { n: 1 } }, ach: { "first-light": NOW - DAY, "no-such": NOW - DAY }, enc: { "zz/practice": { medal: 3 } }, best: { "boss:zz": { score: 1 }, "boss:ch01": { score: 2 } } }
    } }, NOW, course);
    expect(canon(s)).toBe(canon({ "bm.attempts.v1": {}, "bm.game.v1": { ach: { "first-light": NOW - DAY }, best: { "boss:ch01": { score: 2 } }, enc: {}, sec: { "ch01#addition": { n: 1, ok: 1, box: 1, last: TODAY } } }, "bm.progress.v1": { ch01: { solved: { e1: true } } } }));
  });
});

describe("adding to this browser", () => {
  const here: Record<string, unknown> = {
    "bm.progress.v1": { ch01: { solved: { e1: true, e2: true }, total: 10 }, ch09: { solved: { e4: true }, total: 8 } },
    "bm.attempts.v1": { ch01: { e1: { tries: 1, first: 1, solved: NOW - 9 * DAY } } },
    "bm.activity.v1": { days: { "2026-10-01": 50 }, goal: 40 },
    "bm.last": { id: "ch09", section: null },
    "bm.lesson.v1": { reached: { ch09: 2 }, mode: "steps" },
    "bm.game.v1": { sec: { "ch01#addition": { n: 6, ok: 6, box: 4, last: "2026-10-01" } }, daily: { "2026-10-01": 1 }, best: { daily: { score: 10, hearts: 3, day: "2026-09-01" } }, enc: { "ch01/practice": { medal: 3, day: "2026-09-01" } }, ach: { "first-light": NOW - 9 * DAY } },
    "bm.prefs.v1": { sound: false, calm: true }
  };

  it("brings everything to a browser that has nothing, and says what, in counts", async () => {
    const out = check(fixture, { now: NOW, course: COURSE });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = holds({}, out.stores);
    expect(r.line).toBe("23 exercises solved, 31 answer records, 3 missions done, your place in 3 lessons, 519 XP over 5 days, 3 achievements, 1 medal, 2 best scores, 9 review sections, 2 Dailies played, where to continue from, your theme and your sound and display settings.");
    /* nothing it does not take: no goal, reading mode, total, guess, run store */
    expect(JSON.stringify(r.after)).not.toMatch(/"goal"|"mode"|"total"|"guess"|"maxed"|"cmp"/);
    expect(r.after["bm.run.v1"]).toBeUndefined();
  });

  it("adds nothing to a browser that has it all already", () => {
    const out = check(fixture, { now: NOW, course: COURSE });
    if (!out.ok) throw new Error("refused");
    const r = holds(fixture, out.stores);
    expect(r.writes).toEqual({});
    expect(r.line).toBe("");
  });

  it("adds solved exercises and missions to the sets, and never a chapter's total", () => {
    const r = holds(here, { "bm.progress.v1": { ch01: { solved: { e2: true, e3: true } }, ch02: { solved: { e1: true } } }, "bm.play.v1": { ch01: { done: { "a:0": true } } } });
    expect((r.after["bm.progress.v1"] as Record<string, unknown>).ch01).toEqual({ solved: { e1: true, e2: true, e3: true }, total: 10 });
    expect((r.after["bm.progress.v1"] as Record<string, unknown>).ch02).toEqual({ solved: { e1: true } });
    expect(r.line).toBe("2 exercises solved and 1 mission done.");
  });

  it("takes an attempt record only for an exercise this browser has no record of at all", () => {
    const r = holds(here, { "bm.attempts.v1": { ch01: { e1: { tries: 1000, hints: 10, solved: Date.UTC(2024, 0, 1), first: 0 }, e2: { tries: 2, solved: NOW - DAY, first: 0 } } } });
    const a = (r.after["bm.attempts.v1"] as Record<string, Record<string, unknown>>).ch01;
    expect(a.e1).toEqual({ tries: 1, first: 1, solved: NOW - 9 * DAY });
    expect(a.e2).toEqual({ tries: 2, solved: NOW - DAY, first: 0 });
    expect(r.line).toBe("1 answer record.");
  });

  it("takes a section's review place only where this browser has none for that section", () => {
    const r = holds(here, { "bm.game.v1": { sec: { "ch01#addition": { n: 0, ok: 0, box: 0, last: TODAY }, "ch02#one": { n: 2, ok: 2, box: 1, last: TODAY } } } });
    const sec = (r.after["bm.game.v1"] as Record<string, Record<string, unknown>>).sec;
    expect(sec["ch01#addition"]).toEqual({ n: 6, ok: 6, box: 4, last: "2026-10-01" });
    expect(sec["ch02#one"]).toEqual({ n: 2, ok: 2, box: 1, last: TODAY });
  });

  it("takes XP days this browser has none of, none after today, and never the goal", async () => {
    const s = await link({ v: 1, s: { "bm.activity.v1": { goal: 5, days: { "2026-10-01": 999, "2026-10-02": 20, [TODAY]: 5, [TOMORROW]: 99 } } } });
    const r = holds(here, s);
    expect(r.after["bm.activity.v1"]).toEqual({ days: { "2026-10-01": 50, "2026-10-02": 20, [TODAY]: 5 }, goal: 40 });
    expect(r.line).toBe("25 XP over 2 days.");
    /* add() holds days to today on its own too */
    const raw = holds(here, { "bm.activity.v1": { days: { [TOMORROW]: 99, "garbage": 1 } } });
    expect(raw.writes).toEqual({});
  });

  it("takes Daily days only where absent, not after today, and never past the room the site's 60 leave", () => {
    const mine: Record<string, 1> = {};
    for (let i = 0; i < 50; i++) mine[localDay(NOW - (100 + i) * DAY)] = 1;
    const theirs: Record<string, 1> = {};
    for (let i = -1; i < 59; i++) theirs[localDay(NOW - i * DAY)] = 1;
    const r = holds({ "bm.game.v1": { daily: mine } }, { "bm.game.v1": { daily: theirs } });
    const daily = (r.after["bm.game.v1"] as Record<string, Record<string, 1>>).daily;
    expect(Object.keys(daily)).toHaveLength(DAILY_KEPT);
    expect(Object.keys(mine).every((d) => daily[d] === 1)).toBe(true);
    expect(daily[TOMORROW]).toBeUndefined();
    /* the newest ten of theirs: today and the nine before */
    expect(r.added.dailies).toBe(10);
    expect(daily[TODAY]).toBe(1);
    /* full already, nothing */
    const full: Record<string, 1> = {};
    for (let i = 0; i < 60; i++) full[localDay(NOW - (100 + i) * DAY)] = 1;
    expect(holds({ "bm.game.v1": { daily: full } }, { "bm.game.v1": { daily: theirs } }).writes).toEqual({});
  });

  it("takes achievements, best scores and medals only where absent, and nothing else of the game record", () => {
    const r = holds(here, { "bm.game.v1": {
      ach: { "first-light": NOW - 99 * DAY, "boss-down": NOW - DAY },
      best: { daily: { score: 0, hearts: 0, day: TODAY }, standard: { score: 5, hearts: 1, day: TODAY } },
      enc: { "ch01/practice": { medal: 1, day: TODAY }, "ch02/practice": { medal: 2, day: TODAY } },
      cmp: { ch01: { e9: 1 } }, maxed: 99, v: 1, other: 1
    } as unknown as Stores });
    const g = r.after["bm.game.v1"] as Record<string, Record<string, unknown>>;
    expect(g.ach).toEqual({ "first-light": NOW - 9 * DAY, "boss-down": NOW - DAY });
    expect(g.best.daily).toEqual({ score: 10, hearts: 3, day: "2026-09-01" });
    expect(g.enc["ch01/practice"]).toEqual({ medal: 3, day: "2026-09-01" });
    expect(g.cmp).toBeUndefined();
    expect(g.maxed).toBeUndefined();
    expect(g.other).toBeUndefined();
    expect(r.line).toBe("1 achievement, 1 medal and 1 best score.");
  });

  it("takes lesson places, where to continue from and settings only where this browser has none", () => {
    const r = holds(here, { "bm.lesson.v1": { reached: { ch09: 9, ch01: 3 }, mode: "page" }, "bm.last": { id: "ch01", section: null }, "bm.prefs.v1": { sound: true }, "bm.theme": "light" });
    expect(r.after["bm.lesson.v1"]).toEqual({ reached: { ch09: 2, ch01: 3 }, mode: "steps" });
    expect(r.after["bm.last"]).toEqual({ id: "ch09", section: null });
    expect(r.after["bm.prefs.v1"]).toEqual({ sound: false, calm: true });
    expect(r.after["bm.theme"]).toBe("light");
    expect(r.line).toBe("Your place in 1 lesson and your theme.");
    /* to a browser with none of them */
    expect(holds({}, { "bm.last": { id: "ch01", section: null }, "bm.prefs.v1": { sound: true } }).line).toBe("Where to continue from and your sound and display settings.");
  });

  it("never writes over a value here it cannot read, or one that is not a record", () => {
    const damaged: Record<string, unknown> = {
      "bm.progress.v1": "{not json", "bm.attempts.v1": { ch01: "x", ch02: [1] }, "bm.game.v1": { sec: "x", daily: [], ach: null },
      "bm.activity.v1": { days: 5 }, "bm.lesson.v1": [], "bm.theme": "{bad", "bm.last": null, "bm.play.v1": { ch01: { done: "x" } }
    };
    const r = holds(damaged, { "bm.progress.v1": { ch01: { solved: { e1: true } } }, "bm.attempts.v1": { ch01: { e1: { solved: NOW } }, ch02: { e1: { solved: NOW } } },
      "bm.game.v1": { sec: { a: { box: 1 } }, daily: { [TODAY]: 1 }, ach: { x: NOW } }, "bm.activity.v1": { days: { [TODAY]: 3 } }, "bm.lesson.v1": { reached: { ch01: 2 } },
      "bm.theme": "dark", "bm.last": { id: "ch01", section: null }, "bm.play.v1": { ch01: { done: { a: true } } } });
    expect(r.writes).toEqual({});
  });

  it("never writes a key named __proto__ as a prototype", () => {
    const evil = JSON.parse('{"bm.progress.v1":{"__proto__":{"solved":{"x":true}},"ch01":{"solved":{"__proto__":true}}}}');
    const r = holds({}, evil);
    expect(({} as Record<string, unknown>).solved).toBeUndefined();
    expect(r.added.solved).toBe(0);
  });
});

/* review round 3 (scratchpad rev/adv.test.cjs and carry-round3.json), each payload as it
   was crafted, against the browser it was aimed at: nothing there changes, and what is
   added is what the question says */
describe("review round 3's payloads", () => {
  const sec = { "ch01#s1": { n: 6, ok: 6, box: 4, last: localDay(NOW - 3 * DAY) }, "ch01#s2": { n: 5, ok: 5, box: 3, last: localDay(NOW - 2 * DAY) }, "ch02#s1": { n: 4, ok: 4, box: 4, last: localDay(NOW - 5 * DAY) } };
  const T = NOW - DAY;
  const attempts = { ch01: { e1: { tries: 1, solved: T, first: 1, section: "s1" }, e2: { tries: 1, solved: T, first: 1, section: "s1" } } };

  it("ADV1: a later day and box 0 for every section lowers no review box", async () => {
    const s = await link({ v: 1, s: { "bm.game.v1": { sec: { "ch01#s1": { box: 0, last: TOMORROW }, "ch01#s2": { box: 0, last: TODAY }, "ch02#s1": { box: 0, last: TODAY } } } } });
    const r = holds({ "bm.game.v1": { sec } }, s);
    expect(r.writes).toEqual({});
  });

  it("ADV2: a first-try answer is never made not-first, and no hints or tries are added", async () => {
    const s = await link({ v: 1, s: { "bm.attempts.v1": { ch01: { e1: { solved: Date.UTC(2024, 0, 1), first: 0, hints: 10, tries: 1000 }, e2: { solved: Date.UTC(2024, 0, 1), first: 0, hints: 10, tries: 1000 } } } } });
    expect(holds({ "bm.attempts.v1": attempts }, s).writes).toEqual({});
  });

  it("ADV3: an owner's goal, reading mode and place to continue replace nothing, and nothing is set aside for an account", async () => {
    const here = { "bm.activity.v1": { days: {}, goal: 50 }, "bm.lesson.v1": { reached: { ch01: 3 }, mode: "page" }, "bm.last": { id: "ch05", section: "s3" }, "bm.progress.v1": { ch01: { solved: { e1: true } } } };
    const s = await link({ v: 1, a: { user: "u1", resetAt: 0 }, s: { "bm.progress.v1": { ch01: { solved: { e9: true } } }, "bm.activity.v1": { goal: 5 }, "bm.lesson.v1": { mode: "steps" }, "bm.last": { id: "ch01", section: null } } });
    const r = holds(here, s);
    expect(Object.keys(r.writes)).toEqual(["bm.progress.v1"]);
    expect(r.line).toBe("1 exercise solved.");
    /* a browser with none of them gets no goal or mode either */
    const fresh = holds({}, s);
    expect(fresh.after["bm.activity.v1"]).toBeUndefined();
    expect(fresh.after["bm.lesson.v1"]).toBeUndefined();
  });

  it("ADV4: 60 Daily days up to tomorrow push out none of this browser's, and none is after today", async () => {
    const own: Record<string, 1> = {};
    for (let i = 0; i < 20; i++) own[localDay(NOW - (100 + i * 3) * DAY)] = 1;
    const fake: Record<string, 1> = {};
    for (let i = -1; i < 59; i++) fake[localDay(NOW - i * DAY)] = 1;
    const s = await link({ v: 1, a: { user: "u1", resetAt: 0 }, s: { "bm.progress.v1": { ch01: { solved: { e9: true } } }, "bm.game.v1": { daily: fake } } });
    const r = holds({ "bm.game.v1": { daily: own } }, s);
    const daily = (r.after["bm.game.v1"] as Record<string, Record<string, 1>>).daily;
    expect(Object.keys(own).every((d) => daily[d] === 1)).toBe(true);
    expect(Object.keys(daily)).toHaveLength(DAILY_KEPT);
    expect(daily[TOMORROW]).toBeUndefined();
    expect(r.line).toBe("1 exercise solved and 40 Dailies played.");
  });

  it("the local lens's cases: unsolved tries, opened solutions, guesses, made-up ids and the run store's day records", async () => {
    const here = { "bm.attempts.v1": { ch01: { e1: { tries: 1, solved: T, first: 1 } } }, "bm.play.v1": { ch03: { done: {}, total: 6 } } };
    const s = await link({ v: 1, s: {
      "bm.attempts.v1": { ch01: { e2: { tries: 1 }, e3: { opened: 1 }, e1: { solved: T - DAY, first: 0 } } },
      "bm.play.v1": { ch03: { guess: 0, done: {} } },
      "bm.run.v1": { daily: { day: TODAY }, arenaDay: { day: TODAY, sec: { a: 1000000 } } },
      "bm.game.v1": { ach: { "no-such-achievement": T }, sec: { "ch01#addition": { box: 0, last: TOMORROW } } }
    } }, NOW, { chapters: ["ch01", "ch03"], sections: ["ch01#addition"], achievements: ["first-light"] });
    const r = holds(here, s);
    /* an unsolved record is no record; a sec day after today is dropped, and with it nothing is left */
    expect(r.writes).toEqual({ "bm.game.v1": { sec: { "ch01#addition": { box: 0 } } } });
    expect(r.after["bm.run.v1"]).toBeUndefined();
  });
});

/* Any browser and any input: every value already here is there after, unchanged; only
   the keys a carry takes are written; the question's counts are exactly what was added;
   and adding again adds nothing. Over random states of both sides, made of the site's
   own shapes with values of every wrong kind mixed in, and of shapes that are not the
   site's at all, both through check() (as the receiver runs it) and straight into
   add(), which must hold on its own. */
/* random states of a browser and of what is carried, by seed (below) */
function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function states(seed: number) {
  const r = rng(seed);
  const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
  const days = [localDay(NOW - 2 * DAY), localDay(NOW - DAY), TODAY, TOMORROW, "2023-12-31", "2026-02-30", "2026-09-01", "x"];
  const ids = ["ch01", "ch02", "ch03", "__proto__", "e1", "e2", "", "a".repeat(130)];
  const junk = () => pick<unknown>([null, 0, -1, 1, 1e300, NaN, "x", true, false, [], [1], {}, { a: 1 }, NOW, NOW + DAY, "2026-10-01"]);
  const value = (good: () => unknown) => (r() < 0.75 ? good() : junk());
  const mapOf = (keys: string[], each: () => unknown, n = 4) => {
    const o: Record<string, unknown> = {};
    for (let i = 0; i < n; i++) if (r() < 0.6) o[pick(keys)] = value(each);
    return o;
  };
  const attempt = () => mapOf(["tries", "hints", "opened", "solved", "first", "section", "rung", "other"], () => pick<unknown>([1, 0, 3, NOW - DAY, NOW + DAY, "s1"]), 5);
  const secRec = () => mapOf(["n", "ok", "box", "last", "fix", "other"], () => pick<unknown>([0, 1, 4, 9, TODAY, TOMORROW, NOW]), 5);
  const state = (): Record<string, unknown> => {
    const s: Record<string, unknown> = {
      "bm.progress.v1": mapOf(ids, () => mapOf(["solved", "total", "x"], () => (r() < 0.7 ? mapOf(ids, () => pick<unknown>([true, false, 1])) : pick<unknown>([3, 10])))),
      "bm.play.v1": mapOf(ids, () => mapOf(["done", "total", "guess"], () => (r() < 0.7 ? mapOf(ids, () => pick<unknown>([true, 1])) : 2))),
      "bm.attempts.v1": mapOf(ids, () => mapOf(ids, attempt)),
      "bm.activity.v1": mapOf(["days", "goal", "x"], () => (r() < 0.7 ? mapOf(days, () => pick<unknown>([1, 50, 0, -5, 1e9])) : 40)),
      "bm.lesson.v1": mapOf(["reached", "mode"], () => (r() < 0.7 ? mapOf(ids, () => pick<unknown>([1, 3, 0, 2000])) : "steps")),
      "bm.last": pick<unknown>([undefined, null, { id: "ch01", section: null }, { id: "ch02", section: "s1" }, "x"]),
      "bm.game.v1": mapOf(["sec", "daily", "ach", "best", "enc", "cmp", "maxed", "v", "x"], () => pick<() => unknown>([
        () => mapOf(["ch01#s1", "ch01#s2", "ch02#s1", "__proto__"], secRec),
        () => mapOf(days, () => 1, 8),
        () => mapOf(["first-light", "boss-down", "x"], () => pick<unknown>([NOW - DAY, NOW + DAY, 0])),
        () => mapOf(["daily", "standard", "boss:ch01", "x"], () => mapOf(["score", "hearts", "day"], () => pick<unknown>([1, 5, TODAY]))),
        () => mapOf(["ch01/practice", "ch02/review", "x"], () => mapOf(["medal", "day"], () => pick<unknown>([1, 3, TODAY]))),
        () => pick<unknown>([1, 99])
      ])(), 6),
      "bm.prefs.v1": pick<unknown>([undefined, { sound: true }, { sound: "x" }, []]),
      "bm.theme": pick<unknown>([undefined, "dark", "light", "purple", "{not json"]),
      "bm.run.v1": pick<unknown>([undefined, { daily: { day: TODAY } }]),
      "bm.sync.pending.v1": pick<unknown>([undefined, { u1: { state: {} } }])
    };
    Object.keys(s).forEach((k) => { if (s[k] === undefined || r() < 0.15) delete s[k]; else if (r() < 0.05) s[k] = junk(); });
    return JSON.parse(JSON.stringify(s));
  };
  return { here: state(), carried: state() };
}

describe("adding only, over random states", () => {
  it("never changes or removes a value here, and says exactly what it adds", () => {
    let wrote = 0, tried = 0;
    for (let seed = 1; seed <= 1500; seed++) {
      const { here, carried } = states(seed);
      const checked = check(clone(carried), { now: NOW });
      for (const input of [checked.ok ? checked.stores : null, carried]) {
        if (!input) continue;
        tried++;
        const r = carry(here, input);
        const why = unchanged(here, r.after);
        if (why) throw new Error("seed " + seed + ": " + why);
        expect(Object.keys(r.writes).every((k) => TAKEN.indexOf(k) >= 0), "seed " + seed).toBe(true);
        if (input === carried) continue;
        /* through check(), the counts are what was added, and a second time adds nothing */
        expect(r.added, "seed " + seed).toEqual(counted(here, r.after));
        expect(adds(add(reader(r.after), input, NOW).added), "seed " + seed).toBe(false);
        if (Object.keys(r.writes).length) wrote++;
      }
    }
    /* the states are not so broken that nothing is ever added */
    expect(tried).toBeGreaterThan(1500);
    expect(wrote).toBeGreaterThan(300);
  });

  it("holds for round 3's payloads against random browsers", async () => {
    const payloads = [
      { "bm.game.v1": { sec: { "ch01#s1": { box: 0, last: TOMORROW }, "ch01#s2": { box: 0, last: TODAY } }, daily: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [localDay(NOW - (i - 1) * DAY), 1])) } },
      { "bm.attempts.v1": { ch01: { e1: { solved: Date.UTC(2024, 0, 1), first: 0, hints: 10, tries: 1000 }, e2: { tries: 1 }, e3: { opened: 1 } } } },
      { "bm.activity.v1": { goal: 5 }, "bm.lesson.v1": { mode: "steps" }, "bm.last": { id: "ch01", section: null } },
      { "bm.progress.v1": { ch01: { solved: { e1: true }, total: 200 } }, "bm.play.v1": { ch03: { guess: 0 } }, "bm.theme": "light" }
    ];
    for (const p of payloads) {
      const s = await link({ v: 1, a: { user: "u1", resetAt: 1e300 }, s: p });
      for (let seed = 1; seed <= 300; seed++) {
        const { here } = states(seed * 7919);
        const r = carry(here, s);
        const why = unchanged(here, r.after);
        if (why) throw new Error("seed " + seed + ": " + why);
        expect(r.added).toEqual(counted(here, r.after));
      }
    }
  });
});

/* What this browser holds is text (localStorage), which the receiver reads with stored()
   and add() adds to. Writing a store back must not change anything already in it, read
   back as the site reads it (JSON.parse), compared value for value with Object.is: a
   number past the double range (1e999, read as Infinity, written as null) and -0
   (written as 0) are the cases review round 4 found. */
describe("adding only, to what this browser holds as text", () => {
  /* every value of `before` is in `after`, exactly (Object.is): a record may only gain keys */
  function strictly(before: unknown, after: unknown, at = ""): string | null {
    if (plain(before) || Array.isArray(before)) {
      if (Array.isArray(before) !== Array.isArray(after) || !after || typeof after !== "object") return at + ": became " + String(after);
      for (const k of Object.keys(before)) {
        if (!Object.prototype.hasOwnProperty.call(after, k)) return at + "/" + k + ": removed";
        const why = strictly((before as Record<string, unknown>)[k], (after as Record<string, unknown>)[k], at + "/" + k);
        if (why) return why;
      }
      return Array.isArray(before) && (after as unknown[]).length !== before.length ? at + ": length changed" : null;
    }
    return Object.is(before, after) ? null : at + ": " + String(before) + " became " + String(after);
  }
  /* the browser's text after add()'s writes, as BMStore.write stores them */
  function run(text: Record<string, string>, carried: Stores) {
    const r = add((k) => fromText(Object.prototype.hasOwnProperty.call(text, k) ? text[k] : null), carried, NOW);
    const after: Record<string, string> = Object.assign({}, text);
    Object.keys(r.writes).forEach((k) => { after[k] = JSON.stringify(r.writes[k]); });
    for (const k of Object.keys(text)) {
      let b: unknown, a: unknown;
      try { b = JSON.parse(text[k]); } catch (e) { if (after[k] !== text[k]) return { r, why: k + ": text that is not JSON was written over" }; continue; }
      a = JSON.parse(after[k]);
      const why = strictly(b, a, k);
      if (why) return { r, why };
    }
    return { r, why: null };
  }

  it("reads the site's own JSON, and anything else as the text it is", () => {
    expect(fromText(null)).toBeUndefined();
    expect(fromText(undefined)).toBeUndefined();
    expect(fromText('{"a":1,"b":[1,"x",null]}')).toEqual({ a: 1, b: [1, "x", null] });
    expect(fromText('"dark"')).toBe("dark");
    expect(fromText("null")).toBeNull();
    for (const t of ["1e999", "-0", '{"a": 1}', '{"a":1.0}', '{"a":1E2}', '{"a":-1e999}', "{not json", "dark", ' {"a":1}', '{"a":"\\u00e9"}']) {
      expect(fromText(t), t).toBe(t);
    }
  });

  it("round 4's cases: a 1e999 or -0 in a store is not written back as null or 0", () => {
    const game = '{"ach":{"first-light":1789214400000},"cmp":1e999}';
    const a = run({ "bm.game.v1": game }, { "bm.game.v1": { ach: { "boss-down": NOW - DAY } } });
    expect(a.why).toBeNull();
    expect(a.r.writes).toEqual({});
    const days = '{"days":{"2026-10-04":1e999,"2026-10-03":-0}}';
    const b = run({ "bm.activity.v1": days }, { "bm.activity.v1": { days: { "2026-10-01": 5 } } });
    expect(b.why).toBeNull();
    expect(b.r.writes).toEqual({});
    /* the same stores as the site writes them are added to */
    expect(run({ "bm.game.v1": '{"ach":{"first-light":1789214400000}}' }, { "bm.game.v1": { ach: { "boss-down": NOW - DAY } } }).r.added.achievements).toBe(1);
  });

  it("never changes a value already here, whatever the stored text, over random states", () => {
    const r = (() => { let seed = 99; return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; })();
    const forms = ["1e999", "-1e999", "-0", "1.0", "1E2", "5e-324", "0.1", "1e21", "-0.0"];
    let wrote = 0, odd = 0;
    for (let seed = 1; seed <= 1500; seed++) {
      const { here, carried } = states(seed);
      const text: Record<string, string> = {};
      Object.keys(here).forEach((k) => {
        let t = JSON.stringify(here[k]);
        if (r() < 0.5) t = t.replace(/(?<=[:[,])-?\d+(\.\d+)?([eE][+-]?\d+)?(?=[,}\]])/g, (m) => (r() < 0.25 ? (odd++, forms[Math.floor(r() * forms.length)]) : m));
        if (r() < 0.05) t = t.replace(":", ": ");
        text[k] = t;
      });
      const checked = check(clone(carried), { now: NOW, course: COURSE });
      for (const input of [checked.ok ? checked.stores : null, carried]) {
        if (!input) continue;
        const { r: out, why } = run(text, input);
        if (why) throw new Error("seed " + seed + ": " + why);
        if (Object.keys(out.writes).length) wrote++;
      }
    }
    expect(odd).toBeGreaterThan(500);
    expect(wrote).toBeGreaterThan(300);
  });
});

describe("a file of progress", () => {
  it("reads what Download my data writes, passing over the account's details", () => {
    const exported = { progress: fixture["bm.progress.v1"], play: fixture["bm.play.v1"], attempts: {}, activity: { days: {} }, lesson: { reached: {} }, last: null, game: {}, exported: "2026-10-05T12:00:00.000Z", account: "a@b.c", signInWith: ["github"], profile: { name: "A" } };
    const out = fromFile(JSON.stringify(exported, null, 2), NOW, COURSE);
    expect(out.ok && out.signedIn).toBe(false);
    if (!out.ok) return;
    expect(Object.keys(out.stores).sort()).toEqual(["bm.activity.v1", "bm.attempts.v1", "bm.game.v1", "bm.last", "bm.lesson.v1", "bm.play.v1", "bm.progress.v1"]);
    expect(JSON.stringify(out.stores)).not.toMatch(/a@b\.c|github/);
    /* and it only adds, as a link does */
    holds({ "bm.progress.v1": { ch01: { solved: { e1: true } }, ch04: { solved: { e1: true } } } }, out.stores);
  });

  it("reads what the old address's carry page offers: the settings, and that the reader was signed in", () => {
    const file = { format: "basic-mathematics-progress", v: 1, progress: fixture["bm.progress.v1"], device: { "bm.theme": "dark", "bm.prefs.v1": { sound: true } }, owner: { user: "u-1", resetAt: 0 } };
    const out = fromFile(JSON.stringify(file), NOW);
    expect(out.ok && Object.keys(out.stores).sort()).toEqual(["bm.prefs.v1", "bm.progress.v1", "bm.theme"]);
    expect(JSON.stringify(out)).not.toMatch(/u-1/);
    const signedIn = fromFile(JSON.stringify({ format: "basic-mathematics-progress", v: 1, device: { "bm.theme": "dark" }, signedIn: true }), NOW);
    expect(signedIn.ok && signedIn.signedIn).toBe(true);
    /* "Download my data" has no say in it */
    const mine = fromFile(JSON.stringify({ progress: {}, signedIn: true }), NOW);
    expect(mine.ok && mine.signedIn).toBe(false);
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
