import { z } from 'zod'
import { automationStateSchema, idSchema, planStateSchema, runModeSchema, sessionBudgetSchema,
  sessionEventSchema, sessionSummarySchema, settingScopeSchema, taskNotificationSchema, threadGoalSchema,
  userInputRequestSchema, userInputResponseSchema, type WireNotification } from './index'
import { chatDatabaseDeletedEventSchema } from './commands/chat-database-maintenance'
import { notificationFreshEventSchema } from './commands/notifications'
import { performanceSampleSchema } from './metrics'
import { workflowSnapshotSchema } from './workflow'
import { toolOutputNotificationSchema } from './tool-execution'

export const liveStreamSchema = z.strictObject({ id: idSchema, sessionId: idSchema, runId: idSchema,
  text: z.string().max(16 * 1024 * 1024), thinking: z.string().max(16 * 1024 * 1024),
  offset: z.number().int().nonnegative(), version: z.number().int().nonnegative() })
export const streamDeltaSchema = liveStreamSchema.omit({ offset: true }).extend({
  operation: z.enum(['append', 'reset']), textOffset: z.number().int().nonnegative(), thinkingOffset: z.number().int().nonnegative(),
})
const sequence = z.number().int().nonnegative().optional()
const event = <Method extends WireNotification['method'], Params>(method: Method, params: z.ZodType<Params>) =>
  z.strictObject({ method: z.literal(method), params })
/** Every business event crosses the same validated public wire boundary as an RPC result. */
export const runtimeWireNotificationSchema: z.ZodType<WireNotification> = z.discriminatedUnion('method', [
  event('chatDatabase.deleted', chatDatabaseDeletedEventSchema), event('notifications.created', notificationFreshEventSchema),
  event('session.event', sessionEventSchema), event('session.summary', sessionSummarySchema), event('stream.update', streamDeltaSchema),
  event('tool.output', toolOutputNotificationSchema),
  event('metrics.sample', performanceSampleSchema), event('host.changed', z.strictObject({ kind: z.string().min(1).max(160) })),
  event('goal.updated', z.strictObject({ sessionId: idSchema, runId: idSchema.nullable(), goal: threadGoalSchema, seq: sequence })),
  event('goal.cleared', z.strictObject({ sessionId: idSchema, seq: sequence })),
  event('plan.updated', planStateSchema.extend({ seq: sequence })), event('plan.cleared', z.strictObject({ sessionId: idSchema, seq: sequence })),
  event('workflow.updated', z.strictObject({ sessionId: idSchema, snapshot: workflowSnapshotSchema })),
  event('mode.changed', z.strictObject({ sessionId: idSchema, mode: runModeSchema })),
  event('budget.updated', z.strictObject({ sessionId: idSchema, runId: idSchema.nullable(), budget: sessionBudgetSchema })),
  event('budget.cleared', z.strictObject({ sessionId: idSchema })), event('automation.changed', automationStateSchema),
  event('task.notification', taskNotificationSchema),
  event('settings.changed', z.strictObject({ scope: settingScopeSchema, targetId: idSchema.optional(), revision: z.string().min(1).max(160), ids: z.array(idSchema).max(4_096) })),
  event('git.changed', z.strictObject({ cwd: z.string().min(1).max(4_000) })),
  event('browser.changed', z.strictObject({ sessionId: idSchema, contextId: idSchema })),
  event('computer.changed', z.strictObject({ sessionId: idSchema })),
  event('user_input.requested', userInputRequestSchema),
  event('user_input.resolved', z.strictObject({ requestId: idSchema, sessionId: idSchema, cancelled: z.boolean(), response: userInputResponseSchema.optional() })),
  event('auth.revoked', z.strictObject({ reason: z.string().max(1_600) })),
  event('terminal.output', z.strictObject({ terminalId: idSchema, data: z.string().max(64_000) })),
  event('terminal.exit', z.strictObject({ terminalId: idSchema, code: z.number().int().nullable(), signal: z.string().max(160).nullable() })),
  event('surface.invoke', z.strictObject({ relayId: idSchema, invocationId: idSchema, commandId: idSchema, input: z.unknown(), generation: z.number().int().positive() })),
])
/** Internal IPC envelope for ordered notification delivery. Limits are part of the Kernel/Host contract. */
export const RUNTIME_NOTIFICATION_BATCH_MAX_EVENTS = 32
export const RUNTIME_NOTIFICATION_BATCH_MAX_BYTES = 256 * 1024
export const runtimeWireNotificationBatchSchema = z.array(runtimeWireNotificationSchema).min(1).max(RUNTIME_NOTIFICATION_BATCH_MAX_EVENTS)
  .superRefine((events, context) => {
    if (new TextEncoder().encode(JSON.stringify(events)).byteLength > RUNTIME_NOTIFICATION_BATCH_MAX_BYTES)
      context.addIssue({ code: 'custom', message: 'Notification batch exceeds its byte bound' })
  })
