import {
  CommandRegistry,
  CommandError,
  createCommandClient,
  validationError,
  type ExecuteOptions,
} from '@hbar/commands'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { directoryCommands } from '@hbar/contracts/commands'
import { sessionSchema, workspaceSchema, sessionPageSchema, workspacePageSchema } from '@hbar/contracts/directory'
import type { Session, Workspace } from '@hbar/contracts/directory'
import { createState, type StateReader } from './state'
import type { DirectoryState, NavigationState, RuntimeOptions } from './types'
import type { RosterMissingSession } from './session-roster-refresh'
import { createSessionProjectionFence } from './session-projection-fence'
function decode<Schema extends z.ZodType>(schema: Schema, value: unknown): z.output<Schema> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw validationError('INVALID_OUTPUT', parsed.error)
  return parsed.data
}
interface SessionVersionFloor {
  readonly sessionId: string
  seq?: number
  updatedAt?: number
  advanced: boolean
}
function olderThanFloor(item: Session | null, floor: SessionVersionFloor | undefined): boolean {
  return (
    floor?.seq !== undefined &&
    (item
      ? item.seq < floor.seq || (item.seq === floor.seq && item.updatedAt < (floor.updatedAt ?? 0))
      : floor.advanced)
  )
}

/** Validate paged project discovery through the Runtime facade before it reaches a View. */
export function parseWorkspacePage(value: unknown): z.output<typeof workspacePageSchema> {
  return decode(workspacePageSchema, value)
}

export function createDirectoryModule(
  options: RuntimeOptions,
  navigation: StateReader<NavigationState>,
  onSessionUnavailable: (id: string) => void,
  onSubscriberError: (error: unknown) => void,
) {
  const directory = createState<DirectoryState>({ workspaces: {}, sessions: {} }, onSubscriberError)
  const remote = new CommandRegistry({ execution: 'host' })
  const observational = new CommandRegistry({ execution: 'host' })
  let disposed = false
  const requests = new Map<string, number>()
  // Read/Archive floors live only during the captured request; cache eviction must not make its old reply new.
  const pendingSessionProjections = new Map<symbol, SessionVersionFloor>()
  function captureSessionProjection(sessionId: string) {
    if (pendingSessionProjections.size >= 32)
      throw new CommandError('CAPACITY_EXCEEDED', 'Too many pending Session projections')
    const key = Symbol()
    const prior = directory.reader.getSnapshot().sessions[sessionId]
    const floor: SessionVersionFloor = {
      sessionId,
      advanced: false,
      ...(prior ? { seq: prior.seq, updatedAt: prior.updatedAt } : {}),
    }
    pendingSessionProjections.set(key, floor)
    return {
      floor,
      dispose() {
        pendingSessionProjections.delete(key)
      },
    }
  }
  const confirmedSessionListeners = new Set<(items: readonly Session[]) => void>()
  const pageFences = new Set<ReturnType<typeof createSessionProjectionFence>>()
  function subscribeConfirmedSessions(listener: (items: readonly Session[]) => void): () => void {
    if (disposed) return () => undefined
    confirmedSessionListeners.add(listener)
    return () => {
      confirmedSessionListeners.delete(listener)
    }
  }
  let sequence = 0
  function publishConfirmedSessions(items: readonly Session[]): void {
    if (items.length === 0) return
    for (const pending of pendingSessionProjections.values()) {
      for (const item of items) {
        if (
          item.id === pending.sessionId &&
          (pending.seq === undefined ||
            item.seq > pending.seq ||
            (item.seq === pending.seq && item.updatedAt > (pending.updatedAt ?? 0)))
        ) {
          pending.seq = item.seq
          pending.updatedAt = item.updatedAt
          pending.advanced = true
        }
      }
    }
    const facts = Object.freeze(items.map((item) => Object.freeze(item)))
    for (const listener of confirmedSessionListeners) {
      try {
        listener(facts)
      } catch (error) {
        onSubscriberError(error)
      }
    }
  }
  function mergeSessions(items: readonly Session[]): readonly Session[] {
    if (new Set(items.map((item) => item.id)).size !== items.length)
      throw new CommandError('INVALID_OUTPUT', 'Duplicate Session IDs')
    const current = directory.reader.getSnapshot()
    const entries = new Map(Object.entries(current.sessions))
    const accepted: Session[] = []
    for (const item of items) {
      const prior = entries.get(item.id)
      if (!prior || item.seq > prior.seq || (item.seq === prior.seq && item.updatedAt >= prior.updatedAt)) {
        entries.set(item.id, item)
        accepted.push(item)
      }
    }
    const selected = navigation.getSnapshot().sessionId
    while (entries.size > 1000) {
      const candidate = [...entries.keys()].find((id) => id !== selected)
      if (candidate === undefined) break
      entries.delete(candidate)
    }
    directory.replace({ ...current, sessions: Object.fromEntries(entries) })
    // Deliver validated accepted facts even if bounded cache eviction removed their row.
    publishConfirmedSessions(accepted)
    return accepted
  }
  function mergeWorkspaces(items: readonly Workspace[]): void {
    if (new Set(items.map((item) => item.id)).size !== items.length)
      throw new CommandError('INVALID_OUTPUT', 'Duplicate Workspace IDs')
    const current = directory.reader.getSnapshot()
    const entries = new Map(Object.entries(current.workspaces))
    for (const item of items) entries.set(item.id, item)
    const selected = navigation.getSnapshot().workspaceId
    while (entries.size > 200) {
      const candidate = [...entries.keys()].find((id) => id !== selected)
      if (candidate === undefined) break
      entries.delete(candidate)
    }
    directory.replace({ ...current, workspaces: Object.fromEntries(entries) })
  }
  async function read(
    name: string,
    input: unknown,
    execution: ExecuteOptions,
    sessionId?: string,
  ): Promise<{ value: unknown; latest: boolean; floor?: SessionVersionFloor }> {
    if (disposed || execution.signal?.aborted)
      throw new CommandError('QUERY_SUPERSEDED', 'Query no longer belongs to this runtime generation')
    const projection = sessionId === undefined ? undefined : captureSessionProjection(sessionId)
    const key = `${name}:${JSON.stringify(input)}`
    const current = ++sequence
    requests.set(key, current)
    const releaseFloor = () => projection?.dispose()
    execution.signal?.addEventListener('abort', releaseFloor, { once: true })
    try {
      const result = await options.directory.execute(name, input, execution)
      if (disposed || execution.signal?.aborted)
        throw new CommandError('QUERY_SUPERSEDED', 'Query no longer belongs to this runtime generation')
      return {
        value: result,
        latest: requests.get(key) === current,
        ...(projection ? { floor: projection.floor } : {}),
      }
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    } finally {
      if (requests.get(key) === current) requests.delete(key)
      projection?.dispose()
      execution.signal?.removeEventListener('abort', releaseFloor)
    }
  }

  remote.register(directoryCommands['workspace.list'], async (input, context) => {
    const response = await read('workspace.list', input, context)
    const page = decode(workspacePageSchema, response.value)
    if (response.latest) mergeWorkspaces(page.items)
    return page
  })
  remote.register(directoryCommands['workspace.get'], async (input, context) => {
    const response = await read('workspace.get', input, context)
    const item = decode(workspaceSchema.nullable(), response.value)
    if (item && item.id !== input.workspaceId) throw new CommandError('INVALID_OUTPUT', 'Workspace target mismatch')
    if (item && response.latest) mergeWorkspaces([item])
    return item
  })
  remote.register(directoryCommands['session.list'], async (input, context) => {
    if (pageFences.size >= 32) throw new CommandError('BUSY', 'Too many pending Session page projections')
    const fence = createSessionProjectionFence(
      input.workspaceId,
      Object.values(directory.reader.getSnapshot().sessions),
      subscribeConfirmedSessions,
    )
    pageFences.add(fence)
    const release = () => {
      fence.dispose()
      pageFences.delete(fence)
    }
    context.signal?.addEventListener('abort', release, { once: true })
    try {
      const response = await read('session.list', input, context)
      const page = decode(sessionPageSchema, response.value)
      if (
        page.items.some(
          (item) =>
            item.workspaceId !== input.workspaceId ||
            (!input.includeArchived && item.archived) ||
            (input.title !== undefined && item.title !== input.title),
        )
      )
        throw new CommandError('INVALID_OUTPUT', 'Session page does not match its query')
      if (response.latest) mergeSessions(fence.filter(page.items))
      return page
    } finally {
      context.signal?.removeEventListener('abort', release)
      release()
    }
  })
  const readSession = async (
    input: { readonly sessionId: string },
    context: ExecuteOptions,
    preserveSelection: boolean,
  ) => {
    const response = await read('session.get', input, context, input.sessionId)
    const item = decode(sessionSchema.nullable(), response.value)
    if (item && item.id !== input.sessionId) throw new CommandError('INVALID_OUTPUT', 'Session target mismatch')
    const stale = olderThanFloor(item, response.floor)
    // Independent consumers still receive their own DTO. Only the canonical projection and
    // unavailable side effect are fenced when a newer confirmed fact arrived during this read.
    const canMerge = response.latest && !stale
    const accepted = item && canMerge ? mergeSessions([item]) : []
    if (!preserveSelection && canMerge && (!item || accepted.some((fact) => fact.archived)))
      onSessionUnavailable(input.sessionId)
    if (!item && canMerge) {
      const current = directory.reader.getSnapshot()
      directory.replace({
        ...current,
        sessions: Object.fromEntries(Object.entries(current.sessions).filter(([id]) => id !== input.sessionId)),
      })
    }
    return item
  }
  remote.register(directoryCommands['session.get'], (input, context) => readSession(input, context, false))
  observational.register(directoryCommands['session.get'], (input, context) => readSession(input, context, true))
  const observations = createCommandClient({ 'session.get': directoryCommands['session.get'] }, observational)
  const queries = createCommandClient(directoryCommands, remote)

  return {
    queries,
    /** A validated, bounded fact read for restore/reconciliation, without changing the observed view. */
    observeSession: (sessionId: string, execution?: ExecuteOptions) =>
      observations.execute('session.get', { sessionId }, execution),
    /** Accepted Host facts, not cache absence/loading or speculative mutation intent. */
    subscribeConfirmedSessions,
    /** Observational sidebar reconciliation must not clear the user's active session or touch drafts. */
    reconcileRosterSessions(
      items: readonly Session[],
      absent: readonly RosterMissingSession[],
    ): { readonly skipped: number } {
      if (disposed) return { skipped: items.length }
      const confirmed = items.map((item) => decode(sessionSchema, item))
      if (new Set(confirmed.map((item) => item.id)).size !== confirmed.length)
        throw new CommandError('INVALID_OUTPUT', 'Duplicate Session IDs')
      const current = directory.reader.getSnapshot()
      const sessions = { ...current.sessions }
      for (const item of absent) {
        const cached = sessions[item.id]
        // A null response started before a newer rename/event cannot delete the newer canonical fact.
        if (cached?.workspaceId === item.workspaceId && cached.seq === item.seq && cached.updatedAt === item.updatedAt)
          delete sessions[item.id]
      }
      let count = Object.keys(sessions).length
      let skipped = 0
      const accepted: Session[] = []
      for (const item of confirmed) {
        const prior = sessions[item.id]
        if (prior) {
          if (item.seq > prior.seq || (item.seq === prior.seq && item.updatedAt >= prior.updatedAt)) {
            sessions[item.id] = item
            accepted.push(item)
          }
        } else if (count < 1000) {
          sessions[item.id] = item
          accepted.push(item)
          count++
        } else {
          // Refresh never evicts an already loaded later-page or other project's member to make room.
          skipped++
        }
      }
      directory.replace({ ...current, sessions })
      publishConfirmedSessions(accepted)
      return { skipped }
    },
    async createSession(workspaceId: string, title: string | undefined, execution: ExecuteOptions): Promise<Session> {
      if (!options.workspaces)
        throw new CommandError('CAPABILITY_UNAVAILABLE', 'This runtime cannot create Host sessions')
      if (!execution.idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'Session creation requires an internal idempotency key')
      let value: unknown
      try {
        value = await options.workspaces.execute(
          'session.create',
          { workspaceId, ...(title === undefined ? {} : { title }) },
          execution,
        )
      } catch (error) {
        if (error instanceof HbarError) throw new CommandError(error.code, error.message)
        throw error
      }
      const session = decode(sessionSchema, value)
      if (session.workspaceId !== workspaceId || session.archived)
        throw new CommandError('INVALID_OUTPUT', 'Created session does not match its workspace')
      if (!disposed && !execution.signal?.aborted) mergeSessions([session])
      return session
    },
    async renameSession(
      sessionId: string,
      title: string,
      execution: ExecuteOptions,
      expectedTitle?: string,
    ): Promise<Session> {
      if (!options.workspaces)
        throw new CommandError('CAPABILITY_UNAVAILABLE', 'This runtime cannot rename Host sessions')
      let value: unknown
      try {
        value = await options.workspaces.execute(
          'session.rename',
          {
            sessionId,
            title,
            ...(expectedTitle === undefined ? {} : { expectedTitle }),
          },
          execution,
        )
      } catch (error) {
        if (error instanceof HbarError) throw new CommandError(error.code, error.message)
        throw error
      }
      const session = decode(sessionSchema, value)
      if (session.id !== sessionId || session.title !== title || session.archived)
        throw new CommandError('INVALID_OUTPUT', 'Renamed session does not match its command')
      if (!disposed && !execution.signal?.aborted) mergeSessions([session])
      return session
    },
    async archiveSession(sessionId: string, archived: boolean, execution: ExecuteOptions): Promise<Session> {
      if (!options.workspaces)
        throw new CommandError('CAPABILITY_UNAVAILABLE', 'This runtime cannot archive Host sessions')
      const projection = captureSessionProjection(sessionId)
      const release = () => projection.dispose()
      execution.signal?.addEventListener('abort', release, { once: true })
      try {
        const value = await options.workspaces.execute('session.archive', { sessionId, archived }, execution)
        const session = decode(sessionSchema, value)
        if (session.id !== sessionId || session.archived !== archived)
          throw new CommandError('INVALID_OUTPUT', 'Archived session does not match its command')
        if (!disposed && !execution.signal?.aborted && !olderThanFloor(session, projection.floor)) {
          const accepted = mergeSessions([session])
          if (accepted.some((fact) => fact.archived)) onSessionUnavailable(session.id)
        }
        return session
      } catch (error) {
        if (error instanceof HbarError) throw new CommandError(error.code, error.message)
        throw error
      } finally {
        execution.signal?.removeEventListener('abort', release)
        release()
      }
    },
    async openWorkspace(path: string, execution: ExecuteOptions): Promise<Workspace> {
      if (!options.workspaces)
        throw new CommandError('CAPABILITY_UNAVAILABLE', 'This runtime cannot register Host workspaces')
      let value: unknown
      try {
        value = await options.workspaces.execute('workspace.create', { path }, execution)
      } catch (error) {
        if (error instanceof HbarError) throw new CommandError(error.code, error.message)
        throw error
      }
      const workspace = decode(workspaceSchema, value)
      if (!disposed && !execution.signal?.aborted) mergeWorkspaces([workspace])
      return workspace
    },
    registry: remote,
    reader: directory.reader,
    dispose() {
      disposed = true
      remote.dispose()
      observational.dispose()
      directory.dispose()
      requests.clear()
      pendingSessionProjections.clear()
      for (const fence of pageFences) fence.dispose()
      pageFences.clear()
      confirmedSessionListeners.clear()
    },
  }
}
export type DirectoryQueries = ReturnType<typeof createDirectoryModule>['queries']
