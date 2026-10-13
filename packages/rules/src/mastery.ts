/** Weapon Mastery riders. Applied only when the hero's features include weapon_mastery. */

export type MasteryId = "cleave" | "graze" | "nick" | "push" | "sap" | "slow" | "topple" | "vex";

export type MasteryStrike = {
  mastery?: MasteryId;
  granted: boolean;
  hit: boolean;
  melee: boolean;
  abilityMod: number;
  targetAdjacentId?: string;
};

export type MasteryResult = {
  grazeDamage: number;
  cleaveTargetId?: string;
  nickBonusAttack: boolean;
  pushFeet: number;
  sap: boolean;
  slowFeet: number;
  topple: boolean;
  vexAdvantageNext: boolean;
};

export function applyMastery(strike: MasteryStrike): MasteryResult {
  const none: MasteryResult = {
    grazeDamage: 0,
    nickBonusAttack: false,
    pushFeet: 0,
    sap: false,
    slowFeet: 0,
    topple: false,
    vexAdvantageNext: false,
  };
  if (!strike.granted || !strike.mastery) return none;
  switch (strike.mastery) {
    case "graze":
      return { ...none, grazeDamage: !strike.hit && strike.melee ? Math.max(0, strike.abilityMod) : 0 };
    case "cleave":
      return { ...none, cleaveTargetId: strike.hit && strike.melee ? strike.targetAdjacentId : undefined };
    case "nick":
      return { ...none, nickBonusAttack: strike.hit && strike.melee };
    case "push":
      return { ...none, pushFeet: strike.hit && strike.melee ? 10 : 0 };
    case "sap":
      return { ...none, sap: strike.hit && strike.melee };
    case "slow":
      return { ...none, slowFeet: strike.hit ? 10 : 0 };
    case "topple":
      return { ...none, topple: strike.hit && strike.melee };
    case "vex":
      return { ...none, vexAdvantageNext: strike.hit };
    default: {
      const neverMastery: never = strike.mastery;
      return neverMastery;
    }
  }
}
