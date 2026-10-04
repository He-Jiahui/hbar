import { createHash } from 'node:crypto'
import type { Database } from 'bun:sqlite'
import { HbarError } from '@hbar/contracts'
import type { z } from 'zod'

export interface FeatureWriteIdentity {
  readonly actorId: string
  readonly idempotencyKey: string
}

export interface FeatureReceiptLookup extends FeatureWriteIdentity {
  readonly commandId: string
  readonly input: unknown
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

/** The result and the mutation share the Worker's SQLite transaction. */
export function createFeatureCommandReceipts(db: Database) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS entity_command_receipts(actorId TEXT NOT NULL,idempotencyKey TEXT NOT NULL,commandId TEXT NOT NULL,payloadHash TEXT NOT NULL,resultJson TEXT NOT NULL,PRIMARY KEY(actorId,idempotencyKey))',
  )
  const hash = (commandId: string, input: unknown) =>
    createHash('sha256')
      .update(canonical({ commandId, version: 1, input }))
      .digest('hex')
  function lookup(input: FeatureReceiptLookup): unknown | null {
    const row = db
      .query<{ commandId: string; payloadHash: string; resultJson: string }, [string, string]>(
        'SELECT commandId,payloadHash,resultJson FROM entity_command_receipts WHERE actorId=? AND idempotencyKey=?',
      )
      .get(input.actorId, input.idempotencyKey)
    if (!row) return null
    if (row.commandId !== input.commandId || row.payloadHash !== hash(input.commandId, input.input))
      throw new HbarError('IDEMPOTENCY_CONFLICT', 'Command key was already used with different input')
    const result: unknown = JSON.parse(row.resultJson)
    return result
  }
  return {
    lookup,
    run<Output>(
      commandId: string,
      input: unknown,
      identity: FeatureWriteIdentity | undefined,
      schema: z.ZodType<Output>,
      action: () => Output,
    ): Output {
      return db
        .transaction(() => {
          if (identity) {
            const previous = lookup({ ...identity, commandId, input })
            if (previous !== null) return schema.parse(previous)
          }
          const result = schema.parse(action())
          if (identity)
            db.query('INSERT INTO entity_command_receipts VALUES(?,?,?,?,?)').run(
              identity.actorId,
              identity.idempotencyKey,
              commandId,
              hash(commandId, input),
              canonical(result),
            )
          return result
        })
        .immediate()
    },
  }
}
