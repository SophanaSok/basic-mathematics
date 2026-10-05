"use strict";
/* A CDN that stalls must cost a warning, never a navigation timeout. The pages still
   take Three.js from another server (the fonts, KaTeX and supabase-js come from the site
   itself now, and `pages` fails any other third-party request), and this run loads
   several hundred pages: left to Chromium, one request that neither answers nor fails
   holds whatever waits on it until page.goto gives up. lib/browser.js answers those
   requests itself (a deadline, and each URL fetched once per run); this suite holds it
   to that, against a local server that plays the CDN, with a stylesheet and a deferred
   script as the hardest case (they hold the page's load event):
     - a request that is accepted and never answered
     - the same host asked again straight away: not waited for a second time, which is
       what bounds a loader that tries one CDN after another
     - a response whose headers arrive and whose body never ends
     - a file that is there, asked for by two pages, fetched once
   and reads the suites' source: a context opened around the helper is not covered.
   Each case has a stand-in of its own, since a host that stalled is left alone for a
   while. */
const fs = require("fs");
const http = require("http");
const path = require("path");
const browserLib = require("../lib/browser");

const FIXTURE = "tools/fixtures/third-party.html";

/* the stand-in CDN: /never* is never answered, /half* stops after its headers and first
   bytes, anything else is a small script or stylesheet */
function cdn() {
  const hits = {};
  const open = new Set();
  const server = http.createServer((req, res) => {
    const name = req.url.split("?")[0];
    hits[name] = (hits[name] || 0) + 1;
    if (/^\/never/.test(name)) return;
    const css = /\.css$/.test(name);
    res.writeHead(200, { "Content-Type": css ? "text/css" : "text/javascript", "Access-Control-Allow-Origin": "*" });
    if (/^\/half/.test(name)) { res.write(css ? "p {" : "window.__half = "); return; }
    res.end(css ? "#out { letter-spacing: 1px; }" : "window.__cdn = (window.__cdn || 0) + 1;");
  });
  server.on("connection", s => { open.add(s); s.on("close", () => open.delete(s)); });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({
      url: "http://127.0.0.1:" + server.address().port + "/", hits,
      close: () => new Promise(r => { open.forEach(s => s.destroy()); server.close(r); })
    }));
  });
}

module.exports = {
  name: "thirdparty",
  order: 5,
  description: "a CDN that stalls is a warning, not a navigation timeout; each third-party file is fetched once",
  FIXTURE,
  async run(ctx) {
    const { h, report } = ctx;
    const limit = browserLib.THIRD_PARTY_MS;
    const others = [];
    /* open the fixture against a stand-in and say how it went */
    async function load(other, css, js) {
      const { page, errors, close } = await h.newPage({});
      const t0 = Date.now();
      try {
        await h.open(page, FIXTURE + "?cdn=" + encodeURIComponent(other.url) + "&css=" + css + "&js=" + js);
        const seen = await page.evaluate(() => ({ dcl: window.__dcl === true, state: document.readyState, cdn: window.__cdn || 0, spacing: getComputedStyle(document.getElementById("out")).letterSpacing }));
        return { ms: Date.now() - t0, seen, failures: errors.failures(), thirdParty: errors.thirdParty.slice() };
      } catch (e) {
        return { ms: Date.now() - t0, error: String(e && e.message || e).split("\n")[0] };
      } finally { await close(); }
    }
    try {
      for (const kind of ["never", "half"]) {
        const what = kind === "never" ? "a request that is never answered" : "a response that stops after its headers";
        const other = await cdn();
        others.push(other);
        const r = await load(other, kind + ".css", kind + ".js");
        const problems = [];
        if (r.error) problems.push("the page did not load: " + r.error);
        else {
          if (!r.seen.dcl || r.seen.state !== "complete") problems.push("the page is not done: " + JSON.stringify(r.seen));
          if (r.failures.length) problems.push("counted as the site's own failure: " + r.failures.join("; "));
          [".css", ".js"].forEach(ext => { if (!r.thirdParty.some(t => t.indexOf(other.url + kind + ext) !== -1)) problems.push("no third-party warning for " + kind + ext + ": " + JSON.stringify(r.thirdParty)); });
        }
        /* both files are asked for at once, so one deadline covers the page */
        if (r.ms > limit + 4000) problems.push("took " + r.ms + " ms; the deadline for a third-party request is " + limit + " ms");
        report[problems.length ? "fail" : "pass"](what, problems.length ? problems.join("\n") : "page loaded in " + r.ms + " ms with " + r.thirdParty.length + " third-party warning(s) and no failure");
        if (kind !== "never") continue;
        const again = await load(other, "never-2.css", "never-2.js");
        const slow = again.error ? "the page did not load: " + again.error
          : again.ms > limit / 2 ? "took " + again.ms + " ms: the host was waited for again"
          : again.failures.length ? "counted as the site's own failure: " + again.failures.join("; ")
          : !again.thirdParty.length ? "no third-party warning" : "";
        report[slow ? "fail" : "pass"]("the same host asked again straight away", slow || "page loaded in " + again.ms + " ms, its requests refused without waiting; the host was asked " + JSON.stringify(other.hits));
      }
      {
        const other = await cdn();
        others.push(other);
        const a = await load(other, "ok.css", "ok.js"), b = await load(other, "ok.css", "ok.js");
        const problems = [];
        [a, b].forEach((r, i) => {
          if (r.error) problems.push("load " + (i + 1) + " did not finish: " + r.error);
          else if (r.seen.cdn !== 1 || r.seen.spacing !== "1px") problems.push("load " + (i + 1) + " did not get the files: " + JSON.stringify(r.seen));
          else if (r.failures.length || r.thirdParty.length) problems.push("load " + (i + 1) + " reported " + r.failures.concat(r.thirdParty).join("; "));
        });
        if (other.hits["/ok.css"] !== 1 || other.hits["/ok.js"] !== 1) problems.push("two pages asked for ok.css and ok.js; the server was asked " + JSON.stringify(other.hits));
        report[problems.length ? "fail" : "pass"]("a file that is there, on two pages", problems.length ? problems.join("\n") : "both pages got the stylesheet and the script; the server was asked for each once");
      }
    } finally { await Promise.all(others.map(o => o.close())); }

    /* h.newContext is what puts a context behind the deadline */
    const dir = path.join(ctx.root, "tools", "suites");
    const around = [];
    fs.readdirSync(dir).filter(f => /\.js$/.test(f)).forEach(f => {
      fs.readFileSync(path.join(dir, f), "utf8").split("\n").forEach((line, i) => {
        if (/ctx\.browser\.new(Context|Page)\s*\(/.test(line)) around.push("tools/suites/" + f + ":" + (i + 1));
      });
    });
    report[around.length ? "fail" : "pass"]("every suite opens its pages through the helpers", around.length ? "ctx.browser.newContext / newPage used directly (use h.newContext or h.newPage): " + around.join(", ") : undefined);
  }
};
