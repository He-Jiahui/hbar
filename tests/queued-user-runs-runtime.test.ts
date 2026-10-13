import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry, type CommandExecutor } from '@hbar/commands'
import type {
  QueuedRunEditTextReceipt,
  QueuedRunGuideReceipt,
  QueuedRunRemoveReceipt,
} from '@hbar/contracts/commands/run'
import { createQueuedUserRuns } from '../packages/app-runtime/src/queued-user-runs'
import { createState } from '../packages/app-runtime/src/state'
import type { NavigationState, RunCommandPort, SessionTimelineState } from '@hbar/app-runtime'
import { runSchema } from '@hbar/contracts'

function fixture(
  read: CommandExecutor['execute'],
  getQueuedRemoveReceipt?: (sessionId: string, idempotencyKey: string) => Promise<QueuedRunRemoveReceipt | null>,
  getQueuedEditTextReceipt?: (sessionId: string, idempotencyKey: string) => Promise<QueuedRunEditTextReceipt | null>,
  guidance?: Pick<RunCommandPort, 'guideQueuedRun' | 'getQueuedRunGuideReceipt'>,
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
      toolOutputs: {},
      events: [],
      cursor: 0,
      hasOlder: false,
      error: null,
    },
    (error) => errors.push(error),
  )
  const owner = createQueuedUserRuns(
    local,
    {
      execute: read,
      getReceipt: async () => null,
      ...(getQueuedRemoveReceipt ? { getQueuedRemoveReceipt } : {}),
      ...(getQueuedEditTextReceipt ? { getQueuedEditTextReceipt } : {}),
      ...guidance,
    },
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

function guideReceipt(key: string): QueuedRunGuideReceipt {
  return {
    commandId: 'queuedRun.guide',
    commandVersion: 1,
    sessionId: 'one',
    operationId: 'selected',
    activeRunId: 'active',
    idempotencyKey: key,
    status: 'accepted',
    operationStatus: 'guided',
    messageId: 'message',
    eventId: 'event',
    revision: 8,
    sessionSeq: 8,
    queueRevision: 2,
    guidedAt: 10,
  }
}

async function setGuidanceRun(f: ReturnType<typeof fixture>, status: 'running' | 'waiting_approval' = 'running') {
  f.timeline.replace({
    ...f.timeline.reader.getSnapshot(),
    sessionId: 'one',
    status: 'ready',
    runs: [
      runSchema.parse({
        id: 'active',
        sessionId: 'one',
        requestId: 'original',
        input: { text: 'Initial', images: [] },
        modelId: 'model',
        status,
        createdAt: 1,
        startedAt: 1,
        endedAt: null,
        error: null,
      }),
    ],
  })
  await f.local.execute('queuedUserRuns.refresh', { sessionId: 'one' })
}

function guidePage(sessionId: string, consumed = false) {
  return {
    sessionId,
    sessionSeq: consumed ? 8 : 3,
    totalQueued: consumed ? 1 : 2,
    items: (consumed ? ['remaining'] : ['selected', 'remaining']).map((operationId) => ({
      operationId,
      revision: 2,
      createdAt: 2,
      textPreview: operationId,
      truncated: false,
      attachmentCount: 0,
    })),
    nextCursor: null,
  }
}

test('guidance captures one queued item and exact Run without changing the remaining queue', async () => {
  let consumed = false
  const writes: unknown[] = []
  const f = fixture(
    async (_name, value) => guidePage((value as { sessionId: string }).sessionId, consumed),
    undefined,
    undefined,
    {
      guideQueuedRun: async (request, key) => {
        writes.push(request)
        consumed = true
        return guideReceipt(key)
      },
    },
  )
  try {
    await f.select('one')
    await setGuidanceRun(f)
    const result = await f.local.execute('queuedUserRuns.guide', {
      sessionId: 'one',
      operationId: 'selected',
      activeRunId: 'active',
      expectedRevision: 2,
    })
    expect(result).toMatchObject({ operationStatus: 'guided', activeRunId: 'active' })
    expect(writes).toEqual([{ sessionId: 'one', operationId: 'selected', activeRunId: 'active', expectedRevision: 2 }])
    await f.select('one')
    expect(f.owner.reader.getSnapshot().items.map((item) => item.operationId)).toEqual(['remaining'])
    expect(f.owner.reader.getSnapshot().guiding).toBeNull()
  } finally {
    f.dispose()
  }
})

test('unknown guidance survives navigation and only checks its original receipt, even after the Run stops', async () => {
  const keys: string[] = []
  const reads: string[] = []
  let receiptAvailable = false
  const f = fixture(
    async (_name, value) => guidePage((value as { sessionId: string }).sessionId, receiptAvailable),
    undefined,
    undefined,
    {
      guideQueuedRun: async (_request, key) => {
        keys.push(key)
        throw new CommandError('RESULT_UNKNOWN', 'Lost response')
      },
      getQueuedRunGuideReceipt: async (sessionId, key) => {
        reads.push(`${sessionId}:${key}`)
        return receiptAvailable ? guideReceipt(key) : null
      },
    },
  )
  try {
    await f.select('one')
    await setGuidanceRun(f)
    await expect(
      f.local.execute('queuedUserRuns.guide', {
        sessionId: 'one',
        operationId: 'selected',
        activeRunId: 'active',
        expectedRevision: 2,
      }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    await f.select('two')
    expect(f.owner.reader.getSnapshot().guiding).toBeNull()
    await f.select('one')
    expect(f.owner.reader.getSnapshot().guiding?.status).toBe('unknown')
    f.timeline.replace({ ...f.timeline.reader.getSnapshot(), runs: [] })
    receiptAvailable = true
    await f.local.execute('queuedUserRuns.retryGuide', { sessionId: 'one', operationId: 'selected' })
    expect(keys).toHaveLength(1)
    expect(reads.every((entry) => entry === `one:${keys[0]}`)).toBe(true)
    expect(f.owner.reader.getSnapshot().guiding).toBeNull()
  } finally {
    f.dispose()
  }
})

test('stale revisions, foreign Runs and approval waiting do not dispatch guidance', async () => {
  let writes = 0
  const f = fixture(async () => guidePage('one'), undefined, undefined, {
    guideQueuedRun: async (_input, key) => {
      writes++
      return guideReceipt(key)
    },
  })
  const target = { sessionId: 'one', operationId: 'selected', activeRunId: 'active', expectedRevision: 2 }
  try {
    await f.select('one')
    await setGuidanceRun(f)
    await expect(f.local.execute('queuedUserRuns.guide', { ...target, activeRunId: 'foreign' })).rejects.toMatchObject({
      code: 'COMMAND_CONFLICT',
    })
    await expect(f.local.execute('queuedUserRuns.guide', { ...target, expectedRevision: 1 })).rejects.toMatchObject({
      code: 'COMMAND_CONFLICT',
    })
    await setGuidanceRun(f, 'waiting_approval')
    await expect(f.local.execute('queuedUserRuns.guide', target)).rejects.toMatchObject({ code: 'COMMAND_CONFLICT' })
    expect(writes).toBe(0)
  } finally {
    f.dispose()
  }
})

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

test('inline edit reads the full Host text and reconciles a lost acknowledgement by original key', async () => {
  let written = false
  let writes = 0
  const preview = 'x'.repeat(240)
  const full = `${preview}完整尾部`
  const f = fixture(
    async (name, value, options) => {
      if (name === 'session.queuedUserRuns')
        return {
          sessionId: 'one',
          sessionSeq: written ? 3 : 2,
          totalQueued: 1,
          items: [
            {
              operationId: 'queued',
              revision: written ? 3 : 2,
              createdAt: 1,
              textPreview: written ? 'new text' : preview,
              truncated: !written,
              attachmentCount: 0,
            },
          ],
          nextCursor: null,
        }
      if (name === 'queuedRun.getEditable')
        return { sessionId: 'one', operationId: 'queued', revision: 2, text: full, attachmentCount: 0 }
      expect(name).toBe('queuedRun.editText')
      expect(value).toEqual({ sessionId: 'one', operationId: 'queued', expectedRevision: 2, text: 'new text' })
      expect(options?.idempotencyKey).toBeTruthy()
      writes++
      written = true
      throw new CommandError('RESULT_UNKNOWN', 'Acknowledgement lost')
    },
    undefined,
    async (sessionId, idempotencyKey) => ({
      commandId: 'queuedRun.editText',
      commandVersion: 1,
      sessionId,
      operationId: 'queued',
      idempotencyKey,
      revision: 3,
      eventId: 'edit',
      editedAt: 3,
    }),
  )
  try {
    await f.select('one')
    await f.local.execute('queuedUserRuns.startEdit', { sessionId: 'one', operationId: 'queued' })
    expect(f.owner.reader.getSnapshot().editing?.text).toBe(full)
    await f.local.execute('queuedUserRuns.setEditText', {
      sessionId: 'one',
      operationId: 'queued',
      text: '  new text  ',
    })
    const receipt = await f.local.execute('queuedUserRuns.saveEdit', { sessionId: 'one', operationId: 'queued' })
    expect(receipt).toMatchObject({ operationId: 'queued', revision: 3 })
    expect(writes).toBe(1)
    expect(f.owner.reader.getSnapshot().editing).toBeNull()
    expect(f.errors).toEqual([])
  } finally {
    f.dispose()
  }
})

test('late full-text read cannot enter the next session edit state', async () => {
  let release!: (value: unknown) => void
  const fullRead = new Promise<unknown>((resolve) => {
    release = resolve
  })
  const f = fixture(async (name, value) => {
    const sessionId = (value as { sessionId: string }).sessionId
    if (name === 'queuedRun.getEditable') return fullRead
    return {
      sessionId,
      sessionSeq: 2,
      totalQueued: sessionId === 'one' ? 1 : 0,
      items:
        sessionId === 'one'
          ? [
              {
                operationId: 'queued',
                revision: 2,
                createdAt: 1,
                textPreview: 'preview',
                truncated: true,
                attachmentCount: 0,
              },
            ]
          : [],
      nextCursor: null,
    }
  })
  try {
    await f.select('one')
    const pending = f.local.execute('queuedUserRuns.startEdit', { sessionId: 'one', operationId: 'queued' })
    await f.select('two')
    release({ sessionId: 'one', operationId: 'queued', revision: 2, text: 'private full text', attachmentCount: 0 })
    await expect(pending).rejects.toMatchObject({ code: 'QUERY_SUPERSEDED' })
    expect(f.owner.reader.getSnapshot()).toMatchObject({ sessionId: 'two', editing: null })
    expect(f.errors).toEqual([])
  } finally {
    f.dispose()
  }
})
