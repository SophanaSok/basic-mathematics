#!/usr/bin/env node
"use strict";
/* Writes src/vendor/fonts.css: the @font-face rules of the site's three typefaces, from
   the fontsource packages, declared as Google Fonts declared them for the link every
   page carried until the fonts moved to npm:

     https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800
       &family=Inter:wght@400;500;600;700&family=Newsreader:ital,wght@0,400;0,600;1,400
       &display=swap

   For that link a current browser got, per family and upright style, one variable
   file per subset, declared once per requested weight (a @font-face naming that one
   weight and the file, so font-weight: 650 in the site's CSS took the 700 face, as it
   does with any list of single weights), and the one italic weight as a static
   instance. The fontsource packages hold the same files: @fontsource-variable/<family>
   the variable ones (its files/<family>-<subset>-wght-normal.woff2 are byte for byte
   what fonts.gstatic.com served Chromium, compared 2026-10-04), @fontsource/newsreader
   the italic. But the variable packages' stylesheets name the family 'Inter Variable'
   and declare the whole weight range (font-weight: 100 900), which would render that
   650 as a true 650, so they are not imported as they are. This writes the rules
   instead: for each face in FACES, the package stylesheet's @font-face per subset (its
   file, its unicode-range, font-display: swap) once per requested weight, the family
   named as the tokens in src/styles/tokens.css name it (--sans, --serif, --display), the file
   named by its package path, which Vite resolves and copies beside the bundle
   (vite.config.ts). The italic rules are the static package's, as they are.

   Usage: node tools/gen-fonts.js            write src/vendor/fonts.css
          node tools/gen-fonts.js --check    exit 1 when the file is not what this writes
   checks.test.js runs the check, so a fontsource update (new subsets, a changed range)
   fails `npm run check` until this is run again. */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FILE = "src/vendor/fonts.css";

/* the faces the Google Fonts link asked for, in its order; `css` is the package
   stylesheet whose @font-face rules carry each subset's file and unicode-range */
const FACES = [
  { family: "Bricolage Grotesque", style: "normal", weights: [700, 800], css: "@fontsource-variable/bricolage-grotesque/wght.css" },
  { family: "Inter", style: "normal", weights: [400, 500, 600, 700], css: "@fontsource-variable/inter/wght.css" },
  { family: "Newsreader", style: "italic", weights: [400], css: "@fontsource/newsreader/400-italic.css" },
  { family: "Newsreader", style: "normal", weights: [400, 600], css: "@fontsource-variable/newsreader/wght.css" }
];

/* "@scope/name/sub/file.css" -> "@scope/name" */
function packageOf(spec) { return spec.split("/").slice(0, 2).join("/"); }

/* the @font-face rules of a package stylesheet: [{ name, family, style, weight, src,
   range }], `name` the comment the package writes above each (inter-latin-wght-normal),
   `src` with each url(./files/…) turned into the package's path */
function rulesOf(spec) {
  const file = path.join(ROOT, "node_modules", spec);
  if (!fs.existsSync(file)) throw new Error(spec + " is not at node_modules/" + spec + "; run `npm ci`");
  const pkg = packageOf(spec);
  const out = [];
  for (const m of fs.readFileSync(file, "utf8").matchAll(/\/\*\s*([^*]+?)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)) {
    const decl = (name) => { const d = new RegExp("(?:^|;)\\s*" + name + "\\s*:\\s*([^;]+)").exec(m[2]); return d ? d[1].trim() : null; };
    const rule = { name: m[1], family: decl("font-family"), style: decl("font-style"), weight: decl("font-weight"), display: decl("font-display"), src: decl("src"), range: decl("unicode-range") };
    Object.keys(rule).forEach(k => { if (rule[k] === null) throw new Error(spec + ": the @font-face " + rule.name + " has no " + k); });
    rule.src = rule.src.replace(/url\(\s*["']?\.\/files\/([^"')\s]+)["']?\s*\)/g, (u, f) => "url(" + pkg + "/files/" + f + ")");
    if (/url\(\s*["']?\./.test(rule.src)) throw new Error(spec + ": the @font-face " + rule.name + " names a file outside files/: " + rule.src);
    out.push(rule);
  }
  if (!out.length) throw new Error(spec + " has no @font-face rule");
  return out;
}

/* a package rule serves a face at a weight when its family is the face's (or the
   variable package's name for it), its style is the face's and its weight is that one
   weight or a range around it */
function serves(rule, face, weight) {
  const family = rule.family.replace(/^['"]|['"]$/g, "");
  if (family !== face.family && family !== face.family + " Variable") return false;
  if (rule.style !== face.style) return false;
  const w = rule.weight.split(/\s+/).map(Number);
  return w.length === 1 ? w[0] === weight : w[0] <= weight && weight <= w[1];
}

function fontsCss() {
  const lines = [
    "/* The site's three typefaces, self-hosted from the fontsource packages and declared as",
    "   Google Fonts declared them for the link the pages carried before: one @font-face per",
    "   family, style, requested weight and subset (Bricolage Grotesque 700 and 800; Inter 400,",
    "   500, 600 and 700; Newsreader 400 and 600, and 400 italic), each naming its one weight,",
    "   with font-display: swap and the subset's unicode-range, so a browser fetches only the",
    "   subsets a page uses and paints with the fallback meanwhile. The upright families are",
    "   the packages' variable files, the italic a static instance: the files Google served.",
    "   The family names are the ones the tokens in src/styles/tokens.css name (--sans, --serif,",
    "   --display), whose fallbacks are unchanged. The shell links this file on every page,",
    "   first of all its stylesheets, where the Google Fonts link was (tools/lib/shell.js",
    "   VENDOR_STYLES); the build copies the files beside the bundle.",
    "   WRITTEN BY tools/gen-fonts.js from the packages' own stylesheets: edit that, not this. */"
  ];
  FACES.forEach(face => {
    const rules = rulesOf(face.css);
    face.weights.forEach(weight => {
      const fit = rules.filter(r => serves(r, face, weight));
      if (!fit.length) throw new Error(face.css + " has no @font-face for " + face.family + " " + face.style + " " + weight);
      fit.forEach(r => {
        lines.push("", "/* " + r.name + ", " + weight + " */", "@font-face {",
          "  font-family: '" + face.family + "';",
          "  font-style: " + face.style + ";",
          "  font-weight: " + weight + ";",
          "  font-display: " + r.display + ";",
          "  src: " + r.src + ";",
          "  unicode-range: " + r.range + ";",
          "}");
      });
    });
  });
  return lines.join("\n") + "\n";
}

/* "" when the file is what fontsCss() writes, else one line saying how it differs */
function problem() {
  const want = fontsCss();
  let have;
  try { have = fs.readFileSync(path.join(ROOT, FILE), "utf8"); } catch (e) { return FILE + " is missing; run `node tools/gen-fonts.js`"; }
  if (have === want) return "";
  let i = 0;
  while (i < have.length && have[i] === want[i]) i++;
  return FILE + " is not what tools/gen-fonts.js writes (first difference at character " + i + ": file " + JSON.stringify(have.slice(i, i + 40)) + ", generator " + JSON.stringify(want.slice(i, i + 40)) + "); run `node tools/gen-fonts.js`";
}

function main() {
  const check = process.argv.includes("--check");
  if (check) {
    const why = problem();
    console.log((why ? "FAIL  " + why : "PASS  " + FILE + " is what tools/gen-fonts.js writes"));
    process.exit(why ? 1 : 0);
  }
  const text = fontsCss();
  fs.writeFileSync(path.join(ROOT, FILE), text);
  console.log("wrote " + FILE + ": " + (text.match(/@font-face/g) || []).length + " @font-face rules from " + FACES.map(f => f.css).join(", "));
}

if (require.main === module) main();
module.exports = { FILE, FACES, fontsCss, problem };
