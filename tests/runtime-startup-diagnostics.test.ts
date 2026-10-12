import { expect, test } from 'bun:test'
import { HbarError, diagnosticEventSchema, type DiagnosticEvent, type DiagnosticSink } from '@hbar/contracts'
import { recoverRuntimeStartup } from '../apps/host/src/runtime-startup'
import { recordRuntimeStartupFailure, RuntimeStartupDiagnostics } from '../apps/host/src/runtime-startup-diagnostics'

test('startup retry diagnostics retain the original failure code and last successful phase without leaking its message', async () => {
  const events: DiagnosticEvent[] = []
  const sink: DiagnosticSink = { emit: (event) => events.push(diagnosticEventSchema.parse(event)) }
  const startup = new RuntimeStartupDiagnostics(sink, process.pid)
  const original = new HbarError('NOT_FOUND', 'private fixture path must not enter diagnostics')
  let starts = 0

  await recoverRuntimeStartup({
    signal: new AbortController().signal,
    start: async () => {
      starts++
      startup.beginAttempt()
      startup.begin('artifact.prepare')
      startup.succeeded(starts - 1)
      startup.begin('unit.plugin.goal')
      if (starts === 1) throw original
      startup.succeeded(starts - 1)
    },
    failed: (error, nextAttemptAt) => {
      expect(error).toBe(original)
      expect(nextAttemptAt).toBeGreaterThan(Date.now())
      recordRuntimeStartupFailure(startup, error, starts)
    },
  })

  expect(starts).toBe(2)
  expect(events.map(({ event }) => event)).toEqual([
    'host.runtime_startup_phase',
    'host.runtime_startup_failed',
    'host.runtime_startup_phase',
    'host.runtime_startup_phase',
  ])
  expect(events[1]).toMatchObject({
    phase: 'failed.unit.plugin.goal.after.artifact.prepare',
    errorCode: 'NOT_FOUND',
    recoveryAttempt: 1,
    outcome: 'failure',
  })
  expect(events[3]).toMatchObject({
    phase: 'unit.plugin.goal',
    recoveryAttempt: 1,
    outcome: 'success',
  })
  expect(JSON.stringify(events)).not.toContain('private fixture path')
  expect(events.every((event) => event.durationMs !== undefined && event.durationMs >= 0)).toBe(true)
})

test('a new startup attempt does not report the previous attempt successful phase', async () => {
  const events: DiagnosticEvent[] = []
  const sink: DiagnosticSink = { emit: (event) => events.push(diagnosticEventSchema.parse(event)) }
  const startup = new RuntimeStartupDiagnostics(sink, process.pid)
  const abort = new AbortController()
  const firstFailure = new HbarError('NOT_FOUND', 'first private fixture detail')
  const secondFailure = new HbarError('NOT_FOUND', 'second private fixture detail')
  let starts = 0

  let stopError: unknown
  try {
    await recoverRuntimeStartup({
      signal: abort.signal,
      start: async () => {
        starts++
        startup.beginAttempt()
        if (starts === 1) {
          startup.begin('unit.plugin.goal')
          startup.succeeded(0)
          startup.begin('unit.kernel')
          throw firstFailure
        }
        startup.begin('artifact.prepare')
        throw secondFailure
      },
      failed: (error, nextAttemptAt) => {
        expect(nextAttemptAt).toBeGreaterThan(Date.now())
        recordRuntimeStartupFailure(startup, error, starts)
        expect(error).toBe(starts === 1 ? firstFailure : secondFailure)
        if (starts === 2) abort.abort()
      },
    })
  } catch (error) {
    stopError = error
  }

  expect(starts).toBe(2)
  expect(stopError).toMatchObject({ code: 'RUNTIME_STOPPING' })
  expect(events.filter((event) => event.outcome === 'failure').map((event) => event.phase)).toEqual([
    'failed.unit.kernel.after.unit.plugin.goal',
    'failed.artifact.prepare',
  ])
  expect(events.map((event) => event.errorCode).filter(Boolean)).toEqual(['NOT_FOUND', 'NOT_FOUND'])
  expect(JSON.stringify(events)).not.toContain('private fixture detail')
})
