/** Builder Weapon Mastery helpers — proficiency bands and pick validation (PHB 2024-shaped). */

export type WeaponCategory = "simple_melee" | "simple_ranged" | "martial_melee" | "martial_ranged";

export type WeaponProfBand = "simple" | "simple_martial" | "simple_martial_finesse_light";

/** SRD core weapon proficiency by class id. */
export const CLASS_WEAPON_PROF: Record<string, WeaponProfBand> = {
  barbarian: "simple_martial",
  fighter: "simple_martial",
  paladin: "simple_martial",
  ranger: "simple_martial",
  rogue: "simple_martial_finesse_light",
  monk: "simple_martial_finesse_light",
  bard: "simple",
  cleric: "simple",
  druid: "simple",
  sorcerer: "simple",
  warlock: "simple",
  wizard: "simple",
};

/**
 * Classes whose L1 Weapon Mastery text limits choices to melee weapons
 * (e.g. Barbarian: "Simple or Martial Melee").
 */
export const CLASS_MASTERY_MELEE_ONLY = new Set<string>(["barbarian"]);

export type MasteryWeaponOption = {
  id: string;
  name: string;
  masteryId: string;
  masteryName: string;
  category: WeaponCategory;
  properties: string[];
};

export function classAllowsWeaponCategory(
  band: WeaponProfBand,
  category: WeaponCategory,
  properties: string[],
): boolean {
  const simple = category === "simple_melee" || category === "simple_ranged";
  const martial = category === "martial_melee" || category === "martial_ranged";
  if (band === "simple") return simple;
  if (band === "simple_martial") return simple || martial;
  if (!simple && !martial) return false;
  if (simple) return true;
  const props = properties.map((p) => p.toLowerCase());
  return props.some((p) => p === "finesse" || p === "light" || p.startsWith("finesse") || p.startsWith("light"));
}

export function filterMasteryWeaponsForClass(
  classId: string,
  weapons: MasteryWeaponOption[],
): MasteryWeaponOption[] {
  const band = CLASS_WEAPON_PROF[classId] ?? "simple";
  const meleeOnly = CLASS_MASTERY_MELEE_ONLY.has(classId);
  return weapons.filter((w) => {
    if (meleeOnly && (w.category === "simple_ranged" || w.category === "martial_ranged")) return false;
    return classAllowsWeaponCategory(band, w.category, w.properties);
  });
}

export function validateWeaponMasteryPicks(opts: {
  required: number;
  picks: string[];
  allowed: MasteryWeaponOption[];
}): string | null {
  const { required, picks, allowed } = opts;
  if (required <= 0) return null;
  if (picks.length !== required) return "NEED_WEAPON_MASTERY";
  if (new Set(picks).size !== picks.length) return "BAD_WEAPON_MASTERY";
  const byId = new Map(allowed.map((w) => [w.id, w]));
  const props: string[] = [];
  for (const id of picks) {
    const w = byId.get(id);
    if (!w) return "BAD_WEAPON_MASTERY";
    if (props.includes(w.masteryId)) return "MASTERY_PROPERTY_DUP";
    props.push(w.masteryId);
  }
  return null;
}
