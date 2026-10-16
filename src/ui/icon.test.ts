import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import data from "../data/icons.json";
import { iconSvg, api } from "./icon.ts";

const shell = createRequire(import.meta.url)("../../tools/lib/shell.js") as { icon: (name: string) => string };
const names = Object.keys(data.icons);

describe("iconSvg", () => {
  it("writes the markup the shell writes, byte for byte, for every icon", () => {
    expect(names.length).toBeGreaterThan(10);
    for (const n of names) expect(iconSvg(n)).toBe(shell.icon(n));
  });
  it("is aria-hidden, filled in currentColor, and adds the class it is given", () => {
    const s = iconSvg("tick", "tick");
    expect(s).toContain('class="icon icon-tick tick"');
    expect(s).toContain('aria-hidden="true" focusable="false"');
    expect(s).not.toMatch(/<title|<text/);
    expect(s).toContain('fill="currentColor"');
  });
  it("throws on a name that is not in the set, under test", () => {
    expect(() => iconSvg("no-such-icon")).toThrow(/no-such-icon/);
    expect(() => iconSvg("constructor")).toThrow();
  });
  it("is what window.BMIcon.svg is", () => {
    expect(api.svg).toBe(iconSvg);
  });
});
