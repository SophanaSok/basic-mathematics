/* window.BMExerciseKeys: which "chapter/key" refs are exercises the site still has
   (src/data/exercise-keys.ts). assets/insights.js, the author's table, reads it to leave out
   statistics rows for exercises that were removed or renamed. It is its own installer because
   only the dashboard pages need the 9 KB of keys; every other entry goes without. */

import { EXERCISE_KEYS } from "../data/exercise-keys.ts";

const set = new Set(EXERCISE_KEYS);

export const api = { has: (ref: string) => set.has(ref), size: set.size };

if (typeof window !== "undefined") window.BMExerciseKeys = api;
