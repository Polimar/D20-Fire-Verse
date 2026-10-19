/**
 * Guided hero forge (Roll20-style steps). Shared by the TV modal and the phone.
 * The server remains authoritative: every change posts /api/builder/preview.
 */

import type { AbilityKey, BuilderCatalog, BuilderDraft, DerivedSheet } from "./builder.js";
import { classDetailHtml, compactStrip, speciesDetailHtml } from "./forge-panels.js";
import { describeError } from "./index.js";

const ABILITIES: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];
const STEPS = ["class", "species", "origin", "scores", "training", "gear", "spells", "details", "review"] as const;
type StepId = (typeof STEPS)[number];

const STEP_TITLE: Record<StepId, string> = {
  class: "Choose a class",
  origin: "Choose an origin",
  species: "Choose a species",
  scores: "Ability scores",
  training: "Training",
  gear: "Starting gear",
  spells: "Spells",
  details: "Name and story",
  review: "Review and portrait",
};

export type ForgedHero = { id: string; name: string; level?: number };

export type ForgeWizardOptions = {
  api: <T>(url: string, init?: RequestInit) => Promise<T>;
  layout: "tv" | "phone";
  onDone: (hero: ForgedHero) => void;
  onClose: () => void;
  /**
   * When set, the forge opens on an existing hero for level-up / finish-choices
   * (PendingAsk via /api/heroes/:id/level-options) instead of L1 creation.
   */
  heroId?: string;
};

export type ForgeWizardHandle = {
  next: () => void;
  prev: () => void;
  /** Remote Back: previous step, or close on the first step. */
  back: () => void;
  close: () => void;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const GLYPH: Record<string, string> = {
  barbarian: `<path d="M5 19 L9 5 L12 12 L15 5 L19 19"/><path d="M7 19 H17"/>`,
  bard: `<path d="M9 18 V6 L18 4 V16"/><circle cx="7" cy="18" r="2.2"/><circle cx="16" cy="16" r="2.2"/>`,
  cleric: `<circle cx="12" cy="12" r="7"/><path d="M12 6 V18 M8 12 H16"/>`,
  druid: `<path d="M12 20 C12 20 5 14 6 9 C9 8 12 12 12 12 C12 12 15 6 19 8 C18 15 12 20 12 20 Z"/>`,
  fighter: `<path d="M12 3 V17"/><path d="M8 7 H16"/><path d="M9 21 L12 17 L15 21"/>`,
  monk: `<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5"/>`,
  paladin: `<path d="M12 3 L19 7 V13 C19 17 12 21 12 21 C12 21 5 17 5 13 V7 Z"/>`,
  ranger: `<path d="M4 16 C8 8 16 6 20 4"/><path d="M14 4 H20 V10"/><path d="M6 19 L10 15"/>`,
  rogue: `<path d="M8 20 L16 4"/><path d="M10 4 H17"/><path d="M7 16 L12 18"/>`,
  sorcerer: `<path d="M12 3 L13.5 9 L20 10.5 L13.5 12 L12 18 L10.5 12 L4 10.5 L10.5 9 Z"/>`,
  warlock: `<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.4" fill="#f6ead6"/><path d="M4 12 H8 M16 12 H20"/>`,
  wizard: `<path d="M6 6 H18 V18 H6 Z"/><path d="M6 10 H18"/><path d="M12 3 L13.2 6 L12 5.2 L10.8 6 Z"/>`,
  human: `<circle cx="12" cy="8" r="3"/><path d="M6 20 C7 14 17 14 18 20"/>`,
  elf: `<path d="M8 20 C8 12 12 8 12 4 C12 8 16 12 16 20"/><path d="M6 9 L12 4 L18 9"/>`,
  dwarf: `<path d="M6 18 H18"/><path d="M8 18 V10 H16 V18"/><path d="M5 10 H19"/>`,
  gnome: `<path d="M12 4 L16 12 L12 20 L8 12 Z"/>`,
  goliath: `<path d="M4 18 L9 8 L12 12 L15 6 L20 18 Z"/>`,
  halfling: `<path d="M7 14 C7 8 12 6 16 8 L18 16 C14 20 8 18 7 14 Z"/>`,
  orc: `<path d="M7 8 C8 4 10 6 12 8 C14 6 16 4 17 8 L19 18 H5 Z"/>`,
  tiefling: `<path d="M8 8 C6 3 4 6 6 9"/><path d="M16 8 C18 3 20 6 18 9"/><circle cx="12" cy="13" r="5"/>`,
  dragonborn: `<path d="M4 16 L8 8 L12 12 L16 6 L20 16 Z"/><path d="M9 16 H15"/>`,
  acolyte: `<path d="M12 4 V14"/><path d="M9 8 H15"/><path d="M8 18 H16"/>`,
  criminal: `<path d="M4 10 H20 V14 C16 18 8 18 4 14 Z"/><path d="M8 10 V8 H16 V10"/>`,
  sage: `<path d="M6 5 H16 L18 7 V19 H6 Z"/><path d="M6 9 H16"/>`,
  soldier: `<path d="M5 12 L12 5 L19 12 V18 H5 Z"/><path d="M9 18 V13 H15 V18"/>`,
};

function crest(id: string): string {
  const mark = GLYPH[id] ?? `<circle cx="12" cy="12" r="6"/>`;
  return `<span class="hw-crest" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#f6ead6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${mark}</svg></span>`;
}

function roleLine(caster: string, spellAbility?: string): string {
  if (caster === "none") return "Martial";
  if (caster === "pact") return "Pact";
  if (spellAbility === "wis") return "Divine caster";
  if (caster === "half") return "Half caster";
  return "Arcane caster";
}

function injectCss(): void {
  let style = document.getElementById("forge-wizard-css") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "forge-wizard-css";
    document.head.appendChild(style);
  }
  style.textContent = `
    .hw {
      --hw-bg: #12151a; --hw-panel: #1a1f27; --hw-card: #222833; --hw-line: rgba(232,168,96,0.35);
      --hw-amber: #e8a860; --hw-text: #e8ecf2; --hw-muted: #9aa3b2;
      --font-ui: "Source Sans 3", "Source Sans Pro", system-ui, sans-serif;
      --font-display: "Cinzel", "Palatino Linotype", serif;
      display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(17rem, 0.62fr); gap: 1rem;
      min-height: 70vh; color: var(--hw-text); font-family: var(--font-ui); background: var(--hw-bg);
    }
    .hw-main { display: flex; flex-direction: column; gap: 0.65rem; min-width: 0; min-height: 0; }
    .hw-top { display: flex; align-items: center; gap: 0.75rem; }
    .hw-top h2 { font-family: var(--font-display); margin: 0; font-size: 1.55rem; letter-spacing: 0.05em; text-transform: uppercase; }
    .hw-kicker { margin: 0; color: var(--hw-amber); letter-spacing: 0.14em; text-transform: uppercase; font-size: 0.7rem; font-family: var(--font-display); }
    .hw-progress { display: flex; gap: 0.35rem; flex-wrap: wrap; }
    .hw-dot { width: 0.8rem; height: 0.8rem; border-radius: 99px; border: 1px solid var(--hw-line); background: var(--hw-card); padding: 0; flex: 0 0 0.8rem; }
    .hw-dot.on { background: var(--hw-amber); box-shadow: 0 0 10px rgba(232,168,96,0.55); }
    .hw-dot.done { background: #6b5238; }
    .hw-body { min-height: 0; overflow: auto; }
    .hw-split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(16rem, 1.05fr); gap: 0.85rem; align-items: start; }
    .hw-strip { display: flex; gap: 1rem; flex-wrap: wrap; padding: 0.45rem 0.7rem; border: 1px solid var(--hw-line); border-radius: 10px; background: var(--hw-panel); font-size: 0.9rem; color: var(--hw-muted); }
    .hw-strip span { color: var(--hw-text); font-weight: 600; }
    .hw-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr)); gap: 0.55rem; }
    .hw-card, .hw-chip, .hw-nav button, .hw-ghost {
      appearance: none; border: 1px solid rgba(154,163,178,0.28); background: var(--hw-card);
      color: inherit; border-radius: 10px; cursor: pointer; text-align: left; font-family: var(--font-ui);
    }
    .hw-card { padding: 0.75rem; min-height: 6.4rem; display: grid; gap: 0.15rem; align-content: start; width: 100%;
      transition: border-color 0.15s ease, box-shadow 0.15s ease; }
    .hw-card:hover, .hw-card:focus-visible { border-color: var(--hw-amber); }
    .hw-card.focused { border-color: rgba(232,168,96,0.7); box-shadow: inset 0 0 0 1px rgba(232,168,96,0.35); }
    .hw-card strong { font-family: var(--font-display); font-size: 0.98rem; letter-spacing: 0.02em; }
    .hw-card em, .hw-meta { font-style: normal; color: var(--hw-muted); font-size: 0.8rem; }
    .hw-card.picked, .hw-chip.picked { border-color: var(--hw-amber); box-shadow: 0 0 0 2px rgba(232,168,96,0.35); background: #2a2218; }
    .hw-chip.from-origin { border-color: rgba(110,170,130,0.5); background: #1a2420; color: #b7d0c2; cursor: not-allowed; }
    .hw-chip.from-origin:disabled { opacity: 0.95; }
    .hw-card:focus-visible, .hw-chip:focus-visible, .hw-nav button:focus-visible, .hw-ghost:focus-visible, .hw-dot:focus-visible {
      outline: 2px solid var(--hw-amber); outline-offset: 2px;
    }
    .hw-crest { width: 2.4rem; height: 2.4rem; border-radius: 10px; display: grid; place-items: center;
      background: radial-gradient(circle at 40% 30%, #c9843a, #2a2118 55%, #151820 80%); margin-bottom: 0.3rem; }
    .hw-crest svg { width: 1.35rem; height: 1.35rem; }
    .hw-chip { width: auto; padding: 0.5rem 0.75rem; min-height: 2.6rem; border-radius: 8px; }
    .hw-chip em { font-style: normal; color: var(--hw-amber); font-size: 0.75rem; margin-left: 0.25rem; }
    .hw-portraits { display: grid; grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr)); gap: 0.55rem; }
    .hw-portrait {
      appearance: none; padding: 0; border: 2px solid rgba(154,163,178,0.28); border-radius: 12px;
      background: #0e1116; cursor: pointer; overflow: hidden; aspect-ratio: 1; position: relative;
    }
    .hw-portrait img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .hw-portrait.picked { border-color: var(--hw-amber); box-shadow: 0 0 0 2px rgba(232,168,96,0.35); }
    .hw-portrait span {
      position: absolute; left: 0; right: 0; bottom: 0; padding: 0.25rem 0.35rem;
      font-size: 0.7rem; background: rgba(0,0,0,0.65); color: var(--hw-text); text-align: center;
    }
    .hw-portrait.missing {
      display: grid; place-items: center; color: var(--hw-muted); font-size: 0.75rem; text-align: center; padding: 0.4rem;
    }
    .hw-ghost { width: auto; }
    .hw-row { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .hw-score { display: grid; grid-template-columns: 3.2rem 1fr auto; gap: 0.45rem; align-items: center; margin-bottom: 0.4rem; }
    .hw-nav { display: flex; gap: 0.55rem; margin-top: auto; }
    .hw-nav button, .hw-ghost { padding: 0.7rem 1rem; min-height: 2.85rem; font-size: 0.98rem; }
    .hw-nav .go { background: linear-gradient(180deg, #d4923c, #8a5220); border-color: transparent; font-family: var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; }
    .hw-nav button:disabled { opacity: 0.35; cursor: not-allowed; }
    .hw-sheet {
      background: var(--hw-panel); border: 1px solid var(--hw-line); border-radius: 12px;
      padding: 0.95rem 1.05rem; overflow: auto; max-height: min(78vh, 46rem); align-self: start;
    }
    .hw-sheet-portrait {
      width: 100%; aspect-ratio: 1; max-width: 11rem; margin: 0.35rem auto 0.65rem;
      border-radius: 12px; overflow: hidden; border: 1px solid var(--hw-line);
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
    }
    .hw-sheet-portrait img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .hw-sheet h3 { font-family: var(--font-display); margin: 0 0 0.15rem; font-size: 1.2rem; letter-spacing: 0.03em; }
    .hw-sheet p { margin: 0.2rem 0; line-height: 1.35; }
    .hw-sheet-sub { color: var(--hw-muted); font-size: 0.88rem; margin: 0 0 0.55rem !important; }
    .hw-sheet-block { margin: 0.7rem 0 0; padding-top: 0.55rem; border-top: 1px solid rgba(154,163,178,0.18); }
    .hw-sheet-block:first-of-type { border-top: 0; padding-top: 0; margin-top: 0.35rem; }
    .hw-sheet-label {
      margin: 0 0 0.35rem; font-family: var(--font-display); font-size: 0.68rem; letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--hw-amber);
    }
    .hw-vitals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem; }
    .hw-vital {
      display: grid; gap: 0.1rem; padding: 0.45rem 0.5rem; border-radius: 8px;
      background: #151a22; border: 1px solid rgba(154,163,178,0.16);
    }
    .hw-vital span { font-size: 0.68rem; color: var(--hw-muted); text-transform: uppercase; letter-spacing: 0.06em; }
    .hw-vital strong { font-family: var(--font-display); font-size: 1.05rem; font-weight: 600; }
    .hw-ability-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.35rem; }
    .hw-ability {
      text-align: center; padding: 0.4rem 0.2rem; border-radius: 8px;
      background: #151a22; border: 1px solid rgba(154,163,178,0.16);
    }
    .hw-ability span { display: block; font-size: 0.68rem; color: var(--hw-muted); letter-spacing: 0.06em; }
    .hw-ability strong { display: block; font-family: var(--font-display); font-size: 1.15rem; line-height: 1.2; }
    .hw-ability em { display: block; font-style: normal; font-size: 0.78rem; color: var(--hw-amber); }
    .hw-sheet-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 0.28rem; }
    .hw-sheet-list li {
      display: flex; justify-content: space-between; gap: 0.5rem; align-items: baseline;
      font-size: 0.88rem; padding: 0.15rem 0;
    }
    .hw-sheet-list li span { color: var(--hw-muted); }
    .hw-sheet-list li strong { font-weight: 600; white-space: nowrap; }
    .hw-sheet-list li.dim { opacity: 0.55; }
    .hw-sheet-list li.dim strong { font-weight: 500; color: var(--hw-muted); }
    .hw-err { color: #e88a7a; min-height: 1.1rem; font-size: 0.9rem; }
    .hw-field { display: grid; gap: 0.3rem; margin-bottom: 0.65rem; }
    .hw-field input, .hw-field textarea {
      background: #0e1116; color: inherit; border: 1px solid rgba(154,163,178,0.3); border-radius: 10px; padding: 0.7rem; font: inherit; min-height: 2.7rem;
    }
    .hw-detail { background: var(--hw-panel); border: 1px solid var(--hw-line); border-radius: 12px; padding: 0.85rem 0.95rem; max-height: min(62vh, 40rem); overflow: auto; }
    .hw-detail-head { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
    .hw-detail h3 { font-family: var(--font-display); margin: 0; font-size: 1.25rem; }
    .hw-badge { font-size: 0.72rem; padding: 0.2rem 0.45rem; border-radius: 6px; background: rgba(232,168,96,0.2); color: var(--hw-amber); border: 1px solid var(--hw-line); }
    .hw-badge.dim { background: transparent; color: var(--hw-muted); }
    .hw-pending { margin: 0.75rem 0; padding: 0.65rem; border: 1px dashed var(--hw-line); border-radius: 10px; background: #161b22; }
    .hw-pending-title { margin: 0 0 0.35rem; font-weight: 600; color: var(--hw-amber); }
    .hw-section { margin: 0.85rem 0 0.35rem; font-family: var(--font-display); letter-spacing: 0.04em; text-transform: uppercase; font-size: 0.78rem; color: var(--hw-amber); }
    .hw-pill { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 999px; background: #2a3140; font-size: 0.75rem; margin: 0.15rem; }
    .hw-feat, .hw-level-min { border: 1px solid rgba(154,163,178,0.2); border-radius: 8px; padding: 0.35rem 0.55rem; margin: 0.35rem 0; background: #151a22; }
    .hw-feat summary, .hw-level-min summary { cursor: pointer; font-weight: 600; }
    .hw-feat-body { white-space: pre-wrap; font-size: 0.86rem; color: var(--hw-muted); margin-top: 0.4rem; line-height: 1.4; max-height: 14rem; overflow: auto; }
    .hw-lvl { display: inline-grid; place-items: center; width: 1.25rem; height: 1.25rem; border-radius: 4px; background: #8b3a2a; color: #fff; font-size: 0.7rem; margin-right: 0.35rem; }
    .hw-attr { font-size: 0.72rem; color: var(--hw-muted); margin-top: 0.75rem; }
    .hw-phone-only { display: none; }
    .hw-mastery-sheet { display: none; }
    .hw.slim-side { grid-template-columns: minmax(0, 1fr) minmax(11rem, 0.38fr); }
    .hw.phone { display: flex; flex-direction: column; height: auto; min-height: 0; flex: 1 1 auto; gap: 0; overflow: hidden; background: var(--hw-bg); }
    .hw.phone .hw-split { grid-template-columns: 1fr; }
    .hw.phone .hw-grid { grid-template-columns: 1fr 1fr; }
    .hw.phone .hw-main { flex: 1 1 0; min-height: 0; overflow: hidden; }
    .hw.phone .hw-body { flex: 1 1 auto; min-height: 0; overflow: auto; -webkit-overflow-scrolling: touch; padding-bottom: 0.4rem; }
    .hw.phone .hw-top { align-items: flex-start; }
    .hw.phone .hw-top > div { flex: 1; min-width: 0; text-align: right; }
    .hw.phone .hw-top h2 { font-size: 1.15rem; }
    .hw.phone .hw-card { min-height: 5.8rem; }
    .hw.phone .hw-score { grid-template-columns: auto 1fr; }
    .hw.phone .hw-score .hw-row { grid-column: 1 / -1; }
    .hw.phone .hw-chip, .hw.phone .hw-nav button, .hw.phone .hw-ghost { min-height: 2.85rem; }
    .hw.phone .hw-phone-only { display: inline-flex; margin-top: 0.45rem; }
    .hw.phone .hw-mastery-row { display: none; }
    .hw-peek { display: none; }
    .hw-scrim { display: none; position: fixed; inset: 0; z-index: 25; background: rgba(0, 0, 0, 0.55); border: 0; padding: 0; }
    .hw-scrim.on { display: block; }
    .hw.phone .hw-nav button { width: 100%; }
    .hw.phone .hw-nav {
      flex: 0 0 auto; display: grid; grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: stretch; gap: 0.45rem; padding: 0.45rem 0 0.15rem;
      background: var(--hw-bg); border-top: 1px solid var(--hw-line); z-index: 4;
    }
    .hw.phone .hw-peek { display: grid; place-items: center; text-align: center; min-height: 2.85rem; padding: 0.35rem 0.55rem; border-radius: 8px; font-size: 0.8rem; }
    .hw.phone .hw-sheet, .hw.phone .hw-mastery-sheet {
      display: none; position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
      max-height: min(72vh, 32rem); overflow: auto; margin: 0;
      border-radius: 16px 16px 0 0; padding: 0.85rem 1rem max(1rem, env(safe-area-inset-bottom));
      background: var(--hw-panel); border: 1px solid var(--hw-line); box-shadow: 0 -18px 48px rgba(0, 0, 0, 0.55);
    }
    .hw.phone .hw-sheet.open, .hw.phone .hw-mastery-sheet.open { display: block; }
    .hw-sheet-close { display: none; margin-bottom: 0.45rem; }
    .hw.phone .hw-sheet .hw-sheet-close, .hw.phone .hw-mastery-sheet .hw-sheet-close { display: inline-flex; }
    .hw.phone .hw-ability-grid { grid-template-columns: repeat(3, 1fr); }
    .hw.phone .hw-vitals { grid-template-columns: repeat(3, 1fr); }
  `;
}

function guidance(codes: string[], draft: BuilderDraft, catalog: BuilderCatalog): string {
  const cls = catalog.classes.find((row) => row.id === draft.classId);
  return codes
    .map((code) => {
      const skills = code.match(/^NEED_(\d+)_CLASS_SKILLS$/);
      if (skills) return `Pick ${skills[1]} class skills (${draft.classSkills.length}/${skills[1]}).`;
      const cantrips = code.match(/^NEED_(\d+)_CANTRIPS$/);
      if (cantrips) return `Pick ${cantrips[1]} cantrips (${draft.cantrips?.length ?? 0}/${cantrips[1]}).`;
      const spells = code.match(/^NEED_(\d+)_SPELLS$/);
      if (spells) {
        const n = Number(spells[1]);
        if ((cls?.level1.preparedSpells ?? 0) === n) return `Prepare ${n} spells (${draft.spellsPrepared?.length ?? 0}/${n}).`;
        if ((cls?.level1.spellsKnown ?? 0) === n) return `Learn ${n} spells (${draft.spellsKnown?.length ?? 0}/${n}).`;
        if ((cls?.level1.spellbookSize ?? 0) === n) return `Put ${n} spells in your spellbook (${draft.spellbook?.length ?? 0}/${n}).`;
        return `Pick ${n} spells.`;
      }
      if (code === "NEED_2_EXPERTISE") return `Pick 2 skills for Expertise (${draft.expertiseSkills?.length ?? 0}/2).`;
      if (code === "NEED_2_MI_CANTRIPS") {
        return `Magic Initiate: pick 2 cantrips (${draft.magicInitiateCantrips?.length ?? 0}/2).`;
      }
      if (code === "NEED_MI_SPELL") return "Magic Initiate: pick a 1st-level spell.";
      if (code === "NEED_MI_ABILITY") return "Magic Initiate: pick a spellcasting ability.";
      if (code === "NEED_3_SKILLED") return `Skilled: pick 3 skills or tools (${draft.skilledPicks?.length ?? 0}/3).`;
      if (code === "NEED_2_CUSTOM_SKILLS") return `Custom origin: pick 2 skills (${draft.customSkills?.length ?? 0}/2).`;
      if (code === "NEED_CUSTOM_FEAT") return "Custom origin: pick an origin feat.";
      if (code === "NEED_CUSTOM_TOOL") return "Custom origin: pick a tool.";
      if (code === "BAD_CUSTOM_FEAT") return "Custom origin: that feat is not an origin feat.";
      if (code === "NEED_FIGHTING_STYLE") return "Pick a fighting style.";
      if (code === "NEED_WEAPON_MASTERY") {
        const n = cls?.weaponMasteryCountL1 ?? 0;
        return `Pick ${n} Weapon Mastery weapons (${draft.weaponMasteryWeaponIds?.length ?? 0}/${n}).`;
      }
      if (code === "BAD_WEAPON_MASTERY") return "That Weapon Mastery pick is not allowed.";
      if (code === "MASTERY_PROPERTY_DUP") return "Each mastery weapon needs a different property.";
      return describeError(code);
    })
    .join(" ");
}

function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

function sheetHtml(sheet: DerivedSheet | null, draft: BuilderDraft, catalog: BuilderCatalog, open: boolean): string {
  if (!sheet) {
    return `<aside class="hw-sheet" id="hwSheet"><p class="hw-kicker">Live sheet</p><h3>Sheet</h3><p class="hw-meta">Choices update this panel as you build.</p></aside>`;
  }
  const abilities = ABILITIES.map((a) => {
    const row = sheet.abilities[a];
    return `<div class="hw-ability"><span>${a.toUpperCase()}</span><strong>${row.score}</strong><em>${fmtMod(row.mod)}</em></div>`;
  }).join("");
  const saves = sheet.savingThrows
    .map((s) => {
      const tag = s.proficient ? " (prof)" : "";
      return `<li class="${s.proficient ? "" : "dim"}"><span>${s.ability.toUpperCase()}${tag}</span><strong>${fmtMod(s.mod)}</strong></li>`;
    })
    .join("");
  const skillRows = sheet.skills.filter((s) => s.proficient);
  const skills = skillRows.length
    ? skillRows
        .map(
          (s) =>
            `<li><span>${esc(s.label)}${s.expertise ? " · Expertise" : ""}</span><strong>${fmtMod(s.mod)}</strong></li>`,
        )
        .join("")
    : `<li class="dim"><span>No proficient skills yet</span><strong>—</strong></li>`;
  const attacks = sheet.attacks.length
    ? sheet.attacks
        .slice(0, 6)
        .map(
          (a) =>
            `<li><span>${esc(a.name)}</span><strong>${fmtMod(a.attackBonus)} · ${esc(a.damage)}</strong></li>`,
        )
        .join("")
    : "";
  const features = sheet.features.slice(0, 8);
  const slots = sheet.spellSlots
    ? Object.entries(sheet.spellSlots)
        .filter(([, n]) => n > 0)
        .map(([level, n]) => `Level ${level}: ${n}`)
        .join(" · ")
    : "";
  const cantripNames = (sheet.cantripIds ?? [])
    .map((id) => catalog.spells.find((s) => s.id === id)?.name ?? id)
    .join(", ");
  const preparedNames = (sheet.preparedSpellIds ?? [])
    .map((id) => catalog.spells.find((s) => s.id === id)?.name ?? id)
    .join(", ");
  const portrait = draft.portraitId
    ? catalog.portraits.find((p) => p.id === draft.portraitId)
    : catalog.portraits.find(
        (p) => p.speciesId === draft.speciesId && p.classId === draft.classId && p.sex === (draft.sex ?? "f"),
      );
  const portraitBlock = portrait
    ? `<div class="hw-sheet-portrait"><img src="${esc(portrait.url)}" alt="" /></div>`
    : "";
  return `<aside class="hw-sheet${open ? " open" : ""}" id="hwSheet" aria-live="polite">
    <p class="hw-kicker">Live sheet</p>
    ${portraitBlock}
    <h3>${esc(sheet.name || "Unnamed")}</h3>
    <p class="hw-sheet-sub">Level ${sheet.level} ${esc(sheet.speciesName)} ${esc(sheet.className)} · ${esc(sheet.backgroundName)}</p>
    <div class="hw-sheet-block">
      <p class="hw-sheet-label">Combat</p>
      <div class="hw-vitals">
        <div class="hw-vital"><span>Hit Points</span><strong>${sheet.hp}</strong></div>
        <div class="hw-vital"><span>Armor Class</span><strong>${sheet.ac}</strong></div>
        <div class="hw-vital"><span>Speed</span><strong>${sheet.speedFt} ft</strong></div>
        <div class="hw-vital"><span>Proficiency</span><strong>${fmtMod(sheet.proficiencyBonus)}</strong></div>
        <div class="hw-vital"><span>Passive Perc.</span><strong>${sheet.passivePerception}</strong></div>
      </div>
    </div>
    <div class="hw-sheet-block">
      <p class="hw-sheet-label">Ability scores</p>
      <div class="hw-ability-grid">${abilities}</div>
    </div>
    <div class="hw-sheet-block">
      <p class="hw-sheet-label">Saving throws</p>
      <ul class="hw-sheet-list">${saves}</ul>
    </div>
    <div class="hw-sheet-block">
      <p class="hw-sheet-label">Skills</p>
      <ul class="hw-sheet-list">${skills}</ul>
    </div>
    ${
      attacks
        ? `<div class="hw-sheet-block"><p class="hw-sheet-label">Attacks</p><ul class="hw-sheet-list">${attacks}</ul></div>`
        : ""
    }
    ${
      features.length
        ? `<div class="hw-sheet-block"><p class="hw-sheet-label">Features</p><ul class="hw-sheet-list">${features
            .map((f) => `<li><span>${esc(f)}</span></li>`)
            .join("")}</ul></div>`
        : ""
    }
    ${
      slots || cantripNames || preparedNames
        ? `<div class="hw-sheet-block"><p class="hw-sheet-label">Spellcasting</p>
            ${slots ? `<p class="hw-meta">Slots — ${esc(slots)}</p>` : ""}
            ${cantripNames ? `<p class="hw-meta">Cantrips — ${esc(cantripNames)}</p>` : ""}
            ${preparedNames ? `<p class="hw-meta">Prepared — ${esc(preparedNames)}</p>` : ""}
          </div>`
        : ""
    }
    ${sheet.errors.length ? `<p class="hw-err">${esc(guidance(sheet.errors, draft, catalog))}</p>` : ""}
    <button type="button" class="hw-ghost hw-sheet-close" id="hwSheetClose">Close sheet</button>
  </aside>`;
}

function peekLabel(sheet: DerivedSheet | null, draft: BuilderDraft, catalog: BuilderCatalog): string {
  if (!sheet) return "Sheet";
  if (sheet.errors.length) {
    const line = guidance(sheet.errors, draft, catalog).split(/(?<=\.)\s/)[0] ?? "Sheet";
    return line.length > 42 ? `${line.slice(0, 40)}…` : line;
  }
  return `HP ${sheet.hp} · AC ${sheet.ac}`;
}

type LevelOptionsBody = {
  hero: { id: string; name: string; level: number; xp: number; classes: Array<{ id: string; level: number }> };
  ask: {
    kind: string;
    classId?: string;
    featureId?: string;
    options?: string[];
    count?: number;
    cantrips?: number;
    spells?: number;
    spellbook?: number;
    epic?: boolean;
  } | null;
  adminBypassXp?: boolean;
  classes: Array<{ id: string; name: string }>;
  subclasses: Array<{ id: string; name: string; classId: string }>;
  feats: Array<{ id: string; name: string; category: string }>;
  fightingStyles: Array<{ id: string; name: string }>;
  skills: string[];
  spells: Array<{ id: string; name: string; level: number }>;
  knownSpells?: string[];
  knownCantrips?: string[];
  knownSpellbook?: string[];
  featureChoices?: { featureId: string; options: string[] };
};

type LevelDraft = {
  classId?: string;
  subclassId?: string;
  featurePick?: string;
  asiMode?: "plus2" | "plus1" | "feat";
  ability?: string;
  abilities?: [string, string];
  featId?: string;
  fightingStyleId?: string;
  skills: string[];
  cantrips: string[];
  spells: string[];
  spellbook: string[];
};

/** Level-up / finish-choices inside the forge chrome (one class advance per open). */
async function mountForgeLevelFlow(host: HTMLElement, opts: ForgeWizardOptions & { heroId: string }): Promise<ForgeWizardHandle> {
  injectCss();
  let options: LevelOptionsBody | null = null;
  let localError = "";
  let busy = false;
  /** At most one `class` pick per forge open — stops admin ignoreXp loops. */
  let classAdvances = 0;
  const draft: LevelDraft = { skills: [], cantrips: [], spells: [], spellbook: [] };

  const load = async () => {
    options = await opts.api<LevelOptionsBody>(`/api/heroes/${opts.heroId}/level-options`);
    draft.classId = undefined;
    draft.subclassId = undefined;
    draft.featurePick = undefined;
    draft.asiMode = "plus2";
    draft.ability = "str";
    draft.abilities = ["str", "dex"];
    draft.featId = undefined;
    draft.fightingStyleId = undefined;
    draft.skills = [];
    draft.cantrips = [];
    draft.spells = [];
    draft.spellbook = [];
    const ask = options.ask;
    if (ask?.kind === "class") draft.classId = options.classes[0]?.id ?? options.hero.classes[0]?.id;
    if (ask?.kind === "subclass") draft.subclassId = options.subclasses[0]?.id;
    if (ask?.kind === "feature_choice") draft.featurePick = ask.options?.[0] ?? options.featureChoices?.options[0];
    if (ask?.kind === "fighting_style") draft.fightingStyleId = options.fightingStyles[0]?.id;
  };

  const sessionDone = () => {
    const ask = options?.ask;
    if (!ask) return true;
    if (ask.kind === "class" && classAdvances >= 1) return true;
    return false;
  };

  const finish = (hero?: ForgedHero) => {
    if (hero) opts.onDone(hero);
    else if (options) opts.onDone({ id: options.hero.id, name: options.hero.name, level: options.hero.level });
    opts.onClose();
  };

  const buildPick = (): Record<string, unknown> | null => {
    const ask = options?.ask;
    if (!ask) return null;
    if (ask.kind === "class") return draft.classId ? { kind: "class", classId: draft.classId } : null;
    if (ask.kind === "subclass") return draft.subclassId ? { kind: "subclass", subclassId: draft.subclassId } : null;
    if (ask.kind === "feature_choice") {
      return draft.featurePick && ask.featureId
        ? { kind: "feature_choice", featureId: ask.featureId, picks: [draft.featurePick] }
        : null;
    }
    if (ask.kind === "fighting_style") {
      return draft.fightingStyleId ? { kind: "fighting_style", featId: draft.fightingStyleId } : null;
    }
    if (ask.kind === "skill") {
      const need = ask.count ?? 1;
      return draft.skills.length === need ? { kind: "skill", skills: [...draft.skills] } : null;
    }
    if (ask.kind === "expertise") {
      const need = ask.count ?? 1;
      return draft.skills.length === need ? { kind: "expertise", skills: [...draft.skills] } : null;
    }
    if (ask.kind === "spells") {
      const needC = ask.cantrips ?? 0;
      const needS = ask.spells ?? 0;
      const needB = ask.spellbook ?? 0;
      if (draft.cantrips.length !== needC || draft.spells.length !== needS || draft.spellbook.length !== needB) return null;
      return {
        kind: "spells",
        cantrips: [...draft.cantrips],
        spells: [...draft.spells],
        ...(needB ? { spellbook: [...draft.spellbook] } : {}),
      };
    }
    if (ask.kind === "asi") {
      if (draft.asiMode === "feat") {
        return draft.featId ? { kind: "feat", featId: draft.featId, ...(draft.ability ? { ability: draft.ability } : {}) } : null;
      }
      if (draft.asiMode === "plus1") {
        if (!draft.abilities || draft.abilities[0] === draft.abilities[1]) return null;
        return { kind: "asi", mode: "plus1", abilities: draft.abilities };
      }
      return draft.ability ? { kind: "asi", mode: "plus2", ability: draft.ability } : null;
    }
    return null;
  };

  const askTitle = (ask: LevelOptionsBody["ask"]): string => {
    if (!ask) return "Done";
    if (ask.kind === "class") return "Advance a class level";
    if (ask.kind === "subclass") return "Choose a subclass";
    if (ask.kind === "asi") return ask.epic ? "Epic boon or ASI" : "Ability score improvement";
    if (ask.kind === "spells") return "Choose spells";
    if (ask.kind === "fighting_style") return "Fighting style";
    if (ask.kind === "skill") return "Choose skills";
    if (ask.kind === "expertise") return "Choose expertise";
    if (ask.kind === "feature_choice") return (ask.featureId ?? "feature").replace(/_/g, " ");
    return "Level-up choice";
  };

  const paint = () => {
    if (!options) {
      host.innerHTML = `<div class="hw"><div class="hw-main"><p class="hw-meta">Loading forge choices…</p></div></div>`;
      return;
    }
    if (sessionDone()) {
      finish({ id: options.hero.id, name: options.hero.name, level: options.hero.level });
      return;
    }
    const level = options;
    const ask = level.ask!;
    const hero = level.hero;
    const lab = (id: string) => id.replace(/_/g, " ");
    let body = "";
    if (ask.kind === "class") {
      body = `<p class="hw-meta">${level.adminBypassXp ? "Admin: one level this visit (XP granted if needed). " : ""}Which class gains this level?</p>
        <div class="hw-row">${level.classes
          .map((c) => `<button type="button" class="hw-chip ${draft.classId === c.id ? "picked" : ""}" data-class="${esc(c.id)}">${esc(c.name)}</button>`)
          .join("")}</div>`;
    } else if (ask.kind === "subclass") {
      body = `<p class="hw-meta">Pick a subclass.</p>
        <div class="hw-row">${level.subclasses
          .map((s) => `<button type="button" class="hw-chip ${draft.subclassId === s.id ? "picked" : ""}" data-sub="${esc(s.id)}">${esc(s.name)}</button>`)
          .join("") || `<p class="hw-meta">No subclasses enabled.</p>`}</div>`;
    } else if (ask.kind === "feature_choice") {
      const list = ask.options ?? level.featureChoices?.options ?? [];
      body = `<div class="hw-row">${list
        .map((o) => `<button type="button" class="hw-chip ${draft.featurePick === o ? "picked" : ""}" data-feat-opt="${esc(o)}">${esc(lab(o))}</button>`)
        .join("")}</div>`;
    } else if (ask.kind === "fighting_style") {
      body = `<div class="hw-row">${level.fightingStyles
        .map((f) => `<button type="button" class="hw-chip ${draft.fightingStyleId === f.id ? "picked" : ""}" data-style="${esc(f.id)}">${esc(f.name)}</button>`)
        .join("")}</div>`;
    } else if (ask.kind === "skill") {
      const need = ask.count ?? 1;
      body = `<p class="hw-meta">Pick ${need} new skill proficiency (${draft.skills.length}/${need}).</p>
        <div class="hw-row">${level.skills
          .map((s) => `<button type="button" class="hw-chip ${draft.skills.includes(s) ? "picked" : ""}" data-skill="${esc(s)}">${esc(lab(s))}</button>`)
          .join("")}</div>`;
    } else if (ask.kind === "expertise") {
      const need = ask.count ?? 1;
      body = `<p class="hw-meta">Pick ${need} proficient skill${need === 1 ? "" : "s"} for Expertise (${draft.skills.length}/${need}).</p>
        <div class="hw-row">${level.skills
          .map((s) => `<button type="button" class="hw-chip ${draft.skills.includes(s) ? "picked" : ""}" data-skill="${esc(s)}">${esc(lab(s))}</button>`)
          .join("") || `<p class="hw-meta">No eligible skills (need proficiency without Expertise).</p>`}</div>`;
    } else if (ask.kind === "spells") {
      const needC = ask.cantrips ?? 0;
      const needS = ask.spells ?? 0;
      const needB = ask.spellbook ?? 0;
      const knownBook = level.knownSpellbook ?? [];
      const knownPrep = level.knownSpells ?? [];
      const inBook = new Set([...knownBook, ...draft.spellbook]);
      const cantrips = level.spells.filter((s) => s.level === 0);
      const forBook = level.spells.filter((s) => s.level > 0 && !knownBook.includes(s.id));
      const forPrep = needB
        ? level.spells.filter((s) => s.level > 0 && inBook.has(s.id) && !knownPrep.includes(s.id))
        : level.spells.filter((s) => s.level > 0);
      body = `<p class="hw-meta">${needB ? "Wizard: add spells to your spellbook, then prepare any new slots from the book." : "New picks for this class level (not your full list)."}</p>
        ${needC ? `<p class="hw-section">New cantrips (${draft.cantrips.length}/${needC})</p><div class="hw-row">${cantrips
        .map((s) => `<button type="button" class="hw-chip ${draft.cantrips.includes(s.id) ? "picked" : ""}" data-cantrip="${esc(s.id)}">${esc(s.name)}</button>`)
        .join("")}</div>` : ""}
        ${needB ? `<p class="hw-section">Add to spellbook (${draft.spellbook.length}/${needB})</p><div class="hw-row">${forBook
        .map((s) => `<button type="button" class="hw-chip ${draft.spellbook.includes(s.id) ? "picked" : ""}" data-book="${esc(s.id)}">${esc(s.name)} <em>L${s.level}</em></button>`)
        .join("")}</div>` : ""}
        ${needS ? `<p class="hw-section">${needB ? "Prepare from spellbook" : "New spells"} (${draft.spells.length}/${needS})</p><div class="hw-row">${forPrep
        .map((s) => `<button type="button" class="hw-chip ${draft.spells.includes(s.id) ? "picked" : ""}" data-spell="${esc(s.id)}">${esc(s.name)} <em>L${s.level}</em></button>`)
        .join("")}</div>` : ""}`;
    } else if (ask.kind === "asi") {
      const feats = level.feats.filter((f) => f.category === "general" || (ask.epic && f.category === "epic"));
      body = `<p class="hw-section">Mode</p><div class="hw-row">
          <button type="button" class="hw-chip ${draft.asiMode === "plus2" ? "picked" : ""}" data-asi-mode="plus2">+2 one ability</button>
          <button type="button" class="hw-chip ${draft.asiMode === "plus1" ? "picked" : ""}" data-asi-mode="plus1">+1 two abilities</button>
          <button type="button" class="hw-chip ${draft.asiMode === "feat" ? "picked" : ""}" data-asi-mode="feat">Feat</button>
        </div>
        ${draft.asiMode === "plus2" ? `<p class="hw-section">Ability</p><div class="hw-row">${ABILITIES.map((a) => `<button type="button" class="hw-chip ${draft.ability === a ? "picked" : ""}" data-ab="${a}">${a.toUpperCase()}</button>`).join("")}</div>` : ""}
        ${draft.asiMode === "plus1" ? `<p class="hw-section">First</p><div class="hw-row">${ABILITIES.map((a) => `<button type="button" class="hw-chip ${draft.abilities?.[0] === a ? "picked" : ""}" data-ab1="${a}">${a.toUpperCase()}</button>`).join("")}</div>
          <p class="hw-section">Second</p><div class="hw-row">${ABILITIES.map((a) => `<button type="button" class="hw-chip ${draft.abilities?.[1] === a ? "picked" : ""}" data-ab2="${a}">${a.toUpperCase()}</button>`).join("")}</div>` : ""}
        ${draft.asiMode === "feat" ? `<p class="hw-section">Feat</p><div class="hw-row">${feats.map((f) => `<button type="button" class="hw-chip ${draft.featId === f.id ? "picked" : ""}" data-feat="${esc(f.id)}">${esc(f.name)}</button>`).join("")}</div>` : ""}`;
    } else {
      body = `<p class="hw-meta">Unsupported choice (${esc(ask.kind)}).</p>`;
    }

    host.innerHTML = `<div class="hw ${opts.layout === "phone" ? "phone" : ""} slim-side">
      <div class="hw-main">
        <div class="hw-top"><button type="button" class="hw-ghost" id="hwClose">Close</button>
          <div><p class="hw-kicker">${esc(hero.name)} · Level ${hero.level}${level.adminBypassXp ? " · admin" : ""}</p>
          <h2>${esc(askTitle(ask))}</h2></div></div>
        <div class="hw-body">${body}</div>
        <p class="hw-err" id="hwErr">${esc(localError)}</p>
        <div class="hw-nav">
          <button type="button" class="go" id="hwNext" ${busy ? "disabled" : ""}>${ask.kind === "class" ? "Confirm level" : "Confirm"}</button>
        </div>
      </div>
    </div>`;

    host.querySelector("#hwClose")?.addEventListener("click", () => opts.onClose());
    host.querySelector("#hwNext")?.addEventListener("click", () => void confirm());
    host.querySelectorAll<HTMLButtonElement>("[data-class]").forEach((b) => b.addEventListener("click", () => { draft.classId = b.dataset.class; paint(); }));
    host.querySelectorAll<HTMLButtonElement>("[data-sub]").forEach((b) => b.addEventListener("click", () => { draft.subclassId = b.dataset.sub; paint(); }));
    host.querySelectorAll<HTMLButtonElement>("[data-feat-opt]").forEach((b) => b.addEventListener("click", () => { draft.featurePick = b.dataset.featOpt; paint(); }));
    host.querySelectorAll<HTMLButtonElement>("[data-style]").forEach((b) => b.addEventListener("click", () => { draft.fightingStyleId = b.dataset.style; paint(); }));
    host.querySelectorAll<HTMLButtonElement>("[data-skill]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.skill!;
        const need = options?.ask?.count ?? 1;
        const set = new Set(draft.skills);
        if (set.has(id)) set.delete(id);
        else if (set.size < need) set.add(id);
        draft.skills = [...set];
        paint();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-cantrip]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.cantrip!;
        const need = options?.ask?.cantrips ?? 0;
        const set = new Set(draft.cantrips);
        if (set.has(id)) set.delete(id);
        else if (set.size < need) set.add(id);
        draft.cantrips = [...set];
        paint();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-book]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.book!;
        const need = options?.ask?.spellbook ?? 0;
        const set = new Set(draft.spellbook);
        if (set.has(id)) {
          set.delete(id);
          if (!(options?.knownSpellbook ?? []).includes(id)) {
            draft.spells = draft.spells.filter((s) => s !== id);
          }
        } else if (set.size < need) set.add(id);
        draft.spellbook = [...set];
        paint();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-spell]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.spell!;
        const need = options?.ask?.spells ?? 0;
        const set = new Set(draft.spells);
        if (set.has(id)) set.delete(id);
        else if (set.size < need) set.add(id);
        draft.spells = [...set];
        paint();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-asi-mode]").forEach((b) =>
      b.addEventListener("click", () => { draft.asiMode = b.dataset.asiMode as LevelDraft["asiMode"]; paint(); }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-ab]").forEach((b) => b.addEventListener("click", () => { draft.ability = b.dataset.ab; paint(); }));
    host.querySelectorAll<HTMLButtonElement>("[data-ab1]").forEach((b) =>
      b.addEventListener("click", () => { draft.abilities = [b.dataset.ab1!, draft.abilities?.[1] ?? "dex"]; paint(); }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-ab2]").forEach((b) =>
      b.addEventListener("click", () => { draft.abilities = [draft.abilities?.[0] ?? "str", b.dataset.ab2!]; paint(); }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-feat]").forEach((b) => b.addEventListener("click", () => { draft.featId = b.dataset.feat; paint(); }));
  };

  const confirm = async () => {
    if (busy || !options?.ask) return;
    const pick = buildPick();
    if (!pick) {
      localError = "Make a choice before continuing.";
      paint();
      return;
    }
    const wasClass = options.ask.kind === "class";
    busy = true;
    localError = "";
    paint();
    try {
      const out = await opts.api<{ hero: ForgedHero }>(`/api/heroes/${opts.heroId}/level-up`, {
        method: "POST",
        body: JSON.stringify(pick),
      });
      if (wasClass) classAdvances += 1;
      await load();
      busy = false;
      if (sessionDone()) {
        finish(out.hero);
        return;
      }
      localError = "";
      paint();
    } catch (err) {
      localError = describeError(err instanceof Error ? err.message : "ERROR");
      busy = false;
      paint();
    }
  };

  try {
    await load();
    if (sessionDone()) {
      finish();
      return { next: () => undefined, prev: () => undefined, back: () => opts.onClose(), close: () => opts.onClose() };
    }
    paint();
  } catch (err) {
    host.innerHTML = `<div class="hw"><div class="hw-main"><p class="hw-err">${esc(describeError(err instanceof Error ? err.message : "ERROR"))}</p>
      <button type="button" class="hw-ghost" id="hwClose">Close</button></div></div>`;
    host.querySelector("#hwClose")?.addEventListener("click", () => opts.onClose());
  }

  return {
    next: () => void confirm(),
    prev: () => opts.onClose(),
    back: () => opts.onClose(),
    close: () => opts.onClose(),
  };
}

export async function mountForgeWizard(host: HTMLElement, opts: ForgeWizardOptions): Promise<ForgeWizardHandle> {
  if (opts.heroId) return mountForgeLevelFlow(host, { ...opts, heroId: opts.heroId });
  injectCss();
  const catalog = await opts.api<BuilderCatalog>("/api/builder/catalog");
  if (!catalog.classes.length || !catalog.backgrounds.length || !catalog.species.length) {
    host.innerHTML = `<div class="hw"><div class="hw-main"><h2>The forge is cold</h2><p>A keeper must enable a class, a species, and a background in Admin → Content. Restarting a fresh table stocks the forge once; a deliberate switch-off stays off.</p><button type="button" class="hw-ghost" id="hwClose">Close</button></div></div>`;
    host.querySelector("#hwClose")!.addEventListener("click", () => opts.onClose());
    return { next: () => undefined, prev: () => undefined, back: () => opts.onClose(), close: () => opts.onClose() };
  }

  const draft: BuilderDraft = {
    classId: catalog.classes[0]!.id,
    speciesId: catalog.species.find((s) => s.id === "human")?.id ?? catalog.species[0]!.id,
    backgroundId: catalog.backgrounds.find((b) => b.id === "soldier")?.id ?? catalog.backgrounds[0]!.id,
    method: "standard_array",
    baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    classSkills: [],
    equipChoice: "A",
    backgroundEquipChoice: "A",
    backgroundAsi: { mode: "plus2plus1", plus2: "str", plus1: "con" },
    cantrips: [],
    spellsPrepared: [],
    spellsKnown: [],
    spellbook: [],
    languages: [],
    sex: "f",
  };
  let step = 0;
  let preview: DerivedSheet | null = null;
  let localError = "";
  let sheetOpen = false;
  let masterySheetOpen = false;
  let focusedClassId = draft.classId;
  let focusedSpeciesId = draft.speciesId;

  const cls = () => catalog.classes.find((c) => c.id === draft.classId)!;
  const bg = () => catalog.backgrounds.find((b) => b.id === draft.backgroundId)!;
  const originFeatId = () => (bg().custom ? draft.customFeatId : bg().featId);
  /** Keep portrait matched to species / class / sex; pick first forge look when unset. */
  const ensurePortraitPick = () => {
    const sex = draft.sex ?? "f";
    draft.sex = sex;
    const forgeHits = catalog.portraits.filter(
      (p) => p.speciesId === draft.speciesId && p.classId === draft.classId && p.sex === sex,
    );
    if (draft.portraitId && forgeHits.some((p) => p.id === draft.portraitId)) return;
    if (forgeHits[0]) {
      draft.portraitId = forgeHits[0].id;
      return;
    }
    if (draft.portraitId && catalog.portraits.some((p) => p.id === draft.portraitId)) return;
    draft.portraitId = catalog.portraits.find((p) => !p.speciesId)?.id;
  };
  const classPendingOk = (c = cls()): boolean => {
    if (c.fightingStyleRequired && !draft.fightingStyleFeatId) return false;
    if (c.weaponMastery && c.weaponMasteryCountL1 > 0) {
      const picks = draft.weaponMasteryWeaponIds ?? [];
      if (picks.length !== c.weaponMasteryCountL1) return false;
      const allowed = catalog.masteryWeaponsByClass[c.id] ?? [];
      const byId = new Map(allowed.map((w) => [w.id, w]));
      const props = new Set<string>();
      for (const id of picks) {
        const w = byId.get(id);
        if (!w || props.has(w.masteryId)) return false;
        props.add(w.masteryId);
      }
    }
    return true;
  };

  const visibleSteps = (): StepId[] => {
    const c = cls();
    const needClassSpell = (c.level1.cantrips ?? 0) + (c.level1.preparedSpells ?? 0) + (c.level1.spellsKnown ?? 0) > 0;
    const needMi = originFeatId() === "magic_initiate";
    return STEPS.filter((id) => id !== "spells" || needClassSpell || needMi);
  };

  const validateStep = (id: StepId): string => {
    const c = cls();
    if (id === "class") {
      if (focusedClassId !== draft.classId) return "Press OK on a class card to select it.";
      if (c.fightingStyleRequired && !draft.fightingStyleFeatId) return "Pick a fighting style.";
      if (c.weaponMastery && c.weaponMasteryCountL1 > 0) {
        const n = c.weaponMasteryCountL1;
        const picks = draft.weaponMasteryWeaponIds ?? [];
        if (picks.length !== n) return `Pick ${n} Weapon Mastery weapons (${picks.length}/${n}).`;
        const allowed = catalog.masteryWeaponsByClass[c.id] ?? [];
        const byId = new Map(allowed.map((w) => [w.id, w]));
        const props = new Set<string>();
        for (const wid of picks) {
          const w = byId.get(wid);
          if (!w) return "That Weapon Mastery pick is not allowed.";
          if (props.has(w.masteryId)) return "Each mastery weapon needs a different property.";
          props.add(w.masteryId);
        }
      }
    }
    if (id === "species" && focusedSpeciesId !== draft.speciesId) {
      return "Press OK on a species card to select it.";
    }
    if (id === "origin" && bg().custom) {
      if ((draft.customSkills?.length ?? 0) !== 2) return "Custom origin: pick 2 skills.";
      if (!draft.customFeatId) return "Custom origin: pick an origin feat.";
      if (!draft.customTool) return "Custom origin: pick a tool.";
    }
    if (id === "training") {
      if (draft.classSkills.length !== c.skillChoices) return `Pick ${c.skillChoices} class skills.`;
      if (draft.classId === "rogue" && (draft.expertiseSkills?.length ?? 0) !== 2) return "Pick 2 skills for Expertise.";
      if (c.fightingStyleRequired && !draft.fightingStyleFeatId) return "Pick a fighting style on the Class step.";
      if (draft.speciesId === "human" && !draft.speciesSkill) return "Humans pick one extra skill.";
      if (draft.speciesId === "human" && !draft.originFeatId) return "Humans pick an origin feat.";
      if (originFeatId() === "skilled" && (draft.skilledPicks?.length ?? 0) !== 3) return "Skilled: pick 3 skills or tools.";
      if (bg().custom) {
        if ((draft.customSkills?.length ?? 0) !== 2) return "Custom origin: pick 2 skills.";
        if (!draft.customFeatId) return "Custom origin: pick an origin feat.";
        if (!draft.customTool) return "Custom origin: pick a tool.";
      }
    }
    if (id === "spells") {
      const needC = c.level1.cantrips ?? 0;
      const needP = c.level1.preparedSpells ?? 0;
      const needK = c.level1.spellsKnown ?? 0;
      if ((draft.cantrips?.length ?? 0) !== needC) return `Pick ${needC} cantrips.`;
      if ((draft.spellsPrepared?.length ?? 0) !== needP) return `Prepare ${needP} spells.`;
      if ((draft.spellsKnown?.length ?? 0) !== needK) return `Learn ${needK} spells.`;
      if (originFeatId() === "magic_initiate") {
        if ((draft.magicInitiateCantrips?.length ?? 0) !== 2) return "Magic Initiate: pick 2 cantrips.";
        if (!draft.magicInitiateSpell) return "Magic Initiate: pick a 1st-level spell.";
        if (!draft.magicInitiateAbility) return "Magic Initiate: pick a spellcasting ability.";
      }
    }
    if (id === "details" && !(draft.name ?? "").trim()) return "Name the hero.";
    if (id === "review" && !draft.portraitId) return "Pick a portrait for this hero.";
    if (id === "scores" && draft.method === "standard_array") {
      const vals = ABILITIES.map((a) => draft.baseAbilities[a]).sort((a, b) => b - a);
      const want = [15, 14, 13, 12, 10, 8];
      if (vals.some((v, i) => v !== want[i])) return "Assign each standard array value once.";
    }
    return "";
  };

  const spellCap = () => cls().maxSpellLevelAt[draft.level ?? 1] ?? 0;

  const fillSpellbook = () => {
    const c = cls();
    const need = c.level1.spellbookSize ?? 0;
    if (need <= 0) return;
    const book = [...new Set([...(draft.spellsPrepared ?? [])])];
    const cap = spellCap();
    const pool = catalog.spells.filter(
      (s) => s.classes.includes(draft.classId) && s.level >= 1 && s.level <= cap,
    );
    for (const spell of pool) {
      if (book.length >= need) break;
      if (!book.includes(spell.id)) book.push(spell.id);
    }
    draft.spellbook = book;
  };

  const syncPreview = () => {
    fillSpellbook();
    void opts.api<{ sheet: DerivedSheet }>("/api/builder/preview", { method: "POST", body: JSON.stringify(draft) }).then(
      (body) => {
        preview = body.sheet;
        const aside = host.querySelector(".hw-sheet");
        if (aside) aside.outerHTML = sheetHtml(preview, draft, catalog, sheetOpen);
        const peek = host.querySelector("#hwSheetPeek");
        if (peek) peek.textContent = peekLabel(preview, draft, catalog);
      },
      () => undefined,
    );
  };

  const paint = () => {
    const steps = visibleSteps();
    const id = steps[step] ?? "review";
    const c = cls();
    const origin = bg();
    let body = "";
    if (id === "class") {
      const focusRow = catalog.classes.find((r) => r.id === focusedClassId) ?? c;
      body = `${compactStrip(preview)}
        <div class="hw-split">
          <div class="hw-grid">${catalog.classes
            .map((row) => {
              const picked = row.id === draft.classId ? "picked" : "";
              const focused = row.id === focusedClassId ? "focused" : "";
              return `<button type="button" class="hw-card ${picked} ${focused}" data-class="${esc(row.id)}" data-focus-class="${esc(row.id)}">${crest(row.id)}<strong>${esc(row.name)}</strong><em>${esc(roleLine(row.caster, row.spellAbility))}</em></button>`;
            })
            .join("")}</div>
          ${classDetailHtml(focusRow, draft, catalog, focusRow.id === draft.classId)}
        </div>
        <div class="hw-mastery-sheet${masterySheetOpen ? " open" : ""}" id="hwMasterySheet">
          <button type="button" class="hw-ghost hw-sheet-close" id="hwMasteryClose">Close</button>
          <p class="hw-pending-title">Weapon Mastery</p>
          <div class="hw-row">${(catalog.masteryWeaponsByClass[focusRow.id] ?? [])
            .map((w) => {
              const on = (draft.weaponMasteryWeaponIds ?? []).includes(w.id);
              return `<button type="button" class="hw-chip ${on ? "picked" : ""}" data-mastery-w="${esc(w.id)}">${esc(w.name)} <em>${esc(w.masteryName)}</em></button>`;
            })
            .join("")}</div>
        </div>`;
    } else if (id === "origin") {
      body = `<div class="hw-grid">${catalog.backgrounds
        .map(
          (row) =>
            `<button type="button" class="hw-card ${row.id === draft.backgroundId ? "picked" : ""}" data-bg="${esc(row.id)}">${crest(row.id)}<strong>${esc(row.name)}</strong><em>${row.custom ? "Choose skills, feat, and tool" : row.skills.map((s) => catalog.skills[s]?.label ?? s).join(", ")}</em></button>`,
        )
        .join("")}</div>`;
      if (origin.custom) {
        const skillChips = Object.entries(catalog.skills)
          .map(
            ([sid, s]) =>
              `<button type="button" class="hw-chip ${draft.customSkills?.includes(sid) ? "picked" : ""}" data-cskill="${esc(sid)}">${esc(s.label)}</button>`,
          )
          .join("");
        const featChips = catalog.feats
          .filter((f) => f.category === "origin")
          .map((f) => `<button type="button" class="hw-chip ${draft.customFeatId === f.id ? "picked" : ""}" data-cfeat="${esc(f.id)}">${esc(f.name)}</button>`)
          .join("");
        const tools = ["thieves_tools", "herbalism_kit", "disguise_kit", "calligraphers_supplies", "navigators_tools", "gaming_set", "musical_instrument", "artisans_tools"];
        body += `<p class="hw-meta">Custom skills (2)</p><div class="hw-row">${skillChips}</div>
          <p class="hw-meta">Origin feat</p><div class="hw-row">${featChips}</div>
          <p class="hw-meta">Tool</p><div class="hw-row">${tools.map((t) => `<button type="button" class="hw-chip ${draft.customTool === t ? "picked" : ""}" data-ctool="${esc(t)}">${esc(t.replace(/_/g, " "))}</button>`).join("")}</div>`;
      }
    } else if (id === "species") {
      const focusSp = catalog.species.find((r) => r.id === focusedSpeciesId) ?? catalog.species.find((r) => r.id === draft.speciesId)!;
      body = `${compactStrip(preview)}
        <div class="hw-split">
          <div class="hw-grid">${catalog.species
            .map((row) => {
              const picked = row.id === draft.speciesId ? "picked" : "";
              const focused = row.id === focusedSpeciesId ? "focused" : "";
              return `<button type="button" class="hw-card ${picked} ${focused}" data-species="${esc(row.id)}" data-focus-species="${esc(row.id)}">${crest(row.id)}<strong>${esc(row.name)}</strong><em>${esc(row.traits.slice(0, 2).join(" · ") || "SRD species")}</em></button>`;
            })
            .join("")}</div>
          ${speciesDetailHtml(focusSp, focusSp.id === draft.speciesId)}
        </div>`;
    } else if (id === "scores") {
      body = `<div class="hw-row">${(["standard_array", "point_buy", "roll"] as const)
        .map((m) => `<button type="button" class="hw-chip ${draft.method === m ? "picked" : ""}" data-method="${m}">${m === "standard_array" ? "Standard array" : m === "point_buy" ? "Point buy" : "Roll"}</button>`)
        .join("")}</div>
        ${ABILITIES.map((a) => {
          const optsHtml =
            draft.method === "point_buy"
              ? Array.from({ length: 8 }, (_, i) => i + 8)
                  .map((n) => `<button type="button" class="hw-chip ${draft.baseAbilities[a] === n ? "picked" : ""}" data-score="${a}" data-val="${n}">${n}</button>`)
                  .join("")
              : [15, 14, 13, 12, 10, 8]
                  .map((n) => `<button type="button" class="hw-chip ${draft.baseAbilities[a] === n ? "picked" : ""}" data-score="${a}" data-val="${n}">${n}</button>`)
                  .join("");
          return `<div class="hw-score"><strong>${a.toUpperCase()}</strong><div class="hw-row">${optsHtml}</div><span>${draft.baseAbilities[a]}</span></div>`;
        }).join("")}
        <p class="hw-meta">Background ASI — tap one ability for +2, another for +1</p>
        <div class="hw-row"><button type="button" class="hw-chip ${draft.backgroundAsi?.mode === "plus2plus1" ? "picked" : ""}" data-asi="plus2plus1">+2 and +1</button><button type="button" class="hw-chip ${draft.backgroundAsi?.mode === "plus1x3" ? "picked" : ""}" data-asi="plus1x3">+1 / +1 / +1</button></div>
        <div class="hw-row">${origin.abilityOptions
          .map((a) => {
            const asi = draft.backgroundAsi;
            let mark = "";
            let label = a.toUpperCase();
            if (asi?.mode === "plus2plus1") {
              if (asi.plus2 === a) {
                mark = "picked";
                label = `${a.toUpperCase()} +2`;
              } else if (asi.plus1 === a) {
                mark = "picked";
                label = `${a.toUpperCase()} +1`;
              }
            } else if (asi?.mode === "plus1x3" && asi.abilities.includes(a)) {
              mark = "picked";
              label = `${a.toUpperCase()} +1`;
            }
            return `<button type="button" class="hw-chip ${mark}" data-asi-ab="${a}">${label}</button>`;
          })
          .join("")}</div>`;
    } else if (id === "training") {
      const originSkillsList = origin.custom ? (draft.customSkills ?? []) : (origin.skills ?? []);
      const bgSkills = new Set(originSkillsList);
      const skills = c.skillList
        .map((sk) => {
          const on = draft.classSkills.includes(sk);
          const fromOrigin = bgSkills.has(sk);
          return `<button type="button" class="hw-chip ${on ? "picked" : ""} ${fromOrigin ? "from-origin" : ""}" data-skill="${esc(sk)}"${fromOrigin ? " disabled title=\"Already from your origin\"" : ""}>${esc(catalog.skills[sk]?.label ?? sk)}</button>`;
        })
        .join("");
      const styleName = draft.fightingStyleFeatId
        ? catalog.feats.find((f) => f.id === draft.fightingStyleFeatId)?.name ?? draft.fightingStyleFeatId
        : "";
      const styles = c.fightingStyleRequired
        ? `<p class="hw-meta">Fighting style</p><p class="hw-meta">Already chosen on Class: <strong>${esc(styleName || "—")}</strong>. Go back to Class to change it.</p>`
        : "";
      const expert =
        c.id === "rogue"
          ? `<p class="hw-meta">Expertise (2)</p><div class="hw-row">${[...new Set([...originSkillsList, ...draft.classSkills, ...(draft.speciesSkill ? [draft.speciesSkill] : [])])]
              .map((sk) => `<button type="button" class="hw-chip ${draft.expertiseSkills?.includes(sk) ? "picked" : ""}" data-expert="${esc(sk)}">${esc(catalog.skills[sk]?.label ?? sk)}</button>`)
              .join("")}</div>`
          : "";
      const human =
        draft.speciesId === "human"
          ? `<p class="hw-meta">Human skill</p><div class="hw-row">${Object.entries(catalog.skills)
              .map(([sid, s]) => `<button type="button" class="hw-chip ${draft.speciesSkill === sid ? "picked" : ""}" data-hskill="${esc(sid)}">${esc(s.label)}</button>`)
              .join("")}</div>
             <p class="hw-meta">Origin feat</p><div class="hw-row">${catalog.feats
               .filter((f) => f.category === "origin")
               .map((f) => `<button type="button" class="hw-chip ${draft.originFeatId === f.id ? "picked" : ""}" data-ofeat="${esc(f.id)}">${esc(f.name)}</button>`)
               .join("")}</div>`
          : "";
      const skilled =
        originFeatId() === "skilled"
          ? `<p class="hw-meta">Skilled picks (3)</p><div class="hw-row">${Object.entries(catalog.skills)
              .map(([sid, s]) => `<button type="button" class="hw-chip ${draft.skilledPicks?.includes(sid) ? "picked" : ""}" data-skilled="${esc(sid)}">${esc(s.label)}</button>`)
              .join("")}</div>`
          : "";
      body = `<p class="hw-meta">Pick ${c.skillChoices} class skills</p><p class="hw-meta">Green chips are already from your origin — choose different skills.</p><div class="hw-row">${skills}</div>${expert}${styles}${human}${skilled}`;
    } else if (id === "gear") {
      body = `<p class="hw-meta">Class kit</p><div class="hw-grid">${c.equipChoices
        .map((e) => `<button type="button" class="hw-card ${draft.equipChoice === e.id ? "picked" : ""}" data-equip="${e.id}"><strong>${e.id}</strong><em>${esc(e.label)}</em></button>`)
        .join("")}</div>
        <p class="hw-meta">Origin kit</p><div class="hw-grid">${origin.equipChoices
          .map((e) => `<button type="button" class="hw-card ${draft.backgroundEquipChoice === e.id ? "picked" : ""}" data-bgequip="${e.id}"><strong>${e.id}</strong><em>${esc(e.label)}</em></button>`)
          .join("")}</div>`;
    } else if (id === "spells") {
      const pool = catalog.spells.filter((s) => s.classes.includes(draft.classId));
      const cap = spellCap();
      const leveled = pool.filter((s) => s.level >= 1 && s.level <= cap);
      const block = (title: string, level: "cantrip" | "prepared" | "known", list: typeof pool) =>
        `<p class="hw-meta">${title}</p><div class="hw-row">${list
          .map((s) => {
            const bag = level === "cantrip" ? draft.cantrips : level === "prepared" ? draft.spellsPrepared : draft.spellsKnown;
            const on = bag?.includes(s.id);
            return `<button type="button" class="hw-chip ${on ? "picked" : ""}" data-spell="${esc(s.id)}" data-bag="${level}">${esc(s.name)}</button>`;
          })
          .join("")}</div>`;
      body = `${(c.level1.cantrips ?? 0) ? block(`Cantrips (${c.level1.cantrips})`, "cantrip", pool.filter((s) => s.level === 0)) : ""}${(c.level1.preparedSpells ?? 0) ? block(`Prepared (${c.level1.preparedSpells})`, "prepared", leveled) : ""}${(c.level1.spellsKnown ?? 0) ? block(`Known (${c.level1.spellsKnown})`, "known", leveled) : ""}`;
      if (originFeatId() === "magic_initiate") {
        const list = origin.featChoice ?? "wizard";
        const miPool = catalog.spells.filter((s) => s.classes.includes(list));
        body += `<p class="hw-meta">Magic Initiate (${esc(list)}) cantrips (2)</p><div class="hw-row">${miPool
          .filter((s) => s.level === 0)
          .map((s) => `<button type="button" class="hw-chip ${draft.magicInitiateCantrips?.includes(s.id) ? "picked" : ""}" data-mi-c="${esc(s.id)}">${esc(s.name)}</button>`)
          .join("")}</div>
          <p class="hw-meta">Magic Initiate 1st-level spell</p><div class="hw-row">${miPool
            .filter((s) => s.level === 1)
            .map((s) => `<button type="button" class="hw-chip ${draft.magicInitiateSpell === s.id ? "picked" : ""}" data-mi-s="${esc(s.id)}">${esc(s.name)}</button>`)
            .join("")}</div>
          <p class="hw-meta">Spellcasting ability</p><div class="hw-row">${(["int", "wis", "cha"] as const)
            .map((a) => `<button type="button" class="hw-chip ${draft.magicInitiateAbility === a ? "picked" : ""}" data-mi-ab="${a}">${a}</button>`)
            .join("")}</div>`;
      }
    } else if (id === "details") {
      body = `<label class="hw-field">Name <input id="hwName" maxlength="32" value="${esc(draft.name ?? "")}" /></label>
        <label class="hw-field">About <textarea id="hwAbout" maxlength="240" rows="3">${esc(draft.about ?? "")}</textarea></label>
        <label class="hw-field">Languages <input id="hwLang" value="${esc((draft.languages ?? []).join(", "))}" placeholder="Common, Elvish" /></label>`;
    } else {
      ensurePortraitPick();
      const sex = draft.sex ?? "f";
      const forgeHits = catalog.portraits.filter(
        (p) => p.speciesId === draft.speciesId && p.classId === draft.classId && p.sex === sex,
      );
      const portraitChoices =
        forgeHits.length > 0
          ? forgeHits
          : catalog.portraits.filter((p) => !p.speciesId).slice(0, 8);
      const portraitGrid = portraitChoices
        .map((p) => {
          const on = draft.portraitId === p.id ? "picked" : "";
          return `<button type="button" class="hw-portrait ${on}" data-portrait="${esc(p.id)}" title="${esc(p.id)}"><img src="${esc(p.url)}" alt="" loading="lazy" /></button>`;
        })
        .join("");
      const missingNote =
        forgeHits.length === 0
          ? `<p class="hw-meta">No forged look for this species and class yet — pick a classic face.</p>`
          : `<p class="hw-meta">Choose presentation and one of two looks. This face stays with the hero.</p>`;
      body = `<p>Create this hero. Their starting kit is tied to this character; loot and shop buys go in the shared stash. You begin at level 1.</p>
        <p class="hw-section">Portrait</p>
        <p class="hw-meta">Presentation</p>
        <div class="hw-row">
          <button type="button" class="hw-chip ${sex === "f" ? "picked" : ""}" data-sex="f">Female</button>
          <button type="button" class="hw-chip ${sex === "m" ? "picked" : ""}" data-sex="m">Male</button>
        </div>
        ${missingNote}
        <div class="hw-portraits">${portraitGrid || `<div class="hw-portrait missing">No portraits yet</div>`}</div>`;
    }

    const slim = id === "class" || id === "species";
    const nextDisabled = id === "class" && (!classPendingOk() || focusedClassId !== draft.classId);
    host.innerHTML = `<button type="button" class="hw-scrim${sheetOpen || masterySheetOpen ? " on" : ""}" id="hwScrim" aria-label="Close sheet"></button><div class="hw ${opts.layout === "phone" ? "phone" : ""} ${slim ? "slim-side" : ""}">
      <div class="hw-main">
        <div class="hw-top"><button type="button" class="hw-ghost" id="hwClose">Close</button><div><p class="hw-kicker">Step ${step + 1} of ${steps.length}</p><h2>${esc(STEP_TITLE[id])}</h2></div></div>
        <div class="hw-progress">${steps.map((s, i) => `<button type="button" class="hw-dot ${i === step ? "on" : ""} ${i < step ? "done" : ""}" data-dot="${i}" aria-label="${esc(STEP_TITLE[s])}"></button>`).join("")}</div>
        <div class="hw-body">${body}</div>
        <p class="hw-err" id="hwErr">${esc(localError)}</p>
        <div class="hw-nav">
          <button type="button" id="hwPrev" ${step === 0 ? "disabled" : ""}>Back</button>
          <button type="button" class="hw-chip hw-peek" id="hwSheetPeek">${esc(peekLabel(preview, draft, catalog))}</button>
          <button type="button" class="go" id="hwNext" ${nextDisabled ? "disabled" : ""}>${id === "review" ? "Create hero" : "Next"}</button>
        </div>
      </div>
      ${sheetHtml(preview, draft, catalog, sheetOpen)}
    </div>`;

    host.querySelector("#hwClose")!.addEventListener("click", () => opts.onClose());
    host.querySelector("#hwPrev")!.addEventListener("click", () => go(-1));
    host.querySelector("#hwNext")!.addEventListener("click", () => void go(1));
    host.querySelectorAll<HTMLButtonElement>("[data-dot]").forEach((b) => b.addEventListener("click", () => { step = Number(b.dataset.dot); localError = ""; paint(); }));
    const commitClass = (classId: string) => {
      if (draft.classId !== classId) {
        draft.classId = classId;
        draft.classSkills = [];
        draft.expertiseSkills = [];
        draft.cantrips = [];
        draft.spellsPrepared = [];
        draft.spellsKnown = [];
        draft.spellbook = [];
        draft.weaponMasteryWeaponIds = [];
        draft.fightingStyleFeatId = undefined;
      }
      focusedClassId = classId;
      paint();
    };
    host.querySelectorAll<HTMLButtonElement>("[data-class]").forEach((b) =>
      b.addEventListener("click", () => {
        const classId = b.dataset.class!;
        if (opts.layout === "phone") {
          commitClass(classId);
          return;
        }
        if (focusedClassId === classId && draft.classId === classId) return;
        if (focusedClassId === classId) {
          commitClass(classId);
          return;
        }
        focusedClassId = classId;
        paint();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-class]").forEach((b) =>
      b.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          commitClass(b.dataset.class!);
        }
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-bg]").forEach((b) =>
      b.addEventListener("click", () => {
        draft.backgroundId = b.dataset.bg!;
        draft.customSkills = [];
        draft.customFeatId = undefined;
        draft.customTool = undefined;
        draft.skilledPicks = [];
        draft.magicInitiateCantrips = [];
        draft.magicInitiateSpell = undefined;
        const originSkills = bg().custom ? (draft.customSkills ?? []) : (bg().skills ?? []);
        draft.classSkills = draft.classSkills.filter((sk) => !originSkills.includes(sk));
        const options = bg().abilityOptions;
        draft.backgroundAsi = {
          mode: "plus2plus1",
          plus2: options[0]!,
          plus1: options.find((a) => a !== options[0]) ?? options[0]!,
        };
        paint();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-cskill]").forEach((b) =>
      b.addEventListener("click", () => {
        const sk = b.dataset.cskill!;
        const cur = new Set(draft.customSkills ?? []);
        if (cur.has(sk)) cur.delete(sk);
        else if (cur.size < 2) cur.add(sk);
        draft.customSkills = [...cur];
        paint();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-cfeat]").forEach((b) =>
      b.addEventListener("click", () => {
        draft.customFeatId = b.dataset.cfeat;
        draft.skilledPicks = [];
        paint();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-ctool]").forEach((b) =>
      b.addEventListener("click", () => {
        draft.customTool = b.dataset.ctool;
        paint();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-skilled]").forEach((b) =>
      b.addEventListener("click", () => {
        const sk = b.dataset.skilled!;
        const cur = new Set(draft.skilledPicks ?? []);
        if (cur.has(sk)) cur.delete(sk);
        else if (cur.size < 3) cur.add(sk);
        draft.skilledPicks = [...cur];
        paint();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-mi-c]").forEach((b) =>
      b.addEventListener("click", () => {
        const idSpell = b.dataset.miC!;
        const cur = new Set(draft.magicInitiateCantrips ?? []);
        if (cur.has(idSpell)) cur.delete(idSpell);
        else if (cur.size < 2) cur.add(idSpell);
        draft.magicInitiateCantrips = [...cur];
        paint();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-mi-s]").forEach((b) =>
      b.addEventListener("click", () => {
        draft.magicInitiateSpell = b.dataset.miS;
        paint();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-mi-ab]").forEach((b) =>
      b.addEventListener("click", () => {
        draft.magicInitiateAbility = b.dataset.miAb as AbilityKey;
        paint();
      }),
    );
    const commitSpecies = (speciesId: string) => {
      draft.speciesId = speciesId;
      focusedSpeciesId = speciesId;
      if (speciesId !== "human") {
        draft.speciesSkill = undefined;
        draft.originFeatId = undefined;
      }
      paint();
    };
    host.querySelectorAll<HTMLButtonElement>("[data-species]").forEach((b) =>
      b.addEventListener("click", () => {
        const speciesId = b.dataset.species!;
        if (opts.layout === "phone") {
          commitSpecies(speciesId);
          return;
        }
        if (focusedSpeciesId === speciesId && draft.speciesId === speciesId) return;
        if (focusedSpeciesId === speciesId) {
          commitSpecies(speciesId);
          return;
        }
        focusedSpeciesId = speciesId;
        paint();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-species]").forEach((b) =>
      b.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          commitSpecies(b.dataset.species!);
        }
      }),
    );
    const toggleMastery = (wid: string) => {
      const cNow = catalog.classes.find((row) => row.id === focusedClassId) ?? cls();
      const need = cNow.weaponMasteryCountL1;
      const allowed = catalog.masteryWeaponsByClass[cNow.id] ?? [];
      const byId = new Map(allowed.map((w) => [w.id, w]));
      const pick = byId.get(wid);
      if (!pick) return;
      let cur = [...(draft.weaponMasteryWeaponIds ?? [])];
      if (cur.includes(wid)) cur = cur.filter((x) => x !== wid);
      else {
        const props = new Set(cur.map((id) => byId.get(id)?.masteryId).filter(Boolean));
        if (props.has(pick.masteryId)) return;
        if (cur.length >= need) cur = cur.slice(1);
        cur.push(wid);
      }
      draft.weaponMasteryWeaponIds = cur;
      if (draft.classId !== focusedClassId) commitClass(focusedClassId);
      else paint();
    };
    host.querySelectorAll<HTMLButtonElement>("[data-mastery-w]").forEach((b) =>
      b.addEventListener("click", () => toggleMastery(b.dataset.masteryW!)),
    );
    host.querySelector("#hwOpenMastery")?.addEventListener("click", () => {
      masterySheetOpen = true;
      paint();
    });
    host.querySelector("#hwMasteryClose")?.addEventListener("click", () => {
      masterySheetOpen = false;
      paint();
    });
    host.querySelectorAll<HTMLButtonElement>("[data-method]").forEach((b) => b.addEventListener("click", () => { draft.method = b.dataset.method as BuilderDraft["method"]; paint(); }));
    host.querySelectorAll<HTMLButtonElement>("[data-score]").forEach((b) => b.addEventListener("click", () => { draft.baseAbilities[b.dataset.score as AbilityKey] = Number(b.dataset.val); paint(); }));
    host.querySelectorAll<HTMLButtonElement>("[data-asi-ab]").forEach((b) =>
      b.addEventListener("click", () => {
        const ab = b.dataset.asiAb as AbilityKey;
        const cur = draft.backgroundAsi;
        if (!cur || cur.mode === "plus1x3") {
          draft.backgroundAsi = { mode: "plus2plus1", plus2: ab, plus1: origin.abilityOptions.find((x) => x !== ab) ?? ab };
        } else if (cur.plus2 === ab) {
          draft.backgroundAsi = { mode: "plus2plus1", plus2: cur.plus1, plus1: ab };
        } else {
          draft.backgroundAsi = { mode: "plus2plus1", plus2: ab, plus1: cur.plus2 === ab ? cur.plus1 : cur.plus2 };
        }
        paint();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-asi]").forEach((b) =>
      b.addEventListener("click", () => {
        const mode = b.dataset.asi as "plus2plus1" | "plus1x3";
        const optsAb = origin.abilityOptions;
        draft.backgroundAsi =
          mode === "plus1x3"
            ? { mode, abilities: [optsAb[0]!, optsAb[1] ?? optsAb[0]!, optsAb[2] ?? optsAb[0]!] }
            : { mode, plus2: optsAb[0]!, plus1: optsAb[1] ?? optsAb[0]! };
        paint();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-skill]").forEach((b) =>
      b.addEventListener("click", () => {
        const sk = b.dataset.skill!;
        const originSkills = bg().custom ? (draft.customSkills ?? []) : (bg().skills ?? []);
        if (originSkills.includes(sk)) return;
        if (draft.classSkills.includes(sk)) draft.classSkills = draft.classSkills.filter((x) => x !== sk);
        else if (draft.classSkills.length < c.skillChoices) draft.classSkills = [...draft.classSkills, sk];
        const allowed = new Set([...originSkills, ...draft.classSkills, ...(draft.speciesSkill ? [draft.speciesSkill] : [])]);
        draft.expertiseSkills = (draft.expertiseSkills ?? []).filter((id) => allowed.has(id));
        paint();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-expert]").forEach((b) =>
      b.addEventListener("click", () => {
        const sk = b.dataset.expert!;
        const cur = new Set(draft.expertiseSkills ?? []);
        if (cur.has(sk)) cur.delete(sk);
        else if (cur.size < 2) cur.add(sk);
        draft.expertiseSkills = [...cur];
        paint();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-style]").forEach((b) => b.addEventListener("click", () => { draft.fightingStyleFeatId = b.dataset.style; paint(); }));
    host.querySelectorAll<HTMLButtonElement>("[data-hskill]").forEach((b) => b.addEventListener("click", () => { draft.speciesSkill = b.dataset.hskill; paint(); }));
    host.querySelectorAll<HTMLButtonElement>("[data-ofeat]").forEach((b) => b.addEventListener("click", () => { draft.originFeatId = b.dataset.ofeat; paint(); }));
    host.querySelectorAll<HTMLButtonElement>("[data-equip]").forEach((b) => b.addEventListener("click", () => { draft.equipChoice = b.dataset.equip as "A" | "B" | "C"; paint(); }));
    host.querySelectorAll<HTMLButtonElement>("[data-bgequip]").forEach((b) => b.addEventListener("click", () => { draft.backgroundEquipChoice = b.dataset.bgequip as "A" | "B"; paint(); }));
    host.querySelectorAll<HTMLButtonElement>("[data-spell]").forEach((b) =>
      b.addEventListener("click", () => {
        const bagKey = b.dataset.bag === "cantrip" ? "cantrips" : b.dataset.bag === "prepared" ? "spellsPrepared" : "spellsKnown";
        const cap = b.dataset.bag === "cantrip" ? c.level1.cantrips ?? 0 : b.dataset.bag === "prepared" ? c.level1.preparedSpells ?? 0 : c.level1.spellsKnown ?? 0;
        const current = [...(draft[bagKey] ?? [])];
        const bag = new Set(current);
        if (bag.has(b.dataset.spell!)) bag.delete(b.dataset.spell!);
        else if (bag.size < cap) bag.add(b.dataset.spell!);
        draft[bagKey] = [...bag];
        paint();
      }),
    );
    const name = host.querySelector<HTMLInputElement>("#hwName");
    name?.addEventListener("input", () => { draft.name = name.value; });
    host.querySelectorAll<HTMLButtonElement>("[data-sex]").forEach((b) =>
      b.addEventListener("click", () => {
        draft.sex = b.dataset.sex === "m" ? "m" : "f";
        const match = catalog.portraits.find(
          (p) => p.speciesId === draft.speciesId && p.classId === draft.classId && p.sex === draft.sex,
        );
        draft.portraitId = match?.id;
        paint();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-portrait]").forEach((b) =>
      b.addEventListener("click", () => {
        draft.portraitId = b.dataset.portrait;
        paint();
      }),
    );
    host.querySelector<HTMLTextAreaElement>("#hwAbout")?.addEventListener("input", (ev) => { draft.about = (ev.target as HTMLTextAreaElement).value; });
    host.querySelector<HTMLInputElement>("#hwLang")?.addEventListener("input", (ev) => {
      draft.languages = (ev.target as HTMLInputElement).value.split(",").map((s) => s.trim()).filter(Boolean);
    });
    const first = host.querySelector<HTMLButtonElement>(".hw-body .hw-card, .hw-body .hw-chip, #hwName, #hwNext");
    first?.focus();
    syncPreview();
  };

  const go = async (dir: number) => {
    const steps = visibleSteps();
    const id = steps[step]!;
    if (dir > 0) {
      localError = validateStep(id);
      if (localError) {
        paint();
        return;
      }
      if (id === "review") {
        try {
          fillSpellbook();
          const out = await opts.api<{ hero: ForgedHero }>("/api/builder/commit", { method: "POST", body: JSON.stringify(draft) });
          opts.onDone(out.hero);
        } catch (err) {
          localError = err instanceof Error ? err.message : "Could not create.";
          paint();
        }
        return;
      }
    }
    step = Math.max(0, Math.min(steps.length - 1, step + dir));
    localError = "";
    paint();
  };

  host.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("#hwSheetPeek")) {
      sheetOpen = !sheetOpen;
      paint();
      return;
    }
    if (target.closest("#hwScrim") || target.closest("#hwSheetClose") || target.closest("#hwMasteryClose")) {
      sheetOpen = false;
      masterySheetOpen = false;
      paint();
    }
  });

  paint();
  return {
    next: () => void go(1),
    prev: () => void go(-1),
    back: () => {
      if (step === 0) opts.onClose();
      else void go(-1);
    },
    close: () => opts.onClose(),
  };
}
