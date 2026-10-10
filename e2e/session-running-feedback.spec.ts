import { expect, test, type Locator } from '@playwright/test'
import { createRunCommandClient } from '@hbar/client'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanup(root: string): Promise<void> {
  if (dirname(root) !== (await realpath(tmpdir())) || !basename(root).startsWith('hbar-running-feedback-'))
    throw new Error('Unexpected running feedback fixture path')
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}

async function rotation(spinner: Locator): Promise<string> {
  return spinner.evaluate((node) => getComputedStyle(node).rotate)
}

for (const locale of ['zh-CN', 'en-US'] as const)
  test(`session visibly runs and stops honestly across motion and connection changes: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(90_000)
    const root = await realpath(await mkdtemp(join(tmpdir(), 'hbar-running-feedback-')))
    const context = await browser.newContext({ locale, colorScheme: locale === 'zh-CN' ? 'dark' : 'light' })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      const client = host.client
      const sessionId = host.ready.sessionId
      const runs = createRunCommandClient(client)
      const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      page.setDefaultTimeout(10_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const copy = getShellCopy(locale)
      await page.goto(origin)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const submit = (text: string, approval?: 'ask') =>
        runs.execute(
          'run.submit',
          {
            sessionId,
            modelId: 'local-fixture',
            input: { text, images: [], ...(approval ? { approval } : {}) },
          },
          { idempotencyKey: crypto.randomUUID() },
        )
      const active = await submit('/slow')
      const header = page.locator(
        '.hbar-app-react-session-workspace > .lumen-page-header .hbar-session-execution-status',
      )
      const dock = page.locator('.hbar-session-live-status-badge .hbar-session-execution-status')
      for (const status of [header, dock]) {
        await expect(status).toHaveAttribute('data-state', 'running')
        await expect(status).toContainText(copy.session.liveStatus.statusLabel('running'))
        const spinner = status.locator('.hbar-session-execution-spinner')
        await expect(spinner).toBeVisible()
        expect(await spinner.evaluate((node) => getComputedStyle(node).animationName)).toBe(
          'hbar-session-execution-spin',
        )
        const first = await rotation(spinner)
        await expect.poll(() => rotation(spinner)).not.toBe(first)
      }
      await page.screenshot({ path: info.outputPath('running-desktop.png') })
      await page.setViewportSize({ width: 320, height: 900 })
      await expect(dock).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: info.outputPath('running-narrow.png') })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await expect(dock).toContainText(copy.session.liveStatus.statusLabel('running'))
      expect(
        await dock.locator('.hbar-session-execution-spinner').evaluate((node) => getComputedStyle(node).animationName),
      ).toBe('none')
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page
        .locator('.lumen-prompt-composer')
        .getByRole('button', { name: copy.session.prompt.stop, exact: true })
        .click()
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: active.operationId })).status)
        .toBe('cancelled')
      await expect(page.locator('.hbar-session-execution-spinner')).toHaveCount(0)
      const waiting = await submit('/tool write_file {"path":"waiting-feedback.txt","text":"do not approve"}', 'ask')
      await expect(dock).toHaveAttribute('data-state', 'waiting_approval')
      await expect(dock).toContainText(copy.session.liveStatus.statusLabel('waiting_approval'))
      await expect(page.locator('.hbar-session-execution-spinner')).toHaveCount(0)
      await runs.execute('operation.cancel', { operationId: waiting.operationId })
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: waiting.operationId })).status)
        .toBe('cancelled')
      await submit('/slow')
      await expect(dock).toHaveAttribute('data-state', 'running')
      await stopWebSessionHost(host)
      host = undefined
      await expect(dock).toHaveAttribute('data-state', 'unconfirmed')
      await expect(dock).toContainText(copy.session.liveStatus.offline)
      await expect(header).toHaveAttribute('data-state', 'unconfirmed')
      await expect(page.locator('.hbar-session-execution-spinner')).toHaveCount(0)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanup(root)
    }
  })
