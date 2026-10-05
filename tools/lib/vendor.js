"use strict";
/* The npm packages the site is built from, and which file under src/vendor/ brings each
   in. A vendor module is the one place a package is imported: src/vendor/katex.js
   imports the katex scripts and katex.css its stylesheet, fonts.css the three fontsource
   packages' stylesheets, supabase.js supabase-js. So a file under node_modules/ in the
   bundle is named and checked by that module: vite.config.ts bundleNames puts it in the
   chunk the vendor module's importers call for, and check-dist.js reads a chunk's source
   map and holds every node_modules file in it to the vendor module its name says.

   A package's dependencies come with it: what @supabase/supabase-js imports
   (@supabase/auth-js, tslib, …) is supabase.js's too. That is read off the installed
   package.json files, so it is the tree as npm laid it out, not a list kept by hand. */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const DIR = "src/vendor";

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

/* every src/vendor/*.js and *.css: { file, packages } with the packages its own import
   and export statements (a stylesheet's @import rules) name, bare specifiers only, and
   `all`, those with their dependencies */
let cache = null;
function vendorModules() {
  if (cache) return cache;
  cache = fs.readdirSync(path.join(ROOT, DIR)).filter(f => /\.(js|css)$/.test(f)).sort().map(f => {
    const file = DIR + "/" + f;
    const packages = [];
    for (const m of fs.readFileSync(path.join(ROOT, file), "utf8").matchAll(/^\s*@?(?:import|export)\b[^"'\n]*["']([^"'./][^"']*)["']/gm)) {
      const pkg = packageName(m[1]);
      if (!packages.includes(pkg)) packages.push(pkg);
    }
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

module.exports = { DIR, packageName, packageOf, closure, vendorModules, vendorOf };
