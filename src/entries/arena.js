/* arena.html: no figures, the problem generators instead. See home.js for what an
   entry is. */
import "../vendor/katex.js";
import "../hud/levels.js";
import "../hud/view.js";
import "../hud/install.js";
import "../../data/curriculum.js";
import "../../data/quest.js";
/* the companion draws Mochi with Three.js, which the Arena had no loader for (window.BM3D) */
import "../../assets/three-loader.js";
/* the spaced-review schedule and the Arena's XP rules, which game.js (and the Arena)
   find on window.BMReview: the pure modules first, then the one that puts them up */
import "../learn/constants.ts";
import "../learn/recall.ts";
import "../learn/review.ts";
import "../learn/practice.ts";
import "../data/arena-sections.ts";
/* the chart a generator returns (a dot plot, histogram or box plot): the geometry on
   window.BMChart, then the widget that draws it, in the order home.js has them */
import "../ui/chart.ts";
import "../../assets/widgets.js";
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
/* the skippable reveal of the result screen (window.BMResults), found by arena.js */
import "../ui/results.ts";
import "../../data/gen/core.js";
import "../../data/gen/part1.js";
import "../../data/gen/part2.js";
import "../../data/gen/part3.js";
import "../../data/gen/part4.js";
import "../../data/gen/packs.js";
import "../../assets/arena.js";
import "../../assets/config.js";
import "../../assets/account.js";
/* Mochi as a 2D companion, docked on the page (window.BMCompanion): the mood model first */
import "../learn/mood.ts";
import "../world/tiers.ts";
import "../ui/companion.ts";
/* the first-run guide (shown once on a chapter page) and its replay button in the settings sheet */
import "../ui/first-run.ts";
/* the keyboard layer: the pure keymap, then the DOM half, last, once everything it
   drives is up */
import "../ui/keymap.ts";
import "../ui/palette.ts";
import "../ui/keys.ts";
