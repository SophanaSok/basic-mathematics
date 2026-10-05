/* parts/<part>/<chapter>.html. See home.js for what an entry is.
   site.js mounts every figure as it runs, so the scene framework and the scene files
   come before it. Every chapter gets every scene: a scene file only registers a factory
   with BM3D.define, and a chapter mounts the ones its figures name, so there is one
   chapter bundle rather than one per set of scenes (data-scenes used to pick them). */
import "../vendor/katex.js";
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
import "../../assets/site.js";
import "../../assets/sfx.js";
import "../../assets/game.js";
import "../../assets/encounter.js";
import "../../assets/lesson.js";
import "../../assets/config.js";
import "../../assets/account.js";
