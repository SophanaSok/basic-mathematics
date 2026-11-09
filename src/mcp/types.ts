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
