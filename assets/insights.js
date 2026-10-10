/* ===========================================================================
   Basic Mathematics — feedback pages
   progress.html  the reader's own dashboard, built from what this browser has
                  saved (so it works signed out): streak, XP, areas to strengthen.
   insights.html  the author's view across all signed-in readers, from the
                  aggregate functions in supabase/schema.sql. Admins only.
   =========================================================================== */
(function () {
  "use strict";

  var C = window.BM_CURRICULUM, Site = window.BMSite, Store = window.BMStore;
  var Progress = window.BMProgress, Play = window.BMPlay, Activity = window.BMActivity;
  var Insights = window.BMInsights, Account = window.BMAccount, Game = window.BMGame;
  if (!C || !Site || !Store) return;
  var esc = Site.escapeHtml;

  function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

  function tile(label, value, sub, extra) {
    return '<div class="stat"' + (extra || "") + '><span class="stat-label">' + label + "</span>" +
      '<span class="stat-value">' + value + "</span>" +
      (sub ? '<span class="stat-sub">' + sub + "</span>" : "") + "</div>";
  }

  /* a thin horizontal meter; the number it encodes is always written beside it */
  function meter(value, tone) {
    return '<span class="meter"' + (tone ? ' data-tone="' + tone + '"' : "") + '><span style="width:' +
      Math.max(0, Math.min(100, value)) + '%"></span></span>';
  }

  /* ----------------------------------------------------- reader dashboard -- */

  var page = document.querySelector("[data-progress]");

  function lastDays(n) {
    var days = Activity.all().days, out = [], d = new Date();
    d.setDate(d.getDate() - (n - 1));
    for (var i = 0; i < n; i++) {
      out.push({ key: Site.dayKey(d), date: new Date(d.getTime()), xp: days[Site.dayKey(d)] || 0 });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  function activityChart() {
    var days = lastDays(14), goal = Activity.goal();
    var top = Math.max(goal, Math.max.apply(null, days.map(function (d) { return d.xp; }))) * 1.1;
    var html = '<div class="daychart" role="img" aria-label="XP earned on each of the last 14 days">';
    html += '<span class="daychart-goal" style="bottom:' + (goal / top) * 100 + '%"><i>goal ' + goal + "</i></span>";
    days.forEach(function (d, i) {
      var label = d.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      html += '<span class="day" tabindex="0"' + (i === days.length - 1 ? ' data-today="true"' : "") +
        (d.xp >= goal ? ' data-met="true"' : "") + ' data-tip="' + esc(label + ": " + d.xp + " XP") + '">' +
        '<span class="day-bar" style="height:' + (d.xp ? Math.max(3, (d.xp / top) * 100) : 0) + '%"></span>' +
        '<span class="day-name">' + esc(d.date.toLocaleDateString(undefined, { weekday: "narrow" })) + "</span></span>";
    });
    html += "</div>";
    var active = days.filter(function (d) { return d.xp > 0; }).length;
    var met = days.filter(function (d) { return d.xp >= goal; }).length;
    html += '<p class="chart-note">Active on ' + plural(active, "day") + " of the last 14; daily goal met on " + met + ".</p>";
    return html;
  }

  function sectionRow(r, weak) {
    var detail = r.first + " of " + r.n + " right the first time";
    if (r.solved < r.n) detail += " · " + (r.n - r.solved) + " not solved yet";
    return '<li class="area">' +
      '<a class="area-title" href="' + esc(r.path) + '"><span class="area-label">' + esc(r.label) + "</span> " +
      esc(r.section.title) + "</a>" +
      '<span class="area-chapter">' + esc(Site.chapterName(r.chapter) + " · " + r.chapter.title) + "</span>" +
      '<span class="area-meter">' + meter(pct(r.first, r.n), weak ? "weak" : "ok") +
      '<span class="area-detail">' + detail + "</span></span>" +
      (weak ? '<a class="btn ghost small" href="' + esc(r.path) + '">Reread</a>' : "") +
      /* the Arena's untimed Repair: fresh problems on this one section */
      (weak && Game ? '<a class="btn ghost small" href="arena.html?repair=' + encodeURIComponent(r.id) + '">Repair (untimed)</a>' : "") +
      "</li>";
  }

  function chapterTable() {
    var first = {}, tried = {};
    Insights.sections().forEach(function (r) {
      first[r.chapter.id] = (first[r.chapter.id] || 0) + r.first;
      tried[r.chapter.id] = (tried[r.chapter.id] || 0) + r.n;
    });
    var cols = Game ? 5 : 4;
    var html = '<div class="tbl-wrap"><table class="chapters"><thead><tr><th>Chapter</th><th>Exercises</th>' +
      '<th class="num">Missions</th><th class="num">Right the first time</th>' +
      (Game ? '<th class="num">Medal</th>' : "") + "</tr></thead><tbody>";
    C.parts.forEach(function (part) {
      html += '<tr class="part-row" data-part="' + esc(part.id) + '"><th colspan="' + cols + '">Part ' + part.num + " — " + esc(part.name) + "</th></tr>";
      part.chapters.forEach(function (ch) {
        var c = Progress.count(ch.id), m = Play.count(ch.id);
        html += '<tr data-part="' + esc(part.id) + '"><td><a href="' + esc(ch.path) + '">' +
          esc((ch.label === "Interlude" ? "" : ch.label + ". ") + ch.title) + "</a></td>";
        html += '<td class="cell-meter">' + (c.total
          ? meter(pct(c.solved, c.total), "part") + "<span>" + c.solved + " / " + c.total + "</span>"
          : '<span class="muted">not opened</span>') + "</td>";
        html += '<td class="num">' + (m.total ? "★ " + Math.min(m.done, m.total) + " / " + m.total : "—") + "</td>";
        html += '<td class="num">' + (tried[ch.id] ? pct(first[ch.id], tried[ch.id]) + "%" : "—") + "</td>";
        if (Game) {
          var md = Game.medal(ch.id, "practice");
          html += '<td class="num cell-medal"' + (md ? ' data-medal="' + md + '"' : "") + ">" +
            (md ? (Game.stars ? Game.stars(md, true) : '<span aria-hidden="true">' + new Array(md + 1).join("★") + "</span>") +
              " " + Game.MEDALS[md] : "—") + "</td>";
        }
        html += "</tr>";
      });
    });
    return html + "</tbody></table></div>";
  }

  /* -------------------------------------------------- game layer panels -- */

  function dayLabel(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
    if (!m) return "";
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  /* what the Arena's spaced review says: what is due, what is holding, how recall is going */
  function recallPanel() {
    var deck = Game.deck(), sec = Game.game().sec, ids = Object.keys(sec);
    var html = '<section class="panel" id="recall"><h2>Recall</h2>';
    if (!deck.length) {
      /* solves saved before the course kept a record of each try name no section, so
         they cannot join the deck: say so rather than claim nothing is solved */
      var solvedAny = C.chapters.some(function (ch) { return Progress.count(ch.id).solved > 0; });
      return html + '<p class="muted">' + (solvedAny
        ? "Recall picks up a section once you have solved two of its questions on the chapter page, or one practice " +
          "problem first time (solves saved before this browser kept a record of each try do not count). Sections in play come back "
        : "Recall starts once you have solved something: sections you have solved come back ") +
        "in the Arena at widening gaps (1, 3, 7, 14 and 30 days), which is what makes them stick.</p></section>";
    }
    var due = deck.filter(function (d) { return d.due; }), holding = 0, n = 0, ok = 0, last = "";
    ids.forEach(function (id) {
      var s = sec[id] || {};
      if ((s.box || 0) >= 3) holding++;
      n += s.n || 0;
      ok += Math.min(s.ok || 0, s.n || 0);
      /* only a section the Arena has asked about (n > 0): a placement-check seed sets last too */
      if ((s.n || 0) > 0 && s.last && s.last > last) last = s.last;
    });
    html += '<div class="stats">';
    html += tile("Due now", due.length, plural(deck.length, "section") + " in play");
    html += tile("Holding", holding, "sections in box 4 or 5");
    html += tile("Last practiced", last ? esc(dayLabel(last)) : "—", last ? "in the Arena" : "no Arena run yet");
    html += tile("First-try recall", n ? ok + "<small> / " + n + "</small>" : "—", n ? pct(ok, n) + "% of Arena answers" : "");
    html += "</div>";
    if (due.length) {
      html += '<p class="muted">Due for review: ' + due.slice(0, 6).map(function (d) {
        return '<a href="' + esc(d.path) + '">' + esc(d.label + " " + d.title) + "</a>";
      }).join(", ") + (due.length > 6 ? " and " + (due.length - 6) + " more" : "") +
        '. <a href="arena.html?mode=review">Start a due review →</a></p>';
    }
    return html + "</section>";
  }

  function achievementsPanel() {
    var S = Game.stores(), ach = S.game.ach, got = 0;
    var items = Game.ACHIEVEMENTS.map(function (a) {
      var at = ach[a.id], p = a.progress(S);
      if (at) got++;
      return '<li class="ach" data-id="' + esc(a.id) + '"' + (at ? ' data-unlocked="true"' : "") + ">" +
        '<span class="ach-title">' + esc(a.title) + "</span>" +
        '<span class="ach-text">' + esc(a.text) + "</span>" +
        '<span class="ach-meta">' + (at
          ? "Unlocked " + esc(new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }))
          : meter(pct(p[0], p[1])) + "<span>" + p[0] + " / " + p[1] + "</span>") + "</span></li>";
    });
    return '<section class="panel" id="achievements"><div class="panel-head"><h2>Achievements</h2>' +
      '<span class="muted">' + got + " of " + items.length + " unlocked</span></div>" +
      '<ul class="achievements">' + items.join("") + "</ul></section>";
  }

  /* "Your plan", first on the page and only when a take exists: BMPlan.render leaves the
     slot empty without one, and then there is no panel at all (no invitation here; the
     check is not linked from this page). The h2 and h3 keep BMPlan's h4 heads in order. */
  function planPanel() {
    var Plan = window.BMPlan;
    if (!Plan || typeof Plan.render !== "function") return;
    var slot = document.createElement("div");
    slot.className = "diag-plan";
    try { Plan.render(slot); } catch (e) { return; }
    if (!slot.firstChild) return;
    var sec = document.createElement("section");
    sec.className = "panel";
    sec.id = "plan";
    var h2 = document.createElement("h2");
    h2.textContent = "Your plan";
    var h3 = document.createElement("h3");
    h3.className = "plan-sub muted";
    h3.textContent = "From your placement check";
    sec.appendChild(h2);
    sec.appendChild(h3);
    sec.appendChild(slot);
    page.insertBefore(sec, page.firstChild);
  }

  function drawProgress() {
    var solved = 0, total = 0, done = 0, stars = 0;
    C.chapters.forEach(function (ch) {
      var c = Progress.count(ch.id);
      solved += c.solved; total += c.total;
      if (c.total && c.solved >= c.total) done++;
      stars += Math.min(Play.count(ch.id).done, Play.count(ch.id).total || Infinity);
    });
    var streak = Activity.streak(), today = Activity.today(), goal = Activity.goal();
    var weak = Insights.weak(), strong = Insights.strong(), rows = Insights.sections();
    var tried = 0, first = 0;
    rows.forEach(function (r) { tried += r.n; first += r.first; });

    var html = '<div class="stats">';
    html += tile("Streak", streak, streak === 1 ? "day" : "days", streak ? ' data-on="true"' : "");
    html += tile("Today", today + '<small> / ' + goal + " XP</small>",
      today >= goal ? "Goal reached" : (goal - today) + " XP to go");
    if (Game) {
      var lv = Game.info();
      html += tile("Level", lv.level, esc(lv.rank) + " · " + lv.into + " / " + lv.span + " XP to level " + (lv.level + 1),
        ' data-level="' + lv.level + '"');
    } else {
      html += tile("Total XP", Activity.total(), "");
    }
    html += tile("Exercises solved", solved, plural(done, "chapter") + " finished");
    html += tile("Right the first time", tried ? pct(first, tried) + "%" : "—", tried ? "of " + tried + " questions tried" : "nothing tried yet");
    html += tile("Missions", "★ " + stars, "on the figures");
    html += "</div>";

    html += '<section class="panel"><div class="panel-head"><h2>Last 14 days</h2>' +
      '<div class="goal-pick ui" role="group" aria-label="Daily goal">Daily goal ';
    [15, 30, 50, 80].forEach(function (g) {
      html += '<button type="button" class="chip" data-goal="' + g + '" aria-pressed="' + (g === goal) + '">' + g + " XP</button>";
    });
    html += "</div></div>" + activityChart() + "</section>";

    html += '<section class="panel"><h2>Areas to strengthen</h2>';
    if (!rows.length) {
      html += '<p class="muted">Nothing to go on yet. Work a few of the <b>Your turn</b> questions or a practice set, and this ' +
        'page will say which sections went smoothly and which are worth rereading. ' +
        '<a href="parts/1-algebra/01-numbers.html">Start with Chapter 1 →</a></p>';
    } else if (!weak.length) {
      html += '<p>No section stands out as shaky. Keep going — the next chapter is the best test of this one.</p>';
    } else {
      html += '<p class="muted">Sections where answers took several tries, a hint, or a look at the solution. ' +
        "The usual cure is to reread the section and redo its worked example on paper.</p>";
      html += '<ol class="areas">' + weak.slice(0, 8).map(function (r) { return sectionRow(r, true); }).join("") + "</ol>";
    }
    html += "</section>";

    if (strong.length) {
      html += '<section class="panel"><h2>Going well</h2><ol class="areas">' +
        strong.slice(0, 6).map(function (r) { return sectionRow(r, false); }).join("") + "</ol></section>";
    }

    html += '<section class="panel"><h2>Chapter by chapter</h2>' + chapterTable() + "</section>";
    if (Game) html += recallPanel() + achievementsPanel();

    /* says where the page's data comes from, without inviting sign-up (decision 0003) */
    if (Account && Account.configured && !Account.user()) {
      html += '<p class="muted">This page is built from what this browser has saved.</p>';
    }
    page.innerHTML = html;
    planPanel();
    Array.prototype.forEach.call(page.querySelectorAll("[data-goal]"), function (b) {
      b.addEventListener("click", function () {
        Activity.setGoal(b.getAttribute("data-goal"));
        drawProgress();
      });
    });
  }

  if (page && Progress && Play && Activity && Insights) {
    drawProgress();
    Store.on(function (c) {
      if (c.type === "sync" || c.type === "reset" || c.type === "achievement" || c.type === "level") drawProgress();
    });
    if (Account) Account.onChange(drawProgress);
  }

  /* --------------------------------------------------------- author's view -- */

  var owner = document.querySelector("[data-owner-insights]");
  if (!owner) return;

  function chapterLabel(id) {
    var ch = C.chapterById(id);
    return ch ? (ch.label === "Interlude" ? "Interlude" : "Ch " + ch.label) : id;
  }
  function sectionLabel(chapterId, sec) {
    if (!sec) return "—";
    var owner0 = chapterId, sid = sec, cut = sec.indexOf("#");
    if (cut > -1) { owner0 = sec.slice(0, cut); sid = sec.slice(cut + 1); }
    var ch = C.chapterById(owner0), title = sid;
    if (ch) ch.sections.forEach(function (s, i) {
      if (s.id === sid) title = (ch.label === "Interlude" ? "" : "§" + ch.label + "." + (i + 1) + " ") + s.title;
    });
    return title;
  }

  var COLS = [
    { key: "chapter", name: "Chapter", text: true },
    { key: "ex_key", name: "Exercise", text: true },
    { key: "section", name: "Section", text: true },
    { key: "learners", name: "Readers" },
    { key: "firstRate", name: "First try", rate: true },
    { key: "solvedRate", name: "Solved", rate: true },
    { key: "hintRate", name: "Hint", rate: true },
    { key: "openRate", name: "Solution opened", rate: true },
    { key: "avg_tries", name: "Avg tries" }
  ];
  var sortKey = "firstRate", sortDir = 1, stats = [], chapters = [];

  function drawOwner() {
    var order = {};
    C.chapters.forEach(function (ch, i) { order[ch.id] = i; });
    var rows = stats.slice().sort(function (a, b) {
      var x = a[sortKey], y = b[sortKey];
      if (sortKey === "chapter") { x = order[x]; y = order[y]; }
      return (x < y ? -1 : x > y ? 1 : 0) * sortDir || b.learners - a.learners;
    });
    var readers = Math.max.apply(null, [0].concat(chapters.map(function (c) { return Number(c.learners); })));

    var html = '<section class="panel"><h2>Readers reaching each chapter</h2>';
    if (!chapters.length) html += '<p class="muted">No signed-in reader has checked an answer yet.</p>';
    else {
      html += '<ol class="funnel">';
      C.chapters.forEach(function (ch) {
        var c = chapters.filter(function (x) { return x.chapter === ch.id; })[0];
        var n = c ? Number(c.learners) : 0;
        html += '<li><span class="funnel-name">' + esc(chapterLabel(ch.id) + " · " + ch.title) + "</span>" +
          meter(pct(n, readers)) + '<span class="funnel-n">' + n + (c && Number(c.active_7d) ? " (" + c.active_7d + " this week)" : "") + "</span></li>";
      });
      html += "</ol>";
    }
    html += "</section>";

    html += '<section class="panel"><h2>Exercise by exercise</h2>' +
      '<p class="muted">Sorted with the lowest first-try rate on top: these are the questions — or the sections behind them — ' +
      "most worth rewriting. Click a heading to sort by it.</p>";
    html += '<div class="tbl-wrap"><table class="owner"><thead><tr>';
    COLS.forEach(function (c) {
      html += "<th" + (c.text ? "" : ' class="num"') + ' aria-sort="' +
        (c.key === sortKey ? (sortDir > 0 ? "ascending" : "descending") : "none") + '">' +
        '<button type="button" class="link" data-sort="' + c.key + '">' + c.name + "</button></th>";
    });
    html += "</tr></thead><tbody>";
    rows.forEach(function (r) {
      var ch = C.chapterById(r.chapter);
      html += "<tr><td>" + (ch ? '<a href="' + esc(ch.path) + '">' + esc(chapterLabel(r.chapter)) + "</a>" : esc(r.chapter)) + "</td>" +
        "<td><code>" + esc(r.ex_key) + "</code>" + (r.inline ? ' <span class="badge">inline</span>' : "") + "</td>" +
        "<td>" + esc(sectionLabel(r.chapter, r.section)) + "</td>" +
        '<td class="num">' + r.learners + "</td>" +
        '<td class="num cell-meter">' + meter(r.firstRate, r.firstRate < 50 ? "weak" : "ok") + "<span>" + r.firstRate + "%</span></td>" +
        '<td class="num">' + r.solvedRate + "%</td>" +
        '<td class="num">' + r.hintRate + "%</td>" +
        '<td class="num">' + r.openRate + "%</td>" +
        '<td class="num">' + Number(r.avg_tries).toFixed(2) + "</td></tr>";
    });
    if (!rows.length) html += '<tr><td colspan="' + COLS.length + '" class="muted">No data yet.</td></tr>';
    html += "</tbody></table></div></section>";
    owner.innerHTML = html;
    Array.prototype.forEach.call(owner.querySelectorAll("[data-sort]"), function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-sort");
        if (k === sortKey) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
        drawOwner();
      });
    });
  }

  function message(text) { owner.innerHTML = '<div class="panel"><p>' + text + "</p></div>"; }

  if (!Account || !Account.configured) {
    message("Accounts are not switched on for this copy of the site, so there is nothing to aggregate. See <code>supabase/README.md</code>.");
    return;
  }
  message("Loading…");
  var loadedFor = null;
  function loadOwner() {
    var u = Account.user();
    if (!u) { loadedFor = null; return message('This page is for the course author. <a href="account.html">Sign in</a> first.'); }
    if (loadedFor === u.id) return;
    loadedFor = u.id;
    Account.rpc("is_admin").then(function (ok) {
      if (!ok) return message("This page is not available for your account.");
      return Promise.all([Account.rpc("exercise_stats"), Account.rpc("chapter_stats")]).then(function (res) {
        stats = (res[0] || []).map(function (r) {
          var n = Number(r.learners) || 0;
          r.learners = n;
          r.firstRate = pct(Number(r.first_try), n);
          r.solvedRate = pct(Number(r.solved), n);
          r.hintRate = pct(Number(r.used_hint), n);
          r.openRate = pct(Number(r.opened_solution), n);
          r.avg_tries = Number(r.avg_tries) || 0;
          r.section = r.section || "";
          return r;
        });
        chapters = res[1] || [];
        drawOwner();
      });
    }).catch(function (e) {
      message("Could not load the statistics: " + esc(e && e.message ? e.message : "unknown error") + ".");
    });
  }
  Account.onChange(loadOwner);
  Account.ready().then(loadOwner, function () { message("Could not reach the account service."); });
})();
