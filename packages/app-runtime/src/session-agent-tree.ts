import { CommandError, type CommandRegistry, type ExecuteOptions } from '@hbar/commands'
import { defineCommand } from '@hbar/commands/protocol'
import type { Session } from '@hbar/contracts/directory'
import type { SessionActivityExecution, SessionAgentChildrenPage } from '@hbar/contracts/sidebar-directory'
import { z } from 'zod'
import type { DirectoryQueries } from './directory'
import { createState, type StateReader } from './state'
import type { DirectoryState, NavigationState, RuntimeOptions } from './types'

const MAX_BRANCHES = 32
const MAX_ROWS = 256
const BRANCH_LIMIT = 128
const PAGE_SIZE = 50
const MAX_READS = 4
const target = z.strictObject({ parentSessionId: z.string().min(1).max(160) })
const output = z.strictObject({ status: z.enum(['ready', 'error']), error: z.string().nullable() })
function metadata(id: string) {
  return {
    id,
    version: 1,
    owner: 'hbar.session-agent-tree',
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
function command(id: string) {
  return defineCommand(metadata(id), target, output)
}
const branchCommands = {
  'sessionAgentTree.toggle': command('sessionAgentTree.toggle'),
  'sessionAgentTree.refresh': command('sessionAgentTree.refresh'),
  'sessionAgentTree.loadMore': command('sessionAgentTree.loadMore'),
}
export const sessionAgentTreeCommands = {
  ...branchCommands,
  'sessionAgentTree.reveal': defineCommand(
    metadata('sessionAgentTree.reveal'),
    z.strictObject({ sessionId: z.string().min(1).max(160) }),
    output,
  ),
}
export interface SessionAgentTreeRow {
  readonly sessionId: string
  readonly lastResponseAt: number | null
  readonly agentChildCount: number
  readonly execution: Readonly<SessionActivityExecution>
}
export interface SessionAgentTreeBranch {
  readonly expanded: boolean
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly rows: readonly SessionAgentTreeRow[]
  readonly totalCount: number
  readonly nextCursor: SessionAgentChildrenPage['nextCursor']
  readonly limitReached: boolean
  readonly error: string | null
}
export interface SessionAgentTreeState {
  readonly branches: Readonly<Record<string, SessionAgentTreeBranch>>
  /** Only a Host-verified root may be revealed outside the ordinary root page. */
  readonly revealedRoot: {
    readonly sessionId: string
    readonly workspaceId: string
    readonly agentChildCount: number
    readonly execution: Readonly<SessionActivityExecution>
  } | null
  readonly pathIds: readonly string[]
  readonly revealError: string | null
}
interface Options {
  readonly queries: DirectoryQueries
  readonly directory: StateReader<DirectoryState>
  readonly navigation: StateReader<NavigationState>
  readonly projectSessions: (ids: readonly string[], facts: readonly Session[]) => void
  readonly subscribeConfirmedSessions: (listener: (facts: readonly Session[]) => void) => () => void
  readonly events?: RuntimeOptions['sidebarActivityEvents']
  readonly onSubscriberError: (error: unknown) => void
}
const emptyBranch: SessionAgentTreeBranch = {
  expanded: false,
  status: 'idle',
  rows: [],
  totalCount: 0,
  nextCursor: null,
  limitReached: false,
  error: null,
}
function errorCode(error: unknown): string {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'QUERY_FAILED'
}

/** Response ordering belongs to the Host; this owner retains IDs and immutable query metadata only. */
export function createSessionAgentTree(registry: CommandRegistry, options: Options) {
  const state = createState<SessionAgentTreeState>(
    { branches: {}, revealedRoot: null, pathIds: [], revealError: null },
    options.onSubscriberError,
  )
  const pending = new Map<string, AbortController>()
  let reveal: AbortController | null = null
  let selectedId: string | null = null
  let disposed = false
  let connected = true
  let projecting = false
  let refreshing = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const current = state.reader.getSnapshot
  function retain(facts: readonly Session[] = []) {
    const snapshot = current()
    const ids = new Set(snapshot.pathIds)
    for (const [parentId, branch] of Object.entries(snapshot.branches)) {
      if (!branch.expanded) continue
      ids.add(parentId)
      for (const row of branch.rows) ids.add(row.sessionId)
    }
    projecting = true
    try {
      options.projectSessions(
        [...ids],
        facts.filter((fact) => ids.has(fact.id)),
      )
    } finally {
      projecting = false
    }
  }
  function update(parentId: string, branch: SessionAgentTreeBranch) {
    state.replace({ ...current(), branches: { ...current().branches, [parentId]: branch } })
  }
  function allocate(parentId: string): boolean {
    if (current().branches[parentId]) return true
    const entries = Object.entries(current().branches)
    if (entries.length >= MAX_BRANCHES) {
      const candidate = entries.find(([id, branch]) => !branch.expanded && !current().pathIds.includes(id))
      if (!candidate) {
        state.replace({ ...current(), revealError: 'CAPACITY_EXCEEDED' })
        return false
      }
      state.replace({ ...current(), branches: Object.fromEntries(entries.filter(([id]) => id !== candidate[0])) })
    }
    update(parentId, emptyBranch)
    return true
  }
  function collapse(parentId: string) {
    const branches = { ...current().branches }
    const queue = [parentId]
    const visited = new Set<string>()
    while (queue.length) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      pending.get(id)?.abort()
      pending.delete(id)
      const branch = branches[id]
      if (!branch) continue
      queue.push(...branch.rows.map((row) => row.sessionId))
      branches[id] = { ...emptyBranch, totalCount: branch.totalCount }
    }
    state.replace({
      ...current(),
      branches,
      revealError: current().revealError === 'CAPACITY_EXCEEDED' ? null : current().revealError,
    })
    retain()
  }
  function ordered(rows: readonly SessionAgentTreeRow[]): SessionAgentTreeRow[] {
    const sessions = options.directory.getSnapshot().sessions
    return [...rows].sort(
      (a, b) =>
        (b.lastResponseAt ?? 0) - (a.lastResponseAt ?? 0) ||
        (sessions[b.sessionId]?.createdAt ?? 0) - (sessions[a.sessionId]?.createdAt ?? 0) ||
        (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0),
    )
  }
  async function readBranch(parentId: string, append = false, includeSessionId?: string, execution?: ExecuteOptions) {
    if (disposed || options.directory.getSnapshot().deletedSessions?.[parentId] || !allocate(parentId)) return
    const pathIndex = current().pathIds.indexOf(parentId)
    includeSessionId ??= pathIndex < 0 ? undefined : current().pathIds[pathIndex + 1]
    const prior = current().branches[parentId]!
    if (!connected) {
      update(parentId, { ...prior, expanded: true, status: 'error', error: 'DISCONNECTED' })
      return
    }
    if (pending.has(parentId)) pending.get(parentId)?.abort()
    pending.delete(parentId)
    if (pending.size >= MAX_READS) {
      update(parentId, { ...prior, expanded: true, status: 'error', error: 'BUSY' })
      return
    }
    const controller = new AbortController()
    pending.set(parentId, controller)
    const abort = () => controller.abort()
    execution?.signal?.addEventListener('abort', abort, { once: true })
    if (execution?.signal?.aborted) controller.abort()
    const timeout = setTimeout(abort, 20_000)
    const valid = () => !disposed && !controller.signal.aborted && pending.get(parentId) === controller
    update(parentId, { ...prior, expanded: true, status: 'loading', error: null })
    retain()
    try {
      const outsideRows = Object.entries(current().branches).reduce(
        (count, [id, branch]) => count + (id === parentId ? 0 : branch.rows.length),
        0,
      )
      const maximum = Math.min(BRANCH_LIMIT, MAX_ROWS - outsideRows)
      const base = append ? prior.rows : []
      if (maximum <= base.length) {
        update(parentId, { ...prior, expanded: true, status: 'ready', limitReached: true, error: null })
        return
      }
      let cursor = append ? prior.nextCursor : null
      const desired = append
        ? Math.min(maximum, base.length + PAGE_SIZE)
        : Math.min(maximum, Math.max(PAGE_SIZE, prior.rows.length))
      const rows = new Map(base.map((row) => [row.sessionId, row]))
      const facts = new Map<string, Session>()
      let totalCount = prior.totalCount
      // Three normal pages cover the 128-child limit; a fourth permits the included active row.
      for (let pageIndex = 0; pageIndex < 4; pageIndex++) {
        const page = await options.queries.execute(
          'session.agentChildren.list',
          {
            parentSessionId: parentId,
            limit: Math.max(
              1,
              Math.min(PAGE_SIZE, maximum - rows.size - (includeSessionId && !rows.has(includeSessionId) ? 1 : 0)),
            ),
            ...(cursor ? { cursor } : {}),
            ...(includeSessionId ? { includeSessionId } : {}),
          },
          { signal: controller.signal },
        )
        if (!valid()) return
        totalCount = page.totalCount
        for (const item of [...page.items, ...(page.includedItem ? [page.includedItem] : [])]) {
          facts.set(item.session.id, item.session)
          rows.set(item.session.id, {
            sessionId: item.session.id,
            lastResponseAt: item.lastResponseAt,
            agentChildCount: item.agentChildCount,
            execution: item.execution,
          })
        }
        cursor = page.nextCursor
        if (!cursor || rows.size >= desired) break
      }
      if (!valid()) return
      if (rows.size > maximum) throw new CommandError('CAPACITY_EXCEEDED', 'Agent tree row budget exhausted')
      const branch: SessionAgentTreeBranch = {
        expanded: true,
        status: 'ready',
        rows: [...rows.values()],
        totalCount,
        nextCursor: cursor,
        limitReached: rows.size >= maximum && cursor !== null,
        error: null,
      }
      update(parentId, branch)
      retain([...facts.values()])
      const canonical = options.directory.getSnapshot().sessions
      update(parentId, {
        ...branch,
        rows: ordered(
          branch.rows.filter((row) => {
            const session = canonical[row.sessionId]
            return session && !session.archived && session.parentId === parentId
          }),
        ),
      })
    } catch (error) {
      if (!valid()) return
      if (append && errorCode(error) === 'STALE_CURSOR') {
        pending.delete(parentId)
        await readBranch(parentId, false, includeSessionId, execution)
        return
      }
      update(parentId, { ...prior, expanded: true, status: 'error', error: errorCode(error) })
    } finally {
      clearTimeout(timeout)
      execution?.signal?.removeEventListener('abort', abort)
      if (pending.get(parentId) === controller) {
        pending.delete(parentId)
        if (controller.signal.aborted && !disposed && current().branches[parentId]?.expanded)
          update(parentId, {
            ...current().branches[parentId]!,
            status: 'error',
            error: connected ? 'QUERY_TIMEOUT' : 'DISCONNECTED',
          })
      }
      if (!disposed) retain()
    }
  }
  async function revealSelection(sessionId: string) {
    if (options.directory.getSnapshot().deletedSessions?.[sessionId]) return
    reveal?.abort()
    const controller = new AbortController()
    reveal = controller
    const timeout = setTimeout(() => controller.abort(), 20_000)
    const valid = () =>
      !disposed &&
      !controller.signal.aborted &&
      reveal === controller &&
      selectedId === sessionId &&
      !options.directory.getSnapshot().deletedSessions?.[sessionId]
    try {
      const path = await options.queries.execute(
        'session.agentAncestors.get',
        { sessionId },
        { signal: controller.signal },
      )
      if (!valid()) return
      if (path.items.length === 1) {
        state.replace({ ...current(), revealedRoot: null, pathIds: [], revealError: null })
        retain()
        return
      }
      if (path.items.some((item) => item.session.archived))
        throw new CommandError('SESSION_UNAVAILABLE', 'Agent path is archived')
      const root = path.items[0]!
      const execution = await options.queries.execute(
        'session.execution.get',
        {
          workspaceId: root.session.workspaceId,
          sessionId: root.session.id,
        },
        { signal: controller.signal },
      )
      if (!valid()) return
      state.replace({
        ...current(),
        pathIds: path.items.map((item) => item.session.id),
        revealError: null,
        revealedRoot: {
          sessionId: root.session.id,
          workspaceId: root.session.workspaceId,
          agentChildCount: root.agentChildCount,
          execution: execution.execution,
        },
      })
      retain(path.items.map((item) => item.session))
      for (let index = 0; index < path.items.length - 1; index++) {
        if (!valid()) return
        await readBranch(path.items[index]!.session.id, false, path.items[index + 1]!.session.id, {
          signal: controller.signal,
        })
      }
    } catch (error) {
      if (valid()) state.replace({ ...current(), revealError: errorCode(error) })
    } finally {
      clearTimeout(timeout)
      if (reveal === controller) {
        reveal = null
        if (
          controller.signal.aborted &&
          !disposed &&
          selectedId === sessionId &&
          !options.directory.getSnapshot().deletedSessions?.[sessionId]
        )
          state.replace({ ...current(), revealError: connected ? 'QUERY_TIMEOUT' : 'DISCONNECTED' })
      }
    }
  }
  function navigationChanged() {
    const id = options.navigation.getSnapshot().sessionId
    if (id === selectedId) return
    selectedId = id
    reveal?.abort()
    state.replace({ ...current(), revealedRoot: null, pathIds: [], revealError: null })
    retain()
    if (id && connected) void revealSelection(id)
  }
  function queueRefresh() {
    if (disposed || !connected || timer) return
    timer = setTimeout(() => {
      timer = undefined
      if (disposed || !connected) return
      if (pending.size > 0 || refreshing) {
        queueRefresh()
        return
      }
      const parents = Object.entries(current().branches)
        .filter(([, branch]) => branch.expanded)
        .map(([id]) => id)
      refreshing = true
      void (async () => {
        try {
          for (let index = 0; index < parents.length; index += MAX_READS) {
            if (disposed || !connected) return
            await Promise.all(
              parents
                .slice(index, index + MAX_READS)
                .filter((id) => current().branches[id]?.expanded)
                .map((id) => {
                  const pathIndex = current().pathIds.indexOf(id)
                  return readBranch(id, false, pathIndex < 0 ? undefined : current().pathIds[pathIndex + 1])
                }),
            )
          }
        } finally {
          refreshing = false
        }
      })().catch(options.onSubscriberError)
    }, 120)
  }
  const stopNavigation = options.navigation.subscribe(navigationChanged)
  let seenDeletions = options.directory.getSnapshot().deletedSessions
  const stopDirectory = options.directory.subscribe(() => {
    const deleted = options.directory.getSnapshot().deletedSessions
    if (disposed || deleted === seenDeletions) return
    seenDeletions = deleted
    const branches = { ...current().branches }
    let changed = false
    for (const [id, branch] of Object.entries(branches)) {
      const rows = branch.rows.filter((row) => !deleted?.[row.sessionId])
      if (!deleted?.[id] && rows.length === branch.rows.length) continue
      pending.get(id)?.abort()
      pending.delete(id)
      if (deleted?.[id]) delete branches[id]
      else branches[id] = { ...branch, rows, status: 'ready', error: null }
      changed = true
    }
    const pathDeleted = Boolean((selectedId && deleted?.[selectedId]) || current().pathIds.some((id) => deleted?.[id]))
    if (pathDeleted) {
      reveal?.abort()
      reveal = null
    }
    if (!changed && !pathDeleted) return
    state.replace({
      ...current(),
      branches,
      ...(pathDeleted ? { revealedRoot: null, pathIds: [], revealError: null } : {}),
    })
    retain()
    queueRefresh()
  })
  const stopFacts = options.subscribeConfirmedSessions((facts) => {
    if (projecting || disposed) return
    let changed = false
    const archivedParents: string[] = []
    const branches = { ...current().branches }
    for (const [id, branch] of Object.entries(branches)) {
      const rows = branch.rows.filter(
        (row) => !facts.some((fact) => fact.id === row.sessionId && (fact.archived || fact.parentId !== id)),
      )
      if (rows.length !== branch.rows.length) {
        branches[id] = { ...branch, rows }
        changed = true
      }
      if (facts.some((fact) => fact.id === id && fact.archived)) archivedParents.push(id)
    }
    if (changed) {
      state.replace({ ...current(), branches })
      retain()
      queueRefresh()
    }
    for (const id of archivedParents) collapse(id)
  })
  const stopEvents = options.events?.subscribe(queueRefresh) ?? (() => {})
  const stopConnection =
    options.events?.onConnection?.((value) => {
      connected = value
      if (!value) {
        reveal?.abort()
        for (const controller of pending.values()) controller.abort()
        for (const [id, branch] of Object.entries(current().branches))
          if (branch.expanded) update(id, { ...branch, status: 'error', error: 'DISCONNECTED' })
      } else {
        queueRefresh()
        if (selectedId) void revealSelection(selectedId)
      }
    }) ?? (() => {})
  registry.register(sessionAgentTreeCommands['sessionAgentTree.reveal'], async (input) => {
    if (selectedId !== input.sessionId) throw new CommandError('STALE_TARGET', 'Selected Session changed')
    await revealSelection(input.sessionId)
    const error = current().revealError
    return { status: error ? ('error' as const) : ('ready' as const), error }
  })
  for (const [name, definition] of Object.entries(branchCommands)) {
    registry.register(definition, async (input, execution) => {
      const id = input.parentSessionId
      if (name === 'sessionAgentTree.toggle' && current().branches[id]?.expanded) collapse(id)
      else if (name !== 'sessionAgentTree.loadMore' || current().branches[id]?.nextCursor)
        await readBranch(id, name === 'sessionAgentTree.loadMore', undefined, execution)
      const error = current().branches[id]?.error ?? (current().branches[id] ? null : 'CAPACITY_EXCEEDED')
      return { status: error ? ('error' as const) : ('ready' as const), error }
    })
  }
  navigationChanged()
  return {
    reader: state.reader,
    dispose() {
      disposed = true
      stopNavigation()
      stopDirectory()
      stopFacts()
      stopEvents()
      stopConnection()
      if (timer) clearTimeout(timer)
      reveal?.abort()
      for (const controller of pending.values()) controller.abort()
      pending.clear()
      options.projectSessions([], [])
      state.dispose()
    },
  }
}
