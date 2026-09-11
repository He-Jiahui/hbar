import { z } from 'zod'

/** Settings can be written at these progressively narrower scopes. */
export const settingScopeSchema = z.enum(['global', 'project', 'session'])
export type SettingScope = z.infer<typeof settingScopeSchema>

export const settingRestartPolicySchema = z.enum(['live', 'idle', 'restart'])
export type SettingRestartPolicy = z.infer<typeof settingRestartPolicySchema>

const settingIdSchema = z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/)

/**
 * Safe, serializable JSON-Schema subset used by the settings renderer.
 *
 * This intentionally excludes executable values, component references and
 * arbitrary JSON Schema extensions. Runtime validation of the actual setting
 * value remains the Host's responsibility.
 */
export interface JsonSchemaDescriptor {
  type?: ('string' | 'number' | 'integer' | 'boolean' | 'array' | 'object') | undefined
  title?: string | undefined
  description?: string | undefined
  format?: ('text' | 'textarea' | 'url' | 'path' | 'password') | undefined
  minimum?: number | undefined
  maximum?: number | undefined
  minLength?: number | undefined
  maxLength?: number | undefined
  minItems?: number | undefined
  maxItems?: number | undefined
  pattern?: string | undefined
  enum?: unknown[] | undefined
  default?: unknown | undefined
  properties?: Record<string, JsonSchemaDescriptor> | undefined
  required?: string[] | undefined
  items?: JsonSchemaDescriptor | undefined
  oneOf?: JsonSchemaDescriptor[] | undefined
}

export const jsonSchemaDescriptorSchema: z.ZodType<JsonSchemaDescriptor> = z.lazy(() =>
  z
    .object({
      type: z.enum(['string', 'number', 'integer', 'boolean', 'array', 'object']).optional(),
      title: z.string().max(200).optional(),
      description: z.string().max(2_000).optional(),
      format: z.enum(['text', 'textarea', 'url', 'path', 'password']).optional(),
      minimum: z.number().finite().optional(),
      maximum: z.number().finite().optional(),
      minLength: z.number().int().nonnegative().optional(),
      maxLength: z.number().int().nonnegative().optional(),
      minItems: z.number().int().nonnegative().optional(),
      maxItems: z.number().int().nonnegative().optional(),
      pattern: z.string().max(500).optional(),
      enum: z.array(z.unknown()).max(100).optional(),
      default: z.unknown().optional(),
      properties: z.record(z.string().regex(/^[a-z][a-zA-Z0-9_.-]{0,127}$/), jsonSchemaDescriptorSchema).optional(),
      required: z.array(z.string().regex(/^[a-z][a-zA-Z0-9_.-]{0,127}$/)).max(128).optional(),
      items: jsonSchemaDescriptorSchema.optional(),
      oneOf: z.array(jsonSchemaDescriptorSchema).max(16).optional(),
    })
    .strict(),
)

export const settingVisibilitySchema = z
  .object({
    fact: z.enum(['hasWorkspace', 'hasSession', 'pluginEnabled']),
    equals: z.union([z.string().max(160), z.boolean()]).optional(),
  })
  .strict()
export type SettingVisibility = z.infer<typeof settingVisibilitySchema>

export const settingDescriptorSchema = z
  .object({
    id: settingIdSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(2_000).optional(),
    keywords: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
    root: settingIdSchema,
    group: settingIdSchema.optional(),
    section: settingIdSchema.optional(),
    order: z.number().int().min(-1_000_000).max(1_000_000).default(0),
    icon: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/).optional(),
    scopes: z.array(settingScopeSchema).min(1).max(3),
    schema: jsonSchemaDescriptorSchema,
    default: z.unknown().optional(),
    restartPolicy: settingRestartPolicySchema.default('live'),
    secret: z.boolean().default(false),
    visibility: settingVisibilitySchema.optional(),
    owner: z.string().max(160).optional(),
  })
  .strict()
export type SettingDescriptor = z.infer<typeof settingDescriptorSchema>

export const settingsSectionSchema = z
  .object({
    id: settingIdSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(2_000).optional(),
    order: z.number().int().min(-1_000_000).max(1_000_000).default(0),
    settings: z.array(settingDescriptorSchema).max(500),
  })
  .strict()
export type SettingsSection = z.infer<typeof settingsSectionSchema>

export const settingsContributionSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().trim().min(1).max(200).optional(),
    icon: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/).optional(),
    sections: z.array(settingsSectionSchema).max(100),
  })
  .strict()
export type SettingsContribution = z.infer<typeof settingsContributionSchema>

export const settingsNavigationGroupSchema = z
  .object({
    id: settingIdSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(2_000).optional(),
    order: z.number().int().min(-1_000_000).max(1_000_000).default(0),
    settingIds: z.array(settingIdSchema).max(500),
  })
  .strict()
export type SettingsNavigationGroup = z.infer<typeof settingsNavigationGroupSchema>

export const settingsNavigationRootSchema = z
  .object({
    id: settingIdSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(2_000).optional(),
    icon: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    order: z.number().int().min(-1_000_000).max(1_000_000).default(0),
    groups: z.array(settingsNavigationGroupSchema).max(100),
  })
  .strict()
export type SettingsNavigationRoot = z.infer<typeof settingsNavigationRootSchema>

export const settingsNavigationSchema = z
  .object({ schemaVersion: z.literal(1), roots: z.array(settingsNavigationRootSchema).max(100) })
  .strict()
export type SettingsNavigation = z.infer<typeof settingsNavigationSchema>

export const resolvedSettingSchema = z
  .object({
    id: settingIdSchema,
    effectiveValue: z.unknown(),
    defaultValue: z.unknown().optional(),
    localValue: z.unknown().optional(),
    source: z.union([z.literal('default'), settingScopeSchema]),
    overridden: z.boolean(),
    editable: z.boolean(),
    restartPolicy: settingRestartPolicySchema,
  })
  .strict()
export type ResolvedSetting = z.infer<typeof resolvedSettingSchema>

export const settingsSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.string().regex(/^[a-f0-9]{64}$/i),
    scope: settingScopeSchema,
    targetId: z.string().max(160).optional(),
    values: z.record(settingIdSchema, resolvedSettingSchema),
  })
  .strict()
export type SettingsSnapshot = z.infer<typeof settingsSnapshotSchema>

export const settingsCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    navigation: settingsNavigationSchema,
    settings: z.array(settingDescriptorSchema).max(5_000),
  })
  .strict()
export type SettingsCatalog = z.infer<typeof settingsCatalogSchema>

export function settingKey(owner: string | undefined, id: string): string {
  const parsedId = settingIdSchema.parse(id)
  if (!owner) return parsedId
  const parsedOwner = z.string().regex(/^[a-z][a-z0-9.-]{0,95}$/).parse(owner)
  return `plugin.${parsedOwner}.${parsedId}`
}
