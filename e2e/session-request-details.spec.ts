import { expect, test } from '@playwright/test'
import { createBudgetCommandClient, createRunCommandClient, createUsageCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { openSessionTool } from './support/session-tools-menu'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

type CopyWindow = Window & { sessionRequestCopied?: string }

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`session requests expose actual attempts and lazy original messages: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(150_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-session-requests-'))
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
      const usage = createUsageCommandClient(client)
      const scope = { kind: 'session' as const, sessionId, includeDescendants: false }
      await createBudgetCommandClient(client).execute(
        'session.setBudget',
        { sessionId, tokens: 10_000_000 },
        { idempotencyKey: crypto.randomUUID() },
      )
      const submit = async (text: string) => {
        const accepted = await runs.execute(
          'run.submit',
          { sessionId, modelId: 'local-fixture', input: { text, images: [], approval: 'allow' } },
          { idempotencyKey: crypto.randomUUID() },
        )
        await expect
          .poll(
            async () =>
              (await client.call('session.snapshot', { sessionId })).runs.find((run) => run.id === accepted.operationId)
                ?.status,
            { intervals: [50, 100, 200] },
          )
          .toBe('completed')
        return accepted.operationId
      }
      const baseline = await usage.execute('usage.export', { scope, limit: 500 })
      for (let index = baseline.items.length; index < 51; index++) await submit(`Request ${index}`)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            async writeText(text: string) {
              ;(window as CopyWindow).sessionRequestCopied = text
            },
          },
        })
      })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      const session = await client.call('session.get', { sessionId })
      if (!session) throw new Error('Fixture session disappeared')
      await page.getByRole('treeitem', { name: session.title, exact: true }).click()
      const copy = getShellCopy(locale)
      const labels = copy.monitoring.requests
      await openSessionTool(page, copy.session.tools, 'monitoring')
      const pane = page.locator('.hbar-app-react-session-monitoring')
      await pane.getByRole('tab', { name: copy.monitoring.tabs.requests, exact: true }).click()
      const requests = pane.locator('.hbar-session-requests')
      const rows = requests.locator(':scope > ul > li')
      await expect(rows).toHaveCount(50)
      await requests.getByRole('button', { name: labels.more, exact: true }).click()
      const loaded = await usage.execute('usage.export', { scope, limit: 500 })
      await expect(rows).toHaveCount(Math.min(100, loaded.items.length))

      // New canonical usage is reflected while the pane stays open.
      const toolRun = await submit('/tool read_file {"path":"browser-e2e.md"}')
      const ledger = await usage.execute('usage.export', { scope, limit: 500 })
      const expected = ledger.items.find((item) => item.runId === toolRun)
      if (!expected) throw new Error('The completed fixture request was not recorded')
      const row = requests.locator(`[data-usage-id=${JSON.stringify(expected.usageId)}]`)
      await expect(row).toBeVisible()
      await row.locator(':scope > section > button').focus()
      await page.keyboard.press('Enter')
      const record = row.locator('.hbar-session-request-record')
      await expect(record).toBeVisible()
      await expect(record).toContainText(expected.attemptId)
      await expect(record).toContainText(expected.providerId)
      await expect(record).toContainText(labels.number(expected.input))
      await expect(record).toContainText(labels.fields.cacheHitRate)
      await expect(record).toContainText(labels.cacheRatio(expected.cacheRead, expected.input))
      await expect(record).toContainText(labels.number(expected.billableTokens))
      await expect(record).toContainText(labels.cost(expected.cost))
      await expect(record.locator('pre')).toHaveCount(0)
      await record.getByRole('button', { name: labels.raw.request, exact: true }).click()
      const raw = record.locator('pre').first()
      await expect(raw).toContainText(expected.usageId)
      await record.getByRole('button', { name: labels.codeBlock.copy, exact: true }).click()
      const copied = await page.evaluate(() => (window as CopyWindow).sessionRequestCopied)
      expect(JSON.parse(copied ?? '{}')).toMatchObject({
        id: expected.usageId,
        attemptId: expected.attemptId,
        input: expected.input,
      })
      await record.getByRole('button', { name: labels.raw.request, exact: true }).click()
      await record.getByRole('button', { name: labels.raw.runMessages, exact: true }).click()
      await expect(record).toContainText(labels.raw.scope)
      const snapshot = await client.call('session.snapshot', { sessionId })
      const call = snapshot.messages.find(
        (message) => message.runId === toolRun && message.content.some((block) => block.type === 'tool_call'),
      )
      if (!call) throw new Error('The fixture tool call has no original message')
      const message = record.locator(`[data-message-id=${JSON.stringify(call.id)}]`)
      await message.getByRole('button').click()
      await expect(message.locator('pre')).toContainText('read_file')
      await expect(message.locator('pre')).toContainText('browser-e2e.md')
      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await row.locator(':scope > section > button').scrollIntoViewIfNeeded()
        await expect(record).toBeVisible()
        const geometry = await pane.evaluate((element) => ({ scroll: element.scrollWidth, width: element.clientWidth }))
        expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await pane.screenshot({ path: testInfo.outputPath(`requests-${locale}-${width}.png`) })
        await message.locator('pre').scrollIntoViewIfNeeded()
        await pane.screenshot({ path: testInfo.outputPath(`raw-messages-${locale}-${width}.png`) })
      }
      await row.locator(':scope > section > button').click()
      await pane.getByRole('tab', { name: copy.monitoring.tabs.messages, exact: true }).click()
      const contextMessages = pane
        .getByRole('tabpanel', { name: copy.monitoring.tabs.messages, exact: true })
        .locator('.hbar-session-raw-messages')
      await expect(contextMessages.locator(':scope > ul > li')).toHaveCount(20)
      await contextMessages.getByRole('button', { name: labels.raw.more(20), exact: true }).click()
      await expect(contextMessages.locator(':scope > ul > li')).toHaveCount(40)
      const beforeOlder = await contextMessages.locator('p').first().textContent()
      await pane.getByRole('button', { name: labels.raw.older, exact: true }).click()
      await expect.poll(() => contextMessages.locator('p').first().textContent()).not.toBe(beforeOlder)
      await pane.getByRole('tab', { name: copy.monitoring.tabs.requests, exact: true }).click()
      await requests.getByRole('button', { name: labels.refresh, exact: true }).click()
      await expect(rows).toHaveCount(50)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
