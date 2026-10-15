import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { Storage, type StoragePort } from '@hbar/storage'
import type { GoalService } from '@hbar/plugin-sdk'
import type { RunFailure } from '@hbar/contracts'

const resources: { root: string; storage: Storage; kernels: Kernel[] }[] = []
async function rejectedCode(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
    return null
  } catch (error) {
    return error
  }
}
afterEach(async () => {
  for (const resource of resources.splice(0)) {
    for (const kernel of resource.kernels.splice(0)) await kernel.close()
    await resource.storage.close()
    await rm(resource.root, { recursive: true, force: true })
  }
})

for (const category of ['result_unknown', 'usage_limit', 'execution'] as const)
  test(`startup stops ${category} historical owned execution as Goal control state without borrowing its lease`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-goal-startup-owned-'))
    const storage = new Storage(join(root, 'state.sqlite'))
    const resource = { root, storage, kernels: [] as Kernel[] }
    resources.push(resource)
    await storage.call('ready')
    const source: StoragePort = { call: (method, ...args) => storage.call(method, ...args), close: async () => {} }
    const open = async () => {
      const kernel = await Kernel.create({
        home: join(root, 'data'),
        workspace: root,
        demo: true,
        secrets: new MemorySecrets(),
        lifecycle: 'managed',
        profile: { createStorage: async () => source },
      })
      resource.kernels.push(kernel)
      return kernel
    }
    const initial = await open()
    await initial.changePlugin('goal.codex', true, { autoContinue: true })
    const workspace = await storage.call('createWorkspace', root, 'Fixture')
    const session = await storage.call('createSession', workspace.id)
    const goals = initial.plugins.get<GoalService>('goal')
    const goal = (await goals.create(session.id, 'Keep unknown effects fenced')).goal
    if (!goal) throw new Error('Missing fixture Goal')
    const run = await storage.call(
      'enqueue',
      session.id,
      'historical-request',
      { text: 'Historical operation', images: [] },
      'local-fixture',
    )
    const owner = { unitId: 'kernel', generation: 1, incarnation: 'historical-kernel' }
    const lease = await storage.call('runtimeExecutionClaim', {
      leaseId: crypto.randomUUID(),
      sessionId: session.id,
      runId: run.id,
      owner,
      fence: 1,
      acquiredAt: Date.now(),
      versions: {
        kernel: { unitId: 'kernel', generation: 1, artifactId: 'a'.repeat(64) },
        driver: { unitId: 'driver', generation: 1, artifactId: 'b'.repeat(64) },
        plugins: [],
        hooks: [],
      },
    })
    if (!lease) throw new Error('Missing execution lease')
    const failure: RunFailure = {
      code:
        category === 'result_unknown'
          ? 'RESULT_UNKNOWN'
          : category === 'usage_limit'
            ? 'USAGE_LIMIT'
            : 'FIXTURE_FAILED',
      category,
      retryable: false,
    }
    await storage.callOwned(lease, 'setRun', run.id, 'failed', 'Historical failure', failure)
    await storage.call('runtimeExecutionRelease', lease)
    const historical = await storage.call('run', run.id)
    expect(await storage.call('runtimeExecutionRead', run.id)).not.toBeNull()
    expect(
      await rejectedCode(storage.call('append', session.id, 'goal.updated', { forbidden: true }, run.id)),
    ).toMatchObject({ code: 'EXECUTION_AUTHORITY_REQUIRED' })
    await initial.close()
    resource.kernels.splice(resource.kernels.indexOf(initial), 1)

    const restarted = await open()
    const restoredGoals = restarted.plugins.get<GoalService>('goal')
    await restoredGoals.resumeOnStartup()
    const reason =
      category === 'result_unknown' ? 'result_unknown' : category === 'usage_limit' ? 'usage_limited' : 'run_failed'
    expect((await restoredGoals.get(session.id)).goal).toMatchObject({
      status: category === 'usage_limit' ? 'usage_limited' : 'paused',
      continuation: { phase: 'stopped', reason, trigger: run.id },
    })
    const events = await storage.call('events', session.id, 0, 1000)
    const stopped = events.findLast((event) => event.type === 'goal.updated')
    expect(stopped?.runId).toBeNull()
    expect(await storage.call('run', run.id)).toEqual(historical)
    expect((await storage.call('snapshot', session.id)).runs.map((entry) => entry.id)).toEqual([run.id])
    await restoredGoals.resumeOnStartup()
    expect((await storage.call('snapshot', session.id)).runs.map((entry) => entry.id)).toEqual([run.id])
    expect(
      await rejectedCode(storage.call('append', session.id, 'goal.updated', { forbidden: true }, run.id)),
    ).toMatchObject({ code: 'EXECUTION_AUTHORITY_REQUIRED' })
    await restarted.close()
    resource.kernels.splice(resource.kernels.indexOf(restarted), 1)
    const again = await open()
    await again.plugins.get<GoalService>('goal').resumeOnStartup()
    expect((await again.plugins.get<GoalService>('goal').get(session.id)).goal?.continuation).toMatchObject({
      phase: 'stopped',
      reason,
      trigger: run.id,
    })
    expect(await storage.call('run', run.id)).toEqual(historical)
    expect((await storage.call('snapshot', session.id)).runs).toHaveLength(1)
  })
