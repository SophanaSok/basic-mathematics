import { describe, expect, it } from "vitest";
import { LINES, lineFor } from "./lines.ts";

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
      giftTaken: "Mochi has had today's pellet. Snacks come to the shop soon.",
      playCap: "Mochi has played enough for today. The Arena is always open."
    });
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
