import { z } from 'zod'

export const hostSupervisorMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('host.ready'), port: z.number().int().min(1).max(65_535) }),
  z.strictObject({ type: z.literal('host.heartbeat') }),
  z.strictObject({ type: z.literal('host.shutdown') }),
])
export type HostSupervisorMessage = z.infer<typeof hostSupervisorMessageSchema>

export function sendHostSupervisorMessage(message: HostSupervisorMessage): void {
  if (!process.send) return
  try {
    process.send(hostSupervisorMessageSchema.parse(message))
  } catch {
    console.error('[hbar] supervisor channel unavailable')
  }
}
