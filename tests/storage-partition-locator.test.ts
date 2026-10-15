import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPartitionLocatorRepository } from '../packages/storage/src/partition-locator'
import type { SessionLocator } from '../packages/storage/src/partition-locator-schema'

const generation = '11111111-1111-4111-8111-111111111111'
const project = '22222222-2222-4222-8222-222222222222'
const partition = '33333333-3333-4333-8333-333333333333'
const epoch = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const roots: string[] = []
const databases: Database[] = []
afterEach(() => {
  for (const db of databases.splice(0)) db.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function open(path: string) {
  const db = new Database(path, { strict: true })
  db.run('PRAGMA foreign_keys=ON')
  databases.push(db)
  return createPartitionLocatorRepository(db, generation)
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'hbar-locator-'))
  roots.push(root)
  const path = join(root, 'catalog.sqlite')
  const repo = open(path)
  repo.registerProject({ workspaceId: 'legacy-project', generation, projectPartitionId: project, revision: 1 }, null)
  const session: SessionLocator = {
    sessionId: 'legacy-session',
    workspaceId: 'legacy-project',
    address: { generation, projectPartitionId: project, partitionId: partition, incarnation: epoch },
    sourceEpoch: epoch,
    revision: 1,
    state: 'active',
  }
  repo.registerSession(session, null)
  return { repo, session, path }
}
test('two independent connections CAS the same durable revision; reopening retains the winner', () => {
  const { repo, session, path } = fixture()
  const other = open(path)
  repo.registerSession({ ...session, revision: 2, state: 'moving' }, 1)
  expect(() => other.registerSession({ ...session, revision: 2 }, 1)).toThrow('CAS_CONFLICT')
  expect(open(path).resolveSession(session.sessionId)).toEqual({ status: 'recovering' })
  expect(() => other.registerSession({ ...session, revision: 3, sourceEpoch: partition }, 2)).toThrow('REBIND')
  repo.registerSession({ ...session, revision: 3, state: 'tombstone' }, 2)
  expect(other.resolveSession(session.sessionId)).toEqual({ status: 'tombstoned' })
  expect(() => other.registerSession({ ...session, revision: 4 }, 3)).toThrow('TOMBSTONED')
})
test('typed entity locators refuse rebind, unknown epoch, stale imports and missing identities', () => {
  const { repo, session, path } = fixture()
  for (const kind of ['run', 'approval', 'message', 'recoveryChain'] as const) {
    const value = {
      kind,
      id: `legacy-${kind}`,
      sessionId: session.sessionId,
      address: session.address,
      sourceEpoch: epoch,
      sourceRevision: 2,
    }
    repo.importEntity(value)
    repo.importEntity({ ...value, sourceEpoch: epoch.toUpperCase() })
    expect(open(path).resolveEntity(kind, value.id)).toEqual({ status: 'active', session })
    expect(() => repo.importEntity({ ...value, sourceRevision: 1 })).toThrow('STALE')
    expect(() => repo.importEntity({ ...value, sourceEpoch: partition })).toThrow('IDENTITY_CONFLICT')
    expect(() => repo.importEntity({ ...value, address: { ...session.address, incarnation: project } })).toThrow(
      'IDENTITY_CONFLICT',
    )
  }
  expect(repo.resolveSession('missing')).toEqual({ status: 'missing' })
  expect(repo.resolveEntity('run', 'missing')).toEqual({ status: 'missing' })
  expect(() =>
    repo.registerSession(
      { ...session, sessionId: 'another', address: { ...session.address, partitionId: '../escape' } },
      null,
    ),
  ).toThrow()
  const existing = new Database(path, { strict: true })
  existing.run('PRAGMA foreign_keys=ON')
  databases.push(existing)
  expect(() => createPartitionLocatorRepository(existing, project)).toThrow('GENERATION_MISMATCH')
})

test('project membership and Session incarnation cannot be rebound even with a newer revision', () => {
  const { repo, session } = fixture()
  repo.registerProject({ workspaceId: 'second-project', generation, projectPartitionId: epoch, revision: 1 }, null)
  expect(() =>
    repo.registerSession({ ...session, sessionId: 'wrong-project', workspaceId: 'second-project' }, null),
  ).toThrow('PROJECT_MISMATCH')
  expect(() =>
    repo.registerSession({ ...session, revision: 2, address: { ...session.address, incarnation: project } }, 1),
  ).toThrow('REBIND')
  expect(() =>
    repo.registerProject({ workspaceId: 'legacy-project', generation, projectPartitionId: epoch, revision: 2 }, 1),
  ).toThrow('REBIND')
  const second = {
    ...session,
    sessionId: 'second-session',
    workspaceId: 'second-project',
    address: { ...session.address, projectPartitionId: epoch, partitionId: epoch },
  }
  repo.registerSession(second, null)
  expect(repo.resolveSession(second.sessionId)).toEqual({ status: 'active', session: second })
  repo.registerSession({ ...second, revision: 2, state: 'staging' }, 1)
  expect(repo.resolveSession(second.sessionId)).toEqual({ status: 'recovering' })
  expect(repo.resolveSession(session.sessionId)).toEqual({ status: 'active', session })
})

test('mismatched generation initialization leaves partial schema and all original rows unchanged', () => {
  const root = mkdtempSync(join(tmpdir(), 'hbar-locator-mismatch-'))
  roots.push(root)
  const db = new Database(join(root, 'partial.sqlite'), { strict: true })
  databases.push(db)
  db.run('PRAGMA foreign_keys=ON')
  db.exec(`CREATE TABLE partition_locator_metadata(singleton INTEGER PRIMARY KEY,generation TEXT NOT NULL) STRICT;
    CREATE TABLE unrelated(id INTEGER PRIMARY KEY,value TEXT NOT NULL) STRICT;`)
  db.run('INSERT INTO partition_locator_metadata VALUES(1,?)', [epoch])
  db.run("INSERT INTO unrelated VALUES(1,'preserved')")
  const schema = () =>
    db
      .query<{ type: string; name: string; tbl_name: string; sql: string | null }, []>(
        'SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name',
      )
      .all()
  const before = schema()
  expect(() => createPartitionLocatorRepository(db, generation)).toThrow('GENERATION_MISMATCH')
  expect(schema()).toEqual(before)
  expect(db.query<{ generation: string }, []>('SELECT generation FROM partition_locator_metadata').all()).toEqual([
    { generation: epoch },
  ])
  expect(db.query<{ id: number; value: string }, []>('SELECT id,value FROM unrelated').all()).toEqual([
    { id: 1, value: 'preserved' },
  ])
})

for (const corrupted of [
  'project-key',
  'session-key',
  'session-relation',
  'entity-key',
  'entity-relation',
  'entity-revision',
] as const)
  test(`valid JSON with corrupt ${corrupted} fails closed instead of choosing another owner`, () => {
    const { repo, session, path } = fixture()
    const db = new Database(path, { strict: true })
    databases.push(db)
    db.run('PRAGMA foreign_keys=ON')
    const imported = {
      kind: 'run' as const,
      id: 'run-a',
      sessionId: session.sessionId,
      address: session.address,
      sourceEpoch: epoch,
      sourceRevision: 1,
    }
    repo.importEntity(imported)
    if (corrupted === 'project-key') {
      db.run('UPDATE partition_project_locators SET payload=? WHERE workspace_id=?', [
        JSON.stringify({ workspaceId: 'other-project', generation, projectPartitionId: project, revision: 1 }),
        'legacy-project',
      ])
      expect(() => repo.resolveWorkspace('legacy-project')).toThrow('IDENTITY_CONFLICT')
    } else if (corrupted === 'session-key' || corrupted === 'session-relation') {
      db.run('UPDATE partition_session_locators SET payload=? WHERE session_id=?', [
        JSON.stringify({
          ...session,
          ...(corrupted === 'session-key' ? { sessionId: 'other-session' } : { workspaceId: 'other-project' }),
        }),
        session.sessionId,
      ])
      expect(() => repo.resolveSession(session.sessionId)).toThrow('IDENTITY_CONFLICT')
    } else {
      db.run('UPDATE partition_entity_locators SET payload=? WHERE kind=? AND id=?', [
        JSON.stringify({
          ...imported,
          ...(corrupted === 'entity-key'
            ? { id: 'run-b' }
            : corrupted === 'entity-relation'
              ? { sessionId: 'other-session' }
              : { sourceRevision: 2 }),
        }),
        'run',
        'run-a',
      ])
      expect(() => repo.resolveEntity('run', 'run-a')).toThrow('IDENTITY_CONFLICT')
      expect(() => repo.importEntity({ ...imported, sourceRevision: 3 })).toThrow('IDENTITY_CONFLICT')
    }
    expect(
      db.query<{ count: number }, []>('SELECT count(*) AS count FROM partition_session_locators').get()?.count,
    ).toBe(1)
  })
