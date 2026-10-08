import { expect, test } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import type { EmptyLaunchContentInput } from '../tests/fixtures/empty-launch-content-browser'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { preSessionLaunchCopy } from '../apps/web/src/pre-session-launch-copy'

const root = join(process.cwd(), 'artifacts/desktop-elements/empty-launch-content/controlled')
let server: PreviewServer | undefined
let url = ''
test.beforeAll(async () => {
  test.setTimeout(90_000)
  await build({
    configFile: false,
    root: process.cwd(),
    publicDir: join(process.cwd(), 'apps/web/public'),
    plugins: [react()],
    logLevel: 'warn',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    resolve: { dedupe: ['react', 'react-dom'] },
    build: {
      outDir: join(root, 'web'),
      emptyOutDir: true,
      chunkSizeWarningLimit: 1500,
      rolldownOptions: { input: join(process.cwd(), 'tests/fixtures/empty-launch-content.html') },
    },
  })
  server = await preview({
    configFile: false,
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 0, strictPort: false },
  })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Missing owned empty/launch preview')
  url = `http://127.0.0.1:${address.port}/tests/fixtures/empty-launch-content.html`
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})
for (const locale of ['en-US', 'zh-CN'] as const)
  for (const mode of ['light', 'dark'] as const)
    test(`empty headings and launch feedback stay readable ${locale} ${mode}`, async ({ browser }, info) => {
      const context = await browser.newContext({ locale, viewport: { width: 1440, height: 1200 } })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const input: EmptyLaunchContentInput = { locale, mode, phase: 'unknown', connected: true }
      const hero = getShellCopy(locale).session.emptyHero
      const status = preSessionLaunchCopy(locale).status
      try {
        await page.goto(url)
        await page.evaluate((input) => window.mountEmptyLaunchContent(input), input)
        await expect(page.getByRole('heading', { level: 2 })).toHaveText(hero.title.repeat(8))
        await expect(page.locator('[data-text-context="empty.description"]')).toHaveText(hero.description.repeat(40))
        for (const width of [1440, 1100, 900, 390, 320]) {
          await page.setViewportSize({ width, height: 1200 })
          for (const text of [
            page.getByRole('heading'),
            page.locator('[data-text-context="empty.description"]'),
            page.locator('.hbar-pre-session-launch-status [data-text-context="feedback.paragraph"]'),
          ]) {
            expect(await text.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('normal')
            expect(await text.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
            expect(await text.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true)
          }
          const actions = page.getByRole('group', { name: status.actions.repeat(8), exact: true })
          await expect(actions).toHaveAttribute('tabindex', '0')
          await actions.evaluate((node) => {
            node.scrollLeft = 0
          })
          await actions.focus()
          await page.keyboard.press('ArrowRight')
          if (await actions.evaluate((node) => node.scrollWidth > node.clientWidth + 1))
            await expect.poll(() => actions.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          if (width <= 390)
            expect(await page.getByRole('main').evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true)
          if (width === 320) await page.screenshot({ path: info.outputPath(`empty-launch-${locale}-${mode}-320.png`) })
        }
        const check = page.getByRole('button', { name: status.check.repeat(12), exact: true })
        await check.focus()
        await page.keyboard.press('Enter')
        await expect(page.locator('.hbar-pre-session-launch-status [role="alert"]')).toHaveText(
          status.error('DRAFT_NOT_FOUND').repeat(8),
        )
        await page.evaluate((input) => window.updateEmptyLaunchContent({ ...input, connected: false }), input)
        await expect(check).toBeDisabled()
        for (const phase of ['idle', 'accepted'] as const) {
          await page.evaluate((value) => window.mountEmptyLaunchContent(value), { ...input, phase })
          await expect(page.locator('.hbar-pre-session-launch-status')).toHaveCount(0)
        }
        for (const phase of ['preparing', 'failed'] as const) {
          await page.evaluate((value) => window.mountEmptyLaunchContent(value), { ...input, phase, primary: true })
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(hero.title.repeat(8))
          await expect(
            page.locator('.hbar-pre-session-launch-status [data-text-context="feedback.paragraph"]'),
          ).toHaveText(phase === 'failed' ? status.error('CONNECTION_CLOSED').repeat(8) : status.preparing.repeat(8))
        }
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    })
