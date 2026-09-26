import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry, type CommandExecutor } from '@hbar/commands'
import { createDirectoryModule } from '../packages/app-runtime/src/directory'
import {
  createSessionRosterRefresh,
  sessionRosterRefreshCommands,
} from '../packages/app-runtime/src/session-roster-refresh'
import { createState } from '../packages/app-runtime/src/state'
import type { DirectoryState, NavigationState } from '@hbar/app-runtime'

const workspace = { id: 'project-a', path: 'D:/fixture/project-a', name: 'Project A', createdAt: 1 }
function session(
  id: string,
  change: Partial<DirectoryState['sessions'][string]> = {},
): DirectoryState['sessions'][string] {
  return {
    id,
    workspaceId: workspace.id,
    title: id,
    archived: false,
    parentId: null,
    createdAt: 1,
    updatedAt: 2,
    seq: 0,
    ...change,
  }
}
function fixture(host: CommandExecutor, timeoutMs?: number) {
  const navigation = createState<NavigationState>(
    { workspaceId: workspace.id, sessionId: 'active', status: 'idle', error: null },
    (error) => {
      throw error
    },
  )
  const unavailable: string[] = []
  const directory = createDirectoryModule(
    { instanceId: 'roster-fixture', hostId: 'fixture-host', directory: host },
    navigation.reader,
    (id) => unavailable.push(id),
    (error) => {
      throw error
    },
  )
  const registry = new CommandRegistry({ execution: 'client' })
  const refresh = createSessionRosterRefresh(registry, {
    host,
    subscribeConfirmedSessions: directory.subscribeConfirmedSessions,
    directory: directory.reader,
    reconcile: directory.reconcileRosterSessions,
    onSubscriberError: (error) => {
      throw error
    },
    isDisposed: () => false,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  })
  return {
    navigation,
    unavailable,
    directory,
    refresh,
    registry,
    async ready(items: readonly DirectoryState['sessions'][string][] = []) {
      await directory.queries.execute('workspace.list', {})
      directory.reconcileRosterSessions(items, [])
    },
    dispose() {
      refresh.dispose()
      registry.dispose()
      directory.dispose()
      navigation.dispose()
    },
  }
}
function hostPort(read: (name: string, input: unknown) => Promise<unknown>): CommandExecutor {
  return {
    execute: (name, input) =>
      name === 'workspace.list' ? Promise.resolve({ items: [workspace], nextCursor: null }) : read(name, input),
  }
}

test('roster reads are internal, workspace scoped and bounded; invalidation is not a session mutation', () => {
  expect(sessionRosterRefreshCommands['sessionRoster.refresh'].metadata).toMatchObject({
    scope: 'workspace',
    kind: 'query',
    execution: 'client',
    visibility: 'internal',
    maxConcurrent: 8,
  })
  expect(sessionRosterRefreshCommands['sessionRoster.invalidate'].metadata).toMatchObject({
    stateEffect: 'application',
    visibility: 'internal',
  })
})

test('first-page absence preserves later loaded members; true get refreshes rename/archive without clearing active selection', async () => {
  const reads: string[] = []
  const testbed = fixture(
    hostPort(async (name, input) => {
      if (name === 'session.list') return { items: [session('new')], nextCursor: null }
      const id = (input as { sessionId: string }).sessionId
      reads.push(id)
      return session(id, { title: `${id} updated`, archived: id === 'active', seq: 2, updatedAt: 3 })
    }),
  )
  try {
    await testbed.ready([session('active'), session('later-page')])
    await testbed.registry.execute('sessionRoster.refresh', { workspaceId: workspace.id })
    expect(reads.sort()).toEqual(['active', 'later-page'])
    expect(testbed.directory.reader.getSnapshot().sessions['later-page']?.title).toBe('later-page updated')
    expect(testbed.directory.reader.getSnapshot().sessions.active?.archived).toBe(true)
    expect(testbed.navigation.reader.getSnapshot().sessionId).toBe('active')
    expect(testbed.unavailable).toEqual([])
    expect(testbed.refresh.reader.getSnapshot().entries[workspace.id]).toMatchObject({
      status: 'ready',
      remaining: 0,
      checked: 2,
    })
  } finally {
    testbed.dispose()
  }
})

test('session.get failures are not absence, expose partial error, and preserve original member', async () => {
  const testbed = fixture(
    hostPort(async (name) => {
      if (name === 'session.list') return { items: [session('new')], nextCursor: null }
      throw new CommandError('CONNECTION_CLOSED', 'offline')
    }),
  )
  try {
    await testbed.ready([session('old')])
    await expect(
      testbed.registry.execute('sessionRoster.refresh', { workspaceId: workspace.id }),
    ).rejects.toMatchObject({ code: 'CONNECTION_CLOSED' })
    expect(Object.keys(testbed.directory.reader.getSnapshot().sessions).sort()).toEqual(['new', 'old'])
    expect(testbed.refresh.reader.getSnapshot().entries[workspace.id]).toMatchObject({
      status: 'error',
      error: 'CONNECTION_CLOSED',
      remaining: 1,
    })
  } finally {
    testbed.dispose()
  }
})

test('confirmed null removes only that unchanged canonical member, never navigates', async () => {
  const testbed = fixture(hostPort(async (name) => (name === 'session.list' ? { items: [], nextCursor: null } : null)))
  try {
    await testbed.ready([session('active')])
    await testbed.registry.execute('sessionRoster.refresh', { workspaceId: workspace.id })
    expect(testbed.directory.reader.getSnapshot().sessions.active).toBeUndefined()
    expect(testbed.navigation.reader.getSnapshot().sessionId).toBe('active')
    expect(testbed.unavailable).toEqual([])
  } finally {
    testbed.dispose()
  }
})

test('null from an older read cannot erase a newer rename fact', async () => {
  const wait = Promise.withResolvers<unknown>()
  const testbed = fixture(
    hostPort(async (name) => (name === 'session.list' ? { items: [], nextCursor: null } : wait.promise)),
  )
  try {
    await testbed.ready([session('active')])
    const pending = testbed.registry.execute('sessionRoster.refresh', { workspaceId: workspace.id })
    await new Promise((resolve) => setTimeout(resolve, 0))
    testbed.directory.reconcileRosterSessions([session('active', { seq: 4, updatedAt: 5, title: 'newer event' })], [])
    wait.resolve(null)
    await pending
    expect(testbed.directory.reader.getSnapshot().sessions.active?.title).toBe('newer event')
  } finally {
    testbed.dispose()
  }
})

test('automatic reconciliation checks at most100 olderIDs and rotates; manual covers all loaded IDs with at most4 reads', async () => {
  const ids: string[] = []
  let concurrent = 0
  let maxConcurrent = 0
  const testbed = fixture(
    hostPort(async (name, input) => {
      if (name === 'session.list') return { items: [], nextCursor: null }
      const id = (input as { sessionId: string }).sessionId
      ids.push(id)
      concurrent++
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      await new Promise((resolve) => setTimeout(resolve, 0))
      concurrent--
      return session(id)
    }),
  )
  try {
    await testbed.ready(Array.from({ length: 201 }, (_, index) => session(`old-${String(index).padStart(3, '0')}`)))
    await testbed.registry.execute('sessionRoster.refresh', { workspaceId: workspace.id, mode: 'automatic' })
    expect(ids.length).toBe(100)
    expect(testbed.refresh.reader.getSnapshot().entries[workspace.id]?.remaining).toBe(101)
    await testbed.registry.execute('sessionRoster.refresh', { workspaceId: workspace.id, mode: 'automatic' })
    expect(new Set(ids).size).toBe(200)
    ids.length = 0
    await testbed.registry.execute('sessionRoster.refresh', { workspaceId: workspace.id, mode: 'manual' })
    expect(ids.length).toBe(201)
    expect(maxConcurrent).toBeLessThanOrEqual(4)
    expect(testbed.refresh.reader.getSnapshot().entries[workspace.id]?.remaining).toBe(0)
  } finally {
    testbed.dispose()
  }
})

test('same-project concurrent refresh joins one Host list query', async () => {
  const wait = Promise.withResolvers<unknown>()
  let reads = 0
  const testbed = fixture(
    hostPort(async () => {
      reads++
      return wait.promise
    }),
  )
  try {
    await testbed.ready()
    const first = testbed.registry.execute('sessionRoster.refresh', { workspaceId: workspace.id })
    const second = testbed.registry.execute('sessionRoster.refresh', { workspaceId: workspace.id })
    await Promise.resolve()
    expect(reads).toBe(1)
    wait.resolve({ items: [session('new')], nextCursor: null })
    await Promise.all([first, second])
  } finally {
    testbed.dispose()
  }
})

test('disconnect invalidation discards late list results and a reconnect generation can refresh independently', async () => {
  const wait = Promise.withResolvers<unknown>()
  let calls = 0
  const testbed = fixture(
    hostPort(async (name, input) => {
      if (name === 'session.get') return session((input as { sessionId: string }).sessionId)
      return ++calls === 1 ? wait.promise : { items: [session('reconnected')], nextCursor: null }
    }),
  )
  try {
    await testbed.ready([session('old')])
    const prior = testbed.registry
      .execute('sessionRoster.refresh', { workspaceId: workspace.id })
      .catch(() => undefined)
    await testbed.registry.execute('sessionRoster.invalidate', {})
    await testbed.registry.execute('sessionRoster.refresh', { workspaceId: workspace.id })
    wait.resolve({ items: [session('late')], nextCursor: null })
    await prior
    expect(testbed.directory.reader.getSnapshot().sessions.late).toBeUndefined()
    expect(testbed.directory.reader.getSnapshot().sessions.reconnected).toBeDefined()
  } finally {
    testbed.dispose()
  }
})

test('navigation switch does not redirect the captured project roster or steal selection', async () => {
  const wait = Promise.withResolvers<unknown>()
  const testbed = fixture(hostPort(async () => wait.promise))
  try {
    await testbed.ready()
    const pending = testbed.registry
      .execute('sessionRoster.refresh', { workspaceId: workspace.id })
      .catch(() => undefined)
    testbed.navigation.replace({ workspaceId: 'other', sessionId: 'other-session', status: 'idle', error: null })
    // The dedicated writer is observational: a navigation change alone never changes its target.
    wait.resolve({ items: [session('target-a')], nextCursor: null })
    await pending
    expect(testbed.navigation.reader.getSnapshot().sessionId).toBe('other-session')
    expect(testbed.directory.reader.getSnapshot().sessions['target-a']?.workspaceId).toBe(workspace.id)
  } finally {
    testbed.dispose()
  }
})

test('workspace path changes invalidate the late list result before it can merge', async () => {
  const wait = Promise.withResolvers<unknown>()
  const testbed = fixture(
    hostPort(async (name) => (name === 'workspace.get' ? { ...workspace, path: 'D:/moved' } : wait.promise)),
  )
  try {
    await testbed.ready()
    const pending = testbed.registry
      .execute('sessionRoster.refresh', { workspaceId: workspace.id })
      .catch(() => undefined)
    await testbed.directory.queries.execute('workspace.get', { workspaceId: workspace.id })
    wait.resolve({ items: [session('late')], nextCursor: null })
    await pending
    expect(testbed.directory.reader.getSnapshot().sessions.late).toBeUndefined()
    expect(testbed.refresh.reader.getSnapshot().entries).toEqual({})
  } finally {
    testbed.dispose()
  }
})

test('malformed, duplicate and cross-project page responses never enter directory', async () => {
  for (const items of [
    [session('bad', { workspaceId: 'other' })],
    [session('bad'), session('bad')],
    [session('bad', { archived: true })],
  ]) {
    const testbed = fixture(hostPort(async () => ({ items, nextCursor: null })))
    try {
      await testbed.ready([session('old')])
      await expect(
        testbed.registry.execute('sessionRoster.refresh', { workspaceId: workspace.id }),
      ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
      expect(Object.keys(testbed.directory.reader.getSnapshot().sessions)).toEqual(['old'])
    } finally {
      testbed.dispose()
    }
  }
})

test('hanging transport is bounded by timeout and late response cannot update roster', async () => {
  const wait = Promise.withResolvers<unknown>()
  const testbed = fixture(
    hostPort(async () => wait.promise),
    5,
  )
  try {
    await testbed.ready([session('old')])
    await expect(
      testbed.registry.execute('sessionRoster.refresh', { workspaceId: workspace.id }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' })
    wait.resolve({ items: [session('late')], nextCursor: null })
    await Promise.resolve()
    expect(testbed.directory.reader.getSnapshot().sessions.late).toBeUndefined()
    expect(testbed.refresh.reader.getSnapshot().entries[workspace.id]).toMatchObject({
      status: 'error',
      error: 'TIMEOUT',
    })
  } finally {
    testbed.dispose()
  }
})

test('ID-ordered later pages discover an external new session without discarding the old page or resetting navigation', async () => {
  const pages: unknown[] = []
  const testbed = fixture(
    hostPort(async (name, value) => {
      if (name === 'session.get') return session((value as { sessionId: string }).sessionId)
      pages.push(value)
      const after = (value as { after?: string }).after
      return after === undefined
        ? { items: [session('a')], nextCursor: 'a' }
        : { items: [session('z-external', { createdAt: 500, updatedAt: 500 })], nextCursor: null }
    }),
  )
  try {
    await testbed.ready([session('a'), session('old-later-page')])
    await testbed.registry.execute('sessionRoster.refresh', { workspaceId: workspace.id })
    expect(pages).toEqual([
      { workspaceId: workspace.id, limit: 100 },
      { workspaceId: workspace.id, limit: 100, after: 'a' },
    ])
    expect(Object.keys(testbed.directory.reader.getSnapshot().sessions).sort()).toEqual([
      'a',
      'old-later-page',
      'z-external',
    ])
    expect(testbed.navigation.reader.getSnapshot().sessionId).toBe('active')
  } finally {
    testbed.dispose()
  }
})

test('ID scan stops at10 pages/1000 entries and reports truncation, never claiming the whole list is fresh', async () => {
  let pages = 0
  const testbed = fixture(
    hostPort(async (_name, value) => {
      pages++
      const after = (value as { after?: string }).after
      const start = after ? Number(after) + 1 : 0
      const items = Array.from({ length: 100 }, (_, index) => session(String(start + index).padStart(4, '0')))
      return { items, nextCursor: items.at(-1)?.id }
    }),
  )
  try {
    await testbed.ready()
    await testbed.registry.execute('sessionRoster.refresh', { workspaceId: workspace.id })
    expect(pages).toBe(10)
    expect(Object.keys(testbed.directory.reader.getSnapshot().sessions)).toHaveLength(1000)
    expect(testbed.refresh.reader.getSnapshot().entries[workspace.id]).toMatchObject({
      status: 'ready',
      truncated: true,
    })
  } finally {
    testbed.dispose()
  }
})

test('nonadvancing/empty cursor pages fail closed, preserving every loaded member', async () => {
  for (const page of [
    { items: [], nextCursor: 'a' },
    { items: [session('a')], nextCursor: 'not-a' },
  ]) {
    const testbed = fixture(hostPort(async () => page))
    try {
      await testbed.ready([session('old')])
      await expect(
        testbed.registry.execute('sessionRoster.refresh', { workspaceId: workspace.id }),
      ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
      expect(Object.keys(testbed.directory.reader.getSnapshot().sessions)).toEqual(['old'])
    } finally {
      testbed.dispose()
    }
  }
})

test('at cache capacity refresh retains all loaded IDs and reports new IDs it cannot fit', async () => {
  const testbed = fixture(
    hostPort(async (name, input) =>
      name === 'session.list'
        ? { items: [session('new-over-cap')], nextCursor: null }
        : session((input as { sessionId: string }).sessionId),
    ),
  )
  try {
    const originals = Array.from({ length: 1000 }, (_, index) => session(`loaded-${index}`))
    await testbed.ready(originals)
    await testbed.registry.execute('sessionRoster.refresh', { workspaceId: workspace.id })
    expect(Object.keys(testbed.directory.reader.getSnapshot().sessions)).toHaveLength(1000)
    expect(originals.every((item) => testbed.directory.reader.getSnapshot().sessions[item.id] !== undefined)).toBe(true)
    expect(testbed.directory.reader.getSnapshot().sessions['new-over-cap']).toBeUndefined()
    expect(testbed.refresh.reader.getSnapshot().entries[workspace.id]).toMatchObject({ status: 'ready', skipped: 1 })
  } finally {
    testbed.dispose()
  }
})

test('cancelling a joined caller never cancels or releases the original project generation', async () => {
  const wait = Promise.withResolvers<unknown>()
  let reads = 0
  const testbed = fixture(
    hostPort(async () => {
      reads++
      return wait.promise
    }),
  )
  try {
    await testbed.ready()
    const original = testbed.registry.execute('sessionRoster.refresh', { workspaceId: workspace.id })
    const controller = new AbortController()
    const joined = testbed.registry.execute(
      'sessionRoster.refresh',
      { workspaceId: workspace.id },
      { signal: controller.signal },
    )
    await Promise.resolve()
    controller.abort()
    await expect(joined).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(testbed.refresh.reader.getSnapshot().entries[workspace.id]?.status).toBe('loading')
    const third = testbed.registry.execute('sessionRoster.refresh', { workspaceId: workspace.id })
    wait.resolve({ items: [session('new')], nextCursor: null })
    await Promise.all([original, third])
    expect(reads).toBe(1)
    expect(testbed.directory.reader.getSnapshot().sessions.new).toBeDefined()
  } finally {
    testbed.dispose()
  }
})
