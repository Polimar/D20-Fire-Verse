#!/usr/bin/env node
/** Import a generated portrait into the forge pack as square webp. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = process.argv[2];
const id = process.argv[3];
if (!src || !id) {
  console.error("usage: import-forge-portrait.mjs <image> <forge_species_class_sex_n>");
  process.exit(1);
}
if (!/^forge_[a-z0-9]+_[a-z0-9]+_[fm]_[12]$/.test(id)) {
  console.error("id must look like forge_orc_barbarian_m_1");
  process.exit(1);
}
const dest = path.join(root, "tv", "public", "art", "portraits", `${id}.webp`);
await sharp(src).resize(512, 512, { fit: "cover", position: "centre" }).webp({ quality: 84 }).toFile(dest);
console.log(dest);
