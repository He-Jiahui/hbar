import { expect, test } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import type { NotificationContentInput } from '../tests/fixtures/notification-content-browser'
import { notificationFixtureTitle, notificationFixtureDetail } from '../tests/fixtures/notification-content-data'
import { notificationCopy } from '../apps/web/src/notification-copy'

const root = join(process.cwd(), 'artifacts/desktop-elements/notification-content/controlled')
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
      rolldownOptions: { input: join(process.cwd(), 'tests/fixtures/notification-content.html') },
    },
  })
  server = await preview({
    configFile: false,
    root: process.cwd(),
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 0, strictPort: false },
  })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Missing owned notification preview')
  url = `http://127.0.0.1:${address.port}/tests/fixtures/notification-content.html`
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})
for (const locale of ['en-US', 'zh-CN'] as const)
  for (const mode of ['light', 'dark'] as const) {
    test(`complete notification content and owned feedback ${locale} ${mode}`, async ({ browser }, info) => {
      const context = await browser.newContext({ locale, viewport: { width: 1440, height: 1200 } })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const input: NotificationContentInput = { locale, mode, count: 1, long: true, permissionError: true }
      const labels = notificationCopy(locale)
      try {
        await page.goto(url)
        await page.evaluate((input) => window.mountNotificationContent(input), input)
        const title = page.locator('.lumen-notifications-center-copy [data-text-context="collection.title"]').first()
        const detail = page
          .locator('.lumen-notifications-center-copy [data-text-context="collection.description"]')
          .first()
        await expect(title).toHaveText(notificationFixtureTitle(locale))
        await expect(detail).toHaveText(notificationFixtureDetail(locale))
        for (const width of [1440, 1100, 900, 390, 320]) {
          await page.setViewportSize({ width, height: 1200 })
          for (const text of [
            title,
            detail,
            page.getByRole('heading', { name: labels.title.repeat(8), exact: true }),
            page.getByRole('alert'),
          ]) {
            expect(await text.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('normal')
            expect(await text.evaluate((node) => getComputedStyle(node).webkitLineClamp)).toBe('none')
            expect(await text.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
            expect(await text.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true)
          }
          const reader = page.locator('.hbar-web-notifications-page').getByRole('navigation')
          await reader.focus()
          await expect(reader).toBeFocused()
          await reader.evaluate((node) => {
            node.scrollLeft = 0
          })
          if (await reader.evaluate((node) => node.scrollWidth > node.clientWidth)) {
            await reader.press('ArrowRight')
            await expect.poll(() => reader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          }
          const feed = page.locator('.lumen-notifications-feed')
          expect(await feed.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          if (width === 320) await page.screenshot({ path: info.outputPath(`notifications-${locale}-${mode}-320.png`) })
        }
        const native = page.getByRole('switch', { name: labels.nativeEnabled.repeat(8), exact: true })
        await page.evaluate((input) => window.updateNotificationContent({ ...input, permissionPending: true }), input)
        await expect(native).toBeDisabled()
        await page.evaluate((input) => window.updateNotificationContent(input), input)
        await expect(native).toBeEnabled()
        await expect(native).not.toBeChecked()
        await native.focus()
        await page.keyboard.press('Space')
        await expect(native).toBeChecked()
        await page.evaluate(() => window.failNotificationContentRead(false))
        await expect(native).toBeChecked()
        await native.focus()
        await page.keyboard.press('Space')
        await expect(native).not.toBeChecked()
        await page.getByRole('button', { name: labels.preferencesTab.repeat(8), exact: true }).focus()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('heading', { name: labels.preferenceTitle.repeat(8), exact: true })).toBeVisible()
        await page.getByRole('button', { name: labels.centerTab.repeat(8), exact: true }).focus()
        await page.keyboard.press('Enter')
        await page.evaluate(() => window.failNotificationContentNavigation(true))
        await page.getByRole('button', { name: labels.open(notificationFixtureTitle(locale)), exact: true }).focus()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('alert').filter({ hasText: labels.navigationFailed })).toBeVisible()
        expect(await page.evaluate(() => window.notificationContentOpens())).toEqual([
          {
            kind: 'session',
            workspaceId: 'original-workspace',
            sessionId: 'original-session-0',
            runId: 'original-run-0',
          },
        ])
        await page.evaluate(() => window.failNotificationContentRead(true))
        await expect(page.getByRole('alert').filter({ hasText: labels.deliveryFailed.repeat(5) })).toBeVisible()
        await page.evaluate(() => window.failNotificationContentRead(false))
        await expect(page.getByRole('alert').filter({ hasText: labels.deliveryFailed.repeat(5) })).toHaveCount(0)
        for (const count of [0, 1, 3, 400, 401]) {
          await page.evaluate((count) => window.populateNotificationContent(count, true), count)
          await expect(page.locator('.lumen-notifications-feed li')).toHaveCount(Math.min(count, 400))
        }
        await expect(page.getByRole('status', { name: '' }).filter({ hasText: labels.capacity(400) })).toBeVisible()
        await expect(page.getByRole('button', { name: labels.loadMore, exact: true })).toHaveCount(0)
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    })
  }
