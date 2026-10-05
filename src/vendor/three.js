/* Three.js from npm, behind a dynamic import. No entry imports this file:
   assets/three-loader.js imports it with import() when a 3D scene or the course world
   nears the screen, so a page with neither never downloads it, and one that has them
   fetches it once (tools/game/map.test.js and the pages suite of tools/check-browser.js
   watch the requests). A file of its own so the chunk has this file's name,
   bundle/three.js (vite.config.ts bundleNames), rather than one the bundler made up.

   By name, and exactly the names the site's scripts use (every T.<Name> in
   assets/map3d.js and src/world/*.ts, and every THREE.<Name> in assets/scenes3d-gl.js;
   tools/checks.test.js holds this list to those files, and src/world/three.ts types the
   namespace the world is handed as this module, so a name missing here is a type error
   there), so the chunk is what those need and the rest of the library is shaken out:
   `export *` would carry the whole of it. The loader stores the namespace this module
   makes on BM3D.THREE; nothing reads window.THREE. Each statement is one line, which is
   how tools/lib/vendor.js reads the package a vendor module brings in. */
export { WebGLRenderer, ColorManagement, LinearSRGBColorSpace, DoubleSide } from "three";
export { Scene, Group, Object3D, Mesh, InstancedMesh, LineSegments, Fog } from "three";
export { PerspectiveCamera, OrthographicCamera, Raycaster } from "three";
export { Color, Vector2, Vector3, CatmullRomCurve3 } from "three";
export { BufferGeometry, BufferAttribute, EdgesGeometry } from "three";
export { BoxGeometry, ConeGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, OctahedronGeometry, IcosahedronGeometry } from "three";
export { MeshBasicMaterial, MeshToonMaterial, LineBasicMaterial } from "three";
export { DataTexture, RedFormat, NearestFilter } from "three";
export { AmbientLight, DirectionalLight } from "three";
