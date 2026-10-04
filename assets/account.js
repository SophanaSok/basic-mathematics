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
   =========================================================================== */
(function () {
  "use strict";

  var Store = window.BMStore, Site = window.BMSite;
  if (!Store || !Site) return;

  var cfg = window.BM_CONFIG || {};
  var configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  var SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  var META_KEY = "bm.sync.v1";
  /* "game" only where site.js knows the key, so an older site.js still syncs cleanly */
  var FIELDS = ["progress", "play", "attempts", "activity", "lesson", "last", "game"].filter(function (f) {
    return !!Store.keys[f];
  });

  function obj(x) { return x && typeof x === "object" && !Array.isArray(x) ? x : {}; }
  function keysOf(a, b) {
    var seen = {}, out = [];
    Object.keys(obj(a)).concat(Object.keys(obj(b))).forEach(function (k) {
      if (!seen[k]) { seen[k] = true; out.push(k); }
    });
    return out.sort();
  }

  /* ------------------------------------------------------------- merging -- */

  function mergeProgress(a, b) {
    var out = {};
    keysOf(a, b).forEach(function (ch) {
      var x = obj(obj(a)[ch]), y = obj(obj(b)[ch]), solved = {};
      keysOf(x.solved, y.solved).forEach(function (k) { solved[k] = true; });
      out[ch] = { solved: solved, total: Math.max(x.total || 0, y.total || 0) };
    });
    return out;
  }

  function mergePlay(a, b) {
    var out = {};
    keysOf(a, b).forEach(function (ch) {
      var x = obj(obj(a)[ch]), y = obj(obj(b)[ch]), done = {};
      keysOf(x.done, y.done).forEach(function (k) { done[k] = true; });
      var rec = { done: done, total: Math.max(x.total || 0, y.total || 0) };
      var guess = x.guess !== undefined && x.guess !== null ? x.guess : y.guess;
      if (guess !== undefined && guess !== null) rec.guess = guess;
      out[ch] = rec;
    });
    return out;
  }

  /* one exercise's record seen from two devices */
  function mergeAttempt(x, y) {
    if (!x) return y;
    if (!y) return x;
    var out = {};
    var tries = Math.max(x.tries || 0, y.tries || 0);
    var hints = Math.max(x.hints || 0, y.hints || 0);
    if (tries) out.tries = tries;
    if (hints) out.hints = hints;
    if (x.opened || y.opened) out.opened = 1;
    if (x.inline || y.inline) out.inline = 1;
    var section = x.section || y.section;
    if (section) out.section = section;
    if (x.solved || y.solved) {
      out.solved = Math.min(x.solved || Infinity, y.solved || Infinity);
      /* "right first time" only if every device that solved it says so */
      out.first = (!x.solved || x.first) && (!y.solved || y.first) ? 1 : 0;
    } else if (x.skipped || y.skipped) {
      out.skipped = 1;
    }
    return out;
  }

  function mergeAttempts(a, b) {
    var out = {};
    keysOf(a, b).forEach(function (ch) {
      var x = obj(obj(a)[ch]), y = obj(obj(b)[ch]);
      out[ch] = {};
      keysOf(x, y).forEach(function (k) { out[ch][k] = mergeAttempt(x[k], y[k]); });
    });
    return out;
  }

  function mergeActivity(a, b) {
    a = obj(a); b = obj(b);
    var days = {};
    keysOf(a.days, b.days).forEach(function (d) {
      days[d] = Math.max(obj(a.days)[d] || 0, obj(b.days)[d] || 0);
    });
    var out = { days: days };
    var goal = a.goal || b.goal;
    if (goal) out.goal = goal;
    return out;
  }

  function mergeLesson(a, b) {
    a = obj(a); b = obj(b);
    var reached = {};
    keysOf(a.reached, b.reached).forEach(function (ch) {
      reached[ch] = Math.max(obj(a.reached)[ch] || 0, obj(b.reached)[ch] || 0);
    });
    var out = { reached: reached };
    var mode = a.mode || b.mode;
    if (mode) out.mode = mode;
    return out;
  }

  /* The game layer's record (bm.game.v1). Every field merges so that order, grouping
     and repetition never matter:
       ach    union, keeping the earliest unlock time
       cmp    union of compared solutions
       sec    per section: n, ok and fix by max (ok never above n); the pair
              (last, box) taken whole from whichever is later, then higher
       best   per mode: highest score, then most hearts, then the earlier day
       enc    per set: the higher rematch medal, then the earlier day
       daily  union, keeping the latest 60 days
       maxed  max */
  function num(x) { x = Number(x); return isFinite(x) ? x : 0; }
  function str(x) { return typeof x === "string" ? x : ""; }
  function mergeGame(a, b) {
    a = obj(a); b = obj(b);
    var out = { ach: {}, cmp: {}, sec: {}, best: {}, enc: {}, daily: {}, maxed: Math.max(num(a.maxed), num(b.maxed)) };
    var ach = [obj(a.ach), obj(b.ach)];
    keysOf(ach[0], ach[1]).forEach(function (id) {
      var t = [num(ach[0][id]), num(ach[1][id])].filter(function (x) { return x > 0; });
      if (t.length) out.ach[id] = Math.min.apply(null, t);
    });
    var cmp = [obj(a.cmp), obj(b.cmp)];
    keysOf(cmp[0], cmp[1]).forEach(function (ch) {
      var x = obj(cmp[0][ch]), y = obj(cmp[1][ch]), rec = {};
      keysOf(x, y).forEach(function (k) { if (x[k] || y[k]) rec[k] = 1; });
      out.cmp[ch] = rec;
    });
    var sec = [obj(a.sec), obj(b.sec)];
    keysOf(sec[0], sec[1]).forEach(function (id) {
      var x = obj(sec[0][id]), y = obj(sec[1][id]);
      var n = Math.max(num(x.n), num(y.n));
      /* each side's ok is held to its own n first, which keeps the merge associative */
      var rec = { n: n, ok: Math.max(Math.min(num(x.ok), num(x.n)), Math.min(num(y.ok), num(y.n))) };
      var lx = str(x.last), ly = str(y.last);
      var pick = lx > ly || (lx === ly && num(x.box) >= num(y.box)) ? x : y;
      rec.box = num(pick.box);
      if (str(pick.last)) rec.last = str(pick.last);
      var fix = Math.max(num(x.fix), num(y.fix));
      if (fix) rec.fix = fix;
      out.sec[id] = rec;
    });
    var best = [obj(a.best), obj(b.best)];
    keysOf(best[0], best[1]).forEach(function (mode) {
      var list = [best[0][mode], best[1][mode]].filter(function (r) { return r && typeof r === "object"; })
        .map(function (r) { return { score: num(r.score), hearts: num(r.hearts), day: str(r.day) }; });
      if (!list.length) return;
      list.sort(function (p, q) {
        return (q.score - p.score) || (q.hearts - p.hearts) || (p.day < q.day ? -1 : p.day > q.day ? 1 : 0);
      });
      out.best[mode] = list[0];
    });
    var enc = [obj(a.enc), obj(b.enc)];
    keysOf(enc[0], enc[1]).forEach(function (id) {
      var list = [enc[0][id], enc[1][id]].filter(function (r) { return r && typeof r === "object"; })
        .map(function (r) { return { medal: num(r.medal), day: str(r.day) }; });
      if (!list.length) return;
      list.sort(function (p, q) { return (q.medal - p.medal) || (p.day < q.day ? -1 : p.day > q.day ? 1 : 0); });
      out.enc[id] = list[0];
    });
    var daily = [obj(a.daily), obj(b.daily)];
    keysOf(daily[0], daily[1]).filter(function (d) { return daily[0][d] || daily[1][d]; })
      .reverse().slice(0, 60).sort().forEach(function (d) { out.daily[d] = 1; });
    return out;
  }

  /* local first: where two devices simply disagree (the reading mode, the daily goal,
     the place to continue from), this device keeps its own */
  function merge(local, remote) {
    local = obj(local); remote = obj(remote);
    return {
      progress: mergeProgress(local.progress, remote.progress),
      play: mergePlay(local.play, remote.play),
      attempts: mergeAttempts(local.attempts, remote.attempts),
      activity: mergeActivity(local.activity, remote.activity),
      lesson: mergeLesson(local.lesson, remote.lesson),
      last: local.last || remote.last || null,
      game: mergeGame(local.game, remote.game)
    };
  }

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
  function clearLocal() {
    var empty = {};
    FIELDS.forEach(function (f) { empty[f] = f === "last" ? null : {}; });
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

  function load() {
    if (!configured) return Promise.reject(new Error("Accounts are not configured."));
    if (client) return Promise.resolve(client);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      function make() {
        try {
          client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
          resolve(client);
        } catch (e) { reject(e); }
      }
      if (window.supabase && window.supabase.createClient) return make();
      var s = document.createElement("script");
      s.src = SDK;
      s.async = true;
      s.onload = make;
      s.onerror = function () { loading = null; reject(new Error("Could not reach the account service.")); };
      document.head.appendChild(s);
    });
    return loading;
  }

  /* ----------------------------------------------------------------- sync -- */

  var user = null, status = { state: "off", at: null, error: null };
  var pushTimer = null, queue = [], watchers = [];
  /* The account row as this page last read or wrote it: undefined until then, null
     when the account has no row yet, otherwise its updated_at exactly as the server
     sent it back. `owned` is set once this page has claimed this browser's progress
     for the reader, so a sign-out in another tab can be noticed. */
  var seen, owned = false;
  /* one sync at a time per page; each waits for the one before to settle */
  var chain = Promise.resolve();
  function serial(fn) {
    var run = chain.then(fn, fn);
    chain = run.then(noop, noop);
    return run;
  }
  function noop() {}

  function setStatus(state, error) {
    status = { state: state, at: state === "synced" ? new Date() : status.at, error: error || null };
    notify();
  }
  function notify() {
    watchers.slice().forEach(function (fn) { try { fn(Account); } catch (e) { /* a watcher's own problem */ } });
  }

  /* JSON with object keys sorted at every level: jsonb hands keys back in its own order */
  function canon(x) {
    if (Array.isArray(x)) return "[" + x.map(canon).join(",") + "]";
    if (x && typeof x === "object") {
      return "{" + Object.keys(x).sort().filter(function (k) { return x[k] !== undefined; })
        .map(function (k) { return JSON.stringify(k) + ":" + canon(x[k]); }).join(",") + "}";
    }
    return JSON.stringify(x === undefined ? null : x);
  }

  /* Progress that could not be saved when its reader signed out, set aside by reader:
     { <user id>: { email, resetAt, state, at } }. It is merged in the next time that
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
        resetAt: Math.max(Number(m.resetAt) || 0, Number(old.resetAt) || 0),
        state: old.state ? merge(state, old.state) : state,
        at: Date.now()
      };
    });
  }

  function row(u, state, resetAt) {
    var out = {
      user_id: u.id,
      progress: state.progress || {}, play: state.play || {}, attempts: state.attempts || {},
      activity: state.activity || {}, lesson: state.lesson || {}, last: state.last || null,
      reset_at: resetAt || 0, updated_at: nextStamp()
    };
    /* needs the `game` column (supabase/schema.sql) */
    if (FIELDS.indexOf("game") > -1) out.game = state.game || {};
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
  function stillSignedIn(u) {
    if (!user || user.id !== u.id) throw new Error("The signed-in account changed.");
  }
  function confirmSession(u) {
    return client.auth.getSession().then(function (res) {
      var s = res && res.data ? res.data.session : null;
      if (!s || !s.user || s.user.id !== u.id) throw new Error("You are no longer signed in on this page.");
      stillSignedIn(u);
    });
  }
  /* a page that claimed this browser's progress, whose reader has since been forgotten
     by a sign-out in another tab, must not read or write it any more */
  function stillOwner(u) {
    if (owned && meta().user !== u.id) throw new Error("You have been signed out in another tab.");
  }

  /* Save a state over the version of the row this page last saw. Resolves true when it
     landed, false when another device got there first (nothing was written). */
  function write(u, state, resetAt) {
    var data = row(u, state, resetAt);
    var req = seen === null
      ? client.from("user_state").insert(data).select("updated_at")
      : client.from("user_state").update(data).eq("user_id", u.id).eq("updated_at", seen).select("updated_at");
    return req.then(function (res) {
      if (res.error) {
        if (seen === null && res.error.code === "23505") return false;   /* another device created the row first */
        throw res.error;
      }
      if (!res.data || !res.data.length) return false;  /* the row has moved on since this page read it */
      if (user && user.id === u.id) seen = res.data[0].updated_at;
      return true;
    });
  }

  /* Read the account row, merge it into this browser, and save the result if the row
     lacks anything, trying again if another device saves in between. */
  function sync(u, tries) {
    return confirmSession(u).then(function () {
      return client.from("user_state").select("*").eq("user_id", u.id).maybeSingle();
    }).then(function (res) {
      if (res.error) throw res.error;
      stillSignedIn(u);
      stillOwner(u);
      var remote = res.data, m = meta(), local = readLocal(), dropped = false;
      var aside = obj(pending()[u.id]), hasAside = !!aside.state;
      seen = remote ? remote.updated_at : null;
      var remoteReset = remote ? Number(remote.reset_at) || 0 : 0;
      var mine = m.user === u.id ? Number(m.resetAt) || 0 : 0;
      var asideReset = hasAside ? Number(aside.resetAt) || 0 : 0;
      /* progress left by a different account on this browser is not this reader's */
      if (m.user && m.user !== u.id) { local = {}; dropped = true; }
      /* a reset made on another device wins over what this browser still remembers of the
         same account; progress made before ever signing in is kept and merged */
      if (m.user === u.id && remoteReset > mine) { local = {}; dropped = true; }
      var kept = hasAside && !(remoteReset > asideReset) ? aside.state : {};
      /* A reset made on this browser that the row has not heard of. If nothing has been
         saved since it, the row's state is from before the reset and is left out. If
         another device has saved since, its work is kept and this reset is given up:
         losing a reset can be undone by pressing it again, losing work cannot. */
      var known = Math.max(mine, asideReset), base = remote || {}, resetAt = remoteReset;
      if (known > remoteReset) {
        var written = remote ? Date.parse(remote.updated_at) : 0;
        if (!(written >= known)) { base = {}; resetAt = known; }
      }
      var merged = merge(merge(local, kept), base);
      setMeta(function (x) { x.user = u.id; x.resetAt = resetAt; });
      owned = true;
      writeLocal(merged, dropped);
      function done() {
        if (hasAside) setPending(function (p) { delete p[u.id]; });
        return true;
      }
      var same = remote && remoteReset === resetAt && FIELDS.every(function (f) {
        return canon(merged[f] || null) === canon(remote[f] || null);
      });
      if (same) return done();
      return write(u, merged, resetAt).then(function (ok) {
        if (ok) return done();
        if (tries >= 3) throw new Error("Another device kept saving at the same moment. Try Sync now.");
        return sync(u, tries + 1);
      });
    });
  }

  /* Both resolve true when this browser's progress is in the account, false when it
     could not be saved (the reason is in status.error); neither ever rejects. */
  function pull() {
    var u = user;
    return serial(function () {
      if (!u || !user || user.id !== u.id) return false;
      setStatus("syncing");
      return sync(u, 0).then(function () { setStatus("synced"); return true; },
        function (e) { setStatus("error", e); return false; });
    });
  }

  function push() {
    clearTimeout(pushTimer);
    pushTimer = null;
    if (!client || !user) return Promise.resolve(false);
    var u = user;
    return serial(function () {
      if (!user || user.id !== u.id) return false;
      var events = queue;
      queue = [];
      setStatus("syncing");
      /* a page that has not read the row yet merges with it before writing anything */
      var save = seen === undefined ? sync(u, 0) : confirmSession(u).then(function () {
        /* this browser first, then whose it is: a sign-out in another tab forgets the
           reader before it clears the progress, so a stale read is caught here */
        var state = readLocal();
        stillOwner(u);
        return write(u, state, Number(meta().resetAt) || 0);
      }).then(function (ok) { return ok || sync(u, 0); });
      var log = events.length ? client.from("attempts").insert(events).then(function (r) {
        if (r.error) throw r.error;
      }) : null;
      return Promise.all([save, log]).then(function () { setStatus("synced"); return true; }, function (e) {
        setStatus("error", e);
        /* the attempt log goes again with the next save; whether progress was saved is what the caller needs */
        return save.then(function () { queue = events.concat(queue); return true; }, function () {
          queue = events.concat(queue);
          return false;
        });
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
    var u = user, state = readLocal();
    if (meta().user !== u.id) return;
    var events = queue;
    queue = [];
    write(u, state, Number(meta().resetAt) || 0).then(noop, noop);
    if (events.length) client.from("attempts").insert(events).then(noop, noop);
  }

  Store.on(function (c) {
    if (!user) return;
    if (c.type === "state") {
      var synced = FIELDS.some(function (f) { return Store.keys[f] === c.key; });
      if (synced) schedule();
    } else if (c.type === "attempt") {
      queue.push({
        user_id: user.id, chapter: c.chapter, ex_key: c.key, section: c.section || null,
        correct: !!c.correct, try_no: c.tryNo || 1, hint_level: c.hintLevel || 0,
        solution_open: !!c.solutionOpen, inline: !!c.inline
      });
      schedule();
    } else if (c.type === "reset") {
      /* stamp the reset so other devices drop their copies instead of merging them back;
         always later than the last reset this browser knows of, whatever its clock says */
      setMeta(function (m) { m.resetAt = Math.max(Date.now(), (Number(m.resetAt) || 0) + 1); });
      push();
    }
  });
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush();
  });

  function onSession(session) {
    var next = session && session.user ? session.user : null;
    var changed = (next && next.id) !== (user && user.id);
    user = next;
    /* what this page knew of the previous reader's row and log is not this reader's */
    if (changed) {
      seen = undefined;
      owned = false;
      queue = [];
      clearTimeout(pushTimer);
      pushTimer = null;
    }
    if (!user) setStatus("off");
    drawButton();
    notify();
    if (user && changed) pull();
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

  var started = null;
  var Account = {
    configured: configured,
    recovering: false,
    merge: merge,
    mergeGame: mergeGame,
    user: function () { return user; },
    status: function () { return status; },
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
    google: function () {
      return Account.ready().then(function (c) {
        return c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: pageUrl("account.html") } });
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
      var u = user, saved = false, why = null;
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
        setMeta(function (m) { delete m.user; delete m.resetAt; });
        clearLocal();
        return { saved: saved, error: why };
      });
    },
    syncNow: function () {
      return Account.ready().then(function () { return user ? pull() : null; });
    },
    profile: function () {
      return Account.ready().then(function (c) {
        return c.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      }).then(unwrap);
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
          setMeta(function (m) { delete m.user; delete m.resetAt; });
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
      if (user) data.account = user.email;
      return data;
    }
  };
  window.BMAccount = Account;

  /* ---------------------------------------------------------- topbar button -- */

  function drawButton() {
    var nav = document.querySelector(".topbar nav");
    if (!nav || !configured) return;
    var a = nav.querySelector(".acct");
    if (!a) {
      a = document.createElement("a");
      a.className = "acct";
      a.href = Site.rootPrefix() + "account.html";
      nav.appendChild(a);
    }
    if (user) {
      var initial = (user.email || "?").charAt(0).toUpperCase();
      a.innerHTML = '<span class="avatar" aria-hidden="true">' + Site.escapeHtml(initial) + "</span>" +
        '<span class="visually-hidden">Your account</span>';
      a.setAttribute("title", "Signed in as " + (user.email || "you"));
      a.setAttribute("data-in", "true");
    } else {
      a.textContent = "Sign in";
      a.removeAttribute("title");
      a.removeAttribute("data-in");
    }
  }

  drawButton();
  var needsSession = document.querySelector("[data-account], [data-owner-insights]") ||
    /[#&?](access_token|code|error_description|type)=/.test(window.location.hash + window.location.search);
  if (configured && (needsSession || hasStoredSession())) {
    Account.ready().catch(function (e) { setStatus("error", e); });
  }

  /* ------------------------------------------------------- the account page -- */

  var host = document.querySelector("[data-account]");
  if (!host) return;
  var esc = Site.escapeHtml;
  var notice = "", NOTE = "<!--note-->";

  /* s•••@example.com: enough for a reader to recognise, little for the next person to read */
  function mask(email) {
    var at = String(email || "").indexOf("@");
    return at > 0 ? email.charAt(0) + "\u2022\u2022\u2022" + email.slice(at) : "an earlier account";
  }
  function setAsideNote() {
    var held = pending();
    return Object.keys(held).map(function (id) {
      return '<p class="form-note bad">Progress from your last session as <b>' + esc(mask(held[id].email)) + "</b> could not be " +
        "saved to that account when it signed out. It has been set aside in this browser, out of view, and will be " +
        "saved the next time that account signs in here.</p>";
    }).join("");
  }

  function field(id, label, type, extra) {
    return '<label class="field" for="' + id + '"><span>' + label + '</span><input id="' + id + '" type="' + type + '" ' +
      (extra || "") + "></label>";
  }
  /* a message under the form; set in place, so nothing already typed is lost */
  function say(text, bad) {
    notice = text ? '<p class="form-note' + (bad ? " bad" : "") + '">' + esc(text) + "</p>" : "";
    var slot = host.querySelector("[data-note]");
    if (slot) slot.innerHTML = notice;
    else draw();
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
      html = '<form class="panel auth" novalidate>' + setAsideNote() +
        "<h2>Sign in or create an account</h2>" +
        "<p>An account keeps your progress, streak and attempt history in one place, so they follow you to " +
        "another browser or device. The course itself never needs one.</p>" +
        field("acct-email", "Email", "email", 'autocomplete="email" required') +
        field("acct-pass", "Password", "password", 'autocomplete="current-password" minlength="8"') +
        '<p class="actions"><button class="btn" id="acct-in" type="submit">Sign in</button>' +
        '<button class="btn ghost" id="acct-up" type="button">Create account</button></p>' +
        '<p class="actions quiet"><button class="link" id="acct-link" type="button">Email me a sign-in link instead</button>' +
        '<button class="link" id="acct-forgot" type="button">Forgot password</button></p>' +
        (cfg.google ? '<p class="actions"><button class="btn ghost" id="acct-google" type="button">Continue with Google</button></p>' : "") +
        NOTE + "</form>";
    } else {
      var st = status.state === "syncing" ? "Syncing…"
        : status.state === "error" ? "Sync failed: " + (status.error && status.error.message ? status.error.message : "unknown error")
        : status.at ? "Synced at " + status.at.toLocaleTimeString() : "Signed in";
      html = '<div class="panel"><h2>Your account</h2>' +
        "<p>Signed in as <b>" + esc(user.email || "") + "</b>.</p>" +
        '<p class="sync-state" data-state="' + status.state + '">' + esc(st) + "</p>" +
        field("acct-name", "Display name (optional)", "text", 'autocomplete="nickname" maxlength="60"') +
        '<p class="actions"><button class="btn" id="acct-save" type="button">Save name</button>' +
        '<button class="btn ghost" id="acct-sync" type="button">Sync now</button>' +
        '<button class="btn ghost" id="acct-out" type="button">Sign out</button></p>' + NOTE +
        '<p class="fine">Signing out saves your progress to your account, then clears this browser\'s copy. ' +
        "If it cannot be saved, it is set aside in this browser and saved the next time you sign in here.</p></div>" +
        '<div class="panel"><h2>Your data</h2>' +
        "<p>What is stored: the exercises you have solved, how many tries each took, whether a hint or the " +
        "solution was used, missions, XP per day, where you are in each chapter, and your game record " +
        "(achievements, which solutions you compared, medals and scores from the Arena, and when each " +
        "section is next due for review). Nothing else. Play settings and the combo meter stay on this device.</p>" +
        '<p class="actions"><button class="btn ghost" id="acct-export" type="button">Download my data</button>' +
        '<button class="btn ghost danger" id="acct-delete" type="button">Delete my account</button></p></div>';
    }
    /* a redraw keeps whatever is in the fields that survive it */
    var kept = {};
    Array.prototype.forEach.call(host.querySelectorAll("input[id]"), function (el) {
      if (el.type !== "password") kept[el.id] = el.value;
    });
    host.innerHTML = html.replace(NOTE, '<div data-note role="status" aria-live="polite">' + notice + "</div>");
    Object.keys(kept).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.value) el.value = kept[id];
    });
    wire();
  }

  function wire() {
    var form = host.querySelector("form");
    if (form) form.addEventListener("submit", function (e) { e.preventDefault(); });

    on("acct-in", function () {
      if (!val("acct-email") || !val("acct-pass")) return say("Enter your email and password.", true);
      Account.signIn(val("acct-email"), val("acct-pass")).then(function () { say(""); }, problem);
    });
    on("acct-up", function () {
      if (!val("acct-email") || val("acct-pass").length < 8) return say("Enter an email and a password of at least 8 characters.", true);
      Account.signUp(val("acct-email"), val("acct-pass")).then(function (d) {
        say(d && d.session ? "" : "Almost there — check your email for a link to confirm the account.");
      }, problem);
    });
    on("acct-link", function () {
      if (!val("acct-email")) return say("Enter your email first.", true);
      Account.emailLink(val("acct-email")).then(function () { say("A sign-in link is on its way to your inbox."); }, problem);
    });
    on("acct-forgot", function () {
      if (!val("acct-email")) return say("Enter your email first.", true);
      Account.forgot(val("acct-email")).then(function () { say("If that address has an account, a reset link is on its way."); }, problem);
    });
    on("acct-google", function () { Account.google().catch(problem); });
    on("acct-setpw", function () {
      if (val("acct-new").length < 8) return say("Use at least 8 characters.", true);
      Account.setPassword(val("acct-new")).then(function () { say("Password changed."); }, problem);
    });
    on("acct-save", function () {
      Account.saveProfile(val("acct-name")).then(function () { name = val("acct-name"); say("Saved."); }, problem);
    });
    on("acct-sync", function () { Account.syncNow(); });
    on("acct-out", function () { notice = ""; Account.signOut().catch(problem); });
    on("acct-export", function () {
      var blob = new Blob([JSON.stringify(Account.exportData(), null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "basic-mathematics-progress.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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
  }

  var name = null, nameFor = null, drawnFor = null, carry = null;
  Account.onChange(function () {
    if (user && nameFor !== user.id) {
      nameFor = user.id;
      Account.profile().then(function (p) { name = p && p.display_name ? p.display_name : ""; draw(); }, function () { name = ""; });
    }
    if (!user) { name = null; nameFor = null; }
    /* a redraw would wipe what is being typed — unless who is signed in has changed */
    var who = user ? user.id : null, active = document.activeElement;
    var typing = active && host.contains(active) && active.tagName === "INPUT";
    if (typing && who === drawnFor) return;
    if (who !== drawnFor) {
      notice = carry ? '<p class="form-note">' + esc(carry) + "</p>" : "";
      carry = null;
    }
    drawnFor = who;
    draw();
  });
  draw();
})();
