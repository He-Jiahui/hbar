import { z } from 'zod'

export const startupSettingsLayerSchema = z.strictObject({
  id: z.literal('settings:global'),
  kind: z.literal('global'),
  targetId: z.null(),
  schemaVersion: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
  values: z.record(z.string(), z.unknown()),
})
export const startupSettingsReplySchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), layer: startupSettingsLayerSchema.nullable() }),
  z.strictObject({ ok: z.literal(false), code: z.string().min(1).max(128) }),
])
