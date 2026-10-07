/* parts/<part>/<chapter>.html. See home.js for what an entry is.
   site.js mounts every figure as it runs, so the scene framework and the scene files
   come before it. Every chapter gets every scene: a scene file only registers a factory
   with BM3D.define, and a chapter mounts the ones its figures name, so there is one
   chapter bundle rather than one per set of scenes (data-scenes used to pick them). */
import "../vendor/katex.js";
import "../hud/levels.js";
import "../hud/view.js";
import "../hud/install.js";
import "../../data/curriculum.js";
import "../../data/quest.js";
import "../../assets/widgets.js";
import "../../assets/three-loader.js";
import "../../assets/scenes3d.js";
import "../../assets/scenes/boxcount.js";
import "../../assets/scenes/det3.js";
import "../../assets/scenes/dist3.js";
import "../../assets/scenes/flipbook.js";
import "../../assets/scenes/helix.js";
import "../../assets/scenes/planes3.js";
import "../../assets/scenes/scale3.js";
import "../../assets/scenes/sphereslice.js";
import "../../assets/scenes/spheretri.js";
import "../../assets/scenes/sumsquares.js";
/* the help ladder: pure modules first, then the one that puts window.BMLearn up for
   site.js, which mounts a ladder on every exercise card as it builds it. Each file is
   named here, not only imported by the next, because the build and check-dist place a
   module by the entries that import it */
import "../learn/constants.ts";
import "../learn/ladder.ts";
import "../learn/detectors.ts";
import "../learn/stuck.ts";
import "../ui/ladder.ts";
/* the spaced-review schedule and the Arena's XP rules, which game.js (and the Arena)
   find on window.BMReview: the pure modules first (constants.ts is above), then the one
   that puts them up */
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
/* the grader and the exercise rules, which site.js and game.js find on window.BMCore:
   the pure modules first, then the one that puts them up. Before site.js, which builds
   nothing without them */
import "../core/grade.ts";
import "../core/rules.ts";
import "../core/curriculum.ts";
import "../core/config.ts";
import "../ui/core.ts";
import "../../assets/site.js";
import "../../assets/sfx.js";
import "../../assets/game.js";
import "../ui/settings.ts";
import "../../assets/encounter.js";
import "../../assets/lesson.js";
import "../../assets/config.js";
import "../../assets/account.js";
/* the "next best step" card, drawn once the scripts above have run */
import "../learn/next.ts";
import "../ui/next.ts";
