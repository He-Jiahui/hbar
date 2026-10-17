import { z } from 'zod'
import { idSchema } from './index'

export const EXECUTION_SLOT_LIMITS = Object.freeze({
  capacity: 4,
  executions: 4096,
  activities: 8192,
  perExecution: 64,
})
export const executionActivityIdentitySchema = z.strictObject({ executionId: idSchema, activityId: idSchema })
export const executionActivityLeaseSchema = executionActivityIdentitySchema.extend({
  id: idSchema,
  state: z.enum(['active', 'queued', 'suspended']),
})
export const executionSlotsSnapshotSchema = z.strictObject({
  revision: z.number().int().nonnegative().safe(),
  capacity: z.number().int().min(1).max(EXECUTION_SLOT_LIMITS.executions),
  activeExecutions: z.number().int().nonnegative().max(EXECUTION_SLOT_LIMITS.executions),
  queuedExecutions: z.number().int().nonnegative().max(EXECUTION_SLOT_LIMITS.executions),
  suspendedExecutions: z.number().int().nonnegative().max(EXECUTION_SLOT_LIMITS.executions),
  activeActivities: z.number().int().nonnegative().max(EXECUTION_SLOT_LIMITS.activities),
  queuedActivities: z.number().int().nonnegative().max(EXECUTION_SLOT_LIMITS.activities),
  suspendedActivities: z.number().int().nonnegative().max(EXECUTION_SLOT_LIMITS.activities),
})
export type ExecutionActivityIdentity = z.output<typeof executionActivityIdentitySchema>
export type ExecutionActivityLease = z.output<typeof executionActivityLeaseSchema>
export type ExecutionSlotsSnapshot = z.output<typeof executionSlotsSnapshotSchema>
