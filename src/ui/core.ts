/* What the site's scripts reach through window.BMCore: the grader (src/core/grade.ts), the
   exercise rules (rules.ts), the curriculum refs (curriculum.ts) and the settings reader
   (config.ts). And through window.BMMerge: the sync merge (src/sync/merge.ts).

   assets/site.js, assets/game.js and assets/account.js are scripts that cannot import a
   module (tools run them in a vm, as they are), so every entry imports this file ahead of
   site.js, and they find it on window; site.js and account.js do nothing without it. The
   modules under src/core/ and src/sync/ write nothing to window; this file is where the
   page gets them. */

import { alternatives, grade, matches } from "../core/grade.ts";
import { CLUE_FREE, FADED_RUNG, Road, STRONG, WEAK, XP, fadedOf, isMiss, medalMark, paysFirst, setStats, struggle, xpFor } from "../core/rules.ts";
import { chapterById, exerciseRef, generatorRef, sectionRef } from "../core/curriculum.ts";
import { readConfig } from "../core/config.ts";
import { SCHEMA, canon, merge as mergeStates, mergeGame, obj, str, versionOf } from "../sync/merge.ts";

export const core = {
  grade, matches, alternatives,
  rules: { XP, CLUE_FREE, FADED_RUNG, fadedOf, paysFirst, xpFor, Road, struggle, WEAK, STRONG, isMiss, medalMark, setStats },
  curriculum: { chapterById, sectionRef, exerciseRef, generatorRef },
  config: { readConfig }
};

/* what assets/account.js takes from the merge: the merge and the game record's own (also
   BMAccount.merge and .mergeGame), the newest shape of the data this version may write
   and how to read a state's, the canonical JSON it compares a saved row by, and the two
   readers it shares with the merge */
export const merge = { merge: mergeStates, mergeGame, SCHEMA, versionOf, canon, obj, str };

if (typeof window !== "undefined") {
  window.BMCore = core;
  window.BMMerge = merge;
}
