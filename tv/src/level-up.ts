/** Level-up and gear step shared by the TV and the browser that serves the same bundle. */

export type LevelChoice = {
  subclassId?: string;
  ability?: "str" | "dex" | "con" | "int" | "wis" | "cha";
  featId?: string;
  spellId?: string;
  classId?: string;
};

export function levelUpHtml(heroName: string): string {
  return `<section class="admin-block" id="levelUp">
    <h3>Level up ${heroName}</h3>
    <p class="meta">Subclass at 3, an ability or a feat every four levels, a spell if you cast. Leave a field blank and the table picks the default.</p>
    <label class="admin-field"><span>Subclass id</span><input id="lvSub" /></label>
    <label class="admin-field"><span>Ability</span>
      <select id="lvAb"><option value="">Default</option><option>str</option><option>dex</option><option>con</option><option>int</option><option>wis</option><option>cha</option></select>
    </label>
    <label class="admin-field"><span>Feat id</span><input id="lvFeat" /></label>
    <label class="admin-field"><span>Spell id</span><input id="lvSpell" /></label>
    <label class="admin-field"><span>Second class id</span><input id="lvClass" /></label>
  </section>`;
}

export function readLevelChoice(root: ParentNode): LevelChoice {
  const value = (id: string) => root.querySelector<HTMLInputElement | HTMLSelectElement>(id)?.value.trim() ?? "";
  const ability = value("#lvAb");
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
    <p class="meta">The class pack starts in your stash. Equip it here or on the phone. Preset slots are free.</p>
    <button type="button" id="gearPreset">Save preset</button>
  </section>`;
}
