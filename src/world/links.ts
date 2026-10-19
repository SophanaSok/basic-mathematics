/* The prerequisite links of the selected chapter: a raised dashed ribbon (every other segment of a 12-segment arc) from
   each island it builds on to the selected island. One Mesh, one draw call, nothing moving. Each dash is two flat
   quads in the XZ plane: a wide halo in the page's paper colour under a narrower ink quad in the Part's --region-ink,
   so it reads on any terrace. Dashes widen toward the destination (0.6x to 1.4x), which is the direction. Built when a
   chapter is selected, freed when it is not.
   Vertex layout (not indexed): per dash, 6 halo vertices then 6 ink vertices; position and color attributes, 3 floats each. */

import type { Three } from "./three.ts";
import type { Mesh, BufferAttribute } from "three";
import { DECK, ISLE_R, type WorldLayout } from "./layout.ts";
import type { PaletteMap } from "./materials.ts";

export const ARC_SEGMENTS = 12;
/** the arc rises this far above the deck at its middle */
export const ARC_RISE = 1.8;
/** the arc's ends sit this far above the deck */
const LIFT = 0.3;

/** quad widths, in island radii */
const INK_W = 0.1, HALO_W = 0.18;
type V = [number, number, number];

export interface Links {
  mesh: Mesh;
  /** the dashes drawn (arcs × ARC_SEGMENTS / 2); each is 12 vertices */
  segments: number;
  paint(pal: PaletteMap): void;
  dispose(): void;
}

export function buildLinks(T: Three, L: WorldLayout, from: number, to: number[], pal: PaletteMap): Links {
  const dest = L.isles[from];
  const pos: number[] = [];
  const layers: number[] = [];
  let arcs = 0;
  for (const k of to) {
    const src = L.isles[k];
    if (!src || !dest || k === from) continue;
    const dx = dest.x - src.x, dz = dest.z - src.z, d = Math.hypot(dx, dz);
    if (d <= ISLE_R * 2) continue;
    const ux = dx / d, uz = dz / d;
    const ax = src.x + ux * ISLE_R, az = src.z + uz * ISLE_R;
    const bx = dest.x - ux * ISLE_R, bz = dest.z - uz * ISLE_R;
    const ay = src.y + DECK + LIFT, by = dest.y + DECK + LIFT;
    const at = (t: number): [number, number, number] => [
      ax + (bx - ax) * t,
      ay + (by - ay) * t + 4 * t * (1 - t) * (ARC_RISE - LIFT),
      az + (bz - az) * t
    ];
    const px = -uz, pz = ux;
    const half = (t: number, w: number) => (w * ISLE_R * (0.6 + 0.8 * t)) / 2;
    for (let j = 0; j < ARC_SEGMENTS; j += 2) {
      const t0 = j / ARC_SEGMENTS, t1 = (j + 1) / ARC_SEGMENTS;
      const p0 = at(t0), p1 = at(t1);
      for (const [layer, w, dy] of [[0, HALO_W, -0.01], [1, INK_W, 0]] as const) {
        const h0 = half(t0, w), h1 = half(t1, w);
        const a0: V = [p0[0] + px * h0, p0[1] + dy, p0[2] + pz * h0], a1: V = [p0[0] - px * h0, p0[1] + dy, p0[2] - pz * h0];
        const b0: V = [p1[0] + px * h1, p1[1] + dy, p1[2] + pz * h1], b1: V = [p1[0] - px * h1, p1[1] + dy, p1[2] - pz * h1];
        for (const v of [a0, a1, b0, a1, b1, b0]) { pos.push(...v); layers.push(layer); }
      }
    }
    arcs++;
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.BufferAttribute(new Float32Array(pos), 3));
  const col = new T.BufferAttribute(new Float32Array(pos.length), 3);
  geo.setAttribute("color", col);
  const mat = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, side: T.DoubleSide });
  const mesh = new T.Mesh(geo, mat);
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  const part = dest ? dest.part : "";
  const links: Links = {
    mesh,
    segments: (arcs * ARC_SEGMENTS) / 2,
    paint(pal) {
      const ink = pal.get("rink:" + part) || pal.get("ink")!, halo = pal.get("paper")!;
      for (let i = 0; i < layers.length; i++) {
        const c = layers[i] ? ink : halo;
        (col as BufferAttribute).setXYZ(i, c.r, c.g, c.b);
      }
      col.needsUpdate = true;
    },
    dispose() { geo.dispose(); mat.dispose(); }
  };
  links.paint(pal);
  return links;
}
