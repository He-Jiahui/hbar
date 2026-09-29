import { expect, test } from 'bun:test'
import { CommandError, type ExecuteOptions } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import { activeOperationsInputSchema, type ActiveOperationsPage } from '@hbar/contracts/commands/run'
import type { Session, Workspace } from '@hbar/contracts/directory'

const workspace: Workspace = {
  id: 'workspace',
  path: 'D:/workspace',
  name: 'Workspace',
  createdAt: 1,
}

const sessions: readonly Session[] = [
  {
    id: 'session-a',
    workspaceId: workspace.id,
    title: 'Session A',
    archived: false,
    parentId: null,
    createdAt: 2,
    updatedAt: 3,
    seq: 4,
  },
  {
    id: 'session-b',
    workspaceId: workspace.id,
    title: 'Session B',
    archived: false,
    parentId: null,
    createdAt: 4,
    updatedAt: 5,
    seq: 6,
  },
]

type ActivityItem = ActiveOperationsPage['items'][number]
type ReadInput = ReturnType<typeof activeOperationsInputSchema.parse>

function item(index: number, status: ActivityItem['status'] = 'running'): ActivityItem {
  return {
    operationId: `run-${index}`,
    status,
    createdAt: index,
    startedAt: index,
  }
}

function page(
  sessionId: string,
  sessionSeq: number,
  items: readonly ActivityItem[],
  totalActive = items.length,
  nextCursor: ActiveOperationsPage['nextCursor'] = null,
): ActiveOperationsPage {
  return { sessionId, sessionSeq, items: [...items], totalActive, nextCursor }
}

function fixture(
  respond: (input: ReadInput, execution: ExecuteOptions | undefined) => Promise<unknown> | unknown,
  renderable: readonly string[] = ['activity'],
) {
  const calls: Array<{ readonly input: ReadInput; readonly signal?: AbortSignal }> = []
  const runtime = createAppRuntime({
    instanceId: 'activity-workspace',
    hostId: 'activity-workspace-test',
    directory: {
      async execute(name: string, raw: unknown) {
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        if (name === 'workspace.get') return workspace
        if (name === 'session.list') return { items: sessions, nextCursor: null }
        if (name === 'session.get') {
          const input = raw as { readonly sessionId?: unknown }
          return sessions.find((session) => session.id === input.sessionId) ?? null
        }
        throw new Error(`Unexpected directory command: ${name}`)
      },
    },
    run: {
      async execute(name: string, raw: unknown, execution?: ExecuteOptions) {
        if (name !== 'session.activeOperations') throw new Error(`Unexpected Run command: ${name}`)
        const input = activeOperationsInputSchema.parse(raw)
        calls.push({ input, ...(execution?.signal ? { signal: execution.signal } : {}) })
        return respond(input, execution)
      },
      async getReceipt() {
        return null
      },
    },
    surfaces: { canRender: (panelId) => renderable.includes(panelId) },
  })

  async function open(sessionId = sessions[0]!.id, panelId: 'activity' | 'goals' = 'activity') {
    await runtime.view.commands.execute('app.setSession', { sessionId, workspaceId: workspace.id })
    const tab = runtime.view.state.workspaceTabs
      .getSnapshot()
      .items.find((entry) => entry.kind === 'session' && entry.sessionId === sessionId)
    if (!tab || tab.kind !== 'session') throw new Error(`Missing selected tab for ${sessionId}`)
    return runtime.view.commands.execute('sessionTools.open', {
      panelId,
      workspaceId: workspace.id,
      sessionId,
      sourceTabInstanceKey: tab.instanceKey,
    })
  }

  return { runtime, calls, open }
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error('Activity workspace state did not settle')
}

test('Activity refresh distinguishes a confirmed empty Host page from loading and query errors, with retry', async () => {
  let attempt = 0
  const example = fixture(() => {
    attempt += 1
    if (attempt === 1) throw new CommandError('DISCONNECTED', 'Host is disconnected')
    return page('session-a', 7, [])
  })

  try {
    await example.runtime.ready
    const opened = await example.open()
    const refresh = example.runtime.view.commands.execute('activityWorkspace.refresh', {
      instanceId: opened.instanceId,
    })
    expect(example.runtime.view.state.activity.getSnapshot().entries[opened.instanceId]).toMatchObject({
      status: 'loading',
      sessionId: 'session-a',
      items: [],
      totalActive: 0,
      error: null,
    })
    await expect(refresh).rejects.toMatchObject({ code: 'DISCONNECTED' })
    expect(example.runtime.view.state.activity.getSnapshot().entries[opened.instanceId]).toMatchObject({
      status: 'error',
      items: [],
      error: 'DISCONNECTED',
    })

    await example.runtime.view.commands.execute('activityWorkspace.refresh', { instanceId: opened.instanceId })
    expect(example.runtime.view.state.activity.getSnapshot().entries[opened.instanceId]).toMatchObject({
      status: 'ready',
      sessionId: 'session-a',
      sessionSeq: 7,
      items: [],
      totalActive: 0,
      nextCursor: null,
      error: null,
    })
    expect(attempt).toBe(2)
  } finally {
    example.runtime.dispose()
  }
})

test('Activity pages the complete active operation set using the Host cursor and session revision', async () => {
  const all = Array.from({ length: 105 }, (_, index) => item(index, index === 3 ? 'cancelRequested' : 'running'))
  const example = fixture((input) => {
    if (!input.cursor)
      return page('session-a', 11, all.slice(0, 100), all.length, {
        afterOperationId: all[99]!.operationId,
        sessionSeq: 11,
      })
    return page('session-a', 11, all.slice(100), all.length)
  })

  try {
    await example.runtime.ready
    const opened = await example.open()
    await example.runtime.view.commands.execute('activityWorkspace.refresh', { instanceId: opened.instanceId })
    const first = example.runtime.view.state.activity.getSnapshot().entries[opened.instanceId]
    expect(first).toMatchObject({
      status: 'ready',
      totalActive: 105,
      sessionSeq: 11,
      nextCursor: { afterOperationId: 'run-99', sessionSeq: 11 },
      items: all.slice(0, 100),
    })
    expect(example.calls[0]?.input).toEqual({ sessionId: 'session-a', limit: 100 })

    await example.runtime.view.commands.execute('activityWorkspace.loadMore', { instanceId: opened.instanceId })
    const complete = example.runtime.view.state.activity.getSnapshot().entries[opened.instanceId]
    expect(complete).toMatchObject({ status: 'ready', totalActive: 105, sessionSeq: 11, nextCursor: null })
    expect(complete?.items).toEqual(all)
    expect(complete?.items[3]?.status).toBe('cancelRequested')
    expect(example.calls[1]?.input).toEqual({
      sessionId: 'session-a',
      cursor: { afterOperationId: 'run-99', sessionSeq: 11 },
      limit: 100,
    })
    await expect(
      example.runtime.view.commands.execute('activityWorkspace.loadMore', { instanceId: opened.instanceId }),
    ).rejects.toMatchObject({ code: 'NOT_READY' })
  } finally {
    example.runtime.dispose()
  }
})

test('Activity rejects a page from another session and recovers only after an explicit refresh', async () => {
  let attempt = 0
  const example = fixture(() => {
    attempt += 1
    return attempt === 1 ? page('session-b', 8, []) : page('session-a', 9, [])
  })

  try {
    await example.runtime.ready
    const opened = await example.open()
    await expect(
      example.runtime.view.commands.execute('activityWorkspace.refresh', { instanceId: opened.instanceId }),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
    expect(example.runtime.view.state.activity.getSnapshot().entries[opened.instanceId]).toMatchObject({
      status: 'error',
      sessionId: 'session-a',
      items: [],
      error: 'INVALID_OUTPUT',
    })

    await example.runtime.view.commands.execute('activityWorkspace.refresh', { instanceId: opened.instanceId })
    expect(example.runtime.view.state.activity.getSnapshot().entries[opened.instanceId]).toMatchObject({
      status: 'ready',
      sessionId: 'session-a',
      sessionSeq: 9,
      totalActive: 0,
      error: null,
    })
  } finally {
    example.runtime.dispose()
  }
})

test('Activity invalidates a paged snapshot when Host revision changes between pages', async () => {
  const operations = Array.from({ length: 101 }, (_, index) => item(index))
  const example = fixture((input) =>
    input.cursor
      ? page('session-a', 13, operations.slice(100), operations.length)
      : page('session-a', 12, operations.slice(0, 100), operations.length, {
          afterOperationId: operations[99]!.operationId,
          sessionSeq: 12,
        }),
  )

  try {
    await example.runtime.ready
    const opened = await example.open()
    await example.runtime.view.commands.execute('activityWorkspace.refresh', { instanceId: opened.instanceId })
    await expect(
      example.runtime.view.commands.execute('activityWorkspace.loadMore', { instanceId: opened.instanceId }),
    ).rejects.toMatchObject({ code: 'ACTIVITY_CHANGED' })
    expect(example.runtime.view.state.activity.getSnapshot().entries[opened.instanceId]).toMatchObject({
      status: 'error',
      sessionId: 'session-a',
      sessionSeq: null,
      items: [],
      totalActive: 0,
      nextCursor: null,
      error: 'ACTIVITY_CHANGED',
    })
  } finally {
    example.runtime.dispose()
  }
})

test('Activity applies a late Host response to neither a hidden panel nor the newly selected session', async () => {
  const pending = Promise.withResolvers<unknown>()
  const example = fixture((input) => (input.sessionId === 'session-a' ? pending.promise : page('session-b', 20, [])))

  try {
    await example.runtime.ready
    const opened = await example.open('session-a')
    const oldRead = example.runtime.view.commands.execute('activityWorkspace.refresh', {
      instanceId: opened.instanceId,
    })
    await waitFor(() => example.calls.length === 1)
    await example.runtime.view.commands.execute('app.setSession', { sessionId: 'session-b', workspaceId: workspace.id })
    await expect(oldRead).rejects.toMatchObject({ code: 'QUERY_SUPERSEDED' })
    expect(example.runtime.view.state.activity.getSnapshot().entries[opened.instanceId]).toBeUndefined()

    pending.resolve(page('session-a', 21, [item(700)]))
    await Bun.sleep(0)
    expect(example.runtime.view.state.activity.getSnapshot().entries[opened.instanceId]).toBeUndefined()

    const next = await example.open('session-b')
    await example.runtime.view.commands.execute('activityWorkspace.refresh', { instanceId: next.instanceId })
    expect(example.runtime.view.state.activity.getSnapshot().entries[next.instanceId]).toMatchObject({
      status: 'ready',
      sessionId: 'session-b',
      items: [],
      totalActive: 0,
    })
  } finally {
    example.runtime.dispose()
  }
})

test('Activity requires its own visible session-tool surface', async () => {
  const example = fixture(() => page('session-a', 1, []), ['activity', 'goals'])

  try {
    await example.runtime.ready
    const opened = await example.open('session-a', 'goals')
    await expect(
      example.runtime.view.commands.execute('activityWorkspace.refresh', { instanceId: opened.instanceId }),
    ).rejects.toMatchObject({ code: 'STALE_TARGET' })
    expect(example.calls).toHaveLength(0)
    expect(example.runtime.view.state.activity.getSnapshot().entries).toEqual({})
  } finally {
    example.runtime.dispose()
  }
})

test('Activity pagination is bounded to ten explicit pages', async () => {
  const total = 1_001
  const example = fixture((input) => {
    const afterIndex = input.cursor ? Number(input.cursor.afterOperationId.replace('run-', '')) : -1
    const start = afterIndex + 1
    const items = Array.from({ length: Math.min(100, total - start) }, (_, offset) => item(start + offset))
    const next = start + items.length < total ? { afterOperationId: items.at(-1)!.operationId, sessionSeq: 30 } : null
    return page('session-a', 30, items, total, next)
  })

  try {
    await example.runtime.ready
    const opened = await example.open()
    await example.runtime.view.commands.execute('activityWorkspace.refresh', { instanceId: opened.instanceId })
    for (let count = 0; count < 9; count += 1)
      await example.runtime.view.commands.execute('activityWorkspace.loadMore', { instanceId: opened.instanceId })

    const entry = example.runtime.view.state.activity.getSnapshot().entries[opened.instanceId]
    expect(entry).toMatchObject({ status: 'ready', totalActive: total, limitReached: true })
    expect(entry?.items).toHaveLength(1_000)
    expect(entry?.nextCursor).toEqual({ afterOperationId: 'run-999', sessionSeq: 30 })
    await expect(
      example.runtime.view.commands.execute('activityWorkspace.loadMore', { instanceId: opened.instanceId }),
    ).rejects.toMatchObject({ code: 'CAPACITY_EXCEEDED' })
    expect(example.calls).toHaveLength(10)
  } finally {
    example.runtime.dispose()
  }
})
