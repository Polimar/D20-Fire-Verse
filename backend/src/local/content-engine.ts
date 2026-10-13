/**
 * What the game actually does with a catalog entry, read from the live engine data.
 * The admin compares this with the SRD text before approving an entry.
 */

import type { EffectDef, ItemDef, MonsterAction, MonsterDef as CatalogMonster, SpellDef } from "@d20-fireverse/content-schema";
import { getAbility, getMonster, type AbilityDef } from "./campaign.js";
import { currentSnapshot } from "./catalog.js";
import { srdMonsterId } from "./srd-monsters.js";

export type EngineLine = { label: string; detail: string; ok: boolean };
export type EngineView = {
  /** runs: the engine executes it. partial: some parts run. sheet: lists and menus only. unused: nothing reads it. */
  state: "runs" | "partial" | "sheet" | "unused";
  headline: string;
  source: string;
  lines: EngineLine[];
  mismatches: string[];
  notes: string[];
};

const ABILITY_NAMES: Record<string, string> = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };

function feet(cells: unknown): string {
  const n = Number(cells);
  return Number.isFinite(n) && n > 0 ? `${n * 5} ft` : "";
}

function damageText(list: unknown): string {
  if (!Array.isArray(list)) return "";
  return list
    .map((d) => d as { dice?: string; damageType?: string; ability?: string })
    .filter((d) => d.dice && d.dice !== "0")
    .map((d) => `${d.dice}${d.ability ? " + mod" : ""} ${d.damageType ?? ""}`.trim())
    .join(" + ");
}

/** One readable line per engine effect: to-hit, save DC, dice, range, limits. */
export function describeEffect(effect: Record<string, unknown>): string {
  const bits: string[] = [];
  const type = String(effect.type ?? "effect");
  if (type === "attack" && typeof effect.ref === "string") return `makes one ${String(effect.ref).split(":").pop()?.replace(/_/g, " ")} attack`;
  if (type === "attack" || type === "rays") {
    bits.push(
      effect.spellAttack
        ? "spell attack"
        : effect.ability
          ? `${ABILITY_NAMES[String(effect.ability)] ?? String(effect.ability)} mod${effect.proficient ? " + proficiency" : ""} to hit`
          : `+${Number(effect.attackBonus ?? 0)} to hit`,
    );
    if (type === "rays") bits.push(`${Number(effect.rays ?? 1)} rays`);
  } else if (type === "save") {
    bits.push(`${ABILITY_NAMES[String(effect.ability)] ?? String(effect.ability ?? "?")} save DC ${effect.dc ?? (effect.dcFrom === "spell" ? "spell DC" : "?")}`);
  } else if (type === "heal") {
    bits.push(`heals ${String(effect.dice ?? "?")}${effect.ability ? " + mod" : ""}`);
  } else {
    bits.push(type.replace(/_/g, " "));
  }
  const dmg = damageText(effect.damage);
  if (dmg) bits.push(dmg);
  if (typeof effect.dice === "string" && type !== "heal") bits.push(effect.dice);
  const range = feet(effect.rangeCells);
  if (range) bits.push(range === "5 ft" ? "reach 5 ft" : `range ${range}`);
  if (effect.shape && effect.shape !== "one") bits.push(`${String(effect.shape)}${effect.radius ? ` r${feet(effect.radius)}` : effect.lengthCells ? ` ${feet(effect.lengthCells)}` : ""}`);
  if (effect.halfOnSuccess) bits.push("half on a save");
  if (effect.condition || effect.onFail) bits.push(`on a fail: ${String(effect.condition ?? effect.onFail)}`);
  if (effect.concentration) bits.push("concentration");
  const recharge = effect.recharge as { min?: number; max?: number } | undefined;
  if (recharge?.min) bits.push(`recharge ${recharge.min}–${recharge.max}`);
  if (effect.usesPerDay) bits.push(`${Number(effect.usesPerDay)}/day`);
  const scaling = effect.scaling as Record<string, string> | undefined;
  if (scaling) bits.push(`upcast ${Object.entries(scaling).map(([slot, dice]) => `slot ${slot}: ${dice}`).join(", ")}`);
  if (effect.acBonus != null) bits.push(`+${String(effect.acBonus)} AC`);
  if (effect.acFloor != null) bits.push(`AC at least ${String(effect.acFloor)}`);
  if (effect.amount != null) bits.push(`+${String(effect.amount)}`);
  return bits.join(" · ");
}

function describeAbility(ability: AbilityDef): string {
  const action = ability.actionType === "bonus_action" ? "Bonus action" : ability.actionType === "reaction" ? "Reaction" : "Action";
  return `${action} · ${ability.effects.map(describeEffect).join(" then ")}`;
}

function engineSlug(name: string): string {
  return name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function encountersUsing(ids: string[]): string[] {
  const snap = currentSnapshot();
  return Object.values(snap.encounters)
    .filter((enc) => Object.values(enc.scaling).some((list) => list.some((slot) => ids.includes(slot.monsterId))))
    .map((enc) => enc.name || enc.id);
}

function monsterView(id: string, game: CatalogMonster): EngineView {
  const engineId = srdMonsterId(game.name || id);
  const compiled = getMonster(engineId);
  const campaignCopy = currentSnapshot().monsters[id];
  const encounters = encountersUsing([id, engineId]);
  const notes: string[] = [
    "Arena fights draw from every SRD stat block the engine compiles. The Enabled switch does not gate the arena yet.",
  ];
  if (campaignCopy) {
    notes.push(`The campaign ships its own “${campaignCopy.name}” (AC ${campaignCopy.ac}, HP ${campaignCopy.hp}, actions ${campaignCopy.actions.join(", ")}). Campaign fights use that copy, not this entry.`);
  }
  if (encounters.length) notes.push(`Campaign encounters with it: ${encounters.join(", ")}.`);
  if (!compiled) {
    return {
      state: "unused",
      headline: "The combat engine skips this stat block: none of its actions compile into an attack or a save.",
      source: "backend/src/local/srd-monsters.ts compiles content/srd/monsters-A-Z.md at startup",
      lines: [],
      mismatches: [],
      notes,
    };
  }
  const lines: EngineLine[] = [
    { label: "Stats", detail: `AC ${compiled.ac} · HP ${compiled.hp} · Speed ${compiled.speedCells * 5} ft · AI ${compiled.aiProfile ?? "default"}`, ok: true },
  ];
  if (compiled.multiattack?.length) {
    lines.push({ label: "Multiattack", detail: compiled.multiattack.map((aid) => getAbility(aid)?.name ?? aid).join(" + "), ok: true });
  }
  const ran = new Set<string>();
  for (const [label, list] of [["Action", compiled.actions], ["Bonus action", compiled.bonusActions ?? []], ["Legendary", compiled.legendaryActions ?? []]] as const) {
    for (const aid of list) {
      ran.add(aid);
      const ability = getAbility(aid);
      lines.push({ label: `${label}: ${ability?.name ?? aid}`, detail: ability ? describeAbility(ability) : "missing from the ability catalog", ok: Boolean(ability) });
    }
  }
  const skipped = (list: MonsterAction[] | undefined, label: string) =>
    (list ?? [])
      .filter((a) => !["multiattack", "spellcasting"].includes(engineSlug(a.name)) && !ran.has(`${engineId}:${engineSlug(a.name)}`))
      .map((a) => ({ label: `${label}: ${a.name}`, detail: "Not run. The engine could not compile it from the text.", ok: false }));
  const missed = [
    ...skipped(game.actions, "Action"),
    ...skipped(game.bonusActions, "Bonus action"),
    ...skipped(game.legendaryActions, "Legendary"),
    ...(game.reactions ?? []).map((a) => ({ label: `Reaction: ${a.name}`, detail: "Not run. Monsters take no reactions in combat.", ok: false })),
  ];
  lines.push(...missed);
  const mismatches: string[] = [];
  if (compiled.ac !== game.ac) mismatches.push(`AC: the stat block says ${game.ac}, the engine uses ${compiled.ac}.`);
  if (compiled.hp !== game.hp) mismatches.push(`HP: the stat block says ${game.hp}, the engine uses ${compiled.hp}.`);
  for (const action of game.actions ?? []) {
    const ability = getAbility(`${engineId}:${engineSlug(action.name)}`);
    const effect = ability?.effects[0];
    if (!effect || !action.damage?.length) continue;
    const engineDice = (effect.damage as Array<{ dice: string }> | undefined)?.map((d) => d.dice).join(" + ") ?? "";
    const srdDice = action.damage.map((d) => d.dice).join(" + ");
    if (engineDice && engineDice !== srdDice) mismatches.push(`${action.name}: the stat block rolls ${srdDice}, the engine rolls ${engineDice}.`);
    if (action.attack && effect.attackBonus != null && Number(effect.attackBonus) !== action.attack.bonus) {
      mismatches.push(`${action.name}: the stat block hits at +${action.attack.bonus}, the engine at +${Number(effect.attackBonus)}.`);
    }
  }
  return {
    state: missed.length ? "partial" : "runs",
    headline: missed.length
      ? `The engine fields it as ${engineId} but skips ${missed.length} of its moves.`
      : `The engine fields it as ${engineId} and runs every action in the stat block.`,
    source: "backend/src/local/srd-monsters.ts compiles content/srd/monsters-A-Z.md at startup; dice roll in backend/src/local/dice.ts",
    lines,
    mismatches,
    notes,
  };
}

function spellView(id: string, game: SpellDef): EngineView {
  const engineId = getAbility(`spell_${id}`) ? `spell_${id}` : getAbility(id) ? id : null;
  const ability = engineId ? getAbility(engineId) : undefined;
  if (!ability) {
    return {
      state: "sheet",
      headline: `Heroes can learn it at level-up, but it does nothing in a fight: no combat ability spell_${id} exists.`,
      source: "Wire it in content/rules/srd51_combat.json to make it castable",
      lines: [],
      mismatches: [],
      notes: [],
    };
  }
  const mismatches: string[] = [];
  const effect = ability.effects[0] ?? {};
  const engineDice = (effect.damage as Array<{ dice: string }> | undefined)?.filter((d) => d.dice !== "0").map((d) => d.dice).join(" + ") ?? "";
  const srdDice = game.mechanics?.damage?.map((d) => d.dice).join(" + ") ?? "";
  if (srdDice && engineDice && srdDice !== engineDice) mismatches.push(`Damage: the SRD rolls ${srdDice}, the engine rolls ${engineDice}.`);
  if (game.mechanics?.heal && typeof effect.dice === "string" && effect.type === "heal" && effect.dice !== game.mechanics.heal) {
    mismatches.push(`Healing: the SRD heals ${game.mechanics.heal}, the engine heals ${effect.dice}.`);
  }
  const save = game.mechanics?.save?.ability;
  if (save && effect.type === "save" && effect.ability !== save) mismatches.push(`Save: the SRD calls for ${ABILITY_NAMES[save]}, the engine rolls ${ABILITY_NAMES[String(effect.ability)] ?? String(effect.ability)}.`);
  const level = Number((ability as AbilityDef & { level?: number }).level ?? game.level);
  if (level !== game.level) mismatches.push(`Level: the SRD says ${game.level}, the engine spends a level ${level} slot.`);
  return {
    state: "runs",
    headline: `Castable in combat as ${engineId}.`,
    source: "content/rules/srd51_combat.json or content/abilities/oneshot_v1.json; dice roll in backend/src/local/dice.ts",
    lines: [{ label: ability.name, detail: describeAbility(ability), ok: true }],
    mismatches,
    notes: [],
  };
}

function itemEffectLine(effect: EffectDef): EngineLine {
  switch (effect.kind) {
    case "ac_bonus":
      return { label: "AC", detail: `+${effect.amount} Armor Class`, ok: false };
    case "attack_bonus":
      return { label: "Attack", detail: `+${effect.amount} to attack rolls`, ok: false };
    case "damage_bonus":
      return { label: "Damage", detail: `+${effect.amount}${effect.damageType ? ` ${effect.damageType}` : ""} damage`, ok: false };
    case "on_hit_rider":
      return { label: "On hit", detail: `+${effect.damage} ${effect.damageType}`, ok: false };
    case "resistance":
      return { label: "Resistance", detail: effect.damageType, ok: false };
    case "immunity":
      return { label: "Immunity", detail: effect.damageType, ok: false };
    case "grant_spell":
      return { label: "Spell", detail: `${effect.spellId}${getAbility(`spell_${effect.spellId}`) || getAbility(effect.spellId) ? " (castable in combat)" : " (no combat ability)"}`, ok: false };
    case "grant_feature":
      return { label: "Feature", detail: effect.featureId, ok: false };
    case "stat_set":
      return { label: "Ability", detail: `${ABILITY_NAMES[effect.ability]} becomes ${effect.score}`, ok: false };
    case "stat_increase_cap":
      return { label: "Ability cap", detail: `${ABILITY_NAMES[effect.ability]} max ${effect.cap}`, ok: false };
    default: {
      const never: never = effect;
      return never;
    }
  }
}

function itemView(game: ItemDef): EngineView {
  const lines: EngineLine[] = game.effects.map(itemEffectLine);
  if (game.weapon) {
    const attack = getAbility(`${game.weaponId ?? game.id}_attack`);
    lines.unshift({
      label: "Weapon attack",
      detail: attack
        ? `${attack.id}: ${describeAbility(attack)}. Heroes swing it when their sheet lists the weapon.`
        : `${game.weapon.damage} ${game.weapon.damageType} in the SRD, but no ${game.weaponId ?? game.id}_attack ability exists, so nobody can swing it.`,
      ok: Boolean(attack),
    });
  }
  if (game.armor) {
    lines.unshift({
      label: "Armor",
      detail: `${game.armor.category} · base AC ${game.armor.baseAc}${game.armor.dexCap === null ? " + DEX" : game.armor.dexCap ? ` + DEX (max ${game.armor.dexCap})` : ""}. Not read by any sheet or fight.`,
      ok: false,
    });
  }
  const weaponRuns = lines.some((l) => l.ok);
  return {
    state: weaponRuns ? "partial" : game.effects.length || game.armor ? "unused" : "sheet",
    headline: game.effects.length || game.armor
      ? "Vendors, loot drops, and the stash use it. Nothing applies its effects yet: recomputeFromLoadout in packages/rules computes them, but no sheet or fight calls it."
      : "Vendors, loot drops, and the stash use it. It has no typed effects, so equipping it changes nothing.",
    source: "packages/rules/src/loadout.ts (effects) · backend/src/local/vendor.ts and loot.ts (sale and drops)",
    lines,
    mismatches: [],
    notes: [],
  };
}

export function engineView(kind: string, id: string, game: unknown): EngineView | null {
  if (!game || typeof game !== "object") return null;
  switch (kind) {
    case "monster":
      return monsterView(id, game as CatalogMonster);
    case "spell":
      return spellView(id, game as SpellDef);
    case "item":
      return itemView(game as ItemDef);
    case "class":
    case "subclass":
    case "species":
    case "background":
    case "feat":
      return {
        state: "sheet",
        headline: "Hero creation and level-up read it once it is enabled.",
        source: "backend/src/local/hero.ts",
        lines: [],
        mismatches: [],
        notes: [],
      };
    default:
      return null;
  }
}
