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
    chapter.sections.forEach(function (s, i) {
      html += '<li><a href="#' + s.id + '"><span class="counter">' + (i + 1) + "</span>" +
        escapeHtml(s.title) + "</a></li>";
    });
    if (document.getElementById("practice")) {
      html += '<li><a href="#practice"><span class="counter">★</span>Practice</a></li>';
    }
    html += "</ol>";

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

    spy(host);
  }

  /* highlight the section heading nearest the top of the viewport */
  function spy(host) {
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
      html += '<section class="part">';
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
        } else {
          html += "<span>" + ch.sections.length + " sections planned</span>";
        }
        html += "</div></a>";
      });
      html += "</div></section>";
    });
    host.innerHTML = html;
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

  function initExercises(chapter) {
    var exs = document.querySelectorAll(".ex");
    if (!exs.length) return;
    var chapterId = chapter ? chapter.id : document.body.getAttribute("data-chapter") || "misc";
    var saved = Progress.chapter(chapterId).solved;
    var total = exs.length;
    Progress.setTotal(chapterId, total);

    var scoreEl = document.querySelector("[data-practice-score]");
    function updateScore() {
      if (!scoreEl) return;
      var n = Object.keys(Progress.chapter(chapterId).solved).length;
      scoreEl.innerHTML = "<b>" + n + "</b> of " + total + " solved";
    }

    Array.prototype.forEach.call(exs, function (ex, idx) {
      var key = ex.id || "e" + (idx + 1);
      var num = idx + 1;
      var type = ex.getAttribute("data-type") || "exact";
      /* "|" separates alternative accepted answers — but an answer may itself contain
         a bar (|x|), so the unsplit string is always a candidate too. */
      var rawAnswer = (ex.getAttribute("data-answer") || "").trim();
      var answers = [rawAnswer].concat(rawAnswer.split("|"))
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s !== ""; });
      var hint = ex.getAttribute("data-hint") || "";
      var tol = parseFloat(ex.getAttribute("data-tol") || "") || 0;
      var choices = ex.querySelector("ul.choices, ol.choices");

      /* number label */
      var numEl = document.createElement("span");
      numEl.className = "ex-num";
      numEl.textContent = "Exercise " + num;
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
        inputEl.setAttribute("aria-label", "Your answer to exercise " + num);
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
        feedback.innerHTML = '<span class="ok">✓ Correct.</span>' +
          (solution ? ' <span class="hint">Compare your reasoning with the solution below.</span>' : "");
        feedback.setAttribute("data-show", "true");
        if (!fromStorage) {
          Progress.markSolved(chapterId, key);
          updateScore();
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
          ex.setAttribute("data-state", "wrong");
          var extra = tries === 1 && hint
            ? '<span class="hint">Hint: ' + hint + "</span>"
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

      if (saved[key]) markCorrect(true);
    });

    updateScore();
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
      } catch (e) {
        host.innerHTML = '<p class="hint-drag">This figure failed to load.</p>';
        if (window.console) console.error("[BM] widget " + name + " failed", e);
      }
    });
  }

  /* ---------------------------------------------------------------- go --- */

  function init() {
    initTheme();
    var chapter = chapterOf(document.body);
    buildSidebar(chapter);
    buildChapterNav(chapter);
    buildHome();
    buildCourseStats();
    initResetButtons();
    initExercises(chapter);
    mountWidgets();
    renderMath(document.body);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
