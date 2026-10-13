import { z } from 'zod'

export const deviceRoleSchema = z.enum(['operator', 'observer'])
export const deviceWorkspaceIdsSchema = z
  .array(z.string().min(1).max(160))
  .max(256)
  .refine((ids) => new Set(ids).size === ids.length, 'Workspace scopes must be unique')
  .nullable()
export const deviceAccessSchema = z.strictObject({
  role: deviceRoleSchema.default('operator'),
  workspaceIds: deviceWorkspaceIdsSchema.default(null),
})
export const deviceSchema = z.strictObject({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(160),
  createdAt: z.number().int().nonnegative(),
  lastSeenAt: z.number().int().nonnegative(),
  ...deviceAccessSchema.shape,
})
/** Older stored devices may omit access fields. Boundary parsing applies operator/unrestricted defaults. */
export type Device = z.input<typeof deviceSchema>
export type DeviceRole = z.infer<typeof deviceRoleSchema>
export type DeviceAccess = z.infer<typeof deviceAccessSchema>
export function deviceAccessOf(device: Device): DeviceAccess {
  return deviceAccessSchema.parse({ role: device.role, workspaceIds: device.workspaceIds })
}
