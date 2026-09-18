import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createRunCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets, createRunCommands } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'

test('run.submit stores an acceptance fact once, exposes operation state, and restores actor-scoped receipt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-run-command-'))
  let kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]!
    const session = await kernel.createSession(workspace.id)
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'run first actor')
    const firstActorId = (await kernel.storage.call('devices')).find((device) => device.name === 'run first actor')?.id
    if (!firstActorId) throw new Error('Authenticated actor was not recorded')
    const commands = createRunCommandClient(client)
    const input = { sessionId: session.id, modelId: 'local-fixture', input: { text: 'hello', images: [] } }
    const [first, concurrent] = await Promise.all([
      commands.execute('run.submit', input, { idempotencyKey: 'one', requestId: 'first-request' }),
      commands.execute('run.submit', input, { idempotencyKey: 'one', requestId: 'second-request' }),
    ])
    expect(first).toMatchObject({ status: 'accepted', commandId: 'run.submit', sessionId: session.id })
    expect(concurrent).toEqual(first)
    expect(first.requestId).toBe('first-request')
    await kernel.waitForIdle()
    expect(await commands.getReceipt(session.id, 'one')).toEqual(first)
    await kernel.storage.call('deleteProvider', 'local-fixture')
    expect(await commands.execute('run.submit', input, { idempotencyKey: 'one' })).toEqual(first)
    expect(await commands.execute('operation.get', { operationId: first.operationId })).toMatchObject({
      operationId: first.operationId,
      status: 'completed',
    })
    await expect(
      commands.execute(
        'run.submit',
        {
          ...input,
          input: { text: 'different', images: [] },
        },
        { idempotencyKey: 'one' },
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    expect(
      (await kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'run.queued'),
    ).toHaveLength(1)
    client.disconnect()
    await host.close()
    host = undefined
    await kernel.close()
    kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
    })
    const restoredCommands = createRunCommands(kernel)
    expect(await restoredCommands.getReceipt(session.id, firstActorId, 'one')).toEqual(first)
    expect(
      await restoredCommands.execute('run.submit', input, {
        actorId: firstActorId,
        idempotencyKey: 'one',
        requestId: 'after-restart',
      }),
    ).toEqual(first)
    restoredCommands.dispose()
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'run second actor')
    const secondActor = createRunCommandClient(client)
    expect(await secondActor.getReceipt(session.id, 'one')).toBeNull()
    expect(await secondActor.execute('operation.get', { operationId: first.operationId })).toMatchObject({
      status: 'completed',
    })
    expect(
      (await kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'run.queued'),
    ).toHaveLength(1)
  } finally {
    client?.disconnect()
    await host?.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('lost admission acknowledgement recovers the committed operation rather than enqueueing again', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-run-ack-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  try {
    const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
    const original = kernel.submit.bind(kernel)
    kernel.submit = async (...args: Parameters<Kernel['submit']>) => {
      await original(...args)
      throw new Error('simulated lost admission acknowledgement')
    }
    const commands = createRunCommands(kernel)
    const input = { sessionId: session.id, modelId: 'local-fixture', input: { text: 'hello', images: [] } }
    const receipt = await commands.execute('run.submit', input, {
      actorId: 'test-device',
      idempotencyKey: 'lost-ack',
      requestId: 'first',
    })
    expect(receipt).toMatchObject({ status: 'accepted', sessionId: session.id })
    expect(await commands.getReceipt(session.id, 'test-device', 'lost-ack')).toEqual(receipt)
    expect(
      (await kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'run.queued'),
    ).toHaveLength(1)
    await kernel.waitForIdle()
    commands.dispose()
  } finally {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
