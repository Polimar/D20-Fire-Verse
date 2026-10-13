/**
 * SRD 5.2.1 spells with their numbers: attack or save, damage and healing dice, area, upcast and cantrip scaling.
 */

import type { SpellDef, SpellMechanics } from "@d20-fireverse/content-schema";
import { abilityFromWord, areaIn, cleanDice, conditionsIn, damageParts, flat, plainMarkdown, slug } from "./srd-text.js";

export type ParsedSpell = { spell: SpellDef; text: string; line: string; missing: string[] };

const SCHOOLS = /(abjuration|conjuration|divination|enchantment|evocation|illusion|necromancy|transmutation)/i;

function field(body: string, label: string): string | undefined {
  return body.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+)`))?.[1]?.trim();
}

function components(raw: string | undefined): SpellDef["components"] {
  if (!raw) return undefined;
  const material = raw.match(/M \(([^)]+)\)/)?.[1]?.trim();
  return { verbal: /\bV\b/.test(raw), somatic: /\bS\b/.test(raw), ...(material ? { material } : {}) };
}

function rangeFt(range: string): number | undefined {
  if (/^touch/i.test(range)) return 5;
  if (/^self/i.test(range)) return 0;
  const feet = range.match(/(\d[\d,]*)\s*feet/i);
  if (feet) return Number(feet[1]!.replace(/,/g, ""));
  const miles = range.match(/(\d+)\s*miles?/i);
  return miles ? Number(miles[1]) * 5280 : undefined;
}

/** Splits the description from the trailing "Using a Higher-Level Spell Slot" and "Cantrip Upgrade" notes. */
function scalingNotes(body: string): { main: string; upcast?: string; cantrip?: string } {
  const upcast = body.match(/_Using a Higher-Level Spell Slot\._\s*([^\n]+)/)?.[1]?.trim();
  const cantrip = body.match(/_Cantrip Upgrade\._\s*([^\n]+)/)?.[1]?.trim();
  const main = body.replace(/_Using a Higher-Level Spell Slot\._[^\n]*/, "").replace(/_Cantrip Upgrade\._[^\n]*/, "");
  return { main, ...(upcast ? { upcast } : {}), ...(cantrip ? { cantrip } : {}) };
}

export function mechanicsOf(body: string, range: string, level: number): SpellMechanics | undefined {
  const { main, upcast, cantrip } = scalingNotes(body);
  const prose = flat(main);
  const m: SpellMechanics = {};
  const attack = prose.match(/make an? (melee|ranged) spell attack/i);
  if (attack) m.attack = attack[1]!.toLowerCase() as "melee" | "ranged";
  const save = prose.match(/(?:makes?|make|succeed on) an? (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i)
    ?? prose.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i);
  const damage = damageParts(main);
  if (save) {
    const half = /half as much damage|Half damage/i.test(prose);
    m.save = { ability: abilityFromWord(save[1]!)!, onSuccess: half ? "half" : damage.length ? "none" : "special" };
  }
  if (damage.length) m.damage = damage.map(({ dice, damageType }) => ({ dice, damageType }));
  const heal = prose.match(/regains? (?:a number of )?Hit Points equal to (\d+d\d+)( plus your spellcasting ability modifier)?/i)
    ?? prose.match(/regains? (\d+d\d+(?:\s*\+\s*\d+)?) Hit Points/i);
  if (heal) {
    m.heal = cleanDice(heal[1]!);
    if (heal[2]) m.healAddsModifier = true;
  }
  const area = areaIn(main) ?? areaIn(range);
  if (area) m.area = area;
  const ft = rangeFt(range);
  if (ft != null) m.rangeFt = ft;
  const conditions = conditionsIn(main);
  if (conditions.length) m.conditions = conditions;
  if (upcast) {
    m.upcastText = flat(upcast);
    const per = upcast.match(/increases? by (\d+d\d+) for each (?:spell )?slot level above/i);
    if (per) m.upcastPerSlot = cleanDice(per[1]!);
  }
  if (cantrip && level === 0) {
    const steps = [...cantrip.matchAll(/levels? 5 \((\d+d\d+)\), 11 \((\d+d\d+)\), and 17 \((\d+d\d+)\)/gi)][0];
    const base = m.damage?.[0]?.dice ?? m.heal;
    if (steps && base) m.cantripDice = [base, cleanDice(steps[1]!), cleanDice(steps[2]!), cleanDice(steps[3]!)];
  }
  return Object.keys(m).length ? m : undefined;
}

export function parseSpellChunk(title: string, body: string): ParsedSpell {
  const id = slug(title);
  const line = body.match(/^_([^_\n]+)_/m)?.[1] ?? "";
  const levelMatch = /Level (\d+)/i.exec(line);
  const level = /cantrip/i.test(line) ? 0 : levelMatch ? Number(levelMatch[1]) : undefined;
  const school = (line.match(SCHOOLS)?.[1] ?? "").toLowerCase();
  const classBlob = line.match(/\(([^)]+)\)/)?.[1] ?? "";
  const classes = classBlob.split(/,| and /).map((name) => slug(name.trim())).filter((name) => name && name !== "cantrip");
  const castingTime = field(body, "Casting Time") ?? "";
  const range = field(body, "Range") ?? "";
  const duration = field(body, "Duration") ?? "";
  const description = flat(
    body
      .split("\n")
      .filter((row) => row.trim() && !/^\*\*(Casting Time|Range|Components|Duration):/.test(row) && !/^_[^_\n]+_\s*$/.test(row))
      .join("\n"),
  );
  const missing: string[] = [];
  if (level == null) missing.push("level");
  if (!school) missing.push("school");
  if (!classes.length) missing.push("classes");
  if (!castingTime) missing.push("castingTime");
  if (!range) missing.push("range");
  if (!duration) missing.push("duration");
  const comps = components(field(body, "Components"));
  const mechanics = mechanicsOf(body, range, level ?? 0);
  const spell: SpellDef = {
    id,
    name: title,
    level: level ?? 0,
    school: school || "evocation",
    classes: classes.length ? classes : ["wizard"],
    castingTime: castingTime.replace(/\s+or Ritual$/i, "") || "Action",
    range: range || "Self",
    duration: duration || "Instantaneous",
    description: description || title,
    ...(comps ? { components: comps } : {}),
    ...(/or Ritual/i.test(castingTime) ? { ritual: true } : {}),
    ...(/^Concentration/i.test(duration) ? { concentration: true } : {}),
    ...(mechanics ? { mechanics } : {}),
  };
  return { spell, text: plainMarkdown(body), line, missing };
}
