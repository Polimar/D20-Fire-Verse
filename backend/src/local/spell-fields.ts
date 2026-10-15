/** Concentration, zones, repeat saves, polymorph, and summons shared by combat casts. */

export type SpellLink = {
  condition: string;
  spellId: string;
  by: string;
  saveAbility: string;
  saveDc: number;
  repeat: boolean;
};

export type SpellZone = {
  id: string;
  by: string;
  spellId: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  saveAbility: string;
  dc: number;
  dice: string;
  damageType: string;
  half: boolean;
  /** Creatures already hurt by this zone during the current turn index. */
  touched: string[];
  turnKey?: string;
};

export type FieldToken = {
  id: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  ac: number;
  dead?: boolean;
  kind: string;
  speedCells: number;
  conditions?: string[];
  spellLinks?: SpellLink[];
  polymorphBackup?: { hp: number; maxHp: number; ac: number; name: string; actionIds: string[]; bonusActionIds: string[] };
  actionIds: string[];
  bonusActionIds: string[];
  summonOwner?: string;
  summonSpellId?: string;
  blessed?: boolean;
  blur?: boolean;
  invisible?: boolean;
  acBonus?: number;
  acFloor?: number;
  brand?: { by: string };
};

export function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function dropCondition(token: FieldToken, condition: string): void {
  token.conditions = (token.conditions ?? []).filter((c) => c !== condition);
}

export function clearCasterSpell(tokens: FieldToken[], ownerId: string, spellId: string | undefined): void {
  for (const token of tokens) {
    const keep: SpellLink[] = [];
    for (const link of token.spellLinks ?? []) {
      if (link.by === ownerId && (!spellId || link.spellId === spellId)) dropCondition(token, link.condition);
      else keep.push(link);
    }
    token.spellLinks = keep.length ? keep : undefined;
    if (token.brand?.by === ownerId) token.brand = undefined;
    if (token.polymorphBackup && token.summonSpellId === spellId) {
      /* polymorph backup is on the target, not keyed only by summonSpellId */
    }
  }
}

export function restorePolymorph(token: FieldToken): void {
  const saved = token.polymorphBackup;
  if (!saved) return;
  token.hp = Math.min(saved.hp, saved.maxHp);
  token.maxHp = saved.maxHp;
  token.ac = saved.ac;
  token.name = saved.name;
  token.actionIds = saved.actionIds;
  token.bonusActionIds = saved.bonusActionIds;
  token.polymorphBackup = undefined;
}

export function zonesFor(zones: SpellZone[] | undefined, ownerId: string): SpellZone[] {
  return (zones ?? []).filter((z) => z.by !== ownerId);
}
