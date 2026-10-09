import { z } from 'zod'
import { CommandError, createCommandClient, type CommandExecutor } from '@hbar/commands'
import {
  CHAT_DATABASE_REFRESH_MS,
  chatDatabaseCommands,
  chatDatabasePreviewInputSchema,
  chatDatabaseCleanupInputSchema,
  type ChatDatabaseScope,
  type ChatDatabaseStatistics,
  type ChatDatabaseOperation,
  type ChatDatabasePreviewItem,
  type ChatDatabaseTask,
  type ChatDatabaseCleanupKind,
  type ChatDatabaseHistoryPage,
} from '@hbar/contracts/commands/chat-database'
import { settingsScopeSchema } from '@hbar/contracts/commands/settings'
import { createState } from './state'

const identity = { idempotencyKey: z.string().min(1).max(200), requestId: z.string().min(1).max(200) }
const pendingSchema = z.discriminatedUnion('command', [
  z.strictObject({ command: z.literal('chatDatabase.preview'), input: chatDatabasePreviewInputSchema, ...identity }),
  z.strictObject({ command: z.literal('chatDatabase.cleanup'), input: chatDatabaseCleanupInputSchema, ...identity }),
  z.strictObject({
    command: z.literal('chatDatabase.cancel'),
    input: z.strictObject({ operationId: z.string().min(1).max(200) }),
    ...identity,
  }),
  z.strictObject({
    command: z.literal('chatDatabase.reconcile'),
    input: z.strictObject({ operationId: z.string().min(1).max(200) }),
    ...identity,
  }),
])
const recordSchema = z.strictObject({
  scope: settingsScopeSchema,
  operationId: z.string().nullable(),
  previewId: z.string().nullable(),
  pending: pendingSchema.nullable(),
})
const journalSchema = z
  .strictObject({ schemaVersion: z.literal(1), records: z.array(recordSchema).max(16) })
  .refine(
    (value) => new Set(value.records.map((record) => JSON.stringify(record.scope))).size === value.records.length,
    'Journal scopes must be unique',
  )
export type ChatDatabaseClientJournal = z.output<typeof journalSchema>
export interface ChatDatabaseJournalPort {
  read(): unknown
  write(value: ChatDatabaseClientJournal): void
}
export interface ChatDatabaseEntry {
  readonly scope: ChatDatabaseScope
  readonly statistics: ChatDatabaseStatistics | null
  readonly task: ChatDatabaseTask | null
  readonly preview: ChatDatabaseOperation | null
  readonly operation: ChatDatabaseOperation | null
  /** One cursor page is retained; lists never grow beyond the Host's 50-item default. */
  readonly previewItems: readonly ChatDatabasePreviewItem[]
  readonly previewNext: number | null
  readonly history: readonly ChatDatabaseOperation[]
  readonly historyNext: ChatDatabaseHistoryPage['next']
  readonly loading: boolean
  readonly writing: boolean
  readonly unknown: boolean
  readonly error: string | null
}
export interface ChatDatabaseState {
  readonly entries: Readonly<Record<string, ChatDatabaseEntry>>
}
export const chatDatabaseViewKey = (instanceId: string, scope: ChatDatabaseScope) =>
  `${instanceId}:${scope.kind === 'global' ? 'global' : `${scope.kind}:${scope.targetId}`}`
const scopeKey = (scope: ChatDatabaseScope) => JSON.stringify(scope)
const active = (operation: ChatDatabaseOperation | null) =>
  operation !== null && ['accepted', 'running', 'cancelRequested'].includes(operation.status)
const code = (reason: unknown) =>
  reason instanceof CommandError
    ? reason.code
    : reason instanceof Error && 'code' in reason && typeof reason.code === 'string'
      ? reason.code
      : 'UNKNOWN_RESULT'
function pageItems<Value>(items: Value[], identity: (value: Value) => string): Value[] {
  if (items.length > 50 || new Set(items.map(identity)).size !== items.length)
    throw new CommandError('INVALID_OUTPUT', 'Database cursor page exceeds its bound or contains duplicate identities')
  return items
}

/** Page visibility owns reads; the Host and durable actor/key journal own write outcomes. */
export function createChatDatabaseWorkspace(
  executor: CommandExecutor | undefined,
  onSubscriberError: (reason: unknown) => void,
  journal?: ChatDatabaseJournalPort,
) {
  const state = createState<ChatDatabaseState>({ entries: {} }, onSubscriberError)
  const client = executor ? createCommandClient(chatDatabaseCommands, executor) : null
  const records = new Map<string, z.output<typeof recordSchema>>()
  const settledScopes = new Set<string>()
  let restoreError: string | null = null
  try {
    const saved = journal?.read()
    if (saved !== undefined && saved !== null)
      for (const record of journalSchema.parse(saved).records) records.set(scopeKey(record.scope), record)
  } catch {
    restoreError = 'JOURNAL_RESTORE_FAILED'
  }
  let disposed = false
  let connected = false
  const visible = new Map<string, { count: number; scope: ChatDatabaseScope }>()
  const reads = new Map<string, AbortController>()
  const writes = new Set<string>()
  const lastRefresh = new Map<string, number>()
  const historyAfter = new Map<string, ChatDatabaseHistoryPage['next']>()
  const pageVersions = new Map<string, number>()
  function persist() {
    if (records.size > 16)
      throw new CommandError('JOURNAL_FULL', 'Reconcile retained operations before creating another scope')
    try {
      journal?.write({ schemaVersion: 1, records: [...records.values()] })
    } catch {
      throw new CommandError('JOURNAL_WRITE_FAILED', 'Local cleanup journal could not be persisted')
    }
  }
  function record(scope: ChatDatabaseScope) {
    const key = scopeKey(scope)
    const existing = records.get(key)
    if (existing) return existing
    const created = { scope, operationId: null, previewId: null, pending: null }
    return created
  }
  function retain(scope: ChatDatabaseScope, saved: z.output<typeof recordSchema>) {
    const key = scopeKey(scope)
    if (!records.has(key) && records.size >= 16) {
      const settled = [...records.keys()].find((id) => settledScopes.has(id))
      if (!settled)
        throw new CommandError('JOURNAL_FULL', 'Reconcile retained operations before creating another scope')
      records.delete(settled)
      settledScopes.delete(settled)
    }
    records.set(key, saved)
    settledScopes.delete(key)
  }
  function entry(key: string, scope: ChatDatabaseScope): ChatDatabaseEntry {
    const current = state.reader.getSnapshot().entries[key]
    if (current) return current
    const initial: ChatDatabaseEntry = {
      scope,
      statistics: null,
      task: null,
      preview: null,
      operation: null,
      previewItems: [],
      previewNext: null,
      history: [],
      historyNext: null,
      loading: false,
      writing: false,
      unknown: Boolean(record(scope).pending),
      error: restoreError,
    }
    replace(key, initial)
    return initial
  }
  function replace(key: string, value: ChatDatabaseEntry) {
    const entries = { ...state.reader.getSnapshot().entries, [key]: value }
    if (Object.keys(entries).length > 16) {
      const oldest = Object.keys(entries).find((id) => id !== key && !visible.has(id) && !writes.has(id))
      if (oldest) {
        delete entries[oldest]
        lastRefresh.delete(oldest)
        historyAfter.delete(oldest)
        pageVersions.delete(`${oldest}:history`)
        pageVersions.delete(`${oldest}:preview`)
      }
    }
    state.replace({ entries })
  }
  function patch(key: string, changes: Partial<ChatDatabaseEntry>) {
    const current = state.reader.getSnapshot().entries[key]
    if (current) replace(key, { ...current, ...changes })
  }
  function updateSettled(key: string, scope: ChatDatabaseScope) {
    const saved = records.get(scopeKey(scope))
    const current = state.reader.getSnapshot().entries[key]
    if (
      saved &&
      !saved.pending &&
      current &&
      [current.preview, current.operation].every((item) => !active(item) && item?.status !== 'unknown')
    )
      settledScopes.add(scopeKey(scope))
  }
  function required() {
    if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Chat database commands are unavailable')
    if (!connected || disposed) throw new CommandError('DISCONNECTED', 'Chat database Host is disconnected')
    return client
  }
  async function recover(key: string, scope: ChatDatabaseScope, signal: AbortSignal) {
    const saved = record(scope)
    const commands = required()
    if (saved.pending) {
      const pending = saved.pending
      const result =
        pending.command === 'chatDatabase.cancel' || pending.command === 'chatDatabase.reconcile'
          ? await commands.execute('chatDatabase.operation', pending.input, { signal })
          : await commands.execute('chatDatabase.receipt', { idempotencyKey: pending.idempotencyKey }, { signal })
      signal.throwIfAborted()
      if (disposed) return
      if (
        !result ||
        (pending.command === 'chatDatabase.cancel' &&
          !result.cancellationRequested &&
          !['completed', 'cancelled', 'failed'].includes(result.status)) ||
        (pending.command === 'chatDatabase.reconcile' && result.status === 'unknown')
      ) {
        patch(key, { unknown: true, error: 'UNKNOWN_RESULT' })
        return
      }
      saved.pending = null
      if (result.type === 'preview') saved.previewId = result.operationId
      else saved.operationId = result.operationId
      try {
        persist()
      } catch (reason) {
        saved.pending = pending
        throw reason
      }
      patch(key, { unknown: false, error: null })
    }
    if (saved.operationId) {
      const previous = state.reader.getSnapshot().entries[key]?.operation
      const operation = await commands.execute('chatDatabase.operation', { operationId: saved.operationId }, { signal })
      signal.throwIfAborted()
      patch(key, { operation })
      if (previous && active(previous) && !active(operation)) lastRefresh.delete(key)
    }
    if (saved.previewId) {
      const preview = await commands.execute('chatDatabase.operation', { operationId: saved.previewId }, { signal })
      signal.throwIfAborted()
      patch(key, { preview })
      if (preview.status === 'completed' && state.reader.getSnapshot().entries[key]?.previewItems.length === 0) {
        const page = await commands.execute(
          'chatDatabase.previewPage',
          { previewId: preview.operationId, limit: 50 },
          { signal },
        )
        signal.throwIfAborted()
        patch(key, { previewItems: pageItems(page.items, (item) => `${item.kind}:${item.id}`), previewNext: page.next })
      }
    }
    updateSettled(key, scope)
  }
  async function refresh(key: string, scope: ChatDatabaseScope, force = true): Promise<void> {
    if (!connected || disposed || !visible.has(key) || reads.has(key)) return
    const controller = new AbortController()
    reads.set(key, controller)
    const historyVersion = pageVersions.get(`${key}:history`) ?? 0
    const historyCursor = historyAfter.get(key) ?? null
    entry(key, scope)
    patch(key, { loading: true, error: restoreError })
    try {
      const commands = required()
      await recover(key, scope, controller.signal)
      const results = await Promise.allSettled([
        commands.execute('chatDatabase.statistics', { scope, refresh: force }, { signal: controller.signal }),
        commands.execute('chatDatabase.task', { scope }, { signal: controller.signal }),
      ])
      if (disposed || reads.get(key) !== controller || controller.signal.aborted) return
      const statistics = results[0]
      const task = results[1]
      if (statistics.status === 'fulfilled') patch(key, { statistics: statistics.value })
      if (task.status === 'fulfilled') patch(key, { task: task.value })
      const failure = results.find((result) => result.status === 'rejected')
      if (failure?.status === 'rejected') patch(key, { error: code(failure.reason) })
      if (
        (force || state.reader.getSnapshot().entries[key]?.history.length === 0) &&
        historyVersion === (pageVersions.get(`${key}:history`) ?? 0)
      ) {
        const history = await commands.execute(
          'chatDatabase.history',
          { scope, after: historyCursor, limit: 50 },
          { signal: controller.signal },
        )
        if (!controller.signal.aborted && historyVersion === (pageVersions.get(`${key}:history`) ?? 0))
          patch(key, { history: pageItems(history.items, (item) => item.operationId), historyNext: history.next })
      }
      if (force) lastRefresh.set(key, Date.now())
    } catch (reason) {
      if (!disposed && !controller.signal.aborted) patch(key, { error: code(reason) })
    } finally {
      if (reads.get(key) === controller) {
        reads.delete(key)
        patch(key, { loading: false })
      }
    }
  }
  async function mutate(key: string, scope: ChatDatabaseScope, pending: z.output<typeof pendingSchema>, retry = false) {
    entry(key, scope)
    if (writes.has(key) || restoreError) return
    const saved = record(scope)
    if (saved.pending && !retry) {
      patch(key, { unknown: true, error: 'UNKNOWN_RESULT' })
      return
    }
    writes.add(key)
    patch(key, { writing: true, error: null })
    try {
      const commands = required()
      retain(scope, saved)
      saved.pending = pending
      persist()
      const result =
        pending.command === 'chatDatabase.preview'
          ? await commands.execute(pending.command, pending.input, pending)
          : pending.command === 'chatDatabase.cleanup'
            ? await commands.execute(pending.command, pending.input, pending)
            : await commands.execute(pending.command, pending.input, pending)
      if (disposed) return
      if (result.type === 'preview') saved.previewId = result.operationId
      else saved.operationId = result.operationId
      saved.pending = null
      try {
        persist()
      } catch (reason) {
        saved.pending = pending
        throw reason
      }
      patch(key, {
        unknown: false,
        ...(result.type === 'preview'
          ? { preview: result, previewItems: [], previewNext: null }
          : { operation: result }),
      })
      updateSettled(key, scope)
    } catch (reason) {
      if (disposed) return
      const error = code(reason)
      const known = [
        'BUSY',
        'INVALID_INPUT',
        'POLICY_CHANGED',
        'PREVIEW_EXPIRED',
        'INVALID_SCOPE',
        'IDEMPOTENCY_CONFLICT',
        'AUTO_DISABLED',
        'CAPABILITY_UNAVAILABLE',
        'COMMAND_NOT_FOUND',
      ].includes(error)
      if (known) {
        saved.pending = null
        try {
          persist()
        } catch {
          saved.pending = pending
        }
      }
      patch(key, { error, unknown: saved.pending !== null })
    } finally {
      writes.delete(key)
      patch(key, { writing: false })
    }
  }
  const newIdentity = () => ({ idempotencyKey: crypto.randomUUID(), requestId: crypto.randomUUID() })
  const timer = setInterval(() => {
    if (!connected || disposed) return
    for (const [key, target] of visible) {
      const current = entry(key, target.scope)
      const force = Date.now() - (lastRefresh.get(key) ?? 0) >= CHAT_DATABASE_REFRESH_MS
      if (
        force ||
        active(current.operation) ||
        active(current.task?.operation ?? null) ||
        active(current.preview) ||
        current.unknown ||
        current.statistics?.status === 'scanning'
      )
        void refresh(key, target.scope, force)
    }
  }, 1000)
  timer.unref?.()
  const actions = {
    acquire(instanceId: string, scope: ChatDatabaseScope) {
      const key = chatDatabaseViewKey(instanceId, scope)
      if (!visible.has(key) && visible.size >= 16) throw new CommandError('BUSY', 'Too many visible database pages')
      const previous = visible.get(key)
      visible.set(key, { scope, count: (previous?.count ?? 0) + 1 })
      entry(key, scope)
      void refresh(key, scope)
      let released = false
      return () => {
        if (released) return
        released = true
        const target = visible.get(key)
        if (target && target.count > 1) {
          visible.set(key, { ...target, count: target.count - 1 })
          return
        }
        visible.delete(key)
        reads.get(key)?.abort()
        reads.delete(key)
        patch(key, { loading: false })
      }
    },
    setConnected(value: boolean) {
      connected = value
      if (!value) {
        for (const request of reads.values()) request.abort()
        for (const key of reads.keys()) patch(key, { loading: false })
        reads.clear()
      } else for (const [key, target] of visible) void refresh(key, target.scope)
    },
    refresh: (instanceId: string, scope: ChatDatabaseScope) => refresh(chatDatabaseViewKey(instanceId, scope), scope),
    preview(instanceId: string, scope: ChatDatabaseScope, kind: ChatDatabaseCleanupKind) {
      return mutate(chatDatabaseViewKey(instanceId, scope), scope, {
        command: 'chatDatabase.preview',
        input: { scope, kind },
        ...newIdentity(),
      })
    },
    confirm(instanceId: string, scope: ChatDatabaseScope, previewId: string) {
      const current = entry(chatDatabaseViewKey(instanceId, scope), scope)
      if (current.operation?.previewId === previewId) return Promise.resolve()
      if (current.preview?.operationId !== previewId || current.preview.status !== 'completed') return Promise.resolve()
      return mutate(chatDatabaseViewKey(instanceId, scope), scope, {
        command: 'chatDatabase.cleanup',
        input: { previewId },
        ...newIdentity(),
      })
    },
    cancel(instanceId: string, scope: ChatDatabaseScope, operationId: string) {
      return mutate(chatDatabaseViewKey(instanceId, scope), scope, {
        command: 'chatDatabase.cancel',
        input: { operationId },
        ...newIdentity(),
      })
    },
    reconcile(instanceId: string, scope: ChatDatabaseScope, operationId: string) {
      return mutate(chatDatabaseViewKey(instanceId, scope), scope, {
        command: 'chatDatabase.reconcile',
        input: { operationId },
        ...newIdentity(),
      })
    },
    retryOriginal(instanceId: string, scope: ChatDatabaseScope) {
      const pending = record(scope).pending
      return pending ? mutate(chatDatabaseViewKey(instanceId, scope), scope, pending, true) : Promise.resolve()
    },
    async previewPage(instanceId: string, scope: ChatDatabaseScope, after: number | null) {
      const key = chatDatabaseViewKey(instanceId, scope)
      const current = entry(key, scope)
      if (!current.preview) return
      const tokenKey = `${key}:preview`
      const version = (pageVersions.get(tokenKey) ?? 0) + 1
      pageVersions.set(tokenKey, version)
      try {
        const page = await required().execute('chatDatabase.previewPage', {
          previewId: current.preview.operationId,
          after,
          limit: 50,
        })
        if (
          pageVersions.get(tokenKey) === version &&
          state.reader.getSnapshot().entries[key]?.preview?.operationId === current.preview.operationId
        )
          patch(key, {
            previewItems: pageItems(page.items, (item) => `${item.kind}:${item.id}`),
            previewNext: page.next,
          })
      } catch (reason) {
        patch(key, { error: code(reason) })
      }
    },
    async historyPage(instanceId: string, scope: ChatDatabaseScope, after: ChatDatabaseHistoryPage['next']) {
      const key = chatDatabaseViewKey(instanceId, scope)
      const tokenKey = `${key}:history`
      const version = (pageVersions.get(tokenKey) ?? 0) + 1
      pageVersions.set(tokenKey, version)
      historyAfter.set(key, after)
      try {
        const page = await required().execute('chatDatabase.history', { scope, after, limit: 50 })
        if (pageVersions.get(tokenKey) === version)
          patch(key, { history: pageItems(page.items, (item) => item.operationId), historyNext: page.next })
      } catch (reason) {
        patch(key, { error: code(reason) })
      }
    },
  }
  return {
    reader: state.reader,
    actions: Object.freeze(actions),
    dispose() {
      disposed = true
      clearInterval(timer)
      for (const controller of reads.values()) controller.abort()
      reads.clear()
      visible.clear()
      state.dispose()
    },
  }
}
