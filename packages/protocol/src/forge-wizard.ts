/**
 * Guided hero forge (Roll20-style steps). Shared by the TV modal and the phone.
 * The server remains authoritative: every change posts /api/builder/preview.
 */

import type { AbilityKey, BuilderCatalog, BuilderDraft, DerivedSheet } from "./builder.js";
import { describeError } from "./index.js";

const ABILITIES: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];
const STEPS = ["class", "origin", "species", "scores", "training", "gear", "spells", "details", "review"] as const;
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
  review: "Review",
};

export type ForgeWizardOptions = {
  api: <T>(url: string, init?: RequestInit) => Promise<T>;
  layout: "tv" | "phone";
  onDone: () => void;
  onClose: () => void;
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
  if (document.getElementById("forge-wizard-css")) return;
  const style = document.createElement("style");
  style.id = "forge-wizard-css";
  style.textContent = `
    .hw { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(17rem, 0.62fr); gap: 1.1rem; min-height: 70vh; color: #f6ead6; font-family: var(--font-body, Georgia, serif); background: #120c09; }
    .hw-main { display: flex; flex-direction: column; gap: 0.75rem; min-width: 0; min-height: 0; }
    .hw-top { display: flex; align-items: center; gap: 0.75rem; }
    .hw-top h2 { font-family: var(--font-display, Cinzel, serif); margin: 0; font-size: 1.7rem; letter-spacing: 0.06em; text-transform: uppercase; }
    .hw-kicker { margin: 0; color: #f0a05a; letter-spacing: 0.16em; text-transform: uppercase; font-size: 0.72rem; font-family: var(--font-display, Cinzel, serif); }
    .hw-progress { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .hw-dot { width: 0.85rem; height: 0.85rem; border-radius: 99px; border: 1px solid rgba(240,160,90,0.55); background: #1c130e; padding: 0; }
    .hw-dot.on { background: #f0a05a; box-shadow: 0 0 12px rgba(255,140,60,0.85); }
    .hw-dot.done { background: #8a5a32; }
    .hw-body { min-height: 0; }
    .hw-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.7rem; }
    .hw-card, .hw-chip, .hw-nav button, .hw-ghost {
      appearance: none; border: 1px solid rgba(246,234,214,0.18); background: #1c130e;
      color: inherit; border-radius: 14px; cursor: pointer; text-align: left;
    }
    .hw-card { padding: 0.85rem 0.95rem 0.95rem; min-height: 7.4rem; display: grid; gap: 0.2rem; align-content: start;
      background: linear-gradient(180deg, #2a1c14 0%, #140e0b 100%);
      transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease; }
    .hw-card:hover { transform: translateY(-2px); border-color: rgba(240,160,90,0.7); }
    .hw-card strong { font-family: var(--font-display, Cinzel, serif); font-size: 1.05rem; letter-spacing: 0.03em; }
    .hw-card em, .hw-meta { font-style: normal; color: #cdbb9e; font-size: 0.82rem; }
    .hw-card.picked, .hw-chip.picked { border-color: #f0a05a; box-shadow: 0 0 0 2px rgba(255,160,70,0.45), 0 0 26px rgba(255,120,40,0.32); background: linear-gradient(180deg, #3d2618, #1a100c); }
    .hw-card:focus-visible, .hw-chip:focus-visible, .hw-nav button:focus-visible, .hw-ghost:focus-visible, .hw-dot:focus-visible {
      outline: 3px solid #ffd08a; outline-offset: 3px;
    }
    .hw-crest { width: 2.8rem; height: 2.8rem; border-radius: 12px; display: grid; place-items: center;
      background: radial-gradient(circle at 40% 30%, #e07a32, #3a2014 42%, #120c09 74%);
      box-shadow: inset 0 0 0 1px rgba(255,210,160,0.25), 0 8px 18px rgba(0,0,0,0.35); margin-bottom: 0.35rem; }
    .hw-crest svg { width: 1.55rem; height: 1.55rem; }
    .hw-chip { width: auto; padding: 0.6rem 0.85rem; min-height: 2.9rem; border-radius: 999px; }
    .hw-card { width: 100%; }
    .hw-ghost { width: auto; }
    .hw-dot { width: 0.85rem; height: 0.85rem; flex: 0 0 0.85rem; padding: 0; }
    .hw-row { display: flex; flex-wrap: wrap; gap: 0.45rem; }
    .hw-score { display: grid; grid-template-columns: 3.2rem 1fr auto; gap: 0.45rem; align-items: center; margin-bottom: 0.4rem; }
    .hw-nav { display: flex; gap: 0.6rem; margin-top: auto; }
    .hw-nav button, .hw-ghost { padding: 0.75rem 1.1rem; min-height: 3rem; font-size: 1rem; }
    .hw-nav .go { background: linear-gradient(180deg, #e07a32, #9a3e16); border-color: transparent; font-family: var(--font-display, Cinzel, serif); letter-spacing: 0.08em; text-transform: uppercase; box-shadow: 0 8px 22px rgba(200,80,20,0.35); }
    .hw-nav button:disabled { opacity: 0.4; }
    .hw-sheet { background: #1a120e; border: 1px solid rgba(240,160,90,0.4); border-radius: 16px; padding: 1rem 1.05rem; box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 16px 40px rgba(0,0,0,0.35); }
    .hw-sheet h3 { font-family: var(--font-display, Cinzel, serif); margin: 0 0 0.35rem; font-size: 1.25rem; }
    .hw-sheet p { margin: 0.15rem 0; }
    .hw-err { color: #e6735f; min-height: 1.2rem; }
    .hw-field { display: grid; gap: 0.3rem; margin-bottom: 0.7rem; }
    .hw-field input, .hw-field textarea {
      background: #120c09; color: inherit; border: 1px solid rgba(246,234,214,0.22); border-radius: 12px; padding: 0.75rem; font: inherit; min-height: 2.9rem;
    }
    .hw.phone { display: flex; flex-direction: column; height: auto; min-height: 0; flex: 1 1 auto; gap: 0; overflow: hidden; background: #120c09; }
    .hw.phone .hw-grid { grid-template-columns: 1fr 1fr; }
    .hw.phone .hw-main { flex: 1 1 0; min-height: 0; overflow: hidden; }
    .hw.phone .hw-body { flex: 1 1 auto; min-height: 0; overflow: auto; -webkit-overflow-scrolling: touch; padding-right: 0.1rem; padding-bottom: 0.4rem; }
    .hw.phone .hw-top { align-items: flex-start; }
    .hw.phone .hw-top > div { flex: 1; min-width: 0; text-align: right; }
    .hw.phone .hw-kicker { white-space: nowrap; }
    .hw.phone .hw-top h2 { font-size: 1.2rem; line-height: 1.05; }
    .hw.phone .hw-card { min-height: 6.6rem; }
    .hw.phone .hw-score { grid-template-columns: auto 1fr; }
    .hw.phone .hw-score .hw-row { grid-column: 1 / -1; }
    .hw.phone .hw-chip, .hw.phone .hw-nav button, .hw.phone .hw-ghost { min-height: 3rem; }
    .hw-peek { display: none; }
    .hw-scrim { display: none; position: fixed; inset: 0; z-index: 25; background: rgba(0, 0, 0, 0.55); border: 0; padding: 0; }
    .hw-scrim.on { display: block; }
    .hw.phone .hw-nav button { width: 100%; }
    .hw.phone .hw-nav {
      flex: 0 0 auto; display: grid; grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: stretch; gap: 0.45rem; padding: 0.45rem 0 0.15rem;
      background: #120c09; border-top: 1px solid rgba(240, 160, 90, 0.4); z-index: 4;
    }
    .hw.phone .hw-peek { display: grid; place-items: center; text-align: center; min-height: 3rem; padding: 0.35rem 0.6rem; border-radius: 999px; font-size: 0.82rem; }
    .hw.phone .hw-sheet {
      display: none; position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
      max-height: min(72vh, 32rem); overflow: auto; margin: 0;
      border-radius: 18px 18px 0 0; padding: 0.85rem 1rem max(1rem, env(safe-area-inset-bottom));
      box-shadow: 0 -18px 48px rgba(0, 0, 0, 0.55);
    }
    .hw.phone .hw-sheet.open { display: block; }
    .hw-sheet-close { display: none; margin-bottom: 0.45rem; }
    .hw.phone .hw-sheet .hw-sheet-close { display: inline-flex; }
  `;
  document.head.appendChild(style);
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
      return describeError(code);
    })
    .join(" ");
}

function sheetHtml(sheet: DerivedSheet | null, draft: BuilderDraft, catalog: BuilderCatalog, open: boolean): string {
  if (!sheet) return `<aside class="hw-sheet" id="hwSheet"><h3>Sheet</h3><p class="hw-meta">Choices update this panel.</p></aside>`;
  const abs = ABILITIES.map((a) => `${a.toUpperCase()} ${sheet.abilities[a].score}`).join(" · ");
  const skills = sheet.skills
    .filter((s) => s.proficient)
    .map((s) => `${s.label} ${s.mod >= 0 ? "+" : ""}${s.mod}${s.expertise ? " (Expertise)" : ""}`)
    .join(", ") || "—";
  const saves = sheet.savingThrows.map((s) => `${s.ability.toUpperCase()} ${s.mod >= 0 ? "+" : ""}${s.mod}`).join(" · ") || "—";
  const slots = sheet.spellSlots
    ? Object.entries(sheet.spellSlots)
        .filter(([, n]) => n > 0)
        .map(([level, n]) => `L${level} ×${n}`)
        .join(" · ")
    : "";
  return `<aside class="hw-sheet${open ? " open" : ""}" id="hwSheet" aria-live="polite">
    <p class="hw-kicker">Live sheet</p>
    <h3>${esc(sheet.name || "Unnamed")}</h3>
    <p>L${sheet.level} ${esc(sheet.speciesName)} ${esc(sheet.className)}</p>
    <p>${esc(sheet.backgroundName)}</p>
    <p>HP ${sheet.hp} · AC ${sheet.ac} · Prof +${sheet.proficiencyBonus} · PP ${sheet.passivePerception}</p>
    <p class="hw-meta">Saves ${esc(saves)}</p>
    <p class="hw-meta">${esc(abs)}</p>
    <p class="hw-meta">${esc(skills)}</p>
    ${slots ? `<p class="hw-meta">Slots ${esc(slots)}</p>` : ""}
    ${(sheet.cantripIds?.length || sheet.preparedSpellIds?.length) ? `<p class="hw-meta">Cantrips ${sheet.cantripIds?.length ?? 0} · Prepared ${sheet.preparedSpellIds?.length ?? 0}</p>` : ""}
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

export async function mountForgeWizard(host: HTMLElement, opts: ForgeWizardOptions): Promise<ForgeWizardHandle> {
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
  };
  let step = 0;
  let preview: DerivedSheet | null = null;
  let localError = "";
  let sheetOpen = false;

  const cls = () => catalog.classes.find((c) => c.id === draft.classId)!;
  const bg = () => catalog.backgrounds.find((b) => b.id === draft.backgroundId)!;
  const visibleSteps = (): StepId[] => {
    const c = cls();
    const needSpell = (c.level1.cantrips ?? 0) + (c.level1.preparedSpells ?? 0) + (c.level1.spellsKnown ?? 0) > 0;
    return STEPS.filter((id) => id !== "spells" || needSpell);
  };

  const validateStep = (id: StepId): string => {
    const c = cls();
    if (id === "training") {
      if (draft.classSkills.length !== c.skillChoices) return `Pick ${c.skillChoices} class skills.`;
      if (draft.classId === "rogue" && (draft.expertiseSkills?.length ?? 0) !== 2) return "Pick 2 skills for Expertise.";
      if (c.fightingStyleRequired && !draft.fightingStyleFeatId) return "Pick a fighting style.";
      if (draft.speciesId === "human" && !draft.speciesSkill) return "Humans pick one extra skill.";
      if (draft.speciesId === "human" && !draft.originFeatId) return "Humans pick an origin feat.";
    }
    if (id === "spells") {
      const needC = c.level1.cantrips ?? 0;
      const needP = c.level1.preparedSpells ?? 0;
      const needK = c.level1.spellsKnown ?? 0;
      if ((draft.cantrips?.length ?? 0) !== needC) return `Pick ${needC} cantrips.`;
      if ((draft.spellsPrepared?.length ?? 0) !== needP) return `Prepare ${needP} spells.`;
      if ((draft.spellsKnown?.length ?? 0) !== needK) return `Learn ${needK} spells.`;
    }
    if (id === "details" && !(draft.name ?? "").trim()) return "Name the hero.";
    if (id === "scores" && draft.method === "standard_array") {
      const vals = ABILITIES.map((a) => draft.baseAbilities[a]).sort((a, b) => b - a);
      const want = [15, 14, 13, 12, 10, 8];
      if (vals.some((v, i) => v !== want[i])) return "Assign each standard array value once.";
    }
    return "";
  };

  const fillSpellbook = () => {
    const c = cls();
    const need = c.level1.spellbookSize ?? 0;
    if (need <= 0) return;
    const book = [...new Set([...(draft.spellsPrepared ?? [])])];
    const pool = catalog.spells.filter((s) => s.classes.includes(draft.classId) && s.level === 1);
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
      body = `<div class="hw-grid">${catalog.classes
        .map(
          (row) =>
            `<button type="button" class="hw-card ${row.id === draft.classId ? "picked" : ""}" data-class="${esc(row.id)}">${crest(row.id)}<strong>${esc(row.name)}</strong><em>${esc(roleLine(row.caster, row.spellAbility))}</em></button>`,
        )
        .join("")}</div>`;
    } else if (id === "origin") {
      body = `<div class="hw-grid">${catalog.backgrounds
        .map(
          (row) =>
            `<button type="button" class="hw-card ${row.id === draft.backgroundId ? "picked" : ""}" data-bg="${esc(row.id)}">${crest(row.id)}<strong>${esc(row.name)}</strong><em>${row.skills.map((s) => catalog.skills[s]?.label ?? s).join(", ")}</em></button>`,
        )
        .join("")}</div>`;
    } else if (id === "species") {
      body = `<div class="hw-grid">${catalog.species
        .map(
          (row) =>
            `<button type="button" class="hw-card ${row.id === draft.speciesId ? "picked" : ""}" data-species="${esc(row.id)}">${crest(row.id)}<strong>${esc(row.name)}</strong><em>${esc(row.traits.slice(0, 2).join(" · ") || "SRD species")}</em></button>`,
        )
        .join("")}</div>`;
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
        <p class="hw-meta">Background ASI</p>
        <div class="hw-row"><button type="button" class="hw-chip ${draft.backgroundAsi?.mode === "plus2plus1" ? "picked" : ""}" data-asi="plus2plus1">+2 and +1</button><button type="button" class="hw-chip ${draft.backgroundAsi?.mode === "plus1x3" ? "picked" : ""}" data-asi="plus1x3">+1 / +1 / +1</button></div>
        <div class="hw-row">${origin.abilityOptions.map((a) => `<button type="button" class="hw-chip" data-asi-ab="${a}">${a}</button>`).join("")}</div>`;
    } else if (id === "training") {
      const skills = c.skillList
        .map((sk) => {
          const on = draft.classSkills.includes(sk);
          return `<button type="button" class="hw-chip ${on ? "picked" : ""}" data-skill="${esc(sk)}">${esc(catalog.skills[sk]?.label ?? sk)}</button>`;
        })
        .join("");
      const styles = c.fightingStyleRequired
        ? `<p class="hw-meta">Fighting style</p><div class="hw-row">${c.fightingStyleFeatIds
            .map((fid) => `<button type="button" class="hw-chip ${draft.fightingStyleFeatId === fid ? "picked" : ""}" data-style="${esc(fid)}">${esc(catalog.feats.find((f) => f.id === fid)?.name ?? fid)}</button>`)
            .join("")}</div>`
        : "";
      const expert =
        c.id === "rogue"
          ? `<p class="hw-meta">Expertise (2)</p><div class="hw-row">${[...new Set([...(bg()?.skills ?? []), ...draft.classSkills, ...(draft.speciesSkill ? [draft.speciesSkill] : [])])]
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
      body = `<p class="hw-meta">Pick ${c.skillChoices} class skills</p><div class="hw-row">${skills}</div>${expert}${styles}${human}`;
    } else if (id === "gear") {
      body = `<p class="hw-meta">Class kit</p><div class="hw-grid">${c.equipChoices
        .map((e) => `<button type="button" class="hw-card ${draft.equipChoice === e.id ? "picked" : ""}" data-equip="${e.id}"><strong>${e.id}</strong><em>${esc(e.label)}</em></button>`)
        .join("")}</div>
        <p class="hw-meta">Origin kit</p><div class="hw-grid">${origin.equipChoices
          .map((e) => `<button type="button" class="hw-card ${draft.backgroundEquipChoice === e.id ? "picked" : ""}" data-bgequip="${e.id}"><strong>${e.id}</strong><em>${esc(e.label)}</em></button>`)
          .join("")}</div>`;
    } else if (id === "spells") {
      const pool = catalog.spells.filter((s) => s.classes.includes(draft.classId));
      const block = (title: string, level: "cantrip" | "prepared" | "known", list: typeof pool) =>
        `<p class="hw-meta">${title}</p><div class="hw-row">${list
          .map((s) => {
            const bag = level === "cantrip" ? draft.cantrips : level === "prepared" ? draft.spellsPrepared : draft.spellsKnown;
            const on = bag?.includes(s.id);
            return `<button type="button" class="hw-chip ${on ? "picked" : ""}" data-spell="${esc(s.id)}" data-bag="${level}">${esc(s.name)}</button>`;
          })
          .join("")}</div>`;
      body = `${(c.level1.cantrips ?? 0) ? block(`Cantrips (${c.level1.cantrips})`, "cantrip", pool.filter((s) => s.level === 0)) : ""}${(c.level1.preparedSpells ?? 0) ? block(`Prepared (${c.level1.preparedSpells})`, "prepared", pool.filter((s) => s.level > 0)) : ""}${(c.level1.spellsKnown ?? 0) ? block(`Known (${c.level1.spellsKnown})`, "known", pool.filter((s) => s.level > 0)) : ""}`;
    } else if (id === "details") {
      body = `<label class="hw-field">Name <input id="hwName" maxlength="32" value="${esc(draft.name ?? "")}" /></label>
        <label class="hw-field">About <textarea id="hwAbout" maxlength="240" rows="3">${esc(draft.about ?? "")}</textarea></label>
        <label class="hw-field">Languages <input id="hwLang" value="${esc((draft.languages ?? []).join(", "))}" placeholder="Common, Elvish" /></label>`;
    } else {
      body = `<p>Create this hero. Gear lands in your stash. You begin at level 1.</p>`;
    }

    host.innerHTML = `<button type="button" class="hw-scrim${sheetOpen ? " on" : ""}" id="hwScrim" aria-label="Close sheet"></button><div class="hw ${opts.layout === "phone" ? "phone" : ""}">
      <div class="hw-main">
        <div class="hw-top"><button type="button" class="hw-ghost" id="hwClose">Close</button><div><p class="hw-kicker">Step ${step + 1} of ${steps.length}</p><h2>${esc(STEP_TITLE[id])}</h2></div></div>
        <div class="hw-progress">${steps.map((s, i) => `<button type="button" class="hw-dot ${i === step ? "on" : ""} ${i < step ? "done" : ""}" data-dot="${i}" aria-label="${esc(STEP_TITLE[s])}"></button>`).join("")}</div>
        <div class="hw-body">${body}</div>
        <p class="hw-err" id="hwErr">${esc(localError)}</p>
        <div class="hw-nav">
          <button type="button" id="hwPrev" ${step === 0 ? "disabled" : ""}>Back</button>
          <button type="button" class="hw-chip hw-peek" id="hwSheetPeek">${esc(peekLabel(preview, draft, catalog))}</button>
          <button type="button" class="go" id="hwNext">${id === "review" ? "Create hero" : "Next"}</button>
        </div>
      </div>
      ${sheetHtml(preview, draft, catalog, sheetOpen)}
    </div>`;

    host.querySelector("#hwClose")!.addEventListener("click", () => opts.onClose());
    host.querySelector("#hwPrev")!.addEventListener("click", () => go(-1));
    host.querySelector("#hwNext")!.addEventListener("click", () => void go(1));
    host.querySelectorAll<HTMLButtonElement>("[data-dot]").forEach((b) => b.addEventListener("click", () => { step = Number(b.dataset.dot); localError = ""; paint(); }));
    host.querySelectorAll<HTMLButtonElement>("[data-class]").forEach((b) => b.addEventListener("click", () => { draft.classId = b.dataset.class!; draft.classSkills = []; draft.expertiseSkills = []; draft.cantrips = []; draft.spellsPrepared = []; draft.spellsKnown = []; paint(); }));
    host.querySelectorAll<HTMLButtonElement>("[data-bg]").forEach((b) =>
      b.addEventListener("click", () => {
        draft.backgroundId = b.dataset.bg!;
        const options = bg().abilityOptions;
        draft.backgroundAsi = {
          mode: "plus2plus1",
          plus2: options[0]!,
          plus1: options.find((a) => a !== options[0]) ?? options[0]!,
        };
        paint();
      }),
    );
    host.querySelectorAll<HTMLButtonElement>("[data-species]").forEach((b) => b.addEventListener("click", () => { draft.speciesId = b.dataset.species!; paint(); }));
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
        if (draft.classSkills.includes(sk)) draft.classSkills = draft.classSkills.filter((x) => x !== sk);
        else if (draft.classSkills.length < c.skillChoices) draft.classSkills = [...draft.classSkills, sk];
        const allowed = new Set([...(bg().skills ?? []), ...draft.classSkills, ...(draft.speciesSkill ? [draft.speciesSkill] : [])]);
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
          await opts.api("/api/builder/commit", { method: "POST", body: JSON.stringify(draft) });
          opts.onDone();
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
    if (target.closest("#hwScrim") || target.closest("#hwSheetClose")) {
      sheetOpen = false;
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
