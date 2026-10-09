import type { Database } from 'bun:sqlite'
import { lstatSync, readFileSync, openSync, closeSync, fstatSync, readSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import {
  HbarError,
  artifactSchema,
  collectArtifactReferenceIds,
  collectArtifactReferences,
  type ArtifactRef,
} from '@hbar/contracts'
import {
  chatDatabaseDraftOwnerSchema,
  chatDatabaseDraftSyncInputSchema,
  chatDatabaseInventorySchema,
  chatDatabaseInventoryBeginInputSchema,
  chatDatabaseInventoryFinishInputSchema,
  type ChatDatabaseDraftSyncInput,
  type ChatDatabaseDraftOwner,
  type ChatDatabaseInventoryBeginInput,
  type ChatDatabaseInventoryFinishInput,
  type ChatDatabaseInventory,
  type ChatDatabaseSkipReason,
} from '@hbar/contracts/commands/chat-database'
import { createFeatureCommandReceipts, type FeatureWriteIdentity } from './feature-command-receipts'
import { CHAT_DATABASE_ARTIFACT_SQL } from './chat-database-artifact-schema'
import { createChatDatabaseDraftJournal, type ChatDatabaseDraftJournalRecord } from './chat-database-draft-journal'

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const byteCount = z.number().int().nonnegative().safe()
const ownerKey = (owner: { kind: string; id: string }) => `${owner.kind}:${owner.id}`
export interface ChatDatabaseArtifactUploadReservation {
  artifactId: string
  deviceId: string
  ownerId: string
  clientRevision?: number
  leaseId?: string
  artifact?: ArtifactRef
  replacesOperationId?: string | null
}
export interface ChatDatabaseArtifactClaimResult {
  claimed: boolean
  reason: ChatDatabaseSkipReason | null
}
export interface ChatDatabaseArtifactReclaim {
  reclaimedBytes: number
  completedAt: number
}

export function createChatDatabaseArtifactStorage(
  db: Database,
  sessionsRoot: string,
  artifactsRoot: string,
  settingsRoot: string,
) {
  db.exec(CHAT_DATABASE_ARTIFACT_SQL)
  db.exec('UPDATE chat_database_reference_health SET draftJournalComplete=0,legacySettingsComplete=0 WHERE id=1')
  const receipts = createFeatureCommandReceipts(db)
  const journal = createChatDatabaseDraftJournal(sessionsRoot)
  let deviceCursor: string | null = null
  let devicesDone = false
  let journalWriteVersion = 0
  let journalFinished = false
  let journalRecovery: { done: boolean; healthy: boolean; issues: string[] } = {
    done: false,
    healthy: false,
    issues: [],
  }
  let metadataCursor: string | null = null
  let metadataFinished = false
  const readOwner = (deviceId: string, key: string): ChatDatabaseDraftOwner | null => {
    const row = db
      .query<{ stateJson: string }, [string, string]>(
        'SELECT stateJson FROM chat_database_draft_owners WHERE deviceId=? AND ownerId=?',
      )
      .get(deviceId, key)
    return row ? chatDatabaseDraftOwnerSchema.parse(JSON.parse(row.stateJson)) : null
  }
  function inventory(deviceId: string): ChatDatabaseInventory {
    const row = db
      .query<{ complete: number; updatedAt: number; inventoryId: string | null; revision: number | null }, [string]>(
        'SELECT complete,updatedAt,(SELECT inventoryId FROM chat_database_inventory_syncs WHERE deviceId=inventory.deviceId) AS inventoryId,(SELECT revision FROM chat_database_inventory_syncs WHERE deviceId=inventory.deviceId) AS revision FROM chat_database_device_inventories inventory WHERE deviceId=?',
      )
      .get(deviceId)
    return {
      schemaVersion: 1,
      complete: Boolean(row?.complete),
      inventoryId: row?.inventoryId ?? null,
      revision: row?.revision ?? 0,
      updatedAt: row?.updatedAt ?? 0,
    }
  }
  function refs(
    source: string,
    id: string,
    ids: readonly string[],
    deviceId: string | null,
    sessionId: string | null = null,
    workspaceId: string | null = null,
  ): void {
    for (const artifactId of ids)
      db.query('INSERT OR IGNORE INTO chat_database_artifact_refs VALUES(?,?,?,?,?,?)').run(
        source,
        id,
        hash.parse(artifactId),
        sessionId,
        workspaceId,
        deviceId,
      )
  }
  function replaceOwner(deviceId: string, owner: ChatDatabaseDraftOwner): void {
    const key = ownerKey(owner)
    const sourceId = `${deviceId}/${key}`
    db.query('DELETE FROM chat_database_artifact_refs WHERE source=? AND ownerId=?').run('draft', sourceId)
    db.query('DELETE FROM chat_database_artifact_refs WHERE source=? AND ownerId=?').run('upload', sourceId)
    refs('draft', sourceId, owner.artifactIds, deviceId)
    refs('upload', sourceId, owner.pendingArtifactIds, deviceId)
    db.query(
      'INSERT INTO chat_database_draft_owners VALUES(?,?,?,?,?) ON CONFLICT(deviceId,ownerId) DO UPDATE SET revision=excluded.revision,stateJson=excluded.stateJson,updatedAt=excluded.updatedAt',
    ).run(deviceId, key, owner.revision, JSON.stringify(owner), owner.updatedAt)
  }
  function append(record: ChatDatabaseDraftJournalRecord): void {
    journalWriteVersion++
    try {
      journal.append(record)
    } catch (reason) {
      journal.reset()
      db.exec('UPDATE chat_database_reference_health SET draftJournalComplete=0 WHERE id=1')
      throw reason
    }
  }
  function durableWrite<Output>(action: () => Output): Output {
    const before = journalWriteVersion
    try {
      return action()
    } catch (reason) {
      if (journalWriteVersion !== before) invalidateDraftJournal()
      throw reason
    }
  }
  function unknownDevice(deviceId: string): void {
    if (journal.hasDevice(deviceId)) return
    const now = Date.now()
    append({ commandId: 'device.unknown', deviceId, updatedAt: now })
    db.query(
      'INSERT INTO chat_database_device_inventories VALUES(?,0,?) ON CONFLICT(deviceId) DO UPDATE SET complete=0,updatedAt=excluded.updatedAt',
    ).run(deviceId, now)
  }
  function sync(input: ChatDatabaseDraftSyncInput, identity: FeatureWriteIdentity): ChatDatabaseDraftOwner {
    const parsed = chatDatabaseDraftSyncInputSchema.parse(input)
    return durableWrite(() =>
      receipts.run('chatDatabase.draft.sync', parsed, identity, chatDatabaseDraftOwnerSchema, () => {
        const current = readOwner(identity.actorId, ownerKey(parsed.owner))
        if ((current?.revision ?? 0) !== parsed.expectedRevision)
          throw new HbarError('COMMAND_CONFLICT', 'Draft reference revision changed')
        if (current && parsed.owner.clientRevision < current.clientRevision)
          throw new HbarError('COMMAND_CONFLICT', 'A newer draft generation already owns these references')
        if (parsed.owner.artifactIds.length && lstatSync(artifactsRoot).isSymbolicLink())
          throw new HbarError('PATH_REDIRECTED', 'Attachment root is redirected')
        for (const id of parsed.owner.artifactIds) {
          const info = lstatSync(join(artifactsRoot, hash.parse(id)))
          if (info.isSymbolicLink() || !info.isFile())
            throw new HbarError('ARTIFACT_UNAVAILABLE', 'Draft attachment is unavailable')
        }
        const uploads = db
          .query<{ artifactId: string }, [string, string]>(
            'SELECT artifactId FROM chat_database_artifact_refs WHERE source=? AND ownerId=? ORDER BY artifactId',
          )
          .all('upload', `${identity.actorId}/${ownerKey(parsed.owner)}`)
          .map((item) => item.artifactId)
        const same =
          current &&
          current.kind === parsed.owner.kind &&
          current.clientRevision === parsed.owner.clientRevision &&
          JSON.stringify(current.artifactIds) === JSON.stringify([...parsed.owner.artifactIds].sort()) &&
          JSON.stringify(current.pendingArtifactIds) === JSON.stringify([...parsed.owner.pendingArtifactIds].sort()) &&
          JSON.stringify(uploads) === JSON.stringify([...parsed.owner.pendingArtifactIds].sort())
        const owner = same
          ? current
          : chatDatabaseDraftOwnerSchema.parse({
              ...parsed.owner,
              artifactIds: [...parsed.owner.artifactIds].sort(),
              pendingArtifactIds: [...parsed.owner.pendingArtifactIds].sort(),
              revision: parsed.expectedRevision + 1,
              updatedAt: Date.now(),
            })
        // The write lock and claim guards precede the canonical declaration on disk.
        if (!same) replaceOwner(identity.actorId, owner)
        append({ commandId: 'chatDatabase.draft.sync', identity, input: parsed, result: owner })
        return owner
      }),
    )
  }
  function invalidateDraftJournal(): void {
    journal.reset()
    journalFinished = false
    metadataCursor = null
    metadataFinished = false
    db.exec('UPDATE chat_database_reference_health SET draftJournalComplete=0 WHERE id=1')
  }
  function writeVersion(): number {
    return journalWriteVersion
  }
  function begin(input: ChatDatabaseInventoryBeginInput, identity: FeatureWriteIdentity): ChatDatabaseInventory {
    const parsed = chatDatabaseInventoryBeginInputSchema.parse(input)
    return durableWrite(() =>
      receipts.run('chatDatabase.inventory.begin', parsed, identity, chatDatabaseInventorySchema, () => {
        const now = Date.now()
        db.query(
          'INSERT INTO chat_database_device_inventories VALUES(?,0,?) ON CONFLICT(deviceId) DO UPDATE SET complete=0,updatedAt=excluded.updatedAt',
        ).run(identity.actorId, now)
        db.query(
          'INSERT INTO chat_database_inventory_syncs VALUES(?,?,?,1) ON CONFLICT(deviceId) DO UPDATE SET inventoryId=excluded.inventoryId,manifestJson=excluded.manifestJson,revision=revision+1',
        ).run(identity.actorId, parsed.inventoryId, JSON.stringify(parsed.ownerIds))
        const result = inventory(identity.actorId)
        append({ commandId: 'chatDatabase.inventory.begin', identity, input: parsed, result })
        return result
      }),
    )
  }
  function finish(input: ChatDatabaseInventoryFinishInput, identity: FeatureWriteIdentity): ChatDatabaseInventory {
    const parsed = chatDatabaseInventoryFinishInputSchema.parse(input)
    return durableWrite(() =>
      receipts.run('chatDatabase.inventory.finish', parsed, identity, chatDatabaseInventorySchema, () => {
        const sync = db
          .query<{ inventoryId: string; manifestJson: string }, [string]>(
            'SELECT inventoryId,manifestJson FROM chat_database_inventory_syncs WHERE deviceId=?',
          )
          .get(identity.actorId)
        if (!sync || sync.inventoryId !== parsed.inventoryId)
          throw new HbarError('COMMAND_CONFLICT', 'Draft inventory generation changed')
        const manifest = z.array(z.string()).parse(JSON.parse(sync.manifestJson))
        if (
          manifest.length !== Object.keys(parsed.ownerRevisions).length ||
          manifest.some((key) => readOwner(identity.actorId, key)?.revision !== parsed.ownerRevisions[key])
        )
          throw new HbarError('COMMAND_CONFLICT', 'Draft inventory is incomplete or changed')
        db.query('UPDATE chat_database_device_inventories SET complete=1,updatedAt=? WHERE deviceId=?').run(
          Date.now(),
          identity.actorId,
        )
        db.query('UPDATE chat_database_inventory_syncs SET revision=revision+1 WHERE deviceId=?').run(identity.actorId)
        const result = inventory(identity.actorId)
        append({ commandId: 'chatDatabase.inventory.finish', identity, input: parsed, result })
        return result
      }),
    )
  }
  function recover(record: ChatDatabaseDraftJournalRecord): void {
    if (record.commandId === 'artifact.uploadCompleted') {
      const current =
        db
          .query<{ revision: number }, [string]>(
            'SELECT revision FROM chat_database_artifact_metadata_revisions WHERE artifactId=?',
          )
          .get(record.artifact.id)?.revision ?? 0
      if (current >= record.revision) return
      db.query(
        'INSERT INTO chat_database_artifact_metadata_revisions VALUES(?,?) ON CONFLICT(artifactId) DO UPDATE SET revision=excluded.revision',
      ).run(record.artifact.id, record.revision)
      db.query('INSERT INTO artifacts VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(
        record.artifact.id,
        JSON.stringify(record.artifact),
      )
      return
    }
    if (record.commandId === 'device.unknown') {
      db.query('INSERT OR IGNORE INTO chat_database_device_inventories VALUES(?,0,?)').run(
        record.deviceId,
        record.updatedAt,
      )
      return
    }
    if ('reservation' in record) {
      const value = record.reservation
      const revision =
        db
          .query<{ revision: number }, [string, string, string]>(
            'SELECT revision FROM chat_database_upload_reference_revisions WHERE deviceId=? AND ownerId=? AND artifactId=?',
          )
          .get(value.deviceId, value.ownerId, value.artifactId)?.revision ?? 0
      if (revision >= record.revision) return
      if (value.artifact) saveUploadCandidate(value.artifact, value.deviceId, value.replacesOperationId ?? null)
      if (record.commandId === 'artifact.uploadReleased')
        db.query('DELETE FROM chat_database_artifact_refs WHERE source=? AND ownerId=? AND artifactId=?').run(
          'upload',
          `${value.deviceId}/${value.ownerId}`,
          value.artifactId,
        )
      else {
        const deletedToolOwner = Boolean(
          value.deviceId === 'host-tools' &&
          value.ownerId.startsWith('session:') &&
          db
            .query('SELECT sessionId FROM chat_database_deleted_sessions WHERE sessionId=?')
            .get(value.ownerId.slice(8)),
        )
        const owner = readOwner(value.deviceId, value.ownerId)
        const superseded =
          owner &&
          !owner.pendingArtifactIds.includes(value.artifactId) &&
          (owner.artifactIds.includes(value.artifactId) ||
            (value.clientRevision !== undefined && owner.clientRevision > value.clientRevision))
        if (!deletedToolOwner && !superseded) {
          db.query(
            'INSERT INTO chat_database_artifact_state VALUES(?,?,?,0,NULL) ON CONFLICT(artifactId) DO UPDATE SET lastUploadedAt=MAX(lastUploadedAt,excluded.lastUploadedAt)',
          ).run(value.artifactId, record.updatedAt, record.updatedAt)
          refs('upload', `${value.deviceId}/${value.ownerId}`, [value.artifactId], value.deviceId)
        }
      }
      db.query(
        'INSERT INTO chat_database_upload_reference_revisions VALUES(?,?,?,?) ON CONFLICT(deviceId,ownerId,artifactId) DO UPDATE SET revision=excluded.revision',
      ).run(value.deviceId, value.ownerId, value.artifactId, record.revision)
      return
    }
    if (record.commandId === 'chatDatabase.draft.sync') {
      receipts.run(record.commandId, record.input, record.identity, chatDatabaseDraftOwnerSchema, () => {
        const current = readOwner(record.identity.actorId, ownerKey(record.result))
        if (!current || current.revision < record.result.revision) replaceOwner(record.identity.actorId, record.result)
        return record.result
      })
    } else
      receipts.run(record.commandId, record.input, record.identity, chatDatabaseInventorySchema, () => {
        const current = inventory(record.identity.actorId)
        if (current.revision < record.result.revision) {
          db.query(
            'INSERT INTO chat_database_device_inventories VALUES(?,?,?) ON CONFLICT(deviceId) DO UPDATE SET complete=excluded.complete,updatedAt=excluded.updatedAt',
          ).run(record.identity.actorId, Number(record.result.complete), record.result.updatedAt)
          if (record.commandId === 'chatDatabase.inventory.begin')
            db.query(
              'INSERT INTO chat_database_inventory_syncs VALUES(?,?,?,?) ON CONFLICT(deviceId) DO UPDATE SET inventoryId=excluded.inventoryId,manifestJson=excluded.manifestJson,revision=excluded.revision',
            ).run(
              record.identity.actorId,
              record.input.inventoryId,
              JSON.stringify(record.input.ownerIds),
              record.result.revision,
            )
          else
            db.query('UPDATE chat_database_inventory_syncs SET revision=? WHERE deviceId=?').run(
              record.result.revision,
              record.identity.actorId,
            )
        }
        return record.result
      })
  }
  function backfill(limit = 100) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new HbarError('INVALID_INPUT', 'Reference backfill limit is invalid')
    if (!devicesDone) {
      const devices = db
        .query<{ id: string }, [string | null, string | null, number]>(
          'SELECT id FROM devices WHERE (? IS NULL OR id>?) ORDER BY id LIMIT ?',
        )
        .all(deviceCursor, deviceCursor, Math.min(limit, 100))
      for (const device of devices) unknownDevice(device.id)
      deviceCursor = devices.at(-1)?.id ?? deviceCursor
      devicesDone = devices.length < Math.min(limit, 100)
      return { done: false, healthy: false, issues: [] }
    }
    if (!journalFinished) {
      journalRecovery = db.transaction(() => journal.backfill(limit, recover)).immediate()
      if (!journalRecovery.done) return journalRecovery
      journalFinished = true
    }
    if (!metadataFinished) {
      const batchSize = Math.min(limit, 25)
      const rows = db
        .query<{ id: string; data: string }, [string | null, string | null, number]>(
          'SELECT id,data FROM artifacts WHERE (? IS NULL OR id>?) ORDER BY id LIMIT ?',
        )
        .all(metadataCursor, metadataCursor, batchSize)
      durableWrite(() =>
        db
          .transaction(() => {
            for (const row of rows) {
              if (
                !db
                  .query('SELECT artifactId FROM chat_database_artifact_metadata_revisions WHERE artifactId=?')
                  .get(row.id)
              )
                preserveMetadata(artifactSchema.parse(JSON.parse(row.data)), 'host-metadata')
            }
          })
          .immediate(),
      )
      metadataCursor = rows.at(-1)?.id ?? metadataCursor
      metadataFinished = rows.length < batchSize
      if (!metadataFinished) return { done: false, healthy: false, issues: journalRecovery.issues }
    }
    db.query('UPDATE chat_database_reference_health SET draftJournalComplete=? WHERE id=1').run(
      Number(journalRecovery.healthy),
    )
    return { ...journalRecovery, done: true }
  }
  function list(deviceId: string, after: string | null, limit = 50) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new HbarError('INVALID_INPUT', 'Draft reference page size is invalid')
    const rows = db
      .query<{ ownerId: string; stateJson: string }, [string, string | null, string | null, number]>(
        'SELECT ownerId,stateJson FROM chat_database_draft_owners WHERE deviceId=? AND (? IS NULL OR ownerId>?) ORDER BY ownerId LIMIT ?',
      )
      .all(deviceId, after, after, limit + 1)
    const selected = rows.slice(0, limit)
    return {
      items: selected.map((row) => chatDatabaseDraftOwnerSchema.parse(JSON.parse(row.stateJson))),
      next: rows.length > limit ? (selected.at(-1)?.ownerId ?? null) : null,
    }
  }
  function reserve(input: ChatDatabaseArtifactUploadReservation): void {
    const id = hash.parse(input.artifactId)
    durableWrite(() =>
      db
        .transaction(() => {
          const owner = readOwner(input.deviceId, input.ownerId)
          if (
            input.clientRevision !== undefined &&
            owner &&
            owner.clientRevision > input.clientRevision &&
            !owner.pendingArtifactIds.includes(id)
          )
            throw new HbarError('DRAFT_CHANGED', 'This upload belongs to a discarded draft generation')
          const state = db
            .query<{ claimOperationId: string | null }, [string]>(
              'SELECT claimOperationId FROM chat_database_artifact_state WHERE artifactId=?',
            )
            .get(id)
          if (state?.claimOperationId)
            throw new HbarError('ARTIFACT_RESERVED', 'Attachment reclamation owns this content hash')
          const now = Date.now()
          const artifact = input.artifact ? artifactSchema.parse(input.artifact) : undefined
          if (artifact && artifact.id !== id)
            throw new HbarError('INVALID_INPUT', 'Upload metadata does not match its hash')
          const replacesOperationId =
            db
              .query<{ operationId: string }, [string]>(
                'SELECT operationId FROM chat_database_artifact_tombstones WHERE artifactId=?',
              )
              .get(id)?.operationId ?? null
          if (artifact) saveUploadCandidate(artifact, input.deviceId, replacesOperationId)
          db.query(
            'INSERT INTO chat_database_artifact_state VALUES(?,?,?,0,NULL) ON CONFLICT(artifactId) DO UPDATE SET lastUploadedAt=excluded.lastUploadedAt',
          ).run(id, now, now)
          refs('upload', `${input.deviceId}/${input.ownerId}`, [id], input.deviceId)
          if (input.leaseId)
            db.query(
              'INSERT INTO chat_database_upload_leases VALUES(?,?,?) ON CONFLICT(leaseId) DO UPDATE SET expiresAt=excluded.expiresAt',
            ).run(input.leaseId, id, now + 120_000)
          const { leaseId: _leaseId, ...reserved } = input
          const reservation = { ...reserved, ...(artifact ? { artifact, replacesOperationId } : {}) }
          appendUpload('artifact.uploadReserved', reservation, now)
        })
        .immediate(),
    )
  }
  function renewUpload(leaseId: string): void {
    const result = db
      .query('UPDATE chat_database_upload_leases SET expiresAt=? WHERE leaseId=? AND expiresAt>?')
      .run(Date.now() + 120_000, leaseId, Date.now())
    if (!result.changes) throw new HbarError('UPLOAD_UNKNOWN', 'The attachment upload lease expired')
  }
  function endUpload(leaseId: string): void {
    db.query('DELETE FROM chat_database_upload_leases WHERE leaseId=?').run(leaseId)
  }
  function preserveMetadata(artifact: ArtifactRef, deviceId: string): void {
    const revision = db
      .query<{ revision: number }, [string]>(
        'INSERT INTO chat_database_artifact_metadata_revisions VALUES(?,1) ON CONFLICT(artifactId) DO UPDATE SET revision=revision+1 RETURNING revision',
      )
      .get(artifact.id)
    if (!revision) throw new HbarError('STORAGE_ERROR', 'Artifact metadata revision was not recorded')
    append({
      commandId: 'artifact.uploadCompleted',
      artifact,
      deviceId,
      revision: revision.revision,
      updatedAt: Date.now(),
    })
  }
  function finishUpload(artifact: ArtifactRef, leaseId?: string, deviceId = 'host-tools'): void {
    durableWrite(() =>
      db
        .transaction(() => {
          if (
            leaseId &&
            !db
              .query('SELECT leaseId FROM chat_database_upload_leases WHERE leaseId=? AND artifactId=? AND expiresAt>?')
              .get(leaseId, artifact.id, Date.now())
          )
            throw new HbarError('UPLOAD_UNKNOWN', 'The attachment upload lease expired')
          if (
            db
              .query(
                'SELECT artifactId FROM chat_database_artifact_state WHERE artifactId=? AND claimOperationId IS NOT NULL',
              )
              .get(artifact.id)
          )
            throw new HbarError('ARTIFACT_RESERVED', 'Attachment reclamation owns this content hash')
          db.query('DELETE FROM chat_database_artifact_tombstones WHERE artifactId=?').run(hash.parse(artifact.id))
          const existing = db
            .query<{ data: string }, [string]>('SELECT data FROM artifacts WHERE id=?')
            .get(artifact.id)
          const canonical = existing ? artifactSchema.parse(JSON.parse(existing.data)) : artifact
          preserveMetadata(canonical, deviceId)
          db.query('INSERT OR IGNORE INTO artifacts VALUES(?,?)').run(artifact.id, JSON.stringify(canonical))
          if (leaseId) endUpload(leaseId)
        })
        .immediate(),
    )
  }
  function saveUploadCandidate(artifact: ArtifactRef, deviceId: string, replacesOperationId: string | null): void {
    db.query(
      'INSERT INTO chat_database_upload_candidates VALUES(?,?,?,?) ON CONFLICT(artifactId) DO UPDATE SET dataJson=excluded.dataJson,deviceId=excluded.deviceId,replacesOperationId=excluded.replacesOperationId',
    ).run(artifact.id, JSON.stringify(artifact), deviceId, replacesOperationId)
  }
  /** A lost upload response can be recovered only from a bounded, exact content proof. */
  function recoverUploadCandidate(artifactId: string): ArtifactRef | null {
    return durableWrite(() =>
      db
        .transaction(() => {
          const candidate = db
            .query<{ dataJson: string; deviceId: string; replacesOperationId: string | null }, [string]>(
              'SELECT dataJson,deviceId,replacesOperationId FROM chat_database_upload_candidates WHERE artifactId=?',
            )
            .get(hash.parse(artifactId))
          if (!candidate) return null
          const tombstone = db
            .query<{ operationId: string }, [string]>(
              'SELECT operationId FROM chat_database_artifact_tombstones WHERE artifactId=?',
            )
            .get(artifactId)
          if (tombstone && tombstone.operationId !== candidate.replacesOperationId) return null
          const artifact = artifactSchema.parse(JSON.parse(candidate.dataJson))
          if (artifact.size < 1 || artifact.size > 10 * 1024 * 1024) return null
          try {
            const root = lstatSync(artifactsRoot)
            if (!root.isDirectory() || root.isSymbolicLink())
              throw new HbarError('PATH_REDIRECTED', 'Attachment root is redirected')
            const path = join(artifactsRoot, artifactId)
            const info = lstatSync(path)
            if (!info.isFile() || info.isSymbolicLink())
              throw new HbarError('PATH_REDIRECTED', 'Attachment candidate is redirected')
            if (info.size !== artifact.size) return null
            const descriptor = openSync(path, 'r')
            const digest = createHash('sha256')
            let total = 0
            try {
              const opened = fstatSync(descriptor)
              if (opened.dev !== info.dev || opened.ino !== info.ino)
                throw new HbarError('PATH_REDIRECTED', 'Attachment candidate changed')
              const buffer = Buffer.allocUnsafe(64 * 1024)
              while (total <= artifact.size) {
                const size = readSync(descriptor, buffer, 0, Math.min(buffer.length, artifact.size - total + 1), total)
                if (!size) break
                total += size
                digest.update(buffer.subarray(0, size))
              }
            } finally {
              closeSync(descriptor)
            }
            const currentRoot = lstatSync(artifactsRoot)
            if (currentRoot.isSymbolicLink() || currentRoot.dev !== root.dev || currentRoot.ino !== root.ino)
              throw new HbarError('PATH_REDIRECTED', 'Attachment root changed')
            if (total !== artifact.size || digest.digest('hex') !== artifactId) return null
          } catch (reason) {
            if (reason instanceof Error && 'code' in reason && reason.code === 'ENOENT') return null
            throw reason
          }
          finishUpload(artifact, undefined, candidate.deviceId)
          return artifact
        })
        .immediate(),
    )
  }
  function restoreEventMetadata(data: unknown): void {
    const references = collectArtifactReferences(data)
    if (!references.complete) db.exec('UPDATE chat_database_event_reference_health SET complete=0 WHERE id=1')
    for (const artifact of references.artifacts)
      db.query('INSERT OR IGNORE INTO artifacts VALUES(?,?)').run(artifact.id, JSON.stringify(artifact))
  }
  function releaseUpload(input: ChatDatabaseArtifactUploadReservation): void {
    durableWrite(() =>
      db
        .transaction(() => {
          db.query('DELETE FROM chat_database_artifact_refs WHERE source=? AND ownerId=? AND artifactId=?').run(
            'upload',
            `${input.deviceId}/${input.ownerId}`,
            hash.parse(input.artifactId),
          )
          const { leaseId: _leaseId, ...reservation } = input
          appendUpload('artifact.uploadReleased', reservation, Date.now())
        })
        .immediate(),
    )
  }
  function appendUpload(
    commandId: 'artifact.uploadReserved' | 'artifact.uploadReleased',
    reservation: ChatDatabaseArtifactUploadReservation,
    updatedAt: number,
  ): void {
    const result = db
      .query<{ revision: number }, [string, string, string]>(
        'INSERT INTO chat_database_upload_reference_revisions VALUES(?,?,?,1) ON CONFLICT(deviceId,ownerId,artifactId) DO UPDATE SET revision=revision+1 RETURNING revision',
      )
      .get(reservation.deviceId, reservation.ownerId, reservation.artifactId)
    if (!result) throw new HbarError('STORAGE_ERROR', 'Upload reference revision was not recorded')
    append({ commandId, reservation, updatedAt, revision: result.revision })
  }
  function registerEvent(eventId: string, data: unknown, sessionId: string, workspaceId: string): void {
    const references = collectArtifactReferenceIds(data)
    if (!references.complete)
      throw new HbarError('REFERENCE_LIMIT', 'Event attachment references exceed the indexing budget')
    refs('event', eventId, references.ids, null, sessionId, workspaceId)
  }
  function releaseCommittedToolUploads(data: unknown, sessionId: string): void {
    const references = collectArtifactReferenceIds(data)
    for (const id of references.ids) {
      const reservation = { artifactId: id, deviceId: 'host-tools', ownerId: `session:${sessionId}` }
      if (
        db
          .query('SELECT artifactId FROM chat_database_artifact_refs WHERE source=? AND ownerId=? AND artifactId=?')
          .get('upload', `host-tools/${reservation.ownerId}`, id)
      )
        releaseUpload(reservation)
    }
  }
  function seedLegacy(id: string, createdAt: number, modifiedAt: number): void {
    db.query('INSERT OR IGNORE INTO chat_database_artifact_state VALUES(?,?,?,1,NULL)').run(
      hash.parse(id),
      byteCount.parse(Math.max(0, Math.floor(createdAt))),
      byteCount.parse(Math.max(0, Math.floor(modifiedAt))),
    )
  }
  function legacySettings(scope: 'global' | 'project' | 'session', targetId: string | null): { complete: boolean } {
    if (targetId && !/^[a-zA-Z0-9._-]{1,160}$/.test(targetId))
      throw new HbarError('INVALID_INPUT', 'Legacy settings target is invalid')
    const path =
      scope === 'global'
        ? join(settingsRoot, 'settings.json')
        : join(settingsRoot, scope === 'project' ? 'projects' : 'sessions', `${targetId}.json`)
    return db
      .transaction(() => {
        if (lstatSync(settingsRoot).isSymbolicLink() || lstatSync(dirname(path)).isSymbolicLink())
          return { complete: false }
        const info = lstatSync(path)
        if (info.isSymbolicLink() || !info.isFile() || info.size > 2 * 1024 * 1024) return { complete: false }
        const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
        return replaceLegacyValues(scope, targetId, value)
      })
      .immediate()
  }
  function replaceLegacyValues(
    scope: 'global' | 'project' | 'session',
    targetId: string | null,
    value: unknown,
  ): { complete: boolean } {
    const references = collectArtifactReferenceIds(value)
    if (!references.complete)
      throw new HbarError('REFERENCE_LIMIT', 'Legacy settings reference indexing exceeds its budget')
    const key = `${scope}:${targetId ?? 'global'}`
    db.query('DELETE FROM chat_database_artifact_refs WHERE source=? AND ownerId=?').run('legacySettings', key)
    refs('legacySettings', key, references.ids, null, null, scope === 'project' ? targetId : null)
    return { complete: true }
  }
  function referenceHealth() {
    const row = db
      .query<{ draftJournalComplete: number; legacySettingsComplete: number }, []>(
        'SELECT draftJournalComplete,legacySettingsComplete FROM chat_database_reference_health WHERE id=1',
      )
      .get()
    const events = db
      .query<{ complete: number }, []>('SELECT complete FROM chat_database_event_reference_health WHERE id=1')
      .get()
    return {
      drafts: Boolean(row?.draftJournalComplete),
      legacySettings: Boolean(row?.legacySettingsComplete),
      events: Boolean(events?.complete),
    }
  }
  function claim(artifactId: string, operationId: string, cutoffAt: number): ChatDatabaseArtifactClaimResult {
    return db
      .transaction(() => {
        const health = referenceHealth()
        if (
          !health.drafts ||
          !health.events ||
          !health.legacySettings ||
          db.query('SELECT source FROM chat_database_backfill WHERE complete=0 LIMIT 1').get()
        )
          return { claimed: false, reason: 'legacyArtifact' as const }
        const state = db
          .query<
            { createdAt: number; lastUploadedAt: number; legacyProtected: number; claimOperationId: string | null },
            [string]
          >('SELECT * FROM chat_database_artifact_state WHERE artifactId=?')
          .get(hash.parse(artifactId))
        if (!state) return { claimed: false, reason: 'legacyArtifact' as const }
        if (state.claimOperationId === operationId) return { claimed: true, reason: null }
        if (state.claimOperationId) return { claimed: false, reason: 'inUse' as const }
        if (
          db
            .query('SELECT leaseId FROM chat_database_upload_leases WHERE artifactId=? AND expiresAt>? LIMIT 1')
            .get(artifactId, Date.now())
        )
          return { claimed: false, reason: 'inUse' as const }
        if (db.query('SELECT ownerId FROM chat_database_artifact_refs WHERE artifactId=? LIMIT 1').get(artifactId))
          return { claimed: false, reason: 'referenced' as const }
        if (
          state.legacyProtected &&
          db.query('SELECT deviceId FROM chat_database_device_inventories WHERE complete=0 LIMIT 1').get()
        )
          return { claimed: false, reason: 'legacyInventory' as const }
        if (Math.max(state.createdAt, state.lastUploadedAt) >= cutoffAt)
          return { claimed: false, reason: 'retention' as const }
        db.query('UPDATE chat_database_artifact_state SET claimOperationId=? WHERE artifactId=?').run(
          operationId,
          artifactId,
        )
        return { claimed: true, reason: null }
      })
      .immediate()
  }
  function reclaimReceipt(artifactId: string, operationId: string): ChatDatabaseArtifactReclaim | null {
    return db
      .query<ChatDatabaseArtifactReclaim, [string, string]>(
        'SELECT reclaimedBytes,completedAt FROM chat_database_artifact_reclaims WHERE artifactId=? AND operationId=?',
      )
      .get(hash.parse(artifactId), operationId)
  }
  function finishReclaim(artifactId: string, operationId: string, reclaimedBytes: number): ChatDatabaseArtifactReclaim {
    return db
      .transaction(() => {
        const prior = reclaimReceipt(artifactId, operationId)
        if (prior) return prior
        const state = db
          .query<{ claimOperationId: string | null }, [string]>(
            'SELECT claimOperationId FROM chat_database_artifact_state WHERE artifactId=?',
          )
          .get(artifactId)
        if (state?.claimOperationId !== operationId)
          throw new HbarError('COMMAND_CONFLICT', 'Attachment reclamation claim changed')
        const completedAt = Date.now()
        db.query('DELETE FROM artifacts WHERE id=?').run(artifactId)
        db.query(
          'INSERT INTO chat_database_artifact_tombstones VALUES(?,?,?) ON CONFLICT(artifactId) DO UPDATE SET operationId=excluded.operationId,deletedAt=excluded.deletedAt',
        ).run(artifactId, operationId, completedAt)
        db.query('UPDATE chat_database_artifact_state SET claimOperationId=NULL WHERE artifactId=?').run(artifactId)
        db.query('INSERT INTO chat_database_artifact_reclaims VALUES(?,?,?,?)').run(
          operationId,
          artifactId,
          byteCount.parse(reclaimedBytes),
          completedAt,
        )
        return { reclaimedBytes, completedAt }
      })
      .immediate()
  }
  function releaseClaim(artifactId: string, operationId: string): void {
    db.query(
      'UPDATE chat_database_artifact_state SET claimOperationId=NULL WHERE artifactId=? AND claimOperationId=?',
    ).run(hash.parse(artifactId), operationId)
  }
  const markLegacySettingsComplete = (complete: boolean) => {
    db.query('UPDATE chat_database_reference_health SET legacySettingsComplete=? WHERE id=1').run(Number(complete))
  }
  return {
    sync,
    begin,
    finish,
    inventory,
    list,
    backfill,
    unknownDevice,
    reserve,
    renewUpload,
    endUpload,
    finishUpload,
    releaseUpload,
    registerEvent,
    releaseCommittedToolUploads,
    seedLegacy,
    legacySettings,
    replaceLegacyValues,
    markLegacySettingsComplete,
    referenceHealth,
    claim,
    releaseClaim,
    finishReclaim,
    reclaimReceipt,
    invalidateDraftJournal,
    writeVersion,
    restoreEventMetadata,
    recoverUploadCandidate,
  }
}
