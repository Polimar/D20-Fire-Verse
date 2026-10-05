/** Combat action-bar folders. Clients group by id/name so a missing or wrong `category` cannot dump everything into Features. */

export type ActionFolder = "attack" | "spell" | "tactics" | "item" | "feature" | "bonus";

const CANTRIPS = new Set([
  "fire_bolt",
  "ray_of_frost",
  "sacred_flame",
  "produce_flame",
  "vicious_mockery",
  "eldritch_blast",
  "mage_hand",
  "prestidigitation",
  "light",
]);

const WEAPON_NAMES = new Set([
  "longsword",
  "shortbow",
  "dagger",
  "mace",
  "quarterstaff",
  "shortsword",
  "scimitar",
  "greataxe",
  "handaxe",
  "light_crossbow",
  "unarmed",
]);

const TACTIC_NAMES = new Set(["dash", "disengage", "dodge", "help", "hide", "search", "ready"]);

export function inferActionFolder(id: string, name = ""): Exclude<ActionFolder, "bonus"> {
  const real = String(id ?? "")
    .replace(/^quicken:/, "")
    .toLowerCase();
  const n = String(name ?? "").toLowerCase();
  if (real.startsWith("std_") || TACTIC_NAMES.has(real) || TACTIC_NAMES.has(n)) return "tactics";
  if (real.startsWith("use_potion") || real.includes("potion") || n.includes("potion")) return "item";
  if (
    real.startsWith("spell_") ||
    CANTRIPS.has(real) ||
    n.includes("spell") ||
    /\b(missile|burning hands|mage armor|guiding bolt|cure wounds|scorching|sleep|shield|bless|hex|hunter)\b/.test(n)
  ) {
    return "spell";
  }
  const weaponKey = real.replace(/_attack$/, "").replace(/_strike$/, "");
  if (
    real.endsWith("_attack") ||
    real.endsWith("_strike") ||
    WEAPON_NAMES.has(real) ||
    WEAPON_NAMES.has(weaponKey) ||
    /\b(longsword|shortbow|dagger|mace|staff|shortsword|scimitar|axe|bow|crossbow)\b/.test(n)
  ) {
    return "attack";
  }
  return "feature";
}

export function actionFolderOf(a: {
  id?: string;
  name?: string;
  economy?: string;
  actionType?: string;
}): ActionFolder {
  const eco = String(a.economy ?? a.actionType ?? "");
  if (eco === "bonus_action" || eco === "bonus") return "bonus";
  return inferActionFolder(a.id ?? "", a.name ?? "");
}
