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
  if (prefs.calm) root.setAttribute("data-calm", "true");
  root.setAttribute("data-sound", prefs.sound && !prefs.calm ? "on" : "off");
  /* the settings sheet's Reduce motion and Reduce transparency: on top of what the
     device asks for, never instead of it (game.css, tokens.css) */
  if (prefs.motion === "reduce") root.setAttribute("data-motion", "reduce");
  if (prefs.transparency === "reduce") root.setAttribute("data-transparency", "reduce");
})();
