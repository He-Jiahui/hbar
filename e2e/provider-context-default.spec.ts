import { expect, test, type Page } from '@playwright/test'
import { createConfigurationCommandClient, createModelCommandClient, createSettingsCommandClient } from '@hbar/client'
import { settingsCommands } from '@hbar/contracts/commands/settings'
import { encodePath } from '@hbar/schema-core'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { openSessionTool } from './support/session-tools-menu'
import { expectLumenValue, selectLumenChoice, selectLumenOption } from './support/lumen-controls'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const rpcCommand = z.object({ params: z.object({ commandId: z.string(), input: z.unknown().optional() }) })
const modelPath = encodePath([{ kind: 'field', name: 'provider.model' }])
const thinkingPath = encodePath([{ kind: 'field', name: 'provider.thinkingLevel' }])

async function removeOwnedFixture(root: string): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-provider-context-'))
    throw new Error('Refusing to remove an unexpected provider context fixture')
  await rm(target, { recursive: true, force: true })
}

async function selectGroup(page: Page, locale: ShellLocale, group: 'providers' | 'model'): Promise<void> {
  const copy = getShellCopy(locale)
  const mobile = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
  if (await mobile.isVisible()) await selectLumenOption(mobile, group)
  else
    await page
      .getByRole('navigation', { name: copy.settings.groups, exact: true })
      .getByRole('button', { name: copy.settings.resolve(`i18n:settings.groups.${group}`), exact: true })
      .click()
}

for (const scenario of [
  { scope: 'session', locale: 'en-US', width: 1440 },
  { scope: 'workspace', locale: 'zh-CN', width: 320 },
] as const) {
  test(`contextual Providers changes only the global default and keeps the ${scenario.scope} draft`, async ({
    browser,
  }, info) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-provider-context-'))
    const context = await browser.newContext({ locale: scenario.locale, viewport: { width: 1440, height: 900 } })
    const copy = getShellCopy(scenario.locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const settings = createSettingsCommandClient(host.client)
      const models = createModelCommandClient(host.client)
      const providerId = 'context-default-fixture'
      await createConfigurationCommandClient(host.client).execute('provider.save', {
        provider: {
          id: providerId,
          name: 'Context gateway — 上下文供应商',
          protocol: 'mock',
          baseUrl: 'http://127.0.0.1',
          model: 'primary',
          models: [{ id: 'primary', name: 'Primary model — 主模型' }],
        },
      })
      const catalog = await models.execute('model.list', {})
      const targetModel = catalog.find((model) => model.providerId === providerId && model.modelId === 'primary')
      if (!targetModel) throw new Error('The configured primary is missing from the Host model catalog')
      const originalModel = catalog.find((model) => model.id === 'local-fixture')
      if (!originalModel) throw new Error('The original selection is missing from the Host model catalog')
      const initial = await settings.execute('settings.get', { scope: { kind: 'global' } })
      await settings.execute(
        'settings.apply',
        {
          scope: { kind: 'global' },
          schemaVersion: initial.schemaVersion,
          baselineRevisions: initial.revisions,
          changes: [{ op: 'set', path: [{ kind: 'field', name: 'provider.model' }], value: 'local-fixture' }],
        },
        { idempotencyKey: `context-default-initial-${scenario.scope}` },
      )
      const workspaceScope = { kind: 'workspace' as const, targetId: host.ready.workspaceId }
      if (scenario.scope === 'workspace') {
        const initialWorkspace = await settings.execute('settings.get', { scope: workspaceScope })
        await settings.execute(
          'settings.apply',
          {
            scope: workspaceScope,
            schemaVersion: initialWorkspace.schemaVersion,
            baselineRevisions: initialWorkspace.revisions,
            changes: [
              { op: 'set', path: [{ kind: 'field', name: 'provider.model' }], value: 'local-fixture' },
              { op: 'set', path: [{ kind: 'field', name: 'provider.thinkingLevel' }], value: 'high' },
            ],
          },
          { idempotencyKey: 'context-default-workspace-override' },
        )
      }
      const before = await settings.execute('settings.get', { scope: { kind: 'global' } })
      const beforeWorkspace = await settings.execute('settings.get', { scope: workspaceScope })
      const originalSession = await models.execute('session.getModel', { sessionId: host.ready.sessionId })
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
              if (parsed.data.params.commandId === 'settings.apply') writes.push(parsed.data.params.input)
              if (parsed.data.params.commandId.startsWith('run.')) runCommands.push(parsed.data.params.commandId)
            }
          }
          server.send(message)
        })
        server.onMessage((message) => socket.send(message))
      })
      await page.goto(base)
      const expand = page.getByRole('button', {
        name: copy.shell.expandWorkspace(host.ready.workspaceName),
        exact: true,
      })
      if (await expand.isVisible()) await expand.click()
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const composerDraft = 'Return to this conversation — 保留未发送内容'
      await prompt.fill(composerDraft)
      await openSessionTool(page, copy.session.tools, 'settings')
      const scope = page.getByRole('combobox', { name: copy.settings.scopes, exact: true })
      await expectLumenValue(scope, 'session')
      if (scenario.scope === 'workspace') await selectLumenOption(scope, 'workspace')
      await expectLumenValue(scope, scenario.scope)
      const model = page.locator(`[id="hbar-schema-field-${modelPath}"]`)
      const originalModelLabel = `${originalModel.providerName} · ${originalModel.modelName}`
      await expect(model).toHaveValue(originalModelLabel)
      const thinking = page.locator(`[id="hbar-schema-field-${thinkingPath}"]`)
      const dirtyThinking = (await thinking.getAttribute('data-value')) === 'string:low' ? 'string:high' : 'string:low'
      await selectLumenChoice(thinking, dirtyThinking)
      await expect(page.getByRole('button', { name: copy.settings.save, exact: true })).toBeEnabled()
      await selectGroup(page, scenario.locale, 'providers')
      await page.setViewportSize({ width: scenario.width, height: 900 })
      await expect(page.getByText(copy.settings.hostScope, { exact: true })).toBeVisible()
      await expect(scope).toHaveCount(0)
      const row = page.locator(`[data-provider-id="${providerId}"]`)
      await expect(row.getByTestId('provider-default-action')).toBeEnabled()
      await page.screenshot({ path: info.outputPath(`context-default-before-${scenario.scope}.png`) })
      await row.getByTestId('provider-default-action').click()
      await expect(row.getByTestId('provider-global-default')).toBeVisible()
      await expect(page.locator('.hbar-app-react-provider-dialog')).toHaveCount(0)
      await expect(scope).toHaveCount(0)
      const after = await settings.execute('settings.get', { scope: { kind: 'global' } })
      expect(after.resolution.reports[modelPath]?.effectiveValue).toBe(targetModel.id)
      expect(after.resolution.reports[thinkingPath]?.effectiveValue).toEqual(
        before.resolution.reports[thinkingPath]?.effectiveValue,
      )
      expect(writes.map((input) => settingsCommands['settings.apply'].input.parse(input))).toEqual([
        expect.objectContaining({
          scope: { kind: 'global' },
          changes: [{ op: 'set', path: [{ kind: 'field', name: 'provider.model' }], value: targetModel.id }],
        }),
      ])
      const preservedSession = await models.execute('session.getModel', { sessionId: host.ready.sessionId })
      expect(preservedSession.modelId).toBe(originalSession.modelId)
      expect(preservedSession.thinkingLevel).toBe(originalSession.thinkingLevel)
      const afterWorkspace = await settings.execute('settings.get', { scope: workspaceScope })
      expect(afterWorkspace.resolution.layers.filter((layer) => layer.kind === 'workspace')).toEqual(
        beforeWorkspace.resolution.layers.filter((layer) => layer.kind === 'workspace'),
      )
      if (scenario.scope === 'workspace') {
        expect(afterWorkspace.resolution.reports[modelPath]?.localValue).toBe('local-fixture')
        expect(afterWorkspace.resolution.reports[thinkingPath]?.localValue).toBe('high')
      }
      expect(runCommands).toEqual([])
      await page.screenshot({ path: info.outputPath(`context-default-after-${scenario.scope}.png`) })
      await selectGroup(page, scenario.locale, 'model')
      await expectLumenValue(scope, scenario.scope)
      await expect(model).toHaveValue(originalModelLabel)
      await expectLumenValue(thinking, dirtyThinking)
      await expect(page.getByRole('button', { name: copy.settings.save, exact: true })).toBeEnabled()
      await page.screenshot({ path: info.outputPath(`context-default-draft-${scenario.scope}.png`) })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
      await expectComposerText(prompt, composerDraft)
      expect(writes).toHaveLength(1)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedFixture(root)
    }
  })
}
