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
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('hbar-session-activity-'))
      throw new Error('Refusing to remove an unexpected session activity test directory')
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-session-activity-'))
  const databasePath = join(root, 'test.sqlite')
  const storage = new Storage(databasePath)
  await storage.call('ready')
  const queries = createDirectoryQueries({
    workspacePage: (input) => storage.call('workspacePage', input),
    workspaceActivityPage: (input) => storage.call('workspaceActivityPage', input),
    sessionActivityPage: (input) => storage.call('sessionActivityPage', input),
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
    readonly parentId?: string | null
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
          session.parentId ?? null,
          session.createdAt,
          session.updatedAt,
        )
    })()
  } finally {
    database.close()
  }
}

function setSessionActivity(databasePath: string, sessionId: string, updatedAt: number) {
  const database = new Database(databasePath)
  try {
    database.query('UPDATE sessions SET updatedAt=? WHERE id=?').run(updatedAt, sessionId)
  } finally {
    database.close()
  }
}

test('session activity sorts all non-archived sessions by either timestamp and pages ID ties', async () => {
  const { root, databasePath, storage, queries } = await fixture()
  const workspace = await storage.call('createWorkspace', join(root, 'workspace'), 'Workspace')
  const sessions: {
    readonly id: string
    readonly workspaceId: string
    readonly createdAt: number
    readonly updatedAt: number
    readonly archived?: boolean
    readonly parentId?: string | null
  }[] = Array.from({ length: 60 }, (_, index) => ({
    id: `middle-${String(index).padStart(3, '0')}`,
    workspaceId: workspace.id,
    createdAt: 10,
    updatedAt: 10,
  }))
  sessions.push(
    { id: 'a-created-later', workspaceId: workspace.id, createdAt: 90, updatedAt: 5 },
    { id: 'b-updated-later', workspaceId: workspace.id, createdAt: 20, updatedAt: 100 },
    { id: 'c-created-tie-a', workspaceId: workspace.id, createdAt: 80, updatedAt: 40 },
    { id: 'c-created-tie-b', workspaceId: workspace.id, createdAt: 80, updatedAt: 40 },
    { id: 'd-nested-child', workspaceId: workspace.id, parentId: 'a-created-later', createdAt: 70, updatedAt: 15 },
    { id: 'z-outside-id-page', workspaceId: workspace.id, createdAt: 100, updatedAt: 6 },
    { id: 'zz-archived', workspaceId: workspace.id, createdAt: 1_000, updatedAt: 1_000, archived: true },
  )
  insertSessions(databasePath, sessions)

  const ordinaryPage = await storage.call('sessionPage', { workspaceId: workspace.id, limit: 60 })
  expect(ordinaryPage.items.map((item) => item.id)).not.toContain('z-outside-id-page')

  const createdFirst = await queries.execute('session.activity.list', {
    workspaceId: workspace.id,
    sortBy: 'createdAt',
    limit: 3,
  })
  expect(createdFirst.items.map((item) => item.id)).toEqual(['z-outside-id-page', 'a-created-later', 'c-created-tie-a'])
  expect(createdFirst.nextCursor).toMatchObject({
    workspaceId: workspace.id,
    sortBy: 'createdAt',
    timestamp: 80,
    sessionId: 'c-created-tie-a',
  })
  if (!createdFirst.nextCursor) throw new Error('Expected another session activity page')
  const createdSecond = await queries.execute('session.activity.list', {
    workspaceId: workspace.id,
    sortBy: 'createdAt',
    limit: 3,
    cursor: createdFirst.nextCursor,
  })
  expect(createdSecond.items.map((item) => item.id)).toEqual(['c-created-tie-b', 'd-nested-child', 'b-updated-later'])

  const updatedPage = await queries.execute('session.activity.list', {
    workspaceId: workspace.id,
    sortBy: 'updatedAt',
    limit: 3,
  })
  expect(updatedPage.items.map((item) => item.id)).toEqual(['b-updated-later', 'c-created-tie-a', 'c-created-tie-b'])
  const all = await queries.execute('session.activity.list', { workspaceId: workspace.id, limit: 200 })
  expect(all.items).toHaveLength(66)
  expect(all.items.map((item) => item.id)).toContain('d-nested-child')
  expect(all.items.map((item) => item.id)).not.toContain('zz-archived')
})

test('session activity rejects mismatched and stale cursors', async () => {
  const { root, databasePath, storage, queries } = await fixture()
  const workspace = await storage.call('createWorkspace', join(root, 'workspace'), 'Workspace')
  const otherWorkspace = await storage.call('createWorkspace', join(root, 'other'), 'Other')
  insertSessions(databasePath, [
    { id: 'first-session', workspaceId: workspace.id, createdAt: 10, updatedAt: 10 },
    { id: 'second-session', workspaceId: workspace.id, createdAt: 20, updatedAt: 20 },
    { id: 'other-first', workspaceId: otherWorkspace.id, createdAt: 30, updatedAt: 30 },
    { id: 'other-second', workspaceId: otherWorkspace.id, createdAt: 40, updatedAt: 40 },
  ])
  const first = await queries.execute('session.activity.list', { workspaceId: workspace.id, limit: 1 })
  const cursor = first.nextCursor
  if (!cursor) throw new Error('Expected another session activity page')

  let wrongWorkspaceError: unknown
  try {
    await queries.execute('session.activity.list', { workspaceId: otherWorkspace.id, cursor })
  } catch (error) {
    wrongWorkspaceError = error
  }
  expect(wrongWorkspaceError).toMatchObject({ code: 'INVALID_INPUT' })
  let wrongSortError: unknown
  try {
    await queries.execute('session.activity.list', { workspaceId: workspace.id, sortBy: 'createdAt', cursor })
  } catch (error) {
    wrongSortError = error
  }
  expect(wrongSortError).toMatchObject({ code: 'INVALID_INPUT' })

  setSessionActivity(databasePath, 'first-session', 50)
  let staleCursorError: unknown
  try {
    await queries.execute('session.activity.list', { workspaceId: workspace.id, cursor })
  } catch (error) {
    staleCursorError = error
  }
  expect(staleCursorError).toMatchObject({ code: 'STALE_CURSOR' })
})
