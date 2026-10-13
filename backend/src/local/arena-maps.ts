import fs from "node:fs";
import path from "node:path";
import type { Pregen } from "./campaign.js";
import type { SessionUser } from "./auth.js";
import { CONTENT_ROOT, REPO_ROOT } from "./paths.js";

export function scalePregenToLevel(pregen: Pregen, level: number): Pregen {
  if (pregen.id.startsWith("hero_")) return { ...pregen };
  const src = Math.max(1, pregen.level || 3);
  const lv = Math.min(20, Math.max(1, level));
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
  createdBy?: { userId: string; username: string };
  createdAt?: string;
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

const ARENAS_DIR = path.join(CONTENT_ROOT, "arenas");

export function listArenaMapFiles(): ArenaMapDef[] {
  if (!fs.existsSync(ARENAS_DIR)) return [];
  const out: ArenaMapDef[] = [];
  for (const name of fs.readdirSync(ARENAS_DIR).sort()) {
    if (!name.endsWith(".json")) continue;
    try {
      const map = JSON.parse(fs.readFileSync(path.join(ARENAS_DIR, name), "utf8")) as ArenaMapDef;
      if (map?.id && map.width && map.height) out.push(map);
    } catch {
      /* skip a broken import */
    }
  }
  return out;
}

export function isCustomArenaId(id: string): boolean {
  return /^arena_custom_.+_(small|medium|large)$/.test(id);
}

export function customArenaId(slug: string, size: ArenaSize): string {
  return `arena_custom_${slug}_${size}`;
}

export function isBuiltinArenaId(id: string): boolean {
  const m = /^arena_([a-z_]+)_(small|medium|large)$/.exec(id);
  if (!m || isCustomArenaId(id)) return false;
  return ARENA_THEMES.some((t) => t.id === m[1]);
}

function mapFile(id: string): string {
  return path.join(ARENAS_DIR, `${id}.json`);
}

function writeArenaMap(map: ArenaMapDef): ArenaMapDef {
  fs.mkdirSync(ARENAS_DIR, { recursive: true });
  fs.writeFileSync(mapFile(map.id), `${JSON.stringify(map, null, 2)}\n`);
  return map;
}

function readArenaFile(id: string): ArenaMapDef | undefined {
  const file = mapFile(id);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, "utf8")) as ArenaMapDef;
}

export function defaultArenaArt(theme: ArenaThemeId, size: ArenaSize): string {
  return `/art/arena/${theme}-${size}.png`;
}

export function ensureArenaMapFile(id: string): ArenaMapDef {
  const existing = readArenaFile(id);
  if (existing?.id) return existing;
  if (!isBuiltinArenaId(id)) throw new Error("BAD_MAP");
  const built = getArenaMap(id);
  if (!built) throw new Error("BAD_MAP");
  return writeArenaMap(built);
}

export function saveArenaMapFile(
  id: string,
  walls: Array<{ x: number; y: number; w: number; h: number }>,
  hazards: Array<{ x: number; y: number; w: number; h: number }>,
  spawn?: ArenaMapDef["spawn"],
  art?: string,
): ArenaMapDef {
  const cur = isBuiltinArenaId(id) ? ensureArenaMapFile(id) : readArenaFile(id);
  if (!cur) throw new Error("BAD_MAP");
  const next: ArenaMapDef = {
    ...cur,
    walls,
    hazards,
    ...(spawn ? { spawn } : {}),
    ...(art !== undefined ? { art } : {}),
  };
  return writeArenaMap(next);
}

const SLUG_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const CUSTOM_ART_DIR = path.join(REPO_ROOT, "tv", "public", "art", "arena", "custom");

export function createArenaMapFile(opts: {
  slug: string;
  size: ArenaSize;
  theme?: ArenaThemeId;
  name: string;
  owner: { userId: string; username: string };
}): ArenaMapDef {
  const slug = opts.slug.trim().toLowerCase();
  if (!SLUG_RE.test(slug) || slug.length > 32) throw new Error("BAD_MAP");
  const name = String(opts.name ?? "").trim().slice(0, 40);
  if (!name) throw new Error("BAD_MAP");
  const theme = (opts.theme ?? "brewery") as ArenaThemeId;
  const id = customArenaId(slug, opts.size);
  if (readArenaFile(id) || getArenaMap(id)?.createdBy) throw new Error("BAD_MAP");
  if (fs.existsSync(mapFile(id))) throw new Error("BAD_MAP");
  const n = ARENA_SIZES[opts.size];
  const meta = ARENA_THEMES.find((t) => t.id === theme);
  if (!meta) throw new Error("ARENA_BAD_THEME");
  const teams = teamSpots(n);
  return writeArenaMap({
    id,
    name,
    theme,
    size: opts.size,
    width: n,
    height: n,
    cellSizeFt: 5,
    walls: perimeter(n),
    hazards: [],
    spawn: { ffa: ffaSpots(n), teamA: teams.a, teamB: teams.b },
    art: "",
    createdBy: { userId: opts.owner.userId, username: opts.owner.username },
    createdAt: new Date().toISOString(),
  });
}

export function listCustomArenaMaps(size?: ArenaSize): ArenaMapDef[] {
  return listArenaMapFiles().filter((m) => m.createdBy && (!size || m.size === size));
}

export function listMyArenaMaps(userId: string): ArenaMapDef[] {
  return listArenaMapFiles().filter((m) => m.createdBy?.userId === userId);
}

export function listAdminArenaMaps(): ArenaMapDef[] {
  const byId = new Map<string, ArenaMapDef>();
  for (const built of allArenaMaps()) byId.set(built.id, built);
  for (const file of listArenaMapFiles()) byId.set(file.id, file);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function assertCanEditArenaMap(map: ArenaMapDef, user: SessionUser | null, adminBypass: boolean): void {
  if (!user) throw new Error("AUTH_REQUIRED");
  if (user.disabled) throw new Error("FORBIDDEN");
  if (adminBypass && user.role === "admin") return;
  if (!map.createdBy || map.createdBy.userId !== user.id) throw new Error("FORBIDDEN");
}

function sniffImage(buf: Buffer, mime: string): "jpg" | "png" | "webp" {
  const type = mime.toLowerCase();
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (type.includes("jpeg") || type === "image/jpg") return "jpg";
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  throw new Error("BAD_MAP");
}

function customArtAbs(id: string, ext: string): string {
  return path.join(CUSTOM_ART_DIR, `${id}.${ext}`);
}

function unlinkCustomArt(id: string, keepExt?: string): void {
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    if (keepExt && ext === keepExt) continue;
    const file = customArtAbs(id, ext);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

export function saveArenaMapArt(id: string, buf: Buffer, mime: string): ArenaMapDef {
  if (!Buffer.isBuffer(buf) || buf.length < 24 || buf.length > 8 * 1024 * 1024) throw new Error("BAD_MAP");
  const map = isBuiltinArenaId(id) ? ensureArenaMapFile(id) : readArenaFile(id);
  if (!map) throw new Error("BAD_MAP");
  const ext = sniffImage(buf, mime);
  fs.mkdirSync(CUSTOM_ART_DIR, { recursive: true });
  unlinkCustomArt(id, ext);
  fs.writeFileSync(customArtAbs(id, ext), buf);
  map.art = `/art/arena/custom/${id}.${ext}`;
  return writeArenaMap(map);
}

export function clearArenaMapArt(id: string): ArenaMapDef {
  const map = isBuiltinArenaId(id) ? ensureArenaMapFile(id) : readArenaFile(id);
  if (!map) throw new Error("BAD_MAP");
  unlinkCustomArt(id);
  map.art = map.createdBy ? "" : defaultArenaArt(map.theme, map.size);
  return writeArenaMap(map);
}

/** Custom maps disappear; built-in ones drop their painted override and return to the generated layout. */
export function deleteArenaMapFile(id: string): "deleted" | "reset" {
  const builtin = isBuiltinArenaId(id);
  if (!builtin && !readArenaFile(id)) throw new Error("BAD_MAP");
  unlinkCustomArt(id);
  if (fs.existsSync(mapFile(id))) fs.unlinkSync(mapFile(id));
  return builtin ? "reset" : "deleted";
}

export function publicCustomMap(map: ArenaMapDef): {
  id: string;
  name: string;
  size: ArenaSize;
  theme: ArenaThemeId;
  createdBy: { username: string };
} {
  return {
    id: map.id,
    name: map.name,
    size: map.size,
    theme: map.theme,
    createdBy: { username: map.createdBy?.username ?? "table" },
  };
}

export function allArenaMaps(): ArenaMapDef[] {
  const out: ArenaMapDef[] = [];
  for (const t of ARENA_THEMES) {
    for (const s of ["small", "medium", "large"] as ArenaSize[]) out.push(buildArenaMap(t.id, s));
  }
  return out;
}
