import type { Page } from "../types";
import { api, esc, fmtNum } from "../ui";

type Analytics = {
  goldFlow: { earned: number; spent: number };
  drops: Array<{ rarity: string; n: number }>;
  iap: { receipts: number; byProduct: Array<{ product: string; n: number }> };
  winRate: Array<{ classId: string; wins: number; fights: number }>;
  dau: number;
};

const RARITY_ORDER = ["common", "uncommon", "rare", "very_rare", "legendary", "artifact"];

function bars(rows: Array<{ label: string; n: number; note?: string }>, empty: string): string {
  if (!rows.length) return `<p class="faint" style="margin:0">${esc(empty)}</p>`;
  const max = Math.max(1, ...rows.map((r) => r.n));
  return `<table class="data"><tbody>${rows
    .map(
      (r) => `<tr><td style="width:160px">${esc(r.label)}</td>
        <td><div style="height:10px;border-radius:5px;background:var(--accent);width:${Math.max(2, Math.round((r.n / max) * 100))}%"></div></td>
        <td class="right nowrap" style="width:140px">${fmtNum(r.n)}${r.note ? ` <span class="faint">${esc(r.note)}</span>` : ""}</td></tr>`,
    )
    .join("")}</tbody></table>`;
}

export const statsPage: Page = {
  id: "stats",
  label: "Stats",
  group: "Activity",
  async render(host, ctx) {
    const d = await api<Analytics>("/api/admin/analytics");
    if (!ctx.isCurrent()) return;
    const drops = [...d.drops].sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
    const fights = [...d.winRate].sort((a, b) => b.fights - a.fights);
    host.innerHTML = `<div class="page">
      <div class="page-head"><div class="titles"><h1>Stats</h1><p>Totals since the database was created, read from the event log. Active players counts anyone with an event in the last 24 hours.</p></div><button type="button" id="statsReload">Refresh</button></div>
      <div class="cards">
        <div class="card stat"><b>${fmtNum(d.dau)}</b><span>Active players, last 24 h</span></div>
        <div class="card stat"><b>${fmtNum(d.goldFlow.earned)}</b><span>Gold earned</span></div>
        <div class="card stat"><b>${fmtNum(d.goldFlow.spent)}</b><span>Gold spent</span></div>
        <div class="card stat"><b>${fmtNum(d.iap.receipts)}</b><span>Purchase receipts</span></div>
      </div>
      <div class="grid-2">
        <div class="card"><header><h2>Loot drops by rarity</h2></header><div class="body">${bars(drops.map((r) => ({ label: r.rarity.replace(/_/g, " "), n: r.n })), "No drops yet.")}</div></div>
        <div class="card"><header><h2>Arena win rate by class</h2></header><div class="body">${bars(
          fights.map((r) => ({ label: r.classId, n: r.fights, note: `${r.fights ? Math.round((r.wins / r.fights) * 100) : 0}% won` })),
          "No arena matches yet.",
        )}</div></div>
        <div class="card"><header><h2>Purchases by product</h2></header><div class="body">${bars(d.iap.byProduct.map((r) => ({ label: r.product, n: r.n })), "No purchases yet.")}</div></div>
      </div>
    </div>`;
    host.querySelector("#statsReload")!.addEventListener("click", () => void statsPage.render(host, ctx));
  },
};
