/**
 * Reports schema problems and a non-empty admin queue.
 * Exit code is always 0: a bad file must not block a merge.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { issuesFor, pendingEntry } from "@d20-fireverse/content-schema";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dir = path.join(root, "content", "srd-5.2.1");

function walk(folder: string): string[] {
  if (!fs.existsSync(folder)) return [];
  const out: string[] = [];
  for (const name of fs.readdirSync(folder)) {
    const full = path.join(folder, name);
    if (fs.statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith(".json")) out.push(full);
  }
  return out;
}

let problems = 0;
for (const file of walk(dir)) {
  const base = path.basename(file);
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    problems += 1;
    console.log(`${path.relative(root, file)}: ${err instanceof Error ? err.message : "bad json"}`);
    continue;
  }
  if (base.endsWith(".pending.json")) {
    const parsed = pendingEntry.safeParse(data);
    if (!parsed.success) {
      problems += 1;
      console.log(`${path.relative(root, file)}: pending entry does not match the queue schema`);
    }
    continue;
  }
  const issues = issuesFor(base, data);
  for (const issue of issues) {
    problems += 1;
    console.log(`${path.relative(root, file)}: ${issue}`);
  }
}
console.log(problems ? `content:validate reported ${problems} problem(s). Merge is not blocked.` : "content:validate clean.");
process.exit(0);
