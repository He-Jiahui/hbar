import { HbarError } from '@hbar/contracts'

export class ToolTimeoutError extends HbarError {
  constructor(
    readonly toolName: string,
    readonly callId: string,
    readonly timeoutMs: number,
  ) {
    super(
      'TOOL_TIMEOUT',
      `Tool ${toolName} timed out after ${timeoutMs} milliseconds. The Agent may continue; inspect state before retrying effects.`,
    )
  }
}

export interface ToolDeadlineClock {
  now(): number
  schedule(callback: () => void, milliseconds: number): () => void
}
const systemClock: ToolDeadlineClock = {
  now: () => performance.now(),
  schedule(callback, milliseconds) {
    const timer = setTimeout(callback, milliseconds)
    return () => clearTimeout(timer)
  },
}
function deadline(milliseconds: number, expired: () => void, clock: ToolDeadlineClock) {
  let remaining = milliseconds,
    startedAt = clock.now(),
    paused = 0,
    disposed = false
  let cancel: (() => void) | undefined
  const arm = () => {
    startedAt = clock.now()
    cancel = clock.schedule(() => {
      cancel = undefined
      disposed = true
      expired()
    }, remaining)
  }
  arm()
  return {
    dispose() {
      disposed = true
      cancel?.()
      cancel = undefined
    },
    suspend(): () => void {
      if (disposed) return () => {}
      if (paused++ === 0) {
        remaining = Math.max(0, remaining - (clock.now() - startedAt))
        cancel?.()
        cancel = undefined
      }
      let resumed = false
      return () => {
        if (resumed) return
        resumed = true
        if (disposed || --paused > 0) return
        arm()
      }
    },
  }
}

/** Retain capacity until the underlying operation settles, including plugins that ignore abort. */
export class ToolExecutions {
  private readonly active = new Map<
    string,
    {
      readonly controller: AbortController
      readonly runId: string | undefined
      readonly callId: string
      readonly suspend: () => () => void
    }
  >()
  private closed = false

  constructor(
    private readonly limit = 64,
    private readonly clock: ToolDeadlineClock = systemClock,
  ) {}

  /** Only a confirmed question for the original Run/call may pause its remaining tool deadline. */
  suspend(runId: string, callId: string): () => void {
    const activity = [...this.active.values()].find((entry) => entry.runId === runId && entry.callId === callId)
    return activity?.suspend() ?? (() => {})
  }

  assertAvailable(key: string, name: string): void {
    if (this.closed) throw new HbarError('HOST_SHUTTING_DOWN', 'Host shutting down')
    if (this.active.has(key))
      throw new HbarError(
        'TOOL_STILL_RUNNING',
        `Tool ${name} has an unsettled execution in this Session; inspect state before retrying.`,
      )
    if (this.active.size >= this.limit)
      throw new HbarError('TOOL_CAPACITY', 'Host tool execution capacity is exhausted')
  }

  async run<Result>(
    key: string,
    name: string,
    callId: string,
    controller: AbortController,
    timeoutMs: number,
    operation: () => Promise<Result>,
    settled?: () => Promise<void>,
    source?: { readonly runId: string },
  ): Promise<Result> {
    try {
      controller.signal.throwIfAborted()
      this.assertAvailable(key, name)
    } catch (error) {
      await settled?.()
      throw error
    }
    return new Promise<Result>((resolve, reject) => {
      let cancellationTimer: ReturnType<typeof setTimeout> | undefined
      const timeout = deadline(
        timeoutMs,
        () => controller.abort(new ToolTimeoutError(name, callId, timeoutMs)),
        this.clock,
      )
      const abort = () => {
        timeout.dispose()
        controller.signal.removeEventListener('abort', abort)
        // Preserve an actual result returned during cooperative Host cancellation.
        // Unresponsive plugins still release the caller after a bounded grace period.
        if (controller.signal.reason instanceof ToolTimeoutError) reject(controller.signal.reason)
        else cancellationTimer = setTimeout(() => reject(controller.signal.reason), 1_000)
      }
      this.active.set(key, { controller, callId, runId: source?.runId, suspend: () => timeout.suspend() })
      controller.signal.addEventListener('abort', abort, { once: true })
      const cleanup = () => {
        timeout.dispose()
        clearTimeout(cancellationTimer)
        controller.signal.removeEventListener('abort', abort)
        this.active.delete(key)
      }
      // Handle both late fulfillment and rejection without publishing a second tool result.
      Promise.resolve()
        .then(() => {
          controller.signal.throwIfAborted()
          return operation()
        })
        .then(
          async (result) => {
            timeout.dispose()
            await settled?.()
            cleanup()
            resolve(result)
          },
          async (error: unknown) => {
            timeout.dispose()
            await settled?.()
            cleanup()
            reject(error)
          },
        )
        .catch((error: unknown) => {
          cleanup()
          reject(error)
        })
    })
  }

  idleCounts() {
    return { active: this.active.size, closed: this.closed }
  }
  dispose(): void {
    this.closed = true
    for (const activity of this.active.values())
      activity.controller.abort(new HbarError('HOST_SHUTTING_DOWN', 'Host shutting down'))
  }
}
