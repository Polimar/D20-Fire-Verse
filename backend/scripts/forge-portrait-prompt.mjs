#!/usr/bin/env node
/** Print prompt + id for the next missing forge portraits. usage: forge-portrait-prompt.mjs [count] */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pack = JSON.parse(readFileSync(path.join(root, "content/portraits/forge-pack.json"), "utf8"));
const have = new Set(
  readdirSync(path.join(root, "tv/public/art/portraits"))
    .filter((f) => f.startsWith("forge_") && f.endsWith(".webp"))
    .map((f) => f.replace(/\.webp$/, "")),
);
const n = Number(process.argv[2] || 8);
const out = [];
for (const speciesId of pack.species) {
  for (const classId of pack.classes) {
    for (const sex of pack.sexes) {
      for (const variant of pack.variants) {
        const id = `forge_${speciesId}_${classId}_${sex}_${variant}`;
        if (have.has(id)) continue;
        const species = pack.speciesLook[speciesId] ?? speciesId;
        const klass = pack.classLook[classId] ?? classId;
        const gender = pack.sexLook[sex] ?? sex;
        const vibe =
          variant === 1
            ? "slightly younger, brighter expression, warmer color accents"
            : "slightly older or grittier, cooler palette, different hair and face shape so it is clearly a second person";
        const prompt = [
          pack.style,
          `A ${gender} ${species}, ${klass}.`,
          "Bust portrait, head and shoulders, facing camera three-quarter view.",
          "Fantasy tabletop RPG character art, painted oil look, highly detailed face.",
          "No text, no UI, no watermark, no furry or anthropomorphic animal style.",
          vibe,
        ].join(" ");
        out.push({ id, prompt, speciesId, classId, sex, variant });
        if (out.length >= n) {
          console.log(JSON.stringify(out));
          process.exit(0);
        }
      }
    }
  }
}
console.log(JSON.stringify(out));
