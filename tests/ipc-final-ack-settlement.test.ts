import { expect, test } from 'bun:test'
import { z } from 'zod'
import {
  IpcPeer,
  procedure,
  readRuntimeIdleProbe,
  runtimeIdleIpcIsEmpty,
  runtimeIdleProbeSchema,
  type IpcFrame,
} from '@hbar/runtime'

function fifo() {
  const parent = { unitId: 'base', generation: 1, incarnation: 'ack-parent' }
  const child = { unitId: 'fixture', generation: 1, incarnation: 'ack-child' }
  const toChild: IpcFrame[] = []
  const toParent: IpcFrame[] = []
  const left = new IpcPeer({
    owner: parent,
    remote: child,
    controlMethods: ['runtime.drain', 'runtime.idle'],
    transport: { send: (frame) => toChild.push(frame) },
  })
  const right = new IpcPeer({
    owner: child,
    remote: parent,
    controlMethods: ['runtime.drain', 'runtime.idle'],
    transport: { send: (frame) => toParent.push(frame) },
  })
  const deliver = (queue: IpcFrame[], peer: IpcPeer): IpcFrame => {
    const frame = queue.shift()
    if (!frame) throw new Error('Expected queued FIFO frame')
    peer.receive(frame)
    return frame
  }
  return {
    left,
    right,
    toChild,
    toParent,
    deliverChild: () => deliver(toChild, right),
    deliverParent: () => deliver(toParent, left),
    async settleUntil(check: () => boolean) {
      for (let turn = 0; turn < 64; turn++) {
        if (check()) return
        await Promise.resolve()
      }
      throw new Error('Expected FIFO frame was not produced within bounded microtask turns')
    },
    async flush() {
      for (let turn = 0; turn < 64; turn++) {
        while (toChild.length) deliver(toChild, right)
        while (toParent.length) deliver(toParent, left)
        await Promise.resolve()
      }
      expect(toChild).toHaveLength(0)
      expect(toParent).toHaveLength(0)
    },
    close() {
      left.close()
      right.close()
    },
  }
}

test('a final request ACK and reply delivered in one FIFO batch permit idle at physical reply settlement', async () => {
  const peers = fifo()
  peers.right.register(
    'echo',
    procedure(z.string(), z.string(), (value) => value),
  )
  let idleAtReply: boolean | undefined
  const reply = peers.left.call('echo', 'done', z.string(), {
    onDispatchSettled: (event) => {
      if (event === 'reply') idleAtReply = runtimeIdleIpcIsEmpty(peers.left.snapshot())
    },
  })
  void reply.catch(() => {})
  try {
    peers.deliverChild()
    await peers.settleUntil(() => peers.toParent.length === 2)
    expect(peers.toParent.map((frame) => frame.kind)).toEqual(['ack', 'fragment'])
    expect(runtimeIdleIpcIsEmpty(peers.left.snapshot())).toBe(false)
    // No microtask checkpoint between the real final ACK and the physical reply.
    peers.deliverParent()
    peers.deliverParent()
    expect(idleAtReply).toBe(true)
    expect(await reply).toBe('done')
    await peers.flush()
  } finally {
    peers.close()
    await Promise.allSettled([reply])
  }
})

test('a drain reply ACK followed by the next idle call in one FIFO batch leaves no retired control call in the probe', async () => {
  const peers = fifo()
  peers.right.register(
    'runtime.drain',
    procedure(z.undefined(), z.undefined(), () => undefined),
  )
  peers.right.register(
    'runtime.idle',
    procedure(z.undefined(), runtimeIdleProbeSchema, () =>
      readRuntimeIdleProbe(
        { idle: () => ({ eligible: true, requests: 0, runs: 0, resources: 0 }) },
        () => 'draining',
        () => peers.right.snapshot(),
      ),
    ),
  )
  const drained = peers.left.call('runtime.drain', undefined, z.undefined())
  void drained.catch(() => {})
  let idle: Promise<z.infer<typeof runtimeIdleProbeSchema>> | undefined
  try {
    peers.deliverChild()
    await peers.settleUntil(() => peers.toParent.length === 2)
    peers.deliverParent()
    peers.deliverParent()
    await drained
    expect(runtimeIdleIpcIsEmpty(peers.right.snapshot())).toBe(false)
    idle = peers.left.call('runtime.idle', undefined, runtimeIdleProbeSchema)
    void idle.catch(() => {})
    expect(peers.toChild.map((frame) => frame.kind)).toEqual(['ack', 'fragment'])
    // The drain reply is still genuinely unacknowledged until this first delivery.
    peers.deliverChild()
    peers.deliverChild()
    await peers.flush()
    expect((await idle).eligible).toBe(true)
  } finally {
    peers.close()
    await Promise.allSettled(idle ? [drained, idle] : [drained])
  }
})

test('withholding a real reply ACK keeps the receiver ineligible until that exact ACK arrives', async () => {
  const peers = fifo()
  peers.right.register(
    'echo',
    procedure(z.undefined(), z.undefined(), () => undefined),
  )
  const reply = peers.left.call('echo', undefined, z.undefined())
  void reply.catch(() => {})
  try {
    peers.deliverChild()
    await peers.settleUntil(() => peers.toParent.length === 2)
    peers.deliverParent()
    peers.deliverParent()
    await reply
    for (let turn = 0; turn < 8; turn++) await Promise.resolve()
    expect(peers.toChild.map((frame) => frame.kind)).toEqual(['ack'])
    expect(runtimeIdleIpcIsEmpty(peers.right.snapshot())).toBe(false)
    const finalAck = peers.deliverChild()
    // Re-delivery of the same confirmed ACK must not release the send/handler twice.
    peers.right.receive(finalAck)
    await peers.flush()
    expect(runtimeIdleIpcIsEmpty(peers.right.snapshot())).toBe(true)
  } finally {
    peers.close()
    await Promise.allSettled([reply])
  }
})

test('an incomplete multi-fragment call stays ineligible and never enters its business handler', async () => {
  const peers = fifo()
  let handlers = 0
  peers.right.register(
    'large',
    procedure(z.string(), z.undefined(), () => {
      handlers++
      return undefined
    }),
  )
  const reply = peers.left.call('large', 'x'.repeat(40_000), z.undefined())
  const outcome = reply.catch((error: unknown) => error)
  try {
    const first = peers.deliverChild()
    expect(first.kind).toBe('fragment')
    if (first.kind !== 'fragment') throw new Error('Expected first call fragment')
    expect(first.total).toBeGreaterThan(1)
    expect(runtimeIdleIpcIsEmpty(peers.right.snapshot())).toBe(false)
    expect(handlers).toBe(0)
    peers.deliverParent()
    await peers.settleUntil(() => peers.toChild.length === 1)
    expect(runtimeIdleIpcIsEmpty(peers.right.snapshot())).toBe(false)
    expect(handlers).toBe(0)
  } finally {
    peers.close()
    await outcome
  }
})

test('a real business callback remains busy after every currently available transport ACK settles', async () => {
  const peers = fifo()
  let release: () => void = () => {
    throw new Error('Uninitialized callback gate')
  }
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  peers.left.register(
    'business.callback',
    procedure(z.undefined(), z.undefined(), () => gate),
  )
  const callback = peers.right.call('business.callback', undefined, z.undefined())
  void callback.catch(() => {})
  try {
    await peers.flush()
    expect(runtimeIdleIpcIsEmpty(peers.left.snapshot())).toBe(false)
    expect(runtimeIdleIpcIsEmpty(peers.right.snapshot())).toBe(false)
    release()
    await peers.flush()
    await callback
    expect(runtimeIdleIpcIsEmpty(peers.left.snapshot())).toBe(true)
    expect(runtimeIdleIpcIsEmpty(peers.right.snapshot())).toBe(true)
  } finally {
    release()
    peers.close()
    await Promise.allSettled([callback])
  }
})

test('a transport send failure cannot produce an eligible idle boundary', async () => {
  const peer = new IpcPeer({
    owner: { unitId: 'base', generation: 1, incarnation: 'failed-parent' },
    remote: { unitId: 'fixture', generation: 1, incarnation: 'failed-child' },
    transport: {
      send: () => {
        throw new Error('Injected transport failure')
      },
    },
  })
  try {
    await expect(peer.call('echo', undefined, z.undefined())).rejects.toMatchObject({ code: 'IPC_DISCONNECTED' })
    expect(runtimeIdleIpcIsEmpty(peer.snapshot())).toBe(false)
  } finally {
    peer.close()
  }
})
