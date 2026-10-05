/* ===========================================================================
   Basic Mathematics — site engine
   No framework, no build step. Four jobs:
     1. theme (remembered, with OS default)
     2. math typesetting via KaTeX auto-render
     3. navigation built from data/curriculum.js (sidebar, prev/next, home cards)
     4. the exercise engine + progress store
     5. attempts, XP and streaks — what feeds the "areas to strengthen" feedback
   Everything is saved locally first. An account (assets/account.js) only listens on
   BMStore and syncs; nothing here knows about a server.
   Every localStorage access is wrapped: a browser that blocks storage still
   gets a fully working, stateless site.
   =========================================================================== */
(function () {
  "use strict";

  var THEME_KEY = "bm.theme";
  var PROGRESS_KEY = "bm.progress.v1";
  var PLAY_KEY = "bm.play.v1";
  var LAST_KEY = "bm.last";
  var ATTEMPTS_KEY = "bm.attempts.v1";
  var ACTIVITY_KEY = "bm.activity.v1";
  var LESSON_KEY = "bm.lesson.v1";
  var GAME_KEY = "bm.game.v1";
  var RUN_KEY = "bm.run.v1";
  var PREFS_KEY = "bm.prefs.v1";
  var C = window.BM_CURRICULUM || { parts: [], chapters: [] };

  /* ------------------------------------------------------------ storage -- */

  function readStore(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function writeStore(key, value, silent) {
    var ok = true;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      ok = false;
    }
    if (!silent) Store.emit({ type: "state", key: key });
    return ok;
  }
  /* A stored record, or null for anything else. The writers below start a fresh record
     over an entry that is missing or damaged (a string, a number, a list) instead of
     failing on it: a sync passes what is not a record through as it found it. */
  function record(x) { return x && typeof x === "object" && !Array.isArray(x) ? x : null; }

  /* One bus for every change to saved state. site.js announces; whoever cares
     (the header counters, lesson mode, account sync) listens. */
  var listeners = [];
  var Store = {
    keys: {
      progress: PROGRESS_KEY, play: PLAY_KEY, last: LAST_KEY,
      attempts: ATTEMPTS_KEY, activity: ACTIVITY_KEY, lesson: LESSON_KEY,
      /* the game layer (assets/game.js): game is synced, run and prefs stay on this device */
      game: GAME_KEY, run: RUN_KEY, prefs: PREFS_KEY
    },
    read: readStore,
    write: writeStore,
    on: function (fn) { listeners.push(fn); },
    emit: function (change) {
      listeners.slice().forEach(function (fn) {
        try { fn(change); } catch (e) { if (window.console) console.error("[BM] listener failed", e); }
      });
    }
  };
  window.BMStore = Store;

  var Progress = {
    all: function () {
      var p = readStore(PROGRESS_KEY, {});
      return p && typeof p === "object" ? p : {};
    },
    chapter: function (id) {
      var rec = this.all()[id];
      if (!rec || typeof rec !== "object") return { solved: {}, total: 0 };
      return { solved: rec.solved || {}, total: rec.total || 0 };
    },
    setTotal: function (id, total) {
      var all = this.all();
      var rec = record(all[id]) || { solved: {}, total: 0 };
      rec.total = total;
      all[id] = rec;
      writeStore(PROGRESS_KEY, all);
    },
    markSolved: function (id, exKey) {
      var all = this.all();
      var rec = record(all[id]) || { solved: {}, total: 0 };
      rec.solved = rec.solved || {};
      rec.solved[exKey] = true;
      all[id] = rec;
      writeStore(PROGRESS_KEY, all);
    },
    count: function (id) {
      var rec = this.chapter(id);
      return { solved: Object.keys(rec.solved).length, total: rec.total };
    },
    reset: function () {
      writeStore(PROGRESS_KEY, {});
    }
  };
  window.BMProgress = Progress;

  /* Missions on the interactive figures, and the opening-puzzle guesses.
     Kept apart from exercise progress so neither can disturb the other. */
  var Play = {
    all: function () {
      var p = readStore(PLAY_KEY, {});
      return p && typeof p === "object" ? p : {};
    },
    chapter: function (id) {
      var rec = this.all()[id];
      if (!rec || typeof rec !== "object") return { done: {}, total: 0, guess: null };
      return { done: rec.done || {}, total: rec.total || 0, guess: rec.guess === undefined ? null : rec.guess };
    },
    update: function (id, fn) {
      var all = this.all();
      var rec = record(all[id]) || {};
      rec.done = rec.done || {};
      fn(rec);
      all[id] = rec;
      writeStore(PLAY_KEY, all);
    },
    isDone: function (id, key) { return !!this.chapter(id).done[key]; },
    markDone: function (id, key) {
      var fresh = !this.isDone(id, key);
      this.update(id, function (rec) { rec.done[key] = true; });
      if (fresh) Activity.add(XP.mission, "mission");
    },
    setTotal: function (id, total) { this.update(id, function (rec) { rec.total = total; }); },
    setGuess: function (id, i) { this.update(id, function (rec) { rec.guess = i; }); },
    count: function (id) {
      var rec = this.chapter(id);
      return { done: Object.keys(rec.done).length, total: rec.total };
    },
    reset: function () { writeStore(PLAY_KEY, {}); writeStore(LAST_KEY, null); }
  };
  window.BMPlay = Play;

  /* How each exercise went, not just whether it was solved. One record per exercise:
       tries   wrong + right checks made before it was first solved
       first   1 if solved on the first check without opening the solution
       hints   the hint level the misses reached (0, 1, 2): 1 after a first miss on an
               exercise with a hint, 2 after a second miss on one with a second hint.
               Until the clue ladder it was the hint shown automatically; it is still
               written exactly so, because struggle() below, the Second wind achievement
               and the server's hint_level read it. What was opened is `rung`
       rung    the highest clue opened while unsolved (1, 2, 3; the help ladder,
               src/ui/ladder.ts); never written once the exercise is solved
       opened  1 if the solution was opened before solving
       skipped 1 if an inline check was passed over in lesson mode
       solved  time of the first correct answer
       section the section it tests ("one-unknown", or "ch02#one-unknown" in a mixed review)
     Inline checks are recorded too: they are unscored, but they are the earliest signal. */
  var Attempts = {
    all: function () {
      var p = readStore(ATTEMPTS_KEY, {});
      return p && typeof p === "object" ? p : {};
    },
    chapter: function (id) {
      var rec = this.all()[id];
      return rec && typeof rec === "object" ? rec : {};
    },
    get: function (id, key) { return this.chapter(id)[key] || {}; },
    update: function (id, key, fn) {
      var all = this.all();
      var ch = record(all[id]) || {};
      var rec = record(ch[key]) || {};
      fn(rec);
      ch[key] = rec;
      all[id] = ch;
      writeStore(ATTEMPTS_KEY, all);
      return rec;
    },
    reset: function () { writeStore(ATTEMPTS_KEY, {}); }
  };
  window.BMAttempts = Attempts;

  /* XP per day. The streak, the daily goal and the total are all derived from this one
     map, so two devices merge by taking the larger number for each day. */
  var XP = { first: 10, solved: 6, opened: 3, inlineFirst: 5, inline: 3, inlineOpened: 1, mission: 5 };
  var DEFAULT_GOAL = 30;

  function dayKey(d) {
    d = d || new Date();
    function two(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
  }

  var Activity = {
    all: function () {
      var p = readStore(ACTIVITY_KEY, null);
      if (!p || typeof p !== "object") p = {};
      if (!p.days || typeof p.days !== "object") p.days = {};
      return p;
    },
    goal: function () {
      var g = parseInt(this.all().goal, 10);
      return g > 0 ? g : DEFAULT_GOAL;
    },
    setGoal: function (n) {
      var all = this.all();
      all.goal = Math.max(5, Math.min(500, parseInt(n, 10) || DEFAULT_GOAL));
      writeStore(ACTIVITY_KEY, all);
    },
    today: function () { return this.all().days[dayKey()] || 0; },
    total: function () {
      var days = this.all().days, sum = 0;
      Object.keys(days).forEach(function (k) { sum += days[k] || 0; });
      return sum;
    },
    /* consecutive active days ending today — or yesterday, so a streak is not shown
       as broken before today's work has had a chance to happen */
    streak: function () {
      var days = this.all().days, d = new Date(), n = 0;
      if (!days[dayKey(d)]) d.setDate(d.getDate() - 1);
      while (days[dayKey(d)] > 0) { n++; d.setDate(d.getDate() - 1); }
      return n;
    },
    /* `extra` carries the combo's share, { bonus, mult }, so the toast can show it */
    add: function (xp, why, extra) {
      if (!xp) return;
      var all = this.all(), k = dayKey(), goal = this.goal();
      var before = all.days[k] || 0;
      all.days[k] = before + xp;
      writeStore(ACTIVITY_KEY, all);
      var change = { type: "xp", xp: xp, why: why, goalMet: before < goal && before + xp >= goal };
      if (extra && extra.bonus) { change.bonus = extra.bonus; change.mult = extra.mult || 1; }
      Store.emit(change);
    },
    reset: function () {
      var goal = this.all().goal;
      writeStore(ACTIVITY_KEY, goal ? { days: {}, goal: goal } : { days: {} });
    }
  };
  window.BMActivity = Activity;

  /* -------------------------------------------------------------- theme -- */

  function currentTheme() {
    return readStore(THEME_KEY, null);
  }
  /* data-theme is always set (boot.js did it before first paint): the saved choice,
     else whatever the operating system prefers */
  function applyTheme(mode) {
    var root = document.documentElement;
    if (mode !== "light" && mode !== "dark") mode = systemPrefersDark() ? "dark" : "light";
    root.setAttribute("data-theme", mode);
  }
  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function initTheme() {
    applyTheme(currentTheme());
    var btns = document.querySelectorAll("[data-theme-toggle]");
    /* read what is on screen, not the store: a blocked store never keeps the choice */
    function effective() {
      return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    }
    function label() {
      return effective() === "dark" ? "☀" : "☾";
    }
    Array.prototype.forEach.call(btns, function (btn) {
      btn.textContent = label();
      btn.setAttribute("title", "Switch between light and dark");
      btn.setAttribute("aria-label", "Switch between light and dark");
      btn.classList.add("theme-btn");
      btn.addEventListener("click", function () {
        var next = effective() === "dark" ? "light" : "dark";
        writeStore(THEME_KEY, next);
        applyTheme(next);
        Array.prototype.forEach.call(btns, function (b) { b.textContent = label(); });
      });
    });
    /* follow the operating system until the reader picks a side */
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var follow = function () {
        if (currentTheme()) return;
        applyTheme(null);
        Array.prototype.forEach.call(btns, function (b) { b.textContent = label(); });
      };
      if (mq.addEventListener) mq.addEventListener("change", follow);
      else if (mq.addListener) mq.addListener(follow);
    }
  }

  /* --------------------------------------------------------------- math -- */

  function renderMath(root) {
    if (!window.renderMathInElement) return;
    try {
      window.renderMathInElement(root || document.body, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false }
        ],
        ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "option"],
        throwOnError: false,
        strict: false
      });
      /* a formula gives the button, label, table header or heading it sits in no name
         (src/ui/math-names.ts says why); this gives it one, and changes nothing visible */
      if (window.BMMathNames) window.BMMathNames.name(root || document.body);
    } catch (e) {
      /* a CDN miss must not take the prose down */
    }
  }
  window.BMRenderMath = renderMath;

  /* --------------------------------------------------------- navigation -- */

  function chapterOf(body) {
    var id = body.getAttribute("data-chapter");
    return id && C.chapterById ? C.chapterById(id) : null;
  }

  /* depth of the current page relative to the site root, as a path prefix */
  function rootPrefix() {
    var depth = parseInt(document.body.getAttribute("data-depth") || "0", 10);
    return depth > 0 ? new Array(depth + 1).join("../") : "";
  }

  function buildSidebar(chapter) {
    var host = document.querySelector("[data-sidebar]");
    if (!host || !chapter) return;
    var root = rootPrefix();
    var html = "";

    html += '<div class="sidebar-body">';
    html += '<h2>In this chapter</h2><ol>';
    if (document.getElementById("warmup")) {
      html += '<li><a href="#warmup"><span class="counter">↺</span>Warm-up</a></li>';
    }
    chapter.sections.forEach(function (s, i) {
      html += '<li><a href="#' + s.id + '"><span class="counter">' + (i + 1) + "</span>" +
        escapeHtml(s.title) + "</a></li>";
    });
    if (document.getElementById("practice")) {
      html += '<li><a href="#practice"><span class="counter">★</span>Practice</a></li>';
    }
    html += "</ol>";
    if (document.getElementById("practice")) {
      html += '<div class="side-progress" data-side-progress hidden>' +
        '<div class="bar"><span></span></div><p></p></div>';
    }

    html += '<h2>' + escapeHtml(chapter.part.name) + "</h2><ol>";
    chapter.part.chapters.forEach(function (ch) {
      var here = ch.id === chapter.id;
      html += '<li><a href="' + escapeHtml(ch.file) + '"' + (here ? ' aria-current="page"' : "") + ">" +
        '<span class="counter">' + escapeHtml(ch.label === "Interlude" ? "§" : ch.label) + "</span>" +
        escapeHtml(ch.title) + "</a></li>";
    });
    html += "</ol>";
    html += '<p><a href="' + root + 'index.html">← All chapters</a></p>';
    html += "</div>";

    host.innerHTML =
      '<button class="icon-btn sidebar-toggle ui" type="button" aria-expanded="false">☰ Chapter contents</button>' + html;

    var toggle = host.querySelector(".sidebar-toggle");
    var collapsedOnSmall = window.matchMedia("(max-width: 999px)").matches;
    host.setAttribute("data-collapsed", collapsedOnSmall ? "true" : "false");
    toggle.setAttribute("aria-expanded", collapsedOnSmall ? "false" : "true");
    toggle.addEventListener("click", function () {
      var collapsed = host.getAttribute("data-collapsed") === "true";
      host.setAttribute("data-collapsed", collapsed ? "false" : "true");
      toggle.setAttribute("aria-expanded", collapsed ? "true" : "false");
    });

    spy(host, chapter);
  }

  /* highlight the section heading nearest the top of the viewport */
  function spy(host, chapter) {
    var links = host.querySelectorAll('a[href^="#"]');
    if (!links.length || !("IntersectionObserver" in window)) return;
    var map = {};
    Array.prototype.forEach.call(links, function (a) {
      map[a.getAttribute("href").slice(1)] = a;
    });
    var visible = {};
    var obs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) { visible[en.target.id] = en.isIntersecting; });
        var chosen = null;
        Object.keys(map).forEach(function (id) {
          if (!chosen && visible[id]) chosen = id;
        });
        Array.prototype.forEach.call(links, function (a) {
          a.removeAttribute("aria-current");
        });
        if (chosen && map[chosen]) map[chosen].setAttribute("aria-current", "true");
        /* remember where the reader is, for the Continue button on the home page */
        if (chosen && chapter) writeStore(LAST_KEY, { id: chapter.id, section: chosen });
      },
      { rootMargin: "-72px 0px -70% 0px", threshold: 0 }
    );
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) obs.observe(el);
    });
  }

  function buildChapterNav(chapter) {
    var host = document.querySelector("[data-chapter-nav]");
    if (!host || !chapter) return;
    var list = C.chapters;
    var i = -1;
    list.forEach(function (ch, k) { if (ch.id === chapter.id) i = k; });
    var root = rootPrefix();
    var html = "";
    function link(ch, dir, cls) {
      var href = root + ch.path;
      return '<a class="' + cls + '" href="' + escapeHtml(href) + '"><span class="dir">' + dir +
        "</span><b>" + escapeHtml(ch.label === "Interlude" ? "" : ch.label + ". ") +
        escapeHtml(ch.title) + "</b></a>";
    }
    if (i > 0) html += link(list[i - 1], "← Previous", "prev");
    else html += '<a class="prev" href="' + root + 'index.html"><span class="dir">← Back</span><b>Course contents</b></a>';
    if (i > -1 && i < list.length - 1) html += link(list[i + 1], "Next →", "next");
    else html += '<a class="next" href="' + root + 'index.html"><span class="dir">Done →</span><b>Course contents</b></a>';
    host.innerHTML = html;
  }

  /* ---------------------------------------------------------- home page -- */

  function chapterName(ch) {
    return ch.label === "Interlude" ? "Interlude" : "Chapter " + ch.label;
  }

  /* The course as a path: one stop per chapter, strung along a line. Nothing is locked —
     "ahead" is only a colour — because skipping inside a Part mostly works. */
  function buildHome() {
    var host = document.querySelector("[data-course-index]");
    if (!host) return;
    var last = readStore(LAST_KEY, null);
    var counts = {}, currentId = null;
    C.chapters.forEach(function (ch) {
      var c = Progress.count(ch.id);
      counts[ch.id] = c;
      c.done = !!c.total && c.solved >= c.total;
    });
    /* "you are here": the chapter last opened, unless it is finished; then the first unfinished one */
    if (last && last.id && counts[last.id] && !counts[last.id].done) currentId = last.id;
    else C.chapters.some(function (ch) {
      if (ch.status === "full" && !counts[ch.id].done) { currentId = ch.id; return true; }
      return false;
    });

    var html = "";
    C.parts.forEach(function (part) {
      var done = part.chapters.filter(function (ch) { return counts[ch.id].done; }).length;
      html += '<section class="part" data-part="' + escapeHtml(part.id) + '">';
      html += '<div class="part-head"><span class="roman" aria-hidden="true">' + part.num +
        '</span><h2 id="part-' + part.id + '">Part ' + part.num + " — " + escapeHtml(part.name) + "</h2>" +
        '<span class="part-count">' + done + " / " + part.chapters.length + " complete</span></div>";
      html += '<p class="part-blurb">' + escapeHtml(part.blurb) + "</p>";
      html += '<ol class="path">';
      part.chapters.forEach(function (ch) {
        var c = counts[ch.id];
        var pct = c.total ? Math.round((c.solved / c.total) * 100) : 0;
        var state = c.done ? "done" : ch.id === currentId ? "current" : c.solved ? "started" : "ahead";
        html += '<li class="stop" data-state="' + state + '" data-chapter="' + escapeHtml(ch.id) + '">';
        html += '<a class="stop-link" href="' + escapeHtml(ch.path) + '">';
        html += '<span class="stop-node" style="--pct:' + pct + '" aria-hidden="true"><span>' +
          (c.done ? "✓" : escapeHtml(ch.label === "Interlude" ? "§" : ch.label)) + "</span></span>";
        html += '<span class="stop-card">';
        html += '<span class="row"><span class="label">' + escapeHtml(chapterName(ch)) + "</span>";
        if (state === "current") html += '<span class="badge here">You are here</span>';
        if (state === "done") html += '<span class="badge done">Complete</span>';
        if (ch.status === "outline") html += '<span class="badge soon">outline</span>';
        html += "</span>";
        html += "<h3>" + escapeHtml(ch.title) + "</h3>";
        html += "<p>" + escapeHtml(ch.blurb) + "</p>";
        html += '<span class="meta">';
        if (ch.status === "full") {
          html += "<span>" + (c.total ? c.solved + " / " + c.total + " exercises" : ch.sections.length + " sections") + "</span>";
          var m = Play.count(ch.id);
          if (m.total) {
            html += '<span class="stars" title="Missions completed on this chapter\'s figures">★ ' +
              Math.min(m.done, m.total) + " / " + m.total + "</span>";
          }
        } else {
          html += "<span>" + ch.sections.length + " sections planned</span>";
        }
        html += "</span></span></a></li>";
      });
      html += "</ol></section>";
    });
    host.innerHTML = html;
    Store.emit({ type: "home", current: currentId });
  }

  /* turn the "Start" button into "Continue" once there is somewhere to continue to */
  function buildContinue() {
    var btn = document.querySelector("[data-continue]");
    if (!btn) return;
    var last = readStore(LAST_KEY, null);
    var ch = last && last.id && C.chapterById ? C.chapterById(last.id) : null;
    if (!ch) return;
    var sec = ch.sections.filter(function (s) { return s.id === last.section; })[0];
    var anchor = sec ? "#" + sec.id : (last.section === "practice" || last.section === "warmup" ? "#" + last.section : "");
    btn.setAttribute("href", ch.path + anchor);
    btn.textContent = "Continue: " + chapterName(ch) +
      (sec ? " · " + sec.title : last.section === "practice" ? " · Practice" : "") + " →";
  }

  function buildCourseStats() {
    var host = document.querySelector("[data-course-stats]");
    if (!host) return;
    var solved = 0, total = 0, chaptersDone = 0, full = 0;
    C.chapters.forEach(function (ch) {
      if (ch.status === "full") full++;
      var c = Progress.count(ch.id);
      solved += c.solved;
      total += c.total;
      if (c.total && c.solved >= c.total) chaptersDone++;
    });
    host.innerHTML = total
      ? "You have solved <b>" + solved + "</b> of the <b>" + total +
        "</b> exercises you have opened so far, and finished <b>" + chaptersDone + "</b> chapter" +
        (chaptersDone === 1 ? "" : "s") + "."
      : "Nothing solved yet — " + full + " chapters are written and waiting.";
  }

  /* ------------------------------------------------- header counters ----- */

  var FLAME = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8.2 1c.3 2.4 3.6 4 3.6 7.6A3.8 3.8 0 0 1 8 12.5a3.8 3.8 0 0 1-3.8-3.9c0-1.4.6-2.5 1.5-3.3.1 1 .6 1.7 1.3 1.9C6.7 5.1 7.1 2.9 8.2 1z"/></svg>';

  /* The game layer (assets/game.js) draws the full HUD: level, streak, combo, hearts.
     Without it, a plain counter: streak and today's XP against the daily goal, linking
     to the progress page. */
  function buildHud() {
    if (window.BMGame && typeof window.BMGame.hud === "function") {
      try { window.BMGame.hud(); return; } catch (e) { if (window.console) console.error("[BM] game HUD failed", e); }
    }
    var nav = document.querySelector(".topbar nav");
    if (!nav) return;
    var hud = nav.querySelector(".hud");
    if (!hud) {
      hud = document.createElement("a");
      hud.className = "hud";
      hud.href = rootPrefix() + "progress.html";
      nav.insertBefore(hud, nav.querySelector("[data-theme-toggle]"));
    }
    var streak = Activity.streak(), today = Activity.today(), goal = Activity.goal();
    var pct = Math.min(100, Math.round((today / goal) * 100));
    var words = "Your progress: " + streak + "-day streak, " + today + " of " + goal + " XP today";
    hud.setAttribute("aria-label", words);
    hud.setAttribute("title", words);
    hud.innerHTML =
      '<span class="hud-streak"' + (streak ? ' data-on="true"' : "") + ">" + FLAME + "<b>" + streak + "</b></span>" +
      '<span class="hud-goal"><span class="goal-ring" style="--pct:' + pct + '"' + (pct >= 100 ? ' data-full="true"' : "") +
      '></span><span class="hud-xp"><b>' + today + "</b> / " + goal + " XP</span></span>";
  }

  function toast(html, cls) {
    var host = document.querySelector(".toasts");
    if (!host) {
      host = document.createElement("div");
      host.className = "toasts";
      /* once the game layer owns announcements (one polite region, #bm-live), toasts are
         for the eyes only; without it they speak for themselves */
      if (window.BMGame) host.setAttribute("aria-hidden", "true");
      else {
        host.setAttribute("role", "status");
        host.setAttribute("aria-live", "polite");
      }
      document.body.appendChild(host);
    }
    var t = document.createElement("div");
    t.className = "toast" + (cls ? " " + cls : "");
    t.innerHTML = html;
    host.appendChild(t);
    setTimeout(function () {
      t.setAttribute("data-out", "true");
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 400);
    }, 2600);
  }
  window.BMToast = toast;

  /* the brand's words can then fold away on a narrow screen, leaving the glyph */
  function decorateTopbar() {
    var brand = document.querySelector(".topbar .brand");
    if (!brand || brand.querySelector(".brand-name")) return;
    slice(brand.childNodes).forEach(function (n) {
      if (n.nodeType !== 3 || !n.nodeValue.trim()) return;
      var span = document.createElement("span");
      span.className = "brand-name";
      span.textContent = n.nodeValue.trim();
      brand.replaceChild(span, n);
    });
  }

  /* ------------------------------------------------- where it is going ---- */

  /* How hard one exercise was for this reader, from 0 (right first time) to 1.
     null when there is nothing to go on. */
  function struggle(rec) {
    if (!rec || (!rec.tries && !rec.opened && !rec.skipped)) return null;
    var s;
    if (rec.solved) s = rec.first ? 0 : Math.min(0.8, 0.35 + 0.15 * Math.max(0, (rec.tries || 2) - 2));
    else s = rec.tries ? 0.7 : 0.45;
    if (rec.opened) s += 0.25;
    if ((rec.hints || 0) >= 2) s += 0.1;
    return Math.min(1, s);
  }

  var WEAK = 0.34, STRONG = 0.12;

  var Insights = {
    WEAK: WEAK,
    STRONG: STRONG,
    struggle: struggle,
    /* one row per section that has been attempted, wherever the questions were asked:
       a mixed-review problem counts towards the section it was drawn from */
    sections: function () {
      var all = Attempts.all(), map = {}, list = [];
      Object.keys(all).forEach(function (chId) {
        var recs = all[chId] && typeof all[chId] === "object" ? all[chId] : {};
        Object.keys(recs).forEach(function (key) {
          var rec = recs[key], sec = rec && rec.section;
          if (!sec || sec === "warmup") return;
          var owner = chId, sid = sec, cut = sec.indexOf("#");
          if (cut > -1) { owner = sec.slice(0, cut); sid = sec.slice(cut + 1); }
          var ch = C.chapterById ? C.chapterById(owner) : null;
          if (!ch) return;
          var idx = -1;
          ch.sections.forEach(function (s, i) { if (s.id === sid) idx = i; });
          var score = struggle(rec);
          if (idx < 0 || score === null) return;
          var id = owner + "#" + sid;
          var row = map[id];
          if (!row) {
            row = map[id] = {
              id: id, chapter: ch, section: ch.sections[idx],
              label: ch.label === "Interlude" ? "Interlude" : "§" + ch.label + "." + (idx + 1),
              path: ch.path + "#" + sid, n: 0, solved: 0, first: 0, sum: 0
            };
            list.push(row);
          }
          row.n++;
          row.sum += score;
          if (rec.solved) row.solved++;
          if (rec.first) row.first++;
        });
      });
      list.forEach(function (row) { row.score = row.sum / row.n; });
      /* the game layer may soften a section the reader has since repaired */
      if (typeof Insights.adjust === "function") {
        try { Insights.adjust(list); } catch (e) { if (window.console) console.error("[BM] insights adjust failed", e); }
      }
      return list;
    },
    weak: function () {
      return this.sections()
        .filter(function (r) { return r.score >= WEAK; })
        .sort(function (a, b) { return b.score - a.score || b.n - a.n; });
    },
    strong: function () {
      return this.sections()
        .filter(function (r) { return r.n >= 2 && r.score <= STRONG; })
        .sort(function (a, b) { return b.n - a.n; });
    }
  };
  window.BMInsights = Insights;

  /* A short note above the recap: how this chapter went, and which section to reread. */
  function chapterFeedback(chapter) {
    var recap = document.querySelector(".recap");
    if (!chapter || !recap) return;
    var box = document.querySelector(".chapter-feedback");
    var rows = Insights.sections().filter(function (r) { return r.chapter.id === chapter.id; });
    if (!rows.length) {
      if (box) box.parentNode.removeChild(box);
      return;
    }
    if (!box) {
      box = document.createElement("div");
      box.className = "chapter-feedback";
      recap.parentNode.insertBefore(box, recap);
    }
    var n = 0, first = 0;
    rows.forEach(function (r) { n += r.n; first += r.first; });
    var weak = rows.filter(function (r) { return r.score >= WEAK; })
      .sort(function (a, b) { return b.score - a.score; }).slice(0, 3);
    var html = '<span class="tag">How this chapter is going</span>' +
      "<p>Right first time on <b>" + first + "</b> of the <b>" + n + "</b> questions you have tried here.</p>";
    html += weak.length
      ? "<p>Worth another look: " + weak.map(function (r) {
          return '<a href="#' + escapeHtml(r.section.id) + '">' + escapeHtml(r.label + " " + r.section.title) + "</a>";
        }).join(", ") + ".</p>"
      : "<p>No section stands out as shaky so far.</p>";
    html += '<p><a href="' + rootPrefix() + 'progress.html">All your progress →</a></p>';
    box.innerHTML = html;
  }

  function initResetButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-action="reset-progress"]'), function (btn) {
      btn.addEventListener("click", function () {
        Progress.reset();
        Play.reset();
        Attempts.reset();
        Activity.reset();
        writeStore(LESSON_KEY, {});
        writeStore(GAME_KEY, {});
        writeStore(RUN_KEY, {});
        Store.emit({ type: "reset" });
        buildHud();
        btn.textContent = "Progress cleared";
        btn.disabled = true;
        buildHome();
        buildCourseStats();
      });
    });
  }

  /* --------------------------------------------------- exercise engine --- */

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  /* strip the noise readers add without changing meaning */
  function basicClean(s) {
    return String(s)
      .trim()
      .replace(/\s+/g, "")
      .replace(/[−–—]/g, "-")   /* unicode minus / dashes */
      .replace(/[×⋅]/g, "*")          /* × · */
      .replace(/√/g, "sqrt")               /* √ */
      .replace(/π/g, "pi")
      .replace(/≤/g, "<=")
      .replace(/≥/g, ">=")
      .replace(/≠/g, "!=")
      .toLowerCase();
  }

  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = b; b = a % b; a = t; } return a; }

  /* a number, a fraction a/b, or a simple signed decimal -> JS number */
  function toNumber(s) {
    var t = basicClean(s).replace(/\$/g, "").replace(/^\+/, "");
    if (t === "") return null;
    var frac = /^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(t);
    if (frac) {
      var den = parseFloat(frac[2]);
      if (den === 0) return null;
      return parseFloat(frac[1]) / den;
    }
    if (/^-?\d+(?:\.\d+)?$/.test(t)) return parseFloat(t);
    if (/^-?\.\d+$/.test(t)) return parseFloat(t);
    return null;
  }

  /* tol, when given on the exercise as data-tol, is an absolute tolerance —
     used where the expected answer is itself a rounded decimal. */
  function sameNumber(a, b, tol) {
    if (a === null || b === null) return false;
    if (tol) return Math.abs(a - b) <= tol + 1e-12;
    var scale = Math.max(1, Math.abs(a), Math.abs(b));
    return Math.abs(a - b) <= 1e-9 * scale;
  }

  /* algebraic expression: compare after removing cosmetic differences */
  function normExpr(s) {
    var t = basicClean(s)
      .replace(/\$/g, "")
      .replace(/\\left|\\right|\\,|\\!|\\;/g, "")
      .replace(/\\cdot|\\times/g, "*")
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)")
      .replace(/\\sqrt\{([^{}]*)\}/g, "sqrt($1)")
      .replace(/\\sqrt/g, "sqrt")
      .replace(/\{|\}/g, "")
      .replace(/\*/g, "")
      .replace(/^\((.*)\)$/, "$1");
    /* a plain sum may be written in any order: ac+bd and bd+ac are the same answer.
       Only safe when there are no brackets left to split through. */
    if (t.indexOf("+") > 0 && t.indexOf("(") === -1 && t.indexOf(")") === -1) {
      t = t.split("+").sort().join("+");
    }
    return t;
  }

  /* "2,-3" -> [-3, 2]; order never matters in a list of answers */
  function numberList(s) {
    var parts = basicClean(s).replace(/[{}]/g, "").split(/[,;]/).filter(function (x) { return x !== ""; });
    var nums = parts.map(toNumber);
    if (!nums.length || nums.some(function (n) { return n === null; })) return null;
    return nums.sort(function (a, b) { return a - b; });
  }

  function matches(given, answer, type, tol) {
    if (type === "number" || type === "fraction") {
      return sameNumber(toNumber(given), toNumber(answer), tol);
    }
    if (type === "set") {
      var ng = numberList(given), na = numberList(answer);
      if (!ng || !na || ng.length !== na.length) return false;
      return ng.every(function (v, i) { return sameNumber(v, na[i], tol); });
    }
    if (type === "expr") return normExpr(given) === normExpr(answer);
    /* "exact" / default: forgiving text compare */
    return basicClean(given).replace(/\.$/, "") === basicClean(answer).replace(/\.$/, "");
  }

  var TICK = '<svg class="tick" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5l4 4 8-9"/></svg>';

  function slice(list) { return Array.prototype.slice.call(list); }

  /* "|" separates alternative accepted answers — but an answer may itself contain
     a bar (|x|), so the unsplit string is always a candidate too. */
  function alternatives(raw) {
    raw = (raw || "").trim();
    return [raw].concat(raw.split("|"))
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s !== ""; });
  }

  /* Which section an exercise tests. Practice problems say so in data-section; an
     inline check belongs to the section whose heading it sits under. */
  function sectionOf(ex, inline) {
    var tagged = ex.getAttribute("data-section");
    if (tagged) return tagged;
    if (!inline) return "";
    var top = ex;
    while (top.parentNode && top.parentNode.tagName !== "MAIN") top = top.parentNode;
    if (!top.parentNode) return "";
    if (top.id === "warmup") return "warmup";
    for (var n = top.previousElementSibling; n; n = n.previousElementSibling) {
      if (n.tagName === "H2" && n.id) return n.id;
    }
    return "";
  }

  /* A fixed shuffle per exercise: the same scrambled order on every visit, and never
     the solved one. */
  function shuffled(n, seedText) {
    var seed = 7, i, order = [];
    for (i = 0; i < seedText.length; i++) seed = (seed * 31 + seedText.charCodeAt(i)) % 2147483647;
    for (i = 0; i < n; i++) order.push(i);
    for (i = n - 1; i > 0; i--) {
      seed = (seed * 48271) % 2147483647;
      var j = seed % (i + 1), t = order[i];
      order[i] = order[j]; order[j] = t;
    }
    if (n > 1 && order.every(function (v, k) { return v === k; })) order.push(order.shift());
    return order;
  }

  /* A clue is never charged, and no help pays more than effort. A right first check pays the
     first-time rate (and lights a combo pip, assets/game.js bonus) when no clue or only
     the first was opened before it: clue 1 says where to look and gives nothing away.
     After clue 2 or 3 it pays what a solve after a miss pays, and the combo neither
     gains nor loses. The record's `first` keeps its meaning (right on the first check,
     solution not open), since the struggle score and the achievements read it. */
  var CLUE_FREE = 1;
  function paysFirst(rec) {
    var rung = Number(rec && rec.rung);
    return !!(rec && rec.first && !rec.opened) && !(isFinite(rung) && rung > CLUE_FREE);
  }
  function xpFor(rec, inline) {
    if (rec.opened) return inline ? XP.inlineOpened : XP.opened;
    if (paysFirst(rec)) return inline ? XP.inlineFirst : XP.first;
    return inline ? XP.inline : XP.solved;
  }

  /* How one exercise's record changes on the road to its first correct answer, as pure
     functions of the record, so the rules can be held to on their own
     (tools/game/rules.test.js runs every road through them). initExercises applies them
     through Attempts.update, only while the exercise is unsolved. */
  var Road = {
    /* a check, right or wrong; `level` is the hint level the misses reached (`hints`) */
    check: function (a, ok, level, inline, section) {
      a.tries = (a.tries || 0) + 1;
      if (section) a.section = section;
      if (inline) a.inline = 1;
      if (level > (a.hints || 0)) a.hints = level;
      if (ok) {
        a.solved = Date.now();
        a.first = a.tries === 1 && !a.opened ? 1 : 0;
        delete a.skipped;
      }
      return a;
    },
    /* the solution opened before solving */
    reveal: function (a, inline, section) {
      a.opened = 1;
      if (section) a.section = section;
      if (inline) a.inline = 1;
      return a;
    },
    /* clue `rung` opened before solving: the highest is kept */
    clue: function (a, rung, inline, section) {
      var was = Number(a.rung);
      if (!(isFinite(was) && was >= rung)) a.rung = rung;
      if (section) a.section = section;
      if (inline) a.inline = 1;
      return a;
    }
  };

  function initExercises(chapter) {
    var exs = document.querySelectorAll(".ex");
    if (!exs.length) return;
    var chapterId = chapter ? chapter.id : document.body.getAttribute("data-chapter") || "misc";
    var saved = Progress.chapter(chapterId).solved;
    /* Inline checks ("Your turn", warm-ups) are practice in passing: graded, never scored. */
    var scored = Array.prototype.filter.call(exs, function (ex) { return !ex.hasAttribute("data-inline"); });
    var total = scored.length;
    Progress.setTotal(chapterId, total);

    var scoreEl = document.querySelector("[data-practice-score]");
    var sideEl = document.querySelector("[data-side-progress]");
    function solvedCount() {
      return Math.min(total, Object.keys(Progress.chapter(chapterId).solved).length);
    }
    function updateScore() {
      var n = solvedCount();
      if (scoreEl) scoreEl.innerHTML = "<b>" + n + "</b> of " + total + " solved";
      if (sideEl && total) {
        sideEl.hidden = false;
        sideEl.querySelector(".bar span").style.width = Math.round((n / total) * 100) + "%";
        sideEl.querySelector("p").textContent = n + " of " + total + " exercises solved";
      }
    }

    /* Positional keys ("e3") are what older saved progress uses, so the position counts
       only exercises without an id: anything added later carries an id and shifts nothing. */
    var position = 0, shown = 0, inlineCount = 0;

    Array.prototype.forEach.call(exs, function (ex) {
      var inline = ex.hasAttribute("data-inline");
      var key, num;
      if (inline) {
        inlineCount++;
        key = ex.id || "i" + inlineCount;
      } else {
        shown++;
        num = shown;
        if (ex.id) key = ex.id;
        else { position++; key = "e" + position; }
      }
      var type = ex.getAttribute("data-type") || "exact";
      var answers = alternatives(ex.getAttribute("data-answer"));
      var hint = ex.getAttribute("data-hint") || "";
      var hint2 = ex.getAttribute("data-hint2") || "";
      var hint3 = ex.getAttribute("data-hint3") || "";
      var tol = parseFloat(ex.getAttribute("data-tol") || "") || 0;
      var choices = ex.querySelector("ul.choices, ol.choices");
      var section = sectionOf(ex, inline);

      /* How the answer is given: typed, picked from tiles, put in order, written into
         blanks, or made on a figure. */
      var kind = choices ? (type === "multi" ? "multi" : "choice")
        : type === "order" || type === "blank" || type === "figure" ? type : "text";
      ex.setAttribute("data-kind", kind);
      ex.setAttribute("data-key", key);
      if (section && !ex.hasAttribute("data-section")) ex.setAttribute("data-section", section);

      /* number label */
      var labelText = inline ? (ex.getAttribute("data-label") || "Your turn") : "Exercise " + num;
      var numEl = document.createElement("span");
      numEl.className = "ex-num";
      numEl.textContent = labelText;
      ex.insertBefore(numEl, ex.firstChild);

      var solution = ex.querySelector(".ex-solution");
      var form = document.createElement("div");
      form.className = "ex-form";

      var inputEl = null, radios = [], blanks = [], orderList = null, orderItems = [], figure = null;

      if (choices) {
        /* turn <li> items into tap tiles: radios for one answer, checkboxes for several */
        var items = choices.querySelectorAll("li");
        var box = document.createElement("div");
        box.className = "choices" + (kind === "multi" ? " multi" : "");
        box.setAttribute("role", "group");
        Array.prototype.forEach.call(items, function (li, j) {
          var id = chapterId + "-" + key + "-c" + j;
          var label = document.createElement("label");
          label.className = "choice";
          label.setAttribute("for", id);
          var input = document.createElement("input");
          input.type = kind === "multi" ? "checkbox" : "radio";
          input.name = chapterId + "-" + key;
          input.id = id;
          input.value = String(j + 1);
          var span = document.createElement("span");
          span.innerHTML = li.innerHTML;
          label.appendChild(input);
          label.appendChild(span);
          box.appendChild(label);
          radios.push(input);
        });
        choices.parentNode.replaceChild(box, choices);
      } else if (kind === "order") {
        /* The list is authored in the right order and scrambled here. Each line can be
           dragged, or moved with its own buttons. */
        orderList = ex.querySelector("ol.order, ul.order");
        if (orderList) {
          var dragging = null;
          orderItems = slice(orderList.children);
          orderItems.forEach(function (li, j) {
            li.setAttribute("data-i", String(j));
            li.className = "order-item";
            var text = document.createElement("span");
            text.className = "order-text";
            while (li.firstChild) text.appendChild(li.firstChild);
            var grip = document.createElement("span");
            grip.className = "order-grip";
            grip.setAttribute("aria-hidden", "true");
            grip.textContent = "⋮⋮";
            function mover(label, glyph, fn) {
              var b = document.createElement("button");
              b.type = "button";
              b.className = "order-move";
              b.setAttribute("aria-label", label);
              b.textContent = glyph;
              b.addEventListener("click", function () { fn(); b.focus(); });
              return b;
            }
            li.appendChild(grip);
            li.appendChild(text);
            li.appendChild(mover("Move this line up", "↑", function () {
              var prev = li.previousElementSibling;
              if (prev) orderList.insertBefore(li, prev);
            }));
            li.appendChild(mover("Move this line down", "↓", function () {
              var next = li.nextElementSibling;
              if (next) orderList.insertBefore(next, li);
            }));
            li.setAttribute("draggable", "true");
            li.addEventListener("dragstart", function (e) {
              dragging = li;
              li.classList.add("dragging");
              if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = "move";
                try { e.dataTransfer.setData("text/plain", ""); } catch (err) { /* old browsers */ }
              }
            });
            li.addEventListener("dragend", function () { li.classList.remove("dragging"); dragging = null; });
            li.addEventListener("dragover", function (e) {
              if (!dragging || dragging === li) return;
              e.preventDefault();
              var r = li.getBoundingClientRect();
              var after = e.clientY > r.top + r.height / 2;
              orderList.insertBefore(dragging, after ? li.nextSibling : li);
            });
          });
          shuffled(orderItems.length, chapterId + key).forEach(function (i) { orderList.appendChild(orderItems[i]); });
        }
      } else if (kind === "blank") {
        slice(ex.querySelectorAll(".ex-q .blank")).forEach(function (span, j) {
          var inp = document.createElement("input");
          var key0 = span.getAttribute("data-answer") || "";
          inp.type = "text";
          inp.className = "blank";
          inp.setAttribute("autocomplete", "off");
          inp.setAttribute("autocapitalize", "off");
          inp.setAttribute("spellcheck", "false");
          inp.setAttribute("aria-label", "Blank " + (j + 1));
          inp.setAttribute("data-answer", key0);
          inp.setAttribute("data-type", span.getAttribute("data-type") || "number");
          inp.size = Math.max(2, parseInt(span.getAttribute("data-size") || "", 10) || key0.split("|")[0].length + 1);
          span.parentNode.replaceChild(inp, span);
          blanks.push(inp);
        });
      } else if (kind === "figure") {
        /* an ordinary figure, minus its missions; mountWidgets() fills it in */
        figure = document.createElement("div");
        figure.className = "widget";
        figure.setAttribute("data-widget", ex.getAttribute("data-figure") || "");
        figure.setAttribute("data-no-missions", "");
        var q = ex.querySelector(".ex-q");
        if (q) q.parentNode.insertBefore(figure, q.nextSibling);
        else ex.appendChild(figure);
      } else {
        inputEl = document.createElement("input");
        inputEl.type = "text";
        inputEl.setAttribute("autocomplete", "off");
        inputEl.setAttribute("autocapitalize", "off");
        inputEl.setAttribute("spellcheck", "false");
        inputEl.setAttribute("aria-label", inline ? "Your answer" : "Your answer to exercise " + num);
        inputEl.placeholder = ex.getAttribute("data-placeholder") || "your answer";
        form.appendChild(inputEl);
      }

      var checkBtn = document.createElement("button");
      checkBtn.type = "button";
      checkBtn.className = "btn";
      checkBtn.textContent = "Check";
      form.appendChild(checkBtn);

      var showBtn = document.createElement("button");
      showBtn.type = "button";
      showBtn.className = "btn ghost ex-show";
      showBtn.textContent = "Show solution";
      if (solution) form.appendChild(showBtn);

      /* the verdict, then (after a miss) a question about the answer and one offer */
      var feedback = document.createElement("div");
      feedback.className = "ex-feedback";
      feedback.setAttribute("role", "status");
      feedback.setAttribute("aria-live", "polite");
      feedback.setAttribute("aria-atomic", "true");

      if (solution) ex.insertBefore(form, solution);
      else ex.appendChild(form);
      ex.insertBefore(feedback, solution || null);
      if (solution) ex.appendChild(solution);

      /* wrong checks on this page view: what `hints` is written from, as it always was */
      var misses = 0;

      /* solved before now: progress saved before the attempt log existed has
         no attempt record, so the progress store counts as well */
      function solvedBefore() {
        return !!Attempts.get(chapterId, key).solved || (!inline && !!Progress.chapter(chapterId).solved[key]);
      }

      /* The help ladder (src/ui/ladder.ts, through window.BMLearn, which the chapter entry
         imports before this file): "Show a clue" in the form, before Show solution, and
         the clues it opens above the answer box. Without it (a page whose entry does not
         import it) the card works as before, minus the clues. */
      var Learn = window.BMLearn;
      var ladder = Learn && typeof Learn.mount === "function" ? Learn.mount({
        ex: ex, form: form, before: solution ? showBtn : null, hints: [hint, hint2, hint3],
        saved: Attempts.get(chapterId, key).rung, id: "bm-clues-" + chapterId + "-" + key, name: labelText,
        solved: function () { return solvedBefore() || ex.getAttribute("data-state") === "correct"; },
        /* the highest clue opened while unsolved, in the attempt record (never once solved) */
        persist: function (rung) {
          if (solvedBefore() || ex.getAttribute("data-state") === "correct") return;
          var rec = Attempts.update(chapterId, key, function (a) { Road.clue(a, rung, inline, section); });
          Store.emit({ type: "ladder", chapter: chapterId, key: key, section: section, inline: inline, rung: rec.rung });
        },
        render: renderMath, hasSolution: !!solution
      }) : null;

      function reveal() {
        if (!solution) return;
        solution.setAttribute("data-show", "true");
        showBtn.textContent = "Hide solution";
        showBtn.removeAttribute("data-suggested");
        /* for a put-in-order question the solution is the order itself */
        if (orderList) orderItems.forEach(function (li) { orderList.appendChild(li); });
        /* opening the solution before solving is worth knowing about */
        var already = Attempts.get(chapterId, key), done = solvedBefore();
        if (ex.getAttribute("data-state") !== "correct" && !done) {
          Attempts.update(chapterId, key, function (r) { Road.reveal(r, inline, section); });
        }
        Store.emit({
          type: "opened", chapter: chapterId, key: key, section: section, inline: inline,
          solved: done || ex.getAttribute("data-state") === "correct", tries: already.tries || 0, ex: ex
        });
      }
      function hide() {
        if (!solution) return;
        solution.removeAttribute("data-show");
        showBtn.textContent = "Show solution";
      }
      showBtn.addEventListener("click", function () {
        if (solution.getAttribute("data-show") === "true") hide(); else reveal();
      });

      function say(html) {
        feedback.innerHTML = html;
        feedback.setAttribute("data-show", "true");
      }
      function verdict(kind, html) {
        return '<p class="ex-verdict ' + kind + '" data-kind="' + kind + '">' + html + "</p>";
      }
      /* how the first correct answer came: first try, after misses, or with the solution open */
      function resultOf(rec) {
        if (!rec || !rec.solved) return "";
        return rec.first ? "first" : rec.opened ? "assisted" : "retry";
      }

      function markCorrect(fromStorage) {
        ex.setAttribute("data-state", "correct");
        var result = resultOf(Attempts.get(chapterId, key));
        if (result) ex.setAttribute("data-result", result);
        else ex.removeAttribute("data-result");
        if (fromStorage) ex.setAttribute("data-restored", "true");
        else ex.removeAttribute("data-restored");
        if (orderList) orderItems.forEach(function (li) { orderList.appendChild(li); });
        blanks.forEach(function (b) { b.setAttribute("data-ok", "true"); b.removeAttribute("aria-invalid"); });
        if (solution) showBtn.removeAttribute("data-suggested");
        say(verdict("ok", TICK + " Correct.") +
          (solution ? '<p class="ex-next hint">Compare your reasoning with the solution below.</p>' : ""));
        if (!fromStorage && !inline) {
          var before = solvedCount();
          Progress.markSolved(chapterId, key);
          updateScore();
          if (total && before < total && solvedCount() >= total) chapterDone(chapter, true);
        }
        if (!fromStorage) Store.emit({ type: "solved", chapter: chapterId, key: key, inline: inline });
      }

      /* what the reader has put in: { given } or { empty: a nudge to finish answering } */
      function read() {
        if (radios.length) {
          var picked = radios.filter(function (r) { return r.checked; }).map(function (r) { return r.value; });
          if (!picked.length) {
            return { empty: kind === "multi" ? "Choose every option that applies first." : "Choose one of the options first." };
          }
          return { given: picked.join(",") };
        }
        if (kind === "order") {
          return { given: orderList ? slice(orderList.children).map(function (li) { return li.getAttribute("data-i"); }).join(",") : "" };
        }
        if (kind === "blank") {
          var vals = blanks.map(function (b) { return b.value; });
          if (vals.some(function (v) { return v.trim() === ""; })) return { empty: "Fill in every blank, then press Check." };
          return { given: vals };
        }
        if (kind === "figure") {
          return { given: figure && typeof figure.__answer === "function" ? String(figure.__answer()) : "" };
        }
        if (String(inputEl.value).trim() === "") return { empty: "Type an answer, then press Check." };
        return { given: inputEl.value };
      }

      function judge(given) {
        if (kind === "order") {
          return given === orderItems.map(function (li, j) { return String(j); }).join(",");
        }
        if (kind === "blank") {
          var all = true;
          blanks.forEach(function (b, j) {
            var ok = alternatives(b.getAttribute("data-answer")).some(function (a) {
              return matches(given[j], a, b.getAttribute("data-type"), tol);
            });
            b.setAttribute("data-ok", ok ? "true" : "false");
            if (!ok) all = false;
          });
          return all;
        }
        var cmp = kind === "choice" ? "number" : kind === "multi" ? "set"
          : kind === "figure" ? (ex.getAttribute("data-compare") || "exact") : type;
        return answers.some(function (a) { return matches(given, a, cmp, tol); });
      }

      /* A question about a wrong answer (src/learn/detectors.ts), graded by this card's own
         key, type and tolerance; null when no slip it knows explains the answer. Typed
         answers and blanks are asked about, and a tick-every-option list that is missing
         one; the rest (one option, an order, a figure) have no slip to name. */
      function question(given) {
        if (!Learn || typeof Learn.detect !== "function") return null;
        var on = function (keys, cmp) {
          return function (c) { return keys.some(function (a) { return matches(c, a, cmp, tol); }); };
        };
        if (kind === "text") return Learn.detect({ given: given, kind: "text", type: type, answers: answers, grade: on(answers, type) });
        if (kind === "multi") return Learn.detect({ given: given, kind: "multi", type: "multi", answers: answers, grade: on(answers, "set") });
        if (kind === "blank") {
          for (var j = 0; j < blanks.length; j++) {
            if (blanks[j].getAttribute("data-ok") !== "false") continue;
            var keys = alternatives(blanks[j].getAttribute("data-answer")), bt = blanks[j].getAttribute("data-type");
            var d = Learn.detect({ given: given[j], kind: "text", type: bt, answers: keys, grade: on(keys, bt) });
            if (d) return d;
          }
        }
        return null;
      }

      function check() {
        var r = read();
        if (r.empty) {
          /* the clues stay open above; the nudge replaces the last verdict */
          say(verdict("nudge", r.empty));
          return;
        }
        var ok = judge(r.given);
        /* `hints` follows misses, so a wrong re-check after a correct answer starts at the first */
        if (!ok) misses++;
        var level = ok ? 0 : misses === 1 && hint ? 1 : misses === 2 && hint2 ? 2 : 0;
        /* only the road to the first correct answer is recorded; re-solving changes nothing */
        if (!solvedBefore()) {
          var rec = Attempts.update(chapterId, key, function (a) { Road.check(a, ok, level, inline, section); });
          Store.emit({
            type: "attempt", chapter: chapterId, key: key, section: section, inline: inline,
            correct: ok, tryNo: rec.tries, hintLevel: rec.hints || 0, solutionOpen: !!rec.opened
          });
          if (ok) {
            /* the game layer adds the combo's share on top of the ordinary award */
            var base = xpFor(rec, inline), extra = null;
            if (window.BMGame && typeof window.BMGame.bonus === "function") {
              try {
                extra = window.BMGame.bonus({
                  chapter: chapterId, key: key, section: section, inline: inline, rec: rec, base: base, ex: ex
                });
              } catch (e) { if (window.console) console.error("[BM] game bonus failed", e); }
            }
            var bonus = extra && extra.bonus > 0 ? Math.round(extra.bonus) : 0;
            Activity.add(base + bonus, inline ? "check" : "exercise", bonus ? { bonus: bonus, mult: extra.mult } : null);
          }
        }
        if (ok) {
          if (ladder) ladder.afterRight();
          markCorrect(false);
        } else {
          /* drop and re-set the state so the shake replays on every miss */
          ex.removeAttribute("data-state");
          void ex.offsetWidth;
          ex.setAttribute("data-state", "wrong");
          blanks.forEach(function (b) {
            if (b.getAttribute("data-ok") === "false") b.setAttribute("aria-invalid", "true");
            else b.removeAttribute("aria-invalid");
          });
          /* The verdict at once; then a question, when the answer looks like a known slip;
             then one line saying what help is there. No clue opens by itself: the next
             one is the learner's to ask for, with the button above. */
          var after = ladder
            ? ladder.afterWrong(r.given, question(r.given))
            : '<p class="ex-next hint">Not yet. Work it through once more' + (solution ? ", or open the solution." : ".") + "</p>";
          /* every clue open (or none to open): the solution button is the suggestion */
          if (solution && !(ladder && Learn.ladder.canOpen(ladder.state))) showBtn.setAttribute("data-suggested", "true");
          say(verdict("no", "✗ Not right.") + after);
          renderMath(feedback);
        }
      }

      checkBtn.addEventListener("click", check);
      [inputEl].concat(blanks).forEach(function (field) {
        if (!field) return;
        field.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); check(); }
        });
      });

      /* scored exercises come back from the progress store; inline checks from the
         attempt log, so a chapter read in steps can be picked up where it was left */
      if (inline ? Attempts.get(chapterId, key).solved : saved[key]) markCorrect(true);
    });

    updateScore();
    if (total && solvedCount() >= total) chapterDone(chapter, false);
  }

  /* The moment a chapter's last exercise is solved. `fresh` plays the burst once;
     a revisit to a finished chapter gets the banner without it. */
  function chapterDone(chapter, fresh) {
    var practice = document.getElementById("practice");
    if (!practice || document.querySelector(".chapter-done")) return;
    Store.emit({ type: "chapterDone", chapter: chapter ? chapter.id : null, fresh: !!fresh });
    /* an encounter (assets/encounter.js) plays its own finish inside the practice set */
    if (window.BMEncounter && window.BMEncounter.active) fresh = false;
    var list = C.chapters || [], next = null;
    if (chapter) list.forEach(function (ch, k) { if (ch.id === chapter.id) next = list[k + 1] || null; });
    var box = document.createElement("div");
    box.className = "chapter-done";
    box.setAttribute("role", "status");
    var html = "";
    if (fresh) {
      html += '<span class="burst" aria-hidden="true">';
      for (var i = 0; i < 12; i++) html += '<i style="--i:' + i + '"></i>';
      html += "</span>";
    }
    html += "<b>" + (chapter ? escapeHtml(chapter.label === "Interlude" ? "Interlude" : "Chapter " + chapter.label) : "Chapter") +
      " complete.</b> Every exercise here is solved. ";
    html += next
      ? 'Next: <a href="' + rootPrefix() + escapeHtml(next.path) + '">' +
        escapeHtml((next.label === "Interlude" ? "" : next.label + ". ") + next.title) + " →</a>"
      : "That was the last chapter — the whole course is behind you.";
    box.innerHTML = html;
    var recap = document.querySelector(".recap");
    if (recap && recap.parentNode) recap.parentNode.insertBefore(box, recap);
    else practice.parentNode.insertBefore(box, practice.nextSibling);
    if (fresh && box.scrollIntoView) {
      var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      try { box.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" }); } catch (e) { box.scrollIntoView(); }
    }
  }

  /* ----------------------------------------------------- opening puzzle --- */

  /* <div class="puzzle"> holds a question and <ul class="guess"> of options. Picking one
     is a commitment, not a graded answer; the recap's .puzzle-answer returns to it. */
  function initPuzzle(chapter) {
    var box = document.querySelector(".puzzle");
    if (!box || !chapter) return;
    var list = box.querySelector("ul.guess");
    var after = box.querySelector(".puzzle-after");
    var back = document.querySelector(".puzzle-answer [data-your-guess]");
    if (!list) return;
    var items = Array.prototype.slice.call(list.querySelectorAll("li"));
    var wrap = document.createElement("div");
    wrap.className = "guess";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Your guess");
    var btns = items.map(function (li, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "guess-chip";
      b.innerHTML = li.innerHTML;
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () { pick(i, true); });
      wrap.appendChild(b);
      return b;
    });
    list.parentNode.replaceChild(wrap, list);
    function pick(i, store) {
      if (!btns[i]) return;
      btns.forEach(function (b, j) { b.setAttribute("aria-pressed", j === i ? "true" : "false"); });
      if (after) after.hidden = false;
      if (back) {
        back.innerHTML = "You guessed: <b>" + btns[i].innerHTML + "</b>.";
        back.hidden = false;
      }
      if (store) Play.setGuess(chapter.id, i);
    }
    if (after) after.hidden = true;
    if (back) back.hidden = true;
    var g = Play.chapter(chapter.id).guess;
    if (g !== null) pick(g, false);
  }

  /* ------------------------------------------------------------- widgets - */

  function mountWidgets() {
    var reg = window.BMWidgets;
    if (!reg) return;
    Array.prototype.forEach.call(document.querySelectorAll("[data-widget]"), function (host) {
      var name = host.getAttribute("data-widget");
      var fn = reg[name];
      if (typeof fn !== "function") {
        host.innerHTML = '<p class="hint-drag">Interactive figure “' + escapeHtml(name) + '” is not available.</p>';
        return;
      }
      try {
        fn(host);
        watchFirstView(host);
      } catch (e) {
        host.innerHTML = '<p class="hint-drag">This figure failed to load.</p>';
        if (window.console) console.error("[BM] widget " + name + " failed", e);
      }
    });
  }

  /* flag a figure the first time it scrolls into view, so its handles can announce themselves */
  function watchFirstView(host) {
    if (!("IntersectionObserver" in window)) return;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        host.setAttribute("data-inview", "true");
        obs.disconnect();
      });
    }, { threshold: 0.5 });
    obs.observe(host);
  }

  /* ---------------------------------------------------------------- go --- */

  function init() {
    initTheme();
    var chapter = chapterOf(document.body);
    if (chapter) {
      document.body.setAttribute("data-part", chapter.part.id);
      /* opening a chapter is enough to make it the place to continue from */
      var last = readStore(LAST_KEY, null);
      if (!last || last.id !== chapter.id) writeStore(LAST_KEY, { id: chapter.id, section: null });
    }
    decorateTopbar();
    buildHud();
    buildSidebar(chapter);
    buildChapterNav(chapter);
    buildHome();
    buildContinue();
    buildCourseStats();
    initResetButtons();
    initPuzzle(chapter);
    initExercises(chapter);
    mountWidgets();
    if (chapter && window.BMMissions) Play.setTotal(chapter.id, window.BMMissions.total());
    chapterFeedback(chapter);
    renderMath(document.body);

    Store.on(function (c) {
      if (c.type === "xp") {
        buildHud();
        toast("<b>+" + c.xp + " XP</b>" + (c.bonus ? ' <span class="toast-combo">combo ×' + c.mult + "</span>" : ""));
        if (c.goalMet) toast("Daily goal reached: <b>" + Activity.goal() + " XP</b> today.", "goal");
      } else if (c.type === "attempt") {
        chapterFeedback(chapter);
      } else if (c.type === "sync") {
        /* an account just merged another device's progress into this one */
        buildHud();
        buildHome();
        buildContinue();
        buildCourseStats();
        chapterFeedback(chapter);
      } else if (c.type === "state" && c.key === ACTIVITY_KEY) {
        buildHud();
      }
    });
  }
  /* grade one answer against a key with `|` alternatives, exactly as the exercises do */
  function grade(given, answer, type, tol) {
    return alternatives(answer).some(function (a) { return matches(given, a, type || "exact", tol || 0); });
  }
  /* redraw everything built from saved state, after the game layer changes it */
  function refresh() {
    buildHud();
    buildHome();
    buildContinue();
    buildCourseStats();
    chapterFeedback(chapterOf(document.body));
  }
  window.BMSite = {
    rootPrefix: rootPrefix, escapeHtml: escapeHtml, chapterName: chapterName, dayKey: dayKey,
    chapterOf: function () { return chapterOf(document.body); },
    grade: grade, matches: matches, refresh: refresh, renderMath: renderMath, XP: XP, xpFor: xpFor,
    paysFirst: paysFirst, road: Road
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
