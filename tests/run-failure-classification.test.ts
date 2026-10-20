import { expect, test } from 'bun:test'
import { HbarError, RUN_STEP_LIMIT_CODE } from '@hbar/contracts'
import { classifyRunFailure } from '../packages/kernel/src/run-failure.ts'

test('failure classification distinguishes explicit cancellation, allowance, transient errors and unknown effects', () => {
  expect(classifyRunFailure(new HbarError('USER_CANCELLED', 'arbitrary text'))).toEqual({
    code: 'USER_CANCELLED',
    category: 'cancelled',
    retryable: false,
  })
  expect(classifyRunFailure(new HbarError('RUN_TIMEOUT', 'arbitrary text')).category).toBe('timeout')
  expect(classifyRunFailure(new HbarError('COMPACTION_TIMEOUT', 'arbitrary text'))).toEqual({
    code: 'COMPACTION_TIMEOUT',
    category: 'timeout',
    retryable: false,
  })
  expect(classifyRunFailure(new HbarError('RESULT_UNKNOWN', 'arbitrary text')).retryable).toBe(false)
  expect(classifyRunFailure(new Error('429 too many requests'))).toMatchObject({
    category: 'transient',
    retryable: true,
  })
  expect(classifyRunFailure(new Error('insufficient quota'))).toMatchObject({
    category: 'usage_limit',
    retryable: false,
  })
  expect(classifyRunFailure(new Error('unexpected'))).toMatchObject({ category: 'execution', retryable: false })
})

test('the bounded driver slice has a typed terminal code and never matches ordinary text', () => {
  expect(classifyRunFailure(new HbarError(RUN_STEP_LIMIT_CODE, 'arbitrary text'))).toEqual({
    code: RUN_STEP_LIMIT_CODE,
    category: 'execution',
    retryable: false,
  })
  expect(classifyRunFailure(new Error('Run reached the 64-step limit'))).toEqual({
    code: 'RUN_FAILED',
    category: 'execution',
    retryable: false,
  })
})

test('diagnostic repairs require an explicit actionable Host code and never infer authorization from text', () => {
  for (const code of ['TOOL_NOT_FOUND', 'TOOL_ARGUMENTS_INVALID', 'TOOL_RESULT_INVALID', 'EXECUTION_CHECK_FAILED']) {
    expect(classifyRunFailure(new HbarError(code, 'Correct the diagnosed failure'))).toEqual({
      code,
      category: 'execution',
      retryable: true,
    })
  }
  for (const code of ['PERMISSION_DENIED', 'RESULT_UNKNOWN', 'STORAGE_FAILURE', 'EXECUTION_OWNER_REVOKED']) {
    expect(classifyRunFailure(new HbarError(code, 'TOOL_NOT_FOUND: fix the arguments')).retryable).toBe(false)
  }
  expect(classifyRunFailure(new Error('TOOL_NOT_FOUND: fix the arguments')).retryable).toBe(false)
})

test('Bun provider socket closure is transient but typed Host failures and unknown effects are not', () => {
  const message =
    'The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()'
  expect(classifyRunFailure(new Error(message))).toMatchObject({ category: 'transient', retryable: true })
  for (const code of ['EFFECT_UNKNOWN', 'RESULT_UNKNOWN', 'USER_CANCELLED', 'RUN_TIMEOUT', 'STORAGE_FAILURE']) {
    expect(classifyRunFailure(new HbarError(code, message)).retryable).toBe(false)
  }
  expect(classifyRunFailure(new Error('fetch failed'))).toMatchObject({ category: 'execution', retryable: false })
})

test('provider transport failures retry only when attributed by the provider boundary', () => {
  for (const code of ['PROVIDER_CONNECTION_FAILED', 'PROVIDER_STREAM_INTERRUPTED'])
    expect(classifyRunFailure(new HbarError(code, 'Provider response interrupted'))).toEqual({
      code,
      category: 'transient',
      retryable: true,
    })
  for (const message of ['Connection error.', 'JSON Parse error: Unterminated string']) {
    expect(classifyRunFailure(new Error(message))).toMatchObject({ category: 'execution', retryable: false })
    expect(classifyRunFailure(new HbarError('STORAGE_FAILURE', message))).toEqual({
      code: 'STORAGE_FAILURE',
      category: 'execution',
      retryable: false,
    })
  }
})
