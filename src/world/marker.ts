/* The "you are here" marker on the course map: Mochi's buoy, a small axolotl afloat on the
   island (decision 0015). A rounded body over a pale belly, a flat wide head with two dark
   dot eyes, a laterally flat tail curling up, and three gill fans a side.
   It is one baked figure: the Kit's own primitives stamped into one toon mesh with vertex
   colours and one set of ink edges (src/world/batch.ts), everything in the matrices, so two draw calls and
   nothing that moves; the map's own bob moves the whole marker. Colours are the world's
   palette names (src/world/materials.ts), never literals, so it repaints with the theme.

   It is Part-tinted so the marker says which Part the learner is in at a glance, and it
   stands off the island it sits on: the cap under it is the Part's own hue (`part:`), so
   the body is the Part's soft tint (`soft:<part>`, else `paper` where the palette lacks
   it), the belly paper (`paper`, else `under`), the gill fans the Part's deep tone
   (`deep:<part>`, else `stone`), the eyes ink. The buoy floats with its belly at y = 0, facing
   +z, about 0.5 tall and 0.9 long in the units of the world (an island is about 2.6
   across); the caller does not scale it. */

import type { Three } from "./three.ts";
import type { Group } from "three";
import { Kit } from "./kit.ts";
import { paint as batchPaint } from "./batch.ts";
import { lookup, type PaletteMap, type WorldMaterials } from "./materials.ts";
import { prism } from "./shapes.ts";

export interface MarkerLook {
  /** add this to a scene: the buoy, belly at y = 0, facing +z */
  group: Group;
  /** the top of the buoy */
  height: number;
  triangles: number;
  /** draw calls: the mesh and its edges */
  calls: number;
  /** repaint from another palette (a theme or panel change) */
  paint(pal: PaletteMap): void;
  dispose(): void;
}

/* the Part's colour names, each falling back as forms.ts's keysFor does */
function keys(pal: PaletteMap, part: string) {
  const pick = (k: string, fb: string) => (pal.has(k) ? k : fb);
  return {
    body: pick("soft:" + part, "paper"),
    belly: pick("paper", "under"),
    gill: pick("deep:" + part, "stone")
  };
}

export function buildMarker(T: Three, mats: WorldMaterials, pal: PaletteMap, part: string): MarkerLook {
  const K = keys(pal, part);
  const k = new Kit(T);
  k.shape("ball", () => new T.SphereGeometry(1, 8, 6), 40);
  k.shape("head", () => new T.SphereGeometry(1, 8, 5), 40);
  k.shape("link", () => new T.SphereGeometry(1, 6, 3), 40);
  k.shape("eye", () => new T.OctahedronGeometry(0.05, 0), 0);
  /* a gill fan, a thin triangle reaching out (+x) or the other way (-x) */
  k.shape("fanR", () => prism(T, [[0, -0.03], [0.2, 0], [0, 0.03]], 0.03));
  k.shape("fanL", () => prism(T, [[0, -0.03], [-0.2, 0], [0, 0.03]], 0.03));

  k.put("ball", null, { p: [0, 0.24, -0.02], s: [0.22, 0.24, 0.22] }, K.body);
  k.put("link", null, { p: [0, 0.07, 0], s: [0.17, 0.07, 0.2] }, K.belly, null);
  k.put("head", null, { p: [0, 0.16, 0.25], s: [0.3, 0.16, 0.2] }, K.body);
  k.put("eye", null, { p: [-0.1, 0.29, 0.34] }, "ink", null);
  k.put("eye", null, { p: [0.1, 0.29, 0.34] }, "ink", null);
  /* the tail: three links, narrow and tall, each higher than the last */
  k.put("link", null, { p: [0, 0.12, -0.26], s: [0.05, 0.1, 0.1] }, K.body);
  k.put("link", null, { p: [0, 0.15, -0.35], s: [0.04, 0.09, 0.08] }, K.body);
  k.put("link", null, { p: [0, 0.23, -0.42], s: [0.035, 0.08, 0.06] }, K.body);
  /* three gill fans a side, spread upward from the back of the head */
  [0.35, 0.8, 1.25].forEach((a, i) => {
    const y = 0.26 + i * 0.01;
    k.put("fanR", null, { p: [0.24, y, 0.14], r: [0, 0, a] }, K.gill);
    k.put("fanL", null, { p: [-0.24, y, 0.14], r: [0, 0, -a] }, K.gill);
  });

  const P = lookup(pal);
  const solid = k.solids.build(T, P), edge = k.edges.build(T, P);
  k.dispose();
  const group = new T.Group();
  group.add(new T.Mesh(solid.geometry, mats.solid), new T.LineSegments(edge.geometry, mats.ink));
  group.updateMatrixWorld(true);
  const height = new T.Box3().setFromObject(group).max.y;
  return {
    group, height,
    triangles: solid.geometry.getAttribute("position").count / 3,
    calls: 2,
    paint(pal2) { const Q = lookup(pal2); batchPaint(solid.geometry, solid.ranges, Q); batchPaint(edge.geometry, edge.ranges, Q); },
    dispose() { solid.geometry.dispose(); edge.geometry.dispose(); }
  };
}
