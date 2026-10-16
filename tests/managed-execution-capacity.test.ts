import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  HbarClient,
  createSettingsCommandClient,
  createRunCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { BACKEND_UNATTENDED_SETTING } from '@hbar/contracts/backend'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function until(check: () => Promise<boolean>, describe?: () => Promise<unknown>): Promise<void> {
  const deadline = Date.now() + 30_000
  while (!(await check())) {
    if (Date.now() > deadline)
      throw new Error(
        `Execution capacity fixture did not reach the expected state: ${JSON.stringify(await describe?.())}`,
      )
    await Bun.sleep(10)
  }
}

test('a managed unattended Host limits actual Runs to four, cancels queued reservations, and applies settings without restart', async () => {
  const prefix = 'hbar-managed-execution-capacity-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  let runtime: ProcessHostRuntime | undefined
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    runtime = await ProcessHostRuntime.create({
      layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
      sourceRoot: process.cwd(),
      unattended: true,
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      profileModule: join(process.cwd(), 'tests/fixtures/execution-capacity-profile.ts'),
    })
    host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
    const device = await host.auth.createDevice('Execution capacity owner')
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`, device.token)
    await client.connect()
    const current = runtime
    expect(current.coordinator.executionCapacity().capacity).toBe(4)
    const settings = createSettingsCommandClient(client)
    const runs = createRunCommandClient(client)
    const sessions = createWorkspaceSessionCommandClient(client)
    const setUnattended = async (enabled: boolean) => {
      const before = await settings.execute('settings.get', { scope: { kind: 'global' } })
      await settings.execute(
        'settings.apply',
        {
          schemaVersion: before.schemaVersion,
          scope: before.scope,
          baselineRevisions: before.revisions,
          changes: [{ op: 'set', path: [{ kind: 'field', name: BACKEND_UNATTENDED_SETTING }], value: enabled }],
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await until(async () => current.coordinator.executionCapacity().capacity === (enabled ? 4 : 4096))
    }
    await setUnattended(true)
    const workspace = (await runtime.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Missing capacity fixture workspace')
    const accepted: Array<{ sessionId: string; runId: string }> = []
    const submit = async () => {
      const session = await sessions.execute(
        'session.create',
        { workspaceId: workspace.id },
        { idempotencyKey: crypto.randomUUID() },
      )
      await current.kernel.plugins.get('budget').set(session.id, 100)
      const result = await runs.execute(
        'run.submit',
        {
          sessionId: session.id,
          modelId: 'local-fixture',
          input: { text: 'Complete this gated task', images: [], approval: 'deny', mode: 'plan' },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      accepted.push({ sessionId: session.id, runId: result.operationId })
    }
    for (let index = 0; index < 6; index++) await submit()
    await until(async () => current.coordinator.executionCapacity().queuedExecutions === 2)
    const started = async () =>
      Promise.all(
        accepted.map(async (item) => ({
          ...item,
          started: await Bun.file(join(root, `started.${item.sessionId}`)).exists(),
        })),
      )
    await until(async () => (await started()).filter((item) => item.started).length === 4)
    expect(current.coordinator.executionCapacity()).toMatchObject({ activeExecutions: 4, queuedExecutions: 2 })
    const states = await started()
    const queued = states.filter((item) => !item.started)
    const cancelled = queued[1]
    const next = queued[0]
    const first = states.find((item) => item.started)
    if (!cancelled || !next || !first) throw new Error('Missing queued capacity task')
    await runs.execute(
      'operation.cancel',
      { operationId: cancelled.runId },
      { idempotencyKey: 'cancel-queued-capacity' },
    )
    expect((await runtime.storage.call('run', cancelled.runId)).status).toBe('cancelled')
    expect(current.coordinator.executionCapacity().queuedExecutions).toBe(1)
    await Bun.write(join(root, `release.${first.sessionId}`), 'release')
    await until(
      () => Bun.file(join(root, `started.${next.sessionId}`)).exists(),
      async () => ({
        capacity: current.coordinator.executionCapacity(),
        coordination: current.coordinator.snapshot(),
        ready: current.coordinator.capacityReadyQueue(),
        runs: await Promise.all(accepted.map((item) => current.storage.call('run', item.runId))),
      }),
    )
    expect(current.coordinator.executionCapacity().activeExecutions).toBeLessThanOrEqual(4)
    expect(await Bun.file(join(root, `started.${cancelled.sessionId}`)).exists()).toBe(false)
    await submit()
    await submit()
    await until(async () => current.coordinator.executionCapacity().queuedExecutions === 2)
    const instanceId = current.instanceId
    await setUnattended(false)
    await until(async () => (await started()).filter((item) => item.started).length === 7)
    expect(current.instanceId).toBe(instanceId)
    expect(current.coordinator.executionCapacity().activeExecutions).toBeGreaterThan(4)
    for (const item of accepted) await Bun.write(join(root, `release.${item.sessionId}`), 'release')
    await current.waitForIdle()
    expect(current.coordinator.executionCapacity()).toMatchObject({ activeExecutions: 0, queuedExecutions: 0 })
    expect(current.coordinator.snapshot()).toMatchObject({ sessions: 0, physicalTools: 0, resources: 0 })
  } finally {
    client?.disconnect()
    await host?.close()
    await runtime?.close()
    await removeOwnedTestDirectory(root, prefix)
  }
}, 120_000)
