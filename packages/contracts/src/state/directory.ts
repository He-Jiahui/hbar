import { z } from 'zod'

const entityId = z.string().min(1).max(160)
export const workspaceSchema = z.strictObject({
  id: entityId,
  path: z.string().min(1).max(4000),
  name: z.string().max(4000),
  createdAt: z.number().int().nonnegative(),
})
export const sessionSchema = z.strictObject({
  id: entityId,
  workspaceId: entityId,
  title: z.string().max(160),
  archived: z.boolean(),
  parentId: entityId.nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  seq: z.number().int().nonnegative(),
})
export type Workspace = z.infer<typeof workspaceSchema>
export type Session = z.infer<typeof sessionSchema>
export const workspaceActivitySortSchema = z.enum(['createdAt', 'updatedAt'])
const workspaceActivityTimestampSchema = z.number().int().nonnegative().safe()
const workspaceActivityRevisionSchema = z.number().int().nonnegative().safe()
export const workspaceActivityCursorSchema = z.strictObject({
  sortBy: workspaceActivitySortSchema,
  revision: workspaceActivityRevisionSchema,
  timestamp: workspaceActivityTimestampSchema.nullable(),
  workspaceId: entityId,
})
export const workspaceActivityListInputSchema = z
  .strictObject({
    sortBy: workspaceActivitySortSchema.default('updatedAt'),
    cursor: workspaceActivityCursorSchema.optional(),
    limit: z.number().int().min(1).max(200).default(60),
    /** Bounded summaries let a sidebar order pinned rows outside the visible page. */
    includeWorkspaceIds: z.array(entityId).max(20).optional(),
  })
  .superRefine((value, context) => {
    if (value.cursor && value.cursor.sortBy !== value.sortBy)
      context.addIssue({ code: 'custom', message: 'Workspace activity cursor sort does not match the request' })
    if (value.includeWorkspaceIds && new Set(value.includeWorkspaceIds).size !== value.includeWorkspaceIds.length)
      context.addIssue({ code: 'custom', message: 'Workspace activity IDs must be unique' })
  })
export const workspaceActivityItemSchema = z.strictObject({
  workspace: workspaceSchema,
  latestSessionCreatedAt: workspaceActivityTimestampSchema.nullable(),
  latestSessionUpdatedAt: workspaceActivityTimestampSchema.nullable(),
})
export const workspaceActivityPageSchema = z
  .strictObject({
    revision: workspaceActivityRevisionSchema,
    items: z.array(workspaceActivityItemSchema).max(200),
    /** Requested workspace summaries outside `items`; they do not affect page order or cursor. */
    includedItems: z.array(workspaceActivityItemSchema).max(20),
    nextCursor: workspaceActivityCursorSchema.nullable(),
  })
  .superRefine((value, context) => {
    const ids = [...value.items, ...value.includedItems].map((item) => item.workspace.id)
    if (new Set(ids).size !== ids.length)
      context.addIssue({ code: 'custom', message: 'Workspace activity page contains duplicate workspaces' })
    if (
      value.nextCursor &&
      (value.nextCursor.revision !== value.revision ||
        !value.items.some((item) => item.workspace.id === value.nextCursor?.workspaceId))
    )
      context.addIssue({ code: 'custom', message: 'Workspace activity cursor does not match its page' })
  })
export type WorkspaceActivitySortBy = z.infer<typeof workspaceActivitySortSchema>
export type WorkspaceActivityCursor = z.infer<typeof workspaceActivityCursorSchema>
export type WorkspaceActivityListInput = z.input<typeof workspaceActivityListInputSchema>
export type WorkspaceActivityItem = z.infer<typeof workspaceActivityItemSchema>
export type WorkspaceActivityPage = z.infer<typeof workspaceActivityPageSchema>
export const sessionActivitySortSchema = z.enum(['createdAt', 'updatedAt'])
export const sessionActivityCursorSchema = z.strictObject({
  workspaceId: entityId,
  sortBy: sessionActivitySortSchema,
  revision: workspaceActivityRevisionSchema,
  timestamp: workspaceActivityTimestampSchema,
  sessionId: entityId,
})
export const sessionActivityListInputSchema = z
  .strictObject({
    workspaceId: entityId,
    sortBy: sessionActivitySortSchema.default('updatedAt'),
    cursor: sessionActivityCursorSchema.optional(),
    limit: z.number().int().min(1).max(200).default(60),
  })
  .superRefine((value, context) => {
    if (value.cursor?.workspaceId !== undefined && value.cursor.workspaceId !== value.workspaceId)
      context.addIssue({ code: 'custom', message: 'Session activity cursor workspace does not match the request' })
    if (value.cursor && value.cursor.sortBy !== value.sortBy)
      context.addIssue({ code: 'custom', message: 'Session activity cursor sort does not match the request' })
  })
export const sessionActivityPageSchema = z
  .strictObject({
    revision: workspaceActivityRevisionSchema,
    items: z.array(sessionSchema).max(200),
    nextCursor: sessionActivityCursorSchema.nullable(),
  })
  .superRefine((value, context) => {
    const lastItem = value.items.at(-1)
    if (
      value.nextCursor &&
      (value.nextCursor.revision !== value.revision ||
        !lastItem ||
        value.nextCursor.workspaceId !== lastItem.workspaceId ||
        value.nextCursor.timestamp !== lastItem[value.nextCursor.sortBy] ||
        value.nextCursor.sessionId !== lastItem.id)
    )
      context.addIssue({ code: 'custom', message: 'Session activity cursor does not match its page' })
  })
export type SessionActivitySortBy = z.infer<typeof sessionActivitySortSchema>
export type SessionActivityCursor = z.infer<typeof sessionActivityCursorSchema>
export type SessionActivityListInput = z.input<typeof sessionActivityListInputSchema>
export type SessionActivityPage = z.infer<typeof sessionActivityPageSchema>
export const workspaceListInputSchema = z.strictObject({
  after: entityId.optional(),
  limit: z.number().int().min(1).max(200).default(60),
})
export const workspaceGetInputSchema = z.strictObject({ workspaceId: entityId })
export const sessionListInputSchema = z.strictObject({
  workspaceId: entityId,
  after: entityId.optional(),
  title: z.string().max(160).optional(),
  includeArchived: z.boolean().default(false),
  limit: z.number().int().min(1).max(200).default(60),
})
export const sessionGetInputSchema = z.strictObject({ sessionId: entityId })
export const workspacePageSchema = z.strictObject({
  items: z.array(workspaceSchema).max(200),
  nextCursor: entityId.nullable(),
})
export const sessionPageSchema = z.strictObject({
  items: z.array(sessionSchema).max(200),
  nextCursor: entityId.nullable(),
})
export type WorkspaceListInput = z.input<typeof workspaceListInputSchema>
export type SessionListInput = z.input<typeof sessionListInputSchema>
export type WorkspacePage = z.output<typeof workspacePageSchema>
export type SessionPage = z.output<typeof sessionPageSchema>
