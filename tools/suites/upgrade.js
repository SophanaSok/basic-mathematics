"use strict";
/* A returning reader's saved state survives the site they come back to. The state in
   tools/fixtures/state-v1.json (what the last release before the build step writes) is
   put into localStorage on the served origin before any page loads, once; then the home
   page, the progress page and two chapters are opened in turn, in the same browser
   profile, and what is in storage afterwards is read back.

   The fixture must be CONTAINED in what comes back: every key it has is still there with
   the same value. Not equal to it, because the site writes on load: game.js backfills
   achievements and banks medals, the run store (this device's scratchpad) is refreshed,
   and so on. What may differ, and nothing else:
     - an object may have gained keys; a list may have gained items
     - the counts a page re-derives on every visit may have grown, never shrunk: a
       chapter's `total` in bm.progress.v1 and bm.play.v1, bm.lesson.v1 `reached`
     - bm.last, the place to continue from, once a chapter page has been opened: it then
       names that chapter (site.js sets it on every chapter visit)
   Beyond storage, the pages must show it: solved cards come back solved, the progress
   page lists the medals, the home page offers to continue where the reader was. */
const fs = require("fs");
const path = require("path");
const { track } = require("../lib/browser");

const FIXTURE = "tools/fixtures/state-v1.json";
/* numbers the site recounts from the page on each visit: allowed to grow */
const RECOUNTED = [/^bm\.progress\.v1\/[^/]+\/total$/, /^bm\.play\.v1\/[^/]+\/total$/, /^bm\.lesson\.v1\/reached\/[^/]+$/];

/* every way `want` is not contained in `got`, as messages */
function missing(want, got, where, out) {
  out = out || [];
  if (Array.isArray(want)) {
    if (!Array.isArray(got)) { out.push(where + ": was a list, now " + JSON.stringify(got)); return out; }
    const have = got.map(x => JSON.stringify(x));
    want.forEach(x => { if (!have.includes(JSON.stringify(x))) out.push(where + ": lost the item " + JSON.stringify(x)); });
    return out;
  }
  if (want && typeof want === "object") {
    if (!got || typeof got !== "object" || Array.isArray(got)) { out.push(where + ": was an object, now " + JSON.stringify(got)); return out; }
    Object.keys(want).forEach(k => {
      if (!Object.prototype.hasOwnProperty.call(got, k)) out.push(where + "/" + k + ": gone (was " + JSON.stringify(want[k]) + ")");
      else missing(want[k], got[k], where + "/" + k, out);
    });
    return out;
  }
  if (want === got) return out;
  if (typeof want === "number" && typeof got === "number" && got > want && RECOUNTED.some(re => re.test(where))) return out;
  out.push(where + ": was " + JSON.stringify(want) + ", now " + JSON.stringify(got));
  return out;
}

module.exports = {
  name: "upgrade",
  order: 36,
  description: "saved state from the last release (fixtures/state-v1.json) is kept and shown: home, progress, two chapters",
  missing,
  async run(ctx) {
    const { h, report, server } = ctx;
    const fixture = JSON.parse(fs.readFileSync(path.join(ctx.root, FIXTURE), "utf8")).storage;
    const C = ctx.curriculum;
    const chapters = Object.keys(fixture["bm.progress.v1"]).map(id => C.chapterById(id)).filter(Boolean);
    /* two chapters: one the fixture has cleared, one it has part done */
    const done = (ch) => { const p = fixture["bm.progress.v1"][ch.id]; return Object.keys(p.solved).length >= p.total; };
    const visits = ["index.html", "progress.html"].concat([chapters.filter(done).pop(), chapters.filter(ch => !done(ch))[0]].filter(Boolean).map(ch => ch.path));
    if (visits.length !== 4) { report.fail("fixture", FIXTURE + " must hold one cleared chapter and one part-done chapter"); return; }

    /* seeded through the context's storage state, on the origin the pages are then loaded
       from: there before the first script runs, and never written again by the test.
       The system colour scheme is set against the saved theme, so only the saved choice
       can produce the theme the pages are then checked for. */
    const context = await h.newContext({
      viewport: h.VIEWPORTS[1280], colorScheme: fixture["bm.theme"] === "dark" ? "light" : "dark", deviceScaleFactor: 1, serviceWorkers: "block",
      storageState: { cookies: [], origins: [{ origin: server.url.replace(/\/$/, ""), localStorage: Object.keys(fixture).map(k => ({ name: k, value: JSON.stringify(fixture[k]) })) }] }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = track(page, server.url);
    const stored = () => page.evaluate(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        try { out[k] = JSON.parse(localStorage.getItem(k)); } catch (e) { out[k] = "(not JSON) " + localStorage.getItem(k); }
      }
      return out;
    });
    let openedChapter = null, state = null;
    try {
      for (const rel of visits) {
        errors.reset();
        await h.open(page, rel);
        state = await stored();
        const chapter = C.chapters.filter(ch => ch.path === rel)[0] || null;
        if (chapter) openedChapter = chapter;
        const want = Object.assign({}, fixture);
        const problems = [];
        if (openedChapter) {
          delete want["bm.last"];
          const last = state["bm.last"];
          if (!last || last.id !== openedChapter.id) problems.push("bm.last: should name " + openedChapter.id + " after its page was opened, is " + JSON.stringify(last));
        }
        Object.keys(want).forEach(k => {
          if (!Object.prototype.hasOwnProperty.call(state, k)) problems.push(k + ": gone from storage");
          else missing(want[k], state[k], k, problems);
        });

        /* and the page shows it */
        const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
        if (theme !== fixture["bm.theme"]) problems.push("theme: html[data-theme] is " + JSON.stringify(theme) + ", saved " + JSON.stringify(fixture["bm.theme"]));
        if (rel === "index.html") {
          const lastCh = C.chapterById(fixture["bm.last"].id);
          const go = await page.evaluate(() => { const a = document.querySelector("[data-continue]"); return a ? { href: a.getAttribute("href"), text: a.textContent } : null; });
          if (!go || go.href.indexOf(lastCh.path) !== 0 || !/^Continue/.test(go.text)) problems.push("home: the Continue button should lead to " + lastCh.path + ", is " + JSON.stringify(go));
        }
        if (rel === "progress.html") {
          const shown = await page.evaluate(() => {
            const medals = {};
            document.querySelectorAll("tr").forEach(tr => {
              const a = tr.querySelector("td a[href]"), m = tr.querySelector("td.cell-medal");
              if (a && m) medals[a.getAttribute("href")] = m.getAttribute("data-medal") || "";
            });
            return { medals, xp: window.BMActivity.total(), earned: Object.keys(window.BMGame.game().ach).length };
          });
          const xp = Object.keys(fixture["bm.activity.v1"].days).reduce((n, d) => n + fixture["bm.activity.v1"].days[d], 0);
          if (shown.xp !== xp) problems.push("progress: " + shown.xp + " XP in all, saved " + xp);
          Object.keys(fixture["bm.game.v1"].enc).forEach(id => {
            const ch = C.chapterById(id.split("/")[0]);
            if (!ch || id.split("/")[1] !== "practice") return;
            const want = String(fixture["bm.game.v1"].enc[id].medal);
            if (shown.medals[ch.path] !== want) problems.push("progress: " + ch.id + " shows medal " + JSON.stringify(shown.medals[ch.path]) + ", saved " + want);
          });
          if (shown.earned < Object.keys(fixture["bm.game.v1"].ach).length) problems.push("progress: " + shown.earned + " achievements, saved " + Object.keys(fixture["bm.game.v1"].ach).length);
        }
        if (chapter) {
          const solved = fixture["bm.progress.v1"][chapter.id].solved;
          const cards = await page.evaluate(() => {
            const out = {};
            document.querySelectorAll(".ex[data-key]:not([data-inline])").forEach(el => { out[el.getAttribute("data-key")] = { state: el.getAttribute("data-state"), restored: el.getAttribute("data-restored") === "true" }; });
            return out;
          });
          Object.keys(solved).forEach(k => {
            if (!cards[k]) problems.push(chapter.id + ": no card for the solved exercise " + k);
            else if (cards[k].state !== "correct" || !cards[k].restored) problems.push(chapter.id + ": " + k + " was solved, its card shows " + JSON.stringify(cards[k]));
          });
          Object.keys(cards).forEach(k => { if (!solved[k] && cards[k].state === "correct") problems.push(chapter.id + ": " + k + " shows as solved, and was not"); });
          const score = await page.evaluate(() => { const el = document.querySelector("[data-practice-score]"); return el ? el.textContent.replace(/\s+/g, " ").trim() : null; });
          const n = Object.keys(solved).length;
          if (score !== null && score.indexOf(n + " of ") !== 0) problems.push(chapter.id + ": the score line reads " + JSON.stringify(score) + ", " + n + " were solved");
        }
        problems.push(...errors.failures());
        report[problems.length ? "fail" : "pass"](rel, problems.length ? problems.join("\n") : "the saved state is all there after loading" + (chapter ? "; " + Object.keys(fixture["bm.progress.v1"][chapter.id].solved).length + " solved cards shown solved" : ""));
      }
      /* what loading did add, for the record: a release that stops backfilling shows up here */
      const g0 = fixture["bm.game.v1"], g1 = state["bm.game.v1"] || {};
      const added = (a, b) => Object.keys(b || {}).filter(k => !Object.prototype.hasOwnProperty.call(a || {}, k));
      report.pass("grown on load", "achievements +" + JSON.stringify(added(g0.ach, g1.ach)) + ", medals banked +" + JSON.stringify(added(g0.enc, g1.enc)));
    } catch (e) { report.fail("upgrade", "driver error: " + (e && e.stack || e)); }
    finally { await context.close(); }
  }
};
