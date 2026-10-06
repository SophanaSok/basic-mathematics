"use strict";
/* Playwright and axe-core are dev dependencies of this repo (package.json): `npm ci`
   installs them, and `npx playwright install chromium` downloads the browser once.
   They are resolved from the repo first. Only when that fails is BM_PLAYWRIGHT_FROM
   tried: a node_modules directory somewhere else that holds `playwright` with a
   downloaded Chromium, so a checkout with nothing installed can still borrow one.
   axe-core is optional and comes from wherever Playwright came from. */
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

const ROOT = path.resolve(__dirname, "..", "..");

/* the node_modules directories to look in, in order */
function places() {
  const out = [path.join(ROOT, "node_modules") + path.sep];
  let p = process.env.BM_PLAYWRIGHT_FROM;
  if (p) out.push(p.endsWith("/") ? p : p + "/");
  return out;
}

let found = null;       /* where Playwright resolved from, once it has */
function from() { return found || places()[0]; }

/* The built pages are served under dist/_headers (lib/serve.js), Content-Security-Policy
   and all, so every browser script runs them under the policy readers get. What the
   policy blocks must fail the script that saw it, whichever script that is: every
   context of a Chromium launched from here reports a violation as a console error and
   then as an uncaught error on the page, which lib/browser.js track() and every
   tools/game script's watch on "pageerror" count as a failure. The pages never see it
   unless they break the policy. */
const CSP_REPORTER = `document.addEventListener("securitypolicyviolation", function (e) {
  var what = e.effectiveDirective + " blocked " + (e.blockedURI || "an inline " + (/^style/.test(e.effectiveDirective) ? "style" : "script")) + (e.sourceFile ? " (" + e.sourceFile + ":" + e.lineNumber + ")" : "");
  console.error("Content-Security-Policy violation: " + what);
  setTimeout(function () { throw new Error("Content-Security-Policy violation: " + what); }, 0);
});`;
function guardCsp(browserType) {
  if (!browserType || browserType.__bmCsp) return;
  const launch = browserType.launch.bind(browserType);
  browserType.launch = async (options) => {
    const browser = await launch(options);
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (o) => {
      const context = await newContext(o);
      await context.addInitScript(CSP_REPORTER);
      return context;
    };
    return browser;
  };
  browserType.__bmCsp = true;
}

function resolvePlaywright() {
  let pw, version = "?", req = null;
  const tried = [];
  for (const place of places()) {
    try {
      req = createRequire(place);
      pw = req("playwright");
      found = place;
      break;
    } catch (e) {
      tried.push("  " + place + ": " + (e && e.message ? e.message.split("\n")[0] : e));
    }
  }
  if (!pw) {
    const msg = [
      "Playwright could not be resolved:"
    ].concat(tried, [
      "Run `npm ci` and then `npx playwright install chromium` in this repo. (Or set",
      "BM_PLAYWRIGHT_FROM to a node_modules directory that holds `playwright` with a downloaded",
      "Chromium, e.g. BM_PLAYWRIGHT_FROM=~/some-project/node_modules node tools/check-browser.js)"
    ]).join("\n");
    const err = new Error(msg);
    err.code = "NO_PLAYWRIGHT";
    throw err;
  }
  guardCsp(pw.chromium);
  try { version = req("playwright/package.json").version; } catch (e) { /* fine */ }
  let axeSource = null, axeVersion = null;
  try {
    axeSource = fs.readFileSync(req.resolve("axe-core/axe.min.js"), "utf8");
    axeVersion = req("axe-core/package.json").version;
  } catch (e) { /* optional */ }
  return { pw, version, from: found, axeSource, axeVersion };
}

/* for a script that cannot go on without it: the playwright module, or the reason and exit 2 */
function playwright() {
  try { return resolvePlaywright().pw; }
  catch (e) { console.error(e.message); process.exit(2); }
}

module.exports = { resolvePlaywright, playwright, from };
