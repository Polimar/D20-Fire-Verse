/**
 * Shared PG Builder V2 UI (web + companion). Mobile-first; calls /api/builder/*.
 */

import type { BuilderCatalog, BuilderDraft, DerivedSheet, AbilityKey, BackgroundAsi } from "./builder.js";

const ABILITIES: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

export type ForgeAppOptions = {
  api: <T>(url: string, init?: RequestInit) => Promise<T>;
  onDone: () => void;
  backLabel?: string;
  onBack?: () => void;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function sheetHtml(sheet: DerivedSheet): string {
  const skills = sheet.skills
    .filter((s) => s.proficient)
    .map((s) => `${esc(s.label)} ${s.mod >= 0 ? "+" : ""}${s.mod}`)
    .join(" · ");
  const attacks = sheet.attacks.map((a) => `${esc(a.name)} +${a.attackBonus} (${esc(a.damage)})`).join("<br/>");
  return `
    <h2>${esc(sheet.name)}</h2>
    <p>L${sheet.level} ${esc(sheet.speciesName)} ${esc(sheet.className)} · ${esc(sheet.backgroundName)}</p>
    <p>HP ${sheet.hp} · AC ${sheet.ac} · Passive Perception ${sheet.passivePerception}</p>
    <p>${skills || "—"}</p>
    <p>${attacks}</p>
    ${sheet.errors.length ? `<p class="meta">${sheet.errors.map(esc).join(", ")}</p>` : ""}`;
}

export async function mountForgeApp(host: HTMLElement, opts: ForgeAppOptions): Promise<void> {
  const catalog = await opts.api<BuilderCatalog>("/api/builder/catalog");
  const draft: BuilderDraft = {
    classId: catalog.classes.find((c) => c.id === "fighter")?.id ?? catalog.classes[0]?.id ?? "fighter",
    speciesId: catalog.species.find((s) => s.id === "human")?.id ?? catalog.species[0]?.id ?? "human",
    backgroundId: catalog.backgrounds[0]?.id ?? "soldier",
    method: "standard_array",
    baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    classSkills: [],
    equipChoice: "A",
    backgroundAsi: { mode: "plus2plus1", plus2: "str", plus1: "con" },
    languages: [],
  };
  let preview: DerivedSheet | null = null;
  let rolled: number[] | null = null;

  const paint = () => {
    const cls = catalog.classes.find((c) => c.id === draft.classId)!;
    const bg = catalog.backgrounds.find((b) => b.id === draft.backgroundId)!;
    const isHuman = draft.speciesId === "human";
    const originFeats = catalog.feats.filter((f) => f.category === "origin");
    host.innerHTML = `
      <main class="forge-v2 forge-app">
        <header class="forge-head">
          <button type="button" class="ghost" id="forgeBack">${esc(opts.backLabel ?? "← Back")}</button>
          <h1>Forge a hero</h1>
        </header>
        <div class="forge-grid">
          <form id="forgeForm" class="forge-panel">
            <label>Name <input id="fgName" maxlength="32" required value="${esc(draft.name ?? "")}" /></label>
            <label>Class <select id="fgClass">${catalog.classes.map((c) => `<option value="${esc(c.id)}" ${c.id === draft.classId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
            <label>Species <select id="fgSpecies">${catalog.species.map((s) => `<option value="${esc(s.id)}" ${s.id === draft.speciesId ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>
            <label>Background <select id="fgBg">${catalog.backgrounds.map((b) => `<option value="${esc(b.id)}" ${b.id === draft.backgroundId ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select></label>
            <fieldset><legend>Ability scores</legend>
              <label>Method <select id="fgMethod">
                <option value="standard_array" ${draft.method === "standard_array" ? "selected" : ""}>Standard array</option>
                <option value="point_buy" ${draft.method === "point_buy" ? "selected" : ""}>Point buy (27)</option>
                <option value="roll" ${draft.method === "roll" ? "selected" : ""}>Roll (4d6 drop lowest)</option>
              </select></label>
              ${draft.method === "roll" ? `<button type="button" class="ghost" id="fgRollBtn">Roll scores</button>` : ""}
              ${ABILITIES.map((a) => {
                const opts =
                  draft.method === "point_buy"
                    ? Array.from({ length: 8 }, (_, i) => i + 8)
                        .map((n) => `<option value="${n}" ${draft.baseAbilities[a] === n ? "selected" : ""}>${n}</option>`)
                        .join("")
                    : (rolled ?? catalog.standardArray)
                        .map((n) => `<option value="${n}">${n}</option>`)
                        .join("");
                return `<label>${a.toUpperCase()} <select data-ab="${a}">${opts}</select></label>`;
              }).join("")}
            </fieldset>
            <fieldset><legend>Background ASI</legend>
              <label>Mode <select id="asiMode">
                <option value="plus2plus1" ${draft.backgroundAsi?.mode === "plus2plus1" ? "selected" : ""}>+2 and +1</option>
                <option value="plus1x3" ${draft.backgroundAsi?.mode === "plus1x3" ? "selected" : ""}>+1 / +1 / +1</option>
              </select></label>
              <div id="asiPick"></div>
            </fieldset>
            ${isHuman ? `<fieldset><legend>Human</legend>
              <label>Skill <select id="fgSpeciesSkill"><option value="">—</option>${Object.entries(catalog.skills).map(([id, s]) => `<option value="${esc(id)}">${esc(s.label)}</option>`).join("")}</select></label>
              <label>Origin feat <select id="fgOriginFeat"><option value="">—</option>${originFeats.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("")}</select></label>
            </fieldset>` : ""}
            <p class="meta">Pick ${cls.skillChoices} class skills.</p>
            <div class="skill-picks">${cls.skillList.map((id) => `<label><input type="checkbox" data-skill="${esc(id)}" /> ${esc(catalog.skills[id]?.label ?? id)}</label>`).join("")}</div>
            ${cls.fightingStyleRequired ? `<label>Fighting style <select id="fgStyle">${cls.fightingStyleFeatIds.map((id) => `<option value="${esc(id)}">${esc(catalog.feats.find((f) => f.id === id)?.name ?? id)}</option>`).join("")}</select></label>` : ""}
            ${cls.equipChoices.length ? `<label>Equipment <select id="fgEquip">${cls.equipChoices.map((e) => `<option value="${e.id}">${esc(e.label)}</option>`).join("")}</select></label>` : ""}
            <div id="spellHost"></div>
            <label>About (optional) <textarea id="fgAbout" maxlength="240" rows="2"></textarea></label>
            <label>Languages (optional, comma-separated) <input id="fgLang" placeholder="Common, Dwarvish" /></label>
            <button type="submit" class="primary">Create hero</button>
            <p class="meta" id="fgErr"></p>
          </form>
          <aside class="forge-review" aria-live="polite">${preview ? sheetHtml(preview) : "<p class='meta'>Live preview</p>"}</aside>
        </div>
      </main>`;

    const asiPick = host.querySelector<HTMLElement>("#asiPick")!;
    const paintAsi = () => {
      const mode = (host.querySelector("#asiMode") as HTMLSelectElement).value;
      if (mode === "plus1x3") {
        asiPick.innerHTML = [0, 1, 2]
          .map(
            (i) =>
              `<label>+1 #${i + 1} <select data-asi1="${i}">${bg.abilityOptions.map((a) => `<option value="${a}">${a}</option>`).join("")}</select></label>`,
          )
          .join("");
      } else {
        asiPick.innerHTML = `
          <label>+2 <select id="asi2">${bg.abilityOptions.map((a) => `<option value="${a}">${a}</option>`).join("")}</select></label>
          <label>+1 <select id="asi1">${bg.abilityOptions.map((a) => `<option value="${a}">${a}</option>`).join("")}</select></label>`;
      }
    };
    paintAsi();

    const spellHost = host.querySelector("#spellHost")!;
    const pool = catalog.spells.filter((s) => s.classes.includes(draft.classId));
    const needC = cls.level1.cantrips ?? 0;
    const needP = cls.level1.preparedSpells ?? 0;
    const needK = cls.level1.spellsKnown ?? 0;
    const bookNeed = cls.level1.spellbookSize ?? 0;
    if (needC || needP || needK) {
      spellHost.innerHTML = `
        ${needC ? `<p class="meta">Cantrips (${needC})</p>${pool.filter((s) => s.level === 0).map((s) => `<label><input type="checkbox" data-cantrip="${esc(s.id)}" /> ${esc(s.name)}</label>`).join("")}` : ""}
        ${needP ? `<p class="meta">Prepared (${needP})</p>${pool.filter((s) => s.level > 0).map((s) => `<label><input type="checkbox" data-prepared="${esc(s.id)}" /> ${esc(s.name)}</label>`).join("")}` : ""}
        ${needK ? `<p class="meta">Spells known (${needK})</p>${pool.filter((s) => s.level > 0).map((s) => `<label><input type="checkbox" data-known="${esc(s.id)}" /> ${esc(s.name)}</label>`).join("")}` : ""}
        ${bookNeed ? `<p class="meta">Spellbook must include prepared (${bookNeed} spells in book)</p>` : ""}`;
    } else spellHost.innerHTML = "";

    const sync = () => {
      draft.name = (host.querySelector("#fgName") as HTMLInputElement).value;
      draft.classId = (host.querySelector("#fgClass") as HTMLSelectElement).value;
      draft.speciesId = (host.querySelector("#fgSpecies") as HTMLSelectElement).value;
      draft.backgroundId = (host.querySelector("#fgBg") as HTMLSelectElement).value;
      draft.method = (host.querySelector("#fgMethod") as HTMLSelectElement).value as BuilderDraft["method"];
      ABILITIES.forEach((a) => {
        draft.baseAbilities[a] = Number((host.querySelector(`select[data-ab="${a}"]`) as HTMLSelectElement).value);
      });
      const mode = (host.querySelector("#asiMode") as HTMLSelectElement).value;
      if (mode === "plus1x3") {
        const picks = [0, 1, 2].map((i) => (host.querySelector(`select[data-asi1="${i}"]`) as HTMLSelectElement).value as AbilityKey);
        draft.backgroundAsi = { mode: "plus1x3", abilities: picks as [AbilityKey, AbilityKey, AbilityKey] };
      } else {
        draft.backgroundAsi = {
          mode: "plus2plus1",
          plus2: (host.querySelector("#asi2") as HTMLSelectElement).value as AbilityKey,
          plus1: (host.querySelector("#asi1") as HTMLSelectElement).value as AbilityKey,
        };
      }
      draft.classSkills = [...host.querySelectorAll<HTMLInputElement>("input[data-skill]:checked")].map((i) => i.dataset.skill!);
      draft.fightingStyleFeatId = (host.querySelector("#fgStyle") as HTMLSelectElement | null)?.value;
      draft.equipChoice = ((host.querySelector("#fgEquip") as HTMLSelectElement | null)?.value ?? "A") as "A" | "B" | "C";
      draft.speciesSkill = (host.querySelector("#fgSpeciesSkill") as HTMLSelectElement | null)?.value || undefined;
      draft.originFeatId = (host.querySelector("#fgOriginFeat") as HTMLSelectElement | null)?.value || undefined;
      draft.cantrips = [...host.querySelectorAll<HTMLInputElement>("input[data-cantrip]:checked")].map((i) => i.dataset.cantrip!);
      draft.spellsPrepared = [...host.querySelectorAll<HTMLInputElement>("input[data-prepared]:checked")].map((i) => i.dataset.prepared!);
      draft.spellsKnown = [...host.querySelectorAll<HTMLInputElement>("input[data-known]:checked")].map((i) => i.dataset.known!);
      draft.about = (host.querySelector("#fgAbout") as HTMLTextAreaElement).value.trim() || undefined;
      draft.languages = (host.querySelector("#fgLang") as HTMLInputElement).value.split(",").map((s) => s.trim()).filter(Boolean);
      if (bookNeed) {
        draft.spellbook = [...new Set([...(draft.spellsPrepared ?? []), ...(draft.spellsKnown ?? []), ...(draft.cantrips ?? [])])];
        while ((draft.spellbook?.length ?? 0) < bookNeed) {
          const next = pool.find((s) => s.level === 1 && !draft.spellbook!.includes(s.id));
          if (!next) break;
          draft.spellbook!.push(next.id);
        }
      }
      void opts.api<{ sheet: DerivedSheet }>("/api/builder/preview", { method: "POST", body: JSON.stringify(draft) }).then(
        (data) => {
          preview = data.sheet;
          const aside = host.querySelector(".forge-review");
          if (aside) aside.innerHTML = sheetHtml(preview);
        },
        () => undefined,
      );
    };

    host.querySelector("#forgeBack")!.addEventListener("click", () => (opts.onBack ? opts.onBack() : opts.onDone()));
    host.querySelector("#fgMethod")!.addEventListener("change", () => paint());
    host.querySelector("#fgClass")!.addEventListener("change", () => paint());
    host.querySelector("#fgBg")!.addEventListener("change", () => paint());
    host.querySelector("#fgSpecies")!.addEventListener("change", () => paint());
    host.querySelector("#asiMode")!.addEventListener("change", () => paintAsi());
    host.querySelector("#fgRollBtn")?.addEventListener("click", async () => {
      const body = await opts.api<{ scores: number[] }>("/api/builder/roll", { method: "POST", body: "{}" });
      rolled = body.scores;
      ABILITIES.forEach((a, i) => {
        draft.baseAbilities[a] = body.scores[i]!;
      });
      paint();
    });
    host.querySelector("#forgeForm")!.addEventListener("input", sync);
    host.querySelector("#forgeForm")!.addEventListener("change", sync);
    host.querySelector("#forgeForm")!.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      sync();
      try {
        await opts.api("/api/builder/commit", { method: "POST", body: JSON.stringify(draft) });
        opts.onDone();
      } catch (e) {
        const note = host.querySelector("#fgErr");
        if (note) note.textContent = e instanceof Error ? e.message : "Could not create.";
      }
    });
    sync();
  };

  paint();
}
