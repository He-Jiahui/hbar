import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema, inputSchema, runFailureSchema, sessionEventSchema } from '../index'
import type { SessionEvent } from '../index'
import { activeOperationsInputSchema, activeOperationsPageSchema } from './active-operations'
export {
  ACTIVE_OPERATION_INTENT_PREVIEW_MAX_CODE_POINTS,
  activeOperationsInputSchema,
  activeOperationsPageSchema,
} from './active-operations'
export type { ActiveOperationsInput, ActiveOperationsPage } from './active-operations'
import {
  queuedRunEditableInputSchema,
  queuedRunEditableSchema,
  queuedRunEditTextInputSchema,
  queuedRunEditTextReceiptSchema,
  queuedRunRemoveInputSchema,
  queuedRunRemoveReceiptSchema,
  queuedUserRunsInputSchema,
  queuedUserRunsPageSchema,
} from './queued-user-runs'
export {
  queuedRunEditableInputSchema,
  queuedRunEditableSchema,
  queuedRunEditTextInputSchema,
  queuedRunEditTextReceiptSchema,
  queuedRunRemoveInputSchema,
  queuedRunRemoveReceiptSchema,
  queuedUserRunsInputSchema,
  queuedUserRunsPageSchema,
} from './queued-user-runs'
export type {
  QueuedRunEditableInput,
  QueuedRunEditable,
  QueuedRunEditTextInput,
  QueuedRunEditTextReceipt,
  QueuedRunRemoveInput,
  QueuedRunRemoveReceipt,
  QueuedUserRunsInput,
  QueuedUserRunsPage,
} from './queued-user-runs'

export const submitRunInputSchema = z.strictObject({
  sessionId: idSchema,
  modelId: idSchema,
  input: inputSchema,
  expectedLaunchTargetRevision: z.number().int().nonnegative().safe().optional(),
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
  failure: runFailureSchema.optional(),
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
  'queuedRun.getEditable': defineCommand(
    {
      id: 'queuedRun.getEditable',
      version: 1,
      owner: 'hbar.run',
      kind: 'query',
      execution: 'host',
      stateEffect: 'none',
      category: 'run.approval',
      scope: 'session',
      titleKey: 'commands.queuedRun.getEditable.title',
      descriptionKey: 'commands.queuedRun.getEditable.description',
      surfaces: ['cli', 'tui', 'api', 'palette'],
      cli: {
        arguments: [
          { field: 'operationId', type: 'string', position: 0, flag: 'operation' },
          { field: 'sessionId', type: 'string', flag: 'session' },
        ],
      },
    },
    queuedRunEditableInputSchema,
    queuedRunEditableSchema,
  ),
  'queuedRun.editText': defineCommand(
    {
      id: 'queuedRun.editText',
      version: 1,
      owner: 'hbar.run',
      kind: 'command',
      execution: 'host',
      stateEffect: 'persistent',
      category: 'run.approval',
      scope: 'session',
      titleKey: 'commands.queuedRun.editText.title',
      descriptionKey: 'commands.queuedRun.editText.description',
      surfaces: ['cli', 'tui', 'api', 'palette'],
      idempotency: 'required',
      cli: {
        arguments: [
          { field: 'operationId', type: 'string', position: 0, flag: 'operation' },
          { field: 'sessionId', type: 'string', flag: 'session' },
          { field: 'expectedRevision', type: 'number', flag: 'revision' },
          { field: 'text', type: 'string', flag: 'text' },
        ],
      },
    },
    queuedRunEditTextInputSchema,
    queuedRunEditTextReceiptSchema,
  ),
  'queuedRun.remove': defineCommand(
    {
      id: 'queuedRun.remove',
      version: 1,
      owner: 'hbar.run',
      kind: 'command',
      execution: 'host',
      stateEffect: 'persistent',
      category: 'run.approval',
      scope: 'session',
      titleKey: 'commands.queuedRun.remove.title',
      descriptionKey: 'commands.queuedRun.remove.description',
      surfaces: ['cli', 'tui', 'api', 'palette'],
      idempotency: 'required',
      cli: {
        arguments: [
          { field: 'operationId', type: 'string', position: 0, flag: 'operation' },
          { field: 'sessionId', type: 'string', flag: 'session' },
          { field: 'expectedRevision', type: 'number', flag: 'revision' },
        ],
      },
    },
    queuedRunRemoveInputSchema,
    queuedRunRemoveReceiptSchema,
  ),
  'session.queuedUserRuns': defineCommand(
    {
      id: 'session.queuedUserRuns',
      version: 1,
      owner: 'hbar.run',
      kind: 'query',
      execution: 'host',
      stateEffect: 'none',
      category: 'run.approval',
      scope: 'session',
      titleKey: 'commands.session.queuedUserRuns.title',
      descriptionKey: 'commands.session.queuedUserRuns.description',
      surfaces: ['cli', 'tui', 'api', 'palette'],
      cli: {
        arguments: [
          { field: 'sessionId', type: 'string', flag: 'session' },
          { field: 'cursor', type: 'json', flag: 'cursor' },
          { field: 'limit', type: 'number', flag: 'limit' },
        ],
      },
    },
    queuedUserRunsInputSchema,
    queuedUserRunsPageSchema,
  ),
  'session.activeOperations': defineCommand(
    {
      id: 'session.activeOperations',
      version: 1,
      owner: 'hbar.run',
      kind: 'query',
      execution: 'host',
      stateEffect: 'none',
      category: 'run.approval',
      scope: 'session',
      titleKey: 'commands.session.activeOperations.title',
      descriptionKey: 'commands.session.activeOperations.description',
      surfaces: ['cli', 'tui', 'api', 'palette'],
      cli: {
        arguments: [
          { field: 'sessionId', type: 'string', flag: 'session' },
          { field: 'cursor', type: 'json', flag: 'cursor' },
          { field: 'limit', type: 'number', flag: 'limit' },
        ],
      },
    },
    activeOperationsInputSchema,
    activeOperationsPageSchema,
  ),
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
