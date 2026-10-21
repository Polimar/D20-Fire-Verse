/**
 * Public Privacy Policy and Terms of Use (English, player-facing).
 */

const STYLE = `
  :root { color-scheme: dark; --bg:#121018; --ink:#f3ebe0; --mute:#b9a994; --line:#3a342c; --accent:#e8b86d; }
  * { box-sizing: border-box; }
  body { margin:0; font: 1.05rem/1.55 Georgia, "Times New Roman", serif; background: radial-gradient(1200px 600px at 20% -10%, #2a2433, var(--bg)); color: var(--ink); }
  main { max-width: 42rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
  a { color: var(--accent); }
  h1 { font-family: Cinzel, Georgia, serif; font-size: 1.85rem; margin: 0 0 0.35rem; }
  h2 { font-family: Cinzel, Georgia, serif; font-size: 1.2rem; margin: 1.75rem 0 0.5rem; }
  p, li { color: var(--ink); }
  .mute { color: var(--mute); font-size: 0.95rem; }
  .nav { display:flex; gap:1rem; flex-wrap:wrap; margin: 0 0 1.5rem; font-size: 0.95rem; }
  .box { border: 1px solid var(--line); border-radius: 10px; padding: 0.9rem 1rem; background: rgba(0,0,0,.22); margin: 1rem 0; }
  table { width:100%; border-collapse: collapse; font-size: 0.95rem; }
  th, td { text-align:left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--mute); font-weight: 600; }
`;

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · D20 FireVerse</title>
  <style>${STYLE}</style>
</head>
<body>
  <main>
    <nav class="nav">
      <a href="/">Table</a>
      <a href="/privacy">Privacy Policy</a>
      <a href="/terms">Terms of Use</a>
      <a href="/companion/">Companion</a>
    </nav>
    ${body}
  </main>
</body>
</html>`;
}

export function privacyPageHtml(): string {
  return page(
    "Privacy Policy",
    `
    <h1>Privacy Policy</h1>
    <p class="mute">Last updated: 21 October 2026 · Contact: <a href="mailto:privacy@d20fireverse.it">privacy@d20fireverse.it</a></p>
    <div class="box">
      <strong>Unofficial.</strong> D20 FireVerse is an independent project. It is not affiliated with, endorsed, or sponsored by Wizards of the Coast.
      Rules content is based on the System Reference Document (SRD) under Creative Commons Attribution 4.0. See
      <a href="https://github.com/d20-fireverse/D20-Fire-Verse/blob/main/ATTRIBUTION.md">ATTRIBUTION</a>.
    </div>

    <h2>Who we are</h2>
    <p>D20 FireVerse (“we”) runs the table at <strong>d20fireverse.it</strong>. For privacy requests write to
      <a href="mailto:privacy@d20fireverse.it">privacy@d20fireverse.it</a>.</p>

    <h2>What we collect</h2>
    <ul>
      <li><strong>Account:</strong> first name, last name, email, username, and a hashed password (never stored in plain text). When you accept the Terms and Privacy Policy we store the acceptance time.</li>
      <li><strong>Session:</strong> an httpOnly cookie named <code>fv_session</code> so you stay signed in. Login with Amazon may also set a short-lived technical state cookie.</li>
      <li><strong>Amazon (optional):</strong> if you use Login with Amazon, a stable Amazon user id and profile name so we can open your seat again.</li>
      <li><strong>Game data:</strong> heroes, stash, saves, and progress tied to your account.</li>
    </ul>

    <h2>Why we use it</h2>
    <p>To create and secure your account, send a one-time confirmation email, run the game, and keep your progress. We do not sell personal data.</p>

    <h2>Email</h2>
    <p>Confirmation mail is sent only when you create an account, through Brevo, from <code>noreply@d20fireverse.it</code>. We do not send marketing mail.</p>

    <h2>Voice and audio</h2>
    <p>Scene narration may be synthesized on our server (currently a local text-to-speech model). If companion microphone commands are enabled in a build, short utterances may be sent to automatic speech recognition (for example Amazon Transcribe when that path is wired). We do not keep permanent voice recordings beyond what is needed to process the command.</p>

    <h2>Who helps us process data</h2>
    <table>
      <thead><tr><th>Party</th><th>Role</th></tr></thead>
      <tbody>
        <tr><td>Table host (d20fireverse.it)</td><td>Runs the game and account database</td></tr>
        <tr><td>Brevo</td><td>Transactional confirmation email</td></tr>
        <tr><td>Amazon</td><td>Login with Amazon (when you choose it)</td></tr>
        <tr><td>AWS</td><td>Only if cloud voice (Transcribe/Polly) is enabled for that deploy</td></tr>
      </tbody>
    </table>

    <h2>Cookies</h2>
    <p>We use only technical cookies required for sign-in and security. There is no advertising or analytics cookie banner because we do not run marketing trackers.</p>

    <h2>Age</h2>
    <p>You must be at least <strong>16</strong> years old. Under 16 is not permitted unless a parent or guardian creates and supervises the account.</p>

    <h2>How long we keep data</h2>
    <p>Account and game data stay while the account exists. Sessions last until you sign out or the cookie expires. After a deletion request we remove personal data from the operational database within a reasonable time.</p>

    <h2>Your rights</h2>
    <p>You may ask for access, correction, or deletion of your account data by emailing
      <a href="mailto:privacy@d20fireverse.it">privacy@d20fireverse.it</a>, or via an admin on the table. We may need to verify that the request comes from the account holder.</p>

    <h2>Payments</h2>
    <p>There are no in-app payments today. If that changes, this policy will be updated before any charges.</p>

    <p class="mute"><a href="/terms">Terms of Use</a></p>
  `,
  );
}

export function termsPageHtml(): string {
  return page(
    "Terms of Use",
    `
    <h1>Terms of Use</h1>
    <p class="mute">Last updated: 21 October 2026 · Contact: <a href="mailto:privacy@d20fireverse.it">privacy@d20fireverse.it</a></p>
    <div class="box">
      <strong>Unofficial fan table.</strong> D20 FireVerse is not affiliated with, endorsed, or sponsored by Wizards of the Coast.
      Do not treat this service as an official product. Rules text we ship for play is based on the SRD under CC-BY 4.0 —
      see <a href="https://github.com/d20-fireverse/D20-Fire-Verse/blob/main/ATTRIBUTION.md">ATTRIBUTION</a>.
      We do not use the “Dungeons &amp; Dragons”, “D&amp;D”, or “Dungeon Master” trademarks as product names.
    </div>

    <h2>Agreement</h2>
    <p>By creating an account, signing in (including with Amazon), or using the table, you agree to these Terms and the
      <a href="/privacy">Privacy Policy</a>.</p>

    <h2>Age</h2>
    <p>You must be at least <strong>16</strong>. If you are under 16, a parent or guardian must create and supervise the account.</p>

    <h2>Your account</h2>
    <ul>
      <li>Keep your password private. You are responsible for activity under your account.</li>
      <li>Provide accurate registration details. Confirm your email when asked.</li>
      <li>One person per account; do not share seats in a way that breaks fair play.</li>
    </ul>

    <h2>Acceptable use</h2>
    <p>Do not attack the service, harass other players, upload unlawful content, or try to bypass room or admin controls.
      We may disable or delete accounts that abuse the table.</p>

    <h2>Game content</h2>
    <p>Campaign text, art, and code are provided for playing on this table. SRD-derived rules remain under their CC-BY terms with attribution.
      You may not scrape or redistribute the service as if it were an official Wizards product.</p>

    <h2>Service status</h2>
    <p>D20 FireVerse is an early / evolving product. Features may change, break, or reset. The service is provided <strong>as is</strong>, without warranties of uninterrupted play or preserved saves forever.</p>

    <h2>Contact</h2>
    <p><a href="mailto:privacy@d20fireverse.it">privacy@d20fireverse.it</a></p>

    <p class="mute"><a href="/privacy">Privacy Policy</a></p>
  `,
  );
}
