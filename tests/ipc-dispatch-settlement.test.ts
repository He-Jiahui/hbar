import { expect, test } from 'bun:test'
import { z } from 'zod'
import { IpcPeer, procedure } from '@hbar/runtime'

function paired() {
  const owner = { unitId: 'base', generation: 1, incarnation: 'settlement-parent' }
  const remote = { unitId: 'fixture', generation: 1, incarnation: 'settlement-child' }
  let right: IpcPeer | undefined
  const left = new IpcPeer({
    owner,
    remote,
    inFlight: 1,
    queued: 1,
    transport: { send: (frame) => right?.receive(frame) },
  })
  right = new IpcPeer({
    owner: remote,
    remote: owner,
    inFlight: 1,
    queued: 1,
    transport: { send: (frame) => left.receive(frame) },
  })
  return {
    left,
    right,
    close() {
      left.close()
      right?.close()
    },
  }
}
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
    if (Date.now() >= deadline) throw new Error('Settlement not observed')
    await Bun.sleep(1)
  }
}

for (const kind of ['abort', 'timeout'] as const)
  test(`dispatched ${kind} retains physical slot and observes only eventual reply`, async () => {
    const peers = paired(),
      blocked = gate(),
      entered = gate(),
      abort = new AbortController()
    const events: string[] = [],
      neighbor: string[] = []
    peers.right.register(
      'blocked',
      procedure(z.number(), z.number(), async (value) => {
        entered.release()
        await blocked.promise
        return value
      }),
    )
    peers.right.register(
      'neighbor',
      procedure(z.number(), z.number(), (value) => value),
    )
    const call = peers.left.call('blocked', 1, z.number(), {
      signal: abort.signal,
      timeoutMs: kind === 'timeout' ? 50 : 2000,
      onDispatchSettled: (event) => events.push(event),
    })
    const result = call.catch((error: unknown) => error)
    try {
      await entered.promise
      if (kind === 'abort') abort.abort()
      expect(await result).toMatchObject({ code: kind === 'abort' ? 'IPC_CANCELLED' : 'IPC_TIMEOUT' })
      expect(events).toEqual([])
      expect(peers.left.snapshot().inFlight).toBe(1)
      const next = peers.left.call('neighbor', 2, z.number(), { onDispatchSettled: (event) => neighbor.push(event) })
      expect(peers.left.snapshot().queued).toBe(1)
      expect(neighbor).toEqual([])
      blocked.release()
      expect(await next).toBe(2)
      await until(() => events.length === 1)
      expect(events).toEqual(['reply'])
      expect(neighbor).toEqual(['reply'])
      expect(peers.left.snapshot().inFlight).toBe(0)
    } finally {
      blocked.release()
      await result
      peers.close()
    }
  })

for (const kind of ['abort', 'timeout', 'close'] as const)
  test(`queued ${kind} is not dispatched; closing started work stays unknown`, async () => {
    const peers = paired(),
      blocked = gate(),
      entered = gate(),
      abort = new AbortController()
    const started: string[] = [],
      queued: string[] = []
    peers.right.register(
      'blocked',
      procedure(z.number(), z.number(), async (value) => {
        entered.release()
        await blocked.promise
        return value
      }),
    )
    const first = peers.left
      .call('blocked', 1, z.number(), { onDispatchSettled: (event) => started.push(event) })
      .catch((error: unknown) => error)
    try {
      await entered.promise
      const second = peers.left
        .call('blocked', 2, z.number(), {
          signal: abort.signal,
          timeoutMs: kind === 'timeout' ? 5 : 2000,
          onDispatchSettled: (event) => queued.push(event),
        })
        .catch((error: unknown) => error)
      if (kind === 'abort') abort.abort()
      if (kind === 'close') peers.left.close()
      await second
      expect(queued).toEqual(['not-dispatched'])
      expect(started).toEqual([])
      peers.left.close()
      blocked.release()
      await first
      expect(started).toEqual([])
      expect(queued).toEqual(['not-dispatched'])
    } finally {
      blocked.release()
      peers.close()
      await first
    }
  })

test('pre-dispatch failures and capacity rejection notify once; output parse failure still observes reply', async () => {
  const peers = paired(),
    blocked = gate(),
    entered = gate()
  peers.right.register(
    'blocked',
    procedure(z.number(), z.number(), async (value) => {
      entered.release()
      await blocked.promise
      return value
    }),
  )
  const events: string[] = []
  const observe = (event: 'reply' | 'not-dispatched') => {
    events.push(event)
  }
  const abort = new AbortController()
  abort.abort()
  try {
    await expect(
      peers.left.call('ok', 1, z.number(), { signal: abort.signal, onDispatchSettled: observe }),
    ).rejects.toMatchObject({ code: 'IPC_CANCELLED' })
    await expect(peers.left.call('invalid method', 1, z.number(), { onDispatchSettled: observe })).rejects.toBeDefined()
    await expect(peers.left.call('ok', () => 1, z.number(), { onDispatchSettled: observe })).rejects.toMatchObject({
      code: 'IPC_SERIALIZATION',
    })
    await expect(
      peers.left.call('ok', 1, z.number(), { timeoutMs: 0, onDispatchSettled: observe }),
    ).rejects.toBeDefined()
    expect(events).toEqual(Array.from({ length: 4 }, () => 'not-dispatched'))
    const first = peers.left
      .call('blocked', 1, z.string(), { onDispatchSettled: observe })
      .catch((error: unknown) => error)
    await entered.promise
    const second = peers.left.call('blocked', 2, z.number()).catch((error: unknown) => error)
    await expect(peers.left.call('blocked', 3, z.number(), { onDispatchSettled: observe })).rejects.toMatchObject({
      code: 'IPC_BUSY',
    })
    blocked.release()
    expect(await first).toBeInstanceOf(z.ZodError)
    await second
    expect(events).toEqual([...Array.from({ length: 5 }, () => 'not-dispatched'), 'reply'])
    peers.left.close()
    await expect(peers.left.call('blocked', 1, z.number(), { onDispatchSettled: observe })).rejects.toBeDefined()
    expect(events.at(-1)).toBe('not-dispatched')
  } finally {
    blocked.release()
    peers.close()
  }
})

test('observer exceptions do not affect RPC outcome', async () => {
  const peers = paired()
  peers.right.register(
    'ok',
    procedure(z.number(), z.number(), (value) => value),
  )
  let notifications = 0
  try {
    expect(
      await peers.left.call('ok', 7, z.number(), {
        onDispatchSettled() {
          notifications++
          throw new Error('PRIVATE_CANARY')
        },
      }),
    ).toBe(7)
    expect(notifications).toBe(1)
    expect(peers.left.snapshot().inFlight).toBe(0)
  } finally {
    peers.close()
  }
})
