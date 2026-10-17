import { z } from 'zod'
import { sessionSchema } from './state/directory'

const identity = z.string().min(1).max(160)
/** A finite identity range for restoration; newly accepted work has its own wakeup. */
export const sessionScanInputSchema = z.strictObject({
  after: identity.optional(),
  through: identity.optional(),
  limit: z.number().int().min(1).max(128).default(64),
})
export const sessionScanPageSchema = z.strictObject({
  items: z.array(sessionSchema).max(128),
  through: identity.nullable(),
  nextCursor: identity.nullable(),
})
export type SessionScanInput = z.input<typeof sessionScanInputSchema>
export type SessionScanPage = z.output<typeof sessionScanPageSchema>
