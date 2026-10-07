import { expect, test, type Page } from '@playwright/test'
import { createRunCommandClient, createUsageCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { selectLumenOption } from './support/lumen-controls'
import { openSessionTool } from './support/session-tools-menu'

const rpc = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    params: z.object({ commandId: z.string().optional(), input: z.unknown().optional() }).passthrough().optional(),
  })
  .passthrough()
async function removeOwnedUsageFixture(root: string) {
  const resolved = resolve(root)
  if (
    root !== resolved ||
    !basename(resolved).startsWith('hbar-settings-usage-') ||
    (await realpath(dirname(resolved))) !== (await realpath(tmpdir()))
  )
    throw new Error('Refusing cleanup outside the owned usage fixture')
  await rm(resolved, { recursive: true, force: true })
}
async function selectGroup(page: Page, locale: ShellLocale, id: string, label: string) {
  const copy = getShellCopy(locale)
  const mobile = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
  if (await mobile.isVisible()) await selectLumenOption(mobile, id)
  else
    await page
      .getByRole('navigation', { name: copy.settings.groups })
      .getByRole('button', { name: label, exact: true })
      .click()
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`usage remains inside the original settings page with true Host facts and local recovery: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-settings-usage-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    const copy = getShellCopy(locale)
    const labels = copy.settingsUsage
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 44873),
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 44875}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      let fault: 'none' | 'failure' | 'hold' = 'none'
      let held: (() => void) | undefined
      let holdId: string | number | undefined
      let reads = 0
      await page.routeWebSocket('**/rpc', (socket) => {
        const server = socket.connectToServer()
        socket.onMessage((message) => {
          const parsed = typeof message === 'string' ? rpc.safeParse(JSON.parse(message)) : null
          if (parsed?.success && parsed.data.params?.commandId === 'usage.query') {
            reads++
            if (fault === 'failure') {
              fault = 'none'
              socket.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: parsed.data.id,
                  error: { code: -32603, message: 'Injected read failure', data: 'READ_FAILED' },
                }),
              )
              return
            }
            if (fault === 'hold') {
              holdId = parsed.data.id
              fault = 'none'
            }
          }
          server.send(message)
        })
        server.onMessage((message) => {
          const parsed = typeof message === 'string' ? rpc.safeParse(JSON.parse(message)) : null
          if (parsed?.success && holdId !== undefined && parsed.data.id === holdId) {
            holdId = undefined
            held = () => socket.send(message)
          } else socket.send(message)
        })
      })
      await page.goto(base)
      const project = page.getByRole('treeitem', { name: host.ready.workspaceName, exact: true })
      if ((await project.getAttribute('aria-expanded')) === 'false') {
        await project.focus()
        await project.press('ArrowRight')
        await expect(project).toHaveAttribute('aria-expanded', 'true')
      }
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = 'Original source draft stays unchanged — 原会话草稿'
      await prompt.click()
      await expect(prompt).toBeFocused()
      await page.keyboard.insertText(draft)
      await expectComposerText(prompt, draft)
      await openSessionTool(page, copy.session.tools, 'settings')
      await selectGroup(page, locale, 'usage', labels.title)
      const region = page.getByRole('region', { name: labels.title, exact: true })
      const refresh = region.getByRole('button', { name: labels.refresh, exact: true })
      await expect(region.getByText(labels.empty, { exact: true })).toBeVisible()
      await expect(page.getByRole('combobox', { name: copy.settings.scopes, exact: true })).toHaveCount(0)
      await expect(page.locator('.hbar-app-react-settings-fixed-scope')).toHaveText(copy.settings.hostScope)
      await expect(page.locator('.hbar-app-react-status-workspace')).toHaveCount(0)

      const accepted = await createRunCommandClient(host.client).execute(
        'run.submit',
        {
          sessionId: host.ready.sessionId,
          modelId: 'local-fixture',
          input: { text: 'A recorded usage sample', images: [] },
        },
        { idempotencyKey: 'settings-usage-sample' },
      )
      const client = host.client
      const sessionId = host.ready.sessionId
      await expect
        .poll(
          async () =>
            (await client.call('session.snapshot', { sessionId })).runs.find((run) => run.id === accepted.operationId)
              ?.status,
        )
        .toBe('completed')
      const report = await createUsageCommandClient(host.client).execute('usage.query', {
        scope: { kind: 'global' },
        from: Date.now() - 86_400_000,
        to: Date.now(),
        bucketMs: 3_600_000,
      })
      expect(report.totals.input + report.totals.output).toBeGreaterThan(0)
      const firstModel = report.models[0]
      if (!firstModel) throw new Error('Recorded Host usage should include its model')
      await refresh.click()
      const summary = region.getByRole('region', { name: labels.summary, exact: true })
      await expect(
        summary.getByText(labels.tokenCount(report.totals.input + report.totals.output), { exact: true }),
      ).toBeVisible()
      if (report.cost.availability === 'available' && report.cost.value !== null) {
        const value = labels.currency(report.cost.value)
        await expect(
          summary.getByText(report.cost.estimated ? labels.estimated(value) : value, { exact: true }),
        ).toBeVisible()
      } else await expect(summary.getByText(labels.costUnavailable, { exact: true })).toBeVisible()
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 960 })
        for (const window of labels.windows) {
          const button = region.getByRole('button', { name: window.label, exact: true })
          await button.focus()
          await page.keyboard.press('Enter')
          await expect(button).toHaveAttribute('aria-pressed', 'true')
          await expect(refresh).toBeEnabled()
          await expect(
            summary.getByText(labels.tokenCount(report.totals.input + report.totals.output), { exact: true }),
          ).toBeVisible()
          const heights = await region
            .locator('.lumen-bar-series > button')
            .evaluateAll((bars) => bars.map((bar) => bar.getBoundingClientRect().height))
          expect(Math.max(...heights)).toBeGreaterThan(40)
          const positiveBucket = region.locator('.lumen-bar-series > button[style*="100%"]')
          await positiveBucket.focus()
          await page.keyboard.press('Enter')
          await expect(positiveBucket).toHaveAttribute('aria-pressed', 'true')
          const bucketLabel = await positiveBucket.getAttribute('title')
          if (!bucketLabel) throw new Error('Expected an accessible Host bucket label')
          await expect(region.getByRole('status').filter({ hasText: bucketLabel })).toBeVisible()
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        expect(await region.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
        await mkdir('artifacts/settings-usage', { recursive: true })
        await region.getByRole('heading', { name: labels.title, exact: true }).scrollIntoViewIfNeeded()
        await page.screenshot({ path: `artifacts/settings-usage/${locale}-${width}.png` })
        await region.getByRole('heading', { name: labels.models, exact: true }).scrollIntoViewIfNeeded()
        await expect(
          region
            .locator('.hbar-settings-usage-model-row')
            .filter({ hasText: labels.model(firstModel.providerId, firstModel.modelId) }),
        ).toBeVisible()
        await page.screenshot({ path: `artifacts/settings-usage/${locale}-${width}-details.png` })
      }
      fault = 'failure'
      await refresh.click()
      await expect(region.getByRole('alert')).toHaveText(labels.error('READ_FAILED'))
      await expect(region.getByText(labels.oldResult, { exact: true })).toBeVisible()
      await refresh.click()
      await expect(region.getByRole('alert')).toHaveCount(0)
      await expect(refresh).toBeEnabled()
      fault = 'hold'
      await refresh.click()
      await expect.poll(() => Boolean(held)).toBe(true)
      await selectGroup(page, locale, 'appearance', copy.appearance.group)
      await selectGroup(page, locale, 'usage', labels.title)
      await expect(refresh).toBeEnabled()
      held?.()
      held = undefined
      await expect(region.getByRole('alert')).toHaveCount(0)
      await expect(
        summary.getByText(labels.tokenCount(report.totals.input + report.totals.output), { exact: true }),
      ).toBeVisible()
      expect(reads).toBeGreaterThanOrEqual(12)
      // Clearly marked layout stress only: the Host records above remain unchanged.
      await region.locator('.hbar-settings-usage-intro > p').evaluate((element) => {
        element.textContent = '长文案 Long localized description '.repeat(25)
      })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await region.getByRole('heading', { name: labels.title, exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: `artifacts/settings-usage/${locale}-320-long-fixture.png` })
      await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
      await expectComposerText(prompt, draft)
      await openSessionTool(page, copy.session.tools, 'settings')
      await selectGroup(page, locale, 'usage', labels.title)
      await expect(refresh).toBeEnabled()
      await stopWebSessionHost(host)
      host = undefined
      await expect(region.getByText(labels.offline, { exact: true })).toBeVisible({ timeout: 20_000 })
      await expect(refresh).toBeDisabled()
      await expect(region.getByText(labels.oldResult, { exact: true })).toBeVisible()
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedUsageFixture(root)
    }
  })
}
