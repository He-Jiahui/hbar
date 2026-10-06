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
  const snapshot = (): ToolExecution => ({
    startedAt,
    elapsedMs: Math.max(0, performance.now() - started),
    ...(progress ? { progress } : {}),
  })
  return {
    start: () => publish(snapshot()),
    report: async (input: ToolProgress): Promise<void> => {
      if (closed) throw new HbarError('TOOL_PROGRESS_CLOSED', 'The tool has settled')
      const next = toolProgressSchema.parse(input)
      if (progress && (next.total !== progress.total || next.completed < progress.completed))
        throw new HbarError('INVALID_TOOL_PROGRESS', 'Progress must keep a stable total and never decrease')
      progress = next
      if (busy || performance.now() - lastPublished < 250) return
      busy = true
      lastPublished = performance.now()
      writing = publish(snapshot())
      try {
        await writing
      } finally {
        busy = false
      }
    },
    finish: async (): Promise<ToolExecution> => {
      closed = true
      const execution = { ...snapshot(), endedAt: Math.max(startedAt, Date.now()) }
      await writing
      await publish(execution)
      return execution
    },
  }
}
