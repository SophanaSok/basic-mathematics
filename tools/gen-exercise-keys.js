#!/usr/bin/env node
/* Every exercise the site has, as "chapter/key" refs: src/data/exercise-keys.ts. The author's
   table (assets/insights.js) leaves out statistics rows whose exercise is no longer on any
   page. Generators own their output: change this file and re-run it, never edit the .ts.
   src/data/exercise-keys.test.ts fails when the file differs from render(build()).
   Usage: node tools/gen-exercise-keys.js [--check]
   build() is the list, in the pages' order and each page's document order; render(list) is
   the file's text. */
"use strict";
const fs = require("fs");
const path = require("path");
const site = require("./lib/site");
const { exercisesOf } = require("./lib/keys");

const FILE = path.join(site.ROOT, "src/data/exercise-keys.ts");

function pageKeys() {
  const out = [];
  site.htmlPages(site.ROOT).forEach((p) => {
    const doc = site.readPage(site.ROOT, p).doc;
    const chapter = site.chapterIdOf(doc);
    if (!chapter) return;
    out.push(exercisesOf(doc).map((e) => chapter + "/" + e.key));
  });
  return out;
}

function build() { return [].concat.apply([], pageKeys()); }

const HEAD = `/* Every exercise on the site as "chapter/key", the shape of the chapter and ex_key columns of
   exercise_stats() joined by a slash (and of the event log's refs).

   Written by tools/gen-exercise-keys.js from the chapter pages, never by hand.
   src/data/exercise-keys.test.ts fails when this file is not what the generator would
   write; the fix is \`npm run gen:exercise-keys\`. */

export const EXERCISE_KEYS: readonly string[] = [
`;

function render(list) {
  // one page per line: rebuild the grouping from the page list when given the full list
  const groups = pageKeys();
  const flat = [].concat.apply([], groups);
  const lines = flat.length === list.length && flat.every((k, i) => k === list[i])
    ? groups.filter((g) => g.length).map((g) => "  " + g.map((k) => JSON.stringify(k)).join(", ") + ",")
    : [list.map((k) => JSON.stringify(k)).join(", ")];
  return HEAD + lines.join("\n") + "\n];\n";
}

function main() {
  const text = render(build());
  if (process.argv.includes("--check")) {
    const have = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : "";
    if (have !== text) {
      const a = have.split("\n"), b = text.split("\n");
      let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
      console.error("src/data/exercise-keys.ts is stale: run npm run gen:exercise-keys (first difference at line " + (i + 1) + ")");
      process.exit(1);
    }
    console.log("exercise-keys.ts is current");
    return;
  }
  fs.writeFileSync(FILE, text);
  console.log("wrote src/data/exercise-keys.ts (" + build().length + " keys)");
}

if (require.main === module) main();
module.exports = { build, render, FILE };
