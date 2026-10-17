import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { ManagedProcess, procedure } from '@hbar/runtime'
import { createRuntimeProcessTreePort } from '@hbar/runtime-native'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'

function gate() {
  let release: () => void = () => {
    throw new Error('Uninitialized stage gate')
  }
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

function create(shutdownMs: number, finalProbe: () => Promise<void>) {
  let heartbeats = 0
  const faults: string[] = []
  const firstHeartbeat = gate()
  const runtime = new ManagedProcess({
    descriptor: {
      id: 'idle-heartbeat-stage',
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
    modulePath: fileURLToPath(new URL('./fixtures/runtime-idle-final-stage-gate.ts', import.meta.url)),
    parent: { unitId: 'base', generation: 1, incarnation: 'idle-stage-parent' },
    heartbeatMs: 20,
    startupMs: 5_000,
    shutdownMs,
    processTree: createRuntimeProcessTreePort(),
    onExit: () => Promise.resolve(),
    onFault: (_owner, reason) => {
      faults.push(reason)
      return Promise.resolve()
    },
    onPeer: (peer) => {
      peer.onEvent('runtime.heartbeat', z.strictObject({ time: z.number().int().nonnegative() }), () => {
        heartbeats++
        firstHeartbeat.release()
      })
      peer.register('fixture.finalProbeGate', procedure(z.undefined(), z.undefined(), finalProbe))
    },
  })
  return { runtime, firstHeartbeat, faults, heartbeats: () => heartbeats }
}

test('a valid slow final idle proof freezes heartbeats but retains its original bounded stage liveness', async () => {
  let during: number | undefined
  const f = create(1_000, async () => {
    const before = f.heartbeats()
    await Bun.sleep(150)
    during = f.heartbeats() - before
  })
  try {
    await f.runtime.prepare()
    await f.runtime.activate()
    await f.firstHeartbeat.promise
    const owner = f.runtime.owner()
    expect(await f.runtime.retireIdle(owner)).toMatchObject({ status: 'confirmed-physical-exit', owner })
    expect(during).toBe(0)
    expect(f.faults).toEqual([])
    expect(f.runtime.retirementReceipt(owner)).toMatchObject({ forced: false, cleanDisposeAck: true, exitCode: 0 })
  } finally {
    await f.runtime.dispose()
  }
}, 15_000)

test('a hung final idle proof expires its original RPC stage and remains UNKNOWN with a forced nonclean receipt', async () => {
  const release = gate()
  const f = create(80, () => release.promise)
  try {
    await f.runtime.prepare()
    await f.runtime.activate()
    await f.firstHeartbeat.promise
    const owner = f.runtime.owner()
    const retirement = f.runtime.retireIdle(owner)
    expect(await retirement).toMatchObject({ status: 'unknown', owner })
    const end = Date.now() + 3_000
    while (!f.runtime.retirementReceipt(owner)) {
      if (Date.now() >= end) throw new Error('Timed-out idle owner did not produce its actual physical receipt')
      await Bun.sleep(5)
    }
    expect(f.runtime.retirementReceipt(owner)).toMatchObject({ forced: true, cleanDisposeAck: false })
    expect(f.faults).toContain('RUNTIME_CALL_TIMEOUT')
    expect(f.faults).not.toContain('RUNTIME_HEARTBEAT_TIMEOUT')
    expect(f.runtime.retireIdle(owner)).toBe(retirement)
    expect(f.runtime.owner()).toEqual(owner)
    expect(f.runtime.snapshot().pid).toBeNull()
  } finally {
    release.release()
    await f.runtime.dispose()
  }
}, 15_000)
