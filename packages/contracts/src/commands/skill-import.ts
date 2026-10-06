import { z } from 'zod'
export const skillImportRequestSchema = z.strictObject({
  source: z.enum(['claude', 'codex']),
  sourceRoot: z.string().min(1).max(4_000).optional(),
})
export const skillImportWarningSchema = z.enum([
  'platform_metadata',
  'platform_references',
  'duplicate_source',
  'document_collision',
  'invalid_entry',
  'file_limit',
  'unsafe_file',
])
export const skillImportCandidateSchema = z.strictObject({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(256),
  sourcePath: z.string().min(1).max(4_000),
  status: z.enum(['ready', 'existing', 'invalid']),
  warnings: z.array(skillImportWarningSchema).max(16),
  files: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
})
export const skillImportPreviewSchema = z.strictObject({
  request: skillImportRequestSchema,
  sourceRoots: z.array(z.string().max(4_000)).max(4),
  destination: z.string().max(4_000),
  revision: z.string().min(1).max(128),
  candidates: z.array(skillImportCandidateSchema).max(128),
  truncated: z.boolean(),
})
export const skillImportStartSchema = z.strictObject({
  request: skillImportRequestSchema,
  expectedRevision: z.string().min(1).max(128),
  operationId: z.string().min(1).max(160),
})
export const skillImportJobSchema = z.strictObject({
  operationId: z.string().min(1).max(160),
  request: skillImportRequestSchema,
  destination: z.string().max(4_000),
  status: z.enum(['running', 'succeeded', 'failed', 'cancelled']),
  items: z
    .array(
      z.strictObject({
        id: z.string().max(160),
        status: z.enum(['imported', 'skipped', 'invalid']),
        warnings: z.array(skillImportWarningSchema).max(16),
      }),
    )
    .max(128),
  error: z.string().max(128).nullable(),
})
export const skillImportOperationSchema = z.strictObject({ operationId: z.string().min(1).max(160) })
export type SkillImportRequest = z.output<typeof skillImportRequestSchema>
export type SkillImportPreview = z.output<typeof skillImportPreviewSchema>
export type SkillImportStart = z.output<typeof skillImportStartSchema>
export type SkillImportJob = z.output<typeof skillImportJobSchema>
export type SkillImportWarning = z.output<typeof skillImportWarningSchema>
