import { expect, spyOn, test } from 'bun:test'
import { HbarError } from '@hbar/contracts'
import { CommandExecutionJobs, commandJobIdentitySchema, commandJobSnapshotSchema } from '@hbar/commands/jobs'
import { IpcPeer, procedure } from '@hbar/runtime'
import { createDemandCommandTicket } from '../apps/host/src/runtime-demand-command-ticket'
import { RuntimeSettingsSchedulingHint } from '../apps/host/src/runtime-settings-scheduling-hint'
import { attachRuntimeCommandJobs, trackRuntimeCommandJob } from '../apps/host/src/runtime-command-jobs'
function gate() {
  let resolve: () => void = () => {
    throw new Error('Uninitialized gate')
  }
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
async function failure(value: Promise<unknown>) {
  try {
    await value
  } catch (error) {
    return error
  }
  throw new Error('Expected refusal')
}
function fixture() {
  const owner = { unitId: 'controller', generation: 1, incarnation: crypto.randomUUID() }
  const parent = { unitId: 'base', generation: 1, incarnation: crypto.randomUUID() }
  let remote: IpcPeer | undefined
  const peer = new IpcPeer({ owner: parent, remote: owner, transport: { send: (frame) => remote?.receive(frame) } })
  remote = new IpcPeer({ owner, remote: parent, transport: { send: (frame) => peer.receive(frame) } })
  const jobs = new CommandExecutionJobs(),
    detach = attachRuntimeCommandJobs(remote, jobs)
  const physical = gate(),
    entered = gate(),
    controller = new AbortController()
  const identity = { jobId: crypto.randomUUID(), actorId: 'operator' }
  let acquires = 0,
    releases = 0,
    starts = 0,
    restores = 0,
    loseStart = false
  let restore: () => Promise<void> = async () => {}
  remote.register(
    'fixture.start',
    procedure(commandJobIdentitySchema, commandJobSnapshotSchema, (input) => {
      starts++
      const result = jobs.start(input, () => ({
        result: Promise.resolve('known'),
        settled: physical.promise.then(() => ({
          status: 'succeeded' as const,
          executionStarted: true as const,
          result: 'known',
        })),
      }))
      entered.resolve()
      if (loseStart) throw new HbarError('IPC_DISCONNECTED', 'Lost fixture reply')
      return result
    }),
  )
  const ticket = () =>
    createDemandCommandTicket({
      signal: controller.signal,
      acquire: async () => {
        acquires++
        return {
          owners: [owner],
          release: () => {
            releases++
          },
        }
      },
      restore: async () => {
        restores++
        await restore()
      },
      start: () =>
        trackRuntimeCommandJob(
          peer,
          identity,
          (signal) => peer.call('fixture.start', identity, commandJobSnapshotSchema, { signal }),
          { signal: controller.signal },
        ),
    })
  return {
    controller,
    jobs,
    physical,
    entered,
    ticket,
    restore: (next: typeof restore) => {
      restore = next
    },
    lose: () => {
      loseStart = true
    },
    counts: () => ({ acquires, releases, starts, restores }),
    dispose: () => {
      physical.resolve()
      controller.abort()
      jobs.dispose()
      detach()
      peer.close()
      remote?.close()
    },
  }
}

test('cold ticket retains demand through real physical settlement and failed ACK, then releases once', async () => {
  const f = fixture(),
    restoration = gate(),
    observed = gate()
  f.restore(async () => {
    observed.resolve()
    await restoration.promise
  })
  const ticket = f.ticket()
  try {
    await observed.promise
    expect(f.counts()).toEqual({ acquires: 1, releases: 0, starts: 0, restores: 1 })
    restoration.resolve()
    await f.entered.promise
    f.physical.resolve()
    expect(await ticket.result).toBe('known')
    expect(await ticket.settled).toMatchObject({ status: 'succeeded', executionStarted: true })
    expect(f.counts().releases).toBe(0)
    const ack = spyOn(f.jobs, 'acknowledge').mockImplementationOnce(() => {
      throw new HbarError('IPC_DISCONNECTED', 'ACK lost')
    })
    try {
      expect(await failure(ticket.acknowledge?.() ?? Promise.reject(new Error('Missing ACK')))).toMatchObject({
        code: 'IPC_DISCONNECTED',
      })
      expect(f.counts().releases).toBe(0)
    } finally {
      ack.mockRestore()
    }
    await ticket.acknowledge?.()
    await ticket.acknowledge?.()
    expect(f.counts()).toEqual({ acquires: 1, releases: 1, starts: 1, restores: 1 })
  } finally {
    restoration.resolve()
    f.dispose()
  }
}, 10_000)

test('caller abort after known restore has no command dispatch and releases its hold', async () => {
  const f = fixture()
  f.restore(async () => {
    f.controller.abort()
  })
  const ticket = f.ticket()
  try {
    await failure(ticket.result)
    await failure(ticket.settled)
    expect(f.counts()).toEqual({ acquires: 1, releases: 1, starts: 0, restores: 1 })
  } finally {
    f.dispose()
  }
}, 10_000)

test('unknown restoration retains its exact hold and cannot be repeated by follow or ACK', async () => {
  const f = fixture()
  f.restore(async () => {
    throw new HbarError('SCHEDULE_RESTORE_UNKNOWN', 'Lost physical restore reply')
  })
  const ticket = f.ticket()
  try {
    expect(await failure(ticket.result)).toMatchObject({ code: 'SCHEDULE_RESTORE_UNKNOWN' })
    await failure(ticket.settled)
    await failure(ticket.acknowledge?.() ?? Promise.reject(new Error('Missing ACK')))
    const followed = ticket.follow?.()
    if (!followed) throw new Error('Missing follow')
    await failure(followed.result)
    await failure(followed.settled)
    expect(f.counts()).toEqual({ acquires: 1, releases: 0, starts: 0, restores: 1 })
  } finally {
    f.dispose()
  }
}, 10_000)

test('lost command reply is followed on the original job without reacquiring or restoring', async () => {
  const f = fixture()
  f.lose()
  const ticket = f.ticket()
  try {
    expect(await failure(ticket.result)).toMatchObject({ code: 'RESULT_UNKNOWN' })
    await failure(ticket.settled)
    expect(await failure(ticket.acknowledge?.() ?? Promise.reject(new Error('Missing ACK')))).toMatchObject({
      code: 'COMMAND_JOB_ACTIVE',
    })
    f.physical.resolve()
    const followed = ticket.follow?.()
    if (!followed) throw new Error('Missing follow')
    expect(await followed.result).toBe('known')
    await followed.settled
    await followed.acknowledge?.()
    expect(f.counts()).toEqual({ acquires: 1, releases: 1, starts: 1, restores: 1 })
  } finally {
    f.dispose()
  }
}, 10_000)

test('pending settings are metadata-only until an exact foreground owner consumes them', async () => {
  const hint = new RuntimeSettingsSchedulingHint<string>(),
    refreshed: string[] = []
  hint.request()
  hint.request()
  expect(hint.pending()).toBe(true)
  expect(hint.running()).toBeUndefined()
  await hint.consume('kernel-original', new AbortController().signal, async (owner) => {
    refreshed.push(owner)
  })
  expect(refreshed).toEqual(['kernel-original'])
  expect(hint.pending()).toBe(false)
})

test('a settings failure retains the hint without automatic retry or owner substitution', async () => {
  const hint = new RuntimeSettingsSchedulingHint<string>(),
    observed: string[] = []
  hint.request()
  await failure(
    hint.consume('old-owner', new AbortController().signal, async (owner) => {
      observed.push(owner)
      throw new HbarError('RUNTIME_OWNER_REVOKED', 'Owner changed')
    }),
  )
  expect(observed).toEqual(['old-owner'])
  expect(hint.pending()).toBe(true)
  await failure(
    hint.consume('old-owner', new AbortController().signal, async () => {
      observed.push('forbidden-replay')
    }),
  )
  expect(observed).toEqual(['old-owner'])
  await hint.consume('new-foreground-owner', new AbortController().signal, async (owner) => {
    observed.push(owner)
  })
  expect(observed).toEqual(['old-owner', 'new-foreground-owner'])
  expect(hint.pending()).toBe(false)
})

test('a new settings change during an awaited refresh is consumed without losing its hint', async () => {
  const hint = new RuntimeSettingsSchedulingHint<string>(),
    entered = gate(),
    release = gate()
  let refreshes = 0
  hint.request()
  const operation = hint.consume('captured-owner', new AbortController().signal, async (owner) => {
    expect(owner).toBe('captured-owner')
    if (++refreshes === 1) {
      entered.resolve()
      await release.promise
    }
  })
  await entered.promise
  hint.request()
  release.resolve()
  await operation
  expect(refreshes).toBe(2)
  expect(hint.pending()).toBe(false)
})

test('a different foreground owner cannot borrow an in-flight settings ACK', async () => {
  const hint = new RuntimeSettingsSchedulingHint<string>(),
    entered = gate(),
    release = gate(),
    refreshed: string[] = []
  hint.request()
  const first = hint.consume('owner-a', new AbortController().signal, async (owner) => {
    refreshed.push(owner)
    entered.resolve()
    await release.promise
  })
  await entered.promise
  expect(
    await failure(
      hint.consume('owner-b', new AbortController().signal, async (owner) => {
        refreshed.push(owner)
      }),
    ),
  ).toMatchObject({ code: 'RUNTIME_OWNER_REVOKED' })
  release.resolve()
  await first
  expect(refreshed).toEqual(['owner-a'])
  expect(hint.pending()).toBe(true)
  await hint.consume('owner-b', new AbortController().signal, async (owner) => {
    refreshed.push(owner)
  })
  expect(refreshed).toEqual(['owner-a', 'owner-b'])
  expect(hint.pending()).toBe(false)
})
