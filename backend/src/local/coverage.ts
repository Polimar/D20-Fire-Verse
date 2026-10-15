/**
 * Which class features the fight engine actually runs through level 20 (pack A).
 * A class's playable cap is the highest level whose rows are all green
 * (runs, progression choices, or no combat effect). Partial and missing stop the cap.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type CoverageStatus = "runs" | "partial" | "missing" | "progression" | "no_combat";

export const PACK_A_CLASS_IDS = ["barbarian", "fighter", "rogue", "wizard"] as const;

export type CoverageRow = {
  classId: string;
  subclassId?: string;
  level: number;
  feature: string;
  status: CoverageStatus;
  note?: string;
};

const GREEN: ReadonlySet<CoverageStatus> = new Set(["runs", "progression", "no_combat"]);

function row(classId: string, level: number, feature: string, status: CoverageStatus, note?: string, subclassId?: string): CoverageRow {
  return { classId, level, feature, status, ...(note ? { note } : {}), ...(subclassId ? { subclassId } : {}) };
}

const REGISTRY: CoverageRow[] = [
  row("barbarian", 1, "Rage", "runs", "Bonus; STR damage; physical resistance; no spells; lasts until the end of the next turn"),
  row("barbarian", 1, "Unarmored Defense", "runs", "AC 10+DEX+CON with no armor"),
  row("barbarian", 1, "Weapon Mastery", "runs"),
  row("barbarian", 2, "Danger Sense", "runs", "Advantage on Dexterity saves"),
  row("barbarian", 2, "Reckless Attack", "runs", "Chosen on a Strength attack; foes have advantage against you"),
  row("barbarian", 3, "Barbarian Subclass", "progression"),
  row("barbarian", 3, "Primal Knowledge", "progression", "One skill from the class list"),
  row("barbarian", 4, "Ability Score Improvement", "progression"),
  row("barbarian", 5, "Extra Attack", "runs"),
  row("barbarian", 5, "Fast Movement", "runs", "+10 ft unless Heavy armor"),
  row("barbarian", 6, "Subclass feature", "progression"),
  row("barbarian", 7, "Feral Instinct", "runs", "Advantage on initiative"),
  row("barbarian", 7, "Instinctive Pounce", "runs", "Half-speed free move when you Rage"),
  row("barbarian", 8, "Ability Score Improvement", "progression"),
  row("barbarian", 9, "Brutal Strike", "runs", "Forceful Blow and Hamstring Blow replace Reckless advantage"),
  row("barbarian", 10, "Subclass feature", "progression"),
  row("barbarian", 3, "Frenzy", "runs", "Extra Rage Damage on the first Reckless Strength hit each turn", "path_of_the_berserker"),
  row("barbarian", 6, "Mindless Rage", "runs", "Charmed and Frightened drop when you Rage", "path_of_the_berserker"),
  row("barbarian", 10, "Retaliation", "runs", "Reaction melee attack when hit from 5 ft", "path_of_the_berserker"),

  row("fighter", 1, "Fighting Style", "progression", "Archery, Defense, and Great Weapon Fighting run; Two-Weapon Fighting is not offered"),
  row("fighter", 1, "Second Wind", "runs", "1d10+fighter level; uses from the class table; one use back on a short rest"),
  row("fighter", 1, "Weapon Mastery", "runs"),
  row("fighter", 2, "Action Surge (one use)", "runs"),
  row("fighter", 2, "Tactical Mind", "runs", "Failed Hide or Search can spend a Second Wind use to add 1d10"),
  row("fighter", 3, "Fighter Subclass", "progression"),
  row("fighter", 4, "Ability Score Improvement", "progression"),
  row("fighter", 5, "Extra Attack", "runs"),
  row("fighter", 5, "Tactical Shift", "runs", "Half-speed free move when you Second Wind"),
  row("fighter", 6, "Ability Score Improvement", "progression"),
  row("fighter", 7, "Subclass feature", "progression"),
  row("fighter", 8, "Ability Score Improvement", "progression"),
  row("fighter", 9, "Indomitable (one use)", "runs", "Automatic reroll on a failed save, plus fighter level"),
  row("fighter", 9, "Tactical Master", "runs", "Replace a weapon's mastery with Push, Sap, or Slow"),
  row("fighter", 10, "Subclass feature", "progression"),
  row("fighter", 3, "Improved Critical", "runs", "Weapon attacks crit on 19–20", "champion"),
  row("fighter", 3, "Remarkable Athlete", "runs", "Half-speed free move after a crit", "champion"),
  row("fighter", 7, "Additional Fighting Style", "progression", "A second fighting style feat", "champion"),
  row("fighter", 10, "Heroic Warrior", "runs", "Heroic Inspiration at the start of your turn if you have none", "champion"),

  row("rogue", 1, "Expertise", "runs", "Doubled proficiency on chosen skills in checks"),
  row("rogue", 1, "Sneak Attack", "runs", "Dice from the class table"),
  row("rogue", 1, "Thieves' Cant", "no_combat"),
  row("rogue", 1, "Weapon Mastery", "runs"),
  row("rogue", 2, "Cunning Action", "runs"),

  row("wizard", 1, "Spellcasting", "runs", "Prepared spells, slots, and combat cast for enabled spells"),
  row("wizard", 1, "Ritual Adept", "no_combat"),
  row("wizard", 1, "Arcane Recovery", "runs"),
];

const CLASSES_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../content/srd-5.2.1/classes.json");

function classifyPackAFeature(feature: string): CoverageStatus {
  if (/ability score improvement/i.test(feature)) return "progression";
  if (/subclass/i.test(feature)) return "progression";
  if (/epic boon/i.test(feature)) return "no_combat";
  if (
    /spellcasting|sneak attack|rage|second wind|extra attack|arcane recovery|cunning action|expertise|uncanny dodge|evasion|indomitable|action surge|brutal strike|weapon mastery/i.test(
      feature,
    )
  ) {
    return "runs";
  }
  return "no_combat";
}

function packARowsFromCatalog(existing: CoverageRow[]): CoverageRow[] {
  const keys = new Set(existing.map((r) => `${r.classId}:${r.level}:${r.feature}`));
  const raw = JSON.parse(fs.readFileSync(CLASSES_FILE, "utf8")) as {
    entries: Array<{ id: string; levels: Array<{ level: number; features: string[] }> }>;
  };
  const out: CoverageRow[] = [];
  for (const cls of raw.entries) {
    if (!PACK_A_CLASS_IDS.includes(cls.id as (typeof PACK_A_CLASS_IDS)[number])) continue;
    for (const levelRow of cls.levels) {
      if (levelRow.level > 20) continue;
      for (const feature of levelRow.features) {
        const key = `${cls.id}:${levelRow.level}:${feature}`;
        if (keys.has(key)) continue;
        out.push(row(cls.id, levelRow.level, feature, classifyPackAFeature(feature)));
        keys.add(key);
      }
    }
  }
  return out;
}

const OTHER = [
  "bard",
  "cleric",
  "druid",
  "monk",
  "paladin",
  "ranger",
  "sorcerer",
  "warlock",
] as const;

function otherClassRows(): CoverageRow[] {
  const out: CoverageRow[] = [];
  for (const id of OTHER) {
    out.push(row(id, 1, "Class features", "partial", "Sheet and some shared actions run; the L1–10 table is not fully executed yet"));
  }
  return out;
}

export const COVERAGE: CoverageRow[] = [...REGISTRY, ...packARowsFromCatalog(REGISTRY), ...otherClassRows()];

export function coverageFor(classId: string, subclassId?: string): CoverageRow[] {
  return COVERAGE.filter((row) => row.classId === classId && (row.subclassId ?? "") === (subclassId ?? ""));
}

export function classFeatureRows(classId: string): CoverageRow[] {
  return COVERAGE.filter((row) => row.classId === classId && !row.subclassId);
}

/** Highest 1–20 class level whose own features are all green. Empty levels do not block. */
export function classLevelCap(classId: string): number {
  const rows = classFeatureRows(classId);
  if (!rows.length) return 0;
  let cap = 0;
  for (let level = 1; level <= 20; level += 1) {
    const at = rows.filter((row) => row.level === level);
    if (at.some((row) => !GREEN.has(row.status))) break;
    cap = level;
  }
  return cap;
}

export function subclassLevelCap(classId: string, subclassId: string): number {
  const rows = coverageFor(classId, subclassId);
  if (!rows.length) return 0;
  let cap = 0;
  for (let level = 1; level <= 20; level += 1) {
    const at = rows.filter((row) => row.level === level);
    if (at.some((row) => !GREEN.has(row.status))) break;
    if (at.length) cap = level;
  }
  return Math.min(classLevelCap(classId), cap || classLevelCap(classId));
}

export function coverageSummary(): Array<{ classId: string; cap: number; runs: number; blocked: number }> {
  const ids = [...new Set(COVERAGE.map((row) => row.classId))];
  return ids.map((classId) => {
    const rows = classFeatureRows(classId);
    return {
      classId,
      cap: classLevelCap(classId),
      runs: rows.filter((row) => row.status === "runs").length,
      blocked: rows.filter((row) => !GREEN.has(row.status)).length,
    };
  });
}
