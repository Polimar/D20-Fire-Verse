/**
 * Zod schemas for SRD 5.2.1 content. Imported by tools and the backend only.
 * The Fire TV bundle must not depend on this package.
 */

import { z, type ZodTypeAny } from "zod";

export const abilityKey = z.enum(["str", "dex", "con", "int", "wis", "cha"]);
export type AbilityKey = z.infer<typeof abilityKey>;

export const abilityScores = z
  .object({
    str: z.number().int().min(1).max(30).optional(),
    dex: z.number().int().min(1).max(30).optional(),
    con: z.number().int().min(1).max(30).optional(),
    int: z.number().int().min(1).max(30).optional(),
    wis: z.number().int().min(1).max(30).optional(),
    cha: z.number().int().min(1).max(30).optional(),
  })
  .strict();

export const alignment = z.enum([
  "lawful_good",
  "neutral_good",
  "chaotic_good",
  "lawful_neutral",
  "neutral",
  "chaotic_neutral",
  "lawful_evil",
  "neutral_evil",
  "chaotic_evil",
  "unaligned",
]);

export const rarity = z.enum(["common", "uncommon", "rare", "very_rare", "legendary"]);
export type Rarity = z.infer<typeof rarity>;

export const effectDef = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ac_bonus"), amount: z.number().int() }).strict(),
  z.object({ kind: z.literal("attack_bonus"), amount: z.number().int() }).strict(),
  z.object({ kind: z.literal("damage_bonus"), amount: z.number().int(), damageType: z.string().min(1).optional() }).strict(),
  z.object({ kind: z.literal("on_hit_rider"), damage: z.string().min(1), damageType: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("resistance"), damageType: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("immunity"), damageType: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("grant_spell"), spellId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("grant_feature"), featureId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("stat_set"), ability: abilityKey, score: z.number().int() }).strict(),
  z.object({ kind: z.literal("stat_increase_cap"), ability: abilityKey, cap: z.number().int() }).strict(),
]);
export type EffectDef = z.infer<typeof effectDef>;

export const itemRequires = z
  .object({
    species: z.array(z.string().min(1)).optional(),
    class: z.array(z.string().min(1)).optional(),
    alignment: z.array(alignment).optional(),
    minLevel: z.number().int().min(1).max(20).optional(),
    minAbility: abilityScores.optional(),
    proficiency: z.array(z.string().min(1)).optional(),
    spellcaster: z.boolean().optional(),
    attunement: z.boolean().optional(),
  })
  .strict();
export type ItemRequires = z.infer<typeof itemRequires>;

const scoreGate = z.object({ ability: abilityKey, min: z.number().int() }).strict();

export const classLevel = z
  .object({
    level: z.number().int().min(1).max(20),
    proficiencyBonus: z.number().int().min(2).max(6),
    features: z.array(z.string()),
    spellSlots: z.record(z.string(), z.number().int().nonnegative()).optional(),
    pactSlots: z.object({ slotLevel: z.number().int(), count: z.number().int() }).strict().optional(),
    cantrips: z.number().int().nonnegative().optional(),
    preparedSpells: z.number().int().nonnegative().optional(),
    spellsKnown: z.number().int().nonnegative().optional(),
  })
  .strict();

export const classDef = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    hitDie: z.number().int().min(6).max(12),
    saves: z.array(abilityKey).min(1),
    skillChoices: z.number().int().nonnegative(),
    skillList: z.array(z.string()),
    primary: z.array(abilityKey).min(1),
    multiclass: z
      .object({
        allOf: z.array(scoreGate).optional(),
        anyOf: z.array(scoreGate).optional(),
      })
      .strict(),
    caster: z.enum(["none", "full", "half", "pact", "third"]),
    spellAbility: abilityKey.optional(),
    spellProgression: z
      .object({ mode: z.enum(["prepared", "known", "pact"]) })
      .strict()
      .optional(),
    weaponMastery: z.boolean(),
    levels: z.array(classLevel).length(20),
  })
  .strict();
export type ClassDef = z.infer<typeof classDef>;

export const subclassDef = z
  .object({
    id: z.string().min(1),
    classId: z.string().min(1),
    name: z.string().min(1),
    level: z.number().int().min(1).max(20),
    features: z.array(z.string()),
    featuresByLevel: z
      .array(z.object({ level: z.number().int(), features: z.array(z.string()) }).strict())
      .optional(),
  })
  .strict();
export type SubclassDef = z.infer<typeof subclassDef>;

export const speciesDef = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    speedFt: z.number().int().positive(),
    size: z.enum(["small", "medium"]),
    traits: z.array(z.string()),
    effects: z.array(effectDef).optional(),
    hpPerLevel: z.number().int().optional(),
  })
  .strict();
export type SpeciesDef = z.infer<typeof speciesDef>;

export const backgroundDef = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    skills: z.array(z.string()),
    tools: z.array(z.string()).optional(),
    feat: z.string().optional(),
  })
  .strict();

export const spellDef = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    level: z.number().int().min(0).max(9),
    school: z.string().min(1),
    classes: z.array(z.string()).min(1),
    castingTime: z.string().min(1),
    range: z.string().min(1),
    duration: z.string().min(1),
    description: z.string().min(1),
  })
  .strict();
export type SpellDef = z.infer<typeof spellDef>;

export const featDef = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    repeatable: z.boolean(),
    description: z.string().min(1),
    prerequisites: z.array(z.string()).optional(),
  })
  .strict();

export const itemDef = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    rarity: rarity,
    slot: z.enum(["armor", "shield", "mainhand", "offhand", "trinket", "consumable"]),
    weaponId: z.string().optional(),
    requires: itemRequires.optional(),
    effects: z.array(effectDef),
    weaponMastery: z.enum(["cleave", "graze", "nick", "push", "sap", "slow", "topple", "vex"]).optional(),
    priceGold: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ItemDef = z.infer<typeof itemDef>;

export const monsterDef = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    size: z.string().min(1),
    creatureType: z.string().min(1),
    alignment: z.string().min(1),
    ac: z.number().int().positive(),
    hp: z.number().int().positive(),
    cr: z.string().min(1),
    crValue: z.number().nonnegative(),
    xp: z.number().int().nonnegative(),
    actions: z.array(z.string()).optional(),
  })
  .strict();
export type MonsterDef = z.infer<typeof monsterDef>;

export const xpTable = z
  .object({
    levels: z.array(z.number().int().nonnegative()).length(20),
  })
  .strict();

export const lootBand = z
  .object({
    minCr: z.number().nonnegative(),
    maxCr: z.number().nonnegative(),
    mode: z.enum(["pve", "ranked", "arcade", "test"]),
    weights: z.object({
      common: z.number().nonnegative(),
      uncommon: z.number().nonnegative(),
      rare: z.number().nonnegative(),
      very_rare: z.number().nonnegative(),
      legendary: z.number().nonnegative(),
    }).strict(),
  })
  .strict();

export const lootTable = z.object({ bands: z.array(lootBand) }).strict();

export const weaponMasteryDef = z
  .object({
    id: z.enum(["cleave", "graze", "nick", "push", "sap", "slow", "topple", "vex"]),
    name: z.string().min(1),
    summary: z.string().min(1),
  })
  .strict();

export const campaignManifest = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    levelCap: z
      .object({
        "1": z.number().int().min(1).max(20),
        "2": z.number().int().min(1).max(20),
        "3": z.number().int().min(1).max(20),
        "4": z.number().int().min(1).max(20),
      })
      .strict(),
  })
  .passthrough();

export const contentReviewBundle = z
  .object({
    kind: z.string(),
    id: z.string(),
    status: z.enum(["auto_ok", "needs_review", "resolved", "rejected"]),
    confidence: z.enum(["high", "medium", "low"]),
    unparsedFields: z.array(z.string()).default([]),
    usage: z.string(),
    srd: z.record(z.string(), z.unknown()).optional(),
    ambiguities: z
      .array(
        z
          .object({
            field: z.string(),
            summary: z.string(),
            options: z.array(z.object({ label: z.string(), patch: z.record(z.string(), z.unknown()) }).strict()),
            parserChoice: z.number().int().optional(),
          })
          .strict(),
      )
      .default([]),
    adminNote: z.string().optional(),
    resolvedPatch: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const pendingEntry = z
  .object({
    id: z.string().min(1),
    kind: z.string().min(1),
    reason: z.string().min(1),
    _raw_md: z.string(),
    partial: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const FILE_SCHEMAS: Record<string, ZodTypeAny> = {
  "classes.json": z.object({ entries: z.array(classDef) }).strict(),
  "subclasses.json": z.object({ entries: z.array(subclassDef) }).strict(),
  "species.json": z.object({ entries: z.array(speciesDef) }).strict(),
  "backgrounds.json": z.object({ entries: z.array(backgroundDef) }).strict(),
  "spells.json": z.object({ entries: z.array(spellDef) }).strict(),
  "feats.json": z.object({ entries: z.array(featDef) }).strict(),
  "gear.json": z.object({ entries: z.array(itemDef) }).strict(),
  "magic.json": z.object({ entries: z.array(itemDef) }).strict(),
  "monsters.json": z.object({ entries: z.array(monsterDef) }).strict(),
  "xp-table.json": xpTable,
  "by-cr.json": lootTable,
  "weapon-mastery.json": z.object({ entries: z.array(weaponMasteryDef) }).strict(),
};

export function schemaForFile(fileName: string): ZodTypeAny | undefined {
  return FILE_SCHEMAS[fileName];
}

export type Issue = { file: string; message: string };

export function issuesFor(fileName: string, data: unknown): string[] {
  const schema = schemaForFile(fileName);
  if (!schema) return [];
  const parsed = schema.safeParse(data);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
}
