import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { createAppRuntime, type SettingsFormEntry } from '@hbar/app-runtime'
import { settingsCommands, settingsDescriptionSchema, type SettingsApplyInput } from '@hbar/contracts/commands/settings'
import {
  encodePath,
  SchemaContentError,
  type OptionContentReport,
  type SchemaCallbackPort,
  type SchemaContentRequest,
} from '@hbar/schema-core'
import { resolveSettings, type SettingDefinition, type SettingsLayer } from '@hbar/settings-core'

const path = (name: string) => [{ kind: 'field' as const, name }]
const model = encodePath(path('model'))
const thinking = encodePath(path('thinking'))
const amount = encodePath(path('amount'))
const note = encodePath(path('note'))
const description = settingsDescriptionSchema.parse({
  id: 'settings.recovery.fixture',
  schemaVersion: 1,
  groups: [
    { id: 'model', labelKey: 'i18n:fixture.model', order: 1 },
    { id: 'other', labelKey: 'i18n:fixture.other', order: 2 },
  ],
  fields: [
    {
      name: 'model',
      type: 'string',
      value: 'initial',
      component: 'ComboBox',
      callback: 'fixture.models',
      dependencies: [],
    },
    {
      name: 'thinking',
      type: 'string',
      value: 'medium',
      component: 'ComboBox',
      callback: 'fixture.thinking',
      dependencies: [path('model')],
    },
    { name: 'amount', type: 'integer', value: 10, component: 'NumberField' },
    { name: 'note', type: 'string', value: 'default note', component: 'TextField' },
  ].map((field, index) => ({
    path: path(field.name),
    type: field.type,
    nullable: false,
    defaultValue: field.value,
    component: field.component,
    multiple: false,
    allowedScopes: ['global', 'workspace', 'session'],
    applyMode: 'nextRun',
    labelKey: `i18n:fixture.${field.name}`,
    group: field.name === 'note' ? 'other' : 'model',
    order: index,
    ...(field.callback
      ? { content: { kind: 'options', callbackId: field.callback, callbackVersion: 1, dependsOn: field.dependencies } }
      : {}),
  })),
})
const definitions: readonly SettingDefinition[] = description.fields.map((field) => ({
  path: field.path,
  schema: { kind: field.type },
  defaultValue: field.defaultValue,
  allowedLayers: field.allowedScopes,
  applyMode: field.applyMode,
}))

function report(request: SchemaContentRequest, value = 'fresh'): OptionContentReport {
  return {
    kind: 'options',
    status: 'ready',
    options: [{ value, label: { kind: 'literal', text: value }, disabled: false }],
    dependencyFingerprint: request.dependencyFingerprint,
    capabilityRevision: `fixture:${value}`,
  }
}
interface ContentCall {
  readonly request: SchemaContentRequest
  readonly signal: AbortSignal
}
type Query = (call: ContentCall) => Promise<OptionContentReport>

function fixture() {
  const calls: ContentCall[] = []
  const settingsReads: string[] = []
  const writes: { input: SettingsApplyInput; key: string | undefined }[] = []
  const subscriberErrors: unknown[] = []
  let query: Query = ({ request }) => Promise.resolve(report(request, 'initial'))
  let apply: () => Promise<never> = () => Promise.reject(new CommandError('RESULT_UNKNOWN', 'Fixture response lost'))
  const contents: SchemaCallbackPort = {
    query(_id, request, context) {
      const call = { request, signal: context.signal }
      calls.push(call)
      return query(call)
    },
  }
  const settings: CommandExecutor = {
    execute(command, input, execution) {
      if (command === 'settings.describe') {
        settingsReads.push(command)
        return Promise.resolve(description)
      }
      if (command === 'settings.get') {
        const { scope } = settingsCommands[command].input.parse(input)
        settingsReads.push(`${command}:${scope.kind}`)
        const layers: SettingsLayer[] = [
          { id: 'settings:global', kind: 'global', revision: 7, values: { [note]: 'parent note' } },
        ]
        if (scope.kind !== 'global')
          layers.push({
            id: `settings:${scope.kind}:${scope.targetId}`,
            kind: scope.kind,
            revision: 11,
            values: { [note]: 'local note' },
          })
        return Promise.resolve(
          settingsCommands[command].output.parse({
            schemaVersion: 1,
            scope,
            revisions: Object.fromEntries(layers.map((layer) => [layer.id, layer.revision])),
            resolution: resolveSettings(definitions, layers),
          }),
        )
      }
      if (command === 'settings.apply') {
        writes.push({ input: settingsCommands[command].input.parse(input), key: execution?.idempotencyKey })
        return apply()
      }
      return Promise.reject(new Error(`Unexpected fixture settings command ${command}`))
    },
  }
  const directory: CommandExecutor = {
    execute(command) {
      if (command === 'workspace.list' || command === 'session.list')
        return Promise.resolve({ items: [], nextCursor: null })
      if (command === 'workspace.get' || command === 'session.get') return Promise.resolve(null)
      return Promise.reject(new Error(`Unexpected fixture directory command ${command}`))
    },
  }
  const runtime = createAppRuntime({
    hostId: 'content-recovery-host',
    instanceId: crypto.randomUUID(),
    directory,
    settings,
    schemaContent: contents,
    surfaces: { canRender: (id) => ['settings', 'settings-editor', 'status'].includes(id) },
    onSubscriberError: (error) => subscriberErrors.push(error),
  })
  return {
    runtime,
    calls,
    settingsReads,
    writes,
    subscriberErrors,
    setQuery(next: Query) {
      query = next
    },
    setApply(next: () => Promise<never>) {
      apply = next
    },
    read(formId: string): SettingsFormEntry {
      const value = runtime.view.state.settings.getSnapshot().forms[formId]
      if (!value) throw new Error('Expected original cached form')
      return value
    },
    dispose() {
      runtime.dispose()
    },
  }
}
type Fixture = ReturnType<typeof fixture>

async function until<Value>(read: () => Value | undefined): Promise<Value> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const value = read()
    if (value !== undefined) return value
    await Bun.sleep(2)
  }
  throw new Error('Bounded settings content state wait expired')
}
async function open(
  testbed: Fixture,
  scope: 'global' | 'workspace' = 'global',
  targetId = 'workspace-a',
): Promise<SettingsFormEntry> {
  await testbed.runtime.view.commands.execute('app.openSettings', {
    scope,
    ...(scope === 'workspace' ? { targetId } : {}),
    instanceId: 'settings-recovery',
  })
  return until(() => {
    const state = testbed.runtime.view.state.settings.getSnapshot()
    const value = state.activeFormId ? state.forms[state.activeFormId] : undefined
    return value?.status === 'ready' &&
      value.content[model]?.status !== 'loading' &&
      value.content[thinking]?.status !== 'loading'
      ? value
      : undefined
  })
}
function pauseQueries(testbed: Fixture) {
  const pending: { call: ContentCall; settle: (value: OptionContentReport) => void }[] = []
  testbed.setQuery((call) => {
    const deferred = Promise.withResolvers<OptionContentReport>()
    pending.push({ call, settle: deferred.resolve })
    return deferred.promise
  })
  return {
    pending,
    release(value = 'fresh') {
      for (const item of pending.splice(0)) item.settle(report(item.call.request, value))
    },
  }
}
async function settled(testbed: Fixture, formId: string): Promise<SettingsFormEntry> {
  return until(() => {
    const current = testbed.read(formId)
    return [model, thinking].every((field) => current.content[field]?.status !== 'loading') ? current : undefined
  })
}
function recovery(testbed: Fixture, formId: string) {
  const current = testbed.read(formId)
  if (!current.form || !current.selectedGroup) throw new Error('Expected ready recovery target')
  return { formId, retry: { field: model, revision: current.form.revision, groupId: current.selectedGroup } }
}
async function failOptions(testbed: Fixture, formId: string): Promise<void> {
  testbed.setQuery(() => Promise.reject(new SchemaContentError('DISCONNECTED', 'Fixture disconnected')))
  await testbed.runtime.view.commands.execute('settingsForm.refreshContent', { formId })
  const current = await settled(testbed, formId)
  expect(current.content[model]).toEqual({ status: 'error', errorCode: 'DISCONNECTED' })
}

test('dynamic recovery is read-only and preserves dirty, raw, inheritance unsets and revisions', async () => {
  const testbed = fixture()
  try {
    const form = await open(testbed, 'workspace')
    const execute = testbed.runtime.view.commands.execute
    await execute('settingsForm.setField', { formId: form.formId, field: model, value: 'unsaved-model' })
    await execute('settingsForm.setField', { formId: form.formId, field: amount, value: '-' })
    await execute('settingsForm.restoreInheritance', { formId: form.formId, field: note })
    await settled(testbed, form.formId)
    const original = testbed.read(form.formId)
    expect(original.form?.raw[amount]).toBe('-')
    expect(original.unsets[note]).toBe(original.form?.revision)
    const reads = [...testbed.settingsReads]
    testbed.setQuery(() => Promise.reject(new SchemaContentError('DISCONNECTED', 'Fixture disconnected')))
    await execute('settingsForm.refreshContent', { formId: form.formId })
    const failed = await settled(testbed, form.formId)
    expect(failed.content[model]).toEqual({ status: 'error', errorCode: 'DISCONNECTED' })
    expect(failed.form).toBe(original.form)
    testbed.setQuery(({ request }) => Promise.resolve(report(request, 'reconnected')))
    await execute('settingsForm.refreshContent', recovery(testbed, form.formId))
    const recovered = await settled(testbed, form.formId)
    expect(recovered.content[model]?.status).toBe('ready')
    expect(recovered.form).toBe(original.form)
    expect(recovered.unsets).toEqual(original.unsets)
    expect(recovered.revisions).toEqual(original.revisions)
    expect(recovered.reports).toBe(original.reports)
    expect(testbed.settingsReads).toEqual(reads)
    expect(testbed.writes).toEqual([])
    expect(testbed.subscriberErrors).toEqual([])
  } finally {
    testbed.dispose()
  }
})

test('an unrelated draft edit cannot strand a content recovery in loading', async () => {
  const testbed = fixture()
  let release: () => void = () => undefined
  try {
    const form = await open(testbed)
    await failOptions(testbed, form.formId)
    const delayed = pauseQueries(testbed)
    release = delayed.release
    await testbed.runtime.view.commands.execute('settingsForm.refreshContent', recovery(testbed, form.formId))
    await until(() => (delayed.pending.length === 2 ? true : undefined))
    await testbed.runtime.view.commands.execute('settingsForm.setField', {
      formId: form.formId,
      field: note,
      value: 'newer unrelated draft',
    })
    const original = testbed.read(form.formId).form
    delayed.release('completed-original-read')
    const result = await settled(testbed, form.formId)
    expect(result.content[model]?.status).toBe('ready')
    expect(result.content[thinking]?.status).toBe('ready')
    expect(result.form).toBe(original)
    expect(result.form?.draft[note]).toBe('newer unrelated draft')
    expect(testbed.writes).toEqual([])
  } finally {
    release()
    testbed.dispose()
  }
})

test('a newer dependency read wins and an older reply cannot replace its field content', async () => {
  const testbed = fixture()
  try {
    const form = await open(testbed)
    const delayed = pauseQueries(testbed)
    await testbed.runtime.view.commands.execute('settingsForm.refreshContent', { formId: form.formId })
    await until(() => (delayed.pending.length === 2 ? true : undefined))
    testbed.setQuery(({ request }) => Promise.resolve(report(request, 'new-dependency')))
    await testbed.runtime.view.commands.execute('settingsForm.setField', {
      formId: form.formId,
      field: model,
      value: 'selected-new-model',
    })
    await until(() => (testbed.read(form.formId).content[thinking]?.status === 'ready' ? true : undefined))
    delayed.release('stale')
    const current = await settled(testbed, form.formId)
    const content = current.content[thinking]
    expect(content?.status === 'ready' ? content.report.options[0]?.value : null).toBe('new-dependency')
    expect(current.form?.draft[model]).toBe('selected-new-model')
    expect(testbed.writes).toEqual([])
  } finally {
    testbed.dispose()
  }
})

test('legacy background refresh can update a cached original scope without replacing active scope or reopening it', async () => {
  const testbed = fixture()
  try {
    const a = await open(testbed, 'workspace', 'workspace-a')
    const b = await open(testbed, 'workspace', 'workspace-b')
    await testbed.runtime.view.commands.execute('settingsForm.setField', {
      formId: b.formId,
      field: note,
      value: 'B draft',
    })
    const bBefore = testbed.read(b.formId)
    const delayed = pauseQueries(testbed)
    await testbed.runtime.view.commands.execute('settingsForm.refreshContent', { formId: a.formId })
    await until(() => (delayed.pending.length === 2 ? true : undefined))
    expect(delayed.pending.every(({ call }) => call.request.scope.id === 'workspace-a')).toBe(true)
    await testbed.runtime.view.commands.execute('app.closePanel', { instanceId: 'settings-recovery' })
    expect(testbed.runtime.view.state.settings.getSnapshot().activeFormId).toBeNull()
    delayed.release('only-A')
    expect((await settled(testbed, a.formId)).content[model]?.status).toBe('ready')
    expect(testbed.read(b.formId)).toBe(bBefore)
    expect(testbed.runtime.view.state.settings.getSnapshot().activeFormId).toBeNull()
    expect(testbed.runtime.view.state.presentation.getSnapshot().page.kind).toBe('session')
    expect(testbed.writes).toEqual([])
  } finally {
    testbed.dispose()
  }
})

test('disposing the old runtime aborts outstanding content and prevents late publication into either runtime', async () => {
  const old = fixture()
  const replacement = fixture()
  try {
    const oldForm = await open(old)
    const current = await open(replacement)
    const fresh = replacement.read(current.formId)
    const delayed = pauseQueries(old)
    await old.runtime.view.commands.execute('settingsForm.refreshContent', { formId: oldForm.formId })
    await until(() => (delayed.pending.length === 2 ? true : undefined))
    const original = old.runtime.view.state.settings.getSnapshot()
    const captured = [...delayed.pending]
    old.dispose()
    expect(captured.every(({ call }) => call.signal.aborted)).toBe(true)
    delayed.release('late-old-runtime')
    await Bun.sleep(0)
    expect(old.runtime.view.state.settings.getSnapshot()).toBe(original)
    expect(replacement.read(current.formId)).toBe(fresh)
    expect(replacement.writes).toEqual([])
  } finally {
    old.dispose()
    replacement.dispose()
  }
})

test('repeated UI recovery is BUSY during the original read and does not dispatch duplicate queries', async () => {
  const testbed = fixture()
  let release: () => void = () => undefined
  try {
    const form = await open(testbed)
    await failOptions(testbed, form.formId)
    const input = recovery(testbed, form.formId)
    const before = testbed.read(form.formId)
    const calls = testbed.calls.length
    const delayed = pauseQueries(testbed)
    release = delayed.release
    await testbed.runtime.view.commands.execute('settingsForm.refreshContent', input)
    await until(() => (delayed.pending.length === 2 ? true : undefined))
    await expect(testbed.runtime.view.commands.execute('settingsForm.refreshContent', input)).rejects.toMatchObject({
      code: 'BUSY',
    })
    expect(testbed.calls).toHaveLength(calls + 2)
    expect(delayed.pending.every(({ call }) => !call.signal.aborted)).toBe(true)
    expect(testbed.read(form.formId).form).toBe(before.form)
    delayed.release('original-recovery')
    await settled(testbed, form.formId)
    await expect(testbed.runtime.view.commands.execute('settingsForm.refreshContent', input)).rejects.toMatchObject({
      code: 'COMMAND_CONFLICT',
    })
    expect(testbed.calls).toHaveLength(calls + 2)
    expect(testbed.writes).toEqual([])
  } finally {
    release()
    testbed.dispose()
  }
})

test('UI recovery rejects stale draft revision, group and nonfailed field without altering the original draft', async () => {
  const testbed = fixture()
  try {
    const form = await open(testbed)
    await failOptions(testbed, form.formId)
    const stale = recovery(testbed, form.formId)
    const calls = testbed.calls.length
    await testbed.runtime.view.commands.execute('settingsForm.setField', {
      formId: form.formId,
      field: note,
      value: 'edited after failure',
    })
    await expect(testbed.runtime.view.commands.execute('settingsForm.refreshContent', stale)).rejects.toMatchObject({
      code: 'COMMAND_CONFLICT',
    })
    const original = testbed.read(form.formId)
    const input = recovery(testbed, form.formId)
    await testbed.runtime.view.commands.execute('settingsForm.selectGroup', { formId: form.formId, groupId: 'other' })
    await expect(testbed.runtime.view.commands.execute('settingsForm.refreshContent', input)).rejects.toMatchObject({
      code: 'COMMAND_CONFLICT',
    })
    await testbed.runtime.view.commands.execute('settingsForm.selectGroup', { formId: form.formId, groupId: 'model' })
    for (const field of [amount, 'missing-field', note])
      await expect(
        testbed.runtime.view.commands.execute('settingsForm.refreshContent', {
          ...input,
          retry: { ...input.retry, field },
        }),
      ).rejects.toMatchObject({ code: 'COMMAND_CONFLICT' })
    expect(testbed.calls).toHaveLength(calls)
    expect(testbed.read(form.formId).form).toBe(original.form)
    expect(testbed.writes).toEqual([])
  } finally {
    testbed.dispose()
  }
})

for (const change of ['scope', 'instance', 'closed'] as const) {
  test(`UI recovery cannot dispatch after its original ${change} changed`, async () => {
    const testbed = fixture()
    try {
      const form = await open(testbed, 'workspace', 'workspace-a')
      await failOptions(testbed, form.formId)
      const input = recovery(testbed, form.formId)
      const original = testbed.read(form.formId)
      testbed.setQuery(({ request }) => Promise.resolve(report(request, 'new-owner')))
      if (change === 'scope') await open(testbed, 'workspace', 'workspace-b')
      else if (change === 'instance') {
        await testbed.runtime.view.commands.execute('app.openSettings', {
          scope: 'workspace',
          targetId: 'workspace-a',
          instanceId: 'different-settings',
        })
        await until(() =>
          testbed.runtime.view.state.settings.getSnapshot().activeFormId !== form.formId ? true : undefined,
        )
      } else await testbed.runtime.view.commands.execute('app.closePanel', { instanceId: 'settings-recovery' })
      const activeId = testbed.runtime.view.state.settings.getSnapshot().activeFormId
      const before = testbed.calls.filter(({ request }) => request.formId === form.formId).length
      await expect(testbed.runtime.view.commands.execute('settingsForm.refreshContent', input)).rejects.toMatchObject({
        code: 'FORM_NOT_FOUND',
      })
      expect(testbed.calls.filter(({ request }) => request.formId === form.formId)).toHaveLength(before)
      expect(testbed.read(form.formId)).toBe(original)
      expect(testbed.runtime.view.state.settings.getSnapshot().activeFormId).toBe(activeId)
      expect(testbed.writes).toEqual([])
    } finally {
      testbed.dispose()
    }
  })
}

test('submission and unknown receipt block UI recovery without replaying or clearing the pending original intent', async () => {
  const testbed = fixture()
  const accepted = Promise.withResolvers<never>()
  const completion = accepted.promise.catch(() => undefined)
  try {
    const form = await open(testbed)
    await testbed.runtime.view.commands.execute('settingsForm.setField', {
      formId: form.formId,
      field: note,
      value: 'submitted-original',
    })
    await failOptions(testbed, form.formId)
    const input = recovery(testbed, form.formId)
    testbed.setApply(() => accepted.promise)
    const submission = testbed.runtime.view.commands.execute('settingsForm.submit', { formId: form.formId })
    const outcome = submission.then(
      () => null,
      (error: unknown) => error,
    )
    await until(() => (testbed.read(form.formId).form?.status === 'submitting' ? true : undefined))
    const pending = testbed.read(form.formId)
    const calls = testbed.calls.length
    await expect(testbed.runtime.view.commands.execute('settingsForm.refreshContent', input)).rejects.toMatchObject({
      code: 'BUSY',
    })
    expect(testbed.read(form.formId)).toBe(pending)
    accepted.reject(new CommandError('RESULT_UNKNOWN', 'Dispatched response was lost'))
    expect(await outcome).toMatchObject({ code: 'RESULT_UNKNOWN' })
    const unknown = testbed.read(form.formId)
    expect(unknown.form?.status).toBe('unknown')
    expect(unknown.pendingKey).toBe(pending.pendingKey)
    expect(unknown.pendingKey).toBeTypeOf('string')
    await expect(testbed.runtime.view.commands.execute('settingsForm.refreshContent', input)).rejects.toMatchObject({
      code: 'BUSY',
    })
    expect(testbed.read(form.formId)).toBe(unknown)
    expect(testbed.calls).toHaveLength(calls)
    expect(testbed.writes).toHaveLength(1)
    expect(testbed.writes[0]).toMatchObject({ key: unknown.pendingKey })
    // Existing provider-driven background reads remain compatible, but never settle a write.
    testbed.setQuery(({ request }) => Promise.resolve(report(request, 'background-only')))
    await testbed.runtime.view.commands.execute('settingsForm.refreshContent', { formId: form.formId })
    const refreshed = await settled(testbed, form.formId)
    expect(refreshed.form).toBe(unknown.form)
    expect(refreshed.pendingKey).toBe(unknown.pendingKey)
    expect(refreshed.error).toBe('RESULT_UNKNOWN')
    expect(testbed.writes).toHaveLength(1)
  } finally {
    accepted.reject(new CommandError('RESULT_UNKNOWN', 'Fixture closed'))
    await completion
    testbed.dispose()
  }
})

test('a full clean form reload supersedes an earlier same-revision options response', async () => {
  const testbed = fixture()
  let release: () => void = () => undefined
  try {
    const form = await open(testbed)
    const delayed = pauseQueries(testbed)
    release = delayed.release
    await testbed.runtime.view.commands.execute('settingsForm.refreshContent', { formId: form.formId })
    await until(() => (delayed.pending.length === 2 ? true : undefined))
    testbed.setQuery(({ request }) => Promise.resolve(report(request, 'reloaded-form')))
    await testbed.runtime.view.commands.execute('settingsForm.refresh', { formId: form.formId })
    const refreshed = await settled(testbed, form.formId)
    expect(refreshed.form?.revision).toBe(form.form?.revision)
    expect(refreshed.schema).not.toBe(form.schema)
    delayed.release('stale-before-reload')
    await Bun.sleep(0)
    expect(testbed.read(form.formId)).toBe(refreshed)
    for (const field of [model, thinking]) {
      const content = refreshed.content[field]
      expect(content?.status === 'ready' ? content.report.options[0]?.value : null).toBe('reloaded-form')
    }
    expect(testbed.writes).toEqual([])
  } finally {
    release()
    testbed.dispose()
  }
})

test('a failed disconnected retry stays failed until an explicit post-reconnect read, with no automatic writes', async () => {
  const testbed = fixture()
  try {
    const form = await open(testbed)
    await failOptions(testbed, form.formId)
    const original = testbed.read(form.formId)
    const calls = testbed.calls.length
    await testbed.runtime.view.commands.execute('settingsForm.refreshContent', recovery(testbed, form.formId))
    const failed = await settled(testbed, form.formId)
    expect(failed.content[model]).toEqual({ status: 'error', errorCode: 'DISCONNECTED' })
    expect(failed.form).toBe(original.form)
    expect(testbed.calls).toHaveLength(calls + 2)
    // This port does not expose a connection observer. Merely reconnecting it
    // cannot be claimed to trigger a runtime reload; the user retries explicitly.
    testbed.setQuery(({ request }) => Promise.resolve(report(request, 'connected-again')))
    await Bun.sleep(0)
    expect(testbed.calls).toHaveLength(calls + 2)
    await testbed.runtime.view.commands.execute('settingsForm.refreshContent', recovery(testbed, form.formId))
    const refreshed = await settled(testbed, form.formId)
    expect(refreshed.content[model]?.status).toBe('ready')
    expect(refreshed.form).toBe(original.form)
    expect(testbed.calls).toHaveLength(calls + 4)
    expect(testbed.writes).toEqual([])
  } finally {
    testbed.dispose()
  }
})
