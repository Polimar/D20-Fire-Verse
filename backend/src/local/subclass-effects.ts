/**
 * FireVerse homebrew subclass mechanics (full PHB-shaped 48-subclass pack).
 * Kit flags come from feature names via slugFeature; combat calls these helpers.
 */

import { makeDiceRoll, rollCheck, rollNotation, type DiceRoll } from "./dice.js";

/** Minimal combat-shaped token used by subclass helpers (avoids import cycle with combat.ts). */
export type Subclassful = {
  id?: string;
  name: string;
  features?: string[];
  kit?: { flags: string[] };
  abilityUses?: Record<string, number>;
  subclassChoices?: Record<string, string>;
  tempHp?: number;
  hp: number;
  maxHp: number;
  ac: number;
  speedCells: number;
  raging?: boolean;
  conditions?: string[];
  damageResistances?: string[];
  channelDivinity?: number;
  bardicLeft?: number;
  ki?: number;
  kiMax?: number;
  focus?: number;
  sorceryPoints?: number;
  heroicInspiration?: boolean;
  reactionReady?: boolean;
  invisible?: boolean;
  disengaging?: boolean;
  extraAction?: boolean;
  frenzyUsed?: boolean;
  preyUsed?: boolean;
  divineFuryUsed?: boolean;
  wildHeartForm?: string;
  starryForm?: string;
  portentDice?: number[];
  arcaneWardHp?: number;
  arcaneWardMax?: number;
  superiorityDice?: number;
  superiorityDie?: string;
  psionicDice?: number;
  psionicDie?: string;
  healingLightDice?: number;
  wildMagicReady?: boolean;
  tidesUsed?: boolean;
  duplicityActive?: boolean;
  wrathOfSea?: boolean;
  elementalAttuned?: boolean;
  vowTargetId?: string;
  companion?: { hp: number; maxHp: number; attacks: number };
  x: number;
  y: number;
  level?: number;
  movementLeft?: number;
  auraAttackDisadvAgainst?: boolean;
  saves?: Record<string, number>;
  dying?: boolean;
  stable?: boolean;
  heavyArmor?: boolean;
  affinityUsed?: boolean;
};

export const SUBCLASS_IDS = [
  "path_of_the_berserker",
  "path_of_the_world_tree",
  "path_of_the_wild_heart",
  "path_of_the_zealot",
  "college_of_dance",
  "college_of_lore",
  "college_of_glamour",
  "college_of_valour",
  "life_domain",
  "light_domain",
  "trickery_domain",
  "war_domain",
  "circle_of_the_moon",
  "circle_of_the_land",
  "circle_of_stars",
  "circle_of_the_sea",
  "champion",
  "battle_master",
  "eldritch_knight",
  "psi_warrior",
  "thief",
  "arcane_trickster",
  "assassin",
  "soulknife",
  "abjurer",
  "evoker",
  "diviner",
  "illusionist",
  "warrior_of_the_open_hand",
  "way_of_shadow",
  "way_of_the_elements",
  "way_of_the_ascendant_dragon",
  "oath_of_devotion",
  "oath_of_the_ancients",
  "oath_of_vengeance",
  "oath_of_glory",
  "hunter",
  "gloom_stalker",
  "fey_wanderer",
  "beast_master",
  "wild_magic",
  "draconic_sorcery",
  "aberrant_sorcery",
  "clockwork_sorcery",
  "archfey_patron",
  "fiend_patron",
  "great_old_one_patron",
  "celestial_patron",
] as const;

/** Permanent / rest choices offered at unlock or via combat select actions. */
export const SUBCLASS_FEATURE_CHOICES: Record<string, string[]> = {
  rage_of_the_wild: ["bear", "eagle", "wolf"],
  aspect_of_the_wild: ["owl", "panther", "elephant"],
  hunters_prey: ["colossus_slayer", "horde_breaker"],
  defensive_tactics: ["escape_the_horde", "multiattack_defense"],
  dragon_ancestry: ["fire", "cold", "lightning", "acid", "poison"],
  circle_spells: ["arid", "polar", "temperate", "tropical"],
  starry_form: ["archer", "chalice", "dragon"],
  combat_superiority_maneuvers: ["trip", "push", "menacing", "riposte", "precision", "sweeping"],
};

export function hasSub(token: Subclassful, slug: string): boolean {
  if (slug === "fast_hands") return hasSub(token, "fast_fingers");
  if (slug === "dragon_companion") return hasSub(token, "dragon_presence");
  return Boolean(token.features?.includes(slug) || token.kit?.flags.includes(slug));
}

function uses(token: Subclassful): Record<string, number> {
  token.abilityUses ??= {};
  return token.abilityUses;
}

function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function die(roller: string, notation: string, purpose: DiceRoll["purpose"], label: string): { roll: DiceRoll; total: number } {
  const rolled = rollNotation(notation);
  const roll = makeDiceRoll({
    roller,
    notation,
    values: rolled.values,
    sides: rolled.sides,
    modifier: rolled.modifier,
    total: rolled.total,
    purpose,
    label,
  });
  return { roll, total: rolled.total };
}

function heal(token: Subclassful, amount: number): number {
  const gain = Math.max(0, Math.min(amount, token.maxHp - token.hp));
  token.hp += gain;
  if (token.hp > 0) {
    token.dying = false;
    token.stable = false;
  }
  return gain;
}

function choice(token: Subclassful, key: string): string | undefined {
  if (token.subclassChoices?.[key]) return token.subclassChoices[key];
  const fromFeature = token.features?.find((f) => f.startsWith(`${key}:`));
  return fromFeature?.slice(key.length + 1);
}

export function setSubclassChoice(token: Subclassful, key: string, value: string): void {
  const allowed = SUBCLASS_FEATURE_CHOICES[key];
  if (allowed && !allowed.includes(value)) throw new Error("BAD_CHOICE");
  token.subclassChoices = { ...(token.subclassChoices ?? {}), [key]: value };
}

/** Frenzy extra damage dice: 2d6, 3d6 at 9, 4d6 at 16. */
export function frenzyDice(level: number): number {
  if (level >= 16) return 4;
  if (level >= 9) return 3;
  return 2;
}

export function divineFuryExtra(level: number): { dice: string; flat: number } {
  return { dice: "1d6", flat: Math.floor(level / 2) };
}

export function vitalityTempHp(barbarianLevel: number): number {
  return barbarianLevel;
}

export function danceUnarmoredAc(dex: number, cha: number): number {
  return 10 + dex + cha;
}

export function moonWildShapeTempHp(druidLevel: number): number {
  return 3 * druidLevel;
}

export function moonWildShapeAc(wis: number): number {
  return 13 + wis;
}

export function preserveLifePool(clericLevel: number): number {
  return 5 * clericLevel;
}

export function psiDieCount(pb: number): number {
  return 2 * pb;
}

export function healingLightDice(warlockLevel: number): number {
  return 1 + warlockLevel;
}

export function primalCompanionHp(rangerLevel: number, wisMod: number): number {
  return 5 * rangerLevel + wisMod;
}

export function arcaneWardMax(wizardLevel: number, intMod: number): number {
  return 2 * wizardLevel + intMod;
}

export function dreadAmbusherDamage(): string {
  return "1d8";
}

export function dreadfulStrikesDie(level: number): string {
  return level >= 11 ? "1d6" : "1d4";
}

export function wildMagicSurgeTable(): Array<{ id: number; label: string; apply: (self: Subclassful, foes: Subclassful[]) => string }> {
  return [
    { id: 1, label: "You regain 2d10 hit points", apply: (self) => { heal(self, rollNotation("2d10").total); return "surge heal"; } },
    { id: 2, label: "You teleport 30 feet", apply: (self) => { self.x = (self.x ?? 0) + 3; return "surge teleport"; } },
    { id: 3, label: "Nearest foe takes 1d10 force", apply: (self, foes) => { const f = foes[0]; if (f) f.hp = Math.max(0, f.hp - rollNotation("1d10").total); return "surge force"; } },
    { id: 4, label: "You gain 1d10 temporary hit points", apply: (self) => { self.tempHp = Math.max(self.tempHp ?? 0, rollNotation("1d10").total); return "surge thp"; } },
    { id: 5, label: "You cast misty step (free move)", apply: (self) => { self.x = (self.x ?? 0) + 2; self.y = (self.y ?? 0) + 2; return "surge misty"; } },
    { id: 6, label: "Foes within 10 feet are frightened", apply: (_s, foes) => { for (const f of foes.slice(0, 3)) f.conditions = [...new Set([...(f.conditions ?? []), "frightened"])]; return "surge fear"; } },
    { id: 7, label: "You become invisible until you attack", apply: (self) => { self.invisible = true; return "surge invis"; } },
    { id: 8, label: "Maximize next cantrip damage this turn", apply: (self) => { uses(self).surge_max_cantrip = 1; return "surge max"; } },
  ];
}

export function rollWildMagicSurge(controlled: boolean): { picks: number[]; chosen: number } {
  const a = 1 + Math.floor(Math.random() * 8);
  if (!controlled) return { picks: [a], chosen: a };
  const b = 1 + Math.floor(Math.random() * 8);
  return { picks: [a, b], chosen: a }; // caller may override chosen
}

export type SubclassCtx = {
  allies: Subclassful[];
  foes: Subclassful[];
  target?: Subclassful;
  level: number;
  abilities: Record<string, number>;
  prof: number;
};

type ActionFn = (token: Subclassful, ctx: SubclassCtx) => { line: string; rolls: DiceRoll[] };

const ACTIONS: Record<string, ActionFn> = {
  vitality_of_the_tree(token, ctx) {
    token.tempHp = Math.max(token.tempHp ?? 0, vitalityTempHp(ctx.level));
    return { line: `${token.name} draws vitality from the World Tree.`, rolls: [] };
  },
  vitality_grant(token, ctx) {
    const ally = ctx.target ?? ctx.allies.find((a) => a.id !== token.id);
    if (!ally || !token.raging) throw new Error("BAD_ABILITY");
    ally.tempHp = Math.max(ally.tempHp ?? 0, vitalityTempHp(ctx.level));
    return { line: `${token.name} shares World Tree vitality with ${ally.name}.`, rolls: [] };
  },
  branches_of_the_tree(token, ctx) {
    const foe = ctx.target ?? ctx.foes[0];
    if (!foe) throw new Error("NEED_TARGET");
    const dc = 8 + ctx.prof + mod(ctx.abilities.str ?? 10);
    const roll = rollCheck({ roller: foe.name, label: "Branches of the Tree", bonus: 0, dc, purpose: "save" });
    if (roll.outcome !== "success") {
      foe.x = token.x;
      foe.y = token.y + 1;
    }
    token.reactionReady = false;
    return { line: `${token.name} yanks ${foe.name} with spectral roots.`, rolls: [roll] };
  },
  travel_along_the_tree(token, ctx) {
    if (!token.raging) throw new Error("BAD_ABILITY");
    token.x = (token.x ?? 0) + 6;
    if ((uses(token).tree_travel_party ?? 1) > 0) {
      uses(token).tree_travel_party = 0;
      for (const ally of ctx.allies.filter((a) => a.id !== token.id).slice(0, 4)) {
        ally.x = token.x;
        ally.y = token.y;
      }
    }
    return { line: `${token.name} travels along the World Tree.`, rolls: [] };
  },
  choose_rage_of_the_wild(token, ctx) {
    const form = (ctx as SubclassCtx & { choice?: string }).choice ?? choice(token, "rage_of_the_wild") ?? "bear";
    setSubclassChoice(token, "rage_of_the_wild", form);
    token.wildHeartForm = form;
    if (form === "bear") {
      const types = ["bludgeoning", "piercing", "slashing", "acid", "cold", "fire", "lightning", "thunder", "poison", "necrotic", "radiant", "force"];
      token.damageResistances = [...new Set([...(token.damageResistances ?? []), ...types])];
    }
    return { line: `${token.name} channels the ${form}.`, rolls: [] };
  },
  choose_aspect_of_the_wild(token, _ctx) {
    const form = choice(token, "aspect_of_the_wild") ?? "owl";
    setSubclassChoice(token, "aspect_of_the_wild", form);
    if (form === "panther") token.speedCells = (token.speedCells ?? 6) + 0; // climb represented as ignore terrain
    return { line: `${token.name} takes the aspect of the ${form}.`, rolls: [] };
  },
  zealous_presence(token, ctx) {
    spendOnce(token, "zealous_presence");
    for (const ally of ctx.allies.slice(0, 10)) ally.heroicInspiration = true;
    return { line: `${token.name} bellows a zealous cry.`, rolls: [] };
  },
  fanatical_focus(token) {
    if (!token.raging) throw new Error("BAD_ABILITY");
    spendOnce(token, "fanatical_focus");
    token.heroicInspiration = true;
    return { line: `${token.name} refocuses in rage.`, rolls: [] };
  },
  mantle_of_inspiration(token, ctx) {
    if ((token.bardicLeft ?? 0) < 1) throw new Error("ALREADY_USED");
    token.bardicLeft = (token.bardicLeft ?? 0) - 1;
    const thp = Math.max(1, ctx.level);
    for (const ally of ctx.allies) {
      ally.tempHp = Math.max(ally.tempHp ?? 0, thp);
      ally.disengaging = true;
    }
    return { line: `${token.name} drapes allies in a mantle of inspiration.`, rolls: [] };
  },
  mantle_of_majesty(token, ctx) {
    spendOnce(token, "mantle_of_majesty");
    const foe = ctx.target ?? ctx.foes[0];
    if (foe) foe.conditions = [...new Set([...(foe.conditions ?? []), "charmed"])];
    return { line: `${token.name} commands with majestic presence.`, rolls: [] };
  },
  unbreakable_majesty(token) {
    spendOnce(token, "unbreakable_majesty");
    uses(token).unbreakable_majesty_active = 1;
    return { line: `${token.name} assumes an unbreakable majestic aspect.`, rolls: [] };
  },
  warding_flare(token, ctx) {
    const bag = uses(token);
    if ((bag.warding_flare ?? 0) < 1) throw new Error("ALREADY_USED");
    bag.warding_flare -= 1;
    const foe = ctx.target ?? ctx.foes[0];
    if (foe) foe.auraAttackDisadvAgainst = true;
    token.reactionReady = false;
    return { line: `${token.name} flares protective light.`, rolls: [] };
  },
  radiance_of_the_dawn(token, ctx) {
    if ((token.channelDivinity ?? 0) < 1) throw new Error("ALREADY_USED");
    token.channelDivinity = (token.channelDivinity ?? 0) - 1;
    const { roll, total } = die(token.name, `2d10+${ctx.level}`, "damage", "Radiance of the Dawn");
    for (const foe of ctx.foes) foe.hp = Math.max(0, foe.hp - total);
    return { line: `${token.name} radiates dawnlight.`, rolls: [roll] };
  },
  corona_of_light(token) {
    spendOnce(token, "corona_of_light");
    uses(token).corona_active = 1;
    return { line: `${token.name} wears a corona of light.`, rolls: [] };
  },
  blessing_of_the_trickster(token, ctx) {
    const ally = ctx.target ?? ctx.allies.find((a) => a.id !== token.id) ?? token;
    ally.heroicInspiration = true;
    return { line: `${token.name} blesses ${ally.name} with trickster stealth.`, rolls: [] };
  },
  invoke_duplicity(token) {
    if ((token.channelDivinity ?? 0) < 1) throw new Error("ALREADY_USED");
    token.channelDivinity = (token.channelDivinity ?? 0) - 1;
    token.duplicityActive = true;
    return { line: `${token.name} invokes a duplicitous illusion.`, rolls: [] };
  },
  tricksters_transposition(token) {
    if (!token.duplicityActive) throw new Error("BAD_ABILITY");
    token.x = (token.x ?? 0) + 3;
    return { line: `${token.name} swaps places with the duplicate.`, rolls: [] };
  },
  war_priest(token) {
    const bag = uses(token);
    if ((bag.war_priest ?? 0) < 1) throw new Error("ALREADY_USED");
    bag.war_priest -= 1;
    token.extraAction = true;
    return { line: `${token.name} makes a war priest strike.`, rolls: [] };
  },
  guided_strike(token, ctx) {
    if ((token.channelDivinity ?? 0) < 1) throw new Error("ALREADY_USED");
    token.channelDivinity = (token.channelDivinity ?? 0) - 1;
    const ally = ctx.target ?? token;
    uses(ally).guided_strike = 10;
    token.reactionReady = false;
    return { line: `${token.name} guides a strike (+10).`, rolls: [] };
  },
  war_gods_blessing(token) {
    if ((token.channelDivinity ?? 0) < 1) throw new Error("ALREADY_USED");
    token.channelDivinity = (token.channelDivinity ?? 0) - 1;
    token.ac = (token.ac ?? 10) + 2;
    return { line: `${token.name} calls the war god's blessing.`, rolls: [] };
  },
  moonlight_step(token) {
    token.x = (token.x ?? 0) + 3;
    uses(token).moonlight_adv = 1;
    return { line: `${token.name} steps through moonlight.`, rolls: [] };
  },
  starry_form(token, ctx) {
    const form = choice(token, "starry_form") ?? "archer";
    setSubclassChoice(token, "starry_form", form);
    token.starryForm = form;
    const bag = uses(token);
    if ((bag.wild_shape ?? 0) > 0) bag.wild_shape -= 1;
    return { line: `${token.name} takes the starry form of the ${form}.`, rolls: [] };
  },
  starry_archer(token, ctx) {
    if (token.starryForm !== "archer") throw new Error("BAD_ABILITY");
    const foe = ctx.target ?? ctx.foes[0];
    if (!foe) throw new Error("NEED_TARGET");
    const dice = hasSub(token, "twinkling_stars") ? "2d8" : "1d8";
    const { roll, total } = die(token.name, `${dice}+${mod(ctx.abilities.wis ?? 10)}`, "damage", "Starry Archer");
    foe.hp = Math.max(0, foe.hp - total);
    return { line: `${token.name} fires a starry bolt.`, rolls: [roll] };
  },
  cosmic_omen(token, ctx) {
    const bag = uses(token);
    if ((bag.cosmic_omen ?? 0) < 1) throw new Error("ALREADY_USED");
    bag.cosmic_omen -= 1;
    const weal = (bag.cosmic_weal ?? 1) === 1;
    const { roll, total } = die(token.name, "1d6", "check", "Cosmic Omen");
    const ally = ctx.target ?? ctx.allies[0] ?? token;
    if (weal) ally.heroicInspiration = true;
    else if (ctx.foes[0]) uses(ctx.foes[0]).omen_penalty = total;
    return { line: `${token.name} reads a cosmic omen (${weal ? "weal" : "woe"}).`, rolls: [roll] };
  },
  wrath_of_the_sea(token) {
    const bag = uses(token);
    if ((bag.wild_shape ?? 0) > 0) bag.wild_shape -= 1;
    token.wrathOfSea = true;
    return { line: `${token.name} summons the wrath of the sea.`, rolls: [] };
  },
  oceanic_gift(token, ctx) {
    const ally = ctx.target ?? ctx.allies.find((a) => a.id !== token.id);
    if (!ally) throw new Error("NEED_TARGET");
    ally.wrathOfSea = true;
    return { line: `${token.name} gifts the sea's wrath to ${ally.name}.`, rolls: [] };
  },
  combat_superiority_trip(token, ctx) {
    return spendManeuver(token, ctx, "trip");
  },
  combat_superiority_push(token, ctx) {
    return spendManeuver(token, ctx, "push");
  },
  combat_superiority_menacing(token, ctx) {
    return spendManeuver(token, ctx, "menacing");
  },
  combat_superiority_riposte(token, ctx) {
    return spendManeuver(token, ctx, "riposte");
  },
  combat_superiority_precision(token, ctx) {
    return spendManeuver(token, ctx, "precision");
  },
  combat_superiority_sweeping(token, ctx) {
    return spendManeuver(token, ctx, "sweeping");
  },
  know_your_enemy(token, ctx) {
    const foe = ctx.target ?? ctx.foes[0];
    if (!foe) throw new Error("NEED_TARGET");
    token.superiorityDice = (token.superiorityDice ?? 0) + 1;
    return { line: `${token.name} studies ${foe.name}.`, rolls: [] };
  },
  protective_field(token, ctx) {
    if ((token.psionicDice ?? 0) < 1) throw new Error("ALREADY_USED");
    token.psionicDice = (token.psionicDice ?? 0) - 1;
    const ally = ctx.target ?? token;
    const { roll, total } = die(token.name, `${token.psionicDie ?? "1d6"}+${mod(ctx.abilities.int ?? 10)}`, "heal", "Protective Field");
    ally.tempHp = Math.max(ally.tempHp ?? 0, total);
    token.reactionReady = false;
    return { line: `${token.name} raises a protective field.`, rolls: [roll] };
  },
  telekinetic_leap(token) {
    token.speedCells = (token.speedCells ?? 6) * 2;
    return { line: `${token.name} leaps telekinetically.`, rolls: [] };
  },
  telekinetic_movement(token, ctx) {
    if ((token.psionicDice ?? 0) < 1) throw new Error("ALREADY_USED");
    token.psionicDice = (token.psionicDice ?? 0) - 1;
    const ally = ctx.target ?? ctx.allies.find((a) => a.id !== token.id);
    if (ally) {
      ally.x = (ally.x ?? 0) + 3;
    }
    return { line: `${token.name} moves a creature with telekinesis.`, rolls: [] };
  },
  bulwark_of_force(token, ctx) {
    spendOnce(token, "bulwark_of_force");
    for (const ally of ctx.allies) ally.ac = (ally.ac ?? 10) + 2;
    return { line: `${token.name} raises a bulwark of force.`, rolls: [] };
  },
  psychic_blades(token, ctx) {
    const foe = ctx.target ?? ctx.foes[0];
    if (!foe) throw new Error("NEED_TARGET");
    const { roll, total } = die(token.name, "1d6", "damage", "Psychic Blade");
    foe.hp = Math.max(0, foe.hp - total);
    return { line: `${token.name} strikes with a psychic blade.`, rolls: [roll] };
  },
  psychic_veil(token) {
    if ((uses(token).psychic_veil ?? 1) <= 0 && (token.psionicDice ?? 0) < 1) throw new Error("ALREADY_USED");
    if ((uses(token).psychic_veil ?? 1) > 0) uses(token).psychic_veil = 0;
    else token.psionicDice = (token.psionicDice ?? 0) - 1;
    token.invisible = true;
    return { line: `${token.name} veils in psychic invisibility.`, rolls: [] };
  },
  spell_thief(token, ctx) {
    spendOnce(token, "spell_thief");
    const foe = ctx.target ?? ctx.foes[0];
    if (foe) uses(token).stolen_spell = 1;
    token.reactionReady = false;
    return { line: `${token.name} steals a spell.`, rolls: [] };
  },
  arcane_ward_refresh(token, ctx) {
    token.arcaneWardMax = arcaneWardMax(ctx.level, mod(ctx.abilities.int ?? 10));
    token.arcaneWardHp = token.arcaneWardMax;
    return { line: `${token.name} renews the Arcane Ward.`, rolls: [] };
  },
  projected_ward(token, ctx) {
    const ally = ctx.target ?? ctx.allies.find((a) => a.id !== token.id);
    if (!ally || (token.arcaneWardHp ?? 0) <= 0) throw new Error("BAD_ABILITY");
    token.reactionReady = false;
    uses(ally).projected_ward = 1;
    return { line: `${token.name} projects the Arcane Ward onto ${ally.name}.`, rolls: [] };
  },
  portent(token) {
    const n = hasSub(token, "greater_portent") ? 3 : 2;
    token.portentDice = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 20));
    return { line: `${token.name} glimpses portent dice: ${token.portentDice.join(", ")}.`, rolls: [] };
  },
  third_eye(token) {
    token.invisible = false;
    uses(token).third_eye = 1;
    return { line: `${token.name} opens a third eye.`, rolls: [] };
  },
  illusory_self(token) {
    spendOnce(token, "illusory_self");
    token.reactionReady = false;
    uses(token).illusory_self_negated = 1;
    return { line: `${token.name} spoofs an attack with an illusory self.`, rolls: [] };
  },
  overchannel(token) {
    const bag = uses(token);
    bag.overchannel = (bag.overchannel ?? 0) + 1;
    if ((bag.overchannel ?? 0) >= 2) {
      const dmg = rollNotation(`2d12`).total * Math.max(1, token.level ?? 1);
      token.hp = Math.max(1, (token.hp ?? 1) - dmg);
    }
    bag.overchannel_ready = 1;
    return { line: `${token.name} overchannels a spell.`, rolls: [] };
  },
  shadow_step(token) {
    token.x = (token.x ?? 0) + 6;
    uses(token).shadow_step_adv = 1;
    if (hasSub(token, "improved_shadow_step") && (token.ki ?? 0) >= 1) {
      token.ki = (token.ki ?? 0) - 1;
      uses(token).shadow_step_strike = 1;
    }
    return { line: `${token.name} steps through shadow.`, rolls: [] };
  },
  cloak_of_shadows(token) {
    if ((token.ki ?? 0) < 3) throw new Error("ALREADY_USED");
    token.ki = (token.ki ?? 0) - 3;
    token.invisible = true;
    return { line: `${token.name} cloaks in shadows.`, rolls: [] };
  },
  elemental_attunement(token) {
    if ((token.ki ?? 0) < 1) throw new Error("ALREADY_USED");
    token.ki = (token.ki ?? 0) - 1;
    token.elementalAttuned = true;
    return { line: `${token.name} attunes to the elements.`, rolls: [] };
  },
  environmental_aid(token, ctx) {
    if ((token.ki ?? 0) < 2) throw new Error("ALREADY_USED");
    token.ki = (token.ki ?? 0) - 2;
    const { roll, total } = die(token.name, "3d6", "damage", "Environmental Aid");
    for (const foe of ctx.foes.slice(0, 4)) foe.hp = Math.max(0, foe.hp - total);
    for (const ally of ctx.allies.slice(0, 2)) heal(ally, total);
    return { line: `${token.name} unleashes environmental aid.`, rolls: [roll] };
  },
  breath_of_the_dragon(token, ctx) {
    const bag = uses(token);
    if ((bag.dragon_breath ?? 0) < 1 && (token.ki ?? 0) < 1) throw new Error("ALREADY_USED");
    if ((bag.dragon_breath ?? 0) > 0) bag.dragon_breath -= 1;
    else token.ki = (token.ki ?? 0) - 1;
    const { roll, total } = die(token.name, "2d6", "damage", "Breath of the Dragon");
    for (const foe of ctx.foes.slice(0, 3)) {
      foe.hp = Math.max(0, foe.hp - total);
      if (hasSub(token, "frightful_presence") && (token.ki ?? 0) >= 1) {
        token.ki = (token.ki ?? 0) - 1;
        foe.conditions = [...new Set([...(foe.conditions ?? []), "frightened"])];
      }
    }
    return { line: `${token.name} breathes draconic energy.`, rolls: [roll] };
  },
  natures_wrath(token, ctx) {
    if ((token.channelDivinity ?? 0) < 1) throw new Error("ALREADY_USED");
    token.channelDivinity = (token.channelDivinity ?? 0) - 1;
    const foe = ctx.target ?? ctx.foes[0];
    if (!foe) throw new Error("NEED_TARGET");
    const dc = 8 + ctx.prof + mod(ctx.abilities.cha ?? 10);
    const roll = rollCheck({ roller: foe.name, label: "Nature's Wrath", bonus: 0, dc, purpose: "save" });
    if (roll.outcome !== "success") foe.conditions = [...new Set([...(foe.conditions ?? []), "restrained"])];
    return { line: `${token.name} binds ${foe.name} with nature's wrath.`, rolls: [roll] };
  },
  vow_of_enmity(token, ctx) {
    if ((token.channelDivinity ?? 0) < 1) throw new Error("ALREADY_USED");
    token.channelDivinity = (token.channelDivinity ?? 0) - 1;
    const foe = ctx.target ?? ctx.foes[0];
    if (!foe) throw new Error("NEED_TARGET");
    token.vowTargetId = foe.id;
    return { line: `${token.name} vows enmity against ${foe.name}.`, rolls: [] };
  },
  peerless_athlete(token) {
    if ((token.channelDivinity ?? 0) < 1) throw new Error("ALREADY_USED");
    token.channelDivinity = (token.channelDivinity ?? 0) - 1;
    uses(token).peerless_athlete = 1;
    token.speedCells = (token.speedCells ?? 6) + 2;
    return { line: `${token.name} becomes a peerless athlete.`, rolls: [] };
  },
  holy_nimbus(token, ctx) {
    spendOnce(token, "holy_nimbus");
    uses(token).holy_nimbus = 1;
    for (const foe of ctx.foes) {
      const dmg = 5 + mod(ctx.abilities.cha ?? 10);
      foe.hp = Math.max(0, foe.hp - dmg);
    }
    return { line: `${token.name} shines with a holy nimbus.`, rolls: [] };
  },
  elder_champion(token) {
    spendOnce(token, "elder_champion");
    uses(token).elder_champion = 1;
    return { line: `${token.name} becomes an elder champion.`, rolls: [] };
  },
  avenging_angel(token, ctx) {
    spendOnce(token, "avenging_angel");
    token.speedCells = Math.max(token.speedCells ?? 6, 12);
    for (const foe of ctx.foes) foe.conditions = [...new Set([...(foe.conditions ?? []), "frightened"])];
    return { line: `${token.name} becomes an avenging angel.`, rolls: [] };
  },
  living_legend(token) {
    spendOnce(token, "living_legend");
    uses(token).living_legend = 1;
    token.heroicInspiration = true;
    return { line: `${token.name} becomes a living legend.`, rolls: [] };
  },
  glorious_defense(token, ctx) {
    const ally = ctx.target ?? token;
    ally.ac = (ally.ac ?? 10) + Math.max(1, mod(ctx.abilities.cha ?? 10));
    token.reactionReady = false;
    return { line: `${token.name} mounts a glorious defense.`, rolls: [] };
  },
  shadowy_dodge(token, ctx) {
    const foe = ctx.target ?? ctx.foes[0];
    if (foe) foe.auraAttackDisadvAgainst = true;
    token.reactionReady = false;
    return { line: `${token.name} dodges into shadow.`, rolls: [] };
  },
  misty_wanderer(token, ctx) {
    const bag = uses(token);
    if ((bag.misty_wanderer ?? 0) < 1) throw new Error("ALREADY_USED");
    bag.misty_wanderer -= 1;
    token.x = (token.x ?? 0) + 3;
    const ally = ctx.target;
    if (ally) {
      ally.x = token.x;
      ally.y = token.y;
    }
    return { line: `${token.name} misty-steps as a wanderer.`, rolls: [] };
  },
  fey_reinforcements(token) {
    spendOnce(token, "fey_reinforcements");
    uses(token).fey_summon = 1;
    return { line: `${token.name} summons fey reinforcements.`, rolls: [] };
  },
  primal_companion(token, ctx) {
    const hp = primalCompanionHp(ctx.level, mod(ctx.abilities.wis ?? 10));
    token.companion = { hp, maxHp: hp, attacks: hasSub(token, "bestial_fury") ? 2 : 1 };
    return { line: `${token.name} calls a primal companion (${hp} HP).`, rolls: [] };
  },
  companion_attack(token, ctx) {
    if (!token.companion || token.companion.hp <= 0) throw new Error("BAD_ABILITY");
    const foe = ctx.target ?? ctx.foes[0];
    if (!foe) throw new Error("NEED_TARGET");
    const attacks = token.companion.attacks;
    const rolls: DiceRoll[] = [];
    for (let i = 0; i < attacks; i++) {
      const { roll, total } = die(token.name, `1d8+${ctx.prof}`, "damage", "Companion");
      foe.hp = Math.max(0, foe.hp - total);
      rolls.push(roll);
    }
    return { line: `${token.name}'s companion attacks.`, rolls };
  },
  tides_of_chaos(token) {
    if (token.tidesUsed) throw new Error("ALREADY_USED");
    token.tidesUsed = true;
    token.heroicInspiration = true;
    token.wildMagicReady = true;
    return { line: `${token.name} rides the tides of chaos.`, rolls: [] };
  },
  bend_luck(token, ctx) {
    if ((token.sorceryPoints ?? 0) < 2) throw new Error("ALREADY_USED");
    token.sorceryPoints = (token.sorceryPoints ?? 0) - 2;
    const { roll, total } = die(token.name, "1d4", "check", "Bend Luck");
    const ally = ctx.target ?? ctx.allies[0] ?? token;
    uses(ally).bend_luck = total;
    token.reactionReady = false;
    return { line: `${token.name} bends luck by ${total}.`, rolls: [roll] };
  },
  wild_magic_surge(token, ctx) {
    const controlled = hasSub(token, "controlled_chaos");
    const surge = rollWildMagicSurge(controlled);
    const table = wildMagicSurgeTable();
    const row = table.find((r) => r.id === surge.chosen) ?? table[0]!;
    const line = row.apply(token, ctx.foes);
    return { line: `${token.name} surges: ${row.label} (${line}).`, rolls: [] };
  },
  dragon_wings(token) {
    token.speedCells = Math.max(token.speedCells ?? 6, token.speedCells ?? 6);
    uses(token).flying = 1;
    return { line: `${token.name} unfurls dragon wings.`, rolls: [] };
  },
  dragon_presence(token, ctx) {
    if ((token.sorceryPoints ?? 0) < 5) throw new Error("ALREADY_USED");
    token.sorceryPoints = (token.sorceryPoints ?? 0) - 5;
    for (const foe of ctx.foes) foe.conditions = [...new Set([...(foe.conditions ?? []), "frightened"])];
    return { line: `${token.name} projects dragon presence.`, rolls: [] };
  },
  telepathic_speech(token, ctx) {
    const ally = ctx.target ?? ctx.allies.find((a) => a.id !== token.id);
    if (ally) uses(ally).telepathy = ctx.level;
    return { line: `${token.name} opens telepathic speech.`, rolls: [] };
  },
  revelation_in_flesh(token) {
    if ((token.sorceryPoints ?? 0) < 1) throw new Error("ALREADY_USED");
    token.sorceryPoints = (token.sorceryPoints ?? 0) - 1;
    uses(token).revelation = 1;
    token.speedCells = (token.speedCells ?? 6) + 2;
    return { line: `${token.name} reveals aberrant flesh.`, rolls: [] };
  },
  warping_implosion(token, ctx) {
    if ((token.sorceryPoints ?? 0) < 5) throw new Error("ALREADY_USED");
    token.sorceryPoints = (token.sorceryPoints ?? 0) - 5;
    const { roll, total } = die(token.name, "3d10", "damage", "Warping Implosion");
    for (const foe of ctx.foes.slice(0, 4)) foe.hp = Math.max(0, foe.hp - total);
    token.x = (token.x ?? 0) + 12;
    return { line: `${token.name} implodes and warps away.`, rolls: [roll] };
  },
  restore_balance(token, ctx) {
    const bag = uses(token);
    if ((bag.restore_balance ?? 0) < 1) throw new Error("ALREADY_USED");
    bag.restore_balance -= 1;
    const foe = ctx.target ?? ctx.foes[0];
    if (foe) uses(foe).no_adv_disadv = 1;
    token.reactionReady = false;
    return { line: `${token.name} restores balance.`, rolls: [] };
  },
  bastion_of_law(token, ctx) {
    const spend = Math.min(5, Math.max(1, token.sorceryPoints ?? 0));
    if (spend < 1) throw new Error("ALREADY_USED");
    token.sorceryPoints = (token.sorceryPoints ?? 0) - spend;
    const ally = ctx.target ?? token;
    uses(ally).bastion_dice = spend;
    return { line: `${token.name} builds a bastion of law (${spend}d8).`, rolls: [] };
  },
  trance_of_order(token) {
    if ((token.sorceryPoints ?? 0) < 5) throw new Error("ALREADY_USED");
    token.sorceryPoints = (token.sorceryPoints ?? 0) - 5;
    uses(token).trance_of_order = 1;
    return { line: `${token.name} enters a trance of order.`, rolls: [] };
  },
  clockwork_cavalcade(token, ctx) {
    spendOnce(token, "clockwork_cavalcade");
    let pool = 100;
    for (const ally of ctx.allies) {
      const need = ally.maxHp - ally.hp;
      const give = Math.min(need, pool);
      heal(ally, give);
      pool -= give;
      if (pool <= 0) break;
    }
    return { line: `${token.name} summons a clockwork cavalcade.`, rolls: [] };
  },
  steps_of_the_fey(token, ctx) {
    const bag = uses(token);
    if ((bag.fey_step ?? 0) < 1) throw new Error("ALREADY_USED");
    bag.fey_step -= 1;
    token.x = (token.x ?? 0) + 3;
    const opt = choice(token, "fey_step") ?? "refreshing";
    if (opt === "refreshing") {
      const ally = ctx.allies.find((a) => a.id !== token.id);
      if (ally) ally.tempHp = Math.max(ally.tempHp ?? 0, ctx.level);
    } else if (opt === "disrupting") {
      const foe = ctx.foes[0];
      if (foe) foe.conditions = [...new Set([...(foe.conditions ?? []), "frightened"])];
    } else if (opt === "taunting") {
      for (const foe of ctx.foes.slice(0, 3)) uses(foe).must_target = 1;
    }
    if (hasSub(token, "bewitching_leap")) {
      const ally = ctx.target;
      if (ally) {
        ally.x = token.x;
        ally.y = token.y;
      }
    }
    return { line: `${token.name} takes the steps of the fey.`, rolls: [] };
  },
  misty_escape(token) {
    spendOnce(token, "misty_escape");
    token.x = (token.x ?? 0) + 3;
    token.invisible = true;
    token.reactionReady = false;
    return { line: `${token.name} misty-escapes.`, rolls: [] };
  },
  beguiling_defenses(token, ctx) {
    const foe = ctx.target ?? ctx.foes[0];
    if (foe) foe.conditions = [...new Set([...(foe.conditions ?? []), "charmed"])];
    token.reactionReady = false;
    return { line: `${token.name} turns charm back on the foe.`, rolls: [] };
  },
  healing_light(token, ctx) {
    const maxSpend = Math.max(1, mod(ctx.abilities.cha ?? 10));
    const have = token.healingLightDice ?? 0;
    const spend = Math.min(maxSpend, have, 1);
    if (spend < 1) throw new Error("ALREADY_USED");
    token.healingLightDice = have - spend;
    const ally = ctx.target ?? token;
    const { roll, total } = die(token.name, `${spend}d6`, "heal", "Healing Light");
    heal(ally, total);
    return { line: `${token.name} shines healing light.`, rolls: [roll] };
  },
  searing_vengeance(token, ctx) {
    spendOnce(token, "searing_vengeance");
    token.hp = Math.max(token.hp, Math.floor(token.maxHp / 2));
    token.dying = false;
    const { roll, total } = die(token.name, `2d8+${mod(ctx.abilities.cha ?? 10)}`, "damage", "Searing Vengeance");
    for (const foe of ctx.foes) {
      foe.hp = Math.max(0, foe.hp - total);
      foe.conditions = [...new Set([...(foe.conditions ?? []), "blinded"])];
    }
    return { line: `${token.name} erupts in searing vengeance.`, rolls: [roll] };
  },
  create_thrall(token, ctx) {
    const foe = ctx.target ?? ctx.foes[0];
    if (!foe) throw new Error("NEED_TARGET");
    foe.conditions = [...new Set([...(foe.conditions ?? []), "charmed"])];
    uses(token).thrall = 1;
    return { line: `${token.name} creates a thrall of ${foe.name}.`, rolls: [] };
  },
  inspiring_movement(token, ctx) {
    if ((token.bardicLeft ?? 0) < 1) throw new Error("ALREADY_USED");
    token.bardicLeft = (token.bardicLeft ?? 0) - 1;
    token.disengaging = true;
    token.x = (token.x ?? 0) + Math.floor((token.speedCells ?? 6) / 2);
    const ally = ctx.target ?? ctx.allies.find((a) => a.id !== token.id);
    if (ally) {
      ally.disengaging = true;
      ally.x = token.x;
    }
    token.reactionReady = false;
    return { line: `${token.name} leads an inspiring movement.`, rolls: [] };
  },
  dazzling_unarmed(token, ctx) {
    const foe = ctx.target ?? ctx.foes[0];
    if (!foe) throw new Error("NEED_TARGET");
    const { roll, total } = die(token.name, "1d6", "damage", "Dazzling Footwork");
    foe.hp = Math.max(0, foe.hp - total);
    return { line: `${token.name} lands a dazzling unarmed strike.`, rolls: [roll] };
  },
  choose_hunters_prey(token) {
    const pick = choice(token, "hunters_prey") ?? "colossus_slayer";
    setSubclassChoice(token, "hunters_prey", pick);
    return { line: `${token.name} specializes in ${pick.replace(/_/g, " ")}.`, rolls: [] };
  },
  choose_defensive_tactics(token) {
    const pick = choice(token, "defensive_tactics") ?? "escape_the_horde";
    setSubclassChoice(token, "defensive_tactics", pick);
    return { line: `${token.name} adopts ${pick.replace(/_/g, " ")}.`, rolls: [] };
  },
  choose_dragon_ancestry(token) {
    const pick = choice(token, "dragon_ancestry") ?? "fire";
    setSubclassChoice(token, "dragon_ancestry", pick);
    return { line: `${token.name} claims ${pick} dragon ancestry.`, rolls: [] };
  },
  choose_circle_spells(token) {
    const pick = choice(token, "circle_spells") ?? "temperate";
    setSubclassChoice(token, "circle_spells", pick);
    return { line: `${token.name} attunes to the ${pick} land.`, rolls: [] };
  },
  undying_sentinel(token) {
    spendOnce(token, "undying_sentinel");
    token.hp = Math.max(token.hp, 1);
    token.dying = false;
    return { line: `${token.name} refuses to fall (Undying Sentinel).`, rolls: [] };
  },
  rage_beyond_death(token) {
    if (!token.raging) throw new Error("BAD_ABILITY");
    uses(token).rage_beyond_death = 1;
    token.dying = false;
    token.hp = Math.max(token.hp, 1);
    return { line: `${token.name} rages beyond death.`, rolls: [] };
  },
};

function spendOnce(token: Subclassful, key: string): void {
  const bag = uses(token);
  if ((bag[key] ?? 1) <= 0) throw new Error("ALREADY_USED");
  bag[key] = 0;
}

function spendManeuver(token: Subclassful, ctx: SubclassCtx, kind: string): { line: string; rolls: DiceRoll[] } {
  const dieSize = token.superiorityDie ?? (hasSub(token, "improved_combat_superiority") ? "1d10" : "1d8");
  if ((token.superiorityDice ?? 0) <= 0) {
    if (hasSub(token, "relentless")) {
      const { roll, total } = die(token.name, "1d8", "damage", `Maneuver ${kind}`);
      applyManeuver(token, ctx, kind, total);
      return { line: `${token.name} uses Relentless ${kind}.`, rolls: [roll] };
    }
    throw new Error("ALREADY_USED");
  }
  token.superiorityDice = (token.superiorityDice ?? 0) - 1;
  const { roll, total } = die(token.name, dieSize, "damage", `Maneuver ${kind}`);
  applyManeuver(token, ctx, kind, total);
  return { line: `${token.name} uses ${kind} maneuver.`, rolls: [roll] };
}

function applyManeuver(token: Subclassful, ctx: SubclassCtx, kind: string, total: number): void {
  const foe = ctx.target ?? ctx.foes[0];
  if (!foe) return;
  if (kind === "trip") foe.conditions = [...new Set([...(foe.conditions ?? []), "prone"])];
  if (kind === "push") foe.x = (foe.x ?? 0) + Math.sign((foe.x ?? 0) - (token.x ?? 0) || 1);
  if (kind === "menacing") foe.conditions = [...new Set([...(foe.conditions ?? []), "frightened"])];
  if (kind === "precision") uses(token).precision_bonus = total;
  if (kind === "sweeping" || kind === "riposte") foe.hp = Math.max(0, foe.hp - total);
}

export function castSubclassFeature(
  token: Subclassful,
  effectType: string,
  ctx: SubclassCtx & { choice?: string },
): { line: string; rolls: DiceRoll[] } | null {
  if (ctx.choice && effectType.startsWith("choose_")) {
    const key = effectType.replace(/^choose_/, "");
    if (SUBCLASS_FEATURE_CHOICES[key]) setSubclassChoice(token, key, ctx.choice);
  }
  const run = ACTIONS[effectType];
  if (!run) return null;
  return run(token, ctx);
}

export function seedSubclassResources(token: Subclassful, level: number, abilities: Record<string, number>, pb: number): void {
  const bag = uses(token);
  if (hasSub(token, "warding_flare")) bag.warding_flare = pb;
  if (hasSub(token, "war_priest")) bag.war_priest = pb;
  if (hasSub(token, "combat_superiority")) {
    token.superiorityDice = 4 + (hasSub(token, "know_your_enemy") ? 0 : 0);
    token.superiorityDie = hasSub(token, "improved_combat_superiority") ? "1d10" : "1d8";
    if (level >= 7 && hasSub(token, "know_your_enemy")) token.superiorityDice = 5;
  }
  if (hasSub(token, "psionic_power")) {
    token.psionicDice = psiDieCount(pb);
    token.psionicDie = level >= 5 ? (level >= 11 ? "1d8" : "1d6") : "1d6";
  }
  if (hasSub(token, "healing_light")) token.healingLightDice = healingLightDice(level);
  if (hasSub(token, "zealous_presence")) bag.zealous_presence = 1;
  if (hasSub(token, "fanatical_focus")) bag.fanatical_focus = 1;
  if (hasSub(token, "mantle_of_majesty")) bag.mantle_of_majesty = 1;
  if (hasSub(token, "unbreakable_majesty")) bag.unbreakable_majesty = 1;
  if (hasSub(token, "corona_of_light")) bag.corona_of_light = 1;
  if (hasSub(token, "cosmic_omen")) {
    bag.cosmic_omen = pb;
    bag.cosmic_weal = Math.random() < 0.5 ? 1 : 0;
  }
  if (hasSub(token, "breath_of_the_dragon")) bag.dragon_breath = pb;
  if (hasSub(token, "holy_nimbus")) bag.holy_nimbus = 1;
  if (hasSub(token, "elder_champion")) bag.elder_champion = 1;
  if (hasSub(token, "avenging_angel")) bag.avenging_angel = 1;
  if (hasSub(token, "living_legend")) bag.living_legend = 1;
  if (hasSub(token, "undying_sentinel")) bag.undying_sentinel = 1;
  if (hasSub(token, "fey_reinforcements")) bag.fey_reinforcements = 1;
  if (hasSub(token, "misty_wanderer")) bag.misty_wanderer = Math.max(1, mod(abilities.wis ?? 10));
  if (hasSub(token, "steps_of_the_fey")) bag.fey_step = pb;
  if (hasSub(token, "misty_escape")) bag.misty_escape = 1;
  if (hasSub(token, "searing_vengeance")) bag.searing_vengeance = 1;
  if (hasSub(token, "clockwork_cavalcade")) bag.clockwork_cavalcade = 1;
  if (hasSub(token, "restore_balance")) bag.restore_balance = pb;
  if (hasSub(token, "psychic_veil")) bag.psychic_veil = 1;
  if (hasSub(token, "spell_thief")) bag.spell_thief = 1;
  if (hasSub(token, "illusory_self")) bag.illusory_self = 1;
  if (hasSub(token, "bulwark_of_force")) bag.bulwark_of_force = 1;
  if (hasSub(token, "portent") || hasSub(token, "greater_portent")) {
    const n = hasSub(token, "greater_portent") ? 3 : 2;
    token.portentDice = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 20));
  }
  if (hasSub(token, "arcane_ward")) {
    token.arcaneWardMax = arcaneWardMax(level, mod(abilities.int ?? 10));
    token.arcaneWardHp = token.arcaneWardMax;
  }
  if (hasSub(token, "draconic_resilience")) {
    token.ac = Math.max(token.ac, 13 + mod(abilities.dex ?? 10));
  }
  if (hasSub(token, "dazzling_footwork") && !token.heavyArmor) {
    token.ac = Math.max(token.ac, danceUnarmoredAc(mod(abilities.dex ?? 10), mod(abilities.cha ?? 10)));
  }
  if (hasSub(token, "avatar_of_battle")) {
    token.damageResistances = [...new Set([...(token.damageResistances ?? []), "bludgeoning", "piercing", "slashing"])];
  }
  if (hasSub(token, "starry_flare") && token.starryForm) {
    token.damageResistances = [...new Set([...(token.damageResistances ?? []), "bludgeoning", "piercing", "slashing"])];
  }
  if (hasSub(token, "aura_of_warding")) {
    uses(token).spell_damage_resist = 1;
  }
  if (hasSub(token, "aura_of_alacrity")) {
    token.speedCells = (token.speedCells ?? 6) + 2;
  }
  if (hasSub(token, "aquatic_affinity")) uses(token).swim = 1;
  if (hasSub(token, "stormborn") && token.wrathOfSea) {
    uses(token).flying = 1;
    token.damageResistances = [...new Set([...(token.damageResistances ?? []), "cold", "lightning"])];
  }
  if (hasSub(token, "iron_mind")) {
    token.saves = { ...(token.saves ?? {}), wis: (token.saves?.wis ?? 0) + 2 };
  }
  if (hasSub(token, "beguiling_defenses")) {
    token.conditions = (token.conditions ?? []).filter((c) => c !== "charmed");
  }
  if (hasSub(token, "thought_shield")) {
    token.damageResistances = [...new Set([...(token.damageResistances ?? []), "psychic"])];
  }
  if (hasSub(token, "radiant_soul")) {
    token.damageResistances = [...new Set([...(token.damageResistances ?? []), "radiant"])];
  }
  if (hasSub(token, "celestial_resilience")) {
    token.tempHp = Math.max(token.tempHp ?? 0, level + mod(abilities.cha ?? 10));
  }
  if (hasSub(token, "primal_companion") && !token.companion) {
    const hp = primalCompanionHp(level, mod(abilities.wis ?? 10));
    token.companion = { hp, maxHp: hp, attacks: hasSub(token, "bestial_fury") ? 2 : 1 };
  }
}

export function subclassMenus(token: Subclassful): { actions: string[]; bonus: string[]; reactions: string[] } {
  const actions: string[] = [];
  const bonus: string[] = [];
  const reactions: string[] = [];
  const bag = token.abilityUses ?? {};
  const push = (list: string[], id: string, ok = true) => {
    if (ok && !list.includes(id)) list.push(id);
  };

  if (hasSub(token, "vitality_of_the_tree") && token.raging) push(bonus, "vitality_grant");
  if (hasSub(token, "branches_of_the_tree")) push(reactions, "branches_of_the_tree");
  if (hasSub(token, "travel_along_the_tree") && token.raging) push(bonus, "travel_along_the_tree");
  if (hasSub(token, "rage_of_the_wild")) push(bonus, "choose_rage_of_the_wild");
  if (hasSub(token, "aspect_of_the_wild") && !choice(token, "aspect_of_the_wild")) push(actions, "choose_aspect_of_the_wild");
  if (hasSub(token, "zealous_presence") && (bag.zealous_presence ?? 0) > 0) push(bonus, "zealous_presence");
  if (hasSub(token, "fanatical_focus") && token.raging && (bag.fanatical_focus ?? 0) > 0) push(reactions, "fanatical_focus");
  if (hasSub(token, "mantle_of_inspiration") && (token.bardicLeft ?? 0) > 0) push(bonus, "mantle_of_inspiration");
  if (hasSub(token, "mantle_of_majesty") && (bag.mantle_of_majesty ?? 0) > 0) push(bonus, "mantle_of_majesty");
  if (hasSub(token, "unbreakable_majesty") && (bag.unbreakable_majesty ?? 0) > 0) push(bonus, "unbreakable_majesty");
  if (hasSub(token, "inspiring_movement") && (token.bardicLeft ?? 0) > 0) push(reactions, "inspiring_movement");
  if (hasSub(token, "dazzling_footwork") && (token.bardicLeft ?? 0) >= 0) push(bonus, "dazzling_unarmed");
  if (hasSub(token, "warding_flare") && (bag.warding_flare ?? 0) > 0) push(reactions, "warding_flare");
  if (hasSub(token, "radiance_of_the_dawn") && (token.channelDivinity ?? 0) > 0) push(actions, "radiance_of_the_dawn");
  if (hasSub(token, "corona_of_light") && (bag.corona_of_light ?? 0) > 0) push(actions, "corona_of_light");
  if (hasSub(token, "blessing_of_the_trickster")) push(actions, "blessing_of_the_trickster");
  if (hasSub(token, "invoke_duplicity") && (token.channelDivinity ?? 0) > 0) push(bonus, "invoke_duplicity");
  if (hasSub(token, "tricksters_transposition") && token.duplicityActive) push(bonus, "tricksters_transposition");
  if (hasSub(token, "war_priest") && (bag.war_priest ?? 0) > 0) push(bonus, "war_priest");
  if (hasSub(token, "guided_strike") && (token.channelDivinity ?? 0) > 0) push(reactions, "guided_strike");
  if (hasSub(token, "war_gods_blessing") && (token.channelDivinity ?? 0) > 0) push(actions, "war_gods_blessing");
  if (hasSub(token, "moonlight_step")) push(bonus, "moonlight_step");
  if (hasSub(token, "starry_form")) push(bonus, "starry_form");
  if (token.starryForm === "archer") push(bonus, "starry_archer");
  if (hasSub(token, "cosmic_omen") && (bag.cosmic_omen ?? 0) > 0) push(reactions, "cosmic_omen");
  if (hasSub(token, "wrath_of_the_sea")) push(bonus, "wrath_of_the_sea");
  if (hasSub(token, "oceanic_gift")) push(bonus, "oceanic_gift");
  if (hasSub(token, "circle_spells") && !choice(token, "circle_spells")) push(actions, "choose_circle_spells");
  if (hasSub(token, "combat_superiority") && (token.superiorityDice ?? 0) > 0) {
    for (const m of ["trip", "push", "menacing", "riposte", "precision", "sweeping"]) push(bonus, `combat_superiority_${m}`);
  }
  if (hasSub(token, "know_your_enemy")) push(bonus, "know_your_enemy");
  if (hasSub(token, "psionic_power") && (token.psionicDice ?? 0) > 0) {
    push(reactions, "protective_field");
    push(bonus, "telekinetic_movement");
  }
  if (hasSub(token, "telekinetic_leap")) push(bonus, "telekinetic_leap");
  if (hasSub(token, "bulwark_of_force") && (bag.bulwark_of_force ?? 0) > 0) push(bonus, "bulwark_of_force");
  if (hasSub(token, "psychic_blades")) push(bonus, "psychic_blades");
  if (hasSub(token, "psychic_veil")) push(actions, "psychic_veil");
  if (hasSub(token, "spell_thief") && (bag.spell_thief ?? 0) > 0) push(reactions, "spell_thief");
  if (hasSub(token, "fast_fingers") || hasSub(token, "fast_hands")) push(bonus, "std_utilize");
  if (hasSub(token, "arcane_ward")) push(bonus, "arcane_ward_refresh");
  if (hasSub(token, "projected_ward") && (token.arcaneWardHp ?? 0) > 0) push(reactions, "projected_ward");
  if (hasSub(token, "portent") || hasSub(token, "greater_portent")) push(bonus, "portent");
  if (hasSub(token, "third_eye")) push(actions, "third_eye");
  if (hasSub(token, "illusory_self") && (bag.illusory_self ?? 0) > 0) push(reactions, "illusory_self");
  if (hasSub(token, "overchannel")) push(bonus, "overchannel");
  if (hasSub(token, "shadow_step")) push(bonus, "shadow_step");
  if (hasSub(token, "cloak_of_shadows") && (token.ki ?? 0) >= 3) push(actions, "cloak_of_shadows");
  if (hasSub(token, "elemental_attunement") && (token.ki ?? 0) >= 1) push(bonus, "elemental_attunement");
  if (hasSub(token, "environmental_aid") && (token.ki ?? 0) >= 2) push(actions, "environmental_aid");
  if (hasSub(token, "breath_of_the_dragon")) push(actions, "breath_of_the_dragon");
  if (hasSub(token, "natures_wrath") && (token.channelDivinity ?? 0) > 0) push(bonus, "natures_wrath");
  if (hasSub(token, "vow_of_enmity") && (token.channelDivinity ?? 0) > 0) push(bonus, "vow_of_enmity");
  if (hasSub(token, "peerless_athlete") && (token.channelDivinity ?? 0) > 0) push(bonus, "peerless_athlete");
  if (hasSub(token, "holy_nimbus") && (bag.holy_nimbus ?? 0) > 0) push(actions, "holy_nimbus");
  if (hasSub(token, "elder_champion") && (bag.elder_champion ?? 0) > 0) push(actions, "elder_champion");
  if (hasSub(token, "avenging_angel") && (bag.avenging_angel ?? 0) > 0) push(actions, "avenging_angel");
  if (hasSub(token, "living_legend") && (bag.living_legend ?? 0) > 0) push(actions, "living_legend");
  if (hasSub(token, "glorious_defense")) push(reactions, "glorious_defense");
  if (hasSub(token, "shadowy_dodge")) push(reactions, "shadowy_dodge");
  if (hasSub(token, "misty_wanderer") && (bag.misty_wanderer ?? 0) > 0) push(bonus, "misty_wanderer");
  if (hasSub(token, "fey_reinforcements") && (bag.fey_reinforcements ?? 0) > 0) push(actions, "fey_reinforcements");
  if (hasSub(token, "primal_companion")) push(bonus, "primal_companion");
  if (token.companion && token.companion.hp > 0) push(bonus, "companion_attack");
  if (hasSub(token, "hunters_prey") && !choice(token, "hunters_prey")) push(actions, "choose_hunters_prey");
  if (hasSub(token, "defensive_tactics") && !choice(token, "defensive_tactics")) push(actions, "choose_defensive_tactics");
  if (hasSub(token, "dragon_ancestry") && !choice(token, "dragon_ancestry")) push(actions, "choose_dragon_ancestry");
  if (hasSub(token, "tides_of_chaos") && !token.tidesUsed) push(bonus, "tides_of_chaos");
  if (hasSub(token, "bend_luck") && (token.sorceryPoints ?? 0) >= 2) push(reactions, "bend_luck");
  if (hasSub(token, "wild_magic_surge")) push(bonus, "wild_magic_surge");
  if (hasSub(token, "dragon_wings")) push(bonus, "dragon_wings");
  if (hasSub(token, "dragon_presence") && (token.sorceryPoints ?? 0) >= 5) push(actions, "dragon_presence");
  if (hasSub(token, "telepathic_speech")) push(bonus, "telepathic_speech");
  if (hasSub(token, "revelation_in_flesh") && (token.sorceryPoints ?? 0) >= 1) push(bonus, "revelation_in_flesh");
  if (hasSub(token, "warping_implosion") && (token.sorceryPoints ?? 0) >= 5) push(actions, "warping_implosion");
  if (hasSub(token, "restore_balance") && (bag.restore_balance ?? 0) > 0) push(reactions, "restore_balance");
  if (hasSub(token, "bastion_of_law") && (token.sorceryPoints ?? 0) >= 1) push(bonus, "bastion_of_law");
  if (hasSub(token, "trance_of_order") && (token.sorceryPoints ?? 0) >= 5) push(bonus, "trance_of_order");
  if (hasSub(token, "clockwork_cavalcade") && (bag.clockwork_cavalcade ?? 0) > 0) push(actions, "clockwork_cavalcade");
  if (hasSub(token, "steps_of_the_fey") && (bag.fey_step ?? 0) > 0) push(bonus, "steps_of_the_fey");
  if (hasSub(token, "misty_escape") && (bag.misty_escape ?? 0) > 0) push(reactions, "misty_escape");
  if (hasSub(token, "beguiling_defenses")) push(reactions, "beguiling_defenses");
  if (hasSub(token, "healing_light") && (token.healingLightDice ?? 0) > 0) push(bonus, "healing_light");
  if (hasSub(token, "searing_vengeance") && (bag.searing_vengeance ?? 0) > 0) push(actions, "searing_vengeance");
  if (hasSub(token, "create_thrall")) push(actions, "create_thrall");
  if (hasSub(token, "undying_sentinel") && (bag.undying_sentinel ?? 0) > 0) push(reactions, "undying_sentinel");
  if (hasSub(token, "rage_beyond_death") && token.raging) push(bonus, "rage_beyond_death");

  return { actions, bonus, reactions };
}

export function subclassDamageRider(
  token: Subclassful,
  level: number,
  abilities: Record<string, number>,
  opts: {
    weapon: boolean;
    firstHitThisTurn: boolean;
    targetHurt: boolean;
    cantrip: boolean;
    spell: boolean;
    melee: boolean;
    assassinateEligible?: boolean;
  },
): { dice: string; type: string; flat: number } | null {
  if (opts.weapon && token.raging && hasSub(token, "frenzy") && opts.firstHitThisTurn && !token.frenzyUsed) {
    token.frenzyUsed = true;
    return { dice: `${frenzyDice(level)}d6`, type: "weapon", flat: 0 };
  }
  if (opts.weapon && opts.melee && hasSub(token, "divine_fury") && opts.firstHitThisTurn && !token.divineFuryUsed) {
    token.divineFuryUsed = true;
    const extra = divineFuryExtra(level);
    return { dice: extra.dice, type: "radiant", flat: extra.flat };
  }
  if (opts.weapon && hasSub(token, "hunters_prey") && !token.preyUsed) {
    const pick = choice(token, "hunters_prey") ?? "colossus_slayer";
    if (pick === "colossus_slayer" && opts.targetHurt) {
      token.preyUsed = true;
      const dice = hasSub(token, "superior_hunters_prey") ? "1d8" : "1d8";
      return { dice, type: "weapon", flat: 0 };
    }
  }
  if (opts.weapon && hasSub(token, "dreadful_strikes") && opts.firstHitThisTurn) {
    return { dice: dreadfulStrikesDie(level), type: "psychic", flat: 0 };
  }
  if (opts.weapon && hasSub(token, "dread_ambusher") && (uses(token).dread_ambush ?? 0) > 0) {
    uses(token).dread_ambush = 0;
    return { dice: dreadAmbusherDamage(), type: "weapon", flat: 0 };
  }
  if (opts.assassinateEligible && hasSub(token, "assassinate")) {
    return { dice: "", type: "weapon", flat: level };
  }
  if (opts.weapon && hasSub(token, "psionic_power") && (token.psionicDice ?? 0) > 0 && opts.firstHitThisTurn) {
    // optional spend handled by abilityUses.psi_strike_armed
    if ((uses(token).psi_strike_armed ?? 0) > 0) {
      uses(token).psi_strike_armed = 0;
      token.psionicDice = (token.psionicDice ?? 0) - 1;
      return { dice: token.psionicDie ?? "1d6", type: "psychic", flat: Math.max(0, mod(abilities.int ?? 10)) };
    }
  }
  if (opts.weapon && hasSub(token, "lunar_form") && opts.firstHitThisTurn) {
    return { dice: "2d10", type: "radiant", flat: 0 };
  }
  if (opts.spell && hasSub(token, "radiant_soul") && !token.affinityUsed) {
    token.affinityUsed = true;
    return { dice: "", type: "radiant", flat: Math.max(0, mod(abilities.cha ?? 10)) };
  }
  if (opts.spell && hasSub(token, "spell_bombardment")) {
    uses(token).bombardment_check = 1;
  }
  void opts.cantrip;
  return null;
}

export function onSubclassTurnStart(token: Subclassful, round: number): void {
  token.frenzyUsed = false;
  token.divineFuryUsed = false;
  if (hasSub(token, "heroic_warrior") && !token.heroicInspiration) token.heroicInspiration = true;
  if (hasSub(token, "dread_ambusher") && round === 1) {
    uses(token).dread_ambush = 1;
    token.speedCells = (token.speedCells ?? 6) + 2;
    token.extraAction = true;
  }
  if (hasSub(token, "thiefs_reflexes") && round === 1) token.extraAction = true;
  if (hasSub(token, "elder_champion") && (uses(token).elder_champion_active ?? 0) > 0) {
    heal(token as Subclassful, 10);
  }
  if (token.wrathOfSea && hasSub(token, "wrath_of_the_sea")) {
    uses(token).wrath_pulse = 1;
  }
  if (hasSub(token, "aura_of_alacrity")) {
    uses(token).alacrity_move = 2;
  }
}

export function absorbArcaneWard(token: Subclassful, harm: number): number {
  if ((token.arcaneWardHp ?? 0) <= 0) return harm;
  const absorbed = Math.min(token.arcaneWardHp ?? 0, harm);
  token.arcaneWardHp = (token.arcaneWardHp ?? 0) - absorbed;
  return harm - absorbed;
}

export function bastionReduce(token: Subclassful, harm: number): number {
  const dice = uses(token).bastion_dice ?? 0;
  if (dice <= 0) return harm;
  uses(token).bastion_dice = dice - 1;
  const reduce = rollNotation("1d8").total;
  return Math.max(0, harm - reduce);
}

/** Every feature slug from the 48-subclass catalog (acceptance gate). */
export const WIRED_SUBCLASS_FEATURE_SLUGS: string[] = [
  "frenzy", "mindless_rage", "retaliation", "intimidating_presence",
  "vitality_of_the_tree", "branches_of_the_tree", "battering_roots", "travel_along_the_tree",
  "rage_of_the_wild", "aspect_of_the_wild", "nature_speaker", "power_of_the_wild",
  "divine_fury", "warrior_of_the_gods", "fanatical_focus", "zealous_presence", "rage_beyond_death",
  "dazzling_footwork", "inspiring_movement", "leading_evasion",
  "bonus_proficiencies", "cutting_words", "magical_discoveries", "peerless_skill",
  "mantle_of_inspiration", "beguiling_magic", "mantle_of_majesty", "unbreakable_majesty",
  "combat_inspiration", "martial_training", "extra_attack", "battle_magic",
  "disciple_of_life", "preserve_life", "blessed_healer", "supreme_healing",
  "warding_flare", "radiance_of_the_dawn", "improved_warding_flare", "corona_of_light",
  "blessing_of_the_trickster", "invoke_duplicity", "tricksters_transposition", "improved_duplicity",
  "war_priest", "guided_strike", "war_gods_blessing", "avatar_of_battle",
  "combat_wild_shape", "primal_strike", "moonlight_step", "lunar_form",
  "lands_aid", "circle_spells", "natural_recovery", "natures_ward", "natures_sanctuary",
  "star_map", "starry_form", "cosmic_omen", "twinkling_stars", "starry_flare",
  "wrath_of_the_sea", "aquatic_affinity", "stormborn", "oceanic_gift",
  "improved_critical", "remarkable_athlete", "additional_fighting_style", "heroic_warrior", "superior_critical",
  "combat_superiority", "student_of_war", "know_your_enemy", "improved_combat_superiority", "relentless",
  "spellcasting", "weapon_bond", "war_magic", "eldritch_strike", "arcane_charge",
  "psionic_power", "telekinetic_leap", "telekinetic_thrust", "guarded_mind", "bulwark_of_force",
  "fast_fingers", "second_story_work", "supreme_sneak", "use_magic_device", "thiefs_reflexes",
  "mage_hand_legerdemain", "magical_ambush", "versatile_trickster", "spell_thief",
  "assassinate", "infiltration_expertise", "envenom_weapons", "death_strike",
  "psychic_blades", "soul_blades", "psychic_veil", "rend_mind",
  "abjuration_savant", "arcane_ward", "projected_ward", "spell_breaker", "spell_resistance",
  "evocation_savant", "sculpt_spells", "potent_cantrip", "empowered_evocation", "overchannel",
  "divination_savant", "portent", "expert_divination", "third_eye", "greater_portent",
  "illusion_savant", "improved_phantasmal_force", "phantasmal_reality", "illusory_self", "illusory_reality",
  "open_hand_technique", "wholeness_of_body", "fleet_step", "quivering_palm",
  "shadow_arts", "shadow_step", "improved_shadow_step", "cloak_of_shadows",
  "elemental_attunement", "environmental_aid", "stride_of_the_elements", "avatar_of_the_elements",
  "draconic_disciple", "breath_of_the_dragon", "wings_unfurled", "frightful_presence", "ascendant_aspect",
  "sacred_weapon", "aura_of_devotion", "smite_of_protection", "holy_nimbus",
  "natures_wrath", "aura_of_warding", "undying_sentinel", "elder_champion",
  "vow_of_enmity", "relentless_avenger", "soul_of_vengeance", "avenging_angel",
  "peerless_athlete", "inspiring_smite", "aura_of_alacrity", "glorious_defense", "living_legend",
  "hunters_prey", "defensive_tactics", "superior_hunters_defense", "superior_hunters_prey",
  "dread_ambusher", "umbral_sight", "iron_mind", "stalkers_flurry", "shadowy_dodge",
  "dreadful_strikes", "otherworldly_glamour", "beguiling_twist", "fey_reinforcements", "misty_wanderer",
  "primal_companion", "exceptional_training", "bestial_fury", "share_spells",
  "wild_magic_surge", "tides_of_chaos", "bend_luck", "controlled_chaos", "spell_bombardment",
  "draconic_resilience", "dragon_ancestry", "elemental_affinity", "dragon_wings", "dragon_presence",
  "psionic_spells", "telepathic_speech", "psionic_sorcery", "revelation_in_flesh", "warping_implosion",
  "clockwork_spells", "restore_balance", "bastion_of_law", "trance_of_order", "clockwork_cavalcade",
  "steps_of_the_fey", "misty_escape", "beguiling_defenses", "bewitching_leap",
  "dark_ones_blessing", "dark_ones_own_luck", "fiendish_resilience", "hurl_through_hell",
  "awakened_mind", "psychic_spells", "clairvoyant_hex", "thought_shield", "create_thrall",
  "healing_light", "radiant_soul", "celestial_resilience", "searing_vengeance",
];

export const SUBCLASS_ACTION_IDS = Object.keys(ACTIONS);
