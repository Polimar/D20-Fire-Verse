/**
 * Extract L1–3 class feature prose from SRD review sidecars (CC-BY).
 * Headings look like: #### Level 1: Rage
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./paths.js";

const cache = new Map<string, Record<string, string>>();

function reviewPath(classId: string): string {
  return join(REPO_ROOT, "content", "srd-5.2.1", "review", "class", `${classId}.json`);
}

export function classFeatureBlurbs(classId: string, maxLevel = 3): Record<string, string> {
  const key = `${classId}:${maxLevel}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const path = reviewPath(classId);
  const out: Record<string, string> = {};
  if (!existsSync(path)) {
    cache.set(key, out);
    return out;
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { srd?: { text?: string } };
    const text = raw.srd?.text ?? "";
    const re = /#### Level (\d+): ([^\n]+)\n([\s\S]*?)(?=\n#### Level |\n### |\n## |$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const level = Number(m[1]);
      if (level < 1 || level > maxLevel) continue;
      const name = m[2]!.trim();
      const body = m[3]!.trim().replace(/\n{3,}/g, "\n\n");
      if (name && body) out[name] = body;
    }
  } catch {
    /* ignore bad review */
  }
  cache.set(key, out);
  return out;
}
