import { z } from 'zod'
import { HbarError, toolPresentationDeclarationSchema, settingsContributionSchema, terminalContributionSchema, toolWindowContributionSchema, themeContributionSchema } from '@hbar/contracts'
import { runtimeDriverToolSchema, runtimeToolResultSchema } from './runtime-driver'
import { resolveToolTimeoutMs, type ToolDefinition, type ToolContext, type HookEvents } from './index'

export const runtimePluginToolSchema = runtimeDriverToolSchema.extend({
  presentation: toolPresentationDeclarationSchema.optional(), humanApproval: z.literal('required').optional(),
  requiresProcess: z.boolean().optional(),
  commandArgument: z.string().min(1).max(128).optional(),
  workspaceAccess: z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('none') }), z.strictObject({ kind: z.literal('workspace') }),
    z.strictObject({ kind: z.literal('paths'), arguments: z.array(z.strictObject({ field: z.string().min(1).max(128), access: z.enum(['read', 'write']) })).max(64) })]).optional(),
})
export type RuntimePluginTool = z.infer<typeof runtimePluginToolSchema>
export const RUNTIME_PLUGIN_HOOKS = ['context.build', 'model.request', 'tool.before', 'tool.admitting', 'tool.executing', 'tool.after', 'tool.settled',
  'step.end', 'tools.select', 'tools.advertise', 'run.start', 'run.modeChanged', 'run.end', 'run.cancelRequested', 'session.idle',
  'session.continuationFailed', 'budget.committed', 'budget.beforeContinue', 'plan.implementationRequested', 'goal.beforeComplete',
  'goal.beforeContinue', 'goal.replaced', 'goal.cleared', 'agent.patch', 'agent.settled'] as const satisfies readonly (keyof HookEvents)[]
export type RuntimePluginHook = typeof RUNTIME_PLUGIN_HOOKS[number]
export const runtimePluginManifestSchema = z.object({
  id: z.string().min(1).max(160), packageName: z.string().min(1).max(160).optional(), name: z.string().min(1).max(512),
  version: z.string().min(1).max(128), apiVersion: z.string().min(1).max(128), description: z.string().max(32_000),
  scope: z.enum(['host', 'workspace', 'session', 'run', 'client']), required: z.boolean().optional(), restartRequired: z.boolean().optional(),
  installScope: z.enum(['global', 'project']).optional(), provides: z.record(z.string(), z.string()).optional(),
  requires: z.record(z.string(), z.string()).optional(), optional: z.record(z.string(), z.string()).optional(),
  permissions: z.array(z.string().max(160)).max(256),
  contributes: z.object({ commands: z.array(terminalContributionSchema).max(256), panels: z.array(toolWindowContributionSchema).max(256),
    renderers: z.array(z.record(z.string(), z.unknown())).max(256), settings: settingsContributionSchema.optional(), theme: themeContributionSchema.optional() }).optional(),
})
export const runtimePluginStateSchema = z.strictObject({
  manifests: z.array(runtimePluginManifestSchema).min(1).max(16), config: z.record(z.string(), z.unknown()),
  configSchema: z.record(z.string(), z.unknown()).nullable(),
  tools: z.array(runtimePluginToolSchema).max(4_096), hooks: z.array(z.enum(RUNTIME_PLUGIN_HOOKS)).max(64),
  panels: z.array(toolWindowContributionSchema).max(256).default([]),
  capabilities: z.record(z.string().min(1).max(160), z.array(z.string().min(1).max(128)).max(128)),
})
export type RuntimePluginState = z.infer<typeof runtimePluginStateSchema>

const recordSchema = z.record(z.string(), z.unknown())
/** Tool implementations are replaced by descriptions; signals and commit callbacks use their existing named ports. */
export function describeRuntimeHook<Event extends RuntimePluginHook>(event: Event, value: HookEvents[Event], output = false): Record<string, unknown> {
  const result = { ...recordSchema.parse(value) }
  if (event === 'tools.select' || event === 'tools.advertise') {
    const tools = value as HookEvents['tools.select']
    result.tools = tools.tools.map(describeRuntimeTool)
  } else if (event === 'tool.before' || event === 'tool.admitting' || event === 'tool.executing' || event === 'tool.settled') {
    const tool = value as HookEvents['tool.before']
    result.tool = describeRuntimeTool(tool.tool)
  }
  if (output && result.context && typeof result.context === 'object')
    result.context = Object.fromEntries(Object.entries(result.context).filter(([, field]) => typeof field !== 'function' && !(field instanceof AbortSignal)))
  return result
}
/** A Hook may select existing tools or alter their model description, without replacing authority or execution. */
export function restoreRuntimeHook<Event extends RuntimePluginHook>(event: Event, raw: unknown, originals: readonly ToolDefinition[], originalValue?: HookEvents[Event]): HookEvents[Event] {
  const result = { ...recordSchema.parse(raw) }
  const restore = (value: unknown): ToolDefinition => {
    const description = runtimePluginToolSchema.parse(value)
    const original = originals.find(tool => tool.name === description.name)
    if (!original || original.effect !== description.effect)
      throw new HbarError('RUNTIME_TOOL_MISMATCH', 'A Hook cannot introduce an unbound tool or change its effect')
    return original.description === description.description ? original : { ...original, description: description.description }
  }
  if (event === 'tools.select' || event === 'tools.advertise') result.tools = z.array(z.unknown()).max(4_096).parse(result.tools).map(restore)
  else if (event === 'tool.before' || event === 'tool.admitting' || event === 'tool.executing' || event === 'tool.settled') result.tool = restore(result.tool)
  if (originalValue && 'context' in originalValue) result.context = originalValue.context
  // Each named Hook selects this local domain shape; every transported graph and tool descriptor is validated above.
  return result as HookEvents[Event]
}
export interface RuntimeToolInvocation {
  validate(name: string, args: unknown): Promise<unknown>
  execute(name: string, args: Record<string, unknown>, context: ToolContext): Promise<unknown>
}
/** Only JSON descriptions cross the port; original schemas and execution functions remain in the plugin. */
export function describeRuntimeTool(tool: ToolDefinition): RuntimePluginTool {
  return runtimePluginToolSchema.parse({ name: tool.name, description: tool.description, effect: tool.effect,
    inputSchema: tool.inputJsonSchema ?? z.toJSONSchema(tool.inputSchema, { io: 'input', unrepresentable: 'any' }),
    timeoutMs: resolveToolTimeoutMs(tool),
    ...(tool.timeoutArgument ? { timeoutArgument: tool.timeoutArgument } : {}),
    ...(tool.presentation ? { presentation: tool.presentation } : {}),
    ...(tool.humanApproval ? { humanApproval: tool.humanApproval } : {}),
    ...(tool.requiresProcess === undefined ? {} : { requiresProcess: tool.requiresProcess }),
    ...(tool.commandArgument ? { commandArgument: tool.commandArgument } : {}),
    ...(tool.workspaceAccess ? { workspaceAccess: tool.workspaceAccess } : {}),
  })
}
export function runtimeToolAdapter(raw: unknown, port: RuntimeToolInvocation): ToolDefinition {
  const tool = runtimePluginToolSchema.parse(raw)
  return { name: tool.name, description: tool.description, effect: tool.effect,
    inputSchema: z.record(z.string(), z.unknown()), inputJsonSchema: tool.inputSchema, timeoutMs: tool.timeoutMs,
    ...(tool.timeoutArgument ? { timeoutArgument: tool.timeoutArgument } : {}),
    ...(tool.presentation ? { presentation: tool.presentation } : {}),
    ...(tool.humanApproval ? { humanApproval: tool.humanApproval } : {}),
    ...(tool.requiresProcess === undefined ? {} : { requiresProcess: tool.requiresProcess }),
    ...(tool.commandArgument ? { commandArgument: tool.commandArgument } : {}),
    ...(tool.workspaceAccess ? { workspaceAccess: tool.workspaceAccess } : {}),
    async validate(args) {
      try { return z.record(z.string(), z.unknown()).parse(await port.validate(tool.name, args)) }
      catch (error) {
        if (error instanceof HbarError) throw error
        throw new HbarError('INVALID_TOOL_INPUT', 'The tool owner rejected the arguments', { cause: error })
      }
    },
    async execute(args, context) { return runtimeToolResultSchema.parse(await port.execute(tool.name, args, context)) },
  }
}
