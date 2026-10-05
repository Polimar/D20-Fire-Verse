/** Wall / hazard rectangles as stored on disk, expanded to a cell grid in combat. */

export type CellRect = { x: number; y: number; w: number; h: number };

export function emptyGrid(width: number, height: number): boolean[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => false));
}

export function expandRects(width: number, height: number, rects: CellRect[] | undefined): boolean[][] {
  const g = emptyGrid(width, height);
  for (const r of rects ?? []) {
    const x0 = Math.max(0, r.x);
    const y0 = Math.max(0, r.y);
    const x1 = Math.min(width, r.x + r.w);
    const y1 = Math.min(height, r.y + r.h);
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) g[y]![x] = true;
    }
  }
  return g;
}

/** Merge true cells into greedy row-then-height rectangles. */
export function compactRects(grid: boolean[][]): CellRect[] {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const used = emptyGrid(width, height);
  const out: CellRect[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!grid[y]![x] || used[y]![x]) continue;
      let w = 1;
      while (x + w < width && grid[y]![x + w] && !used[y]![x + w]) w += 1;
      let h = 1;
      grow: while (y + h < height) {
        for (let i = 0; i < w; i += 1) {
          if (!grid[y + h]![x + i] || used[y + h]![x + i]) break grow;
        }
        h += 1;
      }
      for (let dy = 0; dy < h; dy += 1) {
        for (let dx = 0; dx < w; dx += 1) used[y + dy]![x + dx] = true;
      }
      out.push({ x, y, w, h });
    }
  }
  return out;
}

export function parseCellGrid(
  raw: unknown,
  width: number,
  height: number,
): boolean[][] | null {
  if (!Array.isArray(raw) || raw.length === 0) return emptyGrid(width, height);
  const first = raw[0];
  if (Array.isArray(first) && (first.length === 0 || typeof first[0] === "boolean" || first[0] === 0 || first[0] === 1)) {
    const g = emptyGrid(width, height);
    for (let y = 0; y < Math.min(height, raw.length); y += 1) {
      const row = raw[y];
      if (!Array.isArray(row)) continue;
      for (let x = 0; x < Math.min(width, row.length); x += 1) g[y]![x] = Boolean(row[x]);
    }
    return g;
  }
  if (typeof first === "object" && first && "x" in first) {
    const rects: CellRect[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      const x = Number(r.x);
      const y = Number(r.y);
      const w = Number(r.w ?? r.width ?? 1);
      const h = Number(r.h ?? r.height ?? 1);
      if (![x, y, w, h].every(Number.isFinite)) continue;
      rects.push({ x, y, w, h });
    }
    return expandRects(width, height, rects);
  }
  return null;
}

export type CellPt = { x: number; y: number };

export function parseCellPoints(raw: unknown, width: number, height: number): CellPt[] | null {
  if (!Array.isArray(raw)) return null;
  const out: CellPt[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const r = item as Record<string, unknown>;
    const x = Number(r.x);
    const y = Number(r.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) return null;
    out.push({ x, y });
  }
  return out;
}
