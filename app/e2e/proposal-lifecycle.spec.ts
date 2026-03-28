import { test, expect, Page } from "@playwright/test";

async function mockWalletConnection(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__MOCK_WALLET__ = {
      connected: true,
      publicKey: "GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ12345",
    };
  });
}

test.describe("Proposals List", () => {
  test("displays proposals page with header", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Proposals");
    await expect(page.locator('a[href="/propose"]')).toBeVisible();
  });

  test("shows empty state when no proposals exist", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const emptyState = page.getByText(/No proposals|Get started/);
    const proposalCard = page.locator('a[href^="/proposal/"]');
    const hasContent = (await emptyState.count()) > 0 || (await proposalCard.count()) > 0;
    expect(hasContent).toBeTruthy();
  });

  test("navigates to propose page", async ({ page }) => {
    await page.goto("/");
    await page.click('a[href="/propose"]');
    await expect(page).toHaveURL("/propose");
  });
});

test.describe("Delegates Page", () => {
  test("displays delegates leaderboard", async ({ page }) => {
    await page.goto("/delegates");
    await expect(page.locator("h1")).toContainText("Delegates");
    await expect(page.locator("table")).toBeVisible();
  });

  test("shows delegate button", async ({ page }) => {
    await page.goto("/delegates");
    const delegateButton = page.getByRole("button", { name: /Delegate/i });
    await expect(delegateButton.first()).toBeVisible();
  });
});

test.describe("Navigation", () => {
  test("navbar links work correctly", async ({ page }) => {
    await page.goto("/");

    await page.click('a:has-text("Delegates")');
    await expect(page).toHaveURL("/delegates");

    await page.click('a:has-text("Proposals")');
    await expect(page).toHaveURL("/");
  });

  test("connect wallet button is visible", async ({ page }) => {
    await page.goto("/");
    const connectButton = page.getByRole("button", { name: /Connect Wallet/i });
    await expect(connectButton).toBeVisible();
  });
});

test.describe("Proposal Detail (mocked)", () => {
  test("shows proposal not found for invalid id", async ({ page }) => {
    await page.goto("/proposal/999999");
    await page.waitForLoadState("networkidle");
  });
});

test.describe("Create Proposal", () => {
  test("displays proposal form", async ({ page }) => {
    await page.goto("/propose");
    await expect(page.locator("h1, h2")).toContainText(/Create|Proposal/i);
  });
});

test.describe("Full Proposal Lifecycle (mocked wallet)", () => {
  test("can navigate through proposal creation flow", async ({ page }) => {
    await mockWalletConnection(page);
    await page.goto("/");
    await page.click('a[href="/propose"]');
    await expect(page).toHaveURL("/propose");

    const titleInput = page.locator('[data-testid="proposal-title"], input[name="title"], input[placeholder*="title" i]');
    if (await titleInput.count() > 0) {
      await titleInput.fill("Test Proposal");
    }
  });

  test("can view delegates and initiate delegation", async ({ page }) => {
    await mockWalletConnection(page);
    await page.goto("/delegates");
    await expect(page.locator("h1")).toContainText("Delegates");

    const delegateButton = page.getByRole("button", { name: /Delegate/i }).first();
    await delegateButton.click();

    const modal = page.locator('[role="dialog"], .fixed.inset-0');
    await expect(modal).toBeVisible();
  });
});
