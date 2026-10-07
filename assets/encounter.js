/* ===========================================================================
   Basic Mathematics — encounters
   window.BMEncounter: dresses each practice and review set as a boss fight
   without changing a single exercise. The boss is the misconception behind the
   chapter's opening puzzle (data/quest.js); its health is simply the number of
   problems still unsolved, so nothing here can be lost, locked or ground out.

   Everything shown is derived from the stores every time: health and segments
   from BMProgress, how each problem fell and the hearts from BMAttempts, the
   medal from both (raised by a rematch in the Arena). Loaded after site.js and
   game.js, before lesson.js, so the decoration is in place before the chapter is
   cut into steps; the finale lives inside the set, so step mode shows it too.
   =========================================================================== */
(function () {
  "use strict";

  var Store = window.BMStore, Site = window.BMSite, Game = window.BMGame, Play = window.BMPlay;
  var C = window.BM_CURRICULUM, Insights = window.BMInsights;
  var main = document.getElementById("main");
  var chapterId = document.body ? document.body.getAttribute("data-chapter") : null;
  if (!Store || !Site || !Game || !C || !main || !chapterId) return;
  var chapter = C.chapterById(chapterId);
  if (!chapter) return;

  var Q = window.BM_QUEST || {};
  var region = (Q.regions || {})[chapter.part.id] || { solid: "cube" };
  var boss = (Q.bosses || {})[chapterId] || null;
  var esc = Site.escapeHtml, root = Site.rootPrefix();
  var loadedAt = Date.now();
  var MEDALS = Game.MEDALS || ["", "Bronze", "Silver", "Gold"];

  function slice(list) { return Array.prototype.slice.call(list); }
  function calm() { return Game.prefs().calm; }
  /* drawn stars from game.js, with the count in words; ★ text only if it is older */
  function stars(n, compact) {
    if (Game.stars) return Game.stars(n, compact);
    return '<span aria-hidden="true">' + new Array(n + 1).join("★") + "</span>";
  }
  function announce(text, opts) { if (Game.announce) Game.announce(text, opts); }

  /* ------------------------------------------------------------- sigil --- */

  /* The region's solid, drawn as a flat projected outline: only the faces turned
     towards the reader, each a path with data-face, filled while health remains. */
  var PHI = (1 + Math.sqrt(5)) / 2;
  var CUBE_FACES = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  function vertices(name) {
    if (name === "tetra") return [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
    if (name === "octa") return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    if (name === "icosa") {
      var v = [];
      [-1, 1].forEach(function (a) {
        [-1, 1].forEach(function (b) { v.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]); });
      });
      return v;
    }
    return [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  }
  function dist(a, b) {
    return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2));
  }
  /* every face of these three solids is a triangle of mutually nearest vertices */
  function triangles(v) {
    var d = Infinity, out = [], i, j, k;
    for (i = 0; i < v.length; i++) for (j = i + 1; j < v.length; j++) d = Math.min(d, dist(v[i], v[j]));
    function near(a, b) { return Math.abs(dist(v[a], v[b]) - d) < 1e-6; }
    for (i = 0; i < v.length; i++) for (j = i + 1; j < v.length; j++) for (k = j + 1; k < v.length; k++) {
      if (near(i, j) && near(j, k) && near(i, k)) out.push([i, j, k]);
    }
    return out;
  }
  function sigilFaces(name) {
    var v = vertices(name), faces = name === "cube" || !name ? CUBE_FACES : triangles(v);
    var r = Math.sqrt(v[0][0] * v[0][0] + v[0][1] * v[0][1] + v[0][2] * v[0][2]);
    var yaw = name === "tetra" ? 2.36 : 0.62, pitch = name === "tetra" ? 0.59 : 0.42;
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    var p = v.map(function (q) {
      var x = (q[0] * cy + q[2] * sy) / r, z = (-q[0] * sy + q[2] * cy) / r, y = q[1] / r;
      return [x, y * cp - z * sp, y * sp + z * cp];
    });
    var vis = [];
    faces.forEach(function (f) {
      var c = [0, 0, 0];
      f.forEach(function (i) { c[0] += p[i][0]; c[1] += p[i][1]; c[2] += p[i][2]; });
      if (c[2] / f.length <= 0.02) return;
      vis.push({
        x: c[0] / f.length, y: c[1] / f.length,
        d: "M" + f.map(function (i) {
          return (50 + p[i][0] * 42).toFixed(1) + " " + (50 - p[i][1] * 42).toFixed(1);
        }).join(" L") + " Z"
      });
    });
    /* top faces first, so the solid empties from the bottom up */
    vis.sort(function (a, b) { return (b.y - a.y) || (a.x - b.x); });
    return vis.map(function (f) { return f.d; });
  }
  var FACES = sigilFaces(region.solid);

  /* ---------------------------------------------------------- sections --- */

  function sectionInfo(sec) {
    if (!sec) return null;
    var owner = chapter, sid = sec, cut = sec.indexOf("#");
    if (cut > -1) { owner = C.chapterById(sec.slice(0, cut)); sid = sec.slice(cut + 1); }
    if (!owner) return null;
    var idx = -1;
    owner.sections.forEach(function (s, i) { if (s.id === sid) idx = i; });
    if (idx < 0) return null;
    var s = owner.sections[idx];
    return {
      id: sid, chapter: owner, section: s,
      label: owner.label === "Interlude" ? s.title : "§" + owner.label + "." + (idx + 1),
      full: (owner.label === "Interlude" ? "" : "§" + owner.label + "." + (idx + 1) + " ") + s.title,
      href: owner === chapter ? "#" + sid : root + owner.path + "#" + sid
    };
  }

  /* ---------------------------------------------------------- the sets --- */

  var sets = [];

  function makeSet(section) {
    var review = section.id === "review";
    var exs = slice(section.querySelectorAll(".ex")).filter(function (ex) {
      return !ex.hasAttribute("data-inline") && ex.getAttribute("data-key");
    });
    if (!exs.length) return null;
    var set = {
      id: review ? "review" : "practice", review: review, el: section, exs: exs,
      keys: exs.map(function (ex) { return ex.getAttribute("data-key"); }),
      prev: null, revisit: false, regroupShown: false, lastTouched: 0, timer: null, pending: null
    };
    /* wards: the practice set grouped by the section each problem tests, in page order */
    var groups = [], byId = {};
    exs.forEach(function (ex, i) {
      var sec = ex.getAttribute("data-section") || "";
      var g = byId[sec];
      if (!g) { g = byId[sec] = { sec: sec, info: sectionInfo(sec), idx: [] }; groups.push(g); }
      g.idx.push(i);
    });
    set.groups = groups;

    var name = review ? ((Q.echoes || {})[chapter.part.id] || "Mixed review") : boss ? boss.name : chapter.title;
    var taunt = !review && boss ? boss.taunt : "";
    var kicker = review ? "Mixed review · Encounter" : Site.chapterName(chapter) + " · Encounter";
    set.name = name;

    var svg = '<svg class="sigil" data-solid="' + esc(region.solid || "cube") + '" data-left="' + exs.length +
      '" viewBox="0 0 100 100" focusable="false">';
    FACES.forEach(function (d, i) { svg += '<path class="sigil-face" data-face="' + i + '" data-on="true" d="' + d + '"></path>'; });
    svg += "</svg>";
    var segs = "";
    exs.forEach(function () { segs += '<span class="encounter-seg" data-how="open"></span>'; });

    var box = document.createElement("div");
    box.className = "encounter";
    box.setAttribute("data-medal", "0");
    box.innerHTML =
      '<div class="encounter-sigil" aria-hidden="true">' + svg + "</div>" +
      '<div class="encounter-main">' +
        '<p class="encounter-kicker">' + esc(kicker) + "</p>" +
        '<p class="encounter-boss"><b>' + esc(name) + "</b>" +
          (taunt ? ' <span class="encounter-taunt" hidden>' + esc(taunt) + "</span>" : "") + "</p>" +
        '<div class="encounter-bar" role="progressbar" aria-label="' + (review ? "Mixed review set" : "Practice set") +
          '" aria-valuemin="0" aria-valuemax="' + exs.length + '" aria-valuenow="0">' + segs + "</div>" +
        '<p class="encounter-status"></p>' +
        '<ul class="encounter-wards"></ul>' +
        '<p class="encounter-cue" hidden></p>' +
      "</div>";
    section.insertBefore(box, section.firstChild);

    var result = document.createElement("div");
    result.className = "encounter-result";
    result.hidden = true;
    section.appendChild(result);

    set.box = box;
    set.sigilWrap = box.querySelector(".encounter-sigil");
    set.sigil = box.querySelector(".sigil");
    set.faces = slice(box.querySelectorAll("[data-face]"));
    set.kicker = box.querySelector(".encounter-kicker");
    set.taunt = box.querySelector(".encounter-taunt");
    set.bar = box.querySelector(".encounter-bar");
    set.segs = slice(box.querySelectorAll(".encounter-seg"));
    set.status = box.querySelector(".encounter-status");
    set.wards = box.querySelector(".encounter-wards");
    set.cue = box.querySelector(".encounter-cue");
    set.result = result;
    return set;
  }

  /* --------------------------------------------------------- rendering --- */

  function flag(el, name, ms) {
    if (!el) return;
    el.setAttribute(name, "true");
    setTimeout(function () { el.removeAttribute(name); }, ms || 900);
  }
  function heartsHtml(n) {
    var html = "";
    for (var i = 0; i < 3; i++) html += i < n ? "<i data-full></i>" : "<i></i>";
    return html;
  }

  function wardsFor(set, st) {
    var out = { html: "", done: {} };
    if (!set.review) {
      set.groups.forEach(function (g) {
        var solved = g.idx.filter(function (i) { return st.how[i] !== "open"; }).length;
        var label = g.info ? g.info.label : "General";
        var done = solved >= g.idx.length;
        if (done) out.done[g.sec] = true;
        out.html += "<li" + (done ? ' data-done="true"' : "") +
          (g.info ? ' title="' + esc(g.info.section.title) + '"' : "") + ">" +
          esc(label) + " · " + solved + "/" + g.idx.length + "</li>";
      });
      return out;
    }
    /* a review set keeps its sections to itself: each is named only once its problem falls */
    var named = [], counts = {}, left = 0;
    set.exs.forEach(function (ex, i) {
      if (st.how[i] === "open") { left++; return; }
      var info = sectionInfo(ex.getAttribute("data-section") || "");
      var label = info ? info.label : "General";
      if (!counts[label]) { counts[label] = 0; named.push({ label: label, info: info }); }
      counts[label]++;
    });
    named.forEach(function (n) {
      out.html += '<li data-done="true"' + (n.info ? ' title="' + esc(n.info.full) + '"' : "") + ">" +
        esc(n.label) + (counts[n.label] > 1 ? " · " + counts[n.label] : "") + "</li>";
    });
    if (left) out.html += "<li>" + left + " still unnamed</li>";
    return out;
  }

  function render(set, opts) {
    opts = opts || {};
    var fresh = !!opts.fresh, isCalm = calm(), prev = set.prev;
    var st = Game.setStats(null, chapterId, set.keys);
    var medal = st.won ? Game.medal(chapterId, set.id) : 0;
    var state = st.won ? "won" : st.solved || st.misses || st.tried ? "active" : "idle";
    var guess = Play ? Play.chapter(chapterId).guess : null;

    if (!st.won) set.revisit = false;
    else if (!prev || (!prev.won && !fresh)) set.revisit = true;

    set.el.setAttribute("data-encounter", state);
    set.box.setAttribute("data-medal", String(medal));
    if (set.revisit) set.box.setAttribute("data-revisit", "true");
    else set.box.removeAttribute("data-revisit");
    var hit = fresh && prev && st.hp < prev.hp;
    if (hit) flag(set.box, "data-hit", 700);

    /* the sigil empties as health drops */
    set.sigilWrap.hidden = isCalm;
    set.kicker.hidden = isCalm;
    set.sigil.setAttribute("data-left", String(st.hp));
    var on = st.won || !st.total ? 0 : Math.ceil((set.faces.length * st.hp) / st.total);
    set.faces.forEach(function (f, i) {
      var was = f.getAttribute("data-on") === "true";
      f.setAttribute("data-on", i < on ? "true" : "false");
      if (hit && was && i >= on) flag(f, "data-fresh", 900);
    });
    if (set.taunt) set.taunt.hidden = isCalm || !(guess !== null || st.solved > 0);

    set.bar.setAttribute("aria-valuenow", String(st.solved));
    set.bar.setAttribute("aria-valuetext", st.solved + " of " + st.total + " solved, " + st.hp + " left");
    set.segs.forEach(function (seg, i) {
      var before = seg.getAttribute("data-how");
      seg.setAttribute("data-how", st.how[i]);
      if (hit && before === "open" && st.how[i] !== "open") flag(seg, "data-fresh", 900);
    });

    set.status.innerHTML = st.won
      ? "<b>Cleared</b>" + (medal ? " · " + MEDALS[medal] + " medal" : "")
      : "<b>" + st.hp + "</b> left" + (isCalm ? "" : ' · <span class="encounter-hearts" role="img" aria-label="' +
        st.hearts + ' of 3 hearts">' + heartsHtml(st.hearts) + "</span>");
    /* the heart just lost breaks once; a restored or synced count never does */
    if (fresh && prev && st.hearts < prev.hearts && !st.won && !isCalm) {
      var lost = slice(set.status.querySelectorAll(".encounter-hearts i")).slice(st.hearts, prev.hearts);
      lost.forEach(function (i) { i.setAttribute("data-break", ""); });
      setTimeout(function () { lost.forEach(function (i) { i.removeAttribute("data-break"); }); }, 400);
    }

    var w = wardsFor(set, st);
    if (set.wards.innerHTML !== w.html) set.wards.innerHTML = w.html;
    var newWard = null;
    if (fresh && prev && !set.review) {
      Object.keys(w.done).forEach(function (sec) {
        if (!prev.done[sec] && sec) newWard = newWard || sec;
      });
    }
    if (newWard) {
      var info = sectionInfo(newWard);
      if (info) {
        var li = set.wards.children[set.groups.map(function (g) { return g.sec; }).indexOf(newWard)];
        flag(li, "data-fresh", 900);
        set.cue.innerHTML = "<b>" + esc(info.full) + "</b>: " + esc(info.section.summary || "");
        set.cue.hidden = false;
        announce(info.full + " done. " + (info.section.summary || ""), { priority: "normal", key: "ward-" + set.id });
      }
    }
    if (!st.won && !st.solved) set.cue.hidden = true;

    /* the next problem to aim at */
    var target = -1;
    st.how.forEach(function (h, i) { if (target < 0 && h === "open") target = i; });
    set.exs.forEach(function (ex, i) {
      if (i === target) ex.setAttribute("data-target", "true");
      else ex.removeAttribute("data-target");
    });

    /* what changed, said once, quietly */
    var cue = "";
    if (fresh && prev) {
      if (st.won && !prev.won) cue = "down";
      else if (newWard) cue = "ward";
      else if (st.hearts < prev.hearts && !isCalm) cue = "heart";
      if (st.hp < prev.hp && !st.won) {
        announce(st.hp + (st.hp === 1 ? " problem" : " problems") + " left in " +
          (set.review ? "the mixed review." : "the practice set."), { priority: "low", key: "enc-" + set.id });
      }
      if (st.hearts < prev.hearts && !isCalm && !st.won) {
        announce(st.hearts + " of 3 hearts left in this set.", { priority: "low", key: "hearts-" + set.id });
      }
    }

    if (!st.won) {
      set.result.hidden = true;
      set.result.innerHTML = "";
      set.result.removeAttribute("data-revisit");
    } else if (set.revisit) {
      revisitLine(set, st, medal);
    } else if (cue === "down") {
      if (window.BMFx) window.BMFx.burst(set.sigilWrap);
      setTimeout(function () { finale(set); }, 700);
    }

    if (fresh && prev && st.hearts === 0 && prev.hearts > 0 && !st.won && !isCalm) regroup(set, opts.missKey);

    var changed = !prev || prev.hp !== st.hp || prev.hearts !== st.hearts || prev.medal !== medal || prev.state !== state;
    set.prev = { hp: st.hp, total: st.total, hearts: st.hearts, won: st.won, medal: medal, state: state, done: w.done, first: st.first, solved: st.solved };
    /* the medal is derived, not stored, but listeners such as the course map watch the
       game key for medal changes */
    if (prev && prev.medal !== medal) Store.emit({ type: "state", key: Store.keys.game });
    if (changed) {
      Store.emit({
        type: "encounter", chapter: chapterId, set: set.id, hp: st.hp, total: st.total,
        hearts: st.hearts, medal: medal, state: state, cue: cue, fresh: fresh
      });
    }
    hudHearts();
  }

  function rematchHref() { return root + "arena.html?boss=" + encodeURIComponent(chapterId); }

  function revisitLine(set, st, medal) {
    var el = set.result;
    el.setAttribute("data-revisit", "true");
    var html = "<p><b>" + esc(set.name) + "</b> " + (set.review ? "cleared" : "is down") +
      (medal ? " · " + stars(medal, true) + " " + MEDALS[medal] + " medal" : "") +
      " · " + st.first + " of " + st.total + " right the first time" +
      (set.review ? "" : ' · <a href="' + rematchHref() + '">Rematch in the Arena</a>') + "</p>";
    if (el.innerHTML !== html) el.innerHTML = html;
    el.hidden = false;
  }

  /* -------------------------------------------------------------- finale --- */

  function weakRows(set) {
    if (!Insights) return [];
    var secs = {};
    set.exs.forEach(function (ex) {
      var s = ex.getAttribute("data-section") || "";
      if (s) secs[s.indexOf("#") > -1 ? s : chapterId + "#" + s] = true;
    });
    return Insights.sections().filter(function (r) {
      return secs[r.id] && r.score >= Insights.WEAK;
    }).sort(function (a, b) { return b.score - a.score; }).slice(0, 3);
  }

  function nextChapter() {
    var list = C.chapters, next = null;
    list.forEach(function (ch, k) { if (ch.id === chapterId) next = list[k + 1] || null; });
    return next;
  }

  function puzzleAnchor() {
    var ans = document.querySelector(".recap .puzzle-answer") || document.querySelector(".puzzle-answer");
    if (!ans) return null;
    if (!ans.id) ans.id = "puzzle-answer";
    return "#" + ans.id;
  }

  function finale(set) {
    var st = Game.setStats(null, chapterId, set.keys);
    if (!st.won) return;
    var medal = Game.medal(chapterId, set.id), isCalm = calm(), el = set.result;
    el.removeAttribute("data-revisit");
    var html = '<p class="encounter-result-title"><b>' + esc(set.name) + "</b> " + (set.review ? "cleared." : "is down.") + "</p>";
    html += '<p class="encounter-medal" data-medal="' + medal + '">' + stars(medal) + " " + MEDALS[medal] + " medal</p>";
    html += '<div class="stats"><div class="stat"><b>' + st.first + " of " + st.total + "</b><span>right the first time</span></div>";
    if (!isCalm) html += '<div class="stat"><b>' + st.hearts + " of 3</b><span>hearts kept</span></div>";
    /* the medal counts what hearts do not: problems solved with the solution open first
       (setStats marks less misses), so a medal below the hearts can be read from here */
    var openFirst = st.marks - st.misses;
    if (openFirst > 0) html += '<div class="stat"><b>' + openFirst + " of " + st.total + "</b><span>solved with the solution open</span></div>";
    html += "</div>";

    var g = Play ? Play.chapter(chapterId).guess : null;
    var chips = document.querySelectorAll(".puzzle .guess-chip");
    var anchor = puzzleAnchor();
    if (!set.review && g !== null && chips[g] && anchor) {
      /* the guess is repeated, never graded: the recap is where it gets its answer */
      html += '<p class="encounter-guess">You guessed: <a href="' + anchor + '">' + chips[g].innerHTML + "</a></p>";
    }
    var weak = weakRows(set);
    html += '<p class="encounter-look">' + (weak.length
      ? "Worth another look: " + weak.map(function (r) {
          var href = r.chapter.id === chapterId ? "#" + r.section.id : root + r.path;
          return '<a href="' + esc(href) + '">' + esc(r.label + " " + r.section.title) + "</a>";
        }).join(", ") + "."
      : "Nothing in this set stands out as shaky.") + "</p>";
    var got = Game.unlockedSince ? Game.unlockedSince(loadedAt) : [];
    if (got.length) {
      html += '<p class="encounter-ach">Unlocked: ' + got.map(function (a) { return "<b>" + esc(a.title) + "</b>"; }).join(", ") + ".</p>";
    }
    var next = nextChapter();
    html += '<p class="encounter-actions">' +
      (next
        ? '<a class="btn" href="' + esc(root + next.path) + '">Next chapter</a>'
        : '<a class="btn" href="' + root + 'index.html">Course contents</a>') +
      (set.review ? "" : ' <a class="btn ghost" href="' + rematchHref() + '">Rematch in the Arena</a>') +
      ' <button type="button" class="btn ghost" data-open-all>Open all solutions</button></p>';
    el.innerHTML = html;
    el.hidden = false;
    var openAll = el.querySelector("[data-open-all]");
    if (openAll) openAll.addEventListener("click", function () {
      set.exs.forEach(function (ex) {
        var sol = ex.querySelector(".ex-solution");
        var btn = ex.querySelector(".ex-form .ex-show");
        if (sol && btn && sol.getAttribute("data-show") !== "true") btn.click();
      });
    });
    announce(set.name + (set.review ? " cleared. " : " is down. ") + MEDALS[medal] + " medal, " + st.first + " of " +
      st.total + " right the first time.", { priority: "high" });

    var still = window.BMFx ? window.BMFx.still() : false;
    var r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (r && (r.bottom > window.innerHeight || r.top < 0) && el.scrollIntoView) {
      try { el.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" }); } catch (e) { el.scrollIntoView(false); }
    }
    if (window.BMFx) window.BMFx.confetti();
  }

  /* ------------------------------------------------------------- regroup --- */

  /* the section behind most of this set's misses, so the advice can name it */
  function mostMissed(set) {
    var recs = window.BMAttempts ? window.BMAttempts.chapter(chapterId) : {};
    var tally = {}, order = [];
    set.exs.forEach(function (ex, i) {
      if (!Game.isMiss(recs[set.keys[i]])) return;
      var s = ex.getAttribute("data-section") || "";
      if (!s) return;
      if (!tally[s]) { tally[s] = 0; order.push(s); }
      tally[s]++;
    });
    var best = null;
    order.forEach(function (s) { if (!best || tally[s] > tally[best]) best = s; });
    return best ? sectionInfo(best) : null;
  }

  function regroup(set, missKey) {
    if (set.regroupShown) return;
    set.regroupShown = true;
    var at = set.exs[set.keys.indexOf(missKey)] || set.exs.filter(function (ex) { return ex.hasAttribute("data-target"); })[0];
    if (!at) return;
    var info = mostMissed(set);
    var el = document.createElement("div");
    el.className = "encounter-regroup";
    el.innerHTML = "<p><b>Regroup.</b> That is three misses in this set, so the hearts are gone, but nothing is " +
      "lost or locked. " + (info
        ? "Most of the misses trace back to <b>" + esc(info.full) + "</b>; rereading it usually helps more than another try."
        : "Rereading the section behind this problem usually helps more than another try.") + "</p>" +
      '<p class="encounter-regroup-actions">' +
      (info ? '<a class="btn" href="' + esc(info.href) + '">Reread ' + esc(info.label) + "</a> " : "") +
      '<button type="button" class="btn ghost" data-keep-going>Keep going</button></p>';
    at.parentNode.insertBefore(el, at.nextSibling);
    set.regroupEl = el;
    el.querySelector("[data-keep-going]").addEventListener("click", function () {
      el.hidden = true;
      var t = set.exs.filter(function (ex) { return ex.hasAttribute("data-target"); })[0];
      var f = t && t.querySelector("input:not([disabled]), button");
      if (f) try { f.focus(); } catch (e) { /* nothing to focus */ }
    });
    /* under the hearts key, so it replaces the "0 of 3 hearts" line instead of repeating it */
    announce("No hearts left in this set. " + (info ? "Worth rereading " + info.full + "." : "Worth rereading the section."),
      { priority: "normal", key: "hearts-" + set.id });
  }

  /* hearts in the header belong to the set being worked on, while it is unbeaten */
  function hudHearts() {
    if (!Game.hudHearts) return;
    var live = sets.filter(function (s) { return s.prev && !s.prev.won && s.prev.state === "active"; })
      .sort(function (a, b) { return b.lastTouched - a.lastTouched; })[0];
    Game.hudHearts(live && !calm() ? { lives: live.prev.hearts, max: 3, id: live.id } : null);
  }

  /* --------------------------------------------------------------- go ----- */

  function queue(set, opts) {
    var p = set.pending || (set.pending = {});
    if (opts.fresh) p.fresh = true;
    if (opts.missKey) p.missKey = opts.missKey;
    clearTimeout(set.timer);
    /* the card's own verdict comes first; the bar drains a beat later */
    set.timer = setTimeout(function () {
      var o = set.pending;
      set.pending = null;
      set.timer = null;
      render(set, o || {});
    }, p.fresh ? 450 : 0);
  }

  slice(main.querySelectorAll("section.practice")).forEach(function (section) {
    var set = makeSet(section);
    if (set) sets.push(set);
  });
  if (!sets.length) return;

  /* which exercises make up each set, so achievements can reason about them anywhere */
  var cache = {};
  sets.forEach(function (s) { cache[s.id] = s.keys.slice(); });
  cache.inline = slice(main.querySelectorAll(".ex[data-inline]")).map(function (ex) {
    return ex.getAttribute("data-key");
  }).filter(function (k) { return !!k; });
  var known = (Game.run().sets || {})[chapterId];
  if (JSON.stringify(known || null) !== JSON.stringify(cache)) {
    Game.updateRun(function (r) { r.sets[chapterId] = cache; });
    if (Game.settle) Game.settle();
  }

  sets.forEach(function (s) { render(s, {}); });

  Store.on(function (c) {
    var t = c.type;
    if (t === "attempt" || t === "solved" || t === "opened") {
      if (c.chapter !== chapterId || c.inline) return;
      sets.forEach(function (s) {
        if (s.keys.indexOf(c.key) < 0) return;
        s.lastTouched = Date.now();
        queue(s, { fresh: true, missKey: t === "attempt" && !c.correct ? c.key : null });
      });
    } else if (t === "reset" || t === "sync") {
      /* a reset or sign-out empties the run store, set cache included; this page still knows its sets */
      if (!(Game.run().sets || {})[chapterId]) Game.updateRun(function (r) { r.sets[chapterId] = cache; });
      sets.forEach(function (s) {
        if (t === "reset") {
          if (s.regroupEl && s.regroupEl.parentNode) s.regroupEl.parentNode.removeChild(s.regroupEl);
          s.regroupEl = null;
          s.regroupShown = false;
          s.cue.hidden = true;
        }
        queue(s, {});
      });
    } else if (t === "prefs" || (t === "state" && c.key === Store.keys.play)) {
      sets.forEach(function (s) { queue(s, {}); });
    }
  });

  window.BMEncounter = {
    active: true,
    /* this page's sets as last drawn; for another chapter, derived from the stores */
    state: function (id) {
      var out = {};
      if (!id || id === chapterId) {
        sets.forEach(function (s) { out[s.id] = s.prev; });
        return out;
      }
      var known = (Game.run().sets || {})[id] || {};
      ["practice", "review"].forEach(function (k) {
        if (!known[k] || !known[k].length) return;
        var st = Game.setStats(null, id, known[k]);
        out[k] = { hp: st.hp, total: st.total, hearts: st.hearts, won: st.won, medal: Game.medal(id, k), first: st.first, solved: st.solved };
      });
      return out;
    }
  };
})();
