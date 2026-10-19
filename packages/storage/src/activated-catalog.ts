import { createHash } from 'node:crypto'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'

const databaseIdSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const storageActivatedCatalogSchema = z
  .strictObject({
    revision: databaseIdSchema,
    sourceMode: z.literal('single-worker-single-path'),
    coverage: z.literal('complete-single-source'),
    databaseIds: z.tuple([databaseIdSchema]),
    databases: z
      .array(
        z.strictObject({
          databaseId: databaseIdSchema,
          owners: z.tuple([z.literal('schedule'), z.literal('search')]),
        }),
      )
      .length(1),
  })
  .refine((value) => value.databaseIds[0] === value.databases[0]?.databaseId, {
    message: 'Storage catalog coverage mismatch',
  })
export type StorageActivatedCatalog = z.infer<typeof storageActivatedCatalogSchema>

/** Exact same raw path material as the real Worker checkpoint identity. No canonicalization. */
export function storageSourceDatabaseId(path: string): string {
  if (!path) throw new HbarError('STORAGE_CATALOG_UNSUPPORTED', 'Catalog requires a persistent single source')
  return createHash('sha256').update(path).digest('hex')
}

/** Only the Storage owner calls this after its own actual Worker ready reply. No IO. */
export function buildActivatedStorageCatalog(input: {
  readonly sourceMode: string
  readonly path: string
  readonly preflight: boolean
  readonly readySchemaVersion: number
  readonly expectedSchemaVersion: number
}): StorageActivatedCatalog {
  if (
    input.sourceMode !== 'single-worker-single-path' ||
    input.preflight ||
    input.path === ':memory:' ||
    !Number.isSafeInteger(input.readySchemaVersion) ||
    input.readySchemaVersion !== input.expectedSchemaVersion
  )
    throw new HbarError('STORAGE_CATALOG_UNSUPPORTED', 'Activated source coverage is not confirmed')
  const databaseId = storageSourceDatabaseId(input.path)
  const material = {
    sourceMode: 'single-worker-single-path',
    coverage: 'complete-single-source',
    databaseIds: [databaseId],
    databases: [{ databaseId, owners: ['schedule', 'search'] }],
  }
  // Stable across clean process/owner restarts; changes when source coverage/protocol changes.
  const revision = createHash('sha256')
    .update(JSON.stringify({ version: 1, ...material }))
    .digest('hex')
  return storageActivatedCatalogSchema.parse({ revision, ...material })
}
