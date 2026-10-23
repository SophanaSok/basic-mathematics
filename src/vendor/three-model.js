/* Mochi's Three.js: the GLB loader and the rest of what src/mochi/*.ts uses, behind a
   dynamic import. No entry imports this file: src/mochi/index.ts imports it with import()
   when a page has a Mochi to show. A file of its own so the chunk has this file's name,
   bundle/three-model.js, and holds the addons' code (the loader),
   which the course map then never downloads. The core names below live in three's own
   modules, which the bundler keeps in one place, bundle/three.js, so the map pages do
   carry them; naming them here only says what Mochi uses.

   By name, like src/vendor/three.js: tools/checks.test.js holds each name to the installed
   package, and to the names src/mochi/*.ts uses. The addons are
   named by subpath, which is how tools/lib/vendor.js tells this module's files from
   src/vendor/three.js's: three/examples/** is this module's, three's core stays with
   three.js, which imports it bare. A name both modules export (Scene, Mesh, Vector3, …) is
   the same object in both: vite.config.ts dedupes three, so the bundle holds one copy.
   Each statement is one line, which is how tools/lib/vendor.js reads the package a vendor
   module brings in. */
export { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
export { AnimationMixer, LoopOnce, LoopRepeat } from "three";
