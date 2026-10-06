#!/usr/bin/env node
/* Progress carried from the old address to the new one, in headless Chromium, across two
   origins as readers will have them, and a third that is neither:
     node tools/game/carry.test.js

   The new address is the build in dist/ (lib/target.js picks it, and it must be
   current), served as Cloudflare Pages serves it, _headers and all (lib/serve.js), at
   http://localhost:<port>. The old address is the legacy site, built here by
   tools/build-legacy.js into .cache/carry/legacy/ with that local address as its new
   origin and served at LEGACY_LOCAL (src/carry/origins.ts, http://127.0.0.1) on a port
   of its own, with 404.html for a missing path as GitHub Pages does: the new address
   takes carried progress from a page of that host as it takes it from sophanasok.github.io
   in production (format.ts fromLegacy). A third server, at http://localhost:<another
   port>, stands for any other site. Each is its own origin, with its own localStorage. A
   blank page on each (/__seed/) is how a case puts progress into one of them without
   running a site's scripts, and how a case starts a navigation from that origin. Every
   request to any other server is aborted. The format's own rules and the add-only laws
   are src/carry/format.test.ts.

   1. a reader with progress at the old address opens an old chapter link (with its own
      #anchor): it goes to the same chapter at the new address once, with the progress
      in the fragment and the old origin as the referrer (the stub's own referrer
      policy); the new address asks, saying in counts what it adds; yes adds it to the
      progress already there (both kept, nothing here changed); a Supabase session left
      behind, an account record and another site's key never arrive; the fragment is
      gone and the anchor back; a reload and a second visit to the old link ask nothing
   1b. a reader who was signed in at the old address: their progress stays there (their
      account brings it), the question adds only the settings and says to sign in here;
      with no settings to add, a note says the same
   2. no leaves everything as it was, and the old link is not asked about again; the
      carry page, which a reader reaches by asking for it, asks again, and yes then
      brings it over
   3. a link to the new address with a payload, from a third origin, from no page at all,
      or from the new address itself: not read, nothing asked, nothing stored, the
      fragment gone, and a note pointing to the progress page. Crafted payloads that do
      come from the old origin (which only its owner can publish): refused with a note
      when they are not progress, and otherwise only ever adding (review round 3's lower
      review boxes and not-first answers among them); no markup from them reaches the
      page; an old page whose own fragment is a payload sends the genuine progress
   4. the file "Download my data" makes, imported on the progress page, goes through the
      same question and only adds; a file that is not one is refused
   5. with JavaScript off, an old page's meta refresh takes the reader to the new
      address, without any progress
   6. progress too long for an address: the old page sends the reader to the carry page,
      which offers it as a file; that file, imported at the new address, brings it over
   7. the carry page, as the progress page's link reaches it, sends the progress back
      to the page it was asked for; the link itself points at the old address's carry
      page; an unknown old path (404.html, a folder such as parts/1-algebra/) goes to
      the front page of the new address, which asks about the progress it brings
   8. the course served at the old address's own origin (sophanasok.github.io, answered
      here from dist/), as it is until SITE_CUTOVER: no question, and none of what is
      true only after the move (the about page's paragraph, the progress page's tools)
   10. review round 4: a page of another origin that opens the old address in a window
      keeps no handle on it once the new address arrives there (every page here is sent
      with Cross-Origin-Opener-Policy: same-origin, lib/headers.js), so it cannot put a
      fragment of its own on the page that arrived with the old origin as its referrer:
      not after it arrived (then reloaded, or gone away from and come back to), and not
      in the instant it arrives. And a fragment on the page after its own first load
      (put there here as such a page would, then reloaded) is not read
   11. a yes whose progress could not be saved (storage full) is not recorded as
      answered: the same link asks again once there is room
   9. no page error and no Content-Security-Policy violation on any origin */
"use strict";
const fs = require("fs");
const path = require("path");
const site = require("../lib/site");
const target = require("../lib/target");
const serve = require("../lib/serve");
const origins = require("../lib/origins");
const legacy = require("../build-legacy");
const { chromium } = require("../lib/pw").playwright();

let fails = 0, passes = 0;
function check(cond, what, detail) {
  if (cond) passes++;
  else { fails++; console.error("FAIL " + what + (detail === undefined ? "" : "\n     " + JSON.stringify(detail))); }
}
const eq = (a, b, what) => check(JSON.stringify(a) === JSON.stringify(b), what, { got: a, want: b });

const CACHE = path.join(site.ROOT, ".cache", "carry");
const SEED = path.join(CACHE, "seed");
const FIXTURE = JSON.parse(fs.readFileSync(path.join(site.ROOT, "tools/fixtures/state-v1.json"), "utf8")).storage;
const SESSION = "sb-jfidvrzonyzfstnykzly-auth-token";

(async () => {
  const picked = target.pick(site.parseArgs(process.argv.slice(2)));
  fs.rmSync(CACHE, { recursive: true, force: true });
  fs.mkdirSync(SEED, { recursive: true });
  fs.writeFileSync(path.join(SEED, "index.html"), "<!doctype html><title>seed</title><p>seed</p>\n");
  const extraRoots = { "/__seed/": SEED };
  const fresh = await serve.start(picked.root, site.DEFAULT_BASE, { gitRoot: site.ROOT, extraRoots, notFound: true });
  const NEW = "http://localhost:" + fresh.port;
  const built = legacy.build({ out: path.join(CACHE, "legacy"), origin: NEW, base: "/" });
  const old = await serve.start(built.out, site.DEFAULT_BASE, { gitRoot: site.ROOT, extraRoots, notFound: true });
  const OLD = origins.read(site.ROOT).legacyLocal + ":" + old.port;
  const third = await serve.start(SEED, site.DEFAULT_BASE, { gitRoot: site.ROOT, extraRoots });
  const THIRD = "http://localhost:" + third.port;
  console.log("carry: new address " + NEW + " (" + picked.label + "), old address " + OLD + " (" + site.rel(built.out) + "/), another site " + THIRD);
  const browser = await chromium.launch({ env: require("../lib/gl").env(chromium) });   /* off the machine's GPU: lib/gl.js */
  const errors = [];

  /* a fresh browser profile; `visits` counts the documents each origin served, and
     `referers` the Referer each document request to the new address went with */
  async function profile(opts) {
    const context = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }, opts || {}));
    const visits = { old: [], fresh: [] }, referers = [];
    await context.route(/^(https?|wss?):/, (r) => {
      const u = r.request().url();
      if (u.startsWith(OLD + "/") || u.startsWith(NEW + "/") || u.startsWith(THIRD + "/")) {
        if (r.request().resourceType() === "document") {
          if (u.startsWith(OLD)) visits.old.push(u);
          if (u.startsWith(NEW)) { visits.fresh.push(u); referers.push(r.request().headers()["referer"] || ""); }
        }
        return r.continue();
      }
      return r.abort();
    });
    /* the address each document arrived at, fragment and all (a request's URL has none),
       and the referrer it saw */
    await context.addInitScript(() => { window.__arrived = location.href; window.__referrer = document.referrer; });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(page.url().slice(0, 60) + ": " + e.message));
    /* an unknown path is answered 404 on purpose (case 7), which Chromium reports */
    page.on("console", (m) => { if (m.type() === "error" && !(/99-nothing|\/parts\/1-algebra\/$/.test(page.url()) && /status of 404/.test(m.text()))) errors.push(page.url().slice(0, 60) + ": console: " + m.text()); });
    return { context, page, visits, referers };
  }
  async function seed(page, origin, storage) {
    await page.goto(origin + "/__seed/");
    await page.evaluate((s) => { Object.keys(s).forEach((k) => localStorage.setItem(k, typeof s[k] === "string" && /^(sb-|other)/.test(k) ? s[k] : JSON.stringify(s[k]))); }, storage);
  }
  async function storageOf(page, origin) {
    await page.goto(origin + "/__seed/");
    return page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
  }
  /* a page of `origin` sends the browser to `url` with location.replace, as the legacy
     stubs do: the navigation's referrer is that origin */
  async function from(page, origin, url) {
    await page.goto(origin + "/__seed/");
    await Promise.all([page.waitForURL((u) => String(u).startsWith(NEW)), page.evaluate((to) => { location.replace(to); }, url)]);
  }
  const parse = (v) => { try { return JSON.parse(v); } catch (e) { return v; } };
  /* a payload as a link to the new address can carry it, uncompressed */
  const pack = (payload) => "1j" + Buffer.from(JSON.stringify(payload)).toString("base64url");
  async function question(page) {
    await page.waitForSelector("dialog.carry-ask[open]");
    return page.evaluate(() => {
      const d = document.querySelector("dialog.carry-ask");
      const s = d.querySelector(".carry-signed-in");
      const a = d.querySelector(".carry-account");
      return { title: d.querySelector("h2").textContent, what: d.querySelector(".carry-what").textContent, signedIn: s ? s.textContent : null, account: a ? a.textContent : null, modal: d.matches(":modal"), focus: document.activeElement && document.activeElement.textContent };
    });
  }
  /* in any key order: records are built in their own */
  const sorted = (x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sorted(x[k])])) : x);
  const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
  /* a reader who is signed out at the old address (a session key left behind by another
     tool would still never be carried), with progress set aside for an account that
     signed out there with it unsaved */
  const oldState = Object.assign({}, FIXTURE, {
    [SESSION]: JSON.stringify({ access_token: "secret-token", user: { id: "u-1" } }),
    "bm.sync.pending.v1": { "u-9": { email: "a@b.c", via: ["github"], resetAt: 0, state: { progress: { ch03: { solved: { e2: true }, total: 9 } } }, at: 1789214400000 } },
    "other.app": "not the site's"
  });
  /* a reader who is signed in at the old address */
  const signedIn = Object.assign({}, FIXTURE, {
    [SESSION]: JSON.stringify({ access_token: "secret-token", user: { id: "u-1" } }),
    "bm.sync.v1": { user: "u-1", resetAt: 5 }
  });
  const newState = {
    "bm.progress.v1": { ch09: { solved: { e4: true }, total: 8 }, ch01: { solved: { e11: true }, total: 11 } },
    "bm.last": { id: "ch09", section: null },
    "bm.prefs.v1": { sound: false, calm: true }
  };
  /* the fixture's, less what newState's browser already has: its place to continue, its
     settings, and First light, which the page here unlocks for newState's own solved
     exercises before it asks */
  const SAYS = "23 exercises solved, 31 answer records, 3 missions done, your place in 3 lessons, 519 XP over 5 days, 2 achievements, 1 medal, 2 best scores, 9 review sections, 2 Dailies played and your theme.";

  /* 1. yes */
  {
    const { context, page, visits, referers } = await profile();
    await seed(page, OLD, oldState);
    await seed(page, NEW, newState);
    visits.old.length = 0; visits.fresh.length = 0; referers.length = 0;
    await page.goto(OLD + "/parts/1-algebra/01-numbers.html#integers");
    const q = await question(page);
    check(/^Bring over your progress from the old address\?$/.test(q.title), "1 the new address asks", q);
    eq(q.what, SAYS, "1 … saying in counts what it adds (this browser's place to continue and settings stay)");
    const ach = await page.evaluate(() => Object.keys((JSON.parse(localStorage.getItem("bm.game.v1")) || {}).ach || {}));
    check(ach.includes("first-light") && !ach.includes("full-meter"), "1 … the one achievement it does not name is one this browser already has", ach);
    check(q.signedIn === null, "1 … and nothing about signing in", q.signedIn);
    check(q.modal && q.focus === "Bring it over", "1 … in a modal dialog, focus on the answer", q);
    check(/^If you sign in here, now or later, it joins your account like any progress made in this browser/.test(q.account || ""), "1 … saying that it joins an account signed in to here, as anything done here does", q.account);
    eq(new URL(page.url()).pathname + new URL(page.url()).hash, "/parts/1-algebra/01-numbers#integers", "1 at the same chapter, the fragment already gone and the anchor back");
    eq(visits.old.length, 1, "1 the old address was loaded once");
    const arrived = await page.evaluate(() => ({ href: window.__arrived, referrer: window.__referrer }));
    check(visits.fresh.length === 1 && /^[^#]*\/parts\/1-algebra\/01-numbers#bm-carry=1z[A-Za-z0-9_-]+&bm-at=integers$/.test(arrived.href), "1 the new address once, with the progress, compressed, and the anchor", { visits: visits.fresh, arrived: arrived.href.slice(0, 120) });
    /* the stub's referrer policy sends its origin, and nothing of its path */
    eq(arrived.referrer, OLD + "/", "1 the new page's document.referrer is the old origin");
    eq(referers[0], OLD + "/", "1 … as was the request's Referer");
    await page.click("[data-carry-yes]");
    await page.waitForSelector(".carry-note");
    check(/Your progress is here/.test(await page.textContent(".carry-note")), "1 yes says it is here");
    check(!(await page.$("dialog.carry-ask")), "1 the dialog is gone");
    const level = await page.getAttribute(".hud-level", "aria-label");
    check(level && !/^Level 1,/.test(level), "1 the HUD shows the carried XP without a reload", level);
    const s = await storageOf(page, NEW);
    const p = parse(s["bm.progress.v1"]);
    const fp = FIXTURE["bm.progress.v1"];
    const all = Object.keys(fp).every((ch) => Object.keys(fp[ch].solved).every((k) => p[ch] && p[ch].solved[k]));
    check(all && p.ch09.solved.e4 && p.ch01.solved.e11 && p.ch09.total === 8 && p.ch01.total >= 10, "1 every solved exercise of both sides is there, and this browser's totals", p);
    check(["ch09", "ch01"].includes(parse(s["bm.last"]).id), "1 the new address keeps its own place to continue", s["bm.last"]);
    eq(parse(s["bm.prefs.v1"]), { sound: false, calm: true }, "1 and its own settings");
    eq(parse(s["bm.theme"]), FIXTURE["bm.theme"], "1 the theme it lacked arrives");
    check(parse(s["bm.game.v1"]) && parse(s["bm.game.v1"]).enc && parse(s["bm.game.v1"]).enc["ch01/practice"], "1 the game record arrives", s["bm.game.v1"]);
    const keys = Object.keys(s);
    check(!keys.some((k) => /^sb-|auth-token/.test(k)) && !keys.includes("bm.sync.v1") && !keys.includes("bm.sync.pending.v1") && !keys.includes("other.app"), "1 no session, no account record, no other key", keys);
    eq(parse(s["bm.attempts.v1"]).ch01.t1, FIXTURE["bm.attempts.v1"].ch01.t1, "1 an attempt arrives as it was written");
    check(!JSON.stringify(s).includes("secret-token") && !JSON.stringify(s).includes("a@b.c"), "1 the session's token and the set-aside record are nowhere");
    check(parse(s["bm.carry.v1"]) && Object.values(parse(s["bm.carry.v1"]).seen)[0].took === true, "1 the answer is recorded", s["bm.carry.v1"]);
    await page.goto(NEW + "/parts/1-algebra/01-numbers");
    await page.waitForTimeout(400);
    check(!(await page.$("dialog.carry-ask")), "1 a reload asks nothing");
    await page.goto(OLD + "/parts/1-algebra/01-numbers.html");
    await page.waitForURL(NEW + "/parts/1-algebra/01-numbers");
    await page.waitForTimeout(600);
    check(!(await page.$("dialog.carry-ask")), "1 the same progress from the old link is not asked about again");
    eq(new URL(page.url()).hash, "", "1 … and its fragment is gone");
    await context.close();
  }

  /* 1b. signed in at the old address */
  {
    const { context, page } = await profile();
    await seed(page, OLD, signedIn);
    await seed(page, NEW, newState);
    await page.goto(OLD + "/progress.html");
    const q = await question(page);
    eq(q.what, "Your theme.", "1b only the settings this browser lacks are brought; the account's progress stays with it");
    check(/^You were signed in at the old address: sign in here with the same account/.test(q.signedIn || ""), "1b the question says to sign in here", q.signedIn);
    await page.click("[data-carry-yes]");
    await page.waitForSelector(".carry-note");
    const s = await storageOf(page, NEW);
    eq(parse(s["bm.progress.v1"]), newState["bm.progress.v1"], "1b this browser's progress is not touched");
    check(!Object.keys(s).some((k) => /^sb-|auth-token/.test(k)) && !("bm.sync.v1" in s) && !("bm.sync.pending.v1" in s), "1b no session, no account record", Object.keys(s));
    eq(parse(s["bm.theme"]), FIXTURE["bm.theme"], "1b the theme it lacked arrives");
    await context.close();
    /* nothing to add: a note says to sign in */
    const again = await profile();
    await seed(again.page, OLD, { "bm.sync.v1": { user: "u-1" }, "bm.progress.v1": FIXTURE["bm.progress.v1"] });
    await again.page.goto(OLD + "/index.html");
    await again.page.waitForSelector(".carry-note");
    check(!(await again.page.$("dialog.carry-ask")) && /^You were signed in at the old address/.test(await again.page.textContent(".carry-note p")), "1b with nothing else, a note says to sign in here", await again.page.textContent(".carry-note"));
    const t = await storageOf(again.page, NEW);
    check(!t["bm.progress.v1"] || !Object.keys(parse(t["bm.progress.v1"])).length, "1b … and no progress arrives", t["bm.progress.v1"]);
    await again.context.close();
  }

  /* 2. no */
  {
    const { context, page } = await profile();
    await seed(page, OLD, oldState);
    await page.goto(OLD + "/index.html");
    await question(page);
    await page.click("[data-carry-no]");
    await page.waitForTimeout(200);
    eq(new URL(page.url()).hash, "", "2 the fragment is gone");
    const s = await storageOf(page, NEW);
    check(!s["bm.progress.v1"] || !Object.keys(parse(s["bm.progress.v1"])).some((ch) => Object.keys(parse(s["bm.progress.v1"])[ch].solved || {}).length), "2 no leaves no progress", s["bm.progress.v1"]);
    check(!s["bm.theme"], "2 nor settings", s["bm.theme"]);
    check(parse(s["bm.carry.v1"]) && Object.values(parse(s["bm.carry.v1"]).seen)[0].took === false, "2 the answer is recorded", s["bm.carry.v1"]);
    await page.goto(OLD + "/index.html");
    await page.waitForURL(NEW + "/");
    await page.waitForTimeout(600);
    check(!(await page.$("dialog.carry-ask")), "2 and the same progress is not asked about again");
    await page.goto(OLD + "/carry/?to=" + encodeURIComponent("/progress"));
    const again = await question(page);
    check(/^23 exercises solved/.test(again.what), "2 asked for, the carry page brings the same progress and it is asked about again", again);
    eq(new URL(page.url()).hash, "", "2 … with the fragment gone");
    await page.click("[data-carry-yes]");
    await page.waitForSelector(".carry-note");
    const after = await storageOf(page, NEW);
    check(parse(after["bm.progress.v1"]) && parse(after["bm.progress.v1"]).ch05 && parse(after["bm.progress.v1"]).ch05.solved.e10, "2 and yes then brings it over", after["bm.progress.v1"]);
    await context.close();
  }

  /* 3. a link that did not come from the old address: from another site, typed or opened
     with no page before it, and from the new address itself. The payload is the one an
     attacker would write: every review box 0, every answer not first, a goal of 5. */
  {
    const sec = {}, worse = {};
    Object.keys(FIXTURE["bm.game.v1"].sec).forEach((id) => { sec[id] = { n: 0, ok: 0, box: 0, last: new Date().toISOString().slice(0, 10) }; });
    Object.keys(FIXTURE["bm.attempts.v1"].ch01).forEach((k) => { worse[k] = { solved: Date.UTC(2024, 0, 1), first: 0, tries: 1000, hints: 10 }; });
    const crafted = NEW + "/index.html#bm-carry=" + pack({ v: 1, s: { "bm.game.v1": { sec }, "bm.attempts.v1": { ch01: worse, ch14: { e1: { solved: Date.UTC(2026, 0, 1), first: 1 } } }, "bm.progress.v1": { ch14: { solved: { e1: true } } }, "bm.activity.v1": { goal: 5 } } }) + "&bm-at=top";
    for (const [what, go] of [
      ["from another site", (page) => from(page, THIRD, crafted)],
      ["with no page before it", (page) => page.goto(crafted)],
      ["from the new address itself", (page) => from(page, NEW, crafted)]
    ]) {
      const { context, page } = await profile();
      await seed(page, NEW, FIXTURE);
      const before = await storageOf(page, NEW);
      await go(page);
      await page.waitForSelector(".carry-note");
      const note = await page.textContent(".carry-note p");
      check(/did not come from the old address, so it was not read and nothing was changed/.test(note), "3 a link " + what + " is not read, and a note says so", note);
      const href = await page.getAttribute(".carry-note a", "href");
      check(href === NEW + "/progress.html#carry", "3 " + what + ": the note links the progress page's carry tools", href);
      check(!(await page.$("dialog.carry-ask")), "3 " + what + ": nothing is asked");
      eq(new URL(page.url()).hash, "#top", "3 " + what + ": the fragment is gone, the anchor back");
      await page.waitForTimeout(300);
      const after = await storageOf(page, NEW);
      for (const k of ["bm.progress.v1", "bm.attempts.v1", "bm.game.v1", "bm.activity.v1"]) {
        /* opening the page may add to these on its own (a lesson seen); nothing of the link */
        check(!/ch14|"goal":5[,}]/.test(after[k] || "") && (k !== "bm.game.v1" || same(parse(after[k]).sec, parse(before[k]).sec)) && (k !== "bm.attempts.v1" || same(parse(after[k]).ch01, parse(before[k]).ch01)), "3 " + what + ": nothing of it is in " + k, { before: (before[k] || "").slice(0, 200), after: (after[k] || "").slice(0, 200) });
      }
      check(!after["bm.carry.v1"], "3 " + what + ": it is not even recorded as asked", after["bm.carry.v1"]);
      await context.close();
    }
  }
  /* payloads that do come from the old origin (only its owner can publish there, and its
     pages send only what the old origin's storage holds), as a defence behind the first */
  {
    const cases = [
      ["a session key", pack({ v: 1, s: { "bm.progress.v1": {}, [SESSION]: "x" } }), /not progress from this site/],
      ["a key of another site", pack({ v: 1, s: { "evil": 1 } }), /not progress from this site/],
      ["an oversized fragment", "1j" + "A".repeat(40000), /larger than any progress/],
      ["another format", "2z" + "AAAA", /different version/],
      ["v 2 inside", pack({ v: 2, s: {} }), /different version/],
      ["a game record newer than the site", pack({ v: 1, s: { "bm.game.v1": { v: 2 }, "bm.progress.v1": { ch01: { solved: { e1: true } } } } }), /different version/],
      ["nothing the site writes", pack({ v: 1, s: { "bm.attempts.v1": { ch01: { t1: { solved: "x", tries: "y" } } }, "bm.sync.pending.v1": { u: { state: { progress: { ch01: { solved: { e1: true } } } } } } } }), /nothing this browser does not already have/],
      ["garbage", "1j%%%", /could not be read/]
    ];
    for (const [what, value, says] of cases) {
      const { context, page } = await profile();
      await from(page, OLD, NEW + "/index.html#bm-carry=" + value);
      await page.waitForSelector(".carry-note");
      const note = await page.textContent(".carry-note");
      check(says.test(note) && /was not brought over/.test(note), "3 from the old origin, " + what + " is refused with a note", note);
      check(!(await page.$("dialog.carry-ask")), "3 " + what + ": nothing is asked");
      eq(new URL(page.url()).hash, "", "3 " + what + ": the fragment is gone");
      const s = await storageOf(page, NEW);
      check(!Object.keys(s).some((k) => /^sb-|^evil|pending/.test(k)), "3 " + what + ": nothing of it is stored", Object.keys(s));
      await context.close();
    }
    /* markup in what is carried is never markup on the page */
    const { context, page } = await profile();
    const tag = '<img src=x onerror="window.__pwned=1">';
    await from(page, OLD, NEW + "/index.html#bm-carry=" + pack({ v: 1, s: { "bm.progress.v1": { [tag]: { solved: { e1: true } }, ch01: { solved: { [tag]: true }, total: 1 } }, "bm.last": { id: tag, section: tag } } }));
    const q = await question(page);
    check(!/</.test(q.what) && q.what === "1 exercise solved.", "3 the question counts what markup holds and shows none of it (a chapter the course lacks, and a place to continue in one, are left out)", q.what);
    check(!(await page.evaluate(() => !!document.querySelector("dialog img, .carry-note img") || !!window.__pwned)), "3 no element is made from it");
    await page.click("[data-carry-no]");
    await context.close();
  }
  /* review round 3, from the old origin: lower review boxes, answers made not-first, the
     Daily up to tomorrow, a made-up achievement, a theme this browser has: only what this
     browser lacks is added, and the question says exactly that */
  {
    const { context, page } = await profile();
    await seed(page, NEW, FIXTURE);
    const today = new Date().toISOString().slice(0, 10);
    const sec = {}, worse = {}, daily = {};
    Object.keys(FIXTURE["bm.game.v1"].sec).forEach((id) => { sec[id] = { n: 0, ok: 0, box: 0, last: today }; });
    Object.keys(FIXTURE["bm.attempts.v1"].ch01).forEach((k) => { worse[k] = { solved: Date.UTC(2024, 0, 1), first: 0, tries: 1000, hints: 10 }; });
    for (let i = -1; i < 59; i++) daily[new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)] = 1;
    await from(page, OLD, NEW + "/index.html#bm-carry=" + pack({ v: 1, s: { "bm.game.v1": { sec, daily, ach: { "no-such-achievement": 1789214400000 } }, "bm.attempts.v1": { ch01: worse }, "bm.progress.v1": { zz: { solved: { e1: true } } }, "bm.theme": "light", "bm.activity.v1": { goal: 5 }, "bm.lesson.v1": { mode: "steps" } } }));
    const q = await question(page);
    const own = Object.keys(FIXTURE["bm.game.v1"].daily).length;
    check(new RegExp("^\\d+ Dailies played\\.$").test(q.what), "3 only the Daily days with room left are named; nothing else is new here", q.what);
    await page.click("[data-carry-yes]");
    await page.waitForSelector(".carry-note");
    const s = await storageOf(page, NEW);
    eq(sorted(parse(s["bm.game.v1"]).sec), sorted(FIXTURE["bm.game.v1"].sec), "3 every review place here stays");
    eq(sorted(parse(s["bm.attempts.v1"]).ch01), sorted(FIXTURE["bm.attempts.v1"].ch01), "3 every attempt here stays");
    const days = parse(s["bm.game.v1"]).daily;
    check(Object.keys(FIXTURE["bm.game.v1"].daily).every((d) => days[d]) && Object.keys(days).length <= 60 && Object.keys(days).length > own && Object.keys(days).every((d) => d <= today), "3 the Daily here keeps its days, and gains none after today or past 60", Object.keys(days).length);
    check(!("zz" in parse(s["bm.progress.v1"])) && !("no-such-achievement" in parse(s["bm.game.v1"]).ach), "3 a chapter or achievement the course does not have is not kept");
    eq(parse(s["bm.theme"]), FIXTURE["bm.theme"], "3 the theme here stays");
    eq(parse(s["bm.activity.v1"]).goal, FIXTURE["bm.activity.v1"].goal, "3 the goal here stays");
    await from(page, OLD, NEW + "/progress.html#bm-carry=" + pack({ v: 1, s: { "bm.theme": "light" } }));
    await page.waitForSelector(".carry-note");
    check(!(await page.$("dialog.carry-ask")) && /nothing this browser does not already have/.test(await page.textContent(".carry-note")), "3 a payload of what this browser has is not asked about", await page.textContent(".carry-note"));
    await context.close();
  }
  /* an old page whose own fragment is a payload: the genuine progress is asked about,
     and the crafted one is not put back into the address */
  {
    const { context, page } = await profile();
    await seed(page, OLD, FIXTURE);
    await page.goto(OLD + "/index.html#bm-carry=" + pack({ v: 1, s: { "bm.theme": "light" } }));
    const q = await question(page);
    check(/^23 exercises solved/.test(q.what), "3 the old page sends the progress it holds", q.what);
    await page.click("[data-carry-yes]");
    await page.waitForSelector(".carry-note");
    eq(new URL(page.url()).hash, "", "3 and the crafted fragment is not in the address");
    await page.reload();
    await page.waitForTimeout(600);
    check(!(await page.$("dialog.carry-ask")), "3 a reload asks nothing");
    await context.close();
  }

  /* 4. a file */
  {
    const { context, page } = await profile();
    await seed(page, NEW, newState);
    await page.goto(NEW + "/progress.html");
    await page.waitForSelector("[data-carry-tools]:not([hidden])");
    const link = await page.getAttribute("[data-carry-link]", "href");
    eq(link, origins.read(site.ROOT).legacy + "carry/?to=%2Fprogress.html", "4 the progress page links the old address's carry page, back to this page");
    eq(await page.getAttribute("[data-carry-file-link]", "href"), origins.read(site.ROOT).legacy + "carry/?to=%2Fprogress.html&file=1", "4 … and its file");
    check(await page.isVisible("[data-carry-old]"), "4 … here, at the new address");
    const exported = { progress: FIXTURE["bm.progress.v1"], play: FIXTURE["bm.play.v1"], attempts: FIXTURE["bm.attempts.v1"], activity: FIXTURE["bm.activity.v1"], lesson: FIXTURE["bm.lesson.v1"], last: FIXTURE["bm.last"], game: FIXTURE["bm.game.v1"], exported: "2026-10-05T12:00:00.000Z", account: "someone@example.com", signInWith: ["github"] };
    await page.setInputFiles("[data-carry-file]", { name: "basic-mathematics-progress.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported, null, 2)) });
    const q = await question(page);
    check(/^Import the progress in this file\?$/.test(q.title) && /^23 exercises solved/.test(q.what), "4 the file is asked about like a link", q);
    await page.click("[data-carry-yes]");
    await page.waitForFunction(() => /Imported basic-mathematics-progress\.json/.test(document.querySelector("[data-carry-status]").textContent));
    const s = await page.evaluate(() => ({ p: JSON.parse(localStorage.getItem("bm.progress.v1")), last: JSON.parse(localStorage.getItem("bm.last")), activity: JSON.parse(localStorage.getItem("bm.activity.v1")), keys: Object.keys(localStorage) }));
    check(s.p.ch05 && s.p.ch05.solved.e10 && s.p.ch09.solved.e4 && s.p.ch09.total === 8, "4 the file's progress is added to what was here", s.p);
    eq(s.last, { id: "ch09", section: null }, "4 this browser's place to continue stays");
    check(!("goal" in s.activity), "4 the file's goal is not taken", s.activity);
    check(!JSON.stringify(s).includes("someone@example.com"), "4 the account's details in the file are not stored");
    await page.setInputFiles("[data-carry-file]", { name: "notes.json", mimeType: "application/json", buffer: Buffer.from('{"hello":"world"}') });
    await page.waitForSelector(".carry-note.bad");
    check(/That file was not brought over/.test(await page.textContent(".carry-note")), "4 a file that is not one is refused");
    await context.close();
  }

  /* 5. no JavaScript */
  {
    const { context, page } = await profile({ javaScriptEnabled: false });
    await page.goto(OLD + "/parts/2-geometry/07-area.html");
    await page.waitForURL(NEW + "/parts/2-geometry/07-area", { timeout: 10000 }).catch(() => {});
    eq(page.url(), NEW + "/parts/2-geometry/07-area", "5 with JavaScript off the meta refresh takes the reader to the new address");
    check(await page.evaluate(() => document.body && document.body.innerText.length > 0), "5 … and the page is there");
    await context.close();
  }

  /* 6. too long for an address: the file */
  {
    const { context, page } = await profile();
    const noise = {};
    let x = 11;
    const N = 6000;
    while (Object.keys(noise).length < N) { x = (x * 1103515245 + 12345) & 0x7fffffff; noise["n" + x.toString(36) + ((x * 7) % 2147483629).toString(36)] = true; }
    const big = Object.assign({}, FIXTURE, { "bm.progress.v1": Object.assign({}, FIXTURE["bm.progress.v1"], { ch12: { solved: noise, total: N } }), "bm.sync.v1": { user: "" } });
    await seed(page, OLD, big);
    await page.goto(OLD + "/parts/4-topics/12-functions.html");
    await page.waitForSelector("#carry-file:not([hidden])");
    eq(new URL(page.url()).origin + new URL(page.url()).pathname + new URL(page.url()).search, OLD + "/carry/?to=%2Fparts%2F4-topics%2F12-functions", "6 the old page sends the reader to the carry page, with the way back");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#carry-download")]);
    const file = path.join(CACHE, "download.json");
    await download.saveAs(file);
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    check(data.format === "basic-mathematics-progress" && data.v === 1 && Object.keys(data.progress.ch12.solved).length === N && data.device && data.device["bm.theme"] === "dark", "6 the file holds it all, the settings under device", Object.keys(data));
    check(!JSON.stringify(data).includes("secret") && !data.owner && !data.signedIn && !(data.device && (data.device[SESSION] || data.device["bm.sync.v1"] || data.device["bm.run.v1"])), "6 and no session, account or run store", data.device && Object.keys(data.device));
    const where = await page.getAttribute("#carry-file a[data-carry-target]", "href");
    eq(where, NEW + "/parts/4-topics/12-functions", "6 the carry page links the page it came from at the new address");
    await page.goto(NEW + "/progress.html");
    await page.waitForSelector("[data-carry-tools]:not([hidden])");
    await page.setInputFiles("[data-carry-file]", file);
    const q = await question(page);
    check(new RegExp("^" + (N + 23) + " exercises solved").test(q.what), "6 importing it asks, with all of it", q.what);
    await page.click("[data-carry-yes]");
    await page.waitForFunction(() => /Imported/.test(document.querySelector("[data-carry-status]").textContent));
    const n = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("bm.progress.v1")).ch12.solved).length);
    eq(n, N, "6 and it is all here");
    await context.close();
  }

  /* 7. the carry page as the progress page's link reaches it; and 404.html */
  {
    const { context, page } = await profile();
    await seed(page, OLD, FIXTURE);
    await page.goto(OLD + "/carry/?to=" + encodeURIComponent("/progress.html"));
    await question(page);
    eq(new URL(page.url()).origin + new URL(page.url()).pathname + new URL(page.url()).hash, NEW + "/progress.html", "7 the carry page sends the progress back to the page that asked");
    eq(await page.evaluate(() => window.__referrer), OLD + "/", "7 … with the old origin as the referrer");
    await page.click("[data-carry-yes]");
    await page.waitForSelector(".carry-note");
    await page.goto(OLD + "/carry/?to=" + encodeURIComponent("//evil.example/x"));
    await page.waitForURL((u) => u.origin === NEW || String(u).startsWith(NEW), { timeout: 10000 }).catch(() => {});
    check(page.url().startsWith(NEW + "/#bm-carry=") || page.url().startsWith(NEW + "/"), "7 a ?to= that is not a path goes to the root of the new address", page.url());
    await context.close();
    const empty = await profile();
    await empty.page.goto(OLD + "/carry/");
    await empty.page.waitForSelector("#carry-none:not([hidden])");
    check(/nothing to bring/.test(await empty.page.textContent("#carry-none")), "7 with nothing saved the carry page says so");
    await empty.page.goto(OLD + "/parts/9-none/99-nothing.html#here");
    await empty.page.waitForURL(NEW + "/");
    check(true, "7 an unknown old path goes to the front page of the new address");
    await empty.context.close();
    const folder = await profile();
    await seed(folder.page, OLD, FIXTURE);
    await folder.page.goto(OLD + "/parts/1-algebra/");
    const q = await question(folder.page);
    check(/^23 exercises solved/.test(q.what) && new URL(folder.page.url()).pathname === "/", "7 an old folder goes to the front page with the progress, and it is asked about", { url: folder.page.url(), q });
    eq(await folder.page.evaluate(() => window.__referrer), OLD + "/", "7 … 404.html sends the old origin as the referrer too");
    await folder.page.click("[data-carry-no]");
    await folder.context.close();
  }

  /* 8. the course at the old address's origin, before the move */
  {
    const OLD_SITE = "https://sophanasok.github.io/basic-mathematics";
    const { context, page } = await profile();
    await context.route(OLD_SITE + "/**", async (r) => {
      const rest = r.request().url().slice(OLD_SITE.length).replace(/#.*$/, "");
      const response = await r.fetch({ url: NEW + rest });
      return r.fulfill({ response });
    });
    await page.goto(OLD_SITE + "/about.html");
    await page.waitForFunction(() => document.readyState === "complete" && !!window.BMCarry);
    check(await page.evaluate(() => { const p = document.querySelector("[data-carry-moved]"); return !!p && p.hidden; }), "8 the about page's account of the move stays hidden at the old address");
    await page.goto(OLD_SITE + "/progress.html#bm-carry=1j" + Buffer.from(JSON.stringify({ v: 1, s: { "bm.theme": "dark" } })).toString("base64url"));
    await page.waitForFunction(() => document.readyState === "complete" && !!window.BMCarry);
    await page.waitForTimeout(400);
    check(!(await page.$("dialog.carry-ask")) && !(await page.$(".carry-note")) && await page.evaluate(() => document.querySelector("[data-carry-tools]").hidden), "8 no question, no note and no carry tools at the old address", null);
    await page.goto(NEW + "/about.html");
    await page.waitForFunction(() => document.readyState === "complete" && !!window.BMCarry);
    check(await page.isVisible("[data-carry-moved]"), "8 … where the new address shows the paragraph");
    await context.close();
  }

  /* 10. another origin's handle on the window: review round 4's three ways in
     (scratchpad gate/hist.cjs and gate/race.cjs), each with a payload that would show if
     it were read: three exercises, a theme and settings, in a browser with none */
  {
    const EVIL = pack({ v: 1, s: { "bm.progress.v1": { ch01: { solved: { e1: true, e2: true, e3: true } } }, "bm.theme": "dark", "bm.prefs.v1": { sound: false, volume: 0 } } });
    {
      const p = await profile();
      const res = await p.context.request.get(NEW + "/index.html");
      eq(res.headers()["cross-origin-opener-policy"], "same-origin", "10 the new address's pages are sent with Cross-Origin-Opener-Policy: same-origin");
      await p.context.close();
    }
    /* a page of THIRD that opens the old address's front page in a window named "victim" */
    async function opened(p) {
      await p.page.goto(THIRD + "/__seed/");
      const [popup] = await Promise.all([p.context.waitForEvent("page"), p.page.evaluate((u) => { window.w = window.open(u, "victim"); }, OLD + "/index.html")]);
      popup.on("pageerror", (e) => errors.push(popup.url().slice(0, 60) + ": " + e.message));
      await popup.waitForURL((u) => String(u).startsWith(NEW), { timeout: 15000 });
      await popup.waitForLoadState("load");
      await popup.waitForTimeout(300);
      return popup;
    }
    const nothing = async (popup, what) => {
      check(!(await popup.$("dialog.carry-ask")), "10 " + what + ": nothing is asked");
      const s = await popup.evaluate(() => ({ p: localStorage.getItem("bm.progress.v1"), t: localStorage.getItem("bm.theme"), prefs: localStorage.getItem("bm.prefs.v1"), flag: localStorage.getItem("bm.carry.v1") }));
      check(!/e3/.test(s.p || "") && !s.t && !s.prefs && !s.flag, "10 " + what + ": nothing of the payload is stored", s);
    };
    {
      const p = await profile();
      const popup = await opened(p);
      eq(await popup.evaluate(() => document.referrer), OLD + "/", "10 the window arrives at the new address with the old origin as its referrer");
      eq(await p.page.evaluate(() => window.w.closed), true, "10 … and the page that opened it holds a closed window");
      /* a fragment swap (hist.cjs), then a reload of the entry */
      await p.page.evaluate((t) => { try { window.w.location.href = t; } catch (e) { /* no window */ } }, NEW + "/#bm-carry=" + EVIL);
      await popup.waitForTimeout(400);
      eq(new URL(popup.url()).hash, "", "10 the other origin cannot change the arrived page's fragment");
      await popup.reload();
      await popup.waitForTimeout(600);
      await nothing(popup, "a fragment swap, then a reload");
      /* away to the other origin's page, from where it would go back (hist.cjs `back`) */
      await p.page.evaluate((u) => { try { window.w.location.href = u; } catch (e) { /* no window */ } }, THIRD + "/__seed/?away");
      await popup.waitForTimeout(600);
      check(popup.url().startsWith(NEW), "10 the other origin cannot send the window anywhere", popup.url());
      /* nor find it by its name */
      await p.page.evaluate((t) => { const v = window.open("", "victim"); if (v) { try { v.location.href = t; } catch (e) { /* none */ } } }, NEW + "/#bm-carry=" + EVIL);
      await popup.waitForTimeout(600);
      eq(new URL(popup.url()).hash, "", "10 … nor reach it by its name");
      await nothing(popup, "a window looked up by name");
      await p.context.close();
    }
    /* the swap in the instant the new page arrives (race.cjs): every 2 ms from a start
       around when the stub leaves; from 0 ms the new page is THIRD's own navigation */
    for (const delay of [0, 5, 10, 15, 20, 30]) {
      const p = await profile();
      await p.page.goto(THIRD + "/__seed/");
      const [popup] = await Promise.all([p.context.waitForEvent("page"), p.page.evaluate(([u, t, d]) => {
        const w = window.open(u, "victim");
        setTimeout(() => { const s = Date.now(); const id = setInterval(() => { try { w.location.href = t; } catch (e) { /* gone */ } if (Date.now() - s > 500) clearInterval(id); }, 2); }, d);
      }, [OLD + "/index.html", NEW + "/#bm-carry=" + EVIL, delay])]);
      popup.on("pageerror", (e) => errors.push(popup.url().slice(0, 60) + ": " + e.message));
      await popup.waitForURL((u) => String(u).startsWith(NEW), { timeout: 15000 });
      await popup.waitForTimeout(1500);
      await nothing(popup, "a swap " + delay + " ms after the window opened");
      await p.context.close();
    }
    /* a fragment on a page that arrived from the old address, after its own first load,
       then a reload: the referrer is still the old origin, the load is not a navigation */
    {
      const p = await profile();
      await from(p.page, OLD, NEW + "/index.html");
      eq(await p.page.evaluate(() => document.referrer), OLD + "/", "10 setup: a page that arrived from the old address");
      await p.page.evaluate((v) => history.replaceState(null, "", "#bm-carry=" + v), EVIL);
      await p.page.reload();
      await p.page.waitForSelector("dialog.carry-ask[open], .carry-note");
      const after = await p.page.evaluate(() => ({ type: performance.getEntriesByType("navigation")[0].type, referrer: document.referrer, note: (document.querySelector(".carry-note p") || {}).textContent }));
      check(after.type === "reload" && after.referrer === OLD + "/" && /did not come from the old address/.test(after.note), "10 a fragment there on a reload is not read, though the referrer is the old origin; a note says so", after);
      eq(new URL(p.page.url()).hash, "", "10 … and it is gone");
      await nothing(p.page, "a fragment read on a reload");
      await p.context.close();
    }
  }

  /* 11. a yes that could not be saved */
  {
    const { context, page } = await profile();
    /* the new address's storage refuses the progress store while test.full is set, as a
       full one would (the record of the answer, being small, still fits) */
    await context.addInitScript(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (this === window.localStorage && k === "bm.progress.v1" && window.localStorage.getItem("test.full") === "1") throw new DOMException("full", "QuotaExceededError");
        return set.call(this, k, v);
      };
    });
    await seed(page, OLD, FIXTURE);
    await seed(page, NEW, { "test.full": 1 });
    await page.goto(OLD + "/index.html");
    await question(page);
    await page.click("[data-carry-yes]");
    await page.waitForSelector(".carry-note.bad");
    check(/could not be saved/.test(await page.textContent(".carry-note")), "11 a yes that could not be saved says so", await page.textContent(".carry-note"));
    check(!(await page.evaluate(() => localStorage.getItem("bm.carry.v1"))), "11 … and is not recorded as answered", await page.evaluate(() => localStorage.getItem("bm.carry.v1")));
    await page.evaluate(() => localStorage.removeItem("test.full"));
    await page.goto(OLD + "/index.html");
    await page.waitForURL((u) => String(u).startsWith(NEW));
    const asks = await page.waitForSelector("dialog.carry-ask[open]", { timeout: 5000 }).then(() => true, () => false);
    check(asks, "11 the same link asks again once there is room");
    if (asks) {
      check(/^23 exercises solved/.test((await question(page)).what), "11 … about the same progress");
      await page.click("[data-carry-yes]");
      await page.waitForSelector(".carry-note:not(.bad)");
      check(await page.evaluate(() => !!JSON.parse(localStorage.getItem("bm.progress.v1")).ch05), "11 … and yes then brings it over");
    }
    await context.close();
  }

  /* 9. */
  check(errors.length === 0, "9 no page error and no Content-Security-Policy violation on any origin", errors);
  await browser.close();
  await fresh.close();
  await old.close();
  await third.close();
  console.log((fails ? "FAILED" : "ok") + " carry: " + passes + " checks passed, " + fails + " failed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
