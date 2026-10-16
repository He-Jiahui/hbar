import { z } from 'zod'
import type { Message, ProviderConfig } from '@hbar/contracts'

const snapshotSchema = z.strictObject({
  version: z.literal(1),
  sessionId: z.string().min(1).max(256),
  protocol: z.enum(['openai-responses', 'openai-completions']),
  text: z.string().min(1).max(1_000_000),
})
export type ModelHostContextSnapshot = z.output<typeof snapshotSchema>

/** Persist exactly the instruction message sent before an assistant response. */
export function createModelHostContext(
  sessionId: string,
  protocol: ProviderConfig['protocol'],
  text: string,
): ModelHostContextSnapshot | undefined {
  if (!text || (protocol !== 'openai-responses' && protocol !== 'openai-completions')) return undefined
  return snapshotSchema.parse({
    version: 1,
    sessionId,
    protocol,
    text: `<host_context_snapshot>\nHost facts at this point in the conversation. The latest snapshot supersedes earlier snapshots for current state and authority.\n${text}\n</host_context_snapshot>`,
  })
}

/** Child seeds and a different transport must not inherit a parent's Host authority. */
export function readModelHostContext(
  message: Pick<Message, 'providerData' | 'sessionId'>,
  protocol: ProviderConfig['protocol'],
  sessionId = message.sessionId,
): string | null {
  if (!message.providerData || typeof message.providerData !== 'object' || !('hbarHostContext' in message.providerData))
    return null
  const parsed = snapshotSchema.safeParse(message.providerData.hbarHostContext)
  return parsed.success && parsed.data.sessionId === sessionId && parsed.data.protocol === protocol
    ? parsed.data.text
    : null
}

/** Shared conservative framing reserve for the meter and compaction boundary. */
export function modelHostContextCharacters(
  message: Pick<Message, 'providerData' | 'sessionId'>,
  protocol: ProviderConfig['protocol'],
  sessionId = message.sessionId,
): number {
  const context = readModelHostContext(message, protocol, sessionId)
  return context ? context.length + 32 : 0
}
