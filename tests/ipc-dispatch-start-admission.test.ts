import { expect, test } from 'bun:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { IpcPeer, procedure } from '@hbar/runtime'

function gate() {
  let release: () => void = () => {
    throw new Error('Gate not initialized')
  }
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

async function until(check: () => boolean) {
  const deadline = Date.now() + 2000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Public IPC settlement not observed')
    await delay(1)
  }
}

function paired(failSend = false) {
  let right: IpcPeer | undefined
  let sends = 0
  const left = new IpcPeer({
    owner: { unitId: 'host', generation: 1, incarnation: 'dispatch-start-left' },
    remote: { unitId: 'fixture', generation: 1, incarnation: 'dispatch-start-right' },
    transport: {
      send(frame) {
        sends++
        if (failSend) throw new Error('CONTROLLED_TRANSPORT_SEND_FAILURE')
        if (!right) throw new Error('Pair not initialized')
        right.receive(frame)
      },
    },
  })
  right = new IpcPeer({ owner: left.remote, remote: left.owner, transport: { send: (frame) => left.receive(frame) } })
  return {
    left,
    right,
    sends: () => sends,
    close() {
      left.close()
      right?.close()
    },
  }
}

async function cleanup(primary: { error: unknown } | undefined, operation: () => Promise<void>) {
  try {
    await operation()
  } catch (error) {
    if (primary) throw new AggregateError([primary.error, error], 'IPC fixture and cleanup failed', { cause: error })
    throw error
  }
  if (primary) throw primary.error
}

for (const action of ['abort', 'close'] as const) {
  test(`submitting observer ${action} proves zero first-frame dispatch exactly once`, async () => {
    const f = paired(),
      abort = new AbortController()
    const events: string[] = []
    let handlers = 0,
      primary: { error: unknown } | undefined
    f.right.register(
      'value',
      procedure(z.number(), z.number(), (value) => {
        handlers++
        return value
      }),
    )
    try {
      let failure: unknown
      try {
        await f.left.call('value', 1, z.number(), {
          signal: abort.signal,
          timeoutMs: 1000,
          onDispatchStarted(event) {
            events.push(event)
            if (event === 'submitting') {
              if (action === 'abort') abort.abort()
              else f.left.close()
            }
          },
          onDispatchSettled: (event) => {
            events.push(event)
          },
        })
      } catch (error) {
        failure = error
      }
      expect(failure).toMatchObject({ code: action === 'abort' ? 'IPC_CANCELLED' : 'IPC_DISCONNECTED' })
      expect(events).toEqual(['submitting', 'not-dispatched'])
      expect(f.sends()).toBe(0)
      expect(handlers).toBe(0)
      expect(f.left.snapshot()).toMatchObject({ inFlight: 0, queued: 0, bufferedBytes: 0 })
      f.close()
      expect(events).toEqual(['submitting', 'not-dispatched'])
    } catch (error) {
      primary = { error }
    }
    await cleanup(primary, async () => {
      f.close()
    })
  }, 5000)
}

test('sent cancellation remains unknown until the actual delayed paired reply', async () => {
  const f = paired(),
    entered = gate(),
    reply = gate(),
    sent = gate(),
    abort = new AbortController()
  const events: string[] = []
  let primary: { error: unknown } | undefined
  f.right.register(
    'value',
    procedure(z.number(), z.number(), async (value) => {
      entered.release()
      await reply.promise
      return value
    }),
  )
  const call = f.left.call('value', 7, z.number(), {
    signal: abort.signal,
    timeoutMs: 1000,
    onDispatchStarted(event) {
      events.push(event)
      if (event === 'sent') sent.release()
    },
    onDispatchSettled: (event) => {
      events.push(event)
    },
  })
  const outcome = call.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  )
  try {
    await Promise.race([
      Promise.all([entered.promise, sent.promise]),
      outcome.then(() => {
        throw new Error('Call ended before dispatch gates')
      }),
    ])
    abort.abort()
    expect(await outcome).toMatchObject({ error: { code: 'IPC_CANCELLED' } })
    expect(events).toEqual(['submitting', 'sent'])
    expect(f.left.snapshot().inFlight).toBe(1)
    reply.release()
    await until(() => events.includes('reply'))
    expect(events).toEqual(['submitting', 'sent', 'reply'])
    expect(f.left.snapshot().inFlight).toBe(0)
  } catch (error) {
    primary = { error }
  }
  await cleanup(primary, async () => {
    reply.release()
    await outcome
    f.close()
  })
}, 5000)

test('transport send failure releases 60-second IPC timers and its owned CLI exits naturally', async () => {
  const started = performance.now()
  const child = Bun.spawn(
    [process.execPath, fileURLToPath(new URL('./fixtures/ipc-dispatch-start-send-failure.ts', import.meta.url))],
    {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      windowsHide: true,
    },
  )
  let deadline: ReturnType<typeof setTimeout> | undefined
  let deadlineTriggered = false
  const protection = new Promise<never>((_resolve, reject) => {
    deadline = setTimeout(() => {
      deadlineTriggered = true
      child.kill()
      reject(new Error('Owned IPC CLI exceeded 5-second natural-exit deadline'))
    }, 5000)
  })
  async function boundedText(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    let bytes = 0
    try {
      for (;;) {
        const next = await reader.read()
        if (next.done) break
        bytes += next.value.byteLength
        if (bytes > 8192) throw new Error('Owned IPC CLI output exceeded 8KiB')
        chunks.push(next.value)
      }
    } finally {
      reader.releaseLock()
    }
    return Buffer.concat(chunks).toString('utf8')
  }
  const stdout = boundedText(child.stdout),
    stderr = boundedText(child.stderr)
  const completion = Promise.all([child.exited, stdout, stderr])
  let primary: { error: unknown } | undefined
  try {
    const [exitCode, output, errors] = await Promise.race([completion, protection])
    expect(deadlineTriggered).toBe(false)
    expect(exitCode).toBe(0)
    expect(performance.now() - started).toBeLessThan(5000)
    expect(errors).toBe('')
    const receipt = z
      .strictObject({
        schema: z.literal('hbar.ipc-send-failure-natural-exit.v1'),
        timeoutMs: z.literal(60000),
        fragmentTimeoutMs: z.literal(60000),
        errorCode: z.literal('IPC_DISCONNECTED'),
        events: z.tuple([z.literal('submitting'), z.literal('send-failed')]),
        sends: z.literal(1),
        handlers: z.literal(0),
        inFlight: z.literal(0),
        queued: z.literal(0),
        bufferedBytes: z.literal(0),
        failed: z.literal(true),
        diagnostic: z.strictObject({ reason: z.literal('transport_send'), errorCode: z.literal('IPC_TRANSPORT_SEND') }),
      })
      .parse(JSON.parse(output))
    expect(receipt.events).toEqual(['submitting', 'send-failed'])
    expect(receipt.handlers).toBe(0)
    expect(receipt.inFlight).toBe(0)
    expect(receipt.queued).toBe(0)
    expect(receipt.bufferedBytes).toBe(0)
  } catch (error) {
    primary = { error }
  }
  await cleanup(primary, async () => {
    if (deadline !== undefined) clearTimeout(deadline)
    if (child.exitCode === null) child.kill()
    // A protection kill or cleanup kill never qualifies as natural success.
    await child.exited
    await Promise.allSettled([stdout, stderr])
  })
}, 10_000)

test('throwing submission observers preserve submitting sent real-reply order and success', async () => {
  const f = paired(),
    reply = gate()
  const events: string[] = []
  let primary: { error: unknown } | undefined
  f.right.register(
    'value',
    procedure(z.number(), z.number(), async (value) => {
      await reply.promise
      return value
    }),
  )
  const outcome = f.left
    .call('value', 9, z.number(), {
      timeoutMs: 1000,
      onDispatchStarted(event) {
        events.push(event)
        if (event === 'sent') reply.release()
        throw new Error('CONTROLLED_OBSERVER_FAILURE')
      },
      onDispatchSettled: (event) => {
        events.push(event)
      },
    })
    .then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    )
  try {
    expect(await outcome).toEqual({ value: 9 })
    expect(events).toEqual(['submitting', 'sent', 'reply'])
    expect(f.left.snapshot()).toMatchObject({ inFlight: 0, queued: 0, bufferedBytes: 0 })
  } catch (error) {
    primary = { error }
  }
  await cleanup(primary, async () => {
    reply.release()
    await outcome
    f.close()
  })
}, 5000)
