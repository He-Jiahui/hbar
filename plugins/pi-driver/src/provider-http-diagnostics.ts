import type { FetchFunction, ProviderResponse } from '@earendil-works/pi-ai'

export function withProviderResponseDiagnostics(
  fetchImpl: FetchFunction,
  onResponse: (response: ProviderResponse) => void,
): FetchFunction {
  const observedFetch: typeof fetch = Object.assign(
    async (...args: Parameters<FetchFunction>) => {
      const response = await fetchImpl(...args)
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
