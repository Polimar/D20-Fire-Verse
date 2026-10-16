/**
 * Concrete origin / fighting-style / general / epic feat effects.
 * Combat and economy call into these helpers; features live on hero/token.features.
 */

export type Featful = {
  features?: string[];
  luckPoints?: number;
  luckPointsMax?: number;
  heroicInspiration?: boolean;
  savageUsed?: boolean;
  tavernPushUsed?: boolean;
  gwmHewUsed?: boolean;
  chargerArmed?: boolean;
  mountId?: string;
  recoveryUsed?: boolean;
  combatProwessUsed?: boolean;
  fateUsed?: boolean;
  miFreeCastUsed?: boolean;
  freeCasts?: Record<string, boolean>;
  speedCells?: number;
  truesight?: boolean;
  level?: number;
  proficiencyBonus?: number;
};

export function hasFeat(token: Featful, id: string): boolean {
  return (token.features ?? []).includes(id);
}

export function toughHpBonus(level: number, features: string[]): number {
  return hasFeat({ features }, "tough") ? 2 * level : 0;
}

export function fortitudeHpBonus(features: string[]): number {
  return hasFeat({ features }, "boon_of_fortitude") ? 40 : 0;
}

export function skillMasteryProficiency(features: string[], skillId: string, proficient: boolean): boolean {
  if (hasFeat({ features }, "boon_of_skill_mastery")) return true;
  return proficient;
}

export function initLuck(token: Featful, pb: number): void {
  if (!hasFeat(token, "lucky")) return;
  token.luckPointsMax = pb;
  token.luckPoints = pb;
}

export function spendLuck(token: Featful, mode: "self_adv" | "attacker_disadv"): boolean {
  if (!hasFeat(token, "lucky") || (token.luckPoints ?? 0) < 1) return false;
  token.luckPoints = (token.luckPoints ?? 0) - 1;
  void mode;
  return true;
}

export function grantMusicianInspiration(
  granter: Featful,
  allies: Featful[],
  pb: number,
): number {
  if (!hasFeat(granter, "musician")) return 0;
  let n = 0;
  for (const ally of allies.slice(0, pb)) {
    ally.heroicInspiration = true;
    n += 1;
  }
  return n;
}

export function spendHeroicInspiration(token: Featful): boolean {
  if (!token.heroicInspiration) return false;
  token.heroicInspiration = false;
  return true;
}

export function crafterPrice(priceGold: number, features: string[], magical: boolean): number {
  if (magical || !hasFeat({ features }, "crafter")) return priceGold;
  return Math.max(1, Math.floor(priceGold * 0.8));
}

export function crafterCraftCost(priceGold: number, features: string[]): number | null {
  if (!hasFeat({ features }, "crafter")) return null;
  return Math.max(1, Math.floor(priceGold / 2));
}

export function unarmedDie(features: string[]): string {
  return hasFeat({ features }, "tavern_brawler") ? "1d4" : "1";
}

export function applySpeedySpeed(baseCells: number, features: string[]): number {
  return hasFeat({ features }, "speedy") ? baseCells + 2 : baseCells;
}

export function heavyArmorMasterReduce(features: string[], pb: number, damageType: string, wearingHeavy: boolean): number {
  if (!wearingHeavy || !hasFeat({ features }, "heavy_armor_master")) return 0;
  if (!/bludgeoning|piercing|slashing/i.test(damageType)) return 0;
  return pb;
}

export function greatWeaponMasterBonus(features: string[], pb: number, heavy: boolean): number {
  return heavy && hasFeat({ features }, "great_weapon_master") ? pb : 0;
}

export function archeryBonus(features: string[], ranged: boolean): number {
  return ranged && hasFeat({ features }, "archery") ? 2 : 0;
}

export function duelingBonus(features: string[], oneHandMelee: boolean): number {
  return oneHandMelee && hasFeat({ features }, "dueling") ? 2 : 0;
}

export function defenseAcBonus(features: string[], armored: boolean): number {
  return armored && hasFeat({ features }, "defense") ? 1 : 0;
}

export function tryCombatProwess(token: Featful, missed: boolean): boolean {
  if (!missed || !hasFeat(token, "boon_of_combat_prowess") || token.combatProwessUsed) return false;
  token.combatProwessUsed = true;
  return true;
}

export function tryRecovery(token: Featful, maxHp: number): number {
  if (!hasFeat(token, "boon_of_recovery") || token.recoveryUsed) return 0;
  token.recoveryUsed = true;
  return Math.floor(maxHp / 2);
}

export function fortitudeExtraHeal(features: string[], conMod: number): number {
  if (!hasFeat({ features }, "boon_of_fortitude")) return 0;
  return Math.max(1, conMod);
}

export function spellRecallRefund(features: string[], slotLevel: number, d4: number): boolean {
  if (!hasFeat({ features }, "boon_of_spell_recall")) return false;
  if (slotLevel < 1 || slotLevel > 4) return false;
  return d4 === 1;
}

export function irresistibleIgnoresResistance(features: string[]): boolean {
  return hasFeat({ features }, "boon_of_irresistible_offense");
}

export function healerKitHeal(pb: number, d4: number): number {
  const die = d4 === 1 ? 2 + Math.floor(Math.random() * 4) : d4;
  return die + 1 + pb;
}

export function rerollHealOnes(rolls: number[]): number[] {
  return rolls.map((n) => (n === 1 ? 1 + Math.floor(Math.random() * Math.max(1, n || 4)) : n));
}

/** Feature ids the engine implements for gap reports. */
export const WIRED_FEAT_IDS = [
  "alert",
  "crafter",
  "healer",
  "lucky",
  "magic_initiate",
  "musician",
  "savage_attacker",
  "skilled",
  "tavern_brawler",
  "tough",
  "archery",
  "defense",
  "dueling",
  "great_weapon_fighting",
  "protection",
  "two_weapon_fighting",
  "actor",
  "athlete",
  "charger",
  "crossbow_expert",
  "dual_wielder",
  "great_weapon_master",
  "heavily_armored",
  "heavy_armor_master",
  "mounted_combatant",
  "polearm_master",
  "resilient",
  "sentinel",
  "sharpshooter",
  "shield_master",
  "speedy",
  "war_caster",
  "spell_sniper",
  "fey_touched",
  "shadow_touched",
  "telekinetic",
  "telepathic",
  "grappler",
  "boon_of_combat_prowess",
  "boon_of_dimensional_travel",
  "boon_of_fate",
  "boon_of_fortitude",
  "boon_of_irresistible_offense",
  "boon_of_recovery",
  "boon_of_skill_mastery",
  "boon_of_spell_recall",
  "boon_of_truesight",
  "boon_of_the_night_spirit",
] as const;
