import { createCommandClient, CommandError, type CommandExecutor } from '@hbar/commands'
import {
  usageCommands,
  usageExportResultSchema,
  type UsageAttemptExport,
  type UsageExportInput,
  type UsageFilters,
  type UsageScope,
} from '@hbar/contracts/commands/usage'
import { createState, type StateReader } from './state'

export const USAGE_REQUEST_PAGE_SIZE = 50
export const USAGE_REQUEST_MAX_ITEMS = 400
export const USAGE_REQUEST_MAX_PAGES = 100
export const USAGE_REQUEST_TIMEOUT_MS = 15_000

export type UsageRequestsRange = Pick<UsageExportInput, 'from' | 'to'>

export interface UsageRequestItem {
  readonly id: string
  readonly attemptId: string
  readonly sessionId: string
  readonly workspaceId: string
  readonly runId: string | null
  readonly source: UsageAttemptExport['source']
  readonly providerId: string
  readonly modelId: string
  readonly startedAt: number | null
  readonly firstProviderEventAt: number | null
  readonly firstThinkingAt: number | null
  readonly firstTextAt: number | null
  readonly endedAt: number
  readonly runStatus: UsageAttemptExport['runStatus']
  readonly input: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheWrite: number
  readonly billableTokens: number
  readonly cost: UsageAttemptExport['cost']
  readonly pricingVersion: string | null
}

export interface UsageRequestsState {
  readonly scope: UsageScope
  readonly filters: UsageFilters
  readonly range?: UsageRequestsRange
  readonly items: readonly UsageRequestItem[]
  readonly cursor: string | null
  readonly hasMore: boolean
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly error: string | null
}

export interface UsageRequestsOptions {
  readonly usage?: CommandExecutor
  readonly initialScope?: UsageScope
  readonly filters?: UsageFilters
  readonly onSubscriberError?: (error: unknown) => void
}

export interface UsageRequestsRuntime {
  readonly reader: StateReader<UsageRequestsState>
  readonly refresh: () => Promise<void>
  readonly loadMore: () => Promise<void>
  readonly setScope: (scope: UsageScope, filters?: UsageFilters, range?: UsageRequestsRange) => Promise<void>
  readonly dispose: () => void
}

const defaultScope: UsageScope = { kind: 'global' }

function itemFromAttempt(attempt: UsageAttemptExport): UsageRequestItem {
  return {
    id: attempt.usageId,
    attemptId: attempt.attemptId,
    sessionId: attempt.sessionId,
    workspaceId: attempt.workspaceId,
    runId: attempt.runId,
    source: attempt.source,
    providerId: attempt.providerId,
    modelId: attempt.modelId,
    startedAt: attempt.startedAt,
    firstProviderEventAt: attempt.firstProviderEventAt,
    firstThinkingAt: attempt.firstThinkingAt,
    firstTextAt: attempt.firstTextAt,
    endedAt: attempt.endedAt,
    runStatus: attempt.runStatus,
    input: attempt.input,
    output: attempt.output,
    cacheRead: attempt.cacheRead,
    cacheWrite: attempt.cacheWrite,
    billableTokens: attempt.billableTokens,
    cost: attempt.cost,
    pricingVersion: attempt.pricingVersion,
  }
}

function errorCode(reason: unknown): string {
  if (reason instanceof CommandError) return reason.code
  if (reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string') return reason.code
  return 'EXECUTION_FAILED'
}

function sameScope(left: UsageScope, right: UsageScope): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** Bounded, cancellable request-log projection backed by the public usage.export command. */
export function createUsageRequests(options: UsageRequestsOptions = {}): UsageRequestsRuntime {
  const state = createState<UsageRequestsState>(
    {
      scope: options.initialScope ?? defaultScope,
      filters: options.filters ?? {},
      range: {},
      items: [],
      cursor: null,
      hasMore: false,
      status: 'idle',
      error: null,
    },
    options.onSubscriberError ?? (() => undefined),
  )
  const client = options.usage ? createCommandClient(usageCommands, options.usage) : null
  let disposed = false
  let generation = 0
  let active: { readonly generation: number; readonly controller: AbortController } | null = null
  let pending: Promise<void> | null = null
  let pageCount = 0

  const current = (token: number) => !disposed && generation === token && active?.generation === token
  const request = async (append: boolean, token: number, controller: AbortController) => {
    if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Usage export is unavailable')
    const snapshot = state.reader.getSnapshot()
    const input: UsageExportInput = {
      scope: snapshot.scope,
      filters: snapshot.filters,
      ...snapshot.range,
      limit: USAGE_REQUEST_PAGE_SIZE,
      ...(append && snapshot.cursor ? { after: snapshot.cursor } : {}),
    }
    const timeout = setTimeout(
      () => controller.abort(new CommandError('TIMEOUT', 'Usage export timed out')),
      USAGE_REQUEST_TIMEOUT_MS,
    )
    let removeAbort: () => void = () => undefined
    try {
      const interrupted = new Promise<never>((_resolve, reject) => {
        const onAbort = () =>
          reject(
            controller.signal.reason instanceof Error
              ? controller.signal.reason
              : new CommandError('QUERY_SUPERSEDED', 'Usage export interrupted'),
          )
        controller.signal.addEventListener('abort', onAbort, { once: true })
        removeAbort = () => controller.signal.removeEventListener('abort', onAbort)
      })
      const result = await Promise.race([
        client.execute('usage.export', input, { signal: controller.signal }),
        interrupted,
      ])
      const parsed = usageExportResultSchema.safeParse(result)
      if (!parsed.success) throw new CommandError('INVALID_OUTPUT', 'Usage export response is invalid')
      if (!sameScope(parsed.data.scope, snapshot.scope))
        throw new CommandError('INVALID_OUTPUT', 'Usage export scope changed')
      const unique = new Map<string, UsageRequestItem>()
      if (append) for (const item of snapshot.items) unique.set(item.id, item)
      for (const item of parsed.data.items) unique.set(item.usageId, itemFromAttempt(item))
      const items = [...unique.values()].slice(0, USAGE_REQUEST_MAX_ITEMS)
      if (!current(token)) return
      pageCount = append ? pageCount + 1 : 1
      state.replace({
        ...state.reader.getSnapshot(),
        items,
        cursor: parsed.data.nextCursor ?? null,
        hasMore:
          Boolean(parsed.data.nextCursor) &&
          items.length < USAGE_REQUEST_MAX_ITEMS &&
          pageCount < USAGE_REQUEST_MAX_PAGES,
        status: 'ready',
        error: null,
      })
    } finally {
      clearTimeout(timeout)
      removeAbort()
    }
  }

  const run = (append: boolean) => {
    if (disposed) return Promise.reject(new CommandError('DISPOSED', 'Usage runtime disposed'))
    if (pending) return pending
    const controller = new AbortController()
    const token = ++generation
    active?.controller.abort(new CommandError('QUERY_SUPERSEDED', 'Usage export superseded'))
    active = { generation: token, controller }
    if (!append) {
      pageCount = 0
      state.replace({
        ...state.reader.getSnapshot(),
        items: [],
        cursor: null,
        hasMore: false,
        status: 'loading',
        error: null,
      })
    } else state.replace({ ...state.reader.getSnapshot(), status: 'loading', error: null })
    const operation = request(append, token, controller)
      .catch((reason: unknown) => {
        if (current(token)) state.replace({ ...state.reader.getSnapshot(), status: 'error', error: errorCode(reason) })
      })
      .finally(() => {
        if (active?.generation === token) active = null
        if (pending === operation) pending = null
      })
    pending = operation
    return operation
  }

  return {
    reader: state.reader,
    refresh: () => run(false),
    loadMore: () => {
      const snapshot = state.reader.getSnapshot()
      return snapshot.hasMore ? run(true) : Promise.resolve()
    },
    setScope: async (
      scope,
      filters = state.reader.getSnapshot().filters,
      range = state.reader.getSnapshot().range ?? {},
    ) => {
      if (disposed) throw new CommandError('DISPOSED', 'Usage runtime disposed')
      const previous = state.reader.getSnapshot()
      if (
        sameScope(previous.scope, scope) &&
        JSON.stringify(previous.filters) === JSON.stringify(filters) &&
        JSON.stringify(previous.range ?? {}) === JSON.stringify(range)
      ) {
        if (previous.status === 'idle') await run(false)
        return
      }
      generation++
      active?.controller.abort(new CommandError('QUERY_SUPERSEDED', 'Usage scope changed'))
      active = null
      pending = null
      state.replace({
        ...state.reader.getSnapshot(),
        scope,
        filters,
        range,
        items: [],
        cursor: null,
        hasMore: false,
        status: 'idle',
        error: null,
      })
      await run(false)
    },
    dispose: () => {
      disposed = true
      generation++
      active?.controller.abort(new CommandError('DISPOSED', 'Usage runtime disposed'))
      active = null
      pending = null
      state.dispose()
    },
  }
}
