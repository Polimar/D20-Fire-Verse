/**
 * Normalizes mechanicGapReasons strings into stable buckets for gap reports.
 */

export function normalizeGapBucket(reason: string): string {
  const r = reason.trim();
  if (/^No combat ability wired:/i.test(r)) return "spell_no_combat_ability";
  if (/^Combat engine \(Secondary damage\)/i.test(r) || /Secondary damage/i.test(r)) return "spell_secondary_damage";
  if (/No battlefield effect/i.test(r)) return "spell_no_battlefield_effect";
  if (/^SRD rule not applied in combat:/i.test(r)) return "review_not_modeled";
  if (/^Parser could not map field:/i.test(r)) return "parser_unparsed_field";
  if (/drinkable potion with combat buffs/i.test(r)) return "item_drink_untyped";
  if (/^Combat engine cannot run this \(grant_spell\)/i.test(r) || /grant_spell/i.test(r)) return "item_grant_spell_unwired";
  if (/^Combat engine cannot run this/i.test(r)) return "item_engine_line";
  if (/combat state is "unused"/i.test(r)) return "item_effects_unused";
  if (/^Not run\. The engine could not compile/i.test(r) || /could not compile/i.test(r)) return "monster_not_compiled";
  if (/^Multiattack:/i.test(r) || /^Legendary /i.test(r)) return "monster_action_partial";
  if (/^Class feature not in combat/i.test(r)) return "class_feature_gap";
  if (/^Combat engine \(/i.test(r)) return "engine_line_other";
  if (/Combat vs SRD mismatch/i.test(r) || /Stat block vs engine/i.test(r)) return "srd_engine_mismatch";
  return "other";
}

/** Primary bucket for an entry: first reason wins (same order as admin drawer). */
export function primaryGapBucket(reasons: string[]): string {
  if (!reasons.length) return "none";
  return normalizeGapBucket(reasons[0]);
}
