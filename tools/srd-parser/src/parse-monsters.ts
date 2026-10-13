/**
 * Full SRD 5.2.1 stat blocks: every "### Name" block under "## Group" that has an AC line.
 * Descriptive data for the admin; the combat engine compiles its own runnable copy in backend/src/local/srd-monsters.ts.
 */

import type { MonsterAction, MonsterDef } from "@d20-fireverse/content-schema";
import { abilityFromWord, cleanDice, conditionsIn, damageParts, flat, plainMarkdown, signed, slug, type Ability } from "./srd-text.js";

export type MonsterBlock = { group: string; name: string; body: string };

export function splitMonsterMarkdown(source: string): MonsterBlock[] {
  const blocks: MonsterBlock[] = [];
  let group = "";
  for (const part of source.split(/\n(?=#{2,3} )/)) {
    const heading = part.match(/^(#{2,3}) (.+)$/m);
    if (!heading || part.indexOf(heading[0]) !== 0) continue;
    if (heading[1] === "##") {
      group = heading[2]!.trim();
      continue;
    }
    const name = heading[2]!.trim();
    const body = part.slice(heading[0].length);
    if (/\*\*AC\*\*/.test(body)) blocks.push({ group, name, body });
  }
  return blocks;
}

export function crValue(cr: string): number {
  if (cr.includes("/")) {
    const [a, b] = cr.split("/").map(Number);
    return b ? (a ?? 0) / b : 0;
  }
  const n = Number(cr);
  return Number.isFinite(n) ? n : 0;
}

function line(body: string, label: string): string | undefined {
  const m = body.match(new RegExp(`\\*\\*${label}\\*\\*\\s+([^\\n]+?)(?:\\s*<br>)?\\s*$`, "m"));
  return m?.[1] ? flat(m[1]) : undefined;
}

/** STR..CHA rows of score, MOD, SAVE. A row missing its score (the vendored Will-o'-Wisp) is rebuilt from MOD and flagged. */
function abilityTable(body: string): { scores: Partial<Record<Ability, number>>; saves: Partial<Record<Ability, number>>; malformed: Ability[] } {
  const scores: Partial<Record<Ability, number>> = {};
  const saves: Partial<Record<Ability, number>> = {};
  const malformed: Ability[] = [];
  const isKey = (cell: string | undefined) => ["str", "dex", "con", "int", "wis", "cha"].includes((cell ?? "").toLowerCase());
  const cells = [...body.matchAll(/<td>([\s\S]*?)<\/td>/gi)]
    .map((m) => m[1]!.replace(/<[^>]+>/g, "").trim())
    .filter((cell, k, all) => !(isKey(cell) && cell === all[k + 1]));
  for (let i = 0; i + 2 < cells.length; i += 1) {
    if (!isKey(cells[i])) continue;
    const ability = cells[i]!.toLowerCase() as Ability;
    const score = Number(cells[i + 1]);
    if (Number.isInteger(score) && score >= 1 && score <= 30 && !isKey(cells[i + 3])) {
      scores[ability] = score;
      saves[ability] = signed(cells[i + 3] ?? "0");
      i += 3;
      continue;
    }
    const mod = signed(cells[i + 1]!);
    scores[ability] = Math.min(30, Math.max(1, 10 + 2 * mod));
    saves[ability] = signed(cells[i + 2]!);
    malformed.push(ability);
    i += 2;
  }
  return { scores, saves, malformed };
}

function section(body: string, title: string): string {
  const m = body.match(new RegExp(`^#### ${title}\\s*$([\\s\\S]*?)(?=^#### |(?![\\s\\S]))`, "m"));
  return m?.[1] ?? "";
}

function entries(text: string): Array<{ rawName: string; text: string }> {
  const out: Array<{ rawName: string; text: string }> = [];
  for (const m of text.matchAll(/\*\*_([\s\S]+?)\._\*\*\s*([\s\S]*?)(?=\n\s*\*\*_|(?![\s\S]))/g)) {
    out.push({ rawName: m[1]!.replace(/\s+/g, " ").trim(), text: plainMarkdown(m[2]!) });
  }
  return out;
}

function parseAction(rawName: string, text: string): MonsterAction {
  const limit = rawName.match(/\(([^)]*)\)\s*$/)?.[1];
  const name = rawName.replace(/\s*\([^)]*\)\s*$/, "").trim() || rawName;
  const prose = flat(text);
  const action: MonsterAction = { name, text };
  if (limit) {
    const recharge = limit.match(/Recharge\s+([\d–-]+)/i)?.[1];
    if (recharge) action.recharge = recharge.replace("-", "–");
    else action.uses = limit;
  }
  const attack = prose.match(/(Melee or Ranged|Melee|Ranged) Attack Roll:\s*([+−–-]\s*\d+)/i);
  if (attack) {
    const kind = attack[1]!.toLowerCase() === "melee or ranged" ? "melee_or_ranged" : (attack[1]!.toLowerCase() as "melee" | "ranged");
    const reach = prose.match(/reach (\d+) ft\./i);
    const range = prose.match(/range (\d+)(?:\/(\d+))? ft\./i);
    action.attack = {
      kind,
      bonus: signed(attack[2]!),
      ...(reach ? { reachFt: Number(reach[1]) } : {}),
      ...(range ? { rangeFt: { normal: Number(range[1]), ...(range[2] ? { long: Number(range[2]) } : {}) } } : {}),
    };
  }
  const save = prose.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw:\s*DC (\d+)/i);
  if (save) {
    const damage = damageParts(text);
    action.save = {
      ability: abilityFromWord(save[1]!)!,
      dc: Number(save[2]),
      onSuccess: /Success:\s*Half damage/i.test(prose) || /half as much damage/i.test(prose) ? "half" : damage.length ? "none" : "special",
    };
  }
  const damage = damageParts(text);
  if (damage.length) action.damage = damage;
  const conditions = conditionsIn(text);
  if (conditions.length) action.conditions = conditions;
  return action;
}

function actionsOf(body: string, title: string): MonsterAction[] {
  return entries(section(body, title)).map((e) => parseAction(e.rawName, e.text));
}

export type ParsedMonster = { monster: MonsterDef; text: string; missing: string[] };

export function parseMonsterBlock(block: MonsterBlock): ParsedMonster {
  const { body, name } = block;
  const typeLine = body.match(/^_([^_\n]+)_\s*$/m)?.[1] ?? "";
  const [left = "", ...alignBits] = typeLine.split(",");
  const size = left.trim().split(/\s+/)[0] ?? "";
  const creatureType = left.trim().split(/\s+/).slice(1).join(" ");
  const alignment = alignBits.join(",").trim();
  const ac = Number(body.match(/\*\*AC\*\*\s+(\d+)/)?.[1]);
  const initiative = body.match(/\*\*Initiative\*\*\s+([+−–-]\d+)/)?.[1];
  const hpLine = body.match(/\*\*HP\*\*\s+(\d+)(?:\s*\(([^)]+)\))?/);
  const crLine = line(body, "CR") ?? "";
  const cr = crLine.match(/^([\d/]+)/)?.[1] ?? "";
  const xp = Number(crLine.match(/XP ([\d,]+)/)?.[1]?.replace(/,/g, "") ?? 0);
  const pb = crLine.match(/PB \+(\d+)/)?.[1];
  const { scores, saves, malformed } = abilityTable(body);
  const legendary = section(body, "Legendary Actions");
  const legendaryUses = legendary.match(/Legendary Action Uses:\s*(\d+)/i)?.[1];
  const missing: string[] = [];
  if (!Number.isFinite(ac) || ac <= 0) missing.push("ac");
  if (!hpLine) missing.push("hp");
  if (!cr) missing.push("cr");
  if (Object.keys(scores).length < 6) missing.push("abilities");
  for (const ability of malformed) missing.push(`abilities.${ability}`);
  const traits = actionsOf(body, "Traits");
  const actions = actionsOf(body, "Actions");
  const bonusActions = actionsOf(body, "Bonus Actions");
  const reactions = actionsOf(body, "Reactions");
  const legendaryActions = actionsOf(body, "Legendary Actions");
  if (!actions.length) missing.push("actions");
  const optional = (key: string, value: string | undefined) => (value ? { [key]: value } : {});
  const monster: MonsterDef = {
    id: slug(name),
    name,
    size: size || "Medium",
    creatureType: creatureType || "Unknown",
    alignment: alignment || "Unaligned",
    ac: Number.isFinite(ac) && ac > 0 ? ac : 10,
    hp: hpLine ? Number(hpLine[1]) : 1,
    cr: cr || "0",
    crValue: crValue(cr || "0"),
    xp,
    ...(block.group && block.group !== name ? { group: block.group } : {}),
    ...optional("hitDice", hpLine?.[2] ? cleanDice(hpLine[2]) : undefined),
    ...(initiative ? { initiative: signed(initiative) } : {}),
    ...optional("speed", line(body, "Speed")),
    ...(Object.keys(scores).length ? { abilities: scores } : {}),
    ...(Object.keys(saves).length ? { saves } : {}),
    ...optional("skills", line(body, "Skills")),
    ...optional("resistances", line(body, "Resistances")),
    ...optional("vulnerabilities", line(body, "Vulnerabilities")),
    ...optional("immunities", line(body, "Immunities")),
    ...optional("gear", line(body, "Gear")),
    ...optional("senses", line(body, "Senses")),
    ...optional("languages", line(body, "Languages")),
    ...(pb ? { proficiencyBonus: Number(pb) } : {}),
    ...(traits.length ? { traits } : {}),
    ...(actions.length ? { actions } : {}),
    ...(bonusActions.length ? { bonusActions } : {}),
    ...(reactions.length ? { reactions } : {}),
    ...(legendaryActions.length ? { legendaryActions } : {}),
    ...(legendaryUses ? { legendaryUses: Number(legendaryUses) } : {}),
  };
  return { monster, text: plainMarkdown(body), missing };
}
