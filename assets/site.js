/* ===========================================================================
   Basic Mathematics — site engine
   No framework, no build step. Four jobs:
     1. theme (remembered, with OS default)
     2. math typesetting via KaTeX auto-render
     3. navigation built from data/curriculum.js (sidebar, prev/next, home cards)
     4. the exercise engine + progress store
   Every localStorage access is wrapped: a browser that blocks storage still
   gets a fully working, stateless site.
   =========================================================================== */
(function () {
  "use strict";

  var THEME_KEY = "bm.theme";
  var PROGRESS_KEY = "bm.progress.v1";
  var PLAY_KEY = "bm.play.v1";
  var LAST_KEY = "bm.last";
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
  function writeStore(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

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
      var rec = all[id] || { solved: {}, total: 0 };
      rec.total = total;
      all[id] = rec;
      writeStore(PROGRESS_KEY, all);
    },
    markSolved: function (id, exKey) {
      var all = this.all();
      var rec = all[id] || { solved: {}, total: 0 };
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
      var rec = all[id] || {};
      rec.done = rec.done || {};
      fn(rec);
      all[id] = rec;
      writeStore(PLAY_KEY, all);
    },
    isDone: function (id, key) { return !!this.chapter(id).done[key]; },
    markDone: function (id, key) { this.update(id, function (rec) { rec.done[key] = true; }); },
    setTotal: function (id, total) { this.update(id, function (rec) { rec.total = total; }); },
    setGuess: function (id, i) { this.update(id, function (rec) { rec.guess = i; }); },
    count: function (id) {
      var rec = this.chapter(id);
      return { done: Object.keys(rec.done).length, total: rec.total };
    },
    reset: function () { writeStore(PLAY_KEY, {}); writeStore(LAST_KEY, null); }
  };
  window.BMPlay = Play;

  /* -------------------------------------------------------------- theme -- */

  function currentTheme() {
    return readStore(THEME_KEY, null);
  }
  function applyTheme(mode) {
    var root = document.documentElement;
    if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode);
    else root.removeAttribute("data-theme");
  }
  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function initTheme() {
    applyTheme(currentTheme());
    var btns = document.querySelectorAll("[data-theme-toggle]");
    function label() {
      var effective = currentTheme() || (systemPrefersDark() ? "dark" : "light");
      return effective === "dark" ? "☀ Light" : "☾ Dark";
    }
    Array.prototype.forEach.call(btns, function (btn) {
      btn.textContent = label();
      btn.setAttribute("title", "Switch between light and dark");
      btn.addEventListener("click", function () {
        var effective = currentTheme() || (systemPrefersDark() ? "dark" : "light");
        var next = effective === "dark" ? "light" : "dark";
        writeStore(THEME_KEY, next);
        applyTheme(next);
        Array.prototype.forEach.call(btns, function (b) { b.textContent = label(); });
      });
    });
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

  function buildHome() {
    var host = document.querySelector("[data-course-index]");
    if (!host) return;
    var html = "";
    C.parts.forEach(function (part) {
      html += '<section class="part" data-part="' + escapeHtml(part.id) + '">';
      html += '<div class="part-head"><span class="roman" aria-hidden="true">' + part.num +
        '</span><h2 id="part-' + part.id + '">Part ' + part.num + " — " + escapeHtml(part.name) + "</h2></div>";
      html += '<p class="part-blurb">' + escapeHtml(part.blurb) + "</p>";
      html += '<div class="cards">';
      part.chapters.forEach(function (ch) {
        var c = Progress.count(ch.id);
        var pct = c.total ? Math.round((c.solved / c.total) * 100) : 0;
        html += '<a class="card" href="' + escapeHtml(ch.path) + '">';
        html += '<div class="row"><span class="label">' +
          escapeHtml(ch.label === "Interlude" ? "Interlude" : "Chapter " + ch.label) + "</span>";
        if (ch.status === "outline") html += '<span class="badge soon">outline</span>';
        html += "</div>";
        html += "<h3>" + escapeHtml(ch.title) + "</h3>";
        html += "<p>" + escapeHtml(ch.blurb) + "</p>";
        html += '<div class="meta">';
        if (ch.status === "full") {
          html += '<span class="ring" style="--pct:' + pct + '" data-pct="' + pct + '" aria-hidden="true"></span>';
          html += "<span>" + (c.total ? c.solved + " / " + c.total + " exercises" : ch.sections.length + " sections") + "</span>";
          var m = Play.count(ch.id);
          if (m.total) {
            html += '<span class="stars" title="Missions completed on this chapter\'s figures">★ ' +
              Math.min(m.done, m.total) + " / " + m.total + "</span>";
          }
        } else {
          html += "<span>" + ch.sections.length + " sections planned</span>";
        }
        html += "</div></a>";
      });
      html += "</div></section>";
    });
    host.innerHTML = html;
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
    btn.textContent = "Continue: " + (ch.label === "Interlude" ? "Interlude" : "Chapter " + ch.label) +
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
      : "Nothing solved yet — " + full + " chapters are written and waiting. Progress is saved in this browser only.";
  }

  function initResetButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-action="reset-progress"]'), function (btn) {
      btn.addEventListener("click", function () {
        Progress.reset();
        Play.reset();
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
      /* "|" separates alternative accepted answers — but an answer may itself contain
         a bar (|x|), so the unsplit string is always a candidate too. */
      var rawAnswer = (ex.getAttribute("data-answer") || "").trim();
      var answers = [rawAnswer].concat(rawAnswer.split("|"))
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s !== ""; });
      var hint = ex.getAttribute("data-hint") || "";
      var hint2 = ex.getAttribute("data-hint2") || "";
      var tol = parseFloat(ex.getAttribute("data-tol") || "") || 0;
      var choices = ex.querySelector("ul.choices, ol.choices");

      /* number label */
      var labelText = inline ? (ex.getAttribute("data-label") || "Your turn") : "Exercise " + num;
      var numEl = document.createElement("span");
      numEl.className = "ex-num";
      numEl.textContent = labelText;
      ex.insertBefore(numEl, ex.firstChild);

      var solution = ex.querySelector(".ex-solution");
      var form = document.createElement("div");
      form.className = "ex-form";

      var inputEl = null, radios = [];
      if (choices) {
        /* turn <li> items into radio choices */
        var items = choices.querySelectorAll("li");
        var box = document.createElement("div");
        box.className = "choices";
        Array.prototype.forEach.call(items, function (li, j) {
          var id = chapterId + "-" + key + "-c" + j;
          var label = document.createElement("label");
          label.className = "choice";
          label.setAttribute("for", id);
          var input = document.createElement("input");
          input.type = "radio";
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
        if (solution) ex.appendChild(solution);
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
      showBtn.className = "btn ghost";
      showBtn.textContent = "Show solution";
      if (solution) form.appendChild(showBtn);

      var feedback = document.createElement("p");
      feedback.className = "ex-feedback";
      feedback.setAttribute("role", "status");
      feedback.setAttribute("aria-live", "polite");

      if (solution) ex.insertBefore(form, solution);
      else ex.appendChild(form);
      ex.insertBefore(feedback, solution || null);
      if (solution) ex.appendChild(solution);

      var tries = 0;

      function reveal() {
        if (!solution) return;
        solution.setAttribute("data-show", "true");
        showBtn.textContent = "Hide solution";
      }
      function hide() {
        if (!solution) return;
        solution.removeAttribute("data-show");
        showBtn.textContent = "Show solution";
      }
      showBtn.addEventListener("click", function () {
        if (solution.getAttribute("data-show") === "true") hide(); else reveal();
      });

      function markCorrect(fromStorage) {
        ex.setAttribute("data-state", "correct");
        if (fromStorage) ex.setAttribute("data-restored", "true");
        else ex.removeAttribute("data-restored");
        feedback.innerHTML = '<span class="ok">' + TICK + " Correct.</span>" +
          (solution ? ' <span class="hint">Compare your reasoning with the solution below.</span>' : "");
        feedback.setAttribute("data-show", "true");
        if (!fromStorage && !inline) {
          var before = solvedCount();
          Progress.markSolved(chapterId, key);
          updateScore();
          if (total && before < total && solvedCount() >= total) chapterDone(chapter, true);
        }
      }

      function check() {
        var given;
        if (inputEl) given = inputEl.value;
        else {
          var picked = radios.filter(function (r) { return r.checked; })[0];
          if (!picked) {
            feedback.innerHTML = '<span class="hint">Choose one of the options first.</span>';
            feedback.setAttribute("data-show", "true");
            return;
          }
          given = picked.value;
        }
        if (String(given).trim() === "") {
          feedback.innerHTML = '<span class="hint">Type an answer, then press Check.</span>';
          feedback.setAttribute("data-show", "true");
          return;
        }
        var ok = answers.some(function (a) {
          return matches(given, a, radios.length ? "number" : type, tol);
        });
        tries++;
        if (ok) {
          markCorrect(false);
        } else {
          /* drop and re-set the state so the shake replays on every miss */
          ex.removeAttribute("data-state");
          void ex.offsetWidth;
          ex.setAttribute("data-state", "wrong");
          var extra = tries === 1 && hint
            ? '<span class="hint">Hint: ' + hint + "</span>"
            : tries === 2 && hint2
              ? '<span class="hint">Another hint: ' + hint2 + "</span>"
              : '<span class="hint">Not yet. Work it through once more' + (solution ? ", or open the solution." : ".") + "</span>";
          feedback.innerHTML = '<span class="no">✗ Not right.</span> ' + extra;
          feedback.setAttribute("data-show", "true");
          renderMath(feedback);
        }
      }

      checkBtn.addEventListener("click", check);
      if (inputEl) {
        inputEl.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); check(); }
        });
      }

      if (!inline && saved[key]) markCorrect(true);
    });

    updateScore();
    if (total && solvedCount() >= total) chapterDone(chapter, false);
  }

  /* The moment a chapter's last exercise is solved. `fresh` plays the burst once;
     a revisit to a finished chapter gets the banner without it. */
  function chapterDone(chapter, fresh) {
    var practice = document.getElementById("practice");
    if (!practice || document.querySelector(".chapter-done")) return;
    var list = C.chapters || [], next = null;
    if (chapter) list.forEach(function (ch, k) { if (ch.id === chapter.id) next = list[k + 1] || null; });
    var box = document.createElement("div");
    box.className = "chapter-done";
    box.setAttribute("role", "status");
    var html = "";
    if (fresh) {
      html += '<span class="burst" aria-hidden="true">';
      for (var i = 0; i < 14; i++) html += '<i style="--i:' + i + '"></i>';
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
      try { box.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { box.scrollIntoView(); }
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
    if (chapter) document.body.setAttribute("data-part", chapter.part.id);
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
    renderMath(document.body);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
