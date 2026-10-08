import { expect, test } from 'bun:test'
import type { CommandExecutor, ExecuteOptions } from '@hbar/commands'
import type { NavigationState, SessionTimelineState } from '@hbar/app-runtime'
import type { SessionContextUsage } from '@hbar/contracts/commands/models'
import { createSessionControls } from '../packages/app-runtime/src/session-controls'
import { createState } from '../packages/app-runtime/src/state'

const context = (sessionId: string, inputTokens: number, percent = 80): SessionContextUsage => ({
  sessionId,
  modelId: 'fixture',
  status: 'available',
  estimated: true,
  inputTokens,
  contextWindow: 100_000,
  outputReserve: 10_000,
  compactionPercent: percent,
  compactionTokens: Math.min(percent * 1_000, 90_000),
  remainingTokens: Math.max(0, 100_000 - inputTokens),
  observedAt: 1,
})
const selection = (sessionId: string | null): NavigationState => ({
  sessionId,
  workspaceId: 'workspace',
  status: 'idle',
  error: null,
})
const timeline = (): SessionTimelineState => ({
  sessionId: 'one',
  status: 'ready',
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
})
async function waitFor(check: () => boolean) {
  for (let i = 0; i < 500; i++) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error('Context projection did not settle')
}
function fixture(read: (sessionId: string, options?: ExecuteOptions) => Promise<unknown>) {
  const errors: unknown[] = []
  const onError = (error: unknown) => {
    errors.push(error)
  }
  const navigation = createState(selection('one'), onError)
  const events = createState(timeline(), onError)
  const models: CommandExecutor = {
    async execute(name, input, options) {
      if (!input || typeof input !== 'object' || !('sessionId' in input) || typeof input.sessionId !== 'string')
        throw new Error('Missing session ID')
      if (name === 'session.getContextUsage') return read(input.sessionId, options)
      if (name === 'session.getModel')
        return {
          sessionId: input.sessionId,
          status: 'unset',
          modelId: null,
          model: null,
          thinkingLevel: null,
          revisions: {},
          sources: { model: 'default', thinkingLevel: 'default' },
        }
      throw new Error(`Unexpected command ${name}`)
    },
  }
  const controls = createSessionControls(
    models,
    undefined,
    undefined,
    navigation.reader,
    events.reader,
    onError,
    () => false,
  )
  return {
    navigation,
    events,
    controls,
    errors,
    dispose() {
      controls.dispose()
      navigation.dispose()
      events.dispose()
    },
  }
}

test('late context reads never replace another session, and navigation aborts the old query', async () => {
  const old = Promise.withResolvers<unknown>()
  let signal: AbortSignal | undefined
  const f = fixture(async (id, options) => {
    if (id === 'one') {
      signal = options?.signal
      return old.promise
    }
    return context(id, 78_000)
  })
  try {
    await waitFor(() => !!signal)
    f.navigation.replace(selection('two'))
    await waitFor(() => f.controls.reader.getSnapshot().context?.sessionId === 'two')
    expect(signal?.aborted).toBe(true)
    old.resolve(context('one', 1_000))
    await Bun.sleep(2)
    expect(f.controls.reader.getSnapshot().context).toMatchObject({ sessionId: 'two', inputTokens: 78_000 })
    expect(f.errors).toEqual([])
  } finally {
    old.resolve(context('one', 0))
    f.dispose()
  }
})

test('compaction revisions and applicable confirmed settings refresh context while stream frames/scopes stay quiet', async () => {
  let input = 70_000,
    percent = 80,
    reads = 0
  const f = fixture(async (id) => {
    reads += 1
    return context(id, input, percent)
  })
  try {
    await waitFor(() => f.controls.reader.getSnapshot().contextStatus === 'ready')
    const count = reads
    f.events.replace({
      ...timeline(),
      streams: {
        live: {
          id: 'live',
          sessionId: 'one',
          runId: 'run',
          text: 'Streaming output',
          thinking: '',
          offset: 16,
          version: 1,
        },
      },
    })
    await Bun.sleep(2)
    expect(reads).toBe(count)
    input = 5_000
    f.events.replace({
      ...timeline(),
      events: [
        {
          eventId: 'compact',
          sessionId: 'one',
          runId: null,
          stepId: null,
          version: 1,
          seq: 2,
          time: 1,
          type: 'context.compacted',
          data: {},
        },
      ],
      cursor: 2,
    })
    await waitFor(() => f.controls.reader.getSnapshot().context?.inputTokens === 5_000)
    input = 6_000
    f.events.replace({ ...timeline(), cursor: 3 })
    await waitFor(() => f.controls.reader.getSnapshot().context?.inputTokens === 6_000)
    const change = {
      schemaVersion: 1,
      scope: { kind: 'session' as const, targetId: 'other' },
      changes: [
        { op: 'set' as const, path: [{ kind: 'field' as const, name: 'context.compactionPercent' }], value: 60 },
      ],
      baselineRevisions: {},
    }
    const after = reads
    await f.controls.settingsCommitted(change)
    expect(reads).toBe(after)
    percent = 60
    await f.controls.settingsCommitted({ ...change, scope: { kind: 'global' } })
    expect(f.controls.reader.getSnapshot().context?.compactionPercent).toBe(60)
    expect(f.errors).toEqual([])
  } finally {
    f.dispose()
  }
})

test('rapid refreshes have bounded actual requests, coalesce queued work and keep only the latest result', async () => {
  const pending: { id: string; value: ReturnType<typeof Promise.withResolvers<unknown>> }[] = []
  let active = 0,
    maximum = 0
  const f = fixture(async (id) => {
    active += 1
    maximum = Math.max(maximum, active)
    const value = Promise.withResolvers<unknown>()
    pending.push({ id, value })
    try {
      return await value.promise
    } finally {
      active -= 1
    }
  })
  try {
    await waitFor(() => pending.length === 1)
    const firstRefresh = f.controls.refreshContext('one')
    await waitFor(() => pending.length === 2)
    const refreshes = [firstRefresh, ...Array.from({ length: 40 }, () => f.controls.refreshContext('one'))]
    expect(maximum).toBeLessThanOrEqual(2)
    for (const job of pending) job.value.resolve(context(job.id, 1_000))
    await waitFor(() => pending.length === 3)
    pending[2]?.value.resolve(context('one', 78_000))
    await Promise.all(refreshes)
    expect(maximum).toBeLessThanOrEqual(2)
    expect(pending).toHaveLength(3)
    expect(f.controls.reader.getSnapshot().context?.inputTokens).toBe(78_000)
  } finally {
    for (const job of pending) job.value.resolve(context(job.id, 0))
    f.dispose()
  }
})

test('invalid replies and disconnects clear stale occupancy, retry and reconnect recover; disposal releases pending reads', async () => {
  let result: unknown = context('wrong-session', 100)
  const f = fixture(async () => result)
  try {
    await waitFor(() => f.controls.reader.getSnapshot().contextStatus === 'error')
    expect(f.controls.reader.getSnapshot().errors.context).toBe('INVALID_OUTPUT')
    expect(f.controls.reader.getSnapshot().context).toBeNull()
    result = context('one', 1_000)
    await f.controls.refreshContext('one')
    expect(f.controls.reader.getSnapshot().context?.inputTokens).toBe(1_000)
    f.controls.setConnected(false)
    expect(f.controls.reader.getSnapshot().context).toBeNull()
    expect(f.controls.reader.getSnapshot().errors.context).toBe('DISCONNECTED')
    result = context('one', 2_000)
    f.controls.setConnected(true)
    await waitFor(() => f.controls.reader.getSnapshot().context?.inputTokens === 2_000)
    expect(f.errors).toEqual([])
  } finally {
    f.dispose()
  }
  const delayed = Promise.withResolvers<unknown>()
  let aborted: AbortSignal | undefined
  const other = fixture(async (_id, options) => {
    aborted = options?.signal
    return delayed.promise
  })
  await waitFor(() => !!aborted)
  other.dispose()
  expect(aborted?.aborted).toBe(true)
  delayed.resolve(context('one', 999))
  await Bun.sleep(2)
  expect(other.controls.reader.getSnapshot().context).toBeNull()
})
