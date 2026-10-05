import { describe, expect, it } from "vitest";
import { start } from "../learn/ladder.ts";
import { buttonHtml, offerHtml, offerText } from "./ladder.ts";

/* the markup that needs no DOM; the rest of this module (mount, focus, the idle timer) is
   held to in Chromium by tools/game/browser.test.js */
describe("the offer line", () => {
  const offers = ["clue", "solution", "retry"] as const;
  const signals = [null, "rapid", "repeat", "misses", "idle"] as const;

  it("is one line of words, with no number in it, whatever the signal", () => {
    for (const o of offers) {
      for (const s of signals) {
        const t = offerText(o, s);
        expect(t.length).toBeGreaterThan(10);
        expect(t).not.toMatch(/\d/);
        expect(offerHtml(o, s)).toMatch(/^<p class="ex-next hint ex-offer" data-offer="[a-z]+"( data-signal="[a-z]+")?>[^<]*<\/p>$/);
      }
    }
  });

  it("a stuck signal changes the words of a clue or solution offer, and nothing else", () => {
    for (const o of ["clue", "solution"] as const) {
      const words = signals.map((s) => offerText(o, s));
      expect(new Set(words).size).toBe(words.length);
    }
    for (const s of signals) expect(offerText("retry", s)).toBe(offerText("retry", null));
  });

  it("offers a clue only while one is left, and never names what it says", () => {
    expect(offerText("clue", null)).toMatch(/clue/i);
    expect(offerText("solution", null)).toMatch(/solution/i);
  });
});

describe("the clue button", () => {
  it("says which clue it opens and how many there are, and goes once all are open", () => {
    expect(buttonHtml(start(2))).toBe('Show a clue <span class="ex-clue-of">(1 of 2)</span>');
    expect(buttonHtml(start(3, 1))).toBe('Next clue <span class="ex-clue-of">(2 of 3)</span>');
    expect(buttonHtml(start(1, 1))).toBe("");
    expect(buttonHtml(start(0))).toBe("");
  });
});
