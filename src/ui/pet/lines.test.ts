import { describe, expect, it } from "vitest";
import { bought, grewLine, LINES, STAGE_NAMES, lineFor, placed, removed, wore } from "./lines.ts";

const now = 1_000_000_000_000;
const need = (n: number) => ({ n, at: now });

describe("pool lines", () => {
  it("pins every string", () => {
    expect(LINES).toEqual({
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
    });
  });
  it("pins the lines that carry an item name", () => {
    expect(bought("Ball")).toBe("Mochi has a new ball!");
    expect(placed("Castle")).toBe("The castle is in the pool.");
    expect(removed("Castle")).toBe("The castle is put away.");
    expect(wore("Party hat")).toBe("Mochi is wearing the party hat.");
  });
  it("pins the stage names and the growth line", () => {
    expect(STAGE_NAMES).toEqual({ hatchling: "Hatchling", fry: "Fry", juvenile: "Juvenile", adult: "Adult", elder: "Elder" });
    expect(grewLine("hatchling")).toBe("Mochi grew into a hatchling!");
    expect(grewLine("fry")).toBe("Mochi grew into a fry!");
    expect(grewLine("juvenile")).toBe("Mochi grew into a juvenile!");
    expect(grewLine("adult")).toBe("Mochi grew into an adult!");
    expect(grewLine("elder")).toBe("Mochi grew into an elder!");
  });
  it("idle line follows the lowest need, and is glad otherwise", () => {
    expect(lineFor({}, now)).toBe(LINES.glad);
    expect(lineFor({ needs: { tummy: need(2) } }, now)).toBe(LINES.tummy);
    expect(lineFor({ needs: { play: need(2) } }, now)).toBe(LINES.play);
    expect(lineFor({ needs: { clean: need(2) } }, now)).toBe(LINES.clean);
    expect(lineFor({ needs: { spark: need(2) } }, now)).toBe(LINES.spark);
    expect(lineFor({ needs: { tummy: need(2), clean: need(1) } }, now)).toBe(LINES.clean);
    expect(lineFor({ needs: { tummy: need(3), play: need(5), clean: need(3), spark: need(3) } }, now)).toBe(LINES.glad);
    expect(lineFor("junk", now)).toBe(LINES.glad);
  });
  it("never blames", () => {
    Object.values(LINES).forEach((l) => expect(l).not.toMatch(/neglect|forgot|should|fail|sick|die|hungry|starv/i));
  });
});
