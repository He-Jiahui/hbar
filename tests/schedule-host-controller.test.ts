import { expect, test } from 'bun:test'
import { createScheduleHostController } from '../apps/host/src/schedule-host-controller'

const occurrence = (id: string, runId: string | null = null) => ({ id, scheduleId: 's', dueAt: 1, status: runId ? 'running' as const : 'pending' as const, sessionId: 'session', runId, attempt: 0, idempotencyKey: id, createdAt: 1, updatedAt: 1, error: null })
const schedule = { id: 's', workspaceId: 'w', name: 'n', input: 'hello', modelId: 'm', timezone: 'UTC', target: { mode: 'existing-session' as const, sessionId: 'session' }, spec: { kind: 'once' as const, at: 1 }, enabled: true, revision: 0, createdAt: 1, updatedAt: 1 }

test('schedule host controller recovers, submits, settles and closes', async () => {
  let active = [occurrence('old', 'run-old')]
  const transitions: string[] = []
  const calls: string[] = []
  const controller = createScheduleHostController({
    service: {
      get: async () => schedule,
      claim: async () => occurrence('new'),
      transition: async (id, status, runId, error, sessionId) => { transitions.push(status); return { ...occurrence(id, runId ?? null), status, error: error ?? null, sessionId: sessionId ?? 'session' } },
      list: async () => ({ items: [schedule], next: null, revision: 0 }),
      create: async () => schedule,
      update: async () => schedule,
      delete: async () => ({ scheduleId: 's', revision: 1 }),
      occurrences: async () => ({ items: [], next: null }),
      preview: () => ({ occurrences: [1, 1, 1, 1, 1], timezone: 'UTC' }),
    },
    reader: {
      enabledSchedules: async () => [schedule],
      activeScheduleOccurrences: async () => active,
      dueScheduleOccurrences: async () => [{ scheduleId: 's', dueAt: 1 }],
    },
    runCommands: {
      execute: async (id) => {
        calls.push(id)
        if (id === 'operation.get') return { operationId: 'run-old', sessionId: 'session', status: 'completed', startedAt: 1, endedAt: 2, error: null }
        return { status: 'accepted', commandId: 'run.submit', commandVersion: 1, requestId: 'r', idempotencyKey: 'new', operationId: 'run-new', sessionId: 'session', acceptedAt: 1 }
      },
    },
    actorId: 'scheduler',
    prepareSession: async () => ({ sessionId: 'session' }),
    now: () => 2,
    intervalMs: 60_000,
  })
  await controller.start()
  active = []
  await controller.tick()
  await controller.close()
  expect(calls).toContain('operation.get')
  expect(calls).toContain('run.submit')
  expect(transitions).toContain('completed')
  expect(calls.filter((call) => call === 'run.submit')).toHaveLength(2)
})

test('restart recovery resolves an unknown occurrence from receipt without preparing or submitting', async () => {
  const active = [occurrence('unknown')]
  let prepares = 0
  const calls: string[] = []
  const transitions: string[] = []
  const controller = createScheduleHostController({
    service: {
      get: async () => schedule,
      claim: async () => null,
      transition: async (id, status, runId, error, sessionId) => {
        transitions.push(status)
        return { ...occurrence(id, runId ?? null), status, error: error ?? null, sessionId: sessionId ?? 'session' }
      },
      list: async () => ({ items: [schedule], next: null, revision: 0 }), create: async () => schedule,
      update: async () => schedule, delete: async () => ({ scheduleId: 's', revision: 1 }),
      occurrences: async () => ({ items: [], next: null }), preview: () => ({ occurrences: [1], timezone: 'UTC' }),
    },
    reader: { enabledSchedules: async () => [schedule], activeScheduleOccurrences: async () => active, dueScheduleOccurrences: async () => [] },
    runCommands: {
      execute: async (id) => { calls.push(id); return { status: 'accepted', commandId: 'run.submit', commandVersion: 1, requestId: 'r', idempotencyKey: 'k', operationId: 'run', sessionId: 'session', acceptedAt: 1 } },
      getReceipt: async () => ({ operationId: 'receipt-run' }),
    },
    actorId: 'scheduler', prepareSession: async () => { prepares++; return { sessionId: 'session' } }, now: () => 2, intervalMs: 60_000,
  })
  await controller.start()
  await controller.close()
  expect(prepares).toBe(0)
  expect(calls).toEqual([])
  expect(transitions).toContain('running')
})

test('known prepare failure is persisted and reported through ScheduleRunFailure occurrence', async () => {
  const failures: Array<{ scheduleId: string; occurrenceId: string; error: string }> = []
  const transitions: string[] = []
  const controller = createScheduleHostController({
    service: {
      get: async () => schedule,
      claim: async () => occurrence('failed'),
      transition: async (id, status, runId, error, sessionId) => {
        transitions.push(status)
        return { ...occurrence(id, runId ?? null), status, error: error ?? null, sessionId: sessionId ?? 'session' }
      },
      list: async () => ({ items: [schedule], next: null, revision: 0 }), create: async () => schedule,
      update: async () => schedule, delete: async () => ({ scheduleId: 's', revision: 1 }),
      occurrences: async () => ({ items: [], next: null }), preview: () => ({ occurrences: [1], timezone: 'UTC' }),
    },
    reader: { enabledSchedules: async () => [schedule], activeScheduleOccurrences: async () => [], dueScheduleOccurrences: async () => [{ scheduleId: 's', dueAt: 1 }] },
    runCommands: { execute: async () => { throw new Error('unused') } },
    actorId: 'scheduler', prepareSession: async () => { throw new Error('known prepare failure') },
    onFailure: (failure) => { failures.push(failure) }, now: () => 2, intervalMs: 60_000,
  })
  await controller.start()
  await controller.close()
  expect(transitions).toContain('failed')
  expect(failures).toEqual([{ scheduleId: 's', occurrenceId: 'failed', error: 'known prepare failure' }])
})

test('recovery terminal failure is reported once even when the same occurrence is returned twice', async () => {
  const active = [occurrence('failed', 'run-failed')]
  const failures: string[] = []
  let recoveryReads = 0
  const controller = createScheduleHostController({
    service: {
      get: async () => schedule,
      claim: async () => null,
      transition: async (id, status, runId, error, sessionId) => ({ ...occurrence(id, runId ?? null), status, error: error ?? null, sessionId: sessionId ?? 'session' }),
      list: async () => ({ items: [schedule], next: null, revision: 0 }), create: async () => schedule,
      update: async () => schedule, delete: async () => ({ scheduleId: 's', revision: 1 }),
      occurrences: async () => ({ items: [], next: null }), preview: () => ({ occurrences: [1], timezone: 'UTC' }),
    },
    reader: {
      enabledSchedules: async () => [schedule],
      activeScheduleOccurrences: async () => { recoveryReads++; return recoveryReads === 1 ? active : active },
      dueScheduleOccurrences: async () => [],
    },
    runCommands: { execute: async () => ({ operationId: 'run-failed', sessionId: 'session', status: 'failed', startedAt: 1, endedAt: 2, error: 'terminal failure' }) },
    actorId: 'scheduler', prepareSession: async () => ({ sessionId: 'session' }),
    onFailure: (failure) => { failures.push(failure.occurrenceId) }, now: () => 2, intervalMs: 60_000,
  })
  await controller.start()
  await controller.tick()
  await controller.close()
  expect(failures).toEqual(['failed'])
})
