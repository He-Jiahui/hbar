import { createHash } from 'node:crypto'
import { z } from 'zod'
import { executionOwnershipSchema } from '@hbar/contracts/runtime'
import { runtimePluginStateSchema, RUNTIME_PLUGIN_HOOKS } from '@hbar/plugin-sdk/runtime-plugin'
import { RUNTIME_APPLICATION_METHODS } from '@hbar/kernel/runtime-application'

export const RUNTIME_PLUGIN_SERVICES = {
  goal: [...RUNTIME_APPLICATION_METHODS.goal, 'refreshSession'], plan: [...RUNTIME_APPLICATION_METHODS.plan, 'refreshSession'],
  mode: [...RUNTIME_APPLICATION_METHODS.mode, 'effectiveMode'], budget: [...RUNTIME_APPLICATION_METHODS.budget, 'refreshSession'],
  workflow: RUNTIME_APPLICATION_METHODS.workflow, agent: RUNTIME_APPLICATION_METHODS.agent, git: RUNTIME_APPLICATION_METHODS.git,
  browser: RUNTIME_APPLICATION_METHODS.browser, computer: RUNTIME_APPLICATION_METHODS.computer, execution: RUNTIME_APPLICATION_METHODS.execution,
  workspaceQuery: RUNTIME_APPLICATION_METHODS.workspaceQuery, 'workspace-directories': ['resolve'],
  models: ['list', 'get', 'secret'], storage: ['call'],
} as const
export const runtimePluginAuthoritySchema = z.strictObject({ execution: executionOwnershipSchema.optional(), sessionId: z.string().min(1).max(160).optional() })
export const runtimePluginConfigurationSchema = z.strictObject({
  dataRoot: z.string().min(1).max(4_000), cacheRoot: z.string().min(1).max(4_000),
  config: z.record(z.string(), z.unknown()).default({}),
})
export const runtimePluginResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('value'), value: z.unknown() }),
  z.strictObject({ kind: z.literal('error'), code: z.string().min(1).max(128), message: z.string().max(2_000) }),
  z.strictObject({ kind: z.literal('control'), control: z.strictObject({ stop: z.literal('goal_replaced'), previousGoalId: z.string().min(1).max(160), goalId: z.string().min(1).max(160) }) }),
])
export const PLUGIN_RUNTIME_FINGERPRINT = createHash('sha256').update(JSON.stringify(['hbar.plugin.runtime.v1',
  z.toJSONSchema(runtimePluginStateSchema), z.toJSONSchema(runtimePluginAuthoritySchema), z.toJSONSchema(runtimePluginConfigurationSchema),
  z.toJSONSchema(runtimePluginResultSchema), RUNTIME_PLUGIN_SERVICES, RUNTIME_PLUGIN_HOOKS,
])).digest('hex')
export const RUNTIME_PLUGIN_CONTROL_METHODS = ['plugin.application.callback', 'plugin.application.control'] as const
