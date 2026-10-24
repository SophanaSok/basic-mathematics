/* index.html: the contents page, with the course map.
   One entry per kind of page (tools/lib/shell.js names it): an ordered list of
   side-effect imports of the files the page used to load as classic <script defer>
   tags, in the order those tags were in. Each file is an IIFE that reads and writes
   window.BM* and declares nothing at the top level, so imported as a module it does
   what it did as a script, and the import order is the run order: site.js first
   initialises the page, and game.js, encounter.js and lesson.js build on what it did.
   Before them, src/hud/ (window.BMHud where the HUD script did not put it already,
   src/hud/install.js says why); after game.js, the settings sheet, src/ui/settings.ts;
   before map3d.js, src/world/tiers.ts, which it imports to choose the world's quality
   before anything 3D is fetched (named here so it is in this page's bundle; the rest of
   src/world/ is the chunk map3d.js imports on demand, bundle/world.js). */
import "../vendor/katex.js";
import "../hud/levels.js";
import "../hud/view.js";
import "../hud/install.js";
import "../../data/curriculum.js";
import "../../data/quest.js";
import "../ui/chart.ts";
import "../../assets/widgets.js";
import "../../assets/three-loader.js";
/* the spaced-review schedule and the Arena's XP rules, which game.js (and the Arena)
   find on window.BMReview: the pure modules first, then the one that puts them up */
import "../learn/constants.ts";
import "../learn/recall.ts";
import "../learn/review.ts";
import "../learn/practice.ts";
import "../data/arena-sections.ts";
import "../data/chapter-meta.ts";
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
/* the pet store's model and prunes (src/learn/pet.ts): merge.ts imports its prune */
import "../learn/pet.ts";
import "../sync/merge.ts";
import "../ui/core.ts";
/* the icons site.js draws (window.BMIcon): their data, then the helper, before it */
import "../data/icons.json";
import "../ui/icon.ts";
/* the hub's due sections and mastery line under each chapter on the list (window.BMHubList), for site.js */
/* src/world/state.ts, which hub-list.ts reads, named here as tiers.ts is: it is in this page's bundle, not in the 3D world chunk */
import "../world/state.ts";
import "../ui/hub-list.ts";
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
/* the pet's earns: bus signals to facets in bm.pet.v1, window.BMPet */
import "../ui/pet-earns.ts";
import "../../assets/sfx.js";
import "../../assets/game.js";
import "../ui/settings.ts";
import "../ui/hud-pop.ts";
import "../../assets/config.js";
import "../../assets/account.js";
import "../world/tiers.ts";
import "../../assets/map3d.js";
/* the contents page's List / Map control, drawn once the scripts above have run */
import "../ui/hub-mode.ts";
/* the one selected chapter, in the hash, shared by the List and the Map (read by map3d.js) */
import "../core/hub.ts";
import "../ui/hub-select.ts";
/* the contents page's search field (src/ui/hub-search.ts), which filters the list the map shares; src/ui/palette.ts (ranking) is named below */
import "../ui/hub-search.ts";
/* the "next best step" card, drawn once the scripts above have run */
/* where each section stands and the one continue resolver (src/learn/status.ts): next.ts and plan.ts read it */
import "../data/section-work.ts";
import "../learn/status.ts";
import "../learn/next.ts";
import "../ui/next.ts";
/* the first-run guide (shown once on a chapter page) and its replay button in the settings sheet */
import "../ui/first-run.ts";
/* the keyboard layer: the pure keymap, then the DOM half, last, once everything it
   drives is up */
import "../ui/keymap.ts";
import "../ui/palette.ts";
import "../ui/keys.ts";
