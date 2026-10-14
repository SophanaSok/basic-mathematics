#!/usr/bin/env node
"use strict";
/* Builds the five form models and writes the manifest the site reads them by.

   For each stage 1..5 it runs Blender headless on tools/art/forms/build.py (the model,
   its rig and its clips, exported to .cache/forms/raw/form-<n>.glb with a sidecar JSON),
   then packs that file with gltfpack's Node API into public/models/forms/form-<n>.glb:
   quantization only by default (positions 14 bits, texture coordinates 12, normals 8,
   animation resampled at 30 Hz, rotations 12 bits; -km keeps the material names, -ke the
   extras), which needs only KHR_mesh_quantization and so no decoder and no change to the
   page's CSP. --meshopt adds -cc (EXT_meshopt_compression) for a stage that cannot meet
   its size otherwise; the manifest's `compression` says which. gltfpack 1.3.0 has every
   flag used here. The thumbnail form-<n>.png, once a later card makes it, is copied
   beside the model. Files in public/models/forms/ the manifest does not name are deleted.

   src/data/form-models.ts is then written from what the packed files hold (read with
   tools/lib/glb.js): bytes, triangles, material names as slots, clip names, and the height
   the sidecar records. The manifest is the source of truth for the stages a --stage run
   does not rebuild: their entries are read back from the file. FORM_MODEL_GENERATOR is
   the sha256 of the .py files under tools/art/forms/, so an edit to the art scripts without a re-run
   fails the check below.

   A --stage run keeps the manifest's generator hash as it was, so after an edit to the
   scripts --check stays red until every stage is rebuilt.

   Usage: node tools/gen-forms.js [--stage N] [--cpu] [--meshopt] [--no-meshopt]
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
const BUILD = "tools/art/forms/build.py";
const STAGES = [1, 2, 3, 4, 5];
const MAX_BYTES = 1500000;
const PACK_FLAGS = ["-km", "-ke", "-af", "30", "-ar", "12", "-vp", "14", "-vt", "12", "-vn", "8"];

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
  return { entries, hash: hash[1], blender: (/Blender ([^;\n]*)/.exec(text) || [])[1] || "unknown" };
}

function read(n) {
  const rel = OUT_DIR + "/form-" + n + ".glb";
  const buf = fs.readFileSync(abs(rel));
  const d = glb.describeGlb(buf);
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
    const f = abs("public/" + e.file);
    if (!fs.existsSync(f)) { out.push("form " + e.n + ": " + e.file + " does not exist"); continue; }
    let r;
    try { r = read(e.n); } catch (err) { out.push("form " + e.n + ": " + err.message); continue; }
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
  const lines = entries.map(e => "  " + JSON.stringify(e).replace(/"(\w+)":/g, "$1: ").replace(/,(?=["\w])/g, ", ").replace(/^\{/, "{ ").replace(/\}$/, " }"));
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
    for (const ext of [".glb", ".json", ".png"]) fs.rmSync(abs(RAW + "/form-" + n + ext), { force: true });   /* never pack a stale raw file */
    const fd = fs.openSync(log, "w");
    const args = ["-b", "--factory-startup", "--python", BUILD, "--", "--stage", String(n), "--out", RAW].concat(cpu ? ["--cpu"] : []);
    const r = cp.spawnSync(blender, args, { cwd: ROOT, stdio: ["ignore", fd, fd] });
    fs.closeSync(fd);
    const text = fs.readFileSync(log, "utf8");
    if (r.status !== 0) { console.error(text.split("\n").slice(-20).join("\n")); fail("Blender failed on stage " + n + " (log: " + log + ")"); }
    console.log((text.split("\n").find(l => l.startsWith("form-" + n + ":")) || "form-" + n + ": built"));
    const side = JSON.parse(fs.readFileSync(abs(RAW + "/form-" + n + ".json"), "utf8"));
    if (side.blender) blenderVersion = String(side.blender);

    const dest = OUT_DIR + "/form-" + n + ".glb";
    const flags = PACK_FLAGS.concat(meshopt ? ["-cc"] : []);
    await pack(["-i", abs(RAW + "/form-" + n + ".glb"), "-o", abs(dest)].concat(flags), {
      read: (p) => new Uint8Array(fs.readFileSync(p)),
      write: (p, data) => fs.writeFileSync(p, data)
    });
    const thumbRaw = abs(RAW + "/form-" + n + ".png");
    if (fs.existsSync(thumbRaw)) fs.copyFileSync(thumbRaw, abs(OUT_DIR + "/form-" + n + ".png"));
    const r2 = read(n);
    made.set(n, {
      n, file: "models/forms/form-" + n + ".glb", thumb: "models/forms/form-" + n + ".png",
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
  entries.forEach(e => { named.add(path.basename(e.file)); named.add(path.basename(e.thumb)); });
  fs.readdirSync(abs(OUT_DIR)).forEach(f => { if (!named.has(f)) { fs.rmSync(abs(OUT_DIR + "/" + f), { recursive: true, force: true }); console.log("removed stale " + OUT_DIR + "/" + f); } });

  entries.forEach(e => {
    console.log("form-" + e.n + ": " + e.triangles + " triangles, " + e.bytes.toLocaleString("en-US") + " bytes, " + e.clips.length + " clips, " + (e.compression === "meshopt" ? "meshopt" : "quantized") + (e.bytes > MAX_BYTES ? "  OVER " + MAX_BYTES : ""));
  });
}

module.exports = { problems, generatorHash, readManifest, FILE, OUT_DIR };
if (require.main === module) main().catch(e => { console.error("gen-forms: " + (e.stack || e)); process.exit(1); });
