import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { mathText, texOf, type MathNode } from "./math-text.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);
/* the KaTeX the site bundles (package.json pins it), which ships no types */
const katex = require("katex") as { renderToString(tex: string, options: object): string };
/* the repo's own small HTML parser (tools/lib/html.js), to read KaTeX's markup in Node */
const html = require(path.join(ROOT, "tools/lib/html.js")) as {
  parse(src: string): HtmlNode;
};
interface HtmlNode { type: string; name: string; text: string; attrs: Record<string, string>; children: HtmlNode[] }

/* tools/lib/html.js nodes as the DOM-shaped nodes mathText reads */
function dom(n: HtmlNode): MathNode {
  return {
    nodeType: n.type === "text" ? 3 : n.type === "element" ? 1 : 9,
    nodeName: n.type === "text" ? "#text" : n.name,
    nodeValue: n.type === "text" ? n.text : null,
    childNodes: n.children.map(dom),
    getAttribute: (a: string) => (Object.prototype.hasOwnProperty.call(n.attrs, a) ? n.attrs[a] : null)
  };
}

/** the <math> element KaTeX writes for tex, as the page has it (null where KaTeX cannot
    typeset it: the page then shows the source in red, with no MathML) */
function mathOrNull(tex: string): MathNode | null {
  const doc = html.parse(katex.renderToString(tex, { output: "mathml", throwOnError: false, strict: false }));
  const find = (n: HtmlNode): HtmlNode | null => {
    if (n.type === "element" && n.name === "math") return n;
    for (const c of n.children) { const f = find(c); if (f) return f; }
    return null;
  };
  const m = find(doc);
  return m ? dom(m) : null;
}
function mathOf(tex: string): MathNode {
  const m = mathOrNull(tex);
  if (!m) throw new Error("no <math> for " + tex);
  return m;
}

const say = (tex: string) => mathText(mathOf(tex));

describe("mathText", () => {
  it("reads the opening puzzles' guesses as they are drawn", () => {
    expect(say("(7,5)")).toBe("(7, 5)");
    expect(say("(-3,3)")).toBe("(−3, 3)");
    expect(say("(3,-3)")).toBe("(3, −3)");
    expect(say("-\\tfrac12")).toBe("−1/2");
    expect(say("\\tfrac12")).toBe("1/2");
  });

  it("puts no space inside any bracket, square, curly or angled as well as round", () => {
    /* chapter 3's choices: a signed number after "[" was named "[ −5, 5]" */
    expect(say("[-5, 5]")).toBe("[−5, 5]");
    expect(say("[-3, 7]")).toBe("[−3, 7]");
    expect(say("\\text{Everything outside } [-3, 7]")).toBe("Everything outside [−3, 7]");
    expect(say("(-3, 7]")).toBe("(−3, 7]");
    expect(say("\\{-1, 1\\}")).toBe("{−1, 1}");
    expect(say("\\langle -1, 2 \\rangle")).toBe("⟨−1, 2⟩");
    expect(say("\\tfrac52")).toBe("5/2");
    expect(say("5")).toBe("5");
  });

  it("reads the choices and table headers that had no name", () => {
    expect(say("x \\le -3")).toBe("x ≤ −3");
    expect(say("x \\ge -3")).toBe("x ≥ −3");
    expect(say("\\theta")).toBe("θ");
    expect(say("\\pi/6")).toBe("π/6");
    expect(say("\\pi")).toBe("π");
    expect(say("0")).toBe("0");
  });

  it("spaces operators, keeps a sign tight, and names functions apart from their argument", () => {
    expect(say("x^2+1")).toBe("x² + 1");
    expect(say("a - b")).toBe("a − b");
    expect(say("-a + (-b)")).toBe("−a + (−b)");
    expect(say("\\cos\\theta")).toBe("cos θ");
    expect(say("x = r\\cos\\alpha")).toBe("x = r cos α");
    expect(say("\\sin\\alpha\\sin\\beta")).toBe("sin α sin β");
    expect(say("\\sin 30°")).toBe("sin 30°");
    expect(say("f(x) = 2x")).toBe("f(x) = 2x");
    expect(say("\\{1, 2\\}")).toBe("{1, 2}");
  });

  it("writes fractions, roots and scripts on one line, bracketed where they would read wrong", () => {
    expect(say("\\frac{\\sqrt3}{2}")).toBe("√3/2");
    expect(say("\\frac{x+1}{x-2}")).toBe("(x + 1)/(x − 2)");
    expect(say("\\sqrt{x+1}")).toBe("√(x + 1)");
    expect(say("\\sqrt[3]{8}")).toBe("∛8");
    expect(say("c_1")).toBe("c₁");
    expect(say("x_{n+1}")).toBe("xₙ₊₁");
    expect(say("x^{-1}")).toBe("x⁻¹");
    expect(say("2^{x+y}")).toBe("2^(x + y)");
    expect(say("a_{ij}")).toBe("aᵢⱼ");
    expect(say("30^\\circ")).toBe("30°");
    expect(say("f'(x)")).toBe("f′(x)");
    expect(say("\\binom{n}{k}")).toBe("(n choose k)");
    expect(say("\\left(x + \\frac{b}{2a}\\right)^2")).toBe("(x + b/(2a))²");
    expect(say("P + \\tfrac12(Q-P)")).toBe("P + (1/2)(Q − P)");
    expect(say("\\frac{\\sqrt2}{2}\\cdot\\frac12")).toBe("√2/2 ⋅ 1/2");
  });

  it("says what an accent or a big operator means rather than drawing it", () => {
    expect(say("\\vec v")).toBe("vector v");
    expect(say("\\overline{AB}")).toBe("AB bar");
    expect(say("\\hat x")).toBe("x hat");
    expect(say("\\sum_{k=1}^n k")).toBe("∑ from k = 1 to n k");
    expect(say("\\lim_{x\\to0} f(x)")).toBe("lim as x → 0 f(x)");
  });

  it("reads | as a bar, not as 'divides', and a matrix row by row", () => {
    expect(say("|x|")).toBe("|x|");
    expect(say("\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}")).toBe("([1, 2; 3, 4])");
  });

  it("finds the TeX a formula was typeset from", () => {
    expect(texOf(mathOf("x \\le -3"))).toBe("x \\le -3");
  });

  /* Every formula in the course, as the pages have it: none comes out empty, none as
     TeX source, and none with a character the line should never carry. This is what
     keeps a name from going blank again when a chapter gains a new construction. */
  it("gives a line for every formula in the course", () => {
    const pages: string[] = [];
    for (const dir of ["parts/1-algebra", "parts/2-geometry", "parts/3-coordinates", "parts/4-topics"]) {
      for (const f of fs.readdirSync(path.join(ROOT, dir))) if (f.endsWith(".html")) pages.push(path.join(ROOT, dir, f));
    }
    const formulas = new Set<string>();
    for (const p of pages) {
      const src = fs.readFileSync(p, "utf8").replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, "").replace(/<[^>]+>/g, " ");
      for (const m of src.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g)) formulas.add(html.parse((m[1] ?? m[2]).trim()).children.map(c => c.text).join(""));
    }
    expect(formulas.size).toBeGreaterThan(1000);
    const bad: string[] = [];
    for (const tex of formulas) {
      const m = tex.trim() ? mathOrNull(tex) : null;
      if (!m) continue;
      const line = mathText(m);
      if (!line || /\\|undefined|\u2061|\u2062|∣/.test(line)) bad.push(tex + " => " + JSON.stringify(line));
    }
    expect(bad).toEqual([]);
  });
});
