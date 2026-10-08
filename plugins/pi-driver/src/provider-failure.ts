import { HbarError } from '@hbar/contracts'

/** Called only for Pi provider failures, never for Host hooks or tool errors. */
export function providerFailure(message: string): Error {
  if (/^Connection error\.?$/i.test(message.trim())) return new HbarError('PROVIDER_CONNECTION_FAILED', message)
  if (
    /^(?:JSON Parse error: Unterminated string|Unterminated string in JSON\b|Unexpected end of JSON input\b|OpenAI Responses stream ended (?:without a stop reason|before a terminal response event))/i.test(
      message,
    ) ||
    /^Error reading response: malformed server-sent event JSON\.$/i.test(message.trim())
  )
    return new HbarError('PROVIDER_STREAM_INTERRUPTED', message)
  return new Error(message)
}
