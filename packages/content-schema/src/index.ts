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

export const auraTick = z
  .object({
    dice: z.string().min(1).optional(),
    damageType: z.string().min(1).optional(),
    heal: z.number().int().optional(),
    saveAbility: abilityKey.optional(),
    saveDc: z.number().int().optional(),
  })
  .strict();
export type AuraTick = z.infer<typeof auraTick>;

const auraFields = {
  radiusCells: z.number().int().positive(),
  filter: z.enum(["ally", "enemy", "all"]),
  excludeSource: z.boolean().optional(),
  creatureTypes: z.array(z.string().min(1)).optional(),
  ac: z.number().int().optional(),
  saves: z.number().int().optional(),
  stealth: z.number().int().optional(),
  saveAdv: z.enum(["all", "vs_magic"]).optional(),
  attackDisadvAgainst: z.boolean().optional(),
  resistances: z.array(z.string().min(1)).optional(),
  speedMult: z.number().optional(),
  strip: z.array(z.enum(["frightened", "charmed"])).optional(),
  heavilyObscured: z.boolean().optional(),
  difficultTerrainFor: z.enum(["enemy"]).optional(),
  onStartTurn: auraTick.optional(),
  onEnterOrEndTurn: auraTick.optional(),
  blocksMovement: z.boolean().optional(),
  blocksSpellsFromOutside: z.boolean().optional(),
};

export const effectDef = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ac_bonus"), amount: z.number().int() }).strict(),
  z.object({ kind: z.literal("attack_bonus"), amount: z.number().int() }).strict(),
  z.object({ kind: z.literal("damage_bonus"), amount: z.number().int(), damageType: z.string().min(1).optional() }).strict(),
  z
    .object({
      kind: z.literal("on_hit_rider"),
      damage: z.string().min(1),
      damageType: z.string().min(1).optional(),
      saveAbility: z.enum(["str", "dex", "con", "int", "wis", "cha"]).optional(),
      saveDc: z.number().int().positive().optional(),
      halfDamage: z.string().min(1).optional(),
      triggerOnAnyHit: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("haste_drink"),
      inventoryToken: z.string().min(1).optional(),
    })
    .strict(),
  z.object({ kind: z.literal("resistance"), damageType: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("immunity"), damageType: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("grant_spell"), spellId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("grant_feature"), featureId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("stat_set"), ability: abilityKey, score: z.number().int() }).strict(),
  z
    .object({
      kind: z.literal("stat_drink"),
      ability: abilityKey,
      score: z.number().int(),
      durationPcTurns: z.number().int().positive().optional(),
    })
    .strict(),
  z.object({ kind: z.literal("stat_increase_cap"), ability: abilityKey, cap: z.number().int() }).strict(),
  z.object({ kind: z.literal("save_bonus"), amount: z.number().int() }).strict(),
  z.object({ kind: z.literal("heal_drink"), dice: z.string().min(1) }).strict(),
  z
    .object({
      kind: z.literal("invisibility_drink"),
      durationPcTurns: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("resistance_drink"),
      damageType: z.string().min(1),
      durationPcTurns: z.number().int().positive().optional(),
      inventoryToken: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("animated_shield"),
      acBonus: z.number().int().positive().optional(),
      durationPcTurns: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("cloak_invisibility"),
      durationPcTurns: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("scroll_cast"),
      spellId: z.string().min(1),
      inventoryToken: z.string().min(1).optional(),
    })
    .strict(),
  z.object({ kind: z.literal("grant_aura"), ...auraFields }).strict(),
  z.object({ kind: z.literal("plant_aura"), ...auraFields }).strict(),
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
    /** The class table's own columns at this level, e.g. { rages: "3", rage_damage: "+2" }. */
    columns: z.record(z.string(), z.string()).optional(),
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
    /** The option the background fixes, e.g. "cleric" for Magic Initiate (Cleric). */
    featChoice: z.string().optional(),
    /** Ability scores the background may increase (+2/+1 or +1×3). Custom may list all six. */
    abilityOptions: z.array(abilityKey).min(3).max(6).optional(),
    /** Custom origin: player picks skills/feat/tools freely. */
    custom: z.boolean().optional(),
  })
  .strict();

/** A dice expression as written in the SRD, e.g. "2d6 + 5" stored as "2d6+5". Flat numbers are allowed. */
export const diceExpr = z.string().regex(/^(\d+d\d+([+-]\d+)?|\d+)$/);

export const damagePart = z
  .object({
    dice: diceExpr,
    damageType: z.string().min(1),
    /** The SRD's printed average, kept so the admin can check the dice. */
    average: z.number().int().nonnegative().optional(),
  })
  .strict();

export const areaShape = z.enum(["sphere", "cone", "cube", "line", "cylinder", "emanation"]);

export const spellMechanics = z
  .object({
    attack: z.enum(["melee", "ranged"]).optional(),
    save: z
      .object({ ability: abilityKey, onSuccess: z.enum(["half", "none", "special"]) })
      .strict()
      .optional(),
    damage: z.array(damagePart).optional(),
    heal: diceExpr.optional(),
    healAddsModifier: z.boolean().optional(),
    area: z.object({ shape: areaShape, sizeFt: z.number().int().positive() }).strict().optional(),
    rangeFt: z.number().int().nonnegative().optional(),
    conditions: z.array(z.string().min(1)).optional(),
    /** Extra dice per slot level above the spell's own level. */
    upcastPerSlot: diceExpr.optional(),
    upcastText: z.string().min(1).optional(),
    /** Cantrip dice at character levels 1, 5, 11, 17. */
    cantripDice: z.array(diceExpr).length(4).optional(),
  })
  .strict();
export type SpellMechanics = z.infer<typeof spellMechanics>;

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
    components: z
      .object({ verbal: z.boolean(), somatic: z.boolean(), material: z.string().min(1).optional() })
      .strict()
      .optional(),
    ritual: z.boolean().optional(),
    concentration: z.boolean().optional(),
    mechanics: spellMechanics.optional(),
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
    /** Half-feat: abilities the player may raise by +1 when taking this feat. */
    asiChoices: z.array(abilityKey).min(1).optional(),
  })
  .strict();

export const itemDef = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    rarity: rarity,
    slot: z.enum(["armor", "shield", "mainhand", "offhand", "trinket", "consumable"]),
    weaponId: z.string().optional(),
    /** Magic weapons and armor: the gear ids the SRD allows as the mundane base. */
    baseItems: z.array(z.string().min(1)).min(1).optional(),
    requires: itemRequires.optional(),
    effects: z.array(effectDef),
    weaponMastery: z.enum(["cleave", "graze", "nick", "push", "sap", "slow", "topple", "vex"]).optional(),
    priceGold: z.number().int().nonnegative().optional(),
    weapon: z
      .object({
        category: z.enum(["simple_melee", "simple_ranged", "martial_melee", "martial_ranged"]),
        damage: diceExpr,
        damageType: z.string().min(1),
        properties: z.array(z.string().min(1)),
        rangeFt: z.object({ normal: z.number().int().positive(), long: z.number().int().positive() }).strict().optional(),
        versatile: diceExpr.optional(),
      })
      .strict()
      .optional(),
    armor: z
      .object({
        category: z.enum(["light", "medium", "heavy", "shield"]),
        baseAc: z.number().int().nonnegative(),
        /** null means the full Dexterity modifier; 0 means none. */
        dexCap: z.number().int().nonnegative().nullable(),
        strength: z.number().int().positive().optional(),
        stealthDisadvantage: z.boolean(),
      })
      .strict()
      .optional(),
    charges: z.number().int().positive().optional(),
    weightLb: z.number().nonnegative().optional(),
  })
  .strict();
export type ItemDef = z.infer<typeof itemDef>;

export const monsterAction = z
  .object({
    name: z.string().min(1),
    text: z.string(),
    attack: z
      .object({
        kind: z.enum(["melee", "ranged", "melee_or_ranged"]),
        bonus: z.number().int(),
        reachFt: z.number().int().positive().optional(),
        rangeFt: z.object({ normal: z.number().int().positive(), long: z.number().int().positive().optional() }).strict().optional(),
      })
      .strict()
      .optional(),
    save: z.object({ ability: abilityKey, dc: z.number().int().positive(), onSuccess: z.enum(["half", "none", "special"]) }).strict().optional(),
    damage: z.array(damagePart).optional(),
    conditions: z.array(z.string().min(1)).optional(),
    recharge: z.string().min(1).optional(),
    uses: z.string().min(1).optional(),
  })
  .strict();
export type MonsterAction = z.infer<typeof monsterAction>;

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
    group: z.string().min(1).optional(),
    hitDice: diceExpr.optional(),
    initiative: z.number().int().optional(),
    speed: z.string().min(1).optional(),
    abilities: abilityScores.optional(),
    saves: z.record(abilityKey, z.number().int()).optional(),
    skills: z.string().min(1).optional(),
    resistances: z.string().min(1).optional(),
    vulnerabilities: z.string().min(1).optional(),
    immunities: z.string().min(1).optional(),
    gear: z.string().min(1).optional(),
    senses: z.string().min(1).optional(),
    languages: z.string().min(1).optional(),
    proficiencyBonus: z.number().int().positive().optional(),
    traits: z.array(monsterAction).optional(),
    actions: z.array(monsterAction).optional(),
    bonusActions: z.array(monsterAction).optional(),
    reactions: z.array(monsterAction).optional(),
    legendaryActions: z.array(monsterAction).optional(),
    legendaryUses: z.number().int().positive().optional(),
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
    /** Rules the SRD text states that the typed schema cannot carry. The game ignores them. */
    notModeled: z.array(z.string()).optional(),
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
