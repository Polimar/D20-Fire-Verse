/** Level from the SRD XP table. The thresholds live in content JSON; this file only walks them. */

export function levelForXp(xp: number, thresholds: readonly number[]): number {
  const safe = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let level = 1;
  for (let i = 0; i < thresholds.length; i += 1) {
    if (safe >= (thresholds[i] ?? Number.POSITIVE_INFINITY)) level = i + 1;
  }
  return Math.min(20, Math.max(1, level));
}

export function thresholdForLevel(level: number, thresholds: readonly number[]): number {
  const idx = Math.min(20, Math.max(1, level)) - 1;
  return thresholds[idx] ?? 0;
}

/** A loss never drops the hero under the XP they already needed for this level. */
export function xpAfterLoss(xp: number, delta: number, level: number, thresholds: readonly number[]): number {
  const floor = thresholdForLevel(level, thresholds);
  return Math.max(floor, xp + delta);
}

export function averageHitDie(hitDie: number): number {
  return Math.floor(hitDie / 2) + 1;
}

/** Level 1 is the full die. Later levels use the SRD average, plus Constitution each level. */
export function hitPointsAtLevel(hitDie: number, classLevel: number, conMod: number): number {
  const levels = Math.max(1, classLevel);
  const later = Math.max(0, levels - 1) * (averageHitDie(hitDie) + conMod);
  return Math.max(1, hitDie + conMod + later);
}
