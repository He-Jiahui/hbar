import { z } from 'zod'
import { HbarError, type ToolBatchProgress } from '@hbar/contracts'
import { RunControlSignal, TOOL_SEQUENCE_RESULT_CHARACTERS } from '@hbar/plugin-sdk'
import type { ToolContext, ToolDefinition, ToolResult, ToolSequenceCall, ToolSequenceResult } from '@hbar/plugin-sdk'

const callsSchema = z
  .array(
    z.strictObject({
      name: z.string().min(1).max(160),
      arguments: z.record(z.string(), z.unknown()),
      continueOnScopeDenied: z.boolean().optional(),
    }),
  )
  .min(1)
  .max(8)

/** A sequence is not a transaction: durable successful effects remain after a later failure. */
export function createToolSequenceExecutor(
  context: ToolContext,
  selectedTools: readonly ToolDefinition[],
  parentName: string,
  execute: (name: string, args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>,
  append: (type: string, data: unknown) => Promise<unknown>,
) {
  const lifetime = new AbortController()
  const signal = AbortSignal.any([context.signal, lifetime.signal])
  const allowed = new Set(selectedTools.map((tool) => tool.name))
  let used = false
  let progress: ToolBatchProgress | undefined
  const publishProgress = () => append('tool.sequence_progress', { parentCallId: context.callId, progress })
  const closeProgress = () => {
    if (!progress) return
    const unknown = progress.unknown + progress.running
    progress = { ...progress, unknown, running: 0, pending: 0, skipped: progress.total - progress.settled - unknown }
  }
  return {
    progress: () => progress,
    dispose: () => {
      lifetime.abort(new HbarError('TOOL_SEQUENCE_CLOSED', 'The parent tool has settled'))
      closeProgress()
    },
    execute: async (raw: readonly ToolSequenceCall[]): Promise<readonly ToolSequenceResult[]> => {
      signal.throwIfAborted()
      if (used) throw new HbarError('TOOL_SEQUENCE_LIMIT', 'A tool may submit only one sequential batch')
      used = true
      const calls = structuredClone(callsSchema.parse(raw))
      if (JSON.stringify(calls).length > 64_000)
        throw new HbarError('TOOL_SEQUENCE_LIMIT', 'Sequence arguments exceed 64000 characters')
      for (const call of calls) {
        if (!allowed.has(call.name))
          throw new HbarError('TOOL_SEQUENCE_SCOPE', `Tool ${call.name} is outside this Run's selected registry`)
        if (call.name === parentName) throw new HbarError('TOOL_SEQUENCE_RECURSION', 'A sequence cannot invoke itself')
      }
      const results: ToolSequenceResult[] = []
      progress = { total: calls.length, settled: 0, running: 0, pending: calls.length, skipped: 0, unknown: 0 }
      await publishProgress()
      try {
        for (const [index, call] of calls.entries()) {
          signal.throwIfAborted()
          const callId = crypto.randomUUID()
          progress = { ...progress, running: 1, pending: calls.length - index - 1 }
          await publishProgress()
          await append('tool.sequence_call', {
            parentCallId: context.callId,
            callId,
            index,
            name: call.name,
            arguments: call.arguments,
            ...(call.continueOnScopeDenied ? { continueOnScopeDenied: true } : {}),
          })
          const result = await execute(call.name, call.arguments, {
            session: context.session,
            workspace: context.workspace,
            run: context.run,
            signal,
            callId,
            parentCallId: context.callId,
          })
          lifetime.signal.throwIfAborted()
          progress = { ...progress, settled: index + 1, running: 0 }
          await publishProgress()
          if (result.hostControl) throw new RunControlSignal(result.hostControl)
          const needsInspection = result.content?.some((block) => block.type === 'image') ?? false
          const continuedScopeDenial = Boolean(
            call.continueOnScopeDenied &&
            result.isError &&
            !needsInspection &&
            result.hostFailure?.code === 'WORKFLOW_SCOPE_REQUIRED' &&
            !result.hostFailure.executionStarted,
          )
          results.push({
            callId,
            name: call.name,
            text: needsInspection
              ? 'This tool returned images. Call it separately to inspect the images before continuing; remaining sequence calls were not executed.'
              : result.text.slice(0, TOOL_SEQUENCE_RESULT_CHARACTERS),
            isError: Boolean(result.isError) || needsInspection,
            truncated: result.text.length > TOOL_SEQUENCE_RESULT_CHARACTERS,
            ...(continuedScopeDenial ? { continuedScopeDenial: true } : {}),
          })
          if ((result.isError && !continuedScopeDenial) || needsInspection) break
        }
      } finally {
        // An exception before a child result is not evidence that the child completed.
        closeProgress()
        await publishProgress()
      }
      return results
    },
  }
}
