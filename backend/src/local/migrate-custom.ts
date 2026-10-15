/**
 * One-shot: custom_* files become hero_* rows when FIREVERSE_MIGRATE_CUSTOM=1.
 * Idempotent: a file renamed *.migrated.json is skipped.
 */

import fs from "node:fs";
import path from "node:path";
import type { AbilityKey, BuilderDraft } from "@d20-fireverse/protocol/builder";
import { DATA_DIR } from "./paths.js";
import { commitBuilderDraft } from "./builder-commit.js";
import { builderCatalog } from "./builder-catalog.js";
import type { SessionUser } from "./auth.js";
import { accountDb } from "./auth.js";

type Legacy = {
  id?: string;
  name?: string;
  ownerUserId?: string;
  class?: string;
  race?: string;
  background?: string;
  abilities?: Record<string, number>;
  level?: number;
  skills?: string[];
  fightingStyle?: string;
  cantrips?: string[];
  spellsKnown?: string[];
};

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;

function clampRoll(n: number): number {
  if (!Number.isFinite(n)) return 10;
  return Math.max(3, Math.min(18, Math.round(n)));
}

function draftFromLegacy(raw: Legacy): BuilderDraft {
  const catalog = builderCatalog();
  const cls = catalog.classes.find((c) => c.id === raw.class) ?? catalog.classes[0];
  if (!cls) throw new Error("CLASS_DISABLED");
  const background = catalog.backgrounds.find((b) => b.id === raw.background) ?? catalog.backgrounds[0];
  if (!background) throw new Error("CLASS_DISABLED");
  const speciesId = catalog.species.some((s) => s.id === raw.race) ? raw.race! : (catalog.species[0]?.id ?? "human");
  const known = new Set(raw.skills ?? []);
  const classSkills = cls.skillList.filter((id) => known.has(id) && !background.skills.includes(id));
  while (classSkills.length < cls.skillChoices) {
    const next = cls.skillList.find((id) => !classSkills.includes(id) && !background.skills.includes(id));
    if (!next) break;
    classSkills.push(next);
  }
  const scores = Object.fromEntries(ABILITY_KEYS.map((key) => [key, clampRoll(raw.abilities?.[key] ?? 10)])) as Record<AbilityKey, number>;
  const pool = catalog.spells.filter((s) => s.classes.includes(cls.id));
  const cantrips = pool.filter((s) => s.level === 0).slice(0, cls.level1.cantrips ?? 0).map((s) => s.id);
  const leveled = pool.filter((s) => s.level === 1);
  const prepared = leveled.slice(0, cls.level1.preparedSpells ?? 0).map((s) => s.id);
  const knownSpells = leveled.slice(0, cls.level1.spellsKnown ?? 0).map((s) => s.id);
  const bookSize = cls.level1.spellbookSize ?? 0;
  const spellbook = bookSize ? [...prepared, ...leveled.map((s) => s.id).filter((id) => !prepared.includes(id))].slice(0, bookSize) : undefined;
  const style = cls.fightingStyleRequired ? (cls.fightingStyleFeatIds.includes(raw.fightingStyle ?? "") ? raw.fightingStyle : cls.fightingStyleFeatIds[0]) : undefined;
  const human = speciesId === "human";
  const origin = catalog.feats.find((f) => f.category === "origin");
  const extraSkill = human ? cls.skillList.find((id) => !classSkills.includes(id) && !background.skills.includes(id)) : undefined;
  return {
    name: raw.name,
    classId: cls.id,
    speciesId,
    backgroundId: background.id,
    method: "roll",
    baseAbilities: scores,
    classSkills: classSkills.slice(0, cls.skillChoices),
    fightingStyleFeatId: style,
    cantrips,
    spellsPrepared: prepared,
    spellsKnown: knownSpells,
    spellbook,
    equipChoice: "A",
    backgroundEquipChoice: "A",
    ...(human && origin && extraSkill ? { speciesSkill: extraSkill, originFeatId: origin.id } : {}),
    ...(cls.id === "rogue"
      ? { expertiseSkills: [...new Set([...background.skills, ...classSkills])].slice(0, 2) }
      : {}),
  };
}

export function migrateCustomCharacters(): { migrated: number; skipped: number; failed: string[] } {
  const dir = path.join(DATA_DIR, "custom-characters");
  const out = { migrated: 0, skipped: 0, failed: [] as string[] };
  if (!fs.existsSync(dir)) return out;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json") || file.endsWith(".migrated.json")) {
      out.skipped += 1;
      continue;
    }
    const full = path.join(dir, file);
    try {
      const raw = JSON.parse(fs.readFileSync(full, "utf8")) as Legacy;
      if (!raw.ownerUserId || !raw.class || !raw.name) throw new Error("INCOMPLETE");
      const user = accountDb().prepare("SELECT id, username, role FROM users WHERE id = ?").get(raw.ownerUserId) as
        | { id: string; username: string; role: "admin" | "player" }
        | undefined;
      if (!user) throw new Error("NO_OWNER");
      const actor: SessionUser = { id: user.id, username: user.username, role: user.role, disabled: false };
      const draft = draftFromLegacy(raw);
      draft.level = user.role === "admin" ? raw.level : 1;
      commitBuilderDraft(actor, draft);
      fs.renameSync(full, full.replace(/\.json$/, ".migrated.json"));
      out.migrated += 1;
    } catch (err) {
      out.failed.push(`${file}: ${err instanceof Error ? err.message : "ERROR"}`);
    }
  }
  return out;
}
