#!/usr/bin/env node
/* Sync behaviour of assets/account.js, against an in-memory stand-in for Supabase.

   Each device is account.js loaded in its own vm with its own localStorage; a page
   reload is a fresh vm over the same storage. Every device talks to one fake server
   that answers the calls account.js makes the way PostgREST and auth-js do: a select
   with maybeSingle gives the row or null, an update whose filters match nothing gives
   an empty list and no error, an insert over an existing key gives error 23505, a
   network failure comes back as { error } rather than a throw, jsonb hands object
   keys back in its own order, a select of * names every column the table has, a save
   that names a column the table lacks is refused with PGRST204, and a table that is
   not there with PGRST205. Sign-out follows auth-js 2.117 (what the site loads):
   when the server cannot be reached it still removes the session, then returns the
   error; `server.oldAuth` gives the older behaviour of keeping the session.

   The scenarios are the ways a signed-in reader could lose progress: a tab opened
   before another device synced, two devices writing at once, a reset being undone or
   wiping later work, a tab that missed a sign-out in another tab, a sync finishing
   after someone else signed in, and signing out while the last upload fails. Then the
   ways this version of the site could damage what a later one saved: fields it has
   never heard of, a row marked as a newer shape (it may handshake, never send), and a
   server whose tables are older or newer than this file. Some of these run on account.html, where the second half of
   account.js (the account page) runs in the same scope as the sync, and where readers
   sign in and out. A last section covers signing in through another service
   (assets/config.js `providers`): which services are offered, what is asked of them,
   and readers who have no email. The learning log has its own section: it leaves the
   device through events_put (the fake answers as supabase/migrations/20261015004752_events.sql
   does) and a select of the events table, and the attempts table is never touched.
   Its second half covers what the server says back and the odd rows it holds: a row whose
   hash is wrong is dropped on pull, a row in a later format stops sending, the day's quota
   and call limits hold the outbox to UTC midnight, an oversized batch is halved, a clock
   that is ahead keeps its entries for later, a long log is pulled in pages, a checkpoint
   comes back unchanged, sign-out sends what is left first, and a failing events step
   leaves the sync's result alone.

   Usage: node tools/game/sync.test.js [--only=<substring>] */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "../..");
const SRC = fs.readFileSync(path.join(ROOT, "assets/account.js"), "utf8");
/* the merge every entry puts up ahead of account.js (src/ui/core.ts), read by Node itself */
const MERGE = require("../../src/ui/core.ts").merge;
/* what events_put runs on the server: the same validity and prune rules as the browser's */
const { isValid, prune, eventId } = require("../../src/sync/events.ts");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);
const REF = "testref";
const SESSION_KEY = "sb-" + REF + "-auth-token";
const KEYS = {
  progress: "bm.progress.v1", play: "bm.play.v1", last: "bm.last", attempts: "bm.attempts.v1",
  activity: "bm.activity.v1", lesson: "bm.lesson.v1", diag: "bm.diag.v1", pet: "bm.pet.v1", game: "bm.game.v1", run: "bm.run.v1", prefs: "bm.prefs.v1"
};
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

/* ------------------------------------------------------------ the clock -- */

/* One queue of timers for every page, run by settle(): time passes only there, so a
   scenario reads as a sequence of things a reader does. */
let timers = [], timerSeq = 0, now = Date.parse("2026-10-04T12:00:00Z");
function addTimer(page, fn, ms) {
  const t = { id: ++timerSeq, page, fn, at: now + (ms || 0) };
  timers.push(t);
  return t.id;
}
function clearTimer(id) { timers = timers.filter((t) => t.id !== id); }
const tick = () => new Promise((r) => setImmediate(r));
/* account.js stamps saves and resets with Date.now(); it gets this clock, so a scenario's
   "a minute later" is a minute later for the code under test too */
class FakeDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(now); }
  static now() { return now; }
}
async function settle() {
  for (let round = 0; round < 500; round++) {
    for (let i = 0; i < 5; i++) await tick();
    if (!timers.length) return;
    timers.sort((a, b) => a.at - b.at || a.id - b.id);
    const t = timers.shift();
    now = Math.max(now, t.at);
    if (!t.page.closed) t.fn();
  }
  throw new Error("settle(): still busy after 500 rounds");
}

/* ----------------------------------------------------------- the server -- */

/* timestamptz as PostgREST prints it: +00:00, trailing zeros of the fraction dropped */
/* the UTC date of the fake clock, as events_put reads it */
const pgDay = () => new Date(now).toISOString().slice(0, 10);
function pgTime(ms) {
  return new Date(ms).toISOString().replace(/\.?0*Z$/, "+00:00").replace(/(\.\d*?)0+\+/, "$1+");
}

/* user_state as supabase/schema.sql makes it: each column a save may leave out, and what
   it then holds */
const DEFAULTS = { progress: {}, play: {}, attempts: {}, activity: {}, lesson: {}, last: null, game: {}, diag: {}, pet: {}, reset_at: 0 };

class Server {
  constructor() {
    this.rows = {};          /* user_id -> row, updated_at kept as ms */
    this.events = {};        /* user_id -> rows of the events table, seq kept */
    this.meta = {};          /* user_id -> event_meta: { seq, epoch, day, day_n, day_calls } */
    this.hints = [];         /* every hint events_put returned, for assertions */
    this.eventsDown = false; /* the rpc alone fails like a network error */
    this.full = false;       /* events_put answers bm-full */
    this.maxBatch = 500;
    this.skewMin = 0;        /* the server's clock is floor(now / 60000) + skewMin minutes */
    this.quota = 3000;       /* new rows per day */
    this.calls = 2000;       /* calls per day */
    this.profiles = {};
    this.columns = ["user_id"].concat(Object.keys(DEFAULTS), "updated_at");   /* of user_state */
    this.missing = {};       /* tables and functions this project does not have: { events_put: true } */
    this.refused = 0;        /* saves turned away for naming a column that is not there */
    this.offline = false;    /* every request fails, database and auth alike */
    this.dbError = null;     /* database requests fail with this, auth still works */
    this.oldAuth = false;    /* sign-out keeps the session when it cannot reach the server */
    this.held = null;        /* while set, requests wait here (hold / release) */
    this.log = [];
    this.learners = {};      /* managed learner id -> guardian account id (every account is its own self learner) */
    this.learnersError = null; /* the learners read fails with this code (a transient error, not a verdict) */
    this.puts = [];          /* the arguments of every events_put call, as sent */
  }
  addLearner(guardian, id) { this.learners[id] = guardian; }
  /* the ids a caller may act as: itself and the learners it is guardian of (PA-1's policies) */
  allowed(uid, id) { return id === uid || this.learners[id] === uid; }
  hold() {
    let open;
    this.held = new Promise((r) => { open = r; });
    this.release = () => { this.held = null; open(); };
  }
  writes() { return this.log.filter((l) => /^(insert|update|upsert) user_state/.test(l)).length; }
  out(row, cols) {
    const r = jsonbOrder(clone(row));
    this.columns.forEach((c) => { if (!(c in r)) r[c] = clone(DEFAULTS[c]); });
    r.updated_at = pgTime(row.updated_at);
    if (!cols || cols === "*") return r;
    const o = {};
    cols.split(",").map((c) => c.trim()).forEach((c) => { o[c] = r[c]; });
    return o;
  }
  stamp(v) {
    const ms = v === undefined ? now : Date.parse(v);
    if (!isFinite(ms)) throw new Error("fake server: unreadable updated_at " + JSON.stringify(v));
    return ms;
  }
  matches(row, filters) {
    return filters.every(([c, v]) => (c === "updated_at" ? row.updated_at === Date.parse(v) : String(row[c]) === String(v)));
  }
  /* a row as the events table holds it, from a payload */
  rowOf(id, p, v, seq) {
    return { id, v: v || 1, t: p[0], d: p[1], src: p[2], sec: p[3], ref: p[4], k: p[5], ok: p[6], n: p[7], r: p[8], f: p[9], x: p.length === 11 ? clone(p[10]) : null, seq };
  }
  payloadOf(r) {
    const p = [r.t, r.d, r.src, r.sec, r.ref, r.k, r.ok, r.n, r.r, r.f];
    if (r.x !== null && r.x !== undefined) p.push(clone(r.x));
    return p;
  }
  /* a row as given, with the next seq (a wrong hash, a v of 2: what the client never sends) */
  seedEvent(uid, row) {
    const m = this.metaOf(uid);
    m.seq += 1;
    (this.events[uid] = this.events[uid] || []).push(Object.assign({ v: 1, x: null }, clone(row), { seq: m.seq }));
  }
  metaOf(uid) {
    return this.meta[uid] || (this.meta[uid] = { seq: 0, epoch: 0, day: pgDay(), day_n: 0, day_calls: 0 });
  }
  /* public.events_put, answer for answer and in its order */
  put(uid, batch, epoch) {
    const m = this.metaOf(uid);
    if (m.day < pgDay()) { m.day = pgDay(); m.day_n = 0; m.day_calls = 0; }
    m.day_calls += 1;
    const hint = (h) => { this.hints.push(h.hint); return h; };
    if (m.day_calls > this.calls) return hint({ hint: "bm-calls" });
    if (!Array.isArray(batch) || batch.length > this.maxBatch) return hint({ hint: "bm-batch" });
    if (!batch.length) return { epoch: m.epoch, seq: m.seq };
    if (epoch !== m.epoch) return hint({ hint: "bm-reset", epoch: m.epoch });
    if (this.full) return hint({ hint: "bm-full" });
    const mine = (this.events[uid] = this.events[uid] || []);
    const byId = new Map();
    batch.forEach((e) => { byId.set(e && typeof e.id === "string" ? e.id : "\u0000" + byId.size, e); });
    const limit = Math.floor(now / 60000) + (this.skewMin || 0) + 1440;
    const refused = [], fresh = [];
    byId.forEach((e, id) => {
      const p = e && e.p;
      if (!isValid(id, p)) refused.push({ id: typeof id === "string" && id[0] !== "\u0000" ? id : null, why: "invalid" });
      else if (p[0] > limit) refused.push({ id, why: "future" });
      else if (!mine.some((r) => r.id === id)) fresh.push({ id, p, v: e.v });
    });
    if (m.day_n + fresh.length > this.quota) return hint({ hint: "bm-quota", refused });
    if (mine.length + fresh.length > 25000) return hint({ hint: "bm-full" });
    fresh.sort((a, b) => a.p[0] - b.p[0] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    fresh.forEach((f, i) => mine.push(this.rowOf(f.id, f.p, f.v, m.seq + i + 1)));
    /* prune over the reader's whole set; the survivors keep their seq */
    const set = {};
    mine.forEach((r) => { set[r.id] = this.payloadOf(r); });
    const kept = prune(set);
    const left = mine.filter((r) => kept[r.id]);
    const added = fresh.filter((f) => kept[f.id]).length;
    this.events[uid] = left;
    m.seq += fresh.length;
    m.day_n += added;
    return { added, refused, seq: m.seq, epoch: m.epoch };
  }
  /* the user_state triggers: a reset moves the epoch on and deletes the reader's events */
  resetTrigger(uid) {
    if (!this.meta[uid]) return;
    this.meta[uid].epoch += 1;
    this.events[uid] = [];
  }
  rpc(name, args, uid) {
    if (name !== "events_put") return Promise.resolve({ data: null, error: null });
    return Promise.resolve(this.held).then(() => {
      this.log.push("rpc events_put " + (Array.isArray(args.batch) ? args.batch.length : "?"));
      this.puts.push(clone(args));
      if (this.offline || this.eventsDown) return { data: null, error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 };
      if (!uid) return { data: null, error: { message: "not signed in", code: "P0001" }, status: 400 };
      if (this.missing.events_put) {
        return { data: null, error: { message: "Could not find the function public.events_put(batch, epoch) in the schema cache", code: "PGRST202" }, status: 404 };
      }
      const target = args.learner === undefined || args.learner === null ? uid : args.learner;
      if (!this.allowed(uid, target)) return { data: null, error: { message: "not your learner", code: "P0001" }, status: 400 };
      return { data: clone(this.put(target, clone(args.batch), args.epoch)), error: null, status: 200 };
    });
  }
  exec(q, uid) {
    if (q.table === "attempts") throw new Error("fake server: nothing may touch attempts (P6)");
    this.log.push(q.op + " " + q.table);
    if (this.offline) return { data: null, error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 };
    if (this.dbError) return { data: null, error: clone(this.dbError), status: 403 };
    if (!uid) return { data: null, error: { message: "permission denied", code: "42501" }, status: 401 };
    if (this.missing[q.table]) {
      return { data: null, error: { message: "Could not find the table 'public." + q.table + "' in the schema cache", code: "PGRST205" }, status: 404 };
    }
    if (q.table === "learners") {
      if (this.learnersError) return { data: null, error: { message: "temporarily unavailable", code: this.learnersError }, status: 503 };
      if (q.op !== "select") throw new Error("fake server: learners is read with select only");
      const id = (q.filters.find(([c]) => c === "id") || [])[1];
      /* the select policy: a guardian sees their own learners */
      return { data: id !== undefined && this.learners[id] === uid ? { id } : null, error: null, status: 200 };
    }
    if (q.table === "events") {
      if (q.op !== "select") throw new Error("fake server: events is read with select only");
      const cols = q.cols.split(",").map((c) => c.trim());
      /* the policy admits the caller's learners' rows; without a user_id filter all of them come back */
      const want = (q.filters.find(([c]) => c === "user_id") || [])[1];
      const owners = want === undefined ? Object.keys(this.events).filter((id) => this.allowed(uid, id)) : this.allowed(uid, want) ? [want] : [];
      const rows = [].concat(...owners.map((o) => this.events[o] || [])).filter((r) => q.filters.every(([c, v]) => c === "user_id" || String(r[c]) === String(v)) && q.after.every(([c, v]) => r[c] > v))
        .sort((a, b) => a.seq - b.seq).slice(0, q.limit === null ? Infinity : q.limit);
      return { data: rows.map((r) => { const o = {}; cols.forEach((c) => { o[c] = r[c] === undefined ? null : clone(r[c]); }); return o; }), error: null, status: 200 };
    }
    if (q.table === "profiles") {
      if (q.op === "select") return { data: this.profiles[uid] || null, error: null, status: 200 };
      this.profiles[uid] = clone(q.payload);
      return { data: null, error: null, status: 201 };
    }
    if (q.table !== "user_state") throw new Error("fake server: unknown table " + q.table);
    /* row-level security: a reader sees and writes only their own row */
    const mine = (r) => this.allowed(uid, r.user_id);
    if (q.op === "select") {
      const found = Object.values(this.rows).filter((r) => mine(r) && this.matches(r, q.filters));
      if (q.single) return { data: found.length ? this.out(found[0], q.cols) : null, error: null, status: 200 };
      return { data: found.map((r) => this.out(r, q.cols)), error: null, status: 200 };
    }
    const p = clone(q.payload);
    const extra = Object.keys(p).find((c) => this.columns.indexOf(c) < 0);
    if (extra) {
      this.refused++;
      return { data: null, error: { message: "Could not find the '" + extra + "' column of 'user_state' in the schema cache", code: "PGRST204" }, status: 400 };
    }
    if (!this.allowed(uid, p.user_id)) return { data: null, error: { message: "new row violates row-level security policy", code: "42501" }, status: 403 };
    const ret = (rows) => ({ data: q.returning ? rows.map((r) => this.out(r, q.returning)) : null, error: null, status: q.op === "update" ? 200 : 201 });
    if (q.op === "insert") {
      if (this.rows[p.user_id]) {
        return { data: null, error: { message: 'duplicate key value violates unique constraint "user_state_pkey"', code: "23505" }, status: 409 };
      }
      p.updated_at = this.stamp(p.updated_at);
      this.rows[p.user_id] = p;
      if (Number(p.reset_at) > 0) this.resetTrigger(p.user_id);
      return ret([p]);
    }
    if (q.op === "upsert") {
      p.updated_at = this.stamp(p.updated_at);
      this.rows[uid] = Object.assign({}, this.rows[uid] || {}, p);
      return ret([this.rows[uid]]);
    }
    if (q.op === "update") {
      const hit = Object.values(this.rows).filter((r) => mine(r) && this.matches(r, q.filters));
      hit.forEach((r) => {
        const was = Number(r.reset_at) || 0;
        Object.assign(r, p, { user_id: r.user_id, updated_at: this.stamp(p.updated_at) });
        if ((Number(r.reset_at) || 0) > was) this.resetTrigger(r.user_id);
      });
      return ret(hit);
    }
    throw new Error("fake server: unknown operation " + q.op);
  }
  solved(uid) {
    const row = this.rows[uid];
    return row ? solvedIn(row.progress) : [];
  }
}

/* jsonb's key order: shorter keys first, then bytewise */
function jsonbOrder(x) {
  if (Array.isArray(x)) return x.map(jsonbOrder);
  if (!x || typeof x !== "object") return x;
  const o = {};
  Object.keys(x).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)).forEach((k) => { o[k] = jsonbOrder(x[k]); });
  return o;
}

function solvedIn(progress) {
  const out = [];
  Object.keys(progress || {}).sort().forEach((ch) => {
    Object.keys((progress[ch] || {}).solved || {}).sort().forEach((k) => out.push(ch + "/" + k));
  });
  return out;
}

/* the query builder supabase-js hands back: chainable, and a thenable at the end */
function query(server, table, uid) {
  const q = { table, op: "select", cols: null, filters: [], after: [], limit: null, payload: null, returning: null, single: false };
  const api = {
    select(cols) { if (q.op === "select") q.cols = cols || "*"; else q.returning = cols || "*"; return api; },
    insert(p) { q.op = "insert"; q.payload = p; return api; },
    update(p) { q.op = "update"; q.payload = p; return api; },
    upsert(p) { q.op = "upsert"; q.payload = p; return api; },
    eq(c, v) { q.filters.push([c, v]); return api; },
    gt(c, v) { q.after.push([c, v]); return api; },
    order() { return api; },
    limit(n) { q.limit = n; return api; },
    maybeSingle() { q.single = true; return api; },
    single() { q.single = true; return api; },
    /* the token goes with the request when it is sent, not when the answer comes back */
    then(ok, bad) { const id = uid(); return Promise.resolve(server.held).then(() => server.exec(q, id)).then(ok, bad); }
  };
  return api;
}

/* ----------------------------------------------------------- a device -- */

class Device {
  constructor(name, server) {
    this.name = name;
    this.server = server;
    this.storage = new Map();
    this.page = null;
  }
  /* as if this browser had signed in on an earlier visit */
  remember(uid, extra) {
    this.storage.set(SESSION_KEY, JSON.stringify({ user: Object.assign({ id: uid, email: uid + "@example.com" }, extra || {}) }));
  }
  read(key, fallback) {
    const raw = this.storage.get(key);
    return raw === undefined ? fallback : JSON.parse(raw);
  }
  solved() { return solvedIn(this.read(KEYS.progress, {})); }
  setAside(uid) {
    const p = this.read("bm.sync.pending.v1", {})[uid];
    return p ? solvedIn((p.state || {}).progress) : [];
  }
  /* a second tab of the same browser: same storage, its own page */
  openTab() { return new Page(this); }
  /* a fresh page load; the old page gets its pagehide first */
  open(opts) {
    if (this.page) this.page.close();
    this.page = new Page(this, opts);
    return this.page;
  }
}

class Page {
  constructor(device, opts) {
    opts = opts || {};
    this.device = device;
    this.closed = false;
    this.reloads = 0;
    const page = this, storage = device.storage, server = device.server;
    /* `account: true` is account.html: the page has the element account.js draws the
       account page into, so that half of the file runs too. What it draws is in shown(). */
    const host = opts.account ? { innerHTML: "", querySelector: () => null, querySelectorAll: () => [], contains: () => false } : null;
    const listeners = [], winEvents = {}, docEvents = {};
    const session = () => {
      const raw = storage.get(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    };
    const authSubs = [];
    const client = {
      from: (table) => query(server, table, () => (session() ? session().user.id : null)),
      rpc: (name, args) => server.rpc(name, args, session() ? session().user.id : null),
      auth: {
        onAuthStateChange(cb) {
          authSubs.push(cb);
          Promise.resolve().then(() => cb("INITIAL_SESSION", session()));
          return { data: { subscription: { unsubscribe() {} } } };
        },
        getSession: () => Promise.resolve({ data: { session: session() }, error: null }),
        /* auth-js: when the server cannot be reached the session is kept and an error
           returned; otherwise the session is removed and SIGNED_OUT fires before the
           promise resolves */
        /* the browser would now leave for the service; here the call is only recorded */
        signInWithOAuth: (a) => Promise.resolve().then(() => {
          server.log.push("auth oauth " + a.provider + " " + a.options.redirectTo + (a.options.scopes ? " scopes=" + a.options.scopes : ""));
          return { data: { provider: a.provider, url: "about:blank" }, error: null };
        }),
        signOut: (opts) => Promise.resolve().then(() => {
          server.log.push("auth signOut " + ((opts && opts.scope) || "global"));
          const failed = server.offline && session();
          if (failed && server.oldAuth) return { error: { name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 } };
          storage.delete(SESSION_KEY);
          authSubs.forEach((cb) => cb("SIGNED_OUT", null));
          return { error: failed ? { name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 } : null };
        })
      }
    };
    const Store = {
      keys: KEYS,
      read: (k, f) => { const raw = storage.get(k); return raw === undefined ? f : JSON.parse(raw); },
      /* `page.refuse(key)` true: the browser's storage is full for that key (site.js's Store
         answers false and keeps going) */
      write: (k, v, silent) => { if (page.refuse && page.refuse(k)) return false; storage.set(k, JSON.stringify(v)); if (!silent) Store.emit({ type: "state", key: k }); return true; },
      on: (fn) => listeners.push(fn),
      emit: (c) => listeners.slice().forEach((fn) => fn(c))
    };
    const win = {
      console, URL, Blob: function () {}, Date: FakeDate,
      BMCore: { config: require("../../src/core/config.ts") },
      BM_CONFIG: Object.assign({ supabaseUrl: "https://" + REF + ".supabase.co", supabaseAnonKey: "sb_publishable_test" }, opts.config || {}),
      supabase: { createClient: () => client },
      BMStore: Store,
      BMSite: { rootPrefix: () => "", escapeHtml: (s) => String(s) },
      location: { hash: "", search: "", reload: () => { page.reloads++; }, href: opts.href || "http://localhost:8000/" + (host ? "account.html" : "parts/1-algebra/01-numbers.html") },
      localStorage: {
        getItem: (k) => (storage.has(k) ? storage.get(k) : null),
        setItem: (k, v) => storage.set(k, String(v)),
        removeItem: (k) => storage.delete(k)
      },
      setTimeout: (fn, ms) => addTimer(page, fn, ms),
      clearTimeout: (id) => clearTimer(id),
      addEventListener: (t, fn) => { (winEvents[t] = winEvents[t] || []).push(fn); },
      document: {
        visibilityState: "visible",
        activeElement: null,
        querySelector: (sel) => (host && /\[data-account\]/.test(sel) ? host : null),
        querySelectorAll: () => [],
        getElementById: () => null,
        addEventListener: (t, fn) => { (docEvents[t] = docEvents[t] || []).push(fn); },
        head: { appendChild() {} },
        createElement: () => ({})
      }
    };
    win.window = win;
    /* `merge` builds the page's BMMerge from its window, for a merge that can be broken */
    win.BMMerge = opts.merge ? opts.merge(win) : MERGE;
    vm.createContext(win);
    vm.runInContext(opts.src || SRC, win, { filename: "assets/account.js" });
    this.Account = win.BMAccount;
    /* the page's event recorder (src/ui/events.ts), over this page's own store and storage */
    win.BMEvents = require("../../src/ui/events.ts").install(win);
    this.Store = Store;
    this.win = win;
    this.shown = () => (host ? host.innerHTML : "");
    /* someone else signs in on this page (another reader on a shared machine) */
    this.switchTo = (uid) => {
      device.remember(uid);
      authSubs.forEach((cb) => cb("SIGNED_IN", session()));
    };
    this.fire = (t) => (winEvents[t] || []).forEach((fn) => fn({}));
  }
  close() {
    this.fire("pagehide");
    this.closed = true;
  }
  solve(ch, key) {
    const all = this.Store.read(KEYS.progress, {});
    const rec = all[ch] || { solved: {}, total: 10 };
    rec.solved[key] = true;
    all[ch] = rec;
    this.Store.write(KEYS.progress, all);
  }
  /* an answer check, as site.js announces it (initExercises check()) */
  check(ch, key, correct) {
    this.Store.emit({ type: "attempt", chapter: ch, key, section: "s", correct: !!correct, tryNo: 1, hintLevel: 0, solutionOpen: false, inline: false });
  }
  status() { return this.Account.status().state; }
  /* an Arena run on today's date of the fake clock (src/learn/recorder.ts runPayloads) */
  run(answers) {
    return this.win.BMEvents.fromRun({ day: pgDay(), answers });
  }
  /* what the "Reset all progress" button on about.html does (site.js initResetButtons) */
  resetAll() {
    ["progress", "play", "attempts", "activity", "lesson", "game", "pet", "run"].forEach((f) => this.Store.write(KEYS[f], {}));
    this.Store.emit({ type: "reset" });
  }
  user() { const u = this.Account.user(); return u ? u.id : null; }
  async switchLearner(id) {
    let result, error = null;
    this.Account.switchLearner(id).then((r) => { result = r; }, (e) => { error = e; });
    await settle();
    return { result, error };
  }
  async signOut() {
    let result, error = null;
    this.Account.signOut().then((r) => { result = r; }, (e) => { error = e; });
    await settle();
    return { result, error };
  }
}

/* ------------------------------------------------------------ scenarios -- */

const scenarios = [];
function scenario(name, fn) { scenarios.push({ name, fn }); }
function expect(cond, msg, detail) {
  if (!cond) throw new Error(msg + (detail === undefined ? "" : "\n          " + JSON.stringify(detail)));
}
const has = (list, item) => list.indexOf(item) > -1;

/* Two devices signed in to one account, both loaded and synced. */
async function twoDevices() {
  const server = new Server();
  const laptop = new Device("laptop", server), phone = new Device("phone", server);
  laptop.remember("u1"); phone.remember("u1");
  laptop.open(); await settle();
  phone.open(); await settle();
  return { server, laptop, phone };
}

scenario("a normal sign-out saves first, then clears this browser", async () => {
  const { server, laptop } = await twoDevices();
  laptop.page.solve("ch01", "e1");
  const { error } = await laptop.page.signOut();
  expect(!error, "sign-out failed", error && error.message);
  expect(has(server.solved("u1"), "ch01/e1"), "the account is missing the progress made before signing out", server.solved("u1"));
  expect(laptop.solved().length === 0, "this browser still holds progress after a successful sign-out", laptop.solved());
  expect(laptop.page.user() === null, "still signed in after sign-out");
});

scenario("progress made before signing in is merged into the account", async () => {
  const server = new Server();
  server.rows.u1 = { user_id: "u1", progress: { ch01: { solved: { e2: true }, total: 10 } }, reset_at: 0, updated_at: now - 1000 };
  const d = new Device("laptop", server);
  d.open(); d.page.solve("ch01", "e1"); await settle();
  d.remember("u1"); d.open(); await settle();
  expect(has(server.solved("u1"), "ch01/e1") && has(server.solved("u1"), "ch01/e2"), "the account does not hold both", server.solved("u1"));
  expect(has(d.solved(), "ch01/e1") && has(d.solved(), "ch01/e2"), "this browser does not hold both", d.solved());
});

scenario("a different account's leftover progress is not merged in", async () => {
  const server = new Server();
  const d = new Device("shared", server);
  d.storage.set("bm.sync.v1", JSON.stringify({ user: "u2", resetAt: 0 }));
  d.storage.set(KEYS.progress, JSON.stringify({ ch01: { solved: { e9: true }, total: 10 } }));
  d.remember("u1"); d.open(); await settle();
  expect(!has(server.solved("u1"), "ch01/e9"), "another reader's progress was merged into u1's account", server.solved("u1"));
});

scenario("a tab opened before another device synced does not overwrite it", async () => {
  const { server, laptop, phone } = await twoDevices();
  phone.page.solve("ch01", "e1"); await settle();
  await phone.page.signOut();
  /* the laptop page was loaded before e1 existed and has not been reloaded */
  laptop.page.solve("ch01", "e2"); await settle();
  const s = server.solved("u1");
  expect(has(s, "ch01/e1"), "the phone's progress was overwritten by the stale laptop tab", s);
  expect(has(s, "ch01/e2"), "the laptop's own progress did not reach the account", s);
});

scenario("two devices saving at the same moment both keep their progress", async () => {
  const { server, laptop, phone } = await twoDevices();
  laptop.page.solve("ch01", "e1");
  phone.page.solve("ch02", "e1");
  await settle();
  const s = server.solved("u1");
  expect(has(s, "ch01/e1") && has(s, "ch02/e1"), "one device's progress was lost", s);
  laptop.open(); phone.open(); await settle();
  expect(has(laptop.solved(), "ch02/e1") && has(phone.solved(), "ch01/e1"), "the devices did not converge", { laptop: laptop.solved(), phone: phone.solved() });
});

scenario("a reset on one device is not undone by a stale tab on another", async () => {
  const { server, laptop, phone } = await twoDevices();
  laptop.page.solve("ch01", "e1"); await settle();
  phone.open(); await settle();
  expect(has(phone.solved(), "ch01/e1"), "setup: the phone did not receive e1");
  phone.page.resetAll(); await settle();
  expect(server.solved("u1").length === 0, "setup: the reset did not reach the account", server.solved("u1"));
  const stamp = server.rows.u1.reset_at;
  /* the laptop page still remembers e1 */
  laptop.page.solve("ch01", "e2"); await settle();
  expect(!has(server.solved("u1"), "ch01/e1"), "the reset was undone: e1 is back in the account", server.solved("u1"));
  expect(Number(server.rows.u1.reset_at) >= Number(stamp), "the account's reset stamp went backwards", { before: stamp, after: server.rows.u1.reset_at });
  phone.open(); await settle();
  expect(!has(phone.solved(), "ch01/e1"), "the reset was undone on the phone", phone.solved());
});

scenario("a reset is kept when this device's first read fails", async () => {
  const { server, laptop, phone } = await twoDevices();
  laptop.page.solve("ch01", "e1"); await settle();
  phone.open(); await settle();
  phone.page.resetAll(); await settle();
  /* the laptop reloads while the service is unreachable, then it comes back */
  server.offline = true;
  laptop.open(); await settle();
  server.offline = false;
  laptop.page.solve("ch01", "e2"); await settle();
  expect(!has(server.solved("u1"), "ch01/e1"), "the reset was undone after a failed read", server.solved("u1"));
});

scenario("signing out while offline sets the unsaved progress aside, and saves it at the next sign-in", async () => {
  const { server, laptop } = await twoDevices();
  server.offline = true;
  laptop.page.solve("ch01", "e1"); await settle();
  const { result, error } = await laptop.page.signOut();
  expect(!error, "sign-out rejected although the SDK removed the session", error && error.message);
  expect(result && result.saved === false, "the caller was not told the progress could not be saved", result);
  expect(laptop.page.user() === null, "still signed in after the session was removed");
  expect(laptop.solved().length === 0, "the unsaved progress is still on view in this browser", laptop.solved());
  expect(has(laptop.setAside("u1"), "ch01/e1"), "the unsaved progress was not set aside", laptop.setAside("u1"));
  server.offline = false;
  laptop.remember("u1"); laptop.open(); await settle();
  expect(has(server.solved("u1"), "ch01/e1"), "the set-aside progress did not reach the account", server.solved("u1"));
  expect(laptop.setAside("u1").length === 0, "the set-aside copy was not removed once saved", laptop.setAside("u1"));
});

scenario("signing out when the upload fails sets the progress aside, and says so", async () => {
  const { server, laptop } = await twoDevices();
  server.dbError = { message: "permission denied for table user_state", code: "42501" };
  laptop.page.solve("ch01", "e1"); await settle();
  const { result, error } = await laptop.page.signOut();
  expect(!error && result && result.saved === false, "the caller was not told the progress could not be saved", { result, error: error && error.message });
  expect(result.error && /permission denied/.test(result.error.message), "the reason was not passed on", result.error);
  expect(has(laptop.setAside("u1"), "ch01/e1") && laptop.solved().length === 0, "the progress was not set aside out of view",
    { aside: laptop.setAside("u1"), live: laptop.solved() });
});

scenario("sign-out signs out this device only", async () => {
  const { server, laptop } = await twoDevices();
  await laptop.page.signOut();
  expect(server.log.indexOf("auth signOut local") > -1, "sign-out did not use the local scope", server.log.filter((l) => /signOut/.test(l)));
});

scenario("with an SDK that keeps the session when sign-out fails, nothing is removed", async () => {
  const { server, laptop } = await twoDevices();
  server.offline = true; server.oldAuth = true;
  laptop.page.solve("ch01", "e1"); await settle();
  const { error } = await laptop.page.signOut();
  expect(error && /still signed in/.test(error.message), "the reader was not told they are still signed in", error && error.message);
  expect(laptop.page.user() === "u1", "the page thinks the reader signed out");
  expect(has(laptop.solved(), "ch01/e1"), "progress was removed although the reader is still signed in", laptop.solved());
});

scenario("the same reader signing in again saves what a failed sign-out set aside", async () => {
  const { server, laptop } = await twoDevices();
  server.dbError = { message: "permission denied for table user_state", code: "42501" };
  laptop.page.solve("ch01", "e1"); await settle();
  await laptop.page.signOut();
  server.dbError = null;
  laptop.remember("u1"); laptop.open(); await settle();
  expect(has(server.solved("u1"), "ch01/e1"), "the set-aside progress did not reach the account", server.solved("u1"));
});

scenario("a different reader signing in does not get progress set aside for someone else", async () => {
  const { server, laptop } = await twoDevices();
  server.dbError = { message: "permission denied for table user_state", code: "42501" };
  laptop.page.solve("ch01", "e1"); await settle();
  await laptop.page.signOut();
  server.dbError = null;
  laptop.page.solve("ch03", "e7"); await settle();
  laptop.remember("u2"); laptop.open(); await settle();
  expect(!has(server.solved("u2"), "ch01/e1"), "u1's set-aside progress was merged into u2's account", server.solved("u2"));
  expect(has(server.solved("u2"), "ch03/e7"), "work done signed out did not merge into the next account", server.solved("u2"));
  expect(has(laptop.setAside("u1"), "ch01/e1"), "u1's set-aside progress was lost when u2 signed in", laptop.setAside("u1"));
});

scenario("a reset that never reached the account does not wipe work another device saved after it", async () => {
  const { server, laptop, phone } = await twoDevices();
  laptop.page.solve("ch01", "e1"); await settle();
  phone.open(); await settle();
  server.offline = true;
  laptop.page.resetAll(); await settle();
  server.offline = false;
  now += 60000;
  phone.page.solve("ch02", "e5"); await settle();
  laptop.open(); await settle();
  expect(has(server.solved("u1"), "ch02/e5"), "the phone's work after the reset was wiped", server.solved("u1"));
  phone.open(); await settle();
  expect(has(phone.solved(), "ch02/e5"), "the phone lost its own work", phone.solved());
});

scenario("a reset made offline still applies when nothing was saved after it", async () => {
  const { server, laptop, phone } = await twoDevices();
  laptop.page.solve("ch01", "e1"); await settle();
  phone.open(); await settle();
  now += 60000;
  server.offline = true;
  laptop.page.resetAll(); await settle();
  server.offline = false;
  laptop.open(); await settle();
  expect(server.solved("u1").length === 0, "the reset did not reach the account", server.solved("u1"));
  phone.open(); await settle();
  expect(phone.solved().length === 0, "the reset did not reach the phone", phone.solved());
});

scenario("a tab that missed a sign-out in another tab does not overwrite the account", async () => {
  const { server, laptop } = await twoDevices();
  const tabB = laptop.openTab(); await settle();
  laptop.page.solve("ch01", "e1"); await settle();
  laptop.page.solve("ch01", "e2");          /* tab A has a save pending */
  tabB.Account.signOut();                   /* tab B signs out first; its save includes e2 */
  await settle();
  expect(laptop.solved().length === 0, "setup: tab B did not clear the browser", laptop.solved());
  const s = server.solved("u1");
  expect(has(s, "ch01/e1") && has(s, "ch01/e2"), "the account was overwritten by the tab that missed the sign-out", s);
});

scenario("a sync that finishes after someone else signs in does not write into their account", async () => {
  const { server, laptop } = await twoDevices();
  laptop.page.solve("ch01", "e1"); await settle();
  server.hold();
  laptop.page.Account.syncNow();
  for (let i = 0; i < 5; i++) await tick();
  laptop.page.switchTo("u2");
  await settle();                           /* the page now knows u2; u1's read is still in flight */
  server.release();
  await settle();
  expect(!has(server.solved("u2"), "ch01/e1"), "u1's progress was written into u2's account", server.solved("u2"));
});

scenario("loading a page with nothing new does not rewrite the account", async () => {
  const { server, laptop } = await twoDevices();
  laptop.page.solve("ch01", "e1"); await settle();
  laptop.open(); await settle();
  const before = server.writes();
  laptop.open(); await settle();
  expect(server.writes() === before, "a page load with no changes wrote to the account", server.log.slice(-6));
});

scenario("progress saved just before a reload is in the account", async () => {
  const { server, laptop } = await twoDevices();
  laptop.page.solve("ch01", "e1");
  laptop.open(); await settle();
  expect(has(server.solved("u1"), "ch01/e1"), "the change made just before the reload was lost", server.solved("u1"));
});

/* ------------------------------------------- other versions of the site -- */

/* JSON with keys sorted at every level: "the same" for anything that has been through jsonb */
function canon(x) {
  if (Array.isArray(x)) return "[" + x.map(canon).join(",") + "]";
  if (x && typeof x === "object") return "{" + Object.keys(x).sort().map((k) => JSON.stringify(k) + ":" + canon(x[k])).join(",") + "}";
  return JSON.stringify(x === undefined ? null : x);
}
const dig = (x, at) => at.reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), x);

/* A row as a later version of the site might leave it. Beside what this version knows
   sit fields it has never heard of, at every level its merge rebuilds: a store's own
   keys, a chapter's record, an exercise's, a section's, a best, a medal. FUTURE lists
   where they are. The "~meta" keys of the keyed stores hold no object on purpose: an
   object there is merged as a chapter, section, best or medal and gains that kind's
   fields, which has a scenario of its own below. */
const NEWER = {
  progress: { "~meta": [3, { b: 1, a: 2 }], ch01: { solved: { e1: true }, total: 10, stars: { gold: 2 } } },
  play: { "~meta": "p", ch01: { done: { m1: true }, total: 3, intro: true } },
  attempts: { "~meta": 7, ch01: { "~n": [1], e1: { tries: 1, solved: 1700000000000, first: 1, section: "s", faded: 2, flags: { z: 1, a: null } } } },
  activity: { days: { "2026-10-01": 20 }, freeze: { left: 2, used: ["2026-09-30"] } },
  lesson: { reached: { ch01: 4 }, pace: "slow" },
  last: { id: "ch01", section: null },
  game: {
    ach: { "first-light": 1700000000000 }, cmp: {}, daily: {}, maxed: 1, v: 1,
    sec: { "~meta": "s", "ch01#s": { n: 2, ok: 2, box: 1, last: "2026-10-01", ease: 2.5 } },
    best: { "~meta": 0, standard: { score: 300, hearts: 1, day: "2026-10-01", replay: [1, 2, 3] } },
    enc: { "~meta": false, "ch01/practice": { medal: 2, day: "2026-10-01", gate: { open: true } } },
    wallet: { coins: 40, log: [{ id: "a", n: 5 }] }
  },
  /* a column this version does not know either */
  gates: { "boss:ch01": "open" }
};
const FUTURE = [
  ["progress", "~meta"], ["progress", "ch01", "stars"], ["play", "~meta"], ["play", "ch01", "intro"],
  ["attempts", "~meta"], ["attempts", "ch01", "~n"], ["attempts", "ch01", "e1", "faded"], ["attempts", "ch01", "e1", "flags"],
  ["activity", "freeze"], ["lesson", "pace"],
  ["game", "v"], ["game", "wallet"], ["game", "sec", "~meta"], ["game", "sec", "ch01#s", "ease"],
  ["game", "best", "~meta"], ["game", "best", "standard", "replay"], ["game", "enc", "~meta"], ["game", "enc", "ch01/practice", "gate"]
];
/* the paths of FUTURE that `state` no longer holds exactly as NEWER has them */
function lostFrom(state) {
  return FUTURE.filter((at) => canon(dig(state, at)) !== canon(dig(NEWER, at)) || dig(state, at) === undefined).map((at) => at.join(" > "));
}
function stored(device) {
  const out = {};
  ["progress", "play", "attempts", "activity", "lesson", "game"].forEach((f) => { out[f] = device.read(KEYS[f], {}); });
  return out;
}

/* this browser has worked on the same chapter, exercise, section, best and medal as NEWER,
   so every one of those records is rebuilt by the merge rather than copied */
function worked(d) {
  d.storage.set(KEYS.progress, JSON.stringify({ ch01: { solved: { e2: true }, total: 10 } }));
  d.storage.set(KEYS.play, JSON.stringify({ ch01: { done: { m2: true }, total: 3, guess: 1 } }));
  d.storage.set(KEYS.attempts, JSON.stringify({ ch01: { e1: { tries: 3, solved: 1700000005000, first: 0, section: "s" }, e2: { tries: 1, solved: 1700000009000, first: 1, section: "s" } } }));
  d.storage.set(KEYS.activity, JSON.stringify({ days: { "2026-10-01": 35, "2026-10-02": 10 } }));
  d.storage.set(KEYS.lesson, JSON.stringify({ reached: { ch01: 9 }, mode: "page" }));
  d.storage.set(KEYS.game, JSON.stringify({
    ach: {}, cmp: {}, daily: {}, maxed: 3,
    sec: { "ch01#s": { n: 9, ok: 7, box: 4, last: "2026-10-03" } },
    best: { standard: { score: 900, hearts: 3, day: "2026-10-03" } },
    enc: { "ch01/practice": { medal: 3, day: "2026-10-03" } }
  }));
}
function newerRow(server) {
  server.columns.push("gates");
  server.rows.u1 = Object.assign({ user_id: "u1", reset_at: 0, updated_at: now - 1000 }, clone(NEWER));
}

scenario("fields a later version of the site saved survive a sync from a device with changes of its own", async () => {
  const server = new Server();
  newerRow(server);
  const d = new Device("laptop", server);
  worked(d);
  d.remember("u1"); d.open(); await settle();
  expect(d.page.status() === "synced", "the sync did not finish", d.page.Account.status());
  const row = () => server.rows.u1;
  expect(has(server.solved("u1"), "ch01/e1") && has(server.solved("u1"), "ch01/e2"), "the account does not hold both devices' progress", server.solved("u1"));
  expect(row().game.best.standard.score === 900 && row().game.enc["ch01/practice"].medal === 3 && row().game.sec["ch01#s"].n === 9 && row().attempts.ch01.e1.tries === 3,
    "the known fields did not merge by their own rules", { game: row().game, e1: row().attempts.ch01.e1 });
  expect(lostFrom(row()).length === 0, "the account lost fields this version does not know", lostFrom(row()));
  expect(lostFrom(stored(d)).length === 0, "this browser lost fields this version does not know", lostFrom(stored(d)));
  expect(canon(row().gates) === canon(NEWER.gates), "a column this version does not know was changed", row().gates);
  /* a later change is written straight from this browser, without reading the row again */
  d.page.solve("ch02", "e1"); await settle();
  expect(has(server.solved("u1"), "ch02/e1"), "setup: the later change did not reach the account", server.solved("u1"));
  expect(lostFrom(row()).length === 0 && canon(row().gates) === canon(NEWER.gates), "a later save dropped fields this version does not know", lostFrom(row()));
  /* and a second device that starts empty receives them whole */
  const phone = new Device("phone", server);
  phone.remember("u1"); phone.open(); await settle();
  expect(lostFrom(stored(phone)).length === 0, "a second device did not receive the unknown fields", lostFrom(stored(phone)));
  const before = server.writes();
  d.open(); phone.open(); await settle();
  expect(server.writes() === before, "reloading with nothing new rewrote the account", server.log.slice(-6));
});

scenario("an object under an unknown key of a keyed store is merged as a record of that kind, with nothing in it lost", async () => {
  const server = new Server();
  const extra = { updated: 5 };
  server.rows.u1 = {
    user_id: "u1", reset_at: 0, updated_at: now - 1000,
    progress: { "~meta": extra }, play: { "~meta": extra }, attempts: { "~meta": extra, ch01: { "~n": { count: 3 } } },
    game: { sec: { "~meta": extra }, best: { "~meta": extra }, enc: { "~meta": extra } }
  };
  const d = new Device("laptop", server);
  d.open(); d.page.solve("ch01", "e1"); await settle();
  d.remember("u1"); d.open(); await settle();
  const row = server.rows.u1;
  expect(has(server.solved("u1"), "ch01/e1"), "setup: this browser's change did not reach the account", server.solved("u1"));
  const got = {
    progress: row.progress["~meta"], play: row.play["~meta"], attempts: row.attempts["~meta"], exercise: row.attempts.ch01["~n"],
    sec: row.game.sec["~meta"], best: row.game.best["~meta"], enc: row.game.enc["~meta"]
  };
  /* what the README promises a later version: its fields are all there, beside the known
     fields of a chapter, section, best or medal */
  const want = {
    progress: { solved: {}, total: 0, updated: 5 }, play: { done: {}, total: 0, updated: 5 }, attempts: { updated: 5 }, exercise: { count: 3 },
    sec: { n: 0, ok: 0, box: 0, updated: 5 }, best: { score: 0, hearts: 0, day: "", updated: 5 }, enc: { medal: 0, day: "", updated: 5 }
  };
  expect(canon(got) === canon(want), "an object under an unknown key did not come out as a record of its store's kind", got);
  const before = server.writes();
  d.open(); await settle();
  expect(server.writes() === before, "the record did not settle: a reload rewrote the account", server.log.slice(-6));
});

scenario("on the account page a sign-in merges with the account, and signing out there leaves it whole", async () => {
  const server = new Server();
  newerRow(server);
  const d = new Device("laptop", server);
  worked(d);
  d.remember("u1"); d.open({ account: true }); await settle();
  expect(d.page.status() === "synced", "the sync failed on the account page", String((d.page.Account.status().error || {}).message));
  expect(/class="sync-state" data-state="synced">Synced at /.test(d.page.shown()), "the account page does not show the sync as done", d.page.shown().slice(0, 400));
  expect(has(server.solved("u1"), "ch01/e1") && has(server.solved("u1"), "ch01/e2"), "the account does not hold both devices' progress", server.solved("u1"));
  expect(lostFrom(server.rows.u1).length === 0, "the account lost fields this version does not know", lostFrom(server.rows.u1));
  d.page.solve("ch02", "e1");
  const { result, error } = await d.page.signOut();
  expect(!error && result && result.saved === true, "sign-out did not save", { result, error: error && error.message });
  const s = server.solved("u1");
  expect(has(s, "ch01/e1") && has(s, "ch01/e2") && has(s, "ch02/e1"), "signing out on the account page lost progress from the account", s);
  expect(lostFrom(server.rows.u1).length === 0 && canon(server.rows.u1.gates) === canon(NEWER.gates), "signing out dropped fields this version does not know", lostFrom(server.rows.u1));
  expect(d.solved().length === 0 && d.setAside("u1").length === 0, "the browser was not cleared after a saved sign-out", { live: d.solved(), aside: d.setAside("u1") });
  expect(/Sign in or create an account/.test(d.page.shown()), "the account page does not show the sign-in form after signing out", d.page.shown().slice(0, 200));
});

/* the merge module the page receives (src/sync/merge.ts, on window.BMMerge) with a merge
   that can be made to fail, as a slip in a later edit might make it */
const BROKEN = (win) => Object.assign({}, MERGE, {
  merge: (local, remote) => {
    if (win.BREAK_MERGE) throw new Error("merge failed");
    return MERGE.merge(local, remote);
  }
});

scenario("a sync whose merge fails is never followed by a save of this browser's unmerged copy", async () => {
  const probe = BROKEN({ BREAK_MERGE: true });
  let threw = false;
  try { probe.merge({}, {}); } catch (e) { threw = true; }
  expect(typeof probe.merge === "function" && threw, "setup: the broken merge module does not fail while BREAK_MERGE is set");
  const server = new Server();
  server.rows.u1 = { user_id: "u1", progress: { ch01: { solved: { e1: true, e2: true }, total: 10 } }, reset_at: 0, updated_at: now - 1000 };
  const d = new Device("laptop", server);
  d.remember("u1");
  const page = d.open({ merge: BROKEN });
  page.win.BREAK_MERGE = true;
  await settle();
  expect(page.status() === "error", "setup: the sync was expected to fail", page.Account.status());
  const whole = () => server.writes() === 0 && has(server.solved("u1"), "ch01/e1") && has(server.solved("u1"), "ch01/e2");
  page.solve("ch03", "e1"); await settle();
  expect(whole(), "a page that never merged with the account saved its own copy over it", { account: server.solved("u1"), log: server.log.slice(-4) });
  const { result, error } = await page.signOut();
  expect(!error && result && result.saved === false, "sign-out claimed the progress was saved", { result, error: error && error.message });
  expect(whole(), "signing out wrote this browser's unmerged copy over the account", { account: server.solved("u1"), log: server.log.slice(-4) });
  expect(has(d.setAside("u1"), "ch03/e1"), "the unsaved work was not set aside", d.setAside("u1"));
  /* with the merge working again, the next sign-in saves it beside what the account held */
  d.remember("u1"); d.open(); await settle();
  const s = server.solved("u1");
  expect(has(s, "ch01/e1") && has(s, "ch01/e2") && has(s, "ch03/e1"), "the account does not hold both its own progress and the work set aside", s);
});

/* a later version of the site has changed the shape of the data and says so (game.v) */
function newerShape(server) {
  server.rows.u1 = {
    user_id: "u1", progress: { ch01: { solved: { e2: true }, total: 10 } },
    game: { v: 99, maxed: 2, wallet: { coins: 40 } }, reset_at: 0, updated_at: now - 1000
  };
  return canon(server.rows.u1);
}

scenario("an account saved in a newer shape is merged into this browser but never written", async () => {
  const server = new Server();
  const was = newerShape(server);
  const d = new Device("laptop", server);
  d.open(); d.page.solve("ch01", "e1"); await settle();
  d.remember("u1"); d.open(); await settle();
  expect(has(d.solved(), "ch01/e1") && has(d.solved(), "ch01/e2"), "this browser does not hold both its own progress and the account's", d.solved());
  expect(d.read(KEYS.game, {}).v === 99 && canon(d.read(KEYS.game, {}).wallet) === canon({ coins: 40 }), "the newer data did not reach this browser", d.read(KEYS.game, {}));
  expect(d.page.status() === "reload", "the page does not ask for a reload", d.page.Account.status());
  /* the reader keeps working: checks, solves, leaving the page, coming back */
  d.page.check("ch01", "e3", true); d.page.solve("ch01", "e3"); await settle();
  d.page.solve("ch01", "e4");
  d.open(); await settle();
  expect(has(d.solved(), "ch01/e3") && has(d.solved(), "ch01/e4"), "work done meanwhile was lost from this browser", d.solved());
  expect(d.page.status() === "reload", "the reloaded page does not ask for a reload", d.page.Account.status());
  expect(server.writes() === 0 && canon(server.rows.u1) === was, "the account was written by a version that does not understand it", server.log.filter((l) => !/^select/.test(l)));
  expect(!server.log.some((l) => /^rpc events_put [1-9]/.test(l)), "a newer-shape browser sent events", server.log.filter((l) => /events_put/.test(l)));
  /* signing out cannot save either, so the work is set aside rather than cleared */
  const { result, error } = await d.page.signOut();
  expect(!error && result && result.saved === false, "sign-out claimed the progress was saved", { result, error: error && error.message });
  expect(has(d.setAside("u1"), "ch01/e1") && has(d.setAside("u1"), "ch01/e4"), "the unsaved work was not set aside", d.setAside("u1"));
  expect(server.writes() === 0 && canon(server.rows.u1) === was, "signing out wrote to the account", server.log.filter((l) => !/^select/.test(l)));
});

scenario("the account page says to reload when the account is in a newer shape", async () => {
  const server = new Server();
  const was = newerShape(server);
  const d = new Device("laptop", server);
  d.remember("u1"); d.open({ account: true }); await settle();
  expect(d.page.status() === "reload", "the page does not ask for a reload", d.page.Account.status());
  expect(/data-state="reload">A newer version of this site has saved to your account\. Reload this page to finish syncing\.</.test(d.page.shown()),
    "the account page does not tell the reader to reload", d.page.shown().slice(0, 400));
  expect(server.writes() === 0 && canon(server.rows.u1) === was, "the account was written", server.log.filter((l) => !/^select/.test(l)));
});

scenario("a tab left open while a newer version of the site saves stops writing", async () => {
  const { server, laptop } = await twoDevices();
  laptop.page.solve("ch01", "e1"); await settle();
  /* another device, running a later version, saves the account in its new shape */
  now += 60000;
  Object.assign(server.rows.u1, { game: { v: 99, wallet: { coins: 40 } }, updated_at: now });
  const was = canon(server.rows.u1);
  laptop.page.solve("ch01", "e2"); await settle();
  expect(canon(server.rows.u1) === was, "the stale tab wrote over a row in a shape it does not understand", server.rows.u1);
  expect(has(laptop.solved(), "ch01/e2") && laptop.read(KEYS.game, {}).v === 99, "the tab did not merge the newer row into this browser", { solved: laptop.solved(), game: laptop.read(KEYS.game, {}) });
  expect(laptop.page.status() === "reload", "the page does not ask for a reload", laptop.page.Account.status());
  const writes = server.writes();
  laptop.page.solve("ch01", "e3"); await settle();
  expect(server.writes() === writes, "the tab kept trying to write", server.log.slice(-4));
});

scenario("a tab that finds this browser's data in a newer shape stops writing", async () => {
  const { server, laptop } = await twoDevices();
  laptop.page.solve("ch01", "e1"); await settle();
  /* another tab of this browser, running a later version, has changed the data and not saved yet */
  laptop.storage.set(KEYS.game, JSON.stringify({ v: 99, wallet: { coins: 40 } }));
  const writes = server.writes();
  laptop.page.solve("ch01", "e2"); await settle();
  expect(server.writes() === writes && !has(server.solved("u1"), "ch01/e2"), "data in a shape this version does not understand was written to the account", server.log.slice(-4));
  expect(laptop.page.status() === "reload", "the page does not ask for a reload", laptop.page.Account.status());
  expect(has(laptop.solved(), "ch01/e2") && laptop.read(KEYS.game, {}).v === 99, "this browser lost the work or the newer data", { solved: laptop.solved(), game: laptop.read(KEYS.game, {}) });
});

scenario("a reset in a stale tab does not wipe an account saved in a newer shape", async () => {
  const { server, laptop } = await twoDevices();
  laptop.page.solve("ch01", "e1"); await settle();
  now += 60000;
  Object.assign(server.rows.u1, { game: { v: 99, wallet: { coins: 40 } }, updated_at: now });
  const was = canon(server.rows.u1);
  now += 60000;
  laptop.page.resetAll(); await settle();
  expect(canon(server.rows.u1) === was, "the reset was written over a row in a shape this version does not understand", server.rows.u1);
  expect(laptop.solved().length === 0, "the reset did not apply in this browser", laptop.solved());
  expect(laptop.page.status() === "reload", "the page does not ask for a reload", laptop.page.Account.status());
  expect(Number(laptop.read("bm.sync.v1", {}).resetAt) > 0, "the reset is no longer remembered for the version that can save it", laptop.read("bm.sync.v1", {}));
});

scenario("a reset from this version clears what it knows, and leaves a column it does not know to the version that does", async () => {
  const server = new Server();
  newerRow(server);
  const d = new Device("laptop", server);
  d.remember("u1"); d.open(); await settle();
  now += 60000;
  d.page.resetAll(); await settle();
  const row = server.rows.u1;
  expect(Number(row.reset_at) > 0 && server.solved("u1").length === 0, "the reset did not reach the account", { reset_at: row.reset_at, solved: server.solved("u1") });
  expect(canon(row.game) === "{}" && canon(row.progress) === "{}" && canon(row.attempts) === "{}", "the reset left fields behind in columns this version knows", { game: row.game, progress: row.progress, attempts: row.attempts });
  expect(canon(row.gates) === canon(NEWER.gates), "the reset touched a column this version does not know", row.gates);
});

scenario("a server without the game column still syncs everything else", async () => {
  const server = new Server();
  server.columns = server.columns.filter((c) => c !== "game");
  const d = new Device("laptop", server);
  d.storage.set(KEYS.game, JSON.stringify({ ach: { "first-light": 1700000000000 } }));
  /* a new account: there is no row to learn the columns from, so the first save is refused once */
  d.remember("u1"); d.open(); await settle();
  d.page.solve("ch01", "e1"); await settle();
  expect(d.page.status() === "synced", "the sync failed", String((d.page.Account.status().error || {}).message));
  expect(has(server.solved("u1"), "ch01/e1"), "progress did not reach the account", server.solved("u1"));
  expect(!("game" in server.rows.u1), "the fake server took a column it does not have");
  expect(d.read(KEYS.game, {}).ach["first-light"] === 1700000000000, "the game record was lost from this browser", d.read(KEYS.game, {}));
  expect(server.refused === 1, "expected the first save, and only that one, to be refused", server.refused);
  /* a device that reads the row first never names the column */
  const phone = new Device("phone", server);
  phone.remember("u1"); phone.open(); await settle();
  phone.page.solve("ch02", "e1"); await settle();
  expect(has(server.solved("u1"), "ch02/e1") && phone.page.status() === "synced", "the second device did not sync", { solved: server.solved("u1"), status: phone.page.Account.status() });
  d.open(); await settle();
  expect(server.refused === 1, "a save named the missing column although the row had shown it is not there", server.refused);
  const before = server.writes();
  d.open(); phone.open(); await settle();
  expect(server.writes() === before, "a page load with nothing new rewrote the account", server.log.slice(-6));
});

/* ------------------------------------- signing in with another service -- */

const oauthCalls = (server) => server.log.filter((l) => l.startsWith("auth oauth "));
async function rejected(promise) {
  let e = null;
  promise.then(() => {}, (x) => { e = x; });
  await settle();
  return e;
}

scenario("a provider sign-in names the service and comes back to the account page", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  const page = d.open({ config: { providers: ["github", "azure"] }, href: "http://localhost:8000/account.html?from=nav#top" }); await settle();
  expect(JSON.stringify(Array.from(page.Account.providers)) === '["github","azure"]', "the offered services are not the configured ones, in order", Array.from(page.Account.providers));
  page.Account.oauth("github"); await settle();
  page.Account.oauth("azure"); await settle();
  const calls = oauthCalls(server);
  expect(calls.length === 2, "expected two hand-overs", calls);
  expect(/^auth oauth github http:\/\/localhost:8000\/account\.html$/.test(calls[0]), "GitHub hand-over is wrong", calls[0]);
  expect(/^auth oauth azure http:\/\/localhost:8000\/account\.html scopes=email$/.test(calls[1]), "Microsoft was not asked for the email address", calls[1]);
});

scenario("a service that is not switched on is refused before anything is sent", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  const page = d.open({ config: { providers: ["github"] } }); await settle();
  for (const id of ["discord", "constructor", "", undefined]) {
    const e = await rejected(page.Account.oauth(id));
    expect(e && /not switched on/.test(e.message), "oauth(" + JSON.stringify(id) + ") was not refused", e && e.message);
  }
  expect(oauthCalls(server).length === 0, "a refused service still reached the account service", oauthCalls(server));
});

scenario("unknown, repeated and malformed ids in config never become buttons", async () => {
  const server = new Server();
  const warn = console.warn; console.warn = () => {};
  try {
    const cases = [
      [{ providers: ["gihub", 7, null, "google", "google", "toString"] }, ["google"]],
      [{ providers: "google" }, []],
      [{ providers: { google: true } }, []],
      [{ google: true }, []],
      [{}, []]
    ];
    for (const [config, want] of cases) {
      const page = new Device("d", server).open({ config }); await settle();
      const got = Array.from(page.Account.providers);
      expect(JSON.stringify(got) === JSON.stringify(want), "config " + JSON.stringify(config) + " offers the wrong services", got);
    }
  } finally { console.warn = warn; }
});

scenario("an error in the address is read from either side of the #", async () => {
  const page = new Device("d", new Server()).open(); await settle();
  const at = (tail) => page.Account.urlError("http://localhost:8000/account.html" + tail);
  const both = at("?error=access_denied&error_description=The+user+denied%20access#error=access_denied&sb=");
  expect(both && both.error === "access_denied" && both.description === "The user denied access", "query + hash not read", both);
  const hashOnly = at("#error=server_error&error_code=unexpected_failure");
  expect(hashOnly && hashOnly.error === "server_error" && hashOnly.code === "unexpected_failure", "hash-only error not read", hashOnly);
  const codeOnly = at("?error_code=otp_expired");
  expect(codeOnly && codeOnly.code === "otp_expired", "error_code alone not read", codeOnly);
  for (const ok of ["", "?type=recovery", "#access_token=abc&refresh_token=def&type=signup", "#practice"]) {
    expect(at(ok) === null, "an address with no error was read as one: " + ok, at(ok));
  }
});

scenario("sign-in methods and the reader's name come from the account", async () => {
  const page = new Device("d", new Server()).open(); await settle();
  const A = page.Account;
  const methods = (u) => JSON.stringify(Array.from(A.methods(u)));
  expect(methods({ app_metadata: { provider: "google", providers: ["google", "github"] } }) === '["google","github"]', "providers list not used");
  expect(methods({ app_metadata: { provider: "email" } }) === '["email"]', "single provider not used");
  expect(methods({ identities: [{ provider: "discord" }, { provider: "discord" }] }) === '["discord"]', "identities fallback not used");
  expect(methods({}) === "[]" && methods(null) === "[]", "an empty user should have no methods");
  expect(A.label({ email: "a@b.c", user_metadata: { full_name: "N" } }) === "a@b.c", "email should come first");
  expect(A.label({ user_metadata: { full_name: "Full Name", user_name: "handle" } }) === "Full Name", "full name should come next");
  expect(A.label({ user_metadata: { user_name: "handle" } }) === "handle", "username should be the fallback");
  expect(A.label({}) === "" && A.label(null) === "", "nothing to call the reader should be an empty string");
});

scenario("a reader with no email address still syncs, and a failed sign-out sets their progress aside", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  d.remember("u9", { email: undefined, app_metadata: { provider: "github", providers: ["github"] }, user_metadata: { user_name: "reader9" } });
  d.open(); await settle();
  d.page.solve("ch01", "e1"); await settle();
  expect(has(server.solved("u9"), "ch01/e1"), "progress did not reach the account", server.solved("u9"));
  const out = d.page.Account.exportData();
  expect(out.account === null && JSON.stringify(Array.from(out.signInWith)) === '["github"]', "the download does not say how the account signs in", { account: out.account, signInWith: out.signInWith });
  expect(out.profile && out.profile.username === "reader9" && out.profile.name === null, "the download leaves out what the service passed on", out.profile);
  server.offline = true;
  d.page.solve("ch01", "e2"); await settle();
  await d.page.signOut();
  const held = d.read("bm.sync.pending.v1", {}).u9;
  expect(held && held.email === "" && JSON.stringify(held.via) === '["github"]', "the set-aside record does not say which service the reader uses", held && { email: held.email, via: held.via });
  server.offline = false;
  d.remember("u9", { email: undefined, app_metadata: { providers: ["github"] } }); d.open(); await settle();
  expect(has(server.solved("u9"), "ch01/e2"), "the set-aside progress did not reach the account", server.solved("u9"));
});

/* ------------------------------------------- the placement check's takes -- */

/* A minimal finished take (src/types/state.ts DiagTake). */
const take = (day) => ({ v: 1, day, from: "start", start: "algebra-1", band: "algebra-1", blueprint: 1, grader: 1, seed: 7, blocks: [], seeded: false });
const takeIds = (diag) => Object.keys(((diag || {}).takes) || {}).sort().join(",");
/* the page finishes a take: written once, through the store, so the account hears of it */
function finishTake(page, id, day) {
  const d = page.Store.read(KEYS.diag, {});
  d.takes = d.takes || {};
  d.takes[id] = take(day || "2026-10-04");
  page.Store.write(KEYS.diag, d);
}
const onDevice = (dev) => takeIds(dev.read(KEYS.diag, {}));

scenario("a take finished on one device survives a reset from a tab that never pulled it", async () => {
  const { server, laptop, phone } = await twoDevices();
  laptop.page.solve("ch01", "e1"); await settle();
  now += 60000;
  finishTake(phone.page, "t1"); await settle();
  expect(takeIds(server.rows.u1.diag) === "t1", "setup: the take did not reach the account", server.rows.u1.diag);
  now += 60000;
  /* the laptop's page has not pulled since before the take */
  expect(onDevice(laptop) === "", "setup: the laptop already holds the take", onDevice(laptop));
  laptop.page.resetAll(); await settle();
  expect(takeIds(server.rows.u1.diag) === "t1", "the reset dropped the take from the account", server.rows.u1.diag);
  expect(Number(server.rows.u1.reset_at) > 0 && server.solved("u1").length === 0, "the reset did not reach the account", { reset_at: server.rows.u1.reset_at, solved: server.solved("u1") });
  expect(onDevice(laptop) === "t1", "the laptop does not hold the take after its reset", onDevice(laptop));
  phone.open(); await settle();
  expect(onDevice(phone) === "t1", "the phone lost the take when it synced again", onDevice(phone));
  expect(takeIds(server.rows.u1.diag) === "t1", "the account lost the take", server.rows.u1.diag);
});

scenario("a take finished offline before a reset elsewhere survives when the device syncs", async () => {
  const { server, laptop, phone } = await twoDevices();
  laptop.page.solve("ch01", "e1"); await settle();
  phone.open(); await settle();
  server.offline = true;
  finishTake(phone.page, "t1"); await settle();
  server.offline = false;
  now += 60000;
  laptop.page.resetAll(); await settle();
  expect(server.solved("u1").length === 0 && Number(server.rows.u1.reset_at) > 0, "setup: the reset did not reach the account", server.rows.u1);
  phone.open(); await settle();
  expect(onDevice(phone) === "t1", "the phone lost its offline take", onDevice(phone));
  expect(takeIds(server.rows.u1.diag) === "t1", "the account did not receive the offline take", server.rows.u1.diag);
  expect(phone.solved().length === 0, "the phone kept progress the reset cleared", phone.solved());
  laptop.open(); await settle();
  expect(onDevice(laptop) === "t1", "the laptop did not receive the take", onDevice(laptop));
});

scenario("a take set aside at an unsaved sign-out survives a newer reset", async () => {
  const { server, laptop, phone } = await twoDevices();
  server.offline = true;
  laptop.page.solve("ch01", "e1");
  finishTake(laptop.page, "t1"); await settle();
  await laptop.page.signOut();
  const aside = laptop.read("bm.sync.pending.v1", {}).u1;
  expect(aside && takeIds(aside.state.diag) === "t1", "setup: the take was not set aside", aside);
  server.offline = false;
  now += 60000;
  phone.page.resetAll(); await settle();
  expect(Number(server.rows.u1.reset_at) > 0, "setup: the reset did not reach the account");
  laptop.remember("u1"); laptop.open(); await settle();
  expect(takeIds(server.rows.u1.diag) === "t1", "the set-aside take was dropped by the newer reset", server.rows.u1.diag);
  expect(onDevice(laptop) === "t1", "this browser does not hold the set-aside take", onDevice(laptop));
  expect(!has(server.solved("u1"), "ch01/e1"), "the set-aside progress came back past a newer reset", server.solved("u1"));
});

scenario("a reset on another device clears progress here but keeps the takes", async () => {
  const { server, laptop, phone } = await twoDevices();
  laptop.page.solve("ch01", "e1");
  finishTake(laptop.page, "t1"); await settle();
  phone.open(); await settle();
  expect(has(phone.solved(), "ch01/e1") && onDevice(phone) === "t1", "setup: the phone did not receive both", { solved: phone.solved(), diag: onDevice(phone) });
  now += 60000;
  phone.page.resetAll(); await settle();
  laptop.open(); await settle();
  expect(laptop.solved().length === 0, "the reset did not clear progress here", laptop.solved());
  expect(onDevice(laptop) === "t1", "the reset on another device emptied the takes here", onDevice(laptop));
  expect(takeIds(server.rows.u1.diag) === "t1", "the account lost the take", server.rows.u1.diag);
});

scenario("a different account signing in on the same browser does not inherit the takes", async () => {
  const server = new Server();
  const d = new Device("shared", server);
  d.storage.set("bm.sync.v1", JSON.stringify({ user: "u2", resetAt: 0 }));
  d.storage.set(KEYS.diag, JSON.stringify({ takes: { t9: take("2026-10-01") } }));
  d.remember("u1"); d.open(); await settle();
  expect(!server.rows.u1 || takeIds(server.rows.u1.diag) === "", "another reader's take went into u1's account", server.rows.u1 && server.rows.u1.diag);
  expect(onDevice(d) === "", "u1 inherited the previous reader's take", onDevice(d));
});

scenario("a take seeded in the row survives saves, a conflict, a stale device, a re-open and a sign-out", async () => {
  const server = new Server();
  server.rows.u1 = { user_id: "u1", diag: { takes: { t1: take("2026-10-01") } }, reset_at: 0, updated_at: now - 1000 };
  const laptop = new Device("laptop", server), phone = new Device("phone", server);
  laptop.remember("u1"); phone.remember("u1");
  laptop.open(); await settle();
  phone.open(); await settle();
  expect(onDevice(laptop) === "t1" && onDevice(phone) === "t1", "setup: the devices did not receive the take", { laptop: onDevice(laptop), phone: onDevice(phone) });
  /* two devices saving at the same moment: a conflict */
  laptop.page.solve("ch01", "e1");
  phone.page.solve("ch02", "e1");
  await settle();
  expect(takeIds(server.rows.u1.diag) === "t1", "a conflict dropped the take", server.rows.u1.diag);
  /* a stale device: the laptop's page is behind the phone's later save */
  now += 60000;
  phone.page.solve("ch03", "e1"); await settle();
  laptop.page.solve("ch04", "e1"); await settle();
  expect(takeIds(server.rows.u1.diag) === "t1", "a stale device's save dropped the take", server.rows.u1.diag);
  laptop.open(); phone.open(); await settle();
  expect(onDevice(laptop) === "t1" && onDevice(phone) === "t1", "a re-open lost the take", { laptop: onDevice(laptop), phone: onDevice(phone) });
  await laptop.page.signOut();
  expect(takeIds(server.rows.u1.diag) === "t1", "sign-out dropped the take from the account", server.rows.u1.diag);
  expect(onDevice(laptop) === "", "sign-out left the take in this browser", onDevice(laptop));
  laptop.remember("u1"); laptop.open(); await settle();
  expect(onDevice(laptop) === "t1", "signing in again did not bring the take back", onDevice(laptop));
});

scenario("a take made before ever signing in is merged into the account at the first sign-in", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  d.open();
  finishTake(d.page, "t1"); await settle();
  expect(d.read("bm.sync.v1", {}).user === undefined, "setup: the browser already belongs to an account");
  d.remember("u1"); d.open(); await settle();
  expect(takeIds(server.rows.u1.diag) === "t1", "the take made before signing in did not reach the account", server.rows.u1 && server.rows.u1.diag);
  expect(onDevice(d) === "t1", "this browser lost the take at sign-in", onDevice(d));
});

scenario("a server without the diag column still syncs, and the take stays local", async () => {
  const server = new Server();
  server.columns = server.columns.filter((c) => c !== "diag");
  const d = new Device("laptop", server);
  d.remember("u1"); d.open(); await settle();
  finishTake(d.page, "t1");
  d.page.solve("ch01", "e1"); await settle();
  expect(d.page.status() === "synced", "the sync failed", String((d.page.Account.status().error || {}).message));
  expect(has(server.solved("u1"), "ch01/e1"), "progress did not reach the account", server.solved("u1"));
  expect(!("diag" in server.rows.u1), "the fake server took a column it does not have");
  expect(onDevice(d) === "t1", "the take was lost from this browser", onDevice(d));
  d.open(); await settle();
  expect(onDevice(d) === "t1" && d.page.status() === "synced", "a re-open lost the take or failed", onDevice(d));
});

/* ----------------------------------------------- Mochi's pool (bm.pet.v1, X-2b) -- */

const petOf = (dev) => dev.read(KEYS.pet, {}) || {};
const earnedIds = (pet) => Object.keys((pet && pet.earned) || {}).sort().join();
const earn = (id, n) => ({ v: 1, earned: { [id]: n } });

scenario("T8: a pet written on one learner's device does not follow a learner switch", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  server.addLearner("u1", "L1");
  d.remember("u1"); d.open(); await settle();
  d.page.Store.write(KEYS.pet, earn("strong:ch01#a", 20)); await settle();
  expect(earnedIds(server.rows.u1.pet) === "strong:ch01#a", "setup: the earn did not reach the account", server.rows.u1 && server.rows.u1.pet);
  const r = await d.page.switchLearner("L1");
  expect(!r.error, "the switch failed", r.error && r.error.message);
  expect(earnedIds(petOf(d)) === "", "the first learner's pet is in the new learner's browser", petOf(d));
  expect(earnedIds(server.rows.u1.pet) === "strong:ch01#a", "the first learner's earn left the account", server.rows.u1.pet);
  expect(earnedIds((server.rows.L1 || {}).pet) === "", "the first learner's pet reached the new learner's row", server.rows.L1);
});

scenario("T8: a sign-out clears the pet from the browser", async () => {
  const { server, laptop } = await twoDevices();
  laptop.page.Store.write(KEYS.pet, earn("strong:ch01#a", 20)); await settle();
  const { error } = await laptop.page.signOut();
  expect(!error, "sign-out failed", error && error.message);
  expect(earnedIds(petOf(laptop)) === "", "this browser still holds the pet after a sign-out", petOf(laptop));
  expect(earnedIds(server.rows.u1.pet) === "strong:ch01#a", "the account lost the pet", server.rows.u1.pet);
});

scenario("a reset clears the pet locally and in the account", async () => {
  const { server, laptop } = await twoDevices();
  laptop.page.Store.write(KEYS.pet, earn("strong:ch01#a", 20)); await settle();
  expect(earnedIds(server.rows.u1.pet) === "strong:ch01#a", "setup: the earn did not reach the account", server.rows.u1.pet);
  now += 60000;
  laptop.page.resetAll(); await settle();
  expect(earnedIds(petOf(laptop)) === "", "the reset left the pet in this browser", petOf(laptop));
  expect(canon(server.rows.u1.pet) === "{}", "the reset left the pet in the account", server.rows.u1.pet);
});

scenario("a server without the pet column still syncs, and the pet stays local", async () => {
  const server = new Server();
  server.columns = server.columns.filter((c) => c !== "pet");
  const d = new Device("laptop", server);
  d.storage.set(KEYS.pet, JSON.stringify(earn("strong:ch01#a", 20)));
  /* a new account: there is no row to learn the columns from, so the first save is refused once */
  d.remember("u1"); d.open(); await settle();
  d.page.solve("ch01", "e1"); await settle();
  expect(d.page.status() === "synced", "the sync failed", String((d.page.Account.status().error || {}).message));
  expect(has(server.solved("u1"), "ch01/e1"), "progress did not reach the account", server.solved("u1"));
  expect(!("pet" in server.rows.u1), "the fake server took a column it does not have");
  expect(earnedIds(petOf(d)) === "strong:ch01#a", "the pet was lost from this browser", petOf(d));
  expect(server.refused === 1, "expected the first save, and only that one, to be refused", server.refused);
  d.open(); await settle();
  expect(server.refused === 1 && earnedIds(petOf(d)) === "strong:ch01#a" && d.page.status() === "synced", "a re-open named the missing column or lost the pet", { refused: server.refused, pet: petOf(d) });
});

scenario("two devices' pets merge by union", async () => {
  const { server, laptop, phone } = await twoDevices();
  laptop.page.Store.write(KEYS.pet, earn("strong:ch01#a", 20)); await settle();
  phone.page.Store.write(KEYS.pet, earn("medal:ch01:practice:1", 10)); await settle();
  laptop.open(); phone.open(); await settle();
  const want = "medal:ch01:practice:1,strong:ch01#a";
  expect(earnedIds(server.rows.u1.pet) === want, "the account does not hold both earns", server.rows.u1.pet);
  expect(earnedIds(petOf(laptop)) === want && earnedIds(petOf(phone)) === want, "a device lacks the other's earn", { laptop: petOf(laptop), phone: petOf(phone) });
});

scenario("the page can tell a stored session without loading the SDK", async () => {
  const d = new Device("laptop", new Server());
  d.open();
  expect(d.page.Account.hasSession() === false, "a signed-out page reported a session");
  d.remember("u1"); d.open();
  expect(d.page.Account.hasSession() === true, "a stored session was not reported");
});

/* ---------------------------------------------- the learning log's lifecycle -- */

const EV_KEY = "bm.events.v1", OUT_KEY = "bm.events.out.v1", DEV_KEY = "bm.device.v1";
/* the entries of a device's log other than checkpoints (those carry the id prefix 00000000) */
const logIds = (dev) => Object.keys((dev.read(EV_KEY, null) || {}).ev || {}).filter((id) => id.indexOf("00000000-") !== 0);
const deviceId = (dev) => (dev.read(DEV_KEY, null) || {}).id;
const isEmpty = (v) => v === null || v === undefined || (typeof v === "object" && Object.keys(v).length === 0);
/* events sync in P6: no account row has a field for them yet */
const noEventsColumn = (server) => Object.keys(server.rows).every((u) => !("events" in server.rows[u]));

scenario("sign-out clears the learning log and redraws the device id", async () => {
  const { server, laptop } = await twoDevices();
  laptop.page.check("ch01", "e1", true); laptop.page.solve("ch01", "e1"); await settle();
  const before = deviceId(laptop);
  expect(logIds(laptop).length === 1, "setup: the solve did not write one entry", logIds(laptop));
  expect(typeof before === "string" && before.length === 8 && logIds(laptop)[0].slice(0, 8) === before, "setup: the entry does not carry the 8-character device id", { before, ids: logIds(laptop) });
  laptop.storage.set(OUT_KEY, JSON.stringify({ ids: ["x"] }));
  const { error } = await laptop.page.signOut();
  expect(!error, "sign-out failed", error && error.message);
  expect(isEmpty((laptop.read(EV_KEY, null) || {}).ev), "the learning log survived the sign-out", laptop.read(EV_KEY, null));
  expect(isEmpty(laptop.read(OUT_KEY, null)), "the outbox survived the sign-out", laptop.read(OUT_KEY, null));
  expect(deviceId(laptop) !== before && String(deviceId(laptop)).length === 8, "the device id was not redrawn", { before, after: deviceId(laptop) });
  expect(noEventsColumn(server), "the account row gained an events field", server.rows.u1);
});

scenario("another account's leftover log is cleared on sign-in", async () => {
  const server = new Server();
  const d = new Device("shared", server);
  d.remember("u1"); d.open(); await settle();
  d.page.check("ch01", "e1", true); await settle();
  const first = deviceId(d);
  expect(logIds(d).length === 1 && (d.read(DEV_KEY, {}) || {}).uid === "u1", "setup: u1's solve is not one entry on a device stamped u1", { ids: logIds(d), dev: d.read(DEV_KEY, null) });
  /* the session ends without the sign-out path (it expired), then another reader signs in */
  d.storage.delete(SESSION_KEY);
  d.storage.set(OUT_KEY, JSON.stringify({ ids: ["x"] }));
  d.remember("u2"); d.open(); await settle();
  expect(logIds(d).length === 0, "u1's learning log is still on the device for u2", logIds(d));
  expect(isEmpty(d.read(OUT_KEY, null)), "u1's outbox is still on the device for u2", d.read(OUT_KEY, null));
  const second = deviceId(d);
  expect(second !== first && String(second).length === 8 && (d.read(DEV_KEY, {}) || {}).uid === "u2", "the device id was not redrawn and stamped u2", { first, dev: d.read(DEV_KEY, null) });
  d.page.check("ch01", "e2", true); await settle();
  expect(logIds(d).length === 1 && logIds(d)[0].slice(0, 8) === second, "a solve as u2 does not carry the new device id", { second, ids: logIds(d) });
  expect(noEventsColumn(server), "an account row gained an events field", server.rows);
});

scenario("a reset made on another device clears this device's log", async () => {
  const { server, laptop, phone } = await twoDevices();
  phone.page.check("ch01", "e1", true); phone.page.solve("ch01", "e1"); await settle();
  finishTake(phone.page, "t1"); await settle();
  const before = deviceId(phone);
  expect(logIds(phone).length === 1, "setup: the phone's solve is not one entry", logIds(phone));
  now += 60000;
  phone.storage.set(OUT_KEY, JSON.stringify({ ids: ["x"] }));
  laptop.page.resetAll(); await settle();
  expect(Number(server.rows.u1.reset_at) > 0, "setup: the reset did not reach the account", server.rows.u1);
  phone.open(); await settle();
  expect(logIds(phone).length === 0, "the phone kept its learning log after another device's reset", logIds(phone));
  expect(isEmpty(phone.read(OUT_KEY, null)), "the phone kept its outbox", phone.read(OUT_KEY, null));
  expect(deviceId(phone) !== before && String(deviceId(phone)).length === 8, "the phone's device id did not change", { before, after: deviceId(phone) });
  expect(onDevice(phone) === "t1", "the phone lost its placement-check take", onDevice(phone));
  expect(noEventsColumn(server), "the account row gained an events field", server.rows.u1);
});

scenario("work done signed out is adopted by the next account, as the progress is", async () => {
  const server = new Server();
  const d = new Device("shared", server);
  d.remember("u1"); d.open(); await settle();
  d.page.check("ch01", "e1", true); await settle();
  const { error } = await d.page.signOut();
  expect(!error, "sign-out failed", error && error.message);
  expect((d.read(DEV_KEY, {}) || {}).uid === undefined, "the device record kept u1's id after sign-out", d.read(DEV_KEY, null));
  expect(logIds(d).length === 0, "setup: the log survived the sign-out", logIds(d));
  d.page.check("ch01", "e2", true); await settle();
  expect(logIds(d).length === 1, "setup: the signed-out solve is not one entry", logIds(d));
  const id = deviceId(d);
  d.remember("u2"); d.open(); await settle();
  expect(logIds(d).length === 1 && deviceId(d) === id, "the signed-out work was wiped for u2", { ids: logIds(d), dev: d.read(DEV_KEY, null) });
  expect((d.read(DEV_KEY, {}) || {}).uid === "u2", "the device record does not hold u2", d.read(DEV_KEY, null));
});


/* ------------------------------------------------- the learning log syncs -- */

const evSet = (page) => page.win.BMEvents.all();
const serverSet = (server, uid) => { const o = {}; (server.events[uid] || []).forEach((r) => { o[r.id] = server.payloadOf(r); }); return o; };
const outbox = (dev) => (dev.read(OUT_KEY, {}) || {}).ids || [];
const sent = (server) => server.log.filter((l) => /^rpc events_put [1-9]/.test(l)).length;
const noAttempts = (server) => !server.log.some((l) => /attempts/.test(l));
const evMeta = (dev) => (dev.read("bm.sync.v1", {}) || {}).ev || {};

scenario("two devices converge on one log", async () => {
  const server = new Server();
  const laptop = new Device("laptop", server), phone = new Device("phone", server);
  laptop.remember("u1"); phone.remember("u1");
  laptop.open(); await settle();
  laptop.page.check("ch01", "e1", false); now += 60000; laptop.page.check("ch01", "e1", true); now += 60000; laptop.page.check("ch01", "e2", true); await settle();
  expect(canon(serverSet(server, "u1")) === canon(evSet(laptop.page)) && Object.keys(evSet(laptop.page)).length > 0, "the server does not hold the laptop's log", { server: serverSet(server, "u1"), laptop: evSet(laptop.page) });
  phone.open(); await settle();
  expect(canon(evSet(phone.page)) === canon(serverSet(server, "u1")), "the phone did not pull the log", { phone: evSet(phone.page), server: serverSet(server, "u1") });
  now += 60000; phone.page.check("ch01", "e3", true); await settle();
  laptop.open(); await settle();
  const union = prune(Object.assign({}, evSet(phone.page), evSet(laptop.page)));
  expect(canon(evSet(laptop.page)) === canon(evSet(phone.page)) && canon(evSet(phone.page)) === canon(serverSet(server, "u1")) && canon(union) === canon(serverSet(server, "u1")),
    "the three logs differ", { laptop: evSet(laptop.page), phone: evSet(phone.page), server: serverSet(server, "u1") });
  expect(outbox(laptop).length === 0 && outbox(phone).length === 0, "an outbox is not empty", { l: outbox(laptop), p: outbox(phone) });
  expect(noAttempts(server) && noEventsColumn(server), "attempts or an events column was touched");
});

scenario("the outbox survives a reload and pagehide", async () => {
  const { server, laptop } = await twoDevices();
  server.eventsDown = true;
  laptop.page.check("ch01", "e1", true); await settle();
  expect(outbox(laptop).length === 1, "the id is not in the outbox", outbox(laptop));
  expect(laptop.page.status() === "synced", "progress is not synced", laptop.page.Account.status());
  expect(!(server.events.u1 || []).length, "the server has a row", server.events.u1);
  laptop.page.close();
  expect(outbox(laptop).length === 1, "pagehide lost the outbox", outbox(laptop));
  server.eventsDown = false;
  laptop.open(); await settle();
  expect((server.events.u1 || []).length === 1, "the row did not arrive", server.events.u1);
  expect(outbox(laptop).length === 0, "the outbox is not empty", outbox(laptop));
  expect(noAttempts(server), "attempts touched");
});

scenario("a reset on one device clears the other's log and the stale entry is never offered", async () => {
  const { server, laptop, phone } = await twoDevices();
  phone.page.check("ch01", "e1", true); await settle();
  expect((server.events.u1 || []).length === 1 && server.meta.u1.epoch === 0, "setup: the server does not hold e1 at epoch 0", { rows: server.events.u1, meta: server.meta.u1 });
  now += 60000;
  laptop.page.resetAll(); await settle();
  expect(server.meta.u1.epoch === 1 && !(server.events.u1 || []).length, "the reset did not move the epoch and clear the rows", { meta: server.meta.u1, rows: server.events.u1 });
  const before = deviceId(phone);
  now += 60000;
  phone.page.check("ch01", "e2", true); await settle();
  /* the phone's save loses to the laptop's reset, so its sync reads the reset and clears the log
     before any send: the stale e2 is never offered to the server at all (no bm-reset needed) */
  expect(server.log.filter((l) => /^rpc events_put [1-9]/.test(l)).length === 1, "the stale entry was offered to the server", server.log.filter((l) => /events_put/.test(l)));
  expect(logIds(phone).length === 0 && outbox(phone).length === 0, "the phone's log or outbox survived", { log: logIds(phone), out: outbox(phone) });
  expect(deviceId(phone) !== before, "the phone's device id did not change");
  expect(!(server.events.u1 || []).length, "the stale e2 landed", server.events.u1);
  expect(evMeta(phone).u1 && evMeta(phone).u1.epoch === 1, "the phone did not adopt epoch 1", evMeta(phone));
  now += 60000;
  phone.page.check("ch01", "e3", true); await settle();
  expect(canon(serverSet(server, "u1")) === canon(evSet(phone.page)) && logIds(phone).length === 1 && (server.events.u1 || []).length >= 1, "the server does not hold exactly e3's entry", { rows: server.events.u1, phone: evSet(phone.page) });
  expect(noAttempts(server), "attempts touched");
});

scenario("signing in as a different account clears the log, the outbox and the cursor", async () => {
  const server = new Server();
  const d = new Device("shared", server);
  d.remember("u1"); d.open(); await settle();
  d.page.check("ch01", "e1", true); await settle();
  const first = deviceId(d);
  expect((server.events.u1 || []).length === 1, "setup: u1's row is not on the server", server.events.u1);
  d.storage.delete(SESSION_KEY);
  d.remember("u2"); d.open(); await settle();
  expect(!Object.keys(evSet(d.page)).some((id) => id.slice(0, 8) === first), "u1's entry is still local", evSet(d.page));
  expect(outbox(d).length === 0, "the outbox is not empty", outbox(d));
  expect(!("u1" in evMeta(d)), "u1's cursor is still in the meta", evMeta(d));
  now += 60000;
  d.page.check("ch01", "e2", true); await settle();
  expect((server.events.u2 || []).length === 1 && (server.events.u1 || []).length === 1, "the server rows are wrong", { u1: server.events.u1, u2: server.events.u2 });
  expect(!Object.keys(evSet(d.page)).some((id) => id.slice(0, 8) === first), "u2's log holds u1's id", evSet(d.page));
  expect(noAttempts(server), "attempts touched");
});

scenario("work done signed out goes with the first sync", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  d.open(); await settle();
  d.page.check("ch01", "e1", true); now += 60000; d.page.check("ch01", "e2", true); await settle();
  expect(logIds(d).length === 2 && sent(server) === 0 && outbox(d).length === 0, "setup: signed-out work was sent or queued", { ids: logIds(d), sent: sent(server), out: outbox(d) });
  d.remember("u1"); d.open(); await settle();
  expect((server.events.u1 || []).length === 2, "the server does not hold both", server.events.u1);
  expect(evMeta(d).u1 && evMeta(d).u1.init === true, "init is not set", evMeta(d));
  const n = sent(server);
  d.open(); await settle();
  expect(sent(server) === n, "events were sent again", { before: n, after: sent(server) });
  expect(noAttempts(server), "attempts touched");
});

scenario("a reset on this device keeps the work made after it", async () => {
  const { server, laptop } = await twoDevices();
  laptop.page.check("ch01", "e1", true); await settle();
  expect((server.events.u1 || []).length === 1, "setup: e1 not on the server");
  now += 60000;
  laptop.page.resetAll(); await settle();
  expect(server.meta.u1.epoch === 1 && !(server.events.u1 || []).length, "the reset did not clear the server", { meta: server.meta.u1, rows: server.events.u1 });
  now += 60000;
  laptop.page.check("ch01", "e2", true); await settle();
  expect(server.hints.filter((h) => h === "bm-reset").length === 1, "expected one bm-reset", server.hints);
  expect(canon(serverSet(server, "u1")) === canon(evSet(laptop.page)) && logIds(laptop).length === 1, "the server does not hold exactly e2's entry", { rows: server.events.u1, local: evSet(laptop.page) });
  expect(noAttempts(server), "attempts touched");
});

scenario("the account page says when the log is full", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  d.remember("u1"); d.open({ account: true }); await settle();
  server.full = true;
  d.page.check("ch01", "e1", true); await settle();
  expect(d.page.shown().indexOf("Your answer log is full") > -1, "the page does not say the log is full", d.page.shown());
  expect(d.page.status() === "synced" && outbox(d).length === 1, "status or outbox is wrong", { s: d.page.status(), out: outbox(d) });
  server.full = false;
  now += 25 * 3600 * 1000;
  d.page.check("ch01", "e2", true); await settle();
  expect((server.events.u1 || []).length === 2, "both rows are not on the server", server.events.u1);
  expect(d.page.shown().indexOf("Your answer log is full") < 0 && outbox(d).length === 0, "the sentence stayed or the outbox is not empty", { out: outbox(d) });
  expect(noAttempts(server), "attempts touched");
});

scenario("the kill switch sends and pulls nothing", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  d.remember("u1"); d.open({ config: { learn: { events: "off" } } }); await settle();
  d.page.check("ch01", "e1", true); await settle();
  expect(!server.log.some((l) => /rpc events_put|select events/.test(l)), "the channel was used", server.log.filter((l) => /events/.test(l)));
  expect(logIds(d).length === 1 && d.page.status() === "synced", "the entry or the sync is missing", { ids: logIds(d), s: d.page.status() });
  expect(noAttempts(server), "attempts touched");
});

scenario("a project without the function keeps the outbox and tries later", async () => {
  const { server, laptop } = await twoDevices();
  server.log.length = 0;
  server.missing.events_put = true;
  laptop.page.check("ch01", "e1", true); now += 60000; laptop.page.check("ch01", "e2", true); await settle();
  const calls = () => server.log.filter((l) => /^rpc events_put/.test(l)).length;
  expect(laptop.page.status() === "synced" && calls() === 1 && outbox(laptop).length === 2, "setup is wrong", { s: laptop.page.status(), calls: calls(), out: outbox(laptop) });
  now += 60000;
  laptop.page.check("ch01", "e3", true); await settle();
  expect(calls() === 1, "the page asked again while held", calls());
  server.missing = {};
  now += 5 * 60 * 1000 + 1;
  laptop.page.check("ch01", "e4", true); await settle();
  expect((server.events.u1 || []).length === 4 && outbox(laptop).length === 0, "the rows did not all arrive", { rows: (server.events.u1 || []).length, out: outbox(laptop) });
  expect(noAttempts(server), "attempts touched");
});

/* ---------------------------------- what the server says back, odd rows -- */

const pagePayloadAt = (ref) => { const t = Math.floor(now / 60000); return [t, Math.floor(t / 1440), "ex", "ch01#s", ref, "c", 1, 1, 0, 0]; };
const batchCalls = (server) => server.log.filter((l) => /^rpc events_put [1-9]/.test(l));

scenario("a wrong-hash row from the server is dropped on pull and two honest devices still converge", async () => {
  const { server, laptop, phone } = await twoDevices();
  const P = pagePayloadAt("ch01/e9"), bad = eventId("zzzzzzzz", P);
  server.seedEvent("u1", { id: bad, v: 1, t: P[0], d: P[1], src: P[2], sec: P[3], ref: P[4], k: P[5], ok: 0, n: P[7], r: P[8], f: P[9], x: null });
  now += 60000; laptop.page.check("ch01", "e1", true);
  now += 60000; phone.page.check("ch01", "e2", true);
  for (let i = 0; i < 2; i++) { laptop.open(); await settle(); phone.open(); await settle(); }
  expect(!(bad in evSet(laptop.page)) && !(bad in evSet(phone.page)), "the wrong-hash row was taken in", { l: evSet(laptop.page), p: evSet(phone.page) });
  expect(bad in serverSet(server, "u1"), "setup: the bad row is not on the server");
  expect(canon(evSet(laptop.page)) === canon(evSet(phone.page)) && Object.keys(evSet(laptop.page)).length === 2, "the two devices differ", { l: evSet(laptop.page), p: evSet(phone.page) });
  const rest = serverSet(server, "u1"); delete rest[bad];
  expect(canon(rest) === canon(evSet(laptop.page)), "the server minus the bad row differs from the devices", { rest, l: evSet(laptop.page) });
  expect(noAttempts(server), "attempts touched");
});

scenario("a row in a later format stops sending", async () => {
  const { server, laptop } = await twoDevices();
  const P = pagePayloadAt("ch01/e9");
  server.seedEvent("u1", { id: eventId("zzzzzzzz", P), v: 2, t: P[0], d: P[1], src: P[2], sec: P[3], ref: P[4], k: P[5], ok: P[6], n: P[7], r: P[8], f: P[9], x: null });
  laptop.open(); await settle();
  expect((laptop.read(EV_KEY, {}) || {}).v === 2 && laptop.page.win.BMEvents.ahead() === true, "the log is not marked ahead", laptop.read(EV_KEY, null));
  const n = sent(server), before = Object.keys(evSet(laptop.page)).length;
  now += 60000; laptop.page.check("ch01", "e1", true); await settle();
  expect(sent(server) === n, "an entry was sent to a later-format account", batchCalls(server));
  expect(Object.keys(evSet(laptop.page)).length === before, "the recorder wrote while ahead", evSet(laptop.page));
  expect(laptop.page.status() === "synced", "progress is not synced", laptop.page.Account.status());
  laptop.page.resetAll(); await settle();
  expect(!(server.events.u1 || []).length, "the server rows survived the reset", server.events.u1);
  expect((laptop.read(EV_KEY, {}) || {}).v === 1 || laptop.read(EV_KEY, null) === null, "the local format is not back to 1", laptop.read(EV_KEY, null));
  expect(laptop.page.win.BMEvents.ahead() === false, "still ahead after the reset");
  now += 60000; laptop.page.check("ch01", "e2", true); await settle();
  expect((server.events.u1 || []).length === 1 && sent(server) > n, "the check after the reset was not sent", { rows: server.events.u1, sent: sent(server) });
  expect(noAttempts(server), "attempts touched");
});

scenario("the day's quota holds the outbox until UTC midnight", async () => {
  const { server, laptop } = await twoDevices();
  server.meta.u1.day_n = server.quota;
  now += 60000; laptop.page.check("ch01", "e1", true); await settle();
  expect(server.hints.indexOf("bm-quota") > -1 && outbox(laptop).length === 1, "the quota was not hit or the outbox lost the id", { hints: server.hints, out: outbox(laptop) });
  const n = batchCalls(server).length;
  now += 60000; laptop.page.check("ch01", "e2", true); await settle();
  expect(batchCalls(server).length === n && outbox(laptop).length === 2, "a batch was sent before midnight", { n, now: batchCalls(server).length });
  now = Date.parse(pgDay() + "T00:00:00Z") + 24 * 3600 * 1000 + 10000;
  laptop.page.check("ch01", "e3", true); await settle();
  expect((server.events.u1 || []).length === 3 && outbox(laptop).length === 0, "the three did not arrive after midnight", { rows: (server.events.u1 || []).length, out: outbox(laptop) });
  expect(laptop.page.status() === "synced", "status", laptop.page.Account.status());
  expect(noAttempts(server), "attempts touched");
});

scenario("the day's call limit holds the outbox until UTC midnight", async () => {
  const { server, laptop } = await twoDevices();
  server.meta.u1.day_calls = server.calls;
  now += 60000; laptop.page.check("ch01", "e1", true); await settle();
  expect(server.hints.indexOf("bm-calls") > -1 && outbox(laptop).length === 1 && !(server.events.u1 || []).length, "bm-calls did not hold the outbox", { hints: server.hints, out: outbox(laptop) });
  expect(noAttempts(server), "attempts touched");
});

scenario("an oversized batch is halved until it fits", async () => {
  const { server, laptop } = await twoDevices();
  server.maxBatch = 3; server.eventsDown = true;
  for (let i = 0; i < 8; i++) { now += 60000; laptop.page.check("ch01", "k" + i, true); }
  await settle();
  expect(outbox(laptop).length === 8, "setup: the outbox does not hold 8", outbox(laptop));
  server.eventsDown = false;
  server.log.length = 0;
  for (let i = 0; i < 14 && outbox(laptop).length; i++) { laptop.page.Account.syncNow(); await settle(); }
  expect(server.hints.indexOf("bm-batch") > -1, "bm-batch never came", server.hints);
  expect((server.events.u1 || []).length === 8 && outbox(laptop).length === 0, "not every entry arrived", { rows: (server.events.u1 || []).length, out: outbox(laptop) });
  const lens = server.log.filter((l) => /^rpc events_put [1-9]/.test(l)).map((l) => Number(l.split(" ")[2]));
  const refused = server.hints.filter((h) => h === "bm-batch").length;
  expect(lens.filter((n) => n > 3).length === refused, "a batch longer than 3 was accepted", { lens, hints: server.hints });
  expect(noAttempts(server), "attempts touched");
});

scenario("a device whose clock is ahead keeps its future entries for later", async () => {
  const { server, laptop } = await twoDevices();
  server.skewMin = -2 * 1440;
  now += 60000; laptop.page.check("ch01", "e1", true); await settle();
  expect(outbox(laptop).length === 1 && !(server.events.u1 || []).length, "the future entry was not kept out", { out: outbox(laptop), rows: server.events.u1 });
  expect(batchCalls(server).length === 1, "the entry was not offered", server.log);
  server.skewMin = 0;
  now += 60000; laptop.page.check("ch01", "e2", true); await settle();
  expect((server.events.u1 || []).length === 2 && outbox(laptop).length === 0, "both rows are not on the server", { rows: server.events.u1, out: outbox(laptop) });
  expect(noAttempts(server), "attempts touched");
});

scenario("a pull that storage refuses leaves the cursor where it was", async () => {
  const { server, laptop } = await twoDevices();
  laptop.page.check("ch01", "e1", true); await settle();
  expect(Object.keys(serverSet(server, "u1")).length === 1, "setup: the laptop's check did not reach the account", serverSet(server, "u1"));
  const phone = new Device("new phone", server);
  phone.remember("u1");
  phone.open();
  phone.page.refuse = (k) => k === EV_KEY;
  await settle();
  expect(phone.page.status() === "synced", "progress did not sync while the log's storage was full", phone.page.Account.status());
  expect(Object.keys(phone.read(EV_KEY, { ev: {} }).ev || {}).length === 0, "setup: the refused write landed anyway", phone.read(EV_KEY, null));
  expect(!(evMeta(phone).u1 || {}).seq, "the cursor moved past rows this browser could not store", evMeta(phone).u1);
  phone.page.refuse = null;
  phone.open(); await settle();
  expect(Object.keys(evSet(phone.page)).length === 1 && evMeta(phone).u1.seq === server.meta.u1.seq, "the rows did not arrive once storage had room", { log: evSet(phone.page), cursor: evMeta(phone).u1 });
  expect(noAttempts(server), "attempts touched");
});

scenario("a long log is pulled in pages", async () => {
  const { server } = await twoDevices();
  const phone = new Device("new phone", server);
  phone.remember("u1");
  const t0 = Math.floor(now / 60000) - 3000;
  for (let i = 0; i < 1200; i++) {
    const t = t0 + i, P = [t, Math.floor(t / 1440), "ex", "ch01#s", "ch01/k" + i, "c", 1, 1, 0, 0];
    server.seedEvent("u1", { id: eventId("zzzzzzzz", P), v: 1, t: P[0], d: P[1], src: P[2], sec: P[3], ref: P[4], k: P[5], ok: 1, n: 1, r: 0, f: 0, x: null });
  }
  server.log.length = 0;
  const before = sent(server);
  phone.open(); await settle();
  expect(sent(server) === before && !server.log.some((l) => /^rpc events_put [1-9]/.test(l)), "the phone re-uploaded rows it had just pulled", batchCalls(server));
  const pulls = server.log.filter((l) => l === "select events").length;
  expect(pulls === 2, "the log was not pulled in two pages", pulls);
  expect(Object.keys(evSet(phone.page)).length === 1200, "not every row arrived", Object.keys(evSet(phone.page)).length);
  expect(evMeta(phone).u1.seq === server.meta.u1.seq, "the cursor is not at the server's seq", { cursor: evMeta(phone).u1, seq: server.meta.u1.seq });
  expect(noAttempts(server), "attempts touched");
});

scenario("a checkpoint's object comes back the same", async () => {
  const { server, laptop, phone } = await twoDevices();
  const answers = [0, 1, 2, 3, 4].map((i) => ({ section: "ch01#s", g: "add", first: i === 0, pass: false }));
  for (let day = 0; day < 26; day++) {
    laptop.page.run(answers); now += 86400000;
    if (day % 5 === 4) await settle();
  }
  await settle();
  expect(Object.values(evSet(laptop.page)).some((P) => P[5] === "z"), "no checkpoint was written", Object.keys(evSet(laptop.page)).length);
  phone.open(); await settle();
  expect(canon(evSet(phone.page)) === canon(evSet(laptop.page)), "the phone's log differs from the laptop's", { l: Object.keys(evSet(laptop.page)).length, p: Object.keys(evSet(phone.page)).length });
  const cp = (server.events.u1 || []).filter((r) => r.k === "z");
  const local = Object.values(evSet(laptop.page)).filter((P) => P[5] === "z");
  expect(cp.length === local.length && cp.length > 0 && canon(cp.map((r) => r.x).sort()) === canon(local.map((P) => P[10]).sort()), "the checkpoint objects differ", { cp, local });
  expect(noAttempts(server), "attempts touched");
});

scenario("sign-out sends what is left first", async () => {
  const { server, laptop } = await twoDevices();
  server.eventsDown = true;
  now += 60000; laptop.page.check("ch01", "e1", true); await settle();
  expect(outbox(laptop).length === 1, "setup: the outbox is empty", outbox(laptop));
  server.eventsDown = false;
  const { error } = await laptop.page.signOut();
  expect(!error, "sign-out failed", error && error.message);
  expect((server.events.u1 || []).length === 1, "the row did not reach the server", server.events.u1);
  expect(outbox(laptop).length === 0 && logIds(laptop).length === 0, "the device kept its outbox or log", { out: outbox(laptop), log: logIds(laptop) });
  expect(!("u1" in evMeta(laptop)), "u1's cursor is still in the meta", evMeta(laptop));
  expect(noAttempts(server), "attempts touched");
});

scenario("a sync whose events step fails is still a sync", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  server.eventsDown = true;
  d.remember("u1"); d.open(); await settle();
  expect(d.page.status() === "synced", "the failing events step changed the status", d.page.Account.status());
  server.eventsDown = false;
  server.log.length = 0;
  d.page.Account.syncNow(); await settle();
  expect(server.log.some((l) => l === "rpc events_put 0"), "the handshake did not happen", server.log);
  expect(d.page.status() === "synced", "status", d.page.Account.status());
  expect(noAttempts(server), "attempts touched");
});


scenario("rows after a later-format row stay to be pulled and the cursor does not pass them", async () => {
  const { server, laptop, phone } = await twoDevices();
  now += 60000; phone.page.check("ch01", "e1", true); await settle();
  expect((server.events.u1 || []).length === 1, "setup: e1 is not on the server", server.events.u1);
  server.events.u1[0].v = 2;
  laptop.open(); await settle();
  expect(laptop.page.win.BMEvents.ahead() === true, "setup: the laptop is not ahead");
  now += 60000; phone.page.check("ch01", "e2", true); await settle();
  laptop.open(); await settle();
  expect(evMeta(laptop).u1.seq < server.meta.u1.seq, "the cursor passed rows this device did not store", { cursor: evMeta(laptop).u1, seq: server.meta.u1.seq });
  server.events.u1[0].v = 1;
  const tab = new Device("tablet", server);
  tab.remember("u1"); tab.open(); await settle();
  expect(Object.keys(evSet(tab.page)).length === 2, "a device that understands the format did not get every row", evSet(tab.page));
  expect(noAttempts(server), "attempts touched");
});

scenario("a cursor above the server's is started over", async () => {
  const { server, laptop, phone } = await twoDevices();
  now += 60000; laptop.page.check("ch01", "e1", true); await settle();
  const m = phone.read("bm.sync.v1", {});
  m.ev = { u1: { seq: 999999, epoch: 0, init: true } };
  phone.storage.set("bm.sync.v1", JSON.stringify(m));
  phone.open(); await settle();
  expect(canon(evSet(phone.page)) === canon(serverSet(server, "u1")) && Object.keys(evSet(phone.page)).length === 1, "the phone did not pull everything", evSet(phone.page));
  expect(evMeta(phone).u1.seq === server.meta.u1.seq, "the cursor is not the server's", { c: evMeta(phone).u1, seq: server.meta.u1.seq });
  expect(noAttempts(server), "attempts touched");
});

scenario("a hint on the handshake holds the channel to UTC midnight", async () => {
  const { server, laptop } = await twoDevices();
  server.meta.u1.day_calls = server.calls;
  laptop.open(); await settle();
  now += 60000; laptop.page.check("ch01", "e1", true); await settle();
  now += 3600 * 1000; laptop.page.check("ch01", "e2", true); await settle();
  expect(batchCalls(server).length === 0 && outbox(laptop).length === 2, "a batch went out before midnight", { calls: batchCalls(server), out: outbox(laptop) });
  now = Date.parse(pgDay() + "T00:00:00Z") + 24 * 3600 * 1000 + 10000;
  laptop.page.check("ch01", "e3", true); await settle();
  expect((server.events.u1 || []).length === 3 && outbox(laptop).length === 0, "the rows did not arrive after midnight", { rows: (server.events.u1 || []).length, out: outbox(laptop) });
  expect(noAttempts(server), "attempts touched");
});

scenario("a reset that is given up brings the account's entries back", async () => {
  const { server, laptop, phone } = await twoDevices();
  now += 60000; laptop.page.check("ch01", "e1", true); await settle();
  phone.open(); await settle();
  expect(Object.keys(evSet(phone.page)).length === 1 && evMeta(phone).u1.seq === 1, "setup: the phone did not pull e1", { s: evSet(phone.page), m: evMeta(phone) });
  now += 60000; server.offline = true;
  phone.page.resetAll(); await settle();
  phone.page.close();
  server.offline = false;
  now += 60000; laptop.page.check("ch01", "e2", true); laptop.page.solve("ch01", "e2"); await settle();
  now += 60000; phone.open(); await settle();
  expect(Object.keys(evSet(phone.page)).length === 2 && canon(evSet(phone.page)) === canon(serverSet(server, "u1")), "the phone's log did not come back", { phone: evSet(phone.page), server: serverSet(server, "u1") });
  expect(phone.solved().length >= 1 && has(server.solved("u1"), "ch01/e2"), "progress was not restored", phone.solved());
  expect(noAttempts(server), "attempts touched");
});

scenario("a second account on the page inherits neither the hold nor the full sentence", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  d.remember("u1"); d.open({ account: true }); await settle();
  server.full = true;
  d.page.check("ch01", "e1", true); await settle();
  expect(d.page.shown().indexOf("Your answer log is full") > -1, "setup: the page does not say full");
  server.full = false;
  d.storage.delete(SESSION_KEY);
  d.page.switchTo("u2"); await settle();
  expect(d.page.shown().indexOf("Your answer log is full") < 0, "u2 sees u1's full sentence", d.page.shown());
  now += 60000; d.page.check("ch01", "e2", true); await settle();
  expect((server.events.u2 || []).length === 1 && outbox(d).length === 0, "u2's first check was not sent", { rows: server.events.u2, out: outbox(d) });
  expect(noAttempts(server), "attempts touched");
});

scenario("a stale send on pagehide gets bm-reset and the entry is dropped", async () => {
  const { server, laptop, phone } = await twoDevices();
  now += 60000; phone.page.check("ch01", "e1", true); await settle();
  now += 60000; laptop.page.resetAll(); await settle();
  expect(server.meta.u1.epoch === 1, "setup: the epoch did not move");
  now += 60000; phone.page.check("ch01", "e2", true);
  phone.page.close(); await settle();
  phone.open(); await settle();
  expect(server.hints.indexOf("bm-reset") > -1, "the stale epoch was not refused", server.hints);
  expect(!(server.events.u1 || []).length, "the stale entry landed", server.events.u1);
  expect(evMeta(phone).u1 && evMeta(phone).u1.epoch === 1, "the phone did not adopt epoch 1", evMeta(phone));
  now += 60000; phone.page.check("ch01", "e3", true); await settle();
  expect((server.events.u1 || []).length === 1 && outbox(phone).length === 0, "a further check did not land", { rows: server.events.u1, out: outbox(phone) });
  expect(noAttempts(server), "attempts touched");
});

/* ------------------------------------------- parent-managed learners (PA-2) -- */

const SYNC_KEY = "bm.sync.v1";
const syncMeta = (dev) => dev.read(SYNC_KEY, {}) || {};
/* the account signs in on a device, adds a managed learner on the server and switches to it */
async function asLearner(server, dev, acct, id) {
  server.addLearner(acct, id);
  dev.remember(acct);
  dev.open(); await settle();
  const r = await dev.page.switchLearner(id);
  expect(!r.error, "setup: the switch to " + id + " failed", r.error && r.error.message);
  expect(dev.page.Account.learner() === id && syncMeta(dev).learner === id && syncMeta(dev).acct === acct, "setup: the browser is not on " + id, syncMeta(dev));
  return r;
}
const putArgs = (server) => server.puts.filter((a) => Array.isArray(a.batch) && a.batch.length);

scenario("a learner left by another account is dropped when a different account signs in", async () => {
  const server = new Server();
  const d = new Device("shared", server);
  await asLearner(server, d, "u1", "L1");
  d.page.solve("ch01", "e1"); d.page.check("ch01", "e1", true); await settle();
  expect(has(server.solved("L1"), "ch01/e1") && !has(server.solved("u1"), "ch01/e1"), "setup: L1's work is not in L1's row only", { l1: server.solved("L1"), u1: server.solved("u1") });
  /* the session ends without the sign-out path, then a different account signs in */
  d.storage.delete(SESSION_KEY);
  d.remember("u2"); d.open(); await settle();
  const m = syncMeta(d);
  expect(m.learner === undefined && m.acct === undefined, "the learner survived into u2's session", m);
  expect(m.user === "u2" && d.page.Account.learner() === null, "u2 is not running as itself", { m, learner: d.page.Account.learner() });
  expect(server.rows.u2 && server.rows.u2.user_id === "u2" && !has(server.solved("u2"), "ch01/e1"), "L1's progress reached u2's row", server.rows.u2);
  expect(canon(server.solved("L1")) === canon(["ch01/e1"]) && !has(d.solved(), "ch01/e1"), "L1's row changed or its copy stayed on the browser", { l1: server.solved("L1"), local: d.solved() });
  expect(putArgs(server).every((a) => !("learner" in a) || a.learner === "L1") && server.puts.slice(-1).every((a) => !("learner" in a)), "u2's calls named a learner", server.puts);
  expect(noAttempts(server), "attempts touched");
});

scenario("a switch with an unsent entry refuses and changes nothing", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  server.addLearner("u1", "L1");
  d.remember("u1"); d.open(); await settle();
  server.eventsDown = true;
  d.page.solve("ch01", "e1"); d.page.check("ch01", "e1", true); await settle();
  const before = { out: outbox(d).slice(), dev: deviceId(d), ids: logIds(d), solved: d.solved(), meta: syncMeta(d) };
  expect(before.out.length === 1, "setup: the entry is not queued", before.out);
  const r = await d.page.switchLearner("L1");
  expect(r.error && r.error.message === "Finish syncing first.", "the switch was not refused", r.error && r.error.message);
  expect(canon(outbox(d)) === canon(before.out) && deviceId(d) === before.dev && canon(logIds(d)) === canon(before.ids), "the log or outbox changed", { out: outbox(d), dev: deviceId(d) });
  expect(canon(d.solved()) === canon(before.solved) && canon(syncMeta(d).learner) === canon(undefined) && syncMeta(d).acct === undefined && d.page.Account.learner() === null, "the browser changed", syncMeta(d));
  expect(!server.log.includes("select learners") && !server.rows.L1 && !(server.events.L1 || []).length, "the server was asked about or given the learner", server.log);
  expect(noAttempts(server), "attempts touched");
});

scenario("after a switch the old outbox is gone and a later check lands under the new learner only", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  server.addLearner("u1", "L1");
  d.remember("u1"); d.open(); await settle();
  d.page.check("ch01", "e1", true); await settle();
  expect((server.events.u1 || []).length === 1 && outbox(d).length === 0, "setup: u1's entry did not land", { rows: server.events.u1, out: outbox(d) });
  const first = deviceId(d), u1Rows = canon(serverSet(server, "u1"));
  const r = await d.page.switchLearner("L1");
  expect(!r.error, "the switch failed", r.error && r.error.message);
  expect(logIds(d).length === 0 && outbox(d).length === 0 && deviceId(d) !== first, "the old log, outbox or device id survived", { ids: logIds(d), out: outbox(d), dev: deviceId(d), first });
  expect((d.read(DEV_KEY, {}) || {}).uid === "L1", "the device record is not stamped L1", d.read(DEV_KEY, null));
  /* a stale writer leaves an id under the old device id in the outbox store: it must never be sent */
  const stale = first + "-0000stale";
  d.storage.set(OUT_KEY, JSON.stringify({ ids: [stale] }));
  now += 60000; d.page.check("ch01", "e2", true); await settle();
  expect(!server.puts.some((a) => JSON.stringify(a.batch || []).indexOf(stale) > -1) && outbox(d).indexOf(stale) < 0, "the stale id was sent or kept", { puts: server.puts, out: outbox(d) });
  expect((server.events.L1 || []).length === 1 && outbox(d).length === 0, "the check did not land under L1", { rows: server.events.L1, out: outbox(d) });
  expect(canon(serverSet(server, "u1")) === u1Rows, "u1's log changed", serverSet(server, "u1"));
  const sentArgs = putArgs(server);
  expect(sentArgs.length === 2 && !("learner" in sentArgs[0]) && sentArgs[1].learner === "L1" && Object.keys(sentArgs[0]).sort().join() === "batch,epoch", "the rpc arguments are not self: two, managed: learner", server.puts);
  expect(server.puts.filter((a) => !a.batch.length && !("learner" in a)).length >= 1 && server.puts.filter((a) => a.learner === "L1").length >= 2, "the handshakes did not follow the reader", server.puts);
  expect(noAttempts(server), "attempts touched");
});

scenario("a learner deleted elsewhere is dropped on the next page load and its local progress is not merged into the parent's", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  server.rows.u1 = { user_id: "u1", progress: { ch02: { solved: { s: true }, total: 10 } }, reset_at: 0, updated_at: now - 1000 };
  await asLearner(server, d, "u1", "L1");
  server.offline = true;
  d.page.solve("ch01", "e1"); d.page.check("ch01", "e1", true); await settle();
  d.page.close();
  server.offline = false;
  delete server.learners.L1;               /* deleted on another device */
  d.open(); await settle();
  expect(server.log.includes("select learners"), "the learner was not verified", server.log);
  const m = syncMeta(d);
  expect(m.learner === undefined && m.acct === undefined && m.user === "u1" && d.page.Account.learner() === null, "the browser did not fall back to u1", m);
  expect(!has(d.solved(), "ch01/e1") && has(d.solved(), "ch02/s"), "the learner's copy stayed or u1's progress is missing", d.solved());
  expect(!has(server.solved("u1"), "ch01/e1") && !has(server.solved("L1"), "ch01/e1"), "the learner's local progress went to a row", { u1: server.solved("u1"), l1: server.solved("L1") });
  expect(logIds(d).length === 0 && outbox(d).length === 0, "the learner's log stayed", logIds(d));
  expect(server.puts.every((a) => !("learner" in a) || a.learner === "L1") && server.puts.slice(-1).every((a) => !("learner" in a)), "a call still named the learner after the fall back", server.puts.slice(-3));
  expect(noAttempts(server), "attempts touched");
});

scenario("a learner id of another account is refused by the server and the browser falls back to the parent", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  server.addLearner("u2", "L2");
  d.storage.set(SYNC_KEY, JSON.stringify({ user: "L2", acct: "u1", learner: "L2", resetAt: 0 }));
  d.storage.set(KEYS.progress, JSON.stringify({ ch01: { solved: { e9: true }, total: 10 }, }));
  d.remember("u1"); d.open(); await settle();
  expect(server.log.includes("select learners"), "the learner was not verified", server.log);
  expect(syncMeta(d).learner === undefined && syncMeta(d).user === "u1" && d.page.Account.learner() === null, "the browser did not fall back to u1", syncMeta(d));
  expect(!server.rows.L2 && !has(server.solved("u1"), "ch01/e9") && !has(d.solved(), "ch01/e9"), "L2's row was written or the copy was merged", { rows: Object.keys(server.rows), u1: server.solved("u1"), local: d.solved() });
  expect(server.puts.every((a) => !("learner" in a)), "a call named L2", server.puts);
  /* with no client check at all the server still refuses */
  let err = null;
  await d.page.Account.rpc("events_put", { batch: [], epoch: 0, learner: "L2" }).catch((e) => { err = e; });
  expect(err && err.message === "not your learner", "the server did not refuse", err && err.message);
  const sw = await d.page.switchLearner("L2");
  expect(sw.error && /not on this account/.test(sw.error.message) && syncMeta(d).learner === undefined && d.page.Account.learner() === null, "a switch to another account's learner went through", sw.error && sw.error.message);
  expect(noAttempts(server), "attempts touched");
});

scenario("a sync that finishes after a switch does not write the old learner's progress into the browser", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  server.addLearner("u1", "L1");
  d.remember("u1"); d.open(); await settle();
  server.rows.u1 = { user_id: "u1", progress: { ch09: { solved: { z: true }, total: 10 } }, reset_at: 0, updated_at: now + 1000 };
  const written = server.writes();
  server.hold();
  d.page.Account.syncNow();
  for (let i = 0; i < 5; i++) await tick();
  /* the switch is made while u1's read is in flight: the browser is L1's now, as another tab's switch leaves it */
  /* `user` stays u1's: only the learner check separates this from "signed out in another tab" */
  const m = syncMeta(d); m.learner = "L1"; m.acct = "u1";
  expect(m.user === "u1", "setup: the meta does not name u1 as owner", m);
  d.storage.set(SYNC_KEY, JSON.stringify(m));
  server.release(); await settle();
  expect(!has(d.solved(), "ch09/z"), "u1's progress was written into the browser", d.solved());
  expect(syncMeta(d).user === "u1" && syncMeta(d).learner === "L1" && !server.rows.L1, "u1's sync changed the meta or wrote L1's row", { m: syncMeta(d), rows: Object.keys(server.rows) });
  expect(server.writes() === written, "a row was written", server.log);
  expect(noAttempts(server), "attempts touched");
});

scenario("a tab that missed a switch in another tab does not write into the new learner's row", async () => {
  const server = new Server();
  const laptop = new Device("laptop", server);
  server.addLearner("u1", "L1");
  laptop.remember("u1"); laptop.open(); await settle();
  const tabA = laptop.page, tabB = laptop.openTab(); await settle();
  const r = await tabA.switchLearner("L1");
  expect(!r.error, "setup: the switch failed", r.error && r.error.message);
  tabB.fire("storage");                    /* the browser tells the other tab */
  expect(tabB.status() === "reload" && /Reload/.test(tabB.Account.status().error.message), "the stale tab does not ask for a reload", tabB.Account.status());
  const rows = canon(server.rows), writes = server.writes();
  tabB.solve("ch01", "e5"); await settle();
  tabB.close(); await settle();
  expect(tabB.status() === "reload", "the stale tab left the reload state", tabB.Account.status());
  expect(server.writes() === writes && canon(server.rows) === rows && !has(server.solved("L1"), "ch01/e5") && !has(server.solved("u1"), "ch01/e5"), "the stale tab wrote", { rows: server.rows, log: server.log.slice(-4) });
  expect(await tabB.Account.syncNow() === false && tabA.status() !== "reload", "the stale flag spread or syncNow ran", tabA.Account.status());
  expect(noAttempts(server), "attempts touched");
});

scenario("sign-out while a managed learner is active clears the learner and the next sign-in is the parent's own progress", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  server.rows.u1 = { user_id: "u1", progress: { ch02: { solved: { s: true }, total: 10 } }, reset_at: 0, updated_at: now - 1000 };
  await asLearner(server, d, "u1", "L1");
  d.page.solve("ch01", "e1"); await settle();
  const { error, result } = await d.page.signOut();
  expect(!error && result.saved === true, "sign-out failed", error && error.message);
  const m = syncMeta(d);
  expect(m.learner === undefined && m.acct === undefined && m.user === undefined && m.resetAt === undefined && !(m.ev && m.ev.L1), "sign-out left the learner in the meta", m);
  expect(has(server.solved("L1"), "ch01/e1") && d.solved().length === 0 && d.setAside("L1").length === 0, "L1's progress was not saved and cleared", { l1: server.solved("L1"), local: d.solved() });
  d.remember("u1"); d.open(); await settle();
  expect(d.page.Account.learner() === null && syncMeta(d).user === "u1", "the next sign-in is not the parent's own", syncMeta(d));
  expect(has(d.solved(), "ch02/s") && !has(d.solved(), "ch01/e1") && !has(server.solved("u1"), "ch01/e1"), "L1's progress is in the parent's", { local: d.solved(), u1: server.solved("u1") });
  expect(noAttempts(server), "attempts touched");
});

scenario("progress set aside for a managed learner is saved when the parent switches to that learner again", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  await asLearner(server, d, "u1", "L1");
  server.offline = true;
  d.page.solve("ch01", "e1"); await settle();
  const out = await d.page.signOut();
  server.offline = false;
  expect(!out.error && out.result.saved === false, "setup: the sign-out saved", out);
  expect(has(d.setAside("L1"), "ch01/e1") && d.setAside("u1").length === 0 && d.solved().length === 0, "the progress is not set aside under L1 alone", { l1: d.setAside("L1"), u1: d.setAside("u1"), local: d.solved() });
  d.remember("u1"); d.open(); await settle();
  expect(d.page.Account.learner() === null && !has(d.solved(), "ch01/e1") && !has(server.solved("u1"), "ch01/e1") && d.setAside("L1").length === 1, "the parent's session took L1's progress", { local: d.solved(), u1: server.solved("u1"), aside: d.setAside("L1") });
  const r = await d.page.switchLearner("L1");
  expect(!r.error, "the switch failed", r.error && r.error.message);
  expect(has(server.solved("L1"), "ch01/e1") && has(d.solved(), "ch01/e1") && d.setAside("L1").length === 0 && !has(server.solved("u1"), "ch01/e1"), "the set-aside progress was not saved to L1 alone", { l1: server.solved("L1"), local: d.solved(), aside: d.setAside("L1") });
  expect(noAttempts(server), "attempts touched");
});

scenario("a managed learner's page load verifies, stamps and pulls when the session is re-announced during the read", async () => {
  for (const gone of [false, true]) {
    const server = new Server();
    const d = new Device("laptop", server);
    server.rows.L1 = { user_id: "L1", progress: { ch03: { solved: { x: true }, total: 10 } }, reset_at: 0, updated_at: now - 1000 };
    await asLearner(server, d, "u1", "L1");
    d.page.close();
    server.log.length = 0;
    server.hold();
    /* the timers run while the learners read is held: the session is re-announced (auth-js hands a
       new user object for the same account) before the read answers, as on any real network */
    d.open(); await settle();
    d.page.switchTo("u1"); await settle();
    if (gone) delete server.learners.L1;
    server.release(); await settle();
    const at = server.log.indexOf("select learners");
    expect(at > -1 && server.log.indexOf("select user_state", at) > at, "the page did not verify and then pull", server.log);
    if (!gone) {
      expect(d.page.Account.learner() === "L1" && syncMeta(d).learner === "L1" && has(d.solved(), "ch03/x") && (d.read(DEV_KEY, {}) || {}).uid === "L1", "the learner was not kept, pulled and stamped", { m: syncMeta(d), local: d.solved(), dev: d.read(DEV_KEY, null) });
    } else {
      expect(d.page.Account.learner() === null && syncMeta(d).learner === undefined && !has(d.solved(), "ch03/x"), "a deleted learner was not dropped", { m: syncMeta(d), local: d.solved() });
    }
  }
});

scenario("a token refresh during a switch lets the switch complete", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  server.addLearner("u1", "L1");
  d.remember("u1"); d.open(); await settle();
  d.page.solve("ch01", "e1");
  server.hold();
  let res = {};
  d.page.Account.switchLearner("L1").then((r) => { res.ok = true; }, (e) => { res.error = e; });
  await settle();                        /* the switch's first save is held at the server */
  d.page.switchTo("u1"); await settle();  /* a token refresh: the same account, a new user object */
  server.release(); await settle();
  expect(res.ok && !res.error, "the switch did not complete", res.error && res.error.message);
  expect(d.page.Account.learner() === "L1" && syncMeta(d).learner === "L1" && has(server.solved("u1"), "ch01/e1") && !has(d.solved(), "ch01/e1"), "the browser is not on L1 with u1's work saved", { m: syncMeta(d), local: d.solved() });
});

scenario("an answer given while the target learner is being verified is not wiped by the switch", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  server.addLearner("u1", "L1");
  d.remember("u1"); d.open(); await settle();
  let res = {}, once = false;
  /* the answer lands while the learners read is on its way */
  const exec = server.exec.bind(server);
  server.exec = (q, uid) => { if (q.table === "learners" && !once) { once = true; d.page.solve("ch07", "late"); d.page.check("ch07", "late", true); } return exec(q, uid); };
  d.page.Account.switchLearner("L1").then(() => { res.ok = true; }, (e) => { res.error = e; });
  await settle();
  expect(res.error && res.error.message === "Finish syncing first.", "the switch went through over a late answer", res);
  expect(d.page.Account.learner() === null && has(d.solved(), "ch07/late"), "the late answer was wiped", { learner: d.page.Account.learner(), local: d.solved() });
  d.page.Account.syncNow(); await settle();
  const again = await d.page.switchLearner("L1");
  expect(!again.error && has(server.solved("u1"), "ch07/late") && !has(server.solved("L1"), "ch07/late"), "after syncing, the switch did not go through with the answer in u1's row only", { err: again.error && again.error.message, u1: server.solved("u1"), l1: server.solved("L1") });
});

scenario("with the log switched off, a switch waits for entries that would send once it is back on", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  server.addLearner("u1", "L1");
  d.remember("u1"); d.open({ config: { learn: { events: "off" } } }); await settle();
  d.page.check("ch01", "e1", true); await settle();
  expect(outbox(d).length === 1, "setup: the entry was not queued", outbox(d));
  const r = await d.page.switchLearner("L1");
  expect(r.error && /cannot be sent right now/.test(r.error.message), "the switch did not refuse with the honest message", r.error && r.error.message);
  expect(outbox(d).length === 1 && d.page.Account.learner() === null && !(server.events.u1 || []).length, "the queued entry was wiped or sent", { out: outbox(d), events: server.events });
});

scenario("the log is pulled back in full after a switch to a learner and back", async () => {
  const { server, laptop, phone } = await twoDevices();
  server.addLearner("u1", "L1");
  phone.page.check("ch01", "e1", true); await settle();
  laptop.open(); await settle();
  expect(Object.keys(evSet(laptop.page)).length === 1, "setup: the laptop did not pull the entry", evSet(laptop.page));
  let r = await laptop.page.switchLearner("L1");
  expect(!r.error && Object.keys(evSet(laptop.page)).length === 0 && !evMeta(laptop).u1, "the switch did not clear the log and its cursor", { e: r.error && r.error.message, m: evMeta(laptop) });
  r = await laptop.page.switchLearner(null);
  expect(!r.error && laptop.page.Account.learner() === null, "the switch back failed", r.error && r.error.message);
  expect(canon(evSet(laptop.page)) === canon(serverSet(server, "u1")) && Object.keys(evSet(laptop.page)).length === 1, "the log was not pulled back in full", { l: evSet(laptop.page), s: serverSet(server, "u1") });
});

scenario("the log is pulled back in full after sign-out and sign-in", async () => {
  const { server, laptop, phone } = await twoDevices();
  phone.page.check("ch01", "e1", true); await settle();
  laptop.open(); await settle();
  expect(Object.keys(evSet(laptop.page)).length === 1, "setup: the laptop did not pull the entry", evSet(laptop.page));
  const r = await laptop.page.signOut();
  expect(!r.error && Object.keys(evSet(laptop.page)).length === 0 && isEmpty(syncMeta(laptop).ev), "sign-out left the log or cursor", syncMeta(laptop));
  laptop.remember("u1"); laptop.open(); await settle();
  expect(canon(evSet(laptop.page)) === canon(serverSet(server, "u1")) && Object.keys(evSet(laptop.page)).length === 1, "the log was not pulled back in full", { l: evSet(laptop.page), s: serverSet(server, "u1") });
});

scenario("a transient error on the learners read keeps the learner and its work, a definitive no drops it", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  await asLearner(server, d, "u1", "L1");
  server.offline = true;
  d.page.solve("ch01", "e1"); await settle();
  d.page.close();
  server.offline = false;
  server.learnersError = "PGRST002";
  d.open(); await settle();
  expect(d.page.Account.learner() === "L1" && syncMeta(d).learner === "L1" && has(d.solved(), "ch01/e1"), "the learner or its work was dropped on a transient error", { m: syncMeta(d), local: d.solved() });
  expect(has(server.solved("L1"), "ch01/e1") && !has(server.solved("u1"), "ch01/e1"), "the work did not reach L1's row", { l1: server.solved("L1"), u1: server.solved("u1") });
  /* now it is a verdict: aside progress for L1 goes too */
  server.learnersError = null;
  d.storage.set("bm.sync.pending.v1", JSON.stringify({ L1: { email: "", via: [], resetAt: 0, state: { progress: {} }, at: 1 } }));
  delete server.learners.L1;
  d.open(); await settle();
  expect(d.page.Account.learner() === null && syncMeta(d).learner === undefined && d.solved().length === 0 && !("L1" in (d.read("bm.sync.pending.v1", {}) || {})), "a deleted learner was kept", { m: syncMeta(d), local: d.solved() });
});

scenario("a held log channel refuses the switch with the honest message and wipes nothing", async () => {
  const server = new Server();
  const d = new Device("laptop", server);
  server.addLearner("u1", "L1");
  d.remember("u1"); d.open(); await settle();
  server.full = true;
  d.page.check("ch01", "e1", true); d.page.solve("ch01", "e1"); await settle();
  const before = { dev: deviceId(d), ids: logIds(d), out: outbox(d).slice() };
  expect(before.out.length === 1, "setup: the entry is not queued", before.out);
  const r = await d.page.switchLearner("L1");
  const msg = "The learning log cannot be sent right now; switching waits until it is.";
  expect(r.error && r.error.message === msg, "the refusal is not the honest message", r.error && r.error.message);
  const st = d.page.Account.status();
  expect(st.error && st.error.message === msg && st.state === "synced", "status does not carry the message", st);
  expect(deviceId(d) === before.dev && canon(logIds(d)) === canon(before.ids) && canon(outbox(d)) === canon(before.out) && d.page.Account.learner() === null && syncMeta(d).learner === undefined && has(d.solved(), "ch01/e1"), "something was wiped or switched", syncMeta(d));
  expect(!server.log.includes("select learners"), "the target was verified", server.log);
});

scenario("a tab that sees another tab's switch reloads itself once and refuses to switch", async () => {
  const server = new Server();
  const laptop = new Device("laptop", server);
  server.addLearner("u1", "L1");
  laptop.remember("u1"); laptop.open(); await settle();
  const tabA = laptop.page, tabB = laptop.openTab(); await settle();
  const r = await tabA.switchLearner("L1");
  expect(!r.error && tabB.reloads === 0, "setup", r.error && r.error.message);
  tabB.fire("storage"); tabB.fire("storage");
  expect(tabB.status() === "reload" && tabB.reloads === 1 && tabA.reloads === 0, "the stale tab did not reload exactly once", { s: tabB.status(), n: tabB.reloads, a: tabA.reloads });
  expect(tabB.Account.learner() === null && tabA.Account.learner() === "L1", "learner() does not report the learner each page runs as", { b: tabB.Account.learner(), a: tabA.Account.learner() });
  const sw = await tabB.switchLearner("L1");
  expect(sw.error && /Reload/.test(sw.error.message) && syncMeta(laptop).learner === "L1", "the stale tab could switch", sw.error && sw.error.message);
});

/* --------------------------------------------------------------- runner -- */

(async () => {
  let pass = 0, fail = 0;
  for (const s of scenarios) {
    if (ONLY && s.name.indexOf(ONLY) === -1) continue;
    timers = [];
    try {
      await s.fn();
      pass++;
      console.log("  ok    " + s.name);
    } catch (e) {
      fail++;
      console.log("  FAIL  " + s.name + "\n          " + e.message);
    }
  }
  console.log((fail ? "FAILED" : "passed") + ": " + pass + " ok, " + fail + " fail");
  process.exit(fail ? 1 : 0);
})();
