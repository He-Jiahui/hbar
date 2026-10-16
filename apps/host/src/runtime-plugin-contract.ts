import { runtimePluginIdleCheckpointSchema } from '@hbar/plugin-sdk'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { executionOwnershipSchema } from '@hbar/contracts/runtime'
import { workspaceSchema } from '@hbar/contracts/directory'
import { osConfinementOptionsSchema } from '@hbar/plugin-sdk'
import { nodeCallAuthoritySchema } from '@hbar/contracts/node'
import { runtimePluginStateSchema, RUNTIME_PLUGIN_HOOKS } from '@hbar/plugin-sdk/runtime-plugin'
import { RUNTIME_APPLICATION_METHODS } from '@hbar/kernel/runtime-application'

export const RUNTIME_PLUGIN_CALLBACK_TIMEOUT_MS = 1_325_000

export const RUNTIME_PLUGIN_SERVICES = {
  goal: [...RUNTIME_APPLICATION_METHODS.goal, 'refreshSession'],
  plan: [...RUNTIME_APPLICATION_METHODS.plan, 'refreshSession'],
  mode: [...RUNTIME_APPLICATION_METHODS.mode, 'effectiveMode'],
  budget: [...RUNTIME_APPLICATION_METHODS.budget, 'refreshSession'],
  workflow: RUNTIME_APPLICATION_METHODS.workflow,
  agent: RUNTIME_APPLICATION_METHODS.agent,
  git: RUNTIME_APPLICATION_METHODS.git,
  browser: RUNTIME_APPLICATION_METHODS.browser,
  computer: RUNTIME_APPLICATION_METHODS.computer,
  execution: RUNTIME_APPLICATION_METHODS.execution,
  'browser-use': RUNTIME_APPLICATION_METHODS.browser,
  'computer-use': RUNTIME_APPLICATION_METHODS.computer,
  workspaceQuery: RUNTIME_APPLICATION_METHODS.workspaceQuery,
  'workspace-directories': ['resolve'],
  models: ['list', 'get', 'secret'],
  storage: ['call'],
} as const
export const runtimePluginAuthoritySchema = z.strictObject({
  execution: executionOwnershipSchema.optional(),
  sessionId: z.string().min(1).max(160).optional(),
})
export const runtimeNativeResourceSchema = z.strictObject({
  kind: z.enum(['browser', 'computer', 'terminal']),
  id: z.string().min(1).max(160),
  sessionId: z.string().min(1).max(160),
})
export const runtimePluginInvocationSchema = z.strictObject({
  operation: z.enum(['capability', 'validate', 'execute', 'hook', 'commitGoal']),
  name: z.string().min(1).max(160),
  method: z.string().max(128).optional(),
  catalog: z.array(runtimePluginStateSchema.shape.tools.element).max(4_096),
  invocationId: z.string().uuid().optional(),
  workspaceExecutionScope: z
    .strictObject({
      workspace: z.strictObject({ path: workspaceSchema.shape.path, location: workspaceSchema.shape.location }),
      authority: nodeCallAuthoritySchema.optional(),
      signal: z.instanceof(AbortSignal),
    })
    .optional(),
  toolTimeoutMs: z.number().int().min(1).max(1_200_000).optional(),
  mount: z
    .strictObject({
      root: z.string().min(1).max(4_000),
      folders: z
        .array(z.strictObject({ alias: z.string().min(1).max(160), path: z.string().min(1).max(4_000) }))
        .max(256),
    })
    .optional(),
})
export const runtimePluginCatalogSchema = z
  .array(z.strictObject({ unitId: z.string().min(1).max(160), state: runtimePluginStateSchema }))
  .max(128)
export const runtimePluginConfigurationSchema = z.strictObject({
  dataRoot: z.string().min(1).max(4_000),
  cacheRoot: z.string().min(1).max(4_000),
  noLocalExec: z.boolean().default(false),
  config: z.record(z.string(), z.unknown()).default({}),
})
export const runtimePluginResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('value'), value: z.unknown() }),
  z.strictObject({ kind: z.literal('error'), code: z.string().min(1).max(128), message: z.string().max(2_000) }),
  z.strictObject({
    kind: z.literal('control'),
    control: z.strictObject({
      stop: z.literal('goal_replaced'),
      previousGoalId: z.string().min(1).max(160),
      goalId: z.string().min(1).max(160),
    }),
  }),
])
export const PLUGIN_RUNTIME_FINGERPRINT = createHash('sha256')
  .update(
    JSON.stringify([
      'hbar.plugin.runtime.v1',
      ['plugin-idle-checkpoint', z.toJSONSchema(runtimePluginIdleCheckpointSchema)],
      z.toJSONSchema(runtimePluginStateSchema),
      z.toJSONSchema(runtimePluginAuthoritySchema),
      z.toJSONSchema(runtimePluginConfigurationSchema),
      z.toJSONSchema(runtimePluginInvocationSchema, { unrepresentable: 'any' }),
      ['workspaceExecutionScope.signal', 'runtime.abort-signal'],
      ['named-callback-timeout-ms', RUNTIME_PLUGIN_CALLBACK_TIMEOUT_MS],
      z.toJSONSchema(runtimePluginResultSchema),
      RUNTIME_PLUGIN_SERVICES,
      RUNTIME_PLUGIN_HOOKS,
      z.toJSONSchema(runtimeNativeResourceSchema),
      ['resource.retain', 'resource.release'],
      ['parent-lifecycle', 'plugin.application.workflowRecovery', 'released-terminal-only-v1'],
      z.toJSONSchema(osConfinementOptionsSchema),
      z.toJSONSchema(nodeCallAuthoritySchema),
    ]),
  )
  .digest('hex')
export const RUNTIME_PLUGIN_CONTROL_METHODS = ['plugin.application.callback', 'plugin.application.control'] as const
