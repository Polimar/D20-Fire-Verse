/**
 * One-time-safe backfill: bind builder / legacy class-pack items to the hero they were created for.
 * Shared loot and vendor purchases stay unbound (bound_hero_id NULL).
 */

import type { DatabaseSync } from "node:sqlite";
import { filterGrantableItems, resolveBackgroundStarter, resolveClassStarter } from "./starter-equipment.js";

const CLASS_PACK: Record<string, string> = {
  barbarian: "greataxe",
  bard: "dagger",
  cleric: "mace",
  druid: "quarterstaff",
  fighter: "longsword",
  monk: "quarterstaff",
  paladin: "longsword",
  ranger: "shortbow",
  rogue: "dagger",
  sorcerer: "dagger",
  warlock: "dagger",
  wizard: "quarterstaff",
};

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function starterItemIds(classId: string, backgroundId: string, meta: Record<string, unknown>): Set<string> {
  const equipChoice = (meta.equipChoice === "B" || meta.equipChoice === "C" ? meta.equipChoice : "A") as "A" | "B" | "C";
  const bgChoice = (meta.backgroundEquipChoice === "B" ? "B" : "A") as "A" | "B";
  const ids = new Set<string>();
  const classPick = resolveClassStarter(classId, equipChoice);
  if (classPick) for (const id of filterGrantableItems(classPick.items)) ids.add(id);
  const bgPick = resolveBackgroundStarter(backgroundId, bgChoice);
  if (bgPick) for (const id of filterGrantableItems(bgPick.items)) ids.add(id);
  const pack = CLASS_PACK[classId];
  if (pack) ids.add(pack);
  return ids;
}

export function backfillStarterItemBindings(db: DatabaseSync): void {
  const heroes = db
    .prepare(
      `SELECT id, user_id, classes_json, background, builder_meta_json, created_at
       FROM heroes WHERE deleted_at IS NULL`,
    )
    .all() as Array<{
    id: string;
    user_id: string;
    classes_json: string;
    background: string;
    builder_meta_json: string;
    created_at: string;
  }>;

  for (const hero of heroes) {
    const classes = parseJson<Array<{ id: string }>>(hero.classes_json, []);
    const classId = classes[0]?.id;
    if (!classId) continue;
    const meta = parseJson<Record<string, unknown>>(hero.builder_meta_json ?? "{}", {});
    const itemIds = starterItemIds(classId, hero.background, meta);
    if (!itemIds.size) continue;

    const createdMs = Date.parse(hero.created_at);
    const windowStart = new Date(createdMs - 2000).toISOString();
    const windowEnd = new Date(createdMs + 10 * 60 * 1000).toISOString();

    const rows = db
      .prepare(
        `SELECT id, item_def_id FROM account_stash
         WHERE user_id = ? AND bound_hero_id IS NULL
           AND acquired_at >= ? AND acquired_at <= ?`,
      )
      .all(hero.user_id, windowStart, windowEnd) as Array<{ id: string; item_def_id: string }>;

    for (const row of rows) {
      if (!itemIds.has(row.item_def_id)) continue;
      db.prepare("UPDATE account_stash SET bound_hero_id = ? WHERE id = ? AND bound_hero_id IS NULL").run(hero.id, row.id);
    }
  }
}
