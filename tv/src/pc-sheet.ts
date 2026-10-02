/** The hero's sheet beside the board. The markup is shared with the phone companion. */

import { pcSheetHtml, type PcSheet, type SheetTab } from "@d20-fireverse/protocol/sheet";

export { SHEET_TABS, type PcSheet, type SheetAction, type SheetTab } from "@d20-fireverse/protocol/sheet";

export function renderPcSheet(host: HTMLElement, sheet: PcSheet | null, tab: SheetTab, isMyTurn: boolean, onTab: (t: SheetTab) => void) {
  if (!sheet) {
    host.innerHTML = `<p class="meta">Waiting for a hero to take the field.</p>`;
    return;
  }
  host.innerHTML = pcSheetHtml(sheet, tab, { isMyTurn });
  host.querySelectorAll<HTMLElement>("[data-sheet-tab]").forEach((b) => b.addEventListener("click", () => onTab(b.dataset.sheetTab as SheetTab)));
}
