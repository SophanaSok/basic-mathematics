#!/usr/bin/env node
"use strict";
/* Give every scored exercise that has no id an id equal to its progress key.

   Usage: node tools/assign-ids.js --check | --write

   --check   dry run: say what would change; exit 1 if anything would, or if a page
             cannot be converted safely
   --write   make the change; nothing is written unless every page converts safely

   The original exercises were keyed by position ("e3" = the third id-less scored
   exercise of the page, see lib/keys.js). Writing that key into the markup as the id
   keeps every reader's saved progress where it is and makes the key survive the block
   being moved or wrapped. This was run once, on the 201 exercises that predate ids;
   after it `check-static.js` fails any exercise without one, so there should never be
   anything left for it to do. It stays as the record of how the ids were derived.

   The edit is one attribute on one line: on the line the parser reports for the
   exercise, `<div class="ex"` becomes `<div class="ex" id="<key>"`. A page is left
   alone unless that line holds exactly one such tag, no element already has the id,
   and the page parses to the same exercises afterwards — same order, keys, inline
   flags, fingerprints and lines, with the new ids on the exercises they were meant for. */

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const site = require("./lib/site");
const { parse } = require("./lib/html");
const { exercisesOf } = require("./lib/keys");

const ROOT = site.ROOT;
const OPEN = '<div class="ex"';

/* what must not change: the ordered list the browser's key rule produces */
function identity(exs) { return exs.map(e => ({ key: e.key, inline: e.inline, fingerprint: e.fp, line: e.line })); }

/* @returns {{ src: string, assigned: Array<{key, line}> }}; throws if the page is not safe to edit */
function convert(src) {
  const doc = parse(src);
  const before = exercisesOf(doc);
  const taken = new Set();
  for (const el of doc.elements()) if (el.id) taken.add(el.id);
  const lines = src.split("\n");
  const assigned = [];
  before.forEach(e => {
    if (e.inline || e.id) return;
    const text = lines[e.line - 1];
    const found = text.split(OPEN).length - 1;
    if (found !== 1) throw new Error("line " + e.line + ": expected one `" + OPEN + "` for key `" + e.key + "`, found " + found);
    if (taken.has(e.key)) throw new Error("line " + e.line + ": an element with id `" + e.key + "` already exists");
    taken.add(e.key);
    lines[e.line - 1] = text.replace(OPEN, OPEN + ' id="' + e.key + '"');
    assigned.push({ key: e.key, line: e.line, index: e.index });
  });
  const out = lines.join("\n");
  const after = exercisesOf(out);
  assert.deepStrictEqual(identity(after), identity(before), "the page's exercises changed");
  assigned.forEach(a => assert.strictEqual(after[a.index].id, a.key, "line " + a.line + ": the id did not land on the exercise keyed `" + a.key + "`"));
  after.forEach(e => assert.ok(e.inline || e.id, "line " + e.line + ": scored exercise still without an id"));
  return { src: out, assigned };
}

/* The whole run, with the file system and the output handed in so it can be tried on
   pages that are not the site's (tools/checks.test.js).
   @param opts {{ check?: boolean, write?: boolean }}
   @param io   {{ pages: string[], read(page): string, write(page, src), log(line) }}
   @returns the exit code */
function run(opts, io) {
  const todo = [];
  let failed = 0, total = 0, pages = 0;
  const line = t => t.page + ": " + t.assigned.length + " id(s), " + t.assigned[0].key + " … " + t.assigned[t.assigned.length - 1].key;
  io.pages.forEach(p => {
    const src = io.read(p);
    if (!site.chapterIdOf(parse(src))) return;
    pages++;
    let res;
    try { res = convert(src); }
    catch (e) { failed++; io.log("FAIL  " + p + ": " + e.message.split("\n")[0]); return; }
    if (!res.assigned.length) return;
    total += res.assigned.length;
    const t = { page: p, src: res.src, assigned: res.assigned };
    todo.push(t);
    if (!opts.write) io.log("would " + line(t));
  });
  if (failed) { io.log("FAILED: " + failed + " page(s) cannot be converted; nothing written"); return 1; }
  /* "write" is said after the write, and only here: one page that cannot be converted
     stops every page from being written, so it must not be claimed any earlier */
  if (opts.write) todo.forEach(t => { io.write(t.page, t.src); io.log("write " + line(t)); });
  io.log(total ? (opts.write ? "assigned " : "would assign ") + total + " id(s) on " + todo.length + " of " + pages + " chapter pages"
    : "nothing to do: every scored exercise on " + pages + " chapter pages has an id");
  return opts.check && total ? 1 : 0;
}

function main() {
  const opts = site.parseArgs(process.argv.slice(2));
  if (!!opts.check === !!opts.write) { console.error("usage: node tools/assign-ids.js --check | --write"); process.exit(2); }
  process.exit(run(opts, {
    pages: site.htmlPages(ROOT),
    read: p => fs.readFileSync(path.join(ROOT, p), "utf8"),
    write: (p, src) => fs.writeFileSync(path.join(ROOT, p), src),
    log: console.log
  }));
}

if (require.main === module) main();
module.exports = { convert, run };
