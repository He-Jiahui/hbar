import { z } from 'zod'

export const MAX_RUN_CHANGED_FILES = 256
export const RUN_CHANGE_PREVIEW_FILES = 3
export const RUN_CHANGE_PAGE_SIZE = 50
export const MAX_FILE_CHANGE_TEXT = 2 * 1024 * 1024
export const MAX_RUN_CHANGE_BYTES = 32 * 1024 * 1024
const count = z.number().int().nonnegative().safe()
const identity = z.string().min(1).max(160)
export const runChangePathSchema = z
  .string()
  .min(1)
  .max(4000)
  .refine(
    (path) =>
      !path.includes('\0') &&
      !path.includes('\\') &&
      !path.startsWith('/') &&
      !/^[a-z]:/i.test(path) &&
      path.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
    'Expected a canonical workspace-relative file path',
  )
/** Actual text versions supplied by an execution provider; null means the file did not exist. */
export const toolFileChangeSchema = z.strictObject({
  path: runChangePathSchema,
  before: z.string().max(MAX_FILE_CHANGE_TEXT).nullable(),
  after: z.string().max(MAX_FILE_CHANGE_TEXT).nullable(),
})
export type ToolFileChange = z.infer<typeof toolFileChangeSchema>
/** The execution gateway supplies the root, never the tool arguments or model. */
export const toolFileChangesSchema = z.strictObject({
  root: z.string().min(1).max(4000),
  files: z.array(toolFileChangeSchema).max(16),
})
export const runChangedFileSchema = z.strictObject({
  path: runChangePathSchema,
  kind: z.enum(['created', 'modified', 'deleted']),
  addedLines: count.nullable(),
  removedLines: count.nullable(),
})
export type RunChangedFile = z.infer<typeof runChangedFileSchema>
export const runFileChangesSummarySchema = z.strictObject({
  seq: count.positive(),
  totalFiles: count.max(MAX_RUN_CHANGED_FILES),
  addedLines: count.nullable(),
  removedLines: count.nullable(),
  preview: z.array(runChangedFileSchema).max(RUN_CHANGE_PREVIEW_FILES),
  canUndo: z.boolean(),
  incomplete: z.boolean(),
  undoneAt: count.nullable(),
})
export type RunFileChangesSummary = z.infer<typeof runFileChangesSummarySchema>
export const runFileChangesTargetSchema = z.strictObject({ sessionId: identity, runId: identity })
export const runFileChangesPageSchema = z.strictObject({
  ...runFileChangesTargetSchema.shape,
  summary: runFileChangesSummarySchema.nullable(),
  items: z.array(runChangedFileSchema).max(RUN_CHANGE_PAGE_SIZE),
  nextCursor: runChangePathSchema.nullable(),
})
export type RunFileChangesPage = z.infer<typeof runFileChangesPageSchema>
export const runFileChangeDiffSchema = z.strictObject({
  ...runFileChangesTargetSchema.shape,
  path: runChangePathSchema,
  items: z
    .array(
      z.strictObject({
        kind: z.enum(['context', 'added', 'removed']),
        text: z.string().max(MAX_FILE_CHANGE_TEXT),
        beforeLine: count.nullable(),
        afterLine: count.nullable(),
      }),
    )
    .max(200),
  offset: count,
  totalLines: count,
  hasMore: z.boolean(),
})
export type RunFileChangeDiff = z.infer<typeof runFileChangeDiffSchema>
