import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry, createCommandClient, type ExecuteOptions } from '@hbar/commands'
import type { Session, Workspace } from '@hbar/contracts/directory'
import { sessionAgentChildrenInputSchema, type SessionAgentChildItem } from '@hbar/contracts/sidebar-directory'
import { createDirectoryModule } from '../packages/app-runtime/src/directory'
import { createSessionAgentTree, sessionAgentTreeCommands } from '../packages/app-runtime/src/session-agent-tree'
import { createState } from '../packages/app-runtime/src/state'
import type { NavigationState } from '@hbar/app-runtime'

const execution = { state: 'idle' as const, activeCount: 0, queuedCount: 0 }
const workspace: Workspace = { id: 'workspace', path: 'D:/fixture', name: 'Fixture', createdAt: 1 }
function session(id: string, parentId: string | null = null): Session {
  return { id, workspaceId: workspace.id, parentId, title: id, archived: false, createdAt: 1, updatedAt: 1, seq: 1 }
}
function row(id: string, parent: string, time: number | null = null): SessionAgentChildItem {
  return { session: session(id, parent), lastResponseAt: time, agentChildCount: 0, execution }
}
function fixture() {
  const navigation = createState<NavigationState>(
    { workspaceId: null, sessionId: null, status: 'idle', error: null },
    () => {},
  )
  const children = new Map<string, SessionAgentChildItem[]>()
  const calls: { name: string; input: unknown; signal?: AbortSignal | undefined }[] = []
  let revision = 1
  let event = () => {}
  let connection: (connected: boolean) => void = () => {}
  let delay: (() => Promise<void>) | null = null
  let unsubscribed = 0
  const root = session('parent')
  const directory = createDirectoryModule(
    {
      instanceId: 'test',
      hostId: 'test',
      directory: {
        async execute(name: string, input: unknown, options?: ExecuteOptions): Promise<unknown> {
          calls.push({ name, input, signal: options?.signal })
          if (name === 'session.agentChildren.list') {
            const request = sessionAgentChildrenInputSchema.parse(input)
            const capturedRevision = revision
            const items = [...(children.get(request.parentSessionId) ?? [])]
            if (delay) await delay()
            if (request.cursor && request.cursor.revision !== capturedRevision)
              throw new CommandError('STALE_CURSOR', 'stale')
            const start = request.cursor
              ? items.findIndex((item) => item.session.id === request.cursor?.sessionId) + 1
              : 0
            const page = items.slice(start, start + request.limit)
            const included = items.find(
              (item) =>
                item.session.id === request.includeSessionId &&
                !page.some((value) => value.session.id === item.session.id),
            )
            const last = page.at(-1)
            return {
              parentSessionId: request.parentSessionId,
              revision: capturedRevision,
              totalCount: items.length,
              items: page,
              includedItem: included ?? null,
              nextCursor:
                start + page.length < items.length && last
                  ? {
                      parentSessionId: request.parentSessionId,
                      revision: capturedRevision,
                      responseAt: last.lastResponseAt ?? 0,
                      createdAt: last.session.createdAt,
                      sessionId: last.session.id,
                    }
                  : null,
            }
          }
          if (name === 'session.agentAncestors.get') {
            const id = typeof input === 'object' && input && 'sessionId' in input ? input.sessionId : null
            const child = [...children.values()].flat().find((item) => item.session.id === id)
            return {
              sessionId: id,
              workspace,
              items: child
                ? [
                    { session: root, agentChildCount: children.get(root.id)?.length ?? 0 },
                    { session: child.session, agentChildCount: child.agentChildCount },
                  ]
                : [{ session: session(String(id)), agentChildCount: 0 }],
            }
          }
          if (name === 'session.execution.get')
            return { sessionId: root.id, workspaceId: workspace.id, revision, execution }
          throw new Error(`Unexpected ${name}`)
        },
      },
    },
    navigation.reader,
    () => {},
    () => {},
  )
  const registry = new CommandRegistry({ execution: 'client' })
  const tree = createSessionAgentTree(registry, {
    queries: directory.queries,
    directory: directory.reader,
    navigation: navigation.reader,
    projectSessions: directory.projectAgentSessions,
    subscribeConfirmedSessions: directory.subscribeConfirmedSessions,
    events: {
      subscribe(listener) {
        event = listener
        return () => {
          unsubscribed++
        }
      },
      onConnection(listener) {
        connection = listener
        return () => {
          unsubscribed++
        }
      },
    },
    onSubscriberError: (error) => {
      throw error
    },
  })
  const commands = createCommandClient(sessionAgentTreeCommands, registry)
  return {
    children,
    calls,
    directory,
    tree,
    commands,
    navigation,
    bump() {
      revision++
    },
    event: () => event(),
    connection: (value: boolean) => connection(value),
    delay(value: (() => Promise<void>) | null) {
      delay = value
    },
    disposedCount: () => unsubscribed,
    dispose() {
      tree.dispose()
      registry.dispose()
      directory.dispose()
      navigation.dispose()
    },
  }
}
async function eventually(condition: () => boolean) {
  for (let index = 0; index < 100; index++) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  expect(condition()).toBe(true)
}

test('Agent branches are lazy, paged, response ordered and bounded; stale paging refreshes without duplicates', async () => {
  const f = fixture()
  try {
    f.children.set(
      'parent',
      Array.from({ length: 129 }, (_, index) => row(`child-${String(index).padStart(3, '0')}`, 'parent', 200 - index)),
    )
    expect(f.calls).toHaveLength(0)
    await f.commands.execute('sessionAgentTree.toggle', { parentSessionId: 'parent' })
    expect(f.tree.reader.getSnapshot().branches.parent?.rows).toHaveLength(50)
    await f.commands.execute('sessionAgentTree.loadMore', { parentSessionId: 'parent' })
    expect(f.tree.reader.getSnapshot().branches.parent?.rows).toHaveLength(100)
    f.bump()
    await f.commands.execute('sessionAgentTree.loadMore', { parentSessionId: 'parent' })
    expect(f.tree.reader.getSnapshot().branches.parent?.rows).toHaveLength(100)
    await f.commands.execute('sessionAgentTree.loadMore', { parentSessionId: 'parent' })
    const branch = f.tree.reader.getSnapshot().branches.parent!
    expect(branch.error).toBeNull()
    expect(branch.rows).toHaveLength(128)
    expect(new Set(branch.rows.map((item) => item.sessionId)).size).toBe(128)
    expect(branch.limitReached).toBe(true)
    const old = f.directory.reader.getSnapshot().sessions['child-127']!
    f.directory.reconcileRosterSessions([{ ...old, title: 'Renamed', updatedAt: 900, seq: 2 }], [])
    expect(f.tree.reader.getSnapshot().branches.parent?.rows.at(-1)?.sessionId).toBe(old.id)
  } finally {
    f.dispose()
  }
})

test('Collapse cancels its read and descendants and ignores late confirmed pages', async () => {
  const f = fixture()
  let release = () => {}
  try {
    f.children.set('parent', [row('child', 'parent', 10)])
    await f.commands.execute('sessionAgentTree.toggle', { parentSessionId: 'parent' })
    f.children.set('child', [row('grandchild', 'child', 11)])
    await f.commands.execute('sessionAgentTree.toggle', { parentSessionId: 'child' })
    f.delay(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const read = f.commands.execute('sessionAgentTree.refresh', { parentSessionId: 'parent' })
    await eventually(() => f.calls.at(-1)?.name === 'session.agentChildren.list')
    await f.commands.execute('sessionAgentTree.toggle', { parentSessionId: 'parent' })
    expect(f.calls.at(-1)?.signal?.aborted).toBe(true)
    release()
    await read
    expect(f.tree.reader.getSnapshot().branches.parent?.expanded).toBe(false)
    expect(f.tree.reader.getSnapshot().branches.child?.rows).toHaveLength(0)
  } finally {
    release()
    f.dispose()
  }
})

test('Selected child reveals verified parent and includes a child beyond page one, without turning ordinary forks into children', async () => {
  const f = fixture()
  try {
    f.children.set(
      'parent',
      Array.from({ length: 61 }, (_, index) => row(`child-${String(index).padStart(2, '0')}`, 'parent', 100 - index)),
    )
    f.navigation.replace({ workspaceId: workspace.id, sessionId: 'child-60', status: 'idle', error: null })
    await eventually(() => f.tree.reader.getSnapshot().branches.parent?.status === 'ready')
    expect(f.tree.reader.getSnapshot().revealedRoot?.sessionId).toBe('parent')
    expect(f.tree.reader.getSnapshot().branches.parent?.rows.at(-1)?.sessionId).toBe('child-60')
    expect(f.directory.reader.getSnapshot().sessions['child-60']?.parentId).toBe('parent')
    await f.commands.execute('sessionAgentTree.refresh', { parentSessionId: 'parent' })
    expect(f.tree.reader.getSnapshot().branches.parent?.rows.at(-1)?.sessionId).toBe('child-60')
    f.navigation.replace({ workspaceId: workspace.id, sessionId: 'fork', status: 'idle', error: null })
    await eventually(() => f.calls.at(-1)?.name === 'session.agentAncestors.get')
    expect(f.tree.reader.getSnapshot().revealedRoot).toBeNull()
  } finally {
    f.dispose()
  }
})

test('Global row and branch budgets recover after collapsing; reveal retry rejects a stale navigation target', async () => {
  const f = fixture()
  try {
    for (const parent of ['one', 'two']) {
      f.children.set(
        parent,
        Array.from({ length: 128 }, (_, index) =>
          row(`${parent}-${String(index).padStart(3, '0')}`, parent, 200 - index),
        ),
      )
      await f.commands.execute('sessionAgentTree.toggle', { parentSessionId: parent })
      await f.commands.execute('sessionAgentTree.loadMore', { parentSessionId: parent })
      await f.commands.execute('sessionAgentTree.loadMore', { parentSessionId: parent })
    }
    f.children.set('three', [row('three-child', 'three')])
    await f.commands.execute('sessionAgentTree.toggle', { parentSessionId: 'three' })
    expect(f.tree.reader.getSnapshot().branches.three?.limitReached).toBe(true)
    expect(f.tree.reader.getSnapshot().branches.three?.rows).toHaveLength(0)
    await f.commands.execute('sessionAgentTree.toggle', { parentSessionId: 'one' })
    await f.commands.execute('sessionAgentTree.refresh', { parentSessionId: 'three' })
    expect(f.tree.reader.getSnapshot().branches.three?.rows).toHaveLength(1)
    for (let index = 0; index < 30; index++)
      await f.commands.execute('sessionAgentTree.toggle', { parentSessionId: `empty-${index}` })
    const result = await f.commands.execute('sessionAgentTree.toggle', { parentSessionId: 'over-budget' })
    expect(result.error).toBe('CAPACITY_EXCEEDED')
    const stale = await f.commands.execute('sessionAgentTree.reveal', { sessionId: 'foreign' }).then(
      () => null,
      (error: unknown) => error,
    )
    expect(stale).toMatchObject({ code: 'STALE_TARGET' })
    expect(Object.keys(f.tree.reader.getSnapshot().branches)).toHaveLength(32)
    await f.commands.execute('sessionAgentTree.toggle', { parentSessionId: 'two' })
    expect(f.tree.reader.getSnapshot().revealError).toBeNull()
  } finally {
    f.dispose()
  }
})

test('Response events refresh expanded branches; disconnect and disposal release subscriptions and pending requests', async () => {
  const f = fixture()
  try {
    f.children.set('parent', [row('one', 'parent', 10), row('two', 'parent', 9)])
    await f.commands.execute('sessionAgentTree.toggle', { parentSessionId: 'parent' })
    f.children.set('parent', [row('two', 'parent', 11), row('one', 'parent', 10)])
    f.event()
    await eventually(() => f.tree.reader.getSnapshot().branches.parent?.rows[0]?.sessionId === 'two')
    f.connection(false)
    expect(f.tree.reader.getSnapshot().branches.parent?.error).toBe('DISCONNECTED')
    f.connection(true)
    await eventually(() => f.tree.reader.getSnapshot().branches.parent?.status === 'ready')
  } finally {
    f.dispose()
  }
  const count = f.calls.length
  f.event()
  await new Promise((resolve) => setTimeout(resolve, 140))
  expect(f.calls).toHaveLength(count)
  expect(f.disposedCount()).toBe(2)
})
