"use strict";
/* The site's addresses as the Node tools need them, read from src/carry/origins.ts,
   the one place they are written (the bundle imports that file). Each is an
   `export const NAME = "…";` line there; one that is missing or not a plain string is
   an error, not a guess. */
const fs = require("fs");
const path = require("path");

const FILE = "src/carry/origins.ts";
const NAMES = ["ORIGIN", "LEGACY", "PAGES_PROJECT", "LEGACY_LOCAL"];

function read(root) {
  const text = fs.readFileSync(path.join(root || path.resolve(__dirname, "..", ".."), FILE), "utf8");
  const out = {};
  NAMES.forEach(n => {
    const m = new RegExp("^export const " + n + ' = "([^"\\\\]*)";$', "m").exec(text);
    if (!m) throw new Error(FILE + ": no `export const " + n + ' = "…";` line');
    out[n] = m[1];
  });
  const origin = new URL(out.ORIGIN);
  if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.origin !== out.ORIGIN) throw new Error(FILE + ": ORIGIN must be an https origin with no path or trailing slash, is " + JSON.stringify(out.ORIGIN));
  const legacy = new URL(out.LEGACY);
  if (legacy.protocol !== "https:" || !/\/$/.test(legacy.pathname) || legacy.href !== out.LEGACY) throw new Error(FILE + ": LEGACY must be an https address ending in /, is " + JSON.stringify(out.LEGACY));
  if (!/^[a-z0-9][a-z0-9-]*$/.test(out.PAGES_PROJECT)) throw new Error(FILE + ": PAGES_PROJECT must be a Cloudflare Pages project name (lower-case letters, digits, dashes), is " + JSON.stringify(out.PAGES_PROJECT));
  const local = new URL(out.LEGACY_LOCAL);
  if (local.protocol !== "http:" || ["127.0.0.1", "localhost", "[::1]"].indexOf(local.hostname) < 0 || local.port || local.origin !== out.LEGACY_LOCAL) throw new Error(FILE + ": LEGACY_LOCAL must be http:// and a loopback host, with no port or path, is " + JSON.stringify(out.LEGACY_LOCAL));
  return { origin: out.ORIGIN, legacy: out.LEGACY, legacyPath: legacy.pathname, project: out.PAGES_PROJECT, legacyLocal: out.LEGACY_LOCAL };
}

module.exports = { read, FILE };
