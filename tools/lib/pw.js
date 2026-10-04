"use strict";
/* Playwright is not installed in this repo (no package.json, by design). It is
   resolved from a sibling project — BM_PLAYWRIGHT_FROM, or the default below — with
   module.createRequire, so nothing is added here. axe-core is optional and comes
   from the same place. */
const path = require("path");
const os = require("os");
const { createRequire } = require("module");

const DEFAULT_FROM = path.join(os.homedir(), "dev", "json-data-drift-analyzer", "node_modules");

function from() {
  let p = process.env.BM_PLAYWRIGHT_FROM || DEFAULT_FROM;
  if (!p.endsWith("/")) p += "/";
  return p;
}

function resolvePlaywright() {
  const req = createRequire(from());
  let pw, version = "?";
  try {
    pw = req("playwright");
    try { version = req("playwright/package.json").version; } catch (e) { /* fine */ }
  } catch (e) {
    const msg = [
      "Playwright could not be resolved from " + from(),
      "  " + (e && e.message ? e.message.split("\n")[0] : e),
      "Set BM_PLAYWRIGHT_FROM to a node_modules directory that contains `playwright` (with a",
      "downloaded Chromium), e.g. BM_PLAYWRIGHT_FROM=~/some-project/node_modules node tools/check-browser.js"
    ].join("\n");
    const err = new Error(msg);
    err.code = "NO_PLAYWRIGHT";
    throw err;
  }
  let axeSource = null, axeVersion = null;
  try {
    const fs = require("fs");
    axeSource = fs.readFileSync(req.resolve("axe-core/axe.min.js"), "utf8");
    axeVersion = req("axe-core/package.json").version;
  } catch (e) { /* optional */ }
  return { pw, version, from: from(), axeSource, axeVersion };
}

module.exports = { resolvePlaywright, from, DEFAULT_FROM };
