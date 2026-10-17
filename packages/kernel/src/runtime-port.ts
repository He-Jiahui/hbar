import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  approvalModeSchema,
  inputSchema,
  runSchema,
  runModeSchema,
  userInputRequestSchema,
  terminalContributionSchema,
  toolWindowContributionSchema,
  settingsContributionSchema,
  themeContributionSchema,
} from '@hbar/contracts'
import {
  RUNTIME_NOTIFICATION_BATCH_MAX_BYTES,
  RUNTIME_NOTIFICATION_BATCH_MAX_EVENTS,
  runtimeWireNotificationBatchSchema,
  runtimeWireNotificationSchema,
} from '@hbar/contracts/runtime-notifications'
import { nodeExecutionTargetSchema } from '@hbar/contracts/node-execution-target'
import { workspaceFolderSnapshotSchema, workspaceFoldersSchema } from '@hbar/contracts/commands/workspace-folders'
import { nodeIdSchema, nodeRootIdSchema } from '@hbar/contracts/node-address'
import { nodeWorktreeMethods } from '@hbar/contracts/node-worktree'
import { runCommandRecordSchema } from '@hbar/contracts/commands/run'
import { pluginInfoSchema } from '@hbar/contracts/commands/extensions'
import {
  commandCatalogQuerySchema,
  commandMetadataSchema,
  commandCatalogPageSchema,
  commandDescriptorSchema,
} from '@hbar/commands'
import {
  commandJobStartSchema,
  commandJobSnapshotSchema,
  commandJobWatchSchema,
  commandJobReadSchema,
  commandJobChunkSchema,
} from '@hbar/commands/jobs'
import { runtimeRecoveryRecordSchema } from '@hbar/storage'
import { RUNTIME_APPLICATION_METHODS } from './runtime-application'
import { clientCommandDirectoryQuerySchema, clientCommandDirectorySchema } from '@hbar/contracts/client-commands'
import {
  sessionCommandCallSchema,
  sessionCommandPreparationSchema,
  sessionCommandToolResultSchema,
  sessionCommandSourceSchema,
} from './session-command-port'

const id = z.string().min(1).max(160)
export const runtimeKernelCommandIdentitySchema = z.strictObject({ sessionId: id, runId: id, callId: id })
export const runtimeKernelCommandCatalogSchema = runtimeKernelCommandIdentitySchema.extend({
  query: commandCatalogQuerySchema,
})
export const runtimeKernelCommandClientsSchema = runtimeKernelCommandIdentitySchema.extend({
  query: clientCommandDirectoryQuerySchema,
})
export const runtimeKernelCommandDescribeSchema = runtimeKernelCommandIdentitySchema.extend({
  commandId: z.string().min(1).max(128),
})
export const runtimeKernelCommandPrepareSchema = runtimeKernelCommandIdentitySchema.extend({
  call: sessionCommandCallSchema,
})
export const runtimeKernelCommandExecuteSchema = runtimeKernelCommandIdentitySchema.extend({
  preparation: sessionCommandPreparationSchema,
  source: sessionCommandSourceSchema.optional(),
})
export const runtimeKernelMutationAdmissionSchema = runtimeKernelCommandIdentitySchema.extend({
  tool: z.string().min(1).max(256),
  effect: z.enum(['write', 'process', 'network']),
})
export const runtimeKernelConfigurationSchema = z.strictObject({
  instanceId: id,
  dataRoot: z.string().min(1).max(4_000),
  cacheRoot: z.string().min(1).max(4_000),
  pointerFile: z.string().min(1).max(4_000),
  settingsRoot: z.string().min(1).max(4_000),
  sessionsRoot: z.string().min(1).max(4_000),
  skillsRoot: z.string().min(1).max(4_000),
  identityRoot: z.string().min(1).max(4_000),
  demo: z.boolean(),
  noLocalExec: z.boolean().default(false),
  profileModule: z.string().min(1).max(4_000).optional(),
  isolatedPlugins: z.boolean().optional(),
  diagnosticsEnabled: z.boolean().optional(),
  diagnosticsFullCoverage: z.boolean().optional(),
})
export const runtimeKernelSubmitSchema = z.strictObject({
  sessionId: id,
  requestId: id,
  input: inputSchema,
  modelId: id,
  command: runCommandRecordSchema.optional(),
  expectedLaunchTargetRevision: z.number().int().nonnegative().optional(),
})
export const runtimeKernelSessionSchema = z.strictObject({ sessionId: id })
export const runtimeKernelRunSchema = z.strictObject({ runId: id })
export const runtimeKernelCancelSchema = runtimeKernelRunSchema.extend({ persisted: z.literal(true).optional() })
export const runtimeKernelRunsSchema = z.strictObject({ runIds: z.array(id).max(256) })
/** Private Host-only receipt reconciliation request; this is never registered on /node or operator RPC. */
export const runtimeKernelNodeIntentRecoverySchema = z.enum(['settled', 'waiting'])
/** Kernel-only request for Host-verified workspace provenance before admission. */
export const runtimeKernelNodeWorkspaceInspectionSchema = z.strictObject({ sessionId: id, runId: id, workspaceId: id })
export const runtimeKernelNodeWorkspaceMountManifestSchema = z.strictObject({
  request: runtimeKernelNodeWorkspaceInspectionSchema,
  folders: workspaceFolderSnapshotSchema,
  primary: z.strictObject({
    nodeId: nodeIdSchema,
    rootId: nodeRootIdSchema,
    nodePath: z.string().min(1).max(4_000),
  }),
})
export const runtimeKernelVerifyWorkspaceFoldersSchema = z.strictObject({
  nodeId: nodeIdSchema,
  folders: workspaceFoldersSchema,
})
export const runtimeKernelNodeWorktreeSchema = z
  .strictObject({
    nodeId: id,
    method: z.enum(['worktree.create', 'worktree.get', 'worktree.remove']),
    input: z.unknown(),
  })
  .superRefine((value, context) => {
    if (!nodeWorktreeMethods[value.method].input.safeParse(value.input).success)
      context.addIssue({ code: 'custom', message: 'Node worktree request does not match its named contract' })
  })
export const runtimeKernelStateSchema = z.strictObject({
  instanceId: id,
  permission: approvalModeSchema,
  recovered: z.number().int().nonnegative(),
  driverIsolation: z.enum(['managed', 'legacy']),
  active: z.array(z.strictObject({ sessionId: id, runId: id })).max(4_096),
  tools: z.array(z.string().min(1).max(256)).max(4_096),
  plugins: z
    .array(
      pluginInfoSchema.extend({
        configSchema: z.record(z.string(), z.unknown()).optional(),
        contributes: z
          .strictObject({
            commands: z.array(terminalContributionSchema),
            panels: z.array(toolWindowContributionSchema),
            renderers: z.array(z.record(z.string(), z.unknown())),
            settings: settingsContributionSchema.optional(),
            theme: themeContributionSchema.optional(),
          })
          .optional(),
      }),
    )
    .max(4_096),
  protectedRoots: z.array(z.string().min(1).max(4_000)).max(4_096),
  idle: z.boolean(),
  userInputs: z.array(userInputRequestSchema).max(4_096),
  protection: z.array(z.strictObject({ sessionId: id, reason: z.enum(['active', 'userInput', 'queued']) })).max(4_096),
  modes: z.array(z.strictObject({ runId: id, mode: runModeSchema })).max(4_096),
  notificationDelivery: z
    .strictObject({
      queued: z.number().int().nonnegative(),
      bufferedBytes: z.number().int().nonnegative(),
      queuedPeak: z.number().int().nonnegative(),
      bytesPeak: z.number().int().nonnegative(),
      invalidEvents: z.number().int().nonnegative(),
      acceptedEvents: z.number().int().nonnegative(),
      deliveredEvents: z.number().int().nonnegative(),
      overflowCount: z.number().int().nonnegative(),
      batchTransfers: z.number().int().nonnegative(),
      singleTransfers: z.number().int().nonnegative(),
      failure: z.string().max(128).nullable(),
      queuedByClass: z.strictObject({
        'session-event': z.number().int().nonnegative(),
        'stream-update': z.number().int().nonnegative(),
        other: z.number().int().nonnegative(),
      }),
    })
    .optional(),
})
export const runtimeKernelRecoverySchema = z.array(runtimeRecoveryRecordSchema).max(256)
/** Kernel-initiated callbacks to the stable Host, never exposed as Kernel services or operator RPC. */
export const RUNTIME_KERNEL_HOST_METHODS = [
  'kernel.commands.list',
  'kernel.commands.clients',
  'kernel.commands.describe',
  'kernel.commands.prepare',
  'kernel.commands.execute',
  'kernel.commands.admitMutation',
  'kernel.nodeIntentRecovery.reconcileRun',
  'kernel.nodeWorkspaceInspection.captureExecutionTarget',
  'kernel.nodeWorkspaceInspection.resolveWorkspaceMountManifest',
  'kernel.nodeWorkspaceInspection.verifyWorkspaceFolders',
  'kernel.nodeWorktree.call',
] as const
export const RUNTIME_KERNEL_CONTROL_METHODS = [
  // Leaf Storage RPC must progress while outer plugin invocations await their Kernel callbacks.
  'kernel.storage',
  'kernel.resume',
  'kernel.fence',
  'kernel.cancel',
  'kernel.recover',
  'kernel.recovery.resume',
  'kernel.session.refresh',
  'kernel.wake',
  'kernel.application.control',
  'kernel.application.callback',
] as const
export const KERNEL_RUNTIME_FINGERPRINT = createHash('sha256')
  .update(
    JSON.stringify([
      'hbar.kernel.runtime.v1',
      'owned-invocation-physical-reply.v1',
      'kernel.application.physical-callbacks.v1',
      'kernel.directory.tracked-commands.v1',
      z.toJSONSchema(commandJobStartSchema, { unrepresentable: 'any' }),
      [commandJobSnapshotSchema, commandJobWatchSchema, commandJobReadSchema, commandJobChunkSchema].map((schema) =>
        z.toJSONSchema(schema),
      ),
      z.toJSONSchema(runtimeKernelConfigurationSchema),
      z.toJSONSchema(runtimeKernelSubmitSchema),
      RUNTIME_APPLICATION_METHODS,
      RUNTIME_KERNEL_CONTROL_METHODS,
      RUNTIME_KERNEL_HOST_METHODS,
      z.toJSONSchema(runtimeKernelCommandCatalogSchema),
      z.toJSONSchema(runtimeKernelCommandClientsSchema),
      z.toJSONSchema(clientCommandDirectorySchema),
      z.toJSONSchema(runtimeKernelCommandDescribeSchema),
      [
        runtimeKernelCommandPrepareSchema,
        runtimeKernelCommandExecuteSchema,
        sessionCommandPreparationSchema,
        sessionCommandToolResultSchema,
      ].map((schema) => z.toJSONSchema(schema, { unrepresentable: 'any' })),
      z.toJSONSchema(runtimeKernelMutationAdmissionSchema),
      z.toJSONSchema(commandMetadataSchema),
      z.toJSONSchema(commandCatalogPageSchema, { unrepresentable: 'any' }),
      z.toJSONSchema(commandDescriptorSchema, { unrepresentable: 'any' }),
      z.toJSONSchema(runtimeKernelCancelSchema),
      z.toJSONSchema(runtimeKernelNodeIntentRecoverySchema),
      z.toJSONSchema(runtimeKernelNodeWorkspaceInspectionSchema),
      z.toJSONSchema(nodeExecutionTargetSchema),
      z.toJSONSchema(runtimeKernelNodeWorkspaceMountManifestSchema),
      z.toJSONSchema(runtimeKernelVerifyWorkspaceFoldersSchema),
      z.toJSONSchema(runtimeKernelNodeWorktreeSchema),
      Object.values(nodeWorktreeMethods).map((method) => ({
        input: z.toJSONSchema(method.input),
        output: z.toJSONSchema(method.output),
      })),
      z.toJSONSchema(runtimeWireNotificationSchema),
      z.toJSONSchema(runtimeWireNotificationBatchSchema, { unrepresentable: 'any' }),
      RUNTIME_NOTIFICATION_BATCH_MAX_EVENTS,
      RUNTIME_NOTIFICATION_BATCH_MAX_BYTES,
      z.toJSONSchema(runtimeKernelStateSchema),
      z.toJSONSchema(runSchema),
      z.toJSONSchema(runtimeKernelRecoverySchema),
    ]),
  )
  .digest('hex')
