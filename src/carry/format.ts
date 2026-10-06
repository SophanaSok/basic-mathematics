/* Progress carried from the old address to the new one, as the new address reads it:
   the fragment the legacy site's pages write (src/carry/send.js says how), and the file
   the account page's "Download my data" makes (assets/account.js exportData) or the
   legacy carry page offers when the fragment would be too long. No DOM and no window:
   src/ui/carry.ts asks the reader and writes what add() returns, and the Vitest tests
   beside this file hold every rule here.

   Two things make it safe, each on its own.

   1. Where it came from (fromLegacy). A fragment is read only when the page was reached
      from the old address itself: document.referrer's origin must be exactly the legacy
      origin (src/carry/origins.ts LEGACY; LEGACY_LOCAL on a local server). The legacy
      stubs leave with location.replace under a referrer policy that sends their origin
      (tools/build-legacy.js), and a page on any other origin cannot make a browser send
      that origin as the referrer of a navigation it starts: the HTML standard takes the
      referrer from the document that starts the navigation (for location.replace and the
      location setter, the incumbent settings object's document, so a page that sets the
      location of a window it opened on the old origin is still the referrer). So a link
      someone else wrote is dropped unread. What this cannot tell apart is any script
      that runs at sophanasok.github.io: every GitHub Pages site of the account (the user
      site and every project site, now or later) is that origin, and script on any of them,
      the owner's or injected into one of them or loaded by one from a third party, can
      send any payload a stub could, from any path, or write bm.* keys for a stub to send.
      So every page there is held to the rule in OPERATIONS.md section 8 (no untrusted text
      as HTML, no third-party script, a strict CSP), which lists those sites and when they
      were last checked; rule 2 below holds whatever arrives. The referrer
      is the document's, not the fragment's: a page that kept a handle on the window
      (it opened the stub) could change the fragment of the page that arrived without
      a new document, or reload it or go back to it with its fragment swapped. So the
      new address sends Cross-Origin-Opener-Policy: same-origin (tools/lib/headers.js),
      which takes that handle away the moment the page arrives, and a fragment is read
      only on the document's own first load (freshLoad: a navigation, never a reload,
      a step back or forward, or a restored session). A file is the learner's own
      choice and is not gated.

   2. What it can do (add). Whatever arrives, and however it arrived, it can only add what
      this browser does not have; it never replaces, lowers or removes anything already
      here, and the merge rules of accounts (BMAccount.merge) are never run on it:
        progress, play   exercises solved and missions done, added to the sets
        attempts         an exercise's record, only where this browser has none at all
        activity         XP days this browser has none of, none after today; never the goal
        lesson           a chapter's place in its lesson, only where this browser has none
        bm.last          where to continue, only where this browser has none
        game             a section's review place where this browser has none for it;
                         Daily days not later than today, only where absent and within the
                         room the site's 60 leaves after this browser's own; achievements,
                         best scores and rematch medals only where absent; the schema
                         version only where absent; nothing else of the record
        prefs, theme     only where this browser has none
      Nothing else is taken: no account record (bm.sync.v1, bm.sync.pending.v1, an owner),
      no run store, no goal or reading mode. A learner who was signed in at the old address
      signs in here, and the old address says only that they were (`w`), nothing about the
      account. add() returns both what to write and the counts of what it adds, and the
      question the reader is asked is made from those counts, so what they are told and
      what is done cannot drift apart. What this browser holds is read as the site wrote
      it (stored()): a value whose text is not what JSON.stringify writes for it (a
      number past the double range, -0, spacing) is not added to, so nothing in a store
      is changed by writing the store back.

      What is added is this browser's from then on, as anything done here is: signed in,
      the account saves it; signed out, it joins an account at the next sign-in by the
      account's own merge (assets/account.js), as progress made here signed out does,
      and the question says so. The account's merge is not add(): where the account has
      the same section, exercise or Daily days, its rules decide (a section's later
      review wins, an answer is first only if first on both, the newest 60 Dailies are
      kept), exactly as for a second device that was used signed out. Carried progress
      is the learner's own (from their old browser, through the gate above, or a file
      they chose), so it is held to the bar of their own second device and no higher.

   Before either, what arrives is read as untrusted: one versioned format (`version`),
   sizes capped before and after inflating (`size`), a top level of "bm." keys and never
   an auth token (`keys`, which refuses the whole of it), bounded nesting and node count,
   "__proto__" taken out at every level, and every store rebuilt field by field from what
   the site itself writes (check()): anything else is left out and counted. Nothing of it
   is ever put into the page as HTML. */

import { LEGACY, LEGACY_LOCAL, ORIGIN } from "./origins.ts";

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
/** the Daily days the site keeps (assets/account.js mergeGame: the latest 60) */
export const DAILY_KEPT = 60;
/** no record of the course is older than this: a time or a day before it is not one */
export const EARLIEST_DAY = "2024-01-01";
const EARLIEST = Date.UTC(2024, 0, 1);

/** the synced stores, by their field in BMAccount.merge, and their keys */
export const SYNCED: Record<string, string> = {
  progress: "bm.progress.v1", play: "bm.play.v1", attempts: "bm.attempts.v1",
  activity: "bm.activity.v1", lesson: "bm.lesson.v1", last: "bm.last", game: "bm.game.v1"
};
/** the settings that stay on a device: taken only where this browser has none */
export const DEVICE = ["bm.prefs.v1", "bm.theme"];
/** every key a carry may write; send.js sends these and no other */
export const TAKEN = Object.keys(SYNCED).map((f) => SYNCED[f]).concat(DEVICE);
/** this browser's record of the payloads it has asked about (device only) */
export const FLAG = "bm.carry.v1";

export type Stores = Record<string, unknown>;
export type Refusal = "version" | "malformed" | "size" | "keys" | "unsupported";
/** A payload read and checked: its stores, rebuilt (check()), and whether the old
    address had a signed-in account (`w`), which is all it says of one. */
export type Outcome =
  | { ok: true; stores: Stores; signedIn: boolean; ignored: string[]; dropped: number }
  | { ok: false; why: Refusal };
/** what the course has, from the page (window.BM_CURRICULUM, BMGame.ACHIEVEMENTS):
    chapter ids, section ids as "<chapter>#<section>", and achievement ids. Given, a
    carried key that names none of them is left out. */
export type Course = { chapters: string[]; sections: string[]; achievements?: string[] };
/** what this browser holds under a key: its parsed value, undefined where there is none;
    a value that is not JSON is passed as the text it is, and is never written over */
export type Read = (key: string) => unknown;

function plain(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}
function own(o: Record<string, unknown>, k: string): unknown {
  return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
}
function has(o: unknown, k: string): boolean {
  return plain(o) && Object.prototype.hasOwnProperty.call(o, k);
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
  return host === production || LOOPBACK.indexOf(host) >= 0 || /^([a-z0-9-]+\.)+pages\.dev$/.test(host);
}
const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

/** Whether a page at `pageOrigin` was reached from the old address: `referrer`
    (document.referrer) has exactly the legacy origin, and is not the page's own. On a
    page served from a local server other than LEGACY_LOCAL's host, the old address is
    LEGACY_LOCAL's host on any port (the browser test and the runbook's local trial
    serve the legacy site there); nowhere else is it anything but LEGACY's origin. No
    referrer, a malformed one, or any other origin is not the old address. */
export function fromLegacy(referrer: string, pageOrigin: string): boolean {
  let ref: URL, page: URL;
  try { ref = new URL(String(referrer || "")); page = new URL(String(pageOrigin || "")); } catch (e) { return false; }
  if (ref.origin === "null" || ref.origin === page.origin || (ref.protocol !== "https:" && ref.protocol !== "http:")) return false;
  if (ref.origin === new URL(LEGACY).origin) return true;
  const local = new URL(LEGACY_LOCAL);
  return LOOPBACK.indexOf(page.hostname) >= 0 && page.hostname !== local.hostname &&
    ref.protocol === local.protocol && ref.hostname === local.hostname;
}

/** Whether the document was loaded by a navigation to it: `entries` is
    performance.getEntriesByType("navigation"), whose first entry's type is "navigate" for
    a link, location.replace or a typed address, and "reload", "back_forward" or
    "prerender" otherwise (Navigation Timing Level 2). A fragment that is there on a
    reload or a step back or forward may have been put there after the referrer was set,
    by a same-document navigation the referrer does not describe, so it is not read; nor
    when the browser does not say. */
export function freshLoad(entries: unknown): boolean {
  if (!Array.isArray(entries) || !entries.length) return false;
  const first = entries[0] as { type?: unknown } | null;
  return !!first && typeof first === "object" && first.type === "navigate";
}

/** What this browser holds under a key, from the text localStorage gives: undefined where
    there is none; the parsed value when the text is exactly what JSON.stringify writes for
    it, as the site writes every store (BMStore.write); otherwise the text itself, which
    add() never writes over or into, so that writing a store back can never change what is
    in it (a 1e999 read as Infinity and written as null, a -0 written as 0). */
export function stored(raw: string | null | undefined): unknown {
  if (raw === null || raw === undefined) return undefined;
  let v: unknown;
  try { v = JSON.parse(raw); } catch (e) { return raw; }
  return JSON.stringify(v) === raw ? v : raw;
}

/** the carry page of the legacy site, which sends this browser's old progress back to
    `path`; `file` asks it for the progress as a file whatever its size */
export function legacyCarryUrl(path: string, file?: boolean): string {
  return new URL("carry/", LEGACY).href + "?to=" + encodeURIComponent(path) + (file ? "&file=1" : "");
}

/* ------------------------------------------------------------- reading -- */

/** The old page's own fragment, as it may be put back into the address: never one that
    is itself a carried payload, and never longer than an anchor. */
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

/** The progress in a bm-carry value, checked (check()), or why it is refused. The
    payload is { v: 1, s: { <key>: <value>, … }, w?: 1 }; anything else at its top level
    (an account record older drafts of send.js wrote among them) is passed over. */
export async function decode(value: string, now: number = Date.now(), course?: Course): Promise<Outcome> {
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
  const w = own(payload, "w");
  return check(own(payload, "s"), { now, course, signedIn: w === 1 || w === true });
}

/** The progress in a file: what "Download my data" writes ({ progress, play, attempts,
    activity, lesson, last, game, exported, and, signed in, the account's details, which
    are not stores and are passed over }), with the legacy carry page's `device` (the
    settings, by key) and `signedIn` when it wrote the file. */
export function fromFile(text: string, now: number = Date.now(), course?: Course): Outcome {
  if (String(text).length > MAX_FILE) return { ok: false, why: "size" };
  let data: unknown;
  try { data = JSON.parse(String(text).replace(/^﻿/, "")); } catch (e) { return { ok: false, why: "malformed" }; }
  if (!plain(data)) return { ok: false, why: "malformed" };
  const fmt = own(data, "format");
  if (fmt !== undefined && fmt !== "basic-mathematics-progress") return { ok: false, why: "malformed" };
  const ver = own(data, "v");
  if (ver !== undefined && ver !== 1) return { ok: false, why: typeof ver === "number" ? "version" : "malformed" };
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
  const signedIn = fmt === "basic-mathematics-progress" && own(data, "signedIn") === true;
  if (!found && !signedIn) return { ok: false, why: "malformed" };
  return check(stores, { now, course, signedIn });
}

/* nesting and size: false past the caps; "__proto__" taken out on the way (JSON.parse
   makes it an own key) */
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

/* What each store may hold, field by field, of what add() may take: the shapes the site
   writes (src/types/state.ts, read off the writers). A rule returns the value to keep, or
   undefined to leave it out; leaving something out counts it in `dropped`. Keys of
   records the site names by chapter, exercise or section are any string of up to 120
   characters (ids from the pages, never put into a page as HTML); with the course given,
   a chapter, section or achievement it does not have is left out. */
type Known = { chapters: Set<string>; sections: Set<string>; achievements: Set<string> | null };
type Ctx = { now: number; latest: string; dropped: number; newer: boolean; course: Known | null };
type Rule = (v: unknown, c: Ctx) => unknown;

/** the reader's calendar day of a time, as the site writes days (YYYY-MM-DD, local) */
export function localDay(t: number): string {
  const d = new Date(t), p = (n: number) => (n < 10 ? "0" : "") + n;
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function isDay(v: unknown, latest: string): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || v < EARLIEST_DAY || v > latest) return false;
  const d = new Date(v + "T00:00:00Z");
  return isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
const isKey = (k: string) => k !== "__proto__" && k.length > 0 && k.length <= 120;
const chapterId = (k: string, c: Ctx) => !c.course || c.course.chapters.has(k);
const sectionId = (k: string, c: Ctx) => !c.course || c.course.sections.has(k);
const achievementId = (k: string, c: Ctx) => !c.course || !c.course.achievements || c.course.achievements.has(k);
const dayKey = (k: string, c: Ctx) => isDay(k, c.latest);
/* a rematch medal's set: "<chapter>/practice" or "<chapter>/review" */
const setId = (k: string, c: Ctx) => { const m = /^(.+)\/(practice|review)$/.exec(k); return !!m && chapterId(m[1], c); };
/* an Arena best score's mode, or "boss:<chapter>" (assets/arena.js) */
const MODES = ["standard", "daily", "boss", "repair", "review"];
const modeId = (k: string, c: Ctx) => MODES.indexOf(k) >= 0 || (/^boss:/.test(k) && chapterId(k.slice(5), c));

const num = (max: number, min = 0): Rule => (v) => (typeof v === "number" && isFinite(v) && v >= min && v <= max ? v : undefined);
const whole = (max: number, min = 0): Rule => (v) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined);
const oneOf = (list: unknown[]): Rule => (v) => (list.indexOf(v) >= 0 ? v : undefined);
const bool: Rule = (v) => (typeof v === "boolean" ? v : undefined);
const flag: Rule = (v) => (v === 1 || v === true ? 1 : undefined);
const yes: Rule = (v) => (v === true ? true : undefined);
const text = (max: number): Rule => (v) => (typeof v === "string" && v.length <= max ? v : undefined);
/* a time: never before the course, never after now */
const time: Rule = (v, c) => (typeof v === "number" && isFinite(v) && v >= EARLIEST && v <= c.now ? v : undefined);
const day: Rule = (v, c) => (isDay(v, c.latest) ? v : undefined);

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
/** a field the site writes that a carry never takes, and so is not counted as dropped */
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
/** a record with nothing left in it is no record */
const filled = (inner: Rule): Rule => (x, c) => {
  const r = inner(x, c);
  return plain(r) && !Object.keys(r).length ? undefined : r;
};
const COUNT = whole(1000000);

/* An exercise's attempt record is taken once the exercise is solved, and then only where
   this browser has none (add()). An unsolved one is not: its tries, clues and opened
   solution decide what the first solve here earns (site.js Road.check). The help
   ladder's place (`rung`) and a skip are an unsolved exercise's too. */
const ATTEMPT = filled(rec({
  tries: whole(1000), hints: whole(10), opened: flag, inline: flag, section: text(120),
  solved: time, first: oneOf([0, 1]), rung: notTaken, skipped: notTaken
}));
const solvedAttempt: Rule = (x, c) => {
  const r = ATTEMPT(x, c) as Record<string, unknown> | undefined;
  return r && typeof r.solved === "number" ? r : undefined;
};

/* A chapter's `total` is the chapter page's to write; a chapter's opening-puzzle guess
   (`guess`) is answered again here; the daily goal and the reading mode are choices this
   browser makes; a solution compared (`cmp`) and the Arena's run count (`maxed`) are
   not progress a learner keeps: none is taken. */
const STORE: Record<string, Rule> = {
  "bm.progress.v1": map(filled(rec({ solved: map(yes), total: notTaken })), chapterId),
  "bm.play.v1": map(filled(rec({ done: map(yes), total: notTaken, guess: notTaken })), chapterId),
  "bm.attempts.v1": map(map(solvedAttempt), chapterId),
  "bm.activity.v1": rec({ days: map(whole(100000, 1), dayKey), goal: notTaken }),
  "bm.lesson.v1": rec({ reached: map(whole(1000, 1), chapterId), mode: notTaken }),
  /* the place to continue from: null, or a chapter of the course and one of its sections,
     its warm-up or its practice, or no section (assets/site.js writes these); else
     nothing. Without the course, nothing but null: a place is an id the contents page
     looks up, and only the course says which ids are places. */
  "bm.last": (v, c) => {
    if (v === null) return null;
    const known = c.course;
    if (!known || !plain(v)) return undefined;
    const id = own(v, "id"), section = own(v, "section");
    if (typeof id !== "string" || !known.chapters.has(id)) return undefined;
    const place = section === null || section === "warmup" || section === "practice" ||
      (typeof section === "string" && known.sections.has(id + "#" + section));
    if (section !== undefined && !place) return undefined;
    Object.keys(v).forEach((k) => { if (k !== "id" && k !== "section") c.dropped++; });
    return section === undefined ? { id } : { id, section };
  },
  "bm.game.v1": (v, c) => {
    /* data marked newer than this site writes is refused whole (check()) */
    if (plain(v) && typeof own(v, "v") === "number" && (own(v, "v") as number) > SCHEMA) c.newer = true;
    return rec({
      ach: map(time, achievementId),
      sec: map(rec({ n: COUNT, ok: COUNT, box: whole(4), last: day, fix: time }), sectionId),
      best: map(rec({ score: whole(10000000), hearts: whole(10), day }), modeId),
      enc: map(rec({ medal: whole(3, 1), day }), setId),
      daily: map(flag, dayKey),
      v: oneOf([SCHEMA]),
      cmp: notTaken,
      maxed: notTaken
    })(v, c);
  },
  "bm.theme": oneOf(["light", "dark"]),
  "bm.prefs.v1": filled(rec({
    sound: bool, calm: bool, map: oneOf(["3d", "list"]), tempo: oneOf(["standard", "extended", "untimed"]),
    panel: oneOf(["light", "dark"]), volume: num(100), motion: oneOf(["reduce"]), transparency: oneOf(["reduce"]),
    gfx: oneOf(["auto", "low", "mid", "high"]), gfxAuto: oneOf(["list", "low", "medium"])
  }))
};

function known(course: Course | undefined): Known | null {
  if (!course) return null;
  return {
    chapters: new Set(course.chapters), sections: new Set(course.sections),
    achievements: course.achievements ? new Set(course.achievements) : null
  };
}

/** The stores of a payload as this site may take them: refused whole when it is not a
    map of "bm." keys, is too big, or holds data newer than this site writes; every
    store add() takes rebuilt from what the site writes (the rules above), any other key
    (the account's records, the run store, a key this site does not have) left out and
    named in `ignored`, anything left out inside a store counted in `dropped`. Whether it
    holds anything this browser does not have is add()'s to say. */
export function check(stores: unknown, opts?: { now?: number; course?: Course; signedIn?: boolean }): Outcome {
  if (!plain(stores)) return { ok: false, why: "malformed" };
  const keys = Object.keys(stores);
  if (keys.some((k) => k.indexOf("bm.") !== 0 || /auth-token|^sb-/i.test(k))) return { ok: false, why: "keys" };
  if (!bounded(stores)) return { ok: false, why: "size" };
  const now = opts && typeof opts.now === "number" ? opts.now : Date.now();
  const c: Ctx = { now, latest: localDay(now), dropped: 0, newer: false, course: known(opts && opts.course) };
  const out: Stores = {}, ignored: string[] = [];
  keys.sort().forEach((k) => {
    const v = has(STORE, k) ? STORE[k](stores[k], c) : undefined;
    if (v === undefined) ignored.push(k);
    else out[k] = v;
  });
  if (c.newer) return { ok: false, why: "version" };
  return { ok: true, stores: out, signedIn: !!(opts && opts.signedIn), ignored, dropped: c.dropped };
}

/* ------------------------------------------------------------- adding -- */

/** What add() adds, kind by kind: the question is made of these counts. */
export type Added = {
  solved: number; missions: number; records: number; lessons: number;
  days: number; xp: number; achievements: number; best: number; medals: number;
  sections: number; dailies: number; last: number; theme: number; prefs: number;
};
export const NONE: Added = { solved: 0, missions: 0, records: 0, lessons: 0, days: 0, xp: 0, achievements: 0, best: 0, medals: 0, sections: 0, dailies: 0, last: 0, theme: 0, prefs: 0 };
/** whether add() adds anything */
export function adds(a: Added): boolean {
  return Object.keys(NONE).some((k) => (a as Record<string, number>)[k] > 0);
}

const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
/* a record of this browser that may be added to: absent (a fresh one) or a record; a
   value that is there and is not a record (damaged, or a shape this file does not know)
   is left exactly as it is, and nothing is added under it (null) */
function room(x: unknown): Record<string, unknown> | null {
  if (x === undefined) return {};
  return plain(x) ? x : null;
}
/* sets o[k] = v as an own property, whatever k is */
function put(o: Record<string, unknown>, k: string, v: unknown): void {
  Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true });
}

/* adds to a map of records by key (a chapter's): for each carried key whose record here
   is absent or a record, `inner` adds to a copy of it and returns how many things it
   added; a record with nothing added is left as it was */
function addEach(here: Record<string, unknown>, carried: unknown, inner: (mine: Record<string, unknown>, theirs: unknown) => number): number {
  let n = 0;
  if (!plain(carried)) return 0;
  Object.keys(carried).forEach((k) => {
    if (!isKey(k)) return;
    const mine = room(own(here, k));
    if (!mine) return;
    const next = copy(mine);
    const got = inner(next, carried[k]);
    if (got) { put(here, k, next); n += got; }
  });
  return n;
}
/* the entries of `carried` whose key `here` lacks, added to `here`; how many */
function addAbsent(here: Record<string, unknown>, carried: unknown, ok?: (k: string, v: unknown) => boolean): number {
  let n = 0;
  if (!plain(carried)) return 0;
  Object.keys(carried).forEach((k) => {
    if (!isKey(k) || has(here, k) || (ok && !ok(k, carried[k]))) return;
    put(here, k, copy(carried[k]));
    n++;
  });
  return n;
}
/* adds into the field `f` of a record (a map), made where absent; nothing when the field
   is there and is not a map */
function addInto(r: Record<string, unknown>, f: string, add: (into: Record<string, unknown>) => number): number {
  const into = room(own(r, f));
  if (!into) return 0;
  const next = copy(into);
  const n = add(next);
  if (n) put(r, f, next);
  return n;
}

/** What to write so that this browser has what `carried` (check()'s stores) adds, and
    the counts of it. `read` gives what this browser holds (stored() of its text). Only
    ever adds: every value here before is there after, unchanged (format.test.ts holds
    this over random states of both sides, and over random stored text). A store with nothing to add is not written. `now` sets today, after
    which no day is taken. */
export function add(read: Read, carried: Stores, now: number = Date.now()): { writes: Record<string, unknown>; added: Added } {
  const writes: Record<string, unknown> = {};
  const added: Added = Object.assign({}, NONE);
  const today = localDay(now);
  /* a store this browser may add to, and a fresh copy of it to add into */
  const store = (key: string, fill: (into: Record<string, unknown>) => void) => {
    if (!has(carried, key)) return;
    const mine = room(read(key));
    if (!mine) return;
    const before = JSON.stringify(added);
    const next = copy(mine);
    fill(next);
    if (JSON.stringify(added) !== before) writes[key] = next;
  };

  store(SYNCED.progress, (p) => {
    added.solved += addEach(p, carried[SYNCED.progress], (ch, theirs) => addInto(ch, "solved", (s) => addAbsent(s, plain(theirs) ? theirs.solved : null, (_k, v) => v === true)));
  });
  store(SYNCED.play, (p) => {
    added.missions += addEach(p, carried[SYNCED.play], (ch, theirs) => addInto(ch, "done", (s) => addAbsent(s, plain(theirs) ? theirs.done : null, (_k, v) => v === true)));
  });
  store(SYNCED.attempts, (a) => {
    added.records += addEach(a, carried[SYNCED.attempts], (ch, theirs) => addAbsent(ch, theirs, (_k, v) => plain(v) && typeof v.solved === "number"));
  });
  store(SYNCED.activity, (a) => {
    const theirs = carried[SYNCED.activity];
    addInto(a, "days", (d) => addAbsent(d, plain(theirs) ? theirs.days : null, (k, v) => {
      if (!isDay(k, today) || typeof v !== "number" || !(v > 0)) return false;
      added.days++; added.xp += v;
      return true;
    }));
  });
  store(SYNCED.lesson, (l) => {
    const theirs = carried[SYNCED.lesson];
    added.lessons += addInto(l, "reached", (r) => addAbsent(r, plain(theirs) ? theirs.reached : null, (_k, v) => typeof v === "number" && v > 0));
  });
  if (has(carried, SYNCED.last) && plain(carried[SYNCED.last]) && read(SYNCED.last) === undefined) {
    writes[SYNCED.last] = copy(carried[SYNCED.last]);
    added.last = 1;
  }
  store(SYNCED.game, (g) => {
    const theirs = carried[SYNCED.game];
    if (!plain(theirs)) return;
    const sections = addInto(g, "sec", (s) => addAbsent(s, theirs.sec, (_k, v) => plain(v)));
    const achievements = addInto(g, "ach", (s) => addAbsent(s, theirs.ach, (_k, v) => typeof v === "number" && v > 0 && v <= now));
    const best = addInto(g, "best", (s) => addAbsent(s, theirs.best, (_k, v) => plain(v)));
    const medals = addInto(g, "enc", (s) => addAbsent(s, theirs.enc, (_k, v) => plain(v)));
    /* the Daily: days not later than today that this browser lacks, the newest first,
       never more than the site's 60 leave room for beside this browser's own */
    const dailies = addInto(g, "daily", (d) => {
      const free = DAILY_KEPT - Object.keys(d).length, days = theirs.daily;
      if (free <= 0 || !plain(days)) return 0;
      const fresh = Object.keys(days).filter((k) => isKey(k) && isDay(k, today) && !has(d, k) && days[k]).sort().reverse().slice(0, free);
      fresh.forEach((k) => put(d, k, 1));
      return fresh.length;
    });
    /* the shape's version rides along with something added, and only where absent */
    if ((sections || achievements || best || medals || dailies) && !has(g, "v") && theirs.v === SCHEMA) put(g, "v", SCHEMA);
    added.sections += sections; added.achievements += achievements; added.best += best;
    added.medals += medals; added.dailies += dailies;
  });
  DEVICE.forEach((k) => {
    if (has(carried, k) && carried[k] !== undefined && carried[k] !== null && read(k) === undefined) {
      writes[k] = copy(carried[k]);
      if (k === "bm.theme") added.theme = 1;
      else added.prefs = 1;
    }
  });
  return { writes, added };
}

/* ------------------------------------------------------------ describing -- */

/** What the question says, plain text, made from add()'s counts: every kind of thing it
    adds, each counted; "" when it adds nothing. */
export function describe(a: Added): string {
  const n = (k: number, one: string, many: string) => k + " " + (k === 1 ? one : many);
  const parts: string[] = [];
  if (a.solved) parts.push(n(a.solved, "exercise solved", "exercises solved"));
  if (a.records) parts.push(n(a.records, "answer record", "answer records"));
  if (a.missions) parts.push(n(a.missions, "mission done", "missions done"));
  if (a.lessons) parts.push("your place in " + n(a.lessons, "lesson", "lessons"));
  if (a.days) parts.push(Math.round(a.xp) + " XP over " + n(a.days, "day", "days"));
  if (a.achievements) parts.push(n(a.achievements, "achievement", "achievements"));
  if (a.medals) parts.push(n(a.medals, "medal", "medals"));
  if (a.best) parts.push(n(a.best, "best score", "best scores"));
  if (a.sections) parts.push(n(a.sections, "review section", "review sections"));
  if (a.dailies) parts.push(n(a.dailies, "Daily played", "Dailies played"));
  if (a.last) parts.push("where to continue from");
  if (a.theme) parts.push("your theme");
  if (a.prefs) parts.push("your sound and display settings");
  if (!parts.length) return "";
  const list = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
  return list.charAt(0).toUpperCase() + list.slice(1) + ".";
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
