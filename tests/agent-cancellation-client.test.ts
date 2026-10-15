import { expect, spyOn, test } from 'bun:test'
import { createAgentCommandClient, HbarClient } from '@hbar/client'
import { PROTOCOL_VERSION, type DiagnosticEvent, type HostInfo } from '@hbar/contracts'
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
  const deadline = Date.now() + 2_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Client cancellation did not settle')
    await Bun.sleep(5)
  }
}
function fixture() {
  const held: Array<z.output<typeof requestSchema>> = []
  let peer: Bun.ServerWebSocket<undefined> | undefined
  const server = Bun.serve<undefined>({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request, server) {
      return server.upgrade(request, { data: undefined }) ? undefined : new Response(null, { status: 426 })
    },
    websocket: {
      open(socket) {
        peer = socket
      },
      message(socket, payload) {
        const request = requestSchema.parse(JSON.parse(String(payload)))
        if (request.method === 'command.execute') {
          held.push(request)
          return
        }
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: host }))
      },
    },
  })
  return {
    server,
    held,
    url: `http://127.0.0.1:${server.port}`,
    lateReplies() {
      for (const request of held) peer?.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: {} }))
    },
  }
}

test('24 public agent cancellations stop local observation on abort, release listeners and ignore late replies without replay', async () => {
  const f = fixture(),
    events: DiagnosticEvent[] = []
  const client = new HbarClient(f.url, undefined, {
    diagnosticSampleRate: 1,
    diagnosticSink: {
      emit: (event) => {
        events.push(event)
      },
    },
  })
  const controller = new AbortController()
  const add = spyOn(controller.signal, 'addEventListener')
  const remove = spyOn(controller.signal, 'removeEventListener')
  try {
    await client.connect()
    const agents = createAgentCommandClient(client)
    const calls = Array.from({ length: 24 }, (_, slot) =>
      agents
        .execute(
          'agent.cancel',
          {
            parentSessionId: 'parent',
            agentId: `agent-${slot}`,
          },
          { signal: controller.signal, requestId: `cancel-${slot}`, idempotencyKey: `cancel-key-${slot}` },
        )
        .catch((error: unknown) => error),
    )
    await until(() => f.held.length === 24)
    expect(f.held[0]?.params).toMatchObject({
      commandId: 'agent.cancel',
      requestId: 'cancel-0',
      idempotencyKey: 'cancel-key-0',
      commandVersion: 1,
    })
    const started = performance.now()
    controller.abort(new Error('PRIVATE_ABORT_REASON_CANARY'))
    const outcomes = await Promise.all(calls)
    expect(performance.now() - started).toBeLessThan(1_000)
    for (const outcome of outcomes) expect(outcome).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(add.mock.calls.filter((args) => args[0] === 'abort')).toHaveLength(24)
    expect(remove.mock.calls.filter((args) => args[0] === 'abort')).toHaveLength(24)
    expect(events.filter((event) => event.event === 'rpc.cancelled')).toHaveLength(24)
    expect(events.filter((event) => event.event === 'rpc.cancelled').at(-1)).toMatchObject({
      pending: 0,
      outcome: 'unknown',
      errorCode: 'RESULT_UNKNOWN',
    })
    f.lateReplies()
    expect(await client.call('system.hello', { protocol: PROTOCOL_VERSION })).toMatchObject({ instanceId: 'fixture' })
    expect(f.held).toHaveLength(24)
    expect(events.filter((event) => event.event === 'rpc.settled' && event.commandId === 'agent.cancel')).toHaveLength(
      0,
    )
    expect(JSON.stringify(events)).not.toContain('PRIVATE_ABORT_REASON_CANARY')
  } finally {
    add.mockRestore()
    remove.mockRestore()
    client.disconnect()
    await f.server.stop(true)
  }
})

test('pre-aborted public agent command never dispatches and ordinary reply removes its abort listener', async () => {
  const f = fixture(),
    client = new HbarClient(f.url)
  const controller = new AbortController()
  const remove = spyOn(controller.signal, 'removeEventListener')
  try {
    await client.connect()
    const agents = createAgentCommandClient(client)
    const outcome = await agents
      .execute('agent.cancel', { parentSessionId: 'parent', agentId: 'agent' }, { signal: AbortSignal.abort() })
      .catch((error: unknown) => error)
    expect(outcome).toMatchObject({ code: 'CANCELLED' })
    expect(f.held).toHaveLength(0)
    expect(
      await client.call('system.hello', { protocol: PROTOCOL_VERSION }, { signal: controller.signal }),
    ).toMatchObject({ instanceId: 'fixture' })
    expect(remove.mock.calls.filter((args) => args[0] === 'abort')).toHaveLength(1)
    controller.abort()
    expect(await client.call('system.hello', { protocol: PROTOCOL_VERSION })).toMatchObject({ instanceId: 'fixture' })
  } finally {
    remove.mockRestore()
    client.disconnect()
    await f.server.stop(true)
  }
})
