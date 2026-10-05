/* Where everything of the course world stands: plain numbers, no Three.js, so the same
   layout is tested in Node (layout.test.ts) and drawn in the browser.

   Each Part is a region: a terrace (a slab of ground on a rock base) one row of the
   world deep, set back and up from the Part before it, so the four make a stepped
   diorama with the Foundry at the front and the Observatory at the top. The chapters
   stand on their terrace in reading order, alternating direction from row to row, on
   one path that bends up the cliff between terraces; at each bend stands the gate to
   that Part's mixed-review set. */

export const ROW_Z = 9;          /* a terrace's depth, and the step back from one to the next */
export const ROW_Y = 1.5;        /* the step up */
export const STEP_X = 3.2;       /* between chapters in a row */
export const DECK = 0.36;        /* an island's walking surface above its anchor */
export const PLINTH = 0.3;       /* half an island's plinth: its foot stands on the terrace */
export const BASE_Y = -1.8;      /* the bottom of every terrace's rock */
export const HALF_W = 11;        /* half the width of a terrace */
export const ISLE_R = 1.45;      /* an island's footprint, its progress ring included */

export type Vec3 = [number, number, number];

export interface CourseShape {
  parts: { id: string; chapters: { id: string; sections?: { id: string }[] }[] }[];
}

export interface IsleSpot {
  id: string;
  /** the Part's index and id, the chapter's index in it, the Part's chapter count */
  p: number; part: string; j: number; n: number;
  x: number; y: number; z: number;
}
export interface RegionSpot {
  id: string; p: number;
  /** the terrace's extent: x0..x1, z0 (back) .. z1 (front), its top and its base */
  x0: number; x1: number; z0: number; z1: number; top: number; base: number;
}
export interface GateSpot {
  /** the Part whose review set the gate opens */
  part: string; p: number;
  /** the island whose chapter carries #review */
  isle: number;
  /** where the gate stands, and the way the path runs through it */
  at: Vec3; along: Vec3;
}
export interface WorldLayout {
  isles: IsleSpot[];
  regions: RegionSpot[];
  gates: GateSpot[];
  /** the path's control points: every island, with a bend after each Part's last */
  path: Vec3[];
  /** Part id -> index of the island of its review set */
  review: Record<string, number>;
}

export function layout(course: CourseShape): WorldLayout {
  const isles: IsleSpot[] = [];
  const review: Record<string, number> = {};
  course.parts.forEach((part, p) => {
    const n = part.chapters.length, dir = p % 2 === 0 ? 1 : -1;
    part.chapters.forEach((ch, j) => {
      isles.push({ id: ch.id, p, part: part.id, j, n, x: (j - (n - 1) / 2) * STEP_X * dir, y: ROW_Y * p, z: -ROW_Z * p });
      if ((ch.sections || []).some((s) => s.id === "review")) review[part.id] = isles.length - 1;
    });
    if (review[part.id] === undefined && n) review[part.id] = isles.length - 1;
  });

  const path: Vec3[] = [];
  const gates: GateSpot[] = [];
  course.parts.forEach((part, p) => {
    const row = isles.filter((s) => s.p === p);
    row.forEach((s) => path.push([s.x, s.y, s.z]));
    const last = row[row.length - 1];
    if (!last) return;
    const dir = p % 2 === 0 ? 1 : -1;
    const next = isles.filter((s) => s.p === p + 1)[0];
    const bend: Vec3 = next
      ? [(last.x + next.x) / 2 + dir * 2.2, last.y + ROW_Y / 2, last.z - ROW_Z / 2]
      : [last.x + dir * 3.1, last.y, last.z];
    path.push(bend);
    if (review[part.id] !== undefined) {
      gates.push({ part: part.id, p, isle: review[part.id], at: bend, along: next ? [0, 0, -1] : [dir, 0, 0] });
    }
  });

  const regions: RegionSpot[] = course.parts.map((part, p) => ({
    id: part.id, p,
    x0: -HALF_W, x1: HALF_W,
    z0: -ROW_Z * p - ROW_Z / 2, z1: -ROW_Z * p + ROW_Z / 2,
    top: ROW_Y * p - PLINTH, base: BASE_Y
  }));

  return { isles, regions, gates, path, review };
}

/** the region the point (x, z) stands over, by its row: 0 at the front, fractional between */
export function rowAt(z: number, rows: number): number {
  return Math.min(Math.max(-z / ROW_Z, 0), Math.max(0, rows - 1));
}

/** the distance from (x, z) to the segment a-b, on the ground plane */
export function segmentDistance(x: number, z: number, a: Vec3, b: Vec3): number {
  const dx = b[0] - a[0], dz = b[2] - a[2];
  const len2 = dx * dx + dz * dz;
  const t = len2 ? Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[2]) * dz) / len2)) : 0;
  const px = a[0] + t * dx - x, pz = a[2] + t * dz - z;
  return Math.sqrt(px * px + pz * pz);
}
