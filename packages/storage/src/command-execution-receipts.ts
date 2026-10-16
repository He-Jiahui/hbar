import { createHash } from 'node:crypto'
import type { Database } from 'bun:sqlite'
import { HbarError, artifactSchema, type SessionEvent } from '@hbar/contracts'
import {
  COMMAND_RECEIPT_RECORD_BYTES,
  COMMAND_RECEIPT_INTENT_BYTES,
  COMMAND_UNCONFIRMED_ERROR_CODES,
  commandExecutionIdentitySchema,
  commandExecutionIntentSchema,
  commandExecutionReceiptSchema,
  commandExecutionUpdateSchema,
  commandExecutionPendingSchema,
  commandExecutionPendingItemSchema,
  type CommandExecutionIdentity,
  type CommandExecutionIntent,
  type CommandExecutionReceipt,
  type CommandExecutionUpdate,
  type CommandReceiptPayload,
  type CommandExecutionPending,
} from '@hbar/contracts/command-execution'
import { createCommandExpectation } from '@hbar/commands'
import { createExecutionPrincipalStorage } from './execution-principals'

type AppendEvent = (sessionId: string, type: string, data: unknown, runId?: string) => SessionEvent
const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right)
const eventType = (identity: CommandExecutionIdentity): string =>
  'run.commandExecution.' +
  createHash('sha256')
    .update(JSON.stringify([identity.actorId, identity.operationKey]))
    .digest('hex')

/** The indexed canonical log is the receipt store; projection rebuild does not require a second mutable journal. */
export function createCommandExecutionReceiptStorage(db: Database, append: AppendEvent) {
  const principals = createExecutionPrincipalStorage(db)
  const latest = db.query<{ sessionId: string; runId: string; data: string }, [string, string]>(
    'SELECT sessionId,runId,data FROM events WHERE sessionId=? AND type=? ORDER BY seq DESC LIMIT 1',
  )
  const unknownFailure = `json_extract(e.data,'$.physical.status')='failed'
    AND json_extract(e.data,'$.physical.executionStarted')=1
    AND (json_extract(e.data,'$.physical.payload.kind')<>'inline'
      OR json_extract(json_extract(e.data,'$.physical.payload.json'),'$.error.code') IN (${COMMAND_UNCONFIRMED_ERROR_CODES.map((code) => `'${code}'`).join(',')}))`
  const pendingRows = () =>
    db.query<
      {
        type: string
        sessionId: string
        runId: string
        version: number
        physicalType: string | null
        recordedSessionId: string
        recordedRunId: string
        actorId: string
        operationKey: string
        commandId: string
        revision: number
        reason: string
      },
      [string]
    >(`SELECT e.type,e.sessionId,e.runId,
      json_extract(e.data,'$.version') AS version,json_type(e.data,'$.physical') AS physicalType,
      json_extract(e.data,'$.sessionId') AS recordedSessionId,json_extract(e.data,'$.runId') AS recordedRunId,
      json_extract(e.data,'$.actorId') AS actorId,json_extract(e.data,'$.operationKey') AS operationKey,
      json_extract(e.data,'$.invocation.commandId') AS commandId,json_extract(e.data,'$.revision') AS revision,
      CASE WHEN json_extract(e.data,'$.physical') IS NULL THEN 'pending' ELSE 'unconfirmed_failure' END AS reason
    FROM events e INDEXED BY events_session_type_seq
    WHERE e.sessionId=? AND e.type>='run.commandExecution.' AND e.type<'run.commandExecution/'
      AND CASE WHEN EXISTS(SELECT 1 FROM events newer INDEXED BY events_session_type_seq
        WHERE newer.sessionId=e.sessionId AND newer.type=e.type AND newer.seq>e.seq) THEN 0
        ELSE coalesce(json_extract(e.data,'$.expectation.descriptor.metadata.stateEffect'),'unknown')<>'none'
          AND (json_extract(e.data,'$.physical') IS NULL OR (${unknownFailure})) END
    LIMIT 65`)
  function read(raw: CommandExecutionIdentity): CommandExecutionReceipt | null {
    const identity = commandExecutionIdentitySchema.parse(raw)
    const row = latest.get(identity.sessionId, eventType(identity))
    if (!row) return null
    const receipt = commandExecutionReceiptSchema.parse(JSON.parse(row.data) as unknown)
    if (
      receipt.sessionId !== row.sessionId ||
      receipt.runId !== row.runId ||
      receipt.actorId !== identity.actorId ||
      receipt.operationKey !== identity.operationKey
    )
      throw new HbarError('SESSION_LOG_CORRUPTED', 'Command receipt differs from its canonical identity')
    return receipt
  }
  function normalized(raw: CommandExecutionIntent): CommandExecutionIntent {
    const input = commandExecutionIntentSchema.parse(raw)
    if (
      input.invocation.commandId !== input.expectation.descriptor.metadata.id ||
      input.invocation.commandVersion !== input.expectation.descriptor.metadata.version
    )
      throw new HbarError('COMMAND_DESCRIPTOR_MISMATCH', 'Command intent differs from its approved definition')
    const actual = createCommandExpectation({ descriptor: input.expectation.descriptor, invocation: input.invocation })
    const expected = createCommandExpectation({
      descriptor: input.expectation.descriptor,
      invocation: { ...input.invocation, input: input.expectation.input },
    })
    if (!same(actual.input, expected.input))
      throw new HbarError('COMMAND_PREPARATION_STALE', 'Command intent differs from its approved arguments')
    return {
      ...input,
      invocation: { ...input.invocation, input: actual.input },
      expectation: expected,
    }
  }
  function save(receipt: CommandExecutionReceipt): CommandExecutionReceipt {
    const value = commandExecutionReceiptSchema.parse(receipt)
    const encoded = JSON.stringify(value)
    if (Buffer.byteLength(encoded) > COMMAND_RECEIPT_RECORD_BYTES)
      throw new HbarError('COMMAND_RECEIPT_CAPACITY', 'Command receipt exceeds its canonical record capacity')
    append(value.sessionId, eventType(value), value, value.runId)
    return value
  }
  function verifyPayload(payload: CommandReceiptPayload): void {
    if (payload.kind !== 'artifacts') return
    for (const chunk of payload.chunks) {
      const row = db.query<{ data: string }, [string]>('SELECT data FROM artifacts WHERE id=?').get(chunk.id)
      if (!row) throw new HbarError('COMMAND_RECEIPT_ARTIFACT', 'Command receipt artifact has not been committed')
      const actual = artifactSchema.parse(JSON.parse(row.data) as unknown)
      if (actual.id !== chunk.id || actual.size !== chunk.size || actual.mime !== chunk.mime)
        throw new HbarError('COMMAND_RECEIPT_ARTIFACT', 'Command receipt artifact differs from committed metadata')
    }
  }
  return {
    read,
    pending(rawSessionId: string): CommandExecutionPending {
      const sessionId = commandExecutionIdentitySchema.shape.sessionId.parse(rawSessionId)
      const rows = pendingRows().all(sessionId)
      const items = rows.map((row) => {
        const item = commandExecutionPendingItemSchema.parse({
          sessionId: row.sessionId,
          actorId: row.actorId,
          operationKey: row.operationKey,
          runId: row.runId,
          commandId: row.commandId,
          revision: row.revision,
          reason: row.reason,
        })
        if (
          row.version !== 1 ||
          !['null', 'object'].includes(row.physicalType ?? '') ||
          row.recordedSessionId !== row.sessionId ||
          row.recordedRunId !== row.runId ||
          row.type !== eventType(item)
        )
          throw new HbarError('SESSION_LOG_CORRUPTED', 'Pending command metadata differs from its canonical identity')
        return item
      })
      return commandExecutionPendingSchema.parse({ sessionId, items: items.slice(0, 64), hasMore: items.length > 64 })
    },
    accept(raw: CommandExecutionIntent): { created: boolean; receipt: CommandExecutionReceipt } {
      const input = normalized(raw)
      if (Buffer.byteLength(JSON.stringify(input)) > COMMAND_RECEIPT_INTENT_BYTES)
        throw new HbarError(
          'COMMAND_RECEIPT_CAPACITY',
          'Command intent leaves insufficient capacity for its settlement',
        )
      const principal = principals.run(input.runId)
      const run = db
        .query<{ sessionId: string; status: string }, [string]>('SELECT sessionId,status FROM runs WHERE id=?')
        .get(input.runId)
      if (!run || run.sessionId !== input.sessionId || !principal || principal.actorId !== input.actorId)
        throw new HbarError('EXECUTION_PRINCIPAL_SOURCE', 'Command intent requires the authenticated source Run')
      const inputHash = createHash('sha256')
        .update(
          JSON.stringify({
            expectation: input.expectation,
            idempotencyKey: input.invocation.idempotencyKey ?? null,
            target: input.target ?? null,
          }),
        )
        .digest('hex')
      return db
        .transaction(() => {
          const previous = read({
            sessionId: input.sessionId,
            actorId: input.actorId,
            operationKey: input.operationKey,
          })
          if (previous) {
            if (previous.inputHash !== inputHash)
              throw new HbarError('IDEMPOTENCY_CONFLICT', 'Command operation key already belongs to different input')
            return { created: false, receipt: previous }
          }
          if (!['running', 'waiting_approval'].includes(run.status))
            throw new HbarError('COMMAND_SOURCE_INACTIVE', 'A new command requires an active source Run')
          if (
            db.query("SELECT eventId FROM events WHERE runId=? AND type='run.cancelRequested' LIMIT 1").get(input.runId)
          )
            throw new HbarError('COMMAND_SOURCE_CANCELLED', 'The source Run has been stopped by its user')
          const now = Date.now()
          return {
            created: true,
            receipt: save({
              ...input,
              version: 1,
              revision: 1,
              inputHash,
              createdAt: now,
              updatedAt: now,
              owner: null,
              logical: null,
              physical: null,
              uncertainty: null,
              acknowledgedAt: null,
            }),
          }
        })
        .immediate()
    },
    update(raw: CommandExecutionUpdate): CommandExecutionReceipt {
      const input = commandExecutionUpdateSchema.parse(raw)
      return db
        .transaction(() => {
          const previous = read({
            sessionId: input.sessionId,
            actorId: input.actorId,
            operationKey: input.operationKey,
          })
          if (!previous) throw new HbarError('NOT_FOUND', 'Command execution receipt is unavailable')
          const { change } = input
          const next = { ...previous }
          switch (change.kind) {
            case 'bind':
              if (previous.owner && !same(previous.owner, change.owner))
                throw new HbarError('COMMAND_OWNER_CONFLICT', 'An accepted command cannot move to another executor')
              next.owner = change.owner
              break
            case 'logical':
              verifyPayload(change.payload)
              if (previous.logical && !same(previous.logical, change.payload))
                throw new HbarError('COMMAND_RECEIPT_CONFLICT', 'A command logical result is immutable')
              next.logical = change.payload
              break
            case 'settled':
              verifyPayload(change.physical.payload)
              if (previous.physical && !same(previous.physical, change.physical))
                throw new HbarError('COMMAND_RECEIPT_CONFLICT', 'A command physical result is immutable')
              next.physical = change.physical
              next.uncertainty = null
              break
            case 'uncertain':
              if (previous.physical) return previous
              next.uncertainty = change.error
              break
            case 'acknowledged':
              if (!previous.logical || !previous.physical || !previous.owner)
                throw new HbarError(
                  'COMMAND_JOB_ACTIVE',
                  'Save confirmed complete results before acknowledging a command',
                )
              if (previous.acknowledgedAt !== null) return previous
              next.acknowledgedAt = Date.now()
              break
          }
          if (same(previous, next)) return previous
          if (previous.revision !== input.expectedRevision)
            throw new HbarError('COMMAND_RECEIPT_REVISION_CONFLICT', 'Command receipt changed; read it before updating')
          if ((next.logical || next.physical) && !next.owner)
            throw new HbarError('COMMAND_OWNER_REQUIRED', 'Command results require their exact accepted executor')
          next.revision++
          next.updatedAt = Date.now()
          return save(next)
        })
        .immediate()
    },
  }
}
