import { z } from 'zod'
import { hostInfoSchema } from '@hbar/contracts/commands/system'
import { liveStreamSchema } from '@hbar/contracts/runtime-notifications'
import { runtimeKernelStateSchema } from '@hbar/kernel/runtime-port'

/** Request scope data shared by adapters without importing their executable composition. */
export const runtimeControllerScopeSchema = z.strictObject({
  invocationId: z.string().min(1).max(160),
  actorId: z.string().min(1).max(160),
  host: hostInfoSchema,
  kernel: runtimeKernelStateSchema,
  streams: z.array(liveStreamSchema).max(4_096),
})

export type RuntimeControllerScope = z.output<typeof runtimeControllerScopeSchema>
