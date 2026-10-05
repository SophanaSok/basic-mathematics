/* What stands on each terrace besides the chapters: a few props per region, made of
   primitives only (src/world/regions.ts draws them), placed here as plain numbers so
   the placement is tested in Node (props.test.ts).

   The same course always gets the same props: positions come from a seeded generator,
   never from Math.random. A prop keeps clear of the islands, of the path and of the
   review gates, stays on its terrace, and does not stand on another prop; a tall one
   stands only behind its row or beyond its ends, so it never hides a chapter from the
   camera, which looks down on the world from the front. The tier's `detail` (0, 1, 2)
   says how many props there are beyond the ones each region always has, and how close
   together the low pieces of each terrace's front rim stand (blocks, bushes, posts or
   crystals along the edge, where the path does not cross it). */

import { ISLE_R, ROW_Z, type WorldLayout, type RegionSpot, segmentDistance } from "./layout.ts";

/** one per Part, from data/quest.js regions[part].motif */
export type Biome = "forge" | "fields" | "grid" | "stars";

export type PropKind =
  | "chimney" | "furnace" | "crates" | "anvil"         /* the Foundry */
  | "tent" | "hill" | "tree"                           /* the Fields */
  | "lattice" | "beam" | "node"                        /* the Grid */
  | "dome" | "telescope" | "starpost" | "rock"         /* the Observatory */
  | "block" | "bush" | "post" | "crystal";             /* the front rims, one kind per region */

export interface Prop {
  kind: PropKind;
  /** the region's index and id */
  p: number; part: string;
  x: number; z: number;
  /** a turn about the vertical, radians, and a size factor near 1 */
  turn: number; size: number;
}

interface KindInfo { r: number; tall: boolean }
/* each kind's footprint radius, and whether it is tall enough to hide a chapter */
export const KINDS: Record<PropKind, KindInfo> = {
  chimney: { r: 0.55, tall: true }, furnace: { r: 0.8, tall: true }, crates: { r: 0.6, tall: false }, anvil: { r: 0.5, tall: false },
  tent: { r: 0.7, tall: false }, hill: { r: 1.1, tall: false }, tree: { r: 0.5, tall: true },
  lattice: { r: 1.3, tall: true }, beam: { r: 1.0, tall: false }, node: { r: 0.4, tall: false },
  dome: { r: 1.3, tall: true }, telescope: { r: 0.8, tall: true }, starpost: { r: 0.4, tall: true }, rock: { r: 0.5, tall: false },
  block: { r: 0.35, tall: false }, bush: { r: 0.4, tall: false }, post: { r: 0.25, tall: false }, crystal: { r: 0.3, tall: false }
};

/* what each region always has, and what it adds as detail rises */
const ALWAYS: Record<Biome, PropKind[]> = {
  forge: ["chimney", "chimney", "furnace", "crates"],
  fields: ["tent", "tent", "hill", "tree"],
  grid: ["lattice", "beam", "node"],
  stars: ["dome", "telescope", "starpost"]
};
const EXTRA: Record<Biome, PropKind[]> = {
  forge: ["crates", "anvil", "chimney", "crates"],
  fields: ["tree", "hill", "tent", "tree"],
  grid: ["node", "lattice", "node", "beam"],
  stars: ["starpost", "rock", "starpost", "rock"]
};
/** how many props a region adds beyond ALWAYS, by detail */
export const EXTRA_COUNT = [3, 10, 18];
/** each region's front rim, and the spacing of its pieces by detail */
export const RIM: Record<Biome, PropKind> = { forge: "block", fields: "bush", grid: "post", stars: "crystal" };
export const RIM_GAP = [2.4, 1.5, 1.1];
/** how far in from a terrace's front edge the rim stands */
export const RIM_IN = 0.6;

const BIOMES: Record<string, Biome> = { forge: "forge", fields: "fields", grid: "grid", stars: "stars" };
/** the biome of a Part, from its quest motif; by its place in the course when it has none */
export function biomeOf(motif: string | undefined, p: number): Biome {
  return (motif && BIOMES[motif]) || (["forge", "fields", "grid", "stars"] as Biome[])[p % 4];
}

/* mulberry32: small, fast, and the same everywhere */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EDGE = 0.8;          /* kept clear of a terrace's edge */
const PATH_CLEAR = 1.0;    /* of the path's centre line */
const GATE_CLEAR = 2.0;    /* of a review gate */

/** the props of every region, for one level of detail */
export function placeProps(L: WorldLayout, motifs: (string | undefined)[], detail: 0 | 1 | 2): Prop[] {
  const out: Prop[] = [];
  L.regions.forEach((region) => {
    const biome = biomeOf(motifs[region.p], region.p);
    const rnd = random(0x5eed + region.p * 7919);
    const extra = EXTRA[biome];
    const kinds = ALWAYS[biome].concat(Array.from({ length: EXTRA_COUNT[detail] }, (_, k) => extra[k % extra.length]));
    const spots = candidates(L, region, rnd);
    /* the rim first, so it is not crowded out: low pieces along the front edge, with gaps
       where the path or a gate is */
    const rim = RIM[biome], gap = RIM_GAP[detail];
    for (let x = region.x0 + 0.8; x <= region.x1 - 0.8; x += gap) {
      const z = region.z1 - RIM_IN + (rnd() - 0.5) * 0.12;
      const turn = rnd() * Math.PI * 2, size = 0.85 + rnd() * 0.3;
      if (fits(L, region, out, rim, KINDS[rim], x, z)) out.push({ kind: rim, p: region.p, part: region.id, x, z, turn, size });
    }
    for (const kind of kinds) {
      const info = KINDS[kind];
      const at = spots.find((s) => fits(L, region, out, kind, info, s.x, s.z));
      if (!at) continue;
      out.push({ kind, p: region.p, part: region.id, x: at.x, z: at.z, turn: rnd() * Math.PI * 2, size: 0.85 + rnd() * 0.3 });
    }
  });
  return out;
}

/* a jittered grid over the terrace, shuffled */
function candidates(L: WorldLayout, region: RegionSpot, rnd: () => number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const step = 0.9;
  for (let x = region.x0 + EDGE; x <= region.x1 - EDGE; x += step) {
    for (let z = region.z0 + EDGE; z <= region.z1 - EDGE; z += step) {
      out.push({ x: x + (rnd() - 0.5) * step * 0.6, z: z + (rnd() - 0.5) * step * 0.6 });
    }
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
}

/** whether a prop of this kind may stand at (x, z) on this region, given those placed */
export function fits(L: WorldLayout, region: RegionSpot, placed: Prop[], kind: PropKind, info: KindInfo, x: number, z: number): boolean {
  const r = info.r;
  if (x - r < region.x0 + 0.2 || x + r > region.x1 - 0.2 || z - r < region.z0 + 0.2 || z + r > region.z1 - 0.2) return false;
  const row = L.isles.filter((s) => s.p === region.p);
  for (const s of L.isles) {
    if (Math.hypot(s.x - x, s.z - z) < ISLE_R + r + 0.35) return false;
  }
  for (let k = 1; k < L.path.length; k++) {
    if (segmentDistance(x, z, L.path[k - 1], L.path[k]) < PATH_CLEAR + r) return false;
  }
  for (const g of L.gates) {
    if (Math.hypot(g.at[0] - x, g.at[2] - z) < GATE_CLEAR + r) return false;
  }
  for (const q of placed) {
    if (q.p === region.p && Math.hypot(q.x - x, q.z - z) < KINDS[q.kind].r + r + 0.25) return false;
  }
  if (info.tall) {
    /* behind the row, or beyond its ends */
    const rowZ = -ROW_Z * region.p;
    const ends = row.reduce((m, s) => Math.max(m, Math.abs(s.x)), 0) + ISLE_R;
    if (!(z < rowZ - 1.2 || Math.abs(x) - r > ends + 0.6)) return false;
  }
  return true;
}

/** one of the far hills: a cone standing behind the last terrace, its foot hidden by it */
export interface Peak {
  /** the last Part's index and id, whose colours it takes */
  p: number; part: string;
  x: number; z: number;
  /** its radius, its height, and the height its foot stands at */
  r: number; h: number; base: number;
  turn: number;
}

/** how far behind the last terrace's back edge the two rows of far hills stand */
export const RANGE_ROWS = [3, 9];
/** from side to side, wider than any view of the world */
export const RANGE_HALF = 30;

/**
 * The far hills: two rows of tall cones behind the last terrace, the Observatory's, so
 * the view of the last Part, which has no terrace rising behind it as the others have,
 * shows hills there and not a third of a screen of empty sky. Their feet stand low enough
 * that the terrace's back edge hides them from the camera, which looks down from the
 * front; the fog (src/world/lighting.ts) fades them toward the region's --region-fog.
 * The same at every tier: a few hundred triangles, inside the one merged mesh.
 */
export function placeRange(L: WorldLayout): Peak[] {
  const last = L.regions[L.regions.length - 1];
  if (!last) return [];
  const rnd = random(0xf417 + L.regions.length);
  const out: Peak[] = [];
  RANGE_ROWS.forEach((back, row) => {
    const step = row ? 7 : 5;
    for (let x = -RANGE_HALF + (row ? step / 2 : 0); x <= RANGE_HALF; x += step) {
      const h = (row ? 7.5 : 4.5) + rnd() * (row ? 2 : 1.5);
      out.push({
        p: last.p, part: last.id,
        x: x + (rnd() - 0.5) * 1.6, z: last.z0 - back - rnd() * 1.2,
        r: h * (0.6 + rnd() * 0.12), h, base: last.top - 3,
        turn: rnd() * Math.PI
      });
    }
  });
  return out;
}
