# Arena (PvP)

Internet-ready tables beside Campaign. The television is the table; phones are seats.

## Modes

- **FFA:** `ffa_1v1`, `ffa_3`, `ffa_4`, `ffa_5`, `ffa_6`. Last fighter standing. **0 HP is elimination** (no death saves).
- **Teams:** `teams_2v2`, `teams_3v3`. Players pick A or B in the lobby. Start requires a full, even roster. Downed heroes use campaign death saves; the team is out when every member is dead.

A simultaneous wipe of every remaining fighter is a **draw**.

## PvE 1v1

`pve_1v1` seats one hero against one SRD monster (stat blocks from `content/srd/monsters-A-Z.md`). Same lobby → Ready → fight → 30s hero swap loop as a duel. **0 HP eliminates the hero** (no death saves). The monster uses campaign AI plus Multiattack, recharge, save actions, mapped `spell_*` ids, and legendary actions after the hero's turn.

The create form filters the roster by **name** and **CR**. Default foe is the first catalog id whose CR fits the room level (L1 ≤ 1/4, L2 ≤ 1, L3 ≤ 2). Unique traits outside Pack Tactics / Legendary Resistance / Magic Resistance are not simulated. Large creatures still occupy one cell.

Monster portraits live at `/art/portraits/{monsterId}.webp`.


## Flow

Lobby → Ready (full roster) → `START_ARENA` → fight → one-line result → **30s hero swap** → lobby Ready again.

No campaign rest, story graph, or save/continue. Mid-fight **REJOIN** still works. A dropped seat Dodges and skips its turn; that is not a win.

## Maps

Host picks **theme** and **size** (`small` 16×16, `medium` 24×24, `large` 32×32). Art: `tv/public/art/arena/{theme}-{size}.svg`. JSON: `content/arenas/arena_{theme}_{size}.json`. Regenerate with `node backend/scripts/gen-arena-art.mjs`.

## Network (single public process)

Set `FIREVERSE_PUBLIC_URL` in the repo `.env` (see `.env.example`) to the HTTPS origin (no trailing slash), for example `https://play.example.com`. On this VPS without TLS, use `http://<public-ipv4>:3100`. `/api/table-info` and companion QR then use that URL instead of a LAN IP. Sit Express+WSS on that host; session cookies get `Secure` only on HTTPS (`X-Forwarded-Proto`). One always-on instance is v1.

Restart after changing `.env`: `fuser -k 3100/tcp` then `npm run build && npm run dev:backend`.

Smoke: two homes, one public arena in the list or join by the six-letter code, complete a 1v1 on TV + two companions.

## Scoring (later)

`POST /api/friends` `{ username }`, `POST /api/friends/accept` `{ userId }`, `GET /api/friends`, `GET /api/arena/leaderboard?scope=global|friends`. Match rows are stored as simple W-L from `finishArena`. No Elo until you choose a scoring model. Friends-online is not in the lobby UI in v1.
