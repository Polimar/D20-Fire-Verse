/**
 * A V2 account hero as a combat seat: class, level, abilities, and the loadout it has equipped right now.
 * Armor sets the base AC, the equipped weapon is the attack, and typed item effects become token bonuses.
 */

import type { ClassDef, EffectDef, ItemDef, SpeciesDef, SpellDef } from "@d20-fireverse/content-schema";
import { abilityMod, averageHitDie } from "@d20-fireverse/rules";
import type { AbilityDef, Pregen } from "./campaign.js";
import { buildKit, hasFlag } from "./class-kit.js";
import { catalogEntry } from "./content-catalog.js";
import { gearAttackId } from "./gear-abilities.js";
import { giantStrengthPotionByItemId } from "./giant-strength-potions.js";
import { healingPotionByItemId } from "./healing-potions.js";
import { invisibilityPotionByItemId } from "./invisibility-potion.js";
import { classPackWeapon, equippedGear, getHero, listHeroes, type EquippedItem, type HeroRow } from "./hero.js";

type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";
type Rider = { damage: string; damageType?: string };

export type WeaponGear = { attack: number; damage: number; onHit: Rider[]; mastery?: string };

export type GearSheet = {
  attack: number;
  damage: number;
  saveBonus: number;
  resistances: string[];
  immunities: string[];
  /** Per weapon attack id: bonuses that only apply when swinging that weapon. */
  weapons: Record<string, WeaponGear>;
  /** Spell id → the item whose charges pay for it. */
  granted: Record<string, string>;
  /** Item instance → charges it has for one fight. */
  charges: Record<string, number>;
  masteries: string[];
  notes: string[];
  followAuras: import("./combat-aura.js").AuraMods[];
  plantAuras: import("./combat-aura.js").AuraMods[];
  /** Bonus/action menu ability ids from equipped item effects (animated shield, cloak, …). */
  combatAbilities: string[];
  /** Item instance id paying for cloak invisibility charges. */
  cloakChargePool?: string;
};

export type HeroPregen = Pregen & {
  spellSlots?: Record<string, number>;
  spellAbility?: string;
  cantrips: string[];
  spellsKnown: string[];
  features: string[];
  weapons: string[];
  gear: GearSheet;
  classes: Array<{ id: string; level: number; subclass?: string }>;
  savingThrows: string[];
  skills: string[];
  background: string;
  heavyArmor: boolean;
};

type Lookup = (id: string) => AbilityDef | undefined;

const FEET_PER_CELL = 5;
function gearItem(id: string): ItemDef | undefined {
  return catalogEntry<ItemDef>("item", id);
}

/** Magic weapons and armor name their allowed bases; pick the one this hero would carry. */
function baseOf(entry: ItemDef, prefer: (candidates: ItemDef[]) => ItemDef | undefined): ItemDef | undefined {
  if (entry.weapon || entry.armor) return entry;
  const candidates = (entry.baseItems ?? []).map(gearItem).filter((g): g is ItemDef => Boolean(g));
  return prefer(candidates);
}

function bestArmor(str: number): (candidates: ItemDef[]) => ItemDef | undefined {
  return (candidates) =>
    [...candidates]
      .filter((g) => g.armor)
      .sort(
        (a, b) =>
          Number((b.armor!.strength ?? 0) <= str) - Number((a.armor!.strength ?? 0) <= str) ||
          b.armor!.baseAc - a.armor!.baseAc ||
          Number(a.armor!.stealthDisadvantage) - Number(b.armor!.stealthDisadvantage),
      )[0];
}

function classWeapon(classId: string): (candidates: ItemDef[]) => ItemDef | undefined {
  return (candidates) => {
    const weapons = candidates.filter((g) => g.weapon);
    const pack = classPackWeapon(classId);
    return weapons.find((g) => g.id === pack) ?? weapons[0];
  };
}

function maxHp(hero: HeroRow, conMod: number, species: SpeciesDef | undefined): number {
  let hp = 0;
  hero.classes.forEach((entry, index) => {
    const die = catalogEntry<ClassDef>("class", entry.id)?.hitDie ?? 8;
    const levels = Math.max(1, entry.level);
    hp += index === 0 ? die + conMod + (levels - 1) * (averageHitDie(die) + conMod) : levels * (averageHitDie(die) + conMod);
  });
  hp += (species?.hpPerLevel ?? 0) * hero.level;
  if (hero.features.includes("tough")) hp += 2 * hero.level;
  if (hero.features.includes("boon_of_fortitude")) hp += 40;
  return Math.max(1, hp);
}

function engineSpell(id: string, lookup: Lookup): { id: string; cantrip: boolean } | undefined {
  const level = catalogEntry<SpellDef>("spell", id)?.level;
  if (level === 0 && lookup(id)) return { id, cantrip: true };
  if (lookup(`spell_${id}`)) return { id: `spell_${id}`, cantrip: level === 0 };
  if (lookup(id)) return { id, cantrip: level === 0 };
  return undefined;
}

function active(entry: EquippedItem): boolean {
  return !entry.item.requires?.attunement || entry.attuned;
}

export function heroPregen(heroId: string, lookup: Lookup): HeroPregen | undefined {
  const hero = getHero(heroId);
  if (!hero) return undefined;
  const gear = equippedGear(hero);
  const notes: string[] = [];
  const live = gear.filter((entry) => {
    if (active(entry)) return true;
    notes.push(`${entry.item.name} needs attunement before it does anything.`);
    return false;
  });
  const effects = (entry: EquippedItem): EffectDef[] => entry.item.effects;

  const abilities = { ...hero.abilities } as Record<Ability, number>;
  for (const entry of live) {
    if (entry.slot === "consumables") continue;
    for (const effect of effects(entry)) {
      if (effect.kind === "stat_set") abilities[effect.ability] = Math.max(abilities[effect.ability], effect.score);
    }
  }
  const mod = (a: Ability) => abilityMod(abilities[a]);

  const primary = [...hero.classes].sort((a, b) => b.level - a.level)[0] ?? { id: "fighter", level: hero.level };
  const cls = catalogEntry<ClassDef>("class", primary.id);
  const species = catalogEntry<SpeciesDef>("species", hero.species);
  const row = cls?.levels[Math.min(20, Math.max(1, primary.level)) - 1];
  const classIds = new Set(hero.classes.map((c) => c.id));

  const armorEntry = live.find((e) => e.slot === "armor");
  const shieldEntry = live.find((e) => e.slot === "shield");
  const armor = armorEntry ? baseOf(armorEntry.item, bestArmor(abilities.str))?.armor : undefined;
  let ac: number;
  if (armor) {
    const dex = armor.dexCap === null ? mod("dex") : Math.min(mod("dex"), armor.dexCap);
    ac = armor.baseAc + dex;
  } else if (classIds.has("monk") && !shieldEntry) {
    ac = 10 + mod("dex") + mod("wis");
  } else if (classIds.has("barbarian")) {
    ac = 10 + mod("dex") + mod("con");
  } else {
    ac = 10 + mod("dex");
  }
  if (shieldEntry && !shieldEntry.item.armor) ac += 2;
  if (armorEntry && !armor) notes.push(`${armorEntry.item.name} names no base armor the game knows, so it adds only its bonus.`);
  const kit = buildKit(hero.classes, hero.features);
  const heavyArmor = armor?.category === "heavy";
  if (armor && hasFlag(kit, "defense")) ac += 1;

  let speedFt = species?.speedFt ?? 30;
  if (!heavyArmor) speedFt += kit.fastMovementFt;
  if (!armor && !shieldEntry) speedFt += kit.unarmoredMovementFt;
  if (hasFlag(kit, "roving")) speedFt += 10;
  if (hasFlag(kit, "second_story_work")) speedFt += 5;
  if (hasFlag(kit, "dragon_wings")) speedFt += 10;
  if (!armor && hasFlag(kit, "draconic_resilience")) ac = Math.max(ac, 13 + mod("dex"));
  if (hasFlag(kit, "body_and_mind") && !armor && classIds.has("monk")) ac += 4;
  let speedCells = Math.floor(speedFt / FEET_PER_CELL);
  if (armor?.strength && abilities.str < armor.strength) {
    speedCells = Math.max(1, speedCells - 2);
    notes.push(`Strength ${abilities.str} is under the armor's ${armor.strength}: Speed drops by 10 feet.`);
  }

  const sheet: GearSheet = {
    attack: 0,
    damage: 0,
    saveBonus: 0,
    resistances: [],
    immunities: [],
    weapons: {},
    granted: {},
    charges: {},
    masteries: [],
    notes,
    followAuras: [],
    plantAuras: [],
    combatAbilities: [],
  };
  const weapons: string[] = [];
  const masteryKnown = hasFlag(kit, "weapon_mastery");
  for (const entry of live) {
    const isWeaponSlot = entry.slot === "mainhand" || entry.slot === "offhand";
    const base = isWeaponSlot ? baseOf(entry.item, classWeapon(primary.id)) : undefined;
    const attackId = base?.weapon ? gearAttackId(base.id) : undefined;
    if (attackId && !weapons.includes(attackId)) weapons.push(attackId);
    if (isWeaponSlot && !attackId) notes.push(`${entry.item.name} names no base weapon the game knows, so it cannot attack.`);
    const bucket: WeaponGear | undefined = attackId ? (sheet.weapons[attackId] ??= { attack: 0, damage: 0, onHit: [] }) : undefined;
    const mastery = base?.weaponMastery ?? entry.item.weaponMastery;
    if (masteryKnown && mastery) {
      sheet.masteries.push(mastery);
      if (bucket) bucket.mastery = mastery;
    }
    for (const effect of effects(entry)) {
      switch (effect.kind) {
        case "ac_bonus":
          ac += effect.amount;
          break;
        case "save_bonus":
          sheet.saveBonus += effect.amount;
          break;
        case "grant_aura":
          sheet.followAuras.push({
            radiusCells: effect.radiusCells,
            filter: effect.filter,
            excludeSource: effect.excludeSource,
            creatureTypes: effect.creatureTypes,
            ac: effect.ac,
            saves: effect.saves,
            stealth: effect.stealth,
            saveAdv: effect.saveAdv,
            attackDisadvAgainst: effect.attackDisadvAgainst,
            resistances: effect.resistances,
            speedMult: effect.speedMult,
            strip: effect.strip,
            heavilyObscured: effect.heavilyObscured,
            difficultTerrainFor: effect.difficultTerrainFor,
            onStartTurn: effect.onStartTurn,
            onEnterOrEndTurn: effect.onEnterOrEndTurn,
            blocksMovement: effect.blocksMovement,
            blocksSpellsFromOutside: effect.blocksSpellsFromOutside,
          });
          break;
        case "plant_aura":
          sheet.plantAuras.push({
            radiusCells: effect.radiusCells,
            filter: effect.filter,
            ac: effect.ac,
            saves: effect.saves,
            excludeSource: effect.excludeSource,
            creatureTypes: effect.creatureTypes,
            stealth: effect.stealth,
            saveAdv: effect.saveAdv,
            attackDisadvAgainst: effect.attackDisadvAgainst,
            resistances: effect.resistances,
            speedMult: effect.speedMult,
            strip: effect.strip,
            heavilyObscured: effect.heavilyObscured,
            difficultTerrainFor: effect.difficultTerrainFor,
            onStartTurn: effect.onStartTurn,
            onEnterOrEndTurn: effect.onEnterOrEndTurn,
            blocksMovement: effect.blocksMovement,
            blocksSpellsFromOutside: effect.blocksSpellsFromOutside,
          });
          break;
        case "attack_bonus":
          if (bucket) bucket.attack += effect.amount;
          else sheet.attack += effect.amount;
          break;
        case "damage_bonus":
          if (bucket) bucket.damage += effect.amount;
          else sheet.damage += effect.amount;
          break;
        case "on_hit_rider": {
          const rider =
            effect.saveAbility && effect.saveDc
              ? {
                  damage: effect.damage,
                  damageType: effect.damageType,
                  saveAbility: effect.saveAbility,
                  saveDc: effect.saveDc,
                  halfDamage: effect.halfDamage,
                }
              : effect.damageType !== undefined
                ? { damage: effect.damage, damageType: effect.damageType }
                : { damage: effect.damage };
          if (bucket) bucket.onHit.push(rider);
          else {
            const typeNote = effect.damageType ?? "weapon damage type";
            notes.push(`${entry.item.name}: extra ${effect.damage} ${typeNote} needs a weapon to ride on.`);
          }
          break;
        }
        case "heal_drink":
        case "stat_drink":
        case "invisibility_drink":
        case "haste_drink":
        case "resistance_drink":
        case "scroll_cast":
          break;
        case "animated_shield":
          if (!sheet.combatAbilities.includes("animate_animated_shield")) {
            sheet.combatAbilities.push("animate_animated_shield");
          }
          break;
        case "cloak_invisibility":
          if (!sheet.combatAbilities.includes("use_cloak_invisibility")) {
            sheet.combatAbilities.push("use_cloak_invisibility");
          }
          sheet.cloakChargePool = entry.instanceId;
          sheet.charges[entry.instanceId] = entry.item.charges ?? sheet.charges[entry.instanceId] ?? 3;
          break;
        case "resistance":
          sheet.resistances.push(effect.damageType);
          break;
        case "immunity":
          sheet.immunities.push(effect.damageType);
          break;
        case "grant_spell": {
          const spell = engineSpell(effect.spellId, lookup);
          if (spell && !sheet.granted[spell.id]) {
            sheet.granted[spell.id] = entry.instanceId;
            sheet.charges[entry.instanceId] = entry.item.charges ?? 1;
          } else if (!spell) notes.push(`${entry.item.name}: the combat engine has no ${effect.spellId.replace(/_/g, " ")}.`);
          break;
        }
        case "grant_feature":
        case "stat_set":
        case "stat_increase_cap":
          break;
        default: {
          const unknown: never = effect;
          return unknown;
        }
      }
    }
  }
  if (!weapons.length) weapons.push("unarmed");
  sheet.resistances = [...new Set(sheet.resistances)];
  sheet.immunities = [...new Set(sheet.immunities)];
  sheet.masteries = [...new Set(sheet.masteries)];

  const cantrips: string[] = [];
  const spellsKnown: string[] = [];
  const rawCantrips = hero.cantrips.length ? hero.cantrips : hero.spells;
  const rawPrepared = hero.spellsPrepared.length ? hero.spellsPrepared : hero.spells;
  for (const id of rawCantrips) {
    const spell = engineSpell(id, lookup);
    if (spell?.cantrip) cantrips.push(spell.id);
  }
  for (const id of rawPrepared) {
    const spell = engineSpell(id, lookup);
    if (spell && !spell.cantrip) spellsKnown.push(spell.id);
  }
  const slots = row?.spellSlots ? { ...row.spellSlots } : row?.pactSlots ? { [String(row.pactSlots.slotLevel)]: row.pactSlots.count } : undefined;
  const inventory = live
    .filter((e) => e.slot === "consumables")
    .map(
      (e) =>
        healingPotionByItemId(e.item.id)?.inventoryToken ??
        giantStrengthPotionByItemId(e.item.id)?.inventoryToken ??
        invisibilityPotionByItemId(e.item.id)?.inventoryToken,
    )
    .filter((id): id is string => Boolean(id));

  const className = cls?.name ?? primary.id;
  return {
    id: hero.id,
    name: hero.name,
    summary: `Level ${hero.level} ${species?.name ?? hero.species} ${className}`,
    level: hero.level,
    class: primary.id,
    race: hero.species,
    hp: maxHp(hero, mod("con"), species) + (hasFlag(kit, "draconic_resilience") ? primary.level : 0),
    ac,
    abilities,
    speedCells,
    proficiencyBonus: row?.proficiencyBonus ?? 2 + Math.floor((hero.level - 1) / 4),
    inventory,
    portrait: hero.portrait ?? undefined,
    ownerUserId: hero.userId,
    spellSlots: slots,
    spellAbility: cls?.spellAbility,
    cantrips,
    spellsKnown,
    features: [...kit.flags, ...hero.features.filter((f) => f.startsWith("expertise:"))],
    weapons,
    gear: sheet,
    classes: hero.classes.map((entry) => ({ ...entry })),
    savingThrows: kit.saves,
    skills: [...hero.skills],
    background: hero.background,
    heavyArmor,
  };
}

export function listHeroPregens(userId: string | null | undefined, lookup: Lookup): HeroPregen[] {
  if (!userId) return [];
  return listHeroes(userId)
    .map((hero) => heroPregen(hero.id, lookup))
    .filter((p): p is HeroPregen => Boolean(p));
}
