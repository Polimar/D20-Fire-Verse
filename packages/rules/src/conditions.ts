/**
 * SRD 2024 / PHB mechanical reference (our summaries). Fifteen conditions + exhaustion tiers.
 */

export const CONDITION_IDS = [
  "blinded",
  "charmed",
  "deafened",
  "exhaustion",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
] as const;

export type ConditionId = (typeof CONDITION_IDS)[number];

/** 2024 exhaustion: level 0–6 (6 = death). */
export type ExhaustionTier = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function clampExhaustion(level: number): ExhaustionTier {
  if (level <= 0) return 0;
  if (level >= 6) return 6;
  return level as ExhaustionTier;
}

export function exhaustionTier(conditions: string[], level?: number): ExhaustionTier {
  if (level != null) return clampExhaustion(level);
  if (!conditions.includes("exhaustion")) return 0;
  return 1;
}

export function setExhaustion(conditions: string[], tier: ExhaustionTier): string[] {
  const rest = conditions.filter((c) => c !== "exhaustion");
  if (tier <= 0) return rest;
  return [...rest, "exhaustion"];
}

/** Disadvantage on ability checks (exhaustion 1+). */
export function checkDisadvantage(conditions: string[], exhaustionLevel = 0): boolean {
  const tier = exhaustionTier(conditions, exhaustionLevel);
  return (
    conditions.includes("poisoned") ||
    conditions.includes("frightened") ||
    tier >= 1 ||
    conditions.includes("restrained")
  );
}

/** Disadvantage on attack rolls. */
export function attackDisadvantage(conditions: string[], exhaustionLevel = 0): boolean {
  const tier = exhaustionTier(conditions, exhaustionLevel);
  return (
    attackDisadvantageFromConditions(conditions) ||
    tier >= 3
  );
}

export function attackDisadvantageFromConditions(conditions: string[]): boolean {
  return (
    conditions.includes("poisoned") ||
    conditions.includes("frightened") ||
    conditions.includes("blinded") ||
    conditions.includes("prone") ||
    conditions.includes("restrained") ||
    conditions.includes("stunned")
  );
}

/** Advantage on attack rolls against a target. */
export function attackAdvantageAgainst(conditions: string[]): boolean {
  return (
    conditions.includes("prone") ||
    conditions.includes("paralyzed") ||
    conditions.includes("stunned") ||
    conditions.includes("unconscious") ||
    conditions.includes("restrained")
  );
}

/** Speed multiplier (1 = normal). Exhaustion 2: speed halved; 5: speed 0. */
export function speedMultiplier(conditions: string[], exhaustionLevel = 0): number {
  const tier = exhaustionTier(conditions, exhaustionLevel);
  if (conditions.includes("grappled") || conditions.includes("restrained")) return 0;
  if (tier >= 5) return 0;
  if (tier >= 2) return 0.5;
  return 1;
}

/** Charmed creatures cannot attack the charmer (combat applies the attack block). */
export function charmedBlocksHostile(conditions: string[]): boolean {
  return conditions.includes("charmed");
}

export function cannotAct(conditions: string[], exhaustionLevel = 0): boolean {
  const tier = exhaustionTier(conditions, exhaustionLevel);
  return (
    conditions.includes("incapacitated") ||
    conditions.includes("paralyzed") ||
    conditions.includes("stunned") ||
    conditions.includes("unconscious") ||
    conditions.includes("petrified") ||
    tier >= 5
  );
}

export function saveDisadvantage(conditions: string[], exhaustionLevel = 0): boolean {
  const tier = exhaustionTier(conditions, exhaustionLevel);
  return checkDisadvantage(conditions, exhaustionLevel) || tier >= 3;
}

/** HP max multiplier from exhaustion 4 (0.5). */
export function hpMaxMultiplier(exhaustionLevel: number): number {
  const tier = clampExhaustion(exhaustionLevel);
  return tier >= 4 ? 0.5 : 1;
}

export function longRestExhaustionDelta(current: number): number {
  return clampExhaustion(current) > 0 ? clampExhaustion(current) - 1 : 0;
}

export function effectiveMaxHp(baseMaxHp: number, exhaustionLevel: number): number {
  return Math.max(1, Math.floor(baseMaxHp * hpMaxMultiplier(exhaustionLevel)));
}

export function exhaustionKills(exhaustionLevel: number): boolean {
  return clampExhaustion(exhaustionLevel) >= 6;
}
