#!/usr/bin/env node
/* The Daily board on the site (assets/arena.js, assets/account.js; decision 0006), in
   headless Chromium:
     node tools/game/board.test.js

   The site is served in-process as lib/target.js picks it (the build in dist/, which must
   be current). As in tools/game/account.test.js, each case pins window.BM_CONFIG and puts
   a stand-in for supabase-js on window.supabase before the page's scripts run. The
   stand-in plays the server's part of supabase/schema.sql: submit_daily refuses with
   "not on the board" until the profile's board is true, an upsert of { board: true }
   joins, leave_board leaves; daily_board answers the case's canned rows. It records every
   rpc(name, args) and every from("profiles") select and upsert in localStorage, so the
   record survives a reload. Every request off the local server is aborted.

   A finished Daily is reached by playing a real one: five questions answered on the page,
   from a deck of every section the generators cover (as tools/game/arena.test.js does),
   one of them wrong first time for a run with a miss, every one on the clock and right
   first time for a clean run. A reload on the result screen draws the result again from
   bm.run.v1 (arena.js's load path), which is the re-render check 5 uses.

   1. board on, signed out: "Sign in to join the Daily board." with a link to the account
      page, and nothing asked of the account service
   2. signed in, not on the board: the submit is refused, the join button is drawn and no
      table; pressing it upserts { id, board: true }, then sends submit_daily once with the
      run's day, score, 5 questions, first-try count and no time (the run had a miss), then
      fetches daily_board and draws it
   3. signed in and on the board, a clean run: submit_daily once with the run's clean ms; a
      canned board of 12 with the reader 4th draws 12 rows, the fourth marked data-mine, a
      handle written as markup shown as text; bm.run.v1.board is { day, rank 4, size 12 };
      the lobby's Daily tile then says "Today: 4th of 12"
   4. an empty board, and a board of two entries, say the board appears once three people
      have played, and the tile says "unranked"
   5. drawing the result again (a reload on the result screen) fetches the board again and
      never sends submit_daily a second time
   6. BM_CONFIG.board "off": no board section, no call, and no Daily board switch on the
      account page, whose profile read asks for the name only
   7. the account page, signed in: #acct-board reflects the profile's board; checking it
      upserts { id, board: true }; unchecking it calls leave_board and forgets
      bm.run.v1.board; a refused leave_board shows its message in [data-note] and the
      switch goes back on
   8. no page errors, console errors or Content-Security-Policy violations in any case */
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
window.supabase = { createClient: function () {
  var S = window.__stub || {}, subs = [];
  function answer(data) { return { data: data, error: null }; }
  function refuse(message) { return { data: null, error: { message: message, code: "P0001" } }; }
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
          } else res = answer({ display_name: "Reader", board: onBoard() });
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
      if (name === "submit_daily") return Promise.resolve(onBoard() ? answer(S.rank === undefined ? 4 : S.rank) : refuse("not on the board"));
      if (name === "daily_board") {
        var canned = localStorage.getItem("__board");
        return Promise.resolve(answer(canned ? JSON.parse(canned) : S.board || []));
      }
      if (name === "leave_board") {
        if (S.leaveFails) return Promise.resolve(refuse("The board could not be left just now."));
        localStorage.setItem("__onboard", "0");
        return Promise.resolve(answer(null));
      }
      return Promise.resolve(answer(null));
    },
    auth: {
      onAuthStateChange: function (cb) { subs.push(cb); return { data: { subscription: { unsubscribe: function () {} } } }; },
      getSession: function () { return Promise.resolve(answer({ session: window.__session || null })); },
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
      if (o.onBoard) localStorage.setItem("__onboard", "1");
    }, opts);
    await p.goto(server.url + "arena.html");
    await p.waitForFunction(() => document.readyState === "complete" && document.querySelector('[data-act="start"][data-mode="daily"]'));
    /* the first sync redraws the lobby; start once it has settled */
    if (opts.signedIn) await p.waitForFunction(() => window.BMAccount && window.BMAccount.status().state === "synced");
    return p;
  }
  /* a real Daily, to the result: every question on the clock, right first time, except
     the first one when `miss` */
  async function playDaily(p, miss) {
    await p.click('[data-act="start"][data-mode="daily"]');
    await p.waitForSelector(".arena-run");
    await p.evaluate(() => {
      var r = window.BMArena.state();
      r.qs.forEach(function (q) { q.timed = true; q.hf = false; q.par = Math.max(q.par, 120); });
    });
    for (let k = 0; k < 8; k++) {
      if (await p.$(".arena-result")) break;
      const wrong = miss && k === 0;
      await p.evaluate((wrong) => {
        var r = window.BMArena.state(), q = r.qs[r.i];
        document.getElementById("arena-answer").value = wrong ? "987654321" : String(window.BMGen.make(q.g, q.s).answer).split("|")[0];
      }, wrong);
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
    return p.evaluate(() => window.BMArena.state().result);
  }
  const calls = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("__calls") || "[]"));
  const rpcs = (list, name) => list.filter((c) => c.rpc === name);
  const runBoard = (p) => p.evaluate(() => (JSON.parse(localStorage.getItem("bm.run.v1") || "{}")).board || null);
  const text = (p, sel) => p.evaluate((s) => { const el = document.querySelector(s); return el ? el.textContent.replace(/\s+/g, " ").trim() : null; }, sel);
  /* settles once the board's slot holds its section, of the kind asked for */
  const boardDrawn = (p, what) => p.waitForFunction((w) => {
    var s = document.querySelector("[data-arena-board] .arena-board");
    if (!s) return false;
    if (w === "table") return !!s.querySelector("table");
    if (w === "join") return !!s.querySelector('[data-act="board-join"]');
    if (w === "three") return /three people/.test(s.textContent);
    return true;
  }, what, { timeout: 5000 });
  const dailyTile = (p) => p.$eval('[data-act="start"][data-mode="daily"]', (b) => b.textContent.replace(/\s+/g, " "));

  try {
    /* 1. signed out */
    {
      const c = await context({});
      const p = await arena(c);
      const res = await playDaily(p, false);
      check(res.mode === "daily" && res.finished && !res.replay, "1 a finished Daily", res);
      await boardDrawn(p);
      const seen = await p.evaluate(() => {
        var s = document.querySelector(".arena-board"), a = s && s.querySelector("a");
        return { text: s && s.textContent, href: a && a.getAttribute("href"), table: !!(s && s.querySelector("table")) };
      });
      check(/Sign in to join the Daily board\./.test(seen.text) && /account\.html$/.test(seen.href || ""), "1 signed out, the result says to sign in, with a link to the account page", seen);
      check(!seen.table, "1 … and draws no table");
      eq0(await calls(p), "1 signed out, nothing is asked of the account service");
      check(await p.evaluate(() => !window.BMAccount.user()), "1 nobody is signed in");
      await c.close();
    }

    /* 2. signed in, not on the board, then joining */
    {
      const c = await context({}, { signedIn: true, stub: { board: twelve().slice(0, 3).map((r) => Object.assign({}, r, { entries: 3, mine: r.rank === 2 })), rank: 2 } });
      const p = await arena(c, { signedIn: true });
      await p.evaluate(() => localStorage.setItem("__calls", "[]"));
      const res = await playDaily(p, true);
      check(res.firstTry === 4 && res.n === 5 && res.clean === null, "2 a Daily with a miss: 4 of 5 first try, not clean", { firstTry: res.firstTry, n: res.n, clean: res.clean });
      await boardDrawn(p, "join");
      const before = await calls(p);
      const shown = await p.evaluate(() => {
        var s = document.querySelector(".arena-board");
        return { text: s.textContent.replace(/\s+/g, " "), table: !!s.querySelector("table"), button: s.querySelector('button.btn[data-act="board-join"]') ? s.querySelector('button.btn[data-act="board-join"]').textContent : null };
      });
      check(shown.button === "Join the Daily board" && !shown.table, "2 not on the board: the join button and no table", shown);
      check(/made-up name/.test(shown.text) && /score/.test(shown.text) && /time/.test(shown.text) && /removes your rows/.test(shown.text), "2 the join line says what others see and that off removes your rows", shown.text);
      check(rpcs(before, "submit_daily").length === 1 && rpcs(before, "daily_board").length === 0, "2 one refused submit, and no board fetched", before);
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
      await c.close();
    }

    /* 3 and 5. on the board, a clean run */
    {
      const c = await context({}, { signedIn: true, stub: { board: twelve(), rank: 4 } });
      const p = await arena(c, { signedIn: true, onBoard: true });
      await p.evaluate(() => localStorage.setItem("__calls", "[]"));
      const res = await playDaily(p, false);
      check(res.clean && res.clean.ms > 0, "3 a clean Daily, with a time", res.clean);
      await boardDrawn(p, "table");
      const got = await calls(p);
      const subs = rpcs(got, "submit_daily");
      check(subs.length === 1 && subs[0].args.p_ms === res.clean.ms && subs[0].args.p_firsts === 5 && subs[0].args.p_n === 5 && subs[0].args.p_day === res.day,
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
      check(rec && rec.day === res.day && rec.rank === 4 && rec.size === 12 && rec.sent === 1, "3 bm.run.v1.board keeps day, rank 4, size 12 and sent", rec);

      /* 5. drawn again from bm.run.v1 by a reload on the result screen */
      await p.reload();
      await p.waitForSelector(".arena-result");
      await boardDrawn(p, "table");
      const again = await calls(p);
      check(rpcs(again, "submit_daily").length === 1, "5 a redrawn result does not send submit_daily again", rpcs(again, "submit_daily").length);
      check(rpcs(again, "daily_board").length === 2, "5 … and fetches the board again", rpcs(again, "daily_board").length);

      /* the lobby, arrived at fresh */
      await p.goto(server.url + "arena.html");
      await p.waitForSelector('[data-act="start"][data-mode="daily"]');
      const tile = await dailyTile(p);
      check(/Today: 4th of 12\./.test(tile), "3 the Daily tile says Today: 4th of 12", tile);
      check(rpcs(await calls(p), "submit_daily").length === 1, "5 the lobby sends nothing", null);

      await c.close();
    }

    /* 4. the "three people" line, on a run of its own */
    for (const [label, canned] of [["an empty board", []], ["a board of two entries", [{ rank: 1, handle: "Calm prism", score: 500, ms: null, mine: true, entries: 2 }]]]) {
      const c = await context({}, { signedIn: true, stub: { board: canned, rank: null } });
      const p = await arena(c, { signedIn: true, onBoard: true });
      await playDaily(p, false);
      await boardDrawn(p, "three");
      const seen = await p.evaluate(() => { var s = document.querySelector(".arena-board"); return { text: s.textContent, table: !!s.querySelector("table") }; });
      check(/The board appears once three people have played today's Daily\./.test(seen.text) && !seen.table, "4 " + label + ": the three-people line and no table", seen);
      const rec = await runBoard(p);
      check(rec && rec.rank === null, "4 " + label + ": no rank is kept", rec);
      await p.click('.arena-result [data-act="lobby"]');
      const tile = await dailyTile(p);
      check(/Today: unranked\./.test(tile), "4 " + label + ": the Daily tile says unranked", tile);
      await c.close();
    }

    /* 6. the kill switch */
    {
      const c = await context({ board: "off" }, { signedIn: true, stub: { board: twelve() } });
      const p = await arena(c, { signedIn: true, onBoard: true });
      await p.evaluate(() => localStorage.setItem("__calls", "[]"));
      await playDaily(p, false);
      await p.waitForTimeout(400);
      const seen = await p.evaluate(() => ({ slot: !!document.querySelector("[data-arena-board]"), section: !!document.querySelector(".arena-board") }));
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
    {
      const c = await context({}, { signedIn: true });
      const a = await page(c);
      await a.goto(server.url + "account.html");
      await a.evaluate(() => { localStorage.setItem("__onboard", "0"); localStorage.setItem("sb-testref-auth-token", "{}"); });
      await a.reload();
      await a.waitForSelector("#acct-board");
      const off = await a.evaluate(() => {
        var el = document.getElementById("acct-board"), label = el.closest("label");
        return { checked: el.checked, type: el.type, role: el.getAttribute("role"), name: (document.getElementById(el.getAttribute("aria-labelledby")) || {}).textContent,
          note: (document.getElementById(el.getAttribute("aria-describedby")) || {}).textContent, inPanel: !!el.closest(".panel"), label: !!label };
      });
      check(!off.checked && off.type === "checkbox" && off.role === "switch" && off.inPanel, "7 a switch in the signed-in panel, off when the profile says board is false", off);
      check(off.name === "Daily board", "7 labelled Daily board", off.name);
      check(off.note === "Signed-in readers see a made-up name that changes daily, your Daily score and your time. Off removes your rows.", "7 with the privacy line under it", off.note);
      check((await calls(a)).some((x) => x.from === "profiles" && x.op === "select" && x.args === "display_name, board"), "7 the profile read asks for the board too");

      await a.evaluate(() => localStorage.setItem("__calls", "[]"));
      await a.click("#acct-board");
      await a.waitForFunction(() => JSON.parse(localStorage.getItem("__calls") || "[]").some((x) => x.op === "upsert"));
      const ups = (await calls(a)).filter((x) => x.op === "upsert");
      check(ups.length === 1 && JSON.stringify(ups[0].args) === JSON.stringify({ id: "u1", board: true }), "7 checking it upserts { id, board: true }", ups);
      check((await calls(a)).filter((x) => x.rpc).length === 0, "7 … and calls no function");

      await a.evaluate(() => {
        var all = JSON.parse(localStorage.getItem("bm.run.v1") || "{}");
        all.board = { day: "2026-10-11", rank: 4, size: 12, sent: 1 };
        localStorage.setItem("bm.run.v1", JSON.stringify(all));
        localStorage.setItem("__calls", "[]");
      });
      await a.waitForFunction(() => !document.getElementById("acct-board").disabled);
      await a.click("#acct-board");
      await a.waitForFunction(() => JSON.parse(localStorage.getItem("__calls") || "[]").some((x) => x.rpc === "leave_board"));
      await a.waitForFunction(() => !(JSON.parse(localStorage.getItem("bm.run.v1") || "{}")).board);
      const left = await calls(a);
      check(rpcs(left, "leave_board").length === 1 && left.filter((x) => x.op === "upsert").length === 0, "7 unchecking it calls leave_board, and upserts nothing", left);
      check(await a.evaluate(() => !(JSON.parse(localStorage.getItem("bm.run.v1") || "{}")).board), "7 leaving forgets bm.run.v1.board");

      /* reloaded: the profile now says board is false */
      await a.reload();
      await a.waitForSelector("#acct-board");
      check(await a.evaluate(() => !document.getElementById("acct-board").checked), "7 after leaving, the switch reads off");
      await c.close();

      /* on, from the profile, and a refused leave */
      const c2 = await context({}, { signedIn: true, stub: { leaveFails: true } });
      const b = await page(c2);
      await b.goto(server.url + "account.html");
      await b.evaluate(() => { localStorage.setItem("__onboard", "1"); localStorage.setItem("sb-testref-auth-token", "{}"); });
      await b.reload();
      await b.waitForSelector("#acct-board");
      check(await b.evaluate(() => document.getElementById("acct-board").checked), "7 the switch is on when the profile says board is true");
      await b.click("#acct-board");
      await b.waitForFunction(() => /could not be left/.test((document.querySelector("[data-note]") || {}).textContent || ""));
      const after = await b.evaluate(() => ({ note: document.querySelector("[data-note]").textContent, bad: !!document.querySelector("[data-note] .bad"), checked: document.getElementById("acct-board").checked }));
      check(after.bad && after.checked, "7 a refused leave_board shows its message in [data-note], and the switch goes back on", after);
      await c2.close();
    }

    check(errors.length === 0, "8 no page errors, console errors or CSP violations", errors);
  } finally {
    for (const c of contexts) { try { await c.close(); } catch (e) { /* closed already */ } }
    await browser.close();
    await server.close();
  }
  console.log((fails ? "FAILED" : "ok") + " board: " + passes + " checks passed, " + fails + " failed");
  process.exit(fails ? 1 : 0);

  function eq0(list, what) { check(list.length === 0, what, list); }
})().catch((e) => { console.error(e); process.exit(2); });
