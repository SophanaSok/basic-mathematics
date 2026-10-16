#!/usr/bin/env node
"use strict";
/* The local deploy gate: what CI's `build` and `browser` jobs run, on this machine, with the
   parts side by side, and a receipt saying which tree passed.

   Usage: node tools/gate.js [--with-webgl] [--part=<part>] [--jobs=N] [--no-receipt] [--help]

   --with-webgl   also run the webgl stage (otherwise only when the branch touches WEBGL_PATHS)
   --part         run only that browser part (still after the stages before it)
   --jobs         at most N parts at once (default: all of them; the parts are CPU-bound)
   --no-receipt   write no receipt

   Stages, in order, stopping at the first that fails: clean tree, up to date with
   origin/main, npm run check, migrations, build + dist + redirects, browser parts, webgl
   (when touched), sql (when supabase/ or its tests are touched).
   Part logs and reports: .cache/gate/<part>.log and .cache/gate/<part>/.
   Receipt: <git common dir>/gate/<tree sha>.json, so every worktree shares one place and
   nothing lands in the tree. A receipt describes a commit, hence the clean-tree rule.
   Test hook: BM_GATE_FAKE_FAIL=<part> spawns that part as a process that exits 1.
   Exit: 0 ok, 1 a stage failed, 2 usage or precondition. */

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const site = require("./lib/site");

const ROOT = site.ROOT;
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const opts = site.parseArgs(process.argv.slice(2));

/* the 3D scripts load the world and tools/lib/gl.js; a change to any of these can break
   them without breaking the gate CI waits for */
const WEBGL_PATHS = [
  "src/world/",                  // the 3D world the scripts load
  "src/data/form-models.ts",     // the form models the world draws
  "public/models/",              // the GLBs those models load
  "tools/art/forms/",            // the scripts that write the GLBs
  "tools/lib/gl.js",             // the WebGL probe and launch arguments
  "tools/suites/webgl.js",       // the webgl suite
  "tools/game/scenes.test.js",   // 3D script
  "tools/game/map.test.js",      // 3D script
  "tools/game/forms.test.js"     // 3D script
];
/* sql.yml's path list: what the SQL test reads */
const SQL_PATHS = ["supabase/", "src/sync/events.ts", "tools/gen-prune-sql-cases.js", "tools/sql-test.js"];

function usage() {
  const src = fs.readFileSync(__filename, "utf8");
  console.log(src.slice(src.indexOf("/*") + 3, src.indexOf("*/")).replace(/^   /gm, ""));
}

function out(args, o) {
  const r = cp.spawnSync(args[0], args.slice(1), Object.assign({ cwd: ROOT, encoding: "utf8", shell: false }, o));
  return { code: r.status, out: (r.stdout || "").trimEnd(), err: (r.stderr || "").trim() };
}
const git = (...a) => out(["git"].concat(a));

/* a command in the foreground; output is shown, as it is what a failing stage is read from */
function run(cmd, args, env) {
  const r = cp.spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: false, env: Object.assign({}, process.env, env || {}) });
  return r.status === 0;
}
function npm(args, env) { return run(NPM, args, env); }

const receipt = { stages: {} };
const t0 = Date.now();
const secs = (t) => Math.round((Date.now() - t) / 100) / 10;

/* run a stage's steps (functions returning true), record and print it */
function stage(name, fn) {
  const t = Date.now();
  const ok = fn();
  const s = secs(t);
  receipt.stages[name] = { ok, s };
  console.log("gate  " + name.padEnd(11) + (ok ? "ok  " : "FAIL") + "  " + s + "s");
  return ok;
}
function skipped(name, why) {
  receipt.stages[name] = { ok: true, s: 0, skipped: true };
  console.log("gate  " + name.padEnd(11) + "skipped (" + why + ")");
}
/* up to two tries: software WebGL can lose its context (CI retries three) */
const twice = (f) => f() || f();

/* the browser parts, side by side; each part's output goes to its own log */
function runParts(names, jobs, env) {
  const dir = path.join(ROOT, ".cache", "gate");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const core = JSON.parse(out(["node", "tools/check-browser.js", "--parts"]).out).core;
  const queue = names.slice();
  const results = {};
  return new Promise((resolve) => {
    let live = 0;
    const next = () => {
      if (!queue.length && !live) return resolve(results);
      while (queue.length && live < jobs) {
        const p = queue.shift();
        let cmd, args, penv = env;
        if (env.BM_GATE_FAKE_FAIL === p) { cmd = process.execPath; args = ["-e", "process.exit(1)"]; }
        else if (p === core) { cmd = NPM; args = ["run", "test:browser:core"]; penv = Object.assign({}, env, { BM_ROOT: "dist" }); }
        else { cmd = process.execPath; args = ["tools/check-browser.js", "--root=dist", "--skip=webgl", "--part=" + p, "--out=.cache/gate/" + p]; }
        const log = fs.openSync(path.join(dir, p + ".log"), "w");
        const t = Date.now();
        live++;
        const c = cp.spawn(cmd, args, { cwd: ROOT, env: penv, stdio: ["ignore", log, log], shell: false });
        const done = (ok) => {
          if (results[p]) return;
          fs.closeSync(log);
          results[p] = { ok, s: secs(t) };
          console.log("  " + p.padEnd(11) + (ok ? "ok  " : "FAIL") + "  " + results[p].s + "s");
          live--;
          next();
        };
        c.on("error", () => done(false));
        c.on("close", (code) => done(code === 0));
      }
    };
    next();
  });
}

function writeReceipt(ok) {
  if (opts["no-receipt"]) return;
  const dir = path.join(path.resolve(ROOT, git("rev-parse", "--git-common-dir").out), "gate");
  fs.mkdirSync(dir, { recursive: true });
  const pw = (() => { try { return require(path.join(ROOT, "node_modules", "playwright", "package.json")).version; } catch (e) { return null; } })();
  Object.assign(receipt, {
    tree: receipt.tree, head: receipt.head, branch: receipt.branch, base: receipt.base, ok,
    started: new Date(t0).toISOString(), finished: new Date().toISOString(), seconds: secs(t0),
    node: process.version, playwright: pw, host: os.hostname(), argv: process.argv.slice(2)
  });
  const file = path.join(dir, receipt.tree + ".json");
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + "\n");
  const old = Date.now() - 30 * 864e5;
  fs.readdirSync(dir).forEach((f) => {
    const q = path.join(dir, f);
    if (/\.json$/.test(f) && fs.statSync(q).mtimeMs < old) fs.rmSync(q);
  });
  console.log("receipt " + file);
}

async function main() {
  if (opts.help) { usage(); return 0; }
  const known = ["with-webgl", "part", "jobs", "no-receipt", "help"];
  const bad = Object.keys(opts).filter((k) => k !== "_" && !known.includes(k));
  if (bad.length || opts._.length) { console.error("unknown argument: " + bad.map((k) => "--" + k).concat(opts._).join(" ")); usage(); return 2; }

  const dirty = out(["git", "status", "--porcelain", "--untracked-files=all"]).out;
  if (dirty) { console.error("gate: the tree is not clean; a receipt describes a commit, not a working tree:\n" + dirty); return 2; }
  if (git("fetch", "-q", "origin", "main").code !== 0) { console.error("gate: git fetch origin main failed"); return 2; }
  if (git("merge-base", "--is-ancestor", "origin/main", "HEAD").code !== 0) { console.error("gate: merge or rebase origin/main into this branch first"); return 2; }
  receipt.tree = git("rev-parse", "HEAD^{tree}").out;
  receipt.head = git("rev-parse", "HEAD").out;
  receipt.branch = git("rev-parse", "--abbrev-ref", "HEAD").out;
  receipt.base = git("rev-parse", "origin/main").out;

  let parts = JSON.parse(out(["node", "tools/check-browser.js", "--parts"]).out || "{}").parts;
  if (!parts) { console.error("gate: check-browser.js --parts failed"); return 2; }
  if (opts.part !== undefined) {
    if (!parts.includes(opts.part)) { console.error("gate: no such part: " + opts.part + " (" + parts.join(", ") + ")"); return 2; }
    parts = [opts.part];
  }
  const jobs = opts.jobs === undefined ? parts.length : Math.max(1, parseInt(opts.jobs, 10) || 0);
  if (!jobs) { console.error("gate: --jobs wants a number"); return 2; }
  const changed = git("diff", "--name-only", "origin/main...HEAD").out.split("\n").filter(Boolean);
  const touches = (list) => changed.some((f) => list.some((p) => f === p || (p.endsWith("/") && f.startsWith(p))));

  const ok = await (async () => {
    if (!stage("check", () => npm(["run", "check"]))) return false;
    if (!stage("migrations", () => npm(["run", "check:static", "--", "--only=migrations", "--migrations-base=origin/main"]))) return false;
    if (!stage("build", () => npm(["run", "build"]) && npm(["run", "check:dist"]) && npm(["run", "build:redirects"]) && npm(["run", "check:redirects"]))) return false;

    const t = Date.now();
    const results = await runParts(parts, jobs, process.env);
    receipt.stages.browser = results;
    const failed = Object.keys(results).filter((p) => !results[p].ok);
    failed.forEach((p) => {
      console.log("\n--- last 40 lines of .cache/gate/" + p + ".log ---");
      console.log(fs.readFileSync(path.join(ROOT, ".cache", "gate", p + ".log"), "utf8").split("\n").slice(-41).join("\n"));
    });
    console.log("gate  browser     " + (failed.length ? "FAIL" : "ok  ") + "  " + secs(t) + "s");
    if (failed.length) return false;

    if (opts["with-webgl"] || touches(WEBGL_PATHS)) {
      if (!stage("webgl", () => twice(() => npm(["run", "test:browser:3d"])) && twice(() => npm(["run", "check:browser", "--", "--only=webgl", "--out=.cache/gate/webgl"])))) return false;
    } else skipped("webgl", "no 3D path touched");

    if (touches(SQL_PATHS)) {
      if (!stage("sql", () => {
        if (out(["docker", "--version"]).code !== 0) { console.error("gate: the sql stage needs docker on PATH"); return false; }
        return run(process.execPath, ["tools/gen-prune-sql-cases.js", "--check"]) && npm(["run", "test:sql"]);
      })) return false;
    } else skipped("sql", "no sql path touched");
    return true;
  })();

  writeReceipt(ok);
  console.log("gate  " + (ok ? "PASSED" : "FAILED") + "  " + secs(t0) + "s");
  return ok ? 0 : 1;
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
