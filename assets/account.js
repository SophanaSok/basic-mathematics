/* ===========================================================================
   Basic Mathematics — accounts and sync
   Optional. The site saves everything locally (site.js); this file listens on
   BMStore and, for a signed-in reader, keeps a copy in Supabase so progress
   follows them between devices. Signed out, or with assets/config.js left empty,
   it loads nothing and sends nothing.

   Sync is a merge, never an overwrite: solved exercises and finished missions are
   unions, XP is the larger number for each day, lesson position is the furthest
   reached. Merging the same two states in either order gives the same result.
   =========================================================================== */
(function () {
  "use strict";

  var Store = window.BMStore, Site = window.BMSite;
  if (!Store || !Site) return;

  var cfg = window.BM_CONFIG || {};
  var configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  var SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  var META_KEY = "bm.sync.v1";
  var FIELDS = ["progress", "play", "attempts", "activity", "lesson", "last"];

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
      last: local.last || remote.last || null
    };
  }

  /* ----------------------------------------------------------- local state -- */

  function readLocal() {
    var out = {};
    FIELDS.forEach(function (f) { out[f] = Store.read(Store.keys[f], f === "last" ? null : {}); });
    return out;
  }
  function writeLocal(state) {
    FIELDS.forEach(function (f) { Store.write(Store.keys[f], state[f], true); });
    Store.emit({ type: "sync" });
  }
  function clearLocal() {
    var empty = {};
    FIELDS.forEach(function (f) { empty[f] = f === "last" ? null : {}; });
    writeLocal(empty);
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

  function setStatus(state, error) {
    status = { state: state, at: state === "synced" ? new Date() : status.at, error: error || null };
    notify();
  }
  function notify() {
    watchers.slice().forEach(function (fn) { try { fn(Account); } catch (e) { /* a watcher's own problem */ } });
  }

  function row(state, resetAt) {
    return {
      user_id: user.id,
      progress: state.progress || {}, play: state.play || {}, attempts: state.attempts || {},
      activity: state.activity || {}, lesson: state.lesson || {}, last: state.last || null,
      reset_at: resetAt || 0, updated_at: new Date().toISOString()
    };
  }

  function pull() {
    setStatus("syncing");
    return client.from("user_state").select("*").eq("user_id", user.id).maybeSingle().then(function (res) {
      if (res.error) throw res.error;
      var remote = res.data, m = meta(), local = readLocal();
      /* progress left by a different account on this browser is not this reader's */
      if (m.user && m.user !== user.id) local = {};
      /* a reset made on another device wins over what this one still remembers of the
         same account; progress made before ever signing in is kept and merged */
      var remoteReset = remote ? Number(remote.reset_at) || 0 : 0;
      if (m.user === user.id && remoteReset > (m.resetAt || 0)) local = {};
      var merged = merge(local, remote || {});
      setMeta(function (x) { x.user = user.id; x.resetAt = remoteReset; });
      writeLocal(merged);
      var same = remote && FIELDS.every(function (f) {
        return JSON.stringify(merged[f] || null) === JSON.stringify(remote[f] || null);
      });
      return same ? null : client.from("user_state").upsert(row(merged, remoteReset)).then(function (r) {
        if (r.error) throw r.error;
      });
    }).then(function () { setStatus("synced"); }, function (e) { setStatus("error", e); });
  }

  function push() {
    clearTimeout(pushTimer);
    pushTimer = null;
    if (!client || !user) return Promise.resolve();
    var events = queue;
    queue = [];
    setStatus("syncing");
    var jobs = [client.from("user_state").upsert(row(readLocal(), meta().resetAt))];
    if (events.length) jobs.push(client.from("attempts").insert(events));
    return Promise.all(jobs).then(function (results) {
      var failed = results.filter(function (r) { return r && r.error; })[0];
      if (failed) throw failed.error;
      setStatus("synced");
    }, function (e) { setStatus("error", e); }).catch(function (e) { setStatus("error", e); });
  }
  function schedule() {
    if (!user || pushTimer) return;
    pushTimer = setTimeout(push, 1500);
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
      /* stamp the reset so other devices drop their copies instead of merging them back */
      setMeta(function (m) { m.resetAt = Date.now(); });
      push();
    }
  });
  window.addEventListener("pagehide", function () { if (pushTimer) push(); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && pushTimer) push();
  });

  function onSession(session) {
    var next = session && session.user ? session.user : null;
    var changed = (next && next.id) !== (user && user.id);
    user = next;
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
    /* progress is safe in the account, so signing out leaves none behind on a shared machine */
    signOut: function () {
      return Account.ready().then(function (c) {
        return push().then(function () { return c.auth.signOut(); });
      }).then(function () {
        setMeta(function (m) { delete m.user; delete m.resetAt; });
        clearLocal();
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
      html = '<form class="panel auth" novalidate>' +
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
        '<p class="fine">Signing out clears this browser\'s copy of your progress; it stays in your account.</p></div>' +
        '<div class="panel"><h2>Your data</h2>' +
        "<p>What is stored: the exercises you have solved, how many tries each took, whether a hint or the " +
        "solution was used, missions, XP per day, and where you are in each chapter. Nothing else.</p>" +
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
      Account.deleteAccount().then(function () { say("Your account and its data have been deleted."); }, problem);
    });
    var nameEl = document.getElementById("acct-name");
    if (nameEl && name !== null) nameEl.value = name;
  }

  var name = null, nameFor = null, drawnFor = null;
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
    if (who !== drawnFor) notice = "";
    drawnFor = who;
    draw();
  });
  draw();
})();
