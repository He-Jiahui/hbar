import { z } from 'zod'
import { runtimeUnitDescriptorSchema } from '@hbar/contracts/runtime'
import type { IpcPeer } from './ipc'
export const RUNTIME_CONTROL_METHODS = Object.freeze(['runtime.prepare', 'runtime.activate', 'runtime.drain', 'runtime.dispose', 'runtime.exit'])

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
export type RuntimePreparation = z.infer<typeof runtimePrepareSchema>
export type RuntimeReady = z.infer<typeof runtimeReadySchema>
export type RuntimeDrain = z.infer<typeof runtimeDrainSchema>
export interface RuntimeProcessService {
  /** Read-only preparation. Production authority is absent until activate succeeds. */
  prepare(input: RuntimePreparation): Promise<RuntimeReady>
  activate(role: 'default' | 'draining'): Promise<void>
  drain(): Promise<RuntimeDrain>
  dispose(): Promise<void>
}
export interface RuntimeProcessContext {
  readonly purpose?: 'startup' | 'candidate' | 'recovery'
  readonly peer: IpcPeer
  readonly configuration: Readonly<Record<string, unknown>>
  readonly preparing: () => boolean
}
export interface RuntimeProcessModule {
  create(context: RuntimeProcessContext): RuntimeProcessService | Promise<RuntimeProcessService>
}
