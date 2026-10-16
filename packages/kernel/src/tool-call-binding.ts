import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import type { Run, Session, Workspace } from '@hbar/contracts'
import type { ToolContext, ToolDefinition, ToolResult } from '@hbar/plugin-sdk'
import { toolPathArgumentSchema } from '@hbar/contracts/tool-arguments'

/** Host composition only. Preparation is read-only, bounded and cancellable; effects belong to execute. */
export interface ToolCallPreparationPort {
  prepare(
    name: string,
    args: Readonly<Record<string, unknown>>,
    context: ToolCallPreparationContext,
  ): Promise<ToolCallBinding | undefined>
}

export interface ToolCallPreparationContext {
  readonly session: Session
  readonly workspace: Workspace
  readonly run: Run
  readonly callId: string
  readonly signal: AbortSignal
}

/** One resolved operation. Its executor and admission facts must describe the same final arguments. */
export interface ToolCallBinding {
  readonly admission: ToolCallAdmission
  readonly arguments: Record<string, unknown>
  readonly execute: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>
}

export const toolCallAdmissionSchema = z.strictObject({
  effect: z.enum(['read', 'write', 'process', 'network']),
  workspaceAccess: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('none') }),
    z.strictObject({ kind: z.literal('workspace') }),
    z.strictObject({
      kind: z.literal('paths'),
      arguments: z.array(toolPathArgumentSchema).min(1).max(64),
    }),
  ]),
  requiresProcess: z.boolean().optional(),
  commandArgument: z.string().min(1).max(128).optional(),
  humanApproval: z.literal('required').optional(),
  timeoutMs: z.number().int().min(1).max(1_200_000),
})
export type ToolCallAdmission = z.infer<typeof toolCallAdmissionSchema>

export interface PreparedToolCall {
  readonly tool: ToolDefinition
  readonly arguments: Record<string, unknown>
}

/** Validate and detach the Host's resolved call before any policy/approval/intent. */
export function bindToolCall(original: ToolDefinition, binding: ToolCallBinding): PreparedToolCall {
  const admission = toolCallAdmissionSchema.parse(binding.admission)
  const args = z.record(z.string().min(1).max(256), z.json()).parse(binding.arguments)
  let bytes: number
  try {
    bytes = new TextEncoder().encode(JSON.stringify(args)).byteLength
  } catch {
    throw new HbarError('INVALID_TOOL_BINDING', 'Resolved tool arguments must be serializable')
  }
  if (bytes > 262_144) throw new HbarError('INVALID_TOOL_BINDING', 'Resolved tool arguments exceed the call capacity')
  if (typeof binding.execute !== 'function')
    throw new HbarError('INVALID_TOOL_BINDING', 'Resolved tool call has no bound executor')
  const {
    runtimeOwner: _owner,
    requiresProcess: _process,
    commandArgument: _command,
    humanApproval: _approval,
    timeoutArgument: _timeoutArgument,
    ...base
  } = original
  const execute = binding.execute
  const argumentsValue = structuredClone(args)
  if (admission.workspaceAccess.kind === 'paths') {
    for (const argument of admission.workspaceAccess.arguments) {
      if (argument.fieldPath) Object.freeze(argument.fieldPath)
      Object.freeze(argument)
    }
    Object.freeze(admission.workspaceAccess.arguments)
  }
  Object.freeze(admission.workspaceAccess)
  const { humanApproval, commandArgument, ...declaration } = admission
  const requiredApproval = original.humanApproval ?? humanApproval
  return {
    tool: Object.freeze({
      ...base,
      ...declaration,
      ...(commandArgument ? { commandArgument } : {}),
      ...(requiredApproval ? { humanApproval: requiredApproval } : {}),
      execute: (finalArgs: Record<string, unknown>, context: ToolContext) => execute(finalArgs, context),
    }),
    arguments: argumentsValue,
  }
}
