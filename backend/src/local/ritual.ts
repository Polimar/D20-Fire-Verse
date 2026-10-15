/**
 * Ritual casting outside a fight. A ritual spell the hero has prepared, or in a wizard book, spends no slot.
 */

import type { SpellDef } from "@d20-fireverse/content-schema";
import { catalogEntry } from "./content-catalog.js";
import { getHero } from "./hero.js";
import { buildKit } from "./class-kit.js";

export function castRitual(userId: string, heroId: string, spellId: string): { spellId: string; name: string; minutes: number; slotSpent: false } {
  const hero = getHero(heroId);
  if (!hero || hero.userId !== userId) throw new Error("BAD_CHARACTER");
  const spell = catalogEntry<SpellDef>("spell", spellId);
  if (!spell?.ritual) throw new Error("NOT_RITUAL");
  const kit = buildKit(hero.classes, hero.features);
  const prepared = new Set([...hero.spellsPrepared, ...hero.spells, ...hero.cantrips]);
  const inBook = hero.spellbook.includes(spellId);
  const wizardBook = kit.flags.includes("ritual_adept") && inBook;
  if (!prepared.has(spellId) && !wizardBook) throw new Error("BAD_SPELL");
  return { spellId, name: spell.name, minutes: spell.level === 0 ? 10 : 10 + spell.level * 10, slotSpent: false };
}
