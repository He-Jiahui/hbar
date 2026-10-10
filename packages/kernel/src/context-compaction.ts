import { HbarError } from '@hbar/contracts'
import type { Message } from '@hbar/contracts'
import type { ModelRequest } from '@hbar/plugin-sdk'
import { compactionInputThreshold, estimateContextTokens } from './context-usage'
import type { RunSteeringContext } from './run-steering-context'

const SUMMARY_INSTRUCTIONS =
  'Summarize the conversation faithfully. Preserve objectives, files, tool outcomes, constraints, and unresolved work. Do not execute tools.'
export const MAX_COMPACTION_CHUNKS = 32

export function summaryOutputBudget(request: ModelRequest, percent: number): number {
  return Math.max(
    64,
    Math.min(request.model.maxOutput, 8192, Math.floor(compactionInputThreshold(request, percent) / 8)),
  )
}

/** A retained-message preference is subordinate to capacity. Cut only after
 * completed assistant/tool groups, never across undelivered Run guidance. */
export function compactionBoundary(
  request: ModelRequest,
  retainMessages: number,
  percent: number,
  steering?: RunSteeringContext,
): number {
  const messages = request.messages
  const delivered = new Set(steering?.deliveries.map((delivery) => delivery.message.id))
  const pendingGuide = steering
    ? messages.find(
        (message) =>
          message.runId === steering.runId &&
          message.role === 'user' &&
          message.id !== steering.initialUserMessageId &&
          !delivered.has(message.id),
      )?.seq
    : undefined
  const pendingCalls = new Set<string>()
  const boundaries: number[] = []
  for (const [index, message] of messages.entries()) {
    if (pendingGuide !== undefined && message.seq >= pendingGuide) break
    for (const block of message.content) {
      if (block.type === 'tool_call') pendingCalls.add(block.callId)
      if (block.type === 'tool_result') pendingCalls.delete(block.callId)
    }
    if (message.role === 'user' || pendingCalls.size) continue
    if (
      steering?.deliveries.some(
        (delivery) => delivery.message.seq <= message.seq && delivery.insertionAfterSeq > message.seq,
      )
    )
      continue
    boundaries.push(index + 1)
  }
  if (!boundaries.length) return 0
  const preferredLimit = Math.max(0, messages.length - retainMessages)
  const turnBoundary = boundaries.findLast(
    (boundary) => boundary <= preferredLimit && messages[boundary]?.role === 'user',
  )
  const preferred = turnBoundary ?? boundaries.findLast((boundary) => boundary <= preferredLimit) ?? boundaries[0]!
  const target =
    compactionInputThreshold(request, percent) -
    summaryOutputBudget(request, percent) -
    estimateContextTokens({ ...request, messages: [] })
  const suffixSizes = new Array<number>(messages.length + 1)
  suffixSizes[messages.length] = 2
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!
    suffixSizes[index] =
      suffixSizes[index + 1]! +
      JSON.stringify({ role: message.role, content: message.content }).length +
      (index + 1 < messages.length ? 1 : 0)
  }
  // Reserve room for the summary and system instructions. The rebuilt request
  // is checked again after all model/request hooks have run.
  const boundary = boundaries.find(
    (candidate) => candidate >= preferred && Math.ceil(suffixSizes[candidate]! / 3) <= target,
  )
  return boundary ?? boundaries.at(-1)!
}

/** Hard capacity is independent of the optional early-compaction policy. */
export function contextExceedsCapacity(request: ModelRequest): boolean {
  return estimateContextTokens(request) + request.model.maxOutput > request.model.contextWindow
}

export function assertContextCapacity(request: ModelRequest): void {
  if (contextExceedsCapacity(request)) {
    const input = estimateContextTokens(request)
    throw new HbarError(
      'CONTEXT_WINDOW_EXCEEDED',
      `Context requires about ${input} input tokens plus ${request.model.maxOutput} output tokens, exceeding the ${request.model.contextWindow}-token window. Reduce the latest input or use a larger-context model.`,
    )
  }
}

export function createSummaryRequest(request: ModelRequest, older: Message[], percent: number): ModelRequest {
  return {
    ...request,
    system: `${SUMMARY_INSTRUCTIONS}\n${request.system}`,
    messages: older,
    model: { ...request.model, maxOutput: summaryOutputBudget(request, percent) },
  }
}

/** Text documents allow an oversized tool result/group to cross chunk
 * boundaries without emitting orphan tool calls to a provider. No content is
 * truncated, and every chunk is admitted with the same capacity estimate. */
export function summaryDocument(request: ModelRequest): string {
  return `${request.system}\n\n${request.messages
    .map((message) =>
      JSON.stringify({
        role: message.role,
        content: message.content,
      }),
    )
    .join('\n')}`
}

export function nextSummaryChunk(
  request: ModelRequest,
  document: string,
  offset: number,
  previous: string,
): {
  request: ModelRequest
  nextOffset: number
} {
  const source = request.messages[0]
  const chunkRequest = (text: string): ModelRequest => ({
    ...request,
    system: `${SUMMARY_INSTRUCTIONS}\nThis is a successive history chunk. Merge its facts into the prior summary and return a concise complete summary within ${request.model.maxOutput * 3} characters.`,
    messages: [
      {
        id: source?.id ?? 'context-summary',
        sessionId: source?.sessionId ?? request.context?.sessionId ?? 'context',
        runId: source?.runId ?? request.context?.runId ?? '',
        seq: source?.seq ?? 0,
        createdAt: source?.createdAt ?? 0,
        role: 'user',
        content: [{ type: 'text', text: `Prior summary:\n${previous}\n\nNext history chunk:\n${text}` }],
      },
    ],
  })
  const inputLimit = Math.min(
    request.model.contextWindow - request.model.maxOutput,
    Math.floor(request.model.contextWindow * 0.75),
  )
  let low = 0
  let high = Math.min(document.length - offset, inputLimit * 3)
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (estimateContextTokens(chunkRequest(document.slice(offset, offset + mid))) <= inputLimit) low = mid
    else high = mid - 1
  }
  // Keep UTF-16 surrogate pairs together when splitting source text.
  if (
    low &&
    /[\uD800-\uDBFF]/.test(document[offset + low - 1]!) &&
    /[\uDC00-\uDFFF]/.test(document[offset + low] ?? '')
  )
    low--
  if (!low)
    throw new HbarError('COMPACTION_FAILED', 'The previous summary leaves no capacity for another history chunk')
  const result = chunkRequest(document.slice(offset, offset + low))
  assertContextCapacity(result)
  return { request: result, nextOffset: offset + low }
}
