import type { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  opendirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  type Dir,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import {
  chatDatabasePreviewItemSchema,
  chatDatabaseSkipReasonSchema,
  type ChatDatabaseSkipReason,
  type ChatDatabaseScope as SettingsScope,
} from '@hbar/contracts/commands/chat-database'
import { settingsScopeSchema } from '@hbar/contracts/commands/settings'
import { CHAT_DATABASE_RESOURCE_SQL } from './chat-database-resource-schema'
import { CHAT_DATABASE_ARTIFACT_SQL } from './chat-database-artifact-schema'
import {
  managedResourcePath,
  resourceIdentity,
  sameResource,
  verifyResourcePathSync,
} from './chat-database-resource-paths'
import { chatDatabaseCacheProtection } from './chat-database-cache-protection'

const count = z.number().int().nonnegative().safe()
const safeId = z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/)
export const chatDatabaseResourceResultSchema = z.strictObject({
  deleted: z.boolean(),
  reason: chatDatabaseSkipReasonSchema.nullable(),
  reclaimedBytes: count,
})
export type ChatDatabaseResourceResult = z.output<typeof chatDatabaseResourceResultSchema>
const markerSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operationId: safeId,
  item: chatDatabasePreviewItemSchema,
  scope: settingsScopeSchema,
  phase: z.enum(['intent', 'moved', 'deleted', 'skipped']),
  metadataRevision: count,
  createdAt: count,
  lastUploadedAt: count,
  legacyProtected: z.boolean(),
  updatedAt: count,
  result: chatDatabaseResourceResultSchema.nullable(),
})
type Marker = z.output<typeof markerSchema>
export type ChatDatabaseResourceStage = 'intent' | 'moved' | 'deleted'
export interface ChatDatabaseResourceLedgerPort {
  claim(
    id: string,
    operationId: string,
    cutoffAt: number,
    scope: SettingsScope,
  ): { claimed: boolean; reason: ChatDatabaseSkipReason | null }
  releaseClaim(id: string, operationId: string): void
}

/** The journal is canonical: SQLite receipts, metadata floors and claims can be rebuilt from it. */
export function createChatDatabaseResourceLedger(
  db: Database,
  sessionsRoot: string,
  artifactsRoot: string,
  cacheRoot: string,
  artifacts: ChatDatabaseResourceLedgerPort,
  fault?: (stage: ChatDatabaseResourceStage) => void,
) {
  db.exec(CHAT_DATABASE_RESOURCE_SQL)
  db.exec(CHAT_DATABASE_ARTIFACT_SQL)
  const root = join(sessionsRoot, '.maintenance', 'resource-ledger')
  let directory: Dir | null = null
  let restored = false
  let healthy = true
  const issues: string[] = []
  const fail = (reason: unknown) => {
    healthy = false
    if (issues.length < 32) issues.push(reason instanceof HbarError ? reason.code : 'RESOURCE_RECOVERY_FAILED')
  }
  type Identity = { operationId: string; item: Pick<Marker['item'], 'kind' | 'id'> }
  const key = (marker: Identity) =>
    createHash('sha256').update(`${marker.operationId}/${marker.item.kind}/${marker.item.id}`).digest('hex')
  const markerPath = (marker: Identity) => join(root, `${key(marker)}.json`)
  function read(path: string): Marker {
    verifyResourcePathSync(sessionsRoot, path)
    const info = lstatSync(path)
    if (!info.isFile() || info.size > 64 * 1024) throw new HbarError('INVALID_STATE', 'Resource receipt is invalid')
    const marker = markerSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
    if (markerPath(marker) !== path) throw new HbarError('INVALID_STATE', 'Resource receipt identity changed')
    return marker
  }
  function write(marker: Marker): void {
    verifyResourcePathSync(sessionsRoot, root, true)
    mkdirSync(root, { recursive: true, mode: 0o700 })
    verifyResourcePathSync(sessionsRoot, root)
    const path = markerPath(marker)
    const temporary = `${path}.${crypto.randomUUID()}.pending`
    writeFileSync(temporary, JSON.stringify(markerSchema.parse(marker)), { flag: 'wx', mode: 0o600 })
    const descriptor = openSync(temporary, 'r+')
    try {
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    renameSync(temporary, path)
    syncDirectory(root)
  }
  function syncDirectory(path: string): void {
    if (process.platform === 'win32') return
    const directory = openSync(path, 'r')
    try {
      fsyncSync(directory)
    } finally {
      closeSync(directory)
    }
  }
  function paths(marker: Marker): { managedRoot: string; source: string; quarantine: string } {
    if (!marker.item.resource || !['attachments', 'cache'].includes(marker.item.kind))
      throw new HbarError('INVALID_STATE', 'Resource receipt lacks its fixed file identity')
    const identity =
      marker.item.kind === 'attachments'
        ? marker.item.resource.path
        : createHash('sha256').update(marker.item.resource.path).digest('hex')
    if (identity !== marker.item.id || !/^[a-f0-9]{64}$/.test(marker.item.id))
      throw new HbarError('INVALID_STATE', 'Resource receipt does not match its managed identity')
    const managedRoot = marker.item.kind === 'attachments' ? artifactsRoot : cacheRoot
    return {
      managedRoot,
      source: managedResourcePath(managedRoot, marker.item.resource.path),
      quarantine: join(managedRoot, '.hbar-reclaims', marker.operationId, key(marker)),
    }
  }
  function project(marker: Marker): void {
    db.transaction(() => {
      if (marker.item.kind === 'attachments') {
        const newer =
          (db
            .query<{ revision: number }, [string]>(
              'SELECT revision FROM chat_database_artifact_metadata_revisions WHERE artifactId=?',
            )
            .get(marker.item.id)?.revision ?? 0) > marker.metadataRevision
        if (marker.phase === 'deleted' && !newer) {
          db.query('DELETE FROM artifacts WHERE id=?').run(marker.item.id)
          db.query('DELETE FROM chat_database_upload_candidates WHERE artifactId=?').run(marker.item.id)
          db.query(
            'INSERT INTO chat_database_artifact_metadata_revisions VALUES(?,?) ON CONFLICT(artifactId) DO UPDATE SET revision=MAX(revision,excluded.revision)',
          ).run(marker.item.id, marker.metadataRevision)
          db.query(
            'INSERT INTO chat_database_artifact_tombstones VALUES(?,?,?) ON CONFLICT(artifactId) DO UPDATE SET operationId=excluded.operationId,deletedAt=excluded.deletedAt WHERE excluded.deletedAt>=deletedAt',
          ).run(marker.item.id, marker.operationId, marker.updatedAt)
          db.query('INSERT OR IGNORE INTO chat_database_artifact_reclaims VALUES(?,?,?,?)').run(
            marker.operationId,
            marker.item.id,
            marker.result?.reclaimedBytes ?? 0,
            marker.updatedAt,
          )
        }
        if (marker.phase === 'intent' || marker.phase === 'moved') {
          db.query(
            'INSERT INTO chat_database_artifact_state VALUES(?,?,?,?,?) ON CONFLICT(artifactId) DO UPDATE SET claimOperationId=excluded.claimOperationId',
          ).run(
            marker.item.id,
            marker.createdAt,
            marker.lastUploadedAt,
            Number(marker.legacyProtected),
            marker.operationId,
          )
        } else artifacts.releaseClaim(marker.item.id, marker.operationId)
      }
      if (marker.result) {
        db.query('INSERT OR IGNORE INTO chat_database_resource_receipts VALUES(?,?,?,?)').run(
          marker.operationId,
          marker.item.kind,
          marker.item.id,
          JSON.stringify(marker.result),
        )
        db.query('DELETE FROM chat_database_resource_pending WHERE operationId=? AND kind=? AND targetId=?').run(
          marker.operationId,
          marker.item.kind,
          marker.item.id,
        )
      } else
        db.query(
          'INSERT INTO chat_database_resource_pending VALUES(?,?,?,?) ON CONFLICT(operationId,kind,targetId) DO UPDATE SET dataJson=excluded.dataJson',
        ).run(marker.operationId, marker.item.kind, marker.item.id, JSON.stringify(marker))
    }).immediate()
  }
  function receipt(operationId: string, kind: string, id: string): ChatDatabaseResourceResult | null {
    const row = db
      .query<{ dataJson: string }, [string, string, string]>(
        'SELECT dataJson FROM chat_database_resource_receipts WHERE operationId=? AND kind=? AND targetId=?',
      )
      .get(operationId, kind, id)
    return row ? chatDatabaseResourceResultSchema.parse(JSON.parse(row.dataJson)) : null
  }
  function skip(marker: Marker, reason: ChatDatabaseSkipReason): ChatDatabaseResourceResult {
    const result = { deleted: false, reason, reclaimedBytes: 0 }
    const completed: Marker = { ...marker, phase: 'skipped', result, updatedAt: Date.now() }
    write(completed)
    project(completed)
    return result
  }
  function advance(initial: Marker): ChatDatabaseResourceResult {
    if (initial.result) {
      project(initial)
      return initial.result
    }
    let marker = initial
    const { managedRoot, source, quarantine } = paths(marker)
    const expected = marker.item.resource!
    verifyResourcePathSync(managedRoot, source, true)
    verifyResourcePathSync(managedRoot, quarantine, true)
    if (
      marker.item.kind === 'attachments' &&
      db.query('SELECT ownerId FROM chat_database_artifact_refs WHERE artifactId=? LIMIT 1').get(marker.item.id)
    ) {
      // Recovery conservatively restores quarantined bytes if a later canonical owner proves a live reference.
      if (existsSync(quarantine) && !existsSync(source)) {
        const info = lstatSync(quarantine, { bigint: true })
        if (!info.isFile() || !sameResource(expected, resourceIdentity(expected.path, info), true))
          throw new HbarError('RESOURCE_UNKNOWN', 'Referenced quarantined file changed')
        renameSync(quarantine, source)
      }
      return skip(marker, 'referenced')
    }
    if (marker.phase === 'intent') {
      if (existsSync(quarantine)) {
        if (
          existsSync(source) ||
          !sameResource(expected, resourceIdentity(expected.path, lstatSync(quarantine, { bigint: true })), true)
        )
          throw new HbarError('RESOURCE_UNKNOWN', 'Quarantine identity is uncertain')
      } else {
        if (!existsSync(source)) return skip(marker, 'missing')
        const info = lstatSync(source, { bigint: true })
        if (!info.isFile() || !sameResource(expected, resourceIdentity(expected.path, info)))
          return skip(marker, 'fileChanged')
        mkdirSync(dirname(quarantine), { recursive: true, mode: 0o700 })
        verifyResourcePathSync(managedRoot, quarantine, true)
        verifyResourcePathSync(managedRoot, source)
        renameSync(source, quarantine)
        syncDirectory(dirname(source))
        syncDirectory(dirname(quarantine))
      }
      marker = { ...marker, phase: 'moved', updatedAt: Date.now() }
      write(marker)
      fault?.('moved')
    }
    if (existsSync(quarantine)) {
      verifyResourcePathSync(managedRoot, quarantine)
      const info = lstatSync(quarantine, { bigint: true })
      if (!info.isFile() || !sameResource(expected, resourceIdentity(expected.path, info), true))
        throw new HbarError('RESOURCE_UNKNOWN', 'Quarantined file changed')
      unlinkSync(quarantine)
      syncDirectory(dirname(quarantine))
    }
    const result = { deleted: true, reason: null, reclaimedBytes: expected.size }
    marker = { ...marker, phase: 'deleted', result, updatedAt: Date.now() }
    write(marker)
    fault?.('deleted')
    project(marker)
    return result
  }
  function restore(limit = 100): { done: boolean; healthy: boolean; issues: string[] } {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new HbarError('INVALID_INPUT', 'Resource recovery batch is invalid')
    if (restored) return { done: true, healthy, issues: [...issues] }
    try {
      verifyResourcePathSync(sessionsRoot, root, true)
      if (!existsSync(root)) {
        restored = true
        return { done: true, healthy, issues: [] }
      }
      directory ??= opendirSync(root)
      for (let count = 0; count < limit; count++) {
        const entry = directory.readSync()
        if (!entry) {
          directory.closeSync()
          directory = null
          restored = true
          break
        }
        if (entry.name.endsWith('.pending')) continue
        if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/.test(entry.name)) {
          fail(new HbarError('PATH_REDIRECTED', 'Resource journal entry is invalid'))
          continue
        }
        try {
          project(read(join(root, entry.name)))
        } catch (reason) {
          fail(reason)
        }
      }
    } catch (reason) {
      fail(reason)
      directory?.closeSync()
      directory = null
      restored = true
    }
    return { done: restored, healthy, issues: [...issues] }
  }
  function settle(limit = 100): { done: boolean; healthy: boolean; issues: string[] } {
    if (!healthy) return { done: true, healthy, issues: [...issues] }
    const pending = db
      .query<{ dataJson: string }, [number]>(
        "SELECT dataJson FROM chat_database_resource_pending WHERE kind='attachments' ORDER BY operationId,targetId LIMIT ?",
      )
      .all(limit)
    for (const row of pending) {
      try {
        advance(read(markerPath(markerSchema.parse(JSON.parse(row.dataJson)))))
      } catch (reason) {
        fail(reason)
      }
    }
    return { done: pending.length < limit || !healthy, healthy, issues: [...issues] }
  }
  function remove(input: {
    operationId: string
    scope: SettingsScope
    item: z.output<typeof chatDatabasePreviewItemSchema>
    cutoffAt: number
    protectedRoots?: readonly string[]
  }): ChatDatabaseResourceResult {
    safeId.parse(input.operationId)
    const item = chatDatabasePreviewItemSchema.parse(input.item)
    if (!item.eligible || !item.resource || !['cache', 'attachments'].includes(item.kind))
      throw new HbarError('INVALID_INPUT', 'Only fixed eligible resources can be reclaimed')
    const previous = receipt(input.operationId, item.kind, item.id)
    if (previous) return previous
    const path = markerPath({ operationId: input.operationId, item })
    verifyResourcePathSync(sessionsRoot, path, true)
    const existing = existsSync(path) ? read(path) : null
    if (item.kind === 'cache') {
      if (input.scope.kind !== 'global')
        throw new HbarError('INVALID_SCOPE', 'Shared cache reclamation requires global scope')
      const reason = chatDatabaseCacheProtection(cacheRoot, item.resource.path, input.protectedRoots)
      if (reason) {
        if (existing) {
          const pathsToRestore = paths(existing)
          verifyResourcePathSync(cacheRoot, pathsToRestore.source, true)
          verifyResourcePathSync(cacheRoot, pathsToRestore.quarantine, true)
          if (existsSync(pathsToRestore.quarantine) && !existsSync(pathsToRestore.source)) {
            const info = lstatSync(pathsToRestore.quarantine, { bigint: true })
            if (!info.isFile() || !sameResource(item.resource, resourceIdentity(item.resource.path, info), true))
              throw new HbarError('RESOURCE_UNKNOWN', 'Protected quarantined cache changed')
            renameSync(pathsToRestore.quarantine, pathsToRestore.source)
          }
          return skip(existing, reason)
        }
        return { deleted: false, reason, reclaimedBytes: 0 }
      }
    }
    if (existing) return advance(existing)
    if (!restored || !healthy) return { deleted: false, reason: 'legacyArtifact', reclaimedBytes: 0 }
    if (item.kind === 'attachments') {
      const result = artifacts.claim(item.id, input.operationId, input.cutoffAt, input.scope)
      if (!result.claimed) return { deleted: false, reason: result.reason, reclaimedBytes: 0 }
    }
    const state = db
      .query<{ createdAt: number; lastUploadedAt: number; legacyProtected: number }, [string]>(
        'SELECT createdAt,lastUploadedAt,legacyProtected FROM chat_database_artifact_state WHERE artifactId=?',
      )
      .get(item.id)
    const marker: Marker = {
      schemaVersion: 1,
      operationId: input.operationId,
      scope: input.scope,
      item,
      phase: 'intent',
      result: null,
      metadataRevision:
        db
          .query<{ revision: number }, [string]>(
            'SELECT revision FROM chat_database_artifact_metadata_revisions WHERE artifactId=?',
          )
          .get(item.id)?.revision ?? 0,
      createdAt: state?.createdAt ?? 0,
      lastUploadedAt: state?.lastUploadedAt ?? 0,
      legacyProtected: Boolean(state?.legacyProtected),
      updatedAt: Date.now(),
    }
    try {
      write(marker)
    } catch (reason) {
      if (item.kind === 'attachments' && !existsSync(path)) artifacts.releaseClaim(item.id, input.operationId)
      throw reason
    }
    project(marker)
    fault?.('intent')
    return advance(marker)
  }
  function close(): void {
    directory?.closeSync()
    directory = null
  }
  return { restore, settle, remove, receipt, close }
}
