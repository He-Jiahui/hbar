import { describe, expect, test } from 'bun:test'
import { createScheduleRunner, type ScheduleExecutionPort } from './schedule-runner'
import type { ScheduleDefinition, ScheduleOccurrence } from '@hbar/contracts/commands/schedules'
import type { ScheduleExecution } from '@hbar/contracts/schedule-execution'
const makeSchedule = (id: string): ScheduleDefinition => ({
  id,
  workspaceId: `w-${id}`,
  name: 'n',
  input: 'x',
  modelId: 'm',
  timezone: 'UTC',
  target: { mode: 'new-session' },
  spec: { kind: 'once', at: Date.now() + 10000 },
  enabled: true,
  revision: 0,
  createdAt: 1,
  updatedAt: 1,
})
function fakeService() {
  const schedules = new Map(['a', 'b', 'c'].map((id) => [id, makeSchedule(id)]))
  const occurrences = new Map<string, ScheduleOccurrence>()
  const executions = new Map<string, ScheduleExecution>()
  return {
    get: async (id: string) => schedules.get(id) ?? null,
    execution: async (id: string) => executions.get(id) ?? null,
    claim: async (id: string, dueAt: number) => {
      const key = `${id}:${dueAt}`
      const prior = occurrences.get(key)
      if (prior) return prior
      const schedule = schedules.get(id)
      if (!schedule) throw new Error('Missing original schedule')
      const value: ScheduleOccurrence = {
        id: key,
        scheduleId: id,
        dueAt,
        status: 'running',
        sessionId: null,
        runId: null,
        attempt: 0,
        idempotencyKey: key,
        createdAt: 1,
        updatedAt: 1,
        error: null,
      }
      occurrences.set(key, value)
      executions.set(key, {
        occurrenceId: key,
        authorization: { actorId: 'actor', idempotencyKey: 'management-key', commandId: 'schedule.create' },
        schedule: structuredClone(schedule),
      })
      return value
    },
    transition: async (
      id: string,
      status: ScheduleOccurrence['status'],
      runId?: string,
      error?: string,
      sessionId?: string,
    ) => {
      const value = [...occurrences.values()].find((item) => item.id === id)
      if (!value) throw new Error('Missing original occurrence')
      value.status = status
      value.runId = runId ?? value.runId
      value.sessionId = sessionId ?? value.sessionId
      value.error = error ?? null
      return value
    },
  }
}
describe('schedule runner', () => {
  test('bounds two concurrent schedules and rejects third', async () => {
    const service = fakeService()
    const barriers: (() => void)[] = []
    const execution = {
      prepare: async () => ({ sessionId: 's1' }),
      submit: async () => {
        await new Promise<void>((resolve) => barriers.push(resolve))
        return { operationId: 'r' }
      },
      observeOperation: async () => 'running' as const,
    }
    const runner = createScheduleRunner(service, execution, { maxActive: 2 })
    const first = runner.runSchedule('a', 1)
    const second = runner.runSchedule('b', 2)
    const third = runner.runSchedule('c', 3)
    expect(await third).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(barriers).toHaveLength(2)
    barriers[0]?.()
    barriers[1]?.()
    await Promise.all([first, second])
  })
  test('same schedule rejects overlapping due', async () => {
    const service = fakeService()
    const execution = {
      prepare: async () => ({ sessionId: 's1' }),
      submit: async () => ({ operationId: 'r' }),
      observeOperation: async () => 'running' as const,
    }
    const runner = createScheduleRunner(service, execution, { maxActive: 2 })
    const first = await runner.runSchedule('a', 1)
    expect(first).not.toBeNull()
    expect(await runner.runSchedule('a', 2)).toBeNull()
  })
  test('returns accepted run id and does not submit duplicate canonical occurrence', async () => {
    const service = fakeService()
    let submits = 0
    const execution = {
      prepare: async () => ({ sessionId: 's1' }),
      submit: async () => {
        submits++
        return { operationId: `r${submits}` }
      },
      observeOperation: async () => 'running' as const,
    }
    const runner = createScheduleRunner(service, execution, { maxActive: 2 })
    const first = await runner.runSchedule('a', 4)
    expect(first?.runId).toBe('r1')
    await runner.settle(first!.id)
    const second = await runner.runSchedule('a', 4)
    expect(second?.runId).toBe('r1')
    expect(submits).toBe(1)
  })
})

test('reuses persisted prepared session and resolves durable receipt before submit', async () => {
  const service = fakeService()
  let prepares = 0
  let submits = 0
  let receipts = 0
  const execution = {
    actorId: 'actor',
    prepare: async (input: { occurrenceId: string }) => {
      prepares++
      expect(input.occurrenceId).toBe('a:7')
      return { sessionId: 's1' }
    },
    getReceipt: async () => {
      receipts++
      return { operationId: 'receipt-run' }
    },
    submit: async () => {
      submits++
      return { operationId: 'submitted' }
    },
    observeOperation: async () => 'running' as const,
  }
  const originalClaim = service.claim
  service.claim = async (id: string, dueAt: number) => {
    const value = await originalClaim(id, dueAt)
    value!.sessionId = 's1'
    value!.status = 'unknown'
    return value
  }
  const runner = createScheduleRunner(service, execution)
  const result = await runner.runSchedule('a', 7)
  expect(result?.runId).toBe('receipt-run')
  expect(prepares).toBe(0)
  expect(receipts).toBe(1)
  expect(submits).toBe(0)
})

test('unknown submit failure remains recoverable without a run id', async () => {
  const service = fakeService()
  const execution = {
    prepare: async () => ({ sessionId: 's1' }),
    submit: async () => {
      throw new Error('request timed out')
    },
    observeOperation: async () => 'unknown' as const,
  }
  const runner = createScheduleRunner(service, execution)
  await expect(runner.runSchedule('a', 9)).rejects.toThrow('timed out')
  const occurrence = await service.claim('a', 9)
  expect(occurrence?.status).toBe('unknown')
  expect(occurrence?.runId).toBeNull()
})

test('does not resurrect terminal occurrence or submit unknown occurrence without receipt', async () => {
  const service = fakeService()
  let prepares = 0
  let submits = 0
  const execution = {
    actorId: 'actor',
    prepare: async () => {
      prepares++
      return { sessionId: 's' }
    },
    getReceipt: async () => null,
    submit: async () => {
      submits++
      return { operationId: 'r' }
    },
    observeOperation: async () => 'running' as const,
  }
  const terminalClaim = service.claim
  service.claim = async (id: string, dueAt: number) => {
    const value = await terminalClaim(id, dueAt)
    value!.status = dueAt === 11 ? 'completed' : 'unknown'
    value!.sessionId = dueAt === 12 ? 's' : null
    return value
  }
  const runner = createScheduleRunner(service, execution)
  expect((await runner.runSchedule('a', 11))?.status).toBe('completed')
  expect(await runner.runSchedule('a', 12)).toMatchObject({ status: 'unknown' })
  expect(prepares).toBe(0)
  expect(submits).toBe(0)
})

test('persists known prepare and submit failures as failed occurrences', async () => {
  for (const phase of ['prepare', 'submit'] as const) {
    const service = fakeService()
    const execution = {
      prepare: async () => {
        if (phase === 'prepare') throw new Error('invalid session')
        return { sessionId: 's1' }
      },
      submit: async () => {
        if (phase === 'submit') throw new Error('rejected by policy')
        return { operationId: 'run' }
      },
      observeOperation: async () => 'running' as const,
    }
    const runner = createScheduleRunner(service, execution)
    await expect(runner.runSchedule('a', phase === 'prepare' ? 20 : 21)).rejects.toThrow()
    const saved = await service.claim('a', phase === 'prepare' ? 20 : 21)
    expect(saved?.status).toBe('failed')
    expect(saved?.error).toMatch(phase === 'prepare' ? /invalid session/ : /rejected by policy/)
  }
})

test('recovers pending occurrence by preparing and submitting with its stable key', async () => {
  const service = fakeService()
  let prepares = 0
  let submits = 0
  const execution = {
    prepare: async () => {
      prepares++
      return { sessionId: 'recovered-session' }
    },
    submit: async (input: { idempotencyKey: string }) => {
      submits++
      expect(input.idempotencyKey).toBe('a:30')
      return { operationId: 'recovered-run' }
    },
    observeOperation: async () => 'running' as const,
  }
  const originalClaim = service.claim
  service.claim = async (id: string, dueAt: number) => {
    const value = await originalClaim(id, dueAt)
    value!.status = 'pending'
    return value
  }
  const runner = createScheduleRunner(service, execution)
  const pending = await service.claim('a', 30)
  const failures = await runner.recover([pending!])
  expect(failures).toEqual([])
  expect(prepares).toBe(1)
  expect(submits).toBe(1)
})

test('enforces two global active runs and one active run per schedule', async () => {
  const service = fakeService()
  const release: Array<() => void> = []
  const execution = {
    prepare: async () => ({ sessionId: 's' }),
    submit: async () => {
      await new Promise<void>((resolve) => release.push(resolve))
      return { operationId: 'run' }
    },
    observeOperation: async () => 'running' as const,
  }
  const runner = createScheduleRunner(service, execution, { maxActive: 2 })
  const first = runner.runSchedule('a', 40)
  const second = runner.runSchedule('b', 41)
  const sameSchedule = runner.runSchedule('a', 42)
  const thirdSchedule = runner.runSchedule('c', 43)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(await sameSchedule).toBeNull()
  expect(await thirdSchedule).toBeNull()
  expect(release).toHaveLength(2)
  release.forEach((done) => done())
  await Promise.all([first, second])
})

test('marks pending occurrence failed when its schedule is unavailable', async () => {
  const service = fakeService()
  const occurrence = await service.claim('a', 50)
  occurrence!.status = 'pending'
  service.get = async () => null
  const runner = createScheduleRunner(service, {
    prepare: async () => ({ sessionId: 's' }),
    submit: async () => ({ operationId: 'r' }),
    observeOperation: async () => 'running' as const,
  })
  const failures = await runner.recover([occurrence!])
  expect(failures[0]?.status).toBe('failed')
  expect(failures[0]?.error).toContain('unavailable')
})

test('dispatch and pending recovery use the frozen author and task instead of a later schedule revision', async () => {
  for (const recovery of [false, true]) {
    const service = fakeService()
    const occurrence = await service.claim('a', 60)
    if (!occurrence) throw new Error('Missing frozen occurrence')
    occurrence.status = 'pending'
    service.get = async () => ({ ...makeSchedule('a'), input: 'Changed task', modelId: 'changed-model' })
    const execution: ScheduleExecutionPort = {
      prepare: async (input) => {
        expect(input).toMatchObject({ actorId: 'actor', workspaceId: 'w-a', occurrenceId: occurrence.id })
        return { sessionId: 'original-target' }
      },
      submit: async (input) => {
        expect(input).toMatchObject({ actorId: 'actor', input: 'x', modelId: 'm', idempotencyKey: occurrence.id })
        return { operationId: 'original-run' }
      },
      observeOperation: async () => 'running',
    }
    const runner = createScheduleRunner(service, execution)
    if (recovery) expect(await runner.recover([structuredClone(occurrence)])).toEqual([])
    else await runner.runSchedule('a', 60)
    expect((await service.claim('a', 60))?.runId).toBe('original-run')
  }
})

test('an unattributed occurrence fails before preparing or submitting new work', async () => {
  const service = fakeService()
  service.execution = async () => null
  let actions = 0
  const runner = createScheduleRunner(service, {
    prepare: async () => {
      actions++
      return { sessionId: 's' }
    },
    submit: async () => {
      actions++
      return { operationId: 'r' }
    },
    observeOperation: async () => 'running',
  })
  await expect(runner.runSchedule('a', 61)).rejects.toThrow('original authorized schedule revision')
  expect(actions).toBe(0)
  expect((await service.claim('a', 61))?.status).toBe('failed')
})

test('prepared recovery reads the original actor receipt and never replays a submission after a later edit', async () => {
  const service = fakeService()
  const occurrence = await service.claim('a', 62)
  if (!occurrence) throw new Error('Missing frozen occurrence')
  occurrence.sessionId = 'original-target'
  occurrence.status = 'unknown'
  service.get = async () => ({ ...makeSchedule('a'), input: 'Changed task' })
  const runner = createScheduleRunner(service, {
    prepare: async () => {
      throw new Error('Must not prepare')
    },
    submit: async () => {
      throw new Error('Must not submit')
    },
    getReceipt: async (input) => {
      expect(input).toEqual({ sessionId: 'original-target', actorId: 'actor', idempotencyKey: occurrence.id })
      return { operationId: 'already-accepted' }
    },
    observeOperation: async () => 'running',
  })
  expect(await runner.recover([structuredClone(occurrence)])).toEqual([])
  expect((await service.claim('a', 62))?.runId).toBe('already-accepted')
})

test('a failed receipt lookup retains an unknown occurrence and never borrows another identity', async () => {
  const service = fakeService()
  const occurrence = await service.claim('a', 63)
  if (!occurrence) throw new Error('Missing frozen occurrence')
  occurrence.sessionId = 'original-target'
  occurrence.status = 'unknown'
  service.execution = async () => null
  const runner = createScheduleRunner(service, {
    prepare: async () => {
      throw new Error('Must not prepare')
    },
    submit: async () => {
      throw new Error('Must not submit')
    },
    observeOperation: async () => 'running',
  })
  expect(await runner.recover([structuredClone(occurrence)])).toEqual([])
  expect((await service.claim('a', 63))?.status).toBe('unknown')
  await expect(runner.runSchedule('a', 63)).rejects.toThrow('original authorized schedule revision')
  expect((await service.claim('a', 63))?.status).toBe('unknown')
})

test('recovery preserves the prepared session when submission times out after its acknowledgement is lost', async () => {
  const service = fakeService()
  const original = await service.claim('a', 64)
  if (!original) throw new Error('Missing frozen occurrence')
  const pending = { ...original, status: 'pending' as const }
  const runner = createScheduleRunner(service, {
    prepare: async () => ({ sessionId: 'prepared-before-timeout' }),
    submit: async () => {
      throw new Error('request timed out')
    },
    observeOperation: async () => 'unknown',
  })
  expect(await runner.recover([pending])).toEqual([])
  expect(await service.claim('a', 64)).toMatchObject({
    status: 'unknown',
    sessionId: 'prepared-before-timeout',
    runId: null,
  })
})
