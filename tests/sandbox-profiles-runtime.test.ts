import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import {
  CommandError,
  CommandRegistry,
  createCommandClient,
  type CommandExecutor,
  type ExecuteOptions,
} from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import {
  createSandboxProfiles,
  sandboxProfileEditorCommands,
  type SandboxProfileEditorState,
} from '../packages/app-runtime/src/sandbox-profiles'
import { SandboxProfileService } from '@hbar/kernel'
import { createSandboxProfileStorage, SANDBOX_PROFILES_SQL } from '../packages/storage/src/sandbox-profiles'

type Fault = (name: string, input: unknown) => 'lose-before' | 'lose-after' | 'hold' | null

function host() {
  const db = new Database(':memory:')
  db.exec(SANDBOX_PROFILES_SQL)
  const storage = createSandboxProfileStorage(db)
  const service = new SandboxProfileService({
    list: async () => storage.list(),
    get: async (id) => storage.get(id),
    save: async (input, identity) => storage.save(input, identity),
    delete: async (input, identity) => storage.delete(input, identity),
    receipt: async (commandId, input, identity) => storage.receipt(commandId, input, identity),
    putSnapshot: async (record) => storage.putSnapshot(record),
    snapshot: async (digest) => storage.snapshot(digest),
  })
  const calls: string[] = []
  let fault: Fault = () => null
  const held: (() => void)[] = []
  const translate = async <Value>(run: () => Promise<Value>) => {
    try {
      return await run()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }
  const dispatch = (name: string, input: unknown, options?: ExecuteOptions): Promise<unknown> => {
    const identity = { actorId: 'device-a', idempotencyKey: options?.idempotencyKey ?? 'missing-key' }
    return translate(async (): Promise<unknown> => {
      if (name === 'sandbox.list') return { items: await service.list() }
      if (name === 'sandbox.get') return service.get((input as { id: string }).id)
      if (name === 'sandbox.save') return service.save(input as Parameters<typeof service.save>[0], identity)
      if (name === 'sandbox.delete') return service.delete(input as Parameters<typeof service.delete>[0], identity)
      if (name === 'sandbox.receipt') {
        const request = input as { commandId: 'sandbox.save' | 'sandbox.delete'; input: never; idempotencyKey: string }
        return service.receipt(request.commandId, request.input, {
          actorId: 'device-a',
          idempotencyKey: request.idempotencyKey,
        })
      }
      throw new CommandError('COMMAND_NOT_FOUND', name)
    })
  }
  const executor: CommandExecutor = {
    async execute(name, input, options) {
      calls.push(name)
      const mode = fault(name, input)
      if (mode === 'lose-before') throw new CommandError('CONNECTION_CLOSED', 'lost before the Host received it')
      if (mode === 'hold') await new Promise<void>((resolve) => held.push(resolve))
      const result = await dispatch(name, input, options)
      if (mode === 'lose-after') throw new CommandError('CONNECTION_CLOSED', 'lost after the Host committed it')
      return result
    },
  }
  return {
    db,
    service,
    executor,
    calls,
    setFault(next: Fault) {
      fault = next
    },
    release() {
      for (const resume of held.splice(0)) resume()
    },
  }
}

function runtime(fake = host()) {
  const local = new CommandRegistry()
  const listeners = new Set<() => void>()
  const profiles = createSandboxProfiles(local, {
    sandbox: fake.executor,
    events: {
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    onSubscriberError: (error) => {
      throw error
    },
    isDisposed: () => false,
  })
  const editor = (): SandboxProfileEditorState => {
    const value = profiles.reader.getSnapshot().editor
    if (!value) throw new Error('No editor')
    return value
  }
  const until = async (predicate: () => boolean) => {
    for (let attempt = 0; attempt < 200 && !predicate(); attempt++) await Bun.sleep(5)
    expect(predicate()).toBe(true)
  }
  return {
    fake,
    local: createCommandClient(sandboxProfileEditorCommands, local),
    profiles,
    editor,
    until,
    emitChanged: () => {
      for (const listener of listeners) listener()
    },
  }
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('Expected failure')
}

async function create(r: ReturnType<typeof runtime>, id: string, basedOn: string | null = ':read-only') {
  const { editorId } = await r.local.execute('sandboxProfiles.open', { target: { kind: 'new', basedOn } })
  await r.local.execute('sandboxProfiles.edit', { editorId, edit: { kind: 'text', field: 'id', value: id } })
  await r.local.execute('sandboxProfiles.edit', { editorId, edit: { kind: 'text', field: 'name', value: id } })
  return editorId
}

test('lists built-ins, opens them read-only and refreshes on Host change hints', async () => {
  const r = runtime()
  expect(await r.local.execute('sandboxProfiles.refresh', {})).toEqual({ count: 2 })
  const { editorId } = await r.local.execute('sandboxProfiles.open', {
    target: { kind: 'existing', id: ':workspace-write' },
  })
  await r.until(() => r.editor().status === 'ready')
  expect(r.editor()).toMatchObject({ editorId, mode: 'readonly', profileId: ':workspace-write', dirty: false })
  expect(r.editor().draft.grants.map((grant) => [grant.path, grant.access])).toEqual([
    ['.', 'write'],
    ['.git', 'read'],
    ['.hbar', 'read'],
  ])
  expect(r.editor().resolved?.chain.map((link) => link.id)).toEqual([':workspace-write', ':read-only'])
  expect(
    await failure(r.local.execute('sandboxProfiles.edit', { editorId, edit: { kind: 'add', section: 'grants' } })),
  ).toMatchObject({ code: 'FORBIDDEN' })
  await r.fake.service.save(
    {
      id: 'external',
      expectedRevision: null,
      name: 'External',
      description: '',
      extends: null,
      escalation: null,
      filesystem: { default: null, grants: [] },
      commands: { rules: [] },
      network: { enabled: null },
      tools: { rules: [] },
    },
    { actorId: 'other-device', idempotencyKey: 'external' },
  )
  r.emitChanged()
  await r.until(() => r.profiles.reader.getSnapshot().list.items.length === 3)
})

test('creates a profile through row edits that keep targeting the row the user acted on', async () => {
  const r = runtime()
  const editorId = await create(r, 'engine-strict')
  for (const section of ['grants', 'grants', 'commands', 'environment'] as const)
    await r.local.execute('sandboxProfiles.edit', { editorId, edit: { kind: 'add', section } })
  const [first, second] = r.editor().draft.grants
  await r.local.execute('sandboxProfiles.edit', {
    editorId,
    edit: { kind: 'grant', rowId: second!.rowId, path: 'docs/**/*.md' },
  })
  await r.local.execute('sandboxProfiles.edit', {
    editorId,
    edit: { kind: 'remove', section: 'grants', rowId: first!.rowId },
  })
  expect(r.editor().draft.grants).toEqual([{ rowId: second!.rowId, path: 'docs/**/*.md', access: 'write' }])
  expect(r.editor().issues.map((issue) => [issue.field, issue.column, issue.code])).toEqual([
    ['commands', 'pattern', 'required'],
    ['environment', 'name', 'required'],
  ])
  expect(await failure(r.local.execute('sandboxProfiles.save', { editorId }))).toMatchObject({ code: 'INVALID_INPUT' })
  const command = r.editor().draft.commands[0]!
  const variable = r.editor().draft.environment[0]!
  await r.local.execute('sandboxProfiles.edit', {
    editorId,
    edit: { kind: 'command', rowId: command.rowId, pattern: 'cargo test *' },
  })
  await r.local.execute('sandboxProfiles.edit', {
    editorId,
    edit: { kind: 'environment', rowId: variable.rowId, name: 'path', value: 'x' },
  })
  expect(r.editor().issues).toEqual([
    { field: 'environment', rowId: variable.rowId, column: 'name', code: 'protected' },
  ])
  await r.local.execute('sandboxProfiles.edit', {
    editorId,
    edit: { kind: 'environment', rowId: variable.rowId, name: 'CARGO_TARGET_DIR', value: 'D:/targets' },
  })
  await r.local.execute('sandboxProfiles.edit', { editorId, edit: { kind: 'escalation', value: 'deny' } })
  expect(r.editor()).toMatchObject({ dirty: true, issues: [] })
  expect(await r.local.execute('sandboxProfiles.save', { editorId })).toEqual({ id: 'engine-strict', revision: 1 })
  await r.until(() => r.editor().status === 'ready')
  expect(r.editor()).toMatchObject({ mode: 'edit', revision: 1, dirty: false, saved: true })
  expect(r.editor().resolved).toMatchObject({
    escalation: 'deny',
    environment: { set: { CARGO_TARGET_DIR: 'D:/targets' } },
  })
  expect(
    await failure(
      r.local.execute('sandboxProfiles.edit', { editorId, edit: { kind: 'text', field: 'id', value: 'renamed' } }),
    ),
  ).toMatchObject({ code: 'FORBIDDEN' })
  expect(r.profiles.reader.getSnapshot().list.items.map((item) => item.id)).toContain('engine-strict')
})

test('an unknown save keeps its key, blocks edits, and reconciles to the committed result', async () => {
  const r = runtime()
  const editorId = await create(r, 'lost-after')
  r.fake.setFault((name) => (name === 'sandbox.save' ? 'lose-after' : null))
  expect(await failure(r.local.execute('sandboxProfiles.save', { editorId }))).toMatchObject({
    code: 'CONNECTION_CLOSED',
  })
  expect(r.editor()).toMatchObject({ status: 'unknown', pending: 'save', error: 'CONNECTION_CLOSED' })
  expect(
    await failure(
      r.local.execute('sandboxProfiles.edit', { editorId, edit: { kind: 'text', field: 'name', value: 'x' } }),
    ),
  ).toMatchObject({ code: 'SUBMISSION_PENDING' })
  expect(
    await failure(
      r.local.execute('sandboxProfiles.open', { target: { kind: 'new', basedOn: null }, discardDraft: true }),
    ),
  ).toMatchObject({ code: 'SUBMISSION_PENDING' })
  r.fake.setFault(() => null)
  expect(await r.local.execute('sandboxProfiles.reconcile', { editorId })).toEqual({ committed: true })
  await r.until(() => r.editor().status === 'ready')
  expect(r.editor()).toMatchObject({ mode: 'edit', profileId: 'lost-after', revision: 1, saved: true })
  expect((await r.fake.service.list()).filter((item) => item.id === 'lost-after')).toHaveLength(1)
})

test('a save lost before the Host saw it is reported as not committed and can be sent again', async () => {
  const r = runtime()
  const editorId = await create(r, 'lost-before')
  r.fake.setFault((name) => (name === 'sandbox.save' ? 'lose-before' : null))
  await failure(r.local.execute('sandboxProfiles.save', { editorId }))
  r.fake.setFault(() => null)
  expect(await r.local.execute('sandboxProfiles.reconcile', { editorId })).toEqual({ committed: false })
  expect(r.editor()).toMatchObject({ status: 'failed', error: 'NOT_COMMITTED', pending: null })
  expect(await r.local.execute('sandboxProfiles.save', { editorId })).toEqual({ id: 'lost-before', revision: 1 })
})

test('retrying an unknown save replays the original key instead of creating a second write', async () => {
  const r = runtime()
  const editorId = await create(r, 'replayed')
  r.fake.setFault((name) => (name === 'sandbox.save' ? 'lose-after' : null))
  await failure(r.local.execute('sandboxProfiles.save', { editorId }))
  r.fake.setFault(() => null)
  expect(await r.local.execute('sandboxProfiles.save', { editorId })).toEqual({ id: 'replayed', revision: 1 })
})

test('a stale revision is a conflict that keeps the draft and can be reloaded', async () => {
  const r = runtime()
  const editorId = await create(r, 'shared')
  await r.local.execute('sandboxProfiles.save', { editorId })
  await r.until(() => r.editor().status === 'ready')
  const stored = await r.fake.service.get('shared')
  await r.fake.service.save(
    {
      id: 'shared',
      expectedRevision: stored!.profile.revision,
      name: 'Changed elsewhere',
      description: '',
      extends: ':read-only',
      escalation: null,
      filesystem: { default: null, grants: [] },
      commands: { rules: [] },
      network: { enabled: null },
      tools: { rules: [] },
    },
    { actorId: 'other-device', idempotencyKey: 'other' },
  )
  await r.local.execute('sandboxProfiles.edit', { editorId, edit: { kind: 'text', field: 'name', value: 'Mine' } })
  expect(await failure(r.local.execute('sandboxProfiles.save', { editorId }))).toMatchObject({
    code: 'COMMAND_CONFLICT',
  })
  expect(r.editor()).toMatchObject({ status: 'conflict', dirty: true, draft: { name: 'Mine' } })
  expect(
    await failure(r.local.execute('sandboxProfiles.open', { target: { kind: 'existing', id: 'shared' } })),
  ).toMatchObject({ code: 'DRAFT_DIRTY' })
  await r.local.execute('sandboxProfiles.open', { target: { kind: 'existing', id: 'shared' }, discardDraft: true })
  await r.until(() => r.editor().status === 'ready')
  expect(r.editor()).toMatchObject({ revision: 2, draft: { name: 'Changed elsewhere' }, dirty: false })
})

test('deletes only the confirmed saved profile and reports Host refusals near the editor', async () => {
  const r = runtime()
  const parent = await create(r, 'parent')
  await r.local.execute('sandboxProfiles.save', { editorId: parent })
  await r.until(() => r.editor().status === 'ready')
  const child = await create(r, 'child', 'parent')
  await r.local.execute('sandboxProfiles.save', { editorId: child })
  await r.until(() => r.editor().status === 'ready')
  const { editorId } = await r.local.execute('sandboxProfiles.open', { target: { kind: 'existing', id: 'parent' } })
  await r.until(() => r.editor().status === 'ready')
  expect(await failure(r.local.execute('sandboxProfiles.delete', { editorId, confirm: true }))).toMatchObject({
    code: 'SANDBOX_PROFILE_IN_USE',
  })
  expect(r.editor()).toMatchObject({ status: 'failed', error: 'SANDBOX_PROFILE_IN_USE' })
  const reopened = await r.local.execute('sandboxProfiles.open', { target: { kind: 'existing', id: 'child' } })
  await r.until(() => r.editor().status === 'ready')
  expect(await r.local.execute('sandboxProfiles.delete', { editorId: reopened.editorId, confirm: true })).toEqual({
    deleted: true,
  })
  expect(r.profiles.reader.getSnapshot().editor).toBeNull()
  expect(r.profiles.reader.getSnapshot().list.items.map((item) => item.id)).toEqual([
    ':read-only',
    ':workspace-write',
    'parent',
  ])
})

test('results for a replaced editor never overwrite the newer editor', async () => {
  const r = runtime()
  r.fake.setFault((name) => (name === 'sandbox.get' ? 'hold' : null))
  const first = await r.local.execute('sandboxProfiles.open', { target: { kind: 'existing', id: ':read-only' } })
  const second = await r.local.execute('sandboxProfiles.open', { target: { kind: 'new', basedOn: null } })
  r.fake.setFault(() => null)
  r.fake.release()
  await Bun.sleep(20)
  expect(r.editor()).toMatchObject({ editorId: second.editorId, mode: 'create', status: 'ready' })
  expect(
    await failure(
      r.local.execute('sandboxProfiles.edit', { editorId: first.editorId, edit: { kind: 'add', section: 'tools' } }),
    ),
  ).toMatchObject({ code: 'STALE_TARGET' })
})

test('missing Host capability and missing profiles are explicit states', async () => {
  const registry = new CommandRegistry()
  const offline = createSandboxProfiles(registry, { onSubscriberError: () => undefined, isDisposed: () => false })
  const local = createCommandClient(sandboxProfileEditorCommands, registry)
  expect(offline.reader.getSnapshot().available).toBe(false)
  expect(await failure(local.execute('sandboxProfiles.refresh', {}))).toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
  const r = runtime()
  await r.local.execute('sandboxProfiles.open', { target: { kind: 'existing', id: 'gone' } })
  await r.until(() => r.editor().status === 'missing')
})
