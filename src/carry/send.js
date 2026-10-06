/* ===========================================================================
   Basic Mathematics — sending progress from the old address
   The first script of every page of the legacy site (tools/build-legacy.js writes
   dist-legacy/, which GitHub Pages serves once the site has moved): it reads what
   this browser saved at the old address and takes the reader to the same page at the
   new one, with that progress in the address's fragment, which is never sent to any
   server. It leaves with location.replace from a page whose referrer policy sends this
   origin (tools/build-legacy.js writes the <meta name="referrer">): the new address
   reads the fragment only when the referrer is this origin (src/carry/format.ts
   fromLegacy), asks the reader, and only adds what that browser does not have.

   The fragment is #bm-carry=<format><packing><data>[&bm-at=<the old fragment>]:
     format   "1", the one this file writes; the new address refuses any other
     packing  "z": the data deflated (CompressionStream "deflate-raw"), "j": as it is,
              where the browser cannot compress
     data     base64url of the UTF-8 of JSON {"v":1,"s":{<key>:<value>,…}[,"w":1]}: the
              stores the new address may take (TAKEN: the progress the site syncs, and
              the settings), each whose value is JSON. Nothing of an account: when this
              browser was signed in here (bm.sync.v1 names an account), its synced
              stores are that account's copy, which the account brings back when the
              reader signs in at the new address, so they stay here and only "w":1 says
              that the reader was signed in. No session, no account binding, no progress
              set aside for a reader, no other key.
   The old fragment is left out when it is itself a carried payload (bm-carry=…), so a
   link to an old page cannot have one sent on as if this page had written it.
   Too long for an address (cfg.limit), the reader goes to the carry page instead,
   which offers the same data as a file to import at the new address.

   Plain ES5 and no comment marker or closing script tag inside a string, because it
   is inlined as it is (tools/build-legacy.js refuses a closing script tag in it). It must never leave a
   reader stuck: anything that goes wrong sends them on without the data, and so does
   a compression that has not finished within three seconds.
   =========================================================================== */
var BMCarrySend = (function () {
  "use strict";
  var PARAM = "bm-carry";
  var AT = "bm-at";
  var FORMAT = "1";
  /* the stores the site syncs to an account (format.ts SYNCED), and the settings that
     stay on a device (DEVICE): every key the new address may take (TAKEN) */
  var SYNCED = ["bm.progress.v1", "bm.play.v1", "bm.attempts.v1", "bm.activity.v1", "bm.lesson.v1", "bm.last", "bm.game.v1"];
  var DEVICE = ["bm.prefs.v1", "bm.theme"];
  var TAKEN = SYNCED.concat(DEVICE);

  /* whether this browser was signed in here: bm.sync.v1 (account.js META_KEY) names an
     account. Only that it was is sent, nothing of which */
  function signedIn(storage) {
    var m = null;
    try { m = JSON.parse(storage.getItem("bm.sync.v1")); } catch (e) { m = null; }
    return !!(m && typeof m === "object" && typeof m.user === "string" && m.user);
  }

  /* the old page's own fragment, unless it is a carried payload or too long for an anchor */
  function anchor(hash) {
    var at = String(hash || "").replace(/^#+/, "");
    return at.length > 200 || at.indexOf(PARAM + "=") >= 0 || at.indexOf(AT + "=") >= 0 ? "" : at;
  }

  /* every key that is sent, with its value parsed, in order; a value that is not JSON is
     left behind, as the site itself reads it as missing. Signed in, the synced stores
     are the account's and stay. */
  function collect(storage) {
    var stores = {}, count = 0, was = false, i;
    try { was = signedIn(storage); } catch (e) { was = false; }
    var keys = TAKEN.slice().sort();
    for (i = 0; i < keys.length; i++) {
      var k = keys[i], raw = null;
      if (was && SYNCED.indexOf(k) >= 0) continue;
      try { raw = storage.getItem(k); } catch (e) { raw = null; }
      if (raw === null) continue;
      try { stores[k] = JSON.parse(raw); count++; } catch (e) { /* unreadable here too */ }
    }
    return { stores: stores, count: count, signedIn: was };
  }

  function utf8(text) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(text);
    var bin = unescape(encodeURIComponent(text)), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function base64url(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  /* the value of the bm-carry parameter for these stores (and whether the reader was
     signed in here); resolves, never rejects */
  function encode(stores, was) {
    var payload = { v: 1, s: stores };
    if (was) payload.w = 1;
    var bytes = utf8(JSON.stringify(payload));
    var plain = FORMAT + "j" + base64url(bytes);
    if (typeof CompressionStream !== "function" || typeof Response !== "function" || typeof Blob !== "function") return Promise.resolve(plain);
    try {
      var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
      return new Response(stream).arrayBuffer().then(function (buf) {
        var packed = FORMAT + "z" + base64url(new Uint8Array(buf));
        return packed.length < plain.length ? packed : plain;
      }, function () { return plain; });
    } catch (e) { return Promise.resolve(plain); }
  }

  /* The address at the new site for the page being left, with the progress or without.
     cfg: { to: the new address of this page (origin and path, no query),
            path: that path alone, for the carry page,
            carry: the carry page, relative to this page,
            limit: the longest value the address may carry,
            bare: true to send neither this address's query nor its fragment (404.html) } */
  function go(cfg) {
    var loc = window.location, query = cfg.bare ? "" : loc.search || "", at = cfg.bare ? "" : anchor(loc.hash);
    var plain = cfg.to + query + (at ? "#" + at : ""), done = false;
    function leave(url) {
      if (done) return;
      done = true;
      try { loc.replace(url); } catch (e) { loc.href = url; }
    }
    var got;
    try { got = collect(window.localStorage); } catch (e) { got = { count: 0, signedIn: false }; }
    if ((!got.count && !got.signedIn) || typeof Promise !== "function") return leave(plain);
    setTimeout(function () { leave(plain); }, 3000);
    encode(got.stores, got.signedIn).then(function (value) {
      if (value.length > cfg.limit) {
        leave(cfg.carry + "?to=" + encodeURIComponent(cfg.path + query) + (at ? "#" + at : ""));
      } else {
        leave(cfg.to + query + "#" + PARAM + "=" + value + (at ? "&" + AT + "=" + encodeURIComponent(at) : ""));
      }
    }).then(null, function () { leave(plain); });
  }

  return { PARAM: PARAM, AT: AT, FORMAT: FORMAT, TAKEN: TAKEN, collect: collect, encode: encode, anchor: anchor, go: go };
})();
