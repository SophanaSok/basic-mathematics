/* The bloom's Three.js: the post-processing passes the course world's glow is made of,
   behind a dynamic import. No entry imports this file: assets/map3d.js imports it with
   import() beside src/world/post.ts, only when the bloom is on (the high tier), so no
   other page, and no map below that tier, downloads it. A file of its own so the chunk
   has this file's name, bundle/three-post.js, and holds the addons' code (the composer,
   the passes and the shaders they use) and nothing else. The core names the passes need
   (Vector2) are already exported by src/vendor/three.js, which makeBloom is handed.

   By subpath, like src/vendor/three-model.js: tools/checks.test.js holds each name to
   the installed package, and tools/lib/vendor.js places the files under
   three/examples/jsm/postprocessing/ (and the shaders they import) with this module.
   Each statement is one line, which is how tools/lib/vendor.js reads the package a
   vendor module brings in. */
export { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
export { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
export { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
export { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
