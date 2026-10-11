import { expect, test } from '@playwright/test'
import { createModelCommandClient, createRunCommandClient } from '@hbar/client'
import { basename, dirname, join } from 'node:path'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { contextHistoryCopy } from '../apps/web/src/context-history-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
async function cleanup(root: string) {
  const owned = await realpath(root)
  if (dirname(owned) !== (await realpath(tmpdir())) || !basename(owned).startsWith('hbar-compact-slash-'))
    throw new Error('Non-owned slash fixture')
  await rm(owned, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}
async function selectModel(host: WebSessionHost) {
  const { client, ready } = host
  await client.call('provider.save', {
    provider: {
      id: 'slash-context',
      name: 'Slash compaction fixture',
      protocol: 'mock',
      baseUrl: 'http://localhost',
      model: 'slash-context',
      contextWindow: 32000,
      maxOutput: 256,
    },
  })
  const models = createModelCommandClient(client)
  const previous = await models.execute('session.getModel', { sessionId: ready.sessionId })
  await models.execute(
    'session.setModel',
    { sessionId: ready.sessionId, modelId: 'slash-context', baselineRevisions: previous.revisions },
    { idempotencyKey: crypto.randomUUID() },
  )
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`/compact completes locally with manual history and preserves a newer draft: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(90000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-compact-slash-'))
    const context = await browser.newContext({ locale, colorScheme: 'dark', viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        historyCount: 18,
        historyText: 'Authored history. '.repeat(60),
        compactionDelayMs: 2000,
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      await selectModel(host)
      const { client, ready } = host
      const runs = createRunCommandClient(client)
      const submitted = await runs.execute(
        'run.submit',
        { sessionId: ready.sessionId, modelId: 'slash-context', input: { text: 'A settled local reply.', images: [] } },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: submitted.operationId })).status)
        .toBe('completed')
      const before = await client.call('session.snapshot', { sessionId: ready.sessionId })
      expect(before.contextCompactions).toHaveLength(0)
      expect((await context.request.post(`${base()}/auth/token`, { data: { token: ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const copy = getShellCopy(locale),
        history = contextHistoryCopy(locale)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base())
      await page.getByRole('treeitem', { name: before.session.title, exact: true }).click()
      const draft = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await expect(draft).toBeEditable()
      await draft.fill('/comp')
      const menu = page.getByRole('listbox', { name: copy.session.slash.menu, exact: true })
      await expect(menu.getByRole('option')).toHaveCount(1)
      await page.keyboard.press('Tab')
      await expectComposerText(draft, '/compact ')
      expect((await client.call('session.snapshot', { sessionId: ready.sessionId })).contextCompactions).toHaveLength(0)
      if (locale === 'zh-CN') await page.keyboard.press('Enter')
      else await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      const notice = page.locator('.hbar-context-compaction-notice')
      await expect(notice).toContainText(history.notice)
      await expect(notice.locator('.hbar-session-execution-spinner')).toBeVisible()
      if (locale === 'en-US') await draft.fill('A newer draft written during compaction.')
      else await page.keyboard.press('Enter') // duplicate sends do not start another compaction
      await expect
        .poll(
          async () =>
            (await client.call('session.snapshot', { sessionId: ready.sessionId })).contextHistory?.records[0]?.status,
          { timeout: 15000 },
        )
        .toBe('completed')
      await expect(notice).toHaveCount(0)
      await expectComposerText(draft, locale === 'zh-CN' ? '' : 'A newer draft written during compaction.')
      const after = await client.call('session.snapshot', { sessionId: ready.sessionId })
      expect(after.messages.map((message) => message.id)).toEqual(before.messages.map((message) => message.id))
      expect(after.runs.map((run) => run.id)).toEqual(before.runs.map((run) => run.id))
      expect(after.contextCompactions).toHaveLength(1)
      const marker = after.contextCompactions?.[0]
      if (!marker) throw new Error('Missing slash compaction record')
      expect(marker.trigger).toBe('manual')
      await expect(page.locator(`[data-context-compaction-marker="${marker.id}"]`)).toHaveText(
        history.compacted('manual'),
      )
      await page.setViewportSize({ width: 320, height: 960 })
      await page.locator(`[data-context-compaction-marker="${marker.id}"]`).scrollIntoViewIfNeeded()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      ).toBe(true)
      await page.screenshot({ path: info.outputPath(`compact-${locale}-320.png`) })
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanup(root)
    }
  })
}

test('/compact with no eligible history reports the reason and retains the command', async ({ browser }) => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-compact-slash-'))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, goalAutoContinue: false, budgetAutoContinue: false })
    await selectModel(host)
    const { client, ready } = host
    expect((await context.request.post(`${base()}/auth/token`, { data: { token: ready.token } })).ok()).toBe(true)
    const page = await context.newPage(),
      copy = getShellCopy('zh-CN')
    await page.goto(base())
    await page.getByRole('treeitem', { name: ready.sessionTitle, exact: true }).click()
    const draft = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    await draft.fill('/compact')
    await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
    await expect(page.getByText(copy.session.slash.error('NOTHING_TO_COMPACT'), { exact: true })).toBeVisible()
    await expectComposerText(draft, '/compact')
    const snapshot = await client.call('session.snapshot', { sessionId: ready.sessionId })
    expect(snapshot.messages).toHaveLength(0)
    expect(snapshot.runs).toHaveLength(0)
    expect(snapshot.contextCompactions).toHaveLength(0)
    await expect(page.locator('.hbar-context-compaction-notice')).toHaveCount(0)
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await cleanup(root)
  }
})
