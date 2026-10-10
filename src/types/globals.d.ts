/* The globals the site's scripts share. Every file under assets/ and data/ is an IIFE
   (or one assignment) that reads and writes these on window, and src/entries/*.js
   imports those files for their effect, so nothing is typed yet: each is `any`, so
   that a module written in TypeScript can reach window.BMStore without a cast while
   the scripts are converted one by one (the plan's conversion rule). Each name is
   listed with the file that creates it. As a script is converted, its global gets a
   real type here, or goes. */
interface Window {
  /** data/curriculum.js: parts, chapters, sections */
  BM_CURRICULUM: any;
  /** data/quest.js: regions, bosses, review echoes */
  BM_QUEST: any;
  /** assets/config.js: Supabase URL and anon key, sign-in providers, kill switches */
  BM_CONFIG: any;
  /** assets/three-loader.js (load, why, supported, lowEnd, and THREE: the namespace of
      src/vendor/three.js once load() has said true, null before; nothing is on
      window.THREE) and assets/scenes3d.js (define, stages, painters) */
  BM3D: any;
  /** assets/site.js: the page, grading, refresh */
  BMSite: any;
  /** assets/site.js: the bus every write is announced on (on, emit) */
  BMStore: any;
  /** assets/site.js: the progress store (solved scored exercises) */
  BMProgress: any;
  /** assets/site.js: the play store (missions, puzzle guesses) */
  BMPlay: any;
  /** assets/site.js: the attempt record per exercise */
  BMAttempts: any;
  /** assets/site.js: XP per day, the daily goal, the streak */
  BMActivity: any;
  /** assets/site.js: the "areas to strengthen" ranking */
  BMInsights: any;
  /** assets/site.js: renders math through KaTeX's auto-render when it is there */
  BMRenderMath: any;
  /** assets/widgets.js (and scenes3d.js, for the scenes): the figure factories by name */
  BMWidgets: any;
  /** assets/widgets.js: the SVG helpers the factories share */
  BMPlot: any;
  /** assets/widgets.js: missions per figure */
  BMMissions: any;
  /** assets/game.js: combo, levels, achievements, recall, play settings, the HUD */
  BMGame: any;
  /** the HUD script after the top bar (tools/lib/shell.js hudScript): the level curve
      and the HUD's drawing, src/hud/levels.js and view.js, typed as those modules */
  BMHud: typeof import("../hud/levels.js") & typeof import("../hud/view.js");
  /** assets/game.js: motion and effects, with still() for reduced motion and calm mode */
  BMFx: any;
  /** assets/site.js: toasts; assets/game.js replaces it with the card toast */
  BMToast: any;
  /** assets/sfx.js: synthesised sound effects */
  BMSfx: any;
  /** assets/encounter.js: the boss of each practice set */
  BMEncounter: any;
  /** assets/lesson.js: step-by-step reading of a chapter */
  BMLesson: any;
  /** assets/arena.js: the timed Arena */
  BMArena: any;
  /** data/gen/*.js: the Arena's problem generators */
  BMGen: any;
  /** assets/map3d.js: the 3D course map on the contents page */
  BMMap3D: any;
  /** assets/account.js: sign-in and sync, and the merge it takes from BMMerge */
  BMAccount: any;
  /** src/ui/ladder.ts: the help ladder (mount), the wrong-answer questions (detect) and the
      pure modules under src/learn/, for assets/site.js, which cannot import them, and the
      tests; typed, since it is written in TypeScript */
  BMLearn: typeof import("../ui/ladder.ts").api;
  /** src/ui/review.ts: the spaced-review schedule, the due review's plan and the Arena's XP
      rules (src/learn/recall.ts, review.ts, practice.ts), for assets/game.js and
      assets/arena.js, which cannot import them; typed */
  BMReview: typeof import("../ui/review.ts").api;
  /** src/ui/core.ts: the grader and the exercise rules (src/core/grade.ts, rules.ts), the
      curriculum refs and the settings reader, for assets/site.js and assets/game.js, which
      cannot import them; typed */
  BMCore: typeof import("../ui/core.ts").core;
  /** src/ui/core.ts: the sync merge (src/sync/merge.ts), for assets/account.js, which
      cannot import it; typed */
  BMMerge: typeof import("../ui/core.ts").merge;
  /** src/ui/diagnostic.ts: the placement check page (gate, screen), a console and test handle */
  BMDiag: typeof import("../ui/diagnostic.ts").api;
  /** src/ui/plan.ts: the study plan (render), for the diagnostic page; typed */
  BMPlan: typeof import("../ui/plan.ts").api;
  /** src/ui/next.ts: the "next best step" card (render, items, hide), a console and test handle */
  BMNext: typeof import("../ui/next.ts").api;
  /** src/ui/math-names.ts: names the buttons, labels, table headers and headings whose
      content is a formula (name), for assets/site.js's renderMath; typed */
  BMMathNames: typeof import("../ui/math-names.ts").api;
  /** src/ui/scroll-regions.ts: makes a formula or table that scrolls sideways a named tab
      stop while it overflows (watch), for assets/site.js's renderMath; typed */
  BMScrollRegions: typeof import("../ui/scroll-regions.ts").api;
  /** src/vendor/katex.js: KaTeX itself, a console handle and what the browser checks look for */
  katex: any;
  /** src/vendor/katex.js: KaTeX's auto-render extension, which renderMath in assets/site.js calls */
  renderMathInElement: any;
  /** a supabase-js stand-in the tests put here before the page runs; assets/account.js uses one that is there instead of importing src/vendor/supabase.js */
  supabase: any;
}
