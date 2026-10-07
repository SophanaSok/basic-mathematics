/* The skills module: the override rule on hand-made records (no record in the data has
   every case), the generators' resolved records on the real data, the Accuplacer split,
   the reporting domains, the course grouping and the lookups. tools/check-static.js
   `skills` holds the data itself to the curriculum, the generators and the code list. */
import { describe, expect, it } from "vitest";
import type { SectionRef } from "../types/state.ts";
import {
  COURSES, CONTAINERS, GENERATOR_SKILLS, SKILLS, byCourse, generatorSkill, reportDomain, resolveOverride, skillOf,
  standardPage, tagsIn, type Skill
} from "./skills.ts";

const base: Skill = {
  ccss: "HSA.REI.B.3", also: ["7.EE.B.4.b", "6.EE.B.8"], course: "algebra-1",
  sat: ["sat.alg.ineq"], act: ["act.phm.alg"], accuplacer: ["qas.lineq", "aaf.lineq"], aleks: ["ppl.eqineq"]
};

describe("resolveOverride", () => {
  it("returns a record equal to the section's for an empty override", () => {
    expect(resolveOverride(base, {})).toStrictEqual(base);
    const approx: Skill = { ...base, approx: true };
    expect(resolveOverride(approx, {})).toStrictEqual(approx);
  });

  it("replaces tags and course where the override gives them, and keeps the other families", () => {
    const r = resolveOverride(base, { course: "pre-algebra", sat: [], accuplacer: ["qas.rat"] });
    expect(r.course).toBe("pre-algebra");
    expect(r.sat).toEqual([]);
    expect(r.accuplacer).toEqual(["qas.rat"]);
    expect(r.act).toEqual(base.act);
    expect(r.aleks).toEqual(base.aleks);
    expect(r.ccss).toBe(base.ccss);
    expect(r.also).toEqual(base.also);
  });

  it("takes a new ccss as primary, the old primary into also, itself out of also, with no duplicate", () => {
    const section: Skill = { ...base, ccss: "HSN.RN.A.2", also: ["HSN.RN.A.1", "8.EE.A.1", "HSN.RN.A.2", "8.EE.A.2", "HSN.RN.A.1"] };
    const r = resolveOverride(section, { ccss: "8.EE.A.1" });
    expect(r.ccss).toBe("8.EE.A.1");
    expect(r.also).toEqual(["HSN.RN.A.2", "HSN.RN.A.1", "8.EE.A.2"]);
  });

  it("does not carry a section's approx to a code it did not describe", () => {
    const section: Skill = { ...base, approx: true };
    const exact = resolveOverride(section, { ccss: "HSA.CED.A.1" });
    expect(exact.ccss).toBe("HSA.CED.A.1");
    expect(exact.approx).toBeUndefined();
    expect("approx" in exact).toBe(false);
    const approx = resolveOverride(section, { ccss: "HSA.CED.A.1", approx: true });
    expect(approx.approx).toBe(true);
  });

  it("marks the inherited code when the override sets only approx, and keeps also", () => {
    const r = resolveOverride(base, { approx: true });
    expect(r.ccss).toBe(base.ccss);
    expect(r.approx).toBe(true);
    expect(r.also).toEqual(base.also);
  });

  it("puts no null in also when a null-coded section gets a code", () => {
    const section: Skill = { ...base, ccss: null, also: ["HSF.BF.A.2"] };
    const r = resolveOverride(section, { ccss: "HSA.SSE.B.4" });
    expect(r.ccss).toBe("HSA.SSE.B.4");
    expect(r.also).toEqual(["HSF.BF.A.2"]);
  });

  it("does not change its arguments", () => {
    const section: Skill = { ...base, also: [...base.also] };
    const before = JSON.stringify(section);
    resolveOverride(section, { ccss: "8.EE.A.1", sat: [] });
    expect(JSON.stringify(section)).toBe(before);
  });
});

describe("generatorSkill on the data", () => {
  it("resolves pow-laws to 8.EE.A.1, with the section's codes in also", () => {
    const r = generatorSkill("pow-laws", "ch03#powers");
    expect(r).toMatchObject({ ccss: "8.EE.A.1", also: ["HSN.RN.A.2", "HSN.RN.A.1", "8.EE.A.2"], course: "pre-algebra", sat: [] });
  });

  it("resolves compose-motions to 8.G.A.3, pre-algebra", () => {
    expect(generatorSkill("compose-motions", "ch06#isometries")).toMatchObject({ ccss: "8.G.A.3", course: "pre-algebra" });
  });

  it("resolves geo-infinite to an approximate HSA.SSE.B.4", () => {
    expect(generatorSkill("geo-infinite", "ch15#geometric")).toMatchObject({ ccss: "HSA.SSE.B.4", approx: true, course: "algebra-2" });
  });

  it("gives a generator with no override its section's record", () => {
    expect(GENERATOR_SKILLS["pow-frac"]).toBeUndefined();
    expect(generatorSkill("pow-frac", "ch03#powers")).toStrictEqual(SKILLS["ch03#powers"]);
    expect(generatorSkill("constructor", "ch03#powers")).toStrictEqual(SKILLS["ch03#powers"]);
  });

  it("returns null for a container or an unknown section", () => {
    expect(generatorSkill("pow-laws", "ch07#review")).toBeNull();
    expect(generatorSkill("pow-laws", "ch99#nowhere")).toBeNull();
  });
});

describe("tagsIn and reportDomain", () => {
  it("split Accuplacer's list into QAS and AAF", () => {
    const s = SKILLS["ch02#one-unknown"];
    expect(s.accuplacer).toEqual(["qas.lineq", "aaf.lineq"]);
    expect(tagsIn(s, "qas")).toEqual(["qas.lineq"]);
    expect(tagsIn(s, "aaf")).toEqual(["aaf.lineq"]);
    expect(reportDomain(s, "qas")).toBe("qas.lineq");
    expect(reportDomain(s, "aaf")).toBe("aaf.lineq");
  });

  it("give no AAF domain for a QAS-only list", () => {
    const s = SKILLS["ch01#addition"];
    expect(s.accuplacer).toEqual(["qas.rat"]);
    expect(tagsIn(s, "aaf")).toEqual([]);
    expect(reportDomain(s, "aaf")).toBeNull();
    expect(reportDomain(s, "qas")).toBe("qas.rat");
  });

  it("report SAT by its domain prefix and skip act.mod for ACT", () => {
    const s: Skill = { ...base, sat: ["sat.psda.ratio", "sat.alg.lin1"], act: ["act.mod", "act.phm.alg"], aleks: ["ppl.real", "ppl.rad"] };
    expect(reportDomain(s, "sat")).toBe("sat.psda");
    expect(reportDomain(s, "act")).toBe("act.phm.alg");
    expect(reportDomain({ ...s, act: ["act.mod"] }, "act")).toBeNull();
    expect(reportDomain(s, "aleks")).toBe("ppl.real");
    expect(reportDomain({ ...s, sat: [] }, "sat")).toBeNull();
    expect(reportDomain(SKILLS["ch02#word-problems"], "act")).toBe("act.phm.alg");
    expect(reportDomain(SKILLS["ch02#word-problems"], "sat")).toBe("sat.alg");
  });
});

describe("byCourse and skillOf", () => {
  const order = [...Object.keys(SKILLS), ...CONTAINERS] as SectionRef[];

  it("groups every record under its course, in the order given, with no container", () => {
    const reading: SectionRef[] = ["ch01#integers", "ch07#review", "ch03#order", "ch02#one-unknown", "ch16#det2", "ch99#nowhere"];
    const g = byCourse(reading);
    expect(Object.keys(g)).toEqual([...COURSES]);
    expect(g["pre-algebra"]).toEqual(["ch01#integers", "ch02#one-unknown"]);
    expect(g["algebra-1"]).toEqual(["ch03#order"]);
    expect(g.beyond).toEqual(["ch16#det2"]);
    const all = byCourse(order);
    expect(Object.values(all).flat().length).toBe(Object.keys(SKILLS).length);
    CONTAINERS.forEach((c) => expect(Object.values(all).flat()).not.toContain(c));
  });

  it("returns null for a container and an unknown ref", () => {
    CONTAINERS.forEach((c) => expect(skillOf(c)).toBeNull());
    expect(skillOf("ch99#nowhere")).toBeNull();
    expect(skillOf("ch01#integers")).toBe(SKILLS["ch01#integers"]);
  });
});

describe("standardPage", () => {
  it("links a code's domain page", () => {
    expect(standardPage("HSA.REI.B.4.b")).toBe("https://www.thecorestandards.org/Math/Content/HSA/REI/");
    expect(standardPage("8.EE.C.7.b")).toBe("https://www.thecorestandards.org/Math/Content/8/EE/");
  });
});
