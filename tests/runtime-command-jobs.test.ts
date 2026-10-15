import { expect, test } from 'bun:test'
import { z } from 'zod'
import { CommandError, type CommandExecutionTicket, type CommandPhysicalSettlement } from '@hbar/commands'
import {
  CommandExecutionJobs,
  commandJobIdentitySchema,
  commandJobSnapshotSchema,
  commandJobReadSchema,
  commandJobChunkSchema,
} from '@hbar/commands/jobs'
import { IpcPeer, procedure } from '@hbar/runtime'
import {
  attachRuntimeCommandJobs,
  RUNTIME_COMMAND_JOB_CONTROLS,
  trackRuntimeCommandJob,
} from '../apps/host/src/runtime-command-jobs'

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
async function failure(action: Promise<unknown>): Promise<unknown> {
  try {
    await action
  } catch (error) {
    return error
  }
  throw new Error('Expected private job refusal')
}
function fixture(execute: (signal: AbortSignal) => CommandExecutionTicket, options: { capacity?: number } = {}) {
  const jobs = new CommandExecutionJobs()
  const host = { unitId: 'host', generation: 1, incarnation: 'job-host' },
    owner = { unitId: 'controller', generation: 1, incarnation: 'job-owner' }
  let ownerPeer: IpcPeer | undefined
  const hostPeer = new IpcPeer({
    owner: host,
    remote: owner,
    transport: { send: (frame) => ownerPeer?.receive(frame) },
    controlMethods: RUNTIME_COMMAND_JOB_CONTROLS,
    ...(options.capacity ? { inFlight: options.capacity, reservedControl: 1 } : {}),
  })
  ownerPeer = new IpcPeer({
    owner,
    remote: host,
    transport: { send: (frame) => hostPeer.receive(frame) },
    controlMethods: RUNTIME_COMMAND_JOB_CONTROLS,
    ...(options.capacity ? { inFlight: options.capacity, reservedControl: 1 } : {}),
  })
  const detach = attachRuntimeCommandJobs(ownerPeer, jobs)
  ownerPeer.register(
    'fixture.start',
    procedure(commandJobIdentitySchema, commandJobSnapshotSchema, (input) => jobs.start(input, execute)),
  )
  return {
    jobs,
    peer: hostPeer,
    owner: ownerPeer,
    detach,
    start: (input: { jobId: string; actorId: string }, signal: AbortSignal) =>
      hostPeer.call('fixture.start', input, commandJobSnapshotSchema, { signal }),
    dispose: () => {
      jobs.dispose()
      detach()
      hostPeer.close()
      ownerPeer?.close()
    },
  }
}
const identity = { jobId: 'job', actorId: 'operator' }

test('owner dispatch waits for durable preparation and a local preparation failure proves no effect occurred', async () => {
  let starts = 0,
    acknowledged = 0
  const gate = deferred<void>()
  const f = fixture(() => {
    starts++
    return {
      result: Promise.resolve('executed'),
      settled: Promise.resolve({ status: 'succeeded', executionStarted: true, result: 'executed' }),
    }
  })
  const ticket = trackRuntimeCommandJob(f.peer, identity, (signal) => f.start(identity, signal), {
    beforeStart: () => gate.promise,
    onAcknowledged: () => {
      acknowledged++
    },
  })
  try {
    await Bun.sleep(0)
    expect(starts).toBe(0)
    expect(f.jobs.stats().jobs).toBe(0)
    gate.reject(new CommandError('COMMAND_RECEIPT_FAILED', 'Cannot persist the command owner'))
    expect(await failure(ticket.result)).toMatchObject({ code: 'COMMAND_RECEIPT_FAILED' })
    expect(await ticket.settled).toMatchObject({
      status: 'failed',
      executionStarted: false,
      error: { code: 'COMMAND_RECEIPT_FAILED' },
    })
    await ticket.acknowledge()
    await ticket.acknowledge()
    expect(starts).toBe(0)
    expect(acknowledged).toBe(1)
  } finally {
    f.dispose()
  }
})

test('source cancellation during durable preparation releases a proven unstarted command without contacting the owner', async () => {
  const gate = deferred<void>(),
    controller = new AbortController()
  let starts = 0,
    remoteAcknowledgments = 0
  let preparationSignal: AbortSignal | undefined
  const f = fixture(() => {
    starts++
    return {
      result: Promise.resolve('executed'),
      settled: Promise.resolve({ status: 'succeeded', executionStarted: true, result: 'executed' }),
    }
  })
  f.detach()
  f.owner.register(
    'command.jobs.acknowledge',
    procedure(commandJobIdentitySchema, z.strictObject({ released: z.boolean() }), (input) => {
      remoteAcknowledgments++
      return f.jobs.acknowledge(input)
    }),
  )
  const ticket = trackRuntimeCommandJob(f.peer, identity, (signal) => f.start(identity, signal), {
    signal: controller.signal,
    beforeStart: (signal) => {
      preparationSignal = signal
      return gate.promise
    },
  })
  try {
    controller.abort()
    expect(preparationSignal?.aborted).toBe(true)
    gate.resolve()
    expect(await failure(ticket.result)).toMatchObject({ code: 'CANCELLED' })
    expect(await ticket.settled).toMatchObject({ status: 'failed', executionStarted: false })
    await ticket.acknowledge()
    expect(starts).toBe(0)
    expect(remoteAcknowledgments).toBe(0)
  } finally {
    f.dispose()
  }
})

test('a lost start receipt after preparation remains unknown and retains the original owner record', async () => {
  let starts = 0
  const f = fixture(() => {
    starts++
    return {
      result: Promise.resolve('executed'),
      settled: Promise.resolve({ status: 'succeeded', executionStarted: true, result: 'executed' }),
    }
  })
  const ticket = trackRuntimeCommandJob(
    f.peer,
    identity,
    async (signal) => {
      await f.start(identity, signal)
      throw new Error('Start acknowledgment lost')
    },
    { beforeStart: async () => {} },
  )
  try {
    expect(await failure(ticket.result)).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(await failure(ticket.settled)).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(await failure(ticket.acknowledge())).toMatchObject({ code: 'COMMAND_JOB_ACTIVE' })
    expect(starts).toBe(1)
    expect(f.jobs.stats().jobs).toBe(1)
  } finally {
    f.dispose()
  }
})

test('data-only job endpoints deliver a late Unicode result in bounded chunks and retain it until saved acknowledgment', async () => {
  const logical = deferred<unknown>(),
    physical = deferred<CommandPhysicalSettlement>()
  let starts = 0,
    stopped: boolean | undefined,
    acknowledged = 0
  const f = fixture(() => {
    starts++
    return { result: logical.promise, settled: physical.promise }
  })
  const ticket = trackRuntimeCommandJob(f.peer, identity, (signal) => f.start(identity, signal), {
    onTrackingStopped: (value) => {
      stopped = value
    },
    onAcknowledged: () => {
      acknowledged++
    },
  })
  try {
    logical.reject(new CommandError('RESULT_UNKNOWN', 'Write timed out'))
    expect(await failure(ticket.result)).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(await failure(ticket.acknowledge())).toMatchObject({ code: 'COMMAND_JOB_ACTIVE' })
    expect(f.jobs.stats().active).toBe(1)
    expect(
      await failure(f.peer.call('command.jobs.get', { ...identity, actorId: 'another' }, commandJobSnapshotSchema)),
    ).toMatchObject({ code: 'FORBIDDEN' })
    const output = { text: '中文🎯'.repeat(40_000), receipt: 'one-write' }
    physical.resolve({ status: 'succeeded', executionStarted: true, result: output })
    expect(await ticket.settled).toEqual({ status: 'succeeded', executionStarted: true, result: output })
    expect(f.jobs.stats()).toMatchObject({ jobs: 1, active: 0 })
    expect(starts).toBe(1)
    await ticket.acknowledge()
    await ticket.acknowledge()
    expect(stopped).toBe(true)
    expect(acknowledged).toBe(1)
    expect(f.jobs.stats()).toEqual({ jobs: 0, active: 0, waiters: 0, bufferedBytes: 0 })
  } finally {
    logical.resolve({})
    physical.resolve({ status: 'succeeded', executionStarted: true, result: {} })
    f.dispose()
  }
})

test('source cancellation requests the same owner to stop and continues following actual settlement', async () => {
  const logical = deferred<unknown>(),
    physical = deferred<CommandPhysicalSettlement>(),
    cancelled = deferred<void>()
  const source = new AbortController()
  const f = fixture((signal) => {
    signal.addEventListener(
      'abort',
      () => {
        logical.reject(new CommandError('RESULT_UNKNOWN', 'Cancelled write'))
        cancelled.resolve()
      },
      { once: true },
    )
    return { result: logical.promise, settled: physical.promise }
  })
  const ticket = trackRuntimeCommandJob(f.peer, identity, (signal) => f.start(identity, signal), {
    signal: source.signal,
  })
  try {
    source.abort()
    await cancelled.promise
    expect(await failure(ticket.result)).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(f.jobs.get(identity).physical.phase).toBe('pending')
    physical.resolve({
      status: 'failed',
      executionStarted: true,
      error: { code: 'PARTIAL_WRITE', message: 'Inspect state' },
    })
    expect(await ticket.settled).toMatchObject({
      status: 'failed',
      executionStarted: true,
      error: { code: 'PARTIAL_WRITE' },
    })
    await ticket.acknowledge()
  } finally {
    logical.resolve({})
    physical.resolve({ status: 'succeeded', executionStarted: true, result: {} })
    f.dispose()
  }
})

test('cancellation retains reserved IPC capacity when normal slots are occupied by job watches', async () => {
  const logical = deferred<unknown>(),
    physical = deferred<CommandPhysicalSettlement>()
  const signals: AbortSignal[] = []
  const f = fixture(
    (signal) => {
      signals.push(signal)
      return { result: logical.promise, settled: physical.promise }
    },
    { capacity: 4 },
  )
  const second = { ...identity, jobId: 'second' }
  try {
    await f.start(identity, new AbortController().signal)
    await f.start(second, new AbortController().signal)
    const waiting = Promise.allSettled(
      [identity, identity, second].map((input) =>
        f.peer.call('command.jobs.watch', { ...input, afterRevision: 1, waitMs: 25_000 }, commandJobSnapshotSchema),
      ),
    )
    const deadline = Date.now() + 5_000
    while (f.jobs.stats().waiters !== 3 && Date.now() < deadline) await Bun.sleep(1)
    expect(f.jobs.stats().waiters).toBe(3)
    expect(await f.peer.call('command.jobs.cancel', identity, z.strictObject({ accepted: z.boolean() }))).toEqual({
      accepted: true,
    })
    expect(signals[0]?.aborted).toBe(true)
    expect(f.jobs.stats().active).toBe(2)
    logical.resolve({ ok: true })
    physical.resolve({ status: 'succeeded', executionStarted: true, result: {} })
    await waiting
  } finally {
    logical.resolve({})
    physical.resolve({ status: 'succeeded', executionStarted: true, result: {} })
    f.dispose()
  }
})

test('a tracking deadline cannot turn an unfinished effect into a released command receipt', async () => {
  const logical = deferred<unknown>(),
    physical = deferred<CommandPhysicalSettlement>()
  const f = fixture(() => ({ result: logical.promise, settled: physical.promise }))
  let confirmed: boolean | undefined
  const ticket = trackRuntimeCommandJob(f.peer, identity, (signal) => f.start(identity, signal), {
    maxTrackingMs: 5,
    onTrackingStopped: (value) => {
      confirmed = value
    },
  })
  try {
    expect(await failure(ticket.result)).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(await failure(ticket.settled)).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(confirmed).toBe(false)
    expect(f.jobs.stats()).toMatchObject({ jobs: 1, active: 1 })
    expect(await failure(ticket.acknowledge())).toMatchObject({ code: 'COMMAND_JOB_ACTIVE' })
  } finally {
    logical.resolve({})
    physical.resolve({ status: 'succeeded', executionStarted: true, result: {} })
    f.dispose()
  }
})

test('owner lifetime cancellation stops tracking without replay or fabricated completion', async () => {
  const logical = deferred<unknown>(),
    physical = deferred<CommandPhysicalSettlement>(),
    lifetime = new AbortController()
  let starts = 0
  const f = fixture(() => {
    starts++
    return { result: logical.promise, settled: physical.promise }
  })
  const ticket = trackRuntimeCommandJob(f.peer, identity, (signal) => f.start(identity, signal), {
    lifetime: lifetime.signal,
  })
  try {
    await f.peer.call('command.jobs.get', identity, commandJobSnapshotSchema)
    lifetime.abort()
    expect(await failure(ticket.result)).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(await failure(ticket.settled)).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(starts).toBe(1)
    expect(f.jobs.get(identity).physical.phase).toBe('pending')
  } finally {
    logical.resolve({})
    physical.resolve({ status: 'succeeded', executionStarted: true, result: {} })
    f.dispose()
  }
})

test('malformed result cursors or byte counts cannot release the retained owner receipt', async () => {
  for (const fault of ['cursor', 'bytes']) {
    const data = { text: '中文🎯' }
    const f = fixture(() => ({
      result: Promise.resolve(data),
      settled: Promise.resolve({ status: 'succeeded', executionStarted: true, result: data }),
    }))
    let acknowledged = 0,
      confirmed: boolean | undefined
    try {
      await f.start(identity, new AbortController().signal)
      const state = f.jobs.get(identity)
      expect(state.physical.phase).toBe('settled')
      f.detach()
      f.owner.register(
        'command.jobs.read',
        procedure(commandJobReadSchema, commandJobChunkSchema, (input) => {
          const chunk = f.jobs.read(input)
          return fault === 'cursor' ? { ...chunk, nextOffset: 0 } : { ...chunk, text: chunk.text.replace('中', 'x') }
        }),
      )
      f.owner.register(
        'command.jobs.acknowledge',
        procedure(commandJobIdentitySchema, z.strictObject({ released: z.boolean() }), (input) => {
          acknowledged++
          return f.jobs.acknowledge(input)
        }),
      )
      const ticket = trackRuntimeCommandJob(f.peer, identity, async () => state, {
        onTrackingStopped: (value) => {
          confirmed = value
        },
      })
      expect(await failure(ticket.result)).toMatchObject({ code: 'RESULT_UNKNOWN' })
      expect(await failure(ticket.settled)).toMatchObject({ code: 'RESULT_UNKNOWN' })
      expect(await failure(ticket.acknowledge())).toMatchObject({ code: 'COMMAND_JOB_ACTIVE' })
      expect(confirmed).toBe(false)
      expect(acknowledged).toBe(0)
      expect(f.jobs.stats().jobs).toBe(1)
    } finally {
      f.dispose()
    }
  }
})

test('explicit unavailable data retains physical completion and can be acknowledged after saving that fact', async () => {
  const data = { callback: () => {} }
  const f = fixture(() => ({
    result: Promise.resolve(data),
    settled: Promise.resolve({ status: 'succeeded', executionStarted: true, result: data }),
  }))
  const ticket = trackRuntimeCommandJob(f.peer, identity, (signal) => f.start(identity, signal))
  try {
    expect(await failure(ticket.result)).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(await failure(ticket.settled)).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(f.jobs.get(identity).physical).toMatchObject({
      phase: 'settled',
      status: 'succeeded',
      payload: { kind: 'unavailable' },
    })
    await ticket.acknowledge()
    expect(f.jobs.stats().jobs).toBe(0)
  } finally {
    f.dispose()
  }
})
