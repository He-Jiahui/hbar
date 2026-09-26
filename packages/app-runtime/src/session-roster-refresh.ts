import { CommandError, defineCommand, type CommandExecutor, type CommandRegistry } from '@hbar/commands'
import { idSchema } from '@hbar/contracts'
import { sessionPageSchema, sessionSchema, type Session } from '@hbar/contracts/directory'
import { z } from 'zod'
import { createState, type StateReader } from './state'
import type { DirectoryState } from './types'
import { createSessionProjectionFence, type ConfirmedSessionSubscriber } from './session-projection-fence'

export const SESSION_ROSTER_PAGE_SIZE = 100
export const SESSION_ROSTER_AUTO_CHECK_LIMIT = 100
export const SESSION_ROSTER_MAX_CHECKS = 1000
const READ_CONCURRENCY = 4
const REFRESH_TIMEOUT_MS = 30_000

export interface RosterMissingSession {
  readonly id: string
  readonly workspaceId: string
  readonly seq: number
  readonly updatedAt: number
}
export interface SessionRosterRefreshEntry {
  readonly workspaceId: string
  readonly mode: 'manual' | 'automatic'
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly error: string | null
  readonly checked: number
  readonly remaining: number
  readonly truncated: boolean
  readonly skipped: number
}
export interface SessionRosterRefreshState {
  readonly entries: Readonly<Record<string, SessionRosterRefreshEntry>>
}
export interface SessionRosterRefreshOptions {
  readonly directory: StateReader<DirectoryState>
  readonly host: CommandExecutor
  readonly subscribeConfirmedSessions: ConfirmedSessionSubscriber
  readonly reconcile: (
    items: readonly Session[],
    absent: readonly RosterMissingSession[],
  ) => { readonly skipped: number }
  readonly onSubscriberError: (error: unknown) => void
  readonly isDisposed: () => boolean
  /** Test-only injection; production requests always have a bounded deadline. */
  readonly timeoutMs?: number
}

const target = z.strictObject({ workspaceId: idSchema, mode: z.enum(['manual', 'automatic']).default('manual') })
const metadata = (id: string, kind: 'query' | 'command') => ({
  id,
  version: 1,
  owner: 'hbar.app-runtime',
  kind,
  execution: 'client' as const,
  stateEffect: kind === 'query' ? ('none' as const) : ('application' as const),
  scope: 'workspace' as const,
  category: 'navigation.sessions',
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('cli' | 'tui' | 'api' | 'palette')[],
  visibility: 'internal' as const,
  cancelMode: 'cooperative' as const,
  maxConcurrent: 8,
})
export const sessionRosterRefreshCommands = {
  'sessionRoster.refresh': defineCommand(metadata('sessionRoster.refresh', 'query'), target, target),
  'sessionRoster.invalidate': defineCommand(
    metadata('sessionRoster.invalidate', 'command'),
    z.strictObject({}),
    z.strictObject({}),
  ),
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'EXECUTION_FAILED'
}

/** Directory remains the only session fact source. This module owns read lifecycle, not selection or drafts. */
export function createSessionRosterRefresh(local: CommandRegistry, options: SessionRosterRefreshOptions) {
  const state = createState<SessionRosterRefreshState>({ entries: {} }, options.onSubscriberError)
  let disposed = false
  let generation = 0
  const pending = new Map<
    string,
    { readonly path: string; readonly controller: AbortController; readonly promise: Promise<void> }
  >()
  const rotation = new Map<string, string>()
  const write = (entry: SessionRosterRefreshEntry) => {
    const entries = { ...state.reader.getSnapshot().entries, [entry.workspaceId]: entry }
    // Match the canonical directory's bounded workspace cache.
    for (const id of Object.keys(entries)) if (!options.directory.getSnapshot().workspaces[id]) delete entries[id]
    state.replace({ entries })
  }
  const invalidate = () => {
    generation++
    for (const request of pending.values()) request.controller.abort()
    pending.clear()
    rotation.clear()
    state.replace({ entries: {} })
  }
  const stopDirectory = options.directory.subscribe(() => {
    if ([...pending].some(([id, request]) => options.directory.getSnapshot().workspaces[id]?.path !== request.path))
      invalidate()
  })
  local.register(sessionRosterRefreshCommands['sessionRoster.invalidate'], () => {
    invalidate()
    return {}
  })
  local.register(sessionRosterRefreshCommands['sessionRoster.refresh'], async (input, execution) => {
    const workspace = options.directory.getSnapshot().workspaces[input.workspaceId]
    if (!workspace) throw new CommandError('STALE_TARGET', 'Session roster project is unavailable')
    if (disposed || options.isDisposed() || execution.signal.aborted)
      throw new CommandError('CANCELLED', 'Session roster refresh was cancelled')
    const existing = pending.get(input.workspaceId)
    if (existing) {
      const cancelled = Promise.withResolvers<never>()
      const onAbort = () => cancelled.reject(new CommandError('CANCELLED', 'Joined roster refresh was cancelled'))
      execution.signal.addEventListener('abort', onAbort, { once: true })
      try {
        await Promise.race([existing.promise, cancelled.promise])
      } finally {
        execution.signal.removeEventListener('abort', onAbort)
      }
      return input
    }
    const capturedGeneration = generation
    const controller = new AbortController()
    let cancelledCode = 'CANCELLED'
    const abort = () => controller.abort()
    execution.signal.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => {
      cancelledCode = 'TIMEOUT'
      controller.abort()
    }, options.timeoutMs ?? REFRESH_TIMEOUT_MS)
    const isCurrent = () =>
      !disposed &&
      !options.isDisposed() &&
      generation === capturedGeneration &&
      options.directory.getSnapshot().workspaces[input.workspaceId]?.path === workspace.path
    const read = async (name: string, value: unknown): Promise<unknown> => {
      if (controller.signal.aborted) throw new CommandError(cancelledCode, 'Session roster read was cancelled')
      // The SDK transport may not abort its network work. Stop waiting and discard every late response.
      const cancelled = Promise.withResolvers<never>()
      const onAbort = () => cancelled.reject(new CommandError(cancelledCode, 'Session roster read was cancelled'))
      controller.signal.addEventListener('abort', onAbort, { once: true })
      try {
        return await Promise.race([options.host.execute(name, value, { signal: controller.signal }), cancelled.promise])
      } finally {
        controller.signal.removeEventListener('abort', onAbort)
      }
    }
    write({
      workspaceId: input.workspaceId,
      mode: input.mode,
      status: 'loading',
      error: null,
      checked: 0,
      remaining: 0,
      truncated: false,
      skipped: 0,
    })
    const promise = (async () => {
      const projection = createSessionProjectionFence(
        input.workspaceId,
        Object.values(options.directory.getSnapshot().sessions),
        options.subscribeConfirmedSessions,
      )
      try {
        const prior = Object.values(options.directory.getSnapshot().sessions)
          .filter((item) => item.workspaceId === input.workspaceId && !item.archived)
          .sort((left, right) => left.id.localeCompare(right.id))
        const items = new Map<string, Session>()
        let after: string | undefined
        let truncated = false
        // Host pagination is ID ordered, not updatedAt ordered. Scan to end/cap for later-page creations.
        for (let pageIndex = 0; pageIndex < SESSION_ROSTER_MAX_CHECKS / SESSION_ROSTER_PAGE_SIZE; pageIndex++) {
          const parsed = sessionPageSchema.safeParse(
            await read('session.list', {
              workspaceId: input.workspaceId,
              limit: SESSION_ROSTER_PAGE_SIZE,
              ...(after === undefined ? {} : { after }),
            }),
          )
          if (!parsed.success) throw new CommandError('INVALID_OUTPUT', 'Session roster page is invalid')
          let previous = after
          for (const item of parsed.data.items) {
            if (
              item.workspaceId !== input.workspaceId ||
              item.archived ||
              items.has(item.id) ||
              (previous !== undefined && item.id <= previous)
            )
              throw new CommandError('INVALID_OUTPUT', 'Session roster page does not match its project or cursor')
            items.set(item.id, item)
            previous = item.id
          }
          if (
            parsed.data.nextCursor !== null &&
            (!previous ||
              parsed.data.nextCursor !== previous ||
              (after !== undefined && parsed.data.nextCursor <= after))
          )
            throw new CommandError('INVALID_OUTPUT', 'Session roster cursor did not advance')
          if (!isCurrent() || controller.signal.aborted) return
          if (parsed.data.nextCursor === null) break
          after = parsed.data.nextCursor
          truncated = pageIndex === SESSION_ROSTER_MAX_CHECKS / SESSION_ROSTER_PAGE_SIZE - 1
        }
        const older = prior.filter((item) => !items.has(item.id))
        const last = rotation.get(input.workspaceId)
        const pivot = last ? older.findIndex((item) => item.id.localeCompare(last) > 0) : 0
        const ordered = pivot > 0 ? [...older.slice(pivot), ...older.slice(0, pivot)] : older
        const checks = ordered.slice(
          0,
          input.mode === 'manual' ? SESSION_ROSTER_MAX_CHECKS : SESSION_ROSTER_AUTO_CHECK_LIMIT,
        )
        const absent: RosterMissingSession[] = []
        let next = 0
        let checked = 0
        let failure: string | null = null
        const worker = async () => {
          while (next < checks.length && isCurrent() && !controller.signal.aborted) {
            const candidate = checks[next++]
            if (!candidate) return
            try {
              const parsed = sessionSchema.nullable().safeParse(await read('session.get', { sessionId: candidate.id }))
              if (
                !parsed.success ||
                (parsed.data && (parsed.data.id !== candidate.id || parsed.data.workspaceId !== input.workspaceId))
              )
                throw new CommandError('INVALID_OUTPUT', 'Session roster member does not match its project')
              if (!isCurrent() || controller.signal.aborted) return
              if (parsed.data) items.set(candidate.id, parsed.data)
              else absent.push(candidate)
              checked++
            } catch (error) {
              failure ??= errorCode(error)
            }
          }
        }
        await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, checks.length) }, worker))
        if (!isCurrent()) return
        if (controller.signal.aborted) {
          if (cancelledCode === 'CANCELLED')
            throw new CommandError(cancelledCode, 'Session roster refresh was cancelled')
          failure ??= cancelledCode
        }
        // Absence from the first page never removes a previously loaded later-page member.
        const authoritative = projection.filter([...items.values()])
        const authoritativeAbsent = projection.filter(absent)
        if (projection.overflow) failure ??= 'QUERY_SUPERSEDED'
        const { skipped } = options.reconcile(authoritative, authoritativeAbsent)
        const lastChecked = checks.at(-1)
        if (lastChecked && !controller.signal.aborted) rotation.set(input.workspaceId, lastChecked.id)
        write({
          workspaceId: input.workspaceId,
          mode: input.mode,
          status: failure ? 'error' : 'ready',
          error: failure,
          checked:
            checked +
            prior.filter((item) => items.has(item.id) && !checks.some((check) => check.id === item.id)).length,
          remaining: older.length - checked,
          truncated,
          skipped,
        })
        if (failure) throw new CommandError(failure, 'Some session roster members could not be verified')
      } catch (error) {
        if (isCurrent()) {
          const current = state.reader.getSnapshot().entries[input.workspaceId]
          write({
            workspaceId: input.workspaceId,
            mode: input.mode,
            status: 'error',
            error: errorCode(error),
            checked: current?.checked ?? 0,
            remaining: current?.remaining ?? 0,
            truncated: current?.truncated ?? false,
            skipped: current?.skipped ?? 0,
          })
        }
        throw error
      } finally {
        projection.dispose()
        clearTimeout(timer)
        execution.signal.removeEventListener('abort', abort)
        if (pending.get(input.workspaceId)?.controller === controller) pending.delete(input.workspaceId)
      }
    })()
    pending.set(input.workspaceId, { path: workspace.path, controller, promise })
    await promise
    return input
  })
  return {
    reader: state.reader,
    dispose() {
      disposed = true
      invalidate()
      stopDirectory()
      rotation.clear()
      state.dispose()
    },
  }
}
