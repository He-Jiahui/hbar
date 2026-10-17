import { expect, test } from 'bun:test'
import { ManagedProcess, procedure, type ManagedIdleSnapshot } from '@hbar/runtime'
import { createRuntimeProcessTreePort } from '@hbar/runtime-native'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

function gate() {
  let release: () => void = () => {
    throw new Error('Uninitialized probe gate')
  }
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

function create(shutdownMs = 1_000) {
  const entered = gate()
  const release = gate()
  const samples: number[] = []
  const runtime = new ManagedProcess({
    descriptor: {
      id: 'probe-exclusion-real',
      kind: 'plugin',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'a'.repeat(64),
      storageSchema: STORAGE_SCHEMA_VERSION,
    },
    artifactId: 'c'.repeat(64),
    generation: 1,
    modulePath: fileURLToPath(new URL('./fixtures/runtime-idle-probe-gate.ts', import.meta.url)),
    parent: { unitId: 'base', generation: 1, incarnation: 'probe-exclusion-parent' },
    processTree: createRuntimeProcessTreePort(),
    startupMs: 5_000,
    shutdownMs,
    onPeer: (peer) => {
      peer.onEvent('fixture.probeSample', z.number().int().positive(), (value) => samples.push(value))
      peer.register(
        'fixture.probeGate',
        procedure(z.undefined(), z.undefined(), async () => {
          entered.release()
          await release.promise
        }),
      )
    },
    onExit: () => Promise.resolve(),
  })
  return { runtime, entered, release, samples }
}

test('concurrent public idle observers share one real owner probe and no settled result cache', async () => {
  const f = create()
  const probes: Promise<ManagedIdleSnapshot>[] = []
  try {
    await f.runtime.prepare()
    await f.runtime.activate()
    const first = f.runtime.idleSnapshot()
    probes.push(first)
    await f.entered.promise
    const second = f.runtime.idleSnapshot()
    probes.push(second)
    expect(second).toBe(first)
    f.release.release()
    const results = await Promise.all(probes)
    expect(results.every((result) => result.eligible)).toBe(true)
    expect(f.samples).toEqual([1])
    const fresh = f.runtime.idleSnapshot()
    probes.push(fresh)
    expect(fresh).not.toBe(first)
    expect((await fresh).eligible).toBe(true)
    expect(f.samples).toEqual([1, 2])
  } finally {
    f.release.release()
    await Promise.allSettled(probes)
    await f.runtime.dispose()
  }
}, 15_000)

test('retirement excludes public probe RPCs and awaits the already dispatched real probe before fresh private proof', async () => {
  const f = create()
  let first: Promise<ManagedIdleSnapshot> | undefined
  let retirement: ReturnType<ManagedProcess['retireIdle']> | undefined
  try {
    await f.runtime.prepare()
    await f.runtime.activate()
    const owner = f.runtime.owner()
    first = f.runtime.idleSnapshot()
    await f.entered.promise
    retirement = f.runtime.retireIdle(owner)
    const local = await f.runtime.idleSnapshot()
    expect(local).toMatchObject({ owner, phase: 'serving', eligible: false, child: null })
    expect(local.parent?.inFlight).toBe(1)
    expect(local.parent?.incoming).toBe(1)
    expect(f.samples).toEqual([1])
    f.release.release()
    expect((await first).eligible).toBe(false)
    expect(await retirement).toMatchObject({ status: 'confirmed-physical-exit', owner })
    expect(f.samples).toEqual([1, 2, 3])
    expect(f.runtime.snapshot()).toMatchObject({ phase: 'disposed', pid: null })
    expect(f.runtime.retirementReceipt(owner)).toMatchObject({
      owner,
      nativeJoined: true,
      forced: false,
      cleanDisposeAck: true,
      exitCode: 0,
    })
  } finally {
    f.release.release()
    await Promise.allSettled([first, retirement])
    await f.runtime.dispose()
  }
}, 15_000)

test('an existing public probe timeout retains UNKNOWN without a replacement probe or reopening admission', async () => {
  const f = create(80)
  let first: Promise<unknown> | undefined
  let retirement: ReturnType<ManagedProcess['retireIdle']> | undefined
  try {
    await f.runtime.prepare()
    await f.runtime.activate()
    const owner = f.runtime.owner()
    first = f.runtime.idleSnapshot().catch((error: unknown) => error)
    await f.entered.promise
    retirement = f.runtime.retireIdle(owner)
    expect(await first).toMatchObject({ code: 'IPC_TIMEOUT' })
    expect(await retirement).toMatchObject({ status: 'unknown', owner })
    expect(f.samples).toEqual([1])
    expect(f.runtime.retireIdle(owner)).toBe(retirement)
    const local = await f.runtime.idleSnapshot()
    expect(local).toMatchObject({ owner, eligible: false, child: null })
    expect(f.samples).toEqual([1])
    expect(f.runtime.retirementReceipt(owner)).toBeNull()
  } finally {
    f.release.release()
    await Promise.allSettled([first, retirement])
    await f.runtime.dispose()
  }
}, 10_000)
