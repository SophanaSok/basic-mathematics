import { describe, expect, it } from "vitest";
import type { Band } from "./bands.ts";
import { supportFor } from "./support.ts";

const BANDS: Band[] = ["none", "weak", "building", "strong"];
const of = (m: Record<string, Band>) => (s: string): Band => m[s] ?? "none";

describe("supportFor", () => {
  it("own evidence decides first", () => {
    expect(supportFor("s", [], of({ s: "weak" }))).toEqual({ level: "guided", from: "own", weak: [] });
    expect(supportFor("s", [], of({ s: "building" }))).toEqual({ level: "standard", from: "own", weak: [] });
    expect(supportFor("s", [], of({ s: "strong" }))).toEqual({ level: "light", from: "own", weak: [] });
  });
  it("own evidence overrides the prerequisites both ways", () => {
    expect(supportFor("s", ["a"], of({ s: "strong", a: "weak" })).level).toBe("light");
    expect(supportFor("s", ["a", "b"], of({ s: "weak", a: "strong", b: "strong" }))).toEqual({ level: "guided", from: "own", weak: [] });
  });
  it("no evidence anywhere, or no prerequisites, is standard from none", () => {
    expect(supportFor("s", [], of({}))).toEqual({ level: "standard", from: "none", weak: [] });
    expect(supportFor("s", ["a", "b"], of({}))).toEqual({ level: "standard", from: "none", weak: [] });
  });
  it("a weak prerequisite guides and is listed in order", () => {
    expect(supportFor("s", ["a", "b", "c"], of({ a: "weak", b: "strong", c: "weak" }))).toEqual({ level: "guided", from: "requires", weak: ["a", "c"] });
    expect(supportFor("s", ["a", "b"], of({ b: "weak" })).weak).toEqual(["b"]);
  });
  it("all prerequisites evidenced and strong is light", () => {
    expect(supportFor("s", ["a", "b"], of({ a: "strong", b: "strong" }))).toEqual({ level: "light", from: "requires", weak: [] });
  });
  it("partly evidenced strong prerequisites, or a building one, stay standard", () => {
    expect(supportFor("s", ["a", "b"], of({ a: "strong" }))).toEqual({ level: "standard", from: "requires", weak: [] });
    expect(supportFor("s", ["a", "b"], of({ a: "strong", b: "building" }))).toEqual({ level: "standard", from: "requires", weak: [] });
  });
  it("calls band at most once per ref, duplicates counted once", () => {
    const calls: Record<string, number> = {};
    const band = (s: string): Band => { calls[s] = (calls[s] ?? 0) + 1; return "strong"; };
    const r = supportFor("s", ["a", "a", "b"], (s) => (s === "s" ? (calls[s] = (calls[s] ?? 0) + 1, "none") : band(s)));
    expect(r.level).toBe("light");
    for (const k of Object.keys(calls)) expect(calls[k]).toBe(1);
    expect(Object.keys(calls).sort()).toEqual(["a", "b", "s"]);
  });
  it("a section listed among its own prerequisites is read once, and not as a prerequisite", () => {
    const calls: Record<string, number> = {};
    const band = (s: string): Band => { calls[s] = (calls[s] ?? 0) + 1; return s === "s" ? "none" : "strong"; };
    const r = supportFor("s", ["s", "a"], band);
    expect(calls.s).toBe(1);
    expect(r).toEqual({ level: "light", from: "requires", weak: [] });
    expect(supportFor("s", ["s"], band)).toEqual({ level: "standard", from: "none", weak: [] });
  });
  it("guided exactly when own is weak, or own is none and some prerequisite is weak", () => {
    for (let k = 0; k <= 3; k++) {
      const total = 4 ** (k + 1);
      for (let n = 0; n < total; n++) {
        const digits = Array.from({ length: k + 1 }, (_, i) => BANDS[Math.floor(n / 4 ** i) % 4]);
        const m: Record<string, Band> = { s: digits[0] };
        const req = digits.slice(1).map((b, i) => { m["r" + i] = b; return "r" + i; });
        const want = digits[0] === "weak" || (digits[0] === "none" && digits.slice(1).includes("weak"));
        expect(supportFor("s", req, of(m)).level === "guided").toBe(want);
      }
    }
  });
});
