import { afterEach, expect, test } from 'bun:test'
import {
  CommandError,
  CommandRegistry,
  createCommandClient,
  type CommandExecutor,
  type ExecuteOptions,
} from '@hbar/commands'
import {
  workspaceOrganizationApplyInputSchema,
  workspaceOrganizationReceiptInputSchema,
  type WorkspaceOrganizationApplyInput,
  type WorkspaceOrganizationReceipt,
  type WorkspaceOrganizationSnapshot,
} from '@hbar/contracts/commands/workspace-organization'
import {
  createWorkspaceOrganization,
  workspaceOrganizationClientCommands,
  type WorkspaceOrganization,
  type WorkspaceOrganizationOptions,
} from '../packages/app-runtime/src/workspace-organization'

const owners: WorkspaceOrganization[] = []
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose()
})
const snapshot = (revision = 0, hiddenWorkspaceIds: string[] = []): WorkspaceOrganizationSnapshot => ({
  schemaVersion: 1,
  revision,
  hiddenWorkspaceIds,
})
const hide = (workspaceId = 'A', expectedRevision = 0) => ({
  workspaceId,
  expectedRevision,
  expectedHidden: false,
  hidden: true,
})
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
  const receipts = new Map<string, WorkspaceOrganizationReceipt>()
  const replies = new Map<string, Reply[]>()
  let activeReads = 0
  let peakReads = 0
  const enqueue = (name: string, reply: Reply) => {
    const queue = replies.get(name) ?? []
    queue.push(reply)
    replies.set(name, queue)
  }
  const apply = (request: WorkspaceOrganizationApplyInput, key: string): WorkspaceOrganizationReceipt => {
    if (request.expectedRevision !== saved.revision) throw new CommandError('COMMAND_CONFLICT', 'External revision')
    const hidden = new Set(saved.hiddenWorkspaceIds)
    if (request.change.kind === 'restoreHidden') hidden.clear()
    else {
      if (hidden.has(request.change.workspaceId) !== request.change.expectedHidden)
        throw new CommandError('COMMAND_CONFLICT', 'Item changed')
      if (request.change.hidden) hidden.add(request.change.workspaceId)
      else hidden.delete(request.change.workspaceId)
    }
    const changed = hidden.size !== saved.hiddenWorkspaceIds.length
    saved = snapshot(saved.revision + Number(changed), [...hidden])
    const receipt = { commitId: crypto.randomUUID(), revision: saved.revision, request, changed }
    receipts.set(key, receipt)
    return receipt
  }
  const host: CommandExecutor = {
    async execute(name, input, execution) {
      calls.push({ name, input: structuredClone(input), key: execution?.idempotencyKey, signal: execution?.signal })
      if (name === 'workspaceOrganization.get') {
        activeReads++
        peakReads = Math.max(peakReads, activeReads)
      }
      try {
        const reply = replies.get(name)?.shift()
        if (reply) return await reply(input, execution)
        if (name === 'workspaceOrganization.get') return structuredClone(saved)
        if (name === 'workspaceOrganization.apply')
          return apply(workspaceOrganizationApplyInputSchema.parse(input), execution?.idempotencyKey ?? '')
        if (name === 'workspaceOrganization.receipt') {
          const lookup = workspaceOrganizationReceiptInputSchema.parse(input)
          return receipts.get(lookup.idempotencyKey) ?? null
        }
        throw new Error(`Unexpected ${name}`)
      } finally {
        if (name === 'workspaceOrganization.get') activeReads--
      }
    },
  }
  const create = (extra: Partial<WorkspaceOrganizationOptions> = {}) => {
    const registry = new CommandRegistry()
    const owner = createWorkspaceOrganization(registry, {
      host,
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
    return { owner, commands: createCommandClient(workspaceOrganizationClientCommands, registry), registry }
  }
  return {
    create,
    calls,
    receipts,
    enqueue,
    apply,
    saved: () => saved,
    save: (value: WorkspaceOrganizationSnapshot) => {
      saved = value
    },
    notify: () => {
      for (const listener of invalidations) listener()
    },
    connect: (connected: boolean) => {
      for (const listener of connections) listener(connected)
    },
    subscriptions: () => invalidations.size + connections.size,
    writes: () => calls.filter((call) => call.name === 'workspaceOrganization.apply'),
    reads: () => calls.filter((call) => call.name === 'workspaceOrganization.get'),
    peakReads: () => peakReads,
  }
}

test('unavailable owner performs no I/O and exposes explicit capability failure', async () => {
  const registry = new CommandRegistry()
  const owner = createWorkspaceOrganization(registry, { onSubscriberError: () => undefined, isDisposed: () => false })
  owners.push(owner)
  await owner.ready
  expect(owner.reader.getSnapshot()).toMatchObject({
    status: 'unavailable',
    snapshot: null,
    action: { status: 'idle' },
  })
  await expect(registry.execute('workspaceSidebar.refresh', {})).rejects.toMatchObject({
    code: 'CAPABILITY_UNAVAILABLE',
  })
  await expect(owner.reveal('A')).resolves.toBeUndefined()
  expect(owner.reader.getSnapshot().action.error).toBe('CAPABILITY_UNAVAILABLE')
})

for (const count of [0, 1, 2000])
  test(`confirmed ${count} hidden IDs retain bounded canonical snapshot and restore without navigation`, async () => {
    const f = fixture(
      snapshot(
        4,
        Array.from({ length: count }, (_, index) => `workspace-${index}`),
      ),
    )
    const { owner, commands } = f.create()
    await owner.ready
    expect(owner.reader.getSnapshot().snapshot?.hiddenWorkspaceIds).toHaveLength(count)
    const result = await commands.execute('workspaceSidebar.restoreHidden', { expectedRevision: 4 })
    expect(result).toEqual({ status: 'ready', actionStatus: 'succeeded', error: null })
    expect(owner.reader.getSnapshot().snapshot).toEqual(snapshot(4 + Number(count > 0)))
    expect(f.writes()).toHaveLength(1)
    expect(f.calls.every((call) => call.name.startsWith('workspaceOrganization.'))).toBe(true)
  })

test('2001 IDs and duplicate or oversized wire snapshots fail closed without false empty projection', async () => {
  for (const ids of [
    Array.from({ length: 2001 }, (_, index) => `w${index}`),
    ['A', 'A'],
    Array.from({ length: 1500 }, (_, index) => `${index}-${'x'.repeat(100)}`),
  ]) {
    const f = fixture(snapshot(1, ids))
    const { owner } = f.create()
    await owner.ready
    expect(owner.reader.getSnapshot()).toMatchObject({ status: 'error', error: 'INVALID_OUTPUT', snapshot: null })
    expect(f.writes()).toHaveLength(0)
  }
})

test('hiding the 2001st ID fails locally and never dispatches a write', async () => {
  const f = fixture(
    snapshot(
      4,
      Array.from({ length: 2000 }, (_, index) => `w${index}`),
    ),
  )
  const { owner, commands } = f.create()
  await owner.ready
  expect(await commands.execute('workspaceSidebar.setHidden', hide('extra', 4))).toEqual({
    status: 'ready',
    actionStatus: 'failed',
    error: 'INPUT_TOO_LARGE',
  })
  expect(f.writes()).toHaveLength(0)
  expect(owner.reader.getSnapshot().snapshot?.hiddenWorkspaceIds).toHaveLength(2000)
})

test('hide uses a cloned exact request/key and changes projection only after a successful GET', async () => {
  const f = fixture()
  const ack = deferred<unknown>()
  f.enqueue('workspaceOrganization.apply', () => ack.promise)
  const { owner, commands } = f.create()
  await owner.ready
  const input = hide()
  const task = commands.execute('workspaceSidebar.setHidden', input)
  await until(() => f.writes().length === 1)
  input.workspaceId = 'B'
  expect(owner.reader.getSnapshot().action.request?.change).toMatchObject({ workspaceId: 'A' })
  expect(owner.reader.getSnapshot().snapshot).toEqual(snapshot())
  const write = f.writes()[0]!
  ack.resolve(f.apply(workspaceOrganizationApplyInputSchema.parse(write.input), write.key!))
  await task
  expect(owner.reader.getSnapshot().snapshot).toEqual(snapshot(1, ['A']))
  expect(owner.reader.getSnapshot().action.receipt?.request.change).toMatchObject({ workspaceId: 'A' })
  expect(Object.isFrozen(owner.reader.getSnapshot().action.request?.change)).toBe(true)
})

test('two owners learn external confirmed changes via invalidation, with no observer writes', async () => {
  const f = fixture()
  const a = f.create(),
    b = f.create()
  await Promise.all([a.owner.ready, b.owner.ready])
  await a.commands.execute('workspaceSidebar.setHidden', hide())
  f.notify()
  await until(() => b.owner.reader.getSnapshot().snapshot?.revision === 1)
  expect(b.owner.reader.getSnapshot().snapshot?.hiddenWorkspaceIds).toEqual(['A'])
  expect(b.owner.reader.getSnapshot().action.status).toBe('idle')
  await b.commands.execute('workspaceSidebar.restoreHidden', { expectedRevision: 1 })
  f.notify()
  await until(() => a.owner.reader.getSnapshot().snapshot?.revision === 2)
  expect(a.owner.reader.getSnapshot().snapshot?.hiddenWorkspaceIds).toEqual([])
  expect(f.writes()).toHaveLength(2)
})

test('notification bursts retain only one follow-up and never overlap reads', async () => {
  const f = fixture()
  const first = deferred<unknown>(),
    second = deferred<unknown>()
  f.enqueue('workspaceOrganization.get', () => first.promise)
  f.enqueue('workspaceOrganization.get', () => second.promise)
  const { owner } = f.create()
  await until(() => f.reads().length === 1)
  for (let count = 0; count < 500; count++) f.notify()
  expect(f.reads()).toHaveLength(1)
  first.resolve(snapshot())
  await until(() => f.reads().length === 2)
  for (let count = 0; count < 500; count++) f.notify()
  second.resolve(snapshot(1, ['A']))
  await owner.ready
  expect(f.reads()).toHaveLength(2)
  expect(f.peakReads()).toBe(1)
  expect(owner.reader.getSnapshot()).toMatchObject({
    status: 'error',
    error: 'QUERY_SUPERSEDED',
    snapshot: { revision: 1 },
  })
})

test('independent refresh consumers join a single read', async () => {
  const f = fixture()
  const { owner, commands } = f.create()
  await owner.ready
  const gate = deferred<unknown>()
  f.enqueue('workspaceOrganization.get', () => gate.promise)
  const reads = Array.from({ length: 10 }, () => commands.execute('workspaceSidebar.refresh', {}))
  await until(() => f.reads().length === 2)
  gate.resolve(snapshot(2, ['B']))
  await Promise.all(reads)
  expect(f.reads()).toHaveLength(2)
  expect(f.peakReads()).toBe(1)
})

test('late GET below ACK revision never replaces snapshot; one post-ACK read obtains current state', async () => {
  const f = fixture()
  const ack = deferred<unknown>(),
    late = deferred<unknown>()
  f.enqueue('workspaceOrganization.apply', () => ack.promise)
  const { owner, commands } = f.create()
  await owner.ready
  const write = commands.execute('workspaceSidebar.setHidden', hide())
  await until(() => f.writes().length === 1)
  f.enqueue('workspaceOrganization.get', () => late.promise)
  f.notify()
  await until(() => f.reads().length === 2)
  const original = f.writes()[0]!
  ack.resolve(f.apply(workspaceOrganizationApplyInputSchema.parse(original.input), original.key!))
  await until(() => owner.reader.getSnapshot().action.status === 'succeeded')
  late.resolve(snapshot())
  await write
  expect(owner.reader.getSnapshot()).toMatchObject({
    status: 'ready',
    snapshot: { revision: 1, hiddenWorkspaceIds: ['A'] },
  })
  expect(f.reads()).toHaveLength(3)
  expect(f.peakReads()).toBe(1)
})

test('lower-revision reads fail as superseded and keep the previous confirmed snapshot', async () => {
  const f = fixture(snapshot(3, ['A']))
  const { owner, commands } = f.create()
  await owner.ready
  f.enqueue('workspaceOrganization.get', () => snapshot(2, []))
  await commands.execute('workspaceSidebar.refresh', {})
  expect(owner.reader.getSnapshot()).toMatchObject({
    status: 'error',
    error: 'QUERY_SUPERSEDED',
    snapshot: { revision: 3, hiddenWorkspaceIds: ['A'] },
  })
})

test('confirmed ACK plus failed GET stays succeeded with a separate read error', async () => {
  const f = fixture()
  const { owner, commands } = f.create()
  await owner.ready
  f.enqueue('workspaceOrganization.get', () => {
    throw new CommandError('TIMEOUT', 'Private transport detail')
  })
  await commands.execute('workspaceSidebar.setHidden', hide())
  expect(owner.reader.getSnapshot()).toMatchObject({
    status: 'error',
    error: 'TIMEOUT',
    action: { status: 'succeeded', error: null, receipt: { revision: 1 } },
  })
  expect(owner.reader.getSnapshot().snapshot).toEqual(snapshot())
  await commands.execute('workspaceSidebar.refresh', {})
  expect(owner.reader.getSnapshot().snapshot).toEqual(snapshot(1, ['A']))
  expect(f.writes()).toHaveLength(1)
})

test('CAS failure refreshes without rebasing/replaying the captured write', async () => {
  const f = fixture()
  const { owner, commands } = f.create()
  await owner.ready
  f.save(snapshot(1, ['B']))
  await commands.execute('workspaceSidebar.setHidden', hide())
  expect(owner.reader.getSnapshot()).toMatchObject({
    status: 'ready',
    snapshot: { revision: 1, hiddenWorkspaceIds: ['B'] },
    action: { status: 'failed', error: 'COMMAND_CONFLICT', request: { expectedRevision: 0 } },
  })
  expect(f.writes()).toHaveLength(1)
  await commands.execute('workspaceSidebar.setHidden', { ...hide('A', 1), expectedHidden: true })
  expect(f.writes()).toHaveLength(1)
})

test('unknown acknowledgement locks all replacement intents; null receipt and matching snapshot never unlock it', async () => {
  const f = fixture()
  const { owner, commands } = f.create()
  await owner.ready
  f.enqueue('workspaceOrganization.apply', () => {
    throw new Error('secret')
  })
  await commands.execute('workspaceSidebar.setHidden', hide())
  const original = owner.reader.getSnapshot().action
  expect(original).toMatchObject({ status: 'unknown', error: 'EXECUTION_FAILED', request: { expectedRevision: 0 } })
  await expect(commands.execute('workspaceSidebar.setHidden', hide('B'))).rejects.toMatchObject({ code: 'BUSY' })
  await expect(commands.execute('workspaceSidebar.restoreHidden', { expectedRevision: 0 })).rejects.toMatchObject({
    code: 'BUSY',
  })
  await commands.execute('workspaceSidebar.reconcile', {})
  expect(owner.reader.getSnapshot().action).toMatchObject({
    status: 'unknown',
    key: original.key,
    error: 'RESULT_UNKNOWN',
  })
  f.save(snapshot(1, ['A']))
  f.notify()
  await until(() => owner.reader.getSnapshot().snapshot?.revision === 1)
  expect(owner.reader.getSnapshot().action.status).toBe('unknown')
  await owner.reveal('A')
  expect(f.writes()).toHaveLength(1)
  const lookup = f.calls.find((call) => call.name === 'workspaceOrganization.receipt')!
  expect(lookup.input).toEqual({ idempotencyKey: original.key, request: original.request })
})

test('exact original receipt resolves lost ACK with no second write', async () => {
  const f = fixture()
  const { owner, commands } = f.create()
  await owner.ready
  f.enqueue('workspaceOrganization.apply', (input, execution) => {
    f.apply(workspaceOrganizationApplyInputSchema.parse(input), execution!.idempotencyKey!)
    throw new CommandError('RESULT_UNKNOWN', 'lost')
  })
  await commands.execute('workspaceSidebar.setHidden', hide())
  const original = owner.reader.getSnapshot().action
  await commands.execute('workspaceSidebar.reconcile', {})
  expect(owner.reader.getSnapshot()).toMatchObject({
    status: 'ready',
    snapshot: { revision: 1 },
    action: { status: 'succeeded', key: original.key, receipt: { request: original.request } },
  })
  expect(f.writes()).toHaveLength(1)
})

test('malformed or wrong-target receipts remain unknown and safe errors never expose raw exception content', async () => {
  const f = fixture()
  const { owner, commands } = f.create()
  await owner.ready
  f.enqueue('workspaceOrganization.apply', () => ({
    commitId: 'wrong',
    revision: 1,
    changed: true,
    request: {
      expectedRevision: 0,
      change: { kind: 'setHidden', workspaceId: 'B', hidden: true, expectedHidden: false },
    },
  }))
  await commands.execute('workspaceSidebar.setHidden', hide())
  expect(owner.reader.getSnapshot().action).toMatchObject({ status: 'unknown', error: 'INVALID_OUTPUT' })
  f.enqueue('workspaceOrganization.receipt', () => {
    throw { code: 'SECRET_TOKEN', message: 'do not show' }
  })
  await commands.execute('workspaceSidebar.reconcile', {})
  expect(owner.reader.getSnapshot().action.error).toBe('EXECUTION_FAILED')
  expect(JSON.stringify(owner.reader.getSnapshot())).not.toContain('SECRET')
  expect(f.writes()).toHaveLength(1)
})

test('disconnect keeps confirmed projection, prohibits new writes, and reconnect is read-only', async () => {
  const f = fixture(snapshot(1, ['A']))
  const { owner, commands } = f.create()
  await owner.ready
  f.connect(false)
  expect(owner.reader.getSnapshot()).toMatchObject({ status: 'offline', snapshot: { hiddenWorkspaceIds: ['A'] } })
  await expect(commands.execute('workspaceSidebar.setHidden', hide('B', 1))).rejects.toMatchObject({
    code: 'DISCONNECTED',
  })
  f.save(snapshot(2, []))
  f.connect(true)
  await until(() => owner.reader.getSnapshot().snapshot?.revision === 2)
  expect(f.writes()).toHaveLength(0)
})

test('ignored read cancellation holds physical slot; reconnect late A response cannot publish into B epoch', async () => {
  const f = fixture()
  const late = deferred<unknown>()
  f.enqueue('workspaceOrganization.get', () => late.promise)
  const { owner } = f.create()
  await until(() => f.reads().length === 1)
  f.connect(false)
  await owner.ready
  f.save(snapshot(2, ['B']))
  f.connect(true)
  expect(f.reads()).toHaveLength(1)
  late.resolve(snapshot(1, ['A']))
  await until(() => owner.reader.getSnapshot().snapshot?.revision === 2)
  expect(owner.reader.getSnapshot().snapshot?.hiddenWorkspaceIds).toEqual(['B'])
  expect(f.peakReads()).toBe(1)
})

test('disconnect during dispatched write preserves unknown and late ACK requires original receipt reconciliation', async () => {
  const f = fixture()
  const late = deferred<unknown>()
  f.enqueue('workspaceOrganization.apply', () => late.promise)
  const { owner, commands } = f.create()
  await owner.ready
  const writing = commands.execute('workspaceSidebar.setHidden', hide())
  await until(() => f.writes().length === 1)
  const original = f.writes()[0]!
  expect(owner.reader.getSnapshot().requestInFlight).toBe(true)
  f.connect(false)
  await writing
  expect(owner.reader.getSnapshot().requestInFlight).toBe(true)
  f.connect(true)
  await until(() => owner.reader.getSnapshot().status === 'ready')
  await expect(commands.execute('workspaceSidebar.reconcile', {})).rejects.toMatchObject({ code: 'BUSY' })
  expect(f.calls.filter((call) => call.name === 'workspaceOrganization.receipt')).toHaveLength(0)
  expect(owner.reader.getSnapshot().requestInFlight).toBe(true)
  late.resolve(f.apply(workspaceOrganizationApplyInputSchema.parse(original.input), original.key!))
  await Bun.sleep(0)
  expect(owner.reader.getSnapshot().action.status).toBe('unknown')
  expect(owner.reader.getSnapshot().requestInFlight).toBe(false)
  await commands.execute('workspaceSidebar.reconcile', {})
  expect(owner.reader.getSnapshot().action.status).toBe('succeeded')
  expect(owner.reader.getSnapshot().requestInFlight).toBe(false)
  expect(f.writes()).toHaveLength(1)
})

test('pre-aborted command performs no write; in-flight cancellation is not a rollback', async () => {
  const f = fixture()
  const { owner, commands } = f.create()
  await owner.ready
  const aborted = new AbortController()
  aborted.abort()
  await expect(
    commands.execute('workspaceSidebar.setHidden', hide(), { signal: aborted.signal }),
  ).rejects.toMatchObject({ code: 'CANCELLED' })
  expect(f.writes()).toHaveLength(0)
  const pending = deferred<unknown>(),
    cancel = new AbortController()
  f.enqueue('workspaceOrganization.apply', () => pending.promise)
  const writing = commands.execute('workspaceSidebar.setHidden', hide(), { signal: cancel.signal })
  const outcome = writing.catch((error: unknown) => error)
  await until(() => f.writes().length === 1)
  cancel.abort()
  expect(await outcome).toMatchObject({ code: 'RESULT_UNKNOWN' })
  expect(owner.reader.getSnapshot().action.status).toBe('unknown')
  pending.resolve(null)
  await Bun.sleep(0)
  expect(f.writes()).toHaveLength(1)
})

test('dispose unsubscribes and late read/error/write do not publish; fresh owner cannot inherit old action', async () => {
  const f = fixture()
  const late = deferred<unknown>()
  f.enqueue('workspaceOrganization.get', () => late.promise)
  const first = f.create()
  await until(() => f.reads().length === 1)
  const before = first.owner.reader.getSnapshot()
  first.owner.dispose()
  await first.owner.ready
  expect(f.subscriptions()).toBe(0)
  const next = f.create()
  await next.owner.ready
  late.resolve(snapshot(50, ['wrong-host-A']))
  await Bun.sleep(0)
  expect(first.owner.reader.getSnapshot()).toBe(before)
  expect(next.owner.reader.getSnapshot().snapshot).toEqual(snapshot())
  const ack = deferred<unknown>()
  f.enqueue('workspaceOrganization.apply', () => ack.promise)
  const task = next.commands.execute('workspaceSidebar.setHidden', hide())
  const outcome = task.catch((error: unknown) => error)
  await until(() => f.writes().length === 1)
  const writingState = next.owner.reader.getSnapshot()
  next.owner.dispose()
  expect(await outcome).toMatchObject({ code: 'RESULT_UNKNOWN' })
  ack.reject(new Error('late'))
  await Bun.sleep(0)
  expect(next.owner.reader.getSnapshot()).toBe(writingState)
  expect(f.subscriptions()).toBe(0)
})

test('explicit reveal is a no-op for visible IDs, preserves unrelated hidden IDs, and never throws on secondary failure', async () => {
  const f = fixture(snapshot(2, ['A', 'B']))
  const { owner, commands } = f.create()
  await owner.ready
  await owner.reveal('visible')
  expect(f.writes()).toHaveLength(0)
  await commands.execute('workspaceSidebar.reveal', { workspaceId: 'A' })
  expect(owner.reader.getSnapshot().snapshot).toEqual(snapshot(3, ['B']))
  f.enqueue('workspaceOrganization.apply', () => {
    throw new CommandError('COMMAND_CONFLICT', 'raced')
  })
  await expect(owner.reveal('B')).resolves.toBeUndefined()
  expect(owner.reader.getSnapshot().action).toMatchObject({
    status: 'failed',
    error: 'COMMAND_CONFLICT',
    request: { change: { workspaceId: 'B' } },
  })
})

test('reveal after an awaited GET respects an A-B-A generation guard and does not invent a failed action', async () => {
  const f = fixture(snapshot(1, ['A']))
  let navigationGeneration = 1
  const { owner, commands } = f.create({
    beginRevealGuard: () => {
      const generation = navigationGeneration
      return () => navigationGeneration === generation
    },
  })
  await owner.ready
  const late = deferred<unknown>()
  f.enqueue('workspaceOrganization.get', () => late.promise)
  f.notify()
  await until(() => f.reads().length === 2)
  const opening = commands.execute('workspaceSidebar.reveal', { workspaceId: 'A' })
  await Bun.sleep(0)
  navigationGeneration = 3
  late.resolve(snapshot(1, ['A']))
  await opening
  expect(f.writes()).toHaveLength(0)
  expect(owner.reader.getSnapshot().action.status).toBe('idle')
  await owner.reveal('A', () => false)
  expect(f.writes()).toHaveLength(0)
})

test('a synchronous subscriber navigation change before reveal dispatch cancels only that secondary intent', async () => {
  const f = fixture(snapshot(1, ['A']))
  const { owner } = f.create()
  await owner.ready
  let valid = true
  const stop = owner.reader.subscribe(() => {
    if (owner.reader.getSnapshot().action.status === 'submitting') valid = false
  })
  await owner.reveal('A', () => valid)
  stop()
  expect(f.writes()).toHaveLength(0)
  expect(owner.reader.getSnapshot().action.status).toBe('idle')
})

test('synchronous offline connection subscription prevents initial I/O until confirmed reconnect', async () => {
  const f = fixture()
  let listener: ((connected: boolean) => void) | undefined
  const { owner } = f.create({
    events: {
      subscribe: () => () => undefined,
      onConnection: (callback) => {
        listener = callback
        callback(false)
        return () => undefined
      },
    },
  })
  await owner.ready
  expect(f.calls).toHaveLength(0)
  expect(owner.reader.getSnapshot().status).toBe('offline')
  listener?.(true)
  await until(() => owner.reader.getSnapshot().status === 'ready')
  expect(f.reads()).toHaveLength(1)
})

test('same-revision different data is not a second canonical truth', async () => {
  const f = fixture(snapshot(3, ['A']))
  const { owner, commands } = f.create()
  await owner.ready
  f.enqueue('workspaceOrganization.get', () => snapshot(3, ['B']))
  await commands.execute('workspaceSidebar.refresh', {})
  expect(owner.reader.getSnapshot()).toMatchObject({
    status: 'error',
    error: 'INVALID_OUTPUT',
    snapshot: { revision: 3, hiddenWorkspaceIds: ['A'] },
  })
  expect(f.writes()).toHaveLength(0)
})

test('disposal before scheduled initial dispatch sends no Host query', async () => {
  const f = fixture()
  const { owner } = f.create()
  const original = owner.reader.getSnapshot()
  owner.dispose()
  await owner.ready
  await Bun.sleep(0)
  expect(f.calls).toHaveLength(0)
  expect(owner.reader.getSnapshot()).toBe(original)
  expect(f.subscriptions()).toBe(0)
})

test('duplicate in-flight mutations cannot replace target, and A-B-A writes get distinct keys/revisions', async () => {
  const f = fixture()
  const { owner, commands } = f.create()
  await owner.ready
  const late = deferred<unknown>()
  f.enqueue('workspaceOrganization.apply', () => late.promise)
  const first = commands.execute('workspaceSidebar.setHidden', hide())
  await until(() => f.writes().length === 1)
  await expect(commands.execute('workspaceSidebar.setHidden', hide('B'))).rejects.toMatchObject({ code: 'BUSY' })
  const original = f.writes()[0]!
  expect(owner.reader.getSnapshot().action.request?.change).toMatchObject({ workspaceId: 'A' })
  late.resolve(f.apply(workspaceOrganizationApplyInputSchema.parse(original.input), original.key!))
  await first
  await commands.execute('workspaceSidebar.restoreHidden', { expectedRevision: 1 })
  await commands.execute('workspaceSidebar.setHidden', hide('A', 2))
  expect(f.writes()).toHaveLength(3)
  expect(new Set(f.writes().map((write) => write.key)).size).toBe(3)
  expect(f.writes().map((write) => workspaceOrganizationApplyInputSchema.parse(write.input).expectedRevision)).toEqual([
    0, 1, 2,
  ])
  expect(owner.reader.getSnapshot().snapshot).toEqual(snapshot(3, ['A']))
})

test('wrong-target receipt lookup cannot unlock the original unknown request', async () => {
  const f = fixture()
  const { owner, commands } = f.create()
  await owner.ready
  f.enqueue('workspaceOrganization.apply', () => {
    throw new CommandError('RESULT_UNKNOWN', 'Lost')
  })
  await commands.execute('workspaceSidebar.setHidden', hide())
  const original = owner.reader.getSnapshot().action
  f.enqueue('workspaceOrganization.receipt', () => ({
    commitId: 'wrong',
    revision: 1,
    changed: true,
    request: {
      expectedRevision: 0,
      change: { kind: 'setHidden', workspaceId: 'B', expectedHidden: false, hidden: true },
    },
  }))
  await commands.execute('workspaceSidebar.reconcile', {})
  expect(owner.reader.getSnapshot().action).toMatchObject({
    status: 'unknown',
    error: 'INVALID_OUTPUT',
    key: original.key,
    request: original.request,
  })
  expect(f.writes()).toHaveLength(1)
})

test('navigation changes after reveal dispatch cannot pretend an already committed write was cancelled', async () => {
  const f = fixture(snapshot(1, ['A']))
  const { owner } = f.create()
  await owner.ready
  const late = deferred<unknown>()
  f.enqueue('workspaceOrganization.apply', () => late.promise)
  let current = true
  const opening = owner.reveal('A', () => current)
  await until(() => f.writes().length === 1)
  current = false
  const original = f.writes()[0]!
  late.resolve(f.apply(workspaceOrganizationApplyInputSchema.parse(original.input), original.key!))
  await opening
  expect(owner.reader.getSnapshot()).toMatchObject({
    snapshot: { revision: 2, hiddenWorkspaceIds: [] },
    action: { status: 'succeeded' },
  })
  expect(f.writes()).toHaveLength(1)
})

test('Host rejection is a failure, not unknown, and a corrected user intent uses a new key', async () => {
  const f = fixture()
  const { owner, commands } = f.create()
  await owner.ready
  f.enqueue('workspaceOrganization.apply', () => {
    throw new CommandError('NOT_FOUND', 'Workspace removed')
  })
  await commands.execute('workspaceSidebar.setHidden', hide())
  expect(owner.reader.getSnapshot().action).toMatchObject({ status: 'failed', error: 'NOT_FOUND' })
  await commands.execute('workspaceSidebar.setHidden', hide('B'))
  expect(owner.reader.getSnapshot().snapshot).toEqual(snapshot(1, ['B']))
  expect(f.writes()[0]?.key).not.toBe(f.writes()[1]?.key)
})
