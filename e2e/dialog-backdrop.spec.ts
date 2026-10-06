import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { mountLumenFixture } from './support/lumen-controls-fixture'

const styles = `
  * { box-sizing: border-box; }
  body { margin: 0; min-block-size: 100dvh; color: var(--lumen-ink); font-family: system-ui, sans-serif;
    background: repeating-linear-gradient(90deg, #000 0 12px, #fff 12px 24px); }
  .dialog-sizing-fixture { display: flex; flex-direction: column; gap: 1rem; padding: 1rem; }
  .dialog-sizing-fixture h1 { margin: 0; }
  .dialog-sizing-actions { display: flex; flex-wrap: wrap; gap: .75rem; }
  .dialog-sizing-copy { display: flex; flex-direction: column; gap: .75rem; padding: 1rem; }
  .dialog-sizing-copy p { margin: 0; }
`

async function backdropPixels(page: Page, screenshot: Buffer): Promise<{ average: number; contrast: number }> {
  return page.evaluate(async (base64) => {
    const image = new Image()
    image.src = `data:image/png;base64,${base64}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('A canvas is required to inspect the rendered backdrop')
    context.drawImage(image, 0, 0)
    // This strip is outside the centered child window and the fixture toolbar.
    const pixels = context.getImageData(48, 200, 120, 1).data
    const values = Array.from({ length: pixels.length / 4 }, (_, index) => pixels[index * 4] ?? 0)
    return {
      average: values.reduce((sum, value) => sum + value, 0) / values.length,
      contrast: Math.max(...values) - Math.min(...values),
    }
  }, screenshot.toString('base64'))
}

for (const presentation of ['top-layer', 'fallback'] as const) {
  test(`child window backdrop follows the theme and blurs the workspace: ${presentation}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const output = join(process.cwd(), 'artifacts', 'dialog-backdrop')
    await mkdir(output, { recursive: true })
    await page.setViewportSize({ width: 1600, height: 1000 })
    await mountLumenFixture(page, 'tests/fixtures/dialog-sizing-browser.tsx', { theme: 'dark', styles })
    if (presentation === 'fallback') {
      await page.evaluate(() => {
        HTMLElement.prototype.showPopover = () => {
          throw new DOMException('The top layer is unavailable in this regression case', 'NotSupportedError')
        }
      })
    }
    const baseline = await backdropPixels(page, await page.screenshot())
    expect(baseline.contrast).toBe(255)
    const trigger = page.locator('[data-open-size="small"]')
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('data-top-layer', presentation === 'top-layer' ? 'true' : 'false')
    const draft = dialog.locator('#dialog-draft')
    await draft.fill('A draft survives theme changes')
    const originalGeometry = await dialog.boundingBox()
    for (const theme of ['dark', 'light', 'dark'] as const) {
      await page.evaluate((mode) => document.documentElement.setAttribute('data-lumen-mode', mode), theme)
      await expect(dialog.locator('.lumen-dialog-surface')).toHaveCSS(
        'background-color',
        theme === 'dark' ? 'rgb(9, 9, 9)' : 'rgb(245, 245, 245)',
      )
      const screenshot = await page.screenshot({ path: join(output, `${presentation}-${theme}.png`) })
      const rendered = await backdropPixels(page, screenshot)
      // Tint direction and loss of stripe contrast prove actual compositing, not just CSS declarations.
      expect(rendered.contrast, JSON.stringify(rendered)).toBeLessThan(15)
      if (theme === 'dark') expect(rendered.average, JSON.stringify(rendered)).toBeLessThan(100)
      else expect(rendered.average, JSON.stringify(rendered)).toBeGreaterThan(165)
      await expect(draft).toHaveValue('A draft survives theme changes')
      await expect(draft).toBeFocused()
      expect(await dialog.boundingBox()).toEqual(originalGeometry)
    }
    await dialog.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
    expect(await backdropPixels(page, await page.screenshot())).toEqual(baseline)
    await trigger.click()
    await page.mouse.click(100, 200)
    await expect(dialog).toBeHidden()
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[hidden]')))).toBe(false)
    expect(await backdropPixels(page, await page.screenshot())).toEqual(baseline)
    await page.emulateMedia({ forcedColors: 'active' })
    await trigger.click()
    await expect(draft).toBeFocused()
    const accessibleBackdropBlur = await dialog.evaluate((element) => {
      const root = element.parentElement
      const fallback = root?.querySelector('[data-lumen-floating-backdrop]')
      if (!root || !fallback) throw new Error('The shared backdrop is missing')
      const backdropStyle = root.matches(':popover-open')
        ? getComputedStyle(root, '::backdrop')
        : getComputedStyle(fallback)
      return backdropStyle.backdropFilter
    })
    expect(accessibleBackdropBlur).toBe('none')
    await dialog.press('Escape')
    await expect(trigger).toBeFocused()
    expect(errors).toEqual([])
  })
}
