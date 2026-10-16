/**
 * Flags catalog entries whose SRD rules or combat engine wiring are incomplete.
 * Powers admin Missing mechanic + Needs review promotion across content kinds.
 */

import type { ItemDef, MonsterDef, SpellDef } from "@d20-fireverse/content-schema";
import { engineView } from "./content-engine.js";

export type ContentReviewHints = {
  notModeled?: string[];
  unparsedFields?: string[];
  srd?: { text?: string };
};

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
  if (game.effects.some((effect) => effect.kind === "haste_drink" || effect.kind === "heal_drink" || effect.kind === "invisibility_drink")) {
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

function spellEngineReasons(spell: SpellDef): string[] {
  const reasons: string[] = [];
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
  for (const mismatch of view.mismatches) {
    reasons.push(`Stat block vs engine: ${mismatch}`);
  }
  return reasons;
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
        (/Haste spell/i.test(reason) && item.effects.some((effect) => effect.kind === "haste_drink"));
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
      if (id === "spirit_guardians") {
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
      reasons.push(...spellEngineReasons(game as SpellDef));
      if (id === "dimension_door") {
        const kept = reasons.filter((reason) => !/Secondary damage/i.test(reason) && !/4d6 force/i.test(reason));
        reasons.length = 0;
        reasons.push(...kept);
      }
      break;
    }
    case "monster":
      reasons.push(...monsterEngineReasons(id, game as MonsterDef));
      break;
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
