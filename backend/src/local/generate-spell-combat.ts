/**
 * Builds combat stubs for SRD spells that are not already hand-authored.
 * Curated files win: content/rules/srd51_combat.json and content/abilities/oneshot_v1.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const spells = JSON.parse(fs.readFileSync(path.join(root, "content/srd-5.2.1/spells.json"), "utf8")).entries as Spell[];
const curated = JSON.parse(fs.readFileSync(path.join(root, "content/rules/srd51_combat.json"), "utf8")) as Record<string, { id?: string }>;
const oneshot = JSON.parse(fs.readFileSync(path.join(root, "content/abilities/oneshot_v1.json"), "utf8")) as Record<string, { id?: string }>;
const mega4Path = path.join(root, "content/rules/srd51_combat_mega4.json");
const mega4 = fs.existsSync(mega4Path)
  ? (JSON.parse(fs.readFileSync(mega4Path, "utf8")) as Record<string, { id?: string }>)
  : {};

type Spell = {
  id: string;
  name: string;
  level: number;
  castingTime: string;
  duration: string;
  description: string;
  concentration?: boolean;
  mechanics?: {
    attack?: string;
    save?: { ability: string; onSuccess: string };
    damage?: Array<{ dice: string; damageType: string }>;
    heal?: string;
    healAddsModifier?: boolean;
    area?: { shape: string; sizeFt: number };
    rangeFt?: number;
    conditions?: string[];
    upcastPerSlot?: string;
    upcastText?: string;
    cantripDice?: string[];
  };
};

const KNOWN = new Set([
  "blinded",
  "charmed",
  "deafened",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
]);

function knownId(id: string): boolean {
  return Boolean(
    curated[`spell_${id}`] ||
      curated[id] ||
      oneshot[`spell_${id}`] ||
      oneshot[id] ||
      mega4[`spell_${id}`] ||
      mega4[id],
  );
}

function cells(ft: number | undefined): number {
  if (ft == null) return 12;
  return Math.max(1, Math.round(ft / 5));
}

function actionType(casting: string): string {
  const c = casting.toLowerCase();
  if (c.includes("bonus")) return "bonus_action";
  if (c.includes("reaction")) return "reaction";
  return "action";
}

function scaling(base: string, per: string, level: number): Record<string, string> | undefined {
  const b = base.replace(/\s/g, "").match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  const p = per.replace(/\s/g, "").match(/^(\d+)d(\d+)$/i);
  if (!b || !p || b[2] !== p[2]) return undefined;
  const out: Record<string, string> = {};
  const flat = b[3] ?? "";
  for (let slot = level + 1; slot <= 9; slot += 1) {
    out[String(slot)] = `${Number(b[1]) + (slot - level) * Number(p[1])}d${b[2]}${flat}`;
  }
  return Object.keys(out).length ? out : undefined;
}

function gapsFor(spell: Spell, effect: Record<string, unknown>): string[] {
  const text = spell.description;
  const gaps: string[] = [];
  const m = spell.mechanics;
  if (/additional creature|one additional target/i.test(m?.upcastText ?? text)) {
    gaps.push("Upcast adds extra targets; combat scales dice only.");
  }
  if (/10 minute|1 hour|8 hour|ritual/i.test(spell.castingTime)) {
    gaps.push("Long casting time is resolved as a single combat action.");
  }
  if (m?.area && (m.area.shape === "cylinder" || m.area.shape === "emanation")) {
    gaps.push(`Area shape ${m.area.shape} is approximated as a sphere.`);
  }
  if (effect.type === "note") gaps.push("No battlefield effect is run for this spell yet.");
  if (spell.castingTime.toLowerCase().includes("reaction") && effect.type !== "counterspell") {
    gaps.push("Reaction casting is not offered unless a reaction hook already exists.");
  }
  return gaps;
}

function build(spell: Spell): { ability: Record<string, unknown>; gaps: string[] } {
  const m = spell.mechanics ?? {};
  const text = spell.description;
  const id = `spell_${spell.id}`;
  const conc = Boolean(spell.concentration);
  const range = cells(m.rangeFt);
  const effect: Record<string, unknown> = { slot: spell.level };
  const cond = (m.conditions ?? []).find((c) => KNOWN.has(c));
  const repeat = /end of (each of )?its (next )?turns|repeats the (saving )?throw|repeat the save/i.test(text);
  const zone = /when it enters|ends its turn there|start of each of your turns|each creature that ends its turn/i.test(text);
  const summon = /^(conjure_|summon_)|flaming_sphere|spiritual_weapon|arcane_sword|faithful_hound|unseen_servant/.test(spell.id);

  if (spell.id === "dispel_magic") {
    effect.type = "dispel";
    effect.rangeCells = range;
  } else if (spell.id === "counterspell") {
    effect.type = "counterspell";
    effect.rangeCells = range;
  } else if (spell.id === "polymorph" || /transform|polymorph/i.test(spell.name)) {
    effect.type = "polymorph";
    effect.rangeCells = range;
    if (conc) effect.concentration = true;
  } else if (summon) {
    effect.type = "summon";
    effect.rangeCells = range;
    if (conc) effect.concentration = true;
    if (m.damage?.[0]) effect.damage = [m.damage[0]];
  } else if (m.attack && m.damage?.length) {
    effect.type = "attack";
    effect.spellAttack = true;
    effect.ability = "spell";
    effect.rangeCells = range;
    effect.damage = m.damage.map((d) => ({ dice: d.dice, damageType: d.damageType }));
    if (cond) effect.onHit = [{ type: "condition", condition: cond }];
  } else if (m.save) {
    effect.type = "save";
    effect.ability = m.save.ability;
    effect.dcFrom = "spell";
    const shape = m.area?.shape === "cone" || m.area?.shape === "cube" || m.area?.shape === "line" ? m.area.shape : m.area ? "sphere" : "one";
    effect.shape = shape;
    if (m.area) {
      effect.lengthCells = cells(m.area.sizeFt);
      if (shape === "sphere") effect.radius = cells(m.area.sizeFt);
    } else effect.rangeCells = range;
    const parts = (m.damage ?? []).filter((d) => d.dice && d.dice !== "0");
    effect.damage = parts.length ? parts.map((d) => ({ dice: d.dice, damageType: d.damageType })) : [{ dice: "0", damageType: "none" }];
    effect.halfOnSuccess = m.save.onSuccess === "half";
    if (cond) effect.onFail = cond;
    if (conc) effect.concentration = true;
    if (repeat) effect.repeatSave = true;
    if (zone) effect.persistentZone = true;
  } else if (m.heal) {
    effect.type = "heal";
    effect.dice = m.heal;
    effect.ability = "spell";
    effect.rangeCells = range;
    if (m.healAddsModifier) effect.healAddsModifier = true;
    if (/six creatures|up to six/i.test(text)) effect.mass = 6;
  } else {
    effect.type = "note";
    effect.rangeCells = range;
    if (conc) effect.concentration = true;
  }

  if (typeof effect.slot === "number" && effect.slot > 0 && m.upcastPerSlot) {
    const base = (effect.damage as Array<{ dice: string }> | undefined)?.[0]?.dice ?? (typeof effect.dice === "string" ? effect.dice : "");
    const table = base ? scaling(base, m.upcastPerSlot, spell.level) : undefined;
    if (table) effect.scaling = table;
  }

  const gaps = gapsFor(spell, effect);
  return {
    ability: {
      id,
      name: spell.name,
      actionType: actionType(spell.castingTime),
      level: spell.level,
      combat: true,
      effects: [effect],
    },
    gaps,
  };
}

const generated: Record<string, unknown> = {};
let reviewWrites = 0;
for (const spell of spells) {
  if (knownId(spell.id)) continue;
  const built = build(spell);
  generated[built.ability.id as string] = built.ability;
  const reviewPath = path.join(root, "content/srd-5.2.1/review/spell", `${spell.id}.json`);
  const review = fs.existsSync(reviewPath) ? (JSON.parse(fs.readFileSync(reviewPath, "utf8")) as Record<string, unknown>) : { kind: "spell", id: spell.id, status: "auto_ok", confidence: "high" };
  if (built.gaps.length) review.notModeled = built.gaps;
  else delete review.notModeled;
  fs.writeFileSync(reviewPath, `${JSON.stringify(review, null, 2)}\n`);
  reviewWrites += 1;
}

fs.writeFileSync(path.join(root, "content/rules/srd51_combat_generated.json"), `${JSON.stringify(generated, null, 2)}\n`);
console.log(`generated ${Object.keys(generated).length} spells, review files touched ${reviewWrites}`);
