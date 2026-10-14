/* The Three.js the model viewer is handed: the namespace src/vendor/three-model.js makes
   (the GLTF loader, the room environment and the core names the model code uses beyond
   those of src/vendor/three.js). Typed as that module, so a name it does not export is a
   type error here, as it would be undefined in the browser. Types only: nothing is
   imported at run time from this file, so it adds nothing to bundle/form-model.js. */
export type ThreeModel = typeof import("../vendor/three-model.js");
