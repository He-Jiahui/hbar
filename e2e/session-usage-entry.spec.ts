import { expect, test } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { createModelCommandClient, createSettingsCommandClient } from '@hbar/client'
import { selectLumenOption } from './support/lumen-controls'
import { z } from 'zod'
import { sessionContextUsageSchema } from '@hbar/contracts/commands/models'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`usage opens beside composer without hiding the conversation or reloading facts: ${locale}`, async ({
    browser,
  }) => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-usage-entry-'))
    const context = await browser.newContext({ locale, colorScheme: locale === 'en-US' ? 'dark' : 'light' })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const copy = getShellCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      const calls: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('websocket', (socket) => socket.on('framesent', (event) => calls.push(String(event.payload))))
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await prompt.fill('Unsaved prompt preserved while inspecting usage — 未发送草稿')
      const trigger = page.locator('.hbar-session-usage-trigger')
      const facts = await createModelCommandClient(host.client).execute('session.getContextUsage', {
        sessionId: host.ready.sessionId,
      })
      if (facts.inputTokens === null || facts.contextWindow === null) throw new Error('Fixture context is unavailable')
      await expect(trigger).toContainText(
        copy.session.usage.usedPercent((facts.inputTokens / facts.contextWindow) * 100),
      )
      const reads = () =>
        calls.filter((call) => /usage\.query|session\.getBudget|session\.getModel|session\.getContextUsage/.test(call))
          .length
      const before = reads()
      const dialog = page.getByRole('dialog', { name: copy.session.usage.title, exact: true })
      await expect(dialog).not.toBeVisible()
      await expect(page.locator('.hbar-app-react-session-footer > .lumen-inline-usage-surface')).toHaveCount(0)
      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 })
        await trigger.focus()
        await page.keyboard.press('Enter')
        await expect(dialog).toBeVisible()
        await expect(dialog.getByText(copy.session.usage.description, { exact: true })).toBeVisible()
        await expect(dialog.getByRole('button', { name: copy.session.usage.monitor })).toBeVisible()
        await expect(dialog.getByText(copy.session.usage.compactionThreshold, { exact: true })).toBeVisible()
        await expect(
          dialog.getByText(copy.session.usage.windowUsage(facts.inputTokens, facts.contextWindow), { exact: true }),
        ).toBeVisible()
        expect(
          await dialog.evaluate(
            (element) => element.parentElement === document.body || !!element.closest('.lumen-floating-surface'),
          ),
        ).toBe(true)
        const bounds = await dialog.boundingBox()
        expect(bounds).not.toBeNull()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1)
        expect(bounds!.y).toBeGreaterThanOrEqual(0)
        expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
        for (const metric of await dialog.locator('.lumen-compact-metrics > div').all()) {
          const metricBounds = await metric.boundingBox()
          expect(metricBounds!.x).toBeGreaterThanOrEqual(bounds!.x)
          expect(metricBounds!.x + metricBounds!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1)
          const meter = await dialog.locator('.lumen-inline-usage-surface').boundingBox()
          expect(metricBounds!.y + metricBounds!.height).toBeLessThanOrEqual(meter!.y + meter!.height + 1)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/context-usage/hbar-usage-${locale}-${width}.png` })
        await dialog.getByRole('button', { name: copy.session.usage.close }).focus()
        await page.keyboard.press('Escape')
        await expect(dialog).not.toBeVisible()
        await expect(trigger).toBeFocused()
        await expectComposerText(prompt, 'Unsaved prompt preserved while inspecting usage — 未发送草稿')
        await expect(page.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeVisible()
      }
      expect(reads()).toBe(before)
      const settings = createSettingsCommandClient(host.client)
      const snapshot = await settings.execute('settings.get', {
        scope: { kind: 'session', targetId: host.ready.sessionId },
      })
      await settings.execute(
        'settings.set',
        {
          schemaVersion: 1,
          scope: snapshot.scope,
          path: [{ kind: 'field', name: 'context.compactionPercent' }],
          value: 60,
          baselineRevisions: snapshot.revisions,
        },
        { idempotencyKey: 'browser-compaction-setting' },
      )
      await expect(trigger.locator('svg')).toHaveAttribute('data-threshold', '0.6')
      await trigger.click()
      await expect(dialog).toBeVisible()
      await expect(
        dialog.getByText(copy.session.usage.threshold(60, Math.floor(facts.contextWindow * 0.6)), { exact: true }),
      ).toBeVisible()
      await page.mouse.click(5, 5)
      await expect(dialog).not.toBeVisible()
      await trigger.click()
      await dialog.getByRole('button', { name: copy.session.usage.monitor }).click()
      await expect(dialog).not.toBeVisible()
      await expect(page.locator('.hbar-app-react-session-monitoring')).toBeVisible()
      await page.setViewportSize({ width: 1440, height: 960 })
      await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
      await page
        .getByRole('navigation', { name: copy.settings.groups })
        .getByRole('button', { name: copy.settings.resolve('i18n:settings.groups.model'), exact: true })
        .click()
      await selectLumenOption(page.getByRole('combobox', { name: copy.settings.scopes, exact: true }), 'session')
      const thresholdField = page.getByRole('textbox', {
        name: copy.settings.resolve('i18n:settings.context.compactionPercent.label'),
        exact: true,
      })
      await expect(thresholdField).toBeVisible()
      await thresholdField.fill('70')
      await page.getByRole('button', { name: copy.settings.save, exact: true }).click()
      await expect(page.getByText(copy.settings.saved, { exact: true })).toBeVisible()
      await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
      await expect(trigger.locator('svg')).toHaveAttribute('data-threshold', '0.7')
      expect(
        await createModelCommandClient(host.client).execute('session.getContextUsage', {
          sessionId: host.ready.sessionId,
        }),
      ).toMatchObject({ compactionPercent: 70 })
      expect(errors).toEqual([])
    } finally {
      try {
        await context.close()
      } finally {
        if (host) await stopWebSessionHost(host)
        await rm(root, { recursive: true, force: true })
      }
    }
  })
}

test('context read failure recovers locally and actual compaction updates the current window', async ({ browser }) => {
  test.setTimeout(60_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-context-lifecycle-'))
  const context = await browser.newContext({ locale: 'zh-CN', colorScheme: 'dark' })
  const copy = getShellCopy('zh-CN')
  const observed: unknown[] = []
  const contextQueryIds = new Set<string | number>()
  const browserFailures: string[] = []
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      historyCount: 16,
      historyText: 'Context history '.repeat(180),
      goalAutoContinue: false,
      budgetAutoContinue: false,
    })
    const models = createModelCommandClient(host.client)
    const settings = createSettingsCommandClient(host.client)
    await host.client.call('provider.save', {
      provider: {
        id: 'context-browser',
        name: 'Context browser fixture',
        protocol: 'mock',
        baseUrl: 'http://localhost',
        model: 'context-browser',
        contextWindow: 24_000,
        maxOutput: 1_000,
      },
    })
    const initial = await models.execute('session.getModel', { sessionId: host.ready.sessionId })
    await models.execute(
      'session.setModel',
      { sessionId: host.ready.sessionId, modelId: 'context-browser', baselineRevisions: initial.revisions },
      { idempotencyKey: 'context-browser-model' },
    )
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    page.on('console', (message) => {
      if (message.type() === 'error') browserFailures.push(message.text())
    })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let fail = true
    const rpc = z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
        params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
      })
      .passthrough()
    await page.routeWebSocket('**/rpc', (socket) => {
      const server = socket.connectToServer()
      socket.onMessage((message) => {
        const parsed = typeof message === 'string' ? rpc.safeParse(JSON.parse(message)) : null
        if (
          parsed?.success &&
          parsed.data.params?.commandId === 'session.getContextUsage' &&
          parsed.data.id !== undefined
        ) {
          contextQueryIds.add(parsed.data.id)
          observed.push({ query: parsed.data.id })
        }
        if (parsed?.success && parsed.data.params?.commandId === 'session.getContextUsage' && fail) {
          socket.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: parsed.data.id,
              error: { code: -32603, message: 'Injected context read failure', data: 'READ_FAILED' },
            }),
          )
        } else server.send(message)
      })
      server.onMessage((message) => {
        if (typeof message === 'string') {
          const record = z
            .object({
              id: z.union([z.string(), z.number()]).optional(),
              result: z.unknown().optional(),
              error: z.object({ data: z.unknown().optional() }).passthrough().optional(),
            })
            .passthrough()
            .safeParse(JSON.parse(message))
          const fact = record.success ? sessionContextUsageSchema.safeParse(record.data.result) : null
          if (fact?.success)
            observed.push({
              input: fact.data.inputTokens,
              threshold: fact.data.compactionPercent,
              observedAt: fact.data.observedAt,
            })
          if (
            record.success &&
            record.data.id !== undefined &&
            contextQueryIds.has(record.data.id) &&
            record.data.error
          )
            observed.push({ error: record.data.error.data })
        }
        socket.send(message)
      })
    })
    await page.goto(base)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    const trigger = page.locator('.hbar-session-usage-trigger')
    await expect(trigger).toContainText(copy.session.usage.unavailable)
    expect(await trigger.locator('svg').getAttribute('data-used')).toBeNull()
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: copy.session.usage.title, exact: true })
    await expect(dialog.getByRole('alert')).toContainText(copy.session.usage.error('READ_FAILED'))
    fail = false
    await dialog.getByRole('button', { name: copy.session.usage.refresh, exact: true }).click()
    await expect(dialog.getByRole('alert')).toHaveCount(0)
    const before = await models.execute('session.getContextUsage', { sessionId: host.ready.sessionId })
    if (before.inputTokens === null || before.contextWindow === null) throw new Error('Expected retained context')
    await expect(trigger).toContainText(
      copy.session.usage.usedPercent((before.inputTokens / before.contextWindow) * 100),
    )
    await page.screenshot({ path: 'artifacts/context-usage/context-before-compaction.png' })
    await dialog.getByRole('button', { name: copy.session.usage.close, exact: true }).click()
    const snapshot = await settings.execute('settings.get', {
      scope: { kind: 'session', targetId: host.ready.sessionId },
    })
    await settings.execute(
      'settings.set',
      {
        schemaVersion: 1,
        scope: snapshot.scope,
        path: [{ kind: 'field', name: 'context.compactionPercent' }],
        value: 30,
        baselineRevisions: snapshot.revisions,
      },
      { idempotencyKey: 'context-browser-threshold' },
    )
    await expect(trigger.locator('svg')).toHaveAttribute('data-threshold', '0.3')
    const draft = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    await draft.fill('Keep this unsent draft during automatic compaction')
    const observedClient = host.client
    const observedSessionId = host.ready.sessionId
    const run = await observedClient.call('run.start', {
      sessionId: observedSessionId,
      requestId: 'context-browser-run',
      input: { text: 'Continue from the retained context', images: [] },
      modelId: 'context-browser',
    })
    await expect
      .poll(async () => {
        const result = await observedClient.call('session.snapshot', { sessionId: observedSessionId })
        return result.runs.some((item) => item.id === run.id && item.status === 'completed')
      })
      .toBe(true)
    const after = await models.execute('session.getContextUsage', { sessionId: host.ready.sessionId })
    if (after.inputTokens === null || after.contextWindow === null) throw new Error('Expected compacted context')
    expect(after.inputTokens).toBeLessThan(before.inputTokens)
    await expect(trigger).toContainText(copy.session.usage.usedPercent((after.inputTokens / after.contextWindow) * 100))
    await trigger.click()
    await expect(
      dialog.getByText(copy.session.usage.windowUsage(after.inputTokens, after.contextWindow), { exact: true }),
    ).toBeVisible()
    await page.screenshot({ path: 'artifacts/context-usage/context-after-compaction.png' })
    await expectComposerText(draft, 'Keep this unsent draft during automatic compaction')
    expect(errors).toEqual([])
  } finally {
    await writeFile('artifacts/context-usage/context-browser-errors.json', JSON.stringify(browserFailures), 'utf8')
    await writeFile('artifacts/context-usage/context-projection-facts.json', JSON.stringify(observed), 'utf8')
    await test
      .info()
      .attach('context-projection-facts', {
        body: Buffer.from(JSON.stringify(observed)),
        contentType: 'application/json',
      })
    try {
      await context.close()
    } finally {
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  }
})
