import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { ManagedProcess, RuntimeManager, type RuntimeArtifact, type RuntimeArtifactSet } from '@hbar/runtime'
import type { RuntimeUnitDescriptor } from '@hbar/contracts/runtime'

async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Retirement reason was not published')
    await Bun.sleep(10)
  }
}

test('a real child exit without native ownership proof retains draining and exposes the exact reason', async () => {
  const descriptor: RuntimeUnitDescriptor = {
    id: 'fixture',
    kind: 'plugin',
    isolation: 'process',
    dependencies: [],
    required: true,
    reloadable: true,
    contractFingerprint: 'b'.repeat(64),
    storageSchema: 23,
  }
  const first: RuntimeArtifact = {
    id: 'a'.repeat(64),
    unitId: descriptor.id,
    descriptor,
    entry: 'fixture.ts',
    files: [],
    inputs: [],
    resources: [],
    resourceFiles: [],
  }
  const second: RuntimeArtifact = { ...first, id: 'c'.repeat(64) }
  const sets = new Map<string, RuntimeArtifactSet>([
    ['first', { id: 'first', createdAt: 1, artifacts: [first] }],
    ['second', { id: 'second', createdAt: 2, artifacts: [second] }],
  ])
  const generations = new Map<number, ManagedProcess>()
  const manager = new RuntimeManager({
    instanceId: 'retirement-reason',
    sweepMs: 20,
    artifacts: {
      artifactSet: (id) => {
        const set = sets.get(id)
        if (!set) throw new Error('Unknown actual fixture artifact set')
        return set
      },
      preparedSets: () => [...sets.keys()],
    },
    references: () => ({ runs: 0, resources: 0, tools: 0 }),
    create(artifact, generation, changed) {
      // Intentionally omit processTree: an actual exited PID alone cannot prove its native ownership tree.
      const process = new ManagedProcess({
        descriptor: artifact.descriptor,
        artifactId: artifact.id,
        generation,
        modulePath: fileURLToPath(new URL('./fixtures/runtime-service.ts', import.meta.url)),
        parent: { unitId: 'base', generation: 1, incarnation: 'reason-parent' },
        startupMs: 3_000,
        shutdownMs: 500,
        onState: changed,
        onExit: async () => {},
      })
      generations.set(generation, process)
      return process
    },
  })
  try {
    manager.register(descriptor)
    const initial = manager.reload('first', [descriptor.id], true)
    await until(() => manager.getReload(initial.operationId).phase === 'completed')
    const old = generations.get(1)
    if (!old) throw new Error('Original actual child was not created')
    const oldOwner = old.owner()
    const operation = manager.reload('second', [descriptor.id])
    await until(() =>
      manager.getReload(operation.operationId).units.some((unit) => unit.reasonCode === 'RUNTIME_EXIT_UNKNOWN'),
    )
    expect(manager.getReload(operation.operationId)).toMatchObject({
      phase: 'draining',
      units: [{ unitId: descriptor.id, phase: 'draining', reasonCode: 'RUNTIME_EXIT_UNKNOWN' }],
    })
    expect(old.retirementReceipt(oldOwner)).toBeNull()
    expect(
      manager
        .snapshot()
        .units.find((unit) => unit.descriptor.id === descriptor.id)
        ?.generations.some((generation) => generation.generation === oldOwner.generation),
    ).toBe(true)
    expect(await manager.call(descriptor.id, 'fixture.echo', 'successor-still-works', z.string())).toBe(
      'successor-still-works',
    )
    await manager.reconcile()
    expect(manager.getReload(operation.operationId).phase).toBe('draining')
    expect(old.retirementReceipt(oldOwner)).toBeNull()
  } finally {
    await manager.close()
  }
}, 20_000)
