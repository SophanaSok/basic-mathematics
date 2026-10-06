#!/usr/bin/env node
"use strict";
/* Checks on the legacy site, dist-legacy/ (tools/build-legacy.js writes it): what GitHub
   Pages serves at the old address once the site has moved. Node built-ins only, no
   browser (tools/game/carry.test.js drives it in Chromium). Run after
   `npm run build:legacy`.

   Usage: node tools/check-legacy.js [--dir=dist-legacy] [--origin=<new address>] [--base=<path>]
     --origin and --base as build-legacy.js took them (defaults from src/carry/origins.ts)

   Same shape as check-dist.js: one line per check, exit code 1 on any failure. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");
const crypto = require("crypto");

const site = require("./lib/site");
const origins = require("./lib/origins");
const legacy = require("./build-legacy");
const { parse } = require("./lib/html");

const ROOT = site.ROOT;
const opts = site.parseArgs(process.argv.slice(2));
const DIR = path.resolve(ROOT, typeof opts.dir === "string" ? opts.dir : "dist-legacy");
const ORIGIN = (typeof opts.origin === "string" ? opts.origin : origins.read(ROOT).origin).replace(/\/+$/, "");
const BASE = typeof opts.base === "string" ? opts.base : origins.read(ROOT).legacyPath;

function result() {
  const r = { fails: [], notes: [], count: 0 };
  r.fail = (m) => { r.fails.push(m); };
  r.note = (m) => { r.notes.push(m); };
  return r;
}
function filesUnder(dir) {
  return site.walk(dir, () => true).map(p => path.relative(dir, p).split(path.sep).join("/")).sort();
}
const sha = (t) => "'sha256-" + crypto.createHash("sha256").update(t, "utf8").digest("base64") + "'";

function context() {
  const pages = site.htmlPages(ROOT);
  const files = filesUnder(DIR);
  const docs = {}, text = {};
  files.filter(f => /\.html$/.test(f)).forEach(f => { text[f] = fs.readFileSync(path.join(DIR, f), "utf8"); docs[f] = parse(text[f]); });
  return { pages, files, docs, text, want: legacy.render({ origin: ORIGIN, base: BASE }) };
}

/* (a) a stub at the path of every page of the site, the carry page, 404.html,
   .nojekyll, and nothing else: no page of the course, no bundle, no script file */
function checkFiles(ctx, r) {
  const want = ctx.pages.concat(["404.html", "carry/index.html", ".nojekyll"]).sort();
  want.forEach(f => { r.count++; if (!ctx.files.includes(f)) r.fail(f + " is not in " + site.rel(DIR) + "/"); });
  ctx.files.forEach(f => { r.count++; if (!want.includes(f)) r.fail(site.rel(DIR) + "/ has " + f + ", which the legacy site is not made of"); });
  r.note(ctx.pages.length + " page path(s) of the site, each with its stub");
}

/* (b) every file is what build-legacy.js writes now (so a stale copy is caught) */
function checkSame(ctx, r) {
  Object.keys(ctx.want.files).forEach(f => {
    r.count++;
    let have = null;
    try { have = fs.readFileSync(path.join(DIR, f), "utf8"); } catch (e) { return; }      /* `files` reports it */
    if (have !== ctx.want.files[f]) r.fail(f + " is not what tools/build-legacy.js writes (run `npm run build:legacy`)");
  });
}

/* (c) each stub, read as a page: a canonical link to the page's new address, a refresh
   to it inside <noscript> and a link to it in the text; one script, inline, the first of
   the page, whose policy hash is in the page's own Content-Security-Policy, and which
   sends this page to that address; before it, one referrer policy that sends this
   origin on the way out (the new address reads carried progress only from a navigation
   whose referrer is the old origin); no stylesheet, no script file, nothing of the
   course's bundle. Every address is on the new origin. */
function checkStubs(ctx, r) {
  const stub = (page, to) => {
    const doc = ctx.docs[page];
    if (!doc) return;
    const where = page + ": ";
    r.count++;
    const canon = doc.queryAll("link").filter(l => l.getAttribute("rel") === "canonical").map(l => l.getAttribute("href"));
    if (to && canon.join() !== to) r.fail(where + "canonical link " + JSON.stringify(canon) + ", not " + to);
    const refresh = doc.queryAll("meta").filter(m => (m.getAttribute("http-equiv") || "").toLowerCase() === "refresh");
    const wantRefresh = to || ORIGIN + "/";
    /* the carry page waits for its reader (it may offer a file); its <noscript> says why */
    if (page === "carry/index.html") { if (refresh.length) r.fail(where + "a refresh, which would leave before the reader could take the file"); }
    else if (refresh.length !== 1 || refresh[0].getAttribute("content") !== "0; url=" + wantRefresh) r.fail(where + "no refresh to " + wantRefresh + " (" + refresh.map(m => m.getAttribute("content")).join(", ") + ")");
    else if (!/<noscript><meta http-equiv="refresh"/.test(ctx.text[page])) r.fail(where + "the refresh is not inside <noscript>: it would fire before the script has sent the progress");
    if (!doc.queryAll("a").some(a => a.getAttribute("href") === wantRefresh)) r.fail(where + "no visible link to " + wantRefresh);
    const scripts = doc.queryAll("script");
    if (scripts.length !== 1 || scripts[0].getAttribute("src") !== null || scripts[0].getAttribute("type") !== null) r.fail(where + scripts.length + " script(s); a stub has one, inline");
    const links = doc.queryAll("link").filter(l => !/^(canonical|icon)$/.test(l.getAttribute("rel") || ""));
    if (links.length) r.fail(where + "links " + links.map(l => l.getAttribute("rel") + " " + l.getAttribute("href")).join(", "));
    if (/bundle\/|assets\/|src\/entries/.test(ctx.text[page].replace(/<script>[\s\S]*<\/script>/, ""))) r.fail(where + "names a file of the course's build");
    const csp = doc.queryAll("meta").filter(m => (m.getAttribute("http-equiv") || "").toLowerCase() === "content-security-policy").map(m => m.getAttribute("content"));
    const body = /<script>([\s\S]*?)<\/script>/.exec(ctx.text[page]);
    if (csp.length !== 1 || !body || csp[0].indexOf("script-src " + sha(body[1]) + ";") < 0) r.fail(where + "its Content-Security-Policy does not allow its own script by hash");
    else if (ctx.text[page].indexOf("Content-Security-Policy") > ctx.text[page].indexOf("<script>")) r.fail(where + "its Content-Security-Policy comes after the script");
    const referrer = doc.queryAll("meta").filter(m => (m.getAttribute("name") || "").toLowerCase() === "referrer");
    if (referrer.length !== 1 || referrer[0].getAttribute("content") !== legacy.REFERRER) r.fail(where + "no single <meta name=\"referrer\" content=\"" + legacy.REFERRER + "\"> (" + referrer.map(m => m.getAttribute("content")).join(", ") + "): the new address would not see this origin as the referrer");
    else if (ctx.text[page].indexOf('name="referrer"') > ctx.text[page].indexOf("<script>")) r.fail(where + "its referrer policy comes after the script");
    if (/http-equiv="referrer"|referrerpolicy=|rel="[^"]*noreferrer/i.test(ctx.text[page])) r.fail(where + "something else sets a referrer policy");
    const hosts = doc.queryAll("a").concat(doc.queryAll("link")).map(e => e.getAttribute("href")).filter(h => /^https?:/.test(h || ""));
    hosts.forEach(h => { if (new URL(h).origin !== ORIGIN) r.fail(where + "an address off the new origin: " + h); });
  };
  ctx.pages.forEach(page => stub(page, ORIGIN + legacy.targetPath(page)));
  stub("404.html", null);
  stub("carry/index.html", null);
}

/* (d) each stub run as a browser would run it, in a vm: with nothing saved it goes to
   its new address and nothing more, and never sends on an old fragment that is itself
   a payload; with progress, a Supabase session, progress set aside for a reader and
   another site's key saved, it goes there with #bm-carry=, whose data holds the stores
   the new address takes and none of the rest; signed in here (an account binding), the
   settings alone and "w":1, nothing of the account and none of its progress; 404.html
   sends any path to the front page; deflate-raw reads back in Node */
function runStub(text, storage, href) {
  const script = /<script>([\s\S]*?)<\/script>/.exec(text)[1];
  const keys = Object.keys(storage);
  let went = null;
  const u = new URL(href);
  const win = {
    localStorage: { get length() { return keys.length; }, key: (i) => keys[i], getItem: (k) => (k in storage ? storage[k] : null) },
    location: { pathname: u.pathname, search: u.search, hash: u.hash, replace: (to) => { went = went || to; } },
    setTimeout: () => 0, TextEncoder, CompressionStream: undefined, Response, Blob, btoa, Promise, JSON, encodeURIComponent, unescape, Uint8Array, String
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(script, win);
  return new Promise(res => setTimeout(() => res(went), 50));
}
async function checkRun(ctx, r) {
  const saved = {
    "bm.progress.v1": JSON.stringify({ ch01: { solved: { e1: true }, total: 10 } }),
    "bm.theme": JSON.stringify("dark"),
    "bm.sync.pending.v1": JSON.stringify({ "u-9": { email: "a@b.c", state: {} } }),
    "bm.run.v1": JSON.stringify({ paid: ["x"] }),
    "sb-ref-auth-token": JSON.stringify({ access_token: "secret" }),
    "other": JSON.stringify("x")
  };
  const signedIn = Object.assign({}, saved, { "bm.sync.v1": JSON.stringify({ user: "u-1", resetAt: 5 }) });
  const payloadOf = (went, to) => {
    const m = went && /^(.*)#bm-carry=1j([A-Za-z0-9_-]+)$/.exec(went);
    return m && m[1] === to ? JSON.parse(Buffer.from(m[2], "base64url").toString("utf8")) : null;
  };
  for (const page of ctx.pages) {
    const to = ORIGIN + legacy.targetPath(page);
    const old = "https://old.example" + BASE + page;
    r.count++;
    if (!ctx.text[page]) continue;
    const plain = await runStub(ctx.text[page], {}, old + "?mode=review#integers");
    if (plain !== to + "?mode=review#integers") r.fail(page + ": with nothing saved it went to " + plain + ", not " + to + "?mode=review#integers");
    const crafted = await runStub(ctx.text[page], {}, old + "#bm-carry=1jeyJ2IjoxfQ");
    if (crafted !== to) r.fail(page + ": opened with a payload in its own fragment it went to " + crafted + ", not " + to);
    const carried = await runStub(ctx.text[page], saved, old);
    const payload = payloadOf(carried, to);
    if (!payload) { r.fail(page + ": with progress saved it went to " + String(carried).slice(0, 120)); continue; }
    const keys = Object.keys(payload.s).sort().join(",");
    if (payload.v !== 1 || keys !== "bm.progress.v1,bm.theme" || Object.keys(payload).sort().join() !== "s,v") r.fail(page + ": carried " + JSON.stringify(Object.keys(payload)) + " v" + payload.v + " with " + keys + ", not v and s with bm.progress.v1,bm.theme");
    const theirs = payloadOf(await runStub(ctx.text[page], signedIn, old), to);
    if (!theirs || Object.keys(theirs.s).sort().join() !== "bm.theme" || theirs.w !== 1 || Object.keys(theirs).sort().join() !== "s,v,w" || /u-1|resetAt/.test(JSON.stringify(theirs))) r.fail(page + ": signed in here it carried " + JSON.stringify(theirs) + ", not the settings alone and w:1");
  }
  /* 404.html sends any path to the front page, which reads carried progress (the new
     address's own 404 page does not); and the deflated form reads back */
  r.count++;
  const nf = await runStub(ctx.text["404.html"] || "<script></script>", {}, "https://old.example" + BASE + "parts/1-algebra/?x=1#x");
  if (nf !== ORIGIN + "/") r.fail("404.html sent parts/1-algebra/ to " + nf + ", not the front page");
  r.count++;
  const nfCarry = await runStub(ctx.text["404.html"] || "<script></script>", saved, "https://old.example" + BASE + "parts/1-algebra/");
  if (!/^[^#]*#bm-carry=1j[A-Za-z0-9_-]+$/.test(String(nfCarry)) || nfCarry.split("#")[0] !== ORIGIN + "/") r.fail("404.html sent progress to " + String(nfCarry).slice(0, 120) + ", not to the front page");
  r.count++;
  const nfOut = await runStub(ctx.text["404.html"] || "<script></script>", {}, "https://elsewhere.example/nope");
  if (nfOut !== ORIGIN + "/") r.fail("404.html sent a path outside " + BASE + " to " + nfOut + ", not the root");
  r.count++;
  const raw = zlib.deflateRawSync(Buffer.from(JSON.stringify({ v: 1, s: { "bm.theme": "dark" } })));
  if (JSON.parse(zlib.inflateRawSync(raw)).s["bm.theme"] !== "dark") r.fail("deflate-raw does not read back in Node");
}

/* (e) the workflow deploys to the project src/carry/origins.ts names when the repository
   variable is unset (the cloudflare job cannot read that file: it checks nothing out),
   never deploys an older commit of main to production on a re-run, never deploys a pull
   request under its head branch's name (which may be main, the production branch), fails
   a deploy of main that Cloudflare did not make production, and publishes this directory
   once SITE_CUTOVER is true; and the deploy gate it waits for runs test:browser:core */
function checkCi(ctx, r) {
  const ci = fs.readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
  const project = origins.read(ROOT).project;
  r.count++;
  if (ci.indexOf("${{ vars.CLOUDFLARE_PROJECT_NAME || '" + project + "' }}") < 0) r.fail(".github/workflows/ci.yml: the cloudflare job's default project is not PAGES_PROJECT of src/carry/origins.ts (" + project + ")");
  /* the production deploy, like the GitHub Pages one, refuses a re-run of an old commit
     of main: it must come before wrangler runs */
  r.count++;
  const job = ci.slice(ci.indexOf("\n  cloudflare:"));
  const guard = job.indexOf("github.run_attempt > 1"), check = job.indexOf('repos/$REPO/commits/main'), wrangler = job.indexOf("uses: cloudflare/wrangler-action@");
  if (ci.indexOf("\n  cloudflare:") < 0 || guard < 0 || check < guard || wrangler < 0 || check > wrangler) r.fail(".github/workflows/ci.yml: the cloudflare job does not stop a re-run of an older commit of main before it deploys");
  /* wrangler makes a deploy production when --branch is the project's production branch:
     a pull request goes under pr-<number>, and nothing in the job reads the head branch */
  r.count++;
  if (job.indexOf('branch="pr-$PR_NUMBER"') < 0 || /head_ref|HEAD_REF/.test(job)) r.fail(".github/workflows/ci.yml: the cloudflare job does not deploy a pull request under pr-<number>, so a pull request whose head is main would deploy to production");
  /* and a deploy of main that came out as a preview fails, after wrangler ran */
  r.count++;
  const prod = job.indexOf('if [ "$ENVIRONMENT" != "production" ]');
  if (prod < 0 || prod < wrangler || !/name: A deploy from main is production\n\s+if: [^\n]*github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/.test(job)) r.fail(".github/workflows/ci.yml: the cloudflare job does not fail a deploy of main that Cloudflare did not make production");
  /* the deploy gate's tools/game scripts run in the browser job of the part CORE of
     check-browser.js, which ci.yml reads from --parts: a part named in ci.yml instead
     would leave them in no job once the part was renamed, and the gate would pass
     without them */
  r.count++;
  const browser = ci.indexOf("\n  browser:") < 0 ? "" : ci.slice(ci.indexOf("\n  browser:") + 1).split(/\n  [a-z-]+:\n/)[0];
  if (!/part: \$\{\{ fromJSON\(needs\.build\.outputs\.browser-parts\)\.parts \}\}/.test(browser) || !/- if: matrix\.part == fromJSON\(needs\.build\.outputs\.browser-parts\)\.core\n\s+run: npm run test:browser:core\n/.test(browser)) r.fail(".github/workflows/ci.yml: the browser job does not run npm run test:browser:core in the job of the part --parts names as core, so the gate could pass without the tools/game scripts");
  r.count++;
  if (!/name: dist-legacy\n\s+path: dist-legacy/.test(ci) || ci.indexOf('echo "artifact=dist-legacy"') < 0) r.fail(".github/workflows/ci.yml: dist-legacy/ is not kept as an artifact and published when SITE_CUTOVER is true");
}

const CHECKS = [
  { name: "files", run: checkFiles, what: "a stub at every page path of the site, the carry page, 404.html, .nojekyll, and nothing else" },
  { name: "same", run: checkSame, what: "every file is what tools/build-legacy.js writes now" },
  { name: "stubs", run: checkStubs, what: "canonical, <noscript> refresh and visible link to the page's new address; a referrer policy that sends this origin; one inline script, allowed by hash, no course files" },
  { name: "run", run: checkRun, what: "each stub run: nothing saved goes plain; progress goes in #bm-carry=, the stores the new address takes and nothing else; signed in, the settings and w:1 alone; 404.html to the front page" },
  { name: "ci", run: checkCi, what: "the workflow's default Cloudflare project is origins.ts's, a re-run of an old commit of main deploys nothing to Cloudflare, a pull request deploys as pr-<number> and never to production, a deploy of main that is not production fails, it publishes dist-legacy/ when SITE_CUTOVER is true, and test:browser:core runs in the browser job of the part --parts names as core" }
];

(async function main() {
  const t0 = Date.now();
  if (!fs.existsSync(DIR)) { console.error("FAIL  setup: no " + site.rel(DIR) + "/ — run `npm run build:legacy` first"); process.exit(1); }
  const ctx = context();
  let anyFail = false;
  for (const c of CHECKS) {
    const r = result();
    try { await c.run(ctx, r); } catch (e) { r.fail("check crashed: " + (e.stack || e.message)); }
    if (r.fails.length) anyFail = true;
    console.log((r.fails.length ? "FAIL" : "PASS").padEnd(5) + " " + c.name.padEnd(8) + " " + String(r.count).padStart(5) + "  " + c.what);
    r.notes.forEach(n => console.log("        · " + n));
    r.fails.forEach(m => console.log("        ✗ " + m));
  }
  console.log((anyFail ? "FAILED" : "all passed") + " in " + ((Date.now() - t0) / 1000).toFixed(1) + "s (" + site.rel(DIR) + "/, " + ctx.files.length + " files, to " + ORIGIN + ")");
  process.exit(anyFail ? 1 : 0);
})();
