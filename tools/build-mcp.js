#!/usr/bin/env node
"use strict";
/* The connector's worker (docs/decisions/0016-mochi-in-your-ai.md), built into dist/ beside
   the site: Cloudflare Pages runs a file named _worker.js at the root of the deployed
   directory ("advanced mode") for the paths _routes.json lists, and hands every other path to
   the static files. It holds no secret: the Supabase URL and the public anon key are what
   assets/config.js already ships to every browser.

   Usage: node tools/build-mcp.js [--dist=<dir>] [--connect=off|preview|on] [--out=<file>]
     --dist     the build to add the worker to (default: dist/)
     --connect  overrides the switch below; the tests use it, the build never passes it
     --out      where to write the worker (default: <dist>/_worker.js)

   What it reads: the exercise index (lib/exercise-index.js, from the source pages), the
   curriculum (data/curriculum.js), and from assets/config.js the Supabase URL, the anon key
   and `connect`, the switch: "off", "preview" or "on" (absent or anything else is "off").
   The same dist goes to production and to every preview, so the switch is a value baked in at
   build time and never a host rule; while it is off the worker hands every request to the
   static files, as if it were not there.

   What it writes: dist/_worker.js, one ES module that imports nothing (src/mcp/ and the
   course data bundled in by Vite's own SSR build, for the webworker target), and
   dist/_routes.json, which sends only /mcp and the OAuth paths to it, so that a page, a
   script or a stylesheet is never run through it. The build directory is
   node_modules/.cache/bm-mcp/ (data.json, entry.ts and out/); it is not part of the site.
   tools/check-dist.js `worker` holds dist/ to all of it. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const site = require("./lib/site");

const ROOT = site.ROOT;
const CACHE = path.join(ROOT, "node_modules", ".cache", "bm-mcp");
const WORKER = "_worker.js";
const ROUTES_FILE = "_routes.json";
const CONNECT = ["off", "preview", "on"];

/* the one list of paths the worker answers (src/mcp/worker.ts MCP_PATH, oauth.ts): anything
   else, and so every file of the site, is served without the worker */
const ROUTES = '{"version":1,"include":["/mcp","/oauth/*","/.well-known/oauth-*"],"exclude":[]}';

/* the settings of a config.js text: { supabaseUrl, anonKey, connect }. Throws on a URL that
   is not https, since the worker would send the anon key to it; an empty URL or key is
   returned empty and build() refuses it */
function readConfig(text) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(text, sandbox, { filename: "assets/config.js" });
  const c = sandbox.window.BM_CONFIG || {};
  const supabaseUrl = typeof c.supabaseUrl === "string" ? c.supabaseUrl.trim() : "";
  if (supabaseUrl && new URL(supabaseUrl).protocol !== "https:") throw new Error("assets/config.js: supabaseUrl must be https, is " + JSON.stringify(supabaseUrl));
  return {
    supabaseUrl: supabaseUrl.replace(/\/+$/, ""),
    anonKey: typeof c.supabaseAnonKey === "string" ? c.supabaseAnonKey.trim() : "",
    connect: CONNECT.includes(c.connect) ? c.connect : "off"
  };
}

/* the entry the bundler starts from: the worker made from the data next to it (the import
   of the JSON keeps the data a constant of the bundle; nothing is read at run time) */
function entrySource(workerPath) {
  return [
    'import { createWorker } from ' + JSON.stringify(workerPath) + ';',
    'import data from "./data.json";',
    "const worker = createWorker(data as never);",
    "export default { fetch: (req: Request, env: never) => worker.fetch(req, env) };",
    ""
  ].join("\n");
}

/* the curriculum as the worker reads it: the parts with their chapters and sections. The
   decorated object lib/site.js returns also holds each chapter's `part` (a cycle), the flat
   lists of the chapters and a function, none of which src/mcp/ reads and none of which JSON
   can carry */
function plain(c) {
  return JSON.parse(JSON.stringify({ title: c.title, subtitle: c.subtitle, parts: c.parts }, (k, v) => (k === "part" ? undefined : v)));
}

/* builds the worker and writes it and _routes.json; returns [{ file, bytes }] */
async function build(o) {
  o = o || {};
  const dist = path.resolve(ROOT, o.dist || "dist");
  const out = path.resolve(ROOT, o.out || path.join(dist, WORKER));
  const cfg = readConfig(fs.readFileSync(path.join(ROOT, "assets", "config.js"), "utf8"));
  if (o.connect !== undefined && o.connect !== null) {
    if (!CONNECT.includes(o.connect)) throw new Error("--connect must be one of " + CONNECT.join(", ") + ", is " + JSON.stringify(o.connect));
    cfg.connect = o.connect;
  }
  if (!cfg.supabaseUrl) throw new Error("assets/config.js: supabaseUrl is empty; the worker needs the project to ask");
  if (!cfg.anonKey) throw new Error("assets/config.js: supabaseAnonKey is empty; the worker needs the public key");
  const index = require("./lib/exercise-index").indexOf();
  if (!index.length) throw new Error("the exercise index is empty");
  const curriculum = site.curriculum(ROOT);
  if (!curriculum.parts || !curriculum.parts.length) throw new Error("data/curriculum.js has no parts");

  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(path.join(CACHE, "data.json"), JSON.stringify({ course: { index, curriculum: plain(curriculum) }, supabaseUrl: cfg.supabaseUrl, anonKey: cfg.anonKey, connect: cfg.connect }));
  const entry = path.join(CACHE, "entry.ts");
  fs.writeFileSync(entry, entrySource(path.join(ROOT, "src", "mcp", "worker.ts")));

  const { build: bundle } = await import("vite");
  const outDir = path.join(CACHE, "out");
  await bundle({
    configFile: false,
    logLevel: "warn",
    publicDir: false,
    root: ROOT,
    build: {
      ssr: entry,
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      target: "es2022",
      rollupOptions: { output: { entryFileNames: WORKER, format: "es" } }
    },
    ssr: { noExternal: true, target: "webworker" },
    resolve: { conditions: ["worker", "browser"] }
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(path.join(outDir, WORKER), out);
  const written = [{ file: out, bytes: fs.statSync(out).size }];
  if (!o.out) {
    const routes = path.join(dist, ROUTES_FILE);
    fs.writeFileSync(routes, ROUTES + "\n");
    written.push({ file: routes, bytes: fs.statSync(routes).size });
  }
  return written;
}

async function main() {
  const opts = site.parseArgs(process.argv.slice(2));
  try {
    const written = await build({
      dist: typeof opts.dist === "string" ? opts.dist : undefined,
      connect: typeof opts.connect === "string" ? opts.connect : undefined,
      out: typeof opts.out === "string" ? opts.out : undefined
    });
    written.forEach(w => console.log("mcp    " + (site.rel(w.file) || w.file) + "  " + w.bytes + " bytes"));
  } catch (e) {
    console.error("FAIL  build-mcp: " + (e && e.message ? e.message : e));
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { ROUTES, WORKER, ROUTES_FILE, CACHE, readConfig, entrySource, plain, build };
