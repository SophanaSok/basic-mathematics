import { describe, expect, it } from "vitest";
import { approachDue, mostMissed } from "./approach.ts";

const m = (sec: string, miss = true) => ({ sec, miss });

describe("mostMissed", () => {
  it("is null with no items, no misses, or misses without a section", () => {
    expect(mostMissed([])).toBeNull();
    expect(mostMissed([m("a", false), m("b", false)])).toBeNull();
    expect(mostMissed([m("", true), m("", true)])).toBeNull();
  });
  it("names a single missed section", () => {
    expect(mostMissed([m("a", false), m("b")])).toBe("b");
  });
  it("gives a tie to the section whose first miss came first", () => {
    expect(mostMissed([m("a"), m("b"), m("b"), m("a")])).toBe("a");
    expect(mostMissed([m("b"), m("a"), m("a"), m("b")])).toBe("b");
  });
  it("lets a later section overtake only when strictly greater", () => {
    expect(mostMissed([m("a"), m("b"), m("b")])).toBe("b");
    expect(mostMissed([m("a"), m("a"), m("b"), m("b")])).toBe("a");
  });
  it("ignores items that are not misses", () => {
    expect(mostMissed([m("a"), m("b", false), m("b", false), m("b", false)])).toBe("a");
  });
});

describe("approachDue", () => {
  it("is due from the second wrong check after the ladder ran out", () => {
    expect([0, 1, 2, 3].map(approachDue)).toEqual([false, false, true, true]);
  });
});
