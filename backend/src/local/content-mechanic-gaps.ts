/**
 * Flags catalog entries whose typed effects or SRD drink rules are not runnable in combat.
 * Used to keep the admin review queue honest when the parser says auto_ok but the engine cannot run it.
 */

import type { ItemDef } from "@d20-fireverse/content-schema";
import { engineView } from "./content-engine.js";

type ItemReviewHints = {
  notModeled?: string[];
  srd?: { text?: string };
};

/** True when the item should stay in (or return to) needs review until combat can apply it. */
export function itemMechanicGap(game: ItemDef, review?: ItemReviewHints): boolean {
  if ((review?.notModeled?.length ?? 0) > 0) return true;

  const view = engineView("item", game.id, game, false);
  if (view?.lines.some((line) => !line.ok)) return true;
  if (view?.state === "unused" && game.effects.length > 0) return true;

  const srdText = String(review?.srd?.text ?? "");
  const consumable = game.slot === "consumable" && !game.weapon && !game.armor;
  if (
    consumable &&
    game.effects.length === 0 &&
    /when you drink/i.test(srdText) &&
    /\b(gain|have|regain|under the effect|invisible|resistance|fly|climb|haste|bless|temporary hit points)\b/i.test(srdText)
  ) {
    return true;
  }

  return false;
}
