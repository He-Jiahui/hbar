import { expect, test } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import {
  completeUsageModelId,
  originalBudgetSessionId,
  usageFeedbackLabels,
} from '../tests/fixtures/usage-feedback-data'
import type { UsageFeedbackInput } from '../tests/fixtures/usage-feedback-browser'

const root = join(process.cwd(), 'artifacts/desktop-elements/usage-feedback-content/controlled')
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
      rolldownOptions: { input: join(process.cwd(), 'tests/fixtures/usage-feedback.html') },
    },
  })
  server = await preview({
    configFile: false,
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 0 },
  })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Missing owned usage content preview')
  url = `http://127.0.0.1:${address.port}/tests/fixtures/usage-feedback.html`
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})
for (const locale of ['en-US', 'zh-CN'] as const)
  for (const mode of ['light', 'dark'] as const)
    test(`request and budget owned feedback ${locale} ${mode}`, async ({ browser }, info) => {
      test.setTimeout(90_000)
      const context = await browser.newContext({ locale, viewport: { width: 1440, height: 1000 } })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const labels = usageFeedbackLabels(locale)
      const input: UsageFeedbackInput = { locale, mode, count: 3 }
      try {
        await page.goto(url)
        await page.evaluate((input) => window.mountUsageFeedback(input), input)
        const requests = page.locator('.hbar-usage-feedback').nth(0)
        const budget = page.locator('.hbar-usage-feedback').nth(1)
        for (const width of [1440, 1100, 900, 390, 320]) {
          await page.setViewportSize({ width, height: 1000 })
          for (const [surface, title] of [
            [requests, labels.requests.title],
            [budget, labels.budget.title],
          ] as const) {
            const heading = surface.getByRole('heading', { name: title, exact: true })
            await heading.scrollIntoViewIfNeeded()
            await expect(heading).toBeVisible()
            expect(await heading.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('normal')
            expect(await heading.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
          }
          const model = requests.locator(
            '[data-request-id="usage-0"] :is(.lumen-usage-request-model, .lumen-usage-request-mobile-model):visible',
          )
          await expect(model).toHaveText(completeUsageModelId)
          expect(await model.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('normal')
          expect(await model.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
          for (const reader of [
            requests.getByRole('tablist', { name: labels.requests.request, exact: true }),
            requests.getByRole('group', { name: labels.requests.title, exact: true }),
            budget.getByRole('region', { name: labels.budget.cap, exact: true }),
            budget.getByRole('group', { name: labels.budget.title, exact: true }),
          ]) {
            await expect(reader).toHaveAttribute('tabindex', '0')
            await reader.evaluate((node) => {
              node.scrollLeft = 0
            })
            await reader.focus()
            await page.keyboard.press('ArrowRight')
            if (await reader.evaluate((node) => node.scrollWidth > node.clientWidth + 1))
              await expect.poll(() => reader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          }
          for (const [surface, title] of [
            [requests, labels.requests.title],
            [budget, labels.budget.title],
          ] as const) {
            expect(
              await surface.getByRole('heading', { name: title, exact: true }).evaluate((node) => {
                const owner = node.closest('main')?.getBoundingClientRect()
                const bounds = node.getBoundingClientRect()
                return Boolean(owner && bounds.left >= owner.left - 1 && bounds.right <= owner.right + 1)
              }),
            ).toBe(true)
          }
          expect(await page.getByRole('main').evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          if (width === 320) {
            await requests
              .getByRole('heading', { name: labels.requests.title, exact: true })
              .evaluate((node) => node.scrollIntoView({ block: 'start', inline: 'nearest' }))
            await page.screenshot({ path: info.outputPath(`usage-titles-${locale}-${mode}-320.png`) })
            await requests
              .locator('[data-request-id="usage-0"]')
              .evaluate((node) => node.scrollIntoView({ block: 'start', inline: 'nearest' }))
            await page.screenshot({ path: info.outputPath(`usage-model-${locale}-${mode}-320.png`) })
          }
        }
        const entry = requests.locator('[data-request-id="usage-0"]')
        await entry.getByRole('button', { expanded: false }).focus()
        await page.keyboard.press('Enter')
        const open = entry.getByRole('button', { name: labels.requests.open, exact: true })
        await open.focus()
        await page.keyboard.press('Enter')
        await expect(requests.getByRole('alert')).toHaveText(labels.requests.error('EXECUTION_FAILED'))
        expect(await page.evaluate(() => window.usageFeedbackDebug().opened)).toEqual([
          { usageId: 'usage-0', sessionId: originalBudgetSessionId, workspaceId: 'original-workspace', runId: 'run-0' },
        ])
        await page.evaluate(() => window.updateUsageFeedback({ queryError: true }))
        await expect(requests.getByRole('alert')).toHaveText(labels.requests.error('DISCONNECTED'))
        await page.evaluate(() => window.configureUsageFeedback({ queryError: false }))
        await requests.getByRole('button', { name: labels.requests.retry, exact: true }).focus()
        await page.keyboard.press('Enter')
        await expect(requests.locator('[data-request-id]')).toHaveCount(3)
        for (const count of [0, 1, 3, 400, 401]) {
          await page.evaluate((count) => window.updateUsageFeedback({ count, duplicate: true }), count)
          await expect(requests.locator('[data-request-id]')).toHaveCount(Math.min(count, 50))
          while (await page.evaluate(() => window.usageFeedbackDebug().hasMore)) {
            const before = await page.evaluate(() => window.usageFeedbackDebug().count)
            await requests.getByRole('button', { name: labels.requests.next, exact: true }).focus()
            await page.keyboard.press('Enter')
            await expect
              .poll(() => page.evaluate(() => window.usageFeedbackDebug().count))
              .toBe(Math.min(count, 400, before + 50))
          }
          expect(await page.evaluate(() => window.usageFeedbackDebug().count)).toBe(Math.min(count, 400))
          await expect(requests.locator('[data-request-id]')).toHaveCount(Math.min(count, 400))
        }
        const cap = budget.getByRole('spinbutton', { name: labels.budget.cap, exact: true })
        const save = budget.getByRole('button', { name: labels.budget.save, exact: true })
        await cap.fill('12345')
        await save.focus()
        await page.keyboard.press('Enter')
        await expect(budget.getByRole('alert')).toHaveText(labels.budget.error('COMMAND_CONFLICT'))
        await expect(cap).toHaveValue('12345')
        await budget.getByRole('button', { name: labels.budget.retry, exact: true }).focus()
        await page.keyboard.press('Enter')
        await expect(save).toBeDisabled()
        await page.evaluate(() => window.configureUsageFeedback({ write: 'unknown' }))
        await cap.fill('54321')
        await save.focus()
        await page.keyboard.press('Enter')
        const check = budget.getByRole('button', { name: labels.budget.reconcile, exact: true })
        await expect(check).toBeEnabled()
        await expect(
          budget.getByText(labels.budget.pendingTarget(originalBudgetSessionId), { exact: true }),
        ).toBeVisible()
        const unknownReader = budget.getByRole('group', { name: labels.budget.unknown, exact: true })
        await unknownReader.evaluate((node) => {
          node.scrollLeft = 0
        })
        await unknownReader.focus()
        await page.keyboard.press('ArrowRight')
        await expect.poll(() => unknownReader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
        expect(await page.getByRole('main').evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        await page.evaluate(() => window.switchUsageFeedbackBudgetTarget('replacement-session'))
        await expect(cap).toBeDisabled()
        await expect(budget.getByRole('button', { name: labels.budget.saving, exact: true })).toBeDisabled()
        await check.focus()
        await page.keyboard.press('Enter')
        await expect(check).toHaveCount(0)
        await expect(cap).toBeEnabled()
        const debug = await page.evaluate(() => window.usageFeedbackDebug())
        expect(debug.writes).toHaveLength(2)
        expect(debug.writes.map(({ sessionId, tokens }) => ({ sessionId, tokens }))).toEqual([
          { sessionId: originalBudgetSessionId, tokens: 12345 },
          { sessionId: originalBudgetSessionId, tokens: 54321 },
        ])
        expect(debug.receiptReads).toBe(1)
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    })
