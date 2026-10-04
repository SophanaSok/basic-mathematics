"use strict";
/* Driving exercises in the live page, the way a reader would: type into the field and
   press Enter, tick tiles and press Check, fill blanks, move order lines with their
   buttons. Each function takes a Playwright Locator for one `.ex` card. */

/* the engine's alternatives(): the raw key first, then its |-separated pieces */
function alternatives(raw) {
  raw = (raw || "").trim();
  return [raw].concat(raw.split("|")).map(s => s.trim()).filter(s => s !== "");
}

async function info(ex) {
  return ex.evaluate(el => ({
    key: el.getAttribute("data-key"), kind: el.getAttribute("data-kind"), type: el.getAttribute("data-type") || "exact",
    inline: el.hasAttribute("data-inline"), answer: el.getAttribute("data-answer") || "", hint: el.getAttribute("data-hint") || "",
    state: el.getAttribute("data-state"), id: el.id
  }));
}

async function state(ex) { return ex.evaluate(el => el.getAttribute("data-state")); }
async function feedbackText(ex) {
  return ex.evaluate(el => { const f = el.querySelector(".ex-feedback"); return f && f.getAttribute("data-show") === "true" ? f.textContent.replace(/\s+/g, " ").trim() : ""; });
}
async function feedbackVisible(ex) {
  const f = ex.locator(".ex-feedback");
  return (await f.count()) > 0 && (await f.isVisible()) && (await f.getAttribute("data-show")) === "true";
}

async function clickCheck(ex) { await ex.locator(".ex-form .btn", { hasText: /^Check$/ }).click(); }

/* type one value and press Enter */
async function typeAnswer(ex, value) {
  const input = ex.locator(".ex-form input[type=text]").first();
  await input.fill("");
  await input.fill(value);
  await input.press("Enter");
}

/* answer with the key, by kind; returns { ok, tried, note } */
async function answerWithKey(ex, meta) {
  meta = meta || await info(ex);
  const kind = meta.kind;
  if (kind === "text") {
    const alts = alternatives(meta.answer);
    let tried = 0;
    for (const a of alts) {
      await typeAnswer(ex, a);
      tried++;
      if ((await state(ex)) === "correct") return { ok: true, tried, used: a };
    }
    return { ok: false, tried, used: alts[alts.length - 1] };
  }
  if (kind === "choice" || kind === "multi") {
    const first = alternatives(meta.answer)[meta.answer.indexOf("|") > -1 ? 1 : 0] || meta.answer;
    const idx = first.split(/[,;]/).map(s => parseInt(s.trim(), 10)).filter(n => n > 0);
    const inputs = ex.locator(".choices input");
    const n = await inputs.count();
    for (const i of idx) {
      if (i > n) return { ok: false, tried: 1, note: "index " + i + " > " + n + " options" };
      const inp = inputs.nth(i - 1);
      if (!(await inp.isChecked())) await ex.locator(".choices label.choice").nth(i - 1).click();
    }
    await clickCheck(ex);
    return { ok: (await state(ex)) === "correct", tried: 1 };
  }
  if (kind === "blank") {
    const blanks = ex.locator("input.blank");
    const n = await blanks.count();
    for (let i = 0; i < n; i++) {
      const b = blanks.nth(i);
      const key = await b.getAttribute("data-answer");
      await b.fill(alternatives(key)[1] || alternatives(key)[0] || "");
    }
    await clickCheck(ex);
    return { ok: (await state(ex)) === "correct", tried: 1 };
  }
  if (kind === "order") {
    /* restore the authored order with the up buttons: items carry data-i */
    await ex.evaluate(el => {
      const list = el.querySelector("ol.order, ul.order");
      if (!list) return;
      const n = list.children.length;
      for (let i = 0; i < n; i++) {
        for (let guard = 0; guard < n; guard++) {
          const items = Array.from(list.children);
          const pos = items.findIndex(li => li.getAttribute("data-i") === String(i));
          if (pos <= i) break;
          const up = items[pos].querySelector('.order-move[aria-label="Move this line up"]');
          if (!up) break;
          up.click();
        }
      }
    });
    await clickCheck(ex);
    return { ok: (await state(ex)) === "correct", tried: 1 };
  }
  return { ok: false, tried: 0, note: "kind " + kind + " is not driven" };
}

/* a deliberately wrong answer for a typed exercise */
async function answerWrong(ex, meta) {
  meta = meta || await info(ex);
  if (meta.kind !== "text") throw new Error("answerWrong only drives typed exercises");
  const wrong = meta.type === "number" || meta.type === "fraction" || meta.type === "set" ? "987654321" : "notananswer987";
  await typeAnswer(ex, wrong);
}

/* the longest piece of a hint outside $…$, so KaTeX rendering cannot hide it */
function hintFragment(hint) {
  const pieces = String(hint).split(/\$[^$]*\$/).map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  pieces.sort((a, b) => b.length - a.length);
  const p = pieces[0] || "";
  return p.length > 30 ? p.slice(0, 30).trim() : p;
}

module.exports = { alternatives, info, state, feedbackText, feedbackVisible, clickCheck, typeAnswer, answerWithKey, answerWrong, hintFragment };
