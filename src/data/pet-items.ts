/* The pool shop's catalogue (decisions 0011 and 0015): fixed facet prices, nothing time-limited or random,
   and nothing bought with money. Pure data. A price here is the price at the moment of a purchase; the
   spent ledger stores that number and the balance clamps it, so this table is never read back from a record.

   Ids are namespaced by kind. Snacks are eaten in the act of buying (no bag); toys and decor are bought
   once. A decor item's `cell` is its column in public/models/mochi/decor.png (tools/gen-water.js
   DECOR_CELLS) and `pos` is where it sits in the pool window, in percent of the window, left edge and
   bottom edge, so the five sit in a bottom band from left to right and never overlap at DECOR_SIZE. */
export type PetItemKind = "snack" | "toy" | "decor";
export interface PetItem {
  id: string;
  kind: PetItemKind;
  name: string;
  price: number;
  /** snacks: Tummy hearts given */
  hearts?: number;
  /** decor: the column in decor.png */
  cell?: number;
  /** decor: left and bottom, percent of the window */
  pos?: { x: number; y: number };
}

/** the side of a decor box, percent of the window (so the positions below never overlap) */
export const DECOR_SIZE = 16;

export const PET_ITEMS: readonly PetItem[] = [
  { id: "snack:kelp-chip", kind: "snack", name: "Kelp chip", price: 5, hearts: 1 },
  { id: "snack:shrimp-puff", kind: "snack", name: "Shrimp puff", price: 8, hearts: 2 },
  { id: "snack:berry-bite", kind: "snack", name: "Berry bite", price: 12, hearts: 3 },
  { id: "toy:ball", kind: "toy", name: "Ball", price: 25 },
  { id: "toy:ring", kind: "toy", name: "Ring", price: 40 },
  { id: "toy:boat", kind: "toy", name: "Boat", price: 60 },
  { id: "decor:plant", kind: "decor", name: "Plant", price: 30, cell: 0, pos: { x: 8, y: 22 } },
  { id: "decor:rock", kind: "decor", name: "Rock", price: 20, cell: 1, pos: { x: 25, y: 11 } },
  { id: "decor:shell", kind: "decor", name: "Shell", price: 35, cell: 2, pos: { x: 42, y: 5 } },
  { id: "decor:chest", kind: "decor", name: "Chest", price: 80, cell: 3, pos: { x: 59, y: 11 } },
  { id: "decor:castle", kind: "decor", name: "Castle", price: 120, cell: 4, pos: { x: 76, y: 22 } }
];

/** the item with this id, or undefined */
export function itemOf(id: unknown): PetItem | undefined {
  return typeof id === "string" ? PET_ITEMS.find((i) => i.id === id) : undefined;
}
/** what the item costs; 0 for an id that is not in the catalogue */
export function priceOf(id: unknown): number {
  const i = itemOf(id);
  return i ? i.price : 0;
}
