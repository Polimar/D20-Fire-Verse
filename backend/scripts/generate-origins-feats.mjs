/**
 * One-shot generator: FireVerse origins + missing feats into srd-5.2.1 catalog/reviews.
 * Run: node backend/scripts/generate-origins-feats.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../content/srd-5.2.1");

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

const backgrounds = [
  { id: "acolyte", name: "Acolyte", abilityOptions: ["int", "wis", "cha"], skills: ["insight", "religion"], tools: ["calligraphers_supplies"], feat: "magic_initiate", featChoice: "cleric", equipA: "Calligrapher's Supplies, Holy Symbol, Parchment (10 sheets), Robe, 8 GP", goldA: 8 },
  { id: "artisan", name: "Artisan", abilityOptions: ["str", "dex", "int"], skills: ["investigation", "persuasion"], tools: ["artisans_tools"], feat: "crafter", equipA: "Artisan's Tools, Traveler's Clothes, Pouch, 28 GP", goldA: 28 },
  { id: "charlatan", name: "Charlatan", abilityOptions: ["dex", "con", "cha"], skills: ["deception", "sleight_of_hand"], tools: ["disguise_kit"], feat: "skilled", equipA: "Disguise Kit, Fine Clothes, 15 GP", goldA: 15 },
  { id: "criminal", name: "Criminal", abilityOptions: ["dex", "con", "int"], skills: ["stealth", "sleight_of_hand"], tools: ["thieves_tools"], feat: "alert", equipA: "Thieves' Tools, 2 Daggers, Crowbar, Traveler's Clothes, 16 GP", goldA: 16 },
  { id: "entertainer", name: "Entertainer", abilityOptions: ["dex", "con", "cha"], skills: ["acrobatics", "performance"], tools: ["musical_instrument"], feat: "musician", equipA: "Musical Instrument, Costume, Mirror, 11 GP", goldA: 11 },
  { id: "farmer", name: "Farmer", abilityOptions: ["str", "con", "wis"], skills: ["animal_handling", "nature"], tools: ["land_vehicles"], feat: "tough", equipA: "Sickle, Healer's Kit, Traveler's Clothes, 23 GP", goldA: 23 },
  { id: "guard", name: "Guard", abilityOptions: ["str", "int", "wis"], skills: ["athletics", "perception"], tools: ["gaming_set"], feat: "alert", equipA: "Spear, Manacles, Traveler's Clothes, 12 GP", goldA: 12 },
  { id: "guide", name: "Guide", abilityOptions: ["dex", "con", "wis"], skills: ["stealth", "survival"], tools: ["cartographers_tools"], feat: "magic_initiate", featChoice: "druid", equipA: "Shortbow, 20 Arrows, Quiver, Traveler's Clothes, 3 GP", goldA: 3 },
  { id: "hermit", name: "Hermit", abilityOptions: ["con", "wis", "cha"], skills: ["medicine", "religion"], tools: ["herbalism_kit"], feat: "healer", equipA: "Herbalism Kit, Blanket, Robe, 15 GP", goldA: 15 },
  { id: "noble", name: "Noble", abilityOptions: ["str", "int", "cha"], skills: ["history", "persuasion"], tools: ["gaming_set"], feat: "skilled", equipA: "Fine Clothes, Signet Ring, Perfume, 29 GP", goldA: 29 },
  { id: "sage", name: "Sage", abilityOptions: ["con", "int", "wis"], skills: ["arcana", "history"], tools: ["calligraphers_supplies"], feat: "magic_initiate", featChoice: "wizard", equipA: "Calligrapher's Supplies, Quarterstaff, Parchment (8 sheets), Robe, 8 GP", goldA: 8 },
  { id: "sailor", name: "Sailor", abilityOptions: ["str", "dex", "wis"], skills: ["athletics", "perception"], tools: ["navigators_tools"], feat: "tavern_brawler", equipA: "Club, Navigator's Tools, Traveler's Clothes, 10 GP", goldA: 10 },
  { id: "merchant", name: "Merchant", abilityOptions: ["con", "int", "cha"], skills: ["animal_handling", "persuasion"], tools: ["navigators_tools"], feat: "lucky", equipA: "Fine Clothes, Pouch, 22 GP", goldA: 22 },
  { id: "soldier", name: "Soldier", abilityOptions: ["str", "dex", "con"], skills: ["athletics", "intimidation"], tools: ["gaming_set"], feat: "savage_attacker", equipA: "Spear, Shortbow, 20 Arrows, Gaming Set, Healer's Kit, Quiver, Traveler's Clothes, 14 GP", goldA: 14 },
  { id: "urchin", name: "Urchin", abilityOptions: ["dex", "con", "wis"], skills: ["stealth", "sleight_of_hand"], tools: ["thieves_tools"], feat: "lucky", equipA: "Thieves' Tools, Dagger, Traveler's Clothes, 18 GP", goldA: 18 },
  { id: "wayfarer", name: "Wayfarer", abilityOptions: ["dex", "wis", "cha"], skills: ["insight", "stealth"], tools: ["disguise_kit"], feat: "lucky", equipA: "Disguise Kit, 2 Daggers, Traveler's Clothes, 16 GP", goldA: 16 },
  { id: "custom", name: "Custom Origin", abilityOptions: ["str", "dex", "con"], skills: [], feat: undefined, custom: true, equipA: "50 GP", goldA: 50, goldOnly: true },
];

const abilityLabel = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };

const bgEntries = backgrounds.map((b) => {
  const row = {
    id: b.id,
    name: b.name,
    skills: b.skills,
    abilityOptions: b.abilityOptions,
  };
  if (b.tools) row.tools = b.tools;
  if (b.feat) row.feat = b.feat;
  if (b.featChoice) row.featChoice = b.featChoice;
  if (b.custom) row.custom = true;
  return row;
});

writeJson(path.join(root, "backgrounds.json"), { entries: bgEntries });

for (const b of backgrounds) {
  const scores = b.abilityOptions.map((a) => abilityLabel[a]).join(", ");
  const equip =
    b.goldOnly || b.id === "custom"
      ? "**Equipment:** _Choose A or B:_ (A) 50 GP; or (B) 50 GP"
      : `**Equipment:** _Choose A or B:_ (A) ${b.equipA}; or (B) 50 GP`;
  const text = [
    `**Ability Scores:** ${scores}`,
    b.feat ? `**Feat:** ${b.feat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}${b.featChoice ? ` (${b.featChoice})` : ""}` : "**Feat:** Choose any Origin feat",
    b.skills.length ? `**Skill Proficiencies:** ${b.skills.map((s) => s.replace(/_/g, " ")).join(" and ")}` : "**Skill Proficiencies:** Choose any two skills",
    b.tools ? `**Tool Proficiency:** ${b.tools[0].replace(/_/g, " ")}` : "**Tool Proficiency:** Choose one tool",
    equip,
  ].join("\n");
  writeJson(path.join(root, "review/background", `${b.id}.json`), {
    ambiguities: [],
    unparsedFields: [],
    kind: "background",
    id: b.id,
    status: "auto_ok",
    confidence: "high",
    usage: "Chargen background. Grants the listed skills.",
    srd: { text },
  });
}

const existingFeats = JSON.parse(fs.readFileSync(path.join(root, "feats.json"), "utf8")).entries;
const byId = new Map(existingFeats.map((f) => [f.id, f]));

function upsert(feat) {
  byId.set(feat.id, feat);
}

// Origin
upsert({
  id: "crafter",
  name: "Crafter",
  repeatable: false,
  description:
    "_Origin Feat_ You gain proficiency with three artisan tools of your choice. You buy nonmagical items at 80% price. During a Long Rest you can craft one nonmagical item or consumable at half the usual gold cost.",
});
upsert({
  id: "healer",
  name: "Healer",
  repeatable: false,
  description:
    "_Origin Feat_ As an Action, expend one use of a Healer's Kit to restore 1d4 + 1 + your Proficiency Bonus hit points to a creature. When you heal with a spell or this feat, reroll any heal die that shows a 1.",
});
upsert({
  id: "lucky",
  name: "Lucky",
  repeatable: false,
  description:
    "_Origin Feat_ You have Luck Points equal to your Proficiency Bonus (regain on a Long Rest). Spend 1 point to gain Advantage on an attack, ability check, or saving throw, or to impose Disadvantage on an attack against you.",
});
upsert({
  id: "musician",
  name: "Musician",
  repeatable: false,
  description:
    "_Origin Feat_ You gain proficiency with three musical instruments. After a Short or Long Rest, you may grant Heroic Inspiration to a number of allies up to your Proficiency Bonus.",
});
upsert({
  id: "tavern_brawler",
  name: "Tavern Brawler",
  repeatable: false,
  description:
    "_Origin Feat_ Your Unarmed Strikes deal 1d4 + Strength bludgeoning. Once per turn when you hit with an Unarmed Strike, you may also push the target 5 feet. Reroll any 1 on Unarmed or improvised weapon damage dice.",
});
upsert({
  id: "tough",
  name: "Tough",
  repeatable: false,
  description:
    "_Origin Feat_ Your hit point maximum increases by twice your level. When you gain a level, you gain 2 additional hit points.",
});

// Fighting styles missing
upsert({
  id: "dueling",
  name: "Dueling",
  repeatable: false,
  description:
    "_Fighting Style Feat (Prerequisite: Fighting Style Feature)_ When you are wielding a Melee weapon in one hand and no other weapons, you gain a +2 bonus to damage rolls with that weapon.",
});
upsert({
  id: "protection",
  name: "Protection",
  repeatable: false,
  description:
    "_Fighting Style Feat (Prerequisite: Fighting Style Feature)_ When a creature you can see attacks a target other than you that is within 5 feet of you, you can take a Reaction to impose Disadvantage on the attack roll. You must be wielding a Shield.",
});

const general = [
  ["actor", "Actor", ["cha"], "_General Feat (Prerequisite: Level 4+)_ Increase your Charisma by 1. You have Advantage on Deception and Performance checks to pass yourself off as someone else, and you can mimic speech."],
  ["athlete", "Athlete", ["str", "dex"], "_General Feat (Prerequisite: Level 4+)_ Increase Strength or Dexterity by 1. Climbing speed equals your Speed. Standing from Prone costs only 5 feet. You need only 5 feet of run-up to jump."],
  ["charger", "Charger", ["str", "dex"], "_General Feat (Prerequisite: Level 4+)_ Increase Strength or Dexterity by 1. When you Dash, your Speed increases by 10 feet for that move. If you move at least 10 feet straight toward a target and hit it with a melee attack, add 1d8 damage or push it 10 feet."],
  ["crossbow_expert", "Crossbow Expert", ["dex"], "_General Feat (Prerequisite: Level 4+)_ Increase Dexterity by 1. You ignore the Loading property of crossbows. Being within 5 feet of an enemy does not impose Disadvantage on your ranged attacks. When you attack with a one-handed crossbow, you can make one extra crossbow attack as a Bonus Action."],
  ["dual_wielder", "Dual Wielder", ["str", "dex"], "_General Feat (Prerequisite: Level 4+)_ Increase Strength or Dexterity by 1. You can Two-Weapon Fight with weapons that lack the Light property (but not Two-Handed). After the Attack action with a Light weapon, you can make one Bonus Action attack with another weapon."],
  ["great_weapon_master", "Great Weapon Master", ["str"], "_General Feat (Prerequisite: Level 4+)_ Increase Strength by 1. When you hit with a Heavy weapon, add your Proficiency Bonus to the damage. When you score a Critical Hit or reduce a creature to 0 HP with a melee weapon, you can make one melee attack as a Bonus Action."],
  ["heavily_armored", "Heavily Armored", ["str", "con"], "_General Feat (Prerequisite: Level 4+)_ Increase Strength or Constitution by 1. You gain proficiency with Heavy armor."],
  ["heavy_armor_master", "Heavy Armor Master", ["str", "con"], "_General Feat (Prerequisite: Level 4+)_ Increase Strength or Constitution by 1. While wearing Heavy armor, Bludgeoning, Piercing, and Slashing damage you take is reduced by your Proficiency Bonus."],
  ["mounted_combatant", "Mounted Combatant", ["str", "dex", "wis"], "_General Feat (Prerequisite: Level 4+)_ Increase Strength, Dexterity, or Wisdom by 1. While mounted, you have Advantage on melee attacks against unmounted creatures smaller than your mount, can redirect attacks targeting the mount to yourself, and your mount has Evasion on Dexterity saves."],
  ["polearm_master", "Polearm Master", ["str", "dex"], "_General Feat (Prerequisite: Level 4+)_ Increase Strength or Dexterity by 1. When you take the Attack action with a Quarterstaff, Spear, Glaive, or Halberd, you can make a Bonus Action butt attack (1d4 bludgeoning). Creatures provoke Opportunity Attacks when they enter your reach with those weapons."],
  ["resilient", "Resilient", ["str", "dex", "con", "int", "wis", "cha"], "_General Feat (Prerequisite: Level 4+)_ Increase one ability score by 1 and gain proficiency in saving throws using that ability."],
  ["sentinel", "Sentinel", ["str", "dex"], "_General Feat (Prerequisite: Level 4+)_ Increase Strength or Dexterity by 1. When you hit with an Opportunity Attack, the target's Speed becomes 0. Creatures provoke Opportunity Attacks even if they Disengage. If an enemy within 5 feet attacks an ally, you can make a melee attack against that enemy as a Reaction."],
  ["sharpshooter", "Sharpshooter", ["dex"], "_General Feat (Prerequisite: Level 4+)_ Increase Dexterity by 1. Attacking at long range does not impose Disadvantage. Your ranged weapon attacks ignore Half and Three-Quarters cover. Being within 5 feet of an enemy does not impose Disadvantage on your ranged attacks."],
  ["shield_master", "Shield Master", ["str"], "_General Feat (Prerequisite: Level 4+)_ Increase Strength by 1. If you hit with a melee attack while wielding a Shield, you can Bonus Action shove (push or prone; target Strength save). If you succeed on a Dexterity save that would halve damage, you can take a Reaction to take no damage instead."],
  ["speedy", "Speedy", ["dex", "con"], "_General Feat (Prerequisite: Level 4+)_ Increase Dexterity or Constitution by 1. Your Speed increases by 10 feet. Difficult terrain does not slow you when you Dash. Opportunity Attacks against you have Disadvantage."],
  ["war_caster", "War Caster", ["int", "wis", "cha"], "_General Feat (Prerequisite: Level 4+)_ Increase Intelligence, Wisdom, or Charisma by 1. You have Advantage on Constitution saves to maintain Concentration. You can perform somatic components with weapons or a shield in hand. When a creature provokes an Opportunity Attack from you, you can cast a single-target spell as the Reaction instead."],
  ["spell_sniper", "Spell Sniper", ["int", "wis", "cha"], "_General Feat (Prerequisite: Level 4+)_ Increase Intelligence, Wisdom, or Charisma by 1. Double the range of spells that require an attack roll. Your ranged spell attacks ignore Half and Three-Quarters cover. You learn one cantrip that requires an attack roll."],
  ["fey_touched", "Fey Touched", ["int", "wis", "cha"], "_General Feat (Prerequisite: Level 4+)_ Increase Intelligence, Wisdom, or Charisma by 1. You learn Misty Step and one 1st-level Enchantment or Illusion spell. You can cast each once without a slot per Long Rest."],
  ["shadow_touched", "Shadow Touched", ["int", "wis", "cha"], "_General Feat (Prerequisite: Level 4+)_ Increase Intelligence, Wisdom, or Charisma by 1. You learn Invisibility and one 1st-level Illusion or Necromancy spell. You can cast each once without a slot per Long Rest."],
  ["telekinetic", "Telekinetic", ["int", "wis", "cha"], "_General Feat (Prerequisite: Level 4+)_ Increase Intelligence, Wisdom, or Charisma by 1. You learn Mage Hand (invisible, +30 feet range). As a Bonus Action, you can shove or pull a creature within 30 feet 5 feet (Strength save)."],
  ["telepathic", "Telepathic", ["int", "wis", "cha"], "_General Feat (Prerequisite: Level 4+)_ Increase Intelligence, Wisdom, or Charisma by 1. You can communicate telepathically within 60 feet. You can cast Detect Thoughts once without a slot per Long Rest."],
];

for (const [id, name, asi, description] of general) {
  upsert({ id, name, repeatable: false, description, asiChoices: asi, prerequisites: ["Level 4+"] });
}

upsert({
  id: "boon_of_fortitude",
  name: "Boon of Fortitude",
  repeatable: false,
  description:
    "_Epic Boon Feat (Prerequisite: Level 19+)_ Increase one ability score by 1, to a maximum of 30. Your hit point maximum increases by 40. When you regain hit points, you regain additional hit points equal to your Constitution modifier (minimum 1).",
  asiChoices: ["str", "dex", "con", "int", "wis", "cha"],
  prerequisites: ["Level 19+"],
});
upsert({
  id: "boon_of_recovery",
  name: "Boon of Recovery",
  repeatable: false,
  description:
    "_Epic Boon Feat (Prerequisite: Level 19+)_ Increase one ability score by 1, to a maximum of 30. When you are reduced to 0 hit points, you can take a Reaction to regain hit points equal to half your hit point maximum (once per Long Rest).",
  asiChoices: ["str", "dex", "con", "int", "wis", "cha"],
  prerequisites: ["Level 19+"],
});
upsert({
  id: "boon_of_skill_mastery",
  name: "Boon of Skill Mastery",
  repeatable: false,
  description:
    "_Epic Boon Feat (Prerequisite: Level 19+)_ Increase one ability score by 1, to a maximum of 30. You gain proficiency in all skills.",
  asiChoices: ["str", "dex", "con", "int", "wis", "cha"],
  prerequisites: ["Level 19+"],
});

// Ensure SRD origin/style descriptions stay; patch luckier alert text already ok
writeJson(path.join(root, "feats.json"), { entries: [...byId.values()] });

for (const feat of byId.values()) {
  const reviewPath = path.join(root, "review/feat", `${feat.id}.json`);
  if (fs.existsSync(reviewPath)) continue;
  writeJson(reviewPath, {
    ambiguities: [],
    unparsedFields: [],
    kind: "feat",
    id: feat.id,
    status: "auto_ok",
    confidence: "high",
    usage: "Feat choice for chargen or level-up.",
    srd: { text: feat.description },
  });
}

console.log("backgrounds", bgEntries.length, "feats", byId.size);
