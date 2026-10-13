#!/usr/bin/env node
"use strict";
/* Checks on .github/workflows/ci.yml: the guards of its deploys, which nothing else
   tests (a workflow runs only on GitHub). Node built-ins only; part of `npm run check`,
   so the build job runs it on every pull request.

   Usage: node tools/check-ci.js

   Same shape as check-dist.js: one line per check, exit code 1 on any failure. */
const fs = require("fs");
const path = require("path");

const site = require("./lib/site");

const FILE = ".github/workflows/ci.yml";

function result() {
  const r = { fails: [], notes: [], count: 0 };
  r.fail = (m) => { r.fails.push(m); };
  r.note = (m) => { r.notes.push(m); };
  return r;
}
/* one job of the workflow: from its `  <name>:` line to the next job's */
function jobOf(ci, name) {
  const at = ci.indexOf("\n  " + name + ":\n");
  return at < 0 ? "" : ci.slice(at + 1).split(/\n  [a-z-]+:\n/)[0];
}

/* (a) the cloudflare job deploys to a project when the repository variable
   CLOUDFLARE_PROJECT_NAME is unset: its default, written once, here (the job checks
   nothing out, so it can read no file of the repository), must be a Cloudflare Pages
   project name */
function checkProject(ci, r) {
  r.count++;
  const m = /\$\{\{ vars\.CLOUDFLARE_PROJECT_NAME \|\| '([^']*)' \}\}/.exec(jobOf(ci, "cloudflare"));
  if (!m) r.fail(FILE + ": the cloudflare job has no default project (`${{ vars.CLOUDFLARE_PROJECT_NAME || '<name>' }}`)");
  else if (!/^[a-z0-9][a-z0-9-]*$/.test(m[1])) r.fail(FILE + ": the cloudflare job's default project " + JSON.stringify(m[1]) + " is not a Cloudflare Pages project name (lower-case letters, digits and -)");
  else r.note("default Cloudflare Pages project: " + m[1]);
}

/* (b) the production deploy, like the GitHub Pages one, refuses a re-run of an old commit
   of main: it must come before wrangler runs */
function checkRerun(ci, r) {
  r.count++;
  const job = jobOf(ci, "cloudflare");
  const guard = job.indexOf("github.run_attempt > 1"), check = job.indexOf('repos/$REPO/commits/main'), wrangler = job.indexOf("uses: cloudflare/wrangler-action@");
  if (!job || guard < 0 || check < guard || wrangler < 0 || check > wrangler) r.fail(FILE + ": the cloudflare job does not stop a re-run of an older commit of main before it deploys");
}

/* (c) wrangler makes a deploy production when --branch is the project's production
   branch: a pull request goes under pr-<number>, and nothing in the job reads the head
   branch */
function checkPrBranch(ci, r) {
  r.count++;
  const job = jobOf(ci, "cloudflare");
  if (job.indexOf('branch="pr-$PR_NUMBER"') < 0 || /head_ref|HEAD_REF/.test(job)) r.fail(FILE + ": the cloudflare job does not deploy a pull request under pr-<number>, so a pull request whose head is main would deploy to production");
}

/* (d) and a deploy of main that came out as a preview fails, after wrangler ran */
function checkProduction(ci, r) {
  r.count++;
  const job = jobOf(ci, "cloudflare");
  const wrangler = job.indexOf("uses: cloudflare/wrangler-action@"), prod = job.indexOf('if [ "$ENVIRONMENT" != "production" ]');
  if (prod < 0 || prod < wrangler || !/name: A deploy from main is production\n\s+if: [^\n]*github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/.test(job)) r.fail(FILE + ": the cloudflare job does not fail a deploy of main that Cloudflare did not make production");
}

/* (e) the deploy gate's tools/game scripts run in the browser job of the part CORE of
   check-browser.js, which ci.yml reads from --parts: a part named in ci.yml instead
   would leave them in no job once the part was renamed, and the gate would pass without
   them. The check:browser step of that job is skipped by the same output (the part names
   no suite), and every other part's job runs it */
function checkCore(ci, r) {
  r.count++;
  const browser = jobOf(ci, "browser");
  if (!/part: \$\{\{ fromJSON\(needs\.build\.outputs\.browser-parts\)\.parts \}\}/.test(browser) || !/- if: matrix\.part == fromJSON\(needs\.build\.outputs\.browser-parts\)\.core\n\s+run: npm run test:browser:core\n/.test(browser)) r.fail(FILE + ": the browser job does not run npm run test:browser:core in the job of the part --parts names as core, so the gate could pass without the tools/game scripts");
  r.count++;
  if (!/\n\s+if: matrix\.part != fromJSON\(needs\.build\.outputs\.browser-parts\)\.core\n\s+run: npm run check:browser -- --skip=webgl --part="\$PART"\n/.test(browser)) r.fail(FILE + ": the browser job does not run check:browser --part in every job but the core part's, read from --parts");
}

/* (f) GitHub Pages serves only the redirect site: the build job builds and checks
   dist-redirects/ and keeps it as an artifact, and the deploy job publishes that and
   never dist/ (the course is served only from Cloudflare Pages), with no variable that
   could choose otherwise */
function checkPages(ci, r) {
  r.count++;
  const build = jobOf(ci, "build"), deploy = jobOf(ci, "deploy");
  if (!/- run: npm run build:redirects\n\s+- run: npm run check:redirects\n/.test(build) || !/name: dist-redirects\n\s+path: dist-redirects\n/.test(build)) r.fail(FILE + ": the build job does not build, check and keep dist-redirects/");
  r.count++;
  const artifacts = (deploy.match(/uses: actions\/download-artifact@[^\n]+\n\s+with:\n\s+name: [^\n]+/g) || []).map(s => s.split("name: ")[1]);
  if (artifacts.join() !== "dist-redirects" || /vars\./.test(deploy)) r.fail(FILE + ": the deploy job does not publish dist-redirects/ alone (it downloads " + JSON.stringify(artifacts) + (/vars\./.test(deploy) ? " and reads a repository variable" : "") + ")");
}

/* (g) a pull request or a push to main that changes only Markdown and docs/ starts no run
   (paths-ignore). The list stays those two patterns, the same for both events, so it
   cannot grow to cover a file the build or a check reads; and the build reads no file the
   two patterns cover: no Markdown where it copies or bundles files (public/ goes into
   dist/ as it is), and nothing but Markdown in docs/ */
const SKIP = '["**/*.md", "docs/**"]';
const BUILD_DIRS = ["public", "src", "assets", "data", "parts"];
function checkSkip(ci, r) {
  r.count++;
  const at = ci.search(/^on:\n/m);
  const on = at < 0 ? "" : ci.slice(at).split(/\n(?=\S)/)[0];
  const lists = on.match(/^ +paths(-ignore)?:.*$/gm) || [];
  const want = /^on:\n  pull_request:\n    paths-ignore: (.*)\n  push:\n    branches: \[main\]\n    paths-ignore: (.*)\n  workflow_dispatch:\s*$/.exec(on);
  if (!want || want[1] !== SKIP || want[2] !== SKIP || lists.length !== 2) r.fail(FILE + ": the triggers are not pull_request and push to main, each with paths-ignore: " + SKIP + ", and workflow_dispatch (found " + JSON.stringify(lists.map(s => s.trim())) + ")");
  else r.note("no run for a change to only " + SKIP);
  BUILD_DIRS.forEach(d => {
    r.count++;
    site.walk(path.join(site.ROOT, d), p => /\.md$/i.test(p)).forEach(p => r.fail(path.relative(site.ROOT, p) + " is Markdown in " + d + "/, which the build reads, and a change to only it would start no run of " + FILE + " (paths-ignore)"));
  });
  r.count++;
  site.walk(path.join(site.ROOT, "supabase", "migrations"), p => /\.md$/i.test(p) && path.basename(p) !== "README.md").forEach(p => r.fail(path.relative(site.ROOT, p) + " is Markdown in supabase/migrations/, which check-static's migrations check reads as a migration, and a change to only it would start no run of " + FILE + " (paths-ignore)"));
  r.count++;
  site.walk(path.join(site.ROOT, "docs"), p => !/\.md$/i.test(p)).forEach(p => r.fail(path.relative(site.ROOT, p) + " is in docs/ and is not Markdown: a change to only it would start no run of " + FILE + " (paths-ignore docs/**), so keep docs/ to prose"));
}

/* (h) a stuck browser download once held a job until its job timeout, so every step that
   runs `playwright install` has a step-level timeout-minutes as a backstop and wraps the
   install in coreutils `timeout`, which gives each try of its loop its own limit. The
   wrapper kills (-k) after its TERM, since a wedged apt under --with-deps can ignore the
   TERM and hold the dpkg lock against every later try. Each line that runs the install
   is wrapped (a second, bare install in the same step is caught; a step name or an echo
   that names it runs nothing), and every job that runs the browser tests has its own
   install step */
const INSTALL = /\b(npx|npm exec) playwright install\b/;
const WRAPPED = /\btimeout (-k \d+|--kill-after=\d+) \d+ (npx|npm exec) playwright install\b/;
function uncommented(ci) { return ci.split("\n").filter(l => !/^\s*#/.test(l)).join("\n"); }
function installSteps(code) {
  return code.split(/\n(?=      - )/).filter(s => /\bplaywright install\b/.test(s));
}
/* every job, as { name, code }, from its `  <name>:` line under jobs: to the next job's */
function jobs(code) {
  const at = code.indexOf("\njobs:\n");
  const body = at < 0 ? (code.startsWith("jobs:\n") ? code.slice(6) : "") : code.slice(at + 7);
  return body.split(/\n(?=  [a-z][\w-]*:\n)/).map(s => ({ name: (/^ {2}([a-z][\w-]*):/.exec(s) || [0, ""])[1], code: s })).filter(j => j.name);
}
function checkInstall(ci, r) {
  const code = uncommented(ci);
  const steps = installSteps(code);
  r.count++;
  if (!steps.length) r.fail(FILE + ": no step runs playwright install, so this check guards nothing");
  steps.forEach(s => {
    r.count++;
    const name = (/name: ([^\n]+)/.exec(s) || [0, s.split("\n")[0].trim()])[1];
    if (!/^ {8}timeout-minutes: \d+$/m.test(s)) r.fail(FILE + ": the step " + JSON.stringify(name) + " runs playwright install with no step-level timeout-minutes");
    const runs = s.split("\n").filter(l => INSTALL.test(l) && !/^\s*(- )?name:/.test(l) && !/^\s*echo\b/.test(l));
    if (!runs.length || runs.some(l => !WRAPPED.test(l))) r.fail(FILE + ": the step " + JSON.stringify(name) + " runs playwright install without a `timeout -k <seconds> <seconds>` wrapper, so a stuck download takes the whole step");
  });
  jobs(code).filter(j => /\b(test|check):browser\b/.test(j.code)).forEach(j => {
    r.count++;
    if (!installSteps(j.code).length) r.fail(FILE + ": the job " + JSON.stringify(j.name) + " runs the browser tests with no playwright install step of its own");
  });
}

const CHECKS = [
  { name: "project", run: checkProject, what: "the cloudflare job's default project is a Cloudflare Pages project name" },
  { name: "rerun", run: checkRerun, what: "a re-run of an older commit of main stops before wrangler deploys" },
  { name: "pr", run: checkPrBranch, what: "a pull request deploys as pr-<number>, never under its head branch's name" },
  { name: "prod", run: checkProduction, what: "a deploy of main that Cloudflare did not make production fails" },
  { name: "core", run: checkCore, what: "test:browser:core runs in the browser job of the part --parts names as core" },
  { name: "pages", run: checkPages, what: "GitHub Pages gets dist-redirects/, built and checked in the build job, and never dist/" },
  { name: "skip", run: checkSkip, what: "only a change to Markdown or docs/ alone starts no run, and the build reads none of it" },
  { name: "install", run: checkInstall, what: "every job that runs the browser tests has a playwright install step, with a timeout-minutes and a killing timeout wrapper per try" }
];

module.exports = { checkInstall };

if (require.main === module) (function main() {
  const t0 = Date.now();
  const ci = fs.readFileSync(path.join(site.ROOT, FILE), "utf8");
  let anyFail = false;
  for (const c of CHECKS) {
    const r = result();
    try { c.run(ci, r); } catch (e) { r.fail("check crashed: " + (e.stack || e.message)); }
    if (r.fails.length) anyFail = true;
    console.log((r.fails.length ? "FAIL" : "PASS").padEnd(5) + " " + c.name.padEnd(8) + " " + String(r.count).padStart(5) + "  " + c.what);
    r.notes.forEach(n => console.log("        · " + n));
    r.fails.forEach(m => console.log("        ✗ " + m));
  }
  console.log((anyFail ? "FAILED" : "all passed") + " in " + ((Date.now() - t0) / 1000).toFixed(1) + "s (" + FILE + ")");
  process.exit(anyFail ? 1 : 0);
})();
