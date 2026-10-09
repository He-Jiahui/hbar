import { chatDatabaseDeletedEventSchema, type ChatDatabaseDeletedEvent } from '@hbar/contracts/commands/chat-database'

/** Reconnect only verifies open targets, with four physical point reads and no navigation writes. */
export function createSessionDeletionReconciliation(options: {
  readonly targets: () => readonly string[]
  readonly observe: (id: string, signal: AbortSignal) => Promise<unknown | null>
  readonly markDeleted: (ids: readonly string[]) => void
  readonly onError: (error: unknown) => void
  readonly events?:
    | {
        subscribe(listener: (event: ChatDatabaseDeletedEvent) => void): () => void
        onConnection?(listener: (connected: boolean) => void): () => void
      }
    | undefined
}) {
  let disposed = false
  let connected = false
  let running = false
  let queued = false
  let controller: AbortController | null = null
  async function reconcile() {
    if (disposed || !connected) return
    if (running) {
      queued = true
      return
    }
    running = true
    const request = new AbortController()
    controller = request
    const missing: string[] = []
    const targets = [...new Set(options.targets())].slice(0, 70)
    let next = 0
    try {
      await Promise.all(
        Array.from({ length: Math.min(4, targets.length) }, async () => {
          while (!disposed && !request.signal.aborted && next < targets.length) {
            const id = targets[next++]
            if (!id) continue
            try {
              const value = await options.observe(id, request.signal)
              if (!disposed && !request.signal.aborted && value === null) missing.push(id)
            } catch {
              /* A failed/disconnected read is not evidence of deletion. */
            }
          }
        }),
      )
      if (!disposed && !request.signal.aborted && missing.length) options.markDeleted(missing)
    } finally {
      running = false
      if (controller === request) controller = null
      if (queued && !disposed && connected) {
        queued = false
        void reconcile().catch(options.onError)
      }
    }
  }
  const stopEvents = options.events?.subscribe((value) => {
    if (disposed) return
    const event = chatDatabaseDeletedEventSchema.safeParse(value)
    if (event.success) options.markDeleted([...new Set(event.data.sessionIds)])
  })
  const stopConnection = options.events?.onConnection?.((value) => {
    connected = value
    if (!value) controller?.abort()
    else void reconcile().catch(options.onError)
  })
  return {
    dispose() {
      disposed = true
      controller?.abort()
      stopEvents?.()
      stopConnection?.()
    },
  }
}
