/* What each island shows of the learner's progress, rebuilt (as one mesh and one set of
   edges) whenever progress changes, which is rare; nothing here moves.
     ring   how much of the chapter's practice is solved: an arc round the island
     boss   the unsolved part of the set: the region's solid in the Part's deep hue, its
            faces hollowed (paper) from the top down as problems fall; none in Study mode
     beacon a slim spire above an island with sections due for a check
     flag   a finished chapter: a pennant on a pole, and one to three stars for its medal */

import type { Three } from "./three.ts";
import type { LineSegments, Mesh } from "three";
import { Kit } from "./kit.ts";
import { DECK, type WorldLayout } from "./layout.ts";
import { lookup, type PaletteMap, type WorldMaterials } from "./materials.ts";
import { paint } from "./batch.ts";
import { hollowPaint, solidGeometry } from "./solids.ts";
import { prism } from "./shapes.ts";
import type { IsleState } from "./state.ts";

/* the type lives in state.ts (hubState's output); re-exported so nothing else changes */
export type { IsleState };

export interface Marks {
  mesh: Mesh;
  edges: LineSegments;
  /** per island id, what it shows: "ring,boss", "ring,flag,star,star", ... (BMMap3D.info().isles) */
  kinds: Record<string, string>;
  triangles: number;
  paint(pal: PaletteMap): void;
  dispose(): void;
}

export function buildMarks(T: Three, L: WorldLayout, states: IsleState[], mats: WorldMaterials, pal: PaletteMap): Marks {
  const k = new Kit(T);
  k.shape("star", () => new T.OctahedronGeometry(0.26, 0));
  k.shape("pole", () => new T.CylinderGeometry(0.04, 0.04, 1.5, 5), 0);
  k.shape("beacon", () => new T.ConeGeometry(0.16, 1.1, 4));
  k.shape("pennant", () => prism(T, [[0, 0], [0.78, -0.22], [0, -0.46]], 0.04));
  const kinds: Record<string, string> = {};
  L.isles.forEach((s, i) => {
    const st: IsleState = states[i] || { pct: 0, done: false, stars: 1, boss: null, due: { arena: [], page: [] }, mastery: { strong: 0, building: 0, weak: 0, none: 0 } };
    const at = k.matrix({ p: [s.x, s.y, s.z] });
    const shown: string[] = [];
    if (st.pct > 0) {
      const segs = Math.max(2, Math.ceil(24 * st.pct));
      const name = "ring:" + segs + ":" + st.pct.toFixed(3);
      k.shape(name, () => new T.TorusGeometry(1.45, 0.05, 3, segs, Math.PI * 2 * st.pct), 0);
      k.put(name, at, { p: [0, DECK + 0.1, 0], r: [-Math.PI / 2, 0, Math.PI / 2] }, "ok", null);
      shown.push("ring");
    }
    if (st.done) {
      k.put("pole", at, { p: [-0.5, DECK + 0.8, -0.4] }, "ink", null);
      k.put("pennant", at, { p: [-0.47, DECK + 1.52, -0.4], r: [0, -0.35, 0] }, "ok");
      shown.push("flag");
      const n = Math.min(3, Math.max(1, st.stars || 1));
      for (let j = 0; j < n; j++) {
        k.put("star", at, { p: [0.2 + (j - (n - 1) / 2) * 0.58, DECK + 0.72, 0.3], r: [0, 0.4, 0] }, "hot");
        shown.push("star");
      }
    } else {
      if (st.boss) {
        /* the solid keeps its size: the hollowing shows the damage. A y-rotation only, so the
           paint (which reads the stamped normal-y) hollows the faces hollowCount says */
        const name = "boss:" + st.boss.solid;
        k.shape(name, () => solidGeometry(T, st.boss!.solid, 0.42));
        k.put(name, at, { p: [0, DECK + 1.05, 0], r: [0, i * 0.7, 0] }, hollowPaint(st.boss.solid, st.boss.hollow, "deep:" + s.part, "under"));
        shown.push(name);
      }
    }
    if (st.due.arena.length + st.due.page.length > 0) {
      k.put("beacon", at, { p: [0.8, DECK + 0.55, -0.7] }, "glow:" + s.part);
      shown.push("beacon");
    }
    kinds[s.id] = shown.join(",");
  });
  const P = lookup(pal);
  const solid = k.solids.build(T, P);
  const edge = k.edges.build(T, P);
  const triangles = k.solids.triangles;
  k.dispose();
  return {
    mesh: new T.Mesh(solid.geometry, mats.solid),
    edges: new T.LineSegments(edge.geometry, mats.ink),
    kinds, triangles,
    paint(pal2) { const Q = lookup(pal2); paint(solid.geometry, solid.ranges, Q); paint(edge.geometry, edge.ranges, Q); },
    dispose() { solid.geometry.dispose(); edge.geometry.dispose(); }
  };
}
