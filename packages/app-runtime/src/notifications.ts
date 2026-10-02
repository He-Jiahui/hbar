import {
  notificationCommands,
  notificationFreshEventSchema,
  type NotificationPage,
  type NotificationPageInput,
  type NotificationPreferences,
  type NotificationRecord,
  type NotificationFreshEvent,
} from '@hbar/contracts/commands/notifications'
import { CommandError, type ExecuteOptions } from '@hbar/commands'
import { createState, type StateReader } from './state'

export interface NotificationsState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly items: readonly NotificationRecord[]
  readonly nextCursor: string | null
  readonly unreadCount: number
  readonly preferences: NotificationPreferences | null
  readonly error: string | null
  readonly mutation?: 'submitting' | 'failed' | 'unknown' | 'succeeded'
}
export interface NotificationsPort {
  page(input: NotificationPageInput): Promise<NotificationPage>
  markRead(input: { id: string; read: boolean }, options?: ExecuteOptions): Promise<NotificationRecord>
  markAllRead(options?: ExecuteOptions): Promise<{ updated: number }>
  preferences(): Promise<NotificationPreferences>
  setPreferences(input: NotificationPreferences, options?: ExecuteOptions): Promise<NotificationPreferences>
  receipt?(input: {
    commandId: 'notification.markRead' | 'notification.markAllRead' | 'notification.preferences.set'
    input: unknown
    idempotencyKey: string
  }): Promise<unknown | null>
  subscribeFresh?(listener: (event: NotificationFreshEvent) => void): () => void
  subscribeInvalidation?(listener: () => void): () => void
}
export interface NotificationsRuntime {
  readonly reader: StateReader<NotificationsState>
  refresh(input?: Partial<NotificationPageInput>): Promise<void>
  loadMore(): Promise<void>
  subscribeFreshNotification(listener: (record: NotificationRecord) => void): () => void
  acceptFreshNotification(event: NotificationFreshEvent): void
  markRead(id: string, read: boolean): Promise<void>
  markAllRead(): Promise<void>
  setPreferences(input: NotificationPreferences): Promise<void>
  reconcile(): Promise<void>
  dispose(): void
}

export function createNotificationsRuntime(
  port: NotificationsPort | undefined,
  onError?: (error: unknown) => void,
): NotificationsRuntime {
  const state = createState<NotificationsState>(
    { status: 'idle', items: [], nextCursor: null, unreadCount: 0, preferences: null, error: null },
    onError ?? (() => undefined),
  )
  let disposed = false
  let generation = 0
  let pending = 0
  type Write =
    | {
        readonly commandId: 'notification.markRead'
        readonly input: { id: string; read: boolean }
        readonly key: string
      }
    | { readonly commandId: 'notification.markAllRead'; readonly input: Record<string, never>; readonly key: string }
    | {
        readonly commandId: 'notification.preferences.set'
        readonly input: NotificationPreferences
        readonly key: string
      }
  let write: Write | null = null
  let writing = false
  const freshListeners = new Set<(record: NotificationRecord) => void>()
  const seenSourceEvents = new Set<string>()
  const freshById = new Map<string, NotificationRecord>()
  let invalidationTimer: ReturnType<typeof setTimeout> | undefined
  let watermark = 0
  const rememberSourceEvent = (sourceEventId: string) => {
    if (seenSourceEvents.has(sourceEventId)) return false
    seenSourceEvents.add(sourceEventId)
    if (seenSourceEvents.size > 400) {
      const oldest = seenSourceEvents.values().next().value
      if (typeof oldest === 'string') seenSourceEvents.delete(oldest)
    }
    return true
  }
  const fail = (error: unknown) => {
    if (!disposed)
      state.replace({
        ...state.reader.getSnapshot(),
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
  }
  const accept = (mutation: Write, result: unknown) => {
    if (disposed) return
    const current = state.reader.getSnapshot()
    if (mutation.commandId === 'notification.markRead') {
      const item = notificationCommands['notification.markRead'].output.parse(result)
      if (item.id !== mutation.input.id) throw new CommandError('INVALID_OUTPUT', 'Notification result target changed')
      const previous = current.items.find((entry) => entry.id === item.id)
      const adjustment = previous ? Number(item.readAt === null) - Number(previous.readAt === null) : 0
      if (freshById.has(item.id)) freshById.set(item.id, item)
      state.replace({
        ...current,
        items: current.items.map((entry) => (entry.id === item.id ? item : entry)),
        unreadCount: Math.max(0, current.unreadCount + adjustment),
        mutation: 'succeeded',
        error: null,
      })
    } else if (mutation.commandId === 'notification.preferences.set') {
      const preferences = notificationCommands['notification.preferences.set'].output.parse(result)
      state.replace({ ...current, preferences, mutation: 'succeeded', error: null })
    } else {
      notificationCommands['notification.markAllRead'].output.parse(result)
      // The transaction's watermark is learned from the authoritative refresh below;
      // keeping the projection avoids marking notifications created after the transaction as read.
      state.replace({ ...current, mutation: 'succeeded', error: null })
    }
  }
  const mergePage = (page: NotificationPage) => {
    const fresh = [...freshById.values()].filter((record) =>
      record.sequence !== undefined && record.sequence > watermark && !page.items.some((item) => item.id === record.id),
    )
    const items = [...fresh, ...page.items].slice(0, 400)
    const freshUnread = fresh.filter((record) => record.readAt === null).length
    return { items, unreadCount: page.unreadCount + freshUnread }
  }
  const uncertain = (error: unknown) =>
    error instanceof CommandError
      ? ['RESULT_UNKNOWN', 'TIMEOUT', 'DISCONNECTED', 'INVALID_OUTPUT', 'CONNECTION_CLOSED'].includes(error.code)
      : error instanceof Error && /unknown|timed?\s*out|disconnect/i.test(error.message)
  const executeWrite = async (mutation: Write) => {
    if (!port || disposed) return
    if (write || writing) throw new CommandError('BUSY', 'Reconcile the pending notification write first')
    write = mutation
    writing = true
    state.replace({ ...state.reader.getSnapshot(), mutation: 'submitting', error: null })
    try {
      const options = { idempotencyKey: mutation.key }
      const result =
        mutation.commandId === 'notification.markRead'
          ? await port.markRead(mutation.input, options)
          : mutation.commandId === 'notification.markAllRead'
            ? await port.markAllRead(options)
            : await port.setPreferences(mutation.input, options)
      accept(mutation, result)
      write = null
      if (mutation.commandId === 'notification.markAllRead' && !disposed) {
        try { await runtime.refresh() } catch { /* durable write already confirmed */ }
      }
    } catch (error) {
      const unknown = uncertain(error)
      if (!unknown) write = null
      fail(error)
      if (!disposed) state.replace({ ...state.reader.getSnapshot(), mutation: unknown ? 'unknown' : 'failed' })
      throw error
    } finally {
      writing = false
    }
  }
  const runtime: NotificationsRuntime = {
    reader: state.reader,
    async refresh(input: Partial<NotificationPageInput> = {}) {
      if (!port || disposed) return
      const currentGeneration = ++generation
      pending++
      state.replace({ ...state.reader.getSnapshot(), status: 'loading', error: null })
      try {
        const [page, preferences] = await Promise.all([
          port.page({ after: null, limit: 50, unreadOnly: false, ...input }),
          port.preferences(),
        ])
        if (disposed || currentGeneration !== generation) return
        for (const record of page.items) {
          rememberSourceEvent(record.sourceEventId)
          freshById.delete(record.id)
        }
        const merged = mergePage(page)
        watermark = page.watermark ?? watermark
        state.replace({
          ...state.reader.getSnapshot(),
          status: 'ready',
          items: merged.items,
          nextCursor: page.nextCursor,
          unreadCount: merged.unreadCount,
          preferences,
          error: null,
        })
      } catch (error) {
        if (currentGeneration === generation) fail(error)
      } finally {
        pending--
      }
    },
    async loadMore() {
      if (!port || disposed || pending > 0) return
      const current = state.reader.getSnapshot()
      if (!current.nextCursor || current.items.length >= 400) return
      pending++
      const currentGeneration = generation
      try {
        const page = await port.page({ after: current.nextCursor, limit: 50, unreadOnly: false })
        if (disposed || currentGeneration !== generation) return
        for (const item of page.items) rememberSourceEvent(item.sourceEventId)
        const latest = state.reader.getSnapshot()
        const seen = new Set(latest.items.map((item) => item.id))
        const items = [...latest.items, ...page.items.filter((item) => !seen.has(item.id))].slice(0, 400)
        const visibleIds = new Set(items.map((item) => item.id))
        const freshUnread = [...freshById.values()].filter((item) =>
          item.sequence !== undefined && page.watermark !== undefined && item.sequence > page.watermark &&
          !visibleIds.has(item.id) && item.readAt === null,
        ).length
        state.replace({
          ...latest,
          status: 'ready',
          items,
          nextCursor: items.length >= 400 ? null : page.nextCursor,
          unreadCount: page.unreadCount + freshUnread,
          error: null,
        })
      } catch (error) {
        if (currentGeneration === generation) fail(error)
      } finally {
        pending--
      }
    },
    subscribeFreshNotification(listener) {
      freshListeners.add(listener)
      return () => freshListeners.delete(listener)
    },
    acceptFreshNotification(raw) {
      if (disposed) return
      const event = notificationFreshEventSchema.parse(raw)
      if (event.sequence !== undefined && event.sequence <= watermark) return
      if (seenSourceEvents.has(event.sourceEventId)) return
      if (!rememberSourceEvent(event.sourceEventId)) return
      const freshRecord = event.sequence === undefined ? event.record : { ...event.record, sequence: event.sequence }
      freshById.set(freshRecord.id, freshRecord)
      if (freshById.size > 400) {
        const oldest = freshById.keys().next().value
        if (typeof oldest === 'string') freshById.delete(oldest)
      }
      const current = state.reader.getSnapshot()
      state.replace({
        ...current,
        items: [freshRecord, ...current.items].slice(0, 400),
        unreadCount: current.unreadCount + (freshRecord.readAt === null ? 1 : 0),
      })
      for (const listener of freshListeners) {
        try {
          listener(freshRecord)
        } catch (error) {
          onError?.(error)
        }
      }
    },
    markRead: (id, read) => {
      generation++
      return executeWrite({ commandId: 'notification.markRead', input: { id, read }, key: crypto.randomUUID() })
    },
    markAllRead: () => {
      generation++
      return executeWrite({ commandId: 'notification.markAllRead', input: {}, key: crypto.randomUUID() })
    },
    setPreferences: (input) => {
      generation++
      return executeWrite({ commandId: 'notification.preferences.set', input, key: crypto.randomUUID() })
    },
    async reconcile() {
      if (disposed || !port || !write || writing)
        throw new CommandError('BUSY', 'No notification receipt is ready to check')
      if (!port.receipt) throw new CommandError('RESULT_UNKNOWN', 'Notification receipt lookup is unavailable')
      const original = write
      writing = true
      try {
        const result = await port.receipt({
          commandId: original.commandId,
          input: original.input,
          idempotencyKey: original.key,
        })
        if (disposed) return
        if (result === null) throw new CommandError('RESULT_UNKNOWN', 'Notification result remains uncertain')
        accept(original, result)
        write = null
        await runtime.refresh()
      } catch (error) {
        fail(error)
        throw error
      } finally {
        writing = false
      }
    },
    dispose() {
      disposed = true
      generation++
      stopFresh?.()
      stopInvalidation?.()
      freshListeners.clear()
      seenSourceEvents.clear()
      freshById.clear()
      if (invalidationTimer) clearTimeout(invalidationTimer)
      state.dispose()
    },
  }
  const stopFresh = port?.subscribeFresh?.((event) => runtime.acceptFreshNotification(event))
  const stopInvalidation = port?.subscribeInvalidation?.(() => {
    if (disposed || invalidationTimer) return
    invalidationTimer = setTimeout(() => {
      invalidationTimer = undefined
      void runtime.refresh().catch(() => undefined)
    }, 0)
  })
  return runtime
}
