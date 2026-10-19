#!/usr/bin/env node
/* Per-chapter facts for the contents list: sections, scored and inline exercises, a reading
   time and the "by the end" goal, as src/data/chapter-meta.ts. Generators own their output:
   change this file and re-run it, never edit the .ts. src/data/chapter-meta.test.ts fails when
   the file differs from render(build()).
   Usage: node tools/gen-chapter-meta.js [--check] */
"use strict";
const fs = require("fs");
const path = require("path");
const site = require("./lib/site");
const { normText } = require("./lib/html");
const { exercisesOf } = require("./lib/keys");

const FILE = path.join(site.ROOT, "src/data/chapter-meta.ts");

/* prose words under <main>: no exercise cards, scripts, styles or math source */
function wordsOf(main) {
  let s = "";
  (function walk(n) {
    for (const c of n.children) {
      if (c.type === "text") s += c.text + " ";
      else if (c.type === "element") {
        if (c.name === "script" || c.name === "style" || c.hasClass("ex")) continue;
        if (c.hasClass("katex") || c.hasClass("katex-display")) continue;
        walk(c);
      }
    }
  })(main);
  s = s.replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/\$[^$]*\$/g, " ")
    .replace(/\\\([\s\S]*?\\\)/g, " ").replace(/\\\[[\s\S]*?\\\]/g, " ");
  s = normText(s);
  return s ? s.split(" ").filter((w) => /[A-Za-z0-9]/.test(w)).length : 0;
}

function goalOf(doc) {
  const g = doc.queryAll("div.goal")[0];
  if (!g) return "";
  let s = "";
  for (const c of g.children) {
    if (c.type === "element" && c.name === "strong" && !s.trim()) continue;
    s += c.type === "text" ? c.text : c.textContent;
  }
  return normText(s);
}

function build() {
  const C = site.curriculum(site.ROOT);
  const out = {};
  site.htmlPages(site.ROOT).forEach((p) => {
    if (!p.startsWith("parts/")) return;
    const doc = site.readPage(site.ROOT, p).doc;
    const id = site.chapterIdOf(doc);
    if (!id) return;
    const ex = exercisesOf(doc);
    const scored = ex.filter((e) => !e.inline).length, inline = ex.length - scored;
    const ch = C.chapterById(id);
    const main = doc.query("main");
    const sections = ch && ch.sections ? ch.sections.length : doc.queryAll("section").length;
    const words = main ? wordsOf(main) : 0;
    const minutes = Math.max(10, Math.round((words / 200 + scored * 2 + inline * 1) / 5) * 5);
    out[id] = { sections, scored, inline, words, minutes, goal: goalOf(doc) };
  });
  return out;
}

const HEAD = `/* Facts about each chapter, interlude and pack, for the contents list's cards.

   Written by tools/gen-chapter-meta.js from the pages and data/curriculum.js, never by hand.
   src/data/chapter-meta.test.ts fails when this file is not what the generator would
   write; the fix is \`npm run gen:chapter-meta\`. */

export interface ChapterMeta {
  sections: number;
  scored: number;
  inline: number;
  words: number;
  minutes: number;
  goal: string;
}

export const CHAPTER_META: Record<string, ChapterMeta> = `;

function render(meta) {
  const sorted = {};
  Object.keys(meta).sort().forEach((k) => { sorted[k] = meta[k]; });
  return HEAD + JSON.stringify(sorted, null, 2) + ";\n";
}

function main() {
  const meta = build(), text = render(meta);
  if (process.argv.includes("--check")) {
    const have = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : "";
    if (have !== text) {
      const a = have.split("\n"), b = text.split("\n");
      let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
      console.error("src/data/chapter-meta.ts is stale: run npm run gen:chapter-meta (first difference at line " + (i + 1) + ")");
      process.exit(1);
    }
    console.log("chapter-meta.ts is current");
    return;
  }
  fs.writeFileSync(FILE, text);
  console.log("wrote src/data/chapter-meta.ts (" + Object.keys(meta).length + " pages)");
}

if (require.main === module) main();
module.exports = { build, render, FILE };
