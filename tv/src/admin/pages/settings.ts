import type { Page } from "../types";
import { api, badge, confirmDialog, esc, field, toast, write } from "../ui";

type Brevo = { configured: boolean; senderEmail: string; senderName: string; keyHint: string };
type Amazon = { configured: boolean; clientId: string; secretHint: string };

export const mailPage: Page = {
  id: "mail",
  label: "Mail (Brevo)",
  group: "Settings",
  async render(host, ctx) {
    const paint = (s: Brevo) => {
      host.innerHTML = `<div class="page">
        <div class="page-head"><div class="titles"><h1>Registration mail</h1><p>Brevo sends one message when someone creates an account. Nothing else is ever mailed. The key is stored on this server only.</p></div></div>
        <div class="card">
          <header><h2>Brevo</h2>${s.configured ? badge("Sending", "ok") : badge("Not configured", "warn")}</header>
          <form class="body stack" id="mailForm">
            ${field("API key", `<input name="apiKey" type="password" autocomplete="off" placeholder="${esc(s.keyHint || "xkeysib-…")}" />`, { hint: s.keyHint ? `Saved key ends in <code>${esc(s.keyHint)}</code>. Leave blank to keep it.` : "Brevo → SMTP & API → API keys" })}
            <div class="grid-2">
              ${field("Sender email", `<input name="senderEmail" type="email" required autocomplete="off" value="${esc(s.senderEmail)}" />`, { hint: "Must be a verified sender in Brevo" })}
              ${field("Sender name", `<input name="senderName" autocomplete="off" value="${esc(s.senderName)}" placeholder="D20 FireVerse" />`)}
            </div>
            <div class="row">
              <button type="submit" class="primary">Save settings</button>
              <span class="spacer"></span>
              <input name="to" type="email" placeholder="Test recipient (default: sender)" style="width:260px" />
              <button type="button" id="mailTest" ${s.configured ? "" : "disabled"}>Send a test</button>
            </div>
          </form>
        </div>
      </div>`;
      const form = host.querySelector<HTMLFormElement>("#mailForm")!;
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const f = new FormData(form);
        const out = await write(form.querySelector<HTMLButtonElement>("button[type=submit]"), "Mail settings", () =>
          api<Brevo>("/api/admin/brevo", { body: { apiKey: f.get("apiKey"), senderEmail: f.get("senderEmail"), senderName: f.get("senderName") } }),
          (o) => (o.configured ? "registration mail is on" : "still missing a key"),
          "Saved on the server",
        );
        if (out && ctx.isCurrent()) paint(out);
      });
      host.querySelector("#mailTest")!.addEventListener("click", async (ev) => {
        const to = String(new FormData(form).get("to") ?? "").trim();
        await write(ev.currentTarget as HTMLButtonElement, `Test mail sent to ${to || s.senderEmail}`, () => api("/api/admin/brevo/test", { body: to ? { to } : {} }), () => "check the inbox and the spam folder", "Mail sent");
      });
    };
    const s = await api<Brevo>("/api/admin/brevo");
    if (ctx.isCurrent()) paint(s);
  },
};

export const amazonPage: Page = {
  id: "amazon",
  label: "Login with Amazon",
  group: "Settings",
  async render(host, ctx) {
    const paint = (s: Amazon) => {
      host.innerHTML = `<div class="page">
        <div class="page-head"><div class="titles"><h1>Login with Amazon</h1><p>The “Continue with Amazon” button on the sign-in screen. Paste the Client ID and Client Secret from the security profile's Web Settings. Changes apply on the next sign-in, without a restart.</p></div></div>
        <div class="card" style="margin-bottom:16px">
          <header><h2>Security profile</h2>${s.configured ? badge("On", "ok") : badge("Off", "warn")}</header>
          <form class="body stack" id="amzForm">
            <div class="grid-2">
              ${field("Client ID", `<input name="clientId" autocomplete="off" value="${esc(s.clientId)}" placeholder="amzn1.application-oa2-client…" />`)}
              ${field("Client Secret", `<input name="clientSecret" type="password" autocomplete="off" placeholder="${esc(s.secretHint || "Show Secret in the console, then paste")}" />`, { hint: s.secretHint ? "Leave blank to keep the saved secret." : "" })}
            </div>
            <div class="row">
              <button type="submit" class="primary">Save and turn on</button>
              <button type="button" id="amzTest">Test with Amazon</button>
              <span class="spacer"></span>
              ${s.configured ? `<button type="button" class="danger" id="amzOff">Turn off</button>` : ""}
            </div>
          </form>
        </div>
        <div class="card">
          <header><h2>Probe log</h2><button type="button" class="sm" id="amzCopy">Copy log</button></header>
          <div class="body"><textarea id="amzLog" class="code" readonly spellcheck="false" style="min-height:200px" placeholder="Test writes Amazon's answers here. Nothing is saved."></textarea></div>
        </div>
      </div>`;
      const form = host.querySelector<HTMLFormElement>("#amzForm")!;
      const body = () => {
        const f = new FormData(form);
        return { clientId: f.get("clientId"), clientSecret: f.get("clientSecret") };
      };
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const out = await write(form.querySelector<HTMLButtonElement>("button[type=submit]"), "Login with Amazon", () => api<Amazon>("/api/admin/amazon", { body: body() }), (o) =>
          o.configured ? "the button is live on the sign-in screen" : "still off: both fields are needed",
          "Saved on the server",
        );
        if (out && ctx.isCurrent()) paint(out);
      });
      host.querySelector("#amzTest")!.addEventListener("click", async (ev) => {
        const log = host.querySelector<HTMLTextAreaElement>("#amzLog")!;
        log.value = "Asking Amazon…";
        const b = ev.currentTarget as HTMLButtonElement;
        b.disabled = true;
        try {
          const report = await api<{ ok: boolean; lines: string[] }>("/api/admin/amazon/test", { body: body() });
          log.value = report.lines.join("\n");
          if (report.ok) toast("ok", "Amazon accepted the id, secret, and profile scope", "Save to turn the button on.");
          else toast("bad", "Amazon refused the check", "Read or copy the probe log.");
        } catch (err) {
          log.value = String(err instanceof Error ? err.message : err);
          toast("bad", "The test could not run", esc(log.value));
        } finally {
          b.disabled = false;
        }
      });
      host.querySelector("#amzCopy")!.addEventListener("click", async () => {
        const log = host.querySelector<HTMLTextAreaElement>("#amzLog")!;
        if (!log.value) {
          toast("warn", "Run the test first");
          return;
        }
        try {
          await navigator.clipboard.writeText(log.value);
          toast("ok", "Log copied");
        } catch {
          log.focus();
          log.select();
          toast("warn", "Clipboard blocked", "The log is selected. Copy it with Ctrl+C.");
        }
      });
      host.querySelector("#amzOff")?.addEventListener("click", async (ev) => {
        const ok = await confirmDialog({
          title: "Turn off Login with Amazon?",
          body: "<p>The button disappears from the sign-in screen and the saved id and secret are removed from this server. Players who only sign in with Amazon are locked out until it is back on.</p>",
          confirm: "Turn off",
          danger: true,
        });
        if (!ok) return;
        const out = await write(ev.currentTarget as HTMLButtonElement, "Login with Amazon turned off", () => api<Amazon>("/api/admin/amazon", { body: { off: true } }), undefined, "Saved on the server");
        if (out && ctx.isCurrent()) paint(out);
      });
    };
    const s = await api<Amazon>("/api/admin/amazon");
    if (ctx.isCurrent()) paint(s);
  },
};
