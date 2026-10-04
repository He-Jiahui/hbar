import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  HbarClient,
  createSchemaCallbackClient,
  createSettingsCommandClient,
  createSystemCommandClient,
  type ClientTransport,
} from '@hbar/client'
import { HbarError } from '@hbar/contracts'
import { HBAR_SETTINGS_DESCRIPTION, Kernel, MemorySecrets } from '@hbar/kernel'
import { settingsDescriptionSchema, settingsReceiptInputSchema } from '@hbar/contracts/commands/settings'
import { compileContentGraph, createContentResolver, encodePath } from '@hbar/schema-core'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-settings-commands-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id, 'settings commands')
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'settings command test')
  return {
    client,
    workspace,
    session,
    async pairOther() {
      const other = new HbarClient(`http://127.0.0.1:${host.server.port}`)
      const pairing = await createSystemCommandClient(client).execute('pairing.create', {})
      await other.pair(pairing.code, 'other settings actor')
      cleanups.push(async () => other.disconnect())
      return other
    },
  }
}

const field = (name: string) => [{ kind: 'field' as const, name }]

test('settings description rejects type drift, duplicate paths and dynamic dependency cycles', () => {
  expect(Object.isFrozen(HBAR_SETTINGS_DESCRIPTION)).toBe(true)
  expect(
    settingsDescriptionSchema.safeParse({
      ...structuredClone(HBAR_SETTINGS_DESCRIPTION),
      fields: [
        ...structuredClone(HBAR_SETTINGS_DESCRIPTION.fields),
        { ...structuredClone(HBAR_SETTINGS_DESCRIPTION.fields[0]!), defaultValue: 42 },
      ],
    }).success,
  ).toBe(false)
  const cyclic = structuredClone(HBAR_SETTINGS_DESCRIPTION)
  cyclic.fields[1]!.content = {
    kind: 'options',
    callbackId: 'settings.getModels',
    callbackVersion: 1,
    dependsOn: [cyclic.fields[2]!.path],
  }
  expect(settingsDescriptionSchema.safeParse(cyclic).success).toBe(false)
})

test('settings description accepts bounded typed multi-select fields and rejects scalar or duplicate defaults', () => {
  const description = structuredClone(HBAR_SETTINGS_DESCRIPTION)
  description.fields.push({
    path: field('provider.modalities'),
    type: 'string',
    nullable: false,
    defaultValue: ['text'],
    choices: ['text', 'image'],
    allowedScopes: ['global', 'workspace', 'session'],
    applyMode: 'nextRun',
    labelKey: 'i18n:settings.provider.modalities.label',
    group: 'model',
    order: 30,
    component: 'MultiSelect',
    multiple: true,
  })
  expect(settingsDescriptionSchema.safeParse(description).success).toBe(true)
  description.fields.at(-1)!.defaultValue = 'text'
  expect(settingsDescriptionSchema.safeParse(description).success).toBe(false)
  description.fields.at(-1)!.defaultValue = ['text', 'text']
  expect(settingsDescriptionSchema.safeParse(description).success).toBe(false)
})

test('settings receipt query requires one exact original command input shape', () => {
  const input = {
    idempotencyKey: 'request-1',
    commandId: 'settings.set',
    input: {
      schemaVersion: 1,
      scope: { kind: 'global' },
      path: field('client.chatSendBehavior'),
      value: 'modifierEnter',
      baselineRevisions: { 'settings:global': 0 },
    },
  }
  expect(settingsReceiptInputSchema.safeParse(input).success).toBe(true)
  expect(settingsReceiptInputSchema.safeParse({ ...input, commandId: 'settings.unset' }).success).toBe(false)
  expect(settingsReceiptInputSchema.safeParse({ ...input, input: { ...input.input, unexpected: true } }).success).toBe(
    false,
  )
})

test('typed settings commands share catalog, layered CAS and actor-scoped idempotency', async () => {
  const { client, workspace, session } = await fixture()
  const commands = createSettingsCommandClient(client)
  const sessionScope = { kind: 'session' as const, targetId: session.id }
  const workspaceScope = { kind: 'workspace' as const, targetId: workspace.id }
  const model = field('provider.model')
  const modelKey = encodePath(model)

  const catalog = await client.call('command.catalog', { category: 'settings.providers', limit: 20 })
  expect(catalog.items.map((item) => item.metadata.id)).toEqual([
    'provider.delete',
    'provider.describe',
    'provider.list',
    'provider.preset.list',
    'provider.preset.models',
    'provider.save',
    'settings.apply',
    'settings.describe',
    'settings.get',
    'settings.receipt',
    'settings.set',
    'settings.unset',
  ])
  expect(await client.call('command.describe', { commandId: 'settings.apply' })).toMatchObject({
    metadata: { id: 'settings.apply', execution: 'host', stateEffect: 'persistent' },
  })

  const description = await commands.execute('settings.describe', {})
  expect(description).toMatchObject({
    id: 'hbar.settings',
    schemaVersion: 1,
    groups: [{ id: 'general' }, { id: 'model' }, { id: 'session' }, { id: 'providers' }, { id: 'extensions' }],
  })
  expect(description.fields.map((item) => encodePath(item.path))).toEqual([
    encodePath(field('client.chatSendBehavior')),
    encodePath(field('provider.model')),
    encodePath(field('provider.thinkingLevel')),
    encodePath(field('session.defaultBudget')),
    encodePath(field('session.approval')),
    encodePath(field('session.sandboxProfile')),
  ])

  const graph = compileContentGraph(
    description.fields.map((item) => ({
      path: item.path,
      valueType: item.type === 'integer' ? ('number' as const) : item.type,
      ...(item.content
        ? {
            callback: {
              id: item.content.callbackId,
              version: item.content.callbackVersion,
              dependsOn: item.content.dependsOn,
            },
          }
        : {}),
    })),
  )
  const resolver = createContentResolver({
    graph,
    port: createSchemaCallbackClient(client),
    hostId: 'test-host',
    identityId: 'settings-command-test',
  })
  const modelContent = await resolver.resolve({
    schemaId: description.id,
    schemaVersion: description.schemaVersion,
    scope: { kind: 'session', id: session.id },
    formId: 'settings-form',
    formRevision: 0,
    path: field('provider.model'),
    data: {},
  })
  expect(modelContent.status === 'ready' ? modelContent.options.map((option) => option.value) : []).toContain(
    'local-fixture',
  )
  const thinkingContent = await resolver.resolve({
    schemaId: description.id,
    schemaVersion: description.schemaVersion,
    scope: { kind: 'session', id: session.id },
    formId: 'settings-form',
    formRevision: 0,
    path: field('provider.thinkingLevel'),
    data: { [modelKey]: 'local-fixture' },
  })
  expect(thinkingContent.status === 'ready' ? thinkingContent.options.length : 0).toBeGreaterThan(0)
  resolver.dispose()

  const before = await commands.execute('settings.get', { scope: sessionScope, path: model })
  expect(Object.keys(before.resolution.reports)).toEqual([modelKey])
  expect(before.resolution.reports[modelKey]).toMatchObject({ effectiveValue: null, localPresence: false })

  const input = {
    schemaVersion: 1,
    scope: sessionScope,
    path: model,
    value: 'local-fixture',
    baselineRevisions: before.revisions,
  }
  const first = await commands.execute('settings.set', input, { idempotencyKey: 'set-model' })
  expect(first).toMatchObject({
    layerId: `settings:session:${session.id}`,
    revision: 1,
  })
  expect(first.resolution.reports[modelKey]).toMatchObject({
    effectiveValue: 'local-fixture',
    localPresence: true,
    applyMode: 'nextRun',
    applyState: 'pending',
  })
  expect(await commands.execute('settings.set', input, { idempotencyKey: 'set-model' })).toEqual(first)
  expect(
    await commands.execute('settings.receipt', {
      idempotencyKey: 'set-model',
      commandId: 'settings.set',
      input,
    }),
  ).toEqual(first)
  await expect(
    commands.execute('settings.set', { ...input, value: 'different' }, { idempotencyKey: 'set-model' }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })

  const workspaceBefore = await commands.execute('settings.get', { scope: workspaceScope })
  const batch = await commands.execute(
    'settings.apply',
    {
      schemaVersion: 1,
      scope: workspaceScope,
      changes: [
        { op: 'set', path: model, value: 'local-fixture' },
        { op: 'set', path: field('provider.thinkingLevel'), value: 'high' },
      ],
      baselineRevisions: workspaceBefore.revisions,
    },
    { idempotencyKey: 'workspace-batch' },
  )
  expect(batch).toMatchObject({ layerId: `settings:workspace:${workspace.id}`, revision: 1 })
  expect(
    await commands.execute('settings.receipt', {
      idempotencyKey: 'workspace-batch',
      commandId: 'settings.apply',
      input: {
        schemaVersion: 1,
        scope: workspaceScope,
        changes: [
          { op: 'set', path: model, value: 'local-fixture' },
          { op: 'set', path: field('provider.thinkingLevel'), value: 'high' },
        ],
        baselineRevisions: workspaceBefore.revisions,
      },
    }),
  ).toEqual(batch)

  const afterSet = await commands.execute('settings.get', { scope: sessionScope })
  const unset = await commands.execute(
    'settings.unset',
    { schemaVersion: 1, scope: sessionScope, path: model, baselineRevisions: afterSet.revisions },
    { idempotencyKey: 'unset-model' },
  )
  expect(unset.resolution.reports[modelKey]).toMatchObject({
    effectiveValue: 'local-fixture',
    localPresence: false,
    inherited: true,
  })
  expect(
    await commands.execute('settings.receipt', {
      idempotencyKey: 'unset-model',
      commandId: 'settings.unset',
      input: { schemaVersion: 1, scope: sessionScope, path: model, baselineRevisions: afterSet.revisions },
    }),
  ).toEqual(unset)

  const forbidden = field('session.defaultBudget')
  const current = await commands.execute('settings.get', { scope: sessionScope })
  await expect(
    commands.execute(
      'settings.set',
      { schemaVersion: 1, scope: sessionScope, path: forbidden, value: 100, baselineRevisions: current.revisions },
      { idempotencyKey: 'forbidden-layer' },
    ),
  ).rejects.toMatchObject({ code: 'LAYER_FORBIDDEN' })
})

test('global send shortcut survives lost response and exact actor/request receipt query without replay', async () => {
  const { client, workspace, pairOther } = await fixture()
  const commands = createSettingsCommandClient(client)
  const sendShortcut = field('client.chatSendBehavior')
  const encoded = encodePath(sendShortcut)
  const scope = { kind: 'global' as const }
  const initial = await commands.execute('settings.get', { scope, path: sendShortcut })
  expect(initial.resolution.reports[encoded]).toMatchObject({
    effectiveValue: 'enter',
    localPresence: false,
    applyMode: 'immediate',
    applyState: 'applied',
  })
  const input = {
    schemaVersion: 1,
    scope,
    path: sendShortcut,
    value: 'modifierEnter',
    baselineRevisions: initial.revisions,
  }
  const key = 'lost-shortcut-ack'
  let writes = 0
  const lossy: ClientTransport = {
    async call(method, params) {
      const response = await client.call(method, params)
      if (method === 'command.execute' && 'commandId' in params && params.commandId === 'settings.set') {
        writes += 1
        throw new HbarError('TIMEOUT', 'Response was lost after the Host committed')
      }
      return response
    },
  }
  const lossyCommands = createSettingsCommandClient(lossy)
  const lost = await lossyCommands.execute('settings.set', input, { idempotencyKey: key }).then(
    (result) => ({ result }),
    (error: unknown) => ({ error }),
  )
  if (!('error' in lost)) throw new Error('Expected lost response')
  expect(lost.error).toMatchObject({ code: 'RESULT_UNKNOWN' })
  expect(writes).toBe(1)
  const request = { idempotencyKey: key, commandId: 'settings.set' as const, input }
  const receipt = await commands.execute('settings.receipt', request)
  expect(receipt).toMatchObject({
    layerId: 'settings:global',
    revision: 1,
    values: { [encoded]: 'modifierEnter' },
  })
  expect(writes).toBe(1)
  const otherActor = createSettingsCommandClient(await pairOther())
  expect(await otherActor.execute('settings.receipt', request)).toBeNull()
  expect(await commands.execute('settings.receipt', { ...request, idempotencyKey: 'not-written' })).toBeNull()
  const wrong = await commands
    .execute('settings.receipt', {
      ...request,
      input: { ...input, value: 'enter' },
    })
    .then(
      (result) => ({ result }),
      (error: unknown) => ({ error }),
    )
  if (!('error' in wrong)) throw new Error('Expected original payload mismatch')
  expect(wrong.error).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  const wrongScope = await commands.execute('settings.receipt', {
    ...request,
    input: { ...input, scope: { kind: 'workspace', targetId: workspace.id } },
  })
  expect(wrongScope).toBeNull()
  const global = await commands.execute('settings.get', { scope })
  expect(global.resolution.reports[encoded]).toMatchObject({ effectiveValue: 'modifierEnter', localPresence: true })
  const workspaceSnapshot = await commands.execute('settings.get', {
    scope: { kind: 'workspace', targetId: workspace.id },
  })
  expect(workspaceSnapshot.resolution.reports[encoded]).toMatchObject({
    effectiveValue: 'modifierEnter',
    inherited: true,
  })
  const invalidLayer = await commands
    .execute(
      'settings.set',
      {
        ...input,
        scope: { kind: 'workspace', targetId: workspace.id },
        baselineRevisions: workspaceSnapshot.revisions,
      },
      { idempotencyKey: 'invalid-shortcut-layer' },
    )
    .then(
      (result) => ({ result }),
      (error: unknown) => ({ error }),
    )
  if (!('error' in invalidLayer)) throw new Error('Expected global-only field rejection')
  expect(invalidLayer.error).toMatchObject({ code: 'LAYER_FORBIDDEN' })
})
