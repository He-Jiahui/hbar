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
