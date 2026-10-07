/* Skills: one record per Lang section, keyed by its SectionRef ("ch02#one-unknown"), and the
   generators whose test differs from their section's. Pure: no page globals, and nothing here
   reads anything but its arguments and the tables below. Generated once from the design's
   draft data (~/.claude/plans/skills-taxonomy-design.md, skills-draft.json); edit it by hand
   from now on. tools/check-static.js `skills` holds it to the curriculum, the generators,
   the scored exercises and the vendored code list (tools/fixtures/ccss-codes.json).

   Rules the data follows (design §3):
     code    `ccss` is the most specific official Common Core code, grade 6 through high
             school, without its "CCSS.Math.Content." prefix ("HSA.REI.B.4.b"), that matches
             the section's asked work: its scored exercises and generators. A grade 6-8 code
             and a high-school code that both match exactly: the grade 6-8 code is primary and
             the other goes to `also`. `approx: true` marks the nearest code, covering the
             work but not its framing. `null`: no content standard describes the work.
             Content rooted below grade 6 takes the grade 6-8 extension it is taught as.
             `also` lists the other codes touched; nothing computes a course or a report
             from it.
     course  the US course where the asked work is taught (taught content only for a
             section with no asked work). A grade 6-8 primary code means pre-algebra; a (+)
             code or (+) sub-standard means beyond, and beyond means a (+) code; a
             high-school non-(+) code means algebra-1, geometry or algebra-2, chosen per
             section. Approximate codes are exempt.
     tags    four stored lists from the published blueprints (SAT testing points, ACT 2025
             reporting categories, Accuplacer QAS/AAF content areas, ALEKS PPL topic areas),
             reported as five families: Accuplacer's list splits into QAS (qas.*) and AAF
             (aaf.*). The first tag of a family is its reporting domain; for SAT the domain
             is its prefix ("sat.alg"); act.mod is an overlay and never first. Grade 6-7
             arithmetic and grade 6-7 area and scale are ACT Integrating Essential Skills
             (act.ies); all other geometry, whatever its grade, act.phm.geo. The image of a
             point under a coordinate motion or dilation is ALEKS ppl.geotrig. An empty list
             means that exam does not test the skill.
     review  the four mixed-review sections (CONTAINERS) hold no exercises of their own:
             every item credits its source section, so they carry no record.

   A generator gets an override (GENERATOR_SKILLS) only when it tests something its
   section's record does not describe; generatorSkill() lays it over the section's record
   by the one rule in resolveOverride().

   Owner questions (design §10), answered here with the recommended defaults; each is
   marked where it is decided, so it is easy to find and change:
     Q1  a fifth course, "beyond" (labelled "Beyond Algebra 2"), for (+) content; no
         learner is ever placed into it. COURSES, COURSE_LABELS, and the records marked Q1.
     Q2  a section with no content standard stores `ccss: null`, never a Mathematical
         Practice code. The records marked Q2.
     Q3  course follows what a section tests, not the method it teaches, and the lower
         grade wins a tie. The head comment above, and the records marked Q3. */

import type { SectionRef } from "../types/state.ts";

/* Owner Q1 (default taken): "beyond" is a fifth course, for (+) content, that no learner is
   ever placed into. Drop it here and in COURSE_LABELS to go back to 0001's four courses (the
   records and overrides marked Q1 then need a course of the four). */
export const COURSES = ["pre-algebra", "algebra-1", "geometry", "algebra-2", "beyond"] as const;
export type Course = (typeof COURSES)[number];
/** What a page calls each course. */
export const COURSE_LABELS: Readonly<Record<Course, string>> = {
  "pre-algebra": "Pre-algebra", "algebra-1": "Algebra 1", geometry: "Geometry", "algebra-2": "Algebra 2",
  beyond: "Beyond Algebra 2" // Owner Q1
};

export const SAT_TAGS = [
  "sat.alg.lin1", "sat.alg.lin2", "sat.alg.linf", "sat.alg.sys", "sat.alg.ineq",
  "sat.adv.equiv", "sat.adv.nleq", "sat.adv.nlf", "sat.psda.ratio", "sat.psda.pct",
  "sat.psda.data1", "sat.psda.data2", "sat.psda.prob", "sat.psda.infer", "sat.psda.claims",
  "sat.geo.area", "sat.geo.lat", "sat.geo.trig", "sat.geo.circ"
] as const;
export const ACT_TAGS = [
  "act.phm.nq", "act.phm.alg", "act.phm.fn", "act.phm.geo", "act.phm.sp", "act.ies",
  "act.mod"
] as const;
export const ACCUPLACER_TAGS = [
  "qas.rat", "qas.ratio", "qas.exp", "qas.expr", "qas.lineq", "qas.linapp", "qas.prob",
  "qas.stats", "qas.geo.pa", "qas.geo.a1", "aaf.lineq", "aaf.linapp", "aaf.fact", "aaf.quad",
  "aaf.fn", "aaf.radrat", "aaf.poly", "aaf.explog", "aaf.geo.a1", "aaf.geo.a2", "aaf.trig"
] as const;
export const ALEKS_TAGS = [
  "ppl.real", "ppl.eqineq", "ppl.linquad", "ppl.exppoly", "ppl.ratexpr", "ppl.rad",
  "ppl.explog", "ppl.geotrig"
] as const;
export type SatTag = (typeof SAT_TAGS)[number];
export type ActTag = (typeof ACT_TAGS)[number];
export type AccuplacerTag = (typeof ACCUPLACER_TAGS)[number];
export type AleksTag = (typeof ALEKS_TAGS)[number];

/** Reporting families. Accuplacer's one stored list reports as two: QAS (qas.*) and AAF (aaf.*). */
export type Family = "sat" | "act" | "qas" | "aaf" | "aleks";

export type Tags = {
  readonly sat: readonly SatTag[];
  readonly act: readonly ActTag[];
  readonly accuplacer: readonly AccuplacerTag[];
  readonly aleks: readonly AleksTag[];
};
export type Skill = Tags & {
  /** "HSA.REI.B.4.b"; null when no content standard fits (Owner Q2) */
  readonly ccss: string | null;
  /** ccss is the nearest code, not an exact match */
  readonly approx?: true;
  /** other codes touched; never used for course or reports */
  readonly also: readonly string[];
  readonly course: Course;
};
/** No `also`: resolveOverride computes it. */
export type Override = Partial<Pick<Skill, "ccss" | "approx" | "course">> & Partial<Tags>;

/** The mixed-review sections: no exercises of their own, so no record. */
export const CONTAINERS: readonly SectionRef[] = ["interlude#review", "ch07#review", "ch11#review", "ch16#review"];

export const SKILLS: Readonly<Record<SectionRef, Skill>> = {
  "ch01#integers": { ccss: "6.NS.C.6.a", also: ["6.NS.C.5", "6.EE.A.2"], course: "pre-algebra",
    sat: [], act: ["act.ies"], accuplacer: ["qas.rat"], aleks: ["ppl.real"] },
  "ch01#addition": { ccss: "7.NS.A.1.c", also: ["7.NS.A.1.b", "7.NS.A.1.d", "6.NS.C.6.a"], course: "pre-algebra",
    sat: [], act: ["act.ies"], accuplacer: ["qas.rat"], aleks: ["ppl.real"] },
  "ch01#multiplication": { ccss: "7.NS.A.2.a", also: ["HSA.APR.A.1", "7.EE.A.1", "6.EE.A.3", "HSA.SSE.A.2"], course: "pre-algebra",
    sat: ["sat.adv.equiv"], act: ["act.ies", "act.phm.alg"], accuplacer: ["qas.rat", "qas.expr"], aleks: ["ppl.real", "ppl.exppoly"] },
  "ch01#even-odd": { ccss: "6.EE.A.3", approx: true, also: ["6.NS.B.4", "HSA.APR.C.4"], course: "pre-algebra",
    sat: [], act: ["act.ies"], accuplacer: [], aleks: [] },
  "ch01#rationals": { ccss: "7.NS.A.1.d", also: ["7.NS.A.2.b", "7.NS.A.3"], course: "pre-algebra",
    sat: [], act: ["act.ies"], accuplacer: ["qas.rat"], aleks: ["ppl.real"] },
  "ch01#inverses": { ccss: "6.NS.A.1", also: ["7.NS.A.2.b", "7.NS.A.2.c"], course: "pre-algebra",
    sat: [], act: ["act.ies"], accuplacer: ["qas.rat"], aleks: ["ppl.real"] },

  "ch02#one-unknown": { ccss: "8.EE.C.7.b", also: ["8.EE.C.7.a", "HSA.REI.A.1", "HSA.REI.B.3"], course: "pre-algebra",
    sat: ["sat.alg.lin1"], act: ["act.phm.alg"], accuplacer: ["qas.lineq", "aaf.lineq"], aleks: ["ppl.eqineq"] },
  "ch02#two-unknowns": { ccss: "8.EE.C.8.b", also: ["HSA.REI.C.6", "HSA.REI.C.5"], course: "pre-algebra",  // Owner Q3: course by tested work, lower grade wins a tie
    sat: ["sat.alg.sys"], act: ["act.phm.alg"], accuplacer: ["qas.lineq", "aaf.lineq"], aleks: ["ppl.eqineq"] },
  "ch02#three-unknowns": { ccss: "HSA.REI.C.6", also: ["HSA.REI.C.5"], course: "algebra-2",
    sat: [], act: ["act.phm.alg"], accuplacer: [], aleks: ["ppl.eqineq"] },
  "ch02#word-problems": { ccss: "8.EE.C.8.c", also: ["HSA.CED.A.3", "HSA.REI.C.6", "HSA.CED.A.2", "HSN.Q.A.2", "7.EE.B.4"], course: "pre-algebra",  // Owner Q3: course by tested work, lower grade wins a tie
    sat: ["sat.alg.sys", "sat.alg.lin2"], act: ["act.phm.alg", "act.mod"], accuplacer: ["qas.linapp", "aaf.linapp"], aleks: ["ppl.eqineq"] },

  "ch03#why-more": { ccss: "8.NS.A.1", also: ["8.EE.A.2"], course: "pre-algebra",
    sat: [], act: ["act.phm.nq"], accuplacer: [], aleks: ["ppl.real"] },
  "ch03#axioms": { ccss: "6.NS.C.7", approx: true, also: ["7.NS.A.2.a"], course: "pre-algebra",
    sat: [], act: ["act.ies"], accuplacer: [], aleks: [] },
  "ch03#order": { ccss: "HSA.REI.B.3", also: ["7.EE.B.4.b", "6.EE.B.8"], course: "algebra-1",
    sat: ["sat.alg.ineq"], act: ["act.phm.alg"], accuplacer: ["qas.lineq", "aaf.lineq"], aleks: ["ppl.eqineq"] },
  "ch03#absolute": { ccss: "7.NS.A.1.c", approx: true, also: ["6.NS.C.7", "HSA.REI.B.3", "HSA.CED.A.1"], course: "algebra-1",
    sat: ["sat.adv.nleq"], act: ["act.phm.alg", "act.phm.nq"], accuplacer: ["qas.rat"], aleks: ["ppl.eqineq", "ppl.real"] },
  "ch03#powers": { ccss: "HSN.RN.A.2", also: ["HSN.RN.A.1", "8.EE.A.1", "8.EE.A.2"], course: "algebra-1",
    sat: ["sat.adv.equiv"], act: ["act.phm.nq"], accuplacer: ["qas.exp", "aaf.radrat"], aleks: ["ppl.rad", "ppl.exppoly"] },

  "ch04#square-roots": { ccss: "HSA.REI.B.4.b", also: ["8.EE.A.2", "HSA.SSE.B.3.a", "HSA.APR.B.3"], course: "algebra-1",
    sat: ["sat.adv.nleq"], act: ["act.phm.alg"], accuplacer: ["aaf.quad", "aaf.fact"], aleks: ["ppl.eqineq", "ppl.exppoly"] },
  "ch04#completing": { ccss: "HSA.SSE.B.3.b", also: ["HSA.REI.B.4.a", "HSF.IF.C.8.a"], course: "algebra-1",
    sat: ["sat.adv.equiv", "sat.adv.nleq"], act: ["act.phm.alg"], accuplacer: ["aaf.quad"], aleks: ["ppl.eqineq"] },
  "ch04#formula": { ccss: "HSA.REI.B.4.b", also: ["HSA.REI.B.4.a", "HSA.CED.A.1"], course: "algebra-1",
    sat: ["sat.adv.nleq"], act: ["act.phm.alg"], accuplacer: ["aaf.quad"], aleks: ["ppl.eqineq"] },
  "ch04#discriminant": { ccss: "HSA.REI.B.4.b", also: ["HSN.CN.C.7"], course: "algebra-1",
    sat: ["sat.adv.nleq"], act: ["act.phm.alg"], accuplacer: ["aaf.quad"], aleks: ["ppl.eqineq"] },
  "ch04#graph": { ccss: "HSF.IF.C.8.a", also: ["HSF.IF.C.7.a", "HSA.SSE.B.3.b"], course: "algebra-1",
    sat: ["sat.adv.nlf"], act: ["act.phm.fn"], accuplacer: ["aaf.fn", "aaf.quad"], aleks: ["ppl.linquad"] },

  "interlude#reading": { ccss: null, also: [], course: "algebra-1",  // Owner Q2: null, not an MP code
    sat: [], act: [], accuplacer: [], aleks: [] },
  "interlude#logic": { ccss: null, also: [], course: "geometry",  // Owner Q2: null, not an MP code
    sat: [], act: [], accuplacer: [], aleks: [] },
  "interlude#quantifiers": { ccss: null, also: [], course: "geometry",  // Owner Q2: null, not an MP code
    sat: [], act: [], accuplacer: [], aleks: [] },
  "interlude#sets": { ccss: "HSS.CP.A.1", approx: true, also: [], course: "geometry",
    sat: [], act: [], accuplacer: ["qas.prob"], aleks: [] },
  "interlude#notation": { ccss: null, also: [], course: "algebra-1",  // Owner Q2: null, not an MP code
    sat: [], act: [], accuplacer: [], aleks: [] },

  "ch05#distance": { ccss: "7.G.A.2", also: ["HSG.CO.A.1"], course: "pre-algebra",
    sat: ["sat.geo.lat"], act: ["act.phm.geo"], accuplacer: [], aleks: ["ppl.geotrig"] },
  "ch05#angles": { ccss: "7.G.B.5", also: ["HSG.CO.C.9", "HSG.CO.A.1"], course: "pre-algebra",
    sat: ["sat.geo.lat"], act: ["act.phm.geo"], accuplacer: ["aaf.geo.a2"], aleks: ["ppl.geotrig"] },
  "ch05#parallels": { ccss: "8.G.A.5", also: ["HSG.CO.C.9", "HSG.CO.C.10"], course: "pre-algebra",
    sat: ["sat.geo.lat"], act: ["act.phm.geo"], accuplacer: ["aaf.geo.a2"], aleks: ["ppl.geotrig"] },
  "ch05#pythagoras": { ccss: "8.G.B.7", also: ["8.G.B.6", "HSG.SRT.C.8"], course: "pre-algebra",
    sat: ["sat.geo.trig"], act: ["act.phm.geo"], accuplacer: ["qas.geo.a1", "aaf.geo.a1"], aleks: ["ppl.geotrig"] },

  "ch06#mappings-plane": { ccss: "8.G.A.3", also: ["HSG.CO.A.2", "HSG.CO.A.5", "8.G.A.1"], course: "pre-algebra",
    sat: [], act: ["act.phm.geo"], accuplacer: ["qas.geo.a1", "aaf.geo.a1"], aleks: ["ppl.geotrig"] },
  "ch06#isometries": { ccss: "HSG.CO.A.2", also: ["HSG.CO.B.6", "HSG.CO.A.5", "8.G.A.2"], course: "geometry",
    sat: [], act: ["act.phm.geo"], accuplacer: ["qas.geo.a1", "aaf.geo.a1"], aleks: ["ppl.geotrig"] },
  "ch06#symmetry": { ccss: "HSG.CO.A.3", also: ["HSG.CO.A.5"], course: "geometry",
    sat: [], act: ["act.phm.geo"], accuplacer: [], aleks: [] },

  "ch07#polygons": { ccss: "6.G.A.1", also: ["7.G.B.6", "8.G.B.7"], course: "pre-algebra",
    sat: ["sat.geo.area"], act: ["act.ies"], accuplacer: ["qas.geo.pa"], aleks: ["ppl.geotrig"] },
  "ch07#scaling": { ccss: "7.G.A.1", also: ["HSG.SRT.A.1", "8.G.A.4"], course: "pre-algebra",
    sat: ["sat.geo.area"], act: ["act.ies"], accuplacer: ["qas.geo.a1", "aaf.geo.a1"], aleks: ["ppl.geotrig"] },
  "ch07#disc": { ccss: "7.G.B.4", also: ["HSG.GMD.A.1"], course: "pre-algebra",
    sat: ["sat.geo.area"], act: ["act.ies"], accuplacer: ["qas.geo.pa"], aleks: ["ppl.geotrig"] },
  "ch07#circumference": { ccss: "7.G.B.4", also: ["HSG.C.A.1", "HSG.GMD.A.1"], course: "pre-algebra",
    sat: ["sat.geo.circ"], act: ["act.ies"], accuplacer: ["qas.geo.pa"], aleks: ["ppl.geotrig"] },

  "ch08#coord-systems": { ccss: "6.NS.C.6.b", also: ["6.NS.C.6.c", "6.NS.C.8"], course: "pre-algebra",
    sat: [], act: ["act.ies"], accuplacer: [], aleks: ["ppl.linquad"] },
  "ch08#distance-formula": { ccss: "8.G.B.8", also: ["8.G.B.7", "HSG.GPE.B.4"], course: "pre-algebra",
    sat: ["sat.geo.trig"], act: ["act.phm.geo"], accuplacer: ["qas.geo.a1", "aaf.geo.a1"], aleks: ["ppl.geotrig"] },
  "ch08#circle": { ccss: "HSG.GPE.A.1", also: ["HSG.GPE.B.4", "HSG.GMD.B.4"], course: "geometry",
    sat: ["sat.geo.circ"], act: ["act.phm.geo"], accuplacer: ["aaf.geo.a2"], aleks: ["ppl.geotrig"] },
  "ch08#rational-points": { ccss: "HSA.APR.C.4", approx: true, also: ["HSA.REI.C.7", "HSG.GPE.A.1"], course: "algebra-2",
    sat: ["sat.adv.nleq"], act: ["act.phm.alg"], accuplacer: ["aaf.quad"], aleks: [] },

  "ch09#dilations": { ccss: "8.G.A.3", also: ["HSN.VM.B.5", "HSG.SRT.A.1"], course: "pre-algebra",
    sat: [], act: ["act.phm.geo"], accuplacer: ["qas.geo.a1", "aaf.geo.a1"], aleks: ["ppl.geotrig"] },
  "ch09#addition-points": { ccss: "HSG.GPE.B.6", also: ["HSN.VM.B.4.a", "HSG.GPE.B.4", "8.G.A.3"], course: "geometry",
    sat: [], act: ["act.phm.geo", "act.phm.nq"], accuplacer: ["qas.geo.a1", "aaf.geo.a1"], aleks: ["ppl.geotrig"] },
  "ch09#subtraction": { ccss: "8.G.A.3", approx: true, also: ["HSN.VM.A.2", "HSN.VM.A.1", "HSN.VM.B.4", "8.G.B.8", "HSG.GPE.B.6", "HSG.GPE.B.4"], course: "pre-algebra",  // Owner Q3: course by tested work, lower grade wins a tie
    sat: [], act: ["act.phm.nq", "act.phm.geo"], accuplacer: ["qas.geo.a1", "aaf.geo.a1"], aleks: ["ppl.geotrig"] },

  "ch10#segments": { ccss: "HSG.GPE.B.6", also: [], course: "geometry",
    sat: [], act: ["act.phm.geo"], accuplacer: [], aleks: ["ppl.geotrig"] },
  "ch10#rays": { ccss: "8.G.A.3", approx: true, also: ["HSN.VM.B.5.b", "HSG.GPE.B.6", "HSG.CO.A.1"], course: "pre-algebra",  // Owner Q3: course by tested work, lower grade wins a tie
    sat: [], act: ["act.phm.geo"], accuplacer: ["qas.geo.a1", "aaf.geo.a1"], aleks: ["ppl.geotrig"] },
  "ch10#lines": { ccss: "HSG.GPE.B.5", also: ["8.EE.B.6", "8.F.A.3"], course: "geometry",
    sat: ["sat.alg.lin2"], act: ["act.phm.alg"], accuplacer: ["qas.linapp", "aaf.linapp"], aleks: ["ppl.linquad"] },
  "ch10#line-equation": { ccss: "8.F.B.4", also: ["HSF.LE.A.2", "HSG.GPE.B.5", "HSA.REI.C.6", "HSA.REI.D.10", "8.EE.C.8.a"], course: "pre-algebra",  // Owner Q3: course by tested work, lower grade wins a tie
    sat: ["sat.alg.linf", "sat.alg.lin2", "sat.alg.sys"], act: ["act.phm.alg"], accuplacer: ["qas.linapp", "aaf.linapp", "qas.lineq", "aaf.lineq"], aleks: ["ppl.linquad", "ppl.eqineq"] },

  "ch11#radians": { ccss: "HSF.TF.A.1", also: ["HSG.C.B.5"], course: "algebra-2",
    sat: ["sat.geo.circ"], act: ["act.phm.geo"], accuplacer: ["aaf.trig"], aleks: ["ppl.geotrig"] },
  "ch11#sine-cosine": { ccss: "HSF.TF.A.2", also: ["HSF.TF.C.8", "HSF.TF.A.3", "HSG.SRT.C.6"], course: "algebra-2",
    sat: ["sat.geo.circ", "sat.geo.trig"], act: ["act.phm.geo"], accuplacer: ["aaf.trig"], aleks: ["ppl.geotrig"] },
  "ch11#graphs-trig": { ccss: "HSF.IF.C.7.e", also: ["HSF.TF.B.5", "HSF.TF.A.4", "HSF.BF.B.3"], course: "algebra-2",
    sat: [], act: ["act.phm.fn"], accuplacer: ["aaf.trig"], aleks: ["ppl.geotrig"] },
  "ch11#tangent": { ccss: "HSF.TF.A.2", also: ["HSF.TF.A.4", "HSG.SRT.C.6"], course: "algebra-2",
    sat: ["sat.geo.circ"], act: ["act.phm.geo"], accuplacer: ["aaf.trig"], aleks: ["ppl.geotrig"] },
  "ch11#addition-formulas": { ccss: "HSF.TF.C.9", also: [], course: "beyond",  // Owner Q1: beyond
    sat: [], act: ["act.phm.geo"], accuplacer: ["aaf.trig"], aleks: ["ppl.geotrig"] },
  "ch11#rotations": { ccss: "8.G.A.3", also: ["HSG.CO.A.2", "HSF.TF.C.9"], course: "pre-algebra",  // Owner Q3: course by tested work, lower grade wins a tie
    sat: [], act: ["act.phm.geo"], accuplacer: ["qas.geo.a1", "aaf.geo.a1"], aleks: ["ppl.geotrig"] },

  "ch12#definition-fn": { ccss: "HSF.IF.A.1", also: ["HSF.IF.A.2", "8.F.A.1"], course: "algebra-1",
    sat: ["sat.adv.nlf"], act: ["act.phm.fn"], accuplacer: ["aaf.fn", "aaf.radrat"], aleks: ["ppl.linquad"] },
  "ch12#polynomials": { ccss: "HSA.APR.B.2", also: ["HSA.APR.B.3"], course: "algebra-2",
    sat: ["sat.adv.nlf", "sat.adv.nleq"], act: ["act.phm.alg"], accuplacer: ["aaf.poly", "aaf.fact"], aleks: ["ppl.exppoly"] },
  "ch12#graphs-fn": { ccss: "HSF.BF.B.3", also: ["HSF.IF.A.1", "HSF.IF.C.7.a"], course: "algebra-1",
    sat: ["sat.adv.nlf"], act: ["act.phm.fn"], accuplacer: ["aaf.fn"], aleks: ["ppl.linquad"] },
  "ch12#exponential": { ccss: "HSF.LE.A.2", also: ["HSF.LE.A.3", "HSF.IF.C.8.b", "HSN.RN.A.1", "HSA.CED.A.1"], course: "algebra-1",
    sat: ["sat.adv.nleq", "sat.adv.nlf"], act: ["act.phm.alg", "act.phm.fn"], accuplacer: ["aaf.explog", "qas.exp"], aleks: ["ppl.explog"] },
  "ch12#log": { ccss: "HSF.LE.A.4", approx: true, also: ["HSF.BF.B.5", "HSF.IF.C.7.e"], course: "algebra-2",
    sat: [], act: ["act.phm.fn"], accuplacer: ["aaf.explog"], aleks: ["ppl.explog"] },

  "ch13#definition-map": { ccss: "HSF.IF.A.1", also: ["HSF.BF.B.4.d"], course: "algebra-1",
    sat: [], act: ["act.phm.fn"], accuplacer: ["aaf.fn"], aleks: ["ppl.linquad", "ppl.explog"] },
  "ch13#formalism": { ccss: "HSF.BF.B.4", also: ["HSF.BF.A.1.c", "HSF.BF.B.4.a"], course: "algebra-2",
    sat: [], act: ["act.phm.fn"], accuplacer: ["aaf.fn"], aleks: ["ppl.explog"] },
  "ch13#permutations": { ccss: "HSS.CP.B.9", approx: true, also: [], course: "beyond",  // Owner Q1: beyond
    sat: [], act: ["act.phm.sp"], accuplacer: [], aleks: [] },

  "ch14#complex-arith": { ccss: "HSN.CN.A.2", also: ["HSN.CN.A.1", "HSN.CN.A.3", "HSN.CN.C.7"], course: "algebra-2",
    sat: [], act: ["act.phm.nq"], accuplacer: [], aleks: [] },
  "ch14#complex-plane": { ccss: "HSN.CN.B.6", also: ["HSN.CN.B.4", "HSN.CN.A.3"], course: "beyond",  // Owner Q1: beyond
    sat: [], act: ["act.phm.nq"], accuplacer: [], aleks: [] },
  "ch14#polar": { ccss: "HSN.CN.B.5", also: ["HSN.CN.B.4"], course: "beyond",  // Owner Q1: beyond
    sat: [], act: ["act.phm.nq"], accuplacer: [], aleks: [] },

  "ch15#induction": { ccss: "HSA.APR.C.4", approx: true, also: [], course: "beyond",  // Owner Q1: beyond
    sat: [], act: [], accuplacer: [], aleks: [] },
  "ch15#summations": { ccss: null, also: ["HSF.BF.A.2", "HSA.SSE.A.2"], course: "algebra-2",  // Owner Q2: null, not an MP code
    sat: [], act: ["act.phm.fn"], accuplacer: [], aleks: [] },
  "ch15#geometric": { ccss: "HSA.SSE.B.4", also: ["HSF.BF.A.2", "HSF.LE.A.2"], course: "algebra-2",
    sat: [], act: ["act.phm.fn"], accuplacer: [], aleks: [] },

  "ch16#matrices": { ccss: "HSA.REI.C.8", also: ["HSN.VM.C.6"], course: "beyond",  // Owner Q1: beyond
    sat: [], act: ["act.phm.nq"], accuplacer: [], aleks: [] },
  "ch16#det2": { ccss: "HSN.VM.C.12", also: ["HSN.VM.C.10"], course: "beyond",  // Owner Q1: beyond
    sat: [], act: ["act.phm.nq"], accuplacer: [], aleks: [] },
  "ch16#det3": { ccss: "HSN.VM.C.10", approx: true, also: ["HSN.VM.C.12", "HSA.REI.C.9"], course: "beyond",  // Owner Q1: beyond
    sat: [], act: ["act.phm.nq"], accuplacer: [], aleks: [] },
  "ch16#det-props": { ccss: "HSN.VM.C.10", approx: true, also: ["HSN.VM.C.12"], course: "beyond",  // Owner Q1: beyond
    sat: [], act: ["act.phm.nq"], accuplacer: [], aleks: [] },
  "ch16#cramer": { ccss: "8.EE.C.8.b", also: ["HSA.REI.C.6", "HSA.REI.C.8", "HSN.VM.C.10"], course: "pre-algebra",  // Owner Q3: course by tested work, lower grade wins a tie
    sat: ["sat.alg.sys"], act: ["act.phm.alg"], accuplacer: ["qas.lineq", "aaf.lineq"], aleks: ["ppl.eqineq"] },
};

/** Generators (data/gen/*.js, by id) whose test differs from their section's record. */
export const GENERATOR_SKILLS: Readonly<Record<string, Override>> = {
  "int-product": { sat: [], act: ["act.ies"], accuplacer: ["qas.rat"], aleks: ["ppl.real"] },
  "pow-laws": { ccss: "8.EE.A.1", course: "pre-algebra", sat: [], accuplacer: ["qas.exp"], aleks: ["ppl.exppoly"] },
  "compose-motions": { ccss: "8.G.A.3", course: "pre-algebra" },
  "trig-exact": { ccss: "HSF.TF.A.3", course: "beyond" },  // Owner Q1: beyond
  "poly-eval": { ccss: "HSF.IF.A.2" },
  "exp-solve": { ccss: "HSA.CED.A.1", approx: true },
  "compose-fn": { ccss: "HSF.BF.A.1.c", course: "beyond" },  // Owner Q1: beyond
  "perm-compose": { act: [] },
  "cx-divide": { ccss: "HSN.CN.A.3", course: "beyond" },  // Owner Q1: beyond
  "geo-infinite": { approx: true },
};

/** A section's record; null for a container or an unknown ref. */
export function skillOf(ref: SectionRef): Skill | null {
  return Object.hasOwn(SKILLS, ref) ? SKILLS[ref] : null;
}

/** An override laid over a section's record. Pure: reads only its two arguments.
    Tags and course are the override's where it gives them. An override `ccss` that differs
    from the section's becomes primary; `also` is then the section's old primary (when not
    null) and its `also`, without the new code and without duplicates, and `approx` is the
    override's own (a section's approx never carries to a code it did not describe). An
    override that sets only `approx` marks the inherited code. */
export function resolveOverride(section: Skill, o: Override): Skill {
  let ccss = section.ccss;
  let also: readonly string[] = section.also;
  let approx = section.approx;
  if (o.ccss !== undefined && o.ccss !== section.ccss) {
    const next = o.ccss;
    ccss = next;
    also = [...new Set([section.ccss, ...section.also])].filter((c): c is string => c !== null && c !== next);
    approx = o.approx;
  } else if (o.approx !== undefined) {
    approx = o.approx;
  }
  return {
    ccss, ...(approx ? { approx: true as const } : {}), also, course: o.course ?? section.course,
    sat: o.sat ?? section.sat, act: o.act ?? section.act,
    accuplacer: o.accuplacer ?? section.accuplacer, aleks: o.aleks ?? section.aleks
  };
}

/** A generator's record: its section's, with its override (if any) laid over it; null when
    the section has no record (a container or an unknown ref). */
export function generatorSkill(id: string, section: SectionRef): Skill | null {
  const s = skillOf(section);
  if (!s) return null;
  return resolveOverride(s, Object.hasOwn(GENERATOR_SKILLS, id) ? GENERATOR_SKILLS[id] : {});
}

/** A family's tags, in order: qas and aaf are Accuplacer's list filtered by prefix. */
export function tagsIn(s: Skill, f: Family): readonly string[] {
  if (f === "qas" || f === "aaf") return s.accuplacer.filter((t) => t.startsWith(f + "."));
  return s[f];
}

/** The reporting domain for a family: its first tag, skipping act.mod for ACT; for SAT the
    domain prefix ("sat.alg"). null when the family has no tag. */
export function reportDomain(s: Skill, f: Family): string | null {
  const tags = tagsIn(s, f).filter((t) => f !== "act" || t !== "act.mod");
  if (!tags.length) return null;
  return f === "sat" ? tags[0].split(".").slice(0, 2).join(".") : tags[0];
}

/** The refs of `order` that have a record, grouped by course, in the order given. */
export function byCourse(order: readonly SectionRef[]): Record<Course, SectionRef[]> {
  const out = Object.fromEntries(COURSES.map((c) => [c, [] as SectionRef[]])) as Record<Course, SectionRef[]>;
  order.forEach((ref) => {
    const s = skillOf(ref);
    if (s) out[s.course].push(ref);
  });
  return out;
}

/** The thecorestandards.org page of a code's domain: "8.EE.C.7.b" gives
    https://www.thecorestandards.org/Math/Content/8/EE/, "HSA.REI.B.4.b" .../Math/Content/HSA/REI/. */
export function standardPage(code: string): string {
  const [a, b] = code.split(".");
  return "https://www.thecorestandards.org/Math/Content/" + a + "/" + b + "/";
}
