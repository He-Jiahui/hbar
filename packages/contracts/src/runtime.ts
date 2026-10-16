import { z } from 'zod'

const opaqueId = z.string().min(1).max(160)
export const runtimeUnitIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9@._:/-]+$/)
export const runtimeArtifactIdSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const runtimeOwnerSchema = z.strictObject({
  unitId: runtimeUnitIdSchema,
  generation: z.number().int().positive(),
  incarnation: opaqueId,
})
export type RuntimeOwner = z.infer<typeof runtimeOwnerSchema>
/** Authenticated parent-only native job sample. No PID list or native handle crosses IPC. */
export const runtimeIdleAuthoritySchema = z.strictObject({
  owner: runtimeOwnerSchema,
  nativeActive: z.number().int().nonnegative().safe(),
})
export type RuntimeIdleAuthority = z.infer<typeof runtimeIdleAuthoritySchema>

/** Local supervision ports. Native handles and functions never cross the IPC boundary. */
export interface RuntimeProcessTree {
  /** Pure native job/group active count. Missing capability means unknown, never zero. */
  active?(): number
  terminate(): void
  join(timeoutMs: number): Promise<void>
  close(): void
}
export interface RuntimeProcessTreePort {
  readonly environment: Readonly<Record<string, string>>
  attach(pid: number, signal: AbortSignal): Promise<RuntimeProcessTree>
}

export const runtimeVersionSchema = z.strictObject({
  unitId: runtimeUnitIdSchema,
  generation: z.number().int().positive(),
  artifactId: runtimeArtifactIdSchema,
})
export type RuntimeVersion = z.infer<typeof runtimeVersionSchema>
export const runtimeVersionSetSchema = z.strictObject({
  kernel: runtimeVersionSchema,
  driver: runtimeVersionSchema,
  plugins: z.array(runtimeVersionSchema).max(256),
  hooks: z.array(runtimeVersionSchema).max(256),
})
export type RuntimeVersionSet = z.infer<typeof runtimeVersionSetSchema>

export const executionOwnershipSchema = z.strictObject({
  leaseId: opaqueId,
  sessionId: opaqueId,
  runId: opaqueId,
  owner: runtimeOwnerSchema,
  fence: z.number().int().positive(),
  acquiredAt: z.number().int().nonnegative(),
  versions: runtimeVersionSetSchema,
})
export type ExecutionOwnership = z.infer<typeof executionOwnershipSchema>
export const runtimeToolPermitSchema = z.strictObject({
  id: opaqueId,
  leaseId: opaqueId,
  callId: opaqueId,
  owner: runtimeOwnerSchema,
})
export const runtimeResourceLeaseSchema = z.strictObject({
  id: opaqueId,
  key: z.string().min(1).max(4_000),
  owner: runtimeOwnerSchema,
  executionLeaseId: opaqueId.nullable(),
})

export const runRecoverySchema = z.strictObject({
  recoveryId: opaqueId,
  chainId: opaqueId,
  rootRunId: opaqueId,
  predecessorRunId: opaqueId,
  attempt: z.number().int().min(1).max(32),
  automaticAttempt: z.number().int().min(0).max(2).optional(),
  manual: z.boolean().optional(),
})
export type RunRecovery = z.infer<typeof runRecoverySchema>
export const recoveryChainSchema = z.strictObject({
  chainId: opaqueId,
  sessionId: opaqueId,
  rootRunId: opaqueId,
  currentRunId: opaqueId,
  attempts: z.number().int().min(0).max(32),
  automaticAttempts: z.number().int().min(0).max(2).optional(),
  status: z.enum(['pending', 'waiting', 'running', 'settled', 'manual_required']),
  reasonCode: z.string().min(1).max(128).nullable(),
  updatedAt: z.number().int().nonnegative(),
})
export type RecoveryChain = z.infer<typeof recoveryChainSchema>

export const runtimeUnitDescriptorSchema = z.strictObject({
  id: runtimeUnitIdSchema,
  kind: z.enum(['base', 'controller', 'kernel', 'driver', 'plugin', 'storage', 'maintenance', 'resources']),
  isolation: z.enum(['base', 'process', 'worker']),
  dependencies: z.array(runtimeUnitIdSchema).max(256),
  /** Omission preserves legacy capability dependencies; [] declares stable port-only dependencies. */
  reloadDependencies: z.array(runtimeUnitIdSchema).max(256).optional(),
  required: z.boolean(),
  reloadable: z.boolean(),
  contractFingerprint: runtimeArtifactIdSchema,
  storageSchema: z.number().int().nonnegative(),
})
export type RuntimeUnitDescriptor = z.infer<typeof runtimeUnitDescriptorSchema>

export const runtimeGenerationSchema = z.strictObject({
  ...runtimeOwnerSchema.shape,
  artifactId: runtimeArtifactIdSchema,
  role: z.enum(['candidate', 'default', 'draining']),
  phase: z.enum(['preparing', 'ready', 'serving', 'recovering', 'draining', 'disposing', 'disposed', 'failed']),
  pid: z.number().int().positive().nullable(),
  references: z.strictObject({
    runs: z.number().int().nonnegative(),
    resources: z.number().int().nonnegative(),
    requests: z.number().int().nonnegative(),
  }),
  lastHeartbeatAt: z.number().int().nonnegative().nullable(),
  failures: z.number().int().nonnegative(),
  nextAttemptAt: z.number().int().nonnegative().nullable(),
  reasonCode: z.string().min(1).max(128).nullable(),
})
export type RuntimeGeneration = z.infer<typeof runtimeGenerationSchema>

export const runtimeUnitSnapshotSchema = z.strictObject({
  descriptor: runtimeUnitDescriptorSchema,
  generations: z.array(runtimeGenerationSchema).max(3),
  queuedArtifactId: runtimeArtifactIdSchema.nullable(),
})
export type RuntimeUnitSnapshot = z.infer<typeof runtimeUnitSnapshotSchema>
export const runtimeSourceReloadSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  phase: z.enum(['idle', 'building', 'prepared', 'applying', 'failed', 'restart_required']),
  unitIds: z.array(runtimeUnitIdSchema).max(512),
  operationId: opaqueId.nullable(),
  artifactSetId: opaqueId.nullable(),
  reasonCode: z.string().min(1).max(128).nullable(),
  updatedAt: z.number().int().nonnegative(),
})
export type RuntimeSourceReload = z.infer<typeof runtimeSourceReloadSchema>
export const runtimeAdmissionSchema = z.strictObject({
  phase: z.enum(['initializing', 'serving', 'recovering', 'handover', 'stopped']),
  reasonCode: z.string().min(1).max(128).nullable(),
  startup: z
    .strictObject({
      attempts: z.number().int().nonnegative(),
      nextAttemptAt: z.number().int().nonnegative().nullable(),
    })
    .optional(),
  storage: z.strictObject({
    phase: z.enum(['waiting', 'serving', 'handover', 'fenced', 'closed']),
    owner: runtimeOwnerSchema.nullable(),
    inFlight: z.number().int().min(0).max(64),
    queued: z.number().int().min(0).max(256),
    bufferedBytes: z.number().int().nonnegative(),
    reasonCode: z.string().min(1).max(128).nullable(),
  }),
})
export const runtimeSnapshotSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  instanceId: opaqueId,
  ready: z.boolean(),
  units: z.array(runtimeUnitSnapshotSchema).max(512),
  preparedArtifactSets: z.array(opaqueId).max(256),
  sourceReload: runtimeSourceReloadSchema.optional(),
  admission: runtimeAdmissionSchema.optional(),
})
export type RuntimeSnapshot = z.infer<typeof runtimeSnapshotSchema>

export const runtimeReloadUnitSchema = z.strictObject({
  unitId: runtimeUnitIdSchema,
  artifactId: runtimeArtifactIdSchema,
  generation: z.number().int().positive().nullable(),
  phase: z.enum([
    'queued',
    'preparing',
    'waiting_capacity',
    'ready',
    'activating',
    'switched',
    'draining',
    'completed',
    'failed',
    'cancelled',
    'restart_required',
  ]),
  reasonCode: z.string().min(1).max(128).nullable(),
})
export const runtimeReloadSchema = z.strictObject({
  operationId: opaqueId,
  artifactSetId: opaqueId,
  phase: z.enum([
    'queued',
    'preparing',
    'waiting_capacity',
    'activating',
    'draining',
    'completed',
    'failed',
    'cancelled',
    'restart_required',
  ]),
  units: z.array(runtimeReloadUnitSchema).min(1).max(512),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  switchedAt: z.number().int().nonnegative().nullable(),
  cancellable: z.boolean(),
})
export type RuntimeReload = z.infer<typeof runtimeReloadSchema>

export const runtimeDeltaSchema = z.strictObject({
  revision: z.number().int().positive(),
  units: z.array(runtimeUnitSnapshotSchema).max(32),
  operations: z.array(runtimeReloadSchema).max(16),
  instanceId: opaqueId.optional(),
  ready: z.boolean().optional(),
  sourceReload: runtimeSourceReloadSchema.optional(),
  admission: runtimeAdmissionSchema.optional(),
  preparedArtifactSets: z.array(opaqueId).max(256).optional(),
})
export type RuntimeDelta = z.infer<typeof runtimeDeltaSchema>
export const runtimeWatchInputSchema = z.strictObject({ cursor: z.number().int().nonnegative().optional() })
export const runtimeWatchResultSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  snapshot: runtimeSnapshotSchema.nullable(),
  events: z.array(runtimeDeltaSchema).max(64),
  reset: z.boolean(),
})
export type RuntimeWatchResult = z.infer<typeof runtimeWatchResultSchema>

export const RUNTIME_LIMITS = Object.freeze({
  inFlight: 64,
  queued: 256,
  bufferedBytes: 64 * 1024 * 1024,
  messageBytes: 32 * 1024 * 1024,
  fragmentChars: 16_384,
  preparing: 2,
  servingGenerations: 2,
  candidates: 1,
  tools: 64,
  heartbeatMs: 2_000,
  missedHeartbeats: 3,
  startupMs: 120_000,
  shutdownMs: 5_000,
})
