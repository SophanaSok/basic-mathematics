/* ===========================================================================
   Basic Mathematics — the Three.js loader
   Shared by the 3D scenes (assets/scenes3d.js) and the course map (assets/map3d.js).
   Three.js is in the bundle but fetched only when something on the page asks for it:
   a dynamic import of src/vendor/three.js, which the build makes a chunk of its own,
   bundle/three.js, that no page's HTML names. The page never depends on it: every 3D
   picture has a flat fallback that is already on screen.

     BM3D.load()       → Promise of true (BM3D.THREE is ready) or false; never rejects.
                         Cached: the first call starts the download, later calls share it.
     BM3D.THREE        → the Three.js namespace (the names src/vendor/three.js exports),
                         once load() has said true; null before and otherwise
     BM3D.why          → why it is false: "off" | "no-webgl" | "save-data" | "cdn" | "timeout"
                         ("cdn": the chunk could not be fetched or run; the name is from
                         when it came from a CDN, and the checks read it)
     BM3D.supported()  → false when 3D should not even be tried (no WebGL 2, Save-Data, ?3d=off)
     BM3D.lowEnd()     → true on devices that should get the flat picture by default
     BM3D.renderer     → the WebGL renderer's name, once supported() has made its test
                         context ("" when the browser does not say); the course world
                         reads it to give a software renderer its low tier
                         (src/world/tiers.ts)

   WebGL 2 is the floor: Three.js's WebGLRenderer has not supported WebGL 1 since r163
   (node_modules/three/src/renderers/WebGLRenderer.js), so a browser with only WebGL 1
   is "no-webgl" here and gets the flat pictures, as one with no WebGL did.
   =========================================================================== */
(function () {
  "use strict";
  var BM3D = window.BM3D = window.BM3D || {};
  if (BM3D.load) return;

  var TIMEOUT = 8000;
  var pending = null;

  BM3D.why = "";
  BM3D.THREE = BM3D.THREE || null;
  BM3D.renderer = BM3D.renderer || "";

  /* the renderer's name: the unmasked one where the browser gives it, else whatever
     RENDERER says (often a generic name, which reads as a hardware renderer) */
  function rendererOf(gl) {
    try {
      var dbg = gl.getExtension && gl.getExtension("WEBGL_debug_renderer_info");
      return String((dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || "");
    } catch (e) {
      return "";
    }
  }

  function hasWebGL() {
    if (!window.WebGL2RenderingContext) return false;
    try {
      var c = document.createElement("canvas");
      var gl = c.getContext("webgl2");
      if (!gl) return false;
      BM3D.renderer = rendererOf(gl);
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

  /* the import raced against the timeout: resolves "" with BM3D.THREE set, or the
     reason. A chunk that arrives after the timeout is left where it is (it is a module,
     not a script that ran: nothing of it is on the page) and BM3D.THREE stays null, so
     a load that said no stays no. */
  function fetchThree() {
    return new Promise(function (resolve) {
      var done = false;
      function finish(why) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(why);
      }
      var timer = setTimeout(function () { finish("timeout"); }, TIMEOUT);
      var loading;
      try { loading = import("../src/vendor/three.js"); } catch (e) { finish("cdn"); return; }
      loading.then(function (ns) {
        if (done) return;
        if (!ns || !ns.WebGLRenderer) { finish("cdn"); return; }
        BM3D.THREE = ns;
        finish("");
      }, function () { finish("cdn"); });
    });
  }

  BM3D.load = function () {
    if (pending) return pending;
    if (BM3D.THREE && BM3D.THREE.WebGLRenderer) {
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
    pending = fetchThree().then(function (why) {
      BM3D.why = why || "";
      return !why;
    }, function () {
      BM3D.why = "cdn";
      return false;
    });
    return pending;
  };
})();
