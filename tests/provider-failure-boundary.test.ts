import { expect, test } from 'bun:test'
import { HbarError } from '@hbar/contracts'
import { providerFailure } from '../plugins/pi-driver/src/provider-failure'
import { classifyRunFailure } from '../packages/kernel/src/run-failure'

test('provider-attributed transient failures retain a typed policy when the terminal removes raw text', () => {
  for (const message of [
    '503 temporarily unavailable',
    '429 too many requests',
    '502 Bad Gateway',
    '504 Gateway Timeout',
    'rate_limit_exceeded',
    'ECONNRESET',
    'ETIMEDOUT',
  ]) {
    const source = providerFailure(message)
    expect(source).toBeInstanceOf(HbarError)
    if (!(source instanceof HbarError)) throw new Error('Provider attribution missing')
    expect(source.code).toBe('PROVIDER_TRANSIENT')
    expect(classifyRunFailure(new HbarError(source.code, 'Driver execution stopped'))).toEqual({
      code: 'PROVIDER_TRANSIENT',
      category: 'transient',
      retryable: true,
    })
  }
})

test('provider quota has permanent precedence over a simultaneous 429 rate limit', () => {
  for (const message of ['429 insufficient quota', 'insufficient credits', 'usage_limit reached', 'quota exhausted']) {
    const source = providerFailure(message)
    expect(source).toBeInstanceOf(HbarError)
    if (!(source instanceof HbarError)) throw new Error('Provider quota attribution missing')
    expect(classifyRunFailure(new HbarError(source.code, 'Driver execution stopped'))).toEqual({
      code: 'PROVIDER_USAGE_LIMIT',
      category: 'usage_limit',
      retryable: false,
    })
  }
})

test('existing provider connection and stream attribution retain their original codes', () => {
  for (const [message, code] of [
    ['Connection error.', 'PROVIDER_CONNECTION_FAILED'],
    ['JSON Parse error: Unterminated string', 'PROVIDER_STREAM_INTERRUPTED'],
  ] as const) {
    expect(providerFailure(message)).toMatchObject({ code })
    expect(classifyRunFailure(new HbarError(code, 'Driver execution stopped'))).toMatchObject({
      code,
      category: 'transient',
      retryable: true,
    })
  }
})

test('unrecognized provider and authentication messages remain permanent without inventing an attribution', () => {
  for (const message of [
    '401 invalid API key',
    '400 invalid model',
    'unexpected provider error',
    '500 internal error',
  ]) {
    expect(providerFailure(message)).not.toBeInstanceOf(HbarError)
    expect(classifyRunFailure(providerFailure(message))).toMatchObject({ category: 'execution', retryable: false })
  }
})

test('typed Host, cancellation and unknown effects cannot inherit provider retry from error text', () => {
  for (const code of [
    'STORAGE_FAILURE',
    'TOOL_FAILURE',
    'RESULT_UNKNOWN',
    'EFFECT_UNKNOWN',
    'USER_CANCELLED',
    'RUN_TIMEOUT',
  ]) {
    for (const message of ['503 temporarily unavailable', '429 insufficient quota', 'ECONNRESET']) {
      const failure = classifyRunFailure(new HbarError(code, message))
      expect(failure.code).toBe(code)
      expect(failure.retryable).toBe(false)
    }
  }
})

test('legacy untyped provider text keeps its established transient and usage fallback', () => {
  expect(classifyRunFailure(new Error('503 temporarily unavailable'))).toEqual({
    code: 'PROVIDER_TRANSIENT',
    category: 'transient',
    retryable: true,
  })
  expect(classifyRunFailure(new Error('insufficient quota'))).toEqual({
    code: 'PROVIDER_USAGE_LIMIT',
    category: 'usage_limit',
    retryable: false,
  })
})
