"use strict";
/* The placement check as it is taken in the browser (diagnostic.html, src/ui/diagnostic.ts),
   the D-9 cases of ~/.claude/plans/diagnostic-design.md §12.3 and the browser lines of the
   D-9 threat model:
     - the walks: "Algebra 2 or higher" all right (band algebra-2, `all`, 8 items), "Algebra 1"
       all right (band geometry, no `all`: the hold), rushed (typed answers with no clock
       moved: rushed, not seeded, bm.game.v1.sec untouched), "Not sure" and all skips (Pre-algebra
       after 4 items);
     - Start with no choice, empty and unreadable submits, a second tab's combo write ignored and
       its diag write adopted, reload mid-block, start over, completion (no typed text, no
       timings, boxes seeded, run cleared), no attempt events, storage that will not save, no
       supabase chunk signed out, no overflow at 360, axe in every state;
     - the threats: two tabs finishing one run (A1), a take write that fails (A2), no generators
       (B2), markup and template strings typed (C1), a hostile ?again (C2), ?again and the
       return stub (D1), the signed-in wait (D2), a take written in another tab mid-run (D3),
       the run cleared in another tab (E1);
     - D-13: the result's words and the answer list after a reload, the return view and Prep,
       the gate after it opened (and a reset in this tab mid-run, a draw that throws after the
       gate), the signed-in gate (?again, `off`, status `error`, createClient
       throwing, no takes, a pull after the 8 s wait) and hostile takes in the return view. The
       plan on the progress page is the plan suite (tools/suites/plan.js).
   Determinism: a run is pre-written to bm.run.v1.diag with page.evaluate and the page loaded
   again (not newPage's storage option, which is an init script that every tab of the context
   would run again, writing the seed back), and the answers are BMGen.make(g, s).answer, so
   production code has no test hook. Where answers take their par (so the check is not
   rushed), Playwright's clock is installed before the reload and moved on by par before each
   Submit. The signed-in cases put a small stand-in for supabase-js on window.supabase (the
   seam assets/account.js keeps, as tools/game/account.test.js does); nothing leaves the
   machine. Every tab has a pageerror listener, and an uncaught error fails its case. */
const { track } = require("../lib/browser");

const PAGE = "diagnostic.html";
const START = { none: "pre-algebra", pre: "algebra-1", a1: "geometry", geo: "algebra-2", a2: "algebra-2", unsure: "pre-algebra" };
const RUN_KEY = "bm.run.v1", DIAG_KEY = "bm.diag.v1", GAME_KEY = "bm.game.v1";

const SAVED = "Your place is saved. You can stop any time.";
const UNSAVED = "This browser isn't saving right now, so finish in one sitting.";
const TAKE_UNSAVED = "This browser isn't saving right now, so this result may not be kept.";
/* the return view (D-10b): its own section, with "Take it again" to the Prep page */
const RETURN_LINK = '#diag-return a[href="prep.html#diagnostic"]';
const CHECKING = "Checking your saved results…";
const NO_ACCOUNT = "We couldn't reach your account just now, so this uses what this browser has saved.";
const MOVED = "This check continued in another tab.";
const CHANGED_TAB = "The saved check changed in another tab.";
const CHANGED = "The saved check changed.";
const EMPTY = "Type an answer, then press Submit.";
const ALL_LINE = "You did well on every course we asked about. Your plan starts with review and then the chapters that go further.";
const RUSHED_LINE = "Some answers came very fast. If any were guesses, this suggestion may be too low. Your review schedule wasn't changed.";
const PRE_LINE = "Start with Pre-algebra. This course begins with algebra, so your plan starts with the pre-algebra sections it covers, and the skill packs when they're ready.";
const SKIM_LINE = "Looked solid on what we asked. You can skim the parts we asked about when you get there.";
const HELD_LINE = "Start here. Your answers on coordinates, lines, circles and sets looked solid (4 right, 0 not yet). Begin with the parts this check didn't ask about.";
const GEOMETRY_LINE = "Geometry here meant coordinates, lines, circles and sets. If you haven't studied proofs or transformations, the Geometry chapters are still worth working through.";

/* a stand-in for supabase-js: no network; a session if window.__sdk.session is set; a stored
   row for the account if window.__sdk.row is set; a getSession that never answers if
   window.__sdk.never is set; every query (not getSession, so the session still resolves and the
   pull is what fails) answering with an error if window.__sdk.fail is set;
   createClient throwing if window.__sdk.boom is set; every query held until window.__release()
   is called if window.__sdk.hold is set (a pull that comes late) */
const SDK = function () {
  const cfg = new Proxy({}, { get: (_, k) => (window.__sdk || {})[k] });
  const answer = (data) => (cfg.fail ? { data: null, error: { message: "stand-in failure", code: "X0000" } } : { data, error: null });
  let release;
  const gate = new Promise((r) => { release = r; });
  window.__release = () => release();
  window.supabase = {
    createClient() {
      if (cfg.boom) throw new Error("stand-in createClient failure");
      return {
        from() {
          let write = false;
          const api = {
            select() { return api; }, eq() { return api; }, maybeSingle() { return api; },
            insert() { write = true; return api; }, update() { write = true; return api; }, upsert() { write = true; return api; },
            then(ok, bad) { return (cfg.hold ? gate : Promise.resolve()).then(() => answer(write ? [{ updated_at: new Date().toISOString() }] : cfg.row || null)).then(ok, bad); }
          };
          return api;
        },
        rpc() { return Promise.resolve(answer(null)); },
        auth: {
          onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
          getSession() { return cfg.never ? new Promise(() => {}) : Promise.resolve({ data: { session: cfg.session || null }, error: null }); },
          signOut() { return Promise.resolve({ error: null }); }
        }
      };
    }
  };
};
const PIN = function (seed) {
  const pinned = { supabaseUrl: "https://testref.supabase.co", supabaseAnonKey: "sb_publishable_test", providers: [], emailDelivery: false };
  Object.defineProperty(window, "BM_CONFIG", { get: () => pinned, set: () => {}, configurable: false });
  window.__sdk = seed;
  if (seed.session || seed.token) localStorage.setItem("sb-testref-auth-token", "{}");
};

module.exports = {
  name: "diagnostic",
  order: 48,
  description: "the placement check in the browser: the four walks, what they store and the words of each result, Start with no choice, empty and unreadable answers, two tabs, reload and start over, completion, no attempt events, storage that will not save, the signed-in wait and gate, ?again, the return view and Prep, hostile input and hostile takes, 360 px, axe in every state",
  async run(ctx) {
    const { h, report, server } = ctx;

    /* ---------------------------------------------------------------- tools -- */

    /* one case: a page in a context of its own (and every tab it opens), the problems the
       body returns, and every uncaught error on any of its tabs */
    async function kase(label, o, body) {
      const started = await h.newPage(o || {});
      const { context, page, errors } = started;
      const tabs = [errors];
      const problems = [];
      context.on("page", (p) => { if (p !== page) tabs.push(track(p, server.url)); });
      try {
        const out = await body(page, context, errors, tabs);
        if (Array.isArray(out)) problems.push(...out);
      } catch (e) {
        problems.push("threw: " + (e && e.message || e));
      }
      tabs.forEach((t, i) => t.pageErrors.forEach((m) => problems.push("pageerror on tab " + i + ": " + m)));
      await started.close();
      report[problems.length ? "fail" : "pass"](label, problems.length ? problems.join("\n") : undefined);
    }
    const check = (problems, cond, what) => { if (!cond) problems.push(what); };

    const shown = (page, id) => page.evaluate((id) => { const el = document.getElementById(id); return !!el && !el.hidden; }, id);
    const textOf = (page, id) => page.evaluate((id) => { const el = document.getElementById(id); return el ? el.textContent : null; }, id);
    const open = (page, rel) => h.open(page, PAGE + (rel || ""));
    const raw = (page, key) => page.evaluate((key) => localStorage.getItem(key), key);
    const takes = (page) => page.evaluate((key) => {
      try { const d = JSON.parse(localStorage.getItem(key)); return d && d.takes ? Object.values(d.takes) : []; } catch (e) { return []; }
    }, DIAG_KEY);
    const runNow = (page) => page.evaluate((key) => {
      try { return JSON.parse(localStorage.getItem(key)).diag || null; } catch (e) { return null; }
    }, RUN_KEY);
    const secOf = (page) => page.evaluate((key) => {
      try { return JSON.stringify(JSON.parse(localStorage.getItem(key) || "{}").sec || null); } catch (e) { return "bad"; }
    }, GAME_KEY);

    /* write a run into bm.run.v1.diag (the rest of the key kept), as a visit would have */
    function plant(page, from, extra) {
      return page.evaluate(({ from, start, extra }) => {
        let all = {};
        try { all = JSON.parse(localStorage.getItem("bm.run.v1")) || {}; } catch (e) { all = {}; }
        all.diag = Object.assign({ id: "t" + Math.random().toString(36).slice(2, 10), seed: 1000 + Math.floor(Math.random() * 100000), from, start, blueprint: 1, began: window.BMSite.dayKey(), blocks: [], pending: { u: 0 } }, extra || {});
        localStorage.setItem("bm.run.v1", JSON.stringify(all));
      }, { from, start: START[from], extra });
    }
    function plantTake(page, id) {
      return page.evaluate(({ id }) => {
        let d = {};
        try { d = JSON.parse(localStorage.getItem("bm.diag.v1")) || {}; } catch (e) { d = {}; }
        d.takes = Object.assign({}, d.takes);
        d.takes[id] = { v: 1, day: window.BMSite.dayKey(), from: "pre", start: "algebra-1", band: "algebra-1", blueprint: 1, grader: 3, seed: 7, blocks: [], seeded: true };
        localStorage.setItem("bm.diag.v1", JSON.stringify(d));
      }, { id });
    }
    const reload = async (page) => { await page.reload({ waitUntil: "load" }); await h.settle(page); };

    /* a take written by hand: the forms are the (generator, section) pairs of
       src/learn/diagnostic.ts FORMS, the pass marks DIAG_PASS. The page reads it as it would a
       take that came from the account, so it is written as stored text, `__proto__` keys and all */
    const FORMS = {
      "pre-algebra": [["tri-angle", "ch05#parallels"], ["frac-sum", "ch01#rationals"], ["lin-brackets", "ch02#one-unknown"], ["flat-area", "ch07#polygons"], ["frac-divide", "ch01#inverses"], ["pyth-side", "ch05#pythagoras"], ["word-two", "ch02#word-problems"], ["slope-two", "ch10#line-equation"]],
      "algebra-1": [["poly-eval", "ch12#definition-fn"], ["ineq-flip", "ch03#order"], ["abs-solve", "ch03#absolute"], ["pow-frac", "ch03#powers"], ["quad-square", "ch04#square-roots"], ["vertex-x", "ch04#graph"], ["exp-solve", "ch12#exponential"], ["quad-roots", "ch04#formula"]],
      "geometry": [["perp-slope", "ch10#lines"], ["point-sum", "ch09#addition-points"], ["seg-point", "ch10#segments"], ["circle-read", "ch08#circle"], ["set-ops", "interlude#sets"], ["point-sum", "ch09#addition-points"]],
      "algebra-2": [["log-int", "ch12#log"], ["deg-rad", "ch11#radians"], ["remainder", "ch12#polynomials"], ["cx-mult", "ch14#complex-arith"], ["sum-range", "ch15#summations"], ["geo-finite", "ch15#geometric"]]
    };
    const PASS = { "pre-algebra": 5, "algebra-1": 5, "geometry": 4, "algebra-2": 4 };
    /* a block of answers: kinds in order, `pass` as the walk would have scored it */
    const blockOf = (course, kinds) => ({
      course,
      pass: kinds.filter((k) => k === "right").length >= PASS[course],
      items: kinds.map((k, i) => { const f = FORMS[course][i % FORMS[course].length]; return { g: f[0], s: 101 + i, sec: f[1], k }; })
    });
    const rights = (n, rest) => Array.from({ length: n }, () => "right").concat(rest || []);
    const takeOf = (o) => Object.assign({ v: 1, day: "2026-10-07", from: "pre", start: "algebra-1", band: "algebra-1", blueprint: 1, grader: 3, seed: 7, blocks: [blockOf("algebra-1", rights(5))], seeded: true }, o || {});
    /* bm.diag.v1 written as this text (the store replaced, no event in this tab) */
    const putText = (page, text) => page.evaluate((text) => localStorage.setItem("bm.diag.v1", text), text);
    const putDiag = (page, takesById) => putText(page, JSON.stringify({ takes: takesById }));
    /* a copy of the take JSON with its own "__proto__" key, which an object literal cannot hold */
    const protoStore = (hostile, others) => '{"takes":{"__proto__":' + JSON.stringify(hostile) + "," + Object.keys(others).map((k) => JSON.stringify(k) + ":" + JSON.stringify(others[k])).join(",") + "}}";

    /* what the page shows of a result or a return view: the lines, the rows, the headline */
    const mainText = (page) => page.evaluate(() => document.querySelector("main").textContent);
    const paragraphs = (page, scope) => page.evaluate((scope) => Array.from(document.querySelectorAll("#" + scope + " > p")).map((el) => el.textContent), scope);
    const rowsOf = (page, scope) => page.evaluate((scope) => {
      const out = {};
      Array.from(document.querySelectorAll("#" + scope + " > table.diag-table tbody tr")).forEach((tr) => { out[tr.cells[0].textContent] = tr.cells[1].textContent; });
      return out;
    }, scope);
    const headOf = (page, scope) => page.evaluate((scope) => { const h = document.querySelector("#" + scope + " > h2"); return h ? h.textContent : null; }, scope);
    /* nothing a stored string could make: no image, no handler run, no markup of it in the page */
    const injected = (page) => page.evaluate(() => ({
      imgs: document.querySelectorAll("main img").length,
      pwned: !!window.__pwned,
      markup: document.querySelector("main").innerHTML.includes("onerror"),
      proto: ({}).band !== undefined || ({}).blocks !== undefined
    }));

    /* An "ignored" check without a fixed wait. Storage events reach a tab in the order they were
       written, and the page's own listener runs before this probe (added later), so once the
       probe has seen a sentinel written after the write under test, the page has already
       decided about that write. The probe is installed once per tab. */
    async function listen(page) {
      await page.evaluate(() => {
        if (window.__heard) return;
        window.__heard = [];
        window.addEventListener("storage", (e) => window.__heard.push(e.key + "=" + e.newValue));
      });
    }
    let sentinels = 0;
    async function settleEvents(page, writer) {
      const mark = "s" + (++sentinels);
      await writer.evaluate((mark) => localStorage.setItem("t.sentinel", mark), mark);
      await page.waitForFunction((mark) => (window.__heard || []).includes("t.sentinel=" + mark), mark);
    }

    /* on the diagnostic page with a run planted, resumed and the first question open */
    async function begin(page, from, o) {
      o = o || {};
      await open(page);
      await plant(page, from);
      if (o.clock) await page.clock.install();
      await reload(page);
      await page.waitForFunction(() => !document.getElementById("diag-resume").hidden);
      await page.locator("#diag-keep").click();
      await page.waitForFunction(() => !document.getElementById("diag-question").hidden);
    }

    /* the open question of the stored run, with the answer the generator gives for it */
    const openItem = (page) => page.evaluate(() => {
      let d = null;
      try { d = JSON.parse(localStorage.getItem("bm.run.v1")).diag; } catch (e) { return null; }
      if (!d || !d.blocks.length) return null;
      const b = d.blocks[d.blocks.length - 1];
      const it = b.items.find((i) => i.k === undefined);
      if (!it) return null;
      const p = window.BMGen.make(it.g, it.s);
      return { g: it.g, s: it.s, typed: String(p.answer).split("|")[0], par: p.par };
    });

    /* answer until the screen says done. decide(n, item) is "right" or "skip"; `fast` moves
       the installed clock on by the question's par before each Submit */
    async function walk(page, decide, o) {
      o = o || {};
      const asked = [];
      for (let n = 0; n < 40; n++) {
        if (await shown(page, "diag-done")) return asked;
        const it = o.blind ? { g: "", s: 0, typed: "", par: 0 } : await openItem(page);
        if (!it) throw new Error("no open question in the stored run at step " + n);
        const head = await textOf(page, "diag-q-head");
        const act = decide(n, it);
        asked.push(act);
        if (act === "skip") await page.locator("#diag-skip").click();
        else {
          if (o.fast) await page.clock.fastForward(it.par * 1000);
          await page.locator("#diag-input").fill(it.typed);
          await page.locator("#diag-answer button[type=submit]").click();
        }
        await page.waitForFunction((head) => !document.getElementById("diag-done").hidden || document.getElementById("diag-q-head").textContent !== head, head);
      }
      throw new Error("the check did not finish in 40 answers");
    }
    const right = () => "right";
    const skip = () => "skip";

    const sizeOf = (take) => take.blocks.reduce((n, b) => n + b.items.length, 0);

    /* ------------------------------------------------------------- the walks -- */

    await kase("walk: Algebra 2 or higher, all right, at par: band algebra-2 with `all`, 8 items, seeded, run cleared, no typed text", {}, async (page) => {
      const p = [];
      await begin(page, "a2", { clock: true });
      await page.evaluate(() => { window.__attempts = 0; window.BMStore.on((c) => { if (c && c.type === "attempt") window.__attempts++; }); });
      const before = await secOf(page);
      const asked = await walk(page, right, { fast: true });
      const list = await takes(page);
      check(p, list.length === 1, "expected 1 take, got " + list.length);
      const t = list[0] || {};
      check(p, t.band === "algebra-2", "band " + t.band);
      check(p, t.all === true, "`all` missing");
      check(p, asked.length === 8 && sizeOf(t) === 8, "asked " + asked.length + ", stored " + sizeOf(t));
      check(p, t.seeded === true && t.rushed === undefined, "seeded " + t.seeded + ", rushed " + t.rushed);
      const stored = JSON.stringify(list);
      check(p, !/"secs"|"u":|"r":/.test(stored), "a timing, unread count or reason is in the take: " + stored.slice(0, 200));
      check(p, t.blocks.every((b) => b.items.every((i) => Object.keys(i).sort().join() === "g,k,s,sec")), "an item has more than g, s, sec and k");
      check(p, (await runNow(page)) === null, "bm.run.v1.diag was not cleared");
      const after = await secOf(page);
      check(p, after !== before && after !== "null", "the review boxes were not seeded: " + before + " -> " + after);
      check(p, (await page.evaluate(() => window.__attempts)) === 0, "attempt events were emitted");
      check(p, await shown(page, "diag-done"), "the done screen is not showing");
      /* the result's words: the headline, the `all` line, the implied rows, the plan */
      check(p, (await headOf(page, "diag-result")) === "Start with: Algebra 2", "headline: " + (await headOf(page, "diag-result")));
      const lines = await paragraphs(page, "diag-result");
      check(p, lines.includes(ALL_LINE), "the `all` line is missing: " + JSON.stringify(lines));
      check(p, lines.includes(GEOMETRY_LINE), "the Geometry line is missing (Geometry was cleared and not held): " + JSON.stringify(lines));
      check(p, !lines.includes(PRE_LINE) && !lines.includes(RUSHED_LINE), "a line that belongs to another result: " + JSON.stringify(lines));
      const rows = await rowsOf(page, "diag-result");
      check(p, rows["Algebra 2"] === "Looked solid on what we asked. 4 right, 0 not yet.", "Algebra 2 row: " + rows["Algebra 2"]);
      check(p, rows["Geometry"] === "Looked solid on what we asked. 4 right, 0 not yet.", "Geometry row: " + rows["Geometry"]);
      ["Pre-algebra", "Algebra 1"].forEach((c) => check(p, /^Not asked\. Because you did well in (Geometry|Algebra 2), we skipped it\. Skim it if it looks familiar\.$/.test(rows[c] || ""), c + " row: " + rows[c]));
      const plan = await page.evaluate(() => ({
        heads: Array.from(document.querySelectorAll("#diag-result #diag-plan h4")).map((h) => h.textContent),
        link: (document.querySelector("#diag-result #diag-plan a") || {}).getAttribute ? document.querySelector("#diag-result #diag-plan a").getAttribute("href") : null,
        h3: (document.querySelector("#diag-result #diag-plan > h3") || {}).textContent
      }));
      check(p, plan.h3 === "Your plan" && plan.heads.includes("Start here"), "the plan on the result: " + JSON.stringify(plan));
      check(p, !!plan.link && /^parts\/[^#]+#.+/.test(plan.link), "the Start here link is not an address into parts/: " + plan.link);
      return p;
    });

    await kase("walk: Algebra 1, all right: band geometry and no `all` (the hold)", {}, async (page) => {
      const p = [];
      await begin(page, "a1", { clock: true });
      await walk(page, right, { fast: true });
      const t = (await takes(page))[0] || {};
      check(p, t.band === "geometry", "band " + t.band);
      check(p, t.all === undefined, "`all` set: " + t.all);
      check(p, t.blocks && t.blocks.map((b) => b.course).join() === "geometry,algebra-2", "blocks " + JSON.stringify((t.blocks || []).map((b) => b.course)));
      /* the hold: Geometry's row says where to start, Algebra 2's is the skim line, and the
         line for a Geometry that was not held stays off the page */
      check(p, (await headOf(page, "diag-result")) === "Start with: Geometry", "headline: " + (await headOf(page, "diag-result")));
      const rows = await rowsOf(page, "diag-result");
      check(p, rows["Geometry"] === HELD_LINE, "Geometry row: " + rows["Geometry"]);
      check(p, rows["Algebra 2"] === SKIM_LINE, "Algebra 2 row: " + rows["Algebra 2"]);
      const lines = await paragraphs(page, "diag-result");
      check(p, !lines.includes(GEOMETRY_LINE) && !lines.includes(ALL_LINE), "a line that belongs to another result: " + JSON.stringify(lines));
      return p;
    });

    await kase("walk: rushed (typed answers, clock not moved): rushed, not seeded, bm.game.v1.sec unchanged", {}, async (page) => {
      const p = [];
      await begin(page, "a2");
      const before = await secOf(page);
      await walk(page, right);
      const t = (await takes(page))[0] || {};
      check(p, t.rushed === true && t.seeded === false, "rushed " + t.rushed + ", seeded " + t.seeded);
      check(p, t.band === "algebra-2", "band " + t.band);
      const after = await secOf(page);
      check(p, after === before, "bm.game.v1.sec changed: " + before + " -> " + after);
      check(p, (await paragraphs(page, "diag-result")).includes(RUSHED_LINE), "the rushed note is missing: " + JSON.stringify(await paragraphs(page, "diag-result")));
      return p;
    });

    await kase("walk: Not sure and every answer skipped: Pre-algebra after 4 items", {}, async (page) => {
      const p = [];
      await begin(page, "unsure");
      const asked = await walk(page, skip);
      const t = (await takes(page))[0] || {};
      check(p, asked.length === 4 && sizeOf(t) === 4, "asked " + asked.length + ", stored " + sizeOf(t));
      check(p, t.band === "pre-algebra", "band " + t.band);
      const lines = await paragraphs(page, "diag-result");
      check(p, lines.includes(PRE_LINE), "the Pre-algebra line is missing: " + JSON.stringify(lines));
      check(p, !lines.includes(ALL_LINE) && !lines.includes(RUSHED_LINE), "a line that belongs to another result: " + JSON.stringify(lines));
      return p;
    });

    /* --------------------------------------------------------------- the intro -- */

    await kase("Start with no choice: enabled, \"Choose one answer to start.\", focus on the first radio, no run written", {}, async (page) => {
      const p = [];
      await open(page);
      const disabled = await page.evaluate(() => document.querySelector("#diag-start button[type=submit]").disabled);
      check(p, disabled === false, "Start is disabled");
      await page.locator("#diag-start button[type=submit]").click();
      check(p, (await textOf(page, "diag-intro-status")) === "Choose one answer to start.", "status: " + (await textOf(page, "diag-intro-status")));
      const onFirst = await page.evaluate(() => document.activeElement === document.querySelector('#diag-from input[name="from"]'));
      check(p, onFirst, "focus is not on the first radio");
      check(p, (await runNow(page)) === null, "a run was written");
      check(p, await shown(page, "diag-intro"), "the intro went away");
      return p;
    });

    await kase("empty submit three times does not advance or write; an unreadable answer shows its message and the question stays", {}, async (page) => {
      const p = [];
      await begin(page, "a2");
      const q = await textOf(page, "diag-prompt");
      for (let i = 0; i < 3; i++) {
        await page.locator("#diag-answer button[type=submit]").click();
        await page.waitForFunction(() => document.getElementById("diag-unread").textContent.length > 0);
        check(p, (await textOf(page, "diag-unread")).startsWith(EMPTY), "empty line: " + (await textOf(page, "diag-unread")));
        check(p, (await textOf(page, "diag-q-head")) === "Question 1", "advanced after empty submit " + (i + 1));
      }
      let d = await runNow(page);
      check(p, d.blocks.every((b) => b.items.every((i) => i.k === undefined)) && d.pending.u === 0, "the run recorded something: " + JSON.stringify(d.pending));
      await page.locator("#diag-input").fill("I do not know");
      await page.locator("#diag-answer button[type=submit]").click();
      await page.waitForFunction((start) => { const t = document.getElementById("diag-unread").textContent; return t.length > 0 && !t.startsWith(start); }, EMPTY);
      check(p, (await textOf(page, "diag-q-head")) === "Question 1", "an unreadable answer advanced the check");
      check(p, (await textOf(page, "diag-prompt")) === q, "the question changed");
      d = await runNow(page);
      check(p, d.pending.u === 1 && d.blocks.every((b) => b.items.every((i) => i.k === undefined)), "pending " + JSON.stringify(d.pending));
      return p;
    });

    /* ----------------------------------------------------------------- tabs -- */

    await kase("second tab: a combo write is ignored, a diag write is adopted with \"This check continued in another tab\"", {}, async (page, context) => {
      const p = [];
      await begin(page, "a2");
      const q = await textOf(page, "diag-prompt");
      const other = await context.newPage();
      await other.goto(server.url + PAGE, { waitUntil: "load" });
      await h.settle(other);
      await listen(page);
      await other.evaluate(() => {
        const all = JSON.parse(localStorage.getItem("bm.run.v1"));
        all.combo = { pips: 2 };
        localStorage.setItem("bm.run.v1", JSON.stringify(all));
      });
      await settleEvents(page, other);
      check(p, (await page.evaluate(() => window.__heard.some((e) => e.startsWith("bm.run.v1=")))), "the page did not hear the combo write");
      check(p, (await shown(page, "diag-question")) && (await textOf(page, "diag-prompt")) === q, "the combo write moved the open question");
      check(p, (await textOf(page, "diag-notice")) === "", "notice after a combo write: " + (await textOf(page, "diag-notice")));
      await plant(other, "a1");
      await page.waitForFunction(() => document.getElementById("diag-notice").textContent.length > 0);
      check(p, (await textOf(page, "diag-notice")) === MOVED, "notice: " + (await textOf(page, "diag-notice")));
      check(p, (await textOf(page, "diag-prompt")) !== q, "the question did not change to the other tab's run");
      const d = await runNow(page);
      check(p, d && d.from === "a1" && d.blocks.length === 1 && d.blocks[0].course === "geometry", "the run is not the other tab's: " + JSON.stringify(d && d.from));
      return p;
    });

    await kase("E1: another tab clears bm.run.v1: the intro, \"The saved check changed in another tab.\"", {}, async (page, context) => {
      const p = [];
      await begin(page, "a2");
      const other = await context.newPage();
      await other.goto(server.url + PAGE, { waitUntil: "load" });
      await h.settle(other);
      await other.evaluate(() => localStorage.removeItem("bm.run.v1"));
      await page.waitForFunction(() => !document.getElementById("diag-intro").hidden);
      check(p, (await textOf(page, "diag-notice")) === CHANGED_TAB, "notice: " + (await textOf(page, "diag-notice")));
      check(p, !(await shown(page, "diag-question")), "the question is still showing");
      return p;
    });

    await kase("D3: a take written in another tab mid-run is ignored; finishing gives 2 takes", {}, async (page, context) => {
      const p = [];
      await begin(page, "unsure");
      await page.locator("#diag-skip").click();
      await page.waitForFunction(() => document.getElementById("diag-q-head").textContent === "Question 2");
      const other = await context.newPage();
      await other.goto(server.url + PAGE, { waitUntil: "load" });
      await h.settle(other);
      await listen(page);
      await plantTake(other, "othertab1");
      await settleEvents(page, other);
      check(p, (await page.evaluate(() => window.__heard.some((e) => e.startsWith("bm.diag.v1=")))), "the page did not hear the take write");
      check(p, (await textOf(page, "diag-q-head")) === "Question 2" && (await shown(page, "diag-question")), "the question moved");
      await walk(page, skip);
      const n = (await takes(page)).length;
      check(p, n === 2, "expected 2 takes, got " + n);
      return p;
    });

    await kase("A1: two tabs finish the same run: exactly one take", {}, async (page, context) => {
      const p = [];
      await begin(page, "unsure");
      for (let i = 0; i < 3; i++) {
        const head = await textOf(page, "diag-q-head");
        await page.locator("#diag-skip").click();
        await page.waitForFunction((head) => document.getElementById("diag-q-head").textContent !== head, head);
      }
      const other = await context.newPage();
      /* this tab does not hear storage events, as a tab asleep in the background does not */
      await other.addInitScript(() => {
        const add = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type) { if (type === "storage") return; return add.apply(this, arguments); };
      });
      await other.goto(server.url + PAGE, { waitUntil: "load" });
      await h.settle(other);
      await other.waitForFunction(() => !document.getElementById("diag-resume").hidden);
      await other.locator("#diag-keep").click();
      await other.waitForFunction(() => !document.getElementById("diag-question").hidden);
      await page.locator("#diag-skip").click();
      await page.waitForFunction(() => !document.getElementById("diag-done").hidden);
      /* markers in the stored take and in the game record: a second write of either would lose
         or change them, so the guard is what keeps the bytes the same */
      await page.evaluate(() => {
        const d = JSON.parse(localStorage.getItem("bm.diag.v1"));
        Object.values(d.takes).forEach((t) => { t.marker = "kept"; });
        localStorage.setItem("bm.diag.v1", JSON.stringify(d));
        const g = JSON.parse(localStorage.getItem("bm.game.v1") || "{}");
        g.marker = "kept";
        localStorage.setItem("bm.game.v1", JSON.stringify(g));
      });
      const diag0 = await raw(page, DIAG_KEY), game0 = await raw(page, GAME_KEY);
      await other.locator("#diag-skip").click();
      await other.waitForFunction(() => !document.getElementById("diag-done").hidden);
      check(p, (await raw(page, DIAG_KEY)) === diag0, "bm.diag.v1 changed when the deaf tab finished: " + diag0 + " -> " + (await raw(page, DIAG_KEY)));
      check(p, (await raw(page, GAME_KEY)) === game0, "bm.game.v1 changed when the deaf tab finished");
      check(p, diag0.includes('"marker":"kept"'), "the marker is not in the take");
      const n = (await takes(page)).length;
      check(p, n === 1, "expected 1 take, got " + n);
      check(p, (await runNow(page)) === null, "the run was not cleared");
      return p;
    });

    /* ---------------------------------------------------------- reload, over -- */

    await kase("reload mid-block resumes the same question text; Start over deals new text", {}, async (page) => {
      const p = [];
      await begin(page, "a2");
      await page.locator("#diag-skip").click();
      await page.waitForFunction(() => document.getElementById("diag-q-head").textContent === "Question 2");
      const q2 = await textOf(page, "diag-prompt");
      const before = await runNow(page);
      const seed = before.seed;
      await reload(page);
      await page.waitForFunction(() => !document.getElementById("diag-resume").hidden);
      check(p, /answered 1 question\./.test(await textOf(page, "diag-resume-line")), "resume line: " + (await textOf(page, "diag-resume-line")));
      await page.locator("#diag-keep").click();
      await page.waitForFunction(() => !document.getElementById("diag-question").hidden);
      check(p, (await textOf(page, "diag-prompt")) === q2, "the question changed on reload");
      await reload(page);
      await page.locator("#diag-over").click();
      await page.waitForFunction(() => !document.getElementById("diag-intro").hidden);
      check(p, (await runNow(page)) === null, "the run was kept by Start over");
      await page.locator('#diag-from input[value="a2"]').check();
      await page.locator("#diag-start button[type=submit]").click();
      await page.waitForFunction(() => !document.getElementById("diag-question").hidden);
      const d = await runNow(page);
      check(p, d && d.seed !== seed, "the new run has the old seed");
      /* new questions, judged by the dealt item seeds: two seeds can deal the same first
         prompt text now and then, so the text alone would fail by chance */
      const seeds = (r) => JSON.stringify(r.blocks[0].items.map((i) => i.s));
      check(p, d && d.id !== before.id && seeds(d) !== seeds(before), "Start over dealt the same questions");
      return p;
    });

    /* ------------------------------------------------------- storage failures -- */

    await kase("storage that will not save: Start still opens Question 1 with the unsaved line, and the result says so", {}, async (page, context) => {
      const p = [];
      await context.addInitScript(() => {
        Storage.prototype.setItem = function () { throw new DOMException("full", "QuotaExceededError"); };
      });
      await open(page);
      await page.locator('#diag-from input[value="unsure"]').check();
      await page.locator("#diag-start button[type=submit]").click();
      await page.waitForFunction(() => !document.getElementById("diag-question").hidden);
      check(p, (await textOf(page, "diag-q-head")) === "Question 1", "head " + (await textOf(page, "diag-q-head")));
      check(p, (await textOf(page, "diag-saved")) === UNSAVED, "saved line: " + (await textOf(page, "diag-saved")));
      await walk(page, skip, { blind: true });
      check(p, (await textOf(page, "diag-done-line")) === TAKE_UNSAVED, "done line: " + (await textOf(page, "diag-done-line")));
      return p;
    });

    await kase("A2: a take write that fails keeps the run, says so offers Start over and leaves bm.game.v1; a reload that can write gives one take and clears the run", {}, async (page, context) => {
      const p = [];
      await context.addInitScript(() => {
        const set = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) {
          if (k === "bm.diag.v1" && sessionStorage.getItem("t.block") === "1") throw new DOMException("full", "QuotaExceededError");
          return set.call(this, k, v);
        };
      });
      await open(page);
      await plant(page, "unsure");
      await page.evaluate(() => sessionStorage.setItem("t.block", "1"));
      await reload(page);
      await page.waitForFunction(() => !document.getElementById("diag-resume").hidden);
      await page.locator("#diag-keep").click();
      await page.waitForFunction(() => !document.getElementById("diag-question").hidden);
      const game = await raw(page, GAME_KEY);
      await walk(page, skip);
      check(p, (await textOf(page, "diag-done-line")) === TAKE_UNSAVED, "done line: " + (await textOf(page, "diag-done-line")));
      check(p, await shown(page, "diag-done-over"), "no Start over button");
      check(p, (await runNow(page)) !== null, "the run was cleared though the take was not saved");
      check(p, (await takes(page)).length === 0, "a take is stored");
      check(p, (await raw(page, GAME_KEY)) === game, "bm.game.v1 changed");
      await page.evaluate(() => sessionStorage.removeItem("t.block"));
      await reload(page);
      await page.waitForFunction(() => !document.getElementById("diag-done").hidden);
      check(p, (await takes(page)).length === 1, "expected 1 take after the reload, got " + (await takes(page)).length);
      check(p, (await runNow(page)) === null, "the run was not cleared after the reload");
      return p;
    });

    await kase("B2: no generators: the note, no page error, no way to start", {}, async (page, context) => {
      const p = [];
      /* BMGen is there for the scripts that fill it, and has no make or get for the page */
      await context.addInitScript(() => {
        let real;
        Object.defineProperty(window, "BMGen", {
          configurable: true,
          get() { return real && new Proxy(real, { get: (t, k) => (k === "make" || k === "get" ? undefined : t[k]) }); },
          set(v) { real = v; }
        });
      });
      await open(page);
      check(p, await shown(page, "diag-gone"), "the note is not showing");
      check(p, /generators did not load/.test(await textOf(page, "diag-gone-line")), "note: " + (await textOf(page, "diag-gone-line")));
      check(p, !(await shown(page, "diag-intro")), "the intro is showing");
      return p;
    });

    /* ---------------------------------------------------------- hostile input -- */

    await kase("C1: markup and template strings typed are text: no image, no page error, nothing stored", {}, async (page) => {
      const p = [];
      await begin(page, "a2");
      const evil = ["<img src=x onerror=window.__pwned=1>$x$", "${7*7}"];
      for (const text of evil) {
        /* each fill waits for the page to have taken the last submit: the question moved on, or
           the unread count grew and its line is drawn */
        const head = await textOf(page, "diag-q-head");
        const u0 = (await runNow(page)).pending.u;
        await page.locator("#diag-input").fill(text);
        await page.locator("#diag-answer button[type=submit]").click();
        await page.waitForFunction(({ head, u0, key }) => {
          if (document.getElementById("diag-q-head").textContent !== head) return true;
          let u = u0;
          try { u = JSON.parse(localStorage.getItem(key)).diag.pending.u; } catch (e) { u = u0; }
          return u > u0 && document.getElementById("diag-unread").textContent.length > 0;
        }, { head, u0, key: RUN_KEY });
      }
      const seen = await page.evaluate(() => ({
        imgs: document.querySelectorAll("main img").length,
        pwned: !!window.__pwned,
        stored: JSON.stringify(Object.assign({}, localStorage)),
        html: document.querySelector("main").innerHTML.includes("onerror")
      }));
      check(p, seen.imgs === 0, "an image element is on the page");
      check(p, !seen.pwned, "the handler ran");
      check(p, !/onerror|7\*7/.test(seen.stored), "the typed text is in localStorage");
      check(p, !seen.html, "the typed text is in the page's markup");
      return p;
    });

    await kase("C2: ?again=<script> opens the intro, no error, nothing echoed", {}, async (page) => {
      const p = [];
      await open(page, "?again=%3Cscript%3Ewindow.__pwned%3D1%3C%2Fscript%3E");
      check(p, await shown(page, "diag-intro"), "the intro is not showing");
      const seen = await page.evaluate(() => ({ pwned: !!window.__pwned, text: document.querySelector("main").textContent, html: document.querySelector("main").innerHTML }));
      check(p, !seen.pwned, "the script ran");
      check(p, !/pwned/.test(seen.text) && !/pwned/.test(seen.html), "the query value is on the page");
      return p;
    });

    /* ---------------------------------------------------- the gate and ?again -- */

    await kase("the return stub shows for a stored take without ?again: no intro, no run written, no Prep", {}, async (page) => {
      const p = [];
      await open(page);
      await plantTake(page, "earlier1");
      await reload(page);
      check(p, await shown(page, "diag-return"), "the return view is not showing");
      check(p, (await page.locator(RETURN_LINK).count()) === 1, "no Take it again link to prep.html#diagnostic");
      check(p, !(await shown(page, "diag-intro")), "the intro is showing");
      check(p, (await runNow(page)) === null, "a run was written");
      check(p, !/Prep/.test(await page.evaluate(() => document.querySelector("main").textContent)), "Prep content on the return view");
      return p;
    });

    await kase("D1: a run in progress with ?again resumes", {}, async (page) => {
      const p = [];
      await open(page);
      await plant(page, "a2");
      await open(page, "?again");
      check(p, await shown(page, "diag-resume"), "the resume screen is not showing");
      check(p, !(await shown(page, "diag-intro")), "the intro is showing");
      return p;
    });

    await kase("D1: takes and ?again open the intro; the query is gone once the run starts (path and hash stay); finishing gives 2 takes", {}, async (page) => {
      const p = [];
      await open(page);
      await plantTake(page, "earlier1");
      await page.goto(server.url + PAGE + "?again#top", { waitUntil: "load" });
      await h.settle(page);
      check(p, await shown(page, "diag-intro"), "the intro is not showing");
      check(p, (await page.evaluate(() => location.search)) === "?again", "the query was stripped before the run started");
      await page.locator('#diag-from input[value="unsure"]').check();
      await page.locator("#diag-start button[type=submit]").click();
      await page.waitForFunction(() => !document.getElementById("diag-question").hidden);
      const where = await page.evaluate(() => [location.pathname, location.search, location.hash]);
      check(p, where[1] === "" && where[2] === "#top" && /diagnostic\.html$/.test(where[0]), "address after start: " + JSON.stringify(where));
      await walk(page, skip);
      check(p, (await takes(page)).length === 2, "expected 2 takes, got " + (await takes(page)).length);
      return p;
    });

    /* ----------------------------------------------------------- result copy -- */

    await kase("result copy: close by count (4 of 8 in Pre-algebra) is said on the result and on the return view", {}, async (page) => {
      const p = [];
      await begin(page, "none", { clock: true });
      await walk(page, (n) => (n < 4 ? "right" : "skip"), { fast: true });
      const t = (await takes(page))[0] || {};
      check(p, t.band === "pre-algebra" && t.close === "pre-algebra", "band " + t.band + ", close " + t.close);
      const line = "You got 4 of 8 in Pre-algebra, close to the 5 we look for.";
      check(p, (await paragraphs(page, "diag-result")).includes(line), "the result lacks the close line: " + JSON.stringify(await paragraphs(page, "diag-result")));
      const typed = await page.evaluate(() => document.querySelectorAll("#diag-result .diag-typed").length);
      check(p, typed === 4, "expected 4 'You typed' lines on the result, got " + typed);
      await reload(page);
      check(p, await shown(page, "diag-return"), "the return view is not showing");
      check(p, (await paragraphs(page, "diag-return-view")).includes(line), "the return view lacks the close line: " + JSON.stringify(await paragraphs(page, "diag-return-view")));
      check(p, !/You typed/.test(await mainText(page)), "'You typed' on the return view");
      return p;
    });

    /* a finished run left in bm.run.v1 (the tab closed on the last answer) is finished again
       on load: the answers are drawn with nothing typed, from the stored kinds */
    await kase("result copy: close by form, with the answer list (a run finished after a reload: no \"You typed\", the format line) and without it (the return view)", {}, async (page) => {
      const p = [];
      await begin(page, "none");
      await page.evaluate(() => {
        const all = JSON.parse(localStorage.getItem("bm.run.v1"));
        const kinds = ["right", "right", "right", "right", "skip", "skip", "skip", "form"];
        all.diag.blocks[0].items.forEach((it, i) => { it.k = kinds[i]; if (kinds[i] === "form") it.r = "notation"; });
        localStorage.setItem("bm.run.v1", JSON.stringify(all));
      });
      await reload(page);
      check(p, await shown(page, "diag-done"), "the finished run did not open on the result");
      const t = (await takes(page))[0] || {};
      check(p, t.band === "pre-algebra" && t.close === "pre-algebra", "band " + t.band + ", close " + t.close);
      const withList = "Some Pre-algebra answers had the right value written another way. You'll see which ones below.";
      const lines = await paragraphs(page, "diag-result");
      check(p, lines.includes(withList), "the close-by-form line with the list is missing: " + JSON.stringify(lines));
      check(p, !lines.some((l) => /^You got \d+ of/.test(l)), "the count line shows with the form line: " + JSON.stringify(lines));
      const seen = await page.evaluate(() => {
        const cells = Array.from(document.querySelectorAll("#diag-result .diag-answers tbody td")).map((td) => td.textContent);
        return { cells, typed: document.querySelectorAll("#diag-result .diag-typed").length };
      });
      const formCell = seen.cells.find((c) => c.startsWith("Right value, written another way:")) || "";
      check(p, /^Right value, written another way: \S/.test(formCell), "the form row has no format line: " + JSON.stringify(seen.cells));
      check(p, seen.typed === 0 && !/You typed/.test(await mainText(page)), "'You typed' after a reload");
      check(p, seen.cells.filter((c) => c.startsWith("Skipped")).length === 3, "expected 3 skipped rows: " + JSON.stringify(seen.cells));
      await reload(page);
      check(p, await shown(page, "diag-return"), "the return view is not showing");
      const back = await paragraphs(page, "diag-return-view");
      check(p, back.includes("Some Pre-algebra answers had the right value written another way."), "the close-by-form line is missing on the return view: " + JSON.stringify(back));
      return p;
    });

    /* ------------------------------------------- the return view, Prep, and again -- */

    await kase("return view: shows the plan (Your plan, Start here with a link into parts/, line heads) and the date, and no Prep content", {}, async (page) => {
      const p = [];
      await open(page);
      await putDiag(page, { earlier1: takeOf() });
      await reload(page);
      check(p, await shown(page, "diag-return"), "the return view is not showing");
      check(p, (await headOf(page, "diag-return-view")) === "Your starting point: Algebra 1", "headline: " + (await headOf(page, "diag-return-view")));
      check(p, (await paragraphs(page, "diag-return-view")).includes("Checked on October 7, 2026"), "no date line: " + JSON.stringify(await paragraphs(page, "diag-return-view")));
      const plan = await page.evaluate(() => {
        const slot = document.querySelector("#diag-return-view #diag-plan");
        if (!slot) return null;
        const a = slot.querySelector("li.diag-plan-first a");
        return { h3: (slot.querySelector(":scope > h3") || {}).textContent, heads: Array.from(slot.querySelectorAll("h4")).map((h) => h.textContent), href: a ? a.getAttribute("href") : null };
      });
      check(p, !!plan && plan.h3 === "Your plan" && plan.heads[0] === "Start here", "plan: " + JSON.stringify(plan));
      check(p, !!plan && /^parts\/[^#]+\.html#.+/.test(plan.href || ""), "the Start here link: " + (plan && plan.href));
      check(p, !/Prep|Take the check again/.test(await mainText(page)), "Prep content on the return view");
      return p;
    });

    await kase("return view -> Take it again -> Prep -> Take the check again: a fresh intro with ?again, the query gone once the run starts, finishing gives 2 takes", {}, async (page) => {
      const p = [];
      await open(page);
      await plantTake(page, "earlier1");
      await reload(page);
      await page.locator(RETURN_LINK).click();
      await page.waitForURL(/\/prep\.html#diagnostic$/);
      await h.settle(page);
      check(p, await page.evaluate(() => !!document.getElementById("diagnostic")), "the Prep page has no #diagnostic section");
      await page.locator('#diagnostic a[href="diagnostic.html?again"]', { hasText: "Take the check again" }).click();
      await page.waitForURL(/\/diagnostic\.html\?again$/);
      await page.waitForFunction(() => !document.getElementById("diag-intro").hidden && !document.getElementById("diag-start").hidden);
      check(p, !(await shown(page, "diag-return")) && !(await shown(page, "diag-resume")), "the return view or a resume shows after ?again");
      check(p, (await page.evaluate(() => location.search)) === "?again", "the query was stripped before the run started");
      await page.locator('#diag-from input[value="unsure"]').check();
      await page.locator("#diag-start button[type=submit]").click();
      await page.waitForFunction(() => !document.getElementById("diag-question").hidden);
      check(p, (await page.evaluate(() => location.search)) === "", "the query stayed after the run started: " + (await page.evaluate(() => location.search)));
      await walk(page, skip);
      check(p, (await takes(page)).length === 2, "expected 2 takes, got " + (await takes(page)).length);
      return p;
    });

    /* ------------------------------------------------- hostile takes, the view -- */

    /* Takes the account (or a damaged browser) could hand the return view. Each is written as
       stored text, the page loaded, and the view looked at: no element made of a stored
       string, no handler run, no stored string in the text, no page error (the case checks it) */
    const BAD = "<img src=x onerror=window.__pwned=1>";
    async function hostile(label, store, body) {
      await kase("hostile take: " + label, {}, async (page) => {
        const p = [];
        await open(page);
        await putText(page, typeof store === "string" ? store : JSON.stringify(store));
        await reload(page);
        const inj = await injected(page);
        check(p, inj.imgs === 0 && !inj.pwned && !inj.markup, "injected: " + JSON.stringify(inj));
        check(p, !inj.proto, "Object.prototype was changed");
        const text = await mainText(page);
        check(p, !/ZZ|onerror|undefined|NaN|Invalid|\[object/.test(text.replace(/\s+/g, " ").replace(/Invalid input/g, "")), "a stored string, undefined or NaN is in the text: " + (text.match(/.{0,30}(ZZ|onerror|undefined|NaN|Invalid|\[object).{0,30}/) || [""])[0]);
        const out = await body(page, text);
        if (Array.isArray(out)) p.push(...out);
        return p;
      });
    }

    await hostile("an unknown band and a `beyond` band (no result to draw: the finished line and the link)", {
      takes: { h1: takeOf({ band: "ZZBAND" + BAD }), h2: takeOf({ band: "beyond" }) }
    }, async (page, text) => {
      const p = [];
      check(p, await shown(page, "diag-return") && (await headOf(page, "diag-return-view")) === "Your starting point", "head: " + (await headOf(page, "diag-return-view")));
      check(p, /You've finished this check\./.test(text) && (await page.locator(RETURN_LINK).count()) === 1, "no finished line or link");
      return p;
    });

    await hostile("a `__proto__` take id beside a good one", protoStore(takeOf({ band: "geometry", blocks: [blockOf("geometry", rights(4))] }), { ok1: takeOf() }), async (page) => {
      const p = [];
      check(p, await shown(page, "diag-return"), "the return view is not showing");
      check(p, (await page.locator(RETURN_LINK).count()) === 1, "no Take it again link");
      return p;
    });

    await hostile("markup and a marker string for a day (the take cannot be read; the good one is drawn)", {
      takes: { bad: takeOf({ day: "ZZDAY" + BAD, band: "geometry" }), ok1: takeOf() }
    }, async (page) => {
      const p = [];
      check(p, (await headOf(page, "diag-return-view")) === "Your starting point: Algebra 1", "head: " + (await headOf(page, "diag-return-view")));
      check(p, !/Earlier results/.test(await mainText(page)), "the unreadable take is listed as an earlier result");
      return p;
    });

    await hostile("impossible days (2026-13-01 latest, 2026-02-31 earlier): no date line, \"Earlier\" for the other", {
      takes: { a: takeOf({ day: "2026-13-01" }), b: takeOf({ day: "2026-02-31", band: "geometry", blocks: [blockOf("geometry", rights(4))] }) }
    }, async (page, text) => {
      const p = [];
      check(p, await shown(page, "diag-return"), "the return view is not showing");
      check(p, !/Checked on/.test(text), "a date line for an impossible day");
      check(p, /Earlier: Geometry/.test(text), "the earlier result is not listed as Earlier: " + text.slice(-200));
      return p;
    });

    await hostile("strings where numbers go, markup for a course, a kind and `close`, a course below the band neither asked nor implied", {
      takes: {
        weird: {
          v: "1", day: "2026-10-07", from: 5, start: ["x"], band: "algebra-1", blueprint: "ZZNUM", grader: "ZZNUM", seed: "ZZNUM", close: BAD, seeded: "ZZNUM", all: "ZZNUM", rushed: "ZZNUM",
          blocks: [
            { course: BAD, pass: "yes", items: [{ k: "<b>ZZKIND</b>" }] },
            { course: "algebra-1", pass: "ZZPASS", items: [{ g: 5, s: "ZZNUM", sec: {}, k: "right" }, { k: "ZZKIND" }, { k: "skip" }, null, 7] },
            null, 4, { course: "algebra-1", items: "ZZNUM" }
          ]
        }
      }
    }, async (page) => {
      const p = [];
      check(p, (await headOf(page, "diag-return-view")) === "Your starting point: Algebra 1", "head: " + (await headOf(page, "diag-return-view")));
      const rows = await rowsOf(page, "diag-return-view");
      check(p, rows["Algebra 1"] === "Start here. 1 right, 1 not yet.", "Algebra 1 row: " + JSON.stringify(rows));
      check(p, Object.keys(rows).join() === "Algebra 1,Geometry,Algebra 2", "rows: " + Object.keys(rows).join());
      return p;
    });

    await hostile("a course below the band that was neither asked nor implied: its row is left out", {
      takes: { low: takeOf({ band: "algebra-2", blocks: [blockOf("algebra-2", ["right", "right", "skip", "skip", "skip", "skip"])] }) }
    }, async (page) => {
      const p = [];
      const rows = await rowsOf(page, "diag-return-view");
      check(p, Object.keys(rows).join() === "Algebra 2", "rows: " + JSON.stringify(rows));
      return p;
    });

    await hostile("huge blocks (20000 answers in one, 3000 blocks of one course): drawn, no page error", {
      takes: {
        big: takeOf({
          blocks: [{ course: "algebra-1", pass: true, items: Array.from({ length: 20000 }, () => ({ g: "poly-eval", s: 1, sec: "ch12#definition-fn", k: "right" })) }]
            .concat(Array.from({ length: 3000 }, () => ({ course: "algebra-1", pass: false, items: [{ k: "skip" }] })))
        })
      }
    }, async (page) => {
      const p = [];
      check(p, await shown(page, "diag-return") && (await headOf(page, "diag-return-view")) === "Your starting point: Algebra 1", "head: " + (await headOf(page, "diag-return-view")));
      return p;
    });

    /* ------------------------------------------------------- the signed-in wait -- */

    async function signedIn(seed, body) {
      return kase(body.label, {}, async (page, context) => {
        await context.addInitScript(SDK);
        await context.addInitScript(PIN, seed);
        return body(page, context);
      });
    }
    const SESSION = { user: { id: "user-1", email: "reader@example.com", app_metadata: { provider: "email" }, user_metadata: {} } };

    await signedIn({ never: true, session: SESSION }, Object.assign(async (page) => {
      const p = [];
      await page.clock.install();
      await page.goto(server.url + PAGE, { waitUntil: "load" });
      await page.waitForFunction((line) => document.getElementById("diag-notice").textContent === line, CHECKING, { polling: 100 });
      check(p, !(await page.evaluate(() => !document.getElementById("diag-start").hidden)), "Start is offered while checking");
      await page.clock.fastForward(8000);
      await page.waitForFunction((line) => document.getElementById("diag-notice").textContent === line, NO_ACCOUNT, { polling: 100 });
      check(p, await shown(page, "diag-intro"), "the intro is not showing after the wait");
      check(p, await page.evaluate(() => !document.getElementById("diag-start").hidden), "Start is not offered after the wait");
      check(p, !/sign up|sign in|account/i.test(await textOf(page, "diag-intro-status")), "an invitation in the status line");
      return p;
    }, { label: "D2: a session that never resolves: the intro with the notice after 8 s" }));

    await signedIn({
      session: SESSION,
      row: { user_id: "user-1", reset_at: 0, updated_at: "2026-10-01T00:00:00.000Z", diag: { takes: { fromaccount: { v: 1, day: "2026-10-01", from: "pre", start: "algebra-1", band: "geometry", blueprint: 1, grader: 3, seed: 5, blocks: [], seeded: true } } } }
    }, Object.assign(async (page) => {
      const p = [];
      await page.goto(server.url + PAGE, { waitUntil: "load" });
      await page.waitForFunction(() => !document.getElementById("diag-return").hidden, null, { polling: 100 });
      check(p, (await page.locator(RETURN_LINK).count()) === 1, "no Take it again link to prep.html#diagnostic");
      check(p, (await textOf(page, "diag-notice")) === "", "notice: " + (await textOf(page, "diag-notice")));
      check(p, (await runNow(page)) === null, "a run was written");
      check(p, (await takes(page)).some((t) => t.band === "geometry"), "the account's take did not reach this browser");
      return p;
    }, { label: "D2: an account that holds a take: the return stub, no run written" }));

    /* ---------------------------------------------------- the gate, signed in -- */

    /* the notices the page's #diag-notice has shown since the document began: a wait that was
       skipped never shows CHECKING, which a look at the end cannot tell */
    const WATCH = function () {
      window.__notes = [];
      new MutationObserver((records) => {
        records.forEach((r) => {
          if (r.target && r.target.id === "diag-notice") window.__notes.push(r.addedNodes.length ? r.addedNodes[0].data : "");
        });
      }).observe(document, { subtree: true, childList: true });
    };
    const ACCOUNT_TAKE = { fromaccount: { v: 1, day: "2026-10-01", from: "pre", start: "algebra-1", band: "geometry", blueprint: 1, grader: 3, seed: 5, blocks: [], seeded: true } };
    const ROW = { user_id: "user-1", reset_at: 0, updated_at: "2026-10-01T00:00:00.000Z", diag: { takes: ACCOUNT_TAKE } };
    const introOffered = (page) => page.evaluate(() => !document.getElementById("diag-intro").hidden && !document.getElementById("diag-start").hidden);
    const noteNow = (page) => textOf(page, "diag-notice");

    await signedIn({ never: true, session: SESSION }, Object.assign(async (page, context) => {
      const p = [];
      await context.addInitScript(WATCH);
      await page.goto(server.url + PAGE + "?again", { waitUntil: "load" });
      await page.waitForFunction(() => !document.getElementById("diag-intro").hidden && !document.getElementById("diag-start").hidden, null, { timeout: 3000 });
      const notes = await page.evaluate(() => window.__notes);
      check(p, !notes.includes(CHECKING), "?again waited for the account: " + JSON.stringify(notes));
      check(p, (await noteNow(page)) === "", "notice: " + (await noteNow(page)));
      return p;
    }, { label: "gate: ?again with a stored session skips the account wait (no CHECKING, Start offered at once)" }));

    /* The next three end the wait without the 8 s timer: Playwright's clock is installed and
       paused before the page loads (install alone lets time flow on, and the timer would fire
       within the timeout), so that timer cannot fire and only the branch under test can give
       the notice (the generous timeout is for a slow machine, not for the timer) */
    const freeze = async (page) => { const t = Date.now(); await page.clock.install({ time: t }); await page.clock.pauseAt(t + 1000); };
    const noticeWithoutTimer = (page) => page.waitForFunction((line) => document.getElementById("diag-notice").textContent === line, NO_ACCOUNT, { polling: 100, timeout: 20000 });

    await signedIn({ token: true }, Object.assign(async (page) => {
      const p = [];
      await freeze(page);
      await page.goto(server.url + PAGE, { waitUntil: "load" });
      await noticeWithoutTimer(page);
      check(p, await introOffered(page), "the intro with Start is not showing");
      return p;
    }, { label: "gate: `off` with a kept session and no user (an expired token, offline) shows the couldn't-reach notice without the 8 s wait" }));

    /* the session resolves (a user, so not the `off` branch above); the pull's query answers
       with an error, so sync() throws and the status is `error` */
    await signedIn({ session: SESSION, fail: true }, Object.assign(async (page) => {
      const p = [];
      await freeze(page);
      await page.goto(server.url + PAGE, { waitUntil: "load" });
      await noticeWithoutTimer(page);
      const state = await page.evaluate(() => ({ state: window.BMAccount.status().state, user: !!window.BMAccount.user() }));
      check(p, state.state === "error" && state.user, "not the `error` branch: " + JSON.stringify(state));
      check(p, await introOffered(page), "the intro with Start is not showing");
      return p;
    }, { label: "gate: status `error` (the account answers with an error) shows the notice without the 8 s wait" }));

    await signedIn({ session: SESSION, boom: true }, Object.assign(async (page) => {
      const p = [];
      await freeze(page);
      await page.goto(server.url + PAGE, { waitUntil: "load" });
      await noticeWithoutTimer(page);
      check(p, await introOffered(page), "the intro with Start is not showing");
      return p;
    }, { label: "gate: createClient throws, so ready() rejects: the notice, the intro with Start" }));

    await signedIn({ session: SESSION, row: null }, Object.assign(async (page) => {
      const p = [];
      await page.goto(server.url + PAGE, { waitUntil: "load" });
      await page.waitForFunction(() => !document.getElementById("diag-start").hidden, null, { timeout: 5000 });
      check(p, await shown(page, "diag-intro"), "the intro is not showing");
      check(p, (await noteNow(page)) === "", "notice: " + (await noteNow(page)));
      check(p, (await takes(page)).length === 0, "a take appeared from nowhere");
      return p;
    }, { label: "gate: signed in with no takes anywhere: the intro, no notice" }));

    await signedIn({ hold: true, session: SESSION }, Object.assign(async (page) => {
      const p = [];
      await page.clock.install();
      await page.goto(server.url + PAGE, { waitUntil: "load" });
      await page.waitForFunction((line) => document.getElementById("diag-notice").textContent === line, CHECKING, { polling: 100 });
      await page.clock.fastForward(8000);
      await page.waitForFunction((line) => document.getElementById("diag-notice").textContent === line, NO_ACCOUNT, { polling: 100 });
      check(p, await introOffered(page), "the intro is not offered after the wait");
      await page.evaluate((row) => { window.__sdk.row = row; window.__release(); }, ROW);
      await page.waitForFunction(() => !document.getElementById("diag-return").hidden, null, { polling: 100 });
      check(p, (await noteNow(page)) === "", "the notice stayed: " + (await noteNow(page)));
      check(p, !(await shown(page, "diag-intro")), "the intro is still showing");
      check(p, (await page.locator(RETURN_LINK).count()) === 1, "no Take it again link");
      return p;
    }, { label: "gate: a pull that arrives after the 8 s wait, with a take: the intro becomes the return view and the notice goes" }));

    await signedIn({ hold: true, session: SESSION }, Object.assign(async (page) => {
      const p = [];
      await page.clock.install();
      await page.goto(server.url + PAGE, { waitUntil: "load" });
      await page.waitForFunction((line) => document.getElementById("diag-notice").textContent === line, CHECKING, { polling: 100 });
      await page.clock.fastForward(8000);
      await page.waitForFunction((line) => document.getElementById("diag-notice").textContent === line, NO_ACCOUNT, { polling: 100 });
      await page.evaluate(() => { window.__sdk.row = null; window.__release(); });
      await page.waitForFunction(() => document.getElementById("diag-notice").textContent === "", null, { polling: 100 });
      check(p, await introOffered(page), "the intro with Start is not showing");
      check(p, !(await shown(page, "diag-return")), "the return view is showing with no take");
      return p;
    }, { label: "gate: a pull that arrives after the 8 s wait, with no take: the notice clears and the intro stays" }));

    await kase("signed out: no bundle/supabase.js request on the page, and none at all to another server", {}, async (page, context, errors) => {
      const p = [];
      await open(page);
      check(p, !errors.own.some((u) => /\/bundle\/supabase\.js/.test(u)), "bundle/supabase.js was requested");
      check(p, errors.unexpected().length === 0, "requests off the local server: " + errors.unexpected().join(", "));
      return p;
    });

    /* ----------------------------------------------- a sign-out under the result -- */

    /* the first answer typed (so "You typed" is drawn), the rest skipped: band Pre-algebra
       after 5 questions, and the result on screen */
    const TYPED_THEN_SKIP = (n) => (n === 0 ? "right" : "skip");
    const resultShows = (page) => page.evaluate(() => {
      const t = document.querySelector("main").textContent;
      return { typed: /You typed:/.test(t), band: /Start with: Pre-algebra/.test(t), box: document.getElementById("diag-result").childNodes.length };
    });
    /* what account.js's clearLocal does to the two keys this page reads: bm.run.v1 first */
    const signOut = (page) => page.evaluate(() => {
      localStorage.setItem("bm.run.v1", "{}");
      localStorage.setItem("bm.diag.v1", "{}");
    });

    await kase("F1: a sign-out in another tab while the result shows: the typed text and the band leave the page, the intro shows, nothing written", {}, async (page, context) => {
      const p = [];
      await begin(page, "unsure");
      await walk(page, TYPED_THEN_SKIP);
      const before = await resultShows(page);
      check(p, before.typed && before.band, "the result did not draw the typed text and the band: " + JSON.stringify(before));
      const other = await context.newPage();
      await other.goto(server.url + PAGE, { waitUntil: "load" });
      await h.settle(other);
      await signOut(other);
      await page.waitForFunction(() => !document.getElementById("diag-intro").hidden);
      const after = await resultShows(page);
      check(p, !after.typed && !after.band && after.box === 0, "the signed-out reader's result is still in the page: " + JSON.stringify(after));
      check(p, !(await shown(page, "diag-done")), "the result is still showing");
      check(p, (await raw(page, DIAG_KEY)) === "{}", "bm.diag.v1 was written: " + (await raw(page, DIAG_KEY)));
      return p;
    });

    await kase("F1: a same-tab sync that keeps the take leaves the result; one that drops it shows the intro with the typed text and band gone", {}, async (page) => {
      const p = [];
      await begin(page, "unsure");
      await walk(page, TYPED_THEN_SKIP);
      await page.evaluate(() => window.BMStore.emit({ type: "sync" }));
      const kept = await resultShows(page);
      check(p, (await shown(page, "diag-done")) && kept.typed && kept.band, "a sync that kept the take moved the result: " + JSON.stringify(kept));
      await page.evaluate(() => {
        const S = window.BMStore;
        S.write(S.keys.run, {}, true);
        S.write(S.keys.diag, {}, true);
        S.emit({ type: "sync" });
      });
      await page.waitForFunction(() => !document.getElementById("diag-intro").hidden);
      const after = await resultShows(page);
      check(p, !after.typed && !after.band && after.box === 0, "the dropped take's result is still in the page: " + JSON.stringify(after));
      check(p, (await raw(page, DIAG_KEY)) === "{}", "bm.diag.v1 was written: " + (await raw(page, DIAG_KEY)));
      return p;
    });

    await kase("a sign-out in another tab while the return view shows: the intro, and the hidden return section holds no band", {}, async (page, context) => {
      const p = [];
      await open(page);
      await plantTake(page, "earlier1");
      await reload(page);
      check(p, await shown(page, "diag-return"), "the return view is not showing");
      const other = await context.newPage();
      await other.goto(server.url + PAGE, { waitUntil: "load" });
      await h.settle(other);
      await signOut(other);
      await page.waitForFunction(() => !document.getElementById("diag-intro").hidden);
      const left = await page.evaluate(() => document.getElementById("diag-return-view").childNodes.length);
      check(p, left === 0, "the return section still holds " + left + " nodes");
      return p;
    });

    /* ------------------------------------------------ the gate, after it opened -- */

    /* the return view on screen with one take, a second tab open on the same page */
    async function returnWithTab(page, context) {
      await open(page);
      await putDiag(page, { aaa1: takeOf() });
      await reload(page);
      const other = await context.newPage();
      await other.goto(server.url + PAGE, { waitUntil: "load" });
      await h.settle(other);
      return other;
    }
    const geometryTake = () => takeOf({ day: "2026-10-08", band: "geometry", blocks: [blockOf("geometry", rights(4))] });

    await kase("gate: the return view re-gates on a bm.diag.v1 storage event (another tab's new take is drawn, the older one is listed)", {}, async (page, context) => {
      const p = [];
      const other = await returnWithTab(page, context);
      check(p, (await headOf(page, "diag-return-view")) === "Your starting point: Algebra 1", "head before: " + (await headOf(page, "diag-return-view")));
      await other.evaluate((t) => {
        const d = JSON.parse(localStorage.getItem("bm.diag.v1"));
        d.takes.bbb1 = t;
        localStorage.setItem("bm.diag.v1", JSON.stringify(d));
      }, geometryTake());
      await page.waitForFunction(() => document.querySelector("#diag-return-view > h2").textContent === "Your starting point: Geometry");
      check(p, /Earlier results/.test(await mainText(page)) && /October 7, 2026: Algebra 1/.test(await mainText(page)), "the earlier result is not listed");
      return p;
    });

    await kase("gate: the return view re-gates on a sync in this tab; a sync that changes nothing leaves the focus on \"Take it again\"", {}, async (page) => {
      const p = [];
      await open(page);
      await putDiag(page, { aaa1: takeOf() });
      await reload(page);
      await page.evaluate(() => { const a = document.querySelector('#diag-return a[href="prep.html#diagnostic"]'); window.__link = a; a.focus(); });
      await page.evaluate(() => window.BMStore.emit({ type: "sync" }));
      /* BMStore.emit calls its listeners synchronously, so the page has answered the sync by the
         time this evaluate returns: no wait is needed before looking */
      const kept = await page.evaluate(() => ({ same: document.activeElement === window.__link, linked: document.body.contains(window.__link) }));
      check(p, kept.same && kept.linked, "a sync that changed nothing moved the focus or redrew the view: " + JSON.stringify(kept));
      await page.evaluate((t) => {
        const d = JSON.parse(localStorage.getItem("bm.diag.v1"));
        d.takes.bbb1 = t;
        localStorage.setItem("bm.diag.v1", JSON.stringify(d));
        window.BMStore.emit({ type: "sync" });
      }, geometryTake());
      check(p, (await headOf(page, "diag-return-view")) === "Your starting point: Geometry", "a sync that brought a take did not redraw: " + (await headOf(page, "diag-return-view")));
      return p;
    });

    await kase("gate: a take arriving by storage event on the intro (no run, the gate done) shows the return view", {}, async (page, context) => {
      const p = [];
      await open(page);
      check(p, await shown(page, "diag-intro") && await introOffered(page), "the intro is not offered");
      const other = await context.newPage();
      await other.goto(server.url + PAGE, { waitUntil: "load" });
      await h.settle(other);
      await plantTake(other, "arrived1");
      await page.waitForFunction(() => !document.getElementById("diag-return").hidden);
      check(p, !(await shown(page, "diag-intro")), "the intro is still showing");
      check(p, (await textOf(page, "diag-notice")) === "", "notice: " + (await textOf(page, "diag-notice")));
      return p;
    });

    await kase("gate: the run is gone because another tab finished it (its take is under the run's id): the return view, no notice", {}, async (page, context) => {
      const p = [];
      await begin(page, "unsure");
      const id = (await runNow(page)).id;
      const other = await context.newPage();
      await other.goto(server.url + PAGE, { waitUntil: "load" });
      await h.settle(other);
      await other.evaluate((id) => {
        const d = { takes: {} };
        d.takes[id] = { v: 1, day: "2026-10-07", from: "none", start: "pre-algebra", band: "pre-algebra", blueprint: 1, grader: 3, seed: 7, blocks: [], seeded: true };
        localStorage.setItem("bm.diag.v1", JSON.stringify(d));
        const all = JSON.parse(localStorage.getItem("bm.run.v1"));
        delete all.diag;
        localStorage.setItem("bm.run.v1", JSON.stringify(all));
      }, id);
      await page.waitForFunction(() => !document.getElementById("diag-return").hidden);
      check(p, (await textOf(page, "diag-notice")) === "", "notice: " + (await textOf(page, "diag-notice")));
      check(p, !(await shown(page, "diag-question")), "the question is still showing");
      return p;
    });

    await kase("gate: the run is gone and a take exists under another id (another tab's Start over): the intro with \"changed in another tab\"", {}, async (page, context) => {
      const p = [];
      await begin(page, "unsure");
      await plantTake(page, "earlier1");
      const other = await context.newPage();
      await other.goto(server.url + PAGE, { waitUntil: "load" });
      await h.settle(other);
      await other.evaluate(() => {
        const all = JSON.parse(localStorage.getItem("bm.run.v1"));
        delete all.diag;
        localStorage.setItem("bm.run.v1", JSON.stringify(all));
      });
      await page.waitForFunction(() => !document.getElementById("diag-intro").hidden);
      check(p, (await textOf(page, "diag-notice")) === CHANGED_TAB, "notice: " + (await textOf(page, "diag-notice")));
      check(p, !(await shown(page, "diag-return")), "the return view is showing");
      return p;
    });

    /* a reset in this tab (site.js's About button, account.js's writeLocal) empties bm.run.v1
       with no storage event; the page hears only the `reset` change on BMStore */
    await kase("gate: a reset in this tab empties the run mid-question: the intro with \"changed\"", {}, async (page) => {
      const p = [];
      await begin(page, "unsure");
      check(p, await shown(page, "diag-question"), "no question showing before the reset");
      await page.evaluate(() => {
        const all = JSON.parse(localStorage.getItem("bm.run.v1"));
        delete all.diag;
        localStorage.setItem("bm.run.v1", JSON.stringify(all));
        window.BMStore.emit({ type: "reset" });
      });
      /* emit is synchronous: the page has answered by now */
      check(p, await shown(page, "diag-intro") && !(await shown(page, "diag-question")), "the intro is not showing after the reset");
      check(p, (await textOf(page, "diag-notice")) === CHANGED, "notice: " + (await textOf(page, "diag-notice")));
      check(p, (await runNow(page)) === null, "the dropped run was written back");
      return p;
    });

    /* gate().then(...).catch: the draw after the gate throws. Nothing in renderReturn throws on
       its own (BMPlan.render is caught inside it), so an init script makes the first DOM call on
       the return view's box throw; the catch must still offer Start, and nothing goes uncaught */
    await kase("gate: the return view's draw throws after the gate: the intro with Start offered, no page error", {}, async (page, context) => {
      const p = [];
      await context.addInitScript(() => {
        const real = Element.prototype.replaceChildren;
        Element.prototype.replaceChildren = function (...nodes) {
          if (this.id === "diag-return-view") { window.__drawThrew = true; throw new Error("stand-in draw failure"); }
          return real.apply(this, nodes);
        };
      });
      await open(page);
      await putDiag(page, { aaa1: takeOf() });
      await page.reload({ waitUntil: "load" });
      await page.waitForFunction(() => !document.getElementById("diag-intro").hidden && !document.getElementById("diag-start").hidden, null, { timeout: 5000 });
      check(p, await page.evaluate(() => window.__drawThrew === true), "the stand-in did not throw (the case tests nothing)");
      check(p, !(await shown(page, "diag-return")), "the return view is showing");
      return p;
    });

    /* ------------------------------------------------- 360 px and axe in each state -- */

    async function states(page, vw, theme) {
      const p = [];
      const overflow = async (state) => {
        const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (vw === 360) check(p, o <= 0, state + ": " + o + "px of horizontal overflow at 360");
      };
      const axe = async (state) => {
        if (!ctx.axeSource) return;
        await h.injectAxe(page, ctx.axeSource);
        const bad = await page.evaluate(async () => {
          const r = await window.axe.run(document, { resultTypes: ["violations"] });
          return r.violations.map((v) => v.id + ": " + v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | "));
        });
        bad.forEach((b) => p.push(state + " [" + theme + " " + vw + "]: axe " + b));
      };
      await open(page);
      await overflow("intro"); await axe("intro");
      await plant(page, "unsure");
      await reload(page);
      await overflow("resume"); await axe("resume");
      await page.locator("#diag-keep").click();
      await page.waitForFunction(() => !document.getElementById("diag-question").hidden);
      await overflow("question"); await axe("question");
      await walk(page, skip);
      await overflow("done"); await axe("done");
      await reload(page);
      check(p, await shown(page, "diag-return"), "the return view is not showing");
      await overflow("return"); await axe("return");
      return p;
    }
    await kase("360 px and axe in every state (intro, resume, question, done, return): light, 360", { theme: "light", vw: 360 }, (page) => states(page, 360, "light"));
    await kase("axe in every state (intro, resume, question, done, return): dark, 1280", { theme: "dark", vw: 1280 }, (page) => states(page, 1280, "dark"));

    /* ------------------------------------------------------------ D-14 launch -- */

    const LAUNCH_TAKE = {
      v: 1, day: "2026-10-07", from: "pre", start: "algebra-1", band: "geometry", blueprint: 1, grader: 3, seed: 7, seeded: true,
      blocks: [{ course: "geometry", pass: true, items: [["perp-slope", "ch10#lines"], ["point-sum", "ch09#addition-points"], ["seg-point", "ch10#segments"], ["circle-read", "ch08#circle"]].map((f, i) => ({ g: f[0], s: 101 + i, sec: f[1], k: "right" })) }]
    };
    await kase("launch: the home page's line reaches the check; the progress page invites with no take and shows the plan with one", {}, async (page) => {
      const p = [];
      await h.open(page, "index.html");
      const line = await page.evaluate(() => {
        const a = document.querySelector('main a[href="diagnostic.html"]');
        return a ? { text: a.textContent, para: a.parentElement.textContent.replace(/\s+/g, " ").trim() } : null;
      });
      check(p, !!line && line.text === "Find your starting point" && line.para === "Not sure where to start? Find your starting point.", "the home page's line: " + JSON.stringify(line));
      await page.locator('main a[href="diagnostic.html"]').click();
      await page.waitForURL(/diagnostic\.html/);
      check(p, await page.evaluate(() => /Find your starting point/.test(document.querySelector("h1").textContent)), "the link did not reach the check");
      await h.open(page, "progress.html");
      const inv = await page.evaluate(() => {
        const e = document.getElementById("start-check");
        const a = e && e.querySelector("a");
        return {
          first: document.querySelector("[data-progress]").firstElementChild.id,
          text: e ? e.textContent.replace(/\s+/g, " ").trim() : null,
          href: a ? a.getAttribute("href") : null,
          plan: !!document.getElementById("plan")
        };
      });
      check(p, inv.first === "start-check" && inv.href === "diagnostic.html" && !inv.plan, "no take, the invitation: " + JSON.stringify(inv));
      check(p, inv.text === "Find your starting point: a short placement check with no timer.", "the invitation's words: " + inv.text);
      check(p, !/sign in|sign up|log in|account|create/i.test(inv.text || ""), "sign-up wording in the invitation");
      await page.evaluate((take) => localStorage.setItem("bm.diag.v1", JSON.stringify({ takes: { launch1: take } })), LAUNCH_TAKE);
      await reload(page);
      const withTake = await page.evaluate(() => ({ plan: !!document.getElementById("plan"), inv: !!document.getElementById("start-check") }));
      check(p, withTake.plan && !withTake.inv, "with a take: " + JSON.stringify(withTake));
      return p;
    });

    await kase("launch precondition: account.html, signed out, says accounts are for people 13 or older", {}, async (page) => {
      const p = [];
      await h.open(page, "account.html");
      const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
      check(p, /13 or older/.test(text), "the rendered account page does not say \"13 or older\"");
      return p;
    });
  }
};
