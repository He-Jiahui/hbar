import type { Database } from 'bun:sqlite'
import { partitionIdSchema } from './partition-layout'
import {
  entityLocatorSchema,
  projectLocatorSchema,
  sessionLocatorSchema,
  locatorEntityIdSchema,
  type EntityLocator,
  type ProjectLocator,
  type SessionLocator,
  type LocatorResolution,
} from './partition-locator-schema'

export interface PartitionLocatorReader {
  readonly generation: string
  resolveWorkspace(workspaceId: string): ProjectLocator | null
  resolveSession(sessionId: string): LocatorResolution
  resolveEntity(kind: EntityLocator['kind'], id: string): LocatorResolution
}
export interface PartitionLocatorRepository extends PartitionLocatorReader {
  registerProject(input: ProjectLocator, expectedRevision: number | null): void
  registerSession(input: SessionLocator, expectedRevision: number | null): void
  importEntity(input: EntityLocator): void
}

/** Worker-owned catalog connection; this repository never opens any child database. */
export function createPartitionLocatorRepository(db: Database, expectedGeneration: string): PartitionLocatorRepository {
  const generation = partitionIdSchema.parse(expectedGeneration)
  const foreignKeys = db.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get()
  if (foreignKeys?.foreign_keys !== 1) throw new Error('PARTITION_LOCATOR_FOREIGN_KEYS_REQUIRED')
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS partition_locator_metadata(singleton INTEGER PRIMARY KEY CHECK(singleton=1),generation TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS partition_project_locators(workspace_id TEXT PRIMARY KEY,partition_id TEXT NOT NULL UNIQUE,revision INTEGER NOT NULL CHECK(revision>0),payload TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS partition_session_locators(session_id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES partition_project_locators(workspace_id),partition_id TEXT NOT NULL UNIQUE,revision INTEGER NOT NULL CHECK(revision>0),payload TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS partition_entity_locators(kind TEXT NOT NULL CHECK(kind IN ('run','approval','message','recoveryChain')),id TEXT NOT NULL,session_id TEXT NOT NULL REFERENCES partition_session_locators(session_id),source_revision INTEGER NOT NULL CHECK(source_revision>0),payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=8192),PRIMARY KEY(kind,id)) STRICT;
    CREATE INDEX IF NOT EXISTS partition_entity_session ON partition_entity_locators(session_id,kind,id);`)
    db.run('INSERT OR IGNORE INTO partition_locator_metadata VALUES(1,?)', [generation])
    const stored = db
      .query<{ generation: string }, []>('SELECT generation FROM partition_locator_metadata WHERE singleton=1')
      .get()
    if (stored?.generation !== generation) throw new Error('PARTITION_LOCATOR_GENERATION_MISMATCH')
  }).immediate()
  const project = (id: string) => {
    locatorEntityIdSchema.parse(id)
    const row = db
      .query<{ workspace_id: string; partition_id: string; revision: number; payload: string }, [string]>(
        'SELECT workspace_id,partition_id,revision,payload FROM partition_project_locators WHERE workspace_id=?',
      )
      .get(id)
    const value = row ? projectLocatorSchema.parse(JSON.parse(row.payload)) : null
    if (
      row &&
      value &&
      (row.workspace_id !== id ||
        value.workspaceId !== id ||
        row.partition_id !== value.projectPartitionId ||
        row.revision !== value.revision)
    )
      throw new Error('PARTITION_LOCATOR_IDENTITY_CONFLICT')
    if (value && value.generation !== generation) throw new Error('PARTITION_LOCATOR_GENERATION_MISMATCH')
    return value
  }
  const session = (id: string) => {
    locatorEntityIdSchema.parse(id)
    const row = db
      .query<
        { session_id: string; workspace_id: string; partition_id: string; revision: number; payload: string },
        [string]
      >(
        'SELECT session_id,workspace_id,partition_id,revision,payload FROM partition_session_locators WHERE session_id=?',
      )
      .get(id)
    if (!row) return null
    const value = sessionLocatorSchema.parse(JSON.parse(row.payload))
    if (
      row.session_id !== id ||
      value.sessionId !== id ||
      row.workspace_id !== value.workspaceId ||
      row.partition_id !== value.address.partitionId ||
      row.revision !== value.revision
    )
      throw new Error('PARTITION_LOCATOR_IDENTITY_CONFLICT')
    const parent = project(value.workspaceId)
    if (!parent || parent.projectPartitionId !== value.address.projectPartitionId)
      throw new Error('PARTITION_LOCATOR_IDENTITY_CONFLICT')
    return value
  }
  const entity = (kind: EntityLocator['kind'], id: string) => {
    const row = db
      .query<
        { kind: string; id: string; session_id: string; source_revision: number; payload: string },
        [string, string]
      >('SELECT kind,id,session_id,source_revision,payload FROM partition_entity_locators WHERE kind=? AND id=?')
      .get(kind, id)
    if (!row) return null
    const value = entityLocatorSchema.parse(JSON.parse(row.payload))
    if (
      row.kind !== kind ||
      row.id !== id ||
      value.kind !== kind ||
      value.id !== id ||
      row.session_id !== value.sessionId ||
      row.source_revision !== value.sourceRevision
    )
      throw new Error('PARTITION_LOCATOR_IDENTITY_CONFLICT')
    return { value, payload: row.payload }
  }
  const resolve = (value: SessionLocator | null): LocatorResolution => {
    if (!value) return { status: 'missing' }
    if (value.address.generation !== generation) return { status: 'wrong-generation' }
    if (value.state === 'tombstone') return { status: 'tombstoned' }
    if (value.state !== 'active') return { status: 'recovering' }
    return { status: 'active', session: value }
  }
  const cas = (current: number | undefined, expected: number | null, next: number) => {
    if (expected !== null && (!Number.isSafeInteger(expected) || expected < 1))
      throw new Error('PARTITION_LOCATOR_CAS_INVALID')
    if ((current ?? null) !== expected || next <= (current ?? 0)) throw new Error('PARTITION_LOCATOR_CAS_CONFLICT')
  }
  return {
    generation,
    resolveWorkspace: project,
    resolveSession: (id) => resolve(session(id)),
    resolveEntity(kind, id) {
      entityLocatorSchema.shape.kind.parse(kind)
      locatorEntityIdSchema.parse(id)
      const row = entity(kind, id)
      if (!row) return { status: 'missing' }
      const owner = session(row.value.sessionId)
      if (
        !owner ||
        JSON.stringify(owner.address) !== JSON.stringify(row.value.address) ||
        owner.sourceEpoch !== row.value.sourceEpoch
      )
        throw new Error('PARTITION_LOCATOR_IDENTITY_CONFLICT')
      return resolve(owner)
    },
    registerProject(raw, expectedRevision) {
      const input = projectLocatorSchema.parse(raw)
      if (input.generation !== generation) throw new Error('PARTITION_LOCATOR_GENERATION_MISMATCH')
      db.transaction(() => {
        const current = project(input.workspaceId)
        cas(current?.revision, expectedRevision, input.revision)
        if (current && current.projectPartitionId !== input.projectPartitionId)
          throw new Error('PARTITION_LOCATOR_REBIND_FORBIDDEN')
        db.run(
          `INSERT INTO partition_project_locators VALUES(?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload`,
          [input.workspaceId, input.projectPartitionId, input.revision, JSON.stringify(input)],
        )
      }).immediate()
    },
    registerSession(raw, expectedRevision) {
      const input = sessionLocatorSchema.parse(raw)
      if (input.address.generation !== generation) throw new Error('PARTITION_LOCATOR_GENERATION_MISMATCH')
      db.transaction(() => {
        const parent = project(input.workspaceId)
        if (!parent || parent.projectPartitionId !== input.address.projectPartitionId)
          throw new Error('PARTITION_LOCATOR_PROJECT_MISMATCH')
        const current = session(input.sessionId)
        cas(current?.revision, expectedRevision, input.revision)
        if (
          current &&
          (JSON.stringify(current.address) !== JSON.stringify(input.address) ||
            current.sourceEpoch !== input.sourceEpoch ||
            current.workspaceId !== input.workspaceId)
        )
          throw new Error('PARTITION_LOCATOR_REBIND_FORBIDDEN')
        if (current?.state === 'tombstone' && input.state !== 'tombstone')
          throw new Error('PARTITION_LOCATOR_TOMBSTONED')
        db.run(
          `INSERT INTO partition_session_locators VALUES(?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload`,
          [input.sessionId, input.workspaceId, input.address.partitionId, input.revision, JSON.stringify(input)],
        )
      }).immediate()
    },
    /** Catalog import only. Production source publication requires its own transactional outbox protocol. */
    importEntity(raw) {
      const input = entityLocatorSchema.parse(raw)
      db.transaction(() => {
        const owner = session(input.sessionId)
        if (
          !owner ||
          owner.state !== 'active' ||
          JSON.stringify(owner.address) !== JSON.stringify(input.address) ||
          owner.sourceEpoch !== input.sourceEpoch
        )
          throw new Error('PARTITION_LOCATOR_IDENTITY_CONFLICT')
        const row = entity(input.kind, input.id)
        const payload = JSON.stringify(input)
        if (row) {
          const current = row.value
          if (
            current.sessionId !== input.sessionId ||
            current.sourceEpoch !== input.sourceEpoch ||
            JSON.stringify(current.address) !== JSON.stringify(input.address)
          )
            throw new Error('PARTITION_LOCATOR_REBIND_FORBIDDEN')
          if (current.sourceRevision > input.sourceRevision) throw new Error('PARTITION_LOCATOR_STALE')
          if (current.sourceRevision === input.sourceRevision) {
            if (row.payload !== payload) throw new Error('PARTITION_LOCATOR_REVISION_CONFLICT')
            return
          }
        }
        db.run(
          `INSERT INTO partition_entity_locators VALUES(?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET source_revision=excluded.source_revision,payload=excluded.payload`,
          [input.kind, input.id, input.sessionId, input.sourceRevision, payload],
        )
      }).immediate()
    },
  }
}
