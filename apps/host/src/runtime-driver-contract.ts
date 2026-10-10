import { createHash } from 'node:crypto'
import { z } from 'zod'
import { runtimeDriverStartSchema, runtimeDriverCallbackSchema } from '@hbar/plugin-sdk/runtime-driver'

/** Shared data contract; importing the fingerprint does not load the executable driver. */
export const DRIVER_RUNTIME_FINGERPRINT = createHash('sha256').update(JSON.stringify([
  z.toJSONSchema(runtimeDriverStartSchema, { io: 'input' }),
  z.toJSONSchema(runtimeDriverCallbackSchema, { io: 'input' }),
])).digest('hex')
