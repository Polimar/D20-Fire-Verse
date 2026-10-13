/**
 * Vendor the downfallx SRD markdown once. Writes content/srd/VENDOR_SHA.
 * Later edits happen in /admin; this script is the one-time source pull.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILES = [
  "spells.md",
  "classes.md",
  "character-origins.md",
  "equipment.md",
  "magic-items.md",
  "feats.md",
  "monsters-A-Z.md",
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dir = path.join(root, "content", "srd");

async function headSha(): Promise<string> {
  const res = await fetch("https://api.github.com/repos/downfallx/dnd-5e-srd-markdown/commits/HEAD");
  if (!res.ok) throw new Error(`downfallx HEAD ${res.status}`);
  const body = (await res.json()) as { sha: string };
  return body.sha;
}

export async function syncDownfallx(): Promise<string> {
  fs.mkdirSync(dir, { recursive: true });
  const sha = await headSha();
  for (const file of FILES) {
    const res = await fetch(`https://raw.githubusercontent.com/downfallx/dnd-5e-srd-markdown/${sha}/${file}`);
    if (!res.ok) throw new Error(`${file} ${res.status}`);
    fs.writeFileSync(path.join(dir, file), await res.text());
  }
  fs.writeFileSync(path.join(dir, "VENDOR_SHA"), `${sha}\n`);
  return sha;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sha = await syncDownfallx();
  console.log(`content:sync-srd ${sha}`);
}
