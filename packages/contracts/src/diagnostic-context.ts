import { z } from 'zod'

/**
 * Safe identifiers used to correlate one request across the Host, Kernel and
 * Storage layers.  Business payloads, paths, URLs and error text deliberately
 * have no place in this contract.
 */
export const diagnosticCorrelationSchema = z.strictObject({
  instanceId: z.string().min(1).max(160).optional(),
  contextId: z.string().min(1).max(160).optional(),
  rpcId: z.string().min(1).max(160).optional(),
  requestId: z.string().min(1).max(160).optional(),
  sessionId: z.string().min(1).max(160).optional(),
  runId: z.string().min(1).max(160).optional(),
})

export type DiagnosticCorrelation = z.infer<typeof diagnosticCorrelationSchema>
export type ReadonlyDiagnosticCorrelation = Readonly<DiagnosticCorrelation>

/** Cross-layer scope seam. Implementations must not expose mutable ambient state. */
export interface DiagnosticScopePort {
  current(): ReadonlyDiagnosticCorrelation | undefined
  run<T>(context: ReadonlyDiagnosticCorrelation, operation: () => T): T
}
