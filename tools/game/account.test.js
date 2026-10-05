#!/usr/bin/env node
/* The account page as it is drawn (assets/account.js), in headless Chromium.
     node tools/game/account.test.js

   The site is served in-process as lib/target.js picks it (the build in dist/, which
   must be current). Each case pins window.BM_CONFIG, so
   the real assets/config.js cannot set it, and answers the Supabase SDK's URL with a small
   stand-in that records what the page asks of it. Every other request off the local server
   is aborted: nothing reaches Supabase or any sign-in service.

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
  10. an error in the address is left alone on pages other than the account page */
"use strict";
const site = require("../lib/site");
const target = require("../lib/target");
const { chromium } = require("../lib/pw").playwright();

let fails = 0, passes = 0;
function check(cond, what, detail) {
  if (cond) passes++;
  else { fails++; console.error("FAIL " + what + (detail === undefined ? "" : "\n     " + JSON.stringify(detail))); }
}

/* What account.js loads in place of supabase-js: no network, a session only if the case
   gave one, and a record of every hand-over to a sign-in service. */
const SDK = `
window.__oauth = [];
window.supabase = { createClient: function () {
  var opts = window.__opts || {}, subs = [];
  function answer(data) { return { data: data, error: null }; }
  function query() {
    var write = false, api = {
      select: function () { return api; }, eq: function () { return api; },
      insert: function () { write = true; return api; }, update: function () { write = true; return api; },
      upsert: function () { write = true; return api; }, maybeSingle: function () { return api; },
      then: function (ok, bad) {
        return Promise.resolve(answer(write ? [{ updated_at: new Date().toISOString() }] : null)).then(ok, bad);
      }
    };
    return api;
  }
  return {
    from: query,
    rpc: function () { return Promise.resolve(answer(null)); },
    auth: {
      onAuthStateChange: function (cb) { subs.push(cb); return { data: { subscription: { unsubscribe: function () {} } } }; },
      getSession: function () { return Promise.resolve(answer({ session: window.__session || null })); },
      signInWithOAuth: function (a) {
        window.__oauth.push(a);
        if (opts.oauthFails) return Promise.resolve({ data: null, error: { message: "Unsupported provider: provider is not enabled" } });
        return Promise.resolve(answer({ provider: a.provider }));
      },
      signInWithPassword: function () { return Promise.resolve({ data: null, error: { message: "Invalid login credentials" } }); },
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
  const browser = await chromium.launch();
  const errors = [];

  /* a fresh browser profile on account.html, with this config and (optionally) a session */
  async function open(config, opts) {
    opts = opts || {};
    const context = await browser.newContext({ viewport: { width: opts.width || 1280, height: 800 } });
    const outside = [];
    await context.route(/^(https?|wss?):/, (r) => {
      const u = r.request().url();
      if (server.owns(u)) return r.continue();
      outside.push(u);
      if (/^https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/.test(u)) {
        return r.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: SDK });
      }
      return r.abort();
    });
    await context.addInitScript((seed) => {
      const pinned = Object.assign({ supabaseUrl: "https://testref.supabase.co", supabaseAnonKey: "sb_publishable_test" }, seed.config);
      Object.defineProperty(window, "BM_CONFIG", { get: () => pinned, set: () => {}, configurable: false });
      window.__session = seed.session || null;
      window.__opts = seed.stub;
      if (seed.pending) localStorage.setItem("bm.sync.pending.v1", JSON.stringify(seed.pending));
      /* was the returned-error message ever on the page as an alert? */
      new MutationObserver(() => {
        if (document.querySelector('#acct-returned[role="alert"]')) window.__alerted = true;
      }).observe(document, { childList: true, subtree: true });
    }, { config, session: opts.session || null, pending: opts.pending || null, stub: opts.stub || {} });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(server.url + (opts.page || "account.html") + (opts.tail || ""));
    if (opts.page) { await page.waitForFunction(() => window.BMAccount); return { page, context, outside }; }
    await page.waitForFunction(() => window.BMAccount && document.querySelector("[data-account] .panel"));
    if (opts.session) await page.waitForFunction(() => /Signed in/.test(document.querySelector("[data-account]").textContent));
    else await page.waitForFunction(() => window.supabase);
    return { page, context, outside };
  }
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
    check(seen.text && /cancelled or refused/.test(seen.text), "4 a cancelled sign-in is explained in plain words", seen.text);
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
      check(m && want.test(m) && !/cancelled or refused/.test(m), "4 " + tail.match(/error_code=(\w+)/)[1] + " gets its own explanation", m);
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

  check(errors.length === 0, "no uncaught page errors", errors);
  await browser.close();
  await server.close();
  console.log((fails ? "FAILED" : "ok") + " account: " + passes + " checks passed, " + fails + " failed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
