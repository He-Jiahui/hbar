import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  createPartitionProjectionRepository,
  partitionShallowSnapshotSchema,
  serializePartitionSnapshot,
  type PartitionAuthority,
  type SessionShallowSnapshot,
} from '../packages/storage/src/partition-projection'
import { createPartitionOutbox } from '../packages/storage/src/partition-outbox'

const partitionId = '11111111-1111-4111-8111-111111111111'
const ownerPartitionId = '22222222-2222-4222-8222-222222222222'
const sourceEpoch = '33333333-3333-4333-8333-333333333333'
const nextEpoch = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
function snapshot(entityId = 'legacy-session', revision = 1): SessionShallowSnapshot {
  return {
    kind: 'session',
    entityId,
    partitionId,
    ownerPartitionId,
    sourceEpoch,
    revision,
    eventCursor: revision,
    checkpoint: 'full',
    tombstone: false,
    data: {
      session: {
        id: entityId,
        workspaceId: 'project',
        title: 'Session',
        archived: false,
        parentId: null,
        createdAt: 1,
        updatedAt: revision,
        seq: revision,
      },
      summary: {
        sessionId: entityId,
        workspaceId: 'project',
        activity: 'idle',
        activeRunId: null,
        lastResponseAt: null,
        updatedAt: revision,
        seq: revision,
      },
      execution: { state: 'idle', activeCount: 0, queuedCount: 0 },
    },
  }
}
function authority(value: SessionShallowSnapshot): PartitionAuthority {
  return {
    kind: value.kind,
    entityId: value.entityId,
    partitionId: value.partitionId,
    ownerPartitionId: value.ownerPartitionId,
    sourceEpoch: value.sourceEpoch,
  }
}
const directories: string[] = []
const connections: Database[] = []
function directory() {
  const path = mkdtempSync(join(tmpdir(), 'hbar-partition-projection-'))
  directories.push(path)
  return path
}
function open(path: string) {
  const db = new Database(path, { strict: true })
  connections.push(db)
  return db
}
afterEach(() => {
  for (const db of connections.splice(0)) db.close()
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('independent partition shallow checkpoints', () => {
  test('business rollback removes staged outbox and source state together', () => {
    const db = open(join(directory(), 'source.sqlite'))
    db.run('CREATE TABLE business(value TEXT)')
    const outbox = createPartitionOutbox(db)
    expect(() => outbox.stage(snapshot())).toThrow('transaction')
    expect(() =>
      outbox.transaction(() => {
        db.run("INSERT INTO business VALUES('changed')")
        outbox.stage(snapshot())
        throw new Error('rollback')
      }),
    ).toThrow('rollback')
    expect(outbox.list(10)).toEqual([])
    expect(db.query<{ count: number }, []>('SELECT count(*) AS count FROM business').get()?.count).toBe(0)
    const functionWithThen = Object.assign(() => undefined, { then: true })
    expect(() =>
      outbox.transaction(() => {
        db.run("INSERT INTO business VALUES('must rollback')")
        return functionWithThen
      }),
    ).toThrow('synchronous')
    expect(db.query<{ count: number }, []>('SELECT count(*) AS count FROM business').get()?.count).toBe(0)
  })

  test('crash after parent commit reopens source and replays before exact acknowledgement', () => {
    const path = directory()
    const sourcePath = join(path, 'source.sqlite')
    const source = open(sourcePath)
    const outbox = createPartitionOutbox(source)
    const value = snapshot()
    outbox.transaction(() => outbox.stage(value))
    const parent = createPartitionProjectionRepository(open(join(path, 'parent.sqlite')))
    parent.registerAuthority(authority(value), null)
    expect(parent.apply(value)).toBe('applied')
    source.close()
    connections.splice(connections.indexOf(source), 1)
    const recovered = createPartitionOutbox(open(sourcePath))
    expect(recovered.list(10)).toEqual([value])
    expect(parent.apply(value)).toBe('duplicate')
    expect(recovered.acknowledge({ ...authority(value), revision: 1 })).toBe(true)
    expect(recovered.list(10)).toEqual([])
  })

  test('explicit owner epoch CAS rejects unknown, old and conflicting checkpoints', () => {
    const parent = createPartitionProjectionRepository(open(join(directory(), 'parent.sqlite')))
    const value = snapshot()
    expect(() => parent.apply(value)).toThrow('authority')
    parent.registerAuthority(authority(value), null)
    parent.apply(value)
    expect(() =>
      parent.apply({
        ...value,
        data: value.data && { ...value.data, session: { ...value.data.session, title: 'conflicting title' } },
      }),
    ).toThrow('Conflicting')
    expect(() => parent.apply({ ...value, sourceEpoch: nextEpoch })).toThrow('epoch')
    expect(() => parent.registerAuthority({ ...authority(value), sourceEpoch: nextEpoch }, null)).toThrow('conflict')
    expect(() =>
      parent.registerAuthority({ ...authority(value), ownerPartitionId: partitionId }, authority(value)),
    ).toThrow('new source epoch')
    parent.registerAuthority({ ...authority(value), sourceEpoch: nextEpoch }, authority(value))
    parent.registerAuthority(
      { ...authority(value), sourceEpoch: nextEpoch.toUpperCase() },
      { ...authority(value), sourceEpoch: nextEpoch.toUpperCase() },
    )
    expect(() => parent.registerAuthority(authority(value), { ...authority(value), sourceEpoch: nextEpoch })).toThrow(
      'reused',
    )
    expect(() => parent.apply(value)).toThrow('epoch')
    expect(parent.apply({ ...value, sourceEpoch: nextEpoch })).toBe('applied')
    expect(parent.apply({ ...value, sourceEpoch: nextEpoch.toUpperCase() })).toBe('duplicate')
    expect(() => parent.apply({ ...value, sourceEpoch: nextEpoch, ownerPartitionId: partitionId })).toThrow('authority')
  })

  test('full checkpoints repair revision gaps but never regress cursor or resurrect tombstones', () => {
    const parent = createPartitionProjectionRepository(open(join(directory(), 'parent.sqlite')))
    const initial = snapshot()
    parent.registerAuthority(authority(initial), null)
    parent.apply(initial)
    expect(parent.apply(snapshot('legacy-session', 8))).toBe('applied')
    expect(parent.apply(initial)).toBe('stale')
    expect(() => parent.apply({ ...snapshot('legacy-session', 7), revision: 9 })).toThrow('regressed')
    const deleted = { ...snapshot('legacy-session', 10), tombstone: true, data: null }
    expect(parent.apply(deleted)).toBe('applied')
    expect(parent.apply(deleted)).toBe('duplicate')
    expect(parent.apply(snapshot('legacy-session', 9))).toBe('stale')
    expect(() => parent.apply(snapshot('legacy-session', 11))).toThrow('resurrection')
    expect(parent.list({ kind: 'session', limit: 10 }).items).toEqual([])
  })

  test('outbox coalesces latest full snapshot and late acknowledgement cannot erase newer work', () => {
    const outbox = createPartitionOutbox(open(join(directory(), 'source.sqlite')))
    for (let revision = 1; revision <= 250; revision++)
      outbox.transaction(() => outbox.stage(snapshot('legacy-session', revision)))
    expect(outbox.list(200)).toEqual([snapshot('legacy-session', 250)])
    expect(outbox.acknowledge({ ...authority(snapshot()), revision: 1 })).toBe(false)
    expect(outbox.list(200)).toHaveLength(1)
    expect(outbox.acknowledge({ ...authority(snapshot()), revision: 250 })).toBe(true)
    expect(() => outbox.transaction(() => outbox.stage(snapshot()))).toThrow('regressed')
    expect(() => outbox.list(201)).toThrow()
  })

  test('parent indexed pages remain available with children inaccessible and invalidate on change', () => {
    const path = directory()
    const child = join(path, 'child.sqlite')
    const childDb = open(child)
    childDb.run('CREATE TABLE inaccessible(value TEXT)')
    childDb.close()
    connections.splice(connections.indexOf(childDb), 1)
    renameSync(child, `${child}.offline`)
    const parent = createPartitionProjectionRepository(open(join(path, 'parent.sqlite')))
    for (const id of ['a', 'b', 'c']) {
      const value = snapshot(id)
      parent.registerAuthority(authority(value), null)
      parent.apply(value)
    }
    const first = parent.list({ kind: 'session', limit: 2 })
    expect(first.items.map((item) => item.entityId)).toEqual(['a', 'b'])
    if (!first.nextCursor) throw new Error('Expected next cursor')
    expect(
      parent.list({ kind: 'session', limit: 2, cursor: first.nextCursor }).items.map((item) => item.entityId),
    ).toEqual(['c'])
    parent.apply(snapshot('a', 2))
    const cursor = first.nextCursor
    expect(() => parent.list({ kind: 'session', limit: 2, cursor })).toThrow('invalidated')
  })

  test('strict bounded snapshots reject legacy long titles, heavy unknown data and invalid partition UUIDs', () => {
    const value = snapshot()
    expect(serializePartitionSnapshot(value)).toContain('legacy-session')
    expect(() => serializePartitionSnapshot({ ...value, partitionId: 'legacy-id' })).toThrow()
    if (!value.data) throw new Error('Missing fixture data')
    const data = value.data
    expect(() =>
      serializePartitionSnapshot({
        ...value,
        data: { ...data, session: { ...data.session, title: 'x'.repeat(161) } },
      }),
    ).toThrow()
    expect(() => partitionShallowSnapshotSchema.parse({ ...value, data: { ...value.data, messages: [] } })).toThrow()
    expect(() => serializePartitionSnapshot({ ...value, eventCursor: 0 })).toThrow('checkpoint')
    expect(() =>
      serializePartitionSnapshot({
        kind: 'project',
        entityId: 'project',
        partitionId,
        ownerPartitionId,
        sourceEpoch,
        revision: 1,
        eventCursor: 0,
        checkpoint: 'full',
        tombstone: false,
        data: {
          workspace: { id: 'project', path: '中'.repeat(4000), name: '文'.repeat(4000), createdAt: 0 },
          updatedAt: 0,
          sessionCount: 0,
          activeSessionCount: 0,
          archivedSessionCount: 0,
        },
      }),
    ).not.toThrow()
  })

  test('global project catalog uses the supplied global connection only', () => {
    const global = createPartitionProjectionRepository(open(join(directory(), 'global.sqlite')))
    const project = {
      kind: 'project' as const,
      entityId: 'legacy-project',
      partitionId,
      ownerPartitionId,
      sourceEpoch,
      revision: 1,
      eventCursor: 0,
      checkpoint: 'full' as const,
      tombstone: false,
      data: {
        workspace: { id: 'legacy-project', path: '/inaccessible/project', name: 'Project', createdAt: 0 },
        updatedAt: 0,
        sessionCount: 1000000,
        activeSessionCount: 3,
        archivedSessionCount: 4,
      },
    }
    global.registerAuthority(
      { kind: project.kind, entityId: project.entityId, partitionId, ownerPartitionId, sourceEpoch },
      null,
    )
    global.apply(project)
    expect(global.list({ kind: 'project', limit: 10 }).items).toEqual([project])
  })

  test('shallow model Goal and Plan progress exposes bounded structured state without content', () => {
    const value = snapshot()
    if (!value.data) throw new Error('Missing fixture data')
    const progress = {
      model: { modelId: 'model', revision: 1 },
      goal: {
        goalId: 'goal',
        status: 'active' as const,
        revision: 2,
        tokenBudget: 1000,
        tokensUsed: 100,
        timeUsedSeconds: 3,
      },
      plan: {
        revision: 3,
        turnId: 'turn',
        status: 'in_progress' as const,
        totalSteps: 4,
        completedSteps: 2,
        inProgressSteps: 1,
      },
    }
    const withProgress = { ...value, data: { ...value.data, progress } }
    expect(JSON.parse(serializePartitionSnapshot(withProgress))).toEqual(withProgress)
    expect(() =>
      partitionShallowSnapshotSchema.parse({
        ...withProgress,
        data: {
          ...withProgress.data,
          progress: { ...progress, goal: { ...progress.goal, objective: 'full prompt must not escape' } },
        },
      }),
    ).toThrow()
    expect(() =>
      partitionShallowSnapshotSchema.parse({
        ...withProgress,
        data: { ...withProgress.data, progress: { ...progress, plan: { ...progress.plan, totalSteps: 1 } } },
      }),
    ).toThrow()
  })

  test('parent projection and aggregate outbox share one source transaction without cross-database atomicity', () => {
    const projectDb = open(join(directory(), 'project.sqlite'))
    const parent = createPartitionProjectionRepository(projectDb)
    const aggregateOutbox = createPartitionOutbox(projectDb)
    const child = snapshot()
    parent.registerAuthority(authority(child), null)
    const aggregate = {
      kind: 'project' as const,
      entityId: 'project',
      partitionId: ownerPartitionId,
      ownerPartitionId: partitionId,
      sourceEpoch,
      revision: 1,
      eventCursor: 1,
      checkpoint: 'full' as const,
      tombstone: false,
      data: {
        workspace: { id: 'project', path: '/project', name: 'Project', createdAt: 0 },
        updatedAt: 1,
        sessionCount: 1,
        activeSessionCount: 0,
        archivedSessionCount: 0,
      },
    }
    expect(() =>
      aggregateOutbox.transaction(() => {
        parent.apply(child)
        aggregateOutbox.stage(aggregate)
        throw new Error('aggregate rollback')
      }),
    ).toThrow('aggregate rollback')
    expect(parent.list({ kind: 'session', limit: 10 }).items).toEqual([])
    expect(aggregateOutbox.list(10)).toEqual([])
    aggregateOutbox.transaction(() => {
      parent.apply(child)
      aggregateOutbox.stage(aggregate)
    })
    expect(parent.list({ kind: 'session', limit: 10 }).items).toEqual([child])
    expect(aggregateOutbox.list(10)).toEqual([aggregate])
  })
})
