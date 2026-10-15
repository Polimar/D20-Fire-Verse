import type { Page } from "../types";
import { api, confirmDialog, esc, field, write } from "../ui";

type EconomyConfig = {
  gold: Record<string, { win: number; loss: number; placementMultipliers?: number[] }>;
  xp: {
    ranked: { winBase: number; winFlat: number; winLevelCoeff: number; lossBase: number; lossOppCoeff: number };
    arcade: { win: number; loss: number; dailyCap: number };
  };
  drops: {
    ranked: { win: number; loss: number; overTier: number; keepOverTierUnequippable: boolean };
    arcade: { win: number; loss: number };
    pve: { win: number; loss: number };
  };
  rarityUnlock: Record<string, number>;
  vendor: { priceByRarity: Record<string, number>; autoMin: number; autoMax: number; maxSlots: number };
  elo: {
    k: number;
    disconnectMs: number;
    seasonDays: number;
    seasonResetOldWeight: number;
    seasonResetAnchor: number;
  };
  matchmaking: {
    baseElo: number;
    stepElo: number;
    maxElo: number;
    baseLevel: number;
    stepLevel: number;
    maxLevel: number;
    stepMs: number;
  };
  milestones: Array<{ kind: string; count: number; gold: number; cosmetic?: string }>;
};

type EconomyOut = { config: EconomyConfig; defaults: EconomyConfig; updatedAt: string | null; updatedBy: string | null };

type Preview = { mode: string; xp: number; gold: number; dropChance: number; highestRarity: string };

function num(el: HTMLInputElement): number {
  return Number(el.value);
}

function pctInput(id: string, value: number): string {
  return `<input id="${id}" type="number" min="0" max="100" step="0.1" value="${Math.round(value * 1000) / 10}" />`;
}

export const balancePage: Page = {
  id: "balance",
  label: "Balance",
  group: "Economy",
  async render(host, ctx) {
    const data = await api<EconomyOut>("/api/admin/economy");
    if (!ctx.isCurrent()) return;
    const c = data.config;
    const d = data.defaults;
    const hint = (path: string, value: unknown) => `default ${value}`;
    const goldMode = (mode: "ranked" | "arcade" | "pve" | "test") => {
      const win = field(`${mode} win gold`, `<input id="g-${mode}-win" type="number" min="0" step="1" value="${c.gold[mode].win}" />`, {
        hint: hint("", d.gold[mode].win),
      });
      const loss = field(`${mode} loss gold`, `<input id="g-${mode}-loss" type="number" min="0" step="1" value="${c.gold[mode].loss}" />`, {
        hint: hint("", d.gold[mode].loss),
      });
      return `<div class="grid-2">${win}${loss}</div>`;
    };

    host.innerHTML = `<div class="page">
      <div class="page-head"><div class="titles"><h1>Balance</h1><p>Live knobs for gold, XP, drops, rarity gates, Elo, and milestones. New matches pick up a save immediately. ${
        data.updatedAt ? `Last saved ${esc(new Date(data.updatedAt).toLocaleString())} by ${esc(data.updatedBy ?? "admin")}.` : "Using built-in defaults."
      }</p></div>
        <div class="row"><button type="button" class="primary" id="ecoSave">Save</button><button type="button" class="ghost" id="ecoReset">Reset to defaults</button></div>
      </div>
      <div class="stack">
        <div class="card"><header><h2>Gold per match</h2></header><div class="body stack">${goldMode("ranked")}${goldMode("arcade")}${goldMode("pve")}${goldMode("test")}
          ${field("Ranked FFA placement multipliers (1st, 2nd, 3rd, 4th — leave blank to use win/loss)", `<input id="g-ranked-mul" value="${(c.gold.ranked.placementMultipliers ?? []).join(", ")}" placeholder="e.g. 1, 0.6, 0.3, 0" />`)}
        </div></div>
        <div class="card"><header><h2>XP per match</h2></header><div class="body stack">
          <div class="grid-2">${field("Ranked win base", `<input id="xp-winBase" type="number" step="1" value="${c.xp.ranked.winBase}" />`, { hint: String(d.xp.ranked.winBase) })}
            ${field("Ranked win flat", `<input id="xp-winFlat" type="number" step="1" value="${c.xp.ranked.winFlat}" />`, { hint: String(d.xp.ranked.winFlat) })}
            ${field("Ranked win × Δlevel", `<input id="xp-winLevel" type="number" step="1" value="${c.xp.ranked.winLevelCoeff}" />`, { hint: String(d.xp.ranked.winLevelCoeff) })}
            ${field("Ranked loss base", `<input id="xp-lossBase" type="number" step="1" value="${c.xp.ranked.lossBase}" />`, { hint: String(d.xp.ranked.lossBase) })}
            ${field("Ranked loss × opponent level", `<input id="xp-lossOpp" type="number" step="1" value="${c.xp.ranked.lossOppCoeff}" />`, { hint: String(d.xp.ranked.lossOppCoeff) })}
            ${field("Arcade win XP", `<input id="xp-arcWin" type="number" min="0" step="1" value="${c.xp.arcade.win}" />`)}
            ${field("Arcade loss XP", `<input id="xp-arcLoss" type="number" min="0" step="1" value="${c.xp.arcade.loss}" />`)}
            ${field("Arcade daily cap (matches)", `<input id="xp-arcCap" type="number" min="0" step="1" value="${c.xp.arcade.dailyCap}" />`)}
          </div>
        </div></div>
        <div class="card"><header><h2>Drop rates (%)</h2></header><div class="body stack">
          <div class="grid-2">${field("Ranked win", pctInput("dr-ranked-win", c.drops.ranked.win))}
            ${field("Ranked loss", pctInput("dr-ranked-loss", c.drops.ranked.loss))}
            ${field("Ranked over-tier", pctInput("dr-ranked-over", c.drops.ranked.overTier))}
            ${field("Arcade win", pctInput("dr-arcade-win", c.drops.arcade.win))}
            ${field("Arcade loss", pctInput("dr-arcade-loss", c.drops.arcade.loss))}
            ${field("PvE win", pctInput("dr-pve-win", c.drops.pve.win))}
            ${field("PvE loss", pctInput("dr-pve-loss", c.drops.pve.loss))}
          </div>
          <label class="field"><span><input id="dr-keep" type="checkbox" ${c.drops.ranked.keepOverTierUnequippable ? "checked" : ""} /> Over-tier drops stay unequippable until the hero's level matches</span></label>
        </div></div>
        <div class="card"><header><h2>Rarity gates (hero level)</h2></header><div class="body">
          <div class="grid-2">${(["common", "uncommon", "rare", "very_rare", "legendary"] as const)
            .map((r) => field(r.replace("_", " "), `<input id="ru-${r}" type="number" min="1" step="1" value="${c.rarityUnlock[r]}" />`, { hint: `default ${d.rarityUnlock[r]}` }))
            .join("")}</div>
        </div></div>
        <div class="card"><header><h2>Vendor</h2></header><div class="body">
          <div class="grid-2">${(["common", "uncommon", "rare", "very_rare", "legendary"] as const)
            .map((r) => field(`${r.replace("_", " ")} default gp`, `<input id="vp-${r}" type="number" min="0" step="1" value="${c.vendor.priceByRarity[r]}" />`))
            .join("")}
            ${field("Auto stock min", `<input id="v-min" type="number" min="0" step="1" value="${c.vendor.autoMin}" />`)}
            ${field("Auto stock max", `<input id="v-max" type="number" min="0" step="1" value="${c.vendor.autoMax}" />`)}
            ${field("Max scheduled slots", `<input id="v-slots" type="number" min="1" step="1" value="${c.vendor.maxSlots}" />`)}
          </div>
        </div></div>
        <div class="card"><header><h2>Elo and seasons</h2></header><div class="body">
          <div class="grid-2">${field("K factor", `<input id="elo-k" type="number" min="1" step="1" value="${c.elo.k}" />`)}
            ${field("Forfeit after (ms)", `<input id="elo-dc" type="number" min="0" step="1000" value="${c.elo.disconnectMs}" />`)}
            ${field("Season days", `<input id="elo-days" type="number" min="1" step="1" value="${c.elo.seasonDays}" />`)}
            ${field("Soft-reset old weight (0–1)", `<input id="elo-old" type="number" min="0" max="1" step="0.05" value="${c.elo.seasonResetOldWeight}" />`)}
            ${field("Soft-reset anchor", `<input id="elo-anchor" type="number" min="0" step="1" value="${c.elo.seasonResetAnchor}" />`)}
          </div>
        </div></div>
        <div class="card"><header><h2>Matchmaking windows</h2></header><div class="body">
          <div class="grid-2">${field("Base Elo window", `<input id="mm-baseElo" type="number" min="0" step="1" value="${c.matchmaking.baseElo}" />`)}
            ${field("Elo step", `<input id="mm-stepElo" type="number" min="0" step="1" value="${c.matchmaking.stepElo}" />`)}
            ${field("Max Elo window", `<input id="mm-maxElo" type="number" min="0" step="1" value="${c.matchmaking.maxElo}" />`)}
            ${field("Base level window", `<input id="mm-baseLevel" type="number" min="0" step="1" value="${c.matchmaking.baseLevel}" />`)}
            ${field("Level step", `<input id="mm-stepLevel" type="number" min="0" step="1" value="${c.matchmaking.stepLevel}" />`)}
            ${field("Max level window", `<input id="mm-maxLevel" type="number" min="0" step="1" value="${c.matchmaking.maxLevel}" />`)}
            ${field("Step milliseconds", `<input id="mm-stepMs" type="number" min="1" step="1000" value="${c.matchmaking.stepMs}" />`)}
          </div>
        </div></div>
        <div class="card"><header><h2>Milestones</h2></header><div class="body stack">
          <table class="data"><thead><tr><th>Kind</th><th>Count</th><th>Gold</th><th>Cosmetic</th><th></th></tr></thead>
          <tbody id="msBody">${c.milestones
            .map(
              (m, i) => `<tr>
              <td><input data-ms="kind" data-i="${i}" value="${esc(m.kind)}" /></td>
              <td><input data-ms="count" data-i="${i}" type="number" min="1" value="${m.count}" /></td>
              <td><input data-ms="gold" data-i="${i}" type="number" min="0" value="${m.gold}" /></td>
              <td><input data-ms="cosmetic" data-i="${i}" value="${esc(m.cosmetic ?? "")}" /></td>
              <td><button type="button" class="sm ghost" data-ms-del="${i}">Remove</button></td></tr>`,
            )
            .join("")}</tbody></table>
          <button type="button" class="sm" id="msAdd">Add row</button>
        </div></div>
        <div class="card"><header><h2>Preview</h2></header><div class="body stack">
          <div class="grid-2">${field("Mode", `<select id="pv-mode"><option>ranked</option><option>arcade</option><option>pve</option></select>`)}
            ${field("Won", `<select id="pv-won"><option value="1">Win</option><option value="0">Loss</option></select>`)}
            ${field("Hero level", `<input id="pv-level" type="number" min="1" value="3" />`)}
            ${field("Opponent level", `<input id="pv-opp" type="number" min="1" value="3" />`)}
            ${field("Placement (FFA)", `<input id="pv-place" type="number" min="1" placeholder="optional" />`)}
          </div>
          <button type="button" id="pvGo">Preview</button>
          <p class="faint" id="pvOut">Save first if you want the live config, then preview.</p>
        </div></div>
      </div>
    </div>`;

    const $ = <T extends HTMLElement>(id: string) => host.querySelector<T>(`#${id}`)!;

    const readMilestones = () => {
      const rows = [...host.querySelectorAll<HTMLTableRowElement>("#msBody tr")];
      return rows.map((row) => {
        const val = (name: string) => row.querySelector<HTMLInputElement>(`[data-ms="${name}"]`)!.value;
        const cosmetic = val("cosmetic").trim();
        return {
          kind: val("kind").trim(),
          count: Number(val("count")),
          gold: Number(val("gold")),
          ...(cosmetic ? { cosmetic } : {}),
        };
      });
    };

    const readPatch = (): EconomyConfig => {
      const mulRaw = $<HTMLInputElement>("g-ranked-mul").value.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
      const pct = (id: string) => num($<HTMLInputElement>(id)) / 100;
      const goldOf = (mode: "ranked" | "arcade" | "pve" | "test") => ({
        win: num($<HTMLInputElement>(`g-${mode}-win`)),
        loss: num($<HTMLInputElement>(`g-${mode}-loss`)),
      });
      return {
        gold: {
          ranked: { ...goldOf("ranked"), ...(mulRaw.length ? { placementMultipliers: mulRaw } : {}) },
          arcade: goldOf("arcade"),
          pve: goldOf("pve"),
          test: goldOf("test"),
        },
        xp: {
          ranked: {
            winBase: num($<HTMLInputElement>("xp-winBase")),
            winFlat: num($<HTMLInputElement>("xp-winFlat")),
            winLevelCoeff: num($<HTMLInputElement>("xp-winLevel")),
            lossBase: num($<HTMLInputElement>("xp-lossBase")),
            lossOppCoeff: num($<HTMLInputElement>("xp-lossOpp")),
          },
          arcade: {
            win: num($<HTMLInputElement>("xp-arcWin")),
            loss: num($<HTMLInputElement>("xp-arcLoss")),
            dailyCap: num($<HTMLInputElement>("xp-arcCap")),
          },
        },
        drops: {
          ranked: {
            win: pct("dr-ranked-win"),
            loss: pct("dr-ranked-loss"),
            overTier: pct("dr-ranked-over"),
            keepOverTierUnequippable: $<HTMLInputElement>("dr-keep").checked,
          },
          arcade: { win: pct("dr-arcade-win"), loss: pct("dr-arcade-loss") },
          pve: { win: pct("dr-pve-win"), loss: pct("dr-pve-loss") },
        },
        rarityUnlock: {
          common: num($<HTMLInputElement>("ru-common")),
          uncommon: num($<HTMLInputElement>("ru-uncommon")),
          rare: num($<HTMLInputElement>("ru-rare")),
          very_rare: num($<HTMLInputElement>("ru-very_rare")),
          legendary: num($<HTMLInputElement>("ru-legendary")),
        },
        vendor: {
          priceByRarity: {
            common: num($<HTMLInputElement>("vp-common")),
            uncommon: num($<HTMLInputElement>("vp-uncommon")),
            rare: num($<HTMLInputElement>("vp-rare")),
            very_rare: num($<HTMLInputElement>("vp-very_rare")),
            legendary: num($<HTMLInputElement>("vp-legendary")),
          },
          autoMin: num($<HTMLInputElement>("v-min")),
          autoMax: num($<HTMLInputElement>("v-max")),
          maxSlots: num($<HTMLInputElement>("v-slots")),
        },
        elo: {
          k: num($<HTMLInputElement>("elo-k")),
          disconnectMs: num($<HTMLInputElement>("elo-dc")),
          seasonDays: num($<HTMLInputElement>("elo-days")),
          seasonResetOldWeight: num($<HTMLInputElement>("elo-old")),
          seasonResetAnchor: num($<HTMLInputElement>("elo-anchor")),
        },
        matchmaking: {
          baseElo: num($<HTMLInputElement>("mm-baseElo")),
          stepElo: num($<HTMLInputElement>("mm-stepElo")),
          maxElo: num($<HTMLInputElement>("mm-maxElo")),
          baseLevel: num($<HTMLInputElement>("mm-baseLevel")),
          stepLevel: num($<HTMLInputElement>("mm-stepLevel")),
          maxLevel: num($<HTMLInputElement>("mm-maxLevel")),
          stepMs: num($<HTMLInputElement>("mm-stepMs")),
        },
        milestones: readMilestones(),
      };
    };

    $("ecoSave").addEventListener("click", async (ev) => {
      await write(ev.currentTarget as HTMLButtonElement, "Economy", () =>
        api("/api/admin/economy", { method: "PUT", body: readPatch() }),
      );
    });
    $("ecoReset").addEventListener("click", async (ev) => {
      const ok = await confirmDialog({
        title: "Reset economy to defaults?",
        body: "<p>Every live knob returns to the built-in defaults. Shop schedules stay.</p>",
        confirm: "Reset",
        danger: true,
      });
      if (!ok) return;
      const out = await write(ev.currentTarget as HTMLButtonElement, "Economy reset", () =>
        api("/api/admin/economy/reset", { method: "POST" }),
      );
      if (out) void balancePage.render(host, ctx);
    });
    $("msAdd").addEventListener("click", () => {
      const body = host.querySelector("#msBody")!;
      const i = body.querySelectorAll("tr").length;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><input data-ms="kind" data-i="${i}" value="" /></td>
        <td><input data-ms="count" data-i="${i}" type="number" min="1" value="10" /></td>
        <td><input data-ms="gold" data-i="${i}" type="number" min="0" value="0" /></td>
        <td><input data-ms="cosmetic" data-i="${i}" value="" /></td>
        <td><button type="button" class="sm ghost" data-ms-del="${i}">Remove</button></td>`;
      body.appendChild(tr);
      tr.querySelector("button")!.addEventListener("click", () => tr.remove());
    });
    host.querySelectorAll<HTMLButtonElement>("[data-ms-del]").forEach((b) =>
      b.addEventListener("click", () => b.closest("tr")?.remove()),
    );
    $("pvGo").addEventListener("click", async () => {
      const place = $<HTMLInputElement>("pv-place").value;
      const out = await api<Preview>("/api/admin/economy/preview", {
        method: "POST",
        body: {
          mode: $<HTMLSelectElement>("pv-mode").value,
          won: $<HTMLSelectElement>("pv-won").value === "1",
          heroLevel: num($<HTMLInputElement>("pv-level")),
          opponentLevel: num($<HTMLInputElement>("pv-opp")),
          ...(place ? { placement: Number(place) } : {}),
        },
      });
      $("pvOut").textContent = `${out.mode}: ${out.xp} XP · ${out.gold} gold · ${Math.round(out.dropChance * 100)}% drop · highest rarity ${out.highestRarity.replace("_", " ")}`;
    });
  },
};
