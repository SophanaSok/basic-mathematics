/* ===========================================================================
   Basic Mathematics — the game layer
   window.BMGame   play settings, levels, the combo meter, achievements, the
                   recall model behind the Arena, and the header HUD (whose markup
                   is the shell's, tools/lib/shell.js, filled before first paint by
                   the HUD script; this file keeps it up to date with the same
                   functions, window.BMHud, src/hud/)
   window.BMFx     the two effects anything may ask for: a burst and confetti
   Loaded after site.js, so the page is already built: this file decorates it and
   then listens on BMStore. Nothing here grades an answer or changes how XP is
   earned for a correct one; it only adds the combo's share through the seam in
   site.js check(). Levels and medals are derived from the existing stores, so they
   cannot drift from the record they summarise; a cleared set's medal is also copied
   into the synced store, for pages and devices that cannot see the set itself.

   Stores:
     bm.game.v1   synced: achievements, compared solutions, the Arena's review
                  boxes, bests, medals (rematches, and clears seen on a chapter
                  page), Daily days, how often the meter filled
     bm.run.v1    this device only: the combo meter, what has been announced, a
                  cache of which exercises make up each set, the day's Arena answers
                  per section for the XP decay (arenaDay), and the Arena's own fields
                  and the next-step card's (which this file keeps as it finds them)
     bm.prefs.v1  this device only, never cleared: sound, calm, map, tempo, panel,
                  volume, motion, transparency, gfx (the settings sheet,
                  src/ui/settings.ts)

   A later version of the site may keep fields in these stores that this file has never
   heard of. Every read below carries them through and every write puts them back, the
   way assets/account.js carries them through a sync.
   =========================================================================== */
(function () {
  "use strict";

  /* BMReview (src/ui/review.ts, imported by every entry ahead of this file) holds the
     review schedule and the Arena's XP rules, one copy for this file and the Arena */
  var Store = window.BMStore, Site = window.BMSite, Review = window.BMReview;
  /* the level curve, the combo's multiplier and the HUD's drawing: the one copy, put on
     the page by the HUD script after the top bar (src/hud/levels.js, view.js) */
  var HUD = window.BMHud;
  /* BMCore (src/ui/core.ts, imported ahead of site.js) holds the exercise rules this file
     counts hearts and medals by, the same copy site.js pays by */
  var Rules = window.BMCore && window.BMCore.rules;
  if (!Store || !Site || !Review || !HUD || !Rules) return;
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
  /* no motion: the device asks for less, the reader switched on Reduce motion
     (html[data-motion]), or Study mode is on */
  function still() {
    var reduce = false, root = document.documentElement;
    try { reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { /* old browsers */ }
    return reduce || root.getAttribute("data-motion") === "reduce" || root.hasAttribute("data-calm");
  }

  /* ------------------------------------------------------------- stores -- */

  /* the fields this file reads are normalised; any others (the shape marker `v` that
     assets/account.js looks for, whatever a later version of the site adds) are carried
     through untouched, so a write here keeps them */
  function readGame() {
    var g = obj(Store.read(K.game, {})), out = {};
    Object.keys(g).forEach(function (k) { out[k] = g[k]; });
    out.ach = obj(g.ach); out.cmp = obj(g.cmp); out.sec = obj(g.sec); out.best = obj(g.best);
    out.enc = obj(g.enc); out.daily = obj(g.daily); out.maxed = num(g.maxed);
    return out;
  }
  /* a record written over an older one keeps the fields of the old one that are not in
     `known`: they are not this file's to drop */
  function over(old, rec, known) {
    old = obj(old);
    Object.keys(old).forEach(function (k) { if (known.indexOf(k) < 0) rec[k] = old[k]; });
    return rec;
  }
  var SEC = ["n", "ok", "box", "last", "fix"], BEST = ["score", "hearts", "day"], ENC = ["medal", "day"];
  function writeGame(g) { Store.write(K.game, g); }
  function updateGame(fn) {
    var g = readGame();
    fn(g);
    writeGame(g);
    return g;
  }

  /* The placement check's seed (src/learn/diag-seed.ts seedPatch): `patch` is
     { [sectionRef]: record }, each the section's record with `box` (0 or 1) and `last` (a day
     key) set. Only those two fields are written, never n, ok or fix, and the rest of an
     existing record is kept. Both guards are repeated here against the state at the moment of
     writing: an id whose record is placed (real Arena history) or that has an attempt row (it
     was worked on its page) is dropped. Returns the ids written. */
  function seedRecall(patch) {
    var written = [];
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) return written;
    var recall = Review.recall, picks = {};
    Object.keys(patch).forEach(function (id) {
      if (id === "__proto__" || !Object.prototype.hasOwnProperty.call(patch, id)) return;
      var r = patch[id];
      if (!r || typeof r !== "object" || Array.isArray(r)) return;
      if (r.box !== 0 && r.box !== 1) return;
      if (typeof r.last !== "string" || recall.dayNumber(r.last) === null) return;
      picks[id] = { box: r.box, last: r.last };
    });
    if (!Object.keys(picks).length) return written;
    updateGame(function (g) {
      var rows = sectionRows();
      Object.keys(picks).forEach(function (id) {
        var cur = Object.prototype.hasOwnProperty.call(g.sec, id) ? g.sec[id] : undefined;
        if (recall.isPlaced(cur) || rows[id]) return;
        var rec = {};
        Object.keys(obj(cur)).forEach(function (k) { rec[k] = cur[k]; });
        rec.box = picks[id].box;
        rec.last = picks[id].last;
        g.sec[id] = rec;
        written.push(id);
      });
    });
    return written;
  }

  /* the fields this file reads are normalised; any others (the Arena's picks, its ledger
     of paid runs, today's Daily) are carried through untouched, so a write here keeps them */
  function readRun() {
    var r = obj(Store.read(K.run, {}));
    var out = {};
    Object.keys(r).forEach(function (k) { out[k] = r[k]; });
    out.combo = HUD.comboOf(r);
    out.arena = r.arena || null;
    out.seen = obj(r.seen);
    out.sets = obj(r.sets);
    return out;
  }
  /* the run store is this device's scratchpad: written quietly, announced by its own events */
  function updateRun(fn) {
    var r = readRun();
    fn(r);
    Store.write(K.run, r, true);
    return r;
  }

  /* A copy of what is stored, with the settings this file knows normalised; any other
     key is kept as it is, so setPref below writes it back. Each of these stays unset
     until the reader chooses, and unset is the default:
       map           3D (src/world/tiers.ts picks how much of it the device draws)
       panel         the light reading panel, in either theme
       volume        DEFAULT_VOLUME; a whole number 0 to 100 (assets/sfx.js)
       motion        what the device asks for; "reduce" adds html[data-motion]
       transparency  what the device asks for; "reduce" adds html[data-transparency]
       gfx           "auto"; or "low", "mid", "high": the course world's quality tier
                     (src/world/tiers.ts; "mid" is its medium). The 3D course map switch
                     (map: "list") is what keeps the list.
       gfxAuto       not the reader's: the tier the course world's watchdog settled on
                     when its frames were slow ("list", "low", "medium"), so the next
                     visit starts there ("list" even when the quality was chosen: Low
                     was too slow); any choice of gfx or of the map clears it.
     src/boot.js stamps the ones that change the first paint (panel, motion,
     transparency) on <html> before it. Where the store cannot be written (blocked
     storage) the reader's choices still hold for the visit: `held` is what was last set. */
  var DEFAULT_VOLUME = 50, GFX = ["auto", "low", "mid", "high"], SETTLED = ["list", "low", "medium"], held = null;
  function prefs() {
    var p = held || obj(Store.read(K.prefs, {})), out = {};
    Object.keys(p).forEach(function (k) { out[k] = p[k]; });
    out.sound = p.sound === true;
    out.calm = p.calm === true;
    if (p.map === "3d" || p.map === "list") out.map = p.map;
    else delete out.map;
    if (p.panel === "light" || p.panel === "dark") out.panel = p.panel;
    else delete out.panel;
    out.tempo = p.tempo === "extended" || p.tempo === "untimed" ? p.tempo : "standard";
    if (typeof p.volume === "number" && p.volume >= 0 && p.volume <= 100) out.volume = Math.round(p.volume);
    else delete out.volume;
    if (p.motion === "reduce") out.motion = "reduce";
    else delete out.motion;
    if (p.transparency === "reduce") out.transparency = "reduce";
    else delete out.transparency;
    if (GFX.indexOf(p.gfx) > 0) out.gfx = p.gfx;
    else delete out.gfx;
    if (SETTLED.indexOf(p.gfxAuto) === -1) delete out.gfxAuto;
    return out;
  }
  /* the volume the sound plays at, 0 to 100 */
  function volume(p) { return p.volume === undefined ? DEFAULT_VOLUME : p.volume; }
  /* whether the course map will be 3D, for the switch in the sheet: off where the reader
     switched it off or where the world gave up as too slow (src/world/tiers.ts holds the
     world to both); switching it on clears the second */
  function map3dOn(p) {
    return p.map !== "list" && p.gfxAuto !== "list";
  }
  function applyPrefs(p) {
    var root = document.documentElement;
    if (p.calm) root.setAttribute("data-calm", "true");
    else root.removeAttribute("data-calm");
    root.setAttribute("data-sound", p.sound && !p.calm ? "on" : "off");
    /* only on a change: the 3D stages and the map repaint when it changes */
    var panel = p.panel === "dark" ? "dark" : "light";
    if (root.getAttribute("data-panel") !== panel) root.setAttribute("data-panel", panel);
    ["motion", "transparency"].forEach(function (k) {
      if (p[k] === "reduce") { if (root.getAttribute("data-" + k) !== "reduce") root.setAttribute("data-" + k, "reduce"); }
      else if (root.getAttribute("data-" + k) !== null) root.removeAttribute("data-" + k);
    });
  }
  /* One setting, as the sheet's inputs give it: a switch's true or false, a choice's
     value, the slider's number. Reduce motion and Reduce transparency take true or
     "reduce" for on. A name this file does not know writes nothing. */
  function setPref(name, value) {
    var p = prefs();
    if (name === "map3d") { name = "map"; value = value ? "3d" : "list"; }
    if (name === "sound" || name === "calm") p[name] = !!value;
    else if (name === "map") p.map = value === "list" ? "list" : "3d";
    else if (name === "panel") p.panel = value === "dark" ? "dark" : "light";
    else if (name === "tempo") p.tempo = value === "extended" || value === "untimed" ? value : "standard";
    else if (name === "volume") p.volume = Math.max(0, Math.min(100, Math.round(num(value))));
    else if (name === "motion" || name === "transparency") {
      if (value === true || value === "reduce") p[name] = "reduce";
      else delete p[name];
    } else if (name === "gfx") {
      if (GFX.indexOf(value) > 0) p.gfx = value;
      else delete p.gfx;
    } else if (name === "gfxAuto") {
      if (SETTLED.indexOf(value) !== -1) p.gfxAuto = value;
      else delete p.gfxAuto;
    } else return p;
    /* a choice of quality or of the map starts the world afresh */
    if (name === "gfx" || name === "map") delete p.gfxAuto;
    held = Store.write(K.prefs, p, true) === false ? p : null;
    applyPrefs(p);
    Store.emit({ type: "prefs", prefs: p });
    return p;
  }
  function calm() { return prefs().calm; }

  /* ------------------------------------------------------------- levels -- */

  /* the curve and the ranks are src/hud/levels.js's (threshold(L) = 5(L − 1)(L + 3)),
     the copy the HUD drew with before this file ran */
  var threshold = HUD.threshold, level = HUD.level, rank = HUD.rank;
  function info(xp) {
    if (xp === undefined) xp = Activity ? Activity.total() : 0;
    return HUD.levelInfo(xp);
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

  /* A miss (a wrong check on the road to the first correct answer; asking for help is not
     one), what the medal counts against a set (a miss, or a solve with the solution open),
     and how one practice or review set stands (health, hearts and medal): src/core/rules.ts,
     handed this file's stores when the caller has none */
  function isMiss(rec) { return Rules.isMiss(rec); }
  function medalMark(rec) { return Rules.medalMark(rec); }
  function setStats(S, chapterId, keys) { return Rules.setStats(S || stores(), chapterId, keys); }

  function setKeys(S, chapterId, set) {
    var rec = obj(obj(obj(S.run).sets)[chapterId]);
    return Array.isArray(rec[set]) ? rec[set] : null;
  }

  /* Without this device's cache, a finished chapter that has no review set still names
     its practice set: every scored exercise in it is there, so it is what progress shows
     solved (scored keys only). Covers work from before the cache, never reopened since. */
  function finishedKeys(S, chapterId, set) {
    var ch = C.chapterById ? C.chapterById(chapterId) : null;
    if (set !== "practice" || !ch || ch.sections.some(function (s) { return s.id === "review"; })) return null;
    var rec = obj(obj(S.progress)[chapterId]), keys = Object.keys(obj(rec.solved));
    return num(rec.total) > 0 && keys.length >= num(rec.total) ? keys : null;
  }

  /* the medal as shown: derived from the set, raised by a rematch in the Arena; where
     this device has not seen the set, the medal recorded when it was cleared (bankMedals) */
  function medalIn(S, chapterId, set) {
    set = set || "practice";
    var keys = setKeys(S, chapterId, set) || finishedKeys(S, chapterId, set);
    var enc = obj(obj(S.game.enc)[chapterId + "/" + set]);
    if (!keys || !keys.length) return Math.max(0, Math.min(3, num(enc.medal)));
    var st = setStats(S, chapterId, keys);
    return st.won ? Math.max(st.medal, Math.min(3, num(enc.medal))) : 0;
  }
  function medal(chapterId, set) { return medalIn(stores(), chapterId, set); }
  var MEDALS = ["", "Bronze", "Silver", "Gold"];

  /* an enc record is replaced by a higher medal, or by the same medal on an earlier day
     (the rule mergeGame in src/sync/merge.ts applies too) */
  function outranks(medal, day, old) {
    old = obj(old);
    return !old.medal || medal > num(old.medal) || (medal === num(old.medal) && day < String(old.day || "9999"));
  }

  /* Which exercises make up a set is only known on a device that has opened the chapter
     (bm.run.v1.sets, device-local). So a set seen cleared also leaves its medal in the
     synced enc record, dated the day it was cleared: the progress page, the map and a
     second device can then show it without the chapter's page. */
  function bankMedals() {
    var S = stores(), add = [];
    Object.keys(obj(S.run.sets)).forEach(function (ch) {
      ["practice", "review"].forEach(function (kind) {
        var keys = setKeys(S, ch, kind);
        if (!keys || !keys.length) return;
        var st = setStats(S, ch, keys);
        var day = st.lastSolved ? Site.dayKey(new Date(st.lastSolved)) : today();
        if (st.won && outranks(st.medal, day, S.game.enc[ch + "/" + kind])) add.push([ch + "/" + kind, st.medal, day]);
      });
    });
    if (!add.length) return;
    updateGame(function (g) {
      add.forEach(function (a) { if (outranks(a[1], a[2], g.enc[a[0]])) g.enc[a[0]] = over(g.enc[a[0]], { medal: a[1], day: a[2] }, ENC); });
    });
  }

  /* the longest run of consecutive active days anywhere in the record, so a streak from
     before the game layer, or pieced together by a sync, still counts */
  function longestRun(days) {
    days = obj(days);
    var best = 0, run = 0, prev = "";
    Object.keys(days).filter(function (k) { return days[k] > 0; }).sort().forEach(function (k) {
      var p = prev.split("-");
      run = prev && Site.dayKey(new Date(+p[0], +p[1] - 1, +p[2] + 1)) === k ? run + 1 : 1;
      if (run > best) best = run;
      prev = k;
    });
    return best;
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
    /* a finished chapter this device has no cache for, as medalIn shows it (finishedKeys) */
    Object.keys(obj(S.progress)).forEach(function (ch) {
      var keys = setKeys(S, ch, kind) ? null : finishedKeys(S, ch, kind);
      if (!keys || !keys.length) return;
      var st = setStats(S, ch, keys);
      if (st.won && (!pred || pred(ch, st))) n++;
      seen[ch] = true;
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
    A("steady-hand", "Steady hand", "Get 25 answers right the first time.", function (S) {
      return [countRecs(S, function (r) { return r.solved && r.first; }), 25];
    }),
    A("sure-hand", "Sure hand", "Get 100 answers right the first time.", function (S) {
      return [countRecs(S, function (r) { return r.solved && r.first; }), 100];
    }),
    A("full-meter", "Full meter", "Fill the combo meter: five first-try answers in a row.", function (S) {
      return [Math.min(1, num(S.game.maxed)), 1];
    }),
    A("second-wind", "Second wind", "Solve 10 exercises on the second try without opening the solution.", function (S) {
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
    A("flawless", "Flawless", "Win a Gold medal: clear a practice set with no misses and no solution opened first.", function (S) {
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
      /* recordRun unlocks it from the run itself; this catches a rematch synced from
         another device, counted only where this device can see when the set was cleared */
      var n = 0;
      Object.keys(obj(S.game.enc)).forEach(function (id) {
        var e = obj(S.game.enc[id]), cut = id.split("/");
        if (num(e.medal) < 2 || !e.day || cut[1] !== "practice") return;
        var keys = setKeys(S, cut[0], "practice");
        var st = keys && keys.length ? setStats(S, cut[0], keys) : null;
        if (!st || !st.won || !st.lastSolved) return;
        if (String(e.day) > Site.dayKey(new Date(st.lastSolved))) n++;
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
    A("took-your-time", "Took your time", "In one timed Arena run, get 10 right the first time with at least three answered after par.", function (S) {
      return [S.game.ach["took-your-time"] ? 1 : 0, 1];
    }),
    A("streak-3", "Three in a row", "Study on three days in a row.", function (S) {
      return [longestRun(obj(S.activity).days), 3];
    }),
    A("streak-7", "A full week", "Study on seven days in a row.", function (S) {
      return [longestRun(obj(S.activity).days), 7];
    }),
    A("streak-30", "A month of days", "Study on thirty days in a row.", function (S) {
      return [longestRun(obj(S.activity).days), 30];
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
  var multOf = HUD.multOf;
  function emitCombo(c, why) {
    Store.emit({ type: "combo", pips: c.pips, shield: c.shield, mult: multOf(c.pips), why: why });
  }

  /* Called by site.js for a correct answer on the road to the first one. A first-try
     answer that pays the first-time rate (BMSite.paysFirst: no clue past the first
     opened before it) earns base × 0.2 per pip already lit, then lights one more. Any
     other right answer leaves the meter as it is: no pip gained, none lost. */
  function bonus(ctx) {
    ctx = obj(ctx);
    var rec = obj(ctx.rec);
    if (ctx.ex) pendingEx = ctx.ex;
    if (!Site.paysFirst(rec) || calm()) return null;
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

  /* a first miss on a scored exercise (or a first answer given with the solution open)
     costs two pips, unless a shield takes it */
  function onMiss() {
    if (calm()) return;
    var why = "";
    var c = updateRun(function (r) {
      if (r.combo.shield) { r.combo.shield = false; why = "shield"; }
      else if (r.combo.pips > 0) { r.combo.pips = Math.max(0, r.combo.pips - 2); why = "down"; }
    }).combo;
    if (why) emitCombo(c, why);
  }
  function grantShield() {
    if (calm()) return;
    var had = true;
    var c = updateRun(function (r) { had = r.combo.shield; r.combo.shield = true; }).combo;
    if (!had) emitCombo(c, "shield-up");
  }

  /* ------------------------------------------------------ recall model --- */

  /* scored exercises (not the Your turn checks) solved first time, by section */
  function scoredFirsts() {
    var out = {}, all = Attempts ? Attempts.all() : {};
    Object.keys(all).forEach(function (ch) {
      var recs = obj(all[ch]);
      Object.keys(recs).forEach(function (k) {
        var r = obj(recs[k]), s = r.section;
        if (!s || r.inline || !r.solved || !r.first) return;
        var id = s.indexOf("#") > -1 ? s : ch + "#" + s;
        out[id] = (out[id] || 0) + 1;
      });
    });
    return out;
  }
  /* the day each section was last solved on its page (any exercise or Your turn check), for
     its first check: a section never placed is due for one a day after that (src/learn/recall.ts
     checkDue), not straight after it was learned */
  function seenDays() {
    var out = {}, all = Attempts ? Attempts.all() : {};
    Object.keys(all).forEach(function (ch) {
      var recs = obj(all[ch]);
      Object.keys(recs).forEach(function (k) {
        var r = obj(recs[k]), s = r.section, t = num(r.solved);
        if (!s || s === "warmup" || !(t > 0)) return;
        var id = s.indexOf("#") > -1 ? s : ch + "#" + s;
        out[id] = Math.max(out[id] || 0, t);
      });
    });
    Object.keys(out).forEach(function (id) { out[id] = Site.dayKey(new Date(out[id])); });
    return out;
  }
  function sectionRows() {
    var map = {}, firsts = scoredFirsts();
    if (Insights) Insights.sections().forEach(function (r) { r.scoredFirst = firsts[r.id] || 0; map[r.id] = r; });
    return map;
  }
  /* shaky: the record says reread it; solid: met well enough to go under the clock (two
     exercises solved there, scored or Your turn, or a scored one right first time, or a
     first-try answer in the Arena); new: otherwise, since one Your turn check is not enough.
     arena.js applies the same rule when the game layer is absent. */
  function statusOf(row, sec) {
    if (row && row.solved && row.score >= (Insights ? Insights.WEAK : 0.34)) return "shaky";
    if (obj(sec).ok > 0) return "solid";
    return row && (row.solved >= 2 || row.scoredFirst > 0) ? "solid" : "new";
  }
  function sectionStatus(id) {
    return statusOf(sectionRows()[id], readGame().sec[id]);
  }
  /* due on `day`: at least the box's interval (1, 3, 7, 14, 30 days) since the section was
     last placed, and at once when it never was (src/learn/recall.ts, the one copy) */
  function dueOn(sec, day) { return Review.recall.dueOn(obj(sec), day); }
  function isDue(sec) { return dueOn(sec, today()); }
  /* the sections the Arena may draw from: every one that is not new (statusOf), with the
     struggle score of each, for the "next best step" card (src/ui/next.ts), and the day it was
     last solved on its page (`seen`), for when it is due for a check */
  function deck(opts) {
    opts = obj(opts);
    var rows = sectionRows(), g = readGame(), seen = seenDays(), out = [];
    Object.keys(rows).sort().forEach(function (id) {
      var row = rows[id], sec = obj(g.sec[id]);
      var status = statusOf(row, sec);
      if (status === "new") return;
      if (opts.section && opts.section !== id) return;
      if (opts.chapter && row.chapter.id !== opts.chapter) return;
      if (opts.status && opts.status !== status) return;
      out.push({
        id: id, status: status, due: isDue(sec), box: num(sec.box), last: sec.last || null,
        label: row.label, title: row.section.title, chapter: row.chapter.id, path: row.path,
        score: num(row.score), seen: seen[id] || null
      });
    });
    return out.sort(function (a, b) {
      return (b.due - a.due) || (a.box - b.box) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
  }

  /* A chapter's practice set as this device sees it, for a rematch: null when it has
     never opened the chapter. Then the set counts as cleared only on evidence: a banked
     medal (synced) or the whole chapter solved. */
  function bossState(S, boss, g) {
    var keys = boss ? setKeys(S, boss, "practice") || finishedKeys(S, boss, "practice") : null;
    var set = keys && keys.length ? setStats(S, boss, keys) : null;
    return {
      set: set,
      cleared: !!(boss && (set ? set.won : num(obj(obj(g.enc)[boss + "/practice"]).medal) > 0 || chapterFinished(S, { id: boss })))
    };
  }
  /* whether a rematch of this chapter can win a medal: only once its practice set is cleared */
  function bossCleared(chapterId) { var S = stores(); return bossState(S, String(chapterId || ""), S.game).cleared; }

  /* One Arena run, finished or not. Updates the review boxes, bests, rematch medal and
     Daily, then pays the run's XP once: 2 per first-try answer (3 if that section was
     due), 1 per answer right on the retry (none on a question without a heart, where a
     wrong answer and "I don't know" lead to the same retry), each worth less the more
     answers from its section earlier runs paid on this device that day (src/learn/practice.ts:
     in full after none or one, at half after two or three, then a quarter; answers in the
     same run never lower each other's rate; summed, then rounded once), 5 for finishing with a heart and at least one answer right for the first two
     runs of a day that earn it and 1 after that, and 10 for the day's Daily once it is
     played through, unchanged. The day's counts are bm.run.v1.arenaDay.
     Bests are kept only for ranked (timed, with hearts) runs played to the end; a rematch
     medal needs that and a heart left. `ranked` and `finished` default to true for older
     callers. (The Arena itself allows one Daily a day; see assets/arena.js.) */
  function recordRun(result) {
    result = obj(result);
    var answers = Array.isArray(result.answers) ? result.answers : [];
    var day = /^\d{4}-\d{2}-\d{2}$/.test(result.day || "") ? result.day : today();
    var mode = String(result.mode || "standard");
    var hearts = Math.max(0, Math.floor(num(result.hearts)));
    var score = Math.max(0, Math.round(num(result.score)));
    var ranked = result.ranked !== false, finished = result.finished !== false;
    var xp = 0, dailyBonus = false, newMedal = 0, before = readGame();
    var bySec = {}, paid = [];
    var boss = result.boss ? String(result.boss) : "", S0 = stores();
    var bs = bossState(S0, boss, before), bossSet = bs.set, cleared = bs.cleared;

    answers.forEach(function (a) {
      a = obj(a);
      var sid = a.section ? String(a.section) : "";
      var wasDue = sid ? isDue(before.sec[sid]) : false;
      if (a.first) paid.push({ section: sid, xp: wasDue ? 3 : 2 });
      else if (a.retry && !a.hf) paid.push({ section: sid, xp: 1 });
      if (!sid) return;
      var s = bySec[sid] || (bySec[sid] = { n: 0, ok: 0, miss: 0 });
      s.n++;
      if (a.first) s.ok++;
      else s.miss++;
    });
    var right = answers.some(function (a) { return a && (a.first || a.retry); });
    var P = Review.practice, settled = P.settleRun(paid, finished && right && hearts > 0, P.arenaDayFor(readRun().arenaDay, day));
    xp = settled.answers + settled.finish;
    updateRun(function (r) { r.arenaDay = P.toStore(r.arenaDay, settled.day, today()); });

    var g = updateGame(function (g) {
      Object.keys(bySec).forEach(function (sid) {
        var s = bySec[sid], sec = obj(g.sec[sid]);
        /* a miss sends the section back to the first box and restarts its clock; a clean
           showing moves it up one only once it is due, and an early one leaves both box
           and clock alone, so daily cramming does not fake spacing (src/learn/recall.ts) */
        var at = Review.recall.place(sec, s.miss > 0, day);
        var rec = { n: num(sec.n) + s.n, ok: num(sec.ok) + s.ok, box: at.box, last: at.last };
        if (num(sec.fix)) rec.fix = num(sec.fix);
        g.sec[sid] = over(sec, rec, SEC);
      });
      /* Repair: an untimed run on one weak section; it counts as repaired when it was
         played to the end, every answer came right and at least four in five were right
         first time. A banked repair records its answers but repairs nothing. */
      var planned = Math.max(1, Math.floor(num(result.planned)) || 5);
      if (mode === "repair" && result.section && finished && answers.length >= planned) {
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
      if (ranked && finished && (!g.best[mode] || score > num(prev.score) ||
          (score === num(prev.score) && hearts > num(prev.hearts)) ||
          (score === num(prev.score) && hearts === num(prev.hearts) && day < String(prev.day || "9999")))) {
        g.best[mode] = over(prev, { score: score, hearts: hearts, day: day }, BEST);
      }
      /* a rematch only raises a medal the set has earned (cleared, above), and never one
         lost on hearts */
      if (boss && answers.length && ranked && finished && hearts > 0 && cleared) {
        newMedal = hearts >= 3 ? 3 : 2;
        var id = boss + "/practice";
        if (outranks(newMedal, day, g.enc[id])) g.enc[id] = over(g.enc[id], { medal: newMedal, day: day }, ENC);
      }
      if (mode === "daily" && answers.length && finished) {
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
    /* Returning champion, from the run itself: on a tie the enc record keeps the earlier
       day, so a later Silver may leave no trace there. "0" stands for a set cleared
       before solves were timed, which any rematch comes after. */
    if (newMedal >= 2) {
      var since = bossSet ? (bossSet.lastSolved ? Site.dayKey(new Date(bossSet.lastSolved)) : "0")
        : String(obj(before.enc[boss + "/practice"]).day || "");
      if (since && day > since) unlock("returning-champion");
    }
    if (xp && Activity) Activity.add(xp, "arena");
    Store.emit({ type: "arena", phase: "recorded", mode: mode, xp: xp, medal: newMedal });
    schedule();
    /* parts: what the XP is made of, and what the answers would have paid at the full
       rate; reduced: the sections whose answers paid less today (the result screen says why) */
    return {
      xp: xp, medal: newMedal, game: g, cleared: cleared,
      parts: { answers: settled.answers, full: settled.full, finish: settled.finish, daily: dailyBonus ? 10 : 0 },
      reduced: settled.reduced, finishReduced: settled.finishReduced
    };
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
  var live = null, liveQ = [], liveTimer = null, lastVerdict = 0, lastSent = 0, xpOwed = 0, goalOwed = false;
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
    var rest = liveQ.filter(function (q) { return q.priority !== "high"; });
    /* at most three of the rest, dropping the oldest low ones (counts, the combo) first */
    while (rest.length > 3) {
      var drop = 0;
      for (var i = 0; i < rest.length; i++) if (rest[i].priority === "low") { drop = i; break; }
      rest.splice(drop, 1);
    }
    liveQ = [];
    xpOwed = 0;
    goalOwed = false;
    var text = high.concat(rest).map(function (q) { return q.text; }).join(" ");
    if (!text) return;
    var el = liveEl();
    if (!el) return;
    el.textContent = "";
    lastSent = Date.now();
    setTimeout(function () { el.textContent = text; }, 40);
  }

  /* ------------------------------------------------------------ toasts ---- */

  /* A quick correct answer could otherwise raise five cards at once (XP, combo, goal, a
     level, an achievement) and cover the exercise on a phone. So this file keeps the
     stack: XP, the combo's share and the daily goal fold into one card that grows while
     it is up, and every other card (level, achievement, window.BMToast) waits its turn,
     one at a time, so at most two toasts show and none is ever in the way. site.js still
     draws its own +XP and goal toasts, which are the whole story without this file; here
     they are taken off the page as they arrive, before they are painted, since the xp
     event that raised them carries the same news. */
  var toastHost = null, watched = null, toastQ = [], cardUp = null;
  var xpCard = null, xpTimer = null, xpSum = 0, xpMult = 0, xpGoal = false;
  function toastsEl() {
    if (!document.body) return null;
    if (!toastHost || !document.body.contains(toastHost)) toastHost = document.querySelector(".toasts");
    if (!toastHost) {
      toastHost = document.createElement("div");
      toastHost.className = "toasts";
      document.body.appendChild(toastHost);
    }
    toastHost.setAttribute("aria-hidden", "true");
    toastHost.removeAttribute("role");
    toastHost.removeAttribute("aria-live");
    if (watched !== toastHost && window.MutationObserver) {
      watched = toastHost;
      new MutationObserver(function (list) {
        list.forEach(function (m) {
          slice(m.addedNodes).forEach(function (n) {
            if (n.nodeType === 1 && !n.hasAttribute("data-own") && /^toast( goal)?$/.test(n.className) && n.parentNode) {
              n.parentNode.removeChild(n);
            }
          });
        });
      }).observe(toastHost, { childList: true });
    }
    return toastHost;
  }
  function showToast(html, cls) {
    var host = toastsEl();
    if (!host) return null;
    var t = document.createElement("div");
    t.className = "toast" + (cls ? " " + cls : "");
    t.setAttribute("data-own", "");
    t.innerHTML = html;
    host.appendChild(t);
    return t;
  }
  function dropToast(t, then) {
    if (t) t.setAttribute("data-out", "true");
    setTimeout(function () {
      if (t && t.parentNode) t.parentNode.removeChild(t);
      if (then) then();
    }, 400);
  }
  /* the one XP card: a second answer while it is up adds to it and keeps it up */
  function xpToast(c) {
    if (!window.MutationObserver || !document.body) return;
    if (!xpCard || !xpCard.parentNode || xpCard.hasAttribute("data-out")) {
      xpCard = showToast("", "");
      xpSum = 0; xpMult = 0; xpGoal = false;
      if (!xpCard) return;
    }
    xpSum += num(c.xp);
    if (c.bonus) xpMult = c.mult;
    xpGoal = xpGoal || !!c.goalMet;
    xpCard.className = "toast" + (xpGoal ? " goal" : "");
    xpCard.innerHTML = "<b>+" + xpSum + " XP</b>" +
      (xpMult ? ' <span class="toast-combo">combo ×' + esc(String(xpMult)) + "</span>" : "") +
      (xpGoal ? ' <span class="toast-text">Daily goal reached: ' + Activity.goal() + " XP today.</span>" : "");
    clearTimeout(xpTimer);
    var card = xpCard;
    xpTimer = setTimeout(function () { dropToast(card); }, 2600);
  }
  function cardToast(html, cls) {
    toastQ.push({ html: String(html), cls: cls || "" });
    pumpToasts();
  }
  /* achievements: at most two waiting; any more ride on the last as "and N more" */
  function achToast(title, text) {
    var waiting = toastQ.filter(function (q) { return q.ach; });
    if (waiting.length >= 2) waiting[1].more = (waiting[1].more || 0) + 1;
    else toastQ.push({ ach: true, title: title, text: text });
    pumpToasts();
  }
  function pumpToasts() {
    if (cardUp || !toastQ.length || !document.body) return;
    var t = toastQ.shift();
    var html = !t.ach ? t.html : '<span class="toast-kicker">Achievement</span> <b>' + esc(t.title) + "</b>" +
      (t.text ? ' <span class="toast-text">' + esc(t.text) + "</span>" : "") +
      (t.more ? ' <span class="toast-more">and ' + t.more + " more</span>" : "");
    cardUp = showToast(html, t.ach ? "ach" : t.cls);
    if (!cardUp) return;
    setTimeout(function () { dropToast(cardUp, function () { cardUp = null; pumpToasts(); }); }, 2600);
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
    bankMedals();
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
      cardToast(esc(line), "ach");
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
      cardToast('<span class="toast-kicker">Level ' + inf.level + "</span> <b>" + esc(inf.rank) + "</b>", "level");
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
  /* The HUD's markup is the shell's (tools/lib/shell.js): every slot is in the top bar
     from the first byte, and the HUD script after it filled in the level, the XP bar, the
     streak and the combo before first paint. This keeps them up to date with the same
     drawing (BMHud.paint, src/hud/view.js), so a redraw that changes nothing moves
     nothing, and adds what only the game knows: the hearts, the Arena's clock, and the
     sound button's title. The settings sheet is src/ui/settings.ts's. */

  var hudEls = null, heartsState = null, timerState = null;

  /* the shell's slots on this page, or null on a page without them (a test fixture) */
  function findHud() {
    var bar = document.querySelector(".topbar"), el = bar && bar.querySelector(".hud");
    if (!el) return null;
    var strip = bar.querySelector(".hud-strip"), sound = bar.querySelector(".hud-sound");
    /* from the frame after next, a change to the XP bar fills it smoothly (game.css); never
       the fill it had from the start */
    if (!el.hasAttribute("data-live") && window.requestAnimationFrame) {
      window.requestAnimationFrame(function () { window.requestAnimationFrame(function () { el.setAttribute("data-live", ""); }); });
    }
    if (sound && !sound.hasAttribute("data-wired")) {
      sound.setAttribute("data-wired", "");
      sound.addEventListener("click", function () {
        var p = prefs();
        if (p.calm) { announce("Sound stays off in Study mode.", { priority: "normal" }); return; }
        setPref("sound", !p.sound);
      });
    }
    return {
      hud: el, sound: sound, strip: strip,
      hearts: [el.querySelector(".hud-hearts"), strip && strip.querySelector(".hud-hearts")].filter(Boolean),
      timers: [el.querySelector(".hud-timer"), strip && strip.querySelector(".hud-timer")].filter(Boolean)
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

  /* what the HUD script drew, from the stores as they are now */
  function hudView() {
    return HUD.hudView({
      activity: Store.read(K.activity, null), run: Store.read(K.run, null), prefs: prefs(),
      calm: document.documentElement.hasAttribute("data-calm"),
      chapter: !!document.body.getAttribute("data-chapter"), now: new Date()
    });
  }

  function updateHud() {
    if (!hudEls) return;
    var e = hudEls, p = prefs();
    var arena = document.body.getAttribute("data-mode") === "arena";
    HUD.paint(document, hudView());

    var h = !p.calm && heartsState ? heartsState : null;
    e.hearts.forEach(function (el, i) {
      el.hidden = !h;
      if (!h) return;
      /* redrawn only when the count changes, so a heart's break can play out */
      if (el.getAttribute("data-lives") !== String(h.lives) || el.children.length !== h.max) el.innerHTML = heartsHtml(h.lives, h.max);
      setAttr(el, "data-lives", String(h.lives));
      setAttr(el, "data-max", String(h.max));
      if (i === 0) setAttr(el, "aria-label", h.lives + " of " + h.max + " hearts");
    });
    var t = timerState;
    e.timers.forEach(function (el) {
      el.hidden = !t;
      if (!t) return;
      setAttr(el, "data-urgency", t.urgency || "ok");
      setText(el.querySelector(".hud-timer-text"), esc(t.text || ""));
      if (t.label) setAttr(el, "aria-label", t.label);
    });
    if (e.strip) e.strip.hidden = !(arena && (h || t));

    var soundOn = p.sound && !p.calm;
    setAttr(e.sound, "title", p.calm ? "Sound is off in Study mode" : soundOn ? "Sound on" : "Sound off");
    setAttr(e.sound, "aria-disabled", p.calm ? "true" : null);
  }

  function hud() {
    if (!Activity) return;
    if (!hudEls || !document.body.contains(hudEls.hud)) hudEls = findHud();
    updateHud();
  }
  /* the hearts just lost play their break once (game.css), then lose the mark */
  function breakHearts(hosts, lives, was) {
    hosts.forEach(function (el) {
      if (!el) return;
      var lost = slice(el.children).slice(lives, was);
      lost.forEach(function (i) { i.setAttribute("data-break", ""); });
      setTimeout(function () { lost.forEach(function (i) { i.removeAttribute("data-break"); }); }, 400);
    });
  }
  /* hearts come from the encounter on a chapter page and from the Arena: {lives, max,
     id?} or null; `id` names the set, so moving to another set is not a lost heart */
  function hudHearts(state) {
    var was = heartsState;
    heartsState = state && state.max ? {
      lives: Math.max(0, Math.floor(num(state.lives))), max: Math.floor(num(state.max)), id: String(state.id || "")
    } : null;
    updateHud();
    var h = heartsState;
    if (was && h && hudEls && !calm() && was.id === h.id && was.max === h.max && h.lives < was.lives) {
      breakHearts(hudEls.hearts, h.lives, was.lives);
    }
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

  /* A medal as three drawn stars (game.css paints each <i>, lit ones with data-on) and
     its count in words. `compact` sizes them to a line of text: a chip, a table cell. */
  function starsHtml(m, compact) {
    m = Math.max(0, Math.min(3, Math.floor(num(m))));
    var size = compact ? ' style="width:1.15em;height:1.15em"' : "";
    var html = '<span class="encounter-stars" role="img" aria-label="' + m + ' of 3 stars"' +
      (compact ? ' style="display:inline-flex;gap:.15em;vertical-align:-.2em"' : "") + ">";
    for (var i = 0; i < 3; i++) html += "<i" + (i < m ? " data-on" : "") + size + "></i>";
    return html + "</span>";
  }

  function fillBanner() {
    var host = document.querySelector(".banner-meta[data-banner-meta]");
    var ch = Site.chapterOf();
    if (!host || !ch || !Progress || !Play) return;
    var html = '<span class="banner-stat"><b>' + ch.sections.length + "</b> sections</span>";
    var c = Progress.count(ch.id);
    if (c.total) html += '<span class="banner-stat"><b>' + Math.min(c.solved, c.total) + " / " + c.total + "</b> solved</span>";
    var m = medal(ch.id, "practice");
    if (m) html += '<span class="banner-stat" data-medal="' + m + '">' + starsHtml(m, true) + " " + MEDALS[m] + " medal</span>";
    var miss = Play.count(ch.id);
    if (miss.total) {
      html += '<span class="banner-stat"><b>★ ' + Math.min(miss.done, miss.total) + " / " + miss.total + "</b> missions</span>";
    }
    setText(host, html);
  }

  /* ---------------------------------------------------------- the bus ---- */

  var cmpTimers = {};
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
      /* The first check on a scored exercise breaks the run unless it was right by the
         reader's own work: a wrong one, or a right one with the solution open. Were the
         second free, the pips it kept would pay on every answer after it, and reading the
         solution would out-earn trying and missing. Once per exercise, as tryNo is 1
         only once; opening the solution itself costs nothing. */
      if (!c.inline && c.tryNo === 1 && (!c.correct || c.solutionOpen)) onMiss();
      schedule();
    } else if (t === "xp") {
      if (pendingEx && (c.why === "exercise" || c.why === "check")) reward(pendingEx, c.xp);
      xpToast(c);
      /* XP and the goal are carried until spoken, so a quick next answer cannot drop them */
      xpOwed += c.xp;
      goalOwed = goalOwed || !!c.goalMet;
      announce(xpOwed + " XP earned" + (c.bonus ? ", combo times " + c.mult : "") + "." +
        (goalOwed ? " Daily goal reached." : ""), { key: "xp", priority: goalOwed ? "normal" : "low" });
      checkLevel(false);
      hud();
      schedule();
    } else if (t === "solved") {
      stamp(findEx(c.key));
      pendingEx = null;
      fillBanner();
      schedule();
    } else if (t === "opened") {
      /* opened after solving: comparing earns a shield. Opened before: nothing at the
         opening, neither the meter nor a heart; only an answer given with it open later
         costs the pips a miss would (the attempt event above) */
      if (c.solved) watchCompare(c);
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
      settle();
      hud();
      fillBanner();
    } else if (t === "reset") {
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

  /* ----------------------------------------------------------- the API ---- */

  window.BMGame = {
    level: level, threshold: threshold, rank: rank, info: info,
    prefs: prefs, setPref: setPref, map3dOn: map3dOn, volume: volume,
    combo: combo, bonus: bonus,
    medal: medal, setStats: setStats, isMiss: isMiss, medalMark: medalMark, MEDALS: MEDALS, stars: starsHtml,
    sectionStatus: sectionStatus, deck: deck, recordRun: recordRun, cleared: bossCleared,
    unlock: unlock, unlockedSince: unlockedSince, evaluate: function () { return evaluate(false); },
    /* take in what is already true without a toast for each (encounter.js, after it
       first learns which exercises make up this page's sets) */
    settle: function () { return settle(); },
    ACHIEVEMENTS: ACHIEVEMENTS, stores: stores,
    announce: announce, hud: hud, hudHearts: hudHearts, hudTimer: hudTimer,
    run: readRun, game: readGame, updateRun: updateRun,
    seedRecall: seedRecall
  };

  /* -------------------------------------------------------------- boot ---- */

  Store.on(onChange);
  if (!document.body || !document.querySelector) return;
  applyPrefs(prefs());
  /* from here every toast goes through the stack above */
  toastsEl();
  window.BMToast = cardToast;
  liveEl();
  slice(document.querySelectorAll('.ex[data-state="correct"]')).forEach(stamp);
  /* site.js drew the chapter's feedback before Insights.adjust above existed: once there
     are Arena records it could soften, draw it again, so a repaired section is not
     still named as worth another look */
  if (Insights && count(readGame().sec) && typeof Site.refresh === "function") Site.refresh();
  hud();
  fillBanner();
  var firstSeen = readRun().seen;
  checkLevel(typeof firstSeen.level !== "number");
  if (!firstSeen.ach) {
    /* wait for the other deferred scripts: on a chapter page encounter.js first learns
       which exercises make up its sets and settles, so the backfill is one summary */
    var late = function () { if (!readRun().seen.ach) settle(); };
    if (document.readyState === "complete") setTimeout(late, 0);
    else { document.addEventListener("DOMContentLoaded", late); window.addEventListener("load", late); }
  } else schedule();
})();
