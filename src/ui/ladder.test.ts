import { describe, expect, it } from "vitest";
import { start } from "../learn/ladder.ts";
import { buttonHtml, mount, offerHtml, offerText, supportHtml, type SupportOption } from "./ladder.ts";
import { toSave } from "../learn/ladder.ts";

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

describe("the support line", () => {
  it("names the weak prerequisites, escaped, and the button only with a worked example", () => {
    const w = [{ full: "§1.1 <b>A</b>", href: "x.html#a\"" }, { full: "§1.2 B", href: "x.html#b" }, { full: "§1.3 C", href: "x.html#c" }];
    const h = supportHtml({ from: "requires", weak: w }, true);
    expect(h).toContain("&lt;b&gt;A&lt;/b&gt;");
    expect(h).toContain("&quot;");
    expect(h).toMatch(/<\/a>, <a [^>]*>§1.2 B<\/a> and <a [^>]*>§1.3 C<\/a>, which your recent answers mark as shaky\./);
    expect(h).toContain("data-worked");
    expect(supportHtml({ from: "own", weak: [] }, false)).toBe("Your recent answers in this section are shaky.");
  });

  /* the smallest DOM mount touches */
  function el(): any {
    const kids: any[] = [], attrs: Record<string, string> = {};
    const e: any = {
      className: "", id: "", hidden: false, innerHTML: "", type: "", kids, parentNode: null,
      setAttribute: (k: string, v: string) => { attrs[k] = v; }, getAttribute: (k: string) => attrs[k] ?? null, hasAttribute: (k: string) => k in attrs,
      appendChild: (c: any) => { kids.push(c); c.parentNode = e; return c; },
      insertBefore: (c: any, ref: any) => { const i = ref ? kids.indexOf(ref) : -1; if (i < 0) kids.push(c); else kids.splice(i, 0, c); c.parentNode = e; return c; },
      addEventListener: () => {}, focus: () => {}, remove: () => {}, querySelector: () => null, querySelectorAll: () => ({ forEach: () => {} }), contains: () => false
    };
    return e;
  }
  function run(support: SupportOption | undefined) {
    (globalThis as any).document = { createElement: () => el(), activeElement: null };
    const ex = el(), form = el();
    ex.appendChild(form);
    const ctl = mount({ ex, form, hints: ["one", "two"], saved: 0, id: "c", name: "Exercise 1", solved: () => false, persist: () => {}, render: () => {}, hasSolution: true, support });
    const states: unknown[] = [], labels: string[] = [], lines: string[] = [];
    const snap = () => { states.push(JSON.stringify(ctl.state)); labels.push(ctl.button ? ctl.button.innerHTML : ""); states.push(toSave(ctl.state, false, undefined)); };
    snap();
    lines.push(ctl.afterWrong("1", null, null));
    snap();
    ctl.openNext(); snap();
    lines.push(ctl.afterWrong("2", null, null));
    ctl.openNext(); snap();
    return { states, labels, lines, supports: ex.kids.filter((k: any) => k.className.includes("ex-support")).length };
  }

  it("changes only the offer line and the support paragraph across the three levels", () => {
    const sup = (level: SupportOption["level"]): SupportOption => ({ level, from: "own", weak: [], worked: null });
    const std = run(undefined), g = run(sup("guided")), l = run(sup("light")), s = run(sup("standard"));
    for (const r of [g, l, s]) {
      expect(r.states).toEqual(std.states);
      expect(r.labels).toEqual(std.labels);
    }
    expect([std.supports, g.supports, l.supports, s.supports]).toEqual([0, 1, 0, 0]);
    expect(l.lines[0]).not.toContain("ex-offer");
    expect(l.lines[1]).toBe(std.lines[1]);
    expect(std.lines[0]).toContain("ex-offer");
    expect(g.lines).toEqual(std.lines);
    expect(s.lines).toEqual(std.lines);
  });
});
