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
export type TransportFailureObserver = (
  kind: TransportFailureKind,
  code?: TransportFailureCode,
  phase?: 'fetch' | 'stream',
) => void

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
  onProviderError?: (errorCode?: unknown) => void,
  onBodyEof?: () => void,
): FetchFunction {
  const observedFetch: typeof fetch = Object.assign(
    async (...args: Parameters<FetchFunction>) => {
      let response: Response
      try {
        response = await fetchImpl(...args)
      } catch (error) {
        try {
          const classified = classifyTransportFailure(error)
          onFailure?.(classified.kind, classified.code, 'fetch')
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
      if (!response.body) return response
      const reader = response.body.getReader()
      let readerReleased = false
      const releaseReader = () => {
        if (readerReleased) return
        readerReleased = true
        try {
          reader.releaseLock()
        } catch {
          // A locked read may release itself after its pending operation settles.
        }
      }
      const requestSignal = args[0] instanceof Request ? args[0].signal : args[1]?.signal
      let frame = ''
      let discardOversizedFrame = false
      const decoder = new TextDecoder()
      const inspectFrame = (candidate: string) => {
        const lines = candidate.split(/\r?\n/)
        const notify = (errorCode?: unknown) => {
          try {
            onProviderError?.(errorCode)
          } catch {
            // Diagnostics are observational and must not alter stream behavior.
          }
        }
        const namedError = lines.some((line) => line === 'event: error' || line === 'event:error')
        const payload = lines
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''))
          .join('\n')
        if (!payload || payload === '[DONE]') {
          if (namedError) notify()
          return
        }
        try {
          const event: unknown = JSON.parse(payload)
          if (!event || typeof event !== 'object') {
            if (namedError) notify()
            return
          }
          const type = Reflect.get(event, 'type') as unknown
          const error = Reflect.get(event, 'error') as unknown
          const responseData = Reflect.get(event, 'response') as unknown
          const responseError =
            responseData && typeof responseData === 'object'
              ? (Reflect.get(responseData, 'error') as unknown)
              : undefined
          const errorCode =
            error && typeof error === 'object'
              ? (Reflect.get(error, 'code') as unknown)
              : responseError && typeof responseError === 'object'
                ? (Reflect.get(responseError, 'code') as unknown)
                : (Reflect.get(event, 'code') as unknown)
          if (
            namedError ||
            type === 'response.failed' ||
            (error && typeof error === 'object') ||
            (responseError && typeof responseError === 'object')
          )
            notify(errorCode)
        } catch {
          if (namedError) notify()
        }
      }
      const observeFrames = (bytes: Uint8Array, flush = false) => {
        if (!onProviderError) return
        const chunkSize = 4096
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          const text = decoder.decode(bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize)), {
            stream: true,
          })
          processText(text)
        }
        if (flush) {
          processText(decoder.decode())
          if (!discardOversizedFrame && frame.length > 0 && frame.length <= 4096) inspectFrame(frame)
          frame = ''
        }
        function processText(text: string) {
          let pending = frame + text
          frame = ''
          while (pending.length > 0) {
            const delimiter = /\r?\n\r?\n/.exec(pending)
            if (!delimiter || delimiter.index === undefined) break
            const candidate = pending.slice(0, delimiter.index)
            pending = pending.slice(delimiter.index + delimiter[0].length)
            if (discardOversizedFrame) discardOversizedFrame = false
            else if (candidate.length <= 4096) inspectFrame(candidate)
          }
          if (pending.length <= 4096) frame = pending
          else {
            discardOversizedFrame = true
            frame = pending.slice(-3)
          }
        }
      }
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const result = await reader.read()
            if (result.done) {
              observeFrames(new Uint8Array(), true)
              try {
                onBodyEof?.()
              } catch {
                // Diagnostics are observational and must not alter stream behavior.
              }
              releaseReader()
              controller.close()
            } else {
              observeFrames(result.value)
              controller.enqueue(result.value)
            }
          } catch (error) {
            try {
              const classified = classifyTransportFailure(error)
              onFailure?.(classified.kind, classified.code, 'stream')
            } catch {
              /* observational */
            }
            controller.error(error)
            releaseReader()
          }
        },
        async cancel(reason) {
          if (requestSignal?.aborted) {
            try {
              const classified = classifyTransportFailure(requestSignal.reason)
              onFailure?.(classified.kind, classified.code, 'stream')
            } catch {
              /* observational */
            }
          }
          try {
            await reader.cancel(reason)
          } finally {
            releaseReader()
          }
        },
      })
      const observed = new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
      Object.defineProperties(observed, {
        url: { value: response.url },
        redirected: { value: response.redirected },
        type: { value: response.type },
      })
      return observed
    },
    { preconnect: fetchImpl.preconnect },
  )
  return observedFetch
}
