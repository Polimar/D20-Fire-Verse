/**
 * Combat and rest execution for SRD 5.2.1 class features outside pack A,
 * plus the subclass and feat riders the fight actually applies.
 * Each key in HANDLED is a feature slug the engine branches on.
 */

import type { CombatToken } from "./combat.js";
import { makeDiceRoll, rollCheck, rollNotation, type DiceRoll } from "./dice.js";
import { legalWildShapeForms, wildShapeDurationPcTurns, wildShapeForm } from "./wild-shape-forms.js";
import {
  castSubclassFeature,
  onSubclassTurnStart,
  seedSubclassResources,
  subclassDamageRider,
  subclassMenus,
} from "./subclass-effects.js";

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function has(token: Pick<CombatToken, "features" | "kit">, slug: string): boolean {
  return Boolean(token.features?.includes(slug) || token.kit?.flags.includes(slug));
}

function uses(token: CombatToken): Record<string, number> {
  token.abilityUses ??= {};
  return token.abilityUses;
}

function modOf(scores: Record<string, number> | undefined, key: string): number {
  return abilityMod(scores?.[key] ?? 10);
}

export function endWildShape(token: CombatToken): string {
  if (!token.wildShaped) throw new Error("BAD_ABILITY");
  const back = token.wildShapeBackup;
  if (back) {
    token.maxHp = back.maxHp;
    token.hp = Math.min(back.hp, back.maxHp);
    token.ac = back.ac;
    token.speedCells = back.speedCells;
  }
  token.wildShaped = false;
  token.wildShapeFormId = undefined;
  token.wildShapeBackup = undefined;
  token.timedEffects = (token.timedEffects ?? []).filter((row) => row.spellId !== "wild_shape");
  if (!token.timedEffects?.length) token.timedEffects = undefined;
  return `${token.name} returns to their own form.`;
}

export type ClassCtx = {
  allies: CombatToken[];
  foes: CombatToken[];
  target?: CombatToken;
  level: number;
  abilities: Record<string, number>;
  prof: number;
  maxSlots?: Record<string, number>;
};

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

function spend(token: CombatToken, key: string): void {
  const bag = uses(token);
  if ((bag[key] ?? 0) <= 0) throw new Error("ALREADY_USED");
  bag[key] = (bag[key] ?? 0) - 1;
}

function heal(token: CombatToken, amount: number): number {
  const gain = Math.max(0, Math.min(amount, token.maxHp - token.hp));
  token.hp += gain;
  if (token.hp > 0) {
    token.dying = false;
    token.stable = false;
  }
  return gain;
}

const ACTIONS: Record<string, (token: CombatToken, ctx: ClassCtx) => { line: string; rolls: DiceRoll[] }> = {
  countercharm(token) {
    token.countercharm = true;
    return { line: `${token.name} hums a countercharm.`, rolls: [] };
  },
  words_of_creation(token, ctx) {
    spend(token, "words");
    for (const ally of ctx.allies) heal(ally, ally.maxHp);
    return { line: `${token.name} speaks a word of creation. The party is restored.`, rolls: [] };
  },
  divine_spark(token, ctx) {
    if ((token.channelDivinity ?? 0) <= 0) throw new Error("ALREADY_USED");
    token.channelDivinity = (token.channelDivinity ?? 0) - 1;
    const { roll, total } = die(token.name, `1d8+${Math.max(0, modOf(ctx.abilities, "wis"))}`, "heal", "Divine Spark");
    const ally = ctx.target && ctx.allies.some((a) => a.id === ctx.target?.id) ? ctx.target : token;
    const gain = heal(ally, total);
    return { line: `${token.name} sparks divinity. ${ally.name} recovers ${gain}.`, rolls: [roll] };
  },
  turn_undead(token, ctx) {
    if ((token.channelDivinity ?? 0) <= 0) throw new Error("ALREADY_USED");
    token.channelDivinity = (token.channelDivinity ?? 0) - 1;
    const rolls: DiceRoll[] = [];
    let extra = 0;
    if (has(token, "sear_undead")) {
      const rolled = die(token.name, `2d8+${Math.max(0, modOf(ctx.abilities, "wis"))}`, "damage", "Sear Undead");
      rolls.push(rolled.roll);
      extra = rolled.total;
    }
    for (const foe of ctx.foes) {
      if (foe.traits?.includes("undead") || /undead/i.test(foe.name)) {
        foe.conditions = [...new Set([...(foe.conditions ?? []), "frightened"])];
        if (extra) foe.hp = Math.max(0, foe.hp - extra);
      }
    }
    return { line: `${token.name} turns the dead.`, rolls };
  },
  divine_intervention(token, ctx) {
    spend(token, "intervention");
    const amount = 5 * ctx.level;
    if (has(token, "greater_divine_intervention")) {
      for (const ally of ctx.allies) heal(ally, ally.maxHp);
      return { line: `${token.name} calls a greater intervention.`, rolls: [] };
    }
    const gain = heal(token, amount);
    return { line: `${token.name} calls for intervention and recovers ${gain}.`, rolls: [] };
  },
  wild_shape(token, ctx) {
    if (!has(token, "archdruid")) spend(token, "wild_shape");
    const pick = token.wildShapePick ?? legalWildShapeForms(ctx.level)[0]?.id;
    const form = pick ? wildShapeForm(pick) : undefined;
    if (!form || !legalWildShapeForms(ctx.level).some((row) => row.id === form.id)) throw new Error("BAD_ABILITY");
    if (!token.wildShaped) {
      token.wildShapeBackup = { hp: token.hp, maxHp: token.maxHp, ac: token.ac, speedCells: token.speedCells };
    }
    token.wildShaped = true;
    token.wildShapeFormId = form.id;
    token.wildShapePick = undefined;
    token.maxHp = form.hp;
    token.hp = form.hp;
    token.ac = form.ac;
    token.speedCells = form.speedCells;
    token.tempHp = 0;
    token.acFloor = 0;
    const turns = wildShapeDurationPcTurns(ctx.level);
    token.timedEffects = [
      ...(token.timedEffects ?? []).filter((row) => row.spellId !== "wild_shape"),
      { spellId: "wild_shape", label: "Wild Shape", pcTurnsLeft: turns },
    ];
    return { line: `${token.name} becomes a ${form.label}.`, rolls: [] };
  },
  wild_shape_end(token) {
    return { line: endWildShape(token), rolls: [] };
  },
  wild_companion(token) {
    if (!has(token, "archdruid")) spend(token, "wild_shape");
    token.helpingTargetId = token.id;
    return { line: `${token.name} calls a wild companion. The next attack has advantage.`, rolls: [] };
  },
  wild_resurgence(token) {
    const slots = token.slots ?? {};
    const key = Object.keys(slots).find((k) => (slots[k] ?? 0) > 0);
    if (!key) throw new Error("NO_SLOT");
    slots[key] = (slots[key] ?? 0) - 1;
    const bag = uses(token);
    bag.wild_shape = (bag.wild_shape ?? 0) + 1;
    return { line: `${token.name} spends a spell slot and the wild shape returns.`, rolls: [] };
  },
  innate_sorcery(token) {
    spend(token, "innate");
    token.innateSorcery = true;
    return { line: `${token.name}'s innate sorcery flares. Spell attacks have advantage.`, rolls: [] };
  },
  font_of_magic(token) {
    const slots = token.slots ?? {};
    const key = ["1", "2", "3", "4", "5"].find((k) => (slots[k] ?? 0) > 0);
    if (!key) throw new Error("NO_SLOT");
    slots[key] = (slots[key] ?? 0) - 1;
    token.sorceryPoints = (token.sorceryPoints ?? 0) + Number(key);
    return { line: `${token.name} burns a spell slot into sorcery points (${token.sorceryPoints}).`, rolls: [] };
  },
  sorcery_to_slot(token, ctx) {
    const level = 1;
    const max = ctx.maxSlots?.["1"] ?? 0;
    if ((token.sorceryPoints ?? 0) < level) throw new Error("NO_SORCERY");
    if ((token.slots?.["1"] ?? 0) >= max) throw new Error("ALREADY_USED");
    token.sorceryPoints = (token.sorceryPoints ?? 0) - level;
    token.slots = { ...(token.slots ?? {}), "1": (token.slots?.["1"] ?? 0) + 1 };
    return { line: `${token.name} forges a 1st-level slot from sorcery.`, rolls: [] };
  },
  tireless(token, ctx) {
    spend(token, "tireless");
    const { roll, total } = die(token.name, `1d8+${Math.max(0, modOf(ctx.abilities, "wis"))}`, "heal", "Tireless");
    token.tempHp = Math.max(token.tempHp ?? 0, total);
    return { line: `${token.name} draws a tireless breath. Temporary hit points ${token.tempHp}.`, rolls: [roll] };
  },
  natures_veil(token) {
    spend(token, "veil");
    token.invisible = true;
    return { line: `${token.name} steps into a veil of nature and is invisible.`, rolls: [] };
  },
  abjure_foes(token, ctx) {
    spend(token, "abjure");
    const dc = 8 + ctx.prof + modOf(ctx.abilities, "cha");
    const rolls: DiceRoll[] = [];
    for (const foe of ctx.foes.slice(0, 3)) {
      const roll = rollCheck({ roller: foe.name, label: "Abjure Foes", bonus: 0, dc, purpose: "save" });
      rolls.push(roll);
      if (roll.outcome !== "success") foe.conditions = [...new Set([...(foe.conditions ?? []), "frightened"])];
    }
    return { line: `${token.name} abjures nearby foes.`, rolls };
  },
  faithful_steed(token) {
    spend(token, "steed");
    token.speedCells += 2;
    token.movementLeft += 2;
    return { line: `${token.name} calls a steed. Speed rises.`, rolls: [] };
  },
  magical_cunning(token, ctx) {
    spend(token, "cunning");
    token.slots = { ...(ctx.maxSlots ?? token.slots ?? {}) };
    return { line: `${token.name}'s patron returns the pact slots.`, rolls: [] };
  },
  eldritch_master(token, ctx) {
    spend(token, "eldritch_master");
    token.slots = { ...(ctx.maxSlots ?? token.slots ?? {}) };
    return { line: `${token.name} demands the pact be filled again.`, rolls: [] };
  },
  contact_patron(token) {
    spend(token, "patron");
    token.heroicInspiration = true;
    return { line: `${token.name} hears the patron. Heroic Inspiration.`, rolls: [] };
  },
  steady_aim(token) {
    token.steadyAim = true;
    token.movementLeft = 0;
    return { line: `${token.name} takes a steady aim. The next attack has advantage. Speed is 0.`, rolls: [] };
  },
  sacred_weapon(token, ctx) {
    if ((token.channelDivinity ?? 0) <= 0) throw new Error("ALREADY_USED");
    token.channelDivinity = (token.channelDivinity ?? 0) - 1;
    token.channelAttack = Math.max(1, modOf(ctx.abilities, "cha"));
    return { line: `${token.name} blesses a weapon. Attacks gain +${token.channelAttack}.`, rolls: [] };
  },
  lands_aid(token, ctx) {
    if ((token.channelDivinity ?? 0) <= 0) throw new Error("ALREADY_USED");
    token.channelDivinity = (token.channelDivinity ?? 0) - 1;
    const ally = ctx.allies.find((a) => a.id !== token.id) ?? token;
    const foe = ctx.target ?? ctx.foes[0];
    const { roll, total } = die(token.name, "2d6", "heal", "Land's Aid");
    heal(ally, total);
    if (foe) foe.hp = Math.max(0, foe.hp - total);
    return { line: `${token.name} calls on the land.`, rolls: [roll] };
  },
  wholeness_of_body(token, ctx) {
    spend(token, "wholeness");
    const gain = heal(token, 3 * ctx.level);
    return { line: `${token.name} restores ${gain} with Wholeness of Body.`, rolls: [] };
  },
  intimidating_presence(token, ctx) {
    const foe = ctx.target ?? ctx.foes[0];
    if (!foe) throw new Error("NEED_TARGET");
    const dc = 8 + ctx.prof + modOf(ctx.abilities, "cha");
    const roll = rollCheck({ roller: foe.name, label: "Intimidating Presence", bonus: 0, dc, purpose: "save" });
    if (roll.outcome !== "success") foe.conditions = [...new Set([...(foe.conditions ?? []), "frightened"])];
    return { line: `${token.name} looms over ${foe.name}.`, rolls: [roll] };
  },
  dragon_companion(token, ctx) {
    spend(token, "companion");
    const ally = ctx.allies.find((a) => a.id !== token.id) ?? token;
    ally.tempHp = Math.max(ally.tempHp ?? 0, ctx.level);
    return { line: `A dragon spirit guards ${ally.name}.`, rolls: [] };
  },
  night_spirit(token) {
    token.invisible = true;
    return { line: `${token.name} merges with the shadows.`, rolls: [] };
  },
  cutting_words(token, ctx) {
    if ((token.bardicLeft ?? 0) <= 0) throw new Error("ALREADY_USED");
    token.bardicLeft = (token.bardicLeft ?? 0) - 1;
    const foe = ctx.target ?? ctx.foes[0];
    if (foe) foe.sappedBy = token.id;
    return { line: `${token.name} cuts the moment with a word.`, rolls: [] };
  },
  healer_kit(token, ctx) {
    const ally = ctx.target ?? ctx.allies.find((a) => a.id !== token.id) ?? token;
    const { roll, total } = die(token.name, "1d4", "heal", "Healer");
    const face = Number((roll as { faces?: number[] }).faces?.[0] ?? total);
    const healed = face === 1 ? 2 + Math.floor(Math.random() * 4) + 1 + ctx.prof : total + 1 + ctx.prof;
    heal(ally, healed);
    return { line: `${token.name} tends ${ally.name} for ${healed} hit points.`, rolls: [roll] };
  },
  protection(token, ctx) {
    const foe = ctx.target ?? ctx.foes[0];
    if (!foe) throw new Error("NEED_TARGET");
    foe.auraAttackDisadvAgainst = true;
    token.reactionReady = false;
    return { line: `${token.name} interposes a shield.`, rolls: [] };
  },
  sentinel_guard(token, ctx) {
    const foe = ctx.target ?? ctx.foes[0];
    if (!foe) throw new Error("NEED_TARGET");
    foe.movementLeft = 0;
    token.reactionReady = false;
    return { line: `${token.name} pins ${foe.name} in place.`, rolls: [] };
  },
  lucky_save(token) {
    if ((token.luckPoints ?? 0) < 1) throw new Error("ALREADY_USED");
    token.luckPoints = (token.luckPoints ?? 0) - 1;
    token.heroicInspiration = true;
    return { line: `${token.name} spends Luck.`, rolls: [] };
  },
  telekinetic_shove(token, ctx) {
    const foe = ctx.target ?? ctx.foes[0];
    if (!foe) throw new Error("NEED_TARGET");
    const dc = 8 + ctx.prof + modOf(ctx.abilities, "int");
    const roll = rollCheck({ roller: foe.name, label: "Telekinetic shove", bonus: 0, dc, purpose: "save" });
    if (roll.outcome !== "success") {
      const dx = Math.sign(foe.x - token.x) || 1;
      foe.x += dx;
    }
    return { line: `${token.name} shoves with a thought.`, rolls: [roll] };
  },
};

export function castClassFeature(token: CombatToken, effectType: string, ctx: ClassCtx): { line: string; rolls: DiceRoll[] } | null {
  const run = ACTIONS[effectType];
  if (run) return run(token, ctx);
  return castSubclassFeature(token, effectType, ctx);
}

export function seedClassResources(token: CombatToken, level: number, abilities: Record<string, number>, speedAlready: boolean): void {
  const bag = uses(token);
  if (bag._seeded) return;
  bag._seeded = 1;
  const wis = Math.max(1, modOf(abilities, "wis"));
  const cha = Math.max(1, modOf(abilities, "cha"));
  if (has(token, "wild_shape")) bag.wild_shape = has(token, "archdruid") ? 99 : Math.max(2, wis);
  if (has(token, "favored_enemy")) bag.favored = wis;
  if (has(token, "tireless")) bag.tireless = wis;
  if (has(token, "natures_veil")) bag.veil = wis;
  if (has(token, "innate_sorcery")) bag.innate = 2;
  if (has(token, "abjure_foes")) bag.abjure = cha;
  if (has(token, "divine_intervention") || has(token, "greater_divine_intervention")) bag.intervention = 1;
  if (has(token, "words_of_creation")) bag.words = 1;
  if (has(token, "magical_cunning")) bag.cunning = 1;
  if (has(token, "eldritch_master")) bag.eldritch_master = 1;
  if (has(token, "contact_patron")) bag.patron = 1;
  if (has(token, "faithful_steed")) bag.steed = 1;
  if (has(token, "wholeness_of_body")) bag.wholeness = 1;
  if (has(token, "dragon_companion")) bag.companion = 1;
  if (has(token, "stroke_of_luck")) bag.stroke = 1;
  if (has(token, "hurl_through_hell")) bag.hell = 1;
  if ((token.features ?? []).some((f) => f.startsWith("mastery:"))) bag.mastery_cast = 99;
  if ((token.features ?? []).some((f) => f.startsWith("signature:"))) bag.signature_cast = 2;
  const arcanums = (token.features ?? []).filter((f) => f.startsWith("arcanum:"));
  if (arcanums.length) {
    bag.arcanum = arcanums.length;
    for (const flag of arcanums) {
      const level = Number(flag.split(":")[1] ?? 0);
      if (level) bag[`arcanum_${level}`] = 1;
    }
  }
  if (!speedAlready && has(token, "roving")) token.speedCells += 2;
  if (has(token, "second_story_work")) token.speedCells += 1;
  if (has(token, "dragon_wings")) token.speedCells += 2;
  if (has(token, "draconic_resilience")) {
    const dex = modOf(abilities, "dex");
    token.ac = Math.max(token.ac, 13 + dex);
  }
  // Armor of Shadows — Mage Armor at will while not in heavy armor loadout.
  if (hasInvocationOption(token, "armor_of_shadows") && !token.heavyArmor) {
    const dex = modOf(abilities, "dex");
    token.ac = Math.max(token.ac, 13 + dex);
  }
  // Devil's Sight — see in magical/nonmagical darkness (treat as truesight for combat vision).
  if (hasInvocationOption(token, "devils_sight")) {
    token.truesight = true;
  }
  if (has(token, "fiendish_resilience") && !token.damageResistances?.includes("fire")) {
    token.damageResistances = [...(token.damageResistances ?? []), "fire"];
  }
  seedSubclassResources(token, level, abilities, Math.max(2, Math.ceil(level / 4) + 1));
  if (has(token, "superior_defense") && !token.heavyArmor) {
    const types = ["bludgeoning", "piercing", "slashing", "acid", "cold", "lightning", "thunder", "poison", "necrotic", "radiant", "psychic"];
    token.damageResistances = [...new Set([...(token.damageResistances ?? []), ...types])];
  }
  if (has(token, "disciplined_survivor")) {
    token.saves = {
      str: (token.saves?.str ?? 0) + 2,
      dex: (token.saves?.dex ?? 0) + 2,
      con: (token.saves?.con ?? 0) + 2,
      int: (token.saves?.int ?? 0) + 2,
      wis: (token.saves?.wis ?? 0) + 2,
      cha: (token.saves?.cha ?? 0) + 2,
    };
  }
  void level;
}

export function classMenus(token: CombatToken): { actions: string[]; bonus: string[]; reactions: string[] } {
  const actions: string[] = [];
  const bonus: string[] = [];
  const reactions: string[] = [];
  const bag = token.abilityUses ?? {};
  const push = (list: string[], id: string, left = 1) => {
    if (left > 0 && !list.includes(id)) list.push(id);
  };
  if ((token.channelDivinity ?? 0) > 0 && has(token, "channel_divinity")) {
    push(actions, "divine_spark");
    push(actions, "turn_undead");
  }
  if ((token.channelDivinity ?? 0) > 0 && has(token, "lands_aid")) push(actions, "lands_aid");
  if ((token.channelDivinity ?? 0) > 0 && has(token, "sacred_weapon")) push(bonus, "sacred_weapon");
  if (has(token, "countercharm")) push(bonus, "countercharm");
  if ((bag.wild_shape ?? 0) > 0 && has(token, "wild_shape") && !token.wildShaped) {
    const level = token.level ?? 2;
    for (const form of legalWildShapeForms(level)) push(bonus, `wild_shape:${form.id}`);
    push(actions, "wild_companion");
  }
  if (token.wildShaped) push(bonus, "wild_shape_end");
  if (has(token, "wild_resurgence")) push(bonus, "wild_resurgence");
  if ((bag.innate ?? 0) > 0 && has(token, "innate_sorcery")) push(bonus, "innate_sorcery");
  if (has(token, "font_of_magic") && (token.sorceryPoints ?? 0) >= 0) push(actions, "font_of_magic");
  if (has(token, "font_of_magic")) push(bonus, "sorcery_to_slot");
  if ((bag.tireless ?? 0) > 0) push(actions, "tireless");
  if ((bag.veil ?? 0) > 0) push(bonus, "natures_veil");
  if ((bag.abjure ?? 0) > 0) push(actions, "abjure_foes");
  if ((bag.steed ?? 0) > 0) push(actions, "faithful_steed");
  if ((bag.cunning ?? 0) > 0) push(actions, "magical_cunning");
  if ((bag.eldritch_master ?? 0) > 0) push(actions, "eldritch_master");
  if ((bag.patron ?? 0) > 0) push(actions, "contact_patron");
  if ((bag.intervention ?? 0) > 0) push(actions, "divine_intervention");
  if ((bag.words ?? 0) > 0) push(actions, "words_of_creation");
  if (has(token, "steady_aim")) push(bonus, "steady_aim");
  if ((bag.wholeness ?? 0) > 0) push(actions, "wholeness_of_body");
  if (has(token, "intimidating_presence")) push(actions, "intimidating_presence");
  if ((bag.companion ?? 0) > 0) push(actions, "dragon_companion");
  if (has(token, "boon_of_the_night_spirit")) push(bonus, "night_spirit");
  if (has(token, "cutting_words") && (token.bardicLeft ?? 0) > 0) push(reactions, "cutting_words");
  if (has(token, "deflect_attacks")) push(reactions, "deflect_attacks");
  if (has(token, "uncanny_dodge")) push(reactions, "uncanny_dodge");
  if (has(token, "protection")) push(reactions, "protection");
  if (has(token, "sentinel")) push(reactions, "sentinel_guard");
  if (has(token, "healer")) push(actions, "healer_kit");
  if (has(token, "telekinetic")) push(bonus, "telekinetic_shove");
  if (has(token, "lucky") && (token.luckPoints ?? 0) > 0) push(reactions, "lucky_save");
  if (has(token, "fast_hands") || has(token, "fast_fingers")) push(bonus, "std_utilize");
  const sub = subclassMenus(token);
  for (const id of sub.actions) push(actions, id);
  for (const id of sub.bonus) push(bonus, id);
  for (const id of sub.reactions) push(reactions, id);
  return { actions, bonus, reactions };
}

export function onClassTurn(token: CombatToken, level: number, abilities: Record<string, number>, round: number): void {
  if (has(token, "superior_inspiration") && (token.bardicLeft ?? 0) <= 0) {
    token.bardicLeft = Math.max(1, modOf(abilities, "cha"));
  }
  if (round === 1 && has(token, "uncanny_metabolism")) {
    token.ki = token.kiMax ?? token.ki;
    heal(token, Math.max(1, level));
  }
  if (round === 1 && has(token, "perfect_focus") && (token.ki ?? 0) < 4) token.ki = token.kiMax ?? 4;
  if (has(token, "survivor") && token.hp > 0 && token.hp < token.maxHp / 2) {
    heal(token, 5 + modOf(abilities, "con"));
  }
  if (has(token, "thiefs_reflexes") && round === 1) token.extraAction = true;
  token.blessedStrikeUsed = false;
  token.furyUsed = false;
  token.preyUsed = false;
  token.foeUsed = false;
  token.affinityUsed = false;
  token.evokeUsed = false;
  token.prowessUsed = false;
  onSubclassTurnStart(token, round);
}

export function onClassShortRest(token: CombatToken, level: number, abilities: Record<string, number>, maxSlots?: Record<string, number>): string[] {
  const notes: string[] = [];
  if (has(token, "sorcerous_restoration")) {
    const gain = Math.max(1, Math.floor(level / 2));
    const cap = token.kit?.sorceryPoints || gain;
    token.sorceryPoints = Math.min(cap, (token.sorceryPoints ?? 0) + gain);
    notes.push("sorcery");
  }
  if (has(token, "natural_recovery") && token.slots && maxSlots) {
    let left = Math.ceil(level / 2);
    for (const key of ["1", "2", "3"]) {
      while (left >= Number(key) && (token.slots[key] ?? 0) < (maxSlots[key] ?? 0)) {
        token.slots[key] = (token.slots[key] ?? 0) + 1;
        left -= Number(key);
      }
    }
    notes.push("natural recovery");
  }
  if (has(token, "self_restoration")) {
    token.conditions = (token.conditions ?? []).filter((c) => !["poisoned", "frightened", "charmed"].includes(c));
    notes.push("self-restoration");
  }
  if (has(token, "stroke_of_luck")) uses(token).stroke = 1;
  if (has(token, "dark_ones_own_luck")) uses(token).fiend_luck = 1;
  if (has(token, "memorize_spell")) uses(token).memorize = 1;
  void abilities;
  return notes;
}

export function onClassLongRest(token: CombatToken, level: number, abilities: Record<string, number>): void {
  seedReset(token, level, abilities);
}

function seedReset(token: CombatToken, level: number, abilities: Record<string, number>): void {
  delete uses(token)._seeded;
  seedClassResources(token, level, abilities, true);
}

export function auraCells(token: Pick<CombatToken, "features" | "kit">): number {
  if (!has(token, "aura_of_protection") && !has(token, "aura_of_courage") && !has(token, "aura_of_devotion")) return 0;
  return has(token, "aura_expansion") ? 6 : 2;
}

export function auraSaveBonus(token: CombatToken, abilities: Record<string, number>): number {
  if (!has(token, "aura_of_protection")) return 0;
  return Math.max(1, modOf(abilities, "cha"));
}

export function checkBonusAdjust(token: CombatToken, proficient: boolean, prof: number, skill: string): number {
  const expert = token.features?.includes(`expertise:${skill}`) || token.kit?.flags.includes(`expertise:${skill}`);
  if (proficient) return expert ? prof * 2 : prof;
  if (has(token, "jack_of_all_trades")) return Math.floor(prof / 2);
  if (has(token, "scholar") && ["arcana", "history", "investigation", "nature", "religion"].includes(skill)) return prof;
  return 0;
}

export function reliableFloor(token: CombatToken, proficient: boolean, natural: number): number {
  if (proficient && has(token, "reliable_talent") && natural < 10) return 10;
  return natural;
}

export function extraAttackBonus(token: CombatToken, abilities: Record<string, number>, spell: boolean): number {
  let n = 0;
  if (!spell && token.channelAttack) n += token.channelAttack;
  if (token.steadyAim) n += 0;
  return n;
  void abilities;
}

export function wantsSpellAdvantage(token: CombatToken): boolean {
  return Boolean(token.innateSorcery);
}

export function wantsSteadyAdvantage(token: CombatToken): boolean {
  return Boolean(token.steadyAim);
}

export function classDamageRider(
  token: CombatToken,
  level: number,
  abilities: Record<string, number>,
  opts: { weapon: boolean; cantrip: boolean; spell: boolean; targetHurt: boolean; marked: boolean },
): { dice: string; type: string; flat: number } | null {
  if (opts.weapon && has(token, "radiant_strikes")) return { dice: "1d8", type: "radiant", flat: 0 };
  if ((opts.weapon || opts.cantrip) && has(token, "improved_blessed_strikes") && !token.blessedStrikeUsed) {
    token.blessedStrikeUsed = true;
    return { dice: "2d8", type: "radiant", flat: 0 };
  }
  if ((opts.weapon || opts.cantrip) && has(token, "blessed_strikes") && !token.blessedStrikeUsed) {
    token.blessedStrikeUsed = true;
    return { dice: "1d8", type: "radiant", flat: 0 };
  }
  if (opts.weapon && has(token, "improved_elemental_fury") && !token.furyUsed) {
    token.furyUsed = true;
    return { dice: "2d8", type: "elemental", flat: 0 };
  }
  if (opts.weapon && has(token, "elemental_fury") && !token.furyUsed) {
    token.furyUsed = true;
    return { dice: "1d8", type: "elemental", flat: 0 };
  }
  if (opts.weapon && opts.targetHurt && has(token, "superior_hunters_prey") && !token.preyUsed) {
    token.preyUsed = true;
    return { dice: "2d8", type: "weapon", flat: 0 };
  }
  if (opts.weapon && opts.targetHurt && has(token, "hunters_prey") && !token.preyUsed) {
    token.preyUsed = true;
    return { dice: "1d8", type: "weapon", flat: 0 };
  }
  if (opts.weapon && opts.marked && has(token, "foe_slayer") && !token.foeUsed) {
    token.foeUsed = true;
    return { dice: "", type: "weapon", flat: Math.max(1, modOf(abilities, "wis")) };
  }
  if (opts.spell && has(token, "empowered_evocation") && !token.evokeUsed) {
    token.evokeUsed = true;
    return { dice: "", type: "spell", flat: Math.max(0, modOf(abilities, "int")) };
  }
  if (opts.spell && has(token, "elemental_affinity") && !token.affinityUsed) {
    token.affinityUsed = true;
    return { dice: "", type: "spell", flat: Math.max(0, modOf(abilities, "cha")) };
  }
  if (has(token, "hurl_through_hell") && (uses(token).hell ?? 0) > 0 && opts.weapon) {
    uses(token).hell = 0;
    return { dice: "10d10", type: "psychic", flat: 0 };
  }
  const sub = subclassDamageRider(token, level, abilities, {
    weapon: opts.weapon,
    firstHitThisTurn: !token.frenzyUsed && !token.divineFuryUsed,
    targetHurt: opts.targetHurt,
    cantrip: opts.cantrip,
    spell: opts.spell,
    melee: opts.weapon,
  });
  if (sub) return sub;
  return null;
}

export function evasionDamage(token: CombatToken, ability: string, saved: boolean, total: number, halfOnSuccess: boolean): number | undefined {
  if (ability !== "dex" || !has(token, "evasion")) return undefined;
  if (saved) return 0;
  return halfOnSuccess || true ? Math.floor(total / 2) : total;
}

export function potentCantripHalf(token: CombatToken, cantrip: boolean, saved: boolean): boolean {
  return Boolean(cantrip && saved && has(token, "potent_cantrip"));
}

export function sculptSucceeds(token: CombatToken, ally: boolean): boolean {
  return Boolean(ally && has(token, "sculpt_spells"));
}

export function lifeHealBonus(token: CombatToken, spellLevel: number): number {
  if (!has(token, "disciple_of_life") || spellLevel <= 0) return 0;
  return 2 + spellLevel;
}

export function blessedHealer(token: CombatToken, healedOther: boolean, spellLevel: number): number {
  if (!has(token, "blessed_healer") || !healedOther) return 0;
  return 2 + spellLevel;
}

export function supremeHeal(token: CombatToken, notation: string): string | undefined {
  if (!has(token, "supreme_healing")) return undefined;
  const match = notation.match(/(\d+)d(\d+)/i);
  if (!match) return undefined;
  const dice = Number(match[1]);
  const sides = Number(match[2]);
  const rest = notation.replace(match[0], "");
  return `${dice * sides}${rest}`;
}

export function openHandProne(token: CombatToken): boolean {
  return has(token, "open_hand_technique");
}

export function onKillBlessing(token: CombatToken, abilities: Record<string, number>, level: number): void {
  if (!has(token, "dark_ones_blessing")) return;
  token.tempHp = Math.max(token.tempHp ?? 0, level + modOf(abilities, "cha"));
}

export function fiendLuck(token: CombatToken): number {
  if (!has(token, "dark_ones_own_luck")) return 0;
  if ((uses(token).fiend_luck ?? 1) <= 0) return 0;
  uses(token).fiend_luck = 0;
  return rollNotation("1d10").total;
}

export function spellRecall(token: CombatToken, slot: number): boolean {
  if (!has(token, "boon_of_spell_recall") || slot < 1 || slot > 4) return false;
  return rollNotation("1d4").total === 1;
}

/** Free casting only for the spell ids chosen at level-up (mastery / signature / arcanum). */
export function freeCast(token: CombatToken, level: number, spellId?: string): boolean {
  const feats = token.features ?? [];
  if (!spellId) return false;
  if ((level === 1 || level === 2) && feats.includes(`mastery:${level}:${spellId}`)) {
    // Spell Mastery: at will at the spell's lowest level.
    return true;
  }
  if (level === 3 && feats.includes(`signature:${spellId}`) && (uses(token).signature_cast ?? 0) > 0) {
    uses(token).signature_cast = (uses(token).signature_cast ?? 0) - 1;
    return true;
  }
  if (level >= 6 && feats.includes(`arcanum:${level}:${spellId}`)) {
    const key = `arcanum_${level}`;
    if ((uses(token)[key] ?? uses(token).arcanum ?? 0) <= 0) return false;
    uses(token)[key] = 0;
    if (uses(token).arcanum != null) uses(token).arcanum = 0;
    return true;
  }
  return false;
}

export function hasMetamagicOption(token: CombatToken, option: string): boolean {
  const feats = token.features ?? [];
  return feats.includes(`metamagic:${option}`) || feats.includes(`metamagic_${option}`);
}

export function hasInvocationOption(token: CombatToken, option: string): boolean {
  const feats = token.features ?? [];
  return feats.includes(`invocation:${option}`) || feats.includes(`invocation_${option}`);
}

export function favoredMarkFree(token: CombatToken): boolean {
  if (!has(token, "favored_enemy")) return false;
  if ((uses(token).favored ?? 0) <= 0) return false;
  uses(token).favored = (uses(token).favored ?? 0) - 1;
  return true;
}

export function ignorePhysicalResistance(token: CombatToken, damageType: string): boolean {
  return has(token, "boon_of_irresistible_offense") && ["bludgeoning", "piercing", "slashing"].includes(damageType);
}

export function prowessSavesMiss(token: CombatToken): boolean {
  if (!has(token, "boon_of_combat_prowess") || token.prowessUsed) return false;
  token.prowessUsed = true;
  return true;
}

export function strokeSavesMiss(token: CombatToken): boolean {
  if (!has(token, "stroke_of_luck")) return false;
  if ((uses(token).stroke ?? 0) <= 0) return false;
  uses(token).stroke = 0;
  return true;
}

export function stunOnHit(token: CombatToken): boolean {
  if (!has(token, "stunning_strike") || token.stunPrimed !== true || (token.ki ?? 0) < 1) return false;
  token.ki = (token.ki ?? 0) - 1;
  token.stunPrimed = false;
  return true;
}
