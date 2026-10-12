/* The go-to palette's rules, with no DOM: which targets a page offers and how a typed query
   ranks them. src/ui/keys.ts is the DOM half; it reads the page's sections and exercises,
   shows the list, and moves focus or opens the page. Pure: no window, document or storage. */

import type { Chapter, Curriculum } from "../core/curriculum.ts";
import type { Kind } from "./keymap.ts";

export interface Target {
  kind: "section" | "exercise" | "chapter" | "page";
  label: string;
  hint?: string;
  /** an in-page element the DOM half focuses and scrolls to */
  id?: string;
  /** a page to open */
  href?: string;
}

export interface TargetsInput {
  kind: Kind;
  curriculum: Curriculum | null;
  chapterId?: string | null;
  sections?: { id: string; title: string }[];
  exercises?: { id: string; label: string }[];
  root: string;
}

const PAGES: [string, string][] = [
  ["Home", "index.html"],
  ["Arena", "arena.html"],
  ["Your progress", "progress.html"],
  ["How to use this", "about.html"],
  ["Your account", "account.html"],
  ["Placement check", "diagnostic.html"],
];

function chaptersOf(c: Curriculum | null): { chapter: Chapter; hint: string }[] {
  const out: { chapter: Chapter; hint: string }[] = [];
  try {
    if (!c) return out;
    const hintOf = (ch: Chapter) => (ch.part && ch.part.name) || "Chapter";
    const parts = Array.isArray(c.parts) ? c.parts : [];
    const flat: Chapter[] = Array.isArray(c.chapters)
      ? c.chapters
      : parts.filter((p) => !p.beside).flatMap((p) => (p.chapters || []).map((ch) => ({ ...ch, part: ch.part || p })));
    const seen = new Set<Chapter | string>();
    const add = (ch: Chapter, hint: string) => {
      if (!ch || typeof ch.path !== "string" || !ch.path || seen.has(ch.id)) return;
      seen.add(ch.id);
      out.push({ chapter: ch, hint });
    };
    for (const ch of flat) if (!(ch.part && ch.part.beside)) add(ch, hintOf(ch));
    for (const p of parts) {
      if (!p.beside) continue;
      for (const ch of p.chapters || []) add(ch, p.name);
    }
    /* a flattened list that already held a beside Part's chapters keeps them last */
    for (const ch of flat) if (ch.part && ch.part.beside) add(ch, hintOf(ch));
  } catch {
    return [];
  }
  return out;
}

export function targetsOf(input: TargetsInput): Target[] {
  const out: Target[] = [];
  if (input.kind === "chapter") {
    for (const s of input.sections || []) out.push({ kind: "section", label: s.title, hint: "Section", id: s.id });
    for (const e of input.exercises || []) out.push({ kind: "exercise", label: e.label, hint: "Exercise", id: e.id });
  }
  for (const { chapter, hint } of chaptersOf(input.curriculum)) {
    out.push({
      kind: "chapter",
      label: `${chapter.label} ${chapter.title}`,
      hint,
      href: input.root + (chapter.path as string),
    });
  }
  for (const [label, file] of PAGES) out.push({ kind: "page", label, hint: "Page", href: input.root + file });
  return out;
}

/** "Exercise 3" from the card's .ex-num text, or the key when the text is empty */
export function labelOfExercise(numText: string, key: string): string {
  const t = (numText || "").replace(/\s+/g, " ").trim();
  if (!t) return key;
  /* "Your turn" and "Section check" cards share a label, so the key tells them apart */
  return /\d\s*$/.test(t) || !key ? t : t + " (" + key + ")";
}

/* scores: 5 an exact alias, 4 prefix, 3 word start, 2 substring, 1 subsequence */
function score(text: string, q: string): number {
  const t = text.toLowerCase();
  if (!t) return 0;
  if (t.startsWith(q)) return 4;
  if (t.split(/[^a-z0-9]+/).some((w) => w && w.startsWith(q))) return 3;
  if (t.includes(q)) return 2;
  let i = 0;
  for (const ch of t) if (ch === q[i] && ++i === q.length) return 1;
  return 0;
}

function aliases(t: Target): string[] {
  const out: string[] = [];
  if (t.kind === "exercise") {
    /* "e3" names Exercise 3, not Warm-up 3 */
    const m = /^exercise\s+(\d+)\s*$/i.exec(t.label);
    if (m) out.push("e" + m[1]);
    const tail = (t.id || "").split(/[^a-z0-9]+/i).filter(Boolean).pop();
    if (tail) out.push(tail.toLowerCase());
  } else if (t.kind === "chapter") {
    const m = /(\d+)/.exec(t.label);
    if (m) {
      const n = String(Number(m[1]));
      out.push(n, "ch" + n, "chapter " + n);
    }
  }
  return out;
}

export function rank(query: string, targets: Target[], limit = 12): Target[] {
  const q = (query || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return targets.slice(0, limit);
  const scored: { t: Target; s: number; i: number }[] = [];
  targets.forEach((t, i) => {
    const s = aliases(t).includes(q) ? 5 : Math.max(score(t.label, q), score(t.hint || "", q) / 2);
    if (s > 0) scored.push({ t, s, i });
  });
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  return scored.slice(0, limit).map((x) => x.t);
}
