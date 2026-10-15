import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  runtimeDriverStartSchema,
  runtimeDriverCallbackSchema,
  runtimeDriverSummarySchema,
} from '@hbar/plugin-sdk/runtime-driver'
import { DRIVER_CALLBACK_TIMEOUT_CONTRACT, DRIVER_COMPACTION_RPC_TIMEOUT_MS } from './runtime-driver-timeouts'

/** Shared data contract; importing the fingerprint does not load the executable driver. */
export const DRIVER_RUNTIME_FINGERPRINT = createHash('sha256')
  .update(
    JSON.stringify([
      DRIVER_CALLBACK_TIMEOUT_CONTRACT,
      DRIVER_COMPACTION_RPC_TIMEOUT_MS,
      z.toJSONSchema(runtimeDriverStartSchema, { io: 'input' }),
      z.toJSONSchema(runtimeDriverCallbackSchema, { io: 'input' }),
      z.toJSONSchema(runtimeDriverSummarySchema, { io: 'input' }),
    ]),
  )
  .digest('hex')
