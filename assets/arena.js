/* ===========================================================================
   Basic Mathematics — the Arena (arena.html)
   The only place in the course with a clock. It asks freshly generated problems
   (data/gen/*.js) from sections the reader has already solved, so timed retrieval
   builds fluency instead of pushing guesses on new material.

     lobby   the deck by Part, mode buttons, tempo, an unfinished run to settle
     run     one question at a time: par bar, hearts, score, streak
     result  score, hearts, first-try count, the section worth rereading

   Rules that keep the teaching first: speed is a threshold (par), not a gradient;
   a wrong check stops the clock, shows the hint and allows one untimed retry; a
   pass or a timeout never costs a heart, so guessing is always worse than saying
   "I don't know". Shaky and hand-picked new sections come without clock or hearts;
   on a question without a heart, "I don't know" leads to the same hint and retry
   as a wrong answer and that retry scores nothing, so a guess never beats a pass.
   Calm mode switched on during a run turns the rest of it Untimed.

   The run lives in bm.run.v1.arena and is saved after every answer (and each
   second while the clock runs), so a reload resumes the same question with the
   same elapsed time. XP is paid once, when the run is settled: bm.run.v1.paid
   lists the runs already settled, so a run open in two tabs is paid once. The
   Daily is one attempt a day (bm.run.v1.daily keeps today's result for the lobby).
   Nothing here writes bm.attempts.v1 or bm.progress.v1, and no .ex element is
   ever created.
   window.BMGame, BMSfx and the HUD are optional: each is feature-detected.
   =========================================================================== */
(function () {
  "use strict";

  var host = document.querySelector("[data-arena]");
  var Store = window.BMStore, Site = window.BMSite, Gen = window.BMGen;
  var C = window.BM_CURRICULUM;
  if (!host || !Store || !Site || !C) return;
  var esc = Site.escapeHtml;

  if (!Gen || !Gen.list().length) {
    host.innerHTML = '<p class="arena-note">The problem generators did not load, so the Arena cannot start. Reload the page to try again.</p>';
    return;
  }

  document.body.setAttribute("data-mode", "arena");

  var RUN_KEY = Store.keys.run || "bm.run.v1";
  var PREFS_KEY = Store.keys.prefs || "bm.prefs.v1";
  var GAME_KEY = Store.keys.game || "bm.game.v1";
  var WEAK = (window.BMInsights && window.BMInsights.WEAK) || 0.34;

  var MODES = {
    standard: { n: 10, label: "Standard run" },
    daily: { n: 5, label: "Daily" },
    boss: { n: 10, label: "Boss rematch" },
    repair: { n: 5, label: "Repair" }
  };
  var TEMPO = { standard: 1, extended: 2, untimed: 0 };
  var TEMPO_LABEL = { standard: "Standard", extended: "Extended", untimed: "Untimed" };
  var HEARTS = 3;
  var BOX_DAYS = [1, 1, 3, 7, 14, 30];
  var SOFT_MAX = 2;   /* shaky or hand-picked questions per run, untimed and heart-free */

  /* ------------------------------------------------------------ helpers -- */

  function game() { return window.BMGame && typeof window.BMGame === "object" ? window.BMGame : null; }
  function gameHas(name) { var g = game(); return !!(g && typeof g[name] === "function"); }
  function gameCall(name, arg) {
    if (!gameHas(name)) return undefined;
    try { return window.BMGame[name](arg); } catch (e) { if (window.console) console.error("[BM] BMGame." + name + " failed", e); return undefined; }
  }
  function sfx(name) {
    if (calm()) return;
    try { if (window.BMSfx && typeof window.BMSfx.play === "function") window.BMSfx.play(name); } catch (e) { /* sound is a garnish */ }
  }
  function now() { return Date.now(); }
  function today() { return Site.dayKey(); }
  function daysBetween(a, b) {
    var pa = String(a).split("-"), pb = String(b).split("-");
    var da = Date.UTC(+pa[0], +pa[1] - 1, +pa[2]), db = Date.UTC(+pb[0], +pb[1] - 1, +pb[2]);
    return Math.round((db - da) / 86400000);
  }
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
  function clockText(s) {
    s = Math.max(0, Math.ceil(s - 1e-9));
    var m = Math.floor(s / 60), r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }
  function root() { return Site.rootPrefix(); }

  function prefs() {
    var p = gameCall("prefs");
    if (!p || typeof p !== "object") p = Store.read(PREFS_KEY, {});
    return p && typeof p === "object" ? p : {};
  }
  function calm() { return document.documentElement.hasAttribute("data-calm"); }

  /* In calm mode the tempo starts at Untimed; a choice made while calm is kept for
     this visit only, so turning calm off later restores the saved tempo. */
  var calmTempo = null;
  function tempo() {
    if (calm()) return calmTempo || "untimed";
    var t = prefs().tempo;
    return TEMPO[t] === undefined ? "standard" : t;
  }
  function setTempo(t) {
    if (TEMPO[t] === undefined) return;
    if (calm()) { calmTempo = t; return; }
    if (gameHas("setPref")) { gameCall2("setPref", "tempo", t); return; }
    var p = Store.read(PREFS_KEY, {});
    if (!p || typeof p !== "object") p = {};
    p.tempo = t;
    Store.write(PREFS_KEY, p);
    Store.emit({ type: "prefs", prefs: p });
  }
  function gameCall2(name, a, b) {
    try { return window.BMGame[name](a, b); } catch (e) { if (window.console) console.error("[BM] BMGame." + name + " failed", e); return undefined; }
  }

  function gameStore() {
    var g = Store.read(GAME_KEY, {});
    return g && typeof g === "object" ? g : {};
  }
  function runStore() {
    var r = Store.read(RUN_KEY, {});
    return r && typeof r === "object" ? r : {};
  }

  /* The ledger of settled runs, by id. Settling checks it and adds to it in one write,
     so a second tab holding the same run (resumed there) can never pay it again. */
  var PAID_KEEP = 30;
  function runId(r) { return r ? String(r.id || r.started + ":" + r.seed) : ""; }
  function paidIds(all) { return Array.isArray(all.paid) ? all.paid : []; }
  function wasPaid(r) { return paidIds(runStore()).indexOf(runId(r)) > -1; }

  /* The Daily is one attempt a day: spent once a Daily with an answer in it is settled
     on this device, finished or banked (the result is kept for the lobby), or once one
     was played through on another (the synced bm.game.v1.daily). */
  function dailyOn(day) {
    var d = runStore().daily;
    return d && typeof d === "object" && d.day === day ? d : null;
  }
  function dailySpent(day) { return !!((gameStore().daily || {})[day] || dailyOn(day)); }
  function dailyToday() { return dailyOn(today()); }
  function dailyDone() { return dailySpent(today()); }

  /* ------------------------------------------------------ the curriculum -- */

  var SECTIONS = {};
  C.chapters.forEach(function (ch) {
    ch.sections.forEach(function (s, i) {
      SECTIONS[ch.id + "#" + s.id] = {
        id: ch.id + "#" + s.id, chapter: ch, section: s, index: i,
        label: ch.label === "Interlude" ? "Interlude" : "§" + ch.label + "." + (i + 1),
        path: ch.path + "#" + s.id, part: ch.part.id
      };
    });
  });
  function secInfo(id) { return SECTIONS[id] || null; }
  function secName(id) { var s = secInfo(id); return s ? s.label + " " + s.section.title : id; }
  function hasGen(id) { return Gen.forSection(id).length > 0; }

  /* ------------------------------------------------------------ the deck -- */

  /* sections with at least one solved exercise, from the attempt log: how many are
     solved there, and how many of those are scored ones right first time */
  function solvedSections() {
    var out = {};
    var all = window.BMAttempts ? window.BMAttempts.all() : Store.read(Store.keys.attempts, {}) || {};
    Object.keys(all).forEach(function (chId) {
      var recs = all[chId] && typeof all[chId] === "object" ? all[chId] : {};
      Object.keys(recs).forEach(function (key) {
        var rec = recs[key], sec = rec && rec.section;
        if (!rec || !rec.solved || !sec || sec === "warmup") return;
        var id = sec.indexOf("#") > -1 ? sec : chId + "#" + sec;
        if (!SECTIONS[id]) return;
        var s = out[id] = out[id] || { n: 0, first: 0 };
        s.n++;
        if (rec.first && !rec.inline) s.first++;
      });
    });
    return out;
  }

  function isDue(id) {
    var rec = (gameStore().sec || {})[id];
    if (!rec || !rec.last) return false;
    var box = Math.max(1, Math.min(5, rec.box || 1));
    return daysBetween(rec.last, today()) >= BOX_DAYS[box];
  }
  function metInArena(id) {
    var rec = (gameStore().sec || {})[id];
    return !!(rec && rec.n >= 1);
  }

  /* id -> { id, status: "solid"|"shaky"|"new", due } for every section the deck knows */
  function deck() {
    var out = {}, list = gameCall("deck", {});
    if (list && list.length !== undefined) {
      Array.prototype.forEach.call(list, function (d) {
        if (d && SECTIONS[d.id]) out[d.id] = { id: d.id, status: d.status === "solid" || d.status === "shaky" ? d.status : "new", due: !!d.due };
      });
      return out;
    }
    var solved = solvedSections(), scores = {};
    if (window.BMInsights) {
      try { window.BMInsights.sections().forEach(function (row) { scores[row.id] = row.score; }); } catch (e) { /* no scores, all solid */ }
    }
    /* the game layer's rule: solid once two exercises are solved there, or a scored one
       first time, or one came right first time in the Arena; one Your turn check is not enough */
    Object.keys(solved).forEach(function (id) {
      var shaky = scores[id] !== undefined && scores[id] >= WEAK, rec = (gameStore().sec || {})[id];
      if (!shaky && solved[id].n < 2 && !solved[id].first && !(rec && rec.ok > 0)) return;
      out[id] = { id: id, status: shaky ? "shaky" : "solid", due: isDue(id) };
    });
    return out;
  }
  function statusOf(d, id) { return d[id] ? d[id].status : "new"; }

  function picks() { var p = runStore().picks; return p && typeof p === "object" ? p : {}; }
  function setPick(id, on) {
    var all = runStore();
    all.picks = all.picks && typeof all.picks === "object" ? all.picks : {};
    if (on) all.picks[id] = 1; else delete all.picks[id];
    Store.write(RUN_KEY, all, true);
  }

  /* --------------------------------------------------------- planning ---- */

  /* Lay out a run: which generator and seed for each question, and how it is
     served (clock, hearts, par). Returns { qs } or { error }. */
  function planRun(mode, opt) {
    opt = opt || {};
    var d = deck(), t = tempo(), factor = TEMPO[t];
    var heartsOn = mode !== "repair" && factor > 0 && !calm();
    var n = MODES[mode].n, ids = [];
    var seed = mode === "daily" ? Gen.hash("daily:" + today()) : ((now() ^ Math.floor(Math.random() * 4294967296)) >>> 0);
    var rng = Gen.rng(seed);

    if (mode === "repair") ids = [opt.section];
    else if (mode === "boss") {
      var ch = C.chapterById(opt.boss);
      ids = ch ? ch.sections.map(function (s) { return ch.id + "#" + s.id; }).filter(hasGen) : [];
    } else {
      var pk = picks();
      Object.keys(SECTIONS).forEach(function (id) {
        if (!hasGen(id)) return;
        var st = statusOf(d, id);
        if (st !== "new" || pk[id]) ids.push(id);
      });
    }
    if (!ids.length) return { error: "empty" };

    /* soft: served without clock or hearts. In a rematch a section counts as soft
       only while it is not in the deck yet (new). */
    function soft(id) {
      var st = statusOf(d, id);
      return st === "new" || (st === "shaky" && mode !== "boss");
    }
    var order = rng.shuffle(ids);
    var hardCount = order.filter(function (id) { return !soft(id); }).length;
    var softMax = mode === "repair" || mode === "boss" || !hardCount ? n : SOFT_MAX;
    var cap = mode === "repair" ? n : Math.ceil(n / 2);
    var counts = {}, softUsed = 0, slots = [], progress = true;
    while (slots.length < n && progress) {
      progress = false;
      for (var i = 0; i < order.length && slots.length < n; i++) {
        var id = order[i];
        if ((counts[id] || 0) >= cap) continue;
        if (soft(id) && mode !== "repair" && softUsed >= softMax) continue;
        slots.push(id);
        counts[id] = (counts[id] || 0) + 1;
        if (soft(id)) softUsed++;
        progress = true;
      }
    }
    var offsets = {};
    var qs = slots.map(function (id, k) {
      var gens = Gen.forSection(id);
      if (offsets[id] === undefined) offsets[id] = rng.int(0, gens.length - 1);
      var spec = gens[offsets[id] % gens.length];
      offsets[id]++;
      var s = soft(id);
      var timed = factor > 0 && spec.timed && !s && mode !== "repair";
      var par = Math.round(spec.par * Math.max(1, factor) * (metInArena(id) ? 1 : 1.5));
      return {
        g: spec.id, s: rng.int(1, 2147483646), sec: id, st: statusOf(d, id),
        due: !!(d[id] && d[id].due), timed: timed, hf: !heartsOn || s, par: par, k: k
      };
    });
    return {
      qs: qs, seed: seed, heartsOn: heartsOn, tempo: t,
      short: qs.length < n
    };
  }

  /* -------------------------------------------------------------- state -- */

  var run = null;        /* the run being played, as saved in bm.run.v1.arena */
  var prob = null;       /* the current problem, rebuilt from (generator, seed) */
  var view = {};         /* elements of the run screen */
  var clock = { running: false, since: 0, ticker: null, lastSaved: -1, said: {}, ticked: -1 };
  var screen = "lobby";
  var params = readParams();

  function readParams() {
    var out = {};
    try {
      var q = new URLSearchParams(window.location.search);
      if (q.get("boss")) out.boss = q.get("boss");
      if (q.get("repair")) out.repair = q.get("repair");
    } catch (e) {
      var m = /[?&]boss=([^&#]+)/.exec(window.location.search);
      if (m) out.boss = decodeURIComponent(m[1]);
      m = /[?&]repair=([^&#]+)/.exec(window.location.search);
      if (m) out.repair = decodeURIComponent(m[1]);
    }
    return out;
  }

  /* a run settled in another tab is never written back over the settled copy */
  function saveRun(silent) {
    var all = runStore();
    if (run && !run.done && paidIds(all).indexOf(runId(run)) > -1) return;
    all.arena = run;
    Store.write(RUN_KEY, all, silent !== false);
  }
  /* true (and back to the lobby) when the run on screen was settled in another tab */
  var lobbyNote = "";
  function leaveSettled() {
    if (run) stopClock();
    run = null;
    lobbyNote = "That run was settled in another tab, where its XP was paid, so it ends here.";
    renderLobby();
  }
  function settledElsewhere() {
    if (!run || run.done || !wasPaid(run)) return false;
    leaveSettled();
    return true;
  }
  function clearRun() {
    var all = runStore();
    all.arena = null;
    Store.write(RUN_KEY, all, true);
  }
  function validRun(r) {
    return !!(r && typeof r === "object" && r.qs && r.qs.length && MODES[r.mode] && r.cur &&
      r.qs.every(function (q) { return Gen.get(q.g); }));
  }
  /* a saved run that can still be resumed or banked */
  function openRun(r) { return validRun(r) && !r.done && !wasPaid(r); }
  function freshCur() { return { el: 0, phase: "ask", paused: false, given: "" }; }

  function startRun(mode, opt) {
    if (mode === "daily" && dailyDone()) { renderLobby(); return; }
    var old = runStore().arena;
    /* today's Daily, left unfinished, is picked up again rather than dealt a second time */
    if (mode === "daily" && openRun(old) && old.mode === "daily" && old.day === today()) {
      run = old; run.cur.paused = false; renderRun(); return;
    }
    /* an unfinished run is banked first, so nothing earned is ever lost */
    if (openRun(old)) settle(old, "banked");
    var plan = planRun(mode, opt);
    if (plan.error) { renderLobby(); return; }
    var t0 = now();
    run = {
      v: 1, id: t0.toString(36) + "-" + plan.seed.toString(36), calm: calm(),
      mode: mode, boss: mode === "boss" ? opt.boss : null, section: mode === "repair" ? opt.section : null,
      day: today(), tempo: plan.tempo, seed: plan.seed, started: t0,
      hearts: plan.heartsOn ? HEARTS : null, max: HEARTS, score: 0, streak: 0, bestStreak: 0,
      qs: plan.qs, i: 0, ans: [], cur: freshCur(), done: false, paid: false, ended: null
    };
    saveRun(false);
    Store.emit({ type: "arena", phase: "start", mode: mode });
    renderRun();
  }

  /* ---------------------------------------------------------- the clock -- */

  function q() { return run.qs[run.i]; }
  function elapsed() {
    return run.cur.el + (clock.running ? (now() - clock.since) / 1000 : 0);
  }
  function shouldRun() {
    return !!(run && !run.done && screen === "run" && q() && q().timed && run.cur.phase === "ask" &&
      !run.cur.paused && !document.hidden);
  }
  function startClock() {
    if (clock.running || !shouldRun()) return;
    clock.running = true;
    clock.since = now();
    if (!clock.ticker) clock.ticker = setInterval(tick, 200);
    paintTimer();
  }
  function stopClock() {
    if (clock.running) {
      run.cur.el = elapsed();
      clock.running = false;
    }
    if (clock.ticker) { clearInterval(clock.ticker); clock.ticker = null; }
  }
  /* fold the running time into the saved elapsed, so a reload resumes from here */
  function checkpoint() {
    if (clock.running) { run.cur.el = elapsed(); clock.since = now(); }
    saveRun(true);
  }
  function tick() {
    if (!run || screen !== "run") { stopClock(); return; }
    if (!clock.running) return;
    var el = elapsed(), par = q().par;
    if (el >= 2 * par) { timeout(); return; }
    var whole = Math.floor(el);
    if (whole !== clock.lastSaved) { clock.lastSaved = whole; checkpoint(); }
    paintTimer();
  }

  function urgency(el, par) {
    if (el > par) return "over";
    var left = (par - el) / par;
    return left <= 0.1 ? "critical" : left <= 0.3 ? "low" : "ok";
  }

  function say(text) {
    var live = host.querySelector(".arena-live");
    if (!live) return;
    live.textContent = "";
    setTimeout(function () { live.textContent = text; }, 60);
  }

  /* mirror the clock and hearts in the header HUD, when the game layer has one:
     hudTimer({text, urgency: ok|low|critical, label}) and hudHearts({lives, max}) */
  var hudKeys = { t: "", h: "" };
  function hud(state) {
    var t = state && state.on ? {
      text: state.text, urgency: state.urgency === "over" ? "critical" : state.urgency || "ok",
      label: state.paused ? "paused" : state.label
    } : null;
    var h = state && typeof state.hearts === "number" ? { lives: state.hearts, max: state.max } : null;
    var kt = t ? JSON.stringify(t) : "", kh = h ? JSON.stringify(h) : "";
    if (kt !== hudKeys.t && gameHas("hudTimer")) { hudKeys.t = kt; gameCall("hudTimer", t); }
    if (kh !== hudKeys.h && gameHas("hudHearts")) { hudKeys.h = kh; gameCall("hudHearts", h); }
  }

  function paintTimer() {
    if (!view.par || !run || run.done) return;
    var cur = q(), el = Math.min(elapsed(), 2 * cur.par), par = cur.par;
    if (!cur.timed) {
      view.par.hidden = true;
      hud(run.hearts === null ? null : { on: false, hearts: run.hearts, max: run.max });
      return;
    }
    view.par.hidden = false;
    var over = el > par, u = urgency(el, par);
    var left = over ? 2 * par - el : par - el;
    var frac = Math.max(0, Math.min(1, left / par));
    var stopped = run.cur.phase !== "ask";
    view.par.setAttribute("data-urgency", stopped ? "stopped" : u);
    view.parFill.style.width = (frac * 100).toFixed(2) + "%";
    view.parText.textContent = clockText(left);
    view.parLabel.textContent = stopped ? (run.cur.phase === "retry" ? "clock stopped" : "answered") : over ? "until time runs out" : "to par";
    view.par.setAttribute("aria-label", stopped ? "Clock stopped" : over ? "Past par. " + clockText(left) + " until time runs out" : clockText(left) + " to par");
    hud({
      on: true, text: clockText(left), urgency: stopped ? "ok" : u, label: over ? "left" : "to par",
      paused: !!run.cur.paused, stopped: stopped, hearts: run.hearts, max: run.max
    });
    if (stopped || run.cur.paused) return;
    /* announce each threshold once, politely; tick in the last three seconds of par */
    var toPar = par - el;
    if (!over && par > 30 && toPar <= 30 && !clock.said[30]) { clock.said[30] = 1; say("30 seconds to par."); }
    if (!over && par > 10 && toPar <= 10 && !clock.said[10]) { clock.said[10] = 1; say("10 seconds to par."); }
    if (over && !clock.said.par) { clock.said.par = 1; say("Past par. A correct answer is still worth 60 points until the time runs out."); }
    if (!over && toPar <= 3 && toPar > 0) {
      var s = Math.ceil(toPar);
      if (s !== clock.ticked) { clock.ticked = s; sfx("par-tick"); }
    }
  }

  /* ---------------------------------------------------------- answering -- */

  function points(el) {
    var cur = q();
    if (!cur.timed || el <= cur.par) return { pts: Math.round(100 * (1 + 0.2 * Math.min(5, run.streak))), late: false };
    return { pts: 60, late: true };
  }

  /* readers type 140° as often as 140 */
  function clean(given, type) {
    var s = String(given);
    if (type === "number" || type === "fraction") s = s.replace(/\s*(°|deg(rees?)?)\s*$/i, "");
    return s;
  }

  /* no heart at stake on this question: a shaky or hand-picked section, Untimed, calm */
  function heartFree() { return run.hearts === null || !!q().hf; }

  function record(entry) {
    var cur = q();
    entry.section = cur.sec;
    entry.due = cur.due;
    entry.timed = cur.timed;
    entry.hf = heartFree();
    run.ans[run.i] = entry;
  }

  function loseHeart() {
    if (heartFree() || run.hearts <= 0) return false;
    run.hearts--;
    return true;
  }

  function check() {
    if (!run || run.done || run.cur.paused || settledElsewhere()) return;
    var phase = run.cur.phase;
    if (phase === "done") { next(); return; }
    var given = view.input.value;
    if (String(given).trim() === "") { nudge("Type an answer, then press Check."); return; }
    nudge("");
    var ok = false;
    try { ok = Site.grade(clean(given, prob.type), prob.answer, prob.type, prob.tol); } catch (e) { ok = false; }
    run.cur.given = given;
    if (phase === "ask") {
      var el = elapsed();
      /* an answer that arrives after the cap (a frozen tab, a slow tick) is a timeout */
      if (q().timed && el >= 2 * q().par) { timeout(); return; }
      stopClock();
      run.cur.el = Math.min(el, 2 * q().par);
      if (ok) {
        var p = points(el);
        if (!p.late) { run.streak++; run.bestStreak = Math.max(run.bestStreak, run.streak); }
        run.score += p.pts;
        record({ first: true, retry: false, pass: false, timeout: false, miss: false, late: p.late, pts: p.pts });
        run.cur.phase = "done";
        sfx("correct-first");
      } else {
        run.streak = 0;
        var lost = loseHeart();
        run.cur.phase = "retry";
        run.cur.lost = lost;
        record({ first: false, retry: false, pass: false, timeout: false, miss: true, lost: lost, late: false, pts: 0 });
        sfx("miss");
        if (lost) { sfx("heart-lost"); view.justLost = true; }
      }
    } else if (phase === "retry") {
      /* the retry pays 30 only where the miss cost a heart could; without a heart at
         stake it scores nothing, so a guess first is never better than passing */
      var a = run.ans[run.i];
      if (ok) { a.retry = true; a.pts = a.hf ? 0 : 30; run.score += a.pts; sfx("correct"); }
      else { a.second = true; sfx("miss"); }
      run.cur.phase = "done";
    }
    saveRun(false);
    Store.emit({ type: "arena", phase: "answer", index: run.i, correct: ok });
    paintQuestionState(true);
  }

  /* "I don't know". With a heart at stake it shows the worked solution; without one it
     brings up the same hint and retry a wrong answer would, so the two are worth the same */
  function pass() {
    if (!run || run.done || run.cur.paused || settledElsewhere()) return;
    var phase = "done";
    if (run.cur.phase === "ask") {
      var el = elapsed();
      stopClock();
      run.cur.el = Math.min(el, 2 * q().par);
      run.streak = 0;
      record({ first: false, retry: false, pass: true, timeout: false, miss: false, late: false, pts: 0 });
      if (heartFree()) phase = "retry";
    } else if (run.cur.phase === "retry") {
      run.ans[run.i].gaveUp = true;
    } else return;
    run.cur.phase = phase;
    saveRun(false);
    Store.emit({ type: "arena", phase: "answer", index: run.i, correct: false, pass: true });
    paintQuestionState(true);
  }

  function timeout() {
    if (!run || run.cur.phase !== "ask") return;
    stopClock();
    run.cur.el = 2 * q().par;
    run.streak = 0;
    record({ first: false, retry: false, pass: false, timeout: true, miss: false, late: false, pts: 0 });
    run.cur.phase = "done";
    sfx("timeout");
    saveRun(false);
    Store.emit({ type: "arena", phase: "answer", index: run.i, correct: false, timeout: true });
    paintQuestionState(true);
  }

  function next() {
    if (!run || run.cur.phase !== "done" || settledElsewhere()) return;
    if (run.hearts === 0) { finish("hearts"); return; }
    if (run.i + 1 >= run.qs.length) { finish("complete"); return; }
    run.i++;
    run.cur = freshCur();
    clock.said = {};
    clock.ticked = -1;
    clock.lastSaved = -1;
    saveRun(false);
    paintQuestion();
  }

  function pause(on) {
    if (!run || run.done || screen !== "run") return;
    if (on === run.cur.paused) return;
    if (on) { stopClock(); run.cur.paused = true; }
    else run.cur.paused = false;
    saveRun(true);
    paintPause();
    /* focus goes back where the reader was: the answer box, or Next once answered */
    if (!on) {
      startClock();
      var nb = run.cur.phase === "done" ? view.feedback.querySelector('[data-act="next"]') : null;
      if (nb) nb.focus();
      else if (view.input && !view.input.disabled) view.input.focus();
    }
    say(on ? "Paused. The question is hidden until you resume." : "Resumed.");
  }

  /* Calm mode switched on during a run that began without it: from here on the run is
     Untimed, with no clock and no hearts, and it is scored as untimed (no best, no
     medal). Switching calm off again leaves it so; the next run follows the setting. */
  function calmRun() {
    if (!run || run.done || run.calm || run.calmed || !calm()) return false;
    stopClock();
    run.calmed = true;
    run.tempo = "untimed";
    run.hearts = null;
    for (var k = run.i; k < run.qs.length; k++) { run.qs[k].timed = false; run.qs[k].hf = true; }
    saveRun(true);
    return true;
  }

  /* --------------------------------------------------------- settling ---- */

  function buildResult(r, reason) {
    var answers = r.ans.filter(Boolean).map(function (a) {
      return { section: a.section, first: !!a.first, retry: !!a.retry, pass: !!a.pass, timeout: !!a.timeout, late: !!a.late, due: !!a.due, hf: !!a.hf };
    });
    var finished = reason === "complete";
    var firsts = answers.filter(function (a) { return a.first; }).length;
    var parts = { first: 0, retry: 0, finish: 0, daily: 0 };
    answers.forEach(function (a) {
      if (a.first) parts.first += a.due ? 3 : 2;
      else if (a.retry && !a.hf) parts.retry += 1;
    });
    if (finished && r.qs.length === 10 && answers.length === 10 && (r.hearts === null || r.hearts > 0)) parts.finish = 5;
    if (finished && r.mode === "daily" && !(gameStore().daily || {})[r.day]) parts.daily = 10;
    var ranked = TEMPO[r.tempo] > 0 && r.hearts !== null;
    var medal = 0;
    if (r.mode === "boss" && finished && ranked && r.hearts > 0) medal = r.hearts >= HEARTS ? 3 : 2;
    return {
      mode: r.mode, boss: r.boss || undefined, section: r.section || undefined,
      answers: answers, hearts: r.hearts, maxHearts: r.max, score: r.score, day: r.day,
      tempo: r.tempo, ranked: ranked, timed: TEMPO[r.tempo] > 0 && r.mode !== "repair",
      finished: finished, ended: reason, n: answers.length, planned: r.qs.length,
      firstTry: firsts, bestStreak: r.bestStreak || 0, medal: medal,
      /* the game layer's rule, kept here for when it is absent: played to the end, every
         answer right, at least four in five of them first time */
      repaired: r.mode === "repair" && finished && answers.length > 0 && answers.length >= r.qs.length &&
        firsts / answers.length >= 0.8 && answers.every(function (a) { return a.first || a.retry; }),
      xp: parts.first + parts.retry + parts.finish + parts.daily, xpParts: parts
    };
  }

  /* Pay once: the run's id joins the ledger of paid runs, in the same write that marks
     it done, before anything is paid. A run already in the ledger (settled in another
     tab) is closed without paying and returns null. */
  function settle(r, reason) {
    if (r.paid) return r.result;
    var all = runStore(), ledger = paidIds(all), id = runId(r);
    if (ledger.indexOf(id) > -1) { r.done = true; r.paid = true; r.ended = reason; return null; }
    /* a Daily dealt before that day's was spent (another tab, another device) pays nothing */
    var replay = r.mode === "daily" && dailySpent(r.day);
    var result = buildResult(r, reason);
    r.done = true;
    r.paid = true;
    r.ended = reason;
    r.result = result;
    all.paid = ledger.concat([id]).slice(-PAID_KEEP);
    all.arena = reason === "banked" ? null : r;
    Store.write(RUN_KEY, all, true);
    if (replay) {
      result.xp = 0; result.xpParts = null; result.replay = true;
    } else if (gameHas("recordRun")) {
      /* the game layer pays the XP and keeps recall, bests, Daily and medals; a medal
         is only at stake in a timed rematch with hearts that was not abandoned */
      var payload = {}, fixBefore = fixOf(result.section);
      Object.keys(result).forEach(function (k) { payload[k] = result[k]; });
      if (!result.ranked || reason === "banked") delete payload.boss;
      /* a banked run was not finished, so it must not collect the finishing bonus */
      if (reason === "banked") payload.hearts = 0;
      var back = gameCall("recordRun", payload);
      if (back && typeof back.xp === "number") { result.xp = back.xp; result.xpParts = null; }
      result.medal = payload.boss && back ? back.medal || 0 : 0;
      /* a ranked rematch that kept a heart and still won nothing: the set is not cleared */
      if (payload.boss && back && back.cleared === false) result.uncleared = true;
      if (result.mode === "repair") result.repaired = fixOf(result.section) > fixBefore;
    } else fallbackRecord(result);
    /* the game layer may have written the run store meanwhile: read it again */
    all = runStore();
    if (reason !== "banked") all.arena = r;
    if (r.mode === "daily" && result.n && !result.replay) {
      all.daily = { day: r.day, score: result.score, firstTry: result.firstTry, n: result.n, planned: result.planned, ended: reason };
    }
    Store.write(RUN_KEY, all, true);
    Store.emit({ type: "arena", phase: "end", result: result });
    return result;
  }

  function fixOf(id) {
    var rec = id ? (gameStore().sec || {})[id] : null;
    return rec && rec.fix ? +rec.fix || 0 : 0;
  }

  /* a record written over an older one keeps the old one's other fields (as game.js does) */
  function carried(old, rec) {
    Object.keys(old && typeof old === "object" ? old : {}).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(rec, k)) rec[k] = old[k];
    });
    return rec;
  }
  /* without the game layer: pay the XP and keep the small record the deck reads */
  function fallbackRecord(res) {
    if (res.xp > 0 && window.BMActivity) window.BMActivity.add(res.xp, "arena");
    var g = gameStore();
    g.sec = g.sec && typeof g.sec === "object" ? g.sec : {};
    var bySec = {};
    res.answers.forEach(function (a) {
      var b = bySec[a.section] = bySec[a.section] || { n: 0, ok: 0 };
      b.n++;
      if (a.first) b.ok++;
    });
    Object.keys(bySec).forEach(function (id) {
      var rec = g.sec[id] && typeof g.sec[id] === "object" ? g.sec[id] : { n: 0, ok: 0, box: 0 };
      rec.n = (rec.n || 0) + bySec[id].n;
      rec.ok = (rec.ok || 0) + bySec[id].ok;
      rec.box = bySec[id].ok === bySec[id].n ? Math.min(5, (rec.box || 0) + 1) : 1;
      rec.last = res.day;
      if (res.repaired && id === res.section) rec.fix = now();
      g.sec[id] = rec;
    });
    if (res.ranked && res.finished) {
      g.best = g.best && typeof g.best === "object" ? g.best : {};
      var key = res.mode === "boss" ? "boss:" + res.boss : res.mode, b0 = g.best[key];
      if (!b0 || res.score > b0.score || (res.score === b0.score && res.hearts > b0.hearts)) g.best[key] = carried(b0, { score: res.score, hearts: res.hearts, day: res.day });
    }
    if (res.mode === "daily" && res.finished) {
      g.daily = g.daily && typeof g.daily === "object" ? g.daily : {};
      g.daily[res.day] = 1;
    }
    if (res.medal) {
      g.enc = g.enc && typeof g.enc === "object" ? g.enc : {};
      var k = res.boss + "/practice", e = g.enc[k];
      if (!e || res.medal > (e.medal || 0)) g.enc[k] = carried(e, { medal: res.medal, day: res.day });
    }
    Store.write(GAME_KEY, g);
  }

  function finish(reason) {
    stopClock();
    if (!settle(run, reason)) { leaveSettled(); return; }
    sfx("run-end");
    hud(null);
    renderResult();
  }

  /* ----------------------------------------------------------- markup ---- */

  var HEART = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 14.2S1.6 10.3 1.6 5.9A3.3 3.3 0 0 1 8 4.3a3.3 3.3 0 0 1 6.4 1.6C14.4 10.3 8 14.2 8 14.2z"/></svg>';

  function heartsHtml(n, max) {
    var html = '<span class="arena-hearts" role="img" aria-label="' + n + " of " + max + ' hearts">';
    for (var i = 0; i < max; i++) html += "<i" + (i < n ? " data-full" : "") + ">" + HEART + "</i>";
    return html + "</span>";
  }

  function setScreen(name) {
    screen = name;
    host.setAttribute("data-screen", name);
    document.body.setAttribute("data-arena-screen", name);
    if (name !== "run") { stopClock(); hud(null); }
  }

  /* ------------------------------------------------------------- lobby ---- */

  function bests() { var b = gameStore().best; return b && typeof b === "object" ? b : {}; }

  /* disabled is true (greyed: nothing to start yet) or "done" (spent for today, still legible) */
  function modeTile(mode, meta, extra, disabled) {
    var best = bests()[mode];
    return '<button type="button" class="arena-mode" data-act="start" data-mode="' + mode + '"' + (disabled ? " disabled" : "") + (disabled === "done" ? ' data-done="true"' : "") + ">" +
      '<span class="arena-mode-name">' + MODES[mode].label + "</span>" +
      '<span class="arena-mode-meta">' + meta + "</span>" +
      (extra ? '<span class="arena-mode-extra">' + extra + "</span>" : "") +
      (best && best.score ? '<span class="arena-mode-best">Best <b>' + best.score + "</b></span>" : "") +
      "</button>";
  }

  function tempoHtml() {
    var t = tempo(), html = '<fieldset class="arena-tempo"><legend>Tempo</legend><div class="arena-tempo-opts">';
    [["standard", "Standard", "Par as set"], ["extended", "Extended", "Twice the time"], ["untimed", "Untimed", "No clock, no hearts"]].forEach(function (o) {
      html += '<label class="arena-tempo-opt"><input type="radio" name="arena-tempo" value="' + o[0] + '"' + (t === o[0] ? " checked" : "") + ">" +
        "<span><b>" + o[1] + "</b><small>" + o[2] + "</small></span></label>";
    });
    html += "</div>";
    if (t === "untimed") html += '<p class="arena-fine">Untimed runs still pay XP and still count towards recall, but keep no best scores and win no medals.</p>';
    else if (calm()) html += '<p class="arena-fine">Calm mode is on, so hearts are switched off; the clock runs only because you chose it.</p>';
    return html + "</fieldset>";
  }

  function resumeHtml(r) {
    if (!openRun(r)) return "";
    var answered = r.ans.filter(Boolean).length;
    var bits = [MODES[r.mode].label, "question " + Math.min(r.qs.length, r.i + 1) + " of " + r.qs.length, plural(r.score, "point")];
    if (r.hearts !== null) bits.splice(2, 0, r.hearts + " of " + r.max + " hearts");
    return '<div class="arena-card arena-resume" data-part="' + esc(secInfo(r.qs[r.i].sec) ? secInfo(r.qs[r.i].sec).part : "algebra") + '">' +
      "<h2>An unfinished run</h2><p>" + esc(bits.join(" · ")) + ".</p>" +
      '<div class="arena-actions"><button type="button" class="btn" data-act="resume">Resume</button>' +
      '<button type="button" class="btn ghost" data-act="bank">Bank it</button></div>' +
      '<p class="arena-fine">Banking ends the run now and pays XP for the ' + plural(answered, "answer") + " already given. Starting a new run banks it too.</p></div>";
  }

  function contextHtml(d) {
    var html = "", ch, ids;
    if (params.boss) {
      ch = C.chapterById(params.boss);
      if (!ch) return '<div class="arena-card"><h2>Boss rematch</h2><p>There is no chapter called “' + esc(params.boss) + '”.</p></div>';
      ids = ch.sections.map(function (s) { return ch.id + "#" + s.id; }).filter(hasGen);
      var quest = window.BM_QUEST && window.BM_QUEST.bosses && window.BM_QUEST.bosses[ch.id];
      var title = Site.chapterName(ch) + (quest && quest.name ? " · " + quest.name : " · " + ch.title);
      if (ids.length < 2) {
        return '<div class="arena-card arena-context" data-part="' + ch.part.id + '"><h2>Boss rematch: ' + esc(title) + "</h2>" +
          "<p>A rematch needs problems from at least two of the chapter's sections, and the Arena can generate problems for " +
          (ids.length ? "only one so far (" + esc(secName(ids[0])) + ")" : "none of them yet") +
          ". Ten questions from one section would be drill, not a rematch.</p>" +
          "<p>A Standard run mixes " + (ids.length ? "that section" : "this chapter's material") + " with the rest of your deck instead.</p>" +
          '<div class="arena-actions"><button type="button" class="btn" data-act="start" data-mode="standard">Start a Standard run</button></div></div>';
      }
      var untried = ids.filter(function (id) { return statusOf(d, id) === "new"; });
      /* a rematch raises a medal the set has earned; before the set is cleared it wins none */
      var uncleared = gameCall("cleared", ch.id) === false;
      html += '<div class="arena-card arena-context" data-part="' + ch.part.id + '"><h2>Boss rematch: ' + esc(title) + "</h2>" +
        "<p>Ten questions from " + ids.map(function (id) { return esc(secInfo(id).label); }).join(", ") + ". " +
        (uncleared
          ? 'A rematch can only raise the medal of a cleared set, so until you <a href="' + esc(root() + ch.path + "#practice") + '">clear the practice set on the chapter page</a> it is practice and wins no medal.'
          : "Finish with all three hearts for Gold, with one or two for Silver.") + "</p>";
      if (untried.length) html += '<p class="arena-fine">' + esc(untried.map(secName).join(", ")) + (untried.length === 1 ? " is" : " are") + " not in your deck yet, so " + (untried.length === 1 ? "its questions come" : "their questions come") + " without clock or hearts.</p>";
      if (!uncleared && (tempo() === "untimed" || calm())) html += '<p class="arena-fine">Medals need the clock and hearts, so with this tempo the rematch is practice only.</p>';
      return html + '<div class="arena-actions"><button type="button" class="btn big" data-act="start" data-mode="boss">Start the rematch</button></div></div>';
    }
    if (params.repair) {
      var info = secInfo(params.repair);
      if (!info) return '<div class="arena-card"><h2>Repair</h2><p>There is no section called “' + esc(params.repair) + '”.</p></div>';
      if (!hasGen(params.repair)) {
        return '<div class="arena-card arena-context" data-part="' + info.part + '"><h2>Repair: ' + esc(secName(params.repair)) + "</h2>" +
          "<p>The Arena cannot generate problems for this section yet. The best repair is the chapter itself: " +
          '<a href="' + esc(root() + info.path) + '">reread ' + esc(info.label) + "</a>, then try its practice problems again.</p></div>";
      }
      return '<div class="arena-card arena-context" data-part="' + info.part + '"><h2>Repair: ' + esc(secName(params.repair)) + "</h2>" +
        "<p>Five questions from this one section, untimed and without hearts. Get every one right, at least four of them first time, and the section counts as repaired.</p>" +
        '<p class="arena-fine">Stuck on the first one? <a href="' + esc(root() + info.path) + '">Reread ' + esc(info.label) + "</a> first; there is no hurry here.</p>" +
        '<div class="arena-actions"><button type="button" class="btn big" data-act="start" data-mode="repair">Start the repair</button></div></div>';
    }
    return "";
  }

  function deckHtml(d) {
    var pk = picks(), counts = { solid: 0, shaky: 0, picked: 0 }, html = "";
    /* with nothing ready, Part I starts open so the ticks are in reach */
    var anyReady = Object.keys(SECTIONS).some(function (id) { return hasGen(id) && (statusOf(d, id) !== "new" || pk[id]); });
    C.parts.forEach(function (part) {
      var rows = "", ready = 0, total = 0;
      part.chapters.forEach(function (ch) {
        ch.sections.forEach(function (s) {
          var id = ch.id + "#" + s.id;
          if (!hasGen(id)) return;
          total++;
          var st = statusOf(d, id), info = secInfo(id);
          if (st === "solid") counts.solid++;
          if (st === "shaky") counts.shaky++;
          if (st === "new" && pk[id]) counts.picked++;
          if (st !== "new" || pk[id]) ready++;
          rows += '<li class="arena-sec" data-status="' + st + '">' +
            '<a class="arena-sec-name" href="' + esc(root() + info.path) + '"><span class="arena-sec-label">' + esc(info.label) + "</span> " + esc(s.title) + "</a>" +
            '<span class="arena-sec-meta">';
          if (st === "new") {
            rows += '<label class="arena-pick"><input type="checkbox" data-pick="' + esc(id) + '"' + (pk[id] ? " checked" : "") + "> Practise, untimed</label>";
          } else {
            rows += '<span class="arena-chip" data-status="' + st + '">' + (st === "solid" ? "Solid" : "Shaky") + "</span>";
            if (d[id] && d[id].due) rows += '<span class="arena-chip" data-status="due">Due</span>';
            if (st === "shaky") rows += '<a class="arena-repair" href="arena.html?repair=' + encodeURIComponent(id) + '">Repair</a>';
          }
          rows += "</span></li>";
        });
      });
      if (!total) return;
      var open = ready || (!anyReady && !html);
      html += '<details class="arena-part" data-part="' + part.id + '"' + (open ? " open" : "") + ">" +
        "<summary><span>Part " + part.num + " — " + esc(part.name) + '</span><span class="arena-part-count">' + ready + " of " + total + " ready</span></summary>" +
        '<ul class="arena-secs">' + rows + "</ul></details>";
    });
    var sum = counts.solid + counts.shaky + counts.picked;
    var line = sum
      ? "<b>" + plural(sum, "section") + "</b> ready: " + [counts.solid ? counts.solid + " solid" : "", counts.shaky ? counts.shaky + " shaky" : "", counts.picked ? counts.picked + " picked by hand" : ""].filter(Boolean).join(", ") + "."
      : "No sections ready yet.";
    return { html: html, count: sum, hard: counts.solid, line: line };
  }

  function rulesHtml() {
    return '<details class="arena-rules"><summary>How a run is scored</summary><ul>' +
      "<li>Right first time within par: <b>100</b>, plus 20 for each answer in your current streak (up to +100).</li>" +
      "<li>Right first time after par, before the time runs out at twice par: <b>60</b>, and the streak holds.</li>" +
      "<li>Wrong: the clock stops, the hint appears, and you get one untimed retry worth <b>30</b>. A wrong answer costs a heart, at most one per question.</li>" +
      "<li>“I don't know” and running out of time score nothing but never cost a heart, so where a heart is at stake a guess is always worse than passing.</li>" +
      "<li>Where no heart is at stake (shaky sections, sections you pick by hand, Untimed tempo, calm mode), “I don't know” brings up the same hint and retry as a wrong answer, and that retry scores nothing, so a guess never beats passing.</li>" +
      "<li>Shaky sections, sections you pick by hand, and problems with only a few possible answers come without the clock.</li>" +
      "<li>The Daily is one attempt a day: once a Daily you have answered in ends, finished or banked, the next one comes with tomorrow's seed.</li>" +
      "<li>The clock stops while you read feedback, while paused, and while the page is hidden. Being faster than par earns nothing extra.</li>" +
      "</ul></details>";
  }

  function renderLobby() {
    run = null;
    prob = null;
    view = {};
    setScreen("lobby");
    var d = deck(), saved = runStore().arena, dk = deckHtml(d);
    var html = '<div class="arena-lobby">';
    if (lobbyNote) { html += '<p class="arena-card arena-notice" role="status">' + esc(lobbyNote) + "</p>"; lobbyNote = ""; }
    html += resumeHtml(saved);
    html += contextHtml(d);
    if (!dk.count) {
      html += '<div class="arena-card arena-empty"><h2>Your deck fills up as you solve</h2>' +
        "<p>The Arena asks about a section once you have solved two of its problems on the chapter page, or one practice problem first time, so the clock never meets material you are still learning. " +
        "Solve a few practice problems in any chapter and those sections join your deck here.</p>" +
        "<p>Want to try it now? Tick sections below to practise them untimed and without hearts.</p>" +
        '<p><a class="btn ghost" href="index.html">Go to the chapters</a></p></div>';
    }
    if (!params.boss && !params.repair || dk.count) {
      html += '<div class="arena-modes" role="group" aria-label="Start a run">' +
        modeTile("standard", "10 questions · 3 hearts", dk.hard ? "" : (dk.count ? "Untimed until a section is solid" : ""), !dk.count) +
        dailyTile(dk, saved) +
        "</div>";
      if (dk.count && dk.count < 2) html += '<p class="arena-fine">With one section ready a run stops at five questions, so it never leans on one section for more than half.</p>';
    }
    html += tempoHtml();
    html += '<section class="arena-deck" aria-labelledby="arena-deck-h"><div class="arena-deck-head"><h2 id="arena-deck-h">Your deck</h2><p>' + dk.line + "</p></div>" + dk.html + "</section>";
    html += rulesHtml();
    html += "</div>";
    screenEl().innerHTML = html;
  }

  /* One attempt a day: once spent, the tile shows today's result and waits for tomorrow;
     an unfinished Daily from today is picked up again by the same tile. */
  function dailyTile(dk, saved) {
    if (dailyDone()) {
      var t = dailyToday();
      var said = t ? "Done today: " + plural(t.score, "point") + ", " + t.firstTry + " of " + t.n + " first try" : "Done today";
      return modeTile("daily", "5 questions · today's seed", esc(said) + ". A new one tomorrow.", "done");
    }
    var open = openRun(saved) && saved.mode === "daily" && saved.day === today();
    return modeTile("daily", "5 questions · today's seed", open ? "Today's run is waiting where you left it" : "+10 XP once a day · one attempt", !open && !dk.count);
  }

  function screenEl() { return host.querySelector(".arena-screen"); }

  /* --------------------------------------------------------------- run ---- */

  function renderRun() {
    calmRun();
    setScreen("run");
    var html = '<section class="arena-run" aria-label="' + esc(MODES[run.mode].label) + '">' +
      '<div class="arena-status">' +
      '<span class="arena-count">Question <b data-count></b> of ' + run.qs.length + "</span>" +
      '<span class="arena-hearts-slot"></span>' +
      '<span class="arena-score"><b data-score>0</b> points</span>' +
      '<span class="arena-streak" title="Answers right first time within par, in a row">Streak <b data-streak>0</b></span>' +
      '<button type="button" class="btn ghost small arena-pause" data-act="pause" aria-keyshortcuts="Escape">Pause</button>' +
      "</div>" +
      '<p class="arena-fine arena-calmnote" hidden>Calm mode was switched on during this run, so the rest of it has no clock and no hearts, and it counts as an Untimed run.</p>' +
      '<div class="arena-par" role="timer" data-urgency="ok" hidden>' +
      '<span class="arena-par-track" aria-hidden="true"><span class="arena-par-fill"></span></span>' +
      '<span class="arena-par-read" aria-hidden="true"><b class="arena-par-text">0:00</b> <span class="arena-par-label">to par</span></span>' +
      "</div>" +
      '<article class="arena-q">' +
      '<p class="arena-q-meta"><span class="arena-q-sec"></span><span class="arena-q-tag" hidden></span></p>' +
      '<div class="arena-q-text"></div>' +
      '<div class="arena-form">' +
      '<label class="visually-hidden" for="arena-answer">Your answer</label>' +
      '<input id="arena-answer" type="text" autocomplete="off" autocapitalize="off" spellcheck="false">' +
      '<button type="button" class="btn" data-act="check">Check</button>' +
      '<button type="button" class="btn ghost" data-act="pass">I don\'t know</button>' +
      "</div>" +
      '<p class="arena-nudge" role="status" hidden></p>' +
      "</article>" +
      '<div class="arena-feedback" role="status" aria-live="polite" aria-atomic="true"></div>' +
      '<div class="arena-pausebox" hidden><p class="arena-pause-title">Paused</p>' +
      "<p>The question is hidden while the clock is stopped.</p>" +
      '<div class="arena-actions"><button type="button" class="btn" data-act="unpause">Resume</button>' +
      '<button type="button" class="btn ghost" data-act="leave">Back to the lobby</button></div>' +
      '<p class="arena-fine">Leaving keeps the run; you can resume or bank it from the lobby.</p></div>' +
      "</section>";
    screenEl().innerHTML = html;
    var el = screenEl();
    view = {
      count: el.querySelector("[data-count]"), score: el.querySelector("[data-score]"), streak: el.querySelector("[data-streak]"),
      hearts: el.querySelector(".arena-hearts-slot"), par: el.querySelector(".arena-par"),
      parFill: el.querySelector(".arena-par-fill"), parText: el.querySelector(".arena-par-text"), parLabel: el.querySelector(".arena-par-label"),
      card: el.querySelector(".arena-q"), sec: el.querySelector(".arena-q-sec"), tag: el.querySelector(".arena-q-tag"),
      text: el.querySelector(".arena-q-text"), input: el.querySelector("#arena-answer"),
      checkBtn: el.querySelector('[data-act="check"]'), passBtn: el.querySelector('[data-act="pass"]'),
      nudge: el.querySelector(".arena-nudge"), feedback: el.querySelector(".arena-feedback"),
      pausebox: el.querySelector(".arena-pausebox"), pauseBtn: el.querySelector(".arena-pause"),
      calmNote: el.querySelector(".arena-calmnote")
    };
    view.input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); check(); }
    });
    paintQuestion();
  }

  function paintStatus() {
    view.count.textContent = String(run.i + 1);
    view.score.textContent = String(run.score);
    view.streak.textContent = String(run.streak);
    view.hearts.innerHTML = run.hearts === null ? "" : heartsHtml(run.hearts, run.max);
    view.calmNote.hidden = !run.calmed;
    if (view.justLost) {
      var gone = view.hearts.querySelectorAll(".arena-hearts i")[run.hearts];
      if (gone) gone.setAttribute("data-break", "true");
      view.justLost = false;
    }
  }

  function paintQuestion() {
    var cur = q();
    try { prob = Gen.make(cur.g, cur.s); } catch (e) { prob = null; }
    if (!prob) {
      /* a generator that fails is skipped, never blamed on the reader */
      record({ first: false, retry: false, pass: true, timeout: false, miss: false, late: false, pts: 0, skipped: true });
      run.cur.phase = "done";
      next();
      return;
    }
    var info = secInfo(cur.sec);
    view.card.setAttribute("data-part", info ? info.part : "algebra");
    view.sec.textContent = info ? info.label + " " + info.section.title : cur.sec;
    paintTag();
    view.text.textContent = prob.q;
    Site.renderMath(view.text);
    view.input.value = run.cur.phase === "ask" ? "" : run.cur.given || "";
    view.input.placeholder = prob.placeholder || (prob.type === "set" ? "e.g. 2,-3" : prob.type === "expr" ? "your answer" : "your answer");
    paintStatus();
    paintQuestionState(false);
    paintPause();
    if (run.cur.phase === "ask") startClock();
    paintTimer();
    if (!run.cur.paused) {
      if (run.cur.phase === "done") { var nb = view.feedback.querySelector('[data-act="next"]'); if (nb) nb.focus(); }
      else view.input.focus();
    }
  }

  function paintTag() {
    var cur = q(), tag = "";
    if (cur.st === "shaky" && !cur.timed && run.mode !== "repair" && TEMPO[run.tempo] > 0) tag = "Untimed, no heart: still settling";
    else if (cur.st === "new" && run.mode !== "repair") tag = "Untimed, no heart: picked by hand";
    else if (!cur.timed && TEMPO[run.tempo] > 0 && run.mode !== "repair") tag = "Untimed: few possible answers";
    view.tag.textContent = tag;
    view.tag.hidden = !tag;
  }

  function stepsHtml(open) {
    var list = '<ol class="arena-steps-list">' + prob.steps.map(function () { return "<li></li>"; }).join("") + "</ol>";
    return '<details class="arena-steps"' + (open ? " open" : "") + "><summary>" + (open ? "Worked solution" : "Compare with the worked solution") + "</summary>" + list +
      '<p class="arena-key">Accepted answer: <code></code></p></details>';
  }
  function fillSteps() {
    var items = view.feedback.querySelectorAll(".arena-steps-list li");
    Array.prototype.forEach.call(items, function (li, i) { li.textContent = prob.steps[i]; });
    var key = view.feedback.querySelector(".arena-key code");
    if (key) key.textContent = prob.answer.split("|")[0];
    var hint = view.feedback.querySelector(".arena-hint-text");
    if (hint) hint.textContent = prob.hint;
    Site.renderMath(view.feedback);
  }

  /* the feedback panel and form for the current phase; "fresh" is true right after an answer */
  function paintQuestionState(fresh) {
    var cur = q(), a = run.ans[run.i], phase = run.cur.phase, html = "";
    var last = run.hearts === 0 || run.i + 1 >= run.qs.length;
    var nextBtn = '<div class="arena-actions"><button type="button" class="btn" data-act="next">' + (last ? "See your results" : "Next question") + "</button></div>";
    view.input.disabled = phase === "done";
    view.checkBtn.hidden = phase === "done";
    view.passBtn.hidden = phase === "done";
    view.passBtn.textContent = phase === "retry" ? "Show the solution" : "I don't know";
    view.card.setAttribute("data-phase", phase);
    if (phase === "ask") {
      view.feedback.innerHTML = "";
      view.feedback.removeAttribute("data-kind");
    } else if (phase === "retry") {
      /* reached by a wrong answer, or by "I don't know" where no heart is at stake */
      html = (a && a.pass
        ? '<p class="arena-verdict" data-kind="pass">No heart at stake here, so first a hint.</p>'
        : '<p class="arena-verdict" data-kind="no">✗ Not right' + (a && a.lost ? ", and that cost a heart." : ".") + "</p>") +
        '<div class="arena-hint"><span class="arena-hint-label">Hint</span><p class="arena-hint-text"></p></div>' +
        '<p class="arena-next">' + (cur.timed ? "The clock has stopped. " : "") + "Try once more, or open the solution." +
        (a && a.hf ? " Without a heart at stake, the second try scores no points." : "") + "</p>";
      view.feedback.setAttribute("data-kind", "retry");
    } else if (a) {
      if (a.first) {
        html = '<p class="arena-verdict" data-kind="ok">✓ Correct. <b>+' + a.pts + "</b></p>" +
          (a.late ? '<p class="arena-next">After par, so 60 points and the streak holds. Inside par it would have counted towards the streak.</p>' : "") +
          stepsHtml(false) + nextBtn;
        view.feedback.setAttribute("data-kind", "ok");
      } else if (a.retry) {
        html = '<p class="arena-verdict" data-kind="ok">✓ Correct on the second try.' + (a.pts ? " <b>+" + a.pts + "</b>" : "") + "</p>" + stepsHtml(false) + nextBtn;
        view.feedback.setAttribute("data-kind", "ok");
      } else if (a.timeout) {
        html = '<p class="arena-verdict" data-kind="time">Time ran out. No heart lost.</p>' + stepsHtml(true) + nextBtn;
        view.feedback.setAttribute("data-kind", "solution");
      } else if (a.pass) {
        html = '<p class="arena-verdict" data-kind="pass">Passing was the honest move. No heart lost; here is how it goes.</p>' + stepsHtml(true) + nextBtn;
        view.feedback.setAttribute("data-kind", "solution");
      } else {
        html = '<p class="arena-verdict" data-kind="' + (a.gaveUp ? "pass" : "no") + '">' + (a.gaveUp ? "Here is how it goes." : "✗ Still not right. Here is how it goes.") + "</p>" + stepsHtml(true) + nextBtn;
        view.feedback.setAttribute("data-kind", "solution");
      }
      if (run.hearts === 0) html = '<p class="arena-out">That was your last heart. The run ends here; the results name the section to reread.</p>' + html;
    }
    if (html) {
      view.feedback.innerHTML = html;
      fillSteps();
      if (fresh && phase === "done") { var nb = view.feedback.querySelector('[data-act="next"]'); if (nb) nb.focus(); }
      if (fresh && phase === "retry") { view.input.focus(); view.input.select(); }
    }
    paintStatus();
    paintTimer();
  }

  function paintPause() {
    var p = !!(run && run.cur.paused);
    view.pausebox.hidden = !p;
    view.card.hidden = p;
    view.feedback.hidden = p;
    view.par.classList.toggle("is-paused", p);
    view.pauseBtn.textContent = p ? "Resume" : "Pause";
    view.pauseBtn.setAttribute("aria-pressed", p ? "true" : "false");
    if (p) { var b = view.pausebox.querySelector('[data-act="unpause"]'); if (b) b.focus(); }
    paintTimer();
  }

  function nudge(text) {
    if (!view.nudge) return;
    view.nudge.textContent = text;
    view.nudge.hidden = !text;
  }

  /* ------------------------------------------------------------ result ---- */

  function weakest(res) {
    var by = {}, order = [];
    res.answers.forEach(function (a) {
      if (!by[a.section]) { by[a.section] = { id: a.section, n: 0, first: 0, cost: 0 }; order.push(by[a.section]); }
      var b = by[a.section];
      b.n++;
      if (a.first) b.first++;
      else b.cost += a.retry ? 1 : 2;
    });
    return order.filter(function (b) { return b.cost > 0; })
      .sort(function (x, y) { return y.cost / y.n - x.cost / x.n || y.cost - x.cost; });
  }

  function tile(label, value, sub) {
    return '<div class="arena-stat"><span class="arena-stat-label">' + label + '</span><span class="arena-stat-value">' + value + "</span>" +
      (sub ? '<span class="arena-stat-sub">' + sub + "</span>" : "") + "</div>";
  }

  function renderResult() {
    setScreen("result");
    var res = run.result || buildResult(run, run.ended || "complete");
    var weak = weakest(res), out = res.ended === "hearts";
    var title = out ? "Out of hearts" : res.ended === "banked" ? "Run banked" : res.mode === "repair" ? (res.repaired ? "Section repaired" : "Repair finished") : "Run complete";
    var html = '<section class="arena-result" aria-labelledby="arena-result-h">';
    html += '<p class="arena-kicker">' + esc(MODES[res.mode].label) + (res.mode === "boss" && res.boss ? " · " + esc(Site.chapterName(C.chapterById(res.boss))) : "") +
      " · " + esc(TEMPO_LABEL[res.tempo] || "") + " tempo</p>";
    html += '<h2 id="arena-result-h" tabindex="-1">' + title + "</h2>";
    html += '<p class="arena-bigscore"><b>' + res.score + "</b> points</p>";
    if (res.mode === "boss") {
      html += res.medal
        ? '<p class="arena-medal" data-medal="' + res.medal + '">' + (res.medal === 3 ? "Gold medal: all three hearts kept." : res.medal === 2 ? "Silver medal: finished with a heart to spare." : "Bronze medal: you saw the rematch through.") + "</p>"
        : '<p class="arena-fine">' + (!res.ranked ? "Untimed rematches are practice only and win no medal."
          : res.ended === "banked" ? "A banked rematch wins no medal."
          : res.uncleared ? "No medal: a rematch can only raise the medal of a cleared set. Clear this chapter's practice set on its page, and a rematch like this one will count."
          : "No medal this time: finish with at least one heart to earn one.") + "</p>";
    }
    if (res.mode === "repair") {
      html += "<p>" + res.firstTry + " of " + res.n + " right first time. " +
        (res.repaired ? "That is enough to mark " + esc(secName(res.section)) + " as repaired."
          : res.finished ? "Every answer right, four of them first time, marks it repaired; reread it and try again whenever you like."
          : "A repair counts once all " + res.planned + " questions are answered, every one right and four of them first time. Start it again whenever you like.") + "</p>";
    }
    if (res.replay) html += '<p class="arena-fine">That day\'s Daily had already been played, here or in another tab or on another device, so this one pays no XP and keeps no best.</p>';
    html += '<div class="arena-stats">';
    if (res.hearts !== null) html += tile("Hearts left", res.hearts + " <small>of " + res.maxHearts + "</small>", heartsHtml(res.hearts, res.maxHearts));
    html += tile("First try", res.firstTry + " <small>of " + res.n + "</small>", res.n < res.planned ? plural(res.planned - res.n, "question") + " not reached" : "");
    html += tile("XP earned", "+" + res.xp, xpNote(res));
    html += tile("Best streak", String(res.bestStreak), "");
    html += "</div>";
    html += '<div class="arena-review">';
    if (weak.length) {
      var w = weak[0], info = secInfo(w.id);
      html += '<p class="arena-weakest"><span>Weakest this run: <b>' + esc(secName(w.id)) + "</b></span>" +
        (info ? '<a class="btn small" href="' + esc(root() + info.path) + '">Reread ' + esc(info.label) + "</a>" : "") + "</p>";
      html += '<h3>Worth another look</h3><ul class="arena-weak">';
      weak.forEach(function (b) {
        var inf = secInfo(b.id);
        html += "<li><span>" + esc(secName(b.id)) + ' <small>' + b.first + " of " + b.n + " first try</small></span>" +
          (inf ? '<span class="arena-weak-links"><a href="' + esc(root() + inf.path) + '">Reread</a>' +
            (hasGen(b.id) ? ' <a href="arena.html?repair=' + encodeURIComponent(b.id) + '">Repair, untimed</a>' : "") + "</span>" : "") + "</li>";
      });
      html += "</ul>";
    } else if (res.n) {
      html += "<p>Every answer was right first time. Nothing to reread from this run.</p>";
    }
    html += "</div>";
    html += '<div class="arena-actions"><button type="button" class="btn" data-act="again">' + (res.mode === "daily" ? "A Standard run" : "Another run") + "</button>" +
      '<button type="button" class="btn ghost" data-act="lobby">Back to the lobby</button></div>';
    html += "</section>";
    screenEl().innerHTML = html;
    var h = screenEl().querySelector("#arena-result-h");
    if (h) { try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } }
    say(title + ". " + res.score + " points, " + res.firstTry + " of " + res.n + " right first time, " + res.xp + " XP." +
      (weak.length ? " Worth rereading: " + secName(weak[0].id) + "." : ""));
  }

  function xpNote(res) {
    var p = res.xpParts, bits = [];
    if (!p) return "";
    if (p.first) bits.push(p.first + " first try");
    if (p.retry) bits.push(p.retry + " retry");
    if (p.finish) bits.push("5 for finishing");
    if (p.daily) bits.push("10 daily bonus");
    return bits.join(" + ");
  }

  /* ------------------------------------------------------------ events ---- */

  host.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!t || !host.contains(t) || t.disabled) return;
    var act = t.getAttribute("data-act");
    if (act === "start") {
      var mode = t.getAttribute("data-mode");
      startRun(mode, { boss: params.boss, section: params.repair });
    } else if (act === "resume") {
      var saved = runStore().arena;
      if (openRun(saved)) { run = saved; run.cur.paused = false; renderRun(); }
      else renderLobby();
    } else if (act === "bank") {
      var r = runStore().arena;
      if (openRun(r)) { run = r; if (settle(run, "banked")) renderResult(); else leaveSettled(); }
      else renderLobby();
    } else if (act === "check") check();
    else if (act === "pass") pass();
    else if (act === "next") next();
    else if (act === "pause") pause(!run.cur.paused);
    else if (act === "unpause") pause(false);
    else if (act === "leave") { stopClock(); saveRun(false); renderLobby(); }
    else if (act === "again") {
      /* the Daily is once a day, so after it comes a Standard run */
      var m = run && run.mode !== "daily" ? run.mode : "standard";
      var opt = { boss: run && run.boss, section: run && run.section };
      clearRun();
      startRun(m || "standard", opt);
    } else if (act === "lobby") { clearRun(); renderLobby(); }
  });

  host.addEventListener("change", function (e) {
    var t = e.target;
    if (t.name === "arena-tempo") {
      setTempo(t.value);
      renderLobby();
      var radio = host.querySelector('input[name="arena-tempo"][value="' + t.value + '"]');
      if (radio) radio.focus();
    }
    else if (t.hasAttribute && t.hasAttribute("data-pick")) { setPick(t.getAttribute("data-pick"), t.checked); renderLobby(); focusPick(t.getAttribute("data-pick")); }
  });
  function focusPick(id) {
    var box = host.querySelector('[data-pick="' + id.replace(/"/g, "") + '"]');
    if (box) box.focus();
  }

  document.addEventListener("keydown", function (e) {
    if (screen !== "run" || !run || run.done) return;
    if (e.key === "Escape" || e.key === "Esc") { e.preventDefault(); pause(!run.cur.paused); }
  });

  /* the clock never runs while nobody can see the question */
  document.addEventListener("visibilitychange", function () {
    if (!run || screen !== "run") return;
    if (document.hidden) { stopClock(); saveRun(true); }
    else startClock();
  });
  window.addEventListener("pagehide", function () {
    if (!run) return;
    if (screen !== "run" || run.done) return;
    stopClock();
    saveRun(true);
  });
  window.addEventListener("pageshow", function (e) {
    if (e.persisted && run && screen === "run") startClock();
  });

  Store.on(function (c) {
    if (!c) return;
    if (c.type === "reset") {
      stopClock();
      run = null;
      renderLobby();
    } else if ((c.type === "sync" || c.type === "prefs") && screen === "lobby") {
      renderLobby();
    } else if (c.type === "prefs" && screen === "run" && calmRun()) {
      paintTag();
      paintQuestionState(false);
      say("Calm mode is on: no clock and no hearts for the rest of this run, and it counts as an Untimed run.");
    }
  });

  /* another tab settled the run on screen: leave it, rather than play on and pay twice */
  window.addEventListener("storage", function (e) {
    if (e.key === RUN_KEY && screen === "run") settledElsewhere();
  });

  /* ---------------------------------------------------------------- go --- */

  /* A reload goes straight back into the run; arriving any other way (or where
     the browser cannot say) shows the lobby with Resume / Bank it. */
  function wasReload() {
    try {
      var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
      if (nav && nav.type) return nav.type === "reload";
      return !!(performance.navigation && performance.navigation.type === 1);
    } catch (e) { return false; }
  }

  host.innerHTML = '<div class="arena-live visually-hidden" role="status" aria-live="polite"></div><div class="arena-screen"></div>';
  var saved0 = runStore().arena;
  if (validRun(saved0)) {
    if (saved0.done) {
      if (wasReload() && saved0.result) { run = saved0; renderResult(); }
      else { clearRun(); renderLobby(); }
    } else if (!openRun(saved0)) {
      clearRun();
      renderLobby();
    } else if (wasReload()) {
      run = saved0;
      renderRun();
    } else renderLobby();
  } else {
    if (saved0) clearRun();
    renderLobby();
  }

  window.BMArena = {
    state: function () { return run; },
    plan: planRun,
    deck: deck
  };
})();
