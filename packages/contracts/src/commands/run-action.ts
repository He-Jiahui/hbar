import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema } from '../index'
import { operationSnapshotSchema } from './run'

export const cancellationReconciliationSchema = z.strictObject({
  sessionId: idSchema,
  operationId: idSchema,
  status: z.enum(['unknown', 'succeeded']),
  observedStatus: operationSnapshotSchema.shape.status.nullable(),
  error: z.string().max(80).nullable(),
})
export type CancellationReconciliation = z.output<typeof cancellationReconciliationSchema>
export type ObservedOperationStatus = z.output<typeof operationSnapshotSchema.shape.status>

export const runActionCommands = {
  'runAction.reconcileCancellation': defineCommand(
    {
      id: 'runAction.reconcileCancellation',
      version: 1,
      owner: 'hbar.run-action',
      kind: 'command',
      execution: 'client',
      stateEffect: 'application',
      scope: 'session',
      category: 'run.approval',
      visibility: 'internal',
      surfaces: ['api'],
      titleKey: 'commands.runAction.reconcileCancellation.title',
      descriptionKey: 'commands.runAction.reconcileCancellation.description',
      cancelMode: 'cooperative',
      timeoutMs: 35_000,
      maxConcurrent: 32,
    },
    z.strictObject({ sessionId: idSchema, operationId: idSchema }),
    cancellationReconciliationSchema,
  ),
}
