import type { Overview, Page } from "../types";
import { api, esc, fmtNum } from "../ui";

function card(n: number, label: string, href: string, alert = false): string {
  return `<div class="card stat${alert && n ? " alert" : ""}"><a href="${esc(href)}"><b>${fmtNum(n)}</b><span>${esc(label)}</span></a></div>`;
}

export const overviewPage: Page = {
  id: "overview",
  label: "Overview",
  group: "Portal",
  async render(host, ctx) {
    const o = await api<Overview>("/api/admin/overview");
    if (!ctx.isCurrent()) return;
    host.innerHTML = `<div class="page">
      <div class="page-head"><div class="titles"><h1>Overview</h1><p>Signed in as ${esc(ctx.me.username)}. Every number opens the matching list.</p></div></div>
      <h2 style="margin:0 0 10px">Players</h2>
      <div class="cards">
        ${card(o.users.total, "Accounts", "#/users")}
        ${card(o.users.active, "Active", "#/users?status=active")}
        ${card(o.users.pending, "Waiting for email confirmation", "#/users?status=pending", true)}
        ${card(o.users.disabled, "Disabled", "#/users?status=disabled")}
        ${card(o.users.admins, "Admins", "#/users?role=admin")}
        ${card(o.users.amazon, "Linked to Amazon", "#/users?status=amazon")}
      </div>
      <h2 style="margin:0 0 10px">Tables</h2>
      <div class="cards">
        ${card(o.rooms, "Open tables", "#/rooms")}
        ${card(o.saves.total, "Save files", "#/saves")}
        ${card(o.saves.auto, "Autosaves", "#/saves?kind=auto")}
        ${card(o.saves.archived, "Archived v1 saves", "#/saves?kind=archived")}
      </div>
      <h2 style="margin:0 0 10px">Content</h2>
      <div class="cards">
        ${card(o.campaigns, "Campaigns", "#/campaigns")}
        ${card(o.content.all, "Catalog entries", "#/content")}
        ${card(o.content.needsReview, "Waiting for review", "#/content?status=needs_review", true)}
        ${card(o.content.invalid, "Fail the game schema", "#/content?valid=no", true)}
        ${card(o.content.inPlay, "Used by the campaign", "#/content?enabled=in_play")}
        ${card(o.content.edited, "Edited by an admin", "#/content?source=edited")}
      </div>
    </div>`;
  },
};
