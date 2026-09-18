import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createRunCommandClient, createOperationWatcher } from '@hbar/client'
import { HbarError } from '@hbar/contracts'
import { Kernel, MemorySecrets, createRunCommands } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'

test('context compaction uses the run command path and preserves canonical history', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-compact-command-'))
  const kernel = await Kernel.create({
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
    for (let index = 0; index < 7; index++) {
      await kernel.submit(session.id, `compact-${index}`, { text: `Message ${index}`, images: [] }, 'local-fixture')
      await kernel.waitForIdle()
    }
    const before = await kernel.snapshot(session.id)
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'compaction command test')
    const result = await createRunCommandClient(client).execute('context.compact', {
      sessionId: session.id,
      modelId: 'local-fixture',
    })
    expect(result.summary).toContain('Summary:')
    expect((await kernel.storage.call('context', session.id)).messages.length).toBeLessThan(before.messages.length)
    expect((await kernel.snapshot(session.id)).messages).toHaveLength(before.messages.length)
    expect((await kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'context.compacted')).toHaveLength(1)
  } finally {
    client?.disconnect()
    await host?.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('run client reports a lost compaction response as unknown without masking queries', async () => {
  const commands = createRunCommandClient({
    call: async () => {
      throw new HbarError('DISCONNECTED', 'lost')
    },
  })
  await expect(
    commands.execute('context.compact', { sessionId: 'session', modelId: 'model' }),
  ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  await expect(commands.execute('operation.get', { operationId: 'operation' })).rejects.toMatchObject({
    code: 'DISCONNECTED',
  })
})

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
    expect(await restoredCommands.getReceipt('run.submit', session.id, firstActorId, 'one')).toEqual(first)
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
    expect(await commands.getReceipt('run.submit', session.id, 'test-device', 'lost-ack')).toEqual(receipt)
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

test('run.retry replays a settled operation through durable run submission', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-run-retry-'))
  const kernel = await Kernel.create({
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
    const other = await kernel.createSession(workspace.id)
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'retry actor')
    const commands = createRunCommandClient(client)
    const original = await commands.execute(
      'run.submit',
      {
        sessionId: session.id,
        modelId: 'local-fixture',
        input: { text: 'retry this input', images: [], thinking: 'high', approval: 'deny' },
      },
      { idempotencyKey: 'original' },
    )
    await kernel.waitForIdle()
    const [retried, repeated] = await Promise.all([
      commands.execute(
        'run.retry',
        { sessionId: session.id, operationId: original.operationId },
        { idempotencyKey: 'retry', requestId: 'retry-first' },
      ),
      commands.execute(
        'run.retry',
        { sessionId: session.id, operationId: original.operationId },
        { idempotencyKey: 'retry', requestId: 'retry-second' },
      ),
    ])
    expect(retried).toMatchObject({
      status: 'accepted',
      commandId: 'run.submit',
      sessionId: session.id,
    })
    expect(['retry-first', 'retry-second']).toContain(retried.requestId)
    expect(repeated).toEqual(retried)
    expect(retried.operationId).not.toBe(original.operationId)
    expect(await commands.getReceipt(session.id, 'retry', 'run.retry')).toEqual(retried)
    expect(await commands.getReceipt(session.id, 'retry')).toBeNull()
    await kernel.waitForIdle()
    const snapshot = await kernel.snapshot(session.id)
    const replay = snapshot.runs.find((run) => run.id === retried.operationId)
    expect(replay).toMatchObject({
      modelId: 'local-fixture',
      input: { text: 'retry this input', thinking: 'high', approval: 'deny' },
      status: 'completed',
    })
    expect(snapshot.runs).toHaveLength(2)
    expect(
      (await kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'run.queued'),
    ).toHaveLength(2)
    await commands
      .execute('run.retry', { sessionId: session.id, operationId: retried.operationId }, { idempotencyKey: 'retry' })
      .then(
        () => expect.unreachable('One retry key must not identify two source operations'),
        (error) => expect(error).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' }),
      )
    await commands
      .execute(
        'run.retry',
        { sessionId: other.id, operationId: original.operationId },
        { idempotencyKey: 'wrong-session' },
      )
      .then(
        () => expect.unreachable('Cross-session retry must be rejected'),
        (error) => expect(error).toMatchObject({ code: 'COMMAND_NOT_FOUND' }),
      )
    await commands.execute('run.retry', { sessionId: session.id, operationId: original.operationId }).then(
      () => expect.unreachable('Retry without an idempotency key must be rejected'),
      (error) => expect(error).toMatchObject({ code: 'INVALID_INPUT' }),
    )
  } finally {
    client?.disconnect()
    await host?.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('operation.cancel settles queued work atomically and running work after cancellation reaches its driver', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-operation-cancel-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'cancel actor')
    const commands = createRunCommandClient(client)
    const queued = await kernel.storage.call(
      'enqueue',
      session.id,
      'queued-cancel',
      { text: 'queued', images: [] },
      'local-fixture',
    )
    expect(await commands.execute('operation.cancel', { operationId: queued.id })).toEqual({
      operationId: queued.id,
      status: 'cancelled',
    })
    expect(await commands.execute('operation.cancel', { operationId: queued.id })).toEqual({
      operationId: queued.id,
      status: 'cancelled',
    })
    expect(
      (await kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'run.settled'),
    ).toHaveLength(1)
    const accepted = await commands.execute(
      'run.submit',
      {
        sessionId: session.id,
        modelId: 'local-fixture',
        input: { text: '/slow', images: [] },
      },
      { idempotencyKey: 'slow' },
    )
    for (let i = 0; i < 100 && !kernel.streams.size; i++) await Bun.sleep(10)
    expect(kernel.streams.size).toBeGreaterThan(0)
    const result = await commands.execute('operation.cancel', { operationId: accepted.operationId })
    expect(['cancelRequested', 'cancelled']).toContain(result.status)
    await kernel.waitForIdle()
    expect(await commands.execute('operation.get', { operationId: accepted.operationId })).toMatchObject({
      status: 'cancelled',
    })
    expect(
      (await kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'run.cancelRequested'),
    ).toHaveLength(1)
  } finally {
    client?.disconnect()
    await host?.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('operation watch resumes from a cursor after reconnect and stops after unwatch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-operation-watch-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'watch actor')
    const accepted = await createRunCommandClient(client).execute(
      'run.submit',
      {
        sessionId: session.id,
        modelId: 'local-fixture',
        input: { text: 'hello', images: [] },
      },
      { idempotencyKey: 'watch' },
    )
    await kernel.waitForIdle()
    const observed: string[] = []
    const watcher = await createOperationWatcher(client).watch(accepted.operationId, 0, (update) => {
      if (update.kind === 'event') observed.push(update.event.type)
    })
    expect(watcher.initial.snapshot.operationId).toBe(accepted.operationId)
    expect(watcher.initial.events.some((event) => event.type === 'run.queued')).toBe(true)
    const reset = await client.call('operation.watch', { operationId: accepted.operationId, cursor: 9_999_999 })
    expect(reset).toMatchObject({ reset: true, events: [] })
    await kernel.append(session.id, 'test.marker.one', {}, accepted.operationId)
    for (let i = 0; i < 30 && !observed.includes('test.marker.one'); i++) await Bun.sleep(10)
    expect(observed).toContain('test.marker.one')
    const unrelated = await kernel.storage.call(
      'enqueue',
      session.id,
      'unrelated-watch',
      { text: 'not followed', images: [] },
      'local-fixture',
    )
    const beforeUnrelated = observed.length
    await kernel.append(session.id, 'test.unrelated', {}, unrelated.id)
    await Bun.sleep(20)
    expect(observed).toHaveLength(beforeUnrelated)
    client.disconnect()
    await Bun.sleep(20)
    await kernel.append(session.id, 'test.marker.two', {}, accepted.operationId)
    await client.connect()
    for (let i = 0; i < 50 && !observed.includes('test.marker.two'); i++) await Bun.sleep(10)
    expect(observed).toContain('test.marker.two')
    await watcher.close()
    const count = observed.length
    await kernel.append(session.id, 'test.marker.three', {}, accepted.operationId)
    await Bun.sleep(20)
    expect(observed).toHaveLength(count)
  } finally {
    client?.disconnect()
    await host?.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
