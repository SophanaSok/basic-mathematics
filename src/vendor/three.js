/* Three.js from npm, behind a dynamic import. No entry imports this file:
   assets/three-loader.js imports it with import() when a 3D scene or the course map
   nears the screen, so a page with neither never downloads it, and one that has them
   fetches it once (tools/game/map.test.js and the pages suite of tools/check-browser.js
   watch the requests). A file of its own so the chunk has this file's name,
   bundle/three.js (vite.config.ts bundleNames), rather than one the bundler made up.

   By name, and exactly the names the site's scripts use (every T.<Name> in
   assets/map3d.js and every THREE.<Name> in assets/scenes3d-gl.js; tools/checks.test.js
   holds this list to those files), so the chunk is what those need and the rest of the
   library is shaken out: `export *` would carry the whole of it. The loader stores the
   namespace this module makes on BM3D.THREE; nothing reads window.THREE. Each statement
   is one line, which is how tools/lib/vendor.js reads the package a vendor module brings in. */
export { WebGLRenderer, ColorManagement, LinearSRGBColorSpace, DoubleSide } from "three";
export { Scene, Group, Object3D, Mesh, InstancedMesh, LineSegments, LineLoop } from "three";
export { PerspectiveCamera, OrthographicCamera, Raycaster } from "three";
export { Color, Vector2, Vector3, Euler, Shape, CatmullRomCurve3 } from "three";
export { BufferGeometry, BufferAttribute, EdgesGeometry, ShapeGeometry } from "three";
export { BoxGeometry, ConeGeometry, CylinderGeometry, TorusGeometry, OctahedronGeometry, IcosahedronGeometry } from "three";
export { MeshBasicMaterial, MeshLambertMaterial, LineBasicMaterial } from "three";
export { HemisphereLight, DirectionalLight } from "three";
