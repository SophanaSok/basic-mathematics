import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { numberList, toNumber } from "./legacy.ts";
import { formMessage, lowestMessage, readMessage, unreadMessage } from "./messages.ts";
import { abs, add, cmp, div, eq, fromDecimal, make, mul, neg, roundTo, sub, truncTo } from "./rational.ts";
import { MATH_WORDS, READ_RULES, cleanNumber, readList, readNumber, readTuple } from "./read.ts";
import type { ListReading, NumberReading, ReadOptions, Refusal, TupleReading } from "./read.ts";
import type { FormReason, UnreadReason } from "./types.ts";

/* The reader of the typed grader (decision 0002): the rows of the design's tables in
   sections 3.1 to 3.3 and its decided defaults that are readings or refusals, the `read`
   format, both positions of every rule's switch, and the messages. What a reading is then
   judged against a key (right, form, wrong) is check.ts's, and tested there. */

const ROOT = path.resolve(import.meta.dirname, "../../..");
/* Q4 is the owner's: these tests name the recommended answer (a) where they read a mixed
   number, and (b) where they test it */
const A: ReadOptions = { q4: "a" };
const B: ReadOptions = { q4: "b" };
const offA = (...ids: string[]): ReadOptions => ({ q4: "a", off: new Set(ids) });

const q = (r: { value: { n: bigint; d: bigint } }) => r.value.n + "/" + r.value.d;
/* "n/d" for a reading, "unread/<reason>" for a refusal */
const num = (text: string, o: ReadOptions = A) => { const r = readNumber(text, o); return r.ok ? q(r) : "unread/" + r.reason; };
const list = (text: string, o: ReadOptions = A) => { const r = readList(text, o); return r.ok ? r.members.map(q).join(", ") : "unread/" + r.reason; };
const tuple = (text: string, o: ReadOptions = A) => { const r = readTuple(text, o); return r ? r.values.map(q).join(", ") + (r.notation ? " notation" : "") : "no point"; };
const ok = (r: NumberReading | Refusal): NumberReading => { if (!r.ok) throw new Error("no reading: " + r.reason); return r; };
const okList = (r: ListReading | Refusal): ListReading => { if (!r.ok) throw new Error("no reading: " + r.reason); return r; };
const okTuple = (r: TupleReading | null): TupleReading => { if (!r) throw new Error("not a point"); return r; };
const each = (texts: string[], f: (t: string) => string) => Object.fromEntries(texts.map((t) => [t, f(t)]));
const all = (texts: string[], want: string) => Object.fromEntries(texts.map((t) => [t, want]));

describe("exact rationals", () => {
  it("keeps every value in lowest terms with a positive denominator", () => {
    expect(make(6n, -4n)).toEqual({ n: -3n, d: 2n });
    expect(make(0n, -5n)).toEqual({ n: 0n, d: 1n });
    expect(() => make(1n, 0n)).toThrow(RangeError);
    expect(add(make(1n, 6n), make(1n, 3n))).toEqual(make(1n, 2n));
    expect(sub(make(1n, 2n), make(3n, 4n))).toEqual(make(-1n, 4n));
    expect(mul(make(2n, 3n), make(9n, 4n))).toEqual(make(3n, 2n));
    expect(div(make(1n, 2n), make(-1n, 4n))).toEqual(make(-2n));
    expect([neg(make(2n)), abs(make(-2n, 3n))]).toEqual([make(-2n), make(2n, 3n)]);
    expect([cmp(make(1n, 3n), make(333n, 1000n)), cmp(make(-1n), make(-2n)), cmp(make(2n, 4n), make(1n, 2n))]).toEqual([1, 1, 0]);
    expect(eq(make(2n, 4n), make(1n, 2n))).toBe(true);
  });

  it("reads a tol exactly, exponent notation included, as String(tol) gives it", () => {
    expect(fromDecimal(String(0.005))).toEqual(make(1n, 200n));
    expect(fromDecimal(String(1e-7))).toEqual(make(1n, 10n ** 7n));
    expect(fromDecimal(String(1.5e-10))).toEqual(make(15n, 10n ** 11n));
    expect(fromDecimal(String(5e-324))).toEqual(make(5n, 10n ** 324n));
    expect(fromDecimal(String(1e21))).toEqual(make(10n ** 21n));
    expect(fromDecimal(String(Number.MAX_VALUE))).toEqual(make(17976931348623157n * 10n ** 292n));
    expect([fromDecimal("-.5"), fromDecimal("7."), fromDecimal("+12")]).toEqual([make(-1n, 2n), make(7n), make(12n)]);
    expect([fromDecimal("Infinity"), fromDecimal("NaN"), fromDecimal("."), fromDecimal(""), fromDecimal("1/2")]).toEqual([null, null, null, null, null]);
  });

  it("rounds half away from zero, and cuts toward zero, at a number of places", () => {
    const twoThirds = make(2n, 3n);
    expect([roundTo(twoThirds, 3), truncTo(twoThirds, 3), roundTo(twoThirds, 0)]).toEqual([make(667n, 1000n), make(666n, 1000n), make(1n)]);
    expect([roundTo(make(-5n, 2n), 0), truncTo(make(-5n, 2n), 0), roundTo(make(1n, 8n), 2)]).toEqual([make(-3n), make(-2n), make(13n, 100n)]);
  });
});

describe("cleaning", () => {
  it("spells out ½-style fractions, dashes, full-width digits and ÷, and collapses whitespace", () => {
    expect(cleanNumber("  1½ ")).toBe("1 1/2");
    expect(cleanNumber("½2")).toBe("1/2 2");
    expect(cleanNumber("‐4 ‒ ﹣ － −4 –4 —4")).toBe("-4 - - - -4 -4 -4");
    expect(cleanNumber("１２÷３")).toBe("12/3");
    expect(cleanNumber("X\t=\n 3")).toBe("x = 3");
  });

  it("lists the maths words that make a number an expression, not units", () => {
    expect(MATH_WORDS).toEqual(["pi", "sqrt", "root", "abs", "sin", "cos", "tan", "log", "ln", "exp"]);
  });

  it("freezes the lists it exports, so an importer cannot change how an answer reads", () => {
    expect([Object.isFrozen(MATH_WORDS), Object.isFrozen(READ_RULES)]).toEqual([true, true]);
  });
});

describe("one number (section 3.1)", () => {
  it("reads every spelling of 3/2 in the key 3/2 table, and refuses the rest with its reason", () => {
    expect(each(["3/2", "1.5", "1.50", "(3)/(2)", "3÷2", "3/2.", "1.5.", "1 1/2", "1½", "1 ½", "6/4", "1 100/200"], (t) => num(t))).toEqual(all(
      ["3/2", "1.5", "1.50", "(3)/(2)", "3÷2", "3/2.", "1.5.", "1 1/2", "1½", "1 ½", "6/4", "1 100/200"], "3/2"));
    expect([num("31/2"), num("1.49")]).toEqual(["31/2", "149/100"]);
    expect(each(["x = 3/2", "3/2 = x", "1+1/2", "sqrt(9)/2", "1-1/2", "1 and 1/2", "1,5", "1 1 / 2", "1 . 5", "½2", "1½0", "1 1/2 cups"], (t) => num(t))).toEqual({
      "x = 3/2": "unread/named", "3/2 = x": "unread/named", "1+1/2": "unread/expression", "sqrt(9)/2": "unread/expression",
      "1-1/2": "unread/ambiguous-mixed", "1 and 1/2": "unread/ambiguous-mixed", "1,5": "unread/decimal-comma",
      "1 1 / 2": "unread/spaces", "1 . 5": "unread/spaces", "½2": "unread/spaces", "1½0": "unread/spaces", "1 1/2 cups": "unread/units"
    });
  });

  it("reads a mixed number by its value under Q4(a), and a sign in front of it as the whole number's", () => {
    expect(each(["1 1/2", "1 11/21", "3 2/21", "1 3/4", "-1 1/2", "2 and 1/3"], (t) => num(t))).toEqual({
      "1 1/2": "3/2", "1 11/21": "32/21", "3 2/21": "65/21", "1 3/4": "7/4", "-1 1/2": "-3/2", "2 and 1/3": "unread/ambiguous-mixed"
    });
    /* not mixed numbers: the fraction is not proper, or a part has commas */
    expect([num("1 3/2"), num("1 0/2"), num("1,000 1/2")]).toEqual(["unread/spaces", "unread/spaces", "unread/spaces"]);
  });

  it("reads decimals exactly, and the other keys' readings and refusals", () => {
    expect(each(["0.6666666667", "0.667", ".6667", "0.66", "1.000000001", "0.999999999", "2.8120000000005"], (t) => num(t))).toEqual({
      "0.6666666667": "6666666667/10000000000", "0.667": "667/1000", ".6667": "6667/10000", "0.66": "33/50",
      "1.000000001": "1000000001/1000000000", "0.999999999": "999999999/1000000000", "2.8120000000005": "5624000000001/2000000000000"
    });
    expect(each(["5,050", "$5,050", "5 050", "50 50", "0,500", "4,-4", "4, -4", "4 or -4", "±4", "-4,4", "12,-12", "1,2,3", "4 and 4"], (t) => num(t))).toEqual({
      "5,050": "5050/1", "$5,050": "5050/1", "5 050": "unread/spaces", "50 50": "unread/spaces", "0,500": "unread/decimal-comma",
      "4,-4": "unread/list", "4, -4": "unread/list", "4 or -4": "unread/list", "±4": "unread/plus-minus", "-4,4": "unread/decimal-comma",
      "12,-12": "unread/list", "1,2,3": "unread/list", "4 and 4": "unread/list"
    });
    expect(each(["7.", "(7)", "+7", "07", "7.00", "７", "7 = x", "x=7", "y = 2", "x = 2", "8/2", "1/1"], (t) => num(t))).toEqual({
      "7.": "7/1", "(7)": "7/1", "+7": "7/1", "07": "7/1", "7.00": "7/1", "７": "7/1",
      "7 = x": "unread/named", "x=7": "unread/named", "y = 2": "unread/named", "x = 2": "unread/named", "8/2": "4/1", "1/1": "1/1"
    });
    expect(each(["1/-1", "(-1)", "-(1)", "-(-4)", "-4/-3", "(-4)/(-3)", "−4", "‐4", "- 4", "-$4", "$-4", "-$-4"], (t) => num(t))).toEqual({
      "1/-1": "-1/1", "(-1)": "-1/1", "-(1)": "-1/1", "-(-4)": "unread/expression", "-4/-3": "4/3", "(-4)/(-3)": "4/3",
      "−4": "-4/1", "‐4": "-4/1", "- 4": "-4/1", "-$4": "-4/1", "$-4": "-4/1", "-$-4": "unread/expression"
    });
  });

  it("refuses units, symbols, words and expressions from the text alone", () => {
    expect(each(["140°", "140 º", "140 ˚", "140 degrees", "140deg", "140 deg", "3.142°", "4 adults", "12.50 usd", "12.50usd", "1 1/2 cups"], (t) => num(t)))
      .toEqual(all(["140°", "140 º", "140 ˚", "140 degrees", "140deg", "140 deg", "3.142°", "4 adults", "12.50 usd", "12.50usd", "1 1/2 cups"], "unread/units"));
    expect(each(["2pi", "2 pi", "2π", "25pi", "3 i", "4xy", "11 m", "usd 12.50", "sqrt(16)", "√16", "4x", "x^2", "2^2", "4-(-3)", "2/0", "1+1/2"], (t) => num(t)))
      .toEqual(all(["2pi", "2 pi", "2π", "25pi", "3 i", "4xy", "11 m", "usd 12.50", "sqrt(16)", "√16", "4x", "x^2", "2^2", "4-(-3)", "2/0", "1+1/2"], "unread/expression"));
    expect(each(["1$2.50", "12.50$", "£12.50", "1;2", "#4", "3×4", "$ $4"], (t) => num(t)))
      .toEqual(all(["1$2.50", "12.50$", "£12.50", "1;2", "#4", "3×4", "$ $4"], "unread/symbol"));
    expect(each(["four", "pi", "", "   ", "4e0", "2.5E3", "3x10^4", "3 × 10^4", "3:4", "50%", "+-4", "+/-4"], (t) => num(t))).toEqual({
      "four": "unread/words", "pi": "unread/words", "": "unread/empty", "   ": "unread/empty", "4e0": "unread/scientific",
      "2.5E3": "unread/scientific", "3x10^4": "unread/scientific", "3 × 10^4": "unread/scientific", "3:4": "unread/ratio",
      "50%": "unread/percent", "+-4": "unread/plus-minus", "+/-4": "unread/plus-minus"
    });
  });

  it("refuses a text over 200 characters or with a digit run over 40", () => {
    expect(num("1".repeat(40))).toBe("1".repeat(40) + "/1");
    expect([num("1".repeat(41)), num("0." + "1".repeat(41)), num("1/" + "2".repeat(41))]).toEqual(["unread/too-long", "unread/too-long", "unread/too-long"]);
    expect([num("(".repeat(100) + "7" + ")".repeat(99)), num("(".repeat(101) + "7" + ")".repeat(101))]).toEqual(["unread/expression", "unread/too-long"]);
    expect(num("(".repeat(99) + "7" + ")".repeat(99))).toBe("7/1");
  });

  it("writes `read` from the typed text by its shape, and says when the line is worth showing", () => {
    const read = (t: string) => { const r = ok(readNumber(t, A)); return [r.read, r.show]; };
    expect(each(["0.667", "1.49", "7.", "$7", "+7", "007.50", "00.5", ".5", "0", "-0", "5,050"], (t) => read(t)[0] as string)).toEqual({
      "0.667": "0.667", "1.49": "1.49", "7.": "7", "$7": "7", "+7": "7", "007.50": "7.50", "00.5": "0.5", ".5": ".5", "0": "0", "-0": "-0", "5,050": "5,050"
    });
    expect(each(["6/4", "(-4)/(-3)", "-4/-3", "1/-1", "(3)/(2)", "3 / 2", "3÷2", "-(6/4)", "07/02", "1.5/3"], (t) => read(t)[0] as string)).toEqual({
      "6/4": "6/4", "(-4)/(-3)": "4/3", "-4/-3": "4/3", "1/-1": "-1/1", "(3)/(2)": "3/2", "3 / 2": "3/2", "3÷2": "3/2",
      "-(6/4)": "-6/4", "07/02": "7/2", "1.5/3": "1.5/3"
    });
    expect([read("1 1/2"), read("1½"), read("1 100/200"), read("-1 1/2"), read("½"), read("3/2"), read("1.5")]).toEqual([
      ["3/2", true], ["3/2", true], ["300/200", true], ["-3/2", true], ["1/2", true], ["3/2", false], ["1.5", false]]);
  });

  it("notes a mixed number, thousands commas and an unreduced fraction, and nothing else", () => {
    const notes = (t: string) => ok(readNumber(t, A)).notes;
    expect([notes("1 1/2"), notes("1 100/200"), notes("5,050"), notes("6/4"), notes("8/2"), notes("(-4)/(-2)"), notes("1,000/2")]).toEqual([
      ["mixed"], ["mixed", "unreduced"], ["thousands"], ["unreduced"], ["unreduced"], ["unreduced"], ["thousands", "unreduced"]]);
    expect([notes("3/2"), notes("1/-1"), notes("1/1"), notes("1.5/3"), notes("$7"), notes("7.")]).toEqual([[], [], [], [], [], []]);
  });

  it("gives each reading its shape, a decimal its places, and a float from its own parts (N-exact's off position)", () => {
    const r = (t: string) => { const x = ok(readNumber(t, A)); return [x.shape, x.places, x.float]; };
    expect([r("7"), r("7.50"), r("$0.667"), r("(0.67)"), r("6/4"), r("1 1/2"), r("(-4)/(-3)"), r("-1 1/2"), r("5,050.5"), r("1/0.125")]).toEqual([
      ["integer", 0, 7], ["decimal", 2, 7.5], ["decimal", 3, 0.667], ["decimal", 2, 0.67], ["fraction", 0, 1.5], ["mixed", 0, 1.5],
      ["fraction", 0, 4 / 3], ["mixed", 0, -1.5], ["decimal", 1, 5050.5], ["fraction", 0, 8]]);
    /* parseFloat of the text, not the rational made a float: the two differ here */
    expect(ok(readNumber("0.010000001000000001", A)).float).toBe(parseFloat("0.010000001000000001"));
  });

  it("refuses a mixed number everywhere under Q4(b), and tells \"2 and 1/3\" apart the same way", () => {
    expect(each(["1 1/2", "1½", "1 ½", "-1 1/2", "(1 1/2)", "2 and 1/3", "1 3/2", "3/2", "1.5"], (t) => num(t, B))).toEqual({
      "1 1/2": "unread/mixed", "1½": "unread/mixed", "1 ½": "unread/mixed", "-1 1/2": "unread/mixed", "(1 1/2)": "unread/mixed",
      "2 and 1/3": "unread/ambiguous-mixed", "1 3/2": "unread/spaces", "3/2": "3/2", "1.5": "3/2"
    });
    expect([list("2 1/3", B), tuple("(1 1/2, 3)", B), tuple("(3/2, 3)", B)]).toEqual(["unread/mixed-in-set", "no point", "3/2, 3/1"]);
  });
});

describe("a set (section 3.2)", () => {
  it("splits on , ; or and, ignores empty members, and reads ±", () => {
    expect(each(["-7, 2", "{2;-7}", "2 and -7", "2,-7.", "2,-7,", "2,,-7", ",2,-7", "3 or -3", "±7", "+-7", "+/-7", "2 and -1/3", "1/2 and 1/3", "1.000000001,2", "1.01, 1.00"], (t) => list(t))).toEqual({
      "-7, 2": "-7/1, 2/1", "{2;-7}": "2/1, -7/1", "2 and -7": "2/1, -7/1", "2,-7.": "2/1, -7/1", "2,-7,": "2/1, -7/1", "2,,-7": "2/1, -7/1",
      ",2,-7": "2/1, -7/1", "3 or -3": "3/1, -3/1", "±7": "7/1, -7/1", "+-7": "7/1, -7/1", "+/-7": "7/1, -7/1",
      "2 and -1/3": "2/1, -1/3", "1/2 and 1/3": "1/2, 1/3", "1.000000001,2": "1000000001/1000000000, 2/1", "1.01, 1.00": "101/100, 1/1"
    });
    /* repeats are kept: form/repeated is check.ts's */
    expect(list("2,2,-7")).toBe("2/1, 2/1, -7/1");
  });

  it("refuses names, spaces, brackets, a zero-led member and a possible mixed number", () => {
    expect(each(["z = 3, z = -3", "x=2, x=-7", "x = 2 or x = -7", "2 -7", "(2,-7)", "[2;-7]", "(2 or -7)", "1,000", "1,-05", "2 1/3", "2 and 1/3", "1½", "1/(-12,-2)", "", ",;", "{}"], (t) => list(t))).toEqual({
      "z = 3, z = -3": "unread/named", "x=2, x=-7": "unread/named", "x = 2 or x = -7": "unread/named", "2 -7": "unread/spaces",
      "(2,-7)": "unread/brackets", "[2;-7]": "unread/brackets", "(2 or -7)": "unread/brackets", "1,000": "unread/list-comma",
      "1,-05": "unread/list-comma", "2 1/3": "unread/mixed-in-set", "2 and 1/3": "unread/mixed-in-set", "1½": "unread/mixed-in-set",
      "1/(-12,-2)": "unread/expression", "": "unread/empty", ",;": "unread/empty", "{}": "unread/empty"
    });
    expect([list("1,".repeat(100) + "1"), list("1," + "2".repeat(41))]).toEqual(["unread/too-long", "unread/too-long"]);
  });

  it("refuses a mixed number and a zero-led member behind a $, brackets, a trailing full stop or ±", () => {
    const texts = ["$2 1/3", "(2 1/3)", "-(2 1/3)", "- $2 1/3", "{$2 1/3}", "2 1/3., 5", "2½., 5", "±2 1/3", "+/-1 1/2", "±2½",
      "1,$000", "1,(000)", "1,-(05)", "±05", "+-000", "$0.5, (0)", "±0.5"];
    const want = {
      "$2 1/3": "unread/mixed-in-set", "(2 1/3)": "unread/mixed-in-set", "-(2 1/3)": "unread/mixed-in-set", "- $2 1/3": "unread/mixed-in-set",
      "{$2 1/3}": "unread/mixed-in-set", "2 1/3., 5": "unread/mixed-in-set", "2½., 5": "unread/mixed-in-set", "±2 1/3": "unread/mixed-in-set",
      "+/-1 1/2": "unread/mixed-in-set", "±2½": "unread/mixed-in-set", "1,$000": "unread/list-comma", "1,(000)": "unread/list-comma",
      "1,-(05)": "unread/list-comma", "±05": "unread/list-comma", "+-000": "unread/list-comma", "$0.5, (0)": "1/2, 0/1", "±0.5": "1/2, -1/2"
    };
    expect(each(texts, (t) => list(t))).toEqual(want);
    /* the same under Q4(b): the reason does not depend on how the mixed number is written */
    expect(each(texts, (t) => list(t, B))).toEqual(want);
    const at = (t: string) => { const r = readList(t, A); return r.ok ? null : r.at; };
    expect([at("5, (2 1/3)"), at("5; $2 1/3."), at("1, ±05")]).toEqual([1, 1, 1]);
    /* off: read as the old grader read them */
    expect([list("$2 1/3", offA("L-mixed")), list("(2 1/3)", offA("L-mixed")), list("±2 1/3", offA("L-mixed")), list("1,$000", offA("L-zero")), list("±05", offA("L-zero"))])
      .toEqual(["7/3", "7/3", "7/3, -7/3", "1/1, 0/1", "5/1, -5/1"]);
  });

  it("says which member a refusal is about", () => {
    const at = (t: string) => { const r = readList(t, A); return r.ok ? null : r.at; };
    expect([at("x=2, 3"), at("2, x=3"), at("1,,2, 000"), at("1; 2 1/3"), at("1, 2 and 1/3"), at("(1,2)"), at("")]).toEqual([0, 1, 2, 1, 1, 0, 0]);
    expect((readNumber("4, -4", A) as Refusal).at).toBe(0);
  });

  it("reads two trailing full stops in a set or point box, where the box and then the member each peel one, but not in a number box", () => {
    expect(each(["7..", "7. .", "3/2.."], (t) => num(t))).toEqual(all(["7..", "7. .", "3/2.."], "unread/expression"));
    expect(each(["7..", "2,-7..", "2,-7. .", "{2;-7}.."], (t) => list(t))).toEqual({
      "7..": "7/1", "2,-7..": "2/1, -7/1", "2,-7. .": "2/1, -7/1", "{2;-7}..": "unread/expression"
    });
    /* a point's brackets are stripped after one full stop only */
    expect([tuple("6,-2.."), tuple("x=6, y=-2.."), tuple("(6,-2).."), tuple("(6,-2).")]).toEqual(["6/1, -2/1", "6/1, -2/1 notation", "no point", "6/1, -2/1"]);
  });

  it("writes `read` as the members in typed order", () => {
    expect([okList(readList("±7", A)).read, okList(readList("{+2; -7.}", A)).read, okList(readList("1/-2 or ½", A)).read]).toEqual(["7, -7", "2, -7", "-1/2, 1/2"]);
    expect([okList(readList("2, 1/2", A)).show, okList(readList("2, ½", A)).show]).toEqual([false, true]);
  });
});

describe("a point (section 3.3)", () => {
  it("reads coordinates by value in position order, and marks notation", () => {
    expect(each(["(6.0,-2)", "(+6, −2)", "6,-2", "( 6 , - 2 )", "(12/2,-2)", "(6,-2).", "[6,-2]", "<6,-2>", "x=6, y=-2", "y=-2, x=6", "[x=6, y=-2]", "(-2,6)", "-0,5", "−0,5", "(1 1/2, 3)", "(1 1/2,3)", "[3,2,1]", "z=1, x=3, y=2"], (t) => tuple(t))).toEqual({
      "(6.0,-2)": "6/1, -2/1", "(+6, −2)": "6/1, -2/1", "6,-2": "6/1, -2/1", "( 6 , - 2 )": "6/1, -2/1", "(12/2,-2)": "6/1, -2/1",
      "(6,-2).": "6/1, -2/1", "[6,-2]": "6/1, -2/1 notation", "<6,-2>": "6/1, -2/1 notation", "x=6, y=-2": "6/1, -2/1 notation",
      "y=-2, x=6": "6/1, -2/1 notation", "[x=6, y=-2]": "6/1, -2/1 notation", "(-2,6)": "-2/1, 6/1", "-0,5": "0/1, 5/1", "−0,5": "0/1, 5/1",
      "(1 1/2, 3)": "3/2, 3/1", "(1 1/2,3)": "3/2, 3/1", "[3,2,1]": "3/1, 2/1, 1/1 notation", "z=1, x=3, y=2": "3/1, 2/1, 1/1 notation"
    });
  });

  it("is no point when a coordinate is led by 0 and a digit, a label is wrong, or a coordinate does not read", () => {
    expect(each(["(1,000)", "1,000", "(1, 000)", "(1,05)", "(-05,1)", "x=6, x=-2", "x=6, -2", "a=6, b=-2", "x=1, y=2, w=3", "(6,-2]", "(x+1,y)", "(1,y+x)", "7", "(7)", "(6,)", "{6,-2}", "(1,2),(3,4)"], (t) => tuple(t)))
      .toEqual(all(["(1,000)", "1,000", "(1, 000)", "(1,05)", "(-05,1)", "x=6, x=-2", "x=6, -2", "a=6, b=-2", "x=1, y=2, w=3", "(6,-2]", "(x+1,y)", "(1,y+x)", "7", "(7)", "(6,)", "{6,-2}", "(1,2),(3,4)"], "no point"));
    expect([tuple("(1,0)"), tuple("1,0"), tuple("(1000000000,1)")]).toEqual(["1/1, 0/1", "1/1, 0/1", "1000000000/1, 1/1"]);
    expect(each(["(1,$000)", "(1,(000))", "(1,-(05))", "($05,1)", "x=1, y=$000"], (t) => tuple(t))).toEqual(all(["(1,$000)", "(1,(000))", "(1,-(05))", "($05,1)", "x=1, y=$000"], "no point"));
    expect([tuple("(1,$0)"), tuple("(1,(0))"), tuple("(1,$000)", offA("T-zero"))]).toEqual(["1/1, 0/1", "1/1, 0/1", "1/1, 0/1"]);
    expect([tuple("(" + "1,".repeat(98) + "1)"), tuple("(" + "1,".repeat(99) + "1)")]).toEqual([Array(99).fill("1/1").join(", "), "no point"]);
  });

  it("writes `read` as (a, b) in position order, shown for labels and mixed numbers", () => {
    const r = (t: string) => { const x = okTuple(readTuple(t, A)); return [x.read, x.labeled, x.show]; };
    expect([r("y=-2, x=6"), r("[6,-2]"), r("(1 1/2, 3)"), r("(½, 3)"), r("(6.0, +2)")]).toEqual([
      ["(6, -2)", true, true], ["(6, -2)", false, false], ["(3/2, 3)", false, true], ["(1/2, 3)", false, true], ["(6.0, 2)", false, false]]);
  });
});

describe("every rule's switch", () => {
  /* [rule, what it reads, on, off]: off is the old grader's step */
  const ROWS: [string, () => string[]][] = [
    ["N-unicode", () => [num("1½"), num("1½", offA("N-unicode")), num("‐4"), num("‐4", offA("N-unicode")), num("７"), num("７", offA("N-unicode"))]],
    ["N-divide", () => [num("3÷2"), num("3÷2", offA("N-divide"))]],
    ["N-dot", () => [num("7."), num("7.", offA("N-dot")), list("2,-7."), list("2,-7.", offA("N-dot"))]],
    ["N-named", () => [num("x = 3"), num("x = 3", offA("N-named")), list("x=2, x=-7"), list("x=2, x=-7", offA("N-named"))]],
    ["N-refuse", () => [num("140°"), num("140°", offA("N-refuse")), num("12.50$"), num("12.50$", offA("N-refuse")), num("1$2.50", offA("N-refuse")), num("+-4", offA("N-refuse")), num("2/0", offA("N-refuse")), num("1".repeat(41), offA("N-refuse")), list("(2,-7)"), list("(2,-7)", offA("N-refuse"))]],
    ["N-refuse under Q4(b)", () => [num("1 1/2", B), num("1 1/2", { q4: "b", off: new Set(["N-refuse"]) })]],
    ["N-space", () => [num("5 050"), num("5 050", offA("N-space")), num("- 1 6"), num("- 1 6", offA("N-space")), num("1 1 / 2", offA("N-space")), list("2 -7", offA("N-space"))]],
    ["N-mixed", () => [num("1 1/2"), num("1 1/2", offA("N-mixed")), num("1 3/2", offA("N-mixed")), tuple("(1 1/2, 3)", offA("N-mixed"))]],
    ["N-comma", () => [num("5,050"), num("5,050", offA("N-comma"))]],
    ["N-bracket", () => [num("(7)"), num("(7)", offA("N-bracket")), num("(3)/(2)"), num("(3)/(2)", offA("N-bracket"))]],
    ["L-sep", () => [list("2 and -7"), list("2 and -7", offA("L-sep")), list("3 or -3", offA("L-sep"))]],
    ["L-pm", () => [list("±7"), list("±7", offA("L-pm"))]],
    ["L-zero", () => [list("1,000"), list("1,000", offA("L-zero"))]],
    ["L-mixed", () => [list("2 1/3"), list("2 1/3", offA("L-mixed")), list("2 and 1/3"), list("2 and 1/3", offA("L-mixed"))]],
    ["T-zero", () => [tuple("(1,000)"), tuple("(1,000)", offA("T-zero")), tuple("(1,05)", offA("T-zero"))]]
  ];

  it("has a row for every rule the reader switches", () => {
    expect(ROWS.map(([id]) => id.split(" ")[0]).filter((id, i, a) => a.indexOf(id) === i)).toEqual([...READ_RULES]);
  });

  it("does its own step on, and the old grader's step off", () => {
    expect(Object.fromEntries(ROWS.map(([id, f]) => [id, f()]))).toEqual({
      "N-unicode": ["3/2", "unread/symbol", "-4/1", "unread/symbol", "7/1", "unread/symbol"],
      "N-divide": ["3/2", "unread/symbol"],
      "N-dot": ["7/1", "unread/expression", "2/1, -7/1", "unread/expression"],
      "N-named": ["unread/named", "unread/expression", "unread/named", "unread/expression"],
      /* off: no refusal; $ dropped, then a leading +, as toNumber did; what does not read is no reading (wrong) */
      "N-refuse": ["unread/units", "unread/null", "unread/symbol", "25/2", "25/2", "-4/1", "unread/null", "1".repeat(41) + "/1", "unread/brackets", "unread/null"],
      "N-refuse under Q4(b)": ["unread/mixed", "11/2"],
      /* off: the spaces deleted, as basicClean did */
      "N-space": ["unread/spaces", "5050/1", "unread/spaces", "-16/1", "11/2", "unread/expression"],
      "N-mixed": ["3/2", "11/2", "13/2", "11/2, 3/1"],
      "N-comma": ["5050/1", "unread/expression"],
      "N-bracket": ["7/1", "unread/expression", "3/2", "unread/expression"],
      "L-sep": ["2/1, -7/1", "unread/expression", "unread/expression"],
      "L-pm": ["7/1, -7/1", "unread/plus-minus"],
      "L-zero": ["unread/list-comma", "1/1, 0/1"],
      "L-mixed": ["unread/mixed-in-set", "7/3", "unread/mixed-in-set", "2/1, 1/3"],
      "T-zero": ["no point", "1/1, 0/1", "1/1, 5/1"]
    });
  });

  /* tools/fixtures/grade-golden.json: every given and key the frozen grader was asked about */
  interface Group { answer: string; type: string | null; right: string[]; wrong: string[] }
  const GOLDEN = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/grade-golden.json"), "utf8")) as { groups: Group[] };

  it("with every rule off, reads what the old toNumber and numberList read, on every golden number, fraction and set text", () => {
    const off: ReadOptions = { q4: "a", off: new Set(READ_RULES) };
    const texts = (types: string[]) => [...new Set(GOLDEN.groups.filter((g) => types.includes(String(g.type)))
      .flatMap((g) => [...g.right, ...g.wrong, ...g.answer.split("|").map((s) => s.trim())]))];
    const numbers = texts(["number", "fraction"]), sets = texts(["set"]);
    const drift: string[] = [];
    for (const t of numbers) {
      const r = readNumber(t, off), was = toNumber(t);
      if ((r.ok ? r.float : null) !== was) drift.push(JSON.stringify(t) + " read " + (r.ok ? r.float : r.reason) + ", was " + was);
    }
    for (const t of sets) {
      const r = readList(t, off), was = numberList(t);
      const now = r.ok ? r.members.map((m) => m.float).sort((x, y) => x - y) : null;
      if (JSON.stringify(now) !== JSON.stringify(was)) drift.push(JSON.stringify(t) + " read " + JSON.stringify(now) + ", was " + JSON.stringify(was));
    }
    expect(drift).toEqual([]);
    expect(numbers.length).toBeGreaterThan(4000);
    expect(sets.length).toBeGreaterThan(2500);
  });
});

describe("hostile input", () => {
  it("never throws, with every rule on or off, and Q4 either way", () => {
    const texts = ["(".repeat(1000) + "7" + ")".repeat(1000), "1".repeat(10000), "1/".repeat(5000), "( ".repeat(3000), "½".repeat(2000),
      "x=" + "=".repeat(5000), "1 ".repeat(5000) + "/2", "$".repeat(5000), ", ".repeat(5000), "\u0000￿\ud800", "－".repeat(100) + "7"];
    let seed = 1;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const ALPHABET = "0123456789 .,/-+()$x=e½±%°:{}[];<>|!√π÷−‐７£#a";
    for (let i = 0; i < 2000; i++) texts.push(Array.from({ length: 1 + Math.floor(rnd() * 12) }, () => ALPHABET[Math.floor(rnd() * ALPHABET.length)]).join(""));
    for (const o of [A, B, { q4: "a", off: new Set(READ_RULES) }, { q4: "b", off: new Set(READ_RULES) }] as ReadOptions[]) {
      for (const t of texts) expect(() => { readNumber(t, o); readList(t, o); readTuple(t, o); }, JSON.stringify(t.slice(0, 40))).not.toThrow();
    }
  });
});

describe("messages", () => {
  const UNREAD: UnreadReason[] = ["empty", "too-long", "named", "words", "expression", "spaces", "ambiguous-mixed", "list", "decimal-comma",
    "list-comma", "mixed-in-set", "brackets", "percent", "units", "symbol", "plus-minus", "scientific", "ratio", "grid-chars", "grid-length",
    "grid-zeros", "mixed"];
  const FORM: FormReason[] = ["rounded", "notation", "repeated", "grid-width", "unreduced"];

  it("gives every reason a sentence", () => {
    for (const q4 of ["a", "b"] as const) for (const r of UNREAD) expect(unreadMessage(r, q4), r).toMatch(/^[A-Z].*\.$/);
    for (const r of FORM) expect(formMessage(r, "(6, -2)"), r).toMatch(/^[A-Z].*\.$/);
  });

  it("says what the decided defaults say", () => {
    expect([unreadMessage("named", "a"), unreadMessage("list", "a"), unreadMessage("decimal-comma", "a"), unreadMessage("units", "a"),
      unreadMessage("expression", "a"), unreadMessage("mixed-in-set", "a"), unreadMessage("percent", "a"), unreadMessage("mixed", "b")]).toEqual([
      "Type just the number.", "This box takes one number. Type just one.", "Use a decimal point, like 0.5. This box takes one number.",
      "Type the number without units.", "Type a single number, as a decimal or a fraction.",
      "Put a comma between values. Type a mixed number as a fraction, like 7/3.", "Type it as a fraction, like 3/4.",
      "Type it as a fraction, like 3/2, or as a decimal, like 1.5."]);
    expect(unreadMessage("plus-minus", "a")).toBe(unreadMessage("list", "a"));
  });

  it("tells \"2 and 1/3\" how to type a mixed number only under Q4(a)", () => {
    expect(unreadMessage("ambiguous-mixed", "a")).toBe("Type a mixed number with a space, like 2 1/3, or as a fraction, like 7/3.");
    expect(unreadMessage("ambiguous-mixed", "b")).toBe("Type it as a fraction, like 7/3.");
  });

  it("builds the form, read and lowest-terms lines from the typed answer's reading", () => {
    expect(formMessage("notation", okTuple(readTuple("y=-2, x=6", A)).read)).toBe("Right values. Write it as (6, -2).");
    expect(readMessage(ok(readNumber("1 1/2", A)).read)).toBe("We read that as 3/2.");
    expect(lowestMessage("6/4", "3/2")).toBe("6/4 is 3/2 in lowest terms.");
  });
});
