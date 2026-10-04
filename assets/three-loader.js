/* ===========================================================================
   Basic Mathematics — the Three.js loader
   Shared by the 3D scenes (assets/scenes3d.js) and the course map (assets/map3d.js).
   Three.js is fetched only when something on the page asks for it, from a pinned
   classic build with an integrity hash, and the page never depends on it: every
   3D picture has a flat fallback that is already on screen.

     BM3D.load()       → Promise of true (window.THREE is ready) or false; never rejects.
                         Cached: the first call starts the download, later calls share it.
     BM3D.why          → why it is false: "off" | "no-webgl" | "save-data" | "cdn" | "timeout"
     BM3D.supported()  → false when 3D should not even be tried (no WebGL, Save-Data, ?3d=off)
     BM3D.lowEnd()     → true on devices that should get the flat picture by default

   0.160.1 is the last release that still ships build/three.min.js (later ones are ES
   modules only, which cannot carry an integrity hash here or load from file://).
   The pin is frozen like KaTeX's; it prints one deprecation warning when it loads.
   =========================================================================== */
(function () {
  "use strict";
  var BM3D = window.BM3D = window.BM3D || {};
  if (BM3D.load) return;

  var SRC = [
    "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.1/three.min.js",
    "https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.min.js"
  ];
  var SRI = "sha512-vnmn/Qqn6aG0POAc9mIGzjq0IybrvxJXYDafNvp9JSnDGxeF3pbkSqLvf+YGd5ku63pT7sa/jxHn7/d0mU8+tA==";
  var TIMEOUT = 8000;
  var pending = null;

  BM3D.why = "";

  function hasWebGL() {
    if (!window.WebGLRenderingContext) return false;
    try {
      var c = document.createElement("canvas");
      var gl = c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl");
      if (!gl) return false;
      var lose = gl.getExtension && gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
      return true;
    } catch (e) {
      return false;
    }
  }

  BM3D.supported = function () {
    if (/[?&]3d=off\b/.test(window.location.search)) { BM3D.why = "off"; return false; }
    var conn = navigator.connection;
    if (conn && conn.saveData) { BM3D.why = "save-data"; return false; }
    if (!hasWebGL()) { BM3D.why = "no-webgl"; return false; }
    return true;
  };

  BM3D.lowEnd = function () {
    var mem = navigator.deviceMemory;
    return typeof mem === "number" && mem <= 2;
  };

  function inject(url) {
    return new Promise(function (resolve) {
      var s = document.createElement("script");
      var done = false;
      function finish(ok, why) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (!ok && s.parentNode) s.parentNode.removeChild(s);
        resolve(ok ? "" : why);
      }
      var timer = setTimeout(function () { finish(false, "timeout"); }, TIMEOUT);
      s.src = url;
      s.async = true;
      s.integrity = SRI;
      s.crossOrigin = "anonymous";
      s.onload = function () { finish(!!window.THREE, "cdn"); };
      s.onerror = function () { finish(false, "cdn"); };
      document.head.appendChild(s);
    });
  }

  BM3D.load = function () {
    if (pending) return pending;
    if (window.THREE && window.THREE.WebGLRenderer) {
      pending = Promise.resolve(true);
      return pending;
    }
    if (!window.Promise) {
      /* a browser this old gets the flat pictures; a minimal thenable keeps callers simple */
      BM3D.why = "no-webgl";
      pending = { then: function (fn) { return fn(false); } };
      return pending;
    }
    if (!BM3D.supported()) {
      pending = Promise.resolve(false);
      return pending;
    }
    pending = inject(SRC[0]).then(function (why) {
      return why ? inject(SRC[1]) : "";
    }).then(function (why) {
      BM3D.why = why || "";
      return !why;
    }, function () {
      BM3D.why = "cdn";
      return false;
    });
    return pending;
  };
})();
