import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createDirectoryQueries } from '../packages/kernel/src/directory-queries.ts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { Storage } from '@hbar/storage'
import { HbarClient, createDirectoryQueryAdapter } from '@hbar/client'
import { sessionSidebarPageSchema } from '@hbar/contracts/sidebar-directory'
import { startServer } from '../apps/host/src/server'

const resources: { readonly root: string; readonly close: () => Promise<void> }[] = []

afterEach(async () => {
  for (const { root, close } of resources.splice(0)) {
    await close()
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('hbar-sidebar-directory-'))
      throw new Error('Refusing to remove an unexpected sidebar directory test folder')
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-sidebar-directory-'))
  const databasePath = join(root, 'test.sqlite')
  const storage = new Storage(databasePath)
  await storage.call('ready')
  const queries = createDirectoryQueries({
    workspacePage: (input) => storage.call('workspacePage', input),
    workspaceSidebarPage: (input) => storage.call('workspaceSidebarPage', input),
    globalSessionActivityPage: (input) => storage.call('globalSessionActivityPage', input),
    sessionExecutionSnapshot: (input) => storage.call('sessionExecutionSnapshot', input),
    workspaceActivityPage: (input) => storage.call('workspaceActivityPage', input),
    sessionActivityPage: (input) => storage.call('sessionActivityPage', input),
    sidebarSessionActivityPage: (input) => storage.call('sidebarSessionActivityPage', input),
    sessionPage: (input) => storage.call('sessionPage', input),
    findWorkspace: (id) => storage.call('findWorkspace', id),
    findSession: (id) => storage.call('findSession', id),
  })
  resources.push({
    root,
    close: async () => {
      queries.dispose()
      await storage.close()
    },
  })
  return { root, databasePath, storage, queries }
}

function insertSessions(
  databasePath: string,
  values: readonly {
    readonly id: string
    readonly workspaceId: string
    readonly createdAt: number
    readonly updatedAt: number
    readonly archived?: boolean
  }[],
): void {
  const database = new Database(databasePath)
  try {
    database.transaction(() => {
      const insert = database.query(
        'INSERT INTO sessions(id,workspaceId,title,archived,parentId,createdAt,updatedAt,seq) VALUES(?,?,?,?,NULL,?,?,0)',
      )
      for (const item of values)
        insert.run(item.id, item.workspaceId, item.id, Number(item.archived ?? false), item.createdAt, item.updatedAt)
    })()
  } finally {
    database.close()
  }
}

function setUpdatedAt(databasePath: string, sessionId: string, updatedAt: number): void {
  const database = new Database(databasePath)
  try {
    database.query('UPDATE sessions SET updatedAt=? WHERE id=?').run(updatedAt, sessionId)
  } finally {
    database.close()
  }
}

async function setAlias(storage: Storage, workspaceId: string, displayName: string, key: string): Promise<void> {
  const snapshot = await storage.call('workspaceDisplayNames')
  await storage.call('applyWorkspaceDisplayNames', {
    actorId: 'sidebar-directory-test',
    idempotencyKey: key,
    request: {
      expectedRevision: snapshot.revision,
      workspaceId,
      expectedDisplayName: snapshot.entries.find((entry) => entry.workspaceId === workspaceId)?.displayName ?? null,
      displayName,
    },
  })
}

async function hideWorkspace(storage: Storage, workspaceId: string, key: string): Promise<void> {
  const snapshot = await storage.call('workspaceOrganization')
  await storage.call('applyWorkspaceOrganization', {
    actorId: 'sidebar-directory-test',
    idempotencyKey: key,
    request: {
      expectedRevision: snapshot.revision,
      change: {
        kind: 'setHidden',
        workspaceId,
        expectedHidden: false,
        hidden: true,
      },
    },
  })
}

async function expectCode(operation: Promise<unknown>, code: string): Promise<void> {
  let caught: unknown
  try {
    await operation
  } catch (error) {
    caught = error
  }
  expect(caught).toMatchObject({ code })
}

test('workspace.sidebar.list pages locale display names and recent activity while excluding hidden rows', async () => {
  const { root, storage, queries, databasePath } = await fixture()
  const alpha = await storage.call('createWorkspace', join(root, 'alpha'), 'Zulu')
  const tieA = await storage.call('createWorkspace', join(root, 'tie-a'), 'Tie A')
  const tieB = await storage.call('createWorkspace', join(root, 'tie-b'), 'Tie B')
  const hidden = await storage.call('createWorkspace', join(root, 'hidden'), 'Hidden')
  await setAlias(storage, alpha.id, 'Alpha', 'alias-alpha')
  await setAlias(storage, tieA.id, 'same', 'alias-tie-a')
  await setAlias(storage, tieB.id, 'same', 'alias-tie-b')
  await setAlias(storage, hidden.id, 'Hidden Alias', 'alias-hidden')
  insertSessions(databasePath, [
    { id: 'alpha-session', workspaceId: alpha.id, createdAt: 80, updatedAt: 100 },
    { id: 'tie-a-archived', workspaceId: tieA.id, createdAt: 1_000, updatedAt: 1_000, archived: true },
    { id: 'hidden-session', workspaceId: hidden.id, createdAt: 900, updatedAt: 900 },
  ])
  await hideWorkspace(storage, hidden.id, 'hide-hidden')

  const localePages = new Map<string, string[]>()
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const first = await queries.execute('workspace.sidebar.list', {
      organization: 'project',
      locale,
      limit: 2,
      includeWorkspaceIds: [hidden.id, tieA.id, tieB.id],
    })
    const pages = [first]
    if (first.nextCursor)
      pages.push(
        await queries.execute('workspace.sidebar.list', {
          organization: 'project',
          locale,
          limit: 2,
          cursor: first.nextCursor,
        }),
      )
    const pageIds = pages.flatMap((page) => page.items.map((item) => item.workspace.id))
    const expectedIds = [alpha.id, tieA.id, tieB.id].sort((left, right) => {
      const leftName = left === alpha.id ? 'Alpha' : 'same'
      const rightName = right === alpha.id ? 'Alpha' : 'same'
      return new Intl.Collator(locale).compare(leftName, rightName) || (left < right ? -1 : left > right ? 1 : 0)
    })
    expect(pageIds).toEqual(expectedIds)
    expect(pageIds).toHaveLength(3)
    expect(new Set(pageIds).size).toBe(3)
    expect(pageIds).not.toContain(hidden.id)
    expect(first.includedItems.map((item) => item.workspace.id)).not.toContain(hidden.id)
    expect(pageIds.filter((id) => id === tieA.id || id === tieB.id)).toEqual([tieA.id, tieB.id].sort())
    expect(pages.flatMap((page) => page.items).find((item) => item.workspace.id === alpha.id)?.displayName).toBe(
      'Alpha',
    )
    localePages.set(locale, pageIds)
  }

  const firstProjectPage = await queries.execute('workspace.sidebar.list', {
    organization: 'project',
    locale: 'en-US',
    limit: 1,
  })
  if (!firstProjectPage.nextCursor) throw new Error('Expected another alphabetic Workspace page')
  await setAlias(storage, alpha.id, 'Omega', 'rename-alpha')
  await expectCode(
    queries.execute('workspace.sidebar.list', {
      organization: 'project',
      locale: 'en-US',
      limit: 1,
      cursor: firstProjectPage.nextCursor,
    }),
    'STALE_CURSOR',
  )

  const recent = await queries.execute('workspace.sidebar.list', {
    organization: 'recentProject',
    sortBy: 'updatedAt',
    limit: 2,
    includeWorkspaceIds: [hidden.id, tieA.id, tieB.id],
  })
  const nullActivityIds = [tieA.id, tieB.id].sort()
  const remainingNullWorkspaceId = nullActivityIds[1]
  if (!remainingNullWorkspaceId) throw new Error('Expected a second Workspace without active Session activity')
  expect(recent.items.map((item) => item.workspace.id)).toEqual([alpha.id, ...nullActivityIds].slice(0, 2))
  expect(recent.nextCursor).not.toBeNull()
  expect(recent.items.find((item) => item.workspace.id === alpha.id)).toMatchObject({
    displayName: 'Omega',
    latestSessionCreatedAt: 80,
    latestSessionUpdatedAt: 100,
  })
  expect(recent.includedItems.map((item) => item.workspace.id)).not.toContain(hidden.id)
  expect(recent.includedItems.map((item) => item.workspace.id)).toContain(remainingNullWorkspaceId)
  if (!recent.nextCursor) throw new Error('Expected another recent project page')
  const recentSecond = await queries.execute('workspace.sidebar.list', {
    organization: 'recentProject',
    sortBy: 'updatedAt',
    limit: 2,
    cursor: recent.nextCursor,
  })
  expect(recentSecond.items.map((item) => item.workspace.id)).toEqual([remainingNullWorkspaceId])
  expect(recentSecond.nextCursor).toBeNull()
  expect([...recent.items, ...recentSecond.items].find((item) => item.workspace.id === tieA.id)).toMatchObject({
    latestSessionCreatedAt: null,
    latestSessionUpdatedAt: null,
  })
  expect(localePages.get('zh-CN')).toHaveLength(3)
})

test('session.activity.global.list returns cross-workspace execution summaries, stale revisions and deep active rows', async () => {
  const { root, databasePath, storage, queries } = await fixture()
  const firstWorkspace = await storage.call('createWorkspace', join(root, 'first'), 'First')
  const secondWorkspace = await storage.call('createWorkspace', join(root, 'second'), 'Second')
  const hiddenWorkspace = await storage.call('createWorkspace', join(root, 'hidden'), 'Hidden')
  await setAlias(storage, secondWorkspace.id, 'Second Alias', 'alias-second')

  const queued = await storage.call('createSession', firstWorkspace.id, 'Queued')
  const running = await storage.call('createSession', secondWorkspace.id, 'Running')
  const waiting = await storage.call('createSession', firstWorkspace.id, 'Waiting')
  const cancelRequested = await storage.call('createSession', secondWorkspace.id, 'Cancel requested')
  const idle = await storage.call('createSession', firstWorkspace.id, 'Idle')
  const archived = await storage.call('createSession', firstWorkspace.id, 'Archived')
  const hidden = await storage.call('createSession', hiddenWorkspace.id, 'Hidden')

  const queuedRun = await storage.call(
    'enqueue',
    queued.id,
    'queued-request',
    { text: 'private queued prompt', images: [] },
    'test-model',
  )
  const runningRun = await storage.call(
    'enqueue',
    running.id,
    'running-request',
    { text: 'private running prompt', images: [] },
    'test-model',
  )
  await storage.call('claim', running.id)
  const waitingRun = await storage.call(
    'enqueue',
    waiting.id,
    'waiting-request',
    { text: 'private waiting prompt', images: [] },
    'test-model',
  )
  await storage.call('setRun', waitingRun.id, 'waiting_approval')
  const cancelRun = await storage.call(
    'enqueue',
    cancelRequested.id,
    'cancel-request',
    { text: 'private cancel prompt', images: [] },
    'test-model',
  )
  await storage.call('claim', cancelRequested.id)
  await storage.call('requestCancel', cancelRun.id)
  await storage.call('updateSession', archived.id, { archived: true })
  await hideWorkspace(storage, hiddenWorkspace.id, 'hide-global')

  const timestamps = [
    [queued.id, 500],
    [running.id, 400],
    [waiting.id, 300],
    [cancelRequested.id, 200],
    [idle.id, 1_000],
  ] as const
  for (const [sessionId, updatedAt] of timestamps) setUpdatedAt(databasePath, sessionId, updatedAt)
  insertSessions(
    databasePath,
    Array.from({ length: 2_001 }, (_, index) => ({
      id: `ordinary-${String(index).padStart(4, '0')}`,
      workspaceId: firstWorkspace.id,
      createdAt: 1,
      updatedAt: 900,
    })),
  )

  const ordinarySessions = await storage.call('sessions')
  expect(ordinarySessions.map((session) => session.id)).not.toContain(queued.id)
  let page = await queries.execute('session.activity.global.list', { limit: 200 })
  expect(page.items.slice(0, 4).map((item) => item.session.id)).toEqual([
    queued.id,
    running.id,
    waiting.id,
    cancelRequested.id,
  ])
  expect(page.items.slice(0, 4).map((item) => item.execution.state)).toEqual([
    'queued',
    'running',
    'waiting_approval',
    'cancelRequested',
  ])
  expect(page.items[0]).toMatchObject({
    session: { id: queued.id, workspaceId: firstWorkspace.id, archived: false },
    workspace: { id: firstWorkspace.id, name: 'First' },
    displayName: 'First',
    execution: { state: 'queued', activeCount: 1, queuedCount: 1 },
  })
  expect(page.items.find((item) => item.session.id === running.id)).toMatchObject({
    workspace: { id: secondWorkspace.id, name: 'Second' },
    displayName: 'Second Alias',
    execution: { state: 'running', activeCount: 1, queuedCount: 0 },
  })
  expect(page.items.map((item) => item.session.id)).not.toContain(archived.id)
  expect(page.items.map((item) => item.session.id)).not.toContain(hidden.id)
  expect(JSON.stringify(page)).not.toContain('private ')
  const ordinaryIds = page.items
    .filter((item) => item.session.id.startsWith('ordinary-'))
    .map((item) => item.session.id)
  expect(ordinaryIds).toEqual(ordinaryIds.toSorted())
  expect(ordinaryIds).toHaveLength(195)
  if (!page.nextCursor) throw new Error('Expected a following global Session page')
  const cursor = page.nextCursor
  await storage.call('claim', queued.id)
  await expectCode(queries.execute('session.activity.global.list', { limit: 200, cursor }), 'STALE_CURSOR')

  page = await queries.execute('session.activity.global.list', { limit: 2 })
  if (!page.nextCursor) throw new Error('Expected a second cursor for organization freshness')
  await hideWorkspace(storage, firstWorkspace.id, 'hide-first-workspace')
  await expectCode(
    queries.execute('session.activity.global.list', { limit: 2, cursor: page.nextCursor }),
    'STALE_CURSOR',
  )
  expect(queuedRun.id).toBeString()
  expect(runningRun.id).toBeString()
})

test('session.execution.get reads one target with own and direct non-fork child activity only', async () => {
  const { root, storage, queries } = await fixture()
  const workspace = await storage.call('createWorkspace', join(root, 'parent'), 'Parent workspace')
  const childWorkspace = await storage.call('createWorkspace', join(root, 'child'), 'Child workspace')
  const parent = await storage.call('createSession', workspace.id, 'Parent')
  const child = await storage.call('createSession', childWorkspace.id, 'Archived child', parent.id)
  const fork = await storage.call('fork', parent.id)
  const grandchild = await storage.call('createSession', childWorkspace.id, 'Grandchild', child.id)
  const ownRun = await storage.call(
    'enqueue',
    parent.id,
    'selected-own',
    { text: 'private parent input', images: [] },
    'fixture',
  )
  const childRun = await storage.call(
    'enqueue',
    child.id,
    'selected-child',
    { text: 'private child input', images: [] },
    'fixture',
  )
  const forkRun = await storage.call(
    'enqueue',
    fork.id,
    'selected-fork',
    { text: 'private fork input', images: [] },
    'fixture',
  )
  const grandchildRun = await storage.call(
    'enqueue',
    grandchild.id,
    'selected-grandchild',
    { text: 'private grandchild input', images: [] },
    'fixture',
  )
  await storage.call('setRun', childRun.id, 'waiting_approval')
  await storage.call('setRun', forkRun.id, 'waiting_approval')
  await storage.call('setRun', grandchildRun.id, 'waiting_approval')
  await storage.call('updateSession', child.id, { archived: true })
  await hideWorkspace(storage, childWorkspace.id, 'hide-selected-child-workspace')

  const selected = await queries.execute('session.execution.get', {
    sessionId: parent.id,
    workspaceId: workspace.id,
  })
  expect(selected).toMatchObject({
    sessionId: parent.id,
    workspaceId: workspace.id,
    execution: { state: 'waiting_approval', activeCount: 2, queuedCount: 1 },
  })
  expect(JSON.stringify(selected)).not.toContain('private ')

  await storage.call('requestCancel', childRun.id)
  const cancelling = await queries.execute('session.execution.get', {
    sessionId: parent.id,
    workspaceId: workspace.id,
  })
  expect(cancelling.execution).toEqual({ state: 'cancelRequested', activeCount: 2, queuedCount: 1 })
  await storage.call('setRun', childRun.id, 'cancelled')
  await storage.call('setRun', ownRun.id, 'cancelled')
  const idle = await queries.execute('session.execution.get', { sessionId: parent.id, workspaceId: workspace.id })
  expect(idle.execution).toEqual({ state: 'idle', activeCount: 0, queuedCount: 0 })

  // The child owns its direct grandchild, while the parent does not recursively inherit it.
  const childExecution = await queries.execute('session.execution.get', {
    sessionId: child.id,
    workspaceId: childWorkspace.id,
  })
  expect(childExecution.execution).toEqual({ state: 'waiting_approval', activeCount: 1, queuedCount: 0 })
  expect(forkRun.id).toBeString()
  expect(grandchildRun.id).toBeString()
  await expectCode(
    queries.execute('session.execution.get', { sessionId: parent.id, workspaceId: childWorkspace.id }),
    'SESSION_WORKSPACE_MISMATCH',
  )
  await expectCode(
    queries.execute('session.execution.get', { sessionId: 'missing', workspaceId: workspace.id }),
    'SESSION_NOT_FOUND',
  )
})

test('durable Run activity events publish one global invalidation hint without reacting to other events', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-sidebar-directory-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, close: () => kernel.close() })
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Expected a fixture Workspace')
  const session = await kernel.createSession(workspace.id)
  const changedKinds: string[] = []
  const unsubscribe = kernel.subscribe((event) => {
    if (event.method === 'host.changed') changedKinds.push(event.params.kind)
  })
  await kernel.append(session.id, 'run.cancelRequested', { runId: 'synthetic-run' }, 'synthetic-run')
  await kernel.append(session.id, 'usage.recorded', {})
  unsubscribe()
  expect(changedKinds).toEqual(['session-activity'])

  const lifecycle: string[] = []
  const stopLifecycle = kernel.subscribe((event) => {
    if (
      event.method === 'session.event' &&
      event.params.sessionId === session.id &&
      ['run.queued', 'run.status'].includes(event.params.type)
    )
      lifecycle.push(`event:${event.params.type}`)
    else if (event.method === 'host.changed' && event.params.kind === 'session-activity') lifecycle.push('hint')
  })
  await kernel.submit(session.id, 'activity-claim-hint', { text: 'local activity test', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  stopLifecycle()
  const queuedIndex = lifecycle.indexOf('event:run.queued')
  const runningIndex = lifecycle.indexOf('event:run.status')
  expect(queuedIndex).toBeGreaterThanOrEqual(0)
  expect(runningIndex).toBeGreaterThan(queuedIndex)
  expect(lifecycle.slice(queuedIndex + 1, runningIndex).filter((entry) => entry === 'hint')).toHaveLength(2)
})

test('Time activity ranks an idle parent before paging while direct background children run, not forks or grandchildren', async () => {
  const { root, databasePath, storage, queries } = await fixture()
  const workspace = await storage.call('createWorkspace', join(root, 'parent'), 'Parent workspace')
  const isolated = await storage.call('createWorkspace', join(root, 'isolated'), 'Isolated child workspace')
  const parent = await storage.call('createSession', workspace.id, 'Parent is idle')
  const child = await storage.call('createSession', isolated.id, 'Background child', parent.id)
  const fork = await storage.call('fork', parent.id)
  const grandchild = await storage.call('createSession', isolated.id, 'Grandchild', child.id)
  const unrelated = await storage.call('createSession', workspace.id, 'Unrelated idle')
  const childRun = await storage.call(
    'enqueue',
    child.id,
    'child-run',
    { text: 'private child prompt', images: [] },
    'fixture',
  )
  const forkRun = await storage.call('enqueue', fork.id, 'fork-run', { text: 'fork prompt', images: [] }, 'fixture')
  const grandchildRun = await storage.call(
    'enqueue',
    grandchild.id,
    'grandchild-run',
    { text: 'grandchild prompt', images: [] },
    'fixture',
  )
  await storage.call('setRun', childRun.id, 'waiting_approval')
  setUpdatedAt(databasePath, parent.id, 1)
  setUpdatedAt(databasePath, unrelated.id, 100_000)
  await storage.call('updateSession', child.id, { archived: true })
  await hideWorkspace(storage, isolated.id, 'hide-background-workspace')

  const active = await queries.execute('session.activity.global.list', { limit: 2 })
  expect(active.items.map((item) => item.session.id)).toEqual([fork.id, parent.id])
  expect(active.items[1]?.execution).toEqual({ state: 'waiting_approval', activeCount: 1, queuedCount: 0 })
  expect(JSON.stringify(active)).not.toContain('private child prompt')
  if (!active.nextCursor) throw new Error('Expected an idle second page')
  const rest = await queries.execute('session.activity.global.list', { limit: 2, cursor: active.nextCursor })
  expect(rest.items.map((item) => item.session.id)).toEqual([unrelated.id])

  await storage.call('requestCancel', childRun.id)
  await expectCode(queries.execute('session.activity.global.list', { cursor: active.nextCursor }), 'STALE_CURSOR')
  const cancelling = await queries.execute('session.activity.global.list', { limit: 200 })
  expect(cancelling.items.find((item) => item.session.id === parent.id)?.execution.state).toBe('cancelRequested')
  await storage.call('setRun', childRun.id, 'cancelled')
  const settled = await queries.execute('session.activity.global.list', { limit: 200 })
  expect(settled.items.find((item) => item.session.id === parent.id)?.execution).toEqual({
    state: 'idle',
    activeCount: 0,
    queuedCount: 0,
  })
  // The independently active fork and grandchild do not keep this parent busy.
  expect(settled.items[0]?.session.id).toBe(fork.id)
  expect(forkRun.id).toBeString()
  expect(grandchildRun.id).toBeString()

  await storage.call('updateSession', child.id, { archived: false })
  const ownRun = await storage.call(
    'enqueue',
    parent.id,
    'parent-run',
    { text: 'parent prompt', images: [] },
    'fixture',
  )
  const nextChildRun = await storage.call(
    'enqueue',
    child.id,
    'next-child-run',
    { text: 'child prompt', images: [] },
    'fixture',
  )
  const mixed = await queries.execute('session.activity.global.list', { limit: 1 })
  expect(mixed.items[0]?.session.id).toBe(parent.id)
  expect(mixed.items[0]?.execution).toEqual({ state: 'queued', activeCount: 2, queuedCount: 2 })
  if (!mixed.nextCursor) throw new Error('Expected a parent-link cursor')
  const database = new Database(databasePath)
  try {
    database.query('UPDATE sessions SET parentId=? WHERE id=?').run(unrelated.id, child.id)
  } finally {
    database.close()
  }
  await expectCode(queries.execute('session.activity.global.list', { cursor: mixed.nextCursor }), 'STALE_CURSOR')
  const moved = await queries.execute('session.activity.global.list', { limit: 200 })
  expect(moved.items.find((item) => item.session.id === parent.id)?.execution.activeCount).toBe(1)
  expect(moved.items.find((item) => item.session.id === unrelated.id)?.execution.activeCount).toBe(1)
  expect(ownRun.id).toBeString()
  expect(nextChildRun.id).toBeString()
})

test('schema 14 upgrade restores parent activity from persisted public facts without plugin history reads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-sidebar-directory-'))
  const databasePath = join(root, 'upgrade.sqlite')
  let storage = new Storage(databasePath)
  resources.push({ root, close: () => storage.close() })
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', join(root, 'project'), 'Project')
  const parent = await storage.call('createSession', workspace.id, 'Parent')
  const child = await storage.call('createSession', workspace.id, 'Child', parent.id)
  await storage.call('enqueue', child.id, 'persisted-child', { text: 'private persisted input', images: [] }, 'fixture')
  await storage.close()
  const database = new Database(databasePath)
  try {
    database.exec(
      'DROP TRIGGER directory_activity_session_parent_update; DROP INDEX events_session_type; PRAGMA user_version=14;',
    )
  } finally {
    database.close()
  }
  storage = new Storage(databasePath)
  await storage.call('ready')
  const page = await storage.call('globalSessionActivityPage', { limit: 200 })
  expect(page.items.find((item) => item.session.id === parent.id)?.execution).toEqual({
    state: 'queued',
    activeCount: 1,
    queuedCount: 1,
  })
  const upgraded = new Database(databasePath, { readonly: true })
  try {
    expect(upgraded.query('PRAGMA user_version').get()).toEqual({ user_version: 18 })
    expect(
      upgraded
        .query(
          "SELECT name FROM sqlite_master WHERE type='trigger' AND name='directory_activity_session_parent_update'",
        )
        .get(),
    ).not.toBeNull()
  } finally {
    upgraded.close()
  }
})

test('project Session pages attach the same background summary without changing timestamp order or exposing prompts', async () => {
  const { root, databasePath, storage, queries } = await fixture()
  const workspace = await storage.call('createWorkspace', join(root, 'project'), 'Project')
  const isolated = await storage.call('createWorkspace', join(root, 'child'), 'Child')
  const parent = await storage.call('createSession', workspace.id, 'Old parent')
  const idle = await storage.call('createSession', workspace.id, 'Recent idle')
  const child = await storage.call('createSession', isolated.id, 'Background child', parent.id)
  const run = await storage.call(
    'enqueue',
    child.id,
    'background',
    { text: 'private background prompt', images: [] },
    'fixture',
  )
  await storage.call('claim', child.id)
  setUpdatedAt(databasePath, parent.id, 1)
  setUpdatedAt(databasePath, idle.id, 100)
  const input = { workspaceId: workspace.id, limit: 1 }
  const first = await queries.execute('session.sidebar.list', input)
  expect(first.items[0]).toMatchObject({
    session: { id: idle.id },
    execution: { state: 'idle', activeCount: 0, queuedCount: 0 },
  })
  expect(first.nextCursor).not.toBeNull()
  if (!first.nextCursor) throw new Error('Expected second Session page')
  const second = await queries.execute('session.sidebar.list', { ...input, cursor: first.nextCursor })
  expect(second.items[0]).toMatchObject({
    session: { id: parent.id },
    execution: { state: 'running', activeCount: 1, queuedCount: 0 },
  })
  expect(second.nextCursor).toBeNull()
  expect(JSON.stringify(second)).not.toContain('private background prompt')
  const legacy = await queries.execute('session.activity.list', { workspaceId: workspace.id })
  expect(legacy.items.map((item) => item.id)).toEqual([idle.id, parent.id])
  const global = await queries.execute('session.activity.global.list', { limit: 200 })
  expect(global.items.find((item) => item.session.id === parent.id)?.execution).toEqual(second.items[0]?.execution)
  await storage.call('setRun', run.id, 'cancelled')
  await expectCode(queries.execute('session.sidebar.list', { ...input, cursor: first.nextCursor }), 'STALE_CURSOR')
  const settled = await queries.execute('session.sidebar.list', { workspaceId: workspace.id, limit: 200 })
  expect(settled.items.find((item) => item.session.id === parent.id)?.execution.activeCount).toBe(0)
  await expectCode(queries.execute('session.sidebar.list', { workspaceId: 'missing' }), 'WORKSPACE_NOT_FOUND')
})

test('the public directory adapter routes project activity through the real Host command dispatcher', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-sidebar-directory-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const server = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${server.server.port}`)
  resources.push({
    root,
    close: async () => {
      client.disconnect()
      await server.close()
      await kernel.close()
    },
  })
  await client.pair(server.pairing.code, 'sidebar adapter fixture')
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Missing test workspace')
  const parent = await kernel.createSession(workspace.id, 'Adapter parent')
  const child = await kernel.createSession(workspace.id, 'Adapter child', parent.id)
  await kernel.storage.call(
    'enqueue',
    child.id,
    'adapter-background',
    { text: 'private adapter input', images: [] },
    'local-fixture',
  )
  const adapter = createDirectoryQueryAdapter(client)
  const page = sessionSidebarPageSchema.parse(
    await adapter.execute('session.sidebar.list', { workspaceId: workspace.id, limit: 60 }),
  )
  expect(page.items.find((item) => item.session.id === parent.id)?.execution).toEqual({
    state: 'queued',
    activeCount: 1,
    queuedCount: 1,
  })
  expect(page.items).toHaveLength(2)
  expect(JSON.stringify(page)).not.toContain('private adapter input')
  const selected = await adapter.execute('session.execution.get', {
    sessionId: parent.id,
    workspaceId: workspace.id,
  })
  expect(selected).toMatchObject({
    sessionId: parent.id,
    workspaceId: workspace.id,
    execution: { state: 'queued', activeCount: 1, queuedCount: 1 },
  })
  await expectCode(
    adapter.execute('session.execution.get', { sessionId: parent.id, workspaceId: 'missing' }),
    'SESSION_WORKSPACE_MISMATCH',
  )
  await expectCode(adapter.execute('session.sidebar.list', { workspaceId: 'missing' }), 'WORKSPACE_NOT_FOUND')
})
