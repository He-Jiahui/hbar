import { z } from 'zod'
import { WORKSPACE_FOLDER_LIMIT } from './commands/workspace-folders'

export const workspaceQueryPathSchema = z.string().min(1).max(4_000).default('.')
export const workspaceQueryGlobSchema = z.string().min(1).max(1_000)
export const workspaceQueryCommonSchema = z.strictObject({
  path: workspaceQueryPathSchema,
  include: z.array(workspaceQueryGlobSchema).max(100).default([]),
  exclude: z.array(workspaceQueryGlobSchema).max(100).default([]),
  includeHidden: z.boolean().default(false),
  limit: z.number().int().min(1).max(1_000).default(200),
})
export const workspaceQueryToolCommonSchema = z.strictObject({
  path: z.string().min(1).max(4_000).optional(),
  include: z.array(workspaceQueryGlobSchema).max(100).optional(),
  exclude: z.array(workspaceQueryGlobSchema).max(100).optional(),
  includeHidden: z.boolean().optional(),
  limit: z.number().int().min(1).max(1_000).optional(),
})
export const workspaceSearchInputSchema = workspaceQueryCommonSchema.extend({
  /** Zero-based matching-line index; keep the same query/scope when continuing. */
  from_index: z.number().int().min(0).max(10_000_000).default(0),
  fully_scan: z.boolean().default(false),
  pattern: z.string().min(1).max(4_096),
  literal: z.boolean().default(false),
  caseMode: z.enum(['sensitive', 'insensitive', 'smart']).default('smart'),
  beforeContext: z.number().int().min(0).max(20).default(0),
  afterContext: z.number().int().min(0).max(20).default(0),
})
export const workspaceFindInputSchema = workspaceQueryCommonSchema.extend({
  /** Case-insensitive literal substring of a workspace-relative file path. */
  nameQuery: z.string().trim().min(1).max(160).optional(),
})
export const workspaceSearchToolInputSchema = workspaceQueryToolCommonSchema.extend({
  from_index: z
    .number()
    .int()
    .min(0)
    .max(10_000_000)
    .optional()
    .describe(
      'Zero-based matching-line index (default 0). Use the returned nextIndex with the same pattern and scope.',
    ),
  fully_scan: z
    .boolean()
    .optional()
    .describe(
      'Default false: stop content matching at limit, remaining count unknown. True: scan all eligible files, cache complete indexes and report exact remaining counts.',
    ),
  pattern: z.string().min(1).max(4_096),
  literal: z.boolean().optional(),
  caseMode: z.enum(['sensitive', 'insensitive', 'smart']).optional(),
  beforeContext: z.number().int().min(0).max(20).optional(),
  afterContext: z.number().int().min(0).max(20).optional(),
})
export const workspaceFindToolInputSchema = workspaceQueryToolCommonSchema.extend({
  nameQuery: z.string().trim().min(1).max(160).optional(),
})
export const workspaceListInputSchema = z.strictObject({
  path: workspaceQueryPathSchema,
  after: z.string().min(1).max(4_000).optional(),
  limit: z.number().int().min(1).max(500).default(200),
})
export const workspaceListToolInputSchema = z.strictObject({
  path: z.string().min(1).max(4_000).optional(),
  after: z.string().min(1).max(4_000).optional(),
  limit: z.number().int().min(1).max(500).optional(),
})
export const workspaceReadInputSchema = z
  .strictObject({
    path: z.string().min(1).max(4_000),
    startLine: z.number().int().positive().optional(),
    lineCount: z.number().int().min(1).max(2_000).optional(),
  })
  .refine((value) => (value.startLine === undefined) === (value.lineCount === undefined), {
    message: 'startLine and lineCount must be supplied together',
  })

export const workspaceSearchMatchSchema = z.strictObject({
  path: z.string().min(1).max(4_000),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  text: z.string().max(2 * 1024 * 1024),
  before: z.array(z.string().max(2 * 1024 * 1024)).max(20),
  after: z.array(z.string().max(2 * 1024 * 1024)).max(20),
  textTruncated: z.boolean().optional(),
})
export const workspaceSearchPaginationSchema = z.strictObject({
  fromIndex: z.number().int().nonnegative(),
  nextIndex: z.number().int().nonnegative().optional(),
  scanComplete: z.boolean(),
  totalMatches: z.number().int().nonnegative().optional(),
  remainingMatches: z.number().int().nonnegative().optional(),
  cacheHit: z.boolean(),
  cacheStored: z.boolean(),
  cacheLimited: z.boolean(),
  folders: z
    .array(z.strictObject({ path: z.string().min(1).max(4_000), matches: z.number().int().nonnegative() }))
    .max(6),
  otherMatches: z.number().int().nonnegative(),
  foldersCompressed: z.boolean(),
})
export const workspaceOperationCacheStatsSchema = z.strictObject({
  contentHits: z.number().int().nonnegative(),
  contentMisses: z.number().int().nonnegative(),
  matchHits: z.number().int().nonnegative(),
  matchMisses: z.number().int().nonnegative(),
  bytesRead: z.number().int().nonnegative(),
})
export const workspaceSearchResultSchema = z.strictObject({
  matches: z.array(workspaceSearchMatchSchema).max(1_000),
  truncated: z.boolean(),
  filesChecked: z
    .number()
    .int()
    .nonnegative()
    .max(100_000 * WORKSPACE_FOLDER_LIMIT),
  cache: workspaceOperationCacheStatsSchema,
  /** Optional for older query adapters; current native searches always supply it. */
  pagination: workspaceSearchPaginationSchema.optional(),
})
export const workspaceFindResultSchema = z.strictObject({
  paths: z.array(z.string().min(1).max(4_000)).max(1_000),
  truncated: z.boolean(),
  filesChecked: z
    .number()
    .int()
    .nonnegative()
    .max(100_000 * WORKSPACE_FOLDER_LIMIT),
})
export const workspaceReadResultSchema = z.strictObject({
  text: z.string().max(2 * 1024 * 1024),
  startLine: z.number().int().positive(),
  endLine: z.number().int().nonnegative(),
  totalLines: z.number().int().nonnegative(),
  nextLine: z.number().int().positive().optional(),
  cacheHit: z.boolean(),
})
export const workspaceFileEntrySchema = z.strictObject({
  name: z.string().min(1).max(1_024),
  path: z.string().min(1).max(4_000),
  directory: z.boolean(),
})
export const workspaceListResultSchema = z.strictObject({
  entries: z.array(workspaceFileEntrySchema).max(500),
  nextCursor: z.string().min(1).max(4_000).optional(),
})

export type WorkspaceSearchInput = z.input<typeof workspaceSearchInputSchema>
export type ParsedWorkspaceSearchInput = z.output<typeof workspaceSearchInputSchema>
export type WorkspaceFindInput = z.input<typeof workspaceFindInputSchema>
export type ParsedWorkspaceFindInput = z.output<typeof workspaceFindInputSchema>
export type WorkspaceListInput = z.input<typeof workspaceListInputSchema>
export type ParsedWorkspaceListInput = z.output<typeof workspaceListInputSchema>
export type WorkspaceReadInput = z.input<typeof workspaceReadInputSchema>
export type ParsedWorkspaceReadInput = z.output<typeof workspaceReadInputSchema>
export type WorkspaceSearchResult = z.infer<typeof workspaceSearchResultSchema>
export type WorkspaceFindResult = z.infer<typeof workspaceFindResultSchema>
export type WorkspaceReadResult = z.infer<typeof workspaceReadResultSchema>
export type WorkspaceListResult = z.infer<typeof workspaceListResultSchema>
