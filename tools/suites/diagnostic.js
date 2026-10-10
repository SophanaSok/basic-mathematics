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
       the run cleared in another tab (E1).
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
const EMPTY = "Type an answer, then press Submit.";

/* a stand-in for supabase-js: no network; a session if window.__sdk.session is set; a stored
   row for the account if window.__sdk.row is set; a getSession that never answers if
   window.__sdk.never is set */
const SDK = function () {
  const cfg = new Proxy({}, { get: (_, k) => (window.__sdk || {})[k] });
  const answer = (data) => ({ data, error: null });
  window.supabase = {
    createClient() {
      return {
        from() {
          let write = false;
          const api = {
            select() { return api; }, eq() { return api; }, maybeSingle() { return api; },
            insert() { write = true; return api; }, update() { write = true; return api; }, upsert() { write = true; return api; },
            then(ok, bad) { return Promise.resolve(answer(write ? [{ updated_at: new Date().toISOString() }] : cfg.row || null)).then(ok, bad); }
          };
          return api;
        },
        rpc() { return Promise.resolve(answer(null)); },
        auth: {
          onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
          getSession() { return cfg.never ? new Promise(() => {}) : Promise.resolve(answer({ session: cfg.session || null })); },
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
  if (seed.session) localStorage.setItem("sb-testref-auth-token", "{}");
};

module.exports = {
  name: "diagnostic",
  order: 48,
  description: "the placement check in the browser: the four walks and what they store, Start with no choice, empty and unreadable answers, two tabs, reload and start over, completion, no attempt events, storage that will not save, the signed-in wait, ?again, hostile input, 360 px, axe in every state",
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
      return p;
    });

    await kase("walk: Not sure and every answer skipped: Pre-algebra after 4 items", {}, async (page) => {
      const p = [];
      await begin(page, "unsure");
      const asked = await walk(page, skip);
      const t = (await takes(page))[0] || {};
      check(p, asked.length === 4 && sizeOf(t) === 4, "asked " + asked.length + ", stored " + sizeOf(t));
      check(p, t.band === "pre-algebra", "band " + t.band);
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
      await other.evaluate(() => {
        const all = JSON.parse(localStorage.getItem("bm.run.v1"));
        all.combo = { pips: 2 };
        localStorage.setItem("bm.run.v1", JSON.stringify(all));
      });
      await page.waitForTimeout(400);
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
      await plantTake(other, "othertab1");
      await page.waitForTimeout(400);
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
      await other.locator("#diag-skip").click();
      await other.waitForFunction(() => !document.getElementById("diag-done").hidden);
      const n = (await takes(page)).length;
      check(p, n === 1, "expected 1 take, got " + n);
      check(p, (await runNow(page)) === null, "the run was not cleared");
      return p;
    });

    /* ---------------------------------------------------------- reload, over -- */

    await kase("reload mid-block resumes the same question text; Start over deals new text", {}, async (page) => {
      const p = [];
      await begin(page, "a2");
      const q1 = await textOf(page, "diag-prompt");
      await page.locator("#diag-skip").click();
      await page.waitForFunction(() => document.getElementById("diag-q-head").textContent === "Question 2");
      const q2 = await textOf(page, "diag-prompt");
      const seed = (await runNow(page)).seed;
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
      check(p, (await textOf(page, "diag-prompt")) !== q1, "Start over dealt the same question text");
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
        const head = await textOf(page, "diag-q-head");
        await page.locator("#diag-input").fill(text);
        await page.locator("#diag-answer button[type=submit]").click();
        await page.waitForTimeout(300);
        void head;
      }
      await page.waitForTimeout(300);
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

    await kase("signed out: no bundle/supabase.js request on the page, and none at all to another server", {}, async (page, context, errors) => {
      const p = [];
      await open(page);
      check(p, !errors.own.some((u) => /\/bundle\/supabase\.js/.test(u)), "bundle/supabase.js was requested");
      check(p, errors.unexpected().length === 0, "requests off the local server: " + errors.unexpected().join(", "));
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
  }
};
