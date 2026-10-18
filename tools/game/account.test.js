#!/usr/bin/env node
/* The account page as it is drawn (assets/account.js), in headless Chromium.
     node tools/game/account.test.js

   The site is served in-process as lib/target.js picks it (the build in dist/, which
   must be current). Each case pins window.BM_CONFIG, so the real assets/config.js cannot
   set it, and puts a small stand-in for supabase-js on window.supabase before the page's
   scripts run (the seam account.js keeps: a client library that is already there is used
   instead of the bundled one), which records what the page asks of it. Every request off
   the local server is aborted: nothing reaches Supabase or any sign-in service. The
   requests to the local server are watched too: the bundled library,
   bundle/supabase.js, must never be asked for by a signed-out visitor on an ordinary
   page, and must be asked for, and work, on the account page when no stand-in is there.

   1. the configured services are drawn as buttons, in order, above the email form, with
      text labels and nothing fetched; the email-only controls go when emailDelivery is false
   2. a button hands over to its service once (Microsoft with the email scope), from the
      keyboard, and says so
   3. with no providers listed the form is what it was
   4. a sign-in that comes back refused is explained, focused, and taken out of the address
   5. the signed-in panel says who is signed in and how, with or without an email address
   6. a wrong password points a reader who used a button back to the buttons, and a
      sign-up the mailer refuses is explained
   7. five buttons fit a 360px screen
   8. progress set aside for a reader with no email names the service they use
   9. a hand-over that fails, or that the reader comes Back from, frees the button
  10. an error in the address is left alone on pages other than the account page
  11. a signed-out visitor on a chapter page and on the about page fetches nothing off the
      local server and never the supabase chunk, and the list of what it does fetch is
      printed; the account page with no stand-in fetches bundle/supabase.js, the real
      library, and draws the form with it, with nothing sent to Supabase
  12. the drawn page says accounts are for people 13 or older, signed out and signed in
  13. signed in, the data panel names the answer log, and the export carries it
  14. the Learners panel lists "Your own progress" and the managed learners with their four
      buttons, the active one as "Playing as" with aria-current; Switch to moves the mark
  15. adding with "Under 13" ticked is refused until the consent box is ticked, then sends
      consent_v 1; without the tick, consent_v null
  16. rename opens an inline field, Enter calls learner_rename, Escape cancels, focus returns
  17. delete needs two presses; a stale sign-in says to sign in again and shows the sign-in controls
  18. download calls learner_export and the page offers a file named after the learner
   19. the panel fits a 360px screen with no horizontal scroll; every control is reachable by Tab
   20. deleting the active learner switches to the own progress first; a stale refusal says so
   21. the step-up signs in again in place: its own note, the Learners note keeps the instruction,
       and the retried Delete works with the focus on it
   22. unticking Under 13 clears the consent tick; another account's sign-in shows a clean panel
   23. two quick Enters add once; a rename keeps typed text through a sync redraw
   24. a sync-status redraw keeps the keyboard focus on the button that had it
   25. learners "off" draws no Learners panel and asks for no learner_list
   26. a stale refusal of Delete my account shows its note and the step-up form, the button stays
       armed, a right password says to press again, and the next press deletes once */
"use strict";
const site = require("../lib/site");
const target = require("../lib/target");
const { chromium } = require("../lib/pw").playwright();

let fails = 0, passes = 0;
function check(cond, what, detail) {
  if (cond) passes++;
  else { fails++; console.error("FAIL " + what + (detail === undefined ? "" : "\n     " + JSON.stringify(detail))); }
}

/* What account.js finds on window.supabase in place of supabase-js: no network, a session
   only if the case gave one, and a record of every hand-over to a sign-in service. */
const SDK = `
window.__oauth = [];
window.__rpc = [];
window.supabase = { createClient: function () {
  var opts = window.__opts || {}, subs = [];
  function answer(data) { return { data: data, error: null }; }
  function self() { var s = window.__session; return { id: s && s.user ? s.user.id : "u1", self: true, name: null, under13: false, consent_v: null, created_at: "2026-10-01T00:00:00Z" }; }
  function rows() { if (!opts.learners) opts.learners = [self()]; return opts.learners; }
  function query(table) {
    var write = false, wanted = null, api = {
      select: function () { return api; }, eq: function (col, v) { if (col === "id") wanted = v; return api; },
      insert: function () { write = true; return api; }, update: function () { write = true; return api; },
      upsert: function () { write = true; return api; }, maybeSingle: function () { return api; },
      then: function (ok, bad) {
        if (table === "learners") {
          var hit = (opts.learners || []).filter(function (l) { return l.id === wanted; })[0];
          return Promise.resolve(answer(hit ? { id: hit.id } : null)).then(ok, bad);
        }
        return Promise.resolve(answer(write ? [{ updated_at: new Date().toISOString() }] : null)).then(ok, bad);
      }
    };
    return api;
  }
  return {
    from: query,
    rpc: function (name, args) {
      var meta = {}; try { meta = JSON.parse(localStorage.getItem("bm.sync.v1") || "{}"); } catch (e) { meta = {}; }
      window.__rpc.push({ name: name, args: args, learner: meta.learner || null });
      if (name === "learner_add" && opts.addDelay) return new Promise(function (ok) { setTimeout(function () { rows().push({ id: "L-new", self: false, name: args.name, under13: !!args.under13, consent_v: args.consent_v, created_at: "2026-10-18T00:00:00Z" }); ok(answer("L-new")); }, opts.addDelay); });
      if (name === "learner_list") return Promise.resolve(answer(rows().slice()));
      if (name === "learner_add") {
        rows().push({ id: "L-new", self: false, name: args.name, under13: !!args.under13, consent_v: args.consent_v, created_at: "2026-10-18T00:00:00Z" });
        return Promise.resolve(answer("L-new"));
      }
      if (name === "delete_my_account" && opts.staleDelete) return Promise.resolve({ data: null, error: { message: "stale sign-in", code: "P0001" } });
      if (/^learner_(rename|delete|export)$/.test(name)) {
        if (opts.stale && name !== "learner_rename") return Promise.resolve({ data: null, error: { message: "stale sign-in", code: "P0001" } });
        if (name === "learner_rename") rows().forEach(function (l) { if (l.id === args.id) l.name = args.name; });
        if (name === "learner_delete") opts.learners = rows().filter(function (l) { return l.id !== args.id; });
        return Promise.resolve(answer(name === "learner_export" ? { learner: args.id, events: [] } : null));
      }
      return Promise.resolve(answer(null));
    },
    auth: {
      onAuthStateChange: function (cb) { subs.push(cb); return { data: { subscription: { unsubscribe: function () {} } } }; },
      getSession: function () { return Promise.resolve(answer({ session: window.__session || null })); },
      signInWithOAuth: function (a) {
        window.__oauth.push(a);
        if (opts.oauthFails) return Promise.resolve({ data: null, error: { message: "Unsupported provider: provider is not enabled" } });
        return Promise.resolve(answer({ provider: a.provider }));
      },
      signInWithPassword: function () {
        if (!opts.signInOk) return Promise.resolve({ data: null, error: { message: "Invalid login credentials" } });
        var as = opts.signInAs || (window.__session && window.__session.user.id) || "u1";
        window.__session = { user: { id: as, email: as + "@example.com", app_metadata: { provider: "email", providers: ["email"] } } };
        subs.forEach(function (cb) { cb("SIGNED_IN", window.__session); });
        return Promise.resolve(answer({ session: window.__session }));
      },
      signUp: function () {
        if (opts.signUpRefused) return Promise.resolve({ data: null, error: { code: "email_address_not_authorized", message: "Email address not authorized" } });
        return Promise.resolve(answer({ session: null }));
      },
      signOut: function () {
        window.__session = null;
        subs.forEach(function (cb) { cb("SIGNED_OUT", null); });
        return Promise.resolve({ error: null });
      }
    }
  };
} };`;

const ALL = ["google", "github", "discord", "facebook", "azure"];

(async () => {
  const server = await target.start(site.parseArgs(process.argv.slice(2)));
  console.log("account: " + server.where);
  const browser = await chromium.launch({ env: require("../lib/gl").env(chromium) });   /* off the machine's GPU: lib/gl.js */
  const errors = [];

  /* the chunk only account.js's import() fetches (tools/check-dist.js ON_DEMAND) */
  const SUPABASE_CHUNK = /\/bundle\/supabase\.js$/;

  /* a fresh browser profile on account.html, with this config and (optionally) a session;
     `requests` is every URL the page asked for, `outside` those not on the local server */
  async function open(config, opts) {
    opts = opts || {};
    const context = await browser.newContext({ viewport: { width: opts.width || 1280, height: 800 } });
    const outside = [], requests = [];
    await context.route(/^(https?|wss?):/, (r) => {
      const u = r.request().url();
      requests.push(u);
      if (server.owns(u)) return r.continue();
      outside.push(u);
      return r.abort();
    });
    if (!opts.realSdk) await context.addInitScript(SDK);
    await context.addInitScript((seed) => {
      const pinned = Object.assign({ supabaseUrl: "https://testref.supabase.co", supabaseAnonKey: "sb_publishable_test" }, seed.config);
      Object.defineProperty(window, "BM_CONFIG", { get: () => pinned, set: () => {}, configurable: false });
      window.__session = seed.session || null;
      window.__opts = seed.stub;
      if (seed.pending) localStorage.setItem("bm.sync.pending.v1", JSON.stringify(seed.pending));
      if (seed.local) Object.keys(seed.local).forEach((k) => localStorage.setItem(k, JSON.stringify(seed.local[k])));
      /* was the returned-error message ever on the page as an alert? */
      new MutationObserver(() => {
        if (document.querySelector('#acct-returned[role="alert"]')) window.__alerted = true;
      }).observe(document, { childList: true, subtree: true });
    }, { config, session: opts.session || null, pending: opts.pending || null, local: opts.local || null, stub: opts.stub || {} });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(server.url + (opts.page || "account.html") + (opts.tail || ""));
    if (opts.page) { await page.waitForFunction(() => window.BMAccount); return { page, context, outside, requests }; }
    await page.waitForFunction(() => window.BMAccount && document.querySelector("[data-account] .panel"));
    if (opts.session) await page.waitForFunction(() => /Signed in/.test(document.querySelector("[data-account]").textContent));
    else if (!opts.realSdk) await page.waitForFunction(() => window.supabase);
    return { page, context, outside, requests };
  }
  const chunkAsked = (requests) => requests.filter((u) => SUPABASE_CHUNK.test(u));
  const text = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return el ? el.textContent.replace(/\s+/g, " ").trim() : null; }, sel);

  /* 1. buttons */
  let withButtons;
  {
    const { page, context, outside } = await open({ providers: ALL, emailDelivery: false });
    withButtons = outside;
    const seen = await page.evaluate(() => {
      const group = document.querySelector("[data-account] .providers");
      const buttons = Array.from(document.querySelectorAll("[data-account] .providers button"));
      const email = document.getElementById("acct-email");
      return {
        role: group && group.getAttribute("role"), name: group && group.getAttribute("aria-label"),
        labels: buttons.map((b) => b.textContent), types: buttons.map((b) => b.type),
        pictures: buttons.filter((b) => b.querySelector("img, svg") || getComputedStyle(b).backgroundImage !== "none").length,
        before: buttons.every((b) => b.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING),
        link: !!document.getElementById("acct-link"), forgot: !!document.getElementById("acct-forgot"),
        create: !!document.getElementById("acct-up"), signIn: !!document.getElementById("acct-in"),
        fine: document.querySelector("[data-account] .providers ~ .fine").textContent
      };
    });
    check(JSON.stringify(seen.labels) === JSON.stringify(["Continue with Google", "Continue with GitHub", "Continue with Discord", "Continue with Facebook", "Continue with Microsoft"]),
      "1 the five services are drawn in config order with text labels", seen.labels);
    check(seen.role === "group" && !!seen.name, "1 the buttons are a named group", { role: seen.role, name: seen.name });
    check(seen.types.every((t) => t === "button"), "1 they are real buttons that do not submit the form", seen.types);
    check(seen.pictures === 0, "1 no logo or background image is used", seen.pictures);
    check(seen.before, "1 the buttons come before the email field");
    check(!seen.link && !seen.forgot, "1 the email-only controls are left out when emailDelivery is false", { link: seen.link, forgot: seen.forgot });
    check(seen.create && seen.signIn, "1 Sign in and Create account stay", { create: seen.create, signIn: seen.signIn });
    check(/separate account/.test(seen.fine) && /email address, name/.test(seen.fine), "1 the note says what is passed on and warns about separate accounts", seen.fine);
    await context.close();
  }

  /* 2. hand-over, from the keyboard */
  {
    const { page, context } = await open({ providers: ["google", "azure"], emailDelivery: false });
    await page.focus("#acct-oauth-google");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");            /* arrive by keyboard, so the focus ring applies */
    const ring = await page.evaluate(() => ({ id: document.activeElement.id, style: getComputedStyle(document.activeElement).outlineStyle }));
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__oauth.length === 1);
    const first = await page.evaluate(() => ({
      call: window.__oauth[0], disabled: document.getElementById("acct-oauth-google").disabled,
      note: document.querySelector("[data-account] .providers + [data-handover]").textContent
    }));
    check(first.call.provider === "google" && /\/account\.html$/.test(first.call.options.redirectTo) && !first.call.options.scopes,
      "2 Google is handed the account page to come back to, and no extra scope", first.call);
    check(first.disabled && /Taking you to Google/.test(first.note), "2 the pressed button is disabled and, right under the buttons, the page says where it is going", first);
    check(ring.id === "acct-oauth-google" && ring.style !== "none", "2 the button takes keyboard focus and shows a focus ring", ring);
    await page.click("#acct-oauth-azure");
    await page.waitForFunction(() => window.__oauth.length === 2);
    const second = await page.evaluate(() => window.__oauth[1]);
    check(second.provider === "azure" && second.options.scopes === "email", "2 Microsoft is asked for the email address", second);
    await context.close();
  }

  /* 3. nothing listed: the form as it was */
  {
    const { page, context, outside } = await open({});
    const hosts = (list) => Array.from(new Set(list.map((u) => new URL(u).origin + new URL(u).pathname))).sort();
    check(JSON.stringify(hosts(withButtons)) === JSON.stringify(hosts(outside)), "1 drawing the buttons fetches nothing the plain form does not",
      { withButtons: hosts(withButtons), without: hosts(outside) });
    const seen = await page.evaluate(() => ({
      group: !!document.querySelector("[data-account] .providers"), or: !!document.querySelector("[data-account] .or"),
      link: !!document.getElementById("acct-link"), forgot: !!document.getElementById("acct-forgot")
    }));
    check(!seen.group && !seen.or, "3 no provider buttons without a providers list", seen);
    check(seen.link && seen.forgot, "3 the email links are shown unless emailDelivery is false", seen);
    await context.close();
  }

  /* 4. a refused sign-in comes back */
  {
    const tail = "?error=access_denied&error_description=The+user+denied+access&keep=1#error=access_denied&error_description=The+user+denied+access&sb=";
    const { page, context } = await open({ providers: ["github"] }, { tail });
    const seen = await page.evaluate(() => {
      const el = document.getElementById("acct-returned");
      return {
        text: el && el.textContent, alerted: window.__alerted === true, focused: document.activeElement === el,
        search: location.search, hash: location.hash, button: !!document.getElementById("acct-oauth-github")
      };
    });
    check(seen.text && /canceled or refused/.test(seen.text), "4 a canceled sign-in is explained in plain words", seen.text);
    check(seen.alerted && seen.focused, "4 the explanation is drawn as an alert and keeps the focus through later redraws", seen);
    check(seen.search === "?keep=1" && seen.hash === "", "4 the error is taken out of the address and the rest is kept", { search: seen.search, hash: seen.hash });
    check(seen.button, "4 the form is still there to try again");
    await page.click("#acct-oauth-github");
    await page.waitForFunction(() => window.__oauth.length === 1);
    check(await page.evaluate(() => !document.getElementById("acct-returned")), "4 the explanation goes once the reader tries again");
    await context.close();

    const other = await open({ providers: ["discord"] }, { tail: "#error=server_error&error_code=unexpected_failure&error_description=Error+sending+confirmation+email" });
    const msg = await text(other.page, "#acct-returned");
    check(msg && /Try another way of signing in/.test(msg) && !/confirmation email/.test(msg), "4 a server error gets its own explanation, not the server's text", msg);
    await other.context.close();

    const coded = [
      ["#error=access_denied&error_code=provider_email_needs_verification&error_description=Unverified+email", /has not been verified/],
      ["#error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed", /New accounts are not being accepted/],
      ["#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid", /expired or has already been used/]
    ];
    for (const [tail, want] of coded) {
      const c = await open({ providers: ["discord"] }, { tail });
      const m = await text(c.page, "#acct-returned");
      check(m && want.test(m) && !/cancel+ed or refused/.test(m), "4 " + tail.match(/error_code=(\w+)/)[1] + " gets its own explanation", m);
      await c.context.close();
    }

    const crafted = await open({ providers: ["github"] }, { tail: "?error=weird&error_code=bad_oauth_state&error_description=Your+account+is+locked.+Email+your+password+to+help%40evil.example+%3Cimg+src%3Dx+onerror%3D%22window.__x%3D1%22%3E" });
    await crafted.page.waitForTimeout(300);
    const forged = await crafted.page.evaluate(() => ({
      text: document.getElementById("acct-returned").textContent, images: document.querySelectorAll("[data-account] img").length, ran: window.__x === 1
    }));
    check(forged.text === "Sign-in did not finish (bad_oauth_state). Try again, or use another way of signing in." && forged.images === 0 && !forged.ran,
      "4 text written into the address is never shown, only a fixed sentence and the error code", forged);
    await crafted.context.close();

    const session = { user: { id: "u1", email: "reader@example.com", app_metadata: { providers: ["email"] } } };
    const inAlready = await open({ providers: ["github"] }, { tail: "#error=access_denied&error_code=otp_expired", session });
    check(await inAlready.page.evaluate(() => !document.getElementById("acct-returned")), "4 a signed-in reader is not shown the message");
    check(/You sign in with your email address\./.test(await text(inAlready.page, "[data-account] .panel")), "5 an email account is not said to have a password");
    await inAlready.page.click("#acct-out");
    await inAlready.page.waitForFunction(() => document.getElementById("acct-in"));
    check(await inAlready.page.evaluate(() => !document.getElementById("acct-returned")), "4 the message does not come back after signing out");
    await inAlready.context.close();
  }

  /* 5. signed in */
  {
    const withEmail = { user: { id: "u1", email: "reader@example.com", app_metadata: { provider: "google", providers: ["google", "github"] } } };
    const a = await open({ providers: ["google", "github"] }, { session: withEmail });
    const panel = await text(a.page, "[data-account] .panel");
    check(/Signed in as reader@example\.com\./.test(panel), "5 the panel names the reader", panel);
    check(/You can sign in to this account with Google and GitHub\./.test(panel), "5 the panel lists both ways in", panel);
    check(await a.page.evaluate(() => !!document.getElementById("acct-export") && !!document.getElementById("acct-delete") && !!document.getElementById("acct-out")),
      "5 download, delete and sign out are offered without a password");
    await a.context.close();

    const noEmail = { user: { id: "u2", app_metadata: { provider: "github", providers: ["github"] }, user_metadata: { user_name: "reader9" } } };
    const b = await open({ providers: ["github"] }, { session: noEmail });
    const seen = await b.page.evaluate(() => ({
      panel: document.querySelector("[data-account] .panel").textContent.replace(/\s+/g, " "),
      empty: Array.from(document.querySelectorAll("[data-account] b")).filter((x) => !x.textContent.trim()).length,
      avatar: (document.querySelector(".topbar .acct .avatar") || {}).textContent,
      title: (document.querySelector(".topbar .acct") || { getAttribute: () => null }).getAttribute("title")
    }));
    check(/Signed in as reader9\./.test(seen.panel) && /You sign in with GitHub\./.test(seen.panel), "5 without an email the username and the service are shown", seen.panel);
    check(seen.empty === 0, "5 no empty bold name is drawn", seen.empty);
    check(seen.avatar === "R" && seen.title === "Signed in as reader9", "5 the top bar uses the username", { avatar: seen.avatar, title: seen.title });
    await b.context.close();
  }

  /* 13. the data panel names the answer log; the export reads the key explicitly */
  {
    const s13 = { user: { id: "u1", email: "reader@example.com", app_metadata: { provider: "google", providers: ["google"] } } };
    const a = await open({ providers: ["google"] }, { session: s13 });
    const t13 = await text(a.page, "[data-account]");
    check(/log of your answers/.test(t13) && /never what you typed/.test(t13), "13 the data panel names the answer log and says never what you typed", t13);
    const exp = await a.page.evaluate(() => { localStorage.setItem("bm.events.v1", JSON.stringify({ v: 1, ev: {} })); return window.BMAccount.exportData(); });
    check(exp && exp.events && exp.events.v === 1, "13 the export carries the events log", exp && exp.events);
    await a.context.close();
  }

  /* 12. the age line shows on the drawn page, signed out and signed in */
  {
    const out = await open({ providers: ["google"] });
    const outText = await text(out.page, "main");
    check(/13 or older/.test(outText) && /Add a younger learner/.test(outText), "12 signed out, the page says accounts are for people 13 or older, and where to add a younger learner", outText);
    await out.context.close();
    const inn = await open({ providers: ["google"] }, { session: { user: { id: "u1", email: "reader@example.com", app_metadata: { provider: "google", providers: ["google"] } } } });
    const inText = await text(inn.page, "main");
    check(/13 or older/.test(inText) && /Add a younger learner/.test(inText), "12 signed in, the page says accounts are for people 13 or older, and where to add a younger learner", inText);
    await inn.context.close();
  }

  /* 6. a wrong password, with buttons on the page */
  {
    const { page, context } = await open({ providers: ["google"] });
    await page.fill("#acct-email", "reader@example.com");
    await page.fill("#acct-pass", "not-the-password");
    await page.click("#acct-in");
    await page.waitForFunction(() => /Invalid login credentials/.test(document.querySelector("[data-note]").textContent));
    const note = await text(page, "[data-note]");
    check(/use that button/.test(note), "6 a failed password sign-in points to the buttons", note);
    await context.close();

    const refused = await open({ providers: ["google"], emailDelivery: false }, { stub: { signUpRefused: true } });
    await refused.page.fill("#acct-email", "someone@example.com");
    await refused.page.fill("#acct-pass", "long-enough-password");
    await refused.page.click("#acct-up");
    await refused.page.waitForFunction(() => document.querySelector("[data-note]").textContent.length > 0);
    const why = await text(refused.page, "[data-note]");
    check(/cannot send confirmation emails yet/.test(why) && /buttons above/.test(why) && !/not authorized/.test(why),
      "6 a sign-up the mailer refuses is explained and points to the buttons", why);
    await refused.context.close();
  }

  /* 7. narrow screen */
  {
    const { page, context } = await open({ providers: ALL, emailDelivery: false }, { width: 360 });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(over <= 0, "7 five buttons do not overflow a 360px screen", over);
    await context.close();
  }

  /* 8. set-aside progress of a reader with no email */
  {
    const pending = { u9: { email: "", via: ["github"], resetAt: 0, state: {}, at: 0 }, u8: { email: "reader@example.com", resetAt: 0, state: {}, at: 0 } };
    const { page, context } = await open({ providers: ["github"] }, { pending });
    const notes = await page.evaluate(() => Array.from(document.querySelectorAll("[data-account] form > .form-note.bad")).map((n) => n.textContent.replace(/\s+/g, " ")));
    check(notes.length === 2 && notes.some((n) => /an earlier account \(signed in with GitHub\)/.test(n)), "8 a reader with no email is identified by the service they use", notes);
    check(notes.some((n) => /r\u2022\u2022\u2022@example\.com could not be/.test(n)), "8 an older record without a service still shows its masked email", notes);
    await context.close();
  }

  /* 9. a hand-over that fails, and coming Back */
  {
    const failing = await open({ providers: ["discord"] }, { stub: { oauthFails: true } });
    await failing.page.click("#acct-oauth-discord");
    await failing.page.waitForFunction(() => /not enabled/.test(document.querySelector("[data-handover]").textContent));
    const state = await failing.page.evaluate(() => ({
      disabled: document.getElementById("acct-oauth-discord").disabled, bad: !!document.querySelector("[data-handover] .form-note.bad")
    }));
    check(!state.disabled && state.bad, "9 a failed hand-over is reported beside the buttons and the button works again", state);
    await failing.context.close();

    const back = await open({ providers: ["google"] });
    await back.page.click("#acct-oauth-google");
    await back.page.waitForFunction(() => document.getElementById("acct-oauth-google").disabled);
    await back.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    const after = await back.page.evaluate(() => ({
      disabled: document.getElementById("acct-oauth-google").disabled, note: document.querySelector("[data-handover]").textContent
    }));
    check(!after.disabled && after.note === "", "9 coming Back from the service finds a live button and no stale message", after);
    await back.context.close();
  }

  /* 10. other pages leave the address alone */
  {
    const { page, context } = await open({ providers: ["github"] }, { page: "about.html", tail: "?error=access_denied&error_description=x" });
    check(await page.evaluate(() => location.search) === "?error=access_denied&error_description=x", "10 an error in the address is only taken out on the account page");
    await context.close();
  }

  /* 11. who downloads the library: the stand-in is left off, so a page that wants a client
     has to fetch bundle/supabase.js, and a signed-out visitor must not */
  {
    const chapter = site.curriculum(site.ROOT).chapters[0].path;
    for (const rel of [chapter, "about.html"]) {
      const { page, context, outside, requests } = await open({ providers: ["github"] }, { page: rel, realSdk: true });
      /* let the page settle: fonts, lazy work after load, anything account.js might do */
      await page.waitForLoadState("networkidle");
      const list = Array.from(new Set(requests)).map((u) => u.replace(server.url, "/")).sort();
      check(outside.length === 0, "11 signed out on " + rel + ", nothing is asked of any other server", outside);
      check(chunkAsked(requests).length === 0, "11 signed out on " + rel + ", the supabase chunk is not fetched", chunkAsked(requests));
      check(!(await page.evaluate(() => !!window.supabase)), "11 … and no client library is on the page", null);
      console.log("     " + rel + " signed out asked for " + list.length + " file(s):\n       " + list.join("\n       "));
      await context.close();
    }
    const { page, context, outside, requests } = await open({ providers: ["github"] }, { realSdk: true });
    await page.waitForFunction(() => document.getElementById("acct-oauth-github") && document.getElementById("acct-in"));
    const got = chunkAsked(requests);
    check(got.length === 1, "11 the account page fetches bundle/supabase.js once, from the site itself", got);
    const sent = outside.filter((u) => !/^https:\/\/testref\.supabase\.co\//.test(u));
    check(sent.length === 0, "11 … and asks no server but, at most, the configured Supabase project", sent);
    check(outside.length === 0, "11 … which a signed-out visitor to the account page does not contact either", outside);
    const drawn = await page.evaluate(() => ({ button: !!document.getElementById("acct-oauth-github"), form: !!document.getElementById("acct-in"), stub: !!window.supabase }));
    check(drawn.button && drawn.form && !drawn.stub, "11 the form is drawn with the real library, no stand-in on the page", drawn);
    await context.close();
  }

  /* 14-19. the Learners panel */
  const LS = { user: { id: "u1", email: "parent@example.com", app_metadata: { provider: "google", providers: ["google"] } } };
  const mk = (id, name) => ({ id, self: false, name, under13: true, consent_v: 1, created_at: "2026-10-02T00:00:00Z" });
  const roster = () => [
    { id: "u1", self: true, name: null, under13: false, consent_v: null, created_at: "2026-10-01T00:00:00Z" },
    mk("L1", "Maya <b>"), mk("L2", "Sam")
  ];
  const open_ = (stub, extra) => open({ providers: ["google"] }, Object.assign({ session: LS, stub }, extra || {}))
    .then(async (r) => { await r.page.waitForSelector("#lrn-h"); await r.page.waitForSelector("#lrn-add"); return r; });
  const calls = (page, name) => page.evaluate((n) => window.__rpc.filter((c) => c.name === n), name);

  /* 14 */
  {
    const { page, context } = await open_({ learners: roster() }, { local: { "bm.sync.v1": { learner: "L1", acct: "u1" } } });
    const seen = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".learner-row"));
      return {
        n: rows.length, first: rows[0].querySelector(".learner-name").textContent,
        names: rows.map((r) => r.querySelector(".learner-name").textContent),
        buttons: rows.map((r) => Array.from(r.querySelectorAll("button")).map((b) => b.textContent)),
        current: rows.map((r) => r.getAttribute("aria-current")),
        on: rows.map((r) => (r.querySelector(".learner-on") || {}).textContent || null),
        injected: document.querySelectorAll(".learner-row b").length,
        order: document.getElementById("lrn-h").compareDocumentPosition(document.getElementById("acct-export")) & Node.DOCUMENT_POSITION_FOLLOWING
      };
    });
    check(seen.n === 3 && seen.first === "Your own progress" && seen.names[1] === "Maya <b>" && seen.names[2] === "Sam", "14 the panel lists the own progress first, then the learners by name", seen.names);
    check(JSON.stringify(seen.buttons[0]) === JSON.stringify(["Switch to"]), "14 the own-progress row only offers Switch to", seen.buttons[0]);
    check(JSON.stringify(seen.buttons[2]) === JSON.stringify(["Switch to", "Rename", "Download", "Delete"]), "14 a learner has the four buttons", seen.buttons[2]);
    check(JSON.stringify(seen.buttons[1]) === JSON.stringify(["Rename", "Download", "Delete"]) && seen.on[1] === "Playing as" && seen.current[1] === "true" && !seen.current[0] && !seen.current[2],
      "14 the active learner shows Playing as and aria-current", seen);
    check(seen.injected === 0 && seen.order, "14 names are escaped, and the panel is above Your data", seen);
    check((await calls(page, "learner_list")).length === 1, "14 the list is read once", await calls(page, "learner_list"));
    await page.waitForFunction(() => /Synced at/.test(document.querySelector("[data-account]").textContent));
    await page.click("#lrn-sw-self");
    await page.waitForFunction(() => document.querySelector(".learner-row .learner-on") && document.querySelector(".learner-row").getAttribute("aria-current") === "true", null, { timeout: 8000 })
      .catch(() => {});
    const after = await page.evaluate(() => ({ current: Array.from(document.querySelectorAll(".learner-row")).map((r) => r.getAttribute("aria-current")), who: window.BMAccount.learner(), note: (document.querySelector("[data-note-l]") || {}).textContent }));
    check(after.who === null && after.current[0] === "true", "14 Switch to moves the mark to the own progress", after);
    await context.close();
  }

  /* 15 */
  {
    const { page, context } = await open_({ learners: roster() });
    await page.fill("#lrn-name", "Ana");
    check(await page.evaluate(() => !document.getElementById("lrn-consent")), "15 the consent text is hidden until Under 13 is ticked");
    await page.check("#lrn-u13");
    const box = await page.evaluate(() => ({ name: document.getElementById("lrn-name").value, text: document.querySelector(".consent").textContent.replace(/\s+/g, " "), checked: document.getElementById("lrn-u13").checked }));
    check(box.name === "Ana" && box.checked && /What is kept about this learner/.test(box.text) && /never what they typed/.test(box.text) && /parent or guardian and I agree/.test(box.text),
      "15 ticking Under 13 reveals the consent text and keeps the typed name", box);
    await page.click("#lrn-add");
    check((await calls(page, "learner_add")).length === 0, "15 without the consent box nothing is sent");
    check(/parent or guardian/.test(await text(page, "[data-note-l]")), "15 the refusal is said in the panel", await text(page, "[data-note-l]"));
    await page.check("#lrn-consent");
    await page.click("#lrn-add");
    await page.waitForFunction(() => window.__rpc.some((c) => c.name === "learner_add"));
    const first = (await calls(page, "learner_add"))[0].args;
    check(first.name === "Ana" && first.under13 === true && first.consent_v === 1, "15 with the consent the call carries consent_v 1", first);
    await page.waitForFunction(() => Array.from(document.querySelectorAll(".learner-name")).some((n) => n.textContent === "Ana"));
    check(await page.evaluate(() => document.getElementById("lrn-name").value === "" && !document.getElementById("lrn-consent") && document.activeElement.id === "lrn-h"),
      "15 the form is cleared and the focus goes to the heading");
    await page.fill("#lrn-name", "Ben");
    await page.click("#lrn-add");
    await page.waitForFunction(() => window.__rpc.filter((c) => c.name === "learner_add").length === 2);
    const second = (await calls(page, "learner_add"))[1].args;
    check(second.name === "Ben" && second.under13 === false && second.consent_v === null, "15 without the tick, consent_v is null", second);
    await context.close();
  }

  /* 16 */
  {
    const { page, context } = await open_({ learners: roster() });
    await page.click("#lrn-r-L2");
    check(await page.evaluate(() => document.activeElement.id === "lrn-ri-L2" && document.activeElement.value === "Sam"), "16 Rename opens a prefilled field with the focus in it");
    await page.keyboard.press("Escape");
    check(await page.evaluate(() => document.activeElement.id === "lrn-r-L2" && !document.getElementById("lrn-ri-L2")), "16 Escape cancels and the focus returns to Rename");
    check((await calls(page, "learner_rename")).length === 0, "16 Escape sends nothing");
    await page.click("#lrn-r-L2");
    await page.fill("#lrn-ri-L2", "Samir");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__rpc.some((c) => c.name === "learner_rename"));
    const call = (await calls(page, "learner_rename"))[0].args;
    check(call.id === "L2" && call.name === "Samir", "16 Enter calls learner_rename", call);
    await page.waitForFunction(() => Array.from(document.querySelectorAll(".learner-name")).some((n) => n.textContent === "Samir"));
    check(await page.evaluate(() => document.activeElement.id === "lrn-r-L2"), "16 after saving the focus is on Rename");
    await page.click("#lrn-r-L2");
    await page.click("#lrn-rc-L2");
    check(await page.evaluate(() => document.activeElement.id === "lrn-r-L2" && !document.getElementById("lrn-ri-L2")), "16 Cancel works the same");
    await context.close();
  }

  /* 17 */
  {
    const { page, context } = await open_({ learners: roster() });
    await page.click("#lrn-del-L2");
    check((await calls(page, "learner_delete")).length === 0 && /Press again to delete Sam/.test(await text(page, "#lrn-del-L2")), "17 the first press only arms", await text(page, "#lrn-del-L2"));
    await page.click("#lrn-del-L2");
    await page.waitForFunction(() => window.__rpc.some((c) => c.name === "learner_delete"));
    check((await calls(page, "learner_delete"))[0].args.id === "L2", "17 the second press calls learner_delete");
    await page.waitForFunction(() => !document.getElementById("lrn-del-L2"));
    check(/Deleted Sam/.test(await text(page, "[data-note-l]")), "17 the list redraws and says so", await text(page, "[data-note-l]"));
    await context.close();

    const st = await open_({ learners: roster(), stale: true });
    check(await st.page.evaluate(() => !document.getElementById("acct-stepin")), "17 no sign-in controls before they are needed");
    await st.page.click("#lrn-del-L2");
    await st.page.click("#lrn-del-L2");
    await st.page.waitForSelector("#acct-stepin");
    const note = await text(st.page, "[data-note-l]");
    check(note === "To confirm it is you, sign in again, then press Delete again.", "17 a stale sign-in says to sign in again", note);
    check(await st.page.evaluate(() => !!document.getElementById("acct-oauth-google") && !!document.getElementById("acct-email") && !!document.getElementById("acct-pass") && !!document.getElementById("lrn-del-L2")),
      "17 the sign-in controls appear and the learner is still listed");
    await st.page.click("#lrn-dl-L1");
    await st.page.waitForFunction(() => /press Download again/.test(document.querySelector("[data-note-l]").textContent));
    await st.context.close();
  }

  /* 18 */
  {
    const { page, context } = await open_({ learners: roster() });
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#lrn-dl-L2")]);
    const call = (await calls(page, "learner_export"))[0].args;
    check(call.id === "L2", "18 Download calls learner_export", call);
    check(dl.suggestedFilename() === "basic-mathematics-sam.json", "18 the file is named after the learner", dl.suggestedFilename());
    const odd = await Promise.all([page.waitForEvent("download"), page.click("#lrn-dl-L1")]);
    check(odd[0].suggestedFilename() === "basic-mathematics-maya-b.json", "18 a name with punctuation becomes a plain file name", odd[0].suggestedFilename());
    await context.close();
  }

  /* 19 */
  {
    const { page, context } = await open_({ learners: roster() }, { width: 360 });
    await page.check("#lrn-u13");
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(over <= 0, "19 the Learners panel does not overflow a 360px screen", over);
    await page.click("#lrn-r-L2");
    check(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, "19 … nor with a rename field open");
    await page.keyboard.press("Escape");
    await page.focus("#lrn-h");
    const wanted = await page.evaluate(() => Array.from(document.querySelectorAll(".learners button, .learners input")).map((el) => el.id));
    const reached = [];
    for (let i = 0; i < wanted.length + 3; i++) {
      await page.keyboard.press("Tab");
      const id = await page.evaluate(() => document.activeElement.id);
      if (wanted.includes(id) && !reached.includes(id)) reached.push(id);
    }
    check(wanted.length > 8 && wanted.every((id) => reached.includes(id)), "19 every control in the panel is reached by Tab", wanted.filter((id) => !reached.includes(id)));
    check(await page.evaluate(() => Array.from(document.querySelectorAll(".learners button, .learners input")).every((el) => !el.disabled)), "19 no control is disabled");
    await context.close();
  }

  /* 20 */
  {
    const local = { "bm.sync.v1": { learner: "L1", acct: "u1" } };
    const { page, context } = await open_({ learners: roster() }, { local });
    await page.waitForFunction(() => /Synced at/.test(document.querySelector("[data-account]").textContent));
    await page.click("#lrn-del-L1");
    await page.click("#lrn-del-L1");
    await page.waitForFunction(() => window.__rpc.some((c) => c.name === "learner_delete"));
    const del = (await calls(page, "learner_delete"))[0];
    check(del.args.id === "L1" && del.learner === null, "20 the switch to the own progress happened before learner_delete", del);
    await page.waitForFunction(() => !document.getElementById("lrn-del-L1"));
    const fin = await page.evaluate(() => ({ who: window.BMAccount.learner(), current: Array.from(document.querySelectorAll(".learner-row")).map((r) => r.getAttribute("aria-current")) }));
    check(fin.who === null && fin.current[0] === "true", "20 the page is on the own progress", fin);
    check(/^Switched back to your own progress, and deleted/.test(await text(page, "[data-note-l]")), "20 and says so", await text(page, "[data-note-l]"));
    await context.close();

    const st = await open_({ learners: roster(), stale: true }, { local });
    await st.page.waitForFunction(() => /Synced at/.test(document.querySelector("[data-account]").textContent));
    await st.page.click("#lrn-del-L1");
    await st.page.click("#lrn-del-L1");
    await st.page.waitForSelector("#acct-stepin");
    const note = await text(st.page, "[data-note-l]");
    check(note === "Switched back to your own progress. To confirm it is you, sign in again, then press Delete again.", "20 a stale refusal after the switch says both", note);
    const on = await st.page.evaluate(() => ({ who: window.BMAccount.learner(), first: document.querySelector(".learner-row").getAttribute("aria-current") }));
    check(on.who === null && on.first === "true", "20 … and the page is on the own progress", on);
    await st.context.close();
  }

  /* 21 */
  {
    const { page, context } = await open_({ learners: roster(), stale: true });
    await page.click("#lrn-del-L2");
    await page.click("#lrn-del-L2");
    await page.waitForSelector("#acct-stepin");
    const email = await page.evaluate(() => ({ v: document.getElementById("acct-email").value, ro: document.getElementById("acct-email").readOnly }));
    check(email.v === "parent@example.com" && email.ro, "21 the step-up email is the account's, and read-only", email);
    await page.fill("#acct-pass", "wrong-password");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => /Invalid login/.test((document.querySelector("[data-note-s]") || {}).textContent || ""));
    check(/sign in again, then press Delete again/.test(await text(page, "[data-note-l]")) && !/Invalid/.test(await text(page, "[data-note-l]")), "21 a wrong password reports in the form's own slot and the instruction stays", await text(page, "[data-note-l]"));
    await page.evaluate(() => { window.__opts.signInOk = true; window.__opts.stale = false; });
    await page.fill("#acct-pass", "right-password");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !document.getElementById("acct-stepin"));
    check(await text(page, "[data-note-l]") === "Signed in again. Now press Delete again.", "21 a right password removes the form and says to press again", await text(page, "[data-note-l]"));
    check(await page.evaluate(() => document.activeElement.id === "lrn-del-L2"), "21 the focus is on that Delete button", await page.evaluate(() => document.activeElement.id));
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__rpc.filter((c) => c.name === "learner_delete").length === 2);
    await page.waitForFunction(() => !document.getElementById("lrn-del-L2"));
    await context.close();
  }

  /* 22 */
  {
    const { page, context } = await open_({ learners: roster(), stale: true });
    await page.check("#lrn-u13");
    await page.check("#lrn-consent");
    await page.uncheck("#lrn-u13");
    await page.check("#lrn-u13");
    check(await page.evaluate(() => document.getElementById("lrn-consent").checked === false), "22 unticking Under 13 clears the consent tick");
    await page.click("#lrn-del-L2");
    await page.click("#lrn-del-L2");
    await page.waitForSelector("#acct-stepin");
    await page.click("#lrn-r-L1");
    await page.click("#acct-out");
    await page.waitForSelector("#acct-in");
    await page.evaluate(() => {
      window.__opts.signInOk = true; window.__opts.signInAs = "u2"; window.__opts.stale = false;
      window.__opts.learners = [{ id: "u2", self: true, name: null, under13: false, consent_v: null, created_at: "x" }, { id: "M1", self: false, name: "Zed", under13: true, consent_v: 1, created_at: "y" }];
    });
    await page.fill("#acct-email", "u2@example.com");
    await page.fill("#acct-pass", "right-password");
    await page.click("#acct-in");
    await page.waitForSelector("#lrn-h");
    await page.waitForFunction(() => Array.from(document.querySelectorAll(".learner-name")).some((n) => n.textContent === "Zed"));
    const seen = await page.evaluate(() => ({
      names: Array.from(document.querySelectorAll(".learner-name")).map((n) => n.textContent),
      armed: /Press again/.test(document.querySelector(".learners").textContent), rename: !!document.querySelector("[id^=lrn-ri-]"),
      step: !!document.getElementById("acct-stepin"), consent: !!document.getElementById("lrn-consent"), u13: document.getElementById("lrn-u13").checked,
      note: document.querySelector("[data-note-l]").textContent
    }));
    check(JSON.stringify(seen.names) === JSON.stringify(["Your own progress", "Zed"]) && !seen.armed && !seen.rename && !seen.step && !seen.consent && !seen.u13 && seen.note === "",
      "22 another account shows its own list with nothing armed, open or ticked", seen);
    await context.close();
  }

  /* 23 */
  {
    const { page, context } = await open_({ learners: roster(), addDelay: 400 });
    await page.fill("#lrn-name", "Quick");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => Array.from(document.querySelectorAll(".learner-name")).some((n) => n.textContent === "Quick"));
    check((await calls(page, "learner_add")).length === 1, "23 two quick Enters send one learner_add", (await calls(page, "learner_add")).length);
    await page.click("#lrn-r-L2");
    await page.fill("#lrn-ri-L2", "Samuel");
    await page.click("#acct-sync");
    await page.waitForFunction(() => /Synced at/.test(document.querySelector("[data-account]").textContent));
    const kept = await page.evaluate(() => document.getElementById("lrn-ri-L2").value);
    check(kept === "Samuel", "23 a rename field keeps the typed text across a sync redraw", kept);
    await page.click("#lrn-rs-L2");
    await page.waitForFunction(() => window.__rpc.some((c) => c.name === "learner_rename"));
    check((await calls(page, "learner_rename"))[0].args.name === "Samuel", "23 Save sends the typed name");
    await context.close();
  }

  /* 24 */
  {
    const { page, context } = await open_({ learners: roster() });
    await page.waitForFunction(() => /Synced at/.test(document.querySelector("[data-account]").textContent));
    await page.focus("#lrn-r-L2");
    await page.evaluate(() => { document.getElementById("lrn-r-L2").__old = true; window.BMAccount.syncNow(); });
    await page.waitForFunction(() => !document.getElementById("lrn-r-L2").__old);
    check(await page.evaluate(() => document.activeElement.id === "lrn-r-L2"), "24 a sync redraw keeps the focus on the Rename button", await page.evaluate(() => document.activeElement.id));
    await page.waitForFunction(() => /Synced at/.test(document.querySelector(".sync-state").textContent));
    await page.waitForTimeout(200);
    check(await page.evaluate(() => document.activeElement.id === "lrn-r-L2"), "24 … and after it settles");
    await page.focus("#lrn-h");
    await page.keyboard.press("Tab");
    check(await page.evaluate(() => document.activeElement.id === "lrn-sw-L1"), "24 Tab from the heading reaches Switch to", await page.evaluate(() => document.activeElement.id));
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.BMAccount.learner() === "L1");
    await page.waitForFunction(() => /Synced at/.test(document.querySelector(".sync-state").textContent));
    check(await page.evaluate(() => !!document.activeElement.closest(".learners")), "24 after the switch the focus is still inside the Learners panel", await page.evaluate(() => document.activeElement.tagName));
    await context.close();
  }

  /* 25 */
  {
    const r = await open({ providers: ["google"], learners: "off" }, { session: LS, stub: { learners: roster() } });
    await r.page.waitForSelector("#acct-delete");
    await r.page.waitForFunction(() => /Synced at/.test(document.querySelector("[data-account]").textContent));
    await r.page.waitForTimeout(300);
    check(await r.page.evaluate(() => !document.getElementById("lrn-h") && !document.querySelector(".learners") && !document.getElementById("lrn-add")), "25 learners off draws no Learners panel");
    check((await calls(r.page, "learner_list")).length === 0, "25 … and calls no learner_list", (await calls(r.page, "learner_list")).length);
    await r.context.close();
    const on = await open_({ learners: roster() });
    check((await calls(on.page, "learner_list")).length >= 1, "25 the default still reads the list");
    await on.context.close();
  }

  /* 26 */
  {
    for (const off of [false, true]) {
      const tag = off ? "26 (panel off) " : "26 ";
      const r = await open(off ? { providers: ["google"], learners: "off" } : { providers: ["google"] }, { session: LS, stub: { learners: roster(), staleDelete: true } });
      const page = r.page;
      await page.waitForSelector("#acct-delete");
      await page.click("#acct-delete");
      await page.click("#acct-delete");
      await page.waitForSelector("#acct-stepin");
      const st = await page.evaluate(() => ({
        note: document.querySelector("[data-note]").textContent, armed: document.getElementById("acct-delete").getAttribute("data-armed"),
        label: document.getElementById("acct-delete").textContent, email: document.getElementById("acct-email").value,
        under: !!document.getElementById("lrn-h") === !document.querySelector(".learners") }));
      check(st.note === "To confirm it is you, sign in again, then press Delete my account again.", tag + "the note is in the Your account slot", st.note);
      check(st.armed === "true" && /Press again/.test(st.label), tag + "the button stays armed", st);
      check(st.email === "parent@example.com", tag + "the step-up form is drawn with the account's email", st.email);
      check((await calls(page, "delete_my_account")).length === 1, tag + "one delete_my_account so far");
      await page.evaluate(() => { window.__opts.signInOk = true; window.__opts.staleDelete = false; });
      await page.fill("#acct-pass", "right-password");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => !document.getElementById("acct-stepin"));
      check(await text(page, "[data-note]") === "Signed in again. Now press Delete my account again.", tag + "a right password clears the form and says to press again", await text(page, "[data-note]"));
      check(await page.evaluate(() => document.activeElement.id === "acct-delete" && document.activeElement.getAttribute("data-armed") === "true"), tag + "the focus is on the armed Delete button", await page.evaluate(() => document.activeElement.id));
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => window.__rpc.filter((c) => c.name === "delete_my_account").length === 2);
      await page.waitForTimeout(200);
      check((await calls(page, "delete_my_account")).length === 2, tag + "the next press called delete_my_account once more", (await calls(page, "delete_my_account")).length);
      await r.context.close();
    }
  }

  check(errors.length === 0, "no uncaught page errors", errors);
  await browser.close();
  await server.close();
  console.log((fails ? "FAILED" : "ok") + " account: " + passes + " checks passed, " + fails + " failed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
