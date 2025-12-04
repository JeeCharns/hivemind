import { test, expect } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const hiveSlug = process.env.TEST_HIVE_SLUG;
const conversationSlug = process.env.TEST_CONVERSATION_SLUG;
const hiveId = process.env.TEST_HIVE_ID;
const conversationId = process.env.TEST_CONVERSATION_ID;

const hasSlugData = Boolean(hiveSlug && conversationSlug);

test.describe("Slug routes", () => {
  test.beforeEach(async () => {
    if (!hasSlugData) {
      test.skip(true, "TEST_HIVE_SLUG/TEST_CONVERSATION_SLUG not set");
    }
  });

  test("Hive page loads by slug", async ({ page }) => {
    await page.goto(`${baseURL}/hives/${hiveSlug}`);
    await expect(page.getByRole("heading", { name: /your collective/i })).toBeVisible();
  });

  test("Conversation result page loads by slug", async ({ page }) => {
    await page.goto(
      `${baseURL}/hives/${hiveSlug}/conversations/${conversationSlug}/result`
    );
    await expect(page.getByText(/Result/i)).toBeVisible();
  });

  test("Legacy UUID routes still render", async ({ page }) => {
    if (!hiveId || !conversationId) {
      test.skip(true, "TEST_HIVE_ID/TEST_CONVERSATION_ID not set");
    }
    await page.goto(
      `${baseURL}/hives/${hiveId}/conversations/${conversationId}/result`
    );
    await expect(page.getByText(/Result/i)).toBeVisible();
  });
});
