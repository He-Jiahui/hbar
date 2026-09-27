import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry, type CommandExecutor } from '@hbar/commands'
import { createQueuedUserRuns } from '../packages/app-runtime/src/queued-user-runs'
import { createState } from '../packages/app-runtime/src/state'
import type { NavigationState, SessionTimelineState } from '@hbar/app-runtime'

function fixture(read: CommandExecutor['execute']) {
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
    { execute: read },
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
