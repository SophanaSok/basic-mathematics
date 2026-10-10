"use strict";
/* The study plan as a page draws it (src/ui/plan.ts, assets/insights.js planPanel()), the D-18
   and D-13 cases of ~/.claude/plans/diagnostic-design.md §8 and §12.3:
     - on the diagnostic page, the return view of a stored take draws "Your plan": the h3, the
       line heads and a Start here link that is an address into parts/;
     - on the progress page, with a take: the panel first on the page, its headings in order
       (h1, h2, h3, h4, h5) and axe clean in both themes at both widths, the Start here link, no link
       to diagnostic.html anywhere on the page and no sign-in sentence in the panel;
     - with no take: no panel and no empty slot; after a sign-out (bm.diag.v1 emptied, then a
       sync): the panel goes; after a reset: it stays (decision 0003 keeps the takes);
     - the progress page's panel is compact (D-19): Start here, and Review first when the take has
       a miss in a cleared course, stay open; "See the whole plan" is shut, holds Coming up, Already
       in hand and Going further, and keeps its open or shut through a redraw (a sync, a goal chip);
     - no heading inside any summary on either page; the diagnostic page keeps the full plan;
     - a take written in a second tab shows the panel on the progress page without a reload, and
       removing it takes the panel away.
   The take is written by hand into bm.diag.v1 and the page loaded (production has no hook).
   Every tab has a pageerror listener, and an uncaught error fails its case. The plan on the
   result straight after a walk is in the diagnostic suite, which has the walks. */

const PAGE = "diagnostic.html";
const PROGRESS = "progress.html";
const RETURN_LINK = '#diag-return a[href="prep.html#diagnostic"]';

module.exports = {
  name: "plan",
  order: 49,
  description: "the study plan on the diagnostic page's return view and on the progress page: the panel first, its headings and axe, the Start here link, no link to the check, no panel without a take, a sign-out removes it, a reset keeps it, the compact panel with \"See the whole plan\" shut and kept open or shut across a redraw, no heading inside a summary, a take from a second tab drawn without a reload",
  async run(ctx) {
    const { h, report } = ctx;

    /* one case: a page in a context of its own, the problems the body returns, and every
       uncaught error on the page */
    async function kase(label, o, body) {
      const started = await h.newPage(o || {});
      const { page, errors } = started;
      const problems = [];
      try {
        const out = await body(page, started.context);
        if (Array.isArray(out)) problems.push(...out);
      } catch (e) {
        problems.push("threw: " + (e && e.message || e));
      }
      errors.pageErrors.forEach((m) => problems.push("pageerror: " + m));
      await started.close();
      report[problems.length ? "fail" : "pass"](label, problems.length ? problems.join("\n") : undefined);
    }
    const check = (problems, cond, what) => { if (!cond) problems.push(what); };

    /* a take that cleared Geometry (so there is a plan, with a course in hand and one coming up) */
    const GEO = [["perp-slope", "ch10#lines"], ["point-sum", "ch09#addition-points"], ["seg-point", "ch10#segments"], ["circle-read", "ch08#circle"]];
    const TAKE = {
      v: 1, day: "2026-10-07", from: "pre", start: "algebra-1", band: "geometry", blueprint: 1, grader: 3, seed: 7, seeded: true,
      blocks: [{ course: "geometry", pass: true, items: GEO.map((f, i) => ({ g: f[0], s: 101 + i, sec: f[1], k: "right" })) }]
    };
    const plant = (page) => page.evaluate((take) => localStorage.setItem("bm.diag.v1", JSON.stringify({ takes: { plan1: take } })), TAKE);
    const raw = (page, key) => page.evaluate((key) => localStorage.getItem(key), key);
    const reload = async (page) => { await page.reload({ waitUntil: "load" }); await h.settle(page); };
    const summaryHeads = (page) => page.evaluate(() => document.querySelectorAll("summary h1, summary h2, summary h3, summary h4, summary h5, summary h6").length);
    const START_HREF = /^parts\/[^#]+\.html#.+/;

    /* the headings of the page in order, as levels */
    const levels = (page) => page.evaluate(() => Array.from(document.querySelectorAll("main h1, main h2, main h3, main h4, main h5, main h6")).map((e) => +e.tagName[1]));

    /* ------------------------------------------------------ the diagnostic page -- */

    await kase("diagnostic page: a stored take draws Your plan with Start here (a link into parts/) and the line heads", {}, async (page) => {
      const p = [];
      await h.open(page, PAGE);
      await plant(page);
      await reload(page);
      check(p, await page.evaluate(() => !document.getElementById("diag-return").hidden), "the return view is not showing");
      const plan = await page.evaluate(() => {
        const slot = document.getElementById("diag-plan");
        if (!slot) return null;
        return {
          h3: (slot.querySelector(":scope > h3") || {}).textContent,
          heads: Array.from(slot.querySelectorAll("h4")).map((e) => e.textContent),
          hrefs: Array.from(slot.querySelectorAll("li.diag-plan-first a")).map((a) => a.getAttribute("href")),
          sub: Array.from(slot.querySelectorAll("h5")).length,
          visible: ["Coming up", "Going further"].map((t) => { const e = Array.from(slot.querySelectorAll("h4")).find((x) => x.textContent === t); return !!e && e.offsetParent !== null && !e.closest("details"); }),
          skim: (slot.querySelector("details.diag-plan-hand > summary") || {}).textContent,
          handHead: !!slot.querySelector("h4 + details.diag-plan-hand"),
          fold: Array.from(slot.querySelectorAll("summary")).filter((x) => x.textContent === "See the whole plan").length
        };
      });
      check(p, !!plan, "no #diag-plan");
      if (plan) {
        check(p, plan.h3 === "Your plan", "plan heading: " + plan.h3);
        check(p, plan.heads[0] === "Start here" && plan.heads.includes("Coming up") && plan.heads.includes("Already in hand") && plan.heads.includes("Going further"), "line heads: " + JSON.stringify(plan.heads));
        check(p, plan.hrefs.length === 1 && START_HREF.test(plan.hrefs[0]), "the Start here link: " + JSON.stringify(plan.hrefs));
        check(p, plan.sub > 0, "no course heads under the lines");
        check(p, plan.visible.every((x) => x), "Coming up or Going further is not visible: " + JSON.stringify(plan.visible));
        check(p, plan.skim === "Show the sections you can skim" && plan.handHead, "the full plan's fold: " + JSON.stringify([plan.skim, plan.handHead]));
        check(p, plan.fold === 0, "the full plan has a See the whole plan fold");
      }
      check(p, (await summaryHeads(page)) === 0, "a heading inside a summary on the diagnostic page");
      return p;
    });

    /* ------------------------------------------------------- the progress page -- */

    async function panelCase(theme, vw) {
      await kase("progress page with a take: the panel first, headings in order, Start here, no link to the check, no sign-in sentence, axe clean (" + theme + ", " + vw + ")", { theme, vw }, async (page) => {
        const p = [];
        await h.open(page, PAGE);
        await plant(page);
        await h.open(page, PROGRESS);
        const seen = await page.evaluate(() => {
          const root = document.querySelector("[data-progress]");
          const first = root.firstElementChild;
          const panel = document.getElementById("plan");
          return {
            first: first ? first.id : null,
            h2: panel && panel.querySelector(":scope > h2") ? panel.querySelector(":scope > h2").textContent : null,
            h3: panel && panel.querySelector(":scope > h3") ? panel.querySelector(":scope > h3").textContent : null,
            startHead: panel ? (panel.querySelector(".diag-plan > h4") || {}).textContent : null,
            hrefs: panel ? Array.from(panel.querySelectorAll("li.diag-plan-first a")).map((a) => a.getAttribute("href")) : [],
            toCheck: Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")).filter((x) => /diagnostic\.html/.test(x)),
            panelText: panel ? panel.textContent : "",
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
          };
        });
        check(p, seen.first === "plan", "the panel is not the first thing on the page: " + seen.first);
        check(p, seen.h2 === "Your plan" && seen.h3 === "From your placement check" && seen.startHead === "Start here", "headings: " + JSON.stringify([seen.h2, seen.h3, seen.startHead]));
        check(p, seen.hrefs.length === 1 && START_HREF.test(seen.hrefs[0]), "the Start here link: " + JSON.stringify(seen.hrefs));
        check(p, seen.toCheck.length === 0, "a link to the check on the progress page: " + JSON.stringify(seen.toCheck));
        check(p, !/sign in|sign up|log in|account/i.test(seen.panelText.replace(/\s+/g, " ")), "a sign-in sentence in the panel");
        if (vw === 360) check(p, seen.overflow <= 0, seen.overflow + "px of horizontal overflow at 360");
        const order = await levels(page);
        check(p, order[0] === 1 && order.every((n, i) => i === 0 || n <= order[i - 1] + 1), "heading levels skip: " + order.join(","));
        check(p, order.includes(5), "no h5 under the plan's lines: " + order.join(","));
        check(p, (await summaryHeads(page)) === 0, "a heading inside a summary");
        if (ctx.axeSource) {
          await h.injectAxe(page, ctx.axeSource);
          const bad = await page.evaluate(async () => {
            const r = await window.axe.run(document, { resultTypes: ["violations"] });
            return r.violations.map((v) => v.id + ": " + v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | "));
          });
          bad.forEach((b) => p.push("axe " + b));
        }
        return p;
      });
    }
    await panelCase("light", 1280);
    await panelCase("dark", 360);

    await kase("progress page with no take: no panel and no empty slot", {}, async (page) => {
      const p = [];
      await h.open(page, PROGRESS);
      const seen = await page.evaluate(() => ({ panel: !!document.getElementById("plan"), slot: !!document.querySelector(".diag-plan"), stats: !!document.querySelector(".stats") }));
      check(p, !seen.panel && !seen.slot, "a panel or an empty slot: " + JSON.stringify(seen));
      check(p, seen.stats, "the page itself is not drawn");
      return p;
    });

    await kase("progress page: a sign-out (bm.diag.v1 emptied, then a sync) removes the panel", {}, async (page) => {
      const p = [];
      await h.open(page, PAGE);
      await plant(page);
      await h.open(page, PROGRESS);
      check(p, await page.evaluate(() => !!document.getElementById("plan")), "no panel to begin with");
      await page.evaluate(() => {
        localStorage.setItem("bm.diag.v1", "{}");
        window.BMStore.emit({ type: "sync" });
      });
      await page.waitForFunction(() => !document.getElementById("plan"));
      check(p, await page.evaluate(() => !document.querySelector(".diag-plan")), "an empty slot is left");
      return p;
    });

    await kase("progress page: a reset keeps the panel and the take (decision 0003), from the Reset button and from the event", {}, async (page) => {
      const p = [];
      await h.open(page, PAGE);
      await plant(page);
      const before = await raw(page, "bm.diag.v1");
      /* the real button, on the About page */
      await h.open(page, "about.html");
      await page.locator('[data-action="reset-progress"]').click();
      await page.waitForFunction(() => /Placement-check results were kept/.test(document.querySelector('[data-action="reset-progress"]').textContent));
      check(p, (await raw(page, "bm.diag.v1")) === before, "bm.diag.v1 changed by the reset button");
      await h.open(page, PROGRESS);
      check(p, await page.evaluate(() => !!document.getElementById("plan")), "no panel after the reset");
      /* the event, on the progress page itself */
      await page.evaluate(() => { window.__marked = document.getElementById("plan"); window.BMProgress.reset(); window.BMStore.emit({ type: "reset" }); });
      check(p, await page.evaluate(() => !!document.getElementById("plan") && document.getElementById("plan") !== window.__marked), "the reset event did not redraw the page with the panel");
      check(p, (await raw(page, "bm.diag.v1")) === before, "bm.diag.v1 changed by the reset event");
      return p;
    });

    /* a take with a miss in a cleared course (Review first) */
    const MISS = { ...TAKE, blocks: [{ course: "geometry", pass: true, items: GEO.map((f, i) => ({ g: f[0], s: 101 + i, sec: f[1], k: i === 0 ? "wrong" : "right" })) }] };
    const compactState = (page) => page.evaluate(() => {
      const slot = document.querySelector("#plan .diag-plan");
      if (!slot) return null;
      const d = slot.querySelector("details.diag-plan-hand");
      const top = Array.from(slot.children).filter((e) => e.tagName === "H4").map((e) => e.textContent);
      return {
        top,
        fold: d ? { open: d.open, summary: (d.querySelector(":scope > summary") || {}).textContent, heads: Array.from(d.querySelectorAll(":scope > h4")).map((e) => e.textContent), fresh: d !== window.__old } : null,
        startHref: slot.querySelectorAll("li.diag-plan-first a").length
      };
    });

    await kase("progress page: the compact panel shows Start here (and Review first on a miss), with \"See the whole plan\" shut and holding the three lines", {}, async (page) => {
      const p = [];
      await h.open(page, PAGE);
      await plant(page);
      await h.open(page, PROGRESS);
      let st = await compactState(page);
      check(p, !!st && st.top.join() === "Start here", "visible lines with a clean take: " + JSON.stringify(st));
      check(p, !!st && !!st.fold && st.fold.open === false && st.fold.summary === "See the whole plan", "the fold: " + JSON.stringify(st && st.fold));
      check(p, !!st && !!st.fold && st.fold.heads.join() === "Coming up,Already in hand,Going further", "the fold's lines: " + JSON.stringify(st && st.fold));
      await page.evaluate((take) => localStorage.setItem("bm.diag.v1", JSON.stringify({ takes: { plan1: take } })), MISS);
      await reload(page);
      await h.open(page, PROGRESS);
      st = await compactState(page);
      check(p, !!st && st.top.join() === "Start here,Review first", "visible lines with a miss: " + JSON.stringify(st));
      check(p, !!st && !!st.fold && st.fold.open === false, "the fold is not shut: " + JSON.stringify(st && st.fold));
      return p;
    });

    await kase("progress page: \"See the whole plan\" keeps its open or shut through a redraw (a sync, a goal chip)", {}, async (page) => {
      const p = [];
      await h.open(page, PAGE);
      await plant(page);
      await h.open(page, PROGRESS);
      const state = async () => { const s = await compactState(page); return s && s.fold; };
      const mark = () => page.evaluate(() => {
        const d = document.querySelector(".diag-plan-hand");
        window.__old = d;
        window.__toggled = false;
        d.addEventListener("toggle", () => { window.__toggled = true; });
      });
      let st = await state();
      check(p, !!st && st.open === false, "it does not begin shut: " + JSON.stringify(st));
      await mark();
      await page.evaluate(() => window.BMStore.emit({ type: "sync" }));
      st = await state();
      check(p, !!st && st.fresh && st.open === false, "shut, after a sync: " + JSON.stringify(st));
      await mark();
      await page.locator(".diag-plan-hand summary").click();
      await page.waitForFunction(() => window.__toggled);
      await page.evaluate(() => window.BMStore.emit({ type: "sync" }));
      st = await state();
      check(p, !!st && st.fresh && st.open === true, "open, after a sync: " + JSON.stringify(st));
      await mark();
      await page.locator('[data-goal="50"]').click();
      await page.waitForFunction(() => document.querySelector('[data-goal="50"]').getAttribute("aria-pressed") === "true");
      st = await state();
      check(p, !!st && st.fresh && st.open === true, "open, after a goal chip: " + JSON.stringify(st));
      await mark();
      await page.locator(".diag-plan-hand summary").click();
      await page.waitForFunction(() => window.__toggled);
      await page.locator('[data-goal="30"]').click();
      await page.waitForFunction(() => document.querySelector('[data-goal="30"]').getAttribute("aria-pressed") === "true");
      st = await state();
      check(p, !!st && st.fresh && st.open === false, "shut again, after a goal chip: " + JSON.stringify(st));
      return p;
    });

    await kase("progress page: a take written in a second tab draws the panel without a reload, and removing it takes the panel away", {}, async (page, context) => {
      const p = [];
      await h.open(page, PROGRESS);
      check(p, await page.evaluate(() => !document.getElementById("plan")), "a panel before any take");
      const other = await context.newPage();
      try {
        await h.open(other, PAGE);
        await plant(other);
        await page.waitForFunction(() => !!document.getElementById("plan"), null, { timeout: 5000 });
        check(p, await page.evaluate(() => document.querySelectorAll("#plan").length === 1 && document.querySelectorAll(".diag-plan").length === 1), "duplicate panels after the write");
        await other.evaluate(() => localStorage.setItem("bm.diag.v1", "{}"));
        await page.waitForFunction(() => !document.getElementById("plan"), null, { timeout: 5000 });
        check(p, await page.evaluate(() => !document.querySelector(".diag-plan")), "an empty slot is left");
      } finally {
        await other.close();
      }
      return p;
    });
  }
};
