import { expect, test } from 'bun:test'
import { z } from 'zod'
import { IpcPeer, procedure, type IpcPeerOptions } from '@hbar/runtime'
import { HbarError } from '@hbar/contracts'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import { fileURLToPath } from 'node:url'

const owner: RuntimeOwner = { unitId: 'base', generation: 1, incarnation: 'parent-incarnation' }
const remote: RuntimeOwner = { unitId: 'fixture', generation: 1, incarnation: 'child-incarnation' }
function paired(options: Partial<Omit<IpcPeerOptions, 'owner' | 'remote' | 'transport'>> = {}) {
  let right: IpcPeer | undefined
  const left = new IpcPeer({
    owner,
    remote,
    ...options,
    transport: {
      send: (frame) => {
        right?.receive(frame)
      },
    },
  })
  right = new IpcPeer({ owner: remote, remote: owner, ...options, transport: { send: (frame) => left.receive(frame) } })
  return {
    left,
    right,
    close() {
      left.close()
      right?.close()
    },
  }
}
function deferred() {
  let release: () => void = () => {
    throw new Error('Deferred was not initialized')
  }
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

test('default duplex IPC remains within 64 physical calls and 256 queued calls per unit', async () => {
  const peers = paired(),
    gate = deferred()
  peers.left.register(
    'duplex',
    procedure(z.number(), z.number(), async (value) => {
      await gate.promise
      return value
    }),
  )
  peers.right.register(
    'duplex',
    procedure(z.number(), z.number(), async (value) => {
      await gate.promise
      return value
    }),
  )
  const pending = Promise.allSettled([
    ...Array.from({ length: 160 }, (_, index) => peers.left.call('duplex', index, z.number())),
    ...Array.from({ length: 160 }, (_, index) => peers.right.call('duplex', index, z.number())),
  ])
  try {
    await until(() => peers.left.snapshot().inFlight === 32 && peers.left.snapshot().incoming === 32)
    expect(peers.left.snapshot().inFlight + peers.left.snapshot().incoming).toBe(64)
    expect(peers.left.snapshot().queued + peers.right.snapshot().queued).toBe(256)
    expect(await peers.left.call('duplex', 161, z.number()).catch((error: unknown) => error)).toMatchObject({
      code: 'IPC_BUSY',
    })
    gate.release()
    expect((await pending).filter((result) => result.status === 'fulfilled')).toHaveLength(320)
  } finally {
    gate.release()
    await pending
    peers.close()
  }
})
async function until(check: () => boolean) {
  const deadline = Date.now() + 3_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('IPC did not settle')
    await Bun.sleep(5)
  }
}

test('IPC validates procedures, preserves optional arguments, and rejects functions and cycles before admission', async () => {
  const peers = paired()
  peers.right.register(
    'echo',
    procedure(z.array(z.string().optional()), z.array(z.string().optional()), (input) => input),
  )
  try {
    expect(await peers.left.call('echo', ['a', undefined, 'c'], z.array(z.string().optional()))).toEqual([
      'a',
      undefined,
      'c',
    ])
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    await expect(peers.left.call('echo', cycle, z.unknown())).rejects.toMatchObject({ code: 'IPC_SERIALIZATION' })
    await expect(peers.left.call('echo', () => {}, z.unknown())).rejects.toMatchObject({ code: 'IPC_SERIALIZATION' })
    await expect(peers.left.call('echo', [1], z.unknown())).rejects.toMatchObject({ code: 'IPC_PROCEDURE_FAILED' })
    expect(peers.left.snapshot().inFlight).toBe(0)
    expect(await peers.left.call('echo', [], z.array(z.string()))).toEqual([])
  } finally {
    peers.close()
  }
})

test('IPC chunks Unicode payloads and keeps observer failures local', async () => {
  const peers = paired()
  const text = '边界😀'.repeat(20_000)
  peers.right.register(
    'echo',
    procedure(z.string(), z.string(), (input) => input),
  )
  let received = 0
  peers.left.onEvent('progress', z.number(), () => {
    throw new Error('observer')
  })
  peers.left.onEvent('progress', z.number(), (value) => {
    received += value
  })
  try {
    expect(await peers.left.call('echo', text, z.string())).toBe(text)
    await peers.right.notify('progress', 1)
    expect(received).toBe(1)
    await until(() => peers.left.snapshot().bufferedBytes === 0 && peers.right.snapshot().bufferedBytes === 0)
  } finally {
    peers.close()
  }
})

test('IPC has independent hard bounds on physical execution, queued requests and bytes', async () => {
  const peers = paired({ inFlight: 1, queued: 1, bufferedBytes: 2_000, messageBytes: 1_000 })
  const held = deferred()
  let executions = 0
  peers.right.register(
    'hold',
    procedure(z.string(), z.string(), async (input) => {
      executions++
      await held.promise
      return input
    }),
  )
  try {
    const first = peers.left.call('hold', 'first', z.string())
    const second = peers.left.call('hold', 'second', z.string())
    await expect(peers.left.call('hold', 'third', z.string())).rejects.toMatchObject({ code: 'IPC_BUSY' })
    await expect(peers.left.call('hold', 'x'.repeat(2_000), z.string())).rejects.toMatchObject({
      code: 'IPC_PAYLOAD_LIMIT',
    })
    await until(() => executions === 1)
    expect(peers.left.snapshot()).toMatchObject({ inFlight: 1, queued: 1 })
    held.release()
    expect(await Promise.all([first, second])).toEqual(['first', 'second'])
    expect(executions).toBe(2)
    expect(peers.left.snapshot()).toMatchObject({ inFlight: 0, queued: 0 })
  } finally {
    held.release()
    peers.close()
  }
})

test('cancellation does not release a noncooperating physical slot or publish its late result', async () => {
  const peers = paired({ inFlight: 1, queued: 2 })
  const held = deferred()
  let executed = 0
  peers.right.register(
    'hold',
    procedure(z.string(), z.string(), async (value) => {
      executed++
      await held.promise
      return value
    }),
  )
  const controller = new AbortController()
  try {
    const first = peers.left.call('hold', 'cancelled', z.string(), { signal: controller.signal })
    const second = peers.left.call('hold', 'next', z.string())
    await until(() => executed === 1)
    controller.abort()
    await expect(first).rejects.toMatchObject({ code: 'IPC_CANCELLED' })
    expect(peers.left.snapshot()).toMatchObject({ inFlight: 1, queued: 1 })
    expect(executed).toBe(1)
    held.release()
    expect(await second).toBe('next')
    await until(() => peers.left.snapshot().inFlight === 0)
  } finally {
    held.release()
    peers.close()
  }
})

test('tracked cancellation retains the original reply and validates it once while physical capacity stays occupied', async () => {
  const peers = paired({ inFlight: 1, queued: 1 })
  const held = deferred()
  let started = 0,
    validations = 0,
    physicallyDone = false
  peers.right.register(
    'tracked',
    procedure(z.string(), z.string(), async (value) => {
      started++
      await held.promise
      return value
    }),
  )
  const controller = new AbortController()
  const output = z.string().transform((value) => {
    validations++
    return value + ':validated'
  })
  try {
    const first = peers.left.callTracked('tracked', 'original', output, { signal: controller.signal })
    void first.settled.then(() => {
      physicallyDone = true
    })
    const next = peers.left.call('tracked', 'next', z.string())
    await until(() => started === 1)
    controller.abort()
    await expect(first.result).rejects.toMatchObject({ code: 'IPC_CANCELLED' })
    expect(physicallyDone).toBe(false)
    expect(peers.left.snapshot()).toMatchObject({ inFlight: 1, queued: 1 })
    held.release()
    expect(await first.settled).toBe('original:validated')
    expect(await next).toBe('next')
    expect(validations).toBe(1)
    expect(started).toBe(2)
  } finally {
    held.release()
    peers.close()
  }
})

test('tracked deadlines keep late owner errors while queued cancellation and transport loss settle explicitly', async () => {
  const peers = paired({ inFlight: 1, queued: 1 })
  const held = deferred()
  let executions = 0
  peers.right.register(
    'tracked',
    procedure(z.undefined(), z.string(), async () => {
      executions++
      await held.promise
      throw new HbarError('ACTUAL_WRITE_FAILED', 'The original owner finished with an error')
    }),
  )
  try {
    const first = peers.left.callTracked('tracked', undefined, z.string(), { timeoutMs: 20 })
    const controller = new AbortController()
    const queued = peers.left.callTracked('tracked', undefined, z.string(), { signal: controller.signal })
    controller.abort()
    await expect(queued.result).rejects.toMatchObject({ code: 'IPC_CANCELLED' })
    await expect(queued.settled).rejects.toMatchObject({ code: 'IPC_CANCELLED' })
    await expect(first.result).rejects.toMatchObject({ code: 'IPC_TIMEOUT' })
    expect(executions).toBe(1)
    held.release()
    await expect(first.settled).rejects.toMatchObject({ code: 'ACTUAL_WRITE_FAILED' })
    const lost = peers.left.callTracked('tracked', undefined, z.string())
    peers.left.close()
    await expect(lost.result).rejects.toMatchObject({ code: 'IPC_DISCONNECTED' })
    await expect(lost.settled).rejects.toMatchObject({ code: 'IPC_DISCONNECTED' })
    const invalid = peers.left.callTracked('tracked', undefined, z.string())
    await expect(invalid.settled).rejects.toMatchObject({ code: 'IPC_DISCONNECTED' })
  } finally {
    held.release()
    peers.close()
  }
})

test('tracked calls validate late output and refuse invalid input without a fabricated successful settlement', async () => {
  const peers = paired()
  try {
    peers.right.register(
      'invalid',
      procedure(z.undefined(), z.string(), () => 'not a number'),
    )
    const invalid = peers.left.callTracked('invalid', undefined, z.number())
    await expect(invalid.result).rejects.toBeInstanceOf(z.ZodError)
    await expect(invalid.settled).rejects.toBeInstanceOf(z.ZodError)
    const refused = peers.left.callTracked('invalid', () => {}, z.number())
    await expect(refused.result).rejects.toMatchObject({ code: 'IPC_SERIALIZATION' })
    await expect(refused.settled).rejects.toMatchObject({ code: 'IPC_SERIALIZATION' })
    expect(peers.left.snapshot()).toMatchObject({ inFlight: 0, queued: 0 })
  } finally {
    peers.close()
  }
})

test('queued IPC input is captured before the caller can change its target or exceed its byte admission', async () => {
  const peers = paired({ inFlight: 1, queued: 1, bufferedBytes: 2_000, messageBytes: 1_000 })
  const held = deferred()
  const inputSchema = z.strictObject({ target: z.string() })
  peers.right.register(
    'hold',
    procedure(z.undefined(), z.undefined(), async () => held.promise),
  )
  peers.right.register(
    'target',
    procedure(inputSchema, z.string(), (input) => input.target),
  )
  try {
    const first = peers.left.call('hold', undefined, z.undefined())
    const input = { target: 'original' }
    const second = peers.left.call('target', input, z.string())
    input.target = 'changed'.repeat(10_000)
    held.release()
    await first
    expect(await second).toBe('original')
    expect(peers.left.snapshot().queuedBytes).toBe(0)
  } finally {
    held.release()
    peers.close()
  }
})

test('a queued cancellation prevents execution, and an executing timeout retains its owner until acknowledgement', async () => {
  let timeouts = 0
  const peers = paired({
    inFlight: 1,
    queued: 1,
    onTimeout: () => {
      timeouts++
    },
  })
  const held = deferred()
  let executions = 0
  peers.right.register(
    'hold',
    procedure(z.undefined(), z.undefined(), async () => {
      executions++
      await held.promise
    }),
  )
  const controller = new AbortController()
  try {
    const first = peers.left.call('hold', undefined, z.undefined(), { timeoutMs: 50 })
    const next = peers.left.call('hold', undefined, z.undefined(), { signal: controller.signal })
    controller.abort()
    await expect(next).rejects.toMatchObject({ code: 'IPC_CANCELLED' })
    await expect(first).rejects.toMatchObject({ code: 'IPC_TIMEOUT' })
    expect(peers.left.snapshot()).toMatchObject({ inFlight: 1, queued: 0 })
    expect(timeouts).toBe(1)
    expect(executions).toBe(1)
    held.release()
    await until(() => peers.left.snapshot().inFlight === 0)
  } finally {
    held.release()
    peers.close()
  }
})

test('a broken transfer or stale incarnation fails only that peer and settles every caller', async () => {
  const peers = paired()
  const held = deferred()
  peers.right.register(
    'hold',
    procedure(z.undefined(), z.undefined(), async () => held.promise),
  )
  try {
    const request = peers.left.call('hold', undefined, z.undefined())
    peers.left.receive({
      kind: 'ack',
      version: 1,
      from: 'stale-incarnation',
      to: owner.incarnation,
      id: 'fake',
      index: 0,
    })
    await expect(request).rejects.toMatchObject({ code: 'IPC_PROTOCOL' })
    expect(peers.left.snapshot().failed).toBe(true)
    await expect(peers.left.call('hold', undefined, z.undefined())).rejects.toBeInstanceOf(HbarError)
  } finally {
    held.release()
    peers.close()
  }
})

test('a procedure response that cannot be serialized fails its request and leaves other procedures usable', async () => {
  const peers = paired()
  peers.right.register(
    'invalid',
    procedure(z.undefined(), z.unknown(), () => ({ callback: () => {} })),
  )
  peers.right.register(
    'valid',
    procedure(z.undefined(), z.string(), () => 'healthy'),
  )
  try {
    await expect(peers.left.call('invalid', undefined, z.unknown())).rejects.toMatchObject({
      code: 'IPC_SERIALIZATION',
    })
    expect(await peers.left.call('valid', undefined, z.string())).toBe('healthy')
    expect(peers.left.snapshot().failed).toBe(false)
  } finally {
    peers.close()
  }
})

test('real Bun IPC carries a fragmented round trip and settles pending calls on child exit', async () => {
  let peer: IpcPeer | undefined
  const child = Bun.spawn(
    [process.execPath, fileURLToPath(new URL('./fixtures/runtime-ipc-owner.ts', import.meta.url))],
    {
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
      windowsHide: true,
      serialization: 'json',
      env: { ...process.env, HBAR_RUNTIME_SELF: JSON.stringify(remote), HBAR_RUNTIME_PARENT: JSON.stringify(owner) },
      ipc(message: unknown) {
        peer?.receive(message)
      },
    },
  )
  peer = new IpcPeer({ owner, remote, transport: { send: (frame) => child.send(frame) } })
  const active = peer
  void child.exited.then(() => active.close()).catch(() => active.close())
  try {
    const text = 'actual IPC 😀'.repeat(10_000)
    expect(await active.call('echo', text, z.string())).toBe(text)
    const crashed = active.callTracked('crash', undefined, z.undefined())
    await expect(crashed.result).rejects.toMatchObject({ code: 'IPC_DISCONNECTED' })
    await expect(crashed.settled).rejects.toMatchObject({ code: 'IPC_DISCONNECTED' })
    expect(await child.exited).toBe(23)
    expect(active.snapshot()).toMatchObject({ inFlight: 0, queued: 0, failed: true })
  } finally {
    active.close()
    if (child.exitCode === null) {
      child.kill('SIGKILL')
      await child.exited
    }
  }
})
