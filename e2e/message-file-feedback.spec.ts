import { expect, test } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { MessageFileFeedbackInput } from '../tests/fixtures/message-file-feedback-browser'

const root = join(process.cwd(), 'artifacts/desktop-elements/message-file-feedback/controlled')
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
      rolldownOptions: { input: join(process.cwd(), 'tests/fixtures/message-file-feedback.html') },
    },
  })
  server = await preview({
    configFile: false,
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 0 },
  })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Missing owned file feedback preview')
  url = `http://127.0.0.1:${address.port}/tests/fixtures/message-file-feedback.html`
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})
for (const locale of ['en-US', 'zh-CN'] as const)
  for (const mode of ['light', 'dark'] as const)
    test(`file navigation inline feedback preserves source ownership ${locale} ${mode}`, async ({ browser }, info) => {
      const context = await browser.newContext({ locale, viewport: { width: 1440, height: 1000 } })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const labels = getShellCopy(locale).session.fileReferences
      const input: MessageFileFeedbackInput = {
        locale,
        mode,
        targetKey: 'original-message',
        reference: { path: 'src/' + 'file'.repeat(250) + '.ts', line: 80, column: 4 },
      }
      try {
        await page.goto(url)
        await page.evaluate((input) => window.mountMessageFileFeedback(input), input)
        const link = page.getByRole('link', { name: labels.open(input.reference), exact: true })
        await link.focus()
        await page.keyboard.press('Enter')
        await expect(link).toHaveAttribute('aria-busy', 'true')
        const pending = page.getByRole('status')
        await expect(pending).toHaveText(labels.opening.repeat(30))
        await page.keyboard.press('Enter')
        expect(await page.evaluate(() => window.messageFileFeedbackTargets())).toEqual([
          { targetKey: input.targetKey, reference: input.reference },
        ])
        for (const width of [1440, 1100, 900, 390, 320]) {
          await page.setViewportSize({ width, height: 1000 })
          await expect(pending).toBeVisible()
          expect(await pending.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('normal')
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        }
        await page.evaluate(() => window.settleMessageFileFeedback(0, 'FILE_NOT_FOUND'))
        const alert = page.getByRole('alert')
        await expect(alert).toHaveText(labels.error('FILE_NOT_FOUND').repeat(30))
        await expect(alert).toHaveAttribute('data-session-find-exclude', 'file-navigation')
        expect(await alert.evaluate((node) => node.tagName)).toBe('SPAN')
        expect(await alert.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('normal')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: info.outputPath(`file-feedback-${locale}-${mode}-320.png`) })
        await link.focus()
        await page.keyboard.press('Enter')
        await expect(alert).toHaveCount(0)
        await expect(pending).toBeVisible()
        const replacement = { ...input, targetKey: 'replacement-message', reference: { path: 'src/new.ts', line: 2 } }
        await page.evaluate((input) => window.updateMessageFileFeedback(input), replacement)
        const replacementLink = page.getByRole('link', { name: labels.open(replacement.reference), exact: true })
        await expect(replacementLink).toBeVisible()
        await expect(pending).toHaveCount(0)
        await replacementLink.focus()
        await page.keyboard.press('Enter')
        await expect(pending).toBeVisible()
        await page.evaluate(() => window.settleMessageFileFeedback(1, 'PERMISSION_DENIED'))
        await expect(pending).toBeVisible()
        await expect(alert).toHaveCount(0)
        expect(await page.evaluate(() => window.messageFileFeedbackTargets())).toEqual([
          { targetKey: input.targetKey, reference: input.reference },
          { targetKey: input.targetKey, reference: input.reference },
          { targetKey: replacement.targetKey, reference: replacement.reference },
        ])
        await page.evaluate(() => window.settleMessageFileFeedback(2))
        await expect(pending).toHaveCount(0)
        await expect(replacementLink).not.toHaveAttribute('aria-busy', 'true')
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    })
