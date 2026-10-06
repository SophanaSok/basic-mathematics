#!/usr/bin/env node
/* Progress carried from the old address to the new one, in headless Chromium, across two
   origins as readers will have them:
     node tools/game/carry.test.js

   The new address is the build in dist/ (lib/target.js picks it, and it must be
   current), served as Cloudflare Pages serves it, _headers and all (lib/serve.js), at
   http://localhost:<port>. The old address is the legacy site, built here by
   tools/build-legacy.js into .cache/carry/legacy/ with that local address as its new
   origin and served at http://127.0.0.1:<port>, with 404.html for a missing path as
   GitHub Pages does. The two are different origins, so each has its own localStorage,
   as github.io and the new domain will. A blank page on each (/__seed/) is how a case
   puts progress into one of them without running a site's scripts. Every request to
   any other server is aborted. The format's own rules, the sizes and the merge laws are
   src/carry/format.test.ts.

   1. a reader with progress at the old address opens an old chapter link (with its own
      #anchor): it goes to the same chapter at the new address once, with the progress
      in the fragment; the new address asks, saying what it holds; yes merges it with the
      progress already there (both kept, the new address's own choices kept, device
      stores only where absent); a Supabase session left behind and another site's key
      never arrive; the fragment is gone and the anchor back; a reload and a second
      visit to the old link ask nothing more
   1b. a reader who was signed in at the old address: the question says the progress is
      kept for that account; yes sets it aside for that account alone (this browser's
      own progress is not touched, so whoever signs in here first does not take it in),
      and neither the session nor the account binding arrives
   2. no leaves everything as it was, and the old link is not asked about again; the
      carry page, which a reader reaches by asking for it, asks again, and yes then
      brings it over
   3. a crafted link (a key that is not the site's, an oversized fragment, another
      format, a game record newer than the site, nothing the site writes, text made to
      look like markup) is refused with a note and changes nothing; no markup from it
      reaches the page; values of the wrong kind inside a store (the review's case C)
      change nothing already here when the reader says yes; set-aside progress for an
      account is named in the question; an old page whose own fragment is a payload
      sends the genuine progress and never the crafted one
   4. the file "Download my data" makes, imported on the progress page, goes through the
      same question and merge; a file that is not one is refused
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
/* a progress store as it arrives: a chapter's total is never taken (src/carry/format.ts) */
function noTotals(store) {
  const out = {};
  Object.keys(store).forEach((ch) => { const r = Object.assign({}, store[ch]); delete r.total; out[ch] = r; });
  return out;
}
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
  const OLD = "http://127.0.0.1:" + old.port;
  console.log("carry: new address " + NEW + " (" + picked.label + "), old address " + OLD + " (" + site.rel(built.out) + "/)");
  const browser = await chromium.launch({ env: require("../lib/gl").env(chromium) });   /* off the machine's GPU: lib/gl.js */
  const errors = [];

  /* a fresh browser profile; `visits` counts the documents each origin served */
  async function profile(opts) {
    const context = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }, opts || {}));
    const visits = { old: [], fresh: [] };
    await context.route(/^(https?|wss?):/, (r) => {
      const u = r.request().url();
      if (u.startsWith(OLD + "/") || u.startsWith(NEW + "/")) {
        if (r.request().resourceType() === "document") (u.startsWith(OLD) ? visits.old : visits.fresh).push(u);
        return r.continue();
      }
      return r.abort();
    });
    /* the address each document arrived at, fragment and all (a request's URL has none) */
    await context.addInitScript(() => { window.__arrived = location.href; });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(page.url().slice(0, 60) + ": " + e.message));
    /* an unknown path is answered 404 on purpose (case 7), which Chromium reports */
    page.on("console", (m) => { if (m.type() === "error" && !(/99-nothing|\/parts\/1-algebra\/$/.test(page.url()) && /status of 404/.test(m.text()))) errors.push(page.url().slice(0, 60) + ": console: " + m.text()); });
    return { context, page, visits };
  }
  async function seed(page, origin, storage) {
    await page.goto(origin + "/__seed/");
    await page.evaluate((s) => { Object.keys(s).forEach((k) => localStorage.setItem(k, typeof s[k] === "string" && /^(sb-|other)/.test(k) ? s[k] : JSON.stringify(s[k]))); }, storage);
  }
  async function storageOf(page, origin) {
    await page.goto(origin + "/__seed/");
    return page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
  }
  const parse = (v) => { try { return JSON.parse(v); } catch (e) { return v; } };
  /* a payload as a link to the new address can carry it, uncompressed */
  const pack = (payload) => "1j" + Buffer.from(JSON.stringify(payload)).toString("base64url");
  async function question(page) {
    await page.waitForSelector("dialog.carry-ask[open]");
    return page.evaluate(() => {
      const d = document.querySelector("dialog.carry-ask");
      return { title: d.querySelector("h2").textContent, what: d.querySelector(".carry-what").textContent, modal: d.matches(":modal"), focus: document.activeElement && document.activeElement.textContent };
    });
  }
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

  /* 1. yes */
  {
    const { context, page, visits } = await profile();
    await seed(page, OLD, oldState);
    await seed(page, NEW, newState);
    visits.old.length = 0; visits.fresh.length = 0;
    await page.goto(OLD + "/parts/1-algebra/01-numbers.html#integers");
    const q = await question(page);
    check(/^Bring over your progress from the old address\?$/.test(q.title), "1 the new address asks", q);
    check(q.what === "3 chapters, 31 exercises solved, 519 XP, 3 achievements, 1 medal, your Arena and review record and your settings. Progress of an account that was signed in at the old address (1 chapter, 1 exercise solved), kept in this browser out of view and saved to that account when it signs in here.", "1 … saying what the progress holds, set-aside progress too", q.what);
    check(q.modal && q.focus === "Bring it over", "1 … in a modal dialog, focus on the answer", q);
    eq(new URL(page.url()).pathname + new URL(page.url()).hash, "/parts/1-algebra/01-numbers#integers", "1 at the same chapter, the fragment already gone and the anchor back");
    eq(visits.old.length, 1, "1 the old address was loaded once");
    const arrived = await page.evaluate(() => window.__arrived);
    check(visits.fresh.length === 1 && /^[^#]*\/parts\/1-algebra\/01-numbers#bm-carry=1z[A-Za-z0-9_-]+&bm-at=integers$/.test(arrived), "1 the new address once, with the progress, compressed, and the anchor", { visits: visits.fresh, arrived: arrived.slice(0, 120) });
    await page.click("[data-carry-yes]");
    await page.waitForSelector(".carry-note");
    check(/Your progress is here/.test(await page.textContent(".carry-note")), "1 yes says it is here");
    check(!(await page.$("dialog.carry-ask")), "1 the dialog is gone");
    /* the HUD drew the merged XP without a reload */
    const level = await page.getAttribute(".hud-level", "aria-label");
    check(level && !/^Level 1,/.test(level), "1 the HUD shows the carried XP without a reload", level);
    const s = await storageOf(page, NEW);
    const p = parse(s["bm.progress.v1"]);
    const fp = FIXTURE["bm.progress.v1"];
    const all = Object.keys(fp).every((ch) => Object.keys(fp[ch].solved).every((k) => p[ch] && p[ch].solved[k]));
    check(all && p.ch09.solved.e4 && p.ch01.solved.e11, "1 every solved exercise of both sides is there", p);
    /* this browser's own place to continue: ch09 as seeded, or ch01, which opening the
       chapter here just wrote; never the old address's (ch02) */
    check(["ch09", "ch01"].includes(parse(s["bm.last"]).id), "1 the new address keeps its own place to continue", s["bm.last"]);
    eq(parse(s["bm.prefs.v1"]), { sound: false, calm: true }, "1 and its own settings");
    eq(parse(s["bm.theme"]), FIXTURE["bm.theme"], "1 the theme it lacked arrives");
    check(parse(s["bm.game.v1"]) && parse(s["bm.game.v1"]).enc && parse(s["bm.game.v1"]).enc["ch01/practice"], "1 the game record arrives", s["bm.game.v1"]);
    check(parse(s["bm.sync.pending.v1"]) && parse(s["bm.sync.pending.v1"])["u-9"] && parse(s["bm.sync.pending.v1"])["u-9"].carried === 1, "1 progress set aside for a reader arrives, marked as carried (the account page then names no email from it)", s["bm.sync.pending.v1"]);
    const keys = Object.keys(s);
    check(!keys.some((k) => /^sb-|auth-token/.test(k)) && !keys.includes("bm.sync.v1") && !keys.includes("other.app"), "1 no session, no account binding, no other key", keys);
    eq(parse(s["bm.attempts.v1"]).ch01.t1, FIXTURE["bm.attempts.v1"].ch01.t1, "1 an attempt arrives as it was written");
    check(!JSON.stringify(s).includes("secret-token"), "1 the session's token is nowhere");
    check(parse(s["bm.carry.v1"]) && Object.values(parse(s["bm.carry.v1"]).seen)[0].took === true, "1 the answer is recorded", s["bm.carry.v1"]);
    /* reload, and the old link again: nothing more is asked */
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
    eq(q.what, "Your settings. Progress of an account that was signed in at the old address (3 chapters, 31 exercises solved, 519 XP, 3 achievements, 1 medal, its Arena and review record), kept in this browser out of view and saved to that account when it signs in here.", "1b the question says whose progress it is");
    await page.click("[data-carry-yes]");
    await page.waitForSelector(".carry-note");
    const s = await storageOf(page, NEW);
    eq(parse(s["bm.progress.v1"]), newState["bm.progress.v1"], "1b this browser's own progress is not touched");
    const aside = parse(s["bm.sync.pending.v1"]);
    check(aside && aside["u-1"] && aside["u-1"].carried === 1 && aside["u-1"].resetAt === 5 && JSON.stringify(aside["u-1"].state.progress) === JSON.stringify(noTotals(FIXTURE["bm.progress.v1"])), "1b it is set aside for that account alone (every solved exercise, and no chapter total: its page writes that)", aside);
    check(!Object.keys(s).some((k) => /^sb-|auth-token/.test(k)) && !("bm.sync.v1" in s), "1b no session, no account binding", Object.keys(s));
    /* the page here writes a run store of its own; the old one's ledger is not in it */
    check(!JSON.stringify(parse(s["bm.run.v1"]) || {}).includes(FIXTURE["bm.run.v1"].paid[0]), "1b the run store stays with the account's progress", s["bm.run.v1"]);
    eq(parse(s["bm.theme"]), FIXTURE["bm.theme"], "1b the device's own settings it lacked arrive");
    await context.close();
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
    /* the reader changes their mind: the carry page (the progress page's link) asks again */
    await page.goto(OLD + "/carry/?to=" + encodeURIComponent("/progress"));
    const again = await question(page);
    check(/^3 chapters, 31 exercises solved/.test(again.what), "2 asked for, the carry page brings the same progress and it is asked about again", again);
    eq(new URL(page.url()).hash, "", "2 … with the fragment gone");
    await page.click("[data-carry-yes]");
    await page.waitForSelector(".carry-note");
    const after = await storageOf(page, NEW);
    check(parse(after["bm.progress.v1"]) && parse(after["bm.progress.v1"]).ch05 && parse(after["bm.progress.v1"]).ch05.solved.e10, "2 and yes then brings it over", after["bm.progress.v1"]);
    await context.close();
  }

  /* 3. crafted links */
  {
    const cases = [
      ["a session key", pack({ v: 1, s: { "bm.progress.v1": {}, [SESSION]: "x" } }), /not progress from this site/],
      ["a key of another site", pack({ v: 1, s: { "evil": 1 } }), /not progress from this site/],
      ["an oversized fragment", "1j" + "A".repeat(40000), /larger than any progress/],
      ["another format", "2z" + "AAAA", /different version/],
      ["v 2 inside", pack({ v: 2, s: {} }), /different version/],
      ["a game record newer than the site", pack({ v: 1, s: { "bm.game.v1": { v: 2 }, "bm.progress.v1": { ch01: { solved: { e1: true } } } } }), /different version/],
      ["nothing the site writes", pack({ v: 1, s: { "bm.attempts.v1": { ch01: { t1: { solved: "x", tries: "y" } } }, "bm.game.v1": { daily: { "9999-01-01": 1 } } } }), /holds no progress/],
      ["garbage", "1j%%%", /could not be read/]
    ];
    for (const [what, value, says] of cases) {
      const { context, page } = await profile();
      await page.goto(NEW + "/index.html#bm-carry=" + value);
      await page.waitForSelector(".carry-note");
      const note = await page.textContent(".carry-note");
      check(says.test(note) && /was not brought over/.test(note), "3 " + what + " is refused with a note", note);
      check(!(await page.$("dialog.carry-ask")), "3 " + what + ": nothing is asked");
      eq(new URL(page.url()).hash, "", "3 " + what + ": the fragment is gone");
      const s = await storageOf(page, NEW);
      check(!Object.keys(s).some((k) => /^sb-|^evil/.test(k)), "3 " + what + ": nothing of it is stored", Object.keys(s));
      await context.close();
    }
    /* markup in what is carried is never markup on the page (a chapter the course does
       not have is left out, so the markup is an exercise's id and the place to continue) */
    const { context, page } = await profile();
    const tag = '<img src=x onerror="window.__pwned=1">';
    await page.goto(NEW + "/index.html#bm-carry=" + pack({ v: 1, s: { "bm.progress.v1": { [tag]: { solved: { e1: true } }, ch01: { solved: { [tag]: true }, total: 1 } }, "bm.last": { id: tag, section: tag } } }));
    const q = await question(page);
    check(!/</.test(q.what) && /^1 chapter, 1 exercise solved and your settings\.$/.test(q.what), "3 the question counts what markup holds and shows none of it", q.what);
    check(!(await page.evaluate(() => !!document.querySelector("dialog img, .carry-note img") || !!window.__pwned)), "3 no element is made from it");
    await page.click("[data-carry-no]");
    await context.close();
  }
  /* values of the wrong kind inside a store, beside one real exercise (the review's
     case C): asked about as that one exercise, and yes changes nothing already here */
  {
    const { context, page } = await profile();
    await seed(page, NEW, FIXTURE);
    const daily = {};
    for (let i = 0; i < 60; i++) daily[(9999 - i) + "-01-01"] = 1;
    await page.goto(NEW + "/index.html#bm-carry=" + pack({ v: 1, s: { "bm.game.v1": { daily, v: 1 }, "bm.attempts.v1": { ch01: { t1: { solved: "x", tries: "y" } } }, "bm.progress.v1": { ch03: { solved: { e1: true }, total: 10 } } } }));
    const q = await question(page);
    eq(q.what, "1 chapter and 1 exercise solved.", "3 values the site never writes are not counted");
    await page.click("[data-carry-yes]");
    await page.waitForSelector(".carry-note");
    const s = await storageOf(page, NEW);
    eq(parse(s["bm.attempts.v1"]).ch01.t1, FIXTURE["bm.attempts.v1"].ch01.t1, "3 an attempt here keeps its time, tries and right-first-time");
    eq(Object.keys(parse(s["bm.game.v1"]).daily).sort(), Object.keys(FIXTURE["bm.game.v1"].daily).sort(), "3 the Daily here keeps its days");
    check(parse(s["bm.progress.v1"]).ch03.solved.e1 === true, "3 the one real exercise arrives");
    await context.close();
  }
  /* review round 3: a lower review box or a later "not right first time" never replaces
     what is here, a setting this browser has is not asked about, and a chapter or an
     achievement the course does not have is neither counted nor kept */
  {
    const { context, page } = await profile();
    await seed(page, NEW, FIXTURE);
    const sec = {}, worse = {};
    Object.keys(FIXTURE["bm.game.v1"].sec).forEach((id) => { sec[id] = { n: 0, ok: 0, box: 0, last: new Date().toISOString().slice(0, 10) }; });
    Object.keys(FIXTURE["bm.attempts.v1"].ch01).forEach((k) => { worse[k] = { solved: Date.UTC(2024, 0, 1), first: 0, tries: 1000, hints: 10 }; });
    await page.goto(NEW + "/index.html#bm-carry=" + pack({ v: 1, s: { "bm.game.v1": { sec, ach: { "no-such-achievement": 1789214400000 } }, "bm.attempts.v1": { ch01: worse }, "bm.progress.v1": { zz: { solved: { e1: true } } }, "bm.theme": "light" } }));
    const q = await question(page);
    eq(q.what, "1 chapter, " + Object.keys(worse).length + " exercises solved and your Arena and review record.", "3 only what the course has is counted, and no setting this browser has");
    await page.click("[data-carry-yes]");
    await page.waitForSelector(".carry-note");
    const s = await storageOf(page, NEW);
    /* in any key order: the merge builds records in its own */
    const sorted = (x) => (x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sorted(x[k])])) : x);
    eq(sorted(parse(s["bm.game.v1"]).sec), sorted(FIXTURE["bm.game.v1"].sec), "3 every review place here stays");
    eq(sorted(parse(s["bm.attempts.v1"]).ch01), sorted(FIXTURE["bm.attempts.v1"].ch01), "3 every attempt here stays");
    check(!("zz" in parse(s["bm.progress.v1"])) && !("no-such-achievement" in parse(s["bm.game.v1"]).ach), "3 a chapter or achievement the course does not have is not kept", { progress: Object.keys(parse(s["bm.progress.v1"])), ach: parse(s["bm.game.v1"]).ach });
    eq(parse(s["bm.theme"]), FIXTURE["bm.theme"], "3 the theme here stays");
    await page.goto(NEW + "/progress.html#bm-carry=" + pack({ v: 1, s: { "bm.theme": "light" } }));
    await page.waitForSelector(".carry-note");
    check(!(await page.$("dialog.carry-ask")) && /nothing this browser does not already have/.test(await page.textContent(".carry-note")), "3 a payload of settings this browser has is not asked about", await page.textContent(".carry-note"));
    await context.close();
  }
  /* set-aside progress alone (the review's case B) is named in the question */
  {
    const { context, page } = await profile();
    await page.goto(NEW + "/index.html#bm-carry=" + pack({ v: 1, s: { "bm.sync.pending.v1": { "00000000-0000-0000-0000-000000000000": { email: "support@groundupmath.org", via: ["google"], resetAt: 0, state: { progress: { ch01: { solved: { e1: true }, total: 10 } } }, at: 1789214400000 } } } }));
    const q = await question(page);
    check(/^Progress of an account that was signed in at the old address \(1 chapter, 1 exercise solved\)/.test(q.what), "3 set-aside progress is named in the question", q.what);
    await page.click("[data-carry-no]");
    await context.close();
  }
  /* an old page whose own fragment is a payload (the review's case I): the genuine
     progress is asked about, and the crafted one is not put back into the address */
  {
    const { context, page } = await profile();
    await seed(page, OLD, FIXTURE);
    await page.goto(OLD + "/index.html#bm-carry=" + pack({ v: 1, s: { "bm.theme": "light" } }));
    const q = await question(page);
    check(/^3 chapters, 31 exercises solved/.test(q.what), "3 the old page sends the progress it holds", q.what);
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
    check(/^Import the progress in this file\?$/.test(q.title) && /^3 chapters, 31 exercises solved/.test(q.what), "4 the file is asked about like a link", q);
    await page.click("[data-carry-yes]");
    await page.waitForFunction(() => /Imported basic-mathematics-progress\.json/.test(document.querySelector("[data-carry-status]").textContent));
    const s = await page.evaluate(() => ({ p: JSON.parse(localStorage.getItem("bm.progress.v1")), last: JSON.parse(localStorage.getItem("bm.last")), keys: Object.keys(localStorage) }));
    check(s.p.ch05 && s.p.ch05.solved.e10 && s.p.ch09.solved.e4, "4 the file's progress is merged with what was here", s.p);
    eq(s.last, { id: "ch09", section: null }, "4 this browser's place to continue stays");
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
    const big = Object.assign({}, FIXTURE, { "bm.progress.v1": Object.assign({}, FIXTURE["bm.progress.v1"], { ch12: { solved: noise, total: N } }) });
    await seed(page, OLD, big);
    await page.goto(OLD + "/parts/4-topics/12-functions.html");
    await page.waitForSelector("#carry-file:not([hidden])");
    eq(new URL(page.url()).origin + new URL(page.url()).pathname + new URL(page.url()).search, OLD + "/carry/?to=%2Fparts%2F4-topics%2F12-functions", "6 the old page sends the reader to the carry page, with the way back");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#carry-download")]);
    const file = path.join(CACHE, "download.json");
    await download.saveAs(file);
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    check(data.format === "basic-mathematics-progress" && data.v === 1 && Object.keys(data.progress.ch12.solved).length === N && data.device && data.device["bm.theme"] === "dark", "6 the file holds it all, the device's stores under device", Object.keys(data));
    check(!JSON.stringify(data).includes("secret") && !(data.device && (data.device[SESSION] || data.device["bm.sync.v1"])), "6 and no session or account binding", data.device && Object.keys(data.device));
    const where = await page.getAttribute("#carry-file a[data-carry-target]", "href");
    eq(where, NEW + "/parts/4-topics/12-functions", "6 the carry page links the page it came from at the new address");
    await page.goto(NEW + "/progress.html");
    await page.waitForSelector("[data-carry-tools]:not([hidden])");
    await page.setInputFiles("[data-carry-file]", file);
    const q = await question(page);
    check(new RegExp("^4 chapters, " + (N + 31) + " exercises solved").test(q.what), "6 importing it asks, with all of it", q.what);
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
    /* a folder of the old address (the review's case J), with progress: the front page asks */
    const folder = await profile();
    await seed(folder.page, OLD, FIXTURE);
    await folder.page.goto(OLD + "/parts/1-algebra/");
    const q = await question(folder.page);
    check(/^3 chapters, 31 exercises solved/.test(q.what) && new URL(folder.page.url()).pathname === "/", "7 an old folder goes to the front page with the progress, and it is asked about", { url: folder.page.url(), q });
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
    check(!(await page.$("dialog.carry-ask")) && await page.evaluate(() => document.querySelector("[data-carry-tools]").hidden), "8 no question, and no carry tools, at the old address");
    await page.goto(NEW + "/about.html");
    await page.waitForFunction(() => document.readyState === "complete" && !!window.BMCarry);
    check(await page.isVisible("[data-carry-moved]"), "8 … where the new address shows the paragraph");
    await context.close();
  }

  /* 9. */
  check(errors.length === 0, "9 no page error and no Content-Security-Policy violation on any origin", errors);
  await browser.close();
  await fresh.close();
  await old.close();
  console.log((fails ? "FAILED" : "ok") + " carry: " + passes + " checks passed, " + fails + " failed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
