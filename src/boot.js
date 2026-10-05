/* ===========================================================================
   Basic Mathematics — first paint
   The one script loaded without `defer`, so the page is painted in the right
   theme and play settings from the start instead of flashing the defaults.
   Kept tiny and dependency-free; site.js takes over once it runs.
   =========================================================================== */
(function () {
  "use strict";
  var root = document.documentElement;
  function read(key) {
    try { return JSON.parse(window.localStorage.getItem(key)); } catch (e) { return null; }
  }
  var theme = read("bm.theme");
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  root.setAttribute("data-theme", theme);
  var prefs = read("bm.prefs.v1") || {};
  /* the reading panel is light paper in both themes unless the reader chose a dark
     one; the theme shades the frame round it (src/styles/tokens.css) */
  root.setAttribute("data-panel", prefs.panel === "dark" ? "dark" : "light");
  /* on only when stored as true, the rule assets/game.js prefs() reads them by, so a
     damaged value ("yes", 1) is off here too and the HUD script, which reads
     html[data-calm], draws what the game will */
  var calm = prefs.calm === true;
  if (calm) root.setAttribute("data-calm", "true");
  root.setAttribute("data-sound", prefs.sound === true && !calm ? "on" : "off");
  /* the settings sheet's Reduce motion and Reduce transparency: on top of what the
     device asks for, never instead of it (game.css, tokens.css) */
  if (prefs.motion === "reduce") root.setAttribute("data-motion", "reduce");
  if (prefs.transparency === "reduce") root.setAttribute("data-transparency", "reduce");
  /* Between pages: where the browser has cross-document view transitions, every page
     opts in (the inline <style> after this script) and the next page fades in under a
     top bar that stays put (game.css, "Between pages"). Study mode and Reduce motion are
     the attributes above, which no at-rule can read, so each side of a navigation skips
     the transition itself when either is on: pageswap on the page being left (Study mode
     may have been switched on there since it loaded), pagereveal on the page arriving,
     which must listen from here, before its first frame. Reduced motion on the device is
     in the same test, though the opt-in is never made under it. */
  function still() {
    return root.hasAttribute("data-calm") || root.getAttribute("data-motion") === "reduce" ||
      !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function between(e) {
    if (e.viewTransition && still()) e.viewTransition.skipTransition();
  }
  window.addEventListener("pageswap", between);
  window.addEventListener("pagereveal", between);
  /* When the browser itself gives a transition up on the page arriving, because that
     page took longer than its timeout to be ready (four seconds in Chrome), Chromium
     rejects the promise of a transition no script was ever handed (pagereveal had
     none) and reports it as an uncaught error. The page shows as it would have
     without a transition, so that one rejection is not an error of the page's. */
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    if (window.DOMException && r instanceof window.DOMException && /^(InvalidStateError|TimeoutError|AbortError)$/.test(r.name) && /^Transition was /.test(r.message)) e.preventDefault();
  });
})();
