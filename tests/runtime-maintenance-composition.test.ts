import { expect, spyOn, test } from 'bun:test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { CommandError, type CommandExecutionExpectation, type CommandPhysicalSettlement } from '@hbar/commands'
import { CommandExecutionJobs, commandJobSnapshotSchema } from '@hbar/commands/jobs'
import { HbarError } from '@hbar/contracts'
import type { CommandExecutionOwner } from '@hbar/contracts/command-execution'
import type { RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import { IpcPeer, ManagedProcess, RuntimeCoordinator, procedure, type IpcCallOptions } from '@hbar/runtime'
import { createPathLayout, StableStoragePort, STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { HostCommandExecutionScopes } from '../apps/host/src/command-execution-scopes'
import { RuntimeKernelFacade } from '../apps/host/src/runtime-kernel-facade'
import { RuntimeMaintenanceRelay } from '../apps/host/src/runtime-maintenance-relay'
import { runtimeMaintenanceDispatchSchema } from '../apps/host/src/runtime-maintenance-contract'
import { attachRuntimeCommandJobs } from '../apps/host/src/runtime-command-jobs'
import { commandJobStartSchema } from '@hbar/commands/jobs'

function gate() {
  let resolve: () => void = () => {
    throw new Error('Gate not initialized')
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
class PreparationScopes extends HostCommandExecutionScopes {
  prepare: (signal: AbortSignal) => Promise<void> = async () => {}
  override beforeStart(_owner: CommandExecutionOwner) {
    return this.prepare
  }
}
/** Real relay, coordinator, framed IPC, command jobs and tracking; only demand/physical process boundary is injected. */
function fixture() {
  const hash = 'a'.repeat(64)
  const parent = { unitId: 'base', generation: 1, incarnation: crypto.randomUUID() }
  const descriptor: RuntimeUnitDescriptor = {
    id: 'maintenance',
    kind: 'maintenance',
    isolation: 'process',
    dependencies: [],
    required: true,
    reloadable: true,
    contractFingerprint: hash,
    storageSchema: STORAGE_SCHEMA_VERSION,
  }
  let local: IpcPeer
  class FramedProcess extends ManagedProcess {
    override call<Output>(method: string, input: unknown, schema: z.ZodType<Output>, options: IpcCallOptions = {}) {
      return local.call(method, input, schema, options)
    }
  }
  const process = new FramedProcess({
    descriptor,
    parent,
    artifactId: hash,
    modulePath: 'fixture-never-launched',
    generation: 1,
  })
  const owner = process.owner(),
    version = { unitId: owner.unitId, generation: owner.generation, artifactId: hash }
  const coordinator = new RuntimeCoordinator({
    claim: async (value) => value,
    release: async () => {},
    revoke: async () => {},
  })
  coordinator.register(owner, version, descriptor)
  coordinator.activate(owner)
  let remote: IpcPeer | undefined
  local = new IpcPeer({ owner: parent, remote: owner, transport: { send: (frame) => remote?.receive(frame) } })
  remote = new IpcPeer({ owner, remote: parent, transport: { send: (frame) => local.receive(frame) } })
  const jobs = new CommandExecutionJobs(),
    detach = attachRuntimeCommandJobs(remote, jobs)
  const entered = gate(),
    physical = gate(),
    preparation = new PreparationScopes()
  let starts = 0,
    releases = 0,
    acquisitions = 0,
    acknowledgments = 0
  let restore: (signal: AbortSignal) => Promise<void> = async () => {}
  let loseStart = false
  remote.register(
    'maintenance.command.start',
    procedure(commandJobStartSchema, commandJobSnapshotSchema, (input) => {
      starts++
      const result = jobs.start({ jobId: input.jobId, actorId: input.actorId }, () => ({
        result: Promise.resolve('completed'),
        settled: physical.promise.then<CommandPhysicalSettlement>(() => ({
          status: 'succeeded',
          executionStarted: true,
          result: 'completed',
        })),
      }))
      entered.resolve()
      if (loseStart) throw new HbarError('IPC_DISCONNECTED', 'Fixture loses the start receipt')
      return result
    }),
  )
  const realAck = jobs.acknowledge.bind(jobs)
  const ackSpy = spyOn(jobs, 'acknowledge').mockImplementation((identity) => {
    acknowledgments++
    return realAck(identity)
  })
  const storage = new StableStoragePort()
  const layout = createPathLayout(
    join(tmpdir(), 'unused-' + crypto.randomUUID()),
    join(tmpdir(), 'unused-cache'),
    join(tmpdir(), 'unused-pointer'),
  )
  const unavailable = (): never => {
    throw new Error('Unexpected Kernel business call')
  }
  const facade = new RuntimeKernelFacade({
    instanceId: crypto.randomUUID(),
    layout,
    demo: true,
    storage,
    coordinator,
    current: unavailable,
    resolve: unavailable,
    endpoints: () => [],
    maintain: (operation) => operation(),
  })
  const endpoint = { owner, version, process }
  const relay = new RuntimeMaintenanceRelay({
    storage,
    layout,
    kernel: facade.api,
    coordinator,
    commandScopes: preparation,
    current: () => endpoint,
    resolve: () => endpoint,
    changed: () => {},
    demand: {
      acquire: async (_ids, signal) => {
        signal.throwIfAborted()
        acquisitions++
        let released = false
        return {
          owners: [owner],
          release: () => {
            if (!released) {
              released = true
              releases++
            }
          },
        }
      },
    },
    beforeDispatch: (_owner, signal) => restore(signal),
  })
  const invocation = runtimeMaintenanceDispatchSchema.shape.invocation.parse({
    protocol: 1,
    commandId: 'chatDatabase.statistics',
    commandVersion: 1,
    requestId: 'maintenance-composition-' + crypto.randomUUID(),
    input: { scope: { kind: 'global' } },
  })
  const expectation: CommandExecutionExpectation = {
    descriptor: relay.describe(invocation.commandId),
    input: invocation.input,
  }
  return {
    relay,
    jobs,
    coordinator,
    owner,
    entered,
    physical,
    preparation,
    restore: (value: typeof restore) => {
      restore = value
    },
    loseStart: () => {
      loseStart = true
    },
    failAck: () => {
      ackSpy.mockImplementationOnce(() => {
        acknowledgments++
        throw new HbarError('IPC_DISCONNECTED', 'Fixture ACK reply is lost')
      })
    },
    counts: () => ({
      starts,
      releases,
      acquisitions,
      acknowledgments,
      resources: coordinator.references(owner).resources,
    }),
    ticket: (signal?: AbortSignal) =>
      relay.dispatchPreparedTracked(invocation, 'operator', expectation, signal ? { signal } : {}),
    dispose: async () => {
      physical.resolve()
      relay.dispose()
      jobs.dispose()
      detach()
      local.close()
      remote?.close()
      ackSpy.mockRestore()
      facade.dispose()
      await storage.close()
    },
  }
}

test('cold admission retains the exact command owner through physical completion and real ACK', async () => {
  const f = fixture(),
    restore = gate(),
    observed = gate()
  f.restore(async () => {
    observed.resolve()
    await restore.promise
  })
  const ticket = f.ticket()
  try {
    await observed.promise
    expect(f.counts()).toMatchObject({ acquisitions: 1, starts: 0, releases: 0 })
    restore.resolve()
    await f.entered.promise
    expect(f.counts()).toMatchObject({ starts: 1, releases: 0, resources: 1 })
    f.physical.resolve()
    await ticket.result
    await ticket.settled
    expect(f.counts()).toMatchObject({ releases: 0, resources: 1, acknowledgments: 0 })
    f.failAck()
    expect(await failure(ticket.acknowledge())).toMatchObject({ code: 'IPC_DISCONNECTED' })
    expect(f.counts()).toMatchObject({ releases: 0, resources: 1, acknowledgments: 1 })
    await ticket.acknowledge()
    await ticket.acknowledge()
    expect(f.counts()).toMatchObject({ releases: 1, resources: 0, acknowledgments: 2 })
  } finally {
    restore.resolve()
    await f.dispose()
  }
}, 10_000)

test('cancellation at the successful destination boundary releases the known unstarted hold without ACK', async () => {
  const f = fixture(),
    controller = new AbortController()
  f.restore(async () => {
    controller.abort()
  })
  const ticket = f.ticket(controller.signal)
  try {
    expect(await failure(ticket.result)).toMatchObject({ code: 'CANCELLED' })
    expect(await ticket.settled).toMatchObject({ status: 'failed', executionStarted: false })
    expect(f.counts()).toMatchObject({ starts: 0, releases: 1, resources: 0, acknowledgments: 0 })
    await ticket.acknowledge()
    expect(f.counts().releases).toBe(1)
  } finally {
    await f.dispose()
  }
}, 10_000)

test('a missing owner resource after a successful restore releases the unstarted demand', async () => {
  const f = fixture(),
    resource = spyOn(f.coordinator, 'acquireResource').mockReturnValueOnce(null)
  const ticket = f.ticket()
  try {
    expect(await failure(ticket.result)).toMatchObject({ code: 'BUSY' })
    expect(await ticket.settled).toMatchObject({ executionStarted: false })
    expect(f.counts()).toMatchObject({ starts: 0, releases: 1, resources: 0, acknowledgments: 0 })
  } finally {
    resource.mockRestore()
    await f.dispose()
  }
}, 10_000)

test('durable beforeStart failure releases known unstarted resource and demand without remote ACK', async () => {
  const f = fixture()
  f.preparation.prepare = async () => {
    throw new CommandError('COMMAND_RECEIPT_FAILED', 'Fixture persistence fails')
  }
  const ticket = f.ticket()
  try {
    expect(await failure(ticket.result)).toMatchObject({ code: 'COMMAND_RECEIPT_FAILED' })
    expect(await ticket.settled).toMatchObject({ executionStarted: false })
    expect(f.counts()).toMatchObject({ starts: 0, releases: 1, resources: 0 })
    await ticket.acknowledge()
    expect(f.counts().acknowledgments).toBe(0)
  } finally {
    await f.dispose()
  }
}, 10_000)

test('unresolved restore stays quarantined even when the command itself was never started', async () => {
  const f = fixture()
  f.restore(async () => {
    throw new HbarError('MAINTENANCE_INSPECTION_UNKNOWN', 'Fixture restore reply was lost')
  })
  const ticket = f.ticket()
  try {
    expect(await failure(ticket.result)).toMatchObject({ code: 'MAINTENANCE_INSPECTION_UNKNOWN' })
    expect(await ticket.settled).toMatchObject({ executionStarted: false })
    await ticket.acknowledge()
    f.relay.dispose()
    expect(f.counts()).toMatchObject({ starts: 0, releases: 0, resources: 0, acknowledgments: 0 })
  } finally {
    await f.dispose()
  }
}, 10_000)

test('lost command start receipt stays UNKNOWN and dispose cannot acknowledge or release it', async () => {
  const f = fixture()
  f.loseStart()
  const ticket = f.ticket()
  try {
    expect(await failure(ticket.result)).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(await failure(ticket.settled)).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(await failure(ticket.acknowledge())).toMatchObject({ code: 'COMMAND_JOB_ACTIVE' })
    f.relay.dispose()
    expect(f.counts()).toMatchObject({ starts: 1, releases: 0, resources: 1, acknowledgments: 0 })
  } finally {
    await f.dispose()
  }
}, 10_000)

test('dispose during durable preparation releases only the known unstarted owner', async () => {
  const f = fixture(),
    prepare = gate(),
    observed = gate()
  f.preparation.prepare = async () => {
    observed.resolve()
    await prepare.promise
  }
  const ticket = f.ticket()
  try {
    await observed.promise
    f.relay.dispose()
    prepare.resolve()
    expect(await failure(ticket.result)).toMatchObject({ code: 'CANCELLED' })
    expect(await ticket.settled).toMatchObject({ executionStarted: false })
    expect(f.counts()).toMatchObject({ starts: 0, releases: 1, resources: 0, acknowledgments: 0 })
  } finally {
    prepare.resolve()
    await f.dispose()
  }
}, 10_000)
