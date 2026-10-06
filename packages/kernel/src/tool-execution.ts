import { HbarError, toolProgressSchema, type ToolExecution, type ToolProgress } from '@hbar/contracts'

/** One bounded in-flight journal write; bursts retain the latest measured progress, not queued callbacks. */
export function createToolExecutionReporter(
  startedAt: number,
  publish: (execution: ToolExecution) => Promise<unknown>,
) {
  const started = performance.now()
  let closed = false
  let progress: ToolProgress | undefined
  let lastPublished = -Infinity
  let writing: Promise<unknown> = Promise.resolve()
  let busy = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let failure: unknown
  let failed = false
  const snapshot = (): ToolExecution => ({
    startedAt,
    elapsedMs: Math.max(0, performance.now() - started),
    ...(progress ? { progress } : {}),
  })
  const schedule = () => {
    if (closed || timer || busy) return
    timer = setTimeout(
      () => {
        timer = undefined
        void flush().catch((error: unknown) => {
          failure = error
          failed = true
        })
      },
      Math.max(0, 250 - (performance.now() - lastPublished)),
    )
  }
  const flush = async () => {
    if (closed || busy) return
    const publishedProgress = progress
    busy = true
    lastPublished = performance.now()
    writing = publish(snapshot())
    try {
      await writing
    } finally {
      busy = false
      if (progress !== publishedProgress) schedule()
    }
  }
  return {
    start: () => publish(snapshot()),
    report: async (input: ToolProgress): Promise<void> => {
      if (closed) throw new HbarError('TOOL_PROGRESS_CLOSED', 'The tool has settled')
      const next = toolProgressSchema.parse(input)
      if (progress && (next.total !== progress.total || next.completed < progress.completed))
        throw new HbarError('INVALID_TOOL_PROGRESS', 'Progress must keep a stable total and never decrease')
      progress = next
      if (busy || performance.now() - lastPublished < 250) {
        schedule()
        return
      }
      await flush()
    },
    finish: async (): Promise<ToolExecution> => {
      closed = true
      clearTimeout(timer)
      const execution = { ...snapshot(), endedAt: Math.max(startedAt, Date.now()) }
      await writing
      if (failed) throw failure
      await publish(execution)
      return execution
    },
  }
}
