/* What the site's scripts reach through window.BMEvents: the event log's recorder (listens to
   the Store's changes and writes entries to bm.events.v1) and the schedule, mastery and bands
   read from it. assets/game.js and assets/account.js cannot import modules, so they find
   this on window. install(win) builds the api over a window-like object, so a test (or a
   script run in a vm) can put one up on its own; the page's copy is installed on load.

   The pure parts are src/learn/recorder.ts (what an entry holds) and src/sync/events.ts
   (the format, the merge). Every write is mergeEvents(stored, mine), so order never matters,
   and a log whose version is ahead of this code's is never written. */

import { eventId, FORMAT, ID_RE, isValid, mergeEvents, randomRand, V_MAX, type EventSet, type EventsStore, type Payload } from "../sync/events.ts";
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
  /* a merged copy that could not be stored, kept so the next write still carries it, and
     the device id it was recorded under: another tab's wipe or a new owner drops it */
  /* an id drawn while storage refused it, so the ids of one session agree */
  let unsaved: string | null = null;
  let pending: { dev: string; store: EventsStore } | null = null;
  const pendingNow = (): EventsStore | null => (pending && pending.dev === deviceId() ? pending.store : null);

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
    if (!cache) cache = Object.freeze(validOf(mergeEvents(raw(), pendingNow()))) as EventSet;
    return cache;
  }
  function version(): number {
    const r = raw(), v = isObj(r) ? r.v : undefined;
    return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= V_MAX ? (v as number) : 1;
  }
  function ahead(): boolean { return version() > FORMAT; }

  function readDevice(): unknown { return Store ? Store.read(DEVICE_KEY, null) : null; }
  /* the id stored now, without drawing one */
  function deviceId(): string | null { const rec = readDevice(); return deviceOk(rec) ? rec.id : unsaved; }
  function device(): string {
    const rec = readDevice();
    if (deviceOk(rec)) return rec.id;
    if (unsaved) return unsaved;
    const id = randomRand(), next: { id: string; uid?: string } = { id };
    if (isObj(rec) && typeof rec.uid === "string") next.uid = rec.uid;
    if (Store && Store.write(DEVICE_KEY, next, true) === false) unsaved = id;
    return id;
  }

  /* one merged write of `incoming` (an EventSet's store); true when stored. Throws when the
     write throws. `dev` is the device the held copy must belong to. */
  function store(incoming: EventsStore, dev: string | null): boolean {
    const held = pending && pending.dev === dev ? pending.store : null;
    if (!held) pending = null;
    const merged = mergeEvents(mergeEvents(raw(), held), incoming);
    const ok = Store.write(EVENTS_KEY, merged, true);
    if (ok === false) { pending = { dev: dev as string, store: merged }; warn("write failed"); cache = Object.freeze(validOf(merged)) as EventSet; }
    else { pending = null; cache = null; }
    return ok !== false;
  }
  /* one merged write of `mine`; true when stored. Throws when the write throws. */
  function put(mine: EventSet): boolean { return store({ v: FORMAT, ev: mine }, device()); }

  /* The outbox (bm.events.out.v1): the ids of entries that have not reached the account. It
     lives here because assets/account.js cannot import the keys, and the recorder is the one
     that knows what it has just stored; account.js reads and settles it through the api.
     Only a device with a signed-in owner queues (the first sync after sign-in queues the
     whole log), and absorb, which takes in what the account holds, never does. */
  const OUTBOX_MAX = 25_000;
  const queueing = (): boolean => { const rec = readDevice(); return isObj(rec) && typeof rec.uid === "string" && rec.uid !== ""; };
  function outbox(): string[] {
    const r = Store ? Store.read(OUTBOX_KEY, null) : null;
    const ids = isObj(r) && Array.isArray(r.ids) ? r.ids : [];
    return ids.filter((id: unknown): id is string => typeof id === "string" && ID_RE.test(id));
  }
  function enqueue(ids: string[]): void {
    if (!Store || !Array.isArray(ids) || !ids.length) return;
    try {
      const have = outbox(), seen = new Set(have);
      ids.forEach((id) => { if (typeof id === "string" && ID_RE.test(id) && !seen.has(id)) { seen.add(id); have.push(id); } });
      Store.write(OUTBOX_KEY, { ids: have.length > OUTBOX_MAX ? have.slice(have.length - OUTBOX_MAX) : have }, true);
    } catch (e) { warn(e); }
  }
  function dequeue(ids: string[]): void {
    if (!Store || !Array.isArray(ids) || !ids.length) return;
    try {
      const drop = new Set(ids), have = outbox(), keep = have.filter((id) => !drop.has(id));
      if (keep.length !== have.length) Store.write(OUTBOX_KEY, { ids: keep }, true);
    } catch (e) { warn(e); }
  }
  function payloads(ids: string[]): Record<string, Payload> {
    const out: Record<string, Payload> = {}, V = all();
    (Array.isArray(ids) ? ids : []).forEach((id) => { if (typeof id === "string" && Object.prototype.hasOwnProperty.call(V, id)) out[id] = V[id]; });
    return out;
  }
  /* what the account handed back: merged in as put does, with no device record touched and
     nothing queued. Returns true when the log is now ahead of this code, false when the rows
     are stored (or were already held), and null when the write failed, so the caller does
     not move its cursor past rows this browser does not hold. */
  function absorb(incoming: unknown): boolean | null {
    if (!Store) return null;
    try {
      if (ahead() || !isObj(incoming)) return ahead() ? true : null;
      const V = validOf(incoming), have = all(), v = incoming.v;
      const newer = Number.isInteger(v) && (v as number) > version() && (v as number) <= V_MAX;
      const fresh = Object.keys(V).some((id) => !Object.prototype.hasOwnProperty.call(have, id));
      if (!fresh && !newer) return ahead();
      const ok = store({ v: incoming.v, ev: V }, deviceId());
      announce();
      if (ahead()) return true;
      return ok ? false : null;
    } catch (e) { warn(e); }
    return ahead() ? true : null;
  }

  /* the checkpoints the touched sections are due to write */
  function checkpoints(secs: string[]): void {
    const today = todayKey();
    secs.forEach((sec) => {
      const cp = checkpoint(all(), sec, today);
      if (cp) { put({ [cp.id]: cp.P }); if (queueing()) enqueue([cp.id]); }
    });
  }
  const announce = () => Store.emit({ type: "event", n: Object.keys(all()).length });

  function record(P: Payload): string | null {
    if (!Store || ahead()) return null;
    try {
      const id = eventId(device(), P);
      if (!isValid(id, P)) return null;
      put({ [id]: P });
      if (queueing()) enqueue([id]);
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
      if (queueing()) enqueue(Object.keys(mine));
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
    unsaved = null;
    const next: { id: string; uid?: string } = { id: randomRand() };
    if (uid) next.uid = uid;
    if (Store) Store.write(DEVICE_KEY, next, true);
  }
  /* forget: also drop the account's id from the device record (sign-out, a deleted account) */
  function clear(forget?: boolean): void {
    if (!Store) return;
    try {
      const rec = readDevice();
      wipe(!forget && isObj(rec) && typeof rec.uid === "string" ? rec.uid : undefined);
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
    all, version, ahead, device, record, fromRun, clear, stamp, outbox, enqueue, dequeue, payloads, absorb,
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
    win.addEventListener("storage", (e: any) => {
      if (!e) return;
      if (e.key === EVENTS_KEY || e.key === null) cache = null;
      if (e.key === null || e.key === DEVICE_KEY || (e.key === EVENTS_KEY && e.newValue == null)) pending = null;
    });
  }
  return api;
}

export type EventsApi = ReturnType<typeof install>;

if (typeof window !== "undefined") window.BMEvents = install(window);
