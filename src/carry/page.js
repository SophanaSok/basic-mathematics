/* ===========================================================================
   Basic Mathematics — the carry page of the old address
   carry/index.html of the legacy site (tools/build-legacy.js inlines this file after
   src/carry/send.js). Two ways in: the new address's "Bring progress from the old
   address" (src/ui/carry.ts), and a page of the old address whose progress is too
   long for an address. Either way it reads what this browser saved here, and then:
     nothing saved     says so, with a link to the new address
     it fits           sends the reader on to ?to= at the new address with it in the
                       fragment, as every legacy page does, marked as asked for
                       (bm-ask=1), so the new address asks even about progress the
                       reader once said no to
     it does not fit   offers it as a file (the shape "Download my data" writes, with
                       the settings under `device`, and `signedIn` when this browser
                       was signed in here, which is all it says of an account), which
                       the progress page of the new address imports, and says how;
                       ?file=1 asks for the file whatever the size
   It leaves as every legacy page does, with location.replace under the page's referrer
   policy, so the new address sees this origin as the referrer (src/carry/format.ts
   fromLegacy). ?to= is a path at the new address and nothing else: anything that is not
   one is "/".
   Plain ES5, inlined as it is (see send.js).
   =========================================================================== */
var BMCarryPage = (function () {
  "use strict";
  var SYNCED = { progress: "bm.progress.v1", play: "bm.play.v1", attempts: "bm.attempts.v1", activity: "bm.activity.v1", lesson: "bm.lesson.v1", last: "bm.last", game: "bm.game.v1" };

  /* a path at the new address, from ?to=; "/" for anything else. A control character
     is refused before parsing (URL drops tabs and newlines, so "/\t/x" would become
     "//x"), and the parsed path is held to the same rule as the text. */
  function pathFrom(search, origin) {
    var m = /[?&]to=([^&#]*)/.exec(search || ""), p = "/";
    if (m) { try { p = decodeURIComponent(m[1].replace(/\+/g, " ")); } catch (e) { p = "/"; } }
    var single = function (s) { return s.charAt(0) === "/" && s.charAt(1) !== "/" && s.charAt(1) !== "\\"; };
    if (!single(p) || /[\u0000-\u001f\u007f]/.test(p)) return "/";
    try {
      var u = new URL(origin + p);
      return u.origin === origin && single(u.pathname) ? u.pathname + u.search : "/";
    } catch (e) { return "/"; }
  }

  /* the file: what "Download my data" writes, and the settings under `device` */
  function file(stores, from, signedIn) {
    var out = { format: "basic-mathematics-progress", v: 1, from: from, exported: new Date().toISOString() }, device = {}, n = 0;
    Object.keys(SYNCED).forEach(function (f) {
      if (Object.prototype.hasOwnProperty.call(stores, SYNCED[f])) out[f] = stores[SYNCED[f]];
    });
    Object.keys(stores).forEach(function (k) {
      var synced = false;
      Object.keys(SYNCED).forEach(function (f) { if (SYNCED[f] === k) synced = true; });
      if (!synced) { device[k] = stores[k]; n++; }
    });
    if (n) out.device = device;
    if (signedIn) out.signedIn = true;
    return out;
  }

  function show(id) {
    ["carry-wait", "carry-none", "carry-file"].forEach(function (s) {
      var el = document.getElementById(s);
      if (el) el.hidden = s !== id;
    });
  }

  /* cfg: { origin: the new address, limit: as in send.js } */
  function run(cfg) {
    var S = BMCarrySend, loc = window.location;
    var path = pathFrom(loc.search, cfg.origin), at = S.anchor(loc.hash);
    var target = cfg.origin + path;
    Array.prototype.forEach.call(document.querySelectorAll("[data-carry-target]"), function (a) {
      a.href = target + (at ? "#" + at : "");
      a.textContent = target.replace(/^https?:\/\//, "");
    });
    var got;
    try { got = S.collect(window.localStorage); } catch (e) { got = { stores: {}, count: 0, signedIn: false }; }
    if (!got.count && !got.signedIn) { show("carry-none"); return; }
    function offerFile() {
      document.getElementById("carry-download").addEventListener("click", function () {
        var blob = new Blob([JSON.stringify(file(got.stores, loc.origin + loc.pathname, got.signedIn), null, 2)], { type: "application/json" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "basic-mathematics-progress.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
      show("carry-file");
    }
    /* ?file=1 asks for the file whatever its size */
    if (/[?&]file=1(&|$)/.test(loc.search) || typeof Promise !== "function") { offerFile(); return; }
    S.encode(got.stores, got.signedIn).then(function (value) {
      if (value.length <= cfg.limit) loc.replace(target + "#" + S.PARAM + "=" + value + (at ? "&" + S.AT + "=" + encodeURIComponent(at) : "") + "&bm-ask=1");
      else offerFile();
    }).then(null, offerFile);
  }

  return { run: run, pathFrom: pathFrom, file: file };
})();
