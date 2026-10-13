import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emitCore } from "./emit-core.js";
import { monsterFromMarkdown, splitMonsterMarkdown } from "./parse-monsters.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

emitCore(root);

const sourcePath = path.join(root, "content", "srd", "monsters-A-Z.md");
const source = fs.readFileSync(sourcePath, "utf8");
const monsters = [];
const pending = [];
for (const chunk of splitMonsterMarkdown(source)) {
  const parsed = monsterFromMarkdown(chunk);
  if (parsed.monster) monsters.push(parsed.monster);
  else if (parsed.pending) pending.push(parsed.pending);
}

const outDir = path.join(root, "content", "srd-5.2.1");
fs.writeFileSync(path.join(outDir, "monsters.json"), `${JSON.stringify({ entries: monsters }, null, 2)}\n`);
const queue = path.join(outDir, "_queue");
fs.mkdirSync(queue, { recursive: true });
for (const row of pending) {
  fs.writeFileSync(path.join(queue, `${row.id || "unknown"}.pending.json`), `${JSON.stringify(row, null, 2)}\n`);
}
console.log(`monsters ${monsters.length}, queued ${pending.length}`);
