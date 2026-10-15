import { z } from 'zod'

export const BACKEND_WEB_ACCESS_SETTING = 'backend.webAccess'
export const BACKEND_WEB_PORT_SETTING = 'backend.webPort'
export const backendWebAccessSchema = z.enum(['local', 'lan'])
export const backendWebConfigurationSchema = z.strictObject({
  access: backendWebAccessSchema.default('local'),
  port: z.number().int().min(1).max(65535).default(4317),
})
export type BackendWebConfiguration = z.output<typeof backendWebConfigurationSchema>
