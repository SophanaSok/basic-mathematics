#!/usr/bin/env node
"use strict";
/* Rewrite every page from a whole document to the two markers of lib/shell.js.

   Usage: node tools/apply-shell.js --check | --write [--base=<git ref>]

   --check   dry run: say what would change; exit 1 if anything would, or if a page
             cannot be converted safely
   --write   make the change; nothing is written unless every page converts safely
   --base    for pages that already carry the markers: also hold each one, expanded,
             to the whole page it was at that commit (the one the pages were converted
             from). Without it such a page is only expanded, to see that it can be.

   Every page used to carry its own copy of the <head> and the top bar. This was run
   once, on the 23 pages there were; lib/shell.js writes that part now, and fails a page
   that has a <main id="main"> and no marker, so there should never be anything left
   for this to do. It stays as the record of how the pages were converted, and of the
   proof that the conversion changed no document. (The proof was made against the
   shell as it was then, with classic script tags per page and data-scenes picking a
   chapter's scenes; the shell has since moved to one module entry per kind, so a page
   from before the conversion would no longer be found again by this script, and
   --base can only hold a page to a commit whose shell is the current one.)

   The edit, per page: everything before the content wrapper (<div class="wrap"> or
   "wrap-narrow") is rewritten to
     …<head>, the head marker, the page's own <title>, <meta name="description"> and
     (where it has one) <meta name="robots">, </head>, <body> with the attributes it
     had plus the ones the shell reads, the top-bar marker
   and every byte from the wrapper to the end of the file is left as it is. Which kind
   of page it is and which top bar are not guessed from its name: each combination
   lib/shell.js knows is tried, and the one is taken whose expansion parses to the same
   document as the original, white space aside. A page for which none does is refused,
   and one refused page stops every page from being written. */

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const site = require("./lib/site");
const git = require("./lib/git");
const shell = require("./lib/shell");
const { parse, normText } = require("./lib/html");

const ROOT = site.ROOT;
const WRAPPER = /<div class="wrap(?:-narrow)?">/;

/* a parsed document as a list of tags and texts, white space collapsed: two pages with
   the same list are the same document to a browser, however their lines are broken */
function canonical(node, out) {
  out = out || [];
  if (node.type === "text") { const t = normText(node.text); if (t) out.push(t); return out; }
  if (node.type === "comment") { out.push("<!--" + normText(node.text) + "-->"); return out; }
  if (node.type === "element") out.push("<" + node.name + Object.keys(node.attrs).map(k => " " + k + "=" + JSON.stringify(node.attrs[k])).join("") + ">");
  node.children.forEach(c => canonical(c, out));
  if (node.type === "element") out.push("</" + node.name + ">");
  return out;
}
/* where two such lists first part, for a message; null when they are the same */
function firstDifference(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return "item " + (i + 1) + " is " + (a[i] === undefined ? "missing" : JSON.stringify(a[i].slice(0, 120))) + ", the original has " + (b[i] === undefined ? "nothing more" : JSON.stringify(b[i].slice(0, 120)));
  }
  return null;
}
/* the bytes that must not change: from the opening of the content wrapper to the end */
function tailOf(src) {
  const w = WRAPPER.exec(src), main = src.search(/<main\b/);
  if (!w || main === -1 || w.index > main) throw new Error("no content wrapper (<div class=\"wrap\"> or <div class=\"wrap-narrow\">) before <main>");
  return src.slice(w.index);
}

/* A marked page against the whole page it was made from.
   @returns {{ bytes: boolean }} bytes: the expansion is the original byte for byte
   @throws when it is not the same document, or the content differs by a byte */
function verify(original, marked, rel) {
  const expanded = shell.renderShell(marked, rel);
  const diff = firstDifference(canonical(parse(expanded)), canonical(parse(original)));
  if (diff) throw new Error("expanded, it is not the original document: " + diff);
  assert.strictEqual(tailOf(marked), tailOf(original), "the bytes from the content wrapper to the end of the file changed");
  return { bytes: expanded === original };
}

/* @returns {{ src: string, says: string, bytes: boolean }} the marked page, what it now
   says on <body>, and whether its expansion is `src` byte for byte; throws if the page
   is not safe to convert */
function convert(src, rel) {
  if (shell.isMarked(src)) throw new Error("already carries a marker");
  const tail = tailOf(src);
  const before = src.slice(0, src.length - tail.length);
  const headOpen = /<head>\s*/.exec(before), headClose = before.indexOf("</head>");
  const body = /<body\b([^>]*)>(\s*)/.exec(before);
  if (!headOpen || headClose === -1 || !body || body.index < headClose) throw new Error("no <head> … </head> <body> before the content wrapper");
  const inHead = before.slice(headOpen.index, headClose);
  const one = (re, what, needed) => {
    const found = inHead.match(re) || [];
    if (found.length > 1 || (needed && !found.length)) throw new Error("expected one " + what + " in <head>, found " + found.length);
    return found[0] || "";
  };
  const title = one(/<title>[\s\S]*?<\/title>/g, "<title>", true);
  const description = one(/<meta name="description"[^>]*>/g, '<meta name="description">', true);
  const robots = one(/<meta name="robots"[^>]*>/g, '<meta name="robots">', false);
  /* the white space the page has between its top bar and its content; the top bar ends
     with the HUD script after </header> where the page has one (the shell writes it) */
  const barEnd = before.lastIndexOf("</header>");
  const hudEnd = barEnd === -1 ? null : /^\n<script>[\s\S]*?<\/script>/.exec(before.slice(barEnd + "</header>".length));
  const gap = barEnd === -1 ? null : before.slice(barEnd + "</header>".length + (hudEnd ? hudEnd[0].length : 0));
  if (gap === null || gap.trim()) throw new Error("no top bar (<header class=\"topbar\"> … </header>) right before the content wrapper");
  const isChapter = /\sdata-chapter=/.test(body[1]);

  const says = [];
  const kinds = isChapter ? [""] : Object.keys(shell.PAGE_KINDS).filter(k => k !== "chapter").map(k => ' data-page="' + k + '"');
  kinds.forEach(k => Object.keys(shell.NAVS).forEach(n => says.push(k + (n ? ' data-nav="' + n + '"' : ""))));
  const want = canonical(parse(src));
  let nearest = { same: -1, why: "" };
  for (const more of says) {
    const out = before.slice(0, headOpen.index + headOpen[0].length) + shell.HEAD_MARK + "\n" +
      [title, description].concat(robots ? [robots] : []).join("\n") + "\n" +
      before.slice(headClose, body.index) + "<body" + body[1] + more + ">" + body[2] + shell.TOPBAR_MARK + gap + tail;
    let expanded;
    try { expanded = shell.renderShell(out, rel); }
    catch (e) { if (nearest.same < 0) nearest = { same: 0, why: e.message }; continue; }
    const got = canonical(parse(expanded));
    const diff = firstDifference(got, want);
    if (diff) {
      let same = 0;
      while (same < got.length && got[same] === want[same]) same++;
      if (same > nearest.same) nearest = { same, why: "as <body" + more + ">, " + diff };
      continue;
    }
    assert.strictEqual(tailOf(out), tail, "the bytes from the content wrapper to the end of the file changed");
    return { src: out, says: more.trim() || "(a chapter)", bytes: expanded === src };
  }
  throw new Error("no kind of page in lib/shell.js expands to this document; the nearest: " + nearest.why);
}

/* The whole run, with the file system and the output handed in so it can be tried on
   pages that are not the site's (tools/checks.test.js).
   @param opts {{ check?: boolean, write?: boolean, base?: string }}
   @param io   {{ pages: string[], read(page): string, write(page, src), log(line),
                  atBase?(page): string|null }}  atBase: the page at opts.base
   @returns the exit code */
function run(opts, io) {
  const todo = [];
  let failed = 0, marked = 0, held = 0, heldBytes = 0;
  const base = typeof opts.base === "string" && opts.base ? opts.base : null;
  io.pages.forEach(p => {
    const src = io.read(p);
    try {
      if (!shell.isMarked(src)) {
        const res = convert(src, p);
        todo.push({ page: p, src: res.src, says: res.says, bytes: res.bytes });
        if (!opts.write) io.log("would mark " + p + ": " + res.says);
        return;
      }
      marked++;
      const was = base ? io.atBase(p) : null;
      if (was === null || was === undefined) { shell.renderShell(src, p); if (base) io.log("      " + p + ": not at " + base + ", nothing to hold it to"); return; }
      if (shell.isMarked(was)) { shell.renderShell(src, p); io.log("      " + p + ": already carries the markers at " + base + ", nothing to hold it to"); return; }
      if (verify(was, src, p).bytes) heldBytes++;
      held++;
    } catch (e) { failed++; io.log("FAIL  " + p + ": " + e.message.split("\n")[0]); }
  });
  if (failed) { io.log("FAILED: " + failed + " page(s) " + (todo.length || !marked ? "cannot be converted" : "do not hold") + "; nothing written"); return 1; }
  /* "write" is said after the write, and only here: one page that cannot be converted
     stops every page from being written, so it must not be claimed any earlier */
  if (opts.write) todo.forEach(t => { io.write(t.page, t.src); io.log("write " + t.page + ": " + t.says); });
  const how = (n, bytes) => bytes === n ? "byte for byte" : bytes + " byte for byte, the rest but for white space";
  if (todo.length) {
    io.log((opts.write ? "marked " : "would mark ") + todo.length + " of " + io.pages.length + " pages; expanded, each is the document it was, " + how(todo.length, todo.filter(t => t.bytes).length));
  } else {
    io.log("nothing to do: all " + marked + " pages carry the markers" + (base ? "; expanded, " + held + " of them are the document they were at " + base + ", " + how(held, heldBytes) + ", and from the content wrapper on not a byte differs" : ""));
  }
  return opts.check && todo.length ? 1 : 0;
}

function main() {
  const opts = site.parseArgs(process.argv.slice(2));
  if (!!opts.check === !!opts.write) { console.error("usage: node tools/apply-shell.js --check | --write [--base=<git ref>]"); process.exit(2); }
  if (opts.base !== undefined && (opts.base === true || !git.resolveRef(ROOT, opts.base))) { console.error("--base " + (opts.base === true ? "needs a git ref" : opts.base + " does not resolve")); process.exit(2); }
  process.exit(run(opts, {
    pages: site.htmlPages(ROOT),
    read: p => fs.readFileSync(path.join(ROOT, p), "utf8"),
    write: (p, src) => fs.writeFileSync(path.join(ROOT, p), src),
    atBase: p => git.showText(ROOT, opts.base, p),
    log: console.log
  }));
}

if (require.main === module) main();
module.exports = { convert, verify, canonical, run };
