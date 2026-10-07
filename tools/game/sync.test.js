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
   never heard of, a row marked as a newer shape, and a server whose tables are older
   or newer than this file. Some of these run on account.html, where the second half of
   account.js (the account page) runs in the same scope as the sync, and where readers
   sign in and out. A last section covers signing in through another service
   (assets/config.js `providers`): which services are offered, what is asked of them,
   and readers who have no email.

   Usage: node tools/game/sync.test.js [--only=<substring>] */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "../..");
const SRC = fs.readFileSync(path.join(ROOT, "assets/account.js"), "utf8");
/* the merge every entry puts up ahead of account.js (src/ui/core.ts), read by Node itself */
const MERGE = require("../../src/ui/core.ts").merge;
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);
const REF = "testref";
const SESSION_KEY = "sb-" + REF + "-auth-token";
const KEYS = {
  progress: "bm.progress.v1", play: "bm.play.v1", last: "bm.last", attempts: "bm.attempts.v1",
  activity: "bm.activity.v1", lesson: "bm.lesson.v1", game: "bm.game.v1", run: "bm.run.v1", prefs: "bm.prefs.v1"
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
function pgTime(ms) {
  return new Date(ms).toISOString().replace(/\.?0*Z$/, "+00:00").replace(/(\.\d*?)0+\+/, "$1+");
}

/* user_state as supabase/schema.sql makes it: each column a save may leave out, and what
   it then holds */
const DEFAULTS = { progress: {}, play: {}, attempts: {}, activity: {}, lesson: {}, last: null, game: {}, reset_at: 0 };

class Server {
  constructor() {
    this.rows = {};          /* user_id -> row, updated_at kept as ms */
    this.attempts = [];
    this.profiles = {};
    this.columns = ["user_id"].concat(Object.keys(DEFAULTS), "updated_at");   /* of user_state */
    this.missing = {};       /* tables this project does not have: { attempts: true } */
    this.refused = 0;        /* saves turned away for naming a column that is not there */
    this.offline = false;    /* every request fails, database and auth alike */
    this.dbError = null;     /* database requests fail with this, auth still works */
    this.oldAuth = false;    /* sign-out keeps the session when it cannot reach the server */
    this.held = null;        /* while set, requests wait here (hold / release) */
    this.log = [];
  }
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
  exec(q, uid) {
    this.log.push(q.op + " " + q.table);
    if (this.offline) return { data: null, error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 };
    if (this.dbError) return { data: null, error: clone(this.dbError), status: 403 };
    if (!uid) return { data: null, error: { message: "permission denied", code: "42501" }, status: 401 };
    if (this.missing[q.table]) {
      return { data: null, error: { message: "Could not find the table 'public." + q.table + "' in the schema cache", code: "PGRST205" }, status: 404 };
    }
    if (q.table === "attempts") {
      if (q.op !== "insert") throw new Error("fake server: attempts only takes inserts");
      [].concat(q.payload).forEach((r) => this.attempts.push(clone(r)));
      return { data: null, error: null, status: 201 };
    }
    if (q.table === "profiles") {
      if (q.op === "select") return { data: this.profiles[uid] || null, error: null, status: 200 };
      this.profiles[uid] = clone(q.payload);
      return { data: null, error: null, status: 201 };
    }
    if (q.table !== "user_state") throw new Error("fake server: unknown table " + q.table);
    /* row-level security: a reader sees and writes only their own row */
    const mine = (r) => r.user_id === uid;
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
    if (p.user_id !== uid) return { data: null, error: { message: "new row violates row-level security policy", code: "42501" }, status: 403 };
    const ret = (rows) => ({ data: q.returning ? rows.map((r) => this.out(r, q.returning)) : null, error: null, status: q.op === "update" ? 200 : 201 });
    if (q.op === "insert") {
      if (this.rows[uid]) {
        return { data: null, error: { message: 'duplicate key value violates unique constraint "user_state_pkey"', code: "23505" }, status: 409 };
      }
      p.updated_at = this.stamp(p.updated_at);
      this.rows[uid] = p;
      return ret([p]);
    }
    if (q.op === "upsert") {
      p.updated_at = this.stamp(p.updated_at);
      this.rows[uid] = Object.assign({}, this.rows[uid] || {}, p);
      return ret([this.rows[uid]]);
    }
    if (q.op === "update") {
      const hit = Object.values(this.rows).filter((r) => mine(r) && this.matches(r, q.filters));
      hit.forEach((r) => { Object.assign(r, p, { user_id: r.user_id, updated_at: this.stamp(p.updated_at) }); });
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
  const q = { table, op: "select", cols: null, filters: [], payload: null, returning: null, single: false };
  const api = {
    select(cols) { if (q.op === "select") q.cols = cols || "*"; else q.returning = cols || "*"; return api; },
    insert(p) { q.op = "insert"; q.payload = p; return api; },
    update(p) { q.op = "update"; q.payload = p; return api; },
    upsert(p) { q.op = "upsert"; q.payload = p; return api; },
    eq(c, v) { q.filters.push([c, v]); return api; },
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
      rpc: () => Promise.resolve({ data: null, error: null }),
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
      write: (k, v, silent) => { storage.set(k, JSON.stringify(v)); if (!silent) Store.emit({ type: "state", key: k }); return true; },
      on: (fn) => listeners.push(fn),
      emit: (c) => listeners.slice().forEach((fn) => fn(c))
    };
    const win = {
      console, URL, Blob: function () {}, Date: FakeDate,
      BM_CONFIG: Object.assign({ supabaseUrl: "https://" + REF + ".supabase.co", supabaseAnonKey: "sb_publishable_test" }, opts.config || {}),
      supabase: { createClient: () => client },
      BMStore: Store,
      BMSite: { rootPrefix: () => "", escapeHtml: (s) => String(s) },
      location: { hash: "", search: "", href: opts.href || "http://localhost:8000/" + (host ? "account.html" : "parts/1-algebra/01-numbers.html") },
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
  /* what the "Reset all progress" button on about.html does (site.js initResetButtons) */
  resetAll() {
    ["progress", "play", "attempts", "activity", "lesson", "game", "run"].forEach((f) => this.Store.write(KEYS[f], {}));
    this.Store.emit({ type: "reset" });
  }
  user() { const u = this.Account.user(); return u ? u.id : null; }
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
  expect(BROKEN !== SRC, "setup: account.js no longer has the line this scenario patches");
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
  expect(server.attempts.length === 0 && server.log.indexOf("insert attempts") < 0, "the attempt log was written", server.log.filter((l) => /attempts/.test(l)));
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

scenario("a project without the attempts table still syncs, and keeps the log for when it has one", async () => {
  const { server, laptop } = await twoDevices();
  server.missing.attempts = true;
  const asked = () => server.log.filter((l) => l === "insert attempts").length;
  laptop.page.check("ch01", "e1", true); laptop.page.solve("ch01", "e1"); await settle();
  expect(laptop.page.status() === "synced", "the sync failed", String((laptop.page.Account.status().error || {}).message));
  expect(has(server.solved("u1"), "ch01/e1"), "progress did not reach the account", server.solved("u1"));
  /* told once that the table is not there, the page holds the log back for a while */
  for (const k of ["e2", "e3", "e4"]) { laptop.page.check("ch01", k, true); laptop.page.solve("ch01", k); await settle(); }
  expect(asked() === 1, "the whole log was sent again with every save although the table is missing", asked());
  expect(laptop.page.status() === "synced" && has(server.solved("u1"), "ch01/e4"), "progress stopped syncing while the log was held back", server.solved("u1"));
  /* the owner runs schema.sql; a few minutes on, the checks made meanwhile go with the next save */
  server.missing = {};
  now += 5 * 60 * 1000;
  laptop.page.check("ch01", "e5", false); await settle();
  expect(server.attempts.map((a) => a.ex_key).join() === "e1,e2,e3,e4,e5", "the log kept while the table was missing did not arrive, once each, in order", server.attempts.map((a) => a.ex_key));
  server.missing.attempts = true;
  laptop.page.check("ch01", "e6", true); laptop.page.solve("ch01", "e6");
  const { result, error } = await laptop.page.signOut();
  expect(!error && result && result.saved === true && laptop.setAside("u1").length === 0, "signing out treated the missing table as unsaved progress", { result, error: error && error.message });
});

scenario("a long visit without the attempts table keeps only the newest checks", async () => {
  const { server, laptop } = await twoDevices();
  server.missing.attempts = true;
  laptop.page.check("ch01", "first", true); await settle();
  for (let i = 0; i < 700; i++) {
    laptop.page.check("ch01", "k" + i, true);
    if (i % 100 === 99) await settle();
  }
  server.missing = {};
  now += 5 * 60 * 1000;
  laptop.page.check("ch01", "last", true); await settle();
  const keys = server.attempts.map((a) => a.ex_key);
  expect(keys.length === 500 && keys[0] === "k201" && keys[499] === "last", "expected the newest 500 checks, oldest first", { n: keys.length, first: keys[0], last: keys[keys.length - 1] });
  expect(laptop.page.status() === "synced", "the sync failed", String((laptop.page.Account.status().error || {}).message));
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
