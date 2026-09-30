/**
 * Registration mail. The Brevo key lives in backend/data, set from the admin screen.
 * Mail is sent once, when a player confirms a new account — never for a game.
 */

import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths.js";

export type BrevoConfig = { apiKey: string; senderEmail: string; senderName: string };

const FILE = path.join(DATA_DIR, "brevo.json");
const PUBLIC_CONFIRM = "https://www.d20fireverse.it/api/confirm?token=";

export function confirmLink(token: string): string {
  return `${PUBLIC_CONFIRM}${encodeURIComponent(token)}`;
}

export function readBrevo(): BrevoConfig | null {
  if (!fs.existsSync(FILE)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as Partial<BrevoConfig>;
    const apiKey = String(raw.apiKey ?? "").trim();
    const senderEmail = String(raw.senderEmail ?? "").trim();
    const senderName = String(raw.senderName ?? "").trim() || "D20 FireVerse";
    if (!apiKey || !senderEmail) return null;
    return { apiKey, senderEmail, senderName };
  } catch {
    return null;
  }
}

export function writeBrevo(next: BrevoConfig): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const prev = readBrevo();
  const apiKey = next.apiKey.trim() || prev?.apiKey || "";
  const senderEmail = next.senderEmail.trim();
  const senderName = next.senderName.trim() || "D20 FireVerse";
  if (!apiKey || !senderEmail) throw new Error("MAIL_NOT_CONFIGURED");
  fs.writeFileSync(FILE, JSON.stringify({ apiKey, senderEmail, senderName }, null, 2));
}

export function brevoStatus(): { configured: boolean; senderEmail: string; senderName: string; keyHint: string } {
  const cfg = readBrevo();
  if (!cfg) return { configured: false, senderEmail: "", senderName: "D20 FireVerse", keyHint: "" };
  return {
    configured: true,
    senderEmail: cfg.senderEmail,
    senderName: cfg.senderName,
    keyHint: cfg.apiKey.length > 4 ? `••••${cfg.apiKey.slice(-4)}` : "••••",
  };
}

export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const cfg = readBrevo();
  if (!cfg) throw new Error("MAIL_NOT_CONFIGURED");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": cfg.apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: cfg.senderName, email: cfg.senderEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) throw new Error("MAIL_FAILED");
}

export function confirmationLetter(token: string): { subject: string; html: string } {
  const link = confirmLink(token);
  return {
    subject: "Confirm your D20 FireVerse account",
    html: `<p>Confirm your seat at the table.</p><p><a href="${link}">${link}</a></p><p>This note is only for creating the account. The game itself will not email you.</p>`,
  };
}
