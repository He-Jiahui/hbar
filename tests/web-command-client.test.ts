import { expect, test } from 'bun:test'
import { z } from 'zod'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAppRuntime, type PlatformPort } from '@hbar/app-runtime'
import { HbarClient, createDirectoryQueryAdapter } from '@hbar/client'
import { createCommandExpectation } from '@hbar/commands'
import { commandJobSnapshotSchema } from '@hbar/commands/jobs'
import { clientCommandPreparationSchema } from '@hbar/contracts/client-commands'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server'
import { DeviceAuthorization } from '../apps/host/src/device-authorization'
import { publishRuntimeCommands } from '../apps/web/src/command-client'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function failure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected web command rejection')
}
async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  const end = Date.now() + 3_000
  while (!(await check())) {
    if (Date.now() > end) throw new Error('Web command fixture did not settle')
    await Bun.sleep(2)
  }
}
async function fixture(options: { role?: 'operator' | 'observer'; scoped?: boolean; platform?: PlatformPort } = {}) {
  const prefix = 'hbar-web-command-client-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0 })
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('No web command workspace')
  const device = await host.auth.createDevice('Web command owner', {
    role: options.role ?? 'operator',
    ...(options.scoped ? { workspaceIds: [workspace.id] } : {}),
  })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`, device.token)
  await client.connect()
  const runtime = createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: kernel.instanceId,
    directory: createDirectoryQueryAdapter(client),
    ...(options.platform ? { platform: options.platform } : {}),
  })
  const publication = publishRuntimeCommands(client, runtime)
  const target = { clientId: `web:${runtime.view.instanceId}`, generation: 1 }
  return {
    host,
    client,
    runtime: publication.runtime,
    publication,
    target,
    device,
    kernel,
    async prepare(commandId: string, input: unknown) {
      return host.commandClients.call(
        target,
        device.device.id,
        'prepare',
        { protocol: 1, requestId: crypto.randomUUID(), commandId, commandVersion: 1, input },
        clientCommandPreparationSchema,
      )
    },
    async dispose() {
      await publication.dispose()
      client.disconnect()
      await host.close()
      await kernel.close()
      await removeOwnedTestDirectory(root, prefix)
    },
  }
}

test('the published real AppRuntime prepares without effects, changes visible state and unregisters on dispose', async () => {
  const f = await fixture()
  try {
    await f.publication.ready
    const ids = f.host.commandClients.directory(f.device.device.id, {}).items[0]?.commands ?? []
    expect(ids).toHaveLength(7)
    expect(ids).not.toContain('app.initializeSidebar')
    expect(ids).not.toContain('app.openWindow')
    expect(f.runtime.view.state.presentation.getSnapshot().sidebarOpen).toBe(true)
    const prepared = await f.prepare('app.setSidebarVisible', { visible: false })
    expect(f.runtime.view.state.presentation.getSnapshot().sidebarOpen).toBe(true)
    const identity = { actorId: f.device.device.id, jobId: crypto.randomUUID() }
    await f.host.commandClients.call(
      f.target,
      identity.actorId,
      'command.jobs.start',
      { ...identity, invocation: prepared.invocation, expectation: createCommandExpectation(prepared) },
      commandJobSnapshotSchema,
    )
    await until(
      async () =>
        (
          await f.host.commandClients.call(
            f.target,
            identity.actorId,
            'command.jobs.get',
            identity,
            commandJobSnapshotSchema,
          )
        ).physical.phase === 'settled',
    )
    expect(f.runtime.view.state.presentation.getSnapshot().sidebarOpen).toBe(false)
    await f.host.commandClients.call(
      f.target,
      identity.actorId,
      'command.jobs.acknowledge',
      identity,
      z.object({ released: z.boolean() }),
    )
    await f.publication.dispose()
    expect(f.host.commandClients.list(identity.actorId).items).toEqual([])
  } finally {
    await f.dispose()
  }
})

test('real AppRuntime platform promises retain physical ownership through reconnect and cancellation', async () => {
  const gate = Promise.withResolvers<void>()
  let opened = 0
  const f = await fixture({
    platform: {
      openWindow: async () => {
        opened++
        await gate.promise
      },
      closeWindow: async () => {},
    },
  })
  try {
    await f.publication.ready
    const prepared = await f.prepare('app.openWindow', { windowId: 'explicit-window', page: { kind: 'session' } })
    expect(opened).toBe(0)
    const identity = { actorId: f.device.device.id, jobId: crypto.randomUUID() }
    await f.host.commandClients.call(
      f.target,
      identity.actorId,
      'command.jobs.start',
      { ...identity, invocation: prepared.invocation, expectation: createCommandExpectation(prepared) },
      commandJobSnapshotSchema,
    )
    await until(() => opened === 1)
    await f.host.commandClients.call(
      f.target,
      identity.actorId,
      'command.jobs.cancel',
      identity,
      z.object({ accepted: z.boolean() }),
    )
    expect(
      (
        await f.host.commandClients.call(
          f.target,
          identity.actorId,
          'command.jobs.get',
          identity,
          commandJobSnapshotSchema,
        )
      ).physical.phase,
    ).toBe('pending')
    f.client.disconnect()
    await f.client.connect()
    await until(() =>
      f.host.commandClients.list(identity.actorId).items.some((item) => item.clientId === f.target.clientId),
    )
    gate.resolve()
    await until(
      async () =>
        (
          await f.host.commandClients.call(
            f.target,
            identity.actorId,
            'command.jobs.get',
            identity,
            commandJobSnapshotSchema,
          )
        ).physical.phase === 'settled',
    )
    expect(opened).toBe(1)
    expect(f.runtime.view.state.surfaces.getSnapshot().windows['explicit-window']).toMatchObject({
      windowId: 'explicit-window',
    })
    await f.host.commandClients.call(
      f.target,
      identity.actorId,
      'command.jobs.acknowledge',
      identity,
      z.object({ released: z.boolean() }),
    )
  } finally {
    gate.resolve()
    await f.dispose()
  }
})

test('scoped and observer clients can publish only their own endpoint without gaining command execution permission', async () => {
  for (const role of ['operator', 'observer'] as const) {
    const f = await fixture({ role, scoped: true })
    try {
      await f.publication.ready
      expect((await f.client.call('command.client.list', {})).items).toHaveLength(1)
      const prepared = await f.prepare('app.back', {})
      if (role === 'observer') {
        const auth = new DeviceAuthorization(f.kernel.storage, () => prepared.descriptor)
        expect(await failure(auth.authorize(f.device.device, 'command.execute', prepared.invocation))).toMatchObject({
          code: 'FORBIDDEN',
        })
      }
    } finally {
      await f.dispose()
    }
  }
})

test('disposing before runtime restoration prevents late command publication', async () => {
  const f = await fixture()
  await f.dispose()
  await f.publication.ready
  expect(f.host.commandClients.list(f.device.device.id).items).toEqual([])
})
