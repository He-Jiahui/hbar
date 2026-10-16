import { expect, test } from 'bun:test'
import { z } from 'zod'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CommandRegistry, createCommandRouter, createCommandExpectation } from '@hbar/commands'
import { HbarClient, registerCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { surfaceCommands } from '@hbar/contracts/commands/surfaces'
import { clientCommandPreparationSchema } from '@hbar/contracts/client-commands'
import { clientCommandRequestSchema } from '@hbar/contracts/client-commands'
import { commandJobSnapshotSchema } from '@hbar/commands/jobs'
import { startServer } from '../apps/host/src/server'
import { removeOwnedTestDirectory } from './owned-temp-directory'
import { ClientCommandRelay } from '../apps/host/src/client-command-relay'

async function rejected(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected command client rejection')
}
async function until(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 3_000
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Command relay fixture did not settle')
    await Bun.sleep(5)
  }
}

test('real WebSocket command clients retain actual jobs across reconnect and reject other actors and generations', async () => {
  const prefix = 'hbar-client-command-relay-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0 })
  const device = await host.auth.createDevice('Command client owner')
  const outsider = await host.auth.createDevice('Another operator')
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`, device.token)
  const other = new HbarClient(`http://127.0.0.1:${host.server.port}`, outsider.token)
  const rawClient = new HbarClient(`http://127.0.0.1:${host.server.port}`, device.token)
  const registry = new CommandRegistry({ execution: 'client' })
  const target = { clientId: 'explicit-client', generation: 9 }
  let executions = 0
  let aborted = false
  const gate = Promise.withResolvers<void>()
  registry.register(surfaceCommands['app.setSidebarVisible'], async (input, context) => {
    executions++
    context.signal.addEventListener(
      'abort',
      () => {
        aborted = true
      },
      { once: true },
    )
    await gate.promise
    return {
      page: 'session' as const,
      pageInstanceId: null,
      toolInstanceId: null,
      modalInstanceId: null,
      sidebarOpen: input.visible,
    }
  })
  const routing = createCommandRouter({
    catalogs: () => [registry.list()],
    resolve: (id) => ({
      describe: () => registry.describe(id),
      prepare: (value) => registry.prepare(value),
      dispatch: (value, actorId) => registry.dispatch(value, { actorId }),
      dispatchPreparedTracked: registry.dispatchPreparedTracked.bind(registry),
    }),
  })
  let registration: Awaited<ReturnType<typeof registerCommandClient>> | undefined
  try {
    await Promise.all([client.connect(), other.connect(), rawClient.connect()])
    registration = await registerCommandClient(client, { ...target, commands: ['app.setSidebarVisible'], routing })
    expect(await client.call('command.client.list', {})).toEqual({
      items: [{ ...target, commands: ['app.setSidebarVisible'] }],
    })
    expect(await other.call('command.client.list', {})).toEqual({ items: [] })
    const rawTarget = { clientId: 'reply-owner', generation: 1 }
    await rawClient.call('command.client.register', { ...rawTarget, commands: ['app.setSidebarVisible'] })
    let observed: unknown
    const stopCapture = rawClient.onEvent((event) => {
      if (event.method === 'command.client.request') observed = event.params
    })
    const rawInvocation = {
      protocol: 1,
      requestId: 'reply-origin',
      commandId: 'app.setSidebarVisible',
      commandVersion: 1,
      input: { visible: true },
    }
    const waiting = host.commandClients.call(
      rawTarget,
      device.device.id,
      'prepare',
      rawInvocation,
      clientCommandPreparationSchema,
      { timeoutMs: 3_000 },
    )
    void waiting.catch(() => undefined)
    await until(async () => observed !== undefined)
    const captured = clientCommandRequestSchema.parse(observed)
    const reply = {
      ...rawTarget,
      requestId: captured.requestId,
      outcome: { ok: true as const, result: await routing.prepare(rawInvocation) },
    }
    expect(await rejected(other.call('command.client.reply', reply))).toMatchObject({ code: 'FORBIDDEN' })
    expect(await rejected(client.call('command.client.reply', reply))).toMatchObject({ code: 'FORBIDDEN' })
    await rawClient.call('command.client.reply', reply)
    expect((await waiting).invocation.input).toEqual({ visible: true })
    stopCapture()
    await rawClient.call('command.client.unregister', rawTarget)
    expect(
      await rejected(other.call('command.client.register', { ...target, commands: ['app.setSidebarVisible'] })),
    ).toMatchObject({ code: 'FORBIDDEN' })
    expect(await rejected(client.call('command.client.register', { ...target, commands: ['app.back'] }))).toMatchObject(
      { code: 'COMMAND_TARGET_STALE' },
    )
    const prepared = await host.commandClients.call(
      target,
      device.device.id,
      'prepare',
      {
        protocol: 1,
        requestId: 'remote-read',
        commandId: 'app.setSidebarVisible',
        commandVersion: 1,
        input: { visible: true },
      },
      clientCommandPreparationSchema,
    )
    expect(executions).toBe(0)
    const identity = { actorId: device.device.id, jobId: 'retained-actual-job' }
    await host.commandClients.call(
      target,
      device.device.id,
      'command.jobs.start',
      {
        ...identity,
        invocation: prepared.invocation,
        expectation: createCommandExpectation(prepared),
      },
      commandJobSnapshotSchema,
    )
    await until(async () => executions === 1)
    expect(
      await rejected(
        host.commandClients.call(
          { ...target, generation: 10 },
          device.device.id,
          'command.jobs.get',
          identity,
          commandJobSnapshotSchema,
        ),
      ),
    ).toMatchObject({ code: 'COMMAND_TARGET_STALE' })
    expect(
      await rejected(
        host.commandClients.call(target, outsider.device.id, 'command.jobs.get', identity, commandJobSnapshotSchema),
      ),
    ).toMatchObject({ code: 'FORBIDDEN' })
    client.disconnect()
    await until(async () => (await other.call('command.client.list', {})).items.length === 0)
    await client.connect()
    await until(async () =>
      (await client.call('command.client.list', {})).items.some((item) => item.clientId === target.clientId),
    )
    const pending = await host.commandClients.call(
      target,
      device.device.id,
      'command.jobs.get',
      identity,
      commandJobSnapshotSchema,
    )
    expect(pending.physical.phase).toBe('pending')
    expect(executions).toBe(1)
    expect(
      await host.commandClients.call(
        target,
        device.device.id,
        'command.jobs.cancel',
        identity,
        z.strictObject({ accepted: z.boolean() }),
      ),
    ).toEqual({ accepted: true })
    expect(aborted).toBe(true)
    gate.resolve()
    await until(
      async () =>
        (
          await host.commandClients.call(
            target,
            device.device.id,
            'command.jobs.get',
            identity,
            commandJobSnapshotSchema,
          )
        ).physical.phase === 'settled',
    )
    expect(
      await host.commandClients.call(
        target,
        device.device.id,
        'command.jobs.acknowledge',
        identity,
        z.strictObject({ released: z.boolean() }),
      ),
    ).toEqual({ released: true })
    expect(executions).toBe(1)
  } finally {
    gate.resolve()
    await registration?.dispose()
    client.disconnect()
    other.disconnect()
    rawClient.disconnect()
    registry.dispose()
    await host.close()
    await kernel.close()
    await removeOwnedTestDirectory(root, prefix)
  }
})

test('command relays bound target and request capacity and reject old-generation replies without fabricating settlement', async () => {
  const requests: unknown[] = []
  const relay = new ClientCommandRelay((_connection, request) => requests.push(request))
  const actorId = 'relay-actor'
  for (let index = 0; index < 64; index++)
    relay.register(`connection-${index}`, actorId, {
      clientId: `client-${index}`,
      generation: 1,
      commands: ['app.back'],
    })
  expect(() => relay.register('extra', actorId, { clientId: 'extra', generation: 1, commands: [] })).toThrow('capacity')
  const target = { clientId: 'client-0', generation: 1 }
  const calls: Promise<unknown>[] = []
  try {
    for (let index = 0; index < 64; index++)
      calls.push(
        rejected(relay.call(target, actorId, 'command.jobs.get', { actorId, jobId: `job-${index}` }, z.unknown())),
      )
    expect(
      await rejected(relay.call(target, actorId, 'command.jobs.get', { actorId, jobId: 'overflow' }, z.unknown())),
    ).toMatchObject({ code: 'BUSY' })
    const first = clientCommandRequestSchema.parse(requests[0])
    const cancel = relay.call(
      target,
      actorId,
      'command.jobs.cancel',
      { actorId, jobId: 'job-0' },
      z.strictObject({ accepted: z.boolean() }),
    )
    const cancellation = clientCommandRequestSchema.parse(requests.at(-1))
    relay.reply('connection-0', actorId, {
      ...target,
      requestId: cancellation.requestId,
      outcome: { ok: true, result: { accepted: true } },
    })
    expect(await cancel).toEqual({ accepted: true })
    expect(() =>
      relay.reply('connection-0', actorId, {
        ...target,
        generation: 2,
        requestId: first.requestId,
        outcome: { ok: true, result: {} },
      }),
    ).toThrow('another command client')
    relay.register('replacement-connection', actorId, { ...target, generation: 2, commands: ['app.back'] })
    const outcomes = await Promise.all(calls)
    expect(
      outcomes.every(
        (item) => item && typeof item === 'object' && 'code' in item && item.code === 'COMMAND_TARGET_STALE',
      ),
    ).toBe(true)
    expect(
      await rejected(relay.call(target, actorId, 'command.jobs.get', { actorId, jobId: 'job-0' }, z.unknown())),
    ).toMatchObject({ code: 'COMMAND_TARGET_STALE' })
  } finally {
    relay.close()
    await Promise.all(calls)
  }
})
