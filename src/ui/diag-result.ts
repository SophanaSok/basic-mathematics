/* The placement check's result and its return view (diagnostic.html): a finished take drawn
   as the course it places the learner in, a row for each course, what each course's questions
   covered, and, straight after finishing, the answers from the live run. Design:
   ~/.claude/plans/diagnostic-design.md, §2.4 (the result) and §2.5 (coming back).

   What this file holds to (the D-9 threat model, C1, C2, F1):
   - Nothing is written as HTML: createElement and textContent only. A take is read from
     storage, which is untrusted, so every course name, band and label comes from a fixed table
     keyed by a value checked here; an unknown value skips its row and is never printed.
     Counts are String(n). Dates are rebuilt from a day key that matched yyyy-mm-dd.
   - The typed answers and the grader's reading live in the caller's memory only (`live`) and
     are shown as textContent, in a node renderMath never sees. renderMath runs only on nodes
     that hold a generator's own text (a question, an answer, a worked step).
   - Takes are read through latestTake and takesOf only (src/learn/diag-seed.ts).
   - The plan (src/ui/plan.ts) fills the slot marked below; this file adds only its heading. */

import { formMessage } from "../core/answer/messages.ts";
import type { FormReason } from "../core/answer/types.ts";
import { GRADER } from "../core/answer/check.ts";
import { BLUEPRINT, DIAG_PASS, DIAG_SIZE } from "../learn/constants.ts";
import { COVERAGE, L, PRE, closeBy, formatOf, isPlaceable, type DiagBlock, type DiagKind, type DiagTake, type Placeable } from "../learn/diagnostic.ts";
import { latestTake, takesOf } from "../learn/diag-seed.ts";

/** One answered question of the run just finished, as the page remembers it. `typed` and
    `read` exist only in memory and are absent after a reload. */
export interface LiveAnswer { g: string; s: number; k: DiagKind; r?: string; u?: number; typed?: string; read?: unknown }

export interface ResultOptions {
  /** id of the heading, which the caller moves focus to */
  headId: string;
}

const NAME: Readonly<Record<Placeable, string>> = {
  "pre-algebra": "Pre-algebra", "algebra-1": "Algebra 1", "geometry": "Geometry", "algebra-2": "Algebra 2"
};
const SHORT: Readonly<Record<Placeable, keyof typeof DIAG_SIZE>> = {
  "pre-algebra": "pre", "algebra-1": "a1", "geometry": "geo", "algebra-2": "a2"
};
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const KINDS: readonly string[] = ["right", "form", "wrong", "skip"];
const REASONS: readonly string[] = ["rounded", "notation", "repeated", "grid-width", "unreduced"];

const NOTE = "This is a starting point in this course, checked in your browser. It isn't a grade, a nationally normed test, or a predicted SAT, ACT or placement-test score. The rule hasn't been checked against real learners yet. If the suggestion doesn't match what you know, trust what you know.";
const PRE_ALGEBRA = "Start with Pre-algebra. This course begins with algebra, so your plan starts with the pre-algebra sections it covers, and the skill packs when they're ready.";
const ALL = "You did well on every course we asked about. Your plan starts with review and then the chapters that go further.";
const GEOMETRY = "Geometry here meant coordinates, lines, circles and sets. If you haven't studied proofs or transformations, the Geometry chapters are still worth working through.";
const RUSHED = "Some answers came very fast. If any were guesses, this suggestion may be too low. Your review schedule wasn't changed.";
const SKIM = "Looked solid on what we asked. You can skim the parts we asked about when you get there.";
const RETURN_LINE = "You've finished this check.";
const EARLIER_NOTE = "Taken in this browser or on your other devices.";
const OLD_VERSION = "checked by an earlier version";
const FEW_TRIES = "This one took a few tries to type.";

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const own = (o: Record<string, unknown>, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined);

function node<K extends keyof HTMLElementTagNameMap>(tag: K, line?: string, cls?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (line !== undefined) el.textContent = line;
  if (cls) el.className = cls;
  return el;
}

/* ------------------------------------------------------------- reading a take -- */

interface Count { asked: boolean; right: number; not: number; clear: boolean }

interface View {
  band: Placeable;
  all: boolean;
  rushed: boolean;
  count: Record<Placeable, Count>;
  implied: Set<Placeable>;
  blocks: DiagBlock[];
  close: "count" | "form" | null;
}

/** A take as the page draws it, built only from values it checked; null when it is no take
    the page can draw. */
function viewOf(take: unknown): View | null {
  if (!isObj(take)) return null;
  const band = own(take, "band");
  const raw = own(take, "blocks");
  if (!isPlaceable(band) || !Array.isArray(raw)) return null;
  const count = {} as Record<Placeable, Count>;
  L.forEach((c) => { count[c] = { asked: false, right: 0, not: 0, clear: false }; });
  const blocks: DiagBlock[] = [];
  raw.forEach((b) => {
    if (!isObj(b)) return;
    const course = own(b, "course");
    const items = own(b, "items");
    if (!isPlaceable(course) || !Array.isArray(items) || count[course].asked) return;
    const kinds = items.map((i) => (isObj(i) ? own(i, "k") : undefined)).filter((k): k is DiagKind => typeof k === "string" && KINDS.includes(k));
    if (kinds.length === 0) return;
    const c = count[course];
    c.asked = true;
    c.right = kinds.filter((k) => k === "right").length;
    c.not = kinds.length - c.right;
    c.clear = own(b, "pass") === true;
    blocks.push({ course, pass: c.clear, items: kinds.map((k) => ({ g: "", s: 0, sec: "" as never, k })) });
  });
  const implied = new Set<Placeable>();
  L.forEach((c) => {
    if (!count[c].clear) return;
    for (let p = PRE[c]; p; p = PRE[p]) if (!count[p].asked) implied.add(p);
  });
  const close = own(take, "close") === band ? closeBy(blocks, band) : null;
  return { band, all: own(take, "all") === true, rushed: own(take, "rushed") === true, count, implied, blocks, close };
}

/** Geometry cleared and still the band: the learner said they had not finished it (§3.4). */
const heldOf = (v: View): boolean => v.band === "geometry" && v.count.geometry.clear;

/** What a row says (the status words of §2.4). Null skips the row. */
function statusOf(v: View, c: Placeable): string | null {
  const n = v.count[c];
  const tally = String(n.right) + " right, " + String(n.not) + " not yet.";
  const at = L.indexOf(c), bandAt = L.indexOf(v.band);
  if (n.asked && n.clear) {
    if (c === "geometry" && heldOf(v)) {
      return "Start here. Your answers on coordinates, lines, circles and sets looked solid (" + tally.replace(/\.$/, "") +
        "). Begin with the parts this check didn't ask about.";
    }
    if (at > bandAt) return SKIM;
    return (c === "pre-algebra" || c === "algebra-1" ? "Ready. " : "Looked solid on what we asked. ") + tally;
  }
  if (n.asked) return (c === v.band ? "Start here. " : "Not yet. ") + tally;
  if (v.implied.has(c)) {
    const by = L.find((x) => v.count[x].clear && (() => { for (let p = PRE[x]; p; p = PRE[p]) if (p === c) return true; return false; })());
    if (by) return "Not asked. Because you did well in " + NAME[by] + ", we skipped it. Skim it if it looks familiar.";
  }
  /* Below the band, neither asked nor implied: no walk ends that way (every course below the
     band is cleared, asked or implied, §3.4), so only a hostile or damaged take gets here. It
     is not "Later", which would say the course comes after the band: the row is left out. */
  if (at < bandAt) return null;
  return "Later";
}

/** "October 7, 2026" from a day key that is yyyy-mm-dd and a real day, else null. The day is
    rebuilt with Date.UTC and must come back as it went in, so February 31 or month 13 is no
    date (and a year below 100, which Date.UTC reads as 19xx, is none either). */
function dateOf(day: unknown): string | null {
  const m = typeof day === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(day) : null;
  if (!m) return null;
  const year = +m[1], month = +m[2] - 1, d = +m[3];
  const at = new Date(Date.UTC(year, month, d));
  if (at.getUTCFullYear() !== year || at.getUTCMonth() !== month || at.getUTCDate() !== d) return null;
  return MONTH[month] + " " + String(d) + ", " + m[1];
}

/* ---------------------------------------------------------------- the pieces -- */

function table(v: View): HTMLTableElement {
  const t = node("table", undefined, "diag-table");
  const head = t.createTHead().insertRow();
  [["Course", "col"], ["What your answers showed", "col"]].forEach(([line, scope]) => {
    const th = node("th", line);
    th.scope = scope;
    head.appendChild(th);
  });
  const body = t.createTBody();
  L.forEach((c) => {
    const status = statusOf(v, c);
    if (status === null) return;
    const row = body.insertRow();
    const th = node("th", NAME[c]);
    th.scope = "row";
    row.appendChild(th);
    row.insertCell().textContent = status;
  });
  return t;
}

function coverage(v: View): HTMLDetailsElement {
  const d = node("details", undefined, "diag-coverage");
  d.open = v.count.geometry.asked || v.count["algebra-2"].asked;
  d.appendChild(node("summary", "What each course's questions covered"));
  const list = node("ul");
  L.forEach((c) => list.appendChild(node("li", NAME[c] + ": " + COVERAGE[c].line)));
  d.appendChild(list);
  return d;
}

/** The lines under the headline, in the order of §2.4. `live` says the answer list is there. */
function lines(v: View, live: boolean): HTMLElement[] {
  const out: HTMLElement[] = [];
  if (v.close === "count") {
    const key = SHORT[v.band];
    out.push(node("p", "You got " + String(v.count[v.band].right) + " of " + String(DIAG_SIZE[key]) + " in " + NAME[v.band] +
      ", close to the " + String(DIAG_PASS[key]) + " we look for."));
  } else if (v.close === "form") {
    out.push(node("p", "Some " + NAME[v.band] + " answers had the right value written another way." + (live ? " You'll see which ones below." : "")));
  }
  if (v.band === "pre-algebra") out.push(node("p", PRE_ALGEBRA));
  if (v.all) out.push(node("p", ALL));
  if (v.count.geometry.clear && !heldOf(v)) out.push(node("p", GEOMETRY));
  if (v.rushed) out.push(node("p", RUSHED, "diag-note"));
  return out;
}

/** The plan goes here (src/ui/plan.ts fills it), built from the take this view draws, so a
    take that did not save gets its own plan. No plan, no heading: the slot stays empty. */
function planSlot(take: unknown): HTMLElement {
  const slot = node("div", undefined, "diag-plan");
  slot.id = "diag-plan";
  slot.setAttribute("data-slot", "plan");
  try { window.BMPlan?.render(slot, take); } catch { slot.replaceChildren(); }
  if (slot.childNodes.length) slot.insertBefore(node("h3", "Your plan"), slot.firstChild);
  return slot;
}

/* ------------------------------------------------------------ the answer list -- */

interface Made { q?: unknown; answer?: unknown; steps?: unknown; type?: unknown }

function madeOf(g: string, s: number): Made | null {
  try {
    const p = window.BMGen?.make(g, s);
    return p && typeof p === "object" ? (p as Made) : null;
  } catch {
    return null;
  }
}

function typeset(el: HTMLElement): void {
  try { window.BMSite.renderMath(el); } catch { /* the plain text stays */ }
}

function formLine(a: LiveAnswer, p: Made | null): string {
  const label = "Right value, written another way:";
  if (typeof a.r !== "string" || !REASONS.includes(a.r)) return label;
  const reason = a.r as FormReason;
  if (typeof a.read === "string" && a.read !== "") return label + " " + formMessage(reason, a.read);
  if (reason === "notation") {
    const f = formatOf(a.g, p && typeof p.type === "string" ? p.type : null);
    return label + (f ? " " + f : "");
  }
  return label + " " + formMessage(reason, "");
}

function answers(live: readonly LiveAnswer[]): HTMLElement | null {
  const rows = live.filter((a) => typeof a.g === "string" && KINDS.includes(a.k));
  if (rows.length === 0) return null;
  const d = node("details", undefined, "diag-answers");
  d.appendChild(node("summary", "See your answers"));
  const t = node("table", undefined, "diag-table");
  const head = t.createTHead().insertRow();
  ["Question", "How it went"].forEach((line) => { const th = node("th", line); th.scope = "col"; head.appendChild(th); });
  const body = t.createTBody();
  rows.forEach((a) => {
    const p = madeOf(a.g, a.s);
    const row = body.insertRow();
    const qh = node("th", typeof p?.q === "string" ? p.q : "");
    qh.scope = "row";
    row.appendChild(qh);
    if (qh.textContent) typeset(qh);
    const cell = row.insertCell();
    const first = node("p", a.k === "right" ? "Right" : a.k === "skip" ? "Skipped" : a.k === "form" ? formLine(a, p) : "Not yet");
    cell.appendChild(first);
    if (a.k === "wrong" && p && typeof p.answer === "string") {
      const key = node("p");
      key.appendChild(document.createTextNode("The answer is "));
      const val = node("span", p.answer.split("|")[0]);
      key.appendChild(val);
      key.appendChild(document.createTextNode("."));
      cell.appendChild(key);
      typeset(val);
    }
    if (a.k !== "skip" && typeof a.typed === "string" && a.typed !== "") {
      /* memory only, and never given to renderMath */
      cell.appendChild(node("p", "You typed: " + a.typed, "diag-typed"));
    }
    if (typeof a.u === "number" && a.u > 0) cell.appendChild(node("p", FEW_TRIES));
    const steps = p && Array.isArray(p.steps) ? p.steps.filter((x): x is string => typeof x === "string") : [];
    if (steps.length) {
      const how = node("details");
      how.appendChild(node("summary", "Show how"));
      const list = node("ol", undefined, "diag-steps");
      steps.forEach((line) => list.appendChild(node("li", line)));
      how.appendChild(list);
      cell.appendChild(how);
      typeset(list);
    }
  });
  d.appendChild(t);
  return d;
}

/* ------------------------------------------------------------------- views -- */

/** The result of a take just finished, into `into`. `live` is the run's answers, or null
    (a take read back from storage has none). Returns false when the take cannot be drawn. */
export function renderResult(into: HTMLElement, take: unknown, live: readonly LiveAnswer[] | null, opts: ResultOptions): boolean {
  const v = viewOf(take);
  into.replaceChildren();
  if (!v) return false;
  const head = node("h2", "Start with: " + NAME[v.band]);
  head.id = opts.headId;
  head.tabIndex = -1;
  into.appendChild(head);
  lines(v, !!live).forEach((el) => into.appendChild(el));
  into.appendChild(table(v));
  into.appendChild(node("p", NOTE, "diag-small"));
  into.appendChild(coverage(v));
  into.appendChild(planSlot(take));
  const list = live ? answers(live) : null;
  if (list) into.appendChild(list);
  return true;
}

/** The earlier takes, newest first: each a readable take other than the latest, read through
    latestTake one id at a time so the same rules apply. */
function earlierOf(diag: unknown, latest: DiagTake): DiagTake[] {
  const takes = isObj(diag) ? own(diag, "takes") : undefined;
  if (!isObj(takes)) return [];
  const out: { id: string; take: DiagTake }[] = [];
  takesOf(diag).forEach((id) => {
    const one = latestTake({ takes: { [id]: own(takes, id) } });
    if (one && one !== latest) out.push({ id, take: one });
  });
  out.sort((a, b) => (a.take.day < b.take.day ? 1 : a.take.day > b.take.day ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return out.map((x) => x.take);
}

/** The return view of the takes in `diag` (bm.diag.v1 as stored), into `into`: the latest
    result, the earlier ones and the link to take it again. Returns false when no take can
    be read as a result (the view then says only that the check is finished). */
export function renderReturn(into: HTMLElement, diag: unknown, opts: ResultOptions): boolean {
  into.replaceChildren();
  const latest = latestTake(diag);
  const v = latest ? viewOf(latest) : null;
  if (!latest || !v) {
    const head = node("h2", "Your starting point");
    head.id = opts.headId;
    head.tabIndex = -1;
    into.appendChild(head);
    into.appendChild(node("p", RETURN_LINE));
    into.appendChild(again());
    return false;
  }
  const head = node("h2", "Your starting point: " + NAME[v.band]);
  head.id = opts.headId;
  head.tabIndex = -1;
  into.appendChild(head);
  const when = dateOf(latest.day);
  if (when) into.appendChild(node("p", "Checked on " + when));
  lines(v, false).forEach((el) => into.appendChild(el));
  into.appendChild(table(v));
  into.appendChild(node("p", NOTE, "diag-small"));
  into.appendChild(coverage(v));
  into.appendChild(planSlot(latest));
  const before = earlierOf(diag, latest).map((t) => {
    const band = isPlaceable(t.band) ? NAME[t.band] : null;
    if (!band) return null;
    const day = dateOf(t.day);
    const old = t.blueprint !== BLUEPRINT || t.grader !== GRADER;
    return (day ?? "Earlier") + ": " + band + (old ? " (" + OLD_VERSION + ")" : "");
  }).filter((x): x is string => x !== null);
  if (before.length) {
    into.appendChild(node("h3", "Earlier results"));
    const list = node("ul");
    before.forEach((line) => list.appendChild(node("li", line)));
    into.appendChild(list);
    into.appendChild(node("p", EARLIER_NOTE, "diag-small"));
  }
  into.appendChild(again());
  return true;
}

/** "Take it again": a runtime link to the Prep page's re-take section (§7.3). */
function again(): HTMLElement {
  const p = node("p");
  const a = node("a", "Take it again", "btn big");
  a.setAttribute("href", "prep.html#diagnostic");
  p.appendChild(a);
  return p;
}

export const api = { renderResult, renderReturn };
