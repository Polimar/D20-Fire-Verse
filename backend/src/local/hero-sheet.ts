import type { DerivedSheet } from "@d20-fireverse/protocol/builder";
import { deriveHero } from "@d20-fireverse/rules";
import { builderCatalog, classDefForBuilder } from "./builder-catalog.js";
import { equippedGear, getHero, listHeroes } from "./hero.js";
import { heroPregen } from "./hero-pregen.js";
import { getAbility } from "./campaign.js";

export function heroDerivedSheet(userId: string, heroId: string): DerivedSheet | null {
  const hero = getHero(heroId);
  if (!hero || hero.userId !== userId) return null;
  const catalog = builderCatalog();
  const cls = classDefForBuilder(hero.classes[0]?.id ?? "");
  const draft = {
    name: hero.name,
    classId: hero.classes[0]?.id ?? "fighter",
    speciesId: hero.species,
    backgroundId: hero.background,
    method: "standard_array" as const,
    baseAbilities: hero.abilities,
    classSkills: hero.skills.filter((s) => !catalog.backgrounds.find((b) => b.id === hero.background)?.skills.includes(s)),
    equipChoice: "A" as const,
  };
  const l1 = cls?.levels.find((row) => row.level === 1);
  const sheet = deriveHero(draft, catalog, cls ? { hitDie: cls.hitDie, saves: cls.saves, spellSlotsL1: l1?.spellSlots } : undefined);
  const pregen = heroPregen(heroId, getAbility);
  if (pregen) {
    sheet.ac = pregen.ac;
    sheet.attacks = pregen.weapons.map((wid) => {
      const gear = pregen.gear.weapons[wid];
      const mod = gear?.damage ?? 0;
      return {
        id: wid,
        name: wid.replace(/_/g, " "),
        attackBonus: (gear?.attack ?? 0) + (pregen.proficiencyBonus ?? 2),
        damage: `weapon + ${mod}`,
      };
    });
    if (!sheet.attacks.length) sheet.attacks = [{ id: "unarmed", name: "Unarmed", attackBonus: pregen.proficiencyBonus ?? 2, damage: "1 + STR" }];
  }
  const gear = equippedGear(hero);
  if (gear.length) sheet.warnings.push(`${gear.length} item(s) equipped or in stash.`);
  return sheet;
}

export function listHeroSheets(userId: string): Array<{ id: string; sheet: DerivedSheet }> {
  return listHeroes(userId)
    .map((h) => {
      const sheet = heroDerivedSheet(userId, h.id);
      return sheet ? { id: h.id, sheet } : null;
    })
    .filter((row): row is { id: string; sheet: DerivedSheet } => Boolean(row));
}
