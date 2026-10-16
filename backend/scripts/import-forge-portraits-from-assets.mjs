#!/usr/bin/env node
/** Import any forge_*.jpg/png from Cursor assets into tv/public/art/portraits as webp. */
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const assets =
  process.argv[2] ||
  path.join(process.env.HOME || "", ".cursor/projects/home-d20-D20-Fire-Verse/assets");
const destDir = path.join(root, "tv/public/art/portraits");
let imported = 0;
for (const file of readdirSync(assets)) {
  const m = /^(forge_[a-z0-9]+_[a-z0-9]+_[fm]_[12])\.(jpg|jpeg|png|webp)$/i.exec(file);
  if (!m) continue;
  const id = m[1];
  const dest = path.join(destDir, `${id}.webp`);
  if (existsSync(dest)) continue;
  await sharp(path.join(assets, file)).resize(512, 512, { fit: "cover", position: "centre" }).webp({ quality: 84 }).toFile(dest);
  imported += 1;
  console.log(dest);
}
console.log(`imported ${imported}`);
