import { describe, expect, it } from "vitest";
import { base36, checkpointId, eventId, type EventSet, type Payload } from "../sync/events.ts";
import { bandFor, bandOf, bandsAll } from "./bands.ts";
import { dayNumber } from "./recall.ts";

const D0 = dayNumber("2026-10-01")!;
let counter = 0;
const freshRand = () => base36(++counter + 5000, 8);

function arena(sec: string, d: number, ok: 0 | 1): [string, Payload] {
  const P: Payload = [d * 1440 + 600, d, "ar", sec, "", "a", ok, ok ? 1 : 0, 0, 0];
  return [eventId("dev00001", P, freshRand()), P];
}
function build(entries: [string, Payload][]): EventSet {
  const V: EventSet = {};
  entries.forEach(([id, P]) => { V[id] = P; });
  return V;
}

describe("bandFor", () => {
  it("cuts at the thresholds", () => {
    expect(bandFor({ m: 0.9, c: 2 })).toBe("none");
    expect(bandFor({ m: 0.44, c: 3 })).toBe("weak");
    expect(bandFor({ m: 0.45, c: 3 })).toBe("building");
    expect(bandFor({ m: 0.849, c: 3 })).toBe("building");
    expect(bandFor({ m: 0.85, c: 3 })).toBe("strong");
  });
});

describe("bandOf", () => {
  it("reads four right Arena answers as strong, three misses as weak, two as none", () => {
    /* 0.5 -> 0.65 -> 0.755 -> 0.8285: three right answers are still building, a fourth is strong */
    const three = build([0, 1, 2].map((i) => arena("ch01#a", D0 + i, 1)));
    expect(bandOf(three, "ch01#a")).toBe("building");
    const four = build([0, 1, 2, 3].map((i) => arena("ch01#a", D0 + i, 1)));
    expect(bandOf(four, "ch01#a")).toBe("strong");
    const wrong = build([arena("ch01#a", D0, 0), arena("ch01#a", D0 + 1, 0), arena("ch01#a", D0 + 2, 0)]);
    expect(bandOf(wrong, "ch01#a")).toBe("weak");
    const two = build([arena("ch01#a", D0, 1), arena("ch01#a", D0 + 1, 1)]);
    expect(bandOf(two, "ch01#a")).toBe("none");
  });
});

describe("bandsAll", () => {
  it("lists the sections with evidence or a checkpoint, memoised and frozen", () => {
    const s = D0 + 5;
    const cp: Payload = [(s - 1) * 1440, s - 1, "cp", "ch03#c", "", "z", 0, 0, 0, 0, { b: 1, l: D0, s, n: 10, o: 5 }];
    const hint: Payload = [D0 * 1440 + 5, D0, "ex", "ch04#d", "ch04/e1", "h", 0, 1, 0, 0];
    const V = build([
      arena("ch01#a", D0, 1),
      [checkpointId(cp), cp],
      [eventId("dev00001", hint, freshRand()), hint]
    ]);
    const all = bandsAll(V);
    expect(Object.keys(all).sort()).toEqual(["ch01#a", "ch03#c"]);
    expect(all["ch03#c"]).toBe(bandOf(V, "ch03#c"));
    expect(Object.isFrozen(all)).toBe(true);
    expect(bandsAll(V)).toBe(all);
  });
});
