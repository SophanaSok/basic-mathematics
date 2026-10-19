/* The prerequisite links of the selected chapter: a low dashed arc (every other segment of a 12-segment arc) from each island it
   builds on to the selected island, in the Part's --region-ink, one LineSegments (one
   draw call, no triangles). Built when a chapter is selected, freed when it is not;
   nothing here moves. */

import type { Three } from "./three.ts";
import type { LineSegments } from "three";
import { DECK, ISLE_R, type WorldLayout } from "./layout.ts";
import type { PaletteMap } from "./materials.ts";

/** segments per arc; every other one is drawn, so the arc reads as dashes (src/vendor/three.js
    exports no LineDashedMaterial) */
export const ARC_SEGMENTS = 12;
/** the arc rises this far above the deck at its middle */
export const ARC_RISE = 0.6;
/** the arc's ends sit this far above the deck */
const LIFT = 0.12;

export interface Links {
  mesh: LineSegments;
  /** the dashes drawn (arcs × ARC_SEGMENTS / 2) */
  segments: number;
  paint(pal: PaletteMap): void;
  dispose(): void;
}

export function buildLinks(T: Three, L: WorldLayout, from: number, to: number[], pal: PaletteMap): Links {
  const dest = L.isles[from];
  const pos: number[] = [];
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
    for (let j = 0; j < ARC_SEGMENTS; j += 2) pos.push(...at(j / ARC_SEGMENTS), ...at((j + 1) / ARC_SEGMENTS));
    arcs++;
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.BufferAttribute(new Float32Array(pos), 3));
  const mat = new T.LineBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false });
  const mesh = new T.LineSegments(geo, mat);
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  const part = dest ? dest.part : "";
  const links: Links = {
    mesh,
    segments: (arcs * ARC_SEGMENTS) / 2,
    paint(pal) { mat.color.copy(pal.get("rink:" + part) || pal.get("ink")!); },
    dispose() { geo.dispose(); mat.dispose(); }
  };
  links.paint(pal);
  return links;
}
