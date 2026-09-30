#!/usr/bin/env node
/** Occupancy masks from arena JSON: walls black, floor light, spawn A blue / B red / FFA gold. */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const jsonDir = path.join(root, "content", "arenas");
const artDir = path.join(root, "tv", "public", "art", "arena");
const CELL = 64;

function crc(buf) {
  return crc32(buf) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([name, data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
}

function writePng(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    rgb.copy(raw, row + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
}

function paintCell(rgb, n, x, y, r, g, b) {
  const px = n * CELL;
  for (let dy = 0; dy < CELL; dy++) {
    for (let dx = 0; dx < CELL; dx++) {
      const i = ((y * CELL + dy) * px + (x * CELL + dx)) * 3;
      rgb[i] = r;
      rgb[i + 1] = g;
      rgb[i + 2] = b;
    }
  }
}

fs.mkdirSync(artDir, { recursive: true });
const files = fs.readdirSync(jsonDir).filter((f) => f.startsWith("arena_") && f.endsWith(".json"));
for (const name of files) {
  const map = JSON.parse(fs.readFileSync(path.join(jsonDir, name), "utf8"));
  const n = map.width;
  const px = n * CELL;
  const rgb = Buffer.alloc(px * px * 3, 220);
  for (let i = 0; i < rgb.length; i += 3) {
    rgb[i] = 210;
    rgb[i + 1] = 200;
    rgb[i + 2] = 180;
  }
  const blocked = Array.from({ length: n }, () => Array(n).fill(false));
  for (const w of map.walls ?? []) {
    for (let y = w.y; y < w.y + w.h; y++) {
      for (let x = w.x; x < w.x + w.w; x++) {
        if (y >= 0 && y < n && x >= 0 && x < n) blocked[y][x] = true;
      }
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (blocked[y][x]) paintCell(rgb, n, x, y, 18, 16, 14);
    }
  }
  for (const s of map.spawn?.ffa ?? []) paintCell(rgb, n, s.x, s.y, 210, 170, 40);
  for (const s of map.spawn?.teamA ?? []) paintCell(rgb, n, s.x, s.y, 40, 90, 200);
  for (const s of map.spawn?.teamB ?? []) paintCell(rgb, n, s.x, s.y, 200, 50, 40);
  const out = path.join(artDir, `_mask-${map.theme}-${map.size}.png`);
  writePng(out, px, px, rgb);
  console.log(out, px);
}
