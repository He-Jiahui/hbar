import type { Database } from 'bun:sqlite'
import { z } from 'zod'
import {
  PARTITION_PROJECTION_SQL,
  partitionAuthoritySchema,
  partitionShallowSnapshotSchema,
  serializePartitionSnapshot,
  type PartitionAuthority,
  type PartitionShallowSnapshot,
} from './partition-projection-schema'

export * from './partition-projection-schema'

interface SnapshotRow {
  source_epoch: string
  revision: number
  event_cursor: number
  tombstone: number
  payload: string
}
interface AuthorityRow {
  partition_id: string
  owner_partition_id: string
  source_epoch: string
}
const pageInputSchema = z.strictObject({
  kind: z.enum(['session', 'project']),
  limit: z.number().int().min(1).max(200),
  cursor: z
    .strictObject({
      kind: z.enum(['session', 'project']),
      revision: z.number().int().nonnegative().safe(),
      after: z.string().min(1).max(160),
    })
    .optional(),
})
export type PartitionProjectionPageInput = z.input<typeof pageInputSchema>
export interface PartitionProjectionPage {
  readonly revision: number
  readonly items: readonly PartitionShallowSnapshot[]
  readonly nextCursor: {
    readonly kind: 'session' | 'project'
    readonly revision: number
    readonly after: string
  } | null
}
export interface PartitionProjectionRepository {
  readonly registerAuthority: (raw: PartitionAuthority, expected: PartitionAuthority | null) => void
  readonly apply: (input: PartitionShallowSnapshot) => 'applied' | 'duplicate' | 'stale'
  readonly list: (input: PartitionProjectionPageInput) => PartitionProjectionPage
}

/** Synchronous Worker-owned repository; neither opens nor enumerates child databases. */
export function createPartitionProjectionRepository(db: Database): PartitionProjectionRepository {
  db.exec(PARTITION_PROJECTION_SQL)
  const readAuthority = (kind: string, entityId: string) =>
    db
      .query<AuthorityRow, [string, string]>(
        'SELECT partition_id,owner_partition_id,source_epoch FROM partition_projection_authorities WHERE kind=? AND entity_id=?',
      )
      .get(kind, entityId)
  const same = (row: AuthorityRow, authority: PartitionAuthority) =>
    row.partition_id === authority.partitionId &&
    row.owner_partition_id === authority.ownerPartitionId &&
    row.source_epoch === authority.sourceEpoch
  const advance = () => {
    db.run(
      'UPDATE partition_projection_generation SET revision=revision+1 WHERE singleton=1 AND revision < 9007199254740991',
    )
    if (db.query<{ changes: number }, []>('SELECT changes() AS changes').get()?.changes !== 1)
      throw new RangeError('Projection generation exhausted')
  }
  return {
    /** Explicit owner/epoch CAS is required before accepting checkpoints, including after restore. */
    registerAuthority(raw: PartitionAuthority, expected: PartitionAuthority | null): void {
      const authority = partitionAuthoritySchema.parse(raw)
      const expectedAuthority = expected === null ? null : partitionAuthoritySchema.parse(expected)
      db.transaction(() => {
        const current = readAuthority(authority.kind, authority.entityId)
        if (
          expectedAuthority === null
            ? current !== null
            : !current ||
              !same(current, expectedAuthority) ||
              expectedAuthority.kind !== authority.kind ||
              expectedAuthority.entityId !== authority.entityId
        )
          throw new Error('Partition authority compare-and-swap conflict')
        if (current && same(current, authority)) return
        if (current && current.source_epoch === authority.sourceEpoch)
          throw new Error('Changing partition ownership requires a new source epoch')
        if (
          db
            .query<{ source_epoch: string }, [string, string, string]>(
              'SELECT source_epoch FROM partition_projection_epochs WHERE kind=? AND entity_id=? AND source_epoch=?',
            )
            .get(authority.kind, authority.entityId, authority.sourceEpoch)
        )
          throw new Error('Partition source epoch cannot be reused')
        db.run('INSERT INTO partition_projection_epochs VALUES(?,?,?)', [
          authority.kind,
          authority.entityId,
          authority.sourceEpoch,
        ])
        db.run(
          `INSERT INTO partition_projection_authorities VALUES(?,?,?,?,?)
          ON CONFLICT(kind,entity_id) DO UPDATE SET partition_id=excluded.partition_id,
          owner_partition_id=excluded.owner_partition_id,source_epoch=excluded.source_epoch`,
          [
            authority.kind,
            authority.entityId,
            authority.partitionId,
            authority.ownerPartitionId,
            authority.sourceEpoch,
          ],
        )
        db.run('DELETE FROM partition_projection_snapshots WHERE kind=? AND entity_id=?', [
          authority.kind,
          authority.entityId,
        ])
        advance()
      }).immediate()
    },
    apply(input: PartitionShallowSnapshot): 'applied' | 'duplicate' | 'stale' {
      const payload = serializePartitionSnapshot(input)
      const snapshot = partitionShallowSnapshotSchema.parse(JSON.parse(payload))
      return db
        .transaction(() => {
          const authority = readAuthority(snapshot.kind, snapshot.entityId)
          if (!authority || !same(authority, snapshot)) throw new Error('Unregistered partition authority or epoch')
          const current = db
            .query<SnapshotRow, [string, string]>(
              'SELECT source_epoch,revision,event_cursor,tombstone,payload FROM partition_projection_snapshots WHERE kind=? AND entity_id=?',
            )
            .get(snapshot.kind, snapshot.entityId)
          if (current) {
            if (snapshot.revision < current.revision) return 'stale'
            if (snapshot.revision === current.revision) {
              if (payload !== current.payload) throw new Error('Conflicting partition checkpoint revision')
              return 'duplicate'
            }
            if (snapshot.eventCursor < current.event_cursor) throw new Error('Partition checkpoint cursor regressed')
            if (current.tombstone === 1 && !snapshot.tombstone)
              throw new Error('Partition tombstone prevents resurrection')
          }
          // Revision gaps are safe only because every accepted record is a complete checkpoint.
          db.run(
            `INSERT INTO partition_projection_snapshots VALUES(?,?,?,?,?,?,?)
          ON CONFLICT(kind,entity_id) DO UPDATE SET source_epoch=excluded.source_epoch,
          revision=excluded.revision,event_cursor=excluded.event_cursor,tombstone=excluded.tombstone,payload=excluded.payload`,
            [
              snapshot.kind,
              snapshot.entityId,
              snapshot.sourceEpoch,
              snapshot.revision,
              snapshot.eventCursor,
              Number(snapshot.tombstone),
              payload,
            ],
          )
          advance()
          return 'applied'
        })
        .immediate()
    },
    list(input: PartitionProjectionPageInput): PartitionProjectionPage {
      const page = pageInputSchema.parse(input)
      return db.transaction(() => {
        const generation = db
          .query<{ revision: number }, []>('SELECT revision FROM partition_projection_generation WHERE singleton=1')
          .get()
        if (!generation) throw new Error('Missing partition projection generation')
        if (page.cursor && (page.cursor.revision !== generation.revision || page.cursor.kind !== page.kind))
          throw new Error('Partition projection cursor invalidated; restart pagination')
        const rows = db
          .query<{ payload: string }, [string, string, number]>(
            `SELECT payload FROM partition_projection_snapshots WHERE kind=? AND tombstone=0
           AND entity_id > ? ORDER BY entity_id LIMIT ?`,
          )
          .all(page.kind, page.cursor?.after ?? '', page.limit + 1)
        const items = rows
          .slice(0, page.limit)
          .map((row) => partitionShallowSnapshotSchema.parse(JSON.parse(row.payload)))
        const last = items.at(-1)
        return {
          revision: generation.revision,
          items,
          nextCursor:
            rows.length > page.limit && last
              ? { kind: page.kind, revision: generation.revision, after: last.entityId }
              : null,
        }
      })()
    },
  }
}
