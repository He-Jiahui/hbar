import { expect, test, type Page } from '@playwright/test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { z } from 'zod'
import { createChatDatabaseCommandClient, createSettingsCommandClient } from '@hbar/client'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { chatDatabaseCopy } from '../apps/web/src/chat-database-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { selectLumenOption } from './support/lumen-controls'

async function group(page: Page, locale: ShellLocale) {
  const shell = getShellCopy(locale)
  const copy = chatDatabaseCopy(locale)
  const mobile = page.getByRole('combobox', { name: shell.settings.groups, exact: true })
  if (await mobile.isVisible()) await selectLumenOption(mobile, 'chatDatabase')
  else
    await page
      .getByRole('navigation', { name: shell.settings.groups })
      .getByRole('button', { name: copy.title, exact: true })
      .click()
  await expect(page.getByRole('heading', { name: copy.overview, exact: true })).toBeVisible()
}
async function cleanup(root: string) {
  const exact = await realpath(root)
  if (
    dirname(exact).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(exact).startsWith('hbar-chat-browser-')
  )
    throw new Error('Refusing cleanup outside owned chat database fixture')
  await rm(exact, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
const wireSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    params: z
      .object({ commandId: z.string().optional(), idempotencyKey: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough()
async function interruptCleanupResponse(page: Page) {
  const writes: string[] = []
  let interrupted = false
  let cleanupId: string | number | undefined
  await page.routeWebSocket('**/rpc', (socket) => {
    const remote = socket.connectToServer()
    socket.onMessage((message) => {
      const raw: unknown = typeof message === 'string' ? JSON.parse(message) : null
      const rpc = wireSchema.safeParse(raw)
      if (rpc.success && rpc.data.params?.commandId === 'chatDatabase.cleanup') {
        writes.push(rpc.data.params.idempotencyKey ?? '')
        if (!interrupted) cleanupId = rpc.data.id
      }
      remote.send(message)
    })
    remote.onMessage((message) => {
      const raw: unknown = typeof message === 'string' ? JSON.parse(message) : null
      const rpc = wireSchema.safeParse(raw)
      if (!interrupted && cleanupId !== undefined && rpc.success && rpc.data.id === cleanupId) {
        interrupted = true
        void socket
          .close({ code: 1012, reason: 'Test loses a real accepted cleanup acknowledgement' })
          .catch(() => undefined)
        void remote.close().catch(() => undefined)
        return
      }
      socket.send(message)
    })
  })
  return { writes, interrupted: () => interrupted }
}
for (const locale of ['en-US', 'zh-CN'] as const)
  test(`real chat database settings save, paginate and clean fixed candidates: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-chat-browser-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        fixture: 'chat-database',
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const connection = await interruptCleanupResponse(page)
      page.setDefaultTimeout(10_000)
      let diagnostics = ''
      host.child.stderr?.on('data', (chunk: Buffer) => {
        diagnostics = (diagnostics + chunk.toString()).slice(-8000)
      })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const copy = chatDatabaseCopy(locale)
      const shell = getShellCopy(locale)
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await page.getByRole('button', { name: shell.shell.settings, exact: true }).click()
      await group(page, locale)
      const commands = createChatDatabaseCommandClient(host.client)
      const settings = createSettingsCommandClient(host.client)
      const workspaceId = host.ready.workspaceId
      await expect(page.locator('[data-database-metric="archived"] dd')).toHaveText('65')
      const retention = page.getByRole('textbox', {
        name: shell.settings.resolve('i18n:settings.chatDatabase.retentionDays.label'),
        exact: true,
      })
      await retention.fill('95')
      await page.getByRole('button', { name: shell.settings.save, exact: true }).click()
      await expect
        .poll(
          async () =>
            (await commands.execute('chatDatabase.statistics', { scope: { kind: 'global' } })).policy.retentionDays,
        )
        .toBe(95)
      await page.reload()
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await page.getByRole('button', { name: shell.shell.settings, exact: true }).click()
      await group(page, locale)
      await expect(retention).toHaveValue('95')
      await page.screenshot({ path: info.outputPath('database-overview-desktop.png') })
      const scopes = page.getByRole('combobox', { name: shell.settings.scopes, exact: true })
      await selectLumenOption(scopes, 'workspace')
      await expect(page.getByText(copy.scopedHelp, { exact: true })).toBeVisible()
      await retention.fill('96')
      await page.getByRole('button', { name: shell.settings.save, exact: true }).click()
      await expect
        .poll(
          async () =>
            (await settings.execute('settings.get', { scope: { kind: 'workspace', targetId: workspaceId } })).resolution
              .reports['f:chatDatabase.retentionDays']?.localPresence,
        )
        .toBe(true)
      const field = page.locator('.hbar-schema-form-field').filter({ has: retention })
      await field.getByRole('button', { name: shell.settings.restoreInheritance, exact: true }).click()
      await page.getByRole('button', { name: shell.settings.save, exact: true }).click()
      await expect
        .poll(
          async () =>
            (await settings.execute('settings.get', { scope: { kind: 'workspace', targetId: workspaceId } })).resolution
              .reports['f:chatDatabase.retentionDays']?.localPresence,
        )
        .toBe(false)
      await expect(retention).toHaveValue('95')
      await page.getByText(copy.shared, { exact: true }).click()
      await expect(page.locator('[data-database-metric="database"]')).toBeVisible()
      await page.screenshot({ path: info.outputPath('database-project-inherited.png') })
      await selectLumenOption(scopes, 'session')
      await expect(page.locator('[data-database-metric="sessions"] dd')).toHaveText('1')
      const cacheAction = copy.actions.find((item) => item.kind === 'cache')
      if (!cacheAction) throw new Error('Missing cache action copy')
      await expect(page.getByRole('article', { name: cacheAction.title, exact: true })).toHaveCount(0)
      await selectLumenOption(scopes, 'global')
      const records = page.getByRole('region', { name: copy.records, exact: true })
      await expect(records.locator('[data-operation-id]')).toHaveCount(50)
      const nextHistory = records.getByRole('button', { name: copy.nextPage, exact: true })
      await expect(nextHistory).toBeEnabled()
      await nextHistory.click()
      await expect(records.locator('[data-operation-id]')).toHaveCount(2)
      await records.getByRole('button', { name: copy.firstPage, exact: true }).click()
      const sessionsAction = copy.actions.find((item) => item.kind === 'sessions')
      if (!sessionsAction) throw new Error('Missing chat cleanup action copy')
      const action = page.getByRole('article', { name: sessionsAction.title, exact: true })
      await action.getByRole('button', { name: copy.generatePreview, exact: true }).click()
      await expect
        .poll(async () => {
          const latest = (await commands.execute('chatDatabase.history', { scope: { kind: 'global' } })).items[0]
          return latest?.status === 'failed' ? `${latest.error} ${diagnostics}` : latest?.status
        })
        .toBe('completed')
      await page.getByRole('button', { name: copy.review, exact: true }).click()
      const dialog = page.getByRole('dialog', { name: copy.previewTitle, exact: true })
      await expect(dialog.locator('.hbar-chat-database-preview-list li')).toHaveCount(50)
      await dialog.getByRole('button', { name: copy.nextPage, exact: true }).click()
      await expect(dialog.locator('.hbar-chat-database-preview-list li')).toHaveCount(16)
      await dialog.getByRole('button', { name: copy.firstPage, exact: true }).click()
      await page.screenshot({ path: info.outputPath('database-preview-desktop.png') })
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(page.getByRole('button', { name: copy.review, exact: true })).toBeFocused()
      await page.setViewportSize({ width: 320, height: 900 })
      await group(page, locale)
      await page.getByRole('button', { name: copy.review, exact: true }).click()
      await expect(dialog).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: info.outputPath('database-preview-narrow.png') })
      await dialog.getByRole('button', { name: copy.confirm, exact: true }).click()
      await expect.poll(connection.interrupted).toBe(true)
      const manual = page.getByRole('region', { name: copy.manual, exact: true })
      await expect(manual.locator('[data-operation-status="completed"]')).toHaveCount(2)
      await page.getByRole('button', { name: copy.refresh, exact: true }).click()
      await expect(page.locator('[data-database-metric="archived"] dd')).toHaveText('0')
      expect(connection.writes).toHaveLength(1)
      expect(
        (
          await host.client.call('session.list', {
            workspaceId: host.ready.workspaceId,
            includeArchived: true,
            limit: 100,
          })
        ).items.some((item) => item.id === host?.ready.sessionId),
      ).toBe(true)
      await page.screenshot({ path: info.outputPath('database-completed-narrow.png') })
      async function resource(kind: 'cache' | 'attachments' | 'database', confirm: boolean) {
        const descriptor = copy.actions.find((item) => item.kind === kind)
        if (!descriptor) throw new Error('Missing resource action copy')
        await page
          .getByRole('article', { name: descriptor.title, exact: true })
          .getByRole('button', { name: copy.generatePreview, exact: true })
          .click()
        await expect
          .poll(
            async () =>
              (await commands.execute('chatDatabase.history', { scope: { kind: 'global' } })).items[0]?.status,
          )
          .toBe('completed')
        if (confirm) {
          const previousCleanup = (
            await commands.execute('chatDatabase.history', { scope: { kind: 'global' } })
          ).items.find((job) => job.type === 'cleanup')?.operationId
          await page.getByRole('button', { name: copy.review, exact: true }).click()
          await dialog.getByRole('button', { name: copy.confirm, exact: true }).click()
          await expect
            .poll(async () => {
              const latest = (await commands.execute('chatDatabase.history', { scope: { kind: 'global' } })).items.find(
                (job) => job.type === 'cleanup' && job.kind === kind && job.operationId !== previousCleanup,
              )
              return latest?.status
            })
            .toBe('completed')
        } else await expect(page.getByText(copy.noCandidates, { exact: true })).toBeVisible()
      }
      await resource('cache', true)
      await page.getByRole('button', { name: copy.refresh, exact: true }).click()
      await expect(page.locator('[data-database-metric="cache"] dd')).toHaveText('0 B')
      await resource('attachments', false)
      await resource('database', true)
      const jobs = (await commands.execute('chatDatabase.history', { scope: { kind: 'global' } })).items
      await info.attach('actual-maintenance-jobs', { body: JSON.stringify(jobs), contentType: 'application/json' })
      expect(jobs.find((job) => job.kind === 'database' && job.type === 'cleanup')?.reclaimedBytes).toBeGreaterThan(0)
      const global = await settings.execute('settings.get', { scope: { kind: 'global' } })
      expect(global.resolution.reports['f:chatDatabase.retentionDays']?.effectiveValue).toBe(95)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanup(root)
    }
  })
