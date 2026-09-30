import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "../../..");
export const CONTENT_ROOT = path.join(REPO_ROOT, "content");
export const CAMPAIGN_DIR = path.join(
  CONTENT_ROOT,
  "campaigns",
  "luppolandia-brew",
);

function loadRootEnv(): void {
  const file = path.join(REPO_ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadRootEnv();

export const DATA_DIR = process.env.FIREVERSE_DATA_DIR
  ? path.resolve(process.env.FIREVERSE_DATA_DIR)
  : path.join(REPO_ROOT, "backend", "data");

export function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
