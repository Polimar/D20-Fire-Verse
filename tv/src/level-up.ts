/** Level-up and gear step shared by the TV and the browser that serves the same bundle. */

export type LevelChoice = {
  kind?: string;
  subclassId?: string;
  ability?: "str" | "dex" | "con" | "int" | "wis" | "cha";
  featId?: string;
  spellId?: string;
  classId?: string;
  featureId?: string;
  picks?: string[];
};

export type LevelOptions = {
  ask: { kind: string; classId?: string; featureId?: string; options?: string[]; count?: number } | null;
  subclasses: Array<{ id: string; name: string; classId: string }> | string[];
  featureChoices?: { featureId: string; options: string[] };
};

export function levelUpHtml(heroName: string, options?: LevelOptions): string {
  const ask = options?.ask;
  const subs = (options?.subclasses ?? []).map((row) =>
    typeof row === "string" ? { id: row, name: row, classId: "" } : row,
  );
  const subOptions = subs.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("");
  const featureOpts = (ask?.kind === "feature_choice" ? ask.options : options?.featureChoices?.options) ?? [];
  const featureSelect = featureOpts.map((o) => `<option value="${esc(o)}">${esc(o.replace(/_/g, " "))}</option>`).join("");
  const hint =
    ask?.kind === "subclass"
      ? "Pick a subclass (4 options for this class)."
      : ask?.kind === "feature_choice"
        ? `Choose ${ask.featureId?.replace(/_/g, " ") ?? "a feature option"}.`
        : "Subclass at 3, an ability or a feat every four levels, a spell if you cast.";
  return `<section class="admin-block" id="levelUp">
    <h3>Level up ${esc(heroName)}</h3>
    <p class="meta">${esc(hint)}</p>
    <label class="admin-field"><span>Subclass</span>
      <select id="lvSub"><option value="">Default</option>${subOptions}</select>
    </label>
    ${
      featureOpts.length
        ? `<label class="admin-field"><span>Feature choice</span>
      <select id="lvFeature"><option value="">Default</option>${featureSelect}</select>
    </label>`
        : ""
    }
    <label class="admin-field"><span>Ability</span>
      <select id="lvAb"><option value="">Default</option><option>str</option><option>dex</option><option>con</option><option>int</option><option>wis</option><option>cha</option></select>
    </label>
    <label class="admin-field"><span>Feat id</span><input id="lvFeat" /></label>
    <label class="admin-field"><span>Spell id</span><input id="lvSpell" /></label>
    <label class="admin-field"><span>Second class id</span><input id="lvClass" /></label>
  </section>`;
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

export function readLevelChoice(root: ParentNode, options?: LevelOptions): LevelChoice {
  const value = (id: string) => root.querySelector<HTMLInputElement | HTMLSelectElement>(id)?.value.trim() ?? "";
  const ability = value("#lvAb");
  const ask = options?.ask;
  if (ask?.kind === "subclass" && value("#lvSub")) {
    return { kind: "subclass", subclassId: value("#lvSub") };
  }
  if (ask?.kind === "feature_choice") {
    const pick = value("#lvFeature") || ask.options?.[0];
    if (pick) return { kind: "feature_choice", featureId: ask.featureId, picks: [pick] };
  }
  return {
    ...(value("#lvSub") ? { subclassId: value("#lvSub") } : {}),
    ...(ability === "str" || ability === "dex" || ability === "con" || ability === "int" || ability === "wis" || ability === "cha" ? { ability } : {}),
    ...(value("#lvFeat") ? { featId: value("#lvFeat") } : {}),
    ...(value("#lvSpell") ? { spellId: value("#lvSpell") } : {}),
    ...(value("#lvClass") ? { classId: value("#lvClass") } : {}),
  };
}

export function gearStepHtml(): string {
  return `<section class="admin-block" id="gearStep">
    <h3>Gear</h3>
    <p class="meta">This hero's starter gear is personal to them. Shared stash holds loot and purchases. Preset slots are free.</p>
    <button type="button" id="gearPreset">Save preset</button>
  </section>`;
}
