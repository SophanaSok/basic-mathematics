/* The shapes the connector's exercise tools work on and hand back (decision 0016). The entry
   is what tools/lib/exercise-index.js produces, one per exercise on the chapter pages.
   Pure: no `window`, no DOM. */

export type ExerciseKind = "text" | "choice" | "multi" | "order" | "blank" | "figure";

export interface ExerciseEntry {
  ref: string;
  chapter: string;
  key: string;
  section: string;
  inline: boolean;
  kind: ExerciseKind;
  type: string;
  question: string;
  choices: string[];
  blanks: { answer: string; type: string }[];
  items: string[];
  answer: string;
  compare: string | null;
  tol: number;
  clues: string[];
  visual: boolean;
  line: number;
}

export type ExerciseIndex = readonly ExerciseEntry[];

export interface ToolError { error: "unknown" | "bad-answer" }

/** get_exercise: never the key, never the items of an order exercise */
export interface ExerciseView {
  ref: string;
  chapter: string;
  section: string;
  kind: ExerciseKind;
  question: string;
  choices?: string[];
  blanks?: number;
  clues: number;
  visual: boolean;
  onPage: boolean;
}

export type GetExerciseResult = ExerciseView | ToolError;

export type ClueResult =
  | { ref: string; rung: number; clues: number; clue: string }
  | { error: "unknown" }
  | { error: "no-clue"; clues: number };

export type CheckResult =
  | { ref: string; onPage: true }
  | { ref: string; verdict: "right" | "form" | "wrong" | "unread"; message: string | null; blank?: number; question?: string }
  | ToolError;

/* get_progress (CN-6): numbers, curriculum titles and authored text only. */
export type OverviewBand = "none" | "weak" | "building" | "strong";

/** What mcp_context sent, as the worker assembled it: `truncated` is true only when the worker stopped
    paging before the start of the log, so the overview's numbers are then lower bounds. */
export interface OverviewInput { events: unknown; last: unknown; truncated?: unknown }

export interface OverviewSection {
  id: string;
  title: string;
  band: OverviewBand;
  /** the mastery fold's evidence count (c) */
  evidence: number;
  box: number;
  due: boolean;
}

export interface OverviewChapter { id: string; name: string; sections: OverviewSection[] }

export interface Overview {
  /** the chapters with at least one Arena-scheduled section; `continue.chapterId` may name another */
  chapters: OverviewChapter[];
  due: number;
  continue: { chapterId: string; text: string; why: string } | null;
  totals: { sections: number; strong: number; building: number; weak: number; none: number; events: number; truncated: boolean };
}

export interface PersonaPrompt { name: string; description: string; text: string }
