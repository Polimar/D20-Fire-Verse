/**
 * Maps every SRD class and subclass feature name to a coverage status.
 * A feature is "runs" only when class-runtime.ts (or the pack A fight code) handles its slug.
 */

import { slugFeature } from "./class-kit.js";
import { HANDLED } from "./feature-handled.js";

export type FeatureCoverage = "runs" | "partial" | "missing" | "progression" | "no_combat";

const PROGRESSION =
  /ability score improvement|subclass feature|epic boon|fighting style|additional fighting style|magical secrets|eldritch invocations|divine order|primal order|deft explorer|primal knowledge|bonus proficiencies|hunter's lore|spells$/i;

const SUBCLASS_PICK = /subclass$/i;

const FLAVOR = new Set(["druidic", "slow_fall", "thieves_cant"]);

export function featureStatus(name: string): { status: FeatureCoverage; note: string } {
  const slug = slugFeature(name);
  if (PROGRESSION.test(name) || SUBCLASS_PICK.test(name)) {
    return { status: "progression", note: "Chosen when you level, then stored on the hero" };
  }
  if (FLAVOR.has(slug)) return { status: "no_combat", note: HANDLED[slug] ?? "No grid effect" };
  const note = HANDLED[slug];
  if (note) return { status: "runs", note };
  return { status: "partial", note: `No handler for ${slug}` };
}

export function featureSlug(name: string): string {
  return slugFeature(name);
}
