"use strict";
/* Things both scripts need to know about the site: where the repo root is, which
   HTML pages exist, what a page is once its shell is written, and what
   data/curriculum.js says. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const git = require("./git");
const shell = require("./shell");
const { parse } = require("./html");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_BASE = "0dc7374";

function rel(p) { return path.relative(ROOT, p).split(path.sep).join("/"); }

/* A source page as the document a reader gets, and that document parsed: the source
   holds two markers where lib/shell.js writes the head and the top bar, so a check that
   read the file as it is would see a page with no stylesheet, script or link. Every
   node's `line` is its line in the source file, the one a message should point at; a
   tag the shell wrote has the line of its marker.
   @param write  the shell to expand with (default: this checkout's lib/shell.js)
   @returns {{ text: string, doc }} ; throws what shell.expand throws */
function page(src, relPath, write) {
  const x = (write || shell).expand(src, relPath);
  const doc = parse(x.html);
  (function relabel(node) { node.line = x.lineOf(node.line); node.children.forEach(relabel); })(doc);
  return { text: x.html, doc };
}
function readPage(root, relPath) {
  return page(fs.readFileSync(path.join(root || ROOT, relPath), "utf8"), relPath);
}

/* lib/shell.js as it was at a git ref, or null where that commit has none (its pages
   are whole documents then). It is run from its text, with Node's built-ins to require
   and, where it reads a source file (the boot script it inlines), that file at the same
   ref, so the page comes out as that commit's build wrote it. */
const shells = {};
function shellAt(root, ref) {
  const key = root + "\n" + ref;
  if (!shells.hasOwnProperty(key)) {
    const src = git.showText(root, ref, "tools/lib/shell.js");
    if (src === null) shells[key] = null;
    else {
      const mod = { exports: {} };
      vm.runInThisContext("(function (module, exports, require, __dirname) {" + src + "\n})", { filename: ref + ":tools/lib/shell.js" })(mod, mod.exports, require, __dirname);
      if (typeof mod.exports.useSource === "function") {
        mod.exports.useSource(rel => {
          const text = git.showText(root, ref, rel);
          if (text === null) throw new Error(rel + " is not at " + ref + ", and that commit's lib/shell.js reads it");
          return text;
        });
      }
      shells[key] = mod.exports;
    }
  }
  return shells[key];
}
/* A page as a reader of that commit got it: a whole page as it is, a marked one
   expanded by that commit's own shell. null when the commit has no such file.
   @returns {{ text: string, doc }|null} */
function pageAt(root, ref, relPath) {
  const src = git.showText(root, ref, relPath);
  if (src === null) return null;
  if (!shell.isMarked(src)) return { text: src, doc: parse(src) };
  const write = shellAt(root, ref);
  if (!write) throw new Error(relPath + " at " + ref + " carries a shell marker, but that commit has no tools/lib/shell.js to expand it");
  return page(src, relPath, write);
}

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

module.exports = { ROOT, DEFAULT_BASE, rel, htmlPages, page, readPage, pageAt, shellAt, curriculum, loadCurriculum, chapterIdOf, walk, parseArgs };
