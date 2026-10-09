import type { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { HbarError } from '@hbar/contracts'
import {
  chatDatabaseOperationSchema,
  chatDatabasePreviewItemSchema,
  chatDatabasePreviewPageInputSchema,
  chatDatabaseHistoryInputSchema,
  type ChatDatabaseOperation,
  type ChatDatabasePreviewItem,
  type ChatDatabaseScope,
  type ChatDatabaseHistoryInput,
} from '@hbar/contracts/commands/chat-database'
import { createFeatureCommandReceipts, type FeatureWriteIdentity } from './feature-command-receipts'
import { chatDatabaseSessionProtection } from './chat-database-deletion'
import { createChatDatabaseTaskStorage, type ChatDatabaseTaskRuntime } from './chat-database-tasks'

export interface ChatDatabaseOperationStart extends FeatureWriteIdentity {
  operation: ChatDatabaseOperation
  request: string
  taskRuntime?: ChatDatabaseTaskRuntime
}
export type ChatDatabaseOperationPatch = Partial<
  Pick<
    ChatDatabaseOperation,
    | 'status'
    | 'stage'
    | 'completedAt'
    | 'expiresAt'
    | 'policyRevisions'
    | 'candidateCount'
    | 'totalCount'
    | 'processedCount'
    | 'deletedCount'
    | 'estimatedBytes'
    | 'reclaimedBytes'
    | 'reusableDatabaseBytes'
    | 'remainingBytes'
    | 'targetBytes'
    | 'skipped'
    | 'error'
    | 'cancellationRequested'
  >
>
export interface ChatDatabaseCandidateCursor {
  depth: number
  id: string
}
export interface ChatDatabaseCandidatePage {
  items: ChatDatabasePreviewItem[]
  next: ChatDatabaseCandidateCursor | null
}
const terminal = (operation: ChatDatabaseOperation) => ['completed', 'cancelled', 'failed'].includes(operation.status)

export function createChatDatabaseJournal(db: Database) {
  const receipts = createFeatureCommandReceipts(db)
  const tasks = createChatDatabaseTaskStorage(db)
  const decode = (row: { dataJson: string } | null): ChatDatabaseOperation | null =>
    row ? chatDatabaseOperationSchema.parse(JSON.parse(row.dataJson)) : null
  function read(operationId: string): ChatDatabaseOperation {
    const result = decode(
      db
        .query<{ dataJson: string }, [string]>('SELECT dataJson FROM chat_database_operations WHERE id=?')
        .get(operationId),
    )
    if (!result) throw new HbarError('NOT_FOUND', 'Chat database operation is unavailable')
    return result
  }
  function save(operation: ChatDatabaseOperation): ChatDatabaseOperation {
    const value = chatDatabaseOperationSchema.parse(operation)
    db.query('UPDATE chat_database_operations SET dataJson=?,updatedAt=? WHERE id=?').run(
      JSON.stringify(value),
      value.updatedAt,
      value.operationId,
    )
    return value
  }
  function accept(input: ChatDatabaseOperationStart): { operation: ChatDatabaseOperation; created: boolean } {
    return db
      .transaction(() => {
        const requestHash = createHash('sha256').update(input.request).digest('hex')
        const prior = db
          .query<{ requestHash: string; dataJson: string }, [string, string]>(
            'SELECT requestHash,dataJson FROM chat_database_operations WHERE actorId=? AND idempotencyKey=?',
          )
          .get(input.actorId, input.idempotencyKey)
        if (prior) {
          if (prior.requestHash !== requestHash)
            throw new HbarError('IDEMPOTENCY_CONFLICT', 'Maintenance key was used with different input')
          const operation = decode(prior)
          if (!operation) throw new HbarError('INVALID_STATE', 'Maintenance receipt is invalid')
          return { operation, created: false }
        }
        if (
          db
            .query(
              "SELECT id FROM chat_database_operations WHERE json_extract(dataJson,'$.status') IN ('accepted','running','cancelRequested','unknown') LIMIT 1",
            )
            .get()
        )
          throw new HbarError('BUSY', 'A chat database operation is already active')
        const operation = chatDatabaseOperationSchema.parse(input.operation)
        db.query('INSERT INTO chat_database_operations VALUES(?,?,?,?,?,?,?)').run(
          operation.operationId,
          input.actorId,
          input.idempotencyKey,
          requestHash,
          JSON.stringify(operation.scope),
          JSON.stringify(operation),
          operation.updatedAt,
        )
        if (operation.type === 'preview' || operation.previewId === operation.operationId)
          db.query('INSERT INTO chat_database_previews VALUES(?,?,?,?,?,?,?,?)').run(
            operation.operationId,
            input.actorId,
            JSON.stringify(operation.scope),
            '{}',
            operation.kind,
            operation.createdAt,
            0,
            '{}',
          )
        if (input.taskRuntime) tasks.save({ ...input.taskRuntime, lastOperationId: operation.operationId })
        return { operation, created: true }
      })
      .immediate()
  }
  function update(operationId: string, patch: ChatDatabaseOperationPatch): ChatDatabaseOperation {
    return db
      .transaction(() => {
        const current = read(operationId)
        return save({
          ...current,
          ...patch,
          cancellationRequested: current.cancellationRequested || Boolean(patch.cancellationRequested),
          status:
            current.cancellationRequested && patch.status === 'running'
              ? 'cancelRequested'
              : (patch.status ?? current.status),
          version: current.version + 1,
          updatedAt: Date.now(),
        })
      })
      .immediate()
  }
  function cancel(operationId: string, identity: FeatureWriteIdentity): ChatDatabaseOperation {
    return receipts.run('chatDatabase.cancel', { operationId }, identity, chatDatabaseOperationSchema, () => {
      const current = read(operationId)
      return terminal(current)
        ? current
        : save({
            ...current,
            cancellationRequested: true,
            status: 'cancelRequested',
            version: current.version + 1,
            updatedAt: Date.now(),
          })
    })
  }
  function receipt(actorId: string, idempotencyKey: string): ChatDatabaseOperation | null {
    return decode(
      db
        .query<{ dataJson: string }, [string, string]>(
          'SELECT dataJson FROM chat_database_operations WHERE actorId=? AND idempotencyKey=?',
        )
        .get(actorId, idempotencyKey),
    )
  }
  function reconcile(operationId: string, identity: FeatureWriteIdentity): ChatDatabaseOperation {
    return receipts.run('chatDatabase.reconcile', { operationId }, identity, chatDatabaseOperationSchema, () => {
      const current = read(operationId)
      return current.status === 'unknown'
        ? update(operationId, { status: 'accepted', stage: 'pending', error: null })
        : current
    })
  }
  function appendItems(previewId: string, items: ChatDatabasePreviewItem[]): void {
    if (items.length > 100) throw new HbarError('INVALID_INPUT', 'Preview batches are bounded to 100 items')
    db.transaction(() => {
      let position =
        db
          .query<{ position: number }, [string]>(
            'SELECT COALESCE(MAX(position),0) AS position FROM chat_database_preview_items WHERE previewId=?',
          )
          .get(previewId)?.position ?? 0
      for (const input of items) {
        const item = chatDatabasePreviewItemSchema.parse(input)
        db.query('INSERT INTO chat_database_preview_items VALUES(?,?,?,?,?,?)').run(
          previewId,
          ++position,
          item.kind,
          item.id,
          item.expectedSeq,
          JSON.stringify(item),
        )
      }
    })()
  }
  function previewPage(input: { previewId: string; after?: number | null; limit?: number }) {
    const parsed = chatDatabasePreviewPageInputSchema.parse(input)
    const rows = db
      .query<{ position: number; dataJson: string }, [string, number, number]>(
        'SELECT position,dataJson FROM chat_database_preview_items WHERE previewId=? AND position>? ORDER BY position LIMIT ?',
      )
      .all(parsed.previewId, parsed.after ?? 0, parsed.limit + 1)
    const selected = rows.slice(0, parsed.limit)
    return {
      items: selected.map((row) => chatDatabasePreviewItemSchema.parse(JSON.parse(row.dataJson))),
      next: rows.length > parsed.limit ? (selected.at(-1)?.position ?? null) : null,
      operation: read(parsed.previewId),
      positions: selected.map((row) => row.position),
    }
  }
  function candidates(
    scope: ChatDatabaseScope,
    after: ChatDatabaseCandidateCursor | null,
    limit = 100,
  ): ChatDatabaseCandidatePage {
    if (limit < 1 || limit > 100 || !Number.isSafeInteger(limit))
      throw new HbarError('INVALID_INPUT', 'Candidate page size is invalid')
    const rows = db
      .query<
        {
          id: string
          title: string
          workspaceId: string
          seq: number
          lastActivityAt: number
          estimatedBytes: number
          depth: number
        },
        [string, string | null, string | null, number | null, number | null, number | null, string | null, number]
      >(
        `WITH candidates AS (
      SELECT s.id,s.title,s.workspaceId,s.seq,COALESCE(u.lastActivityAt,s.createdAt) AS lastActivityAt,
      COALESCE(u.logicalBytes,0)+COALESCE((SELECT SUM(size) FROM session_log_files WHERE sessionId=s.id),0) AS estimatedBytes,
      (WITH RECURSIVE ancestors(id,parentId,depth) AS (SELECT s.id,s.parentId,0 UNION ALL SELECT p.id,p.parentId,a.depth+1 FROM sessions p JOIN ancestors a ON p.id=a.parentId WHERE a.depth<64) SELECT MAX(depth) FROM ancestors) AS depth
      FROM sessions s LEFT JOIN chat_database_usage u ON u.sessionId=s.id
      WHERE CASE ? WHEN 'global' THEN 1 WHEN 'workspace' THEN s.workspaceId=? ELSE s.id=? END)
      SELECT * FROM candidates WHERE (? IS NULL OR depth<? OR (depth=? AND id>?)) ORDER BY depth DESC,id LIMIT ?`,
      )
      .all(
        scope.kind,
        scope.kind === 'global' ? null : scope.targetId,
        scope.kind === 'global' ? null : scope.targetId,
        after?.depth ?? null,
        after?.depth ?? null,
        after?.depth ?? null,
        after?.id ?? null,
        limit + 1,
      )
    const selected = rows.slice(0, limit)
    const items = selected.map((row): ChatDatabasePreviewItem => ({
      kind: 'sessions',
      id: row.id,
      title: row.title,
      workspaceId: row.workspaceId,
      expectedSeq: row.seq,
      lastActivityAt: row.lastActivityAt,
      estimatedBytes: row.estimatedBytes,
      depth: row.depth,
      policyRevisions: {},
      eligible: true,
      skipReason: row.depth === 64 ? 'retainedChild' : chatDatabaseSessionProtection(db, row.id),
    }))
    const last = selected.at(-1)
    return { items, next: rows.length > limit && last ? { depth: last.depth, id: last.id } : null }
  }
  function retainedChild(previewId: string, sessionId: string): boolean {
    return Boolean(
      db
        .query(
          "SELECT id FROM sessions child WHERE child.parentId=? AND NOT EXISTS(SELECT 1 FROM chat_database_preview_items item WHERE item.previewId=? AND item.targetId=child.id AND json_extract(item.dataJson,'$.eligible')=1) LIMIT 1",
        )
        .get(sessionId, previewId),
    )
  }
  function history(input: ChatDatabaseHistoryInput) {
    const parsed = chatDatabaseHistoryInputSchema.parse(input)
    const rows = db
      .query<{ dataJson: string }, [string, number | null, number | null, number | null, string | null, number]>(
        "SELECT dataJson FROM chat_database_operations WHERE scopeJson=? AND (? IS NULL OR json_extract(dataJson,'$.createdAt')<? OR (json_extract(dataJson,'$.createdAt')=? AND id>?)) ORDER BY json_extract(dataJson,'$.createdAt') DESC,id LIMIT ?",
      )
      .all(
        JSON.stringify(parsed.scope),
        parsed.after?.createdAt ?? null,
        parsed.after?.createdAt ?? null,
        parsed.after?.createdAt ?? null,
        parsed.after?.id ?? null,
        parsed.limit + 1,
      )
    const items = rows.slice(0, parsed.limit).map((row) => chatDatabaseOperationSchema.parse(JSON.parse(row.dataJson)))
    const last = items.at(-1)
    return {
      items,
      next: rows.length > parsed.limit && last ? { createdAt: last.createdAt, id: last.operationId } : null,
    }
  }
  function pending(): ChatDatabaseOperation | null {
    return decode(
      db
        .query<{ dataJson: string }, []>(
          "SELECT dataJson FROM chat_database_operations WHERE json_extract(dataJson,'$.status') IN ('accepted','running','cancelRequested','unknown') ORDER BY updatedAt LIMIT 1",
        )
        .get(),
    )
  }
  function resetPreview(previewId: string): void {
    db.query('DELETE FROM chat_database_preview_items WHERE previewId=?').run(previewId)
  }
  return {
    accept,
    read,
    update,
    cancel,
    receipt,
    reconcile,
    appendItems,
    previewPage,
    candidates,
    retainedChild,
    history,
    pending,
    resetPreview,
  }
}
