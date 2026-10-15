import type { Page } from "../types";
import { api, badge, confirmDialog, esc, fmtNum, toast, write } from "../ui";

type Slot = { itemId: string; name: string; rarity: string; priceGold: number };
type Day = { day: string; source: "scheduled" | "auto"; slots: Slot[] };
type CatalogItem = { id: string; name: string; rarity: string; priceGold: number };
type Analytics = { goldFlow: { earned: number; spent: number } };

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export const shopPage: Page = {
  id: "shop",
  label: "Shop",
  group: "Economy",
  async render(host, ctx) {
    const from = todayUtc();
    const [{ calendar }, { items }, analytics] = await Promise.all([
      api<{ calendar: Day[] }>(`/api/admin/shop?from=${from}&days=14`),
      api<{ items: CatalogItem[] }>("/api/admin/shop/items"),
      api<Analytics>("/api/admin/analytics").catch(() => ({ goldFlow: { earned: 0, spent: 0 } })),
    ]);
    if (!ctx.isCurrent()) return;
    const byId = new Map(items.map((i) => [i.id, i]));
    let selected = calendar.find((d) => d.day === from) ?? calendar[0];
    let draft: Array<{ itemId: string; priceGold: number | null }> = selected
      ? selected.slots.map((s) => ({ itemId: s.itemId, priceGold: s.priceGold }))
      : [];
    let query = "";

    const paint = (): void => {
      if (!ctx.isCurrent() || !selected) return;
      const q = query.trim().toLowerCase();
      const hits = items.filter((i) => !q || i.name.toLowerCase().includes(q) || i.id.includes(q)).slice(0, 40);
      host.innerHTML = `<div class="page">
        <div class="page-head"><div class="titles"><h1>Daily shop</h1><p>Schedule the vendor for each UTC day. Days without a schedule use the automatic stock.</p></div></div>
        <div class="cards">
          <div class="card stat"><b>${fmtNum(analytics.goldFlow.earned)}</b><span>Gold earned</span></div>
          <div class="card stat"><b>${fmtNum(analytics.goldFlow.spent)}</b><span>Gold spent</span></div>
          <div class="card stat"><b>${fmtNum(items.length)}</b><span>Items in play</span></div>
        </div>
        <div class="grid-2">
          <div class="card">
            <header><h2>Next 14 days</h2></header>
            <div class="body">
              <table class="data"><tbody>${calendar
                .map(
                  (d) => `<tr data-day="${esc(d.day)}" class="${d.day === selected!.day ? "on" : ""}">
                    <td><code>${esc(d.day)}</code></td>
                    <td>${badge(d.source, d.source === "scheduled" ? "ok" : "info")}</td>
                    <td class="right">${d.slots.length} slots</td></tr>`,
                )
                .join("")}</tbody></table>
            </div>
          </div>
          <div class="card">
            <header><h2>${esc(selected.day)} · ${selected.source}</h2></header>
            <div class="body stack">
              <ol class="stack" id="shopSlots">${draft
                .map((s, i) => {
                  const item = byId.get(s.itemId);
                  return `<li class="row" style="align-items:center;gap:8px">
                    <b style="flex:1">${esc(item?.name ?? s.itemId)}</b>
                    <input data-price="${i}" type="number" min="0" step="1" value="${s.priceGold ?? ""}" placeholder="price" style="width:7rem" />
                    <button type="button" class="sm ghost" data-up="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
                    <button type="button" class="sm ghost" data-down="${i}" ${i === draft.length - 1 ? "disabled" : ""}>↓</button>
                    <button type="button" class="sm ghost" data-drop="${i}">Remove</button>
                  </li>`;
                })
                .join("") || `<p class="faint">No slots. Add items below or fill from auto.</p>`}</ol>
              <label class="field"><span>Add an enabled item</span><input id="shopQ" value="${esc(query)}" placeholder="Search name or id" /></label>
              <ul class="stack">${hits
                .map(
                  (i) => `<li class="row"><span style="flex:1">${esc(i.name)} <span class="faint">${esc(i.rarity)} · ${fmtNum(i.priceGold)} gp</span></span>
                    <button type="button" class="sm" data-add="${esc(i.id)}">Add</button></li>`,
                )
                .join("") || `<li class="faint">No enabled items match.</li>`}</ul>
              <div class="row">
                <button type="button" class="primary" id="shopSave">Save schedule</button>
                <button type="button" id="shopFill">Fill from auto</button>
                <button type="button" class="ghost" id="shopReset">Reset to auto</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;

      host.querySelectorAll<HTMLTableRowElement>("[data-day]").forEach((row) =>
        row.addEventListener("click", () => {
          selected = calendar.find((d) => d.day === row.dataset.day) ?? selected;
          draft = selected.slots.map((s) => ({ itemId: s.itemId, priceGold: s.priceGold }));
          paint();
        }),
      );
      host.querySelector("#shopQ")!.addEventListener("input", (ev) => {
        query = (ev.target as HTMLInputElement).value;
        paint();
      });
      host.querySelectorAll<HTMLButtonElement>("[data-add]").forEach((b) =>
        b.addEventListener("click", () => {
          const item = byId.get(b.dataset.add!);
          if (!item) return;
          draft.push({ itemId: item.id, priceGold: item.priceGold });
          paint();
        }),
      );
      host.querySelectorAll<HTMLInputElement>("[data-price]").forEach((inp) =>
        inp.addEventListener("change", () => {
          const i = Number(inp.dataset.price);
          const n = inp.value === "" ? null : Number(inp.value);
          if (draft[i]) draft[i] = { ...draft[i]!, priceGold: n != null && Number.isFinite(n) ? n : null };
        }),
      );
      host.querySelectorAll<HTMLButtonElement>("[data-drop]").forEach((b) =>
        b.addEventListener("click", () => {
          draft.splice(Number(b.dataset.drop), 1);
          paint();
        }),
      );
      host.querySelectorAll<HTMLButtonElement>("[data-up]").forEach((b) =>
        b.addEventListener("click", () => {
          const i = Number(b.dataset.up);
          if (i < 1) return;
          [draft[i - 1], draft[i]] = [draft[i]!, draft[i - 1]!];
          paint();
        }),
      );
      host.querySelectorAll<HTMLButtonElement>("[data-down]").forEach((b) =>
        b.addEventListener("click", () => {
          const i = Number(b.dataset.down);
          if (i >= draft.length - 1) return;
          [draft[i + 1], draft[i]] = [draft[i]!, draft[i + 1]!];
          paint();
        }),
      );
      host.querySelector("#shopSave")!.addEventListener("click", async (ev) => {
        const out = await write(ev.currentTarget as HTMLButtonElement, `Shop ${selected!.day}`, () =>
          api<{ day: Day }>(`/api/admin/shop/${selected!.day}`, {
            method: "PUT",
            body: { slots: draft.map((s) => ({ itemId: s.itemId, priceGold: s.priceGold })) },
          }),
        );
        if (out) void shopPage.render(host, ctx);
      });
      host.querySelector("#shopFill")!.addEventListener("click", async (ev) => {
        const out = await write(ev.currentTarget as HTMLButtonElement, `Shop ${selected!.day} filled`, () =>
          api<{ day: Day }>(`/api/admin/shop/${selected!.day}/fill-auto`, { method: "POST" }),
        );
        if (out) void shopPage.render(host, ctx);
      });
      host.querySelector("#shopReset")!.addEventListener("click", async (ev) => {
        const ok = await confirmDialog({
          title: "Reset this day to auto stock?",
          body: `<p>${esc(selected!.day)} will use the seeded automatic shop again.</p>`,
          confirm: "Reset to auto",
        });
        if (!ok) return;
        const out = await write(ev.currentTarget as HTMLButtonElement, `Shop ${selected!.day} reset`, () =>
          api(`/api/admin/shop/${selected!.day}`, { method: "DELETE" }),
        );
        if (out) void shopPage.render(host, ctx);
      });
    };
    if (!selected) {
      host.innerHTML = `<div class="page"><div class="notice warn">No shop days could be built.</div></div>`;
      toast("warn", "Shop calendar is empty");
      return;
    }
    paint();
  },
};
