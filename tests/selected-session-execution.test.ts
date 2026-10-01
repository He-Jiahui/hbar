import { expect, test } from 'bun:test'
import { CommandRegistry, createCommandClient } from '@hbar/commands'
import { createState } from '../packages/app-runtime/src/state'
import {
  createSelectedSessionExecution,
  selectedSessionExecutionCommands,
} from '../packages/app-runtime/src/selected-session-execution'
import type { ComposerIntentState } from '../packages/app-runtime/src/composer-intent'
import type { NavigationState, PresentationState } from '../packages/app-runtime/src/types'
import type { SessionExecutionSnapshot } from '@hbar/contracts/sidebar-directory'
import { goalPlanSnapshotSchema } from '@hbar/contracts/commands/goals'
import { getShellCopy } from '../apps/web/src/shell-copy'

function deferred() {
  let resolve!: (snapshot: SessionExecutionSnapshot) => void
  return {
    promise: new Promise<SessionExecutionSnapshot>((done) => {
      resolve = done
    }),
    resolve: (value: SessionExecutionSnapshot) => resolve(value),
  }
}
function snapshot(sessionId = 'a', revision = 1, active = 0): SessionExecutionSnapshot {
  return {
    sessionId,
    workspaceId: 'w',
    revision,
    execution: { state: active ? 'running' : 'idle', activeCount: active, queuedCount: 0 },
  }
}

test('execution read and local recovery copy remain host-localized', () => {
  const zh = getShellCopy('zh-CN'),
    en = getShellCopy('en-US')
  expect(zh.session.intent.executionChecking).toBe('核对活动中')
  expect(zh.session.intent.retryExecution).toBe('重试读取活动')
  expect(en.session.intent.executionReadFailed).toBe('Background activity could not be confirmed.')
  expect(zh.commandPalette.resolve('commands.session.execution.get.title')).toBe('读取会话运行状态')
  expect(en.commandPalette.resolve('commands.session.execution.get.description')).not.toContain('commands.')
})
async function settle(predicate: () => boolean) {
  for (let index = 0; index < 100; index++) {
    if (predicate()) return
    await Bun.sleep(5)
  }
  throw new Error('Execution projection did not settle')
}
function fixture() {
  const errors: unknown[] = []
  const onError = (reason: unknown) => errors.push(reason)
  const local = new CommandRegistry({ execution: 'client' })
  const navigation = createState<NavigationState>(
    { sessionId: 'a', workspaceId: 'w', status: 'idle', error: null },
    onError,
  )
  const presentation = createState<PresentationState>(
    { page: { kind: 'session' }, toolInstanceId: null, modalInstanceId: null, returnContext: null, sidebarOpen: true },
    onError,
  )
  const goals = createState<ComposerIntentState>(
    {
      entries: {},
      facts: {
        sessionId: 'a',
        status: 'ready',
        error: null,
        snapshot: goalPlanSnapshotSchema.parse({
          sessionId: 'a',
          goalSeq: 1,
          planSeq: 1,
          remainingTokens: null,
          goal: {
            threadId: 'a',
            goalId: 'goal-a',
            objective: 'A real Goal fact',
            status: 'paused',
            tokenBudget: null,
            tokensUsed: 0,
            timeUsedSeconds: 0,
            createdAt: 1,
            updatedAt: 1,
          },
          plan: null,
        }),
      },
    },
    onError,
  )
  const listeners = new Set<() => void>()
  const connections = new Set<(value: boolean) => void>()
  const reads: { sessionId: string; signal?: AbortSignal }[] = []
  let execute: (sessionId: string) => Promise<SessionExecutionSnapshot> = async (id) => snapshot(id)
  const owner = createSelectedSessionExecution(local, {
    navigation: navigation.reader,
    presentation: presentation.reader,
    goals: goals.reader,
    queries: {
      async execute(name, raw, options) {
        expect(name).toBe('session.execution.get')
        const sessionId = (raw as { sessionId: string }).sessionId
        reads.push({ sessionId, ...(options?.signal ? { signal: options.signal } : {}) })
        return execute(sessionId)
      },
    },
    events: {
      subscribe(listener) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      onConnection(listener) {
        connections.add(listener)
        return () => {
          connections.delete(listener)
        }
      },
    },
    onSubscriberError: onError,
  })
  return {
    owner,
    reads,
    navigation,
    presentation,
    goals,
    listeners,
    connections,
    commands: createCommandClient(selectedSessionExecutionCommands, local),
    respond(fn: typeof execute) {
      execute = fn
    },
    hint() {
      for (const listener of listeners) listener()
    },
    connection(value: boolean) {
      for (const listener of connections) listener(value)
    },
    select(id: string) {
      navigation.replace({ ...navigation.reader.getSnapshot(), sessionId: id })
      const before = goals.reader.getSnapshot()
      goals.replace({
        ...before,
        facts: {
          ...before.facts,
          sessionId: id,
          snapshot: before.facts.snapshot ? { ...before.facts.snapshot, sessionId: id } : null,
        },
      })
    },
    dispose() {
      owner.dispose()
      local.dispose()
      navigation.dispose()
      presentation.dispose()
      goals.dispose()
      expect(errors).toEqual([])
    },
  }
}

test('selected Goal reads exact Session activity, coalesces hints and clears settled background work', async () => {
  const f = fixture()
  try {
    await settle(() => f.owner.reader.getSnapshot().status === 'ready')
    expect(f.reads.map((read) => read.sessionId)).toEqual(['a'])
    f.respond(async (id) => snapshot(id, 2, 1))
    for (let index = 0; index < 10; index++) f.hint()
    await settle(() => f.owner.reader.getSnapshot().snapshot?.revision === 2)
    expect(f.reads).toHaveLength(2)
    expect(f.owner.reader.getSnapshot().snapshot?.execution.activeCount).toBe(1)
    f.respond(async (id) => snapshot(id, 3))
    await f.commands.execute('selectedSessionExecution.refresh', { sessionId: 'a', workspaceId: 'w' })
    expect(f.owner.reader.getSnapshot().snapshot?.execution.state).toBe('idle')
    await expect(
      f.commands.execute('selectedSessionExecution.refresh', { sessionId: 'b', workspaceId: 'w' }),
    ).rejects.toMatchObject({ code: 'TARGET_CHANGED' })
  } finally {
    f.dispose()
  }
})

test('old ignored-abort reads cannot cross Session or page ownership; reconnect starts a fresh read', async () => {
  const f = fixture(),
    old = deferred()
  try {
    await settle(() => f.owner.reader.getSnapshot().status === 'ready')
    f.respond(() => old.promise)
    const refreshing = f.commands
      .execute('selectedSessionExecution.refresh', { sessionId: 'a', workspaceId: 'w' })
      .catch((reason: unknown) => reason)
    await settle(() => f.reads.length === 2)
    f.respond(async (id) => snapshot(id, 4))
    f.select('b')
    expect(f.reads[1]?.signal?.aborted).toBe(true)
    await settle(() => f.owner.reader.getSnapshot().snapshot?.sessionId === 'b')
    old.resolve(snapshot('a', 8, 1))
    expect(await refreshing).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(f.owner.reader.getSnapshot().snapshot).toEqual(snapshot('b', 4))
    f.presentation.replace({
      ...f.presentation.reader.getSnapshot(),
      page: { kind: 'settings', instanceId: 'settings' },
    })
    expect(f.owner.reader.getSnapshot()).toMatchObject({ target: null, status: 'idle', snapshot: null })
    f.connection(false)
    f.presentation.replace({ ...f.presentation.reader.getSnapshot(), page: { kind: 'session' } })
    expect(f.owner.reader.getSnapshot().snapshot).toBeNull()
    f.connection(true)
    await settle(() => f.owner.reader.getSnapshot().snapshot?.sessionId === 'b')
  } finally {
    old.resolve(snapshot())
    f.dispose()
  }
})

test('read errors are local, retryable and never preserve a false active result or accept another target', async () => {
  const f = fixture()
  try {
    await settle(() => f.owner.reader.getSnapshot().status === 'ready')
    f.respond(async (id) => snapshot(id, 2, 1))
    await f.commands.execute('selectedSessionExecution.refresh', { sessionId: 'a', workspaceId: 'w' })
    f.respond(async () => {
      throw new Error('transport failed')
    })
    await f.commands.execute('selectedSessionExecution.refresh', { sessionId: 'a', workspaceId: 'w' })
    expect(f.owner.reader.getSnapshot()).toMatchObject({ status: 'error', snapshot: null, error: 'READ_FAILED' })
    f.respond(async (id) => snapshot(id, 1, 1))
    await f.commands.execute('selectedSessionExecution.refresh', { sessionId: 'a', workspaceId: 'w' })
    expect(f.owner.reader.getSnapshot()).toMatchObject({ status: 'error', snapshot: null, error: 'STALE_SNAPSHOT' })
    f.respond(async () => snapshot('foreign', 3))
    await f.commands.execute('selectedSessionExecution.refresh', { sessionId: 'a', workspaceId: 'w' })
    expect(f.owner.reader.getSnapshot()).toMatchObject({ status: 'error', snapshot: null, error: 'INVALID_OUTPUT' })
    f.respond(async (id) => snapshot(id, 3))
    await f.commands.execute('selectedSessionExecution.refresh', { sessionId: 'a', workspaceId: 'w' })
    expect(f.owner.reader.getSnapshot()).toMatchObject({ status: 'ready', snapshot: snapshot('a', 3) })
  } finally {
    f.dispose()
  }
})

test('timeout releases logical UI loading without reviving a late transport result', async () => {
  const f = fixture(),
    pending = deferred()
  try {
    await settle(() => f.owner.reader.getSnapshot().status === 'ready')
    f.respond(() => pending.promise)
    await f.commands.execute('selectedSessionExecution.refresh', { sessionId: 'a', workspaceId: 'w' })
    expect(f.owner.reader.getSnapshot()).toMatchObject({ status: 'error', snapshot: null, error: 'TIMEOUT' })
    pending.resolve(snapshot('a', 7, 1))
    await Bun.sleep(0)
    expect(f.owner.reader.getSnapshot()).toMatchObject({ status: 'error', snapshot: null, error: 'TIMEOUT' })
    f.respond(async (id) => snapshot(id, 8))
    await f.commands.execute('selectedSessionExecution.refresh', { sessionId: 'a', workspaceId: 'w' })
    expect(f.owner.reader.getSnapshot().snapshot).toEqual(snapshot('a', 8))
  } finally {
    pending.resolve(snapshot())
    f.dispose()
  }
}, 10_000)

test('transports ignoring cancellation retain at most two physical reads during rapid switching', async () => {
  const f = fixture(),
    a = deferred(),
    b = deferred()
  try {
    await settle(() => f.owner.reader.getSnapshot().status === 'ready')
    f.respond((id) => (id === 'a' ? a.promise : b.promise))
    const refreshing = f.commands
      .execute('selectedSessionExecution.refresh', { sessionId: 'a', workspaceId: 'w' })
      .catch((reason: unknown) => reason)
    await settle(() => f.reads.length === 2)
    f.select('b')
    await settle(() => f.reads.length === 3)
    f.select('c')
    await settle(() => f.owner.reader.getSnapshot().error === 'CAPACITY_EXCEEDED')
    expect(f.reads).toHaveLength(3)
    f.respond(async (id) => snapshot(id, 6))
    a.resolve(snapshot('a', 2, 1))
    expect(await refreshing).toMatchObject({ code: 'RESULT_UNKNOWN' })
    await settle(() => f.owner.reader.getSnapshot().snapshot?.sessionId === 'c')
    expect(f.owner.reader.getSnapshot().snapshot).toEqual(snapshot('c', 6))
    b.resolve(snapshot('b', 8, 1))
    await Bun.sleep(0)
    expect(f.owner.reader.getSnapshot().snapshot).toEqual(snapshot('c', 6))
  } finally {
    a.resolve(snapshot())
    b.resolve(snapshot('b'))
    f.dispose()
  }
})
