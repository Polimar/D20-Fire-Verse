/**
 * Dice entrance. A Fire TV plays filmed dice. Every other screen keeps the live 3D dice,
 * loaded only when that path is taken so the Stick never parses three.js.
 */

import { isD20 } from "./dice-copy";
import { onFireTv } from "./native";
import type { DiceRoll } from "./types";

export { isD20 };

type Live = typeof import("./dice3d");
type Film = typeof import("./dice-stick");

let live: Promise<Live> | null = null;
let film: Promise<Film> | null = null;

function path(): Promise<Live | Film> {
  if (onFireTv()) {
    film ??= import("./dice-stick");
    return film;
  }
  live ??= import("./dice3d");
  return live;
}

export function rollD20(roll: DiceRoll, opts: { extra?: DiceRoll[]; fast?: boolean; hold?: boolean } = {}): Promise<void> {
  return path().then((m) => m.rollD20(roll, opts));
}

export function showDamagePreview(dice: Array<{ sides: number; damageType: string }>): Promise<void> {
  return path().then((m) => m.showDamagePreview(dice));
}

export function throwDamage(rolls: DiceRoll[], opts: { fast?: boolean } = {}): Promise<void> {
  return path().then((m) => m.throwDamage(rolls, opts));
}

export function warmDice(): void {
  if (onFireTv()) return;
  void path().then((m) => m.warmDice());
}
