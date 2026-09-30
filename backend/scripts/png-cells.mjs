/** Decode 8-bit RGB/RGBA PNG and sample per 64px arena cell. */
import fs from "node:fs";
import zlib from "node:zlib";

export const CELL = 64;

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(file) {
  const buf = fs.readFileSync(file);
  if (buf[0] !== 0x89) throw new Error(`not png: ${file}`);
  let off = 8;
  let w = 0;
  let h = 0;
  let depth = 8;
  let ctype = 2;
  const idats = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      ctype = data[9];
    } else if (type === "IDAT") idats.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (depth !== 8 || (ctype !== 2 && ctype !== 6)) {
    throw new Error(`unsupported png ${file} depth=${depth} ctype=${ctype}`);
  }
  const bpp = ctype === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idats));
  const stride = w * bpp;
  const out = Buffer.alloc(stride * h);
  let src = 0;
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[src++];
    const row = raw.subarray(src, src + stride);
    src += stride;
    const dest = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? dest[i - bpp] : 0;
      const up = prev[i];
      const upLeft = i >= bpp ? prev[i - bpp] : 0;
      let v = row[i];
      if (filter === 1) v = (v + left) & 255;
      else if (filter === 2) v = (v + up) & 255;
      else if (filter === 3) v = (v + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) v = (v + paeth(left, up, upLeft)) & 255;
      dest[i] = v;
    }
    dest.copy(prev);
  }
  return { w, h, bpp, pixels: out };
}

export function cellStats(png, n, x, y) {
  const { w, bpp, pixels } = png;
  const x0 = x * CELL + 8;
  const y0 = y * CELL + 8;
  const x1 = (x + 1) * CELL - 8;
  const y1 = (y + 1) * CELL - 8;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  let dark = 0;
  let hot = 0;
  let wet = 0;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (py * w + px) * bpp;
      const R = pixels[i];
      const G = pixels[i + 1];
      const B = pixels[i + 2];
      r += R;
      g += G;
      b += B;
      count += 1;
      const lum = (R + G + B) / 3;
      if (lum < 48) dark += 1;
      if (R > 140 && R > G + 20 && R > B + 20) hot += 1;
      if (B > R + 8 && G > R && lum < 110) wet += 1;
    }
  }
  r /= count;
  g /= count;
  b /= count;
  const lum = (r + g + b) / 3;
  return {
    r,
    g,
    b,
    lum,
    dark: dark / count,
    hot: hot / count,
    wet: wet / count,
    sat: (Math.max(r, g, b) - Math.min(r, g, b)) / 255,
  };
}

export function cellsToRects(grid, kind) {
  const h = grid.length;
  const w = grid[0].length;
  const used = grid.map((row) => row.map(() => false));
  const rects = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x] !== kind || used[y][x]) continue;
      let maxW = 0;
      while (x + maxW < w && grid[y][x + maxW] === kind && !used[y][x + maxW]) maxW += 1;
      let maxH = 1;
      grow: while (y + maxH < h) {
        for (let i = 0; i < maxW; i++) {
          if (grid[y + maxH][x + i] !== kind || used[y + maxH][x + i]) break grow;
        }
        maxH += 1;
      }
      for (let dy = 0; dy < maxH; dy++) {
        for (let dx = 0; dx < maxW; dx++) used[y + dy][x + dx] = true;
      }
      rects.push({ x, y, w: maxW, h: maxH });
    }
  }
  return rects;
}
