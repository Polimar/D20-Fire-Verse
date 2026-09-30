#!/usr/bin/env node
/** Writes procedural arena JSON maps and top-down SVG art (theme × size). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const jsonDir = path.join(root, "content", "arenas");
const artDir = path.join(root, "tv", "public", "art", "arena");

const THEMES = [
  { id: "brewery", label: "Wizard's brewery", floor: "#6b3f24", grout: "#3d2414", wall: "#2a1810", accent: "#8a5a28" },
  { id: "crypt", label: "Gothic crypt", floor: "#2a2430", grout: "#161018", wall: "#0e0c12", accent: "#4a3a48" },
  { id: "ship", label: "Ship deck", floor: "#8a5a32", grout: "#5c3a20", wall: "#3a2414", accent: "#c4a06a" },
  { id: "inn_yard", label: "Inn yard at night", floor: "#4a4030", grout: "#2a2418", wall: "#1a1610", accent: "#c9a05a" },
  { id: "elf_ruin", label: "Autumn elf ruin", floor: "#4a5a30", grout: "#2a3418", wall: "#d8d0c0", accent: "#c47828" },
  { id: "lava_hall", label: "Magma hall", floor: "#4a2014", grout: "#2a100c", wall: "#1a0c08", accent: "#e06020" },
  { id: "ice_court", label: "Icy courtyard", floor: "#c8d8e8", grout: "#90a8c0", wall: "#6a8098", accent: "#e8f4ff" },
  { id: "sand_ruin", label: "Desert ruin", floor: "#d4b07a", grout: "#b89058", wall: "#8a6a40", accent: "#f0d8a8" },
  { id: "sewer", label: "Stone sewers", floor: "#3a4840", grout: "#242e28", wall: "#1a221c", accent: "#5a7060" },
  { id: "coliseum", label: "Coliseum sand", floor: "#d4b06a", grout: "#b89048", wall: "#6a5030", accent: "#f0d8a0" },
  { id: "swamp", label: "Boardwalk swamp", floor: "#3a4a30", grout: "#243020", wall: "#5a4030", accent: "#2a3828" },
  { id: "tower_roof", label: "Wizard tower roof", floor: "#3a2850", grout: "#241838", wall: "#1a1028", accent: "#6a50a0" },
];

const SIZES = { small: 16, medium: 24, large: 32 };

function perimeter(n) {
  return [
    { x: 0, y: 0, w: n, h: 1 },
    { x: 0, y: n - 1, w: n, h: 1 },
    { x: 0, y: 0, w: 1, h: n },
    { x: n - 1, y: 0, w: 1, h: n },
  ];
}

function pillars(n, theme) {
  const mid = Math.floor(n / 2);
  const q = Math.floor(n / 4);
  const extra = [];
  if (theme === "coliseum") {
    extra.push({ x: mid, y: mid, w: 1, h: 1 });
    return extra;
  }
  extra.push({ x: q, y: q, w: 1, h: 2 }, { x: n - q - 1, y: q, w: 1, h: 2 });
  extra.push({ x: q, y: n - q - 2, w: 1, h: 2 }, { x: n - q - 1, y: n - q - 2, w: 1, h: 2 });
  extra.push({ x: mid, y: mid - 1, w: 1, h: 1 });
  if (n >= 24) extra.push({ x: mid - 3, y: mid, w: 2, h: 1 }, { x: mid + 2, y: mid, w: 2, h: 1 });
  if (n >= 32) extra.push({ x: mid, y: q + 1, w: 1, h: 2 }, { x: mid, y: n - q - 3, w: 1, h: 2 });
  if (theme === "ship") extra.push({ x: mid, y: 2, w: 1, h: 3 });
  if (theme === "sewer" || theme === "lava_hall") {
    extra.push({ x: 3, y: mid, w: n - 6, h: 1 });
    extra.push({ x: 2, y: mid, w: 1, h: 1 }, { x: n - 3, y: mid, w: 1, h: 1 });
  }
  return extra;
}

function ffaSpots(n) {
  const e = n - 2;
  return [
    { x: 2, y: 2 },
    { x: e, y: 2 },
    { x: 2, y: e },
    { x: e, y: e },
    { x: 2, y: Math.floor(n / 2) },
    { x: e, y: Math.floor(n / 2) },
  ];
}

function teamSpots(n) {
  const mid = Math.floor(n / 2);
  return {
    a: [
      { x: 2, y: mid - 1 },
      { x: 2, y: mid },
      { x: 2, y: mid + 1 },
    ],
    b: [
      { x: n - 3, y: mid - 1 },
      { x: n - 3, y: mid },
      { x: n - 3, y: mid + 1 },
    ],
  };
}

function occupied(walls, x, y) {
  return walls.some((w) => x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h);
}

function svgFor(theme, size, walls) {
  const n = SIZES[size];
  const px = 64;
  const pal = THEMES.find((t) => t.id === theme);
  const w = n * px;
  let inner = `<rect width="${w}" height="${w}" fill="${pal.grout}"/>`;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (occupied(walls, x, y)) continue;
      const jitter = ((x * 13 + y * 7) % 5) - 2;
      inner += `<rect x="${x * px + 1}" y="${y * px + 1}" width="${px - 2}" height="${px - 2}" fill="${pal.floor}" opacity="${0.92 + jitter * 0.01}"/>`;
    }
  }
  for (const wall of walls) {
    inner += `<rect x="${wall.x * px}" y="${wall.y * px}" width="${wall.w * px}" height="${wall.h * px}" fill="${pal.wall}"/>`;
    inner += `<rect x="${wall.x * px + 4}" y="${wall.y * px + 4}" width="${Math.max(0, wall.w * px - 8)}" height="${Math.max(0, wall.h * px - 8)}" fill="${pal.accent}" opacity="0.25"/>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}" viewBox="0 0 ${w} ${w}">${inner}</svg>\n`;
}

fs.mkdirSync(jsonDir, { recursive: true });
fs.mkdirSync(artDir, { recursive: true });

const index = [];
for (const theme of THEMES) {
  for (const size of Object.keys(SIZES)) {
    const n = SIZES[size];
    const teams = teamSpots(n);
    const map = {
      id: `arena_${theme.id}_${size}`,
      name: `${theme.label} (${size})`,
      theme: theme.id,
      size,
      width: n,
      height: n,
      cellSizeFt: 5,
      walls: [...perimeter(n), ...pillars(n, theme.id)],
      spawn: { ffa: ffaSpots(n), teamA: teams.a, teamB: teams.b },
      art: `/art/arena/${theme.id}-${size}.png`,
    };
    fs.writeFileSync(path.join(jsonDir, `${map.id}.json`), JSON.stringify(map, null, 2) + "\n");
    fs.writeFileSync(path.join(artDir, `${theme.id}-${size}.png`), svgFor(theme.id, size, map.walls));
    index.push({ id: map.id, theme: theme.id, size, art: map.art });
  }
}
fs.writeFileSync(path.join(jsonDir, "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(`Wrote ${index.length} arena maps.`);
