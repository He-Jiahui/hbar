import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { createWorkspaceTabClose, type WorkspaceTabCloseTarget } from '@hbar/app-runtime/workspace-tab-close'
import type { ActiveOperationsPage } from '@hbar/contracts/commands/run'

const target = (id: string, instanceKey = id): WorkspaceTabCloseTarget => ({ id, sessionId: id, instanceKey })
function activity(
  sessionId: string,
  ids: readonly string[],
  status: ActiveOperationsPage['items'][number]['status'] = 'running',
): ActiveOperationsPage {
  return {
    sessionId,
    sessionSeq: 1,
    totalActive: ids.length,
    items: ids.map((operationId, index) => ({ operationId, status, createdAt: index, startedAt: 1 })),
    nextCursor: null,
  }
}
function fixture(read: (sessionId: string) => ActiveOperationsPage, cancel?: (id: string) => Promise<unknown>) {
  const calls: string[] = []
  const closed: WorkspaceTabCloseTarget[][] = []
  const run: CommandExecutor = {
    async execute(name, input) {
      const value = input as { sessionId?: string; operationId?: string }
      if (name === 'session.activeOperations') {
        calls.push(`read:${value.sessionId}`)
        return read(value.sessionId ?? '')
      }
      if (name === 'operation.cancel') {
        calls.push(`cancel:${value.operationId}`)
        return cancel ? cancel(value.operationId ?? '') : { operationId: value.operationId, status: 'cancelRequested' }
      }
      throw new Error(`Unexpected command: ${name}`)
    },
  }
  const close = createWorkspaceTabClose({
    run,
    closeCaptured: async (targets) => {
      closed.push([...targets])
    },
    onSubscriberError: (reason) => {
      throw reason
    },
    timeoutMs: 1_000,
  })
  return { close, calls, closed }
}

test('closing idle tabs drops only original view instances, not run or session data', async () => {
  const example = fixture((id) => activity(id, []))
  const targets = [target('a', 'old-a'), target('b', 'old-b')]
  await example.close.request(targets)
  expect(example.close.reader.getSnapshot().request).toBeNull()
  expect(example.closed).toEqual([targets])
  expect(example.calls).toEqual(['read:a', 'read:b'])
  example.close.dispose()
})

test('keep running closes captured tabs without sending cancellation', async () => {
  const example = fixture((id) => activity(id, ['run-a']))
  await example.close.request([target('a')])
  const request = example.close.reader.getSnapshot().request
  expect(request).toMatchObject({ status: 'choice', operations: [{ operationId: 'run-a' }] })
  if (!request) throw new Error('Expected active close request')
  await example.close.resolve(request.id, 'keepRunning')
  expect(example.closed).toEqual([[target('a')]])
  expect(example.calls).toEqual(['read:a'])
  example.close.dispose()
})

test('stop remains unresolved until terminal readback and never resends a possibly accepted cancellation', async () => {
  let phase: 'running' | 'settled' = 'running'
  const example = fixture((id) => activity(id, phase === 'running' ? ['run-a'] : []))
  await example.close.request([target('a')])
  const id = example.close.reader.getSnapshot().request!.id
  await example.close.resolve(id, 'stop')
  expect(example.close.reader.getSnapshot().request).toMatchObject({ status: 'unknown', error: 'STOP_PENDING' })
  expect(example.closed).toHaveLength(0)
  await example.close.resolve(id, 'recheck')
  expect(example.close.reader.getSnapshot().request?.status).toBe('unknown')
  expect(example.calls.filter((call) => call === 'cancel:run-a')).toHaveLength(1)
  phase = 'settled'
  await example.close.resolve(id, 'recheck')
  expect(example.close.reader.getSnapshot().request).toBeNull()
  expect(example.closed).toEqual([[target('a')]])
  example.close.dispose()
})

test('lost cancellation reply is read-only recoverable and never silently sends again', async () => {
  let status: 'running' | 'settled' = 'running'
  const example = fixture(
    (id) => activity(id, status === 'running' ? ['run-a'] : []),
    async () => {
      throw new CommandError('RESULT_UNKNOWN', 'Lost cancellation response')
    },
  )
  await example.close.request([target('a')])
  const id = example.close.reader.getSnapshot().request!.id
  await example.close.resolve(id, 'stop')
  expect(example.close.reader.getSnapshot().request).toMatchObject({ status: 'unknown', error: 'RESULT_UNKNOWN' })
  await example.close.resolve(id, 'recheck')
  expect(example.calls.filter((call) => call === 'cancel:run-a')).toHaveLength(1)
  status = 'settled'
  await example.close.resolve(id, 'recheck')
  expect(example.closed).toHaveLength(1)
  example.close.dispose()
})

test('a newly started operation after stop requires a new explicit choice and cancels only the new id', async () => {
  let phase = 0
  const example = fixture(
    (id) => activity(id, phase === 0 ? ['old'] : phase === 1 ? ['new'] : []),
    async (id) => {
      phase = id === 'old' ? 1 : 2
      return { operationId: id, status: 'cancelRequested' }
    },
  )
  await example.close.request([target('a')])
  const id = example.close.reader.getSnapshot().request!.id
  await example.close.resolve(id, 'stop')
  expect(example.close.reader.getSnapshot().request).toMatchObject({
    status: 'choice',
    error: 'ACTIVITY_CHANGED',
    operations: [{ operationId: 'new' }],
  })
  expect(example.closed).toHaveLength(0)
  await example.close.resolve(id, 'stop')
  expect(example.closed).toHaveLength(1)
  expect(example.calls.filter((call) => call.startsWith('cancel:'))).toEqual(['cancel:old', 'cancel:new'])
  example.close.dispose()
})

test('already requested cancellations count as pending but are not dispatched again', async () => {
  const example = fixture((id) => activity(id, ['run-a'], 'cancelRequested'))
  await example.close.request([target('a')])
  const id = example.close.reader.getSnapshot().request!.id
  await example.close.resolve(id, 'stop')
  expect(example.close.reader.getSnapshot().request?.status).toBe('unknown')
  expect(example.calls.filter((call) => call.startsWith('cancel:'))).toHaveLength(0)
  example.close.dispose()
})

test('invalid activity and read failures cannot be treated as idle, with explicit cancel', async () => {
  const example = fixture((id) => ({ ...activity(id, []), totalActive: 1 }))
  await example.close.request([target('a')])
  const request = example.close.reader.getSnapshot().request
  expect(request).toMatchObject({ status: 'unknown', error: 'INVALID_OUTPUT' })
  expect(example.closed).toHaveLength(0)
  await example.close.resolve(request!.id, 'cancel')
  expect(example.close.reader.getSnapshot().request).toBeNull()
  example.close.dispose()
})

test('bounded close rejects duplicate and oversized target sets before any Host read', async () => {
  const example = fixture((id) => activity(id, []))
  for (const targets of [
    [],
    [target('a'), target('a')],
    Array.from({ length: 33 }, (_, index) => target(String(index))),
  ]) {
    let caught: unknown
    try {
      await example.close.request(targets)
    } catch (reason) {
      caught = reason
    }
    expect(caught).toMatchObject({ code: 'INVALID_INPUT' })
  }
  expect(example.calls).toEqual([])
  example.close.dispose()
})

test('an unanswered Host read times out to unknown without closing or claiming cancellation', async () => {
  let calls = 0
  const closeCount: WorkspaceTabCloseTarget[][] = []
  const close = createWorkspaceTabClose({
    run: {
      async execute() {
        calls++
        return await new Promise<never>(() => undefined)
      },
    },
    closeCaptured: async (targets) => {
      closeCount.push([...targets])
    },
    onSubscriberError: (reason) => {
      throw reason
    },
    timeoutMs: 10,
  })
  await close.request([target('a')])
  expect(close.reader.getSnapshot().request).toMatchObject({ status: 'unknown', error: 'TIMEOUT' })
  expect(closeCount).toEqual([])
  expect(calls).toBe(1)
  const id = close.reader.getSnapshot().request!.id
  await close.resolve(id, 'cancel')
  expect(close.reader.getSnapshot().request).toBeNull()
  close.dispose()
})

test('activity read concurrency stays at four sessions even for 32-tab bulk close', async () => {
  let inflight = 0
  let maxInflight = 0
  const close = createWorkspaceTabClose({
    run: {
      async execute(_name, input) {
        const value = input as { sessionId: string }
        inflight++
        maxInflight = Math.max(inflight, maxInflight)
        await new Promise((resolve) => setTimeout(resolve, 3))
        inflight--
        return activity(value.sessionId, [])
      },
    },
    closeCaptured: async () => undefined,
    onSubscriberError: (reason) => {
      throw reason
    },
    timeoutMs: 1_000,
  })
  await close.request(Array.from({ length: 32 }, (_, index) => target(`session-${index}`)))
  expect(maxInflight).toBe(4)
  expect(inflight).toBe(0)
  expect(close.reader.getSnapshot().request).toBeNull()
  close.dispose()
})

test('activity pagination captures all original IDs and revision flapping is bounded', async () => {
  let reads = 0
  let flapping = false
  const ids = Array.from({ length: 105 }, (_, index) => `run-${index}`)
  const close = createWorkspaceTabClose({
    run: {
      async execute(_name, input) {
        reads++
        const value = input as { sessionId: string; cursor?: { afterOperationId: string } }
        if (flapping && value.cursor) throw new CommandError('ACTIVITY_CHANGED', 'New durable revision')
        const all = activity(value.sessionId, ids)
        return value.cursor
          ? { ...all, items: all.items.slice(100) }
          : { ...all, items: all.items.slice(0, 100), nextCursor: { afterOperationId: ids[99], sessionSeq: 1 } }
      },
    },
    closeCaptured: async () => undefined,
    onSubscriberError: (reason) => {
      throw reason
    },
  })
  await close.request([target('a')])
  expect(close.reader.getSnapshot().request?.operations.map((item) => item.operationId)).toEqual(ids)
  expect(reads).toBe(2)
  const requestId = close.reader.getSnapshot().request!.id
  flapping = true
  await close.resolve(requestId, 'recheck')
  expect(close.reader.getSnapshot().request).toMatchObject({ status: 'unknown', error: 'ACTIVITY_CHANGED' })
  expect(reads).toBe(8)
  close.dispose()
})

test('over 256 operations never becomes partial stop authority or idle', async () => {
  const example = fixture((id) => ({ ...activity(id, ['oldest']), totalActive: 257 }))
  await example.close.request([target('a')])
  expect(example.close.reader.getSnapshot().request).toMatchObject({
    status: 'unknown',
    error: 'ACTIVITY_LIMIT',
    operations: [],
  })
  expect(example.closed).toEqual([])
  expect(example.calls).toEqual(['read:a'])
  // The explicit keep-running choice remains safe even when the complete activity set is too large.
  await example.close.resolve(example.close.reader.getSnapshot().request!.id, 'keepRunning')
  expect(example.closed).toEqual([[target('a')]])
  expect(example.calls).toEqual(['read:a'])
  example.close.dispose()
})

test('dispose releases the waiting intent and a late read cannot close any original view', async () => {
  const pending = Promise.withResolvers<unknown>()
  let closed = 0
  const close = createWorkspaceTabClose({
    run: { execute: async () => pending.promise },
    closeCaptured: async () => {
      closed++
    },
    onSubscriberError: (reason) => {
      throw reason
    },
  })
  const request = close.request([target('a')])
  close.dispose()
  await request
  pending.resolve(activity('a', []))
  await Promise.resolve()
  expect(closed).toBe(0)
})
