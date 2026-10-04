import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { build, preview, type PreviewServer } from 'vite'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { clipboardTexts } from '../tests/fixtures/tool-result-copy-fixtures'

// A separately built real-browser component harness, not a Host/API test bridge.
// The standard project preview remains at 45045; this owned preview uses 45046.
const root = join(process.cwd(), 'artifacts/tool-result-copy/lifecycle-build')
const evidence = join(process.cwd(), 'artifacts/tool-result-copy/evidence/lifecycle')
const base = 'http://127.0.0.1:45046'
let server: PreviewServer | undefined

test.beforeAll(async () => {
  test.setTimeout(60_000)
  await mkdir(root, { recursive: true })
  await mkdir(evidence, { recursive: true })
  // Generated test build inputs are ignored. Maintained fixture source remains
  // tracked, so a fresh checkout does not depend on any prior artifact.
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{margin:0}.clipboard-fixture{display:flex;flex-direction:column;gap:1rem;padding:1rem;min-inline-size:0}.clipboard-fixture-controls{display:flex;flex-wrap:wrap;gap:.5rem}.clipboard-fixture-controls button{white-space:normal}.clipboard-fixture pre{overflow:auto;margin:0}.clipboard-fixture-writes{display:flex;flex-direction:column;gap:.5rem}</style></head><body><div id="root"></div><script type="module" src="../../../tests/fixtures/tool-result-copy-browser.tsx"></script></body></html>',
  )
  await build({
    configFile: false,
    root,
    plugins: [react()],
    resolve: { dedupe: ['react', 'react-dom'] },
    build: { outDir: join(root, 'web'), emptyOutDir: true },
  })
  server = await preview({
    configFile: false,
    root,
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 45046, strictPort: true },
  })
})

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})

async function action(page: Page, id: string): Promise<void> {
  await page.locator(`[data-fixture-action="${id}"]`).click()
}

async function status(page: Page, value: string): Promise<void> {
  await expect(page.locator('[data-fixture-output] [data-copy-status]')).toHaveAttribute('data-copy-status', value)
}

async function requests(page: Page, count: number): Promise<void> {
  await expect(page.locator('[data-write-count]')).toHaveAttribute('data-write-count', String(count))
}

async function beginCopy(page: Page, locale: ShellLocale): Promise<void> {
  const button = page
    .locator('[data-fixture-output]')
    .getByRole('button', { name: getShellCopy(locale).session.messageBlocks.toolResultCopy.copy, exact: true })
  await button.focus()
  await page.keyboard.press('Enter')
  await status(page, 'copying')
  await expect(page.locator('[data-fixture-output] button')).toBeDisabled()
  await expect(page.locator('[data-fixture-output] button')).toHaveAttribute('aria-busy', 'true')
}

async function open(context: BrowserContext, errors: string[], long = false): Promise<Page> {
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${base}/${long ? '?long' : ''}`)
  await expect(page.locator('[data-fixture-scenario]')).toBeVisible()
  return page
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`controlled lifecycle captures original output, invalidates late receipts, retries and bounds copy: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    try {
      const errors: string[] = []
      const page = await open(context, errors)
      const labels = getShellCopy(locale).session.messageBlocks.toolResultCopy
      await beginCopy(page, locale)
      await requests(page, 1)
      // Repeated DOM events while the request is pending must not cause a
      // second write. This is not a claim about a pre-commit React event race.
      await page.locator('[data-fixture-output] button').evaluate((button) => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      await requests(page, 1)
      await expect(page.locator('[data-write-index="0"]')).toHaveText(clipboardTexts.a)
      await action(page, 'b')
      await status(page, 'idle')
      await action(page, 'resolve')
      await status(page, 'idle')
      await beginCopy(page, locale)
      await requests(page, 2)
      await expect(page.locator('[data-write-index="1"]')).toHaveText(clipboardTexts.b)
      await action(page, 'reject')
      await status(page, 'failed')
      await expect(page.locator('[data-fixture-output]').getByRole('alert')).toHaveText(labels.failed)
      await page.getByRole('button', { name: labels.retry, exact: true }).click()
      await status(page, 'copying')
      await requests(page, 3)
      await action(page, 'resolve')
      await status(page, 'copied')
      await status(page, 'idle')

      await action(page, 'a')
      await beginCopy(page, locale)
      await action(page, 'replacement')
      await status(page, 'idle')
      await action(page, 'reject')
      await status(page, 'idle')
      await expect(page.locator('[data-fixture-output]')).toContainText(clipboardTexts.replacement)
      await beginCopy(page, locale)
      await action(page, 'a')
      await action(page, 'replacement')
      await status(page, 'idle')
      await action(page, 'resolve')
      await status(page, 'idle')
      await action(page, 'a')
      await beginCopy(page, locale)
      await action(page, 'b')
      await action(page, 'a')
      await status(page, 'idle')
      await action(page, 'resolve')
      await status(page, 'idle')
      await beginCopy(page, locale)
      await action(page, 'unmounted')
      await expect(page.locator('[data-fixture-output]')).toHaveCount(0)
      await action(page, 'a')
      await action(page, 'resolve')
      await status(page, 'idle')

      const beforeUnavailable = await page.locator('[data-write-count]').getAttribute('data-write-count')
      await action(page, 'unavailable')
      await page.locator('[data-fixture-output] button').click()
      await status(page, 'unavailable')
      await expect(page.locator('[data-fixture-output]').getByRole('alert')).toHaveText(labels.unavailable)
      await expect(page.locator('[data-write-count]')).toHaveAttribute('data-write-count', beforeUnavailable ?? '')
      await action(page, 'available')
      await page.getByRole('button', { name: labels.retry, exact: true }).click()
      await action(page, 'resolve')
      await status(page, 'copied')
      await action(page, 'blank')
      await expect(page.locator('[data-fixture-output] .hbar-session-tool-result-copy')).toHaveCount(0)
      await action(page, 'limit')
      await beginCopy(page, locale)
      const lastWrite = page.locator('[data-write-index]').last()
      await expect(lastWrite).toHaveAttribute('data-write-length', '1000000')
      await action(page, 'resolve')
      await status(page, 'copied')
      const beforeOver = await page.locator('[data-write-count]').getAttribute('data-write-count')
      await action(page, 'over')
      await status(page, 'too_large')
      await expect(page.getByRole('button', { name: labels.copy, exact: true })).toBeDisabled()
      await expect(page.locator('[data-fixture-output]').getByRole('status')).toHaveText(labels.tooLarge(1_000_000))
      await expect(page.locator('[data-write-count]')).toHaveAttribute('data-write-count', beforeOver ?? '')
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 960 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: `${evidence}/capacity-${locale}-${width}.png` })
      }
      const longPage = await open(context, errors, true)
      for (const width of [1440, 320]) {
        await longPage.setViewportSize({ width, height: 960 })
        await expect(longPage.locator('[data-fixture-output] button')).toBeVisible()
        expect(await longPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await longPage.screenshot({ path: `${evidence}/long-idle-${locale}-${width}.png` })
      }
      await longPage.locator('[data-fixture-output] button').click()
      await action(longPage, 'reject')
      await status(longPage, 'failed')
      for (const width of [1440, 320]) {
        await longPage.setViewportSize({ width, height: 960 })
        await expect(longPage.locator('[data-fixture-output] button')).toBeVisible()
        expect(await longPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await longPage.screenshot({ path: `${evidence}/long-failure-${locale}-${width}.png` })
      }
      expect(errors).toEqual([])
      await writeFile(
        `${evidence}/observation-${locale}.json`,
        JSON.stringify(
          {
            actualHost: false,
            controlledClipboard: true,
            originalPayloadCaptured: true,
            lateTargetTextUnmountReceiptsDiscarded: true,
            duplicateWrites: 0,
            retryAfterExplicitRejection: true,
            utf16Limit: 1_000_000,
            errors,
          },
          null,
          2,
        ),
      )
    } finally {
      await context.close()
    }
  })
}
