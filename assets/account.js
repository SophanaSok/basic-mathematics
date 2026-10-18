/* ===========================================================================
   Basic Mathematics — accounts and sync
   Optional. The site saves everything locally (site.js); this file listens on
   BMStore and, for a signed-in reader, keeps a copy in Supabase so progress
   follows them between devices. Signed out, or with assets/config.js left empty,
   it loads nothing and sends nothing.

   Sync is a merge, never an overwrite: solved exercises and finished missions are
   unions, XP is the larger number for each day, lesson position is the furthest
   reached, and the game record merges field by field (mergeGame). Merging the
   same two states in either order gives the same result. A write only lands on the
   version of the account row this page last saw; if another device has saved since,
   the page reads the row, merges, and tries again (sync below).

   A later version of the site may save fields this one has never heard of. They are
   carried through every merge and written back as they came (later, carryOver). A row
   whose data is marked as a newer shape than this file understands is merged into
   this browser but never written (SCHEMA), and only the columns the server has are
   sent (lacks). The merge itself, with those rules, is src/sync/merge.ts, which this
   file finds on window.BMMerge.
   =========================================================================== */
(function () {
  "use strict";

  var Store = window.BMStore, Site = window.BMSite;
  if (!Store || !Site) return;
  /* BMMerge (src/ui/core.ts, imported by every entry ahead of site.js) holds the merge
     (src/sync/merge.ts): every rule for two copies of the progress, the canonical JSON and
     the newest shape of the data this version may write. Without it this file does
     nothing: no sign-in, no sync, no account page. */
  var M = window.BMMerge;
  if (!M) { if (window.console) console.error("[BM] BMMerge missing"); return; }
  var obj = M.obj, str = M.str, canon = M.canon, merge = M.merge, SCHEMA = M.SCHEMA, versionOf = M.versionOf;

  /* the learning log (src/ui/events.ts) may be absent on a page; never let it break sync */
  function events(fn, arg) { var E = window.BMEvents; if (E && typeof E[fn] === "function") { try { E[fn](arg); } catch (e) { if (window.console) console.warn("[BM] events", e); } } }

  var cfg = window.BM_CONFIG || {};
  var configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  /* Sign-in services this site can offer. Which of them are shown is the `providers` list
     in assets/config.js; an id that is not in this table is ignored. Microsoft passes the
     email address on only when asked for it. */
  var PROVIDERS = {
    google: { label: "Google" },
    github: { label: "GitHub" },
    discord: { label: "Discord" },
    facebook: { label: "Facebook" },
    azure: { label: "Microsoft", scopes: "email" }
  };
  function known(id) { return typeof id === "string" && Object.prototype.hasOwnProperty.call(PROVIDERS, id); }
  function providerList(c) {
    var out = [];
    (Array.isArray(c.providers) ? c.providers : []).forEach(function (id) {
      if (!known(id)) {
        if (window.console) window.console.warn("assets/config.js: unknown sign-in provider " + JSON.stringify(id));
      } else if (out.indexOf(id) < 0) {
        out.push(id);
      }
    });
    return out;
  }
  var providers = configured ? providerList(cfg) : [];
  /* false while the project cannot send email to the public: the two buttons that work
     only through an email (the sign-in link, the password reset) are left out */
  var mail = cfg.emailDelivery !== false;
  /* The Daily board's kill switch (BM_CONFIG.board "off", read by src/core/config.ts): no
     switch on the account page, and setBoard sends nothing. Without the settings reader
     the board is off, as arena.js has it. */
  var boardOn = configured && !!(window.BMCore && window.BMCore.config) && window.BMCore.config.readConfig(cfg).board === "on";
  /* this browser's note of the day's board (arena.js keeps it in bm.run.v1.board): `all`
     forgets it whatever it holds, otherwise only a refusal noted before the reader joined */
  function forgetBoard(all) {
    if (!Store.keys.run) return;
    var r = obj(Store.read(Store.keys.run, {}));
    if (!r.board || (!all && obj(r.board).sent)) return;
    delete r.board;
    Store.write(Store.keys.run, r, true);
  }
  var META_KEY = "bm.sync.v1";
  /* "game" and "diag" only where site.js knows the key, so an older site.js still syncs cleanly */
  var FIELDS = ["progress", "play", "attempts", "activity", "lesson", "last", "game", "diag"].filter(function (f) {
    return !!Store.keys[f];
  });

  /* ----------------------------------------------------------- local state -- */

  function readLocal() {
    var out = {};
    FIELDS.forEach(function (f) { out[f] = Store.read(Store.keys[f], f === "last" ? null : {}); });
    return out;
  }
  /* the device-only game scratchpad (combo meter, what has been announced) goes with
     the progress it describes */
  function clearRun() {
    if (Store.keys.run) Store.write(Store.keys.run, {}, true);
  }
  function writeLocal(state, dropRun) {
    if (dropRun) clearRun();
    FIELDS.forEach(function (f) { Store.write(Store.keys[f], state[f], true); });
    Store.emit({ type: "sync" });
  }
  /* keepAcct: the account stays signed in (a switch of learner), so the log's device record
     keeps its uid; the device id is redrawn either way */
  function clearLocal(keepAcct) {
    var empty = {};
    FIELDS.forEach(function (f) { empty[f] = f === "last" ? null : {}; });
    if (keepAcct) events("clear"); else events("clear", true);
    writeLocal(empty, true);
  }
  function meta() { return obj(Store.read(META_KEY, {})); }
  function setMeta(fn) {
    var m = meta();
    fn(m);
    Store.write(META_KEY, m, true);
  }

  /* --------------------------------------------------------------- client -- */

  var client = null, loading = null;

  function projectRef() {
    try { return new URL(cfg.supabaseUrl).hostname.split(".")[0]; } catch (e) { return ""; }
  }
  /* A signed-out visitor should not download the SDK on every page: look for the
     session Supabase leaves in localStorage before fetching anything. */
  function hasStoredSession() {
    try { return !!window.localStorage.getItem("sb-" + projectRef() + "-auth-token"); }
    catch (e) { return false; }
  }

  /* The SDK is supabase-js from npm, bundled as a chunk of its own (src/vendor/supabase.js,
     dist/bundle/supabase.js) that only this import() fetches, so a page downloads it when a
     client is first wanted and never otherwise. A window.supabase that is already there is
     used as it is: the tests put their stand-in there, and so could a page that loaded the
     library another way. A fetch that fails leaves `loading` clear, so the next call tries
     again, with the same message as before. */
  function load() {
    if (!configured) return Promise.reject(new Error("Accounts are not configured."));
    if (client) return Promise.resolve(client);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      function make(sdk) {
        try {
          client = sdk.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
          resolve(client);
        } catch (e) { reject(e); }
      }
      if (window.supabase && window.supabase.createClient) return make(window.supabase);
      import("../src/vendor/supabase.js").then(make, function () {
        loading = null;
        reject(new Error("Could not reach the account service."));
      });
    });
    return loading;
  }

  /* ----------------------------------------------------------------- sync -- */

  var user = null, status = { state: "off", at: null, error: null };
  /* The reader every sync belongs to: the learner whose progress this browser holds. Its id keys
     the data (user_state, the log, the cursors, what is set aside); `acct` is the signed-in
     account that owns it. For the account's own learner the two are the same. A managed learner
     is chosen in the sync meta (`learner`, with `acct` saying whose it is) and counts only
     while that account is the one signed in. */
  function reader() {
    if (!user) return null;
    var m = meta(), l = m.learner;
    var managed = typeof l === "string" && l && l !== user.id && m.acct === user.id;
    var out = {};
    Object.keys(user).forEach(function (k) { out[k] = user[k]; });
    out.id = managed ? l : user.id;
    out.acct = user.id;
    return out;
  }
  /* the learner this page runs as (null for the account's own), and a second tab's switch */
  var runsAs = null, stale = false;
  /* the managed learner's name as the switch saved it, or "" */
  function learnerNameOf() { var n = meta().learnerName; return typeof n === "string" ? n.trim().slice(0, 40) : ""; }
  function learnerOf(u) { return u && u.id !== u.acct ? u.id : null; }
  function staleError() { return new Error("Reload: a different learner was chosen in another tab."); }
  var pushTimer = null, watchers = [];
  /* The account row as this page last read or wrote it: undefined until then, null
     when the account has no row yet, otherwise its updated_at exactly as the server
     sent it back. `owned` is set once this page has claimed this browser's progress
     for the reader, so a sign-out in another tab can be noticed. `ahead` is set while
     the reader's data is in a newer shape than this file may write (SCHEMA). */
  var seen, owned = false, ahead = false;
  /* one sync at a time per page; each waits for the one before to settle */
  var chain = Promise.resolve();
  function serial(fn) {
    var run = chain.then(fn, fn);
    chain = run.then(noop, noop);
    return run;
  }
  function noop() {}

  function setStatus(state, error) {
    status = { state: state, at: state === "synced" ? new Date() : status.at, error: error || null, log: evFull ? "full" : "" };
    notify();
  }
  function notify() {
    watchers.slice().forEach(function (fn) { try { fn(Account); } catch (e) { /* a watcher's own problem */ } });
  }

  /* Progress that could not be saved when its reader signed out, set aside by reader:
     { <user id>: { email, via, resetAt, state, at } }. It is merged in the next time that
     reader signs in on this browser, and never shown to anyone else. */
  var PENDING_KEY = "bm.sync.pending.v1";
  function pending() { return obj(Store.read(PENDING_KEY, {})); }
  function setPending(fn) {
    var p = pending();
    fn(p);
    Store.write(PENDING_KEY, p, true);
  }
  function setAside(u) {
    var m = meta(), state = readLocal();
    setPending(function (p) {
      var old = obj(p[u.id]);
      p[u.id] = {
        email: u.email || "",
        via: methodIds(u),
        resetAt: Math.max(Number(m.resetAt) || 0, Number(old.resetAt) || 0),
        state: old.state ? merge(state, old.state) : state,
        at: Date.now()
      };
    });
  }

  /* Data marked newer than the shape this version understands (BMMerge.SCHEMA, the game
     record's `v`; src/sync/merge.ts) is still merged into this browser, so the reader
     keeps working with everything they have, but the page then writes nothing to the
     account, neither the row nor the learning log's batches (`ahead`), and the account page asks for
     a reload, which fetches the newer site. */

  /* Columns of user_state the server turned out not to have. They are not sent, so a
     project whose tables are older than this file still syncs the rest; what they would
     hold stays in this browser. Learned from the row a read returns, which names every
     column the table has, and from a save the server refuses for naming a column it
     lacks (a new account has no row to read). */
  var lacks = {};
  function learn(remote) {
    FIELDS.forEach(function (f) {
      if (Object.prototype.hasOwnProperty.call(remote, f)) delete lacks[f];
      else lacks[f] = true;
    });
  }
  /* the column a refused save names: PostgREST's "Could not find the 'game' column of
     'user_state' in the schema cache" (PGRST204), or Postgres's own 42703 */
  function missingColumn(e) {
    if (e.code !== "PGRST204" && e.code !== "42703") return "";
    var m = /'([^']+)' column/.exec(e.message || "") || /column "([^"]+)"/.exec(e.message || "");
    return m ? m[1] : "";
  }
  /* PostgREST's PGRST205, or Postgres's own 42P01: there is no such table */
  function noTable(e) { return e.code === "PGRST205" || e.code === "42P01"; }
  /* the same, and PGRST202 / 42883: there is no such function (events_put) */
  function noFunction(e) { return noTable(e) || e.code === "PGRST202" || e.code === "42883"; }

  function row(u, state, resetAt) {
    var out = { user_id: u.id, reset_at: resetAt || 0, updated_at: nextStamp() };
    FIELDS.forEach(function (f) {
      if (!lacks[f]) out[f] = state[f] || (f === "last" ? null : {});
    });
    return out;
  }
  /* always later than the version being replaced, even if this device's clock is behind */
  function nextStamp() {
    var prev = seen ? Date.parse(seen) : 0;
    return new Date(Math.max(Date.now(), (isFinite(prev) ? prev : 0) + 1)).toISOString();
  }

  /* Every step of a sync belongs to the reader it started for. If the session has
     ended (signed out here or in another tab) or someone else has signed in since, it
     stops rather than read as nobody or write into the wrong account. */
  function sameReader(u) {
    if (!user || user.id !== u.acct) return false;
    var r = reader();
    return !!r && r.id === u.id;
  }
  function stillSignedIn(u) {
    if (!sameReader(u)) throw new Error("The signed-in account changed.");
  }
  function confirmSession(u) {
    return client.auth.getSession().then(function (res) {
      var s = res && res.data ? res.data.session : null;
      if (!s || !s.user || s.user.id !== u.acct) throw new Error("You are no longer signed in on this page.");
      stillSignedIn(u);
    });
  }
  /* a page that claimed this browser's progress, whose reader has since been forgotten
     by a sign-out in another tab, must not read or write it any more */
  function stillOwner(u) {
    if (owned && meta().user !== u.id) throw new Error("You have been signed out in another tab.");
  }

  /* Save a state over the version of the row this page last saw. Resolves true when it
     landed, false when nothing was written: another device got there first, or the data
     is in a newer shape than this file may write. */
  function write(u, state, resetAt) {
    if (versionOf(state) > SCHEMA) ahead = true;
    if (ahead) return Promise.resolve(false);
    var data = row(u, state, resetAt);
    var req = seen === null
      ? client.from("user_state").insert(data).select("updated_at")
      : client.from("user_state").update(data).eq("user_id", u.id).eq("updated_at", seen).select("updated_at");
    return req.then(function (res) {
      if (res.error) {
        if (seen === null && res.error.code === "23505") return false;   /* another device created the row first */
        /* a column this server does not have: leave it out and save the rest */
        var col = missingColumn(res.error);
        if (FIELDS.indexOf(col) > -1 && !lacks[col]) { lacks[col] = true; return write(u, state, resetAt); }
        throw res.error;
      }
      if (!res.data || !res.data.length) return false;  /* the row has moved on since this page read it */
      if (sameReader(u)) seen = res.data[0].updated_at;
      return true;
    });
  }

  /* Read the account row, merge it into this browser, and save the result if the row
     lacks anything, trying again if another device saves in between. Resolves true once
     the account holds everything this browser does, false when the result was left
     unwritten because the data is in a newer shape than this file may write. */
  function sync(u, tries) {
    return confirmSession(u).then(function () {
      return client.from("user_state").select("*").eq("user_id", u.id).maybeSingle();
    }).then(function (res) {
      if (res.error) throw res.error;
      stillSignedIn(u);
      stillOwner(u);
      var remote = res.data, m = meta(), local = readLocal(), dropped = false, differentAccount = !!(m.user && m.user !== u.id);
      var aside = obj(pending()[u.id]), hasAside = !!aside.state;
      if (remote) learn(remote);
      var remoteReset = remote ? Number(remote.reset_at) || 0 : 0;
      var mine = m.user === u.id ? Number(m.resetAt) || 0 : 0;
      var asideReset = hasAside ? Number(aside.resetAt) || 0 : 0;
      /* progress left by a different account on this browser is not this reader's, and
         neither are its placement-check takes (decision 0003) */
      if (m.user && m.user !== u.id) { local = {}; dropped = true; events("clear"); }
      /* a reset made on another device wins over what this browser still remembers of the
         same account; progress made before ever signing in is kept and merged */
      /* a reset keeps the placement-check takes (decision 0003): without this a
         take finished elsewhere would be emptied here too */
      if (m.user === u.id && remoteReset > mine) { local = { diag: local.diag }; dropped = true; events("clear"); }
      /* the same for what was set aside: a newer reset drops its progress, not its takes */
      var kept = hasAside && !(remoteReset > asideReset) ? aside.state : { diag: obj(aside.state).diag };
      /* A reset made on this browser that the row has not heard of. If nothing has been
         saved since it, the row's state is from before the reset and is left out. If
         another device has saved since, its work is kept and this reset is given up:
         losing a reset can be undone by pressing it again, losing work cannot. */
      var known = Math.max(mine, asideReset), base = remote || {}, resetAt = remoteReset;
      if (known > remoteReset) {
        var written = remote ? Date.parse(remote.updated_at) : 0;
        /* the row's takes survive this reset too: a tab that never pulled them must not
           drop them from the account (decision 0003) */
        if (!(written >= known)) { base = { diag: (remote || {}).diag }; resetAt = known; }
      }
      var merged = merge(merge(local, kept), base);
      /* only now has this page seen the row: had the merge failed, the next save would
         read and merge again instead of writing this browser's copy over it */
      seen = remote ? remote.updated_at : null;
      ahead = versionOf(remote) > SCHEMA || versionOf(merged) > SCHEMA;
      /* another account's cursors are not this reader's either: its log was cleared above */
      setMeta(function (x) { x.user = u.id; x.resetAt = resetAt; if (differentAccount) x.ev = {}; });
      owned = true;
      writeLocal(merged, dropped);
      function done() {
        if (hasAside) setPending(function (p) { delete p[u.id]; });
        return true;
      }
      var same = remote && remoteReset === resetAt && FIELDS.every(function (f) {
        return lacks[f] || canon(merged[f] || null) === canon(remote[f] || null);
      });
      if (same) { done(); return syncEvents(u).then(function () { return true; }); }
      /* a newer shape: merged into this browser above and not written, and what was set
         aside stays set aside */
      if (ahead) return false;
      return write(u, merged, resetAt).then(function (ok) {
        if (ok) { done(); return syncEvents(u).then(function () { return true; }); }
        if (tries >= 3) throw new Error("Another device kept saving at the same moment. Try Sync now.");
        return sync(u, tries + 1);
      });
    });
  }

  /* ---------------------------------------------------- the learning log -- */

  /* The learning log (src/ui/events.ts, entries in bm.events.v1) syncs through two calls of
     its own, never through the account row: events_put, which takes a batch and answers
     with what it did, and a select of the events table. It is an extra, as the attempt log
     was: progress syncs whatever happens here, and every failure is held back, not thrown.
     The page learns the log through window.BMEvents (this file cannot import its keys).

     Three things are kept per reader in the sync meta (meta().ev[uid]): `seq`, the cursor
     of the pull (the largest seq taken from the account); `epoch`, the last epoch the
     account told us (it moves when the account's log is reset or truncated); and `init`,
     true once this browser's whole log was queued for this reader. The outbox is the
     recorder's list of ids not yet sent (BMEvents.outbox); it is the record of what is
     owed, so a page that closes mid-send loses nothing.

     The handshake (an empty batch) asks for the epoch and seq. A changed epoch never clears
     local events: what moves the epoch is a reset (the row's reset_at, which sync() has
     already acted on) or the operator's truncate, after which sending again is wanted. So
     the page adopts the epoch, pulls everything again and queues everything it holds. */
  var LOG_RETRY = 5 * 60 * 1000, evAfter = 0, evChunk = 500, evFull = false, evAhead = false, evResetting = false, evAbsorbing = false;
  var EV_CHUNKS = 20, EV_PAGE = 1000, EV_DAY = 24 * 60 * 60 * 1000;
  function evHeld() { return Date.now() < evAfter; }
  /* learn.events "off" is the kill switch, read when it is used: no handshake, pull or send */
  function evOn() {
    var C = window.BMCore && window.BMCore.config;
    return !C || C.readConfig(window.BM_CONFIG).learn.events !== "off";
  }
  function evUsable() { return evOn() && !evHeld(); }
  function evCursor(id) {
    var k = obj(obj(meta().ev)[id]);
    return { seq: Number(k.seq) || 0, epoch: typeof k.epoch === "number" ? k.epoch : null, init: k.init === true };
  }
  function evSave(id, k) {
    setMeta(function (m) {
      var e = obj(m.ev);
      e[id] = { seq: k.seq, epoch: k.epoch, init: k.init };
      if (k.epoch === null) delete e[id].epoch;
      m.ev = e;
    });
  }
  function nextMidnight() {
    var d = new Date(Date.now());
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) + 5000;
  }
  /* a hint the server gave instead of an answer holds the channel, as sendEvents does */
  function evHold(hint) {
    if (hint === "bm-quota" || hint === "bm-calls") evAfter = nextMidnight();
    else if (hint === "bm-full") { evAfter = Date.now() + EV_DAY; evFull = true; notify(); }
    else evAfter = Date.now() + LOG_RETRY;
  }
  /* the self path sends exactly the two arguments the deployed site always has */
  function putArgs(u, batch, epoch) {
    var a = { batch: batch, epoch: epoch };
    if (u.id !== u.acct) a.learner = u.id;
    return a;
  }
  function pullRow(r) {
    var P = [r.t, r.d, r.src, r.sec, r.ref, r.k, r.ok, r.n, r.r, r.f];
    if (r.x !== null && r.x !== undefined) P.push(r.x);
    return P;
  }
  /* Handshake, pull, queue the log once, then send. Never changes the sync's result. */
  function syncEvents(u) {
    var E = window.BMEvents;
    if (!E || !evUsable()) return Promise.resolve();
    var k = evCursor(u.id);
    return Promise.resolve().then(function () {
      stillSignedIn(u);
      return client.rpc("events_put", putArgs(u, [], k.epoch === null ? 0 : k.epoch));
    }).then(function (res) {
      if (res.error) { if (noFunction(res.error)) evAfter = Date.now() + LOG_RETRY; else throw res.error; return false; }
      var d = res.data;
      if (d && d.hint) { evHold(d.hint); return false; }
      if (!d || typeof d.epoch !== "number") { evAfter = Date.now() + LOG_RETRY; return false; }
      /* a cursor above the server's (a hand-edited or restored note) starts over too */
      if (d.epoch !== k.epoch || (typeof d.seq === "number" && d.seq < k.seq)) { k.epoch = d.epoch; k.seq = 0; k.init = false; evSave(u.id, k); }
      return true;
    }).then(function (ok) {
      if (!ok) return false;
      /* queue what this browser holds before the pull, so rows the pull brings in are not
         sent straight back (the server would only answer that it already has them) */
      stillSignedIn(u);
      if (!k.init) { E.enqueue(Object.keys(E.all())); k.init = true; evSave(u.id, k); }
      return pullEvents(u, k).then(function () { stillSignedIn(u); return true; });
    }).then(function (ok) {
      return ok ? sendEvents(u) : null;
    }).then(noop, function (e) { if (window.console) console.warn("[BM] events", e); });
  }
  function pullEvents(u, k) {
    var E = window.BMEvents;
    /* at most 30 pages: 30,000 rows is above the account's 25,000 row cap, so a longer
       answer is a server that is not behaving */
    var pages = 0;
    function page() {
      stillSignedIn(u);
      pages++;
      return client.from("events").select("id,v,t,d,src,sec,ref,k,ok,n,r,f,x,seq").eq("user_id", u.id).gt("seq", k.seq).order("seq").limit(EV_PAGE).then(function (res) {
        if (res.error) throw res.error;
        stillSignedIn(u);
        var rows = Array.isArray(res.data) ? res.data : [], ev = {}, v = 1, top = k.seq;
        rows.forEach(function (r) {
          ev[r.id] = pullRow(r);
          if (typeof r.v === "number" && r.v % 1 === 0 && r.v >= 1 && r.v <= 99 && r.v > v) v = r.v;
          if (Number(r.seq) > top) top = Number(r.seq);
        });
        var stop = false;
        if (rows.length) {
          evAbsorbing = true;
          var took;
          try { took = E.absorb({ v: v, ev: ev }); } finally { evAbsorbing = false; }
          evAhead = took === true;
          /* a log in a later format (true): the rows after it are left on the server, and the
             cursor stays behind them for the site that understands the format. A write that
             failed (null): the same, for the next page load with room to store them */
          if (took !== false) stop = true; else { k.seq = top; evSave(u.id, k); }
        }
        return stop || rows.length < EV_PAGE || pages >= 30 ? null : page();
      });
    }
    return page().then(function () { evAhead = E.ahead(); });
  }
  /* Send the outbox in chunks. Resolves whatever happened; never rejects. */
  function sendEvents(u) {
    var E = window.BMEvents, k = evCursor(u.id), chunks = 0, reset = false, later = {};
    function stop() { return null; }
    function next() {
      if (!E || !evUsable() || ahead || evAhead || !k.init || k.epoch === null) return null;
      /* entries the server called future stay queued, but not for this call: sending them
         again at once would only burn the day's calls */
      var out = E.outbox().filter(function (id) { return !later[id]; });
      if (!out.length || chunks >= EV_CHUNKS) return null;
      chunks++;
      stillSignedIn(u);
      var ids = out.slice(0, evChunk), pay = E.payloads(ids), batch = [], gone = [];
      ids.forEach(function (id) { if (pay[id]) batch.push({ id: id, p: pay[id] }); else gone.push(id); });
      if (gone.length) E.dequeue(gone);
      if (!batch.length) return next();
      return client.rpc("events_put", putArgs(u, batch, k.epoch)).then(function (res) {
        if (user && !sameReader(u)) return stop();
        if (res.error) {
          if (noFunction(res.error)) evAfter = Date.now() + LOG_RETRY;
          else if (window.console) console.warn("[BM] events", res.error);
          return stop();
        }
        var d = res.data || {}, hint = d.hint;
        if (hint === "bm-reset") {
          if (reset || evResetting) return stop();
          reset = true;
          evResetting = true;
          /* the account's epoch moved: re-handshake, re-pull and re-queue, which ends in a send */
          return sync(u, 0).then(function () { evResetting = false; }, function (e) { evResetting = false; throw e; }).then(stop);
        }
        if (hint === "bm-quota" || hint === "bm-calls") { evAfter = nextMidnight(); return stop(); }
        if (hint === "bm-full") { evAfter = Date.now() + EV_DAY; evFull = true; notify(); return stop(); }
        if (hint === "bm-batch") { evChunk = Math.max(1, Math.floor(evChunk / 2)); return stop(); }
        if (hint) { evAfter = Date.now() + LOG_RETRY; return stop(); }
        if (!Array.isArray(d.refused)) { evAfter = Date.now() + LOG_RETRY; return stop(); }
        var keep = {};
        d.refused.forEach(function (r) { if (r && r.why === "future") keep[r.id] = later[r.id] = true; });
        E.dequeue(batch.map(function (b) { return b.id; }).filter(function (id) { return !keep[id]; }));
        if (evFull) { evFull = false; notify(); }
        return next();
      });
    }
    return Promise.resolve().then(next).then(noop, function (e) { if (window.console) console.warn("[BM] events", e); });
  }

  /* Both resolve true when this browser's progress is in the account, false when it is
     not: it could not be saved (the reason is in status.error), or this file may not
     write it (status.state is "reload"). Neither ever rejects. */
  function pull() {
    var u = reader();
    return serial(function () {
      if (stale) { setStatus("reload", staleError()); return false; }
      if (!u || !sameReader(u)) return false;
      setStatus("syncing");
      return sync(u, 0).then(function (ok) { setStatus(ahead ? "reload" : "synced"); return ok; },
        function (e) { setStatus("error", e); return false; });
    });
  }

  function push() {
    clearTimeout(pushTimer);
    pushTimer = null;
    if (!client || !user) return Promise.resolve(false);
    var u = reader();
    return serial(function () {
      if (stale) { setStatus("reload", staleError()); return false; }
      if (!sameReader(u)) return false;
      setStatus("syncing");
      /* a page that has not read the row yet merges with it before writing anything */
      var save = seen === undefined ? sync(u, 0) : confirmSession(u).then(function () {
        /* this browser first, then whose it is: a sign-out in another tab forgets the
           reader before it clears the progress, so a stale read is caught here */
        var state = readLocal();
        stillOwner(u);
        return write(u, state, Number(meta().resetAt) || 0);
      }).then(function (ok) { return ok || sync(u, 0); });
      /* the learning log waits for the save, which is what finds out whether this page may write */
      function log() {
        if (seen === undefined || ahead) return null;
        return sendEvents(u);
      }
      var sent = save.then(log, log);
      return sent.then(noop, noop).then(function () {
        return save;
      }).then(function (r) { setStatus(ahead ? "reload" : "synced"); return r; }, function (e) {
        setStatus("error", e);
        /* whether progress was saved is what the caller needs */
        return save.then(null, function () { return false; });
      });
    });
  }
  function schedule() {
    if (!user || pushTimer) return;
    pushTimer = setTimeout(push, 1500);
  }

  /* Leaving the page: write at once instead of waiting behind a sync in flight. The
     write is conditional, so it cannot overwrite anything newer; if it loses, the
     progress is still in this browser and the next page load merges it. */
  function flush() {
    if (!pushTimer) return;
    clearTimeout(pushTimer);
    pushTimer = null;
    if (!client || !user || seen === undefined) return;
    if (stale) { setStatus("reload", staleError()); return; }
    var u = reader(), state = readLocal();
    if (!sameReader(u) || meta().user !== u.id) return;
    write(u, state, Number(meta().resetAt) || 0).then(noop, noop);
    /* bounded, and whatever it cannot send stays in the outbox for the next page */
    if (!ahead) sendEvents(u);
  }

  Store.on(function (c) {
    if (!user) return;
    if (c.type === "state") {
      var synced = FIELDS.some(function (f) { return Store.keys[f] === c.key; });
      if (synced) schedule();
    } else if (c.type === "event") {
      /* the recorder stored an entry: it goes with the next save (what the log takes in from
         the account, absorbed below, announces itself too and is not a reason to save) */
      var E = window.BMEvents;
      if (!evAbsorbing && E && typeof E.outbox === "function" && E.outbox().length) schedule();
    } else if (c.type === "reset") {
      /* stamp the reset so other devices drop their copies instead of merging them back;
         always later than the last reset this browser knows of, whatever its clock says */
      setMeta(function (m) { m.resetAt = Math.max(Date.now(), (Number(m.resetAt) || 0) + 1); });
      /* the reset wipes the local log, so a log that was ahead of this code is gone: sending resumes */
      evAhead = false;
      /* the recorder has just emptied the local log, so there is nothing left to queue (init
         stays true) and the cursor starts over: if this reset is later given up (sync(), when
         another device saved after it) the account's entries must be pulled back */
      setMeta(function (m) {
        if (!user) return;
        var rid = reader().id, e = obj(m.ev), cur = obj(e[rid]);
        e[rid] = { seq: 0, init: true };
        if (typeof cur.epoch === "number") e[rid].epoch = cur.epoch;
        m.ev = e;
      });
      push();
    }
  });
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush();
  });

  /* A managed learner is the account's own only if the learners table says so (its select
     policy shows a guardian their own). Resolves false only on a definitive answer: no row
     (deleted on another device, another account's, or a note edited by hand) or a malformed
     id (22P02). Any other error is not a verdict and counts as fine; the sync that follows
     reports it. */
  function learnerExists(id) {
    return client.from("learners").select("id").eq("id", id).maybeSingle().then(function (res) {
      if (res && res.error) return res.error.code === "22P02" ? false : true;
      return !!(res && res.data);
    });
  }
  function sameAccount(a) { return !!(user && a && user.id === a.id); }
  /* the learner is gone: its copy in this browser belongs to nobody who is signed in, and is
     never merged into the account's own progress */
  function dropLearner(u) {
    clearLocal(true);
    setMeta(function (m) { delete m.learner; delete m.learnerName; delete m.acct; delete m.user; delete m.resetAt; m.ev = {}; });
    /* nothing will ever merge what was set aside for a learner that is gone */
    setPending(function (p) { delete p[u.id]; });
    runsAs = null;
    stale = false;
    seen = undefined; owned = false; ahead = false;
    evAhead = false; evFull = false; evAfter = 0; evChunk = 500;
    drawButton();
  }
  /* verify the active managed learner (page load); resolves once the reader is settled */
  function settleReader(captured) {
    var u = reader();
    if (!u || !learnerOf(u)) return Promise.resolve();
    return serial(function () {
      if (!sameAccount(captured)) return null;
      var now = reader();
      if (!now || now.id !== u.id) return null;
      return learnerExists(u.id).then(function (ok) { if (!ok && sameAccount(captured) && sameReader(u)) dropLearner(u); });
    }).then(noop, noop);
  }

  /* another tab chose a different learner: this page's data is no longer the browser's (T16) */
  window.addEventListener("storage", function (e) {
    if (e && e.key && e.key !== META_KEY) return;
    if (!user) return;
    var m = meta(), l = m.acct === user.id && typeof m.learner === "string" ? m.learner : null;
    if (l === user.id) l = null;
    if (l !== runsAs && !stale) {
      stale = true;
      setStatus("reload", staleError());
      /* this tab's page and recorder would keep writing into the new learner's store: start over as the new learner */
      if (window.location && typeof window.location.reload === "function") window.location.reload();
    }
  });

  function onSession(session) {
    var next = session && session.user ? session.user : null;
    var changed = (next && next.id) !== (user && user.id);
    /* a learner left by another account is not this account's (T6) */
    if (next) {
      var held = meta();
      if ((held.learner || held.acct) && held.acct !== next.id) setMeta(function (m) { delete m.learner; delete m.learnerName; delete m.acct; });
    }
    user = next;
    /* what this page knew of the previous reader's row and log is not this reader's */
    if (changed) {
      seen = undefined;
      owned = false;
      ahead = false;
      evAhead = false;
      evFull = false; evAfter = 0; evChunk = 500;
      clearTimeout(pushTimer);
      pushTimer = null;
    }
    if (!user) setStatus("off");
    drawButton();
    notify();
    if (user && changed) {
      var captured = { id: user.id }, first = reader();
      runsAs = learnerOf(first);
      stale = false;
      if (!runsAs) { events("stamp", first.id); pull(); }
      else {
        settleReader(captured).then(function () {
          if (!sameAccount(captured)) return;
          events("stamp", reader().id);
          pull();
        });
      }
    }
  }

  function start() {
    return load().then(function (c) {
      c.auth.onAuthStateChange(function (event, session) {
        if (event === "PASSWORD_RECOVERY") Account.recovering = true;
        /* never call back into Supabase from inside its own auth callback */
        setTimeout(function () { onSession(session); }, 0);
      });
      return c.auth.getSession().then(function (res) {
        onSession(res.data ? res.data.session : null);
        return c;
      });
    });
  }

  /* ------------------------------------------------------------ public API -- */

  function pageUrl(file) {
    return new URL(Site.rootPrefix() + file, window.location.href).href.split("#")[0];
  }
  function unwrap(res) {
    if (res && res.error) throw res.error;
    return res ? res.data : null;
  }
  /* what to call the reader: not every sign-in service passes an email address on */
  function label(u) {
    var md = obj(u && u.user_metadata);
    return str(u && u.email) || str(md.full_name) || str(md.name) || str(md.user_name) || str(md.preferred_username);
  }
  /* the ways this account can sign in, as the account service records them */
  function methodIds(u) {
    var app = obj(u && u.app_metadata), out = [];
    var list = Array.isArray(app.providers) && app.providers.length ? app.providers
      : app.provider ? [app.provider]
      : (Array.isArray(u && u.identities) ? u.identities : []).map(function (i) { return obj(i).provider; });
    list.forEach(function (p) { if (typeof p === "string" && p && out.indexOf(p) < 0) out.push(p); });
    return out;
  }
  function methodNames(u) {
    return methodIds(u).map(function (id) { return known(id) ? PROVIDERS[id].label : id === "email" ? "your email address" : id; });
  }
  /* "A", "A and B", "A, B and C" */
  function listOf(names) {
    return names.length < 2 ? names.join("") : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  }
  /* A sign-in that did not go through comes back with the reason in the address, before
     or after the #: { error, code, description }, or null when the address carries none. */
  function urlError(href) {
    var q, h;
    try {
      var u = new URL(href);
      q = u.searchParams;
      h = new URL("http://x/?" + u.hash.replace(/^#/, "")).searchParams;
    } catch (e) { return null; }
    function get(k) { return q.get(k) || h.get(k) || ""; }
    var out = { error: get("error"), code: get("error_code"), description: get("error_description") };
    return out.error || out.code || out.description ? out : null;
  }

  var started = null;
  var Account = {
    configured: configured,
    hasSession: hasStoredSession,
    recovering: false,
    merge: M.merge,
    mergeGame: M.mergeGame,
    providers: providers.slice(),
    label: label,
    methods: methodIds,
    urlError: urlError,
    user: function () { return user; },
    /* the managed learner this browser is playing as, or null for the account's own */
    learner: function () { return runsAs; },
    /* the name the parent gave that learner, kept with the switch; null for the account's own */
    learnerName: function () { return runsAs ? learnerNameOf() : null; },
    /* Choose whose progress this browser holds: a managed learner's id, or null for the
       account's own. Nothing of the old learner may reach the new one, so it saves first and
       refuses ("Finish syncing first.") while anything is unsent; then the browser's copy is
       cleared and the new learner's is pulled. */
    switchLearner: function (id, name) {
      if (!user) return Promise.reject(new Error("Sign in first."));
      if (stale) return Promise.reject(staleError());
      if (id !== null && id !== undefined && (typeof id !== "string" || !id)) return Promise.reject(new Error("Unknown learner."));
      var target = id || null;
      if (target === user.id) target = null;
      return Account.ready().then(function (c) {
        var captured = { id: user.id };
        /* why nothing may be switched yet, or null; a log that is switched off still blocks while it holds unsent entries */
        function unsent() {
          var E = window.BMEvents, left = E && typeof E.outbox === "function" ? E.outbox() : [];
          /* a log that is switched off still sends what it queued once it is back on, so it blocks too */
          if (left.length && (!evOn() || evHeld() || evFull)) return new Error("The learning log cannot be sent right now; switching waits until it is.");
          if (pushTimer || left.length || status.state !== "synced") return new Error("Finish syncing first.");
          return null;
        }
        /* the reason goes on the status for the page to show, without moving the "synced at" time */
        function refuse(e) {
          if (e.message !== "Finish syncing first.") { status.error = e; notify(); }
          throw e;
        }
        return push().then(function () {
          return serial(function () {
            if (stale) throw staleError();
            if (!sameAccount(captured)) throw new Error("The signed-in account changed.");
            var why = unsent();
            if (why) refuse(why);
            var old = reader();
            if (learnerOf(old) === target) return null;
            return (target ? learnerExists(target) : Promise.resolve(true)).then(function (ok) {
              if (!ok) throw new Error("That learner is not on this account.");
              if (stale) throw staleError();
              if (!sameAccount(captured) || !sameReader(old)) throw new Error("The signed-in account changed.");
              var again = unsent();
              if (again) refuse(again);
              clearLocal(true);
              setMeta(function (m) {
                if (target) {
                  m.learner = target; m.acct = user.id;
                  var nm = typeof name === "string" ? name.trim().slice(0, 40) : "";
                  if (nm) m.learnerName = nm; else delete m.learnerName;
                } else { delete m.learner; delete m.learnerName; delete m.acct; }
                delete m.user; delete m.resetAt;
                m.ev = {};
              });
              runsAs = target;
              stale = false;
              seen = undefined; owned = false; ahead = false;
              evAhead = false; evFull = false; evAfter = 0; evChunk = 500;
              var r = reader();
              events("stamp", r.id);
              return sync(r, 0).then(function () { setStatus(ahead ? "reload" : "synced"); }, function (e) { setStatus("error", e); });
            });
          });
        }).then(function () { drawButton(); notify(); });
      });
    },
    status: function () { return { state: status.state, at: status.at, error: status.error, log: evFull ? "full" : "" }; },
    onChange: function (fn) { watchers.push(fn); },
    /* resolves once it is known whether anyone is signed in */
    ready: function () {
      if (!configured) return Promise.resolve(null);
      if (!started) started = start();
      return started;
    },
    signIn: function (email, password) {
      return Account.ready().then(function (c) {
        return c.auth.signInWithPassword({ email: email, password: password });
      }).then(unwrap);
    },
    signUp: function (email, password) {
      return Account.ready().then(function (c) {
        return c.auth.signUp({ email: email, password: password, options: { emailRedirectTo: pageUrl("account.html") } });
      }).then(unwrap);
    },
    emailLink: function (email) {
      return Account.ready().then(function (c) {
        return c.auth.signInWithOtp({ email: email, options: { emailRedirectTo: pageUrl("account.html") } });
      }).then(unwrap);
    },
    /* hands the reader over to one of the services in `providers`; they come back to the
       account page signed in, or with the reason it failed in the address (urlError) */
    oauth: function (id) {
      if (providers.indexOf(id) < 0) return Promise.reject(new Error("That way of signing in is not switched on for this site."));
      var options = { redirectTo: pageUrl("account.html") };
      if (PROVIDERS[id].scopes) options.scopes = PROVIDERS[id].scopes;
      return Account.ready().then(function (c) {
        return c.auth.signInWithOAuth({ provider: id, options: options });
      }).then(unwrap);
    },
    forgot: function (email) {
      return Account.ready().then(function (c) {
        return c.auth.resetPasswordForEmail(email, { redirectTo: pageUrl("account.html") });
      }).then(unwrap);
    },
    setPassword: function (password) {
      return Account.ready().then(function (c) { return c.auth.updateUser({ password: password }); })
        .then(unwrap).then(function () { Account.recovering = false; });
    },
    /* Saves first, then signs out this device only. Progress that reached the account is
       cleared from this browser, so none is left behind on a shared machine; progress that
       could not be saved is set aside for this reader (setAside) and cleared from view, and
       is saved the next time they sign in here. Whether the reader is signed out is read
       from the session afterwards, not from the call's error: the SDK removes the session
       even when the server cannot be reached. Resolves { saved, error }; rejects, with
       nothing removed, only when the reader is still signed in. */
    signOut: function () {
      var u = reader(), saved = false, why = null;
      if (!u) return Promise.resolve({ saved: true, error: null });
      return Account.ready().then(function (c) {
        return push().then(function (ok) {
          saved = ok;
          why = ok ? null : status.error;
          return c.auth.signOut({ scope: "local" });
        }).then(function (res) {
          return c.auth.getSession().then(function (s) {
            if (s && s.data && s.data.session) {
              throw new Error("Could not sign out (" + (res && res.error && res.error.message || "the account service did not answer") +
                "). You are still signed in, and nothing has been removed from this browser.");
            }
          });
        });
      }).then(function () {
        if (!saved) setAside(u);
        setMeta(function (m) { delete m.user; delete m.resetAt; delete m.learner; delete m.learnerName; delete m.acct; m.ev = {}; });
        runsAs = null;
        clearLocal();
        return { saved: saved, error: why };
      });
    },
    syncNow: function () {
      return Account.ready().then(function () { return user ? pull() : null; });
    },
    /* the display name and, with the board on, whether the reader joined it; a project
       whose profiles have no board column yet still gives the name */
    profile: function () {
      return Account.ready().then(function (c) {
        var read = function (cols) { return c.from("profiles").select(cols).eq("id", user.id).maybeSingle().then(unwrap); };
        if (!boardOn) return read("display_name");
        return read("display_name, board").then(null, function () { return read("display_name"); });
      });
    },
    /* the Daily board (decision 0006): on joins it (the profile's board column only, so the
       name is kept); off is leave_board(), which also deletes the reader's rows, and
       forgets this browser's note of today's place */
    boardOn: boardOn,
    setBoard: function (on) {
      if (!boardOn) return Promise.reject(new Error("The Daily board is switched off on this site."));
      if (!user) return Promise.reject(new Error("Sign in first."));
      var u = user;
      return Account.ready().then(function (c) {
        if (on) return c.from("profiles").upsert({ id: u.id, board: true }).then(unwrap).then(function () { forgetBoard(false); });
        return c.rpc("leave_board", {}).then(unwrap).then(function () { forgetBoard(true); });
      });
    },
    saveProfile: function (name) {
      return Account.ready().then(function (c) {
        return c.from("profiles").upsert({ id: user.id, display_name: name || null });
      }).then(unwrap);
    },
    /* removes the account and every row belonging to it; this browser keeps its local copy */
    deleteAccount: function () {
      return Account.ready().then(function (c) {
        return c.rpc("delete_my_account").then(unwrap).then(function () {
          setMeta(function (m) { delete m.user; delete m.resetAt; delete m.learner; delete m.learnerName; delete m.acct; m.ev = {}; });
          runsAs = null;
          events("clear", true);
          /* the account's place on the Daily board went with it */
          forgetBoard(true);
          return c.auth.signOut();
        });
      });
    },
    rpc: function (name, args) {
      return Account.ready().then(function (c) { return c.rpc(name, args || {}); }).then(unwrap);
    },
    exportData: function () {
      var data = readLocal();
      data.exported = new Date().toISOString();
      /* the learning log is not a FIELD (it syncs through events_put), so the explicit read */
      data.events = Store.read("bm.events.v1", null);
      if (user) {
        var md = obj(user.user_metadata);
        data.account = user.email || null;
        data.signInWith = methodIds(user);
        /* what a sign-in service passed on about the reader, as the account page describes it */
        data.profile = {
          name: str(md.full_name) || str(md.name) || null,
          username: str(md.user_name) || str(md.preferred_username) || null,
          picture: str(md.avatar_url) || str(md.picture) || null
        };
      }
      return data;
    }
  };
  window.BMAccount = Account;

  /* ---------------------------------------------------------- topbar button -- */

  /* The chip is in the top bar from the start (tools/lib/shell.js), "Sign in" in a box
     of its own width, so it can turn into the avatar without moving the HUD beside it.
     A copy of the site with no accounts takes it out. */
  function drawButton() {
    var nav = document.querySelector(".topbar nav");
    if (!nav) return;
    var a = nav.querySelector(".acct");
    if (!configured) { if (a) a.parentNode.removeChild(a); return; }
    if (!a) {
      a = document.createElement("a");
      a.className = "acct";
      a.href = Site.rootPrefix() + "account.html";
      nav.appendChild(a);
    }
    var rd = user ? reader() : null, playing = rd && learnerOf(rd) ? (learnerNameOf() || "this learner") : "";
    if (playing) {
      a.innerHTML = '<span class="avatar" aria-hidden="true">' + Site.escapeHtml(playing.charAt(0).toUpperCase()) + "</span>" +
        '<span class="acct-name" aria-hidden="true">' + Site.escapeHtml(playing) + "</span>" +
        '<span class="visually-hidden">Playing as ' + Site.escapeHtml(playing) + "</span>";
      a.setAttribute("title", "Playing as " + playing);
      a.setAttribute("data-in", "true");
      a.setAttribute("data-learner", "true");
    } else if (user) {
      a.removeAttribute("data-learner");
      var who = label(user), initial = (who || "?").charAt(0).toUpperCase();
      a.innerHTML = '<span class="avatar" aria-hidden="true">' + Site.escapeHtml(initial) + "</span>" +
        '<span class="visually-hidden">Your account</span>';
      a.setAttribute("title", "Signed in" + (who ? " as " + who : ""));
      a.setAttribute("data-in", "true");
    } else {
      a.textContent = "Sign in";
      a.removeAttribute("title");
      a.removeAttribute("data-in");
      a.removeAttribute("data-learner");
    }
  }

  drawButton();
  /* A sign-in that failed at the other service lands back on the account page with the
     reason in the address. It is taken out here, before the SDK reads the address, and
     shown by the account page below. */
  var returned = configured && document.querySelector("[data-account]") ? urlError(window.location.href) : null;
  if (returned) {
    try {
      var clean = new URL(window.location.href);
      ["error", "error_code", "error_description", "sb"].forEach(function (k) { clean.searchParams["delete"](k); });
      if (/(^#|&)(error|error_code|error_description)=/.test(clean.hash)) clean.hash = "";
      window.history.replaceState(null, "", clean.pathname + clean.search + clean.hash);
    } catch (e) { /* the message is still shown; the address just keeps its extras */ }
  }
  var needsSession = document.querySelector("[data-account], [data-owner-insights]") ||
    /[#&?](access_token|code|error_description|type)=/.test(window.location.hash + window.location.search);
  if (configured && (needsSession || hasStoredSession())) {
    Account.ready().catch(function (e) { setStatus("error", e); });
  }

  /* ------------------------------------------------------- the account page -- */

  var host = document.querySelector("[data-account]");
  if (!host) return;
  var esc = Site.escapeHtml;
  var notice = "", NOTE = "<!--note-->", NOTE_L = "<!--note-learners-->", NOTE_S = "<!--note-step-->", noteAt = "";

  /* s•••@example.com: enough for a reader to recognise, little for the next person to read */
  function mask(email) {
    var at = String(email || "").indexOf("@");
    return at > 0 ? email.charAt(0) + "\u2022\u2022\u2022" + email.slice(at) : "an earlier account";
  }
  function setAsideNote() {
    var held = pending();
    return Object.keys(held).map(function (id) {
      /* the service is named as well: it is how that reader gets back into the same account */
      var via = (Array.isArray(held[id].via) ? held[id].via : []).filter(known).map(function (p) { return PROVIDERS[p].label; });
      return '<p class="form-note bad">Progress from your last session as <b>' + esc(mask(held[id].email)) + "</b>" +
        (via.length ? " (signed in with " + esc(listOf(via)) + ")" : "") + " could not be " +
        "saved to that account when it signed out. It has been set aside in this browser, out of view, and will be " +
        "saved the next time that account signs in here.</p>";
    }).join("");
  }

  /* Why a sign-in at another service did not go through, in words a reader can act on.
     The service's own text is shown only when nothing better is known. */
  function returnMessage(r) {
    if (r.code === "provider_email_needs_verification") {
      return "That account's email address has not been verified with the service you chose. Verify it there, then try again.";
    }
    if (r.code === "signup_disabled") return "New accounts are not being accepted at the moment.";
    if (r.code === "otp_expired") return "That link has expired or has already been used. Ask for a new one.";
    if (r.error === "access_denied") return "Sign-in was canceled or refused, so nothing has changed. You can try again.";
    if (r.error === "server_error") {
      return "The sign-in could not be completed. That service may not have confirmed your email address, or the address " +
        "belongs to more than one account here. Try another way of signing in.";
    }
    /* Anything else is a setup problem for the owner, not something a reader can act on.
       The description is never shown: it comes from the address, which anyone can write. */
    if (window.console) window.console.warn("Sign-in returned an error:", r.error, r.code, r.description);
    return "Sign-in did not finish" + (/^[a-z0-9_]{1,40}$/.test(r.code) ? " (" + r.code + ")" : "") +
      ". Try again, or use another way of signing in.";
  }
  /* shown above the form until the reader does something else; focused once, so that it
     is read out to someone who cannot see it appear */
  var returnedText = returned ? returnMessage(returned) : "", returnedShown = false;
  function returnedNote() {
    /* an alert only the first time it is drawn, so a redraw does not read it out again */
    return returnedText ? '<p class="form-note bad" id="acct-returned"' + (returnedShown ? "" : ' role="alert"') +
      ' tabindex="-1">' + esc(returnedText) + "</p>" : "";
  }
  /* what is happening with a provider button, shown beside the buttons rather than at the
     foot of the form, where it would be off screen */
  var handover = "";
  function sayHere(text, bad) {
    handover = text ? '<p class="form-note' + (bad ? " bad" : "") + '">' + esc(text) + "</p>" : "";
    var slot = host.querySelector("[data-handover]");
    if (slot) slot.innerHTML = handover;
  }
  function providerButtons() {
    if (!providers.length) return "";
    return '<div class="providers" role="group" aria-label="Sign in with an account you already have">' +
      providers.map(function (id) {
        return '<button class="btn ghost" id="acct-oauth-' + id + '" type="button">Continue with ' + esc(PROVIDERS[id].label) + "</button>";
      }).join("") + "</div>" +
      '<div data-handover role="status" aria-live="polite">' + handover + "</div>" +
      '<p class="fine">You sign in on that service\'s own page, and it passes on details such as your email address, name, ' +
      "username and picture. Use the same way of signing in each time: another service opens the same account only when " +
      "it has the same verified email address, and otherwise starts a separate account with its own progress. " +
      '<a href="' + Site.rootPrefix() + 'about.html#progress">What is stored</a>.</p>' +
      '<p class="or">or with an email address and a password</p>';
  }

  function field(id, label, type, extra) {
    return '<label class="field" for="' + id + '"><span>' + label + '</span><input id="' + id + '" type="' + type + '" ' +
      (extra || "") + "></label>";
  }
  /* a message under the form; set in place, so nothing already typed is lost */
  function say(text, bad, at) {
    noteAt = at || "";
    /* a new message replaces the one about the sign-in that did not go through */
    var old = document.getElementById("acct-returned");
    if (old) old.parentNode.removeChild(old);
    returnedText = "";
    sayHere("");
    notice = text ? '<p class="form-note' + (bad ? " bad" : "") + '">' + esc(text) + "</p>" : "";
    var slot = host.querySelector(noteAt === "L" ? "[data-note-l]" : "[data-note]");
    var other = host.querySelector(noteAt === "L" ? "[data-note]" : "[data-note-l]");
    if (other) other.innerHTML = "";
    if (slot) slot.innerHTML = notice;
    else draw();
  }
  /* the same, in the Learners panel, where the buttons that cause it are */
  function lsay(text, bad) { say(text, bad, "L"); }
  function lproblem(e) {
    lsay(e && e.message ? e.message : "Something went wrong. Try again in a moment.", true);
  }
  function problem(e) {
    say(e && e.message ? e.message : "Something went wrong. Try again in a moment.", true);
  }
  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }
  function on(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("click", function (e) { e.preventDefault(); fn(el); });
  }

  /* ----------------------------------------------------------- learners -- */

  /* The version of the consent text below; learner_add records it (the server's consent_current is 1 too) */
  var CONSENT_V = 1;
  var CONSENT_HEAD = "What is kept about this learner";
  var CONSENT_TEXT = "The name you give here, that they are under 13, the exercises they solve, how many tries each took, " +
    "whether a hint or the solution was used, missions, XP per day, where they are in each chapter, their game record, " +
    "and a short log of their answers (which exercise and section, right or wrong, which try, how many clues were open, " +
    "and the minute; never what they typed). It is used only to run the course and to show you their progress. It is " +
    "never sold or shared beyond the hosts named on the about page. It is kept until you delete the learner or your " +
    "account. You can download or delete it from this page at any time.";
  var CONSENT_BOX = "I am this learner's parent or guardian and I agree to this.";
  var STALE_RE = /stale sign-in/;

  /* the list as learner_list last gave it (null until read), and whose it is; like name and board, it is
     read once per account and kept, so a redraw while typing does not ask again */
  var learners = null, learnersFor = null, learnersErr = "";
  /* what the Learners panel is doing: the add form, the row being renamed, the row armed for deletion,
     whether a step-up sign-in is wanted, and where the focus goes after the next draw */
  var addUnder = false, addConsent = false, renaming = null, armed = null, needSignIn = false, focusAfter = null;
  /* the step-up: which action asked for it (and the button to return to), what its own form last said,
     and the calls in flight (a second press while one is out sends nothing) */
  var stepAction = null, stepNote = "", addBusy = false, renameBusy = null;

  /* a reply that arrives after a different account is signed in belongs to nobody on this page */
  function uidNow() { return user ? user.id : null; }
  function learnerRpc(name, args) {
    return Account.rpc(name, args);
  }
  function renameHasFocus() {
    var a = document.activeElement;
    return !!(a && a.id && a.id.indexOf("lrn-ri-") === 0 && host.contains(a));
  }
  /* read (or re-read) the list; `focus` is the id to focus once it is drawn */
  function loadLearners(focus) {
    var id = user ? user.id : null;
    if (!id) return;
    learnerRpc("learner_list").then(function (rows) {
      if (!user || user.id !== id) return;
      learners = Array.isArray(rows) ? rows : [];
      learnersErr = "";
      /* a rename field being typed in keeps its focus and text through this redraw (draw keeps both) */
      if (focus && !renameHasFocus()) focusAfter = focus;
      draw();
    }, function (e) {
      if (!user || user.id !== id) return;
      learnersErr = e && e.message ? e.message : "Something went wrong. Try again in a moment.";
      draw();
    });
  }
  function resetLearners() {
    learners = null; learnersFor = null; learnersErr = "";
    addUnder = false; addConsent = false; renaming = null; armed = null; needSignIn = false; focusAfter = null;
    stepAction = null; stepNote = ""; addBusy = false; renameBusy = null;
  }
  function learnerById(id) {
    var found = null;
    (learners || []).forEach(function (l) { if (l && l.id === id) found = l; });
    return found;
  }
  function slug(text) {
    var out = String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
    return out || "learner";
  }
  function download(data, file) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = file;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  /* a refusal that asks for a fresh sign-in is not an error to show, but a step to take */
  function learnerProblem(e, action, focus, prefix) {
    prefix = prefix || "";
    if (e && STALE_RE.test(e.message || "")) {
      needSignIn = true; focusAfter = focus || null;
      stepAction = { action: action, focus: focus || null }; stepNote = "";
      lsay(prefix + "To confirm it is you, sign in again, then press " + action + " again.", true);
      draw();
      return;
    }
    lsay(prefix + (e && e.message ? e.message : "Something went wrong. Try again in a moment."), true);
  }

  function learnersPanel() {
    var cur = Account.learner();
    var h = '<section class="panel learners" aria-labelledby="lrn-h"><h2 id="lrn-h" tabindex="-1">Learners</h2>' +
      "<p>Add a younger learner to keep their progress apart from yours. They get no sign-in of their own: you switch to them here.</p>";
    if (learners === null) {
      h += learnersErr
        ? '<p class="form-note bad">' + esc(learnersErr) + '</p><p class="actions"><button class="btn ghost small" id="lrn-retry" type="button">Try again</button></p>'
        : '<p class="fine" role="status">Loading learners…</p>';
      return h + "</section>";
    }
    function rowHtml(l) {
      var self = !l, id = self ? "" : esc(l.id);
      var nm = self ? "Your own progress" : (typeof l.name === "string" && l.name ? l.name : "Unnamed learner");
      var active = self ? !cur : cur === l.id;
      var out = '<li class="learner-row"' + (active ? ' aria-current="true"' : "") + ">";
      if (!self && renaming === l.id) {
        return out + '<label class="field" for="lrn-ri-' + id + '"><span>New name for ' + esc(nm) + '</span>' +
          '<input id="lrn-ri-' + id + '" type="text" maxlength="40" autocomplete="off" value="' + esc(l.name || "") + '"></label>' +
          '<p class="actions"><button class="btn small" id="lrn-rs-' + id + '" type="button"' + (renameBusy === l.id ? ' disabled aria-busy="true"' : "") + '>Save</button>' +
          '<button class="btn ghost small" id="lrn-rc-' + id + '" type="button">Cancel</button></p></li>';
      }
      out += '<p class="learner-name">' + esc(nm) + "</p><p class=\"actions\">";
      out += active ? '<span class="learner-on">Playing as</span>'
        : '<button class="btn ghost small" id="lrn-sw-' + (self ? "self" : id) + '" type="button" aria-label="Switch to ' + esc(nm) + '">Switch to</button>';
      if (!self) {
        out += '<button class="btn ghost small" id="lrn-r-' + id + '" type="button" aria-label="Rename ' + esc(nm) + '">Rename</button>' +
          '<button class="btn ghost small" id="lrn-dl-' + id + '" type="button" aria-label="Download ' + esc(nm) + '">Download</button>' +
          '<button class="btn ghost small danger" id="lrn-del-' + id + '" type="button"' +
          (armed === l.id ? ">Press again to delete " + esc(nm) : ' aria-label="Delete ' + esc(nm) + '">Delete') + "</button>";
      }
      return out + "</p></li>";
    }
    h += '<ul class="learner-list">' + rowHtml(null) +
      learners.filter(function (l) { return l && l.self !== true && typeof l.id === "string"; }).map(rowHtml).join("") + "</ul>";
    h += '<h3 class="learner-add-h">Add a learner</h3>' +
      field("lrn-name", "Name (a first name or nickname; only you see it)", "text", 'maxlength="40" autocomplete="off"') +
      '<label class="check"><input id="lrn-u13" type="checkbox"' + (addUnder ? " checked" : "") + "><span>Under 13</span></label>";
    if (addUnder) {
      h += '<div class="consent" role="group" aria-labelledby="lrn-consent-h"><h4 id="lrn-consent-h">' + esc(CONSENT_HEAD) + "</h4>" +
        "<p>" + esc(CONSENT_TEXT) + "</p>" +
        '<label class="check"><input id="lrn-consent" type="checkbox"' + (addConsent ? " checked" : "") + "><span>" + esc(CONSENT_BOX) + "</span></label></div>";
    }
    h += '<p class="actions"><button class="btn" id="lrn-add" type="button"' + (addBusy ? ' disabled aria-busy="true"' : "") + '>Add learner</button></p>' + NOTE_L + "</section>";
    return h;
  }
  /* the sign-in controls a step-up asks for, under the Learners panel */
  function stepUpPanel() {
    /* an account with an email address is asked for that address, not another: the step-up cannot change accounts */
    var em = user && user.email ? String(user.email) : "";
    return '<form class="panel auth" novalidate><h2>Sign in again</h2>' + providerButtons() +
      field("acct-email", "Email", "email", 'autocomplete="email" required' + (em ? ' readonly value="' + esc(em) + '"' : "")) +
      field("acct-pass", "Password", "password", 'autocomplete="current-password" minlength="8"') +
      '<p class="actions"><button class="btn" id="acct-stepin" type="submit">Sign in</button></p>' + NOTE_S + "</form>";
  }
  function stepSay(text) {
    stepNote = text ? '<p class="form-note bad">' + esc(text) + "</p>" : "";
    var slot = host.querySelector("[data-note-s]");
    if (slot) slot.innerHTML = stepNote;
  }
  function stepIn() {
    var uid = uidNow(), em = val("acct-email"), pw = val("acct-pass");
    if (!em || !pw) return stepSay("Enter your email and password.");
    Account.signIn(em, pw).then(function () {
      if (uidNow() !== uid) return;
      var a = stepAction;
      needSignIn = false; stepNote = ""; stepAction = null;
      lsay("Signed in again. Now press " + (a ? a.action : "the button") + " again.");
      focusAfter = a ? a.focus : "lrn-h";
      draw();
    }, function (e) {
      if (uidNow() !== uid) return;
      stepSay(e && e.message ? e.message : "Something went wrong. Try again in a moment.");
    });
  }

  function wireLearners() {
    on("lrn-retry", function () { learnersErr = ""; loadLearners(); });
    (learners || []).forEach(function (l) {
      if (!l || l.self === true || typeof l.id !== "string") return;
      var id = l.id, nm = l.name || "this learner";
      on("lrn-sw-" + id, function () { switchTo(id); });
      on("lrn-r-" + id, function () { armed = null; renaming = id; focusAfter = "lrn-ri-" + id; draw(); });
      on("lrn-rc-" + id, function () { renaming = null; focusAfter = "lrn-r-" + id; draw(); });
      on("lrn-rs-" + id, function () { saveRename(id); });
      var input = document.getElementById("lrn-ri-" + id);
      if (input) input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); saveRename(id); }
        else if (e.key === "Escape") { e.preventDefault(); renaming = null; focusAfter = "lrn-r-" + id; draw(); }
      });
      on("lrn-dl-" + id, function () {
        armed = null;
        var uid = uidNow();
        learnerRpc("learner_export", { id: id }).then(function (data) {
          if (uidNow() !== uid) return;
          needSignIn = false; stepNote = "";
          download(data, "basic-mathematics-" + slug(l.name) + ".json");
          lsay("Downloaded " + nm + "'s data.");
          draw();
        }, function (e) { if (uidNow() === uid) learnerProblem(e, "Download", "lrn-dl-" + id); });
      });
      on("lrn-del-" + id, function () {
        /* two presses, so a slip of the hand deletes nothing */
        if (armed !== id) { armed = id; focusAfter = "lrn-del-" + id; draw(); return; }
        removeLearner(id, nm);
      });
    });
    on("lrn-sw-self", function () { switchTo(null); });
    var u13 = document.getElementById("lrn-u13");
    if (u13) u13.addEventListener("change", function () {
      addUnder = u13.checked;
      if (!addUnder) addConsent = false;
      focusAfter = "lrn-u13";
      draw();
    });
    var cons = document.getElementById("lrn-consent");
    if (cons) cons.addEventListener("change", function () { addConsent = cons.checked; });
    var nameIn = document.getElementById("lrn-name");
    if (nameIn) nameIn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addLearner(); } });
    on("lrn-add", addLearner);
    on("acct-stepin", stepIn);
  }
  function switchTo(id) {
    armed = null;
    Account.switchLearner(id, id ? (learnerById(id) || {}).name : null).then(function () {
      focusAfter = "lrn-h";
      lsay("");
      draw();
    }, function (e) { lproblem(e); draw(); });
  }
  function addLearner() {
    var nm = val("lrn-name"), uid = uidNow(), from = document.activeElement && document.activeElement.id;
    if (addBusy) return;
    armed = null;
    if (!nm || nm.length > 40) return lsay("Enter a name of 1 to 40 characters.", true);
    if (addUnder && !addConsent) return lsay("Tick the box to confirm you are this learner's parent or guardian.", true);
    addBusy = true;
    var btn = document.getElementById("lrn-add");
    if (btn) { btn.disabled = true; btn.setAttribute("aria-busy", "true"); }
    learnerRpc("learner_add", { name: nm, under13: addUnder, consent_v: addUnder ? CONSENT_V : null }).then(function () {
      if (uidNow() !== uid) return;
      addBusy = false;
      var el = document.getElementById("lrn-name");
      if (el) el.value = "";
      addUnder = false; addConsent = false;
      lsay("Added " + nm + ".");
      loadLearners("lrn-h");
    }, function (e) {
      if (uidNow() !== uid) return;
      addBusy = false;
      lproblem(e);
      if (from) focusAfter = from;
      draw();
    });
  }
  function saveRename(id) {
    var nm = val("lrn-ri-" + id), uid = uidNow(), from = document.activeElement && document.activeElement.id;
    if (renameBusy) return;
    if (!nm || nm.length > 40) return lsay("Enter a name of 1 to 40 characters.", true);
    renameBusy = id;
    var btn = document.getElementById("lrn-rs-" + id);
    if (btn) { btn.disabled = true; btn.setAttribute("aria-busy", "true"); }
    learnerRpc("learner_rename", { id: id, name: nm }).then(function () {
      if (uidNow() !== uid) return;
      renameBusy = null;
      var l = learnerById(id);
      if (l) l.name = nm;
      renaming = null;
      focusAfter = "lrn-r-" + id;
      lsay("Renamed to " + nm + ".");
      draw();
      loadLearners("lrn-r-" + id);
    }, function (e) {
      if (uidNow() !== uid) return;
      renameBusy = null;
      lproblem(e);
      if (from) focusAfter = from;
      draw();
    });
  }
  function removeLearner(id, nm) {
    armed = null;
    var uid = uidNow(), was = Account.learner() === id, switched = false, GONE = {};
    var first = was ? Account.switchLearner(null).then(function () { switched = true; }) : Promise.resolve();
    first.then(function () {
      if (uidNow() !== uid) throw GONE;
      return learnerRpc("learner_delete", { id: id });
    }).then(function () {
      if (uidNow() !== uid) return;
      needSignIn = false; stepNote = ""; stepAction = null;
      learners = (learners || []).filter(function (l) { return l.id !== id; });
      focusAfter = "lrn-h";
      lsay((switched ? "Switched back to your own progress, and deleted " : "Deleted ") + nm + ".");
      draw();
      loadLearners("lrn-h");
    }, function (e) {
      if (e === GONE || uidNow() !== uid) return;
      /* the delete was asked for and is still wanted: the next press goes through */
      if (switched) armed = id;
      else if (e && STALE_RE.test(e.message || "")) armed = id;
      learnerProblem(e, "Delete", "lrn-del-" + id, switched ? "Switched back to your own progress. " : "");
      if (switched) draw();
    });
  }

  function draw() {
    var html = "";
    if (!configured) {
      html = '<div class="panel"><h2>Accounts are not switched on</h2>' +
        "<p>This copy of the site has no account service set up, so progress is kept in this browser only. " +
        "Everything else works as usual.</p></div>";
    } else if (Account.recovering && user) {
      html = '<form class="panel auth" novalidate><h2>Choose a new password</h2>' +
        field("acct-new", "New password", "password", 'autocomplete="new-password" minlength="8"') +
        '<p class="actions"><button class="btn" id="acct-setpw" type="submit">Save password</button></p>' + NOTE + "</form>";
    } else if (!user) {
      html = '<form class="panel auth" novalidate>' + returnedNote() + setAsideNote() +
        "<h2>Sign in or create an account</h2>" +
        "<p>An account keeps your progress, streak and attempt history in one place, so they follow you to " +
        "another browser or device. The course itself never needs one.</p>" +
        providerButtons() +
        field("acct-email", "Email", "email", 'autocomplete="email" required') +
        field("acct-pass", "Password", "password", 'autocomplete="current-password" minlength="8"') +
        '<p class="actions"><button class="btn" id="acct-in" type="submit">Sign in</button>' +
        '<button class="btn ghost" id="acct-up" type="button">Create account</button></p>' +
        (mail ? '<p class="actions quiet"><button class="link" id="acct-link" type="button">Email me a sign-in link instead</button>' +
        '<button class="link" id="acct-forgot" type="button">Forgot password</button></p>' : "") +
        NOTE + "</form>";
    } else {
      var st = status.state === "syncing" ? "Syncing…"
        : status.state === "error" ? "Sync failed: " + (status.error && status.error.message ? status.error.message : "unknown error")
        : status.state === "reload" ? "A newer version of this site has saved to your account. Reload this page to finish syncing."
        : status.at ? "Synced at " + status.at.toLocaleTimeString() : "Signed in";
      if (evFull) st += " Your answer log is full; it will catch up.";
      var who = label(user), ways = methodNames(user);
      html = '<div class="panel"><h2>Your account</h2>' +
        "<p>Signed in" + (who ? " as <b>" + esc(who) + "</b>" : "") + ".</p>" +
        (ways.length ? '<p class="fine">' + (ways.length > 1 ? "You can sign in to this account with " : "You sign in with ") +
          esc(listOf(ways)) + ".</p>" : "") +
        '<p class="sync-state" data-state="' + status.state + '">' + esc(st) + "</p>" +
        field("acct-name", "Display name (optional)", "text", 'autocomplete="nickname" maxlength="60"') +
        (boardOn && board !== null && !Account.learner() ? '<label class="switch acct-board"><input id="acct-board" type="checkbox" role="switch"' + (boardShown() ? " checked" : "") +
          (boardBusy ? ' disabled aria-busy="true"' : "") +
          ' aria-checked="' + (boardShown() ? "true" : "false") + '" aria-labelledby="acct-board-name" aria-describedby="acct-board-note">' +
          '<span id="acct-board-name">Daily board</span><small id="acct-board-note">Signed-in readers see a made-up name that changes daily, ' +
          "your Daily score and your time. Off removes your rows.</small></label>" : "") +
        '<p class="actions"><button class="btn" id="acct-save" type="button">Save name</button>' +
        '<button class="btn ghost" id="acct-sync" type="button">Sync now</button>' +
        '<button class="btn ghost" id="acct-out" type="button">Sign out</button></p>' + NOTE +
        '<p class="fine">Signing out saves your progress to your account, then clears this browser\'s copy. ' +
        "If it cannot be saved, it is set aside in this browser and saved the next time you sign in here.</p></div>" +
        learnersPanel() + (needSignIn ? stepUpPanel() : "") +
        '<div class="panel"><h2>Your data</h2>' +
        "<p>What is stored: the exercises you have solved, how many tries each took, whether a hint or the " +
        "solution was used, missions, XP per day, where you are in each chapter, and your game record " +
        "(achievements, which solutions you compared, medals and scores from the Arena, and when each " +
        "section is next due for review), and a short log of your answers: for each check, which exercise and section, " +
        "right or wrong, which try, how many clues were open and whether the solution was, and the minute; for each " +
        "Arena answer, the kind of question, the section, right or wrong and the day; never what you typed. Resetting " +
        "your progress deletes the log. Play settings and the combo meter stay on this device. The account itself " +
        "holds your email address and, if you signed in through another service, the details that service passed on, " +
        "such as your name, username, picture address and your account id there. While you are signed in that way, this browser also keeps a key from " +
        "that service, which signing out removes; to cut the link completely, remove this site from the connected " +
        "apps in that service's settings.</p>" +
        '<p class="actions"><button class="btn ghost" id="acct-export" type="button">Download my data</button>' +
        '<button class="btn ghost danger" id="acct-delete" type="button">Delete my account</button></p></div>';
    }
    /* a redraw keeps whatever is in the fields that survive it */
    var kept = {}, held = document.activeElement && document.activeElement.id === "acct-returned";
    /* so does the keyboard: whatever had the focus gets it back, with the caret where it was */
    var act = document.activeElement, here = act && act !== document.body && host.contains(act) && act.id ? act.id : "", hereSel = null;
    try { if (here && typeof act.selectionStart === "number") hereSel = [act.selectionStart, act.selectionEnd]; } catch (e) { hereSel = null; }
    Array.prototype.forEach.call(host.querySelectorAll("input[id]"), function (el) {
      if (el.type !== "password") kept[el.id] = el.value;
    });
    host.innerHTML = html.replace(NOTE, '<div data-note role="status" aria-live="polite">' + (noteAt === "L" ? "" : notice) + "</div>")
      .replace(NOTE_L, '<div data-note-l role="status" aria-live="polite">' + (noteAt === "L" ? notice : "") + "</div>")
      .replace(NOTE_S, '<div data-note-s role="status" aria-live="polite">' + stepNote + "</div>");
    Object.keys(kept).forEach(function (id) {
      var el = document.getElementById(id);
      /* a name being edited in a row keeps what was typed, not the old name it was prefilled with */
      if (el && (!el.value || id.indexOf("lrn-ri-") === 0) && !el.readOnly) el.value = kept[id];
    });
    wire();
    wireLearners();
    var target = focusAfter || here;
    focusAfter = null;
    if (target) {
      var fel = document.getElementById(target);
      if (fel && fel !== document.activeElement) {
        try {
          fel.focus();
          if (target === here && hereSel && typeof fel.setSelectionRange === "function") fel.setSelectionRange(hereSel[0], hereSel[1]);
        } catch (e) { /* still on the page */ }
      }
    }
    /* focused when first shown, and again if a redraw took the focus away from it */
    var back = document.getElementById("acct-returned");
    if (back && (!returnedShown || held)) {
      returnedShown = true;
      try { back.focus(); } catch (e) { /* still on the page, and still an alert */ }
    }
  }
  /* Back from the other service's page: the button pressed on the way there is live again */
  window.addEventListener("pageshow", function (e) {
    if (e && e.persisted) { notice = ""; handover = ""; draw(); }
  });

  function wire() {
    var form = host.querySelector("form");
    if (form) form.addEventListener("submit", function (e) { e.preventDefault(); });

    on("acct-in", function () {
      if (!val("acct-email") || !val("acct-pass")) return say("Enter your email and password.", true);
      Account.signIn(val("acct-email"), val("acct-pass")).then(function () { say(""); }, function (e) {
        /* an account made with one of the buttons has no password to get wrong */
        if (providers.length && e && /invalid login credentials/i.test(e.message || "")) {
          return say(e.message + ". If you made your account with one of the buttons above, use that button.", true);
        }
        problem(e);
      });
    });
    on("acct-up", function () {
      if (!val("acct-email") || val("acct-pass").length < 8) return say("Enter an email and a password of at least 8 characters.", true);
      Account.signUp(val("acct-email"), val("acct-pass")).then(function (d) {
        say(d && d.session ? "" : "Almost there — check your email for a link to confirm the account.");
      }, function (e) {
        /* the project's mailer will not write to this address, so no account can be confirmed */
        var refused = e && (e.code === "email_address_not_authorized" || /not authorized|confirmation (e)?mail/i.test(e.message || ""));
        if (!mail && refused) {
          return say("This site cannot send confirmation emails yet, so an account cannot be made with an email and a password." +
            (providers.length ? " Use one of the buttons above instead." : ""), true);
        }
        problem(e);
      });
    });
    on("acct-link", function () {
      if (!val("acct-email")) return say("Enter your email first.", true);
      Account.emailLink(val("acct-email")).then(function () { say("A sign-in link is on its way to your inbox."); }, problem);
    });
    on("acct-forgot", function () {
      if (!val("acct-email")) return say("Enter your email first.", true);
      Account.forgot(val("acct-email")).then(function () { say("If that address has an account, a reset link is on its way."); }, problem);
    });
    providers.forEach(function (id) {
      on("acct-oauth-" + id, function (btn) {
        btn.disabled = true;
        say("");
        sayHere("Taking you to " + PROVIDERS[id].label + "\u2026");
        Account.oauth(id).then(function () {
          /* normally the page has gone by now; if it has not, the button works again */
          setTimeout(function () { btn.disabled = false; sayHere(""); }, 4000);
        }, function (e) {
          btn.disabled = false;
          sayHere(e && e.message ? e.message : "Something went wrong. Try again in a moment.", true);
        });
      });
    });
    on("acct-setpw", function () {
      if (val("acct-new").length < 8) return say("Use at least 8 characters.", true);
      Account.setPassword(val("acct-new")).then(function () { say("Password changed."); }, problem);
    });
    on("acct-save", function () {
      Account.saveProfile(val("acct-name")).then(function () { name = val("acct-name"); say("Saved."); }, problem);
    });
    on("acct-sync", function () { Account.syncNow(); });
    on("acct-out", function () { notice = ""; needSignIn = false; Account.signOut().catch(problem); });
    on("acct-export", function () {
      download(Account.exportData(), "basic-mathematics-progress.json");
    });
    on("acct-delete", function (btn) {
      /* two presses, so a slip of the hand deletes nothing */
      if (btn.getAttribute("data-armed") !== "true") {
        btn.setAttribute("data-armed", "true");
        btn.textContent = "Press again to delete everything";
        return;
      }
      /* shown by the redraw that follows the sign-out, which would otherwise clear it */
      Account.deleteAccount().then(function () { carry = "Your account and its data have been deleted."; }, problem);
    });
    var nameEl = document.getElementById("acct-name");
    if (nameEl && name !== null) nameEl.value = name;
    var boardEl = document.getElementById("acct-board");
    if (boardEl) boardEl.addEventListener("change", function () {
      if (boardBusy) return;
      boardBusy = true;
      boardWant = boardEl.checked;
      paintBoard();
      var want = boardWant;
      Account.setBoard(want).then(function () {
        board = want;
        boardBusy = false;
        paintBoard();
        say(want ? "You are on the Daily board." : "You have left the Daily board, and your rows are removed.");
      }, function (e) {
        boardBusy = false;
        paintBoard();
        if (window.console) window.console.warn("[BM] Daily board switch:", e && e.message ? e.message : e);
        say("Could not update the Daily board just now.", true);
      });
    });
  }
  /* the switch as it should read: while a change is in flight, the state asked for */
  function boardShown() { return boardBusy ? boardWant : !!board; }
  /* the switch now on the page, which a redraw may have replaced */
  function paintBoard() {
    var el = document.getElementById("acct-board");
    if (!el) return;
    el.checked = boardShown();
    el.disabled = boardBusy;
    el.setAttribute("aria-checked", boardShown() ? "true" : "false");
    if (boardBusy) el.setAttribute("aria-busy", "true");
    else el.removeAttribute("aria-busy");
  }

  /* board: whether the reader joined the Daily board, null until the profile is read;
     boardBusy while a change to it is in flight, boardWant what that change asks for */
  var name = null, nameFor = null, drawnFor = null, carry = null, board = null, boardBusy = false, boardWant = false;
  Account.onChange(function () {
    if (user && nameFor !== user.id) {
      nameFor = user.id;
      Account.profile().then(function (p) {
        name = p && p.display_name ? p.display_name : "";
        board = p && typeof p.board === "boolean" ? p.board : p ? null : false;
        draw();
      }, function () { name = ""; });
    }
    if (!user) { name = null; nameFor = null; board = null; resetLearners(); }
    else if (learnersFor !== user.id) { resetLearners(); learnersFor = user.id; loadLearners(); }
    /* a message about a sign-in that did not go through is no use to a reader who is signed in */
    if (user) returnedText = "";
    /* a redraw would wipe what is being typed — unless who is signed in has changed */
    var who = user ? user.id : null, active = document.activeElement;
    var typing = active && host.contains(active) && active.tagName === "INPUT";
    if (typing && who === drawnFor) return;
    if (who !== drawnFor) {
      noteAt = "";
      notice = carry ? '<p class="form-note">' + esc(carry) + "</p>" : "";
      carry = null;
    }
    drawnFor = who;
    draw();
  });
  draw();
})();
