import { HbarError } from '@hbar/contracts'

export const AUTO_COMPACTION_TIMEOUT_MS = 120_000

export function resolveCompactionTimeoutMs(value: number | undefined): number {
  if (value === undefined) return AUTO_COMPACTION_TIMEOUT_MS
  if (!Number.isInteger(value) || value < 1 || value > AUTO_COMPACTION_TIMEOUT_MS)
    throw new HbarError('INVALID_INPUT', 'Compaction timeout must be an integer from 1 to 120000 milliseconds')
  return value
}

export interface BoundedCompactionSignal {
  readonly signal: AbortSignal
  readonly timedOut: () => boolean
  readonly dispose: () => void
}

export function createBoundedCompactionSignal(parent: AbortSignal, timeoutMs: number): BoundedCompactionSignal {
  const controller = new AbortController()
  let timedOut = false
  let disposed = false
  let timer: ReturnType<typeof setTimeout>
  const onParentAbort = () => {
    clearTimeout(timer)
    controller.abort(parent.reason)
  }
  timer = setTimeout(() => {
    if (disposed || controller.signal.aborted) return
    timedOut = true
    controller.abort(new HbarError('COMPACTION_TIMEOUT', 'Context compaction exceeded its bounded time limit'))
  }, timeoutMs)
  if (parent.aborted) onParentAbort()
  else parent.addEventListener('abort', onParentAbort, { once: true })
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      if (disposed) return
      disposed = true
      clearTimeout(timer)
      parent.removeEventListener('abort', onParentAbort)
    },
  }
}
