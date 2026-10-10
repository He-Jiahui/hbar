import { expect, test } from '@playwright/test'
import { mountSessionDecisionHistoryFixture } from './support/button-fixture'

for (const locale of ['en-US', 'zh-CN'] as const) {
  for (const width of [390, 1280]) {
    test(`decision history stays bounded and fully reachable: ${locale}, ${width}px`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.setViewportSize({ width, height: 800 })
      await mountSessionDecisionHistoryFixture(page, {
        theme: 'light',
        locale,
        itemCount: 25,
        styles: 'body { margin: 0; font-family: system-ui, sans-serif; }',
      })
      const disclosure = page.getByRole('button', { name: /Resolved decisions|已处理的确认记录/ })
      await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
      const iconBox = await disclosure.locator('.lumen-icon').boundingBox()
      const titleBox = await disclosure.locator(':scope > span').boundingBox()
      if (!iconBox || !titleBox) throw new Error('Disclosure icon and title must be visible')
      expect(titleBox.x).toBeGreaterThanOrEqual(iconBox.x + iconBox.width)
      expect(Math.abs(titleBox.y - iconBox.y)).toBeLessThan(4)
      await disclosure.press('Enter')
      await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
      await expect(page.locator('[data-history-id]')).toHaveCount(10)
      await page.getByRole('button', { name: 'history-0' }).click()
      await expect(page.locator('[data-last-callback]')).toHaveText('history-0')
      await page.locator('[data-action="rotate"]').click()
      await page.getByRole('button', { name: 'history-1', exact: true }).click()
      await expect(page.locator('[data-last-callback]')).toHaveText('history-1')
      const loadMore = page.getByRole('button', { name: /Load more records|加载更多记录/ })
      await loadMore.click()
      await loadMore.click()
      await expect(page.locator('[data-history-id]')).toHaveCount(25)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: test.info().outputPath('history-open.png'), fullPage: true })
      await disclosure.press('Enter')
      await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
      expect(errors).toEqual([])
    })
  }
}

test('empty, single, page-boundary and over-bound histories keep their disclosed row counts', async ({ page }) => {
  for (const [count, visible] of [
    [0, 0],
    [1, 1],
    [10, 10],
    [11, 10],
    [25, 10],
  ] as const) {
    await mountSessionDecisionHistoryFixture(page, { theme: 'light', itemCount: count, styles: '' })
    if (count === 0) {
      await expect(page.locator('[data-history-id]')).toHaveCount(0)
      continue
    }
    await page.getByRole('button', { name: /Resolved decisions/ }).press('Enter')
    await expect(page.locator('[data-history-id]')).toHaveCount(visible)
  }
})
