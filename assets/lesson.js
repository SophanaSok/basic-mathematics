/* ===========================================================================
   Basic Mathematics — lesson mode
   Reads a chapter one step at a time. Nothing in the chapter markup knows about
   this: the steps are cut from the top-level children of <main> when the page
   loads, a new one starting at each section heading and after anything that asks
   the reader to do something (a check, a figure, a predict-then-open box).
   "Whole page" turns it off and is remembered. Loaded after site.js, so the
   exercises and figures are already built by the time anything is hidden.
   =========================================================================== */
(function () {
  "use strict";

  var Store = window.BMStore, Attempts = window.BMAttempts, Progress = window.BMProgress;
  var main = document.getElementById("main");
  var chapterId = document.body.getAttribute("data-chapter");
  if (!Store || !main || !chapterId) return;

  var KEY = Store.keys.lesson;

  function slice(list) { return Array.prototype.slice.call(list); }
  function has(el, cls) { return el.classList.contains(cls); }

  function state() {
    var s = Store.read(KEY, null);
    if (!s || typeof s !== "object") s = {};
    if (!s.reached || typeof s.reached !== "object") s.reached = {};
    return s;
  }
  function save(fn) {
    var s = state();
    fn(s);
    Store.write(KEY, s);
  }

  /* ------------------------------------------------------------ the cuts -- */

  function startsStep(el) {
    return el.tagName === "H2" || has(el, "practice") || has(el, "recap");
  }
  function endsStep(el) {
    return has(el, "puzzle") || has(el, "warmup") || has(el, "ex") || has(el, "practice") ||
      (el.tagName === "DETAILS" && has(el, "reveal")) ||
      (el.tagName === "FIGURE" && !!el.querySelector(".widget"));
  }

  /* the switch between the two ways of reading, placed under the chapter's opening line */
  var modeBox = document.createElement("div");
  modeBox.className = "lesson-mode ui";
  modeBox.setAttribute("role", "group");
  modeBox.setAttribute("aria-label", "How to read this chapter");
  var modeBtns = [["steps", "Step by step"], ["page", "Whole page"]].map(function (m) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = m[1];
    b.addEventListener("click", function () { setMode(m[0]); });
    modeBox.appendChild(b);
    return { mode: m[0], btn: b };
  });
  /* the chapter's opening block: the region banner, or a bare lede or title on older pages */
  var lede = main.querySelector(".region-banner") || main.querySelector(".lede") || main.querySelector("h1");
  if (!lede || lede.parentNode !== main) return;
  main.insertBefore(modeBox, lede.nextSibling);

  var steps = [[]];
  slice(main.children).forEach(function (el) {
    var cur = steps[steps.length - 1];
    if (startsStep(el) && cur.length) { cur = []; steps.push(cur); }
    cur.push(el);
    if (endsStep(el)) steps.push([]);
  });
  steps = steps.filter(function (s) { return s.length; });
  if (steps.length < 3) { main.removeChild(modeBox); return; }
  steps.forEach(function (els, i) {
    els.forEach(function (el) { el.setAttribute("data-step", String(i)); });
  });

  /* ---------------------------------------------------------- the chrome -- */

  var bar = document.createElement("div");
  bar.className = "lesson-next ui";
  var barNote = document.createElement("p");
  barNote.className = "lesson-note";
  var nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "btn big";
  var count = document.createElement("span");
  count.className = "lesson-count";
  bar.appendChild(barNote);
  bar.appendChild(nextBtn);
  bar.appendChild(count);

  var line = document.createElement("div");
  line.className = "lesson-progress";
  line.setAttribute("aria-hidden", "true");
  line.appendChild(document.createElement("span"));
  var topbar = document.querySelector(".topbar");
  if (topbar) topbar.appendChild(line);

  /* ------------------------------------------------------------- state --- */

  var saved = state();
  var mode = saved.mode === "page" ? "page" : "steps";
  var shown = saved.reached[chapterId];
  if (!shown) {
    /* a reader who has already worked in this chapter is not sent back to its first step */
    shown = Progress && Progress.count(chapterId).solved > 0 ? steps.length : 1;
  }
  shown = Math.max(1, Math.min(steps.length, shown));

  function remember() {
    save(function (s) {
      if ((s.reached[chapterId] || 0) < shown) s.reached[chapterId] = shown;
    });
  }

  /* inline checks in the newest step that are still unanswered */
  function pending() {
    var out = [];
    (steps[shown - 1] || []).forEach(function (el) {
      var list = el.matches(".ex[data-inline]") ? [el] : slice(el.querySelectorAll(".ex[data-inline]"));
      list.forEach(function (ex) {
        if (ex.getAttribute("data-state") !== "correct") out.push(ex);
      });
    });
    return out;
  }

  function apply() {
    var all = mode === "page";
    document.body.setAttribute("data-lesson", mode);
    modeBtns.forEach(function (m) { m.btn.setAttribute("aria-pressed", m.mode === mode ? "true" : "false"); });
    steps.forEach(function (els, i) {
      els.forEach(function (el) { el.hidden = !all && i >= shown; });
    });
    /* anything site.js adds later (the completion banner, the chapter's feedback note)
       appears with whatever it was placed in front of */
    slice(main.children).forEach(function (el) {
      if (el === bar || el.hasAttribute("data-step")) return;
      var n = el.nextElementSibling;
      while (n && !n.hasAttribute("data-step")) n = n.nextElementSibling;
      el.hidden = n ? n.hidden : false;
    });

    var more = !all && shown < steps.length;
    if (more) {
      var lastEls = steps[shown - 1];
      var after = lastEls[lastEls.length - 1];
      if (bar.previousElementSibling !== after) main.insertBefore(bar, after.nextSibling);
      var open = pending().length;
      bar.setAttribute("data-ready", open ? "false" : "true");
      barNote.textContent = open
        ? (open === 1 ? "Answer the question above to go on" : "Answer the questions above to go on") +
          " — or skip, and come back to it."
        : "";
      barNote.hidden = !open;
      nextBtn.textContent = open ? "Skip for now" : "Continue";
      nextBtn.className = open ? "btn ghost big" : "btn big";
      count.textContent = "Step " + shown + " of " + steps.length;
    } else if (bar.parentNode) {
      bar.parentNode.removeChild(bar);
    }
    line.hidden = all;
    line.firstChild.style.width = Math.round((shown / steps.length) * 100) + "%";
  }

  function reduced() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function advance() {
    if (shown >= steps.length) return;
    /* passing over a check is itself a signal: it marks the section as one to return to */
    pending().forEach(function (ex) {
      var key = ex.getAttribute("data-key");
      if (!key || !Attempts) return;
      Attempts.update(chapterId, key, function (r) {
        if (r.solved) return;
        r.skipped = 1;
        r.inline = 1;
        if (!r.section && ex.getAttribute("data-section")) r.section = ex.getAttribute("data-section");
      });
    });
    shown++;
    remember();
    apply();
    var first = steps[shown - 1][0];
    steps[shown - 1].forEach(function (el) {
      el.classList.remove("step-in");
      void el.offsetWidth;
      el.classList.add("step-in");
    });
    if (first) {
      if (!first.hasAttribute("tabindex")) first.setAttribute("tabindex", "-1");
      try { first.focus({ preventScroll: true }); } catch (e) { /* older browsers scroll; harmless */ }
      try { first.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" }); }
      catch (e) { first.scrollIntoView(); }
    }
  }
  nextBtn.addEventListener("click", advance);

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    save(function (s) { s.mode = mode; });
    apply();
  }

  /* A link into the chapter must land somewhere visible: open every step up to its target. */
  function stepOf(el) {
    while (el && el.parentNode !== main) el = el.parentNode;
    if (!el) return -1;
    while (el && !el.hasAttribute("data-step")) el = el.nextElementSibling;
    return el ? parseInt(el.getAttribute("data-step"), 10) : -1;
  }
  function revealFor(id, scroll) {
    var target = id ? document.getElementById(id) : null;
    if (!target) return;
    var i = stepOf(target);
    if (i >= shown) {
      shown = i + 1;
      remember();
      apply();
    }
    if (scroll && target.scrollIntoView) target.scrollIntoView();
  }
  function hashId(hash) {
    try { return decodeURIComponent(String(hash).replace(/^#/, "")); } catch (e) { return ""; }
  }
  window.addEventListener("hashchange", function () { revealFor(hashId(window.location.hash), true); });
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (a) revealFor(hashId(a.getAttribute("href")), false);
  });

  Store.on(function (c) {
    if (c.type === "solved" || c.type === "attempt") apply();
    else if (c.type === "sync") {
      var r = state().reached[chapterId] || 0;
      if (r > shown) shown = Math.min(steps.length, r);
      apply();
    }
  });

  apply();
  if (window.location.hash) revealFor(hashId(window.location.hash), true);

  window.BMLesson = { steps: steps, shown: function () { return shown; }, advance: advance, setMode: setMode };
})();
