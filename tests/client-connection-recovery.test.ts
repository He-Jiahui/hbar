import { expect, test } from 'bun:test'
import { HbarClient } from '@hbar/client'
import { PROTOCOL_VERSION, type HostInfo, type SessionEvent } from '@hbar/contracts'
import { z } from 'zod'

const requestSchema = z.object({ id: z.number(), method: z.string(), params: z.record(z.string(), z.unknown()) })
const host: HostInfo = {
  version: 'fixture',
  protocol: PROTOCOL_VERSION,
  instanceId: 'fixture',
  platform: 'fixture',
  addresses: [],
  activeRuns: 0,
  demo: true,
}

async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 3_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Recovery did not settle')
    await Bun.sleep(10)
  }
}

function fixture(options: { silent?: boolean; closeBeforeHello?: boolean } = {}) {
  let available = true
  let peer: Bun.ServerWebSocket<undefined> | undefined
  const history: SessionEvent[] = []
  const cursors: number[] = []
  const server = Bun.serve<undefined>({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request, server) {
      if (!available) return new Response('Recovering', { status: 503 })
      if (server.upgrade(request, { data: undefined })) return undefined
      return new Response(null, { status: 426 })
    },
    websocket: {
      open(socket) {
        peer = socket
        if (options.closeBeforeHello) socket.close()
      },
      message(socket, payload) {
        const request = requestSchema.parse(JSON.parse(String(payload)))
        if (options.silent) return
        if (request.method === 'session.follow') {
          const cursor = z.number().parse(request.params.cursor)
          cursors.push(cursor)
          socket.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                reset: false,
                events: history.filter((event) => event.seq > cursor),
                streams: [],
                cursor: history.at(-1)?.seq ?? cursor,
              },
            }),
          )
        } else socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: host }))
      },
    },
  })
  return {
    server,
    history,
    cursors,
    url: `http://127.0.0.1:${server.port}`,
    available(value: boolean) {
      available = value
    },
    send(value: unknown) {
      peer?.send(JSON.stringify(value))
    },
    closePeer() {
      peer?.close()
    },
  }
}

test('an initially unavailable Host reconnects without a caller replaying connect', async () => {
  const f = fixture()
  f.available(false)
  const client = new HbarClient(f.url)
  try {
    await expect(client.connect()).rejects.toBeInstanceOf(Error)
    f.available(true)
    await until(() => client.connectionStatus() === 'connected')
    expect(client.connectionHost()?.instanceId).toBe(host.instanceId)
  } finally {
    client.disconnect()
    await f.server.stop(true)
  }
})

test('a close before hello settles connect and an explicit disconnect cancels a pending attempt', async () => {
  const f = fixture({ closeBeforeHello: true })
  const client = new HbarClient(f.url)
  try {
    await expect(client.connect()).rejects.toMatchObject({ code: 'DISCONNECTED' })
    client.disconnect()
    const attempt = client.connect()
    client.disconnect()
    await expect(attempt).rejects.toMatchObject({ code: 'DISCONNECTED' })
  } finally {
    client.disconnect()
    await f.server.stop(true)
  }
})

test('a silent handshake has a deadline and releases pending RPCs on disconnect', async () => {
  const f = fixture({ silent: true })
  const client = new HbarClient(f.url, undefined, { connectTimeoutMs: 50 })
  try {
    await expect(client.connect()).rejects.toMatchObject({ code: 'CONNECTION_TIMEOUT' })
  } finally {
    client.disconnect()
    await f.server.stop(true)
  }
})

test('a status observer can cancel connecting without leaving an unowned handshake', async () => {
  const f = fixture({ silent: true })
  const client = new HbarClient(f.url)
  client.onStatus((status) => {
    if (status === 'connecting') client.disconnect()
  })
  try {
    await expect(client.connect()).rejects.toMatchObject({ code: 'DISCONNECTED' })
    expect(client.connectionStatus()).toBe('disconnected')
  } finally {
    client.disconnect()
    await f.server.stop(true)
  }
})

test('throwing status and event observers do not break other observers or the connection', async () => {
  const f = fixture()
  const client = new HbarClient(f.url)
  const statuses: string[] = []
  let notifications = 0
  client.onStatus(() => {
    throw new Error('observer fixture')
  })
  client.onStatus((status) => {
    statuses.push(status)
  })
  client.onEvent(() => {
    throw new Error('observer fixture')
  })
  client.onEvent(() => {
    notifications++
  })
  try {
    await expect(client.connect()).resolves.toMatchObject({ instanceId: host.instanceId })
    f.send({ jsonrpc: '2.0', method: 'host.changed', params: { kind: 'sessions' } })
    await until(() => notifications === 1)
    expect(statuses).toContain('connected')
    expect(client.connectionStatus()).toBe('connected')
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    await expect(client.call('plugin.set', { id: 'fixture', enabled: true, config: cyclic })).rejects.toBeInstanceOf(
      Error,
    )
    await expect(client.call('system.hello', { protocol: PROTOCOL_VERSION })).resolves.toMatchObject({
      instanceId: host.instanceId,
    })
  } finally {
    client.disconnect()
    await f.server.stop(true)
  }
})

test('a session event gap replays from the contiguous cursor instead of skipping missed facts', async () => {
  const f = fixture()
  const client = new HbarClient(f.url)
  const seen: number[] = []
  client.onEvent((event) => {
    if (event.method === 'session.event') seen.push(event.params.seq)
  })
  try {
    await client.connect()
    await client.follow('session', 0)
    for (let seq = 1; seq <= 3; seq++)
      f.history.push({
        eventId: String(seq),
        sessionId: 'session',
        seq,
        runId: null,
        stepId: null,
        type: 'fixture.event',
        data: {},
        time: Date.now(),
        version: 1,
      })
    f.send({ jsonrpc: '2.0', method: 'session.event', params: f.history[2] })
    await until(() => seen.length === 3)
    expect(seen).toEqual([1, 2, 3])
    expect(f.cursors).toEqual([0, 0])
    f.send({ jsonrpc: '2.0', method: 'session.event', params: f.history[2] })
    await Bun.sleep(20)
    expect(seen).toEqual([1, 2, 3])
    f.closePeer()
    await until(() => f.cursors.length === 3)
    expect(f.cursors[2]).toBe(3)
  } finally {
    client.disconnect()
    await f.server.stop(true)
  }
})
