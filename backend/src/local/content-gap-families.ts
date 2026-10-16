/**
 * Sub-families for missing-mechanic rows — batch planning (same cause, many catalog ids).
 */

import type { ItemDef, MonsterDef, SpellDef } from "@d20-fireverse/content-schema";

export type GapFamilyRow = {
  family: string;
  kind: string;
  id: string;
  primaryBucket: string;
};

/** Work batch family for a spell still in the missing-mechanic queue. */
export function spellWorkFamily(spell: SpellDef, primaryBucket: string): string {
  if (primaryBucket === "spell_no_battlefield_effect" || primaryBucket === "spell_no_combat_ability") {
    return "spell_batch_note_or_wire";
  }
  const id = spell.id;
  if (isExplorationSpellId(id)) return "spell_batch_exploration_policy";
  if (/^hold_|^banish|^dominate_|^charm_|^sleep$|^bane$/.test(id) || id === "silence" || id === "darkness") {
    return "spell_batch_control";
  }
  if (/spirit_guardians|magic_weapon|shield_of_faith|blur|haste|enlarge|fly$|stoneskin|heroism/.test(id)) {
    return "spell_batch_buff_concentration";
  }
  if (spell.mechanics?.save && (spell.mechanics.area || /cone|sphere|line|cube|cylinder/i.test(spell.description))) {
    return "spell_batch_save_area";
  }
  if (spell.mechanics?.damage?.length || /\bray\b|bolt\b|missile/i.test(spell.name)) {
    return "spell_batch_damage";
  }
  if (/summon|conjure_|animate_|spiritual_weapon|flaming_sphere|arcane_sword|faithful_hound|unseen_servant/.test(id)) {
    return "spell_batch_summon_zone";
  }
  if (/heal|cure_|revivify|raise_|resurrection|restoration|spare_the_dying|prayer_of_healing/.test(id)) {
    return "spell_batch_heal";
  }
  if (spell.concentration) return "spell_batch_buff_other";
  if (primaryBucket === "review_not_modeled") return "spell_batch_review_other";
  return "spell_batch_misc";
}

export function itemWorkFamily(item: ItemDef, primaryBucket: string): string {
  if (primaryBucket === "item_grant_spell_unwired" || item.effects.some((e) => e.kind === "grant_spell")) {
    return "item_batch_grant_spell_chain";
  }
  if (primaryBucket === "item_drink_untyped" || item.effects.some((e) => e.kind === "haste_drink" || e.kind === "stat_drink")) {
    return "item_batch_drink";
  }
  if (/clairvoyance|mind_reading|diminution|growth|detect|scrying|plane/.test(item.id)) {
    return "item_batch_exploration_policy";
  }
  if (primaryBucket === "parser_unparsed_field" || item.effects.length === 0) {
    if (/wand_|staff_|scroll_|amulet_|ring_|cloak_|belt_|armor_|shield_/.test(item.id)) {
      return "item_batch_unparsed_magic_gear";
    }
    return "item_batch_unparsed_other";
  }
  if (primaryBucket === "item_engine_line" || item.effects.some((e) => e.kind === "on_hit_rider")) {
    return "item_batch_weapon_rider_charges";
  }
  if (primaryBucket === "review_not_modeled") return "item_batch_review_other";
  return "item_batch_misc";
}

export function monsterWorkFamily(monster: MonsterDef, primaryBucket: string): string {
  if (primaryBucket === "monster_not_compiled") return "monster_batch_compile_actions";
  const text = JSON.stringify(monster.actions ?? []).toLowerCase();
  if (/multiattack/.test(text)) return "monster_batch_multiattack";
  if (/breath|recharge/.test(text)) return "monster_batch_breath";
  if (/spellcasting|spell attack/.test(text)) return "monster_batch_spellcasting";
  if (/legendary/.test(JSON.stringify(monster.legendaryActions ?? []).toLowerCase())) {
    return "monster_batch_legendary";
  }
  if (primaryBucket === "monster_action_partial") return "monster_batch_extra_actions";
  return "monster_batch_misc";
}

export function workFamilyForKind(
  kind: string,
  id: string,
  game: unknown,
  primaryBucket: string,
): string {
  if (!game || typeof game !== "object") return `${kind}_batch_unknown`;
  switch (kind) {
    case "spell":
      return spellWorkFamily(game as SpellDef, primaryBucket);
    case "item":
      return itemWorkFamily(game as ItemDef, primaryBucket);
    case "monster":
      return monsterWorkFamily(game as MonsterDef, primaryBucket);
    default:
      return `${kind}_batch_other`;
  }
}

function isExplorationSpellId(id: string): boolean {
  return (
    /^detect_/.test(id) ||
    id === "identify" ||
    id === "comprehend_languages" ||
    id === "locate_object" ||
    id === "locate_creature" ||
    id === "locate_animals_or_plants" ||
    id === "find_traps" ||
    id === "find_the_path" ||
    id === "scrying" ||
    id === "commune" ||
    id === "augury" ||
    id === "divination" ||
    id === "legend_lore" ||
    id === "clairvoyance" ||
    /^speak_with_/.test(id) ||
    id === "teleport" ||
    id === "plane_shift" ||
    id === "astral_projection" ||
    id === "etherealness" ||
    id === "gate" ||
    id === "demiplane" ||
    id === "maze" ||
    id === "word_of_recall" ||
    id === "teleportation_circle" ||
    id === "dimension_door" ||
    id === "passwall" ||
    id === "wind_walk" ||
    id === "tree_stride" ||
    id === "transport_via_plants"
  );
}

/** Short label for CLI / docs. */
export const FAMILY_HINTS: Record<string, string> = {
  spell_batch_note_or_wire: "Implement combat effect (replace note stub) or wire ability",
  spell_batch_exploration_policy: "Exploration / out-of-combat — gap until exploration ships",
  spell_batch_control: "Control spells (save + condition / zones)",
  spell_batch_buff_concentration: "Concentration buffs — shared buff pipeline",
  spell_batch_save_area: "Save + area damage",
  spell_batch_damage: "Attack / targeted damage",
  spell_batch_summon_zone: "Summons & persistent zones",
  spell_batch_heal: "Healing / restoration",
  spell_batch_buff_other: "Other concentration effects",
  spell_batch_review_other: "Misc review notModeled lines",
  spell_batch_misc: "Spell — classify manually",
  item_batch_grant_spell_chain: "grant_spell + spell_* wired + charges",
  item_batch_drink: "Drink effects (typed schema)",
  item_batch_exploration_policy: "Exploration consumables — policy gap",
  item_batch_unparsed_magic_gear: "Magic gear with unparsed effects[]",
  item_batch_unparsed_other: "Other unparsed fields",
  item_batch_weapon_rider_charges: "Weapon riders / staff charges / on_hit",
  item_batch_review_other: "Item review notModeled",
  item_batch_misc: "Item — classify manually",
  monster_batch_compile_actions: "srd-monsters.ts — compile at least one action",
  monster_batch_multiattack: "Multiattack block",
  monster_batch_breath: "Breath weapon + recharge",
  monster_batch_spellcasting: "Innate spellcasting lists",
  monster_batch_legendary: "Legendary actions",
  monster_batch_extra_actions: "Single uncompiled actions (partial)",
  monster_batch_misc: "Monster — classify manually",
};
