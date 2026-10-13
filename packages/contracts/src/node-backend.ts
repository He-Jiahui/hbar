import { z } from 'zod'

export const nodeBackendSchema = z.enum([
  'none',
  'bwrap',
  'container',
  'seatbelt',
  'windows-restricted',
  'windows-elevated',
])
export type NodeBackend = z.infer<typeof nodeBackendSchema>
