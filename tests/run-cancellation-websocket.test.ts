import { expect, spyOn, test } from 'bun:test'
import { createRunCommandClient, HbarClient } from '@hbar/client'
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
    if (Date.now() >= deadline) throw new Error('Run client observation did not settle')
    await Bun.sleep(5)
  }
}
function fixture() {
  const requests: Array<z.output<typeof requestSchema>> = []
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
          requests.push(request)
          return
        }
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: host }))
      },
    },
  })
  return {
    server,
    requests,
    url: `http://127.0.0.1:${server.port}`,
    reply(index: number, result: unknown) {
      const request = requests[index]
      if (!request || !peer) throw new Error('Expected a pending public request')
      peer.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }))
    },
    deny(index: number) {
      const request = requests[index]
      if (!request || !peer) throw new Error('Expected a pending public request')
      peer.send(
        JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { data: 'NOT_FOUND', message: 'Missing operation' } }),
      )
    },
  }
}

for (const command of ['operation.get', 'operation.cancel'] as const) {
  test(`real WS ${command} forwards abort, releases observation and ignores late replies`, async () => {
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
    const remove = spyOn(controller.signal, 'removeEventListener')
    try {
      await client.connect()
      const runs = createRunCommandClient(client)
      const pending = runs
        .execute(
          command,
          { operationId: 'op' },
          {
            signal: controller.signal,
            requestId: 'run-request',
            idempotencyKey: 'run-key',
          },
        )
        .catch((error: unknown) => error)
      await until(() => f.requests.length === 1)
      expect(f.requests[0]?.params).toMatchObject({
        commandId: command,
        requestId: 'run-request',
        idempotencyKey: 'run-key',
        commandVersion: 1,
      })
      const started = performance.now()
      controller.abort(new Error('PRIVATE_RUN_ABORT_CANARY'))
      expect(await pending).toMatchObject({ code: 'RESULT_UNKNOWN' })
      expect(performance.now() - started).toBeLessThan(1_000)
      expect(remove.mock.calls.filter((args) => args[0] === 'abort')).toHaveLength(1)
      expect(events.find((event) => event.event === 'rpc.cancelled')).toMatchObject({
        errorCode: 'RESULT_UNKNOWN',
        pending: 0,
        outcome: 'unknown',
      })
      f.reply(0, {})
      expect(await client.call('system.hello', { protocol: PROTOCOL_VERSION })).toMatchObject({ instanceId: 'fixture' })
      expect(f.requests).toHaveLength(1)
      expect(events.filter((event) => event.event === 'rpc.settled' && event.commandId === command)).toHaveLength(0)
      expect(JSON.stringify(events)).not.toContain('PRIVATE_RUN_ABORT_CANARY')
      const preAborted = await runs
        .execute(command, { operationId: 'op' }, { signal: AbortSignal.abort() })
        .catch((error: unknown) => error)
      expect(preAborted).toMatchObject({ code: 'CANCELLED' })
      expect(f.requests).toHaveLength(1)
    } finally {
      remove.mockRestore()
      client.disconnect()
      await f.server.stop(true)
    }
  })
}

test('real WS run cancellation retains known refusal and strict acknowledgement identity', async () => {
  const f = fixture(),
    client = new HbarClient(f.url)
  try {
    await client.connect()
    const runs = createRunCommandClient(client)
    const denied = runs.execute('operation.cancel', { operationId: 'op' }).catch((error: unknown) => error)
    await until(() => f.requests.length === 1)
    f.deny(0)
    expect(await denied).toMatchObject({ code: 'NOT_FOUND' })
    const malformed = runs.execute('operation.cancel', { operationId: 'op' }).catch((error: unknown) => error)
    await until(() => f.requests.length === 2)
    f.reply(1, { operationId: 'other', status: 'cancelRequested' })
    expect(await malformed).toMatchObject({ code: 'RESULT_UNKNOWN' })
    const accepted = runs.execute('operation.cancel', { operationId: 'op' })
    await until(() => f.requests.length === 3)
    f.reply(2, { operationId: 'op', status: 'cancelRequested' })
    expect(await accepted).toEqual({ operationId: 'op', status: 'cancelRequested' })
    expect(f.requests).toHaveLength(3)
  } finally {
    client.disconnect()
    await f.server.stop(true)
  }
})
