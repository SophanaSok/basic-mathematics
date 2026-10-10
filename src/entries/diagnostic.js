/* diagnostic.html: the placement check, which makes its questions with the Arena's
   problem generators. See home.js for what an entry is. */
import "../vendor/katex.js";
import "../hud/levels.js";
import "../hud/view.js";
import "../hud/install.js";
import "../../data/curriculum.js";
import "../../data/quest.js";
/* the spaced-review schedule and the Arena's XP rules, which game.js finds on
   window.BMReview: the pure modules first, then the one that puts them up */
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
import "../sync/merge.ts";
import "../ui/core.ts";
import "../../assets/site.js";
import "../../assets/sfx.js";
import "../../assets/game.js";
import "../ui/settings.ts";
/* the problem generators */
import "../../data/gen/core.js";
import "../../data/gen/part1.js";
import "../../data/gen/part2.js";
import "../../data/gen/part3.js";
import "../../data/gen/part4.js";
import "../../assets/config.js";
import "../../assets/account.js";
/* the placement check: the skills it reads, the pure rules (the walk, the run and the take, what
   a take seeds), then the page's installer, which needs all of them and the globals above */
import "../data/skills.ts";
import "../learn/diagnostic.ts";
import "../learn/diag-seed.ts";
import "../ui/diagnostic.ts";
/* the result and the return view, which the page above draws with */
import "../ui/diag-result.ts";
