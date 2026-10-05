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
   sent (lacks).
   =========================================================================== */
(function () {
  "use strict";

  var Store = window.BMStore, Site = window.BMSite;
  if (!Store || !Site) return;

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
  var META_KEY = "bm.sync.v1";
  /* "game" only where site.js knows the key, so an older site.js still syncs cleanly */
  var FIELDS = ["progress", "play", "attempts", "activity", "lesson", "last", "game"].filter(function (f) {
    return !!Store.keys[f];
  });

  function obj(x) { return x && typeof x === "object" && !Array.isArray(x) ? x : {}; }
  /* The keys of both, each once. A key is data, whatever it is called: one named like
     something every object inherits ("constructor", "toString") is listed like any other,
     and at() reads only what the object itself holds, so the inherited thing is never
     mistaken for a value. The one exception is "__proto__", which cannot be written back
     as an ordinary field and is left out of every record built here. */
  function keysOf(a, b) {
    var seen = Object.create(null), out = [];
    Object.keys(obj(a)).concat(Object.keys(obj(b))).forEach(function (k) {
      if (k !== "__proto__" && !seen[k]) { seen[k] = true; out.push(k); }
    });
    return out.sort();
  }
  function at(o, k) { return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; }
  function plain(x) { return !!x && typeof x === "object" && !Array.isArray(x); }

  /* JSON with object keys sorted at every level: jsonb hands keys back in its own order */
  function canon(x) {
    if (Array.isArray(x)) return "[" + x.map(canon).join(",") + "]";
    if (x && typeof x === "object") {
      return "{" + Object.keys(x).sort().filter(function (k) { return x[k] !== undefined; })
        .map(function (k) { return JSON.stringify(k) + ":" + canon(x[k]); }).join(",") + "}";
    }
    return JSON.stringify(x === undefined ? null : x);
  }

  /* ------------------------------------------------------------- merging -- */

  /* What this version has no rule for is not its to drop: a later version of the site may
     have put it there. One rule covers every such value. Held by one side only, it is
     kept; held by both, the one whose canonical JSON (canon) is the later string is kept.
     That is a maximum, so order, grouping and repetition matter no more than they do for
     the fields with rules of their own. Each such field is merged by itself, not along
     with whichever record wins on the known fields. */
  function later(p, q) {
    if (p === undefined) return q;
    if (q === undefined) return p;
    return canon(p) >= canon(q) ? p : q;
  }
  /* adds to a freshly built record every field of x and y that is not in `known` */
  function carryOver(out, x, y, known) {
    keysOf(x, y).forEach(function (k) {
      if (known.indexOf(k) < 0) out[k] = later(at(x, k), at(y, k));
    });
    return out;
  }
  /* Where a store is keyed by chapter, exercise, section or the like, every key is merged
     as a record of that kind, whether this version knows the key or not: a chapter added
     next year must still merge as a chapter. So an object under a key this version does
     not know comes out with that kind's known fields filled in, and merged field by field
     when both sides hold one. A value that is a record on neither side has no fields to
     merge, and goes through whole; that includes a damaged value under a known key,
     which is no longer turned into an empty record here (site.js writes over it). */
  function opaque(p, q) { return !plain(p) && !plain(q); }

  function mergeProgress(a, b) {
    var out = {};
    keysOf(a, b).forEach(function (ch) {
      var p = at(obj(a), ch), q = at(obj(b), ch);
      if (opaque(p, q)) { out[ch] = later(p, q); return; }
      var x = obj(p), y = obj(q), solved = {};
      keysOf(x.solved, y.solved).forEach(function (k) { solved[k] = true; });
      out[ch] = carryOver({ solved: solved, total: Math.max(x.total || 0, y.total || 0) }, x, y, ["solved", "total"]);
    });
    return out;
  }

  function mergePlay(a, b) {
    var out = {};
    keysOf(a, b).forEach(function (ch) {
      var p = at(obj(a), ch), q = at(obj(b), ch);
      if (opaque(p, q)) { out[ch] = later(p, q); return; }
      var x = obj(p), y = obj(q), done = {};
      keysOf(x.done, y.done).forEach(function (k) { done[k] = true; });
      var rec = { done: done, total: Math.max(x.total || 0, y.total || 0) };
      var guess = x.guess !== undefined && x.guess !== null ? x.guess : y.guess;
      if (guess !== undefined && guess !== null) rec.guess = guess;
      out[ch] = carryOver(rec, x, y, ["done", "total", "guess"]);
    });
    return out;
  }

  /* The help ladder's position (`rung`, the highest clue opened while unsolved): the
     larger number. A value that is not a number (damaged, or written by a version that
     meant something else by it) loses to any number, and two such values fall back to
     the rule for unknown fields, so the result is still a maximum over one total order
     (numbers above everything else) and the merge laws hold. Present on neither side,
     absent; 0 is kept as it was written. */
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function maxRung(p, q) {
    if (p === undefined) return q;
    if (q === undefined) return p;
    if (isNum(p) && isNum(q)) return Math.max(p, q);
    if (isNum(p)) return p;
    if (isNum(q)) return q;
    return later(p, q);
  }

  /* one exercise's record seen from two devices */
  var ATTEMPT = ["tries", "hints", "rung", "opened", "inline", "section", "solved", "first", "skipped"];
  function mergeAttempt(x, y) {
    if (!plain(x) || !plain(y)) return plain(x) ? x : plain(y) ? y : later(x, y);
    var out = {};
    var tries = Math.max(x.tries || 0, y.tries || 0);
    var hints = Math.max(x.hints || 0, y.hints || 0);
    var rung = maxRung(at(x, "rung"), at(y, "rung"));
    if (tries) out.tries = tries;
    if (hints) out.hints = hints;
    if (rung !== undefined) out.rung = rung;
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
    return carryOver(out, x, y, ATTEMPT);
  }

  function mergeAttempts(a, b) {
    var out = {};
    keysOf(a, b).forEach(function (ch) {
      var p = at(obj(a), ch), q = at(obj(b), ch);
      if (opaque(p, q)) { out[ch] = later(p, q); return; }
      var x = obj(p), y = obj(q);
      out[ch] = {};
      keysOf(x, y).forEach(function (k) { out[ch][k] = mergeAttempt(at(x, k), at(y, k)); });
    });
    return out;
  }

  function mergeActivity(a, b) {
    a = obj(a); b = obj(b);
    var days = {};
    keysOf(a.days, b.days).forEach(function (d) {
      days[d] = Math.max(at(obj(a.days), d) || 0, at(obj(b.days), d) || 0);
    });
    var out = { days: days };
    var goal = a.goal || b.goal;
    if (goal) out.goal = goal;
    return carryOver(out, a, b, ["days", "goal"]);
  }

  function mergeLesson(a, b) {
    a = obj(a); b = obj(b);
    var reached = {};
    keysOf(a.reached, b.reached).forEach(function (ch) {
      reached[ch] = Math.max(at(obj(a.reached), ch) || 0, at(obj(b.reached), ch) || 0);
    });
    var out = { reached: reached };
    var mode = a.mode || b.mode;
    if (mode) out.mode = mode;
    return carryOver(out, a, b, ["reached", "mode"]);
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
       maxed  max
       v      max: the shape of the whole synced state (SCHEMA below); left out until a
              version of the site sets it
     Anything else in the record, or in one of its sec, best or enc entries, is carried
     (later). */
  function num(x) { x = Number(x); return isFinite(x) ? x : 0; }
  function str(x) { return typeof x === "string" ? x : ""; }
  var GAME = ["ach", "cmp", "sec", "best", "enc", "daily", "maxed", "v"];
  function mergeGame(a, b) {
    a = obj(a); b = obj(b);
    var out = { ach: {}, cmp: {}, sec: {}, best: {}, enc: {}, daily: {}, maxed: Math.max(num(a.maxed), num(b.maxed)) };
    var v = Math.max(num(a.v), num(b.v));
    if (v > 0) out.v = v;
    var ach = [obj(a.ach), obj(b.ach)];
    keysOf(ach[0], ach[1]).forEach(function (id) {
      var t = [num(at(ach[0], id)), num(at(ach[1], id))].filter(function (x) { return x > 0; });
      if (t.length) out.ach[id] = Math.min.apply(null, t);
    });
    var cmp = [obj(a.cmp), obj(b.cmp)];
    keysOf(cmp[0], cmp[1]).forEach(function (ch) {
      var x = obj(at(cmp[0], ch)), y = obj(at(cmp[1], ch)), rec = {};
      keysOf(x, y).forEach(function (k) { if (at(x, k) || at(y, k)) rec[k] = 1; });
      out.cmp[ch] = rec;
    });
    var sec = [obj(a.sec), obj(b.sec)];
    keysOf(sec[0], sec[1]).forEach(function (id) {
      var p = at(sec[0], id), q = at(sec[1], id);
      if (opaque(p, q)) { out.sec[id] = later(p, q); return; }
      var x = obj(p), y = obj(q);
      var n = Math.max(num(x.n), num(y.n));
      /* each side's ok is held to its own n first, which keeps the merge associative */
      var rec = { n: n, ok: Math.max(Math.min(num(x.ok), num(x.n)), Math.min(num(y.ok), num(y.n))) };
      var lx = str(x.last), ly = str(y.last);
      var pick = lx > ly || (lx === ly && num(x.box) >= num(y.box)) ? x : y;
      rec.box = num(pick.box);
      if (str(pick.last)) rec.last = str(pick.last);
      var fix = Math.max(num(x.fix), num(y.fix));
      if (fix) rec.fix = fix;
      out.sec[id] = carryOver(rec, x, y, ["n", "ok", "box", "last", "fix"]);
    });
    var best = [obj(a.best), obj(b.best)];
    keysOf(best[0], best[1]).forEach(function (mode) {
      var p = at(best[0], mode), q = at(best[1], mode);
      if (opaque(p, q)) { out.best[mode] = later(p, q); return; }
      var list = [p, q].filter(plain)
        .map(function (r) { return { score: num(r.score), hearts: num(r.hearts), day: str(r.day) }; });
      list.sort(function (r, s) {
        return (s.score - r.score) || (s.hearts - r.hearts) || (r.day < s.day ? -1 : r.day > s.day ? 1 : 0);
      });
      out.best[mode] = carryOver(list[0], obj(p), obj(q), ["score", "hearts", "day"]);
    });
    var enc = [obj(a.enc), obj(b.enc)];
    keysOf(enc[0], enc[1]).forEach(function (id) {
      var p = at(enc[0], id), q = at(enc[1], id);
      if (opaque(p, q)) { out.enc[id] = later(p, q); return; }
      var list = [p, q].filter(plain)
        .map(function (r) { return { medal: num(r.medal), day: str(r.day) }; });
      list.sort(function (r, s) { return (s.medal - r.medal) || (r.day < s.day ? -1 : r.day > s.day ? 1 : 0); });
      out.enc[id] = carryOver(list[0], obj(p), obj(q), ["medal", "day"]);
    });
    var daily = [obj(a.daily), obj(b.daily)];
    keysOf(daily[0], daily[1]).filter(function (d) { return at(daily[0], d) || at(daily[1], d); })
      .reverse().slice(0, 60).sort().forEach(function (d) { out.daily[d] = 1; });
    return carryOver(out, a, b, GAME);
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
  var pushTimer = null, queue = [], watchers = [];
  /* The account row as this page last read or wrote it: undefined until then, null
     when the account has no row yet, otherwise its updated_at exactly as the server
     sent it back. `owned` is set once this page has claimed this browser's progress
     for the reader, so a sign-out in another tab can be noticed. `ahead` is set while
     the reader's data is in a newer shape than this file may write (SCHEMA below). */
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
    status = { state: state, at: state === "synced" ? new Date() : status.at, error: error || null };
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

  /* The newest shape of the synced data this file understands. A later version of the
     site that changes what a known field means, so that the merge above would damage
     it, marks the data by saving a larger number as `v` in the game record (mergeGame
     keeps the largest). It travels inside the data so that no SQL has to run before a
     site that reads it is deployed, and in the game record because that is the one
     synced store whose top level is a fixed set of named fields, each with its own
     rule: the others are keyed by chapter, or hold this device's own choices. No `v`
     means 1, and this file never writes one, so what is stored today stays as it is.

     Data marked newer than SCHEMA is still merged into this browser, so the reader keeps
     working with everything they have, but the page then writes nothing to the account,
     neither the row nor the attempt log (`ahead`), and the account page asks for a
     reload, which fetches the newer site. */
  var SCHEMA = 1;
  function versionOf(state) { return num(obj(obj(state).game).v); }

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
      if (user && user.id === u.id) seen = res.data[0].updated_at;
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
      var remote = res.data, m = meta(), local = readLocal(), dropped = false;
      var aside = obj(pending()[u.id]), hasAside = !!aside.state;
      if (remote) learn(remote);
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
      /* only now has this page seen the row: had the merge failed, the next save would
         read and merge again instead of writing this browser's copy over it */
      seen = remote ? remote.updated_at : null;
      ahead = versionOf(remote) > SCHEMA || versionOf(merged) > SCHEMA;
      setMeta(function (x) { x.user = u.id; x.resetAt = resetAt; });
      owned = true;
      writeLocal(merged, dropped);
      function done() {
        if (hasAside) setPending(function (p) { delete p[u.id]; });
        return true;
      }
      var same = remote && remoteReset === resetAt && FIELDS.every(function (f) {
        return lacks[f] || canon(merged[f] || null) === canon(remote[f] || null);
      });
      if (same) return done();
      /* a newer shape: merged into this browser above and not written, and what was set
         aside stays set aside */
      if (ahead) return false;
      return write(u, merged, resetAt).then(function (ok) {
        if (ok) return done();
        if (tries >= 3) throw new Error("Another device kept saving at the same moment. Try Sync now.");
        return sync(u, tries + 1);
      });
    });
  }

  /* The attempt log is an extra. Resolves true when the rows were taken and false, with
     nothing thrown, when the project has no `attempts` table: that feature is off there,
     and progress still syncs. The page then holds the log back (logAfter) instead of
     sending all of it again with every save, tries once more every LOG_RETRY, and keeps
     only the newest LOG_MAX checks meanwhile, so a long visit cannot pile them up. */
  var LOG_RETRY = 5 * 60 * 1000, LOG_MAX = 500, logAfter = 0;
  function logHeld() { return Date.now() < logAfter; }
  function logAttempts(events) {
    return client.from("attempts").insert(events).then(function (r) {
      if (r.error && noTable(r.error)) { logAfter = Date.now() + LOG_RETRY; return false; }
      if (r.error) throw r.error;
      logAfter = 0;
      return true;
    });
  }

  /* Both resolve true when this browser's progress is in the account, false when it is
     not: it could not be saved (the reason is in status.error), or this file may not
     write it (status.state is "reload"). Neither ever rejects. */
  function pull() {
    var u = user;
    return serial(function () {
      if (!u || !user || user.id !== u.id) return false;
      setStatus("syncing");
      return sync(u, 0).then(function (ok) { setStatus(ahead ? "reload" : "synced"); return ok; },
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
      var events = queue, logged = false;
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
      /* the log waits for the save, which is what finds out whether this page may write */
      function log() {
        if (!events.length || ahead || logHeld()) return null;
        return logAttempts(events).then(function (ok) { logged = ok; });
      }
      var sent = save.then(log, log);
      return sent.then(noop, noop).then(function () {
        /* a log that did not go, whatever the reason, goes again with the next save */
        if (!logged && user && user.id === u.id) queue = events.concat(queue);
        return Promise.all([save, sent]);
      }).then(function (r) { setStatus(ahead ? "reload" : "synced"); return r[0]; }, function (e) {
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
    var u = user, state = readLocal();
    if (meta().user !== u.id) return;
    write(u, state, Number(meta().resetAt) || 0).then(noop, noop);
    if (ahead || !queue.length || logHeld()) return;
    var events = queue;
    queue = [];
    logAttempts(events).then(function (ok) {
      if (!ok && user && user.id === u.id) queue = events.concat(queue);
    }, noop);
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
      if (logAfter && queue.length > LOG_MAX) queue = queue.slice(-LOG_MAX);
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
      ahead = false;
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
    recovering: false,
    merge: merge,
    mergeGame: mergeGame,
    providers: providers.slice(),
    label: label,
    methods: methodIds,
    urlError: urlError,
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
      var who = label(user), initial = (who || "?").charAt(0).toUpperCase();
      a.innerHTML = '<span class="avatar" aria-hidden="true">' + Site.escapeHtml(initial) + "</span>" +
        '<span class="visually-hidden">Your account</span>';
      a.setAttribute("title", "Signed in" + (who ? " as " + who : ""));
      a.setAttribute("data-in", "true");
    } else {
      a.textContent = "Sign in";
      a.removeAttribute("title");
      a.removeAttribute("data-in");
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
  var notice = "", NOTE = "<!--note-->";

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
    if (r.error === "access_denied") return "Sign-in was cancelled or refused, so nothing has changed. You can try again.";
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
  function say(text, bad) {
    /* a new message replaces the one about the sign-in that did not go through */
    var old = document.getElementById("acct-returned");
    if (old) old.parentNode.removeChild(old);
    returnedText = "";
    sayHere("");
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
      var who = label(user), ways = methodNames(user);
      html = '<div class="panel"><h2>Your account</h2>' +
        "<p>Signed in" + (who ? " as <b>" + esc(who) + "</b>" : "") + ".</p>" +
        (ways.length ? '<p class="fine">' + (ways.length > 1 ? "You can sign in to this account with " : "You sign in with ") +
          esc(listOf(ways)) + ".</p>" : "") +
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
        "section is next due for review). Play settings and the combo meter stay on this device. The account itself " +
        "holds your email address and, if you signed in through another service, the details that service passed on, " +
        "such as your name, username, picture address and your account id there. While you are signed in that way, this browser also keeps a key from " +
        "that service, which signing out removes; to cut the link completely, remove this site from the connected " +
        "apps in that service's settings.</p>" +
        '<p class="actions"><button class="btn ghost" id="acct-export" type="button">Download my data</button>' +
        '<button class="btn ghost danger" id="acct-delete" type="button">Delete my account</button></p></div>';
    }
    /* a redraw keeps whatever is in the fields that survive it */
    var kept = {}, held = document.activeElement && document.activeElement.id === "acct-returned";
    Array.prototype.forEach.call(host.querySelectorAll("input[id]"), function (el) {
      if (el.type !== "password") kept[el.id] = el.value;
    });
    host.innerHTML = html.replace(NOTE, '<div data-note role="status" aria-live="polite">' + notice + "</div>");
    Object.keys(kept).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.value) el.value = kept[id];
    });
    wire();
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
    /* a message about a sign-in that did not go through is no use to a reader who is signed in */
    if (user) returnedText = "";
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
