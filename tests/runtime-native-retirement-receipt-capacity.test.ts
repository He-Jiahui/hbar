import { expect, test } from 'bun:test'
import { z } from 'zod'
import { fileURLToPath } from 'node:url'
import { ManagedProcess, type RuntimePhysicalRetirementReceipt } from '@hbar/runtime'
import { createRuntimeProcessTreePort } from '@hbar/runtime-native'
import type { RuntimeOwner } from '@hbar/contracts/runtime'

async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 10_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Real ManagedProcess/native retirement did not settle')
    await Bun.sleep(10)
  }
}
function sameOwner(a: RuntimeOwner, b: RuntimeOwner) {
  return a.unitId === b.unitId && a.generation === b.generation && a.incarnation === b.incarnation
}
function fixture(onPhysicalRetirement: (receipt: RuntimePhysicalRetirementReceipt) => void) {
  return new ManagedProcess({
    descriptor: {
      id: 'fixture',
      kind: 'plugin',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'a'.repeat(64),
      storageSchema: 23,
    },
    artifactId: 'c'.repeat(64),
    generation: 1,
    modulePath: fileURLToPath(new URL('./fixtures/runtime-service.ts', import.meta.url)),
    parent: { unitId: 'base', generation: 1, incarnation: 'retirement-consumer' },
    processTree: createRuntimeProcessTreePort(),
    heartbeatMs: 100,
    startupMs: 5_000,
    shutdownMs: 5_000,
    retryDelaysMs: [20, 20, 20],
    retrySlowMs: 20,
    jitter: 0,
    onFault: async () => {},
    onExit: async () => {},
    onPhysicalRetirement,
  })
}

test('real native receipts remain bounded by explicit exact-owner consumption across twenty crashes', async () => {
  const consumed: RuntimePhysicalRetirementReceipt[] = []
  const runtime = fixture((receipt) => {
    consumed.push(structuredClone(receipt))
  })
  try {
    await runtime.prepare()
    await runtime.activate()
    for (let index = 0; index < 20; index++) {
      const old = runtime.owner(),
        pid = runtime.snapshot().pid
      await expect(runtime.call('fixture.crash', undefined, z.undefined())).rejects.toMatchObject({
        code: 'IPC_DISCONNECTED',
      })
      await until(() => runtime.retirementReceipt(old) !== null)
      const receipt = runtime.retirementReceipt(old)
      if (!receipt) throw new Error('Missing actual native receipt')
      expect(receipt).toMatchObject({
        owner: old,
        childPid: pid,
        exitCode: 23,
        nativeJoined: true,
        onExitCompleted: true,
      })
      expect(consumed.some((value) => sameOwner(value.owner, old))).toBe(true)
      expect(runtime.acknowledgeRetirement({ ...old, incarnation: `${old.incarnation}-wrong` })).toBe(false)
      // Only after this consumer retained the exact receipt; no timer/metadata/LRU eviction.
      expect(runtime.acknowledgeRetirement(old)).toBe(true)
      expect(runtime.retirementReceipt(old)).toBeNull()
      expect(runtime.acknowledgeRetirement(old)).toBe(false)
      await until(() => runtime.snapshot().phase === 'serving' && !sameOwner(runtime.owner(), old))
      expect(await runtime.call('fixture.echo', `business-${index}`, z.string())).toBe(`business-${index}`)
    }
    expect(consumed).toHaveLength(20)
    expect(new Set(consumed.map((value) => value.owner.incarnation)).size).toBe(20)
  } finally {
    await runtime.dispose()
  }
}, 120_000)

test('sixteen unconsumed real receipts backpressure recovery but exact consumption makes the same process object recoverable', async () => {
  const receipts: RuntimePhysicalRetirementReceipt[] = []
  const runtime = fixture((receipt) => {
    receipts.push(structuredClone(receipt))
  })
  try {
    await runtime.prepare()
    await runtime.activate()
    for (let index = 0; index < 16; index++) {
      const old = runtime.owner()
      await expect(runtime.call('fixture.crash', undefined, z.undefined())).rejects.toMatchObject({
        code: 'IPC_DISCONNECTED',
      })
      await until(() => runtime.retirementReceipt(old) !== null)
      if (index < 15) await until(() => runtime.snapshot().phase === 'serving' && !sameOwner(runtime.owner(), old))
    }
    expect(receipts).toHaveLength(16)
    await expect(runtime.prepare()).rejects.toMatchObject({ code: 'RUNTIME_RETIREMENT_CAPACITY' })
    const sixteenth = receipts[15]
    if (!sixteenth) throw new Error('Missing exact sixteenth physical receipt')
    expect(runtime.retirementReceipt(sixteenth.owner)).toMatchObject({ nativeJoined: true, onExitCompleted: true })
    for (const receipt of receipts) expect(runtime.acknowledgeRetirement(receipt.owner)).toBe(true)
    await until(() => runtime.snapshot().phase === 'serving')
    expect(await runtime.call('fixture.echo', 'after-ledger-consumption', z.string())).toBe('after-ledger-consumption')
  } finally {
    await runtime.dispose()
  }
}, 120_000)
