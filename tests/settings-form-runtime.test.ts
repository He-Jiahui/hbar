import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor, type ExecuteOptions } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import { createSettingsCommandClient } from '@hbar/client'
import { HbarError } from '@hbar/contracts'
import { settingsCommands, type SettingsApplyInput, type SettingsReceipt } from '@hbar/contracts/commands/settings'
import type { Session, Workspace } from '@hbar/contracts/directory'
import { HBAR_SETTINGS_DEFINITIONS, HBAR_SETTINGS_DESCRIPTION } from '@hbar/kernel'
import { createSchemaCallbackRegistry, encodePath, type OptionContentReport } from '@hbar/schema-core'
import { applySettingsChanges, resolveSettings } from '@hbar/settings-core'

const workspace: Workspace = { id: 'w1', name: 'workspace', path: 'D:/workspace', createdAt: 1 }
const session: Session = {
  id: 's1',
  workspaceId: workspace.id,
  title: 'session',
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  seq: 1,
}
const directory: CommandExecutor = {
  execute(name, raw) {
    const input = raw as Record<string, unknown>
    if (name === 'workspace.get') return Promise.resolve(input.workspaceId === workspace.id ? workspace : null)
    if (name === 'session.get') return Promise.resolve(input.sessionId === session.id ? session : null)
    if (name === 'workspace.list') return Promise.resolve({ items: [workspace], nextCursor: null })
    if (name === 'session.list') return Promise.resolve({ items: [session], nextCursor: null })
    return Promise.reject(new Error(`Unexpected directory query: ${name}`))
  },
}

function settingsFixture() {
  const values: Record<string, Record<string, unknown>> = {
    'settings:global': {},
    [`settings:workspace:${workspace.id}`]: {},
    [`settings:session:${session.id}`]: {},
  }
  const revisions: Record<string, number> = Object.fromEntries(Object.keys(values).map((id) => [id, 0]))
  const receipts = new Map<string, SettingsReceipt>()
  const keys: string[] = []
  let release: (() => void) | null = null
  let unknown = false
  const chain = (scope: SettingsApplyInput['scope']) =>
    scope.kind === 'global'
      ? [{ id: 'settings:global', kind: 'global' }]
      : scope.kind === 'workspace'
        ? [
            { id: 'settings:global', kind: 'global' },
            { id: `settings:workspace:${scope.targetId}`, kind: 'workspace' },
          ]
        : [
            { id: 'settings:global', kind: 'global' },
            { id: `settings:workspace:${workspace.id}`, kind: 'workspace' },
            { id: `settings:session:${scope.targetId}`, kind: 'session' },
          ]
  const snapshot = (scope: SettingsApplyInput['scope']) => {
    const layers = chain(scope).map((layer) => ({
      ...layer,
      revision: revisions[layer.id]!,
      values: values[layer.id]!,
    }))
    return settingsCommands['settings.get'].output.parse({
      schemaVersion: 1,
      scope,
      revisions: Object.fromEntries(layers.map((layer) => [layer.id, layer.revision])),
      resolution: resolveSettings(HBAR_SETTINGS_DEFINITIONS, layers),
    })
  }
  const port: CommandExecutor = {
    async execute(name, raw, options?: ExecuteOptions) {
      if (name === 'settings.describe') return HBAR_SETTINGS_DESCRIPTION
      if (name === 'settings.get') return snapshot(settingsCommands[name].input.parse(raw).scope)
      if (name !== 'settings.apply') throw new Error(`Unexpected settings command: ${name}`)
      const input = settingsCommands[name].input.parse(raw)
      const key = options?.idempotencyKey
      if (!key) throw new CommandError('INVALID_INPUT', 'Missing key')
      keys.push(key)
      const prior = receipts.get(key)
      if (prior) return prior
      if (release)
        await new Promise<void>((resolve) => {
          const unblock = release!
          release = () => {
            unblock()
            resolve()
          }
        })
      const target = chain(input.scope).at(-1)!
      values[target.id] = {
        ...applySettingsChanges(HBAR_SETTINGS_DEFINITIONS, target.kind, values[target.id]!, input.changes),
      }
      revisions[target.id] = revisions[target.id]! + 1
      const current = snapshot(input.scope)
      const receipt = settingsCommands[name].output.parse({
        commitId: `commit-${key}`,
        layerId: target.id,
        revision: revisions[target.id],
        schemaVersion: 1,
        values: values[target.id],
        resolution: current.resolution,
      })
      receipts.set(key, receipt)
      if (unknown) {
        unknown = false
        throw new CommandError('RESULT_UNKNOWN', 'response lost')
      }
      return receipt
    },
  }
  return {
    port,
    keys,
    delayNext() {
      release = () => undefined
      return () => {
        const unblock = release
        release = null
        unblock?.()
      }
    },
    loseNextResponse() {
      unknown = true
    },
  }
}

async function waitFor<Value>(read: () => Value | undefined): Promise<Value> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const value = read()
    if (value !== undefined) return value
    await Bun.sleep(2)
  }
  throw new Error('Timed out waiting for settings state')
}

test('layered settings forms preserve per-scope drafts, concurrent edits and explicit inheritance', async () => {
  const settings = settingsFixture()
  const runtime = createAppRuntime({
    instanceId: 'settings-runtime',
    hostId: 'host',
    directory,
    settings: settings.port,
    surfaces: { canRender: (panelId) => panelId === 'settings' },
  })
  await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
  await runtime.view.commands.execute('app.openSettings', { scope: 'global' })
  const global = await waitFor(() => {
    const state = runtime.view.state.settings.getSnapshot()
    const entry = state.activeFormId ? state.forms[state.activeFormId] : undefined
    return entry?.status === 'ready' ? entry : undefined
  })
  const model = encodePath([{ kind: 'field', name: 'provider.model' }])
  await runtime.view.commands.execute('settingsForm.setField', {
    formId: global.formId,
    field: model,
    value: 'local-fixture',
  })
  const release = settings.delayNext()
  const submitting = runtime.view.commands.execute('settingsForm.submit', { formId: global.formId })
  await waitFor(() =>
    runtime.view.state.settings.getSnapshot().forms[global.formId]?.form?.status === 'submitting' ? true : undefined,
  )
  await runtime.view.commands.execute('settingsForm.setField', {
    formId: global.formId,
    field: model,
    value: 'newer-global-draft',
  })
  release()
  await submitting
  expect(runtime.view.state.settings.getSnapshot().forms[global.formId]?.form).toMatchObject({
    baseline: { [model]: 'local-fixture' },
    draft: { [model]: 'newer-global-draft' },
    dirty: [model],
  })

  await runtime.view.commands.execute('app.openSettings', { scope: 'workspace', targetId: workspace.id })
  const workspaceForm = await waitFor(() => {
    const state = runtime.view.state.settings.getSnapshot()
    const entry = state.activeFormId ? state.forms[state.activeFormId] : undefined
    return entry?.status === 'ready' && entry.scope.kind === 'workspace' ? entry : undefined
  })
  expect(workspaceForm.form?.draft[model]).toBe('local-fixture')
  expect(runtime.view.state.settings.getSnapshot().forms[global.formId]?.form?.draft[model]).toBe('newer-global-draft')
  await runtime.view.commands.execute('settingsForm.setField', {
    formId: workspaceForm.formId,
    field: model,
    value: 'workspace-model',
  })
  await runtime.view.commands.execute('settingsForm.submit', { formId: workspaceForm.formId })

  await runtime.view.commands.execute('app.openSettings', { scope: 'session', targetId: session.id })
  const sessionForm = await waitFor(() => {
    const state = runtime.view.state.settings.getSnapshot()
    const entry = state.activeFormId ? state.forms[state.activeFormId] : undefined
    return entry?.status === 'ready' && entry.scope.kind === 'session' ? entry : undefined
  })
  expect(sessionForm.form?.draft[model]).toBe('workspace-model')
  await runtime.view.commands.execute('settingsForm.setField', {
    formId: sessionForm.formId,
    field: model,
    value: 'session-model',
  })
  await runtime.view.commands.execute('settingsForm.submit', { formId: sessionForm.formId })
  await runtime.view.commands.execute('settingsForm.restoreInheritance', { formId: sessionForm.formId, field: model })
  expect(runtime.view.state.settings.getSnapshot().forms[sessionForm.formId]?.form?.draft[model]).toBe(
    'workspace-model',
  )
  await runtime.view.commands.execute('settingsForm.submit', { formId: sessionForm.formId })
  expect(runtime.view.state.settings.getSnapshot().forms[sessionForm.formId]?.reports[model]).toMatchObject({
    localPresence: false,
    inherited: true,
    effectiveValue: 'workspace-model',
  })
  const budget = encodePath([{ kind: 'field', name: 'session.defaultBudget' }])
  await expect(
    runtime.view.commands.execute('settingsForm.setField', {
      formId: sessionForm.formId,
      field: budget,
      value: '100',
    }),
  ).rejects.toMatchObject({ code: 'FIELD_READ_ONLY' })
  runtime.dispose()
})

test('unknown settings submission reuses its key and keeps edits made before reconciliation', async () => {
  const settings = settingsFixture()
  const runtime = createAppRuntime({
    instanceId: 'settings-unknown',
    hostId: 'host',
    directory,
    settings: settings.port,
    surfaces: { canRender: (panelId) => panelId === 'settings' },
  })
  await runtime.view.commands.execute('app.openSettings', { scope: 'global' })
  const form = await waitFor(() => {
    const state = runtime.view.state.settings.getSnapshot()
    const entry = state.activeFormId ? state.forms[state.activeFormId] : undefined
    return entry?.status === 'ready' ? entry : undefined
  })
  const model = encodePath([{ kind: 'field', name: 'provider.model' }])
  await runtime.view.commands.execute('settingsForm.setField', { formId: form.formId, field: model, value: 'accepted' })
  settings.loseNextResponse()
  await expect(runtime.view.commands.execute('settingsForm.submit', { formId: form.formId })).rejects.toMatchObject({
    code: 'RESULT_UNKNOWN',
  })
  await runtime.view.commands.execute('settingsForm.setField', {
    formId: form.formId,
    field: model,
    value: 'newer-draft',
  })
  await runtime.view.commands.execute('settingsForm.reconcile', { formId: form.formId })
  const reconciled = runtime.view.state.settings.getSnapshot().forms[form.formId]!
  expect(reconciled.form).toMatchObject({
    status: 'succeeded',
    baseline: { [model]: 'accepted' },
    draft: { [model]: 'newer-draft' },
    dirty: [model],
  })
  expect(reconciled.pendingKey).toBeNull()
  expect(settings.keys).toHaveLength(2)
  expect(settings.keys[0]).toBe(settings.keys[1])
  runtime.dispose()
})

test('settings client maps a lost persistent response to unknown and requires the original key', async () => {
  const client = createSettingsCommandClient({
    call: async () => {
      throw new HbarError('DISCONNECTED', 'lost')
    },
  })
  const input = {
    schemaVersion: 1,
    scope: { kind: 'global' as const },
    changes: [{ op: 'set' as const, path: [{ kind: 'field' as const, name: 'provider.model' }], value: 'model' }],
    baselineRevisions: { 'settings:global': 0 },
  }
  await expect(client.execute('settings.apply', input)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  await expect(client.execute('settings.apply', input, { idempotencyKey: 'settings-key' })).rejects.toMatchObject({
    code: 'RESULT_UNKNOWN',
  })
})

test('settings runtime projects dynamic content and rejects superseded dependency results', async () => {
  const settings = settingsFixture()
  const callbacks = createSchemaCallbackRegistry()
  const model = encodePath([{ kind: 'field', name: 'provider.model' }])
  const thinking = encodePath([{ kind: 'field', name: 'provider.thinkingLevel' }])
  let oldStarted = false
  const pendingOld: { resolve?: (report: OptionContentReport) => void } = {}
  callbacks.registerQuery('settings.getModels', {
    version: 1,
    valueType: 'string',
    async execute(request) {
      return {
        kind: 'options',
        status: 'ready',
        options: [
          { value: 'old', label: { kind: 'literal', text: 'Old model' }, disabled: false },
          { value: 'new', label: { kind: 'literal', text: 'New model' }, disabled: false },
        ],
        dependencyFingerprint: request.dependencyFingerprint,
        capabilityRevision: 'models:1',
      }
    },
  })
  callbacks.registerQuery('settings.getThinkingLevels', {
    version: 1,
    valueType: 'string',
    execute(request) {
      const selected = request.dependencies[model]
      if (selected === null)
        return Promise.resolve({ kind: 'options', status: 'unavailable', reasonCode: 'missing_model' })
      if (selected === 'old') {
        oldStarted = true
        return new Promise<OptionContentReport>((resolve) => {
          pendingOld.resolve = resolve
        })
      }
      return Promise.resolve({
        kind: 'options',
        status: 'ready',
        options: [{ value: 'high', label: { kind: 'literal', text: 'High' }, disabled: false }],
        dependencyFingerprint: request.dependencyFingerprint,
        capabilityRevision: 'thinking:new',
      })
    },
  })
  const runtime = createAppRuntime({
    instanceId: 'settings-content',
    hostId: 'host',
    directory,
    settings: settings.port,
    schemaContent: callbacks,
    surfaces: { canRender: (panelId) => panelId === 'settings' },
  })
  await runtime.view.commands.execute('app.openSettings', { scope: 'global' })
  const form = await waitFor(() => {
    const state = runtime.view.state.settings.getSnapshot()
    const entry = state.activeFormId ? state.forms[state.activeFormId] : undefined
    return entry?.content[model]?.status === 'ready' && entry.content[thinking]?.status === 'unavailable'
      ? entry
      : undefined
  })
  await runtime.view.commands.execute('settingsForm.setField', { formId: form.formId, field: model, value: 'old' })
  await waitFor(() => (oldStarted ? true : undefined))
  await runtime.view.commands.execute('settingsForm.setField', { formId: form.formId, field: model, value: 'new' })
  await waitFor(() => {
    const content = runtime.view.state.settings.getSnapshot().forms[form.formId]?.content[thinking]
    return content?.status === 'ready' && content.report.options[0]?.value === 'high' ? true : undefined
  })
  const stale = pendingOld.resolve
  if (!stale) throw new Error('Old dynamic request did not start')
  stale({
    kind: 'options',
    status: 'ready',
    options: [{ value: 'low', label: { kind: 'literal', text: 'Low' }, disabled: false }],
    dependencyFingerprint: 'stale',
    capabilityRevision: 'thinking:old',
  })
  await Bun.sleep(5)
  const content = runtime.view.state.settings.getSnapshot().forms[form.formId]?.content[thinking]
  expect(content?.status === 'ready' ? content.report.options.map((option) => option.value) : []).toEqual(['high'])
  runtime.dispose()
  callbacks.dispose()
})
