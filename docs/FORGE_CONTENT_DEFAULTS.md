# Forge content defaults (PG Builder V2)

## Choice: idempotent DB seed (not JSON defaults)

The builder reads **only** catalog rows with `inPlay` (admin `content_flags.enabled = 1`, valid SRD parse, review not blocked).

On each server boot, `mountAccountRoutes` calls `ensureForgeContentDefaults()` in `backend/src/local/content-catalog.ts`:

```sql
INSERT INTO content_flags (kind, entry_id, enabled) VALUES (?, ?, 1)
ON CONFLICT(kind, entry_id) DO NOTHING
```

For every valid `class`, `species`, `background`, `feat`, `spell`, and `item` whose review status allows play (`auto_ok`, `resolved`, or `none`).

### Why this approach

| Approach | Pros | Cons |
|----------|------|------|
| **Idempotent seed (chosen)** | Fresh prod/staging tables are forge-ready; admin disable is respected forever; no second source of truth | Existing DBs with empty flags get a one-time enable on next deploy |
| Hard-code `enabled: true` in JSON | No DB | Fights admin workflow; merge conflicts on content pack |
| Manual admin only | Purest | Prod was empty → “Builder unavailable” |

Admin overrides stay authoritative: if a keeper sets **fighter** off, the row exists with `enabled = 0` and the seed does not insert again.

### Manual recovery

Admin portal → **Content** → enable at least one **class** and one **background** (plus species / feats / spells as needed). Or redeploy on a new database to run the stock-in again.
