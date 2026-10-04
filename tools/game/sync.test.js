#!/usr/bin/env node
/* Sync behaviour of assets/account.js, against an in-memory stand-in for Supabase.

   Each device is account.js loaded in its own vm with its own localStorage; a page
   reload is a fresh vm over the same storage. Every device talks to one fake server
   that answers the calls account.js makes the way PostgREST and auth-js do: a select
   with maybeSingle gives the row or null, an update whose filters match nothing gives
   an empty list and no error, an insert over an existing key gives error 23505, a
   network failure comes back as { error } rather than a throw, and jsonb hands object
   keys back in its own order. Sign-out follows auth-js 2.117 (what the site loads):
   when the server cannot be reached it still removes the session, then returns the
   error; `server.oldAuth` gives the older behaviour of keeping the session.

   The scenarios are the ways a signed-in reader could lose progress: a tab opened
   before another device synced, two devices writing at once, a reset being undone or
   wiping later work, a tab that missed a sign-out in another tab, a sync finishing
   after someone else signed in, and signing out while the last upload fails.

   Usage: node tools/game/sync.test.js [--only=<substring>] */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "../..");
const SRC = fs.readFileSync(path.join(ROOT, "assets/account.js"), "utf8");
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

class Server {
  constructor() {
    this.rows = {};          /* user_id -> row, updated_at kept as ms */
    this.attempts = [];
    this.profiles = {};
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
  remember(uid) {
    this.storage.set(SESSION_KEY, JSON.stringify({ user: { id: uid, email: uid + "@example.com" } }));
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
  open() {
    if (this.page) this.page.close();
    this.page = new Page(this);
    return this.page;
  }
}

class Page {
  constructor(device) {
    this.device = device;
    this.closed = false;
    const page = this, storage = device.storage, server = device.server;
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
      console, URL, Blob: function () {},
      BM_CONFIG: { supabaseUrl: "https://" + REF + ".supabase.co", supabaseAnonKey: "sb_publishable_test" },
      supabase: { createClient: () => client },
      BMStore: Store,
      BMSite: { rootPrefix: () => "", escapeHtml: (s) => String(s) },
      location: { hash: "", search: "", href: "http://localhost:8000/parts/1-algebra/01-numbers.html" },
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
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: (t, fn) => { (docEvents[t] = docEvents[t] || []).push(fn); },
        head: { appendChild() {} },
        createElement: () => ({})
      }
    };
    win.window = win;
    vm.createContext(win);
    vm.runInContext(SRC, win, { filename: "assets/account.js" });
    this.Account = win.BMAccount;
    this.Store = Store;
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
