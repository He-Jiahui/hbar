import { expect, test } from '@playwright/test'
import { mountControlFixture } from './support/button-fixture'

const styles = `
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--lumen-frost); color: var(--lumen-ink); font-family: 'Segoe UI', sans-serif; }
  .control-fixture { display: flex; max-inline-size: 64rem; min-inline-size: 0; margin-inline: auto; padding: 1rem; gap: 1.5rem; flex-direction: column; }
  .control-fixture h1 { margin: 0; font-size: 1.25rem; }
  .control-fixture-fields, .control-fixture-row { display: flex; min-inline-size: 0; flex-wrap: wrap; align-items: center; gap: 1rem; padding: 1rem; background: var(--lumen-glass); border-radius: var(--lumen-radius-surface); }
  .control-fixture-fields > * { min-inline-size: 0; max-inline-size: 100%; flex: 1 1 16rem; }
  .control-fixture-row > :is(.lumen-toggle, .lumen-checkbox) { min-inline-size: 0; flex: 1 1 16rem; }
  .control-fixture-row > .lumen-range, .control-fixture-row > .MuiSlider-root { flex: 1 1 16rem; }
`

test('outlined fields, choice controls and native MUI keep accessible shapes in both themes and narrow layouts', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const width of [1024, 768, 320]) {
    await page.setViewportSize({ width, height: 900 })
    for (const theme of ['dark', 'light'] as const) {
      await mountControlFixture(page, { theme, styles })
      const input = page.getByTestId('control-input')
      const field = input.locator('xpath=ancestor::*[contains(@class,"lumen-outlined-field")]')
      await expect(field.locator('[data-edge]')).toHaveCount(0)
      expect(await field.evaluate((element) => getComputedStyle(element).borderTopStyle)).toBe('solid')
      await page.getByRole('button', { name: '通过原生引用聚焦' }).click()
      await expect(input).toBeFocused()
      expect(await field.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid')
      await input.fill('保持原生引用与宿主拥有的编辑值')
      await expect(input).toHaveValue('保持原生引用与宿主拥有的编辑值')
      await expect(page.getByLabel('需要校正的工作区路径')).toHaveAttribute('aria-invalid', 'true')
      await expect(page.getByLabel('需要校正的工作区路径')).toHaveAttribute('aria-describedby', 'control-error-error')
      await page.getByRole('button', { name: '展开工作区列表' }).click()
      await page.getByRole('option', { name: '工作区二' }).click()
      await expect(page.getByRole('combobox')).toHaveValue('工作区二')
      const check = page.getByRole('checkbox', { name: '启用当前工作区中的完整上下文与附件检索' })
      await check.check()
      await expect(check).toBeChecked()
      const toggle = page.getByRole('switch', { name: '自动同步工作区' })
      await toggle.check()
      await expect(toggle).toBeChecked()
      const buttonToggle = page.getByRole('switch', { name: '允许后台检查' })
      await buttonToggle.focus()
      await page.keyboard.press('Space')
      await expect(buttonToggle).toHaveAttribute('aria-checked', 'true')
      const tracks = await page.locator('.lumen-toggle-track').evaluateAll((elements) =>
        elements.map((element) => {
          const track = element.getBoundingClientRect()
          const thumb = element.querySelector('.lumen-toggle-thumb')?.getBoundingClientRect()
          return { height: track.height, width: track.width, thumbWidth: thumb?.width, thumbHeight: thumb?.height }
        }),
      )
      expect(tracks).toHaveLength(2)
      for (const track of tracks) {
        expect(track.height).toBeGreaterThan(15)
        expect(track.width).toBeGreaterThan(track.height)
        expect(track.thumbWidth).toBe(track.thumbHeight)
      }
      await expect(page.locator('.lumen-toggle-lamp')).toHaveCount(0)
      const range = page.getByRole('slider', { name: '交互强度', exact: true })
      await range.focus()
      await page.keyboard.press('ArrowRight')
      await expect(range).toHaveValue('43')
      await expect(page.getByRole('status', { name: '当前强度' })).toHaveText('43')
      expect(await range.evaluate((element) => element.style.getPropertyValue('--lumen-range-progress'))).toBe('43%')
      await page.getByLabel('MUI 描边', { exact: true }).focus()
      expect(
        await page.locator('.MuiOutlinedInput-root').evaluate((element) => getComputedStyle(element).boxShadow),
      ).not.toBe('none')
      expect(
        await page.locator('.MuiSwitch-track').evaluate((element) => element.getBoundingClientRect().height),
      ).toBeGreaterThan(5)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: `artifacts/ui-redesign/controls/${theme}-${width}.png`, fullPage: true })
    }
  }
  expect(errors).toEqual([])
})

test('switch travel is continuous and remains immediate when motion is disabled', async ({ page }) => {
  await mountControlFixture(page, { theme: 'dark', styles })
  const toggle = page.getByRole('switch', { name: '允许后台检查' })
  await toggle.click()
  const thumb = toggle.locator('.lumen-toggle-thumb')
  const samples = await thumb.evaluate((element) => {
    const animation = element
      .getAnimations()
      .find(
        (value) =>
          value instanceof CSSTransition && /^margin-(?:inline-start|left|right)$/.test(value.transitionProperty),
      )
    if (!animation) throw new Error('Switch travel skipped its transition')
    animation.pause()
    return [0, 120, 240].map((time) => {
      animation.currentTime = time
      return Number.parseFloat(getComputedStyle(element).marginInlineStart)
    })
  })
  expect(samples[1]).toBeGreaterThan(samples[0] ?? 0)
  expect(samples[1]).toBeLessThan(samples[2] ?? 0)
  await page.getByRole('button', { name: '切换动态效果' }).click()
  await toggle.click()
  expect(await thumb.evaluate((element) => getComputedStyle(element).transitionProperty)).toBe('none')
  expect(await thumb.evaluate((element) => getComputedStyle(element).marginInlineStart)).toBe('0px')
})

test('field hover and focus light pass through intermediate values', async ({ page }) => {
  await mountControlFixture(page, { theme: 'dark', styles })
  const input = page.getByTestId('control-input')
  const field = input.locator('xpath=ancestor::*[contains(@class,"lumen-outlined-field")]')
  await page.mouse.move(0, 0)
  await field.hover()
  const sampleLight = () =>
    field.evaluate((element) => {
      const animation = element
        .getAnimations()
        .find((value) => value instanceof CSSTransition && value.transitionProperty === '--lumen-effect-level')
      if (!animation) throw new Error('Field light skipped its transition')
      animation.pause()
      return [0, 120, 240].map((time) => {
        animation.currentTime = time
        return Number.parseFloat(getComputedStyle(element).getPropertyValue('--lumen-effect-level'))
      })
    })
  const hovered = await sampleLight()
  expect(hovered[1]).toBeGreaterThan(hovered[0] ?? 0)
  expect(hovered[1]).toBeLessThan(hovered[2] ?? 0)
  await input.focus()
  const focused = await sampleLight()
  expect(focused[1]).toBeGreaterThan(focused[0] ?? 0)
  expect(focused[1]).toBeLessThan(focused[2] ?? 0)
})

test('glow off preserves field focus and checked markers', async ({ page }) => {
  await mountControlFixture(page, { theme: 'light', glow: 0, styles })
  const input = page.getByTestId('control-input')
  await input.focus()
  expect(
    await input
      .locator('xpath=ancestor::*[contains(@class,"lumen-outlined-field")]')
      .evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe('solid')
  const toggle = page.getByRole('switch', { name: '自动同步工作区' })
  await toggle.check()
  await expect(toggle).toBeChecked()
  await page.getByRole('button', { name: '切换动态效果' }).click()
  await page.emulateMedia({ forcedColors: 'active' })
  await input.focus()
  expect(
    await input
      .locator('xpath=ancestor::*[contains(@class,"lumen-outlined-field")]')
      .evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe('solid')
})
