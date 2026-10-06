import { expect, test, type Locator } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { mountLumenFixture } from './support/lumen-controls-fixture'

const ratios = { large: 0.8, medium: 0.6, small: 0.4 } as const
type DialogSize = keyof typeof ratios

const styles = `
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--lumen-frost); color: var(--lumen-ink); font-family: system-ui, sans-serif; }
  .dialog-sizing-fixture { display: flex; min-inline-size: 0; flex-direction: column; gap: 1rem; padding: 1rem; }
  .dialog-sizing-fixture h1 { margin: 0; overflow-wrap: anywhere; }
  .dialog-sizing-actions { display: flex; flex-wrap: wrap; gap: .75rem; }
  .dialog-sizing-copy { display: flex; min-inline-size: 0; flex: 0 0 auto; flex-direction: column; gap: .75rem; padding: 1rem; }
  .dialog-sizing-copy p { margin: 0; overflow-wrap: anywhere; }
`

async function expectDialogGeometry(dialog: Locator, size: DialogSize): Promise<void> {
  const geometry = await dialog.evaluate((element) => {
    const rectangle = (node: Element) => {
      const rect = node.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom, right: rect.right }
    }
    const content = element.querySelector('.lumen-dialog-content')
    const body = element.querySelector('.lumen-dialog-body')
    const header = content?.querySelector(':scope > header')
    const footer = content?.querySelector(':scope > footer')
    if (!body || !header || !footer) throw new Error('The dialog header/body/footer is missing')
    return {
      viewport: { width: innerWidth, height: innerHeight },
      dialog: rectangle(element),
      header: rectangle(header),
      body: rectangle(body),
      footer: rectangle(footer),
      scrollHeight: body.scrollHeight,
      clientHeight: body.clientHeight,
      scrollWidth: body.scrollWidth,
      clientWidth: body.clientWidth,
      portal: element.parentElement?.parentElement === document.body,
      topLayer: element.parentElement?.matches(':popover-open') ?? false,
      documentWidth: document.documentElement.scrollWidth,
      root: element.parentElement
        ? {
            rect: rectangle(element.parentElement),
            inlineSize: getComputedStyle(element.parentElement).inlineSize,
            maxInlineSize: getComputedStyle(element.parentElement).maxInlineSize,
            blockSize: getComputedStyle(element.parentElement).blockSize,
            display: getComputedStyle(element.parentElement).display,
          }
        : null,
    }
  })
  const ratio = ratios[size]
  const fullscreen = geometry.viewport.width <= 960 || geometry.viewport.height <= 640
  const expectedWidth = geometry.viewport.width * (fullscreen ? 1 : ratio)
  const expectedHeight = geometry.viewport.height * (fullscreen ? 1 : ratio)
  expect(Math.abs(geometry.dialog.width - expectedWidth), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
  expect(Math.abs(geometry.dialog.height - expectedHeight), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
  expect(Math.abs(geometry.dialog.x - (geometry.viewport.width - expectedWidth) / 2)).toBeLessThanOrEqual(1)
  expect(Math.abs(geometry.dialog.y - (geometry.viewport.height - expectedHeight) / 2)).toBeLessThanOrEqual(1)
  expect(geometry.portal).toBe(true)
  expect(geometry.topLayer).toBe(true)
  expect(geometry.header.bottom).toBeLessThanOrEqual(geometry.body.y + 1)
  expect(geometry.body.bottom).toBeLessThanOrEqual(geometry.footer.y + 1)
  expect(geometry.footer.bottom).toBeLessThanOrEqual(geometry.dialog.bottom + 1)
  expect(geometry.footer.bottom).toBeGreaterThanOrEqual(geometry.dialog.bottom - 3)
  expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight)
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1)
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport.width + 1)
  expect(geometry.dialog.right).toBeLessThanOrEqual(geometry.viewport.width + 1)
  expect(geometry.dialog.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1)
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`child windows use viewport size tiers and preserve drafts while resizing: ${locale}`, async ({ page }) => {
    test.setTimeout(90_000)
    const output = join(process.cwd(), 'artifacts', 'dialog-sizing')
    await mkdir(output, { recursive: true })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width: 1600, height: 1000 })
    await mountLumenFixture(page, 'tests/fixtures/dialog-sizing-browser.tsx', {
      locale,
      theme: locale === 'zh-CN' ? 'light' : 'dark',
      styles,
    })
    for (const size of ['large', 'medium', 'small'] as const) {
      const trigger = page.locator(`[data-open-size="${size}"]`)
      await trigger.click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog).toHaveAttribute('aria-modal', 'true')
      const draft = dialog.locator('#dialog-draft')
      await expect(draft).toBeFocused()
      await draft.fill(`draft-${size}`)
      for (const viewport of [
        { width: 1600, height: 1000 },
        { width: 1000, height: 800 },
        { width: 960, height: 800 },
        { width: 961, height: 800 },
        { width: 1200, height: 640 },
        { width: 1200, height: 641 },
        { width: 800, height: 600 },
        { width: 1600, height: 600 },
        { width: 1600, height: 400 },
        { width: 600, height: 350 },
        { width: 390, height: 844 },
        { width: 320, height: 240 },
        { width: 1600, height: 1000 },
      ]) {
        await page.setViewportSize(viewport)
        await expectDialogGeometry(dialog, size)
        await expect(draft).toHaveValue(`draft-${size}`)
        const body = dialog.locator('.lumen-dialog-body')
        const footerBefore = await dialog.locator('footer').boundingBox()
        await body.evaluate((element) => {
          element.scrollTop = element.scrollHeight
        })
        await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
        expect(await dialog.locator('footer').boundingBox()).toEqual(footerBefore)
        if (viewport.width === 1600 && viewport.height === 1000) {
          await page.screenshot({ path: join(output, `${locale}-${size}.png`) })
        } else if (viewport.width === 320) {
          await page.screenshot({ path: join(output, `${locale}-${size}-compact.png`) })
        }
      }
      await dialog.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(trigger).toBeFocused()
    }
    await page.locator('[data-open-size="default"]').click()
    await expectDialogGeometry(page.getByRole('dialog'), 'medium')
    await page.getByRole('dialog').press('Escape')
    expect(errors).toEqual([])
  })
}
