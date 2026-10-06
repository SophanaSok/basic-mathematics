/* Progress carried from the old address to the new one, as the new address reads it:
   the fragment the legacy site's pages write (src/carry/send.js says how), and the file
   the account page's "Download my data" makes (assets/account.js exportData) or the
   legacy carry page offers when the fragment would be too long. No DOM and no window:
   src/ui/carry.ts asks the reader and writes what plan() returns, and the Vitest tests
   beside this file hold every rule here.

   What arrives is untrusted. Anyone can write a link to the new address with a fragment
   of their choosing, and anyone can hand a reader a file. So nothing here trusts it:
   the format is versioned and anything else is refused (`version`), and so is a game
   record that says its data is in a newer shape than this site writes (its `v`, which
   assets/account.js would otherwise keep, and stop saving to the account); the size is
   capped before and after inflating (`size`); its top level is a map of localStorage
   keys, every one of which must start with "bm." and none may name an auth token
   (`keys`, which refuses the whole of it: a payload that tries to plant something else
   is not one the old address wrote); nesting and node count are bounded; "__proto__" is
   taken out at every level. Then every store is rebuilt from what it holds, field by
   field, keeping only what the site itself writes (clean(): solved and done maps of
   true, but never a chapter's total, which its own page writes; counts, timestamps and
   days that are finite, in range, and never later than tomorrow; reset times no later
   than now; the settings' known values): anything else inside a store is left out and
   counted (`dropped`), a store that is not one at all is left out whole (`ignored`), so
   a value the merge cannot read never reaches it. The reader is then shown what it
   holds (summary(), which names every kind of thing that would be written) and asked,
   and nothing is written until they say yes; a payload with nothing to show is refused
   (`empty`). Nothing of it is ever put into the page as HTML.

   Whose progress it is. A reader who was signed in at the old address has their
   progress in their account, and signs in again here (the session is never carried).
   What their browser held there is theirs, not this browser's next reader's: the old
   site gives it to no other account (assets/account.js sync drops another account's
   progress at sign-in). So the old address sends the account's id with it (`a`), and
   here the synced stores are set aside for that account (bm.sync.pending.v1, as
   account.js setAside does at a sign-out), out of view, and merged into that account
   the next time it signs in on this browser; another account never takes them in.

   Where it goes (plan): the synced stores are merged with what this browser already
   holds by the site's own merge (BMAccount.merge in assets/account.js, the rule an
   account sync uses), with this browser's side as the local one, so its choices win
   where two devices simply disagree and nothing on either side is lost (the one rule of
   that merge that drops anything, the game record's latest 60 days of the Daily, keeps
   every day this browser had); the stores that stay on a device (the run store, the
   settings, the theme) are set only where this browser has none; progress set aside for
   a reader is merged per reader. The account binding (bm.sync.v1) is never written. */

import { LEGACY, ORIGIN } from "./origins.ts";

/** the fragment parameters src/carry/send.js and src/carry/page.js write */
export const PARAM = "bm-carry";
export const AT = "bm-at";
/** set by the legacy carry page, which a reader only reaches by asking: ask again even
    about a payload this browser has been asked about before */
export const ASK = "bm-ask";
/** the one format this file reads; send.js writes it as the first character */
export const FORMAT = "1";
/** The longest value of bm-carry the old address sends in an address, in characters;
    past it, the reader gets the carry page and a file instead. Chromium takes addresses
    up to 2 MB, and Firefox and Safari far more than this, but their documented limits
    differ and an address is also kept in the session history, so it is held to tens of
    kilobytes. Measured (format.test.ts): the saved-state fixture of a learner three
    chapters in is about 1.6 kB, a learner who has tried every exercise of the course,
    with every store full, about 11 kB. */
export const MAX_FRAGMENT = 32000;
/** the largest JSON a fragment may inflate to, in bytes: a compressed payload is
    stopped here, so a small fragment cannot inflate into a large one */
export const MAX_JSON = 1000000;
/** the largest file the import reads, in bytes ("Download my data" pretty-prints) */
export const MAX_FILE = 4000000;
export const MAX_DEPTH = 12;
export const MAX_NODES = 250000;
/** the newest shape of the synced data this site writes (SCHEMA in assets/account.js) */
export const SCHEMA = 1;
/** no record of the course is older than this: a time or a day before it is not one */
export const EARLIEST_DAY = "2024-01-01";
const EARLIEST = Date.UTC(2024, 0, 1);
const DAY_MS = 86400000;

/** the synced stores, by their field in BMAccount.merge, and their keys */
export const SYNCED: Record<string, string> = {
  progress: "bm.progress.v1", play: "bm.play.v1", attempts: "bm.attempts.v1",
  activity: "bm.activity.v1", lesson: "bm.lesson.v1", last: "bm.last", game: "bm.game.v1"
};
/** the stores that stay on a device: taken only where this browser has none */
export const DEVICE = ["bm.run.v1", "bm.prefs.v1", "bm.theme"];
/** progress set aside for a reader, by account (assets/account.js setAside) */
export const PENDING = "bm.sync.pending.v1";
/** never taken: the account binding, and this file's own record of what it has taken */
export const KEEP_OUT = ["bm.sync.v1", "bm.carry.v1"];
/** this browser's record of the payloads it has asked about (device only) */
export const FLAG = "bm.carry.v1";
/** the sign-in services assets/account.js knows (PROVIDERS) */
const PROVIDERS = ["google", "github", "discord", "facebook", "azure"];

export type Stores = Record<string, unknown>;
/** the account the progress belonged to at the old address: its id and its last reset */
export type Owner = { user: string; resetAt: number };
export type Refusal = "version" | "malformed" | "size" | "keys" | "unsupported" | "empty";
export type Outcome =
  | { ok: true; stores: Stores; ignored: string[]; dropped: number; owner?: Owner }
  | { ok: false; why: Refusal };
export type Merge = (local: Record<string, unknown>, remote: Record<string, unknown>) => Record<string, unknown>;

const SYNCED_KEYS = Object.keys(SYNCED).map((f) => SYNCED[f]);

function plain(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}
function own(o: Record<string, unknown>, k: string): unknown {
  return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
}
function has(o: Record<string, unknown>, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

/* --------------------------------------------------------------- hosts -- */

/** Where a carried fragment is read: the new address, a local server (the tests, npm
    run preview), and Cloudflare's own addresses for the project, production and
    previews (`<project>.pages.dev` and `<preview>.<project>.pages.dev`; Cloudflare adds
    a few characters to the project's name when the name is taken, so any pages.dev
    address serving this bundle counts). Not the old address: before the move it
    serves this same site, and a carry there would only go round in a circle. */
export function allowedHost(hostname: string): boolean {
  const host = String(hostname || "").toLowerCase();
  const production = new URL(ORIGIN).hostname;
  return host === production || host === "localhost" || host === "127.0.0.1" || host === "[::1]" ||
    /^([a-z0-9-]+\.)+pages\.dev$/.test(host);
}
/** the carry page of the legacy site, which sends this browser's old progress back to
    `path`; `file` asks it for the progress as a file whatever its size */
export function legacyCarryUrl(path: string, file?: boolean): string {
  return new URL("carry/", LEGACY).href + "?to=" + encodeURIComponent(path) + (file ? "&file=1" : "");
}

/* ------------------------------------------------------------- reading -- */

/** The old page's own fragment, as it may be put back into the address: never one that
    is itself a carried payload (a link to an old page whose fragment is #bm-carry=…
    would otherwise come back in the address after the genuine one was answered, and be
    asked about as if the old address had sent it), and never longer than an anchor. */
export function safeAt(at: string): string {
  const a = String(at || "").replace(/^#+/, "");
  if (a.length > 200 || a.indexOf(PARAM + "=") >= 0 || a.indexOf(AT + "=") >= 0) return "";
  return a;
}

/** the bm-carry value, the old fragment (safeAt) and whether the reader asked for it
    (bm-ask=1) from an address's hash, or null */
export function readHash(hash: string): { value: string; at: string; ask: boolean } | null {
  const h = String(hash || "").replace(/^#/, "");
  if (h.indexOf(PARAM + "=") !== 0) return null;
  const amp = h.indexOf("&");
  const value = h.slice(PARAM.length + 1, amp < 0 ? h.length : amp);
  let at = "", ask = false;
  if (amp >= 0) {
    const rest = h.slice(amp);
    const m = new RegExp("&" + AT + "=([^&]*)").exec(rest);
    if (m) { try { at = safeAt(decodeURIComponent(m[1])); } catch (e) { at = ""; } }
    ask = new RegExp("&" + ASK + "=1(&|$)").test(rest);
  }
  return { value, at, ask };
}

function fromBase64url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* inflates deflate-raw, giving up past `max` bytes (null) */
async function inflate(bytes: Uint8Array, max: number): Promise<Uint8Array | null> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    size += r.value.length;
    if (size > max) { try { await reader.cancel(); } catch (e) { /* gone already */ } return null; }
    parts.push(r.value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** The owner of a payload (`a`, which send.js writes from bm.sync.v1): absent is
    nobody's; present, it must be an account id and a reset time, or nothing is taken
    (a malformed one cannot be told from a signed-in reader's progress). The reset time
    is never later than `now`: it only decides which of the carried progress the account
    keeps (assets/account.js sync), and a carried one never applies a reset there. */
function ownerOf(x: unknown, now: number): Owner | null | false {
  if (x === undefined) return null;
  if (!plain(x)) return false;
  const user = own(x, "user"), resetAt = own(x, "resetAt");
  if (typeof user !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(user)) return false;
  if (resetAt !== undefined && !(typeof resetAt === "number" && isFinite(resetAt) && resetAt >= 0)) return false;
  return { user, resetAt: typeof resetAt === "number" ? Math.min(resetAt, now) : 0 };
}

/** The progress in a bm-carry value, checked (check()), or why it is refused. */
export async function decode(value: string, now: number = Date.now()): Promise<Outcome> {
  const v = String(value || "");
  if (v.length > MAX_FRAGMENT + 2) return { ok: false, why: "size" };
  if (v.charAt(0) !== FORMAT) return { ok: false, why: /^[0-9]/.test(v) ? "version" : "malformed" };
  const packing = v.charAt(1), data = v.slice(2);
  if ((packing !== "z" && packing !== "j") || !/^[A-Za-z0-9_-]+$/.test(data) || data.length % 4 === 1) return { ok: false, why: "malformed" };
  let bytes: Uint8Array | null;
  try { bytes = fromBase64url(data); } catch (e) { return { ok: false, why: "malformed" }; }
  if (packing === "z") {
    if (typeof DecompressionStream !== "function") return { ok: false, why: "unsupported" };
    try { bytes = await inflate(bytes, MAX_JSON); } catch (e) { return { ok: false, why: "malformed" }; }
    if (!bytes) return { ok: false, why: "size" };
  } else if (bytes.length > MAX_JSON) return { ok: false, why: "size" };
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch (e) { return { ok: false, why: "malformed" }; }
  if (!plain(payload)) return { ok: false, why: "malformed" };
  const ver = own(payload, "v");
  if (ver !== 1) return { ok: false, why: typeof ver === "number" ? "version" : "malformed" };
  const owner = ownerOf(own(payload, "a"), now);
  if (owner === false) return { ok: false, why: "malformed" };
  return check(own(payload, "s"), { now, owner });
}

/** The progress in a file: what "Download my data" writes ({ progress, play, attempts,
    activity, lesson, last, game, exported, and, signed in, the account's details, which
    are not stores and are passed over }), with the legacy carry page's `device` (the
    stores that stay on a device, by key) and `account` (the owner, as `a` above) when it
    wrote the file. A file of "Download my data" has no owner: the reader who imports it
    chose that file. */
export function fromFile(text: string, now: number = Date.now()): Outcome {
  if (String(text).length > MAX_FILE) return { ok: false, why: "size" };
  let data: unknown;
  try { data = JSON.parse(String(text).replace(/^﻿/, "")); } catch (e) { return { ok: false, why: "malformed" }; }
  if (!plain(data)) return { ok: false, why: "malformed" };
  const fmt = own(data, "format");
  if (fmt !== undefined && fmt !== "basic-mathematics-progress") return { ok: false, why: "malformed" };
  const ver = own(data, "v");
  if (ver !== undefined && ver !== 1) return { ok: false, why: typeof ver === "number" ? "version" : "malformed" };
  const owner = fmt === "basic-mathematics-progress" ? ownerOf(own(data, "owner"), now) : null;
  if (owner === false) return { ok: false, why: "malformed" };
  const stores: Stores = {};
  let found = 0;
  Object.keys(SYNCED).forEach((f) => {
    const value = own(data as Record<string, unknown>, f);
    if (value !== undefined) { stores[SYNCED[f]] = value; found++; }
  });
  const device = own(data, "device");
  if (device !== undefined) {
    if (!plain(device)) return { ok: false, why: "malformed" };
    for (const k of Object.keys(device)) {
      if (has(stores, k)) return { ok: false, why: "keys" };
      stores[k] = device[k];
      found++;
    }
  }
  if (!found) return { ok: false, why: "malformed" };
  return check(stores, { now, owner });
}

/* nesting and size: the deepest level and the number of values, or false past the caps;
   "__proto__" taken out on the way (JSON.parse makes it an own key) */
function bounded(x: unknown): boolean {
  let nodes = 0;
  const walk = (v: unknown, depth: number): boolean => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) return false;
    if (Array.isArray(v)) return v.every((e) => walk(e, depth + 1));
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (has(o, "__proto__")) delete o["__proto__"];
      return Object.keys(o).every((k) => walk(o[k], depth + 1));
    }
    return true;
  };
  return walk(x, 0);
}

/* -------------------------------------------------------------- shapes -- */

/* What each store may hold, field by field: the shapes the site writes
   (src/types/state.ts, read off the writers). A rule returns the value to keep, or
   undefined to leave it out; leaving something out counts it in `dropped`. Keys of
   records the site names by chapter, exercise or section are any string of up to 120
   characters (they are ids from the pages, and are never put into a page as HTML). */
type Ctx = { now: number; latest: string; dropped: number; newer: boolean };
type Rule = (v: unknown, c: Ctx) => unknown;

function localDay(t: number): string {
  const d = new Date(t), p = (n: number) => (n < 10 ? "0" : "") + n;
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function isDay(v: unknown, c: Ctx): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || v < EARLIEST_DAY || v > c.latest) return false;
  const d = new Date(v + "T00:00:00Z");
  return isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
const isKey = (k: string) => k !== "__proto__" && k.length > 0 && k.length <= 120;

const num = (max: number, min = 0): Rule => (v) => (typeof v === "number" && isFinite(v) && v >= min && v <= max ? v : undefined);
/** the reset time of a set-aside record: never later than now (ownerOf says why) */
const resetTime: Rule = (v, c) => (typeof v === "number" && isFinite(v) && v >= 0 ? Math.min(v, c.now) : undefined);
const whole = (max: number, min = 0): Rule => (v) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined);
const oneOf = (list: unknown[]): Rule => (v) => (list.indexOf(v) >= 0 ? v : undefined);
const bool: Rule = (v) => (typeof v === "boolean" ? v : undefined);
const flag: Rule = (v) => (v === 1 || v === true ? 1 : undefined);
const yes: Rule = (v) => (v === true ? true : undefined);
const text = (max: number): Rule => (v) => (typeof v === "string" && v.length <= max ? v : undefined);
const time: Rule = (v, c) => (typeof v === "number" && isFinite(v) && v >= EARLIEST && v <= c.now + DAY_MS ? v : undefined);
const day: Rule = (v, c) => (isDay(v, c) ? v : undefined);
const ids = (max: number): Rule => (v) => (Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string" && x.length <= 120) ? v.slice() : undefined);

/** a map whose every key is an id and every value passes `each` */
const map = (each: Rule, key?: (k: string, c: Ctx) => boolean): Rule => (x, c) => {
  if (!plain(x)) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(x)) {
    const v = isKey(k) && (!key || key(k, c)) ? each(x[k], c) : undefined;
    if (v === undefined) c.dropped++;
    else out[k] = v;
  }
  return out;
};
/** a field the site writes that is never taken from a carried store, and so is not
    counted as dropped either */
const notTaken: Rule = () => undefined;
/** a record of named fields, each with its rule; any other field is left out */
const rec = (rules: Record<string, Rule>): Rule => (x, c) => {
  if (!plain(x)) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(x)) {
    if (has(rules, k) && rules[k] === notTaken) continue;
    const v = has(rules, k) ? rules[k](x[k], c) : undefined;
    if (v === undefined) c.dropped++;
    else out[k] = v;
  }
  return out;
};
/** a record with nothing left in it is no record: an attempt that holds nothing the
    site writes is not an exercise tried */
const filled = (inner: Rule): Rule => (x, c) => {
  const r = inner(x, c);
  return plain(r) && !Object.keys(r).length ? undefined : r;
};
/** the newest `n` keys of a map of days */
const newest = (n: number, inner: Rule): Rule => (x, c) => {
  const m = inner(x, c) as Record<string, unknown> | undefined;
  if (!m) return m;
  const keys = Object.keys(m).sort();
  const out: Record<string, unknown> = {};
  keys.slice(-n).forEach((k) => { out[k] = m[k]; });
  c.dropped += Math.max(0, keys.length - n);
  return out;
};

const MODES = ["standard", "daily", "boss", "repair", "review"];
const COUNT = whole(1000000);

/* A chapter's `total` (its scored exercises, its missions) is not taken: the merge keeps
   the larger of two totals, so a total larger than the chapter's would make a finished
   chapter look unfinished here and, once synced, in the account, where no device could
   lower it again. The chapter's page writes the real total when it is opened (site.js
   initExercises, and Play.setTotal), and an account sync brings the one another device
   wrote. A chapter record with nothing else in it is no record. */
const STORE: Record<string, Rule> = {
  "bm.progress.v1": map(filled(rec({ solved: map(yes), total: notTaken }))),
  "bm.play.v1": map(filled(rec({ done: map(yes), total: notTaken, guess: whole(20) }))),
  "bm.attempts.v1": map(map(filled(rec({
    tries: whole(1000), hints: whole(10), rung: whole(10), opened: flag, inline: flag, section: text(120),
    solved: time, first: oneOf([0, 1]), skipped: flag
  })))),
  "bm.activity.v1": rec({ days: map(whole(100000), (k, c) => isDay(k, c)), goal: whole(500, 5) }),
  "bm.lesson.v1": rec({ reached: map(whole(1000)), mode: oneOf(["steps", "page"]) }),
  /* the place to continue from: null, or a chapter and a section (or null); else nothing */
  "bm.last": (v, c) => {
    if (v === null) return null;
    const r = rec({ id: text(120), section: (s) => (s === null ? null : text(120)(s, c)) })(v, c) as Record<string, unknown> | undefined;
    return r && typeof r.id === "string" && r.id ? r : undefined;
  },
  "bm.game.v1": (v, c) => {
    /* data marked newer than this site writes is refused whole, not merged (check()) */
    if (plain(v) && typeof own(v, "v") === "number" && (own(v, "v") as number) > SCHEMA) c.newer = true;
    return rec({
      ach: map(time),
      cmp: map(map(flag)),
      sec: map(rec({ n: COUNT, ok: COUNT, box: whole(4), last: day, fix: time })),
      best: map(rec({ score: whole(10000000), hearts: whole(10), day }), (k) => MODES.indexOf(k) >= 0),
      enc: map(rec({ medal: whole(3, 1), day })),
      daily: newest(60, map(flag, (k, c) => isDay(k, c))),
      maxed: COUNT,
      v: oneOf([SCHEMA])
    })(v, c);
  },
  "bm.theme": oneOf(["light", "dark"]),
  "bm.prefs.v1": rec({
    sound: bool, calm: bool, map: oneOf(["3d", "list"]), tempo: oneOf(["standard", "extended", "untimed"]),
    panel: oneOf(["light", "dark"]), volume: num(100), motion: oneOf(["reduce"]), transparency: oneOf(["reduce"]),
    gfx: oneOf(["auto", "low", "mid", "high"]), gfxAuto: oneOf(["list", "low", "medium"])
  }),
  /* this device's scratchpad; the Arena run in play (`arena`, whose shape assets/arena.js
     owns) is not taken: a run is started again at the new address */
  "bm.run.v1": rec({
    combo: rec({ pips: whole(100), shield: bool }),
    seen: rec({ level: whole(100000), ach: flag }),
    sets: map(rec({ practice: ids(500), review: ids(500), inline: ids(500) })),
    paid: ids(30),
    picks: map(flag),
    daily: rec({ day, score: whole(10000000), firstTry: whole(1000), n: whole(1000), planned: whole(1000), ended: text(32) }),
    arenaDay: rec({ day, sec: map(whole(1000000)), finishes: whole(1000) }),
    nextHide: day
  })
};
/* a synced state by field ({ progress, play, … }), as an account row and a set-aside
   record hold it */
const STATE: Rule = (x, c) => {
  if (!plain(x)) return undefined;
  const out: Record<string, unknown> = {};
  for (const f of Object.keys(x)) {
    const v = has(SYNCED, f) ? STORE[SYNCED[f]](x[f], c) : undefined;
    if (v === undefined) c.dropped++;
    else out[f] = v;
  }
  return out;
};
/* progress set aside for a reader: by account id, with how they signed in */
const ASIDE: Rule = map((r, c) => {
  if (!plain(r) || !plain(own(r, "state"))) return undefined;
  return rec({
    email: (v) => (typeof v === "string" && v.length <= 254 && (v === "" || /^[^\s@]+@[^\s@]+$/.test(v)) ? v : undefined),
    via: (v) => (Array.isArray(v) && v.length <= 5 && v.every((p) => PROVIDERS.indexOf(p) >= 0) ? v.slice() : undefined),
    resetAt: resetTime,
    state: STATE,
    at: time,
    carried: flag
  })(r, c);
}, (k) => /^[A-Za-z0-9-]{1,64}$/.test(k));
STORE[PENDING] = ASIDE;

/** The stores of a payload as this site may take them: refused whole when it is not a
    map of "bm." keys, is too big, or holds data newer than this site writes; every
    store rebuilt from what the site writes (the rules above), a store that is not one
    left out whole and named in `ignored`, anything left out inside one counted in
    `dropped`. With an owner, the run store (which goes with the owner's progress) is
    left out too. Refused as `empty` when nothing is left that the reader would be told
    about (summary()). */
export function check(stores: unknown, opts?: { now?: number; owner?: Owner | null }): Outcome {
  if (!plain(stores)) return { ok: false, why: "malformed" };
  const keys = Object.keys(stores);
  if (keys.some((k) => k.indexOf("bm.") !== 0 || /auth-token|^sb-/i.test(k))) return { ok: false, why: "keys" };
  if (!bounded(stores)) return { ok: false, why: "size" };
  const now = opts && typeof opts.now === "number" ? opts.now : Date.now();
  const owner = opts && opts.owner ? opts.owner : undefined;
  const c: Ctx = { now, latest: localDay(now + DAY_MS), dropped: 0, newer: false };
  const out: Stores = {}, ignored: string[] = [];
  keys.sort().forEach((k) => {
    const v = has(STORE, k) && !(owner && k === "bm.run.v1") ? STORE[k](stores[k], c) : undefined;
    if (v === undefined) ignored.push(k);
    else out[k] = v;
  });
  if (c.newer) return { ok: false, why: "version" };
  if (!describe(summary(out, owner))) return { ok: false, why: "empty" };
  return owner ? { ok: true, stores: out, ignored, dropped: c.dropped, owner } : { ok: true, stores: out, ignored, dropped: c.dropped };
}

/* ------------------------------------------------------------ describing -- */

function count(x: unknown): number {
  return plain(x) ? Object.keys(x).filter((k) => !!x[k]).length : 0;
}

export type Summary = {
  chapters: number; solved: number; xp: number; achievements: number; medals: number; record: boolean; settings: boolean;
  /** progress set aside for accounts, out of view until each signs in here */
  aside: { accounts: number; chapters: number; solved: number };
};

/* the chapters, solved exercises and XP of a synced state, by key */
function tally(stores: Stores) {
  const chapters = new Set<string>();
  let solved = 0, xp = 0;
  const progress = stores[SYNCED.progress], play = stores[SYNCED.play], attempts = stores[SYNCED.attempts];
  const lesson = stores[SYNCED.lesson], activity = stores[SYNCED.activity], game = stores[SYNCED.game];
  if (plain(progress)) Object.keys(progress).forEach((ch) => {
    const r = progress[ch];
    const n = plain(r) ? count(r.solved) : 0;
    if (n) { chapters.add(ch); solved += n; }
  });
  if (plain(play)) Object.keys(play).forEach((ch) => { const r = play[ch]; if (plain(r) && count(r.done)) chapters.add(ch); });
  if (plain(attempts)) Object.keys(attempts).forEach((ch) => { if (count(attempts[ch])) chapters.add(ch); });
  if (plain(lesson) && plain(lesson.reached)) Object.keys(lesson.reached).forEach((ch) => {
    const n = (lesson.reached as Record<string, unknown>)[ch];
    if (typeof n === "number" && n > 0) chapters.add(ch);
  });
  if (plain(game) && plain(game.cmp)) Object.keys(game.cmp).forEach((ch) => { if (count((game.cmp as Record<string, unknown>)[ch])) chapters.add(ch); });
  if (plain(activity) && plain(activity.days)) Object.keys(activity.days).forEach((d) => {
    const n = (activity.days as Record<string, unknown>)[d];
    if (typeof n === "number" && isFinite(n) && n > 0) xp += n;
  });
  return { chapters: chapters.size, solved, xp: Math.round(xp) };
}
function byKey(state: unknown): Stores {
  const out: Stores = {};
  if (plain(state)) Object.keys(SYNCED).forEach((f) => { if (has(state, f)) out[SYNCED[f]] = state[f]; });
  return out;
}

/** What the reader is told before anything is kept: every kind of thing that would be
    written. The chapters the progress touches (an exercise solved or tried, a mission
    done, a lesson step reached, a solution compared), the scored exercises solved, the
    XP, the achievements and medals, whether it holds an Arena or review record, whether
    settings come with it (the device's own stores, the reading mode, the daily goal, the
    place to continue from), and progress set aside for accounts. With an owner, the
    synced stores are that account's and are counted as set aside. */
export function summary(stores: Stores, owner?: Owner): Summary {
  const mine: Stores = {}, aside: Record<string, Stores> = {};
  Object.keys(stores).forEach((k) => { if (!(owner && SYNCED_KEYS.indexOf(k) >= 0)) mine[k] = stores[k]; });
  const pending = stores[PENDING];
  if (plain(pending)) Object.keys(pending).forEach((id) => { const r = pending[id]; if (plain(r)) aside[id] = byKey(r.state); });
  if (owner) {
    const theirs: Stores = {};
    SYNCED_KEYS.forEach((k) => { if (has(stores, k)) theirs[k] = stores[k]; });
    if (Object.keys(theirs).length) aside[owner.user] = Object.assign({}, aside[owner.user] || {}, theirs);
  }
  const t = tally(mine);
  const game = mine[SYNCED.game], activity = mine[SYNCED.activity], lesson = mine[SYNCED.lesson];
  const g = plain(game) ? game : {};
  const a = { accounts: 0, chapters: 0, solved: 0 };
  Object.keys(aside).forEach((id) => {
    const s = tally(aside[id]);
    if (s.chapters || s.solved || s.xp) { a.accounts++; a.chapters += s.chapters; a.solved += s.solved; }
  });
  return {
    chapters: t.chapters, solved: t.solved, xp: t.xp,
    achievements: count(g.ach), medals: count(g.enc),
    record: count(g.sec) > 0 || count(g.best) > 0 || count(g.daily) > 0 || (typeof g.maxed === "number" && g.maxed > 0),
    settings: DEVICE.some((k) => k in mine) || (plain(lesson) && "mode" in lesson) || (plain(activity) && "goal" in activity) ||
      (SYNCED.last in mine && mine[SYNCED.last] !== null),
    aside: a
  };
}

/** what the question says, plain text; "" when there is nothing to say (check() then
    refuses the payload as `empty`) */
export function describe(s: Summary): string {
  const n = (k: number, one: string, many: string) => k + " " + (k === 1 ? one : many);
  const list = (parts: string[]) => parts.length === 1 ? parts[0] : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const parts: string[] = [];
  if (s.chapters || s.solved) parts.push(n(s.chapters, "chapter", "chapters"), n(s.solved, "exercise solved", "exercises solved"));
  if (s.xp) parts.push(s.xp + " XP");
  if (s.achievements) parts.push(n(s.achievements, "achievement", "achievements"));
  if (s.medals) parts.push(n(s.medals, "medal", "medals"));
  if (s.record) parts.push("your Arena and review record");
  if (s.settings) parts.push("your settings");
  const out: string[] = [];
  if (parts.length) out.push(cap(list(parts)) + ".");
  if (s.aside.accounts) {
    out.push((s.aside.accounts === 1 ? "Progress of an account that was signed in at the old address (" : "Progress of " + s.aside.accounts + " accounts that were signed in at the old address (") +
      n(s.aside.chapters, "chapter", "chapters") + ", " + n(s.aside.solved, "exercise solved", "exercises solved") +
      "), kept in this browser out of view and saved to " + (s.aside.accounts === 1 ? "that account" : "each account") + " when it signs in here.");
  }
  return out.join(" ");
}

/* ------------------------------------------------------------- merging -- */

/* Two set-aside records (account.js setAside) of the same account. A record this
   browser set aside itself (not `carried`) keeps its own email, services and reset
   time, and stays its own: a carried record only adds progress to it, so a link cannot
   raise its reset time (which assets/account.js sync applies to the account) or name
   an email or service on it. Two carried records keep the later reset time, which
   decides only what of them the account keeps. */
function mergePending(a: unknown, b: unknown, merge: Merge): unknown {
  if (!plain(a)) return b;
  if (!plain(b)) return a;
  const num = (x: unknown) => (typeof x === "number" && isFinite(x) ? x : 0);
  const state = merge(plain(a.state) ? a.state : {}, plain(b.state) ? b.state : {}), at = Math.max(num(a.at), num(b.at));
  const kept = !!a.carried !== !!b.carried ? (a.carried ? b : a) : null;
  if (kept) {
    return { email: typeof kept.email === "string" ? kept.email : "", via: Array.isArray(kept.via) ? kept.via.slice() : [], resetAt: num(kept.resetAt), state, at };
  }
  const via: string[] = [];
  [a.via, b.via].forEach((list) => { if (Array.isArray(list)) list.forEach((p) => { if (typeof p === "string" && via.indexOf(p) < 0) via.push(p); }); });
  const out: Record<string, unknown> = {
    email: (typeof a.email === "string" && a.email) || (typeof b.email === "string" && b.email) || "",
    via,
    resetAt: Math.max(num(a.resetAt), num(b.resetAt)),
    state,
    at
  };
  if (a.carried || b.carried) out.carried = 1;
  return out;
}

/** What to write for carried stores, given what this browser holds (`read` gives a
    store's parsed value, or undefined where there is none or it cannot be read): the
    key -> value pairs, each a merge that keeps both sides, or a device store this
    browser does not have. Nothing else is touched. With an owner, the synced stores go
    to that account's set-aside record instead of into this browser's progress. */
export function plan(read: (key: string) => unknown, carried: Stores, merge: Merge, owner?: Owner, now: number = Date.now()): Record<string, unknown> {
  const writes: Record<string, unknown> = {};
  const fields = Object.keys(SYNCED).filter((f) => has(carried, SYNCED[f]));
  let theirs: Record<string, unknown> | null = null;
  if (fields.length && owner) {
    const state: Record<string, unknown> = {};
    fields.forEach((f) => { state[f] = carried[SYNCED[f]]; });
    theirs = { [owner.user]: { email: "", via: [], resetAt: owner.resetAt, state, at: now, carried: 1 } };
  } else if (fields.length) {
    const local: Record<string, unknown> = {}, remote: Record<string, unknown> = {};
    Object.keys(SYNCED).forEach((f) => {
      const here = read(SYNCED[f]);
      if (here !== undefined) local[f] = here;
      if (has(carried, SYNCED[f])) remote[f] = carried[SYNCED[f]];
    });
    const merged = merge(local, remote);
    /* the game record keeps the latest 60 days of the Daily: every one this browser had
       stays, and carried days fill what room is left, newest first */
    if (plain(merged.game) && plain(local.game) && plain(local.game.daily)) {
      const mineDays = Object.keys(local.game.daily).filter((d) => d !== "__proto__" && (local.game as { daily: Record<string, unknown> }).daily[d]);
      const all = Object.keys(merged.game.daily as object);
      if (mineDays.some((d) => all.indexOf(d) < 0)) {
        const room = Math.max(60, mineDays.length) - mineDays.length;
        const extra = all.filter((d) => mineDays.indexOf(d) < 0).sort().reverse().slice(0, room);
        const daily: Record<string, 1> = {};
        mineDays.concat(extra).sort().forEach((d) => { daily[d] = 1; });
        merged.game = Object.assign({}, merged.game, { daily });
      }
    }
    fields.forEach((f) => { writes[SYNCED[f]] = f === "last" ? (merged[f] === undefined ? null : merged[f]) : merged[f]; });
  }
  DEVICE.forEach((k) => {
    if (has(carried, k) && read(k) === undefined) writes[k] = carried[k];
  });
  if (plain(carried[PENDING]) || theirs) {
    const here = read(PENDING);
    const mine: Record<string, unknown> = plain(here) ? here : {};
    /* every set-aside record that arrives is marked `carried`: the account page then says
       it came from the old address, and never repeats an email or a service it names;
       arriving for an account this browser has set progress aside for itself, it only
       adds its progress to that record (mergePending) */
    const incoming: Record<string, unknown> = {};
    if (plain(carried[PENDING])) Object.keys(carried[PENDING] as object).forEach((id) => {
      const r = (carried[PENDING] as Record<string, unknown>)[id];
      if (id !== "__proto__" && plain(r)) incoming[id] = Object.assign({}, r, { carried: 1 });
    });
    if (theirs) Object.keys(theirs).forEach((id) => { incoming[id] = has(incoming, id) ? mergePending(incoming[id], theirs![id], merge) : theirs![id]; });
    const out: Record<string, unknown> = {};
    Object.keys(mine).concat(Object.keys(incoming)).forEach((id) => {
      if (id === "__proto__" || has(out, id)) return;
      out[id] = mergePending(own(mine, id), own(incoming, id), merge);
    });
    writes[PENDING] = out;
  }
  return writes;
}

/* --------------------------------------------------------- remembering -- */

/** a short fingerprint of a payload, for this browser's record that it asked (cyrb53) */
export function fingerprint(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The record of payloads asked about, with this one added: { seen: { <fingerprint>:
    { at, took } } }, the newest 20 kept. */
export function remember(flag: unknown, print: string, took: boolean, now: number): { seen: Record<string, { at: number; took: boolean }> } {
  const seen: Record<string, { at: number; took: boolean }> = {};
  const old = plain(flag) && plain(flag.seen) ? flag.seen : {};
  Object.keys(old).forEach((k) => {
    const r = old[k];
    if (k !== "__proto__" && plain(r) && typeof r.at === "number") seen[k] = { at: r.at, took: r.took === true };
  });
  seen[print] = { at: now, took };
  const keep = Object.keys(seen).sort((a, b) => seen[b].at - seen[a].at).slice(0, 20);
  const out: Record<string, { at: number; took: boolean }> = {};
  keep.forEach((k) => { out[k] = seen[k]; });
  return { seen: out };
}
export function asked(flag: unknown, print: string): boolean {
  return plain(flag) && plain(flag.seen) && Object.prototype.hasOwnProperty.call(flag.seen, print);
}
