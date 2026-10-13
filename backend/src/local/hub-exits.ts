/**
 * Links the server adds at runtime, outside story.json. Kept in one place so the campaign editor
 * can draw them and reachability checks can follow them. room.ts hubChoices and routeTravel own the rules.
 */

export const HUB_EXITS: ReadonlyArray<{ next: string; label: string; when: string }> = [
  { next: "corridor_tiles", label: "Study the mosaic tiles", when: "mosaic spotted, tiles not done" },
  { next: "cellar_enter", label: "Enter the Cellar", when: "cellar seal missing" },
  { next: "well_enter", label: "Enter the Well chamber", when: "well seal missing" },
  { next: "store_enter", label: "Enter the Alchemical Store", when: "store seal missing" },
  { next: "lab_vault", label: "Open the Laboratory", when: "three seals, spider alive" },
  { next: "lab_locked_peek", label: "Iron door (locked)", when: "fewer than three seals" },
  { next: "cliffhanger_magma", label: "Head back toward the brewery stairs", when: "spider dead, magma not done" },
];

/** A link to the key node is redirected by the server to one of the values. */
export const ROUTED_EXITS: Readonly<Record<string, readonly string[]>> = {
  enter_lab: ["enter_lab_threshold"],
  epilogue: ["epilogue_100", "epilogue_60"],
};
