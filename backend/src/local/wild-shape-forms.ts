import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./paths.js";

export type WildShapeForm = {
  id: string;
  label: string;
  minLevel: number;
  maxCr: number;
  ac: number;
  hp: number;
  speedCells: number;
  /** Combat ability ids from srd51_combat (beast attacks). */
  attacks?: string[];
};

/** SRD: max beast CR by druid level (combat slice). */
export function maxWildShapeCr(level: number): number {
  if (level >= 8) return 1;
  if (level >= 4) return 0.5;
  return 0.25;
}

/** 1 hour of Wild Shape ≈ 100 PC turns at 6 s per turn. */
export function wildShapeDurationPcTurns(druidLevel: number): number {
  const hours = Math.max(1, Math.floor(druidLevel / 2));
  return hours * 100;
}

let cache: WildShapeForm[] | null = null;

export function wildShapeForms(): WildShapeForm[] {
  if (cache) return cache;
  const file = path.join(REPO_ROOT, "content/rules/wild_shape_forms.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { forms: WildShapeForm[] };
  cache = raw.forms ?? [];
  return cache;
}

export function wildShapeForm(id: string): WildShapeForm | undefined {
  return wildShapeForms().find((f) => f.id === id);
}

export function legalWildShapeForms(level: number): WildShapeForm[] {
  const cap = maxWildShapeCr(level);
  return wildShapeForms().filter((f) => f.minLevel <= level && f.maxCr <= cap);
}
