/* What the event log records, as pure functions: the payload one page change or one Arena
   run becomes, and the rules of the device record. src/ui/events.ts is the part that
   listens and stores. A payload is built from named, whitelisted fields only, never from
   a change or an answer as a whole: an opened change carries a DOM element, an attempt
   may carry what was typed, an Arena answer carries its time and points. Nothing but
   counts, flags and refs leaves here.

   Pure: no window, no document, no storage of any kind (tools/check-static.js `pure-core`). */

import { REF_RE, type Payload } from "../sync/events.ts";
import { dayNumber } from "./recall.ts";

export const EVENTS_KEY = "bm.events.v1", OUTBOX_KEY = "bm.events.out.v1", DEVICE_KEY = "bm.device.v1";
export const DEVICE_RE = /^[0-9a-z]{8}$/;

/** The change kinds the recorder turns into entries; everything else is ignored. */
export interface PageChange {
  type: "attempt" | "opened" | "ladder" | "skipped"; chapter?: unknown; key?: unknown; section?: unknown; inline?: unknown;
  correct?: unknown; tryNo?: unknown; rung?: unknown; solutionOpen?: unknown; solved?: unknown;
}

function isObj(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}
function clamp(x: unknown, lo: number, hi: number): number {
  const n = typeof x === "number" || typeof x === "string" ? Math.trunc(Number(x)) : 0;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0;
}
function str(x: unknown): string { return typeof x === "string" ? x : ""; }

/** value when flag is truthy, else 0 */
export function bit(flag: unknown, value: number): number { return flag ? value : 0; }

/** "ch02#one-unknown" from chapter "ch02" and section "one-unknown" or "ch02#one-unknown"; "" when
    either is missing or the result fails REF_RE */
export function secRef(chapter: unknown, section: unknown): string {
  const c = str(chapter), s = str(section);
  if (c === "" || s === "") return "";
  const ref = s.indexOf("#") >= 0 ? s : c + "#" + s;
  return REF_RE.test(ref) ? ref : "";
}
/** "ch02/e3"; "" when missing or failing REF_RE */
export function itemRef(chapter: unknown, key: unknown): string {
  const c = str(chapter), k = str(key);
  if (c === "" || k === "") return "";
  const ref = c + "/" + k;
  return REF_RE.test(ref) ? ref : "";
}
/** "g:" + g, or "" when g is not a non-empty string or fails REF_RE */
export function generatorRef(g: unknown): string {
  if (typeof g !== "string" || g === "") return "";
  const ref = "g:" + g;
  return REF_RE.test(ref) ? ref : "";
}

/** The payload for one page change at UTC minute `t`, or null when the change records nothing.
    Reads only the whitelisted fields named here, never the change as a whole. */
export function pagePayload(change: unknown, t: number): Payload | null {
  if (!isObj(change)) return null;
  const type = change.type;
  if (type !== "attempt" && type !== "opened" && type !== "ladder" && type !== "skipped") return null;
  const sec = secRef(change.chapter, change.section), ref = itemRef(change.chapter, change.key);
  if (ref === "" || !Number.isInteger(t)) return null;
  const d = Math.floor(t / 1440);
  const src = change.inline ? "in" : "ex";
  if (type === "attempt") {
    return [t, d, src, sec, ref, "c", change.correct ? 1 : 0, clamp(change.tryNo, 0, 999), clamp(change.rung, 0, 9), bit(change.solutionOpen, 1)];
  }
  if (type === "opened") {
    if (change.solved) return null;
    return [t, d, src, sec, ref, "o", 0, 0, 0, 0];
  }
  if (type === "ladder") return [t, d, src, sec, ref, "h", 0, 0, clamp(change.rung, 0, 9), 0];
  return [t, d, "in", sec, ref, "s", 0, 0, 0, 0];
}

/** The payloads for one Arena run (one per answer with a section), or [] for a replay or a run with no day. */
export function runPayloads(result: unknown): Payload[] {
  if (!isObj(result) || !Array.isArray(result.answers) || result.replay) return [];
  const d = dayNumber(result.day);
  if (d === null) return [];
  const out: Payload[] = [];
  result.answers.forEach((a: unknown) => {
    if (!isObj(a)) return;
    const sec = a.section;
    if (typeof sec !== "string" || sec === "" || !REF_RE.test(sec)) return;
    const n = a.first ? 1 : a.retry ? 2 : 0;
    const f = bit(a.pass, 2) | bit(a.timeout, 4) | bit(a.late, 8) | bit(a.due, 16) | bit(a.hf, 32);
    out.push([d * 1440, d, "ar", sec, generatorRef(a.g), "a", a.first ? 1 : 0, n, 0, f]);
  });
  return out;
}

/** Whether a stored device record is this session's: same uid, or no uid on either side. */
export function sameOwner(stored: unknown, uid: string | null): boolean {
  const s = isObj(stored) && typeof stored.uid === "string" ? stored.uid : null;
  return s === (typeof uid === "string" ? uid : null);
}
/** A plain object with an id of eight characters 0-9 a-z. */
export function deviceOk(stored: unknown): stored is { id: string; uid?: string } {
  return isObj(stored) && typeof stored.id === "string" && DEVICE_RE.test(stored.id);
}
