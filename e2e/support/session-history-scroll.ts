import type { Page } from '@playwright/test'

/** Real upward wheel intent; the application decides whether a history page is eligible. */
export async function scrollToHistoryTop(page: Page): Promise<void> {
  const viewport = page.locator('.lumen-conversation-messages')
  const height = await viewport.evaluate((element) => element.scrollHeight)
  await viewport.hover()
  await page.mouse.wheel(0, -Math.max(1, height))
}
