/* Progress carried from the old address to the new one, as the new address reads it:
   the fragment the legacy site's pages write (src/carry/send.js says how), and the file
   the account page's "Download my data" makes (assets/account.js exportData) or the
   legacy carry page offers when the fragment would be too long. No DOM and no window:
   src/ui/carry.ts asks the reader and writes what plan() returns, and the Vitest tests
   beside this file hold every rule here.

   What arrives is untrusted. Anyone can write a link to the new address with a fragment
   of their choosing, and anyone can hand a reader a file. So nothing here trusts it:
   the format is versioned and anything else is refused (`version`); the size is capped
   before and after inflating (`size`); its top level is a map of localStorage keys,
   every one of which must start with "bm." and none may name an auth token (`keys`,
   which refuses the whole of it: a payload that tries to plant something else is not
   one the old address wrote); each known store must be the shape the site writes
   (a store that is not is left out, `ignored`); nesting and node count are bounded; and
   "__proto__" is taken out at every level. The reader is then shown what it holds
   (summary) and asked, and nothing is written until they say yes. Nothing of it is ever
   put into the page as HTML.

   Where it goes (plan): the synced stores are merged with what this browser already
   holds by the site's own merge (BMAccount.merge in assets/account.js, the rule an
   account sync uses), with this browser's side as the local one, so its choices win
   where two devices simply disagree and nothing on either side is lost; the stores that
   stay on a device (the run store, the settings, the theme) are set only where this
   browser has none; progress set aside for a reader who signed out is merged per reader.
   The account binding (bm.sync.v1) is never taken: a learner who was signed in at the
   old address signs in again here, and their account merges in the progress as it
   always does. */

import { LEGACY, ORIGIN } from "./origins.ts";

/** the fragment parameters src/carry/send.js writes */
export const PARAM = "bm-carry";
export const AT = "bm-at";
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

/** the synced stores, by their field in BMAccount.merge, and their keys */
export const SYNCED: Record<string, string> = {
  progress: "bm.progress.v1", play: "bm.play.v1", attempts: "bm.attempts.v1",
  activity: "bm.activity.v1", lesson: "bm.lesson.v1", last: "bm.last", game: "bm.game.v1"
};
/** the stores that stay on a device: taken only where this browser has none */
export const DEVICE = ["bm.run.v1", "bm.prefs.v1", "bm.theme"];
/** progress set aside for a reader who signed out with it unsaved (assets/account.js) */
export const PENDING = "bm.sync.pending.v1";
/** never taken: the account binding, and this file's own record of what it has taken */
export const KEEP_OUT = ["bm.sync.v1", "bm.carry.v1"];
/** this browser's record of the payloads it has asked about (device only) */
export const FLAG = "bm.carry.v1";

export type Stores = Record<string, unknown>;
export type Refusal = "version" | "malformed" | "size" | "keys" | "unsupported";
export type Outcome =
  | { ok: true; stores: Stores; ignored: string[] }
  | { ok: false; why: Refusal };
export type Merge = (local: Record<string, unknown>, remote: Record<string, unknown>) => Record<string, unknown>;

const SYNCED_KEYS = Object.keys(SYNCED).map((f) => SYNCED[f]);

function plain(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}
function own(o: Record<string, unknown>, k: string): unknown {
  return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
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
/** the carry page of the legacy site, which sends this browser's old progress back to `path` */
export function legacyCarryUrl(path: string): string {
  return new URL("carry/", LEGACY).href + "?to=" + encodeURIComponent(path);
}

/* ------------------------------------------------------------- reading -- */

/** the bm-carry value and the old fragment from an address's hash, or null */
export function readHash(hash: string): { value: string; at: string } | null {
  const h = String(hash || "").replace(/^#/, "");
  if (h.indexOf(PARAM + "=") !== 0) return null;
  const amp = h.indexOf("&");
  const value = h.slice(PARAM.length + 1, amp < 0 ? h.length : amp);
  let at = "";
  if (amp >= 0) {
    const m = new RegExp("(?:^|&)" + AT + "=([^&]*)").exec(h.slice(amp));
    if (m) { try { at = decodeURIComponent(m[1]); } catch (e) { at = ""; } }
  }
  return { value, at };
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

/** The progress in a bm-carry value, checked (check()), or why it is refused. */
export async function decode(value: string): Promise<Outcome> {
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
  return check(own(payload, "s"));
}

/** The progress in a file: what "Download my data" writes ({ progress, play, attempts,
    activity, lesson, last, game, exported, and, signed in, the account's details, which
    are not stores and are passed over }), with the legacy carry page's `device` (the
    stores that stay on a device, by key) when it wrote the file. */
export function fromFile(text: string): Outcome {
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
      if (Object.prototype.hasOwnProperty.call(stores, k)) return { ok: false, why: "keys" };
      stores[k] = device[k];
      found++;
    }
  }
  if (!found) return { ok: false, why: "malformed" };
  return check(stores);
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
      if (Object.prototype.hasOwnProperty.call(o, "__proto__")) delete o["__proto__"];
      return Object.keys(o).every((k) => walk(o[k], depth + 1));
    }
    return true;
  };
  return walk(x, 0);
}

/** The stores of a payload as this site may take them: refused whole when it is not a
    map of "bm." keys or is too big; a store of the wrong shape, or a key this copy of
    the site does not take, is left out and named in `ignored`. */
export function check(stores: unknown): Outcome {
  if (!plain(stores)) return { ok: false, why: "malformed" };
  const keys = Object.keys(stores);
  if (keys.some((k) => k.indexOf("bm.") !== 0 || /auth-token|^sb-/i.test(k))) return { ok: false, why: "keys" };
  if (!bounded(stores)) return { ok: false, why: "size" };
  const out: Stores = {}, ignored: string[] = [];
  keys.sort().forEach((k) => {
    const v = stores[k];
    let fits: boolean;
    if (k === SYNCED.last) fits = v === null || plain(v);
    else if (SYNCED_KEYS.indexOf(k) >= 0) fits = plain(v);
    else if (k === "bm.theme") fits = v === "light" || v === "dark";
    else if (k === "bm.run.v1" || k === "bm.prefs.v1") fits = plain(v);
    else if (k === PENDING) fits = plain(v) && Object.keys(v).every((id) => plain(v[id]) && plain((v[id] as Record<string, unknown>).state));
    else fits = false;
    if (fits) out[k] = v;
    else ignored.push(k);
  });
  return { ok: true, stores: out, ignored };
}

/* ------------------------------------------------------------ describing -- */

function count(x: unknown): number {
  return plain(x) ? Object.keys(x).filter((k) => !!x[k]).length : 0;
}

/** What the reader is told before anything is kept: the chapters the progress touches
    (an exercise solved or tried, a mission done, a lesson step reached), the scored
    exercises solved, the XP, and whether settings come with it. */
export function summary(stores: Stores): { chapters: number; solved: number; xp: number; settings: boolean } {
  const chapters = new Set<string>();
  let solved = 0, xp = 0;
  const progress = stores[SYNCED.progress], play = stores[SYNCED.play], attempts = stores[SYNCED.attempts];
  const lesson = stores[SYNCED.lesson], activity = stores[SYNCED.activity];
  if (plain(progress)) Object.keys(progress).forEach((ch) => {
    const rec = progress[ch];
    const n = plain(rec) ? count(rec.solved) : 0;
    if (n) { chapters.add(ch); solved += n; }
  });
  if (plain(play)) Object.keys(play).forEach((ch) => { const rec = play[ch]; if (plain(rec) && count(rec.done)) chapters.add(ch); });
  if (plain(attempts)) Object.keys(attempts).forEach((ch) => { if (count(attempts[ch])) chapters.add(ch); });
  if (plain(lesson) && plain(lesson.reached)) Object.keys(lesson.reached).forEach((ch) => {
    const n = (lesson.reached as Record<string, unknown>)[ch];
    if (typeof n === "number" && n > 0) chapters.add(ch);
  });
  if (plain(activity) && plain(activity.days)) Object.keys(activity.days).forEach((d) => {
    const n = (activity.days as Record<string, unknown>)[d];
    if (typeof n === "number" && isFinite(n) && n > 0) xp += n;
  });
  return { chapters: chapters.size, solved, xp: Math.round(xp), settings: DEVICE.some((k) => k in stores) };
}

/** one line for the question, plain text */
export function describe(s: ReturnType<typeof summary>): string {
  const n = (k: number, one: string, many: string) => k + " " + (k === 1 ? one : many);
  const parts: string[] = [];
  if (s.chapters || s.solved) parts.push(n(s.chapters, "chapter", "chapters"), n(s.solved, "exercise solved", "exercises solved"));
  if (s.xp) parts.push(s.xp + " XP");
  if (s.settings) parts.push("your settings");
  if (!parts.length) return "Nothing that changes your progress.";
  const text = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}

/* ------------------------------------------------------------- merging -- */

/* two readers' set-aside records (account.js setAside) of the same account */
function mergePending(a: unknown, b: unknown, merge: Merge): unknown {
  if (!plain(a)) return b;
  if (!plain(b)) return a;
  const via: string[] = [];
  [a.via, b.via].forEach((list) => { if (Array.isArray(list)) list.forEach((p) => { if (typeof p === "string" && via.indexOf(p) < 0) via.push(p); }); });
  const num = (x: unknown) => (typeof x === "number" && isFinite(x) ? x : 0);
  return {
    email: (typeof a.email === "string" && a.email) || (typeof b.email === "string" && b.email) || "",
    via,
    resetAt: Math.max(num(a.resetAt), num(b.resetAt)),
    state: merge(plain(a.state) ? a.state : {}, plain(b.state) ? b.state : {}),
    at: Math.max(num(a.at), num(b.at))
  };
}

/** What to write for carried stores, given what this browser holds (`read` gives a
    store's parsed value, or undefined where there is none or it cannot be read): the
    key -> value pairs, each a merge that keeps both sides, or a device store this
    browser does not have. Nothing else is touched. */
export function plan(read: (key: string) => unknown, carried: Stores, merge: Merge): Record<string, unknown> {
  const writes: Record<string, unknown> = {};
  const fields = Object.keys(SYNCED).filter((f) => Object.prototype.hasOwnProperty.call(carried, SYNCED[f]));
  if (fields.length) {
    const local: Record<string, unknown> = {}, remote: Record<string, unknown> = {};
    Object.keys(SYNCED).forEach((f) => {
      const here = read(SYNCED[f]);
      if (here !== undefined) local[f] = here;
      if (Object.prototype.hasOwnProperty.call(carried, SYNCED[f])) remote[f] = carried[SYNCED[f]];
    });
    const merged = merge(local, remote);
    fields.forEach((f) => { writes[SYNCED[f]] = f === "last" ? (merged[f] === undefined ? null : merged[f]) : merged[f]; });
  }
  DEVICE.forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(carried, k) && read(k) === undefined) writes[k] = carried[k];
  });
  if (plain(carried[PENDING])) {
    const here = read(PENDING);
    const mine: Record<string, unknown> = plain(here) ? here : {};
    const theirs = carried[PENDING] as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    Object.keys(mine).concat(Object.keys(theirs)).forEach((id) => {
      if (id === "__proto__" || Object.prototype.hasOwnProperty.call(out, id)) return;
      out[id] = mergePending(own(mine, id), own(theirs, id), merge);
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
