/** A hero's sheet as HTML: portrait, vitals, economy pips and a few tabs of detail. Shared by the TV and the phone. */

import { srdLabel } from "./index";

export type SheetAction = {
  id: string;
  name: string;
  economy: string;
  needsTarget?: boolean;
  guided?: boolean;
  available?: boolean;
};

export type PcSheet = {
  name: string;
  summary: string;
  level: number;
  className: string;
  race: string;
  background: string;
  hp: number;
  maxHp: number;
  ac: number;
  speedCells: number;
  proficiencyBonus: number;
  abilities: Record<string, { score: number; mod: number; modLabel: string }>;
  /** Remaining slots by level ("1", "2", …). */
  spellSlots?: Record<string, number> | null;
  /** Daily maximum slots by level, so spent slots stay visible. */
  spellSlotMax?: Record<string, number> | null;
  conditions?: string[];
  concentrating?: string | null;
  savingThrows: string[];
  skills: string[];
  features: string[];
  traits: string[];
  inventory: string[];
  weapons: string[];
  portrait?: string;
  economy: {
    movementLeft: number;
    hasAction: boolean;
    hasBonusAction: boolean;
    dodging: boolean;
    disengaging: boolean;
    hidden: boolean;
  };
  actions: SheetAction[];
  bonusActions: SheetAction[];
};

export const SHEET_TABS = [
  { id: "overview", label: "Sheet" },
  { id: "gear", label: "Gear" },
  { id: "features", label: "Traits" },
] as const;
export type SheetTab = (typeof SHEET_TABS)[number]["id"];

export type SheetOptions = {
  /** Light the action / bonus / movement pips as live. */
  isMyTurn: boolean;
  /** Between fights the action economy means nothing, so the phone hides it. */
  showEconomy?: boolean;
};

const pretty = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

type SlotRow = { level: string; remaining: number; max: number; used: number };

function slotRows(sheet: PcSheet): SlotRow[] {
  const maxMap = sheet.spellSlotMax ?? sheet.spellSlots ?? {};
  const leftMap = sheet.spellSlots ?? {};
  const levels = new Set([...Object.keys(maxMap), ...Object.keys(leftMap)]);
  return [...levels]
    .filter((level) => (maxMap[level] ?? leftMap[level] ?? 0) > 0)
    .sort((a, b) => Number(a) - Number(b))
    .map((level) => {
      const max = Math.max(0, maxMap[level] ?? leftMap[level] ?? 0);
      const remaining = Math.max(0, Math.min(max, leftMap[level] ?? 0));
      return { level, remaining, max, used: Math.max(0, max - remaining) };
    });
}

function slotTrackHtml(rows: SlotRow[]): string {
  if (!rows.length) return "";
  const totalLeft = rows.reduce((n, r) => n + r.remaining, 0);
  const totalMax = rows.reduce((n, r) => n + r.max, 0);
  return `<div class="spell-slots" role="group" aria-label="${totalLeft} of ${totalMax} spell slots remaining">
      <p class="spell-slots-kicker">Spell slots <strong>${totalLeft}<em>/${totalMax}</em></strong></p>
      <ul class="spell-slot-rows">
        ${rows
          .map((row) => {
            const pips = Array.from({ length: row.max }, (_, i) => {
              const filled = i < row.remaining;
              return `<i class="${filled ? "full" : "spent"}" title="${filled ? "Available" : "Spent"}"></i>`;
            }).join("");
            return `<li>
              <span class="spell-level">L${esc(row.level)}</span>
              <span class="spell-pips" aria-hidden="true">${pips}</span>
              <span class="spell-count">${row.remaining}<em>/${row.max}</em></span>
              <span class="spell-used">${row.used ? `${row.used} spent` : "full"}</span>
            </li>`;
          })
          .join("")}
      </ul>
    </div>`;
}

function tabBodyHtml(sheet: PcSheet, tab: SheetTab): string {
  switch (tab) {
    case "overview": {
      const abs = ["str", "dex", "con", "int", "wis", "cha"]
        .map((k) => {
          const a = sheet.abilities[k];
          return a ? `<div class="abil"><span>${k.toUpperCase()}</span><strong>${a.score}</strong><em>${a.modLabel}</em></div>` : "";
        })
        .join("");
      return `<div class="abil-grid">${abs}</div>
          <p class="meta">Saves ${sheet.savingThrows.map((s) => s.toUpperCase()).join(", ") || "—"}</p>
          <p class="meta">Skills ${sheet.skills.map(pretty).join(", ") || "—"}</p>
          ${sheet.concentrating ? `<p class="meta">Concentrating on ${pretty(sheet.concentrating)}</p>` : ""}
          ${sheet.conditions?.length ? `<p class="meta">${sheet.conditions.map((c) => esc(pretty(c))).join(", ")}</p>` : ""}`;
    }
    case "gear":
      return `<p class="meta">Weapons ${sheet.weapons.map(pretty).join(", ") || "—"}</p>
          <ul class="sheet-list">${sheet.inventory.map((i) => `<li>${esc(pretty(i))}</li>`).join("") || "<li class='meta'>Nothing carried</li>"}</ul>`;
    case "features":
      return `<ul class="sheet-list">${[...sheet.features, ...sheet.traits].map((f) => `<li>${esc(pretty(f))}</li>`).join("") || "<li class='meta'>None listed</li>"}</ul>`;
    default: {
      const exhaustive: never = tab;
      return exhaustive;
    }
  }
}

/** Tab buttons carry `data-sheet-tab`; the caller wires them. */
export function pcSheetHtml(sheet: PcSheet, tab: SheetTab, opts: SheetOptions): string {
  const eco = sheet.economy;
  const ratio = sheet.maxHp ? Math.max(0, Math.min(1, sheet.hp / sheet.maxHp)) : 0;
  const flags = [eco.dodging ? "Dodging" : "", eco.disengaging ? "Disengaged" : "", eco.hidden ? "Hidden" : ""].filter(Boolean);
  const economy =
    opts.showEconomy === false
      ? ""
      : `<div class="economy ${opts.isMyTurn ? "live" : ""}">
      <span class="pip ${eco.hasAction ? "on" : ""}"><i></i>Action</span>
      <span class="pip ${eco.hasBonusAction ? "on" : ""}"><i></i>Bonus</span>
      <span class="pip move ${eco.movementLeft > 0 ? "on" : ""}"><i></i>${eco.movementLeft * 5} ft</span>
      ${flags.map((f) => `<span class="flag">${f}</span>`).join("")}
    </div>`;
  return `
    <header class="sheet-head">
      ${sheet.portrait ? `<img class="sheet-portrait" src="${esc(sheet.portrait)}" alt="" />` : ""}
      <div>
        <h3>${esc(sheet.name)}</h3>
        <p class="meta">${esc([srdLabel(sheet.race), srdLabel(sheet.className), `level ${sheet.level}`].filter(Boolean).join(" · "))}</p>
      </div>
    </header>
    <div class="sheet-hp" role="img" aria-label="${sheet.hp} of ${sheet.maxHp} hit points">
      <span style="--hp:${ratio}"></span><strong>${sheet.hp}<em>/${sheet.maxHp} HP</em></strong>
    </div>
    <div class="sheet-vitals">
      <span><em>AC</em>${sheet.ac}</span>
      <span><em>Speed</em>${sheet.speedCells * 5} ft</span>
      <span><em>Prof</em>+${sheet.proficiencyBonus}</span>
    </div>
    ${economy}
    ${slotTrackHtml(slotRows(sheet))}
    <nav class="sheet-tabs">${SHEET_TABS.map((t) => `<button type="button" data-sheet-tab="${t.id}" class="${t.id === tab ? "on" : ""}">${t.label}</button>`).join("")}</nav>
    <div class="sheet-body">${tabBodyHtml(sheet, tab)}</div>`;
}

export function isSheetTab(v: unknown): v is SheetTab {
  return SHEET_TABS.some((t) => t.id === v);
}
