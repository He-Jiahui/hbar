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

/** Retain capacity until the underlying operation settles, including plugins that ignore abort. */
export class ToolExecutions {
  private readonly active = new Map<string, AbortController>()
  private closed = false

  constructor(private readonly limit = 64) {}

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
  ): Promise<Result> {
    try { controller.signal.throwIfAborted(); this.assertAvailable(key, name) }
    catch (error) { await settled?.(); throw error }
    this.active.set(key, controller)
    return new Promise<Result>((resolve, reject) => {
      let cancellationTimer: ReturnType<typeof setTimeout> | undefined
      const abort = () => {
        clearTimeout(timer)
        controller.signal.removeEventListener('abort', abort)
        // Preserve an actual result returned during cooperative Host cancellation.
        // Unresponsive plugins still release the caller after a bounded grace period.
        if (controller.signal.reason instanceof ToolTimeoutError) reject(controller.signal.reason)
        else cancellationTimer = setTimeout(() => reject(controller.signal.reason), 1_000)
      }
      controller.signal.addEventListener('abort', abort, { once: true })
      const timer = setTimeout(() => controller.abort(new ToolTimeoutError(name, callId, timeoutMs)), timeoutMs)
      const cleanup = () => {
        clearTimeout(timer)
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
            clearTimeout(timer)
            await settled?.()
            cleanup()
            resolve(result)
          },
          async (error: unknown) => {
            clearTimeout(timer)
            await settled?.()
            cleanup()
            reject(error)
          },
        ).catch((error: unknown) => { cleanup(); reject(error) })
    })
  }

  dispose(): void {
    this.closed = true
    for (const controller of this.active.values())
      controller.abort(new HbarError('HOST_SHUTTING_DOWN', 'Host shutting down'))
  }
}
