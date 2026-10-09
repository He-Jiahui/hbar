import { expect, test, type Locator } from '@playwright/test'
import { mountLumenFixture } from './support/lumen-controls-fixture'

const fixtureStyles = `
  body { margin: 0; color: var(--lumen-ink); background: var(--lumen-canvas); }
  .padding-fixture { display: flex; min-inline-size: 0; flex-direction: column; gap: 1rem; padding: 1rem; }
  .padding-fixture h1 { margin: 0; overflow-wrap: anywhere; }
  .padding-fields { display: flex; min-inline-size: 0; flex-direction: column; gap: 1rem; }
  .padding-button-spacing-scope { --lumen-control-padding-inline: 0; }
`
const spacing = { s: { block: 4, inline: 10 }, m: { block: 6, inline: 12 }, l: { block: 8, inline: 14 } } as const

async function expectPadding(control: Locator, expected: { readonly block: number; readonly inline: number }) {
  const measured = await control.evaluate((element) => {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    const owner = element.closest('.lumen-outlined-field') ?? element
    const boundary = owner.getBoundingClientRect()
    return {
      top: parseFloat(style.paddingTop),
      right: parseFloat(style.paddingRight),
      bottom: parseFloat(style.paddingBottom),
      left: parseFloat(style.paddingLeft),
      boxSizing: style.boxSizing,
      inside: rect.left >= boundary.left && rect.right <= boundary.right + 1,
    }
  })
  expect(measured).toEqual({
    top: expected.block,
    bottom: expected.block,
    left: expected.inline,
    right: expected.inline,
    boxSizing: 'border-box',
    inside: true,
  })
}

for (const theme of ['light', 'dark'] as const)
  for (const size of ['s', 'm', 'l'] as const)
    for (const width of [1440, 768, 320])
      test(`text controls retain their insets: ${theme} ${size} ${width}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 960 })
        await mountLumenFixture(page, 'tests/fixtures/text-input-padding-browser.tsx', {
          theme,
          size,
          locale: 'zh-CN',
          styles: fixtureStyles,
        })
        await expect(page.locator('#padding-empty')).toBeVisible()
        for (const id of [
          'empty',
          'long',
          'numeric',
          'number',
          'password',
          'url',
          'readonly',
          'disabled',
          'invalid',
          'independent',
          'combo',
          'settings',
        ])
          await expectPadding(page.locator(`#padding-${id}`), spacing[size])
        for (const explicit of ['s', 'm', 'l'] as const)
          await expectPadding(page.locator(`#padding-explicit-${explicit}`), spacing[explicit])
        await expectPadding(page.locator('#padding-multiline'), { block: 12, inline: 12 })

        const form = page.locator('.lumen-settings-form-root-surface')
        const inset = await form.locator('.lumen-form-field').evaluate((element) => {
          const owner = element.closest('.lumen-settings-form-root-surface')
          if (!owner) throw new Error('Missing settings field surface')
          const boundary = owner.getBoundingClientRect(),
            border = getComputedStyle(owner)
          return Array.from(element.querySelectorAll('label, p, small')).map((text) => {
            const rect = text.getBoundingClientRect()
            return {
              left: rect.left - boundary.left - parseFloat(border.borderLeftWidth),
              right: boundary.right - parseFloat(border.borderRightWidth) - rect.right,
            }
          })
        })
        expect(inset.length).toBe(3)
        for (const measured of inset) {
          expect(measured.left).toBeGreaterThanOrEqual(12)
          expect(measured.right).toBeGreaterThanOrEqual(12)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)

        await page.locator('#padding-empty').fill('输入文字 / Typed content')
        await expect(page.locator('#padding-empty')).toHaveValue('输入文字 / Typed content')
        await page.locator('#padding-combo').focus()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Home')
        await page.keyboard.press('Enter')
        await expect(page.locator('#padding-combo')).toHaveValue('第一个选项')
        await page.locator('#padding-multiline').fill('第一行')
        await page.keyboard.press('End')
        await page.keyboard.press('Enter')
        await page.keyboard.insertText('第二行')
        await expect(page.locator('#padding-multiline')).toHaveValue('第一行\n第二行')
        if (size === 'm' && width !== 768)
          await page.screenshot({ path: info.outputPath(`text-input-${theme}-${width}.png`), fullPage: true })
      })
