# Mechanics backlog (Missing mechanic queue)

Shared design specs for clearing the admin **Missing mechanic (combat)** queue. Nothing is **Enabled for players** until `missingMechanic` is false (`inPlay` in [`content-catalog.ts`](../backend/src/local/content-catalog.ts)).

**Measure progress:** `npm run content:gap-report` (same totals as Admin → Content).

## Progress

| Date | Commit / batch | Missing total | Δ | spell | item | monster | Note |
|------|----------------|---------------|---|-------|------|---------|------|
| 2026-10-16 | baseline design | 556 | — | 188 | 198 | 170 | Design sessions batches 1–5 |
| 2026-10-16 | implement-1 (wave 1) | 550 | -6 | 185 | 195 | 170 | mark, bane, haste/speed, slaying, staff, monster gap rule |
| | implement-2 | | | | | | |
| | implement-2 | | | | | | |

Re-run `npm run content:gap-report -- --append-progress` to insert a snapshot row above **implement-1** (optional).

## Primitive index

| ID | Status | Summary |
|----|--------|---------|
| P-mark-damage | ready | Hunter's Mark +1d6 force / Hex +1d6 necrotic on hit vs marked target; one mark active |
| P-mark-retarget | ready | BA retarget mark when marked creature dies; same concentration |
| P-mark-disadv | ready | Hex: chosen ability → disadvantage on checks when skill nodes exist |
| P-drink-haste-growth | ready | Potions mirror wired haste/enlarge; 10 min → PC turns; no lethargy on speed potion |
| P-slaying-ammo | ready | On hit CON DC 17; fail 6d10 / success 3d10 force; no creature-type table |
| P-ammo-stash | ready | Track magic ammo only; mundane infinite with bow/crossbow |
| P-note-spells | ready | All ~186 `note` spells need battlefield effect before enable |
| P-animated-shield | ready | BA; +2 AC 10 PC turns |
| P-cloak-invisibility | ready | Like invisibility_drink; max 1 h → PC turns |
| P-wand-staff-cast | ready | Magic action; item charge not slot |
| P-wand-charges | ready | Charges per fight; reset new fight |
| P-scroll | ready | Class list only; V; destroyed on use; DC 10+level if over slot |
| P-monster-traits | ready | Narrative traits do not block if actions compile |
| P-monster-legendary | ready | Legendary pool end of PC turn |
| P-monster-breath | ready | Save + area damage; recharge 5–6 |
| P-multiattack | ready | Sequential attacks same turn |
| P-monster-spellcasting | ready | at will / per fight lists |
| P-spell-priority | ready | Wire hex, hunters_mark, then families |
| P-detect-magic | ready | No combat effect; Off v1 |
| P-exploration-gap | ready | Exploration spells stay Missing until exploration ships |
| P-silence | ready | Fixed sphere; blocks V; immune thunder |
| P-darkness | ready | Mobile sphere; heavily obscured; no darkvision through |
| P-counterspell | ready | Reaction cancel; ~5s UI + banner |
| P-staff-striking | ready | +3 staff; 10 charges/fight; 1–3×1d6 force per hit |
| P-hold-person | ready | Paralyzed; save end of target turn |
| P-bane | ready | Up to 3 targets; -1d4 attacks and saves |
| P-belt-strength | ready | stat_set STR while attuned |
| P-teleport-grid | ready | Free cell in range in fight |
| P-charm-person | ready | Disadvantage vs charmer until charmer damages |
| P-spirit-guardians | ready | Sphere; enemies only; WIS save |
| P-magic-weapon | ready | +1 weapon and ammo from that weapon |
| P-potion-resistance | ready | resistance drink; 1 h → PC turns |
| P-apparatus-crab | ready | Off v1 until vehicles |

Status: `design` | `ready` | `shipped`

## Spec detail (ready primitives)

### P-mark-damage / P-mark-retarget / P-mark-disadv

- **Unlocks:** `hex`, `hunters_mark`, mark-style items.
- **SRD:** One marked enemy; +1d6 on attack roll hits; retarget on kill via BA; Hex ability disadvantage when checks run.
- **Model:** Combat abilities + concentration + on-hit rider.
- **Tests:** `content-mechanic-gaps.test.ts`, spell wire tests.

### P-drink-haste-growth

- **Unlocks:** `potion_of_speed`, `potion_of_growth`, similar drink gaps.
- **SRD:** Same as `haste` / enlarge spells; duration in PC turns.
- **Model:** Reuse spell buff application from `heal_drink` / stat drink pipeline.
- **Tests:** `content-mechanic-gaps.test.ts` (`potion_of_speed`).

### P-slaying-ammo / P-ammo-stash

- **Unlocks:** slaying ammunition review rows.
- **SRD:** CON save on hit; force rider; magic ammo tracked per instance.
- **Model:** `on_hit_rider` or ammo effect + stash rules.
- **Tests:** new `mechanics-batch-1.test.ts` (sample ids).

### P-silence / P-darkness

- **Unlocks:** wired L2 control spells.
- **SRD:** Grid spheres; V-block; obscured rules as in plan.
- **Model:** Zone effects on combat grid.
- **Tests:** combat integration tests.

### P-counterspell

- **Unlocks:** player reaction flow.
- **SRD:** Simplified reaction vs enemy cast; slot rules in implementation.
- **Model:** Reaction queue + UI timer.
- **Tests:** combat reaction tests.

### P-staff-striking

- **Unlocks:** `staff_of_striking` and charge-based weapons.
- **SRD:** +3 quarterstaff; 1–3 charges × 1d6 force per hit; 10 charges per fight.
- **Model:** Weapon modifier + per-fight charge pool.
- **Tests:** item engine + combat hit.

### P-exploration-gap / P-detect-magic

- **Unlocks:** N/A (intentionally stays Missing until exploration).
- **SRD:** No battlefield run in v1.
- **Model:** `mechanicGap` stays true; default Off.

---

Full workflow and architecture: see team plan *Mechanics backlog workflow* and [`content-mechanic-gaps.ts`](../backend/src/local/content-mechanic-gaps.ts).
