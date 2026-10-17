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
import { BACKEND_UNATTENDED_SETTING } from '@hbar/contracts/backend'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import { removeOwnedTestDirectory } from './owned-temp-directory'

test('cancelling the original failed task aborts an already-running managed automatic retry', async () => {
  const prefix = 'hbar-managed-retry-cancel-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  let runtime: ProcessHostRuntime | undefined
  let server: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  let sessionId: string | undefined
  try {
    runtime = await ProcessHostRuntime.create({
      layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
      sourceRoot: process.cwd(),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      profileModule: join(process.cwd(), 'tests/fixtures/autonomy-retry-profile.ts'),
    })
    const current = runtime
    server = await startServer(current.kernel, { port: 0, runtime: current, controller: current.controller })
    const device = await server.auth.createDevice('Retry cancellation owner')
    client = new HbarClient(`http://127.0.0.1:${server.server.port}`, device.token)
    await client.connect()
    const workspace = (await current.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Missing retry cancellation workspace')
    const session = await createWorkspaceSessionCommandClient(client).execute(
      'session.create',
      { workspaceId: workspace.id },
      { idempotencyKey: crypto.randomUUID() },
    )
    sessionId = session.id
    await current.kernel.plugins.get('budget').set(session.id, 100)
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
      { idempotencyKey: crypto.randomUUID() },
    )
    const commands = createRunCommandClient(client)
    const accepted = await commands.execute(
      'run.submit',
      {
        sessionId: session.id,
        modelId: 'local-fixture',
        input: {
          text: 'stop-after-start: complete the task after a temporary failure',
          images: [],
          approval: 'deny',
          mode: 'plan',
        },
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    const started = join(root, `retry.started.${session.id}`)
    const deadline = Date.now() + 25_000
    while (!(await Bun.file(started).exists())) {
      if (Date.now() > deadline) throw new Error('No accepted retry started')
      await Bun.sleep(10)
    }
    const childId = await Bun.file(started).text()
    expect(childId).not.toBe(accepted.operationId)
    await commands.execute(
      'operation.cancel',
      { operationId: accepted.operationId },
      { idempotencyKey: crypto.randomUUID() },
    )
    const cancelledBy = Date.now() + 3_000
    while ((await current.storage.call('run', childId)).status !== 'cancelled' && Date.now() < cancelledBy)
      await Bun.sleep(10)
    expect((await current.storage.call('run', childId)).status).toBe('cancelled')
    await current.waitForIdle()
    expect((await current.storage.call('run', accepted.operationId)).status).toBe('failed')
    expect(await current.storage.call('cancelRequested', accepted.operationId)).toBe(true)
    expect(await current.storage.call('cancelRequested', childId)).toBe(true)
    expect(await current.storage.call('autonomyRetryPlan', session.id)).toBeNull()
    expect(current.coordinator.snapshot()).toMatchObject({ sessions: 0, resources: 0, physicalTools: 0 })
  } finally {
    if (sessionId) await Bun.write(join(root, `retry.release.${sessionId}`), 'release')
    client?.disconnect()
    await server?.close()
    await runtime?.close()
    await removeOwnedTestDirectory(root, prefix)
  }
}, 120_000)
