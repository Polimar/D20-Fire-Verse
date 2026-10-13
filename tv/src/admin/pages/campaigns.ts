import { sceneForNode } from "../../scenes";
import { subPath, type Page, type PageCtx } from "../types";
import { api, badge, confirmDialog, errorText, esc, field, fmtBytes, toast, write } from "../ui";

type CampaignRow = { id: string; title: string; publishedVersion: number | null; draft: boolean; changed: boolean };

type Link = { to: string; via: "choice" | "success" | "failure" | "victory" | "hub" | "routed"; label: string };
type Problem = { nodeId?: string; level: "error" | "warning"; code: string; detail: string };
type NodeSummary = {
  id: string;
  type: NodeType;
  title: string;
  text: string;
  art: string | null;
  speaker: string | null;
  links: Link[];
  incoming: string[];
  errors: number;
  warnings: number;
};
type Art = { name: string; url: string; bytes?: number };
type View = {
  id: string;
  manifest: { title: string; startNodeId: string };
  changed: boolean;
  problems: Problem[];
  nodes: NodeSummary[];
  encounters: Array<{ id: string; name: string; mapId: string }>;
  maps: Array<{ id: string; name: string }>;
  monsters: Array<{ id: string; name: string }>;
  cast: Array<{ id: string; name: string }>;
  art: Art[];
  builtinArt: Art[];
  hubExits: Array<{ next: string; label: string; when: string }>;
};

type NodeType = "story" | "skill_check" | "encounter" | "puzzle" | "hub";
type Choice = { id: string; label: string; next: string; flagsSet?: string[]; requireFlags?: string[]; excludeFlags?: string[] };
type Outcome = { narration?: { text: string }; next?: string; flagsSet?: string[]; effects?: unknown[] };
type StoryNode = {
  id: string;
  type: NodeType;
  alexaScene?: string;
  narration?: { text: string };
  choices?: Choice[];
  hubId?: string;
  check?: { ability: string; skill?: string; dc: number; proposer?: string };
  puzzle?: {
    kind: "sequence";
    solution: string[];
    options: Array<{ id: string; label: string }>;
    hint?: string;
    nudge?: string;
    maxFailsBeforePenalty?: number;
    resetOnFail?: boolean;
  };
  onSuccess?: Outcome;
  onFailure?: Outcome;
  encounterId?: string;
  onVictory?: string;
  savePrompt?: boolean;
  speaker?: { id: string; name: string };
  scene?: { title?: string; chapter?: string; art?: string; tone?: "warm" | "cool" | "ember" | "victory" };
};
type Encounter = {
  id: string;
  name: string;
  mapId: string;
  intro?: string;
  outro?: string;
  scaling: Record<string, Array<{ monsterId: string; count: number; hpOverride?: number }>>;
};

const TYPE_LABEL: Record<NodeType, string> = { story: "Story", skill_check: "Skill check", encounter: "Encounter", puzzle: "Puzzle", hub: "Hub" };
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const SCENES = ["tavern", "explore", "combat", "boss", "victory"];
const TONES = ["warm", "cool", "ember", "victory"] as const;
const ENDS = ["END_SAVE", "END_WIN"];

let editorDirty = false;

function typeBadge(t: NodeType): string {
  return `<span class="badge type-${t}">${esc(TYPE_LABEL[t] ?? t)}</span>`;
}

function list(v: string): string[] {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const campaignsPage: Page = {
  id: "campaigns",
  label: "Campaigns",
  group: "Content",
  count: (o) => ({ value: o.campaigns }),
  dirty: () => editorDirty,
  async leave() {
    if (!editorDirty) return true;
    const ok = await confirmDialog({ title: "Leave the editor?", body: "<p>This node has edits that are not saved to the draft.</p>", confirm: "Discard and leave", danger: true });
    if (ok) editorDirty = false;
    return ok;
  },
  async render(host, ctx) {
    editorDirty = false;
    const [id] = subPath();
    if (id) await editor(host, ctx, id);
    else await listView(host, ctx);
  },
};

// ------------------------------------------------------------------ list

async function listView(host: HTMLElement, ctx: PageCtx): Promise<void> {
  const { campaigns } = await api<{ campaigns: CampaignRow[] }>("/api/admin/campaigns");
  if (!ctx.isCurrent()) return;
  host.innerHTML = `<div class="page">
    <div class="page-head">
      <div class="titles"><h1>Campaigns</h1><p>Edits go to a draft. Publishing makes a new version for tables opened after that; tables already playing keep the version they started with.</p></div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Campaign</th><th>Published</th><th>Draft</th><th></th></tr></thead>
        <tbody>${
          campaigns
            .map(
              (c) => `<tr>
              <td><a href="#/campaigns/${encodeURIComponent(c.id)}"><b>${esc(c.title)}</b></a><span class="sub mono">${esc(c.id)}</span></td>
              <td>${c.publishedVersion != null ? badge(`Live · v${c.publishedVersion}`, "ok") : badge("Not published", "warn")}</td>
              <td>${c.changed ? badge("Unpublished changes", "warn") : badge("Same as live")}</td>
              <td class="actions">
                <a class="btn" href="#/campaigns/${encodeURIComponent(c.id)}" style="height:26px;font-size:12.5px">Open editor</a>
                <button type="button" class="sm primary" data-pub="${esc(c.id)}" ${c.changed ? "" : "disabled"}>Publish</button>
                <button type="button" class="sm danger" data-un="${esc(c.id)}" ${c.publishedVersion != null ? "" : "disabled"}>Withdraw</button>
              </td></tr>`,
            )
            .join("") || `<tr><td colspan="4" class="empty">No campaigns.</td></tr>`
        }</tbody>
      </table></div>
    </div>
    <div class="card">
      <header><h2>Import a campaign archive</h2></header>
      <div class="body stack">
        <p class="muted" style="margin:0">A .zip with manifest.json, nodes/story.json, maps, encounters, monsters, and an optional art folder. It lands as a draft; nothing changes for players until you publish.</p>
        <div class="row"><input type="file" id="zip" accept=".zip,application/zip" /><button type="button" class="primary" id="zipGo">Upload draft</button></div>
      </div>
    </div>
  </div>`;
  host.querySelector("#zipGo")!.addEventListener("click", async (ev) => {
    const file = host.querySelector<HTMLInputElement>("#zip")!.files?.[0];
    if (!file) return;
    const out = await write(
      ev.currentTarget as HTMLButtonElement,
      `Draft imported from ${file.name}`,
      () => api<{ id: string; title: string }>("/api/admin/campaigns/import", { raw: file, contentType: "application/zip" }),
      (o) => o.title,
      "Draft saved",
    );
    if (out) location.hash = `#/campaigns/${encodeURIComponent(out.id)}`;
  });
  host.querySelectorAll<HTMLButtonElement>("[data-pub]").forEach((b) =>
    b.addEventListener("click", () => void publish(b.dataset.pub!, b, () => listView(host, ctx))),
  );
  host.querySelectorAll<HTMLButtonElement>("[data-un]").forEach((b) =>
    b.addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: "Withdraw this campaign?",
        body: "<p>New tables can no longer pick it. Tables already playing finish on their version. The draft stays.</p>",
        confirm: "Withdraw",
        danger: true,
      });
      if (!ok) return;
      const out = await write(b, `${b.dataset.un} withdrawn`, () => api(`/api/admin/campaigns/${encodeURIComponent(b.dataset.un!)}/unpublish`, { method: "POST" }), undefined, "Campaign withdrawn");
      if (out) await listView(host, ctx);
    }),
  );
}

async function publish(id: string, button: HTMLButtonElement | null, after: () => Promise<void> | void): Promise<void> {
  const view = await api<View>(`/api/admin/campaigns/${encodeURIComponent(id)}`);
  const errors = view.problems.filter((p) => p.level === "error");
  if (errors.length) {
    toast("bad", `Publish blocked: ${errors.length} error${errors.length === 1 ? "" : "s"} in the draft`, esc(errors.slice(0, 3).map((e) => e.detail).join(" · ")));
    return;
  }
  const warnings = view.problems.filter((p) => p.level === "warning").length;
  const ok = await confirmDialog({
    title: `Publish ${view.manifest.title}?`,
    body: `<p>New tables get this draft as the next version. Open tables keep their version.</p>${warnings ? `<div class="notice warn">${warnings} warning${warnings === 1 ? "" : "s"} (unreachable nodes or missing text). They do not block publishing.</div>` : ""}`,
    confirm: "Publish",
  });
  if (!ok) return;
  const out = await write(
    button,
    `${view.manifest.title} published`,
    () => api<{ version: number }>(`/api/admin/campaigns/${encodeURIComponent(id)}/publish`, { method: "POST" }),
    (o) => `live version v${o.version}`,
    "Campaign published",
  );
  if (out) await after();
}

// ------------------------------------------------------------------ editor

async function editor(host: HTMLElement, ctx: PageCtx, id: string): Promise<void> {
  let view = await api<View>(`/api/admin/campaigns/${encodeURIComponent(id)}`);
  if (!ctx.isCurrent()) return;
  const params = new URLSearchParams(location.hash.split("?")[1] ?? "");
  let currentId = params.get("node") ?? view.manifest.startNodeId;
  let listFilter = { q: "", type: "" };
  host.innerHTML = `<div class="page wide">
    <div class="crumbs"><a href="#/campaigns">Campaigns</a> / ${esc(view.id)}</div>
    <div class="page-head">
      <div class="titles"><h1 id="cTitle"></h1><p id="cSub"></p></div>
      <button type="button" id="cManifest">Title & start node</button>
      <button type="button" class="danger" id="cDiscard">Discard draft…</button>
      <button type="button" class="primary" id="cPublish">Publish draft</button>
    </div>
    <div id="cProblems"></div>
    <div class="camp-layout">
      <div class="card">
        <header><h2 id="cCount">Nodes</h2><button type="button" class="sm primary" id="cNew">New node</button></header>
        <div class="toolbar" style="padding:10px">
          <input class="search" id="cQ" type="search" placeholder="Filter id or text" style="width:100%" />
          <select id="cType" style="width:100%"><option value="">All types</option>${Object.entries(TYPE_LABEL)
            .map(([k, v]) => `<option value="${k}">${v}</option>`)
            .join("")}<option value="problems">With problems</option></select>
        </div>
        <div class="node-list" id="cList"></div>
      </div>
      <div class="card" id="cEditor"></div>
    </div>
  </div>`;

  const paintHead = () => {
    host.querySelector("#cTitle")!.textContent = view.manifest.title;
    const errors = view.problems.filter((p) => p.level === "error").length;
    const warnings = view.problems.length - errors;
    host.querySelector("#cSub")!.innerHTML = `${view.changed ? badge("Draft has unpublished changes", "warn") : badge("Draft matches the live version", "ok")}
      ${errors ? badge(`${errors} error${errors === 1 ? "" : "s"}`, "bad") : ""} ${warnings ? badge(`${warnings} warning${warnings === 1 ? "" : "s"}`, "warn") : ""}
      <span class="faint">Start node <code>${esc(view.manifest.startNodeId)}</code></span>`;
    host.querySelector<HTMLButtonElement>("#cPublish")!.disabled = !view.changed;
    const box = host.querySelector<HTMLElement>("#cProblems")!;
    box.innerHTML = view.problems.length
      ? `<details class="card" style="margin-bottom:16px" ${errors ? "open" : ""}><summary style="padding:12px 16px;cursor:pointer"><b>Draft check</b> · ${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}. Errors block publishing.</summary>
          <div class="body"><table class="data"><tbody>${view.problems
            .map(
              (p) =>
                `<tr><td style="width:90px">${p.level === "error" ? badge("Error", "bad") : badge("Warning", "warn")}</td><td>${p.nodeId ? `<a href="#" data-goto="${esc(p.nodeId)}" class="mono">${esc(p.nodeId)}</a>` : `<span class="faint">campaign</span>`}</td><td>${esc(p.detail)}</td></tr>`,
            )
            .join("")}</tbody></table></div></details>`
      : "";
    box.querySelectorAll<HTMLElement>("[data-goto]").forEach((a) =>
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        void select(a.dataset.goto!);
      }),
    );
  };

  const paintList = () => {
    const q = listFilter.q.toLowerCase();
    const rows = view.nodes.filter((n) => {
      if (listFilter.type === "problems" && !(n.errors || n.warnings)) return false;
      if (listFilter.type && listFilter.type !== "problems" && n.type !== listFilter.type) return false;
      return !q || n.id.includes(q) || n.text.toLowerCase().includes(q) || n.title.toLowerCase().includes(q);
    });
    host.querySelector("#cCount")!.textContent = `Nodes · ${rows.length} of ${view.nodes.length}`;
    host.querySelector("#cList")!.innerHTML =
      rows
        .map((n) => {
          const flags = [
            n.id === view.manifest.startNodeId ? badge("Start", "ok") : "",
            n.errors ? badge(String(n.errors), "bad") : "",
            n.warnings ? badge(String(n.warnings), "warn") : "",
            n.art ? badge("Art", "info") : "",
          ].join(" ");
          return `<button type="button" class="node${n.id === currentId ? " on" : ""}" data-node="${esc(n.id)}">
            ${typeBadge(n.type)}<code>${esc(n.id)}</code><span class="t">${esc(sceneForNode(n.id, n.title ? { title: n.title } : null).title)} · ${esc(n.text || "no text")}</span><span class="flags badges">${flags}</span>
          </button>`;
        })
        .join("") || `<p class="faint" style="padding:12px">No nodes match.</p>`;
  };

  const select = async (nodeId: string) => {
    if (editorDirty && !(await campaignsPage.leave!())) return;
    currentId = nodeId;
    history.replaceState(null, "", `#/campaigns/${encodeURIComponent(id)}?node=${encodeURIComponent(nodeId)}`);
    paintList();
    const listBox = host.querySelector<HTMLElement>("#cList")!;
    const item = listBox.querySelector<HTMLElement>(`[data-node="${CSS.escape(nodeId)}"]`);
    if (item && (item.offsetTop < listBox.scrollTop || item.offsetTop + item.offsetHeight > listBox.scrollTop + listBox.clientHeight)) {
      listBox.scrollTop = item.offsetTop - listBox.clientHeight / 3;
    }
    await nodeEditor(host.querySelector<HTMLElement>("#cEditor")!, id, nodeId, () => view, async (next) => {
      view = next;
      paintHead();
      paintList();
    }, select);
  };

  host.querySelector("#cList")!.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("[data-node]");
    if (b) void select(b.dataset.node!);
  });
  host.querySelector("#cQ")!.addEventListener("input", (ev) => {
    listFilter = { ...listFilter, q: (ev.target as HTMLInputElement).value.trim() };
    paintList();
  });
  host.querySelector("#cType")!.addEventListener("change", (ev) => {
    listFilter = { ...listFilter, type: (ev.target as HTMLSelectElement).value };
    paintList();
  });
  host.querySelector("#cNew")!.addEventListener("click", () => void newNode(id, view, async (next, nodeId) => {
    view = next;
    paintHead();
    editorDirty = false;
    await select(nodeId);
  }));
  host.querySelector("#cPublish")!.addEventListener("click", (ev) =>
    void publish(id, ev.currentTarget as HTMLButtonElement, async () => {
      view = await api<View>(`/api/admin/campaigns/${encodeURIComponent(id)}`);
      paintHead();
    }),
  );
  host.querySelector("#cDiscard")!.addEventListener("click", async (ev) => {
    const ok = await confirmDialog({
      title: "Discard the whole draft?",
      body: "<p>Every unpublished edit and uploaded image in this draft is thrown away. The draft restarts from the live version.</p>",
      confirm: "Discard draft",
      danger: true,
      typeToConfirm: "DISCARD",
    });
    if (!ok) return;
    const out = await write(ev.currentTarget as HTMLButtonElement, "Draft reset to the live version", () => api<View>(`/api/admin/campaigns/${encodeURIComponent(id)}/discard`, { method: "POST" }), undefined, "Draft discarded");
    if (!out) return;
    view = out;
    editorDirty = false;
    paintHead();
    await select(view.nodes.some((n) => n.id === currentId) ? currentId : view.manifest.startNodeId);
  });
  host.querySelector("#cManifest")!.addEventListener("click", () => {
    const dlg = document.createElement("form");
    dlg.className = "dialog";
    dlg.innerHTML = `<div class="body"><h2>Campaign settings</h2>
      ${field("Title", `<input name="title" value="${esc(view.manifest.title)}" maxlength="80" />`)}
      ${field("Start node", `<select name="startNodeId">${view.nodes.map((n) => `<option ${n.id === view.manifest.startNodeId ? "selected" : ""}>${esc(n.id)}</option>`).join("")}</select>`)}
      </div><footer><button type="button" data-no>Cancel</button><button type="submit" class="primary">Save to draft</button></footer>`;
    const scrim = document.createElement("div");
    scrim.className = "scrim top";
    document.body.append(dlg, scrim);
    const close = () => {
      dlg.remove();
      scrim.remove();
    };
    dlg.querySelector("[data-no]")!.addEventListener("click", close);
    scrim.addEventListener("click", close);
    dlg.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = new FormData(dlg);
      const out = await write(dlg.querySelector<HTMLButtonElement>("button[type=submit]"), "Campaign settings", () =>
        api<View>(`/api/admin/campaigns/${encodeURIComponent(id)}/manifest`, { method: "PUT", body: { title: f.get("title"), startNodeId: f.get("startNodeId") } }),
        undefined,
        "Draft saved",
      );
      if (!out) return;
      view = out;
      close();
      paintHead();
      paintList();
    });
  });

  paintHead();
  paintList();
  await select(view.nodes.some((n) => n.id === currentId) ? currentId : view.manifest.startNodeId);
}

async function newNode(campaignId: string, view: View, done: (view: View, nodeId: string) => Promise<void>): Promise<void> {
  const dlg = document.createElement("form");
  dlg.className = "dialog";
  dlg.innerHTML = `<div class="body"><h2>New node</h2>
    ${field("Node id", `<input name="id" required pattern="[a-z0-9_]{2,60}" placeholder="cellar_secret_door" autocomplete="off" />`, { hint: "Lowercase letters, numbers, underscores. Links use this id." })}
    ${field("Type", `<select name="type">${Object.entries(TYPE_LABEL).filter(([k]) => k !== "hub").map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>`)}
    ${field("Narration", `<textarea name="text" rows="3"></textarea>`)}
    ${field("Link from", `<select name="from"><option value="">Nothing yet</option>${view.nodes.map((n) => `<option>${esc(n.id)}</option>`).join("")}</select>`, { hint: "Adds a choice on that node pointing here." })}
    </div><footer><button type="button" data-no>Cancel</button><button type="submit" class="primary">Create in draft</button></footer>`;
  const scrim = document.createElement("div");
  scrim.className = "scrim top";
  document.body.append(dlg, scrim);
  const close = () => {
    dlg.remove();
    scrim.remove();
  };
  dlg.querySelector("[data-no]")!.addEventListener("click", close);
  scrim.addEventListener("click", close);
  dlg.querySelector("input")!.focus();
  dlg.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = new FormData(dlg);
    const nodeId = String(f.get("id"));
    const from = String(f.get("from") ?? "");
    const out = await write(dlg.querySelector<HTMLButtonElement>("button[type=submit]"), `Node ${nodeId} created`, async () => {
      let next = await api<View>(`/api/admin/campaigns/${encodeURIComponent(campaignId)}/nodes`, { body: { id: nodeId, type: f.get("type"), text: f.get("text") } });
      if (from) {
        const { node } = await api<{ node: StoryNode }>(`/api/admin/campaigns/${encodeURIComponent(campaignId)}/nodes/${encodeURIComponent(from)}`);
        node.choices = [...(node.choices ?? []), { id: `to_${nodeId}`.slice(0, 40), label: `Go to ${nodeId.replace(/_/g, " ")}`, next: nodeId }];
        next = await api<View>(`/api/admin/campaigns/${encodeURIComponent(campaignId)}/nodes/${encodeURIComponent(from)}`, { method: "PUT", body: { node } });
      }
      return next;
    }, () => (from ? `linked from ${from}` : "not linked yet"), "Draft saved");
    if (!out) return;
    close();
    await done(out, nodeId);
  });
}

function nodeOptions(view: View, current: string | undefined, allowEmpty = true): string {
  const ids = view.nodes.map((n) => n.id);
  const known = new Set([...ids, ...ENDS]);
  const opts = [
    allowEmpty ? `<option value="">—</option>` : "",
    current && !known.has(current) ? `<option value="${esc(current)}" selected>⚠ ${esc(current)} (missing)</option>` : "",
    ...ids.map((nid) => `<option value="${esc(nid)}" ${nid === current ? "selected" : ""}>${esc(nid)}</option>`),
    ...ENDS.map((e) => `<option value="${e}" ${e === current ? "selected" : ""}>${e === "END_WIN" ? "END_WIN · adventure complete" : "END_SAVE · session break"}</option>`),
  ];
  return opts.join("");
}

function choiceItem(view: View, c: Choice, i: number): string {
  return `<div class="item" data-choice="${i}">
    <div class="row">
      ${field("Label", `<input data-k="label" value="${esc(c.label)}" />`)}
      ${field("Goes to", `<select data-k="next">${nodeOptions(view, c.next, false)}</select>`)}
      <div class="row" style="align-self:end">
        <button type="button" class="sm ghost" data-move="-1" title="Move up" ${i === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="sm ghost" data-move="1" title="Move down">↓</button>
        <button type="button" class="sm danger" data-remove title="Remove choice">Remove</button>
      </div>
    </div>
    <div class="grid-3">
      ${field("Sets flags", `<input data-k="flagsSet" value="${esc((c.flagsSet ?? []).join(", "))}" placeholder="flag_a, flag_b" />`)}
      ${field("Needs flags", `<input data-k="requireFlags" value="${esc((c.requireFlags ?? []).join(", "))}" />`)}
      ${field("Hidden by flags", `<input data-k="excludeFlags" value="${esc((c.excludeFlags ?? []).join(", "))}" />`)}
    </div>
    <input type="hidden" data-k="id" value="${esc(c.id)}" />
  </div>`;
}

function outcomeBlock(view: View, key: "onSuccess" | "onFailure", o: Outcome | undefined, title: string): string {
  return `<section data-outcome="${key}"><h3>${title}</h3>
    ${field("Narration", `<textarea data-k="text" rows="3">${esc(o?.narration?.text ?? "")}</textarea>`)}
    <div class="grid-2">
      ${field("Goes to", `<select data-k="next">${nodeOptions(view, o?.next)}</select>`)}
      ${field("Sets flags", `<input data-k="flagsSet" value="${esc((o?.flagsSet ?? []).join(", "))}" />`)}
    </div>
  </section>`;
}

function scalingText(enc: Encounter | null, players: string): string {
  return (enc?.scaling?.[players] ?? []).map((g) => `${g.monsterId} ${g.count}${g.hpOverride ? ` hp=${g.hpOverride}` : ""}`).join("\n");
}

function parseScaling(text: string): Array<{ monsterId: string; count: number; hpOverride?: number }> {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [monsterId, count, hp] = line.split(/\s+/);
      const hpOverride = Number(/^hp=(\d+)$/.exec(hp ?? "")?.[1]);
      return { monsterId: monsterId ?? "", count: Math.max(1, Number(count) || 1), ...(hpOverride ? { hpOverride } : {}) };
    });
}

async function nodeEditor(
  box: HTMLElement,
  campaignId: string,
  nodeId: string,
  getView: () => View,
  onView: (view: View) => Promise<void>,
  goto: (nodeId: string) => Promise<void>,
): Promise<void> {
  box.innerHTML = `<div class="loading">Loading ${esc(nodeId)}…</div>`;
  const base = `/api/admin/campaigns/${encodeURIComponent(campaignId)}`;
  let loaded: { node: StoryNode; encounter: Encounter | null };
  try {
    loaded = await api(`${base}/nodes/${encodeURIComponent(nodeId)}`);
  } catch (err) {
    box.innerHTML = `<div class="body"><div class="notice bad">${esc(errorText(err))}</div></div>`;
    return;
  }
  let node = loaded.node;
  let encounter = loaded.encounter;
  let tab = "content";
  editorDirty = false;

  const markDirty = () => {
    editorDirty = true;
    const d = box.querySelector("#nDirty");
    if (d) d.innerHTML = `<span class="dirty-dot"></span> Unsaved changes`;
    box.querySelector<HTMLButtonElement>("#nSave")!.disabled = false;
  };

  const paint = () => {
    const view = getView();
    const summary = view.nodes.find((n) => n.id === node.id);
    const problems = view.problems.filter((p) => p.nodeId === node.id);
    const scene = sceneForNode(node.id, node.scene ?? null);
    const choicesBlock =
      node.type === "hub"
        ? ""
        : `<section><h3>Choices (${(node.choices ?? []).length})</h3>
            <div class="list-edit" id="nChoices">${(node.choices ?? []).map((c, i) => choiceItem(view, c, i)).join("")}</div>
            <div><button type="button" class="sm" id="nAddChoice">Add a choice</button></div>
          </section>`;
    let typeBlock = "";
    if (node.type === "skill_check") {
      typeBlock = `<section><h3>Check</h3><div class="grid-3">
          ${field("Ability", `<select id="nAbility">${ABILITIES.map((a) => `<option ${node.check?.ability === a ? "selected" : ""}>${a}</option>`).join("")}</select>`)}
          ${field("Skill", `<input id="nSkill" value="${esc(node.check?.skill ?? "")}" placeholder="persuasion" />`)}
          ${field("DC", `<input id="nDc" type="number" min="1" max="30" value="${esc(node.check?.dc ?? 12)}" />`)}
        </div></section>
        ${outcomeBlock(view, "onSuccess", node.onSuccess, "On success")}
        ${outcomeBlock(view, "onFailure", node.onFailure, "On failure")}`;
    } else if (node.type === "puzzle") {
      const pz = node.puzzle ?? { kind: "sequence" as const, options: [], solution: [] };
      typeBlock = `<section><h3>Puzzle</h3>
          ${field("Options", `<textarea id="nOpts" rows="4" class="mono">${esc(pz.options.map((o) => `${o.id} | ${o.label}`).join("\n"))}</textarea>`, { hint: "One per line: id | label" })}
          ${field("Solution", `<input id="nSol" value="${esc(pz.solution.join(", "))}" />`, { hint: "Option ids in the right order, separated by commas" })}
          <div class="grid-2">
            ${field("Answer key (designer only)", `<textarea id="nHint" rows="2">${esc(pz.hint ?? "")}</textarea>`)}
            ${field("Nudge after the first miss", `<textarea id="nNudge" rows="2">${esc(pz.nudge ?? "")}</textarea>`)}
            ${field("Misses before the penalty", `<input id="nFails" type="number" min="0" value="${esc(pz.maxFailsBeforePenalty ?? "")}" />`)}
            ${field("Reset on a miss", `<select id="nReset"><option value="0">No</option><option value="1" ${pz.resetOnFail ? "selected" : ""}>Yes</option></select>`)}
          </div>
        </section>
        ${outcomeBlock(view, "onSuccess", node.onSuccess, "When solved")}
        ${outcomeBlock(view, "onFailure", node.onFailure, "On the penalty")}`;
    } else if (node.type === "encounter") {
      typeBlock = `<section><h3>Fight</h3><div class="grid-2">
          ${field("Encounter", `<select id="nEnc"><option value="">—</option>${view.encounters.map((e) => `<option value="${esc(e.id)}" ${e.id === node.encounterId ? "selected" : ""}>${esc(e.name)} · ${esc(e.id)}</option>`).join("")}</select>`)}
          ${field("After victory", `<select id="nWin">${nodeOptions(view, node.onVictory)}</select>`)}
        </div></section>
        ${
          encounter
            ? `<section><h3>Encounter ${esc(encounter.id)} · shared by every node that uses it</h3>
            <div class="grid-2">
              ${field("Name", `<input id="eName" value="${esc(encounter.name)}" />`)}
              ${field("Map", `<select id="eMap">${view.maps.map((m) => `<option value="${esc(m.id)}" ${m.id === encounter!.mapId ? "selected" : ""}>${esc(m.name)} · ${esc(m.id)}</option>`).join("")}</select>`, { hint: `<a href="#/maps">Paint maps</a>` })}
            </div>
            ${field("Opening narration", `<textarea id="eIntro" rows="2">${esc(encounter.intro ?? "")}</textarea>`)}
            ${field("Closing narration", `<textarea id="eOutro" rows="2">${esc(encounter.outro ?? "")}</textarea>`)}
            <div class="grid-3">
              ${["1", "2", "3"].map((n) => field(`${n} player${n === "1" ? "" : "s"}`, `<textarea id="eScale${n}" rows="3" class="mono">${esc(scalingText(encounter, n))}</textarea>`)).join("")}
            </div>
            <p class="faint" style="margin:0">One monster per line: <code>monster_id count</code>, optional <code>hp=N</code>. Known: ${view.monsters.map((m) => `<code>${esc(m.id)}</code>`).join(" ")}</p>
          </section>`
            : ""
        }`;
    } else if (node.type === "hub") {
      typeBlock = `<section><h3>Exits the server adds</h3>
        <div class="notice info">A hub builds its choices from the party's flags at runtime. These exits are part of the rules, so they are listed here but edited in code.</div>
        <table class="data"><tbody>${view.hubExits.map((x) => `<tr><td><a href="#" data-goto="${esc(x.next)}" class="mono">${esc(x.next)}</a></td><td>${esc(x.label)}</td><td class="faint">${esc(x.when)}</td></tr>`).join("")}</tbody></table>
      </section>`;
    }
    const artChoices = [...view.art.map((a) => ({ ...a, mine: true })), ...view.builtinArt.map((a) => ({ ...a, mine: false }))];
    box.innerHTML = `
      <header>
        ${typeBadge(node.type)}<h2 class="mono" style="flex:1">${esc(node.id)}</h2>
        <span class="faint" id="nDirty"></span>
      </header>
      <div class="body stack">
        ${problems.length ? `<div class="stack">${problems.map((p) => `<div class="notice ${p.level === "error" ? "bad" : "warn"}">${esc(p.detail)}</div>`).join("")}</div>` : ""}
        <div class="tabs" role="tablist">
          ${[
            ["content", "Content"],
            ["scene", "Scene & image"],
            ["links", `Links (${summary?.links.length ?? 0} out · ${summary?.incoming.length ?? 0} in)`],
            ["json", "JSON"],
          ]
            .map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" class="${tab === k ? "on" : ""}">${l}</button>`)
            .join("")}
        </div>
        <div data-panel="content" ${tab === "content" ? "" : "hidden"} class="stack">
          <section>
            ${field("Narration", `<textarea id="nText" rows="6">${esc(node.narration?.text ?? "")}</textarea>`, { hint: "Spoken lines: <code>[[cast_id: What they say.]]</code>. Everything else is the narrator." })}
            <div class="grid-3">
              ${field("Speaker portrait", `<select id="nSpeaker"><option value="">Narrator</option>${view.cast.map((c) => `<option value="${esc(c.id)}" ${node.speaker?.id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>`)}
              ${field("Music & lights", `<select id="nAlexa"><option value="">Default</option>${SCENES.map((s) => `<option ${node.alexaScene === s ? "selected" : ""}>${s}</option>`).join("")}</select>`)}
              ${field("Offer a save here", `<select id="nSavePrompt"><option value="0">No</option><option value="1" ${node.savePrompt ? "selected" : ""}>Yes</option></select>`)}
            </div>
          </section>
          ${typeBlock}
          ${choicesBlock}
        </div>
        <div data-panel="scene" ${tab === "scene" ? "" : "hidden"} class="stack">
          <div class="scene-preview" id="nPreview" style="background-image:url('${esc(scene.art)}')"><div class="cap"><small id="nPrevChapter">${esc(scene.chapter)}</small><b id="nPrevTitle">${esc(scene.title)}</b></div></div>
          <div class="grid-3">
            ${field("Title", `<input id="nSceneTitle" value="${esc(node.scene?.title ?? "")}" placeholder="${esc(sceneForNode(node.id).title)}" />`, { hint: "Empty uses the built-in title" })}
            ${field("Chapter", `<input id="nSceneChapter" value="${esc(node.scene?.chapter ?? "")}" placeholder="${esc(sceneForNode(node.id).chapter)}" />`)}
            ${field("Tone", `<select id="nSceneTone"><option value="">Built-in (${esc(sceneForNode(node.id).tone)})</option>${TONES.map((t) => `<option ${node.scene?.tone === t ? "selected" : ""}>${t}</option>`).join("")}</select>`)}
          </div>
          <input type="hidden" id="nSceneArt" value="${esc(node.scene?.art ?? "")}" />
          <section>
            <h3>Background image</h3>
            <div class="row">
              <input type="file" id="nUpload" accept="image/png,image/jpeg,image/webp" />
              <button type="button" id="nUploadGo">Upload to this campaign</button>
              <button type="button" class="ghost" id="nArtClear">Use the built-in image</button>
            </div>
            <p class="faint" style="margin:0">Uploads go to the draft's art folder and ship with the next publish. 16:9, at least 1280×720, under 8 MB.</p>
            <div class="thumbs" id="nThumbs">${artChoices
              .map(
                (a) => `<div class="stack" style="gap:4px"><button type="button" class="thumb${node.scene?.art === a.url ? " on" : ""}" data-art="${esc(a.url)}"><img src="${esc(a.url)}" alt="" loading="lazy" /><span>${a.mine ? "Uploaded · " : "Built-in · "}${esc(a.name)}${a.bytes ? ` · ${fmtBytes(a.bytes)}` : ""}</span></button>${a.mine ? `<button type="button" class="sm danger" data-art-del="${esc(a.name)}">Delete image</button>` : ""}</div>`,
              )
              .join("")}</div>
          </section>
        </div>
        <div data-panel="links" ${tab === "links" ? "" : "hidden"} class="grid-2">
          <section><h3>Leads to</h3><div class="links">${(summary?.links ?? [])
            .map((l) => `<span class="link">${badge(l.via)} <a href="#" data-goto="${esc(l.to)}">${esc(l.to)}</a> <span class="faint">${esc(l.label)}</span></span>`)
            .join("") || `<span class="faint">Nothing. Players stop here unless it is an ending.</span>`}</div></section>
          <section><h3>Reached from</h3><div class="links">${(summary?.incoming ?? [])
            .map((from) => `<span class="link"><a href="#" data-goto="${esc(from)}">${esc(from)}</a></span>`)
            .join("") || `<span class="faint">${node.id === getView().manifest.startNodeId ? "This is the start node." : "No node links here."}</span>`}</div></section>
        </div>
        <div data-panel="json" ${tab === "json" ? "" : "hidden"} class="stack">
          <div class="notice info">Raw draft JSON for fields the form does not show. Apply checks it, then Save writes it.</div>
          ${field("Node", `<textarea id="nJson" class="code" spellcheck="false"></textarea>`)}
          ${encounter ? field("Encounter", `<textarea id="eJson" class="code" spellcheck="false" style="min-height:160px"></textarea>`) : ""}
          <div><button type="button" id="nJsonApply">Apply JSON to the form</button></div>
        </div>
      </div>
      <footer class="row" style="padding:12px 16px;border-top:1px solid var(--border)">
        <button type="button" class="danger" id="nDelete">Delete node…</button>
        <span class="spacer"></span>
        <button type="button" id="nRevert">Revert</button>
        <button type="button" class="primary" id="nSave" disabled>Save to draft</button>
      </footer>`;
    wire();
  };

  const collect = (): { node: StoryNode; encounter: Encounter | null } => {
    const q = <T extends HTMLElement>(sel: string) => box.querySelector<T>(sel);
    const val = (sel: string) => (q<HTMLInputElement>(sel)?.value ?? "").trim();
    const next: StoryNode = structuredClone(node);
    const text = q<HTMLTextAreaElement>("#nText")?.value ?? "";
    next.narration = { text };
    const sp = val("#nSpeaker");
    const cast = getView().cast.find((c) => c.id === sp);
    if (sp) next.speaker = { id: sp, name: cast?.name ?? sp };
    else delete next.speaker;
    const alexa = val("#nAlexa");
    if (alexa) next.alexaScene = alexa;
    else delete next.alexaScene;
    if (val("#nSavePrompt") === "1") next.savePrompt = true;
    else delete next.savePrompt;
    if (next.type !== "hub" && q("#nChoices")) {
      next.choices = [...box.querySelectorAll<HTMLElement>("[data-choice]")].map((el, i) => {
        const k = (key: string) => el.querySelector<HTMLInputElement>(`[data-k="${key}"]`)?.value.trim() ?? "";
        const c: Choice = { id: k("id") || `choice_${i + 1}`, label: k("label"), next: k("next") };
        const flags = list(k("flagsSet"));
        const req = list(k("requireFlags"));
        const exc = list(k("excludeFlags"));
        if (flags.length) c.flagsSet = flags;
        if (req.length) c.requireFlags = req;
        if (exc.length) c.excludeFlags = exc;
        return c;
      });
    }
    box.querySelectorAll<HTMLElement>("[data-outcome]").forEach((sec) => {
      const key = sec.dataset.outcome as "onSuccess" | "onFailure";
      const k = (n: string) => sec.querySelector<HTMLInputElement>(`[data-k="${n}"]`)?.value.trim() ?? "";
      const o: Outcome = { ...(next[key] ?? {}) };
      const t = sec.querySelector<HTMLTextAreaElement>(`[data-k="text"]`)?.value ?? "";
      if (t.trim()) o.narration = { text: t };
      else delete o.narration;
      o.next = k("next");
      const flags = list(k("flagsSet"));
      if (flags.length) o.flagsSet = flags;
      else delete o.flagsSet;
      next[key] = o as never;
    });
    if (next.type === "skill_check") {
      next.check = { ...(next.check ?? { ability: "wis", dc: 12 }), ability: val("#nAbility"), dc: Number(val("#nDc")) };
      const skill = val("#nSkill");
      if (skill) next.check.skill = skill;
      else delete next.check.skill;
    }
    if (next.type === "puzzle") {
      const options = (q<HTMLTextAreaElement>("#nOpts")?.value ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [oid, ...rest] = l.split("|");
          const idPart = (oid ?? "").trim();
          return { id: idPart, label: rest.join("|").trim() || idPart };
        });
      next.puzzle = { ...(next.puzzle ?? { kind: "sequence", options: [], solution: [] }), kind: "sequence", options, solution: list(val("#nSol")) };
      const hint = q<HTMLTextAreaElement>("#nHint")?.value.trim() ?? "";
      const nudge = q<HTMLTextAreaElement>("#nNudge")?.value.trim() ?? "";
      if (hint) next.puzzle.hint = hint;
      else delete next.puzzle.hint;
      if (nudge) next.puzzle.nudge = nudge;
      else delete next.puzzle.nudge;
      const fails = val("#nFails");
      if (fails) next.puzzle.maxFailsBeforePenalty = Number(fails);
      else delete next.puzzle.maxFailsBeforePenalty;
      if (val("#nReset") === "1") next.puzzle.resetOnFail = true;
      else delete next.puzzle.resetOnFail;
    }
    let enc = encounter ? structuredClone(encounter) : null;
    if (next.type === "encounter") {
      next.encounterId = val("#nEnc");
      next.onVictory = val("#nWin");
      if (enc && enc.id === next.encounterId && q("#eName")) {
        enc.name = val("#eName");
        enc.mapId = val("#eMap");
        const intro = q<HTMLTextAreaElement>("#eIntro")?.value.trim() ?? "";
        const outro = q<HTMLTextAreaElement>("#eOutro")?.value.trim() ?? "";
        if (intro) enc.intro = intro;
        else delete enc.intro;
        if (outro) enc.outro = outro;
        else delete enc.outro;
        for (const n of ["1", "2", "3"]) {
          const groups = parseScaling(q<HTMLTextAreaElement>(`#eScale${n}`)?.value ?? "");
          if (groups.length) enc.scaling[n] = groups;
          else delete enc.scaling[n];
        }
      } else if (enc && enc.id !== next.encounterId) enc = null;
    }
    const scene: NonNullable<StoryNode["scene"]> = {};
    const st = val("#nSceneTitle");
    const sc = val("#nSceneChapter");
    const sa = val("#nSceneArt");
    const tone = val("#nSceneTone") as NonNullable<StoryNode["scene"]>["tone"] | "";
    if (st) scene.title = st;
    if (sc) scene.chapter = sc;
    if (sa) scene.art = sa;
    if (tone) scene.tone = tone;
    if (Object.keys(scene).length) next.scene = scene;
    else delete next.scene;
    return { node: next, encounter: enc };
  };

  const preview = () => {
    const { node: n } = collect();
    const s = sceneForNode(n.id, n.scene ?? null);
    const pv = box.querySelector<HTMLElement>("#nPreview");
    if (pv) pv.style.backgroundImage = `url('${s.art}')`;
    box.querySelector("#nPrevTitle")!.textContent = s.title;
    box.querySelector("#nPrevChapter")!.textContent = s.chapter;
  };

  const wire = () => {
    box.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) =>
      b.addEventListener("click", () => {
        if (tab !== "json" && b.dataset.tab === "json") {
          const c = collect();
          box.querySelector<HTMLTextAreaElement>("#nJson")!.value = JSON.stringify(c.node, null, 2);
          const ej = box.querySelector<HTMLTextAreaElement>("#eJson");
          if (ej) ej.value = JSON.stringify(c.encounter, null, 2);
        }
        tab = b.dataset.tab!;
        box.querySelectorAll<HTMLElement>("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== tab));
        box.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((t) => t.classList.toggle("on", t === b));
      }),
    );
    if (tab === "json") {
      box.querySelector<HTMLTextAreaElement>("#nJson")!.value = JSON.stringify(node, null, 2);
      const ej = box.querySelector<HTMLTextAreaElement>("#eJson");
      if (ej) ej.value = JSON.stringify(encounter, null, 2);
    }
    box.querySelector(".body")!.addEventListener("input", (ev) => {
      const t = ev.target as HTMLElement;
      if (t.id === "nJson" || t.id === "eJson") {
        markDirty();
        return;
      }
      markDirty();
      if (t.id.startsWith("nScene")) preview();
    });
    box.querySelector(".body")!.addEventListener("change", (ev) => {
      const t = ev.target as HTMLElement;
      if (t.id === "nUpload") return;
      markDirty();
      if (t.id === "nEnc") {
        node = collect().node;
        encounter = null;
        paint();
        markDirty();
        toast("info", "Encounter switched", "Save the node, then reopen it to edit that encounter's monsters.");
        return;
      }
      if (t.id.startsWith("nScene")) preview();
    });
    box.querySelectorAll<HTMLElement>("[data-goto]").forEach((a) =>
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        void goto(a.dataset.goto!);
      }),
    );
    box.querySelector("#nAddChoice")?.addEventListener("click", () => {
      const c = collect();
      node = c.node;
      encounter = c.encounter ?? encounter;
      node.choices = [...(node.choices ?? []), { id: `choice_${Date.now().toString(36)}`, label: "", next: "" }];
      paint();
      markDirty();
      box.querySelector<HTMLInputElement>(`[data-choice="${node.choices.length - 1}"] [data-k="label"]`)?.focus();
    });
    box.querySelector("#nChoices")?.addEventListener("click", (ev) => {
      const t = ev.target as HTMLElement;
      const item = t.closest<HTMLElement>("[data-choice]");
      if (!item) return;
      const i = Number(item.dataset.choice);
      const c = collect();
      node = c.node;
      const choices = [...(node.choices ?? [])];
      if (t.closest("[data-remove]")) choices.splice(i, 1);
      else if (t.closest("[data-move]")) {
        const j = i + Number(t.closest<HTMLElement>("[data-move]")!.dataset.move);
        if (j < 0 || j >= choices.length) return;
        [choices[i], choices[j]] = [choices[j]!, choices[i]!];
      } else return;
      node.choices = choices;
      paint();
      markDirty();
    });
    box.querySelector("#nThumbs")!.addEventListener("click", async (ev) => {
      const t = ev.target as HTMLElement;
      const del = t.closest<HTMLButtonElement>("[data-art-del]");
      if (del) {
        const name = del.dataset.artDel!;
        const ok = await confirmDialog({ title: `Delete ${name}?`, body: "<p>Nodes that use it fall back to their built-in image after the next publish.</p>", confirm: "Delete image", danger: true });
        if (!ok) return;
        const out = await write(del, `Image ${name} deleted`, () => api<{ art: Art[] }>(`${base}/art/${encodeURIComponent(name)}`, { method: "DELETE" }), undefined, "Draft saved");
        if (out) {
          const c = collect();
          node = c.node;
          await onView({ ...getView(), art: out.art });
          paint();
        }
        return;
      }
      const pick = t.closest<HTMLButtonElement>("[data-art]");
      if (!pick) return;
      box.querySelector<HTMLInputElement>("#nSceneArt")!.value = pick.dataset.art!;
      box.querySelectorAll(".thumb").forEach((el) => el.classList.toggle("on", el === pick));
      markDirty();
      preview();
    });
    box.querySelector("#nArtClear")!.addEventListener("click", () => {
      box.querySelector<HTMLInputElement>("#nSceneArt")!.value = "";
      box.querySelectorAll(".thumb").forEach((el) => el.classList.remove("on"));
      markDirty();
      preview();
    });
    box.querySelector("#nUploadGo")!.addEventListener("click", async (ev) => {
      const file = box.querySelector<HTMLInputElement>("#nUpload")!.files?.[0];
      if (!file) {
        toast("warn", "Pick an image file first");
        return;
      }
      const out = await write(
        ev.currentTarget as HTMLButtonElement,
        `Image ${file.name} uploaded`,
        () => api<Art>(`${base}/art?name=${encodeURIComponent(file.name)}`, { raw: file, contentType: file.type || "image/png" }),
        (o) => `${o.name}, ${fmtBytes(o.bytes ?? 0)}. Selected for this node; save to keep it.`,
        "Image saved to the draft",
      );
      if (!out) return;
      const c = collect();
      node = c.node;
      encounter = c.encounter ?? encounter;
      node.scene = { ...(node.scene ?? {}), art: out.url };
      const view = getView();
      await onView({ ...view, art: [...view.art.filter((a) => a.name !== out.name), out].sort((a, b) => a.name.localeCompare(b.name)) });
      paint();
      markDirty();
    });
    box.querySelector("#nJsonApply")?.addEventListener("click", () => {
      try {
        const parsed = JSON.parse(box.querySelector<HTMLTextAreaElement>("#nJson")!.value) as StoryNode;
        if (parsed.id !== node.id) throw new Error(`The id must stay "${node.id}".`);
        const ej = box.querySelector<HTMLTextAreaElement>("#eJson");
        if (ej) encounter = JSON.parse(ej.value) as Encounter | null;
        node = parsed;
        tab = "content";
        paint();
        markDirty();
        toast("info", "JSON applied to the form", "Not saved yet. Press Save to draft.");
      } catch (err) {
        toast("bad", "That JSON cannot be applied", esc(err instanceof Error ? err.message : String(err)));
      }
    });
    box.querySelector("#nRevert")!.addEventListener("click", () => {
      node = loaded.node;
      encounter = loaded.encounter;
      editorDirty = false;
      paint();
    });
    box.querySelector("#nSave")!.addEventListener("click", async (ev) => {
      let body: { node: StoryNode; encounter: Encounter | null };
      if (tab === "json") {
        try {
          const ej = box.querySelector<HTMLTextAreaElement>("#eJson");
          body = { node: JSON.parse(box.querySelector<HTMLTextAreaElement>("#nJson")!.value) as StoryNode, encounter: ej ? (JSON.parse(ej.value) as Encounter | null) : null };
        } catch (err) {
          toast("bad", "That JSON is not valid", esc(err instanceof Error ? err.message : String(err)));
          return;
        }
      } else body = collect();
      const out = await write(
        ev.currentTarget as HTMLButtonElement,
        `Node ${node.id}`,
        () => api<View>(`${base}/nodes/${encodeURIComponent(node.id)}`, { method: "PUT", body }),
        () => "Players see it after you publish",
        "Saved to the draft",
      );
      if (!out) return;
      editorDirty = false;
      loaded = { node: body.node, encounter: body.encounter ?? loaded.encounter };
      node = body.node;
      encounter = body.encounter ?? encounter;
      await onView(out);
      paint();
    });
    box.querySelector("#nDelete")!.addEventListener("click", async (ev) => {
      const view = getView();
      const incoming = view.nodes.find((n) => n.id === node.id)?.incoming ?? [];
      if (incoming.length) {
        toast("warn", "Other nodes still link here", esc(`Change the links in ${incoming.join(", ")} first.`));
        return;
      }
      const ok = await confirmDialog({ title: `Delete node ${node.id}?`, body: "<p>It is removed from the draft. Published versions keep it until you publish again.</p>", confirm: "Delete node", danger: true });
      if (!ok) return;
      const out = await write(ev.currentTarget as HTMLButtonElement, `Node ${node.id} deleted`, () => api<View>(`${base}/nodes/${encodeURIComponent(node.id)}`, { method: "DELETE" }), undefined, "Draft saved");
      if (!out) return;
      editorDirty = false;
      await onView(out);
      await goto(out.manifest.startNodeId);
    });
  };

  paint();
}
