import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cellStats, cellsToRects, decodePng, CELL } from "./png-cells.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const THEMES = [
  "brewery",
  "crypt",
  "ship",
  "inn_yard",
  "elf_ruin",
  "lava_hall",
  "ice_court",
  "sand_ruin",
  "sewer",
  "coliseum",
  "swamp",
  "tower_roof",
];
const SIZES = { small: 16, medium: 24, large: 32 };
const NAMES = {
  brewery: "Wizard's brewery",
  crypt: "Gothic crypt",
  ship: "Ship deck",
  inn_yard: "Inn yard at night",
  elf_ruin: "Autumn elf ruin",
  lava_hall: "Magma hall",
  ice_court: "Icy courtyard",
  sand_ruin: "Desert ruin",
  sewer: "Stone sewers",
  coliseum: "Coliseum sand",
  swamp: "Boardwalk swamp",
  tower_roof: "Wizard tower roof",
};

function paint(s) {
  if (s.b > 100 && s.b > s.r + 30 && s.lum > 55) return true;
  if (s.r > 150 && s.g > 120 && s.b < 80) return true;
  if (s.r > 130 && s.g < 70 && s.b < 70 && s.hot < 0.25 && s.lum > 55) return true;
  return false;
}

function stamp(grid, rects, ch) {
  const n = grid.length;
  for (const w of rects ?? []) {
    for (let y = w.y; y < w.y + w.h; y++) {
      for (let x = w.x; x < w.x + w.w; x++) {
        if (y >= 0 && y < n && x >= 0 && x < n) grid[y][x] = ch;
      }
    }
  }
}

function classifyCell(theme, s, x, y, n, wasWall) {
  if (x === 0 || y === 0 || x === n - 1 || y === n - 1) return "W";
  if (paint(s)) return ".";

  const pitThemes = new Set(["crypt", "ice_court", "inn_yard", "tower_roof", "coliseum", "ship"]);
  const hole = s.dark > 0.9 && s.lum < 20 && s.hot < 0.08;
  const lava = s.hot > 0.2 && s.r > s.g + 10 && s.r > 90;
  const water =
    s.wet > 0.28 ||
    (theme === "swamp" && s.lum < 48 && s.dark > 0.55 && s.sat < 0.14 && s.hot < 0.05) ||
    (theme === "sewer" && s.wet > 0.12 && s.b >= s.r) ||
    (theme === "ship" && s.b > s.r + 18 && s.g > s.r && s.lum < 85);

  if ((theme === "lava_hall" || theme === "brewery") && lava) return "H";
  if ((theme === "swamp" || theme === "sewer" || theme === "ship") && water) return "H";
  if (theme === "elf_ruin" && s.wet > 0.18) return "H";
  if (theme === "ice_court") {
    const cx = (n - 1) / 2;
    const cy = (n - 1) / 2;
    if (Math.abs(x - cx) <= n / 6 && Math.abs(y - cy) <= n / 6 && s.b >= s.r - 5 && s.lum > 50) return "H";
  }
  if (theme === "inn_yard") {
    const cx = (n - 1) / 2;
    const cy = (n - 1) / 2;
    if (Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1 && (hole || s.lum < 42)) return "H";
  }
  if (theme === "sand_ruin") {
    const mid = Math.floor(n / 2);
    if (wasWall && Math.abs(x - mid) <= 1 && Math.abs(y - mid) <= 1) return "H";
    if (wasWall) return "W";
  }
  if (hole) return "H";
  if (wasWall && pitThemes.has(theme)) return "H";
  if (wasWall) return "W";

  const prop = s.lum < 34 && s.dark > 0.65 && s.wet < 0.08 && s.hot < 0.06 && s.sat < 0.18;
  if (prop) return "W";
  return ".";
}

function extraStamps(theme, n) {
  const q = Math.floor(n / 4);
  const m = Math.floor(n / 2);
  const walls = [];
  const hazards = [];
  if (theme === "coliseum") {
    walls.push({ x: q, y: q, w: 1, h: 1 }, { x: n - q - 1, y: q, w: 1, h: 1 }, { x: q, y: n - q - 1, w: 1, h: 1 }, { x: n - q - 1, y: n - q - 1, w: 1, h: 1 });
    hazards.push({ x: m, y: m, w: 1, h: 1 });
  }
  if (theme === "ice_court") {
    walls.push({ x: m - 2, y: 1, w: 1, h: 1 }, { x: m + 1, y: 1, w: 1, h: 1 }, { x: m - 2, y: n - 2, w: 1, h: 1 }, { x: m + 1, y: n - 2, w: 1, h: 1 });
  }
  if (theme === "tower_roof") {
    walls.push({ x: 1, y: m - 1, w: 1, h: 2 }, { x: n - 2, y: m - 1, w: 1, h: 2 });
  }
  if (theme === "elf_ruin") {
    walls.push({ x: 2, y: 2, w: 1, h: 1 }, { x: n - 3, y: 2, w: 1, h: 2 }, { x: n - 3, y: n - 4, w: 1, h: 2 });
  }
  return { walls, hazards };
}

function placeSpawns(n, grid) {
  const floor = [];
  for (let y = 1; y < n - 1; y++) {
    for (let x = 1; x < n - 1; x++) if (grid[y][x] === ".") floor.push({ x, y });
  }
  const pickNear = (tx, ty, used) => {
    let best = null;
    let d = 1e9;
    for (const p of floor) {
      const k = `${p.x},${p.y}`;
      if (used.has(k)) continue;
      const dd = Math.abs(p.x - tx) + Math.abs(p.y - ty);
      if (dd < d) {
        d = dd;
        best = p;
      }
    }
    if (!best) best = { x: Math.min(n - 2, Math.max(1, tx)), y: Math.min(n - 2, Math.max(1, ty)) };
    used.add(`${best.x},${best.y}`);
    return { x: best.x, y: best.y };
  };
  const used = new Set();
  const mid = Math.floor(n / 2);
  return {
    ffa: [
      pickNear(2, 2, used),
      pickNear(n - 3, 2, used),
      pickNear(2, n - 3, used),
      pickNear(n - 3, n - 3, used),
      pickNear(2, mid, used),
      pickNear(n - 3, mid, used),
    ],
    teamA: [pickNear(2, mid - 1, used), pickNear(2, mid, used), pickNear(2, mid + 1, used)],
    teamB: [pickNear(n - 3, mid - 1, used), pickNear(n - 3, mid, used), pickNear(n - 3, mid + 1, used)],
  };
}

export function auditMap(theme, size) {
  const n = SIZES[size];
  const src = JSON.parse(fs.readFileSync(path.join(root, "content/arenas", `arena_${theme}_${size}.json`), "utf8"));
  const png = decodePng(path.join(root, "tv/public/art/arena", `${theme}-${size}.png`));
  if (png.w !== n * CELL) throw new Error(`bad png size ${theme} ${size}`);
  const grid = Array.from({ length: n }, () => Array.from({ length: n }, () => "."));
  stamp(grid, src.walls, "W");
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const s = cellStats(png, n, x, y);
      grid[y][x] = classifyCell(theme, s, x, y, n, grid[y][x] === "W");
    }
  }
  const extra = extraStamps(theme, n);
  stamp(grid, extra.walls, "W");
  stamp(grid, extra.hazards, "H");
  for (let i = 0; i < n; i++) {
    grid[0][i] = "W";
    grid[n - 1][i] = "W";
    grid[i][0] = "W";
    grid[i][n - 1] = "W";
  }
  return { theme, size, n, grid, walls: cellsToRects(grid, "W"), hazards: cellsToRects(grid, "H"), spawn: placeSpawns(n, grid) };
}

const mode = process.argv[2];
if (mode === "--print" || mode === "--write") {
  for (const theme of THEMES) {
    for (const size of ["small", "medium", "large"]) {
      const m = auditMap(theme, size);
      if (mode === "--print" && size === "small") {
        console.log(`\n=== ${theme} ${size} ===`);
        for (const row of m.grid) console.log(row.join(""));
      }
      if (mode === "--write") {
        const json = {
          id: `arena_${theme}_${size}`,
          name: `${NAMES[theme]} (${size})`,
          theme,
          size,
          width: m.n,
          height: m.n,
          cellSizeFt: 5,
          walls: m.walls,
          hazards: m.hazards,
          spawn: m.spawn,
          art: `/art/arena/${theme}-${size}.png`,
        };
        fs.writeFileSync(path.join(root, "content/arenas", `${json.id}.json`), JSON.stringify(json, null, 2) + "\n");
      }
    }
  }
}
