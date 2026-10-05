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
import "../../assets/widgets.js";
import "../../assets/three-loader.js";
import "../../assets/site.js";
import "../../assets/sfx.js";
import "../../assets/game.js";
import "../ui/settings.ts";
import "../../assets/config.js";
import "../../assets/account.js";
import "../world/tiers.ts";
import "../../assets/map3d.js";
