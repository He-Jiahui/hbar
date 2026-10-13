import { expect, test } from 'bun:test'
import { createAppRuntime, createSessionRequestContext, type SessionTimelineState } from '@hbar/app-runtime'
import { usageExportInputSchema } from '@hbar/contracts/commands/usage'
import { createSessionRequests } from '../packages/app-runtime/src/session-requests'
import { createState } from '../packages/app-runtime/src/state'
import { sessionRequestAttempt, sessionRequestExport, sessionRequestMessage } from './fixtures/session-request-fixtures'

test('session pane readers keep immutable exact targets independent of global usage and other panes', async () => {
  const scopes: unknown[] = []
  const queries: Array<ReturnType<typeof usageExportInputSchema.parse>> = []
  const runtime = createAppRuntime({
    instanceId: 'requests',
    hostId: 'host',
    directory: {
      async execute() {
        return { items: [], nextCursor: null }
      },
    },
    usage: {
      async execute(_name, raw) {
        const input = usageExportInputSchema.parse(raw)
        queries.push(input)
        scopes.push(input.scope)
        const id = input.scope.kind === 'session' ? input.scope.sessionId : 'global'
        return sessionRequestExport(input.scope, [sessionRequestAttempt(id, id)])
      },
    },
  })
  const first = runtime.view.state.sessionRequests.create('session-A')
  const second = runtime.view.state.sessionRequests.create('session-B')
  try {
    await Promise.all([first.refresh(), second.refresh()])
    expect(first.reader.getSnapshot().items[0]?.sessionId).toBe('session-A')
    expect(second.reader.getSnapshot().items[0]?.sessionId).toBe('session-B')
    expect('setScope' in first).toBe(false)
    expect(queries.slice(0, 2).every((query) => query.from === 0 && query.order === 'desc' && query.limit === 50)).toBe(
      true,
    )
    expect(scopes).toEqual([
      { kind: 'session', sessionId: 'session-A', includeDescendants: false },
      { kind: 'session', sessionId: 'session-B', includeDescendants: false },
    ])
    expect(runtime.view.state.usageRequests.reader.getSnapshot().scope).toEqual({ kind: 'global' })
    await runtime.view.state.usageRequests.runtime.setScope({ kind: 'workspace', workspaceId: 'workspace-B' })
    expect(first.reader.getSnapshot().scope).toEqual({
      kind: 'session',
      sessionId: 'session-A',
      includeDescendants: false,
    })
    first.dispose()
    await expect(first.refresh()).rejects.toMatchObject({ code: 'DISPOSED' })
    await second.refresh()
    expect(second.reader.getSnapshot().status).toBe('ready')
  } finally {
    runtime.dispose()
  }
  await expect(second.refresh()).rejects.toMatchObject({ code: 'DISPOSED' })
  expect(() => runtime.view.state.sessionRequests.create('after-dispose')).toThrow()
})

test('closing a pane aborts its export and fences a late response while another pane remains usable', async () => {
  let finish: ((value: unknown) => void) | undefined
  let signal: AbortSignal | undefined
  const owners = createSessionRequests({
    usage: {
      async execute(_name, raw, options) {
        const input = usageExportInputSchema.parse(raw)
        if (input.scope.kind === 'session' && input.scope.sessionId === 'session-A') {
          signal = options?.signal
          return await new Promise((resolve) => {
            finish = resolve
          })
        }
        return sessionRequestExport(input.scope, [sessionRequestAttempt('B', 'session-B')])
      },
    },
  })
  const first = owners.create('session-A')
  const second = owners.create('session-B')
  const pending = first.refresh()
  let changes = 0
  first.reader.subscribe(() => {
    changes++
  })
  first.dispose()
  expect(signal?.aborted).toBe(true)
  finish?.(
    sessionRequestExport({ kind: 'session', sessionId: 'session-A', includeDescendants: false }, [
      sessionRequestAttempt('late'),
    ]),
  )
  await pending
  expect(first.reader.getSnapshot().items).toEqual([])
  expect(changes).toBe(0)
  await second.refresh()
  expect(second.reader.getSnapshot().items[0]?.sessionId).toBe('session-B')
  owners.dispose()
})

test('session request failures recover locally and reject a mismatched Host scope', async () => {
  let calls = 0
  const owners = createSessionRequests({
    usage: {
      async execute(_name, raw) {
        const input = usageExportInputSchema.parse(raw)
        calls++
        if (calls === 1) throw new Error('offline')
        if (calls === 2)
          return sessionRequestExport({ kind: 'session', sessionId: 'foreign', includeDescendants: false })
        if (calls === 3) return sessionRequestExport(input.scope, [sessionRequestAttempt('foreign-row', 'session-B')])
        return sessionRequestExport(input.scope, [sessionRequestAttempt('confirmed')])
      },
    },
  })
  const requests = owners.create('session-A')
  try {
    await requests.refresh()
    expect(requests.reader.getSnapshot().status).toBe('error')
    await requests.refresh()
    expect(requests.reader.getSnapshot().error).toBe('INVALID_OUTPUT')
    expect(requests.reader.getSnapshot().items).toEqual([])
    await requests.refresh()
    expect(requests.reader.getSnapshot().error).toBe('INVALID_OUTPUT')
    expect(requests.reader.getSnapshot().items).toEqual([])
    await requests.refresh()
    expect(requests.reader.getSnapshot().items[0]?.id).toBe('confirmed')
  } finally {
    owners.dispose()
  }
})

test('request history keeps a Host gap visible through pagination until a complete refresh', async () => {
  let calls = 0
  const owners = createSessionRequests({
    usage: {
      async execute(_name, raw) {
        const input = usageExportInputSchema.parse(raw)
        calls++
        return {
          ...sessionRequestExport(input.scope, [sessionRequestAttempt(`usage-${calls}`)]),
          gap: calls === 1,
          ...(calls === 1 ? { nextCursor: 'older' } : {}),
        }
      },
    },
  })
  const requests = owners.create('session-A')
  try {
    await requests.refresh()
    expect(requests.reader.getSnapshot().gap).toBe(true)
    await requests.loadMore()
    expect(requests.reader.getSnapshot().items).toHaveLength(2)
    expect(requests.reader.getSnapshot().gap).toBe(true)
    await requests.refresh()
    expect(requests.reader.getSnapshot().gap).toBe(false)
  } finally {
    owners.dispose()
  }
})

test('request context ignores streaming frames and foreign usage but publishes owned usage and original messages', () => {
  const initial: SessionTimelineState = {
    sessionId: 'session-A',
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
    toolOutputs: {},
    events: [],
    cursor: 0,
    hasOlder: false,
    error: null,
  }
  const state = createState(initial, () => {})
  const context = createSessionRequestContext(state.reader, 'session-A')
  const first = context.getSnapshot()
  let changed = 0
  const unsubscribe = context.subscribe(() => {
    changed++
  })
  state.replace({ ...initial, cursor: 1, streams: {} })
  expect(context.getSnapshot()).toBe(first)
  const event = {
    eventId: 'u',
    sessionId: 'foreign',
    seq: 2,
    runId: null,
    stepId: null,
    type: 'usage.recorded',
    data: {},
    time: 2,
    version: 1 as const,
  }
  state.replace({ ...initial, events: [event] })
  expect(changed).toBe(0)
  state.replace({ ...initial, events: [{ ...event, sessionId: 'session-A' }] })
  expect(context.getSnapshot().revision).toBe(2)
  expect(changed).toBe(1)
  const messages = [sessionRequestMessage('original')]
  state.replace({ ...state.reader.getSnapshot(), messages })
  expect(context.getSnapshot().messages).toBe(messages)
  expect(changed).toBe(2)
  state.replace({ ...initial, sessionId: 'session-B', messages: [sessionRequestMessage('foreign')] })
  expect(context.getSnapshot().messages).toBeNull()
  expect(context.getSnapshot().revision).toBe(0)
  unsubscribe()
  state.dispose()
})
