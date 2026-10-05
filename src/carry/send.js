/* ===========================================================================
   Basic Mathematics — sending progress from the old address
   The first script of every page of the legacy site (tools/build-legacy.js writes
   dist-legacy/, which GitHub Pages serves once the site has moved): it reads what
   this browser saved at the old address and takes the reader to the same page at the
   new one, with that progress in the address's fragment, which is never sent to any
   server. The new address asks the reader before it keeps any of it
   (src/ui/carry.ts) and merges it with what is there (src/carry/format.ts).

   The fragment is #bm-carry=<format><packing><data>[&bm-at=<the old fragment>]:
     format   "1", the one this file writes; the new address refuses any other
     packing  "z": the data deflated (CompressionStream "deflate-raw"), "j": as it is,
              where the browser cannot compress
     data     base64url of the UTF-8 of JSON {"v":1,"s":{<key>:<value>,…}}, every
              localStorage key that starts with "bm." and whose value is JSON, but the
              two that name an account or the new address's own record (KEEP_OUT). A
              Supabase session ("sb-…-auth-token") never starts with "bm.", and a key
              that names an auth token is left out whatever it starts with.
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
  /* the account this browser's progress belongs to (account.js META_KEY): without the
     session it means nothing at the new address, and there it would make the next
     sign-in treat the progress as another reader's; and what the new address records
     about carries it has taken in */
  var KEEP_OUT = ["bm.sync.v1", "bm.carry.v1"];

  function carried(key) {
    return typeof key === "string" && key.indexOf("bm.") === 0 && KEEP_OUT.indexOf(key) < 0 &&
      key.toLowerCase().indexOf("auth-token") < 0;
  }

  /* every carried key with its value parsed, keys in order; a value that is not JSON is
     left behind, as the site itself reads it as missing */
  function collect(storage) {
    var stores = {}, count = 0, keys = [], i;
    try {
      for (i = 0; i < storage.length; i++) keys.push(storage.key(i));
    } catch (e) { return { stores: stores, count: 0 }; }
    keys.sort();
    for (i = 0; i < keys.length; i++) {
      var k = keys[i], raw = null;
      if (!carried(k)) continue;
      try { raw = storage.getItem(k); } catch (e) { raw = null; }
      if (raw === null) continue;
      try { stores[k] = JSON.parse(raw); count++; } catch (e) { /* unreadable here too */ }
    }
    return { stores: stores, count: count };
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

  /* the value of the bm-carry parameter for these stores; resolves, never rejects */
  function encode(stores) {
    var bytes = utf8(JSON.stringify({ v: 1, s: stores }));
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
            limit: the longest value the address may carry } */
  function go(cfg) {
    var loc = window.location, query = loc.search || "", at = loc.hash ? loc.hash.replace(/^#/, "") : "";
    var plain = cfg.to + query + (at ? "#" + at : ""), done = false;
    function leave(url) {
      if (done) return;
      done = true;
      try { loc.replace(url); } catch (e) { loc.href = url; }
    }
    var got;
    try { got = collect(window.localStorage); } catch (e) { got = { count: 0 }; }
    if (!got.count || typeof Promise !== "function") return leave(plain);
    setTimeout(function () { leave(plain); }, 3000);
    encode(got.stores).then(function (value) {
      if (value.length > cfg.limit) {
        leave(cfg.carry + "?to=" + encodeURIComponent(cfg.path + query) + (at ? "#" + at : ""));
      } else {
        leave(cfg.to + query + "#" + PARAM + "=" + value + (at ? "&" + AT + "=" + encodeURIComponent(at) : ""));
      }
    }).then(null, function () { leave(plain); });
  }

  return { PARAM: PARAM, AT: AT, FORMAT: FORMAT, KEEP_OUT: KEEP_OUT, carried: carried, collect: collect, encode: encode, go: go };
})();
