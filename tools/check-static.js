#!/usr/bin/env node
"use strict";
/* Static checks for the site — Node built-ins only, no browser.

   Usage: node tools/check-static.js [--base=<git ref>] [--only=<check name>] [--strict]
                                     [--accept-steps] [--accept-shell]
                                     [--migrations-base=<git ref>] [--shell-base=<git ref>]

   --base    the commit to compare progress keys against (default: the clean tree the
             harness was written on, see lib/site.js DEFAULT_BASE)
   --only    run one check by name (the names printed in the first column)
   --migrations-base  the commit the migrations check compares against (default: where
             HEAD left main; continuous integration passes the commit being merged into)
   --shell-base  hold the shell check to the pages of a commit, not to tools/shell.json
   --strict  WARN counts as FAIL (for the day the infinite-animation and the other
             "not yet" rules become hard rules)
   --accept-steps  rewrite tools/lesson-steps.json from the working tree, after a change
             to where a chapter's lesson steps are cut that is meant
   --accept-shell  rewrite tools/shell.json from the working tree, after a change to
             what a page loads, to its body attributes or to the top bar that is meant
             (these two flags are the only ones that write anything)

   Each check is a function (ctx) -> { status, count, details[] } in CHECKS below.
   To add one, write the function and append { name, run } to the list. */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const site = require("./lib/site");
const git = require("./lib/git");
const shell = require("./lib/shell");
const { parse, normText, hash } = require("./lib/html");
const { exercisesOf } = require("./lib/keys");
const cssLib = require("./lib/css");
const links = require("./lib/links");

const ROOT = site.ROOT;
const opts = site.parseArgs(process.argv.slice(2));
const BASE = opts.base || site.DEFAULT_BASE;
const STRICT = !!opts.strict;

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

/* result helpers: every check returns one of these */
function result() {
  const r = { fails: [], warns: [], notes: [], count: 0 };
  r.fail = (m) => { r.fails.push(m); };
  r.warn = (m) => { r.warns.push(m); };
  r.note = (m) => { r.notes.push(m); };
  return r;
}

/* ------------------------------------------------------------- context --- */

/* Every page is read as the document a reader gets: the shell written (lib/shell.js),
   then parsed, so the links, widgets and curriculum checks see the stylesheets, scripts
   and top bar no source file holds any more. A page the shell refuses stops the run. */
function buildContext() {
  const ctx = { pages: site.htmlPages(ROOT), docs: {}, curriculum: null, chapters: {} };
  ctx.pages.forEach(p => { ctx.docs[p] = site.readPage(ROOT, p).doc; });
  ctx.curriculum = site.curriculum(ROOT);
  /* chapter pages: by the body's data-chapter, which is also how site.js finds them */
  ctx.pages.forEach(p => {
    const id = site.chapterIdOf(ctx.docs[p]);
    if (id) ctx.chapters[p] = id;
  });
  return ctx;
}

/* ------------------------------------------------------------- checks ---- */

/* node --check parses each file as Node would run it: src/, assets/ and data/ as ES
   modules (the repo's package.json says "type": "module"; the entries under
   src/entries/ import, and the rest are IIFEs, which parse either way), tools/ as
   CommonJS (tools/package.json) */
function checkSyntax(ctx, r) {
  const files = [];
  ["src", "assets", "data", "tools"].forEach(d => site.walk(path.join(ROOT, d), p => /\.js$/.test(p), files));
  files.forEach(f => {
    r.count++;
    try { execFileSync(process.execPath, ["--check", f], { stdio: ["ignore", "pipe", "pipe"] }); }
    catch (e) { r.fail(site.rel(f) + ": " + String(e.stderr || e.message).trim().split("\n").slice(0, 3).join(" | ")); }
  });
}

/* The key rules for one chapter page, apart from where the base comes from: `exs` is
   exercisesOf() of the page in the working tree, `baseExs` of the same page at the base
   (null for a page the base does not have). Keys are ids, which an author chooses, so they
   are held in Maps: in a plain object `constructor` would already be there.
   @returns {{ scored, inline, skipped, newScored }} how many base keys were compared */
function pageKeys(p, exs, baseExs, r) {
  const n = { scored: 0, inline: 0, skipped: 0, newScored: 0 };
  const wt = new Map(), wtInline = new Map();
  /* Every exercise in the working tree carries its key as an id. The positional
     fallback in lib/keys.js (and site.js) is only there to read pages at the base,
     from before the ids were written in; here it would hand out a key by counting. */
  exs.forEach(e => {
    if (e.inline) {
      if (wtInline.has(e.key)) r.fail(p + ":" + e.line + ": duplicate inline key `" + e.key + "`");
      wtInline.set(e.key, e);
      if (!e.id) r.fail(p + ":" + e.line + ": inline exercise without an id (the positional fallback would key it `" + e.key + "`); give it an id this page has never used");
      return;
    }
    if (wt.has(e.key)) r.fail(p + ":" + e.line + ": duplicate scored key `" + e.key + "` (first at line " + wt.get(e.key).line + ")");
    wt.set(e.key, e);
    if (!e.id) r.fail(p + ":" + e.line + ": scored exercise without an id (the positional fallback would key it `" + e.key + "`); give it an id this page has never used");
  });
  if (!baseExs) return n;
  /* Inline checks are held to the base as well: nothing of theirs is in the solved list,
     but site.js marks one solved from its attempt record, so a changed question under a
     kept id shows as already answered just the same. One with no id at the base was keyed
     by counting, and no page in the working tree has such a key to hold it to. */
  const baseScored = new Set();
  baseExs.forEach(b => {
    if (b.inline && !b.id) { n.skipped++; return; }
    if (b.inline) n.inline++; else { n.scored++; baseScored.add(b.key); }
    const what = (b.inline ? "inline key `" : "key `") + b.key + "`";
    const w = (b.inline ? wtInline : wt).get(b.key);
    if (!w) { r.fail(p + ": " + what + " (base line " + b.line + ", answer " + JSON.stringify(b.answer) + ") is missing in the working tree"); return; }
    if (w.fp !== b.fp) r.fail(p + ":" + w.line + ": " + what + " now has a different question/answer than at base (base line " + b.line + ", base answer " + JSON.stringify(b.answer) + ", now " + JSON.stringify(w.answer) + ")");
  });
  wt.forEach((e, key) => { if (!baseScored.has(key)) n.newScored++; });
  return n;
}

function checkProgressKeys(ctx, r) {
  const baseSha = git.resolveRef(ROOT, BASE);
  if (!baseSha) { r.fail("base ref " + BASE + " does not resolve"); return; }
  r.note("base " + BASE + " = " + baseSha.slice(0, 10));
  /* chapter pages at the base: anything under parts/ whose body names a chapter */
  const basePages = git.listFiles(ROOT, BASE, "parts").filter(p => /\.html$/.test(p));
  const baseSet = new Set(basePages);
  const wtChapterPages = Object.keys(ctx.chapters);
  let total = 0, scored = 0, compared = 0, comparedInline = 0, skipped = 0, newScored = 0;
  const baseExs = {};
  basePages.forEach(p => {
    const src = git.showText(ROOT, BASE, p);
    const doc = parse(src);
    const chId = site.chapterIdOf(doc);
    if (!chId) return;
    baseExs[p] = exercisesOf(doc);
    if (!wtChapterPages.includes(p)) r.fail(p + " (chapter " + chId + ") exists at base but not in the working tree");
  });
  wtChapterPages.forEach(p => {
    const exs = exercisesOf(ctx.docs[p]);
    total += exs.length;
    scored += exs.filter(e => !e.inline).length;
    const base = baseExs.hasOwnProperty(p) ? baseExs[p] : null;
    if (!base) r.note(p + ": new chapter page, nothing to compare");
    const n = pageKeys(p, exs, base, r);
    compared += n.scored; comparedInline += n.inline; skipped += n.skipped;
    if (base) newScored += n.newScored;
  });
  r.count = compared + comparedInline;
  r.note("working tree: " + total + " exercises (" + scored + " scored, " + (total - scored) + " inline) on " + wtChapterPages.length + " chapter pages; " + compared + " base keys compared; " + comparedInline + " inline base keys compared; " + newScored + " scored exercises new since base; " + baseSet.size + " base pages");
  if (skipped) r.note(skipped + " inline exercises at base had no id and were not compared");
}

/* An id is a link target and, on an exercise, the key its progress is saved under.
   Two elements sharing one leave both ambiguous: the browser picks the first. */
function checkIds(ctx, r) {
  ctx.pages.forEach(page => {
    /* a Map: any string is a legal id, `constructor` and `__proto__` included */
    const seen = new Map();
    for (const el of ctx.docs[page].elements()) {
      if (!el.id) continue;
      r.count++;
      if (!seen.has(el.id)) seen.set(el.id, []);
      seen.get(el.id).push(el);
    }
    seen.forEach((els, id) => {
      if (els.length > 1) r.fail(page + ":" + els[1].line + ": id " + JSON.stringify(id) + " is on " + els.length + " elements (" + els.map(el => "<" + el.name + "> line " + el.line).join(", ") + ")");
    });
  });
}

/* ------------------------------------------------------- lesson steps -- */

const STEPS_FILE = path.join(__dirname, "lesson-steps.json");

/* startsStep / endsStep of assets/lesson.js, on lib/html.js nodes */
function startsStep(el) {
  return el.name === "h2" || el.hasClass("practice") || el.hasClass("recap");
}
function endsStep(el) {
  return el.hasClass("puzzle") || el.hasClass("warmup") || el.hasClass("ex") || el.hasClass("practice") ||
    (el.name === "details" && el.hasClass("reveal")) ||
    (el.name === "figure" && !!el.query(".widget"));
}
/* how an element is named in a step: by its id when it has one, else by tag and classes */
function nameOf(el) {
  return el.name + (el.id ? "#" + el.id : el.classList.map(c => "." + c).join(""));
}
/* The steps lesson.js cuts the top-level children of <main id="main"> into, each written
   as its first and last element: every cut is made by one of those two, so a cut that
   moves shows in the list even when the number of steps stays the same, while text added
   inside a step does not. This reads the markup as written; what scripts add to <main>
   before the cut (the mode switch, the feedback note) starts and ends nothing.
   @returns {string[]} one entry per step, in order */
function lessonSteps(doc) {
  const main = doc.query("#main");
  if (!main) return [];
  const steps = [[]];
  main.children_elements.forEach(el => {
    let cur = steps[steps.length - 1];
    if (startsStep(el) && cur.length) { cur = []; steps.push(cur); }
    cur.push(el);
    if (endsStep(el)) steps.push([]);
  });
  return steps.filter(s => s.length).map(s => nameOf(s[0]) + (s.length > 1 ? " to " + nameOf(s[s.length - 1]) : ""));
}
/* @returns {string|null} what the first step that differs is, or null when the lists agree */
function stepsDiff(now, accepted) {
  const tick = "`";
  for (let i = 0; i < Math.max(now.length, accepted.length); i++) {
    if (now[i] === accepted[i]) continue;
    if (i >= accepted.length) return "step " + (i + 1) + " " + tick + now[i] + tick + " is new";
    if (i >= now.length) return "accepted step " + (i + 1) + " " + tick + accepted[i] + tick + " is gone";
    return "step " + (i + 1) + " is now " + tick + now[i] + tick + ", accepted " + tick + accepted[i] + tick;
  }
  return null;
}

/* bm.lesson.v1 remembers how far a reader has got as a step number (reached[chapter]),
   so a chapter that is cut differently reopens at another place. The cuts readers have
   are kept in lesson-steps.json, by chapter id, rather than read from --base: the base
   is where the exercise keys were frozen and is older than chapters that have since
   gained steps, and a check that already warns cannot signal one more change. */
function checkLessonSteps(ctx, r) {
  const pages = Object.keys(ctx.chapters);
  const now = {};
  pages.forEach(p => { now[ctx.chapters[p]] = lessonSteps(ctx.docs[p]); });
  if (opts["accept-steps"]) {
    fs.writeFileSync(STEPS_FILE, JSON.stringify(now, null, 2) + "\n");
    r.note("--accept-steps: wrote " + site.rel(STEPS_FILE) + " from the working tree");
  }
  if (!fs.existsSync(STEPS_FILE)) { r.fail(site.rel(STEPS_FILE) + " is missing; --accept-steps writes it from the working tree"); return; }
  const accepted = JSON.parse(fs.readFileSync(STEPS_FILE, "utf8"));
  let total = 0;
  pages.forEach(p => {
    const chId = ctx.chapters[p], steps = now[chId];
    total += steps.length;
    r.count++;
    if (!accepted.hasOwnProperty(chId)) { r.warn(p + " (chapter " + chId + "): " + steps.length + " lesson steps, none recorded in " + site.rel(STEPS_FILE)); return; }
    const diff = stepsDiff(steps, accepted[chId]);
    if (diff) r.warn(p + " (chapter " + chId + "): " + steps.length + " lesson steps, " + (accepted[chId].length === steps.length ? "as many as accepted, but " : accepted[chId].length + " accepted; ") + diff);
  });
  Object.keys(accepted).forEach(chId => {
    if (!now.hasOwnProperty(chId)) r.warn(site.rel(STEPS_FILE) + ": chapter " + chId + " is recorded but no page in the working tree has it");
  });
  r.note(total + " steps on " + pages.length + " chapter pages");
  if (r.warns.length) r.note("a reader's saved place in a chapter is a step number: where the steps changed, it now opens a different part of the chapter. If the change is meant, --accept-steps records it");
}

/* -------------------------------------------------------------- shell -- */

const SHELL_FILE = path.join(__dirname, "shell.json");

/* one tag as a line of text: its attributes as written, for a <title> its text, and for
   an inline <script> (the boot script) a fingerprint of its text, so a change to what
   runs before first paint shows and is accepted like any other */
function tagLine(el, skip) {
  const attrs = Object.keys(el.attrs).filter(k => !skip || !skip.includes(k))
    .map(k => " " + k + (el.attrs[k] === "" ? "" : "='" + el.attrs[k].replace(/'/g, "&#39;") + "'")).join("");
  return "<" + el.name + attrs + ">" + (el.name === "title" ? normText(el.textContent) + "</title>"
    : el.name === "script" && !el.hasAttribute("src") ? "#" + hash(normText(el.textContent)) + "</script>" : "");
}
/* What a page's shell comes to, read off the whole document:
     head    every tag of <head> in order: the title, the description, each stylesheet
             and each script with its attributes (a `defer` is one), and the rest
     body    the <body> tag, without the attributes only lib/shell.js reads
     topbar  the skip link and the top bar: each link as "text -> href", each button
   The order of the head is the order the scripts run in and the stylesheets cascade
   in; the body attributes are what site.js and the stylesheets find the page by. */
function shellOf(doc) {
  const head = doc.query("head"), body = doc.query("body"), bar = doc.query("header.topbar"), skip = doc.query("a.skip-link");
  return {
    head: head ? head.children_elements.map(el => tagLine(el)) : [],
    body: body ? tagLine(body, shell.BODY_INPUTS) : "",
    topbar: (skip ? [skip] : []).concat(bar ? bar.queryAll("a, button") : [])
      .map(el => el.name === "a" ? normText(el.textContent) + " -> " + el.getAttribute("href") : "button: " + (el.getAttribute("aria-label") || normText(el.textContent)))
  };
}
/* @returns {string[]} what differs between a page's shell and the accepted one */
function shellDiff(now, accepted) {
  const tick = "`", out = [];
  ["head", "topbar"].forEach(part => {
    const a = now[part] || [], b = accepted[part] || [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] === b[i]) continue;
      out.push(part + " entry " + (i + 1) + " " + (i >= b.length ? tick + a[i] + tick + " is new" : i >= a.length ? "is gone, accepted " + tick + b[i] + tick : "is now " + tick + a[i] + tick + ", accepted " + tick + b[i] + tick) +
        (a.length !== b.length ? " (" + a.length + " entries, " + b.length + " accepted)" : ""));
      break;
    }
  });
  if (now.body !== accepted.body) out.push("the body tag is now " + tick + now.body + tick + ", accepted " + tick + accepted.body + tick);
  return out;
}

/* The scripts of a page: the boot script inline and first, then one
   <script type="module"> naming the entry of the page's kind (src/entries/<kind>.js, a
   file that exists), and no other script. A classic <script src>, of the site's own or
   from another server (KaTeX comes from npm through the entry now), a second module, or a
   page of one kind with another kind's entry each fail here, before shell.json is
   consulted.
   @returns {string[]} what is wrong */
function scriptsProblems(p, doc, kind) {
  const out = [];
  const scripts = doc.query("head") ? doc.query("head").queryAll("script") : [];
  const first = scripts[0];
  if (!first || first.hasAttribute("src") || normText(first.textContent) !== normText(shell.bootScript())) out.push("the first script of <head> is not the boot script (src/boot.js) inline");
  const srcs = scripts.filter(s => s.hasAttribute("src"));
  const classic = srcs.filter(s => !/^module$/i.test(s.getAttribute("type") || ""));
  if (classic.length) out.push("a page has no classic <script src>; every script comes through the module entry: " + JSON.stringify(classic.map(s => s.getAttribute("src"))));
  const mods = srcs.filter(s => /^module$/i.test(s.getAttribute("type") || ""));
  const want = "../".repeat(p.split("/").length - 1) + shell.PAGE_KINDS[kind].entry;
  if (mods.length !== 1) out.push(mods.length + " module scripts, not one: " + JSON.stringify(mods.map(s => s.getAttribute("src"))));
  else if (mods[0].getAttribute("src") !== want) out.push("the module script is " + JSON.stringify(mods[0].getAttribute("src")) + ", not the entry of a " + kind + " page, " + want);
  else if (!exists(shell.PAGE_KINDS[kind].entry)) out.push("the entry " + shell.PAGE_KINDS[kind].entry + " does not exist");
  if (scripts.length !== 1 + mods.length) out.push("a script of <head> is neither the boot script nor the module entry");
  return out;
}

/* No page writes its own <head> or top bar: lib/shell.js writes them from a list per
   kind of page, so one edit there changes what every page loads. This holds each page,
   expanded, to the shell readers have, which is recorded in shell.json by page. A file
   and not --base, for the reason lesson-steps.json is one: the base is where the
   exercise keys were frozen, and its pages load a different set of scripts.
   --shell-base=<ref> compares with the pages of a commit instead, each as a reader of
   that commit got it. First, though, what every page's scripts must be whatever the
   record says: scriptsProblems() above. */
function checkShell(ctx, r) {
  const now = {};
  ctx.pages.forEach(p => {
    now[p] = shellOf(ctx.docs[p]);
    const kind = shell.pageInfo(read(p), p).kind;
    scriptsProblems(p, ctx.docs[p], kind).forEach(m => r.fail(p + ": " + m));
  });
  if (opts["accept-shell"]) {
    fs.writeFileSync(SHELL_FILE, JSON.stringify(now, null, 2) + "\n");
    r.note("--accept-shell: wrote " + site.rel(SHELL_FILE) + " from the working tree");
  }
  const ref = opts["shell-base"];
  let accepted = {}, from, how;
  if (ref !== undefined) {
    if (ref === true || !git.resolveRef(ROOT, ref)) { r.fail("--shell-base " + (ref === true ? "needs a git ref" : ref + " does not resolve")); return; }
    git.listFiles(ROOT, ref).filter(p => /^(?:parts\/[^\/]+\/)?[^\/]+\.html$/i.test(p)).forEach(p => { accepted[p] = shellOf(site.pageAt(ROOT, ref, p).doc); });
    from = "at " + ref;
    how = "";
  } else {
    if (!fs.existsSync(SHELL_FILE)) { r.fail(site.rel(SHELL_FILE) + " is missing; --accept-shell writes it from the working tree"); return; }
    accepted = JSON.parse(fs.readFileSync(SHELL_FILE, "utf8"));
    from = "in " + site.rel(SHELL_FILE);
    how = "; if the change is meant, --accept-shell records it";
  }
  ctx.pages.forEach(p => {
    r.count++;
    if (!accepted.hasOwnProperty(p)) { r.fail(p + ": no shell recorded " + from + (how ? "; --accept-shell records a new page" : "")); return; }
    shellDiff(now[p], accepted[p]).forEach(d => r.fail(p + ": " + d));
  });
  Object.keys(accepted).forEach(p => {
    if (!now.hasOwnProperty(p)) r.fail(p + ": has a shell recorded " + from + " but is not a page of the working tree");
  });
  r.note(ctx.pages.length + " pages held to the shells " + from);
  if (r.fails.length && how) r.note("what every page loads, and in what order, is the site" + how);
}

function checkCurriculum(ctx, r) {
  const C = ctx.curriculum;
  const seen = new Set();
  C.chapters.forEach(ch => {
    r.count++;
    if (seen.has(ch.id)) r.fail("duplicate chapter id " + ch.id);
    seen.add(ch.id);
    if (!exists(ch.path)) { r.fail(ch.id + ": file " + ch.path + " does not exist"); return; }
    const doc = ctx.docs[ch.path];
    if (!doc) { r.fail(ch.id + ": " + ch.path + " is not in the page list"); return; }
    const body = doc.query("body");
    if (!body || body.getAttribute("data-chapter") !== ch.id) r.fail(ch.path + ": body data-chapter is " + JSON.stringify(body && body.getAttribute("data-chapter")) + ", curriculum says " + ch.id);
    const depth = ch.path.split("/").length - 1;
    if (body && String(depth) !== body.getAttribute("data-depth")) r.fail(ch.path + ": data-depth " + body.getAttribute("data-depth") + " but the file is " + depth + " deep");
    const h2 = {};
    doc.queryAll("h2").forEach(h => { if (h.id) h2[h.id] = h; });
    const ids = {};
    for (const el of doc.elements()) if (el.id) ids[el.id] = el;
    const secIds = new Set();
    ch.sections.forEach(s => {
      if (secIds.has(s.id)) r.fail(ch.id + ": duplicate section id " + s.id);
      secIds.add(s.id);
      if (h2[s.id]) return;
      /* a mixed-review set is a whole section: README allows its id on <section class="practice"> */
      const el = ids[s.id];
      if (el && el.name === "section" && /(^|\s)practice(\s|$)/.test(el.getAttribute("class") || "")) return;
      if (ids[s.id]) r.warn(ch.path + ":" + ids[s.id].line + ": section `" + s.id + "` is an id on <" + ids[s.id].name + ">, not on an <h2> as README says (links resolve; the sidebar spy still finds it)");
      else r.fail(ch.path + ": no element with id `" + s.id + "` for curriculum section " + ch.id + "#" + s.id);
    });
  });
  /* every chapter page is in the curriculum too */
  Object.keys(ctx.chapters).forEach(p => {
    if (!C.chapterById(ctx.chapters[p])) r.fail(p + ": data-chapter " + ctx.chapters[p] + " is not in data/curriculum.js");
  });
}

/* the walk itself lives in lib/links.js, which check-dist.js runs over the built tree */
function checkLinks(ctx, r) {
  links.checkLinks({ pages: ctx.pages, docs: ctx.docs, exists }, r);
}

function widgetNames() {
  const names = new Set();
  if (exists("assets/widgets.js")) {
    const src = read("assets/widgets.js");
    let m;
    const re = /\bW(?:\.([A-Za-z_$][\w$]*)|\[["']([^"']+)["']\])\s*=\s*function/g;
    while ((m = re.exec(src))) names.add(m[1] || m[2]);
  }
  const scenes = [];
  site.walk(path.join(ROOT, "assets", "scenes"), p => /\.js$/.test(p), scenes);
  scenes.forEach(f => {
    const src = fs.readFileSync(f, "utf8");
    let m;
    const re = /\bBM3D\.define\(\s*["']([^"']+)["']/g;
    while ((m = re.exec(src))) names.add(m[1]);
  });
  return { names, scenes: scenes.length };
}

function checkWidgets(ctx, r) {
  const { names, scenes } = widgetNames();
  r.note(names.size + " figure factories known (" + scenes + " scene files)");
  ctx.pages.forEach(page => {
    for (const el of ctx.docs[page].elements()) {
      ["data-widget", "data-figure"].forEach(attr => {
        if (!el.hasAttribute(attr)) return;
        r.count++;
        const v = el.getAttribute(attr);
        if (!names.has(v)) r.fail(page + ":" + el.line + ": " + attr + "=" + JSON.stringify(v) + " is not defined in assets/widgets.js or assets/scenes/");
      });
    }
  });
}

function checkSections(ctx, r) {
  const C = ctx.curriculum;
  const scoredWithout = [];
  Object.keys(ctx.chapters).forEach(page => {
    const chId = ctx.chapters[page];
    const ch = C.chapterById(chId);
    if (!ch) return;
    const own = new Set(ch.sections.map(s => s.id));
    exercisesOf(ctx.docs[page]).forEach(e => {
      const v = e.el.getAttribute("data-section");
      if (v === null) { if (!e.inline) scoredWithout.push(page + ":" + e.line + " (key " + e.key + ")"); return; }
      r.count++;
      const cut = v.indexOf("#");
      if (cut === -1) {
        if (!own.has(v)) r.fail(page + ":" + e.line + ": data-section " + JSON.stringify(v) + " is not a section of " + chId);
        return;
      }
      const other = C.chapterById(v.slice(0, cut));
      if (!other) { r.fail(page + ":" + e.line + ": data-section " + JSON.stringify(v) + " names an unknown chapter"); return; }
      if (!other.sections.some(s => s.id === v.slice(cut + 1))) r.fail(page + ":" + e.line + ": data-section " + JSON.stringify(v) + ": " + other.id + " has no section " + v.slice(cut + 1));
    });
  });
  if (scoredWithout.length) r.warn(scoredWithout.length + " scored exercise(s) carry no data-section, so they count for nothing on the progress page: " + scoredWithout.join(", "));
}

function checkChoices(ctx, r) {
  Object.keys(ctx.docs).forEach(page => {
    exercisesOf(ctx.docs[page]).forEach(e => {
      if (e.kind !== "choice" && e.kind !== "multi") return;
      r.count++;
      const list = e.el.query("ul.choices, ol.choices");
      const n = list.children.filter(c => c.type === "element" && c.name === "li").length;
      if (n < 2) r.fail(page + ":" + e.line + ": only " + n + " option(s)");
      const alts = [e.answer].concat(e.answer.split("|")).map(s => s.trim()).filter(Boolean);
      alts.forEach(alt => {
        const idx = alt.split(/[,;]/).map(s => s.trim()).filter(Boolean);
        if (e.kind === "choice" && idx.length !== 1) r.fail(page + ":" + e.line + ": single-choice answer " + JSON.stringify(alt) + " is not one index");
        if (e.kind === "multi" && idx.length < 1) r.fail(page + ":" + e.line + ": multi answer is empty");
        idx.forEach(s => {
          if (!/^\d+$/.test(s) || +s < 1 || +s > n) r.fail(page + ":" + e.line + ": answer index " + JSON.stringify(s) + " is outside 1.." + n);
        });
      });
    });
  });
}

function checkOrder(ctx, r) {
  Object.keys(ctx.docs).forEach(page => {
    exercisesOf(ctx.docs[page]).forEach(e => {
      if (e.kind !== "order") return;
      r.count++;
      const list = e.el.query("ol.order, ul.order");
      if (!list) { r.fail(page + ":" + e.line + ": order exercise without an ol.order/ul.order"); return; }
      const n = list.children.filter(c => c.type === "element" && c.name === "li").length;
      if (n < 2) r.fail(page + ":" + e.line + ": order list has " + n + " item(s)");
    });
    /* blanks: every .blank has a key */
    exercisesOf(ctx.docs[page]).forEach(e => {
      if (e.kind !== "blank") return;
      const blanks = e.el.queryAll(".blank");
      if (!blanks.length) r.fail(page + ":" + e.line + ": blank exercise without any .blank");
      blanks.forEach(b => { if (!b.getAttribute("data-answer")) r.fail(page + ":" + b.line + ": .blank without data-answer"); });
    });
  });
}

/* --------------------------------------------------------- migrations -- */

/* The Supabase CLI's file name: a 14-digit UTC timestamp, an underscore, a name. */
const MIGRATIONS_DIR = "supabase/migrations";
const SCHEMA_FILE = "supabase/schema.sql";
const MIGRATION_NAME = /^(\d{14})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;
const MIGRATIONS_RULE = "a change to " + SCHEMA_FILE + " ships with a new file in " + MIGRATIONS_DIR + "/ holding the incremental statements, applied to the live project before the merge (" + MIGRATIONS_DIR + "/README.md)";

/* true when the fourteen digits are a real date and time */
function isTimestamp(ts) {
  const n = [ts.slice(0, 4), ts.slice(4, 6), ts.slice(6, 8), ts.slice(8, 10), ts.slice(10, 12), ts.slice(12, 14)].map(Number);
  const d = new Date(Date.UTC(n[0], n[1] - 1, n[2], n[3], n[4], n[5]));
  return d.getUTCFullYear() === n[0] && d.getUTCMonth() === n[1] - 1 && d.getUTCDate() === n[2] &&
    d.getUTCHours() === n[3] && d.getUTCMinutes() === n[4] && d.getUTCSeconds() === n[5];
}

/* The ref this check compares against. Not --base: that is the commit readers' progress was
   last saved against, usually older than every migration here, and against it any migration at
   all would count as new. So: --migrations-base if given, else the commit HEAD left main at
   (HEAD itself on main, which leaves only uncommitted changes to judge), else --base with a
   warning, for a checkout that has no main to ask. */
function migrationsBase() {
  const given = opts["migrations-base"];
  if (given !== undefined) return { ref: given === true ? "" : String(given), why: "--migrations-base" };
  const trunks = ["main", "origin/main"];
  for (let i = 0; i < trunks.length; i++) {
    if (!git.resolveRef(ROOT, trunks[i])) continue;
    try {
      const sha = execFileSync("git", ["merge-base", "HEAD", trunks[i]], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (sha) return { ref: sha.slice(0, 10), why: "where HEAD left " + trunks[i] };
    } catch (e) { /* no common history with it; try the next */ }
  }
  return { ref: BASE, why: "--base", weak: true };
}

/* true when a file holds nothing but comments and white space */
function sqlIsEmpty(src) {
  return !src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "").trim();
}

/* The site deploys on merge, the database does not: a schema change that reaches readers
   before its SQL has been run breaks every signed-in sync. The check can only see that the
   migration file was written; applying it is a step in OPERATIONS.md. */
function checkMigrations(ctx, r) {
  const base = migrationsBase();
  if (!base.ref || !git.resolveRef(ROOT, base.ref)) { r.fail("base ref " + (base.ref || "(empty)") + " (" + base.why + ") does not resolve"); return; }
  const ref = base.ref;
  if (base.weak) r.warn("neither main nor origin/main resolves here, so this compared against --base " + ref + ", which is older than the migrations and lets a " + SCHEMA_FILE + " change through; pass --migrations-base=<the commit being merged into>");
  /* everything in the folder is a migration except its README and dotfiles; a base without the folder lists nothing */
  const isMigration = f => f !== "README.md" && f[0] !== ".";
  const dir = path.join(ROOT, MIGRATIONS_DIR);
  const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter(isMigration).sort() : [];
  const atBase = git.listFiles(ROOT, ref, MIGRATIONS_DIR).filter(p => isMigration(p.slice(MIGRATIONS_DIR.length + 1)));
  /* a file that was at the base has been merged, so it has been applied: it stays as it was */
  let lastAtBase = "";
  atBase.forEach(p => {
    const m = MIGRATION_NAME.exec(p.slice(MIGRATIONS_DIR.length + 1));
    if (m && m[1] > lastAtBase) lastAtBase = m[1];
    if (!exists(p)) r.fail(p + ": was at base " + ref + " and is gone; an applied migration is never renamed or deleted, a mistake is corrected by a newer file");
    else if (read(p) !== git.showText(ROOT, ref, p)) r.fail(p + ": differs from its content at base " + ref + "; an applied migration is never edited, a mistake is corrected by a newer file");
  });
  const atBaseSet = new Set(atBase);
  const byStamp = {}, added = [];
  names.forEach(f => {
    r.count++;
    const rel = MIGRATIONS_DIR + "/" + f;
    const m = MIGRATION_NAME.exec(f);
    if (!m || !fs.statSync(path.join(dir, f)).isFile()) { r.fail(rel + ": not a migration file name; the format is <YYYYMMDDHHMMSS>_<name>.sql with a lower-case name of letters, digits and underscores"); return; }
    if (!isTimestamp(m[1])) { r.fail(rel + ": " + m[1] + " is not a date and time (the format is <YYYYMMDDHHMMSS>_<name>.sql, in UTC)"); return; }
    if (byStamp[m[1]]) r.fail(rel + ": shares the timestamp " + m[1] + " with " + byStamp[m[1]] + ", so their order is undefined");
    else byStamp[m[1]] = f;
    if (atBaseSet.has(rel)) return;
    if (lastAtBase && m[1] <= lastAtBase) r.fail(rel + ": its timestamp is not later than " + lastAtBase + ", the newest migration at base " + ref + "; a new migration sorts after every one already applied");
    if (sqlIsEmpty(read(rel))) r.fail(rel + ": holds no SQL statement");
    added.push(f);
  });
  const now = exists(SCHEMA_FILE) ? read(SCHEMA_FILE) : null;
  const then = git.showText(ROOT, ref, SCHEMA_FILE);
  const changed = now !== then;
  r.note("base " + ref + " (" + base.why + "); " + SCHEMA_FILE + " " + (changed ? "differs from it" : "is unchanged since") + "; " + names.length + " migration file(s), " + added.length + " new since base" + (added.length ? " (" + added.join(", ") + ")" : ""));
  if (changed && !added.length) r.fail(SCHEMA_FILE + " differs from base " + ref + " but no migration has been added since then. The rule: " + MIGRATIONS_RULE);
}

/* ------------------------------------------------------- placeholders -- */

/* BMSite.grade from assets/site.js, under a window with no DOM to speak of */
function loadGrade() {
  const noop = () => {};
  const el = {
    getAttribute: () => null, setAttribute: noop, removeAttribute: noop, hasAttribute: () => false,
    appendChild: noop, insertBefore: noop, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: noop, classList: { add: noop, remove: noop }, style: {}
  };
  const document = {
    readyState: "complete", body: el, documentElement: el, querySelector: () => null, querySelectorAll: () => [],
    getElementById: () => null, createElement: () => el, addEventListener: noop
  };
  const window = {
    document, console, addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }),
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop }
  };
  window.window = window;
  window.self = window;
  vm.createContext(window);
  vm.runInContext(read("assets/site.js"), window, { filename: "assets/site.js" });
  if (!window.BMSite || typeof window.BMSite.grade !== "function") throw new Error("assets/site.js did not export BMSite.grade under the stub");
  return window.BMSite.grade;
}

/* A placeholder shows the form an answer takes ("e.g. 2,-3"). If the grader would mark
   what it shows as correct, the empty box is giving the answer away. */
function checkPlaceholders(ctx, r) {
  const grade = loadGrade();
  Object.keys(ctx.docs).forEach(page => {
    exercisesOf(ctx.docs[page]).forEach(e => {
      const shown = e.el.getAttribute("data-placeholder");
      if (!shown || e.kind !== "text") return;
      r.count++;
      const tol = parseFloat(e.el.getAttribute("data-tol") || "") || 0;
      const example = /\be\.g\.\s*(.+)$/.exec(shown);
      const given = [shown].concat(example ? [example[1]] : []).map(s => s.trim());
      if (given.some(g => grade(g, e.answer, e.type, tol))) {
        r.fail(page + ":" + e.line + ": placeholder " + JSON.stringify(shown) + " is graded correct against the key " + JSON.stringify(e.answer));
      }
    });
  });
}

/* -------------------------------------------------- account merge laws -- */

function loadMerge() {
  const src = read("assets/account.js");
  const noop = () => {};
  const el = () => ({ setAttribute: noop, removeAttribute: noop, appendChild: noop, addEventListener: noop, style: {}, classList: { add: noop, remove: noop }, querySelector: () => null, contains: () => false });
  const document = {
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener: noop,
    createElement: el, body: el(), head: el(), visibilityState: "visible", activeElement: null
  };
  const window = {
    BMStore: { keys: { progress: "bm.progress.v1", play: "bm.play.v1", last: "bm.last", attempts: "bm.attempts.v1", activity: "bm.activity.v1", lesson: "bm.lesson.v1" },
      read: (k, fb) => fb, write: noop, on: noop, emit: noop },
    BMSite: { rootPrefix: () => "", escapeHtml: s => String(s), chapterName: () => "", dayKey: () => "2026-01-01" },
    BM_CONFIG: {}, localStorage: { getItem: () => null, setItem: noop }, location: { hash: "", search: "", href: "http://localhost/" },
    addEventListener: noop, matchMedia: () => ({ matches: false }), setTimeout, clearTimeout, console, Promise, URL, document
  };
  window.window = window;
  const sandbox = { window, document, console, setTimeout, clearTimeout, Promise, URL, Infinity, Math, Date, Object, Array, JSON };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "assets/account.js" });
  const A = window.BMAccount;
  if (!A || typeof A.merge !== "function") throw new Error("assets/account.js did not export BMAccount.merge under the stub");
  return A.merge;
}

/* a small seeded PRNG so a failing case can be reproduced by seed */
function rng(seed) {
  let s = seed >>> 0 || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  next.int = (n) => Math.floor(next() * n);
  next.pick = (arr) => arr[next.int(arr.length)];
  next.maybe = (p) => next() < (p === undefined ? 0.5 : p);
  return next;
}

const CHAPTERS = ["ch01", "ch02", "ch05", "interlude"];
const KEYS = ["e1", "e2", "e3", "k1", "k2", "t1", "p4"];
const DAYS = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"];
/* What a later version of the site might store that this one has never heard of
   (account.js `later`): few keys and few values, so two devices often hold the same key
   and disagree about it. The two objects differ only in the order of their keys. One key
   is named like something every object inherits, and is data all the same. */
const UNKNOWN_KEYS = ["zz", "~later", "rung", "constructor"];
const UNKNOWN_VALUES = [0, 7, -1, "x", "", true, null, [1, 2], [2, 1], { a: 1, b: [1] }, { b: [1], a: 1 }, { a: { c: 2 } }];
function randomState(R) {
  const st = {};
  const pickSome = (arr, p) => arr.filter(() => R.maybe(p === undefined ? 0.5 : p));
  const unknown = (into, values) => {
    pickSome(UNKNOWN_KEYS, 0.2).forEach(k => { into[k] = JSON.parse(JSON.stringify(R.pick(values))); });
    return into;
  };
  /* an unknown field of a record can hold anything */
  const fields = (rec) => unknown(rec, UNKNOWN_VALUES);
  /* an unknown key of a store keyed by chapter, exercise, section and so on is passed
     through only when it holds no record: a record there is merged as one of that kind,
     the same path as the known keys take */
  const entries = (map) => unknown(map, UNKNOWN_VALUES.filter(v => !v || typeof v !== "object" || Array.isArray(v)));
  st.progress = {};
  pickSome(CHAPTERS).forEach(ch => {
    const solved = {}; pickSome(KEYS).forEach(k => { solved[k] = true; });
    st.progress[ch] = fields({ solved, total: R.int(12) });
  });
  entries(st.progress);
  st.play = {};
  pickSome(CHAPTERS).forEach(ch => {
    const done = {}; pickSome(["pythagoras:0", "pythagoras:1", "linsys:0"]).forEach(k => { done[k] = true; });
    const rec = { done, total: R.int(6) };
    if (R.maybe(0.6)) rec.guess = R.int(4);
    st.play[ch] = fields(rec);
  });
  entries(st.play);
  /* attempt records as site.js writes them (initExercises check()/reveal(), lesson.js
     advance()): `tries` >= 1 when present, `hints` only 1 or 2, `first` only alongside
     `solved`, `skipped` never alongside `solved`, and `section`/`inline` fixed by the
     page markup — so two devices can never disagree about them for the same key */
  st.attempts = {};
  pickSome(CHAPTERS).forEach(ch => {
    st.attempts[ch] = {};
    pickSome(KEYS).forEach((k, idx) => {
      const a = {};
      const inlineKey = /^[kt]/.test(k);
      if (R.maybe(0.8)) a.tries = 1 + R.int(4);
      else a.opened = 1;                      /* solution opened before any check */
      if (a.tries && R.maybe(0.4)) a.hints = 1 + R.int(2);
      if (R.maybe(0.3)) a.opened = 1;
      if (inlineKey) a.inline = 1;
      if (R.maybe(0.85)) a.section = ["one-unknown", "ch02#one-unknown", "warmup"][(ch.length + k.charCodeAt(1)) % 3];
      if (a.tries && R.maybe(0.5)) { a.solved = 1700000000000 + R.int(1e9); a.first = a.tries === 1 && !a.opened ? 1 : 0; }
      else if (inlineKey && R.maybe(0.3)) a.skipped = 1;
      st.attempts[ch][k] = fields(a);
    });
    entries(st.attempts[ch]);
  });
  entries(st.attempts);
  const days = {}; pickSome(DAYS).forEach(d => { days[d] = 1 + R.int(80); });
  st.activity = fields({ days });
  if (R.maybe(0.5)) st.activity.goal = R.pick([20, 30, 50]);
  const reached = {}; pickSome(CHAPTERS).forEach(ch => { reached[ch] = 1 + R.int(30); });
  st.lesson = fields({ reached });
  if (R.maybe(0.5)) st.lesson.mode = R.pick(["steps", "page"]);
  st.last = R.maybe(0.6) ? { id: R.pick(CHAPTERS), section: R.maybe() ? "one-unknown" : null } : null;
  /* the game layer that is about to land; mergeGame does not exist yet */
  const ach = {}; pickSome(["first-solve", "ten-day", "chapter-1"]).forEach(k => { ach[k] = 1700000000000 + R.int(1e9); });
  const cmp = {}; pickSome(CHAPTERS, 0.4).forEach(ch => { cmp[ch] = {}; pickSome(KEYS, 0.4).forEach(k => { cmp[ch][k] = 1; }); });
  const sec = {}; pickSome(["ch02#one-unknown", "ch05#angles"]).forEach(s => {
    sec[s] = fields({ n: R.int(10), ok: R.int(10), box: R.int(5), last: R.pick(DAYS), fix: 1700000000000 + R.int(1e9) });
  });
  const best = {}; pickSome(["sprint", "survival"]).forEach(m => { best[m] = fields({ score: R.int(500), hearts: R.int(4), day: R.pick(DAYS) }); });
  const enc = {}; pickSome(["ch02/practice", "ch05/practice"]).forEach(e => { enc[e] = fields({ medal: R.pick(["bronze", "silver", "gold"]), day: R.pick(DAYS) }); });
  const daily = {}; pickSome(DAYS).forEach(d => { daily[d] = 1; });
  st.game = fields({ ach, cmp, sec: entries(sec), best: entries(best), enc: entries(enc), daily, maxed: R.int(5) });
  /* the shape marker a later version may set (account.js SCHEMA): absent on most devices */
  if (R.maybe(0.3)) st.game.v = R.pick([1, 2, 9, 10]);   /* 9 and 10: the larger number is not the later string */
  return st;
}

/* every place in a state where one of UNKNOWN_KEYS sits, as a path of keys; what it holds
   is not looked into */
function unknownPaths(x, at, out) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return out;
  Object.keys(x).forEach(k => {
    if (UNKNOWN_KEYS.indexOf(k) > -1) out.push(at.concat(k));
    else unknownPaths(x[k], at.concat(k), out);
  });
  return out;
}
/* what a state holds at a path: its own, never what every object inherits */
function dig(x, at) {
  return at.reduce((o, k) => (o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined), x);
}

/* drop the four fields that are deliberately local-first before comparing */
function stripLocalFirst(m) {
  const c = JSON.parse(JSON.stringify(m));
  delete c.last;
  if (c.activity) delete c.activity.goal;
  if (c.lesson) delete c.lesson.mode;
  if (c.play) Object.keys(c.play).forEach(ch => { if (c.play[ch]) delete c.play[ch].guess; });
  return c;
}
function canon(x) {
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return "[" + x.map(canon).join(",") + "]";
  return "{" + Object.keys(x).sort().filter(k => x[k] !== undefined).map(k => JSON.stringify(k) + ":" + canon(x[k])).join(",") + "}";
}

function checkMerge(ctx, r) {
  let merge;
  try { merge = loadMerge(); } catch (e) { r.fail(e.message); return; }
  const N = 2000;
  const R = rng(20261004);
  let gameSeen = false, gameChecked = false;
  const seen = {};
  for (let i = 0; i < N; i++) {
    const seed = R.int(2 ** 31);
    const S = rng(seed);
    const a = randomState(S), b = randomState(S), c = randomState(S);
    r.count++;
    let ab, ba, abc, abc2, m;
    try {
      ab = merge(a, b); ba = merge(b, a);
      abc = merge(merge(a, b), c); abc2 = merge(a, merge(b, c));
      m = merge(ab, ab);
    } catch (e) { r.fail("seed " + seed + ": merge threw: " + e.message); if (r.fails.length > 5) break; continue; }
    const law = (name, x, y) => {
      if (canon(stripLocalFirst(x)) !== canon(stripLocalFirst(y))) {
        if (!seen[name]) r.fail(name + " fails (seed " + seed + "): " + firstDiff(stripLocalFirst(x), stripLocalFirst(y)));
        seen[name] = (seen[name] || 0) + 1;
      }
    };
    law("commutativity merge(a,b)=merge(b,a)", ab, ba);
    law("associativity merge(merge(a,b),c)=merge(a,merge(b,c))", abc, abc2);
    law("idempotence merge(m,m)=m", m, ab);
    /* local-first fields keep the local value */
    if (a.last && canon(ab.last) !== canon(a.last)) r.fail("seed " + seed + ": merge did not keep local `last`");
    if (ab.game !== undefined) {
      gameSeen = true;
      /* once mergeGame exists: unions, maxima, earliest achievement time */
      Object.keys(a.game.ach).forEach(k => { if (!ab.game.ach || !(k in ab.game.ach)) { if (!gameChecked) r.fail("seed " + seed + ": game.ach lost " + k); gameChecked = true; } });
      ["maxed"].forEach(k => { if (ab.game[k] !== undefined && ab.game[k] < Math.max(a.game[k] || 0, b.game[k] || 0)) r.fail("seed " + seed + ": game." + k + " should be the maximum"); });
      /* the shape marker: the larger of the two, and not invented where neither has one */
      if (ab.game.v !== (Math.max(a.game.v || 0, b.game.v || 0) || undefined)) r.fail("seed " + seed + ": game.v should be the maximum, and absent when neither side has one");
      /* a key this version has never heard of is never dropped, at whatever level it sits:
         it comes out as the later canonical JSON of what the two sides hold */
      unknownPaths(a, [], []).concat(unknownPaths(b, [], [])).forEach(at => {
        const held = [dig(a, at), dig(b, at)].filter(v => v !== undefined).map(canon).sort();
        const got = dig(ab, at);
        if (got === undefined || canon(got) !== held[held.length - 1]) {
          if (!seen.unknown) r.fail("seed " + seed + ": " + at.join(".") + " should be the later of " + held.join(" and ") + ", got " + (got === undefined ? "nothing" : canon(got)));
          seen.unknown = 1;
        }
      });
    }
  }
  Object.keys(seen).forEach(k => { if (seen[k] > 1) r.fail("  … " + k + " failed in " + seen[k] + " of " + N + " cases"); });
  if (!gameSeen) r.warn("merged output has no `game` key yet — the game-store assertions were skipped (they switch on when mergeGame lands)");
  /* and the laws must be observable at all: a hand case */
  const x = merge({ progress: { ch01: { solved: { e1: true }, total: 3 } } }, { progress: { ch01: { solved: { e2: true } } } });
  if (!x.progress.ch01.solved.e1 || !x.progress.ch01.solved.e2 || x.progress.ch01.total !== 3) r.fail("hand case: union of solved / max of total is wrong: " + JSON.stringify(x.progress));
  /* and one for a field no version of this file knows: kept from one side, the later
     canonical JSON from two */
  const y = merge({ attempts: { ch01: { e1: { tries: 2, rung: 1, note: "a" } } } }, { attempts: { ch01: { e1: { tries: 1, rung: 3 } } } });
  if (canon(y.attempts.ch01.e1) !== canon({ tries: 2, rung: 3, note: "a" })) r.fail("hand case: unknown attempt fields were not carried through: " + JSON.stringify(y.attempts));
}
function firstDiff(x, y, p) {
  p = p || "";
  if (typeof x !== "object" || typeof y !== "object" || x === null || y === null) return p + ": " + JSON.stringify(x) + " vs " + JSON.stringify(y);
  const keys = new Set(Object.keys(x).concat(Object.keys(y)));
  for (const k of keys) {
    if (canon(x[k]) !== canon(y[k])) return firstDiff(x[k], y[k], p + "/" + k);
  }
  return p + ": (no diff found)";
}

/* --------------------------------------------------------------- CSS ----- */

function cssFiles() {
  const out = [];
  site.walk(path.join(ROOT, "assets"), p => /\.css$/.test(p), out);
  return out;
}

function checkAnimations(ctx, r) {
  cssFiles().forEach(f => {
    const rel = site.rel(f);
    cssLib.animations(fs.readFileSync(f, "utf8")).forEach(a => {
      r.count++;
      if (/\binfinite\b/.test(a.value + " " + a.count)) r.warn(rel + ":" + a.line + ": `" + a.selector + "` animates infinitely (" + (a.value || a.count) + ")" + (a.media.length ? " under " + a.media.join(" ") : ""));
    });
  });
}

function checkContrast(ctx, r) {
  const pairsFile = path.join(__dirname, "contrast-pairs.json");
  const pairs = JSON.parse(fs.readFileSync(pairsFile, "utf8"));
  const partIds = ctx.curriculum.parts.map(p => p.id);
  cssFiles().forEach(f => {
    const rel = site.rel(f);
    const T = cssLib.tokens(fs.readFileSync(f, "utf8"));
    if (!Object.keys(T.light).length) return; /* a stylesheet without tokens: nothing to check */
    if (!T.hasDark) r.warn(rel + ": no dark token block found");
    T.drift.forEach(d => r.warn(rel + ": dark tokens differ between the toggle block and the media block — " + d));
    const skipped = new Set(), unresolved = [];
    pairs.forEach(pair => {
      const themes = pair.themes || ["light", "dark"];
      themes.forEach(theme => {
        const scopes = pair.parts ? partIds.map(id => ({ label: theme + "/" + id, table: Object.assign({}, T[theme], (T.parts[id] || {})[theme] || {}) }))
          : [{ label: theme, table: T[theme] }];
        scopes.forEach(sc => {
          const missing = [pair.fg, pair.bg].filter(t => !sc.table.hasOwnProperty(t));
          if (missing.length) { missing.forEach(m => skipped.add(m)); return; }
          r.count++;
          const fgV = cssLib.resolveVar(sc.table[pair.fg], sc.table), bgV = cssLib.resolveVar(sc.table[pair.bg], sc.table);
          const fg = cssLib.parseColor(fgV), bg = cssLib.parseColor(bgV);
          if (!fg || !bg || fg[3] < 1 || bg[3] < 1) { unresolved.push(pair.fg + " on " + pair.bg + " [" + sc.label + "]: " + (fg && bg ? "not opaque" : "not a parseable colour") + " (" + fgV + " / " + bgV + ")"); return; }
          const ratio = cssLib.contrast(fg, bg);
          if (ratio < pair.min) r.fail(rel + " [" + sc.label + "]: " + pair.fg + " (" + fgV + ") on " + pair.bg + " (" + bgV + ") = " + ratio.toFixed(2) + ":1, needs " + pair.min + ":1");
        });
      });
    });
    if (skipped.size) r.warn(rel + ": SKIP pairs using tokens not defined yet: " + Array.from(skipped).sort().join(", "));
    unresolved.forEach(u => r.warn(rel + ": SKIP " + u));
  });
}

/* ------------------------------------------------------------- runner ---- */

const CHECKS = [
  { name: "syntax", run: checkSyntax, what: "node --check on every .js in src/, assets/, data/, tools/" },
  { name: "progress-keys", run: checkProgressKeys, what: "exercise keys and fingerprints unchanged since --base; every exercise has an id" },
  { name: "ids", run: checkIds, what: "no id is on more than one element of a page" },
  { name: "lesson-steps", run: checkLessonSteps, what: "each chapter is cut into the lesson steps recorded in tools/lesson-steps.json (WARN)" },
  { name: "shell", run: checkShell, what: "each page's head, body tag and top bar, as lib/shell.js writes them, are the ones in tools/shell.json; one module entry per page, its kind's" },
  { name: "curriculum", run: checkCurriculum, what: "every chapter file exists; every section id is an <h2 id> in it" },
  { name: "links", run: checkLinks, what: "relative hrefs/srcs resolve to files, anchors to ids" },
  { name: "widgets", run: checkWidgets, what: "every data-widget / data-figure is a defined factory" },
  { name: "sections", run: checkSections, what: "every data-section names a real section" },
  { name: "choices", run: checkChoices, what: "choice/multi answer indices are within the options" },
  { name: "order", run: checkOrder, what: "order lists have >= 2 items; blanks carry keys" },
  { name: "migrations", run: checkMigrations, what: "a supabase/schema.sql change since main ships a new, well-named migration; applied ones are untouched" },
  { name: "placeholders", run: checkPlaceholders, what: "no answer box shows an example its own key accepts" },
  { name: "merge", run: checkMerge, what: "BMAccount.merge is commutative, associative, idempotent (2000 seeded cases)" },
  { name: "animations", run: checkAnimations, what: "no infinite CSS animations (WARN for now)" },
  { name: "contrast", run: checkContrast, what: "WCAG contrast of token pairs in tools/contrast-pairs.json, both themes, all Parts" }
];

function main() {
  const t0 = Date.now();
  let ctx;
  try { ctx = buildContext(); }
  catch (e) { console.error("FAIL  setup: " + e.message); process.exit(1); }
  const only = opts.only ? String(opts.only).split(",") : null;
  let anyFail = false, anyWarn = false;
  const list = CHECKS.filter(c => !only || only.includes(c.name));
  if (!list.length) { console.error("no such check; available: " + CHECKS.map(c => c.name).join(", ")); process.exit(2); }
  list.forEach(c => {
    const r = result();
    try { c.run(ctx, r); } catch (e) { r.fail("check crashed: " + (e.stack || e.message)); }
    const status = r.fails.length ? "FAIL" : r.warns.length ? (STRICT ? "FAIL" : "WARN") : "PASS";
    if (status === "FAIL") anyFail = true;
    if (r.warns.length) anyWarn = true;
    console.log(status.padEnd(5) + " " + c.name.padEnd(14) + " " + String(r.count).padStart(5) + "  " + c.what);
    r.notes.forEach(n => console.log("        · " + n));
    r.fails.forEach(m => console.log("        ✗ " + m));
    r.warns.forEach(m => console.log("        ! " + m));
  });
  console.log((anyFail ? "FAILED" : anyWarn ? "passed with warnings" : "all passed") + " in " + ((Date.now() - t0) / 1000).toFixed(1) + "s (base " + BASE + ")");
  process.exit(anyFail ? 1 : 0);
}

if (require.main === module) main();
module.exports = { CHECKS, result, pageKeys, lessonSteps, stepsDiff, shellOf, shellDiff, scriptsProblems, randomState, stripLocalFirst, canon };
