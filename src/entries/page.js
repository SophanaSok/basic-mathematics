/* about.html, account.html: prose and a form. See home.js for what an entry is. */
import "../vendor/katex.js";
import "../hud/levels.js";
import "../hud/view.js";
import "../hud/install.js";
import "../../data/curriculum.js";
import "../../data/quest.js";
import "../../assets/widgets.js";
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
import "../../assets/site.js";
import "../../assets/sfx.js";
import "../../assets/game.js";
import "../ui/settings.ts";
import "../../assets/config.js";
import "../../assets/account.js";
/* progress brought from the old address: the question a carried link asks, and the
   progress page's import: the addresses (origins.ts), the reading and the merge
   (format.ts, with account.js's merge), then the page (each named here, as above) */
import "../carry/origins.ts";
import "../carry/format.ts";
import "../ui/carry.ts";
