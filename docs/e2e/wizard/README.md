# Hero builder wizard screenshots

From `backend/test/e2e/wizard-four-classes.e2e.test.ts` (Playwright, headless).

- `tv-1-fighter-*` … `tv-4-rogue-*` — viewport 1920×1080, keyboard. Classes: fighter (martial), wizard (arcane), cleric (divine), rogue (expertise). Each run ends on the title after the hero is saved.
- `phone-fighter-*` — viewport 390×844, touch, same wizard with the phone layout.
- `tv-dpad-class.png` — ArrowDown plus MediaTrackNext / MediaTrackPrevious.

`/forge` redirects to `/?builder=open`, which opens this modal.

## Sheet check (Human, Acolyte, standard array, ASI +2 Wis / +1 Int)

Scores on every review: STR 15, DEX 14, CON 13, INT 13, WIS 12, CHA 8. Proficiency +2.

| Class | HP | AC | Saves | Slots | Notes |
|-------|----|----|-------|-------|-------|
| Fighter | 11 (d10+1) | 16 | STR +4, CON +3 | — | AC 16 is chain mail from kit A |
| Wizard | 7 (d6+1) | 12 | INT +3, WIS +3 | L1 ×2 | 3 cantrips, 4 prepared. AC is 10+Dex |
| Cleric | 9 (d8+1) | 12 | WIS +3, CHA +1 | L1 ×2 | 3 cantrips, 4 prepared. AC is 10+Dex |
| Rogue | 9 (d8+1) | 12 | DEX +4, INT +3 | — | Insight +5 and Religion +5 are Expertise. AC is 10+Dex |

Prepared counts follow the class table in `classes.json` (4 at level 1 for wizard and cleric), not the “ability modifier + level” formula when that modifier is below +3. Armor from the starter kit is applied in the preview only for the fighter. Other classes stay unarmored until the stash item is equipped.
