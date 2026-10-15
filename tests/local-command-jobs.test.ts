import { expect, test } from 'bun:test'
import { z } from 'zod'
import {
  CommandError,
  CommandRegistry,
  createCommandExpectation,
  defineCommand,
  type CommandExecutionTicket,
} from '@hbar/commands'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'
import { HostCommandExecutionScopes } from '../apps/host/src/command-execution-scopes'
import { LocalCommandJobs } from '../apps/host/src/local-command-jobs'

function deferred<Value>() {
  let resolve: (value: Value) => void = () => {
    throw new Error('Not initialized')
  }
  let reject: (error: unknown) => void = () => {
    throw new Error('Not initialized')
  }
  const promise = new Promise<Value>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
function completed(result: unknown): CommandExecutionTicket {
  return {
    result: Promise.resolve(result),
    settled: Promise.resolve({ status: 'succeeded', executionStarted: true, result }),
  }
}
async function failure(action: Promise<unknown>): Promise<unknown> {
  try {
    await action
  } catch (error) {
    return error
  }
  throw new Error('Expected command failure')
}
const source: ExecutionOwnership = {
  leaseId: 'source-lease',
  sessionId: 'source-session',
  runId: 'source-run',
  fence: 1,
  acquiredAt: 1,
  owner: { unitId: 'kernel', generation: 1, incarnation: 'kernel-current' },
  versions: {
    kernel: { unitId: 'kernel', generation: 1, artifactId: 'a'.repeat(64) },
    driver: { unitId: 'driver.pi', generation: 1, artifactId: 'b'.repeat(64) },
    plugins: [],
    hooks: [],
  },
}

test('stable Host jobs retain a late physical effect after timeout, follow its exact job, and release only after acknowledgment', async () => {
  const gate = deferred<void>(),
    entered = deferred<void>()
  let writes = 0
  const registry = new CommandRegistry({ execution: 'host' })
  registry.register(
    defineCommand(
      {
        id: 'fixture.localWrite',
        owner: 'fixture',
        version: 1,
        execution: 'host',
        kind: 'command',
        stateEffect: 'persistent',
        scope: 'global',
        category: 'fixture',
        titleKey: 'fixture',
        descriptionKey: 'fixture',
        surfaces: ['api'],
        timeoutMs: 15,
      },
      z.strictObject({}),
      z.strictObject({ text: z.string() }),
    ),
    async () => {
      entered.resolve()
      await gate.promise
      writes++
      return { text: '中文🎯'.repeat(20_000) }
    },
    { durable: true },
  )
  const invocation = registry.prepare({
    protocol: 1,
    commandId: 'fixture.localWrite',
    commandVersion: 1,
    requestId: 'local-write',
    input: {},
  })
  const expected = createCommandExpectation({ invocation, descriptor: registry.describe('fixture.localWrite') })
  const jobs = new LocalCommandJobs({ maxJobs: 1 })
  try {
    const ticket = jobs.execute('operator', (signal) =>
      registry.dispatchPreparedTracked(invocation, 'operator', expected, { signal }),
    )
    await entered.promise
    expect(await failure(ticket.result)).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(writes).toBe(0)
    expect(jobs.stats()).toMatchObject({ jobs: 1, active: 1 })
    expect(await failure(ticket.acknowledge())).toMatchObject({ code: 'COMMAND_JOB_ACTIVE' })
    expect(() => jobs.execute('operator', () => completed({}))).toThrow('capacity')
    const owner = { instanceId: jobs.instanceId, jobId: ticket.jobId }
    expect(() => jobs.follow(owner, 'other-actor')).toThrow('another actor')
    expect(() => jobs.follow({ ...owner, instanceId: 'old-host' }, 'operator')).toThrow('original stable Host')
    const followed = jobs.follow(owner, 'operator')
    expect(await failure(followed.result)).toMatchObject({ code: 'RESULT_UNKNOWN' })
    gate.resolve()
    expect(await ticket.settled).toEqual({
      status: 'succeeded',
      executionStarted: true,
      result: { text: '中文🎯'.repeat(20_000) },
    })
    expect(await followed.settled).toEqual(await ticket.settled)
    expect(writes).toBe(1)
    expect(jobs.stats().bufferedBytes).toBeGreaterThan(65_536)
    await ticket.acknowledge()
    await followed.acknowledge()
    expect(jobs.stats()).toEqual({ jobs: 0, active: 0, waiters: 0, bufferedBytes: 0 })
  } finally {
    gate.resolve()
    jobs.dispose()
    registry.dispose()
  }
})

test('stable Host source admission requires a real lifetime retainer and bounds preparation before effects', async () => {
  const scopes = new HostCommandExecutionScopes(),
    gate = deferred<void>()
  const unsupported = new LocalCommandJobs({ scopes })
  let starts = 0,
    releases = 0,
    retained = 0
  const jobs = new LocalCommandJobs({
    scopes,
    maxJobs: 1,
    retainSource: () => {
      retained++
      return () => {
        releases++
      }
    },
  })
  try {
    await scopes.run(
      {
        source,
        beforeStart: async (owner) => {
          expect(owner).toMatchObject({ kind: 'host', instanceId: jobs.instanceId })
          await gate.promise
        },
      },
      async () => {
        expect(() =>
          unsupported.execute('operator', () => {
            starts++
            return completed({})
          }),
        ).toThrow('source lifetime')
        const ticket = jobs.execute('operator', () => {
          starts++
          return completed({})
        })
        expect(() => jobs.execute('operator', () => completed({}))).toThrow('capacity')
        expect(retained).toBe(1)
        expect(starts).toBe(0)
        expect(releases).toBe(0)
        expect(() => jobs.dispose()).toThrow('saved acknowledgment')
        gate.reject(new CommandError('COMMAND_RECEIPT_FAILED', 'Cannot bind source owner'))
        expect(await failure(ticket.result)).toMatchObject({ code: 'COMMAND_RECEIPT_FAILED' })
        expect(await ticket.settled).toMatchObject({ status: 'failed', executionStarted: false })
        await ticket.acknowledge()
        await ticket.acknowledge()
        expect(releases).toBe(1)
        expect(starts).toBe(0)
      },
    )
  } finally {
    unsupported.dispose()
    jobs.dispose()
  }
})

test('source cancellation during local preparation never starts its factory or releases its physical lease early', async () => {
  const scopes = new HostCommandExecutionScopes(),
    gate = deferred<void>(),
    controller = new AbortController()
  let starts = 0,
    releases = 0
  const jobs = new LocalCommandJobs({
    scopes,
    retainSource: () => () => {
      releases++
    },
  })
  try {
    const ticket = scopes.run({ source, beforeStart: () => gate.promise }, () =>
      jobs.execute(
        'operator',
        () => {
          starts++
          return completed({})
        },
        { signal: controller.signal },
      ),
    )
    controller.abort()
    expect(releases).toBe(0)
    gate.resolve()
    expect(await failure(ticket.result)).toMatchObject({ code: 'CANCELLED' })
    expect(await ticket.settled).toMatchObject({ status: 'failed', executionStarted: false })
    await ticket.acknowledge()
    expect(starts).toBe(0)
    expect(releases).toBe(1)
  } finally {
    jobs.dispose()
  }
})
