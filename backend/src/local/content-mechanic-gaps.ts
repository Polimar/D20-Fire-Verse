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
  for (const line of view.lines) {
    if (!line.ok && !line.label.startsWith("Reaction:")) {
      reasons.push(`${line.label}: ${line.detail}`);
    }
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

const REVIEW_HINT_KINDS = new Set(["item", "spell", "monster"]);

/** Human-readable causes shown in the admin detail drawer. */
export function mechanicGapReasons(kind: string, id: string, game: unknown, review?: ContentReviewHints): string[] {
  if (!game || typeof game !== "object") return REVIEW_HINT_KINDS.has(kind) ? reviewReasons(review) : [];

  const reasons = REVIEW_HINT_KINDS.has(kind) ? reviewReasons(review) : [];

  switch (kind) {
    case "item": {
      const item = game as ItemDef;
      reasons.push(...itemEngineReasons(item), ...itemDrinkReasons(item, review));
      break;
    }
    case "spell":
      reasons.push(...spellEngineReasons(game as SpellDef));
      break;
    case "monster":
      reasons.push(...monsterEngineReasons(id, game as MonsterDef));
      break;
    case "class":
      reasons.push(...classEngineReasons(id, game as { name?: string; levels?: Array<{ level: number; features: string[] }> }));
      break;
    case "subclass":
    case "species":
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
