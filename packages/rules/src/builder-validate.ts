import type { AbilityKey } from "./content-types.js";

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;
export const POINT_BUY_BUDGET = 27;
const PB_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

const ABILITIES: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

export function validateBaseAbilities(
  method: "standard_array" | "point_buy" | "roll",
  base: Record<AbilityKey, number>,
): string | null {
  const scores = ABILITIES.map((a) => base[a]);
  if (scores.some((s) => !Number.isInteger(s))) return "BAD_ABILITIES";
  if (method === "standard_array") {
    const sorted = [...scores].sort((a, b) => b - a);
    const want = [...STANDARD_ARRAY].sort((a, b) => b - a);
    if (sorted.some((v, i) => v !== want[i])) return "STANDARD_ARRAY_MISMATCH";
    return null;
  }
  if (method === "point_buy") {
    let spent = 0;
    for (const s of scores) {
      if (s < 8 || s > 15) return "POINT_BUY_RANGE";
      spent += PB_COST[s] ?? 99;
    }
    if (spent > POINT_BUY_BUDGET) return "POINT_BUY_OVER";
    return null;
  }
  if (scores.some((s) => s < 3 || s > 18)) return "ROLL_RANGE";
  return null;
}

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}
