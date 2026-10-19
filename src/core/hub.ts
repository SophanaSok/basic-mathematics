/* The contents page's selection hash ("#ch03", "#ch03.one-unknown") and the chapter-level
   prerequisites its map draws. Pure: every function is handed what it reads. The dot
   keeps the hash clear of a chapter page's "#<sectionId>" and the page's "#part-<id>"
   anchors. */

import type { ChapterId, SectionId } from "../types/state.ts";
import { chapterById } from "./curriculum.ts";
import type { Curriculum } from "./curriculum.ts";

export interface HubSelection {
  chapter: ChapterId;
  section: SectionId | null;
}

/** The selection a hash names, or null when it names none that exists. */
export function parseHubHash(hash: string, curriculum: Curriculum | null | undefined): HubSelection | null {
  if (typeof hash !== "string") return null;
  const body = hash.charAt(0) === "#" ? hash.slice(1) : hash;
  if (!body) return null;
  const dot = body.indexOf(".");
  const chapterId = dot < 0 ? body : body.slice(0, dot);
  const sectionId = dot < 0 ? null : body.slice(dot + 1);
  if (!chapterId || sectionId === "" || (sectionId !== null && sectionId.indexOf(".") > -1)) return null;
  const chapter = chapterById(curriculum, chapterId);
  if (!chapter) return null;
  if (sectionId === null) return { chapter: chapterId as ChapterId, section: null };
  if (!(chapter.sections || []).some((s) => s.id === sectionId)) return null;
  return { chapter: chapterId as ChapterId, section: sectionId as SectionId };
}

/** The hash for a selection: "" for none. The inverse of parseHubHash. */
export function hubHash(sel: HubSelection | null): string {
  if (!sel) return "";
  return "#" + sel.chapter + (sel.section ? "." + sel.section : "");
}

/** The other chapters this chapter's sections require, in curriculum order, once each. */
export function chapterRequires(curriculum: Curriculum | null | undefined, chapterId: ChapterId): ChapterId[] {
  const chapter = chapterById(curriculum, chapterId);
  if (!chapter) return [];
  const named = new Set<string>();
  for (const s of chapter.sections || []) {
    const reqs = (s as { requires?: string[] }).requires;
    for (const ref of Array.isArray(reqs) ? reqs : []) {
      const id = String(ref).split("#")[0];
      if (id && id !== chapterId) named.add(id);
    }
  }
  const out: ChapterId[] = [];
  for (const part of curriculum && Array.isArray(curriculum.parts) ? curriculum.parts : []) {
    for (const ch of part.chapters || []) if (named.has(ch.id)) out.push(ch.id);
  }
  return out;
}

/** The hash a chapter page's "All chapters" link carries back to index.html. */
export function returnHash(chapterId: ChapterId, section?: SectionId | null): string {
  return hubHash({ chapter: chapterId, section: section || null });
}
