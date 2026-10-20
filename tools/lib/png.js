"use strict";
/* A minimal, deterministic PNG encoder: Node's zlib and Buffer only, no dependency.
   tools/gen-water.js calls encode() to write the water backdrop strip; checks.test.js
   calls readHeader() to see the size of the file it wrote. The same input gives the
   same bytes (fixed filter, fixed deflate level, no ancillary chunks).
   encode({ width, height, palette, pixels }): an indexed PNG (colour type 3) with a PLTE
   chunk, and a tRNS chunk when some palette entry has alpha < 255. palette is an array of
   [r, g, b, a]; pixels is width*height palette indices, row by row. */
const zlib = require("zlib");

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encode({ width, height, palette, pixels }) {
  if (pixels.length !== width * height) throw new Error("png: " + pixels.length + " pixels for " + width + "x" + height);
  if (palette.length > 256) throw new Error("png: more than 256 palette entries");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 3; /* 8 bits, indexed */
  const raw = Buffer.alloc((width + 1) * height); /* filter byte 0 per row */
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = pixels[y * width + x];
      if (!(v >= 0 && v < palette.length)) throw new Error("png: index " + v + " at " + x + "," + y + " is not in the palette");
      raw[y * (width + 1) + 1 + x] = v;
    }
  }
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    chunk("PLTE", Buffer.from(palette.flatMap(c => [c[0], c[1], c[2]])))];
  if (palette.some(c => c[3] < 255)) parts.push(chunk("tRNS", Buffer.from(palette.map(c => c[3]))));
  parts.push(chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/* width, height and colour type from the IHDR chunk */
function readHeader(buf) {
  if (buf.length < 29 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString("latin1", 12, 16) !== "IHDR") throw new Error("png: not a PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
}

module.exports = { encode, readHeader, crc32 };
