import { z } from 'zod'
import { HbarError, toolPresentationDeclarationSchema } from '@hbar/contracts'
import { runtimeDriverToolSchema, runtimeToolResultSchema } from './runtime-driver'
import { resolveToolTimeoutMs, type ToolDefinition, type ToolContext } from './index'

export const runtimePluginToolSchema = runtimeDriverToolSchema.extend({
  presentation: toolPresentationDeclarationSchema.optional(), humanApproval: z.literal('required').optional(),
  commandArgument: z.string().min(1).max(128).optional(),
  workspaceAccess: z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('none') }), z.strictObject({ kind: z.literal('workspace') }),
    z.strictObject({ kind: z.literal('paths'), arguments: z.array(z.strictObject({ field: z.string().min(1).max(128), access: z.enum(['read', 'write']) })).max(64) })]).optional(),
})
export type RuntimePluginTool = z.infer<typeof runtimePluginToolSchema>
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
