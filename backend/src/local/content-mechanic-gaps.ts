/**
 * Flags catalog entries whose SRD rules or combat engine wiring are incomplete.
 * Powers admin Missing mechanic + Needs review promotion across content kinds.
 */

import type { ItemDef, MonsterDef, SpellDef } from "@d20-fireverse/content-schema";
import { getAbility } from "./campaign.js";
import { engineView } from "./content-engine.js";
import { srdAbility } from "./srd-sheet.js";
import { srdMonsterId } from "./srd-monsters.js";

export type ContentReviewHints = {
  notModeled?: string[];
  unparsedFields?: string[];
  srd?: { text?: string };
};

/** Accepted v1 approximations once a spell has a non-note / sheet ability. */
function isAcceptedTriageApproximation(reason: string): boolean {
  return (
    /No battlefield effect/i.test(reason) ||
    /Long casting time/i.test(reason) ||
    /Upcast adds extra targets/i.test(reason) ||
    /Area shape (emanation|cylinder)/i.test(reason) ||
    /Reaction casting is not offered/i.test(reason) ||
    /Secondary damage/i.test(reason) ||
    /Combat vs SRD mismatch: Damage/i.test(reason) ||
    /Concentration tracking and always-know-location/i.test(reason)
  );
}

function reviewReasons(review?: ContentReviewHints): string[] {
  const reasons: string[] = [];
  for (const rule of review?.notModeled ?? []) {
    reasons.push(`SRD rule not applied in combat: ${rule}`);
  }
  for (const field of review?.unparsedFields ?? []) {
    reasons.push(`Parser could not map field: ${field}`);
  }
  return reasons;
}

function itemEngineReasons(game: ItemDef): string[] {
  const reasons: string[] = [];
  const view = engineView("item", game.id, game, false);
  for (const line of view?.lines ?? []) {
    if (!line.ok) reasons.push(`Combat engine cannot run this (${line.label}): ${line.detail}`);
  }
  if (view?.state === "unused" && game.effects.length > 0) {
    reasons.push(
      `The game JSON lists ${game.effects.length} typed effect(s), but combat state is "unused" — equipping or drinking this item does nothing in a fight yet.`,
    );
  }
  return reasons;
}

function itemDrinkReasons(game: ItemDef, review?: ContentReviewHints): string[] {
  if (
    game.effects.some(
      (effect) =>
        effect.kind === "haste_drink" ||
        effect.kind === "heal_drink" ||
        effect.kind === "invisibility_drink" ||
        effect.kind === "resistance_drink",
    )
  ) {
    return [];
  }
  const srdText = String(review?.srd?.text ?? "");
  const consumable = game.slot === "consumable" && !game.weapon && !game.armor;
  if (
    consumable &&
    game.effects.length === 0 &&
    /when you drink/i.test(srdText) &&
    /\b(gain|have|regain|under the effect|invisible|resistance|fly|climb|haste|bless|temporary hit points)\b/i.test(srdText)
  ) {
    return [
      "SRD describes a drinkable potion with combat buffs, but the game JSON has no typed drink/buff effects (for example heal_drink, stat_drink, invisibility_drink).",
    ];
  }
  return [];
}

function spellAbilityMeta(spellId: string): { sheetOnly?: boolean; effectType?: string } {
  const ability = srdAbility(`spell_${spellId}`) ?? srdAbility(spellId);
  const effect = ability?.effects?.[0] as { type?: string } | undefined;
  return {
    sheetOnly: Boolean(ability?.sheetOnly) || effect?.type === "sheet_spell",
    effectType: effect?.type,
  };
}

function spellEngineReasons(spell: SpellDef): string[] {
  const reasons: string[] = [];
  const meta = spellAbilityMeta(spell.id);
  if (meta.sheetOnly) return reasons;
  const view = engineView("spell", spell.id, spell, false);
  if (view?.state === "sheet") {
    reasons.push(
      `No combat ability wired: add spell_${spell.id} in content/rules/srd51_combat.json (or content/abilities) so heroes can cast it in a fight.`,
    );
  }
  for (const line of view?.lines ?? []) {
    if (!line.ok) reasons.push(`Combat engine (${line.label}): ${line.detail}`);
  }
  for (const mismatch of view?.mismatches ?? []) {
    reasons.push(`Combat vs SRD mismatch: ${mismatch}`);
  }
  return reasons;
}

function monsterEngineReasons(id: string, monster: MonsterDef): string[] {
  const reasons: string[] = [];
  const view = engineView("monster", id, monster, false);
  if (!view) return reasons;
  if (view.state === "unused") {
    reasons.push(view.headline);
    return reasons;
  }
  for (const line of view.lines ?? []) {
    if (line.ok) continue;
    // v1: monsters never take reactions; skip those lines as gaps.
    if (/^Reaction:/i.test(line.label)) continue;
    reasons.push(`Combat engine (${line.label}): ${line.detail}`);
  }
  for (const mismatch of view.mismatches) {
    reasons.push(`Stat block vs engine: ${mismatch}`);
  }
  return reasons;
}

/** Narrative traits / reactions / partial spell lists are out of v1 once the block compiles. */
function monsterReviewStale(reason: string, compiled: boolean, monsterId: string): boolean {
  if (!compiled) return false;
  if (
    /Trait “/i.test(reason) ||
    /Trait "/i.test(reason) ||
    /monsters take no reactions/i.test(reason) ||
    /Reaction “/i.test(reason) ||
    /Action “Spellcasting”: only spells wired/i.test(reason) ||
    /Parser could not map field: abilities\./i.test(reason) ||
    /Parser could not map field: actions/i.test(reason) ||
    /combat engine skips this stat block/i.test(reason)
  ) {
    return true;
  }
  // Drop review lines for moves that now compile into abilities.
  const move = reason.match(/(?:Action|Bonus action|Legendary action)\s+[“"]([^”"]+)[”"]/i)?.[1];
  if (move) {
    const slug = move
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    const mid = monsterId.startsWith("srd_") ? monsterId : srdMonsterId(monsterId.replace(/_/g, " "));
    const candidates = [`${mid}:${slug}`, `srd_${monsterId}:${slug}`];
    if (candidates.some((aid) => Boolean(srdAbility(aid) || getAbility(aid)))) return true;
  }
  return false;
}

function classEngineReasons(id: string, game: { name?: string; levels?: Array<{ level: number; features: string[] }> }): string[] {
  const reasons: string[] = [];
  const view = engineView("class", id, game, false);
  if (!view) return reasons;
  if (view.state === "unused") {
    reasons.push(view.headline);
  }
  for (const line of view.lines) {
    if (!line.ok) reasons.push(`Class feature not in combat (${line.label}): ${line.detail}`);
  }
  return reasons;
}

const REVIEW_HINT_KINDS = new Set(["item", "spell", "monster", "class", "subclass", "background", "feat"]);

/** Human-readable causes shown in the admin detail drawer. */
export function mechanicGapReasons(kind: string, id: string, game: unknown, review?: ContentReviewHints): string[] {
  if (!game || typeof game !== "object") return REVIEW_HINT_KINDS.has(kind) ? reviewReasons(review) : [];

  const reasons = REVIEW_HINT_KINDS.has(kind) ? reviewReasons(review) : [];

  switch (kind) {
    case "item": {
      const item = game as ItemDef;
      const stale = (reason: string) =>
        (/stealth/i.test(reason) && Boolean(item.armor?.stealthDisadvantage)) ||
        (/charge/i.test(reason) &&
          (Boolean(item.charges) ||
            item.effects.some((effect) => effect.kind === "grant_spell") ||
            (item.id === "staff_of_striking" && item.effects.some((effect) => effect.kind === "on_hit_rider")))) ||
        (/Strength without the belt/i.test(reason) && item.effects.some((effect) => effect.kind === "stat_set" || effect.kind === "stat_drink")) ||
        (/becomes nonmagical/i.test(reason) && item.effects.some((effect) => effect.kind === "on_hit_rider" && effect.saveDc)) ||
        (/Haste spell/i.test(reason) && item.effects.some((effect) => effect.kind === "haste_drink")) ||
        (/Bonus Action to end/i.test(reason) && item.effects.some((effect) => effect.kind === "animated_shield")) ||
        (/Incapacitated/i.test(reason) && item.effects.some((effect) => effect.kind === "animated_shield")) ||
        (/regains 1d3/i.test(reason) && item.effects.some((effect) => effect.kind === "cloak_invisibility")) ||
        (/pull the hood down/i.test(reason) && item.effects.some((effect) => effect.kind === "cloak_invisibility")) ||
        (/increase the spell's level/i.test(reason) &&
          item.id === "wand_of_magic_missiles" &&
          item.effects.some((effect) => effect.kind === "grant_spell"));
      const kept = reasons.filter((reason) => !stale(reason));
      reasons.length = 0;
      reasons.push(...kept, ...itemEngineReasons(item), ...itemDrinkReasons(item, review));
      break;
    }
    case "spell": {
      if (id === "bane" || id === "hold_person" || id === "hold_monster" || id === "charm_person" || id === "charm_monster") {
        const kept = reasons.filter((reason) => !/Upcast adds extra targets/i.test(reason));
        reasons.length = 0;
        reasons.push(...kept);
      }
      if (id === "spirit_guardians" || id === "antilife_shell" || id === "aura_of_life") {
        const kept = reasons.filter((reason) => !/Area shape emanation is approximated/i.test(reason));
        reasons.length = 0;
        reasons.push(...kept);
      }
      if (id === "banishment") {
        const kept = reasons.filter(
          (reason) => !/No battlefield effect/i.test(reason) && !/another plane/i.test(reason),
        );
        reasons.length = 0;
        reasons.push(...kept);
      }
      {
        const meta = spellAbilityMeta(id);
        if (meta.sheetOnly || (meta.effectType && meta.effectType !== "note")) {
          const kept = reasons.filter((reason) => !/No battlefield effect/i.test(reason));
          reasons.length = 0;
          reasons.push(...kept);
        }
      }
      reasons.push(...spellEngineReasons(game as SpellDef));
      if (id === "dimension_door") {
        const kept = reasons.filter((reason) => !/Secondary damage/i.test(reason) && !/4d6 force/i.test(reason));
        reasons.length = 0;
        reasons.push(...kept);
      }
      {
        const meta = spellAbilityMeta(id);
        if (meta.effectType && meta.effectType !== "note") {
          const kept = reasons.filter((reason) => !isAcceptedTriageApproximation(reason));
          reasons.length = 0;
          reasons.push(...kept);
        }
      }
      break;
    }
    case "monster": {
      const mon = game as MonsterDef;
      const view = engineView("monster", id, mon, false);
      const compiled = Boolean(view && view.state !== "unused");
      const kept = reasons.filter((reason) => !monsterReviewStale(reason, compiled, id));
      reasons.length = 0;
      reasons.push(...kept, ...monsterEngineReasons(id, mon));
      break;
    }
    case "class":
      reasons.push(...classEngineReasons(id, game as { name?: string; levels?: Array<{ level: number; features: string[] }> }));
      break;
    case "species":
      for (const rule of review?.notModeled ?? []) {
        reasons.push(`SRD rule not applied in combat: ${rule}`);
      }
      break;
    case "subclass":
    case "background":
    case "feat":
      break;
    default:
      break;
  }

  return reasons;
}

export function mechanicGap(kind: string, id: string, game: unknown, review?: ContentReviewHints): boolean {
  return mechanicGapReasons(kind, id, game, review).length > 0;
}

/** @deprecated Use mechanicGap("item", id, …) */
export function itemMechanicGap(game: ItemDef, review?: ContentReviewHints): boolean {
  return mechanicGap("item", game.id, game, review);
}

/** @deprecated Use mechanicGapReasons("item", id, …) */
export function itemMechanicGapReasons(game: ItemDef, review?: ContentReviewHints): string[] {
  return mechanicGapReasons("item", game.id, game, review);
}
