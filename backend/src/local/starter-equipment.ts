/**
 * PHB 2024 / SRD 5.2.1 mechanical reference — starting equipment parsed from review JSON.
 * Items map to catalog ids where the game has them; bundled GP is credited to the wallet.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { enabledById } from "./content-catalog.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../content/srd-5.2.1/review");

export type StarterOption = {
  id: "A" | "B" | "C";
  label: string;
  items: string[];
  gold: number;
};

export type ClassStarter = { classId: string; options: StarterOption[] };
export type BackgroundStarter = { backgroundId: string; options: StarterOption[] };

/** SRD item name fragments → catalog item id (lowercase keys). */
const ITEM_ALIASES: Record<string, string> = {
  "chain mail": "chain_mail",
  "chain shirt": "chain_shirt",
  "studded leather armor": "studded_leather_armor",
  "leather armor": "leather_armor",
  "scale mail": "scale_mail",
  "hide armor": "hide_armor",
  "padded armor": "padded_armor",
  "plate armor": "plate_armor",
  "half plate armor": "half_plate_armor",
  "breastplate": "breastplate",
  "shield": "shield",
  "greatsword": "greatsword",
  "longsword": "longsword",
  "shortsword": "shortsword",
  "scimitar": "scimitar",
  "rapier": "rapier",
  "dagger": "dagger",
  "daggers": "dagger",
  "handaxe": "handaxe",
  "handaxes": "handaxe",
  "greataxe": "greataxe",
  "battleaxe": "battleaxe",
  "mace": "mace",
  "quarterstaff": "quarterstaff",
  "spear": "spear",
  "sickle": "sickle",
  "flail": "flail",
  "javelin": "javelin",
  "javelins": "javelin",
  "shortbow": "shortbow",
  "longbow": "longbow",
  "light crossbow": "light_crossbow",
  "dart": "dart",
  "darts": "dart",
  "crossbow": "light_crossbow",
  "morningstar": "morningstar",
  "warhammer": "warhammer",
  "trident": "trident",
  "pike": "pike",
  "glaive": "glaive",
  "halberd": "halberd",
  "whip": "whip",
  "club": "club",
  "musket": "musket",
  "pistol": "pistol",
};

const NON_ITEM = /arrow|quiver|pack|robe|book|parchment|supplies|tools|instrument|focus|gp|gold|mistl|sprig|orb|lore|prayer/i;

function slugItem(fragment: string): string | undefined {
  const clean = fragment
    .replace(/\([^)]*\)/g, "")
    .trim()
    .toLowerCase();
  if (!clean || NON_ITEM.test(clean)) return undefined;
  const countStrip = clean.replace(/^\d+\s+/, "");
  if (ITEM_ALIASES[countStrip]) return ITEM_ALIASES[countStrip];
  for (const [key, id] of Object.entries(ITEM_ALIASES)) {
    if (countStrip.includes(key)) return id;
  }
  const slug = countStrip.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return slug.length ? slug : undefined;
}

function parseOptionBlock(block: string, id: "A" | "B" | "C"): StarterOption {
  const trimmed = block.trim();
  const onlyGold = trimmed.match(/^(\d+)\s*GP$/i);
  if (onlyGold) {
    const gold = Number(onlyGold[1]);
    return { id, label: `${gold} GP`, items: [], gold };
  }
  const goldMatch = trimmed.match(/(?:and\s+)?(\d+)\s*GP\s*$/i);
  const gold = goldMatch ? Number(goldMatch[1]) : 0;
  const body = goldMatch ? trimmed.slice(0, goldMatch.index).trim().replace(/,\s*$/, "") : trimmed;
  const items: string[] = [];
  const parts = body.split(/,\s*/);
  for (const part of parts) {
    const piece = part.trim();
    if (!piece) continue;
    const countMatch = piece.match(/^(\d+)\s+(.+)$/);
    const name = countMatch ? countMatch[2]! : piece;
    const count = countMatch ? Number(countMatch[1]) : 1;
    const itemId = slugItem(name);
    if (!itemId) continue;
    for (let i = 0; i < count; i += 1) items.push(itemId);
  }
  return {
    id,
    label: trimmed.slice(0, 140),
    items,
    gold,
  };
}

function parseEquipmentLine(text: string, kind: "class" | "background"): StarterOption[] {
  const pattern =
    kind === "class"
      ? /\| Starting Equipment \|([^|]+)\|/i
      : /\*\*Equipment:\*\*\s*_?Choose A or B:_?\s*([^\n]+)/i;
  const row = text.match(pattern);
  if (!row) return [];
  let line = row[1]!.trim().replace(/^Choose[^:]*:\s*/i, "").trim();
  const markers: Array<{ id: "A" | "B" | "C"; start: number; end: number }> = [];
  const head = /\(([ABC])\)\s*/gi;
  let hit: RegExpExecArray | null;
  while ((hit = head.exec(line))) {
    markers.push({ id: hit[1]!.toUpperCase() as "A" | "B" | "C", start: hit.index, end: head.lastIndex });
  }
  const options: StarterOption[] = [];
  for (let i = 0; i < markers.length; i += 1) {
    const cur = markers[i]!;
    const next = markers[i + 1];
    let body = line.slice(cur.end, next?.start ?? line.length).trim();
    body = body.replace(/;\s*or\s*$/i, "").replace(/;\s*$/i, "").trim();
    options.push(parseOptionBlock(body, cur.id));
  }
  return options;
}

function readReview(kind: "class" | "background", id: string): string {
  const file = path.join(ROOT, kind, `${id}.json`);
  if (!fs.existsSync(file)) return "";
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { srd?: { text?: string } };
  return raw.srd?.text ?? "";
}

let classCache: ClassStarter[] | null = null;
let backgroundCache: BackgroundStarter[] | null = null;

export function classStarters(): ClassStarter[] {
  if (classCache) return classCache;
  const dir = path.join(ROOT, "class");
  classCache = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .map((classId) => ({
      classId,
      options: parseEquipmentLine(readReview("class", classId), "class"),
    }))
    .filter((row) => row.options.length > 0);
  return classCache;
}

export function backgroundStarters(): BackgroundStarter[] {
  if (backgroundCache) return backgroundCache;
  const dir = path.join(ROOT, "background");
  backgroundCache = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .map((backgroundId) => ({
      backgroundId,
      options: parseEquipmentLine(readReview("background", backgroundId), "background"),
    }))
    .filter((row) => row.options.length > 0);
  return backgroundCache;
}

export function resolveClassStarter(classId: string, choice: "A" | "B" | "C"): StarterOption | undefined {
  const row = classStarters().find((c) => c.classId === classId);
  return row?.options.find((o) => o.id === choice) ?? row?.options[0];
}

export function resolveBackgroundStarter(backgroundId: string, choice: "A" | "B"): StarterOption | undefined {
  const row = backgroundStarters().find((b) => b.backgroundId === backgroundId);
  if (!row) return undefined;
  return row.options.find((o) => o.id === choice) ?? row.options[0];
}

/** Items that exist in the enabled catalog (skip unknown packs/robes). */
export function filterGrantableItems(itemIds: string[]): string[] {
  return itemIds.filter((id) => Boolean(enabledById("item", id)));
}
