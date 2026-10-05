/** Combat action folders and one-line operational summaries for TV and companion. */

import { inferActionFolder, type ActionFolder } from "@d20-fireverse/protocol";

export type ActionCategory = Exclude<ActionFolder, "bonus">;

export const FOLDER_LABELS: Record<ActionCategory | "bonus", string> = {
  move: "Move",
  attack: "Attack",
  spell: "Spell",
  tactics: "Tactics",
  item: "Items",
  feature: "Features",
  bonus: "Bonus",
};

type AbilityLike = {
  id?: string;
  name?: string;
  actionType?: string;
  level?: number;
  effects?: Array<Record<string, unknown>>;
};

const FEATURE_EFFECTS = new Set([
  "rage",
  "reckless",
  "surge",
  "pool_heal",
  "channel_preserve",
  "inspire",
  "ki_dodge",
  "ki_step",
  "flurry",
  "dash",
  "disengage",
  "dodge",
  "help",
  "hide",
  "search",
  "ready",
]);

function effectOf(ability: AbilityLike | undefined): Record<string, unknown> {
  return ability?.effects?.[0] ?? {};
}

function cellsFt(cells: unknown): string | null {
  const n = Number(cells ?? 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${n * 5} ft`;
}

function joinBits(parts: Array<string | null | undefined | false>): string {
  return parts.filter((p): p is string => Boolean(p && String(p).trim())).join(" · ");
}

function damageBit(effect: Record<string, unknown>): string | null {
  const parts = effect.damage as Array<{ dice?: string; damageType?: string; ability?: string }> | undefined;
  if (!parts?.length) {
    if (typeof effect.dice === "string" && effect.dice !== "0") {
      const type = typeof effect.damageType === "string" ? effect.damageType : "";
      return type ? `${effect.dice} ${type}` : effect.dice;
    }
    return null;
  }
  return parts
    .map((p) => {
      let dice = p.dice ?? "";
      if (p.ability && dice && !/[+-]/.test(dice.slice(1))) dice += `+${p.ability.toUpperCase()}`;
      return [dice, p.damageType].filter(Boolean).join(" ");
    })
    .join(" + ");
}

function slotBit(effect: Record<string, unknown>, ability: AbilityLike | undefined): string | null {
  const slot = Number(effect.slot ?? 0);
  if (slot > 0) return `slot ${slot}`;
  if (ability?.level === 0 && !FEATURE_EFFECTS.has(String(effect.type ?? ""))) return "cantrip";
  return null;
}

export function actionCategory(id: string, ability: AbilityLike | undefined): ActionCategory {
  const inferred = inferActionFolder(id, ability?.name ?? "");
  if (inferred !== "feature") return inferred;
  const realId = id.startsWith("quicken:") ? id.slice("quicken:".length) : id;
  const effect = effectOf(ability);
  const type = String(effect.type ?? "");
  if (realId.startsWith("use_potion") || effect.consume) return "item";
  if (
    realId.startsWith("spell_") ||
    Boolean(effect.spellAttack) ||
    (typeof effect.slot === "number" && Number(effect.slot) > 0) ||
    type === "mage_armor" ||
    type === "sleep" ||
    type === "rays" ||
    type === "auto_hit" ||
    type === "save" ||
    effect.dcFrom === "spell"
  ) {
    return "spell";
  }
  if (type === "attack" || realId.endsWith("_attack")) return "attack";
  return "feature";
}

const FIXED: Record<string, string> = {
  dash: "Spend your action to move again this turn",
  disengage: "Your movement does not provoke opportunity attacks",
  dodge: "Until your next turn, attacks against you have disadvantage",
  help: "Ally within 5 ft · advantage on their next attack",
  hide: "Stealth check · become hidden if you succeed",
  search: "Perception / Investigation check to find something nearby",
  ready: "Prepare a trigger and a response until your next turn",
  rage: "Bonus · STR advantage and physical resistance while raging",
  reckless: "Advantage on melee STR attacks; foes have advantage against you",
  surge: "Take one extra action this turn",
  mage_armor: "Self · AC becomes 13+DEX for 8 hours · slot 1",
};

const BY_ID: Record<string, string> = {
  second_wind: "Bonus · heal 1d10+level · once per rest",
  cunning_dash: "Bonus · Dash (move again this turn)",
  cunning_disengage: "Bonus · Disengage (no opportunity attacks)",
  cunning_hide: "Bonus · Hide (Stealth check)",
  lay_on_hands: "Touch ally · spend Lay on Hands pool to heal",
  action_surge: "Take one extra action this turn",
  spell_hunters_mark: "Bonus · mark a foe · +1d6 damage · concentration · slot 1",
  spell_shield: "Reaction · +5 AC until your next turn · slot 1",
  spell_bless: "Allies · +1d4 to attacks and saves · concentration · slot 1",
};

export function actionSummary(id: string, ability: AbilityLike | undefined): string {
  const realId = id.startsWith("quicken:") ? id.slice("quicken:".length) : id;
  if (BY_ID[realId]) return BY_ID[realId];
  const effect = effectOf(ability);
  const type = String(effect.type ?? "");
  if (FIXED[type]) return FIXED[type];

  const range = cellsFt(effect.rangeCells) ?? cellsFt(effect.lengthCells);
  const dmg = damageBit(effect);
  const slot = slotBit(effect, ability);
  const name = ability?.name ?? realId;

  if (type === "auto_hit") {
    const n = Number(effect.missiles ?? 0);
    const payload = n > 1 && dmg ? `${n}×(${dmg})` : dmg;
    return joinBits(["Auto-hit", range, payload, slot]) || name;
  }
  if (type === "rays") {
    const n = Number(effect.rays ?? 0);
    return joinBits([n ? `${n} rays` : "Rays", "spell attack", range, dmg ? `${dmg} each` : null, slot]) || name;
  }
  if (type === "attack") {
    const kind = effect.spellAttack ? "Spell attack" : Number(effect.rangeCells ?? 1) > 1 ? "Ranged" : "Melee";
    return joinBits([kind, range ?? "5 ft", dmg, slot]) || name;
  }
  if (type === "save") {
    const abil = String(effect.ability ?? "save").toUpperCase();
    const shape = effect.shape && effect.shape !== "one" ? String(effect.shape) : null;
    const cone = shape === "cone" && effect.lengthCells ? `${Number(effect.lengthCells) * 5} ft cone` : null;
    const half = effect.halfOnSuccess ? "half on success" : null;
    return joinBits([cone ?? range, `${abil} save`, dmg, half, slot]) || name;
  }
  if (type === "heal" || type === "pool_heal") {
    const who = effect.self ? "Self" : "Ally";
    const dice = typeof effect.dice === "string" ? `heal ${effect.dice}` : "heal";
    const abil = typeof effect.ability === "string" ? `+${effect.ability.toUpperCase()}` : "";
    return joinBits([who, range, `${dice}${abil}`, slot]);
  }
  if (type === "sleep") {
    const dice = typeof effect.dice === "string" ? `${effect.dice} HP pool knocked unconscious` : "unconscious";
    const rad = cellsFt(effect.radius);
    return joinBits([range, rad ? `${rad} radius` : null, dice, slot]);
  }
  if (type === "brand") {
    const dice = typeof effect.dice === "string" ? `+${effect.dice} damage` : "mark a foe";
    return joinBits(["Mark a foe", range, dice, effect.concentration ? "concentration" : null, slot]);
  }
  if (type === "buff" || type === "ward") {
    const ac = effect.acBonus ? `+${effect.acBonus} AC` : effect.bonus ? `+${effect.bonus}` : "buff";
    const dur = typeof effect.duration === "string" ? String(effect.duration).replaceAll("_", " ") : null;
    return joinBits([ac, dur, effect.concentration ? "concentration" : null, slot]);
  }
  if (type === "inspire") {
    const dice = typeof effect.dice === "string" ? effect.dice : "inspiration";
    return joinBits(["Bonus", "ally", range, `${dice} inspiration`]);
  }
  if (type === "teleport") {
    return joinBits(["Bonus", "teleport", range, slot]);
  }
  if (id.startsWith("quicken:")) return `Quicken · ${actionSummary(realId, ability)}`;
  return joinBits([name, ability?.actionType === "bonus_action" ? "Bonus" : "Action"]);
}
