import { z } from 'zod'

/** Versioned, deliberately small set of fields permitted in a diagnostic record. */
export const diagnosticEventSchema = z.strictObject({
  schemaVersion: z.literal(1),
  time: z.number().int().nonnegative(),
  monotonicMs: z.number().finite().nonnegative(),
  component: z.enum(['client', 'desktop', 'host', 'kernel', 'storage', 'sqlite']),
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
  event: z.string().regex(/^[a-z][a-z0-9_.-]{1,95}$/),
  phase: z
    .string()
    .regex(/^[a-z][a-z0-9_.-]{0,63}$/)
    .optional(),
  instanceId: z.string().min(1).max(160).optional(),
  requestId: z.string().min(1).max(160).optional(),
  rpcId: z.string().min(1).max(160).optional(),
  storageRequestId: z.number().int().nonnegative().max(2 ** 53 - 1).optional(),
  contextId: z.string().min(1).max(160).optional(),
  sessionId: z.string().min(1).max(160).optional(),
  runId: z.string().min(1).max(160).optional(),
  stepId: z.string().min(1).max(160).optional(),
  callId: z.string().min(1).max(160).optional(),
  processId: z.number().int().positive().max(2 ** 32 - 1).optional(),
  childPid: z.number().int().positive().max(2 ** 32 - 1).optional(),
  supervisorPid: z.number().int().positive().max(2 ** 32 - 1).optional(),
  exitCode: z.number().int().min(-(2 ** 31)).max(2 ** 32 - 1).optional(),
  signal: z.string().regex(/^SIG[A-Z0-9]{1,16}$/).optional(),
  restartExpected: z.boolean().optional(),
  recoveryAttempt: z.number().int().nonnegative().max(1_000_000).optional(),
  recoveryLimit: z.number().int().nonnegative().max(1_000_000).optional(),
  owner: z.enum(['window', 'tray', 'process_exit']).optional(),
  method: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/)
    .optional(),
  providerId: z
    .string()
    .regex(/^[A-Za-z0-9_.:-]{1,160}$/)
    .optional(),
  modelSelectionId: z.string().min(1).max(160).optional(),
  modelRequestId: z.string().min(1).max(160).optional(),
  attemptId: z.string().min(1).max(160).optional(),
  model: z
    .string()
    .regex(/^[A-Za-z0-9_.:/@+-]{1,160}$/)
    .optional(),
  protocol: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/)
    .optional(),
  stopReason: z.enum(['stop', 'toolUse', 'length', 'aborted', 'error']).optional(),
  httpStatus: z.number().int().min(100).max(599).optional(),
  upstreamRequestIdSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  transportKind: z.enum(['abort', 'timeout', 'connection', 'unknown']).optional(),
  transportCode: z
    .enum([
      'ECONNREFUSED',
      'ConnectionRefused',
      'ECONNRESET',
      'ETIMEDOUT',
      'EAI_AGAIN',
      'ENOTFOUND',
      'ENETUNREACH',
      'EHOSTUNREACH',
      'EPIPE',
      'UND_ERR_CONNECT_TIMEOUT',
    ])
    .optional(),
  errorCode: z
    .string()
    .regex(/^[A-Z][A-Z0-9_.-]{0,127}$/)
    .optional(),
  outcome: z.enum(['success', 'failure', 'unknown', 'skipped']).optional(),
  workerState: z.enum(['starting', 'ready', 'degraded', 'closing', 'closed', 'failed']).optional(),
  durationMs: z
    .number()
    .finite()
    .nonnegative()
    .max(2 ** 53 - 1)
    .optional(),
  queueWaitMs: z
    .number()
    .finite()
    .nonnegative()
    .max(2 ** 53 - 1)
    .optional(),
  executionMs: z
    .number()
    .finite()
    .nonnegative()
    .max(2 ** 53 - 1)
    .optional(),
  replyMs: z
    .number()
    .finite()
    .nonnegative()
    .max(2 ** 53 - 1)
    .optional(),
  queueDepth: z.number().int().nonnegative().max(1_000_000).optional(),
  startedStepCount: z.number().int().nonnegative().max(1_000_000).optional(),
  completedStepCount: z.number().int().nonnegative().max(1_000_000).optional(),
  hardStepLimit: z.number().int().positive().max(1_000_000).optional(),
  continuationIntentId: z.string().min(1).max(160).optional(),
  continuationGoalId: z.string().min(1).max(160).optional(),
  continuationPhase: z.enum(['pending', 'queued', 'running', 'waiting', 'stopped']).optional(),
  continuationReason: z
    .enum([
      'goal_active',
      'model_unavailable',
      'workflow_wait',
      'plan_mode',
      'budget_exhausted',
      'paused',
      'complete',
      'blocked',
      'usage_limited',
      'no_tool_calls',
      'no_progress',
      'continuation_limit',
      'disabled',
      'interrupted',
      'result_unknown',
      'stale_goal',
      'user_turn',
      'run_failed',
      'repair',
      'repair_exhausted',
      'retry_wait',
      'retry_exhausted',
    ])
    .optional(),
  continuationTriggerKind: z
    .enum(['step_limit', 'run_completed', 'retry', 'revalidate', 'startup', 'manual', 'unknown'])
    .optional(),
  inputEstimatedTokens: z
    .number()
    .int()
    .nonnegative()
    .max(2 ** 53 - 1)
    .optional(),
  inputLimit: z
    .number()
    .int()
    .nonnegative()
    .max(2 ** 53 - 1)
    .optional(),
  summaryMaxOutput: z
    .number()
    .int()
    .nonnegative()
    .max(2 ** 53 - 1)
    .optional(),
  chunkIndex: z.number().int().nonnegative().max(1_000_000).optional(),
  chunkCount: z.number().int().nonnegative().max(1_000_000).optional(),
  thresholdRatio: z.number().finite().min(0).max(1).optional(),
  pending: z.number().int().nonnegative().max(1_000_000).optional(),
  bytesIn: z
    .number()
    .int()
    .nonnegative()
    .max(2 ** 53 - 1)
    .optional(),
  bytesOut: z
    .number()
    .int()
    .nonnegative()
    .max(2 ** 53 - 1)
    .optional(),
  memoryBytes: z
    .number()
    .int()
    .nonnegative()
    .max(2 ** 53 - 1)
    .optional(),
  dropped: z.number().int().nonnegative().max(1_000_000_000).optional(),
  sampled: z.boolean().optional(),
  /** SQLite/Bun runtime facts captured from the live connection. These fields are safe to log. */
  sqliteVersion: z.string().regex(/^\d+\.\d+(?:\.\d+)?$/).max(32).optional(),
  runtimeVersion: z.string().regex(/^\d+\.\d+\.\d+$/).max(32).optional(),
  databaseSchemaVersion: z.number().int().nonnegative().max(1_000_000).optional(),
  userVersion: z.number().int().nonnegative().max(1_000_000).optional(),
  journalMode: z.enum(['delete', 'truncate', 'persist', 'memory', 'wal', 'off', 'unknown']).optional(),
  synchronous: z.number().int().nonnegative().max(3).optional(),
  busyTimeoutMs: z.number().int().nonnegative().max(2_147_483_647).optional(),
  foreignKeys: z.boolean().optional(),
  pageSize: z.number().int().positive().max(1_048_576).optional(),
})

export type DiagnosticEvent = z.infer<typeof diagnosticEventSchema>

/** A synchronous, non-throwing seam for Host, Storage and Client instrumentation. */
export interface DiagnosticSink {
  emit(event: DiagnosticEvent): void
}

export const DIAGNOSTIC_SCHEMA_VERSION = 1 as const

export function diagnosticEvent(
  input: Omit<DiagnosticEvent, 'schemaVersion' | 'time' | 'monotonicMs'> & { time?: number; monotonicMs?: number },
): DiagnosticEvent {
  return diagnosticEventSchema.parse({
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    ...input,
    time: input.time ?? Date.now(),
    monotonicMs: input.monotonicMs ?? performance.now(),
  })
}
