"use strict";
/* Things both scripts need to know about the site: where the repo root is, which
   HTML pages exist, and what data/curriculum.js says. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_BASE = "8ff7abc";

function rel(p) { return path.relative(ROOT, p).split(path.sep).join("/"); }

/* root pages plus every parts/<dir>/<file>.html, discovered — never hard-coded */
function htmlPages(root) {
  root = root || ROOT;
  const out = [];
  fs.readdirSync(root).forEach(f => { if (/\.html$/i.test(f)) out.push(f); });
  const parts = path.join(root, "parts");
  if (fs.existsSync(parts)) {
    fs.readdirSync(parts).sort().forEach(d => {
      const dir = path.join(parts, d);
      if (!fs.statSync(dir).isDirectory()) return;
      fs.readdirSync(dir).sort().forEach(f => { if (/\.html$/i.test(f)) out.push("parts/" + d + "/" + f); });
    });
  }
  return out.sort((a, b) => (a.indexOf("/") === -1) === (b.indexOf("/") === -1) ? a.localeCompare(b) : a.indexOf("/") === -1 ? -1 : 1);
}

/* Evaluate data/curriculum.js in a bare sandbox. It sets window.BM_CURRICULUM and
   then decorates it (chapters, chapterById, each chapter's part and path). */
function loadCurriculum(src) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "data/curriculum.js" });
  const C = sandbox.window.BM_CURRICULUM;
  if (!C || !Array.isArray(C.parts)) throw new Error("data/curriculum.js did not set window.BM_CURRICULUM with parts[]");
  if (!Array.isArray(C.chapters)) {
    /* older layout: flatten here */
    C.chapters = [];
    C.parts.forEach(part => part.chapters.forEach(ch => { ch.part = part; ch.path = "parts/" + part.dir + "/" + ch.file; C.chapters.push(ch); }));
    C.chapterById = id => C.chapters.filter(ch => ch.id === id)[0] || null;
  }
  return C;
}
function curriculum(root) {
  return loadCurriculum(fs.readFileSync(path.join(root || ROOT, "data", "curriculum.js"), "utf8"));
}

/* a chapter page is one whose <body data-chapter> names a curriculum chapter */
function chapterIdOf(doc) {
  const body = doc.query("body");
  return body ? body.getAttribute("data-chapter") : null;
}

function walk(dir, test, out) {
  out = out || [];
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir).sort().forEach(f => {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, test, out);
    else if (test(p)) out.push(p);
  });
  return out;
}

function parseArgs(argv) {
  const opts = { _: [] };
  argv.forEach(a => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) opts[m[1]] = m[2] === undefined ? true : m[2];
    else opts._.push(a);
  });
  return opts;
}

module.exports = { ROOT, DEFAULT_BASE, rel, htmlPages, curriculum, loadCurriculum, chapterIdOf, walk, parseArgs };
