/* index.html: the contents page, with the course map.
   One entry per kind of page (tools/lib/shell.js names it): an ordered list of
   side-effect imports of the files the page used to load as classic <script defer>
   tags, in the order those tags were in. Each file is an IIFE that reads and writes
   window.BM* and declares nothing at the top level, so imported as a module it does
   what it did as a script, and the import order is the run order: site.js first
   initialises the page, and game.js, encounter.js and lesson.js build on what it did. */
import "../../data/curriculum.js";
import "../../data/quest.js";
import "../../assets/widgets.js";
import "../../assets/three-loader.js";
import "../../assets/site.js";
import "../../assets/sfx.js";
import "../../assets/game.js";
import "../../assets/config.js";
import "../../assets/account.js";
import "../../assets/map3d.js";
