import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { TOOL_SEQUENCE_RESULT_CHARACTERS } from '@hbar/plugin-sdk'
import type { ToolContext, ToolDefinition, ToolResult, ToolSequenceCall, ToolSequenceResult } from '@hbar/plugin-sdk'

const callsSchema = z
  .array(z.strictObject({ name: z.string().min(1).max(160), arguments: z.record(z.string(), z.unknown()) }))
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
  return {
    dispose: () => lifetime.abort(new HbarError('TOOL_SEQUENCE_CLOSED', 'The parent tool has settled')),
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
      for (const [index, call] of calls.entries()) {
        signal.throwIfAborted()
        const callId = crypto.randomUUID()
        await append('tool.sequence_call', {
          parentCallId: context.callId,
          callId,
          index,
          name: call.name,
          arguments: call.arguments,
        })
        const result = await execute(call.name, call.arguments, {
          session: context.session,
          workspace: context.workspace,
          run: context.run,
          signal,
          callId,
          parentCallId: context.callId,
        })
        const needsInspection = result.content?.some((block) => block.type === 'image') ?? false
        results.push({
          callId,
          name: call.name,
          text: needsInspection
            ? 'This tool returned images. Call it separately to inspect the images before continuing; remaining sequence calls were not executed.'
            : result.text.slice(0, TOOL_SEQUENCE_RESULT_CHARACTERS),
          isError: Boolean(result.isError) || needsInspection,
          truncated: result.text.length > TOOL_SEQUENCE_RESULT_CHARACTERS,
        })
        if (result.isError || needsInspection) break
      }
      return results
    },
  }
}
