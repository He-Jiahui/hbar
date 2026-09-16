import { z } from 'zod'
import description from './shell-layout.json'

const shellLayoutSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.literal('app'),
  type: z.literal('app-shell'),
  sidebar: z.object({
    id: z.literal('projects'),
    region: z.literal('left'),
    visible: z.boolean(),
    widthRem: z.number().min(12).max(24),
  }),
})

export const shellLayout = shellLayoutSchema.parse(description)
