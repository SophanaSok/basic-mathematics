/* The Three.js the world is handed: the namespace src/vendor/three.js makes (BM3D.THREE
   once assets/three-loader.js has it). Typed as that module, so a name it does not
   export is a type error here, as it would be undefined in the browser; the unit tests
   hand in the package itself, which has every name. Types only: nothing is imported at
   run time, so the world chunk holds no Three.js. */
export type Three = typeof import("../vendor/three.js");
