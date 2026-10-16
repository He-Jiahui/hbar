import { expect, test } from 'bun:test'
import { ManagedProcess, procedure, type ManagedProcessOptions } from '@hbar/runtime'
import { createRuntimeProcessTreePort } from '@hbar/runtime-native'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

function deferred() {
  let release: () => void = () => {
    throw new Error('Uninitialized fixture gate')
  }
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}
function create(generation: number, options: Partial<ManagedProcessOptions> = {}) {
  return new ManagedProcess({
    descriptor: {
      id: 'idle-real',
      kind: 'plugin',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'a'.repeat(64),
      storageSchema: STORAGE_SCHEMA_VERSION,
    },
    artifactId: 'c'.repeat(64),
    generation,
    modulePath: fileURLToPath(new URL('./fixtures/runtime-idle-service.ts', import.meta.url)),
    parent: { unitId: 'base', generation: 1, incarnation: 'idle-real-parent' },
    processTree: createRuntimeProcessTreePort(),
    startupMs: 5_000,
    shutdownMs: 1_000,
    onExit: () => Promise.resolve(),
    ...options,
  })
}

test('two real generations retire naturally with exact owner and joined native receipts', async () => {
  const owners: RuntimeOwner[] = []
  for (const generation of [1, 2]) {
    const runtime = create(generation)
    try {
      await runtime.prepare()
      await runtime.activate()
      const owner = runtime.owner()
      owners.push(owner)
      const pid = runtime.snapshot().pid
      expect(pid).not.toBeNull()
      if (pid === null) throw new Error('Real runtime child PID is unavailable')
      expect((await runtime.idleSnapshot()).eligible).toBe(true)
      expect(await runtime.retireIdle(owner)).toMatchObject({ status: 'confirmed-physical-exit', owner, childPid: pid })
      expect(runtime.retirementReceipt(owner)).toEqual({
        owner,
        childPid: pid,
        exitCode: 0,
        nativeJoined: true,
        onExitCompleted: true,
        forced: false,
        cleanDisposeAck: true,
      })
      expect(runtime.retirementReceipt({ ...owner, incarnation: 'different-attempt' })).toBeNull()
      expect(runtime.snapshot()).toMatchObject({ phase: 'disposed', pid: null })
    } finally {
      await runtime.dispose()
    }
  }
  expect(owners[0]).not.toEqual(owners[1])
}, 20_000)

test('real child call and parent callback keep idle busy until physical replies settle', async () => {
  let entered = false
  const release = deferred()
  const runtime = create(1, {
    onPeer: (peer) => {
      peer.register(
        'fixture.parent',
        procedure(z.undefined(), z.undefined(), async () => {
          entered = true
          await release.promise
        }),
      )
    },
  })
  let pending: Promise<void> | undefined
  try {
    await runtime.prepare()
    await runtime.activate()
    pending = runtime.call('fixture.callback', undefined, z.undefined(), { timeoutMs: 5_000 })
    const deadline = Date.now() + 3_000
    while (!entered) {
      if (Date.now() >= deadline) throw new Error('Real callback did not enter')
      await Bun.sleep(5)
    }
    expect((await runtime.idleSnapshot()).eligible).toBe(false)
    expect(await runtime.retireIdle(runtime.owner())).toMatchObject({ status: 'busy' })
    expect(runtime.retirementReceipt(runtime.owner())).toBeNull()
    release.release()
    await pending
    expect(await runtime.call('fixture.echo', 'still-serving', z.string())).toBe('still-serving')
    expect(await runtime.retireIdle(runtime.owner())).toMatchObject({ status: 'confirmed-physical-exit' })
  } finally {
    release.release()
    try {
      await pending
    } finally {
      await runtime.dispose()
    }
  }
}, 15_000)

test('dispose deadline produces UNKNOWN and elapsed service completion cannot reopen admission', async () => {
  const runtime = create(1, { shutdownMs: 80, configuration: { disposeDelayMs: 250 } })
  try {
    await runtime.prepare()
    await runtime.activate()
    const owner = runtime.owner()
    expect(await runtime.retireIdle(owner)).toMatchObject({ status: 'unknown', owner })
    await Bun.sleep(350)
    expect(await runtime.retireIdle(owner)).toMatchObject({ status: 'unknown', owner })
    await expect(runtime.call('fixture.echo', 'late', z.string())).rejects.toMatchObject({
      code: 'RUNTIME_IDLE_FENCED',
    })
    const receipt = runtime.retirementReceipt(owner)
    if (receipt) {
      expect(receipt.forced).toBe(true)
      expect(receipt.cleanDisposeAck).toBe(false)
    }
    expect(runtime.owner()).toEqual(owner)
  } finally {
    await runtime.dispose()
  }
}, 10_000)
