import { z } from 'zod'
import { scheduleDefinitionSchema } from './commands/schedules'

const id = z.string().min(1).max(160)
/** Host-owned provenance, read from the immutable management receipt rather than model input. */
export const scheduleExecutionSchema = z.strictObject({
  occurrenceId: id,
  authorization: z.strictObject({
    actorId: id,
    idempotencyKey: z.string().min(1).max(200),
    commandId: z.enum(['schedule.create', 'schedule.update']),
  }),
  schedule: scheduleDefinitionSchema,
})
export type ScheduleExecution = z.output<typeof scheduleExecutionSchema>
