import { expect, test } from '@playwright/test'
import { createModelCommandClient, createRunCommandClient } from '@hbar/client'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { contextHistoryCopy } from '../apps/web/src/context-history-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanup(root: string) {
  const target = await realpath(root)
  if (
    dirname(target).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(target).startsWith('hbar-context-history-browser-')
  )
    throw new Error('Non-owned fixture')
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`compaction notice above session status and durable window details: ${locale}`, async ({ browser }, info) => {
    test.setTimeout(90000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-context-history-browser-'))
    const context = await browser.newContext({ locale, colorScheme: 'dark', viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        compactionDelayMs: 5000,
        sessionCount: 2,
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      const { client, ready } = host
      const { sessionId } = ready
      await client.call('provider.save', {
        provider: {
          id: 'history-context',
          name: 'Context history fixture',
          protocol: 'mock',
          baseUrl: 'http://localhost',
          model: 'history-context',
          contextWindow: 4096,
          maxOutput: 256,
        },
      })
      const models = createModelCommandClient(client)
      const previous = await models.execute('session.getModel', { sessionId })
      await models.execute(
        'session.setModel',
        { sessionId, modelId: 'history-context', baselineRevisions: previous.revisions },
        { idempotencyKey: crypto.randomUUID() },
      )
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const copy = getShellCopy(locale),
        labels = contextHistoryCopy(locale)
      await page.goto(base)
      await page.getByRole('treeitem', { name: ready.sessionTitle, exact: true }).click()
      const draft = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const unsent = '保留草稿，压缩历史不发送这段文字。'
      await expect(draft).toBeEditable()
      await draft.fill(unsent)
      await expectComposerText(draft, unsent)
      const runs = createRunCommandClient(client)
      const submitted = await runs.execute(
        'run.submit',
        {
          sessionId,
          modelId: 'history-context',
          input: { text: `Return the verified result: ${'x'.repeat(9800)}`, images: [] },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      const notice = page.locator('.hbar-context-compaction-notice')
      await expect(notice).toContainText(labels.notice)
      const elapsed = notice.locator('[data-context-compaction-elapsed]')
      const firstElapsed = Math.floor(Number(await elapsed.getAttribute('data-context-compaction-elapsed')) / 1000)
      await expect
        .poll(async () => Math.floor(Number(await elapsed.getAttribute('data-context-compaction-elapsed')) / 1000))
        .toBeGreaterThan(firstElapsed)
      const active = (await client.call('session.snapshot', { sessionId })).contextHistory?.records.find(
        (value) => value.status === 'running',
      )
      if (!active) throw new Error('Missing active compaction measurements')
      await notice.hover()
      const tooltip = page.getByRole('tooltip', { name: labels.detailsLabel, exact: true })
      for (const line of labels.activeDetails(active)) await expect(tooltip).toContainText(line)
      expect(await tooltip.evaluate((element) => element.parentElement === document.body)).toBe(true)
      const hintStyle = await tooltip.evaluate((element) => ({
        position: getComputedStyle(element).position,
        align: getComputedStyle(element).textAlign,
        blur: getComputedStyle(element).backdropFilter,
        topLayer: element.matches(':popover-open'),
      }))
      expect(hintStyle.position).toBe('fixed')
      expect(['start', 'left']).toContain(hintStyle.align)
      expect(hintStyle.blur).not.toBe('none')
      expect(hintStyle.topLayer).toBe(true)
      await page.screenshot({ path: info.outputPath(`compacting-details-${locale}.png`) })
      await page.keyboard.press('Escape')
      await expect(tooltip).toHaveCount(0)
      const spinner = notice.locator('.hbar-session-execution-spinner')
      await expect(spinner).toBeVisible()
      expect(await spinner.evaluate((element) => getComputedStyle(element).animationName)).toBe(
        'hbar-session-execution-spin',
      )
      await page.emulateMedia({ reducedMotion: 'reduce' })
      expect(await spinner.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      const status = page.locator('.hbar-app-react-session-footer > .hbar-session-live-status')
      await expect(status).toBeVisible()
      const boxes = await Promise.all([notice.boundingBox(), status.boundingBox()])
      expect(boxes[0] && boxes[1] && boxes[0].y + boxes[0].height <= boxes[1].y).toBe(true)
      await expectComposerText(draft, unsent)
      await page.screenshot({ path: info.outputPath(`compacting-${locale}.png`) })
      await page.setViewportSize({ width: 320, height: 960 })
      await expect(notice).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      ).toBe(true)
      await page.screenshot({ path: info.outputPath(`compacting-${locale}-320.png`) })
      await page.setViewportSize({ width: 1440, height: 960 })
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: submitted.operationId })).status, {
          timeout: 30000,
        })
        .toBe('completed')
      await expect(notice).toHaveCount(0)
      const snapshot = await client.call('session.snapshot', { sessionId })
      const record = snapshot.contextHistory?.records[0]
      if (!record || record.afterTokens === null) throw new Error('Missing durable compaction telemetry')
      expect(record.status).toBe('completed')
      expect(record.trigger).toBe('automatic')
      const fact = snapshot.contextCompactions?.find((value) => value.id === record.id)
      if (!fact?.details) throw new Error('Missing completed marker measurements')
      const marker = page.locator(`[data-context-compaction-marker="${record.id}"]`)
      await expect(marker).toHaveText(labels.completed(fact))
      await expect(marker).toHaveCount(1)
      expect(record.durationMs).toBeGreaterThanOrEqual(5000)
      expect(record.beforeTokens).toBeGreaterThan(record.afterTokens)
      expect(record.compactionUsage.recorded).toBeGreaterThan(0)
      await marker.scrollIntoViewIfNeeded()
      await marker.hover()
      for (const line of labels.completedDetails(fact)) await expect(tooltip).toContainText(line)
      await page.screenshot({ path: info.outputPath(`compacted-details-${locale}.png`) })
      await page.mouse.move(12, 12)
      await expect(tooltip).toHaveCount(0)
      await marker.focus()
      await expect(tooltip).toBeVisible()
      await expect(marker).toHaveAttribute('aria-describedby', (await tooltip.getAttribute('id')) ?? '')
      await page.keyboard.press('Escape')
      await expect(tooltip).toHaveCount(0)
      await status.getByRole('button', { name: copy.session.liveStatus.expand, exact: true }).click()
      const history = status
        .getByRole('region', { name: copy.session.liveStatus.label, exact: true })
        .getByRole('region', { name: labels.title, exact: true })
      await expect(history).toBeVisible()
      // A named section is exposed as a region; native disclosures keep keyboard behavior local.
      const row = status.locator(`[data-context-history-id="${record.id}"]`)
      await expect(row).toBeVisible()
      await row.locator('summary').focus()
      await page.keyboard.press('Enter')
      await expect(row).toHaveAttribute('open', '')
      await expect(row).toContainText(
        labels.compactionMetrics(record).find((metric) => metric.id === 'after')?.value ?? '',
      )
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await expect(row).toBeVisible()
        await expectComposerText(draft, unsent)
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
        ).toBe(true)
        await page.screenshot({ path: info.outputPath(`history-${locale}-${width}.png`) })
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      await page.reload()
      const reloadedSession = await client.call('session.get', { sessionId })
      if (!reloadedSession) throw new Error('Session disappeared after reload')
      await page.getByRole('treeitem', { name: reloadedSession.title, exact: true }).click()
      await status.getByRole('button', { name: copy.session.liveStatus.expand, exact: true }).click()
      await expect(status.locator(`[data-context-history-id="${record.id}"]`)).toBeVisible()
      await expect(marker).toHaveCount(1)
      await expect(marker).toHaveText(labels.completed(fact))
      await marker.hover()
      for (const line of labels.completedDetails(fact)) await expect(tooltip).toContainText(line)
      await page.keyboard.press('Escape')
      await expect(notice).toHaveCount(0)
      await expectComposerText(draft, unsent)
      const other = (await client.call('session.list', { workspaceId: ready.workspaceId })).items.find(
        (value) => value.id !== sessionId,
      )
      if (!other) throw new Error('Missing second session')
      await page.getByRole('treeitem', { name: other.title, exact: true }).click()
      await expect(page.locator(`[data-context-history-id="${record.id}"]`)).toHaveCount(0)
      await expect(marker).toHaveCount(0)
      await info.attach('window-statistics', {
        body: Buffer.from(JSON.stringify(record)),
        contentType: 'application/json',
      })
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanup(root)
    }
  })
}

test('manual compaction spins while active and leaves a durable transcript record', async ({ browser }, info) => {
  test.setTimeout(90000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-context-history-browser-'))
  const context = await browser.newContext({
    locale: 'zh-CN',
    colorScheme: 'dark',
    viewport: { width: 1440, height: 960 },
  })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      historyCount: 18,
      historyText: 'Authored history. '.repeat(60),
      compactionDelayMs: 1500,
      goalAutoContinue: false,
      budgetAutoContinue: false,
    })
    const { client, ready } = host
    const sessionId = ready.sessionId
    await client.call('provider.save', {
      provider: {
        id: 'manual-context',
        name: 'Manual context fixture',
        protocol: 'mock',
        baseUrl: 'http://localhost',
        model: 'manual-context',
        contextWindow: 8192,
        maxOutput: 256,
      },
    })
    const models = createModelCommandClient(client)
    const previous = await models.execute('session.getModel', { sessionId })
    await models.execute(
      'session.setModel',
      { sessionId, modelId: 'manual-context', baselineRevisions: previous.revisions },
      { idempotencyKey: crypto.randomUUID() },
    )
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const labels = contextHistoryCopy('zh-CN')
    await page.goto(base)
    await page.getByRole('treeitem', { name: ready.sessionTitle, exact: true }).click()
    const pending = createRunCommandClient(client)
      .execute('context.compact', { sessionId, modelId: 'manual-context' })
      .then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      )
    const notice = page.locator('.hbar-context-compaction-notice')
    await expect(notice).toContainText(labels.notice)
    await expect(notice.locator('.hbar-session-execution-spinner')).toBeVisible()
    const completed = await pending
    if ('error' in completed) throw completed.error
    await expect(notice).toHaveCount(0)
    const snapshot = await client.call('session.snapshot', { sessionId })
    const record = snapshot.contextHistory?.records[0]
    if (!record) throw new Error('Manual compaction was not recorded')
    expect(record.trigger).toBe('manual')
    expect(record.status).toBe('completed')
    const fact = snapshot.contextCompactions?.find((value) => value.id === record.id)
    if (!fact?.details) throw new Error('Missing manual marker measurements')
    const marker = page.locator(`[data-context-compaction-marker="${record.id}"]`)
    await expect(marker).toHaveText(labels.completed(fact))
    await marker.scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath('manual-compacted-desktop.png') })
    await page.setViewportSize({ width: 320, height: 960 })
    await expect(marker).toBeVisible()
    await marker.hover()
    const tooltip = page.getByRole('tooltip', { name: labels.detailsLabel, exact: true })
    for (const line of labels.completedDetails(fact)) await expect(tooltip).toContainText(line)
    const bounds = await tooltip.boundingBox()
    expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320).toBe(true)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true)
    await page.screenshot({ path: info.outputPath('manual-compacted-320.png') })
    const copy = getShellCopy('zh-CN')
    const draft = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    await draft.click()
    await expect(tooltip).toHaveCount(0)
    await marker.hover()
    await expect(tooltip).toBeVisible()
    await draft.fill('/')
    await expect(page.getByRole('listbox', { name: copy.session.slash.menu, exact: true })).toBeVisible()
    await expect(tooltip).toHaveCount(0)
    await page.keyboard.press('Escape')
    await draft.fill('')
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.reload()
    await page.getByRole('treeitem', { name: ready.sessionTitle, exact: true }).click()
    await expect(marker).toHaveCount(1)
    await expect(marker).toHaveText(labels.completed(fact))
    await expect(notice).toHaveCount(0)
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await cleanup(root)
  }
})
