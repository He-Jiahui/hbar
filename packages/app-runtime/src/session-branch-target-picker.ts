import { z } from 'zod'
import { CommandError, defineCommand, type CommandExecutor, type CommandRegistry } from '@hbar/commands'
import { idSchema } from '@hbar/contracts'
import {
  sessionBranchTargetPageSchema,
  sessionBranchTargetSelectInputSchema,
  sessionBranchTargetOperationSchema,
  type SessionBranchTargetPage,
  type SessionBranchTargetOperation,
  type SessionBranchTargetSelectInput,
} from '@hbar/contracts/commands/session-branch-target'
import { createState, type StateReader } from './state'
import type { NavigationState } from './types'

export interface SessionBranchTargetPickerEntry {
  readonly sessionId: string
  readonly workspaceId: string
  readonly phase: 'idle' | 'loading' | 'ready' | 'switching' | 'unknown' | 'failed'
  readonly search: string
  readonly page: SessionBranchTargetPage | null
  readonly branches: readonly SessionBranchTargetPage['branches'][number][]
  readonly canLoadMore: boolean
  readonly atCapacity: boolean
  readonly idempotencyKey: string | null
  readonly request: SessionBranchTargetSelectInput | null
  readonly operation: SessionBranchTargetOperation | null
  readonly error: string | null
}
export interface SessionBranchTargetPickerState {
  readonly available: boolean
  readonly entries: Readonly<Record<string, SessionBranchTargetPickerEntry>>
}
const target = z.strictObject({ sessionId: idSchema, workspaceId: idSchema })
const metadata = (id: string, query = false) => ({
  id,
  version: 1,
  owner: 'hbar.app-runtime',
  kind: query ? ('query' as const) : ('command' as const),
  execution: 'client' as const,
  stateEffect: query ? ('none' as const) : ('application' as const),
  scope: 'session' as const,
  category: 'workspace.session-branch-target',
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  visibility: 'internal' as const,
  surfaces: ['api'] as 'api'[],
  maxConcurrent: 8,
  timeoutMs: 95_000,
  cancelMode: 'cooperative' as const,
})
export const sessionBranchTargetPickerCommands = {
  'sessionBranchTargetPicker.refresh': defineCommand(
    metadata('sessionBranchTargetPicker.refresh', true),
    target.extend({ search: z.string().max(256).optional(), more: z.boolean().optional() }),
    target,
  ),
  'sessionBranchTargetPicker.select': defineCommand(
    metadata('sessionBranchTargetPicker.select'),
    sessionBranchTargetSelectInputSchema,
    sessionBranchTargetOperationSchema,
  ),
  'sessionBranchTargetPicker.reconcile': defineCommand(
    metadata('sessionBranchTargetPicker.reconcile'),
    target,
    sessionBranchTargetOperationSchema.nullable(),
  ),
}
const failureCode = (error: unknown) =>
  error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'EXECUTION_FAILED'
const unresolved = (entry: SessionBranchTargetPickerEntry) => entry.phase === 'switching' || entry.phase === 'unknown'
const MAX_VISIBLE_BRANCHES = 200
const rejectedBeforeMutation = new Set([
  'BUSY',
  'COMMAND_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'STALE_TARGET',
  'INVALID_INPUT',
  'INVALID_BRANCH_NAME',
  'BRANCH_EXISTS',
  'CAPABILITY_UNAVAILABLE',
  'NOT_FOUND',
  'SESSION_ARCHIVED',
  'CANCELLED',
  'SESSION_LAUNCH_TARGET_INVALID_ROOT',
  'SESSION_LAUNCH_TARGET_PATH_OCCUPIED',
])

export function createSessionBranchTargetPicker(
  local: CommandRegistry,
  options: {
    readonly host?: CommandExecutor | undefined
    readonly navigation: StateReader<NavigationState>
    readonly busy: (sessionId: string) => boolean
    readonly onSubscriberError: (error: unknown) => void
    readonly isDisposed: () => boolean
    readonly events?:
      | {
          subscribe(listener: () => void): () => void
          onConnection?(listener: (connected: boolean) => void): () => void
        }
      | undefined
  },
) {
  const state = createState<SessionBranchTargetPickerState>(
    { available: Boolean(options.host), entries: {} },
    options.onSubscriberError,
  )
  let disposed = false
  let sequence = 0
  const reads = new Map<string, { generation: number; controller: AbortController }>()
  const selected = (input: { sessionId: string; workspaceId: string }) => {
    const selection = options.navigation.getSnapshot()
    return (
      !disposed &&
      !options.isDisposed() &&
      selection.sessionId === input.sessionId &&
      selection.workspaceId === input.workspaceId
    )
  }
  const entryFor = (input: { sessionId: string; workspaceId: string }): SessionBranchTargetPickerEntry => {
    const existing = state.reader.getSnapshot().entries[input.sessionId]
    if (existing && existing.workspaceId !== input.workspaceId)
      throw new CommandError('STALE_TARGET', 'The session changed workspace')
    return (
      existing ?? {
        ...input,
        phase: 'idle',
        search: '',
        page: null,
        branches: [],
        canLoadMore: false,
        atCapacity: false,
        idempotencyKey: null,
        request: null,
        operation: null,
        error: null,
      }
    )
  }
  const write = (entry: SessionBranchTargetPickerEntry) => {
    if (disposed || options.isDisposed()) return
    const entries = { ...state.reader.getSnapshot().entries }
    const keys = Object.keys(entries)
    if (!entries[entry.sessionId] && keys.length >= 32) {
      const evict = keys.find((key) => !unresolved(entries[key]!))
      if (!evict) throw new CommandError('BUSY', 'Too many unconfirmed branch operations')
      delete entries[evict]
    }
    entries[entry.sessionId] = entry
    state.replace({ available: Boolean(options.host), entries })
  }
  const requireSelected = (input: { sessionId: string; workspaceId: string }) => {
    if (!selected(input)) throw new CommandError('STALE_TARGET', 'The branch picker belongs to another session')
    if (!options.host) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Session branch targets are unavailable')
    return options.host
  }
  const offNavigation = options.navigation.subscribe(() => {
    for (const [sessionId, read] of reads) {
      if (options.navigation.getSnapshot().sessionId === sessionId) continue
      read.controller.abort()
      reads.delete(sessionId)
      const entry = state.reader.getSnapshot().entries[sessionId]
      if (entry?.phase === 'loading') write({ ...entry, phase: entry.page ? 'ready' : 'idle' })
    }
  })
  const refreshHint = () => {
    const current = options.navigation.getSnapshot()
    if (disposed || !current.sessionId || !current.workspaceId) return
    void local
      .execute('sessionBranchTargetPicker.refresh', { sessionId: current.sessionId, workspaceId: current.workspaceId })
      .catch(() => undefined)
  }
  const offEvents = options.events?.subscribe(refreshHint)
  const offConnection = options.events?.onConnection?.((connected) => {
    if (connected) refreshHint()
    else {
      for (const read of reads.values()) read.controller.abort()
      reads.clear()
    }
  })
  local.register(sessionBranchTargetPickerCommands['sessionBranchTargetPicker.refresh'], async (input, execution) => {
    const host = requireSelected(input)
    const initial = entryFor(input)
    if (initial.phase === 'switching') return { sessionId: input.sessionId, workspaceId: input.workspaceId }
    const search = input.search ?? initial.search
    const cursor = input.more && search === initial.search ? initial.page?.nextCursor : null
    if (input.more && (!cursor || initial.branches.length >= MAX_VISIBLE_BRANCHES))
      return { sessionId: input.sessionId, workspaceId: input.workspaceId }
    reads.get(input.sessionId)?.controller.abort()
    const controller = new AbortController()
    const generation = ++sequence
    reads.set(input.sessionId, { generation, controller })
    const signal = AbortSignal.any([controller.signal, execution.signal])
    const current = () => selected(input) && !signal.aborted && reads.get(input.sessionId)?.generation === generation
    write({
      ...initial,
      search,
      phase: unresolved(initial) ? initial.phase : 'loading',
      error: unresolved(initial) ? initial.error : null,
    })
    try {
      const page = sessionBranchTargetPageSchema.parse(
        await host.execute(
          'sessionBranchTarget.list',
          {
            sessionId: input.sessionId,
            workspaceId: input.workspaceId,
            search,
            limit: 50,
            ...(cursor ? { cursor } : {}),
          },
          { signal },
        ),
      )
      if (page.sessionId !== input.sessionId || page.workspaceId !== input.workspaceId)
        throw new CommandError('INVALID_OUTPUT', 'Branch page belongs to another session')
      if (current()) {
        const latest = entryFor(input)
        const branches = cursor
          ? [
              ...latest.branches,
              ...page.branches.filter((branch) => !latest.branches.some((existing) => existing.ref === branch.ref)),
            ].slice(0, MAX_VISIBLE_BRANCHES)
          : page.branches
        const pending = page.pending
        write({
          ...latest,
          page,
          branches,
          canLoadMore: Boolean(page.nextCursor) && branches.length < MAX_VISIBLE_BRANCHES,
          atCapacity: branches.length >= MAX_VISIBLE_BRANCHES,
          search,
          phase: pending ? 'unknown' : unresolved(latest) && latest.idempotencyKey ? latest.phase : 'ready',
          idempotencyKey: pending?.owned ? pending.idempotencyKey! : latest.idempotencyKey,
          request: pending?.owned ? pending.request! : latest.request,
          error: pending
            ? pending.owned
              ? 'RESULT_UNKNOWN'
              : 'OPERATION_OTHER_ACTOR'
            : unresolved(latest) && latest.idempotencyKey
              ? latest.error
              : null,
        })
      }
    } catch (error) {
      if (current()) {
        const latest = entryFor(input)
        write({ ...latest, phase: unresolved(latest) ? latest.phase : 'failed', error: failureCode(error) })
      }
      throw error
    } finally {
      if (reads.get(input.sessionId)?.generation === generation) reads.delete(input.sessionId)
    }
    return { sessionId: input.sessionId, workspaceId: input.workspaceId }
  })
  const acceptResult = (entry: SessionBranchTargetPickerEntry, raw: unknown) => {
    const parsed = sessionBranchTargetOperationSchema.safeParse(raw)
    if (!parsed.success) throw new CommandError('RESULT_UNKNOWN', 'The branch operation acknowledgement is invalid')
    const operation = parsed.data
    if (!entry.request || JSON.stringify(operation.request) !== JSON.stringify(entry.request))
      throw new CommandError('RESULT_UNKNOWN', 'The branch acknowledgement does not match its original request')
    const phase = operation.status === 'ready' ? 'ready' : operation.status === 'failed' ? 'failed' : 'unknown'
    write({
      ...entry,
      phase,
      operation,
      page:
        operation.status === 'ready' && entry.page && operation.revision >= entry.page.revision
          ? { ...entry.page, revision: operation.revision, execution: operation.execution!, pending: null }
          : entry.page,
      error: operation.error?.code ?? (phase === 'unknown' ? 'RESULT_UNKNOWN' : null),
    })
    return operation
  }
  const refreshConfirmed = async (input: { sessionId: string; workspaceId: string }) => {
    if (!selected(input)) return
    await local.execute('sessionGitContext.invalidate', input).catch(() => undefined)
    await local.execute('sessionGitContext.refresh', input).catch(() => undefined)
    await local.execute('sessionBranchTargetPicker.refresh', { ...input, search: '' }).catch(() => undefined)
  }
  local.register(sessionBranchTargetPickerCommands['sessionBranchTargetPicker.select'], async (input, execution) => {
    const host = requireSelected(input)
    const initial = entryFor(input)
    if (unresolved(initial) || options.busy(input.sessionId))
      throw new CommandError('BUSY', 'Wait for the current task or branch operation before switching')
    if (!initial.page || initial.page.revision !== input.expectedRevision)
      throw new CommandError('COMMAND_CONFLICT', 'Refresh the branch picker before switching')
    reads.get(input.sessionId)?.controller.abort()
    reads.delete(input.sessionId)
    const entry: SessionBranchTargetPickerEntry = {
      ...initial,
      phase: 'switching',
      idempotencyKey: crypto.randomUUID(),
      request: input,
      operation: null,
      error: null,
    }
    write(entry)
    try {
      const operation = acceptResult(
        entry,
        await host.execute('sessionBranchTarget.select', input, {
          idempotencyKey: entry.idempotencyKey!,
          signal: execution.signal,
        }),
      )
      if (operation.status === 'ready') await refreshConfirmed(input)
      return operation
    } catch (error) {
      write({
        ...entry,
        phase: rejectedBeforeMutation.has(failureCode(error)) ? 'failed' : 'unknown',
        error: failureCode(error),
      })
      throw error
    }
  })
  local.register(sessionBranchTargetPickerCommands['sessionBranchTargetPicker.reconcile'], async (input, execution) => {
    const host = requireSelected(input)
    const entry = entryFor(input)
    if (!entry.idempotencyKey || !entry.request || !unresolved(entry))
      throw new CommandError('INVALID_STATE', 'No original branch operation is available to reconcile')
    if (options.busy(input.sessionId))
      throw new CommandError('BUSY', 'Wait for current tasks before reconciling a branch operation')
    write({ ...entry, phase: 'switching', error: null })
    try {
      const lookup = { sessionId: input.sessionId, idempotencyKey: entry.idempotencyKey }
      const receipt = sessionBranchTargetOperationSchema
        .nullable()
        .parse(await host.execute('sessionBranchTarget.operation', lookup, { signal: execution.signal }))
      if (!receipt) {
        write({ ...entry, phase: 'failed', error: 'OPERATION_NOT_FOUND', idempotencyKey: null, request: null })
        return null
      }
      const operation = acceptResult(
        entry,
        receipt.status === 'ready' || receipt.status === 'failed'
          ? receipt
          : await host.execute('sessionBranchTarget.reconcile', lookup, {
              idempotencyKey: entry.idempotencyKey,
              signal: execution.signal,
            }),
      )
      if (operation.status === 'ready') await refreshConfirmed(input)
      return operation
    } catch (error) {
      write({ ...entry, phase: 'unknown', error: failureCode(error) })
      throw error
    }
  })
  return {
    reader: state.reader,
    dispose() {
      disposed = true
      offNavigation()
      offEvents?.()
      offConnection?.()
      for (const read of reads.values()) read.controller.abort()
      reads.clear()
      state.dispose()
    },
  }
}
