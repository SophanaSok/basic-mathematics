/* What the site's scripts reach through window.BMEvents: the event log's recorder (listens to
   the Store's changes and writes entries to bm.events.v1) and the schedule, mastery and bands
   read from it. assets/game.js and assets/account.js cannot import modules, so they find
   this on window. install(win) builds the api over a window-like object, so a test (or a
   script run in a vm) can put one up on its own; the page's copy is installed on load.

   The pure parts are src/learn/recorder.ts (what an entry holds) and src/sync/events.ts
   (the format, the merge). Every write is mergeEvents(stored, mine), so order never matters,
   and a log whose version is ahead of this code's is never written. */

import { eventId, FORMAT, isValid, mergeEvents, randomRand, V_MAX, type EventSet, type EventsStore, type Payload } from "../sync/events.ts";
import { checkpoint } from "../learn/checkpoint.ts";
import { bandOf } from "../learn/bands.ts";
import { masteryOf } from "../learn/mastery.ts";
import { scheduleAll, scheduleOf } from "../learn/schedule.ts";
import { DEVICE_KEY, deviceOk, EVENTS_KEY, OUTBOX_KEY, pagePayload, runPayloads, sameOwner } from "../learn/recorder.ts";

function isObj(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

export function install(win: any) {
  const Store: any = win && win.BMStore;
  const con: any = (win && win.console) || (typeof console !== "undefined" ? console : null);
  let warned = false;
  const warn = (e: unknown) => { if (!warned) { warned = true; if (con && con.warn) con.warn("[BM] event log", e); } };
  let cache: EventSet | null = null;
  /* a merged copy that could not be stored, kept so the next write still carries it */
  let pending: EventsStore | null = null;

  const raw = (): unknown => (Store ? Store.read(EVENTS_KEY, null) : null);
  const validOf = (store: unknown): EventSet => {
    const out: EventSet = {};
    const ev = isObj(store) ? store.ev : null;
    if (isObj(ev)) Object.keys(ev).forEach((id) => { if (isValid(id, ev[id])) out[id] = ev[id] as Payload; });
    return out;
  };
  const todayKey = (): string => {
    const s = win && win.BMSite;
    if (s && typeof s.dayKey === "function") return s.dayKey();
    const D = (win && win.Date) || Date;
    return new D(D.now()).toISOString().slice(0, 10);
  };
  const nowMinute = (): number => { const D = (win && win.Date) || Date; return Math.floor(D.now() / 60000); };

  function all(): EventSet {
    if (!cache) cache = Object.freeze(validOf(mergeEvents(raw(), pending))) as EventSet;
    return cache;
  }
  function version(): number {
    const r = raw(), v = isObj(r) ? r.v : undefined;
    return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= V_MAX ? (v as number) : 1;
  }
  function ahead(): boolean { return version() > FORMAT; }

  function readDevice(): unknown { return Store ? Store.read(DEVICE_KEY, null) : null; }
  function device(): string {
    const rec = readDevice();
    if (deviceOk(rec)) return rec.id;
    const id = randomRand(), next: { id: string; uid?: string } = { id };
    if (isObj(rec) && typeof rec.uid === "string") next.uid = rec.uid;
    if (Store) Store.write(DEVICE_KEY, next, true);
    return id;
  }

  /* one merged write of `mine`; true when stored. Throws when the write throws. */
  function put(mine: EventSet): boolean {
    const merged = mergeEvents(mergeEvents(raw(), pending), { v: FORMAT, ev: mine });
    const ok = Store.write(EVENTS_KEY, merged, true);
    if (ok === false) { pending = merged; warn("write failed"); cache = Object.freeze(validOf(merged)) as EventSet; }
    else { pending = null; cache = null; }
    return ok !== false;
  }
  /* the checkpoints the touched sections are due to write */
  function checkpoints(secs: string[]): void {
    const today = todayKey();
    secs.forEach((sec) => {
      const cp = checkpoint(all(), sec, today);
      if (cp) put({ [cp.id]: cp.P });
    });
  }
  const announce = () => Store.emit({ type: "event", n: Object.keys(all()).length });

  function record(P: Payload): string | null {
    if (!Store || ahead()) return null;
    try {
      const id = eventId(device(), P);
      if (!isValid(id, P)) return null;
      put({ [id]: P });
      checkpoints([P[3]]);
      announce();
      return id;
    } catch (e) {
      warn(e);
      return null;
    }
  }
  function fromRun(result: unknown): number {
    if (!Store) return 0;
    try {
      const list = runPayloads(result);
      if (!list.length || ahead()) return 0;
      const dev = device(), mine: EventSet = {}, secs = new Set<string>();
      list.forEach((P) => {
        const id = eventId(dev, P);
        if (isValid(id, P)) { mine[id] = P; secs.add(P[3]); }
      });
      const n = Object.keys(mine).length;
      if (!n) return 0;
      put(mine);
      checkpoints(Array.from(secs));
      announce();
      return n;
    } catch (e) {
      warn(e);
      return 0;
    }
  }
  function wipe(uid?: string): void {
    const ls = win && win.localStorage;
    [EVENTS_KEY, OUTBOX_KEY].forEach((k) => {
      if (ls && typeof ls.removeItem === "function") ls.removeItem(k);
      else if (Store) Store.write(k, null, true);
    });
    cache = null;
    pending = null;
    const next: { id: string; uid?: string } = { id: randomRand() };
    if (uid) next.uid = uid;
    if (Store) Store.write(DEVICE_KEY, next, true);
  }
  function clear(): void {
    if (!Store) return;
    try {
      const rec = readDevice();
      wipe(isObj(rec) && typeof rec.uid === "string" ? rec.uid : undefined);
    } catch (e) { warn(e); }
  }
  function stamp(uid: string | null): void {
    if (!Store) return;
    try {
      const rec = readDevice();
      /* a record with no uid is adopted by the first sign-in; a different uid starts clean */
      if (isObj(rec) && typeof rec.uid === "string" && !sameOwner(rec, uid)) wipe();
      const id = device(), next: { id: string; uid?: string } = { id };
      if (typeof uid === "string" && uid) next.uid = uid;
      Store.write(DEVICE_KEY, next, true);
    } catch (e) { warn(e); }
  }

  const api = {
    all, version, ahead, device, record, fromRun, clear, stamp,
    scheduleAll: (today: string) => scheduleAll(all(), today),
    schedule: (sec: string, today: string) => scheduleOf(all(), sec, today),
    mastery: (sec: string) => masteryOf(all(), sec),
    bandOf: (sec: string) => bandOf(all(), sec)
  };

  if (!Store) {
    if (con && con.error) con.error("[BM] BMStore missing");
    return api;
  }
  Store.on((change: unknown) => {
    try {
      const type = isObj(change) ? change.type : null;
      if (type === "attempt" || type === "opened" || type === "ladder" || type === "skipped") {
        const P = pagePayload(change, nowMinute());
        if (P) api.record(P);
      } else if (type === "reset") api.clear();
    } catch (e) { warn(e); }
  });
  if (win && typeof win.addEventListener === "function") {
    win.addEventListener("storage", (e: any) => { if (e && (e.key === EVENTS_KEY || e.key === null)) cache = null; });
  }
  return api;
}

export type EventsApi = ReturnType<typeof install>;

if (typeof window !== "undefined") window.BMEvents = install(window);
