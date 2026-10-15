/**
 * SRD 5.2.1 weapons, armor, and magic items.
 * Every mechanical sentence either becomes a typed effect or lands in notModeled, so the admin sees what the game ignores.
 */

import type { EffectDef, ItemDef, Rarity } from "@d20-fireverse/content-schema";
import { abilityFromWord, cleanDice, DAMAGE_TYPES, flat, goldFromCost, isDamageType, plainMarkdown, slug } from "./srd-text.js";

export type Ambiguity = { field: string; summary: string; options: Array<{ label: string; patch: Record<string, unknown> }>; parserChoice?: number };

export type ParsedItem = {
  item: ItemDef;
  text: string;
  line: string;
  notModeled: string[];
  ambiguities: Ambiguity[];
  /** Mechanical sentences the parser read. Zero means pure flavor or a missing rule. */
  mechanical: number;
};

const MASTERY = new Set(["cleave", "graze", "nick", "push", "sap", "slow", "topple", "vex"]);

type Cells = string[];

function cellText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function rowsOf(table: string): Cells[] {
  return [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((row) => [...row[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => cellText(c[1] ?? "")));
}

function tablesOf(html: string): Cells[][] {
  return [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map((t) => rowsOf(t[0]));
}

function weaponCategory(header: string): NonNullable<ItemDef["weapon"]>["category"] | undefined {
  const h = header.toLowerCase();
  if (h.includes("simple melee")) return "simple_melee";
  if (h.includes("simple ranged")) return "simple_ranged";
  if (h.includes("martial melee")) return "martial_melee";
  if (h.includes("martial ranged")) return "martial_ranged";
  return undefined;
}

function weightLb(raw: string | undefined): number | undefined {
  const m = raw?.match(/([\d.]+)\s*lb/);
  return m ? Number(m[1]) : undefined;
}

export function parseWeapons(equipment: string): ParsedItem[] {
  const out: ParsedItem[] = [];
  for (const table of tablesOf(equipment)) {
    let category: NonNullable<ItemDef["weapon"]>["category"] | undefined;
    for (const row of table) {
      if (row.length === 1) {
        category = weaponCategory(row[0]!) ?? category;
        continue;
      }
      const [name, damageCell = "", props = "", masteryCell = "", weight, cost] = row;
      const mastery = masteryCell.toLowerCase();
      if (!name || !category || !MASTERY.has(mastery)) continue;
      const dmg = damageCell.match(/^(\d+d\d+|\d+)\s+(\w+)/);
      const properties = props === "—" ? [] : props.split(/,(?![^(]*\))/).map((p) => p.trim()).filter(Boolean);
      const range = props.match(/Range (\d+)\/(\d+)/);
      const versatile = props.match(/Versatile \((\d+d\d+)\)/)?.[1];
      const id = slug(name);
      const item: ItemDef = {
        id,
        name,
        rarity: "common",
        slot: "mainhand",
        weaponId: id,
        weaponMastery: mastery as NonNullable<ItemDef["weaponMastery"]>,
        effects: [],
        priceGold: goldFromCost(cost) ?? 1,
        weapon: {
          category,
          damage: dmg ? cleanDice(dmg[1]!) : "1",
          damageType: dmg ? dmg[2]!.toLowerCase() : "bludgeoning",
          properties,
          ...(range ? { rangeFt: { normal: Number(range[1]), long: Number(range[2]) } } : {}),
          ...(versatile ? { versatile } : {}),
        },
        ...(weightLb(weight) != null ? { weightLb: weightLb(weight) } : {}),
      };
      out.push({
        item,
        text: `| Name | Damage | Properties | Mastery | Weight | Cost |\n| --- | --- | --- | --- | --- | --- |\n| ${row.join(" | ")} |`,
        line: `${category.replace("_", " ")} weapon`,
        notModeled: [],
        ambiguities: [],
        mechanical: 1,
      });
    }
  }
  return out;
}

export function parseArmor(equipment: string): ParsedItem[] {
  const start = equipment.indexOf("## Armor");
  const section = equipment.slice(start, equipment.indexOf("## Tools", start));
  const out: ParsedItem[] = [];
  for (const table of tablesOf(section)) {
    let category: NonNullable<ItemDef["armor"]>["category"] | undefined;
    for (const row of table) {
      if (row.length === 1) {
        const h = row[0]!.toLowerCase();
        category = h.startsWith("light") ? "light" : h.startsWith("medium") ? "medium" : h.startsWith("heavy") ? "heavy" : h.startsWith("shield") ? "shield" : category;
        continue;
      }
      const [name, acCell = "", strCell = "", stealth = "", weight, cost] = row;
      if (!name || !category || name === "Armor") continue;
      const base = Number(acCell.match(/^\+?(\d+)/)?.[1] ?? 0);
      const dexCap = !/Dex/i.test(acCell) ? 0 : acCell.match(/max (\d+)/)?.[1] ? Number(acCell.match(/max (\d+)/)![1]) : null;
      const strength = strCell.match(/Str (\d+)/)?.[1];
      const id = slug(name);
      const shield = category === "shield";
      const notModeled = [
        ...(/Disadvantage/i.test(stealth) ? ["Disadvantage on Dexterity (Stealth) checks."] : []),
      ];
      const item: ItemDef = {
        id,
        name,
        rarity: "common",
        slot: shield ? "shield" : "armor",
        effects: shield ? [{ kind: "ac_bonus", amount: base }] : [],
        priceGold: goldFromCost(cost) ?? 1,
        armor: {
          category,
          baseAc: base,
          dexCap: shield ? 0 : dexCap,
          ...(strength ? { strength: Number(strength) } : {}),
          stealthDisadvantage: /Disadvantage/i.test(stealth),
        },
        ...(weightLb(weight) != null ? { weightLb: weightLb(weight) } : {}),
      };
      out.push({
        item,
        text: `| Armor | AC | Strength | Stealth | Weight | Cost |\n| --- | --- | --- | --- | --- | --- |\n| ${row.join(" | ")} |`,
        line: shield ? "Shield" : `${category[0]!.toUpperCase()}${category.slice(1)} armor`,
        notModeled,
        ambiguities: [],
        mechanical: 1,
      });
    }
  }
  return out;
}

function rarityOf(word: string): Rarity | undefined {
  const w = word.toLowerCase();
  if (w.includes("very rare")) return "very_rare";
  if (w.includes("uncommon")) return "uncommon";
  if (w.includes("legendary") || w.includes("artifact")) return "legendary";
  if (w.includes("rare")) return "rare";
  if (w.includes("common")) return "common";
  return undefined;
}

function slotOf(line: string): ItemDef["slot"] {
  if (/Armor \(Shield\)/i.test(line)) return "shield";
  if (/^Armor/i.test(line)) return "armor";
  if (/Any Ammunition/i.test(line)) return "consumable";
  if (/^Weapon/i.test(line)) return "mainhand";
  if (/^(Potion|Scroll)/i.test(line)) return "consumable";
  return "trinket";
}

function requiresOf(line: string): ItemDef["requires"] | undefined {
  if (!/Requires Attunement/i.test(line)) return undefined;
  const by = line.match(/Requires Attunement by an? ([^)]+)\)/i)?.[1];
  if (!by) return { attunement: true };
  if (/spellcaster/i.test(by)) return { attunement: true, spellcaster: true };
  const names = by.split(/,\s*(?:or\s+)?|\s+or\s+/).map((n) => slug(n.replace(/^(a|an)\s+/i, ""))).filter(Boolean);
  const classes = ["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"];
  const cls = names.filter((n) => classes.includes(n));
  const species = names.filter((n) => !classes.includes(n));
  return { attunement: true, ...(cls.length ? { class: cls } : {}), ...(species.length ? { species } : {}) };
}

const MECHANICAL =
  /\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma|bonus|penalty|Advantage|Disadvantage|saving throws?|Speed|charges?|Hit Points?|regains?|cast|Resistance|Immunity|condition|damage|Armor Class|attack rolls?|ability checks?|teleport|Darkvision|Truesight|Bonus Action|Reaction|Magic action|Long Rest|Short Rest|Concentration|Invisible|invisible|when you drink|Fly Speed|Climb Speed|hover|spell|Haste|Bless|Temporary Hit Points)\b/i;

type Read = { effects: EffectDef[]; notModeled: string[]; ambiguities: Ambiguity[]; mechanical: number };

/** “You have Resistance…”, not “the weapon ignores Resistance” or “a creature with Immunity…”. */
function grantsBearer(sentence: string): boolean {
  if (/\bignores?\b/i.test(sentence)) return false;
  if (/\b(?:can take|you can|Magic action|Bonus Action|Reaction)\b/i.test(sentence)) return false;
  if (/\b(?:a|the|that|each|any) (?:creature|target)\b[^.]*\b(?:has|have|is)\b[^.]*\b(?:Resistance|Immunity|immune)\b/i.test(sentence)) return false;
  return /\b(?:you|your|wearer|bearer|wielder)\b/i.test(sentence);
}

const WEAPON_ANY: Array<[RegExp, (w: NonNullable<ItemDef["weapon"]>) => boolean]> = [
  [/^Any Melee Weapon$/i, (w) => w.category.endsWith("_melee")],
  [/^Any Ranged Weapon$/i, (w) => w.category.endsWith("_ranged")],
  [/^Any Simple or Martial$/i, () => true],
];

/** Gear ids the type line allows as the mundane base: “Weapon (Longbow or Shortbow)”, “Armor (Any Medium or Heavy, Except Hide Armor)”. */
export function baseItemsOf(line: string, gear: ItemDef[]): { ids: string[]; unknown: string[] } {
  const m = line.match(/^(Weapon|Armor) \(([^)]+)\)/i);
  if (!m || /Ammunition|Shield/i.test(m[2]!)) return { ids: [], unknown: [] };
  const inner = m[2]!.trim();
  if (m[1]!.toLowerCase() === "weapon") {
    const weapons = gear.filter((g) => g.weapon);
    const any = WEAPON_ANY.find(([re]) => re.test(inner));
    if (any) return { ids: weapons.filter((g) => any[1](g.weapon!)).map((g) => g.id), unknown: [] };
    return byName(inner, weapons);
  }
  const armors = gear.filter((g) => g.armor && g.armor.category !== "shield");
  const any = inner.match(/^Any ([^,]+(?:, [^,]+)*?)(?:, Except (.+))?$/i);
  if (any) {
    const cats = any[1]!.split(/,\s*(?:or\s+)?|\s+or\s+/).map((c) => c.trim().toLowerCase());
    const except = new Set((any[2] ?? "").split(/,\s*|\s+or\s+/).map((n) => slug(n)).filter(Boolean));
    return { ids: armors.filter((g) => cats.includes(g.armor!.category) && !except.has(g.id)).map((g) => g.id), unknown: [] };
  }
  return byName(inner, armors);
}

function byName(list: string, gear: ItemDef[]): { ids: string[]; unknown: string[] } {
  const names = list.split(/,\s*(?:or\s+)?|\s+or\s+/).map((n) => n.trim()).filter(Boolean);
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const name of names) {
    const id = slug(name);
    const hit = gear.find((g) => g.id === id || g.id === `${id}_armor` || slug(g.name) === id);
    if (hit) ids.push(hit.id);
    else unknown.push(name);
  }
  return { ids, unknown };
}

function typesIn(list: string): string[] {
  return list
    .split(/,\s*(?:and\s+|or\s+)?|\s+and\s+|\s+or\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => isDamageType(t));
}

function readEffects(body: string, knownSpells: Set<string>, variantBonus?: number): Read {
  const prose = body.replace(/<table[\s\S]*?<\/table>/gi, " ");
  const effects: EffectDef[] = [];
  const notModeled: string[] = [];
  const ambiguities: Ambiguity[] = [];
  let mechanical = 0;
  const raw = plainMarkdown(prose);
  const italicSpells = (s: string) => [...s.matchAll(/_([A-Z][A-Za-z' /-]{2,40})_/g)].map((m) => slug(m[1]!)).filter((id) => knownSpells.has(id));
  const rawSentences = raw.split(/(?<=[.!?])\s+(?=[A-Z_*+])/);
  for (const rawSentence of rawSentences) {
    const s = flat(rawSentence);
    if (!s || !MECHANICAL.test(s)) continue;
    mechanical += 1;
    let covered = false;
    if (/^(?:Spells\.\s*)?(?:This|The) \w+ has \d+ charges\.?$/i.test(s) || (variantBonus && /determined by (?:its|the [\w']+) rarity\.?$/i.test(s) && !/bonus to/i.test(s))) continue;
    const situational = (effect: EffectDef, what: string) => {
      ambiguities.push({
        field: "effects",
        summary: `Situational ${what}: “${s}” The engine applies item bonuses to every roll and cannot check the situation.`,
        options: [
          { label: "Leave the bonus out", patch: {} },
          { label: `Apply it to every roll`, patch: { __addEffect: effect } },
        ],
        parserChoice: 0,
      });
    };
    const onlyAgainst = (found: RegExpMatchArray) => /^[^,.;]*\bagainst\b/i.test(s.slice(found.index! + found[0].length));
    const plantedAura = /you and your allies gain/i.test(s) && /Armor Class and saving throws/i.test(s);
    const ac = s.match(/\+(\d) bonus to (?:Armor Class|AC)\b/i);
    if (plantedAura || /plant the haft end of the rod/i.test(s)) {
      if (!effects.some((e) => e.kind === "plant_aura")) {
        effects.push({ kind: "plant_aura", radiusCells: 12, filter: "ally", ac: 1, saves: 1 });
      }
      covered = true;
    } else if (ac && onlyAgainst(ac)) {
      situational({ kind: "ac_bonus", amount: Number(ac[1]) }, "AC bonus");
      covered = true;
    } else if (ac) {
      effects.push({ kind: "ac_bonus", amount: Number(ac[1]) });
      covered = true;
      if (/saving throws/i.test(s)) effects.push({ kind: "save_bonus", amount: Number(ac[1]) });
    }
    const saveOnly = !ac && !plantedAura ? s.match(/\+(\d) bonus to (?:ability checks and )?saving throws/i) : null;
    if (saveOnly) {
      effects.push({ kind: "save_bonus", amount: Number(saveOnly[1]) });
      covered = true;
      if (/ability checks/i.test(s)) notModeled.push("+1 bonus to ability checks.");
    }
    if (/Emanation originating from you/i.test(s) && /Advantage on saving throws against spells/i.test(s)) {
      effects.push({ kind: "grant_aura", radiusCells: 2, filter: "ally", saveAdv: "vs_magic" });
      covered = true;
    }
    const undeadAura = s.match(/Undead that starts its turn in that area takes (\d+d\d+) Radiant/i);
    if (undeadAura) {
      effects.push({
        kind: "grant_aura",
        radiusCells: 6,
        filter: "all",
        creatureTypes: ["undead"],
        excludeSource: true,
        onStartTurn: { dice: undeadAura[1]!, damageType: "radiant" },
      });
      covered = true;
    }
    if (variantBonus && !ac && /bonus to Armor Class/i.test(s)) {
      effects.push({ kind: "ac_bonus", amount: variantBonus });
      covered = true;
    }
    const atkDmg = s.match(/\+(\d) bonus to attack rolls and damage rolls/i);
    const variantAtk = variantBonus && /bonus to attack rolls and damage rolls/i.test(s) && !/spell attack/i.test(s);
    if (atkDmg || variantAtk) {
      const n = atkDmg ? Number(atkDmg[1]) : variantBonus!;
      effects.push({ kind: "attack_bonus", amount: n }, { kind: "damage_bonus", amount: n });
      covered = true;
    } else {
      const atk = s.match(/\+(\d) bonus to attack rolls\b/i);
      if (atk && !/spell attack/i.test(s)) {
        if (onlyAgainst(atk)) situational({ kind: "attack_bonus", amount: Number(atk[1]) }, "attack bonus");
        else effects.push({ kind: "attack_bonus", amount: Number(atk[1]) });
        covered = true;
      }
    }
    const resist = grantsBearer(s) ? s.match(/Resistance to ([A-Za-z, ]+?) damage/i) : null;
    if (resist) {
      const types = typesIn(resist[1]!);
      if (types.length) {
        for (const t of types) effects.push({ kind: "resistance", damageType: t });
        covered = true;
      } else if (/one (?:damage )?type|one type of damage/i.test(s)) {
        ambiguities.push({
          field: "effects",
          summary: "The SRD lets the GM pick one damage type for the Resistance. Pick the one this copy grants.",
          options: DAMAGE_TYPES.filter((t) => t !== "bludgeoning" && t !== "piercing" && t !== "slashing").map((t) => ({
            label: `Resistance to ${t}`,
            patch: { __addEffect: { kind: "resistance", damageType: t } },
          })),
        });
        covered = true;
      }
    }
    const immune = grantsBearer(s) ? s.match(/Immunity to ([A-Za-z, ]+?) damage/i) : null;
    if (immune) {
      const types = typesIn(immune[1]!);
      for (const t of types) effects.push({ kind: "immunity", damageType: t });
      if (types.length) covered = true;
    }
    const healDrink = s.match(/regain (\d+d\d+(?:\s*\+\s*\d+)?)\s+Hit Points when you drink/i);
    if (healDrink) {
      effects.push({ kind: "heal_drink", dice: cleanDice(healDrink[1]!.replace(/\s+/g, "")) });
      covered = true;
    }
    if (/have the Invisible condition for 1 hour/i.test(s)) {
      effects.push({ kind: "invisibility_drink", durationPcTurns: 60 });
      covered = true;
    }
    const vicious = s.match(/extra (\d+d\d+) damage/i);
    if (vicious && /same type as the weapon/i.test(s)) {
      effects.push({ kind: "on_hit_rider", damage: cleanDice(vicious[1]!) });
      covered = true;
    }
    const rider = s.match(/extra (\d+d\d+) ([A-Za-z]+) damage/i);
    if (rider && isDamageType(rider[2]!)) {
      const effect: EffectDef = { kind: "on_hit_rider", damage: cleanDice(rider[1]!), damageType: rider[2]!.toLowerCase() };
      const condition = s.replace(/^When you hit (?:a (?:creature|target) )?with (?:an attack(?: roll)? using |a (?:melee |ranged )?attack using )?this (?:magic )?(?:weapon|ammunition),?\s*/i, "");
      if (/\b(if|against|while|when|until)\b/i.test(condition)) {
        ambiguities.push({
          field: "effects",
          summary: `Conditional extra damage: “${s}” The engine cannot check the condition.`,
          options: [
            { label: "Leave the extra damage out", patch: {} },
            { label: `Apply ${effect.damage} ${effect.damageType} on every hit`, patch: { __addEffect: effect } },
          ],
          parserChoice: 0,
        });
      } else effects.push(effect);
      covered = true;
    }
    if (/your Strength score changes for 1 hour/i.test(s)) {
      covered = true;
    }
    const stat = s.match(/Your (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)(?: score)? (?:is|changes to|becomes) (\d+)/i);
    if (stat) {
      effects.push({ kind: "stat_set", ability: abilityFromWord(stat[1]!)!, score: Number(stat[2]) });
      covered = true;
    }
    if (/\bcast\b/i.test(s)) {
      const spells = italicSpells(rawSentence);
      for (const spellId of spells) effects.push({ kind: "grant_spell", spellId });
      if (spells.length) {
        covered = true;
        if (/charges?/i.test(s)) notModeled.push(`Charges limit the casts: ${s}`);
      }
    }
    if (!covered) notModeled.push(s);
  }
  for (const table of tablesOf(body)) {
    const head = table[0]?.map((c) => c.toLowerCase()) ?? [];
    const cols = head.flatMap((c, i) => (c === "spell" || c === "spells" ? [i] : []));
    for (const row of table.slice(1)) {
      for (const col of cols) {
        const spellId = slug((row[col] ?? "").replace(/\(.*\)/, ""));
        if (knownSpells.has(spellId) && !effects.some((e) => e.kind === "grant_spell" && e.spellId === spellId)) effects.push({ kind: "grant_spell", spellId });
      }
    }
  }
  const unique = effects.filter((e, i) => effects.findIndex((o) => JSON.stringify(o) === JSON.stringify(e)) === i);
  const resolved = ambiguities.map((a) => ({
    ...a,
    options: a.options.map((o) => {
      const add = (o.patch as { __addEffect?: EffectDef }).__addEffect;
      return { label: o.label, patch: { effects: add ? [...unique, add] : unique } };
    }),
  }));
  return { effects: unique, notModeled: [...new Set(notModeled)], ambiguities: resolved, mechanical };
}

function chunks4(markdown: string): Array<{ title: string; body: string }> {
  return markdown
    .split(/\n(?=#### )/)
    .filter((p) => p.startsWith("#### "))
    .map((p) => {
      const nl = p.indexOf("\n");
      return { title: p.slice(5, nl < 0 ? undefined : nl).trim(), body: nl < 0 ? "" : p.slice(nl + 1) };
    });
}

export function parseMagicItems(markdown: string, knownSpells: Set<string>, gear: ItemDef[]): ParsedItem[] {
  const section = markdown.slice(markdown.indexOf("## Magic Item Descriptions"));
  const source = section.includes("####") ? section : markdown;
  const out: ParsedItem[] = [];
  for (const chunk of chunks4(source)) {
    const line = chunk.body.match(/^_([^_\n]+)_/m)?.[1] ?? "";
    if (!/common|uncommon|rare|very rare|legendary|artifact|varies/i.test(line)) continue;
    const body = chunk.body.replace(/^_[^_\n]+_\s*\n/m, "");
    const text = plainMarkdown(chunk.body);
    const slot = slotOf(line);
    const requires = requiresOf(line);
    const charges = flat(body).match(/has (\d+) charges/i)?.[1];
    const bases = baseItemsOf(line, gear);
    const baseNote = bases.unknown.length ? [`Base ${bases.unknown.join(", ")} is not in the equipment tables, so the game cannot use it.`] : [];
    const base = (extra: Partial<ItemDef>): ItemDef => ({
      id: slug(chunk.title),
      name: chunk.title,
      rarity: rarityOf(line) ?? "common",
      slot,
      ...(requires ? { requires } : {}),
      ...(bases.ids.length ? { baseItems: bases.ids } : {}),
      effects: [],
      ...(charges ? { charges: Number(charges) } : {}),
      ...extra,
    });

    const plus = chunk.title.match(/^(.+), \+1, \+2, or \+3$/);
    if (plus) {
      const variants = [...line.matchAll(/(Common|Uncommon|Rare|Very Rare|Legendary) \(\+(\d)\)/gi)];
      for (const v of variants) {
        const n = Number(v[2]);
        const read = readEffects(body, knownSpells, n);
        out.push({
          item: base({ id: `${slug(plus[1]!)}_plus_${n}`, name: `${plus[1]} +${n}`, rarity: rarityOf(v[1]!) ?? "rare", effects: read.effects }),
          text,
          line,
          notModeled: [...baseNote, ...read.notModeled],
          ambiguities: read.ambiguities,
          mechanical: read.mechanical,
        });
      }
      continue;
    }

    const strTable = tablesOf(body).find((t) => t[0]?.some((c) => /^Str\.?$/i.test(c)));
    if (strTable) {
      const head = strTable[0]!;
      const scoreCol = head.findIndex((c) => /^Str\.?$/i.test(c));
      const rarityCol = head.findIndex((c) => /rarity/i.test(c));
      const drink = /when you drink this potion/i.test(plainMarkdown(body)) || /potion of giant strength/i.test(plainMarkdown(body));
      const read = readEffects(body, knownSpells);
      for (const row of strTable.slice(1)) {
        const score = Number(row[scoreCol]);
        if (!row[0] || !Number.isFinite(score)) continue;
        const strEffect = drink
          ? ({ kind: "stat_drink" as const, ability: "str" as const, score, durationPcTurns: 60 })
          : ({ kind: "stat_set" as const, ability: "str" as const, score });
        out.push({
          item: base({
            id: slug(row[0]),
            name: row[0],
            rarity: rarityOf(row[rarityCol] ?? "") ?? "rare",
            effects: [strEffect, ...read.effects.filter((e) => e.kind !== "stat_set" && e.kind !== "stat_drink")],
          }),
          text,
          line,
          notModeled: [...baseNote, ...read.notModeled.filter((s) => !/Strength (changes|is)/i.test(s))],
          ambiguities: read.ambiguities,
          mechanical: read.mechanical,
        });
      }
      continue;
    }

    const read = readEffects(body, knownSpells);
    out.push({ item: base({ effects: read.effects }), text, line, notModeled: [...baseNote, ...read.notModeled], ambiguities: read.ambiguities, mechanical: read.mechanical });
  }
  return out;
}

