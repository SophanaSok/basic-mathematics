#!/usr/bin/env node
"use strict";
/* Takes the Mochi web packs the Blender project wrote into public/models/mochi/ and
   writes the manifest the site reads them by.

   Blender and gltf-transform have already run, in /home/ssok/Projects/BLENDER/axolotl: each
   variant (pink, lilac) has a folder under BM_MOCHI_SRC (default
   /home/ssok/Projects/BLENDER/axolotl/site) holding mochi.gltf, mochi.bin, five WebP
   textures and poses.webp. This script only packs: it rewrites the texture uris to bare
   names (mochi-<variant>-<part>.webp), writes mochi-<variant>.glb with the textures kept
   external (tools/lib/glb.js writeGlb), copies the textures and the pose sheet beside it,
   and deletes whatever else is in public/models/mochi/. EXT_meshopt_compression is
   refused: the site's CSP cannot decode it.

   src/data/mochi-model.ts is then written from what the files hold: bytes, a sha-256 of the
   GLB, triangles, clip names and the morph target names. --check compares the manifest to
   the files and exits non-zero with the differences; checks.test.js and check-static.js
   run problems(). */
const fs = require("fs");
const path = require("path");
const glb = require("./lib/glb");

const ROOT = path.resolve(__dirname, "..");
const FILE = "src/data/mochi-model.ts";
const OUT_DIR = "public/models/mochi";
const SRC = process.env.BM_MOCHI_SRC || "/home/ssok/Projects/BLENDER/axolotl/site";
const VARIANTS = ["pink", "lilac"];
const PARTS = ["body", "gill", "eye", "pupil", "face"];
const EXTENSIONS_OK = ["KHR_mesh_quantization", "EXT_texture_webp"];
const BLENDER_PROJECT = "/home/ssok/Projects/BLENDER/axolotl";

const abs = (rel) => path.join(ROOT, rel);
const base = (v) => OUT_DIR + "/mochi-" + v;

/* the entries of the manifest as written in FILE, or null when there is no file */
function readManifest() {
  if (!fs.existsSync(abs(FILE))) return null;
  const text = fs.readFileSync(abs(FILE), "utf8");
  const body = /export const MOCHI_MODELS: readonly MochiModel\[\] = \[\n([\s\S]*?)\n\];/.exec(text);
  if (!body) throw new Error(FILE + " is not in the shape tools/gen-mochi.js writes");
  const entries = JSON.parse("[" + body[1].replace(/(\{ |, )(\w+): /g, '$1"$2": ') + "]");
  return { entries };
}

/* the part a texture holds: its name minus the axolotl_ or axolotl_lilac_ prefix */
function partOf(name) {
  const p = String(name || "").replace(/^axolotl_(lilac_)?/, "");
  return PARTS.includes(p) ? p : null;
}

function describe(variant) {
  const file = base(variant) + ".glb";
  const buf = fs.readFileSync(abs(file));
  const d = glb.describeGlb(buf, (uri) => {
    const f = abs(OUT_DIR + "/" + path.basename(uri));
    return path.basename(uri) === uri && fs.existsSync(f) ? fs.readFileSync(f) : null;
  });
  const { json } = glb.readGlb(buf);
  const mesh = (json.meshes || [])[0] || {};
  const morphs = (mesh.extras && mesh.extras.targetNames) || [];
  return { buf, d, morphs, json };
}

/* what is wrong with the manifest against the files: a list of lines */
function problems() {
  const out = [];
  let m;
  try { m = readManifest(); } catch (e) { return [e.message]; }
  if (!m) return [FILE + " is missing: run `npm run gen:mochi`"];
  const have = m.entries.map(e => e.variant);
  if (have.join(",") !== VARIANTS.join(",")) out.push("the manifest holds variants " + have.join(",") + ", not " + VARIANTS.join(","));
  const named = new Set();
  for (const e of m.entries) {
    const w = "mochi " + e.variant + ": ";
    named.add(path.basename(e.file)); named.add(path.basename(e.poses));
    e.images.forEach(im => {
      named.add(path.basename(im));
      if (!fs.existsSync(abs("public/" + im))) out.push(w + im + " does not exist");
    });
    if (!fs.existsSync(abs("public/" + e.poses))) out.push(w + e.poses + " does not exist");
    if (!fs.existsSync(abs("public/" + e.file))) { out.push(w + e.file + " does not exist"); continue; }
    let r;
    try { r = describe(e.variant); } catch (err) { out.push(w + err.message); continue; }
    const uris = r.d.images.map(im => im.uri === undefined ? "(embedded)" : "models/mochi/" + im.uri);
    if (uris.join(",") !== e.images.join(",")) out.push(w + "images " + uris.join(",") + ", manifest says " + e.images.join(","));
    if (r.buf.length !== e.bytes) out.push(w + r.buf.length + " bytes, manifest says " + e.bytes);
    if (glb.sha256(r.buf) !== e.sha) out.push(w + "sha " + glb.sha256(r.buf) + ", manifest says " + e.sha);
    if (r.d.triangles !== e.triangles) out.push(w + r.d.triangles + " triangles, manifest says " + e.triangles);
    const clips = r.d.animations.map(a => a.name);
    if (clips.join(",") !== e.clips.join(",")) out.push(w + "clips " + clips.join(",") + ", manifest says " + e.clips.join(","));
    if (r.morphs.join(",") !== e.morphs.join(",")) out.push(w + "morphs " + r.morphs.length + " in the file, manifest says " + e.morphs.length + " (or the names differ)");
  }
  const dir = abs(OUT_DIR);
  if (fs.existsSync(dir)) fs.readdirSync(dir).forEach(f => { if (!named.has(f) && !OTHERS.has(f)) out.push(OUT_DIR + "/" + f + " is not in the manifest"); });
  return out;
}

/* the files here that are not Mochi's: tools/gen-water.js owns water.png (the porthole backdrop) and decor.png (the pool's decor sheet) */
const OTHERS = new Set(["water.png", "decor.png"]);

function render(entries) {
  const order = ["variant", "file", "poses", "images", "bytes", "triangles", "clips", "morphs", "sha"];
  const lines = entries.map(e => "  " + JSON.stringify(Object.fromEntries(order.map(k => [k, e[k]]))).replace(/"(\w+)":/g, "$1: ").replace(/,(?=["\w])/g, ", ").replace(/^\{/, "{ ").replace(/\}$/, " }"));
  return [
    "/* GENERATED by tools/gen-mochi.js: do not edit; change the Blender project (" + BLENDER_PROJECT + ") and run `npm run gen:mochi`.",
    "   Pure data: Mochi's files, sizes and the names the viewer binds to. */",
    "",
    'export const MOCHI_VARIANTS = ["pink", "lilac"] as const;',
    "export type MochiVariant = typeof MOCHI_VARIANTS[number];",
    "export const MOCHI_CLIPS = " + JSON.stringify(entries[0].clips).replace(/,/g, ", ") + " as const;",
    'export const MOCHI_MOODS = ["idle", "happy", "excited", "sad", "angry", "surprised", "thinking", "sleepy", "sleeping"] as const;',
    "",
    "export interface MochiModel {",
    "  variant: MochiVariant;",
    "  file: string;",
    "  poses: string;",
    "  images: readonly string[];",
    "  bytes: number;",
    "  triangles: number;",
    "  clips: readonly string[];",
    "  morphs: readonly string[];",
    "  sha: string;",
    "}",
    "",
    "export const MOCHI_MODELS: readonly MochiModel[] = [",
    lines.join(",\n"),
    "];",
    "",
    "export function mochiModel(variant: MochiVariant): MochiModel {",
    "  const m = MOCHI_MODELS.find(x => x.variant === variant);",
    '  if (!m) throw new Error("no Mochi model for " + variant);',
    "  return m;",
    "}",
    ""
  ].join("\n");
}

function fail(msg) { console.error("gen-mochi: " + msg); process.exit(1); }

function pack(variant) {
  const dir = path.join(SRC, variant);
  const need = (f) => { const p = path.join(dir, f); if (!fs.existsSync(p)) fail(variant + ": " + p + " is missing"); return p; };
  const doc = JSON.parse(fs.readFileSync(need("mochi.gltf"), "utf8"));
  const bin = fs.readFileSync(need("mochi.bin"));
  const poses = need("poses.webp");
  if ((doc.buffers || []).length !== 1) fail(variant + ": " + (doc.buffers || []).length + " buffers; the pack must hold exactly one");
  (doc.extensionsRequired || []).forEach(x => { if (!EXTENSIONS_OK.includes(x)) fail(variant + ": requires " + x + ", which the page cannot decode (the CSP forbids the meshopt decoder)"); });
  const images = doc.images || [];
  if (images.some(im => im.bufferView !== undefined)) fail(variant + ": an image is embedded; the textures must stay external");
  const seen = new Set();
  const copies = images.map((im, i) => {
    const part = partOf(im.name);
    if (!part) fail(variant + ": image " + i + " is named " + JSON.stringify(im.name) + ", not axolotl_<part> with a part of " + PARTS.join("|"));
    if (seen.has(part)) fail(variant + ": two images hold the part " + part);
    seen.add(part);
    if (typeof im.uri !== "string" || path.basename(im.uri) !== im.uri) fail(variant + ": image " + i + " uri " + JSON.stringify(im.uri) + " is not a bare file name");
    const to = "mochi-" + variant + "-" + part + ".webp";
    const from = need(im.uri);
    im.uri = to;
    return [from, to];
  });
  fs.mkdirSync(abs(OUT_DIR), { recursive: true });
  fs.writeFileSync(abs(base(variant) + ".glb"), glb.writeGlb(doc, bin));
  copies.forEach(([from, to]) => fs.copyFileSync(from, abs(OUT_DIR + "/" + to)));
  fs.copyFileSync(poses, abs(base(variant) + "-poses.webp"));
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--check")) {
    const p = problems();
    p.forEach(l => console.log(l));
    console.log(p.length ? "FAILED gen-mochi --check: " + p.length + " difference(s)" : "ok gen-mochi --check");
    process.exit(p.length ? 1 : 0);
  }
  VARIANTS.forEach(pack);
  const entries = VARIANTS.map(v => {
    const r = describe(v);
    return {
      variant: v, file: "models/mochi/mochi-" + v + ".glb", poses: "models/mochi/mochi-" + v + "-poses.webp",
      images: r.d.images.map(im => "models/mochi/" + im.uri),
      bytes: r.buf.length, triangles: r.d.triangles,
      clips: r.d.animations.map(a => a.name), morphs: r.morphs, sha: glb.sha256(r.buf)
    };
  });
  fs.writeFileSync(abs(FILE), render(entries));
  const named = new Set();
  entries.forEach(e => { named.add(path.basename(e.file)); named.add(path.basename(e.poses)); e.images.forEach(im => named.add(path.basename(im))); });
  fs.readdirSync(abs(OUT_DIR)).forEach(f => { if (!named.has(f) && !OTHERS.has(f)) { fs.rmSync(abs(OUT_DIR + "/" + f), { recursive: true, force: true }); console.log("removed stale " + OUT_DIR + "/" + f); } });
  entries.forEach(e => console.log("mochi-" + e.variant + ": " + e.triangles + " triangles, " + e.bytes.toLocaleString("en-US") + " bytes, " + e.clips.length + " clips, " + e.morphs.length + " morphs"));
}

module.exports = { problems, readManifest, FILE, OUT_DIR, VARIANTS };
if (require.main === module) { try { main(); } catch (e) { console.error("gen-mochi: " + (e.stack || e)); process.exit(1); } }
