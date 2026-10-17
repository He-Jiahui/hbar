import { expect, test } from 'bun:test'
import { IpcPeer, RuntimeValuePort, RuntimeNotificationDelivery } from '@hbar/runtime'
function gate() {
  let release: () => void = () => {
    throw new Error('Uninitialized fixture')
  }
  const promise = new Promise<void>((done) => {
    release = done
  })
  return { promise, release }
}
async function until(check: () => boolean) {
  const end = Date.now() + 2000
  while (!check()) {
    if (Date.now() >= end) throw new Error('Idle fixture deadline')
    await Bun.sleep(1)
  }
}
function peers() {
  const owner = { unitId: 'kernel', generation: 1, incarnation: crypto.randomUUID() },
    remote = { unitId: 'base', generation: 1, incarnation: crypto.randomUUID() }
  let right: IpcPeer | undefined
  const left = new IpcPeer({
    owner,
    remote,
    transport: {
      send(frame) {
        if (!right) throw new Error('Missing peer')
        right.receive(frame)
      },
    },
  })
  right = new IpcPeer({ owner: remote, remote: owner, transport: { send: (frame) => left.receive(frame) } })
  return {
    left,
    right,
    close() {
      left.close()
      right?.close()
    },
  }
}
test('real ValuePort retains physical outgoing and incoming after logical cancel until actual reply', async () => {
  const pair = peers(),
    left = new RuntimeValuePort(pair.left, { prefix: 'fixture' }),
    right = new RuntimeValuePort(pair.right, { prefix: 'fixture' }),
    held = gate(),
    controller = new AbortController()
  let entered = false
  right.register('hold', async () => {
    entered = true
    await held.promise
  })
  const outcome = left.call('hold', [], { signal: controller.signal }).then(
    () => ({ ok: true }),
    () => ({ ok: false }),
  )
  try {
    await until(() => entered)
    controller.abort()
    expect((await outcome).ok).toBe(false)
    expect(left.idleCounts().outgoing).toBe(1)
    expect(right.idleCounts().incoming).toBe(1)
    left.dispose()
    expect(left.idleCounts().outgoing).toBe(1)
    held.release()
    await until(() => left.idleCounts().outgoing === 0 && right.idleCounts().incoming === 0)
  } finally {
    held.release()
    left.dispose()
    right.dispose()
    pair.close()
  }
})
for (const kind of ['closed', 'encode'] as const)
  test(`ValuePort ${kind} failure settles not-dispatched once and isolates observer errors`, async () => {
    const pair = peers(),
      port = new RuntimeValuePort(pair.left, { prefix: 'fixture' })
    let notifications = 0
    const events: string[] = []
    if (kind === 'closed') port.dispose()
    const canary = {
      get secret(): string {
        throw new Error('ENCODING_CANARY')
      },
    }
    try {
      let failed = false
      try {
        await port.call('unused', kind === 'encode' ? [canary] : [], {
          onDispatchSettled(event) {
            notifications++
            events.push(event)
            throw new Error('OBSERVER_CANARY')
          },
        })
      } catch {
        failed = true
      }
      expect(failed).toBe(true)
      expect(notifications).toBe(1)
      expect(events).toEqual(['not-dispatched'])
      expect(port.idleCounts().outgoing).toBe(0)
      expect(pair.left.snapshot().inFlight).toBe(0)
    } finally {
      port.dispose()
      pair.close()
    }
  })
test('notification idle counts retain actual sending promise until transfer completes', async () => {
  const held = gate()
  const delivery = new RuntimeNotificationDelivery({
    send: () => held.promise,
    failed: () => {
      throw new Error('Unexpected delivery failure')
    },
  })
  try {
    delivery.publish({
      method: 'session.event',
      params: {
        eventId: 'idle-event',
        sessionId: 'session',
        runId: null,
        stepId: null,
        seq: 1,
        type: 'fixture',
        data: {},
        time: 1,
        version: 1,
      },
    })
    await until(() => delivery.idleCounts().sending === 1)
    expect(delivery.idleCounts().queued).toBe(1)
    held.release()
    await delivery.settled()
    expect(delivery.idleCounts()).toMatchObject({ queued: 0, sending: 0, bytes: 0, failed: false, closed: false })
  } finally {
    held.release()
    await delivery.settled()
    delivery.dispose()
  }
})

test('logical cancellation immediately revokes callback registrations while physical request remains until real reply', async () => {
  const pair = peers(),
    left = new RuntimeValuePort(pair.left, { prefix: 'revocation' }),
    right = new RuntimeValuePort(pair.right, { prefix: 'revocation' }),
    held = gate(),
    controller = new AbortController()
  let entered = false,
    commits = 0
  let late: (() => unknown) | undefined
  right.register('hold', async ([callback]) => {
    if (typeof callback !== 'function') throw new Error('Missing callback')
    late = () => Reflect.apply(callback, undefined, [])
    entered = true
    await held.promise
  })
  const outcome = left
    .call(
      'hold',
      [
        () => {
          commits++
        },
      ],
      { signal: controller.signal },
    )
    .then(
      () => true,
      () => false,
    )
  try {
    await until(() => entered)
    expect(left.snapshot().callbacks).toBe(1)
    controller.abort()
    expect(await outcome).toBe(false)
    expect(left.snapshot().callbacks).toBe(0)
    expect(left.idleCounts().outgoing).toBe(1)
    expect(right.idleCounts().incoming).toBe(1)
    if (!late) throw new Error('Callback not captured')
    await expect(Promise.resolve().then(late)).rejects.toBeInstanceOf(Error)
    expect(commits).toBe(0)
    held.release()
    await until(() => left.idleCounts().outgoing === 0 && right.idleCounts().incoming === 0)
  } finally {
    held.release()
    left.dispose()
    right.dispose()
    pair.close()
  }
})

test('nested callback cancellation revokes nested registrations without erasing an entered callback physical handler', async () => {
  const pair = peers(),
    left = new RuntimeValuePort(pair.left, { prefix: 'nestedrevoke' }),
    right = new RuntimeValuePort(pair.right, { prefix: 'nestedrevoke' }),
    held = gate(),
    controller = new AbortController()
  let nestedEntered = false
  right.register('outer', async ([callback]) => {
    if (typeof callback !== 'function') throw new Error('Missing outer callback')
    return await Reflect.apply(callback, undefined, [() => 'unused'])
  })
  const outcome = left
    .call(
      'outer',
      [
        async (nested: unknown) => {
          if (typeof nested !== 'function') throw new Error('Missing nested callback')
          nestedEntered = true
          await held.promise
        },
      ],
      { signal: controller.signal },
    )
    .then(
      () => true,
      () => false,
    )
  try {
    await until(() => nestedEntered)
    expect(left.idleCounts().incoming).toBe(1)
    expect(right.snapshot().callbacks).toBe(1)
    controller.abort()
    expect(await outcome).toBe(false)
    await until(() => right.snapshot().callbacks === 0)
    expect(left.snapshot().callbacks).toBe(0)
    expect(left.idleCounts().incoming).toBe(1)
    expect(right.idleCounts().outgoing).toBe(1)
    held.release()
    await until(() => left.idleCounts().incoming === 0 && right.idleCounts().outgoing === 0)
  } finally {
    held.release()
    left.dispose()
    right.dispose()
    pair.close()
  }
})
