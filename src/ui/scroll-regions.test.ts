import { describe, expect, it } from "vitest";
import { MARK, overflows, update, type Box } from "./scroll-regions.ts";

/* the logic on a stand-in box; the watching (ResizeObserver, the fonts, renderMath) is held
   to in Chromium by the axe suite of tools/check-browser.js, at 360px, where formulas and
   tables overflow, and at 1280px, where none of them does */
function box(o: { cls?: string; scroll: number; client: number; attrs?: Record<string, string>; inControl?: boolean }): Box & { attrs: Record<string, string> } {
  const attrs: Record<string, string> = { ...(o.attrs || {}) };
  return {
    attrs,
    scrollWidth: o.scroll,
    clientWidth: o.client,
    hasAttribute: (n) => Object.prototype.hasOwnProperty.call(attrs, n),
    getAttribute: (n) => (Object.prototype.hasOwnProperty.call(attrs, n) ? attrs[n] : null),
    setAttribute: (n, v) => { attrs[n] = v; },
    removeAttribute: (n) => { delete attrs[n]; },
    matches: (sel) => sel === "." + (o.cls || "katex-display"),
    closest: () => (o.inControl ? {} : null)
  };
}

describe("a box that scrolls sideways", () => {
  it("is a named tab stop while it overflows", () => {
    const b = box({ scroll: 420, client: 320 });
    expect(update(b)).toBe(true);
    expect(b.attrs).toEqual({ [MARK]: "formula", tabindex: "0", role: "group", "aria-label": "Formula, scrolls sideways" });
    const t = box({ cls: "tbl-wrap", scroll: 600, client: 320 });
    update(t);
    expect(t.attrs["aria-label"]).toBe("Table, scrolls sideways");
  });

  it("is left as the page wrote it while everything fits, a pixel of rounding included", () => {
    for (const [scroll, client] of [[320, 320], [321, 320], [0, 0]]) {
      const b = box({ scroll, client });
      expect(overflows(b)).toBe(false);
      expect(update(b)).toBe(false);
      expect(b.attrs).toEqual({});
    }
  });

  it("gives back what it added once it fits again, and only that", () => {
    const b = box({ scroll: 420, client: 320, attrs: { class: "katex-display" } });
    update(b);
    update(b);
    expect(b.attrs.tabindex).toBe("0");
    (b as { clientWidth: number }).clientWidth = 900;
    expect(update(b)).toBe(false);
    expect(b.attrs).toEqual({ class: "katex-display" });
  });

  it("leaves alone a box with a tab stop, role or name of its own, and one inside a control", () => {
    const own: Record<string, string>[] = [{ tabindex: "-1" }, { role: "math" }, { "aria-label": "x" }];
    for (const attrs of own) {
      const b = box({ scroll: 420, client: 320, attrs });
      expect(update(b)).toBe(false);
      expect(b.attrs).toEqual(attrs);
    }
    const c = box({ scroll: 420, client: 320, inControl: true });
    expect(update(c)).toBe(false);
    expect(c.attrs).toEqual({});
  });
});
