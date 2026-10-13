import type { Page } from "../types";
import { api, confirmDialog, esc, write } from "../ui";

type Season = { id: string; startsAt: string; endsAt: string };

export const systemPage: Page = {
  id: "system",
  label: "Maintenance",
  group: "Settings",
  async render(host, ctx) {
    const { season } = await api<{ season: Season }>("/api/season");
    if (!ctx.isCurrent()) return;
    host.innerHTML = `<div class="page">
      <div class="page-head"><div class="titles"><h1>Maintenance</h1><p>One-off operations. Each one writes to the database and is recorded in the activity log.</p></div></div>
      <div class="stack">
        <div class="card">
          <header><h2>Arena season</h2></header>
          <div class="body stack">
            <dl class="kv"><dt>Running</dt><dd><code>${esc(season.id)}</code></dd><dt>Started</dt><dd>${esc(new Date(season.startsAt).toLocaleString())}</dd><dt>Ends</dt><dd>${esc(new Date(season.endsAt).toLocaleString())}</dd></dl>
            <div class="row"><button type="button" class="danger" id="sysSeason">Close the season now…</button><span class="faint">Soft-resets every arena rating, zeroes season pass XP, and opens a new 60-day season. Unlocked cosmetics stay.</span></div>
          </div>
        </div>
        <div class="card">
          <header><h2>Content catalog</h2></header>
          <div class="body row"><button type="button" id="sysReload">Reload SRD files from disk</button><span class="faint">Run after <code>npm run content:import</code> so the server sees the new files without a restart.</span></div>
        </div>
        <div class="card">
          <header><h2>Legacy v1 data</h2></header>
          <div class="body row"><button type="button" id="sysArchive">Archive v1 characters and saves</button><span class="faint">Flags old custom characters as legacy and archives every save so it cannot be resumed. Runs once; later runs report zero.</span></div>
        </div>
      </div>
    </div>`;
    host.querySelector("#sysSeason")!.addEventListener("click", async (ev) => {
      const ok = await confirmDialog({
        title: "Close the arena season now?",
        body: `<p>Season <code>${esc(season.id)}</code> ends immediately. Every rating is pulled toward the middle and all season pass XP is set to zero.</p>`,
        confirm: "Close season",
        danger: true,
        typeToConfirm: "CLOSE SEASON",
      });
      if (!ok) return;
      const out = await write(ev.currentTarget as HTMLButtonElement, "Season closed", () => api<{ season: Season }>("/api/admin/season/close", { method: "POST" }), (o) => `new season ${o.season.id}`);
      if (out) await systemPage.render(host, ctx);
    });
    host.querySelector("#sysReload")!.addEventListener("click", async (ev) => {
      await write(ev.currentTarget as HTMLButtonElement, "Catalog re-read from disk", () => api("/api/admin/content/reload", { method: "POST" }), undefined, "Catalog reloaded");
      void ctx.refreshCounts();
    });
    host.querySelector("#sysArchive")!.addEventListener("click", async (ev) => {
      const ok = await confirmDialog({
        title: "Archive v1 data?",
        body: "<p>Every custom character on disk is flagged as legacy and <b>every save on disk</b> is archived. Archived saves can no longer be resumed. This runs only once.</p>",
        confirm: "Archive",
        danger: true,
        typeToConfirm: "ARCHIVE",
      });
      if (!ok) return;
      await write(ev.currentTarget as HTMLButtonElement, "v1 data archived", () => api<{ characters: number; saves: number }>("/api/admin/archive-v1", { method: "POST" }), (o) => `${o.characters} characters, ${o.saves} saves`);
    });
  },
};
