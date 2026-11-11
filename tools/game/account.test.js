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
       armed, a right password says to press again, and the next press deletes once
   27. a sign-out, another account and a server error disarm Delete my account; a held call takes one press
   (28-32 below are older cases the list never named: learners off with a managed learner, keep this
   device, mark under 13, the stale consent. The connector's cases (CN-9) carry on from 33; the brief
   called them 28-40, so its n is 33 + (n - 28) here.)
   33. connect off (absent): an authorization request in the address is ignored, nothing is stored
       or stripped, and the page is the plain sign-in form
   34. connect "preview", signed out: the parameters are out of the address before the SDK is made, the
       request is in sessionStorage, and the page says it will offer to connect Claude after sign-in
   35. signed in: the consent panel names Claude and draws nothing of the request; connect_approve
       is not called until Allow; Allow sends the raw strings once and goes to the callback with
       code, iss and state; nothing of the request is left; the ids and state never reach the HTML
   36. Don't allow: no rpc, error=access_denied with iss and state, nothing left
   37. a redirect_uri off the list (every near miss): nothing stored, nobody told, the address kept
   38. a listed redirect_uri with something else wrong is answered at it with an error, iss and state
   39. a stale sign-in shows the step-up under the panel; signing in again keeps the request, and
       Allow calls once more and goes on
   40. playing as a managed learner, or kept on one: the panel names the learner and has no Allow;
       switching to the own progress shows it
   41. a request older than 10 minutes is dropped; a sign-out removes a live one
   42. too many approvals / too many connections / bad request / not signed in: their sentences, no
       navigation, and only bad request clears the request
   43. a loopback callback: "an app on this computer", its warning, and the raw string kept (port 80)
   44. a resource that is this site's /mcp is accepted and never echoed
   45. the panel fits 360px and both buttons are reached by Tab
   46. connect "on": the Connect your AI panel with the address, two steps and the listed
       connections, named and escaped; a bad row is dropped; connect_list is read once
   47. "preview" draws the panel only for an account with a connection (no address, no steps);
       absent draws none and asks for none; playing as a learner draws none
   48. Remove sends one connect_revoke, holds the button, re-reads the list, says so, focuses the heading
   49. "not your connection", another error and a list error: their notes, the retry
   50. a held reply for account A that lands after a sign-in as B draws nothing for B (list and revoke)
   51. the too-many-connections sentence points at the panel and the request is kept
   52. a repeated parameter of any name is answered invalid_request; an expired request under a
       drawn panel says so for Allow and Don't allow, with no call
   53. a session that ends takes the request; sign-in takes the bad-address note; Allow re-checks
       the own progress at click time; a future-dated or mismatched record is dropped */
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
  window.__hrefAtCreate = location.href;
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
        if (table === "user_state" && write) {
          window.__writes = (window.__writes || 0) + 1;
          if (opts.holdState) return Promise.resolve({ data: null, error: { message: "Held for the test" } }).then(ok, bad);
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
      if (window.__recRpc) window.__recRpc(name, JSON.stringify(args || {}));
      if (name === "connect_approve") {
        if (window.__opts && window.__opts.approveError) return Promise.resolve({ data: null, error: { message: window.__opts.approveError, code: "P0001" } });
        return Promise.resolve(answer((window.__opts && window.__opts.approveCode) || "ab".repeat(32)));
      }
      if (name === "learner_add" && opts.addDelay) return new Promise(function (ok) { setTimeout(function () { rows().push({ id: "L-new", self: false, name: args.name, under13: !!args.under13, consent_v: args.consent_v, created_at: "2026-10-18T00:00:00Z" }); ok(answer("L-new")); }, opts.addDelay); });
      if (name === "connect_list") {
        if (opts.listError) return Promise.resolve({ data: null, error: { message: opts.listError, code: "XX000" } });
        /* the rows are what the server held when the call was made, not when the reply lands (a late-reply case swaps them) */
        var snap = (opts.connections || []).slice();
        if (opts.listDelay) { var wait = opts.listDelay; return new Promise(function (ok) { setTimeout(function () { ok(answer(snap)); }, wait); }); }
        return Promise.resolve(answer(snap));
      }
      if (name === "connect_revoke") {
        function gone() { opts.connections = (opts.connections || []).filter(function (c) { return c.id !== args.p_id; }); }
        function reply() {
          if (opts.revokeError) { if (/not your connection/.test(opts.revokeError)) gone(); return { data: null, error: { message: opts.revokeError, code: "P0001" } }; }
          gone();
          return answer(null);
        }
        if (opts.revokeDelay) return new Promise(function (ok) { setTimeout(function () { ok(reply()); }, opts.revokeDelay); });
        return Promise.resolve(reply());
      }
      if (name === "learner_list") return Promise.resolve(answer(rows().slice()));
      if (name === "learner_add") {
        rows().push({ id: "L-new", self: false, name: args.name, under13: !!args.under13, consent_v: args.consent_v, created_at: "2026-10-18T00:00:00Z" });
        return Promise.resolve(answer("L-new"));
      }
      if (name === "delete_my_account" && opts.deleteDelay) return new Promise(function (ok) { setTimeout(function () { ok(answer(null)); }, opts.deleteDelay); });
      if (name === "delete_my_account" && opts.deleteError) return Promise.resolve({ data: null, error: { message: opts.deleteError, code: "XX000" } });
      if (name === "delete_my_account" && opts.staleDelete) return Promise.resolve({ data: null, error: { message: "stale sign-in", code: "P0001" } });
      if (name === "learner_mark_under13") {
        if (opts.markRefused) return Promise.resolve({ data: null, error: { message: "consent required", code: "P0001" } });
        if (opts.markDelay) return new Promise(function (ok) { setTimeout(function () { rows().forEach(function (l) { if (l.id === args.id) { l.under13 = true; l.consent_v = args.consent_v; } }); ok(answer(null)); }, opts.markDelay); });
        rows().forEach(function (l) { if (l.id === args.id) { l.under13 = true; l.consent_v = args.consent_v; } });
        return Promise.resolve(answer(null));
      }
      if (/^learner_(rename|delete|export)$/.test(name)) {
        if (opts.stale && name !== "learner_rename") return Promise.resolve({ data: null, error: { message: "stale sign-in", code: "P0001" } });
        if (name === "learner_rename") rows().forEach(function (l) { if (l.id === args.id) l.name = args.name; });
        if (name === "learner_delete") opts.learners = rows().filter(function (l) { return l.id !== args.id; });
        return Promise.resolve(answer(name === "learner_export" ? { learner: args.id, events: [] } : null));
      }
      return Promise.resolve(answer(null));
    },
    auth: {
      onAuthStateChange: function (cb) { subs.push(cb); window.__emit = function (ev, sess) { subs.forEach(function (f) { f(ev, sess); }); }; return { data: { subscription: { unsubscribe: function () {} } } }; },
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
  const browser = await chromium.launch(require("../lib/gl").opts(chromium));   /* off the machine's GPU: lib/gl.js */
  const errors = [];

  /* the chunk only account.js's import() fetches (tools/check-dist.js ON_DEMAND) */
  const SUPABASE_CHUNK = /\/bundle\/supabase\.js$/;
  /* where the connector sends a person back to: the allow-listed callbacks (a loopback port the harness does not serve on; Chromium drops :80 from the address it asks for) */
  const CALLBACKS = /^(https:\/\/(claude\.ai|claude\.com|chatgpt\.com)\/|http:\/\/(localhost|127\.0\.0\.1)(:8080)?\/)/;

  /* a fresh browser profile on account.html, with this config and (optionally) a session;
     `requests` is every URL the page asked for, `outside` those not on the local server */
  async function open(config, opts) {
    opts = opts || {};
    const context = await browser.newContext({ viewport: { width: opts.width || 1280, height: 800 } });
    const outside = [], requests = [], navs = [], rpcLog = [];
    await context.route(/^(https?|wss?):/, (r) => {
      const u = r.request().url();
      requests.push(u);
      if (server.owns(u)) return r.continue();
      outside.push(u);
      /* the connector's callbacks: a page navigation to one is recorded and answered with an empty page */
      if (opts.callbacks && r.request().isNavigationRequest() && CALLBACKS.test(u)) {
        navs.push(u);
        return r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>app</title>" });
      }
      return r.abort();
    });
    if (opts.callbacks) await context.exposeFunction("__recRpc", (name, json) => { rpcLog.push({ name, args: JSON.parse(json) }); });
    if (!opts.realSdk) await context.addInitScript(SDK);
    await context.addInitScript((seed) => {
      const pinned = Object.assign({ supabaseUrl: "https://testref.supabase.co", supabaseAnonKey: "sb_publishable_test" }, seed.config);
      Object.defineProperty(window, "BM_CONFIG", { get: () => pinned, set: () => {}, configurable: false });
      window.__session = seed.session || null;
      window.__opts = seed.stub;
      if (seed.pending) localStorage.setItem("bm.sync.pending.v1", JSON.stringify(seed.pending));
      if (seed.local) Object.keys(seed.local).forEach((k) => localStorage.setItem(k, JSON.stringify(seed.local[k])));
      if (seed.sess) Object.keys(seed.sess).forEach((k) => sessionStorage.setItem(k, seed.sess[k]));
      /* was the returned-error message ever on the page as an alert? */
      new MutationObserver(() => {
        if (document.querySelector('#acct-returned[role="alert"]')) window.__alerted = true;
      }).observe(document, { childList: true, subtree: true });
    }, { config, session: opts.session || null, pending: opts.pending || null, local: opts.local || null, sess: opts.sess || null, stub: opts.stub || {} });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    /* nowait: the page is expected to leave at once (an answer to an app), so nothing is waited for on it */
    if (opts.nowait) {
      await page.goto(server.url + (opts.page || "account.html") + (opts.tail || "")).catch(() => {});
      return { page, context, outside, requests, navs, rpcLog };
    }
    await page.goto(server.url + (opts.page || "account.html") + (opts.tail || ""));
    if (opts.page) { await page.waitForFunction(() => window.BMAccount); return { page, context, outside, requests, navs, rpcLog }; }
    await page.waitForFunction(() => window.BMAccount && document.querySelector("[data-account] .panel"));
    if (opts.session) await page.waitForFunction(() => /Signed in/.test(document.querySelector("[data-account]").textContent));
    else if (!opts.realSdk) await page.waitForFunction(() => window.supabase);
    return { page, context, outside, requests, navs, rpcLog };
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
      const place = await page.evaluate(() => {
        const form = document.getElementById("acct-stepin").closest("form"), prev = form.previousElementSibling;
        const h = prev && prev.querySelector("h2");
        return { prev: prev ? prev.className + "|" + (h ? h.textContent : "") : null, learners: !!document.querySelector(".learners"),
          follows: !!document.querySelector(".learners") && !!(document.querySelector(".learners").compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING) };
      });
      if (off) check(!place.learners && /\|Your data$/.test(place.prev), tag + "the form follows Your data", place);
      else check(place.learners && place.follows && /^panel learners\|/.test(place.prev), tag + "the form follows the Learners panel", place);
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

  /* 27. the account delete's arming ends with a sign-out, another account, and a server error; a held call takes one press */
  {
    const label = (page) => page.evaluate(() => (document.getElementById("acct-delete") || {}).textContent);
    const r = await open({ providers: ["google"] }, { session: LS, stub: { learners: roster() } });
    await r.page.waitForSelector("#acct-delete");
    await r.page.click("#acct-delete");
    check(/Press again/.test(await label(r.page)), "27 one press arms");
    await r.page.click("#acct-out");
    await r.page.waitForFunction(() => !document.getElementById("acct-delete"));
    await r.page.evaluate(() => { window.__opts.signInOk = true; return window.BMAccount.signIn("parent@example.com", "right-password"); });
    await r.page.waitForSelector("#acct-delete");
    check(await label(r.page) === "Delete my account", "27 a sign-out disarms Delete", await label(r.page));
    await r.page.click("#acct-delete");
    check(/Press again/.test(await label(r.page)), "27 … and one press arms again");
    await r.page.evaluate(() => { window.__opts.signInAs = "u2"; return window.BMAccount.signIn("other@example.com", "right-password"); });
    await r.page.waitForFunction(() => window.BMAccount.user() && window.BMAccount.user().id === "u2");
    await r.page.waitForSelector("#acct-delete");
    check(await label(r.page) === "Delete my account", "27 a sign-in as another account disarms Delete", await label(r.page));
    await r.context.close();

    const h = await open({ providers: ["google"] }, { session: LS, stub: { learners: roster(), deleteDelay: 1500 } });
    await h.page.waitForSelector("#acct-delete");
    await h.page.click("#acct-delete");
    await h.page.click("#acct-delete");
    await h.page.click("#acct-delete").catch(() => null);
    await h.page.click("#acct-delete").catch(() => null);
    await h.page.waitForTimeout(500);
    check((await calls(h.page, "delete_my_account")).length === 1, "27 presses while the delete is held send one delete_my_account", (await calls(h.page, "delete_my_account")).length);
    await h.context.close();

    const e = await open({ providers: ["google"] }, { session: LS, stub: { learners: roster(), deleteError: "Server broke" } });
    await e.page.waitForSelector("#acct-delete");
    await e.page.click("#acct-delete");
    await e.page.click("#acct-delete");
    await e.page.waitForFunction(() => /Server broke/.test((document.querySelector("[data-note]") || {}).textContent || ""));
    await e.page.waitForTimeout(100);
    check(await label(e.page) === "Delete my account" && await e.page.evaluate(() => document.getElementById("acct-delete").getAttribute("data-armed") !== "true"), "27 a server error disarms Delete", await label(e.page));
    check(/Server broke/.test(await text(e.page, "[data-note]")) && await e.page.evaluate(() => !document.getElementById("acct-stepin")), "27 … shows the error and no step-up form");
    await e.page.click("#acct-delete");
    check((await calls(e.page, "delete_my_account")).length === 1, "27 … and the next press only arms");
    await e.context.close();
  }

  /* 28. learners off, a browser still playing as a managed learner: a way back to the parent's own progress */
  {
    const seed = { "bm.sync.v1": { learner: "L1", acct: "u1", learnerName: "Kim" } };
    const r = await open({ providers: ["google"], learners: "off" }, { session: LS, local: seed, stub: { learners: roster() } });
    await r.page.waitForSelector("#acct-own");
    await r.page.waitForFunction(() => /Synced at/.test(document.querySelector("[data-account]").textContent));
    const st = await r.page.evaluate(() => ({ line: (document.querySelector("[data-playing-as]") || {}).textContent, panel: !!document.querySelector(".learners") || !!document.getElementById("lrn-h"), board: !!document.getElementById("acct-board") }));
    check(/^Playing as Kim\./.test(st.line || ""), "28 the Playing as line names the learner", st.line);
    check(!st.panel && !st.board, "28 … no Learners panel and no Daily board switch", st);
    await r.page.evaluate(() => { const f = window.BMAccount.switchLearner; window.__sw = 0; window.BMAccount.switchLearner = function () { window.__sw++; return f.apply(this, arguments); }; });
    await r.page.evaluate(() => { const b = document.getElementById("acct-own"); b.click(); b.click(); });
    await r.page.waitForFunction(() => !document.getElementById("acct-own"));
    await r.page.waitForTimeout(300);
    check(await r.page.evaluate(() => document.activeElement.id) === "acct-sync", "28 the focus lands on Sync now after the switch", await r.page.evaluate(() => document.activeElement.id));
    check(await r.page.evaluate(() => window.__sw) === 1, "28 two quick presses send one switch", await r.page.evaluate(() => window.__sw));
    const after = await r.page.evaluate(() => ({ meta: JSON.parse(localStorage.getItem("bm.sync.v1") || "{}"), line: !!document.querySelector("[data-playing-as]"), note: (document.querySelector("[data-note]") || {}).textContent, learner: window.BMAccount.learner() }));
    check(!after.meta.learner && !after.learner, "28 the switch clears the meta's learner", after);
    check(!after.line, "28 … the line and the button are gone");
    check(after.note === "Switched to your own progress.", "28 … and the note says so", after.note);
    check((await calls(r.page, "learner_list")).length === 0, "28 … with no learners read");
    await r.context.close();
    /* a refusal: the push cannot land */
    const h = await open({ providers: ["google"], learners: "off" }, { session: LS, local: seed, stub: { learners: roster() } });
    await h.page.waitForSelector("#acct-own");
    await h.page.waitForFunction(() => /Synced at/.test(document.querySelector("[data-account]").textContent));
    await h.page.evaluate(() => { window.__opts.holdState = true; window.BMAccount.syncNow(); });
    await h.page.waitForFunction(() => /Sync failed|Synced at/.test(document.querySelector(".sync-state").textContent));
    await h.page.click("#acct-own");
    await h.page.waitForFunction(() => /Finish syncing first/.test((document.querySelector("[data-note]") || {}).textContent || ""), null, { timeout: 5000 });
    const ref = await h.page.evaluate(() => ({ learner: JSON.parse(localStorage.getItem("bm.sync.v1") || "{}").learner, btn: !!document.getElementById("acct-own"), focus: document.activeElement.id }));
    check(ref.learner === "L1" && ref.btn && ref.focus === "acct-own", "28 a refusal keeps the learner, the button and its focus", ref);
    await h.page.evaluate(() => { window.__opts.holdState = false; window.BMAccount.syncNow(); });
    await h.page.waitForFunction(() => /Synced at/.test(document.querySelector(".sync-state").textContent));
    await h.context.close();
    const on = await open({ providers: ["google"] }, { session: LS, local: seed, stub: { learners: roster() } });
    await on.page.waitForSelector("#lrn-h");
    check(await on.page.evaluate(() => !document.getElementById("acct-own") && !document.querySelector("[data-playing-as]")), "28 with learners on there is no Switch to your own progress button");
    await on.context.close();
  }

  /* 29. keep this device on a learner: the panel collapses until "I'm the parent" */
  {
    const keepOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("bm.sync.v1") || "{}").keep);
    const seed = { "bm.sync.v1": { learner: "L1", acct: "u1", learnerName: "Maya <b>" } };
    const r = await open_({ learners: roster() }, { local: seed });
    check(await r.page.evaluate(() => { const b = document.getElementById("lrn-keep"); return !!b && !b.checked && /Keep this device on Maya <b>/.test(b.parentNode.textContent) && document.querySelectorAll("#lrn-keep").length === 1 && b.closest("li").getAttribute("aria-current") === "true"; }), "29 the Playing as row has an unticked keep box, named and escaped");
    await r.page.click("#lrn-keep");
    await r.page.waitForSelector("#lrn-parent");
    check(await keepOf(r.page) === "L1", "29 ticking writes keep", await keepOf(r.page));
    check(/Playing as Maya <b>\. This device is kept on Maya <b>\./.test(await text(r.page, "[data-kept]")) && await r.page.evaluate(() => !document.getElementById("lrn-add") && !document.querySelector("#lrn-h ~ b, [data-kept] b b")), "29 the panel collapses to the kept line (escaped)", await text(r.page, "[data-kept]"));
    const m1 = await r.page.evaluate(() => JSON.parse(localStorage.getItem("bm.sync.v1")));
    check(m1.learner === "L1" && m1.acct === "u1" && m1.learnerName === "Maya <b>", "29 … and nothing else in the meta changed", m1);
    await r.context.close();
    /* a reload re-runs the seed, so the kept state is seeded (as a page load would find it) */
    const k = await open({ providers: ["google"] }, { session: LS, stub: { learners: roster() }, local: { "bm.sync.v1": Object.assign({ keep: "L1" }, seed["bm.sync.v1"]) } });
    r.page = k.page; r.context = k.context;
    await r.page.waitForSelector("#lrn-parent");
    await r.page.waitForTimeout(400);
    check(!(await r.page.evaluate(() => !!document.getElementById("lrn-add"))) && (await calls(r.page, "learner_list")).length === 1, "29 after a reload it is still collapsed and reads the list once (PA-11: to find out whether the consent is stale)", (await calls(r.page, "learner_list")).length);
    await r.page.click("#lrn-parent");
    await r.page.waitForSelector("#lrn-add");
    await r.page.waitForSelector("#lrn-keep");
    check((await calls(r.page, "learner_list")).length === 1 && await r.page.evaluate(() => document.getElementById("lrn-keep").checked && !document.getElementById("lrn-parent")), "29 I'm the parent reads the list once and shows the full panel, box ticked");
    check(await r.page.evaluate(() => document.activeElement.id) === "lrn-h", "29 … with the focus on the heading");
    await r.page.focus("#lrn-keep");
    await r.page.keyboard.press("Space");
    await r.page.waitForTimeout(200);
    check(await r.page.evaluate(() => document.activeElement.id) === "lrn-keep" && await keepOf(r.page) === undefined, "29 unticking with Space in the expanded view leaves the focus on the box", await r.page.evaluate(() => document.activeElement.id));
    await r.page.keyboard.press("Space");
    await r.page.waitForTimeout(200);
    check(await r.page.evaluate(() => document.activeElement.id) === "lrn-keep" && await keepOf(r.page) === "L1", "29 ticking with Space in the expanded view leaves the focus on the box", await r.page.evaluate(() => document.activeElement.id));
    await r.page.click("#lrn-keep");
    await r.page.waitForTimeout(200);
    check(await keepOf(r.page) === undefined && await r.page.evaluate(() => !!document.getElementById("lrn-add") && !document.getElementById("lrn-keep").checked), "29 unticking deletes keep and the panel stays expanded", await keepOf(r.page));
    await r.page.click("#lrn-keep");
    await r.page.waitForTimeout(200);
    check(await keepOf(r.page) === "L1" && await r.page.evaluate(() => !!document.getElementById("lrn-add")), "29 ticking again in an expanded view keeps it expanded");
    await r.page.click("#acct-out");
    await r.page.waitForFunction(() => !document.querySelector("[data-account] #acct-out"));
    check(await keepOf(r.page) === undefined, "29 sign-out deletes keep", await keepOf(r.page));
    await r.context.close();
    /* as the account's own progress there is no box; a kept id of another learner leaves the full panel */
    const o = await open_({ learners: roster() }, { local: { "bm.sync.v1": { keep: "L1" } } });
    check(await o.page.evaluate(() => !document.getElementById("lrn-keep") && !document.getElementById("lrn-parent") && !!document.getElementById("lrn-add")), "29 as self there is no keep box and no collapse");
    await o.page.click("#lrn-sw-L2");
    await o.page.waitForSelector("#lrn-keep");
    check(await keepOf(o.page) === undefined && await o.page.evaluate(() => !document.getElementById("lrn-keep").checked && !!document.getElementById("lrn-add")), "29 a switch away from the kept learner ends the keep (box unticked)", await keepOf(o.page));
    await o.page.click("#lrn-sw-L1");
    await o.page.waitForFunction(() => { const b = document.getElementById("lrn-keep"); return b && b.closest("li").getAttribute("aria-current") === "true" && b.closest("li").textContent.indexOf("Maya") >= 0; });
    check(await keepOf(o.page) === undefined && await o.page.evaluate(() => !document.getElementById("lrn-keep").checked), "29 … and switching back to L1 shows the box unticked");
    await o.context.close();
    /* keep for a learner that is gone: the list is read once, the full panel appears, keep is dropped (no endless Loading) */
    {
      const g = await open({ providers: ["google"] }, { session: LS, stub: { learners: roster() }, local: { "bm.sync.v1": { learner: "L9", acct: "u1", keep: "L9", learnerName: "Gone" } } });
      await g.page.waitForSelector("#lrn-add", { timeout: 8000 });
      await g.page.waitForTimeout(400);
      check(await g.page.evaluate(() => !!document.getElementById("lrn-add") && !/Loading learners/.test(document.querySelector(".learners").textContent)) && (await calls(g.page, "learner_list")).length === 1 && await keepOf(g.page) === undefined,
        "29 a kept learner deleted elsewhere: the full panel, one list read, keep dropped", { lists: (await calls(g.page, "learner_list")).length, keep: await keepOf(g.page) });
      await g.context.close();
    }
    /* "I'm the parent" lasts one sign-in: after a sign-out and back in, ticking collapses again */
    {
      const q = await open({ providers: ["google"] }, { session: LS, stub: { learners: roster() }, local: { "bm.sync.v1": { learner: "L1", acct: "u1", keep: "L1", learnerName: "Maya <b>" } } });
      await q.page.click("#lrn-parent");
      await q.page.waitForSelector("#lrn-add");
      await q.page.click("#acct-out");
      await q.page.waitForSelector("#acct-in");
      await q.page.evaluate(() => { window.__opts.signInOk = true; return window.BMAccount.signIn("parent@example.com", "right-password"); });
      await q.page.waitForSelector("#lrn-sw-L1");
      await q.page.click("#lrn-sw-L1");
      await q.page.waitForSelector("#lrn-keep");
      await q.page.click("#lrn-keep");
      await q.page.waitForSelector("#lrn-parent", { timeout: 5000 }).catch(() => {});
      check(await q.page.evaluate(() => !!document.getElementById("lrn-parent") && !document.getElementById("lrn-add")), "29 the parent view lasts one sign-in only");
      await q.context.close();
    }
    /* deleting the kept (not active) learner clears keep */
    {
      const d = await open({ providers: ["google"] }, { session: LS, stub: { learners: roster() }, local: { "bm.sync.v1": { learner: "L1", acct: "u1", keep: "L2", learnerName: "Maya <b>" } } });
      await d.page.waitForSelector("#lrn-del-L2");
      await d.page.click("#lrn-del-L2");
      await d.page.click("#lrn-del-L2");
      await d.page.waitForFunction(() => window.__rpc.some((c) => c.name === "learner_delete"));
      await d.page.waitForTimeout(300);
      check(await keepOf(d.page) === undefined && await d.page.evaluate(() => JSON.parse(localStorage.getItem("bm.sync.v1")).learner === "L1"), "29 deleting the kept learner clears keep", await keepOf(d.page));
      await d.context.close();
    }
    /* another account signing in (T6) drops a keep it does not own */
    {
      const t = await open({ providers: ["google"] }, { stub: { learners: roster() }, local: { "bm.sync.v1": { learner: "L1", acct: "u1", keep: "L1" } } });
      await t.page.evaluate(() => { window.__opts.signInOk = true; window.__opts.signInAs = "u2"; return window.BMAccount.signIn("other@example.com", "right-password"); });
      await t.page.waitForFunction(() => window.BMAccount.user() && window.BMAccount.user().id === "u2");
      check(await keepOf(t.page) === undefined, "29 another account's sign-in drops keep", await keepOf(t.page));
      await t.context.close();
    }
    /* delete my account clears keep */
    {
      const a = await open({ providers: ["google"] }, { session: LS, stub: { learners: roster() }, local: { "bm.sync.v1": { learner: "L1", acct: "u1", keep: "L1" } } });
      await a.page.click("#lrn-parent");
      await a.page.waitForSelector("#acct-delete");
      await a.page.click("#acct-delete");
      await a.page.click("#acct-delete");
      await a.page.waitForFunction(() => window.__rpc.some((c) => c.name === "delete_my_account"));
      await a.page.waitForTimeout(400);
      check(await keepOf(a.page) === undefined, "29 deleting the account clears keep", await keepOf(a.page));
      await a.context.close();
    }
  }

  /* 30 */
  {
    const r30 = () => [
      { id: "u1", self: true, name: null, under13: false, consent_v: null, created_at: "2026-10-01T00:00:00Z" },
      { id: "M1", self: false, name: "Te\"en", under13: false, consent_v: null, created_at: "2026-10-02T00:00:00Z" },
      mk("L2", "Sam"),
      { id: "M2", self: false, name: "Ann", under13: false, consent_v: null, created_at: "2026-10-03T00:00:00Z" }
    ];
    const { page, context } = await open_({ learners: r30(), markDelay: 300 }, { width: 360 });
    await page.waitForFunction(() => /Synced at/.test(document.querySelector("[data-account]").textContent));
    const st = () => page.evaluate(() => ({
      btn: !!document.getElementById("lrn-u13-M1"), tag: !!document.querySelector("#lrn-n-M1 + .learner-tagline .learner-tag"),
      btn2: !!document.getElementById("lrn-u13-L2"), tag2: !!document.querySelector("#lrn-n-L2 + .learner-tagline .learner-tag"),
      block: !!document.getElementById("lrn-u13b-M1"), active: document.activeElement.id
    }));
    let s = await st();
    check(s.btn && !s.tag && !s.btn2 && s.tag2, "30 under13 false: button, no tag; under13 true: tag, no button", s);
    check(await page.getAttribute("#lrn-u13-M1", "aria-label") === "Mark Te\"en as under 13" && await text(page, "#lrn-n-L2 + .learner-tagline .learner-tag") === "Under 13", "30 the button is named, the tag says Under 13");
    await page.click("#lrn-u13-M1");
    check(/What is kept about this learner/.test(await text(page, "#lrn-u13b-M1")) && /never sold or shared/.test(await text(page, "#lrn-u13b-M1")) && await page.getAttribute("#lrn-u13c-M1", "type") === "checkbox", "30 pressing opens the consent block");
    check(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, "30 no horizontal scroll at 360px with the block open");
    await page.click("#lrn-u13s-M1");
    check(/Tick the box to confirm you are this learner's parent or guardian\./.test(await text(page, "[data-note-l]") || await text(page, ".learners .form-note") || "") && (await calls(page, "learner_mark_under13")).length === 0, "30 Confirm unticked refuses and sends nothing", await text(page, ".learners .form-note"));
    await page.click("#lrn-u13x-M1");
    s = await st();
    check(!s.block && s.active === "lrn-u13-M1", "30 Cancel closes the block, focus on the button", s);
    await page.click("#lrn-u13-M1");
    await page.keyboard.press("Escape");
    s = await st();
    check(!s.block && s.active === "lrn-u13-M1", "30 Escape closes the block, focus on the button", s);
    await page.click("#lrn-u13-M1");
    check(await page.evaluate(() => document.activeElement.id) === "lrn-u13c-M1", "30 opening the block puts the focus on the checkbox");
    await page.check("#lrn-u13c-M1");
    await page.focus("#lrn-u13s-M1");
    await page.evaluate(() => { document.getElementById("lrn-u13c-M1").__old = true; window.BMAccount.syncNow(); });
    await page.waitForFunction(() => { const c = document.getElementById("lrn-u13c-M1"); return c && !c.__old; }, null, { timeout: 8000 });
    check(await page.evaluate(() => !!document.getElementById("lrn-u13b-M1") && document.getElementById("lrn-u13c-M1").checked), "30 a redraw keeps the block open and the box ticked");
    await page.evaluate(() => { const b = document.getElementById("lrn-u13s-M1"); b.click(); b.disabled = false; b.click(); });
    await page.waitForFunction(() => !document.getElementById("lrn-u13b-M1"));
    const c = await calls(page, "learner_mark_under13");
    check(c.length === 1 && c[0].args.id === "M1" && c[0].args.consent_v === 1, "30 ticked Confirm sends learner_mark_under13 with consent_v 1, once for a double press", c);
    await page.waitForTimeout(300);
    s = await st();
    check(!s.btn && s.tag && s.active === "lrn-n-M1", "30 the row shows the tag and no button, focus on the name", s);
    check(/Te\"en is now marked as under 13\./.test(await text(page, ".learners .form-note")), "30 the note names the learner", await text(page, ".learners .form-note"));
    await context.close();
    {
      const d = await open_({ learners: r30(), markDelay: 600 });
      await d.page.click("#lrn-u13-M1");
      await d.page.check("#lrn-u13c-M1");
      await d.page.click("#lrn-u13s-M1");
      await d.page.click("#lrn-u13-M2");
      await d.page.check("#lrn-u13c-M2");
      await d.page.waitForFunction(() => document.querySelector("#lrn-n-M1 + .learner-tagline .learner-tag"), null, { timeout: 8000 });
      await d.page.waitForTimeout(300);
      const k = await d.page.evaluate(() => ({ open: !!document.getElementById("lrn-u13b-M2"), ticked: !!(document.getElementById("lrn-u13c-M2") || {}).checked, active: document.activeElement.id }));
      check(k.open && k.ticked && k.active !== "lrn-n-M1", "30 a late reply for one row leaves another row's open, ticked block and the focus alone", k);
      await d.context.close();
    }
    const f = await open_({ learners: r30(), markRefused: true });
    await f.page.click("#lrn-u13-M1");
    await f.page.check("#lrn-u13c-M1");
    await f.page.click("#lrn-u13s-M1");
    await f.page.waitForFunction(() => /out of date/.test(document.body.textContent));
    check(await f.page.evaluate(() => !!document.getElementById("lrn-u13-M1") || !!document.getElementById("lrn-u13b-M1")) && await f.page.evaluate(() => !document.querySelector("#lrn-n-M1 + .learner-tagline .learner-tag")), "30 a refused call shows the out-of-date message (PA-11) and leaves the row unchanged");
    await f.context.close();
  }

  /* 31 */
  {
    const r31 = () => [
      { id: "u1", self: true, name: null, under13: false, consent_v: null, created_at: "2026-10-01T00:00:00Z" },
      { id: "S1", self: false, name: "Old", under13: true, consent_v: 0, created_at: "2026-10-02T00:00:00Z" },
      mk("F1", "Fresh")
    ];
    const { page, context } = await open_({ learners: r31() });
    await page.waitForFunction(() => /Synced at/.test(document.querySelector("[data-account]").textContent));
    await page.evaluate(() => { const f = window.BMAccount.switchLearner; window.__sw = 0; window.BMAccount.switchLearner = function () { window.__sw++; return f.apply(this, arguments); }; });
    const st = () => page.evaluate(() => ({
      tags: Array.from(document.querySelectorAll("#lrn-n-S1 + .learner-tagline .learner-tag")).map((e) => e.textContent),
      btn: (document.getElementById("lrn-u13-S1") || {}).textContent, label: (document.getElementById("lrn-u13-S1") || { getAttribute() {} }).getAttribute("aria-label"),
      dis: document.getElementById("lrn-sw-S1").disabled, aria: document.getElementById("lrn-sw-S1").getAttribute("aria-disabled"), title: document.getElementById("lrn-sw-S1").title,
      ftags: document.querySelectorAll("#lrn-n-F1 + .learner-tagline .learner-tag").length, fbtn: !!document.getElementById("lrn-u13-F1"),
      fdis: document.getElementById("lrn-sw-F1").disabled
    }));
    let s = await st();
    check(s.tags.join("|") === "Under 13|Consent to confirm" && s.btn === "Confirm consent" && s.label === "Confirm consent for Old", "31 a stale row shows both tags and the Confirm consent button", s);
    check(!s.dis && s.aria === "true" && s.title === "Confirm consent first", "31 the stale row's Switch to is aria-disabled with a title, and not disabled (PA-11)", s);
    check(s.ftags === 1 && !s.fbtn && !s.fdis, "31 a current row shows neither the stale tag nor the button, and can be switched to", s);
    await page.focus("#lrn-sw-S1"); await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    check(await page.evaluate(() => window.__sw) === 0 && /Confirm the consent statement for Old first\./.test(await text(page, ".learners .form-note")), "31 a switch is refused with the note and no switchLearner call", await text(page, ".learners .form-note"));
    await page.click("#lrn-u13-S1");
    await page.check("#lrn-u13c-S1");
    await page.click("#lrn-u13s-S1");
    await page.waitForFunction(() => !document.querySelector("#lrn-n-S1 + .learner-tagline .learner-tag-stale"));
    const c = await page.evaluate(() => window.__rpc.filter((x) => x.name === "learner_mark_under13"));
    s = await st();
    check(c.length === 1 && c[0].args.id === "S1" && c[0].args.consent_v === 1, "31 Confirm sends learner_mark_under13 with consent_v 1", c);
    check(s.tags.join("|") === "Under 13" && !s.btn && !s.dis && s.aria === null, "31 the row loses the stale tag and Switch to is enabled", s);
    check(/Old's consent is confirmed\./.test(await text(page, ".learners .form-note")), "31 the note names the learner", await text(page, ".learners .form-note"));
    await context.close();
  }

  /* 32 (PA-11) */
  {
    const r32 = () => [
      { id: "u1", self: true, name: null, under13: false, consent_v: null, created_at: "2026-10-01T00:00:00Z" },
      { id: "S1", self: false, name: "Old", under13: true, consent_v: 0, created_at: "2026-10-02T00:00:00Z" },
      mk("F1", "Fresh")
    ];
    const NOTE = "Old's consent statement has changed. Confirm it to keep playing as them.";
    const tags = (page) => page.evaluate(() => Array.from(document.querySelectorAll("#lrn-n-S1 + .learner-tagline .learner-tag")).map((e) => e.textContent).join("|"));
    /* (a) the active learner is stale: they stay the active one, both tags and Confirm show */
    {
      const { page, context } = await open_({ learners: r32() }, { local: { "bm.sync.v1": { learner: "S1", acct: "u1", learnerName: "Old" } } });
      await page.waitForSelector("#lrn-u13-S1");
      check(await page.evaluate(() => { const li = document.getElementById("lrn-n-S1").closest("li"); return li.getAttribute("aria-current") === "true" && /Playing as/.test(li.textContent) && !document.getElementById("lrn-sw-S1"); }) && await tags(page) === "Under 13|Consent to confirm" && await text(page, "#lrn-u13-S1") === "Confirm consent", "32a the active stale learner stays Playing as, with both tags and Confirm consent");
      check(await text(page, "[data-stale-note]") === NOTE, "32a the panel carries the changed-statement note", await text(page, "[data-stale-note]"));
      await page.click("#lrn-u13-S1");
      await page.check("#lrn-u13c-S1");
      await page.click("#lrn-u13s-S1");
      await page.waitForFunction(() => !document.querySelector(".learner-tag-stale"));
      const c = await calls(page, "learner_mark_under13");
      check(c.length === 1 && c[0].args.id === "S1" && c[0].args.consent_v === 1, "32a Confirm sends consent_v 1", c);
      check(await tags(page) === "Under 13" && !(await page.evaluate(() => !!document.querySelector("[data-stale-note]"))) && /Old's consent is confirmed\./.test(await text(page, ".learners .form-note")), "32a the tags, the note and the stale line update", await text(page, ".learners"));
      await context.close();
    }
    /* (b) a refused Confirm for a number this page sent: the page is old */
    {
      const { page, context } = await open_({ learners: r32(), markRefused: true }, { local: { "bm.sync.v1": { learner: "F1", acct: "u1", learnerName: "Fresh" } } });
      await page.waitForSelector("#lrn-u13-S1");
      await page.click("#lrn-u13-S1");
      await page.check("#lrn-u13c-S1");
      await page.click("#lrn-u13s-S1");
      await page.waitForFunction(() => /out of date/.test(document.body.textContent));
      check(await text(page, ".learners .form-note") === "The consent statement on this page is out of date. Reload the page and try again." && !/consent required/.test(await text(page, ".learners")), "32b a refused Confirm says the page is out of date, not the server's text", await text(page, ".learners .form-note"));
      check(await tags(page) === "Under 13|Consent to confirm" && await page.getAttribute("#lrn-sw-S1", "aria-disabled") === "true", "32b the row stays stale and Switch to stays refused");
      await context.close();
    }
    /* (c) the kept view with a stale learner draws the full panel; Confirm then collapses it on the same draw */
    {
      const { page, context } = await open_({ learners: r32() }, { local: { "bm.sync.v1": { learner: "S1", acct: "u1", keep: "S1", learnerName: "Old" } } });
      await page.waitForSelector("#lrn-u13-S1", { timeout: 8000 });
      check(await page.evaluate(() => !document.querySelector("[data-kept]") && !document.getElementById("lrn-parent") && !!document.getElementById("lrn-add")) && await text(page, "[data-stale-note]") === NOTE, "32c a kept stale learner gets the full panel with the note, not the collapsed line", await text(page, ".learners"));
      check((await calls(page, "learner_list")).length === 1 && await page.evaluate(() => JSON.parse(localStorage.getItem("bm.sync.v1")).keep) === "S1", "32c one list read, the keep stays");
      await page.click("#lrn-u13-S1");
      await page.check("#lrn-u13c-S1");
      await page.click("#lrn-u13s-S1");
      await page.waitForSelector("[data-kept]");
      check(await page.evaluate(() => !document.getElementById("lrn-add") && !!document.getElementById("lrn-parent") && /Playing as Old/.test(document.querySelector("[data-kept]").textContent) && /Old's consent is confirmed\./.test(document.querySelector("[data-note-l]").textContent)), "32c after Confirm the same draw is the collapsed line, with the confirmation note", await text(page, ".learners"));
      await context.close();
    }
    /* (d) the stale row's Switch to is reachable by keyboard and refuses with the note */
    {
      const { page, context } = await open_({ learners: r32() }, { local: { "bm.sync.v1": { learner: "F1", acct: "u1", learnerName: "Fresh" } } });
      await page.waitForSelector("#lrn-sw-S1");
      await page.evaluate(() => { const f = window.BMAccount.switchLearner; window.__sw = 0; window.BMAccount.switchLearner = function () { window.__sw++; return f.apply(this, arguments); }; });
      await page.focus("#lrn-sw-S1");
      check(await page.evaluate(() => document.activeElement.id === "lrn-sw-S1" && !document.activeElement.disabled), "32d the stale row's Switch to takes focus (not disabled)");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
      check(await page.evaluate(() => window.__sw) === 0 && /Confirm the consent statement for Old first\./.test(await text(page, ".learners .form-note")), "32d Enter shows the refusal note and calls no switchLearner", await text(page, ".learners .form-note"));
      await context.close();
    }
  }


  /* 33-45. the connector's consent view (CN-9) */
  {
    const ORIGIN = new URL(server.url).origin;
    check(!/^(8080|80)$/.test(new URL(server.url).port), "33 the test server is not on a port the loopback cases stand in for", server.url);
    const CLAUDE = "https://claude.ai/api/mcp/auth_callback", CH = "AbCd1234-_".repeat(4) + "xyz";
    check(CH.length === 43, "33 the test challenge is 43 characters");
    /* a request's query: `over` changes a parameter (null removes it, an array repeats it) */
    const query = (over) => {
      const base = { response_type: "code", client_id: "c_12345678", redirect_uri: CLAUDE, code_challenge: CH, code_challenge_method: "S256", state: "zq9state" };
      const o = Object.assign({}, base, over || {});
      const p = new URLSearchParams();
      Object.keys(o).forEach((k) => { if (o[k] === null) return; [].concat(o[k]).forEach((v) => p.append(k, v)); });
      return "?" + p.toString();
    };
    const REQ = query();
    const PREVIEW = { providers: ["google"], connect: "preview" };
    const until = async (fn, what, ms) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (ms || 8000)) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 50)); }
      check(false, what + " (timed out)");
      return false;
    };
    const stored = (page) => page.evaluate(() => sessionStorage.getItem("bm.connect.v1"));
    /* the page left for an app: come back to the account page, whose sessionStorage is the same tab's, and read it */
    const comeBack = async (page) => { await page.goto(server.url + "account.html"); await page.waitForFunction(() => window.BMAccount); return stored(page); };
    const hex64 = "ab".repeat(32);
    const withState = (extra) => Object.assign({ session: LS, stub: { learners: roster() }, callbacks: true }, extra || {});
    const waitPanel = (page) => page.waitForSelector("[data-connect]");
    const settle = (page) => page.waitForFunction(() => /Synced at/.test(document.querySelector("[data-account]").textContent));
    const approveCalls = (log) => log.filter((c) => c.name === "connect_approve");
    const callbackTo = (base, fields) => base + "?" + new URLSearchParams(fields).toString();

    /* 33. off: the page is what it was */
    {
      for (const signed of [false, true]) {
        const r = await open({ providers: ["google"] }, withState(signed ? { tail: REQ } : { tail: REQ, session: null }));
        await r.page.waitForTimeout(300);
        const seen = await r.page.evaluate(() => ({ search: location.search, kept: sessionStorage.getItem("bm.connect.v1"), text: document.querySelector("[data-account]").textContent, pending: !!document.querySelector("[data-connect-pending], [data-connect], [data-connect-note], [data-connect-refused]"), form: !!document.getElementById("acct-in"), hrefAtCreate: window.__hrefAtCreate }));
        check(seen.kept === null && seen.search === REQ && !seen.pending && !/onnect (Claude|ChatGPT)|Allow|Don.t allow/.test(seen.text), "33 off: nothing stored, nothing stripped, no connect text" + (signed ? " (signed in)" : ""), { kept: seen.kept, search: seen.search, pending: seen.pending });
        if (!signed) check(seen.form, "33 off: the sign-in form is what case 1 draws");
        check(r.navs.length === 0 && r.outside.length === 0 && approveCalls(r.rpcLog).length === 0, "33 off: nothing is sent anywhere", { navs: r.navs, outside: r.outside });
        await r.context.close();
      }
      /* an unrecognised switch value is off as well */
      const odd = await open({ providers: ["google"], connect: "ON" }, { tail: REQ, callbacks: true });
      check(await stored(odd.page) === null, "33 connect \"ON\" is off");
      await odd.context.close();
    }

    /* 34. preview, signed out */
    {
      const r = await open(PREVIEW, { tail: REQ + "&keep=1#frag", callbacks: true });
      await r.page.waitForFunction(() => window.__hrefAtCreate);
      const seen = await r.page.evaluate(() => ({ at: window.__hrefAtCreate, search: location.search, hash: location.hash, kept: JSON.parse(sessionStorage.getItem("bm.connect.v1") || "null"), pending: (document.querySelector("[data-connect-pending]") || {}).textContent, pendingAbove: !!document.querySelector("[data-connect-pending]") && !!(document.querySelector("[data-connect-pending]").compareDocumentPosition(document.getElementById("acct-email")) & Node.DOCUMENT_POSITION_FOLLOWING) }));
      check(!/response_type|client_id|redirect_uri|code_challenge|state=|resource|scope/.test(new URL(seen.at).search) && new URL(seen.at).search === "?keep=1" && new URL(seen.at).hash === "#frag", "34 the parameters are out of the address before the SDK is made, the rest is kept", seen.at);
      check(seen.search === "?keep=1" && seen.hash === "#frag", "34 … and after", seen);
      check(seen.kept && seen.kept.v === 1 && seen.kept.client_id === "c_12345678" && seen.kept.redirect_uri === CLAUDE && seen.kept.code_challenge === CH && seen.kept.state === "zq9state" && seen.kept.app === "claude" && typeof seen.kept.at === "number" && Date.now() - seen.kept.at < 60000, "34 the request is in sessionStorage", seen.kept);
      check(seen.pending === "Sign in, then you can connect Claude to your progress." && seen.pendingAbove, "34 the page says Claude, above the form", seen.pending);
      check(approveCalls(r.rpcLog).length === 0 && r.navs.length === 0 && r.outside.length === 0, "34 nothing is called or sent");
      await r.context.close();
      for (const [uri, app] of [["https://claude.com/api/mcp/auth_callback", "Claude"], ["https://chatgpt.com/connector_platform_oauth_redirect", "ChatGPT"]]) {
        const o = await open(PREVIEW, { tail: query({ redirect_uri: uri }), callbacks: true });
        check(/connect (Claude|ChatGPT) to/.test(await text(o.page, "[data-connect-pending]")) && (await text(o.page, "[data-connect-pending]")).indexOf(app) > 0, "34 " + uri + " is named " + app, await text(o.page, "[data-connect-pending]"));
        await o.context.close();
      }
    }

    /* 35. signed in: the panel, then Allow */
    {
      /* the marker case first: values in the request never reach the HTML */
      const m = await open(PREVIEW, withState({ tail: query({ state: "<b>zq9marker</b>" }) }));
      await waitPanel(m.page);
      await settle(m.page);
      const html = await m.page.evaluate(() => document.querySelector("[data-account]").innerHTML);
      check(!/zq9|marker|c_12345678|claude\.ai|AbCd1234/.test(html), "35 nothing of the request is in the HTML", html.match(/zq9|marker|c_12345678|claude\.ai|AbCd1234/));
      await m.context.close();

      const r = await open(PREVIEW, withState({ tail: REQ }));
      await waitPanel(r.page);
      await settle(r.page);
      await r.page.waitForTimeout(300);
      const view = await r.page.evaluate(() => {
        const p = document.querySelector("[data-connect]"), ok = document.getElementById("acct-connect-ok"), no = document.getElementById("acct-connect-no");
        return { h: p.querySelector("h2").textContent, text: Array.from(p.querySelectorAll("h2, p")).map((e) => e.textContent.replace(/\s+/g, " ").trim()).join(" "), ok: ok && ok.textContent, no: no && no.textContent, okClass: ok && ok.className, noClass: no && no.className, first: !!document.querySelector("[data-account] > *") && document.querySelector("[data-account] > *") === p };
      });
      check(view.h === "Connect Claude" && view.ok === "Allow" && view.no === "Don't allow" && view.okClass === "btn" && view.noClass === "btn ghost", "35 the panel is headed Connect Claude, with Allow and Don't allow", view);
      check(/^Connect Claude Claude would be able to read which sections and exercises you have worked on, how strong each section is, what is due for review and where you left off\. It gets no name, no email address and nothing about other learners on this account\. It cannot change anything here; an answer checked there does not count until you enter it on the page\. Approve only a connection you started yourself, just now, from Claude\. If you did not, press Don't allow\./.test(view.text), "35 the panel says what is shared, then the warning", view.text);
      check(approveCalls(r.rpcLog).length === 0, "35 connect_approve is not called on load or on draw", approveCalls(r.rpcLog));
      await r.page.click("#acct-connect-ok");
      await until(() => r.navs.length > 0, "35 Allow goes to the callback");
      const calls_ = approveCalls(r.rpcLog);
      check(calls_.length === 1 && JSON.stringify(calls_[0].args) === JSON.stringify({ p_client_id: "c_12345678", p_redirect_uri: CLAUDE, p_challenge: CH }), "35 Allow sends one connect_approve with the raw strings", calls_);
      check(r.navs.length === 1 && r.navs[0] === callbackTo(CLAUDE, { code: hex64, iss: ORIGIN, state: "zq9state" }), "35 the navigation is the callback with code, iss and state", r.navs);
      check(r.navs[0].startsWith(CLAUDE + "?"), "35 … on the raw redirect_uri");
      check(await comeBack(r.page) === null, "35 nothing of the request is left in sessionStorage");
      check(await r.page.evaluate(() => !document.querySelector("[data-connect]")), "35 … and no panel is drawn after");
      await r.context.close();

      /* a held call takes one press */
      const h = await open(PREVIEW, withState({ tail: REQ }));
      await waitPanel(h.page);
      await h.page.evaluate(() => { const b = document.getElementById("acct-connect-ok"); window.__opts.approveCode = "cd".repeat(32); b.click(); b.disabled = false; b.click(); });
      await until(() => h.navs.length > 0, "35 a double press goes on");
      check(approveCalls(h.rpcLog).length === 1, "35 two quick presses send one connect_approve", approveCalls(h.rpcLog).length);
      check(h.navs[0] === callbackTo(CLAUDE, { code: "cd".repeat(32), iss: ORIGIN, state: "zq9state" }), "35 … and the code is the one answered", h.navs);
      await h.context.close();

      /* a reply that is not 64 hex digits is an error, not a redirect */
      const b = await open(PREVIEW, withState({ tail: REQ, stub: { learners: roster(), approveCode: "not-a-code" } }));
      await waitPanel(b.page);
      await b.page.click("#acct-connect-ok");
      await b.page.waitForFunction(() => /Something went wrong/.test((document.querySelector("[data-note-c]") || {}).textContent || ""));
      await b.page.waitForTimeout(200);
      check(b.navs.length === 0 && await stored(b.page) !== null && await b.page.evaluate(() => !document.getElementById("acct-connect-ok").disabled), "35 a reply that is not a code goes nowhere, keeps the request and frees the button");
      await b.context.close();
    }

    /* 36. Don't allow */
    {
      const r = await open(PREVIEW, withState({ tail: REQ }));
      await waitPanel(r.page);
      await r.page.click("#acct-connect-no");
      await until(() => r.navs.length > 0, "36 Don't allow goes to the callback");
      check(r.rpcLog.filter((c) => c.name === "connect_approve").length === 0, "36 no connect_approve");
      check(r.navs.length === 1 && r.navs[0] === callbackTo(CLAUDE, { error: "access_denied", iss: ORIGIN, state: "zq9state" }), "36 the answer is access_denied with iss and state", r.navs);
      check(await comeBack(r.page) === null, "36 nothing of the request is left");
      await r.context.close();
      /* no state given: none sent */
      const n = await open(PREVIEW, withState({ tail: query({ state: null }) }));
      await waitPanel(n.page);
      await n.page.click("#acct-connect-no");
      await until(() => n.navs.length > 0, "36 … also without a state");
      check(n.navs[0] === callbackTo(CLAUDE, { error: "access_denied", iss: ORIGIN }), "36 without a state there is none in the answer", n.navs);
      await n.context.close();
    }

    /* 37. a redirect_uri off the list: nothing stored, nobody told, the address left alone */
    {
      const NEAR = [
        "https://claude.ai.evil.example/api/mcp/auth_callback", "https://claude.ai@evil.example/api/mcp/auth_callback",
        "https://claude.ai/api/mcp/other", "http://claude.ai/api/mcp/auth_callback", CLAUDE + "#frag", CLAUDE + "/", CLAUDE + "?x=1",
        "https://CLAUDE.ai/api/mcp/auth_callback", "http://localhost:0/callback", "http://localhost:65536/callback", "http://localhost:08080/callback",
        "http://localhost/callback", "http://[::1]:8080/callback", "http://localhost:8080/callback?x=1", "https://chatgpt.com/connector/oauth/x", ""
      ];
      const tails = NEAR.map((u) => query({ redirect_uri: u })).concat([query({ redirect_uri: null }), query({ redirect_uri: [CLAUDE, "https://evil.example/x"] }), query({ redirect_uri: "https://evil.example/cb", client_name: "Claude" })]);
      const bad = [];
      for (const tail of tails) {
        const r = await open(PREVIEW, { tail, callbacks: true });
        await r.page.waitForFunction(() => window.__hrefAtCreate);
        const seen = await r.page.evaluate(() => ({ search: location.search, kept: sessionStorage.getItem("bm.connect.v1"), note: (document.querySelector("[data-connect-note]") || {}).textContent, pending: !!document.querySelector("[data-connect-pending]") }));
        if (seen.kept !== null || seen.search !== tail || seen.note !== "This sign-in request came from an address this site does not know, so it was not followed." || seen.pending || r.navs.length || r.outside.length || approveCalls(r.rpcLog).length) bad.push({ tail, seen, navs: r.navs, outside: r.outside });
        await r.context.close();
      }
      check(bad.length === 0, "37 each off-list redirect_uri stores nothing, sends nothing, leaves the address, and says why (" + tails.length + " of them)", bad);
      /* signed in, the same note, and no panel */
      const s = await open(PREVIEW, withState({ tail: query({ redirect_uri: "https://claude.ai.evil.example/api/mcp/auth_callback" }) }));
      await settle(s.page);
      check(await s.page.evaluate(() => !!document.querySelector("[data-connect-note]") && !document.querySelector("[data-connect], [data-connect-refused]")) && s.navs.length === 0, "37 signed in, the note shows and no panel is drawn");
      await s.context.close();
    }

    /* 38. a listed redirect_uri with something else wrong: answered at it */
    {
      const L = "A".repeat(42);
      const cases = [
        ["a 42-character challenge", { code_challenge: L }, "invalid_request", "zq9state"],
        ["a challenge with a bad character", { code_challenge: "A".repeat(42) + "+" }, "invalid_request", "zq9state"],
        ["no challenge method", { code_challenge_method: null }, "invalid_request", "zq9state"],
        ["the plain method", { code_challenge_method: "plain" }, "invalid_request", "zq9state"],
        ["no challenge", { code_challenge: null }, "invalid_request", "zq9state"],
        ["response_type token", { response_type: "token" }, "unsupported_response_type", "zq9state"],
        ["another resource", { resource: "https://other.example/mcp" }, "invalid_target", "zq9state"],
        ["the resource with a path after it", { resource: ORIGIN + "/mcp/" }, "invalid_target", "zq9state"],
        ["a duplicate client_id", { client_id: ["c_12345678", "c_87654321"] }, "invalid_request", "zq9state"],
        ["a short client_id", { client_id: "c_123" }, "invalid_request", "zq9state"],
        ["no client_id", { client_id: null }, "invalid_request", "zq9state"],
        ["a duplicate response_type", { response_type: ["code", "code"] }, "invalid_request", "zq9state"],
        ["a state of 513 characters", { state: "s".repeat(513) }, "invalid_request", null],
        ["a duplicate state", { state: ["a", "b"] }, "invalid_request", null]
      ];
      for (const [what, over, err, state] of cases) {
        const r = await open(PREVIEW, { tail: query(over), callbacks: true, nowait: true });
        await until(() => r.navs.length > 0, "38 " + what + " is answered");
        const u = r.navs[0] ? new URL(r.navs[0]) : null;
        const fields = u ? Object.fromEntries(u.searchParams) : {};
        const want = { error: err, iss: ORIGIN };
        if (state) want.state = state;
        check(u && r.navs[0].startsWith(CLAUDE + "?") && fields.error === err && fields.iss === ORIGIN && (state ? fields.state === state : !("state" in fields)) && !!fields.error_description && fields.error_description.length < 80 && Object.keys(fields).length === Object.keys(want).length + 1,
          "38 " + what + " is answered at the callback with " + err + ", iss" + (state ? " and state" : ""), r.navs);
        check(r.navs.length === 1 && approveCalls(r.rpcLog).length === 0, "38 … once, with no rpc (" + what + ")");
        check(await comeBack(r.page) === null, "38 … and nothing is stored (" + what + ")");
        await r.context.close();
      }
    }

    /* 39. a stale sign-in */
    {
      const r = await open(PREVIEW, withState({ tail: REQ, stub: { learners: roster(), approveError: "stale sign-in" } }));
      await waitPanel(r.page);
      await settle(r.page);
      await r.page.click("#acct-connect-ok");
      await r.page.waitForSelector("#acct-stepin");
      const seen = await r.page.evaluate(() => ({
        note: document.querySelector("[data-note-c]").textContent, forms: document.querySelectorAll("#acct-stepin").length, passes: document.querySelectorAll("#acct-pass").length,
        under: !!(document.querySelector("[data-connect]").compareDocumentPosition(document.getElementById("acct-stepin")) & Node.DOCUMENT_POSITION_FOLLOWING),
        prev: document.getElementById("acct-stepin").closest("form").previousElementSibling === document.querySelector("[data-connect]"), email: document.getElementById("acct-email").value
      }));
      check(seen.note === "To confirm it is you, sign in again, then press Allow again." && seen.forms === 1 && seen.passes === 1 && seen.under && seen.prev && seen.email === "parent@example.com", "39 the step-up is one form, right under the panel, and the note names Allow", seen);
      check(approveCalls(r.rpcLog).length === 1 && r.navs.length === 0 && await stored(r.page) !== null, "39 one call so far, no navigation, the request is kept");
      await r.page.evaluate(() => { window.__opts.signInOk = true; window.__opts.approveError = null; });
      await r.page.fill("#acct-pass", "right-password");
      await r.page.keyboard.press("Enter");
      await r.page.waitForFunction(() => !document.getElementById("acct-stepin"));
      check(await text(r.page, "[data-note-c]") === "Signed in again. Now press Allow again." && await r.page.evaluate(() => document.activeElement.id) === "acct-connect-ok", "39 a right password says to press Allow again, with the focus on it", await text(r.page, "[data-note-c]"));
      check(await stored(r.page) !== null && approveCalls(r.rpcLog).length === 1, "39 the request is still stored and nothing was called by signing in");
      await r.page.keyboard.press("Enter");
      await until(() => r.navs.length > 0, "39 Allow goes on after signing in again");
      check(approveCalls(r.rpcLog).length === 2 && r.navs[0] === callbackTo(CLAUDE, { code: hex64, iss: ORIGIN, state: "zq9state" }), "39 Allow calls once more and navigates", { n: approveCalls(r.rpcLog).length, navs: r.navs });
      await r.context.close();
      /* with the Learners panel off the same single form */
      const o = await open(Object.assign({ learners: "off" }, PREVIEW), withState({ tail: REQ, stub: { learners: roster(), approveError: "stale sign-in" } }));
      await waitPanel(o.page);
      await o.page.click("#acct-connect-ok");
      await o.page.waitForSelector("#acct-stepin");
      check(await o.page.evaluate(() => document.querySelectorAll("#acct-stepin").length) === 1, "39 learners off: still one step-up form");
      await o.context.close();
    }

    /* 40. a managed learner, or a kept device: no Allow */
    {
      const meta = { learner: "L1", acct: "u1", learnerName: "Kim <i>" };
      const r = await open(PREVIEW, withState({ tail: REQ, local: { "bm.sync.v1": meta } }));
      await r.page.waitForSelector("[data-connect-refused]");
      await r.page.waitForSelector("#lrn-sw-self");
      const seen = await r.page.evaluate(() => ({ text: document.querySelector("[data-connect-refused]").textContent.replace(/\s+/g, " "), ok: !!document.getElementById("acct-connect-ok"), no: !!document.getElementById("acct-connect-no"), i: document.querySelectorAll("[data-connect-refused] i").length, panel: !!document.querySelector("[data-connect]") }));
      check(/Connect Claude/.test(seen.text) && /would share this account's own progress, not Kim <i>'s/.test(seen.text) && /Switch to your own progress first/.test(seen.text) && !seen.ok && !seen.no && !seen.i && !seen.panel, "40 playing as a learner: the panel names them (escaped), asks to switch, has no Allow", seen);
      await settle(r.page);
      await r.page.click("#lrn-sw-self");
      await waitPanel(r.page);
      check(await r.page.evaluate(() => !!document.getElementById("acct-connect-ok") && !document.querySelector("[data-connect-refused]")) && approveCalls(r.rpcLog).length === 0, "40 switching to the own progress shows Allow, and nothing was called");
      await r.page.click("#acct-connect-ok");
      await until(() => r.navs.length > 0, "40 Allow works after the switch");
      check(approveCalls(r.rpcLog).length === 1 && r.rpcLog.filter((c) => c.name === "connect_approve")[0].args.p_client_id === "c_12345678", "40 … with one call");
      await r.context.close();

      const k = await open(PREVIEW, withState({ tail: REQ, local: { "bm.sync.v1": Object.assign({ keep: "L1" }, meta) } }));
      await k.page.waitForSelector("[data-connect-refused]");
      await k.page.waitForSelector("#lrn-parent");
      check(await k.page.evaluate(() => !document.getElementById("acct-connect-ok") && !!document.querySelector("[data-kept]")) && /not Kim <i>'s/.test(await text(k.page, "[data-connect-refused]")), "40 a kept device: the same refusal, no Allow");
      await k.page.click("#lrn-parent");
      await k.page.waitForSelector("#lrn-sw-self");
      check(await k.page.evaluate(() => !document.getElementById("acct-connect-ok") && !!document.querySelector("[data-connect-refused]")), "40 \"I'm the parent\" alone does not bring Allow back");
      await settle(k.page);
      await k.page.click("#lrn-sw-self");
      await waitPanel(k.page);
      check(await k.page.evaluate(() => !!document.getElementById("acct-connect-ok")), "40 switching shows Allow");
      await k.context.close();

      const o = await open(Object.assign({ learners: "off" }, PREVIEW), withState({ tail: REQ, local: { "bm.sync.v1": meta } }));
      await o.page.waitForSelector("[data-connect-refused]");
      await settle(o.page);
      check(/The button is in Your account/.test(await text(o.page, "[data-connect-refused]")) && await o.page.evaluate(() => !document.getElementById("acct-connect-ok")), "40 learners off: the refusal points at the Switch button");
      await o.page.click("#acct-own");
      await waitPanel(o.page);
      check(await o.page.evaluate(() => !!document.getElementById("acct-connect-ok")), "40 learners off: Switch to your own progress brings Allow");
      await o.context.close();
    }

    /* 41. age and sign-out */
    {
      const rec = (age) => JSON.stringify({ v: 1, client_id: "c_12345678", redirect_uri: CLAUDE, code_challenge: CH, state: "zq9state", resource: null, app: "claude", at: Date.now() - age });
      const old = await open(PREVIEW, withState({ sess: { "bm.connect.v1": rec(11 * 60000) } }));
      await settle(old.page);
      check(await old.page.evaluate(() => !document.querySelector("[data-connect]") && !document.querySelector("[data-connect-refused]")) && await stored(old.page) === null, "41 a request 11 minutes old is removed and no panel shows");
      await old.context.close();
      const oldOut = await open(PREVIEW, { sess: { "bm.connect.v1": rec(11 * 60000) }, callbacks: true });
      check(await oldOut.page.evaluate(() => !document.querySelector("[data-connect-pending]")) && await stored(oldOut.page) === null, "41 signed out, an old request is removed and not mentioned");
      await oldOut.context.close();
      const fresh = await open(PREVIEW, withState({ sess: { "bm.connect.v1": rec(9 * 60000) } }));
      await waitPanel(fresh.page);
      check(await stored(fresh.page) !== null, "41 a request 9 minutes old still shows");
      await fresh.page.click("#acct-out");
      await fresh.page.waitForSelector("#acct-in");
      await fresh.page.waitForTimeout(200);
      check(await stored(fresh.page) === null && await fresh.page.evaluate(() => !document.querySelector("[data-connect-pending]")), "41 sign-out removes a live request", await stored(fresh.page));
      await fresh.context.close();
      /* planted junk is dropped */
      for (const junk of ["not json", JSON.stringify({ v: 1, client_id: "x", redirect_uri: "https://evil.example/cb", code_challenge: CH, state: null, app: "claude", at: Date.now() }), JSON.stringify({ v: 1, client_id: "c_12345678", redirect_uri: "https://evil.example/cb", code_challenge: CH, state: null, app: "claude", at: Date.now() })]) {
        const j = await open(PREVIEW, withState({ sess: { "bm.connect.v1": junk } }));
        await settle(j.page);
        check(await j.page.evaluate(() => !document.querySelector("[data-connect]")) && await stored(j.page) === null, "41 a damaged or planted request is dropped", junk);
        await j.context.close();
      }
    }

    /* 42. the server's refusals */
    {
      const rows = [
        ["too many approvals", "This account has approved as many connections as it can today. Try again tomorrow.", "[data-note-c]", true],
        ["too many connections", "This account already has five connections. Remove one under Connect your AI below, then press Allow again.", "[data-note-c]", true],
        ["not signed in", "Sign in, then press Allow again.", "[data-note-c]", true],
        ["Server broke", "Server broke", "[data-note-c]", true],
        ["bad request", "This request is not valid any more. Start the connection again from Claude.", "[data-connect-note]", false]
      ];
      for (const [err, say, slot, keeps] of rows) {
        const r = await open(PREVIEW, withState({ tail: REQ, stub: { learners: roster(), approveError: err } }));
        await waitPanel(r.page);
        await r.page.click("#acct-connect-ok");
        await r.page.waitForFunction(([s, t]) => ((document.querySelector(s) || {}).textContent || "") === t, [slot, say]);
        await r.page.waitForTimeout(200);
        const left = await stored(r.page);
        check((left !== null) === keeps && r.navs.length === 0 && approveCalls(r.rpcLog).length === 1, "42 " + err + ": its sentence, " + (keeps ? "the request kept" : "the request cleared") + ", no navigation", { say: await text(r.page, slot), left, navs: r.navs });
        if (keeps) check(await r.page.evaluate(() => { const b = document.getElementById("acct-connect-ok"); return !!b && !b.disabled && !b.hasAttribute("aria-busy") && document.activeElement === b; }), "42 " + err + ": Allow is free again and has the focus");
        else check(await r.page.evaluate(() => !document.querySelector("[data-connect]")), "42 " + err + ": the panel is gone");
        await r.context.close();
      }
    }

    /* 43. a loopback callback */
    {
      for (const cb of ["http://localhost:8080/callback", "http://127.0.0.1:80/callback"]) {
        const pre = await open(PREVIEW, { tail: query({ redirect_uri: cb }), callbacks: true });
        check(await text(pre.page, "[data-connect-pending]") === "Sign in, then you can connect an app on this computer to your progress.", "43 " + cb + " is named in the pending line", await text(pre.page, "[data-connect-pending]"));
        await pre.context.close();
        const r = await open(PREVIEW, withState({ tail: query({ redirect_uri: cb }) }));
        await waitPanel(r.page);
        const seen = await r.page.evaluate(() => ({ h: document.querySelector("[data-connect] h2").textContent, text: document.querySelector("[data-connect]").textContent.replace(/\s+/g, " "), html: document.querySelector("[data-account]").innerHTML }));
        check(seen.h === "Connect an app on this computer" && /An app on this computer asked for this\. Approve it only if you just started connecting from an app you trust on this machine; any program here could ask\./.test(seen.text) && !/Approve only a connection you started yourself/.test(seen.text) && !/localhost|127\.0\.0\.1/.test(seen.html), "43 the loopback view names no host and carries its own warning", seen.text);
        await r.page.click("#acct-connect-ok");
        await until(() => r.navs.length > 0, "43 Allow goes to " + cb);
        /* the browser asks for http://127.0.0.1:80/... as http://127.0.0.1/...; the call is where the raw string shows */
        check(r.navs[0] === callbackTo(cb.replace(":80/", "/"), { code: hex64, iss: ORIGIN, state: "zq9state" }) && approveCalls(r.rpcLog)[0].args.p_redirect_uri === cb, "43 the raw string is kept, in the call and in the navigation", { navs: r.navs, call: approveCalls(r.rpcLog) });
        await r.context.close();
      }
    }

    /* 44. a resource that is this site's connector */
    {
      const r = await open(PREVIEW, withState({ tail: query({ resource: ORIGIN + "/mcp" }) }));
      await waitPanel(r.page);
      const seen = await r.page.evaluate(() => ({ search: location.search, html: document.querySelector("[data-account]").innerHTML }));
      check(seen.search === "" && !/mcp|resource/.test(seen.html), "44 the resource is accepted, taken out of the address and not drawn", seen.search);
      await r.page.click("#acct-connect-ok");
      await until(() => r.navs.length > 0, "44 Allow goes on");
      check(!/resource|%2Fmcp/.test(r.navs[0]) && r.navs[0] === callbackTo(CLAUDE, { code: hex64, iss: ORIGIN, state: "zq9state" }) && !/resource|%2Fmcp|\/mcp"/.test(JSON.stringify(approveCalls(r.rpcLog))), "44 the resource is not echoed in the call or the answer", r.navs);
      await r.context.close();
    }

    /* 45. 360px */
    {
      const r = await open(PREVIEW, withState({ tail: REQ, width: 360 }));
      await waitPanel(r.page);
      const over = await r.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(over <= 0, "45 the account page with the panel does not overflow 360px", over);
      await r.page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
      const reached = [];
      for (let i = 0; i < 12; i++) {
        await r.page.keyboard.press("Tab");
        const id = await r.page.evaluate(() => document.activeElement.id);
        if (id) reached.push(id);
      }
      check(reached.includes("acct-connect-ok") && reached.includes("acct-connect-no") && reached.indexOf("acct-connect-ok") < reached.indexOf("acct-connect-no"), "45 Allow and Don't allow are reached by Tab, in that order", reached);
      check(await r.page.evaluate(() => { const a = document.getElementById("acct-connect-ok").getBoundingClientRect(), b = document.getElementById("acct-connect-no").getBoundingClientRect(); return a.right <= 360 && b.right <= 360 && a.width >= 44 && b.width >= 44; }), "45 both buttons are inside the screen and wide enough to press");
      /* the step-up under the panel fits as well */
      await r.context.close();
      const s = await open(PREVIEW, withState({ tail: REQ, width: 360, stub: { learners: roster(), approveError: "stale sign-in" } }));
      await waitPanel(s.page);
      await s.page.click("#acct-connect-ok");
      await s.page.waitForSelector("#acct-stepin");
      check(await s.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, "45 … nor with the step-up form open");
      await s.context.close();
    }

    /* 46-53. the Connect your AI panel (CN-10) */
    const ON = { providers: ["google"], connect: "on" };
    const U1 = "3b6d7b3e-1b36-4c8e-9a2a-1c2d3e4f5a6b", U2 = "4c7e8c4f-2c47-4d9f-8b3b-2d3e4f5a6b7c", U3 = "5d8f9d50-3d58-4eaf-9c4c-3e4f5a6b7c8d";
    const row = (id, app, last) => ({ id, app, created_at: "2026-11-01T10:00:00Z", last_used: last === undefined ? "2026-11-05T10:00:00Z" : last });
    const withRows = (rows, extra) => withState(Object.assign({ stub: Object.assign({ learners: roster(), connections: rows }, (extra && extra.stub) || {}) }, extra && extra.top));
    const listCalls = (log) => log.filter((c) => c.name === "connect_list");
    const revokeCalls = (log) => log.filter((c) => c.name === "connect_revoke");
    const waitRows = (page) => page.waitForSelector("[data-connections] .cnx-list, [data-connections] [data-cnx-none]");
    const rec = (over) => JSON.stringify(Object.assign({ v: 1, client_id: "c_12345678", redirect_uri: CLAUDE, code_challenge: CH, state: "zq9state", resource: null, app: "claude", at: Date.now() }, over || {}));

    /* 46. on: the address, the steps, the rows */
    {
      const r = await open(ON, withRows([row(U1, "claude"), row(U2, "local", null), row(U3, "<b>x</b>"), { id: "bad", app: "claude", created_at: "2026-11-01T10:00:00Z", last_used: null }]));
      await waitRows(r.page);
      const seen = await r.page.evaluate(() => {
        const p = document.querySelector("[data-connections]");
        return {
          h: p.querySelector("h2").textContent, url: (p.querySelector("[data-connect-url]") || {}).textContent, origin: location.origin,
          steps: Array.from(p.querySelectorAll(".cnx-steps li")).map((l) => l.textContent), code: (p.querySelectorAll(".cnx-steps code")[0] || {}).textContent,
          names: Array.from(p.querySelectorAll(".cnx-row .cnx-name")).map((e) => e.textContent),
          whens: Array.from(p.querySelectorAll(".cnx-row .fine")).map((e) => e.textContent),
          ids: Array.from(p.querySelectorAll(".cnx-row")).map((e) => e.getAttribute("data-cnx")),
          html: p.innerHTML, after: !!(document.querySelector(".panel h2").compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING),
          beforeLearners: !!(p.compareDocumentPosition(document.querySelector(".learners")) & Node.DOCUMENT_POSITION_FOLLOWING)
        };
      });
      check(seen.h === "Connect your AI" && seen.url === seen.origin + "/mcp" && seen.after && seen.beforeLearners, "46 the panel is headed, has the address, and sits before Learners", seen);
      check(seen.steps.length === 2 && seen.steps[0] === "Claude: on claude.ai, add this address as a custom connector in the connector settings, then sign in here when it asks." && /^Claude Code: run claude mcp add --transport http groundup /.test(seen.steps[1]) && seen.code === "claude mcp add --transport http groundup " + seen.origin + "/mcp", "46 two steps: Claude, Claude Code", seen.steps);
      check(seen.html.indexOf("ChatGPT") < 0 && !/Settings, Connectors/.test(seen.html), "46 the offer does not name ChatGPT or an app menu path", seen.html);
      check(JSON.stringify(seen.names) === JSON.stringify(["Claude", "An app on this computer", "An app"]), "46 the rows are named from the table; an unknown app is An app", seen.names);
      check(/^Connected .+ · last used .+/.test(seen.whens[0]) && /^Connected .+ · not used yet$/.test(seen.whens[1]), "46 the dates read, an unused one says not used yet", seen.whens);
      check(!seen.html.includes("<b>x</b>") && seen.ids.join() === [U1, U2, U3].join(), "46 a server string is escaped and a row with a bad id is not drawn", seen.ids);
      await r.page.click("#acct-save");
      await r.page.click("#acct-sync");
      await r.page.waitForTimeout(300);
      await r.page.click("#acct-save");
      check(listCalls(r.rpcLog).length === 1, "46 connect_list is read once across several draws", listCalls(r.rpcLog).length);
      await r.context.close();
    }

    /* 47. preview, absent, learner */
    {
      const e = await open(PREVIEW, withRows([]));
      await settle(e.page);
      await e.page.waitForTimeout(200);
      check(await e.page.evaluate(() => !document.querySelector("[data-connections]")) && listCalls(e.rpcLog).length === 1, "47 preview with no connection draws no panel (one read)", listCalls(e.rpcLog).length);
      await e.context.close();
      const p = await open(PREVIEW, withRows([row(U1, "chatgpt")]));
      await waitRows(p.page);
      check(await p.page.evaluate(() => !!document.querySelector("[data-connections] .cnx-list") && !document.querySelector("[data-connect-url], .cnx-steps")) && listCalls(p.rpcLog).length === 1 && await text(p.page, ".cnx-name") === "ChatGPT", "47 preview with a connection lists it, with no address or steps", listCalls(p.rpcLog).length);
      await p.context.close();
      const a = await open({ providers: ["google"] }, withRows([row(U1, "claude")]));
      await settle(a.page);
      await a.page.waitForTimeout(200);
      check(await a.page.evaluate(() => !document.querySelector("[data-connections]")) && listCalls(a.rpcLog).length === 0, "47 connect absent: no panel and no connect_list", listCalls(a.rpcLog).length);
      await a.context.close();
      const l = await open(ON, withRows([row(U1, "claude")], { top: { local: { "bm.sync.v1": { learner: "L1", acct: "u1" } } } }));
      await l.page.waitForSelector("#lrn-sw-self");
      await settle(l.page);
      check(await l.page.evaluate(() => !document.querySelector("[data-connections]")) && listCalls(l.rpcLog).length === 0, "47 playing as a learner: no panel and no connect_list", listCalls(l.rpcLog).length);
      await l.context.close();
    }

    /* 48. Remove */
    {
      const r = await open(ON, withRows([row(U1, "claude"), row(U2, "chatgpt")], { stub: { revokeDelay: 400 } }));
      await waitRows(r.page);
      await r.page.click("#cnx-rm-" + U1);
      const held = await r.page.evaluate((id) => { const b = document.getElementById("cnx-rm-" + id); const out = { dis: b.disabled, busy: b.getAttribute("aria-busy") }; b.disabled = false; b.click(); return out; }, U1);
      check(held.dis && held.busy === "true", "48 while the call is held the button is disabled and busy", held);
      await r.page.waitForFunction(() => /Removed\./.test((document.querySelector("[data-note-x]") || {}).textContent || ""));
      await r.page.waitForFunction((id) => !document.getElementById("cnx-rm-" + id) && document.querySelector(".cnx-row"), U1);
      check(revokeCalls(r.rpcLog).length === 1 && JSON.stringify(revokeCalls(r.rpcLog)[0].args) === JSON.stringify({ p_id: U1 }), "48 one connect_revoke with the id, even after two presses", revokeCalls(r.rpcLog));
      check(listCalls(r.rpcLog).length === 2 && await text(r.page, "[data-note-x]") === "Removed. Claude can no longer read your progress." && await r.page.evaluate(() => document.activeElement.id) === "cnx-h", "48 the list is re-read, the note says so and the heading has focus", { n: listCalls(r.rpcLog).length, note: await text(r.page, "[data-note-x]") });
      check(await r.page.evaluate((id) => document.querySelectorAll(".cnx-row").length === 1 && !!document.getElementById("cnx-rm-" + id), U2), "48 the other row stays");
      await r.context.close();
      /* preview, the last connection: the panel stays through the re-read (the row still drawn, its button busy) and after it,
         so the note is seen and the heading takes the focus */
      const p = await open(PREVIEW, withRows([row(U1, "claude")], { stub: { revokeDelay: 200, listDelay: 300 } }));
      await waitRows(p.page);
      await p.page.click("#cnx-rm-" + U1);
      await p.page.waitForFunction(() => /Removed\./.test((document.querySelector("[data-note-x]") || {}).textContent || ""));
      const mid = await p.page.evaluate((id) => { const b = document.getElementById("cnx-rm-" + id); return { panel: !!document.querySelector("[data-connections]"), row: !!b, busy: !!b && b.disabled }; }, U1);
      check(mid.panel && mid.row && mid.busy, "48 preview: during the re-read the panel and the row stay, the button busy", mid);
      await p.page.waitForSelector("[data-cnx-none]");
      check(await p.page.evaluate(() => !!document.querySelector("[data-connections]") && /Removed\. Claude/.test(document.querySelector("[data-note-x]").textContent) && document.activeElement.id === "cnx-h") && revokeCalls(p.rpcLog).length === 1, "48 preview: after the last removal the panel stays with the note, focus on the heading", revokeCalls(p.rpcLog).length);
      await p.context.close();
    }

    /* 49. refusals and a list error */
    {
      const a = await open(ON, withRows([row(U1, "claude")], { stub: { revokeError: "not your connection" } }));
      await waitRows(a.page);
      await a.page.click("#cnx-rm-" + U1);
      await a.page.waitForFunction(() => /already removed/.test((document.querySelector("[data-note-x]") || {}).textContent || ""));
      await a.page.waitForSelector("[data-cnx-none]");
      check(await text(a.page, "[data-note-x]") === "That connection was already removed." && listCalls(a.rpcLog).length === 2, "49 not your connection: said so and the list is re-read", await text(a.page, "[data-note-x]"));
      await a.context.close();
      const b = await open(ON, withRows([row(U1, "claude")], { stub: { revokeError: "boom" } }));
      await waitRows(b.page);
      await b.page.click("#cnx-rm-" + U1);
      await b.page.waitForFunction(() => /boom/.test((document.querySelector("[data-note-x]") || {}).textContent || ""));
      const seen = await b.page.evaluate((id) => ({ bad: !!document.querySelector("[data-note-x] .form-note.bad"), row: !!document.getElementById("cnx-rm-" + id), dis: document.getElementById("cnx-rm-" + id).disabled, focus: document.activeElement.id }), U1);
      check(seen.bad && seen.row && !seen.dis && seen.focus === "cnx-rm-" + U1 && await text(b.page, "[data-note-x]") === "boom" && listCalls(b.rpcLog).length === 1, "49 another error: a bad note, the row stays, the button is back and focused", seen);
      await b.context.close();
      const l = await open(ON, withRows([row(U1, "claude")], { stub: { listError: "list broke" } }));
      await l.page.waitForSelector("#cnx-retry");
      check(await l.page.evaluate(() => !!document.querySelector("[data-connections] .form-note.bad")) && /list broke/.test(await text(l.page, "[data-connections] .form-note.bad")), "49 a list error shows a bad note and Try again");
      await l.page.evaluate(() => { window.__opts.listError = null; });
      await l.page.click("#cnx-retry");
      await waitRows(l.page);
      check(listCalls(l.rpcLog).length === 2 && await l.page.evaluate((id) => !!document.getElementById("cnx-rm-" + id), U1), "49 Try again reads once more and then the rows show", listCalls(l.rpcLog).length);
      await l.context.close();
      /* preview: a re-read that fails after a removal still shows its error and Try again (the panel does not vanish), and
         Try again clears the old note */
      const f = await open(PREVIEW, withRows([row(U1, "claude")]));
      await waitRows(f.page);
      await f.page.evaluate(() => { window.__opts.listError = "list broke"; });
      await f.page.click("#cnx-rm-" + U1);
      await f.page.waitForSelector("#cnx-retry");
      check(await f.page.evaluate(() => /list broke/.test(document.querySelector("[data-connections] .form-note.bad").textContent) && /Removed\./.test(document.querySelector("[data-note-x]").textContent)), "49 preview: a failed re-read shows its error in the panel that stays");
      await f.page.evaluate(() => { window.__opts.listError = null; });
      await f.page.click("#cnx-retry");
      await f.page.waitForSelector("[data-cnx-none]");
      check(await text(f.page, "[data-note-x]") === "", "49 Try again clears the old note");
      await f.context.close();
    }

    /* 50. a late reply: account A's held answer lands after a sign-out and a sign-in as B, and draws nothing for B */
    {
      const asB = (page) => page.evaluate(() => { window.__opts.connections = []; window.__opts.listDelay = 0; window.__session = { user: { id: "u2", email: "u2@example.com", app_metadata: { provider: "email", providers: ["email"] } } }; window.__emit("SIGNED_IN", window.__session); });
      const a = await open(ON, withRows([row(U1, "claude")], { stub: { listDelay: 600 } }));
      await a.page.waitForSelector("[data-connections]");
      const before = errors.length;
      await a.page.click("#acct-out");
      await a.page.waitForSelector("#acct-in");
      await asB(a.page);
      await a.page.waitForSelector("[data-cnx-none]");
      await a.page.waitForTimeout(900);
      check(errors.length === before && await a.page.evaluate(() => !!document.querySelector("[data-cnx-none]") && !document.querySelector(".cnx-row")) && listCalls(a.rpcLog).length === 2, "50 A's late connect_list does not draw A's rows for B", { rows: await a.page.evaluate(() => document.querySelectorAll(".cnx-row").length), calls: listCalls(a.rpcLog).length });
      await a.context.close();
      const r = await open(ON, withRows([row(U1, "claude")], { stub: { revokeDelay: 600 } }));
      await waitRows(r.page);
      await r.page.click("#cnx-rm-" + U1);
      await r.page.click("#acct-out");
      await r.page.waitForSelector("#acct-in");
      await asB(r.page);
      await r.page.waitForSelector("[data-cnx-none]");
      await r.page.waitForTimeout(900);
      check(errors.length === before && await text(r.page, "[data-note-x]") === "" && listCalls(r.rpcLog).length === 2, "50 A's late connect_revoke neither notes nor re-reads for B", { note: await text(r.page, "[data-note-x]"), calls: listCalls(r.rpcLog).length });
      await r.context.close();
    }

    /* 51. too many connections */
    {
      const r = await open(PREVIEW, withState({ tail: REQ, stub: { learners: roster(), approveError: "too many connections" } }));
      await waitPanel(r.page);
      await r.page.click("#acct-connect-ok");
      await r.page.waitForFunction(() => /five connections/.test((document.querySelector("[data-note-c]") || {}).textContent || ""));
      const note = await text(r.page, "[data-note-c]");
      check(/Connect your AI below/.test(note) && /press Allow again\.$/.test(note) && await stored(r.page) !== null && r.navs.length === 0, "51 the sentence points at the panel and the request is kept", note);
      await r.context.close();
    }

    /* 52. a repeated parameter; an expired request under a drawn panel */
    {
      const r = await open(PREVIEW, { tail: query({ scope: ["a", "b"] }), callbacks: true, nowait: true });
      await until(() => r.navs.length > 0, "52 a repeated scope is answered");
      const u = r.navs[0] ? new URL(r.navs[0]) : null;
      check(u && r.navs[0].startsWith(CLAUDE + "?") && u.searchParams.get("error") === "invalid_request" && u.searchParams.get("iss") === ORIGIN, "52 scope=a&scope=b is answered invalid_request at the callback", r.navs);
      check(await comeBack(r.page) === null, "52 … and nothing is stored");
      await r.context.close();
      for (const [btn, what] of [["acct-connect-ok", "Allow"], ["acct-connect-no", "Don't allow"]]) {
        const e = await open(PREVIEW, withState({ tail: REQ }));
        await waitPanel(e.page);
        await e.page.evaluate(() => { const k = JSON.parse(sessionStorage.getItem("bm.connect.v1")); k.at = Date.now() - 11 * 60000; sessionStorage.setItem("bm.connect.v1", JSON.stringify(k)); });
        await e.page.click("#" + btn);
        await e.page.waitForSelector("[data-connect-note]");
        await e.page.waitForTimeout(200);
        check(approveCalls(e.rpcLog).length === 0 && e.navs.length === 0 && await stored(e.page) === null && /expired/.test(await text(e.page, "[data-connect-note]")) && await e.page.evaluate(() => !document.querySelector("[data-connect]")), "52 " + what + " on an expired request says so and sends nothing", await text(e.page, "[data-connect-note]"));
        await e.context.close();
      }
    }

    /* 53. session end, sign-in, click-time own check, planted records */
    {
      const r = await open(PREVIEW, withState({ tail: REQ }));
      await waitPanel(r.page);
      await settle(r.page);
      await r.page.evaluate(() => { window.__session = null; window.__emit("SIGNED_OUT", null); });
      await r.page.waitForSelector("#acct-in");
      check(await stored(r.page) === null && await r.page.evaluate(() => !document.querySelector("[data-connect-pending]")), "53 a session that ends elsewhere takes the request", await stored(r.page));
      await r.context.close();

      const n = await open(PREVIEW, { tail: query({ redirect_uri: "https://evil.example/cb" }), callbacks: true, stub: { learners: roster(), signInOk: true } });
      check(/does not know/.test(await text(n.page, "[data-connect-note]")), "53 the bad-address note shows signed out");
      await n.page.fill("#acct-email", "parent@example.com");
      await n.page.fill("#acct-pass", "right-password");
      await n.page.click("#acct-in");
      await n.page.waitForFunction(() => /Signed in/.test(document.querySelector("[data-account]").textContent));
      check(await n.page.evaluate(() => !document.querySelector("[data-connect-note]")), "53 signing in takes the bad-address note");
      await n.context.close();

      const t = await open(PREVIEW, withState({ tail: REQ }));
      await waitPanel(t.page);
      await settle(t.page);
      /* the learner switch lands between the draw and the click: the old button is kept, its listener still live */
      await t.page.waitForSelector("#lrn-sw-L1");
      await t.page.evaluate(() => { window.__oldOk = document.getElementById("acct-connect-ok"); document.getElementById("lrn-sw-L1").click(); });
      await t.page.waitForFunction(() => window.BMAccount.learner() === "L1");
      await t.page.evaluate(() => window.__oldOk.click());
      await t.page.waitForTimeout(300);
      check(approveCalls(t.rpcLog).length === 0 && t.navs.length === 0, "53 Allow checks the own progress at click time", approveCalls(t.rpcLog));
      await t.context.close();
      const m = await open(ON, withRows([row(U1, "claude")]));
      await waitRows(m.page);
      await m.page.waitForSelector("#lrn-sw-L1");
      await m.page.evaluate((id) => { window.__oldRm = document.getElementById("cnx-rm-" + id); document.getElementById("lrn-sw-L1").click(); }, U1);
      await m.page.waitForFunction(() => window.BMAccount.learner() === "L1");
      await m.page.evaluate(() => window.__oldRm.click());
      await m.page.waitForTimeout(300);
      check(revokeCalls(m.rpcLog).length === 0, "53 Remove checks the own progress at click time", revokeCalls(m.rpcLog));
      await m.context.close();

      for (const [what, over] of [["dated 2 minutes ahead", { at: Date.now() + 120000 }], ["whose app does not match its redirect_uri", { app: "chatgpt" }]]) {
        const j = await open(PREVIEW, withState({ sess: { "bm.connect.v1": rec(over) } }));
        await settle(j.page);
        check(await j.page.evaluate(() => !document.querySelector("[data-connect], [data-connect-refused]")) && await stored(j.page) === null, "53 a record " + what + " is dropped and no panel draws");
        await j.context.close();
      }
    }
  }

  check(errors.length === 0, "no uncaught page errors", errors);
  await browser.close();
  await server.close();
  console.log((fails ? "FAILED" : "ok") + " account: " + passes + " checks passed, " + fails + " failed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
