import { describe, expect, it } from "vitest";
import { readConfig } from "./config.ts";

/* The settings in assets/config.js (window.BM_CONFIG), read with their defaults. The Daily
   board's kill switch, `board`, is on unless it is exactly the string "off". */

describe("the Daily board switch", () => {
  it("is on by default", () => {
    expect(readConfig(undefined).board).toBe("on");
    expect(readConfig({}).board).toBe("on");
  });

  it("is off only for the string \"off\"", () => {
    expect(readConfig({ board: "off" }).board).toBe("off");
  });

  it("reads any other value as on", () => {
    for (const board of ["OFF", "no", "", false, 0, null, {}, ["off"]]) expect(readConfig({ board }).board).toBe("on");
  });
});

describe("the Learners switch", () => {
  it("is on by default", () => {
    expect(readConfig(undefined).learners).toBe("on");
    expect(readConfig({}).learners).toBe("on");
  });

  it("is off only for the string \"off\"", () => {
    expect(readConfig({ learners: "off" }).learners).toBe("off");
    for (const learners of ["OFF", "no", "", false, 0, null, {}, ["off"]]) expect(readConfig({ learners }).learners).toBe("on");
  });
});

describe("the other settings", () => {
  it("fill their defaults as before", () => {
    expect(readConfig(undefined)).toEqual({
      supabaseUrl: "", supabaseAnonKey: "", providers: [], emailDelivery: true, learn: { events: "on" }, board: "on", learners: "on"
    });
  });

  it("are read as before with the switch off", () => {
    expect(readConfig({ supabaseUrl: "u", supabaseAnonKey: "k", providers: ["google", 3], emailDelivery: false, learn: { events: "off" }, board: "off" }))
      .toEqual({ supabaseUrl: "u", supabaseAnonKey: "k", providers: ["google"], emailDelivery: false, learn: { events: "off" }, board: "off", learners: "on" });
  });
});
