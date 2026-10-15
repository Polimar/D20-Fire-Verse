/** Acid Arrow: initial acid now, 2d4 more at the start of the target's next turn. */

export const ACID_ARROW_SPELL_ID = "spell_acid_arrow";
export const ACID_ARROW_DELAYED_DICE = "2d4";
export const ACID_ARROW_DAMAGE_TYPE = "acid";

export type StartOfTurnDamage = {
  dice: string;
  damageType: string;
  label: string;
  sourceSpellId: string;
};

export type DelayedOnHit = {
  dice?: string;
  damageType?: string;
  timing?: string;
};

export function acidArrowInitialDice(slot: number): string {
  const extra = Math.max(0, slot - 2);
  return `${4 + extra}d4`;
}

export function delayedOnHitFromEffect(effect: Record<string, unknown> | undefined): DelayedOnHit | undefined {
  const delayed = effect?.delayedOnHit;
  if (!delayed || typeof delayed !== "object") return undefined;
  return delayed as DelayedOnHit;
}

export function queueStartOfTurnDamage(
  target: { startOfTurnDamage?: StartOfTurnDamage[] },
  delayed: DelayedOnHit,
  label: string,
  sourceSpellId: string,
): void {
  const dice = delayed.dice;
  if (!dice) return;
  target.startOfTurnDamage = [
    ...(target.startOfTurnDamage ?? []),
    {
      dice,
      damageType: delayed.damageType ?? ACID_ARROW_DAMAGE_TYPE,
      label,
      sourceSpellId,
    },
  ];
}

/** Drain pending start-of-turn damage. Dead tokens keep the queue for a later revive. */
export function takeStartOfTurnDamage(token: {
  dead?: boolean;
  startOfTurnDamage?: StartOfTurnDamage[];
}): StartOfTurnDamage[] {
  if (token.dead) return [];
  const pending = token.startOfTurnDamage ?? [];
  if (!pending.length) return [];
  token.startOfTurnDamage = undefined;
  return pending;
}
