import { z } from 'zod'
import { goalStatusSchema, idSchema, MAX_PLAN_STEPS, planStepStatusSchema, sessionSummarySchema } from '@hbar/contracts'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import { sessionActivityExecutionSchema } from '@hbar/contracts/sidebar-directory'

export const PARTITION_SNAPSHOT_MAX_BYTES = 16 * 1024
/** Supports the existing Workspace name/path/location worst case, including JSON escaping; no truncation. */
export const PROJECT_PARTITION_SNAPSHOT_MAX_BYTES = 64 * 1024
const counter = z.number().int().nonnegative().safe()
const shallowId = idSchema.and(z.string().max(160))
const canonicalUuid = z.uuid().transform((value) => value.toLowerCase())
export const sessionShallowProgressSchema = z.strictObject({
  model: z.strictObject({ modelId: shallowId, revision: counter }).nullable(),
  goal: z
    .strictObject({
      goalId: shallowId,
      status: goalStatusSchema,
      revision: counter,
      tokenBudget: counter.nullable(),
      tokensUsed: counter,
      timeUsedSeconds: counter,
    })
    .nullable(),
  plan: z
    .strictObject({
      revision: counter.min(1),
      turnId: shallowId.nullable(),
      status: planStepStatusSchema,
      totalSteps: counter.max(MAX_PLAN_STEPS),
      completedSteps: counter.max(MAX_PLAN_STEPS),
      inProgressSteps: counter.max(MAX_PLAN_STEPS),
    })
    .superRefine((plan, context) => {
      if (plan.completedSteps + plan.inProgressSteps > plan.totalSteps)
        context.addIssue({ code: 'custom', message: 'Plan progress counts exceed total steps' })
      const status =
        plan.inProgressSteps > 0
          ? 'in_progress'
          : plan.totalSteps > 0 && plan.completedSteps === plan.totalSteps
            ? 'completed'
            : 'pending'
      if (plan.status !== status)
        context.addIssue({ code: 'custom', message: 'Plan progress status disagrees with counts' })
    })
    .nullable(),
})
const identity = {
  entityId: z.string().min(1).max(160),
  partitionId: canonicalUuid,
  ownerPartitionId: canonicalUuid,
  sourceEpoch: canonicalUuid,
}
export const partitionAuthoritySchema = z.strictObject({
  kind: z.enum(['session', 'project']),
  ...identity,
})
const checkpoint = {
  ...identity,
  revision: counter.min(1),
  /** Fully captured source checkpoint, read in the same transaction as the snapshot. Never seen-max. */
  eventCursor: counter,
  checkpoint: z.literal('full'),
  tombstone: z.boolean(),
}
export const sessionShallowSnapshotSchema = z
  .strictObject({
    kind: z.literal('session'),
    ...checkpoint,
    data: z
      .strictObject({
        session: sessionSchema,
        summary: sessionSummarySchema.strict(),
        execution: sessionActivityExecutionSchema,
        progress: sessionShallowProgressSchema.optional(),
      })
      .nullable(),
  })
  .superRefine((snapshot, context) => {
    if (snapshot.tombstone !== (snapshot.data === null))
      context.addIssue({ code: 'custom', message: 'Only tombstones have null data' })
    if (
      snapshot.data &&
      (snapshot.data.session.id !== snapshot.entityId ||
        snapshot.data.summary.sessionId !== snapshot.entityId ||
        snapshot.data.summary.workspaceId !== snapshot.data.session.workspaceId)
    )
      context.addIssue({ code: 'custom', message: 'Snapshot entity identity mismatch' })
    if (
      snapshot.data &&
      (snapshot.data.session.seq !== snapshot.eventCursor || snapshot.data.summary.seq !== snapshot.eventCursor)
    )
      context.addIssue({ code: 'custom', message: 'Session and summary must capture the complete event checkpoint' })
    // Existing summary projection assigns both timestamps from the same Session row.
    if (snapshot.data && snapshot.data.summary.updatedAt !== snapshot.data.session.updatedAt)
      context.addIssue({ code: 'custom', message: 'Session summary timestamp disagrees with Session' })
  })
export const projectShallowSnapshotSchema = z
  .strictObject({
    kind: z.literal('project'),
    ...checkpoint,
    data: z
      .strictObject({
        workspace: workspaceSchema,
        updatedAt: counter,
        sessionCount: counter,
        activeSessionCount: counter,
        archivedSessionCount: counter,
      })
      .nullable(),
  })
  .superRefine((snapshot, context) => {
    if (snapshot.tombstone !== (snapshot.data === null))
      context.addIssue({ code: 'custom', message: 'Only tombstones have null data' })
    if (
      snapshot.data &&
      (snapshot.data.workspace.id !== snapshot.entityId ||
        snapshot.data.activeSessionCount > snapshot.data.sessionCount ||
        snapshot.data.archivedSessionCount > snapshot.data.sessionCount)
    )
      context.addIssue({ code: 'custom', message: 'Invalid project snapshot identity or counts' })
  })
export const partitionShallowSnapshotSchema = z.union([sessionShallowSnapshotSchema, projectShallowSnapshotSchema])
export type SessionShallowSnapshot = z.output<typeof sessionShallowSnapshotSchema>
export type ProjectShallowSnapshot = z.output<typeof projectShallowSnapshotSchema>
export type PartitionShallowSnapshot = z.output<typeof partitionShallowSnapshotSchema>
export type PartitionAuthority = z.output<typeof partitionAuthoritySchema>

export function serializePartitionSnapshot(input: PartitionShallowSnapshot): string {
  // Directory titles are max 160; older index titles up to 1000 must be migrated explicitly, never truncated.
  const json = JSON.stringify(partitionShallowSnapshotSchema.parse(input))
  const limit = input.kind === 'project' ? PROJECT_PARTITION_SNAPSHOT_MAX_BYTES : PARTITION_SNAPSHOT_MAX_BYTES
  if (new TextEncoder().encode(json).byteLength > limit)
    throw new RangeError(`Partition shallow snapshot exceeds ${limit / 1024} KiB`)
  return json
}

export const PARTITION_PROJECTION_SQL = `
  CREATE TABLE IF NOT EXISTS partition_projection_epochs(
    kind TEXT NOT NULL CHECK(kind IN ('session','project')),
    entity_id TEXT NOT NULL,
    source_epoch TEXT NOT NULL,
    PRIMARY KEY(kind,entity_id,source_epoch)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS partition_projection_authorities(
    kind TEXT NOT NULL CHECK(kind IN ('session','project')),
    entity_id TEXT NOT NULL,
    partition_id TEXT NOT NULL,
    owner_partition_id TEXT NOT NULL,
    source_epoch TEXT NOT NULL,
    PRIMARY KEY(kind, entity_id)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS partition_projection_snapshots(
    kind TEXT NOT NULL CHECK(kind IN ('session','project')),
    entity_id TEXT NOT NULL,
    source_epoch TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision > 0),
    event_cursor INTEGER NOT NULL CHECK(event_cursor >= 0),
    tombstone INTEGER NOT NULL CHECK(tombstone IN (0,1)),
    payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB)) <= CASE kind WHEN 'project' THEN 65536 ELSE 16384 END),
    PRIMARY KEY(kind, entity_id)
  ) STRICT;
  CREATE INDEX IF NOT EXISTS partition_projection_page
    ON partition_projection_snapshots(kind,tombstone,entity_id);
  CREATE TABLE IF NOT EXISTS partition_projection_generation(
    singleton INTEGER PRIMARY KEY CHECK(singleton=1),
    revision INTEGER NOT NULL CHECK(revision >= 0)
  ) STRICT;
  INSERT OR IGNORE INTO partition_projection_generation VALUES(1,0);
`
