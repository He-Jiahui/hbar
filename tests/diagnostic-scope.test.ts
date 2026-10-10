import { expect, test } from 'bun:test'
import type { DiagnosticEvent, DiagnosticSink } from '@hbar/contracts'
import { createDiagnosticScope, protectDiagnosticSink } from '@hbar/kernel/diagnostic-scope'

function event(overrides: Partial<DiagnosticEvent> = {}): DiagnosticEvent {
  return {
    schemaVersion: 1,
    time: 1,
    monotonicMs: 1,
    component: 'host',
    level: 'info',
    event: 'request.started',
    ...overrides,
  }
}

test('keeps overlapping async scopes isolated and clears ambient state', async () => {
  const scope = createDiagnosticScope()
  const seen: string[] = []
  const run = (id: string, delay: number) =>
    scope.run({ requestId: id, sessionId: `session-${id}` }, async () => {
      await Bun.sleep(delay)
      seen.push(scope.current()?.requestId ?? 'missing')
      return id
    })
  await Promise.all([run('a', 8), run('b', 1)])
  expect(seen.sort()).toEqual(['a', 'b'])
  expect(scope.current()).toBeUndefined()
})

test('restores scope after rejection and protects sink failures', () => {
  const scope = createDiagnosticScope()
  const events: DiagnosticEvent[] = []
  const sink: DiagnosticSink = {
    emit(value) {
      events.push(value)
      if (value.event === 'request.failed') throw new Error('sink failed')
    },
  }
  const protectedSink = protectDiagnosticSink(sink, scope)
  expect(() =>
    scope.run({ contextId: 'ctx', requestId: 'ambient', runId: 'run-a' }, () => {
      protectedSink.emit(event({ event: 'request.started', requestId: 'explicit' }))
      protectedSink.emit(event({ event: 'request.failed' }))
      throw new Error('business failure')
    }),
  ).toThrow('business failure')
  expect(events.map((value) => [value.requestId, value.contextId, value.runId])).toEqual([
    ['explicit', 'ctx', 'run-a'],
    ['ambient', 'ctx', 'run-a'],
  ])
  expect(scope.current()).toBeUndefined()
})

test('rejects extra or hostile fields without leaking payloads', () => {
  const scope = createDiagnosticScope()
  const events: DiagnosticEvent[] = []
  const sink: DiagnosticSink = { emit: (value) => events.push(value) }
  const protectedSink = protectDiagnosticSink(sink, scope)
  const unsafe = event() as DiagnosticEvent & { prompt: string }
  unsafe.prompt = 'secret prompt'
  protectedSink.emit(unsafe)
  const throwing = event()
  Object.defineProperty(throwing, 'method', {
    enumerable: true,
    get: () => {
      throw new Error('getter')
    },
  })
  expect(() => protectedSink.emit(throwing)).not.toThrow()
  expect(events).toHaveLength(0)
  expect(JSON.stringify(events)).not.toContain('secret prompt')
})
