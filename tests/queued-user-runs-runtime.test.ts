import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry, type CommandExecutor } from '@hbar/commands'
import type { QueuedRunRemoveReceipt } from '@hbar/contracts/commands/run'
import { createQueuedUserRuns } from '../packages/app-runtime/src/queued-user-runs'
import { createState } from '../packages/app-runtime/src/state'
import type { NavigationState, SessionTimelineState } from '@hbar/app-runtime'

function fixture(
  read: CommandExecutor['execute'],
  getQueuedRemoveReceipt?: (sessionId: string, idempotencyKey: string) => Promise<QueuedRunRemoveReceipt | null>,
) {
  const local = new CommandRegistry({ execution: 'client' })
  const errors: unknown[] = []
  const nav = createState<NavigationState>(
    { workspaceId: 'workspace', sessionId: null, status: 'idle', error: null },
    (error) => errors.push(error),
  )
  const timeline = createState<SessionTimelineState>(
    {
      sessionId: null,
      status: 'idle',
      olderStatus: 'idle',
      olderError: null,
      messages: [],
      runs: [],
      approvals: [],
      userInputs: [],
      plan: null,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
      streams: {},
      events: [],
      cursor: 0,
      hasOlder: false,
      error: null,
    },
    (error) => errors.push(error),
  )
  const owner = createQueuedUserRuns(
    local,
    { execute: read, getReceipt: async () => null, ...(getQueuedRemoveReceipt ? { getQueuedRemoveReceipt } : {}) },
    nav.reader,
    timeline.reader,
    (error) => errors.push(error),
    () => false,
  )
  return {
    local,
    nav,
    timeline,
    owner,
    errors,
    async select(sessionId: string) {
      nav.replace({ workspaceId: 'workspace', sessionId, status: 'idle', error: null })
      for (let attempt = 0; attempt < 20 && owner.reader.getSnapshot().status !== 'ready'; attempt++)
        await new Promise((resolve) => setTimeout(resolve, 0))
      expect(owner.reader.getSnapshot().status).toBe('ready')
    },
    dispose() {
      owner.dispose()
      local.dispose()
      nav.dispose()
      timeline.dispose()
    },
  }
}

test('ViewModel pages one bounded Host queue window at a time and recovers a stale cursor', async () => {
  let staleNext = false
  const calls: unknown[] = []
  const f = fixture(async (name, value) => {
    expect(name).toBe('session.queuedUserRuns')
    const input = value as { sessionId: string; cursor?: { afterOperationId: string }; limit: number }
    calls.push(input)
    expect(input.limit).toBe(10)
    if (input.cursor && staleNext) {
      staleNext = false
      throw new CommandError('ACTIVITY_CHANGED', 'Queue changed')
    }
    return {
      sessionId: input.sessionId,
      sessionSeq: 3,
      totalQueued: 11,
      items: [
        {
          operationId: input.cursor ? 'second' : 'first',
          revision: 1,
          createdAt: 1,
          textPreview: 'text',
          truncated: false,
          attachmentCount: 0,
        },
      ],
      nextCursor: input.cursor ? null : { afterOperationId: 'first', sessionSeq: 3, totalQueued: 11 },
    }
  })
  try {
    await f.select('one')
    expect(f.owner.reader.getSnapshot()).toMatchObject({ pageIndex: 0, totalQueued: 11 })
    await f.local.execute('queuedUserRuns.next', { sessionId: 'one' })
    expect(f.owner.reader.getSnapshot()).toMatchObject({ pageIndex: 1, items: [{ operationId: 'second' }] })
    await f.local.execute('queuedUserRuns.previous', { sessionId: 'one' })
    expect(f.owner.reader.getSnapshot()).toMatchObject({ pageIndex: 0, items: [{ operationId: 'first' }] })
    staleNext = true
    await f.local.execute('queuedUserRuns.next', { sessionId: 'one' })
    expect(f.owner.reader.getSnapshot()).toMatchObject({ pageIndex: 0, items: [{ operationId: 'first' }] })
    expect(calls.length).toBeGreaterThanOrEqual(5)
    expect(f.errors).toEqual([])
  } finally {
    f.dispose()
  }
})

test('late queue results cannot cross the selected session boundary', async () => {
  let finishFirst!: (value: unknown) => void
  const first = new Promise<unknown>((resolve) => {
    finishFirst = resolve
  })
  const f = fixture(async (_name, value) => {
    const sessionId = (value as { sessionId: string }).sessionId
    if (sessionId === 'one') return first
    return { sessionId, sessionSeq: 1, totalQueued: 0, items: [], nextCursor: null }
  })
  try {
    f.nav.replace({ workspaceId: 'workspace', sessionId: 'one', status: 'idle', error: null })
    await f.select('two')
    finishFirst({ sessionId: 'one', sessionSeq: 1, totalQueued: 1, items: [], nextCursor: null })
    await Promise.resolve()
    expect(f.owner.reader.getSnapshot()).toMatchObject({ sessionId: 'two', status: 'ready', totalQueued: 0 })
    expect(f.errors).toEqual([])
  } finally {
    f.dispose()
  }
})

test('unknown removal keeps the same target and idempotency key for a safe explicit retry', async () => {
  let removed = false
  const keys: string[] = []
  const f = fixture(async (name, value, options) => {
    if (name === 'session.queuedUserRuns')
      return {
        sessionId: 'one',
        sessionSeq: removed ? 3 : 2,
        totalQueued: removed ? 0 : 1,
        items: removed
          ? []
          : [
              {
                operationId: 'queued',
                revision: 2,
                createdAt: 1,
                textPreview: 'Keep this text',
                truncated: false,
                attachmentCount: 0,
              },
            ],
        nextCursor: null,
      }
    expect(name).toBe('queuedRun.remove')
    const request = value as { sessionId: string; operationId: string; expectedRevision: number }
    expect(request).toEqual({ sessionId: 'one', operationId: 'queued', expectedRevision: 2 })
    keys.push(options?.idempotencyKey ?? '')
    if (keys.length === 1) throw new CommandError('RESULT_UNKNOWN', 'Response lost')
    removed = true
    return {
      commandId: 'queuedRun.remove',
      commandVersion: 1,
      sessionId: 'one',
      operationId: 'queued',
      idempotencyKey: options?.idempotencyKey,
      status: 'cancelled',
      eventId: 'settled',
      sessionSeq: 3,
      removedAt: 3,
    }
  })
  try {
    await f.select('one')
    await expect(
      f.local.execute('queuedUserRuns.remove', { sessionId: 'one', operationId: 'queued', expectedRevision: 2 }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(f.owner.reader.getSnapshot().removal).toMatchObject({ operationId: 'queued', status: 'unknown' })
    await expect(
      f.local.execute('queuedUserRuns.remove', { sessionId: 'one', operationId: 'queued', expectedRevision: 2 }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    await expect(
      f.local.execute('queuedUserRuns.remove', { sessionId: 'other', operationId: 'queued', expectedRevision: 2 }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await f.local.execute('queuedUserRuns.retryRemoval', { sessionId: 'one', operationId: 'queued' })
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
    expect(keys[0]).toBeTruthy()
    for (let attempt = 0; attempt < 20 && f.owner.reader.getSnapshot().totalQueued !== 0; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 0))
    expect(f.owner.reader.getSnapshot()).toMatchObject({ status: 'ready', totalQueued: 0, removal: null })
    expect(f.errors).toEqual([])
  } finally {
    f.dispose()
  }
})

test('a lost removal acknowledgement resolves through its exact receipt without another write', async () => {
  let removed = false
  let writes = 0
  const f = fixture(
    async (name, _value, options) => {
      if (name === 'session.queuedUserRuns')
        return {
          sessionId: 'one',
          sessionSeq: removed ? 3 : 2,
          totalQueued: removed ? 0 : 1,
          items: removed
            ? []
            : [
                {
                  operationId: 'queued',
                  revision: 2,
                  createdAt: 1,
                  textPreview: 'Text',
                  truncated: false,
                  attachmentCount: 0,
                },
              ],
          nextCursor: null,
        }
      writes++
      removed = true
      expect(options?.idempotencyKey).toBeTruthy()
      throw new CommandError('RESULT_UNKNOWN', 'Acknowledgement lost')
    },
    async (sessionId, idempotencyKey) => ({
      commandId: 'queuedRun.remove',
      commandVersion: 1,
      sessionId,
      operationId: 'queued',
      idempotencyKey,
      status: 'cancelled',
      eventId: 'settled',
      sessionSeq: 3,
      removedAt: 3,
    }),
  )
  try {
    await f.select('one')
    const receipt = await f.local.execute('queuedUserRuns.remove', {
      sessionId: 'one',
      operationId: 'queued',
      expectedRevision: 2,
    })
    expect(receipt).toMatchObject({ status: 'cancelled', operationId: 'queued' })
    expect(writes).toBe(1)
    expect(f.owner.reader.getSnapshot().removal).toBeNull()
  } finally {
    f.dispose()
  }
})

test('a queued-only conflict stays visible until dismissed and never retries with a new key', async () => {
  let writes = 0
  const f = fixture(async (name) => {
    if (name === 'session.queuedUserRuns')
      return {
        sessionId: 'one',
        sessionSeq: 2,
        totalQueued: 1,
        items: [
          {
            operationId: 'queued',
            revision: 2,
            createdAt: 1,
            textPreview: 'Text',
            truncated: false,
            attachmentCount: 0,
          },
        ],
        nextCursor: null,
      }
    writes++
    throw new CommandError('COMMAND_CONFLICT', 'The Run already started')
  })
  try {
    await f.select('one')
    await expect(
      f.local.execute('queuedUserRuns.remove', { sessionId: 'one', operationId: 'queued', expectedRevision: 2 }),
    ).rejects.toMatchObject({ code: 'COMMAND_CONFLICT' })
    expect(f.owner.reader.getSnapshot().removal).toMatchObject({ status: 'failed', error: 'COMMAND_CONFLICT' })
    await expect(
      f.local.execute('queuedUserRuns.retryRemoval', { sessionId: 'one', operationId: 'queued' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await f.local.execute('queuedUserRuns.dismissRemoval', { sessionId: 'one' })
    expect(f.owner.reader.getSnapshot().removal).toBeNull()
    expect(writes).toBe(1)
  } finally {
    f.dispose()
  }
})

test('a queued edit event in a batch refreshes even when an unrelated event is last', async () => {
  let reads = 0
  const f = fixture(async (name) => {
    expect(name).toBe('session.queuedUserRuns')
    reads++
    return { sessionId: 'one', sessionSeq: reads, totalQueued: 0, items: [], nextCursor: null }
  })
  try {
    await f.select('one')
    f.timeline.replace({ ...f.timeline.reader.getSnapshot(), sessionId: 'one', status: 'ready', cursor: 1 })
    for (let attempt = 0; attempt < 20 && f.owner.reader.getSnapshot().status !== 'ready'; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 0))
    const before = reads
    f.timeline.replace({
      ...f.timeline.reader.getSnapshot(),
      sessionId: 'one',
      status: 'ready',
      cursor: 3,
      events: [
        {
          eventId: 'edit',
          sessionId: 'one',
          seq: 2,
          runId: 'queued',
          stepId: null,
          type: 'run.inputEdited',
          data: {},
          time: 2,
          version: 1,
        },
        {
          eventId: 'usage',
          sessionId: 'one',
          seq: 3,
          runId: 'queued',
          stepId: null,
          type: 'usage.recorded',
          data: {},
          time: 3,
          version: 1,
        },
      ],
    })
    for (let attempt = 0; attempt < 20 && reads === before; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reads).toBe(before + 1)
  } finally {
    f.dispose()
  }
})
