import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clampExhaustion, effectiveMaxHp, longRestExhaustionDelta, setExhaustion } from "@d20-fireverse/rules";
import type { Pregen } from "./campaign.js";
import type { CombatToken } from "./combat.js";
import { buildKit, type ClassKit, type KitClass } from "./class-kit.js";
import { classMenus, onClassLongRest, onClassShortRest, seedClassResources } from "./class-runtime.js";
import type { GearSheet } from "./hero-pregen.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  fs.readFileSync(path.resolve(here, "../../../content/rules/srd51_combat.json"), "utf8"),
) as Record<string, SrdAbility>;

export type SrdAbility = {
  id: string;
  name: string;
  actionType: string;
  level?: number;
  aim?: string;
  combat?: boolean;
  effects: Array<Record<string, unknown>>;
};

export type Vitals = {
  slots?: Record<string, number>;
  ragesLeft?: number;
  secondWindLeft?: number;
  indomitableLeft?: number;
  actionSurge?: boolean;
  ki?: number;
  layOnHands?: number;
  channelDivinity?: number;
  bardicLeft?: number;
  sorceryPoints?: number;
  hitDice?: number;
  deathSuccesses?: number;
  deathFailures?: number;
  dying?: boolean;
  stable?: boolean;
  secondWindUsed?: boolean;
  exhaustionLevel?: number;
};

const STANDARD = [
  "std_attack",
  "std_dash",
  "std_disengage",
  "std_dodge",
  "std_help",
  "std_hide",
  "std_influence",
  "std_magic",
  "std_ready",
  "std_search",
  "std_study",
  "std_utilize",
] as const;

const HIT_DICE: Record<string, number> = {
  barbarian: 12,
  fighter: 10,
  paladin: 10,
  ranger: 10,
  bard: 8,
  cleric: 8,
  druid: 8,
  monk: 8,
  rogue: 8,
  warlock: 8,
  sorcerer: 6,
  wizard: 6,
};

export function srdAbility(id: string): SrdAbility | undefined {
  return catalog[id];
}

export function isCombatSpell(id: string, lookup: (id: string) => { effects?: unknown[] } | undefined): boolean {
  const srd = catalog[id];
  if (srd?.combat) return true;
  const known = lookup(id);
  return Boolean(known?.effects?.length) && id.startsWith("spell_");
}

function weaponId(name: string): string {
  if (name === "unarmed") return "unarmed_strike";
  return name.endsWith("_attack") || name.endsWith("_strike") ? name : `${name}_attack`;
}

type Lookup = (id: string) => SrdAbility | undefined;

function spellLevel(ability: SrdAbility): number {
  return Number(ability.level ?? ability.effects[0]?.slot ?? 0);
}

export function slotReady(token: CombatToken, level: number): boolean {
  if (level <= 0) return true;
  const slots = token.slots;
  if (!slots) return true;
  for (let step = level; step <= 9; step += 1) {
    if ((slots[String(step)] ?? 0) > 0) return true;
  }
  return false;
}

export function spendSlot(token: CombatToken, level: number): number {
  if (level <= 0) return 0;
  if (!token.slots) return level;
  for (let step = level; step <= 9; step += 1) {
    const key = String(step);
    if ((token.slots[key] ?? 0) > 0) {
      token.slots[key] -= 1;
      return step;
    }
  }
  throw new Error("NO_SLOT");
}

type SheetPregen = Pregen & {
  spellSlots?: Record<string, number>;
  cantrips?: string[];
  spellsKnown?: string[];
  spellAbility?: string;
  reactions?: string[];
  features?: string[];
  fightingStyle?: string;
  weapons?: string[];
  gear?: GearSheet;
  classes?: KitClass[];
  savingThrows?: string[];
  heavyArmor?: boolean;
};

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;
export const FIGHTING_STYLES = ["archery", "defense", "great_weapon_fighting", "dueling", "two_weapon_fighting"] as const;

/** The class kit for any seat: account heroes carry their classes, campaign pregens name one class and level. */
export function kitForPregen(pregen: Pregen, level = pregen.level ?? 1): ClassKit {
  const extra = pregen as SheetPregen;
  const classes = extra.classes?.length ? extra.classes : [{ id: pregen.class, level }];
  const kit = buildKit(classes, extra.features ?? []);
  if (extra.savingThrows?.length) kit.saves = [...extra.savingThrows];
  return kit;
}

export function saveBonuses(pregen: Pregen, kit: ClassKit): Record<string, number> {
  const prof = pregen.proficiencyBonus ?? 2;
  const out: Record<string, number> = {};
  for (const key of ABILITY_KEYS) {
    const score = pregen.abilities[key] ?? 10;
    out[key] = Math.floor((score - 10) / 2) + (kit.saves.includes(key) ? prof : 0);
  }
  return out;
}

export function initSheet(token: CombatToken, pregen: Pregen, saved?: Vitals): void {
  const extra = pregen as SheetPregen;
  const level = pregen.level ?? 1;
  const kit = kitForPregen(pregen, level);
  token.kit = kit;
  token.sheetDriven = true;
  token.slots = { ...(saved?.slots ?? extra.spellSlots ?? {}) };
  token.cantrips = [...(extra.cantrips ?? [])];
  token.spells = [...(extra.spellsKnown ?? [])];
  token.spellAbility = extra.spellAbility;
  token.reactionIds = [...(extra.reactions ?? [])];
  token.reactionReady = saved ? !saved.dying : true;
  token.features = [...new Set([...(extra.features ?? []), ...kit.flags])];
  token.fightingStyles = FIGHTING_STYLES.filter((style) => token.features?.includes(style) || extra.fightingStyle === style);
  token.fightingStyle = extra.fightingStyle ?? token.fightingStyles[0];
  token.saves = saveBonuses(pregen, kit);
  token.heavyArmor = Boolean(extra.heavyArmor);
  token.conditions = [];
  token.exhaustionLevel = saved?.exhaustionLevel ?? 0;
  token.deathSuccesses = saved?.deathSuccesses ?? 0;
  token.deathFailures = saved?.deathFailures ?? 0;
  token.stable = Boolean(saved?.stable);
  token.dying = Boolean(saved?.dying) || (token.hp <= 0 && !token.stable);
  const secondWindMax = kit.secondWind || (token.features.includes("second_wind") ? 1 : 0);
  token.secondWindLeft = saved?.secondWindLeft ?? (saved?.secondWindUsed ? Math.max(0, secondWindMax - 1) : secondWindMax);
  token.secondWindUsed = token.secondWindLeft <= 0;
  token.indomitableLeft = saved?.indomitableLeft ?? kit.indomitable;
  token.ragesLeft = saved?.ragesLeft ?? kit.rages;
  token.actionSurge = saved?.actionSurge ?? kit.actionSurge > 0;
  token.kiMax = kit.focus;
  token.ki = saved?.ki ?? token.kiMax;
  token.layOnHandsMax = pregen.class === "paladin" ? 5 * level : 0;
  token.layOnHands = saved?.layOnHands ?? token.layOnHandsMax;
  token.channelDivinity = saved?.channelDivinity ?? kit.channelDivinity;
  const cha = Math.max(1, Math.floor(((pregen.abilities.cha ?? 10) - 10) / 2));
  token.bardicLeft = saved?.bardicLeft ?? (pregen.class === "bard" ? cha : 0);
  token.sorceryPoints = saved?.sorceryPoints ?? kit.sorceryPoints;
  token.hitDie = HIT_DICE[pregen.class] ?? 8;
  token.hitDice = saved?.hitDice ?? level;
  if (token.hp <= 0) {
    token.hp = 0;
    if (token.stable) token.dying = false;
    else token.dying = true;
  }
  if (pregen.class === "wizard" && !token.reactionIds.includes("spell_shield") && token.spells.includes("spell_shield")) {
    token.reactionIds.push("spell_shield");
  }
  if (pregen.class === "paladin" && level >= 2 && !token.features.includes("divine_smite")) {
    token.features.push("divine_smite");
  }
  if (pregen.class === "paladin" && level >= 2 && !token.features.includes("paladins_smite")) {
    token.features.push("paladins_smite");
  }
  seedClassResources(token, level, pregen.abilities, true);
  const gear = extra.gear;
  if (gear) {
    token.gearAttackBonus = gear.attack;
    token.gearDamageBonus = gear.damage;
    token.weaponGear = structuredClone(gear.weapons);
    token.damageResistances = [...gear.resistances];
    token.damageImmunities = [...gear.immunities];
    token.masteries = [...gear.masteries];
    token.gearSpells = { ...gear.granted };
    token.gearCharges = { ...gear.charges };
    token.grantedSpells = Object.keys(gear.granted);
  }
  if (token.baseMaxHp == null) token.baseMaxHp = token.maxHp;
  const exhaustTier = clampExhaustion(token.exhaustionLevel ?? 0);
  token.maxHp = effectiveMaxHp(token.baseMaxHp, exhaustTier);
  if (token.hp > token.maxHp) token.hp = token.maxHp;
  token.conditions =
    exhaustTier > 0 ? setExhaustion((token.conditions ?? []).filter((c) => c !== "exhaustion"), exhaustTier) : (token.conditions ?? []).filter((c) => c !== "exhaustion");
}

export function exportVitals(token: CombatToken): Vitals {
  return {
    slots: token.slots ? { ...token.slots } : undefined,
    ragesLeft: token.ragesLeft,
    secondWindLeft: token.secondWindLeft,
    indomitableLeft: token.indomitableLeft,
    actionSurge: token.actionSurge,
    ki: token.ki,
    layOnHands: token.layOnHands,
    channelDivinity: token.channelDivinity,
    bardicLeft: token.bardicLeft,
    sorceryPoints: token.sorceryPoints,
    hitDice: token.hitDice,
    deathSuccesses: token.deathSuccesses,
    deathFailures: token.deathFailures,
    dying: token.dying,
    stable: token.stable,
    secondWindUsed: token.secondWindUsed,
    exhaustionLevel: token.exhaustionLevel,
  };
}

function pushUnique(list: string[], id: string): void {
  if (!list.includes(id)) list.push(id);
}

/** Ways to swing the same weapon. The menu id is `<variant>:<attack id>`. */
export const ATTACK_VARIANTS = {
  reckless: "Reckless",
  brutal_force: "Brutal Strike: Forceful Blow",
  brutal_hamstring: "Brutal Strike: Hamstring Blow",
  tm_push: "Tactical Master: Push",
  tm_sap: "Tactical Master: Sap",
  tm_slow: "Tactical Master: Slow",
} as const;

export type AttackVariant = keyof typeof ATTACK_VARIANTS;

export function splitVariant(id: string): { variant?: AttackVariant; id: string } {
  const at = id.indexOf(":");
  if (at < 0) return { id };
  const head = id.slice(0, at);
  if (head in ATTACK_VARIANTS) return { variant: head as AttackVariant, id: id.slice(at + 1) };
  return { id };
}

/** Strength drives the swing: Strength weapons, and Finesse weapons when Strength is the higher score. */
export function strengthWeapon(effect: Record<string, unknown> | undefined, pregen: Pregen | undefined): boolean {
  if (!effect || effect.type !== "attack" || effect.spellAttack) return false;
  if (Number(effect.rangeCells ?? 1) > 1) return false;
  if (effect.ability === "str") return true;
  return effect.ability === "finesse" && (pregen?.abilities.str ?? 10) >= (pregen?.abilities.dex ?? 10);
}

function attackVariants(token: CombatToken, pregen: Pregen | undefined, id: string, lookup: Lookup): string[] {
  const effect = lookup(id)?.effects[0];
  if (!effect || effect.type !== "attack" || effect.spellAttack) return [];
  const has = (flag: string) => Boolean(token.features?.includes(flag));
  const strong = strengthWeapon(effect, pregen);
  const firstRoll = !token.rolledAttack;
  const out: string[] = [];
  if (has("reckless_attack") && strong && !token.reckless && firstRoll) out.push(`reckless:${id}`);
  if (has("brutal_strike") && has("reckless_attack") && strong && !token.brutalUsed && (token.reckless || firstRoll)) {
    out.push(`brutal_force:${id}`, `brutal_hamstring:${id}`);
  }
  const own = token.weaponGear?.[id]?.mastery;
  if (has("tactical_master") && has("weapon_mastery") && own) {
    for (const mastery of ["push", "sap", "slow"]) {
      if (mastery !== own) out.push(`tm_${mastery}:${id}`);
    }
  }
  return out;
}

export function refreshMenus(token: CombatToken, pregen: Pregen | undefined, lookup: Lookup): void {
  if (!token.sheetDriven || token.kind !== "pc") return;
  const actions: string[] = [];
  const bonus: string[] = [];
  const place = (id: string, charged = false) => {
    const ability = lookup(id);
    if (!ability || ability.actionType === "reaction") return;
    const level = spellLevel(ability);
    if (level > 0 && !charged && !slotReady(token, level)) return;
    if (token.raging && (id.startsWith("spell_") || token.cantrips?.includes(id) || token.spells?.includes(id))) return;
    if (token.castBonusSpell && level > 0) return;
    if (token.castLeveled && ability.actionType === "bonus_action" && level > 0) return;
    const bucket = ability.actionType === "bonus_action" ? bonus : actions;
    pushUnique(bucket, id);
  };

  const weapons = (pregen as { weapons?: string[] } | undefined)?.weapons ?? [];
  for (const name of weapons) place(weaponId(name));
  for (const name of weapons) {
    if (!actions.includes(weaponId(name))) continue;
    for (const variant of attackVariants(token, pregen, weaponId(name), lookup)) pushUnique(actions, variant);
  }
  for (const id of STANDARD) place(id);
  if (token.inventory.includes("potion_healing")) place("use_potion_healing");
  for (const id of token.cantrips ?? []) place(id);
  for (const id of token.spells ?? []) place(id);
  for (const id of token.grantedSpells ?? []) {
    const pool = token.gearSpells?.[id];
    if (pool && (token.gearCharges?.[pool] ?? 0) > 0) place(id, true);
  }

  const cls = pregen?.class;
  const level = pregen?.level ?? 1;
  const has = (flag: string) => Boolean(token.features?.includes(flag));
  if ((token.secondWindLeft ?? 0) > 0) pushUnique(bonus, "second_wind");
  if (token.actionSurge) pushUnique(actions, "action_surge");
  if (has("cunning_action") || pregen?.traits?.includes("cunning_action")) {
    pushUnique(bonus, "cunning_dash");
    pushUnique(bonus, "cunning_disengage");
    pushUnique(bonus, "cunning_hide");
  }
  if ((token.ragesLeft ?? 0) > 0 && !token.raging && has("rage") && !token.heavyArmor) pushUnique(bonus, "rage");
  if (token.raging && !token.rageKept) pushUnique(bonus, "rage_extend");
  if ((token.layOnHands ?? 0) > 0) pushUnique(actions, "lay_on_hands");
  if ((token.channelDivinity ?? 0) > 0 && token.features?.some((f) => f.includes("life") || f === "domain_life" || f === "disciple_of_life")) {
    pushUnique(actions, "channel_preserve_life");
  }
  if ((token.bardicLeft ?? 0) > 0 && cls === "bard") pushUnique(bonus, "bardic_inspiration");
  if (cls === "monk") {
    pushUnique(bonus, "martial_arts_bonus");
    if ((token.ki ?? 0) > 0 && level >= 2) {
      pushUnique(bonus, "ki_flurry");
      pushUnique(bonus, "ki_patient_defense");
      pushUnique(bonus, "ki_step_of_the_wind");
    }
  }
  if ((token.spiritualRounds ?? 0) > 0) pushUnique(bonus, "spell_spiritual_weapon_strike");
  const extra = classMenus(token);
  for (const id of extra.actions) pushUnique(actions, id);
  for (const id of extra.bonus) pushUnique(bonus, id);
  for (const id of extra.reactions) {
    token.reactionIds = token.reactionIds ?? [];
    pushUnique(token.reactionIds, id);
  }
  if ((token.sorceryPoints ?? 0) >= 2 && !token.castLeveled && !token.castBonusSpell) {
    for (const id of [...(token.cantrips ?? []), ...(token.spells ?? [])]) {
      const ability = lookup(id);
      if (!ability || ability.actionType === "bonus_action" || ability.actionType === "reaction") continue;
      if (spellLevel(ability) > 0 && !slotReady(token, spellLevel(ability))) continue;
      pushUnique(bonus, `quicken:${id}`);
    }
  }

  token.actionIds = actions;
  token.bonusActionIds = bonus;
}

export function scaledDice(effect: Record<string, unknown>, slot: number): string | undefined {
  const scaling = effect.scaling as Record<string, string> | undefined;
  return scaling?.[String(slot)];
}

export function shortRestResources(token: CombatToken, pregen: Pregen | undefined): string[] {
  const notes: string[] = [];
  if ((token.hitDice ?? 0) > 0 && token.hp < token.maxHp && token.hp > 0) {
    token.hitDice = (token.hitDice ?? 0) - 1;
    notes.push("hit die");
  }
  const kit = token.kit ?? (pregen ? kitForPregen(pregen) : undefined);
  const windMax = kit?.secondWind || (token.features?.includes("second_wind") ? 1 : 0);
  if ((token.secondWindLeft ?? 0) < windMax) {
    token.secondWindLeft = (token.secondWindLeft ?? 0) + 1;
    notes.push("second wind");
  }
  token.secondWindUsed = (token.secondWindLeft ?? 0) <= 0;
  if (kit && (token.ragesLeft ?? 0) < kit.rages) {
    token.ragesLeft = (token.ragesLeft ?? 0) + 1;
    notes.push("rage");
  }
  token.actionSurge = (kit?.actionSurge ?? 0) > 0;
  const knownSlots = (pregen as { spellSlots?: Record<string, number> } | undefined)?.spellSlots;
  if (pregen?.class === "warlock" && knownSlots) {
    token.slots = { ...knownSlots };
    notes.push("pact slots");
  }
  if (pregen?.class === "wizard" && token.slots && !token.arcaneRecovery) {
    let left = Math.ceil((pregen.level ?? 1) / 2);
    for (const key of ["1", "2"]) {
      const max = knownSlots?.[key] ?? 0;
      while (left >= Number(key) && (token.slots[key] ?? 0) < max) {
        token.slots[key] = (token.slots[key] ?? 0) + 1;
        left -= Number(key);
      }
    }
    token.arcaneRecovery = true;
    notes.push("arcane recovery");
  }
  if (pregen?.class === "monk") token.ki = token.kiMax ?? token.ki;
  if (pregen?.class === "bard") {
    const cha = Math.max(1, Math.floor(((pregen.abilities.cha ?? 10) - 10) / 2));
    token.bardicLeft = cha;
  }
  if (kit?.channelDivinity && (token.channelDivinity ?? 0) < kit.channelDivinity) token.channelDivinity = (token.channelDivinity ?? 0) + 1;
  notes.push(...onClassShortRest(token, pregen?.level ?? 1, pregen?.abilities ?? {}, knownSlots));
  return notes;
}

export function longRestResources(token: CombatToken, pregen: Pregen | undefined): void {
  token.hp = token.maxHp;
  token.dying = false;
  token.stable = false;
  token.deathSuccesses = 0;
  token.deathFailures = 0;
  token.raging = false;
  const knownSlots = (pregen as { spellSlots?: Record<string, number> } | undefined)?.spellSlots;
  if (knownSlots) token.slots = { ...knownSlots };
  const level = pregen?.level ?? 1;
  if (token.hitDice == null) token.hitDice = level;
  const kit = token.kit ?? (pregen ? kitForPregen(pregen) : undefined);
  token.secondWindLeft = kit?.secondWind || (token.features?.includes("second_wind") ? 1 : 0);
  token.secondWindUsed = token.secondWindLeft <= 0;
  token.indomitableLeft = kit?.indomitable ?? 0;
  token.actionSurge = (kit?.actionSurge ?? 0) > 0;
  token.ki = token.kiMax ?? 0;
  token.layOnHands = token.layOnHandsMax ?? 0;
  token.sorceryPoints = kit?.sorceryPoints ?? 0;
  token.ragesLeft = kit?.rages ?? 0;
  token.channelDivinity = kit?.channelDivinity ?? 0;
  if (pregen?.class === "bard") {
    token.bardicLeft = Math.max(1, Math.floor(((pregen.abilities.cha ?? 10) - 10) / 2));
  }
  token.arcaneRecovery = false;
  onClassLongRest(token, pregen?.level ?? 1, pregen?.abilities ?? {});
  token.exhaustionLevel = longRestExhaustionDelta(token.exhaustionLevel ?? 0);
  if ((token.exhaustionLevel ?? 0) > 0) token.conditions = [...(token.conditions ?? []).filter((c) => c !== "exhaustion"), "exhaustion"];
  else token.conditions = (token.conditions ?? []).filter((c) => c !== "exhaustion");
}
