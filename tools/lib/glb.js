"use strict";
/* A reader for the one thing the form-model checks need of a GLB: what is in it. No
   dependency and no decoding of meshes: a GLB is a 12-byte header (the magic "glTF",
   version 2, the length), a JSON chunk (the glTF document) and usually a BIN chunk (the
   buffer the document's accessors and images point into). readGlb splits those;
   describeGlb counts what a reader of the manifest would otherwise have to open the
   file in a viewer to learn: triangles, material names, animation lengths, the size of
   each embedded image, the extensions the file needs.

   A file that is cut short, has the wrong magic or version, or whose chunks do not add
   up to its length is refused with a reason, never half read. The image sizes are read
   from the first bytes of each image (PNG IHDR, JPEG start-of-frame, WebP VP8, VP8L and
   VP8X), so a texture is not decoded to be measured.

   Used by tools/gen-forms.js, which writes src/data/form-models.ts from what it finds,
   and by its --check, which holds the manifest to the files. */
const crypto = require("crypto");

const JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;

function sha256(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }

/* buffer -> { json, bin }; bin is null when the file has no BIN chunk */
function readGlb(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error("not a GLB: not a buffer");
  if (buffer.length < 20) throw new Error("not a GLB: " + buffer.length + " bytes is shorter than a header and a chunk");
  if (buffer.toString("latin1", 0, 4) !== "glTF") throw new Error("not a GLB: the file does not begin with the magic glTF");
  const version = buffer.readUInt32LE(4), length = buffer.readUInt32LE(8);
  if (version !== 2) throw new Error("GLB version " + version + ": only version 2 is read");
  if (length !== buffer.length) throw new Error("GLB is " + buffer.length + " bytes but its header says " + length + " (truncated or padded)");
  let json = null, bin = null;
  for (let at = 12; at < length;) {
    if (at + 8 > length) throw new Error("GLB chunk header at byte " + at + " runs past the end");
    const size = buffer.readUInt32LE(at), type = buffer.readUInt32LE(at + 4);
    if (at + 8 + size > length) throw new Error("GLB chunk at byte " + at + " claims " + size + " bytes, past the end of the file");
    const body = buffer.subarray(at + 8, at + 8 + size);
    if (type === JSON_CHUNK && json === null) {
      try { json = JSON.parse(body.toString("utf8")); } catch (e) { throw new Error("GLB JSON chunk is not JSON: " + e.message); }
    } else if (type === BIN_CHUNK && bin === null) bin = body;
    at += 8 + size;
  }
  if (json === null) throw new Error("GLB has no JSON chunk");
  return { json, bin };
}

/* the width and height of an image from its first bytes, or null when the format is not
   one of PNG, JPEG and WebP or the header is cut short */
function imageSize(b) {
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.toString("latin1", 12, 16) === "IHDR") return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    for (let at = 2; at + 9 < b.length;) {
      if (b[at] !== 0xff) { at++; continue; }
      const marker = b[at + 1];
      if (marker === 0xc0 || marker === 0xc2) return { width: b.readUInt16BE(at + 7), height: b.readUInt16BE(at + 5) };
      if (marker === 0xff || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { at += marker === 0xff ? 1 : 2; continue; }
      at += 2 + b.readUInt16BE(at + 2);
    }
    return null;
  }
  if (b.length >= 30 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") {
    const kind = b.toString("latin1", 12, 16);
    if (kind === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (kind === "VP8L") { const v = b.readUInt32LE(21); return { width: 1 + (v & 0x3fff), height: 1 + ((v >> 14) & 0x3fff) }; }
    if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

/* buffer -> { triangles, materials, animations: [{ name, seconds }], images: [{ width,
   height, mime }], extensionsRequired, extensionsUsed, meshes, nodes } */
function describeGlb(buffer) {
  const { json, bin } = readGlb(buffer);
  const accessors = json.accessors || [], views = json.bufferViews || [];
  const accessor = (i) => { if (!accessors[i]) throw new Error("GLB names accessor " + i + ", which it does not have"); return accessors[i]; };
  let triangles = 0;
  for (const mesh of json.meshes || []) for (const p of mesh.primitives || []) {
    if (p.mode !== undefined && p.mode !== 4) continue;
    const n = p.indices !== undefined ? accessor(p.indices).count : (p.attributes && p.attributes.POSITION !== undefined ? accessor(p.attributes.POSITION).count : 0);
    triangles += n / 3;
  }
  const animations = (json.animations || []).map((a, i) => {
    let seconds = 0;
    for (const s of a.samplers || []) { const max = accessor(s.input).max; if (max && max[0] > seconds) seconds = max[0]; }
    return { name: a.name === undefined ? "animation" + i : a.name, seconds };
  });
  const images = (json.images || []).map(img => {
    const view = img.bufferView !== undefined ? views[img.bufferView] : null;
    if (!view || !bin) return { width: 0, height: 0, mime: img.mimeType || "" };
    const size = imageSize(bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)) || { width: 0, height: 0 };
    return { width: size.width, height: size.height, mime: img.mimeType || "" };
  });
  return {
    triangles,
    materials: (json.materials || []).map(m => m.name || ""),
    animations,
    images,
    extensionsRequired: json.extensionsRequired || [],
    extensionsUsed: json.extensionsUsed || [],
    meshes: (json.meshes || []).length,
    nodes: (json.nodes || []).length
  };
}

module.exports = { readGlb, describeGlb, imageSize, sha256 };
