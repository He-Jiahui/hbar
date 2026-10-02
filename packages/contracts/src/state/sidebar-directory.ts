import { z } from 'zod'
import { sessionSchema, workspaceSchema, sessionActivityPageSchema } from './directory'

const entityId = z.string().min(1).max(160)
const timestamp = z.number().int().nonnegative().safe()
const revision = z.number().int().nonnegative().safe()
const displayName = z.string().max(4_000)

export const sidebarOrganizationSchema = z.enum(['project', 'recentProject'])
export const sidebarSortBySchema = z.enum(['createdAt', 'updatedAt'])
export const sidebarLocaleSchema = z.enum(['en-US', 'zh-CN'])

export const workspaceSidebarCursorSchema = z
  .strictObject({
    organization: sidebarOrganizationSchema,
    sortBy: sidebarSortBySchema,
    locale: sidebarLocaleSchema,
    revision,
    displayNamesRevision: revision,
    organizationRevision: revision,
    displayName,
    timestamp: timestamp.nullable(),
    workspaceId: entityId,
  })
  .superRefine((cursor, context) => {
    if (cursor.organization === 'project' && cursor.timestamp !== null)
      context.addIssue({ code: 'custom', path: ['timestamp'], message: 'Project cursor timestamp must be null' })
  })

export const workspaceSidebarListInputSchema = z
  .strictObject({
    organization: sidebarOrganizationSchema.default('recentProject'),
    sortBy: sidebarSortBySchema.default('updatedAt'),
    locale: sidebarLocaleSchema.default('en-US'),
    cursor: workspaceSidebarCursorSchema.optional(),
    limit: z.number().int().min(1).max(200).default(60),
    includeWorkspaceIds: z.array(entityId).max(20).optional(),
  })
  .superRefine((input, context) => {
    if (
      input.cursor &&
      (input.cursor.organization !== input.organization ||
        input.cursor.sortBy !== input.sortBy ||
        input.cursor.locale !== input.locale)
    )
      context.addIssue({
        code: 'custom',
        path: ['cursor'],
        message: 'Workspace sidebar cursor does not match its query',
      })
    if (input.includeWorkspaceIds && new Set(input.includeWorkspaceIds).size !== input.includeWorkspaceIds.length)
      context.addIssue({
        code: 'custom',
        path: ['includeWorkspaceIds'],
        message: 'Included Workspace IDs must be unique',
      })
  })

export const workspaceSidebarItemSchema = z.strictObject({
  workspace: workspaceSchema,
  displayName,
  latestSessionCreatedAt: timestamp.nullable(),
  latestSessionUpdatedAt: timestamp.nullable(),
})

export const workspaceSidebarPageSchema = z
  .strictObject({
    revision,
    displayNamesRevision: revision,
    organizationRevision: revision,
    items: z.array(workspaceSidebarItemSchema).max(200),
    includedItems: z.array(workspaceSidebarItemSchema).max(20),
    nextCursor: workspaceSidebarCursorSchema.nullable(),
  })
  .superRefine((page, context) => {
    const items = [...page.items, ...page.includedItems]
    const ids = items.map((item) => item.workspace.id)
    if (new Set(ids).size !== ids.length)
      context.addIssue({ code: 'custom', message: 'Workspace sidebar page contains duplicate workspaces' })
    if (page.nextCursor) {
      const last = page.items.at(-1)
      if (
        page.nextCursor.revision !== page.revision ||
        page.nextCursor.displayNamesRevision !== page.displayNamesRevision ||
        page.nextCursor.organizationRevision !== page.organizationRevision ||
        !last ||
        page.nextCursor.workspaceId !== last.workspace.id ||
        page.nextCursor.displayName !== last.displayName
      )
        context.addIssue({
          code: 'custom',
          path: ['nextCursor'],
          message: 'Workspace sidebar cursor does not match its page',
        })
      else if (
        page.nextCursor.organization === 'project'
          ? page.nextCursor.timestamp !== null
          : page.nextCursor.timestamp !==
            (page.nextCursor.sortBy === 'createdAt' ? last.latestSessionCreatedAt : last.latestSessionUpdatedAt)
      )
        context.addIssue({
          code: 'custom',
          path: ['nextCursor'],
          message: 'Workspace sidebar cursor timestamp is invalid',
        })
    }
  })

export const sessionActivityGlobalCursorSchema = z.strictObject({
  revision,
  displayNamesRevision: revision,
  organizationRevision: revision,
  active: z.boolean(),
  updatedAt: timestamp,
  sessionId: entityId,
})

export const sessionActivityGlobalListInputSchema = z.strictObject({
  cursor: sessionActivityGlobalCursorSchema.optional(),
  limit: z.number().int().min(1).max(200).default(60),
})

export const sessionActivityExecutionSchema = z
  .strictObject({
    state: z.enum(['idle', 'queued', 'running', 'waiting_approval', 'cancelRequested']),
    /** Nonterminal Runs owned by this Session or its direct non-fork children; not a Goal-completion signal. */
    activeCount: z.number().int().nonnegative().safe(),
    queuedCount: z.number().int().nonnegative().safe(),
  })
  .superRefine((execution, context) => {
    if ((execution.activeCount === 0) !== (execution.state === 'idle'))
      context.addIssue({ code: 'custom', path: ['state'], message: 'Idle execution must have no active Runs' })
    if (execution.queuedCount > execution.activeCount)
      context.addIssue({ code: 'custom', path: ['queuedCount'], message: 'Queued Runs cannot exceed active Runs' })
    if (execution.state === 'queued' && execution.queuedCount === 0)
      context.addIssue({ code: 'custom', path: ['state'], message: 'Queued execution must have a queued Run' })
  })

/** Exact selected-Session execution read; the revision covers the Session and Run snapshot. */
export const sessionExecutionGetInputSchema = z.strictObject({
  sessionId: entityId,
  workspaceId: entityId,
})

export const sessionExecutionSnapshotSchema = z.strictObject({
  sessionId: entityId,
  workspaceId: entityId,
  revision,
  execution: sessionActivityExecutionSchema,
})

export const sessionActivityGlobalItemSchema = z.strictObject({
  session: sessionSchema,
  workspace: workspaceSchema,
  displayName,
  execution: sessionActivityExecutionSchema,
})

/** Workspace-ordered rows and their execution summary share one revision-bound snapshot. */
export const sessionSidebarPageSchema = z
  .strictObject({
    revision,
    items: z.array(z.strictObject({ session: sessionSchema, execution: sessionActivityExecutionSchema })).max(200),
    nextCursor: sessionActivityPageSchema.shape.nextCursor,
  })
  .superRefine((page, context) => {
    const sessions = page.items.map((item) => item.session)
    if (new Set(sessions.map((item) => item.id)).size !== sessions.length)
      context.addIssue({ code: 'custom', path: ['items'], message: 'Session sidebar page contains duplicate Sessions' })
    if (!sessionActivityPageSchema.safeParse({ ...page, items: sessions }).success)
      context.addIssue({
        code: 'custom',
        path: ['nextCursor'],
        message: 'Session sidebar cursor does not match its page',
      })
  })

export type SessionSidebarPage = z.output<typeof sessionSidebarPageSchema>

export const sessionActivityGlobalPageSchema = z
  .strictObject({
    revision,
    displayNamesRevision: revision,
    organizationRevision: revision,
    items: z.array(sessionActivityGlobalItemSchema).max(200),
    nextCursor: sessionActivityGlobalCursorSchema.nullable(),
  })
  .superRefine((page, context) => {
    const ids = page.items.map((item) => item.session.id)
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'Global Session activity contains duplicate Sessions',
      })
    for (const item of page.items) {
      if (item.session.workspaceId !== item.workspace.id)
        context.addIssue({ code: 'custom', path: ['items'], message: 'Session and Workspace context do not match' })
    }
    const last = page.items.at(-1)
    if (
      page.nextCursor &&
      (page.nextCursor.revision !== page.revision ||
        page.nextCursor.displayNamesRevision !== page.displayNamesRevision ||
        page.nextCursor.organizationRevision !== page.organizationRevision ||
        !last ||
        page.nextCursor.active !== last.execution.activeCount > 0 ||
        page.nextCursor.updatedAt !== last.session.updatedAt ||
        page.nextCursor.sessionId !== last.session.id)
    )
      context.addIssue({
        code: 'custom',
        path: ['nextCursor'],
        message: 'Global Session cursor does not match its page',
      })
  })

export type SidebarOrganization = z.output<typeof sidebarOrganizationSchema>
export type SidebarSortBy = z.output<typeof sidebarSortBySchema>
export type SidebarLocale = z.output<typeof sidebarLocaleSchema>
export type WorkspaceSidebarCursor = z.output<typeof workspaceSidebarCursorSchema>
export type WorkspaceSidebarListInput = z.input<typeof workspaceSidebarListInputSchema>
export type WorkspaceSidebarItem = z.output<typeof workspaceSidebarItemSchema>
export type WorkspaceSidebarPage = z.output<typeof workspaceSidebarPageSchema>
export type SessionActivityGlobalCursor = z.output<typeof sessionActivityGlobalCursorSchema>
export type SessionActivityGlobalListInput = z.input<typeof sessionActivityGlobalListInputSchema>
export type SessionActivityExecution = z.output<typeof sessionActivityExecutionSchema>
export type SessionExecutionGetInput = z.input<typeof sessionExecutionGetInputSchema>
export type SessionExecutionSnapshot = z.output<typeof sessionExecutionSnapshotSchema>
export type SessionActivityGlobalItem = z.output<typeof sessionActivityGlobalItemSchema>
export type SessionActivityGlobalPage = z.output<typeof sessionActivityGlobalPageSchema>
