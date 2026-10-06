import { z } from 'zod'

const directory = z.string().min(1).max(4_000)
export const storageRootsSchema = z.strictObject({
  dataRoot: directory,
  cacheRoot: directory,
  settingsRoot: directory,
  sessionsRoot: directory,
  skillsRoot: directory,
})
export const storageLocationSnapshotSchema = z.strictObject({
  pointerFile: directory,
  revision: z.string().min(1).max(128),
  active: storageRootsSchema,
  saved: storageRootsSchema,
  restartRequired: z.boolean(),
  receipts: z
    .array(z.strictObject({ operationId: z.string().min(1).max(160), fingerprint: z.string().max(128) }))
    .max(128),
  lastWrite: z.strictObject({ operationId: z.string().min(1).max(160), fingerprint: z.string().max(128) }).nullable(),
})
export const storageLocationApplySchema = z.strictObject({
  roots: storageRootsSchema,
  expectedRevision: z.string().min(1).max(128),
  operationId: z.string().min(1).max(160),
})
export type StorageRoots = z.output<typeof storageRootsSchema>
export type StorageLocationSnapshot = z.output<typeof storageLocationSnapshotSchema>
export type StorageLocationApply = z.output<typeof storageLocationApplySchema>

/** Explicit property/editor metadata shared by Host contracts and the schema renderer. */
export const storageLocationFormDescription = {
  id: 'system.storage.locations',
  version: 1,
  fields: {
    dataRoot: { labelKey: 'i18n:storage.dataRoot', component: 'TextField' },
    cacheRoot: { labelKey: 'i18n:storage.cacheRoot', component: 'TextField' },
    settingsRoot: { labelKey: 'i18n:storage.settingsRoot', component: 'TextField' },
    sessionsRoot: { labelKey: 'i18n:storage.sessionsRoot', component: 'TextField' },
    skillsRoot: { labelKey: 'i18n:storage.skillsRoot', component: 'TextField' },
  },
} as const
export const storageLocationDataSchema = {
  type: 'object',
  additionalProperties: false,
  required: Object.keys(storageLocationFormDescription.fields),
  properties: Object.fromEntries(
    Object.keys(storageLocationFormDescription.fields).map((name) => [
      name,
      { type: 'string', minLength: 1, maxLength: 4_000 },
    ]),
  ),
}
