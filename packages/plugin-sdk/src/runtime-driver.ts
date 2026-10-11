import { z } from 'zod'
import {
  contentBlockSchema, diagnosticEventSchema, idSchema, providerSchema, runSchema, runModeSchema, runSourceSchema,
  sessionEventSchema, thinkingLevelSchema, toolExecutionSchema, toolOutcomeSchema, usageSchema,
} from '@hbar/contracts'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import { executionOwnershipSchema } from '@hbar/contracts/runtime'
import type { ModelRequest, ToolResult } from './index'

export const runtimeMessageSchema = z.object({
  id: idSchema, sessionId: idSchema, runId: idSchema, role: z.enum(['user', 'assistant', 'tool', 'system']),
  content: z.array(contentBlockSchema).max(4096), seq: z.number().int().nonnegative(), createdAt: z.number().nonnegative(),
  providerData: z.unknown().optional(),
})
export const runtimeModelRequestSchema = z.strictObject({
  system: z.string().max(4_000_000), systemContextOffset: z.number().int().nonnegative().optional(),
  messages: z.array(runtimeMessageSchema).max(20_000), model: providerSchema,
  toolNames: z.array(z.string().min(1).max(128)).max(4096).optional(),
  context: z.strictObject({ sessionId: idSchema, purpose: z.enum(['execution', 'context-inspection']).optional(),
    workspacePath: z.string().min(1).max(4_000).optional(), selectedToolNames: z.array(z.string().min(1).max(128)).max(4096).optional(),
    runId: idSchema.optional(), mode: runModeSchema.optional(), thinking: thinkingLevelSchema.optional(), source: runSourceSchema.optional(),
  }).optional(),
}).transform((value): ModelRequest => ({
  system: value.system, model: value.model, messages: value.messages,
  ...(value.systemContextOffset === undefined ? {} : { systemContextOffset: value.systemContextOffset }),
  ...(value.toolNames === undefined ? {} : { toolNames: value.toolNames }),
  ...(value.context === undefined ? {} : { context: { sessionId: value.context.sessionId,
    ...(value.context.workspacePath === undefined ? {} : { workspacePath: value.context.workspacePath }),
    ...(value.context.selectedToolNames === undefined ? {} : { selectedToolNames: value.context.selectedToolNames }),
    ...(value.context.purpose === undefined ? {} : { purpose: value.context.purpose }),
    ...(value.context.runId === undefined ? {} : { runId: value.context.runId }),
    ...(value.context.mode === undefined ? {} : { mode: value.context.mode }),
    ...(value.context.thinking === undefined ? {} : { thinking: value.context.thinking }),
    ...(value.context.source === undefined ? {} : { source: value.context.source }),
  } }),
}))
export const runtimeDriverToolSchema = z.strictObject({
  name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/), description: z.string().max(32_000),
  effect: z.enum(['read', 'write', 'process', 'network']), inputSchema: z.record(z.string(), z.unknown()),
  timeoutMs: z.number().int().positive().max(2_147_483_647),
  timeoutArgument: z.string().min(1).max(128).optional(),
})
export const runtimeToolResultSchema = z.object({
  text: z.string().max(16_000_000), isError: z.boolean().optional(), details: z.unknown().optional(),
  content: z.array(z.discriminatedUnion('type', [z.strictObject({ type: z.literal('text'), text: z.string() }),
    z.strictObject({ type: z.literal('image'), data: z.string(), mimeType: z.string() })])).max(4096).optional(),
  hostFailure: z.strictObject({ code: z.string().min(1).max(128), executionStarted: z.boolean() }).optional(),
  hostControl: z.strictObject({ stop: z.literal('goal_replaced'), previousGoalId: idSchema, goalId: idSchema }).optional(),
  execution: toolExecutionSchema.optional(), outcome: toolOutcomeSchema.optional(),
}).transform((value): ToolResult => ({
  text: value.text,
  ...(value.isError === undefined ? {} : { isError: value.isError }),
  ...(value.details === undefined ? {} : { details: value.details }),
  ...(value.content === undefined ? {} : { content: value.content }),
  ...(value.hostFailure === undefined ? {} : { hostFailure: value.hostFailure }),
  ...(value.hostControl === undefined ? {} : { hostControl: value.hostControl }),
  ...(value.execution === undefined ? {} : { execution: value.execution }),
  ...(value.outcome === undefined ? {} : { outcome: value.outcome }),
}))
export const runtimeDriverStartSchema = z.strictObject({
  invocationId: idSchema, session: sessionSchema, workspace: workspaceSchema, run: runSchema,
  request: runtimeModelRequestSchema, tools: z.array(runtimeDriverToolSchema).max(4096), apiKey: z.string().max(8192).nullable(),
  steering: z.boolean(),
  ownership: executionOwnershipSchema.optional(),
})
export const runtimeModelDiagnosticSchema = diagnosticEventSchema.pick({
  modelRequestId: true, attemptId: true, upstreamRequestIdSha256: true, httpStatus: true,
  transportKind: true, transportCode: true, stopReason: true, errorCode: true,
  failureKind: true, failurePhase: true, streamSubtype: true, streamEventCount: true,
  streamTextChars: true, streamThinkingChars: true, streamFirstEventMs: true, streamLastEventMs: true,
  streamErrorClass: true, durationMs: true,
}).extend({
  phase: z.enum(['started', 'response', 'transport_failure', 'settled', 'failed', 'cancelled']),
  purpose: z.enum(['model', 'compaction']), providerId: idSchema, modelSelectionId: idSchema,
  model: z.string().min(1).max(256), protocol: z.string().min(1).max(128),
})
export const runtimeDriverCallbackSchema = z.discriminatedUnion('method', [
  z.strictObject({ invocationId: idSchema, method: z.literal('modelDiagnostic'), event: runtimeModelDiagnosticSchema }),
  z.strictObject({ invocationId: idSchema, method: z.literal('resolveKey'), modelId: idSchema }),
  z.strictObject({ invocationId: idSchema, method: z.literal('readImage'), id: idSchema }),
  z.strictObject({ invocationId: idSchema, method: z.literal('readFile'), id: idSchema }),
  z.strictObject({ invocationId: idSchema, method: z.literal('emit'), type: z.string().min(1).max(160), data: z.unknown(), stepId: idSchema.optional() }),
  z.strictObject({ invocationId: idSchema, method: z.literal('commit'), role: runtimeMessageSchema.shape.role, content: runtimeMessageSchema.shape.content, messageId: idSchema.optional(), providerData: z.unknown().optional() }),
  z.strictObject({ invocationId: idSchema, method: z.literal('execute'), name: z.string().min(1).max(128), args: z.record(z.string(), z.unknown()), callId: idSchema }),
  z.strictObject({ invocationId: idSchema, method: z.literal('beforeRequest'), request: runtimeModelRequestSchema, stepId: idSchema }),
  z.strictObject({ invocationId: idSchema, method: z.literal('stepEnded'), stepId: idSchema }),
  z.strictObject({ invocationId: idSchema, method: z.literal('steering'), closeWhenEmpty: z.literal(true).optional() }),
  z.strictObject({ invocationId: idSchema, method: z.literal('closeSteering') }),
])
export type RuntimeDriverCallback = z.infer<typeof runtimeDriverCallbackSchema>
export type RuntimeDriverCallbackValue<Value = RuntimeDriverCallback> = Value extends RuntimeDriverCallback ? Omit<Value, 'invocationId'> : never
export const runtimeDriverStreamSchema = z.strictObject({ invocationId: idSchema, id: idSchema, text: z.string().max(16_000_000), thinking: z.string().max(16_000_000) })
export const runtimeDriverTerminalSchema = z.strictObject({ invocationId: idSchema, ok: z.boolean(), reasonCode: z.string().min(1).max(128).nullable() })
export const runtimeDriverCancelSchema = z.strictObject({ invocationId: idSchema, reasonCode: z.string().min(1).max(128) })
export const runtimeDriverSummarySchema = z.strictObject({ request: runtimeModelRequestSchema, apiKey: z.string().max(8192).nullable() })
export const runtimeDriverSummaryResultSchema = z.strictObject({ text: z.string().max(16_000_000), usage: usageSchema })
export const runtimeDriverStepResultSchema = z.union([z.strictObject({ stop: z.enum(['goal_complete', 'goal_replaced']) }), z.undefined()])
export const runtimeDriverEventResultSchema = sessionEventSchema
