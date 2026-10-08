import { expect, test } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import { generalSettingsCopy } from '../apps/web/src/general-settings-copy'
import { desktopChromeCopy } from '../apps/web/src/desktop-chrome-copy'
import type { DesktopChromeFixtureInput } from '../tests/fixtures/desktop-chrome-browser'

const root = join(process.cwd(), 'artifacts/desktop-elements/native-chrome/controlled')
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
      rolldownOptions: { input: join(process.cwd(), 'tests/fixtures/desktop-chrome.html') },
    },
  })
  server = await preview({
    configFile: false,
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 0 },
  })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Missing owned Desktop copy preview')
  url = `http://127.0.0.1:${address.port}/tests/fixtures/desktop-chrome.html`
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})
for (const locale of ['en-US', 'zh-CN'] as const)
  for (const mode of ['light', 'dark'] as const)
    test(`Desktop language failure feedback and latest receipt ${locale} ${mode}`, async ({ browser }, info) => {
      const context = await browser.newContext({ locale, viewport: { width: 1440, height: 1000 } })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const input: DesktopChromeFixtureInput = { locale, mode }
      const labels = generalSettingsCopy(locale)
      const snapshot = () => page.evaluate(() => window.desktopChromeSnapshot())
      try {
        await page.goto(url)
        await page.evaluate((value) => window.mountDesktopChrome(value), input)
        await expect.poll(async () => (await snapshot()).status).toBe('error')
        for (const width of [1440, 1100, 900, 390, 320]) {
          await page.setViewportSize({ width, height: 1000 })
          const error = page.getByRole('alert')
          await expect(error).toHaveText(labels.desktopChrome.error.repeat(30))
          expect(await error.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('normal')
          expect(await error.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
          const reader = page.getByRole('group', { name: labels.desktopChrome.retry.repeat(30), exact: true })
          await reader.focus()
          await page.keyboard.press('ArrowRight')
          await expect.poll(() => reader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          const heading = page.getByRole('heading', { name: labels.title, exact: true })
          const bounds = await heading.boundingBox()
          expect(bounds?.x).toBeGreaterThanOrEqual(0)
          expect((bounds?.x ?? width) + (bounds?.width ?? width)).toBeLessThanOrEqual(width + 1)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        }
        await page.screenshot({ path: info.outputPath(`${locale}-${mode}-320.png`) })
        expect((await snapshot()).calls).toEqual([desktopChromeCopy(locale)])
        await page.evaluate(() => window.repairDesktopChrome())
        const retry = page.getByRole('button', { name: labels.desktopChrome.retry.repeat(30), exact: true })
        await retry.focus()
        await page.keyboard.press('Enter')
        await expect.poll(async () => (await snapshot()).status).toBe('synced')
        await expect(page.getByRole('radio', { name: labels.options[locale], exact: true })).toBeFocused()
        expect((await snapshot()).calls).toEqual([desktopChromeCopy(locale), desktopChromeCopy(locale)])
        await page.evaluate(() => window.holdDesktopChrome())
        const other = locale === 'en-US' ? 'zh-CN' : 'en-US'
        await page.getByRole('radio', { name: labels.options[other], exact: true }).click()
        await expect.poll(async () => (await snapshot()).status).toBe('pending')
        await page.getByRole('radio', { name: labels.options[locale], exact: true }).click()
        expect((await snapshot()).calls).toHaveLength(3)
        await page.evaluate(() => window.releaseDesktopChromeReply())
        await expect.poll(async () => (await snapshot()).status).toBe('synced')
        expect((await snapshot()).calls).toEqual([
          desktopChromeCopy(locale),
          desktopChromeCopy(locale),
          desktopChromeCopy(other),
          desktopChromeCopy(locale),
        ])
        expect((await snapshot()).appliedLocale).toBe(locale)
        await page.evaluate(() => window.releaseDesktopChrome())
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    })
