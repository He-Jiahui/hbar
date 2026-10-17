import { z } from 'zod'
import { runtimeUnitDescriptorSchema, type RuntimeIdleAuthority } from '@hbar/contracts/runtime'
import type { IpcPeer } from './ipc'
export const RUNTIME_CONTROL_METHODS = Object.freeze([
  'runtime.prepare',
  'runtime.activate',
  'runtime.idle',
  'runtime.drain',
  'runtime.dispose',
  'runtime.exit',
])

export const runtimePrepareSchema = z.strictObject({
  descriptor: runtimeUnitDescriptorSchema,
  configuration: z.record(z.string(), z.unknown()),
})
export const runtimeReadySchema = z.strictObject({
  contractFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  storageSchema: z.number().int().nonnegative(),
  capabilities: z.array(z.string().min(1).max(128)).max(512),
})
export const runtimeDrainSchema = z.strictObject({
  requests: z.number().int().nonnegative(),
  runs: z.number().int().nonnegative(),
  resources: z.number().int().nonnegative(),
})
export const runtimeDrainInputSchema = z.strictObject({ mode: z.literal('idle-retirement') }).optional()
export type RuntimePreparation = z.infer<typeof runtimePrepareSchema>
export type RuntimeReady = z.infer<typeof runtimeReadySchema>
export type RuntimeDrain = z.infer<typeof runtimeDrainSchema>
/** The service explicitly opts in. Counts describe all retained domain authority, not RSS. */
export const runtimeServiceIdleSchema = runtimeDrainSchema.extend({ eligible: z.boolean() })
export type RuntimeServiceIdle = z.infer<typeof runtimeServiceIdleSchema>
export const runtimeIdleIpcSchema = z.strictObject({
  inFlight: z.number().int().nonnegative(),
  queued: z.number().int().nonnegative(),
  queuedBytes: z.number().int().nonnegative(),
  incoming: z.number().int().nonnegative(),
  incomingQueued: z.number().int().nonnegative(),
  incomingBytes: z.number().int().nonnegative(),
  bufferedBytes: z.number().int().nonnegative(),
  failed: z.boolean(),
})
export type RuntimeIdleIpc = z.infer<typeof runtimeIdleIpcSchema>
export const runtimeIdleProbeSchema = runtimeServiceIdleSchema.extend({
  ipc: runtimeIdleIpcSchema,
})
export type RuntimeIdleProbe = z.infer<typeof runtimeIdleProbeSchema>
/** incomingBytes includes the current probe's encoded envelope. Keep it observable, never erase it.
 * Once incoming (minus that one probe) and incomingQueued are zero, those bytes cannot belong to
 * another inbound call. Fragment assemblies/sends remain independently fenced by bufferedBytes.
 */
export function runtimeIdleIpcIsEmpty(ipc: RuntimeIdleIpc): boolean {
  return (
    !ipc.failed &&
    ipc.inFlight === 0 &&
    ipc.queued === 0 &&
    ipc.queuedBytes === 0 &&
    ipc.incoming === 0 &&
    ipc.incomingQueued === 0 &&
    ipc.bufferedBytes === 0
  )
}
export function runtimeIdleProbeIsEmpty(probe: RuntimeIdleProbe): boolean {
  return (
    probe.eligible &&
    probe.requests === 0 &&
    probe.runs === 0 &&
    probe.resources === 0 &&
    runtimeIdleIpcIsEmpty(probe.ipc)
  )
}
/** Shared by the real entry handler and protocol regression fixtures. */
export async function readRuntimeIdleProbe(
  service: Pick<RuntimeProcessService, 'idle'> | undefined,
  phase: () => string,
  snapshot: () => RuntimeIdleIpc,
  authority?: RuntimeIdleAuthority,
): Promise<RuntimeIdleProbe> {
  const before = phase()
  const supported = (before === 'serving' || before === 'draining') && service?.idle !== undefined
  const counts =
    supported && service?.idle
      ? runtimeServiceIdleSchema.parse(await service.idle(authority))
      : { eligible: false, requests: 0, runs: 0, resources: 0 }
  const raw = runtimeIdleIpcSchema.parse(snapshot())
  const probe = runtimeIdleProbeSchema.parse({ ...counts, ipc: { ...raw, incoming: Math.max(0, raw.incoming - 1) } })
  return { ...probe, eligible: supported && phase() === before && raw.incoming >= 1 && runtimeIdleProbeIsEmpty(probe) }
}
export interface RuntimeProcessService {
  /** Read-only preparation. Production authority is absent until activate succeeds. */
  prepare(input: RuntimePreparation): Promise<RuntimeReady>
  activate(role: 'default' | 'draining'): Promise<void>
  drain(): Promise<RuntimeDrain>
  /** Read-only opt-in; must count pending summaries/callbacks/claims and not touch idle timestamps. */
  idle?(authority?: RuntimeIdleAuthority): RuntimeServiceIdle | Promise<RuntimeServiceIdle>
  dispose(): Promise<void>
}
export interface RuntimeProcessContext {
  readonly purpose?: 'startup' | 'candidate' | 'recovery' | 'idle-wake'
  readonly peer: IpcPeer
  readonly configuration: Readonly<Record<string, unknown>>
  readonly preparing: () => boolean
}
export interface RuntimeProcessModule {
  create(context: RuntimeProcessContext): RuntimeProcessService | Promise<RuntimeProcessService>
}
