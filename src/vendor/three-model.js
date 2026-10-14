/* The model viewer's Three.js: the progress page's form models (GLB files), behind a
   dynamic import. No entry imports this file: src/model/index.ts imports it with import()
   when the page has a model to show (a later card), so the course map, which does not
   draw models, never pays for the loader, the animation mixer or the PBR materials. A file
   of its own so the chunk has this file's name, bundle/three-model.js.

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
export { PMREMGenerator, SRGBColorSpace, ACESFilmicToneMapping, NoToneMapping, PCFSoftShadowMap } from "three";
export { AnimationMixer, LoopOnce, LoopRepeat, Clock, MathUtils, Quaternion } from "three";
export { Scene, Group, Mesh, SkinnedMesh, Skeleton, Box3, Vector3, Color, PerspectiveCamera } from "three";
export { MeshStandardMaterial, ShadowMaterial, PlaneGeometry, DirectionalLight, Texture } from "three";
