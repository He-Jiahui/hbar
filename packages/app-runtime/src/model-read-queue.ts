import { CommandError } from '@hbar/commands'

interface ModelReadJob {
  readonly kind: 'projection' | 'captured'
  readonly controller: AbortController
  run(): Promise<void>
  cancelQueued(): void
}

/** Shared cap: two actual reads, one captured waiter, and one replaceable latest projection. */
export function createModelReadQueue() {
  const active = new Set<ModelReadJob>()
  const queued: Record<ModelReadJob['kind'], ModelReadJob | null> = { projection: null, captured: null }
  let scheduled = false
  let disposed = false
  const pump = () => {
    if (scheduled || disposed) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      if (disposed) return
      while (active.size < 2) {
        const job = queued.captured ?? queued.projection
        if (!job) return
        queued[job.kind] = null
        active.add(job)
        // Actual occupancy ends after the underlying promise settles, not on abort alone.
        const finished = () => {
          active.delete(job)
          pump()
        }
        void job.run().then(finished, finished)
      }
    })
  }
  const cancel = () => {
    const waiting = queued.projection
    queued.projection = null
    waiting?.cancelQueued()
    for (const job of active) if (job.kind === 'projection') job.controller.abort()
  }
  return {
    run<Value>(
      read: (signal: AbortSignal) => Promise<Value>,
      signal?: AbortSignal,
      kind: ModelReadJob['kind'] = 'projection',
    ): Promise<Value> {
      if (disposed || signal?.aborted) return Promise.reject(new CommandError('CANCELLED', 'Model read was cancelled'))
      if (kind === 'captured' && queued.captured)
        return Promise.reject(new CommandError('BUSY', 'Captured model read capacity reached'))
      const result = Promise.withResolvers<Value>()
      const controller = new AbortController()
      const detach = () => signal?.removeEventListener('abort', abort)
      const job: ModelReadJob = {
        kind,
        controller,
        async run() {
          try {
            if (controller.signal.aborted) throw new CommandError('CANCELLED', 'Model read was cancelled')
            result.resolve(await read(controller.signal))
          } catch (error) {
            result.reject(error)
          } finally {
            detach()
          }
        },
        cancelQueued() {
          controller.abort()
          detach()
          result.reject(new CommandError('CANCELLED', 'A newer model read replaced this request'))
        },
      }
      const abort = () => {
        controller.abort()
        if (queued[kind] === job) {
          queued[kind] = null
          job.cancelQueued()
        }
      }
      signal?.addEventListener('abort', abort, { once: true })
      queued[kind]?.cancelQueued()
      queued[kind] = job
      pump()
      return result.promise
    },
    cancel,
    dispose() {
      disposed = true
      cancel()
      queued.captured?.cancelQueued()
      queued.captured = null
      for (const job of active) job.controller.abort()
    },
  }
}
