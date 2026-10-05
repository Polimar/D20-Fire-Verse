/** Combat action-bar folders. Clients group by id/name so a missing or wrong `category` cannot dump everything into Features. */

export type ActionFolder = "attack" | "spell" | "tactics" | "item" | "feature" | "bonus" | "move";

/** Client-only: pick a reachable square on the TV board. Never sent as PERFORM_ACTION. */
export const UI_MOVE_ID = "ui_move";

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

const TACTIC_NAMES = new Set(["disengage", "dodge", "help", "hide", "search", "ready"]);

function isDashId(id: string, name: string): boolean {
  return id === "dash" || id === "std_dash" || id.endsWith("_dash") || name === "dash";
}

export function inferActionFolder(id: string, name = ""): Exclude<ActionFolder, "bonus"> {
  const real = String(id ?? "")
    .replace(/^quicken:/, "")
    .toLowerCase();
  const n = String(name ?? "").toLowerCase();
  if (isDashId(real, n) || real === UI_MOVE_ID) return "move";
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
  const inferred = inferActionFolder(a.id ?? "", a.name ?? "");
  if (inferred === "move") return "move";
  const eco = String(a.economy ?? a.actionType ?? "");
  if (eco === "bonus_action" || eco === "bonus") return "bonus";
  return inferred;
}

export function folderActionLists<T extends { id?: string; name?: string; economy?: string; actionType?: string }>(
  actions: T[],
  bonus: T[],
  folder: ActionFolder,
  moveRow?: T | null,
): T[] {
  if (folder === "move") {
    const dashes = [...actions, ...bonus].filter((a) => inferActionFolder(a.id ?? "", a.name ?? "") === "move");
    return moveRow ? [moveRow, ...dashes] : dashes;
  }
  if (folder === "bonus") {
    return bonus.filter((a) => inferActionFolder(a.id ?? "", a.name ?? "") !== "move");
  }
  return actions.filter((a) => actionFolderOf(a) === folder);
}
