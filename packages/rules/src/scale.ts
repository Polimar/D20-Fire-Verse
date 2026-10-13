/**
 * LevelSync for a campaign that already started.
 * The cap is the party size at the door. Disconnects do not change it.
 * Known features and spells stay; HP, attack, damage and slots scale down to the cap.
 */

export type ScaleInput = {
  level: number;
  maxHp: number;
  attackBonus: number;
  damageBonus: number;
  slots: Record<string, number>;
  features: string[];
  spells: string[];
};

export type ScaleOutput = ScaleInput & { levelCap: number };

export function scaleToCap(hero: ScaleInput, levelCap: number, slotsAtCap: Record<string, number>): ScaleOutput {
  const cap = Math.max(1, Math.min(20, levelCap));
  if (hero.level <= cap) return { ...hero, levelCap: cap, slots: { ...hero.slots } };
  const ratio = cap / hero.level;
  return {
    level: cap,
    levelCap: cap,
    maxHp: Math.max(1, Math.floor(hero.maxHp * ratio)),
    attackBonus: hero.attackBonus - Math.max(0, Math.floor((hero.level - cap) / 4)),
    damageBonus: Math.max(0, Math.floor(hero.damageBonus * ratio)),
    slots: { ...slotsAtCap },
    features: [...hero.features],
    spells: [...hero.spells],
  };
}
