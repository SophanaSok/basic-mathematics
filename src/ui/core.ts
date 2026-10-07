/* What the site's scripts reach through window.BMCore: the grader (src/core/grade.ts), the
   exercise rules (rules.ts), the curriculum refs (curriculum.ts) and the settings reader
   (config.ts).

   assets/site.js and assets/game.js are scripts that cannot import a module (tools run
   them in a vm, as they are), so every entry imports this file ahead of site.js, and they
   find it on window; site.js does nothing without it. The modules under src/core/ write
   nothing to window; this file is where the page gets them. */

import { alternatives, grade, matches } from "../core/grade.ts";
import { CLUE_FREE, FADED_RUNG, Road, STRONG, WEAK, XP, fadedOf, isMiss, medalMark, paysFirst, setStats, struggle, xpFor } from "../core/rules.ts";
import { chapterById, exerciseRef, generatorRef, sectionRef } from "../core/curriculum.ts";
import { readConfig } from "../core/config.ts";

export const core = {
  grade, matches, alternatives,
  rules: { XP, CLUE_FREE, FADED_RUNG, fadedOf, paysFirst, xpFor, Road, struggle, WEAK, STRONG, isMiss, medalMark, setStats },
  curriculum: { chapterById, sectionRef, exerciseRef, generatorRef },
  config: { readConfig }
};

if (typeof window !== "undefined") window.BMCore = core;
