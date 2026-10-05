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
  agentChildCount: z.number().int().nonnegative().safe().optional(),
})

/** Workspace-ordered rows and their execution summary share one revision-bound snapshot. */
export const sessionSidebarPageSchema = z
  .strictObject({
    revision,
    items: z
      .array(
        z.strictObject({
          session: sessionSchema,
          execution: sessionActivityExecutionSchema,
          agentChildCount: z.number().int().nonnegative().safe().optional(),
        }),
      )
      .max(200),
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

export const sessionAgentChildItemSchema = z.strictObject({
  session: sessionSchema,
  execution: sessionActivityExecutionSchema,
  agentChildCount: z.number().int().nonnegative().safe(),
  lastResponseAt: timestamp.nullable(),
})
export const sessionAgentChildrenCursorSchema = z.strictObject({
  parentSessionId: entityId,
  revision,
  responseAt: timestamp,
  createdAt: timestamp,
  sessionId: entityId,
})
export const sessionAgentChildrenInputSchema = z.strictObject({
  parentSessionId: entityId,
  cursor: sessionAgentChildrenCursorSchema.optional(),
  includeSessionId: entityId.optional(),
  limit: z.number().int().min(1).max(100).default(50),
})
export const sessionAgentChildrenPageSchema = z
  .strictObject({
    parentSessionId: entityId,
    revision,
    totalCount: z.number().int().nonnegative().safe(),
    items: z.array(sessionAgentChildItemSchema).max(100),
    includedItem: sessionAgentChildItemSchema.nullable(),
    nextCursor: sessionAgentChildrenCursorSchema.nullable(),
  })
  .superRefine((page, context) => {
    const all = [...page.items, ...(page.includedItem ? [page.includedItem] : [])]
    if (
      new Set(all.map((item) => item.session.id)).size !== all.length ||
      all.some(
        (item) =>
          item.session.parentId !== page.parentSessionId ||
          item.session.id === page.parentSessionId ||
          item.session.archived,
      )
    )
      context.addIssue({ code: 'custom', message: 'Agent child rows must be unique direct unarchived children' })
    const last = page.items.at(-1)
    if (
      page.nextCursor &&
      (!last ||
        page.nextCursor.parentSessionId !== page.parentSessionId ||
        page.nextCursor.revision !== page.revision ||
        page.nextCursor.sessionId !== last.session.id ||
        page.nextCursor.responseAt !== (last.lastResponseAt ?? 0) ||
        page.nextCursor.createdAt !== last.session.createdAt)
    )
      context.addIssue({ code: 'custom', message: 'Agent child cursor does not match its page' })
    if (all.length > page.totalCount) context.addIssue({ code: 'custom', message: 'Agent child count is inconsistent' })
    if (
      page.items.some((item, index) => {
        const previous = page.items[index - 1]
        if (!previous) return false
        const response = (previous.lastResponseAt ?? 0) - (item.lastResponseAt ?? 0)
        const creation = previous.session.createdAt - item.session.createdAt
        return (
          response < 0 ||
          (response === 0 && (creation < 0 || (creation === 0 && previous.session.id > item.session.id)))
        )
      })
    )
      context.addIssue({
        code: 'custom',
        message: 'Agent children must be ordered by latest response, creation and stable ID',
      })
  })
export const sessionAgentAncestorsInputSchema = z.strictObject({ sessionId: entityId })
export const sessionAgentAncestorsSchema = z
  .strictObject({
    sessionId: entityId,
    /** Root first, selected Session last. An ordinary fork is a root, not an Agent link. */
    items: z
      .array(z.strictObject({ session: sessionSchema, agentChildCount: z.number().int().nonnegative().safe() }))
      .min(1)
      .max(32),
    workspace: workspaceSchema,
  })
  .superRefine((value, context) => {
    if (
      new Set(value.items.map((item) => item.session.id)).size !== value.items.length ||
      value.items.at(-1)?.session.id !== value.sessionId ||
      value.items[0]?.session.workspaceId !== value.workspace.id ||
      value.items.some((item, index) => index > 0 && item.session.parentId !== value.items[index - 1]?.session.id)
    )
      context.addIssue({ code: 'custom', message: 'Agent ancestor path is inconsistent' })
  })
export type SessionAgentChildItem = z.output<typeof sessionAgentChildItemSchema>
export type SessionAgentChildrenInput = z.input<typeof sessionAgentChildrenInputSchema>
export type SessionAgentChildrenPage = z.output<typeof sessionAgentChildrenPageSchema>
export type SessionAgentAncestors = z.output<typeof sessionAgentAncestorsSchema>

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
