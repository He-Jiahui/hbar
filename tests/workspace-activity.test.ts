import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createDirectoryQueries } from '../packages/kernel/src/directory-queries.ts'
import { Storage } from '@hbar/storage'

const resources: {
  readonly root: string
  readonly databasePath: string
  readonly storage: Storage
  readonly queries: ReturnType<typeof createDirectoryQueries>
}[] = []

afterEach(async () => {
  for (const { root, storage, queries } of resources.splice(0)) {
    queries.dispose()
    await storage.close()
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('hbar-workspace-activity-'))
      throw new Error('Refusing to remove an unexpected workspace activity test directory')
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-workspace-activity-'))
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
    sessionAgentChildren: (input) => storage.call('sessionAgentChildren', input),
    sessionAgentAncestors: (sessionId) => storage.call('sessionAgentAncestors', sessionId),
    sessionPage: (input) => storage.call('sessionPage', input),
    findWorkspace: (id) => storage.call('findWorkspace', id),
    findSession: (id) => storage.call('findSession', id),
  })
  resources.push({ root, databasePath, storage, queries })
  return { root, databasePath, storage, queries }
}

function insertSessions(
  databasePath: string,
  sessions: readonly {
    readonly id: string
    readonly workspaceId: string
    readonly createdAt: number
    readonly updatedAt: number
    readonly archived?: boolean
  }[],
) {
  const database = new Database(databasePath)
  try {
    database.transaction(() => {
      const insert = database.query(
        'INSERT INTO sessions(id,workspaceId,title,archived,parentId,createdAt,updatedAt,seq) VALUES(?,?,?,?,?,?,?,0)',
      )
      for (const session of sessions)
        insert.run(
          session.id,
          session.workspaceId,
          session.id,
          Number(session.archived ?? false),
          null,
          session.createdAt,
          session.updatedAt,
        )
    })()
  } finally {
    database.close()
  }
}

function setSessionActivity(
  databasePath: string,
  input: { readonly id: string; readonly archived?: boolean; readonly createdAt?: number; readonly updatedAt?: number },
) {
  const database = new Database(databasePath)
  try {
    database
      .query(
        `UPDATE sessions
         SET archived=COALESCE(?,archived),createdAt=COALESCE(?,createdAt),updatedAt=COALESCE(?,updatedAt)
         WHERE id=?`,
      )
      .run(
        input.archived === undefined ? null : Number(input.archived),
        input.createdAt ?? null,
        input.updatedAt ?? null,
        input.id,
      )
  } finally {
    database.close()
  }
}

test('workspace activity pages sort by all active Sessions, put null activity last, and page timestamp ties', async () => {
  const { root, databasePath, storage, queries } = await fixture()
  const alpha = await storage.call('createWorkspace', join(root, 'alpha'), 'Alpha')
  const beta = await storage.call('createWorkspace', join(root, 'beta'), 'Beta')
  const archivedOnly = await storage.call('createWorkspace', join(root, 'archived'), 'Archived')
  const empty = await storage.call('createWorkspace', join(root, 'empty'), 'Empty')
  const equal = await storage.call('createWorkspace', join(root, 'equal'), 'Equal')
  const sessions: {
    readonly id: string
    readonly workspaceId: string
    readonly createdAt: number
    readonly updatedAt: number
    readonly archived?: boolean
  }[] = Array.from({ length: 61 }, (_, index) =>
    index === 60
      ? { id: 'a-session-060', workspaceId: alpha.id, createdAt: 80, updatedAt: 50 }
      : {
          id: `a-session-${String(index).padStart(3, '0')}`,
          workspaceId: alpha.id,
          createdAt: 10,
          updatedAt: 10,
        },
  )
  sessions.push(
    { id: 'b-session', workspaceId: beta.id, createdAt: 40, updatedAt: 100 },
    { id: 'c-archived', workspaceId: archivedOnly.id, createdAt: 1_000, updatedAt: 1_000, archived: true },
    { id: 'e-session', workspaceId: equal.id, createdAt: 80, updatedAt: 100 },
  )
  insertSessions(databasePath, sessions)

  const ordinarySessionPage = await storage.call('sessionPage', { workspaceId: alpha.id, limit: 60 })
  expect(ordinarySessionPage.items.map((item) => item.id)).not.toContain('a-session-060')

  const createdPages = [await queries.execute('workspace.activity.list', { sortBy: 'createdAt', limit: 2 })]
  for (let pageIndex = 0; pageIndex < 2; pageIndex++) {
    const lastPage = createdPages.at(-1)
    const cursor = lastPage?.nextCursor
    if (!cursor) break
    createdPages.push(await queries.execute('workspace.activity.list', { sortBy: 'createdAt', limit: 2, cursor }))
  }
  const createdItems = createdPages.flatMap((page) => page.items)
  const expectedCreatedOrder = [alpha.id, equal.id].sort((left, right) => left.localeCompare(right))
  expectedCreatedOrder.push(beta.id, ...[archivedOnly.id, empty.id].sort((left, right) => left.localeCompare(right)))
  expect(createdItems.map((item) => item.workspace.id)).toEqual(expectedCreatedOrder)
  expect(createdItems.find((item) => item.workspace.id === alpha.id)).toMatchObject({
    latestSessionCreatedAt: 80,
    latestSessionUpdatedAt: 50,
  })
  expect(createdItems.find((item) => item.workspace.id === archivedOnly.id)).toMatchObject({
    latestSessionCreatedAt: null,
    latestSessionUpdatedAt: null,
  })

  const updatedPages = [await queries.execute('workspace.activity.list', { sortBy: 'updatedAt', limit: 2 })]
  for (let pageIndex = 0; pageIndex < 2; pageIndex++) {
    const lastPage = updatedPages.at(-1)
    const cursor = lastPage?.nextCursor
    if (!cursor) break
    updatedPages.push(await queries.execute('workspace.activity.list', { sortBy: 'updatedAt', limit: 2, cursor }))
  }
  const updatedItems = updatedPages.flatMap((page) => page.items)
  const expectedUpdatedOrder = [beta.id, equal.id].sort((left, right) => left.localeCompare(right))
  expectedUpdatedOrder.push(alpha.id, ...[archivedOnly.id, empty.id].sort((left, right) => left.localeCompare(right)))
  expect(updatedItems.map((item) => item.workspace.id)).toEqual(expectedUpdatedOrder)
  expect(updatedItems.find((item) => item.workspace.id === beta.id)).toMatchObject({
    latestSessionCreatedAt: 40,
    latestSessionUpdatedAt: 100,
  })
  const includedPage = await queries.execute('workspace.activity.list', {
    sortBy: 'updatedAt',
    limit: 1,
    includeWorkspaceIds: [empty.id, alpha.id],
  })
  expect(includedPage.includedItems.map((item) => item.workspace.id)).toEqual(
    [empty.id, alpha.id].sort((left, right) => left.localeCompare(right)),
  )
  expect(includedPage.includedItems.find((item) => item.workspace.id === empty.id)).toMatchObject({
    latestSessionCreatedAt: null,
    latestSessionUpdatedAt: null,
  })
  expect(includedPage.includedItems.find((item) => item.workspace.id === alpha.id)).toMatchObject({
    latestSessionCreatedAt: 80,
    latestSessionUpdatedAt: 50,
  })

  const database = new Database(databasePath)
  try {
    const indexNames = database
      .query<{ name: string }, []>('PRAGMA index_list(sessions)')
      .all()
      .map((row) => row.name)
    expect(indexNames).toContain('sessions_workspace_archived_created_id')
    expect(indexNames).toContain('sessions_workspace_archived_updated_id')
  } finally {
    database.close()
  }
})

test('workspace activity rejects a page cursor after session activity changes', async () => {
  const { root, databasePath, storage, queries } = await fixture()
  const first = await storage.call('createWorkspace', join(root, 'first'), 'First')
  const second = await storage.call('createWorkspace', join(root, 'second'), 'Second')
  insertSessions(databasePath, [
    { id: 'first-session', workspaceId: first.id, createdAt: 10, updatedAt: 10 },
    { id: 'second-session', workspaceId: second.id, createdAt: 20, updatedAt: 20 },
  ])
  const page = await queries.execute('workspace.activity.list', { sortBy: 'updatedAt', limit: 1 })
  const cursor = page.nextCursor
  if (!cursor) throw new Error('Expected a second workspace activity page')

  setSessionActivity(databasePath, { id: 'first-session', archived: true })
  let staleCursorError: unknown
  try {
    await queries.execute('workspace.activity.list', {
      sortBy: 'updatedAt',
      limit: 1,
      cursor,
    })
  } catch (error) {
    staleCursorError = error
  }
  expect(staleCursorError).toMatchObject({ code: 'STALE_CURSOR' })
})
