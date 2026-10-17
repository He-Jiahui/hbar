import { expect, test } from 'bun:test'
import { z } from 'zod'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { HbarError } from '@hbar/contracts'
import { COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import type { RuntimeOwner, RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import {
  IpcPeer,
  ManagedProcess,
  RuntimeCoordinator,
  RuntimeValuePort,
  procedure,
  type IpcCallOptions,
  type RuntimePhysicalRetirementReceipt,
} from '@hbar/runtime'
import { StableStoragePort, STORAGE_SCHEMA_VERSION, createPathLayout } from '@hbar/storage'
import { RuntimeControllerKernel } from '../apps/host/src/runtime-controller-kernel'
import { RuntimeMaintenanceRelay } from '../apps/host/src/runtime-maintenance-relay'
import {
  maintenanceInspectionAckSchema,
  maintenanceInspectionRestoreSchema,
  maintenanceInspectionWakeReplySchema,
} from '../apps/host/src/runtime-maintenance-inspection-contract'
import type { HostRuntimeDemandPort } from '../apps/host/src/runtime-host-demand'

/** Actual ManagedProcess object: deliberately never started. Record public call entry, then use its real guard. */
class UnstartedProcess extends ManagedProcess {
  calls = 0
  override call<Output>(
    method: string,
    input: unknown,
    schema: z.ZodType<Output>,
    options: IpcCallOptions = {},
  ): Promise<Output> {
    this.calls++
    return super.call(method, input, schema, options)
  }
}
const owner = (generation: number): RuntimeOwner => ({
  unitId: 'maintenance',
  generation,
  incarnation: `undispatched-${generation}`,
})
const physical = (value: RuntimeOwner): RuntimePhysicalRetirementReceipt => ({
  owner: value,
  childPid: 1,
  exitCode: 0,
  nativeJoined: true,
  onExitCompleted: true,
  forced: false,
  cleanDisposeAck: true,
})

async function fixture(
  settings: { changedOwner?: boolean; restoreThenUnknown?: boolean },
  operation: (value: {
    relay: RuntimeMaintenanceRelay
    old: RuntimeOwner
    next: RuntimeOwner
    counts(): { acquired: number; released: number; held: number; processCalls: number; restores: number }
  }) => Promise<void>,
) {
  const old = owner(1),
    next = settings.changedOwner ? owner(2) : old
  const parent: RuntimeOwner = { unitId: 'base', generation: 1, incarnation: 'undispatched-base' }
  let receiver: IpcPeer | undefined
  const host = new IpcPeer({ owner: parent, remote: next, transport: { send: (frame) => receiver?.receive(frame) } })
  const child = new IpcPeer({ owner: next, remote: parent, transport: { send: (frame) => host.receive(frame) } })
  receiver = child
  const values = new RuntimeValuePort(host, { prefix: 'kernel.application' })
  const descriptor: RuntimeUnitDescriptor = {
    id: 'maintenance',
    kind: 'maintenance',
    isolation: 'process',
    dependencies: [],
    required: true,
    reloadable: true,
    contractFingerprint: 'a'.repeat(64),
    storageSchema: STORAGE_SCHEMA_VERSION,
  }
  const instance = new UnstartedProcess({
    descriptor,
    generation: next.generation,
    artifactId: 'b'.repeat(64),
    parent,
    modulePath: join(tmpdir(), 'never-start-maintenance-demand-fixture.ts'),
  })
  const coordinator = new RuntimeCoordinator({
    claim: (lease) => Promise.resolve(lease),
    release: () => Promise.resolve(),
    revoke: () => Promise.resolve(),
  })
  for (const value of settings.changedOwner ? [old, next] : [old]) {
    coordinator.register(
      value,
      {
        unitId: value.unitId,
        generation: value.generation,
        artifactId: 'b'.repeat(64),
      },
      descriptor,
    )
    coordinator.activate(value, 'default')
  }
  const layout = createPathLayout(
    join(tmpdir(), 'never-open-maintenance-demand-data'),
    join(tmpdir(), 'never-open-maintenance-demand-cache'),
    join(tmpdir(), 'never-open-maintenance-demand-paths.json'),
  )
  const kernel = new RuntimeControllerKernel(values, layout, false, 'undispatched-kernel')
  const storage = new StableStoragePort()
  let acquired = 0,
    released = 0,
    held = 0,
    restores = 0
  const demand: HostRuntimeDemandPort = {
    acquire: () => {
      acquired++
      held++
      return Promise.resolve({
        owners: [old],
        release() {
          released++
          held--
        },
      })
    },
  }
  const ack = maintenanceInspectionAckSchema.parse({
    epoch: 'undispatched-epoch',
    token: crypto.randomUUID(),
    version: 1,
    source: { databaseId: 'c'.repeat(64), catalogRevision: 'd'.repeat(64) },
  })
  const detach = child.register(
    'maintenance.inspection.restore',
    procedure(maintenanceInspectionRestoreSchema, maintenanceInspectionWakeReplySchema, (input) => {
      restores++
      return maintenanceInspectionWakeReplySchema.parse({ ...input, owner: next, timerArmed: true })
    }),
  )
  const endpoint = {
    owner: next,
    version: { unitId: next.unitId, generation: next.generation, artifactId: 'b'.repeat(64) },
    process: instance,
  }
  const relay = new RuntimeMaintenanceRelay({
    storage,
    coordinator,
    kernel: kernel.api,
    layout,
    demand,
    current: () => endpoint,
    resolve: () => endpoint,
    changed: () => {},
    ...(settings.restoreThenUnknown
      ? {
          beforeDispatch: async () => {
            await host.call(
              'maintenance.inspection.restore',
              {
                ack,
                checkpoint: { version: 1, cursor: null, nextCheckAt: Date.now() + 1_000 },
              },
              maintenanceInspectionWakeReplySchema,
            )
            throw new HbarError('MAINTENANCE_INSPECTION_UNKNOWN', 'Synthetic post-restore uncertainty')
          },
        }
      : {}),
  })
  let primary: unknown
  let failed = false
  const cleanup: unknown[] = []
  try {
    if (!settings.changedOwner) relay.sealInspection(old, ack)
    await operation({
      relay,
      old,
      next,
      counts: () => ({
        acquired,
        released,
        held,
        processCalls: instance.calls,
        restores,
      }),
    })
  } catch (error) {
    failed = true
    primary = error
  } finally {
    for (const close of [
      () => relay.physicalExitConfirmed(physical(old)),
      () => relay.physicalExitConfirmed(physical(next)),
      () => instance.dispose(),
      () => storage.close(),
      () => {
        detach()
        values.dispose()
        host.close()
        child.close()
      },
    ]) {
      try {
        await close()
      } catch (error) {
        cleanup.push(error)
      }
    }
  }
  if (failed && !cleanup.length) throw primary
  if (cleanup.length)
    throw new AggregateError(failed ? [primary, ...cleanup] : cleanup, 'Relay fixture cleanup failed', {
      cause: failed ? primary : cleanup[0],
    })
}

async function rejectedDispatch(relay: RuntimeMaintenanceRelay): Promise<unknown> {
  try {
    await relay.dispatch(
      {
        protocol: COMMAND_PROTOCOL_VERSION,
        requestId: 'undispatched-fixture',
        commandId: 'chatDatabase.statistics',
        commandVersion: 1,
        input: { scope: { kind: 'global' } },
      },
      'fixture',
    )
  } catch (error) {
    return error
  }
  throw new Error('Expected explicit dispatch rejection')
}

test('sealed maintenance with no restore hook releases its known-undispatched demand exactly once', async () => {
  await fixture({}, async ({ relay, old, counts }) => {
    expect(await rejectedDispatch(relay)).toMatchObject({ code: 'MAINTENANCE_INSPECTION_FENCED' })
    expect(counts()).toEqual({ acquired: 1, released: 1, held: 0, processCalls: 0, restores: 0 })
    relay.physicalExitConfirmed(physical(old))
    relay.physicalExitConfirmed(physical(old))
    expect(counts()).toEqual({ acquired: 1, released: 1, held: 0, processCalls: 0, restores: 0 })
  })
}, 20_000)

test('changed maintenance default with no restore hook releases the old known-undispatched demand once', async () => {
  await fixture({ changedOwner: true }, async ({ relay, old, next, counts }) => {
    expect(await rejectedDispatch(relay)).toMatchObject({ code: 'MAINTENANCE_INSPECTION_UNKNOWN' })
    expect(counts()).toEqual({ acquired: 1, released: 1, held: 0, processCalls: 0, restores: 0 })
    for (const value of [next, old, next, old]) relay.physicalExitConfirmed(physical(value))
    expect(counts()).toEqual({ acquired: 1, released: 1, held: 0, processCalls: 0, restores: 0 })
  })
}, 20_000)

test('restore hook uncertainty retains demand until exact physical proof without replay or duplicate release', async () => {
  await fixture({ restoreThenUnknown: true }, async ({ relay, old, counts }) => {
    expect(await rejectedDispatch(relay)).toMatchObject({ code: 'MAINTENANCE_INSPECTION_UNKNOWN' })
    expect(counts()).toEqual({ acquired: 1, released: 0, held: 1, processCalls: 0, restores: 1 })
    relay.physicalExitConfirmed(physical(owner(99)))
    expect(counts().held).toBe(1)
    relay.physicalExitConfirmed(physical(old))
    relay.physicalExitConfirmed(physical(old))
    expect(counts()).toEqual({ acquired: 1, released: 1, held: 0, processCalls: 0, restores: 1 })
  })
}, 20_000)
