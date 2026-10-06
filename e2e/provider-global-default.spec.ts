import { expect, test } from '@playwright/test'
import {
  createConfigurationCommandClient,
  createModelCommandClient,
  createSettingsCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { settingsCommands } from '@hbar/contracts/commands/settings'
import { encodePath } from '@hbar/schema-core'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { selectLumenOption } from './support/lumen-controls'

const rpcCommand = z
  .object({
    params: z.object({ commandId: z.string(), input: z.unknown().optional() }).passthrough(),
  })
  .passthrough()
const modelPath = encodePath([{ kind: 'field', name: 'provider.model' }])
const thinkingPath = encodePath([{ kind: 'field', name: 'provider.thinkingLevel' }])

async function removeOwnedFixture(root: string): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-provider-default-'))
    throw new Error('Refusing to remove an unexpected provider fixture path')
  await rm(target, { recursive: true, force: true })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`Provider row selects its configured primary globally without editing or retargeting a session: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-provider-default-'))
    const width = locale === 'en-US' ? 1440 : 320
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const configuration = createConfigurationCommandClient(host.client)
      const settings = createSettingsCommandClient(host.client)
      const models = createModelCommandClient(host.client)
      const sessions = createWorkspaceSessionCommandClient(host.client)
      const providerId = 'row-default-fixture'
      const providerName = 'Secondary gateway — 备用供应商'
      await configuration.execute('provider.save', {
        provider: {
          id: providerId,
          name: providerName,
          protocol: 'mock',
          baseUrl: 'http://127.0.0.1',
          model: 'primary-second',
          models: [
            { id: 'spare-first', name: 'Spare model — 备用模型' },
            { id: 'primary-second', name: 'Primary model — 主模型' },
          ],
        },
      })
      const targetModel = (await models.execute('model.list', {})).find(
        (model) => model.id === `${providerId}/primary-second`,
      )
      if (!targetModel) throw new Error('Configured primary model is missing from the fixture catalog')
      const initial = await settings.execute('settings.get', { scope: { kind: 'global' } })
      await settings.execute(
        'settings.apply',
        {
          scope: { kind: 'global' },
          schemaVersion: initial.schemaVersion,
          baselineRevisions: initial.revisions,
          changes: [{ op: 'set', path: [{ kind: 'field', name: 'provider.model' }], value: 'local-fixture' }],
        },
        { idempotencyKey: 'provider-default-initial-global' },
      )
      const before = await settings.execute('settings.get', { scope: { kind: 'global' } })
      const originalSessionModel = await models.execute('session.getModel', { sessionId: host.ready.sessionId })
      const inheritedSession = await sessions.execute(
        'session.create',
        {
          workspaceId: host.ready.workspaceId,
          title: 'Inherited global default — 继承全局默认',
        },
        { idempotencyKey: 'provider-default-inherited-session' },
      )
      const activity = await sessions.execute('workspace.activity.list', { limit: 20 })
      expect(activity.items.find((item) => item.workspace.id === host?.ready.workspaceId)?.latestSessionCreatedAt).toBe(
        inheritedSession.createdAt,
      )
      const copy = getShellCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      const writes: unknown[] = []
      const runCommands: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.routeWebSocket('**/rpc', (socket) => {
        const server = socket.connectToServer()
        socket.onMessage((message) => {
          if (typeof message === 'string') {
            const parsed = rpcCommand.safeParse(JSON.parse(message))
            if (parsed.success) {
              const { commandId, input } = parsed.data.params
              if (commandId === 'settings.apply') writes.push(input)
              if (commandId.startsWith('run.')) runCommands.push(commandId)
            }
          }
          server.send(message)
        })
        server.onMessage((message) => socket.send(message))
      })
      await page.goto(base)
      await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
      await expect(page.locator('.hbar-app-react-provider-list')).toBeVisible()
      await page.setViewportSize({ width, height: 900 })
      const row = page.locator(`[data-provider-id="${providerId}"]`)
      const currentRow = page.locator('[data-provider-id="local-fixture"]')
      await expect(currentRow.getByTestId('provider-global-default')).toBeVisible()
      await expect(row.getByTestId('provider-default-action')).toBeEnabled()
      await expect(row.getByText(copy.providers.list.notConfigured, { exact: true })).toBeVisible()
      await expect(currentRow.getByText(copy.providers.list.notConfigured, { exact: true })).toBeVisible()
      await page.screenshot({ path: info.outputPath(`provider-default-before-${locale}-${width}.png`) })
      await row.getByTestId('provider-default-action').click()
      await expect(row.getByTestId('provider-global-default')).toBeVisible()
      await expect(currentRow.getByTestId('provider-global-default')).toHaveCount(0)
      await expect(page.locator('.hbar-app-react-provider-dialog')).toHaveCount(0)
      await expect(page.locator('.hbar-app-react-provider-list')).toBeVisible()
      const after = await settings.execute('settings.get', { scope: { kind: 'global' } })
      expect(after.resolution.reports[modelPath]?.effectiveValue).toBe(`${providerId}/primary-second`)
      expect(after.resolution.reports[thinkingPath]?.effectiveValue).toEqual(
        before.resolution.reports[thinkingPath]?.effectiveValue,
      )
      expect(writes.map((input) => settingsCommands['settings.apply'].input.parse(input).changes)).toEqual([
        [{ op: 'set', path: [{ kind: 'field', name: 'provider.model' }], value: `${providerId}/primary-second` }],
      ])
      expect(runCommands).toEqual([])
      const preserved = await models.execute('session.getModel', { sessionId: host.ready.sessionId })
      expect(preserved.modelId).toBe(originalSessionModel.modelId)
      expect(preserved.thinkingLevel).toBe(originalSessionModel.thinkingLevel)
      const inherited = await models.execute('session.getModel', { sessionId: inheritedSession.id })
      expect(inherited.modelId).toBe(`${providerId}/primary-second`)
      expect(inherited.sources.model).toBe('settings:global')
      await page.screenshot({ path: info.outputPath(`provider-default-after-${locale}-${width}.png`) })
      if (width === 320)
        await selectLumenOption(page.getByRole('combobox', { name: copy.settings.groups, exact: true }), 'model')
      else
        await page
          .getByRole('navigation', { name: copy.settings.groups, exact: true })
          .getByRole('button', { name: copy.settings.resolve('i18n:settings.groups.model'), exact: true })
          .click()
      await expect(page.locator(`[id="hbar-schema-field-${modelPath}"]`)).toHaveValue(
        `${targetModel.providerName} · ${targetModel.modelName}`,
      )
      if (width === 320)
        await selectLumenOption(page.getByRole('combobox', { name: copy.settings.groups, exact: true }), 'providers')
      else
        await page
          .getByRole('navigation', { name: copy.settings.groups, exact: true })
          .getByRole('button', { name: copy.settings.resolve('i18n:settings.groups.providers'), exact: true })
          .click()

      // An already-active provider may use a non-primary model. Refresh must
      // report that actual model without replacing it with the configured main.
      await settings.execute(
        'settings.apply',
        {
          scope: { kind: 'global' },
          schemaVersion: after.schemaVersion,
          baselineRevisions: after.revisions,
          changes: [
            { op: 'set', path: [{ kind: 'field', name: 'provider.model' }], value: `${providerId}/spare-first` },
          ],
        },
        { idempotencyKey: 'provider-default-active-nonprimary' },
      )
      await page.getByRole('button', { name: copy.providers.list.refresh, exact: true }).click()
      await expect(row.getByTestId('provider-global-default')).toContainText('Spare model — 备用模型')
      await expect(row.getByTestId('provider-default-action')).toHaveCount(0)
      await row.getByRole('button', { name: copy.providers.list.edit(providerName), exact: true }).click()
      const dialog = page.locator('.hbar-app-react-provider-dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('#provider-name')).toHaveValue(providerName)
      await dialog.getByRole('button', { name: copy.providers.dialog.cancel, exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await page.reload()
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
      await expect(row.getByTestId('provider-global-default')).toContainText('Spare model — 备用模型')
      await page.setViewportSize({ width, height: 900 })
      expect(writes).toHaveLength(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedFixture(root)
    }
  })
}
