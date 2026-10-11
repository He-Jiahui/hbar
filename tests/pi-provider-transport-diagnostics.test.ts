import { expect, test } from 'bun:test'
import type { FetchFunction } from '@earendil-works/pi-ai'
import {
  withProviderResponseDiagnostics,
  type TransportFailureKind,
  type TransportFailureCode,
} from '../plugins/pi-driver/src/provider-http-diagnostics'

type Failure = { kind: TransportFailureKind; code: TransportFailureCode | undefined }

function throwingFetch(error: unknown): FetchFunction {
  return Object.assign(
    async () => {
      throw error
    },
    { preconnect: () => undefined },
  )
}

test('transport diagnostics classify a whitelisted code through two cause levels without copying raw error data', async () => {
  const inner = Object.assign(new Error('private inner payload'), { code: 'ECONNREFUSED' })
  const middle = Object.assign(new Error('private middle payload'), { cause: inner })
  const original = Object.assign(new Error('private outer payload'), { cause: middle })
  const failures: Failure[] = []
  const observed = withProviderResponseDiagnostics(
    throwingFetch(original),
    () => undefined,
    (kind, code) => {
      failures.push({ kind, code })
    },
  )

  await expect(observed('http://fixture.invalid')).rejects.toBe(original)
  expect(failures).toEqual([{ kind: 'connection', code: 'ECONNREFUSED' }])
  expect(JSON.stringify(failures)).not.toContain('private')
})

test('transport diagnostics degrade throwing code and cause getters to unknown and rethrow the same error', async () => {
  const original = new Error('private getter payload')
  Object.defineProperty(original, 'code', {
    get: () => {
      throw new Error('private code getter')
    },
  })
  Object.defineProperty(original, 'cause', {
    get: () => {
      throw new Error('private cause getter')
    },
  })
  const failures: Failure[] = []
  const observed = withProviderResponseDiagnostics(
    throwingFetch(original),
    () => undefined,
    (kind, code) => {
      failures.push({ kind, code })
    },
  )

  await expect(observed('http://fixture.invalid')).rejects.toBe(original)
  expect(failures).toEqual([{ kind: 'unknown', code: undefined }])
  expect(JSON.stringify(failures)).not.toContain('private')
})

for (const [name, error] of [
  ['abort', new DOMException('private abort payload', 'AbortError')],
  ['timeout', new DOMException('private timeout payload', 'TimeoutError')],
] as const) {
  test(`diagnostic callback failure does not replace the original ${name} transport error`, async () => {
    const observed = withProviderResponseDiagnostics(
      throwingFetch(error),
      () => undefined,
      () => {
        throw new Error('private diagnostic callback payload')
      },
    )

    await expect(observed('http://fixture.invalid')).rejects.toBe(error)
  })
}
