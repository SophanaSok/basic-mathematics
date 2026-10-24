import { describe, expect, it } from "vitest";
import { stillStyle } from "./companion.ts";
import { MOODS } from "../learn/mood.ts";

describe("stillStyle", () => {
  it("names the pink sheet by default and the lilac one for lilac", () => {
    expect(stillStyle("idle", "", "../").image).toBe("../models/mochi/mochi-pink-poses.webp");
    expect(stillStyle("idle", "other", "").image).toBe("models/mochi/mochi-pink-poses.webp");
    expect(stillStyle("idle", "lilac", "").image).toBe("models/mochi/mochi-lilac-poses.webp");
  });
  it("puts mood i at i/8 of the way along the nine-box sheet", () => {
    MOODS.forEach((m, i) => expect(stillStyle(m, "pink", "").position).toBe((i * 100 / 8) + "% 0"));
    expect(stillStyle("nonsense", "pink", "").position).toBe("0% 0");
  });
});
