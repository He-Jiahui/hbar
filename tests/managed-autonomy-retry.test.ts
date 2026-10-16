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

test('a real managed backend resumes a planned ordinary retry after restart under its original device and budget without a Goal', async () => {
  const prefix = 'hbar-managed-autonomy-retry-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const options = {
    layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
    sourceRoot: process.cwd(),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    profileModule: join(process.cwd(), 'tests/fixtures/autonomy-retry-profile.ts'),
  }
  let runtime: ProcessHostRuntime | undefined
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    runtime = await ProcessHostRuntime.create(options)
    host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
    const device = await host.auth.createDevice('Ordinary retry owner')
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`, device.token)
    await client.connect()
    const workspace = (await runtime.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Missing managed retry workspace')
    const session = await createWorkspaceSessionCommandClient(client).execute(
      'session.create',
      { workspaceId: workspace.id },
      { idempotencyKey: 'source-session' },
    )
    await runtime.kernel.plugins.get('budget').set(session.id, 100)
    const settings = createSettingsCommandClient(client)
    const before = await settings.execute('settings.get', { scope: { kind: 'global' } })
    await settings.execute(
      'settings.apply',
      {
        schemaVersion: before.schemaVersion,
        scope: before.scope,
        baselineRevisions: before.revisions,
        changes: [{ op: 'set', path: [{ kind: 'field', name: BACKEND_UNATTENDED_SETTING }], value: true }],
      },
      { idempotencyKey: 'enable-backend' },
    )
    const accepted = await createRunCommandClient(client).execute(
      'run.submit',
      {
        sessionId: session.id,
        modelId: 'local-fixture',
        input: { text: 'Complete the original task', images: [], approval: 'deny', mode: 'plan' },
      },
      { idempotencyKey: 'source-task' },
    )
    const deadline = Date.now() + 20_000
    let planned = await runtime.storage.call('autonomyRetryPlan', session.id)
    while (!planned) {
      if (Date.now() > deadline) throw new Error('No durable retry was planned')
      await Bun.sleep(5)
      planned = await runtime.storage.call('autonomyRetryPlan', session.id)
    }
    expect(planned.plan).toMatchObject({ rootRunId: accepted.operationId, transientRetries: 1 })
    client.disconnect()
    client = undefined
    await runtime.close()
    runtime = undefined
    await host.close()
    host = undefined
    runtime = await ProcessHostRuntime.create(options)
    host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`, device.token)
    await client.connect()
    await runtime.waitForIdle()
    const snapshot = await runtime.kernel.snapshot(session.id)
    expect(snapshot.runs.map((run) => run.status)).toEqual(['completed', 'failed'])
    const original = await runtime.storage.call('runExecutionPrincipal', accepted.operationId)
    expect(original?.actorId).toBe(device.device.id)
    for (const run of snapshot.runs) {
      expect(run.input).toMatchObject({ mode: 'plan', approval: 'deny' })
      expect(await runtime.storage.call('runExecutionPrincipal', run.id)).toEqual(original)
    }
    expect((await runtime.kernel.plugins.get('goal').get(session.id)).goal).toBeNull()
    expect((await runtime.kernel.plugins.get('budget').get(session.id))?.usedTokens).toBe(2)
    expect(runtime.coordinator.snapshot().resources).toBe(0)
    expect(runtime.coordinator.snapshot().physicalTools).toBe(0)
    const ordinary = await createWorkspaceSessionCommandClient(client).execute(
      'session.create',
      { workspaceId: workspace.id },
      { idempotencyKey: 'default-completion-source' },
    )
    await runtime.kernel.plugins.get('budget').set(ordinary.id, 100)
    await createRunCommandClient(client).execute(
      'run.submit',
      {
        sessionId: ordinary.id,
        modelId: 'local-fixture',
        input: {
          text: 'Complete this ordinary Default task once after retry',
          images: [],
          approval: 'deny',
          mode: 'default',
        },
      },
      { idempotencyKey: 'default-completion-task' },
    )
    await runtime.waitForIdle()
    const normal = await runtime.kernel.snapshot(ordinary.id)
    expect(normal.runs.map((run) => run.status)).toEqual(['completed', 'failed'])
    expect(normal.runs.every((run) => run.input.mode === 'default' && run.input.approval === 'deny')).toBe(true)
    expect((await runtime.kernel.plugins.get('goal').get(ordinary.id)).goal).toBeNull()
    expect((await runtime.kernel.plugins.get('budget').get(ordinary.id))?.usedTokens).toBe(2)
    const stopped = await createWorkspaceSessionCommandClient(client).execute(
      'session.create',
      { workspaceId: workspace.id },
      { idempotencyKey: 'cancel-source' },
    )
    const pending = await createRunCommandClient(client).execute(
      'run.submit',
      {
        sessionId: stopped.id,
        modelId: 'local-fixture',
        input: { text: 'This task will be stopped during backoff', images: [], approval: 'deny', mode: 'plan' },
      },
      { idempotencyKey: 'cancel-task' },
    )
    const cancellationDeadline = Date.now() + 20_000
    while (!(await runtime.storage.call('autonomyRetryPlan', stopped.id))) {
      if (Date.now() > cancellationDeadline) throw new Error('No retry to cancel')
      await Bun.sleep(5)
    }
    await createRunCommandClient(client).execute(
      'operation.cancel',
      { operationId: pending.operationId },
      { idempotencyKey: 'stop-retry' },
    )
    await runtime.waitForIdle()
    expect((await runtime.kernel.snapshot(stopped.id)).runs.map((run) => run.status)).toEqual(['failed'])
    expect(await runtime.storage.call('cancelRequested', pending.operationId)).toBe(true)
    expect(await runtime.storage.call('autonomyRetryPlan', stopped.id)).toBeNull()
  } finally {
    client?.disconnect()
    await host?.close()
    await runtime?.close()
    await removeOwnedTestDirectory(root, prefix)
  }
}, 120_000)
