import { HbarError } from '@hbar/contracts'

/** Called only for Pi provider failures, never for Host hooks or tool errors. */
export function providerFailure(message: string): Error {
  // These facts belong to the provider boundary. A remote Driver terminal carries
  // the typed code, so Kernel classification must not depend on its raw text.
  if (/(insufficient (?:credits|quota)|usage[_ -]?limit|quota (?:exceeded|exhausted))/i.test(message))
    return new HbarError('PROVIDER_USAGE_LIMIT', message)
  if (/^Connection error\.?$/i.test(message.trim())) return new HbarError('PROVIDER_CONNECTION_FAILED', message)
  if (
    /^(?:JSON Parse error: Unterminated string|Unterminated string in JSON\b|Unexpected end of JSON input\b|OpenAI Responses stream ended (?:without a stop reason|before a terminal response event))/i.test(
      message,
    ) ||
    /^Error reading response: malformed server-sent event JSON\.$/i.test(message.trim())
  )
    return new HbarError('PROVIDER_STREAM_INTERRUPTED', message)
  if (
    /(rate[_ -]?limit|too many requests|\b429\b|\b(?:502|503|504)\b|ECONNRESET|ETIMEDOUT|temporarily unavailable)/i.test(
      message,
    )
  )
    return new HbarError('PROVIDER_TRANSIENT', message)
  return new Error(message)
}
