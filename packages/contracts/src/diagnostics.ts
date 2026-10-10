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
  contextId: z.string().min(1).max(160).optional(),
  sessionId: z.string().min(1).max(160).optional(),
  runId: z.string().min(1).max(160).optional(),
  method: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/)
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
