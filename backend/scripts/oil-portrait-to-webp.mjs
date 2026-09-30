#!/usr/bin/env node
/** Convert a generated oil portrait to square webp next to the TV portraits. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = process.argv[2];
const id = process.argv[3];
if (!src || !id) {
  console.error("usage: oil-portrait-to-webp.mjs <image> <srd_id>");
  process.exit(1);
}
const dest = path.join(root, "tv/public/art/portraits", `${id}.webp`);
await sharp(src).resize(512, 512, { fit: "cover", position: "centre" }).webp({ quality: 82 }).toFile(dest);
console.log(dest);
