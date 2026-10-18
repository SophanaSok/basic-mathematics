#!/usr/bin/env node
/* The Daily board on the site (assets/arena.js, assets/account.js; decision 0006), in
   headless Chromium:
     node tools/game/board.test.js

   The site is served in-process as lib/target.js picks it (the build in dist/, which must
   be current). As in tools/game/account.test.js, each case pins window.BM_CONFIG and puts
   a stand-in for supabase-js on window.supabase before the page's scripts run. The
   stand-in plays the server's part of supabase/schema.sql: the profile's board says
   whether the reader joined, submit_daily refuses with "not on the board" until it is
   true, an upsert of { board: true } joins, leave_board leaves; daily_board answers the
   case's canned rows; a case can make a call fail with a given message and code, or hold
   leave_board until the test lets it go. It records every rpc(name, args) and every
   from("profiles") select and upsert in localStorage, so the record survives a reload, and
   every console.warn the page makes. Every request off the local server is aborted.

   A finished Daily is reached by playing a real one: five questions answered on the page,
   from a deck of every section the generators cover (as tools/game/arena.test.js does),
   one of them wrong first time for a run with a miss, every one on the clock and right
   first time for a clean run. For a clean run of a known time the page's clock is held
   still (Date.now fixed) and each question's elapsed time set before it is checked. A
   reload on the result screen draws the result again from bm.run.v1 (arena.js's load
   path), which is the re-render the checks use.

   1. board on, signed out: "Sign in to join the Daily board." with a link to the account
      page, and nothing asked of the account service
   2. signed in, the profile says board false: the join button and no table, and no
      submit_daily at all; pressing it upserts { id, board: true }, then sends submit_daily
      once with the run's day, score, 5 questions, first-try count and no time (the run had
      a miss), then fetches daily_board and draws it. When the profile cannot tell (no board
      column), one submit is sent, its refusal draws the join button, and a reload neither
      resends it nor loses the button (bm.run.v1.board.refused)
   3. signed in and on the board, a clean run of 15 s: submit_daily once with p_ms 15000; a
      canned board of 12 with the reader 4th draws 12 rows, the fourth marked data-mine, a
      handle written as markup shown as text; bm.run.v1.board is { day, sent, rank 4, size
      12 }; the lobby's Daily tile then says "Today: 4th of 12", and says nothing of it once
      the browser holds no session. A board of 5 with no row of the reader's still draws,
      and the tile takes the rank the submit returned
   4. an empty board, and a board of two entries, say the board appears once three people
      have played; no rank is kept and the tile is silent
   5. drawing the result again (a reload on the result screen) fetches the board again and
      never sends submit_daily a second time
   6. BM_CONFIG.board "off": no board section, no call, and no Daily board switch on the
      account page, whose profile read asks for the name only
   7. the account page, signed in: #acct-board reflects the profile's board; checking it
      upserts { id, board: true }; unchecking it calls leave_board and forgets
      bm.run.v1.board; a refused leave_board shows "Could not update the Daily board just
      now." in [data-note], logs the server's message as a warning, and the switch goes back
      on; while a change is in flight a redraw keeps the switch disabled, showing the state
      asked for
   8. no page errors, console errors or Content-Security-Policy violations in any case
   9. a replayed Daily and a Standard run send nothing and draw no board
  10. a submit_daily refused for a reason other than the opt-in (a check constraint, 23514)
      draws neither the join button nor a board, and fetches none
  11. a missing function (PostgREST PGRST202) draws nothing and warns once
  12. daily_board failing after a submit that went through leaves bm.run.v1.board with no
      size and the Daily tile silent
  13. a sign-out, and an account deleted, forget bm.run.v1.board
  14. a clean time of 900 ms over 5 questions (under a quarter second each) is sent as
      p_ms null, with the score
  A managed learner is seeded in the sync meta ({ learner: "L1", acct: "u1", learnerName })
  before account.js runs; the stand-in's learners select answers { id: "L1" }.
  15. a finished, non-replay Daily as a managed learner draws no board section, calls
      neither submit_daily nor daily_board, and the Daily tile shows no "Today:" line
  16. the top bar chip reads "Playing as Kim" (title and hidden text), shows the initial K
      and data-learner; signed in as self it is unchanged
  17. the account page as a managed learner draws no #acct-board switch; as self it does
  18. the progress page as a managed learner shows the "Showing Kim's progress" line with
      the account link; as self it does not
  19. a learner named <b>x</b> renders as text in the chip and the line
  20. a learner dropped on load returns the chip to "Your account" and the board switch;
      renaming the active learner updates the chip
  21. a Daily started as a learner, then the other tab switches to self: the stale tab
      writes nothing, the reload drops the run with a "not counted" line, nothing is paid
      and submit_daily is never sent
  22. a result drawn before the session is read (restored) has no board slot, and the
      tile no Today: line
  23. the progress page's line is there on first paint; the initial is a whole character */
"use strict";
const site = require("../lib/site");
const target = require("../lib/target");
const { chromium } = require("../lib/pw").playwright();

let fails = 0, passes = 0;
function check(cond, what, detail) {
  if (cond) passes++;
  else { fails++; console.error("FAIL " + what + (detail === undefined ? "" : "\n     " + JSON.stringify(detail))); }
}

/* What account.js and arena.js find on window.supabase in place of supabase-js. */
const SDK = `
window.__warns = [];
(function () {
  var warn = console.warn;
  console.warn = function () {
    window.__warns.push(Array.prototype.map.call(arguments, String).join(" "));
    return warn.apply(console, arguments);
  };
})();
window.supabase = { createClient: function () {
  var S = window.__stub || {}, subs = [];
  function answer(data) { return { data: data, error: null }; }
  function refuse(message, code) { return { data: null, error: { message: message, code: code || "P0001" } }; }
  function log(c) {
    var all = JSON.parse(localStorage.getItem("__calls") || "[]");
    all.push(c);
    localStorage.setItem("__calls", JSON.stringify(all));
  }
  function onBoard() { return localStorage.getItem("__onboard") === "1"; }
  function query(table) {
    var write = false, op = null, args = null, api = {
      select: function (cols) { if (!op) { op = "select"; args = cols; } return api; },
      eq: function () { return api; }, maybeSingle: function () { return api; },
      insert: function (row) { write = true; op = op || "insert"; return api; },
      update: function (row) { write = true; op = op || "update"; return api; },
      upsert: function (row) { write = true; op = "upsert"; args = row; return api; },
      then: function (ok, bad) {
        var res;
        if (table === "profiles") {
          log({ from: "profiles", op: op, args: args });
          if (op === "upsert") {
            if (args && args.board === true) localStorage.setItem("__onboard", "1");
            res = answer(null);
          } else res = answer(S.profileNoBoard ? { display_name: "Reader" } : { display_name: "Reader", board: onBoard() });
        } else if (table === "learners") {
          res = answer(S.learnerGone ? null : { id: "L1" });
        } else res = answer(write ? [{ updated_at: new Date().toISOString() }] : null);
        return Promise.resolve(res).then(ok, bad);
      }
    };
    return api;
  }
  return {
    from: query,
    rpc: function (name, args) {
      log({ rpc: name, args: args === undefined ? null : args });
      if (name === "submit_daily") {
        if (S.submitError) return Promise.resolve(refuse(S.submitError.message, S.submitError.code));
        return Promise.resolve(onBoard() ? answer(S.rank === undefined ? 4 : S.rank) : refuse("not on the board"));
      }
      if (name === "daily_board") {
        if (S.boardError) return Promise.resolve(refuse(S.boardError.message, S.boardError.code));
        var canned = localStorage.getItem("__board");
        return Promise.resolve(answer(canned ? JSON.parse(canned) : S.board || []));
      }
      if (name === "leave_board") {
        var res = S.leaveFails ? refuse("The board could not be left just now.") : answer(null);
        var done = function () { if (!S.leaveFails) localStorage.setItem("__onboard", "0"); return res; };
        if (S.hold) return new Promise(function (r) { window.__release = function () { r(done()); }; });
        return Promise.resolve(done());
      }
      return Promise.resolve(answer(null));
    },
    auth: {
      onAuthStateChange: function (cb) { subs.push(cb); return { data: { subscription: { unsubscribe: function () {} } } }; },
      getSession: function () {
        var wait = Number(localStorage.getItem("__sessdelay")) || 0;
        return new Promise(function (r) { setTimeout(function () { r(answer({ session: window.__session || null })); }, wait); });
      },
      signOut: function () { window.__session = null; subs.forEach(function (cb) { cb("SIGNED_OUT", null); }); return Promise.resolve({ error: null }); }
    }
  };
} };`;

const SESSION = { user: { id: "u1", email: "reader@example.com", app_metadata: { provider: "email", providers: ["email"] } } };

/* twelve rows with the reader 4th; the first handle is markup, to be shown as text */
function twelve() {
  const out = [];
  for (let k = 1; k <= 12; k++) {
    out.push({ rank: k, handle: k === 1 ? "<b>x</b>" : "Calm prism " + k, score: 1000 - k * 10, ms: k % 3 ? 20000 + k * 1000 : null, mine: k === 4, entries: 12 });
  }
  return out;
}

(async () => {
  const server = await target.start(site.parseArgs(process.argv.slice(2)));
  console.log("board: " + server.where);
  const browser = await chromium.launch({ env: require("../lib/gl").env(chromium) });   /* off the machine's GPU: lib/gl.js */
  const errors = [];
  const contexts = [];

  /* a fresh profile with this config, signed in or not, and the stand-in's options */
  async function context(config, opts) {
    opts = opts || {};
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    contexts.push(c);
    await c.route(/^(https?|wss?):/, (r) => server.owns(r.request().url()) ? r.continue() : r.abort());
    await c.addInitScript(SDK);
    await c.addInitScript((seed) => {
      const pinned = Object.assign({ supabaseUrl: "https://testref.supabase.co", supabaseAnonKey: "sb_publishable_test", providers: [] }, seed.config);
      Object.defineProperty(window, "BM_CONFIG", { get: () => pinned, set: () => {}, configurable: false });
      window.__session = seed.session || null;
      window.__stub = seed.stub || {};
    }, { config, session: opts.signedIn ? SESSION : null, stub: opts.stub || {} });
    return c;
  }
  async function page(c) {
    const p = await c.newPage();
    p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    p.on("console", (m) => {
      if (m.type() !== "error") return;
      if (/Failed to load resource|net::ERR_/.test(m.text())) return;
      errors.push("console: " + m.text());
    });
    return p;
  }
  /* the Arena with a full deck; signed in means a stored session the page will pick up */
  async function arena(c, opts) {
    opts = opts || {};
    const p = await page(c);
    await p.goto(server.url + "arena.html");
    await p.evaluate((o) => {
      localStorage.clear();
      var all = {}, t = Date.now() - 864e5 * 2;
      window.BMGen.list().forEach(function (s) {
        var ch = s.section.split("#")[0], sec = s.section.split("#")[1], recs = all[ch] = all[ch] || {};
        recs["z" + sec + "1"] = { tries: 1, first: 1, solved: t, section: sec };
        recs["z" + sec + "2"] = { tries: 1, first: 1, solved: t + 1, section: sec };
      });
      localStorage.setItem("bm.attempts.v1", JSON.stringify(all));
      if (o.signedIn) localStorage.setItem("sb-testref-auth-token", "{}");
      /* a managed learner chosen on this browser: the sync meta account.js keeps (seeded once, so its own writes survive) */
      if (o.learner) localStorage.setItem("bm.sync.v1", JSON.stringify({ learner: "L1", acct: "u1", learnerName: o.learner }));
      if (o.onBoard) localStorage.setItem("__onboard", "1");
    }, opts);
    await p.goto(server.url + "arena.html");
    await p.waitForFunction(() => document.readyState === "complete" && document.querySelector('[data-act="start"][data-mode="daily"]'));
    /* the first sync redraws the lobby; start once it has settled */
    if (opts.signedIn) await p.waitForFunction(() => window.BMAccount && window.BMAccount.status().state === "synced");
    await p.evaluate(() => localStorage.setItem("__calls", "[]"));
    return p;
  }
  /* a real run (the Daily unless `mode`), to the result: every question on the clock,
     right first time, except the first one when `miss`. With `secs` the clock is held still
     and each question takes exactly that long. With `replay` the day's Daily is marked
     played elsewhere once the run has started. */
  async function play(p, o) {
    o = o || {};
    if (o.secs) await p.evaluate(() => { var t = Date.now(); window.__realNow = Date.now; Date.now = function () { return t; }; });
    await p.click('[data-act="start"][data-mode="' + (o.mode || "daily") + '"]');
    await p.waitForSelector(".arena-run");
    await p.evaluate((replay) => {
      var r = window.BMArena.state();
      r.qs.forEach(function (q) { q.timed = true; q.hf = false; q.par = Math.max(q.par, 120); });
      if (replay) {
        var all = JSON.parse(localStorage.getItem("bm.run.v1"));
        all.daily = { day: window.BMSite.dayKey(), score: 700, firstTry: 5, n: 5, ended: "complete" };
        localStorage.setItem("bm.run.v1", JSON.stringify(all));
      }
    }, !!o.replay);
    for (let k = 0; k < 14; k++) {
      if (await p.$(".arena-result")) break;
      const wrong = o.miss && k === 0;
      await p.evaluate(({ wrong, secs }) => {
        var r = window.BMArena.state(), q = r.qs[r.i];
        if (secs) r.cur.el = secs;
        document.getElementById("arena-answer").value = wrong ? "987654321" : String(window.BMGen.make(q.g, q.s).answer).split("|")[0];
      }, { wrong, secs: o.secs || 0 });
      await p.click('.arena-run [data-act="check"]');
      if (wrong) {
        await p.evaluate(() => {
          var r = window.BMArena.state(), q = r.qs[r.i];
          document.getElementById("arena-answer").value = String(window.BMGen.make(q.g, q.s).answer).split("|")[0];
        });
        await p.click('.arena-run [data-act="check"]');
      }
      await p.click('.arena-feedback [data-act="next"]');
    }
    await p.waitForSelector(".arena-result");
    if (o.secs) await p.evaluate(() => { Date.now = window.__realNow; });
    return p.evaluate(() => window.BMArena.state().result);
  }
  const calls = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("__calls") || "[]"));
  const rpcs = (list, name) => list.filter((c) => c.rpc === name);
  const runBoard = (p) => p.evaluate(() => (JSON.parse(localStorage.getItem("bm.run.v1") || "{}")).board || null);
  const boardWarns = (p) => p.evaluate(() => window.__warns.filter((w) => /Daily board/.test(w)));
  /* settles once the board's slot holds its section, of the kind asked for */
  const boardDrawn = (p, what) => p.waitForFunction((w) => {
    var s = document.querySelector("[data-arena-board] .arena-board");
    if (!s) return false;
    if (w === "table") return !!s.querySelector("table");
    if (w === "join") return !!s.querySelector('[data-act="board-join"]');
    if (w === "three") return /three people/.test(s.textContent);
    return true;
  }, what, { timeout: 5000 });
  /* the slot stays empty: give the page a moment, then read it */
  const slotAfter = async (p, ms) => {
    await p.waitForTimeout(ms || 400);
    return p.evaluate(() => {
      var slot = document.querySelector("[data-arena-board]");
      return { slot: !!slot, html: slot ? slot.innerHTML : null, section: !!document.querySelector(".arena-board"), join: !!document.querySelector('[data-act="board-join"]') };
    });
  };
  const dailyTile = (p) => p.$eval('[data-act="start"][data-mode="daily"]', (b) => b.textContent.replace(/\s+/g, " "));
  /* the tile's place is drawn a tick after load, once account.js is up */
  const toLobby = async (p) => {
    await p.goto(server.url + "arena.html");
    await p.waitForSelector('[data-act="start"][data-mode="daily"]');
    await p.waitForTimeout(300);
  };

  try {
    /* 1. signed out */
    {
      const c = await context({});
      const p = await arena(c);
      const res = await play(p);
      check(res.mode === "daily" && res.finished && !res.replay, "1 a finished Daily", res);
      await boardDrawn(p);
      const seen = await p.evaluate(() => {
        var s = document.querySelector(".arena-board"), a = s && s.querySelector("a");
        return { text: s && s.textContent, href: a && a.getAttribute("href"), table: !!(s && s.querySelector("table")) };
      });
      check(/Sign in to join the Daily board\./.test(seen.text) && /account\.html$/.test(seen.href || ""), "1 signed out, the result says to sign in, with a link to the account page", seen);
      check(!seen.table, "1 … and draws no table");
      const got = await calls(p);
      check(got.length === 0, "1 signed out, nothing is asked of the account service", got);
      check(await p.evaluate(() => !window.BMAccount.user()), "1 nobody is signed in");
      await c.close();
    }

    /* 2. signed in, the profile says not on the board, then joining */
    {
      const c = await context({}, { signedIn: true, stub: { board: twelve().slice(0, 3).map((r) => Object.assign({}, r, { entries: 3, mine: r.rank === 2 })), rank: 2 } });
      const p = await arena(c, { signedIn: true });
      const res = await play(p, { miss: true });
      check(res.firstTry === 4 && res.n === 5 && res.clean === null, "2 a Daily with a miss: 4 of 5 first try, not clean", { firstTry: res.firstTry, n: res.n, clean: res.clean });
      await boardDrawn(p, "join");
      const before = await calls(p);
      const shown = await p.evaluate(() => {
        var s = document.querySelector(".arena-board"), b = s.querySelector('button.btn[data-act="board-join"]');
        return { text: s.textContent.replace(/\s+/g, " "), table: !!s.querySelector("table"), button: b ? b.textContent : null };
      });
      check(shown.button === "Join the Daily board" && !shown.table, "2 not on the board: the join button and no table", shown);
      check(/made-up name/.test(shown.text) && /score/.test(shown.text) && /time/.test(shown.text) && /removes your rows/.test(shown.text), "2 the join line says what others see and that off removes your rows", shown.text);
      check(before.some((x) => x.from === "profiles" && x.op === "select" && x.args === "display_name, board"), "2 the profile is asked whether the reader joined", before);
      check(rpcs(before, "submit_daily").length === 0 && rpcs(before, "daily_board").length === 0, "2 the profile says board false: no submit_daily, no board fetched", before);
      check((await runBoard(p) || {}).refused === res.day, "2 the refusal is kept in bm.run.v1.board.refused", await runBoard(p));
      await p.click('[data-act="board-join"]');
      await boardDrawn(p, "table");
      const after = (await calls(p)).slice(before.length);
      const ups = after.filter((x) => x.from === "profiles" && x.op === "upsert");
      check(ups.length === 1 && JSON.stringify(ups[0].args) === JSON.stringify({ id: "u1", board: true }), "2 joining upserts { id, board: true } and nothing else", ups);
      const subs = rpcs(after, "submit_daily");
      check(subs.length === 1, "2 then submit_daily once", subs);
      const want = { p_day: res.day, p_score: res.score, p_n: 5, p_firsts: res.firstTry, p_ms: null };
      check(subs.length === 1 && JSON.stringify(subs[0].args) === JSON.stringify(want), "2 with the run's day, score, 5, first-try count and no time for a run with a miss", { got: subs[0] && subs[0].args, want });
      const order = after.map((x) => x.rpc || x.from + "." + x.op).filter((x) => /upsert|submit_daily|daily_board/.test(x));
      check(JSON.stringify(order) === JSON.stringify(["profiles.upsert", "submit_daily", "daily_board"]), "2 in the order upsert, submit, fetch", order);
      check(await p.$$eval(".arena-board-table tbody tr", (r) => r.length) === 3, "2 the fetched board is drawn");
      const rec = await runBoard(p);
      check(rec && rec.sent === 1 && rec.rank === 2 && rec.size === 3 && !rec.refused, "2 once joined, the record is the board's", rec);
      await c.close();
    }

    /* 2. the profile cannot tell (no board column yet): one submit, its refusal kept */
    {
      const c = await context({}, { signedIn: true, stub: { profileNoBoard: true } });
      const p = await arena(c, { signedIn: true });
      const res = await play(p);
      await boardDrawn(p, "join");
      check(rpcs(await calls(p), "submit_daily").length === 1, "2 the profile cannot tell: one submit, refused, then the join button");
      check((await runBoard(p) || {}).refused === res.day, "2 … and the refusal is kept", await runBoard(p));
      await p.reload();
      await p.waitForSelector(".arena-result");
      await boardDrawn(p, "join");
      await p.waitForTimeout(200);
      check(rpcs(await calls(p), "submit_daily").length === 1, "2 a reload draws the join button again without resending", rpcs(await calls(p), "submit_daily"));
      await c.close();
    }

    /* 3 and 5. on the board, a clean run of 15 seconds */
    {
      const c = await context({}, { signedIn: true, stub: { board: twelve(), rank: 4 } });
      const p = await arena(c, { signedIn: true, onBoard: true });
      const res = await play(p, { secs: 3 });
      check(res.clean && res.clean.ms === 15000, "3 a clean Daily of 5 × 3 s", res.clean);
      await boardDrawn(p, "table");
      const got = await calls(p);
      const subs = rpcs(got, "submit_daily");
      check(subs.length === 1 && subs[0].args.p_ms === 15000 && subs[0].args.p_firsts === 5 && subs[0].args.p_n === 5 && subs[0].args.p_day === res.day && subs[0].args.p_score === res.score,
        "3 submit_daily once, with the run's clean ms", subs);
      check(rpcs(got, "daily_board").length === 1 && JSON.stringify(rpcs(got, "daily_board")[0].args) === JSON.stringify({ p_day: res.day }), "3 then daily_board for the run's day", rpcs(got, "daily_board"));
      const table = await p.evaluate(() => {
        var s = document.querySelector(".arena-board"), rows = Array.from(s.querySelectorAll(".arena-board-table tbody tr"));
        return {
          h: (s.querySelector("h3") || {}).textContent, rows: rows.length,
          mine: rows.map((r, i) => r.getAttribute("data-mine") === "true" ? i : -1).filter((i) => i > -1),
          first: rows[0] && rows[0].children[1].textContent, bold: s.querySelectorAll("tbody b").length,
          times: rows.map((r) => r.children[3].textContent), cols: Array.from(s.querySelectorAll("thead th")).map((t) => t.textContent),
          note: s.textContent
        };
      });
      check(table.h === "Today's Daily board", "3 the heading", table.h);
      check(table.rows === 12, "3 twelve rows drawn", table.rows);
      check(JSON.stringify(table.mine) === "[3]", "3 the fourth row, and only it, is the reader's (data-mine)", table.mine);
      check(table.first === "<b>x</b>" && table.bold === 0, "3 a handle written as markup is shown as text", { first: table.first, bold: table.bold });
      check(table.times[0] === "0:21.0" && table.times[2] === "—", "3 times as m:ss.t, a missing one as a dash", table.times.slice(0, 3));
      check(JSON.stringify(table.cols) === JSON.stringify(["Rank", "Name", "Score", "Time"]), "3 rank, name, score and time", table.cols);
      check(/Names are made up for the day; the Daily draws from each player's own deck\./.test(table.note), "3 the line about names and decks", table.note);
      const rec = await runBoard(p);
      check(rec && rec.day === res.day && rec.rank === 4 && rec.size === 12 && rec.sent === 1, "3 bm.run.v1.board keeps day, sent, rank 4 and size 12", rec);

      /* 5. drawn again from bm.run.v1 by a reload on the result screen */
      await p.reload();
      await p.waitForSelector(".arena-result");
      await boardDrawn(p, "table");
      const again = await calls(p);
      check(rpcs(again, "submit_daily").length === 1, "5 a redrawn result does not send submit_daily again", rpcs(again, "submit_daily").length);
      check(rpcs(again, "daily_board").length === 2, "5 … and fetches the board again", rpcs(again, "daily_board").length);

      /* the lobby, arrived at fresh */
      await toLobby(p);
      const tile = await dailyTile(p);
      check(/Today: 4th of 12\./.test(tile), "3 the Daily tile says Today: 4th of 12", tile);
      check(rpcs(await calls(p), "submit_daily").length === 1, "5 the lobby sends nothing", null);
      /* no session in this browser any more: no place on the tile */
      await p.evaluate(() => localStorage.removeItem("sb-testref-auth-token"));
      await toLobby(p);
      check(!/Today:/.test(await dailyTile(p)), "3 with no session held, the tile shows no place", await dailyTile(p));
      await c.close();
    }

    /* 3. a board of five with no row of the reader's */
    {
      const five = [1, 2, 3, 4, 5].map((k) => ({ rank: k, handle: "Keen torus " + k, score: 900 - k, ms: 30000 + k, mine: false, entries: 5 }));
      const c = await context({}, { signedIn: true, stub: { board: five, rank: 3 } });
      const p = await arena(c, { signedIn: true, onBoard: true });
      await play(p);
      await boardDrawn(p, "table");
      const seen = await p.evaluate(() => ({ rows: document.querySelectorAll(".arena-board-table tbody tr").length, mine: document.querySelectorAll(".arena-board-table [data-mine]").length }));
      check(seen.rows === 5 && seen.mine === 0, "3 five rows with no row of the reader's still draw", seen);
      const rec = await runBoard(p);
      check(rec && rec.rank === 3 && rec.size === 5, "3 … and the rank kept is the submit's", rec);
      await p.click('.arena-result [data-act="lobby"]');
      check(/Today: 3rd of 5\./.test(await dailyTile(p)), "3 the tile says Today: 3rd of 5", await dailyTile(p));
      await c.close();
    }

    /* 4. the "three people" line */
    for (const [label, canned] of [["an empty board", []], ["a board of two entries", [{ rank: 1, handle: "Calm prism", score: 500, ms: null, mine: true, entries: 2 }]]]) {
      const c = await context({}, { signedIn: true, stub: { board: canned, rank: null } });
      const p = await arena(c, { signedIn: true, onBoard: true });
      await play(p);
      await boardDrawn(p, "three");
      const seen = await p.evaluate(() => { var s = document.querySelector(".arena-board"); return { text: s.textContent, table: !!s.querySelector("table") }; });
      check(/The board appears once three people have played today's Daily\./.test(seen.text) && !seen.table, "4 " + label + ": the three-people line and no table", seen);
      const rec = await runBoard(p);
      check(rec && rec.rank === null && rec.sent === 1, "4 " + label + ": no rank is kept", rec);
      await p.click('.arena-result [data-act="lobby"]');
      const tile = await dailyTile(p);
      check(!/Today:/.test(tile), "4 " + label + ": the Daily tile shows no place", tile);
      await c.close();
    }

    /* 9. a replayed Daily, and a Standard run */
    {
      const c = await context({}, { signedIn: true, stub: { board: twelve() } });
      const p = await arena(c, { signedIn: true, onBoard: true });
      const res = await play(p, { replay: true });
      check(res.replay === true, "9 the Daily is a replay", res.replay);
      const seen = await slotAfter(p);
      check(!seen.slot && !seen.section, "9 a replayed Daily draws no board", seen);
      check((await calls(p)).length === 0, "9 … and sends nothing", await calls(p));
      await p.click('.arena-result [data-act="lobby"]');
      const std = await play(p, { mode: "standard" });
      check(std.mode === "standard" && std.finished, "9 a Standard run, finished", std.mode);
      const seen2 = await slotAfter(p);
      check(!seen2.slot && !seen2.section, "9 a Standard run draws no board", seen2);
      check((await calls(p)).length === 0, "9 … and sends nothing", await calls(p));
      await c.close();
    }

    /* 10. refused for another reason: a check constraint */
    {
      const c = await context({}, { signedIn: true, stub: { submitError: { message: 'new row for relation "daily_runs" violates check constraint "daily_runs_score_check"', code: "23514" } } });
      const p = await arena(c, { signedIn: true, onBoard: true });
      await play(p);
      const seen = await slotAfter(p, 600);
      check(seen.slot && !seen.section && !seen.join, "10 a constraint error draws no join button and no board", seen);
      const got = await calls(p);
      check(rpcs(got, "submit_daily").length === 1 && rpcs(got, "daily_board").length === 0, "10 … one submit, and no board fetched", got);
      check((await boardWarns(p)).length === 1, "10 … and one warning", await boardWarns(p));
      check(!(await runBoard(p)), "10 … and nothing kept", await runBoard(p));
      await c.close();
    }

    /* 11. the function is missing (the migration not applied) */
    {
      const c = await context({}, { signedIn: true, stub: { submitError: { message: "Could not find the function public.submit_daily(p_day, p_firsts, p_ms, p_n, p_score) in the schema cache", code: "PGRST202" } } });
      const p = await arena(c, { signedIn: true, onBoard: true });
      await play(p);
      const seen = await slotAfter(p, 600);
      check(seen.slot && !seen.section, "11 a missing function draws nothing", seen);
      const warns = await boardWarns(p);
      check(warns.length === 1 && /schema cache/.test(warns[0]), "11 … and warns once", warns);
      await c.close();
    }

    /* 12. daily_board fails after the submit went through */
    {
      const c = await context({}, { signedIn: true, stub: { boardError: { message: "upstream timeout", code: "57014" }, rank: 4 } });
      const p = await arena(c, { signedIn: true, onBoard: true });
      const res = await play(p);
      const seen = await slotAfter(p, 600);
      check(seen.slot && !seen.section, "12 a failed board fetch draws nothing", seen);
      const rec = await runBoard(p);
      check(rec && rec.day === res.day && rec.sent === 1 && !("size" in rec) && !("rank" in rec), "12 bm.run.v1.board says sent, with no size and no rank", rec);
      await p.click('.arena-result [data-act="lobby"]');
      check(!/Today:/.test(await dailyTile(p)), "12 the Daily tile shows no place", await dailyTile(p));
      await c.close();
    }

    /* 14. a clean time too short to be real */
    {
      const c = await context({}, { signedIn: true, stub: { board: twelve() } });
      const p = await arena(c, { signedIn: true, onBoard: true });
      const res = await play(p, { secs: 0.18 });
      check(res.clean && res.clean.ms === 900, "14 a clean Daily of 900 ms", res.clean);
      await boardDrawn(p, "table");
      const subs = rpcs(await calls(p), "submit_daily");
      check(subs.length === 1 && subs[0].args.p_ms === null && subs[0].args.p_score === res.score, "14 is sent with p_ms null and its score", subs);
      await c.close();
    }

    /* 6. the kill switch */
    {
      const c = await context({ board: "off" }, { signedIn: true, stub: { board: twelve() } });
      const p = await arena(c, { signedIn: true, onBoard: true });
      await play(p);
      const seen = await slotAfter(p);
      check(!seen.slot && !seen.section, "6 board off: no board on the result", seen);
      const got = await calls(p);
      check(got.filter((x) => x.rpc).length === 0 && got.filter((x) => x.from === "profiles").length === 0, "6 board off: no rpc and no profile call from the Arena", got);
      await p.click('.arena-result [data-act="lobby"]');
      check(!/Today:/.test(await dailyTile(p)), "6 board off: the tile has no board line");

      const a = await page(c);
      await a.goto(server.url + "account.html");
      await a.waitForFunction(() => /Signed in/.test((document.querySelector("[data-account]") || {}).textContent || ""));
      await a.waitForFunction(() => JSON.parse(localStorage.getItem("__calls") || "[]").some((x) => x.from === "profiles"));
      await a.waitForTimeout(200);
      check(await a.evaluate(() => !document.getElementById("acct-board")), "6 board off: the account page has no #acct-board");
      const reads = (await calls(a)).filter((x) => x.from === "profiles");
      check(reads.length > 0 && reads.every((x) => x.op === "select" && x.args === "display_name"), "6 board off: the profile read asks for the name only", reads);
      await c.close();
    }

    /* 7. the account page's switch */
    async function account(c, onBoard, seed) {
      const a = await page(c);
      await a.goto(server.url + "account.html");
      await a.evaluate(({ onBoard, seed }) => {
        localStorage.setItem("__onboard", onBoard ? "1" : "0");
        localStorage.setItem("sb-testref-auth-token", "{}");
        if (seed) localStorage.setItem("bm.run.v1", JSON.stringify(seed));
      }, { onBoard, seed: seed || null });
      await a.reload();
      await a.waitForSelector("#acct-board");
      await a.evaluate(() => localStorage.setItem("__calls", "[]"));
      return a;
    }
    const placed = { board: { day: "2026-10-11", sent: 1, rank: 4, size: 12 } };
    {
      const c = await context({}, { signedIn: true });
      const a = await account(c, false);
      const off = await a.evaluate(() => {
        var el = document.getElementById("acct-board");
        return { checked: el.checked, type: el.type, role: el.getAttribute("role"), name: (document.getElementById(el.getAttribute("aria-labelledby")) || {}).textContent,
          note: (document.getElementById(el.getAttribute("aria-describedby")) || {}).textContent, inPanel: !!el.closest(".panel") };
      });
      check(!off.checked && off.type === "checkbox" && off.role === "switch" && off.inPanel, "7 a switch in the signed-in panel, off when the profile says board is false", off);
      check(off.name === "Daily board", "7 labelled Daily board", off.name);
      check(off.note === "Signed-in readers see a made-up name that changes daily, your Daily score and your time. Off removes your rows.", "7 with the privacy line under it", off.note);

      await a.click("#acct-board");
      await a.waitForFunction(() => JSON.parse(localStorage.getItem("__calls") || "[]").some((x) => x.op === "upsert"));
      const ups = (await calls(a)).filter((x) => x.op === "upsert");
      check(ups.length === 1 && JSON.stringify(ups[0].args) === JSON.stringify({ id: "u1", board: true }), "7 checking it upserts { id, board: true }", ups);
      check((await calls(a)).filter((x) => x.rpc).length === 0, "7 … and calls no function");

      await a.evaluate((seed) => {
        var all = JSON.parse(localStorage.getItem("bm.run.v1") || "{}");
        all.board = seed.board;
        localStorage.setItem("bm.run.v1", JSON.stringify(all));
        localStorage.setItem("__calls", "[]");
      }, placed);
      await a.waitForFunction(() => !document.getElementById("acct-board").disabled);
      await a.click("#acct-board");
      await a.waitForFunction(() => JSON.parse(localStorage.getItem("__calls") || "[]").some((x) => x.rpc === "leave_board"));
      await a.waitForFunction(() => !(JSON.parse(localStorage.getItem("bm.run.v1") || "{}")).board);
      const left = await calls(a);
      check(rpcs(left, "leave_board").length === 1 && left.filter((x) => x.op === "upsert").length === 0, "7 unchecking it calls leave_board, and upserts nothing", left);
      check(await a.evaluate(() => !(JSON.parse(localStorage.getItem("bm.run.v1") || "{}")).board), "7 leaving forgets bm.run.v1.board");
      await a.reload();
      await a.waitForSelector("#acct-board");
      check(await a.evaluate(() => !document.getElementById("acct-board").checked), "7 after leaving, the switch reads off");
      await c.close();
    }
    {
      /* on, from the profile, and a refused leave */
      const c = await context({}, { signedIn: true, stub: { leaveFails: true } });
      const b = await account(c, true);
      check(await b.evaluate(() => document.getElementById("acct-board").checked), "7 the switch is on when the profile says board is true");
      await b.click("#acct-board");
      await b.waitForFunction(() => /Daily board/.test((document.querySelector("[data-note]") || {}).textContent || ""));
      await b.waitForFunction(() => !document.getElementById("acct-board").disabled);
      const after = await b.evaluate(() => ({ note: document.querySelector("[data-note]").textContent, bad: !!document.querySelector("[data-note] .bad"), checked: document.getElementById("acct-board").checked }));
      check(after.note === "Could not update the Daily board just now." && after.bad && after.checked, "7 a refused leave_board says it could not update the board, and the switch goes back on", after);
      const warns = await boardWarns(b);
      check(warns.some((w) => /could not be left just now/.test(w)), "7 … and the server's message goes to the console", warns);
      await c.close();
    }
    {
      /* a change in flight survives a redraw */
      const c = await context({}, { signedIn: true, stub: { hold: true } });
      const b = await account(c, true);
      await b.click("#acct-board");
      await b.waitForFunction(() => typeof window.__release === "function");
      await b.evaluate(() => { document.getElementById("acct-board").__old = true; document.activeElement.blur(); });
      await b.click("#acct-sync");
      await b.waitForFunction(() => !document.getElementById("acct-board").__old);
      const mid = await b.evaluate(() => { var el = document.getElementById("acct-board"); return { disabled: el.disabled, checked: el.checked, busy: el.getAttribute("aria-busy") }; });
      check(mid.disabled && !mid.checked && mid.busy === "true", "7 a redraw while leave_board is in flight keeps the switch disabled and showing off", mid);
      await b.evaluate(() => window.__release());
      await b.waitForFunction(() => !document.getElementById("acct-board").disabled);
      const end = await b.evaluate(() => { var el = document.getElementById("acct-board"); return { checked: el.checked, busy: el.getAttribute("aria-busy") }; });
      check(!end.checked && end.busy === null, "7 once it lands, the switch is live and off", end);
      await c.close();
    }

    /* 13. a sign-out, and a deleted account, forget the board */
    {
      const c = await context({}, { signedIn: true });
      const a = await account(c, true, placed);
      await a.click("#acct-out");
      await a.waitForFunction(() => document.getElementById("acct-in"));
      check(await a.evaluate(() => !(JSON.parse(localStorage.getItem("bm.run.v1") || "{}")).board), "13 a sign-out forgets bm.run.v1.board");
      await c.close();

      const c2 = await context({}, { signedIn: true });
      const d = await account(c2, true, placed);
      await d.click("#acct-delete");
      await d.click("#acct-delete");
      await d.waitForFunction(() => JSON.parse(localStorage.getItem("__calls") || "[]").some((x) => x.rpc === "delete_my_account"));
      await d.waitForFunction(() => document.getElementById("acct-in"));
      check(await d.evaluate(() => !(JSON.parse(localStorage.getItem("bm.run.v1") || "{}")).board), "13 deleting the account forgets bm.run.v1.board");
      await c2.close();
    }

    /* 15. a managed learner is never on the Daily board */
    {
      const c = await context({}, { signedIn: true, learner: "Kim", stub: { board: twelve() } });
      const p = await arena(c, { signedIn: true, onBoard: true, learner: "Kim" });
      const res = await play(p);
      check(res.mode === "daily" && res.finished && !res.replay, "15 a finished Daily as a managed learner", res);
      check(await p.evaluate(() => window.BMAccount.learner()) === "L1", "15 the page runs as the learner");
      const seen = await slotAfter(p, 600);
      check(!seen.slot && !seen.section && !seen.join, "15 the result has no board slot, section or join button", seen);
      await p.evaluate(() => {
        var all = JSON.parse(localStorage.getItem("bm.run.v1") || "{}");
        all.board = { day: window.BMSite.dayKey(), sent: 1, rank: 4, size: 12 };
        localStorage.setItem("bm.run.v1", JSON.stringify(all));
      });
      await toLobby(p);
      const tile = await dailyTile(p);
      check(!/Today:/.test(tile), "15 the Daily tile shows no place on the board", tile);
      const got = await calls(p);
      check(rpcs(got, "submit_daily").length === 0 && rpcs(got, "daily_board").length === 0 && !got.some((x) => x.from === "profiles"),
        "15 submit_daily, daily_board and the profile are never asked", got);
      await c.close();
    }

    /* 16. the chip */
    {
      const chip = (p) => p.$eval(".topbar .acct", (a) => ({
        title: a.getAttribute("title"), hidden: (a.querySelector(".visually-hidden") || {}).textContent, initial: (a.querySelector(".avatar") || {}).textContent,
        name: (a.querySelector(".acct-name") || {}).textContent, learner: a.getAttribute("data-learner"), href: a.getAttribute("href")
      }));
      const c = await context({}, { signedIn: true, learner: "Kim" });
      const p = await arena(c, { signedIn: true, learner: "Kim" });
      await p.waitForSelector(".topbar .acct[data-learner]");
      const k = await chip(p);
      check(k.title === "Playing as Kim" && k.hidden === "Playing as Kim" && k.initial === "K" && k.name === "Kim" && k.learner === "true" && /account\.html$/.test(k.href),
        "16 the chip reads Playing as Kim, with the initial K and data-learner", k);
      await c.close();
      const c2 = await context({}, { signedIn: true });
      const q = await arena(c2, { signedIn: true });
      await q.waitForSelector(".topbar .acct[data-in]");
      const me = await chip(q);
      check(me.learner === null && me.name === undefined && me.hidden === "Your account" && me.initial === "R" && /^Signed in as reader@example\.com$/.test(me.title), "16 as self the chip is unchanged", me);
      await c2.close();
    }

    /* 17. the account page's board switch */
    {
      const c = await context({}, { signedIn: true, learner: "Kim" });
      const a = await page(c);
      await a.goto(server.url + "account.html");
      await a.evaluate(() => {
        localStorage.setItem("sb-testref-auth-token", "{}");
        localStorage.setItem("bm.sync.v1", JSON.stringify({ learner: "L1", acct: "u1", learnerName: "Kim" }));
      });
      await a.reload();
      await a.waitForSelector("#acct-save");
      await a.waitForFunction(() => window.BMAccount.learner() === "L1");
      await a.waitForTimeout(400);
      check(await a.evaluate(() => !document.getElementById("acct-board")), "17 the account page as a managed learner draws no Daily board switch");
      await c.close();
      const c2 = await context({}, { signedIn: true });
      const b = await account(c2, true);
      check(await b.evaluate(() => !!document.getElementById("acct-board")), "17 as self the switch is there");
      await c2.close();
    }

    /* 18 and 19. the progress page's line, and names as text */
    {
      async function progress(opts) {
        const c = await context({}, Object.assign({ signedIn: true }, opts));
        const p = await page(c);
        await p.goto(server.url + "progress.html");
        await p.evaluate((o) => {
          localStorage.setItem("sb-testref-auth-token", "{}");
          if (o.learner) localStorage.setItem("bm.sync.v1", JSON.stringify({ learner: "L1", acct: "u1", learnerName: o.learner }));
          if (o.delay) localStorage.setItem("__sessdelay", String(o.delay));
        }, { learner: opts.learner || null, delay: opts.delay || 0 });
        await p.reload();
        await p.waitForSelector("[data-progress] .stats");
        return { c, p };
      }
      const line = (p) => p.evaluate(() => {
        var l = document.querySelector("[data-playing-as]"), a = l && l.querySelector("a");
        return { text: l && l.textContent, href: a && a.getAttribute("href"), cls: l && l.className };
      });
      const k = await progress({ learner: "Kim" });
      await k.p.waitForSelector("[data-playing-as]");
      const got = await line(k.p);
      check(got.text === "Showing Kim's progress. Switch learners on your account page." && /account\.html$/.test(got.href || "") && got.cls === "fine",
        "18 the progress page shows whose progress it is, with the account link", got);
      await k.c.close();
      const s = await progress({});
      await s.p.waitForTimeout(500);
      check((await line(s.p)).text === null, "18 as self there is no such line");
      await s.c.close();

      const x = await progress({ learner: "<b>x</b>" });
      await x.p.waitForSelector("[data-playing-as]");
      await x.p.waitForSelector(".topbar .acct[data-learner]");
      const t = await x.p.evaluate(() => {
        var a = document.querySelector(".topbar .acct"), l = document.querySelector("[data-playing-as]");
        return { chip: a.textContent, chipTags: a.querySelectorAll("b").length, title: a.getAttribute("title"), line: l.textContent, lineTags: l.querySelectorAll("b").length };
      });
      check(t.chipTags === 0 && t.lineTags === 0 && /<b>x<\/b>/.test(t.chip) && /<b>x<\/b>/.test(t.line) && t.title === "Playing as <b>x</b>",
        "19 a learner named <b>x</b> is text in the chip and the line", t);
      await x.c.close();
    }

    /* 20. a learner dropped on load: the chip and the switch are the account's again; a rename follows the chip */
    {
      const c = await context({}, { signedIn: true, stub: { learnerGone: true } });
      const a = await page(c);
      await a.goto(server.url + "account.html");
      await a.evaluate(() => {
        localStorage.setItem("sb-testref-auth-token", "{}");
        localStorage.setItem("bm.sync.v1", JSON.stringify({ learner: "L1", acct: "u1", learnerName: "Kim" }));
      });
      await a.reload();
      await a.waitForSelector("#acct-board", { timeout: 8000 });
      const gone = await a.evaluate(() => {
        var l = document.querySelector(".topbar .acct");
        return { hidden: (l.querySelector(".visually-hidden") || {}).textContent, learner: l.getAttribute("data-learner"), meta: JSON.parse(localStorage.getItem("bm.sync.v1") || "{}") };
      });
      check(gone.hidden === "Your account" && gone.learner === null && !gone.meta.learner && !gone.meta.learnerName,
        "20 a learner dropped on load returns the chip to Your account, with the board switch back", gone);
      await c.close();

      const c2 = await context({}, { signedIn: true });
      const r = await page(c2);
      await r.goto(server.url + "account.html");
      await r.evaluate(() => {
        localStorage.setItem("sb-testref-auth-token", "{}");
        localStorage.setItem("bm.sync.v1", JSON.stringify({ learner: "L1", acct: "u1", learnerName: "Kim" }));
      });
      await r.reload();
      await r.waitForFunction(() => window.BMAccount.learner() === "L1");
      await r.evaluate(() => window.BMAccount.renameLearnerLabel("L1", "Zed"));
      check(await r.$eval(".topbar .acct", (e) => e.getAttribute("title")) === "Playing as Zed", "20 renaming the active learner updates the chip");
      await c2.close();
    }

    /* 21. a Daily started as a learner is not the parent's after the other tab switches (T10) */
    {
      const c = await context({}, { signedIn: true, learner: "Kim" });
      const t1 = await arena(c, { signedIn: true, onBoard: true, learner: "Kim" });
      await t1.click('[data-act="start"][data-mode="daily"]');
      await t1.waitForSelector(".arena-run");
      const run = await t1.evaluate(() => JSON.parse(localStorage.getItem("bm.run.v1")).arena.as);
      check(run === "L1", "21 the run records its reader", run);
      const t2 = await page(c);
      await t2.goto(server.url + "account.html");
      await t2.waitForFunction(() => window.BMAccount && window.BMAccount.status().state === "synced");
      await t2.evaluate(() => window.BMAccount.switchLearner(null));
      await t1.waitForFunction(() => !document.querySelector(".arena-run") && document.querySelector('[data-act="start"][data-mode="daily"]'), null, { timeout: 8000 });
      await t1.waitForTimeout(300);
      const after = await t1.evaluate(() => ({
        arena: JSON.parse(localStorage.getItem("bm.run.v1") || "{}").arena || null,
        paid: (JSON.parse(localStorage.getItem("bm.run.v1") || "{}").paid || []).length,
        game: localStorage.getItem("bm.game.v1"), running: !!document.querySelector(".arena-run"), result: !!document.querySelector(".arena-result")
      }));
      check(!after.arena && after.paid === 0 && !after.running && !after.result && Object.keys(JSON.parse(after.game || "{}").daily || {}).length === 0,
        "21 the stale tab reloads to the lobby, nothing paid, and its pagehide put no run into the store", after);
      const got = await calls(t1);
      check(rpcs(got, "submit_daily").length === 0, "21 submit_daily is never sent", got);
      await c.close();

      /* the run is still in the store but its reader is not this one's (a learner dropped, a sign-out and in elsewhere) */
      const c2 = await context({}, { signedIn: true, learner: "Kim" });
      const u = await arena(c2, { signedIn: true, onBoard: true, learner: "Kim" });
      await u.click('[data-act="start"][data-mode="daily"]');
      await u.waitForSelector(".arena-run");
      await u.evaluate(() => localStorage.setItem("bm.sync.v1", JSON.stringify({ ev: {}, user: "u1", resetAt: 0 })));
      await u.reload();
      await u.waitForSelector(".arena-fine[role=status]");
      const note = await u.evaluate(() => ({ text: document.querySelector(".arena-fine[role=status]").textContent, run: JSON.parse(localStorage.getItem("bm.run.v1") || "{}").arena || null, running: !!document.querySelector(".arena-run") }));
      check(note.text === "That run was started as a different learner, so it was not counted." && !note.run && !note.running, "21 a run of another reader is cleared on resume, with the not-counted line", note);
      check(rpcs(await calls(u), "submit_daily").length === 0, "21 … and nothing is submitted");
      await c2.close();
    }

    /* 21b. the in-memory guards: the page's reader becomes self without a reload, mid-run (finish and settle
       check ownRun, so the run is not paid and not submitted) */
    {
      const c = await context({}, { signedIn: true, learner: "Kim", stub: { board: twelve() } });
      const p = await arena(c, { signedIn: true, onBoard: true, learner: "Kim" });
      await p.click('[data-act="start"][data-mode="daily"]');
      await p.waitForSelector(".arena-run");
      check(await p.evaluate(() => JSON.parse(localStorage.getItem("bm.run.v1")).arena.as) === "L1", "21 the run is the learner's");
      await p.evaluate(() => {
        var r = window.BMArena.state();
        r.qs.forEach(function (q) { q.timed = true; q.hf = false; q.par = Math.max(q.par, 120); });
        var m = JSON.parse(localStorage.getItem("bm.sync.v1") || "{}");
        delete m.learner; delete m.acct; delete m.learnerName;
        localStorage.setItem("bm.sync.v1", JSON.stringify(m));
        window.BMAccount.learner = function () { return null; };
      });
      for (let k = 0; k < 14; k++) {
        if (!(await p.$(".arena-run"))) break;
        const more = await p.evaluate(() => {
          var r = window.BMArena.state();
          if (!r || !r.qs) return false;
          var q = r.qs[r.i];
          document.getElementById("arena-answer").value = String(window.BMGen.make(q.g, q.s).answer).split("|")[0];
          return true;
        }).catch(() => false);
        if (!more) break;
        await p.click('.arena-run [data-act="check"]');
        const nx = await p.$('.arena-feedback [data-act="next"]');
        if (nx) await nx.click();
      }
      await p.waitForSelector(".arena-fine[role=status]", { timeout: 4000 }).catch(() => null);
      const end = await p.evaluate(() => {
        var st = JSON.parse(localStorage.getItem("bm.run.v1") || "{}");
        return { text: (document.querySelector(".arena-fine[role=status]") || {}).textContent, result: !!document.querySelector(".arena-result"),
          paid: (st.paid || []).length, daily: Object.keys(JSON.parse(localStorage.getItem("bm.game.v1") || "{}").daily || {}).length, run: st.arena || null };
      });
      check(end.text === "That run was started as a different learner, so it was not counted." && !end.result && end.paid === 0 && end.daily === 0 && !end.run,
        "21 a run whose reader became self mid-page says not counted and pays nothing", end);
      check(rpcs(await calls(p), "submit_daily").length === 0, "21 … and submits nothing");
      await c.close();
    }

    /* 21c. a page with no account service: the meta's learner counts only while a sign-in is stored */
    {
      /* [key stored, the project's url set, what the page does with the run] */
      for (const [key, url, stored] of [[null, "", false], ["sb-testref-auth-token", "", true], ["sb-testref-auth-token", "https://testref.supabase.co", true], ["sb-other-auth-token", "https://testref.supabase.co", false]]) {
        const tag = "21 (no account service, " + (key ? key : "no session key") + (url ? ", url set" : "") + ") ";
        const c = await context({ supabaseUrl: url, supabaseAnonKey: url ? "k" : "" }, {});
        /* the page as if account.js had not run: nothing answers to BMAccount */
        await c.addInitScript(() => { Object.defineProperty(window, "BMAccount", { get: () => undefined, set: () => {}, configurable: false }); });
        const p = await arena(c, { learner: "Kim" });
        check(await p.evaluate(() => !window.BMAccount), tag + "BMAccount is absent");
        await p.evaluate((k) => { if (k) localStorage.setItem(k, "{}"); }, key);
        await p.reload();
        await p.waitForSelector('[data-act="start"][data-mode="daily"]');
        await p.click('[data-act="start"][data-mode="daily"]');
        await p.waitForSelector(".arena-run");
        await p.reload();
        await p.waitForSelector('.arena-run, [data-act="start"][data-mode="daily"]');
        await p.waitForTimeout(300);
        const got = await p.evaluate(() => ({ running: !!document.querySelector(".arena-run"), note: (document.querySelector(".arena-fine[role=status]") || {}).textContent || "" }));
        if (stored) check(!got.running && /not counted/.test(got.note), tag + "the run is the learner's, so a visitor's run is not counted", got);
        else check(got.running && !/not counted/.test(got.note), tag + "the run resumes with no not-counted line", got);
        await c.close();
      }
    }

    /* 22. the result is drawn before the session is read: the meta already keeps the board away */
    {
      const c = await context({}, { signedIn: true, learner: "Kim", stub: { board: twelve() } });
      const p = await arena(c, { signedIn: true, onBoard: true, learner: "Kim" });
      await play(p);
      await p.evaluate(() => localStorage.setItem("__sessdelay", "4000"));
      await p.reload();
      await p.waitForSelector(".arena-result");
      await p.waitForTimeout(500);
      const early = await p.evaluate(() => ({ user: !!window.BMAccount.user(), slot: !!document.querySelector("[data-arena-board]"), section: !!document.querySelector(".arena-board") }));
      check(!early.user && !early.slot && !early.section, "22 before the session is read, a restored result has no board slot", early);
      await p.evaluate(() => {
        var all = JSON.parse(localStorage.getItem("bm.run.v1") || "{}");
        all.board = { day: window.BMSite.dayKey(), sent: 1, rank: 4, size: 12 };
        localStorage.setItem("bm.run.v1", JSON.stringify(all));
      });
      await p.goto(server.url + "arena.html");
      await p.waitForSelector('[data-act="start"][data-mode="daily"]');
      await p.waitForTimeout(500);
      const tile = await p.evaluate(() => ({ user: !!window.BMAccount.user(), text: document.querySelector('[data-act="start"][data-mode="daily"]').textContent }));
      check(!tile.user && !/Today:/.test(tile.text), "22 … and the Daily tile has no Today: line", tile);
      await c.close();
    }

    /* 23. the progress page's line is there on the first dashboard draw, before any sync, and a name is one code point's initial */
    {
      const k = await (async () => {
        const c = await context({}, { signedIn: true });
        const p = await page(c);
        await p.goto(server.url + "progress.html");
        await p.evaluate(() => {
          localStorage.setItem("sb-testref-auth-token", "{}");
          localStorage.setItem("bm.sync.v1", JSON.stringify({ learner: "L1", acct: "u1", learnerName: "\u{1F600}Kim" }));
          localStorage.setItem("__sessdelay", "4000");
        });
        await p.reload();
        await p.waitForSelector("[data-playing-as]", { timeout: 2000 });
        return { c, p };
      })();
      const early = await k.p.evaluate(() => ({ user: !!window.BMAccount.user(), text: document.querySelector("[data-playing-as]").textContent }));
      check(!early.user && /^Showing \u{1F600}Kim's progress/u.test(early.text), "23 the line is there on first paint, before the session is read", early);
      await k.p.waitForSelector(".topbar .acct[data-learner]", { timeout: 8000 });
      check(await k.p.$eval(".topbar .acct .avatar", (e) => e.textContent) === "\u{1F600}", "23 the avatar initial is the whole first character");
      await k.c.close();
    }

    check(errors.length === 0, "8 no page errors, console errors or CSP violations", errors);
  } finally {
    for (const c of contexts) { try { await c.close(); } catch (e) { /* closed already */ } }
    await browser.close();
    await server.close();
  }
  console.log((fails ? "FAILED" : "ok") + " board: " + passes + " checks passed, " + fails + " failed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
