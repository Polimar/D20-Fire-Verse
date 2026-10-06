/** Words on the dice banner. Shared by the 3D table and the Fire TV film. */

import type { DiceRoll } from "./types";

export function keptFace(roll: DiceRoll): number {
  if (roll.kept != null && roll.values[roll.kept] != null) return roll.values[roll.kept]!;
  return roll.values[0] ?? 1;
}

function outcomeWord(roll: DiceRoll): string {
  if (roll.purpose === "save") {
    if (roll.outcome === "success") return "SAVED";
    if (roll.outcome === "fail") return "FAILED";
  }
  switch (roll.outcome) {
    case "crit":
      return "CRITICAL HIT";
    case "fumble":
      return "FUMBLE";
    case "hit":
      return "HIT";
    case "miss":
      return "MISS";
    case "success":
      return "SUCCESS";
    case "fail":
      return "FAIL";
    default:
      return "";
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export function describeRoll(roll: DiceRoll): { headline: string; detail: string } {
  const natural = keptFace(roll);
  const mod = roll.modifier ? `${roll.modifier > 0 ? "+" : "−"} ${Math.abs(roll.modifier)}` : "";
  const vs = roll.vs ? ` vs ${roll.vs.kind} ${roll.vs.value}` : "";
  const word = outcomeWord(roll);
  const headline = `${roll.total}${vs}${word ? ` — ${word}` : ""}`;
  const pair =
    roll.values.length === 2 && roll.sides.every((s) => s === 20)
      ? ` · rolled ${roll.values.join(" and ")}, kept ${natural}`
      : "";
  const detail = `d20 ${natural}${mod ? ` ${mod}` : ""}${pair}`;
  return { headline, detail };
}

export function rollTone(roll: DiceRoll): string {
  const natural = keptFace(roll);
  const crit = roll.outcome === "crit" || (roll.isCrit && natural === 20);
  const fumble = roll.outcome === "fumble" || (roll.isFumble && natural === 1);
  if (crit) return "crit";
  if (fumble) return "fumble";
  if (roll.outcome === "hit" || roll.outcome === "success") return "good";
  if (roll.outcome) return "bad";
  return "neutral";
}

export function attackBanner(roll: DiceRoll, extra: DiceRoll[]): { className: string; html: string } {
  const { headline, detail } = describeRoll(roll);
  const damage = extra
    .filter((r) => r.purpose === "damage" || r.purpose === "heal")
    .map((r) => `<span class="dice-dmg ${r.purpose}">${r.purpose === "heal" ? "Heals" : "Damage"} ${escapeHtml(r.notation)} → <strong>${r.total}</strong></span>`)
    .join("");
  return {
    className: `dice-banner show ${rollTone(roll)}`,
    html: `
      <p class="dice-who">${escapeHtml(roll.roller)} · ${escapeHtml(roll.label ?? roll.purpose)}</p>
      <p class="dice-headline">${escapeHtml(headline)}</p>
      <p class="dice-detail">${escapeHtml(detail)}</p>
      ${damage ? `<p class="dice-damage">${damage}</p>` : ""}
    `,
  };
}

function typeTitle(t: string): string {
  if (!t) return "Damage";
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function damageBanner(rolls: DiceRoll[]): { className: string; html: string } {
  const parts = rolls
    .filter((r) => r.purpose === "damage" || r.purpose === "heal")
    .map((r) => {
      const kind = r.purpose === "heal" ? "heal" : r.damageType ?? "";
      const name = r.purpose === "heal" ? "Heals" : typeTitle(r.damageType ?? r.label ?? "Damage");
      const mod = r.modifier ? ` ${r.modifier > 0 ? "+" : "−"}${Math.abs(r.modifier)}` : "";
      return `<span class="dice-dmg ${r.purpose} ${kind}">${escapeHtml(name)} ${escapeHtml(r.notation)}${mod} → <strong>${r.total}</strong></span>`;
    })
    .join("");
  const total = rolls.reduce((a, r) => a + (r.purpose === "damage" || r.purpose === "heal" ? r.total : 0), 0);
  const who = rolls[0]?.roller ?? "Damage";
  return {
    className: "dice-banner show good",
    html: `
      <p class="dice-who">${escapeHtml(who)} · Damage</p>
      <p class="dice-headline">${total}</p>
      <p class="dice-detail">All dice in one throw</p>
      ${parts ? `<p class="dice-damage">${parts}</p>` : ""}
    `,
  };
}

export function isD20(roll: DiceRoll | null | undefined): roll is DiceRoll {
  return !!roll && roll.sides?.length > 0 && roll.sides.every((s) => s === 20) && roll.values.length <= 2;
}
