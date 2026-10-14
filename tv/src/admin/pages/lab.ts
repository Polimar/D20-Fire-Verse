import type { Page } from "../types";
import { api, esc, toast, write } from "../ui";

type Option = { id: string; name: string; classId?: string };
type Cov = { classId: string; cap: number; runs: number; blocked: number };
type Sim = {
  hero: {
    level: number;
    maxHp: number;
    classes: Array<{ id: string; level: number; subclass?: string }>;
    abilities: Record<string, number>;
    features: string[];
    pending: unknown[];
  };
  kit: {
    rages: number;
    rageDamage: number;
    extraAttacks: number;
    secondWind: number;
    actionSurge: number;
    indomitable: number;
    sneakDice: number;
    critMin: number;
    flags: string[];
    saves: string[];
  };
  cap: number;
  subclassCap: number;
  coverage: Array<{ level: number; feature: string; status: string; note?: string; subclassId?: string }>;
};

const STATUS: Record<string, string> = {
  runs: "Runs in a fight",
  progression: "Choice / sheet",
  no_combat: "Not a combat feature",
  partial: "Partial",
  missing: "Missing",
};

export const labPage: Page = {
  id: "lab",
  label: "Rules lab",
  group: "Content",
  async render(host, ctx) {
    const opts = await api<{ classes: Option[]; subclasses: Option[]; species: Option[]; coverage: Cov[] }>("/api/admin/lab/options");
    if (!ctx.isCurrent()) return;
    host.innerHTML = `<div class="page">
      <div class="page-head"><div class="titles"><h1>Rules lab</h1><p>Walk a class from 1 to 10 against the SRD 5.2.1 table, including records you have not approved yet. Stamp a copy onto your account to fight it in the arena or the campaign.</p></div></div>
      <div class="stack">
        <div class="card">
          <header><h2>Simulate</h2></header>
          <div class="body stack">
            <div class="row">
              <label class="field"><span>Class</span><select id="labClass">${opts.classes.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select></label>
              <label class="field"><span>Subclass</span><select id="labSub"></select></label>
              <label class="field"><span>Species</span><select id="labSpecies">${opts.species.map((s) => `<option value="${esc(s.id)}" ${s.id === "human" ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>
              <label class="field"><span>Level</span><select id="labLevel">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<option value="${n}" ${n === 3 ? "selected" : ""}>${n}</option>`).join("")}</select></label>
            </div>
            <div class="row">
              <button type="button" class="primary" id="labSim">Simulate</button>
              <button type="button" id="labStamp">Stamp onto my account</button>
              <span class="faint">The stamped hero shows up under your name on the TV. Content → approve still controls who else can use the class.</span>
            </div>
            <div id="labOut" class="stack"></div>
          </div>
        </div>
        <div class="card">
          <header><h2>Playable cap</h2></header>
          <div class="body">
            <table class="table"><thead><tr><th>Class</th><th>Cap</th><th>Runs</th><th>Blocked</th></tr></thead>
            <tbody>${opts.coverage.map((c) => `<tr><td>${esc(c.classId)}</td><td>${c.cap}</td><td>${c.runs}</td><td>${c.blocked}</td></tr>`).join("")}</tbody></table>
          </div>
        </div>
      </div>
    </div>`;

    const classSel = host.querySelector<HTMLSelectElement>("#labClass")!;
    const subSel = host.querySelector<HTMLSelectElement>("#labSub")!;
    const paintSubs = () => {
      const id = classSel.value;
      const rows = opts.subclasses.filter((s) => s.classId === id);
      subSel.innerHTML = `<option value="">(none)</option>${rows.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}`;
    };
    paintSubs();
    classSel.addEventListener("change", paintSubs);

    const body = () => ({
      classId: classSel.value,
      subclassId: subSel.value || undefined,
      speciesId: host.querySelector<HTMLSelectElement>("#labSpecies")!.value,
      level: Number(host.querySelector<HTMLSelectElement>("#labLevel")!.value),
    });

    const paint = (sim: Sim) => {
      const kitBits = [
        sim.kit.rages ? `rages ${sim.kit.rages} (+${sim.kit.rageDamage})` : "",
        sim.kit.extraAttacks ? `extra attacks ${sim.kit.extraAttacks}` : "",
        sim.kit.secondWind ? `second wind ${sim.kit.secondWind}` : "",
        sim.kit.actionSurge ? `action surge ${sim.kit.actionSurge}` : "",
        sim.kit.indomitable ? `indomitable ${sim.kit.indomitable}` : "",
        sim.kit.sneakDice ? `sneak ${sim.kit.sneakDice}d6` : "",
        sim.kit.critMin < 20 ? `crit ${sim.kit.critMin}+` : "",
        `saves ${sim.kit.saves.join("/").toUpperCase()}`,
      ].filter(Boolean);
      host.querySelector("#labOut")!.innerHTML = `
        <p>Reached <b>level ${sim.hero.level}</b> · HP ${sim.hero.maxHp} · playable cap ${sim.cap}${sim.hero.classes[0]?.subclass ? ` · subclass cap ${sim.subclassCap}` : ""}${sim.hero.pending.length ? ` · ${sim.hero.pending.length} unanswered choice(s)` : ""}</p>
        <p class="faint">${esc(kitBits.join(" · "))}</p>
        <p class="faint">${esc(sim.hero.features.join(", "))}</p>
        <table class="table"><thead><tr><th>Lv</th><th>Feature</th><th>Status</th><th>Note</th></tr></thead>
        <tbody>${sim.coverage
          .map(
            (r) =>
              `<tr><td>${r.level}</td><td>${esc(r.feature)}${r.subclassId ? ` <span class="faint">${esc(r.subclassId)}</span>` : ""}</td><td>${esc(STATUS[r.status] ?? r.status)}</td><td class="faint">${esc(r.note ?? "")}</td></tr>`,
          )
          .join("")}</tbody></table>`;
    };

    host.querySelector("#labSim")!.addEventListener("click", async (ev) => {
      const sim = await write(ev.currentTarget as HTMLButtonElement, "Simulated", () => api<Sim>("/api/admin/lab/simulate", { body: body() }));
      if (sim) paint(sim);
    });
    host.querySelector("#labStamp")!.addEventListener("click", async (ev) => {
      const out = await write(ev.currentTarget as HTMLButtonElement, "Hero stamped onto your account", () =>
        api<{ hero: { id: string; name: string; level: number } }>("/api/admin/lab/stamp", { body: body() }),
      );
      if (out) toast("ok", `${out.hero.name} is on your account at level ${out.hero.level}. Open the game to seat it.`);
    });
  },
};
