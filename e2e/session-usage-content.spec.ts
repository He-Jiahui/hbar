import { expect, test } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import type { SessionUsageContentInput } from '../tests/fixtures/session-usage-content-browser'
import { getShellCopy } from '../apps/web/src/shell-copy'

const root = join(process.cwd(), 'artifacts/desktop-elements/session-usage-content/controlled')
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
      rolldownOptions: { input: join(process.cwd(), 'tests/fixtures/session-usage-content.html') },
    },
  })
  server = await preview({
    configFile: false,
    root: process.cwd(),
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 0, strictPort: false },
  })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Missing owned usage preview')
  url = `http://127.0.0.1:${address.port}/tests/fixtures/session-usage-content.html`
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})

for (const locale of ['en-US', 'zh-CN'] as const)
  for (const width of [1440, 1100, 900, 390, 320]) {
    test(`usage copy, original scope and shared floating lifecycle ${locale} ${width}`, async ({ browser }, info) => {
      const context = await browser.newContext({ locale, viewport: { width, height: 1000 } })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      try {
        await page.goto(url)
        await page.evaluate(() => {
          document.documentElement.style.zoom = '1.25'
        })
        const copy = getShellCopy(locale).session.usage
        const trigger = page.locator('.hbar-session-usage-trigger')
        const dialog = page.getByRole('dialog', { name: copy.title.repeat(8), exact: true })
        for (const mode of ['light', 'dark'] as const) {
          for (const kind of ['empty', 'known', 'warning', 'exhausted', 'error'] as const) {
            const data: SessionUsageContentInput = { locale, mode, kind, long: true }
            await page.evaluate((input) => window.mountSessionUsageContent(input), data)
            await trigger.focus()
            await trigger.press('Enter')
            await expect(dialog).toBeVisible()
            await expect(dialog.getByRole('button', { name: copy.close, exact: true })).toBeFocused()
            await expect(dialog.locator('[data-text-context="popover.title"]')).toHaveText(copy.title.repeat(8))
            expect(await dialog.evaluate((node) => node.parentElement === document.body)).toBe(true)
            const style = await dialog.evaluate((node) => ({
              blur: getComputedStyle(node).backdropFilter,
              zIndex: Number(getComputedStyle(node).zIndex),
            }))
            expect(style.blur).toContain('blur(')
            expect(style.zIndex).toBeGreaterThan(1000)
            const bounds = await dialog.boundingBox()
            if (!bounds) throw new Error('Missing visible usage bounds')
            expect(bounds.x).toBeGreaterThanOrEqual(-1)
            expect(bounds.y).toBeGreaterThanOrEqual(-1)
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1)
            const geometry = await dialog.evaluate((node) => {
              const style = getComputedStyle(node)
              return {
                width: style.width,
                height: style.height,
                left: style.insetInlineStart,
                top: style.insetBlockStart,
                maxBlock: style.maxBlockSize,
                box: style.boxSizing,
                zoom: getComputedStyle(document.documentElement).zoom,
                viewport: innerHeight,
              }
            })
            expect(bounds.y + bounds.height, JSON.stringify(geometry)).toBeLessThanOrEqual(1001)
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
            await expect(dialog.getByRole('progressbar')).toHaveCount(kind === 'empty' ? 0 : 1)
            await expect(dialog.getByRole('alert')).toHaveCount(kind === 'error' ? 1 : 0)
            await expect(dialog.getByRole('status')).toHaveCount(kind === 'warning' || kind === 'exhausted' ? 1 : 0)
            const flow = await dialog.evaluate((node) => {
              const metrics = node.querySelector('.lumen-compact-metrics')?.getBoundingClientRect()
              const actions = node.querySelector('.hbar-session-usage-actions')?.getBoundingClientRect()
              return { metricsBottom: metrics?.bottom, actionsTop: actions?.top }
            })
            if (flow.metricsBottom === undefined || flow.actionsTop === undefined)
              throw new Error('Missing complete usage content flow')
            expect(flow.metricsBottom).toBeLessThanOrEqual(flow.actionsTop + 1)
            if (kind === 'known' || kind === 'error')
              await page.screenshot({ path: info.outputPath(`usage-${kind}-${mode}-${width}.png`), fullPage: true })
            const dataReaders = dialog.locator('.lumen-inline-usage-total, .lumen-compact-metrics > [role="group"]')
            await expect(dataReaders).toHaveCount(5)
            for (const reader of await dataReaders.all()) {
              await reader.focus()
              await expect(reader).toBeFocused()
              if (await reader.evaluate((node) => node.scrollWidth > node.clientWidth)) {
                await reader.press('ArrowRight')
                await expect.poll(() => reader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
              }
            }
            const actionReader = dialog.locator('.hbar-session-usage-actions')
            await actionReader.focus()
            if (await actionReader.evaluate((node) => node.scrollWidth > node.clientWidth)) {
              await actionReader.press('ArrowRight')
              await expect.poll(() => actionReader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
            }
            if (kind === 'known')
              await page.screenshot({ path: info.outputPath(`usage-reading-${mode}-${width}.png`), fullPage: true })
            await page.keyboard.press('Escape')
            await expect(dialog).not.toBeVisible()
            await expect(trigger).toBeFocused()
          }
          const data: SessionUsageContentInput = { locale, mode, kind: 'known', long: true, unknownBudget: true }
          await page.evaluate((input) => window.mountSessionUsageContent(input), data)
          await trigger.click()
          await expect(dialog).toBeVisible()
          await expect(dialog.getByRole('progressbar')).toHaveCount(0)
          const sheet = (await dialog.getAttribute('data-mobile-sheet')) === 'true'
          if (sheet) await page.keyboard.press('Escape')
          else await trigger.click()
          await expect(dialog).not.toBeVisible()
          await trigger.click()
          if (sheet) {
            const bounds = await dialog.boundingBox()
            if (!bounds || bounds.y < 2) throw new Error('Missing visible sheet backdrop area')
            await page.mouse.click(width / 2, bounds.y / 2)
            await expect(dialog).not.toBeVisible()
          }
          await page.locator('[data-usage-other]').click()
          await expect(dialog).not.toBeVisible()
          await expect(page.getByRole('dialog', { name: copy.sparkline, exact: true })).toBeVisible()
          await page.locator('[data-usage-outside]').click()
          await expect(page.getByRole('dialog')).toHaveCount(0)
          await trigger.click()
          await expect(dialog).toBeVisible()
          await page.evaluate((input) => window.updateSessionUsageContent(input), {
            ...data,
            sessionId: 'foreign-session',
          })
          await expect(dialog).not.toBeVisible()
          await page.evaluate((input) => window.updateSessionUsageContent(input), data)
          await expect(dialog).not.toBeVisible()
          await trigger.click()
          const action = dialog.getByRole('button', { name: copy.monitor.repeat(8), exact: true })
          await action.focus()
          await action.press('Enter')
          await expect(dialog).not.toBeVisible()
          expect(await page.evaluate(() => window.sessionUsageContentTargets())).toEqual(['owned-session'])
          await page.screenshot({ path: info.outputPath(`usage-${mode}-${width}.png`), fullPage: true })
          await page.evaluate((input) => window.mountSessionUsageContent(input), { ...data, sessionId: null })
          await expect(trigger).toBeDisabled()
        }
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    })
  }
