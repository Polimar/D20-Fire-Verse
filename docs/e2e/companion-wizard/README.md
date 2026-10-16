# Companion wizard screenshots

From `backend/test/e2e/companion-wizard.e2e.test.ts`. Playwright emulates an iPhone 13 (touch, mobile user agent) and forces the viewport to **390×844**, which is the full screen. The current Playwright device descriptor uses 390×664 for the page area under Safari chrome.

The page is the built companion PWA at `/companion/`, not the TV modal. A logged-in session cookie opens the library. The run taps **Not now** on the install sheet, then **Forge a hero**, and walks a wizard (arcane caster) with touch.

- `00-install.png` — signed-in library with the install sheet.
- `00-library.png` — forge button after dismissing the sheet.
- `01-class.png` — class list. The last row starts under the fold; the list scrolls.
- `01-class-bottom.png` — scrolled to Warlock and Wizard, still above Back / Next.
- `01-sheet.png` — bottom sheet. Counted sentences, no raw `NEED_` codes. Wizard kit A is unarmored: AC 12.
- `02-species.png`, `03-origin.png` through `08-details.png` — one shot per step (class → species → origin → …). Class/Species show a detail panel (traits / progression). Fighting Style is chosen on Class; Training shows it read-only.
- Re-record after UI changes: `npm run build` then `NARRATION=off node --import tsx --import ./test/setup.ts --test test/e2e/companion-wizard.e2e.test.ts` from `backend/` (needs Playwright Chromium + OS libs via `npx playwright install-deps`).
- `09-review.png` — sheet open on the review step. HP 7, AC 12, L1 ×2, 3 cantrips, 4 prepared.
- `10-saved.png` — Pocket Zephyr back on the library at level 1.

The peek in the thumb bar shows the first counted sentence (`Pick 2 class skills (0/2).`, later `Pick 3 cantrips (0/3).`, then `HP 7 · AC 12` once the draft is complete).
