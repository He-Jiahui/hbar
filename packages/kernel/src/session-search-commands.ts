import { CommandRegistry, createCommandClient } from '@hbar/commands'
import { sessionSearchCommands } from '@hbar/contracts/commands/session-search'
import type { StoragePort } from '@hbar/storage'

/** Search is a read use-case over a disposable Storage projection, never direct UI/database access. */
export function createSessionSearchCommands(storage: StoragePort, options: { readonly start?: boolean } = {}) {
  const registry = new CommandRegistry({ execution: 'host' })
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let nextDueAt: number | null = null
  let background: Promise<void> | null = null
  let pendingStep: Promise<{ complete: boolean }> | null = null
  let consecutiveFailures = 0
  let started = options.start ?? true

  const advance = (): Promise<{ complete: boolean }> => {
    if (pendingStep) return pendingStep
    const operation = storage.call('searchIndexStep')
    pendingStep = operation
    // Release the shared slot on either outcome; both handlers consume their own rejection.
    void operation.then(
      () => {
        if (pendingStep === operation) pendingStep = null
      },
      () => {
        if (pendingStep === operation) pendingStep = null
      },
    )
    return operation
  }

  const schedule = (delayMs: number): void => {
    if (disposed || !started || timer || background) return
    nextDueAt = Date.now() + delayMs
    timer = setTimeout(() => {
      timer = null
      nextDueAt = null
      background = (async () => {
        let nextDelay: number | null = null
        try {
          const status = await advance()
          consecutiveFailures = 0
          nextDelay = status.complete ? 60_000 : 0
        } catch {
          // Do not spin forever against a broken projection; user queries surface the error.
          consecutiveFailures++
          if (consecutiveFailures <= 3) nextDelay = consecutiveFailures * 1000
        } finally {
          background = null
          if (nextDelay !== null) schedule(nextDelay)
        }
      })()
    }, delayMs)
  }

  // Each Storage Worker step is bounded; yielding between steps leaves Host requests responsive.
  schedule(0)
  registry.register(sessionSearchCommands['session.recent'], (input) => storage.call('recentSessions', input))
  registry.register(sessionSearchCommands['session.search'], async (input, context) => {
    context.signal.throwIfAborted()
    if (input.source === 'title') return storage.call('searchSessions', input)
    const index = await advance()
    context.signal.throwIfAborted()
    if (!index.complete) return { items: [], truncated: false, incompleteReason: 'indexing' as const }
    return storage.call('searchSessions', input)
  })
  return {
    /** Re-arm a bounded inspection without startup dispatch or resetting durable continuation. */
    resumeInspectionTimer(complete: boolean) {
      if (disposed) return
      started = true
      schedule(complete ? 60_000 : 1000)
    },
    checkpoint: () => storage.call('searchIdleCheckpoint'),
    /** Parent alarm demand: one real bounded step; existing durable offset/queue is authoritative. */
    async wakeStep() {
      if (disposed) throw new Error('Search command owner is disposed')
      const status = await storage.call('searchIdleCheckpoint')
      if (!status.complete) await advance()
      return storage.call('searchIdleCheckpoint')
    },
    idleSnapshot() {
      return {
        disposed,
        started,
        timer: timer !== null,
        nextDueAt,
        background: background !== null,
        pendingStep: pendingStep !== null,
        consecutiveFailures,
      }
    },
    ...createCommandClient(sessionSearchCommands, registry),
    dispatchPrepared: registry.dispatchPrepared.bind(registry),
    dispatchPreparedTracked: registry.dispatchPreparedTracked.bind(registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 100 }),
    start() {
      if (disposed) return
      started = true
      schedule(0)
    },
    async pause() {
      started = false
      if (timer) clearTimeout(timer)
      timer = null
      nextDueAt = null
      await background
      await pendingStep
    },
    async dispose() {
      disposed = true
      registry.dispose()
      if (timer) clearTimeout(timer)
      timer = null
      nextDueAt = null
      await background
      await pendingStep?.catch(() => undefined)
    },
  }
}
