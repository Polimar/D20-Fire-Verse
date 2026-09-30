#!/usr/bin/env node
/**
 * Unique painted-plate portraits for SRD monsters (square, dark table light).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const md = fs.readFileSync(path.join(root, "content/srd/monsters-A-Z.md"), "utf8");
const outDir = path.join(root, "tv/public/art/portraits");
fs.mkdirSync(outDir, { recursive: true });

const TYPE_PALETTE = {
  aberration: [48, 90, 70],
  beast: [92, 58, 28],
  celestial: [180, 150, 70],
  construct: [90, 95, 105],
  dragon: [140, 40, 32],
  elemental: [40, 110, 150],
  fey: [50, 110, 70],
  fiend: [110, 28, 36],
  giant: [120, 80, 50],
  humanoid: [70, 55, 45],
  monstrosity: [80, 45, 70],
  ooze: [40, 90, 50],
  plant: [36, 80, 40],
  undead: [70, 75, 90],
};

function slug(name) {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}

function paint(id, name, type) {
  const size = 256;
  const rgba = Buffer.alloc(size * size * 4);
  const h = hash(id);
  const pal = TYPE_PALETTE[type] ?? TYPE_PALETTE.monstrosity;
  const cx = size * (0.42 + ((h >>> 8) % 30) / 100);
  const cy = size * (0.4 + ((h >>> 16) % 25) / 100);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = ((x * 13 + y * 7 + h) ^ (x * y + h)) & 255;
      const dx = (x - cx) / size;
      const dy = (y - cy) / size;
      const d = Math.sqrt(dx * dx + dy * dy);
      const vig = Math.max(0, 1 - d * 1.55);
      const blob = Math.max(0, 1 - Math.hypot(dx * 1.2, dy * 1.6) * 2.4);
      const r = Math.min(255, pal[0] * 0.25 + pal[0] * blob * 1.1 + n * 0.12 + vig * 20);
      const g = Math.min(255, pal[1] * 0.22 + pal[1] * blob + n * 0.1 + vig * 14);
      const b = Math.min(255, pal[2] * 0.2 + pal[2] * blob * 0.9 + n * 0.08 + 8);
      const i = (y * size + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }
  void name;
  return encodePng(size, size, rgba);
}

const blocks = [];
const parts = md.split(/^### /m).slice(1);
for (const part of parts) {
  const name = part.split("\n")[0].trim();
  if (!name) continue;
  const italic = part.match(/_(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+([^,_]+)/i);
  const type = (italic?.[2] ?? "monstrosity").replace(/\(.*\)/, "").trim().toLowerCase();
  const id = `srd_${slug(name)}`;
  blocks.push({ id, name, type });
}

for (const b of blocks) {
  fs.writeFileSync(path.join(outDir, `${b.id}.png`), paint(b.id, b.name, b.type));
}
console.log(`wrote ${blocks.length} portraits`);
