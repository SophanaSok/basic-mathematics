#!/usr/bin/env node
"use strict";
/* Builds the five form models and writes the manifest the site reads them by.

   For each stage 1..5 it runs Blender headless on tools/art/forms/build.py (the model,
   its rig and its clips, baked and exported to .cache/forms/raw/form-<n>.gltf with its
   .bin, the textures form-<n>-color.webp and form-<n>-surface.webp, and a sidecar JSON),
   then packs that file with gltfpack's Node API to .cache/forms/pack/form-<n>.gltf:
   quantization only by default (positions 16 bits, texture coordinates 12, normals 8,
   animation resampled at 30 Hz, rotations 12 bits; -km keeps the material names, -ke the
   extras), which needs only KHR_mesh_quantization and so no decoder and no change to the
   page's CSP. gltfpack embeds the images when it writes a .glb, so the pack is a .gltf
   and this script assembles public/models/forms/form-<n>.glb from the packed .gltf and
   .bin itself (tools/lib/glb.js writeGlb), keeping the images external: each is copied
   to public/models/forms/ under its own name, and the manifest's `images` lists them in
   the GLB's image order ([] for a stage without textures). --meshopt adds -cc (EXT_meshopt_compression) for a stage that cannot meet
   its size otherwise; the manifest's `compression` says which. gltfpack 1.3.0 has every
   flag used here. The thumbnail form-<n>.png (Blender's --renders thumb, skipped by --no-thumbs) is copied
   beside the model. Files in public/models/forms/ the manifest does not name (the glb, the png and
   the images) are deleted.

   src/data/form-models.ts is then written from what the packed files hold (read with
   tools/lib/glb.js): bytes (the GLB's own), triangles, material names as slots, clip names, and the height
   the sidecar records. The manifest is the source of truth for the stages a --stage run
   does not rebuild: their entries are read back from the file. FORM_MODEL_GENERATOR is
   the sha256 of the .py files under tools/art/forms/, so an edit to the art scripts without a re-run
   fails the check below.

   A --stage run keeps the manifest's generator hash as it was, so after an edit to the
   scripts --check stays red until every stage is rebuilt. The outputs are reproducible
   in substance, not in bytes: Blender's export and Eevee's render differ by a few bytes
   from run to run, so a regeneration is committed when the art changed, not after
   every run, and --check holds numbers (bytes, triangles, slots, clips, the scripts'
   hash) rather than the files' hashes.

   Usage: node tools/gen-forms.js [--stage N] [--cpu] [--no-thumbs] [--meshopt] [--no-meshopt]
          node tools/gen-forms.js --check    no Blender, no gltfpack: hold the manifest
                                             to the files; exit 1 on any difference
   BM_BLENDER names the Blender binary (default ~/.local/bin/blender). When llama-server,
   ollama or comfyui is up (llm-switch status), --cpu is passed on to Blender so it leaves
   the GPU alone; this never changes GPU state. checks.test.js runs problems(). */
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const glb = require("./lib/glb");

const ROOT = path.resolve(__dirname, "..");
const FILE = "src/data/form-models.ts";
const OUT_DIR = "public/models/forms";
const RAW = ".cache/forms/raw";
const PACK = ".cache/forms/pack";
const IMAGE_URI = (n) => new RegExp("^form-" + n + "-[a-z]+\\.webp$");
const BUILD = "tools/art/forms/build.py";
const STAGES = [1, 2, 3, 4, 5];
const MAX_BYTES = 1500000;
/* positions 16 bits, not 14: parts that sit a hair inside another (Pip's band under its
   core) z-fought at 14 and showed through as torn dark patches; 16 costs no bytes */
const PACK_FLAGS = ["-km", "-ke", "-af", "30", "-ar", "12", "-vp", "16", "-vt", "12", "-vn", "8"];

const abs = (rel) => path.join(ROOT, rel);

/* sha256 over the sorted relative paths and contents of the .py files under tools/art/forms/ */
function generatorHash() {
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(abs(dir), { withFileTypes: true })) {
      if (e.isDirectory()) { if (e.name !== "__pycache__") walk(dir + "/" + e.name); }
      else if (e.name.endsWith(".py")) files.push(dir + "/" + e.name);
    }
  })("tools/art/forms");
  const h = require("crypto").createHash("sha256");
  files.sort().forEach(f => { h.update(f + "\0"); h.update(fs.readFileSync(abs(f))); h.update("\0"); });
  return h.digest("hex");
}

/* the entries of the manifest as written in FILE, or null when there is no file */
function readManifest() {
  if (!fs.existsSync(abs(FILE))) return null;
  const text = fs.readFileSync(abs(FILE), "utf8");
  const body = /export const FORM_MODELS: readonly FormModel\[\] = \[\n([\s\S]*?)\n\];/.exec(text);
  const hash = /export const FORM_MODEL_GENERATOR = "([0-9a-f]*)";/.exec(text);
  if (!body || !hash) throw new Error(FILE + " is not in the shape tools/gen-forms.js writes");
  const entries = JSON.parse("[" + body[1].replace(/(\{ |, )(\w+): /g, '$1"$2": ') + "]");
  entries.forEach(e => { if (!Array.isArray(e.images)) e.images = []; });   /* a manifest from before the bake has no images */
  return { entries, hash: hash[1], blender: (/Blender ([^;\n]*)/.exec(text) || [])[1] || "unknown" };
}

function read(n) {
  const rel = OUT_DIR + "/form-" + n + ".glb";
  const buf = fs.readFileSync(abs(rel));
  const d = glb.describeGlb(buf, (uri) => {
    const f = abs(OUT_DIR + "/" + path.basename(uri));
    return path.basename(uri) === uri && fs.existsSync(f) ? fs.readFileSync(f) : null;
  });
  return { buf, d, bytes: buf.length };
}

/* what is wrong with the manifest against the files and the art scripts: a list of lines */
function problems() {
  const out = [];
  let m;
  try { m = readManifest(); } catch (e) { return [e.message]; }
  if (!m) return [FILE + " is missing: run `npm run gen:forms`"];
  if (m.hash !== generatorHash()) out.push("FORM_MODEL_GENERATOR is not the hash of tools/art/forms/**/*.py: run `npm run gen:forms`");
  const named = new Set();
  for (const e of m.entries) {
    named.add(path.basename(e.file));
    named.add(path.basename(e.thumb));
    e.images.forEach(im => {
      named.add(path.basename(im));
      if (!fs.existsSync(abs("public/" + im))) out.push("form " + e.n + ": " + im + " does not exist");
    });
    const f = abs("public/" + e.file);
    if (!fs.existsSync(f)) { out.push("form " + e.n + ": " + e.file + " does not exist"); continue; }
    if (!fs.existsSync(abs("public/" + e.thumb))) out.push("form " + e.n + ": " + e.thumb + " does not exist (run `npm run gen:forms` without --no-thumbs)");
    let r;
    try { r = read(e.n); } catch (err) { out.push("form " + e.n + ": " + err.message); continue; }
    const uris = r.d.images.map(im => im.uri === undefined ? "(embedded)" : "models/forms/" + im.uri);
    if (uris.join(",") !== e.images.join(",")) out.push("form " + e.n + ": images " + uris.join(",") + ", manifest says " + e.images.join(","));
    if (r.bytes !== e.bytes) out.push("form " + e.n + ": " + r.bytes + " bytes, manifest says " + e.bytes);
    if (r.d.triangles !== e.triangles) out.push("form " + e.n + ": " + r.d.triangles + " triangles, manifest says " + e.triangles);
    if (r.d.materials.join(",") !== e.slots.join(",")) out.push("form " + e.n + ": slots " + r.d.materials.join(",") + ", manifest says " + e.slots.join(","));
    if (r.d.animations.map(a => a.name).join(",") !== e.clips.join(",")) out.push("form " + e.n + ": clips " + r.d.animations.map(a => a.name).join(",") + ", manifest says " + e.clips.join(","));
  }
  const dir = abs(OUT_DIR);
  if (fs.existsSync(dir)) fs.readdirSync(dir).forEach(f => { if (!named.has(f)) out.push(OUT_DIR + "/" + f + " is not in the manifest"); });
  return out;
}

function render(entries, header, hash) {
  const order = ["n", "file", "thumb", "images", "bytes", "triangles", "height", "clips", "slots", "compression"];
  const lines = entries.map(e => "  " + JSON.stringify(Object.fromEntries(order.map(k => [k, e[k]]))).replace(/"(\w+)":/g, "$1: ").replace(/,(?=["\w])/g, ", ").replace(/^\{/, "{ ").replace(/\}$/, " }"));
  return [
    "/* GENERATED by tools/gen-forms.js: do not edit; change tools/art/forms/ and run `npm run gen:forms`.",
    "   " + header,
    "   Pure data: the form models' files, sizes and the names the viewer binds to. */",
    "",
    'export type Emote = "wave" | "bow" | "flex" | "spin";',
    'export const EMOTES: readonly Emote[] = ["wave", "bow", "flex", "spin"];',
    'export const CLIPS = ["idle", "wave", "bow", "flex", "spin"] as const;',
    'export const SLOTS = ["armor", "accent", "trim", "metal", "glow"] as const;',
    "",
    "export interface FormModel {",
    "  n: 1 | 2 | 3 | 4 | 5;",
    "  file: string;",
    "  thumb: string;",
    "  images: readonly string[];",
    "  bytes: number;",
    "  triangles: number;",
    "  height: number;",
    "  clips: readonly string[];",
    "  slots: readonly string[];",
    '  compression: "none" | "meshopt";',
    "}",
    "",
    "export const FORM_MODELS: readonly FormModel[] = [",
    lines.join(",\n"),
    "];",
    "",
    'export const FORM_MODEL_GENERATOR = "' + hash + '";',
    "",
    "export function modelFor(stage: number): FormModel | null {",
    "  return FORM_MODELS.find(m => m.n === stage) || null;",
    "}",
    ""
  ].join("\n");
}

function fail(msg) { console.error("gen-forms: " + msg); process.exit(1); }

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--check")) {
    const p = problems();
    p.forEach(l => console.log(l));
    console.log(p.length ? "FAILED gen-forms --check: " + p.length + " difference(s)" : "ok gen-forms --check");
    process.exit(p.length ? 1 : 0);
  }
  const si = argv.indexOf("--stage");
  const only = si >= 0 ? Number(argv[si + 1]) : null;
  if (only !== null && !STAGES.includes(only)) fail("--stage takes 1..5");
  const meshopt = argv.includes("--meshopt") && !argv.includes("--no-meshopt");
  const blender = process.env.BM_BLENDER || path.join(os.homedir(), ".local/bin/blender");
  if (!fs.existsSync(abs("node_modules/gltfpack"))) fail("node_modules/gltfpack is missing: run `npm ci`");
  if (!fs.existsSync(blender)) fail("Blender is not at " + blender + " (set BM_BLENDER)");
  if (!fs.existsSync(abs(BUILD))) fail(BUILD + " is missing");

  const noThumbs = argv.includes("--no-thumbs");
  let cpu = argv.includes("--cpu");
  const sw = cp.spawnSync("llm-switch", ["status"], { encoding: "utf8" });
  if (!sw.error && /(llama-server|ollama|comfyui)[^\n]*\bup\b/i.test(sw.stdout || "")) cpu = true;

  const { pack } = await import("gltfpack");
  const gltfpackVersion = JSON.parse(fs.readFileSync(abs("node_modules/gltfpack/package.json"), "utf8")).version;
  const prev = readManifest();
  const stages = only ? [only] : STAGES;
  fs.mkdirSync(abs(".cache/forms"), { recursive: true });
  fs.mkdirSync(abs(RAW), { recursive: true });
  fs.mkdirSync(abs(OUT_DIR), { recursive: true });
  const made = new Map();
  let blenderVersion = prev ? prev.blender : "unknown";

  for (const n of stages) {
    const log = abs(".cache/forms/form-" + n + ".log");
    /* never pack a stale raw file */
    for (const ext of [".glb", ".gltf", ".bin", ".json", ".png"]) fs.rmSync(abs(RAW + "/form-" + n + ext), { force: true });
    fs.readdirSync(abs(RAW)).forEach(f => { if (IMAGE_URI(n).test(f)) fs.rmSync(abs(RAW + "/" + f), { force: true }); });
    const fd = fs.openSync(log, "w");
    const args = ["-b", "--factory-startup", "--python", BUILD, "--", "--stage", String(n), "--out", RAW].concat(noThumbs ? [] : ["--renders", "thumb"]).concat(cpu ? ["--cpu"] : []);
    const r = cp.spawnSync(blender, args, { cwd: ROOT, stdio: ["ignore", fd, fd] });
    fs.closeSync(fd);
    const text = fs.readFileSync(log, "utf8");
    if (r.status !== 0) { console.error(text.split("\n").slice(-20).join("\n")); fail("Blender failed on stage " + n + " (log: " + log + ")"); }
    console.log((text.split("\n").find(l => l.startsWith("form-" + n + ":")) || "form-" + n + ": built"));
    if (!fs.existsSync(abs(RAW + "/form-" + n + ".gltf"))) fail("Blender wrote no " + RAW + "/form-" + n + ".gltf for stage " + n + " (log: " + log + ")");
    const side = JSON.parse(fs.readFileSync(abs(RAW + "/form-" + n + ".json"), "utf8"));
    if (side.blender) blenderVersion = String(side.blender);

    const flags = PACK_FLAGS.concat(meshopt ? ["-cc"] : []);
    const packDir = abs(PACK);
    fs.rmSync(packDir, { recursive: true, force: true });   /* nothing left over from another stage */
    fs.mkdirSync(packDir, { recursive: true });
    await pack(["-i", abs(RAW + "/form-" + n + ".gltf"), "-o", abs(PACK + "/form-" + n + ".gltf")].concat(flags), {
      read: (p) => new Uint8Array(fs.readFileSync(p)),
      write: (p, data) => fs.writeFileSync(p, data)
    });
    const doc = JSON.parse(fs.readFileSync(abs(PACK + "/form-" + n + ".gltf"), "utf8"));
    const bin = fs.readFileSync(abs(PACK + "/form-" + n + ".bin"));
    const uris = (doc.images || []).map(im => im.uri);
    uris.forEach(u => { if (typeof u !== "string" || !IMAGE_URI(n).test(u)) fail("stage " + n + ": image uri " + JSON.stringify(u) + " is not a bare name like form-" + n + "-color.webp"); });
    if ((doc.images || []).some(im => im.bufferView !== undefined)) fail("stage " + n + ": the pack embedded an image; the images must stay external");
    fs.writeFileSync(abs(OUT_DIR + "/form-" + n + ".glb"), glb.writeGlb(doc, bin));
    uris.forEach(u => {
      if (!fs.existsSync(abs(PACK + "/" + u))) fail("stage " + n + ": gltfpack did not write " + u + " to " + PACK);
      fs.copyFileSync(abs(PACK + "/" + u), abs(OUT_DIR + "/" + u));
    });
    const thumbRaw = abs(RAW + "/form-" + n + ".png");
    if (fs.existsSync(thumbRaw)) fs.copyFileSync(thumbRaw, abs(OUT_DIR + "/form-" + n + ".png"));
    const r2 = read(n);
    made.set(n, {
      n, file: "models/forms/form-" + n + ".glb", thumb: "models/forms/form-" + n + ".png",
      images: uris.map(u => "models/forms/" + u),
      bytes: r2.bytes, triangles: r2.d.triangles, height: side.height,
      clips: r2.d.animations.map(a => a.name), slots: r2.d.materials, compression: meshopt ? "meshopt" : "none"
    });
  }

  const byN = new Map((prev ? prev.entries : []).map(e => [e.n, e]));
  made.forEach((e, n) => byN.set(n, e));
  const entries = Array.from(byN.values()).filter(e => STAGES.includes(e.n)).sort((a, b) => a.n - b.n);
  if (!only && entries.length !== STAGES.length) fail("the manifest does not hold all five stages");

  /* the generator hash is written by a full run only: after a --stage run with changed
     scripts the other stages are stale, and --check says so until every stage is rebuilt */
  const hash = only && prev ? prev.hash : generatorHash();
  fs.writeFileSync(abs(FILE), render(entries, "Blender " + blenderVersion + "; gltfpack " + gltfpackVersion + ".", hash));

  const named = new Set();
  entries.forEach(e => { named.add(path.basename(e.file)); named.add(path.basename(e.thumb)); e.images.forEach(im => named.add(path.basename(im))); });
  fs.readdirSync(abs(OUT_DIR)).forEach(f => { if (!named.has(f)) { fs.rmSync(abs(OUT_DIR + "/" + f), { recursive: true, force: true }); console.log("removed stale " + OUT_DIR + "/" + f); } });

  entries.forEach(e => {
    console.log("form-" + e.n + ": " + e.triangles + " triangles, " + e.bytes.toLocaleString("en-US") + " bytes, " + e.clips.length + " clips, " + (e.compression === "meshopt" ? "meshopt" : "quantized") + (e.bytes > MAX_BYTES ? "  OVER " + MAX_BYTES : ""));
  });
}

module.exports = { problems, generatorHash, readManifest, FILE, OUT_DIR };
if (require.main === module) main().catch(e => { console.error("gen-forms: " + (e.stack || e)); process.exit(1); });
