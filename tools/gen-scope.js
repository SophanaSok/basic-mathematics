#!/usr/bin/env node
/* The scope-and-sequence page: scope.html, written from data/curriculum.js (sections, their
   summaries, the skill packs) and src/data/skills.ts (each section's course band, Common Core
   code and exam tags). Generators own their output: change this file and re-run it, never
   edit scope.html. check-static `scope` fails when the file differs from render()'s output.
   Usage: node tools/gen-scope.js [--check]
   render({ curriculum, skills }) is pure: the same records give the same bytes. */
"use strict";
const fs = require("fs");
const path = require("path");
const site = require("./lib/site");

const ROOT = site.ROOT;
const FILE = path.join(ROOT, "scope.html");
const STALE = "scope.html is stale: run node tools/gen-scope.js";

/* what a page calls each exam tag; a tag in skills.ts with no label here, or a label for no tag, throws */
const TAG_LABELS = {
  "sat.alg.lin1": "Linear equations in one variable",
  "sat.alg.lin2": "Linear equations in two variables",
  "sat.alg.linf": "Linear functions",
  "sat.alg.sys": "Systems of two linear equations",
  "sat.alg.ineq": "Linear inequalities",
  "sat.adv.equiv": "Equivalent expressions",
  "sat.adv.nleq": "Nonlinear equations and systems",
  "sat.adv.nlf": "Nonlinear functions",
  "sat.psda.ratio": "Ratios, rates, proportions and units",
  "sat.psda.pct": "Percentages",
  "sat.psda.data1": "One-variable data: distributions and measures",
  "sat.psda.data2": "Two-variable data: models and scatterplots",
  "sat.psda.prob": "Probability and conditional probability",
  "sat.psda.infer": "Inference from sample statistics and margin of error",
  "sat.psda.claims": "Evaluating statistical claims",
  "sat.geo.area": "Area and volume",
  "sat.geo.lat": "Lines, angles and triangles",
  "sat.geo.trig": "Right triangles and trigonometry",
  "sat.geo.circ": "Circles",
  "act.phm.nq": "Number and quantity",
  "act.phm.alg": "Algebra",
  "act.phm.fn": "Functions",
  "act.phm.geo": "Geometry",
  "act.phm.sp": "Statistics and probability",
  "act.ies": "Integrating essential skills",
  "act.mod": "Modeling",
  "qas.rat": "Rational numbers",
  "qas.ratio": "Ratio and proportional relationships",
  "qas.exp": "Exponents",
  "qas.expr": "Algebraic expressions",
  "qas.lineq": "Linear equations",
  "qas.linapp": "Linear applications and graphs",
  "qas.prob": "Probability sets",
  "qas.stats": "Descriptive statistics",
  "qas.geo.pa": "Geometry concepts for pre-algebra",
  "qas.geo.a1": "Geometry concepts for algebra 1",
  "aaf.lineq": "Linear equations",
  "aaf.linapp": "Linear applications and graphs",
  "aaf.fact": "Factoring",
  "aaf.quad": "Quadratics",
  "aaf.fn": "Functions",
  "aaf.radrat": "Radical and rational equations",
  "aaf.poly": "Polynomial equations",
  "aaf.explog": "Exponential and logarithmic equations",
  "aaf.geo.a1": "Geometry concepts for algebra 1",
  "aaf.geo.a2": "Geometry concepts for algebra 2",
  "aaf.trig": "Trigonometry",
  "ppl.real": "Real numbers",
  "ppl.eqineq": "Equations and inequalities",
  "ppl.linquad": "Linear and quadratic functions",
  "ppl.exppoly": "Exponents and polynomials",
  "ppl.ratexpr": "Rational expressions",
  "ppl.rad": "Radical expressions",
  "ppl.explog": "Exponentials and logarithms",
  "ppl.geotrig": "Geometry and trigonometry"
};

/* the exam columns, in order: the family key skills.ts tagsIn() takes, its column title, its name in prose */
const FAMILIES = [
  { key: "sat", th: "SAT", name: "SAT" },
  { key: "act", th: "ACT", name: "ACT" },
  { key: "qas", th: "Accuplacer QAS", name: "Accuplacer QAS" },
  { key: "aaf", th: "Accuplacer AAF", name: "Accuplacer AAF" },
  { key: "aleks", th: "ALEKS PPL", name: "ALEKS PPL" }
];
const FAMILY_OF_PREFIX = { sat: "SAT", act: "ACT", qas: "Accuplacer", aaf: "Accuplacer", ppl: "ALEKS PPL" };
const NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function label(tag) {
  if (!Object.prototype.hasOwnProperty.call(TAG_LABELS, tag)) throw new Error("gen-scope: exam tag " + tag + " has no label in TAG_LABELS");
  return TAG_LABELS[tag];
}
function checkLabels(sk) {
  const tags = [].concat(sk.SAT_TAGS, sk.ACT_TAGS, sk.ACCUPLACER_TAGS, sk.ALEKS_TAGS);
  tags.forEach(label);
  Object.keys(TAG_LABELS).forEach(t => {
    if (tags.indexOf(t) < 0) throw new Error("gen-scope: TAG_LABELS has a label for " + t + ", which is in no tag list of skills.ts");
  });
}

function chapterHref(ch, id) { return "parts/" + ch.part.dir + "/" + ch.file + "#" + id; }
function chapterCell(ch) {
  if (ch.part.beside) return "Pack " + ch.label + " · " + ch.title;
  return (/^\d+$/.test(ch.label) ? "Chapter " + ch.label : ch.label) + " · " + ch.title;
}

function coverage(ctx, rows) {
  const sk = ctx.skills;
  const refs = Object.keys(sk.SKILLS);
  const tags = [].concat(sk.SAT_TAGS, sk.ACT_TAGS, sk.ACCUPLACER_TAGS, sk.ALEKS_TAGS);
  const carried = t => refs.filter(ref => [].concat(sk.SKILLS[ref].sat, sk.SKILLS[ref].act, sk.SKILLS[ref].accuplacer, sk.SKILLS[ref].aleks).indexOf(t) >= 0).length;
  const counts = tags.map(carried);
  const many = counts.filter(n => n >= 2).length;
  const nChapters = ctx.curriculum.courseChapters.length, nPacks = ctx.curriculum.chapters.length - nChapters;
  const inPacks = rows.filter(r => r.ch.part.beside).length;
  const out = [];
  out.push("The course has " + rows.length + " sections with exercises: " + (rows.length - inPacks) + " in its " + nChapters + " chapters and " + inPacks + " in its " + nPacks +
    " skill packs. Of the " + tags.length + " exam topics the page tracks, " + many + " are taught in two or more sections.");
  const single = Object.keys(sk.SINGLE_SECTION_TAGS);
  if (single.length) {
    const fams = Array.from(new Set(single.map(t => FAMILY_OF_PREFIX[t.split(".")[0]])));
    const what = fams.length === 1 ? fams[0] + " topic" + (single.length === 1 ? " is" : "s are") : "exam topic" + (single.length === 1 ? " is" : "s are");
    const word = single.length < NUMBER_WORDS.length ? NUMBER_WORDS[single.length] : String(single.length);
    out[0] += " " + word + " " + what + " taught in one section" + (single.length === 1 ? "" : " each") + ": " +
      single.map(t => label(t) + " (" + sk.SINGLE_SECTION_TAGS[t] + ")").join("; ") + ".";
  }
  const missing = [];
  FAMILIES.forEach(f => {
    const list = tags.filter((t, i) => counts[i] === 0 && (f.key === "aleks" ? t.startsWith("ppl.") : t.startsWith(f.key + ".")));
    if (list.length) missing.push("The course does not carry these " + f.name + " topics: " + list.map(label).join("; ") + ".");
  });
  return { text: esc(out[0]), extra: missing.map(esc) };
}

function render(ctx) {
  const C = ctx.curriculum, sk = ctx.skills;
  checkLabels(sk);
  const ordered = C.courseChapters.concat(C.chapters.filter(ch => ch.part.beside));
  const where = {}, refs = [];
  ordered.forEach(ch => ch.sections.forEach(s => { const ref = ch.id + "#" + s.id; where[ref] = { ch, s }; refs.push(ref); }));
  /* the records are read from ctx.skills.SKILLS itself, so a fixture's records are the ones used */
  const skillOf = ref => (Object.prototype.hasOwnProperty.call(sk.SKILLS, ref) ? sk.SKILLS[ref] : null);
  const rowsAll = refs.filter(ref => skillOf(ref) !== null).map(ref => ({ ref, ch: where[ref].ch, s: where[ref].s }));
  const bands = {};
  sk.COURSES.forEach(c => { bands[c] = refs.filter(ref => skillOf(ref) !== null && skillOf(ref).course === c); });
  const cov = coverage(ctx, rowsAll);

  const L = [];
  L.push("<!doctype html>", '<html lang="en">', "<head>", "<!--bm:head-->",
    "<title>What the course covers — Basic Mathematics</title>",
    '<meta name="description" content="Every section of the course and its skill packs by course, with the Common Core standard and the SAT, ACT, Accuplacer and ALEKS topics each one covers.">',
    "</head>", '<body data-depth="0" data-page="page" data-nav="about">', "<!--bm:topbar-->", "",
    '<div class="wrap">', '  <main id="main">', "    <h1>What the course covers</h1>",
    "    <p>This page lists every section of the course and of its skill packs, grouped by the course each is taught in, with what the section teaches, the Common Core standard that describes its work, and the parts of the SAT, the ACT, the Accuplacer and the ALEKS placement test that test it. The course follows Serge Lang's <cite>Basic Mathematics</cite> and assumes a learner ready to start algebra; the skill packs add the pre-algebra skills the gate exams ask for that the book leaves out. It is generated from the course's own records, so it is as current as the course.</p>",
    "    <p>" + cov.text + "</p>");
  cov.extra.forEach(t => L.push("    <p>" + t + "</p>"));
  const cols = ["Section", "Chapter", "What it teaches", "Common Core"].concat(FAMILIES.map(f => f.th));
  sk.COURSES.forEach(course => {
    const name = sk.COURSE_LABELS[course];
    L.push("", "    <h2>" + esc(name) + "</h2>");
    if (!bands[course].length) { L.push("    <p>No section is taught in this course.</p>"); return; }
    L.push('    <table class="scope">', "      <caption>Sections taught in " + esc(name) + "</caption>", "      <thead>",
      "        <tr>" + cols.map(c => '<th scope="col">' + esc(c) + "</th>").join("") + "</tr>", "      </thead>", "      <tbody>");
    bands[course].forEach(ref => {
      const { ch, s } = where[ref], k = skillOf(ref);
      let cc;
      if (k.ccss === null) cc = "Reasoning (no content standard)";
      else {
        cc = (k.approx ? "≈ " : "") + '<a href="' + esc(sk.standardPage(k.ccss)) + '">' + esc(k.ccss) + "</a>";
        if (k.also.length) cc += ' <span class="fine">also ' + esc(k.also.join(", ")) + "</span>";
      }
      const cells = [
        ["Section", '<a href="' + esc(chapterHref(ch, s.id)) + '">' + esc(s.title) + "</a>"],
        ["Chapter", esc(chapterCell(ch))],
        ["What it teaches", esc(s.summary)],
        ["Common Core", cc]
      ].concat(FAMILIES.map(f => {
        const t = sk.tagsIn(k, f.key);
        return [f.th, t.length ? esc(t.map(label).join("; ")) : "—"];
      }));
      L.push("        <tr>" + cells.map(c => '<td data-th="' + esc(c[0]) + '">' + c[1] + "</td>").join("") + "</tr>");
    });
    L.push("      </tbody>", "    </table>");
  });
  const reviews = sk.CONTAINERS.filter(ref => where[ref]);
  if (reviews.length) {
    L.push("", "    <h2>Mixed review</h2>",
      "    <p>These sections hold no exercises of their own: each problem in them is credited to the section it draws on.</p>", "    <ul>");
    reviews.forEach(ref => L.push('      <li><a href="' + esc(chapterHref(where[ref].ch, where[ref].s.id)) + '">' + esc(chapterCell(where[ref].ch)) + "</a></li>"));
    L.push("    </ul>");
  }
  L.push("", '    <p class="fine">Common Core codes link to the standard\'s domain page at thecorestandards.org. Exam topics follow the published test specifications: the SAT Suite domains and testing points, the ACT reporting categories, the Accuplacer QAS and AAF content areas, and the ALEKS PPL topic areas.</p>',
    "  </main>", "</div>", "");
  return L.join("\n");
}

function load() {
  return { curriculum: site.curriculum(ROOT), skills: require(path.join(ROOT, "src/data/skills.ts")) };
}

function main() {
  const html = render(load());
  if (process.argv.includes("--check")) {
    const have = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : null;
    if (have !== html) { console.error(STALE); process.exit(1); }
    console.log("scope.html is current");
    return;
  }
  fs.writeFileSync(FILE, html);
  console.log("wrote scope.html");
}

if (require.main === module) main();
module.exports = { render, load, TAG_LABELS, STALE, FILE };
