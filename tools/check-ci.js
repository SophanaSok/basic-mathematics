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
   them */
function checkCore(ci, r) {
  r.count++;
  const browser = jobOf(ci, "browser");
  if (!/part: \$\{\{ fromJSON\(needs\.build\.outputs\.browser-parts\)\.parts \}\}/.test(browser) || !/- if: matrix\.part == fromJSON\(needs\.build\.outputs\.browser-parts\)\.core\n\s+run: npm run test:browser:core\n/.test(browser)) r.fail(FILE + ": the browser job does not run npm run test:browser:core in the job of the part --parts names as core, so the gate could pass without the tools/game scripts");
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

const CHECKS = [
  { name: "project", run: checkProject, what: "the cloudflare job's default project is a Cloudflare Pages project name" },
  { name: "rerun", run: checkRerun, what: "a re-run of an older commit of main stops before wrangler deploys" },
  { name: "pr", run: checkPrBranch, what: "a pull request deploys as pr-<number>, never under its head branch's name" },
  { name: "prod", run: checkProduction, what: "a deploy of main that Cloudflare did not make production fails" },
  { name: "core", run: checkCore, what: "test:browser:core runs in the browser job of the part --parts names as core" },
  { name: "pages", run: checkPages, what: "GitHub Pages gets dist-redirects/, built and checked in the build job, and never dist/" }
];

(function main() {
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
