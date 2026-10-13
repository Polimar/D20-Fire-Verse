/**
 * Browser pass for the V2 loop. Run with the table already on :3100:
 *   npx playwright test e2e/v2-flow.spec.ts
 * The same loop is asserted without a browser in backend/test/v2.test.ts.
 */
import { expect, test } from "@playwright/test";

const base = process.env.FIREVERSE_E2E_URL ?? "http://127.0.0.1:3100";

test("an admin can open the content list and the shop says pay-to-win", async ({ page }) => {
  await page.goto(base);
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("admin");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Manage the table" }).click();
  await page.getByRole("button", { name: "Content" }).click();
  await expect(page.getByText("Everything starts off")).toBeVisible();
});
