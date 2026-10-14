/* The model viewer's Three.js: the progress page's form models (GLB files), behind a
   dynamic import. No entry imports this file: src/model/index.ts imports it with import()
   when the page has a model to show (a later card). A file of its own so the chunk has
   this file's name, bundle/three-model.js, and holds the addons' code (the loader, the
   room environment), which the course map then never downloads. The core names below
   live in three's own modules, which the bundler keeps in one place, bundle/three.js, so
   the map pages do carry them (the plan accepts that cost and the bundling card measures
   it); naming them here only says what the model viewer uses.

   By name, like src/vendor/three.js: tools/checks.test.js holds each name to the installed
   package, and, once src/model/ exists, to the names src/model/*.ts uses. The addons are
   named by subpath, which is how tools/lib/vendor.js tells this module's files from
   src/vendor/three.js's: three/examples/** is this module's, three's core stays with
   three.js, which imports it bare. A name both modules export (Scene, Mesh, Vector3, …) is
   the same object in both: vite.config.ts dedupes three, so the bundle holds one copy.
   Each statement is one line, which is how tools/lib/vendor.js reads the package a vendor
   module brings in. */
export { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
export { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
export { PMREMGenerator, DirectionalLight, PlaneGeometry, ShadowMaterial, Mesh, Box3 } from "three";
export { AnimationMixer, LoopOnce, LoopRepeat } from "three";
export { SRGBColorSpace, ACESFilmicToneMapping, PCFShadowMap } from "three";
