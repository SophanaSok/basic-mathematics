/* ===========================================================================
   Basic Mathematics — sound
   window.BMSfx: a few short synthesised notes, made with WebAudio on the spot,
   so there are no files to load. Off by default and off in calm mode. No
   AudioContext exists until sound has been switched on and the reader has then
   clicked or pressed a key (browsers insist on a gesture, and a page that has
   never been asked for sound should not open an audio device at all). Muted
   while the tab is hidden.
   =========================================================================== */
(function () {
  "use strict";

  var Store = window.BMStore;
  var Ctx = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master = null;

  function prefs() {
    if (window.BMGame && window.BMGame.prefs) return window.BMGame.prefs();
    var p = Store ? Store.read(Store.keys.prefs, {}) : {};
    return p && typeof p === "object" ? p : {};
  }
  function wanted() {
    var p = prefs();
    return !!p.sound && !p.calm;
  }
  function enabled() {
    return wanted() && !!Ctx && document.visibilityState !== "hidden";
  }

  /* only ever called from inside a click or key press, and only with sound on */
  function wake() {
    if (!Ctx || !wanted()) return;
    if (!ctx) {
      try {
        ctx = new Ctx();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
      } catch (e) { ctx = null; return; }
    }
    if (ctx.state === "suspended" && document.visibilityState !== "hidden") {
      try { ctx.resume(); } catch (e) { /* will try again on the next gesture */ }
    }
  }
  /* bubbling, so a click on the Sound switch has already turned sound on when it lands here */
  document.addEventListener("click", wake);
  document.addEventListener("keydown", wake);
  document.addEventListener("visibilitychange", function () {
    if (!ctx) return;
    try {
      if (document.visibilityState === "hidden") ctx.suspend();
      else if (wanted()) ctx.resume();
    } catch (e) { /* nothing to do */ }
  });

  /* one note: frequency in Hz, start offset and length in seconds, a soft attack and
     an exponential tail, so nothing clicks */
  function note(freq, at, len, opts) {
    opts = opts || {};
    var t0 = ctx.currentTime + 0.01 + at;
    var osc = ctx.createOscillator(), env = ctx.createGain();
    osc.type = opts.type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + len);
    var peak = opts.vol || 0.12;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.02, len / 4));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    osc.connect(env);
    env.connect(master);
    osc.start(t0);
    osc.stop(t0 + len + 0.05);
  }
  function semis(base, n) { return base * Math.pow(2, n / 12); }

  var C5 = 523.25;
  var SOUNDS = {
    "correct-first": function () { note(C5, 0, 0.12); note(semis(C5, 4), 0.07, 0.14); note(semis(C5, 7), 0.14, 0.22); },
    "correct": function () { note(semis(C5, 4), 0, 0.12); note(semis(C5, 7), 0.08, 0.2); },
    "combo-up": function (o) {
      var p = Math.max(1, Math.min(5, (o && o.pips) || 1));
      note(semis(C5, 2 * p), 0, 0.1); note(semis(C5, 2 * p + 7), 0.07, 0.18);
    },
    "combo-max": function () {
      [0, 4, 7, 12].forEach(function (n, i) { note(semis(C5, n), i * 0.07, 0.2, { vol: 0.1 }); });
    },
    "miss": function () { note(196, 0, 0.22, { type: "sine", vol: 0.08, to: 180 }); },
    "heart-lost": function () { note(330, 0, 0.14, { type: "triangle", vol: 0.08 }); note(262, 0.12, 0.24, { type: "triangle", vol: 0.07 }); },
    "ward": function () { note(659, 0, 0.3, { vol: 0.08 }); note(988, 0.02, 0.4, { vol: 0.05 }); },
    "boss-down": function () {
      [0, 4, 7].forEach(function (n, i) { note(semis(392, n), i * 0.1, 0.18, { type: "triangle", vol: 0.1 }); });
      note(semis(392, 12), 0.32, 0.5, { type: "triangle", vol: 0.1 });
    },
    "level-up": function () {
      [0, 2, 4, 5, 7, 9, 11, 12].forEach(function (n, i) { note(semis(C5, n), i * 0.05, 0.14, { vol: 0.08 }); });
    },
    "achievement": function () { note(semis(C5, 7), 0, 0.16, { vol: 0.09 }); note(semis(C5, 12), 0.1, 0.3, { vol: 0.09 }); },
    "par-tick": function () { note(1200, 0, 0.04, { type: "square", vol: 0.03 }); },
    "timeout": function () { note(220, 0, 0.35, { type: "triangle", vol: 0.08, to: 150 }); },
    "run-end": function () { [0, 4, 7].forEach(function (n) { note(semis(392, n), 0, 0.6, { vol: 0.06 }); }); }
  };

  function play(name, opts) {
    if (!enabled() || !ctx || !SOUNDS[name]) return false;
    if (ctx.state === "suspended") { try { ctx.resume(); } catch (e) { return false; } }
    try { SOUNDS[name](opts); } catch (e) { return false; }
    return true;
  }

  window.BMSfx = { play: play, enabled: enabled, names: Object.keys(SOUNDS) };

  /* ------------------------------------------------------------ the bus --- */

  /* A correct answer and the combo it lights arrive together; one sound covers both. */
  var pending = null;
  function soon(name, opts) {
    pending = { name: name, opts: opts };
    setTimeout(function () {
      if (!pending) return;
      var p = pending;
      pending = null;
      play(p.name, p.opts);
    }, 0);
  }

  if (!Store) return;
  Store.on(function (c) {
    if (!ctx) return;
    if (c.type === "attempt") {
      if (c.correct) soon(c.tryNo === 1 && !c.solutionOpen ? "correct-first" : "correct");
      else soon("miss");
    } else if (c.type === "combo") {
      if (c.why === "max") soon("combo-max");
      else if (c.why === "up") soon("combo-up", { pips: c.pips });
    } else if (c.type === "encounter" && c.fresh) {
      if (c.cue === "down") play("boss-down");
      else if (c.cue === "ward") play("ward");
      else if (c.cue === "heart") play("heart-lost");
    } else if (c.type === "level") {
      setTimeout(function () { play("level-up"); }, 500);
    } else if (c.type === "achievement") {
      setTimeout(function () { play("achievement"); }, 900);
    }
  });
})();
