/* Mochi's lines in the pool (docs/decisions/0015-mochi-pool.md). Never blaming: a low need is
   something Mochi would like, not something the learner failed at. Pure: the clock is an argument. */
import { heartsOf } from "../../learn/pet.ts";
import type { Need, Stage } from "../../learn/pet.ts";

export const LINES = {
  glad: "Mochi is glad to see you.",
  tummy: "Mochi could use a snack.",
  play: "Mochi would like to play.",
  clean: "The pool is getting mossy.",
  spark: "A review would light Mochi up.",
  fed: "Mochi munches happily.",
  played: "Mochi zooms around the pool.",
  cleaned: "The water sparkles again.",
  petted: "Mochi nuzzles your hand.",
  giftTaken: "Mochi has had today's pellet.",
  giftTakenShop: "Mochi has had today's pellet. The shop has snacks.",
  playCap: "Mochi has played enough for today. The Arena is always open.",
  noToy: "Mochi needs a toy to play. The shop has some.",
  notEnough: "Not enough facets yet. Learning earns them.",
  behind: "Mochi's facets are catching up after a sync.",
  full: "Mochi is full for now.",
  wardrobeEmpty: "Nothing to wear yet. The shop has hats and more.",
  tookOff: "Mochi took it off.",
  growthHint: "Good days help Mochi grow: learn something and care for the pool."
} as const;

/** the stage names, as the Growth tab shows them */
export const STAGE_NAMES: Record<Stage, string> = { hatchling: "Hatchling", fry: "Fry", juvenile: "Juvenile", adult: "Adult", elder: "Elder" };

/** the one-time line when Mochi reaches a stage: "a fry", "an adult" */
export const grewLine = (stage: Stage): string => {
  const name = STAGE_NAMES[stage].toLowerCase();
  return "Mochi grew into " + (/^[aeiou]/.test(name) ? "an " : "a ") + name + "!";
};

/** the shop's lines that carry an item's name (lower case inside a sentence) */
export const bought = (name: string): string => "Mochi has a new " + name.toLowerCase() + "!";
export const wore = (name: string): string => "Mochi is wearing the " + name.toLowerCase() + ".";
export const placed = (name: string): string => "The " + name.toLowerCase() + " is in the pool.";
export const removed = (name: string): string => "The " + name.toLowerCase() + " is put away.";

const ORDER: Need[] = ["tummy", "play", "clean", "spark"];

/** the idle line: by the lowest need under three hearts (first in order on a tie), else the glad line */
export function lineFor(pet: unknown, now: number): string {
  const needs = pet && typeof pet === "object" && !Array.isArray(pet) ? (pet as any).needs : undefined;
  const nd = needs && typeof needs === "object" ? needs : {};
  let best: Need | null = null, low = 3;
  ORDER.forEach((n) => { const h = heartsOf(n, nd[n], now); if (h < low) { low = h; best = n; } });
  return best ? LINES[best] : LINES.glad;
}
