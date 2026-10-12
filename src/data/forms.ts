/* The five forms of the learner's avatar, and the level at which each unlocks. Data only:
   src/core/forms.ts reads it for the logic, and the avatar drawing and the progress page
   read the names and blurbs. The levels rise strictly and the first is 1 (the test holds
   it to that). */

export interface FormStage { n: 1 | 2 | 3 | 4 | 5; id: string; name: string; level: number; blurb: string }

export const FORMS: readonly FormStage[] = [
  { n: 1, id: "pip", name: "Pip", level: 1, blurb: "A counting pebble with one mark and a single sprout." },
  { n: 2, id: "sprig", name: "Sprig", level: 3, blurb: "Up on two legs, head held forward, two leaves." },
  { n: 3, id: "wayfinder", name: "Wayfinder", level: 6, blurb: "A cloak in your Part's color and a staff with a ring." },
  { n: 4, id: "surveyor", name: "Surveyor", level: 10, blurb: "Broad shoulders, a second ring, and three stones in orbit." },
  { n: 5, id: "luminary", name: "Luminary", level: 15, blurb: "A crown of five stones, crossed rings, and a beacon staff." }
];

export const LAST_FORM = 5;
