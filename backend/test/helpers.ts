import { loadCampaign } from "../src/local/campaign.js";
import { loadChargen } from "../src/local/chargen.js";
import { builderCatalog } from "../src/local/builder-catalog.js";
import { resolveContent, setContentEnabled } from "../src/local/content-catalog.js";
import { ensureDataDir } from "../src/local/paths.js";

let booted = false;

export function boot(): void {
  if (booted) return;
  ensureDataDir();
  loadCampaign();
  loadChargen();
  booted = true;
}

/** Enable a spread of mastery weapons so martial builder drafts can pick unique properties. */
export function enableMasteryWeapons(): void {
  for (const id of [
    "greatsword",
    "greataxe",
    "longsword",
    "flail",
    "javelin",
    "pike",
    "battleaxe",
    "shortsword",
    "scimitar",
    "warhammer",
    "maul",
    "handaxe",
    "dagger",
    "longbow",
  ]) {
    try {
      resolveContent("item", id, { adminNote: "mastery test pool" });
      setContentEnabled("item", id, true);
    } catch {
      /* review-blocked or missing */
    }
  }
}

/** Distinct-property mastery weapon ids for a class (empty if the class has no L1 mastery). */
export function masteryPicksForClass(classId: string): string[] {
  enableMasteryWeapons();
  const catalog = builderCatalog();
  const cls = catalog.classes.find((c) => c.id === classId);
  if (!cls?.weaponMastery || cls.weaponMasteryCountL1 <= 0) return [];
  const picks: string[] = [];
  const props = new Set<string>();
  for (const w of catalog.masteryWeaponsByClass[classId] ?? []) {
    if (props.has(w.masteryId)) continue;
    picks.push(w.id);
    props.add(w.masteryId);
    if (picks.length >= cls.weaponMasteryCountL1) break;
  }
  return picks;
}

/** Replace Math.random with a script of d-faces for the next rolls: face(20, 1) → a natural 1 on a d20. */
export function scriptDice(faces: Array<[sides: number, face: number]>): () => void {
  const original = Math.random;
  const queue = [...faces];
  Math.random = () => {
    const next = queue.shift();
    if (!next) return original();
    const [sides, face] = next;
    return (face - 1 + 0.5) / sides;
  };
  return () => {
    Math.random = original;
  };
}
