import { expect, test } from '@playwright/test'
import { lstat, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { createUsageCommandClient } from '@hbar/client'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { openSessionTool } from './support/session-tools-menu'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { verifyReadableText } from '../scripts/support/verify-readable-text'

const prefix = 'hbar-monitoring-content-'
const wire = z.object({
  method: z.string(),
  params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
})
async function cleanup(root: string) {
  const stat = await lstat(root)
  const owned = await realpath(root)
  if (
    stat.isSymbolicLink() ||
    !stat.isDirectory() ||
    owned !== resolve(root) ||
    dirname(owned) !== (await realpath(tmpdir())) ||
    !basename(owned).startsWith(prefix)
  )
    throw new Error('Refusing cleanup outside the exact owned monitoring root')
  await rm(owned, { recursive: true })
}
for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`actual session monitoring preserves Host facts, draft and original target across widths: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), prefix))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      const ownedHost = host
      const copy = getShellCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      page.setDefaultTimeout(10_000)
      const errors: string[] = []
      const calls: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('websocket', (socket) =>
        socket.on('framesent', (frame) => {
          try {
            const parsed = wire.safeParse(JSON.parse(String(frame.payload)))
            if (parsed.success && calls.length < 2048)
              calls.push(
                parsed.data.method === 'command.execute'
                  ? (parsed.data.params?.commandId ?? 'invalid')
                  : parsed.data.method,
              )
          } catch {
            /* No raw protocol or credentials are retained. */
          }
        }),
      )
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await prompt.click()
      await expect(prompt).toBeFocused()
      await page.keyboard.insertText('produce owned monitoring usage')
      await expectComposerText(prompt, 'produce owned monitoring usage')
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expect
        .poll(async () =>
          (await ownedHost.client.call('session.snapshot', { sessionId: ownedHost.ready.sessionId })).runs.some(
            (run) => run.status === 'completed',
          ),
        )
        .toBe(true)
      const snapshot = await ownedHost.client.call('session.snapshot', { sessionId: ownedHost.ready.sessionId })
      const report = await createUsageCommandClient(ownedHost.client).execute('usage.query', {
        scope: { kind: 'session', sessionId: ownedHost.ready.sessionId, includeDescendants: false },
        bucketMs: 60_000,
        maxBuckets: 120,
        maxSamples: 5_000,
        filters: {},
      })
      const expectedTokens = copy.monitoring.number(report.totals.input + report.totals.output)
      const draft = '原会话未发送草稿 Original unsent draft while inspecting actual usage'
      await prompt.click()
      await expect(prompt).toBeFocused()
      await page.keyboard.insertText(draft)
      await expectComposerText(prompt, draft)
      for (const width of [1440, 1100, 900, 390, 320]) {
        console.log('Owned monitoring width', locale, width)
        await page.setViewportSize({ width, height: 960 })
        const hide = page.getByRole('button', { name: copy.shell.hideSidebar, exact: true })
        const more = page.getByRole('button', { name: copy.session.tools.more, exact: true })
        const mobile = page.locator('.hbar-mobile-header-menu-trigger')
        if (!(await more.isVisible()) && !(await mobile.isVisible()) && (await hide.isVisible())) await hide.click()
        const before = calls.filter((name) => name === 'usage.query').length
        await openSessionTool(page, copy.session.tools, 'monitoring')
        console.log('Owned monitoring entrance', locale, width)
        const pane = page.locator('.hbar-app-react-session-monitoring')
        await expect(pane).toBeVisible()
        await expect(pane).not.toHaveAttribute('aria-busy', 'true')
        const totals = pane.locator('.lumen-compact-metrics').first()
        await expect(
          totals
            .getByRole('group', { name: copy.monitoring.totals.tokens, exact: true })
            .locator('[data-text-context="metric.value"]'),
        ).toHaveText(expectedTokens)
        for (const section of [
          copy.monitoring.latency.title,
          copy.monitoring.execution.title,
          copy.monitoring.models,
        ]) {
          const trigger = pane.getByRole('button', { name: section, exact: true })
          if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
            await trigger.scrollIntoViewIfNeeded()
            await trigger.focus()
            await trigger.press('Enter')
          }
          await expect(trigger).toHaveAttribute('aria-expanded', 'true')
        }
        await expect(pane.locator('ul > li')).toHaveCount(Math.min(report.models.length, 8))
        await verifyReadableText(
          pane.locator('ul > li [data-text-context="collection.title"]'),
          report.models[0]
            ? copy.monitoring.model(report.models[0].providerId, report.models[0].modelId)
            : copy.monitoring.unavailable,
        )
        expect(calls.filter((name) => name === 'usage.query').length).toBe(before)
        await pane.getByRole('button', { name: copy.monitoring.refresh, exact: true }).click()
        await expect.poll(() => calls.filter((name) => name === 'usage.query').length).toBeGreaterThan(before)
        await expect(pane).not.toHaveAttribute('aria-busy', 'true')
        await expect(
          totals
            .getByRole('group', { name: copy.monitoring.totals.tokens, exact: true })
            .locator('[data-text-context="metric.value"]'),
        ).toHaveText(expectedTokens)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: info.outputPath(`${locale}-${width}.png`) })
        await pane.getByRole('button', { name: copy.monitoring.close, exact: true }).click()
        await expect(pane).toHaveCount(0)
        await expectComposerText(prompt, draft)
        await expect(page.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeVisible()
      }
      expect(
        (await ownedHost.client.call('session.snapshot', { sessionId: ownedHost.ready.sessionId })).runs.map(
          (run) => run.id,
        ),
      ).toEqual(snapshot.runs.map((run) => run.id))
      expect(errors).toEqual([])
    } finally {
      try {
        await context.close()
      } finally {
        if (host) await stopWebSessionHost(host)
        await cleanup(root)
      }
    }
  })
}
