import { expect, test } from '@playwright/test'
import { mountSurfaceFixture } from './support/button-fixture'

const styles = `
  * { box-sizing: border-box; }
  body { margin: 0; color: var(--lumen-ink); font-family: 'Segoe UI', sans-serif; background: repeating-linear-gradient(45deg, var(--lumen-frost) 0 3rem, var(--lumen-line) 3rem 6rem); }
  .surface-fixture { display: flex; flex-direction: column; gap: 1rem; inline-size: 100%; max-inline-size: 64rem; padding: 1rem; margin-inline: auto; }
  .surface-content { padding: 1rem; gap: 1rem; }
  .surface-fixture :is(h1,h2,p) { margin: 0; }
  .surface-fixture h1 { font-size: 1.25rem; } .surface-fixture h2 { font-size: 1rem; }
  .surface-row { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; }
  .surface-row > .lumen-surface { min-inline-size: 0; flex: 1 1 12rem; }
`

test('materials retain content, full contours and compact status across themes and widths', async ({ page }) => {
  for (const width of [1024, 768, 320]) {
    await page.setViewportSize({ width, height: 900 })
    for (const theme of ['dark', 'light'] as const) {
      await mountSurfaceFixture(page, { theme, styles })
      await expect(page.locator('[data-edge], [data-length]')).toHaveCount(0)
      const panel = page.getByTestId('static-panel')
      await page.getByRole('textbox', { name: '普通面板中的字段独立聚焦' }).focus()
      expect(
        await panel.evaluate((element) => Number(getComputedStyle(element).getPropertyValue('--lumen-effect-level'))),
      ).toBe(0)
      const interactive = page.getByTestId('interactive-panel')
      await interactive.focus()
      expect(await interactive.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid')
      const dot = page.locator('.lumen-status-dot')
      const shape = await dot.boundingBox()
      expect(shape?.width).toBe(shape?.height)
      expect(shape?.width).toBeLessThanOrEqual(12)
      const separator = page.getByRole('separator')
      expect(await separator.evaluate((element) => element.getBoundingClientRect().height)).toBe(1)
      expect(
        await page.getByTestId('material-solid').evaluate((element) => getComputedStyle(element).backdropFilter),
      ).toBe('none')
      expect(
        await page.getByTestId('material-frost').evaluate((element) => getComputedStyle(element).backdropFilter),
      ).toContain('blur')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: `artifacts/ui-redesign/surfaces/${theme}-${width}.png`, fullPage: true })
    }
  }
})

test('running surface and status breathe without geometry changes and stop on completion or motion off', async ({
  page,
}) => {
  await mountSurfaceFixture(page, { theme: 'dark', styles })
  const panel = page.getByTestId('running-panel')
  const frames = await panel.evaluate((element) => {
    const animation = element
      .getAnimations()
      .find((value) => value instanceof CSSAnimation && value.animationName === 'lumen-breathe')
    if (!animation) throw new Error('Running surface has no breath')
    animation.pause()
    return [0, 1300, 2600].map((time) => {
      animation.currentTime = time
      const rect = element.getBoundingClientRect()
      return { shadow: getComputedStyle(element).boxShadow, width: rect.width, height: rect.height }
    })
  })
  expect(frames[0]?.shadow).not.toBe(frames[1]?.shadow)
  expect(frames[0]?.shadow).toBe(frames[2]?.shadow)
  expect(frames[0]?.width).toBe(frames[1]?.width)
  expect(frames[0]?.height).toBe(frames[1]?.height)
  await page.getByRole('button', { name: '切换动态效果' }).click()
  expect(await panel.evaluate((element) => element.getAnimations().length)).toBe(0)
  expect(await page.locator('.lumen-status-dot').evaluate((element) => element.getAnimations().length)).toBe(0)
  await page.getByRole('button', { name: '完成执行' }).click()
  await expect(panel).toHaveAttribute('data-lumen-state', 'idle')
})
