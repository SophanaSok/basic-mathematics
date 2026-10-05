import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { candidates, detect, ORDER, QUESTIONS, type DetectInput, type DetectorId } from "./detectors.ts";

/* ------------------------------------------------- the site's own grading -- */

const ROOT = path.resolve(import.meta.dirname, "../..");

type Matches = (given: string, answer: string, type: string, tol: number) => boolean;
interface SiteGrading { matches: Matches; grade: (given: string, answer: string, type: string, tol: number) => boolean }

/* assets/site.js is a script, not a module: it is run under a stub window, as
   tools/check-static.js does for its placeholder check, and its exports are used as the
   page uses them */
function loadSite(): SiteGrading {
  const noop = () => {};
  const el = {
    getAttribute: () => null, setAttribute: noop, removeAttribute: noop, hasAttribute: () => false,
    appendChild: noop, insertBefore: noop, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: noop, classList: { add: noop, remove: noop }, style: {}
  };
  const document = {
    readyState: "complete", body: el, documentElement: el, querySelector: () => null, querySelectorAll: () => [],
    getElementById: () => null, createElement: () => el, addEventListener: noop
  };
  const win: Record<string, unknown> = {
    document, console, addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }),
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop }
  };
  win.window = win;
  win.self = win;
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "assets/site.js"), "utf8"), win, { filename: "assets/site.js" });
  const site = win.BMSite as SiteGrading | undefined;
  if (!site || typeof site.matches !== "function") throw new Error("assets/site.js did not export BMSite.matches under the stub");
  return site;
}
const SITE = loadSite();

/* "|" separates accepted answers, and the whole key is one too (site.js alternatives) */
function alternatives(raw: string): string[] {
  raw = (raw || "").trim();
  return [raw].concat(raw.split("|")).map((s) => s.trim()).filter((s) => s !== "");
}
/* a DetectInput graded exactly as assets/site.js question() grades it */
function input(given: string, answer: string, type: string, kind: "text" | "multi" = "text", tol = 0): DetectInput {
  const answers = alternatives(answer);
  const cmp = kind === "multi" ? "set" : type;
  return { given, kind, type: kind === "multi" ? "multi" : type, answers, grade: (c) => answers.some((a) => SITE.matches(c, a, cmp, tol)) };
}

/* ------------------------------------------------- every key in the course -- */

interface Key { where: string; answer: string; type: string; tol: number; kind: "text" | "multi" | "choice" | "order" | "figure" }

/* with the parsers the static checks use (tools/lib), so these are the same exercises
   progress-keys counts: every typed answer, every blank's own key, every option list */
function courseKeys(): Key[] {
  const require = createRequire(import.meta.url);
  const site = require(path.join(ROOT, "tools/lib/site.js"));
  const { exercisesOf } = require(path.join(ROOT, "tools/lib/keys.js"));
  const out: Key[] = [];
  for (const page of site.htmlPages() as string[]) {
    const { doc } = site.readPage(null, page);
    for (const e of exercisesOf(doc)) {
      const tol = parseFloat(e.el.getAttribute("data-tol") || "") || 0;
      const where = page + "#" + e.key;
      if (e.kind === "blank") {
        e.el.queryAll(".blank").forEach((b: { getAttribute(n: string): string | null }, j: number) => {
          out.push({ where: where + " blank " + (j + 1), answer: b.getAttribute("data-answer") || "", type: b.getAttribute("data-type") || "number", tol, kind: "text" });
        });
      } else if (e.kind === "text") out.push({ where, answer: e.answer, type: e.type, tol, kind: "text" });
      else if (e.kind === "multi") out.push({ where, answer: e.answer, type: "set", tol, kind: "multi" });
      else if (e.kind === "choice") out.push({ where, answer: e.answer, type: "number", tol, kind: "choice" });
      else out.push({ where, answer: e.answer, type: e.type, tol, kind: e.kind });
    }
  }
  return out;
}
const KEYS = courseKeys();

/* every run of consecutive words of a question, as it is and stripped of punctuation */
function pieces(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out = new Set<string>([text]);
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j <= words.length; j++) {
      const run = words.slice(i, j).join(" ");
      out.add(run);
      out.add(run.replace(/[?,.;:!]/g, ""));
    }
  }
  return Array.from(out).filter((s) => s.trim() !== "");
}

/* ------------------------------------------------------------------ tests -- */

describe("the questions", () => {
  const all = Object.entries(QUESTIONS) as [DetectorId, string][];

  it("are questions, without digits, one per detector", () => {
    expect(all.map(([id]) => id).sort()).toEqual(ORDER.slice().sort());
    for (const [, q] of all) {
      expect(q.trim().endsWith("?")).toBe(true);
      expect(q).not.toMatch(/\d/);
    }
  });

  it("never hold a string that grades as an answer, for any key in the course", () => {
    expect(KEYS.length).toBeGreaterThan(380);
    const leaks: string[] = [];
    for (const key of KEYS) {
      const cmp = key.kind === "multi" ? "set" : key.type;
      for (const [id, q] of all) {
        for (const p of pieces(q)) {
          if (SITE.grade(p, key.answer, cmp === "figure" || cmp === "order" ? "exact" : cmp, key.tol)) leaks.push(key.where + " " + id + ": " + JSON.stringify(p));
        }
      }
    }
    expect(leaks).toEqual([]);
  });
});

describe("each detector", () => {
  /* the id of what fires, after holding its message to the fixed question for that id */
  const fires = (given: string, answer: string, type: string, kind: "text" | "multi" = "text") => {
    const d = detect(input(given, answer, type, kind));
    if (d) expect(d.question).toBe(QUESTIONS[d.id]);
    return d?.id ?? null;
  };

  it("sign: a sign flipped anywhere in the answer", () => {
    expect(fires("-7", "7", "number")).toBe("sign");
    expect(fires("1/6", "-1/6", "number")).toBe("sign");
    expect(fires("3x+6", "3x-6|-6+3x", "expr")).toBe("sign");
    expect(fires("(6,2)", "(6,-2)|6,-2", "exact")).toBe("sign");
    expect(fires("2,7", "2,-7", "set")).toBe("sign");
  });

  it("reciprocal: a fraction upside down, or one over the answer", () => {
    expect(fires("3/4", "4/3", "number")).toBe("reciprocal");
    expect(fires("4", "0.25", "number")).toBe("reciprocal");
  });

  it("double: a factor of two in or out", () => {
    expect(fires("12", "24", "number")).toBe("double");
    expect(fires("65", "130", "number")).toBe("double");
  });

  it("decimal: the point in the wrong place", () => {
    expect(fires("785", "78.5", "number")).toBe("decimal");
    expect(fires("0.0096", "0.96", "number")).toBe("decimal");
  });

  it("missing: a strict part of a list answer, and of a tick-every-option list", () => {
    expect(fires("1", "1,-1", "set")).toBe("missing");
    expect(fires("2", "2,-1/2", "set")).toBe("missing");
    expect(fires("1,2", "1,2,4", "multi", "multi")).toBe("missing-option");
    expect(fires("1,3", "1,2,4", "multi", "multi")).toBeNull();
  });

  it("unreduced: a fraction the key wants reduced", () => {
    expect(fires("2/6", "1/3", "exact")).toBe("unreduced");
    expect(fires("x=6/2", "x=3", "exact")).toBe("unreduced");
  });

  it("fires only when its candidate grades right", () => {
    expect(fires("987654321", "7", "number")).toBeNull();
    expect(fires("notananswer987", "(6,-2)", "exact")).toBeNull();
    expect(fires("5", "7", "number")).toBeNull();
    expect(detect({ given: "-7", kind: "text", type: "number", answers: ["7"], grade: () => false })).toBeNull();
    expect(detect({ given: "-7", kind: "text", type: "number", answers: ["7"], grade: () => { throw new Error("x"); } })).toBeNull();
    for (const id of ORDER) {
      for (const c of candidates(id, input("-7", "7", "number"))) expect(c).not.toBe("-7");
    }
  });

  it("asks about one slip, the first in ORDER that fires", () => {
    /* -20 against 10: flipping the sign gives 20, halving gives -10, and only both at
       once would do, which no single detector tries; -1/2 against 2 likewise */
    expect(fires("-20", "10", "number")).toBeNull();
    /* 4/8 against 1/2 as exact text: reducing it gives the key, and nothing else does */
    expect(fires("4/8", "1/2", "exact")).toBe("unreduced");
    /* 1/4 against 1/2 as exact text: halving the 4 gives the key */
    expect(fires("1/4", "1/2", "exact")).toBe("double");
  });
});

/* Wrong answers made from a real key by each slip run forwards: every detector's own
   candidates of the key (the sign flipped, the fraction turned over, a factor of two or a
   power of ten in or out: each its own inverse, so they are also the slip made), a
   fraction scaled up so it is no longer reduced, and a list or option set with one
   member left out. */
function slips(answer: string, kind: "text" | "multi", type: string): string[] {
  const base = input(answer, answer, type, kind);
  const out = new Set<string>();
  for (const id of ORDER) for (const c of candidates(id, base)) out.add(c);
  const frac = /(-?\d+)\/(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = frac.exec(answer))) {
    for (const k of [2, 3]) out.add(answer.slice(0, m.index) + (+m[1] * k) + "/" + (+m[2] * k) + answer.slice(m.index + m[0].length));
  }
  if (kind === "multi" || type === "set") {
    const parts = answer.replace(/[{}\s]/g, "").split(/[,;]/).filter((x) => x !== "");
    if (parts.length > 1) parts.forEach((_x, i) => out.add(parts.filter((_y, j) => j !== i).join(",")));
  }
  out.delete(answer);
  return Array.from(out);
}

describe("over the course", () => {
  it("every message detect() returns is its fixed question, and no part of it grades as the key", () => {
    const fired = new Set<DetectorId>();
    const leaks: string[] = [];
    let asked = 0;
    for (const key of KEYS) {
      if (key.kind !== "text" && key.kind !== "multi") continue;
      const cmp = key.kind === "multi" ? "set" : key.type;
      /* a message is graded against a key once, however many slips bring it back */
      const graded = new Map<string, string[]>();
      const leaking = (q: string) => {
        if (!graded.has(q)) graded.set(q, pieces(q).filter((p) => SITE.grade(p, key.answer, cmp, key.tol)));
        return graded.get(q)!;
      };
      for (const alt of alternatives(key.answer)) {
        for (const given of slips(alt, key.kind, key.type)) {
          if (SITE.grade(given, key.answer, cmp, key.tol)) continue;    /* a slip the key accepts is no slip */
          const d = detect(input(given, key.answer, key.type, key.kind, key.tol));
          if (!d) continue;
          asked++;
          fired.add(d.id);
          if (d.question !== QUESTIONS[d.id]) leaks.push(key.where + " " + d.id + " for " + JSON.stringify(given) + ": " + JSON.stringify(d.question));
          for (const p of leaking(d.question)) leaks.push(key.where + " " + d.id + " for " + JSON.stringify(given) + ": " + JSON.stringify(p));
        }
      }
    }
    expect(leaks).toEqual([]);
    /* every detector met real keys, so none of them is outside this check */
    expect(Array.from(fired).sort()).toEqual(ORDER.slice().sort());
    expect(asked).toBeGreaterThan(500);
  }, 60_000);

  it("a slip run forwards on a real key is caught, and the question is one of the questions", () => {
    let caught = 0, tried = 0;
    for (const key of KEYS) {
      if (key.kind !== "text" || key.type !== "number") continue;
      const first = alternatives(key.answer)[key.answer.includes("|") ? 1 : 0];
      const v = Number(first);
      if (!isFinite(v) || v === 0 || !/^-?\d+(\.\d+)?$/.test(first)) continue;
      tried++;
      const d = detect(input(String(-v), key.answer, key.type, "text", key.tol));
      if (SITE.grade(String(-v), key.answer, key.type, key.tol)) continue;    /* a key that takes either sign */
      expect(d, key.where).not.toBeNull();
      expect(Object.values(QUESTIONS)).toContain(d!.question);
      caught++;
    }
    expect(tried).toBeGreaterThan(100);
    expect(caught).toBeGreaterThan(100);
  });
});
