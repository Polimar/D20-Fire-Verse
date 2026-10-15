/**
 * PG Builder V2 (web / Fire TV). D-pad: focusable controls only; review panel updates on preview.
 */

import type { BuilderCatalog, BuilderDraft, DerivedSheet, AbilityKey } from "@d20-fireverse/protocol/builder";
import "./styles.css";

const ABILITIES: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function sheetHtml(sheet: DerivedSheet): string {
  const skills = sheet.skills
    .filter((s) => s.proficient)
    .slice(0, 12)
    .map((s) => `${esc(s.label)} ${s.mod >= 0 ? "+" : ""}${s.mod}`)
    .join(" · ");
  const attacks = sheet.attacks.map((a) => `${esc(a.name)} +${a.attackBonus} (${esc(a.damage)})`).join("<br/>");
  return `
    <h2>${esc(sheet.name)}</h2>
    <p>L${sheet.level} ${esc(sheet.speciesName)} ${esc(sheet.className)} · ${esc(sheet.backgroundName)}</p>
    <p>HP ${sheet.hp} · AC ${sheet.ac} · Passive Perception ${sheet.passivePerception}</p>
    <p>${skills || "No skills yet"}</p>
    <p>${attacks}</p>
    ${sheet.errors.length ? `<p class="meta">${sheet.errors.map(esc).join(", ")}</p>` : ""}`;
}

function mount(): void {
  const root = document.querySelector<HTMLElement>("#forge-app");
  if (!root) return;

  let catalog: BuilderCatalog | null = null;
  const draft: BuilderDraft = {
    classId: "fighter",
    speciesId: "human",
    backgroundId: "soldier",
    method: "standard_array",
    baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    classSkills: [],
    equipChoice: "A",
    backgroundAsi: { mode: "plus2plus1", plus2: "str", plus1: "con" },
  };
  let preview: DerivedSheet | null = null;

  const paint = () => {
    if (!catalog) {
      root.innerHTML = `<p class="meta">Loading catalog…</p>`;
      return;
    }
    const cat = catalog!;
    const cls = cat.classes.find((c) => c.id === draft.classId)!;
    const bg = cat.backgrounds.find((b) => b.id === draft.backgroundId)!;
    root.innerHTML = `
      <main class="forge-v2" tabindex="0">
        <header><h1>Forge a hero</h1><a href="/" class="ghost">← Home</a></header>
        <div class="forge-grid">
          <form id="forgeForm" class="forge-panel">
            <label>Name <input id="fgName" maxlength="32" required /></label>
            <label>Class
              <select id="fgClass">${cat.classes.map((c) => `<option value="${esc(c.id)}" ${c.id === draft.classId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
            </label>
            <label>Species
              <select id="fgSpecies">${cat.species.map((s) => `<option value="${esc(s.id)}" ${s.id === draft.speciesId ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
            </label>
            <label>Background
              <select id="fgBg">${cat.backgrounds.map((b) => `<option value="${esc(b.id)}" ${b.id === draft.backgroundId ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select>
            </label>
            <fieldset><legend>Ability scores (standard array)</legend>
              ${ABILITIES.map((a) => `<label>${a.toUpperCase()} <select data-ab="${a}">${cat.standardArray.map((n) => `<option value="${n}" ${draft.baseAbilities[a] === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>`).join("")}
            </fieldset>
            <fieldset><legend>Background ASI (+2 / +1)</legend>
              <label>+2 <select id="asi2">${bg.abilityOptions.map((a) => `<option value="${a}">${a}</option>`).join("")}</select></label>
              <label>+1 <select id="asi1">${bg.abilityOptions.map((a) => `<option value="${a}">${a}</option>`).join("")}</select></label>
            </fieldset>
            <p class="meta">Pick ${cls.skillChoices} class skills.</p>
            <div class="skill-picks">${cls.skillList.map((id) => `<label><input type="checkbox" data-skill="${esc(id)}" /> ${esc(cat.skills[id]?.label ?? id)}</label>`).join("")}</div>
            ${
              cls.fightingStyleRequired
                ? `<label>Fighting style <select id="fgStyle">${cls.fightingStyleFeatIds.map((id) => `<option value="${esc(id)}">${esc(cat.feats.find((f) => f.id === id)?.name ?? id)}</option>`).join("")}</select></label>`
                : ""
            }
            ${
              cls.equipChoices.length > 1
                ? `<label>Equipment <select id="fgEquip">${cls.equipChoices.map((e) => `<option value="${e.id}">${esc(e.label)}</option>`).join("")}</select></label>`
                : ""
            }
            <div id="spellHost"></div>
            <button type="submit" class="primary">Create hero</button>
            <p class="meta" id="fgErr"></p>
          </form>
          <aside class="forge-review" aria-live="polite">${preview ? sheetHtml(preview) : "<p class='meta'>Adjust choices to preview.</p>"}</aside>
        </div>
      </main>`;

    const runPreview = () => {
      void api<{ sheet: DerivedSheet }>("/api/builder/preview", { method: "POST", body: JSON.stringify(draft) }).then(
        (data) => {
          preview = data.sheet;
          const aside = root.querySelector(".forge-review");
          if (aside) aside.innerHTML = sheetHtml(preview);
        },
        () => undefined,
      );
    };

    const spellHost = root.querySelector("#spellHost")!;
    const paintSpells = () => {
      const needC = cls.level1.cantrips ?? 0;
      const needP = cls.level1.preparedSpells ?? 0;
      const needK = cls.level1.spellsKnown ?? 0;
      const pool = cat.spells.filter((s) => s.classes.includes(draft.classId));
      if (!needC && !needP && !needK) {
        spellHost.innerHTML = "";
        return;
      }
      spellHost.innerHTML = `
        ${needC ? `<p class="meta">Cantrips (${needC})</p>${pool.filter((s) => s.level === 0).map((s) => `<label><input type="checkbox" data-cantrip="${esc(s.id)}" /> ${esc(s.name)}</label>`).join("")}` : ""}
        ${needP ? `<p class="meta">Prepared (${needP})</p>${pool.filter((s) => s.level > 0).map((s) => `<label><input type="checkbox" data-prepared="${esc(s.id)}" /> ${esc(s.name)}</label>`).join("")}` : ""}`;
    };
    paintSpells();

    const sync = () => {
      draft.name = (root.querySelector("#fgName") as HTMLInputElement).value;
      draft.classId = (root.querySelector("#fgClass") as HTMLSelectElement).value;
      draft.speciesId = (root.querySelector("#fgSpecies") as HTMLSelectElement).value;
      draft.backgroundId = (root.querySelector("#fgBg") as HTMLSelectElement).value;
      ABILITIES.forEach((a) => {
        draft.baseAbilities[a] = Number((root.querySelector(`select[data-ab="${a}"]`) as HTMLSelectElement).value);
      });
      draft.backgroundAsi = {
        mode: "plus2plus1",
        plus2: (root.querySelector("#asi2") as HTMLSelectElement).value as AbilityKey,
        plus1: (root.querySelector("#asi1") as HTMLSelectElement).value as AbilityKey,
      };
      draft.classSkills = [...root.querySelectorAll<HTMLInputElement>("input[data-skill]:checked")].map((i) => i.dataset.skill!);
      draft.fightingStyleFeatId = (root.querySelector("#fgStyle") as HTMLSelectElement | null)?.value;
      draft.equipChoice = ((root.querySelector("#fgEquip") as HTMLSelectElement | null)?.value ?? "A") as "A" | "B" | "C";
      draft.cantrips = [...root.querySelectorAll<HTMLInputElement>("input[data-cantrip]:checked")].map((i) => i.dataset.cantrip!);
      draft.spellsPrepared = [...root.querySelectorAll<HTMLInputElement>("input[data-prepared]:checked")].map((i) => i.dataset.prepared!);
      if (cls.level1.spellbookSize) {
        const pool = cat.spells.filter((s) => s.classes.includes(draft.classId));
        draft.spellbook = [...new Set([...(draft.spellsPrepared ?? []), ...(draft.cantrips ?? [])])];
        while ((draft.spellbook?.length ?? 0) < cls.level1.spellbookSize) {
          const next = pool.find((s) => s.level === 1 && !draft.spellbook!.includes(s.id));
          if (!next) break;
          draft.spellbook!.push(next.id);
        }
      }
      runPreview();
    };

    root.querySelector("#forgeForm")!.addEventListener("input", sync);
    root.querySelector("#fgClass")!.addEventListener("change", () => paint());
    root.querySelector("#fgBg")!.addEventListener("change", () => paint());
    root.querySelector("#forgeForm")!.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      sync();
      const err = root.querySelector("#fgErr");
      try {
        await api("/api/builder/commit", { method: "POST", body: JSON.stringify(draft) });
        root.innerHTML = `<main class="forge-v2"><h1>Hero forged</h1><p><a href="/">Back to the table</a></p></main>`;
      } catch (e) {
        if (err) err.textContent = e instanceof Error ? e.message : "Could not create.";
      }
    });
    sync();
  };

  void api<BuilderCatalog>("/api/builder/catalog")
    .then((c) => {
      catalog = c;
      if (c.classes[0]) draft.classId = c.classes.find((x) => x.id === "fighter")?.id ?? c.classes[0].id;
      paint();
    })
    .catch(() => {
      root.innerHTML = `<p class="meta">Sign in first, then return to <a href="/forge">/forge</a>.</p><a href="/api/login/amazon/start?next=/forge/">Continue with Amazon</a>`;
    });
}

mount();
