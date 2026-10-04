import { expect, spyOn, test } from 'bun:test'
import { CommandError, CommandRegistry, type ExecuteOptions } from '@hbar/commands'
import { createAppRuntime, type RunCommandPort } from '@hbar/app-runtime'
import { createDrafts } from '../packages/app-runtime/src/drafts'
import { createRunCancellation } from '../packages/app-runtime/src/run-cancellation'
import { createState } from '../packages/app-runtime/src/state'
import type { RunActionsState } from '../packages/app-runtime/src/types'

const outcome = (promise: Promise<unknown>) => promise.catch((reason: unknown) => reason)
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
function snapshot(status = 'running', operationId = 'op', sessionId = 'a') {
  return { operationId, sessionId, status, startedAt: 1, endedAt: null, error: null }
}
function fixture() {
  const calls: { name: string; input: unknown; signal?: AbortSignal }[] = []
  let write: () => Promise<unknown> = () => Promise.reject(new CommandError('TIMEOUT', 'private error'))
  let read: () => Promise<unknown> = () => Promise.resolve(snapshot())
  const run: RunCommandPort = {
    async execute(name, input, options) {
      calls.push({ name, input, ...(options?.signal ? { signal: options.signal } : {}) })
      return name === 'operation.cancel' ? write() : read()
    },
    getReceipt: () => Promise.resolve(null),
  }
  const local = new CommandRegistry()
  let disposed = false
  const owner = createDrafts(
    local,
    run,
    undefined,
    () => {},
    () => disposed,
  )
  return {
    local,
    owner,
    calls,
    setWrite(value: () => Promise<unknown>) {
      write = value
    },
    setRead(value: () => Promise<unknown>) {
      read = value
    },
    cancel: (operationId = 'op', options?: ExecuteOptions) =>
      owner.executeRun('operation.cancel', { operationId }, options),
    reconcile: (operationId = 'op', sessionId = 'a', options?: ExecuteOptions) =>
      local.execute('runAction.reconcileCancellation', { operationId, sessionId }, options),
    action: (operationId = 'op') => owner.actions.getSnapshot()[operationId],
    dispose() {
      disposed = true
      owner.dispose()
      local.dispose()
    },
  }
}

for (const code of [
  'TIMEOUT',
  'TIMED_OUT',
  'DISCONNECTED',
  'CONNECTION_CLOSED',
  'CANCELLED',
  'INVALID_OUTPUT',
  'EXECUTION_FAILED',
  'RESULT_UNKNOWN',
])
  test(`public cancellation port ${code} keeps the original unknown action without replay`, async () => {
    const f = fixture()
    try {
      f.setWrite(() => Promise.reject(new CommandError(code, 'secret transport detail')))
      expect(await outcome(f.cancel())).toMatchObject({ code: 'RESULT_UNKNOWN' })
      expect(f.action()).toMatchObject({
        commandId: 'operation.cancel',
        operationId: 'op',
        phase: 'request',
        status: 'unknown',
        error: code,
        requestInFlight: false,
      })
      expect(await outcome(f.cancel())).toMatchObject({ code: 'BUSY' })
      expect(f.calls).toHaveLength(1)
      expect(JSON.stringify(f.action())).not.toContain('secret')
    } finally {
      f.dispose()
    }
  })

test('invalid input and pre-abort dispatch nothing; explicit rejection is not an unknown acceptance', async () => {
  const f = fixture()
  try {
    expect(await outcome(f.owner.executeRun('operation.cancel', { operationId: '' }))).toMatchObject({
      code: 'INVALID_INPUT',
    })
    expect(await outcome(f.cancel('op', { signal: AbortSignal.abort() }))).toMatchObject({ code: 'CANCELLED' })
    expect(f.calls).toHaveLength(0)
    expect(f.owner.actions.getSnapshot()).toEqual({})
    f.setWrite(() => Promise.reject(new CommandError('NOT_FOUND', 'private details')))
    expect(await outcome(f.cancel())).toMatchObject({ code: 'NOT_FOUND' })
    expect(f.action()).toMatchObject({ status: 'failed', error: 'NOT_FOUND', requestInFlight: false })
    f.setWrite(() => Promise.resolve({ operationId: 'op', status: 'cancelRequested' }))
    expect(await f.cancel()).toEqual({ operationId: 'op', status: 'cancelRequested' })
    expect(f.action()).toMatchObject({ status: 'succeeded', observedStatus: 'cancelRequested' })
    expect(await outcome(f.cancel())).toMatchObject({ code: 'BUSY' })
    expect(f.calls).toHaveLength(2)
  } finally {
    f.dispose()
  }
})

test('unknown uppercase error codes cannot leak public-port secrets into action feedback', async () => {
  const f = fixture()
  try {
    f.setWrite(() => Promise.reject({ code: 'PRIVATE_TOKEN_123456', message: 'private message' }))
    expect(await outcome(f.cancel())).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(f.action()).toMatchObject({ status: 'unknown', error: 'EXECUTION_FAILED' })
    f.setRead(() => Promise.reject({ code: 'PRIVATE_TOKEN_ABC', message: 'private message' }))
    expect(await outcome(f.reconcile())).toMatchObject({ code: 'EXECUTION_FAILED' })
    expect(JSON.stringify(f.owner.actions.getSnapshot())).not.toContain('PRIVATE')
    expect(JSON.stringify(f.owner.actions.getSnapshot())).not.toContain('private message')
  } finally {
    f.dispose()
  }
})

for (const value of [
  null,
  {},
  { operationId: 'other', status: 'cancelRequested' },
  { operationId: 'op', status: 'running' },
])
  test(`malformed or wrong-target cancel ACK remains unknown: ${JSON.stringify(value)}`, async () => {
    const f = fixture()
    try {
      f.setWrite(() => Promise.resolve(value))
      expect(await outcome(f.cancel())).toMatchObject({ code: 'RESULT_UNKNOWN' })
      expect(f.action()).toMatchObject({ status: 'unknown', error: 'INVALID_OUTPUT' })
      expect(f.calls).toHaveLength(1)
    } finally {
      f.dispose()
    }
  })

for (const status of [
  'queued',
  'running',
  'waiting_approval',
  'cancelRequested',
  'cancelled',
  'completed',
  'failed',
  'interrupted',
])
  test(`readback ${status} reports an operation fact, never repeats cancellation or changes the draft`, async () => {
    const f = fixture()
    try {
      await f.local.execute('draft.setText', { sessionId: 'a', text: 'original A' })
      await f.local.execute('draft.setText', { sessionId: 'b', text: 'original B' })
      const drafts = f.owner.reader.getSnapshot()
      await outcome(f.cancel())
      f.setRead(() => Promise.resolve(snapshot(status)))
      const expected = ['queued', 'running', 'waiting_approval'].includes(status) ? 'unknown' : 'succeeded'
      expect(await f.reconcile()).toEqual({
        sessionId: 'a',
        operationId: 'op',
        status: expected,
        observedStatus: status,
        error: null,
      })
      expect(f.action()).toMatchObject({
        sessionId: 'a',
        status: expected,
        phase: 'state',
        observedStatus: status,
        requestInFlight: false,
      })
      expect(f.owner.reader.getSnapshot()).toBe(drafts)
      expect(f.calls.map((call) => call.name)).toEqual(['operation.cancel', 'operation.get'])
      expect(await outcome(f.reconcile('op', 'b'))).toMatchObject({ code: 'STALE_TARGET' })
      expect(f.calls).toHaveLength(2)
    } finally {
      f.dispose()
    }
  })

test('read failure, null and target mismatch remain safe unknown; one explicit later read can recover', async () => {
  const f = fixture()
  try {
    await outcome(f.cancel())
    for (const value of [null, snapshot('cancelled', 'other'), snapshot('cancelled', 'op', 'b')]) {
      f.setRead(() => Promise.resolve(value))
      expect(await outcome(f.reconcile())).toMatchObject({ code: 'INVALID_OUTPUT' })
      expect(f.action()).toMatchObject({
        status: 'unknown',
        phase: 'state',
        error: 'INVALID_OUTPUT',
        requestInFlight: false,
      })
      expect(f.action()?.sessionId).toBeUndefined()
    }
    f.setRead(() => Promise.reject(new Error('PRIVATE_FAILURE')))
    expect(await outcome(f.reconcile())).toMatchObject({ code: 'EXECUTION_FAILED' })
    expect(JSON.stringify(f.action())).not.toContain('PRIVATE')
    f.setRead(() => Promise.resolve(snapshot('cancelled')))
    await f.reconcile()
    expect(f.action()).toMatchObject({ status: 'succeeded', observedStatus: 'cancelled', error: null })
    expect(f.calls.filter((call) => call.name === 'operation.cancel')).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

test('same-task/reentrant cancel and read use a single physical request and original operation', async () => {
  const f = fixture()
  const write = Promise.withResolvers<unknown>()
  const read = Promise.withResolvers<unknown>()
  let reentrant: Promise<unknown> | null = null
  const unsubscribe = f.owner.actions.subscribe(() => {
    if (!reentrant && f.action()?.status === 'submitting') {
      // Install a placeholder before invoking to avoid recursive subscription entry.
      reentrant = Promise.resolve(null)
      reentrant = outcome(f.cancel())
    }
  })
  try {
    f.setWrite(() => write.promise)
    const original = { operationId: 'op' }
    const first = outcome(f.owner.executeRun('operation.cancel', original))
    expect(await reentrant).toMatchObject({ code: 'BUSY' })
    original.operationId = 'b'
    expect(await outcome(f.cancel())).toMatchObject({ code: 'BUSY' })
    expect(f.action()).toMatchObject({ status: 'submitting', requestInFlight: true })
    expect(f.calls[0]?.input).toEqual({ operationId: 'op' })
    write.reject(new CommandError('DISCONNECTED', 'lost'))
    await first
    f.setRead(() => read.promise)
    const checking = f.reconcile()
    expect(f.action()).toMatchObject({ phase: 'state', status: 'submitting', requestInFlight: true })
    expect(await outcome(f.reconcile())).toMatchObject({ code: 'BUSY' })
    expect(await outcome(f.cancel())).toMatchObject({ code: 'BUSY' })
    read.resolve(snapshot('running'))
    await checking
    expect(f.action()).toMatchObject({ status: 'unknown', requestInFlight: false })
    expect(f.calls.map((call) => call.name)).toEqual(['operation.cancel', 'operation.get'])
    expect(await outcome(f.owner.executeRun('run.retry', { sessionId: 'a', operationId: 'op' }))).toMatchObject({
      code: 'BUSY',
    })
  } finally {
    unsubscribe()
    write.resolve(null)
    read.resolve(null)
    f.dispose()
  }
})

test('aborting an already dispatched write leaves unknown and its physical slot until the ignored-abort ACK settles', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<unknown>()
  try {
    f.setWrite(() => gate.promise)
    const controller = new AbortController()
    const write = outcome(f.cancel('op', { signal: controller.signal }))
    controller.abort()
    expect(await write).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(f.action()).toMatchObject({ status: 'unknown', phase: 'request', error: 'CANCELLED', requestInFlight: true })
    expect(await outcome(f.reconcile())).toMatchObject({ code: 'BUSY' })
    gate.resolve({ operationId: 'op', status: 'cancelRequested' })
    await tick()
    expect(f.action()).toMatchObject({ status: 'unknown', requestInFlight: false })
    expect(f.action()?.observedStatus).toBeUndefined()
    f.setRead(() => Promise.resolve(snapshot('cancelled')))
    await f.reconcile()
    expect(f.calls.map((call) => call.name)).toEqual(['operation.cancel', 'operation.get'])
  } finally {
    gate.resolve(null)
    f.dispose()
  }
})

test('accepted cancellation is not undone by a stale active snapshot or subsequent read failure', async () => {
  const f = fixture()
  try {
    f.setWrite(() => Promise.resolve({ operationId: 'op', status: 'cancelRequested' }))
    await f.cancel()
    await f.reconcile()
    expect(f.action()).toMatchObject({ status: 'succeeded', observedStatus: 'cancelRequested' })
    f.setRead(() => Promise.reject(new CommandError('DISCONNECTED', 'no reply')))
    await outcome(f.reconcile())
    expect(f.action()).toMatchObject({ status: 'succeeded', observedStatus: 'cancelRequested', error: 'DISCONNECTED' })
  } finally {
    f.dispose()
  }
})

test('read abort retains physical occupancy, ignores late success and permits only a fresh later read', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<unknown>()
  try {
    await outcome(f.cancel())
    f.setRead(() => gate.promise)
    const controller = new AbortController()
    const read = outcome(f.reconcile('op', 'a', { signal: controller.signal }))
    controller.abort()
    await read
    expect(f.action()).toMatchObject({ status: 'unknown', error: 'CANCELLED', requestInFlight: true })
    expect(f.calls.at(-1)?.signal?.aborted).toBe(true)
    expect(await outcome(f.reconcile())).toMatchObject({ code: 'BUSY' })
    gate.resolve(snapshot('cancelled'))
    await tick()
    expect(f.action()).toMatchObject({ status: 'unknown', error: 'CANCELLED', requestInFlight: false })
    expect(f.action()?.observedStatus).toBeUndefined()
    f.setRead(() => Promise.resolve(snapshot('cancelled')))
    await f.reconcile()
    expect(f.action()?.observedStatus).toBe('cancelled')
  } finally {
    gate.resolve(null)
    f.dispose()
  }
})

test('30s read deadline is logical only and does not release an ignored-abort port slot', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<unknown>()
  await outcome(f.cancel())
  const original = globalThis.setTimeout
  const durations: unknown[] = []
  const accelerated = new Proxy(original, {
    apply(target, receiver: unknown, args: unknown[]) {
      durations.push(args[1])
      return Reflect.apply(target, receiver, [args[0], args[1] === 30_000 ? 5 : args[1], ...args.slice(2)]) as unknown
    },
  })
  const clock = spyOn(globalThis, 'setTimeout').mockImplementation(accelerated)
  try {
    f.setRead(() => gate.promise)
    expect(await outcome(f.reconcile())).toMatchObject({ code: 'TIMEOUT' })
    expect(durations).toContain(30_000)
    expect(f.action()).toMatchObject({ status: 'unknown', error: 'TIMEOUT', requestInFlight: true })
    expect(await outcome(f.reconcile())).toMatchObject({ code: 'BUSY' })
    gate.resolve(snapshot('cancelled'))
    await tick()
    expect(f.action()).toMatchObject({ status: 'unknown', requestInFlight: false })
  } finally {
    clock.mockRestore()
    gate.resolve(null)
    f.dispose()
  }
})

test('100 unresolved actions retain capacity; settled eviction never evicts a physical state read', async () => {
  const f = fixture()
  try {
    for (let index = 0; index < 100; index++) await outcome(f.cancel(`op-${index}`))
    expect(Object.keys(f.owner.actions.getSnapshot())).toHaveLength(100)
    expect(await outcome(f.cancel('over'))).toMatchObject({ code: 'BUSY' })
    expect(f.calls).toHaveLength(100)
    f.setRead(() => Promise.resolve(snapshot('cancelled', 'op-0')))
    await f.reconcile('op-0')
    await outcome(f.cancel('over'))
    expect(Object.keys(f.owner.actions.getSnapshot())).toHaveLength(100)
    expect(f.action('op-0')).toBeUndefined()
    expect(f.action('over')?.status).toBe('unknown')
  } finally {
    f.dispose()
  }
})

test('disposal rejects waiting calls and discards late read/write state without new dispatch', async () => {
  for (const kind of ['request', 'state'] as const) {
    const f = fixture()
    const gate = Promise.withResolvers<unknown>()
    if (kind === 'state') await outcome(f.cancel())
    f.setWrite(() => gate.promise)
    f.setRead(() => gate.promise)
    const pending = outcome(kind === 'request' ? f.cancel() : f.reconcile())
    const before = f.owner.actions.getSnapshot()
    f.dispose()
    await pending
    gate.resolve(kind === 'request' ? { operationId: 'op', status: 'cancelRequested' } : snapshot('cancelled'))
    await tick()
    expect(f.owner.actions.getSnapshot()).toBe(before)
    const count = f.calls.length
    expect(await outcome(f.cancel())).toMatchObject({ code: 'DISPOSED' })
    expect(f.calls).toHaveLength(count)
  }
})

test('late old read cannot overwrite a newer same-ID action published by its owning state', async () => {
  const actions = createState<RunActionsState>(
    { op: { operationId: 'op', commandId: 'operation.cancel', status: 'unknown', error: 'TIMEOUT' } },
    () => {},
  )
  const local = new CommandRegistry()
  const gate = Promise.withResolvers<unknown>()
  const owner = createRunCancellation({
    local,
    actions: actions.reader,
    run: { execute: () => gate.promise, getReceipt: () => Promise.resolve(null) },
    replace: (id, action) => actions.replace({ ...actions.reader.getSnapshot(), [id]: action }),
    isDisposed: () => false,
  })
  try {
    const old = local.execute('runAction.reconcileCancellation', { sessionId: 'a', operationId: 'op' })
    const replacement: RunActionsState = {
      op: { operationId: 'op', commandId: 'run.retry', status: 'succeeded', error: null },
    }
    actions.replace(replacement)
    gate.resolve(snapshot('cancelled'))
    await old
    expect(actions.reader.getSnapshot()).toBe(replacement)
  } finally {
    gate.resolve(null)
    owner.dispose()
    local.dispose()
    actions.dispose()
  }
})

test('public AppRuntime exposes typed cancellation readback with zero cancel replay', async () => {
  const calls: string[] = []
  const runtime = createAppRuntime({
    instanceId: 'fixture',
    hostId: 'host',
    directory: { execute: () => Promise.resolve({ items: [], nextCursor: null }) },
    run: {
      async execute(name) {
        calls.push(name)
        if (name === 'operation.cancel') throw new CommandError('TIMEOUT', 'lost')
        return snapshot('cancelled')
      },
      getReceipt: () => Promise.resolve(null),
    },
  })
  try {
    await outcome(runtime.view.commands.execute('operation.cancel', { operationId: 'op' }))
    const result = await runtime.view.commands.execute('runAction.reconcileCancellation', {
      sessionId: 'a',
      operationId: 'op',
    })
    expect(result.observedStatus).toBe('cancelled')
    expect(runtime.view.state.runActions.getSnapshot().op?.phase).toBe('state')
    expect(calls).toEqual(['operation.cancel', 'operation.get'])
  } finally {
    runtime.dispose()
  }
})

test('terminal facts cannot regress to cancelRequested, active or a different terminal result', async () => {
  const f = fixture()
  try {
    await outcome(f.cancel())
    f.setRead(() => Promise.resolve(snapshot('completed')))
    await f.reconcile()
    for (const status of ['running', 'cancelRequested', 'cancelled', 'failed']) {
      f.setRead(() => Promise.resolve(snapshot(status)))
      expect(await outcome(f.reconcile())).toMatchObject({ code: 'INVALID_OUTPUT' })
      expect(f.action()).toMatchObject({ status: 'succeeded', observedStatus: 'completed', error: 'INVALID_OUTPUT' })
    }
    expect(f.calls.filter((call) => call.name === 'operation.cancel')).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

test('read capacity remains 32 even after every logical reader aborts; real settlement releases it', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<unknown>()
  const controllers = Array.from({ length: 32 }, () => new AbortController())
  try {
    for (let index = 0; index < 33; index++) await outcome(f.cancel(`op-${index}`))
    f.setRead(() => gate.promise)
    const reads = controllers.map((controller, index) =>
      outcome(f.reconcile(`op-${index}`, 'a', { signal: controller.signal })),
    )
    expect(f.calls.filter((call) => call.name === 'operation.get')).toHaveLength(32)
    controllers.forEach((controller) => controller.abort())
    await Promise.all(reads)
    expect(await outcome(f.reconcile('op-32'))).toMatchObject({ code: 'BUSY' })
    expect(f.calls.filter((call) => call.name === 'operation.get')).toHaveLength(32)
    gate.resolve(null)
    await tick()
    f.setRead(() => Promise.resolve(snapshot('cancelled', 'op-32')))
    await f.reconcile('op-32')
    expect(f.calls.filter((call) => call.name === 'operation.get')).toHaveLength(33)
  } finally {
    controllers.forEach((controller) => controller.abort())
    gate.resolve(null)
    f.dispose()
  }
})

test('an accepted action with a physically pending aborted read cannot be evicted at capacity', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<unknown>()
  try {
    for (let index = 0; index < 100; index++) await outcome(f.cancel(`op-${index}`))
    f.setRead(() => Promise.resolve(snapshot('cancelRequested', 'op-0')))
    await f.reconcile('op-0')
    f.setRead(() => gate.promise)
    const controller = new AbortController()
    const read = outcome(f.reconcile('op-0', 'a', { signal: controller.signal }))
    controller.abort()
    await read
    expect(f.action('op-0')).toMatchObject({ status: 'succeeded', requestInFlight: true })
    expect(await outcome(f.cancel('over'))).toMatchObject({ code: 'BUSY' })
    expect(f.action('op-0')).toBeDefined()
    gate.resolve(null)
    await tick()
    await outcome(f.cancel('over'))
    expect(f.action('op-0')).toBeUndefined()
    expect(f.action('over')?.status).toBe('unknown')
  } finally {
    gate.resolve(null)
    f.dispose()
  }
})

test('a settled retry action does not falsely mean cancellation has already been accepted', async () => {
  const actions = createState<RunActionsState>(
    { op: { operationId: 'op', commandId: 'run.retry', status: 'succeeded', error: null } },
    () => {},
  )
  const local = new CommandRegistry()
  const calls: string[] = []
  const owner = createRunCancellation({
    local,
    actions: actions.reader,
    run: {
      async execute(name) {
        calls.push(name)
        return { operationId: 'op', status: 'completed' }
      },
      getReceipt: () => Promise.resolve(null),
    },
    replace: (id, action) => actions.replace({ ...actions.reader.getSnapshot(), [id]: action }),
    isDisposed: () => false,
  })
  try {
    await owner.cancel({ operationId: 'op' })
    expect(calls).toEqual(['operation.cancel'])
    expect(actions.reader.getSnapshot().op).toMatchObject({
      commandId: 'operation.cancel',
      status: 'succeeded',
      observedStatus: 'completed',
    })
  } finally {
    owner.dispose()
    local.dispose()
    actions.dispose()
  }
})
