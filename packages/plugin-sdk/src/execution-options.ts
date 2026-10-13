import { z } from 'zod'

/** Host-owned confinement request. Every execution adapter must enforce it or refuse to start. */
export const osConfinementOptionsSchema = z
  .strictObject({
    level: z.enum(['unelevated', 'elevated']),
    writableRoots: z.array(z.string().min(1).max(4_000)).max(256).readonly(),
    readableRoots: z.array(z.string().min(1).max(4_000)).max(256).readonly(),
    networkEnabled: z.boolean(),
    envOverrides: z.record(z.string().min(1).max(256), z.string().max(16_000)).readonly(),
  })
  .readonly()

export type OsConfinementOptions = z.infer<typeof osConfinementOptionsSchema>
