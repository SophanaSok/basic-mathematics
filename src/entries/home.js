/* index.html: the contents page, with the course map.
   One entry per kind of page (tools/lib/shell.js names it): an ordered list of
   side-effect imports of the files the page used to load as classic <script defer>
   tags, in the order those tags were in. Each file is an IIFE that reads and writes
   window.BM* and declares nothing at the top level, so imported as a module it does
   what it did as a script, and the import order is the run order: site.js first
   initialises the page, and game.js, encounter.js and lesson.js build on what it did. */
import "../vendor/katex.js";
import "../../data/curriculum.js";
import "../../data/quest.js";
import "../../assets/widgets.js";
import "../../assets/three-loader.js";
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
import "../../assets/site.js";
import "../../assets/sfx.js";
import "../../assets/game.js";
import "../../assets/config.js";
import "../../assets/account.js";
import "../../assets/map3d.js";
/* the "next best step" card, drawn once the scripts above have run */
import "../learn/next.ts";
import "../ui/next.ts";
