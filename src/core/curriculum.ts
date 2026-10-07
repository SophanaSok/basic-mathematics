/* The course's outline (data/curriculum.js, window.BM_CURRICULUM) as types, and the refs
   that name a section, an exercise or an Arena generator from anywhere. Pure: every
   function is handed what it reads. */

import type { ChapterId, ExerciseKey, SectionId, SectionRef } from "../types/state.ts";

export interface Section {
  id: SectionId;
  title: string;
  summary?: string;
}

export interface Chapter {
  id: ChapterId;
  label: string;
  title: string;
  /** the page's file name inside its part's directory */
  file: string;
  status?: string;
  blurb?: string;
  sections: Section[];
  /** set by data/curriculum.js once the parts are read: the part, and "parts/<dir>/<file>" */
  part?: Part;
  path?: string;
}

export interface Part {
  id: string;
  num: string;
  name: string;
  dir: string;
  blurb?: string;
  chapters: Chapter[];
}

export interface Curriculum {
  title: string;
  subtitle?: string;
  parts: Part[];
  /** every chapter in reading order, as data/curriculum.js flattens them */
  chapters?: Chapter[];
}

/** The chapter with this id, or null; read from the parts, so a curriculum that has not
    been flattened yet answers too. */
export function chapterById(c: Curriculum | null | undefined, id: string): Chapter | null {
  const parts = c && Array.isArray(c.parts) ? c.parts : [];
  for (const part of parts) {
    for (const ch of part.chapters || []) if (ch.id === id) return ch;
  }
  return null;
}

/** A section named from anywhere: "ch02#one-unknown". An attempt record's section is its
    own chapter's ("angles") or already a ref ("ch02#one-unknown", a mixed-review
    problem); none, and the warm-up, which is no section, give "". */
export function sectionRef(chapterId: ChapterId, section: string | null | undefined): SectionRef | "" {
  if (!section || section === "warmup") return "";
  if (section.indexOf("#") > -1) return section as SectionRef;
  return (chapterId + "#" + section) as SectionRef;
}

/** An exercise named from anywhere: "ch02/e3". */
export function exerciseRef(chapterId: ChapterId, key: ExerciseKey): string {
  return chapterId + "/" + key;
}

/** An Arena generator (data/gen/) named as an item: "g:<id>". */
export function generatorRef(id: string): string {
  return "g:" + id;
}
