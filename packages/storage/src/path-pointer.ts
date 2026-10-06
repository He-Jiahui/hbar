import { z } from 'zod'
import { storageRootsSchema } from '@hbar/contracts/commands/storage-locations'
export const pathPointerSchema = z.union([
  z.object({ version: z.literal(1), dataRoot: z.string().min(1), cacheRoot: z.string().min(1) }),
  storageRootsSchema.extend({
    version: z.literal(2),
    identityRoot: z.string().min(1).max(4_000),
    receipts: z.array(z.object({ operationId: z.string().min(1).max(160), fingerprint: z.string().max(128) })).max(128),
    lastWrite: z.object({ operationId: z.string().max(160), fingerprint: z.string().max(128) }).nullable(),
    migration: z.object({ source: storageRootsSchema }).nullable(),
  }),
])
export type PathPointer = z.infer<typeof pathPointerSchema>
