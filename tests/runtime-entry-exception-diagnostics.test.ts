import { expect, test } from 'bun:test'
import { runtimeExceptionMetadata, writeRuntimeExceptionDiagnostic } from '../packages/runtime/src/process-entry'

test('entry exception metadata keeps bounded numeric locations and fixed categories without payloads', () => {
  const error = new ReferenceError('private prompt token credential')
  error.stack =
    'ReferenceError: private prompt token credential\n at privateFunction (C:/private/user/file.ts:123:45)\n at /secret/other.ts:9:2\n at https://private.example/key:8:7\n at ignored:6:5'
  const metadata = runtimeExceptionMetadata(error)
  expect(metadata).toEqual({
    name: 'ReferenceError',
    locations: ['line_123_column_45', 'line_9_column_2', 'line_8_column_7'],
  })
  expect(JSON.stringify(metadata)).not.toContain('private')
  expect(JSON.stringify(metadata)).not.toContain('secret')
  expect(runtimeExceptionMetadata({ name: 'private-custom-name', code: 'private-key', stack: 'private' })).toEqual({
    name: 'UnknownError',
    locations: [],
  })
  expect(runtimeExceptionMetadata({ name: 'Error', code: 'EXECUTION_OWNER_REVOKED' }).code).toBe(
    'EXECUTION_OWNER_REVOKED',
  )
})

test('throwing exception getters and primitive rejection values cannot alter shutdown diagnostics', () => {
  expect(runtimeExceptionMetadata('private')).toEqual({ name: 'NonError', locations: [] })
  const hostile = {
    get name(): string {
      throw new Error('private getter')
    },
  }
  expect(runtimeExceptionMetadata(hostile)).toEqual({ name: 'UnknownError', locations: [] })
})

test('entry exception stderr seam writes immediately and isolates a failed synchronous writer', () => {
  const writes: string[] = []
  writeRuntimeExceptionDiagnostic('{"event":"host.runtime_entry_exception"}\n', (line) => {
    writes.push(line)
  })
  expect(writes).toEqual(['{"event":"host.runtime_entry_exception"}\n'])
  expect(() =>
    writeRuntimeExceptionDiagnostic('safe\n', () => {
      throw new Error('private writer failure')
    }),
  ).not.toThrow()
})
