import fs from "node:fs";
import path from "node:path";

type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";
type Gate = { ability: Ability; min: number };

type ClassSeed = {
  id: string;
  name: string;
  hitDie: number;
  saves: Ability[];
  skillChoices: number;
  skillList: string[];
  primary: Ability[];
  allOf?: Gate[];
  anyOf?: Gate[];
  caster: "none" | "full" | "half" | "pact" | "third";
  spellAbility?: Ability;
  weaponMastery: boolean;
  subclass: string;
};

const CLASSES: ClassSeed[] = [
  { id: "barbarian", name: "Barbarian", hitDie: 12, saves: ["str", "con"], skillChoices: 2, skillList: ["animal_handling", "athletics", "intimidation", "nature", "perception", "survival"], primary: ["str"], allOf: [{ ability: "str", min: 13 }], caster: "none", weaponMastery: true, subclass: "Berserker" },
  { id: "bard", name: "Bard", hitDie: 8, saves: ["dex", "cha"], skillChoices: 3, skillList: ["acrobatics", "deception", "performance", "persuasion", "insight"], primary: ["cha"], allOf: [{ ability: "cha", min: 13 }], caster: "full", spellAbility: "cha", weaponMastery: false, subclass: "College of Lore" },
  { id: "cleric", name: "Cleric", hitDie: 8, saves: ["wis", "cha"], skillChoices: 2, skillList: ["history", "insight", "medicine", "persuasion", "religion"], primary: ["wis"], allOf: [{ ability: "wis", min: 13 }], caster: "full", spellAbility: "wis", weaponMastery: false, subclass: "Life Domain" },
  { id: "druid", name: "Druid", hitDie: 8, saves: ["int", "wis"], skillChoices: 2, skillList: ["animal_handling", "arcana", "insight", "medicine", "nature", "perception", "religion", "survival"], primary: ["wis"], allOf: [{ ability: "wis", min: 13 }], caster: "full", spellAbility: "wis", weaponMastery: false, subclass: "Circle of the Land" },
  { id: "fighter", name: "Fighter", hitDie: 10, saves: ["str", "con"], skillChoices: 2, skillList: ["acrobatics", "athletics", "history", "insight", "intimidation", "perception", "survival"], primary: ["str", "dex"], anyOf: [{ ability: "str", min: 13 }, { ability: "dex", min: 13 }], caster: "none", weaponMastery: true, subclass: "Champion" },
  { id: "monk", name: "Monk", hitDie: 8, saves: ["str", "dex"], skillChoices: 2, skillList: ["acrobatics", "athletics", "history", "insight", "religion", "stealth"], primary: ["dex", "wis"], allOf: [{ ability: "dex", min: 13 }, { ability: "wis", min: 13 }], caster: "none", weaponMastery: false, subclass: "Warrior of the Open Hand" },
  { id: "paladin", name: "Paladin", hitDie: 10, saves: ["wis", "cha"], skillChoices: 2, skillList: ["athletics", "insight", "intimidation", "medicine", "persuasion", "religion"], primary: ["str", "cha"], allOf: [{ ability: "str", min: 13 }, { ability: "cha", min: 13 }], caster: "half", spellAbility: "cha", weaponMastery: true, subclass: "Oath of Devotion" },
  { id: "ranger", name: "Ranger", hitDie: 10, saves: ["str", "dex"], skillChoices: 3, skillList: ["animal_handling", "athletics", "insight", "investigation", "nature", "perception", "stealth", "survival"], primary: ["dex", "wis"], allOf: [{ ability: "dex", min: 13 }, { ability: "wis", min: 13 }], caster: "half", spellAbility: "wis", weaponMastery: true, subclass: "Hunter" },
  { id: "rogue", name: "Rogue", hitDie: 8, saves: ["dex", "int"], skillChoices: 4, skillList: ["acrobatics", "athletics", "deception", "insight", "intimidation", "investigation", "perception", "persuasion", "sleight_of_hand", "stealth"], primary: ["dex"], allOf: [{ ability: "dex", min: 13 }], caster: "none", weaponMastery: false, subclass: "Thief" },
  { id: "sorcerer", name: "Sorcerer", hitDie: 6, saves: ["con", "cha"], skillChoices: 2, skillList: ["arcana", "deception", "insight", "intimidation", "persuasion", "religion"], primary: ["cha"], allOf: [{ ability: "cha", min: 13 }], caster: "full", spellAbility: "cha", weaponMastery: false, subclass: "Draconic Sorcery" },
  { id: "warlock", name: "Warlock", hitDie: 8, saves: ["wis", "cha"], skillChoices: 2, skillList: ["arcana", "deception", "history", "intimidation", "investigation", "nature", "religion"], primary: ["cha"], allOf: [{ ability: "cha", min: 13 }], caster: "pact", spellAbility: "cha", weaponMastery: false, subclass: "Fiend Patron" },
  { id: "wizard", name: "Wizard", hitDie: 6, saves: ["int", "wis"], skillChoices: 2, skillList: ["arcana", "history", "insight", "investigation", "medicine", "religion"], primary: ["int"], allOf: [{ ability: "int", min: 13 }], caster: "full", spellAbility: "int", weaponMastery: false, subclass: "Evoker" },
];

const FULL_SLOTS: number[][] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

function slotsFrom(row: number[] | undefined): Record<string, number> | undefined {
  if (!row?.length) return undefined;
  const out: Record<string, number> = {};
  row.forEach((count, i) => {
    out[String(i + 1)] = count;
  });
  return out;
}

function pact(level: number): { slotLevel: number; count: number } | undefined {
  if (level < 1) return undefined;
  const slotLevel = level < 3 ? 1 : level < 5 ? 2 : level < 7 ? 3 : level < 9 ? 4 : 5;
  const count = level < 2 ? 1 : level < 11 ? 2 : level < 17 ? 3 : 4;
  return { slotLevel, count };
}

function prof(level: number): number {
  if (level >= 17) return 6;
  if (level >= 13) return 5;
  if (level >= 9) return 4;
  if (level >= 5) return 3;
  return 2;
}

function featuresFor(seed: ClassSeed, level: number): string[] {
  const features: string[] = [];
  if (level === 1) features.push(seed.name, ...(seed.weaponMastery ? ["weapon_mastery"] : []), ...(seed.caster !== "none" ? ["spellcasting"] : []));
  if (level === 3) features.push("subclass");
  if ([4, 8, 12, 16, 19].includes(level)) features.push("asi_or_feat");
  return features;
}

function levelsFor(seed: ClassSeed) {
  return Array.from({ length: 20 }, (_, i) => {
    const level = i + 1;
    const casterIndex = seed.caster === "full" ? level - 1 : seed.caster === "half" ? Math.floor(level / 2) - 1 : -1;
    const spellSlots = casterIndex >= 0 ? slotsFrom(FULL_SLOTS[casterIndex]) : undefined;
    return {
      level,
      proficiencyBonus: prof(level),
      features: featuresFor(seed, level),
      ...(spellSlots ? { spellSlots } : {}),
      ...(seed.caster === "pact" ? { pactSlots: pact(level) } : {}),
    };
  });
}

function write(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

export function emitCore(root: string): void {
  const dir = path.join(root, "content", "srd-5.2.1");
  write(path.join(dir, "classes.json"), {
    entries: CLASSES.map((seed) => ({
      id: seed.id,
      name: seed.name,
      hitDie: seed.hitDie,
      saves: seed.saves,
      skillChoices: seed.skillChoices,
      skillList: seed.skillList,
      primary: seed.primary,
      multiclass: { ...(seed.allOf ? { allOf: seed.allOf } : {}), ...(seed.anyOf ? { anyOf: seed.anyOf } : {}) },
      caster: seed.caster,
      ...(seed.spellAbility ? { spellAbility: seed.spellAbility } : {}),
      weaponMastery: seed.weaponMastery,
      levels: levelsFor(seed),
    })),
  });
  write(path.join(dir, "subclasses.json"), {
    entries: CLASSES.map((seed) => ({
      id: seed.subclass.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
      classId: seed.id,
      name: seed.subclass,
      level: 3,
      features: [seed.subclass],
    })),
  });
  write(path.join(dir, "species.json"), {
    entries: [
      ["human", "Human"],
      ["elf", "Elf"],
      ["dwarf", "Dwarf"],
      ["halfling", "Halfling"],
      ["gnome", "Gnome"],
      ["dragonborn", "Dragonborn"],
      ["tiefling", "Tiefling"],
      ["orc", "Orc"],
      ["goliath", "Goliath"],
      ["aasimar", "Aasimar"],
    ].map(([id, name]) => ({ id, name, speedFt: 30, size: id === "gnome" || id === "halfling" ? "small" : "medium", traits: [name] })),
  });
  write(path.join(dir, "backgrounds.json"), {
    entries: [
      ["acolyte", "Acolyte", ["insight", "religion"]],
      ["criminal", "Criminal", ["deception", "stealth"]],
      ["sage", "Sage", ["arcana", "history"]],
      ["soldier", "Soldier", ["athletics", "intimidation"]],
      ["entertainer", "Entertainer", ["acrobatics", "performance"]],
      ["hermit", "Hermit", ["medicine", "religion"]],
    ].map(([id, name, skills]) => ({ id, name, skills })),
  });
  write(path.join(dir, "spells.json"), {
    entries: [
      ["fire_bolt", "Fire Bolt", 0, "evocation", ["sorcerer", "wizard"], "Action", "120 feet", "Instantaneous", "A mote of fire."],
      ["sacred_flame", "Sacred Flame", 0, "evocation", ["cleric"], "Action", "60 feet", "Instantaneous", "Flame descends on one creature."],
      ["eldritch_blast", "Eldritch Blast", 0, "evocation", ["warlock"], "Action", "120 feet", "Instantaneous", "A beam of crackling energy."],
      ["vicious_mockery", "Vicious Mockery", 0, "enchantment", ["bard"], "Action", "60 feet", "Instantaneous", "A string of insults."],
      ["guidance", "Guidance", 0, "divination", ["cleric", "druid"], "Action", "Touch", "1 minute", "A prayer steadies a check."],
      ["mage_armor", "Mage Armor", 1, "abjuration", ["sorcerer", "wizard"], "Action", "Touch", "8 hours", "An invisible force protects the target."],
      ["magic_missile", "Magic Missile", 1, "evocation", ["sorcerer", "wizard"], "Action", "120 feet", "Instantaneous", "Darts of force that do not miss."],
      ["shield", "Shield", 1, "abjuration", ["sorcerer", "wizard"], "Reaction", "Self", "1 round", "An invisible barrier."],
      ["cure_wounds", "Cure Wounds", 1, "abjuration", ["bard", "cleric", "druid", "paladin", "ranger"], "Action", "Touch", "Instantaneous", "A creature regains hit points."],
      ["healing_word", "Healing Word", 1, "abjuration", ["bard", "cleric", "druid"], "Bonus action", "60 feet", "Instantaneous", "A word of healing."],
      ["hunters_mark", "Hunter's Mark", 1, "divination", ["ranger"], "Bonus action", "90 feet", "1 hour", "You mark a quarry."],
      ["thunderwave", "Thunderwave", 1, "evocation", ["bard", "druid", "sorcerer", "wizard"], "Action", "Self", "Instantaneous", "A wave of thunder."],
    ].map(([id, name, level, school, classes, castingTime, range, duration, description]) => ({
      id, name, level, school, classes, castingTime, range, duration, description,
    })),
  });
  write(path.join(dir, "feats.json"), {
    entries: [
      { id: "alert", name: "Alert", repeatable: false, description: "You react before others do." },
      { id: "tough", name: "Tough", repeatable: false, description: "Your hit point maximum increases." },
      { id: "magic_initiate", name: "Magic Initiate", repeatable: false, description: "You learn two cantrips and a 1st-level spell." },
    ],
  });
  write(path.join(dir, "items", "gear.json"), {
    entries: [
      weapon("longsword", "Longsword", "sap"),
      weapon("greataxe", "Greataxe", "cleave"),
      weapon("dagger", "Dagger", "nick"),
      weapon("pike", "Pike", "push"),
      weapon("mace", "Mace", "sap"),
      weapon("club", "Club", "slow"),
      weapon("quarterstaff", "Quarterstaff", "topple"),
      weapon("shortbow", "Shortbow", "vex"),
      weapon("scimitar", "Scimitar", "nick"),
      weapon("handaxe", "Handaxe", "vex"),
      weapon("greatsword", "Greatsword", "graze"),
      weapon("warhammer", "Warhammer", "topple"),
    ],
  });
  write(path.join(dir, "items", "magic.json"), {
    entries: [
      {
        id: "longsword_plus_1",
        name: "+1 Longsword",
        rarity: "uncommon",
        slot: "mainhand",
        weaponId: "longsword",
        weaponMastery: "sap",
        effects: [{ kind: "attack_bonus", amount: 1 }, { kind: "damage_bonus", amount: 1, damageType: "slashing" }],
        priceGold: 500,
      },
      {
        id: "cloak_of_protection",
        name: "Cloak of Protection",
        rarity: "uncommon",
        slot: "trinket",
        requires: { attunement: true },
        effects: [{ kind: "ac_bonus", amount: 1 }],
        priceGold: 500,
      },
      {
        id: "armor_plus_2",
        name: "+2 Armor",
        rarity: "rare",
        slot: "armor",
        effects: [{ kind: "ac_bonus", amount: 2 }],
        priceGold: 3000,
      },
      {
        id: "flame_tongue",
        name: "Flame Tongue",
        rarity: "rare",
        slot: "mainhand",
        weaponId: "longsword",
        weaponMastery: "sap",
        requires: { attunement: true },
        effects: [{ kind: "on_hit_rider", damage: "2d6", damageType: "fire" }],
        priceGold: 3000,
      },
    ],
  });
  write(path.join(dir, "weapon-mastery.json"), {
    entries: [
      ["cleave", "Cleave", "On a hit, a second adjacent creature takes the weapon damage."],
      ["graze", "Graze", "On a miss, the target still takes damage equal to the ability modifier."],
      ["nick", "Nick", "An extra attack with this weapon can be part of the Attack action."],
      ["push", "Push", "On a hit, push the target 10 feet."],
      ["sap", "Sap", "On a hit, the next attack against the target has advantage until your next turn."],
      ["slow", "Slow", "On a hit, the target's speed drops by 10 feet."],
      ["topple", "Topple", "On a hit, the target makes a save or falls prone."],
      ["vex", "Vex", "On a hit, your next attack against the target has advantage."],
    ].map(([id, name, summary]) => ({ id, name, summary })),
  });
  write(path.join(dir, "xp-table.json"), {
    levels: [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000],
  });
  const weights = (common: number, uncommon: number, rare: number, veryRare: number, legendary: number) => ({
    common, uncommon, rare, very_rare: veryRare, legendary,
  });
  write(path.join(dir, "loot", "by-cr.json"), {
    bands: [
      { minCr: 0, maxCr: 4, mode: "pve", weights: weights(70, 25, 5, 0, 0) },
      { minCr: 5, maxCr: 10, mode: "pve", weights: weights(40, 40, 18, 2, 0) },
      { minCr: 11, maxCr: 16, mode: "pve", weights: weights(10, 30, 40, 18, 2) },
      { minCr: 17, maxCr: 30, mode: "pve", weights: weights(0, 10, 30, 40, 20) },
      { minCr: 0, maxCr: 30, mode: "ranked", weights: weights(20, 35, 30, 12, 3) },
      { minCr: 0, maxCr: 30, mode: "arcade", weights: weights(80, 20, 0, 0, 0) },
      { minCr: 0, maxCr: 30, mode: "test", weights: weights(0, 0, 0, 0, 0) },
    ],
  });
  write(path.join(dir, "_queue", "sample-unparsed.pending.json"), {
    id: "sample_unparsed",
    kind: "spell",
    reason: "Missing level, school, and classes after 10 strategies.",
    _raw_md: "## Sample\n\nThis paragraph has no spell stat line.",
  });
}

function weapon(id: string, name: string, mastery: string) {
  return {
    id,
    name,
    rarity: "common",
    slot: "mainhand",
    weaponId: id,
    weaponMastery: mastery,
    effects: [],
    priceGold: 100,
  };
}
