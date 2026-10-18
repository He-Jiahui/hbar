import { expect } from 'bun:test'
import type { RuntimeOwner, RuntimeVersion } from '@hbar/contracts/runtime'
import type { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'

/** A real local-demo claim establishes generation 1 before tests of later retirement/wake. */
export async function prepareFirstDriverExecution(runtime: ProcessHostRuntime, workspaceId: string, requestId: string) {
  const driver = runtime.manager.snapshot().units.find((unit) => unit.descriptor.id === 'driver.pi')
  expect(driver).toMatchObject({ generations: [], idle: { phase: 'dormant' } })
  const observed = new Map<string, { owner: RuntimeOwner; version: RuntimeVersion; pid: number }>()
  const unsubscribe = runtime.subscribe((snapshot) => {
    const unit = snapshot.units.find((value) => value.descriptor.id === 'driver.pi')
    for (const generation of unit?.generations ?? []) {
      if (generation.role !== 'default' || generation.phase !== 'serving' || generation.pid === null) continue
      observed.set(generation.incarnation, {
        owner: { unitId: 'driver.pi', generation: generation.generation, incarnation: generation.incarnation },
        version: { unitId: 'driver.pi', generation: generation.generation, artifactId: generation.artifactId },
        pid: generation.pid,
      })
    }
  })
  try {
    const provider = (await runtime.storage.call('providers')).find((value) => value.id === 'local-fixture')
    expect(provider).toMatchObject({ id: 'local-fixture', protocol: 'mock' })
    if (!provider || provider.protocol !== 'mock')
      throw new Error('First Driver preparation requires the local mock provider')
    // Separate Session: the later empty-Goal read/execution workload remains unchanged.
    const session = await runtime.storage.call('createSession', workspaceId)
    const run = await runtime.kernel.submit(
      session.id,
      requestId,
      { text: '/tool get_goal {}', images: [] },
      'local-fixture',
    )
    await runtime.waitForIdle(30_000)
    expect(await runtime.storage.call('run', run.id)).toMatchObject({ status: 'completed' })
    const receipt = await runtime.storage.call('runtimeExecutionRead', run.id)
    expect(observed.size).toBe(1)
    const first = [...observed.values()][0]
    if (!first) throw new Error('First real Driver owner missing')
    expect(first.owner.generation).toBe(1)
    expect(first.pid).toBeGreaterThan(0)
    expect(receipt).toMatchObject({ state: 'released', lease: { runId: run.id, versions: { driver: first.version } } })
    expect(runtime.coordinator.snapshot()).toMatchObject({ sessions: 0, physicalTools: 0, resources: 0 })
    console.info(
      JSON.stringify({
        type: 'fullhost-first-driver-precondition',
        requestId,
        owner: first.owner,
        version: first.version,
        pid: first.pid,
        receipt,
        externalModelRequests: 0,
      }),
    )
    return first
  } finally {
    unsubscribe()
  }
}
