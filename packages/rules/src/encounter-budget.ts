/** Procedural PvE only. Story fights and PvP do not use this budget. */

export function mortalThresholdCr(partyLevels: readonly number[]): number {
  if (!partyLevels.length) return 0;
  const sum = partyLevels.reduce((n, level) => n + level, 0);
  const everyoneLow = partyLevels.every((level) => level >= 1 && level <= 4);
  const divisor = everyoneLow ? 4 : 2;
  return sum / divisor;
}

export function targetBudgetCr(partyLevels: readonly number[]): number {
  return mortalThresholdCr(partyLevels) * 1.1;
}

export type BudgetMonster = { id: string; crValue: number };

export type ComposeInput = {
  targetBudgetCr: number;
  catalog: readonly BudgetMonster[];
  maxMonsters: number;
  rng?: () => number;
};

/** Greedy fill toward the budget. Fewer monsters when the map has fewer spawn slots. */
export function composeEncounter(input: ComposeInput): BudgetMonster[] {
  const rng = input.rng ?? Math.random;
  const pool = [...input.catalog].filter((m) => m.crValue > 0 && m.crValue <= input.targetBudgetCr + 0.001);
  const picked: BudgetMonster[] = [];
  let spent = 0;
  const cap = Math.max(0, input.maxMonsters);
  while (picked.length < cap && pool.length) {
    const room = input.targetBudgetCr - spent;
    const fit = pool.filter((m) => m.crValue <= room + 0.001);
    const choiceFrom = fit.length ? fit : [];
    if (!choiceFrom.length) break;
    const index = Math.floor(rng() * choiceFrom.length);
    const choice = choiceFrom[index];
    if (!choice) break;
    picked.push(choice);
    spent += choice.crValue;
    const at = pool.indexOf(choice);
    if (at >= 0) pool.splice(at, 1);
  }
  return picked;
}

export function testLevelOverride(mode: string, testLevel: number | undefined, realLevel: number): number {
  if (mode === "test" && testLevel != null && Number.isFinite(testLevel)) return testLevel;
  return realLevel;
}
