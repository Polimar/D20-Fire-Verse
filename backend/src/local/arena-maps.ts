import fs from "node:fs";
import path from "node:path";
import type { Pregen } from "./campaign.js";
import { CONTENT_ROOT } from "./paths.js";

export function scalePregenToLevel(pregen: Pregen, level: number): Pregen {
  const src = Math.max(1, pregen.level || 3);
  const lv = Math.min(3, Math.max(1, level));
  if (src === lv) return { ...pregen, level: lv };
  const hp = Math.max(6, Math.round((pregen.hp * lv) / src));
  return { ...pregen, level: lv, hp, summary: `${pregen.summary} · arena L${lv}` };
}

/** Procedural arena floors: walls + spawns. Art is a separate background per theme. */

export type ArenaSize = "small" | "medium" | "large";
export type ArenaThemeId =
  | "brewery"
  | "crypt"
  | "ship"
  | "inn_yard"
  | "elf_ruin"
  | "lava_hall"
  | "ice_court"
  | "sand_ruin"
  | "sewer"
  | "coliseum"
  | "swamp"
  | "tower_roof";

export const ARENA_THEMES: Array<{ id: ArenaThemeId; label: string; art: string }> = [
  { id: "brewery", label: "Wizard's brewery", art: "#3d2414" },
  { id: "crypt", label: "Gothic crypt", art: "#1a1520" },
  { id: "ship", label: "Ship deck", art: "#6b4226" },
  { id: "inn_yard", label: "Inn yard at night", art: "#2a2418" },
  { id: "elf_ruin", label: "Autumn elf ruin", art: "#3d4a28" },
  { id: "lava_hall", label: "Magma hall", art: "#4a1c12" },
  { id: "ice_court", label: "Icy courtyard", art: "#c8d8e8" },
  { id: "sand_ruin", label: "Desert ruin", art: "#c4a06a" },
  { id: "sewer", label: "Stone sewers", art: "#2c3830" },
  { id: "coliseum", label: "Coliseum sand", art: "#c9a66b" },
  { id: "swamp", label: "Boardwalk swamp", art: "#2a3a28" },
  { id: "tower_roof", label: "Wizard tower roof", art: "#2a2040" },
];

export const ARENA_SIZES: Record<ArenaSize, number> = { small: 16, medium: 24, large: 32 };

export type ArenaMapDef = {
  id: string;
  name: string;
  theme: ArenaThemeId;
  size: ArenaSize;
  width: number;
  height: number;
  cellSizeFt: 5;
  walls: Array<{ x: number; y: number; w: number; h: number }>;
  /** Liquids (water, lava): block movement, not shots. */
  hazards?: Array<{ x: number; y: number; w: number; h: number }>;
  spawn: {
    ffa: Array<{ x: number; y: number }>;
    teamA: Array<{ x: number; y: number }>;
    teamB: Array<{ x: number; y: number }>;
  };
  art: string;
};

function perimeter(n: number): Array<{ x: number; y: number; w: number; h: number }> {
  return [
    { x: 0, y: 0, w: n, h: 1 },
    { x: 0, y: n - 1, w: n, h: 1 },
    { x: 0, y: 0, w: 1, h: n },
    { x: n - 1, y: 0, w: 1, h: n },
  ];
}

function pillars(n: number, theme: ArenaThemeId): Array<{ x: number; y: number; w: number; h: number }> {
  const mid = Math.floor(n / 2);
  const q = Math.floor(n / 4);
  const extra: Array<{ x: number; y: number; w: number; h: number }> = [];
  if (theme === "coliseum") {
    extra.push({ x: mid, y: mid, w: 1, h: 1 });
    return extra;
  }
  extra.push({ x: q, y: q, w: 1, h: 2 }, { x: n - q - 1, y: q, w: 1, h: 2 });
  extra.push({ x: q, y: n - q - 2, w: 1, h: 2 }, { x: n - q - 1, y: n - q - 2, w: 1, h: 2 });
  extra.push({ x: mid, y: mid - 1, w: 1, h: 1 });
  if (n >= 24) {
    extra.push({ x: mid - 3, y: mid, w: 2, h: 1 }, { x: mid + 2, y: mid, w: 2, h: 1 });
  }
  if (n >= 32) {
    extra.push({ x: mid, y: q + 1, w: 1, h: 2 }, { x: mid, y: n - q - 3, w: 1, h: 2 });
  }
  if (theme === "ship") extra.push({ x: mid, y: 2, w: 1, h: 3 });
  if (theme === "sewer" || theme === "lava_hall") {
    extra.push({ x: 3, y: mid, w: n - 6, h: 1 });
    extra.push({ x: 2, y: mid, w: 1, h: 1 }, { x: n - 3, y: mid, w: 1, h: 1 });
  }
  return extra;
}

function ffaSpots(n: number): Array<{ x: number; y: number }> {
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

function teamSpots(n: number): { a: Array<{ x: number; y: number }>; b: Array<{ x: number; y: number }> } {
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

export function arenaMapId(theme: ArenaThemeId, size: ArenaSize): string {
  return `arena_${theme}_${size}`;
}

export function buildArenaMap(theme: ArenaThemeId, size: ArenaSize): ArenaMapDef {
  const n = ARENA_SIZES[size];
  const meta = ARENA_THEMES.find((t) => t.id === theme)!;
  const teams = teamSpots(n);
  return {
    id: arenaMapId(theme, size),
    name: `${meta.label} (${size})`,
    theme,
    size,
    width: n,
    height: n,
    cellSizeFt: 5,
    walls: [...perimeter(n), ...pillars(n, theme)],
    hazards: [],
    spawn: { ffa: ffaSpots(n), teamA: teams.a, teamB: teams.b },
    art: `/art/arena/${theme}-${size}.png`,
  };
}

export function getArenaMap(id: string): ArenaMapDef | undefined {
  const file = path.join(CONTENT_ROOT, "arenas", `${id}.json`);
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, "utf8")) as ArenaMapDef;
  }
  const m = /^arena_([a-z_]+)_(small|medium|large)$/.exec(id);
  if (!m) return undefined;
  const theme = m[1] as ArenaThemeId;
  const size = m[2] as ArenaSize;
  if (!ARENA_THEMES.some((t) => t.id === theme)) return undefined;
  return buildArenaMap(theme, size);
}

export function allArenaMaps(): ArenaMapDef[] {
  const out: ArenaMapDef[] = [];
  for (const t of ARENA_THEMES) {
    for (const s of ["small", "medium", "large"] as ArenaSize[]) out.push(buildArenaMap(t.id, s));
  }
  return out;
}
