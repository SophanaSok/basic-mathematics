/* The study plan on the page: gathers what planOf (src/learn/plan.ts) needs from the
   globals, asks it for the plan, and draws the lines of design section 8 in display order.
   window.BMPlan.render(el) fills `el`, or leaves it empty when there is no plan.

   What this file holds to (the D-9 threat model C1/C2, and the D-12 brief):
   - Nothing is written as HTML: createElement and textContent only.
   - The plan is derived on every call and nothing is stored. A take comes from storage,
     which is untrusted, and is read only through latestTake. Every title and every link
     comes from the curriculum (window.BM_CURRICULUM), never from storage; course labels and
     tag words come from fixed tables. Counts are String(n).
   - Each read of a global is guarded: a missing global or a throw gives no plan, never a
     page error. Section titles are plain text, so renderMath is not needed. */

import type { SectionRef } from "../types/state.ts";
import { latestTake } from "../learn/diag-seed.ts";
import { planOf, TAG_TEXT, type Plan, type PlanGroup, type PlanItem } from "../learn/plan.ts";
import { SECTION_WORK } from "../data/section-work.ts";
import { skillOf } from "../data/skills.ts";

interface Place { title: string; href: string }

/** Every section of the curriculum in reading order, with its title and its page address
    relative to the current page. Null when the curriculum cannot be read. */
function outline(): Map<SectionRef, Place> | null {
  const cur = window.BM_CURRICULUM;
  const chapters: unknown = cur && (cur.chapters || (cur.parts || []).flatMap((p: { chapters?: unknown[] }) => p.chapters || []));
  if (!Array.isArray(chapters)) return null;
  const root: string = String(window.BMSite.rootPrefix());
  const out = new Map<SectionRef, Place>();
  chapters.forEach((ch: { id?: unknown; path?: unknown; sections?: unknown }) => {
    if (typeof ch.id !== "string" || typeof ch.path !== "string" || !Array.isArray(ch.sections)) return;
    ch.sections.forEach((s: { id?: unknown; title?: unknown }) => {
      if (typeof s.id !== "string" || typeof s.title !== "string") return;
      out.set((ch.id + "#" + s.id) as SectionRef, { title: s.title, href: root + ch.path + "#" + s.id });
    });
  });
  return out;
}

function gather(): { plan: Plan; where: Map<SectionRef, Place> } | null {
  try {
    const take = latestTake(window.BMStore.read(window.BMStore.keys.diag, {}));
    if (!take) return null;
    const where = outline();
    if (!where) return null;
    const rows = new Map<string, { solved: number }>();
    (window.BMInsights.sections() as { id: string; solved: number }[]).forEach((r) => {
      if (r && typeof r.id === "string") rows.set(r.id, { solved: Number(r.solved) || 0 });
    });
    const plan = planOf({
      take,
      today: String(window.BMSite.dayKey()),
      refs: [...where.keys()],
      titleOf: (r) => where.get(r)?.title,
      skillOf,
      status: (r) => String(window.BMGame.sectionStatus(r)),
      row: (r) => rows.get(r) ?? null,
      work: SECTION_WORK,
      packs: []
    });
    return plan ? { plan, where } : null;
  } catch {
    return null;
  }
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, line?: string, cls?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (line !== undefined) el.textContent = line;
  if (cls) el.className = cls;
  return el;
}

function itemLine(i: PlanItem, where: Map<SectionRef, Place>): HTMLElement {
  const li = node("li");
  const place = where.get(i.ref);
  const name = (i.read ? "Read: " : "") + (place?.title ?? i.title ?? "");
  if (i.highlight && place) {
    li.className = "diag-plan-first";
    const a = node("a", name);
    a.href = place.href;
    li.appendChild(a);
  } else {
    li.appendChild(document.createTextNode(name));
  }
  if (i.tag) li.appendChild(document.createTextNode(" (" + TAG_TEXT[i.tag] + ")"));
  return li;
}

function list(items: readonly PlanItem[], where: Map<SectionRef, Place>): HTMLUListElement {
  const ul = node("ul");
  items.forEach((i) => ul.appendChild(itemLine(i, where)));
  return ul;
}

function groupBlock(g: PlanGroup, where: Map<SectionRef, Place>, head: string): HTMLElement {
  const d = node("div", undefined, "diag-plan-group");
  d.appendChild(node("p", head + " (" + String(g.count) + (g.count === 1 ? " section" : " sections") + ")"));
  d.appendChild(list(g.items, where));
  return d;
}

function draw(el: Element, p: Plan, where: Map<SectionRef, Place>): void {
  const add = (n: Node) => el.appendChild(n);
  if (p.movedNote) add(node("p", p.movedNote));

  add(node("h4", "Start here"));
  if (p.startHere.length) add(list(p.startHere, where));
  else add(node("p", p.finished ? "You have worked through every course here." : "Nothing left in this course."));

  if (p.reviewFirst.length) {
    add(node("h4", "Review first"));
    add(list(p.reviewFirst, where));
  }

  if (p.packs.length) {
    add(node("h4", "Skill packs"));
    const ul = node("ul");
    p.packs.forEach((k) => {
      const li = node("li");
      li.appendChild(document.createTextNode(k.title));
      ul.appendChild(li);
    });
    add(ul);
  }

  const coming = p.comingUp.filter((g) => g.count > 0);
  if (coming.length) {
    add(node("h4", "Coming up"));
    coming.forEach((g) => add(groupBlock(g, where, g.label)));
  }

  const hand = p.inHand.filter((g) => g.count > 0);
  if (hand.length) {
    const d = node("details", undefined, "diag-plan-hand");
    d.appendChild(node("summary", "Already in hand"));
    d.appendChild(node("p", "You can skim these."));
    hand.forEach((g) => d.appendChild(groupBlock(g, where, g.kind === "implied" ? g.label + ": " + g.heading : g.label)));
    add(d);
  }

  if (p.goingFurther.length) {
    add(node("h4", "Going further"));
    add(list(p.goingFurther, where));
  }
}

/** Draw the plan into `el`, replacing what is there; leave it empty when there is no plan. */
function render(el: Element): void {
  el.replaceChildren();
  const got = gather();
  if (!got) return;
  try {
    draw(el, got.plan, got.where);
  } catch {
    el.replaceChildren();
  }
}

export const api = { render };

if (typeof window !== "undefined") window.BMPlan = api;
