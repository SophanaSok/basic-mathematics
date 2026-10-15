import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { eventId, isValid } from "../sync/events.ts";
import { bit, deviceOk, generatorRef, itemRef, pagePayload, runPayloads, sameOwner, secRef } from "./recorder.ts";
import { dayNumber } from "./recall.ts";

const ROOT = path.resolve(__dirname, "../..");
const T = Math.floor(Date.UTC(2026, 9, 14, 10, 30) / 60000);
const base = { chapter: "ch02", key: "e3", section: "one-unknown" };

describe("pagePayload", () => {
  it("builds each change", () => {
    expect(pagePayload({ ...base, type: "attempt", correct: true, tryNo: 2, rung: 1, solutionOpen: true }, T))
      .toEqual([T, Math.floor(T / 1440), "ex", "ch02#one-unknown", "ch02/e3", "c", 1, 2, 1, 1]);
    expect(pagePayload({ ...base, type: "attempt", inline: true, correct: false }, T)!.slice(2)).toEqual(["in", "ch02#one-unknown", "ch02/e3", "c", 0, 0, 0, 0]);
    expect(pagePayload({ ...base, type: "opened" }, T)!.slice(5)).toEqual(["o", 0, 0, 0, 0]);
    expect(pagePayload({ ...base, type: "ladder", rung: 2 }, T)!.slice(5)).toEqual(["h", 0, 0, 2, 0]);
    expect(pagePayload({ ...base, type: "skipped" }, T)!.slice(2, 3)).toEqual(["in"]);
    expect(pagePayload({ ...base, type: "skipped" }, T)!.slice(5)).toEqual(["s", 0, 0, 0, 0]);
  });
  it("records nothing for a solved opening, an unknown type or a non-object", () => {
    expect(pagePayload({ ...base, type: "opened", solved: true }, T)).toBeNull();
    expect(pagePayload({ ...base, type: "other" }, T)).toBeNull();
    expect(pagePayload({ type: "attempt", chapter: "ch02" }, T)).toBeNull();
    for (const x of ["attempt", null, [], 3, undefined]) expect(pagePayload(x, T)).toBeNull();
  });
  it("clamps", () => {
    const n = (v: unknown) => pagePayload({ ...base, type: "attempt", tryNo: v }, T)![7];
    expect([n(1000), n(-1), n("3"), n(NaN), n(2.9)]).toEqual([999, 0, 3, 0, 2]);
    const r = (v: unknown) => pagePayload({ ...base, type: "ladder", rung: v }, T)![8];
    expect([r(-1), r("3"), r(NaN), r(50)]).toEqual([0, 3, 0, 9]);
  });
  it("never lets a secret through", () => {
    ["attempt", "opened", "ladder", "skipped"].forEach((type) => {
      const P = pagePayload({ ...base, type, given: "SECRET-7Q", typed: "SECRET-7Q", ex: { tagName: "DIV" }, answer: 42, tryNo: 1 }, T)!;
      expect(P).toHaveLength(10);
      const s = JSON.stringify(P);
      expect(s).not.toContain("SECRET");
      expect(s).not.toContain("DIV");
      expect(s).not.toContain("42,");
      expect(P.includes(42 as never)).toBe(false);
    });
  });
});

describe("refs", () => {
  it("builds and refuses", () => {
    expect(secRef("ch02", "one-unknown")).toBe("ch02#one-unknown");
    expect(secRef("ch02", "ch02#one-unknown")).toBe("ch02#one-unknown");
    expect(secRef("ch02", "")).toBe("");
    expect(secRef(undefined, "x")).toBe("");
    expect(secRef("Ch02", "x")).toBe("");
    expect(secRef("ch02", "a b")).toBe("");
    expect(secRef("ch02", "a".repeat(91))).toBe("");
    expect(secRef(2, "x")).toBe("");
    expect(itemRef("ch02", "e3")).toBe("ch02/e3");
    expect(itemRef("ch02", "E3")).toBe("");
    expect(itemRef("ch02", 3)).toBe("");
    expect(itemRef("", "e3")).toBe("");
    expect(generatorRef("add-2")).toBe("g:add-2");
    expect(generatorRef("")).toBe("");
    expect(generatorRef(7)).toBe("");
    expect(generatorRef("A b")).toBe("");
    expect(generatorRef("a".repeat(90))).toBe("");
    expect(bit(1, 4)).toBe(4);
    expect(bit("", 4)).toBe(0);
  });
});

describe("runPayloads", () => {
  const answers = (k: number) => Array.from({ length: k }, (_, i) => ({ section: "ch0" + (i % 3) + "#s" + i, g: "gen" + i, first: i % 2 === 0, retry: i % 4 === 1, pass: i % 2, timeout: i % 3 === 0, late: false, due: true, hf: i === 5, el: 4321, pts: 7 }));
  it("gives a payload per answer", () => {
    const L = runPayloads({ day: "2026-10-14", answers: answers(10) });
    expect(L).toHaveLength(10);
    L.forEach((P) => {
      expect(P).toHaveLength(10);
      expect(P[0] % 1440).toBe(0);
      expect(isValid(eventId("dev00001", P, "rand0001"), P)).toBe(true);
      P.forEach((v) => { expect(v).not.toBe(4321); expect(v).not.toBe(7); });
    });
    const d = dayNumber("2026-10-14")!;
    expect(L[0]).toEqual([d * 1440, d, "ar", "ch00#s0", "g:gen0", "a", 1, 1, 0, 16 | 4]);
    expect(L[1]).toEqual([d * 1440, d, "ar", "ch01#s1", "g:gen1", "a", 0, 2, 0, 2 | 16]);
    expect(L[5][9]).toBe(2 | 16 | 32);
  });
  it("skips and refuses", () => {
    expect(runPayloads({ day: "2026-10-14", answers: [{ g: "x" }, null, { section: "" }, { section: "Bad Sec" }, { section: "ch01#a" }] })).toHaveLength(1);
    expect(runPayloads({ day: "2026-10-14", replay: true, answers: answers(2) })).toEqual([]);
    expect(runPayloads({ day: "nope", answers: answers(2) })).toEqual([]);
    expect(runPayloads({ day: "2026-10-14", answers: "x" })).toEqual([]);
    expect(runPayloads(null)).toEqual([]);
  });
});

describe("device record", () => {
  it("sameOwner", () => {
    expect(sameOwner({ id: "a" }, null)).toBe(true);
    expect(sameOwner({ id: "a", uid: "u1" }, "u1")).toBe(true);
    expect(sameOwner({ id: "a", uid: "u1" }, "u2")).toBe(false);
    expect(sameOwner({ id: "a", uid: "u1" }, null)).toBe(false);
    expect(sameOwner({ id: "a" }, "u1")).toBe(false);
    expect(sameOwner(null, null)).toBe(true);
    expect(sameOwner({ uid: 5 }, null)).toBe(true);
  });
  it("deviceOk", () => {
    expect(deviceOk({ id: "ab12cd34" })).toBe(true);
    expect(deviceOk({ id: "AB12cd34" })).toBe(false);
    expect(deviceOk({ id: "short" })).toBe(false);
    expect(deviceOk({ id: 12345678 })).toBe(false);
    expect(deviceOk([])).toBe(false);
    expect(deviceOk(null)).toBe(false);
  });
});

describe("recorder.ts", () => {
  it("adds no global when Node imports it", () => {
    const f = path.join(ROOT, "src/learn/recorder.ts");
    expect(fs.existsSync(f)).toBe(true);
    const script = "const before = Reflect.ownKeys(globalThis).map(String);" +
      "await import(" + JSON.stringify(new URL("file://" + f).href) + ");" +
      "const after = Reflect.ownKeys(globalThis).map(String);" +
      "console.log(JSON.stringify(after.filter((k) => !before.includes(k))));";
    const out = execFileSync(process.execPath, ["--input-type=module", "--no-warnings", "-e", script], { encoding: "utf8" });
    expect(JSON.parse(out.trim())).toEqual([]);
  });
});
