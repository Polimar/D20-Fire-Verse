/**
 * What a hero's class levels give it in a fight, read from the SRD 5.2.1 class table.
 * Numbers come from the table columns (Rages, Sneak Attack, Second Wind, ...) and feature names,
 * so an admin edit to the class record changes the fight.
 */

import type { ClassDef, SubclassDef } from "@d20-fireverse/content-schema";
import { subclassFeaturesUpTo } from "@d20-fireverse/rules";
import { catalogEntry } from "./content-catalog.js";

export type KitClass = { id: string; level: number; subclass?: string };

export type ClassKit = {
  /** Slugs of every class, subclass, and feat feature the hero has. */
  flags: string[];
  saves: string[];
  rages: number;
  rageDamage: number;
  /** Attacks beyond the first when taking the Attack action. */
  extraAttacks: number;
  secondWind: number;
  actionSurge: number;
  indomitable: number;
  fighterLevel: number;
  sneakDice: number;
  martialDie: string;
  focus: number;
  channelDivinity: number;
  bardicDie: string;
  sorceryPoints: number;
  /** Lowest natural d20 that is a critical hit on weapon attacks. */
  critMin: number;
  /** Extra speed in feet that needs no heavy armor. */
  fastMovementFt: number;
  /** Extra speed in feet that needs no armor and no shield. */
  unarmoredMovementFt: number;
};

export function slugFeature(name: string): string {
  return name.toLowerCase().replace(/['’]/g, "").replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function num(value: string | undefined): number {
  const n = Number((value ?? "").replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function dieCount(value: string | undefined): number {
  return Number(value?.match(/^(\d+)d\d+/i)?.[1] ?? 0);
}

function uses(features: string[], name: RegExp): number {
  const words: Record<string, number> = { one: 1, two: 2, three: 3 };
  let best = 0;
  for (const feature of features) {
    if (!name.test(feature)) continue;
    const word = feature.match(/\((one|two|three) uses?\)/i)?.[1]?.toLowerCase();
    best = Math.max(best, word ? words[word]! : 1);
  }
  return best;
}

export function emptyKit(): ClassKit {
  return {
    flags: [],
    saves: [],
    rages: 0,
    rageDamage: 0,
    extraAttacks: 0,
    secondWind: 0,
    actionSurge: 0,
    indomitable: 0,
    fighterLevel: 0,
    sneakDice: 0,
    martialDie: "",
    focus: 0,
    channelDivinity: 0,
    bardicDie: "",
    sorceryPoints: 0,
    critMin: 20,
    fastMovementFt: 0,
    unarmoredMovementFt: 0,
  };
}

/** Class features up to each class level, subclass features up to that level, then any feats the hero holds. */
export function buildKit(classes: KitClass[], heroFeatures: string[] = [], lookup = catalogLookup): ClassKit {
  const kit = emptyKit();
  const flags = new Set<string>();
  classes.forEach((entry, index) => {
    const def = lookup.cls(entry.id);
    if (!def) return;
    const rows = def.levels.filter((row) => row.level <= entry.level);
    const names = rows.flatMap((row) => row.features);
    const sub = entry.subclass ? lookup.sub(entry.subclass) : undefined;
    const subNames = sub ? subclassFeaturesUpTo(sub, entry.level) : [];
    for (const name of [...names, ...subNames]) flags.add(slugFeature(name));
    if (index === 0) kit.saves = [...def.saves];

    for (const row of rows) {
      const columns = row.columns ?? {};
      if (columns.rages) kit.rages = num(columns.rages);
      if (columns.rage_damage) kit.rageDamage = num(columns.rage_damage);
      if (columns.second_wind) kit.secondWind = num(columns.second_wind);
      if (columns.sneak_attack) kit.sneakDice = dieCount(columns.sneak_attack);
      if (columns.martial_arts) kit.martialDie = columns.martial_arts;
      if (columns.focus_points) kit.focus = num(columns.focus_points);
      if (columns.channel_divinity) kit.channelDivinity = num(columns.channel_divinity);
      if (columns.bardic_die) kit.bardicDie = columns.bardic_die.toLowerCase();
      if (columns.sorcery_points) kit.sorceryPoints = num(columns.sorcery_points);
      if (columns.unarmored_movement) kit.unarmoredMovementFt = num(columns.unarmored_movement);
    }

    kit.actionSurge = Math.max(kit.actionSurge, uses(names, /^action surge/i));
    kit.indomitable = Math.max(kit.indomitable, uses(names, /^indomitable/i));
    if (entry.id === "fighter") kit.fighterLevel = entry.level;
    const allNames = [...names, ...subNames];
    if (allNames.some((name) => /^extra attack$/i.test(name))) kit.extraAttacks = Math.max(kit.extraAttacks, 1);
    if (allNames.some((name) => /^two extra attacks$/i.test(name))) kit.extraAttacks = Math.max(kit.extraAttacks, 2);
    if (allNames.some((name) => /^three extra attacks$/i.test(name))) kit.extraAttacks = Math.max(kit.extraAttacks, 3);
    if (names.some((name) => /^fast movement$/i.test(name))) kit.fastMovementFt = 10;
    if (subNames.some((name) => /^improved critical$/i.test(name))) kit.critMin = Math.min(kit.critMin, 19);
    if (subNames.some((name) => /^superior critical$/i.test(name))) kit.critMin = Math.min(kit.critMin, 18);
  });
  for (const name of heroFeatures) flags.add(slugFeature(name));
  kit.flags = [...flags];
  return kit;
}

export const catalogLookup = {
  cls: (id: string) => catalogEntry<ClassDef>("class", id),
  sub: (id: string) => catalogEntry<SubclassDef>("subclass", id),
};

export function hasFlag(kit: Pick<ClassKit, "flags"> | undefined, flag: string): boolean {
  return Boolean(kit?.flags.includes(flag));
}
