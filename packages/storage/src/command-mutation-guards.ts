import { createHash } from 'node:crypto'
import type { Database } from 'bun:sqlite'
import { z } from 'zod'
import { HbarError, idSchema, type SessionEvent } from '@hbar/contracts'
import {
  COMMAND_UNCONFIRMED_ERROR_CODES,
  commandExecutionPendingItemSchema,
  type CommandExecutionReceipt,
} from '@hbar/contracts/command-execution'
import { createExecutionPrincipalStorage } from './execution-principals'

const guardSchema = commandExecutionPendingItemSchema.omit({ reason: true }).extend({
  version: z.literal(1),
  originSessionId: idSchema,
  state: z.enum(['pending', 'unconfirmed_failure', 'confirmed']),
})
const unconfirmed = new Set<string>(COMMAND_UNCONFIRMED_ERROR_CODES)
const errorPayload = z.object({ error: z.object({ code: z.string() }) })
const eventType = (identity: { sessionId: string; actorId: string; operationKey: string }): string =>
  'run.commandMutation.' +
  createHash('sha256')
    .update(JSON.stringify([identity.sessionId, identity.actorId, identity.operationKey]))
    .digest('hex')

function state(receipt: CommandExecutionReceipt): z.output<typeof guardSchema>['state'] {
  if (receipt.expectation.descriptor.metadata.stateEffect === 'none') return 'confirmed'
  if (!receipt.physical) return 'pending'
  if (receipt.physical.status !== 'failed' || !receipt.physical.executionStarted) return 'confirmed'
  if (receipt.physical.payload.kind !== 'inline') return 'unconfirmed_failure'
  const payload = errorPayload.safeParse(JSON.parse(receipt.physical.payload.json) as unknown)
  return payload.success && unconfirmed.has(payload.data.error.code) ? 'unconfirmed_failure' : 'confirmed'
}

/** A metadata guard at the original task Session prevents child/sibling work from escaping an unknown effect.
 * Write it BEFORE the source receipt: a partial multi-journal write may retain an extra restriction, never lose it.
 */
export function createCommandMutationGuards(
  db: Database,
  append: (sessionId: string, type: string, data: unknown) => SessionEvent,
) {
  const principals = createExecutionPrincipalStorage(db)
  const runOwner = db.query<{ sessionId: string }, [string]>('SELECT sessionId FROM runs WHERE id=?')
  return {
    write(receipt: CommandExecutionReceipt): void {
      if (receipt.expectation.descriptor.metadata.stateEffect === 'none') return
      const principal = principals.run(receipt.runId)
      if (!principal || principal.actorId !== receipt.actorId)
        throw new HbarError('EXECUTION_PRINCIPAL_SOURCE', 'Command mutation guard requires its canonical source')
      if (principal.originSessionId === receipt.sessionId) return
      const guard = guardSchema.parse({
        version: 1,
        originSessionId: principal.originSessionId,
        sessionId: receipt.sessionId,
        actorId: receipt.actorId,
        runId: receipt.runId,
        operationKey: receipt.operationKey,
        commandId: receipt.invocation.commandId,
        revision: receipt.revision,
        state: state(receipt),
      })
      append(guard.originSessionId, eventType(guard), guard)
    },
    pending(originSessionId: string, limit: number) {
      idSchema.parse(originSessionId)
      z.number().int().min(1).max(65).parse(limit)
      // Lazy preparation: session event indexes are initialized after the repositories are composed.
      const rows = db
        .query<{ sessionId: string; runId: string | null; type: string; data: string }, [string, number]>(
          `
        SELECT e.sessionId,e.runId,e.type,e.data FROM events e INDEXED BY events_session_type_seq
        WHERE e.sessionId=? AND e.type>='run.commandMutation.' AND e.type<'run.commandMutation/'
          AND CASE WHEN EXISTS(SELECT 1 FROM events newer INDEXED BY events_session_type_seq
            WHERE newer.sessionId=e.sessionId AND newer.type=e.type AND newer.seq>e.seq) THEN 0
            ELSE coalesce(json_extract(e.data,'$.state'),'unknown')<>'confirmed' END
        LIMIT ?
      `,
        )
        .all(originSessionId, limit)
      return rows.map((row) => {
        const guard = guardSchema.parse(JSON.parse(row.data) as unknown)
        const principal = principals.run(guard.runId)
        if (
          row.sessionId !== originSessionId ||
          row.runId !== null ||
          guard.originSessionId !== originSessionId ||
          row.type !== eventType(guard) ||
          guard.state === 'confirmed' ||
          runOwner.get(guard.runId)?.sessionId !== guard.sessionId ||
          principal?.originSessionId !== originSessionId ||
          principal.actorId !== guard.actorId
        )
          throw new HbarError('SESSION_LOG_CORRUPTED', 'Command mutation guard differs from its canonical source')
        return commandExecutionPendingItemSchema.parse({
          sessionId: guard.sessionId,
          runId: guard.runId,
          actorId: guard.actorId,
          operationKey: guard.operationKey,
          commandId: guard.commandId,
          revision: guard.revision,
          reason: guard.state,
        })
      })
    },
  }
}
