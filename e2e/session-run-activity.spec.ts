import { expect, test } from '@playwright/test'
import { createRunCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`current run actions stay visible and history grows only on demand: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-run-activity-'))
    const context = await browser.newContext({ locale })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        budgetAutoContinue: false,
      })
      const client = host.client
      const sessionId = host.ready.sessionId
      const commands = createRunCommandClient(client)
      const snapshot = () => client.call('session.snapshot', { sessionId })
      const submit = (text: string) =>
        commands.execute(
          'run.submit',
          { sessionId, modelId: 'local-fixture', input: { text, images: [] } },
          { idempotencyKey: crypto.randomUUID() },
        )
      for (let index = 0; index < 22; index++) {
        const accepted = await submit(`Reading history ${index}`)
        await expect
          .poll(async () => (await snapshot()).runs.find((run) => run.id === accepted.operationId)?.status)
          .toBe('completed')
      }
      const copy = getShellCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      page.setDefaultTimeout(15_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      const session = await client.call('session.get', { sessionId })
      if (!session) throw new Error('Fixture session disappeared')
      await page.getByRole('treeitem', { name: session.title, exact: true }).click()
      const activity = page.getByRole('region', { name: copy.session.runs.title, exact: true })
      const details = activity.getByRole('button', { name: copy.session.runs.details(22), exact: true })
      await expect(details).toHaveAttribute('aria-expanded', 'false')
      await expect(activity.getByRole('list')).toBeHidden()
      await details.focus()
      await page.keyboard.press('Enter')
      await expect(activity.getByRole('listitem')).toHaveCount(20)
      await activity.getByRole('button', { name: copy.session.runs.more(1), exact: true }).click()
      await expect(activity.getByRole('listitem')).toHaveCount(21)
      await details.click()
      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await activity.scrollIntoViewIfNeeded()
        await expect(activity.locator('.hbar-session-run-current')).toBeInViewport()
        await expect(activity.locator('.hbar-session-run-current')).toContainText(
          copy.session.runs.statusLabel('completed'),
        )
        expect(
          await activity
            .locator('.hbar-session-run-history')
            .evaluate((element) => element.getBoundingClientRect().height),
        ).toBeLessThan(60)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: testInfo.outputPath(`activity-${locale}-${width}.png`) })
      }
      const failed = await submit('/fail')
      await expect
        .poll(async () => (await snapshot()).runs.find((run) => run.id === failed.operationId)?.status)
        .toBe('failed')
      const retry = activity
        .locator('.hbar-session-run-current')
        .getByRole('button', { name: copy.session.runs.retryLabel, exact: true })
      await expect(retry).toBeVisible()
      await retry.click()
      await expect.poll(async () => (await snapshot()).runs.length).toBe(24)
      const running = await submit('/slow')
      await expect
        .poll(async () => (await snapshot()).runs.find((run) => run.id === running.operationId)?.status)
        .toBe('running')
      await submit('/slow')
      await expect(activity.locator('.hbar-session-run-current')).toHaveAttribute('data-run-id', running.operationId)
      await expect(page.locator('.hbar-app-react-shell-header')).toBeVisible()
      await expect(page.locator('.hbar-app-react-session-workspace > .lumen-page-header')).toBeHidden()
      await page.setViewportSize({ width: 1440, height: 900 })
      await expect(page.locator('.hbar-app-react-session-workspace > .lumen-page-header')).toBeVisible()
      expect(
        (await page.locator('.hbar-app-react-session-workspace > .lumen-page-header').boundingBox())?.height,
      ).toBeLessThan(90)
      await activity
        .locator('.hbar-session-run-current')
        .getByRole('button', { name: copy.session.runs.cancelLabel, exact: true })
        .click()
      await expect
        .poll(async () => (await snapshot()).runs.find((run) => run.id === running.operationId)?.status)
        .toBe('cancelled')
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
