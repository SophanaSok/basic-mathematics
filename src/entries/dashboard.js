/* progress.html, insights.html: a page, and assets/insights.js to fill it. See home.js
   for what an entry is. */
import "../vendor/katex.js";
import "../hud/levels.js";
import "../hud/view.js";
import "../hud/install.js";
import "../../data/curriculum.js";
import "../../data/quest.js";
import "../ui/chart.ts";
import "../../assets/widgets.js";
/* Three.js's loader and the quality tiers it draws at: the pure modules first */
import "../../assets/three-loader.js";
import "../world/tiers.ts";
/* the spaced-review schedule and the Arena's XP rules, which game.js (and the Arena)
   find on window.BMReview: the pure modules first, then the one that puts them up */
import "../learn/constants.ts";
import "../learn/recall.ts";
import "../learn/review.ts";
import "../learn/practice.ts";
import "../data/arena-sections.ts";
import "../ui/review.ts";
/* names for the buttons, labels, table headers and headings whose content is a
   formula, which site.js gives after every renderMath (window.BMMathNames): the pure
   module, then the one that puts it up */
import "../a11y/math-text.ts";
import "../ui/math-names.ts";
/* a formula or table that scrolls sideways becomes a tab stop while it does */
import "../ui/scroll-regions.ts";
/* the grader and the exercise rules, which site.js and game.js find on window.BMCore,
   and the sync merge, which account.js finds on window.BMMerge: the pure modules first,
   then the one that puts them up. Before site.js, which builds nothing without them */
import "../core/grade.ts";
import "../core/rules.ts";
import "../core/curriculum.ts";
import "../core/config.ts";
import "../sync/json.ts";
import "../sync/events.ts";
import "../sync/merge.ts";
import "../ui/core.ts";
/* the icons site.js draws (window.BMIcon): their data, then the helper, before it */
import "../data/icons.json";
import "../ui/icon.ts";
import "../../assets/site.js";
/* the event log's schedule, checkpoint, mastery and bands, and the recorder, which
   src/ui/events.ts (window.BMEvents) puts up: the pure modules first */
import "../learn/schedule.ts";
import "../learn/checkpoint.ts";
import "../learn/mastery.ts";
import "../learn/bands.ts";
import "../learn/recorder.ts";
import "../learn/seed-entries.ts";
import "../ui/events.ts";
import "../../assets/sfx.js";
import "../../assets/game.js";
import "../ui/settings.ts";
import "../ui/hud-pop.ts";
import "../../assets/config.js";
import "../../assets/account.js";
/* the placement check's study plan, which insights.js draws when a take exists: the pure
   modules first, then the one that puts window.BMPlan up. Before insights.js */
import "../data/skills.ts";
import "../data/section-work.ts";
import "../learn/diagnostic.ts";
import "../learn/diag-seed.ts";
/* where each section stands and the one continue resolver (src/learn/status.ts): next.ts and plan.ts read it */
import "../learn/status.ts";
import "../learn/plan.ts";
import "../ui/plan.ts";
/* the exercises the site has, which insights.js uses to leave out stale statistics rows */
import "../data/exercise-keys.ts";
import "../ui/exercise-keys.ts";
import "../../assets/insights.js";
/* the companion's mood model and handle (window.BMCompanion.input); its sidebar figure mounts only on a chapter
   page, so here the import only gives the handle */
import "../learn/mood.ts";
import "../ui/companion.ts";
/* BMNext.items(), which insights.js asks for the empty chart's "Your next steps": mount() finds no
   placeholder on this page, so the import draws nothing. It comes after insights.js (whose first
   draw is already made), which redraws once when it finds BMNext on the page's load */
import "../learn/next.ts";
import "../ui/next.ts";
/* the first-run guide (shown once on a chapter page) and its replay button in the settings sheet */
import "../ui/first-run.ts";
/* the keyboard layer: the pure keymap, then the DOM half, last, once everything it
   drives is up */
import "../ui/keymap.ts";
import "../ui/palette.ts";
import "../ui/keys.ts";
