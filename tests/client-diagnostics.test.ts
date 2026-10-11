import { expect, test } from 'bun:test'
import { HbarClient, type HbarClientOptions } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { PROTOCOL_VERSION, diagnosticEventSchema, type DiagnosticEvent, type DiagnosticSink } from '@hbar/contracts'
import { z } from 'zod'

function collectingSink(events: DiagnosticEvent[], throws = false): DiagnosticSink {
  return {
    emit(event) {
      events.push(event)
      if (throws) throw new Error('diagnostic fixture failure')
    },
  }
}

async function fixture(options?: HbarClientOptions) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-client-diagnostics-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0 })
  const device = await host.auth.createDevice('client diagnostics fixture')
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`, device.token, options)
  return { root, kernel, host, client }
}

async function removeFixture(root: string): Promise<void> {
  const candidate = await realpath(root)
  const parent = await realpath(tmpdir())
  if (
    dirname(candidate).toLowerCase() !== parent.toLowerCase() ||
    !basename(candidate).startsWith('hbar-client-diagnostics-')
  )
    throw new Error(`Refusing to remove unexpected client diagnostics fixture: ${candidate}`)
  await rm(candidate, { recursive: true, force: true })
}

test('client diagnostics cover real local WebSocket success and RPC failure without payloads', async () => {
  const events: DiagnosticEvent[] = []
  const f = await fixture({ diagnosticSink: collectingSink(events), diagnosticSampleRate: 1 })
  try {
    await f.client.connect()
    await expect(f.client.call('system.diagnose', {})).resolves.toMatchObject({
      host: { instanceId: f.kernel.instanceId },
    })
    await expect(
      f.client.call('system.hello', { protocol: PROTOCOL_VERSION, token: 'invalid-fixture-token' }),
    ).rejects.toMatchObject({ code: 'ALREADY_INITIALIZED' })
    f.client.disconnect()
    const serialized = JSON.stringify(events)
    expect(events.some((event) => event.event === 'connection.connected')).toBe(true)
    expect(events.some((event) => event.event === 'rpc.sent')).toBe(true)
    expect(events.some((event) => event.event === 'rpc.error' && event.outcome === 'failure')).toBe(true)
    expect(serialized).not.toContain('invalid-fixture-token')
    expect(serialized).toContain('system.hello')
    expect(serialized).toContain('rpcId')
  } finally {
    f.client.disconnect()
    await f.host.close()
    await f.kernel.close()
    await removeFixture(f.root)
  }
})

test('diagnostic sink failures never break client connection or disconnect cleanup', async () => {
  const events: DiagnosticEvent[] = []
  const f = await fixture({ diagnosticSink: collectingSink(events, true), diagnosticSampleRate: 1 })
  try {
    const connected = await f.client.connect()
    expect(connected).toMatchObject({ instanceId: f.kernel.instanceId })
    f.client.disconnect()
    expect(f.client.connectionStatus()).toBe('disconnected')
  } finally {
    f.client.disconnect()
    await f.host.close()
    await f.kernel.close()
    await removeFixture(f.root)
  }
})

test('command diagnostics retain validated identities across admission, success and failure without inputs', async () => {
  const events: DiagnosticEvent[] = []
  const f = await fixture({ diagnosticSink: collectingSink(events), diagnosticSampleRate: 1 })
  const canary = 'private-command-input-canary'
  const invocation = {
    protocol: 1 as const,
    requestId: 'command-admission-fixture',
    commandId: 'session.get',
    commandVersion: 1,
    input: canary,
  }
  try {
    await expect(f.client.call('command.execute', invocation)).rejects.toMatchObject({ code: 'DISCONNECTED' })
    expect(events.find((event) => event.event === 'rpc.admission_rejected')).toMatchObject({
      commandId: 'session.get',
      requestId: invocation.requestId,
      method: 'command.execute',
    })
    await f.client.connect()
    const workspace = (await f.kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Missing command diagnostics fixture workspace')
    const session = await f.kernel.createSession(workspace.id, 'diagnostic fixture')
    const accepted = await f.client.call('command.execute', {
      ...invocation,
      requestId: 'command-success-fixture',
      input: { sessionId: session.id },
    })
    expect(accepted).toMatchObject({ id: session.id })
    let rejected: unknown
    try {
      await f.client.call('command.execute', {
        ...invocation,
        requestId: 'command-invalid-input-fixture',
      })
    } catch (error) {
      rejected = error
    }
    expect(rejected).toMatchObject({ code: 'INVALID_INPUT' })
    for (const [requestId, terminal] of [
      ['command-success-fixture', 'rpc.settled'],
      ['command-invalid-input-fixture', 'rpc.error'],
    ] as const) {
      const correlated = events.filter((event) => event.requestId === requestId)
      expect(correlated.map((event) => event.event)).toEqual(['rpc.sent', terminal])
      expect(correlated.every((event) => event.commandId === 'session.get')).toBe(true)
      expect(correlated[0]?.rpcId).toBe(correlated[1]?.rpcId)
    }
    const serialised = JSON.stringify(events)
    expect(serialised).not.toContain(canary)
    expect(serialised).not.toContain(session.id)
    expect(events.every((event) => diagnosticEventSchema.safeParse(event).success)).toBe(true)
  } finally {
    f.client.disconnect()
    await f.host.close()
    await f.kernel.close()
    await removeFixture(f.root)
  }
})

test('invalid command identities are absent from admission diagnostics while transport failure remains unchanged', async () => {
  const events: DiagnosticEvent[] = []
  const client = new HbarClient('http://127.0.0.1:1', undefined, { diagnosticSink: collectingSink(events) })
  for (const commandId of ['session/get/secret', 'a'.repeat(129), 'private input with spaces']) {
    await expect(
      client.call('command.execute', {
        protocol: 1,
        requestId: 'invalid-envelope-fixture',
        commandId,
        commandVersion: 1,
        input: null,
      }),
    ).rejects.toMatchObject({ code: 'DISCONNECTED' })
    expect(
      diagnosticEventSchema.safeParse({
        schemaVersion: 1,
        time: 0,
        monotonicMs: 0,
        component: 'client',
        level: 'warn',
        event: 'rpc.admission_rejected',
        commandId,
      }).success,
    ).toBe(false)
  }
  expect(events).toHaveLength(3)
  expect(events.every((event) => event.commandId === undefined && event.errorCode === 'DISCONNECTED')).toBe(true)
  expect(JSON.stringify(events)).not.toContain('private input')
  client.disconnect()
})

test('a real local WebSocket retains command identity through timeout and pending disconnect', async () => {
  const events: DiagnosticEvent[] = []
  let pendingEntered: (() => void) | undefined
  const server = Bun.serve({
    port: 0,
    fetch(request, instance) {
      return instance.upgrade(request) ? undefined : new Response('not found', { status: 404 })
    },
    websocket: {
      message(socket, value) {
        const request = z.object({ id: z.number(), method: z.string() }).parse(JSON.parse(String(value)))
        if (request.method === 'system.hello')
          socket.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                version: 'fixture',
                protocol: PROTOCOL_VERSION,
                instanceId: '00000000-0000-4000-8000-000000000001',
                platform: 'fixture',
                addresses: [],
                activeRuns: 0,
                demo: true,
              },
            }),
          )
        else pendingEntered?.()
      },
    },
  })
  const client = new HbarClient(`http://127.0.0.1:${server.port}`, undefined, {
    diagnosticSink: collectingSink(events),
    diagnosticSampleRate: 1,
  })
  try {
    await client.connect()
    await expect(
      client.call('command.execute', {
        protocol: 1,
        requestId: 'command-timeout-fixture',
        commandId: 'session.get',
        commandVersion: 1,
        input: null,
      }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(
      events.some(
        (event) =>
          event.event === 'rpc.timeout' &&
          event.outcome === 'unknown' &&
          event.pending === 0 &&
          event.commandId === 'session.get' &&
          event.requestId === 'command-timeout-fixture',
      ),
    ).toBe(true)
    const received = Promise.withResolvers<void>()
    pendingEntered = () => received.resolve()
    const pending = client.call('command.execute', {
      protocol: 1,
      requestId: 'command-disconnect-fixture',
      commandId: 'session.get',
      commandVersion: 1,
      input: null,
    })
    await received.promise
    client.disconnect()
    await expect(pending).rejects.toMatchObject({ code: 'DISCONNECTED' })
    const disconnected = events.filter((event) => event.requestId === 'command-disconnect-fixture')
    expect(disconnected.map((event) => event.event)).toEqual(['rpc.sent', 'rpc.pending_rejected'])
    expect(disconnected.every((event) => event.commandId === 'session.get')).toBe(true)
    expect(disconnected[0]?.rpcId).toBe(disconnected[1]?.rpcId)
  } finally {
    client.disconnect()
    await server.stop(true)
  }
}, 60_000)
