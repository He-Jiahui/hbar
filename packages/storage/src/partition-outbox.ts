import type { Database } from 'bun:sqlite'
import { z } from 'zod'
import {
  partitionAuthoritySchema,
  partitionShallowSnapshotSchema,
  serializePartitionSnapshot,
  type PartitionShallowSnapshot,
} from './partition-projection-schema'

const acknowledgementSchema = partitionAuthoritySchema.extend({ revision: z.number().int().positive().safe() })
export type PartitionOutboxAcknowledgement = z.output<typeof acknowledgementSchema>
interface OutboxRow {
  payload: string
  pending: number
}
export interface PartitionOutbox {
  readonly transaction: <T>(callback: () => T extends PromiseLike<unknown> ? never : T) => T
  readonly stage: (input: PartitionShallowSnapshot) => void
  readonly list: (limit: number) => readonly PartitionShallowSnapshot[]
  readonly acknowledge: (input: PartitionOutboxAcknowledgement) => boolean
}

/**
 * Durable latest full checkpoint to exactly one parent, coalesced per entity.
 * Session -> Project -> Global is a chain: a parent stages its own aggregate outbox
 * in the same transaction as applying child state. This is not a multi-sink acknowledgement.
 * Connections remain owned by the Worker; no cross-database atomicity is promised.
 */
export function createPartitionOutbox(db: Database): PartitionOutbox {
  db.exec(`CREATE TABLE IF NOT EXISTS partition_projection_outbox(
    kind TEXT NOT NULL CHECK(kind IN ('session','project')),
    entity_id TEXT NOT NULL,
    partition_id TEXT NOT NULL,
    owner_partition_id TEXT NOT NULL,
    source_epoch TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision > 0),
    pending INTEGER NOT NULL CHECK(pending IN (0,1)),
    payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB)) <= CASE kind WHEN 'project' THEN 65536 ELSE 16384 END),
    PRIMARY KEY(kind,entity_id)
  ) STRICT;
  CREATE INDEX IF NOT EXISTS partition_outbox_pending ON partition_projection_outbox(pending,kind,entity_id);`)
  return {
    /** Business write, source checkpoint read and stage must run inside this synchronous callback. */
    transaction<T>(callback: () => T extends PromiseLike<unknown> ? never : T): T {
      return db
        .transaction(() => {
          const result = callback()
          if (result !== null && (typeof result === 'object' || typeof result === 'function') && 'then' in result)
            throw new TypeError('Partition source transactions must be synchronous')
          return result
        })
        .immediate()
    },
    stage(input: PartitionShallowSnapshot): void {
      if (!db.inTransaction) throw new Error('Stage checkpoint in the business source transaction')
      const payload = serializePartitionSnapshot(input)
      const snapshot = partitionShallowSnapshotSchema.parse(JSON.parse(payload))
      const row = db
        .query<OutboxRow, [string, string]>(
          'SELECT payload,pending FROM partition_projection_outbox WHERE kind=? AND entity_id=?',
        )
        .get(snapshot.kind, snapshot.entityId)
      if (row) {
        const previous = partitionShallowSnapshotSchema.parse(JSON.parse(row.payload))
        if (
          previous.partitionId !== snapshot.partitionId ||
          previous.ownerPartitionId !== snapshot.ownerPartitionId ||
          previous.sourceEpoch !== snapshot.sourceEpoch
        )
          throw new Error('Source checkpoint authority changed')
        if (snapshot.revision < previous.revision) throw new Error('Source checkpoint revision regressed')
        if (snapshot.revision === previous.revision) {
          if (payload !== row.payload) throw new Error('Conflicting source checkpoint revision')
          return
        }
        if (snapshot.eventCursor < previous.eventCursor) throw new Error('Source checkpoint cursor regressed')
        if (previous.tombstone && !snapshot.tombstone) throw new Error('Source tombstone prevents resurrection')
      }
      db.run(
        `INSERT INTO partition_projection_outbox VALUES(?,?,?,?,?,?,1,?)
        ON CONFLICT(kind,entity_id) DO UPDATE SET revision=excluded.revision,pending=1,payload=excluded.payload`,
        [
          snapshot.kind,
          snapshot.entityId,
          snapshot.partitionId,
          snapshot.ownerPartitionId,
          snapshot.sourceEpoch,
          snapshot.revision,
          payload,
        ],
      )
    },
    list(limit: number): PartitionShallowSnapshot[] {
      z.number().int().min(1).max(200).parse(limit)
      return db
        .query<{ payload: string }, [number]>(
          'SELECT payload FROM partition_projection_outbox WHERE pending=1 ORDER BY kind,entity_id LIMIT ?',
        )
        .all(limit)
        .map((row) => partitionShallowSnapshotSchema.parse(JSON.parse(row.payload)))
    },
    /** Apply+commit parent first, then acknowledge source. Crash between these commits replays idempotently. */
    acknowledge(input: PartitionOutboxAcknowledgement): boolean {
      const ack = acknowledgementSchema.parse(input)
      const result = db.run(
        `UPDATE partition_projection_outbox SET pending=0 WHERE kind=? AND entity_id=?
        AND partition_id=? AND owner_partition_id=? AND source_epoch=? AND revision=? AND pending=1`,
        [ack.kind, ack.entityId, ack.partitionId, ack.ownerPartitionId, ack.sourceEpoch, ack.revision],
      )
      return result.changes === 1
    },
  }
}
