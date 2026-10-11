import { CommandError, type CommandExecutor, type CommandRegistry, type ExecuteOptions } from '@hbar/commands'
import { defineCommand } from '@hbar/commands/protocol'
import {
  sessionActivityGlobalPageSchema,
  sessionActivityPageSchema,
  sessionSidebarPageSchema,
  workspaceSidebarPageSchema,
} from '@hbar/contracts/sidebar-directory'
import type {
  Session,
  SessionActivityExecution,
  SessionActivityGlobalCursor,
  SessionActivityGlobalPage,
  SessionActivityCursor,
  SessionActivityPage,
  WorkspaceActivitySortBy,
  SidebarLocale,
  SidebarOrganization,
  WorkspaceSidebarCursor,
  WorkspaceSidebarItem,
  WorkspaceSidebarPage,
} from '@hbar/contracts/sidebar-directory'
import { workspaceActivitySortSchema } from '@hbar/contracts/directory'
import type { WorkspaceActivityItem } from '@hbar/contracts/directory'
import { z } from 'zod'
import { createState, type StateReader } from './state'
import { createSessionProjectionFence } from './session-projection-fence'
import type { ClientPreferencesState, DirectoryState } from './types'
import { MAX_PINNED_WORKSPACES, type WorkspacePinsState } from './workspace-pins'
import { MAX_RETAINED_ACTIVITY_SESSIONS, MAX_RETAINED_ACTIVITY_WORKSPACES } from './directory'
import {
  applyManualProjectOrder,
  groupedSidebarOrganizationSchema,
  legacySidebarPreferenceSchema,
  moveProjectInOrder,
  projectOrderSchema,
  sameProjectOrder,
  sameSidebarPreference,
  sidebarOrganizationSchema,
  sidebarPreferenceSchema,
  type SidebarPreference,
} from './project-order-model'

const PREFERENCE_KEY = 'workspaceActivitySortBy'
const ORGANIZATION_PREFERENCE_KEY = 'workspaceSidebarOrganization'
const PAGE_SIZE = 60
const WORKSPACE_ROW_LIMIT = 200
const SESSION_ROW_LIMIT = MAX_RETAINED_ACTIVITY_SESSIONS
const SESSION_GROUP_LIMIT = MAX_RETAINED_ACTIVITY_WORKSPACES
const MAX_PARALLEL_REFRESHES = 4
const idSchema = z.string().min(1).max(160)
const organizationSchema = sidebarOrganizationSchema
const groupedOrganizationSchema = groupedSidebarOrganizationSchema
const moveProjectInput = z.strictObject({
  sourceWorkspaceId: idSchema,
  targetWorkspaceId: idSchema,
  placement: z.enum(['before', 'after']),
  expectedOrder: projectOrderSchema,
  expectedSortBy: workspaceActivitySortSchema,
})
const refreshInput = z.strictObject({ workspaceId: idSchema.optional() })
const loadMoreInput = z
  .strictObject({
    scope: z.enum(['workspaces', 'sessions', 'timeline']),
    workspaceId: idSchema.optional(),
  })
  .superRefine((input, context) => {
    if (input.scope === 'sessions' && input.workspaceId === undefined)
      context.addIssue({ code: 'custom', path: ['workspaceId'], message: 'Session paging needs a Workspace ID' })
    if (input.scope === 'workspaces' && input.workspaceId !== undefined)
      context.addIssue({
        code: 'custom',
        path: ['workspaceId'],
        message: 'Workspace paging does not take a Workspace ID',
      })
    if (input.scope === 'timeline' && input.workspaceId !== undefined)
      context.addIssue({
        code: 'custom',
        path: ['workspaceId'],
        message: 'Global Timeline paging does not take a Workspace ID',
      })
  })
const actionOutput = z.strictObject({
  status: z.enum(['ready', 'error', 'limitReached']),
  error: z.string().nullable(),
})
const sortOutput = z.strictObject({ sortBy: workspaceActivitySortSchema, persisted: z.boolean() })
const organizationOutput = z.strictObject({
  organization: organizationSchema,
  previousGroupedOrganization: groupedOrganizationSchema,
  persisted: z.boolean(),
})
const localeOutput = z.strictObject({ locale: z.enum(['en-US', 'zh-CN']) })

function metadata(id: string) {
  return {
    id,
    version: 1,
    owner: 'hbar.workspace-activity',
    kind: 'command' as const,
    execution: 'client' as const,
    stateEffect: 'application' as const,
    category: 'workspace.navigation',
    scope: 'client' as const,
    visibility: 'internal' as const,
    titleKey: `commands.${id}.title`,
    descriptionKey: `commands.${id}.description`,
    surfaces: ['api'] as 'api'[],
  }
}

export const workspaceActivityCommands = {
  'workspaceActivity.moveProject': defineCommand(
    metadata('workspaceActivity.moveProject'),
    moveProjectInput,
    actionOutput,
  ),
  'workspaceActivity.setSort': defineCommand(
    metadata('workspaceActivity.setSort'),
    z.strictObject({ sortBy: workspaceActivitySortSchema }),
    sortOutput,
  ),
  'workspaceActivity.refresh': defineCommand(metadata('workspaceActivity.refresh'), refreshInput, actionOutput),
  'workspaceActivity.loadMore': defineCommand(metadata('workspaceActivity.loadMore'), loadMoreInput, actionOutput),
  'workspaceActivity.setOrganization': defineCommand(
    metadata('workspaceActivity.setOrganization'),
    z.strictObject({ organization: organizationSchema }),
    organizationOutput,
  ),
  'workspaceActivity.toggleTime': defineCommand(
    metadata('workspaceActivity.toggleTime'),
    z.strictObject({}),
    organizationOutput,
  ),
  'workspaceActivity.setLocale': defineCommand(
    metadata('workspaceActivity.setLocale'),
    z.strictObject({ locale: z.enum(['en-US', 'zh-CN']) }),
    localeOutput,
  ),
}

export type WorkspaceActivityPreferenceStatus = 'loading' | 'ready' | 'saving' | 'submitting' | 'error'
export type WorkspaceActivityOrganization = z.infer<typeof organizationSchema>
export type WorkspaceActivityGroupedOrganization = z.infer<typeof groupedOrganizationSchema>
export type WorkspaceActivityOrganizationPreferenceStatus = 'loading' | 'ready' | 'saving' | 'error'
export type WorkspaceActivityPageStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface WorkspaceActivityRow {
  readonly workspaceId: string
  readonly displayName: string
  readonly latestSessionCreatedAt: number | null
  readonly latestSessionUpdatedAt: number | null
}

export interface WorkspaceActivityWorkspacePage {
  readonly status: WorkspaceActivityPageStatus
  readonly items: readonly Readonly<WorkspaceActivityRow>[]
  readonly includedPins: readonly Readonly<WorkspaceActivityRow>[]
  readonly revision: number | null
  readonly displayNamesRevision: number | null
  readonly organizationRevision: number | null
  readonly nextCursor: WorkspaceSidebarCursor | null
  readonly hasMore: boolean
  readonly limitReached: boolean
  readonly error: string | null
}

export interface WorkspaceActivitySessionPage {
  readonly status: WorkspaceActivityPageStatus
  readonly sortBy: WorkspaceActivitySortBy
  readonly sessionIds: readonly string[]
  readonly execution: Readonly<Record<string, Readonly<SessionActivityExecution>>>
  readonly agentChildCounts?: Readonly<Record<string, number>>
  readonly nextCursor: SessionActivityCursor | null
  readonly hasMore: boolean
  readonly limitReached: boolean
  readonly error: string | null
}

export interface WorkspaceActivityTimelineRow {
  readonly sessionId: string
  readonly workspaceId: string
  readonly displayName: string
  readonly execution: Readonly<SessionActivityExecution>
  readonly agentChildCount?: number
}

export interface WorkspaceActivityTimelinePage {
  readonly status: WorkspaceActivityPageStatus
  readonly items: readonly Readonly<WorkspaceActivityTimelineRow>[]
  readonly revision: number | null
  readonly displayNamesRevision: number | null
  readonly organizationRevision: number | null
  readonly nextCursor: SessionActivityGlobalCursor | null
  readonly hasMore: boolean
  readonly limitReached: boolean
  readonly stale: boolean
  readonly error: string | null
}

export interface WorkspaceActivityState {
  readonly sortBy: WorkspaceActivitySortBy
  readonly preferenceStatus: WorkspaceActivityPreferenceStatus
  readonly preferenceError: string | null
  readonly organization: WorkspaceActivityOrganization
  readonly previousGroupedOrganization: WorkspaceActivityGroupedOrganization
  readonly projectOrder: readonly string[]
  readonly organizationPreferenceStatus: WorkspaceActivityOrganizationPreferenceStatus
  readonly organizationPreferenceError: string | null
  readonly locale: SidebarLocale
  readonly workspaces: Readonly<WorkspaceActivityWorkspacePage>
  readonly sessions: Readonly<Record<string, Readonly<WorkspaceActivitySessionPage>>>
  readonly timeline: Readonly<WorkspaceActivityTimelinePage>
}

export interface WorkspaceActivityOptions {
  readonly preferences: StateReader<ClientPreferencesState>
  readonly preferencesReady: Promise<void>
  readonly preferenceCommands: CommandExecutor
  readonly refreshPreferences: () => Promise<ClientPreferencesState>
  readonly queries: CommandExecutor
  readonly pins: StateReader<WorkspacePinsState>
  readonly hiddenWorkspaceIds?: () => readonly string[]
  readonly directory: StateReader<DirectoryState>
  readonly projectActivityWorkspaces: (
    retainedIds: readonly string[],
    records: readonly WorkspaceActivityItem[],
  ) => void
  readonly projectActivitySessions: (retainedIds: readonly string[], records: readonly Session[]) => readonly Session[]
  readonly subscribeConfirmedSessions: (listener: (items: readonly Session[]) => void) => () => void
  readonly sidebarActivityEvents?: {
    subscribe(listener: () => void): () => void
    onConnection?(listener: (connected: boolean) => void): () => void
  }
  readonly onSubscriberError: (reason: unknown) => void
  readonly isDisposed: () => boolean
}

const emptyWorkspacePage: WorkspaceActivityWorkspacePage = {
  status: 'idle',
  items: [],
  includedPins: [],
  revision: null,
  displayNamesRevision: null,
  organizationRevision: null,
  nextCursor: null,
  hasMore: false,
  limitReached: false,
  error: null,
}

const emptyTimelinePage: WorkspaceActivityTimelinePage = {
  status: 'idle',
  items: [],
  revision: null,
  displayNamesRevision: null,
  organizationRevision: null,
  nextCursor: null,
  hasMore: false,
  limitReached: false,
  stale: false,
  error: null,
}

function errorCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

function persistedSort(preferences: ClientPreferencesState): WorkspaceActivitySortBy {
  const organization = preferences.values[ORGANIZATION_PREFERENCE_KEY]
  if (organization && typeof organization === 'object' && 'version' in organization && organization.version === 2) {
    const parsed = sidebarPreferenceSchema.safeParse(organization)
    if (!parsed.success) throw new CommandError('INVALID_PERSISTED_STATE', 'Saved Workspace organization is invalid')
    return parsed.data.sortBy
  }
  const value = preferences.values[PREFERENCE_KEY]
  if (value === undefined) return 'updatedAt'
  const parsed = workspaceActivitySortSchema.safeParse(value)
  if (!parsed.success) throw new CommandError('INVALID_PERSISTED_STATE', 'Saved Workspace sort is invalid')
  return parsed.data
}

function persistedOrganization(preferences: ClientPreferencesState): SidebarPreference {
  const value = preferences.values[ORGANIZATION_PREFERENCE_KEY]
  if (value === undefined)
    return {
      version: 2,
      organization: 'recentProject',
      previousGroupedOrganization: 'recentProject',
      sortBy: persistedSort(preferences),
      projectOrder: [],
    }
  const current = sidebarPreferenceSchema.safeParse(value)
  if (current.success) return current.data
  const parsed = legacySidebarPreferenceSchema.safeParse(value)
  if (!parsed.success) throw new CommandError('INVALID_PERSISTED_STATE', 'Saved Workspace organization is invalid')
  return { ...parsed.data, version: 2, sortBy: persistedSort(preferences), projectOrder: [] }
}

function row(item: WorkspaceSidebarItem): WorkspaceActivityRow {
  return {
    workspaceId: item.workspace.id,
    displayName: item.displayName,
    latestSessionCreatedAt: item.latestSessionCreatedAt,
    latestSessionUpdatedAt: item.latestSessionUpdatedAt,
  }
}

function activityTimestamp(item: WorkspaceActivityRow, sortBy: WorkspaceActivitySortBy): number | null {
  return sortBy === 'createdAt' ? item.latestSessionCreatedAt : item.latestSessionUpdatedAt
}

/** Match the Host's recent-project descending timestamp, null-last and binary ID order. */
function compareRecentRows(
  left: WorkspaceActivityRow,
  right: WorkspaceActivityRow,
  sortBy: WorkspaceActivitySortBy,
): number {
  const a = activityTimestamp(left, sortBy)
  const b = activityTimestamp(right, sortBy)
  if (a === null && b !== null) return 1
  if (a !== null && b === null) return -1
  if (a !== null && b !== null && a !== b) return b - a
  return compareIds(left.workspaceId, right.workspaceId)
}

function compareIds(left: string, right: string): number {
  const leftBytes = new TextEncoder().encode(left)
  const rightBytes = new TextEncoder().encode(right)
  const shared = Math.min(leftBytes.length, rightBytes.length)
  for (let index = 0; index < shared; index++) {
    const a = leftBytes[index]
    const b = rightBytes[index]
    if (a !== b) return (a ?? 0) - (b ?? 0)
  }
  return leftBytes.length - rightBytes.length
}

function compareProjectRows(left: WorkspaceActivityRow, right: WorkspaceActivityRow, locale: SidebarLocale): number {
  return (
    new Intl.Collator(locale).compare(left.displayName, right.displayName) ||
    compareIds(left.workspaceId, right.workspaceId)
  )
}

function validateWorkspacePage(
  value: unknown,
  input: {
    readonly organization: SidebarOrganization
    readonly sortBy: WorkspaceActivitySortBy
    readonly locale: SidebarLocale
  },
): WorkspaceSidebarPage {
  const page = workspaceSidebarPageSchema.parse(value)
  const compare =
    input.organization === 'project'
      ? (left: WorkspaceSidebarItem, right: WorkspaceSidebarItem) =>
          compareProjectRows(row(left), row(right), input.locale)
      : (left: WorkspaceSidebarItem, right: WorkspaceSidebarItem) =>
          compareRecentRows(row(left), row(right), input.sortBy)
  for (let index = 1; index < page.items.length; index++) {
    const previous = page.items[index - 1]
    const current = page.items[index]
    if (!previous || !current || compare(previous, current) > 0)
      throw new CommandError('INVALID_OUTPUT', 'Workspace sidebar page is not sorted')
  }
  const last = page.items.at(-1)
  if (
    page.nextCursor &&
    (!last ||
      page.nextCursor.organization !== input.organization ||
      page.nextCursor.sortBy !== input.sortBy ||
      page.nextCursor.locale !== input.locale ||
      page.nextCursor.workspaceId !== last.workspace.id ||
      page.nextCursor.displayName !== last.displayName ||
      page.nextCursor.timestamp !==
        (input.organization === 'project' ? null : activityTimestamp(row(last), input.sortBy)) ||
      page.nextCursor.revision !== page.revision ||
      page.nextCursor.displayNamesRevision !== page.displayNamesRevision ||
      page.nextCursor.organizationRevision !== page.organizationRevision)
  )
    throw new CommandError('INVALID_OUTPUT', 'Workspace sidebar cursor does not match its page')
  return page
}

function validateSessionPage(page: SessionActivityPage, workspaceId: string, sortBy: WorkspaceActivitySortBy): void {
  if (new Set(page.items.map((item) => item.id)).size !== page.items.length)
    throw new CommandError('INVALID_OUTPUT', 'Session activity page contains duplicate IDs')
  if (page.nextCursor && (page.nextCursor.workspaceId !== workspaceId || page.nextCursor.sortBy !== sortBy))
    throw new CommandError('INVALID_OUTPUT', 'Session activity cursor does not match its query')
  for (const item of page.items) {
    if (item.workspaceId !== workspaceId || item.archived)
      throw new CommandError('INVALID_OUTPUT', 'Session activity page does not match its query')
  }
  for (let index = 1; index < page.items.length; index++) {
    const previous = page.items[index - 1]
    const current = page.items[index]
    if (!previous || !current) throw new CommandError('INVALID_OUTPUT', 'Session activity page is incomplete')
    const left = sortBy === 'createdAt' ? previous.createdAt : previous.updatedAt
    const right = sortBy === 'createdAt' ? current.createdAt : current.updatedAt
    if (left < right || (left === right && compareIds(previous.id, current.id) > 0))
      throw new CommandError('INVALID_OUTPUT', 'Session activity page is not sorted')
  }
}

function validateGlobalSessionPage(value: unknown): SessionActivityGlobalPage {
  const page = sessionActivityGlobalPageSchema.parse(value)
  const items = page.items
  for (let index = 1; index < items.length; index++) {
    const previous = items[index - 1]
    const current = items[index]
    if (!previous || !current) throw new CommandError('INVALID_OUTPUT', 'Global Session activity page is incomplete')
    const previousActive = previous.execution.activeCount > 0
    const currentActive = current.execution.activeCount > 0
    const ordered =
      Number(currentActive) - Number(previousActive) ||
      current.session.updatedAt - previous.session.updatedAt ||
      compareIds(previous.session.id, current.session.id)
    if (ordered > 0) throw new CommandError('INVALID_OUTPUT', 'Global Session activity page is not sorted')
  }
  for (const item of items) {
    const { execution } = item
    if ((execution.activeCount === 0) !== (execution.state === 'idle') || execution.queuedCount > execution.activeCount)
      throw new CommandError('INVALID_OUTPUT', 'Global Session execution summary is inconsistent')
  }
  const last = items.at(-1)
  if (
    page.nextCursor &&
    (!last ||
      page.nextCursor.revision !== page.revision ||
      page.nextCursor.displayNamesRevision !== page.displayNamesRevision ||
      page.nextCursor.organizationRevision !== page.organizationRevision ||
      page.nextCursor.active !== last.execution.activeCount > 0 ||
      page.nextCursor.updatedAt !== last.session.updatedAt ||
      page.nextCursor.sessionId !== last.session.id)
  )
    throw new CommandError('INVALID_OUTPUT', 'Global Session activity cursor does not match its page')
  return page
}

function pageResult(status: 'ready' | 'error' | 'limitReached', error: string | null = null) {
  return { status, error }
}

/** Puts pinned rows first within the current Host order, then applies visibility. */
export function orderWorkspaceActivityIds(
  activity: WorkspaceActivityState,
  pins: WorkspacePinsState,
  hiddenWorkspaceIds: readonly string[],
): readonly string[] {
  const pageRows = activity.workspaces.items
  const rows = new Map<string, WorkspaceActivityRow>()
  for (const item of pageRows) rows.set(item.workspaceId, item)
  for (const item of activity.workspaces.includedPins) rows.set(item.workspaceId, item)
  const missing = new Set(pins.missing)
  const pinnedIds = [...new Set(pins.ids)].filter((id) => !missing.has(id))
  const comparePinned =
    activity.organization === 'project'
      ? (left: WorkspaceActivityRow, right: WorkspaceActivityRow) => compareProjectRows(left, right, activity.locale)
      : (left: WorkspaceActivityRow, right: WorkspaceActivityRow) => compareRecentRows(left, right, activity.sortBy)
  const pinned = pinnedIds
    .map(
      (id) =>
        rows.get(id) ?? {
          workspaceId: id,
          displayName: id,
          latestSessionCreatedAt: null,
          latestSessionUpdatedAt: null,
        },
    )
    .sort(comparePinned)
  const pinnedSet = new Set(pinnedIds)
  const hidden = new Set(hiddenWorkspaceIds)
  const orderedPins = pinned.map((item) => item.workspaceId)
  const regular = pageRows.map((item) => item.workspaceId).filter((id) => !pinnedSet.has(id))
  const manual = activity.organization === 'recentProject'
  return [
    ...(manual ? applyManualProjectOrder(orderedPins, activity.projectOrder) : orderedPins),
    ...(manual ? applyManualProjectOrder(regular, activity.projectOrder) : regular),
  ].filter(
    (id, index, all) => !hidden.has(id) && (!pinnedSet.has(id) || index < pinned.length) && all.indexOf(id) === index,
  )
}

interface SessionFactVersion {
  readonly workspaceId: string
  readonly seq: number
  readonly createdAt: number
  readonly updatedAt: number
  readonly archived: boolean
}

interface ActivityQueryTask {
  readonly controller: AbortController
  readonly generation: number
}

/** Owns sidebar organization, project ordering, grouped activity and the bounded global time projection. */
export function createWorkspaceActivity(local: CommandRegistry, options: WorkspaceActivityOptions) {
  const state = createState<WorkspaceActivityState>(
    {
      sortBy: 'updatedAt',
      preferenceStatus: 'loading',
      preferenceError: null,
      organization: 'recentProject',
      previousGroupedOrganization: 'recentProject',
      projectOrder: [],
      organizationPreferenceStatus: 'loading',
      organizationPreferenceError: null,
      locale: 'en-US',
      workspaces: emptyWorkspacePage,
      sessions: {},
      timeline: emptyTimelinePage,
    },
    options.onSubscriberError,
  )
  let disposed = false
  let initialized = false
  let preferenceRefreshInProgress = false
  let organizationWriteInProgress = false
  let organizationRefreshInProgress = false
  let workspaceGeneration = 0
  let workspaceTask: ActivityQueryTask | null = null
  let timelineGeneration = 0
  let timelineTask: ActivityQueryTask | null = null
  const sessionGenerations = new Map<string, number>()
  const sessionTasks = new Map<string, ActivityQueryTask>()
  const changedSessionFacts = new Map<string, SessionFactVersion>()
  let projectingSessions = false
  let lastDirectorySessions = options.directory.getSnapshot().sessions
  let pinSignature = options.pins.getSnapshot().ids.join('\0')
  const pendingSessionRefreshes = new Set<string>()
  let pendingWorkspaceRefresh = false
  let invalidationScheduled = false
  let invalidationTimer: ReturnType<typeof setTimeout> | null = null
  let invalidationDuringRead = false
  let lastInvalidationReadAt = 0
  let visibleRefreshInProgress = false
  let sidebarConnected = true
  const current = () => state.reader.getSnapshot()
  const alive = () => !disposed && !options.isDisposed()
  const replace = (next: WorkspaceActivityState) => {
    if (alive()) state.replace(next)
  }

  function abortWorkspaceTask(): void {
    workspaceGeneration++
    workspaceTask?.controller.abort()
    workspaceTask = null
  }

  function abortTimelineTask(): void {
    timelineGeneration++
    timelineTask?.controller.abort()
    timelineTask = null
  }

  function abortSessionTask(workspaceId: string): void {
    sessionGenerations.set(workspaceId, (sessionGenerations.get(workspaceId) ?? 0) + 1)
    sessionTasks.get(workspaceId)?.controller.abort()
    sessionTasks.delete(workspaceId)
  }

  function abortAllTasks(): void {
    abortWorkspaceTask()
    abortTimelineTask()
    for (const workspaceId of sessionTasks.keys()) abortSessionTask(workspaceId)
  }

  function linkSignal(controller: AbortController, signal?: AbortSignal): () => void {
    if (!signal) return () => undefined
    const abort = () => controller.abort()
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', abort, { once: true })
    return () => signal.removeEventListener('abort', abort)
  }

  function workspacePinIds(): readonly string[] {
    return [...new Set(options.pins.getSnapshot().ids)].slice(0, MAX_PINNED_WORKSPACES)
  }

  function projectWorkspacePage(
    workspaces: WorkspaceActivityWorkspacePage,
    records: readonly WorkspaceSidebarItem[],
  ): void {
    const retainedIds = [...new Set([...workspaces.items.map((item) => item.workspaceId), ...workspacePinIds()])]
    if (retainedIds.length > MAX_RETAINED_ACTIVITY_WORKSPACES)
      throw new CommandError('CAPACITY_EXCEEDED', 'Too many retained Workspace activity rows')
    options.projectActivityWorkspaces(
      retainedIds,
      records.map((item) => ({
        workspace: item.workspace,
        latestSessionCreatedAt: item.latestSessionCreatedAt,
        latestSessionUpdatedAt: item.latestSessionUpdatedAt,
      })),
    )
  }

  function projectTimelineWorkspaces(
    timeline: Readonly<WorkspaceActivityTimelinePage>,
    records: readonly SessionActivityGlobalPage['items'][number][] = [],
  ): void {
    const retainedIds = [...new Set([...timeline.items.map((item) => item.workspaceId), ...workspacePinIds()])]
    if (retainedIds.length > MAX_RETAINED_ACTIVITY_WORKSPACES)
      throw new CommandError('CAPACITY_EXCEEDED', 'Too many retained Time view Workspace contexts')
    const known = options.directory.getSnapshot().workspaces
    const contexts = new Map(records.map((item) => [item.workspace.id, item.workspace]))
    for (const id of retainedIds) {
      const workspace = known[id]
      if (workspace && !contexts.has(id)) contexts.set(id, workspace)
    }
    // Time rows provide canonical Workspace context, not a complete latest-activity summary.
    options.projectActivityWorkspaces(
      retainedIds,
      [...contexts.values()].map((workspace) => ({
        workspace,
        latestSessionCreatedAt: null,
        latestSessionUpdatedAt: null,
      })),
    )
  }

  function retainedSessionIds(
    pages: Readonly<Record<string, Readonly<WorkspaceActivitySessionPage>>>,
    timeline: Readonly<WorkspaceActivityTimelinePage> = current().timeline,
  ): string[] {
    const grouped = Object.values(pages).flatMap((page) => page.sessionIds)
    const global = current().organization === 'time' ? timeline.items.map((item) => item.sessionId) : []
    return [...new Set([...grouped, ...global])]
  }

  function projectSessionPage(
    pages: Readonly<Record<string, Readonly<WorkspaceActivitySessionPage>>>,
    records: readonly Session[],
  ): readonly Session[] {
    const ids = retainedSessionIds(pages)
    if (ids.length > SESSION_ROW_LIMIT)
      throw new CommandError('CAPACITY_EXCEEDED', 'Too many retained Session activity rows')
    projectingSessions = true
    try {
      return options.projectActivitySessions(ids, records)
    } finally {
      projectingSessions = false
    }
  }

  function projectTimelinePage(
    timeline: Readonly<WorkspaceActivityTimelinePage>,
    records: readonly Session[],
  ): readonly Session[] {
    const ids = retainedSessionIds(current().sessions, timeline)
    if (ids.length > SESSION_ROW_LIMIT)
      throw new CommandError('CAPACITY_EXCEEDED', 'Too many retained Sidebar activity Sessions')
    projectingSessions = true
    try {
      return options.projectActivitySessions(ids, records)
    } finally {
      projectingSessions = false
    }
  }

  function updateSessionPage(workspaceId: string, page: WorkspaceActivitySessionPage): void {
    const sessions = { ...current().sessions, [workspaceId]: page }
    replace({ ...current(), sessions })
  }

  function sessionLimitForPage(workspaceId: string, pageSize: number, append: boolean): number {
    const pages = current().sessions
    const total = retainedSessionIds(pages).length
    const replaced = append ? 0 : (pages[workspaceId]?.sessionIds.length ?? 0)
    return Math.min(pageSize, Math.max(0, SESSION_ROW_LIMIT - total + replaced))
  }

  function mapRows(items: readonly WorkspaceSidebarItem[]): readonly WorkspaceActivityRow[] {
    return items.map(row)
  }

  function pageRows(
    prior: WorkspaceActivityWorkspacePage,
    pageItems: readonly WorkspaceSidebarItem[],
    cursor: WorkspaceSidebarCursor | null,
    append: boolean,
    limitReached: boolean,
    includedPins: readonly WorkspaceSidebarItem[],
    revisions: Pick<WorkspaceSidebarPage, 'revision' | 'displayNamesRevision' | 'organizationRevision'>,
  ): WorkspaceActivityWorkspacePage {
    const page = mapRows(pageItems)
    const items = append ? [...prior.items, ...page] : [...page]
    return {
      status: 'ready',
      items,
      includedPins: mapRows(includedPins),
      revision: revisions.revision,
      displayNamesRevision: revisions.displayNamesRevision,
      organizationRevision: revisions.organizationRevision,
      nextCursor: cursor,
      hasMore: cursor !== null,
      limitReached,
      error: null,
    }
  }

  function validateWorkspaceResponse(
    value: unknown,
    input: {
      readonly organization: SidebarOrganization
      readonly sortBy: WorkspaceActivitySortBy
      readonly locale: SidebarLocale
    },
    requestedPinIds: readonly string[],
    existingIds: readonly string[],
  ) {
    const page = validateWorkspacePage(value, input)
    const requested = new Set(requestedPinIds)
    if (page.includedItems.some((item) => !requested.has(item.workspace.id)))
      throw new CommandError('INVALID_OUTPUT', 'Workspace sidebar returned an unrequested pinned row')
    const prior = new Set(existingIds)
    if (page.items.some((item) => prior.has(item.workspace.id)))
      throw new CommandError('INVALID_OUTPUT', 'Workspace sidebar page repeats an earlier row')
    return page
  }

  async function executeWorkspacePage(
    task: ActivityQueryTask,
    input: { readonly cursor?: WorkspaceSidebarCursor; readonly append: boolean; readonly staleRetry: number },
    execution?: ExecuteOptions,
  ): Promise<void> {
    const isCurrent = () =>
      alive() && workspaceTask === task && task.generation === workspaceGeneration && !task.controller.signal.aborted
    if (!isCurrent()) return
    const snapshot = current()
    if (snapshot.organization === 'time') return
    const query = {
      organization: snapshot.organization,
      sortBy: snapshot.sortBy,
      locale: snapshot.locale,
    }
    const sortBy = snapshot.sortBy
    const prior = snapshot.workspaces
    const requestedPinIds = workspacePinIds()
    const remaining = Math.max(0, WORKSPACE_ROW_LIMIT - (input.append ? prior.items.length : 0))
    if (remaining === 0) {
      replace({
        ...snapshot,
        workspaces: { ...prior, status: 'ready', hasMore: prior.nextCursor !== null, limitReached: true },
      })
      return
    }
    const queryInput = {
      organization: query.organization,
      sortBy,
      locale: query.locale,
      limit: Math.min(PAGE_SIZE, remaining),
      includeWorkspaceIds: requestedPinIds,
      ...(input.cursor ? { cursor: input.cursor } : {}),
    }
    const removeAbort = linkSignal(task.controller, execution?.signal)
    try {
      const value = await options.queries.execute('workspace.sidebar.list', queryInput, {
        signal: task.controller.signal,
      })
      if (!isCurrent()) return
      const page = validateWorkspaceResponse(
        value,
        query,
        requestedPinIds,
        input.append ? prior.items.map((item) => item.workspaceId) : [],
      )
      const rows = pageRows(
        prior,
        page.items,
        page.nextCursor,
        input.append,
        (input.append ? prior.items.length : 0) + page.items.length >= WORKSPACE_ROW_LIMIT && page.nextCursor !== null,
        [...page.items, ...page.includedItems].filter((item) => requestedPinIds.includes(item.workspace.id)),
        page,
      )
      projectWorkspacePage(rows, [...page.items, ...page.includedItems])
      replace({
        ...current(),
        workspaces: rows,
        preferenceStatus: current().preferenceStatus === 'submitting' ? 'ready' : current().preferenceStatus,
      })
    } catch (reason) {
      if (!isCurrent()) return
      if (errorCode(reason) === 'STALE_CURSOR' && input.cursor && input.staleRetry === 0) {
        await executeWorkspacePage(task, { append: false, staleRetry: 1 }, execution)
        return
      }
      const error = errorCode(reason)
      replace({
        ...current(),
        preferenceStatus: current().preferenceStatus === 'submitting' ? 'ready' : current().preferenceStatus,
        workspaces: { ...current().workspaces, status: 'error', error, nextCursor: null, hasMore: false },
      })
    } finally {
      removeAbort()
    }
  }

  async function refreshWorkspacePage(execution?: ExecuteOptions): Promise<void> {
    if (
      current().organization === 'time' ||
      current().preferenceStatus === 'loading' ||
      current().preferenceError !== null
    )
      return
    abortWorkspaceTask()
    const controller = new AbortController()
    const task = { controller, generation: workspaceGeneration }
    workspaceTask = task
    const prior = current().workspaces
    replace({ ...current(), workspaces: { ...prior, status: 'loading', error: null } })
    await executeWorkspacePage(task, { append: false, staleRetry: 0 }, execution)
    if (workspaceTask === task) workspaceTask = null
    flushInvalidationAfterRead()
  }

  async function executeTimelinePage(
    task: ActivityQueryTask,
    input: {
      readonly cursor?: SessionActivityGlobalCursor
      readonly append: boolean
      readonly staleRetry: number
      readonly limit?: number
      readonly refreshing?: boolean
    },
    execution?: ExecuteOptions,
  ): Promise<void> {
    const isCurrent = () =>
      alive() &&
      current().organization === 'time' &&
      timelineTask === task &&
      task.generation === timelineGeneration &&
      !task.controller.signal.aborted
    if (!isCurrent()) return
    const prior = current().timeline
    const baseItems = input.append ? prior.items : []
    const requestedLimit = Math.min(input.limit ?? PAGE_SIZE, Math.max(0, SESSION_ROW_LIMIT - baseItems.length))
    if (requestedLimit === 0) {
      replace({
        ...current(),
        timeline: { ...prior, status: 'ready', hasMore: prior.nextCursor !== null, limitReached: true },
      })
      return
    }
    const removeAbort = linkSignal(task.controller, execution?.signal)
    try {
      const value = await options.queries.execute(
        'session.activity.global.list',
        { limit: requestedLimit, ...(input.cursor ? { cursor: input.cursor } : {}) },
        { signal: task.controller.signal },
      )
      if (!isCurrent()) return
      const page = validateGlobalSessionPage(value)
      if (
        input.cursor &&
        (page.revision !== input.cursor.revision ||
          page.displayNamesRevision !== input.cursor.displayNamesRevision ||
          page.organizationRevision !== input.cursor.organizationRevision)
      )
        throw new CommandError('INVALID_OUTPUT', 'Global Session activity revisions changed across a cursor')
      if (page.items.some((item) => item.session.archived))
        throw new CommandError('INVALID_OUTPUT', 'Global Session activity contains an archived Session')
      const previousIds = new Set(baseItems.map((item) => item.sessionId))
      if (page.items.some((item) => previousIds.has(item.session.id)))
        throw new CommandError('INVALID_OUTPUT', 'Global Session activity page repeats an earlier Session')
      const nextWorkspaceIds = new Set([
        ...baseItems.map((item) => item.workspaceId),
        ...page.items.map((item) => item.workspace.id),
      ])
      // Reserve the full pin allowance so Time cannot consume another owner's Workspace budget.
      if (nextWorkspaceIds.size > MAX_RETAINED_ACTIVITY_WORKSPACES - MAX_PINNED_WORKSPACES) {
        replace({ ...current(), timeline: { ...prior, status: 'ready', limitReached: true, error: null } })
        return
      }
      const items: readonly WorkspaceActivityTimelineRow[] = [
        ...baseItems,
        ...page.items.map((item) => ({
          sessionId: item.session.id,
          workspaceId: item.session.workspaceId,
          displayName: item.displayName,
          execution: item.execution,
          agentChildCount: item.agentChildCount ?? 0,
        })),
      ]
      const nextTimeline: WorkspaceActivityTimelinePage = {
        status: 'ready',
        items,
        revision: page.revision,
        displayNamesRevision: page.displayNamesRevision,
        organizationRevision: page.organizationRevision,
        nextCursor: page.nextCursor,
        hasMore: page.nextCursor !== null,
        limitReached: items.length >= SESSION_ROW_LIMIT && page.nextCursor !== null,
        stale: false,
        error: null,
      }
      const projected = projectTimelinePage(
        nextTimeline,
        page.items.map((item) => item.session),
      )
      const canonicalById = new Map(projected.map((item) => [item.id, item]))
      const projectionChanged = page.items.some((item) => {
        const canonical = canonicalById.get(item.session.id)
        return (
          !canonical ||
          canonical.workspaceId !== item.session.workspaceId ||
          canonical.seq !== item.session.seq ||
          canonical.updatedAt !== item.session.updatedAt
        )
      })
      if (projectionChanged) {
        if (input.staleRetry === 0) {
          await executeTimelinePage(task, { append: false, staleRetry: 1 }, execution)
          return
        }
        throw new CommandError('QUERY_SUPERSEDED', 'Global Session activity no longer matches the Directory projection')
      }
      projectTimelineWorkspaces(nextTimeline, page.items)
      for (const item of projected) rememberSession(item)
      replace({
        ...current(),
        timeline: {
          ...nextTimeline,
          status: input.refreshing ? 'loading' : nextTimeline.status,
          stale: input.refreshing ?? false,
        },
      })
    } catch (reason) {
      if (!isCurrent()) return
      if (errorCode(reason) === 'STALE_CURSOR' && input.cursor && input.staleRetry === 0) {
        await executeTimelinePage(task, { append: false, staleRetry: 1 }, execution)
        return
      }
      const error = errorCode(reason)
      const currentPage = current().timeline
      replace({
        ...current(),
        timeline: {
          ...currentPage,
          status: 'error',
          stale: currentPage.items.length > 0 || currentPage.stale,
          error,
          nextCursor: null,
          hasMore: false,
        },
      })
    } finally {
      removeAbort()
    }
  }

  async function refreshTimelinePage(execution?: ExecuteOptions): Promise<void> {
    if (current().organization !== 'time') return
    abortTimelineTask()
    const controller = new AbortController()
    const task = { controller, generation: timelineGeneration }
    timelineTask = task
    const targetCount = Math.min(SESSION_ROW_LIMIT, current().timeline.items.length)
    replace({ ...current(), timeline: { ...current().timeline, status: 'loading', stale: true, error: null } })
    await executeTimelinePage(
      task,
      {
        append: false,
        staleRetry: 0,
        limit: Math.min(200, Math.max(PAGE_SIZE, targetCount)),
        refreshing: true,
      },
      execution,
    )
    while (
      timelineTask === task &&
      !task.controller.signal.aborted &&
      current().timeline.status !== 'error' &&
      !current().timeline.limitReached &&
      current().timeline.hasMore &&
      current().timeline.items.length < targetCount
    ) {
      const page = current().timeline
      await executeTimelinePage(
        task,
        {
          ...(page.nextCursor ? { cursor: page.nextCursor } : {}),
          append: true,
          staleRetry: 0,
          limit: Math.min(200, targetCount - page.items.length),
          refreshing: true,
        },
        execution,
      )
    }
    if (timelineTask === task && current().timeline.status !== 'error') {
      const page = current().timeline
      replace({ ...current(), timeline: { ...page, status: 'ready', stale: false } })
      projectTimelineWorkspaces(current().timeline)
    }
    if (timelineTask === task) timelineTask = null
    flushInvalidationAfterRead()
  }

  function applySessionFacts(
    workspaceId: string,
    page: WorkspaceActivitySessionPage,
    sessions: readonly Session[],
  ): void {
    const sessionById = new Map(sessions.map((item) => [item.id, item]))
    const currentSessions = options.directory.getSnapshot().sessions
    const nextIds = page.sessionIds
      .filter((id) => {
        const item = sessionById.get(id) ?? currentSessions[id]
        return item !== undefined && item.workspaceId === workspaceId && !item.archived
      })
      .sort((leftId, rightId) => {
        const left = sessionById.get(leftId) ?? currentSessions[leftId]
        const right = sessionById.get(rightId) ?? currentSessions[rightId]
        if (!left || !right) return compareIds(leftId, rightId)
        const leftTimestamp = page.sortBy === 'createdAt' ? left.createdAt : left.updatedAt
        const rightTimestamp = page.sortBy === 'createdAt' ? right.createdAt : right.updatedAt
        return rightTimestamp - leftTimestamp || compareIds(left.id, right.id)
      })
    const execution = Object.fromEntries(
      nextIds.flatMap((id) => (page.execution[id] ? [[id, page.execution[id]]] : [])),
    )
    updateSessionPage(workspaceId, { ...page, sessionIds: nextIds, execution })
  }

  async function executeSessionPage(
    task: ActivityQueryTask,
    workspaceId: string,
    input: {
      readonly cursor?: SessionActivityCursor
      readonly append: boolean
      readonly staleRetry: number
      readonly limit?: number
    },
    execution?: ExecuteOptions,
  ): Promise<void> {
    const isCurrent = () =>
      alive() &&
      sessionTasks.get(workspaceId) === task &&
      task.generation === (sessionGenerations.get(workspaceId) ?? 0) &&
      !task.controller.signal.aborted
    if (!isCurrent()) return
    const snapshot = current()
    const prior = snapshot.sessions[workspaceId]
    const baseIds = input.append ? (prior?.sessionIds ?? []) : []
    const requestedLimit = sessionLimitForPage(workspaceId, input.limit ?? PAGE_SIZE, input.append)
    if (requestedLimit === 0) {
      const page: WorkspaceActivitySessionPage = {
        status: 'ready',
        sortBy: snapshot.sortBy,
        sessionIds: prior?.sessionIds ?? [],
        execution: prior?.execution ?? {},
        nextCursor: prior?.nextCursor ?? null,
        hasMore: prior?.nextCursor !== null && prior?.nextCursor !== undefined,
        limitReached: true,
        error: null,
      }
      updateSessionPage(workspaceId, page)
      return
    }
    const fence = createSessionProjectionFence(
      workspaceId,
      Object.values(options.directory.getSnapshot().sessions),
      options.subscribeConfirmedSessions,
    )
    const removeAbort = linkSignal(task.controller, execution?.signal)
    try {
      const value = await options.queries.execute(
        'session.sidebar.list',
        {
          workspaceId,
          sortBy: snapshot.sortBy,
          limit: requestedLimit,
          ...(input.cursor ? { cursor: input.cursor } : {}),
        },
        { signal: task.controller.signal },
      )
      if (!isCurrent()) return
      const sidebarPage = sessionSidebarPageSchema.parse(value)
      const page = sessionActivityPageSchema.parse({
        ...sidebarPage,
        items: sidebarPage.items.map((item) => item.session),
      })
      validateSessionPage(page, workspaceId, snapshot.sortBy)
      for (const { execution } of sidebarPage.items) {
        if (
          (execution.activeCount === 0) !== (execution.state === 'idle') ||
          execution.queuedCount > execution.activeCount
        )
          throw new CommandError('INVALID_OUTPUT', 'Session execution summary is inconsistent')
      }
      const filtered = fence.filter(page.items)
      if (fence.overflow || filtered.length !== page.items.length) {
        if (input.staleRetry === 0) {
          await executeSessionPage(task, workspaceId, { append: false, staleRetry: 1 }, execution)
          return
        }
        throw new CommandError('QUERY_SUPERSEDED', 'Session activity changed while it was being read')
      }
      const duplicate = new Set(baseIds)
      if (filtered.some((item) => duplicate.has(item.id)))
        throw new CommandError('INVALID_OUTPUT', 'Session activity page repeats an earlier row')
      const canonicalBeforeProjection = options.directory.getSnapshot().sessions
      const retainedBaseIds = baseIds.filter((id) => {
        const item = canonicalBeforeProjection[id]
        return item !== undefined && item.workspaceId === workspaceId && !item.archived
      })
      const combinedIds = [...retainedBaseIds, ...filtered.map((item) => item.id)]
      const pages = { ...current().sessions }
      pages[workspaceId] = {
        status: 'ready',
        sortBy: snapshot.sortBy,
        sessionIds: combinedIds,
        execution: {
          ...(input.append ? prior?.execution : {}),
          ...Object.fromEntries(sidebarPage.items.map((item) => [item.session.id, item.execution])),
        },
        agentChildCounts: {
          ...(input.append ? prior?.agentChildCounts : {}),
          ...Object.fromEntries(sidebarPage.items.map((item) => [item.session.id, item.agentChildCount ?? 0])),
        },
        nextCursor: page.nextCursor,
        hasMore: page.nextCursor !== null,
        limitReached: combinedIds.length >= SESSION_ROW_LIMIT && page.nextCursor !== null,
        error: null,
      }
      const projected = projectSessionPage(pages, filtered)
      const projectedById = new Map(projected.map((item) => [item.id, item]))
      if (projected.length !== filtered.length) {
        if (input.staleRetry === 0) {
          await executeSessionPage(task, workspaceId, { append: false, staleRetry: 1 }, execution)
          return
        }
        throw new CommandError('QUERY_SUPERSEDED', 'Session activity no longer matches the Directory projection')
      }
      const projectedIds = [
        ...retainedBaseIds,
        ...filtered.map((item) => item.id).filter((id) => projectedById.has(id)),
      ]
      pages[workspaceId] = { ...pages[workspaceId]!, sessionIds: projectedIds }
      for (const item of projected) rememberSession(item)
      applySessionFacts(workspaceId, pages[workspaceId]!, projected)
    } catch (reason) {
      if (!isCurrent()) return
      if (errorCode(reason) === 'STALE_CURSOR' && input.cursor && input.staleRetry === 0) {
        await executeSessionPage(task, workspaceId, { append: false, staleRetry: 1 }, execution)
        return
      }
      const error = errorCode(reason)
      const priorPage = current().sessions[workspaceId]
      updateSessionPage(workspaceId, {
        status: 'error',
        sortBy: current().sortBy,
        sessionIds: priorPage?.sessionIds ?? [],
        execution: {},
        nextCursor: null,
        hasMore: false,
        limitReached: priorPage?.limitReached ?? false,
        error,
      })
    } finally {
      fence.dispose()
      removeAbort()
    }
  }

  function rememberSession(item: Session): void {
    changedSessionFacts.delete(item.id)
    changedSessionFacts.set(item.id, {
      workspaceId: item.workspaceId,
      seq: item.seq,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      archived: item.archived,
    })
    const retained = new Set(retainedSessionIds(current().sessions))
    while (changedSessionFacts.size > DIRECTORY_FACT_CACHE_LIMIT) {
      const candidate = [...changedSessionFacts.keys()].find((id) => !retained.has(id))
      if (candidate === undefined) break
      changedSessionFacts.delete(candidate)
    }
  }

  async function refreshSessionPage(workspaceId: string, execution?: ExecuteOptions): Promise<void> {
    if (current().preferenceStatus === 'loading' || current().preferenceError !== null) return
    const pages = { ...current().sessions }
    const existing = pages[workspaceId]
    if (!existing && Object.keys(pages).length >= SESSION_GROUP_LIMIT) {
      throw new CommandError('CAPACITY_EXCEEDED', 'Too many expanded Workspace session groups')
    }
    abortSessionTask(workspaceId)
    const generation = sessionGenerations.get(workspaceId) ?? 0
    const controller = new AbortController()
    const task = { controller, generation }
    sessionTasks.set(workspaceId, task)
    const loadingPage: WorkspaceActivitySessionPage = {
      status: 'loading',
      sortBy: current().sortBy,
      sessionIds: existing?.sessionIds ?? [],
      execution: existing?.execution ?? {},
      nextCursor: existing?.nextCursor ?? null,
      hasMore: existing?.hasMore ?? false,
      limitReached: existing?.limitReached ?? false,
      error: null,
    }
    pages[workspaceId] = loadingPage
    projectSessionPage(pages, [])
    replace({ ...current(), sessions: pages })
    const targetCount = Math.max(PAGE_SIZE, existing?.sessionIds.length ?? 0)
    await executeSessionPage(
      task,
      workspaceId,
      { append: false, staleRetry: 0, limit: Math.min(200, targetCount) },
      execution,
    )
    let pagesRead = 1
    while (
      sessionTasks.get(workspaceId) === task &&
      !controller.signal.aborted &&
      pagesRead <= Math.ceil(SESSION_ROW_LIMIT / PAGE_SIZE)
    ) {
      const page = current().sessions[workspaceId]
      if (
        !page ||
        page.status === 'error' ||
        page.limitReached ||
        !page.nextCursor ||
        page.sessionIds.length >= targetCount
      )
        break
      pagesRead++
      await executeSessionPage(
        task,
        workspaceId,
        {
          cursor: page.nextCursor,
          append: true,
          staleRetry: 0,
          limit: Math.min(200, targetCount - page.sessionIds.length),
        },
        execution,
      )
    }
    if (sessionTasks.get(workspaceId) === task) sessionTasks.delete(workspaceId)
  }

  async function loadMoreWorkspacePage(execution?: ExecuteOptions): Promise<'ready' | 'error' | 'limitReached'> {
    if (current().organization === 'time')
      throw new CommandError('INVALID_INPUT', 'Workspace paging is unavailable in Time mode')
    const page = current().workspaces
    if (page.status === 'loading') throw new CommandError('BUSY', 'Workspace activity is already loading')
    if (!page.nextCursor) return pageResult(page.limitReached ? 'limitReached' : 'ready', page.error).status
    if (page.items.length >= WORKSPACE_ROW_LIMIT) {
      replace({ ...current(), workspaces: { ...page, limitReached: true } })
      return 'limitReached'
    }
    abortWorkspaceTask()
    const controller = new AbortController()
    const task = { controller, generation: workspaceGeneration }
    workspaceTask = task
    replace({ ...current(), workspaces: { ...page, status: 'loading', error: null } })
    await executeWorkspacePage(task, { cursor: page.nextCursor, append: true, staleRetry: 0 }, execution)
    if (workspaceTask === task) workspaceTask = null
    flushInvalidationAfterRead()
    return current().workspaces.status === 'error'
      ? 'error'
      : current().workspaces.limitReached
        ? 'limitReached'
        : 'ready'
  }

  async function loadMoreSessionPage(
    workspaceId: string,
    execution?: ExecuteOptions,
  ): Promise<'ready' | 'error' | 'limitReached'> {
    if (current().organization === 'time')
      throw new CommandError('INVALID_INPUT', 'Grouped Session paging is unavailable in Time mode')
    const page = current().sessions[workspaceId]
    if (!page) throw new CommandError('NOT_LOADED', 'Load the Workspace session page before paging it')
    if (page.status === 'loading') throw new CommandError('BUSY', 'Session activity is already loading')
    if (!page.nextCursor) return pageResult(page.limitReached ? 'limitReached' : 'ready', page.error).status
    const requested = sessionLimitForPage(workspaceId, PAGE_SIZE, true)
    if (requested === 0) {
      updateSessionPage(workspaceId, { ...page, limitReached: true })
      return 'limitReached'
    }
    abortSessionTask(workspaceId)
    const controller = new AbortController()
    const task = { controller, generation: sessionGenerations.get(workspaceId) ?? 0 }
    sessionTasks.set(workspaceId, task)
    updateSessionPage(workspaceId, { ...page, status: 'loading', error: null })
    await executeSessionPage(task, workspaceId, { cursor: page.nextCursor, append: true, staleRetry: 0 }, execution)
    if (sessionTasks.get(workspaceId) === task) sessionTasks.delete(workspaceId)
    const currentPage = current().sessions[workspaceId]
    return currentPage?.status === 'error' ? 'error' : currentPage?.limitReached ? 'limitReached' : 'ready'
  }

  async function loadMoreTimelinePage(execution?: ExecuteOptions): Promise<'ready' | 'error' | 'limitReached'> {
    if (current().organization !== 'time')
      throw new CommandError('INVALID_INPUT', 'Timeline paging is only available in Time mode')
    const page = current().timeline
    if (page.status === 'loading') throw new CommandError('BUSY', 'Global Timeline activity is already loading')
    if (page.limitReached) return 'limitReached'
    if (page.stale) {
      await refreshTimelinePage(execution)
      return current().timeline.status === 'error' ? 'error' : 'ready'
    }
    if (!page.nextCursor) return pageResult(page.limitReached ? 'limitReached' : 'ready', page.error).status
    if (page.items.length >= SESSION_ROW_LIMIT) {
      replace({ ...current(), timeline: { ...page, limitReached: true } })
      return 'limitReached'
    }
    abortTimelineTask()
    const controller = new AbortController()
    const task = { controller, generation: timelineGeneration }
    timelineTask = task
    replace({ ...current(), timeline: { ...page, status: 'loading', error: null } })
    await executeTimelinePage(task, { cursor: page.nextCursor, append: true, staleRetry: 0 }, execution)
    if (timelineTask === task) timelineTask = null
    flushInvalidationAfterRead()
    const result = current().timeline
    return result.status === 'error' ? 'error' : result.limitReached ? 'limitReached' : 'ready'
  }

  function resetForSortChange(sortBy: WorkspaceActivitySortBy): void {
    if (current().organization === 'time') {
      replace({ ...current(), sortBy, preferenceStatus: 'ready', preferenceError: null })
      return
    }
    abortWorkspaceTask()
    for (const workspaceId of sessionTasks.keys()) abortSessionTask(workspaceId)
    const next: WorkspaceActivityState = {
      ...current(),
      sortBy,
      preferenceStatus: 'submitting',
      preferenceError: null,
      workspaces: { ...emptyWorkspacePage, status: 'loading' },
      sessions: {},
    }
    replace(next)
    projectWorkspacePage(next.workspaces, [])
    projectSessionPage({}, [])
  }

  async function setSort(
    sortBy: WorkspaceActivitySortBy,
    execution: ExecuteOptions,
  ): Promise<{ sortBy: WorkspaceActivitySortBy; persisted: boolean }> {
    const saved = await writeOrganizationPreference((stored) => ({ ...stored, sortBy, projectOrder: [] }), execution)
    const changedSort = current().sortBy !== saved.sortBy
    applyOrganizationPreference(saved, false)
    if (changedSort) resetForSortChange(saved.sortBy)
    if (current().organization !== 'time') await refreshWorkspacePage(execution)
    replace({ ...current(), preferenceStatus: 'ready', preferenceError: null })
    return { sortBy: current().sortBy, persisted: options.preferences.getSnapshot().persisted }
  }

  async function runBounded<Value>(
    items: readonly Value[],
    concurrency: number,
    worker: (item: Value) => Promise<void>,
  ): Promise<void> {
    let next = 0
    const count = Math.min(concurrency, items.length)
    await Promise.all(
      Array.from({ length: count }, async () => {
        while (next < items.length) {
          const index = next++
          const item = items[index]
          if (item !== undefined) await worker(item)
        }
      }),
    )
  }

  function organizationPreferenceFor(
    stored: SidebarPreference,
    target: WorkspaceActivityOrganization,
  ): SidebarPreference {
    return {
      ...stored,
      organization: target,
      projectOrder: target === 'recentProject' ? stored.projectOrder : [],
      previousGroupedOrganization:
        target === 'time'
          ? stored.organization === 'time'
            ? stored.previousGroupedOrganization
            : stored.organization
          : target,
    }
  }

  function applyOrganizationPreference(preference: SidebarPreference, refreshChangedMode: boolean): boolean {
    const before = current()
    const changedMode = before.organization !== preference.organization
    const clearActivityProjection =
      changedMode && (before.organization === 'time' || preference.organization === 'time')
    if (changedMode) {
      abortWorkspaceTask()
      abortTimelineTask()
      for (const workspaceId of sessionTasks.keys()) abortSessionTask(workspaceId)
    }
    const next: WorkspaceActivityState = {
      ...before,
      organization: preference.organization,
      previousGroupedOrganization: preference.previousGroupedOrganization,
      projectOrder: preference.projectOrder,
      organizationPreferenceStatus: 'ready',
      organizationPreferenceError: null,
      ...(clearActivityProjection
        ? {
            sessions: {},
            timeline:
              preference.organization === 'time'
                ? { ...emptyTimelinePage, status: 'loading' as const }
                : emptyTimelinePage,
          }
        : {}),
      ...(changedMode
        ? {
            workspaces: {
              ...emptyWorkspacePage,
              status: preference.organization === 'time' ? ('idle' as const) : ('loading' as const),
            },
          }
        : {}),
    }
    replace(next)
    if (clearActivityProjection) projectSessionPage(next.sessions, [])
    if (changedMode) {
      if (preference.organization === 'time') projectTimelineWorkspaces(next.timeline)
      else projectWorkspacePage(next.workspaces, [])
    }
    if (refreshChangedMode && changedMode) {
      if (preference.organization === 'time') void refreshTimelinePage().catch(options.onSubscriberError)
      else void refreshWorkspacePage().catch(options.onSubscriberError)
    }
    return changedMode
  }

  async function writeOrganizationPreference(
    update: (stored: SidebarPreference) => SidebarPreference,
    execution?: ExecuteOptions,
  ): Promise<SidebarPreference> {
    if (!alive()) throw new CommandError('DISPOSED', 'Workspace activity owner was disposed')
    await ready
    if (
      organizationWriteInProgress ||
      current().organizationPreferenceStatus === 'loading' ||
      current().organizationPreferenceStatus === 'saving'
    )
      throw new CommandError('BUSY', 'Workspace organization preferences are not ready')
    replace({ ...current(), organizationPreferenceStatus: 'saving', organizationPreferenceError: null })
    organizationWriteInProgress = true
    let savedPreference: SidebarPreference | null = null
    try {
      for (let attempt = 0; attempt < 3 && !savedPreference; attempt++) {
        const preference = options.preferences.getSnapshot()
        if (preference.restoreError)
          throw new CommandError(
            'PERSISTENCE_RESTORE_FAILED',
            'Restore device preferences before changing organization',
          )
        const stored = persistedOrganization(preference)
        const requested = sidebarPreferenceSchema.parse(update(stored))
        if (sameSidebarPreference(stored, requested)) {
          savedPreference = requested
          break
        }
        try {
          await options.preferenceCommands.execute(
            'preferences.set',
            { key: ORGANIZATION_PREFERENCE_KEY, value: requested, expectedRevision: preference.revision },
            execution,
          )
        } catch (reason) {
          const code = errorCode(reason)
          let refreshed: ClientPreferencesState | null = null
          try {
            refreshed = await options.refreshPreferences()
          } catch {
            // The write can only be reconciled by reading the committed preference.
          }
          if (refreshed) {
            const observed = persistedOrganization(refreshed)
            if (sameSidebarPreference(observed, requested)) {
              savedPreference = observed
              break
            }
          }
          if (code === 'COMMAND_CONFLICT' && attempt < 2) continue
          throw reason
        }
        const updated = options.preferences.getSnapshot()
        const observed = persistedOrganization(updated)
        if (!sameSidebarPreference(observed, requested))
          throw new CommandError('RESULT_UNKNOWN', 'Saved Workspace organization did not match the request')
        savedPreference = observed
      }
      if (!savedPreference) throw new CommandError('COMMAND_CONFLICT', 'Workspace organization changed repeatedly')
    } catch (reason) {
      const error = errorCode(reason)
      replace({ ...current(), organizationPreferenceStatus: 'error', organizationPreferenceError: error })
      throw reason
    } finally {
      organizationWriteInProgress = false
    }
    return savedPreference
  }

  async function setOrganization(target: WorkspaceActivityOrganization, execution?: ExecuteOptions) {
    const savedPreference = await writeOrganizationPreference(
      (stored) => organizationPreferenceFor(stored, target),
      execution,
    )
    if (current().sortBy !== savedPreference.sortBy) resetForSortChange(savedPreference.sortBy)
    applyOrganizationPreference(savedPreference, false)
    await refresh({}, execution)
    return {
      organization: current().organization,
      previousGroupedOrganization: current().previousGroupedOrganization,
      persisted: options.preferences.getSnapshot().persisted,
    }
  }

  async function toggleTime(execution?: ExecuteOptions) {
    await ready
    const snapshot = current()
    const target = snapshot.organization === 'time' ? snapshot.previousGroupedOrganization : 'time'
    return setOrganization(target, execution)
  }

  async function moveProject(input: z.output<typeof moveProjectInput>, execution?: ExecuteOptions) {
    const saved = await writeOrganizationPreference((stored) => {
      const snapshot = current()
      if (
        stored.organization !== 'recentProject' ||
        snapshot.organization !== 'recentProject' ||
        stored.sortBy !== input.expectedSortBy ||
        snapshot.sortBy !== input.expectedSortBy ||
        snapshot.workspaces.status !== 'ready'
      )
        throw new CommandError('COMMAND_CONFLICT', 'The project view changed before the move')
      const pins = options.pins.getSnapshot()
      const order = orderWorkspaceActivityIds(
        { ...snapshot, projectOrder: stored.projectOrder },
        pins,
        options.hiddenWorkspaceIds?.() ?? [],
      )
      if (
        !sameProjectOrder(order, input.expectedOrder) ||
        !order.includes(input.sourceWorkspaceId) ||
        !order.includes(input.targetWorkspaceId)
      )
        throw new CommandError('COMMAND_CONFLICT', 'The visible project order changed before the move')
      const pinned = new Set(pins.ids)
      if (pinned.has(input.sourceWorkspaceId) !== pinned.has(input.targetWorkspaceId))
        throw new CommandError('INVALID_INPUT', 'Pin or unpin a project to move it between sections')
      return {
        ...stored,
        projectOrder: moveProjectInOrder(order, input.sourceWorkspaceId, input.targetWorkspaceId, input.placement),
      }
    }, execution)
    applyOrganizationPreference(saved, false)
    return pageResult('ready')
  }

  async function setLocale(locale: SidebarLocale, execution?: ExecuteOptions): Promise<{ locale: SidebarLocale }> {
    if (!alive()) throw new CommandError('DISPOSED', 'Workspace activity owner was disposed')
    await ready
    if (current().locale === locale) return { locale }
    abortWorkspaceTask()
    const prior = current()
    replace({
      ...prior,
      locale,
      ...(prior.organization === 'time'
        ? {}
        : { workspaces: { ...prior.workspaces, status: 'loading' as const, error: null } }),
    })
    if (current().organization !== 'time' && sidebarConnected) await refreshWorkspacePage(execution)
    return { locale: current().locale }
  }

  async function refresh(input: z.output<typeof refreshInput>, execution?: ExecuteOptions): Promise<'ready' | 'error'> {
    if (!(await prepareExplicitRefresh())) return 'error'
    if (input.workspaceId) {
      await refreshSessionPage(input.workspaceId, execution)
      return current().sessions[input.workspaceId]?.status === 'error' ? 'error' : 'ready'
    }
    visibleRefreshInProgress = true
    try {
      if (current().organization === 'time') {
        await refreshTimelinePage(execution)
        return current().timeline.status === 'error' ? 'error' : 'ready'
      }
      const tracked = Object.keys(current().sessions)
      const workspaceRead = refreshWorkspacePage(execution)
      const sessionErrors: string[] = []
      await Promise.all([
        workspaceRead,
        runBounded(tracked, MAX_PARALLEL_REFRESHES, async (workspaceId) => {
          await refreshSessionPage(workspaceId, execution)
          const error = current().sessions[workspaceId]?.error
          if (error) sessionErrors.push(error)
        }),
      ])
      return current().workspaces.status === 'error' || sessionErrors.length > 0 ? 'error' : 'ready'
    } finally {
      visibleRefreshInProgress = false
      if (invalidationDuringRead) {
        invalidationDuringRead = false
        queueVisibleActivityRefresh()
      }
    }
  }

  async function prepareExplicitRefresh(): Promise<boolean> {
    await ready
    if (!alive()) return false
    const before = current()
    if (before.preferenceError === null && before.organizationPreferenceError === null)
      return before.preferenceStatus !== 'loading' && before.organizationPreferenceStatus !== 'loading'
    preferenceRefreshInProgress = true
    organizationRefreshInProgress = true
    try {
      const preferences = await options.refreshPreferences()
      if (!alive()) return false
      const sortBy = persistedSort(preferences)
      if (sortBy !== current().sortBy) resetForSortChange(sortBy)
      applyOrganizationPreference(persistedOrganization(preferences), false)
      replace({
        ...current(),
        sortBy,
        preferenceStatus: 'ready',
        preferenceError: null,
        organizationPreferenceStatus: 'ready',
        organizationPreferenceError: null,
      })
      return true
    } catch (reason) {
      const error = errorCode(reason)
      replace({
        ...current(),
        preferenceStatus: 'error',
        preferenceError: error,
        organizationPreferenceStatus: 'error',
        organizationPreferenceError: error,
      })
      return false
    } finally {
      preferenceRefreshInProgress = false
      organizationRefreshInProgress = false
    }
  }

  function updateRowsFromSession(item: Session): void {
    if (item.archived) return
    const update = (items: readonly WorkspaceActivityRow[]) =>
      items.map((existing) => {
        if (existing.workspaceId !== item.workspaceId) return existing
        const latestSessionCreatedAt = Math.max(existing.latestSessionCreatedAt ?? 0, item.createdAt)
        const latestSessionUpdatedAt = Math.max(existing.latestSessionUpdatedAt ?? 0, item.updatedAt)
        return latestSessionCreatedAt === existing.latestSessionCreatedAt &&
          latestSessionUpdatedAt === existing.latestSessionUpdatedAt
          ? existing
          : { ...existing, latestSessionCreatedAt, latestSessionUpdatedAt }
      })
    const page = current().workspaces
    const nextRows = update(page.items)
    const nextPins = update(page.includedPins)
    const changed =
      nextRows.some((row, index) => row !== page.items[index]) ||
      nextPins.some((row, index) => row !== page.includedPins[index])
    if (!changed) return
    const sortRows = (items: readonly WorkspaceActivityRow[]) =>
      current().organization === 'project'
        ? items
        : [...items].sort((a, b) => compareRecentRows(a, b, current().sortBy))
    replace({
      ...current(),
      workspaces: { ...page, items: sortRows(nextRows), includedPins: sortRows(nextPins) },
    })
  }

  function queueInvalidation(workspaceId: string, refreshWorkspace: boolean, refreshSessions: boolean): void {
    if (current().organization === 'time') {
      queueVisibleActivityRefresh()
      return
    }
    if (refreshWorkspace) pendingWorkspaceRefresh = true
    if (refreshSessions && current().sessions[workspaceId]) pendingSessionRefreshes.add(workspaceId)
    if (invalidationScheduled) return
    invalidationScheduled = true
    queueMicrotask(() => {
      invalidationScheduled = false
      if (!alive()) return
      const refreshWorkspace = pendingWorkspaceRefresh
      pendingWorkspaceRefresh = false
      const sessionIds = [...pendingSessionRefreshes]
      pendingSessionRefreshes.clear()
      if (refreshWorkspace && current().workspaces.status !== 'idle')
        void refreshWorkspacePage().catch(options.onSubscriberError)
      for (const workspaceId of sessionIds) void refreshSessionPage(workspaceId).catch(options.onSubscriberError)
    })
  }

  function queueVisibleActivityRefresh(): void {
    if (!alive()) return
    if (current().organization === 'time') {
      const timeline = current().timeline
      replace({ ...current(), timeline: { ...timeline, stale: true } })
      if (timeline.status === 'idle') return
    } else {
      const workspaces = current().workspaces
      if (workspaces.status === 'idle') return
      replace({ ...current(), workspaces: { ...workspaces, status: 'loading', error: null } })
    }
    if (!sidebarConnected) return
    if (
      visibleRefreshInProgress ||
      (current().organization === 'time' ? timelineTask !== null : workspaceTask !== null)
    ) {
      invalidationDuringRead = true
      return
    }
    if (invalidationTimer !== null) return
    const minimumInterval = 300
    const delay = Math.max(0, minimumInterval - (Date.now() - lastInvalidationReadAt))
    invalidationTimer = setTimeout(() => {
      invalidationTimer = null
      if (!alive()) return
      if (visibleRefreshInProgress) {
        invalidationDuringRead = true
        return
      }
      lastInvalidationReadAt = Date.now()
      void refresh({}).catch(options.onSubscriberError)
    }, delay)
  }

  function flushInvalidationAfterRead(): void {
    if (!invalidationDuringRead || visibleRefreshInProgress || workspaceTask !== null || timelineTask !== null) return
    invalidationDuringRead = false
    queueVisibleActivityRefresh()
  }

  function connectionChanged(connected: boolean): void {
    if (!alive() || connected === sidebarConnected) return
    sidebarConnected = connected
    if (!connected) {
      abortWorkspaceTask()
      abortTimelineTask()
      for (const workspaceId of sessionTasks.keys()) abortSessionTask(workspaceId)
      const snapshot = current()
      if (snapshot.organization === 'time' && snapshot.timeline.status !== 'idle')
        replace({
          ...snapshot,
          timeline: { ...snapshot.timeline, status: 'error', stale: true, error: 'DISCONNECTED' },
        })
      else if (snapshot.workspaces.status !== 'idle')
        replace({ ...snapshot, workspaces: { ...snapshot.workspaces, status: 'error', error: 'DISCONNECTED' } })
      return
    }
    queueVisibleActivityRefresh()
  }

  const stopConfirmedSessions = options.subscribeConfirmedSessions((items) => {
    if (!alive() || projectingSessions) return
    for (const item of items) {
      const previous = changedSessionFacts.get(item.id)
      const changed =
        !previous ||
        previous.workspaceId !== item.workspaceId ||
        previous.seq !== item.seq ||
        previous.createdAt !== item.createdAt ||
        previous.updatedAt !== item.updatedAt ||
        previous.archived !== item.archived
      if (!changed) continue
      rememberSession(item)
      if (current().organization === 'time') {
        if (item.archived) {
          const timeline = current().timeline
          replace({
            ...current(),
            timeline: {
              ...timeline,
              items: timeline.items.filter((entry) => entry.sessionId !== item.id),
              stale: true,
            },
          })
        }
        queueVisibleActivityRefresh()
        continue
      }
      const currentPage = current().sessions[item.workspaceId]
      const pageContains = currentPage?.sessionIds.includes(item.id) ?? false
      if (item.archived) {
        if (currentPage && pageContains)
          updateSessionPage(item.workspaceId, {
            ...currentPage,
            sessionIds: currentPage.sessionIds.filter((id) => id !== item.id),
          })
        queueInvalidation(item.workspaceId, true, Boolean(currentPage))
        continue
      }
      updateRowsFromSession(item)
      if (currentPage && !pageContains) queueInvalidation(item.workspaceId, false, true)
      if (
        !current().workspaces.items.some((row) => row.workspaceId === item.workspaceId) &&
        !current().workspaces.includedPins.some((row) => row.workspaceId === item.workspaceId)
      )
        queueInvalidation(item.workspaceId, true, false)
      if (currentPage && pageContains) applySessionFacts(item.workspaceId, currentPage, [item])
      else if (!previous) queueInvalidation(item.workspaceId, true, Boolean(currentPage))
    }
  })

  const stopDirectory = options.directory.subscribe(() => {
    const sessions = options.directory.getSnapshot().sessions
    if (sessions === lastDirectorySessions) return
    const previous = lastDirectorySessions
    lastDirectorySessions = sessions
    if (projectingSessions) return
    const pages = current().sessions
    for (const [workspaceId, page] of Object.entries(pages)) {
      if (page.sessionIds.some((id) => Object.hasOwn(previous, id) && !Object.hasOwn(sessions, id)))
        queueInvalidation(workspaceId, false, true)
    }
  })

  const stopPins = options.pins.subscribe(() => {
    const signature = [...options.pins.getSnapshot().ids].sort(compareIds).join('\0')
    if (signature === pinSignature) return
    pinSignature = signature
    if (current().organization === 'time') {
      try {
        projectTimelineWorkspaces(current().timeline)
      } catch (reason) {
        const timeline = current().timeline
        replace({ ...current(), timeline: { ...timeline, limitReached: true, stale: true } })
        options.onSubscriberError(reason)
      }
      return
    }
    if (current().workspaces.status !== 'idle') void refreshWorkspacePage().catch(options.onSubscriberError)
  })

  const stopSidebarActivityEvents = options.sidebarActivityEvents?.subscribe(queueVisibleActivityRefresh) ?? (() => {})
  const stopSidebarConnection = options.sidebarActivityEvents?.onConnection?.(connectionChanged) ?? (() => {})

  const stopPreferences = options.preferences.subscribe(() => {
    if (
      !initialized ||
      preferenceRefreshInProgress ||
      organizationWriteInProgress ||
      organizationRefreshInProgress ||
      !alive()
    )
      return
    const preferences = options.preferences.getSnapshot()
    const before = current()
    const wasVisible =
      before.organization === 'time' ? before.timeline.status !== 'idle' : before.workspaces.status !== 'idle'
    let changed = false
    try {
      const sortBy = persistedSort(preferences)
      if (sortBy !== current().sortBy) {
        resetForSortChange(sortBy)
        changed = true
      }
      const preference = persistedOrganization(preferences)
      if (
        preference.organization !== current().organization ||
        preference.previousGroupedOrganization !== current().previousGroupedOrganization ||
        !sameProjectOrder(preference.projectOrder, current().projectOrder)
      ) {
        applyOrganizationPreference(preference, false)
        changed = true
      }
      if (changed && wasVisible) void refresh({}).catch(options.onSubscriberError)
    } catch (reason) {
      const error = errorCode(reason)
      replace({
        ...current(),
        preferenceStatus: 'error',
        preferenceError: error,
        organizationPreferenceStatus: 'error',
        organizationPreferenceError: error,
      })
    }
  })

  const ready = options.preferencesReady
    .then(() => {
      if (!alive()) return
      initialized = true
      for (const item of Object.values(options.directory.getSnapshot().sessions)) rememberSession(item)
      const preferences = options.preferences.getSnapshot()
      try {
        if (preferences.restoreError)
          throw new CommandError(
            'PERSISTENCE_RESTORE_FAILED',
            'Restore device preferences before loading Workspace activity',
          )
        const sortBy = persistedSort(preferences)
        const organization = persistedOrganization(preferences)
        replace({
          ...current(),
          sortBy,
          preferenceStatus: 'ready',
          preferenceError: null,
          organizationPreferenceStatus: 'ready',
          organizationPreferenceError: null,
        })
        applyOrganizationPreference(organization, false)
      } catch (reason) {
        const error = errorCode(reason)
        replace({
          ...current(),
          sortBy: 'updatedAt',
          preferenceStatus: 'error',
          preferenceError: error,
          organizationPreferenceStatus: 'error',
          organizationPreferenceError: error,
        })
      }
    })
    .catch((reason: unknown) => {
      const error = errorCode(reason)
      replace({
        ...current(),
        sortBy: 'updatedAt',
        preferenceStatus: 'error',
        preferenceError: error,
        organizationPreferenceStatus: 'error',
        organizationPreferenceError: error,
      })
    })

  local.register(workspaceActivityCommands['workspaceActivity.setSort'], async (input, context) =>
    setSort(input.sortBy, context),
  )
  local.register(workspaceActivityCommands['workspaceActivity.refresh'], async (input, context) => {
    const status = await refresh(input, context)
    const snapshot = current()
    const error =
      input.workspaceId === undefined
        ? ((snapshot.organization === 'time'
            ? snapshot.timeline.error
            : (snapshot.workspaces.error ?? Object.values(snapshot.sessions).find((page) => page.error)?.error)) ??
          snapshot.preferenceError ??
          snapshot.organizationPreferenceError)
        : (snapshot.sessions[input.workspaceId]?.error ??
          snapshot.preferenceError ??
          snapshot.organizationPreferenceError)
    return pageResult(status, error)
  })
  local.register(workspaceActivityCommands['workspaceActivity.loadMore'], async (input, context) => {
    const status = !(await prepareExplicitRefresh())
      ? 'error'
      : input.scope === 'workspaces'
        ? await loadMoreWorkspacePage(context)
        : input.scope === 'timeline'
          ? await loadMoreTimelinePage(context)
          : input.workspaceId === undefined
            ? (() => {
                throw new CommandError('INVALID_INPUT', 'Session paging needs a Workspace ID')
              })()
            : await loadMoreSessionPage(input.workspaceId, context)
    let error: string | null
    if (input.scope === 'workspaces') error = current().workspaces.error ?? current().preferenceError
    else if (input.scope === 'timeline') error = current().timeline.error ?? current().preferenceError
    else if (input.workspaceId !== undefined)
      error = current().sessions[input.workspaceId]?.error ?? current().preferenceError
    else error = current().preferenceError ?? 'INVALID_INPUT'
    return pageResult(status, error)
  })
  local.register(workspaceActivityCommands['workspaceActivity.setOrganization'], async (input, context) =>
    setOrganization(input.organization, context),
  )
  local.register(workspaceActivityCommands['workspaceActivity.moveProject'], async (input, context) =>
    moveProject(input, context),
  )
  local.register(workspaceActivityCommands['workspaceActivity.toggleTime'], async (_input, context) =>
    toggleTime(context),
  )
  local.register(workspaceActivityCommands['workspaceActivity.setLocale'], async (input, context) =>
    setLocale(input.locale, context),
  )

  return {
    reader: state.reader,
    ready,
    dispose() {
      if (disposed) return
      disposed = true
      abortAllTasks()
      stopConfirmedSessions()
      stopDirectory()
      stopPins()
      stopPreferences()
      stopSidebarActivityEvents()
      stopSidebarConnection()
      if (invalidationTimer !== null) clearTimeout(invalidationTimer)
      // Drop the owner's retention before the Directory cache itself is disposed.
      options.projectActivityWorkspaces([], [])
      options.projectActivitySessions([], [])
      state.dispose()
      changedSessionFacts.clear()
      sessionGenerations.clear()
      sessionTasks.clear()
      pendingSessionRefreshes.clear()
    },
  }
}

const DIRECTORY_FACT_CACHE_LIMIT = 1000
