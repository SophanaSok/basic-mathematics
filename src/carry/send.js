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
     data     base64url of the UTF-8 of JSON {"v":1,"s":{<key>:<value>,…}[,"a":{…}]},
              every localStorage key that starts with "bm." and whose value is JSON, but
              the two that name an account or the new address's own record (KEEP_OUT). A
              Supabase session ("sb-…-auth-token") never starts with "bm.", and a key
              that names an auth token is left out whatever it starts with. When this
              browser was signed in here (bm.sync.v1 names an account), "a" is that
              account's id and last reset ({"user","resetAt"}, nothing else of it): the
              progress is that account's, and the new address keeps it for that account
              alone (src/carry/format.ts, "Whose progress it is").
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
  /* the account this browser's progress belongs to (account.js META_KEY): without the
     session it means nothing at the new address, and there it would make the next
     sign-in treat the progress as another reader's; and what the new address records
     about carries it has taken in */
  var KEEP_OUT = ["bm.sync.v1", "bm.carry.v1"];

  /* the account this browser's progress belongs to, or null */
  function ownerOf(storage) {
    var m = null;
    try { m = JSON.parse(storage.getItem("bm.sync.v1")); } catch (e) { m = null; }
    if (!m || typeof m !== "object" || typeof m.user !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(m.user)) return null;
    var r = Number(m.resetAt);
    return { user: m.user, resetAt: isFinite(r) && r > 0 ? r : 0 };
  }

  /* the old page's own fragment, unless it is a carried payload or too long for an anchor */
  function anchor(hash) {
    var at = String(hash || "").replace(/^#+/, "");
    return at.length > 200 || at.indexOf(PARAM + "=") >= 0 || at.indexOf(AT + "=") >= 0 ? "" : at;
  }

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
    } catch (e) { return { stores: stores, count: 0, owner: null }; }
    keys.sort();
    for (i = 0; i < keys.length; i++) {
      var k = keys[i], raw = null;
      if (!carried(k)) continue;
      try { raw = storage.getItem(k); } catch (e) { raw = null; }
      if (raw === null) continue;
      try { stores[k] = JSON.parse(raw); count++; } catch (e) { /* unreadable here too */ }
    }
    var owner = null;
    try { owner = ownerOf(storage); } catch (e) { owner = null; }
    return { stores: stores, count: count, owner: owner };
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

  /* the value of the bm-carry parameter for these stores (and their owner, or none);
     resolves, never rejects */
  function encode(stores, owner) {
    var payload = { v: 1, s: stores };
    if (owner) payload.a = { user: owner.user, resetAt: owner.resetAt };
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
    try { got = collect(window.localStorage); } catch (e) { got = { count: 0 }; }
    if (!got.count || typeof Promise !== "function") return leave(plain);
    setTimeout(function () { leave(plain); }, 3000);
    encode(got.stores, got.owner).then(function (value) {
      if (value.length > cfg.limit) {
        leave(cfg.carry + "?to=" + encodeURIComponent(cfg.path + query) + (at ? "#" + at : ""));
      } else {
        leave(cfg.to + query + "#" + PARAM + "=" + value + (at ? "&" + AT + "=" + encodeURIComponent(at) : ""));
      }
    }).then(null, function () { leave(plain); });
  }

  return { PARAM: PARAM, AT: AT, FORMAT: FORMAT, KEEP_OUT: KEEP_OUT, carried: carried, collect: collect, encode: encode, anchor: anchor, go: go };
})();
