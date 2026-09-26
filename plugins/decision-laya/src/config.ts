import { z } from 'zod'
import { decisionCheckpointSchema } from '@hbar/contracts/decision'

export const LAYA_RUNTIME_VERSION = '0.3.20'
export const LAYA_MODEL_REPO = 'convaiinnovations/laya'
export const LAYA_MODEL_REVISION = '55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851'

export const layaConfigSchema = z.strictObject({
  runtimeDirectory: z.string().max(4_000).default(''),
  device: z.enum(['auto', 'cpu', 'cuda']).default('auto'),
  checkpoints: z
    .array(decisionCheckpointSchema)
    .min(1)
    .max(3)
    .refine((items) => new Set(items).size === items.length)
    .default(['multilingual']),
  maxQueue: z.number().int().min(1).max(64).default(16),
  queueTimeoutMs: z.number().int().min(10).max(600_000).default(120_000),
  recordTimeoutMs: z.number().int().min(10).max(30_000).default(2_000),
  startupTimeoutMs: z.number().int().min(100).max(600_000).default(120_000),
  requestTimeoutMs: z.number().int().min(10).max(120_000).default(10_000),
  shutdownTimeoutMs: z.number().int().min(10).max(30_000).default(3_000),
})
export type LayaConfig = z.infer<typeof layaConfigSchema>

export const layaInstallationSchema = z.strictObject({
  version: z.literal(1),
  runtimeVersion: z.literal(LAYA_RUNTIME_VERSION),
  python: z.string().min(1).max(4_000),
  models: z.partialRecord(
    decisionCheckpointSchema,
    z.strictObject({
      directory: z.string().min(1).max(4_000),
      repo: z.literal(LAYA_MODEL_REPO),
      revision: z.string().regex(/^[a-f0-9]{40}$/),
    }),
  ),
})
export type LayaInstallation = z.infer<typeof layaInstallationSchema>
