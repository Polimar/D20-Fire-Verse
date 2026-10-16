/** Class / Species master-detail panels for the forge wizard. */
import type { BuilderCatalog, BuilderCatalogClass, BuilderDraft } from "./builder.js";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function compactStrip(preview: { level: number; proficiencyBonus: number; hp: number } | null): string {
  if (!preview) {
    return `<div class="hw-strip"><span>Level 1</span><span>Prof —</span><span>HP —</span></div>`;
  }
  return `<div class="hw-strip"><span>Level ${preview.level}</span><span>Prof +${preview.proficiencyBonus}</span><span>HP ${preview.hp}</span></div>`;
}

export function classDetailHtml(
  row: BuilderCatalogClass,
  draft: BuilderDraft,
  catalog: BuilderCatalog,
  committed: boolean,
): string {
  const saves = row.saves.map((s) => s.toUpperCase()).join(" · ");
  const early = row.levels.filter((l) => l.level <= 3);
  const late = row.levels.filter((l) => l.level >= 4);
  const weapons = catalog.masteryWeaponsByClass[row.id] ?? [];
  const needMastery = row.weaponMastery && row.weaponMasteryCountL1 > 0;
  const picks = draft.weaponMasteryWeaponIds ?? [];

  const pendingParts: string[] = [];
  if (needMastery) {
    pendingParts.push(`<div class="hw-pending">
      <p class="hw-pending-title">Weapon Mastery (${picks.length}/${row.weaponMasteryCountL1})</p>
      <p class="hw-meta">${row.weaponMasteryMeleeOnly ? "Simple or martial melee only. " : ""}Each pick must use a different mastery property.</p>
      <div class="hw-row hw-mastery-row">${weapons
        .map((w) => {
          const on = picks.includes(w.id);
          return `<button type="button" class="hw-chip ${on ? "picked" : ""}" data-mastery-w="${esc(w.id)}">${esc(w.name)} <em>${esc(w.masteryName)}</em></button>`;
        })
        .join("")}</div>
      <button type="button" class="hw-ghost hw-phone-only" id="hwOpenMastery">Choose masteries…</button>
    </div>`);
  }
  if (row.fightingStyleRequired) {
    pendingParts.push(`<div class="hw-pending">
      <p class="hw-pending-title">Fighting Style</p>
      <div class="hw-row">${row.fightingStyleFeatIds
        .map((fid) => {
          const name = catalog.feats.find((f) => f.id === fid)?.name ?? fid;
          return `<button type="button" class="hw-chip ${draft.fightingStyleFeatId === fid ? "picked" : ""}" data-style="${esc(fid)}">${esc(name)}</button>`;
        })
        .join("")}</div>
    </div>`);
  }

  const earlyHtml = early
    .map((lvl) => {
      const feats = lvl.features
        .map((name) => {
          const blurb = row.featureBlurbs[name];
          return `<details class="hw-feat" ${lvl.level === 1 ? "open" : ""}>
            <summary><span class="hw-lvl">${lvl.level}</span> ${esc(name)}</summary>
            ${blurb ? `<div class="hw-feat-body">${esc(blurb)}</div>` : `<p class="hw-meta">No summary yet.</p>`}
          </details>`;
        })
        .join("");
      return `<div class="hw-level-block"><p class="hw-meta">Level ${lvl.level}</p><div class="hw-row">${lvl.features.map((f) => `<span class="hw-pill">${esc(f)}</span>`).join("")}</div>${feats}</div>`;
    })
    .join("");

  const lateHtml = late
    .map(
      (lvl) =>
        `<details class="hw-level-min"><summary>Level ${lvl.level}</summary><div class="hw-row">${lvl.features.map((f) => `<span class="hw-pill">${esc(f)}</span>`).join("")}</div></details>`,
    )
    .join("");

  return `<div class="hw-detail">
    <div class="hw-detail-head">
      <h3>${esc(row.name)}</h3>
      ${committed ? `<span class="hw-badge">Selected</span>` : `<span class="hw-badge dim">Preview — OK to select</span>`}
    </div>
    <p class="hw-meta">Hit Die d${row.hitDie} · Saves ${esc(saves)} · ${esc(row.caster === "none" ? "Martial" : "Caster")}</p>
    ${pendingParts.join("")}
    <p class="hw-section">Features (levels 1–3)</p>
    ${earlyHtml}
    <p class="hw-section">Levels 4–20</p>
    ${lateHtml}
    <p class="hw-attr">Feature text from SRD 5.2.1 (CC-BY).</p>
  </div>`;
}

export function speciesDetailHtml(
  row: BuilderCatalog["species"][number],
  committed: boolean,
): string {
  const details: Array<{ name: string; summary: string; unlockLevel?: number }> = row.traitDetails?.length
    ? row.traitDetails
    : row.traits.map((name) => ({ name, summary: name }));
  return `<div class="hw-detail">
    <div class="hw-detail-head">
      <h3>${esc(row.name)}</h3>
      ${committed ? `<span class="hw-badge">Selected</span>` : `<span class="hw-badge dim">Preview — OK to select</span>`}
    </div>
    <p class="hw-meta">${row.speedFt} ft. · ${esc(row.size)} size</p>
    ${details
      .map(
        (t) => `<details class="hw-feat" open>
          <summary>${esc(t.name)}${t.unlockLevel ? ` <span class="hw-badge dim">Level ${t.unlockLevel}</span>` : ""}</summary>
          <div class="hw-feat-body">${esc(t.summary)}</div>
        </details>`,
      )
      .join("")}
  </div>`;
}
