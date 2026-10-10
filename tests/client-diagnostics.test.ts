import { expect, test } from 'bun:test'
import { HbarClient, type HbarClientOptions } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { PROTOCOL_VERSION, type DiagnosticEvent, type DiagnosticSink } from '@hbar/contracts'
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

test('a real local WebSocket pending RPC records timeout without leaving a pending request', async () => {
  const events: DiagnosticEvent[] = []
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
      },
    },
  })
  const client = new HbarClient(`http://127.0.0.1:${server.port}`, undefined, {
    diagnosticSink: collectingSink(events),
    diagnosticSampleRate: 1,
  })
  try {
    await client.connect()
    await expect(client.call('system.diagnose', {})).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(
      events.some((event) => event.event === 'rpc.timeout' && event.outcome === 'unknown' && event.pending === 0),
    ).toBe(true)
  } finally {
    client.disconnect()
    await server.stop(true)
  }
}, 60_000)
