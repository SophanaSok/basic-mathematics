import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { alternatives, basicClean, grade, matches, normExpr, numberList, sameNumber, toNumber } from "./grade.ts";
import { GRADER, judge, judgeOff, specOf } from "./answer/check.ts";
import { grade as legacyGrade } from "./answer/legacy.ts";
import type { AnswerSpec, RuleId, Verdict } from "./answer/types.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);

/* tools/fixtures/grade-golden.json, the frozen baseline: what src/core/answer/legacy.ts (a
   byte copy of this grader as it stood before the typed grader) says about every key on the
   pages (a blank with no data-type as a number, as site.js grades it), the detector
   fixtures, the learner keys (the typed-grader design's example rows, "learner ..."),
   2,000 seeded Arena problems and one key of each type with no type, each against its own
   spellings and near misses (tools/gen-grade-golden.js). It is not written again: a verdict
   the grader changes on purpose is listed in tools/fixtures/grade-ledger.json, which
   tools/gen-grade-ledger.js writes and checks. */
interface Group { from: string; answer: string; type: string | null; tol: number; right: string[]; wrong: string[] }
const GOLDEN = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/grade-golden.json"), "utf8")) as { cases: number; groups: Group[] };

/* the ledger tool, a Node script */
interface Flip { from: string; given: string; answer: string; type: string | null; tol: number; was: boolean; now: boolean; verdict: string; rule: string }
interface Changed { from: string; given: string; kind: string; reason: string; rule: string }
interface Spec { from: string; was: { type: string | null; tol: number }; now: { type: string | null; tol: number } }
interface Reviewed { from: string; given: string; why: string }
interface Ledger { revision: number; rules: { id: string; rule: string }[]; flips: Flip[]; verdicts: Changed[]; specs: Spec[]; reviewed: Reviewed[] }
interface Key { from: string; type: string | null; tol: number }
type Judge = (given: unknown, spec: AnswerSpec) => Verdict;
type JudgeOff = (given: unknown, spec: AnswerSpec, off: ReadonlySet<RuleId>) => Verdict;
interface BuildOptions { golden?: { groups: Group[] }; goldenFile?: string; judge?: Judge; judgeOff?: JudgeOff; reviewed?: Reviewed[]; keys?: Key[]; text?: string | null }
const LEDGER_TOOL = require(path.join(ROOT, "tools/gen-grade-ledger.js")) as {
  build(o?: BuildOptions): { ledger: Ledger; problems: string[] };
  check(o?: BuildOptions): string[];
  gate(given: string, answer: string, type: string | null, tol?: number): boolean;
  readLedger(text?: string | null): Ledger;
  serialise(l: Ledger): string;
  specDrift(golden: { groups: Group[] }, keys: Key[]): Spec[];
  newRules(ledger: Ledger, base: Ledger, allowed: string[]): string[];
  summary(ledger: Ledger): string;
  RULES: Record<string, string>;
  ORDER: string[];
};
const { courseKeys } = require(path.join(ROOT, "tools/gen-grade-golden.js")) as { courseKeys(): Key[] };
const LEDGER = LEDGER_TOOL.readLedger();

/* src/core/answer/legacy.ts as the baseline froze it: the ledger's "before" */
const LEGACY_SHA256 = "0501bf00989f99171ffc93e1d523e3f3fdc948c6731d8c515925cc9c2445a5cc";

/* the ledger's check and the passes over all 65,185 golden cases: 0.7s to 1.2s each here,
   which a slower CI runner can take past vitest's 5s default */
const LONG = 60_000;

const each = (f: (g: Group, given: string, golden: boolean) => void) => {
  for (const g of GOLDEN.groups) for (const [list, want] of [[g.right, true], [g.wrong, false]] as const) for (const given of list) f(g, given, want);
};
const caseOf = (g: Group, given: string) => g.from + ": " + JSON.stringify(given) + " against " + JSON.stringify(g.answer) + " (" + g.type + ")";
const caseId = (from: string, given: string) => from + "\u0000" + given;

describe("grade() against the golden file and the ledger", () => {
  it("says what the golden file says on every case, or what the ledger says it says now", () => {
    const now = new Map(LEDGER.flips.map((f) => [caseId(f.from, f.given), f.now]));
    let cases = 0;
    const drift: string[] = [];
    each((g, given, golden) => {
      cases++;
      const want = now.get(caseId(g.from, given)) ?? golden;
      if (grade(given, g.answer, g.type, g.tol) !== want) drift.push(caseOf(g, given) + " should be " + (want ? "right" : "wrong"));
    });
    expect(drift).toEqual([]);
    expect(cases).toBe(GOLDEN.cases);
    /* every key on the pages, the detector fixtures, the learner keys, 2,000 Arena problems and one key of each type untyped */
    expect(GOLDEN.groups.filter((g) => g.from.startsWith("gen ")).length).toBe(2000);
    expect(GOLDEN.groups.filter((g) => g.from.startsWith("parts/")).length).toBeGreaterThan(380);
    expect(GOLDEN.groups.filter((g) => g.from.startsWith("learner ")).length).toBe(70);
    expect(GOLDEN.groups.filter((g) => g.type === null).length).toBe(5);
    expect(cases).toBeGreaterThan(65000);
  }, LONG);

  it("holds each of a key's \"|\" pieces right against it (the unsplit key is one only for text)", () => {
    for (const g of GOLDEN.groups) {
      for (const alt of alternatives(g.answer).slice(g.answer.includes("|") ? 1 : 0)) expect(g.right, g.from).toContain(alt);
    }
  });

  it("passes the ledger tool's check: legacy.ts says what the golden file says, every change has its rule and passes the value gate, and the file is current", () => {
    expect(LEDGER_TOOL.check()).toEqual([]);
  }, LONG);

  it("is at the grader's revision, reading a missing ledger as the empty one, over the frozen legacy.ts", () => {
    expect(LEDGER.revision).toBe(GRADER);
    expect(LEDGER_TOOL.readLedger(null)).toEqual({ revision: GRADER, rules: [], flips: [], verdicts: [], specs: [], reviewed: [] });
    expect(createHash("sha256").update(fs.readFileSync(path.join(ROOT, "src/core/answer/legacy.ts"))).digest("hex")).toBe(LEGACY_SHA256);
  });

  it("lists only real changes, each by a rule the ledger names, and names no rule without one", () => {
    const fake: string[] = [];
    for (const f of LEDGER.flips) {
      const now = judge(f.given, { answer: f.answer, type: f.type, tol: f.tol }).kind === "right";
      if (legacyGrade(f.given, f.answer, f.type, f.tol) !== f.was || now !== f.now || f.was === f.now) fake.push(f.from + ": " + f.given);
    }
    const groups = new Map(GOLDEN.groups.map((g) => [g.from, g]));
    for (const v of LEDGER.verdicts) {
      const g = groups.get(v.from)!, now = judge(v.given, { answer: g.answer, type: g.type, tol: g.tol });
      if (legacyGrade(v.given, g.answer, g.type, g.tol) || now.kind !== v.kind || !("reason" in now) || now.reason !== v.reason) fake.push(v.from + ": " + v.given);
    }
    expect(fake).toEqual([]);
    /* an unattributed entry (listed in reviewed) names no rule */
    const named = new Set([...LEDGER.flips, ...LEDGER.verdicts].flatMap((e) => e.rule.split("+")).filter((r) => r !== "unattributed"));
    expect(LEDGER.rules.map((r) => r.id).sort()).toEqual([...named].sort());
  });

  it("knows the type and tol of every course exercise with a golden group, or lists it in specs", () => {
    expect(LEDGER_TOOL.specDrift(GOLDEN, courseKeys())).toEqual(LEDGER.specs);
  }, LONG);

  it("grades exactly as judge() calls right, on every case", () => {
    const apart: string[] = [];
    each((g, given) => {
      if (grade(given, g.answer, g.type, g.tol) !== (judge(given, { answer: g.answer, type: g.type, tol: g.tol }).kind === "right")) apart.push(caseOf(g, given));
    });
    expect(apart).toEqual([]);
  }, LONG);
});

describe("judge() over the old grader", () => {
  it("is right with the alternative that matched, wrong, or unread for an empty box, and nothing else", () => {
    const spec = { answer: "2|4", type: "number" };
    expect(judge("4", spec)).toEqual({ kind: "right", alt: 2, read: "4", notes: [] });
    expect(judge(" 2 ", spec)).toEqual({ kind: "right", alt: 1, read: "2", notes: [] });
    expect(judge("5", spec)).toEqual({ kind: "wrong", read: null });
    expect([judge("", spec), judge(" \t", spec)]).toEqual([{ kind: "unread", reason: "empty", at: 0 }, { kind: "unread", reason: "empty", at: 0 }]);
    expect(judge("|x|", { answer: "|x|", type: "expr" })).toMatchObject({ kind: "right", alt: 0 });
    expect(judge("4", { answer: "" })).toEqual({ kind: "wrong", read: null });
    /* no rule to switch yet */
    expect(judgeOff("4.", spec, new Set(LEDGER_TOOL.ORDER))).toEqual(judge("4.", spec));
  });

  it("reads a spec as the pages and the Arena hold it", () => {
    expect(specOf({ answer: "3/2", type: "fraction", tol: "0.01" })).toEqual({ answer: "3/2", type: "fraction", tol: 0.01 });
    expect(specOf({ answer: 7, tol: 1e-7 })).toEqual({ answer: "7", type: null, tol: 1e-7 });
    expect(specOf({ answer: null, type: "", tol: "x" })).toEqual({ answer: "", type: null, tol: 0 });
    expect(specOf({ answer: "7", grid: true })).toEqual({ answer: "7", type: null, tol: 0, grid: true });
  });
});

describe("the ledger tool", () => {
  /* a judge with two made-up rules over the old grader, to drive the tool down every path:
     "N-dot" drops a trailing full stop, and "N-mixed", wrong on purpose, reads "a b/c" as
     a + b + c; any text with "kg" in it is unread (units), and one with " ~ " unread (spaces) */
  const fakeOff: JudgeOff = (given, spec, off) => {
    let t = String(given);
    if (/kg/.test(t)) return { kind: "unread", reason: "units", at: 0 };
    if (/ ~ /.test(t)) return { kind: "unread", reason: "spaces", at: 0 };
    if (!off.has("N-dot")) t = t.replace(/\.$/, "");
    const m = /^(\d+) (\d+)\/(\d+)$/.exec(t);
    if (m && !off.has("N-mixed")) t = String(Number(m[1]) + Number(m[2]) + Number(m[3]));
    return judge(t, spec);
  };
  const fakeJudge: Judge = (given, spec) => fakeOff(given, spec, new Set());
  const golden = (groups: [string, string, string, number, string[]][]): { groups: Group[] } => ({
    groups: groups.map(([from, answer, type, tol, givens]) => {
      const right: string[] = [], wrong: string[] = [];
      for (const g of givens) (legacyGrade(g, answer, type, tol) ? right : wrong).push(g);
      return { from, answer, type, tol, right, wrong };
    })
  });
  const GOLD = golden([
    ["k1", "7", "number", 0, ["7", "7.", "8."]],
    ["k2", "3/2", "number", 0, ["1.5", "3 kg"]],
    ["k3", "1 ~ 2", "exact", 0, ["1 ~ 2"]]
  ]);
  const FAKE = { golden: GOLD, judge: fakeJudge, judgeOff: fakeOff, keys: [] };
  const run = (o: BuildOptions = {}) => LEDGER_TOOL.build({ ...FAKE, reviewed: [], ...o });
  const always = (v: (given: unknown) => Verdict, off: (o: ReadonlySet<RuleId>) => boolean = () => false) => {
    const judgeOff: JudgeOff = (given, spec, o) => (off(o) ? judge(given, spec) : v(given));
    return { judgeOff, judge: ((given, spec) => judgeOff(given, spec, new Set())) as Judge };
  };
  const right = (given: unknown): Verdict => ({ kind: "right", alt: 0, read: String(given), notes: [] });

  it("puts each change down to its rule: a switch for a flip, the reason for a form or unread verdict", () => {
    const { ledger, problems } = run();
    expect(ledger.flips.map((f) => [f.from, f.given, f.was, f.now, f.verdict, f.rule])).toEqual([
      ["k1", "7.", false, true, "right", "N-dot"],
      ["k3", "1 ~ 2", true, false, "unread/spaces", "N-space"]
    ]);
    expect(ledger.verdicts).toEqual([{ from: "k2", given: "3 kg", kind: "unread", reason: "units", rule: "N-refuse" }]);
    expect(ledger.rules.map((r) => r.id)).toEqual(["N-dot", "N-refuse", "N-space"]);
    expect(problems).toEqual([]);
    expect(LEDGER_TOOL.summary(ledger)).toContain("N-dot  false→true  1\n    \"7.\" for \"7\"  (k1)");
  });

  it("refuses a new right answer the value gate does not read as the key's value, unless reviewed lists it", () => {
    const g = golden([["k4", "6", "number", 0, ["1 2/3"]]]);
    const { ledger, problems } = run({ golden: g });
    expect(ledger.flips.map((f) => [f.given, f.rule])).toEqual([["1 2/3", "N-mixed"]]);
    expect(problems).toEqual(["k4: \"1 2/3\" against \"6\" (number): now right (N-mixed), but the value gate does not read it as the key's value; fix it or list it in reviewed"]);
    const reviewed = [{ from: "k4", given: "1 2/3", why: "read by hand" }];
    expect(run({ golden: g, reviewed })).toMatchObject({ problems: [], ledger: { reviewed } });
    expect(run({ reviewed: [{ from: "k1", given: "9", why: "gone" }] }).problems).toEqual(["reviewed: k1: \"9\" matches no new right answer and no change without a rule"]);
    /* a change the gate need not read and a rule gives back leaves its entry stale: k3's
       flip to unread by N-space, and k2's verdict by its reason */
    expect(run({ reviewed: [{ from: "k3", given: "1 ~ 2", why: "by hand" }, { from: "k2", given: "3 kg", why: "by hand" }] }).problems).toEqual([
      "reviewed: k3: \"1 ~ 2\" matches no new right answer and no change without a rule",
      "reviewed: k2: \"3 kg\" matches no new right answer and no change without a rule"
    ]);
  });

  it("names the first pair of rules when no single switch gives the old verdict back, and refuses a change none does", () => {
    const g = golden([["k5", "2", "number", 0, ["2."]]]);
    expect(run({ golden: g, ...always(right, (o) => o.has("N-unicode") && o.has("L-sep")) }).ledger.flips[0].rule).toBe("N-unicode+L-sep");
    expect(run({ golden: g, ...always(right) }).problems).toEqual(["k5: \"2.\" against \"2\" (number): no rule or pair of rules gives back the old verdict; fix it or list it in reviewed"]);
    expect(run({ golden: g, ...always(right), reviewed: [{ from: "k5", given: "2.", why: "by hand" }] }))
      .toMatchObject({ problems: [], ledger: { flips: [{ rule: "unattributed" }], rules: [] } });
    /* a flip from right to wrong that no rule gives back is cleared by reviewed too */
    const k7 = golden([["k7", "2", "number", 0, ["2"]]]), wrong = (): Verdict => ({ kind: "wrong", read: null });
    expect(run({ golden: k7, ...always(wrong) }).problems).toEqual(["k7: \"2\" against \"2\" (number): no rule or pair of rules gives back the old verdict; fix it or list it in reviewed"]);
    expect(run({ golden: k7, ...always(wrong), reviewed: [{ from: "k7", given: "2", why: "by hand" }] })).toMatchObject({ problems: [], ledger: { rules: [] } });
  });

  it("fails when legacy.ts does not say what the golden file says", () => {
    const g = { groups: [{ from: "k6", answer: "7", type: "number", tol: 0, right: ["8"], wrong: [] }] };
    expect(run({ golden: g }).problems).toEqual(["k6: legacy.ts says \"8\" is wrong, the golden file right"]);
  });

  it("compares the file with a fresh run, carries `reviewed` through, and takes a missing file as the empty ledger", () => {
    const { ledger } = run();
    const OUT = "tools/fixtures/grade-ledger.json";
    expect(LEDGER_TOOL.check({ ...FAKE, text: LEDGER_TOOL.serialise(ledger) })).toEqual([]);
    expect(LEDGER_TOOL.check({ ...FAKE, text: null })).toEqual([OUT + " is missing, and the grader changes verdicts; write it with node tools/gen-grade-ledger.js and read the diff"]);
    const differs = [OUT + " differs from a fresh run; write it with node tools/gen-grade-ledger.js and read the diff"];
    expect(LEDGER_TOOL.check({ ...FAKE, text: LEDGER_TOOL.serialise({ ...ledger, flips: ledger.flips.slice(1) }) })).toEqual(differs);
    expect(LEDGER_TOOL.check({ ...FAKE, text: LEDGER_TOOL.serialise({ ...ledger, revision: GRADER + 1 }) })).toEqual(differs);
    /* reviewed is read off the file, so the hand-written block is never rewritten */
    expect(LEDGER_TOOL.check({ ...FAKE, text: LEDGER_TOOL.serialise({ ...ledger, reviewed: [{ from: "k1", given: "7.", why: "by hand" }] }) })).toEqual([]);
    expect(LEDGER_TOOL.check({ golden: GOLD, keys: [], text: null })).toEqual([]);
  });

  it("reports a missing golden file as a problem, not a crash", () => {
    expect(LEDGER_TOOL.check({ goldenFile: "tools/fixtures/no-such-golden.json", text: null }))
      .toEqual(["tools/fixtures/no-such-golden.json is missing: the frozen baseline the ledger is measured from (git checkout it; it is not written again)"]);
  });

  it("lists a course exercise whose type or tol moved from its golden group's", () => {
    expect(LEDGER_TOOL.specDrift(GOLD, [{ from: "k1", type: "number", tol: 0 }, { from: "k2", type: "fraction", tol: 0 }, { from: "new", type: "set", tol: 0 }]))
      .toEqual([{ from: "k2", was: { type: "number", tol: 0 }, now: { type: "fraction", tol: 0 } }]);
  });

  it("with --rules, fails on an entry new against the base whose rule is not listed", () => {
    const { ledger } = run();
    const empty = LEDGER_TOOL.readLedger(null);
    expect(LEDGER_TOOL.newRules(ledger, empty, ["N-dot", "N-space", "N-refuse"])).toEqual([]);
    expect(LEDGER_TOOL.newRules(ledger, empty, ["N-dot"])).toHaveLength(2);
    expect(LEDGER_TOOL.newRules(ledger, ledger, [])).toEqual([]);
  });

  it("orders every rule of the design, A-abs and N-exact first and the E- rules last, with a sentence for each", () => {
    expect(LEDGER_TOOL.ORDER.slice(0, 2)).toEqual(["A-abs", "N-exact"]);
    expect(LEDGER_TOOL.ORDER.slice(-8)).toEqual(["E-mixed", "E-star", "E-pow", "E-dot", "E-abs", "E-plusneg", "E-paren", "E-terms"]);
    expect(LEDGER_TOOL.ORDER).not.toContain("T-zero");
    expect(LEDGER_TOOL.ORDER).not.toContain("T-final");
    for (const id of LEDGER_TOOL.ORDER) expect(LEDGER_TOOL.RULES[id], id).toMatch(/^\S.*\.$/);
    /* the sentences go into the ledger file, in US English; "unattributed" is no rule */
    expect(Object.keys(LEDGER_TOOL.RULES)).toEqual(LEDGER_TOOL.ORDER);
    expect(Object.values(LEDGER_TOOL.RULES).filter((r) => /full stop|bracket/i.test(r))).toEqual([]);
  });
});

describe("the value gate", () => {
  const gate = LEDGER_TOOL.gate;

  it("reads numbers, fractions and mixed numbers exactly, within a tol or the band", () => {
    expect([gate("7.", "7", "number"), gate("1 3/4", "7/4", "number"), gate("-1 1/2", "-3/2", "fraction"), gate("‐4", "-4", "number"), gate(".5", "1/2", "number"), gate("4", "2|4", "number")])
      .toEqual([true, true, true, true, true, true]);
    /* a reader that took -1 1/2 as -1 + 1/2 would accept it for -1/2: the gate does not */
    expect([gate("-1 1/2", "-1/2", "number"), gate("1 1/2", "11/2", "number"), gate("1.49", "3/2", "number")]).toEqual([false, false, false]);
    expect([gate("1.000000001", "1", "number"), gate("1.00000001", "1", "number"), gate("0.6666666667", "2/3", "number")]).toEqual([true, false, true]);
    expect([gate("1.0000001", "1", "number", 1e-7), gate("1.0000002", "1", "number", 1e-7), gate("2.812", "2.807", "number", 0.005), gate("2.8120000000005", "2.807", "number", 0.005)])
      .toEqual([true, false, true, false]);
    /* an infinite tol takes any value, and never throws */
    expect([gate("100", "1", "number", Infinity), gate("9,-4", "1,2", "set", Infinity), gate("x", "1", "number", Infinity)]).toEqual([true, true, false]);
  });

  it("leaves to a reader by hand what it does not read: commas, $, brackets, ½, full-width digits, ÷, and a space between digits", () => {
    for (const given of ["5,050", "$5,050", "(7)", "１", "1½", "3÷2", "5 050", "1 1 / 2"]) expect(gate(given, "5050|7|1|3/2|11/2", "number"), given).toBe(false);
    for (const given of ["2 and -7", "3 or -3", "±7"]) expect(gate(given, "2,-7|3,-3|7,-7", "set"), given).toBe(false);
  });

  it("pairs a set's members sorted, and reads a point by its exact values in order", () => {
    expect([gate("-7, 2.", "2,-7", "set"), gate("{2;-7}", "2,-7", "set"), gate("2,2,-7", "2,-7", "set"), gate("1.01, 1.00", "1.00,1.02", "set", 0.01), gate("1.000000001,2", "1,2", "set")])
      .toEqual([true, true, false, true, true]);
    expect([gate("-0,5", "(0,5)|0,5", "exact"), gate("(12/2,-2)", "(6,-2)|6,-2", "exact"), gate("(-2,6)", "(6,-2)|6,-2", "exact"), gate("(6.0000000001,-2)", "(6,-2)|6,-2", "exact"), gate("(1000000000,1)", "(1000000001,1)", "exact")])
      .toEqual([true, true, false, false, false]);
    /* T-zero: a coordinate led by 0 and a digit makes no point (design section 3.3) */
    expect([gate("(05,1)", "(5,1)", "exact"), gate("(1,-05)", "(1,-5)|1,-5", "exact"), gate("(- 05,1)", "(-5,1)", "exact"), gate("05,1", "5,1", "exact"), gate("(0.5,-0)", "(1/2,0)", "exact")])
      .toEqual([false, false, false, false, true]);
  });

  it("takes an expression as text, or by its value at three seeded points", () => {
    /* A-abs: |x| is one alternative, never its bars' inside x */
    expect([gate("x.", "|x|", "expr"), gate("x", "|x|+1", "expr"), gate("abs(x)", "|x|", "expr"), gate("|x|", "|x|", "expr")]).toEqual([false, false, true, true]);
    expect([gate("|x|.", "|x|", "expr"), gate("abs(x)", "|x|", "expr"), gate("x**2", "x^2", "expr"), gate("((1/2)·sqrt(2))", "sqrt(2)/2|(1/2)sqrt(2)", "expr"), gate("-28x+x^2+196", "x^2-28x+196", "expr"), gate("(2k+1)^(-1)", "(2k+1)^-1", "expr"), gate("x²", "x^2", "expr")])
      .toEqual([true, true, true, true, true, true, true]);
    /* the design's must-stay-wrong rows that differ in value, and a mixed number in an expression */
    expect([gate("x+(-2)3", "x-23", "expr"), gate("5+(-1).5", "5-1.5", "expr"), gate("x^(2)3", "x^23", "expr"), gate("x+(-2)^2", "x-2^2", "expr"), gate("1 1/6pi", "(11/6)pi", "expr")])
      .toEqual([false, false, false, false, false]);
    /* one "=", up to the sign of the difference of its sides */
    expect([gate("2x+3=y", "y=2x+3", "expr"), gate("5+y=3x", "y=3x+5", "expr"), gate("y=2x+3", "2x+3", "expr")]).toEqual([true, false, false]);
    expect([gate("3.142°", "3.1416", "number", 0.001), gate("2pi", "6.2832", "number", 0.001), gate("4", "iv", "exact")]).toEqual([false, false, false]);
  });
});

describe("the pieces", () => {
  it("cleans what readers add without changing meaning", () => {
    expect(basicClean("  −3 × 4 ")).toBe("-3*4");
    expect(basicClean("√2 π ≤ ≥ ≠ X")).toBe("sqrt2pi<=>=!=x");
  });

  it("reads numbers, fractions and signed decimals, and nothing else", () => {
    expect([toNumber("3"), toNumber("+3"), toNumber("−1/4"), toNumber(".5"), toNumber("$12"), toNumber("2.50")]).toEqual([3, 3, -0.25, 0.5, 12, 2.5]);
    expect([toNumber(""), toNumber("1/0"), toNumber("x"), toNumber("1e3")]).toEqual([null, null, null, null]);
  });

  it("compares numbers relatively, or within an absolute tolerance", () => {
    expect(sameNumber(1, 1 + 1e-12)).toBe(true);
    expect(sameNumber(1e6, 1e6 + 1e-4)).toBe(true);
    expect(sameNumber(3.14, 3.1416, 0.01)).toBe(true);
    expect(sameNumber(3.14, 3.2, 0.01)).toBe(false);
    expect(sameNumber(null, 1)).toBe(false);
  });

  it("reads a list in any order, and an expression without its cosmetics", () => {
    expect(numberList("2, -3")).toEqual([-3, 2]);
    expect(numberList("{1;x}")).toBeNull();
    expect(normExpr("\\frac{1}{2}x")).toBe("(1)/(2)x");
    expect(normExpr("bd+ac")).toBe(normExpr("ac + bd"));
    expect(normExpr("(x+1)")).toBe("1+x");
  });

  it("matches by type, and as forgiving text by default", () => {
    expect(matches("0.5", "1/2", "number")).toBe(true);
    expect(matches("3,-2", "-2,3", "set")).toBe(true);
    expect(matches("3,-2,1", "-2,3", "set")).toBe(false);
    expect(matches("3x-6", "3x - 6", "expr")).toBe(true);
    expect(matches("Yes.", "yes", "exact")).toBe(true);
    expect(matches("Yes.", "yes", null)).toBe(true);
  });

  it("splits a key on | and keeps the whole key, for an answer such as |x|", () => {
    expect(alternatives(" a | b ")).toEqual(["a | b", "a", "b"]);
    expect(alternatives("|x|")).toEqual(["|x|", "x"]);
    expect(alternatives(null)).toEqual([]);
    expect(grade("|x|", "|x|")).toBe(true);
    expect(grade("4", "2|4", "number")).toBe(true);
    expect(grade("4", "")).toBe(false);
  });
});
