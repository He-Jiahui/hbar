import { expect, test } from 'bun:test'
import {
  createDevelopmentDiagnostics,
  DEVELOPMENT_DIAGNOSTIC_RING_CAPACITY,
} from '../apps/web/src/development-diagnostics'
import type { DiagnosticEvent } from '@hbar/contracts'

const event = (index: number): DiagnosticEvent => ({
  schemaVersion: 1,
  time: index,
  monotonicMs: index,
  component: 'client',
  level: 'info',
  event: 'connection.connected',
  outcome: 'success',
})

test('development diagnostics keeps a bounded local ring and returns detached snapshots', () => {
  const silentConsole = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined }
  const diagnostics = createDevelopmentDiagnostics({ enabled: true, console: silentConsole })
  diagnostics.clear()
  for (let index = 0; index < DEVELOPMENT_DIAGNOSTIC_RING_CAPACITY + 3; index += 1) diagnostics.sink.emit(event(index))
  const snapshot = diagnostics.recent()
  expect(snapshot).toHaveLength(DEVELOPMENT_DIAGNOSTIC_RING_CAPACITY)
  expect(snapshot[0]?.time).toBe(3)
  expect(snapshot.at(-1)?.time).toBe(DEVELOPMENT_DIAGNOSTIC_RING_CAPACITY + 2)
  diagnostics.clear()
  expect(diagnostics.recent()).toHaveLength(0)
  expect(snapshot).toHaveLength(DEVELOPMENT_DIAGNOSTIC_RING_CAPACITY)
})

test('disabled diagnostics retain only lifecycle and failure signals', () => {
  let writes = 0
  const diagnostics = createDevelopmentDiagnostics({
    enabled: false,
    console: { debug: () => writes++, info: () => writes++, warn: () => writes++, error: () => writes++ },
  })
  diagnostics.clear()
  diagnostics.sink.emit({
    ...event(1),
    event: 'rpc.settled',
    level: 'debug',
    durationMs: 10,
  })
  diagnostics.sink.emit({ ...event(2), level: 'error', event: 'rpc.error', outcome: 'failure' })
  expect(diagnostics.recent()).toHaveLength(1)
  expect(writes).toBe(1)
  expect(diagnostics.options.diagnosticSampleRate).toBe(0)
  expect(diagnostics.options.diagnosticSink).toBeDefined()
})

test('malformed events and throwing console implementations are isolated from the client', () => {
  const diagnostics = createDevelopmentDiagnostics({
    enabled: true,
    console: {
      debug: () => {
        throw new Error('console failure')
      },
      info: () => {
        throw new Error('console failure')
      },
      warn: () => {
        throw new Error('console failure')
      },
      error: () => {
        throw new Error('console failure')
      },
    },
  })
  diagnostics.clear()
  diagnostics.sink.emit(event(1))
  const secret = 'fixture-api-token-should-never-be-recorded'
  const malformed: DiagnosticEvent = {
    ...event(2),
    get method(): string {
      throw new Error(secret)
    },
  }
  diagnostics.sink.emit(malformed)
  diagnostics.sink.emit(Object.assign(event(3), { extra: secret }))
  const serialized = JSON.stringify(diagnostics.recent())
  expect(serialized).not.toContain(secret)
  expect(diagnostics.recent()).toHaveLength(1)
})
