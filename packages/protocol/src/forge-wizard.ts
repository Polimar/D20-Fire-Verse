/**
 * Guided hero forge (Roll20-style steps). Shared by the TV modal and the phone.
 * The server remains authoritative: every change posts /api/builder/preview.
 */

import type { AbilityKey, BuilderCatalog, BuilderDraft, DerivedSheet } from "./builder.js";

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

function injectCss(): void {
  if (document.getElementById("forge-wizard-css")) return;
  const style = document.createElement("style");
  style.id = "forge-wizard-css";
  style.textContent = `
    .hw { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(16rem, 0.7fr); gap: 1rem; min-height: 70vh; color: var(--ink, #f6ead6); font-family: var(--font-body, Georgia, serif); }
    .hw.phone { grid-template-columns: 1fr; min-height: 100%; }
    .hw-main { display: flex; flex-direction: column; gap: 0.8rem; min-width: 0; }
    .hw-top { display: flex; align-items: center; gap: 0.6rem; }
    .hw-top h2 { font-family: var(--font-display, Cinzel, serif); margin: 0; font-size: 1.35rem; letter-spacing: 0.04em; }
    .hw-progress { display: flex; gap: 0.35rem; flex-wrap: wrap; }
    .hw-dot { width: 0.7rem; height: 0.7rem; border-radius: 99px; border: 1px solid rgba(240,160,90,0.45); background: transparent; padding: 0; }
    .hw-dot.on { background: #f0a05a; box-shadow: 0 0 10px rgba(255,140,60,0.7); }
    .hw-dot.done { background: rgba(241,196,107,0.45); }
    .hw-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr)); gap: 0.65rem; }
    .hw.phone .hw-grid { grid-template-columns: 1fr 1fr; }
    .hw-card, .hw-chip, .hw-nav button, .hw-ghost {
      appearance: none; border: 1px solid rgba(246,234,214,0.16); background: rgba(16,11,8,0.72);
      color: inherit; border-radius: 12px; cursor: pointer; text-align: left;
    }
    .hw-card { padding: 0.85rem 0.9rem; min-height: 5.2rem; display: grid; gap: 0.25rem; }
    .hw-card strong { font-family: var(--font-display, Cinzel, serif); font-size: 1rem; }
    .hw-card em, .hw-meta { font-style: normal; color: #cdbb9e; font-size: 0.82rem; }
    .hw-card.picked, .hw-chip.picked { border-color: #f0a05a; box-shadow: 0 0 0 2px rgba(255,160,70,0.35), 0 0 22px rgba(255,120,40,0.25); }
    .hw-card:focus-visible, .hw-chip:focus-visible, .hw-nav button:focus-visible, .hw-ghost:focus-visible {
      outline: 3px solid #ffd08a; outline-offset: 2px;
    }
    .hw-crest { width: 2.2rem; height: 2.2rem; border-radius: 50%; display: grid; place-items: center;
      font-family: var(--font-display, Cinzel, serif); background: radial-gradient(circle at 40% 35%, #c8662c, #1c130e 70%); }
    .hw-chip { padding: 0.55rem 0.7rem; min-height: 2.75rem; }
    .hw-row { display: flex; flex-wrap: wrap; gap: 0.45rem; }
    .hw-score { display: grid; grid-template-columns: 3rem 1fr auto; gap: 0.4rem; align-items: center; margin-bottom: 0.35rem; }
    .hw-nav { display: flex; gap: 0.5rem; margin-top: auto; }
    .hw-nav button, .hw-ghost { padding: 0.7rem 1rem; min-height: 2.75rem; }
    .hw-nav .go { background: linear-gradient(180deg, #e07a32, #9a3e16); border-color: transparent; font-family: var(--font-display, Cinzel, serif); }
    .hw-sheet { background: rgba(16,11,8,0.78); border: 1px solid rgba(246,234,214,0.13); border-radius: 14px; padding: 0.9rem 1rem; }
    .hw-sheet h3 { font-family: var(--font-display, Cinzel, serif); margin: 0 0 0.4rem; }
    .hw-err { color: #e6735f; min-height: 1.2rem; }
    .hw.phone .hw-sheet { position: static; }
    .hw.phone .hw-nav { position: sticky; bottom: 0; background: #120c09; padding-top: 0.4rem; }
    .hw-field { display: grid; gap: 0.25rem; margin-bottom: 0.6rem; }
    .hw-field input, .hw-field textarea {
      background: #120c09; color: inherit; border: 1px solid rgba(246,234,214,0.2); border-radius: 10px; padding: 0.65rem; font: inherit;
    }
  `;
  document.head.appendChild(style);
}

function sheetHtml(sheet: DerivedSheet | null): string {
  if (!sheet) return `<aside class="hw-sheet"><h3>Sheet</h3><p class="hw-meta">Choices update this panel.</p></aside>`;
  const abs = ABILITIES.map((a) => `${a.toUpperCase()} ${sheet.abilities[a].score}`).join(" · ");
  const skills = sheet.skills.filter((s) => s.proficient).map((s) => s.label).join(", ") || "—";
  return `<aside class="hw-sheet" aria-live="polite">
    <h3>${esc(sheet.name || "Unnamed")}</h3>
    <p>L${sheet.level} ${esc(sheet.speciesName)} ${esc(sheet.className)}</p>
    <p>${esc(sheet.backgroundName)}</p>
    <p>HP ${sheet.hp} · AC ${sheet.ac} · PP ${sheet.passivePerception}</p>
    <p class="hw-meta">${esc(abs)}</p>
    <p class="hw-meta">${esc(skills)}</p>
    ${sheet.errors.length ? `<p class="hw-err">${sheet.errors.map(esc).join(", ")}</p>` : ""}
  </aside>`;
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
        if (aside) aside.outerHTML = sheetHtml(preview);
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
            `<button type="button" class="hw-card ${row.id === draft.classId ? "picked" : ""}" data-class="${esc(row.id)}"><span class="hw-crest">${esc(row.name.slice(0, 1))}</span><strong>${esc(row.name)}</strong><em>${esc(row.caster === "none" ? "Martial" : row.caster)}</em></button>`,
        )
        .join("")}</div>`;
    } else if (id === "origin") {
      body = `<div class="hw-grid">${catalog.backgrounds
        .map(
          (row) =>
            `<button type="button" class="hw-card ${row.id === draft.backgroundId ? "picked" : ""}" data-bg="${esc(row.id)}"><span class="hw-crest">${esc(row.name.slice(0, 1))}</span><strong>${esc(row.name)}</strong><em>${row.skills.map((s) => catalog.skills[s]?.label ?? s).join(", ")}</em></button>`,
        )
        .join("")}</div>`;
    } else if (id === "species") {
      body = `<div class="hw-grid">${catalog.species
        .map(
          (row) =>
            `<button type="button" class="hw-card ${row.id === draft.speciesId ? "picked" : ""}" data-species="${esc(row.id)}"><span class="hw-crest">${esc(row.name.slice(0, 1))}</span><strong>${esc(row.name)}</strong><em>${esc(row.traits.slice(0, 2).join(" · ") || "SRD species")}</em></button>`,
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
      body = `<p class="hw-meta">Pick ${c.skillChoices} class skills</p><div class="hw-row">${skills}</div>${styles}${human}`;
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

    host.innerHTML = `<div class="hw ${opts.layout === "phone" ? "phone" : ""}">
      <div class="hw-main">
        <div class="hw-top"><button type="button" class="hw-ghost" id="hwClose">Close</button><h2>${esc(STEP_TITLE[id])}</h2></div>
        <div class="hw-progress">${steps.map((s, i) => `<button type="button" class="hw-dot ${i === step ? "on" : ""} ${i < step ? "done" : ""}" data-dot="${i}" aria-label="${esc(STEP_TITLE[s])}"></button>`).join("")}</div>
        <div class="hw-body">${body}</div>
        <p class="hw-err" id="hwErr">${esc(localError)}</p>
        <div class="hw-nav">
          <button type="button" id="hwPrev" ${step === 0 ? "disabled" : ""}>Back</button>
          <button type="button" class="go" id="hwNext">${id === "review" ? "Create hero" : "Next"}</button>
        </div>
      </div>
      ${sheetHtml(preview)}
    </div>`;

    host.querySelector("#hwClose")!.addEventListener("click", () => opts.onClose());
    host.querySelector("#hwPrev")!.addEventListener("click", () => go(-1));
    host.querySelector("#hwNext")!.addEventListener("click", () => void go(1));
    host.querySelectorAll<HTMLButtonElement>("[data-dot]").forEach((b) => b.addEventListener("click", () => { step = Number(b.dataset.dot); localError = ""; paint(); }));
    host.querySelectorAll<HTMLButtonElement>("[data-class]").forEach((b) => b.addEventListener("click", () => { draft.classId = b.dataset.class!; draft.classSkills = []; draft.cantrips = []; draft.spellsPrepared = []; draft.spellsKnown = []; paint(); }));
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
    const first = host.querySelector<HTMLButtonElement>(".hw-card, .hw-chip, #hwNext");
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
