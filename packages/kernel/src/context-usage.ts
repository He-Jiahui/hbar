import type { SessionContextUsage } from '@hbar/contracts/commands/models'
import type { ModelRequest } from '@hbar/plugin-sdk'
import { modelHostContextCharacters } from '@hbar/plugin-sdk'

/** Same conservative character estimate for the meter and automatic compaction.
 * Only model-visible content is counted; event IDs/timestamps are not prompt tokens.
 * Provider tokenizers, image encoding and transport framing can differ.
 */
export function estimateContextTokens(request: ModelRequest): number {
  const messages = request.messages.map(({ role, content }) => ({ role, content }))
  const hostContext = request.messages.reduce(
    (sum, message) => sum + modelHostContextCharacters(message, request.model.protocol, request.context?.sessionId),
    0,
  )
  return Math.ceil((request.system.length + JSON.stringify(messages).length + hostContext) / 3)
}

export function compactionInputThreshold(request: ModelRequest, percent: number): number {
  return Math.max(
    0,
    Math.min(
      Math.floor((request.model.contextWindow * percent) / 100),
      request.model.contextWindow - request.model.maxOutput,
    ),
  )
}

export function describeContextUsage(sessionId: string, request: ModelRequest, percent: number): SessionContextUsage {
  const inputTokens = estimateContextTokens(request)
  return {
    sessionId,
    modelId: request.model.id,
    status: 'available',
    estimated: true,
    inputTokens,
    contextWindow: request.model.contextWindow,
    contextMode: request.model.contextMode ?? 'standard',
    outputReserve: request.model.maxOutput,
    compactionPercent: percent,
    compactionTokens: compactionInputThreshold(request, percent),
    remainingTokens: Math.max(0, request.model.contextWindow - inputTokens),
    observedAt: Date.now(),
  }
}
