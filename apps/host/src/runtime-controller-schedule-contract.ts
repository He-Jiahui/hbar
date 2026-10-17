import { z } from 'zod'
import { scheduleTransferAckSchema } from './runtime-schedule-idle-contract'

export const controllerScheduleInitializeSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('normal') }),
  z.strictObject({ mode: z.literal('idle-wake'), ack: scheduleTransferAckSchema }),
])
export type ControllerScheduleInitialize = z.output<typeof controllerScheduleInitializeSchema>
export const controllerScheduleTransferSchema = z.strictObject({ ack: scheduleTransferAckSchema })
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
