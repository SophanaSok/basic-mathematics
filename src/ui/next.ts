/* The "next best step" card: on the contents page under the Continue button, and at the top
   of each chapter, inside its banner (never a new child of <main>: assets/lesson.js cuts
   its steps from those). The items are src/learn/next.ts's; this file is the markup.

     - Up to three plain items, each a link and a line saying why it is there. No XP, no
       timer, nothing that moves or loops.
     - "Hide for today" puts the card away until the next local day, on this device only
       (bm.run.v1.nextHide, the day it was hidden); focus goes to the page's heading.
     - Study (calm) mode keeps the card, with the game colouring taken off (assets/review.css).
     - It is drawn once the page's scripts have run (it reads BMGame.deck()), and again after
       an account sync or a reset, never while the reader is answering.

   window.BMNext is a console and test handle. */

import { hiddenOn, nextSteps, type ChapterRef, type NextInput, type NextItem, type SectionRef } from "../learn/next.ts";
import { ARENA_SECTIONS } from "../data/arena-sections.ts";

const HIDE_KEY = "nextHide";

function runStore(): Record<string, unknown> {
  try {
    const r = window.BMStore.read(window.BMStore.keys.run, {});
    return r && typeof r === "object" && !Array.isArray(r) ? r : {};
  } catch { return {}; }
}

/** What next.ts needs, from the live stores; null when the game layer is not on the page. */
export function input(): NextInput | null {
  const Game = window.BMGame, Site = window.BMSite, Store = window.BMStore, C = window.BM_CURRICULUM;
  if (!Game || typeof Game.deck !== "function" || !Site || !Store || !C) return null;
  const sections: Record<string, SectionRef> = {};
  const chapters: ChapterRef[] = [];
  let index = 0;
  (C.chapters || []).forEach((ch: any) => {
    chapters.push({
      id: ch.id, name: Site.chapterName(ch), title: ch.title, path: ch.path,
      sections: ch.sections.map((s: any) => ({ id: s.id, title: s.title }))
    });
    ch.sections.forEach((s: any, i: number) => {
      const id = ch.id + "#" + s.id;
      sections[id] = {
        id, label: ch.label === "Interlude" ? "Interlude" : "§" + ch.label + "." + (i + 1),
        title: s.title, path: ch.path + "#" + s.id, chapter: ch.id, index: index++
      };
    });
  });
  const here = Site.chapterOf ? Site.chapterOf() : null;
  return {
    day: Site.dayKey(), deck: Game.deck({}) || [], arena: ARENA_SECTIONS, sections, chapters,
    last: Store.read(Store.keys.last, null), here: here ? here.id : null
  };
}

/** The items the card shows now: none once it is hidden for today. */
export function items(): NextItem[] {
  const inp = input();
  if (!inp || hiddenOn(runStore()[HIDE_KEY], inp.day)) return [];
  return nextSteps(inp);
}

let card: HTMLElement | null = null;

/* Where the card goes: a [data-next-step] placeholder if a page has one; on the contents
   page after the paragraph holding the Continue button; on a chapter, in its banner after
   the stats line. Nowhere else. */
function place(el: HTMLElement): boolean {
  const slot = document.querySelector("[data-next-step]:not(.next-step)");
  if (slot) { slot.appendChild(el); return true; }
  const cont = document.querySelector("[data-continue]");
  const para = cont ? cont.closest("p") : null;
  if (para && para.parentNode) { para.parentNode.insertBefore(el, para.nextSibling); return true; }
  const meta = document.querySelector("header.region-banner [data-banner-meta]");
  if (meta && meta.parentNode) { meta.parentNode.insertBefore(el, meta.nextSibling); return true; }
  return false;
}

/** The href as the page needs it: root-relative paths get the page's prefix, and a place in
    this very chapter becomes a fragment, so following it stays on the page (and lesson.js
    opens the steps up to it). */
function hrefFor(href: string): string {
  const Site = window.BMSite, here = Site.chapterOf ? Site.chapterOf() : null;
  if (here && href.indexOf(here.path + "#") === 0) return href.slice(here.path.length);
  return Site.rootPrefix() + href;
}

function html(list: NextItem[]): string {
  const esc = window.BMSite.escapeHtml;
  return '<div class="next-step-head"><h2 class="next-step-title" id="next-step-h">' + (list.length === 1 ? "Your next step" : "Your next steps") + "</h2>" +
    '<button type="button" class="btn ghost small next-step-hide" data-next-hide>Hide for today</button></div>' +
    '<ol class="next-step-list">' + list.map((it) =>
      '<li class="next-step-item" data-kind="' + it.kind + '"><a class="next-step-link" href="' + esc(hrefFor(it.href)) + '">' + esc(it.text) + "</a>" +
      '<p class="next-step-why">' + esc(it.why) + "</p></li>").join("") + "</ol>";
}

/** Draw the card from the stores as they are now, or take it away when it has nothing. */
export function render(): HTMLElement | null {
  const list = items();
  if (!list.length) {
    if (card && card.parentNode) card.parentNode.removeChild(card);
    card = null;
    return null;
  }
  if (!card) {
    const el = document.createElement("section");
    el.className = "next-step";
    el.setAttribute("data-next-step", "");
    el.setAttribute("aria-labelledby", "next-step-h");
    if (!place(el)) return null;
    card = el;
  }
  card.innerHTML = html(list);
  return card;
}

/** Put the card away until tomorrow, on this device. */
export function hide(): void {
  const Game = window.BMGame, Site = window.BMSite, day = Site.dayKey();
  if (Game && typeof Game.updateRun === "function") Game.updateRun((r: Record<string, unknown>) => { r[HIDE_KEY] = day; });
  else {
    const r = runStore();
    r[HIDE_KEY] = day;
    window.BMStore.write(window.BMStore.keys.run, r, true);
  }
  const had = card && card.contains(document.activeElement);
  render();
  if (had) {
    const h = document.querySelector("main h1") as HTMLElement | null;
    if (h) {
      if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
      try { h.focus({ preventScroll: true }); } catch { h.focus(); }
    }
  }
  if (Game && typeof Game.announce === "function") Game.announce("Next steps hidden until tomorrow.", { key: "next" });
}

function mount(): void {
  if (!window.BMSite || !window.BMStore) return;
  render();
  document.addEventListener("click", (e) => {
    const t = e.target as Element | null;
    const btn = t && t.closest ? t.closest("[data-next-hide]") : null;
    if (btn && card && card.contains(btn)) hide();
  });
  window.BMStore.on((c: { type?: string }) => {
    if (c && (c.type === "sync" || c.type === "reset")) render();
  });
}

export const api = { render, items, input, hide };

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.BMNext = api;
  /* after the rest of the page's modules (site.js, game.js) have run */
  let done = false;
  const go = () => { if (!done) { done = true; mount(); } };
  if (document.readyState === "complete") setTimeout(go, 0);
  else {
    document.addEventListener("DOMContentLoaded", go);
    window.addEventListener("load", go);
  }
}
