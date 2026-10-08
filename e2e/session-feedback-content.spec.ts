import { expect, test } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import type { SessionFeedbackContentInput } from '../tests/fixtures/session-feedback-content-browser'
import { getShellCopy } from '../apps/web/src/shell-copy'

const root = join(process.cwd(), 'artifacts/desktop-elements/session-feedback-content/controlled')
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
      rolldownOptions: { input: join(process.cwd(), 'tests/fixtures/session-feedback-content.html') },
    },
  })
  server = await preview({
    configFile: false,
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 0, strictPort: false },
  })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Missing owned feedback preview')
  url = `http://127.0.0.1:${address.port}/tests/fixtures/session-feedback-content.html`
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})
for (const locale of ['en-US', 'zh-CN'] as const)
  for (const mode of ['light', 'dark'] as const)
    test(`owned execution feedback reads fully ${locale} ${mode}`, async ({ browser }, info) => {
      const context = await browser.newContext({ locale, viewport: { width: 1440, height: 1200 } })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const input: SessionFeedbackContentInput = { locale, mode, status: 'archived', connected: true, active: true }
      const copy = getShellCopy(locale).session
      try {
        await page.goto(url)
        await page.evaluate((input) => window.mountSessionFeedbackContent(input), input)
        const explanation = page.locator('.hbar-session-execution-copy')
        const title = page.locator('.hbar-session-live-status [data-text-context="feedback.title"]')
        await expect(explanation).toHaveText(copy.executionAccess.archived.repeat(8))
        await expect(title).toHaveText(copy.liveStatus.label.repeat(8))
        const workspaceName = copy.executionAccess.archived.repeat(200).slice(0, 4000)
        expect(workspaceName).toHaveLength(4000)
        await expect(page.locator('.hbar-session-execution-actions button')).toHaveText(
          copy.executionAccess.openArchived(workspaceName),
        )
        for (const width of [1440, 1100, 900, 390, 320]) {
          await page.setViewportSize({ width, height: 1200 })
          for (const text of [explanation, title]) {
            expect(await text.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('normal')
            expect(await text.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
            expect(await text.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true)
          }
          for (const reader of [
            page.locator('.hbar-session-execution-actions'),
            page.locator('.hbar-session-live-status-reading'),
            page.locator('.hbar-agent-tool-open-actions'),
          ]) {
            await expect(reader).toHaveAttribute('tabindex', '0')
            expect(await reader.getAttribute('aria-label')).toBeTruthy()
            await reader.evaluate((node) => {
              node.scrollLeft = 0
            })
            await reader.focus()
            const before = await reader.evaluate((node) => node.scrollLeft)
            await page.keyboard.press('ArrowRight')
            if (await reader.evaluate((node) => node.scrollWidth > node.clientWidth + 1))
              await expect.poll(() => reader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(before)
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          if (width === 320) await page.screenshot({ path: info.outputPath(`feedback-${locale}-${mode}-320.png`) })
        }
        await page.locator('.hbar-session-execution-actions button').focus()
        await page.keyboard.press('Enter')
        await expect(page.locator('.hbar-session-execution-notice [role="alert"]')).toHaveText(
          copy.executionAccess.error('CONNECTION_CLOSED').repeat(8),
        )
        expect(await page.evaluate(() => window.sessionFeedbackArchiveTargets())).toEqual(['original-workspace'])
        await page.locator('.hbar-agent-tool-open-actions button').focus()
        await page.keyboard.press('Enter')
        const agentError = page.locator('.hbar-agent-tool-open [role="alert"]')
        await expect(agentError).toBeVisible()
        expect(await agentError.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('normal')
        expect(await agentError.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        await page.evaluate((input) => window.updateSessionFeedbackContent({ ...input, connected: false }), input)
        await expect(page.locator('.hbar-session-execution-actions button')).toBeDisabled()
        await expect(page.locator('.hbar-agent-tool-open-actions button')).toBeDisabled()
        await expect(page.locator('.hbar-session-live-status-reading')).toHaveText(copy.liveStatus.offline.repeat(8))
        await page.evaluate(
          (input) => window.updateSessionFeedbackContent({ ...input, status: 'ready', active: false }),
          input,
        )
        await expect(page.locator('.hbar-session-execution-notice')).toHaveCount(0)
        await expect(page.locator('.hbar-session-live-status')).toHaveCount(0)
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    })
