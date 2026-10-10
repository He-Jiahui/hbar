import type { FetchFunction, ProviderResponse } from '@earendil-works/pi-ai'

export type TransportFailureKind = 'abort' | 'timeout' | 'connection' | 'unknown'
export type TransportFailureCode =
  | 'ECONNREFUSED'
  | 'ConnectionRefused'
  | 'ECONNRESET'
  | 'ETIMEDOUT'
  | 'EAI_AGAIN'
  | 'ENOTFOUND'
  | 'ENETUNREACH'
  | 'EHOSTUNREACH'
  | 'EPIPE'
  | 'UND_ERR_CONNECT_TIMEOUT'
export type TransportFailureObserver = (kind: TransportFailureKind, code?: TransportFailureCode) => void

const transportCodes: readonly TransportFailureCode[] = [
  'ECONNREFUSED',
  'ConnectionRefused',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
]

function classifyTransportFailure(error: unknown): { kind: TransportFailureKind; code?: TransportFailureCode } {
  let current: unknown = error
  for (let depth = 0; depth <= 2; depth++) {
    if (!current || typeof current !== 'object') break
    if (current instanceof DOMException && current.name === 'AbortError') return { kind: 'abort' }
    if (current instanceof DOMException && current.name === 'TimeoutError') return { kind: 'timeout' }
    let code: unknown
    try {
      code = Reflect.get(current, 'code')
    } catch {
      code = undefined
    }
    if (typeof code === 'string') {
      const known = transportCodes.find((candidate) => candidate === code)
      if (known)
        return {
          kind: known === 'ETIMEDOUT' || known === 'UND_ERR_CONNECT_TIMEOUT' ? 'timeout' : 'connection',
          code: known,
        }
    }
    if (depth === 2) break
    try {
      current = Reflect.get(current, 'cause')
    } catch {
      break
    }
  }
  return { kind: 'unknown' }
}

export function withProviderResponseDiagnostics(
  fetchImpl: FetchFunction,
  onResponse: (response: ProviderResponse) => void,
  onFailure?: TransportFailureObserver,
): FetchFunction {
  const observedFetch: typeof fetch = Object.assign(
    async (...args: Parameters<FetchFunction>) => {
      let response: Response
      try {
        response = await fetchImpl(...args)
      } catch (error) {
        try {
          const classified = classifyTransportFailure(error)
          onFailure?.(classified.kind, classified.code)
        } catch {
          /* observational */
        }
        throw error
      }
      try {
        const requestId = response.headers.get('x-request-id')
        if (Number.isInteger(response.status) && response.status >= 100 && response.status <= 599)
          onResponse({
            status: response.status,
            headers: requestId === null || requestId.length > 256 ? {} : { 'x-request-id': requestId },
          })
      } catch {
        // HTTP observation is best effort and cannot alter the provider response.
      }
      return response
    },
    { preconnect: fetchImpl.preconnect },
  )
  return observedFetch
}
