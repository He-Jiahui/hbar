import { expect, test } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import type { MobileHeaderContentInput } from '../tests/fixtures/mobile-header-content-browser'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { mobileShellNavigationLabel } from '../apps/web/src/mobile-shell-navigation-copy'

const root = join(process.cwd(), 'artifacts/desktop-elements/mobile-header-content/controlled')
let server: PreviewServer | undefined
let url = ''
test.beforeAll(async () => {
  test.setTimeout(90_000)
  await build({
    configFile: false,
    root: process.cwd(),
    plugins: [react()],
    logLevel: 'warn',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    resolve: { dedupe: ['react', 'react-dom'] },
    build: {
      outDir: join(root, 'web'),
      emptyOutDir: true,
      chunkSizeWarningLimit: 1500,
      rolldownOptions: { input: join(process.cwd(), 'tests/fixtures/mobile-header-content.html') },
    },
  })
  server = await preview({
    configFile: false,
    root: process.cwd(),
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 0, strictPort: false },
  })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Missing owned mobile preview')
  url = `http://127.0.0.1:${address.port}/tests/fixtures/mobile-header-content.html`
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})
for (const locale of ['en-US', 'zh-CN'] as const)
  for (const width of [1440, 1100, 900, 390, 320]) {
    test(`mobile full names, registrations and close-before-action ${locale} ${width}`, async ({ browser }, info) => {
      const context = await browser.newContext({ locale, viewport: { width, height: 1000 } })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      try {
        await page.goto(url)
        await page.evaluate(() => {
          document.documentElement.style.zoom = '1.25'
          document.documentElement.style.setProperty('--owned-content-zoom', '1.25')
        })
        const copy = getShellCopy(locale).session.tools
        const label = mobileShellNavigationLabel(locale)
        const trigger = page.getByRole('button', { name: label, exact: true })
        const panel = page.locator('.hbar-mobile-header-menu-content')
        for (const mode of ['light', 'dark'] as const) {
          let data: MobileHeaderContentInput = { locale, mode, count: 7, current: 'owned-1' }
          await page.evaluate((input) => window.mountMobileHeaderContent(input), data)
          if (width >= 900) {
            await expect(trigger).not.toBeVisible()
            await page.setViewportSize({ width: 320, height: 1000 })
          }
          for (const count of [0, 1, 7, 32, 33]) {
            data = { ...data, count }
            await page.evaluate((input) => window.updateMobileHeaderContent(input), data)
            if (!count) {
              await expect(trigger).toHaveCount(0)
              continue
            }
            await trigger.focus()
            await trigger.press('Enter')
            await expect(panel).toBeVisible()
            await expect(panel.getByRole('heading', { name: copy.label.repeat(8), exact: true })).toBeVisible()
            await expect(panel.locator('.hbar-mobile-header-menu-item-title')).toHaveCount(count)
            await expect(panel.getByRole('button')).toHaveCount(count * 2)
            expect(await panel.evaluate((node) => node.parentElement === document.body)).toBe(true)
            const bounds = await panel.boundingBox()
            if (!bounds) throw new Error('Missing actual mobile panel')
            const currentWidth = page.viewportSize()?.width
            if (!currentWidth) throw new Error('Missing viewport')
            expect(bounds.x).toBeGreaterThanOrEqual(-1)
            expect(bounds.y).toBeGreaterThanOrEqual(-1)
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(currentWidth + 1)
            expect(bounds.y + bounds.height).toBeLessThanOrEqual(1001)
            const flow = await panel.evaluate((node) =>
              [...node.querySelectorAll<HTMLElement>('[data-text-context]')].every(
                (text) =>
                  getComputedStyle(text).whiteSpace === 'normal' &&
                  getComputedStyle(text).textOverflow !== 'ellipsis' &&
                  text.scrollWidth <= text.clientWidth + 1,
              ),
            )
            expect(flow).toBe(true)
            const last = panel.getByRole('button', { name: `${copy.settings} ${count - 1}`, exact: true })
            await last.focus()
            await expect(last).toBeFocused()
            if (count >= 7) await expect.poll(() => panel.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
            if (count === 32)
              await page.screenshot({ path: info.outputPath(`mobile-${mode}-${width}.png`), fullPage: true })
            await page.keyboard.press('Escape')
            await expect(panel).toHaveCount(0)
            await expect(trigger).toBeFocused()
          }
          data = { ...data, count: 7, current: 'missing', reversed: true }
          await page.evaluate((input) => window.updateMobileHeaderContent(input), data)
          await trigger.click()
          await expect(panel.locator('[aria-current="page"]')).toHaveCount(0)
          const original = panel.getByRole('button', { name: `${copy.agents.repeat(8)} 2`, exact: true })
          await original.focus()
          await page.evaluate((input) => window.updateMobileHeaderContent(input), { ...data, reversed: false })
          await expect(original).toBeFocused()
          await original.press('Enter')
          await expect(panel).toHaveCount(0)
          expect(await page.evaluate(() => window.mobileHeaderContentTargets())).toEqual([
            { id: 'open:owned-2', openMenus: 0 },
          ])
          await trigger.click()
          await panel.getByRole('button', { name: `${copy.settings} 3`, exact: true }).click()
          expect(await page.evaluate(() => window.mobileHeaderContentTargets())).toEqual([
            { id: 'open:owned-2', openMenus: 0 },
            { id: 'close:owned-3', openMenus: 0 },
          ])
          await trigger.click()
          await trigger.click()
          await expect(panel).toHaveCount(0)
          await trigger.click()
          await page.locator('[data-mobile-other]').click()
          await expect(panel).toHaveCount(0)
          await expect(page.getByRole('dialog', { name: copy.activity, exact: true })).toBeVisible()
          await page.locator('[data-mobile-outside]').click()
          await expect(page.getByRole('dialog')).toHaveCount(0)
          await page.evaluate((input) => window.updateMobileHeaderContent(input), {
            ...data,
            reversed: false,
            disabled: true,
            duplicate: true,
          })
          await trigger.click()
          await expect(panel.getByRole('button')).toHaveCount(12)
          await expect(panel.getByRole('button', { name: `${copy.agents.repeat(8)} 0`, exact: true })).toHaveCount(0)
          for (const button of await panel.getByRole('button').all()) await expect(button).toBeDisabled()
          await page.evaluate((input) => window.updateMobileHeaderContent(input), { ...data, count: 0 })
          await expect(trigger).toHaveCount(0)
          await expect(panel).toHaveCount(0)
          await page.evaluate((input) => window.updateMobileHeaderContent(input), data)
          await expect(trigger).toBeVisible()
          await expect(panel).toHaveCount(0)
          await trigger.click()
          await page.setViewportSize({ width: 1440, height: 1000 })
          await expect(panel).toHaveCount(0)
          await expect(trigger).not.toBeVisible()
          await page.setViewportSize({ width, height: 1000 })
        }
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    })
  }
