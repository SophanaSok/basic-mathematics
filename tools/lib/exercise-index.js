"use strict";
/* The exercise index: one entry per exercise on the chapter pages, in EXERCISE_KEYS order,
   holding what the connector's tools hand out (question, kind, choices, clues, the grading
   spec) and never the worked solution: the question is read from .ex-q alone.
   Mirrors assets/site.js initExercises (type, hints, tol, kind) and sectionOf; the key and
   kind rules are tools/lib/keys.js exercisesOf. Pure: it only reads the pages under `root`. */

const site = require("./site");
const { normText } = require("./html");
const { exercisesOf } = require("./keys");

/* assets/site.js sectionOf: data-section, else for an inline exercise the nearest earlier
   h2[id] among main's children ("warmup" inside the warm-up block), else "" */
function sectionOf(el, inline) {
  const tagged = el.getAttribute("data-section");
  if (tagged) return tagged;
  if (!inline) return "";
  let top = el;
  while (top.parent && top.parent.name !== "main") top = top.parent;
  if (!top.parent) return "";
  if (top.id === "warmup") return "warmup";
  const sibs = top.parent.children.filter((c) => c.type === "element");
  for (let i = sibs.indexOf(top) - 1; i >= 0; i--) {
    if (sibs[i].name === "h2" && sibs[i].id) return sibs[i].id;
  }
  return "";
}

const texts = (list) => list.map((li) => normText(li.textContent));

/* true when the node sits inside the worked solution */
function inSolution(node) {
  for (let n = node.parent; n; n = n.parent) if (n.type === "element" && n.hasClass("ex-solution")) return true;
  return false;
}

/* Exercises whose question refers to something on the page outside .ex-q (a table of an
   earlier example, a layered picture), so the text alone misleads; they count as visual:
   the tools say "see this one on the page". Hand-picked (CN-4 review); check it when a
   page changes. */
const REFERS_TO_PAGE = ["ch11/t3", "pk-chance/t7", "pk-data/t6", "pk-growth/e2", "pk-growth/e6"];

/* the question's text: each blank shown as ___ so a reader knows where the blanks are,
   a table's cells set apart by | and its rows by ; so they do not run together, and
   the raw-text elements (script, style, svg title) left out */
const RAW = { script: 1, style: 1, title: 1, textarea: 1 };
function questionText(node) {
  if (node.type === "text") return node.text;
  if (node.type !== "element" && node.type !== "document") return "";
  if (node.type === "element") {
    if (node.hasClass("blank")) return " ___ ";
    if (RAW[node.name]) return "";
  }
  let s = "";
  for (const c of node.children) {
    s += questionText(c);
    if (c.type === "element" && (c.name === "td" || c.name === "th")) s += " | ";
    if (c.type === "element" && c.name === "tr") s += " ; ";
  }
  return s;
}

/* @param {object} ex  an exercisesOf() record, @returns the index entry */
function entryOf(ex, chapter, section) {
  const el = ex.el;
  const q = el.query(".ex-q");
  const choicesEl = el.query("ul.choices, ol.choices");
  const choices = choicesEl ? texts(choicesEl.queryAll("li")) : [];
  // site.js takes the first ol.order/ul.order; here one in the solution is passed over
  const orderEl = ex.kind === "order" ? el.queryAll("ol.order, ul.order").filter((o) => !inSolution(o))[0] : null;
  const items = orderEl ? texts(orderEl.queryAll("li")) : [];
  // the blanks of the question (site.js: .ex-q .blank); a blank's type defaults to number, as the browser's does
  const blanks = ex.kind === "blank" && q
    ? q.queryAll(".blank").map((b) => ({ answer: b.getAttribute("data-answer"), type: b.getAttribute("data-type") || "number" }))
    : [];
  const clues = ["data-hint", "data-hint2", "data-hint3"].map((a) => el.getAttribute(a) || "").filter(Boolean);
  const ref = chapter + "/" + ex.key;
  const visual = ex.kind === "figure" || REFERS_TO_PAGE.indexOf(ref) !== -1 ||
    (!!q && q.queryAll("svg, img, canvas, .widget, [data-figure]").length > 0);
  return {
    ref, chapter, key: ex.key, section,
    inline: ex.inline, kind: ex.kind, type: ex.type,
    question: q ? normText(questionText(q)) : "",
    choices, blanks, items,
    answer: ex.answer,
    compare: ex.kind === "figure" ? (el.getAttribute("data-compare") || "exact") : null,   // site.js: exact when unset
    tol: parseFloat(el.getAttribute("data-tol") || "") || 0,
    clues, visual, line: ex.line
  };
}

/* every exercise of one parsed page */
function pageEntries(doc, chapter) {
  return exercisesOf(doc).map((ex) => entryOf(ex, chapter, sectionOf(ex.el, ex.inline)));
}

/* the pages in tools/gen-exercise-keys.js order, so refs match EXERCISE_KEYS */
function indexOf(root = site.ROOT) {
  const out = [];
  site.htmlPages(root).forEach((p) => {
    const doc = site.readPage(root, p).doc;
    const chapter = site.chapterIdOf(doc);
    if (!chapter) return;
    pageEntries(doc, chapter).forEach((e) => out.push(e));
  });
  return out;
}

module.exports = { indexOf, entryOf, pageEntries, sectionOf, REFERS_TO_PAGE };
