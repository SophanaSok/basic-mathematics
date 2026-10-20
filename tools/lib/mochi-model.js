"use strict";
/* The Mochi models held to the plan's caps: what the `mochi-model` rule in check-static.js
   reports, and what checks.test.js can try on tampered manifests.

   gen-mochi.js problems() says whether the manifest and the files agree. This module says
   whether what the files hold is acceptable: size and triangle caps
   (src/data/mochi-limits.ts, read through Node's own TypeScript loading as
   form-models.js does), the twelve clips, the idle's length, the extensions the page can
   decode, five external square WebP textures, the 33 morph targets with the nine moods,
   the pose sheet and the whole download of a variant. */
const fs = require("fs");
const path = require("path");
const glb = require("./glb");
const limits = require("../../src/data/mochi-limits.ts");

const ROOT = path.resolve(__dirname, "..", "..");
const VARIANTS = ["pink", "lilac"];
const CLIPS = ["idle", "idle_look", "idle_stretch", "idle_wiggle", "happy", "excited", "sad", "angry", "surprised", "thinking", "sleepy", "sleeping"];
const MOODS = ["neutral", "happy", "excited", "sad", "angry", "surprised", "thinking", "sleepy", "sleeping"];
const MORPHS = 33;
const IDLE_SECONDS = 3.75;
const IDLE_TOLERANCE = 1 / 60;
const EXTENSIONS_OK = ["KHR_mesh_quantization", "EXT_texture_webp"];
const IMAGES = 5;
const IMAGE_EDGES = [128, 256, 512, 1024];
const POSES_SIZE = [2880, 320];

const same = (a, b) => a.length === b.length && b.every(x => a.includes(x)) && a.every(x => b.includes(x));
const isWebp = (b) => b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP";

/* lines for one manifest entry; files are read from public/ under `root` */
function entryProblems(e, root) {
  const out = [];
  const w = "mochi " + e.variant + ": ";
  if (e.bytes > limits.MOCHI_BYTES_MAX) out.push(w + e.bytes + " bytes is over " + limits.MOCHI_BYTES_MAX);
  if (e.triangles > limits.MOCHI_TRIANGLES_MAX) out.push(w + e.triangles + " triangles is over " + limits.MOCHI_TRIANGLES_MAX);
  if (!same(e.clips, CLIPS)) out.push(w + "clips " + e.clips.join(",") + " are not " + CLIPS.join(","));
  let d = null, json = null, glbBytes = 0;
  try {
    const raw = fs.readFileSync(path.join(root, "public", e.file));
    glbBytes = raw.length;
    json = glb.readGlb(raw).json;
    d = glb.describeGlb(raw, uri => {
      const f = path.join(root, "public", "models/mochi", uri);
      /* a uri is a bare file name beside the GLB; anything with a path is not resolved */
      return path.basename(uri) === uri && fs.existsSync(f) ? fs.readFileSync(f) : null;
    });
  } catch (err) { out.push(w + e.file + ": " + err.message); }
  if (d) {
    if (d.triangles > limits.MOCHI_TRIANGLES_MAX) out.push(w + "the file holds " + d.triangles + " triangles, over " + limits.MOCHI_TRIANGLES_MAX);
    if (!same(d.animations.map(a => a.name), CLIPS)) out.push(w + "the file's clips " + d.animations.map(a => a.name).join(",") + " are not " + CLIPS.join(","));
    const idle = d.animations.find(a => a.name === "idle");
    if (!idle) out.push(w + "no idle clip in the file");
    else if (Math.abs(idle.seconds - IDLE_SECONDS) > IDLE_TOLERANCE) out.push(w + "idle runs " + idle.seconds + " s, not " + IDLE_SECONDS + " s");
    d.animations.forEach(a => { if (!(a.seconds > 0)) out.push(w + "clip " + a.name + " runs " + a.seconds + " s"); });
    d.extensionsRequired.forEach(x => { if (!EXTENSIONS_OK.includes(x)) out.push(w + "requires " + x + ", which the page cannot decode"); });
    const whole = glbBytes + d.images.reduce((n, im) => n + (im.uri === undefined ? 0 : im.bytes), 0);
    if (whole > limits.MOCHI_WHOLE_BYTES_MAX) out.push(w + "the model and its textures are " + whole + " bytes, over " + limits.MOCHI_WHOLE_BYTES_MAX);
    if (d.images.length !== IMAGES) out.push(w + d.images.length + " textures, not " + IMAGES);
    d.images.forEach((im, i) => {
      if (im.uri === undefined) { out.push(w + "texture " + i + " is embedded; the models keep textures as files beside the GLB"); return; }
      if (path.basename(im.uri) !== im.uri) { out.push(w + "texture " + i + " " + im.uri + " is not a bare file name beside the GLB"); return; }
      const f = path.join(root, "public", "models/mochi", im.uri);
      if (!fs.existsSync(f)) { out.push(w + "texture " + i + " " + im.uri + " does not exist"); return; }
      /* the file's own magic is the test; the glTF's mimeType is only a claim */
      if ((im.mime && im.mime !== "image/webp") || !isWebp(fs.readFileSync(f))) out.push(w + "texture " + i + " " + im.uri + " is not a WebP");
      if (im.bytes > limits.MOCHI_IMAGE_BYTES_MAX) out.push(w + "texture " + i + " " + im.uri + " is " + im.bytes + " bytes, over " + limits.MOCHI_IMAGE_BYTES_MAX);
      if (im.width !== im.height || !IMAGE_EDGES.includes(im.width)) out.push(w + "texture " + i + " is " + im.width + "x" + im.height + ", not square at " + IMAGE_EDGES.join(", "));
    });
    const mesh = (json.meshes || [])[0] || {};
    const names = (mesh.extras && mesh.extras.targetNames) || [];
    if (names.length !== MORPHS) out.push(w + names.length + " morph target names, not " + MORPHS);
    MOODS.forEach(x => { if (!names.includes("mood_" + x)) out.push(w + "no morph target mood_" + x); });
    (mesh.primitives || []).forEach((p, i) => {
      const n = (p.targets || []).length;
      if (n !== MORPHS) out.push(w + "primitive " + i + " has " + n + " morph targets, not " + MORPHS);
    });
  }
  const listed = e.images || [];
  listed.forEach(x => { if (!fs.existsSync(path.join(root, "public", x))) out.push(w + x + " does not exist"); });
  if (!e.poses) out.push(w + "has no poses sheet");
  else {
    const f = path.join(root, "public", e.poses);
    if (!fs.existsSync(f)) out.push(w + e.poses + " does not exist");
    else {
      const b = fs.readFileSync(f);
      if (!isWebp(b)) out.push(w + e.poses + " is not a WebP");
      else {
        const s = glb.imageSize(b);
        if (!s || s.width !== POSES_SIZE[0] || s.height !== POSES_SIZE[1]) out.push(w + e.poses + " is " + (s ? s.width + "x" + s.height : "of unknown size") + ", not " + POSES_SIZE.join("x"));
      }
      if (b.length > limits.MOCHI_POSES_BYTES_MAX) out.push(w + e.poses + " is " + b.length + " bytes, over " + limits.MOCHI_POSES_BYTES_MAX);
    }
  }
  return out;
}

/* lines for a manifest { entries } (the shape gen-mochi.js readManifest() returns) */
function manifestProblems(m, root) {
  const out = [];
  const have = m.entries.map(e => e.variant);
  if (have.join(",") !== VARIANTS.join(",")) out.push("the manifest holds variants " + have.join(",") + ", not " + VARIANTS.join(","));
  m.entries.forEach(e => entryProblems(e, root || ROOT).forEach(p => out.push(p)));
  return out;
}

module.exports = { ROOT, VARIANTS, CLIPS, MOODS, entryProblems, manifestProblems, limits };
