import { createHash } from 'node:crypto'
import { z } from 'zod'
import { approvalModeSchema, inputSchema, runSchema, runModeSchema, userInputRequestSchema, terminalContributionSchema,
  toolWindowContributionSchema, settingsContributionSchema, themeContributionSchema } from '@hbar/contracts'
import { runtimeWireNotificationSchema } from '@hbar/contracts/runtime-notifications'
import { runCommandRecordSchema } from '@hbar/contracts/commands/run'
import { pluginInfoSchema } from '@hbar/contracts/commands/extensions'
import { runtimeRecoveryRecordSchema } from '@hbar/storage'
import { RUNTIME_APPLICATION_METHODS } from './runtime-application'

const id = z.string().min(1).max(160)
export const runtimeKernelConfigurationSchema = z.strictObject({
  instanceId: id, dataRoot: z.string().min(1).max(4_000), cacheRoot: z.string().min(1).max(4_000),
  pointerFile: z.string().min(1).max(4_000), settingsRoot: z.string().min(1).max(4_000),
  sessionsRoot: z.string().min(1).max(4_000), skillsRoot: z.string().min(1).max(4_000), identityRoot: z.string().min(1).max(4_000),
  demo: z.boolean(),
  profileModule: z.string().min(1).max(4_000).optional(),
})
export const runtimeKernelSubmitSchema = z.strictObject({
  sessionId: id, requestId: id, input: inputSchema, modelId: id, command: runCommandRecordSchema.optional(),
  expectedLaunchTargetRevision: z.number().int().nonnegative().optional(),
})
export const runtimeKernelSessionSchema = z.strictObject({ sessionId: id })
export const runtimeKernelRunSchema = z.strictObject({ runId: id })
export const runtimeKernelCancelSchema = runtimeKernelRunSchema.extend({ persisted: z.literal(true).optional() })
export const runtimeKernelRunsSchema = z.strictObject({ runIds: z.array(id).max(256) })
export const runtimeKernelStateSchema = z.strictObject({
  instanceId: id, permission: approvalModeSchema, recovered: z.number().int().nonnegative(),
  driverIsolation: z.enum(['managed', 'legacy']),
  active: z.array(z.strictObject({ sessionId: id, runId: id })).max(4_096),
  tools: z.array(z.string().min(1).max(256)).max(4_096), plugins: z.array(pluginInfoSchema.extend({
    configSchema: z.record(z.string(), z.unknown()).optional(),
    contributes: z.strictObject({ commands: z.array(terminalContributionSchema), panels: z.array(toolWindowContributionSchema),
      renderers: z.array(z.record(z.string(), z.unknown())), settings: settingsContributionSchema.optional(), theme: themeContributionSchema.optional() }).optional(),
  })).max(4_096),
  protectedRoots: z.array(z.string().min(1).max(4_000)).max(4_096), idle: z.boolean(),
  userInputs: z.array(userInputRequestSchema).max(4_096),
  protection: z.array(z.strictObject({ sessionId: id, reason: z.enum(['active', 'userInput', 'queued']) })).max(4_096),
  modes: z.array(z.strictObject({ runId: id, mode: runModeSchema })).max(4_096),
})
export const runtimeKernelRecoverySchema = z.array(runtimeRecoveryRecordSchema).max(256)
export const RUNTIME_KERNEL_CONTROL_METHODS = ['kernel.resume', 'kernel.fence', 'kernel.cancel', 'kernel.recover', 'kernel.recovery.resume', 'kernel.session.refresh', 'kernel.wake', 'kernel.application.control', 'kernel.application.callback'] as const
export const KERNEL_RUNTIME_FINGERPRINT = createHash('sha256').update(JSON.stringify([
  'hbar.kernel.runtime.v1', z.toJSONSchema(runtimeKernelConfigurationSchema), z.toJSONSchema(runtimeKernelSubmitSchema),
  RUNTIME_APPLICATION_METHODS,
  RUNTIME_KERNEL_CONTROL_METHODS,
  z.toJSONSchema(runtimeKernelCancelSchema),
  z.toJSONSchema(runtimeWireNotificationSchema),
  z.toJSONSchema(runtimeKernelStateSchema), z.toJSONSchema(runSchema), z.toJSONSchema(runtimeKernelRecoverySchema),
])).digest('hex')
