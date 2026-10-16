import { expect, test } from 'bun:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { HbarClient, createSettingsCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { SettingsService } from '@hbar/kernel/controller'
import type { BudgetService } from '@hbar/plugin-sdk'
import { BACKEND_UNATTENDED_VALUE_KEY } from '@hbar/contracts/backend'
import { DESKTOP_STARTUP_MODE_SETTING } from '@hbar/contracts/desktop'
import { createPathLayout } from '@hbar/storage'
import { createHostSupervisor } from '../apps/host/src/supervisor'
import { removeOwnedTestDirectory } from './owned-temp-directory'

const connectionSchema = z.object({ url: z.string().url(), token: z.string().min(1) })

async function until<Value>(read: () => Promise<Value>, timeoutMs = 30_000): Promise<Value> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      return await read()
    } catch (error) {
      if (Date.now() >= deadline) throw error
      await Bun.sleep(20)
    }
  }
}

for (const entry of ['explicit-unattended', 'saved-background', 'client-override'] as const)
  test(`${entry} commits startup policy before restoring queued ordinary tasks`, async () => {
    const prefix = 'hbar-desktop-background-startup-'
    const root = await mkdtemp(join(tmpdir(), prefix))
    const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
    let seed: Kernel | undefined
    let client: HbarClient | undefined
    let supervisor: ReturnType<typeof createHostSupervisor> | undefined
    let supervision: Promise<number> | undefined
    try {
      seed = await Kernel.create({ layout, lifecycle: 'managed', secrets: new MemorySecrets() })
      const workspace = await seed.createWorkspace(root)
      const settings = new SettingsService(seed.storage)
      if (entry !== 'explicit-unattended') {
        const before = await settings.get({ kind: 'global' })
        await settings.apply({
          schemaVersion: before.schemaVersion,
          scope: before.scope,
          baselineRevisions: before.revisions,
          actorId: 'startup-fixture',
          idempotencyKey: 'save-background-startup',
          changes: [{ op: 'set', path: [{ kind: 'field', name: DESKTOP_STARTUP_MODE_SETTING }], value: 'background' }],
        })
      }
      const sessionIds: string[] = []
      for (let index = 0; index < 5; index++) {
        const session = await seed.createSession(workspace.id)
        sessionIds.push(session.id)
        await seed.plugins.get<BudgetService>('budget').set(session.id, 100)
        await seed.storage.call(
          'enqueue',
          session.id,
          `queued-before-startup-${index}`,
          { text: 'Complete this ordinary task', images: [], mode: 'default', approval: 'deny' },
          'local-fixture',
        )
      }
      await seed.close()
      seed = undefined
      supervisor = createHostSupervisor({
        command: [process.execPath, resolve('apps/host/src/main.ts')],
        hostArgs: [
          '--desktop',
          '--port',
          '0',
          '--data-root',
          layout.dataRoot,
          '--cache-root',
          layout.cacheRoot,
          '--workspace',
          root,
          '--profile',
          resolve('tests/fixtures/backend-startup-profile.ts'),
          '--demo',
          ...(entry === 'explicit-unattended' ? ['--unattended'] : []),
          ...(entry === 'client-override' ? ['--desktop-startup', 'client'] : []),
        ],
        connectionFile: layout.connectionFile,
        stdio: 'ignore',
      })
      supervision = supervisor.run()
      const connection = await until(
        async () => connectionSchema.parse(JSON.parse(await readFile(layout.connectionFile, 'utf8'))),
        100_000,
      )
      await until(async () => {
        const response = await fetch(`${connection.url}/api/desktop/startup`, {
          headers: { Authorization: `Bearer ${connection.token}` },
        })
        if (!response.ok) throw new Error(`Desktop startup is still preparing (${response.status})`)
      })
      client = new HbarClient(connection.url, connection.token)
      await client.connect()
      const current = client
      const snapshots = () =>
        Promise.all(sessionIds.map((sessionId) => current.call('session.snapshot', { sessionId })))
      const enabled = entry !== 'client-override'
      const configured = await createSettingsCommandClient(client).execute('settings.get', {
        scope: { kind: 'global' },
      })
      expect(configured.resolution.reports[BACKEND_UNATTENDED_VALUE_KEY]?.effectiveValue).toBe(enabled)
      await until(async () => {
        const runs = (await snapshots()).flatMap((snapshot) => snapshot.runs)
        const expectedRunning = enabled ? 4 : 5
        if (runs.length !== 5 || runs.filter((run) => run.status === 'running').length !== expectedRunning)
          throw new Error(`Unexpected restored startup claims: ${JSON.stringify(runs.map((run) => run.status))}`)
      })
      await Bun.write(join(root, 'release.startup'), 'release')
      const completed = await until(async () => {
        const values = await snapshots()
        const expected = enabled ? 1 : 2
        if (
          values.some(
            (snapshot) => snapshot.runs.length !== expected || snapshot.runs.some((run) => run.status !== 'completed'),
          )
        )
          throw new Error(
            `Restored tasks have not settled: ${JSON.stringify(values.map((snapshot) => snapshot.runs.map((run) => run.status)))}`,
          )
        return values
      })
      expect(completed.every((snapshot) => snapshot.runs.length === (enabled ? 1 : 2))).toBe(true)
    } finally {
      await Bun.write(join(root, 'release.startup'), 'release')
      client?.disconnect()
      await supervisor?.stop()
      await supervision
      await seed?.close()
      await removeOwnedTestDirectory(root, prefix)
    }
  }, 120_000)
