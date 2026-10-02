import { expect, test } from 'bun:test'
import { HbarError } from '@hbar/contracts'
import type { RpcParams } from '@hbar/contracts'
import type {
  SessionLaunchTarget,
  SessionLaunchTargetPreparationOperationInput,
  SessionLaunchTargetPreparationSnapshot,
  SessionLaunchTargetPreparationStartReceipt,
  SessionLaunchTargetSetReceipt,
} from '@hbar/contracts/commands/session-launch-target'
import { createSessionLaunchTargetPreparationManager } from '@hbar/client'

const input: SessionLaunchTargetPreparationOperationInput = {
  sessionId: 'session-a',
  expectedRevision: 7,
  operationId: 'operation-a',
}
const start = { sessionId: input.sessionId, expectedRevision: input.expectedRevision }
const options = { idempotencyKey: 'original-write-key', requestId: 'request-a' }
const choice = { ...start, selection: { mode: 'shared-current' as const } }

function target(): SessionLaunchTarget {
  return {
    sessionId: 'session-a',
    workspaceId: 'workspace-a',
    revision: 7,
    selection: { mode: 'shared-current' },
    locked: false,
    resolution: { status: 'idle' },
    updatedAt: 1,
  }
}
function selectionReceipt(): SessionLaunchTargetSetReceipt {
  return { commitId: 'commit-a', request: choice, revision: 7, changed: false, updatedAt: 1 }
}
function startReceipt(): SessionLaunchTargetPreparationStartReceipt {
  return { operationId: 'operation-a', sessionId: 'session-a', workspaceId: 'workspace-a', targetRevision: 7 }
}
function snapshot(): SessionLaunchTargetPreparationSnapshot {
  return {
    schemaVersion: 1,
    ...startReceipt(),
    operationVersion: 1,
    status: 'queued',
    createdAt: 1,
    updatedAt: 1,
  }
}
function deferred() {
  let resolve!: (value: unknown) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<unknown>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}

test('preparation manager is narrow and every call preserves exact owner, revision and original write key', async () => {
  const calls: RpcParams<'command.execute'>[] = []
  const manager = createSessionLaunchTargetPreparationManager({
    async call(method, request) {
      expect(method).toBe('command.execute')
      calls.push(request)
      switch (request.commandId) {
        case 'sessionLaunchTarget.get':
          return target()
        case 'sessionLaunchTarget.set':
        case 'sessionLaunchTarget.receipt':
          return selectionReceipt()
        case 'sessionLaunchTarget.startPreparation':
          return startReceipt()
        default:
          return snapshot()
      }
    },
  })
  expect(Object.keys(manager)).toEqual([
    'readTarget',
    'setSelection',
    'readSelectionReceipt',
    'startPreparation',
    'readPreparation',
    'cancelPreparation',
    'reconcilePreparation',
  ])
  await manager.readTarget('session-a', { requestId: 'read-a' })
  await manager.setSelection(choice, options)
  await manager.readSelectionReceipt({ sessionId: 'session-a', idempotencyKey: options.idempotencyKey })
  await manager.startPreparation(start, options)
  await manager.readPreparation(input)
  await manager.cancelPreparation(input, options)
  await manager.reconcilePreparation(input, options)
  expect(calls).toHaveLength(7)
  for (const call of calls) {
    expect(call).toMatchObject({ protocol: 1, commandVersion: 3 })
    expect(call).not.toHaveProperty('actorId')
    expect(call).not.toHaveProperty('cwd')
    expect(call.commandId).not.toBe('sessionLaunchTarget.prepare')
    expect(call.commandId).not.toBe('run.submit')
    const query = [
      'sessionLaunchTarget.get',
      'sessionLaunchTarget.receipt',
      'sessionLaunchTarget.preparation',
    ].includes(call.commandId)
    if (query) expect(call).not.toHaveProperty('idempotencyKey')
    else expect(call).toMatchObject({ idempotencyKey: options.idempotencyKey, requestId: options.requestId })
  }
  expect(calls[2]?.input).toEqual({ sessionId: 'session-a', idempotencyKey: options.idempotencyKey })
  expect(calls[3]?.input).toEqual(start)
  for (const index of [4, 5, 6]) expect(calls[index]?.input).toEqual(input)
})

test('invalid input, missing write key and pre-aborted reads or writes do not dispatch', async () => {
  let calls = 0
  const manager = createSessionLaunchTargetPreparationManager({
    async call() {
      calls++
      return snapshot()
    },
  })
  await expect(manager.startPreparation({ ...start, expectedRevision: -1 }, options)).rejects.toMatchObject({
    code: 'INVALID_INPUT',
  })
  await expect(manager.setSelection(choice, { idempotencyKey: '' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  await expect(manager.startPreparation(start, { idempotencyKey: '' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  await expect(manager.cancelPreparation(input, { idempotencyKey: '' })).rejects.toMatchObject({
    code: 'INVALID_INPUT',
  })
  await expect(manager.reconcilePreparation(input, { idempotencyKey: '' })).rejects.toMatchObject({
    code: 'INVALID_INPUT',
  })
  const controller = new AbortController()
  controller.abort()
  const readOptions = { signal: controller.signal }
  const writeOptions = { ...options, ...readOptions }
  await expect(manager.readTarget('session-a', readOptions)).rejects.toMatchObject({ code: 'CANCELLED' })
  await expect(
    manager.readSelectionReceipt({ sessionId: 'session-a', idempotencyKey: 'key' }, readOptions),
  ).rejects.toMatchObject({ code: 'CANCELLED' })
  await expect(manager.readPreparation(input, readOptions)).rejects.toMatchObject({ code: 'CANCELLED' })
  await expect(manager.setSelection(choice, writeOptions)).rejects.toMatchObject({ code: 'CANCELLED' })
  await expect(manager.startPreparation(start, writeOptions)).rejects.toMatchObject({ code: 'CANCELLED' })
  await expect(manager.cancelPreparation(input, writeOptions)).rejects.toMatchObject({ code: 'CANCELLED' })
  await expect(manager.reconcilePreparation(input, writeOptions)).rejects.toMatchObject({ code: 'CANCELLED' })
  expect(calls).toBe(0)
})

test('strict snapshots reject leaked roots, wrong identities, invalid versions and misleading terminal errors', async () => {
  const replies: unknown[] = [
    { ...snapshot(), cwd: 'C:/host-private' },
    { ...snapshot(), operationId: 'operation-b' },
    { ...snapshot(), sessionId: 'session-b' },
    { ...snapshot(), targetRevision: 8 },
    { ...snapshot(), operationVersion: 0 },
    { ...snapshot(), schemaVersion: 2 },
    { ...snapshot(), status: 'failed' },
    { ...snapshot(), status: 'ready', error: { code: 'FAILURE', message: 'not ready' } },
  ]
  const manager = createSessionLaunchTargetPreparationManager({
    async call() {
      return replies.shift()
    },
  })
  for (let index = 0; index < 8; index++)
    await expect(manager.readPreparation(input)).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
})

test('unverified write acknowledgements stay unknown; receipt queries reject the wrong original Session', async () => {
  const replies: unknown[] = [
    { ...selectionReceipt(), request: { ...choice, sessionId: 'session-b' } },
    {
      ...selectionReceipt(),
      request: { ...choice, selection: { mode: 'isolated-worktree', branch: { kind: 'existing', name: 'main' } } },
    },
    { ...selectionReceipt(), request: { ...choice, sessionId: 'session-b' } },
    { ...startReceipt(), sessionId: 'session-b' },
    { ...startReceipt(), targetRevision: 8 },
    { ...startReceipt(), targetPath: 'C:/host-private' },
    { ...snapshot(), operationId: 'operation-b' },
    { ...snapshot(), targetRevision: 8 },
  ]
  const manager = createSessionLaunchTargetPreparationManager({
    async call() {
      return replies.shift()
    },
  })
  await expect(manager.setSelection(choice, options)).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  await expect(manager.setSelection(choice, options)).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  await expect(manager.readSelectionReceipt({ sessionId: 'session-a', idempotencyKey: 'key' })).rejects.toMatchObject({
    code: 'INVALID_OUTPUT',
  })
  for (let index = 0; index < 3; index++)
    await expect(manager.startPreparation(start, options)).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  await expect(manager.cancelPreparation(input, options)).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  await expect(manager.reconcilePreparation(input, options)).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
})

test('canonical branch normalization does not reject a valid selection receipt', async () => {
  const branchChoice = {
    ...start,
    selection: { mode: 'isolated-worktree' as const, branch: { kind: 'existing' as const, name: ' main ' } },
  }
  const manager = createSessionLaunchTargetPreparationManager({
    async call(_method, request) {
      expect(request.input).toMatchObject({ selection: { branch: { name: 'main' } } })
      return {
        ...selectionReceipt(),
        request: {
          ...branchChoice,
          selection: { ...branchChoice.selection, branch: { kind: 'existing', name: 'main' } },
        },
      }
    },
  })
  expect((await manager.setSelection(branchChoice, options)).request.selection).toEqual({
    mode: 'isolated-worktree',
    branch: { kind: 'existing', name: 'main' },
  })
})

test('lost acceptance is unknown and replay uses the same key without automatically retrying or submitting a Run', async () => {
  for (const code of ['TIMEOUT', 'DISCONNECTED']) {
    const calls: RpcParams<'command.execute'>[] = []
    const manager = createSessionLaunchTargetPreparationManager({
      async call(_method, request) {
        calls.push(request)
        if (calls.length === 1) throw new HbarError(code, 'lost fixture acknowledgement')
        return startReceipt()
      },
    })
    await expect(manager.startPreparation(start, options)).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(calls).toHaveLength(1)
    expect(await manager.startPreparation(start, { ...options, requestId: 'replay-request' })).toEqual(startReceipt())
    expect(calls.map((call) => call.idempotencyKey)).toEqual([options.idempotencyKey, options.idempotencyKey])
    expect(calls[0]?.input).toEqual(calls[1]?.input)
  }
})

test('after-dispatch abort consumes late outcomes and never sends a remote preparation cancellation', async () => {
  for (const mutation of [false, true]) {
    const pending = deferred()
    const calls: RpcParams<'command.execute'>[] = []
    const manager = createSessionLaunchTargetPreparationManager({
      call(_method, request) {
        calls.push(request)
        return pending.promise
      },
    })
    const controller = new AbortController()
    const observed = mutation
      ? manager.startPreparation(start, { ...options, signal: controller.signal })
      : manager.readPreparation(input, { signal: controller.signal })
    controller.abort()
    await expect(observed).rejects.toMatchObject({ code: mutation ? 'RESULT_UNKNOWN' : 'CANCELLED' })
    pending.reject(new HbarError('DISCONNECTED', 'late fixture settlement'))
    await Promise.resolve()
    expect(calls).toHaveLength(1)
    expect(calls[0]?.commandId).toBe(
      mutation ? 'sessionLaunchTarget.startPreparation' : 'sessionLaunchTarget.preparation',
    )
  }
})

test('synchronous abort during transport dispatch is also unknown for a preparation write', async () => {
  const controller = new AbortController()
  const manager = createSessionLaunchTargetPreparationManager({
    call() {
      controller.abort()
      return Promise.resolve(startReceipt())
    },
  })
  await expect(manager.startPreparation(start, { ...options, signal: controller.signal })).rejects.toMatchObject({
    code: 'RESULT_UNKNOWN',
  })
})

test('queries and authoritative Host conflicts preserve typed failure rather than claim accepted or default readiness', async () => {
  for (const code of ['TIMEOUT', 'DISCONNECTED', 'NOT_FOUND', 'UNAUTHORIZED', 'COMMAND_CONFLICT']) {
    const manager = createSessionLaunchTargetPreparationManager({
      async call() {
        throw new HbarError(code, 'fixture failure')
      },
    })
    await expect(manager.readPreparation(input)).rejects.toMatchObject({ code })
    if (code !== 'TIMEOUT' && code !== 'DISCONNECTED')
      await expect(manager.startPreparation(start, options)).rejects.toMatchObject({ code })
  }
})

test('concurrent preparation queries cannot adopt another operation when replies arrive out of order', async () => {
  const pendingA = deferred()
  const pendingB = deferred()
  const manager = createSessionLaunchTargetPreparationManager({
    call(_method, request) {
      return request.requestId === 'a' ? pendingA.promise : pendingB.promise
    },
  })
  const second = { ...input, sessionId: 'session-b', operationId: 'operation-b', expectedRevision: 9 }
  const a = manager.readPreparation(input, { requestId: 'a' })
  const b = manager.readPreparation(second, { requestId: 'b' })
  pendingB.resolve({
    ...snapshot(),
    sessionId: 'session-b',
    operationId: 'operation-b',
    targetRevision: 9,
    operationVersion: 4,
    status: 'ready',
  })
  expect(await b).toMatchObject({
    sessionId: 'session-b',
    operationId: 'operation-b',
    targetRevision: 9,
    status: 'ready',
  })
  pendingA.resolve(snapshot())
  expect(await a).toEqual(snapshot())
})
