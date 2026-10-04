import { afterEach, expect, test } from 'bun:test'
import {
  CommandError,
  CommandRegistry,
  createCommandClient,
  type CommandExecutor,
  type ExecuteOptions,
} from '@hbar/commands'
import {
  workspaceDisplayNamesApplyInputSchema,
  workspaceDisplayNamesReceiptInputSchema,
  type WorkspaceDisplayNamesApplyInput,
  type WorkspaceDisplayNamesReceipt,
  type WorkspaceDisplayNamesSnapshot,
} from '@hbar/contracts/commands/workspace-display-names'
import {
  createWorkspaceDisplayNames,
  workspaceDisplayNamesClientCommands,
  workspaceDisplayName,
  type WorkspaceDisplayNames,
  type WorkspaceDisplayNamesOptions,
} from '../packages/app-runtime/src/workspace-display-names'

const owners: WorkspaceDisplayNames[] = []
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose()
})
const snapshot = (
  revision = 0,
  entries: WorkspaceDisplayNamesSnapshot['entries'] = [],
): WorkspaceDisplayNamesSnapshot => ({ schemaVersion: 1, revision, entries })
const workspaces = {
  A: { id: 'A', name: 'alpha', path: '/fixture/alpha' },
  B: { id: 'B', name: 'beta', path: '/fixture/beta' },
}
function deferred<Value>() {
  let resolve!: (value: Value) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<Value>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
async function until(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 100 && !predicate(); index++) await Bun.sleep(1)
  expect(predicate()).toBe(true)
}
type Reply = (input: unknown, execution: ExecuteOptions | undefined) => unknown | Promise<unknown>
function fixture(initial = snapshot()) {
  let saved = initial
  const invalidations = new Set<() => void>()
  const connections = new Set<(connected: boolean) => void>()
  const calls: { name: string; input: unknown; key: string | undefined; signal: AbortSignal | undefined }[] = []
  const receipts = new Map<string, WorkspaceDisplayNamesReceipt>()
  const replies = new Map<string, Reply[]>()
  let activeReads = 0
  let peakReads = 0
  const enqueue = (name: string, reply: Reply) => {
    const queue = replies.get(name) ?? []
    queue.push(reply)
    replies.set(name, queue)
  }
  const apply = (request: WorkspaceDisplayNamesApplyInput, key: string): WorkspaceDisplayNamesReceipt => {
    if (request.expectedRevision !== saved.revision) throw new CommandError('COMMAND_CONFLICT', 'External revision')
    const before = saved.entries.find((entry) => entry.workspaceId === request.workspaceId)?.displayName ?? null
    if (before !== request.expectedDisplayName) throw new CommandError('COMMAND_CONFLICT', 'Alias changed')
    const changed = before !== request.displayName
    const entries = saved.entries.filter((entry) => entry.workspaceId !== request.workspaceId)
    if (request.displayName !== null)
      entries.push({ workspaceId: request.workspaceId, displayName: request.displayName })
    saved = snapshot(saved.revision + Number(changed), entries)
    const receipt = { commitId: crypto.randomUUID(), revision: saved.revision, request, changed }
    receipts.set(key, receipt)
    return receipt
  }
  const host: CommandExecutor = {
    async execute(name, input, execution) {
      calls.push({ name, input: structuredClone(input), key: execution?.idempotencyKey, signal: execution?.signal })
      if (name === 'workspaceDisplayNames.get') {
        activeReads++
        peakReads = Math.max(peakReads, activeReads)
      }
      try {
        const reply = replies.get(name)?.shift()
        if (reply) return await reply(input, execution)
        if (name === 'workspaceDisplayNames.get') return structuredClone(saved)
        if (name === 'workspaceDisplayNames.apply')
          return apply(workspaceDisplayNamesApplyInputSchema.parse(input), execution?.idempotencyKey ?? '')
        if (name === 'workspaceDisplayNames.receipt') {
          const lookup = workspaceDisplayNamesReceiptInputSchema.parse(input)
          return receipts.get(lookup.idempotencyKey) ?? null
        }
        throw new Error(`Unexpected ${name}`)
      } finally {
        if (name === 'workspaceDisplayNames.get') activeReads--
      }
    },
  }
  const create = (extra: Partial<WorkspaceDisplayNamesOptions> = {}) => {
    const registry = new CommandRegistry()
    const owner = createWorkspaceDisplayNames(registry, {
      host,
      resolveWorkspace: (id) => (id === 'A' ? workspaces.A : id === 'B' ? workspaces.B : undefined),
      events: {
        subscribe(listener) {
          invalidations.add(listener)
          return () => {
            invalidations.delete(listener)
          }
        },
        onConnection(listener) {
          connections.add(listener)
          return () => {
            connections.delete(listener)
          }
        },
      },
      onSubscriberError: (error) => {
        throw error
      },
      isDisposed: () => false,
      ...extra,
    })
    owners.push(owner)
    return { owner, commands: createCommandClient(workspaceDisplayNamesClientCommands, registry), registry }
  }
  return {
    create,
    calls,
    receipts,
    enqueue,
    apply,
    saved: () => saved,
    save: (value: WorkspaceDisplayNamesSnapshot) => {
      saved = value
    },
    notify: () => {
      for (const listener of invalidations) listener()
    },
    connect: (connected: boolean) => {
      for (const listener of connections) listener(connected)
    },
    subscriptions: () => invalidations.size + connections.size,
    writes: () => calls.filter((call) => call.name === 'workspaceDisplayNames.apply'),
    reads: () => calls.filter((call) => call.name === 'workspaceDisplayNames.get'),
    peakReads: () => peakReads,
  }
}

async function failure(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
    return null
  } catch (error) {
    return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'unexpected'
  }
}
function editor(owner: WorkspaceDisplayNames) {
  const value = owner.reader.getSnapshot().editor
  if (!value) throw new Error('Expected the original editor')
  return value
}
async function draft(context: ReturnType<ReturnType<typeof fixture>['create']>, text: string, workspaceId = 'A') {
  await context.commands.execute('workspaceAlias.open', { workspaceId })
  await context.commands.execute('workspaceAlias.edit', {
    workspaceId,
    revision: editor(context.owner).revision,
    draft: text,
  })
  return { workspaceId, revision: editor(context.owner).revision }
}

test('unavailable defaults and public resolver preserve canonical identity', async () => {
  const registry = new CommandRegistry()
  const owner = createWorkspaceDisplayNames(registry, {
    onSubscriberError: () => undefined,
    isDisposed: () => false,
    resolveWorkspace: () => workspaces.A,
  })
  owners.push(owner)
  await owner.ready
  expect(owner.reader.getSnapshot()).toMatchObject({
    status: 'unavailable',
    snapshot: null,
    editor: null,
    requestInFlight: false,
  })
  expect(await failure(registry.execute('workspaceAlias.refresh', {}))).toBe('CAPABILITY_UNAVAILABLE')
  expect(workspaceDisplayName(workspaces.A, null)).toBe('alpha')
  expect(workspaceDisplayName(workspaces.A, snapshot(1, [{ workspaceId: 'A', displayName: 'Visible' }]))).toBe(
    'Visible',
  )
  expect(workspaces.A).toEqual({ id: 'A', name: 'alpha', path: '/fixture/alpha' })
})

test('save trims, updates only Host-confirmed snapshot, closes and next open is fresh; ordinary cancel discards', async () => {
  const f = fixture(),
    c = f.create()
  await c.owner.ready
  const target = await draft(c, '  Visible name  ')
  const identity = c.owner.snapshotReader.getSnapshot()
  await c.commands.execute('workspaceAlias.save', target)
  expect(c.owner.reader.getSnapshot()).toMatchObject({
    action: { status: 'succeeded', operation: 'save' },
    editor: null,
  })
  expect(c.owner.snapshotReader.getSnapshot()).not.toBe(identity)
  expect(f.saved().entries).toEqual([{ workspaceId: 'A', displayName: 'Visible name' }])
  await draft(c, 'discard me')
  await c.commands.execute('workspaceAlias.close', { workspaceId: 'A' })
  expect(c.owner.reader.getSnapshot().editor).toBeNull()
  await c.commands.execute('workspaceAlias.open', { workspaceId: 'A' })
  expect(editor(c.owner).draft).toBe('Visible name')
  expect(f.writes()).toHaveLength(1)
})

test('reset immediately writes null and stays open with canonical draft; Cancel cannot undo reset', async () => {
  const f = fixture(snapshot(4, [{ workspaceId: 'A', displayName: 'Alias' }])),
    c = f.create()
  await c.owner.ready
  await c.commands.execute('workspaceAlias.open', { workspaceId: 'A' })
  await c.commands.execute('workspaceAlias.reset', { workspaceId: 'A', revision: editor(c.owner).revision })
  expect(editor(c.owner)).toMatchObject({ open: true, draft: 'alpha', expectedDisplayName: null, expectedRevision: 5 })
  await c.commands.execute('workspaceAlias.close', { workspaceId: 'A' })
  expect(f.saved().entries).toEqual([])
  expect(f.writes()).toHaveLength(1)
})

test('invalid names never cross Host and same canonical name stores nullable reset', async () => {
  const f = fixture(),
    c = f.create()
  await c.owner.ready
  for (const [value, validation] of [
    [' ', 'required'],
    ['😀'.repeat(41), 'tooLong'],
    ['a\u0000b', 'invalid'],
  ] as const) {
    const target = await draft(c, value)
    await c.commands.execute('workspaceAlias.save', target)
    expect(editor(c.owner).validation).toBe(validation)
  }
  expect(f.writes()).toHaveLength(0)
  const target = await draft(c, 'alpha')
  await c.commands.execute('workspaceAlias.save', target)
  expect(f.writes()).toHaveLength(0)
  expect(c.owner.reader.getSnapshot().editor).toBeNull()
})

test('draft edits preserve stable derived snapshot identity and stale editor revision is rejected', async () => {
  const f = fixture(),
    c = f.create()
  await c.owner.ready
  const original = c.owner.snapshotReader.getSnapshot()
  const target = await draft(c, 'one')
  await c.commands.execute('workspaceAlias.edit', { ...target, draft: 'two' })
  expect(await failure(c.commands.execute('workspaceAlias.edit', { ...target, draft: 'late' }))).toBe(
    'COMMAND_CONFLICT',
  )
  expect(editor(c.owner).draft).toBe('two')
  expect(c.owner.snapshotReader.getSnapshot()).toBe(original)
  await c.commands.execute('workspaceAlias.refresh', {})
  expect(c.owner.snapshotReader.getSnapshot()).toBe(original)
})

test('pending and unknown close retain original editor; B cannot steal it; exact read-only receipt settles A', async () => {
  const f = fixture(),
    c = f.create()
  await c.owner.ready
  const gate = deferred<unknown>()
  f.enqueue('workspaceDisplayNames.apply', () => gate.promise)
  const target = await draft(c, 'Pending A')
  const saving = c.commands.execute('workspaceAlias.save', target)
  await until(() => f.writes().length === 1)
  await c.commands.execute('workspaceAlias.close', { workspaceId: 'A' })
  expect(editor(c.owner)).toMatchObject({ open: false, draft: 'Pending A' })
  expect(await failure(c.commands.execute('workspaceAlias.open', { workspaceId: 'B' }))).toBe('BUSY')
  const call = f.writes()[0]
  if (!call?.key) throw new Error('Missing original key')
  const request = workspaceDisplayNamesApplyInputSchema.parse(call.input)
  f.apply(request, call.key)
  gate.reject(new CommandError('RESULT_UNKNOWN', 'Reply lost'))
  await saving
  expect(c.owner.reader.getSnapshot()).toMatchObject({ action: { status: 'unknown' }, requestInFlight: false })
  await c.commands.execute('workspaceAlias.open', { workspaceId: 'A' })
  expect(editor(c.owner)).toMatchObject({ open: true, draft: 'Pending A' })
  await c.commands.execute('workspaceAlias.reconcile', {})
  expect(c.owner.reader.getSnapshot()).toMatchObject({ action: { status: 'succeeded' }, editor: null })
  expect(f.writes()).toHaveLength(1)
})

test('null, failed and mismatched receipt remain unknown without another mutation', async () => {
  const f = fixture(),
    c = f.create()
  await c.owner.ready
  f.enqueue('workspaceDisplayNames.apply', () => {
    throw new CommandError('TIMEOUT', 'lost')
  })
  await c.commands.execute('workspaceAlias.save', await draft(c, 'A'))
  const key = c.owner.reader.getSnapshot().action.key
  await c.commands.execute('workspaceAlias.reconcile', {})
  expect(c.owner.reader.getSnapshot().action.status).toBe('unknown')
  f.enqueue('workspaceDisplayNames.receipt', () => {
    throw new CommandError('TIMEOUT', 'read')
  })
  await c.commands.execute('workspaceAlias.reconcile', {})
  expect(c.owner.reader.getSnapshot().action.error).toBe('TIMEOUT')
  f.enqueue('workspaceDisplayNames.receipt', () => ({
    commitId: 'wrong',
    revision: 1,
    changed: true,
    request: { expectedRevision: 0, workspaceId: 'B', expectedDisplayName: null, displayName: 'A' },
  }))
  await c.commands.execute('workspaceAlias.reconcile', {})
  expect(c.owner.reader.getSnapshot().action).toMatchObject({ status: 'unknown', error: 'INVALID_OUTPUT', key })
  expect(editor(c.owner).draft).toBe('A')
  expect(f.writes()).toHaveLength(1)
})

test('ACK followed by failed GET stays succeeded, not failed save, without inventing current alias', async () => {
  const f = fixture(),
    c = f.create()
  await c.owner.ready
  const target = await draft(c, 'committed')
  f.enqueue('workspaceDisplayNames.get', () => {
    throw new CommandError('TIMEOUT', 'read')
  })
  await c.commands.execute('workspaceAlias.save', target)
  expect(c.owner.reader.getSnapshot()).toMatchObject({
    status: 'error',
    error: 'TIMEOUT',
    action: { status: 'succeeded' },
    editor: null,
    snapshot: { revision: 0 },
  })
  expect(f.saved().revision).toBe(1)
  await c.commands.execute('workspaceAlias.refresh', {})
  expect(c.owner.snapshotReader.getSnapshot()?.entries).toEqual([{ workspaceId: 'A', displayName: 'committed' }])
})

test('conflict preserves raw draft until explicit rebase then saves against latest alias', async () => {
  const f = fixture(),
    c = f.create()
  await c.owner.ready
  const target = await draft(c, 'my draft')
  f.save(snapshot(1, [{ workspaceId: 'A', displayName: 'external' }]))
  await c.commands.execute('workspaceAlias.save', target)
  expect(c.owner.reader.getSnapshot().action).toMatchObject({ status: 'failed', error: 'COMMAND_CONFLICT' })
  expect(editor(c.owner)).toMatchObject({ draft: 'my draft', expectedRevision: 0, conflict: true })
  await c.commands.execute('workspaceAlias.rebase', { workspaceId: 'A', revision: editor(c.owner).revision })
  expect(editor(c.owner)).toMatchObject({
    draft: 'my draft',
    expectedRevision: 1,
    expectedDisplayName: 'external',
    conflict: false,
  })
  await c.commands.execute('workspaceAlias.save', { workspaceId: 'A', revision: editor(c.owner).revision })
  expect(f.saved().entries).toEqual([{ workspaceId: 'A', displayName: 'my draft' }])
})

test('rebase response cannot replace a different owner, newer edit or reopened A', async () => {
  const f = fixture(),
    c = f.create()
  await c.owner.ready
  const target = await draft(c, 'A draft'),
    gate = deferred<unknown>()
  f.enqueue('workspaceDisplayNames.get', () => gate.promise)
  const reading = failure(c.commands.execute('workspaceAlias.rebase', target))
  await until(() => f.reads().length === 2)
  await c.commands.execute('workspaceAlias.close', { workspaceId: 'A' })
  await draft(c, 'B draft', 'B')
  await c.commands.execute('workspaceAlias.close', { workspaceId: 'B' })
  await draft(c, 'new A', 'A')
  gate.resolve(snapshot(1, [{ workspaceId: 'A', displayName: 'external' }]))
  expect(await reading).toBe('COMMAND_CONFLICT')
  expect(editor(c.owner).draft).toBe('new A')
})

test('notification burst coalesces one read plus one follow-up and two owners converge', async () => {
  const f = fixture(),
    a = f.create(),
    b = f.create()
  await Promise.all([a.owner.ready, b.owner.ready])
  const gate = deferred<unknown>()
  f.enqueue('workspaceDisplayNames.get', () => gate.promise)
  f.notify()
  await until(() => f.reads().length >= 4)
  for (let i = 0; i < 200; i++) f.notify()
  f.save(snapshot(1, [{ workspaceId: 'A', displayName: 'observed' }]))
  gate.resolve(snapshot())
  await until(() => a.owner.reader.getSnapshot().status === 'ready' && b.owner.reader.getSnapshot().status === 'ready')
  expect(a.owner.snapshotReader.getSnapshot()).toEqual(f.saved())
  expect(b.owner.snapshotReader.getSnapshot()).toEqual(f.saved())
  expect(f.peakReads()).toBeLessThanOrEqual(2)
})

test('older GET and same-version contradictory entries cannot replace newer confirmed state', async () => {
  const f = fixture(snapshot(2, [{ workspaceId: 'A', displayName: 'two' }])),
    c = f.create()
  await c.owner.ready
  for (const value of [snapshot(1), snapshot(2, [{ workspaceId: 'A', displayName: 'wrong' }])]) {
    f.enqueue('workspaceDisplayNames.get', () => value)
    await c.commands.execute('workspaceAlias.refresh', {})
    expect(c.owner.snapshotReader.getSnapshot()).toEqual(snapshot(2, [{ workspaceId: 'A', displayName: 'two' }]))
    expect(c.owner.reader.getSnapshot().status).toBe('error')
  }
})

test('disconnect retains physical write slot until settled; reconnect only reads, and disposal ignores late writes', async () => {
  const f = fixture(),
    c = f.create()
  await c.owner.ready
  const gate = deferred<unknown>()
  f.enqueue('workspaceDisplayNames.apply', () => gate.promise)
  const saving = c.commands.execute('workspaceAlias.save', await draft(c, 'A'))
  await until(() => f.writes().length === 1)
  f.connect(false)
  await saving
  expect(c.owner.reader.getSnapshot()).toMatchObject({
    status: 'offline',
    requestInFlight: true,
    action: { status: 'unknown' },
  })
  f.connect(true)
  await until(() => c.owner.reader.getSnapshot().status === 'ready')
  expect(await failure(c.commands.execute('workspaceAlias.reconcile', {}))).toBe('BUSY')
  gate.resolve(null)
  await until(() => !c.owner.reader.getSnapshot().requestInFlight)
  expect(c.owner.reader.getSnapshot().action.status).toBe('unknown')
  expect(f.writes()).toHaveLength(1)
  const identity = c.owner.reader.getSnapshot()
  c.owner.dispose()
  f.notify()
  f.connect(false)
  expect(c.owner.reader.getSnapshot()).toBe(identity)
  expect(f.subscriptions()).toBe(0)
})

test('pre-aborted submit makes no Host write and aborted physical read cannot publish after dispose', async () => {
  const f = fixture(),
    c = f.create()
  await c.owner.ready
  const target = await draft(c, 'A'),
    controller = new AbortController()
  controller.abort()
  expect(await failure(c.commands.execute('workspaceAlias.save', target, { signal: controller.signal }))).toBe(
    'CANCELLED',
  )
  expect(f.writes()).toHaveLength(0)
  const gate = deferred<unknown>()
  f.enqueue('workspaceDisplayNames.get', () => gate.promise)
  const loading = failure(c.commands.execute('workspaceAlias.refresh', {}))
  await until(() => f.reads().length === 2)
  c.owner.dispose()
  expect(await loading).toBe('RESULT_UNKNOWN')
  const closed = c.owner.reader.getSnapshot()
  gate.resolve(snapshot(8, [{ workspaceId: 'B', displayName: 'late' }]))
  await Bun.sleep(2)
  expect(c.owner.reader.getSnapshot()).toBe(closed)
  expect(f.subscriptions()).toBe(0)
})

test('full alias capacity rejects new item without dispatch but permits an existing item update and reset', async () => {
  const entries = Array.from({ length: 2000 }, (_, index) => ({ workspaceId: String(index), displayName: 'alias' }))
  const f = fixture(snapshot(2, entries)),
    c = f.create()
  await c.owner.ready
  await c.commands.execute('workspaceAlias.save', await draft(c, 'new'))
  expect(c.owner.reader.getSnapshot().action).toMatchObject({ status: 'failed', error: 'INPUT_TOO_LARGE' })
  expect(f.writes()).toHaveLength(0)
  const existing = f.create({ resolveWorkspace: (id) => ({ id, name: 'canonical', path: `/fixture/${id}` }) })
  await existing.owner.ready
  await existing.commands.execute('workspaceAlias.save', await draft(existing, 'updated', '0'))
  expect(f.saved().entries).toHaveLength(2000)
  await existing.commands.execute('workspaceAlias.open', { workspaceId: '0' })
  await existing.commands.execute('workspaceAlias.reset', {
    workspaceId: '0',
    revision: editor(existing.owner).revision,
  })
  expect(f.saved().entries).toHaveLength(1999)
})

test('normalized whitespace uses one exact capture and unchanged alias saves without a fabricated receipt', async () => {
  const f = fixture(snapshot(1, [{ workspaceId: 'A', displayName: 'Existing name' }])),
    c = f.create()
  await c.owner.ready
  await c.commands.execute('workspaceAlias.save', await draft(c, '  Existing   \nname  '))
  expect(f.writes()).toHaveLength(0)
  expect(c.owner.reader.getSnapshot()).toMatchObject({
    editor: null,
    action: { status: 'idle', key: null, receipt: null },
  })
  await c.commands.execute('workspaceAlias.save', await draft(c, `New${' '.repeat(100)}name`))
  expect(f.saved().entries).toEqual([{ workspaceId: 'A', displayName: 'New name' }])
  const canonical = f.create({
    resolveWorkspace: () => ({ id: 'A', name: 'folder   name', path: '/fixture/folder   name' }),
  })
  await canonical.owner.ready
  await canonical.commands.execute('workspaceAlias.save', await draft(canonical, 'folder name'))
  expect(f.saved().entries).toEqual([])
})

for (const edited of [false, true])
  test(`cold editor binds first confirmed base without a false conflict, preserves typed draft=${edited}`, async () => {
    const f = fixture(),
      gate = deferred<unknown>()
    f.enqueue('workspaceDisplayNames.get', () => gate.promise)
    const c = f.create()
    await c.commands.execute('workspaceAlias.open', { workspaceId: 'A' })
    expect(editor(c.owner)).toMatchObject({ baseLoaded: false, conflict: false, pristine: true, draft: 'alpha' })
    if (edited)
      await c.commands.execute('workspaceAlias.edit', {
        workspaceId: 'A',
        revision: editor(c.owner).revision,
        draft: 'local raw',
      })
    await c.commands.execute('workspaceAlias.save', { workspaceId: 'A', revision: editor(c.owner).revision })
    expect(f.writes()).toHaveLength(0)
    f.save(snapshot(7, [{ workspaceId: 'A', displayName: 'Saved alias' }]))
    gate.resolve(f.saved())
    await c.owner.ready
    expect(editor(c.owner)).toMatchObject({
      baseLoaded: true,
      expectedRevision: 7,
      expectedDisplayName: 'Saved alias',
      conflict: false,
      draft: edited ? 'local raw' : 'Saved alias',
    })
  })

test('failed initial read is not conflict; retry initializes pristine alias and cold A/B reply belongs to current B', async () => {
  const f = fixture()
  f.enqueue('workspaceDisplayNames.get', () => {
    throw new CommandError('TIMEOUT', 'initial')
  })
  const c = f.create()
  await c.commands.execute('workspaceAlias.open', { workspaceId: 'A' })
  await c.owner.ready
  expect(editor(c.owner)).toMatchObject({ baseLoaded: false, conflict: false })
  const gate = deferred<unknown>()
  f.enqueue('workspaceDisplayNames.get', () => gate.promise)
  const pending = c.commands.execute('workspaceAlias.refresh', {})
  await c.commands.execute('workspaceAlias.close', { workspaceId: 'A' })
  await c.commands.execute('workspaceAlias.open', { workspaceId: 'B' })
  gate.resolve(
    snapshot(3, [
      { workspaceId: 'A', displayName: 'Alias A' },
      { workspaceId: 'B', displayName: 'Alias B' },
    ]),
  )
  await pending
  expect(editor(c.owner)).toMatchObject({ workspaceId: 'B', draft: 'Alias B', baseLoaded: true, conflict: false })
})

test('ACK lower bound rejects an older pre-write read without presenting it as a failed mutation', async () => {
  const f = fixture(),
    c = f.create()
  await c.owner.ready
  const target = await draft(c, 'New name'),
    gate = deferred<unknown>()
  f.enqueue('workspaceDisplayNames.apply', (input, execution) => {
    const receipt = f.apply(workspaceDisplayNamesApplyInputSchema.parse(input), execution?.idempotencyKey ?? '')
    f.enqueue('workspaceDisplayNames.get', () => gate.promise)
    f.notify()
    return receipt
  })
  const saving = c.commands.execute('workspaceAlias.save', target)
  await until(() => f.reads().length === 2)
  gate.resolve(snapshot())
  await saving
  expect(c.owner.reader.getSnapshot().action.status).toBe('succeeded')
  expect(c.owner.snapshotReader.getSnapshot()?.revision).toBe(1)
  expect(f.writes()).toHaveLength(1)
})

test('local edit publishes synchronously before its Promise settles; two old-render edits and Save cannot overwrite it', async () => {
  const f = fixture(),
    c = f.create()
  await c.owner.ready
  await c.commands.execute('workspaceAlias.open', { workspaceId: 'A' })
  const captured = { workspaceId: 'A', revision: editor(c.owner).revision }
  let firstSettled = false
  const first = c.commands.execute('workspaceAlias.edit', { ...captured, draft: 'first event' }).then(() => {
    firstSettled = true
  })
  // No await or microtask here: the typed command/registry reaches the local handler in this stack.
  expect(firstSettled).toBe(false)
  expect(editor(c.owner).draft).toBe('first event')
  expect(editor(c.owner).revision).toBeGreaterThan(captured.revision)
  const second = failure(c.commands.execute('workspaceAlias.edit', { ...captured, draft: 'second old-render event' }))
  const saving = failure(c.commands.execute('workspaceAlias.save', captured))
  await first
  expect(await second).toBe('COMMAND_CONFLICT')
  expect(await saving).toBe('COMMAND_CONFLICT')
  expect(editor(c.owner).draft).toBe('first event')
  expect(f.writes()).toHaveLength(0)
  // A genuinely current subsequent event needs no await of the previous command's returned Promise.
  const next = c.commands.execute('workspaceAlias.edit', {
    workspaceId: 'A',
    revision: editor(c.owner).revision,
    draft: 'latest event',
  })
  const submit = c.commands.execute('workspaceAlias.save', { workspaceId: 'A', revision: editor(c.owner).revision })
  await Promise.all([next, submit])
  expect(f.saved().entries).toEqual([{ workspaceId: 'A', displayName: 'latest event' }])
  expect(f.writes()).toHaveLength(1)
})

test('editor revision fences stale callbacks after same-ID close/reopen and A to B to A, not just text races', async () => {
  const f = fixture(),
    c = f.create()
  await c.owner.ready
  const originalA = await draft(c, 'original A')
  await c.commands.execute('workspaceAlias.close', { workspaceId: 'A' })
  const reopenedA = await draft(c, 'reopened A')
  expect(await failure(c.commands.execute('workspaceAlias.save', originalA))).toBe('COMMAND_CONFLICT')
  expect(editor(c.owner)).toMatchObject({ workspaceId: 'A', draft: 'reopened A', revision: reopenedA.revision })
  await c.commands.execute('workspaceAlias.close', { workspaceId: 'A' })
  await draft(c, 'B', 'B')
  await c.commands.execute('workspaceAlias.close', { workspaceId: 'B' })
  const currentA = await draft(c, 'current A')
  for (const stale of [originalA, reopenedA]) {
    expect(await failure(c.commands.execute('workspaceAlias.edit', { ...stale, draft: 'stale overwrite' }))).toBe(
      'COMMAND_CONFLICT',
    )
    expect(await failure(c.commands.execute('workspaceAlias.save', stale))).toBe('COMMAND_CONFLICT')
    expect(await failure(c.commands.execute('workspaceAlias.reset', stale))).toBe('COMMAND_CONFLICT')
  }
  expect(editor(c.owner)).toMatchObject({ workspaceId: 'A', revision: currentA.revision, draft: 'current A' })
  expect(f.writes()).toHaveLength(0)
})
