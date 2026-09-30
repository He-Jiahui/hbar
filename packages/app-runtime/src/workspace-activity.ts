import { CommandError, type CommandExecutor, type CommandRegistry, type ExecuteOptions } from '@hbar/commands'
import { defineCommand } from '@hbar/commands/protocol'
import {
  sessionActivityPageSchema,
  workspaceActivityPageSchema,
  workspaceActivitySortSchema,
} from '@hbar/contracts/directory'
import type {
  Session,
  SessionActivityCursor,
  SessionActivityPage,
  WorkspaceActivityCursor,
  WorkspaceActivityItem,
  WorkspaceActivityPage,
  WorkspaceActivitySortBy,
} from '@hbar/contracts/directory'
import { z } from 'zod'
import { createState, type StateReader } from './state'
import { createSessionProjectionFence } from './session-projection-fence'
import type { ClientPreferencesState, DirectoryState } from './types'
import { MAX_PINNED_WORKSPACES, type WorkspacePinsState } from './workspace-pins'
import { MAX_RETAINED_ACTIVITY_SESSIONS, MAX_RETAINED_ACTIVITY_WORKSPACES } from './directory'

const PREFERENCE_KEY = 'workspaceActivitySortBy'
const PAGE_SIZE = 60
const WORKSPACE_ROW_LIMIT = 200
const SESSION_ROW_LIMIT = MAX_RETAINED_ACTIVITY_SESSIONS
const SESSION_GROUP_LIMIT = MAX_RETAINED_ACTIVITY_WORKSPACES
const MAX_PARALLEL_REFRESHES = 4
const idSchema = z.string().min(1).max(160)
const refreshInput = z.strictObject({ workspaceId: idSchema.optional() })
const loadMoreInput = z
  .strictObject({
    scope: z.enum(['workspaces', 'sessions']),
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
  })
const actionOutput = z.strictObject({
  status: z.enum(['ready', 'error', 'limitReached']),
  error: z.string().nullable(),
})
const sortOutput = z.strictObject({ sortBy: workspaceActivitySortSchema, persisted: z.boolean() })

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
  'workspaceActivity.setSort': defineCommand(
    metadata('workspaceActivity.setSort'),
    z.strictObject({ sortBy: workspaceActivitySortSchema }),
    sortOutput,
  ),
  'workspaceActivity.refresh': defineCommand(metadata('workspaceActivity.refresh'), refreshInput, actionOutput),
  'workspaceActivity.loadMore': defineCommand(metadata('workspaceActivity.loadMore'), loadMoreInput, actionOutput),
}

export type WorkspaceActivityPreferenceStatus = 'loading' | 'ready' | 'saving' | 'submitting' | 'error'
export type WorkspaceActivityPageStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface WorkspaceActivityRow {
  readonly workspaceId: string
  readonly latestSessionCreatedAt: number | null
  readonly latestSessionUpdatedAt: number | null
}

export interface WorkspaceActivityWorkspacePage {
  readonly status: WorkspaceActivityPageStatus
  readonly items: readonly Readonly<WorkspaceActivityRow>[]
  readonly includedPins: readonly Readonly<WorkspaceActivityRow>[]
  readonly nextCursor: WorkspaceActivityCursor | null
  readonly hasMore: boolean
  readonly limitReached: boolean
  readonly error: string | null
}

export interface WorkspaceActivitySessionPage {
  readonly status: WorkspaceActivityPageStatus
  readonly sortBy: WorkspaceActivitySortBy
  readonly sessionIds: readonly string[]
  readonly nextCursor: SessionActivityCursor | null
  readonly hasMore: boolean
  readonly limitReached: boolean
  readonly error: string | null
}

export interface WorkspaceActivityState {
  readonly sortBy: WorkspaceActivitySortBy
  readonly preferenceStatus: WorkspaceActivityPreferenceStatus
  readonly preferenceError: string | null
  readonly workspaces: Readonly<WorkspaceActivityWorkspacePage>
  readonly sessions: Readonly<Record<string, Readonly<WorkspaceActivitySessionPage>>>
}

export interface WorkspaceActivityOptions {
  readonly preferences: StateReader<ClientPreferencesState>
  readonly preferencesReady: Promise<void>
  readonly preferenceCommands: CommandExecutor
  readonly refreshPreferences: () => Promise<ClientPreferencesState>
  readonly queries: CommandExecutor
  readonly pins: StateReader<WorkspacePinsState>
  readonly directory: StateReader<DirectoryState>
  readonly projectActivityWorkspaces: (
    retainedIds: readonly string[],
    records: readonly WorkspaceActivityItem[],
  ) => void
  readonly projectActivitySessions: (retainedIds: readonly string[], records: readonly Session[]) => readonly Session[]
  readonly subscribeConfirmedSessions: (listener: (items: readonly Session[]) => void) => () => void
  readonly onSubscriberError: (reason: unknown) => void
  readonly isDisposed: () => boolean
}

const emptyWorkspacePage: WorkspaceActivityWorkspacePage = {
  status: 'idle',
  items: [],
  includedPins: [],
  nextCursor: null,
  hasMore: false,
  limitReached: false,
  error: null,
}

function errorCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

function persistedSort(preferences: ClientPreferencesState): WorkspaceActivitySortBy {
  const value = preferences.values[PREFERENCE_KEY]
  if (value === undefined) return 'updatedAt'
  const parsed = workspaceActivitySortSchema.safeParse(value)
  if (!parsed.success) throw new CommandError('INVALID_PERSISTED_STATE', 'Saved Workspace sort is invalid')
  return parsed.data
}

function row(item: WorkspaceActivityItem): WorkspaceActivityRow {
  return {
    workspaceId: item.workspace.id,
    latestSessionCreatedAt: item.latestSessionCreatedAt,
    latestSessionUpdatedAt: item.latestSessionUpdatedAt,
  }
}

function activityTimestamp(item: WorkspaceActivityRow, sortBy: WorkspaceActivitySortBy): number | null {
  return sortBy === 'createdAt' ? item.latestSessionCreatedAt : item.latestSessionUpdatedAt
}

/** Match the Host's descending timestamp, null-last and binary ID order. */
function compareRows(left: WorkspaceActivityRow, right: WorkspaceActivityRow, sortBy: WorkspaceActivitySortBy): number {
  const a = activityTimestamp(left, sortBy)
  const b = activityTimestamp(right, sortBy)
  if (a === null && b !== null) return 1
  if (a !== null && b === null) return -1
  if (a !== null && b !== null && a !== b) return b - a
  return compareIds(left.workspaceId, right.workspaceId)
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function validateWorkspacePage(page: WorkspaceActivityPage, sortBy: WorkspaceActivitySortBy): void {
  for (let index = 1; index < page.items.length; index++) {
    const previous = page.items[index - 1]
    const current = page.items[index]
    if (!previous || !current || compareRows(row(previous), row(current), sortBy) > 0)
      throw new CommandError('INVALID_OUTPUT', 'Workspace activity page is not sorted')
  }
  const last = page.items.at(-1)
  if (
    page.nextCursor &&
    (!last ||
      page.nextCursor.sortBy !== sortBy ||
      page.nextCursor.workspaceId !== last.workspace.id ||
      page.nextCursor.timestamp !== activityTimestamp(row(last), sortBy))
  )
    throw new CommandError('INVALID_OUTPUT', 'Workspace activity cursor does not match its page')
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

function pageResult(status: 'ready' | 'error' | 'limitReached', error: string | null = null) {
  return { status, error }
}

/** Sorts pins by activity, preserves Host order for the remaining page, then applies visibility. */
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
  const pinned = pinnedIds
    .map((id) => rows.get(id) ?? { workspaceId: id, latestSessionCreatedAt: null, latestSessionUpdatedAt: null })
    .sort((left, right) => compareRows(left, right, activity.sortBy))
  const pinnedSet = new Set(pinnedIds)
  const hidden = new Set(hiddenWorkspaceIds)
  return [...pinned.map((item) => item.workspaceId), ...pageRows.map((item) => item.workspaceId)].filter(
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

/** Owns the persisted project sort and the bounded activity cursor projections used by the sidebar. */
export function createWorkspaceActivity(local: CommandRegistry, options: WorkspaceActivityOptions) {
  const state = createState<WorkspaceActivityState>(
    {
      sortBy: 'updatedAt',
      preferenceStatus: 'loading',
      preferenceError: null,
      workspaces: emptyWorkspacePage,
      sessions: {},
    },
    options.onSubscriberError,
  )
  let disposed = false
  let initialized = false
  let preferenceWriteInProgress = false
  let preferenceRefreshInProgress = false
  let workspaceGeneration = 0
  let workspaceTask: ActivityQueryTask | null = null
  const sessionGenerations = new Map<string, number>()
  const sessionTasks = new Map<string, ActivityQueryTask>()
  const changedSessionFacts = new Map<string, SessionFactVersion>()
  let projectingSessions = false
  let lastDirectorySessions = options.directory.getSnapshot().sessions
  let pinSignature = options.pins.getSnapshot().ids.join('\0')
  const pendingSessionRefreshes = new Set<string>()
  let pendingWorkspaceRefresh = false
  let invalidationScheduled = false
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

  function abortSessionTask(workspaceId: string): void {
    sessionGenerations.set(workspaceId, (sessionGenerations.get(workspaceId) ?? 0) + 1)
    sessionTasks.get(workspaceId)?.controller.abort()
    sessionTasks.delete(workspaceId)
  }

  function abortAllTasks(): void {
    abortWorkspaceTask()
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
    records: readonly WorkspaceActivityItem[],
  ): void {
    const retainedIds = [...new Set([...workspaces.items.map((item) => item.workspaceId), ...workspacePinIds()])]
    if (retainedIds.length > MAX_RETAINED_ACTIVITY_WORKSPACES)
      throw new CommandError('CAPACITY_EXCEEDED', 'Too many retained Workspace activity rows')
    options.projectActivityWorkspaces(retainedIds, records)
  }

  function retainedSessionIds(pages: Readonly<Record<string, Readonly<WorkspaceActivitySessionPage>>>): string[] {
    return [...new Set(Object.values(pages).flatMap((page) => page.sessionIds))]
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

  function mapRows(items: readonly WorkspaceActivityItem[]): readonly WorkspaceActivityRow[] {
    return items.map(row)
  }

  function pageRows(
    prior: WorkspaceActivityWorkspacePage,
    pageItems: readonly WorkspaceActivityItem[],
    cursor: WorkspaceActivityCursor | null,
    append: boolean,
    limitReached: boolean,
    includedPins: readonly WorkspaceActivityItem[],
  ): WorkspaceActivityWorkspacePage {
    const page = mapRows(pageItems)
    const items = append ? [...prior.items, ...page] : [...page]
    return {
      status: 'ready',
      items,
      includedPins: mapRows(includedPins),
      nextCursor: cursor,
      hasMore: cursor !== null,
      limitReached,
      error: null,
    }
  }

  function validateWorkspaceResponse(
    value: unknown,
    sortBy: WorkspaceActivitySortBy,
    requestedPinIds: readonly string[],
    existingIds: readonly string[],
  ) {
    const page = workspaceActivityPageSchema.parse(value)
    validateWorkspacePage(page, sortBy)
    const requested = new Set(requestedPinIds)
    if (page.includedItems.some((item) => !requested.has(item.workspace.id)))
      throw new CommandError('INVALID_OUTPUT', 'Workspace activity returned an unrequested pinned row')
    const prior = new Set(existingIds)
    if (page.items.some((item) => prior.has(item.workspace.id)))
      throw new CommandError('INVALID_OUTPUT', 'Workspace activity page repeats an earlier row')
    return page
  }

  async function executeWorkspacePage(
    task: ActivityQueryTask,
    input: { readonly cursor?: WorkspaceActivityCursor; readonly append: boolean; readonly staleRetry: number },
    execution?: ExecuteOptions,
  ): Promise<void> {
    const isCurrent = () =>
      alive() && workspaceTask === task && task.generation === workspaceGeneration && !task.controller.signal.aborted
    if (!isCurrent()) return
    const snapshot = current()
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
      sortBy,
      limit: Math.min(PAGE_SIZE, remaining),
      includeWorkspaceIds: requestedPinIds,
      ...(input.cursor ? { cursor: input.cursor } : {}),
    }
    const removeAbort = linkSignal(task.controller, execution?.signal)
    try {
      const value = await options.queries.execute('workspace.activity.list', queryInput, {
        signal: task.controller.signal,
      })
      if (!isCurrent()) return
      const page = validateWorkspaceResponse(
        value,
        sortBy,
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
    if (current().preferenceStatus === 'loading' || current().preferenceError !== null) return
    abortWorkspaceTask()
    const controller = new AbortController()
    const task = { controller, generation: workspaceGeneration }
    workspaceTask = task
    const prior = current().workspaces
    replace({ ...current(), workspaces: { ...prior, status: 'loading', error: null } })
    await executeWorkspacePage(task, { append: false, staleRetry: 0 }, execution)
    if (workspaceTask === task) workspaceTask = null
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
    updateSessionPage(workspaceId, { ...page, sessionIds: nextIds })
  }

  async function executeSessionPage(
    task: ActivityQueryTask,
    workspaceId: string,
    input: { readonly cursor?: SessionActivityCursor; readonly append: boolean; readonly staleRetry: number },
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
    const requestedLimit = sessionLimitForPage(workspaceId, PAGE_SIZE, input.append)
    if (requestedLimit === 0) {
      const page: WorkspaceActivitySessionPage = {
        status: 'ready',
        sortBy: snapshot.sortBy,
        sessionIds: prior?.sessionIds ?? [],
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
        'session.activity.list',
        {
          workspaceId,
          sortBy: snapshot.sortBy,
          limit: requestedLimit,
          ...(input.cursor ? { cursor: input.cursor } : {}),
        },
        { signal: task.controller.signal },
      )
      if (!isCurrent()) return
      const page = sessionActivityPageSchema.parse(value)
      validateSessionPage(page, workspaceId, snapshot.sortBy)
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
      sessionIds: [],
      nextCursor: null,
      hasMore: false,
      limitReached: false,
      error: null,
    }
    pages[workspaceId] = loadingPage
    projectSessionPage(pages, [])
    replace({ ...current(), sessions: pages })
    await executeSessionPage(task, workspaceId, { append: false, staleRetry: 0 }, execution)
    if (sessionTasks.get(workspaceId) === task) sessionTasks.delete(workspaceId)
  }

  async function loadMoreWorkspacePage(execution?: ExecuteOptions): Promise<'ready' | 'error' | 'limitReached'> {
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

  function resetForSortChange(sortBy: WorkspaceActivitySortBy): void {
    abortAllTasks()
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
    if (!alive()) throw new CommandError('DISPOSED', 'Workspace activity owner was disposed')
    await ready
    const currentState = current()
    if (currentState.preferenceStatus === 'loading' || currentState.preferenceStatus === 'saving')
      throw new CommandError('BUSY', 'Workspace sort preferences are not ready')
    if (currentState.sortBy !== sortBy) {
      replace({ ...currentState, preferenceStatus: 'saving', preferenceError: null })
      preferenceWriteInProgress = true
      try {
        let saved = false
        for (let attempt = 0; attempt < 3 && !saved; attempt++) {
          const preference = options.preferences.getSnapshot()
          if (preference.restoreError)
            throw new CommandError('PERSISTENCE_RESTORE_FAILED', 'Restore device preferences before changing sort')
          const actualSort = persistedSort(preference)
          if (actualSort === sortBy) {
            saved = true
            break
          }
          try {
            await options.preferenceCommands.execute(
              'preferences.set',
              { key: PREFERENCE_KEY, value: sortBy, expectedRevision: preference.revision },
              execution,
            )
            const updated = options.preferences.getSnapshot()
            if (persistedSort(updated) !== sortBy)
              throw new CommandError('RESULT_UNKNOWN', 'Saved Workspace sort did not match the request')
            saved = true
          } catch (reason) {
            if (errorCode(reason) === 'COMMAND_CONFLICT' && attempt < 2) {
              await options.refreshPreferences()
              continue
            }
            throw reason
          }
        }
        if (!saved) throw new CommandError('COMMAND_CONFLICT', 'Workspace sort changed repeatedly')
        resetForSortChange(sortBy)
      } catch (reason) {
        const error = errorCode(reason)
        replace({ ...current(), preferenceStatus: 'error', preferenceError: error })
        throw reason
      } finally {
        preferenceWriteInProgress = false
      }
      await refreshWorkspacePage(execution)
    } else {
      replace({ ...current(), preferenceStatus: 'submitting' })
      await refresh({ workspaceId: undefined }, execution)
      if (current().preferenceError !== null)
        throw new CommandError(
          current().preferenceError ?? 'PREFERENCE_REFRESH_FAILED',
          'Workspace sort preferences could not be confirmed',
        )
      if (current().sortBy !== sortBy) return setSort(sortBy, execution)
    }
    const result = current()
    if (result.preferenceError === null) replace({ ...result, preferenceStatus: 'ready' })
    return { sortBy: result.sortBy, persisted: options.preferences.getSnapshot().persisted }
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

  async function refresh(input: z.output<typeof refreshInput>, execution?: ExecuteOptions): Promise<'ready' | 'error'> {
    if (!(await prepareExplicitRefresh())) return 'error'
    if (input.workspaceId) {
      await refreshSessionPage(input.workspaceId, execution)
      return current().sessions[input.workspaceId]?.status === 'error' ? 'error' : 'ready'
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
  }

  async function prepareExplicitRefresh(): Promise<boolean> {
    await ready
    if (!alive()) return false
    const before = current()
    if (before.preferenceError === null) return before.preferenceStatus !== 'loading'
    preferenceRefreshInProgress = true
    try {
      const preferences = await options.refreshPreferences()
      if (!alive()) return false
      const sortBy = persistedSort(preferences)
      if (sortBy !== current().sortBy) resetForSortChange(sortBy)
      replace({ ...current(), sortBy, preferenceStatus: 'ready', preferenceError: null })
      return true
    } catch (reason) {
      replace({ ...current(), preferenceStatus: 'error', preferenceError: errorCode(reason) })
      return false
    } finally {
      preferenceRefreshInProgress = false
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
      [...items].sort((a, b) => compareRows(a, b, current().sortBy))
    replace({
      ...current(),
      workspaces: { ...page, items: sortRows(nextRows), includedPins: sortRows(nextPins) },
    })
  }

  function queueInvalidation(workspaceId: string, refreshWorkspace: boolean, refreshSessions: boolean): void {
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
    if (current().workspaces.status !== 'idle') void refreshWorkspacePage().catch(options.onSubscriberError)
  })

  const stopPreferences = options.preferences.subscribe(() => {
    if (!initialized || preferenceWriteInProgress || preferenceRefreshInProgress || !alive()) return
    const preferences = options.preferences.getSnapshot()
    try {
      const sortBy = persistedSort(preferences)
      if (sortBy === current().sortBy) return
      resetForSortChange(sortBy)
      if (current().workspaces.status !== 'idle') void refreshWorkspacePage().catch(options.onSubscriberError)
    } catch (reason) {
      replace({ ...current(), preferenceStatus: 'error', preferenceError: errorCode(reason) })
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
        replace({ ...current(), sortBy: persistedSort(preferences), preferenceStatus: 'ready', preferenceError: null })
      } catch (reason) {
        replace({ ...current(), sortBy: 'updatedAt', preferenceStatus: 'error', preferenceError: errorCode(reason) })
      }
    })
    .catch((reason: unknown) => {
      replace({ ...current(), sortBy: 'updatedAt', preferenceStatus: 'error', preferenceError: errorCode(reason) })
    })

  local.register(workspaceActivityCommands['workspaceActivity.setSort'], async (input, context) =>
    setSort(input.sortBy, context),
  )
  local.register(workspaceActivityCommands['workspaceActivity.refresh'], async (input, context) => {
    const status = await refresh(input, context)
    const error =
      input.workspaceId === undefined
        ? (current().workspaces.error ??
          Object.values(current().sessions).find((page) => page.error)?.error ??
          current().preferenceError)
        : (current().sessions[input.workspaceId]?.error ?? current().preferenceError)
    return pageResult(status, error)
  })
  local.register(workspaceActivityCommands['workspaceActivity.loadMore'], async (input, context) => {
    const status = !(await prepareExplicitRefresh())
      ? 'error'
      : input.scope === 'workspaces'
        ? await loadMoreWorkspacePage(context)
        : input.workspaceId === undefined
          ? (() => {
              throw new CommandError('INVALID_INPUT', 'Session paging needs a Workspace ID')
            })()
          : await loadMoreSessionPage(input.workspaceId, context)
    let error: string | null
    if (input.scope === 'workspaces') error = current().workspaces.error ?? current().preferenceError
    else if (input.workspaceId !== undefined)
      error = current().sessions[input.workspaceId]?.error ?? current().preferenceError
    else error = current().preferenceError ?? 'INVALID_INPUT'
    return pageResult(status, error)
  })

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
      // Drop the owner's retention before the Directory cache itself is disposed.
      options.projectActivityWorkspaces([], [])
      projectSessionPage({}, [])
      state.dispose()
      changedSessionFacts.clear()
      sessionGenerations.clear()
      sessionTasks.clear()
      pendingSessionRefreshes.clear()
    },
  }
}

const DIRECTORY_FACT_CACHE_LIMIT = 1000
