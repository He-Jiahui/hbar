import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema, inputSchema, sessionEventSchema } from '../index'
import type { SessionEvent } from '../index'

export const submitRunInputSchema = z.strictObject({
  sessionId: idSchema,
  modelId: idSchema,
  input: inputSchema,
})
export const retryRunInputSchema = z.strictObject({
  sessionId: idSchema,
  operationId: idSchema,
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
  status: z.enum([
    'queued',
    'running',
    'waiting_approval',
    'cancelRequested',
    'completed',
    'cancelled',
    'failed',
    'interrupted',
  ]),
  startedAt: z.number().int().nonnegative().nullable(),
  endedAt: z.number().int().nonnegative().nullable(),
  error: z.string().nullable(),
})
export const operationCancelResultSchema = z.strictObject({
  operationId: idSchema,
  status: z.enum(['cancelRequested', 'completed', 'cancelled', 'failed', 'interrupted']),
})
export const operationWatchResultSchema = z.strictObject({
  snapshot: operationSnapshotSchema,
  events: z.array(sessionEventSchema).max(200),
  cursor: z.number().int().nonnegative(),
  reset: z.boolean(),
})
export type SubmitRunInput = z.output<typeof submitRunInputSchema>
export type RunAccepted = z.output<typeof runAcceptedSchema>
export interface OperationWatchResult {
  readonly snapshot: z.output<typeof operationSnapshotSchema>
  readonly events: readonly SessionEvent[]
  readonly cursor: number
  readonly reset: boolean
}

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
  'run.retry': defineCommand(
    {
      id: 'run.retry',
      version: 1,
      owner: 'hbar.run',
      kind: 'command',
      execution: 'host',
      stateEffect: 'persistent',
      category: 'run.approval',
      scope: 'session',
      titleKey: 'commands.run.retry.title',
      descriptionKey: 'commands.run.retry.description',
      surfaces: ['cli', 'tui', 'api', 'palette'],
      idempotency: 'required',
      cli: {
        arguments: [
          { field: 'operationId', type: 'string', position: 0, flag: 'operation' },
          { field: 'sessionId', type: 'string', flag: 'session' },
        ],
      },
    },
    retryRunInputSchema,
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
  'operation.cancel': defineCommand(
    {
      id: 'operation.cancel',
      version: 1,
      owner: 'hbar.run',
      kind: 'command',
      execution: 'host',
      stateEffect: 'persistent',
      category: 'run.approval',
      scope: 'session',
      titleKey: 'commands.operation.cancel.title',
      descriptionKey: 'commands.operation.cancel.description',
      surfaces: ['cli', 'tui', 'api', 'palette'],
      cli: { arguments: [{ field: 'operationId', type: 'string', position: 0, flag: 'operation' }] },
    },
    z.strictObject({ operationId: idSchema }),
    operationCancelResultSchema,
  ),
  'context.compact': defineCommand(
    {
      id: 'context.compact',
      version: 1,
      owner: 'hbar.run',
      kind: 'command',
      execution: 'host',
      stateEffect: 'external',
      category: 'run.approval',
      scope: 'session',
      titleKey: 'commands.context.compact.title',
      descriptionKey: 'commands.context.compact.description',
      surfaces: ['cli', 'tui', 'api', 'palette'],
      cancelMode: 'cooperative',
      timeoutMs: 125_000,
      maxConcurrent: 1,
      cli: {
        arguments: [
          { field: 'sessionId', type: 'string', flag: 'session' },
          { field: 'modelId', type: 'string', flag: 'model' },
        ],
      },
    },
    z.strictObject({ sessionId: idSchema, modelId: idSchema }),
    z.strictObject({ summary: z.string().max(1_000_000) }),
  ),
}
