/* ===========================================================================
   Basic Mathematics — the game layer
   window.BMGame   play settings, levels, the combo meter, achievements, the
                   recall model behind the Arena, and the header HUD
   window.BMFx     the two effects anything may ask for: a burst and confetti
   Loaded after site.js, so the page is already built: this file decorates it and
   then listens on BMStore. Nothing here grades an answer or changes how XP is
   earned for a correct one; it only adds the combo's share through the seam in
   site.js check(). Levels and medals are derived from the existing stores and
   never saved, so they cannot drift from the record they summarise.

   Stores:
     bm.game.v1   synced: achievements, compared solutions, the Arena's review
                  boxes, bests, rematch medals, Daily days, how often the meter filled
     bm.run.v1    this device only: the combo meter, what has been announced, a
                  cache of which exercises make up each set
     bm.prefs.v1  this device only, never cleared: sound, calm, map, tempo
   =========================================================================== */
(function () {
  "use strict";

  var Store = window.BMStore, Site = window.BMSite;
  if (!Store || !Site) return;
  var C = window.BM_CURRICULUM || { parts: [], chapters: [] };
  var Progress = window.BMProgress, Attempts = window.BMAttempts, Play = window.BMPlay;
  var Activity = window.BMActivity, Insights = window.BMInsights;
  var K = Store.keys;
  var esc = Site.escapeHtml;

  function obj(x) { return x && typeof x === "object" && !Array.isArray(x) ? x : {}; }
  function num(x) { x = Number(x); return isFinite(x) ? x : 0; }
  function slice(list) { return Array.prototype.slice.call(list); }
  function count(o) { return Object.keys(obj(o)).length; }
  function today() { return Site.dayKey(); }
  function still() {
    var reduce = false;
    try { reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { /* old browsers */ }
    return reduce || document.documentElement.hasAttribute("data-calm");
  }

  /* ------------------------------------------------------------- stores -- */

  function readGame() {
    var g = obj(Store.read(K.game, {}));
    return {
      ach: obj(g.ach), cmp: obj(g.cmp), sec: obj(g.sec), best: obj(g.best),
      enc: obj(g.enc), daily: obj(g.daily), maxed: num(g.maxed)
    };
  }
  function writeGame(g) { Store.write(K.game, g); }
  function updateGame(fn) {
    var g = readGame();
    fn(g);
    writeGame(g);
    return g;
  }

  function readRun() {
    var r = obj(Store.read(K.run, {}));
    var c = obj(r.combo);
    return {
      combo: { pips: Math.max(0, Math.min(5, Math.round(num(c.pips)))), shield: !!c.shield },
      arena: r.arena || null, seen: obj(r.seen), sets: obj(r.sets)
    };
  }
  /* the run store is this device's scratchpad: written quietly, announced by its own events */
  function updateRun(fn) {
    var r = readRun();
    fn(r);
    Store.write(K.run, r, true);
    return r;
  }

  /* `map` stays unset until the reader chooses: unset means 3D, except on a low-end
     device (assets/map3d.js decides) */
  function prefs() {
    var p = obj(Store.read(K.prefs, {})), out = {};
    out.sound = p.sound === true;
    out.calm = p.calm === true;
    if (p.map === "3d" || p.map === "list") out.map = p.map;
    out.tempo = p.tempo === "extended" || p.tempo === "untimed" ? p.tempo : "standard";
    return out;
  }
  /* whether the course map will be 3D, for the switch in the sheet */
  function map3dOn(p) {
    if (p.map) return p.map === "3d";
    var low = false;
    try { low = !!(window.BM3D && window.BM3D.lowEnd && window.BM3D.lowEnd()); } catch (e) { /* assume not */ }
    return !low;
  }
  function applyPrefs(p) {
    var root = document.documentElement;
    if (p.calm) root.setAttribute("data-calm", "true");
    else root.removeAttribute("data-calm");
    root.setAttribute("data-sound", p.sound && !p.calm ? "on" : "off");
  }
  function setPref(name, value) {
    var p = prefs();
    if (name === "map3d") { name = "map"; value = value ? "3d" : "list"; }
    if (name === "sound" || name === "calm") p[name] = !!value;
    else if (name === "map") p.map = value === "list" ? "list" : "3d";
    else if (name === "tempo") p.tempo = value === "extended" || value === "untimed" ? value : "standard";
    else return p;
    Store.write(K.prefs, p, true);
    applyPrefs(p);
    Store.emit({ type: "prefs", prefs: p });
    return p;
  }
  function calm() { return prefs().calm; }

  /* ------------------------------------------------------------- levels -- */

  /* threshold(L) = 5(L − 1)(L + 3): 0, 25, 60, 105, 160 … so each level asks a little
     more than the last. Inverting it gives the closed form; the loop mops up rounding. */
  function threshold(L) { L = Math.max(1, Math.floor(L)); return 5 * (L - 1) * (L + 3); }
  function level(xp) {
    xp = Math.max(0, Math.floor(num(xp)));
    var L = Math.max(1, Math.floor(Math.sqrt(xp / 5 + 4)) - 1);
    while (threshold(L + 1) <= xp) L++;
    while (L > 1 && threshold(L) > xp) L--;
    return L;
  }
  var RANKS = [[30, "Mathematician"], [25, "Prover"], [20, "Analyst"], [15, "Cartographer"],
    [10, "Geometer"], [6, "Solver"], [3, "Reckoner"], [1, "Counter"]];
  function rank(L) {
    for (var i = 0; i < RANKS.length; i++) if (L >= RANKS[i][0]) return RANKS[i][1];
    return "Counter";
  }
  function info(xp) {
    if (xp === undefined) xp = Activity ? Activity.total() : 0;
    var L = level(xp), floor = threshold(L), next = threshold(L + 1);
    return {
      xp: xp, level: L, rank: rank(L), floor: floor, next: next,
      into: xp - floor, span: next - floor,
      pct: Math.max(0, Math.min(100, Math.round(((xp - floor) / (next - floor)) * 100)))
    };
  }

  /* ----------------------------------------------------- set arithmetic --- */

  /* The live stores as one object, so every rule below can also be checked on fixtures. */
  function stores() {
    return {
      progress: Progress ? Progress.all() : {}, attempts: Attempts ? Attempts.all() : {},
      play: Play ? Play.all() : {}, activity: Activity ? Activity.all() : { days: {} },
      game: readGame(), run: readRun()
    };
  }

  /* A miss is any exercise that did not go right first time: solved after a wrong check
     or with the solution open, or tried and not solved yet. */
  function isMiss(rec) {
    rec = obj(rec);
    return !!((rec.solved && !rec.first) || (!rec.solved && (num(rec.tries) > 0 || rec.opened)));
  }

  /* How one practice or review set stands: health is what is left unsolved, hearts are
     three less the misses, and the medal is earned only once the set is cleared. */
  function setStats(S, chapterId, keys) {
    S = S || stores();
    keys = keys || [];
    var solvedMap = obj(obj(obj(S.progress)[chapterId]).solved);
    var recs = obj(obj(S.attempts)[chapterId]);
    var out = { total: keys.length, solved: 0, first: 0, misses: 0, how: [], lastSolved: 0, tried: 0 };
    keys.forEach(function (k) {
      var rec = obj(recs[k]), how = "open";
      if (solvedMap[k]) {
        out.solved++;
        how = rec.solved ? (rec.first ? "first" : rec.opened ? "opened" : "solved") : "unknown";
        if (rec.solved && rec.first) out.first++;
        if (num(rec.solved) > out.lastSolved) out.lastSolved = num(rec.solved);
      }
      if (isMiss(rec)) out.misses++;
      if (rec.tries || rec.opened || solvedMap[k]) out.tried++;
      out.how.push(how);
    });
    out.hp = out.total - out.solved;
    out.hearts = Math.max(0, 3 - out.misses);
    out.won = out.total > 0 && out.solved >= out.total;
    out.medal = out.won ? (out.hearts >= 3 ? 3 : out.hearts >= 1 ? 2 : 1) : 0;
    return out;
  }

  function setKeys(S, chapterId, set) {
    var rec = obj(obj(obj(S.run).sets)[chapterId]);
    return Array.isArray(rec[set]) ? rec[set] : null;
  }

  /* the medal as shown: derived from the set, raised by a rematch in the Arena */
  function medalIn(S, chapterId, set) {
    set = set || "practice";
    var keys = setKeys(S, chapterId, set);
    var enc = obj(obj(S.game.enc)[chapterId + "/" + set]);
    if (!keys || !keys.length) return Math.max(0, Math.min(3, num(enc.medal)));
    var st = setStats(S, chapterId, keys);
    return st.won ? Math.max(st.medal, Math.min(3, num(enc.medal))) : 0;
  }
  function medal(chapterId, set) { return medalIn(stores(), chapterId, set); }
  var MEDALS = ["", "Bronze", "Silver", "Gold"];

  function streakOf(days) {
    days = obj(days);
    var d = new Date(), n = 0;
    if (!(days[Site.dayKey(d)] > 0)) d.setDate(d.getDate() - 1);
    while (days[Site.dayKey(d)] > 0) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function chapterFinished(S, ch) {
    var rec = obj(obj(S.progress)[ch.id]);
    var total = num(rec.total);
    return total > 0 && count(rec.solved) >= total;
  }
  function eachRec(S, fn) {
    var all = obj(S.attempts);
    Object.keys(all).forEach(function (ch) {
      var recs = obj(all[ch]);
      Object.keys(recs).forEach(function (k) { fn(obj(recs[k]), ch, k); });
    });
  }
  function countRecs(S, pred) {
    var n = 0;
    eachRec(S, function (r) { if (pred(r)) n++; });
    return n;
  }
  /* the best ratio over every known set of one kind, as [n, size] */
  function bestSet(S, kinds, score) {
    var best = [0, 0];
    Object.keys(obj(obj(S.run).sets)).sort().forEach(function (ch) {
      kinds.forEach(function (kind) {
        var keys = setKeys(S, ch, kind);
        if (!keys || !keys.length) return;
        var n = score(ch, keys);
        if (n / keys.length > (best[1] ? best[0] / best[1] : -1)) best = [n, keys.length];
      });
    });
    return best;
  }
  function setsWon(S, kind, pred) {
    var n = 0, seen = {};
    Object.keys(obj(obj(S.run).sets)).forEach(function (ch) {
      var keys = setKeys(S, ch, kind);
      if (!keys || !keys.length) return;
      var st = setStats(S, ch, keys);
      if (st.won && (!pred || pred(ch, st))) { n++; seen[ch] = true; }
    });
    /* a set cleared on another device still counts once its rematch medal has synced */
    Object.keys(obj(S.game.enc)).forEach(function (id) {
      var cut = id.split("/");
      if (cut[1] !== kind || seen[cut[0]] || setKeys(S, cut[0], kind)) return;
      if (!pred || pred(cut[0], { medal: num(S.game.enc[id].medal), won: true, lastSolved: 0 })) n++;
    });
    return n;
  }

  /* ------------------------------------------------------- achievements --- */

  /* Each test reads the stores and returns [n, target]; it is unlocked once n ≥ target.
     They reward habits that build the skill (accuracy, comparing solutions, coming
     back) rather than speed or volume for its own sake. */
  function A(id, title, text, test) { return { id: id, title: title, text: text, test: test }; }
  var ACHIEVEMENTS = [
    A("first-light", "First light", "Solve your first exercise.", function (S) {
      var n = countRecs(S, function (r) { return !!r.solved; });
      Object.keys(obj(S.progress)).forEach(function (ch) { n = Math.max(n, count(obj(S.progress[ch]).solved)); });
      return [Math.min(n, 1), 1];
    }),
    A("steady-hand", "Steady hand", "Get 25 answers right first time.", function (S) {
      return [countRecs(S, function (r) { return r.solved && r.first; }), 25];
    }),
    A("sure-hand", "Sure hand", "Get 100 answers right first time.", function (S) {
      return [countRecs(S, function (r) { return r.solved && r.first; }), 100];
    }),
    A("full-meter", "Full meter", "Fill the combo meter: five first-try answers in a row.", function (S) {
      return [Math.min(1, num(S.game.maxed)), 1];
    }),
    A("second-wind", "Second wind", "Solve 10 exercises on the second try with a hint and without the solution.", function (S) {
      return [countRecs(S, function (r) { return r.solved && num(r.tries) === 2 && num(r.hints) >= 1 && !r.opened; }), 10];
    }),
    A("comeback", "Comeback", "Repair a weak section in an untimed Arena run.", function (S) {
      return [countFix(S), 1];
    }),
    A("rebuilder", "Rebuilder", "Repair five weak sections.", function (S) {
      return [countFix(S), 5];
    }),
    A("second-opinion", "Second opinion", "Compare your answer with the worked solution 10 times.", function (S) {
      var n = 0;
      Object.keys(obj(S.game.cmp)).forEach(function (ch) { n += count(S.game.cmp[ch]); });
      return [n, 10];
    }),
    A("studied", "Studied", "Compare every solution in one practice or review set.", function (S) {
      var b = bestSet(S, ["practice", "review"], function (ch, keys) {
        var cmp = obj(S.game.cmp[ch]);
        return keys.filter(function (k) { return cmp[k]; }).length;
      });
      return b[1] ? b : [0, 1];
    }),
    A("committed", "Committed", "Commit to a guess on the opening puzzle in five chapters.", function (S) {
      var n = 0;
      Object.keys(obj(S.play)).forEach(function (ch) {
        var g = obj(S.play[ch]).guess;
        if (g !== undefined && g !== null) n++;
      });
      return [n, 5];
    }),
    A("hands-on", "Hands on", "Complete 10 missions on the interactive figures.", function (S) {
      var n = 0;
      Object.keys(obj(S.play)).forEach(function (ch) { n += count(obj(S.play[ch]).done); });
      return [n, 10];
    }),
    A("no-stone", "No stone unturned", "Answer every Your turn check in one chapter.", function (S) {
      var b = bestSet(S, ["inline"], function (ch, keys) {
        var recs = obj(obj(S.attempts)[ch]);
        return keys.filter(function (k) { return obj(recs[k]).solved; }).length;
      });
      return b[1] ? b : [0, 1];
    }),
    A("boss-down", "Boss down", "Clear a chapter's practice set.", function (S) {
      return [Math.min(1, setsWon(S, "practice")), 1];
    }),
    A("flawless", "Flawless", "Win a Gold medal: clear a practice set with all three hearts.", function (S) {
      var n = setsWon(S, "practice", function (ch) { return medalIn(S, ch, "practice") >= 3; });
      return [Math.min(1, n), 1];
    }),
    A("mixed-bag", "Mixed bag", "Clear a mixed-review set.", function (S) {
      return [Math.min(1, setsWon(S, "review")), 1];
    }),
    A("echo-hunter", "Echo hunter", "Clear all four mixed-review sets.", function (S) {
      return [setsWon(S, "review"), 4];
    }),
    A("returning-champion", "Returning champion", "Come back on a later day and win Silver or better in an Arena rematch.", function (S) {
      var n = 0;
      Object.keys(obj(S.game.enc)).forEach(function (id) {
        var e = obj(S.game.enc[id]), cut = id.split("/");
        if (num(e.medal) < 2 || !e.day) return;
        var keys = setKeys(S, cut[0], cut[1] || "practice");
        var st = keys ? setStats(S, cut[0], keys) : null;
        var cleared = st && st.lastSolved ? Site.dayKey(new Date(st.lastSolved)) : "";
        if (!cleared || String(e.day) > cleared) n++;
      });
      return [Math.min(1, n), 1];
    }),
    A("keeper", "Keeper", "Hold 10 sections in the Arena's fourth box or higher.", function (S) {
      var n = 0;
      Object.keys(obj(S.game.sec)).forEach(function (id) { if (num(obj(S.game.sec[id]).box) >= 3) n++; });
      return [n, 10];
    }),
    A("regular", "Regular", "Play the Daily on seven days.", function (S) {
      return [count(S.game.daily), 7];
    }),
    A("took-your-time", "Took your time", "In one timed Arena run, get 10 right first time with at least three answered after par.", function (S) {
      return [S.game.ach["took-your-time"] ? 1 : 0, 1];
    }),
    A("streak-3", "Three in a row", "Study on three days in a row.", function (S) {
      return [streakOf(obj(S.activity).days), 3];
    }),
    A("streak-7", "A full week", "Study on seven days in a row.", function (S) {
      return [streakOf(obj(S.activity).days), 7];
    }),
    A("streak-30", "A month of days", "Study on thirty days in a row.", function (S) {
      return [streakOf(obj(S.activity).days), 30];
    }),
    A("region-cleared", "Region cleared", "Finish every exercise in every chapter of one Part.", function (S) {
      var best = [0, 1];
      C.parts.forEach(function (part) {
        var n = part.chapters.filter(function (ch) { return chapterFinished(S, ch); }).length;
        if (n / part.chapters.length > best[0] / best[1]) best = [n, part.chapters.length];
      });
      return best;
    }),
    A("ground-up", "From the ground up", "Finish every exercise in the course.", function (S) {
      return [C.chapters.filter(function (ch) { return chapterFinished(S, ch); }).length, C.chapters.length || 17];
    })
  ];
  function countFix(S) {
    var n = 0;
    Object.keys(obj(S.game.sec)).forEach(function (id) { if (num(obj(S.game.sec[id]).fix) > 0) n++; });
    return n;
  }
  ACHIEVEMENTS.forEach(function (a) {
    a.progress = function (S) {
      var p = a.test(S || stores());
      return [Math.min(p[0], p[1]), p[1]];
    };
  });
  var BY_ID = {};
  ACHIEVEMENTS.forEach(function (a) { BY_ID[a.id] = a; });

  /* ------------------------------------------------------------ combo ---- */

  function combo() {
    var c = readRun().combo;
    return { pips: c.pips, shield: c.shield, mult: multOf(c.pips) };
  }
  function multOf(pips) { return Math.round((1 + 0.2 * pips) * 10) / 10; }
  function emitCombo(c, why) {
    Store.emit({ type: "combo", pips: c.pips, shield: c.shield, mult: multOf(c.pips), why: why });
  }

  /* Called by site.js for a correct answer on the road to the first one. A first-try
     answer earns base × 0.2 per pip already lit, then lights one more. */
  function bonus(ctx) {
    ctx = obj(ctx);
    var rec = obj(ctx.rec);
    if (ctx.ex) pendingEx = ctx.ex;
    if (!rec.first || calm()) return null;
    var before = 0, after = 0;
    updateRun(function (r) {
      before = r.combo.pips;
      after = Math.min(5, before + 1);
      r.combo.pips = after;
    });
    if (after === 5 && before < 5) updateGame(function (g) { g.maxed = num(g.maxed) + 1; });
    var c = readRun().combo;
    emitCombo(c, after === 5 && before < 5 ? "max" : "up");
    var b = Math.round(num(ctx.base) * 0.2 * before);
    return { bonus: b, mult: multOf(before) };
  }

  /* a first miss on a scored exercise costs two pips, unless a shield takes it */
  function onMiss() {
    if (calm()) return;
    var why = "";
    var c = updateRun(function (r) {
      if (r.combo.shield) { r.combo.shield = false; why = "shield"; }
      else if (r.combo.pips > 0) { r.combo.pips = Math.max(0, r.combo.pips - 2); why = "down"; }
    }).combo;
    if (why) emitCombo(c, why);
  }
  function emptyMeter() {
    if (calm()) return;
    var had = false;
    var c = updateRun(function (r) { had = r.combo.pips > 0; r.combo.pips = 0; }).combo;
    if (had) emitCombo(c, "empty");
  }
  function grantShield() {
    if (calm()) return;
    var had = true;
    var c = updateRun(function (r) { had = r.combo.shield; r.combo.shield = true; }).combo;
    if (!had) emitCombo(c, "shield-up");
  }

  /* ------------------------------------------------------ recall model --- */

  var BOXES = [1, 3, 7, 14, 30];
  function dayNum(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
    if (!m) return null;
    return Math.round(new Date(+m[1], +m[2] - 1, +m[3]).getTime() / 86400000);
  }
  function daysSince(key) {
    var d = dayNum(key);
    return d === null ? Infinity : dayNum(today()) - d;
  }
  function sectionRows() {
    var map = {};
    if (Insights) Insights.sections().forEach(function (r) { map[r.id] = r; });
    return map;
  }
  /* new: nothing solved there yet; shaky: the record says reread it; solid: otherwise */
  function statusOf(row, sec) {
    if (!row || !row.solved) return obj(sec).ok > 0 ? "solid" : "new";
    return row.score >= (Insights ? Insights.WEAK : 0.34) ? "shaky" : "solid";
  }
  function sectionStatus(id) {
    return statusOf(sectionRows()[id], readGame().sec[id]);
  }
  function isDue(sec) {
    sec = obj(sec);
    if (!sec.last) return true;
    var box = Math.max(0, Math.min(4, Math.floor(num(sec.box))));
    return daysSince(sec.last) >= BOXES[box];
  }
  /* the sections the Arena may draw from: solved at least once on a chapter page */
  function deck(opts) {
    opts = obj(opts);
    var rows = sectionRows(), g = readGame(), out = [];
    Object.keys(rows).sort().forEach(function (id) {
      var row = rows[id], sec = obj(g.sec[id]);
      var status = statusOf(row, sec);
      if (status === "new") return;
      if (opts.section && opts.section !== id) return;
      if (opts.chapter && row.chapter.id !== opts.chapter) return;
      if (opts.status && opts.status !== status) return;
      out.push({
        id: id, status: status, due: isDue(sec), box: num(sec.box), last: sec.last || null,
        label: row.label, title: row.section.title, chapter: row.chapter.id, path: row.path
      });
    });
    return out.sort(function (a, b) {
      return (b.due - a.due) || (a.box - b.box) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
  }

  /* One finished Arena run. Updates the review boxes, bests, rematch medal and Daily,
     then pays the run's XP once: 2 per first-try answer (3 if that section was due),
     1 per answer right on the retry, 5 for finishing with a heart, 10 for the day's Daily. */
  function recordRun(result) {
    result = obj(result);
    var answers = Array.isArray(result.answers) ? result.answers : [];
    var day = /^\d{4}-\d{2}-\d{2}$/.test(result.day || "") ? result.day : today();
    var mode = String(result.mode || "standard");
    var hearts = Math.max(0, Math.floor(num(result.hearts)));
    var score = Math.max(0, Math.round(num(result.score)));
    var xp = 0, dailyBonus = false, newMedal = 0, before = readGame();
    var bySec = {};

    answers.forEach(function (a) {
      a = obj(a);
      var sid = a.section ? String(a.section) : "";
      var wasDue = sid ? isDue(before.sec[sid]) : false;
      if (a.first) xp += wasDue ? 3 : 2;
      else if (a.retry) xp += 1;
      if (!sid) return;
      var s = bySec[sid] || (bySec[sid] = { n: 0, ok: 0, miss: 0 });
      s.n++;
      if (a.first) s.ok++;
      else s.miss++;
    });
    if (answers.length && hearts > 0) xp += 5;

    var g = updateGame(function (g) {
      Object.keys(bySec).forEach(function (sid) {
        var s = bySec[sid], sec = obj(g.sec[sid]);
        var box = Math.max(0, Math.min(4, Math.floor(num(sec.box))));
        /* a miss sends the section back to the first box; a clean showing moves it up
           one, but only once a day, so cramming does not fake spacing */
        if (s.miss) box = 0;
        else if (sec.last !== day) box = Math.min(4, box + 1);
        var rec = { n: num(sec.n) + s.n, ok: num(sec.ok) + s.ok, box: box, last: day };
        if (num(sec.fix)) rec.fix = num(sec.fix);
        g.sec[sid] = rec;
      });
      /* Repair: an untimed run on one weak section; it counts as repaired when every
         answer came right and at least four in five were right first time */
      if (mode === "repair" && result.section && answers.length) {
        var all = answers.every(function (a) { return a && (a.first || a.retry); });
        var firsts = answers.filter(function (a) { return a && a.first; }).length;
        if (all && firsts / answers.length >= 0.8) {
          var sid = String(result.section), sec = obj(g.sec[sid]);
          sec.fix = Date.now();
          sec.n = num(sec.n); sec.ok = Math.min(num(sec.ok), sec.n); sec.box = num(sec.box);
          sec.last = sec.last || day;
          g.sec[sid] = sec;
        }
      }
      var prev = obj(g.best[mode]);
      if (!g.best[mode] || score > num(prev.score) ||
          (score === num(prev.score) && hearts > num(prev.hearts)) ||
          (score === num(prev.score) && hearts === num(prev.hearts) && day < String(prev.day || "9999"))) {
        g.best[mode] = { score: score, hearts: hearts, day: day };
      }
      if (result.boss && answers.length) {
        newMedal = hearts >= 3 ? 3 : hearts >= 1 ? 2 : 1;
        var id = String(result.boss) + "/practice", old = obj(g.enc[id]);
        if (!g.enc[id] || newMedal > num(old.medal) || (newMedal === num(old.medal) && day < String(old.day || "9999"))) {
          g.enc[id] = { medal: newMedal, day: day };
        }
      }
      if (mode === "daily" && answers.length) {
        if (!g.daily[day]) dailyBonus = true;
        g.daily[day] = 1;
        var days = Object.keys(g.daily).sort().reverse();
        days.slice(60).forEach(function (d) { delete g.daily[d]; });
      }
    });
    if (dailyBonus) xp += 10;
    var timed = result.timed !== false && mode !== "repair";
    var firsts = answers.filter(function (a) { return a && a.first; });
    var late = firsts.filter(function (a) { return a.late; }).length;
    if (timed && firsts.length >= 10 && late >= 3) unlock("took-your-time");
    if (xp && Activity) Activity.add(xp, "arena");
    Store.emit({ type: "arena", phase: "recorded", mode: mode, xp: xp, medal: newMedal });
    schedule();
    return { xp: xp, medal: newMedal, game: g };
  }

  /* A section repaired in the Arena stops dragging its old misses behind it: once the
     repair is newer than every non-first solve there, its score is capped at 0.2. */
  if (Insights) {
    Insights.adjust = function (list) {
      var sec = readGame().sec, newest = {};
      if (!Object.keys(sec).length) return;
      var all = Attempts ? Attempts.all() : {};
      Object.keys(all).forEach(function (ch) {
        var recs = obj(all[ch]);
        Object.keys(recs).forEach(function (k) {
          var r = obj(recs[k]), s = r.section;
          if (!s || !r.solved || r.first) return;
          var id = s.indexOf("#") > -1 ? s : ch + "#" + s;
          newest[id] = Math.max(newest[id] || 0, num(r.solved));
        });
      });
      list.forEach(function (row) {
        var fix = num(obj(sec[row.id]).fix);
        if (fix && fix > (newest[row.id] || 0)) {
          row.score = Math.min(row.score, 0.2);
          row.repaired = true;
        }
      });
    };
  }

  /* ------------------------------------------------------- announcements -- */

  /* One polite region for everything but the verdict itself. Messages wait at least
     1.5 s after the last verdict, go at most once every 4 s, and are merged into one
     announcement; achievements ride along whatever else is dropped. */
  var live = null, liveQ = [], liveTimer = null, lastVerdict = 0, lastSent = 0, xpOwed = 0;
  function liveEl() {
    if (!document.body) return null;
    if (live && document.body.contains(live)) return live;
    live = document.getElementById("bm-live");
    if (!live) {
      live = document.createElement("div");
      live.id = "bm-live";
      live.className = "visually-hidden";
      live.setAttribute("role", "status");
      live.setAttribute("aria-live", "polite");
      live.setAttribute("aria-atomic", "true");
      document.body.appendChild(live);
    }
    return live;
  }
  function announce(text, opts) {
    opts = obj(opts);
    if (!text) return;
    var pr = opts.priority === "high" ? "high" : opts.priority === "low" ? "low" : "normal";
    if (opts.key) liveQ = liveQ.filter(function (q) { return q.key !== opts.key || q.priority === "high"; });
    liveQ.push({ text: String(text), priority: pr, key: opts.key || null });
    scheduleLive();
  }
  function scheduleLive() {
    if (liveTimer || !liveQ.length) return;
    var at = Math.max(Date.now(), lastVerdict + 1500, lastSent + 4000);
    liveTimer = setTimeout(flushLive, at - Date.now());
  }
  function flushLive() {
    liveTimer = null;
    var at = Math.max(lastVerdict + 1500, lastSent + 4000);
    if (Date.now() < at - 15) { scheduleLive(); return; }
    var high = liveQ.filter(function (q) { return q.priority === "high"; });
    var rest = liveQ.filter(function (q) { return q.priority !== "high"; }).slice(-3);
    liveQ = [];
    xpOwed = 0;
    var text = high.concat(rest).map(function (q) { return q.text; }).join(" ");
    if (!text) return;
    var el = liveEl();
    if (!el) return;
    el.textContent = "";
    lastSent = Date.now();
    setTimeout(function () { el.textContent = text; }, 40);
  }

  /* achievement toasts: at most two waiting, one at a time, never in the way */
  var toastQ = [], toastBusy = false;
  function achToast(title, text) {
    if (toastQ.length >= 2) {
      var last = toastQ[toastQ.length - 1];
      last.more = (last.more || 0) + 1;
    } else toastQ.push({ title: title, text: text });
    pumpToasts();
  }
  function pumpToasts() {
    if (toastBusy || !toastQ.length || !window.BMToast) return;
    var t = toastQ.shift();
    toastBusy = true;
    window.BMToast('<span class="toast-kicker">Achievement</span> <b>' + esc(t.title) + "</b>" +
      (t.text ? ' <span class="toast-text">' + esc(t.text) + "</span>" : "") +
      (t.more ? ' <span class="toast-more">and ' + t.more + " more</span>" : ""), "ach");
    setTimeout(function () { toastBusy = false; pumpToasts(); }, 1600);
  }

  /* ------------------------------------------------------- unlocking ------ */

  function notifyUnlock(a) {
    achToast(a.title, a.text);
    announce("Achievement unlocked: " + a.title + ".", { priority: "high" });
    Store.emit({ type: "achievement", id: a.id, title: a.title });
  }
  function unlock(id) {
    var a = BY_ID[id];
    if (!a || readGame().ach[id]) return false;
    updateGame(function (g) { g.ach[id] = Date.now(); });
    notifyUnlock(a);
    return true;
  }
  function unlockedSince(ms) {
    var ach = readGame().ach;
    return ACHIEVEMENTS.filter(function (a) { return num(ach[a.id]) >= ms; });
  }

  /* `quiet`: unlock without a toast each, then one summary (first load, a sync) */
  function evaluate(quiet) {
    var S = stores(), fresh = [];
    ACHIEVEMENTS.forEach(function (a) {
      if (S.game.ach[a.id]) return;
      var p;
      try { p = a.test(S); } catch (e) { return; }
      if (p[0] >= p[1]) fresh.push(a);
    });
    if (!fresh.length) return fresh;
    var now = Date.now();
    updateGame(function (g) { fresh.forEach(function (a) { if (!g.ach[a.id]) g.ach[a.id] = now; }); });
    if (quiet) {
      var line = fresh.length === 1
        ? "Achievement unlocked from earlier work: " + fresh[0].title + "."
        : fresh.length + " achievements unlocked from earlier work.";
      if (window.BMToast) window.BMToast(esc(line), "ach");
      announce(line, { priority: "high" });
    } else fresh.forEach(notifyUnlock);
    return fresh;
  }
  var evalTimer = null;
  function schedule() {
    if (evalTimer) return;
    evalTimer = setTimeout(function () { evalTimer = null; evaluate(false); }, 0);
  }

  /* -------------------------------------------------------------- level --- */

  function checkLevel(quiet) {
    var inf = info(), seen = readRun().seen;
    if (typeof seen.level !== "number" || quiet || inf.level < seen.level) {
      if (seen.level !== inf.level) updateRun(function (r) { r.seen.level = inf.level; });
      return;
    }
    if (inf.level > seen.level) {
      updateRun(function (r) { r.seen.level = inf.level; });
      if (window.BMToast) {
        window.BMToast('<span class="toast-kicker">Level ' + inf.level + "</span> <b>" + esc(inf.rank) + "</b>", "level");
      }
      announce("Level " + inf.level + " reached: " + inf.rank + ".", { priority: "high" });
      Store.emit({ type: "level", level: inf.level, rank: inf.rank });
    }
  }

  /* --------------------------------------------------------------- BMFx --- */

  function token(name, el) {
    try { return getComputedStyle(el || document.documentElement).getPropertyValue(name).trim(); } catch (e) { return ""; }
  }
  function palette(el) {
    return ["--part", "--xp", "--ok", "--accent"].map(function (n) { return token(n, el); })
      .filter(function (c) { return !!c; });
  }

  var Fx = {
    still: still,
    /* up to twelve particles thrown out from the middle of `el` */
    burst: function (el) {
      if (still() || !el || !el.appendChild) return;
      var colors = palette(el), box = document.createElement("span");
      box.className = "fx-burst";
      box.setAttribute("aria-hidden", "true");
      for (var i = 0; i < 12; i++) {
        var p = document.createElement("i");
        if (colors.length) p.style.background = colors[i % colors.length];
        box.appendChild(p);
        if (p.animate) {
          var ang = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.4, dist = 26 + Math.random() * 22;
          p.animate([
            { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
            { transform: "translate(" + (Math.cos(ang) * dist - 3).toFixed(1) + "px, " + (Math.sin(ang) * dist - 3).toFixed(1) + "px) scale(.4)", opacity: 0 }
          ], { duration: 700 + Math.random() * 150, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" });
        }
      }
      el.appendChild(box);
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 900);
    },
    /* one short fall of paper, on a canvas made for the occasion and thrown away */
    confetti: function () {
      if (still() || !document.body) return;
      var canvas = document.createElement("canvas");
      var ctx = canvas.getContext && canvas.getContext("2d");
      if (!ctx) return;
      canvas.className = "fx-canvas";
      canvas.setAttribute("aria-hidden", "true");
      /* inline so the canvas can never sit over the page and swallow a click */
      canvas.style.cssText = "position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:60";
      var w = window.innerWidth, h = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.scale(dpr, dpr);
      document.body.appendChild(canvas);
      var colors = palette(document.body);
      if (!colors.length) colors = [token("--text") || "gray"];
      var parts = [];
      for (var i = 0; i < 80; i++) {
        parts.push({
          x: w * (0.2 + Math.random() * 0.6), y: h * 0.25 + (Math.random() - 0.5) * 40,
          vx: (Math.random() - 0.5) * 9, vy: -4 - Math.random() * 7,
          r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
          s: 5 + Math.random() * 5, c: colors[i % colors.length]
        });
      }
      var start = null;
      function frame(t) {
        if (start === null) start = t;
        var age = t - start;
        ctx.clearRect(0, 0, w, h);
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 500) / 400);
        parts.forEach(function (p) {
          p.vy += 0.38; p.x += p.vx; p.y += p.vy; p.r += p.vr;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.r);
          ctx.fillStyle = p.c;
          ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
          ctx.restore();
        });
        if (age < 900) window.requestAnimationFrame(frame);
        else if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
      window.requestAnimationFrame(frame);
      setTimeout(function () { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); }, 1400);
    }
  };
  window.BMFx = Fx;

  /* ---------------------------------------------------------------- HUD --- */

  var ICONS = {
    flame: '<path d="M8.2 1c.3 2.4 3.6 4 3.6 7.6A3.8 3.8 0 0 1 8 12.5a3.8 3.8 0 0 1-3.8-3.9c0-1.4.6-2.5 1.5-3.3.1 1 .6 1.7 1.3 1.9C6.7 5.1 7.1 2.9 8.2 1z" fill="currentColor"/>',
    heart: '<path d="M8 14S1.8 10.2 1.8 6A3.2 3.2 0 0 1 8 4.3 3.2 3.2 0 0 1 14.2 6C14.2 10.2 8 14 8 14z" fill="currentColor"/>',
    "sound-on": '<path d="M2 6h2.6L8.4 3v10L4.6 10H2z" fill="currentColor"/>' +
      '<path d="M10.6 5.6a3.4 3.4 0 0 1 0 4.8M12.4 3.8a6 6 0 0 1 0 8.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    "sound-off": '<path d="M2 6h2.6L8.4 3v10L4.6 10H2z" fill="currentColor"/>' +
      '<path d="M10.5 6l4 4M14.5 6l-4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    menu: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    star: '<path d="M8 1.4l2 4.2 4.5.6-3.3 3.1.8 4.5L8 11.6l-4 2.2.8-4.5L1.5 6.2 6 5.6z" fill="currentColor"/>',
    shield: '<path d="M8 1.5l5.2 2v3.9c0 3.3-2.3 5.8-5.2 7.1-2.9-1.3-5.2-3.8-5.2-7.1V3.5z" fill="currentColor"/>'
  };
  function injectSprite() {
    if (document.getElementById("bm-sprite")) return;
    var html = '<svg xmlns="http://www.w3.org/2000/svg" id="bm-sprite" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute">';
    Object.keys(ICONS).forEach(function (k) {
      html += '<symbol id="bm-i-' + k + '" viewBox="0 0 16 16">' + ICONS[k] + "</symbol>";
    });
    html += "</svg>";
    var holder = document.createElement("div");
    holder.innerHTML = html;
    document.body.insertBefore(holder.firstChild, document.body.firstChild);
  }
  function icon(name) {
    return '<svg class="icon icon-' + name + '" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><use href="#bm-i-' + name + '"></use></svg>';
  }

  var hudEls = null, heartsState = null, timerState = null, sheetWired = false;

  function setSheet(open, refocus) {
    if (!hudEls) return;
    hudEls.sheet.hidden = !open;
    hudEls.menu.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open && refocus) hudEls.menu.focus();
  }

  function buildHudShell(nav) {
    injectSprite();
    var root = Site.rootPrefix();
    slice(nav.querySelectorAll(".hud, .hud-sound, .hud-menu")).forEach(function (old) { old.parentNode.removeChild(old); });
    var theme = nav.querySelector("[data-theme-toggle]");

    var hud = document.createElement("div");
    hud.className = "hud";
    hud.setAttribute("role", "group");
    hud.setAttribute("aria-label", "Your progress");
    hud.innerHTML =
      '<a class="hud-level" href="' + root + 'progress.html">' +
        '<span class="hud-badge" aria-hidden="true"><b>1</b></span>' +
        '<span class="hud-xp" aria-hidden="true"><span class="hud-xpbar"><i style="width:0%"></i></span>' +
        '<span class="hud-xptext"><b>0</b> / 25 XP</span></span></a>' +
      '<span class="hud-streak" role="img"><span class="goal-ring" style="--pct:0"></span>' + icon("flame") + "<b>0</b></span>" +
      '<span class="hud-combo" role="img" hidden><i></i><i></i><i></i><i></i><i></i></span>' +
      '<span class="hud-hearts" role="img" hidden></span>' +
      '<span class="hud-timer" role="timer" data-urgency="ok" hidden><span class="hud-timer-text"></span></span>';
    nav.insertBefore(hud, theme || null);

    var sound = document.createElement("button");
    sound.type = "button";
    sound.className = "icon-btn hud-sound";
    sound.setAttribute("data-sound-toggle", "");
    sound.setAttribute("aria-label", "Sound");
    sound.setAttribute("aria-pressed", "false");
    nav.insertBefore(sound, theme || null);
    sound.addEventListener("click", function () {
      var p = prefs();
      if (p.calm) { announce("Sound stays off in calm mode.", { priority: "normal" }); return; }
      setPref("sound", !p.sound);
    });

    var menu = document.createElement("button");
    menu.type = "button";
    menu.className = "icon-btn hud-menu";
    menu.setAttribute("aria-expanded", "false");
    menu.setAttribute("aria-controls", "hud-sheet");
    menu.setAttribute("aria-label", "Menu and settings");
    menu.innerHTML = icon("menu");
    nav.insertBefore(menu, theme ? theme.nextSibling : null);

    var bar = nav.parentNode;
    var strip = bar.querySelector(".hud-strip");
    if (!strip) {
      strip = document.createElement("div");
      strip.className = "hud-strip";
      strip.setAttribute("aria-hidden", "true");
      strip.hidden = true;
      strip.innerHTML = '<span class="hud-hearts" hidden></span>' +
        '<span class="hud-timer" data-urgency="ok" hidden><span class="hud-timer-text"></span></span>';
      bar.insertBefore(strip, nav.nextSibling);
    }
    var sheet = document.getElementById("hud-sheet");
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.className = "hud-sheet";
      sheet.id = "hud-sheet";
      sheet.hidden = true;
      sheet.innerHTML =
        '<ul class="hud-links">' +
          '<li><a href="' + root + 'index.html">Contents</a></li>' +
          '<li><a href="' + root + 'about.html">How to use this</a></li>' +
          '<li><a href="' + root + 'progress.html">Your progress</a></li>' +
          '<li><a href="' + root + 'arena.html">Arena</a></li></ul>' +
        '<label class="switch"><input type="checkbox" role="switch" data-pref="calm"><span>Calm mode</span>' +
          "<small>No hearts, combo, shake or sound</small></label>" +
        '<label class="switch"><input type="checkbox" role="switch" data-pref="sound"><span>Sound</span></label>' +
        '<label class="switch"><input type="checkbox" role="switch" data-pref="map3d"><span>3D course map</span></label>';
      bar.insertBefore(sheet, strip.nextSibling);
      slice(sheet.querySelectorAll("[data-pref]")).forEach(function (input) {
        input.addEventListener("change", function () { setPref(input.getAttribute("data-pref"), input.checked); });
      });
    }

    menu.addEventListener("click", function () { setSheet(sheet.hidden, false); });
    if (!sheetWired) {
      sheetWired = true;
      document.addEventListener("keydown", function (e) {
        var sh = document.getElementById("hud-sheet");
        if (e.key === "Escape" && sh && !sh.hidden) setSheet(false, sh.contains(document.activeElement));
      });
      document.addEventListener("click", function (e) {
        var sh = document.getElementById("hud-sheet"), m = hudEls && hudEls.menu;
        if (!sh || sh.hidden || sh.contains(e.target) || (m && m.contains(e.target))) return;
        setSheet(false, false);
      });
    }

    hudEls = {
      hud: hud, level: hud.querySelector(".hud-level"), badge: hud.querySelector(".hud-badge b"),
      xpbar: hud.querySelector(".hud-xpbar i"), xptext: hud.querySelector(".hud-xptext"),
      streak: hud.querySelector(".hud-streak"), ring: hud.querySelector(".goal-ring"),
      streakNum: hud.querySelector(".hud-streak > b"), combo: hud.querySelector(".hud-combo"),
      hearts: [hud.querySelector(".hud-hearts"), strip.querySelector(".hud-hearts")],
      timers: [hud.querySelector(".hud-timer"), strip.querySelector(".hud-timer")],
      sound: sound, menu: menu, sheet: sheet, strip: strip, soundIcon: null
    };
  }

  function setText(el, html) { if (el && el.innerHTML !== html) el.innerHTML = html; }
  function setAttr(el, name, value) {
    if (!el) return;
    if (value === null || value === false) { if (el.hasAttribute(name)) el.removeAttribute(name); }
    else if (el.getAttribute(name) !== String(value)) el.setAttribute(name, String(value));
  }

  function heartsHtml(lives, max) {
    var html = "";
    for (var i = 0; i < max; i++) html += i < lives ? "<i data-full></i>" : "<i></i>";
    return html;
  }

  function updateHud() {
    if (!hudEls) return;
    var e = hudEls, p = prefs(), onChapter = !!document.body.getAttribute("data-chapter");
    var arena = document.body.getAttribute("data-mode") === "arena";
    var inf = info();
    setText(e.badge, String(inf.level));
    e.xpbar.style.width = inf.pct + "%";
    setText(e.xptext, "<b>" + inf.into + "</b> / " + inf.span + " XP");
    setAttr(e.level, "aria-label", "Level " + inf.level + ", " + inf.rank + ". " + inf.into + " of " + inf.span +
      " XP to level " + (inf.level + 1) + ". Open your progress.");

    var streak = Activity.streak(), td = Activity.today(), goal = Activity.goal();
    var pct = Math.min(100, Math.round((td / goal) * 100));
    setAttr(e.streak, "aria-label", streak + "-day streak. " + td + " of " + goal + " XP today.");
    setAttr(e.streak, "data-on", streak > 0 ? "true" : null);
    e.ring.style.setProperty("--pct", String(pct));
    setAttr(e.ring, "data-full", pct >= 100 ? "true" : null);
    setText(e.streakNum, String(streak));

    var c = combo();
    var showCombo = !p.calm && (c.pips > 0 || (onChapter && c.shield));
    e.combo.hidden = !showCombo;
    setAttr(e.combo, "data-pips", String(c.pips));
    setAttr(e.combo, "data-shield", c.shield ? "true" : null);
    setAttr(e.combo, "aria-label", "Combo " + c.pips + " of 5, XP times " + c.mult + (c.shield ? ", shield ready" : ""));
    slice(e.combo.children).forEach(function (pip, i) { setAttr(pip, "data-on", i < c.pips ? "" : null); });

    var h = !p.calm && heartsState ? heartsState : null;
    e.hearts.forEach(function (el, i) {
      el.hidden = !h;
      if (!h) return;
      setAttr(el, "data-lives", String(h.lives));
      setAttr(el, "data-max", String(h.max));
      if (i === 0) setAttr(el, "aria-label", h.lives + " of " + h.max + " hearts");
      setText(el, heartsHtml(h.lives, h.max));
    });
    var t = timerState;
    e.timers.forEach(function (el) {
      el.hidden = !t;
      if (!t) return;
      setAttr(el, "data-urgency", t.urgency || "ok");
      setText(el.querySelector(".hud-timer-text"), esc(t.text || ""));
      if (t.label) setAttr(el, "aria-label", t.label);
    });
    e.strip.hidden = !(arena && (h || t));

    var soundOn = p.sound && !p.calm;
    setAttr(e.sound, "aria-pressed", soundOn ? "true" : "false");
    setAttr(e.sound, "title", p.calm ? "Sound is off in calm mode" : soundOn ? "Sound on" : "Sound off");
    setAttr(e.sound, "aria-disabled", p.calm ? "true" : null);
    if (e.soundIcon !== soundOn) { e.sound.innerHTML = icon(soundOn ? "sound-on" : "sound-off"); e.soundIcon = soundOn; }
    slice(e.sheet.querySelectorAll("[data-pref]")).forEach(function (input) {
      var name = input.getAttribute("data-pref");
      input.checked = name === "map3d" ? map3dOn(p) : name === "sound" ? soundOn : !!p[name];
      input.disabled = name === "sound" && p.calm;
      input.setAttribute("aria-checked", input.checked ? "true" : "false");
    });
  }

  function hud() {
    var nav = document.querySelector(".topbar nav");
    if (!nav || !Activity) return;
    if (!hudEls || !document.body.contains(hudEls.hud)) buildHudShell(nav);
    updateHud();
  }
  /* hearts come from the encounter on a chapter page and from the Arena: {lives, max} or null */
  function hudHearts(state) {
    heartsState = state && state.max ? { lives: Math.max(0, Math.floor(num(state.lives))), max: Math.floor(num(state.max)) } : null;
    updateHud();
  }
  /* the Arena's clock: {text: "0:42", urgency: "ok"|"low"|"critical", label?} or null */
  function hudTimer(state) {
    timerState = state ? { text: String(state.text || ""), urgency: state.urgency || "ok", label: state.label || "" } : null;
    updateHud();
  }

  /* --------------------------------------------------- card garnish ------ */

  var pendingEx = null;
  function findEx(key) {
    var list = document.querySelectorAll(".ex[data-key]");
    for (var i = 0; i < list.length; i++) if (list[i].getAttribute("data-key") === key) return list[i];
    return null;
  }
  function reward(ex, xp) {
    if (!ex) return;
    var old = ex.querySelector(".ex-reward");
    if (old) old.parentNode.removeChild(old);
    var span = document.createElement("span");
    span.className = "ex-reward";
    span.setAttribute("aria-hidden", "true");
    span.textContent = "+" + xp + " XP";
    var numEl = ex.querySelector(".ex-num");
    ex.insertBefore(span, numEl ? numEl.nextSibling : ex.firstChild);
  }
  var STAMPS = { first: "First try", retry: "Solved", assisted: "With help" };
  function stamp(ex) {
    if (!ex || ex.getAttribute("data-state") !== "correct") return;
    var text = STAMPS[ex.getAttribute("data-result")] || "Solved";
    var el = ex.querySelector(".ex-stamp");
    if (!el) {
      el = document.createElement("span");
      el.className = "ex-stamp";
      el.setAttribute("aria-hidden", "true");
      var fb = ex.querySelector(".ex-feedback");
      ex.insertBefore(el, fb ? fb.nextSibling : ex.querySelector(".ex-solution"));
    }
    if (el.textContent !== text) el.textContent = text;
  }

  /* ------------------------------------------------------ banner chips ---- */

  function fillBanner() {
    var host = document.querySelector(".banner-meta[data-banner-meta]");
    var ch = Site.chapterOf();
    if (!host || !ch || !Progress || !Play) return;
    var html = '<span class="banner-stat"><b>' + ch.sections.length + "</b> sections</span>";
    var c = Progress.count(ch.id);
    if (c.total) html += '<span class="banner-stat"><b>' + Math.min(c.solved, c.total) + " / " + c.total + "</b> solved</span>";
    var m = medal(ch.id, "practice");
    if (m) {
      html += '<span class="banner-stat" data-medal="' + m + '"><b aria-hidden="true">' +
        new Array(m + 1).join("★") + "</b> " + MEDALS[m] + " medal</span>";
    }
    var miss = Play.count(ch.id);
    if (miss.total) {
      html += '<span class="banner-stat"><b>★ ' + Math.min(miss.done, miss.total) + " / " + miss.total + "</b> missions</span>";
    }
    setText(host, html);
  }

  /* ---------------------------------------------------------- the bus ---- */

  var peeked = {}, cmpTimers = {};
  function onScreen(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var r = el.getBoundingClientRect();
    return r.height > 0 && r.bottom > 0 && r.top < (window.innerHeight || 0);
  }
  /* a solution opened after a correct answer and still open (and seen) four seconds later */
  function watchCompare(c) {
    var ex = c.ex, sol = ex && ex.querySelector(".ex-solution");
    if (!sol) return;
    var id = c.chapter + "/" + c.key;
    clearTimeout(cmpTimers[id]);
    var seen = false;
    window.requestAnimationFrame(function () { seen = seen || onScreen(sol); });
    setTimeout(function () { seen = seen || onScreen(sol); }, 2000);
    cmpTimers[id] = setTimeout(function () {
      delete cmpTimers[id];
      seen = seen || onScreen(sol);
      if (sol.getAttribute("data-show") !== "true" || !seen) return;
      var fresh = false;
      updateGame(function (g) {
        var ch = obj(g.cmp[c.chapter]);
        if (!ch[c.key]) { ch[c.key] = 1; fresh = true; }
        g.cmp[c.chapter] = ch;
      });
      if (fresh) grantShield();
      schedule();
    }, 4000);
  }

  function onChange(c) {
    var t = c.type;
    if (t === "attempt") {
      lastVerdict = Date.now();
      if (c.correct) pendingEx = findEx(c.key) || pendingEx;
      else if (!c.inline && c.tryNo === 1 && !c.solutionOpen) onMiss();
      schedule();
    } else if (t === "xp") {
      if (pendingEx && (c.why === "exercise" || c.why === "check")) reward(pendingEx, c.xp);
      xpOwed += c.xp;
      announce(xpOwed + " XP earned" + (c.bonus ? ", combo times " + c.mult : "") + "." +
        (c.goalMet ? " Daily goal reached." : ""), { key: "xp", priority: c.goalMet ? "normal" : "low" });
      checkLevel(false);
      hud();
      schedule();
    } else if (t === "solved") {
      stamp(findEx(c.key));
      pendingEx = null;
      fillBanner();
      schedule();
    } else if (t === "opened") {
      if (c.solved) watchCompare(c);
      else if (!c.inline && !c.tries) {
        var id = c.chapter + "/" + c.key;
        if (!peeked[id]) { peeked[id] = true; emptyMeter(); }
      }
      schedule();
    } else if (t === "combo") {
      if (!calm()) {
        var words = c.why === "shield" ? "Shield used; combo kept at " + c.pips + "."
          : c.why === "shield-up" ? "Shield ready: it will absorb your next miss."
          : c.why === "max" ? "Combo full: XP times " + multOf(5) + " from here."
          : "Combo " + c.pips + " of 5.";
        announce(words, { key: "combo", priority: "low" });
      }
      hud();
      if (c.why === "max" && pendingEx && window.BMFx) Fx.burst(pendingEx);
    } else if (t === "chapterDone" || t === "encounter" || t === "arena") {
      fillBanner();
      schedule();
    } else if (t === "prefs") {
      hud();
    } else if (t === "state" && (c.key === K.activity || c.key === K.play)) {
      hud();
      fillBanner();
      schedule();
    } else if (t === "sync") {
      rebuildPeeked();
      settle();
      hud();
      fillBanner();
    } else if (t === "reset") {
      rebuildPeeked();
      liveQ = [];
      settle();
      hud();
      fillBanner();
    }
  }

  /* After a first load, a reset or a sync: take in whatever is already true without a
     fanfare for each, so existing work shows up as a level and one summary line. */
  function settle() {
    checkLevel(true);
    if (!readRun().seen.ach) updateRun(function (r) { r.seen.ach = 1; });
    return evaluate(true);
  }
  /* solutions opened before solving, so reopening one does not empty the meter again */
  function rebuildPeeked() {
    peeked = {};
    if (!Attempts) return;
    var all = Attempts.all();
    Object.keys(all).forEach(function (ch) {
      Object.keys(obj(all[ch])).forEach(function (k) { if (obj(all[ch][k]).opened) peeked[ch + "/" + k] = true; });
    });
  }

  /* ----------------------------------------------------------- the API ---- */

  window.BMGame = {
    level: level, threshold: threshold, rank: rank, info: info,
    prefs: prefs, setPref: setPref,
    combo: combo, bonus: bonus,
    medal: medal, setStats: setStats, isMiss: isMiss, MEDALS: MEDALS,
    sectionStatus: sectionStatus, deck: deck, recordRun: recordRun,
    unlock: unlock, unlockedSince: unlockedSince, evaluate: function () { return evaluate(false); },
    /* take in what is already true without a toast for each (encounter.js, after it
       first learns which exercises make up this page's sets) */
    settle: function () { return settle(); },
    ACHIEVEMENTS: ACHIEVEMENTS, stores: stores,
    announce: announce, hud: hud, hudHearts: hudHearts, hudTimer: hudTimer,
    run: readRun, game: readGame, updateRun: updateRun
  };

  /* -------------------------------------------------------------- boot ---- */

  Store.on(onChange);
  if (!document.body || !document.querySelector) return;
  applyPrefs(prefs());
  var toasts = document.querySelector(".toasts");
  if (toasts) {
    toasts.setAttribute("aria-hidden", "true");
    toasts.removeAttribute("role");
    toasts.removeAttribute("aria-live");
  }
  liveEl();
  rebuildPeeked();
  slice(document.querySelectorAll('.ex[data-state="correct"]')).forEach(stamp);
  hud();
  fillBanner();
  var firstSeen = readRun().seen;
  checkLevel(typeof firstSeen.level !== "number");
  if (!firstSeen.ach) settle();
  else schedule();
})();
