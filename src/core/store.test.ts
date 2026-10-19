import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { STORE_KEYS } from "./store.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("bm.guide.v1, the first-run guide's own key", () => {
  it("is a store key", () => {
    expect(STORE_KEYS.guide).toBe("bm.guide.v1");
  });
  it("stays on this device: not in the synced fields, the reset or the merge", () => {
    const fields = /var FIELDS = (\[[^\]]*\])/.exec(read("assets/account.js"));
    expect(fields).not.toBeNull();
    expect(JSON.parse(fields![1])).not.toContain("guide");
    expect(read("assets/site.js")).not.toMatch(/GUIDE_KEY|STORE_KEYS\.guide|keys\.guide|bm\.guide\.v1/);
    expect(read("src/sync/merge.ts")).not.toMatch(/guide/);
  });
});
