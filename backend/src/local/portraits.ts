/** Painted portraits shipped in tv/public/art/portraits. */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./paths.js";

export const PORTRAITS = [
  "brenna_ironveal",
  "quill_ashmere",
  "mira_softstep",
  "torin_emberhand",
  "cg_dragonborn",
  "cg_tiefling",
  "cg_halforc",
  "cg_woodelf",
  "cg_bard",
  "cg_gnome",
  "glowkindle",
  "messenger",
] as const;

export type PortraitId = (typeof PORTRAITS)[number] | string;

export function portraitUrl(id: string): string {
  return `/art/portraits/${id}.webp`;
}

export function isLegacyPortraitId(id: unknown): id is (typeof PORTRAITS)[number] {
  return typeof id === "string" && (PORTRAITS as readonly string[]).includes(id);
}

/** Legacy named portraits or forge pack ids (`forge_species_class_sex_n`). */
export function isPortraitId(id: unknown): id is PortraitId {
  if (typeof id !== "string" || !id) return false;
  if (isLegacyPortraitId(id)) return true;
  return /^forge_[a-z0-9]+_[a-z0-9]+_[fm]_[12]$/.test(id);
}

/** A sensible face for a forged hero who didn't pick one. Prefers forge pack when on disk. */
export function defaultPortrait(raceId: string, classId: string, sex: "f" | "m" = "f"): PortraitId {
  const forgeId = `forge_${raceId}_${classId}_${sex}_1`;
  if (
    /^forge_[a-z0-9]+_[a-z0-9]+_[fm]_[12]$/.test(forgeId) &&
    existsSync(join(REPO_ROOT, "tv", "public", "art", "portraits", `${forgeId}.webp`))
  ) {
    return forgeId;
  }
  if (raceId === "dragonborn") return "cg_dragonborn";
  if (raceId === "tiefling") return "cg_tiefling";
  if (raceId === "half_orc") return "cg_halforc";
  if (raceId === "wood_elf") return "cg_woodelf";
  if (raceId === "rock_gnome") return "cg_gnome";
  if (raceId === "hill_dwarf" || raceId === "mountain_dwarf") return "torin_emberhand";
  if (raceId.endsWith("halfling")) return "mira_softstep";
  if (raceId === "high_elf" || raceId === "half_elf") return "quill_ashmere";
  if (classId === "bard" || classId === "warlock" || classId === "sorcerer") return "cg_bard";
  return "brenna_ironveal";
}
