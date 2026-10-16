/**
 * Forge portrait pack: 2 variants per species × class × sex.
 * Files live at tv/public/art/portraits/forge_{species}_{class}_{sex}_{n}.webp
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./paths.js";
import { portraitUrl } from "./portraits.js";

export type ForgeSex = "f" | "m";

type Pack = {
  species: string[];
  classes: string[];
  sexes: ForgeSex[];
  variants: number[];
  speciesLook: Record<string, string>;
  classLook: Record<string, string>;
  sexLook: Record<string, string>;
  style: string;
};

let packCache: Pack | null = null;

export function forgePack(): Pack {
  if (packCache) return packCache;
  const path = join(REPO_ROOT, "content", "portraits", "forge-pack.json");
  packCache = JSON.parse(readFileSync(path, "utf8")) as Pack;
  return packCache;
}

export function forgePortraitId(speciesId: string, classId: string, sex: ForgeSex, variant: 1 | 2): string {
  return `forge_${speciesId}_${classId}_${sex}_${variant}`;
}

export function parseForgePortraitId(
  id: string,
): { speciesId: string; classId: string; sex: ForgeSex; variant: number } | null {
  if (!id.startsWith("forge_")) return null;
  const parts = id.slice("forge_".length).split("_");
  if (parts.length !== 4) return null;
  const [speciesId, classId, sex, variantRaw] = parts;
  if (!speciesId || !classId || (sex !== "f" && sex !== "m")) return null;
  const variant = Number(variantRaw);
  if (variant !== 1 && variant !== 2) return null;
  return { speciesId, classId, sex, variant };
}

export function isForgePortraitId(id: string): boolean {
  return parseForgePortraitId(id) != null;
}

export function forgePortraitPath(id: string): string {
  return join(REPO_ROOT, "tv", "public", "art", "portraits", `${id}.webp`);
}

export function forgePortraitExists(id: string): boolean {
  return existsSync(forgePortraitPath(id));
}

/** Portraits on disk for the forge pack (incomplete pack OK). */
export function listForgePortraitsOnDisk(): Array<{
  id: string;
  url: string;
  speciesId: string;
  classId: string;
  sex: ForgeSex;
  variant: number;
}> {
  const pack = forgePack();
  const out: Array<{
    id: string;
    url: string;
    speciesId: string;
    classId: string;
    sex: ForgeSex;
    variant: number;
  }> = [];
  for (const speciesId of pack.species) {
    for (const classId of pack.classes) {
      for (const sex of pack.sexes) {
        for (const variant of pack.variants) {
          const id = forgePortraitId(speciesId, classId, sex, variant as 1 | 2);
          if (!forgePortraitExists(id)) continue;
          out.push({ id, url: portraitUrl(id), speciesId, classId, sex, variant });
        }
      }
    }
  }
  return out;
}

export function forgePortraitPrompt(speciesId: string, classId: string, sex: ForgeSex, variant: 1 | 2): string {
  const pack = forgePack();
  const species = pack.speciesLook[speciesId] ?? speciesId;
  const klass = pack.classLook[classId] ?? classId;
  const gender = pack.sexLook[sex] ?? sex;
  const vibe =
    variant === 1
      ? "slightly younger, brighter expression, warmer color accents"
      : "slightly older or grittier, cooler palette, different hair and face shape so it is clearly a second person";
  return [
    pack.style,
    `A ${gender} ${species}, ${klass}.`,
    "Bust portrait, head and shoulders, facing camera three-quarter view.",
    "Fantasy tabletop RPG character art, painted oil look, highly detailed face.",
    "No text, no UI, no watermark, no furry or anthropomorphic animal style.",
    vibe,
  ].join(" ");
}

export function expectedForgePortraitCount(): number {
  const pack = forgePack();
  return pack.species.length * pack.classes.length * pack.sexes.length * pack.variants.length;
}
