import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema, inputSchema } from '../index'

export const submitRunInputSchema = z.strictObject({
  sessionId: idSchema,
  modelId: idSchema,
  input: inputSchema,
})
export const runCommandRecordSchema = z.strictObject({
  actorId: idSchema,
  idempotencyKey: z.string().min(1).max(128),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  requestId: z.string().min(1).max(128),
})
export type RunCommandRecord = z.output<typeof runCommandRecordSchema>
export const runAcceptedSchema = z.strictObject({
  status: z.literal('accepted'),
  commandId: z.literal('run.submit'),
  commandVersion: z.literal(1),
  requestId: z.string().min(1).max(128),
  idempotencyKey: z.string().min(1).max(128),
  operationId: idSchema,
  sessionId: idSchema,
  acceptedAt: z.number().int().nonnegative(),
})
export const operationSnapshotSchema = z.strictObject({
  operationId: idSchema,
  sessionId: idSchema,
  status: z.enum(['queued', 'running', 'waiting_approval', 'completed', 'cancelled', 'failed', 'interrupted']),
  startedAt: z.number().int().nonnegative().nullable(),
  endedAt: z.number().int().nonnegative().nullable(),
  error: z.string().nullable(),
})
export type SubmitRunInput = z.output<typeof submitRunInputSchema>
export type RunAccepted = z.output<typeof runAcceptedSchema>

export const runCommands = {
  'run.submit': defineCommand(
    {
      id: 'run.submit',
      version: 1,
      owner: 'hbar.run',
      kind: 'command',
      execution: 'host',
      stateEffect: 'persistent',
      category: 'run.approval',
      scope: 'session',
      titleKey: 'commands.run.submit.title',
      descriptionKey: 'commands.run.submit.description',
      surfaces: ['cli', 'tui', 'api', 'palette'],
      idempotency: 'required',
      cli: {
        arguments: [
          { field: 'sessionId', type: 'string', flag: 'session' },
          { field: 'modelId', type: 'string', flag: 'model' },
          { field: 'input', type: 'json', flag: 'input' },
        ],
      },
    },
    submitRunInputSchema,
    runAcceptedSchema,
  ),
  'operation.get': defineCommand(
    {
      id: 'operation.get',
      version: 1,
      owner: 'hbar.run',
      kind: 'query',
      execution: 'host',
      stateEffect: 'none',
      category: 'run.approval',
      scope: 'session',
      titleKey: 'commands.operation.get.title',
      descriptionKey: 'commands.operation.get.description',
      surfaces: ['cli', 'tui', 'api', 'palette'],
      cli: { arguments: [{ field: 'operationId', type: 'string', position: 0, flag: 'operation' }] },
    },
    z.strictObject({ operationId: idSchema }),
    operationSnapshotSchema,
  ),
}
