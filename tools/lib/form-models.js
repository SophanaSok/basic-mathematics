"use strict";
/* The form models held to the plan's caps: what the `form-models` rule in
   check-static.js reports, and what checks.test.js tries on tampered manifests.

   Two things are checked. gen-forms.js problems() says whether the manifest, the files
   and the art scripts agree (one source of truth for that). This module says whether what
   the files hold is acceptable: size and triangle caps (src/data/form-limits.ts, read
   through Node's own TypeScript loading, as check-static.js reads src/data/skills.ts),
   the five material slots, the five clips, the idle's length, the extensions the page can
   decode, any textures, and the thumbnail. */
const fs = require("fs");
const path = require("path");
const glb = require("./glb");
const limits = require("../../src/data/form-limits.ts");

const ROOT = path.resolve(__dirname, "..", "..");
const STAGES = [1, 2, 3, 4, 5];
const CLIPS = ["idle", "wave", "bow", "flex", "spin"];
const SLOTS = ["armor", "accent", "trim", "metal", "glow"];
const IDLE_SECONDS = 3;
const IDLE_TOLERANCE = 1 / 60;
const EXTENSIONS_OK = ["KHR_mesh_quantization", "EXT_meshopt_compression"];
const IMAGES_MAX = 4;
const IMAGE_EDGES = [1024, 2048];
const THUMB_SIZE = [512, 640];
const PNG_RGBA = 6;
const PNG_MAGIC = "89504e470d0a1a0a";

const same = (a, b) => a.length === b.length && b.every(x => a.includes(x)) && a.every(x => b.includes(x));

/* lines for one manifest entry; `file` and `thumb` are read from public/ under `root` */
function entryProblems(e, root) {
  const out = [];
  const w = "form " + e.n + ": ";
  if (e.bytes > limits.MODEL_BYTES_MAX) out.push(w + e.bytes + " bytes is over " + limits.MODEL_BYTES_MAX);
  if (e.triangles > limits.MODEL_TRIANGLES_MAX) out.push(w + e.triangles + " triangles is over " + limits.MODEL_TRIANGLES_MAX);
  if (!same(e.slots, SLOTS)) out.push(w + "slots " + e.slots.join(",") + " are not " + SLOTS.join(","));
  if (!same(e.clips, CLIPS)) out.push(w + "clips " + e.clips.join(",") + " are not " + CLIPS.join(","));
  let d = null;
  try { d = glb.describeGlb(fs.readFileSync(path.join(root, "public", e.file))); } catch (err) { out.push(w + e.file + ": " + err.message); }
  if (d) {
    if (d.triangles > limits.MODEL_TRIANGLES_MAX) out.push(w + "the file holds " + d.triangles + " triangles, over " + limits.MODEL_TRIANGLES_MAX);
    const idle = d.animations.find(a => a.name === "idle");
    if (!idle) out.push(w + "no idle clip in the file");
    else if (Math.abs(idle.seconds - IDLE_SECONDS) > IDLE_TOLERANCE) out.push(w + "idle runs " + idle.seconds + " s, not " + IDLE_SECONDS + " s");
    d.animations.forEach(a => { if (!(a.seconds > 0)) out.push(w + "clip " + a.name + " runs " + a.seconds + " s"); });
    d.extensionsRequired.forEach(x => { if (!EXTENSIONS_OK.includes(x)) out.push(w + "requires " + x + ", which the page cannot decode"); });
    const meshopt = d.extensionsRequired.includes("EXT_meshopt_compression");
    if ((e.compression === "meshopt") !== meshopt) out.push(w + 'compression "' + e.compression + '" but the file ' + (meshopt ? "requires" : "does not require") + " EXT_meshopt_compression");
    if (d.images.length > IMAGES_MAX) out.push(w + d.images.length + " textures, at most " + IMAGES_MAX);
    d.images.forEach((im, i) => {
      if (im.width !== im.height || !IMAGE_EDGES.includes(im.width)) out.push(w + "texture " + i + " is " + im.width + "x" + im.height + ", not square at " + IMAGE_EDGES.join(" or "));
    });
  }
  const t = path.join(root, "public", e.thumb);
  if (!fs.existsSync(t)) out.push(w + e.thumb + " does not exist");
  else {
    const b = fs.readFileSync(t);
    if (b.length < 26 || b.subarray(0, 8).toString("hex") !== PNG_MAGIC) out.push(w + e.thumb + " is not a PNG");
    else {
      const wd = b.readUInt32BE(16), ht = b.readUInt32BE(20);
      if (wd !== THUMB_SIZE[0] || ht !== THUMB_SIZE[1]) out.push(w + e.thumb + " is " + wd + "x" + ht + ", not " + THUMB_SIZE.join("x"));
      if (b[25] !== PNG_RGBA) out.push(w + e.thumb + " has colour type " + b[25] + ", not " + PNG_RGBA + " (RGBA)");
    }
    if (b.length > limits.THUMB_BYTES_MAX) out.push(w + e.thumb + " is " + b.length + " bytes, over " + limits.THUMB_BYTES_MAX);
  }
  return out;
}

/* lines for a manifest { entries, hash } (the shape gen-forms.js readManifest() returns) */
function manifestProblems(m, root) {
  const out = [];
  const have = m.entries.map(e => e.n);
  if (have.join(",") !== STAGES.join(",")) out.push("the manifest holds stages " + have.join(",") + ", not " + STAGES.join(","));
  m.entries.forEach(e => entryProblems(e, root || ROOT).forEach(p => out.push(p)));
  return out;
}

module.exports = { ROOT, STAGES, CLIPS, SLOTS, entryProblems, manifestProblems, limits };
