"use strict";
/* The npm packages the site is built from, and which file under src/vendor/ brings each
   in. A vendor module is the one place a package is imported: src/vendor/katex.js
   imports the katex scripts and katex.css its stylesheet, fonts.css names the fontsource
   packages' font files (in url(), written by tools/gen-fonts.js), supabase.js
   supabase-js. So a file under node_modules/ in the bundle is named and checked by that
   module: vite.config.ts bundleNames puts it in the chunk the vendor module's importers
   call for, and check-dist.js reads a chunk's source map and holds every node_modules
   file in it to the vendor module its name says.

   A package's dependencies come with it: what @supabase/supabase-js imports
   (@supabase/auth-js, tslib, …) is supabase.js's too. That is read off the installed
   package.json files, so it is the tree as npm laid it out, not a list kept by hand.

   And the licences: everything in dist/bundle/ that is not the site's own comes from
   one of those packages, so the build writes bundle/LICENSES.txt (NOTICE) from their
   installed licence files, one section per package (licenseNotice below), and
   check-dist.js `licences` holds dist to it. */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const DIR = "src/vendor";
const NOTICE = "bundle/LICENSES.txt";

/* "@scope/name/sub/path" -> "@scope/name"; "name/sub" -> "name" */
function packageName(specifier) {
  const parts = specifier.split("/");
  return parts[0].charAt(0) === "@" ? parts.slice(0, 2).join("/") : parts[0];
}

/* the package a node_modules path is from (the innermost node_modules, for a nested
   copy), or null for a path that is not under node_modules */
function packageOf(rel) {
  let found = null;
  for (const m of String(rel).matchAll(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)(?=\/)/g)) found = m[1];
  return found;
}

/* a package and every package it depends on, by the installed package.json files
   (`dependencies` only: what gets bundled is what is imported, and a dev or peer
   dependency is not installed by the package itself) */
function closure(pkg, out) {
  out = out || [];
  if (out.includes(pkg)) return out;
  out.push(pkg);
  const file = path.join(ROOT, "node_modules", pkg, "package.json");
  if (!fs.existsSync(file)) throw new Error(pkg + " is not installed (no " + path.relative(ROOT, file) + "); run `npm ci`");
  Object.keys(JSON.parse(fs.readFileSync(file, "utf8")).dependencies || {}).sort().forEach(dep => closure(dep, out));
  return out;
}

/* a specifier that names a package: not a path (./x, ../x, /x), not a URL or data:,
   not a fragment */
const BARE = /^(?!\.{0,2}\/|[a-z][a-z0-9+.-]*:|#)[^"')\s]+$/i;

/* every src/vendor/*.js and *.css: { file, packages } with the packages its own import
   and export statements (a stylesheet's @import rules) and its url() references name,
   bare specifiers only, in order of first mention, and `all`, those with their
   dependencies */
let cache = null;
function vendorModules() {
  if (cache) return cache;
  cache = fs.readdirSync(path.join(ROOT, DIR)).filter(f => /\.(js|css)$/.test(f)).sort().map(f => {
    const file = DIR + "/" + f;
    const text = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const packages = [];
    const add = (spec) => { const pkg = packageName(spec); if (!packages.includes(pkg)) packages.push(pkg); };
    for (const m of text.matchAll(/^\s*@?(?:import|export)\b[^"'\n]*["']([^"'./][^"']*)["']/gm)) add(m[1]);
    for (const m of text.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) if (BARE.test(m[1])) add(m[1]);
    const all = [];
    packages.forEach(p => closure(p, all));
    return { file, packages, all };
  });
  return cache;
}

/* the vendor module a node_modules file belongs to: the one of its own kind (a script's
   is a .js, a stylesheet's a .css: katex.js and katex.css both bring in katex) whose
   packages, with their dependencies, hold the file's package. Throws for a file no
   vendor module brings in, and for one two of them do (a package both depend on would
   have to be placed by hand, and no such package exists yet). */
function isStylesheet(rel) { return /\.css(\?.*)?$/.test(rel); }
function vendorOf(rel) {
  const pkg = packageOf(rel);
  if (!pkg) throw new Error(rel + " is not under node_modules/");
  const css = isStylesheet(rel);
  const by = vendorModules().filter(v => isStylesheet(v.file) === css && v.all.includes(pkg));
  if (by.length === 1) return by[0];
  if (!by.length) throw new Error(rel + " is from the package " + pkg + ", which no " + (css ? "stylesheet" : "script") + " under " + DIR + "/ imports (directly or as a dependency), so nothing says which pages load it");
  throw new Error(rel + " is from the package " + pkg + ", which " + by.map(v => v.file).join(" and ") + " both bring in, so it has no one place in the bundle");
}

/* ---- licences ------------------------------------------------------------------
   Every package the vendor modules bring in, with their dependencies, each once:
   { name, version, license, by, file, text } with `license` the package.json field, `by`
   the vendor modules that bring it in, `file` the licence file the package ships
   (LICENSE, LICENSE.md, LICENCE.txt, …) or null, `text` its contents. In the order of
   the vendor modules and of each one's closure. */
function packages() {
  const out = [];
  vendorModules().forEach(v => v.all.forEach(name => {
    let p = out.find(o => o.name === name);
    if (!p) {
      const dir = path.join(ROOT, "node_modules", name);
      const meta = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
      const file = fs.readdirSync(dir).filter(f => /^licen[cs]e(\.(md|txt))?$/i.test(f)).sort()[0] || null;
      p = { name, version: String(meta.version), license: typeof meta.license === "string" ? meta.license : meta.license ? JSON.stringify(meta.license) : "(no license field)", by: [], file, text: file ? fs.readFileSync(path.join(dir, file), "utf8").replace(/\r\n/g, "\n").trim() : "" };
      out.push(p);
    }
    p.by.push(v.file);
  }));
  return out;
}

/* What a package's own licence file does not say about the files of it that are in
   dist: the KaTeX fonts are not the code's MIT but the SIL Open Font License, which
   each font file states in its name table (ids 0, 13 and 14; the text of that licence
   is in the fontsource packages' sections, every one of which is that licence). */
const NOTES = {
  katex: "The fonts beside the bundle (KaTeX_*.woff2, .woff and .ttf) are not under the MIT licence above. Each carries this notice in its name table: \"Copyright (c) 2009-2010, Design Science, Inc. (<www.mathjax.org>) Copyright (c) 2014-2018 Khan Academy (<www.khanacademy.org>), with Reserved Font Name KaTeX_<Family>. This Font Software is licensed under the SIL Open Font License, Version 1.1. This license available with a FAQ at: http://scripts.sil.org/OFL\". The text of that licence is below, in the sections of the @fontsource packages, whose fonts are under it too."
};

/* the text of bundle/LICENSES.txt: what the bundle holds that is not the site's own,
   and under what terms, from the installed packages */
function licenseNotice() {
  const list = packages();
  const rule = "=".repeat(78);
  const head = [
    "Third-party software in this site's bundle (the files beside this one), and the",
    "licences it is published under. One section per npm package the bundle is built",
    "from, and per package those depend on (listed all the same when none of its files",
    "is in the bundle, as with katex's command-line helper): its name and version as",
    "installed, the licence its package.json names, the file under src/vendor/ that brings",
    "it into the bundle, and the licence file it ships. Written by the build",
    "(vite.config.ts) from the installed packages; the site's own files are not listed.",
    "",
    "Packages: " + list.map(p => p.name + " " + p.version + " (" + p.license + ")").join(", ") + "."
  ];
  const sections = list.map(p => [
    rule,
    p.name + " " + p.version + " — " + p.license + " — brought in by " + p.by.join(", "),
    rule,
    p.text ? p.file + ":\n\n" + p.text : "(the package ships no licence file; its package.json names the licence above)"
  ].concat(NOTES[p.name] ? ["", "Note: " + NOTES[p.name]] : []).join("\n"));
  return head.concat([""], sections.join("\n\n")).join("\n") + "\n";
}

module.exports = { DIR, NOTICE, packageName, packageOf, closure, vendorModules, vendorOf, packages, licenseNotice };
