import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import type { ModelRequest } from '@hbar/plugin-sdk'

export function splitModelContext(request: ModelRequest) {
  const offset = request.systemContextOffset
  if (offset === undefined) return { instructions: request.system, context: '' }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= request.system.length)
    throw new HbarError('INVALID_MODEL_CONTEXT', 'Host context boundary is outside the complete system text')
  if (offset === 0) return { instructions: request.system, context: '' }
  return { instructions: request.system.slice(0, offset), context: request.system.slice(offset) }
}

/** Append fresh Host facts at their original authority, after immutable history. No durable message is rewritten. */
export function appendProviderContext(
  payload: unknown,
  context: string,
  protocol: 'openai-responses' | 'openai-completions',
) {
  if (!context) return payload
  const body = z.record(z.string(), z.unknown()).parse(payload)
  const key = protocol === 'openai-responses' ? 'input' : 'messages'
  const messages = z.array(z.unknown()).parse(body[key])
  const first = z.object({ role: z.enum(['system', 'developer']), content: z.string() }).safeParse(messages[0])
  if (!first.success) throw new HbarError('INVALID_MODEL_CONTEXT', 'Provider system authority is unavailable')
  return { ...body, [key]: [...messages, { role: first.data.role, content: context }] }
}
