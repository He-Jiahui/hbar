import { expect, test } from '@playwright/test'
import { createModelCommandClient, createRunCommandClient, createSettingsCommandClient } from '@hbar/client'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanup(root: string) {
  const target = await realpath(root)
  if (
    dirname(target).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(target).startsWith('hbar-forced-compaction-')
  )
    throw new Error('Refusing to remove an unowned compaction fixture')
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}

test('the final Pi reply forces compaction and refreshes the composer meter without another user turn', async ({
  browser,
}, info) => {
  test.setTimeout(60_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-forced-compaction-'))
  const context = await browser.newContext({ locale: 'zh-CN', colorScheme: 'dark' })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      goalAutoContinue: false,
      budgetAutoContinue: false,
    })
    const { client, ready } = host
    const { sessionId } = ready
    const models = createModelCommandClient(client)
    await client.call('provider.save', {
      provider: {
        id: 'forced-context',
        name: 'Forced context fixture',
        protocol: 'mock',
        baseUrl: 'http://localhost',
        model: 'forced-context',
        contextWindow: 4096,
        maxOutput: 256,
      },
    })
    const selection = await models.execute('session.getModel', { sessionId })
    await models.execute(
      'session.setModel',
      {
        sessionId,
        modelId: 'forced-context',
        baselineRevisions: selection.revisions,
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    const settings = createSettingsCommandClient(client)
    const settingsBefore = await settings.execute('settings.get', { scope: { kind: 'session', targetId: sessionId } })
    await settings.execute(
      'settings.set',
      {
        schemaVersion: 1,
        scope: settingsBefore.scope,
        path: [{ kind: 'field', name: 'context.compactionPercent' }],
        value: 95,
        baselineRevisions: settingsBefore.revisions,
      },
      { idempotencyKey: crypto.randomUUID() },
    )

    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const copy = getShellCopy('zh-CN')
    await page.goto(base)
    await page.getByRole('treeitem', { name: ready.sessionTitle, exact: true }).click()
    const draft = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    await draft.click()
    const unsent = '保留未发送草稿 — preserve the local draft'
    await page.keyboard.insertText(unsent)
    await expectComposerText(draft, unsent)

    const runs = createRunCommandClient(client)
    const submitted = await runs.execute(
      'run.submit',
      {
        sessionId,
        modelId: 'forced-context',
        input: { text: `Return the verified result: ${'x'.repeat(9800)}`, images: [] },
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    await expect
      .poll(async () => {
        const operation = await runs.execute('operation.get', { operationId: submitted.operationId })
        return operation.status === 'failed' ? operation : operation.status
      })
      .toBe('completed')
    const snapshot = await client.call('session.snapshot', { sessionId })
    const rawSize = snapshot.messages.reduce(
      (size, message) =>
        size + message.content.reduce((total, block) => total + (block.type === 'text' ? block.text.length : 0), 0),
      0,
    )
    expect(Math.ceil(rawSize / 3)).toBeGreaterThan(4096)
    const { events } = await client.call('session.follow', { sessionId, cursor: 0 })
    await client.call('session.unfollow', { sessionId })
    expect(events.filter((event) => event.type === 'context.compacted')).toHaveLength(1)
    expect(events.filter((event) => event.type === 'request.started')).toHaveLength(1)
    const usage = await models.execute('session.getContextUsage', { sessionId })
    if (usage.inputTokens === null || usage.outputReserve === null || usage.contextWindow === null)
      throw new Error('Expected available compacted usage')
    expect(usage.inputTokens + usage.outputReserve).toBeLessThanOrEqual(usage.contextWindow)
    const trigger = page.locator('.hbar-session-usage-trigger')
    await expect(trigger).toContainText(copy.session.usage.usedPercent((usage.inputTokens / usage.contextWindow) * 100))
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: copy.session.usage.title, exact: true })
    await expect(
      dialog.getByText(copy.session.usage.windowUsage(usage.inputTokens, usage.contextWindow), { exact: true }),
    ).toBeVisible()
    await expectComposerText(draft, unsent)
    await info.attach('compaction-facts', {
      body: Buffer.from(JSON.stringify({ rawSize, usage, events: events.map((event) => event.type) })),
      contentType: 'application/json',
    })
    await page.screenshot({ path: info.outputPath('forced-compaction-desktop.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(trigger).toBeVisible()
    await expectComposerText(draft, unsent)
    await page.screenshot({ path: info.outputPath('forced-compaction-narrow.png') })
    expect(errors).toEqual([])
  } finally {
    try {
      await context.close()
    } finally {
      try {
        if (host) await stopWebSessionHost(host)
      } finally {
        await cleanup(root)
      }
    }
  }
})
