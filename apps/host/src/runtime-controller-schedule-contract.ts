import { z } from 'zod'
import { scheduleIdleManifestSchema, scheduleTransferAckSchema } from './runtime-schedule-idle-contract'

export const controllerScheduleInitializeSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('normal') }),
  z.strictObject({ mode: z.literal('idle-wake'), ack: scheduleTransferAckSchema }),
])
export type ControllerScheduleInitialize = z.output<typeof controllerScheduleInitializeSchema>
export const controllerScheduleTransferSchema = z.strictObject({ ack: scheduleTransferAckSchema })
export const controllerScheduleWakeSchema = controllerScheduleTransferSchema
  .extend({ restoration: scheduleIdleManifestSchema.optional() })
  .superRefine(({ ack, restoration }, context) => {
    if (
      restoration &&
      (restoration.snapshot.coverage !== 'complete' ||
        restoration.snapshot.database.id !== ack.databaseId ||
        restoration.snapshot.database.sourceRevision !== ack.sourceRevision)
    )
      context.addIssue({
        code: 'custom',
        message: 'Absolute schedule restoration must match the original transfer source',
      })
  })
export const controllerScheduleStatusSchema = z.strictObject({
  phase: z.enum(['open', 'restored', 'quiescing', 'quiesced', 'committed', 'unknown']),
})
export const controllerScheduleControlMethods = [
  'controller.schedule.initialize',
  'controller.schedule.preview',
  'controller.schedule.quiesce',
  'controller.schedule.commit',
  'controller.schedule.abort',
  'controller.schedule.wake',
] as const
